using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Server
{
    /// <summary>
    /// The authoritative game server: player sessions, rooms and matchmaking. All game state is changed under one
    /// lock (the work per message is tiny); sending only queues frames, so the lock is never held during network I/O.
    /// </summary>
    public sealed class GameHub : IRoomOutput
    {
        /// <summary>A session without a connection is kept a little longer than the in-match reconnect window.</summary>
        public const double SessionGraceSeconds = MatchRules.ReconnectGraceSeconds + 10.0;
        public const double HelloTimeoutSeconds = 10.0;
        public const double IdleTimeoutSeconds = 45.0;
        public const int MaxRooms = 5000;
        /// <summary>Rounds of a public quick match (10 questions: short enough for a browser session).</summary>
        public const int PublicRounds = 5;

        readonly object gate = new object();
        readonly Stopwatch clock = Stopwatch.StartNew();
        readonly QuestionBank bank;
        readonly Action<string> log;
        readonly XorShiftRandom rng;

        readonly Dictionary<string, PlayerSession> sessions = new Dictionary<string, PlayerSession>();
        readonly Dictionary<string, RoomController> rooms = new Dictionary<string, RoomController>();
        readonly Matchmaker matchmaker = new Matchmaker();

        public GameHub(QuestionBank bank, Action<string> log)
        {
            this.bank = bank;
            this.log = log ?? (_ => { });
            rng = new XorShiftRandom(BitConverter.ToUInt64(RandomNumberGenerator.GetBytes(8), 0));
        }

        public double Now => clock.Elapsed.TotalSeconds;

        public (int sessions, int rooms, int queued) Stats()
        {
            lock (gate) return (sessions.Count, rooms.Count, matchmaker.Count);
        }

        // ───────────────────────── Connections ─────────────────────────

        public async Task HandleConnectionAsync(ClientConnection connection, CancellationToken shutdown)
        {
            double openedAt = Now;
            // Close sockets that never introduce themselves.
            _ = Task.Delay(TimeSpan.FromSeconds(HelloTimeoutSeconds), shutdown).ContinueWith(_ =>
            {
                if (connection.Session == null) connection.Close();
            }, TaskScheduler.Default);

            await connection.RunAsync(OnMessageAsync, shutdown);
            OnDisconnected(connection);
        }

        Task OnMessageAsync(ClientConnection connection, string text)
        {
            if (!connection.AllowMessage())
            {
                SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.RateLimited, message = "Too many messages." });
                return Task.CompletedTask;
            }
            if (!Json.TryUnwrap(text, out var envelope))
            {
                SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.BadRequest, message = "Malformed message." });
                return Task.CompletedTask;
            }

            lock (gate)
            {
                try
                {
                    Dispatch(connection, envelope);
                }
                catch (Exception e)
                {
                    log("Error handling '" + envelope.t + "': " + e);
                    SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.BadRequest, message = "Request failed." });
                }
            }
            return Task.CompletedTask;
        }

        void OnDisconnected(ClientConnection connection)
        {
            lock (gate)
            {
                var session = connection.Session;
                if (session == null || session.Connection != connection) return;
                session.Connection = null;
                double now = Now;
                session.DisconnectedAt = now;
                matchmaker.Remove(session);
                var room = RoomOf(session);
                if (room != null)
                {
                    room.SetConnected(session.PlayerId, false, now);
                    room.Flush(now);
                }
            }
        }

        // ───────────────────────── Dispatch ─────────────────────────

        void Dispatch(ClientConnection connection, Envelope envelope)
        {
            double now = Now;
            if (envelope.t == Msg.Hello)
            {
                HandleHello(connection, Json.Payload<HelloMsg>(envelope), now);
                return;
            }

            var session = connection.Session;
            if (session == null)
            {
                SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.BadRequest, message = "Say hello first." });
                return;
            }
            session.LastMessageAt = now;

            var room = RoomOf(session);
            string error = null;
            switch (envelope.t)
            {
                case Msg.Ping:
                    Send(session, Msg.Pong, new EmptyMsg());
                    return;

                case Msg.CreateRoom:
                    {
                        var msg = Json.Payload<CreateRoomMsg>(envelope);
                        if (msg == null) { error = ErrorCodes.BadRequest; break; }
                        LeaveCurrent(session, now);
                        matchmaker.Remove(session);
                        if (rooms.Count >= MaxRooms) { error = ErrorCodes.ServerFull; break; }
                        var created = CreateRoom(false, msg.settings);
                        created.TryJoin(session.PlayerId, session.Name, session.Avatar, now);
                        session.RoomCode = created.Code;
                        created.Flush(now);
                        log("Room " + created.Code + " created by " + session.PlayerId);
                        return;
                    }

                case Msg.JoinRoom:
                    {
                        var msg = Json.Payload<JoinRoomMsg>(envelope);
                        string code = RoomCode.Normalize(msg?.code);
                        if (code == null || !rooms.TryGetValue(code, out var target) || target.IsPublic) { error = ErrorCodes.RoomNotFound; break; }
                        if (target.Contains(session.PlayerId))
                        {
                            target.SendFullStateTo(session.PlayerId, now);
                            return;
                        }
                        matchmaker.Remove(session);
                        error = target.TryJoin(session.PlayerId, session.Name, session.Avatar, now);
                        if (error != null) break;
                        LeaveCurrent(session, now);
                        session.RoomCode = target.Code;
                        target.Flush(now);
                        return;
                    }

                case Msg.LeaveRoom:
                    LeaveCurrent(session, now);
                    return;

                case Msg.Queue:
                    {
                        var msg = Json.Payload<QueueMsg>(envelope);
                        var mode = msg != null && msg.mode == (int)QueueMode.TwoVsTwo ? QueueMode.TwoVsTwo : QueueMode.OneVsOne;
                        LeaveCurrent(session, now);
                        matchmaker.Enqueue(session, mode, now);
                        return;
                    }

                case Msg.CancelQueue:
                    matchmaker.Remove(session);
                    Send(session, Msg.QueueStatus, new QueueStatusMsg { searching = false });
                    return;

                case Msg.QueueFillBots:
                    if (!matchmaker.FillWithBots(session, now, CreatePublicMatch)) error = ErrorCodes.NotAllowed;
                    break;
            }

            if (error == null && room == null && IsRoomCommand(envelope.t)) error = ErrorCodes.NotInRoom;

            if (error == null && room != null)
            {
                string id = session.PlayerId;
                switch (envelope.t)
                {
                    case Msg.SetReady: error = room.SetReady(id, Json.Payload<ReadyMsg>(envelope)?.ready ?? false); break;
                    case Msg.SetTeam: error = room.SetTeam(id, Json.Payload<TeamMsg>(envelope)?.team ?? -1); break;
                    case Msg.UpdateSettings: error = room.UpdateSettings(id, Json.Payload<SettingsMsg>(envelope)?.settings); break;
                    case Msg.AddBot: error = room.HostAddBot(id); break;
                    case Msg.RemoveBot: error = room.HostRemoveBot(id, Json.Payload<PlayerRefMsg>(envelope)?.playerId); break;
                    case Msg.MovePlayer: error = room.MovePlayer(id, Json.Payload<PlayerRefMsg>(envelope)?.playerId); break;
                    case Msg.StartMatch: error = room.StartMatch(id, now); break;
                    case Msg.Answer: error = room.Answer(id, Json.Payload<IndexMsg>(envelope)?.index ?? -1, now); break;
                    case Msg.UseJoker: error = room.UseJoker(id, Json.Payload<JokerMsg>(envelope)?.joker ?? -1, now); break;
                    case Msg.TeamVote: error = room.TeamVote(id, Json.Payload<IndexMsg>(envelope)?.index ?? -1, now); break;
                    case Msg.Steal: error = room.Steal(id, Json.Payload<IndexMsg>(envelope)?.index ?? -1, now); break;
                    case Msg.SkipSteal: error = room.SkipSteal(id, now); break;
                    case Msg.Rematch: error = room.Rematch(id, now); break;
                    case Msg.ToLobby: error = room.ToLobby(id); break;
                    default:
                        if (!IsRoomCommand(envelope.t) && !IsLobbyFreeCommand(envelope.t)) error = ErrorCodes.BadRequest;
                        break;
                }
                room.Flush(now);
            }
            else if (error == null && !IsRoomCommand(envelope.t) && !IsLobbyFreeCommand(envelope.t))
            {
                error = ErrorCodes.BadRequest;
            }

            if (error != null) Send(session, Msg.Error, new ErrorMsg { code = error, message = ErrorText(error) });
        }

        static bool IsLobbyFreeCommand(string t)
        {
            return t == Msg.Ping || t == Msg.CreateRoom || t == Msg.JoinRoom || t == Msg.LeaveRoom || t == Msg.Queue
                || t == Msg.CancelQueue || t == Msg.QueueFillBots;
        }

        static bool IsRoomCommand(string t)
        {
            switch (t)
            {
                case Msg.SetReady:
                case Msg.SetTeam:
                case Msg.UpdateSettings:
                case Msg.AddBot:
                case Msg.RemoveBot:
                case Msg.MovePlayer:
                case Msg.StartMatch:
                case Msg.Answer:
                case Msg.UseJoker:
                case Msg.TeamVote:
                case Msg.Steal:
                case Msg.SkipSteal:
                case Msg.Rematch:
                case Msg.ToLobby:
                    return true;
                default:
                    return false;
            }
        }

        void HandleHello(ClientConnection connection, HelloMsg hello, double now)
        {
            if (hello == null)
            {
                SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.BadRequest, message = "Bad hello." });
                return;
            }
            if (hello.version != ProtocolInfo.Version)
            {
                SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.VersionMismatch, message = "Please reload the game to update it." });
                connection.Close();
                return;
            }

            PlayerSession session = null;
            bool resumed = false;
            if (!string.IsNullOrEmpty(hello.playerId) && sessions.TryGetValue(hello.playerId, out var existing)
                && CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(existing.Token ?? ""), System.Text.Encoding.UTF8.GetBytes(hello.token ?? "")))
            {
                session = existing;
                resumed = true;
                // A newer connection replaces the old one (e.g. the browser reconnected before the old socket timed out).
                if (session.Connection != null && session.Connection != connection) session.Connection.Close();
            }
            else if (!string.IsNullOrEmpty(hello.playerId))
            {
                // The old session is gone: tell the client so it can show a clear message, then continue as a new player.
                SendTo(connection, Msg.Error, new ErrorMsg { code = ErrorCodes.SessionExpired, message = "Your previous game has ended." });
            }

            if (session == null)
            {
                session = new PlayerSession
                {
                    PlayerId = "p_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant(),
                    Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(),
                };
                sessions[session.PlayerId] = session;
            }

            session.Name = PlayerNames.Sanitize(hello.name);
            session.Avatar = Math.Clamp(hello.avatar, 0, 31);
            session.Connection = connection;
            session.LastMessageAt = now;
            connection.Session = session;

            Send(session, Msg.Welcome, new WelcomeMsg { playerId = session.PlayerId, token = session.Token, resumed = resumed });

            var room = RoomOf(session);
            if (room != null)
            {
                if (room.Contains(session.PlayerId))
                {
                    room.SetConnected(session.PlayerId, true, now);
                    room.SendFullStateTo(session.PlayerId, now);
                    room.Flush(now);
                }
                else
                {
                    Send(session, Msg.Left, new LeftMsg { code = session.RoomCode, reason = LeaveReasons.Timeout });
                    session.RoomCode = null;
                }
            }
        }

        // ───────────────────────── Rooms ─────────────────────────

        RoomController RoomOf(PlayerSession session)
        {
            if (session.RoomCode == null) return null;
            return rooms.TryGetValue(session.RoomCode, out var room) ? room : null;
        }

        RoomController CreateRoom(bool isPublic, MatchSettings settings)
        {
            string code;
            do code = RoomCode.Generate(rng);
            while (rooms.ContainsKey(code));
            var room = new RoomController(code, isPublic, false, settings, bank, new XorShiftRandom(BitConverter.ToUInt64(RandomNumberGenerator.GetBytes(8), 0)), this);
            rooms.Add(code, room);
            return room;
        }

        void LeaveCurrent(PlayerSession session, double now)
        {
            var room = RoomOf(session);
            session.RoomCode = null;
            if (room == null) return;
            room.Leave(session.PlayerId, now);
            room.Flush(now);
        }

        void CreatePublicMatch(List<PlayerSession> players, QueueMode mode, double now)
        {
            var settings = new MatchSettings
            {
                rounds = PublicRounds,
                teamMode = (int)(mode == QueueMode.TwoVsTwo ? TeamMode.TwoVsTwo : TeamMode.OneVsOne),
            };
            var room = CreateRoom(true, settings);
            foreach (var p in players)
            {
                LeaveCurrent(p, now);
                room.TryJoin(p.PlayerId, p.Name, p.Avatar, now);
                p.RoomCode = room.Code;
            }
            int capacity = mode == QueueMode.TwoVsTwo ? 4 : 2;
            while (room.Members.Count < capacity) room.AddBot();

            const float countdown = 3.2f;
            room.ScheduleAutoStart(now, countdown);
            foreach (var p in players) Send(p, Msg.MatchFound, new MatchFoundMsg { code = room.Code, countdown = countdown });
            room.Flush(now);
            log("Public " + mode + " match " + room.Code + " with " + players.Count + " player(s).");
        }

        // ───────────────────────── Tick ─────────────────────────

        public void Tick()
        {
            lock (gate)
            {
                double now = Now;
                try
                {
                    matchmaker.Tick(now, CreatePublicMatch, (s, status) => Send(s, Msg.QueueStatus, status));

                    var closed = new List<string>();
                    foreach (var pair in rooms)
                    {
                        var room = pair.Value;
                        room.Tick(now);
                        room.Flush(now);
                        if (room.IsAbandoned) closed.Add(pair.Key);
                    }
                    foreach (var code in closed)
                    {
                        rooms.Remove(code);
                        log("Room " + code + " closed.");
                    }

                    var expired = new List<PlayerSession>();
                    foreach (var session in sessions.Values)
                    {
                        if (session.Connection == null)
                        {
                            if (now - session.DisconnectedAt >= SessionGraceSeconds) expired.Add(session);
                        }
                        else if (now - session.LastMessageAt >= IdleTimeoutSeconds)
                        {
                            // The client pings every few seconds; silence means the socket is dead.
                            session.Connection.Close();
                        }
                    }
                    foreach (var session in expired)
                    {
                        LeaveCurrent(session, now);
                        sessions.Remove(session.PlayerId);
                    }
                }
                catch (Exception e)
                {
                    log("Tick error: " + e);
                }
            }
        }

        // ───────────────────────── Output ─────────────────────────

        void IRoomOutput.Send(string playerId, string type, object payload)
        {
            if (playerId != null && sessions.TryGetValue(playerId, out var session))
            {
                if (type == Msg.Left) session.RoomCode = null;
                Send(session, type, payload);
            }
        }

        void Send(PlayerSession session, string type, object payload)
        {
            if (session?.Connection == null) return;
            SendTo(session.Connection, type, payload);
        }

        static void SendTo(ClientConnection connection, string type, object payload)
        {
            connection.Send(Json.Wrap(type, payload));
        }

        public static string ErrorText(string code)
        {
            switch (code)
            {
                case ErrorCodes.RoomNotFound: return "Room not found.";
                case ErrorCodes.RoomFull: return "Room is full.";
                case ErrorCodes.GameStarted: return "Game already started.";
                case ErrorCodes.NotHost: return "Only the host can do that.";
                case ErrorCodes.NotEnoughPlayers: return "Not enough players.";
                case ErrorCodes.TeamsInvalid: return "The teams do not fit the selected mode.";
                case ErrorCodes.PlayersNotReady: return "Not everyone is ready.";
                case ErrorCodes.PlayerReconnecting: return "Waiting for a player to reconnect.";
                case ErrorCodes.TeamFull: return "That team is full.";
                case ErrorCodes.NotInRoom: return "You are not in a room.";
                case ErrorCodes.ServerFull: return "The server is full. Please try again soon.";
                default: return "That is not possible right now.";
            }
        }
    }
}

using System;
using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>Delivers messages from a room to its players (WebSocket on the server, a local queue in practice mode).</summary>
    public interface IRoomOutput
    {
        void Send(string playerId, string type, object payload);
    }

    public sealed class RoomMember
    {
        public string Id;
        public string Name;
        public int Avatar;
        public int Team;
        public bool Ready;
        public bool IsBot;
        public bool Connected = true;
        public double DisconnectedAt;
        public int JoinOrder;
    }

    /// <summary>
    /// One room: lobby (players, teams, ready states, host settings), the running match and the post-match screen
    /// (rematch / back to lobby). The server owns one per room code; practice mode runs one locally.
    /// </summary>
    public sealed class RoomController
    {
        static readonly string[] BotNames = { "Nova", "Pixel", "Echo", "Blitz", "Comet", "Mango", "Zippy", "Orbit", "Quasar", "Sprout" };

        readonly QuestionBank bank;
        readonly IRandom rng;
        readonly IRoomOutput output;
        readonly List<RoomMember> members = new List<RoomMember>(MatchRules.MaxPlayers);
        readonly HashSet<string> rematchVotes = new HashSet<string>();

        MatchEngine engine;
        int nextJoinOrder;
        int nextBotId;
        int matchesPlayed;
        double autoStartAt = -1;
        bool roomDirty = true;

        public string Code { get; }
        public bool IsPublic { get; }
        public bool IsLocal { get; }
        public RoomState State { get; private set; } = RoomState.Lobby;
        public string HostId { get; private set; }
        public MatchSettings Settings { get; private set; }
        public MatchEngine Engine => engine;
        public IReadOnlyList<RoomMember> Members => members;
        public int MatchesPlayed => matchesPlayed;

        public RoomController(string code, bool isPublic, bool isLocal, MatchSettings settings, QuestionBank bank, IRandom rng, IRoomOutput output)
        {
            Code = code;
            IsPublic = isPublic;
            IsLocal = isLocal;
            this.bank = bank;
            this.rng = rng;
            this.output = output;
            Settings = (settings ?? new MatchSettings()).Clone();
            Settings.Sanitize();
        }

        public int HumanCount
        {
            get
            {
                int n = 0;
                foreach (var m in members) if (!m.IsBot) n++;
                return n;
            }
        }

        public bool IsAbandoned => HumanCount == 0;
        public bool IsFull => members.Count >= MatchRules.MaxPlayers;

        public RoomMember Find(string id)
        {
            if (id == null) return null;
            foreach (var m in members) if (m.Id == id) return m;
            return null;
        }

        public bool Contains(string id) => Find(id) != null;

        // ───────────────────────── Membership ─────────────────────────

        /// <summary>Adds a person. Returns null on success or an error code.</summary>
        public string TryJoin(string id, string name, int avatar, double now)
        {
            if (Contains(id)) return null;
            if (State != RoomState.Lobby) return ErrorCodes.GameStarted;
            if (IsFull) return ErrorCodes.RoomFull;

            members.Add(new RoomMember
            {
                Id = id,
                Name = PlayerNames.Sanitize(name),
                Avatar = avatar,
                Team = SmallerTeam(),
                JoinOrder = nextJoinOrder++,
            });
            EnsureHost();
            roomDirty = true;
            return null;
        }

        public RoomMember AddBot()
        {
            if (IsFull) return null;
            string name = "Bot " + BotNames[(nextBotId + rng.Next(BotNames.Length)) % BotNames.Length];
            while (NameTaken(name)) name = "Bot " + BotNames[rng.Next(BotNames.Length)] + " " + (nextBotId + 2);
            var bot = new RoomMember
            {
                Id = "bot-" + Code + "-" + (nextBotId++),
                Name = name,
                Avatar = rng.Next(8),
                Team = SmallerTeam(),
                Ready = true,
                IsBot = true,
                JoinOrder = nextJoinOrder++,
            };
            members.Add(bot);
            roomDirty = true;
            return bot;
        }

        bool NameTaken(string name)
        {
            foreach (var m in members) if (m.Name == name) return true;
            return false;
        }

        int SmallerTeam()
        {
            int red = 0, blue = 0;
            foreach (var m in members)
            {
                if (m.Team == Teams.Blue) blue++;
                else red++;
            }
            return blue < red ? Teams.Blue : Teams.Red;
        }

        int TeamCount(int team)
        {
            int n = 0;
            foreach (var m in members) if (m.Team == team) n++;
            return n;
        }

        /// <summary>The player left on purpose (button, closed the room).</summary>
        public void Leave(string id, double now, string reason = LeaveReasons.Left)
        {
            var m = Find(id);
            if (m == null) return;
            members.Remove(m);
            rematchVotes.Remove(id);
            if (engine != null && State == RoomState.InMatch) engine.RemovePlayer(id, now);
            if (!m.IsBot) output.Send(id, Msg.Left, new LeftMsg { code = Code, reason = reason });
            EnsureHost();
            roomDirty = true;
            CheckRematch(now);
        }

        public void SetConnected(string id, bool connected, double now)
        {
            var m = Find(id);
            if (m == null || m.IsBot || m.Connected == connected) return;
            m.Connected = connected;
            if (!connected) m.DisconnectedAt = now;
            if (engine != null) engine.SetConnected(id, connected, now);
            roomDirty = true;
            if (connected) SendFullStateTo(id, now);
        }

        void EnsureHost()
        {
            var host = Find(HostId);
            if (host != null && !host.IsBot) return;
            RoomMember best = null;
            foreach (var m in members)
            {
                if (m.IsBot) continue;
                if (best == null
                    || (m.Connected && !best.Connected)
                    || (m.Connected == best.Connected && m.JoinOrder < best.JoinOrder)) best = m;
            }
            HostId = best != null ? best.Id : null;
            roomDirty = true;
        }

        // ───────────────────────── Lobby commands ─────────────────────────

        public string SetReady(string id, bool ready)
        {
            var m = Find(id);
            if (m == null) return ErrorCodes.NotInRoom;
            if (State != RoomState.Lobby) return ErrorCodes.NotAllowed;
            if (m.Ready == ready) return null;
            m.Ready = ready;
            roomDirty = true;
            return null;
        }

        public string SetTeam(string id, int team)
        {
            var m = Find(id);
            if (m == null) return ErrorCodes.NotInRoom;
            if (State != RoomState.Lobby || IsPublic && autoStartAt > 0) return ErrorCodes.NotAllowed;
            if (team != Teams.Red && team != Teams.Blue) return ErrorCodes.BadRequest;
            if (m.Team == team) return null;
            if (TeamCount(team) >= MatchRules.MaxPerTeam) return ErrorCodes.TeamFull;
            m.Team = team;
            roomDirty = true;
            return null;
        }

        /// <summary>The host moves a bot (or any player) to the other team.</summary>
        public string MovePlayer(string hostId, string playerId)
        {
            if (hostId != HostId) return ErrorCodes.NotHost;
            var m = Find(playerId);
            if (m == null) return ErrorCodes.BadRequest;
            return SetTeam(playerId, Teams.Other(m.Team));
        }

        public string UpdateSettings(string id, MatchSettings settings)
        {
            if (id != HostId) return ErrorCodes.NotHost;
            if (State != RoomState.Lobby) return ErrorCodes.NotAllowed;
            if (settings == null) return ErrorCodes.BadRequest;
            var s = settings.Clone();
            s.Sanitize();
            if (s.category != CategoryIds.Classic && bank.CountFor(s.category) == 0) s.category = CategoryIds.Classic;
            Settings = s;
            roomDirty = true;
            return null;
        }

        public string HostAddBot(string id)
        {
            if (id != HostId) return ErrorCodes.NotHost;
            if (State != RoomState.Lobby) return ErrorCodes.NotAllowed;
            if (IsFull) return ErrorCodes.RoomFull;
            AddBot();
            return null;
        }

        public string HostRemoveBot(string id, string botId)
        {
            if (id != HostId) return ErrorCodes.NotHost;
            if (State != RoomState.Lobby) return ErrorCodes.NotAllowed;
            var bot = Find(botId);
            if (bot == null || !bot.IsBot) return ErrorCodes.BadRequest;
            members.Remove(bot);
            roomDirty = true;
            return null;
        }

        /// <summary>Checks whether the current lobby may start. Null when it can.</summary>
        public string CanStart(bool requireReady)
        {
            int red = TeamCount(Teams.Red);
            int blue = TeamCount(Teams.Blue);
            if (red == 0 || blue == 0) return ErrorCodes.NotEnoughPlayers;
            switch ((TeamMode)Settings.teamMode)
            {
                case TeamMode.OneVsOne:
                    if (red != 1 || blue != 1) return ErrorCodes.TeamsInvalid;
                    break;
                case TeamMode.TwoVsTwo:
                    if (red != 2 || blue != 2) return members.Count < 4 ? ErrorCodes.NotEnoughPlayers : ErrorCodes.TeamsInvalid;
                    break;
            }
            foreach (var m in members)
            {
                if (m.IsBot) continue;
                if (!m.Connected) return ErrorCodes.PlayerReconnecting;
                if (requireReady && m.Id != HostId && !m.Ready) return ErrorCodes.PlayersNotReady;
            }
            return null;
        }

        public string StartMatch(string id, double now)
        {
            if (id != HostId) return ErrorCodes.NotHost;
            if (State != RoomState.Lobby) return ErrorCodes.NotAllowed;
            string error = CanStart(true);
            if (error != null) return error;
            StartMatchInternal(now);
            return null;
        }

        /// <summary>Public matchmaking: the room starts on its own after the MATCH FOUND countdown.</summary>
        public void ScheduleAutoStart(double now, double delay)
        {
            autoStartAt = now + delay;
            roomDirty = true;
        }

        void StartMatchInternal(double now)
        {
            autoStartAt = -1;
            var players = new List<MatchParticipant>(members.Count);
            foreach (var m in members)
            {
                players.Add(new MatchParticipant(m.Id, m.Name, m.Team, m.IsBot, m.Avatar)
                {
                    Connected = m.Connected || m.IsBot,
                    DisconnectedAt = m.DisconnectedAt,
                    BotSkill = m.IsBot ? rng.Range(0.85, 1.1) : 1.0,
                });
            }
            engine = new MatchEngine(Settings, players, bank, rng, matchesPlayed % 2 == 0 ? Teams.Red : Teams.Blue);
            engine.Start(now);
            matchesPlayed++;
            rematchVotes.Clear();
            State = RoomState.InMatch;
            roomDirty = true;
        }

        // ───────────────────────── Match commands ─────────────────────────

        public string Answer(string id, int index, double now) => engine == null || State != RoomState.InMatch ? ErrorCodes.NotAllowed : engine.SubmitAnswer(id, index, now);
        public string UseJoker(string id, int joker, double now)
        {
            if (engine == null || State != RoomState.InMatch) return ErrorCodes.NotAllowed;
            if (joker < 0 || joker >= JokerTypes.Count) return ErrorCodes.BadRequest;
            return engine.UseJoker(id, (JokerType)joker, now);
        }
        public string TeamVote(string id, int index, double now) => engine == null || State != RoomState.InMatch ? ErrorCodes.NotAllowed : engine.SubmitTeamVote(id, index, now);
        public string Steal(string id, int index, double now) => engine == null || State != RoomState.InMatch ? ErrorCodes.NotAllowed : engine.SubmitSteal(id, index, now);
        public string SkipSteal(string id, double now) => engine == null || State != RoomState.InMatch ? ErrorCodes.NotAllowed : engine.SkipSteal(id, now);

        // ───────────────────────── After the match ─────────────────────────

        public string Rematch(string id, double now)
        {
            if (State != RoomState.PostMatch) return ErrorCodes.NotAllowed;
            if (Find(id) == null) return ErrorCodes.NotInRoom;
            rematchVotes.Add(id);
            roomDirty = true;
            CheckRematch(now);
            return null;
        }

        void CheckRematch(double now)
        {
            if (State != RoomState.PostMatch || rematchVotes.Count == 0) return;
            foreach (var m in members)
            {
                if (!m.IsBot && m.Connected && !rematchVotes.Contains(m.Id)) return;
            }
            // Everybody still here wants another round with the same teams.
            if (CanStart(false) == null) StartMatchInternal(now);
            else ReturnToLobby();
        }

        public string ToLobby(string id)
        {
            if (State != RoomState.PostMatch) return ErrorCodes.NotAllowed;
            if (Find(id) == null) return ErrorCodes.NotInRoom;
            ReturnToLobby();
            return null;
        }

        void ReturnToLobby()
        {
            State = RoomState.Lobby;
            engine = null;
            rematchVotes.Clear();
            foreach (var m in members) m.Ready = m.IsBot;
            roomDirty = true;
        }

        // ───────────────────────── Tick & output ─────────────────────────

        public void Tick(double now)
        {
            // Outside a match, players who do not come back in time are removed (the match has its own rules).
            if (State != RoomState.InMatch)
            {
                for (int i = members.Count - 1; i >= 0; i--)
                {
                    var m = members[i];
                    if (m.IsBot || m.Connected) continue;
                    if (now - m.DisconnectedAt >= MatchRules.ReconnectGraceSeconds)
                    {
                        members.RemoveAt(i);
                        rematchVotes.Remove(m.Id);
                        roomDirty = true;
                        EnsureHost();
                        CheckRematch(now);
                    }
                }
            }

            if (State == RoomState.Lobby && autoStartAt > 0 && now >= autoStartAt)
            {
                if (CanStart(false) == null || CanStartIgnoringConnections()) StartMatchInternal(now);
                else autoStartAt = -1;
            }

            if (engine != null && State == RoomState.InMatch)
            {
                engine.Tick(now);
                if (engine.IsFinished)
                {
                    State = RoomState.PostMatch;
                    roomDirty = true;
                }
            }
        }

        bool CanStartIgnoringConnections()
        {
            return TeamCount(Teams.Red) > 0 && TeamCount(Teams.Blue) > 0;
        }

        /// <summary>Sends everything that changed since the last flush.</summary>
        public void Flush(double now)
        {
            if (roomDirty)
            {
                roomDirty = false;
                var snapshot = BuildRoomSnapshot(now);
                foreach (var m in members)
                {
                    if (!m.IsBot && m.Connected) output.Send(m.Id, Msg.Room, snapshot);
                }
            }

            if (engine != null && engine.Dirty)
            {
                engine.Dirty = false;
                SendMatchToAll(now);
            }
        }

        void SendMatchToAll(double now)
        {
            MatchSnapshot red = null, blue = null;
            foreach (var m in members)
            {
                if (m.IsBot || !m.Connected) continue;
                if (m.Team == Teams.Blue)
                {
                    if (blue == null) blue = engine.BuildSnapshot(Teams.Blue, now);
                    output.Send(m.Id, Msg.Match, blue);
                }
                else
                {
                    if (red == null) red = engine.BuildSnapshot(Teams.Red, now);
                    output.Send(m.Id, Msg.Match, red);
                }
            }
        }

        /// <summary>After a (re)connect: the full room and match state.</summary>
        public void SendFullStateTo(string id, double now)
        {
            var m = Find(id);
            if (m == null || m.IsBot) return;
            output.Send(id, Msg.Room, BuildRoomSnapshot(now));
            if (engine != null) output.Send(id, Msg.Match, engine.BuildSnapshot(TeamInMatch(m), now));
        }

        int TeamInMatch(RoomMember m)
        {
            if (engine != null)
            {
                foreach (var p in engine.Participants) if (p.Id == m.Id) return p.Team;
            }
            return m.Team;
        }

        public RoomSnapshot BuildRoomSnapshot(double now)
        {
            var s = new RoomSnapshot
            {
                code = Code,
                isPublic = IsPublic,
                isLocal = IsLocal,
                state = (int)State,
                hostId = HostId,
                settings = Settings.Clone(),
                players = new RoomPlayerView[members.Count],
                startCountdown = autoStartAt > 0 ? (float)Math.Max(0, autoStartAt - now) : 0f,
            };
            for (int i = 0; i < members.Count; i++)
            {
                var m = members[i];
                s.players[i] = new RoomPlayerView
                {
                    id = m.Id,
                    name = m.Name,
                    avatar = m.Avatar,
                    team = m.Team,
                    ready = m.Ready || m.IsBot,
                    connected = m.Connected || m.IsBot,
                    isHost = m.Id == HostId,
                    isBot = m.IsBot,
                    reconnectRemaining = m.Connected || m.IsBot ? 0f : (float)Math.Max(0, MatchRules.ReconnectGraceSeconds - (now - m.DisconnectedAt)),
                };
            }
            s.rematchVotes = new string[rematchVotes.Count];
            rematchVotes.CopyTo(s.rematchVotes);
            return s;
        }
    }

    public static class PlayerNames
    {
        public const int MaxLength = 14;

        static readonly string[] Adjectives = { "Quick", "Clever", "Lucky", "Brainy", "Witty", "Sneaky", "Mighty", "Swift", "Bold", "Sharp", "Cosmic", "Turbo" };
        static readonly string[] Animals = { "Fox", "Owl", "Panda", "Tiger", "Otter", "Koala", "Falcon", "Shark", "Lynx", "Gecko", "Moose", "Yak" };

        public static string Random(IRandom rng)
        {
            return Adjectives[rng.Next(Adjectives.Length)] + Animals[rng.Next(Animals.Length)] + (10 + rng.Next(90));
        }

        /// <summary>Trims, removes control characters and limits the length. Never returns an empty name.</summary>
        public static string Sanitize(string name)
        {
            if (string.IsNullOrEmpty(name)) return "Player";
            var chars = new System.Text.StringBuilder(MaxLength);
            foreach (char c in name)
            {
                if (char.IsControl(c) || c == '<' || c == '>') continue;
                chars.Append(c);
                if (chars.Length >= MaxLength) break;
            }
            string result = chars.ToString().Trim();
            return result.Length == 0 ? "Player" : result;
        }
    }
}

using System;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using GuessTheAnswer.Server;
using GuessTheAnswer.Shared;
using Microsoft.AspNetCore.Builder;

namespace GuessTheAnswer.Tests
{
    /// <summary>A scripted game client speaking the real wire protocol.</summary>
    sealed class TestClient : IAsyncDisposable
    {
        readonly ClientWebSocket socket = new ClientWebSocket();
        readonly BlockingCollection<Envelope> inbox = new BlockingCollection<Envelope>();
        readonly CancellationTokenSource cts = new CancellationTokenSource();
        Task receiver;

        public string PlayerId;
        public string Token;
        public RoomSnapshot Room;
        public MatchSnapshot Match;

        public static async Task<TestClient> Connect(string url, string name, string resumeId = null, string resumeToken = null)
        {
            var c = new TestClient();
            await c.socket.ConnectAsync(new Uri(url), CancellationToken.None);
            c.receiver = c.ReceiveLoop();
            c.Send(Msg.Hello, new HelloMsg { name = name, playerId = resumeId, token = resumeToken });
            var welcome = c.Expect<WelcomeMsg>(Msg.Welcome);
            c.PlayerId = welcome.playerId;
            c.Token = welcome.token;
            return c;
        }

        async Task ReceiveLoop()
        {
            var buffer = new byte[64 * 1024];
            var sb = new StringBuilder();
            try
            {
                while (socket.State == WebSocketState.Open)
                {
                    var r = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), cts.Token);
                    if (r.MessageType == WebSocketMessageType.Close) break;
                    sb.Append(Encoding.UTF8.GetString(buffer, 0, r.Count));
                    if (!r.EndOfMessage) continue;
                    var env = JsonSerializer.Deserialize<Envelope>(sb.ToString(), Json.Options);
                    sb.Clear();
                    inbox.Add(env);
                }
            }
            catch (Exception)
            {
                // Closed by the test.
            }
        }

        public void Send(string type, object payload)
        {
            var bytes = Encoding.UTF8.GetBytes(Json.Wrap(type, payload));
            socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).GetAwaiter().GetResult();
        }

        /// <summary>Waits for a message of the given type (keeping room/match state up to date on the way).</summary>
        public T Expect<T>(string type, Func<T, bool> predicate = null, double seconds = 10) where T : class, new()
        {
            var deadline = DateTime.UtcNow.AddSeconds(seconds);
            while (true)
            {
                var left = deadline - DateTime.UtcNow;
                if (left <= TimeSpan.Zero || !inbox.TryTake(out var env, left))
                    throw new AssertionException("Timed out waiting for '" + type + "' (last phase " + (Match != null ? ((MatchPhase)Match.phase).ToString() + " turn " + Match.turn : "none") + ")");
                Track(env);
                if (env.t != type) continue;
                var payload = Json.Payload<T>(env);
                if (predicate == null || predicate(payload)) return payload;
            }
        }

        void Track(Envelope env)
        {
            if (env.t == Msg.Room) Room = Json.Payload<RoomSnapshot>(env);
            else if (env.t == Msg.Match) Match = Json.Payload<MatchSnapshot>(env);
        }

        /// <summary>Room state can arrive while waiting for something else, so check the latest one first.</summary>
        public RoomSnapshot ExpectRoom(Func<RoomSnapshot, bool> predicate, double seconds = 10)
        {
            if (Room != null && predicate(Room)) return Room;
            return Expect<RoomSnapshot>(Msg.Room, predicate, seconds);
        }

        int consumedSeq = -1;

        /// <summary>Waits for the next snapshot of a phase; each phase instance is returned only once.</summary>
        public MatchSnapshot ExpectPhase(MatchPhase phase, double seconds = 30)
        {
            if (Match != null && Match.phase == (int)phase && Match.phaseSeq > consumedSeq)
            {
                consumedSeq = Match.phaseSeq;
                return Match;
            }
            var m = Expect<MatchSnapshot>(Msg.Match, x => x.phase == (int)phase && x.phaseSeq > consumedSeq, seconds);
            consumedSeq = m.phaseSeq;
            return m;
        }

        public async Task Drop()
        {
            cts.Cancel();
            socket.Abort();
            try { await receiver; } catch { /* aborted */ }
        }

        public async ValueTask DisposeAsync()
        {
            await Drop();
            socket.Dispose();
        }
    }

    public static class IntegrationTests
    {
        static WebApplication app;
        static string url;

        static async Task<string> Server()
        {
            if (app != null) return url;
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            Environment.SetEnvironmentVariable("GTA_DATA_DIR", TestData.DataDirectory);
            app = Program.Build(new string[0], out _, "http://127.0.0.1:" + port);
            await app.StartAsync();
            url = "ws://127.0.0.1:" + port + "/ws";
            return url;
        }

        [Test]
        public static async Task Private_CreateJoinPlayFullMatch()
        {
            string u = await Server();
            await using var host = await TestClient.Connect(u, "Hosty");
            await using var guest = await TestClient.Connect(u, "Guesty");

            host.Send(Msg.CreateRoom, new CreateRoomMsg { settings = new MatchSettings { rounds = 5, answerTime = 10 } });
            var room = host.Expect<RoomSnapshot>(Msg.Room);
            Assert.Equal(6, room.code.Length, "room code");
            Assert.Equal(host.PlayerId, room.hostId, "creator hosts");

            guest.Send(Msg.JoinRoom, new JoinRoomMsg { code = room.code.ToLowerInvariant() });
            guest.Expect<RoomSnapshot>(Msg.Room, r => r.players.Length == 2);

            host.Send(Msg.StartMatch, new EmptyMsg());
            Assert.Equal(ErrorCodes.PlayersNotReady, host.Expect<ErrorMsg>(Msg.Error).code, "guest not ready");
            guest.Send(Msg.SetReady, new ReadyMsg { ready = true });
            host.Expect<RoomSnapshot>(Msg.Room, r => Array.TrueForAll(r.players, p => p.ready || p.isHost));
            host.Send(Msg.StartMatch, new EmptyMsg());
            host.Expect<RoomSnapshot>(Msg.Room, r => r.state == (int)RoomState.InMatch);

            // Each active player answers correctly as soon as the question appears.
            for (int turn = 0; turn < 10; turn++)
            {
                var q = host.ExpectPhase(MatchPhase.Question);
                var guestView = guest.ExpectPhase(MatchPhase.Question);
                Assert.Equal(q.question.id, guestView.question.id, "both see the same question");
                var active = q.activePlayerId == host.PlayerId ? host : guest;
                var view = active == host ? q : guestView;
                Assert.Equal(-1, view.question.correctIndex, "answer is secret on the wire");
                active.Send(Msg.Answer, new IndexMsg { index = TestData.CorrectIndex(view) });
                host.ExpectPhase(MatchPhase.Reveal);
                guest.ExpectPhase(MatchPhase.Reveal);
            }

            // Perfect play on both sides ends level: the tie breaker decides.
            var tb = guest.ExpectPhase(MatchPhase.TieBreakQuestion, 40);
            guest.Send(Msg.Answer, new IndexMsg { index = TestData.CorrectIndex(tb) });
            var end = host.ExpectPhase(MatchPhase.Finished, 20);
            Assert.Equal(1, end.end.winnerTeam, "guest's team wins the tie breaker");
            Assert.Equal((int)MatchEndReason.TieBreak, end.end.reason, "reason");
            host.ExpectRoom(r => r.state == (int)RoomState.PostMatch);

            host.Send(Msg.Rematch, new EmptyMsg());
            guest.Send(Msg.Rematch, new EmptyMsg());
            host.Expect<RoomSnapshot>(Msg.Room, r => r.state == (int)RoomState.InMatch);
            Assert.Equal(2, host.Room.players.Length, "same players in the rematch");
        }

        [Test]
        public static async Task Join_ErrorsAreReported()
        {
            string u = await Server();
            await using var a = await TestClient.Connect(u, "A");
            a.Send(Msg.JoinRoom, new JoinRoomMsg { code = "ZZZZZZ" });
            Assert.Equal(ErrorCodes.RoomNotFound, a.Expect<ErrorMsg>(Msg.Error).code, "unknown code");
            a.Send(Msg.JoinRoom, new JoinRoomMsg { code = "bad" });
            Assert.Equal(ErrorCodes.RoomNotFound, a.Expect<ErrorMsg>(Msg.Error).code, "malformed code");

            a.Send(Msg.CreateRoom, new CreateRoomMsg());
            var room = a.Expect<RoomSnapshot>(Msg.Room);
            a.Send(Msg.AddBot, new EmptyMsg());
            a.Send(Msg.AddBot, new EmptyMsg());
            a.Send(Msg.AddBot, new EmptyMsg());
            a.Expect<RoomSnapshot>(Msg.Room, r => r.players.Length == 4);

            await using var b = await TestClient.Connect(u, "B");
            b.Send(Msg.JoinRoom, new JoinRoomMsg { code = room.code });
            Assert.Equal(ErrorCodes.RoomFull, b.Expect<ErrorMsg>(Msg.Error).code, "full");

            a.Send(Msg.StartMatch, new EmptyMsg());
            a.Expect<RoomSnapshot>(Msg.Room, r => r.state == (int)RoomState.InMatch);
            a.Send(Msg.RemoveBot, new PlayerRefMsg { playerId = "nope" });
            a.Expect<ErrorMsg>(Msg.Error);
            b.Send(Msg.JoinRoom, new JoinRoomMsg { code = room.code });
            Assert.Equal(ErrorCodes.GameStarted, b.Expect<ErrorMsg>(Msg.Error).code, "started");
        }

        [Test]
        public static async Task Reconnect_ResumesTheMatch()
        {
            string u = await Server();
            await using var host = await TestClient.Connect(u, "Host");
            var guest = await TestClient.Connect(u, "Guest");
            host.Send(Msg.CreateRoom, new CreateRoomMsg());
            var room = host.Expect<RoomSnapshot>(Msg.Room);
            guest.Send(Msg.JoinRoom, new JoinRoomMsg { code = room.code });
            guest.Send(Msg.SetReady, new ReadyMsg { ready = true });
            host.Expect<RoomSnapshot>(Msg.Room, r => r.players.Length == 2 && Array.TrueForAll(r.players, p => p.ready || p.isHost));
            host.Send(Msg.StartMatch, new EmptyMsg());
            host.ExpectPhase(MatchPhase.Question);

            string id = guest.PlayerId, token = guest.Token;
            await guest.Drop();
            host.Expect<RoomSnapshot>(Msg.Room, r => Array.Exists(r.players, p => p.id == id && !p.connected));

            await using var back = await TestClient.Connect(u, "Guest", id, token);
            Assert.Equal(id, back.PlayerId, "same identity");
            back.Expect<RoomSnapshot>(Msg.Room, r => r.state == (int)RoomState.InMatch);
            var m = back.Expect<MatchSnapshot>(Msg.Match);
            Assert.True(m.phase != (int)MatchPhase.Finished, "match still running");
            host.Expect<RoomSnapshot>(Msg.Room, r => Array.TrueForAll(r.players, p => p.connected));
        }

        [Test]
        public static async Task PublicQueue_MatchesTwoPlayersAndStarts()
        {
            string u = await Server();
            await using var a = await TestClient.Connect(u, "Q1");
            await using var b = await TestClient.Connect(u, "Q2");
            a.Send(Msg.Queue, new QueueMsg { mode = (int)QueueKind.OneVsOne });
            a.Expect<QueueStatusMsg>(Msg.QueueStatus, s => s.searching && s.needed == 2);
            b.Send(Msg.Queue, new QueueMsg { mode = (int)QueueKind.OneVsOne });
            var found = a.Expect<MatchFoundMsg>(Msg.MatchFound);
            Assert.True(found.countdown > 2, "countdown");
            b.Expect<MatchFoundMsg>(Msg.MatchFound);
            var r = a.Expect<RoomSnapshot>(Msg.Room, x => x.state == (int)RoomState.InMatch, 10);
            Assert.True(r.isPublic, "public room");
            Assert.Equal(GameHub.PublicRounds, a.ExpectPhase(MatchPhase.Question).totalRounds, "quick match length");
        }

        [Test]
        public static async Task PublicQueue_CancelStopsSearching()
        {
            string u = await Server();
            await using var a = await TestClient.Connect(u, "Solo");
            a.Send(Msg.Queue, new QueueMsg { mode = (int)QueueKind.TwoVsTwo });
            a.Expect<QueueStatusMsg>(Msg.QueueStatus, s => s.searching && s.needed == 4);
            a.Send(Msg.CancelQueue, new EmptyMsg());
            a.Expect<QueueStatusMsg>(Msg.QueueStatus, s => !s.searching);
            a.Send(Msg.QueueFillBots, new EmptyMsg());
            Assert.Equal(ErrorCodes.NotAllowed, a.Expect<ErrorMsg>(Msg.Error).code, "not queued any more");
        }
    }
}

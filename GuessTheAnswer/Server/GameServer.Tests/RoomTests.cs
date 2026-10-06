using System.Collections.Generic;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Tests
{
    sealed class CaptureOutput : IRoomOutput
    {
        public readonly List<(string player, string type, object payload)> Sent = new List<(string, string, object)>();

        public void Send(string playerId, string type, object payload) => Sent.Add((playerId, type, payload));

        public T Last<T>(string player, string type) where T : class
        {
            for (int i = Sent.Count - 1; i >= 0; i--)
            {
                if (Sent[i].player == player && Sent[i].type == type) return Sent[i].payload as T;
            }
            return null;
        }
    }

    public static class RoomTests
    {
        static RoomController NewRoom(CaptureOutput output, MatchSettings settings = null)
        {
            return new RoomController("K7MX4Q", false, false, settings ?? new MatchSettings(), TestData.Bank, new XorShiftRandom(3), output);
        }

        [Test]
        public static void RoomCode_FormatAndAlphabet()
        {
            var rng = new XorShiftRandom(5);
            for (int i = 0; i < 500; i++)
            {
                string code = RoomCode.Generate(rng);
                Assert.Equal(6, code.Length, "length");
                foreach (char c in code) Assert.True("0O1I".IndexOf(c) < 0, "no confusing characters");
            }
            Assert.Equal("K7MX4Q", RoomCode.Normalize(" k7m-x4q "), "normalizes input");
            Assert.Equal<string>(null, RoomCode.Normalize("K7MX0Q"), "rejects 0");
            Assert.Equal<string>(null, RoomCode.Normalize("K7MX4"), "rejects short codes");
        }

        [Test]
        public static void Join_FullAndStartedErrors()
        {
            var output = new CaptureOutput();
            var room = NewRoom(output);
            for (int i = 0; i < 4; i++) Assert.Equal<string>(null, room.TryJoin("p" + i, "P" + i, 0, 0), "join " + i);
            Assert.Equal(ErrorCodes.RoomFull, room.TryJoin("p4", "P4", 0, 0), "fifth player");
            Assert.Equal("p0", room.HostId, "first player hosts");
            Assert.Equal(2, CountTeam(room, Teams.Red), "balanced red");
            Assert.Equal(2, CountTeam(room, Teams.Blue), "balanced blue");

            room.Leave("p3", 0);
            room.SetReady("p1", true);
            room.SetReady("p2", true);
            Assert.Equal<string>(null, room.StartMatch("p0", 0), "start 2v1 in AUTO");
            Assert.Equal(ErrorCodes.GameStarted, room.TryJoin("late", "Late", 0, 1), "no joining a running game");
        }

        static int CountTeam(RoomController room, int team)
        {
            int n = 0;
            foreach (var m in room.Members) if (m.Team == team) n++;
            return n;
        }

        [Test]
        public static void Start_ValidatesHostReadyAndMode()
        {
            var output = new CaptureOutput();
            var room = NewRoom(output);
            room.TryJoin("a", "A", 0, 0);
            Assert.Equal(ErrorCodes.NotEnoughPlayers, room.StartMatch("a", 0), "alone");
            room.TryJoin("b", "B", 0, 0);
            Assert.Equal(ErrorCodes.NotHost, room.StartMatch("b", 0), "only host starts");
            Assert.Equal(ErrorCodes.PlayersNotReady, room.StartMatch("a", 0), "b not ready");
            room.SetReady("b", true);
            Assert.Equal(ErrorCodes.NotHost, room.UpdateSettings("b", new MatchSettings()), "only host changes settings");
            room.UpdateSettings("a", new MatchSettings { teamMode = (int)TeamMode.TwoVsTwo, rounds = 7, answerTime = 99, category = "movies" });
            Assert.Equal(5, room.Settings.rounds, "rounds snapped to an allowed value");
            Assert.Equal(20, room.Settings.answerTime, "answer time snapped");
            Assert.Equal("movies", room.Settings.category, "category kept");
            Assert.Equal(ErrorCodes.NotEnoughPlayers, room.StartMatch("a", 0), "2v2 needs four");
            room.HostAddBot("a");
            room.HostAddBot("a");
            Assert.Equal<string>(null, room.StartMatch("a", 0), "2v2 with bots");
            Assert.Equal(RoomState.InMatch, room.State, "in match");
        }

        [Test]
        public static void Host_MigratesWhenHostLeaves()
        {
            var output = new CaptureOutput();
            var room = NewRoom(output);
            room.TryJoin("a", "A", 0, 0);
            room.TryJoin("b", "B", 0, 0);
            room.HostAddBot("a");
            room.Leave("a", 0);
            Assert.Equal("b", room.HostId, "b is the new host");
            Assert.Equal(LeaveReasons.Left, output.Last<LeftMsg>("a", Msg.Left).reason, "a is told");
            room.Leave("b", 0);
            Assert.True(room.IsAbandoned, "only a bot remains: room closes");
        }

        [Test]
        public static void Lobby_DisconnectedPlayerRemovedAfterGrace()
        {
            var output = new CaptureOutput();
            var room = NewRoom(output);
            room.TryJoin("a", "A", 0, 0);
            room.TryJoin("b", "B", 0, 0);
            room.SetConnected("a", false, 10);
            room.Tick(20);
            Assert.True(room.Contains("a"), "still inside the grace window");
            room.Tick(10 + MatchRules.ReconnectGraceSeconds + 0.1);
            Assert.True(!room.Contains("a"), "removed");
            Assert.Equal("b", room.HostId, "host moved on");
        }

        [Test]
        public static void Rematch_KeepsPlayersAndAlternatesStart()
        {
            var output = new CaptureOutput();
            var room = NewRoom(output, new MatchSettings { rounds = 5 });
            room.TryJoin("a", "A", 0, 0);
            room.TryJoin("b", "B", 0, 0);
            room.SetReady("b", true);
            room.StartMatch("a", 0);
            room.Leave("b", 1); // early leave cancels the match
            room.Tick(1.1);
            Assert.Equal(RoomState.PostMatch, room.State, "post match after cancel");
            room.TryJoin("c", "C", 0, 2);
            Assert.True(!room.Contains("c"), "cannot join after the match either");

            Assert.Equal<string>(null, room.ToLobby("a"), "back to lobby");
            Assert.Equal(RoomState.Lobby, room.State, "lobby");
            room.TryJoin("c", "C", 0, 3);
            room.SetReady("c", true);
            room.StartMatch("a", 3);
            Assert.Equal(2, room.MatchesPlayed, "second match");
            room.Tick(3 + MatchRules.IntroSeconds + 0.1);
            int firstStart = room.Engine.ActiveTeam;

            // Finish by having c leave after enough turns to count, then both vote rematch.
            double t = 3;
            for (int i = 0; i < 4000 && room.State == RoomState.InMatch; i++)
            {
                t += 0.25;
                room.Tick(t);
                if (room.Engine.Phase == MatchPhase.Steal)
                {
                    room.SkipSteal(room.Engine.StealTeam == Teams.Red ? "a" : "c", t);
                }
            }
            Assert.Equal(RoomState.PostMatch, room.State, "match finished");
            room.Rematch("a", t);
            Assert.Equal(RoomState.PostMatch, room.State, "waiting for c");
            Assert.Equal(1, room.BuildRoomSnapshot(t).rematchVotes.Length, "one vote");
            room.Rematch("c", t);
            Assert.Equal(RoomState.InMatch, room.State, "rematch started");
            room.Tick(t + 5);
            Assert.Equal(Teams.Other(firstStart), room.Engine.ActiveTeam, "the other team starts the rematch");
        }

        [Test]
        public static void Flush_SendsTeamSpecificSnapshots()
        {
            var output = new CaptureOutput();
            var room = NewRoom(output);
            room.TryJoin("a", "A", 0, 0);
            room.TryJoin("b", "B", 0, 0);
            room.SetReady("b", true);
            room.StartMatch("a", 0);
            room.Flush(0);
            Assert.True(output.Last<RoomSnapshot>("a", Msg.Room) != null, "room snapshot sent");
            Assert.True(output.Last<MatchSnapshot>("a", Msg.Match) != null, "match snapshot sent to a");
            Assert.True(output.Last<MatchSnapshot>("b", Msg.Match) != null, "match snapshot sent to b");
        }
    }
}

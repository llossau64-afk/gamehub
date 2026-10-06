using System.Collections.Generic;
using GuessTheAnswer.Shared;

namespace GuessTheAnswer.Tests
{
    /// <summary>Drives a MatchEngine with a simulated clock.</summary>
    public sealed class Sim
    {
        public double T = 100;
        public readonly MatchEngine E;
        public readonly List<MatchParticipant> Players = new List<MatchParticipant>();

        public Sim(int perTeam, MatchSettings settings = null, ulong seed = 7, bool blueBots = false)
        {
            Players.Add(new MatchParticipant("r1", "Red One", Teams.Red));
            Players.Add(new MatchParticipant("b1", "Blue One", Teams.Blue, blueBots));
            if (perTeam > 1)
            {
                Players.Add(new MatchParticipant("r2", "Red Two", Teams.Red));
                Players.Add(new MatchParticipant("b2", "Blue Two", Teams.Blue, blueBots));
            }
            E = new MatchEngine(settings ?? new MatchSettings(), Players, TestData.Bank, new XorShiftRandom(seed));
            E.Start(T);
        }

        public MatchSnapshot Snap(int team = Teams.Red) => E.BuildSnapshot(team, T);

        public void Run(double seconds)
        {
            double end = T + seconds;
            while (T < end)
            {
                T += 0.05;
                E.Tick(T);
            }
        }

        public void RunUntil(MatchPhase phase, double max = 120)
        {
            double end = T + max;
            while (E.Phase != phase)
            {
                Assert.True(T < end, "Timed out waiting for phase " + phase + " (now " + E.Phase + ")");
                T += 0.05;
                E.Tick(T);
            }
        }

        public void AnswerCorrect()
        {
            RunUntil(MatchPhase.Question);
            var s = Snap(E.ActivePlayer.Team);
            Assert.Equal<string>(null, E.SubmitAnswer(E.ActivePlayer.Id, TestData.CorrectIndex(s), T), "answer accepted");
        }

        public void AnswerWrong()
        {
            RunUntil(MatchPhase.Question);
            var s = Snap(E.ActivePlayer.Team);
            Assert.Equal<string>(null, E.SubmitAnswer(E.ActivePlayer.Id, TestData.WrongIndex(s), T), "answer accepted");
        }
    }

    public static class MatchEngineTests
    {
        [Test]
        public static void TurnOrder_2v2_AlternatesTeamsAndTeammates()
        {
            var sim = new Sim(2);
            var order = new List<string>();
            for (int i = 0; i < 6; i++)
            {
                sim.RunUntil(MatchPhase.Question);
                order.Add(sim.E.ActivePlayer.Id);
                sim.AnswerCorrect();
            }
            Assert.Equal("r1,b1,r2,b2,r1,b1", string.Join(",", order), "turn order");
        }

        [Test]
        public static void Scoring_BaseSpeedNoJokerAndStreak()
        {
            var sim = new Sim(1);
            sim.AnswerCorrect();            // red 1: 100 + 25 + 10
            sim.RunUntil(MatchPhase.Reveal);
            Assert.Equal(135, sim.E.TeamScore(Teams.Red), "first correct answer");
            sim.AnswerCorrect();            // blue
            sim.AnswerCorrect();            // red 2
            sim.AnswerCorrect();            // blue
            sim.AnswerCorrect();            // red 3 → +50 streak
            sim.RunUntil(MatchPhase.Reveal);
            Assert.Equal(135 * 3 + 50, sim.E.TeamScore(Teams.Red), "three in a row");
            var result = sim.Snap().result;
            Assert.True(result.correct && result.total == 185, "result lines add up");
        }

        [Test]
        public static void Scoring_SlowAnswerHasNoSpeedBonus()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            sim.Run(6.0);
            var s = sim.Snap();
            sim.E.SubmitAnswer("r1", TestData.CorrectIndex(s), sim.T);
            sim.RunUntil(MatchPhase.Reveal);
            Assert.Equal(110, sim.E.TeamScore(Teams.Red), "100 + no joker");
        }

        [Test]
        public static void Snapshot_HidesQuestionAndAnswerUntilAllowed()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.TurnIntro);
            var intro = sim.Snap();
            Assert.True(string.IsNullOrEmpty(intro.question.text) && intro.question.answers.Length == 0, "no text during intro");
            Assert.True(!string.IsNullOrEmpty(intro.question.category), "category visible during intro");
            sim.RunUntil(MatchPhase.Question);
            var q = sim.Snap();
            Assert.True(q.question.answers.Length == 4 && q.question.correctIndex == -1, "answer hidden while answering");
            sim.E.SubmitAnswer("r1", 0, sim.T);
            Assert.Equal(-1, sim.Snap().question.correctIndex, "hidden while locked");
            sim.RunUntil(MatchPhase.Reveal);
            if (!sim.E.StealPending) Assert.True(sim.Snap().question.correctIndex >= 0, "revealed");
        }

        [Test]
        public static void Answer_OnlyActivePlayerCanAnswerOnce()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.SubmitAnswer("b1", 0, sim.T), "opponent cannot answer");
            Assert.Equal<string>(null, sim.E.SubmitAnswer("r1", 0, sim.T), "active player answers");
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.SubmitAnswer("r1", 1, sim.T), "no double answer");
        }

        [Test]
        public static void Timeout_OffersSteal_AndCorrectStealScores75()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            sim.RunUntil(MatchPhase.Reveal);
            var reveal = sim.Snap();
            Assert.Equal((int)ResultKind.Timeout, reveal.result.kind, "timeout result");
            Assert.True(reveal.steal.pending && reveal.question.correctIndex == -1, "steal pending hides the answer");
            sim.RunUntil(MatchPhase.Steal);
            var s = sim.Snap(Teams.Blue);
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.SubmitSteal("r1", 0, sim.T), "own team cannot steal");
            Assert.Equal<string>(null, sim.E.SubmitSteal("b1", TestData.CorrectIndex(s), sim.T), "steal accepted");
            Assert.Equal(MatchRules.StealPoints, sim.E.TeamScore(Teams.Blue), "steal points");
            Assert.True(sim.E.JokerUsed(Teams.Blue, JokerType.Steal), "steal used");
            Assert.True(sim.Snap().question.correctIndex >= 0, "answer revealed after steal");

            // Blue's turn; red still has its steal. Then red's turn: blue has none left.
            sim.AnswerCorrect();
            sim.AnswerWrong();
            sim.RunUntil(MatchPhase.Reveal);
            Assert.True(!sim.Snap().steal.pending, "no second steal for blue");
        }

        [Test]
        public static void Steal_SkipKeepsJoker()
        {
            var sim = new Sim(1);
            sim.AnswerWrong();
            sim.RunUntil(MatchPhase.Steal);
            Assert.Equal<string>(null, sim.E.SkipSteal("b1", sim.T), "skip");
            Assert.True(!sim.E.JokerUsed(Teams.Blue, JokerType.Steal), "steal still available");
            Assert.Equal(MatchPhase.StealReveal, sim.E.Phase, "reveal after skip");
        }

        [Test]
        public static void Steal_CannotPickTheWrongAnswerAgain()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            var s = sim.Snap();
            int wrong = TestData.WrongIndex(s);
            sim.E.SubmitAnswer("r1", wrong, sim.T);
            sim.RunUntil(MatchPhase.Steal);
            Assert.True(sim.Snap(Teams.Blue).steal.blocked[wrong], "blocked in view");
            Assert.Equal(ErrorCodes.BadRequest, sim.E.SubmitSteal("b1", wrong, sim.T), "blocked answer rejected");
        }

        [Test]
        public static void Jokers_FiftyFiftyExtraTimeAndOnePerQuestion()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            var before = sim.Snap();
            Assert.Equal<string>(null, sim.E.UseJoker("r1", JokerType.FiftyFifty, sim.T), "50/50");
            var after = sim.Snap();
            int removed = 0;
            for (int i = 0; i < 4; i++) if (after.question.removed[i]) removed++;
            Assert.Equal(2, removed, "two answers removed");
            Assert.True(!after.question.removed[TestData.CorrectIndex(after)], "correct answer kept");
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.UseJoker("r1", JokerType.ExtraTime, sim.T), "one joker per question");
            Assert.Equal(ErrorCodes.BadRequest, sim.E.SubmitAnswer("r1", System.Array.IndexOf(after.question.removed, true), sim.T), "removed answer rejected");
            sim.AnswerCorrectAfterJoker();
            sim.RunUntil(MatchPhase.Reveal);
            Assert.Equal(125, sim.E.TeamScore(Teams.Red), "no NO-JOKER bonus");

            sim.AnswerCorrect(); // blue
            sim.RunUntil(MatchPhase.Question);
            float remaining = sim.Snap().phaseRemaining;
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.UseJoker("r1", JokerType.FiftyFifty, sim.T), "50/50 used up");
            Assert.Equal<string>(null, sim.E.UseJoker("r1", JokerType.ExtraTime, sim.T), "extra time");
            Assert.True(sim.Snap().phaseRemaining > remaining + 7.9f, "8 seconds added");
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.UseJoker("r1", JokerType.TeamVote, sim.T), "no team vote in 1v1");
            Assert.True(before.teams[0].jokerEnabled[(int)JokerType.TeamVote] == false, "team vote disabled in 1v1");
        }

        static void AnswerCorrectAfterJoker(this Sim sim)
        {
            var s = sim.Snap();
            Assert.Equal<string>(null, sim.E.SubmitAnswer("r1", TestData.CorrectIndex(s), sim.T), "answer");
        }

        [Test]
        public static void TeamVote_SuggestionOnlyVisibleToTeam()
        {
            var sim = new Sim(2);
            sim.RunUntil(MatchPhase.Question);
            Assert.Equal<string>(null, sim.E.UseJoker("r1", JokerType.TeamVote, sim.T), "team vote");
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.SubmitTeamVote("b1", 0, sim.T), "opponent cannot vote");
            var s = sim.Snap();
            Assert.Equal("r2", s.teamVote.responderId, "teammate responds");
            Assert.Equal<string>(null, sim.E.SubmitTeamVote("r2", 2, sim.T), "vote");
            Assert.Equal(2, sim.Snap(Teams.Red).teamVote.suggestion, "own team sees vote");
            Assert.Equal(-1, sim.Snap(Teams.Blue).teamVote.suggestion, "opponents do not");
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.SubmitTeamVote("r2", 1, sim.T), "single vote");
        }

        [Test]
        public static void Questions_DoNotRepeatInAMatch()
        {
            var sim = new Sim(1, new MatchSettings { rounds = 15, category = "sports", difficulty = (int)Difficulty.Hard });
            var seen = new HashSet<string>();
            for (int i = 0; i < 30; i++)
            {
                sim.RunUntil(MatchPhase.Question);
                Assert.True(seen.Add(sim.Snap().question.id), "question repeated: " + sim.Snap().question.id);
                Assert.Equal("sports", sim.Snap().question.category, "category respected");
                sim.AnswerCorrect();
            }
            // Both teams were perfect, so the scores are level and a tie breaker follows, also with a new question.
            sim.RunUntil(MatchPhase.TieBreakQuestion);
            Assert.True(seen.Add(sim.Snap().question.id), "tie-break question repeated");
        }

        [Test]
        public static void TieBreak_FirstCorrectAnswerWins()
        {
            var sim = new Sim(1, new MatchSettings { rounds = 5 });
            for (int turn = 0; turn < 10; turn++)
            {
                sim.RunUntil(MatchPhase.Question);
                sim.RunUntil(MatchPhase.Reveal); // timeout
                if (sim.E.StealPending)
                {
                    sim.RunUntil(MatchPhase.Steal);
                    sim.E.SkipSteal(sim.E.StealTeam == Teams.Red ? "r1" : "b1", sim.T);
                }
            }
            sim.RunUntil(MatchPhase.TieBreakIntro);
            Assert.Equal(0, sim.E.TeamScore(Teams.Red), "tied at zero");
            sim.RunUntil(MatchPhase.TieBreakQuestion);
            var s = sim.Snap();
            Assert.Equal<string>(null, sim.E.SubmitAnswer("r1", TestData.WrongIndex(s), sim.T), "red wrong");
            Assert.Equal(ErrorCodes.NotAllowed, sim.E.SubmitAnswer("r1", TestData.CorrectIndex(s), sim.T), "one try each");
            Assert.Equal(9, sim.Snap(Teams.Blue).players[0].tieBreakPick, "opponents only see that red answered");
            Assert.Equal<string>(null, sim.E.SubmitAnswer("b1", TestData.CorrectIndex(s), sim.T), "blue correct");
            sim.RunUntil(MatchPhase.Finished);
            var end = sim.Snap().end;
            Assert.Equal(Teams.Blue, end.winnerTeam, "blue wins");
            Assert.Equal((int)MatchEndReason.TieBreak, end.reason, "tie break reason");
            Assert.Equal(MatchRules.TieBreakPoints, end.stats[Teams.Blue].score, "tie break points");
        }

        [Test]
        public static void TieBreak_BothWrongAsksAnotherQuestion()
        {
            var sim = new Sim(1, new MatchSettings { rounds = 5 });
            for (int turn = 0; turn < 10; turn++)
            {
                sim.RunUntil(MatchPhase.Question);
                sim.RunUntil(MatchPhase.Reveal);
                if (sim.E.StealPending)
                {
                    sim.RunUntil(MatchPhase.Steal);
                    sim.E.SkipSteal(sim.E.StealTeam == Teams.Red ? "r1" : "b1", sim.T);
                }
            }
            sim.RunUntil(MatchPhase.TieBreakQuestion);
            string first = sim.Snap().question.id;
            var s = sim.Snap();
            sim.E.SubmitAnswer("r1", TestData.WrongIndex(s), sim.T);
            sim.E.SubmitAnswer("b1", TestData.WrongIndex(s), sim.T);
            Assert.Equal(MatchPhase.TieBreakReveal, sim.E.Phase, "both wrong resolves at once");
            sim.RunUntil(MatchPhase.TieBreakQuestion);
            Assert.True(sim.Snap().question.id != first, "a new question");
        }

        [Test]
        public static void Disconnect_ActivePlayerPausesAndResumes()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            sim.Run(2);
            sim.E.SetConnected("r1", false, sim.T);
            sim.Run(0.2);
            var paused = sim.Snap();
            Assert.True(paused.paused && paused.pausedForPlayerId == "r1", "paused for r1");
            sim.Run(8);
            Assert.True(System.Math.Abs(sim.Snap().phaseRemaining - paused.phaseRemaining) < 0.01f, "clock frozen");
            Assert.Equal(MatchPhase.Question, sim.E.Phase, "still the same question");
            sim.E.SetConnected("r1", true, sim.T);
            sim.Run(0.2);
            Assert.True(!sim.Snap().paused, "resumed");
            Assert.True(sim.Snap().phaseRemaining < paused.phaseRemaining, "clock runs again");
        }

        [Test]
        public static void Disconnect_1v1NoReturnIsForfeitAfterPlay()
        {
            var sim = new Sim(1);
            sim.AnswerCorrect();
            sim.AnswerCorrect();
            sim.AnswerCorrect();
            sim.E.SetConnected("b1", false, sim.T);
            sim.Run(MatchRules.ReconnectGraceSeconds + 0.5);
            Assert.Equal(MatchPhase.Finished, sim.E.Phase, "match over");
            var end = sim.Snap().end;
            Assert.Equal((int)MatchEndReason.Forfeit, end.reason, "forfeit");
            Assert.Equal(Teams.Red, end.winnerTeam, "red wins");
        }

        [Test]
        public static void Disconnect_1v1EarlyLeaveCancels()
        {
            var sim = new Sim(1);
            sim.RunUntil(MatchPhase.Question);
            sim.E.RemovePlayer("b1", sim.T);
            Assert.Equal(MatchPhase.Finished, sim.E.Phase, "match over");
            Assert.Equal((int)MatchEndReason.Cancelled, sim.Snap().end.reason, "cancelled");
        }

        [Test]
        public static void Disconnect_2v2TeammateTakesOver()
        {
            var sim = new Sim(2);
            sim.RunUntil(MatchPhase.Question);
            Assert.Equal("r1", sim.E.ActivePlayer.Id, "r1 starts");
            sim.E.SetConnected("r1", false, sim.T);
            sim.Run(MatchRules.ReconnectGraceSeconds + 0.5);
            Assert.Equal(MatchPhase.Question, sim.E.Phase, "match continues");
            Assert.Equal("r2", sim.E.ActivePlayer.Id, "teammate answers");
            Assert.True(!sim.Snap().paused, "not paused any more");
            sim.AnswerCorrect();
            sim.AnswerCorrect(); // blue
            sim.RunUntil(MatchPhase.Question);
            Assert.Equal("r2", sim.E.ActivePlayer.Id, "r2 answers every red turn now");
        }

        [Test]
        public static void Bots_PlayAFullMatch()
        {
            var sim = new Sim(1, new MatchSettings { rounds = 5 }, seed: 99, blueBots: true);
            double limit = sim.T + 600;
            while (!sim.E.IsFinished)
            {
                Assert.True(sim.T < limit, "match did not end");
                sim.Run(0.05);
                var s = sim.Snap();
                if (sim.E.Phase == MatchPhase.Question && sim.E.ActivePlayer.Id == "r1")
                    sim.E.SubmitAnswer("r1", TestData.CorrectIndex(s), sim.T);
                else if (sim.E.Phase == MatchPhase.Steal && sim.E.StealTeam == Teams.Red)
                    sim.E.SkipSteal("r1", sim.T);
                else if (sim.E.Phase == MatchPhase.TieBreakQuestion && s.players[0].tieBreakPick < 0)
                    sim.E.SubmitAnswer("r1", TestData.CorrectIndex(s), sim.T);
            }
            var end = sim.Snap().end;
            Assert.Equal(Teams.Red, end.winnerTeam, "perfect human wins");
            Assert.Equal(5, end.stats[Teams.Blue].answered, "bot answered every turn");
        }
    }
}

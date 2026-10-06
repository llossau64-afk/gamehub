using System;
using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// Plans and performs the actions of bot players with human-like delays and accuracy.
    /// Bots go through the same commands as people, so they can never break a rule.
    /// </summary>
    internal sealed class BotBrain
    {
        enum ActionKind { Answer, Joker, TeamVote, Steal, SkipSteal }

        struct Plan
        {
            public double At;
            public MatchParticipant Bot;
            public ActionKind Kind;
            public JokerType Joker;
        }

        readonly IRandom rng;
        readonly List<Plan> plans = new List<Plan>(4);

        public BotBrain(IRandom rng)
        {
            this.rng = rng;
        }

        public void OnPhase(MatchEngine e, double now)
        {
            plans.Clear();
            switch (e.Phase)
            {
                case MatchPhase.Question:
                    PlanQuestion(e, now);
                    break;
                case MatchPhase.Steal:
                    PlanSteal(e, now);
                    break;
                case MatchPhase.TieBreakQuestion:
                    PlanTieBreak(e, now);
                    break;
            }
        }

        public void OnJoker(MatchEngine e, JokerType joker, double now)
        {
            if (joker == JokerType.TeamVote && e.VoteResponder != null && e.VoteResponder.IsBot)
            {
                plans.Add(new Plan { At = now + rng.Range(1.0, 2.6), Bot = e.VoteResponder, Kind = ActionKind.TeamVote });
            }
        }

        void PlanQuestion(MatchEngine e, double now)
        {
            var bot = e.ActivePlayer;
            if (bot == null || !bot.IsBot) return;
            double window = Math.Max(3.0, e.Settings.answerTime * 0.6);
            double answerAt = now + rng.Range(1.8, Math.Min(window, 8.5));

            var q = e.CurrentQuestion;
            bool hard = q != null && q.Data.Level >= Difficulty.Hard;
            if (!e.JokerUsed(bot.Team, JokerType.FiftyFifty) && rng.NextDouble() < (hard ? 0.3 : 0.08))
            {
                plans.Add(new Plan { At = now + rng.Range(0.9, 1.5), Bot = bot, Kind = ActionKind.Joker, Joker = JokerType.FiftyFifty });
                answerAt += 1.0;
            }
            plans.Add(new Plan { At = answerAt, Bot = bot, Kind = ActionKind.Answer });
        }

        void PlanSteal(MatchEngine e, double now)
        {
            // Bots only decide for a team without people; a human teammate always gets the choice.
            MatchParticipant bot = null;
            foreach (var p in e.Participants)
            {
                if (p.Team != e.StealTeam || !p.CanAct) continue;
                if (!p.IsBot) return;
                if (bot == null) bot = p;
            }
            if (bot == null) return;
            if (rng.NextDouble() < 0.65) plans.Add(new Plan { At = now + rng.Range(1.2, 3.2), Bot = bot, Kind = ActionKind.Steal });
            else plans.Add(new Plan { At = now + rng.Range(0.8, 1.8), Bot = bot, Kind = ActionKind.SkipSteal });
        }

        void PlanTieBreak(MatchEngine e, double now)
        {
            double latest = Math.Max(3.0, Math.Min(e.Settings.answerTime - 1.0, 9.0));
            foreach (var p in e.Participants)
            {
                if (p.IsBot && p.IsAlive) plans.Add(new Plan { At = now + rng.Range(2.5, latest), Bot = p, Kind = ActionKind.Answer });
            }
        }

        public void Tick(MatchEngine e, double now)
        {
            // Executing a plan can change the phase, which replaces the plan list, so take one due plan at a time.
            for (int guard = 0; guard < 8; guard++)
            {
                int due = -1;
                for (int i = 0; i < plans.Count; i++)
                {
                    if (plans[i].At <= now) { due = i; break; }
                }
                if (due < 0) return;
                var plan = plans[due];
                plans.RemoveAt(due);
                Execute(e, plan, now);
            }
        }

        void Execute(MatchEngine e, Plan plan, double now)
        {
            var q = e.CurrentQuestion;
            if (q == null || !plan.Bot.CanAct) return;
            switch (plan.Kind)
            {
                case ActionKind.Joker:
                    e.UseJoker(plan.Bot.Id, plan.Joker, now);
                    break;
                case ActionKind.Answer:
                    e.SubmitAnswer(plan.Bot.Id, Choose(q, plan.Bot, -1, false, e), now);
                    break;
                case ActionKind.TeamVote:
                    e.SubmitTeamVote(plan.Bot.Id, Choose(q, plan.Bot, -1, false, e), now);
                    break;
                case ActionKind.Steal:
                    e.SubmitSteal(plan.Bot.Id, Choose(q, plan.Bot, e.LockedIndex, true, e), now);
                    break;
                case ActionKind.SkipSteal:
                    e.SkipSteal(plan.Bot.Id, now);
                    break;
            }
        }

        int Choose(ActiveQuestion q, MatchParticipant bot, int exclude, bool steal, MatchEngine e)
        {
            double know;
            switch (q.Data.Level)
            {
                case Difficulty.Easy: know = 0.85; break;
                case Difficulty.Hard: know = 0.55; break;
                case Difficulty.Expert: know = 0.45; break;
                default: know = 0.7; break;
            }
            know = Math.Min(0.97, know * bot.BotSkill + (steal ? 0.1 : 0.0));

            var options = new List<int>(4);
            for (int i = 0; i < QuestionBank.AnswerCount; i++)
            {
                if (q.Removed[i] || i == exclude) continue;
                if (steal && e.IsStealBlocked(i)) continue;
                if (bot.TieBreakWrong && i == bot.TieBreakPick) continue;
                options.Add(i);
            }
            if (options.Count == 0) return q.CorrectIndex;
            if (options.Contains(q.CorrectIndex) && rng.NextDouble() < know) return q.CorrectIndex;

            var wrong = new List<int>(options.Count);
            foreach (int i in options) if (i != q.CorrectIndex) wrong.Add(i);
            if (wrong.Count == 0) return q.CorrectIndex;
            return wrong[rng.Next(wrong.Count)];
        }
    }
}

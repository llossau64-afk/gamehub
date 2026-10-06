using System;

namespace GuessTheAnswer.Shared
{
    public sealed partial class MatchEngine
    {
        /// <summary>Is the correct answer public in the current phase?</summary>
        bool CorrectRevealed()
        {
            switch (Phase)
            {
                case MatchPhase.Reveal: return !stealPending;
                case MatchPhase.StealReveal:
                case MatchPhase.TieBreakReveal:
                case MatchPhase.Finished:
                    return true;
                default:
                    return false;
            }
        }

        bool QuestionTextVisible()
        {
            switch (Phase)
            {
                case MatchPhase.Question:
                case MatchPhase.Locked:
                case MatchPhase.Reveal:
                case MatchPhase.Steal:
                case MatchPhase.StealReveal:
                case MatchPhase.TieBreakQuestion:
                case MatchPhase.TieBreakReveal:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>Builds the view for one team (Teams.None for a neutral observer). Secrets of the other team stay hidden.</summary>
        public MatchSnapshot BuildSnapshot(int viewerTeam, double now)
        {
            var s = new MatchSnapshot
            {
                phase = (int)Phase,
                phaseSeq = phaseSeq,
                phaseDuration = Phase == MatchPhase.Finished ? 0f : (float)phaseDuration,
                phaseRemaining = Phase == MatchPhase.Finished ? 0f : (float)Math.Max(0, paused ? pausedRemaining : phaseEnd - now),
                paused = paused,
                pausedForPlayerId = pausedFor,
                round = Round,
                totalRounds = settings.rounds,
                turn = turn,
                totalTurns = totalTurns,
                activeTeam = activeTeam,
                activePlayerId = activePlayer != null ? activePlayer.Id : null,
                tieBreakNumber = tieBreakNumber,
                lockedIndex = Phase == MatchPhase.Question ? -1 : lockedIndex,
                jokerThisTurn = jokerThisTurn,
                result = lastResult,
                end = end,
            };

            bool revealed = CorrectRevealed();

            var qv = new QuestionView();
            if (question != null)
            {
                qv.id = question.Data.id;
                qv.category = question.Data.category;
                qv.difficulty = (int)question.Data.Level;
                if (QuestionTextVisible() || Phase == MatchPhase.Finished)
                {
                    qv.text = question.Data.questionText;
                    qv.answers = question.DisplayAnswers();
                    qv.image = question.Data.optionalImage;
                }
                qv.removed = (bool[])question.Removed.Clone();
                qv.correctIndex = revealed ? question.CorrectIndex : -1;
                qv.explanation = revealed ? question.Data.optionalExplanation : null;
            }
            s.question = qv;

            s.teams = new TeamView[2];
            for (int t = 0; t < 2; t++)
            {
                var team = teams[t];
                s.teams[t] = new TeamView
                {
                    team = t,
                    score = team.Score,
                    streak = team.Streak,
                    jokerUsed = (bool[])team.JokerUsed.Clone(),
                    jokerEnabled = (bool[])team.JokerEnabled.Clone(),
                    correct = team.Correct,
                    answered = team.Answered,
                };
            }

            bool tieRevealed = Phase == MatchPhase.TieBreakReveal || Phase == MatchPhase.Finished;
            s.players = new MatchPlayerView[participants.Count];
            for (int i = 0; i < participants.Count; i++)
            {
                var p = participants[i];
                bool ownTeam = viewerTeam == p.Team;
                int pick = p.TieBreakPick;
                if (pick >= 0 && !ownTeam && !tieRevealed) pick = 9; // opponents only learn that the player answered
                s.players[i] = new MatchPlayerView
                {
                    id = p.Id,
                    name = p.Name,
                    avatar = p.Avatar,
                    team = p.Team,
                    isBot = p.IsBot,
                    connected = p.Connected || p.IsBot,
                    dropped = p.Dropped,
                    reconnectRemaining = ReconnectRemaining(p, now),
                    tieBreakPick = pick,
                    tieBreakWrong = p.TieBreakWrong && (ownTeam || tieRevealed),
                };
            }

            var vote = new TeamVoteView { requested = voteRequested };
            if (voteRequested && viewerTeam == activeTeam)
            {
                vote.responderId = voteResponder != null ? voteResponder.Id : null;
                vote.suggestion = voteSuggestion;
            }
            s.teamVote = vote;

            var steal = new StealView
            {
                team = stealTeam,
                pending = stealPending || Phase == MatchPhase.Steal,
                stealerId = stealer != null ? stealer.Id : null,
                picked = stealPick,
                blocked = new bool[QuestionBank.AnswerCount],
            };
            for (int i = 0; i < QuestionBank.AnswerCount; i++) steal.blocked[i] = IsStealBlocked(i);
            s.steal = steal;

            return s;
        }
    }
}

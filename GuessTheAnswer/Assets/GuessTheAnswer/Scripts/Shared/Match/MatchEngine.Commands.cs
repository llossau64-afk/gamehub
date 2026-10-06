namespace GuessTheAnswer.Shared
{
    // Player commands. Every command validates who sent it and whether it is legal in the current phase, and returns
    // null on success or an ErrorCodes value. Clients only send intents; nothing they claim about scores is trusted.
    public sealed partial class MatchEngine
    {
        public string SubmitAnswer(string playerId, int index, double now)
        {
            var p = Find(playerId);
            if (p == null || p.Dropped) return ErrorCodes.NotAllowed;

            if (Phase == MatchPhase.TieBreakQuestion) return SubmitTieBreak(p, index, now);
            if (Phase == MatchPhase.Steal) return SubmitSteal(playerId, index, now);

            if (Phase != MatchPhase.Question || paused) return ErrorCodes.NotAllowed;
            if (p != activePlayer) return ErrorCodes.NotAllowed;
            if (question == null || !question.IsSelectable(index)) return ErrorCodes.BadRequest;
            if (now > phaseEnd + MatchRules.AnswerLatencyGrace) return ErrorCodes.NotAllowed;

            lockedIndex = index;
            answerElapsed = (now - phaseStart) - pausedAccum;
            if (answerElapsed < 0) answerElapsed = 0;
            SetPhase(MatchPhase.Locked, MatchRules.LockedSeconds, now);
            return null;
        }

        public string UseJoker(string playerId, JokerType joker, double now)
        {
            var p = Find(playerId);
            if (p == null || !p.CanAct) return ErrorCodes.NotAllowed;
            if (joker == JokerType.Steal) return ErrorCodes.NotAllowed; // Steal is offered automatically after a wrong answer.
            if (Phase != MatchPhase.Question || paused || p != activePlayer) return ErrorCodes.NotAllowed;

            var team = teams[p.Team];
            int j = (int)joker;
            if (j < 0 || j >= JokerTypes.Count || !team.JokerEnabled[j] || team.JokerUsed[j]) return ErrorCodes.NotAllowed;
            // One joker per question, so they cannot be stacked.
            if (jokerThisTurn >= 0) return ErrorCodes.NotAllowed;

            switch (joker)
            {
                case JokerType.FiftyFifty:
                    question.RemoveTwoWrong(rng);
                    break;
                case JokerType.ExtraTime:
                    phaseEnd += MatchRules.ExtraTimeSeconds;
                    phaseDuration += MatchRules.ExtraTimeSeconds;
                    break;
                case JokerType.TeamVote:
                    {
                        var mate = team.TeammateOf(p);
                        if (mate == null) return ErrorCodes.NotAllowed;
                        voteRequested = true;
                        voteResponder = mate;
                        voteSuggestion = -1;
                        break;
                    }
            }

            team.JokerUsed[j] = true;
            team.JokersUsed++;
            jokerThisTurn = j;
            Dirty = true;
            bots.OnJoker(this, joker, now);
            return null;
        }

        public string SubmitTeamVote(string playerId, int index, double now)
        {
            var p = Find(playerId);
            if (p == null || !p.CanAct) return ErrorCodes.NotAllowed;
            if (Phase != MatchPhase.Question || !voteRequested || voteResponder != p || voteSuggestion >= 0) return ErrorCodes.NotAllowed;
            if (question == null || !question.IsSelectable(index)) return ErrorCodes.BadRequest;
            voteSuggestion = index;
            Dirty = true;
            return null;
        }

        public string SubmitSteal(string playerId, int index, double now)
        {
            var p = Find(playerId);
            if (p == null || !p.CanAct) return ErrorCodes.NotAllowed;
            if (Phase != MatchPhase.Steal || p.Team != stealTeam) return ErrorCodes.NotAllowed;
            if (IsStealBlocked(index)) return ErrorCodes.BadRequest;
            if (now > phaseEnd + MatchRules.AnswerLatencyGrace) return ErrorCodes.NotAllowed;
            ResolveSteal(p, index, now);
            return null;
        }

        public string SkipSteal(string playerId, double now)
        {
            var p = Find(playerId);
            if (p == null || !p.CanAct) return ErrorCodes.NotAllowed;
            if (Phase != MatchPhase.Steal || p.Team != stealTeam) return ErrorCodes.NotAllowed;
            ResolveSteal(null, -1, now);
            return null;
        }

        string SubmitTieBreak(MatchParticipant p, int index, double now)
        {
            if (!p.CanAct || paused) return ErrorCodes.NotAllowed;
            if (p.TieBreakPick >= 0 || tieBreakWinner != Teams.None) return ErrorCodes.NotAllowed;
            if (question == null || !question.IsSelectable(index)) return ErrorCodes.BadRequest;
            if (now > phaseEnd + MatchRules.AnswerLatencyGrace) return ErrorCodes.NotAllowed;

            p.TieBreakPick = index;
            Dirty = true;
            if (index == question.CorrectIndex)
            {
                // First correct answer wins the tie breaker immediately.
                tieBreakWinner = p.Team;
                tieBreakWinnerPlayer = p;
                ResolveTieBreak(now);
                return null;
            }

            p.TieBreakWrong = true;
            CheckTieBreakAllAnswered(now);
            return null;
        }

        void CheckTieBreakAllAnswered(double now)
        {
            if (Phase != MatchPhase.TieBreakQuestion || tieBreakWinner != Teams.None) return;
            foreach (var m in participants)
            {
                if (m.IsAlive && m.TieBreakPick < 0) return;
            }
            ResolveTieBreak(now);
        }
    }
}

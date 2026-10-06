using System;
using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>
    /// The authoritative rules of one match: turn order, questions, timer, scoring, jokers, steal, tie breaker and
    /// disconnects. It is a plain state machine driven by <see cref="Tick"/> and player commands, with time passed in
    /// as seconds, so it runs unchanged on the game server and in the offline practice mode.
    /// </summary>
    public sealed partial class MatchEngine
    {
        /// <summary>After this many tie-break questions without a winner the match ends on correct answers, then as a draw.</summary>
        public const int MaxTieBreaks = 7;

        readonly MatchSettings settings;
        readonly QuestionDeck deck;
        readonly IRandom rng;
        readonly List<MatchParticipant> participants;
        readonly TeamState[] teams = { new TeamState(Teams.Red), new TeamState(Teams.Blue) };
        readonly BotBrain bots;
        readonly int startTeam;

        public MatchPhase Phase { get; private set; } = MatchPhase.None;
        public bool Dirty { get; set; }
        public bool IsFinished => Phase == MatchPhase.Finished;
        public MatchSettings Settings => settings;
        public IReadOnlyList<MatchParticipant> Participants => participants;

        int phaseSeq;
        double phaseStart;
        double phaseEnd;
        double phaseDuration;
        bool paused;
        double pauseStartedAt;
        double pausedRemaining;
        double pausedAccum;
        string pausedFor;

        int turn;
        readonly int totalTurns;
        int activeTeam = Teams.None;
        MatchParticipant activePlayer;
        ActiveQuestion question;

        int lockedIndex = -1;
        double answerElapsed;
        int jokerThisTurn = -1;

        bool voteRequested;
        MatchParticipant voteResponder;
        int voteSuggestion = -1;

        bool stealPending;
        int stealTeam = Teams.None;
        MatchParticipant stealer;
        int stealPick = -1;

        int tieBreakNumber;
        int tieBreakWinner = Teams.None;
        MatchParticipant tieBreakWinnerPlayer;

        ResultView lastResult = new ResultView();
        int resultSeq;

        MatchEndView end = new MatchEndView();

        public MatchEngine(MatchSettings settings, IList<MatchParticipant> players, QuestionBank bank, IRandom rng, int startTeam = Teams.Red)
        {
            this.settings = settings.Clone();
            this.settings.Sanitize();
            this.rng = rng;
            this.startTeam = startTeam == Teams.Blue ? Teams.Blue : Teams.Red;
            participants = new List<MatchParticipant>(players);
            foreach (var p in participants)
            {
                int t = p.Team == Teams.Blue ? Teams.Blue : Teams.Red;
                p.Team = t;
                teams[t].Members.Add(p);
            }
            foreach (var team in teams)
            {
                team.JokerEnabled[(int)JokerType.FiftyFifty] = true;
                team.JokerEnabled[(int)JokerType.ExtraTime] = true;
                team.JokerEnabled[(int)JokerType.Steal] = true;
                // TEAM VOTE needs a teammate, so it only exists for teams of two.
                team.JokerEnabled[(int)JokerType.TeamVote] = team.Members.Count >= 2;
            }
            totalTurns = this.settings.rounds * 2;
            deck = new QuestionDeck(bank, this.settings.category, (Difficulty)this.settings.difficulty, rng);
            bots = new BotBrain(rng);
        }

        public static string ValidateTeams(IList<MatchParticipant> players)
        {
            int red = 0, blue = 0;
            foreach (var p in players)
            {
                if (p.Team == Teams.Blue) blue++;
                else red++;
            }
            if (red == 0 || blue == 0) return ErrorCodes.NotEnoughPlayers;
            if (red > MatchRules.MaxPerTeam || blue > MatchRules.MaxPerTeam) return ErrorCodes.TeamsInvalid;
            return null;
        }

        // ───────────────────────── Lifecycle ─────────────────────────

        public void Start(double now)
        {
            if (Phase != MatchPhase.None) return;
            SetPhase(MatchPhase.Intro, MatchRules.IntroSeconds, now);
        }

        public void Tick(double now)
        {
            if (Phase == MatchPhase.None || Phase == MatchPhase.Finished) return;

            UpdateDisconnects(now);
            if (Phase == MatchPhase.Finished) return;

            UpdatePause(now);
            if (paused) return;

            bots.Tick(this, now);

            // A long stall (e.g. a frozen tab in practice mode) could skip several phases; each step restarts at 'now'.
            for (int guard = 0; guard < 8 && !paused && Phase != MatchPhase.Finished; guard++)
            {
                if (now < phaseEnd + GraceFor(Phase)) break;
                AdvancePhase(now);
            }
        }

        static double GraceFor(MatchPhase phase)
        {
            // Inputs that left the client just before zero still count.
            return phase == MatchPhase.Question || phase == MatchPhase.TieBreakQuestion || phase == MatchPhase.Steal
                ? MatchRules.AnswerLatencyGrace
                : 0.0;
        }

        void SetPhase(MatchPhase phase, double duration, double now)
        {
            Phase = phase;
            phaseSeq++;
            phaseStart = now;
            phaseDuration = duration;
            phaseEnd = duration >= double.MaxValue ? double.MaxValue : now + duration;
            pausedAccum = 0;
            paused = false;
            pausedFor = null;
            Dirty = true;
            bots.OnPhase(this, now);
        }

        void AdvancePhase(double now)
        {
            switch (Phase)
            {
                case MatchPhase.Intro:
                    StartTurn(now);
                    break;
                case MatchPhase.TurnIntro:
                    SetPhase(MatchPhase.Question, settings.answerTime, now);
                    break;
                case MatchPhase.Question:
                    ResolveAnswer(-1, true, now);
                    break;
                case MatchPhase.Locked:
                    ResolveAnswer(lockedIndex, false, now);
                    break;
                case MatchPhase.Reveal:
                    if (stealPending) BeginSteal(now);
                    else NextTurn(now);
                    break;
                case MatchPhase.Steal:
                    ResolveSteal(null, -1, now);
                    break;
                case MatchPhase.StealReveal:
                    NextTurn(now);
                    break;
                case MatchPhase.TieBreakIntro:
                    SetPhase(MatchPhase.TieBreakQuestion, settings.answerTime, now);
                    break;
                case MatchPhase.TieBreakQuestion:
                    ResolveTieBreak(now);
                    break;
                case MatchPhase.TieBreakReveal:
                    if (tieBreakWinner != Teams.None) Finish(MatchEndReason.TieBreak, tieBreakWinner, now);
                    else if (tieBreakNumber >= MaxTieBreaks) FinishAfterTieBreakLimit(now);
                    else BeginTieBreak(now);
                    break;
            }
        }

        // ───────────────────────── Turns ─────────────────────────

        public int Round => Math.Min(turn / 2 + 1, settings.rounds);
        public int Turn => turn;
        public int TotalTurns => totalTurns;
        public int ActiveTeam => activeTeam;
        public MatchParticipant ActivePlayer => activePlayer;
        public int TeamScore(int team) => teams[team].Score;
        public bool JokerUsed(int team, JokerType joker) => teams[team].JokerUsed[(int)joker];
        public int StealTeam => stealTeam;
        public bool StealPending => stealPending;
        public int LockedIndex => lockedIndex;
        internal ActiveQuestion CurrentQuestion => question;
        internal bool VoteRequested => voteRequested;
        internal MatchParticipant VoteResponder => voteResponder;
        internal int VoteSuggestion => voteSuggestion;
        internal int JokerThisTurn => jokerThisTurn;
        internal double PhaseStart => phaseStart;
        internal double PhaseEnd => phaseEnd;

        void StartTurn(double now)
        {
            if (turn >= totalTurns)
            {
                EndRegulation(now);
                return;
            }

            activeTeam = (startTeam + turn) % 2;
            activePlayer = teams[activeTeam].NextPlayer();
            if (activePlayer == null)
            {
                // Every player of this team is gone; the disconnect logic normally ends the match before this.
                Finish(MatchEndReason.Forfeit, Teams.Other(activeTeam), now);
                return;
            }

            ResetTurnState();
            question = new ActiveQuestion(deck.Draw(), rng);
            SetPhase(MatchPhase.TurnIntro, MatchRules.TurnIntroSeconds, now);
        }

        void ResetTurnState()
        {
            lockedIndex = -1;
            answerElapsed = 0;
            jokerThisTurn = -1;
            voteRequested = false;
            voteResponder = null;
            voteSuggestion = -1;
            stealPending = false;
            stealTeam = Teams.None;
            stealer = null;
            stealPick = -1;
        }

        void NextTurn(double now)
        {
            turn++;
            StartTurn(now);
        }

        void EndRegulation(double now)
        {
            int red = teams[Teams.Red].Score;
            int blue = teams[Teams.Blue].Score;
            if (red == blue) BeginTieBreak(now);
            else Finish(MatchEndReason.Normal, red > blue ? Teams.Red : Teams.Blue, now);
        }

        // ───────────────────────── Answer resolution ─────────────────────────

        void ResolveAnswer(int picked, bool timedOut, double now)
        {
            var team = teams[activeTeam];
            var player = activePlayer;
            bool correct = !timedOut && question != null && picked == question.CorrectIndex;
            var lines = new List<ScoreLine>(4);
            int total = 0;

            team.Answered++;
            if (player != null) player.Answered++;

            if (correct)
            {
                lines.Add(new ScoreLine { label = "CORRECT", points = MatchRules.BasePoints });
                if (answerElapsed <= MatchRules.SpeedWindowSeconds) lines.Add(new ScoreLine { label = "SPEED", points = MatchRules.SpeedBonus });
                if (jokerThisTurn < 0) lines.Add(new ScoreLine { label = "NO JOKER", points = MatchRules.NoJokerBonus });

                team.Streak++;
                if (team.Streak > team.BestStreak) team.BestStreak = team.Streak;
                int streakBonus = MatchRules.StreakBonusFor(team.Streak);
                if (streakBonus > 0) lines.Add(new ScoreLine { label = team.Streak + " STREAK", points = streakBonus });

                foreach (var l in lines) total += l.points;
                team.Score += total;
                team.Correct++;
                if (team.Fastest < 0 || answerElapsed < team.Fastest) team.Fastest = answerElapsed;
                if (player != null)
                {
                    player.Correct++;
                    player.Points += total;
                    if (player.Fastest < 0 || answerElapsed < player.Fastest) player.Fastest = answerElapsed;
                }
            }
            else
            {
                team.Streak = 0;
            }

            int other = Teams.Other(activeTeam);
            stealPending = !correct && CanSteal(other);
            if (stealPending) stealTeam = other;

            SetResult(timedOut ? ResultKind.Timeout : ResultKind.Answer, activeTeam, player, picked, correct, total, lines, team.Streak);
            SetPhase(MatchPhase.Reveal, stealPending ? MatchRules.RevealBeforeStealSeconds : MatchRules.RevealSeconds, now);
        }

        bool CanSteal(int team)
        {
            var t = teams[team];
            if (!t.JokerEnabled[(int)JokerType.Steal] || t.JokerUsed[(int)JokerType.Steal]) return false;
            if (!t.AnyCanAct) return false;
            return StealOptions() > 0;
        }

        int StealOptions()
        {
            int n = 0;
            for (int i = 0; i < QuestionBank.AnswerCount; i++) if (!IsStealBlocked(i)) n++;
            return n;
        }

        internal bool IsStealBlocked(int index)
        {
            if (question == null || index < 0 || index >= QuestionBank.AnswerCount) return true;
            return question.Removed[index] || index == lockedIndex;
        }

        void BeginSteal(double now)
        {
            stealPending = false;
            SetPhase(MatchPhase.Steal, MatchRules.StealSeconds, now);
        }

        void ResolveSteal(MatchParticipant by, int picked, double now)
        {
            var team = teams[stealTeam];
            var lines = new List<ScoreLine>(1);
            int total = 0;
            bool correct = false;
            ResultKind kind = ResultKind.StealSkipped;

            if (by != null && picked >= 0)
            {
                kind = ResultKind.Steal;
                stealer = by;
                stealPick = picked;
                team.JokerUsed[(int)JokerType.Steal] = true;
                team.JokersUsed++;
                correct = picked == question.CorrectIndex;
                if (correct)
                {
                    total = MatchRules.StealPoints;
                    lines.Add(new ScoreLine { label = "STEAL", points = total });
                    team.Score += total;
                    team.Steals++;
                    by.Points += total;
                }
            }

            SetResult(kind, stealTeam, by, picked, correct, total, lines, team.Streak);
            SetPhase(MatchPhase.StealReveal, MatchRules.StealRevealSeconds, now);
        }

        void SetResult(ResultKind kind, int team, MatchParticipant player, int picked, bool correct, int total, List<ScoreLine> lines, int streak)
        {
            resultSeq++;
            lastResult = new ResultView
            {
                seq = resultSeq,
                kind = (int)kind,
                team = team,
                playerId = player != null ? player.Id : null,
                picked = picked,
                correct = correct,
                total = total,
                lines = lines.ToArray(),
                streak = streak,
            };
        }

        // ───────────────────────── Tie breaker ─────────────────────────

        void BeginTieBreak(double now)
        {
            tieBreakNumber++;
            tieBreakWinner = Teams.None;
            tieBreakWinnerPlayer = null;
            activeTeam = Teams.None;
            activePlayer = null;
            ResetTurnState();
            foreach (var p in participants)
            {
                p.TieBreakPick = -1;
                p.TieBreakWrong = false;
            }
            question = new ActiveQuestion(deck.DrawTieBreak(), rng);
            SetPhase(MatchPhase.TieBreakIntro, tieBreakNumber == 1 ? MatchRules.TieBreakIntroSeconds : MatchRules.TieBreakIntroSeconds - 1.0, now);
        }

        void ResolveTieBreak(double now)
        {
            var lines = new List<ScoreLine>(1);
            if (tieBreakWinner != Teams.None)
            {
                lines.Add(new ScoreLine { label = "TIE BREAKER", points = MatchRules.TieBreakPoints });
                teams[tieBreakWinner].Score += MatchRules.TieBreakPoints;
                teams[tieBreakWinner].Correct++;
                if (tieBreakWinnerPlayer != null)
                {
                    tieBreakWinnerPlayer.Points += MatchRules.TieBreakPoints;
                    tieBreakWinnerPlayer.Correct++;
                }
                SetResult(ResultKind.TieBreak, tieBreakWinner, tieBreakWinnerPlayer, tieBreakWinnerPlayer != null ? tieBreakWinnerPlayer.TieBreakPick : -1,
                    true, MatchRules.TieBreakPoints, lines, 0);
            }
            else
            {
                SetResult(ResultKind.TieBreakNoWinner, Teams.None, null, -1, false, 0, lines, 0);
            }
            SetPhase(MatchPhase.TieBreakReveal, MatchRules.TieBreakRevealSeconds, now);
        }

        void FinishAfterTieBreakLimit(double now)
        {
            int red = teams[Teams.Red].Correct;
            int blue = teams[Teams.Blue].Correct;
            Finish(MatchEndReason.TieBreak, red == blue ? Teams.None : (red > blue ? Teams.Red : Teams.Blue), now);
        }

        // ───────────────────────── End of match ─────────────────────────

        void Finish(MatchEndReason reason, int winner, double now)
        {
            end = new MatchEndView
            {
                winnerTeam = winner,
                reason = (int)reason,
                stats = new TeamStatsView[2],
            };
            for (int t = 0; t < 2; t++)
            {
                var team = teams[t];
                end.stats[t] = new TeamStatsView
                {
                    team = t,
                    score = team.Score,
                    correct = team.Correct,
                    answered = team.Answered,
                    fastest = team.Fastest < 0 ? -1f : (float)team.Fastest,
                    bestStreak = team.BestStreak,
                    jokersUsed = team.JokersUsed,
                    steals = team.Steals,
                };
            }

            MatchParticipant mvp = null;
            foreach (var p in participants)
            {
                if (mvp == null || p.Points > mvp.Points || (p.Points == mvp.Points && p.Correct > mvp.Correct)) mvp = p;
            }
            end.mvpPlayerId = mvp != null && mvp.Points > 0 ? mvp.Id : null;

            activePlayer = null;
            SetPhase(MatchPhase.Finished, double.MaxValue, now);
        }

        // ───────────────────────── Connections ─────────────────────────

        MatchParticipant Find(string id)
        {
            if (id == null) return null;
            foreach (var p in participants) if (p.Id == id) return p;
            return null;
        }

        public void SetConnected(string playerId, bool connected, double now)
        {
            var p = Find(playerId);
            if (p == null || p.IsBot || p.Dropped || p.Connected == connected) return;
            p.Connected = connected;
            if (!connected) p.DisconnectedAt = now;
            Dirty = true;
            if (IsFinished) return;
            UpdatePause(now);
        }

        /// <summary>The player left on purpose: no reconnect window.</summary>
        public void RemovePlayer(string playerId, double now)
        {
            var p = Find(playerId);
            if (p == null || p.Dropped) return;
            p.Connected = false;
            p.DisconnectedAt = now;
            Drop(p, now);
            if (!IsFinished) UpdatePause(now);
        }

        public float ReconnectRemaining(MatchParticipant p, double now)
        {
            if (p.IsBot || p.Connected || p.Dropped) return 0f;
            return (float)Math.Max(0, MatchRules.ReconnectGraceSeconds - (now - p.DisconnectedAt));
        }

        void UpdateDisconnects(double now)
        {
            for (int i = 0; i < participants.Count && !IsFinished; i++)
            {
                var p = participants[i];
                if (p.IsBot || p.Connected || p.Dropped) continue;
                if (now - p.DisconnectedAt >= MatchRules.ReconnectGraceSeconds) Drop(p, now);
            }
        }

        void Drop(MatchParticipant p, double now)
        {
            p.Dropped = true;
            Dirty = true;
            if (IsFinished) return;

            var team = teams[p.Team];
            var other = teams[Teams.Other(p.Team)];
            if (team.AliveCount == 0)
            {
                if (other.AliveCount == 0 || !HasHumanAlive())
                {
                    Finish(MatchEndReason.Cancelled, Teams.None, now);
                }
                else if (turn < 2 && Phase != MatchPhase.TieBreakIntro && Phase != MatchPhase.TieBreakQuestion && Phase != MatchPhase.TieBreakReveal)
                {
                    // Nothing meaningful was played yet: cancel instead of awarding a win.
                    Finish(MatchEndReason.Cancelled, Teams.None, now);
                }
                else
                {
                    Finish(MatchEndReason.Forfeit, other.Team, now);
                }
                return;
            }

            if (!HasHumanAlive())
            {
                Finish(MatchEndReason.Cancelled, Teams.None, now);
                return;
            }

            // In 2v2 the remaining teammate takes over the question with the time that was left.
            if (p == activePlayer && (Phase == MatchPhase.TurnIntro || Phase == MatchPhase.Question))
            {
                var mate = team.TeammateOf(p);
                if (mate == null)
                {
                    foreach (var m in team.Members) if (m.IsAlive) { mate = m; break; }
                }
                activePlayer = mate;
                if (voteRequested)
                {
                    voteResponder = null;
                    voteSuggestion = -1;
                }
                bots.OnPhase(this, now);
            }
            else if (p == voteResponder)
            {
                voteResponder = null;
            }

            if (Phase == MatchPhase.TieBreakQuestion) CheckTieBreakAllAnswered(now);
        }

        bool HasHumanAlive()
        {
            foreach (var p in participants) if (!p.IsBot && p.IsAlive) return true;
            return false;
        }

        void UpdatePause(double now)
        {
            MatchParticipant waitingFor = BlockingDisconnect();
            if (waitingFor != null && !paused)
            {
                paused = true;
                pauseStartedAt = now;
                pausedRemaining = Math.Max(0, phaseEnd - now);
                pausedFor = waitingFor.Id;
                Dirty = true;
            }
            else if (waitingFor == null && paused)
            {
                paused = false;
                phaseEnd = now + pausedRemaining;
                pausedAccum += now - pauseStartedAt;
                pausedFor = null;
                Dirty = true;
            }
            else if (waitingFor != null && paused && pausedFor != waitingFor.Id)
            {
                pausedFor = waitingFor.Id;
                Dirty = true;
            }
        }

        /// <summary>The disconnected player the match is waiting for, or null. Only the player who has to act pauses the clock.</summary>
        MatchParticipant BlockingDisconnect()
        {
            switch (Phase)
            {
                case MatchPhase.Question:
                    if (activePlayer != null && !activePlayer.IsBot && !activePlayer.Connected && !activePlayer.Dropped) return activePlayer;
                    return null;
                case MatchPhase.Steal:
                    {
                        MatchParticipant waiting = null;
                        foreach (var m in teams[stealTeam].Members)
                        {
                            if (m.CanAct) return null;
                            if (!m.Dropped && !m.IsBot) waiting = m;
                        }
                        return waiting;
                    }
                case MatchPhase.TieBreakQuestion:
                    foreach (var p in participants)
                    {
                        if (!p.IsBot && !p.Connected && !p.Dropped && p.TieBreakPick < 0) return p;
                    }
                    return null;
                default:
                    return null;
            }
        }
    }
}

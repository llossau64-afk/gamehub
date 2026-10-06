using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    /// <summary>A player inside a running match (human or bot).</summary>
    public sealed class MatchParticipant
    {
        public string Id;
        public string Name;
        public int Avatar;
        public int Team;
        public bool IsBot;

        public bool Connected = true;
        /// <summary>Gone for good (left, or did not reconnect in time). Dropped players are skipped in the turn order.</summary>
        public bool Dropped;
        public double DisconnectedAt;

        /// <summary>Bots only: multiplier on the chance to know the answer (around 0.85–1.1).</summary>
        public double BotSkill = 1.0;

        public int Correct;
        public int Answered;
        public int Points;
        public double Fastest = -1;

        public int TieBreakPick = -1;
        public bool TieBreakWrong;

        public bool IsAlive => !Dropped;
        /// <summary>Can act right now: present and connected (bots are always connected).</summary>
        public bool CanAct => !Dropped && (Connected || IsBot);

        public MatchParticipant(string id, string name, int team, bool isBot = false, int avatar = 0)
        {
            Id = id;
            Name = name;
            Team = team;
            IsBot = isBot;
            Avatar = avatar;
        }
    }

    internal sealed class TeamState
    {
        public readonly int Team;
        public readonly List<MatchParticipant> Members = new List<MatchParticipant>(MatchRules.MaxPerTeam);
        public readonly bool[] JokerUsed = new bool[JokerTypes.Count];
        public readonly bool[] JokerEnabled = new bool[JokerTypes.Count];

        public int Score;
        public int Streak;
        public int BestStreak;
        public int TurnsTaken;
        public int Correct;
        public int Answered;
        public double Fastest = -1;
        public int JokersUsed;
        public int Steals;

        public TeamState(int team)
        {
            Team = team;
        }

        public int AliveCount
        {
            get
            {
                int n = 0;
                foreach (var m in Members) if (m.IsAlive) n++;
                return n;
            }
        }

        public bool AnyCanAct
        {
            get
            {
                foreach (var m in Members) if (m.CanAct) return true;
                return false;
            }
        }

        /// <summary>Next player in this team's rotation, so one strong player cannot answer every question.</summary>
        public MatchParticipant NextPlayer()
        {
            var alive = new List<MatchParticipant>(Members.Count);
            foreach (var m in Members) if (m.IsAlive) alive.Add(m);
            if (alive.Count == 0) return null;
            var p = alive[TurnsTaken % alive.Count];
            TurnsTaken++;
            return p;
        }

        public MatchParticipant TeammateOf(MatchParticipant p)
        {
            foreach (var m in Members)
            {
                if (m != p && m.CanAct) return m;
            }
            return null;
        }
    }
}

using System;

namespace GuessTheAnswer.Shared
{
    // Snapshots are full, self-contained views of the authoritative state. Clients never compute game state themselves;
    // they render the newest snapshot. A snapshot is built per team so secret information (the teammate's vote,
    // the correct answer before the reveal) only reaches the players allowed to see it.

    [Serializable]
    public class RoomPlayerView
    {
        public string id;
        public string name;
        public int avatar;
        public int team;
        public bool ready;
        public bool connected = true;
        public bool isHost;
        public bool isBot;
        public float reconnectRemaining;
    }

    [Serializable]
    public class RoomSnapshot
    {
        public string code;
        public bool isPublic;
        public bool isLocal;
        public int state;
        public string hostId;
        public int maxPlayers = MatchRules.MaxPlayers;
        public MatchSettings settings = new MatchSettings();
        public RoomPlayerView[] players = new RoomPlayerView[0];
        public string[] rematchVotes = new string[0];
        /// <summary>Seconds until a public match starts automatically; 0 when no countdown runs.</summary>
        public float startCountdown;
    }

    [Serializable]
    public class QuestionView
    {
        public string id;
        public string category;
        public int difficulty;
        /// <summary>Empty until the question phase starts, so nobody can read ahead during the turn intro.</summary>
        public string text;
        public string[] answers = new string[0];
        public bool[] removed = new bool[4];
        /// <summary>-1 until the answer is revealed.</summary>
        public int correctIndex = -1;
        public string explanation;
        public string image;
    }

    [Serializable]
    public class TeamView
    {
        public int team;
        public int score;
        public int streak;
        public bool[] jokerUsed = new bool[JokerTypes.Count];
        public bool[] jokerEnabled = new bool[JokerTypes.Count];
        public int correct;
        public int answered;
    }

    [Serializable]
    public class MatchPlayerView
    {
        public string id;
        public string name;
        public int avatar;
        public int team;
        public bool isBot;
        public bool connected = true;
        public bool dropped;
        public float reconnectRemaining;
        /// <summary>Tie breaker: -1 = no answer yet. Opponents only see that a player answered (value 9), not which answer.</summary>
        public int tieBreakPick = -1;
        public bool tieBreakWrong;
    }

    [Serializable]
    public class ScoreLine
    {
        public string label;
        public int points;
    }

    [Serializable]
    public class ResultView
    {
        public int seq;
        public int kind;
        public int team = -1;
        public string playerId;
        public int picked = -1;
        public bool correct;
        public int total;
        public ScoreLine[] lines = new ScoreLine[0];
        public int streak;
    }

    [Serializable]
    public class TeamVoteView
    {
        public bool requested;
        public string responderId;
        public int suggestion = -1;
    }

    [Serializable]
    public class StealView
    {
        public int team = -1;
        public bool pending;
        public string stealerId;
        public int picked = -1;
        public bool[] blocked = new bool[4];
    }

    [Serializable]
    public class TeamStatsView
    {
        public int team;
        public int score;
        public int correct;
        public int answered;
        public float fastest = -1f;
        public int bestStreak;
        public int jokersUsed;
        public int steals;
    }

    [Serializable]
    public class MatchEndView
    {
        public int winnerTeam = -1;
        public int reason;
        public TeamStatsView[] stats = new TeamStatsView[0];
        public string mvpPlayerId;
    }

    [Serializable]
    public class MatchSnapshot
    {
        public int phase;
        public int phaseSeq;
        public float phaseDuration;
        public float phaseRemaining;
        public bool paused;
        public string pausedForPlayerId;

        public int round;
        public int totalRounds;
        public int turn;
        public int totalTurns;
        public int activeTeam = -1;
        public string activePlayerId;
        public int tieBreakNumber;

        public QuestionView question = new QuestionView();
        public TeamView[] teams = new TeamView[0];
        public MatchPlayerView[] players = new MatchPlayerView[0];

        public int lockedIndex = -1;
        public int jokerThisTurn = -1;
        public TeamVoteView teamVote = new TeamVoteView();
        public StealView steal = new StealView();
        public ResultView result = new ResultView();
        public MatchEndView end = new MatchEndView();
    }
}

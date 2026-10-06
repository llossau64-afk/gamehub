using System;

// Code in the Shared folder is compiled by both the Unity client and the .NET game server.
// Keep it free of UnityEngine and of APIs that only one of the two runtimes has (C# 9, .NET Standard 2.1).
namespace GuessTheAnswer.Shared
{
    public enum Difficulty
    {
        Easy = 0,
        Normal = 1,
        Hard = 2,
        Expert = 3,
    }

    public enum TeamMode
    {
        Auto = 0,
        OneVsOne = 1,
        TwoVsTwo = 2,
    }

    public enum JokerType
    {
        FiftyFifty = 0,
        ExtraTime = 1,
        TeamVote = 2,
        Steal = 3,
    }

    public enum MatchPhase
    {
        None = 0,
        Intro = 1,
        TurnIntro = 2,
        Question = 3,
        Locked = 4,
        Reveal = 5,
        Steal = 6,
        StealReveal = 7,
        TieBreakIntro = 8,
        TieBreakQuestion = 9,
        TieBreakReveal = 10,
        Finished = 11,
    }

    public enum RoomState
    {
        Lobby = 0,
        InMatch = 1,
        PostMatch = 2,
    }

    public enum ResultKind
    {
        None = 0,
        Answer = 1,
        Timeout = 2,
        Steal = 3,
        StealSkipped = 4,
        TieBreak = 5,
        TieBreakNoWinner = 6,
    }

    public enum MatchEndReason
    {
        None = 0,
        Normal = 1,
        TieBreak = 2,
        Forfeit = 3,
        Cancelled = 4,
    }

    public enum QueueKind
    {
        OneVsOne = 1,
        TwoVsTwo = 2,
    }

    public static class Teams
    {
        public const int Red = 0;
        public const int Blue = 1;
        public const int None = -1;

        public static int Other(int team) => team == Red ? Blue : Red;
    }

    public static class JokerTypes
    {
        public const int Count = 4;
    }

    /// <summary>Settings the lobby host chooses. Public matches use the defaults.</summary>
    [Serializable]
    public class MatchSettings
    {
        public string category = CategoryIds.Classic;
        public int rounds = 10;
        public int answerTime = 15;
        public int difficulty = (int)Difficulty.Normal;
        public int teamMode = (int)TeamMode.Auto;

        public static readonly int[] RoundOptions = { 5, 10, 15 };
        public static readonly int[] AnswerTimeOptions = { 10, 15, 20 };

        public MatchSettings Clone()
        {
            return new MatchSettings
            {
                category = category,
                rounds = rounds,
                answerTime = answerTime,
                difficulty = difficulty,
                teamMode = teamMode,
            };
        }

        /// <summary>Clamps every field to an allowed value so a client can never send something the rules do not support.</summary>
        public void Sanitize()
        {
            if (string.IsNullOrEmpty(category)) category = CategoryIds.Classic;
            category = category.Trim().ToLowerInvariant();
            if (category.Length > 32) category = CategoryIds.Classic;
            rounds = Nearest(RoundOptions, rounds);
            answerTime = Nearest(AnswerTimeOptions, answerTime);
            if (difficulty < (int)Difficulty.Easy || difficulty > (int)Difficulty.Hard) difficulty = (int)Difficulty.Normal;
            if (teamMode < (int)TeamMode.Auto || teamMode > (int)TeamMode.TwoVsTwo) teamMode = (int)TeamMode.Auto;
        }

        static int Nearest(int[] options, int value)
        {
            int best = options[0];
            for (int i = 1; i < options.Length; i++)
            {
                if (Math.Abs(options[i] - value) < Math.Abs(best - value)) best = options[i];
            }
            return best;
        }
    }

    public static class CategoryIds
    {
        public const string Classic = "classic";
    }

    public static class MatchRules
    {
        public const int MaxPlayers = 4;
        public const int MaxPerTeam = 2;

        public const int BasePoints = 100;
        public const int SpeedBonus = 25;
        public const double SpeedWindowSeconds = 5.0;
        public const int NoJokerBonus = 10;
        public const int StreakBonusAt3 = 50;
        public const int StreakBonusAt5 = 100;
        public const int StealPoints = 75;
        public const int TieBreakPoints = 100;

        public const double ExtraTimeSeconds = 8.0;
        public const double StealSeconds = 5.0;
        public const double ReconnectGraceSeconds = 15.0;
        public const double AnswerLatencyGrace = 0.35;

        public const double IntroSeconds = 2.6;
        public const double TurnIntroSeconds = 1.5;
        public const double LockedSeconds = 0.65;
        public const double RevealSeconds = 2.0;
        public const double RevealBeforeStealSeconds = 1.1;
        public const double StealRevealSeconds = 2.0;
        public const double TieBreakIntroSeconds = 4.2;
        public const double TieBreakRevealSeconds = 2.6;

        /// <summary>Points for the streak length a team just reached (3 → +50, 5 → +100, then every 5 more → +100).</summary>
        public static int StreakBonusFor(int streak)
        {
            if (streak == 3) return StreakBonusAt3;
            if (streak >= 5 && streak % 5 == 0) return StreakBonusAt5;
            return 0;
        }
    }
}

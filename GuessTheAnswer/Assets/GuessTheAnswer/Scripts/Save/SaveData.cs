using System;

namespace GuessTheAnswer.Save
{
    public enum GraphicsQuality
    {
        Low = 0,
        Medium = 1,
        High = 2,
    }

    /// <summary>Everything stored on the player's device. No sensitive data: a nickname, settings and statistics.</summary>
    [Serializable]
    public class SaveData
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public string nickname;
        public int avatar;
        public SettingsData settings = new SettingsData();
        public StatsData stats = new StatsData();
        public ProfileData profile = new ProfileData();
        public ResumeData resume = new ResumeData();
    }

    [Serializable]
    public class SettingsData
    {
        public float masterVolume = 0.9f;
        public float musicVolume = 0.55f;
        public float sfxVolume = 0.85f;
        public bool muted;
        /// <summary>-1 = not chosen yet (the first launch picks a value for the device).</summary>
        public int graphics = -1;
        public string language = "en";
        public bool showFps;
        public bool haptics = true;
    }

    [Serializable]
    public class StatsData
    {
        public int matchesPlayed;
        public int wins;
        public int losses;
        public int draws;
        public int correctAnswers;
        public int answers;
        public int bestStreak;
        public int totalPoints;
    }

    /// <summary>Ready for later progression (levels, cosmetics). Only XP is filled in for now.</summary>
    [Serializable]
    public class ProfileData
    {
        public int xp;
        public int level = 1;
        public string title;
        public string[] unlockedCosmetics = new string[0];
    }

    /// <summary>Lets a page reload rejoin a running match within the reconnect window.</summary>
    [Serializable]
    public class ResumeData
    {
        public string playerId;
        public string token;
        public string roomCode;
        public long savedAtUnix;
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Save
{
    /// <summary>
    /// Root of everything that is persisted. Bump <see cref="CurrentVersion"/> whenever the layout changes
    /// and add a migration step to <see cref="SaveMigrator"/>.
    /// </summary>
    [Serializable]
    public class SaveData
    {
        public const int CurrentVersion = 4;

        public int version = CurrentVersion;
        public bool hasActiveGame;
        public string lastSavedUtc;
        public PlayerData player = new PlayerData();
        public ShopData shop = new ShopData();
        public ProgressionData progression = new ProgressionData();
        public SettingsData settings = new SettingsData();

        /// <summary>Resets game progress while keeping player settings.</summary>
        public void ResetProgress(int startingMoney)
        {
            hasActiveGame = true;
            player = new PlayerData { money = startingMoney };
            shop = new ShopData();
            progression = new ProgressionData { reputation = 10f };
        }
    }

    [Serializable]
    public class PlayerData
    {
        public int money;
        public bool hasPosition;
        public Vector3 position;
        public float yaw;
        public float pitch;
        /// <summary>Barber tools the player owns (tool ids). Added in save version 2.</summary>
        public List<string> ownedToolIds = new List<string>();
        public string equippedClipperId;
    }

    [Serializable]
    public class ShopData
    {
        public int shopLevel = 1;
        public int barberChairCount = 1;
        public List<string> collectedTrashIds = new List<string>();
        // Placeholders consumed by the expansion / furniture systems in later phases.
        public List<string> unlockedAreaIds = new List<string>();
        public List<string> ownedItemIds = new List<string>();
        public List<string> placedFurnitureIds = new List<string>();
    }

    [Serializable]
    public class ProgressionData
    {
        public int day = 1;
        public bool introCompleted;
        public string currentObjectiveId;
        public int currentObjectiveProgress;
        public List<string> completedObjectiveIds = new List<string>();
        public List<string> visitedInspectionPointIds = new List<string>();
        public List<string> shownHintIds = new List<string>();
        // Placeholders for the progression / reputation systems.
        public int level = 1;
        public int experience;
        public float reputation;
        // Version 2
        public int customersServed;
        public bool shopOpen;
        public bool firstCustomerTutorialCompleted;
        public int totalTipsEarned;
        public int bestStars;
        // Version 3: the workday loop. Phase is a Workday.DayPhase value; the clock is minutes since midnight.
        public int dayPhase;
        public float dayClockMinutes = 540f;
        public DayStatsData dayStats = new DayStatsData();
        // Version 4: streak, daily goals and milestones.
        /// <summary>Consecutive haircuts rated 4 stars or better.</summary>
        public int streak;
        public int bestStreak;
        /// <summary>Lifetime service income (prices and tips); goal rewards are not counted.</summary>
        public int totalEarned;
        public int fiveStarCuts;
        public int vipsServed;
        public int goalsCompleted;
        /// <summary>Name keys of the hairstyles the player has finished at least once.</summary>
        public List<string> cutStyleIds = new List<string>();
        public List<string> unlockedMilestoneIds = new List<string>();
        public DailyGoalsData goals = new DailyGoalsData();
    }

    /// <summary>The goals of the current day. Regenerated each morning. Added in save version 4.</summary>
    [Serializable]
    public class DailyGoalsData
    {
        /// <summary>The day these goals belong to; 0 until generated.</summary>
        public int day;
        public List<DailyGoalData> items = new List<DailyGoalData>();
    }

    /// <summary>One daily goal. <see cref="kind"/> is a Rewards.GoalKind value.</summary>
    [Serializable]
    public class DailyGoalData
    {
        public int kind;
        public int target;
        public int progress;
        /// <summary>Hairstyle name key for style goals.</summary>
        public string param = "";
        public int rewardCash;
        public int rewardXp;
        public bool completed;
        /// <summary>"No lost customers" goals fail for the rest of the day once a customer walks out.</summary>
        public bool failed;
    }

    /// <summary>Everything the end-of-day summary reports. Reset when a new day starts. Added in save version 3.</summary>
    [Serializable]
    public class DayStatsData
    {
        public int customersServed;
        public int customersLost;
        /// <summary>Service prices only; tips are counted separately.</summary>
        public int revenue;
        public int tips;
        public int starsTotal;
        public int xpEarned;
        public int levelAtStart;
        /// <summary>Reputation when the day began; -1 until the day service has recorded it.</summary>
        public float reputationAtStart = -1f;
        public int rentCharged;
        /// <summary>True once the rent was deducted, so loading an unfinished summary never charges twice.</summary>
        public bool settled;
    }

    public enum QualityTier
    {
        Low = 0,
        Medium = 1,
        High = 2
    }

    [Serializable]
    public class SettingsData
    {
        // Graphics
        public QualityTier quality = QualityTier.Medium;
        public float renderScale = 1f;
        public bool shadows = true;
        public bool antiAliasing = true;

        // Audio (0..1)
        public float masterVolume = 0.85f;
        public float musicVolume = 0.55f;
        public float sfxVolume = 0.8f;
        public float ambienceVolume = 0.7f;
        public float uiVolume = 0.7f;

        // Controls
        public float mouseSensitivity = 1f;
        public float touchSensitivity = 1f;
        public bool invertLookY;
        public float joystickOpacity = 0.75f;
        public bool dynamicJoystick = true;

        // Gameplay
        public string language = "";
        public bool cameraBob = true;
        public bool tutorialHints = true;

        /// <summary>True until the player (or auto-detection) picked a quality tier.</summary>
        public bool qualityAutoDetected;
    }
}

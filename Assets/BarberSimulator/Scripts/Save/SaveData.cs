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
        public const int CurrentVersion = 1;

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
            progression = new ProgressionData();
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

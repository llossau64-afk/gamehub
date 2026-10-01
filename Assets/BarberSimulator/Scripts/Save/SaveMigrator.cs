using UnityEngine;

namespace BarberSimulator.Save
{
    /// <summary>Upgrades older save layouts to <see cref="SaveData.CurrentVersion"/>.</summary>
    public static class SaveMigrator
    {
        public static SaveData Migrate(SaveData data)
        {
            if (data.version > SaveData.CurrentVersion)
            {
                Debug.LogWarning($"[Save] Save version {data.version} is newer than supported {SaveData.CurrentVersion}. Loading best-effort.");
                return data;
            }

            // Future: if (data.version == 1) { ...convert...; data.version = 2; }
            data.version = SaveData.CurrentVersion;
            return data;
        }

        /// <summary>Repairs nulls that can appear when fields were added after a save was written.</summary>
        public static void Sanitize(SaveData data, int startingMoney)
        {
            if (data.player == null) data.player = new PlayerData { money = startingMoney };
            if (data.shop == null) data.shop = new ShopData();
            if (data.progression == null) data.progression = new ProgressionData();
            if (data.settings == null) data.settings = new SettingsData();

            var shop = data.shop;
            if (shop.collectedTrashIds == null) shop.collectedTrashIds = new System.Collections.Generic.List<string>();
            if (shop.unlockedAreaIds == null) shop.unlockedAreaIds = new System.Collections.Generic.List<string>();
            if (shop.ownedItemIds == null) shop.ownedItemIds = new System.Collections.Generic.List<string>();
            if (shop.placedFurnitureIds == null) shop.placedFurnitureIds = new System.Collections.Generic.List<string>();

            var prog = data.progression;
            if (prog.completedObjectiveIds == null) prog.completedObjectiveIds = new System.Collections.Generic.List<string>();
            if (prog.visitedInspectionPointIds == null) prog.visitedInspectionPointIds = new System.Collections.Generic.List<string>();
            if (prog.shownHintIds == null) prog.shownHintIds = new System.Collections.Generic.List<string>();

            var s = data.settings;
            s.renderScale = Mathf.Clamp(s.renderScale, 0.5f, 1f);
            s.masterVolume = Mathf.Clamp01(s.masterVolume);
            s.musicVolume = Mathf.Clamp01(s.musicVolume);
            s.sfxVolume = Mathf.Clamp01(s.sfxVolume);
            s.ambienceVolume = Mathf.Clamp01(s.ambienceVolume);
            s.uiVolume = Mathf.Clamp01(s.uiVolume);
            s.mouseSensitivity = Mathf.Clamp(s.mouseSensitivity, 0.1f, 3f);
            s.touchSensitivity = Mathf.Clamp(s.touchSensitivity, 0.1f, 3f);
            s.joystickOpacity = Mathf.Clamp(s.joystickOpacity, 0.2f, 1f);
        }
    }
}

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

            if (data.version < 2)
            {
                // v1 → v2: customer loop. Players who already finished Day 1 get the shop opened for them.
                if (data.player != null && data.player.ownedToolIds == null) data.player.ownedToolIds = new System.Collections.Generic.List<string>();
                if (data.progression != null)
                {
                    bool day1Done = data.progression.introCompleted && string.IsNullOrEmpty(data.progression.currentObjectiveId)
                                    && data.progression.completedObjectiveIds != null && data.progression.completedObjectiveIds.Count >= 3;
                    data.progression.shopOpen = day1Done;
                    data.progression.reputation = Mathf.Max(data.progression.reputation, 10f);
                }
                data.version = 2;
            }
            if (data.version < 3)
            {
                // v2 → v3: workday loop and shop level. Every day starts closed; customers served so far
                // become experience so existing shops do not restart at level 1.
                if (data.progression != null)
                {
                    data.progression.shopOpen = false;
                    data.progression.dayPhase = 0;
                    data.progression.dayClockMinutes = 540f;
                    data.progression.dayStats = new DayStatsData();
                    if (data.progression.experience <= 0)
                        data.progression.experience = Mathf.Max(0, data.progression.customersServed) * 12;
                }
                data.version = 3;
            }
            if (data.version < 4)
            {
                // v3 → v4: streak, daily goals and milestones. Lifetime income starts at the current balance and the
                // five-star counter at the best rating so far, so existing shops are not told they have earned nothing.
                if (data.progression != null)
                {
                    data.progression.totalEarned = Mathf.Max(0, data.player != null ? data.player.money : 0);
                    data.progression.fiveStarCuts = data.progression.bestStars >= 5 ? 1 : 0;
                    data.progression.goals = new DailyGoalsData();
                }
                data.version = 4;
            }
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

            if (data.player.ownedToolIds == null) data.player.ownedToolIds = new System.Collections.Generic.List<string>();

            var prog = data.progression;
            if (prog.completedObjectiveIds == null) prog.completedObjectiveIds = new System.Collections.Generic.List<string>();
            if (prog.visitedInspectionPointIds == null) prog.visitedInspectionPointIds = new System.Collections.Generic.List<string>();
            if (prog.shownHintIds == null) prog.shownHintIds = new System.Collections.Generic.List<string>();
            if (prog.dayStats == null) prog.dayStats = new DayStatsData();
            if (prog.cutStyleIds == null) prog.cutStyleIds = new System.Collections.Generic.List<string>();
            if (prog.unlockedMilestoneIds == null) prog.unlockedMilestoneIds = new System.Collections.Generic.List<string>();
            if (prog.goals == null) prog.goals = new DailyGoalsData();
            if (prog.goals.items == null) prog.goals.items = new System.Collections.Generic.List<DailyGoalData>();
            prog.streak = Mathf.Max(0, prog.streak);
            prog.bestStreak = Mathf.Max(prog.bestStreak, prog.streak);
            prog.day = Mathf.Max(1, prog.day);
            prog.dayPhase = Mathf.Clamp(prog.dayPhase, 0, 3);
            prog.experience = Mathf.Max(0, prog.experience);

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

using System.Collections.Generic;
using BarberSimulator.Shop;
using BarberSimulator.Workday;
using UnityEditor;

namespace BarberSimulator.EditorTools
{
    /// <summary>Creates the workday configuration and the shop upgrades (the catalog the shop computer sells from).</summary>
    public static class Phase3ContentBuilder
    {
        public sealed class Result
        {
            public WorkdayConfig Workday;
            public UpgradeCatalog Catalog;
            public List<UpgradeDefinition> Upgrades = new List<UpgradeDefinition>();

            public UpgradeDefinition Find(string id) => Upgrades.Find(u => u.upgradeId == id);
        }

        private const string Folder = GeneratorPaths.ScriptableObjects + "/";

        public static Result Build()
        {
            var result = new Result();

            var workday = ContentAssetsBuilder.GetOrCreate<WorkdayConfig>(Folder + "Workday/WorkdayConfig.asset");
            workday.openingHour = 9;
            workday.closingHour = 18;
            workday.realMinutesPerDay = 9f;
            workday.closingGraceSeconds = 90f;
            workday.baseRent = 35;
            workday.rentPerLevel = 10;
            workday.firstDayFree = true;
            EditorUtility.SetDirty(workday);
            result.Workday = workday;

            // Tools: the upgraded tool takes the hotkey slot of the one it replaces.
            var proClipper = Upgrade(result, "pro_clipper", UpgradeCategory.Tools, 250, 2);
            proClipper.unlockToolId = "pro_clipper";
            proClipper.replacesToolId = "basic_clipper";
            var precisionTrimmer = Upgrade(result, "precision_trimmer", UpgradeCategory.Tools, 320, 3);
            precisionTrimmer.unlockToolId = "pro_trimmer";
            precisionTrimmer.replacesToolId = "basic_trimmer";

            // Comfort & decor: every one of these has a prop in the scene that appears when it is bought.
            var coffee = Upgrade(result, "coffee_machine", UpgradeCategory.Comfort, 180, 1);
            coffee.patienceMultiplier = 1.2f;
            coffee.scenePropName = "Upgrade_CoffeeStation";
            var plants = Upgrade(result, "plants_posters", UpgradeCategory.Comfort, 120, 1);
            plants.tipMultiplier = 1.1f;
            plants.scenePropName = "Upgrade_PlantsPosters";
            var tv = Upgrade(result, "wall_tv", UpgradeCategory.Comfort, 400, 2);
            tv.patienceMultiplier = 1.15f;
            tv.scenePropName = "Upgrade_WallTV";
            var bench = Upgrade(result, "second_bench", UpgradeCategory.Comfort, 450, 2);
            bench.maxQueueBonus = 1;
            bench.scenePropName = "Upgrade_SecondBench";
            var neon = Upgrade(result, "neon_sign", UpgradeCategory.Comfort, 600, 3);
            neon.spawnIntervalMultiplier = 0.85f;
            neon.scenePropName = "Upgrade_NeonSign";
            var shelf = Upgrade(result, "premium_shelf", UpgradeCategory.Comfort, 750, 3);
            shelf.tipMultiplier = 1.2f;
            shelf.reputationGainMultiplier = 1.1f;
            shelf.scenePropName = "Upgrade_PremiumShelf";

            // Expansion
            var backRoom = Upgrade(result, "back_room", UpgradeCategory.Expansion, 1500, 4);
            backRoom.unlockAreaId = "back_room";
            var chair = Upgrade(result, "second_chair", UpgradeCategory.Expansion, 2200, 5);
            chair.scenePropName = "Upgrade_SecondChair";

            foreach (var u in result.Upgrades) EditorUtility.SetDirty(u);

            var catalog = ContentAssetsBuilder.GetOrCreate<UpgradeCatalog>(Folder + "Shop/UpgradeCatalog.asset");
            catalog.Configure(new List<UpgradeDefinition>(result.Upgrades));
            EditorUtility.SetDirty(catalog);
            result.Catalog = catalog;

            AssetDatabase.SaveAssets();
            return result;
        }

        /// <summary>Creates (or resets) one upgrade asset. Names and descriptions follow the "upgrade.&lt;id&gt;" localization keys.</summary>
        private static UpgradeDefinition Upgrade(Result result, string id, UpgradeCategory category, int price, int level)
        {
            var upgrade = ContentAssetsBuilder.GetOrCreate<UpgradeDefinition>(Folder + "Shop/Upgrade_" + id + ".asset");
            // Reset first so regenerating never keeps stale effects from an earlier definition.
            upgrade.patienceMultiplier = 1f;
            upgrade.tipMultiplier = 1f;
            upgrade.spawnIntervalMultiplier = 1f;
            upgrade.maxQueueBonus = 0;
            upgrade.reputationGainMultiplier = 1f;
            upgrade.unlockToolId = string.Empty;
            upgrade.replacesToolId = string.Empty;
            upgrade.unlockAreaId = string.Empty;
            upgrade.scenePropName = string.Empty;
            bool note = id == "pro_clipper" || id == "precision_trimmer" || id == "back_room" || id == "second_chair";
            upgrade.Configure(id, "upgrade." + id, "upgrade." + id + ".desc", note ? "upgrade." + id + ".note" : string.Empty, category, price, level);
            result.Upgrades.Add(upgrade);
            return upgrade;
        }
    }
}

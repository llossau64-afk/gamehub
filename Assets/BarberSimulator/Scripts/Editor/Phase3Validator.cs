using System.Collections.Generic;
using BarberSimulator.Haircut;
using BarberSimulator.Shop;
using BarberSimulator.Workday;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BarberSimulator.EditorTools
{
    /// <summary>Checks that every upgrade is wired end to end: texts, tools, areas, scene props and the day sign.</summary>
    public static class Phase3Validator
    {
        [MenuItem("Barber Simulator/Validate Workday & Upgrades", priority = 42)]
        public static void Validate()
        {
            var problems = new List<string>();
            var ids = new HashSet<string>();
            var toolIds = new HashSet<string>();
            foreach (var guid in AssetDatabase.FindAssets("t:BarberToolDefinition"))
                toolIds.Add(AssetDatabase.LoadAssetAtPath<BarberToolDefinition>(AssetDatabase.GUIDToAssetPath(guid)).toolId);

            var scene = EditorSceneManager.GetActiveScene();
            var props = new Dictionary<string, UpgradeProp>();
            var areas = new HashSet<string>();
            bool sign = false, computer = false;
            foreach (var root in scene.GetRootGameObjects())
            {
                foreach (var prop in root.GetComponentsInChildren<UpgradeProp>(true)) props[prop.UpgradeId] = prop;
                foreach (var area in root.GetComponentsInChildren<ExpansionArea>(true)) areas.Add(area.AreaId);
                sign |= root.GetComponentInChildren<ShopSign>(true) != null;
                computer |= root.GetComponentInChildren<ShopComputer>(true) != null;
            }
            if (!sign) problems.Add("The scene has no shop sign (the shop could never open).");
            if (!computer) problems.Add("The scene has no shop computer (upgrades could never be bought).");

            foreach (var guid in AssetDatabase.FindAssets("t:UpgradeDefinition"))
            {
                var upgrade = AssetDatabase.LoadAssetAtPath<UpgradeDefinition>(AssetDatabase.GUIDToAssetPath(guid));
                string name = upgrade.name;
                if (string.IsNullOrEmpty(upgrade.upgradeId) || !ids.Add(upgrade.upgradeId)) problems.Add($"Upgrade '{name}' has a missing or duplicate id.");
                if (string.IsNullOrEmpty(upgrade.nameKey) || string.IsNullOrEmpty(upgrade.descriptionKey)) problems.Add($"Upgrade '{name}' has no name/description keys.");
                if (upgrade.price <= 0) problems.Add($"Upgrade '{name}' has no price.");
                if (!string.IsNullOrEmpty(upgrade.unlockToolId) && !toolIds.Contains(upgrade.unlockToolId)) problems.Add($"Upgrade '{name}' unlocks unknown tool '{upgrade.unlockToolId}'.");
                if (!string.IsNullOrEmpty(upgrade.replacesToolId) && !toolIds.Contains(upgrade.replacesToolId)) problems.Add($"Upgrade '{name}' replaces unknown tool '{upgrade.replacesToolId}'.");
                if (!string.IsNullOrEmpty(upgrade.unlockAreaId) && !areas.Contains(upgrade.unlockAreaId)) problems.Add($"Upgrade '{name}' unlocks unknown area '{upgrade.unlockAreaId}'.");
                if (!string.IsNullOrEmpty(upgrade.scenePropName))
                {
                    if (!props.TryGetValue(upgrade.upgradeId, out var prop)) problems.Add($"Upgrade '{name}' has no UpgradeProp in the scene.");
                    else if (prop.name != upgrade.scenePropName) problems.Add($"Upgrade '{name}' expects the prop '{upgrade.scenePropName}' but the scene has '{prop.name}'.");
                }
            }
            foreach (var pair in props)
                if (!ids.Contains(pair.Key)) problems.Add($"Scene prop '{pair.Value.name}' belongs to the unknown upgrade '{pair.Key}'.");

            foreach (var guid in AssetDatabase.FindAssets("t:WorkdayConfig"))
            {
                var config = AssetDatabase.LoadAssetAtPath<WorkdayConfig>(AssetDatabase.GUIDToAssetPath(guid));
                if (config.closingHour <= config.openingHour) problems.Add("Workday closes before it opens.");
            }

            if (problems.Count == 0) Debug.Log("[Validate] Workday & upgrades OK.");
            else foreach (var p in problems) Debug.LogError("[Validate] " + p);
        }
    }
}

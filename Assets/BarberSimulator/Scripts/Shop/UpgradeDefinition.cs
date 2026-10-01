using UnityEngine;

namespace BarberSimulator.Shop
{
    public enum UpgradeCategory
    {
        Tools,
        Comfort,
        Expansion
    }

    /// <summary>
    /// One purchasable shop upgrade. Data-driven: effects are plain numbers that <see cref="UpgradeEffects"/>
    /// aggregates; multipliers use 1 for "no change".
    /// </summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Shop/Upgrade", fileName = "Upgrade")]
    public sealed class UpgradeDefinition : ScriptableObject
    {
        [Header("Identity")]
        public string upgradeId;
        public string nameKey;
        public string descriptionKey;
        [Tooltip("Optional extra line under the numeric effects (e.g. 'Coming soon').")]
        public string effectNoteKey;
        public UpgradeCategory category;

        [Header("Cost")]
        public int price = 100;
        [Min(1)] public int requiredShopLevel = 1;

        [Header("Effects")]
        [Tooltip("Multiplies how long customers wait before leaving.")]
        public float patienceMultiplier = 1f;
        [Tooltip("Multiplies the size of tips.")]
        public float tipMultiplier = 1f;
        [Tooltip("Multiplies the time between customers (below 1 = more customers).")]
        public float spawnIntervalMultiplier = 1f;
        [Tooltip("Extra customers allowed in the shop at once.")]
        public int maxQueueBonus;
        [Tooltip("Multiplies positive reputation gains.")]
        public float reputationGainMultiplier = 1f;
        [Tooltip("Tool id added to the barber's toolbox (see BarberToolDefinition.toolId).")]
        public string unlockToolId;
        [Tooltip("Tool id this upgrade replaces in the toolbox (keeps the hotkey slot).")]
        public string replacesToolId;
        [Tooltip("Expansion area opened by this upgrade (see ExpansionArea.AreaId).")]
        public string unlockAreaId;
        [Tooltip("Name of the scene object enabled when owned. The generator tags it with an UpgradeProp.")]
        public string scenePropName;

        public bool HasNumericEffects =>
            !Mathf.Approximately(patienceMultiplier, 1f) || !Mathf.Approximately(tipMultiplier, 1f) ||
            !Mathf.Approximately(spawnIntervalMultiplier, 1f) || maxQueueBonus != 0 ||
            !Mathf.Approximately(reputationGainMultiplier, 1f);

        public void Configure(string id, string name, string description, string note, UpgradeCategory upgradeCategory, int cost, int level)
        {
            upgradeId = id;
            nameKey = name;
            descriptionKey = description;
            effectNoteKey = note;
            category = upgradeCategory;
            price = cost;
            requiredShopLevel = level;
        }
    }
}

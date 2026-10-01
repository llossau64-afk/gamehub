using System;
using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>All upgrades the shop computer offers, in display order.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Shop/Upgrade Catalog", fileName = "UpgradeCatalog")]
    public sealed class UpgradeCatalog : ScriptableObject
    {
        [SerializeField] private List<UpgradeDefinition> upgrades = new List<UpgradeDefinition>();

        public IReadOnlyList<UpgradeDefinition> Upgrades => upgrades;

        public void Configure(List<UpgradeDefinition> list) => upgrades = list;

        public UpgradeDefinition Find(string id)
        {
            foreach (var u in upgrades)
                if (u != null && u.upgradeId == id) return u;
            return null;
        }
    }
}

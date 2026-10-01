using System;
using System.Collections.Generic;
using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>
    /// The combined effect of every owned upgrade. Gameplay systems (customers, payment, spawner) read these
    /// values and never look at individual upgrades.
    /// </summary>
    public sealed class UpgradeEffects
    {
        public float PatienceMultiplier { get; private set; } = 1f;
        public float TipMultiplier { get; private set; } = 1f;
        public float SpawnIntervalMultiplier { get; private set; } = 1f;
        public int MaxQueueBonus { get; private set; }
        public float ReputationGainMultiplier { get; private set; } = 1f;

        public event Action Changed;

        public void Rebuild(IEnumerable<UpgradeDefinition> owned)
        {
            float patience = 1f, tips = 1f, interval = 1f, reputation = 1f;
            int queue = 0;
            foreach (var u in owned)
            {
                if (u == null) continue;
                patience *= Mathf.Max(0.1f, u.patienceMultiplier);
                tips *= Mathf.Max(0f, u.tipMultiplier);
                interval *= Mathf.Max(0.1f, u.spawnIntervalMultiplier);
                reputation *= Mathf.Max(0f, u.reputationGainMultiplier);
                queue += u.maxQueueBonus;
            }
            PatienceMultiplier = patience;
            TipMultiplier = tips;
            // Customers never arrive faster than one every few seconds, however many upgrades stack.
            SpawnIntervalMultiplier = Mathf.Max(0.4f, interval);
            ReputationGainMultiplier = reputation;
            MaxQueueBonus = Mathf.Max(0, queue);
            Changed?.Invoke();
        }
    }
}

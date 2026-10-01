using System;
using BarberSimulator.Economy;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Shop
{
    /// <summary>
    /// Shop level from experience. Every served customer grants XP scaled by the star rating; the level gates
    /// upgrades and the haircut styles customers ask for. State lives in <see cref="ProgressionData"/>.
    /// </summary>
    public sealed class ShopProgression
    {
        public const int MaxLevel = 10;

        private readonly SaveService _save;

        public int Xp => _save.Data.progression.experience;
        public int Level => LevelForXp(Xp);
        public bool IsMaxLevel => Level >= MaxLevel;
        public int XpIntoLevel => Xp - XpForLevel(Level);
        public int XpForNextLevel => IsMaxLevel ? 0 : XpForLevel(Level + 1) - XpForLevel(Level);
        public float Progress01 => IsMaxLevel ? 1f : Mathf.Clamp01((float)XpIntoLevel / Mathf.Max(1, XpForNextLevel));

        /// <summary>(xpGained)</summary>
        public event Action<int> XpGained;
        /// <summary>(oldLevel, newLevel)</summary>
        public event Action<int, int> LevelChanged;

        public ShopProgression(SaveService save, EconomyService economy)
        {
            _save = save;
            economy.ServicePaid += OnServicePaid;
            SyncSavedLevel();
        }

        /// <summary>Total XP needed to reach <paramref name="level"/> (level 1 = 0).</summary>
        public static int XpForLevel(int level)
        {
            int n = Mathf.Clamp(level, 1, MaxLevel) - 1;
            return 40 * n * n + 60 * n;
        }

        public static int LevelForXp(int xp)
        {
            int level = 1;
            while (level < MaxLevel && xp >= XpForLevel(level + 1)) level++;
            return level;
        }

        /// <summary>One star is worth half a normal haircut, five stars are worth double.</summary>
        public static int XpFor(ServicePayment payment)
        {
            float multiplier;
            switch (payment.Stars)
            {
                case 5: multiplier = 2f; break;
                case 4: multiplier = 1.5f; break;
                case 3: multiplier = 1f; break;
                case 2: multiplier = 0.75f; break;
                default: multiplier = 0.5f; break;
            }
            return Mathf.Max(1, Mathf.RoundToInt(10f * multiplier));
        }

        public void AddXp(int amount)
        {
            if (amount <= 0) return;
            var progression = _save.Data.progression;
            int before = Level;
            progression.experience += amount;
            progression.dayStats.xpEarned += amount;
            SyncSavedLevel();
            _save.RequestSave();
            XpGained?.Invoke(amount);
            int after = Level;
            if (after != before) LevelChanged?.Invoke(before, after);
        }

        /// <summary>Re-reads the save (new game, continue) and mirrors the level into the placeholder fields.</summary>
        public void SyncSavedLevel()
        {
            int level = Level;
            _save.Data.progression.level = level;
            _save.Data.shop.shopLevel = level;
        }

        private void OnServicePaid(ServicePayment payment) => AddXp(XpFor(payment));
    }
}

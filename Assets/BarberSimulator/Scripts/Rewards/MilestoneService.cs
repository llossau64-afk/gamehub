using System;
using System.Collections.Generic;
using BarberSimulator.Economy;
using BarberSimulator.Haircut;
using BarberSimulator.Save;
using BarberSimulator.Shop;

namespace BarberSimulator.Rewards
{
    /// <summary>A snapshot of the lifetime numbers milestones are judged by.</summary>
    public struct MilestoneStats
    {
        public int CustomersServed;
        public int TotalEarned;
        public int FiveStarCuts;
        public int BestStreak;
        public int VipsServed;
        public int GoalsCompleted;
        public int ShopLevel;
        public int StylesCut;
        /// <summary>How many different hairstyles the shop can be asked for.</summary>
        public int StylesTotal;
        /// <summary>Customers served today (the day statistics, reset each morning).</summary>
        public int DayCustomers;
        /// <summary>Fade haircuts finished at 95% or better with five stars.</summary>
        public int PerfectFades;
        public int UpgradesOwned;
        public int UpgradesTotal;
        /// <summary>The first customer of the tutorial day has been served.</summary>
        public bool TutorialDone;
    }

    /// <summary>One achievement. The texts are the localization keys "milestone.{id}" and "milestone.{id}.desc".</summary>
    public sealed class MilestoneDefinition
    {
        public readonly string Id;
        public readonly Func<MilestoneStats, bool> IsReached;
        /// <summary>Counter shown on locked cards (e.g. 7 of 10); null when the achievement is a one-off event.</summary>
        public readonly Func<MilestoneStats, int> Value;
        public readonly Func<MilestoneStats, int> Target;
        private readonly string _prefix;

        public string TitleKey => "milestone." + Id;
        public string DescriptionKey => "milestone." + Id + ".desc";
        public bool HasCounter => Value != null && Target != null;

        public MilestoneDefinition(string id, Func<MilestoneStats, bool> isReached, Func<MilestoneStats, int> value = null, Func<MilestoneStats, int> target = null, string prefix = "")
        {
            Id = id;
            IsReached = isReached;
            Value = value;
            Target = target;
            _prefix = prefix;
        }

        /// <summary>Progress text for locked entries, e.g. "37 / 50"; null when there is no simple counter.</summary>
        public string Progress(MilestoneStats stats)
        {
            if (!HasCounter) return null;
            return Format(Math.Min(Value(stats), Target(stats)), Target(stats));
        }

        /// <summary>0..1 fill of the card's progress bar; 0 without a counter.</summary>
        public float Progress01(MilestoneStats stats)
        {
            if (!HasCounter) return 0f;
            int target = Target(stats);
            return target <= 0 ? 0f : Math.Min(1f, Math.Max(0, Value(stats)) / (float)target);
        }

        private string Format(int value, int target)
        {
            var culture = System.Globalization.CultureInfo.InvariantCulture;
            return _prefix + value.ToString("N0", culture) + " / " + _prefix + target.ToString("N0", culture);
        }
    }

    /// <summary>
    /// Lifetime achievements. They are evaluated whenever something that can unlock one happens (a payment, a
    /// finished goal, a level-up, an upgrade purchase) and stored in <see cref="ProgressionData.unlockedMilestoneIds"/>.
    /// Nothing unlocks on its own: every entry is judged from the persisted gameplay counters.
    /// </summary>
    public sealed class MilestoneService
    {
        public static readonly MilestoneDefinition[] All =
        {
            Counted("first_cut", s => s.CustomersServed, 1),
            // Id kept from the first version; the card is now called "Five Star Barber".
            new MilestoneDefinition("first_five_star", s => s.FiveStarCuts >= 1),
            Counted("busy_day", s => s.DayCustomers, 10),
            new MilestoneDefinition("shop_owner", s => s.TutorialDone),
            new MilestoneDefinition("perfect_fade", s => s.PerfectFades >= 1),
            Counted("served_10", s => s.CustomersServed, 10),
            Counted("served_50", s => s.CustomersServed, 50),
            Counted("served_100", s => s.CustomersServed, 100),
            Counted("earned_1000", s => s.TotalEarned, 1000, "$"),
            Counted("earned_10000", s => s.TotalEarned, 10000, "$"),
            Counted("streak_5", s => s.BestStreak, 5),
            Counted("streak_10", s => s.BestStreak, 10),
            new MilestoneDefinition("first_vip", s => s.VipsServed >= 1),
            new MilestoneDefinition("all_styles", s => s.StylesTotal > 0 && s.StylesCut >= s.StylesTotal, s => s.StylesCut, s => s.StylesTotal),
            Counted("level_5", s => s.ShopLevel, 5),
            new MilestoneDefinition("barber_empire", s => s.UpgradesTotal > 0 && s.UpgradesOwned >= s.UpgradesTotal, s => s.UpgradesOwned, s => s.UpgradesTotal),
            new MilestoneDefinition("first_goal", s => s.GoalsCompleted >= 1),
            Counted("goals_10", s => s.GoalsCompleted, 10)
        };

        private static MilestoneDefinition Counted(string id, Func<MilestoneStats, int> value, int target, string prefix = "")
            => new MilestoneDefinition(id, s => value(s) >= target, value, s => target, prefix);

        private readonly SaveService _save;
        private readonly ShopProgression _progression;

        /// <summary>Every hairstyle the shop can be asked for ("all styles cut once").</summary>
        public Func<IReadOnlyList<HaircutRequest>> StyleSource { get; set; }

        private UpgradeService _upgrades;

        public int UnlockedCount => _save.Data.progression.unlockedMilestoneIds.Count;

        /// <summary>A milestone was reached for the first time.</summary>
        public event Action<MilestoneDefinition> Unlocked;

        public MilestoneService(SaveService save, EconomyService economy, ShopProgression progression, DailyGoalService goals)
        {
            _save = save;
            _progression = progression;
            economy.ServicePaid += _ => Check();
            goals.GoalCompleted += _ => Check();
            progression.LevelChanged += (_, __) => Check();
        }

        /// <summary>Lets "own every upgrade" see the catalog and re-check after each purchase.</summary>
        public void BindUpgrades(UpgradeService upgrades)
        {
            if (_upgrades != null) return;
            _upgrades = upgrades;
            upgrades.Purchased += _ => Check();
        }

        public bool IsUnlocked(string id) => _save.Data.progression.unlockedMilestoneIds.Contains(id);

        public MilestoneStats CurrentStats()
        {
            var progression = _save.Data.progression;
            var stats = new MilestoneStats
            {
                CustomersServed = progression.customersServed,
                TotalEarned = progression.totalEarned,
                FiveStarCuts = progression.fiveStarCuts,
                BestStreak = progression.bestStreak,
                VipsServed = progression.vipsServed,
                GoalsCompleted = progression.goalsCompleted,
                ShopLevel = _progression.Level,
                DayCustomers = progression.dayStats != null ? progression.dayStats.customersServed : 0,
                PerfectFades = progression.perfectFades,
                TutorialDone = progression.firstCustomerTutorialCompleted || progression.customersServed >= 1
            };

            if (_upgrades != null)
            {
                var owned = _save.Data.shop.ownedItemIds;
                foreach (var upgrade in _upgrades.All)
                {
                    if (upgrade == null) continue;
                    stats.UpgradesTotal++;
                    if (owned.Contains(upgrade.upgradeId)) stats.UpgradesOwned++;
                }
            }

            var requests = StyleSource != null ? StyleSource() : null;
            if (requests != null)
            {
                var seen = new HashSet<string>();
                foreach (var request in requests)
                {
                    if (request == null || string.IsNullOrEmpty(request.NameKey) || !seen.Add(request.NameKey)) continue;
                    stats.StylesTotal++;
                    if (progression.cutStyleIds.Contains(request.NameKey)) stats.StylesCut++;
                }
            }
            return stats;
        }

        /// <summary>Unlocks everything that is reached now. Safe to call at any time.</summary>
        public void Check()
        {
            var ids = _save.Data.progression.unlockedMilestoneIds;
            MilestoneStats stats = default;
            bool statsReady = false;
            List<MilestoneDefinition> reached = null;
            foreach (var milestone in All)
            {
                if (ids.Contains(milestone.Id)) continue;
                if (!statsReady) { stats = CurrentStats(); statsReady = true; }
                if (!milestone.IsReached(stats)) continue;
                ids.Add(milestone.Id);
                (reached ?? (reached = new List<MilestoneDefinition>())).Add(milestone);
            }
            if (reached == null) return;
            _save.RequestSave();
            foreach (var milestone in reached) Unlocked?.Invoke(milestone);
        }
    }
}

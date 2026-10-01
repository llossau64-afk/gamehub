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
    }

    /// <summary>One achievement. The texts are the localization keys "milestone.{id}" and "milestone.{id}.desc".</summary>
    public sealed class MilestoneDefinition
    {
        public readonly string Id;
        public readonly Func<MilestoneStats, bool> IsReached;
        /// <summary>Progress text for locked entries, e.g. "37 / 50"; null when there is no simple counter.</summary>
        public readonly Func<MilestoneStats, string> Progress;

        public string TitleKey => "milestone." + Id;
        public string DescriptionKey => "milestone." + Id + ".desc";

        public MilestoneDefinition(string id, Func<MilestoneStats, bool> isReached, Func<MilestoneStats, string> progress = null)
        {
            Id = id;
            IsReached = isReached;
            Progress = progress;
        }
    }

    /// <summary>
    /// Lifetime achievements. They are evaluated whenever something that can unlock one happens (a payment, a
    /// finished goal, a level-up) and stored in <see cref="ProgressionData.unlockedMilestoneIds"/>.
    /// </summary>
    public sealed class MilestoneService
    {
        public static readonly MilestoneDefinition[] All =
        {
            new MilestoneDefinition("first_five_star", s => s.FiveStarCuts >= 1),
            new MilestoneDefinition("served_10", s => s.CustomersServed >= 10, s => Counter(s.CustomersServed, 10)),
            new MilestoneDefinition("served_50", s => s.CustomersServed >= 50, s => Counter(s.CustomersServed, 50)),
            new MilestoneDefinition("served_100", s => s.CustomersServed >= 100, s => Counter(s.CustomersServed, 100)),
            new MilestoneDefinition("earned_1000", s => s.TotalEarned >= 1000, s => Counter(s.TotalEarned, 1000, "$")),
            new MilestoneDefinition("earned_10000", s => s.TotalEarned >= 10000, s => Counter(s.TotalEarned, 10000, "$")),
            new MilestoneDefinition("streak_5", s => s.BestStreak >= 5, s => Counter(s.BestStreak, 5)),
            new MilestoneDefinition("streak_10", s => s.BestStreak >= 10, s => Counter(s.BestStreak, 10)),
            new MilestoneDefinition("first_vip", s => s.VipsServed >= 1),
            new MilestoneDefinition("all_styles", s => s.StylesTotal > 0 && s.StylesCut >= s.StylesTotal, s => Counter(s.StylesCut, s.StylesTotal)),
            new MilestoneDefinition("level_5", s => s.ShopLevel >= 5, s => Counter(s.ShopLevel, 5)),
            new MilestoneDefinition("first_goal", s => s.GoalsCompleted >= 1),
            new MilestoneDefinition("goals_10", s => s.GoalsCompleted >= 10, s => Counter(s.GoalsCompleted, 10))
        };

        private readonly SaveService _save;
        private readonly ShopProgression _progression;

        /// <summary>Every hairstyle the shop can be asked for ("all styles cut once").</summary>
        public Func<IReadOnlyList<HaircutRequest>> StyleSource { get; set; }

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

        private static string Counter(int value, int target, string prefix = "")
            => prefix + System.Math.Min(value, target).ToString("N0", System.Globalization.CultureInfo.InvariantCulture) + " / " + prefix + target.ToString("N0", System.Globalization.CultureInfo.InvariantCulture);

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
                ShopLevel = _progression.Level
            };

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

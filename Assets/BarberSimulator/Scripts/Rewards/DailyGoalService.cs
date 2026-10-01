using System;
using System.Collections.Generic;
using BarberSimulator.Economy;
using BarberSimulator.Haircut;
using BarberSimulator.Save;
using BarberSimulator.Shop;
using BarberSimulator.Workday;
using UnityEngine;

namespace BarberSimulator.Rewards
{
    /// <summary>
    /// Three goals every morning, drawn from <see cref="DailyGoalPool"/> and scaled with the shop level. Progress
    /// follows the economy events; finishing a goal pays cash and XP at once. Everything lives in
    /// <see cref="ProgressionData.goals"/>, so goals survive reloads.
    /// </summary>
    public sealed class DailyGoalService
    {
        private readonly SaveService _save;
        private readonly EconomyService _economy;
        private readonly ShopProgression _progression;
        private readonly StreakService _streak;

        /// <summary>Every hairstyle the shop can be asked for (style goals pick from the ones unlocked at the current level).</summary>
        public Func<IReadOnlyList<HaircutRequest>> StyleSource { get; set; }

        public IReadOnlyList<DailyGoalData> Goals => _save.Data.progression.goals.items;
        public int CompletedCount
        {
            get
            {
                int count = 0;
                foreach (var goal in Goals) if (goal.completed) count++;
                return count;
            }
        }

        /// <summary>Goals were generated or their progress changed.</summary>
        public event Action Changed;
        public event Action<DailyGoalData> GoalCompleted;
        /// <summary>A new set of goals was drawn (a new morning).</summary>
        public event Action Generated;

        public DailyGoalService(SaveService save, EconomyService economy, ShopProgression progression, StreakService streak, DayCycleService day)
        {
            _save = save;
            _economy = economy;
            _progression = progression;
            _streak = streak;
            economy.ServicePaid += OnServicePaid;
            economy.CustomerLost += OnCustomerLost;
            day.DayStarted += _ => EnsureToday(day.Day);
        }

        /// <summary>Draws the goals of <paramref name="day"/> when they do not exist yet. Returns true when new goals were drawn.</summary>
        public bool EnsureToday(int day)
        {
            var data = _save.Data.progression.goals;
            if (data.day == day && data.items.Count > 0) return false;

            data.day = day;
            data.items.Clear();
            int level = _progression.Level;
            var rng = new System.Random(day * 7919 + level * 131 + 17);

            var styles = UnlockedStyleKeys(level);
            var candidates = new List<GoalTemplate>();
            foreach (var template in DailyGoalPool.Templates)
            {
                if (template.MinShopLevel > level) continue;
                if (template.Kind == GoalKind.Style && styles.Count == 0) continue;
                candidates.Add(template);
            }

            for (int i = 0; i < DailyGoalPool.GoalsPerDay && candidates.Count > 0; i++)
            {
                int pick = rng.Next(candidates.Count);
                var template = candidates[pick];
                candidates.RemoveAt(pick);

                int target = template.TargetFor(level);
                var goal = new DailyGoalData
                {
                    kind = (int)template.Kind,
                    target = target,
                    param = template.Kind == GoalKind.Style ? styles[rng.Next(styles.Count)] : "",
                    rewardCash = template.CashFor(target),
                    rewardXp = template.XpFor(target)
                };
                SeedFromDayStats(goal);
                data.items.Add(goal);
            }

            _save.RequestSave();
            Generated?.Invoke();
            Changed?.Invoke();
            return true;
        }

        /// <summary>Goals drawn in the middle of a day (an old save) start with what the day already produced.</summary>
        private void SeedFromDayStats(DailyGoalData goal)
        {
            var stats = _save.Data.progression.dayStats;
            switch ((GoalKind)goal.kind)
            {
                case GoalKind.Serve: goal.progress = Mathf.Min(goal.target, stats.customersServed); break;
                case GoalKind.Tips: goal.progress = Mathf.Min(goal.target, stats.tips); break;
                case GoalKind.NoLoss:
                    goal.failed = stats.customersLost > 0;
                    goal.progress = goal.failed ? 0 : Mathf.Min(goal.target, stats.customersServed);
                    break;
            }
        }

        private List<string> UnlockedStyleKeys(int level)
        {
            var keys = new List<string>();
            var requests = StyleSource != null ? StyleSource() : null;
            if (requests == null) return keys;
            foreach (var request in requests)
                if (request != null && request.RequiredShopLevel <= level && !string.IsNullOrEmpty(request.NameKey) && !keys.Contains(request.NameKey))
                    keys.Add(request.NameKey);
            return keys;
        }

        private void OnServicePaid(ServicePayment payment)
        {
            var finished = new List<DailyGoalData>();
            bool changed = false;
            foreach (var goal in Goals)
            {
                if (goal.completed || goal.failed) continue;
                int before = goal.progress;
                switch ((GoalKind)goal.kind)
                {
                    case GoalKind.Serve:
                    case GoalKind.NoLoss:
                        goal.progress++;
                        break;
                    case GoalKind.Tips:
                        goal.progress += payment.Tip;
                        break;
                    case GoalKind.FiveStars:
                        if (payment.Stars >= 5) goal.progress++;
                        break;
                    case GoalKind.Style:
                        if (payment.ServiceNameKey == goal.param) goal.progress++;
                        break;
                    case GoalKind.Streak:
                        goal.progress = Mathf.Max(goal.progress, _streak.Current);
                        break;
                }
                goal.progress = Mathf.Min(goal.progress, goal.target);
                if (goal.progress != before) changed = true;
                if (goal.progress >= goal.target) finished.Add(goal);
            }

            if (changed) { _save.RequestSave(); Changed?.Invoke(); }
            foreach (var goal in finished) Complete(goal);
        }

        private void OnCustomerLost()
        {
            bool changed = false;
            foreach (var goal in Goals)
            {
                if (goal.completed || goal.failed || (GoalKind)goal.kind != GoalKind.NoLoss) continue;
                goal.failed = true;
                changed = true;
            }
            if (!changed) return;
            _save.RequestSave();
            Changed?.Invoke();
        }

        private void Complete(DailyGoalData goal)
        {
            if (goal.completed) return;
            goal.completed = true;
            goal.progress = goal.target;
            _save.Data.progression.goalsCompleted++;
            _economy.Add(goal.rewardCash);
            _progression.AddXp(goal.rewardXp);
            _save.RequestSave();
            Changed?.Invoke();
            GoalCompleted?.Invoke(goal);
        }
    }
}

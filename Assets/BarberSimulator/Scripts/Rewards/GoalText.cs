using BarberSimulator.Localization;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Rewards
{
    /// <summary>Turns a goal into its (localized) sentence.</summary>
    public static class GoalText
    {
        public static string Describe(LocalizationService loc, DailyGoalData goal)
        {
            switch ((GoalKind)goal.kind)
            {
                case GoalKind.Serve:
                    return loc.Format("goal.serve", goal.target);
                case GoalKind.Tips:
                    return loc.Format("goal.tips", Economy.EconomyService.Format(goal.target));
                case GoalKind.FiveStars:
                    return goal.target == 1 ? loc.Get("goal.five_star_one") : loc.Format("goal.five_stars", goal.target);
                case GoalKind.Style:
                    return goal.target == 1
                        ? loc.Format("goal.style", loc.Get(goal.param))
                        : loc.Format("goal.style_multi", loc.Get(goal.param), goal.target);
                case GoalKind.NoLoss:
                    return loc.Format("goal.no_loss", goal.target);
                case GoalKind.Streak:
                    return loc.Format("goal.streak", goal.target);
                default:
                    return string.Empty;
            }
        }

        /// <summary>"12 / 25" style counter; tip goals show money.</summary>
        public static string Counter(DailyGoalData goal)
        {
            if ((GoalKind)goal.kind == GoalKind.Tips)
                return Economy.EconomyService.Format(Mathf.Min(goal.progress, goal.target)) + " / " + Economy.EconomyService.Format(goal.target);
            return Mathf.Min(goal.progress, goal.target) + " / " + goal.target;
        }

        public static string Reward(LocalizationService loc, DailyGoalData goal)
            => loc.Format("goal.reward", Economy.EconomyService.Format(goal.rewardCash), goal.rewardXp);
    }
}

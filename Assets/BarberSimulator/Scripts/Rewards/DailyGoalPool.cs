using UnityEngine;

namespace BarberSimulator.Rewards
{
    /// <summary>What a daily goal asks for. Stored as an int in <see cref="Save.DailyGoalData.kind"/>.</summary>
    public enum GoalKind
    {
        /// <summary>Serve N customers.</summary>
        Serve = 0,
        /// <summary>Earn $N in tips.</summary>
        Tips = 1,
        /// <summary>Get N five-star cuts.</summary>
        FiveStars = 2,
        /// <summary>Finish a specific hairstyle.</summary>
        Style = 3,
        /// <summary>Serve N customers without losing one.</summary>
        NoLoss = 4,
        /// <summary>Reach a streak of N.</summary>
        Streak = 5
    }

    /// <summary>One entry of the goal pool: how big the goal is at which shop level and what it pays.</summary>
    public sealed class GoalTemplate
    {
        public readonly GoalKind Kind;
        public readonly int MinShopLevel;
        public readonly float BaseTarget;
        public readonly float TargetPerLevel;
        public readonly int MaxTarget;
        /// <summary>Rounds the target to a multiple of this (tips are rounded to $5).</summary>
        public readonly int TargetStep;
        public readonly float CashPerUnit;
        public readonly float XpPerUnit;

        public GoalTemplate(GoalKind kind, int minShopLevel, float baseTarget, float targetPerLevel, int maxTarget, int targetStep, float cashPerUnit, float xpPerUnit)
        {
            Kind = kind;
            MinShopLevel = minShopLevel;
            BaseTarget = baseTarget;
            TargetPerLevel = targetPerLevel;
            MaxTarget = maxTarget;
            TargetStep = Mathf.Max(1, targetStep);
            CashPerUnit = cashPerUnit;
            XpPerUnit = xpPerUnit;
        }

        /// <summary>The goal size for a shop level: grows linearly and is capped.</summary>
        public int TargetFor(int shopLevel)
        {
            float raw = BaseTarget + TargetPerLevel * Mathf.Max(0, shopLevel - 1);
            int target = Mathf.RoundToInt(raw / TargetStep) * TargetStep;
            return Mathf.Clamp(target, TargetStep, MaxTarget);
        }

        public int CashFor(int target) => Mathf.Max(5, Mathf.RoundToInt(target * CashPerUnit / 5f) * 5);
        public int XpFor(int target) => Mathf.Max(5, Mathf.RoundToInt(target * XpPerUnit));
    }

    /// <summary>The data the daily goals are drawn from. New goal types or tuning only need an entry here.</summary>
    public static class DailyGoalPool
    {
        public const int GoalsPerDay = 3;

        public static readonly GoalTemplate[] Templates =
        {
            //                    kind                min  base  /lvl  max  step  cash   xp
            new GoalTemplate(GoalKind.Serve,      1,   3f,   0.6f, 12,  1,    14f,   5f),
            new GoalTemplate(GoalKind.Tips,       1,   25f,  12f,  200, 5,    0.9f,  0.35f),
            new GoalTemplate(GoalKind.FiveStars,  1,   1f,   0.35f, 6,  1,    45f,   18f),
            new GoalTemplate(GoalKind.Style,      1,   1f,   0.2f, 3,   1,    40f,   16f),
            new GoalTemplate(GoalKind.NoLoss,     1,   3f,   0.5f, 10,  1,    16f,   6f),
            new GoalTemplate(GoalKind.Streak,     1,   3f,   0.45f, 10, 1,    22f,   8f)
        };
    }
}

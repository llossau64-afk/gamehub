using System;
using BarberSimulator.Economy;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Rewards
{
    /// <summary>
    /// Consecutive haircuts rated 4 stars or better. The streak raises the size of tips (it never touches the
    /// base price) and is lost by a cut of 3 stars or fewer or by a customer who walks out. Stored in
    /// <see cref="ProgressionData.streak"/>.
    /// </summary>
    public sealed class StreakService
    {
        public const int MinStars = 4;

        private readonly SaveService _save;

        public int Current => _save.Data.progression.streak;
        public int Best => _save.Data.progression.bestStreak;
        public float TipMultiplier => MultiplierFor(Current);

        /// <summary>(streak, previousStreak) after a good cut extended the streak.</summary>
        public event Action<int, int> Grew;
        /// <summary>(lostStreak) the streak that was just broken; only raised when it was at least 1.</summary>
        public event Action<int> Lost;

        public StreakService(SaveService save, EconomyService economy)
        {
            _save = save;
            economy.ServicePaid += OnServicePaid;
            economy.CustomerLost += OnCustomerLost;
        }

        /// <summary>Tip multiplier for a streak of <paramref name="streak"/> good cuts: x1.1 at 2, x1.25 at 4, x1.5 at 6+.</summary>
        public static float MultiplierFor(int streak)
        {
            if (streak >= 6) return 1.5f;
            if (streak >= 4) return 1.25f;
            if (streak >= 2) return 1.1f;
            return 1f;
        }

        /// <summary>The multiplier the cut being paid right now earns: a good cut counts towards its own streak.</summary>
        public float PreviewTipMultiplier(int stars) => MultiplierFor(stars >= MinStars ? Current + 1 : 0);

        private void OnServicePaid(ServicePayment payment)
        {
            if (payment.Stars >= MinStars) Extend();
            else Break();
        }

        private void OnCustomerLost() => Break();

        private void Extend()
        {
            var progression = _save.Data.progression;
            int previous = progression.streak;
            progression.streak = previous + 1;
            progression.bestStreak = Mathf.Max(progression.bestStreak, progression.streak);
            _save.RequestSave();
            Grew?.Invoke(progression.streak, previous);
        }

        private void Break()
        {
            var progression = _save.Data.progression;
            int lost = progression.streak;
            if (lost <= 0) return;
            progression.streak = 0;
            _save.RequestSave();
            Lost?.Invoke(lost);
        }
    }
}

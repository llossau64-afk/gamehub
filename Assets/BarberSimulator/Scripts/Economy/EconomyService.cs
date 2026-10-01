using System;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Economy
{
    /// <summary>Owns the player's money. Later phases add prices, salaries and purchases on top of this.</summary>
    public sealed class EconomyService
    {
        /// <summary>Score (0..1) a fade needs to count for the "Perfect Fade" achievement.</summary>
        public const float PerfectFadeQuality = 0.95f;

        private readonly SaveService _save;

        public int Money => _save.Data.player.money;
        public float Reputation => _save.Data.progression.reputation;
        public int CustomersServed => _save.Data.progression.customersServed;

        /// <summary>(newBalance, delta)</summary>
        public event Action<int, int> MoneyChanged;
        /// <summary>(newReputation, delta)</summary>
        public event Action<float, float> ReputationChanged;
        public event Action<ServicePayment> ServicePaid;
        public event Action CustomerLost;

        public EconomyService(SaveService save)
        {
            _save = save;
        }

        public void Add(int amount)
        {
            if (amount <= 0) return;
            _save.Data.player.money += amount;
            _save.RequestSave();
            MoneyChanged?.Invoke(Money, amount);
        }

        /// <summary>Books a completed service: money, reputation and the served counter, in one save.</summary>
        public void ReceivePayment(ServicePayment payment)
        {
            var progression = _save.Data.progression;
            progression.customersServed++;
            float before = progression.reputation;
            progression.reputation = Mathf.Clamp(before + payment.ReputationDelta, 0f, 100f);
            progression.totalTipsEarned += payment.Tip;
            progression.bestStars = Mathf.Max(progression.bestStars, payment.Stars);
            // Lifetime counters behind the milestones.
            progression.totalEarned += payment.Total;
            if (payment.Stars >= 5) progression.fiveStarCuts++;
            if (payment.IsVip) progression.vipsServed++;
            if (payment.IsFade && payment.Stars >= 5 && payment.Quality >= PerfectFadeQuality) progression.perfectFades++;
            if (!string.IsNullOrEmpty(payment.ServiceNameKey) && !progression.cutStyleIds.Contains(payment.ServiceNameKey))
                progression.cutStyleIds.Add(payment.ServiceNameKey);

            var day = progression.dayStats;
            day.customersServed++;
            day.revenue += payment.BasePrice;
            day.tips += payment.Tip;
            day.starsTotal += payment.Stars;
            Add(payment.Total);
            ReputationChanged?.Invoke(progression.reputation, progression.reputation - before);
            ServicePaid?.Invoke(payment);
            _save.RequestSave();
        }

        public void AdjustReputation(float delta)
        {
            var progression = _save.Data.progression;
            float before = progression.reputation;
            progression.reputation = Mathf.Clamp(before + delta, 0f, 100f);
            _save.RequestSave();
            ReputationChanged?.Invoke(progression.reputation, progression.reputation - before);
        }

        /// <summary>A customer walked out unhappy: reputation drops and the day's lost counter goes up.</summary>
        public void RegisterLostCustomer(float reputationPenalty)
        {
            _save.Data.progression.dayStats.customersLost++;
            AdjustReputation(-Mathf.Abs(reputationPenalty));
            CustomerLost?.Invoke();
        }

        /// <summary>Deducts a recurring cost (rent). Whatever the player cannot cover is waived, so money never goes negative. Returns the amount taken.</summary>
        public int Charge(int amount)
        {
            int paid = Mathf.Clamp(amount, 0, Money);
            if (paid <= 0) return 0;
            _save.Data.player.money -= paid;
            _save.RequestSave();
            MoneyChanged?.Invoke(Money, -paid);
            return paid;
        }

        public bool TrySpend(int amount)
        {
            if (amount <= 0 || Money < amount) return false;
            _save.Data.player.money -= amount;
            _save.RequestSave();
            MoneyChanged?.Invoke(Money, -amount);
            return true;
        }

        public static string Format(int amount) => "$" + amount.ToString("N0", System.Globalization.CultureInfo.InvariantCulture);
    }
}

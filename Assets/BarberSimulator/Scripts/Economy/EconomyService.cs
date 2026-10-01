using System;
using BarberSimulator.Save;

namespace BarberSimulator.Economy
{
    /// <summary>Owns the player's money. Later phases add prices, salaries and purchases on top of this.</summary>
    public sealed class EconomyService
    {
        private readonly SaveService _save;

        public int Money => _save.Data.player.money;

        /// <summary>(newBalance, delta)</summary>
        public event Action<int, int> MoneyChanged;

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

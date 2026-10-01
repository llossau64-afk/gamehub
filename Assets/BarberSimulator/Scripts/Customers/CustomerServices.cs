using System;
using BarberSimulator.Audio;
using BarberSimulator.Economy;
using BarberSimulator.Localization;
using BarberSimulator.Objectives;
using BarberSimulator.Save;

namespace BarberSimulator.Customers
{
    /// <summary>Short spoken lines and quick answers during gameplay (not the cinematic dialogue).</summary>
    public interface ICustomerDialoguePresenter
    {
        /// <param name="vip">VIP customers get a gold name tag.</param>
        void Say(string speaker, string text, float seconds, bool vip = false);
        void Ask(string speaker, string text, string[] options, Action<int> onChosen, bool vip = false);
        bool IsBusy { get; }
    }

    /// <summary>The small review notification after a customer leaves.</summary>
    public interface IReviewPresenter
    {
        void ShowReview(ServicePayment payment, string quote);
    }

    /// <summary>Everything customers need from the game, handed over once by the bootstrap.</summary>
    public sealed class CustomerServices
    {
        public AudioService Audio;
        public LocalizationService Localization;
        public EconomyService Economy;
        public ObjectiveService Objectives;
        public SaveService Save;
        public ICustomerDialoguePresenter Dialogue;
        public IReviewPresenter Reviews;
        public UI.IToastPresenter Toasts;
        public Shop.UpgradeEffects Upgrades;
        public Shop.ShopProgression Progression;
        public Rewards.StreakService Streak;
    }
}

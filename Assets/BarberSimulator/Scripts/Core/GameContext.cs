using BarberSimulator.Audio;
using BarberSimulator.Economy;
using BarberSimulator.Input;
using BarberSimulator.Localization;
using BarberSimulator.Objectives;
using BarberSimulator.Platform;
using BarberSimulator.Save;
using BarberSimulator.Settings;
using BarberSimulator.UI;

namespace BarberSimulator.Core
{
    /// <summary>
    /// The services created by <see cref="GameBootstrap"/>. Passed explicitly to the few systems that coordinate
    /// several services; individual components only receive what they need.
    /// </summary>
    public sealed class GameContext
    {
        public GameConfig Config;
        public SaveService Save;
        public SettingsService Settings;
        public QualityApplier Quality;
        public LocalizationService Localization;
        public AudioService Audio;
        public InputService Input;
        public EconomyService Economy;
        public ObjectiveService Objectives;
        public Shop.ShopProgression Progression;
        public Shop.UpgradeEffects UpgradeEffects;
        public Shop.UpgradeService Upgrades;
        public Workday.DayCycleService Day;
        public Rewards.StreakService Streak;
        public Rewards.DailyGoalService Goals;
        public Rewards.MilestoneService Milestones;
        public Rewards.RewardsPresenter RewardsUI;
        public UIRoot UI;
        public IPlatformService Platform;
        /// <summary>Rewarded / interstitial ads (mutes and pauses the game while they play).</summary>
        public IAdService Ads;
    }
}

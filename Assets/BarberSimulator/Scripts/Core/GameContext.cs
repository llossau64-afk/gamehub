using BarberSimulator.Audio;
using BarberSimulator.Economy;
using BarberSimulator.Input;
using BarberSimulator.Localization;
using BarberSimulator.Objectives;
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
        public UIRoot UI;
    }
}

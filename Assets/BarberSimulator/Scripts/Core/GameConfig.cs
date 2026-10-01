using BarberSimulator.Audio;
using BarberSimulator.Dialogue;
using BarberSimulator.Objectives;
using BarberSimulator.Platform;
using BarberSimulator.UI;
using UnityEngine;

namespace BarberSimulator.Core
{
    /// <summary>Top-level configuration asset referenced by the scene bootstrap.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Game Config", fileName = "GameConfig")]
    public sealed class GameConfig : ScriptableObject
    {
        public string versionLabel = "v0.1.0";
        public int startingMoney = 120;

        [Header("Content")]
        public UITheme uiTheme;
        public SoundLibrary sounds;
        public ObjectiveSequence objectives;
        public DialogueConversation introConversation;
        public Workday.WorkdayConfig workday;
        public Shop.UpgradeCatalog upgrades;

        [Header("Platform")]
        [Tooltip("Auto uses the CrazyGames SDK when the page provides it and runs without a portal otherwise.")]
        public PlatformMode platform = PlatformMode.Auto;

        [Header("Camera")]
        public float gameplayFieldOfView = 68f;

        [Header("Mix (0-1, multiplied by user volumes)")]
        public float menuMusicLevel = 0.8f;
        public float gameplayMusicLevel = 0.32f;
        public float shopAmbienceLevel = 0.75f;
        public float streetAmbienceInside = 0.45f;
        public float streetAmbienceOutside = 1f;
        public float insideStreetLowPass = 900f;
    }
}

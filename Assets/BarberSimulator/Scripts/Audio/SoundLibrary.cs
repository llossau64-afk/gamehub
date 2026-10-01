using UnityEngine;

namespace BarberSimulator.Audio
{
    /// <summary>Central list of clips so gameplay code never needs direct asset references.</summary>
    [CreateAssetMenu(menuName = "Barber Simulator/Audio/Sound Library", fileName = "SoundLibrary")]
    public sealed class SoundLibrary : ScriptableObject
    {
        [Header("Music")]
        public AudioClip menuMusic;

        [Header("Ambience")]
        public AudioClip shopAmbience;
        public AudioClip streetAmbience;

        [Header("UI")]
        public AudioClip uiHover;
        public AudioClip uiClick;
        public AudioClip uiBack;
        public AudioClip uiWhoosh;
        public AudioClip uiToast;

        [Header("World")]
        public AudioClip doorUnlock;
        public AudioClip doorOpen;
        public AudioClip doorClose;
        public AudioClip[] footsteps;
        public AudioClip trashPickup;
        public AudioClip objectiveComplete;
        public AudioClip inspectTools;
        public AudioClip clipperBuzz;
    }
}

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

        [Header("Haircut")]
        public AudioClip clipperStart;
        public AudioClip clipperLoop;
        public AudioClip clipperCuttingLoop;
        public AudioClip clipperStop;
        public AudioClip trimmerLoop;
        public AudioClip[] scissorSnips;
        public AudioClip[] combStrokes;
        public AudioClip hairFall;
        public AudioClip uiToolSelect;

        [Header("Customers")]
        public AudioClip chairCreak;
        public AudioClip clothSit;
        public AudioClip clothStand;
        public AudioClip capeSnap;
        public AudioClip cashRegister;
        public AudioClip coins;
        public AudioClip reviewGood;
        public AudioClip reviewBad;
    }
}

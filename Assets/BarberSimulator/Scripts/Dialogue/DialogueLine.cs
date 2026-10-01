using System;
using UnityEngine;

namespace BarberSimulator.Dialogue
{
    [Serializable]
    public sealed class DialogueLine
    {
        public SpeakerDefinition speaker;
        [Tooltip("Localization key of the spoken text.")]
        public string textKey;
        [Tooltip("Seconds the line stays on screen. 0 = derived from text length.")]
        public float duration;
        [Tooltip("Pause after the line before the next one starts.")]
        public float pauseAfter = 0.35f;
        public AudioClip voiceClip;
        [Tooltip("Animator trigger / procedural gesture sent to the speaking character.")]
        public string animationTrigger;
        [Tooltip("Event id broadcast when the line starts (cinematics listen for these).")]
        public string eventId;
    }
}

using System;
using System.Collections;
using BarberSimulator.Audio;
using BarberSimulator.Localization;
using UnityEngine;

namespace BarberSimulator.Dialogue
{
    /// <summary>
    /// Plays conversations line by line. Reusable for cinematics (auto-advance) and,
    /// in later phases, customer conversations (advance on input).
    /// </summary>
    public sealed class DialoguePlayer
    {
        private readonly IDialogueView _view;
        private readonly LocalizationService _localization;
        private readonly AudioService _audio;
        private bool _advanceRequested;

        public bool IsPlaying { get; private set; }

        /// <summary>Raised when a line starts: (line, index).</summary>
        public event Action<DialogueLine, int> LineStarted;
        /// <summary>Raised for lines that carry an event id.</summary>
        public event Action<string> EventRaised;

        public DialoguePlayer(IDialogueView view, LocalizationService localization, AudioService audio)
        {
            _view = view;
            _localization = localization;
            _audio = audio;
        }

        /// <summary>Skips the typewriter or, if fully shown, the remaining hold time of the current line.</summary>
        public void RequestAdvance()
        {
            if (!IsPlaying) return;
            if (_view.IsRevealing) _view.CompleteReveal();
            else _advanceRequested = true;
        }

        public IEnumerator Play(DialogueConversation conversation)
        {
            if (conversation == null) yield break;
            for (int i = 0; i < conversation.Lines.Count; i++)
                yield return PlayLine(conversation.Lines[i], i);
        }

        public IEnumerator PlayLine(DialogueLine line, int index = 0)
        {
            IsPlaying = true;
            _advanceRequested = false;

            string text = _localization.Get(line.textKey);
            string speakerName = line.speaker != null ? _localization.Get(line.speaker.NameKey) : string.Empty;
            var color = line.speaker != null ? line.speaker.NameColor : Color.white;
            var portrait = line.speaker != null ? line.speaker.Portrait : null;

            _view.ShowLine(speakerName, color, portrait, text);
            LineStarted?.Invoke(line, index);
            if (!string.IsNullOrEmpty(line.eventId)) EventRaised?.Invoke(line.eventId);
            if (line.voiceClip != null) _audio.PlayDialogue(line.voiceClip);
            else if (!string.IsNullOrEmpty(text)) _audio.PlayDialogueBlip(line.speaker != null && line.speaker.IsPlayer ? 0.74f : 0.58f);

            float hold = line.duration > 0f ? line.duration : EstimateDuration(text);
            float elapsed = 0f;
            while (elapsed < hold && !_advanceRequested)
            {
                elapsed += Time.deltaTime;
                yield return null;
            }

            _view.HideLine();
            IsPlaying = false;
            if (line.pauseAfter > 0f) yield return new WaitForSeconds(line.pauseAfter);
        }

        public static float EstimateDuration(string text)
        {
            // ~17 characters per second reading speed plus a short base hold.
            return Mathf.Clamp(1.0f + text.Length / 17f, 1.5f, 5.5f);
        }
    }
}

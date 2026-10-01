using System;
using System.Collections;
using BarberSimulator.Customers;
using BarberSimulator.Input;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Customer speech during gameplay: a quiet lower-third line, and for questions two short answer buttons.
    /// While answering, the cursor is released so desktop players can click; gameplay resumes on the answer.
    /// </summary>
    public sealed class GameplayDialogueView : UIView, ICustomerDialoguePresenter
    {
        private InputService _input;
        private Action _click;
        private Text _speaker;
        private Text _line;
        private CanvasGroup _lineGroup;
        private CanvasGroup _choicesGroup;
        private readonly MenuButton[] _choices = new MenuButton[2];
        private Action<int> _onChosen;
        private Coroutine _hideRoutine;
        private bool _restoreGameplay;

        public bool IsBusy => _onChosen != null;

        public void Bind(InputService input, Action clickSound)
        {
            _input = input;
            _click = clickSound;
        }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;
            var lower = UIFactory.Rect("Line", Root);
            UIFactory.Anchor(lower, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 250f), new Vector2(1200f, 120f));
            _lineGroup = Factory.Group(lower, 0f);
            _lineGroup.blocksRaycasts = false;
            var shade = Factory.Image("Shade", lower, theme.circleSoft, new Color(0f, 0f, 0f, 0.5f));
            UIFactory.Stretch(shade.rectTransform, 100f, 100f, -10f, -20f);
            _speaker = Factory.Label("Speaker", lower, theme.semiBoldFont, 18, theme.accent, TextAnchor.UpperCenter);
            UIFactory.Anchor(_speaker.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(1100f, 26f));
            UIFactory.Spacing(_speaker, 4f);
            _line = Factory.Label("Text", lower, theme.bodyFont, 32, theme.textPrimary, TextAnchor.UpperCenter);
            UIFactory.Anchor(_line.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -32f), new Vector2(1100f, 90f));
            UIFactory.SoftShadow(_line, new Color(0f, 0f, 0f, 0.85f), new Vector2(0f, -2f));

            var choices = UIFactory.Rect("Choices", Root);
            UIFactory.Anchor(choices, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 150f), new Vector2(700f, 70f));
            _choicesGroup = Factory.Group(choices, 0f);
            for (int i = 0; i < 2; i++)
            {
                int index = i;
                var rect = UIFactory.Rect("Choice " + i, choices);
                UIFactory.Anchor(rect, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(i == 0 ? -170f : 170f, 0f), new Vector2(320f, 62f));
                var bg = Factory.Image("Background", rect, theme.roundedRect, new Color(0.06f, 0.05f, 0.045f, 0.82f), raycast: true);
                UIFactory.Stretch(bg.rectTransform);
                var label = Factory.Label("Label", rect, theme.mediumFont, 24, theme.textPrimary, TextAnchor.MiddleCenter);
                UIFactory.Stretch(label.rectTransform);
                var button = rect.gameObject.AddComponent<Button>();
                button.transition = Selectable.Transition.None;
                var menu = rect.gameObject.AddComponent<MenuButton>();
                menu.Configure(label, null, theme.textPrimary, theme.accent, theme.textDisabled, theme.hoverDuration);
                button.onClick.AddListener(() => Choose(index));
                _choices[i] = menu;
            }
            UIAnimation.SetVisible(_choicesGroup, false);
        }

        /// <summary>The name tag: VIP customers get "VIP · NAME" in gold.</summary>
        private void SetSpeaker(string speaker, bool vip)
        {
            var theme = Factory.Theme;
            _speaker.text = vip ? Factory.Text.Get("vip.tag").ToUpperInvariant() + " · " + speaker.ToUpperInvariant() : speaker.ToUpperInvariant();
            _speaker.color = vip ? theme.vip : theme.accent;
        }

        public void Say(string speaker, string text, float seconds, bool vip = false)
        {
            if (string.IsNullOrEmpty(text) || IsBusy) return;
            if (!IsVisible) Show(true);
            SetSpeaker(speaker, vip);
            _line.text = text;
            _lineGroup.alpha = 1f;
            if (_hideRoutine != null) StopCoroutine(_hideRoutine);
            _hideRoutine = StartCoroutine(HideAfter(seconds));
        }

        public void Ask(string speaker, string text, string[] options, Action<int> onChosen, bool vip = false)
        {
            if (!IsVisible) Show(true);
            if (_hideRoutine != null) StopCoroutine(_hideRoutine);
            SetSpeaker(speaker, vip);
            _line.text = text;
            _lineGroup.alpha = 1f;
            for (int i = 0; i < _choices.Length; i++)
            {
                bool used = i < options.Length;
                _choices[i].gameObject.SetActive(used);
                if (used) _choices[i].Label.text = options[i];
            }
            _onChosen = onChosen;
            UIAnimation.SetVisible(_choicesGroup, true);

            // Free the cursor so the answer can be clicked; the player stands still while answering.
            _restoreGameplay = _input.GameplayEnabled;
            _input.GameplayEnabled = false;
            _input.SetCursorLock(false);
        }

        private void Choose(int index)
        {
            if (_onChosen == null) return;
            _click?.Invoke();
            var callback = _onChosen;
            _onChosen = null;
            UIAnimation.SetVisible(_choicesGroup, false);
            _lineGroup.alpha = 0f;
            if (_restoreGameplay)
            {
                _input.GameplayEnabled = true;
                _input.SetCursorLock(true);
            }
            callback(index);
        }

        private IEnumerator HideAfter(float seconds)
        {
            yield return UIAnimation.Wait(seconds);
            yield return UIAnimation.Fade(_lineGroup, 0f, 0.3f);
            _hideRoutine = null;
        }
    }
}

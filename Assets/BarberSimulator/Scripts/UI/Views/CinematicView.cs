using System;
using System.Collections;
using BarberSimulator.Dialogue;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Everything shown during cutscenes: letterbox bars, lower-third subtitles with speaker name,
    /// the hold-to-skip affordance, speaker portraits and the title card ("BARBER SHOP SIMULATOR").
    /// </summary>
    public sealed class CinematicView : UIView, IDialogueView
    {
        private const float CharactersPerSecond = 45f;

        private RectTransform _topBar;
        private RectTransform _bottomBar;
        private CanvasGroup _lineGroup;
        private Text _speaker;
        private const int BaseLineSize = 36;
        private Text _line;
        private Image _portrait;
        private CanvasGroup _skipGroup;
        private Text _skipLabel;
        private HoldButton _skipHold;
        private Image _skipFill;
        private Image _portraitFrame;
        private CanvasGroup _titleGroup;
        private Text _titleMain;
        private Text _titleSub;
        private Text _titleDay;
        private Image _titleRule;

        private string _fullText = string.Empty;
        private float _revealed;
        private bool _lineVisible;
        private float _lineAlpha;
        private float _barAmount;
        private float _barTarget;

        public bool IsRevealing => _lineVisible && _revealed < _fullText.Length;
        public event Action SkipClicked;

        /// <summary>True while the on-screen skip button is pressed (touch / mouse hold-to-skip).</summary>
        public bool SkipButtonHeld => _skipHold != null && _skipHold.IsHeld;

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            _topBar = Factory.Image("Letterbox Top", Root, null, Color.black).rectTransform;
            _topBar.anchorMin = new Vector2(0f, 1f);
            _topBar.anchorMax = new Vector2(1f, 1f);
            _topBar.pivot = new Vector2(0.5f, 1f);
            _bottomBar = Factory.Image("Letterbox Bottom", Root, null, Color.black).rectTransform;
            _bottomBar.anchorMin = new Vector2(0f, 0f);
            _bottomBar.anchorMax = new Vector2(1f, 0f);
            _bottomBar.pivot = new Vector2(0.5f, 0f);

            // Lower third
            var lower = UIFactory.Rect("Lower Third", Root);
            UIFactory.Anchor(lower, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 150f), new Vector2(1300f, 150f));
            _lineGroup = Factory.Group(lower, 0f);
            _lineGroup.blocksRaycasts = false;
            var shade = Factory.Image("Shade", lower, theme.circleSoft, new Color(0f, 0f, 0f, 0.5f));
            UIFactory.Stretch(shade.rectTransform, 80f, 80f, -10f, -30f);

            // Speaker portrait in a thin brass frame, left of the subtitle block.
            _portraitFrame = Factory.Image("Portrait Frame", lower, theme.roundedRect, new Color(theme.accent.r, theme.accent.g, theme.accent.b, 0.85f));
            UIFactory.Anchor(_portraitFrame.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(-590f, 6f), new Vector2(124f, 124f));
            _portrait = Factory.Image("Portrait", _portraitFrame.rectTransform, null, Color.white);
            UIFactory.Stretch(_portrait.rectTransform, 3f, 3f, 3f, 3f);
            _portrait.preserveAspect = true;
            _portraitFrame.gameObject.SetActive(false);

            _speaker = Factory.Label("Speaker", lower, theme.semiBoldFont, 20, theme.accent, TextAnchor.UpperCenter);
            UIFactory.Anchor(_speaker.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(1200f, 30f));
            UIFactory.Spacing(_speaker, 5f);

            _line = Factory.Label("Line", lower, theme.bodyFont, BaseLineSize, theme.textPrimary, TextAnchor.UpperCenter);
            UIFactory.Anchor(_line.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -38f), new Vector2(1200f, 110f));
            _line.lineSpacing = 1.1f;
            UIFactory.SoftShadow(_line, new Color(0f, 0f, 0f, 0.85f), new Vector2(0f, -2f));

            // Skip
            var skip = UIFactory.Rect("Skip", Root);
            UIFactory.Anchor(skip, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-40f, 40f), new Vector2(240f, 56f));
            _skipGroup = Factory.Group(skip, 0f);
            var skipButton = UIFactory.PlainButton(skip);
            _skipLabel = Factory.Label("Label", skip, theme.semiBoldFont, 20, theme.textMuted, TextAnchor.MiddleRight);
            UIFactory.Stretch(_skipLabel.rectTransform);
            UIFactory.Spacing(_skipLabel, 3f);
            var skipMenu = skip.gameObject.AddComponent<MenuButton>();
            skipMenu.Configure(_skipLabel, null, theme.textMuted, theme.textPrimary, theme.textDisabled, theme.hoverDuration);
            skipButton.onClick.AddListener(() => SkipClicked?.Invoke());
            _skipHold = skip.gameObject.AddComponent<HoldButton>();
            var track = Factory.Image("Hold Track", skip, null, new Color(1f, 1f, 1f, 0.12f));
            UIFactory.Anchor(track.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(0f, 2f), new Vector2(240f, 3f));
            track.rectTransform.pivot = new Vector2(1f, 0f);
            _skipFill = Factory.Image("Hold Fill", track.rectTransform, null, theme.accent);
            UIFactory.Stretch(_skipFill.rectTransform);
            _skipFill.type = Image.Type.Filled;
            _skipFill.fillMethod = Image.FillMethod.Horizontal;
            _skipFill.fillOrigin = 0;
            _skipFill.fillAmount = 0f;
            UIAnimation.SetVisible(_skipGroup, false);

            // Title card
            var title = UIFactory.Rect("Title Card", Root);
            UIFactory.Stretch(title);
            _titleGroup = Factory.Group(title, 0f);
            _titleGroup.blocksRaycasts = false;
            _titleMain = Factory.Label("Main", title, theme.displayFont, 120, theme.textPrimary, TextAnchor.MiddleCenter);
            _titleMain.text = "Barber Shop";
            UIFactory.Anchor(_titleMain.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 60f), new Vector2(1400f, 150f));
            UIFactory.SoftShadow(_titleMain, new Color(0f, 0f, 0f, 0.6f), new Vector2(0f, -3f));
            _titleSub = Factory.Label("Sub", title, theme.semiBoldFont, 28, theme.accent, TextAnchor.MiddleCenter);
            _titleSub.text = "SIMULATOR";
            UIFactory.Anchor(_titleSub.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -20f), new Vector2(800f, 40f));
            UIFactory.Spacing(_titleSub, 14f);
            _titleRule = Factory.Image("Rule", title, null, theme.accent);
            UIFactory.Anchor(_titleRule.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -70f), new Vector2(60f, 2f));
            _titleDay = Factory.Label("Day", title, theme.mediumFont, 34, theme.textPrimary, TextAnchor.MiddleCenter);
            UIFactory.Anchor(_titleDay.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -116f), new Vector2(800f, 50f));
            UIFactory.Spacing(_titleDay, 8f);
        }

        public void SetSkipLabel(string text) => _skipLabel.text = text.ToUpperInvariant();

        /// <summary>Hold-to-skip progress (0..1) drawn under the skip label.</summary>
        public void SetSkipProgress(float progress)
        {
            if (_skipFill != null) _skipFill.fillAmount = Mathf.Clamp01(progress);
        }

        public void SetLetterbox(bool on) => _barTarget = on ? 1f : 0f;

        public void ShowSkip(bool show)
        {
            _skipGroup.interactable = show;
            _skipGroup.blocksRaycasts = show;
            StartCoroutine(UIAnimation.Fade(_skipGroup, show ? 1f : 0f, 0.4f));
        }

        public IEnumerator PlayTitleCard(string day, float hold)
        {
            _titleDay.text = string.IsNullOrEmpty(day) ? string.Empty : day.ToUpperInvariant();
            var main = _titleMain.rectTransform;
            var restScale = Vector3.one;
            main.localScale = restScale * 1.04f;
            StartCoroutine(UIAnimation.Scale(main, restScale * 1.04f, restScale, hold + 1.6f));
            yield return UIAnimation.Fade(_titleGroup, 1f, 0.9f);
            yield return UIAnimation.Wait(hold);
            yield return UIAnimation.Fade(_titleGroup, 0f, 0.8f);
        }

        public void ShowLine(string speakerName, Color nameColor, Sprite portrait, string text)
        {
            _speaker.text = speakerName.ToUpperInvariant();
            _speaker.color = nameColor;
            _portraitFrame.gameObject.SetActive(portrait != null);
            _portrait.sprite = portrait;
            _fullText = text;
            _revealed = 0f;
            _line.fontSize = Mathf.RoundToInt(BaseLineSize * Settings.LiveSettings.SubtitleScale);
            _line.text = string.Empty;
            _lineVisible = true;
        }

        public void HideLine()
        {
            _lineVisible = false;
        }

        public void CompleteReveal()
        {
            _revealed = _fullText.Length;
            _line.text = _fullText;
        }

        protected override void OnShown()
        {
            _lineAlpha = 0f;
            _lineGroup.alpha = 0f;
            _titleGroup.alpha = 0f;
        }

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;

            if (_lineVisible && _revealed < _fullText.Length)
            {
                _revealed = Mathf.Min(_fullText.Length, _revealed + dt * CharactersPerSecond);
                // Reveal by alpha instead of substring so the line layout never jumps.
                int shown = Mathf.FloorToInt(_revealed);
                _line.text = _fullText.Substring(0, shown) + "<color=#00000000>" + _fullText.Substring(shown) + "</color>";
            }

            _lineAlpha = Mathf.MoveTowards(_lineAlpha, _lineVisible ? 1f : 0f, dt / 0.22f);
            _lineGroup.alpha = _lineAlpha;

            _barAmount = Mathf.MoveTowards(_barAmount, _barTarget, dt / 0.8f);
            float barHeight = Core.Easing.SmoothStep(_barAmount) * 90f;
            _topBar.sizeDelta = new Vector2(0f, barHeight);
            _bottomBar.sizeDelta = new Vector2(0f, barHeight);
        }
    }
}

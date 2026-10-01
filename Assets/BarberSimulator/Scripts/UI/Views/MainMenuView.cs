using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Left-aligned, text-led main menu over the live 3D shop. Content lives in a single column with a soft
    /// gradient for legibility; the rest of the screen belongs to the cinematic camera.
    /// </summary>
    public sealed class MainMenuView : UIView
    {
        private readonly List<MenuButton> _primary = new List<MenuButton>();
        private RectTransform _column;
        private CanvasGroup _columnGroup;
        private CanvasGroup _mainButtonsGroup;
        private CanvasGroup _confirmGroup;
        private MenuButton _continue;
        private Text _continueDetail;
        private Text _languageValue;
        private Text _version;

        public Action<MenuButton> RegisterSounds { get; set; }

        public event Action ContinueClicked;
        public event Action NewGameClicked;
        public event Action SettingsClicked;
        public event Action CreditsClicked;
        public event Action LanguageClicked;

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            var vignette = Factory.Image("Vignette", Root, theme.vignette, new Color(0f, 0f, 0f, 0.75f));
            UIFactory.Stretch(vignette.rectTransform);

            var gradient = Factory.Image("Left Gradient", Root, theme.gradientLeft, new Color(0.03f, 0.025f, 0.02f, 0.82f));
            gradient.rectTransform.anchorMin = new Vector2(0f, 0f);
            gradient.rectTransform.anchorMax = new Vector2(0f, 1f);
            gradient.rectTransform.pivot = new Vector2(0f, 0.5f);
            gradient.rectTransform.sizeDelta = new Vector2(1180f, 0f);

            _column = UIFactory.Rect("Column", Root);
            UIFactory.Anchor(_column, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(150f, 10f), new Vector2(680f, 860f));
            _columnGroup = Factory.Group(_column);

            // Title block
            var overline = Factory.Label("Overline", _column, theme.semiBoldFont, 18, theme.textMuted, TextAnchor.UpperLeft, "menu.overline", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(2f, -6f), new Vector2(680f, 30f));
            UIFactory.Spacing(overline, 5f);

            var title = Factory.Label("Title", _column, theme.displayFont, 132, theme.textPrimary, TextAnchor.UpperLeft);
            title.text = "Barbershop";
            title.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(-4f, -26f), new Vector2(760f, 160f));
            UIFactory.SoftShadow(title, new Color(0f, 0f, 0f, 0.45f), new Vector2(0f, -3f));

            var rule = Factory.Image("Rule", _column, null, theme.accent);
            UIFactory.Anchor(rule.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(2f, -196f), new Vector2(46f, 2f));

            var subtitle = Factory.Label("Subtitle", _column, theme.semiBoldFont, 30, theme.accent, TextAnchor.MiddleLeft);
            subtitle.text = "SIMULATOR";
            UIFactory.Anchor(subtitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(66f, -196f), new Vector2(500f, 40f));
            UIFactory.Spacing(subtitle, 14f);

            // Primary buttons
            var buttons = UIFactory.Rect("Buttons", _column);
            UIFactory.Anchor(buttons, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -290f), new Vector2(680f, 320f));
            _mainButtonsGroup = Factory.Group(buttons);

            _continue = CreateButton(buttons, "menu.continue", 0, () => ContinueClicked?.Invoke());
            _continueDetail = Factory.Label("Detail", _continue.Label.transform, theme.bodyFont, 21, theme.textMuted, TextAnchor.MiddleLeft);
            _continueDetail.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(_continueDetail.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(240f, -2f), new Vector2(300f, 30f));
            CreateButton(buttons, "menu.new_game", 1, () => NewGameClicked?.Invoke());
            CreateButton(buttons, "menu.settings", 2, () => SettingsClicked?.Invoke());

            // Secondary links
            var secondary = UIFactory.Rect("Secondary", _column);
            UIFactory.Anchor(secondary, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -640f), new Vector2(680f, 44f));
            var credits = CreateSmallLink(secondary, "menu.credits", 0f, 150f, () => CreditsClicked?.Invoke());
            var language = CreateSmallLink(secondary, "menu.language", 170f, 360f, () => LanguageClicked?.Invoke());
            _languageValue = language.Label;
            var dot = Factory.Label("Dot", secondary, theme.bodyFont, 22, theme.textMuted, TextAnchor.MiddleCenter);
            dot.text = "·";
            UIFactory.Anchor(dot.rectTransform, new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(150f, 0f), new Vector2(20f, 40f));
            _ = credits;

            BuildConfirm(buttons);

            _version = Factory.Label("Version", Root, theme.bodyFont, 18, new Color(theme.textMuted.r, theme.textMuted.g, theme.textMuted.b, 0.7f), TextAnchor.LowerRight);
            UIFactory.Anchor(_version.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-36f, 26f), new Vector2(400f, 30f));
        }

        private MenuButton CreateButton(Transform parent, string key, int index, Action onClick)
        {
            var theme = Factory.Theme;
            var rect = UIFactory.Rect("Button " + key, parent);
            UIFactory.Anchor(rect, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -index * 92f), new Vector2(520f, 76f));
            var button = UIFactory.PlainButton(rect);

            var accent = Factory.Image("Accent", rect, null, theme.accent);
            UIFactory.Anchor(accent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 6f), new Vector2(0f, 2f));

            var label = Factory.Label("Label", rect, theme.mediumFont, 42, theme.textPrimary, TextAnchor.MiddleLeft, key);
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 6f), new Vector2(500f, 56f));
            UIFactory.SoftShadow(label, new Color(0f, 0f, 0f, 0.4f), new Vector2(0f, -2f));

            var menuButton = rect.gameObject.AddComponent<MenuButton>();
            menuButton.Configure(label, accent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            button.onClick.AddListener(() => onClick());
            RegisterSounds?.Invoke(menuButton);
            _primary.Add(menuButton);
            return menuButton;
        }

        private MenuButton CreateSmallLink(Transform parent, string key, float x, float width, Action onClick)
        {
            var theme = Factory.Theme;
            var rect = UIFactory.Rect("Link " + key, parent);
            UIFactory.Anchor(rect, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(x, 0f), new Vector2(width, 44f));
            var button = UIFactory.PlainButton(rect);
            var label = Factory.Label("Label", rect, theme.mediumFont, 22, theme.textMuted, TextAnchor.MiddleLeft, key);
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(width, 40f));
            var menuButton = rect.gameObject.AddComponent<MenuButton>();
            menuButton.Configure(label, null, theme.textMuted, theme.textPrimary, theme.textDisabled, theme.hoverDuration);
            button.onClick.AddListener(() => onClick());
            RegisterSounds?.Invoke(menuButton);
            return menuButton;
        }

        private void BuildConfirm(Transform parent)
        {
            var theme = Factory.Theme;
            var rect = UIFactory.Rect("Confirm", parent);
            UIFactory.Stretch(rect);
            _confirmGroup = Factory.Group(rect, 0f);
            UIAnimation.SetVisible(_confirmGroup, false);

            var question = Factory.Label("Question", rect, theme.mediumFont, 30, theme.textPrimary, TextAnchor.UpperLeft, "menu.confirm_new");
            UIFactory.Anchor(question.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -6f), new Vector2(600f, 100f));

            var confirmRect = UIFactory.Rect("Yes", rect);
            UIFactory.Anchor(confirmRect, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -130f), new Vector2(440f, 64f));
            var confirmButton = UIFactory.PlainButton(confirmRect);
            var confirmAccent = Factory.Image("Accent", confirmRect, null, theme.accent);
            UIFactory.Anchor(confirmAccent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var confirmLabel = Factory.Label("Label", confirmRect, theme.mediumFont, 34, theme.accent, TextAnchor.MiddleLeft, "menu.confirm_yes");
            UIFactory.Anchor(confirmLabel.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(420f, 50f));
            var confirmMenu = confirmRect.gameObject.AddComponent<MenuButton>();
            confirmMenu.Configure(confirmLabel, confirmAccent, theme.accent, Color.white, theme.textDisabled, theme.hoverDuration);
            confirmButton.onClick.AddListener(() =>
            {
                ShowConfirm(false);
                NewGameConfirmed?.Invoke();
            });
            RegisterSounds?.Invoke(confirmMenu);

            var cancelRect = UIFactory.Rect("Cancel", rect);
            UIFactory.Anchor(cancelRect, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -200f), new Vector2(440f, 64f));
            var cancelButton = UIFactory.PlainButton(cancelRect);
            var cancelAccent = Factory.Image("Accent", cancelRect, null, theme.accent);
            UIFactory.Anchor(cancelAccent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var cancelLabel = Factory.Label("Label", cancelRect, theme.mediumFont, 34, theme.textPrimary, TextAnchor.MiddleLeft, "common.cancel");
            UIFactory.Anchor(cancelLabel.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(420f, 50f));
            var cancelMenu = cancelRect.gameObject.AddComponent<MenuButton>();
            cancelMenu.Configure(cancelLabel, cancelAccent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            cancelButton.onClick.AddListener(() => ShowConfirm(false));
            RegisterSounds?.Invoke(cancelMenu);
        }

        public event Action NewGameConfirmed;

        public void ShowConfirm(bool show)
        {
            StartCoroutine(SwapGroups(show ? _mainButtonsGroup : _confirmGroup, show ? _confirmGroup : _mainButtonsGroup));
        }

        private IEnumerator SwapGroups(CanvasGroup from, CanvasGroup to)
        {
            from.interactable = from.blocksRaycasts = false;
            yield return UIAnimation.Fade(from, 0f, 0.15f);
            to.interactable = to.blocksRaycasts = true;
            yield return UIAnimation.Fade(to, 1f, 0.2f);
        }

        public void SetContinueState(bool available, string detail)
        {
            _continue.SetInteractable(available);
            _continueDetail.text = available ? detail : string.Empty;
            // Sit just after the localized word, whatever its length.
            float x = _continue.Label.preferredWidth + 26f;
            _continueDetail.rectTransform.anchoredPosition = new Vector2(x, -2f);
        }

        public void SetLanguageLabel(string text) => _languageValue.text = text;
        public void SetVersion(string text) => _version.text = text;

        protected override void OnShown()
        {
            UIAnimation.SetVisible(_mainButtonsGroup, true);
            UIAnimation.SetVisible(_confirmGroup, false);
        }

        protected override IEnumerator ShowRoutine()
        {
            Group.alpha = 1f;
            var target = new Vector2(150f, 10f);
            _columnGroup.alpha = 0f;
            yield return UIAnimation.FadeAndSlide(_columnGroup, _column, 1f, target + new Vector2(-24f, 0f), target, 0.7f);
        }

        protected override IEnumerator HideRoutine()
        {
            yield return UIAnimation.Fade(Group, 0f, 0.45f);
            gameObject.SetActive(false);
        }
    }
}

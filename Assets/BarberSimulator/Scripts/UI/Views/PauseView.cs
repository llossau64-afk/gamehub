using System;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    public sealed class PauseView : UIView
    {
        public event Action ResumeClicked;
        public event Action AchievementsClicked;
        public event Action SettingsClicked;
        public event Action MainMenuClicked;
        public Action<MenuButton> RegisterSounds { get; set; }

        private RectTransform _column;

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            var dim = Factory.Image("Dim", Root, null, new Color(0f, 0f, 0f, 0.45f), raycast: true);
            UIFactory.Stretch(dim.rectTransform);
            var vignette = Factory.Image("Vignette", Root, theme.vignette, new Color(0f, 0f, 0f, 0.8f));
            UIFactory.Stretch(vignette.rectTransform);
            var gradient = Factory.Image("Gradient", Root, theme.gradientLeft, new Color(0.03f, 0.025f, 0.02f, 0.85f));
            gradient.rectTransform.anchorMin = new Vector2(0f, 0f);
            gradient.rectTransform.anchorMax = new Vector2(0f, 1f);
            gradient.rectTransform.pivot = new Vector2(0f, 0.5f);
            gradient.rectTransform.sizeDelta = new Vector2(1000f, 0f);

            _column = UIFactory.Rect("Column", Root);
            UIFactory.Anchor(_column, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(150f, 0f), new Vector2(600f, 610f));

            var overline = Factory.Label("Overline", _column, theme.semiBoldFont, 18, theme.accent, TextAnchor.UpperLeft, "pause.overline", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(2f, 0f), new Vector2(600f, 30f));
            UIFactory.Spacing(overline, 5f);

            var title = Factory.Label("Title", _column, theme.displayFont, 96, theme.textPrimary, TextAnchor.UpperLeft, "pause.title");
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(-2f, -30f), new Vector2(600f, 120f));

            AddButton("pause.resume", 0, () => ResumeClicked?.Invoke());
            AddButton("pause.achievements", 1, () => AchievementsClicked?.Invoke());
            AddButton("menu.settings", 2, () => SettingsClicked?.Invoke());
            AddButton("pause.main_menu", 3, () => MainMenuClicked?.Invoke());
        }

        private void AddButton(string key, int index, Action onClick)
        {
            var theme = Factory.Theme;
            var rect = UIFactory.Rect("Button " + key, _column);
            UIFactory.Anchor(rect, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -190f - index * 84f), new Vector2(480f, 70f));
            var button = UIFactory.PlainButton(rect);
            var accent = Factory.Image("Accent", rect, null, theme.accent);
            UIFactory.Anchor(accent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var label = Factory.Label("Label", rect, theme.mediumFont, 38, theme.textPrimary, TextAnchor.MiddleLeft, key);
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(460f, 54f));
            var menuButton = rect.gameObject.AddComponent<MenuButton>();
            menuButton.Configure(label, accent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            button.onClick.AddListener(() => onClick());
            RegisterSounds?.Invoke(menuButton);
        }
    }
}

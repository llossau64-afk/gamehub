using System;
using UnityEngine;

namespace BarberSimulator.UI
{
    public sealed class CreditsView : UIView
    {
        public event Action BackClicked;
        public Action<MenuButton> RegisterSounds { get; set; }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;
            var gradient = Factory.Image("Gradient", Root, theme.gradientLeft, new Color(0.03f, 0.025f, 0.02f, 0.9f));
            gradient.rectTransform.anchorMin = new Vector2(0f, 0f);
            gradient.rectTransform.anchorMax = new Vector2(0f, 1f);
            gradient.rectTransform.pivot = new Vector2(0f, 0.5f);
            gradient.rectTransform.sizeDelta = new Vector2(1300f, 0f);

            var column = UIFactory.Rect("Column", Root);
            UIFactory.Anchor(column, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(150f, 0f), new Vector2(760f, 760f));

            var title = Factory.Label("Title", column, theme.displayFont, 72, theme.textPrimary, TextAnchor.UpperLeft, "credits.title");
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), Vector2.zero, new Vector2(760f, 96f));

            var body = Factory.Label("Body", column, theme.bodyFont, 24, theme.textMuted, TextAnchor.UpperLeft, "credits.body");
            body.lineSpacing = 1.25f;
            UIFactory.Anchor(body.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -130f), new Vector2(720f, 520f));

            var backRect = UIFactory.Rect("Back", column);
            UIFactory.Anchor(backRect, new Vector2(0f, 0f), new Vector2(0f, 0f), Vector2.zero, new Vector2(300f, 64f));
            var button = UIFactory.PlainButton(backRect);
            var accent = Factory.Image("Accent", backRect, null, theme.accent);
            UIFactory.Anchor(accent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var label = Factory.Label("Label", backRect, theme.mediumFont, 34, theme.textPrimary, TextAnchor.MiddleLeft, "common.back");
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(280f, 50f));
            var menuButton = backRect.gameObject.AddComponent<MenuButton>();
            menuButton.Configure(label, accent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            button.onClick.AddListener(() => BackClicked?.Invoke());
            RegisterSounds?.Invoke(menuButton);
        }
    }
}

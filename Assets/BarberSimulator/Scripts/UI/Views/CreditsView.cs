using UnityEngine;

namespace BarberSimulator.UI
{
    /// <summary>Credits, opened inside the main menu.</summary>
    public sealed class CreditsView : MenuPanelView
    {
        protected override float PanelWidth => 960f;
        protected override float PanelHeight => 800f;
        protected override string TitleKey => "credits.title";
        protected override string OverlineKey => "credits.overline";

        protected override void OnBuildPanel(RectTransform content)
        {
            var theme = Factory.Theme;
            var body = Factory.Label("Body", content, theme.bodyFont, 24, theme.textMuted, TextAnchor.UpperLeft, "credits.body");
            body.lineSpacing = 1.3f;
            UIFactory.Stretch(body.rectTransform, 0f, 0f, 12f, 0f);
        }
    }
}

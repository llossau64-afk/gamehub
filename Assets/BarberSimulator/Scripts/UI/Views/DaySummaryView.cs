using System;
using BarberSimulator.Economy;
using BarberSimulator.Workday;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// End-of-day report: customers, earnings, rating, reputation, experience and the rent that was deducted.
    /// "Next day" hands control back to the flow controller (save, fade, new morning).
    /// </summary>
    public sealed class DaySummaryView : UIView
    {
        private const float RowSpacing = 46f;

        private Text _title;
        private Text _served, _lost, _revenue, _tips, _ratingValue, _reputation, _xp, _rent, _net, _levelUp;
        private readonly Image[] _stars = new Image[5];
        private DaySummary _summary;
        private bool _hasSummary;

        public event Action NextDayClicked;
        public Action<MenuButton> RegisterSounds { get; set; }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            var dim = Factory.Image("Dim", Root, null, new Color(0f, 0f, 0f, 0.66f), raycast: true);
            UIFactory.Stretch(dim.rectTransform);
            var vignette = Factory.Image("Vignette", Root, theme.vignette, new Color(0f, 0f, 0f, 0.8f));
            UIFactory.Stretch(vignette.rectTransform);

            var panel = UIFactory.Rect("Panel", Root);
            UIFactory.Anchor(panel, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(860f, 900f));
            var bg = Factory.Image("Background", panel, theme.roundedRect, new Color(0.05f, 0.042f, 0.036f, 0.94f), raycast: true);
            UIFactory.Stretch(bg.rectTransform);

            var overline = Factory.Label("Overline", panel, theme.semiBoldFont, 18, theme.accent, TextAnchor.UpperCenter, "summary.overline", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -36f), new Vector2(760f, 28f));
            UIFactory.Spacing(overline, 5f);
            _title = Factory.Label("Title", panel, theme.displayFont, 68, theme.textPrimary, TextAnchor.UpperCenter);
            UIFactory.Anchor(_title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -66f), new Vector2(760f, 90f));
            var rule = Factory.Image("Rule", panel, null, theme.accent);
            UIFactory.Anchor(rule.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -166f), new Vector2(40f, 2f));

            int row = 0;
            _served = AddRow(panel, "summary.served", row++);
            _lost = AddRow(panel, "summary.lost", row++);
            _revenue = AddRow(panel, "summary.revenue", row++);
            _tips = AddRow(panel, "summary.tips", row++);
            _ratingValue = AddRow(panel, "summary.rating", row++);
            for (int i = 0; i < _stars.Length; i++)
            {
                _stars[i] = Factory.Image("Star " + i, panel, theme.iconStar, theme.accent);
                UIFactory.Anchor(_stars[i].rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-50f - (4 - i) * 30f, RowY(4) - 8f), new Vector2(24f, 24f));
            }
            _reputation = AddRow(panel, "summary.reputation", row++);
            _xp = AddRow(panel, "summary.xp", row++);
            _rent = AddRow(panel, "summary.rent", row++);

            var divider = Factory.Image("Divider", panel, null, theme.panelLine);
            UIFactory.Anchor(divider.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, RowY(row) + 8f), new Vector2(760f, 1f));
            _net = AddRow(panel, "summary.net", row++, big: true);

            _levelUp = Factory.Label("LevelUp", panel, theme.semiBoldFont, 22, theme.accent, TextAnchor.UpperCenter);
            UIFactory.Anchor(_levelUp.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, RowY(row) - 20f), new Vector2(760f, 32f));

            var buttonRect = UIFactory.Rect("Next Day", panel);
            UIFactory.Anchor(buttonRect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(360f, 70f));
            var button = UIFactory.PlainButton(buttonRect);
            var accent = Factory.Image("Accent", buttonRect, null, theme.accent);
            UIFactory.Anchor(accent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var label = Factory.Label("Label", buttonRect, theme.mediumFont, 38, theme.textPrimary, TextAnchor.MiddleLeft, "summary.next_day");
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(340f, 54f));
            var menuButton = buttonRect.gameObject.AddComponent<MenuButton>();
            menuButton.Configure(label, accent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            button.onClick.AddListener(() => NextDayClicked?.Invoke());
            RegisterSounds?.Invoke(menuButton);

            Factory.Text.OnLanguageChanged(() => { if (_hasSummary) Render(); });
        }

        private static float RowY(int index) => -190f - index * RowSpacing;

        private Text AddRow(RectTransform panel, string key, int index, bool big = false)
        {
            var theme = Factory.Theme;
            var label = Factory.Label("Label " + key, panel, big ? theme.semiBoldFont : theme.bodyFont, big ? 28 : 24, big ? theme.textPrimary : theme.textMuted, TextAnchor.MiddleLeft, key);
            UIFactory.Anchor(label.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(-190f, RowY(index)), new Vector2(380f, 40f));
            var value = Factory.Label("Value " + key, panel, big ? theme.displayFont : theme.semiBoldFont, big ? 40 : 26, theme.textPrimary, TextAnchor.MiddleRight);
            UIFactory.Anchor(value.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(190f, RowY(index)), new Vector2(380f, big ? 52f : 40f));
            return value;
        }

        public void Show(DaySummary summary)
        {
            _summary = summary;
            _hasSummary = true;
            Render();
            Show();
        }

        private void Render()
        {
            var theme = Factory.Theme;
            var loc = Factory.Text.Service;
            var s = _summary;
            var good = new Color(0.62f, 0.82f, 0.55f);
            var bad = new Color(0.9f, 0.5f, 0.42f);

            _title.text = loc.Format("summary.title", s.Day);
            _served.text = s.CustomersServed.ToString();
            _lost.text = s.CustomersLost.ToString();
            _lost.color = s.CustomersLost > 0 ? bad : theme.textPrimary;
            _revenue.text = EconomyService.Format(s.Revenue);
            _tips.text = EconomyService.Format(s.Tips);
            _ratingValue.text = s.CustomersServed > 0 ? s.AverageStars.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture) : "–";
            for (int i = 0; i < _stars.Length; i++)
                _stars[i].color = s.CustomersServed > 0 && i < Mathf.RoundToInt(s.AverageStars) ? theme.accent : new Color(1f, 1f, 1f, 0.15f);
            // The rating number sits left of the stars.
            _ratingValue.rectTransform.anchoredPosition = new Vector2(190f - 160f, RowY(4));

            string rep = (s.ReputationChange >= 0f ? "+" : "−") + Mathf.Abs(s.ReputationChange).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
            _reputation.text = rep;
            _reputation.color = s.ReputationChange > 0.05f ? good : (s.ReputationChange < -0.05f ? bad : theme.textPrimary);
            _xp.text = "+" + s.XpEarned;
            _rent.text = s.Rent > 0 ? "−" + EconomyService.Format(s.Rent) : EconomyService.Format(0);
            _rent.color = s.Rent > 0 ? bad : theme.textMuted;
            _net.text = (s.Net >= 0 ? "+" : "−") + EconomyService.Format(Mathf.Abs(s.Net));
            _net.color = s.Net >= 0 ? good : bad;
            _levelUp.text = s.LevelAfter > s.LevelBefore ? loc.Format("summary.level_up", s.LevelAfter) : string.Empty;
        }
    }
}

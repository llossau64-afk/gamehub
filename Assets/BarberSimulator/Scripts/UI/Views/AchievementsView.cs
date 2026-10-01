using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// The achievements as a grid of cards: medallion icon, title, description, and either a progress bar with "7 / 10"
    /// (counted achievements), a LOCKED tag, or UNLOCKED. Opened from the main menu and from the pause menu; the rows are
    /// pulled from <see cref="Source"/> each time it opens.
    /// </summary>
    public sealed class AchievementsView : MenuPanelView
    {
        private const int MaxCards = 30;
        private const int Columns = 3;
        private const float CardWidth = 380f;
        private const float CardHeight = 122f;
        private const float Gap = 14f;

        private sealed class Card
        {
            public RectTransform Root;
            public Image Background;
            public Image Medallion;
            public Image Icon;
            public Text Title;
            public Text Description;
            public Text Status;
            public Image BarTrack;
            public Image BarFill;
        }

        private readonly List<Card> _cards = new List<Card>();
        private RectTransform _grid;
        private ScrollRect _scroll;
        private Text _counter;

        protected override float PanelWidth => 1280f;
        protected override float PanelHeight => 920f;
        protected override string TitleKey => "achievements.title";
        protected override string OverlineKey => "achievements.overline";

        /// <summary>Supplies the rows (current language, current unlock state).</summary>
        public Func<IReadOnlyList<AchievementRow>> Source { get; set; }

        protected override void OnBuildPanel(RectTransform content)
        {
            var theme = Factory.Theme;

            _counter = Factory.Label("Counter", Panel, theme.semiBoldFont, 22, theme.textMuted, TextAnchor.UpperRight);
            UIFactory.Anchor(_counter.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-48f, -66f), new Vector2(520f, 30f));

            var viewport = UIFactory.Rect("Viewport", content);
            UIFactory.Stretch(viewport);
            viewport.gameObject.AddComponent<RectMask2D>();
            UIFactory.HitArea(viewport);

            _grid = UIFactory.Rect("Grid", viewport);
            _grid.anchorMin = new Vector2(0f, 1f);
            _grid.anchorMax = new Vector2(1f, 1f);
            _grid.pivot = new Vector2(0.5f, 1f);
            _grid.anchoredPosition = Vector2.zero;
            _grid.sizeDelta = new Vector2(0f, 400f);

            _scroll = viewport.gameObject.AddComponent<ScrollRect>();
            _scroll.content = _grid;
            _scroll.viewport = viewport;
            _scroll.horizontal = false;
            _scroll.vertical = true;
            _scroll.movementType = ScrollRect.MovementType.Clamped;
            _scroll.scrollSensitivity = 40f;
            _scroll.inertia = true;

            for (int i = 0; i < MaxCards; i++) _cards.Add(BuildCard(i));

            Factory.Text.OnLanguageChanged(() => { if (IsVisible) Render(); });
        }

        private Card BuildCard(int index)
        {
            var theme = Factory.Theme;
            var card = new Card { Root = UIFactory.Rect("Card " + index, _grid) };
            card.Root.anchorMin = card.Root.anchorMax = new Vector2(0f, 1f);
            card.Root.pivot = new Vector2(0f, 1f);
            card.Root.sizeDelta = new Vector2(CardWidth, CardHeight);

            card.Background = Factory.Image("Background", card.Root, null, theme.panelRaised);
            UIFactory.Stretch(card.Background.rectTransform);
            AddBorder(card.Root, theme.panelLine);

            card.Medallion = Factory.Image("Medallion", card.Root, theme.circleSolid, theme.leather);
            UIFactory.Anchor(card.Medallion.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(16f, 0f), new Vector2(68f, 68f));
            card.Icon = Factory.Image("Icon", card.Medallion.rectTransform, null, theme.textMuted);
            card.Icon.preserveAspect = true;
            UIFactory.Anchor(card.Icon.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(34f, 34f));

            card.Title = Factory.Label("Title", card.Root, theme.semiBoldFont, 22, theme.textPrimary, TextAnchor.UpperLeft);
            card.Title.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(card.Title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(102f, -14f), new Vector2(CardWidth - 118f, 30f));

            card.Description = Factory.Label("Description", card.Root, theme.bodyFont, 17, theme.textMuted, TextAnchor.UpperLeft);
            card.Description.lineSpacing = 1.05f;
            UIFactory.Anchor(card.Description.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(102f, -44f), new Vector2(CardWidth - 118f, 46f));

            card.Status = Factory.Label("Status", card.Root, theme.semiBoldFont, 15, theme.textMuted, TextAnchor.LowerRight);
            card.Status.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(card.Status.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-16f, 12f), new Vector2(150f, 22f));
            UIFactory.Spacing(card.Status, 1.5f);

            card.BarTrack = Factory.Image("Bar", card.Root, null, new Color(1f, 0.95f, 0.85f, 0.12f));
            UIFactory.Anchor(card.BarTrack.rectTransform, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(102f, 20f), new Vector2(CardWidth - 102f - 100f, 4f));
            card.BarFill = Factory.Image("Fill", card.BarTrack.rectTransform, null, theme.barberRed);
            card.BarFill.rectTransform.anchorMin = new Vector2(0f, 0f);
            card.BarFill.rectTransform.anchorMax = new Vector2(0f, 1f);
            card.BarFill.rectTransform.pivot = new Vector2(0f, 0.5f);
            card.BarFill.rectTransform.anchoredPosition = Vector2.zero;
            card.Root.gameObject.SetActive(false);
            return card;
        }

        protected override void OnShown()
        {
            base.OnShown();
            Render();
            _scroll.verticalNormalizedPosition = 1f;
        }

        private Sprite IconFor(string id)
        {
            var theme = Factory.Theme;
            if (string.IsNullOrEmpty(id)) return theme.iconCheck;
            switch (id)
            {
                case "first_cut":
                case "perfect_fade":
                case "all_styles": return theme.iconScissors;
                case "first_five_star":
                case "first_vip":
                case "streak_5":
                case "streak_10": return theme.iconStar;
                case "busy_day": return theme.iconHand;
                case "shop_owner":
                case "level_5":
                case "barber_empire":
                case "earned_1000":
                case "earned_10000": return theme.iconGear;
                default: return theme.iconCheck;
            }
        }

        private void Render()
        {
            var theme = Factory.Theme;
            var loc = Factory.Text;
            var rows = Source != null ? Source() : null;
            int unlocked = 0;
            int used = rows != null ? Math.Min(rows.Count, MaxCards) : 0;
            float fullWidth = Columns * CardWidth + (Columns - 1) * Gap;
            float startX = (ContentWidth - fullWidth) * 0.5f;

            for (int i = 0; i < _cards.Count; i++)
            {
                var card = _cards[i];
                bool active = i < used;
                card.Root.gameObject.SetActive(active);
                if (!active) continue;

                var row = rows[i];
                if (row.Unlocked) unlocked++;
                int column = i % Columns;
                int line = i / Columns;
                card.Root.anchoredPosition = new Vector2(startX + column * (CardWidth + Gap), -line * (CardHeight + Gap));

                card.Title.text = row.Title;
                card.Description.text = row.Description;
                card.Title.color = row.Unlocked ? theme.textPrimary : theme.textMuted;
                card.Description.color = row.Unlocked ? theme.textMuted : theme.textDisabled;
                card.Background.color = row.Unlocked ? theme.panelRaised : new Color(theme.panelRaised.r * 0.78f, theme.panelRaised.g * 0.78f, theme.panelRaised.b * 0.78f, 1f);
                card.Medallion.color = row.Unlocked ? theme.accent : theme.leather;
                card.Icon.sprite = IconFor(row.Id);
                card.Icon.color = row.Unlocked ? new Color(0.1f, 0.075f, 0.05f) : new Color(1f, 0.95f, 0.85f, 0.28f);

                bool showBar = row.HasProgress && !row.Unlocked;
                card.BarTrack.gameObject.SetActive(showBar);
                if (showBar)
                {
                    float width = CardWidth - 102f - 100f;
                    card.BarFill.rectTransform.sizeDelta = new Vector2(width * Mathf.Clamp01(row.Progress01), 0f);
                }

                if (row.Unlocked)
                {
                    card.Status.text = loc.Get("achievements.unlocked").ToUpperInvariant();
                    card.Status.color = theme.accent;
                }
                else if (row.HasProgress && !string.IsNullOrEmpty(row.Progress))
                {
                    card.Status.text = row.Progress.Replace(" / ", "/");
                    card.Status.color = theme.textPrimary;
                }
                else
                {
                    card.Status.text = loc.Get("achievements.locked").ToUpperInvariant();
                    card.Status.color = theme.textDisabled;
                }
            }

            int rowsUsed = (used + Columns - 1) / Columns;
            _grid.sizeDelta = new Vector2(0f, Mathf.Max(ContentHeight, rowsUsed * (CardHeight + Gap)));
            _counter.text = loc.Service.Format("achievements.counter", unlocked, rows != null ? rows.Count : 0);
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// The milestone list, opened from the pause menu: every achievement with its description, a check when it is
    /// unlocked and a progress counter while it is not. The rows are pulled from <see cref="Source"/> each time it opens.
    /// </summary>
    public sealed class AchievementsView : UIView
    {
        private const int MaxRows = 14;
        private const int Columns = 2;
        private const int RowsPerColumn = 7;
        private const float CellWidth = 440f;
        private const float CellHeight = 74f;

        private sealed class Cell
        {
            public RectTransform Root;
            public Image Icon;
            public Text Title;
            public Text Description;
            public Text Progress;
        }

        private readonly List<Cell> _cells = new List<Cell>();
        private Text _counter;

        public event Action BackClicked;
        public Action<MenuButton> RegisterSounds { get; set; }
        /// <summary>Supplies the rows (current language, current unlock state).</summary>
        public Func<IReadOnlyList<AchievementRow>> Source { get; set; }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            var dim = Factory.Image("Dim", Root, null, new Color(0f, 0f, 0f, 0.66f), raycast: true);
            UIFactory.Stretch(dim.rectTransform);
            var vignette = Factory.Image("Vignette", Root, theme.vignette, new Color(0f, 0f, 0f, 0.8f));
            UIFactory.Stretch(vignette.rectTransform);

            var panel = UIFactory.Rect("Panel", Root);
            UIFactory.Anchor(panel, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1000f, 860f));
            var bg = Factory.Image("Background", panel, theme.roundedRect, new Color(0.05f, 0.042f, 0.036f, 0.94f), raycast: true);
            UIFactory.Stretch(bg.rectTransform);

            var overline = Factory.Label("Overline", panel, theme.semiBoldFont, 18, theme.accent, TextAnchor.UpperCenter, "achievements.overline", upper: true);
            UIFactory.Anchor(overline.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -32f), new Vector2(900f, 28f));
            UIFactory.Spacing(overline, 5f);
            var title = Factory.Label("Title", panel, theme.displayFont, 60, theme.textPrimary, TextAnchor.UpperCenter, "achievements.title");
            UIFactory.Anchor(title.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -58f), new Vector2(900f, 80f));
            _counter = Factory.Label("Counter", panel, theme.semiBoldFont, 22, theme.textMuted, TextAnchor.UpperCenter);
            UIFactory.Anchor(_counter.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -140f), new Vector2(900f, 30f));
            var rule = Factory.Image("Rule", panel, null, theme.accent);
            UIFactory.Anchor(rule.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -176f), new Vector2(40f, 2f));

            for (int i = 0; i < MaxRows; i++)
            {
                int column = i / RowsPerColumn;
                int row = i % RowsPerColumn;
                var cell = new Cell { Root = UIFactory.Rect("Cell " + i, panel) };
                UIFactory.Anchor(cell.Root, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                    new Vector2((column - (Columns - 1) * 0.5f) * (CellWidth + 20f), -200f - row * CellHeight), new Vector2(CellWidth, CellHeight));
                cell.Icon = Factory.Image("Icon", cell.Root, theme.iconCheck, theme.accent);
                UIFactory.Anchor(cell.Icon.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(4f, -8f), new Vector2(34f, 34f));
                cell.Title = Factory.Label("Title", cell.Root, theme.semiBoldFont, 24, theme.textPrimary, TextAnchor.UpperLeft);
                UIFactory.Anchor(cell.Title.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(52f, -4f), new Vector2(CellWidth - 150f, 30f));
                cell.Progress = Factory.Label("Progress", cell.Root, theme.semiBoldFont, 18, theme.textMuted, TextAnchor.UpperRight);
                cell.Progress.horizontalOverflow = HorizontalWrapMode.Overflow;
                UIFactory.Anchor(cell.Progress.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-4f, -8f), new Vector2(140f, 26f));
                cell.Description = Factory.Label("Description", cell.Root, theme.bodyFont, 18, theme.textMuted, TextAnchor.UpperLeft);
                UIFactory.Anchor(cell.Description.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(52f, -34f), new Vector2(CellWidth - 60f, 40f));
                cell.Root.gameObject.SetActive(false);
                _cells.Add(cell);
            }

            var buttonRect = UIFactory.Rect("Back", panel);
            UIFactory.Anchor(buttonRect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 30f), new Vector2(300f, 66f));
            var button = UIFactory.PlainButton(buttonRect);
            var accent = Factory.Image("Accent", buttonRect, null, theme.accent);
            UIFactory.Anchor(accent.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(0f, 2f));
            var label = Factory.Label("Label", buttonRect, theme.mediumFont, 36, theme.textPrimary, TextAnchor.MiddleLeft, "common.back");
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(280f, 54f));
            var menuButton = buttonRect.gameObject.AddComponent<MenuButton>();
            menuButton.Configure(label, accent, theme.textPrimary, Color.white, theme.textDisabled, theme.hoverDuration);
            button.onClick.AddListener(() => BackClicked?.Invoke());
            RegisterSounds?.Invoke(menuButton);

            Factory.Text.OnLanguageChanged(() => { if (IsVisible) Render(); });
        }

        protected override void OnShown() => Render();

        private void Render()
        {
            var theme = Factory.Theme;
            var rows = Source != null ? Source() : null;
            int unlocked = 0;
            for (int i = 0; i < _cells.Count; i++)
            {
                var cell = _cells[i];
                bool used = rows != null && i < rows.Count;
                cell.Root.gameObject.SetActive(used);
                if (!used) continue;

                var row = rows[i];
                if (row.Unlocked) unlocked++;
                cell.Title.text = row.Title;
                cell.Description.text = row.Description;
                cell.Title.color = row.Unlocked ? theme.textPrimary : theme.textMuted;
                cell.Description.color = row.Unlocked ? theme.textMuted : theme.textDisabled;
                cell.Icon.color = row.Unlocked ? theme.accent : new Color(1f, 1f, 1f, 0.12f);
                cell.Progress.text = row.Unlocked ? string.Empty : row.Progress;
            }
            _counter.text = Factory.Text.Service.Format("achievements.counter", unlocked, rows != null ? rows.Count : 0);
        }
    }
}

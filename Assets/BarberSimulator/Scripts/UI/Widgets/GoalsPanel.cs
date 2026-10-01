using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Compact "daily goals" list under the objective tracker: one line per goal with a thin progress bar. The
    /// header toggles it open and closed (that is how phones keep it out of the way).
    /// </summary>
    public sealed class GoalsPanel : MonoBehaviour
    {
        public const int MaxRows = 4;
        private const float PanelWidth = 420f;
        private const float HeaderHeight = 34f;
        private const float RowHeight = 58f;

        private sealed class Row
        {
            public RectTransform Root;
            public Image Check;
            public Text Label;
            public Text Counter;
            public Image Track;
            public Image Fill;
            public bool WasCompleted;
        }

        private UIFactory _factory;
        private RectTransform _root;
        private Text _headerCount;
        private Text _headerToggle;
        private Image _shade;
        private readonly List<Row> _rows = new List<Row>();
        private IReadOnlyList<GoalRow> _data;
        private Action _click;
        private bool _collapsed;

        public bool Collapsed => _collapsed;

        public void Build(UIFactory factory, Transform parent, Action clickSound)
        {
            _factory = factory;
            _click = clickSound;
            var theme = factory.Theme;

            _root = UIFactory.Rect("Goals", parent);
            UIFactory.Anchor(_root, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(40f, -214f), new Vector2(PanelWidth, HeaderHeight));
            _shade = factory.Image("Shade", _root, theme.gradientLeft, new Color(0f, 0f, 0f, 0.45f));

            var header = UIFactory.Rect("Header", _root);
            UIFactory.Anchor(header, new Vector2(0f, 1f), new Vector2(0f, 1f), Vector2.zero, new Vector2(PanelWidth, HeaderHeight));
            var button = UIFactory.PlainButton(header);
            button.onClick.AddListener(Toggle);
            var title = factory.Label("Title", header, theme.semiBoldFont, 16, theme.accent, TextAnchor.MiddleLeft, "hud.goals", upper: true);
            UIFactory.Anchor(title.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(240f, HeaderHeight));
            UIFactory.Spacing(title, 4f);
            _headerCount = factory.Label("Count", header, theme.semiBoldFont, 16, theme.textMuted, TextAnchor.MiddleRight);
            UIFactory.Anchor(_headerCount.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-44f, 0f), new Vector2(100f, HeaderHeight));
            _headerToggle = factory.Label("Toggle", header, theme.semiBoldFont, 22, theme.textMuted, TextAnchor.MiddleCenter);
            UIFactory.Anchor(_headerToggle.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-20f, 0f), new Vector2(32f, HeaderHeight));

            for (int i = 0; i < MaxRows; i++)
            {
                var row = new Row { Root = UIFactory.Rect("Row " + i, _root) };
                UIFactory.Anchor(row.Root, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -HeaderHeight - i * RowHeight), new Vector2(PanelWidth, RowHeight));
                row.Check = factory.Image("Check", row.Root, theme.iconCheck, theme.accent);
                UIFactory.Anchor(row.Check.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -4f), new Vector2(22f, 22f));
                row.Label = factory.Label("Label", row.Root, theme.mediumFont, 18, theme.textPrimary, TextAnchor.UpperLeft);
                UIFactory.Anchor(row.Label.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -2f), new Vector2(290f, 44f));
                UIFactory.SoftShadow(row.Label, theme.shadow, new Vector2(0f, -1f));
                row.Counter = factory.Label("Counter", row.Root, theme.semiBoldFont, 16, theme.textMuted, TextAnchor.UpperRight);
                row.Counter.horizontalOverflow = HorizontalWrapMode.Overflow;
                UIFactory.Anchor(row.Counter.rectTransform, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(0f, -4f), new Vector2(100f, 24f));
                row.Track = factory.Image("Track", row.Root, null, new Color(1f, 1f, 1f, 0.15f));
                UIFactory.Anchor(row.Track.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(30f, -50f), new Vector2(PanelWidth - 30f, 3f));
                row.Fill = factory.Image("Fill", row.Track.rectTransform, null, theme.accent);
                row.Fill.rectTransform.anchorMin = Vector2.zero;
                row.Fill.rectTransform.anchorMax = new Vector2(0f, 1f);
                row.Fill.rectTransform.pivot = new Vector2(0f, 0.5f);
                row.Fill.rectTransform.sizeDelta = Vector2.zero;
                row.Root.gameObject.SetActive(false);
                _rows.Add(row);
            }
            Layout();
        }

        public void SetCollapsed(bool collapsed)
        {
            _collapsed = collapsed;
            Layout();
        }

        private void Toggle()
        {
            _click?.Invoke();
            SetCollapsed(!_collapsed);
        }

        public void SetRows(IReadOnlyList<GoalRow> rows)
        {
            _data = rows;
            int done = 0;
            var theme = _factory.Theme;
            var bad = new Color(0.9f, 0.5f, 0.42f);
            for (int i = 0; i < _rows.Count; i++)
            {
                var row = _rows[i];
                bool used = rows != null && i < rows.Count;
                row.Root.gameObject.SetActive(used && !_collapsed);
                if (!used) continue;

                var data = rows[i];
                if (data.Completed) done++;
                row.Label.text = data.Text;
                row.Label.color = data.Completed ? theme.accent : (data.Failed ? bad : theme.textPrimary);
                row.Counter.text = data.Failed ? string.Empty : data.Counter;
                row.Counter.color = data.Completed ? theme.accent : theme.textMuted;
                row.Check.gameObject.SetActive(data.Completed);
                row.Fill.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(data.Completed ? 1f : data.Progress01), 1f);
                row.Fill.color = data.Failed ? bad : theme.accent;
                if (data.Completed && !row.WasCompleted && gameObject.activeInHierarchy)
                    StartCoroutine(UIAnimation.Scale(row.Root, Vector3.one * 1.06f, Vector3.one, 0.4f, overshoot: true));
                row.WasCompleted = data.Completed;
            }
            _headerCount.text = rows != null ? done + " / " + rows.Count : string.Empty;
            Layout();
        }

        private void Layout()
        {
            int count = _data != null ? Mathf.Min(_data.Count, MaxRows) : 0;
            bool open = !_collapsed && count > 0;
            float height = HeaderHeight + (open ? count * RowHeight : 0f);
            _root.sizeDelta = new Vector2(PanelWidth, height);
            UIFactory.Stretch(_shade.rectTransform, -40f, -60f, -14f, -8f);
            for (int i = 0; i < _rows.Count; i++) _rows[i].Root.gameObject.SetActive(open && i < count);
            _headerToggle.text = _collapsed ? "+" : "-";
            _root.gameObject.SetActive(count > 0);
        }
    }
}

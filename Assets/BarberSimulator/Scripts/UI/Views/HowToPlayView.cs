using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Four short pages (running the shop, cutting hair, customers and reviews, upgrades and days), each with an icon,
    /// a lead line, four numbered steps and a strip of the controls involved. Steps that mention controls have a
    /// "{key}.touch" variant that is shown on touch devices.
    /// </summary>
    public sealed class HowToPlayView : MenuPanelView
    {
        private sealed class PageDefinition
        {
            public string Id;
            public Func<UITheme, Sprite> Icon;
            public int Steps;
            public ControlEntry[] Controls;
        }

        private static readonly PageDefinition[] Pages =
        {
            new PageDefinition { Id = "shop", Icon = t => t.iconHand, Steps = 4, Controls = new[] { ControlsReference.Move, ControlsReference.Interact, ControlsReference.Sprint, ControlsReference.OpenShop } },
            new PageDefinition { Id = "cut", Icon = t => t.iconScissors, Steps = 4, Controls = new[] { ControlsReference.Cut, ControlsReference.Rotate, ControlsReference.Tools, ControlsReference.Guard, ControlsReference.Finish } },
            new PageDefinition { Id = "customers", Icon = t => t.iconStar, Steps = 4, Controls = new[] { ControlsReference.Interact } },
            new PageDefinition { Id = "upgrades", Icon = t => t.iconGear, Steps = 4, Controls = new[] { ControlsReference.OpenShop, ControlsReference.Pause } }
        };

        private const float TabWidth = 360f;
        private const int StepRows = 4;

        private readonly List<NavButton> _tabs = new List<NavButton>();
        private readonly List<GameObject> _chips = new List<GameObject>();
        private readonly Text[] _stepTexts = new Text[StepRows];
        private readonly GameObject[] _stepRows = new GameObject[StepRows];
        private Image _icon;
        private Text _pageTitle;
        private Text _lead;
        private RectTransform _right;
        private CanvasGroup _rightGroup;
        private RectTransform _chipArea;
        private int _page;
        private bool _touch;
        private Coroutine _swap;

        protected override float PanelWidth => 1280f;
        protected override float PanelHeight => 920f;
        protected override string TitleKey => "howto.title";
        protected override string OverlineKey => "howto.overline";
        protected override Selectable DefaultSelectable => _tabs.Count > 0 ? _tabs[_page].Button : base.DefaultSelectable;

        public void SetTouchMode(bool touch)
        {
            if (_touch == touch) return;
            _touch = touch;
            if (Content != null) Render();
        }

        protected override void OnBuildPanel(RectTransform content)
        {
            var theme = Factory.Theme;

            var tabColumn = UIFactory.Rect("Tabs", content);
            tabColumn.anchorMin = new Vector2(0f, 1f);
            tabColumn.anchorMax = new Vector2(0f, 1f);
            tabColumn.pivot = new Vector2(0f, 1f);
            tabColumn.anchoredPosition = new Vector2(-24f, -8f);
            tabColumn.sizeDelta = new Vector2(TabWidth, 4 * 76f);
            var layout = tabColumn.gameObject.AddComponent<VerticalLayoutGroup>();
            layout.spacing = 8f;
            layout.childControlWidth = false;
            layout.childControlHeight = false;
            layout.childForceExpandHeight = false;
            layout.childForceExpandWidth = false;

            for (int i = 0; i < Pages.Length; i++)
            {
                int index = i;
                var tab = NavButtonFactory.Create(Factory, tabColumn, "Tab " + Pages[i].Id, null, NavStyle.Compact, TabWidth, () => SelectPage(index));
                tab.Label.fontSize = 19;
                RegisterSounds?.Invoke(tab);
                _tabs.Add(tab);
            }

            var divider = Factory.Image("Divider", content, null, theme.panelLine);
            divider.rectTransform.anchorMin = new Vector2(0f, 0f);
            divider.rectTransform.anchorMax = new Vector2(0f, 1f);
            divider.rectTransform.pivot = new Vector2(0f, 0.5f);
            divider.rectTransform.sizeDelta = new Vector2(1f, -16f);
            divider.rectTransform.anchoredPosition = new Vector2(TabWidth - 4f, 0f);

            _right = UIFactory.Rect("Page", content);
            _right.anchorMin = new Vector2(0f, 0f);
            _right.anchorMax = new Vector2(1f, 1f);
            _right.offsetMin = new Vector2(TabWidth + 36f, 0f);
            _right.offsetMax = Vector2.zero;
            _rightGroup = Factory.Group(_right);

            float w = ContentWidth - TabWidth - 36f;
            var medallion = Factory.Image("Medallion", _right, theme.circleSolid, theme.panelRaised);
            UIFactory.Anchor(medallion.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -4f), new Vector2(84f, 84f));
            _icon = Factory.Image("Icon", medallion.rectTransform, null, theme.accent);
            UIFactory.Anchor(_icon.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(44f, 44f));
            _icon.preserveAspect = true;

            _pageTitle = Factory.Label("Page Title", _right, theme.displayFont, 46, theme.textPrimary, TextAnchor.UpperLeft);
            _pageTitle.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(_pageTitle.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(108f, 0f), new Vector2(w - 108f, 56f));
            _lead = Factory.Label("Lead", _right, theme.bodyFont, 22, theme.accent, TextAnchor.UpperLeft);
            UIFactory.Anchor(_lead.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(110f, -56f), new Vector2(w - 110f, 32f));

            for (int i = 0; i < StepRows; i++)
            {
                var row = UIFactory.Rect("Step " + i, _right);
                UIFactory.Anchor(row, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -120f - i * 96f), new Vector2(w, 88f));
                var badge = Factory.Image("Badge", row, theme.circleSolid, theme.panelRaised);
                UIFactory.Anchor(badge.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0f), new Vector2(42f, 42f));
                var number = Factory.Label("Number", badge.rectTransform, theme.semiBoldFont, 20, theme.accent, TextAnchor.MiddleCenter);
                number.text = (i + 1).ToString();
                UIFactory.Stretch(number.rectTransform);
                var text = Factory.Label("Text", row, theme.bodyFont, 24, theme.textPrimary, TextAnchor.MiddleLeft);
                text.lineSpacing = 1.1f;
                UIFactory.Anchor(text.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(64f, 0f), new Vector2(w - 64f, 88f));
                _stepRows[i] = row.gameObject;
                _stepTexts[i] = text;
            }

            _chipArea = UIFactory.Rect("Controls", _right);
            _chipArea.anchorMin = new Vector2(0f, 0f);
            _chipArea.anchorMax = new Vector2(1f, 0f);
            _chipArea.pivot = new Vector2(0f, 0f);
            _chipArea.offsetMin = new Vector2(0f, 0f);
            _chipArea.offsetMax = new Vector2(0f, 96f);
            var chipRule = Factory.Image("Rule", _chipArea, null, theme.panelLine);
            chipRule.rectTransform.anchorMin = new Vector2(0f, 1f);
            chipRule.rectTransform.anchorMax = new Vector2(1f, 1f);
            chipRule.rectTransform.pivot = new Vector2(0.5f, 1f);
            chipRule.rectTransform.sizeDelta = new Vector2(0f, 1f);

            Factory.Text.OnLanguageChanged(() => { if (Content != null) Render(); });
            Render();
        }

        protected override void OnShown()
        {
            base.OnShown();
            Render();
        }

        private void SelectPage(int index)
        {
            if (index == _page || index < 0 || index >= Pages.Length) return;
            _page = index;
            if (_swap != null) StopCoroutine(_swap);
            if (!gameObject.activeInHierarchy)
            {
                Render();
                return;
            }
            _swap = StartCoroutine(SwapRoutine());
        }

        private IEnumerator SwapRoutine()
        {
            yield return UIAnimation.Fade(_rightGroup, 0f, 0.1f);
            Render();
            yield return UIAnimation.Fade(_rightGroup, 1f, 0.18f);
        }

        private void Render()
        {
            var theme = Factory.Theme;
            var loc = Factory.Text;
            var page = Pages[_page];

            for (int i = 0; i < Pages.Length; i++)
            {
                _tabs[i].Label.text = (i + 1).ToString("00") + "   " + loc.Get("howto." + Pages[i].Id + ".title").ToUpperInvariant();
                _tabs[i].SetLabelColors(i == _page ? theme.textPrimary : theme.textMuted, Color.white);
            }

            _icon.sprite = page.Icon(theme);
            _pageTitle.text = loc.Get("howto." + page.Id + ".title");
            _lead.text = loc.Get("howto." + page.Id + ".lead");
            for (int i = 0; i < StepRows; i++)
            {
                bool used = i < page.Steps;
                _stepRows[i].SetActive(used);
                if (used) _stepTexts[i].text = StepText("howto." + page.Id + ".s" + (i + 1));
            }

            foreach (var chip in _chips) UnityEngine.Object.Destroy(chip);
            _chips.Clear();
            BuildChips(page);
        }

        private string StepText(string key)
        {
            var loc = Factory.Text;
            if (_touch)
            {
                string touch = loc.Get(key + ".touch");
                if (touch != key + ".touch") return touch;
            }
            return loc.Get(key);
        }

        private void BuildChips(PageDefinition page)
        {
            var theme = Factory.Theme;
            var loc = Factory.Text;
            float x = 0f;
            float y = 0f;
            float limit = ContentWidth - TabWidth - 36f;
            foreach (var entry in page.Controls)
            {
                if (_touch && entry.TouchKey == "controls.touch.none") continue;
                var chip = UIFactory.Rect("Chip", _chipArea);
                _chips.Add(chip.gameObject);

                float width;
                RectTransform visual;
                string gesture = null;
                if (_touch)
                {
                    gesture = loc.Get(entry.TouchKey);
                    var pill = Factory.Image("Gesture", chip, null, theme.panelRaised);
                    var text = Factory.Label("Text", pill.rectTransform, theme.semiBoldFont, 16, theme.textPrimary, TextAnchor.MiddleCenter);
                    text.text = gesture.ToUpperInvariant();
                    text.horizontalOverflow = HorizontalWrapMode.Overflow;
                    width = Mathf.Max(60f, 11f * gesture.Length + 28f);
                    UIFactory.Anchor(pill.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(width, KeyCaps.Height));
                    UIFactory.Stretch(text.rectTransform);
                    visual = pill.rectTransform;
                }
                else
                {
                    visual = KeyCaps.Build(Factory, chip, entry.Keys, out width);
                    UIFactory.Anchor(visual, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(width, KeyCaps.Height));
                }

                var label = Factory.Label("Label", chip, theme.mediumFont, 20, theme.textMuted, TextAnchor.MiddleLeft);
                label.text = loc.Get(entry.ActionKey);
                label.horizontalOverflow = HorizontalWrapMode.Overflow;
                float labelWidth = Mathf.Max(60f, 11f * label.text.Length + 12f);
                UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(width + 10f, 0f), new Vector2(labelWidth, 36f));

                float total = width + 10f + labelWidth + 22f;
                if (x + total > limit && x > 0f)
                {
                    x = 0f;
                    y -= 44f;
                }
                UIFactory.Anchor(chip, new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(x, -26f + y), new Vector2(total, 40f));
                x += total;
            }
        }
    }
}

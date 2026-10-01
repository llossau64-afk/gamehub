using System;
using System.Collections.Generic;
using BarberSimulator.Barber;
using BarberSimulator.Haircut;
using BarberSimulator.Input;
using UnityEngine;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Barber mode HUD: request card with a soft checklist (top-left), finish/step-away (top-right), tool bar and
    /// guard chips (bottom centre), contextual hint, and on touch a large CUT button plus a full-screen orbit area.
    /// The 3D customer stays the focus; nothing covers the centre of the screen.
    /// </summary>
    public sealed class BarberModeView : UIView, IBarberModeView
    {
        private const int MaxTools = 6;
        private const int MaxGuards = 8;

        private InputService _input;
        private Action _click;

        private Text _customerName;
        private Text _requestName;
        private RectTransform _checklistRoot;
        private readonly List<ChecklistRow> _checklist = new List<ChecklistRow>();

        private RectTransform _toolBar;
        private readonly List<ToolSlot> _toolSlots = new List<ToolSlot>();
        private RectTransform _guardRow;
        private CanvasGroup _guardGroup;
        private readonly List<MenuButton> _guardChips = new List<MenuButton>();
        private readonly List<Image> _guardBackgrounds = new List<Image>();

        private Text _hint;
        private CanvasGroup _hintGroup;
        private Text _controlsHint;
        private RectTransform _touchLayer;
        private Image _reticle;
        private Image _cutButtonRing;
        private CanvasGroup _confirmGroup;
        private Text _toolName;

        public event Action<int> ToolClicked;
        public event Action<int> GuardClicked;
        public event Action FinishClicked;
        public event Action BackClicked;
        public event Action FinishConfirmed;

        private sealed class ChecklistRow
        {
            public RectTransform Root;
            public Image Dot;
            public Image Check;
            public Text Label;
            public string Key;
        }

        private sealed class ToolSlot
        {
            public RectTransform Root;
            public Image Icon;
            public Text Label;
            public Text Hotkey;
            public Image Underline;
            public MenuButton Button;
        }

        public void Bind(InputService input, Action clickSound)
        {
            _input = input;
            _click = clickSound;
        }

        protected override void OnBuild()
        {
            var theme = Factory.Theme;

            // Touch layer (under everything): orbit drag area, reticle and CUT button.
            _touchLayer = UIFactory.Rect("Touch Layer", Root);
            UIFactory.Stretch(_touchLayer);
            var look = UIFactory.Rect("Orbit Area", _touchLayer);
            UIFactory.Stretch(look);
            UIFactory.HitArea(look);
            look.gameObject.AddComponent<TouchLookArea>().Configure(_input.Touch);

            _reticle = Factory.Image("Reticle", _touchLayer, theme.joystickRing, new Color(1f, 1f, 1f, 0.7f));
            UIFactory.Anchor(_reticle.rectTransform, new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(46f, 46f));

            var cut = UIFactory.Rect("Cut Button", _touchLayer);
            UIFactory.Anchor(cut, new Vector2(1f, 0f), new Vector2(0.5f, 0.5f), new Vector2(-170f, 190f), new Vector2(170f, 170f));
            var cutBg = Factory.Image("Background", cut, theme.circleSolid, new Color(0.06f, 0.05f, 0.045f, 0.62f), raycast: true);
            UIFactory.Stretch(cutBg.rectTransform);
            _cutButtonRing = Factory.Image("Ring", cut, theme.joystickRing, theme.accent);
            UIFactory.Stretch(_cutButtonRing.rectTransform);
            var cutIcon = Factory.Image("Icon", cut, theme.iconScissors, theme.textPrimary);
            UIFactory.Anchor(cutIcon.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 16f), new Vector2(60f, 60f));
            var cutLabel = Factory.Label("Label", cut, theme.semiBoldFont, 22, theme.textPrimary, TextAnchor.MiddleCenter, "barber.cut", upper: true);
            UIFactory.Anchor(cutLabel.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -38f), new Vector2(160f, 30f));
            UIFactory.Spacing(cutLabel, 3f);
            var hold = cut.gameObject.AddComponent<HoldButton>();
            hold.HeldChanged += held => _input.Touch.CutHeld = held;

            BuildRequestCard(theme);
            BuildTopRight(theme);
            BuildToolBar(theme);
            BuildConfirm(theme);

            _controlsHint = Factory.Label("Controls", Root, theme.bodyFont, 18, theme.textMuted, TextAnchor.LowerLeft, "barber.controls_desktop");
            UIFactory.Anchor(_controlsHint.rectTransform, Vector2.zero, Vector2.zero, new Vector2(40f, 30f), new Vector2(900f, 30f));
            UIFactory.SoftShadow(_controlsHint, theme.shadow, new Vector2(0f, -1f));
        }

        private void BuildRequestCard(UITheme theme)
        {
            var card = UIFactory.Rect("Request", Root);
            UIFactory.Anchor(card, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(40f, -36f), new Vector2(460f, 300f));
            var shade = Factory.Image("Shade", card, theme.gradientLeft, new Color(0f, 0f, 0f, 0.5f));
            UIFactory.Stretch(shade.rectTransform, -40f, -80f, -20f, -10f);

            _customerName = Factory.Label("Customer", card, theme.semiBoldFont, 16, theme.accent, TextAnchor.UpperLeft);
            UIFactory.Anchor(_customerName.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), Vector2.zero, new Vector2(440f, 24f));
            UIFactory.Spacing(_customerName, 4f);
            _requestName = Factory.Label("Request", card, theme.displayFont, 44, theme.textPrimary, TextAnchor.UpperLeft);
            UIFactory.Anchor(_requestName.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(-2f, -24f), new Vector2(440f, 60f));
            UIFactory.SoftShadow(_requestName, theme.shadow, new Vector2(0f, -2f));

            _checklistRoot = UIFactory.Rect("Checklist", card);
            UIFactory.Anchor(_checklistRoot, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -92f), new Vector2(440f, 200f));
            for (int i = 0; i < 5; i++)
            {
                var row = new ChecklistRow { Root = UIFactory.Rect("Row " + i, _checklistRoot) };
                UIFactory.Anchor(row.Root, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -i * 36f), new Vector2(440f, 34f));
                row.Dot = Factory.Image("Dot", row.Root, theme.joystickRing, theme.textMuted);
                UIFactory.Anchor(row.Dot.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(18f, 18f));
                row.Check = Factory.Image("Check", row.Root, theme.iconCheck, theme.accent);
                UIFactory.Anchor(row.Check.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(0f, 0f), new Vector2(22f, 22f));
                row.Label = Factory.Label("Label", row.Root, theme.mediumFont, 22, theme.textPrimary, TextAnchor.MiddleLeft);
                UIFactory.Anchor(row.Label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(34f, 0f), new Vector2(400f, 30f));
                UIFactory.SoftShadow(row.Label, theme.shadow, new Vector2(0f, -1f));
                _checklist.Add(row);
            }
        }

        private void BuildTopRight(UITheme theme)
        {
            var finish = UIFactory.Rect("Finish", Root);
            UIFactory.Anchor(finish, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-40f, -40f), new Vector2(300f, 64f));
            var bg = Factory.Image("Background", finish, theme.roundedRect, new Color(theme.accent.r, theme.accent.g, theme.accent.b, 0.92f), raycast: true);
            UIFactory.Stretch(bg.rectTransform);
            var label = Factory.Label("Label", finish, theme.semiBoldFont, 24, new Color(0.08f, 0.06f, 0.04f), TextAnchor.MiddleCenter, "barber.finish");
            UIFactory.Stretch(label.rectTransform);
            var button = finish.gameObject.AddComponent<Button>();
            button.transition = Selectable.Transition.None;
            button.onClick.AddListener(() => { _click?.Invoke(); FinishClicked?.Invoke(); });
            finish.gameObject.AddComponent<UISoundHook>();

            var back = UIFactory.Rect("Step Away", Root);
            UIFactory.Anchor(back, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-40f, -114f), new Vector2(300f, 48f));
            var backButton = UIFactory.PlainButton(back);
            var backLabel = Factory.Label("Label", back, theme.mediumFont, 22, theme.textMuted, TextAnchor.MiddleRight, "barber.step_away");
            UIFactory.Stretch(backLabel.rectTransform);
            var backMenu = back.gameObject.AddComponent<MenuButton>();
            backMenu.Configure(backLabel, null, theme.textMuted, theme.textPrimary, theme.textDisabled, theme.hoverDuration);
            backButton.onClick.AddListener(() => { _click?.Invoke(); BackClicked?.Invoke(); });
        }

        private void BuildToolBar(UITheme theme)
        {
            _toolBar = UIFactory.Rect("Tool Bar", Root);
            UIFactory.Anchor(_toolBar, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 40f), new Vector2(MaxTools * 130f, 118f));

            for (int i = 0; i < MaxTools; i++)
            {
                int index = i;
                var slot = new ToolSlot { Root = UIFactory.Rect("Tool " + i, _toolBar) };
                UIFactory.Anchor(slot.Root, new Vector2(0f, 0f), new Vector2(0.5f, 0f), new Vector2(65f + i * 130f, 0f), new Vector2(120f, 118f));
                var hit = UIFactory.PlainButton(slot.Root);
                var bg = Factory.Image("Background", slot.Root, theme.roundedRect, new Color(0.06f, 0.05f, 0.045f, 0.6f));
                UIFactory.Stretch(bg.rectTransform);
                slot.Icon = Factory.Image("Icon", slot.Root, null, theme.textPrimary);
                UIFactory.Anchor(slot.Icon.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -14f), new Vector2(54f, 54f));
                slot.Label = Factory.Label("Label", slot.Root, theme.mediumFont, 18, theme.textMuted, TextAnchor.MiddleCenter);
                UIFactory.Anchor(slot.Label.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 22f), new Vector2(118f, 26f));
                slot.Hotkey = Factory.Label("Key", slot.Root, theme.semiBoldFont, 14, theme.textMuted, TextAnchor.UpperLeft);
                UIFactory.Anchor(slot.Hotkey.rectTransform, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(10f, -6f), new Vector2(30f, 20f));
                slot.Hotkey.text = (i + 1).ToString();
                slot.Underline = Factory.Image("Underline", slot.Root, null, theme.accent);
                UIFactory.Anchor(slot.Underline.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 6f), new Vector2(44f, 3f));
                slot.Button = slot.Root.gameObject.AddComponent<MenuButton>();
                slot.Button.Configure(slot.Label, null, theme.textMuted, theme.textPrimary, theme.textDisabled, theme.hoverDuration);
                hit.onClick.AddListener(() => ToolClicked?.Invoke(index));
                _toolSlots.Add(slot);
            }

            _guardRow = UIFactory.Rect("Guards", Root);
            UIFactory.Anchor(_guardRow, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 172f), new Vector2(MaxGuards * 74f, 52f));
            _guardGroup = Factory.Group(_guardRow);
            for (int i = 0; i < MaxGuards; i++)
            {
                int index = i;
                var chip = UIFactory.Rect("Guard " + i, _guardRow);
                UIFactory.Anchor(chip, new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(37f + i * 74f, 0f), new Vector2(66f, 46f));
                var hit = UIFactory.PlainButton(chip);
                var bg = Factory.Image("Background", chip, theme.roundedRect, new Color(0.06f, 0.05f, 0.045f, 0.6f));
                UIFactory.Stretch(bg.rectTransform);
                var label = Factory.Label("Label", chip, theme.semiBoldFont, 20, theme.textPrimary, TextAnchor.MiddleCenter);
                UIFactory.Stretch(label.rectTransform);
                var menu = chip.gameObject.AddComponent<MenuButton>();
                menu.Configure(label, null, theme.textMuted, theme.textPrimary, theme.textDisabled, theme.hoverDuration);
                hit.onClick.AddListener(() => GuardClicked?.Invoke(index));
                _guardChips.Add(menu);
                _guardBackgrounds.Add(bg);
            }

            _toolName = Factory.Label("Tool Name", Root, theme.semiBoldFont, 16, theme.accent, TextAnchor.MiddleCenter);
            UIFactory.Anchor(_toolName.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 222f), new Vector2(600f, 24f));
            UIFactory.Spacing(_toolName, 4f);

            _hint = Factory.Label("Hint", Root, theme.mediumFont, 26, theme.textPrimary, TextAnchor.MiddleCenter);
            UIFactory.Anchor(_hint.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 270f), new Vector2(1100f, 44f));
            UIFactory.SoftShadow(_hint, new Color(0f, 0f, 0f, 0.85f), new Vector2(0f, -2f));
            _hintGroup = _hint.gameObject.AddComponent<CanvasGroup>();
            _hintGroup.blocksRaycasts = false;
        }

        private void BuildConfirm(UITheme theme)
        {
            var panel = UIFactory.Rect("Confirm", Root);
            UIFactory.Anchor(panel, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(620f, 230f));
            _confirmGroup = Factory.Group(panel, 0f);
            var bg = Factory.Image("Background", panel, theme.roundedRect, theme.panel, raycast: true);
            UIFactory.Stretch(bg.rectTransform);
            var question = Factory.Label("Question", panel, theme.mediumFont, 26, theme.textPrimary, TextAnchor.MiddleCenter, "barber.confirm_finish");
            UIFactory.Anchor(question.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -24f), new Vector2(560f, 100f));

            void Choice(string key, float x, bool primary, Action action)
            {
                var rect = UIFactory.Rect(key, panel);
                UIFactory.Anchor(rect, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(x, 26f), new Vector2(250f, 58f));
                var cbg = Factory.Image("Background", rect, theme.roundedRect, primary ? theme.accent : new Color(1f, 1f, 1f, 0.08f), raycast: true);
                UIFactory.Stretch(cbg.rectTransform);
                var label = Factory.Label("Label", rect, theme.semiBoldFont, 22, primary ? new Color(0.08f, 0.06f, 0.04f) : theme.textPrimary, TextAnchor.MiddleCenter, key);
                UIFactory.Stretch(label.rectTransform);
                var button = rect.gameObject.AddComponent<Button>();
                button.transition = Selectable.Transition.None;
                button.onClick.AddListener(() => { _click?.Invoke(); action(); });
            }

            Choice("barber.keep_cutting", -135f, false, () => UIAnimation.SetVisible(_confirmGroup, false));
            Choice("barber.finish_anyway", 135f, true, () => { UIAnimation.SetVisible(_confirmGroup, false); FinishConfirmed?.Invoke(); });
            UIAnimation.SetVisible(_confirmGroup, false);
        }

        // ---------------------------------------------------------------- IBarberModeView

        public void Open(string customerName, string requestName, IReadOnlyList<string> checklistKeys, IReadOnlyList<BarberToolDefinition> tools, bool touch)
        {
            _customerName.text = customerName.ToUpperInvariant();
            _requestName.text = requestName;

            for (int i = 0; i < _checklist.Count; i++)
            {
                var row = _checklist[i];
                bool used = i < checklistKeys.Count;
                row.Root.gameObject.SetActive(used);
                if (!used) continue;
                row.Key = checklistKeys[i];
                row.Label.text = Factory.Text.Get(row.Key);
                SetRowState(row, 0);
            }

            int toolCount = Mathf.Min(MaxTools, tools.Count);
            UIFactory.Anchor(_toolBar, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 40f), new Vector2(toolCount * 130f, 118f));
            for (int i = 0; i < _toolSlots.Count; i++)
            {
                var slot = _toolSlots[i];
                bool used = i < toolCount && tools[i] != null;
                slot.Root.gameObject.SetActive(used);
                if (!used) continue;
                slot.Icon.sprite = tools[i].icon;
                slot.Label.text = Factory.Text.Get(tools[i].nameKey);
            }

            UIAnimation.SetVisible(_confirmGroup, false);
            SetTouchMode(touch);
            SetHint(string.Empty);
            Show();
        }

        public void Close()
        {
            _input.Touch.CutHeld = false;
            Hide();
        }

        public void SetTouchMode(bool touch)
        {
            _touchLayer.gameObject.SetActive(touch);
            _controlsHint.gameObject.SetActive(!touch);
            foreach (var slot in _toolSlots) slot.Hotkey.gameObject.SetActive(!touch);
        }

        public void SetSelectedTool(int index, BarberToolDefinition tool)
        {
            for (int i = 0; i < _toolSlots.Count; i++)
            {
                bool selected = i == index;
                var slot = _toolSlots[i];
                slot.Underline.enabled = selected;
                slot.Icon.color = selected ? Factory.Theme.textPrimary : new Color(1f, 1f, 1f, 0.5f);
                slot.Button.SetNormalColor(selected ? Factory.Theme.textPrimary : Factory.Theme.textMuted);
                slot.Root.localScale = Vector3.one * (selected ? 1.06f : 1f);
            }
            _toolName.text = tool != null ? Factory.Text.Get(tool.nameKey + ".desc").ToUpperInvariant() : string.Empty;
        }

        public void SetGuards(string[] labels, int selected)
        {
            bool show = labels != null && labels.Length > 0;
            UIAnimation.SetVisible(_guardGroup, show);
            if (!show) return;
            UIFactory.Anchor(_guardRow, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 172f), new Vector2(labels.Length * 74f, 52f));
            for (int i = 0; i < _guardChips.Count; i++)
            {
                bool used = i < labels.Length;
                _guardChips[i].gameObject.SetActive(used);
                if (!used) continue;
                _guardChips[i].Label.text = labels[i];
                bool isSelected = i == selected;
                _guardBackgrounds[i].color = isSelected ? Factory.Theme.accent : new Color(0.06f, 0.05f, 0.045f, 0.6f);
                _guardChips[i].SetNormalColor(isSelected ? new Color(0.08f, 0.06f, 0.04f) : Factory.Theme.textPrimary);
            }
        }

        public void SetChecklist(Dictionary<string, int> status)
        {
            foreach (var row in _checklist)
            {
                if (!row.Root.gameObject.activeSelf || row.Key == null) continue;
                status.TryGetValue(row.Key, out int state);
                SetRowState(row, state);
            }
        }

        private void SetRowState(ChecklistRow row, int state)
        {
            row.Check.enabled = state == 2;
            row.Dot.enabled = state != 2;
            row.Dot.color = state == 1 ? Factory.Theme.accent : Factory.Theme.textMuted;
            row.Label.color = state == 2 ? Factory.Theme.textMuted : Factory.Theme.textPrimary;
        }

        public void SetHint(string text)
        {
            _hint.text = text;
            _hintGroup.alpha = string.IsNullOrEmpty(text) ? 0f : 1f;
        }

        public void SetAim(bool onHead, bool cutting)
        {
            if (_reticle == null) return;
            var c = onHead ? Factory.Theme.accent : new Color(1f, 1f, 1f, 0.55f);
            _reticle.color = c;
            _reticle.rectTransform.localScale = Vector3.one * (cutting ? 0.8f : 1f);
            _cutButtonRing.color = cutting ? Color.white : Factory.Theme.accent;
        }

        public void AskFinishConfirmation()
        {
            UIAnimation.SetVisible(_confirmGroup, true);
        }
    }
}

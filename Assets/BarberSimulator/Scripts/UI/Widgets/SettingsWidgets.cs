using System;
using BarberSimulator.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>Label + slim slider + percentage readout.</summary>
    public sealed class SliderRow : MonoBehaviour
    {
        private Slider _slider;
        private Text _value;
        private Func<float, string> _format;

        public event Action<float> Changed;

        public void Configure(Slider slider, Text valueText, Func<float, string> format)
        {
            _slider = slider;
            _value = valueText;
            _format = format;
            _slider.onValueChanged.AddListener(OnChanged);
        }

        public void SetValue(float value)
        {
            _slider.SetValueWithoutNotify(value);
            _value.text = _format(value);
        }

        private void OnChanged(float value)
        {
            _value.text = _format(value);
            Changed?.Invoke(value);
        }
    }

    /// <summary>Pill switch with an animated knob.</summary>
    public sealed class SwitchToggle : MonoBehaviour
    {
        private Image _track;
        private RectTransform _knob;
        private Color _on;
        private Color _off;
        private float _travel;
        private float _position;
        private bool _value;

        public bool Value => _value;
        public event Action<bool> Changed;

        public void Configure(Button button, Image track, RectTransform knob, Color on, Color off, float travel)
        {
            _track = track;
            _knob = knob;
            _on = on;
            _off = off;
            _travel = travel;
            button.onClick.AddListener(() => { SetValue(!_value, notify: true); });
        }

        public void SetValue(bool value, bool notify = false)
        {
            _value = value;
            enabled = true;
            if (notify) Changed?.Invoke(value);
        }

        public void Snap()
        {
            _position = _value ? 1f : 0f;
            Apply();
        }

        private void Update()
        {
            _position = Mathf.MoveTowards(_position, _value ? 1f : 0f, Time.unscaledDeltaTime / 0.16f);
            Apply();
            if (Mathf.Approximately(_position, _value ? 1f : 0f)) enabled = false;
        }

        private void Apply()
        {
            float e = Easing.SmoothStep(_position);
            _track.color = Color.Lerp(_off, _on, e);
            _knob.anchoredPosition = new Vector2(Mathf.Lerp(-_travel, _travel, e), 0f);
        }
    }

    /// <summary>"‹ Medium ›" selector.</summary>
    public sealed class OptionSelector : MonoBehaviour
    {
        private Text _value;
        private Func<int, string> _labelFor;
        private int _count;
        private int _index;

        public int Index => _index;
        public event Action<int> Changed;

        public void Configure(Button previous, Button next, Text value, int count, Func<int, string> labelFor)
        {
            _value = value;
            _count = count;
            _labelFor = labelFor;
            previous.onClick.AddListener(() => Step(-1));
            next.onClick.AddListener(() => Step(1));
        }

        public void SetIndex(int index)
        {
            _index = Mathf.Clamp(index, 0, _count - 1);
            Refresh();
        }

        public void Refresh()
        {
            _value.text = _labelFor(_index);
        }

        private void Step(int direction)
        {
            _index = (_index + direction + _count) % _count;
            Refresh();
            Changed?.Invoke(_index);
        }
    }

    /// <summary>Plays the theme hover/click sounds for any selectable it sits on.</summary>
    public sealed class UISoundHook : MonoBehaviour, IPointerEnterHandler, IPointerClickHandler
    {
        private Action _hover;
        private Action _click;

        public void Configure(Action hover, Action click)
        {
            _hover = hover;
            _click = click;
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            if (!MenuButton.IsTouch(eventData)) _hover?.Invoke();
        }

        public void OnPointerClick(PointerEventData eventData)
        {
            var selectable = GetComponent<Selectable>();
            if (selectable == null || selectable.interactable) _click?.Invoke();
        }
    }

    /// <summary>Builders for the settings controls, kept next to the components they create.</summary>
    public static class SettingsWidgetFactory
    {
        public const float RowHeight = 66f;
        public const float ControlWidth = 300f;

        public static RectTransform Row(UIFactory f, Transform parent, string labelKey, out Text label)
        {
            var row = UIFactory.Rect("Row " + labelKey, parent);
            var layout = row.gameObject.AddComponent<LayoutElement>();
            layout.preferredHeight = RowHeight;
            layout.minHeight = RowHeight;

            label = f.Label("Label", row, f.Theme.mediumFont, 26, f.Theme.textPrimary, TextAnchor.MiddleLeft, labelKey);
            UIFactory.Stretch(label.rectTransform, 0f, ControlWidth + 24f);

            var line = f.Image("Divider", row, null, f.Theme.panelLine);
            line.rectTransform.anchorMin = new Vector2(0f, 0f);
            line.rectTransform.anchorMax = new Vector2(1f, 0f);
            line.rectTransform.sizeDelta = new Vector2(0f, 1f);
            line.rectTransform.anchoredPosition = Vector2.zero;
            return row;
        }

        private static RectTransform ControlArea(RectTransform row)
        {
            var area = UIFactory.Rect("Control", row);
            area.anchorMin = new Vector2(1f, 0f);
            area.anchorMax = new Vector2(1f, 1f);
            area.pivot = new Vector2(1f, 0.5f);
            area.sizeDelta = new Vector2(ControlWidth, 0f);
            area.anchoredPosition = Vector2.zero;
            return area;
        }

        public static SliderRow Slider(UIFactory f, Transform parent, string labelKey, float min, float max, Func<float, string> format, Action hover)
        {
            var row = Row(f, parent, labelKey, out _);
            var area = ControlArea(row);

            var valueText = f.Label("Value", area, f.Theme.semiBoldFont, 22, f.Theme.textMuted, TextAnchor.MiddleRight);
            UIFactory.Anchor(valueText.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), Vector2.zero, new Vector2(70f, 40f));

            var sliderRect = UIFactory.Rect("Slider", area);
            UIFactory.Anchor(sliderRect, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(ControlWidth - 86f, 44f));
            UIFactory.HitArea(sliderRect);

            var track = f.Image("Track", sliderRect, f.Theme.roundedRect, new Color(1f, 1f, 1f, 0.16f));
            track.rectTransform.anchorMin = new Vector2(0f, 0.5f);
            track.rectTransform.anchorMax = new Vector2(1f, 0.5f);
            track.rectTransform.sizeDelta = new Vector2(0f, 4f);

            var fillArea = UIFactory.Rect("Fill Area", sliderRect);
            fillArea.anchorMin = new Vector2(0f, 0.5f);
            fillArea.anchorMax = new Vector2(1f, 0.5f);
            fillArea.sizeDelta = new Vector2(0f, 4f);
            var fill = f.Image("Fill", fillArea, f.Theme.roundedRect, f.Theme.accent);
            fill.rectTransform.sizeDelta = Vector2.zero;

            var handleArea = UIFactory.Rect("Handle Area", sliderRect);
            UIFactory.Stretch(handleArea);
            var handle = f.Image("Handle", handleArea, f.Theme.circleSolid, f.Theme.textPrimary);
            handle.rectTransform.sizeDelta = new Vector2(22f, 22f);

            var slider = sliderRect.gameObject.AddComponent<Slider>();
            slider.fillRect = fill.rectTransform;
            slider.handleRect = handle.rectTransform;
            slider.targetGraphic = handle;
            slider.transition = Selectable.Transition.None;
            slider.direction = UnityEngine.UI.Slider.Direction.LeftToRight;
            slider.minValue = min;
            slider.maxValue = max;

            var hook = sliderRect.gameObject.AddComponent<UISoundHook>();
            hook.Configure(hover, null);

            var component = row.gameObject.AddComponent<SliderRow>();
            component.Configure(slider, valueText, format);
            return component;
        }

        public static SwitchToggle Toggle(UIFactory f, Transform parent, string labelKey, Action hover, Action click)
        {
            var row = Row(f, parent, labelKey, out _);
            var area = ControlArea(row);

            var switchRect = UIFactory.Rect("Switch", area);
            UIFactory.Anchor(switchRect, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), Vector2.zero, new Vector2(58f, 30f));
            var track = f.Image("Track", switchRect, f.Theme.roundedRect, new Color(1f, 1f, 1f, 0.16f), raycast: true);
            UIFactory.Stretch(track.rectTransform);
            var knob = f.Image("Knob", switchRect, f.Theme.circleSolid, f.Theme.textPrimary);
            UIFactory.Anchor(knob.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(22f, 22f));

            var button = switchRect.gameObject.AddComponent<Button>();
            button.transition = Selectable.Transition.None;
            button.targetGraphic = track;
            switchRect.gameObject.AddComponent<UISoundHook>().Configure(hover, click);

            var toggle = switchRect.gameObject.AddComponent<SwitchToggle>();
            toggle.Configure(button, track, knob.rectTransform, f.Theme.accent, new Color(1f, 1f, 1f, 0.16f), 14f);
            return toggle;
        }

        public static OptionSelector Selector(UIFactory f, Transform parent, string labelKey, int count, Func<int, string> labelFor, Action hover, Action click)
        {
            var row = Row(f, parent, labelKey, out _);
            var area = ControlArea(row);

            Button Arrow(string name, string glyph, Vector2 anchor)
            {
                var rect = UIFactory.Rect(name, area);
                UIFactory.Anchor(rect, anchor, anchor, Vector2.zero, new Vector2(48f, 48f));
                var button = UIFactory.PlainButton(rect);
                var text = f.Label("Glyph", rect, f.Theme.displayFont, 34, f.Theme.accent, TextAnchor.MiddleCenter);
                text.text = glyph;
                UIFactory.Stretch(text.rectTransform, 0f, 0f, 0f, 4f);
                rect.gameObject.AddComponent<UISoundHook>().Configure(hover, click);
                return button;
            }

            var previous = Arrow("Previous", "‹", new Vector2(0f, 0.5f));
            previous.GetComponent<RectTransform>().pivot = new Vector2(0f, 0.5f);
            var next = Arrow("Next", "›", new Vector2(1f, 0.5f));
            next.GetComponent<RectTransform>().pivot = new Vector2(1f, 0.5f);

            var value = f.Label("Value", area, f.Theme.semiBoldFont, 24, f.Theme.textPrimary, TextAnchor.MiddleCenter);
            UIFactory.Stretch(value.rectTransform, 48f, 48f);

            var selector = row.gameObject.AddComponent<OptionSelector>();
            selector.Configure(previous, next, value, count, labelFor);
            return selector;
        }
    }
}

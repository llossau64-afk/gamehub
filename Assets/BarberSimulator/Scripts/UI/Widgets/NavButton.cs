using System;
using BarberSimulator.Core;
using BarberSimulator.Settings;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    public enum NavStyle
    {
        /// <summary>PLAY / CONTINUE: taller, bigger type, the red marker is always lit.</summary>
        Primary,
        /// <summary>Regular menu entry, at least 88 px tall at the 1080p reference.</summary>
        Standard,
        /// <summary>Tabs and dialogue buttons.</summary>
        Compact,
        /// <summary>Small text link without a marker.</summary>
        Link
    }

    /// <summary>
    /// A flat, text-led menu row. Hover or keyboard / gamepad selection lights a thin red marker, lifts the label,
    /// shows a chevron and tints the row; pressing shrinks it a few percent (this also fires on touch, where there is no
    /// hover); a click flashes the row. It sits on a uGUI <see cref="Button"/>, so navigation, submit and click work
    /// through the normal Selectable system. Scale never exceeds 1.03.
    /// </summary>
    [RequireComponent(typeof(Button))]
    public sealed class NavButton : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, ISelectHandler, IDeselectHandler,
        IPointerDownHandler, IPointerUpHandler
    {
        private const float MaxHoverScale = 0.025f;
        private const float PressScale = 0.03f;

        private Button _button;
        private Image _background;
        private Image _bar;
        private Text _label;
        private Text _chevron;
        private Text _detail;
        private RectTransform _labelRect;
        private RectTransform _chevronRect;
        private Color _labelNormal;
        private Color _labelHover;
        private Color _labelDisabled;
        private Color _barColor;
        private Color _tint;
        private float _barHeight;
        private float _labelShift;
        private bool _primary;
        private bool _showsMarker;
        private float _duration = 0.18f;

        private Vector2 _labelRest;
        private Vector2 _chevronRest;
        private float _hover;
        private float _hoverTarget;
        private float _press;
        private float _pressTarget;
        private float _flash;
        private bool _pointerInside;
        private bool _selected;
        private bool _silentSelect;
        private bool _animating = true;
        private float _ignoreSelectUntil;

        public Button Button => _button;
        public Text Label => _label;
        public Text Detail => _detail;

        /// <summary>Raised when the row becomes highlighted by pointer or selection (not on touch, not on silent selection).</summary>
        public event Action Hovered;

        public void Configure(UITheme theme, Image background, Image bar, Text label, Text chevron, Text detail, NavStyle style)
        {
            _button = GetComponent<Button>();
            _background = background;
            _bar = bar;
            _label = label;
            _labelRect = label.rectTransform;
            _chevron = chevron;
            _chevronRect = chevron != null ? chevron.rectTransform : null;
            _detail = detail;
            _primary = style == NavStyle.Primary;
            _showsMarker = style != NavStyle.Link && bar != null;
            _labelNormal = _primary ? theme.textPrimary : Color.Lerp(theme.textPrimary, theme.textMuted, 0.35f);
            _labelHover = new Color(1f, 0.97f, 0.9f);
            _labelDisabled = theme.textDisabled;
            _barColor = theme.barberRed;
            _tint = new Color(1f, 0.95f, 0.85f);
            _barHeight = style == NavStyle.Primary ? 64f : style == NavStyle.Standard ? 40f : 28f;
            _labelShift = style == NavStyle.Link ? 0f : 10f;
            _duration = Mathf.Max(0.05f, theme.hoverDuration);
            _labelRest = _labelRect.anchoredPosition;
            if (_chevronRect != null) _chevronRest = _chevronRect.anchoredPosition;
            _button.onClick.AddListener(() => { _flash = 1f; _animating = true; });
            Apply();
        }

        public void SetLabelColors(Color normal, Color hover)
        {
            _labelNormal = normal;
            _labelHover = hover;
            Apply();
        }

        public void SetInteractable(bool interactable)
        {
            _button.interactable = interactable;
            if (!interactable) _hoverTarget = 0f;
            Apply();
            _animating = true;
        }

        /// <summary>Gives the row keyboard / gamepad focus without playing the hover sound.</summary>
        public void SelectSilently()
        {
            var system = EventSystem.current;
            if (system == null || !isActiveAndEnabled || !_button.interactable) return;
            _silentSelect = true;
            system.SetSelectedGameObject(gameObject);
            _silentSelect = false;
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            _pointerInside = true;
            if (!MenuButton.IsTouch(eventData) && _button.interactable && EventSystem.current != null)
                EventSystem.current.SetSelectedGameObject(gameObject); // exactly one row is ever highlighted
            Refresh(raiseSound: !MenuButton.IsTouch(eventData));
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            _pointerInside = false;
            _pressTarget = 0f;
            Refresh(false);
        }

        public void OnSelect(BaseEventData eventData)
        {
            // A tap selects the Button too, but a finger leaves no highlight behind.
            if (Time.unscaledTime < _ignoreSelectUntil) return;
            _selected = true;
            Refresh(raiseSound: !_silentSelect);
        }

        public void OnDeselect(BaseEventData eventData)
        {
            _selected = false;
            Refresh(false);
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (!_button.interactable) return;
            _pressTarget = 1f;
            _pointerInside = true;
            if (MenuButton.IsTouch(eventData))
            {
                _ignoreSelectUntil = Time.unscaledTime + 0.4f;
                _selected = false;
            }
            Refresh(false);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            _pressTarget = 0f;
            // A finger has no hover: the highlight leaves with it.
            if (MenuButton.IsTouch(eventData)) _pointerInside = false;
            Refresh(false);
        }

        private void Refresh(bool raiseSound)
        {
            float previous = _hoverTarget;
            _hoverTarget = _button != null && _button.interactable && (_pointerInside || _selected) ? 1f : 0f;
            if (raiseSound && _hoverTarget > previous) Hovered?.Invoke();
            _animating = true;
        }

        private void OnDisable()
        {
            _pointerInside = false;
            _selected = false;
            _hoverTarget = _pressTarget = 0f;
            _hover = _press = _flash = 0f;
            if (_label != null) Apply();
        }

        private void Update()
        {
            if (!_animating) return;
            float step = Time.unscaledDeltaTime / _duration;
            _hover = Mathf.MoveTowards(_hover, _hoverTarget, step);
            _press = Mathf.MoveTowards(_press, _pressTarget, step * 2.5f);
            _flash = Mathf.MoveTowards(_flash, 0f, Time.unscaledDeltaTime / 0.28f);
            Apply();
            if (Mathf.Approximately(_hover, _hoverTarget) && Mathf.Approximately(_press, _pressTarget) && _flash <= 0f) _animating = false;
        }

        private void Apply()
        {
            if (_label == null) return;
            float h = Easing.SmoothStep(_hover);
            bool interactable = _button == null || _button.interactable;
            bool still = LiveSettings.ReduceMotion;

            _label.color = interactable ? Color.Lerp(_labelNormal, _labelHover, h) : _labelDisabled;
            if (still)
            {
                transform.localScale = Vector3.one;
                _labelRect.anchoredPosition = _labelRest;
            }
            else
            {
                transform.localScale = Vector3.one * (1f + MaxHoverScale * h - PressScale * _press);
                _labelRect.anchoredPosition = _labelRest + new Vector2(_labelShift * h, 0f);
            }

            if (_background != null)
            {
                var c = _tint;
                c.a = interactable ? 0.06f * h + 0.1f * _flash + 0.03f * _press : 0f;
                _background.color = c;
            }

            if (_bar != null && _showsMarker)
            {
                // The primary action keeps a dim marker at rest; others only light up when highlighted.
                float rest = _primary && interactable ? 0.55f : 0f;
                float amount = Mathf.Max(rest, h);
                var size = _bar.rectTransform.sizeDelta;
                size.y = _barHeight * (0.45f + 0.55f * amount);
                _bar.rectTransform.sizeDelta = size;
                var c = _barColor;
                c.a = amount * (interactable ? 1f : 0f);
                _bar.color = Color.Lerp(c, new Color(0.86f, 0.36f, 0.3f, c.a), _flash);
            }

            if (_chevron != null)
            {
                var c = _chevron.color;
                c.a = h * 0.9f;
                _chevron.color = c;
                _chevronRect.anchoredPosition = _chevronRest + new Vector2(still ? 0f : -8f * (1f - h), 0f);
            }
        }
    }

    /// <summary>Builds the visual structure of a <see cref="NavButton"/>.</summary>
    public static class NavButtonFactory
    {
        public static float HeightFor(NavStyle style)
        {
            switch (style)
            {
                case NavStyle.Primary: return 112f;
                case NavStyle.Standard: return 88f;
                case NavStyle.Compact: return 68f;
                default: return 56f;
            }
        }

        /// <param name="labelKey">Localization key, shown in upper case. Null when the caller sets the text itself.</param>
        public static NavButton Create(UIFactory f, Transform parent, string name, string labelKey, NavStyle style, float width, Action onClick)
        {
            var theme = f.Theme;
            float height = HeightFor(style);
            var rect = UIFactory.Rect(name, parent);
            rect.sizeDelta = new Vector2(width, height);
            var layout = rect.gameObject.AddComponent<LayoutElement>();
            layout.preferredWidth = width;
            layout.preferredHeight = height;
            layout.minHeight = height;
            var button = UIFactory.PlainButton(rect);

            var bg = f.Image("Highlight", rect, null, new Color(1f, 0.95f, 0.85f, 0f));
            UIFactory.Stretch(bg.rectTransform);

            Image bar = null;
            if (style != NavStyle.Link)
            {
                bar = f.Image("Marker", rect, null, theme.barberRed);
                UIFactory.Anchor(bar.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(4f, 20f));

                if (style == NavStyle.Standard)
                {
                    var line = f.Image("Hairline", rect, null, theme.panelLine);
                    line.rectTransform.anchorMin = new Vector2(0f, 0f);
                    line.rectTransform.anchorMax = new Vector2(1f, 0f);
                    line.rectTransform.pivot = new Vector2(0.5f, 0f);
                    line.rectTransform.offsetMin = new Vector2(24f, 0f);
                    line.rectTransform.offsetMax = new Vector2(-24f, 1f);
                }
            }

            int size = style == NavStyle.Primary ? 46 : style == NavStyle.Standard ? 30 : style == NavStyle.Compact ? 22 : 20;
            var font = style == NavStyle.Primary ? theme.semiBoldFont : style == NavStyle.Standard ? theme.mediumFont : theme.semiBoldFont;
            float left = style == NavStyle.Link ? 0f : 28f;
            float labelY = style == NavStyle.Primary ? 12f : 0f;
            var label = f.Label("Label", rect, font, size, theme.textPrimary, TextAnchor.MiddleLeft, labelKey, upper: true);
            label.horizontalOverflow = HorizontalWrapMode.Overflow;
            UIFactory.Anchor(label.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(left, labelY), new Vector2(width - left - 40f, size + 16f));
            UIFactory.Spacing(label, style == NavStyle.Primary ? 4f : style == NavStyle.Standard ? 3f : 2f);
            if (style == NavStyle.Primary) UIFactory.SoftShadow(label, new Color(0f, 0f, 0f, 0.45f), new Vector2(0f, -2f));

            Text detail = null;
            if (style == NavStyle.Primary)
            {
                detail = f.Label("Detail", rect, theme.bodyFont, 22, theme.textMuted, TextAnchor.MiddleLeft);
                detail.horizontalOverflow = HorizontalWrapMode.Overflow;
                UIFactory.Anchor(detail.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(left + 2f, -30f), new Vector2(width - left - 40f, 30f));
            }

            Text chevron = null;
            if (style != NavStyle.Link)
            {
                chevron = f.Label("Chevron", rect, theme.displayFont, 34, theme.accent, TextAnchor.MiddleRight);
                chevron.text = "›";
                var c = chevron.color;
                c.a = 0f;
                chevron.color = c;
                UIFactory.Anchor(chevron.rectTransform, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-22f, 3f), new Vector2(40f, 50f));
            }

            var nav = rect.gameObject.AddComponent<NavButton>();
            nav.Configure(theme, bg, bar, label, chevron, detail, style);
            if (onClick != null) button.onClick.AddListener(() => onClick());
            return nav;
        }
    }
}

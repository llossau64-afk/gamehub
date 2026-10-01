using System;
using BarberSimulator.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BarberSimulator.UI
{
    /// <summary>
    /// Text-first menu button: on hover/selection the label slides right, brightens and a thin brass
    /// rule draws in from the left. No boxes, no gradients. Uses uGUI Button for click/keyboard/gamepad submit.
    /// </summary>
    [RequireComponent(typeof(Button))]
    public sealed class MenuButton : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, ISelectHandler, IDeselectHandler,
        IPointerDownHandler, IPointerUpHandler
    {
        [SerializeField] private Text label;
        [SerializeField] private RectTransform labelRect;
        [SerializeField] private Image rule;
        [SerializeField] private float hoverShift = 14f;
        [SerializeField] private float ruleWidth = 26f;

        private Button _button;
        private Color _normal;
        private Color _hover;
        private Color _disabled;
        private float _duration = 0.18f;
        private float _hoverAmount;
        private float _hoverTarget;
        private float _press;
        private float _pressTarget;
        private Vector2 _labelRest;
        private bool _pointerInside;
        private bool _selected;
        private bool _animating = true;

        public Button Button => _button;
        public Text Label => label;

        public event Action Hovered;

        public void Configure(Text text, Image accentRule, Color normal, Color hover, Color disabled, float duration)
        {
            label = text;
            labelRect = text.rectTransform;
            rule = accentRule;
            _normal = normal;
            _hover = hover;
            _disabled = disabled;
            _duration = Mathf.Max(0.05f, duration);
            _button = GetComponent<Button>();
            _labelRest = labelRect.anchoredPosition;
            Apply();
        }

        public void SetNormalColor(Color normal)
        {
            _normal = normal;
            Apply();
        }

        public void SetInteractable(bool interactable)
        {
            _button.interactable = interactable;
            if (!interactable) _hoverTarget = 0f;
            Apply();
            _animating = true;
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            _pointerInside = true;
            Refresh();
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            _pointerInside = false;
            _pressTarget = 0f;
            Refresh();
        }

        public void OnSelect(BaseEventData eventData)
        {
            _selected = true;
            Refresh();
        }

        public void OnDeselect(BaseEventData eventData)
        {
            _selected = false;
            Refresh();
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (!_button.interactable) return;
            _pressTarget = 1f;
            // Touch has no hover: highlight immediately on tap.
            _pointerInside = true;
            Refresh();
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            _pressTarget = 0f;
            // Touches have no hover state, so the highlight leaves with the finger.
            if (IsTouch(eventData)) _pointerInside = false;
            Refresh();
        }

        public static bool IsTouch(PointerEventData eventData)
        {
            return eventData is UnityEngine.InputSystem.UI.ExtendedPointerEventData extended
                   && extended.pointerType == UnityEngine.InputSystem.UI.UIPointerType.Touch;
        }

        private void Refresh()
        {
            float previous = _hoverTarget;
            _hoverTarget = _button != null && _button.interactable && (_pointerInside || _selected) ? 1f : 0f;
            if (_hoverTarget > previous) Hovered?.Invoke();
            _animating = true;
        }

        private void OnDisable()
        {
            _pointerInside = false;
            _selected = false;
            _hoverTarget = _pressTarget = 0f;
            _hoverAmount = _press = 0f;
            Apply();
        }

        private void Update()
        {
            if (!_animating) return;
            float step = Time.unscaledDeltaTime / _duration;
            _hoverAmount = Mathf.MoveTowards(_hoverAmount, _hoverTarget, step);
            _press = Mathf.MoveTowards(_press, _pressTarget, step * 2f);
            Apply();
            if (Mathf.Approximately(_hoverAmount, _hoverTarget) && Mathf.Approximately(_press, _pressTarget)) _animating = false;
        }

        private void Apply()
        {
            if (label == null) return;
            float h = Easing.SmoothStep(_hoverAmount);
            bool interactable = _button == null || _button.interactable;

            label.color = interactable ? Color.Lerp(_normal, _hover, h) : _disabled;
            labelRect.anchoredPosition = _labelRest + new Vector2(hoverShift * h, 0f);
            labelRect.localScale = Vector3.one * (1f - 0.03f * _press);

            if (rule != null)
            {
                var size = rule.rectTransform.sizeDelta;
                size.x = ruleWidth * h;
                rule.rectTransform.sizeDelta = size;
                var c = rule.color;
                c.a = h;
                rule.color = c;
            }
        }
    }
}

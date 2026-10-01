using BarberSimulator.Core;
using UnityEngine;
using UnityEngine.EventSystems;

namespace BarberSimulator.Input
{
    /// <summary>
    /// Left-side movement stick. The component lives on a transparent touch region; it tracks exactly one
    /// pointer id so a second finger (camera) can never steal it. Supports dynamic placement where the
    /// stick appears under the thumb.
    /// </summary>
    public sealed class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        [SerializeField] private RectTransform baseRect;
        [SerializeField] private RectTransform knobRect;
        [SerializeField] private CanvasGroup visualGroup;
        [SerializeField] private float radius = 90f;
        [SerializeField, Range(0f, 0.5f)] private float deadZone = 0.12f;

        private const int NoPointer = int.MinValue;

        private TouchInputState _state;
        private RectTransform _region;
        private Vector2 _restPosition;
        private Vector2 _knobOffset;
        private int _pointerId = NoPointer;
        private bool _dynamic = true;
        private float _opacity = 0.75f;

        public void Configure(TouchInputState state, RectTransform baseRectangle, RectTransform knob, CanvasGroup group, float stickRadius)
        {
            _state = state;
            baseRect = baseRectangle;
            knobRect = knob;
            visualGroup = group;
            radius = stickRadius;
            _region = (RectTransform)transform;
            _restPosition = baseRect.anchoredPosition;
        }

        public void ApplySettings(float opacity, bool dynamicPlacement)
        {
            _opacity = opacity;
            _dynamic = dynamicPlacement;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (_pointerId != NoPointer) return;

            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(_region, eventData.position, eventData.pressEventCamera, out var local))
                return;

            if (!_dynamic)
            {
                // Static stick: only accept touches that start close to the stick.
                if ((local - BaseLocalInRegion()).sqrMagnitude > radius * radius * 2.6f) return;
            }

            _pointerId = eventData.pointerId;
            if (_dynamic) PlaceBaseAt(local);
            UpdateStick(eventData);
            _state.JoystickActive = true;
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != _pointerId) return;
            UpdateStick(eventData);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != _pointerId) return;
            Release();
        }

        private void OnDisable()
        {
            Release();
        }

        private void Release()
        {
            _pointerId = NoPointer;
            if (_state != null)
            {
                _state.Move = Vector2.zero;
                _state.JoystickActive = false;
            }
        }

        private void UpdateStick(PointerEventData eventData)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(baseRect, eventData.position, eventData.pressEventCamera, out var local))
                return;

            var offset = Vector2.ClampMagnitude(local, radius);
            _knobOffset = offset;

            var normalized = offset / radius;
            float magnitude = normalized.magnitude;
            if (magnitude < deadZone)
            {
                _state.Move = Vector2.zero;
                return;
            }

            // Remap so output starts at 0 right outside the dead zone instead of jumping.
            float remapped = Mathf.InverseLerp(deadZone, 1f, magnitude);
            _state.Move = normalized / magnitude * remapped;
        }

        private Vector2 BaseLocalInRegion()
        {
            var world = baseRect.position;
            return _region.InverseTransformPoint(world);
        }

        private void PlaceBaseAt(Vector2 regionLocal)
        {
            var rect = _region.rect;
            float margin = radius * 1.1f;
            regionLocal.x = Mathf.Clamp(regionLocal.x, rect.xMin + margin, rect.xMax - margin);
            regionLocal.y = Mathf.Clamp(regionLocal.y, rect.yMin + margin, rect.yMax - margin);
            baseRect.position = _region.TransformPoint(regionLocal);
        }

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;
            bool active = _pointerId != NoPointer;

            if (!active)
            {
                _knobOffset = Vector2.Lerp(_knobOffset, Vector2.zero, Easing.Damp(18f, dt));
                if (_dynamic)
                    baseRect.anchoredPosition = Vector2.Lerp(baseRect.anchoredPosition, _restPosition, Easing.Damp(10f, dt));
            }

            knobRect.anchoredPosition = _knobOffset;

            if (visualGroup != null)
            {
                float target = active ? _opacity : _opacity * 0.55f;
                visualGroup.alpha = Mathf.Lerp(visualGroup.alpha, target, Easing.Damp(14f, dt));
            }
        }
    }
}

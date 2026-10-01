using UnityEngine;
using UnityEngine.EventSystems;

namespace BarberSimulator.Input
{
    /// <summary>
    /// Transparent region (right side of the screen) that turns finger drags into camera rotation.
    /// Tracks a single pointer id independently from the joystick, enabling move + look at the same time.
    /// </summary>
    public sealed class TouchLookArea : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        private const int NoPointer = int.MinValue;

        private TouchInputState _state;
        private int _pointerId = NoPointer;
        private Vector2 _lastPosition;

        public void Configure(TouchInputState state)
        {
            _state = state;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (_pointerId != NoPointer) return;
            _pointerId = eventData.pointerId;
            _lastPosition = eventData.position;
            _state.LookActive = true;
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != _pointerId) return;
            // Position difference is more reliable than eventData.delta across input backends.
            var delta = eventData.position - _lastPosition;
            _lastPosition = eventData.position;
            _state.AddLook(delta);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != _pointerId) return;
            _pointerId = NoPointer;
            _state.LookActive = false;
        }

        private void OnDisable()
        {
            _pointerId = NoPointer;
            if (_state != null) _state.LookActive = false;
        }
    }
}

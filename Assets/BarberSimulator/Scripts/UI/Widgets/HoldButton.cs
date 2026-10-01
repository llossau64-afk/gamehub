using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace BarberSimulator.UI
{
    /// <summary>Button that reports press and release (touch CUT button). Tracks its own pointer id for multitouch.</summary>
    public sealed class HoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        private const int NoPointer = int.MinValue;
        private int _pointer = NoPointer;

        public bool IsHeld => _pointer != NoPointer;
        public event Action<bool> HeldChanged;

        public void OnPointerDown(PointerEventData eventData)
        {
            if (_pointer != NoPointer) return;
            _pointer = eventData.pointerId;
            HeldChanged?.Invoke(true);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != _pointer) return;
            _pointer = NoPointer;
            HeldChanged?.Invoke(false);
        }

        private void OnDisable()
        {
            if (_pointer == NoPointer) return;
            _pointer = NoPointer;
            HeldChanged?.Invoke(false);
        }
    }
}

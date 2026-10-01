using UnityEngine;

namespace BarberSimulator.Input
{
    /// <summary>Shared state written by the on-screen touch widgets and read by <see cref="InputService"/>.</summary>
    public sealed class TouchInputState
    {
        private Vector2 _lookPixels;

        public Vector2 Move { get; set; }
        public bool JoystickActive { get; set; }
        public bool LookActive { get; set; }

        public void AddLook(Vector2 pixelDelta)
        {
            _lookPixels += pixelDelta;
        }

        public Vector2 ConsumeLook()
        {
            var value = _lookPixels;
            _lookPixels = Vector2.zero;
            return value;
        }

        public void Clear()
        {
            _lookPixels = Vector2.zero;
            Move = Vector2.zero;
            JoystickActive = false;
            LookActive = false;
        }
    }
}

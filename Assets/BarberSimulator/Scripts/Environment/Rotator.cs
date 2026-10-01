using UnityEngine;

namespace BarberSimulator.Environment
{
    /// <summary>Constant spin with an optional spin-up (ceiling fan, barber pole).</summary>
    public sealed class Rotator : AmbientMotion
    {
        [SerializeField] private Vector3 axis = Vector3.up;
        [SerializeField] private float degreesPerSecond = 60f;
        [SerializeField] private float wobbleDegrees;

        private Quaternion _rest;

        public void Configure(Vector3 localAxis, float speed, float wobble)
        {
            axis = localAxis;
            degreesPerSecond = speed;
            wobbleDegrees = wobble;
        }

        private void Awake()
        {
            _rest = transform.localRotation;
        }

        public override void Tick(float time, float deltaTime)
        {
            var spin = Quaternion.AngleAxis(time * degreesPerSecond, axis);
            if (wobbleDegrees > 0f)
            {
                var wobble = Quaternion.Euler(Mathf.Sin(time * 1.7f) * wobbleDegrees, 0f, Mathf.Cos(time * 1.3f) * wobbleDegrees);
                transform.localRotation = _rest * wobble * spin;
            }
            else
            {
                transform.localRotation = _rest * spin;
            }
        }
    }
}

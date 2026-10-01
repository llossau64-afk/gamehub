using BarberSimulator.Characters;
using UnityEngine;

namespace BarberSimulator.NPC
{
    /// <summary>
    /// Walks an NPC towards a destination on the flat shop floor and feeds speed to the animator.
    /// The shop is small and authored, so straight segments between waypoints replace a NavMesh for now.
    /// </summary>
    public sealed class NpcMotor : MonoBehaviour
    {
        [SerializeField] private float walkSpeed = 1.15f;
        [SerializeField] private float turnSpeed = 300f;
        [SerializeField] private float arriveDistance = 0.05f;
        [SerializeField] private ProceduralCharacterAnimator animator;

        private Vector3 _destination;
        private Quaternion? _finalFacing;
        private float _currentSpeed;

        public bool HasArrived { get; private set; } = true;

        public void SetAnimator(ProceduralCharacterAnimator characterAnimator) => animator = characterAnimator;

        public void MoveTo(Vector3 destination, Quaternion? faceOnArrival = null)
        {
            _destination = destination;
            _finalFacing = faceOnArrival;
            HasArrived = false;
        }

        public void Warp(Vector3 position, Quaternion rotation)
        {
            transform.SetPositionAndRotation(position, rotation);
            _destination = position;
            HasArrived = true;
            _currentSpeed = 0f;
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            var position = transform.position;
            var toTarget = _destination - position;
            toTarget.y = 0f;
            float distance = toTarget.magnitude;

            if (!HasArrived)
            {
                // Ease into and out of walking.
                float targetSpeed = distance < 0.35f ? walkSpeed * Mathf.Max(0.35f, distance / 0.35f) : walkSpeed;
                _currentSpeed = Mathf.MoveTowards(_currentSpeed, targetSpeed, dt * 2.5f);

                if (distance > 0.001f)
                {
                    var desired = Quaternion.LookRotation(toTarget / distance, Vector3.up);
                    transform.rotation = Quaternion.RotateTowards(transform.rotation, desired, turnSpeed * dt);
                }

                float step = Mathf.Min(distance, _currentSpeed * dt);
                transform.position = position + (distance > 0.001f ? toTarget / distance * step : Vector3.zero);

                if (distance <= arriveDistance) HasArrived = true;
            }
            else
            {
                _currentSpeed = Mathf.MoveTowards(_currentSpeed, 0f, dt * 4f);
                if (_finalFacing.HasValue)
                    transform.rotation = Quaternion.RotateTowards(transform.rotation, _finalFacing.Value, turnSpeed * 0.6f * dt);
            }

            if (animator != null) animator.WalkSpeed = _currentSpeed;
        }
    }
}

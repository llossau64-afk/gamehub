using System;
using BarberSimulator.Core;
using BarberSimulator.Input;
using UnityEngine;

namespace BarberSimulator.Player
{
    /// <summary>
    /// Walking-pace first-person controller built on CharacterController: acceleration, gravity,
    /// slope/step handling and a restrained head bob. Reads only abstract actions from <see cref="InputService"/>.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class FirstPersonController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Transform head;

        [Header("Movement")]
        [SerializeField] private float walkSpeed = 2.4f;
        [SerializeField] private float briskSpeed = 3.6f;
        [SerializeField] private float acceleration = 11f;
        [SerializeField] private float deceleration = 14f;
        [SerializeField] private float gravity = -19.6f;
        [SerializeField] private float groundedStick = -2f;

        [Header("Look")]
        [SerializeField] private float minPitch = -78f;
        [SerializeField] private float maxPitch = 80f;
        [SerializeField] private float touchLookSmoothing = 22f;

        [Header("Head Bob")]
        [SerializeField] private float bobFrequency = 1.75f;
        [SerializeField] private float bobVertical = 0.022f;
        [SerializeField] private float bobHorizontal = 0.012f;
        [SerializeField] private float stepDistance = 0.72f;

        private CharacterController _controller;
        private InputService _input;
        private Vector3 _planarVelocity;
        private float _verticalVelocity;
        private float _yaw;
        private float _pitch;
        private Vector2 _smoothedTouchLook;
        private float _bobPhase;
        private float _bobBlend;
        private float _distanceSinceStep;
        private Vector3 _headRestLocal;
        private Vector3 _headOffset;
        private Vector3 _impulseOffset;
        private Vector3 _impulseVelocity;

        public bool ControlEnabled { get; private set; }
        public bool CameraBobEnabled { get; set; } = true;
        public Transform Head => head;
        public float Yaw => _yaw;
        public float Pitch => _pitch;
        public Vector3 Velocity => _planarVelocity;

        /// <summary>Raised for every footstep so audio/feedback stays decoupled from movement.</summary>
        public event Action Footstep;

        public void Configure(Transform headPivot)
        {
            head = headPivot;
        }

        private void Awake()
        {
            _controller = GetComponent<CharacterController>();
            _headRestLocal = head.localPosition;
            _yaw = transform.eulerAngles.y;
        }

        public void Initialize(InputService input)
        {
            _input = input;
        }

        public void SetControlEnabled(bool enabled)
        {
            ControlEnabled = enabled;
            if (!enabled)
            {
                _planarVelocity = Vector3.zero;
                _smoothedTouchLook = Vector2.zero;
            }
        }

        public void Teleport(Vector3 position, float yaw, float pitch)
        {
            _controller.enabled = false;
            transform.position = position;
            _controller.enabled = true;
            _yaw = yaw;
            _pitch = Mathf.Clamp(pitch, minPitch, maxPitch);
            _planarVelocity = Vector3.zero;
            _verticalVelocity = 0f;
            ApplyRotation();
        }

        /// <summary>Small positional nudge of the camera (e.g. when picking something up). Springs back.</summary>
        public void AddCameraImpulse(Vector3 localOffset)
        {
            _impulseVelocity += localOffset;
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            if (ControlEnabled && _input != null)
            {
                UpdateLook(dt);
                UpdateMovement(dt);
            }
            else
            {
                ApplyGravityOnly(dt);
            }

            UpdateHeadOffset(dt);
        }

        private void UpdateLook(float dt)
        {
            var look = _input.ReadLookDegrees(dt);

            // Touch input arrives in bursts; light smoothing keeps the camera fluid without adding lag to the mouse.
            if (_input.Mode == InputDeviceMode.Touch)
            {
                _smoothedTouchLook = Vector2.Lerp(_smoothedTouchLook, look / dt, Easing.Damp(touchLookSmoothing, dt));
                look = _smoothedTouchLook * dt;
            }

            _yaw += look.x;
            _pitch = Mathf.Clamp(_pitch - look.y, minPitch, maxPitch);
            ApplyRotation();
        }

        private void ApplyRotation()
        {
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);
            head.localRotation = Quaternion.Euler(_pitch, 0f, 0f);
        }

        private void UpdateMovement(float dt)
        {
            var move = _input.Move;
            float speed = _input.SprintHeld ? briskSpeed : walkSpeed;
            var desired = (transform.right * move.x + transform.forward * move.y) * speed;

            float rate = desired.sqrMagnitude > _planarVelocity.sqrMagnitude ? acceleration : deceleration;
            _planarVelocity = Vector3.Lerp(_planarVelocity, desired, Easing.Damp(rate, dt));
            if (desired.sqrMagnitude < 0.0001f && _planarVelocity.sqrMagnitude < 0.0004f) _planarVelocity = Vector3.zero;

            if (_controller.isGrounded && _verticalVelocity < 0f) _verticalVelocity = groundedStick;
            _verticalVelocity += gravity * dt;

            var before = transform.position;
            var flags = _controller.Move((_planarVelocity + Vector3.up * _verticalVelocity) * dt);

            // Kill velocity into walls so the player does not "stick" when sliding along them.
            if ((flags & CollisionFlags.Sides) != 0)
            {
                var actual = transform.position - before;
                actual.y = 0f;
                _planarVelocity = Vector3.Lerp(_planarVelocity, actual / dt, 0.5f);
            }

            TrackFootsteps(transform.position - before);
        }

        private void ApplyGravityOnly(float dt)
        {
            if (!_controller.enabled) return;
            if (_controller.isGrounded && _verticalVelocity < 0f) _verticalVelocity = groundedStick;
            _verticalVelocity += gravity * dt;
            _controller.Move(Vector3.up * (_verticalVelocity * dt));
        }

        private void TrackFootsteps(Vector3 delta)
        {
            delta.y = 0f;
            float travelled = delta.magnitude;
            if (!_controller.isGrounded || travelled < 0.0001f) return;

            _distanceSinceStep += travelled;
            if (_distanceSinceStep >= stepDistance)
            {
                _distanceSinceStep = 0f;
                Footstep?.Invoke();
            }
        }

        private void UpdateHeadOffset(float dt)
        {
            float speed01 = Mathf.Clamp01(_planarVelocity.magnitude / walkSpeed);
            bool bobActive = CameraBobEnabled && ControlEnabled && _controller.isGrounded;
            _bobBlend = Mathf.Lerp(_bobBlend, bobActive ? speed01 : 0f, Easing.Damp(8f, dt));
            _bobPhase += dt * bobFrequency * Mathf.PI * 2f * Mathf.Lerp(0.6f, 1.15f, speed01);

            var bob = new Vector3(
                Mathf.Cos(_bobPhase * 0.5f) * bobHorizontal,
                Mathf.Abs(Mathf.Sin(_bobPhase * 0.5f)) * bobVertical * 2f - bobVertical,
                0f) * _bobBlend;

            // Critically damped spring for impulses.
            const float stiffness = 90f;
            const float damping = 19f;
            _impulseVelocity += (-stiffness * _impulseOffset - damping * _impulseVelocity) * dt;
            _impulseOffset += _impulseVelocity * dt;

            _headOffset = bob + _impulseOffset;
            head.localPosition = _headRestLocal + _headOffset;
        }
    }
}

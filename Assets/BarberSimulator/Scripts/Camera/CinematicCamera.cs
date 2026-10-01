using System.Collections;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.CameraSystems
{
    /// <summary>
    /// Drives the one and only gameplay camera. Menu, intro and first-person all share it, which is what
    /// makes the menu → intro → gameplay hand-off seamless.
    /// </summary>
    [DefaultExecutionOrder(500)]
    public sealed class CinematicCamera : MonoBehaviour
    {
        [SerializeField] private Camera targetCamera;
        [SerializeField] private float noiseFrequency = 0.22f;
        [SerializeField] private float noiseAngle = 0.55f;

        private Vector3 _basePosition;
        private Quaternion _baseRotation = Quaternion.identity;
        private float _baseFov = 50f;
        private float _handheld;
        private Transform _attachTarget;
        private float _attachedFov = 70f;
        private Coroutine _moveRoutine;
        private float _noiseSeed;

        public Camera Camera => targetCamera;

        public void Configure(Camera cameraToDrive)
        {
            targetCamera = cameraToDrive;
        }
        public bool IsAttached => _attachTarget != null && targetCamera.transform.parent == _attachTarget;

        private void Awake()
        {
            _noiseSeed = Random.value * 100f;
            CaptureCurrentPose();
        }

        public void CaptureCurrentPose()
        {
            var t = targetCamera.transform;
            _basePosition = t.position;
            _baseRotation = t.rotation;
            _baseFov = targetCamera.fieldOfView;
        }

        public void SetPose(Transform point, float fov, float handheld)
        {
            StopMove();
            Detach();
            _basePosition = point.position;
            _baseRotation = point.rotation;
            _baseFov = fov;
            _handheld = handheld;
            ApplyPose();
        }

        /// <summary>Sets the pose directly (used by controllers that animate the camera themselves every frame).</summary>
        public void SetRawPose(Vector3 position, Quaternion rotation, float fov, float handheld)
        {
            if (_attachTarget != null) Detach();
            _basePosition = position;
            _baseRotation = rotation;
            _baseFov = fov;
            _handheld = handheld;
        }

        public IEnumerator PlayShot(CameraShot shot, float durationOverride = -1f)
        {
            float duration = durationOverride > 0f ? durationOverride : shot.Duration;
            yield return MoveBetween(shot.StartPoint, shot.EndPoint, shot.StartFov, shot.EndFov, duration, shot.Handheld, linearish: true);
        }

        /// <summary>Moves from the current pose to <paramref name="target"/>.</summary>
        public IEnumerator MoveTo(Transform target, float fov, float duration, float handheld = 0.25f)
        {
            Detach();
            var fromPos = _basePosition;
            var fromRot = _baseRotation;
            float fromFov = _baseFov;
            _handheld = handheld;

            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.01f, duration);
                float e = Easing.SmootherStep(t);
                _basePosition = Vector3.Lerp(fromPos, target.position, e);
                _baseRotation = Quaternion.Slerp(fromRot, target.rotation, e);
                _baseFov = Mathf.Lerp(fromFov, fov, e);
                yield return null;
            }
        }

        private IEnumerator MoveBetween(Transform from, Transform to, float fovFrom, float fovTo, float duration, float handheld, bool linearish)
        {
            Detach();
            _handheld = handheld;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.01f, duration);
                // Gentle ease-in/out that still keeps moving through the middle of the shot.
                float e = linearish ? Mathf.Lerp(t, Easing.InOutSine(t), 0.6f) : Easing.SmootherStep(t);
                _basePosition = Vector3.Lerp(from.position, to.position, e);
                _baseRotation = Quaternion.Slerp(from.rotation, to.rotation, e);
                _baseFov = Mathf.Lerp(fovFrom, fovTo, e);
                yield return null;
            }
        }

        /// <summary>Blends from the current cinematic pose into the player's head, then parents to it.</summary>
        public IEnumerator BlendToAttach(Transform head, float fov, float duration)
        {
            StopMove();
            var fromPos = targetCamera.transform.position;
            var fromRot = targetCamera.transform.rotation;
            float fromFov = targetCamera.fieldOfView;
            _handheld = 0f;

            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.01f, duration);
                float e = Easing.SmootherStep(t);
                _basePosition = Vector3.Lerp(fromPos, head.position, e);
                _baseRotation = Quaternion.Slerp(fromRot, head.rotation, e);
                _baseFov = Mathf.Lerp(fromFov, fov, e);
                yield return null;
            }

            AttachImmediate(head, fov);
        }

        public void AttachImmediate(Transform head, float fov)
        {
            StopMove();
            _attachTarget = head;
            _attachedFov = fov;
            var t = targetCamera.transform;
            t.SetParent(head, false);
            t.localPosition = Vector3.zero;
            t.localRotation = Quaternion.identity;
            targetCamera.fieldOfView = fov;
        }

        public void SetAttachedFov(float fov)
        {
            _attachedFov = fov;
            if (IsAttached) targetCamera.fieldOfView = fov;
        }

        public void Detach()
        {
            if (_attachTarget == null) return;
            var t = targetCamera.transform;
            t.SetParent(transform, true);
            _attachTarget = null;
            CaptureCurrentPose();
        }

        public void RunMove(IEnumerator routine)
        {
            StopMove();
            _moveRoutine = StartCoroutine(routine);
        }

        public void StopMove()
        {
            if (_moveRoutine != null) StopCoroutine(_moveRoutine);
            _moveRoutine = null;
        }

        private void LateUpdate()
        {
            if (_attachTarget != null)
            {
                targetCamera.fieldOfView = _attachedFov;
                return;
            }
            ApplyPose();
        }

        private void ApplyPose()
        {
            var t = targetCamera.transform;
            t.position = _basePosition;

            if (_handheld > 0.001f)
            {
                // Slow layered Perlin drift: reads as an operator holding the camera, never as shake.
                float time = Time.time * noiseFrequency + _noiseSeed;
                float pitch = (Mathf.PerlinNoise(time, 0.37f) - 0.5f) * 2f;
                float yaw = (Mathf.PerlinNoise(0.71f, time * 0.8f) - 0.5f) * 2f;
                float roll = (Mathf.PerlinNoise(time * 0.6f, 4.2f) - 0.5f) * 2f;
                var noise = Quaternion.Euler(pitch * noiseAngle * _handheld, yaw * noiseAngle * _handheld, roll * noiseAngle * 0.35f * _handheld);
                t.rotation = _baseRotation * noise;
            }
            else
            {
                t.rotation = _baseRotation;
            }

            targetCamera.fieldOfView = _baseFov;
        }
    }
}

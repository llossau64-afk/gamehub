using System.Collections.Generic;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.CameraSystems
{
    /// <summary>
    /// Main-menu camera: holds each authored shot (MenuCam_01..n) for its duration with a slow drift, then glides
    /// to the next one. There are no cuts and no dips to black: the camera is always showing the shop, so the menu
    /// can never look like a frozen black screen. Long blends arc through a waypoint high in the middle of the room so
    /// the camera never passes through furniture. Runs on unscaled time (works while the game is paused).
    /// </summary>
    public sealed class MainMenuCameraController : MonoBehaviour
    {
        [SerializeField] private List<CameraShot> shots = new List<CameraShot>();
        [Tooltip("Seconds spent gliding from one shot to the next.")]
        [SerializeField] private float blendDuration = 3.2f;
        [Tooltip("Blends longer than this arc through the waypoint instead of travelling in a straight line.")]
        [SerializeField] private float arcDistance = 2.2f;
        [SerializeField] private Transform blendWaypoint;

        private enum Phase { Idle, Holding, Blending }

        private CinematicCamera _camera;
        private Phase _phase = Phase.Idle;
        private int _index;
        private float _time;
        private Vector3 _blendFromPos;
        private Quaternion _blendFromRot;
        private float _blendFromFov;

        public bool IsPlaying => _phase != Phase.Idle;
        public IReadOnlyList<CameraShot> Shots => shots;
        public CameraShot CurrentShot => shots.Count > 0 ? shots[_index] : null;

        public void Configure(List<CameraShot> menuShots, Transform waypoint)
        {
            shots = menuShots;
            blendWaypoint = waypoint;
        }

        public void Initialize(CinematicCamera cinematicCamera)
        {
            _camera = cinematicCamera;
        }

        /// <summary>
        /// Starts the shot loop. With <paramref name="glideIn"/> the camera first glides from wherever it is (for
        /// example when coming back from the settings); otherwise it starts exactly on the first shot.
        /// </summary>
        public void Play(bool glideIn = false)
        {
            if (_camera == null || shots.Count == 0) return;
            _camera.StopMove();
            _camera.Detach();
            if (glideIn)
            {
                BeginBlend();
                return;
            }
            _phase = Phase.Holding;
            _time = 0f;
            ApplyShot(shots[_index], 0f);
        }

        /// <summary>Stops moving but leaves the camera where it is (the intro takes over from this pose).</summary>
        public void Stop()
        {
            _phase = Phase.Idle;
        }

        private void LateUpdate()
        {
            if (_phase == Phase.Idle || _camera == null || shots.Count == 0) return;
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.1f);
            _time += dt;
            var shot = shots[_index];

            if (_phase == Phase.Holding)
            {
                float duration = Mathf.Max(1f, shot.Duration);
                ApplyShot(shot, Mathf.Clamp01(_time / duration));
                if (_time >= duration)
                {
                    _index = (_index + 1) % shots.Count;
                    BeginBlend();
                }
                return;
            }

            // Blending towards the start of the current shot.
            float t = Mathf.Clamp01(_time / blendDuration);
            float e = Easing.SmootherStep(t);
            var target = shot.StartPoint;
            Vector3 position;
            if (blendWaypoint != null && Vector3.Distance(_blendFromPos, target.position) > arcDistance)
            {
                // Quadratic Bezier through the waypoint keeps long moves above the furniture.
                var a = Vector3.Lerp(_blendFromPos, blendWaypoint.position, e);
                var b = Vector3.Lerp(blendWaypoint.position, target.position, e);
                position = Vector3.Lerp(a, b, e);
            }
            else
            {
                position = Vector3.Lerp(_blendFromPos, target.position, e);
            }
            var rotation = Quaternion.Slerp(_blendFromRot, target.rotation, e);
            float fov = Mathf.Lerp(_blendFromFov, shot.StartFov, e);
            _camera.SetRawPose(position, rotation, fov, Mathf.Lerp(0.15f, shot.Handheld, e));
            if (t >= 1f)
            {
                _phase = Phase.Holding;
                _time = 0f;
            }
        }

        private void BeginBlend()
        {
            var cam = _camera.Camera;
            _blendFromPos = cam.transform.position;
            _blendFromRot = cam.transform.rotation;
            _blendFromFov = cam.fieldOfView;
            _phase = Phase.Blending;
            _time = 0f;
        }

        private void ApplyShot(CameraShot shot, float t)
        {
            // Gentle ease that keeps drifting through the middle of the shot.
            float e = Mathf.Lerp(t, Easing.InOutSine(t), 0.6f);
            var from = shot.StartPoint;
            var to = shot.EndPoint;
            _camera.SetRawPose(Vector3.Lerp(from.position, to.position, e), Quaternion.Slerp(from.rotation, to.rotation, e),
                Mathf.Lerp(shot.StartFov, shot.EndFov, e), shot.Handheld);
        }
    }
}

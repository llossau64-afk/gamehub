using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Core;
using UnityEngine;

namespace BarberSimulator.CameraSystems
{
    /// <summary>Cycles slow cinematic shots behind the main menu with soft dips to black between them.</summary>
    public sealed class MenuCameraDirector : MonoBehaviour
    {
        [SerializeField] private List<CameraShot> shots = new List<CameraShot>();
        [SerializeField] private float dipDuration = 0.65f;

        private CinematicCamera _camera;
        private IScreenFade _sceneFade;
        private Coroutine _loop;
        private int _index;

        public bool IsPlaying => _loop != null;
        public IReadOnlyList<CameraShot> Shots => shots;

        public void Initialize(CinematicCamera cinematicCamera, IScreenFade sceneFade)
        {
            _camera = cinematicCamera;
            _sceneFade = sceneFade;
        }

        public void SetShots(List<CameraShot> menuShots)
        {
            shots = menuShots;
        }

        public void Play(bool fadeInFromBlack)
        {
            Stop();
            if (shots.Count == 0) return;
            _loop = StartCoroutine(Loop(fadeInFromBlack));
        }

        /// <summary>Stops cutting between shots but leaves the camera where it is.</summary>
        public void Stop()
        {
            if (_loop != null) StopCoroutine(_loop);
            _loop = null;
            _camera.StopMove();
        }

        private IEnumerator Loop(bool fadeIn)
        {
            bool first = true;
            while (true)
            {
                var shot = shots[_index];
                _index = (_index + 1) % shots.Count;

                _camera.SetPose(shot.StartPoint, shot.StartFov, shot.Handheld);
                _camera.RunMove(_camera.PlayShot(shot));

                if (!first || fadeIn) StartCoroutine(_sceneFade.FadeTo(0f, first ? 1.6f : dipDuration));
                first = false;

                yield return new WaitForSeconds(Mathf.Max(0.5f, shot.Duration - dipDuration));
                yield return _sceneFade.FadeTo(1f, dipDuration);
            }
        }
    }
}

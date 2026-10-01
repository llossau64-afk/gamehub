using BarberSimulator.Audio;
using UnityEngine;

namespace BarberSimulator.Player
{
    /// <summary>Translates controller events into sounds.</summary>
    public sealed class PlayerAudio : MonoBehaviour
    {
        [SerializeField] private float footstepVolume = 0.45f;

        private FirstPersonController _controller;
        private AudioService _audio;

        public void Initialize(FirstPersonController controller, AudioService audio)
        {
            _controller = controller;
            _audio = audio;
            _controller.Footstep += OnFootstep;
        }

        private void OnDestroy()
        {
            if (_controller != null) _controller.Footstep -= OnFootstep;
        }

        private void OnFootstep()
        {
            if (_audio != null && _audio.Library != null)
                _audio.PlayRandomSfx(_audio.Library.footsteps, footstepVolume, 0.08f);
        }
    }
}

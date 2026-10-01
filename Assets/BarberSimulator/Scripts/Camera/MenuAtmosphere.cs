using BarberSimulator.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace BarberSimulator.CameraSystems
{
    /// <summary>
    /// Main-menu look: a soft depth of field (its own post-processing volume, faded in and out with the menu) and
    /// slow dust motes drifting in the window light. Both switch off in gameplay and respect the graphics settings.
    /// </summary>
    public sealed class MenuAtmosphere : MonoBehaviour
    {
        [SerializeField] private Volume depthOfFieldVolume;
        [SerializeField] private ParticleSystem dust;
        [SerializeField] private float fadeSeconds = 0.8f;

        private float _targetWeight;
        private bool _allowPostEffects = true;
        private bool _allowAmbientEffects = true;
        private bool _menuActive;

        public void Configure(Volume volume, ParticleSystem dustParticles)
        {
            depthOfFieldVolume = volume;
            dust = dustParticles;
        }

        private void Awake()
        {
            if (depthOfFieldVolume != null) depthOfFieldVolume.weight = 0f;
            if (dust != null) dust.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
        }

        /// <summary>Graphics options: post-processing (depth of field) and ambient effects (dust).</summary>
        public void SetQuality(bool postEffects, bool ambientEffects)
        {
            _allowPostEffects = postEffects;
            _allowAmbientEffects = ambientEffects;
            SetMenuActive(_menuActive);
        }

        public void SetMenuActive(bool active)
        {
            _menuActive = active;
            _targetWeight = active && _allowPostEffects ? 1f : 0f;
            if (dust == null) return;
            bool wantDust = active && _allowAmbientEffects;
            if (wantDust && !dust.isPlaying) dust.Play(true);
            else if (!wantDust && dust.isPlaying) dust.Stop(true, ParticleSystemStopBehavior.StopEmitting);
        }

        private void Update()
        {
            if (depthOfFieldVolume == null) return;
            float w = depthOfFieldVolume.weight;
            if (Mathf.Approximately(w, _targetWeight)) return;
            w = Mathf.MoveTowards(w, _targetWeight, Time.unscaledDeltaTime / Mathf.Max(0.05f, fadeSeconds));
            depthOfFieldVolume.weight = w;
            depthOfFieldVolume.enabled = w > 0.001f;
        }
    }
}

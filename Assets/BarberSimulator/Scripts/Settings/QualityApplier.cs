using System.Collections.Generic;
using BarberSimulator.Save;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace BarberSimulator.Settings
{
    /// <summary>
    /// Maps the three player-facing tiers onto Unity quality levels (each with its own URP asset)
    /// and applies the fine-grained toggles on a runtime copy so editor assets are never modified.
    /// </summary>
    public sealed class QualityApplier
    {
        private readonly List<Light> _shadowCasters = new List<Light>();
        private readonly Dictionary<Light, float> _baseIntensity = new Dictionary<Light, float>();
        private readonly List<UniversalAdditionalCameraData> _cameras = new List<UniversalAdditionalCameraData>();
        private readonly Dictionary<int, UniversalRenderPipelineAsset> _runtimeCopies = new Dictionary<int, UniversalRenderPipelineAsset>();

        private readonly Dictionary<int, RenderPipelineAsset> _originals = new Dictionary<int, RenderPipelineAsset>();

        public QualityTier CurrentTier { get; private set; }

        public QualityApplier()
        {
#if UNITY_EDITOR
            Application.quitting += RestoreOriginals;
#endif
        }

        public void RegisterShadowLight(Light light)
        {
            if (light == null || _shadowCasters.Contains(light)) return;
            _shadowCasters.Add(light);
            _baseIntensity[light] = light.intensity;
        }

        public void RegisterCamera(Camera camera)
        {
            if (camera == null) return;
            var data = camera.GetComponent<UniversalAdditionalCameraData>();
            if (data != null && !_cameras.Contains(data)) _cameras.Add(data);
        }

        /// <summary>Applies every graphics related setting: tier, render scale, shadows, textures, AA, post effects and frame pacing.</summary>
        public void Apply(SettingsData data)
        {
            var tier = data.quality;
            CurrentTier = tier;
            bool web = Application.platform == RuntimePlatform.WebGLPlayer;
            // Ultra is a desktop tier. In the browser it runs with the High-safe values (no render scale boost, 4x MSAA).
            bool ultra = tier == QualityTier.Ultra && !web;
            var shadowQuality = (ShadowDetail)Mathf.Clamp(data.shadowQuality, 0, 2);
            bool shadows = shadowQuality != ShadowDetail.Off;

            // Ultra shares the High pipeline asset; the extra detail comes from the runtime copy below.
            int level = Mathf.Clamp((int)tier, 0, QualitySettings.names.Length - 1);
            if (QualitySettings.GetQualityLevel() != level) QualitySettings.SetQualityLevel(level, true);

            var asset = GetRuntimeAsset(level);
            if (asset != null)
            {
                float scale = data.renderScale * (ultra ? UltraRenderScaleBoost : 1f);
                asset.renderScale = Mathf.Clamp(scale, 0.5f, ultra ? 1.5f : 1f);
                asset.shadowDistance = shadows ? ShadowDistanceFor(tier, shadowQuality, web) : 0f;
                asset.shadowCascadeCount = shadowQuality == ShadowDetail.High && tier != QualityTier.Low ? 2 : 1;
                asset.msaaSampleCount = !data.antiAliasing || tier == QualityTier.Low ? 1 : (ultra ? 8 : 4);
                asset.supportsHDR = tier >= QualityTier.High;
            }

#if UNITY_6000_0_OR_NEWER
            QualitySettings.globalTextureMipmapLimit = Mathf.Clamp(data.textureQuality, 0, 1);
#else
            QualitySettings.masterTextureLimit = Mathf.Clamp(data.textureQuality, 0, 1);
#endif

            foreach (var light in _shadowCasters)
            {
                if (light == null) continue;
                light.shadows = !shadows ? LightShadows.None
                    : (tier == QualityTier.Low || shadowQuality == ShadowDetail.Low ? LightShadows.Hard : LightShadows.Soft);
                // The sun reaches the interior only through the windows; without shadow maps it would light
                // every floor tile, so it is dimmed instead of changing the look of the shop.
                light.intensity = _baseIntensity[light] * (shadows ? 1f : 0.3f);
            }

            bool postProcessing = data.postProcessing;
            foreach (var cameraData in _cameras)
            {
                if (cameraData == null) continue;
                cameraData.renderPostProcessing = postProcessing;
                // MSAA is too costly on low-end devices, FXAA is a cheap stand-in there.
                cameraData.antialiasing = data.antiAliasing && tier == QualityTier.Low
                    ? AntialiasingMode.FastApproximateAntialiasing
                    : AntialiasingMode.None;
            }

            ApplyMotionBlur(data.motionBlur && postProcessing && tier != QualityTier.Low);
            ApplyFramePacing(data, web);
        }

        private static void ApplyFramePacing(SettingsData data, bool web)
        {
            if (web)
            {
                // The browser drives the loop with requestAnimationFrame; -1 hands the pacing to it.
                QualitySettings.vSyncCount = 0;
                Application.targetFrameRate = -1;
                return;
            }

            if (Application.isMobilePlatform)
            {
                QualitySettings.vSyncCount = 0;
                Application.targetFrameRate = 60;
                return;
            }

            QualitySettings.vSyncCount = data.vSync ? 1 : 0;
            switch ((FpsLimit)Mathf.Clamp(data.fpsLimit, 0, 2))
            {
                case FpsLimit.Fps30: Application.targetFrameRate = 30; break;
                case FpsLimit.Fps60: Application.targetFrameRate = 60; break;
                default: Application.targetFrameRate = -1; break;
            }
            // With V-Sync on, the display's refresh rate paces the game and the cap is ignored by Unity.
        }

        /// <summary>Motion blur lives in its own global volume so it works with any scene volume profile.</summary>
        private void ApplyMotionBlur(bool enabled)
        {
            if (_motionBlurVolume == null)
            {
                if (!enabled) return;
                var go = new GameObject("Motion Blur Volume");
                _motionBlurVolume = go.AddComponent<Volume>();
                _motionBlurVolume.isGlobal = true;
                _motionBlurVolume.priority = 50f;
                var profile = ScriptableObject.CreateInstance<VolumeProfile>();
                var blur = profile.Add<MotionBlur>(true);
                if (blur != null)
                {
                    blur.intensity.Override(0.3f);
                    blur.clamp.Override(0.04f);
                }
                _motionBlurVolume.sharedProfile = profile;
            }
            _motionBlurVolume.weight = enabled ? 1f : 0f;
            _motionBlurVolume.gameObject.SetActive(enabled);
        }

        private const float UltraRenderScaleBoost = 1.25f;
        private Volume _motionBlurVolume;

        private static float ShadowDistanceFor(QualityTier tier, ShadowDetail quality, bool web)
        {
            float distance;
            switch (tier)
            {
                case QualityTier.Low: distance = 12f; break;
                case QualityTier.Medium: distance = 20f; break;
                case QualityTier.High: distance = 28f; break;
                default: distance = web ? 28f : 42f; break;
            }
            return quality == ShadowDetail.Low ? distance * 0.6f : distance;
        }

        private UniversalRenderPipelineAsset GetRuntimeAsset(int level)
        {
            if (_runtimeCopies.TryGetValue(level, out var copy) && copy != null)
            {
                if (QualitySettings.renderPipeline != copy) QualitySettings.renderPipeline = copy;
                return copy;
            }

            var source = QualitySettings.renderPipeline as UniversalRenderPipelineAsset;
            if (source == null) source = GraphicsSettings.defaultRenderPipeline as UniversalRenderPipelineAsset;
            if (source == null) return null;

            copy = Object.Instantiate(source);
            copy.name = source.name + " (Runtime)";
            _runtimeCopies[level] = copy;
            _originals[level] = QualitySettings.renderPipeline;
            QualitySettings.renderPipeline = copy;
            return copy;
        }

#if UNITY_EDITOR
        // Quality level assignments made in play mode would otherwise leak into the project settings.
        private void RestoreOriginals()
        {
            int current = QualitySettings.GetQualityLevel();
            foreach (var pair in _originals)
            {
                QualitySettings.SetQualityLevel(pair.Key, false);
                QualitySettings.renderPipeline = pair.Value;
            }
            QualitySettings.SetQualityLevel(current, false);
            _originals.Clear();
            _runtimeCopies.Clear();
        }
#endif
    }
}

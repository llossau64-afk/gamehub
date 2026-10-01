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

        public void Apply(QualityTier tier, float renderScale, bool shadows, bool antiAliasing)
        {
            CurrentTier = tier;
            int level = Mathf.Clamp((int)tier, 0, QualitySettings.names.Length - 1);
            if (QualitySettings.GetQualityLevel() != level) QualitySettings.SetQualityLevel(level, true);

            var asset = GetRuntimeAsset(level);
            if (asset != null)
            {
                asset.renderScale = Mathf.Clamp(renderScale, 0.5f, 1f);
                asset.shadowDistance = shadows ? ShadowDistanceFor(tier) : 0f;
                asset.msaaSampleCount = antiAliasing ? (tier == QualityTier.Low ? 1 : 4) : 1;
                asset.supportsHDR = tier == QualityTier.High;
            }

            foreach (var light in _shadowCasters)
            {
                if (light == null) continue;
                light.shadows = shadows ? (tier == QualityTier.Low ? LightShadows.Hard : LightShadows.Soft) : LightShadows.None;
                // The sun reaches the interior only through the windows; without shadow maps it would light
                // every floor tile, so it is dimmed instead of changing the look of the shop.
                light.intensity = _baseIntensity[light] * (shadows ? 1f : 0.3f);
            }

            foreach (var cameraData in _cameras)
            {
                if (cameraData == null) continue;
                cameraData.renderPostProcessing = tier != QualityTier.Low;
                // MSAA is too costly on low-end devices, FXAA is a cheap stand-in there.
                cameraData.antialiasing = antiAliasing && tier == QualityTier.Low
                    ? AntialiasingMode.FastApproximateAntialiasing
                    : AntialiasingMode.None;
            }

            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = Application.platform == RuntimePlatform.WebGLPlayer ? -1 : 60;
        }

        private static float ShadowDistanceFor(QualityTier tier)
        {
            switch (tier)
            {
                case QualityTier.Low: return 12f;
                case QualityTier.Medium: return 20f;
                default: return 28f;
            }
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

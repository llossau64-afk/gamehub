// Colour grading per frame (main.js postLook + the Post pass settings): golden hour warmer with more
// glow, rain flatter and cooler; the garage has its own fixed look. In Unity this drives the scene's
// global URP volume (built by ProjectSetup: Bloom, ColorAdjustments, WhiteBalance, Vignette); without
// URP it is a no-op. Low quality turns post-processing off on the camera, like the web build.
using UnityEngine;
#if DOWNFALL_URP
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
#endif

namespace Downfall
{
    public sealed partial class GameBoot
    {
        public sealed class PostLookData { public double bloom, warm, contrast, sat, vig; }
        static readonly PostLookData GARAGE_LOOK = new PostLookData { bloom = 0.3, warm = 0.35, vig = 0.18, contrast = 1.0, sat = 1.05 };
        readonly PostLookData pl = new PostLookData();
        bool postEnabled = true;

        PostLookData PostLook(EnvLook L)
        {
            if (L == null) return null;
            double rain = System.Math.Max(L.rain, L.storm), low = 1 - U.Clamp((L.sunElev - 4) / 40, 0, 1);
            pl.bloom = 0.42 + low * 0.38 - rain * 0.15; pl.warm = 0.45 + low * 0.95 - rain * 0.5;
            pl.contrast = 1.02 + low * 0.02 - rain * 0.03; pl.sat = 1.07 + low * 0.05 - rain * 0.16; pl.vig = 0.2 + rain * 0.1;
            return pl;
        }

#if DOWNFALL_URP
        Bloom pBloom; ColorAdjustments pColor; WhiteBalance pWhite; Vignette pVig;
        UniversalAdditionalCameraData camData;
        void PostInit()
        {
            postEnabled = quality != "low";
            camData = cam ? cam.GetUniversalAdditionalCameraData() : null;
            var vol = FindObjectOfType<Volume>();
            if (vol == null || vol.sharedProfile == null) return;
            var prof = vol.profile;   // runtime instance: the asset stays untouched
            prof.TryGet(out pBloom); prof.TryGet(out pColor); prof.TryGet(out pWhite); prof.TryGet(out pVig);
        }
        // values are mapped so the web defaults land on the profile defaults (bloom 0.42 -> 0.55, contrast 1.06 -> 6, ...)
        void ApplyPost(PostLookData L)
        {
            if (camData != null && camData.renderPostProcessing != postEnabled) camData.renderPostProcessing = postEnabled;
            if (L == null || !postEnabled) return;
            if (pBloom != null) pBloom.intensity.value = (float)(L.bloom * 1.3);
            if (pColor != null) { pColor.contrast.value = (float)((L.contrast - 1) * 100); pColor.saturation.value = (float)((L.sat - 1) * 100); }
            if (pWhite != null) pWhite.temperature.value = (float)(L.warm * 9);
            if (pVig != null) pVig.intensity.value = (float)(L.vig * 1.6);
        }
#else
        void PostInit() { postEnabled = quality != "low"; }
        void ApplyPost(PostLookData L) { }
#endif
    }
}

using BarberSimulator.Save;

namespace BarberSimulator.Settings
{
    /// <summary>
    /// Read-only snapshot of the player settings that systems far from the settings screen care about (camera,
    /// environment, subtitles, UI motion). <see cref="SettingsService"/> refreshes it after every change, so those
    /// systems never need a reference to the service. Safe defaults apply until the first publish.
    /// </summary>
    public static class LiveSettings
    {
        /// <summary>Dust particles and other decorative ambient motion. The camera / environment code reads this.</summary>
        public static bool AmbientEffects { get; private set; } = true;

        /// <summary>Accessibility: no camera bob, no UI slides, no hover scaling.</summary>
        public static bool ReduceMotion { get; private set; }

        public static bool CameraBob { get; private set; } = true;

        /// <summary>Multiplier for dialogue and cinematic subtitle font sizes (1 = normal).</summary>
        public static float SubtitleScale { get; private set; } = 1f;

        public static bool MotionBlur { get; private set; }

        public const float LargeSubtitleScale = 1.3f;

        public static void Publish(SettingsData data)
        {
            if (data == null) return;
            AmbientEffects = data.ambientEffects;
            ReduceMotion = data.reduceMotion;
            CameraBob = data.cameraBob && !data.reduceMotion;
            SubtitleScale = data.subtitleSize == 1 ? LargeSubtitleScale : 1f;
            MotionBlur = data.motionBlur;
        }
    }
}

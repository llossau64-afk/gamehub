using System;
using GuessTheAnswer.Audio;
using GuessTheAnswer.Platform;
using GuessTheAnswer.Save;
using UnityEngine;

namespace GuessTheAnswer.Settings
{
    /// <summary>Applies and persists player settings (volumes, graphics, fullscreen, FPS counter, haptics).</summary>
    public sealed class SettingsManager
    {
        readonly SaveManager save;
        readonly AudioManager audio;

        public event Action Changed;

        public SettingsManager(SaveManager save, AudioManager audio)
        {
            this.save = save;
            this.audio = audio;
        }

        SettingsData Data => save.Data.settings;

        public float MasterVolume => Data.masterVolume;
        public float MusicVolume => Data.musicVolume;
        public float SfxVolume => Data.sfxVolume;
        public bool Muted => Data.muted;
        public bool ShowFps => Data.showFps;
        public bool Haptics => Data.haptics;
        public string Language => Data.language;
        public GraphicsQuality Graphics => (GraphicsQuality)Mathf.Clamp(Data.graphics, 0, 2);

        public void ApplyAll()
        {
            if (Data.graphics < 0)
            {
                // First launch: phones get the optimized level, desktops the full one.
                Data.graphics = (int)(BrowserBridge.IsMobile ? GraphicsQuality.Medium : GraphicsQuality.High);
                save.MarkDirty();
            }
            ApplyAudio();
            ApplyGraphics();
        }

        void ApplyAudio()
        {
            audio.SetVolumes(Data.masterVolume, Data.musicVolume, Data.sfxVolume, Data.muted);
        }

        void ApplyGraphics()
        {
            // UI-only game: quality mostly means frame rate and how much decoration animates.
            // -1 lets the browser drive the frame rate (requestAnimationFrame), the smoothest option on WebGL.
            Application.targetFrameRate = Graphics == GraphicsQuality.Low ? 30 : -1;
            QualitySettings.vSyncCount = 0;
            QualitySettings.antiAliasing = 0;
        }

        void Commit()
        {
            save.MarkDirty();
            Changed?.Invoke();
        }

        public void SetMaster(float v) { Data.masterVolume = Mathf.Clamp01(v); ApplyAudio(); Commit(); }
        public void SetMusic(float v) { Data.musicVolume = Mathf.Clamp01(v); ApplyAudio(); Commit(); }
        public void SetSfx(float v) { Data.sfxVolume = Mathf.Clamp01(v); ApplyAudio(); Commit(); }
        public void SetMuted(bool m) { Data.muted = m; ApplyAudio(); Commit(); }
        public void ToggleMute() => SetMuted(!Data.muted);
        public void SetGraphics(GraphicsQuality q) { Data.graphics = (int)q; ApplyGraphics(); Commit(); }
        public void SetShowFps(bool on) { Data.showFps = on; Commit(); }
        public void SetHaptics(bool on) { Data.haptics = on; Commit(); }
        public void SetLanguage(string code) { Data.language = string.IsNullOrEmpty(code) ? "en" : code; Commit(); }

        public bool Fullscreen => Screen.fullScreen;

        /// <summary>Browsers only allow fullscreen from a user gesture; Unity WebGL defers it to the next click.</summary>
        public void SetFullscreen(bool on)
        {
            Screen.fullScreen = on;
            Changed?.Invoke();
        }
    }
}

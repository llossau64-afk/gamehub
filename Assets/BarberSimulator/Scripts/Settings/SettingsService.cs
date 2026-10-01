using System;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Settings
{
    /// <summary>
    /// Owns the live <see cref="SettingsData"/> (stored inside the save file) and applies it.
    /// UI writes through the setters so every change is applied and persisted the same way.
    /// </summary>
    public sealed class SettingsService
    {
        private readonly SaveService _save;
        private readonly QualityApplier _quality;

        public SettingsData Data => _save.Data.settings;

        /// <summary>Raised after any setting changed and was applied.</summary>
        public event Action Changed;

        public SettingsService(SaveService save, QualityApplier quality)
        {
            _save = save;
            _quality = quality;
        }

        public void Initialize()
        {
            if (!Data.qualityAutoDetected)
            {
                Data.quality = DetectQualityTier();
                Data.renderScale = Application.isMobilePlatform ? 0.85f : 1f;
                Data.qualityAutoDetected = true;
                _save.RequestSave();
            }

            ApplyGraphics();
        }

        public void ApplyGraphics()
        {
            _quality.Apply(Data.quality, Data.renderScale, Data.shadows, Data.antiAliasing);
        }

        public void SetQuality(QualityTier tier) { Data.quality = tier; ApplyGraphics(); Commit(); }
        public void SetRenderScale(float value) { Data.renderScale = Mathf.Clamp(value, 0.5f, 1f); ApplyGraphics(); Commit(); }
        public void SetShadows(bool value) { Data.shadows = value; ApplyGraphics(); Commit(); }
        public void SetAntiAliasing(bool value) { Data.antiAliasing = value; ApplyGraphics(); Commit(); }

        public void SetMasterVolume(float v) { Data.masterVolume = Mathf.Clamp01(v); Commit(); }
        public void SetMusicVolume(float v) { Data.musicVolume = Mathf.Clamp01(v); Commit(); }
        public void SetSfxVolume(float v) { Data.sfxVolume = Mathf.Clamp01(v); Commit(); }
        public void SetAmbienceVolume(float v) { Data.ambienceVolume = Mathf.Clamp01(v); Commit(); }
        public void SetUiVolume(float v) { Data.uiVolume = Mathf.Clamp01(v); Commit(); }

        public void SetMouseSensitivity(float v) { Data.mouseSensitivity = Mathf.Clamp(v, 0.1f, 3f); Commit(); }
        public void SetTouchSensitivity(float v) { Data.touchSensitivity = Mathf.Clamp(v, 0.1f, 3f); Commit(); }
        public void SetInvertLookY(bool v) { Data.invertLookY = v; Commit(); }
        public void SetJoystickOpacity(float v) { Data.joystickOpacity = Mathf.Clamp(v, 0.2f, 1f); Commit(); }
        public void SetDynamicJoystick(bool v) { Data.dynamicJoystick = v; Commit(); }

        public void SetCameraBob(bool v) { Data.cameraBob = v; Commit(); }
        public void SetTutorialHints(bool v) { Data.tutorialHints = v; Commit(); }
        public void SetLanguage(string code) { Data.language = code; Commit(); }

        private void Commit()
        {
            _save.RequestSave();
            Changed?.Invoke();
        }

        private static QualityTier DetectQualityTier()
        {
            if (Application.isMobilePlatform) return QualityTier.Low;
            // WebGL reports little hardware info; memory and core count are a rough but useful signal.
            if (SystemInfo.systemMemorySize > 0 && SystemInfo.systemMemorySize < 4096) return QualityTier.Low;
            if (SystemInfo.processorCount > 0 && SystemInfo.processorCount <= 2) return QualityTier.Low;
            return QualityTier.Medium;
        }
    }
}

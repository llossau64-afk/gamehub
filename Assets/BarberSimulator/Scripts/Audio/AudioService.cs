using System.Collections;
using System.Collections.Generic;
using BarberSimulator.Save;
using UnityEngine;

namespace BarberSimulator.Audio
{
    /// <summary>
    /// Plays all game audio through per-category sources. Category volumes come from <see cref="SettingsData"/>;
    /// there is no AudioMixer so the system stays cheap and WebGL friendly.
    /// </summary>
    public sealed class AudioService : MonoBehaviour
    {
        private const int OneShotPoolSize = 10;

        private SettingsData _settings;
        private SoundLibrary _library;

        private AudioSource _musicSource;
        private AudioSource _uiSource;
        private AudioSource _sfx2DSource;
        private readonly Dictionary<string, AmbienceLayer> _ambience = new Dictionary<string, AmbienceLayer>();
        private readonly List<AudioSource> _spatialPool = new List<AudioSource>(OneShotPoolSize);
        private int _nextSpatial;

        private float _musicTarget;
        private float _musicLevel;
        private float _musicFadeSpeed = 1f;
        private float _lastHoverTime;
        private bool _muted;

        public SoundLibrary Library => _library;

        /// <summary>Silences everything (used while a portal ad plays). Independent of the user's volume settings.</summary>
        public bool Muted
        {
            get => _muted;
            set
            {
                _muted = value;
                AudioListener.volume = value ? 0f : 1f;
            }
        }

        private sealed class AmbienceLayer
        {
            public AudioSource Source;
            public float Level;
            public float Target;
            public float FadeSpeed;
        }

        public void Initialize(SoundLibrary library, SettingsData settings)
        {
            _library = library;
            _settings = settings;

            _musicSource = CreateSource("Music", loop: true);
            _uiSource = CreateSource("UI", loop: false);
            _sfx2DSource = CreateSource("SFX 2D", loop: false);

            for (int i = 0; i < OneShotPoolSize; i++)
            {
                var source = CreateSource("SFX 3D " + i, loop: false);
                source.spatialBlend = 1f;
                source.rolloffMode = AudioRolloffMode.Linear;
                source.minDistance = 1f;
                source.maxDistance = 14f;
                source.dopplerLevel = 0f;
                _spatialPool.Add(source);
            }
        }

        public void BindSettings(SettingsData settings)
        {
            _settings = settings;
        }

        private AudioSource CreateSource(string sourceName, bool loop)
        {
            var go = new GameObject(sourceName);
            go.transform.SetParent(transform, false);
            var source = go.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = 0f;
            return source;
        }

        private float Volume(AudioCategory category)
        {
            if (_settings == null) return 1f;
            float master = _settings.masterVolume;
            switch (category)
            {
                case AudioCategory.Music: return master * _settings.musicVolume;
                case AudioCategory.Ambience: return master * _settings.ambienceVolume;
                case AudioCategory.UI: return master * _settings.uiVolume;
                default: return master * _settings.sfxVolume;
            }
        }

        /// <summary>Current effective volume of a category (master × category).</summary>
        public float CategoryVolume(AudioCategory category) => Volume(category);

        /// <summary>A dedicated looping 2D source owned by the caller (clipper hum etc.).</summary>
        public AudioSource CreateLoopSource(string sourceName)
        {
            var source = CreateSource(sourceName, loop: true);
            source.volume = 0f;
            return source;
        }

        /// <param name="pitch">1 = as recorded. The UI source is shared, so every call sets it (a pitched sound never leaks into the next one).</param>
        public void PlayUI(AudioClip clip, float volume = 1f, float pitch = 1f)
        {
            if (clip == null) return;
            _uiSource.pitch = pitch;
            _uiSource.PlayOneShot(clip, volume * Volume(AudioCategory.UI));
        }

        /// <summary>Hover sounds are rate limited so sweeping across a menu does not machine-gun clicks.</summary>
        public void PlayHover()
        {
            if (Time.unscaledTime - _lastHoverTime < 0.06f) return;
            _lastHoverTime = Time.unscaledTime;
            PlayUI(_library != null ? _library.uiHover : null, 0.55f);
        }

        public void PlayClick() => PlayUI(_library != null ? _library.uiClick : null, 0.8f);
        public void PlayBack() => PlayUI(_library != null ? _library.uiBack : null, 0.8f);

        public void PlaySfx(AudioClip clip, float volume = 1f, float pitchVariance = 0f)
        {
            if (clip == null) return;
            _sfx2DSource.pitch = 1f + Random.Range(-pitchVariance, pitchVariance);
            _sfx2DSource.PlayOneShot(clip, volume * Volume(AudioCategory.Sfx));
        }

        public void PlaySfxAt(AudioClip clip, Vector3 position, float volume = 1f, float pitchVariance = 0.05f)
        {
            if (clip == null) return;
            var source = _spatialPool[_nextSpatial];
            _nextSpatial = (_nextSpatial + 1) % _spatialPool.Count;
            source.transform.position = position;
            source.pitch = 1f + Random.Range(-pitchVariance, pitchVariance);
            source.volume = volume * Volume(AudioCategory.Sfx);
            source.clip = clip;
            source.Play();
        }

        public void PlayRandomSfx(AudioClip[] clips, float volume = 1f, float pitchVariance = 0.06f)
        {
            if (clips == null || clips.Length == 0) return;
            PlaySfx(clips[Random.Range(0, clips.Length)], volume, pitchVariance);
        }

        public void PlayMusic(AudioClip clip, float level = 1f, float fadeSeconds = 2f)
        {
            if (clip == null)
            {
                FadeMusic(0f, fadeSeconds);
                return;
            }

            if (_musicSource.clip != clip)
            {
                _musicSource.clip = clip;
                _musicLevel = 0f;
                _musicSource.Play();
            }
            else if (!_musicSource.isPlaying)
            {
                _musicSource.Play();
            }

            FadeMusic(level, fadeSeconds);
        }

        public void FadeMusic(float level, float fadeSeconds)
        {
            _musicTarget = Mathf.Clamp01(level);
            _musicFadeSpeed = fadeSeconds <= 0.01f ? 1000f : 1f / fadeSeconds;
        }

        /// <summary>Starts or re-targets a looping ambience layer identified by <paramref name="layerId"/>.</summary>
        public void SetAmbience(string layerId, AudioClip clip, float level, float fadeSeconds = 2f, float lowPassCutoff = 22000f)
        {
            if (!_ambience.TryGetValue(layerId, out var layer))
            {
                if (clip == null) return;
                var source = CreateSource("Ambience " + layerId, loop: true);
                layer = new AmbienceLayer { Source = source };
                _ambience.Add(layerId, layer);
            }

            if (clip != null && layer.Source.clip != clip)
            {
                layer.Source.clip = clip;
                layer.Level = 0f;
                // Random start offset so loops never sound identical between sessions.
                layer.Source.time = Random.Range(0f, Mathf.Max(0f, clip.length - 1f));
                layer.Source.Play();
            }

            var filter = layer.Source.GetComponent<AudioLowPassFilter>();
            if (lowPassCutoff < 21000f)
            {
                if (filter == null) filter = layer.Source.gameObject.AddComponent<AudioLowPassFilter>();
                filter.cutoffFrequency = lowPassCutoff;
                filter.enabled = true;
            }
            else if (filter != null)
            {
                filter.enabled = false;
            }

            layer.Target = Mathf.Clamp01(level);
            layer.FadeSpeed = fadeSeconds <= 0.01f ? 1000f : 1f / fadeSeconds;
        }

        private void Update()
        {
            float dt = Time.unscaledDeltaTime;

            _musicLevel = Mathf.MoveTowards(_musicLevel, _musicTarget, _musicFadeSpeed * dt);
            _musicSource.volume = _musicLevel * Volume(AudioCategory.Music);
            if (_musicLevel <= 0f && _musicTarget <= 0f && _musicSource.isPlaying) _musicSource.Pause();
            else if (_musicTarget > 0f && !_musicSource.isPlaying && _musicSource.clip != null) _musicSource.UnPause();

            float ambienceVolume = Volume(AudioCategory.Ambience);
            foreach (var layer in _ambience.Values)
            {
                layer.Level = Mathf.MoveTowards(layer.Level, layer.Target, layer.FadeSpeed * dt);
                layer.Source.volume = layer.Level * ambienceVolume;
            }
        }

    }
}

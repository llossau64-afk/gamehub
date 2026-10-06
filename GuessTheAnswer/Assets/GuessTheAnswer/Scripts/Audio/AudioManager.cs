using System.Collections;
using UnityEngine;

namespace GuessTheAnswer.Audio
{
    /// <summary>
    /// Central audio: two music sources that crossfade, a small pool of SFX sources, the volume settings,
    /// and muting while the browser tab is hidden or an ad plays.
    /// </summary>
    public sealed class AudioManager : MonoBehaviour
    {
        const int SfxVoices = 6;
        const float CrossfadeSeconds = 0.8f;

        static AudioManager instance;
        static bool adMuted;

        readonly AudioClip[] clips = new AudioClip[System.Enum.GetValues(typeof(Sfx)).Length];
        readonly float[] lastPlayed = new float[System.Enum.GetValues(typeof(Sfx)).Length];
        AudioClip menuMusic, gameMusic;

        AudioSource[] voices;
        int nextVoice;
        AudioSource musicA, musicB;
        bool aActive = true;
        MusicTrack currentTrack = MusicTrack.None;
        MusicTrack wantedTrack = MusicTrack.None;
        float fade = 1f;

        float master = 1f, music = 0.6f, sfx = 1f;
        bool muted;
        bool hidden;

        public bool IsReady { get; private set; }
        public bool Muted => muted;

        void Awake()
        {
            instance = this;
            voices = new AudioSource[SfxVoices];
            for (int i = 0; i < SfxVoices; i++) voices[i] = CreateSource("Sfx " + i, false);
            musicA = CreateSource("Music A", true);
            musicB = CreateSource("Music B", true);
        }

        AudioSource CreateSource(string name, bool loop)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var source = go.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = 0f;
            return source;
        }

        /// <summary>Generates every clip. Runs during the loading screen; progress goes from 0 to 1.</summary>
        public IEnumerator Prepare(System.Action<float> progress)
        {
            int count = clips.Length;
            for (int i = 0; i < count; i++)
            {
                clips[i] = SoundLibrary.Load((Sfx)i);
                if (i % 4 == 3)
                {
                    progress?.Invoke(0.4f * (i + 1) / count);
                    yield return null;
                }
            }
            yield return SoundLibrary.BuildMusic(MusicTrack.Menu, c => menuMusic = c);
            progress?.Invoke(0.7f);
            yield return SoundLibrary.BuildMusic(MusicTrack.Game, c => gameMusic = c);
            progress?.Invoke(1f);
            IsReady = true;
            if (wantedTrack != MusicTrack.None) PlayMusic(wantedTrack);
        }

        public void SetVolumes(float masterVolume, float musicVolume, float sfxVolume, bool mute)
        {
            master = masterVolume;
            music = musicVolume;
            sfx = sfxVolume;
            muted = mute;
            ApplyVolumes();
        }

        float EffectiveMaster => muted || hidden || adMuted ? 0f : master;

        void ApplyVolumes()
        {
            float m = EffectiveMaster * music;
            musicA.volume = m * (aActive ? fade : 1f - fade);
            musicB.volume = m * (aActive ? 1f - fade : fade);
        }

        public void Play(Sfx sound, float volume = 1f, float pitch = 1f)
        {
            if (!IsReady) return;
            int i = (int)sound;
            var clip = clips[i];
            if (clip == null) return;
            float vol = EffectiveMaster * sfx * volume;
            if (vol <= 0.001f) return;
            // The same sound twice in one frame (e.g. many buttons appearing) only plays once.
            if (Time.unscaledTime - lastPlayed[i] < 0.03f) return;
            lastPlayed[i] = Time.unscaledTime;

            var source = voices[nextVoice];
            nextVoice = (nextVoice + 1) % voices.Length;
            source.pitch = pitch;
            source.PlayOneShot(clip, vol);
        }

        public void PlayMusic(MusicTrack track)
        {
            wantedTrack = track;
            if (!IsReady || track == currentTrack) return;
            currentTrack = track;
            var next = aActive ? musicB : musicA;
            next.clip = track == MusicTrack.Menu ? menuMusic : track == MusicTrack.Game ? gameMusic : null;
            if (next.clip != null) next.Play();
            aActive = !aActive;
            fade = 0f;
        }

        void Update()
        {
            if (fade < 1f)
            {
                fade = Mathf.Min(1f, fade + Time.unscaledDeltaTime / CrossfadeSeconds);
                if (fade >= 1f)
                {
                    var old = aActive ? musicB : musicA;
                    old.Stop();
                }
            }
            ApplyVolumes();
        }

        /// <summary>Mute while the tab is in the background (browsers keep running a hidden tab's audio otherwise).</summary>
        public void SetHidden(bool isHidden)
        {
            hidden = isHidden;
            AudioListener.pause = isHidden || adMuted;
            ApplyVolumes();
        }

        public static void SetAdMute(bool mute)
        {
            adMuted = mute;
            AudioListener.pause = mute || (instance != null && instance.hidden);
            if (instance != null) instance.ApplyVolumes();
        }
    }
}

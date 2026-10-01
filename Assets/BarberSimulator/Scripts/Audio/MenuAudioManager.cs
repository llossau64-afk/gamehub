using System.Collections;
using UnityEngine;

namespace BarberSimulator.Audio
{
    /// <summary>
    /// The sound bed of the main menu: quiet shop ambience, a soft street behind the door and very subtle music, plus
    /// an occasional random one-shot (door bell, distant clippers, a murmur of voices) every 12-30 seconds.
    /// <see cref="Begin"/> / <see cref="End"/> are driven by the main menu's visibility; the loops themselves are
    /// the ones <see cref="AudioService"/> already owns, so nothing doubles up when gameplay takes over.
    /// </summary>
    public sealed class MenuAudioManager : MonoBehaviour
    {
        private const float MusicLevel = 0.3f;
        private const float ShopLevel = 0.42f;
        private const float StreetLevel = 0.2f;
        private const float StreetLowPass = 1400f;
        private const float MinInterval = 12f;
        private const float MaxInterval = 30f;
        private const int VoiceCount = 3;
        private const int MurmurVariants = 3;

        private sealed class Voice
        {
            public AudioSource Source;
            public AudioLowPassFilter Filter;
            public float Volume;
            public float Age;
            public float Duration;
            public bool Active;
        }

        private enum OneShotKind
        {
            DoorBell,
            DistantClippers,
            Murmur,
            ChairCreak,
            Scissors
        }

        private AudioService _audio;
        private readonly Voice[] _voices = new Voice[VoiceCount];
        private readonly AudioClip[] _murmurs = new AudioClip[MurmurVariants];
        private Coroutine _scheduler;
        private Coroutine _delayed;
        private OneShotKind _last = OneShotKind.Scissors;
        private bool _active;
        private float _savedMusic;
        private float _savedShop;
        private float _savedStreet;

        public bool IsActive => _active;

        public void Initialize(AudioService audio)
        {
            _audio = audio;
            for (int i = 0; i < VoiceCount; i++)
            {
                var go = new GameObject("Menu One-Shot " + i);
                go.transform.SetParent(transform, false);
                var source = go.AddComponent<AudioSource>();
                source.playOnAwake = false;
                source.loop = false;
                source.spatialBlend = 0f;
                var filter = go.AddComponent<AudioLowPassFilter>();
                filter.enabled = false;
                _voices[i] = new Voice { Source = source, Filter = filter };
            }
        }

        /// <summary>Menu came up: lower the loops to the menu mix and start the random one-shots.</summary>
        public void Begin()
        {
            if (_audio == null || _active) return;
            _active = true;
            var library = _audio.Library;
            if (library == null) return;

            _savedMusic = _audio.MusicTarget;
            _savedShop = _audio.AmbienceTarget("shop");
            _savedStreet = _audio.AmbienceTarget("street");

            _audio.PlayMusic(library.menuMusic, MusicLevel, 4f);
            _audio.SetAmbience("shop", library.shopAmbience, ShopLevel, 3f);
            _audio.SetAmbience("street", library.streetAmbience, StreetLevel, 3f, StreetLowPass);

            if (_scheduler != null) StopCoroutine(_scheduler);
            _scheduler = StartCoroutine(Schedule());
        }

        /// <summary>Menu left: stop the one-shots and hand the loops back to the levels they had before <see cref="Begin"/>.</summary>
        public void End(float fadeSeconds)
        {
            if (!_active) return;
            _active = false;
            if (_scheduler != null) StopCoroutine(_scheduler);
            if (_delayed != null) StopCoroutine(_delayed);
            _scheduler = _delayed = null;

            foreach (var voice in _voices)
                if (voice != null && voice.Active) voice.Duration = Mathf.Min(voice.Duration, voice.Age + Mathf.Max(0.05f, fadeSeconds));

            var library = _audio != null ? _audio.Library : null;
            if (library == null) return;
            _audio.FadeMusic(_savedMusic, fadeSeconds);
            _audio.SetAmbience("shop", null, _savedShop, fadeSeconds);
            _audio.SetAmbience("street", null, _savedStreet, fadeSeconds, StreetLowPass);
        }

        private IEnumerator Schedule()
        {
            // The first sound comes a little earlier so a short visit to the menu is not silent.
            yield return UIAnimation.Wait(Random.Range(5f, 9f));
            while (_active)
            {
                Play(PickKind());
                yield return UIAnimation.Wait(Random.Range(MinInterval, MaxInterval));
            }
        }

        private OneShotKind PickKind()
        {
            var kinds = (OneShotKind[])System.Enum.GetValues(typeof(OneShotKind));
            OneShotKind kind;
            // Never the same kind twice in a row.
            do { kind = kinds[Random.Range(0, kinds.Length)]; } while (kind == _last);
            _last = kind;
            return kind;
        }

        private void Play(OneShotKind kind)
        {
            var library = _audio.Library;
            if (library == null) return;
            float pan = Random.Range(-0.7f, 0.7f);
            switch (kind)
            {
                case OneShotKind.DoorBell:
                    StartVoice(library.doorOpen, 0.16f, 0.95f, pan, 3200f, 0f);
                    _delayed = StartCoroutine(Later(0.18f, () => StartVoice(library.uiToast, 0.13f, 1.35f, pan, 0f, 0f)));
                    break;
                case OneShotKind.DistantClippers:
                    // Muffled as if from the next room; only the first moments of the loop.
                    StartVoice(library.clipperLoop != null ? library.clipperLoop : library.clipperBuzz, 0.1f, 1f, pan, 800f, Random.Range(1.4f, 2.8f));
                    break;
                case OneShotKind.Murmur:
                    StartVoice(_murmurs[Random.Range(0, MurmurVariants)], 0.2f, 1f, pan, 0f, 0f);
                    break;
                case OneShotKind.ChairCreak:
                    StartVoice(library.chairCreak, 0.11f, 1f, pan, 1800f, 0f);
                    break;
                default:
                    if (library.scissorSnips != null && library.scissorSnips.Length > 0)
                        StartVoice(library.scissorSnips[Random.Range(0, library.scissorSnips.Length)], 0.1f, 1f, pan, 1500f, 0f);
                    break;
            }
        }

        private IEnumerator Later(float seconds, System.Action action)
        {
            yield return UIAnimation.Wait(seconds);
            if (_active) action();
        }

        private void StartVoice(AudioClip clip, float volume, float pitch, float pan, float lowPass, float maxDuration)
        {
            if (clip == null) return;
            Voice voice = null;
            foreach (var candidate in _voices)
                if (!candidate.Active) { voice = candidate; break; }
            if (voice == null) return;

            var source = voice.Source;
            source.clip = clip;
            source.pitch = pitch * (1f + Random.Range(-0.05f, 0.05f));
            source.panStereo = pan;
            source.volume = 0f;
            voice.Filter.enabled = lowPass > 0f;
            if (lowPass > 0f) voice.Filter.cutoffFrequency = lowPass;
            voice.Volume = volume * Random.Range(0.8f, 1.1f);
            voice.Age = 0f;
            float natural = clip.length / Mathf.Max(0.1f, source.pitch);
            voice.Duration = maxDuration > 0f ? Mathf.Min(maxDuration, natural) : natural;
            voice.Active = true;
            source.Play();
        }

        private void Update()
        {
            float level = _audio != null ? _audio.CategoryVolume(AudioCategory.Ambience) : 1f;
            float dt = Time.unscaledDeltaTime;
            foreach (var voice in _voices)
            {
                if (voice == null || !voice.Active) continue;
                voice.Age += dt;
                if (voice.Age >= voice.Duration)
                {
                    voice.Source.Stop();
                    voice.Active = false;
                    continue;
                }
                // Soft attack and release so a cut-short clip never clicks.
                float fade = Mathf.Min(0.25f, voice.Duration * 0.4f);
                float envelope = Mathf.Clamp01(Mathf.Min(voice.Age / fade, (voice.Duration - voice.Age) / fade));
                voice.Source.volume = voice.Volume * envelope * level;
            }
        }

        // ---------------------------------------------------------------- generated murmur

        private void Awake()
        {
            // The clips are tiny (about 2.5 s of mono audio each), so they are built once instead of shipping as assets.
            for (int i = 0; i < MurmurVariants; i++) _murmurs[i] = MakeMurmur(i + 1);
        }

        /// <summary>
        /// Indistinct conversation: noise shaped by two vowel-like resonances and a syllable-rate envelope. Each
        /// variant uses another seed, so the voices never repeat exactly.
        /// </summary>
        private static AudioClip MakeMurmur(int seed)
        {
            const int rate = 22050;
            float seconds = 2.2f + seed * 0.3f;
            int count = Mathf.RoundToInt(rate * seconds);
            var data = new float[count];
            var rng = new System.Random(9137 + seed * 31);

            // Two simple resonators (band-pass by feedback) at vowel-ish formants, retuned a few times per second.
            float f1 = 450f, f2 = 1400f;
            float y1a = 0f, y1b = 0f, y2a = 0f, y2b = 0f;
            float syllable = 0f;
            float nextSyllable = 0f;
            float pitchLfo = 0f;
            for (int i = 0; i < count; i++)
            {
                float t = (float)i / rate;
                if (t >= nextSyllable)
                {
                    // A new syllable every 130-260 ms, with a short gap between words now and then.
                    syllable = rng.NextDouble() < 0.18 ? 0f : 0.45f + (float)rng.NextDouble() * 0.55f;
                    nextSyllable = t + 0.13f + (float)rng.NextDouble() * 0.13f;
                    f1 = 350f + (float)rng.NextDouble() * 350f;
                    f2 = 900f + (float)rng.NextDouble() * 1200f;
                }
                pitchLfo += 1f / rate;
                float noise = ((float)rng.NextDouble() * 2f - 1f) * (0.6f + 0.4f * Mathf.Sin(pitchLfo * 2f * Mathf.PI * (95f + seed * 17f)));

                float w1 = 2f * Mathf.PI * f1 / rate, w2 = 2f * Mathf.PI * f2 / rate;
                float r = 0.985f;
                float y1 = noise * 0.05f + 2f * r * Mathf.Cos(w1) * y1a - r * r * y1b;
                float y2 = noise * 0.05f + 2f * r * Mathf.Cos(w2) * y2a - r * r * y2b;
                y1b = y1a; y1a = y1;
                y2b = y2a; y2a = y2;

                // Phrase envelope fades the whole thing in and out.
                float phrase = Mathf.Clamp01(Mathf.Min(t / 0.35f, (seconds - t) / 0.5f));
                data[i] = (y1 * 0.7f + y2 * 0.4f) * syllable * phrase;
            }

            float peak = 0.0001f;
            for (int i = 0; i < count; i++) peak = Mathf.Max(peak, Mathf.Abs(data[i]));
            for (int i = 0; i < count; i++) data[i] = data[i] / peak * 0.6f;

            var clip = AudioClip.Create("Menu Murmur " + seed, count, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}

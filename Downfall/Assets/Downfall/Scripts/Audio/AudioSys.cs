// All sound is synthesised, as in the browser build: engines (per-car cylinder count, tone,
// roughness, turbo, pops), tyres, surfaces, impacts, ambience and generative music.
// The WebAudio graph becomes a small mixer that runs in OnAudioFilterRead.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Downfall.Audio
{
    public abstract class Loop
    {
        public volatile bool dead;
        public abstract void Render(Mix m);
    }

    [RequireComponent(typeof(AudioSource))]
    public sealed class AudioSys : MonoBehaviour
    {
        public static AudioSys A;

        public float master = 0.8f, music = 0.5f, sfx = 0.8f;
        public bool muted;
        public Ambience ambience;
        public Music musicGen;

        int sr;
        bool ready;
        readonly ConcurrentQueue<Voice> incoming = new ConcurrentQueue<Voice>();
        readonly ConcurrentQueue<Loop> incomingLoops = new ConcurrentQueue<Loop>();
        readonly List<Voice> voices = new List<Voice>();
        readonly List<Loop> loops = new List<Loop>();
        readonly Mix mix = new Mix();
        Smooth gMaster, gMusic, gSfx, gRev, gMusicOut;
        Reverb reverb;
        Compressor comp;
        float[] dline; int dpos; Biquad dlp;

        public float SampleRate => sr;
        public bool Ready() => ready;

        public static AudioSys Create()
        {
            if (A) return A;
            var go = new GameObject("Audio");
            DontDestroyOnLoad(go);
            var src = go.AddComponent<AudioSource>();
            src.playOnAwake = false; src.spatialBlend = 0; src.loop = true;
            return go.AddComponent<AudioSys>();
        }

        void Awake()
        {
            A = this;
            sr = AudioSettings.outputSampleRate;
            if (sr <= 0) sr = 48000;
            NoiseBufs.Build(sr, 7);
            reverb = new Reverb(sr);
            comp = new Compressor(sr);
            dline = new float[(int)(sr * 0.42f)];
            dlp.Set(FilterType.Lowpass, 1800, 1, sr);
            gMaster = new Smooth(0, 0.05f); gMusic = new Smooth(0, 0.05f); gSfx = new Smooth(0, 0.05f); gRev = new Smooth(0, 0.3f); gMusicOut = new Smooth(0, 1.2f);
            ApplyVolumes();
            ambience = new Ambience(this);
            musicGen = new Music(this);
            AddLoop(ambience);
            ready = true;
            GetComponent<AudioSource>().Play();
        }

        void OnDestroy() { if (A == this) A = null; }

        public void SetVolumes(float master, float music, float sfx) { this.master = master; this.music = music; this.sfx = sfx; ApplyVolumes(); }
        public void ApplyVolumes()
        {
            gMaster.target = muted ? 0 : master;
            gMusic.target = music * 0.55f;
            gSfx.target = sfx;
        }
        public void SetMuted(bool m) { muted = m; ApplyVolumes(); }
        public void SetReverb(float v) { gRev.target = v; }
        internal void SetMusicOut(float v) { gMusicOut.target = v; }

        public void Play(Voice v, float delay = 0)
        {
            if (!ready) return;
            v.delay += (int)(delay * sr);
            incoming.Enqueue(v);
        }
        public void AddLoop(Loop l) { incomingLoops.Enqueue(l); }

        void OnAudioFilterRead(float[] data, int channels)
        {
            if (!ready) return;
            int n = data.Length / channels;
            mix.sr = sr;
            mix.Prepare(n);
            while (incoming.TryDequeue(out var v)) voices.Add(v);
            while (incomingLoops.TryDequeue(out var l)) loops.Add(l);
            try
            {
                musicGen.Schedule(n);
                for (int i = voices.Count - 1; i >= 0; i--) if (!voices[i].Render(mix)) voices.RemoveAt(i);
                for (int i = loops.Count - 1; i >= 0; i--) { if (loops[i].dead) { loops.RemoveAt(i); continue; } loops[i].Render(mix); }
            }
            catch (Exception) { /* never take the audio thread down */ }

            for (int i = 0; i < n; i++)
            {
                // music: instruments + feedback delay, faded by mode, into the music bus
                float d = dline[dpos];
                float fb = dlp.Run(d);
                dline[dpos] = mix.echo[i] + fb * 0.35f;
                dpos = dpos + 1 == dline.Length ? 0 : dpos + 1;
                float mOut = (mix.musicPre[i] + fb) * gMusicOut.Step(sr);
                float rev = reverb.Run(mix.eng[i] * gRev.Step(sr));
                float s = (mix.sfx[i] + mix.amb[i] + mix.eng[i] + rev) * gSfx.Step(sr) + (mix.music[i] + mOut) * gMusic.Step(sr);
                s *= gMaster.Step(sr);
                s *= comp.Gain(s);
                if (s > 1) s = 1; else if (s < -1) s = -1;
                for (int c = 0; c < channels; c++) data[i * channels + c] = s;
            }
        }

        // ------------------------------------------------------------- one shots
        public static float[] Buf(string kind) => kind == "pink" ? NoiseBufs.Pink : kind == "brown" ? NoiseBufs.Brown : NoiseBufs.White;

        public void Burst(float freq = 1000, float q = 1, FilterType type = FilterType.Bandpass, float dur = 0.2f, float gain = 0.5f, float[] buf = null,
            float attack = 0.002f, Bus bus = Bus.Sfx, float delay = 0, float rate = 1, float freqEnd = 0, float rampT = 0)
        {
            if (!ready) return;
            Play(new NoiseVoice(buf ?? NoiseBufs.White, freq, q, type, dur, gain, attack, rate, Random.value * 0.75f, freqEnd, rampT) { bus = bus }, delay);
        }

        public void Tone(float freq = 440, Wave type = Wave.Sine, float dur = 0.2f, float gain = 0.3f, float attack = 0.005f, float slide = 0, Bus bus = Bus.Sfx, float delay = 0, float detune = 0)
        {
            if (!ready) return;
            Play(new ToneVoice(freq, type, dur, gain, attack, slide, detune) { bus = bus }, delay);
        }

        // metallic ring: a few inharmonic resonators excited by noise
        public void Metal(float intensity = 0.5f, float baseF = 220)
        {
            float k = Mathf.Clamp01(intensity);
            Burst(freq: 180 + Random.value * 80, q: 0.7f, type: FilterType.Lowpass, dur: 0.15f + k * 0.25f, gain: 0.5f + k * 0.6f, buf: NoiseBufs.Brown);
            Burst(freq: 1400 + Random.value * 800, q: 1.2f, dur: 0.08f + k * 0.15f, gain: 0.25f + k * 0.4f);
            foreach (var m in new[] { 1f, 2.76f, 5.4f }) Burst(freq: baseF * m * (0.9f + Random.value * 0.2f), q: 30, dur: 0.3f + k * 0.6f, gain: 0.15f * k, attack: 0.001f);
        }
        public void Impact(float speed, string kind)
        {
            float k = Mathf.Clamp01((speed - 2) / 16);
            if (kind == "ground" && speed < 6) { Thump(k); return; }
            Metal(k, kind == "rail" ? 340 : kind == "object" ? 160 : 260);
            if (k > 0.5f) Burst(freq: 90, q: 0.5f, type: FilterType.Lowpass, dur: 0.5f, gain: 0.8f * k, buf: NoiseBufs.Brown);
        }
        public void Thump(float k = 0.5f)
        {
            Tone(freq: 90, type: Wave.Sine, dur: 0.18f, gain: 0.25f + k * 0.4f, slide: 0.5f);
            Burst(freq: 300, type: FilterType.Lowpass, dur: 0.08f, gain: 0.15f + k * 0.2f, buf: NoiseBufs.Brown);
        }
        public void Glass()
        {
            Burst(freq: 4500, q: 2, dur: 0.25f, gain: 0.35f, type: FilterType.Highpass);
            for (int i = 0; i < 9; i++) Tone(freq: 2500 + Random.value * 4000, type: Wave.Triangle, dur: 0.06f + Random.value * 0.1f, gain: 0.05f, delay: 0.02f + Random.value * 0.35f);
        }
        public void Splash(float k = 1) { Burst(freq: 900, q: 0.6f, dur: 0.35f, gain: 0.3f * k, type: FilterType.Bandpass, buf: NoiseBufs.Pink); }
        public void Shift() { Burst(freq: 220, q: 2, dur: 0.05f, gain: 0.12f, type: FilterType.Bandpass, buf: NoiseBufs.Brown); }
        public void Pickup(string type)
        {
            if (type == "cash" || type == "crate")
            {
                Tone(freq: 1318, type: Wave.Triangle, dur: 0.18f, gain: 0.12f); Tone(freq: 1976, type: Wave.Triangle, dur: 0.3f, gain: 0.1f, delay: 0.07f);
                Burst(freq: 6000, q: 1, dur: 0.12f, gain: 0.08f, type: FilterType.Highpass, delay: 0.02f);
            }
            else if (type == "fuel")
            {
                for (int i = 0; i < 4; i++) Tone(freq: 160 + i * 25, type: Wave.Sine, dur: 0.09f, gain: 0.18f, slide: 1.6f, delay: i * 0.08f);
                Metal(0.15f, 500);
            }
            else if (type == "repair" || type == "repairL") { Ratchet(type == "repairL" ? 10 : 6, 0); Tone(freq: 880, type: Wave.Triangle, dur: 0.25f, gain: 0.08f, delay: 0.4f); }
            else if (type == "rare")
            {
                float[] fs = { 784, 988, 1175, 1568 };
                for (int i = 0; i < fs.Length; i++) Tone(freq: fs[i], type: Wave.Triangle, dur: 0.4f, gain: 0.08f, delay: i * 0.07f);
                Metal(0.2f, 700);
            }
        }
        public void Ratchet(int n = 8, float delay = 0, float rate = 0.045f)
        {
            for (int i = 0; i < n; i++) Burst(freq: 3200, q: 4, dur: 0.018f, gain: 0.25f, delay: delay + i * rate, type: FilterType.Bandpass);
        }
        public void ImpactWrench(float dur = 0.7f, float delay = 0)
        {
            Play(new WrenchVoice(dur), delay);
            Burst(freq: 2500, q: 3, dur: dur, gain: 0.08f, delay: delay, type: FilterType.Bandpass);
        }
        public void GarageDoor(float dur = 2.4f)
        {
            Burst(freq: 260, q: 0.8f, dur: dur, gain: 0.35f, type: FilterType.Lowpass, buf: NoiseBufs.Brown, attack: 0.3f);
            for (int i = 0; i < 16; i++) Metal(0.12f, 300 + Random.value * 200 + i);
        }
        public void Ui(string kind = "click")
        {
            if (kind == "hover") Tone(freq: 2200, type: Wave.Sine, dur: 0.025f, gain: 0.025f);
            else if (kind == "buy") { Tone(freq: 660, type: Wave.Triangle, dur: 0.1f, gain: 0.1f); Tone(freq: 990, type: Wave.Triangle, dur: 0.2f, gain: 0.08f, delay: 0.08f); }
            else if (kind == "deny") Tone(freq: 160, type: Wave.Square, dur: 0.12f, gain: 0.05f);
            else if (kind == "back") Tone(freq: 700, type: Wave.Sine, dur: 0.05f, gain: 0.05f, slide: 0.6f);
            else { Tone(freq: 1200, type: Wave.Sine, dur: 0.03f, gain: 0.06f); Burst(freq: 3000, q: 2, dur: 0.02f, gain: 0.05f); }
        }
        public void Countdown(bool go) { Tone(freq: go ? 1046 : 523, type: Wave.Triangle, dur: go ? 0.5f : 0.18f, gain: 0.16f); }
        // camera cut / transition: a short filtered-noise sweep
        public void Whoosh(float k = 0.5f) { Burst(freq: 500, q: 1.4f, type: FilterType.Bandpass, dur: 0.5f, gain: 0.22f * k, buf: NoiseBufs.Pink, attack: 0.12f, freqEnd: 3200, rampT: 0.5f); }
        // grandstand crowd: a swelling roar with scattered claps
        public void Cheer(float k = 1)
        {
            Burst(freq: 900, q: 0.6f, type: FilterType.Bandpass, dur: 3.2f, gain: 0.16f * k, buf: NoiseBufs.Pink, attack: 0.5f);
            Burst(freq: 2400, q: 0.8f, type: FilterType.Bandpass, dur: 2.6f, gain: 0.07f * k, buf: NoiseBufs.White, attack: 0.6f);
            for (int i = 0; i < 26; i++) Burst(freq: 1600 + Random.value * 1800, q: 2, dur: 0.05f, gain: 0.05f * k, delay: 0.2f + Random.value * 2.6f);
        }
        // podium fanfare: a short brassy major arpeggio
        public void Fanfare()
        {
            float[,] notes = { { 392, 0 }, { 523, 0.16f }, { 659, 0.32f }, { 784, 0.48f }, { 1046, 0.72f } };
            for (int i = 0; i < 5; i++)
            {
                float f = notes[i, 0], d = notes[i, 1], dur = i == 4 ? 1.1f : 0.22f;
                Tone(freq: f, type: Wave.Saw, dur: dur, gain: 0.05f, delay: d, bus: Bus.Music, attack: 0.02f);
                Tone(freq: f * 1.005f, type: Wave.Square, dur: dur, gain: 0.025f, delay: d, bus: Bus.Music, attack: 0.02f);
            }
        }
        public void Record() { float[] fs = { 523, 659, 784, 1046 }; for (int i = 0; i < 4; i++) Tone(freq: fs[i], type: Wave.Triangle, dur: 0.5f, gain: 0.07f, delay: i * 0.09f, bus: Bus.Music); }
        public void Thunder(float power = 1)
        {
            Burst(freq: 120, q: 0.4f, type: FilterType.Lowpass, dur: 2.5f + power * 2, gain: 0.5f * power, buf: NoiseBufs.Brown, attack: 0.05f);
            Burst(freq: 400, q: 0.3f, type: FilterType.Lowpass, dur: 0.4f, gain: 0.3f * power, buf: NoiseBufs.Pink, delay: 0.05f);
        }
        public void Starter(float delay = 0) // crank, crank, catch
        {
            for (int i = 0; i < 5; i++) { Tone(freq: 55, type: Wave.Saw, dur: 0.12f, gain: 0.12f, delay: delay + i * 0.16f); Burst(freq: 900, q: 2, dur: 0.1f, gain: 0.05f, delay: delay + i * 0.16f); }
        }
    }
}

// Continuous voices: the engine, the tyres/road/wind bed, ambience and the music sequencer.
// Main-thread code sets targets (like setTargetAtTime); the audio thread follows them.
using System;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Downfall.Audio
{
    // The per-car sound description (car.sound in the browser build).
    public sealed class EngineSound
    {
        public int cyl = 4;
        public string tone = "";
        public float rough, @base = 1, exhaust = 1, pops;
        public bool blower;
    }

    public sealed class EngineVoice : Loop
    {
        readonly AudioSys sys;
        readonly EngineSound sp;
        readonly int cyl;
        readonly float[] wave, shaper;
        Osc osc, osc2, sub, lfo, tw;
        NoiseReader noise;
        Biquad lp, hp, nf;
        Smooth fOsc, fLfo, fLp, fNf, gN, fTw, gTw, gOut, gLfo;
        readonly float mixS;
        bool on;
        float popT;
        int k;

        public EngineVoice(AudioSys sys, EngineSound sp)
        {
            this.sys = sys; this.sp = sp; cyl = sp.cyl;
            // harmonic exhaust note
            const int harm = 24;
            var imag = new float[harm];
            for (int n = 1; n < harm; n++)
            {
                double a = 1 / Math.Pow(n, sp.tone == "smooth" || sp.tone == "v12" ? 1.25 : sp.tone == "scream" || sp.tone == "v10" ? 0.85 : 1.0);
                if (sp.tone == "boxy" && n % 2 == 0) a *= 0.4;
                if (sp.tone == "diesel" && n > 4) a *= 1.3;
                if (sp.tone == "flat6" && n % 3 == 0) a *= 1.6;
                imag[n] = (float)(a * (n % 2 == 1 ? 1 : 0.7));
            }
            wave = new float[2048];
            float peak = 0;
            for (int i = 0; i < wave.Length; i++)
            {
                double ph = i / (double)wave.Length * Math.PI * 2, v = 0;
                for (int n = 1; n < harm; n++) v += imag[n] * Math.Sin(ph * n);
                wave[i] = (float)v; peak = Math.Max(peak, Math.Abs((float)v));
            }
            for (int i = 0; i < wave.Length; i++) wave[i] /= peak; // PeriodicWave normalises
            float kk = sp.tone == "diesel" ? 3.5f : sp.tone == "v8" ? 2.6f : 1.8f;
            shaper = new float[1024];
            for (int i = 0; i < shaper.Length; i++) { double x = i / 1023.0 * 2 - 1; shaper[i] = (float)(Math.Tanh(x * kk) / Math.Tanh(kk)); }
            mixS = 0.2f + sp.rough * 0.35f;
            noise = new NoiseReader(NoiseBufs.Pink, Random.value * 0.5f);
            fOsc = new Smooth(30, 0.02f); fLfo = new Smooth(15, 0.02f); fLp = new Smooth(400, 0.03f); fNf = new Smooth(500, 0.05f);
            gN = new Smooth(0, 0.05f); fTw = new Smooth(1800, 0.05f); gTw = new Smooth(0, 0.08f); gOut = new Smooth(0, 0.03f); gLfo = new Smooth(sp.rough * 0.45f, 0.1f);
            hp.Set(FilterType.Highpass, 35, 1, sys.SampleRate);
            sys.AddLoop(this);
        }

        public void SetRunning(bool on) { this.on = on; }

        // rpm, redline, throttle 0..1, boost 0..1; returns true when it popped
        public bool Update(float dt, float rpm, float redline, float throttle, float boost, float limiter, float engineHealth, float vol = 1)
        {
            float f = Mathf.Max(8, (rpm / 60) * (cyl / 2f) * 0.62f * sp.@base);
            float r = Mathf.Clamp(rpm / redline, 0, 1.2f);
            fOsc.target = f;
            fLfo.target = f / (cyl >= 8 ? 4 : 2);
            float bright = 280 + r * r * 2600 * (0.45f + throttle * 0.55f) + (sp.tone == "scream" || sp.tone == "v10" ? 1200 * r : 0);
            fLp.target = bright * (0.6f + engineHealth * 0.4f);
            fNf.target = 500 + r * 2400;
            gN.target = (0.02f + throttle * 0.09f * r) * sp.exhaust * (2 - engineHealth);
            fTw.target = 1800 + boost * 5200 + (sp.blower ? r * 3000 : 0);
            gTw.target = boost * 0.025f + (sp.blower ? r * 0.02f : 0);
            float g = on ? (0.18f + throttle * 0.16f + r * 0.12f) * sp.exhaust * vol : 0;
            if (limiter > 0) g *= 0.55f + Random.value * 0.3f;
            if (engineHealth < 0.3f && on && Random.value < dt * 4) g *= 0.3f;
            gOut.To(g, on ? 0.03f : 0.25f);
            gLfo.target = sp.rough * (0.35f + (1 - r) * 0.4f) + (1 - engineHealth) * 0.4f;
            // pops on lift-off at high rpm
            popT -= dt;
            if (sp.pops > 0 && on && throttle < 0.1f && r > 0.55f && popT <= 0 && Random.value < dt * 9 * sp.pops)
            {
                popT = 0.05f + Random.value * 0.12f;
                sys.Burst(freq: 700 + Random.value * 900, q: 0.8f, type: FilterType.Lowpass, dur: 0.06f, gain: 0.35f * sp.pops, buf: NoiseBufs.Brown, bus: Bus.Eng);
                return true;
            }
            return false;
        }

        public void Blowoff(float a = 1) { sys.Burst(freq: 3500, q: 0.7f, type: FilterType.Highpass, dur: 0.35f, gain: 0.12f * a, attack: 0.01f, bus: Bus.Eng); }

        public void Dispose() { gOut.To(0, 0.05f); disposing = true; }
        volatile bool disposing;
        float disposeT;

        float Shape(float x)
        {
            if (x <= -1) return shaper[0];
            if (x >= 1) return shaper[1023];
            float p = (x + 1) * 0.5f * 1023; int i = (int)p; float fr = p - i;
            return i >= 1023 ? shaper[1023] : shaper[i] + (shaper[i + 1] - shaper[i]) * fr;
        }

        public override void Render(Mix m)
        {
            float sr = m.sr;
            var o = m.eng;
            float det = Mathf.Pow(2, 9 / 1200f);
            for (int i = 0; i < m.n; i++)
            {
                float f = fOsc.Step(sr), lf = fLfo.Step(sr);
                if ((k++ & 15) == 0)
                {
                    lp.Set(FilterType.Lowpass, fLp.v, 2.5f, sr);
                    nf.Set(FilterType.Bandpass, fNf.v, 1.2f, sr);
                }
                fLp.Step(sr); fNf.Step(sr);
                float x = (osc.Table(wave, f, sr) + osc2.Table(wave, f * 1.003f * det, sr)) * 0.32f + sub.Next(Wave.Triangle, f * 0.5f, sr) * mixS;
                float y = Shape(x) * (1 + lfo.Next(Wave.Sine, lf, sr) * gLfo.Step(sr));
                y = hp.Run(lp.Run(y));
                y += nf.Run(noise.Next()) * gN.Step(sr);
                y += tw.Next(Wave.Sine, fTw.Step(sr), sr) * gTw.Step(sr);
                o[i] += y * gOut.Step(sr);
            }
            if (disposing) { disposeT += m.n / sr; if (disposeT > 0.4f) dead = true; }
        }
    }

    // tyres, gravel, squeal, wind, scrape and splash: filtered noise beds
    public sealed class RoadVoice : Loop
    {
        struct Bed { public NoiseReader s; public Biquad f; public FilterType type; public Smooth fr, g; public float q; }
        Bed roll, gravel, squeal, wind, scrape, splash;
        Osc gate, sqLfo;
        Smooth gateF, gateG;
        int k;

        static Bed Mk(float[] buf, FilterType t, float freq, float q) => new Bed { s = new NoiseReader(buf, Random.value * 0.5f), type = t, fr = new Smooth(freq, 0.1f), g = new Smooth(0, 0.1f), q = q };

        public RoadVoice(AudioSys sys)
        {
            roll = Mk(NoiseBufs.Brown, FilterType.Lowpass, 400, 0.7f);
            gravel = Mk(NoiseBufs.White, FilterType.Bandpass, 2200, 0.9f);
            squeal = Mk(NoiseBufs.White, FilterType.Bandpass, 1500, 9);
            wind = Mk(NoiseBufs.Pink, FilterType.Bandpass, 600, 0.6f);
            scrape = Mk(NoiseBufs.White, FilterType.Bandpass, 3000, 3);
            splash = Mk(NoiseBufs.Pink, FilterType.Bandpass, 900, 0.8f);
            gateF = new Smooth(31, 0.02f); gateG = new Smooth(0, 0.08f);
            sys.AddLoop(this);
        }

        // surf: rough, group (0 paved, 1 loose, 2 mud…), snow
        public void Update(float speed, float slipPaved, float slipLoose, float rough, int group, bool snow, float scrapeV, float inWater, float vol = 1)
        {
            float v = Mathf.Clamp(speed / 40, 0, 1.5f);
            float loose = group > 0 ? 1 : 0;
            roll.g.To((0.05f + v * 0.22f) * vol * (1 + rough), 0.1f);
            roll.fr.To(220 + v * 500 + rough * 600, 0.1f);
            float gr = loose * Mathf.Clamp01(speed / 12) * (snow ? 0.4f : 1);
            gravel.g.To(gr * 0.12f * vol, 0.08f);
            gateG.To(gr * 0.08f * vol, 0.08f);
            gateF.To(18 + speed * 1.6f + Random.value * 10, 0.02f);
            gravel.fr.To(snow ? 4200 : group == 2 ? 500 : 2200, 0.1f);
            squeal.g.To(Mathf.Clamp01(slipPaved) * 0.16f * vol, 0.04f);
            squeal.fr.To(1200 + Mathf.Clamp01(slipPaved) * 600, 0.1f);
            wind.g.To(Mathf.Clamp(v * v * 0.35f, 0, 0.5f) * vol, 0.2f);
            wind.fr.To(400 + v * 900, 0.2f);
            scrape.g.To(scrapeV * 0.22f * vol, 0.03f);
            splash.g.To(inWater * Mathf.Clamp01(speed / 10) * 0.25f * vol, 0.05f);
        }

        public void Stop()
        {
            roll.g.To(0, 0.1f); gravel.g.To(0, 0.1f); squeal.g.To(0, 0.1f); wind.g.To(0, 0.1f); scrape.g.To(0, 0.1f); splash.g.To(0, 0.1f); gateG.To(0, 0.1f);
        }

        static float Run(ref Bed b, float sr, bool refresh, float extraF = 0)
        {
            float f = b.fr.Step(sr);
            if (refresh) b.f.Set(b.type, f + extraF, b.q, sr);
            return b.f.Run(b.s.Next());
        }

        public override void Render(Mix m)
        {
            float sr = m.sr;
            var o = m.sfx;
            for (int i = 0; i < m.n; i++)
            {
                bool rf = (k++ & 15) == 0;
                float y = Run(ref roll, sr, rf) * roll.g.Step(sr);
                float gg = gravel.g.Step(sr) + gate.Next(Wave.Square, gateF.Step(sr), sr) * gateG.Step(sr);
                y += Run(ref gravel, sr, rf) * gg;
                y += Run(ref squeal, sr, rf, sqLfo.Next(Wave.Sine, 7, sr) * 60) * squeal.g.Step(sr);
                y += Run(ref wind, sr, rf) * wind.g.Step(sr);
                y += Run(ref scrape, sr, rf) * scrape.g.Step(sr);
                y += Run(ref splash, sr, rf) * splash.g.Step(sr);
                o[i] += y;
            }
        }
    }

    public sealed class Ambience : Loop
    {
        struct Bed { public NoiseReader s; public Biquad f; public FilterType type; public float q; public Smooth fr, g; }
        Bed wind, leaves, water, rain, room;
        readonly AudioSys sys;
        float birdT = 2, t;
        int k;
        static Bed Mk(float[] buf, FilterType t, float freq, float q) => new Bed { s = new NoiseReader(buf, Random.value * 0.5f), type = t, q = q, fr = new Smooth(freq, 0.5f), g = new Smooth(0, 0.5f) };

        public Ambience(AudioSys sys)
        {
            this.sys = sys;
            wind = Mk(NoiseBufs.Pink, FilterType.Bandpass, 380, 0.5f);
            leaves = Mk(NoiseBufs.White, FilterType.Highpass, 5000, 0.5f);
            water = Mk(NoiseBufs.Pink, FilterType.Lowpass, 1100, 0.6f);
            rain = Mk(NoiseBufs.White, FilterType.Highpass, 2500, 0.4f);
            room = Mk(NoiseBufs.Brown, FilterType.Lowpass, 160, 0.5f);
        }

        public void Update(float dt, float pWind = 0, float pBirds = 0, float pTrees = 0, float pWater = 0, float pRain = 0, float pRoom = 0)
        {
            t += dt;
            float gust = 0.6f + 0.4f * Mathf.Sin(t * 0.37f) * Mathf.Sin(t * 0.11f + 1);
            wind.g.target = pWind * 0.16f * gust;
            wind.fr.target = 280 + gust * 260;
            leaves.g.target = pTrees * pWind * 0.025f * gust;
            water.g.target = pWater * 0.3f;
            rain.g.target = pRain * 0.12f;
            room.g.target = pRoom * 0.2f;
            birdT -= dt;
            if (birdT < 0 && pBirds > 0.2f)
            {
                birdT = 1.5f + Random.value * 5 / pBirds;
                Chirp();
            }
        }

        void Chirp()
        {
            float b = 2600 + Random.value * 2200; int n = 2 + Mathf.FloorToInt(Random.value * 4);
            float d = 0;
            for (int i = 0; i < n; i++)
            {
                sys.Tone(freq: b * (0.9f + Random.value * 0.25f), type: Wave.Sine, dur: 0.06f + Random.value * 0.06f, gain: 0.025f, slide: 0.7f + Random.value * 0.7f, delay: d, bus: Bus.Amb);
                d += 0.09f + Random.value * 0.05f;
            }
        }

        static float Run(ref Bed b, float sr, bool refresh)
        {
            float f = b.fr.Step(sr);
            if (refresh) b.f.Set(b.type, f, b.q, sr);
            return b.f.Run(b.s.Next()) * b.g.Step(sr);
        }

        public override void Render(Mix m)
        {
            float sr = m.sr;
            for (int i = 0; i < m.n; i++)
            {
                bool rf = (k++ & 31) == 0;
                m.amb[i] += Run(ref wind, sr, rf) + Run(ref leaves, sr, rf) + Run(ref water, sr, rf) + Run(ref rain, sr, rf) + Run(ref room, sr, rf);
            }
        }
    }

    // Sparse, generative: a slow pad + plucked figure for menus, a low beat in the garage,
    // and a quiet tension layer while driving that swells with speed and danger.
    public sealed class Music
    {
        static readonly int[] SCALE = { 0, 2, 3, 5, 7, 8, 10 }; // aeolian
        static readonly int[][] CHORDS = { new[] { 0, 3, 7 }, new[] { -4, 0, 3 }, new[] { -2, 2, 5 }, new[] { -5, -1, 2 } };
        readonly AudioSys sys;
        volatile string mode = "off";
        public volatile float intensity;
        int step;
        double next, now; // seconds on the audio clock
        volatile float bpm = 72;
        volatile bool reset;
        const int R = 57; // A3
        readonly System.Random rnd = new System.Random(3);

        public Music(AudioSys sys) { this.sys = sys; }
        public string Mode => mode;

        public void SetMode(string m)
        {
            if (m == mode) return;
            mode = m;
            sys.SetMusicOut(m == "off" ? 0 : m == "drive" ? 0.6f : 1);
            bpm = m == "garage" ? 84 : 72;
            reset = true;
        }
        public void SetIntensity(float v) { intensity = Mathf.Clamp01(v); }
        static float Midi(int n) => 440 * Mathf.Pow(2, (n - 69) / 12f);

        // audio thread, once per block
        internal void Schedule(int n)
        {
            float sr = sys.SampleRate;
            double blockEnd = now + n / sr;
            if (reset) { reset = false; step = 0; next = now + 0.1; }
            if (mode != "off")
            {
                double spb = 60.0 / bpm / 2; // eighth notes
                while (next < blockEnd)
                {
                    int delay = (int)Math.Max(0, (next - now) * sr);
                    Play(step, delay, (float)spb);
                    next += spb;
                    step++;
                }
            }
            else next = blockEnd;
            now = blockEnd;
        }

        // runs on the audio thread: voices are rendered directly, no queue needed
        void Add(Voice v, int delay) { v.bus = v.bus == Bus.Sfx ? Bus.MusicPre : v.bus; v.delay = delay; sys.Play(v); }
        void Pad(int[] notes, int delay, float dur, float gain)
        {
            var f = new float[notes.Length];
            for (int i = 0; i < f.Length; i++) f[i] = Midi(notes[i]);
            Add(new PadVoice(f, dur, gain), delay);
        }
        void Pluck(int n, int delay, float gain = 0.06f, float len = 1.2f) => Add(new ToneVoice(Midi(n), Wave.Triangle, len - 0.005f, gain, 0.005f, harm2: 0.3f, echo: true), delay);
        void Kick(int delay, float g = 0.25f) => Add(new KickVoice(g), delay);
        void Hat(int delay, float g = 0.03f) => Add(new HatVoice(g, (float)rnd.NextDouble() * 0.5f), delay);
        void Bass(int n, int delay, float dur, float g = 0.12f) => Add(new BassVoice(Midi(n), dur, g), delay);

        static int[] Chord(int[] c, int add) { var r = new int[c.Length]; for (int i = 0; i < c.Length; i++) r[i] = c[i] + add; return r; }

        void Play(int step, int d, float spb)
        {
            int bar = step / 8, beat = step % 8;
            var chord = CHORDS[bar % 4];
            string m = mode;
            if (m == "menu")
            {
                if (beat == 0) Pad(Chord(chord, R), d, spb * 8.4f, 0.022f);
                if (beat == 0 || beat == 3 || beat == 5 || (beat == 6 && bar % 2 == 1))
                {
                    int deg = SCALE[(bar * 3 + beat * 2) % 7] + (beat == 5 ? 12 : 0);
                    Pluck(R + 12 + deg, d, 0.045f, 1.6f);
                }
                if (beat == 0 && bar % 2 == 0) Bass(R - 12 + chord[0], d, spb * 7, 0.07f);
            }
            else if (m == "garage")
            {
                if (beat == 0 || beat == 4 || (beat == 7 && bar % 2 == 1)) Kick(d, 0.16f);
                if (beat % 2 == 1) Hat(d, 0.018f);
                if (beat == 0 || beat == 3 || beat == 6) Bass(R - 12 + chord[0] + (beat == 6 ? 7 : 0), d, spb * 2, 0.09f);
                if (beat == 2 && bar % 2 == 0) Pad(Chord(chord, R), d, spb * 6, 0.012f);
                if (beat == 5 && bar % 4 == 3) Pluck(R + 12 + chord[2], d, 0.03f, 1);
            }
            else if (m == "drive")
            {
                float I = intensity;
                if (beat == 0 && bar % 2 == 0) Pad(new[] { R - 12 + chord[0], R + chord[0] - 5 }, d, spb * 16, 0.006f + I * 0.02f);
                if (I > 0.35f && (beat == 0 || beat == 4)) Kick(d, 0.05f + I * 0.12f);
                if (I > 0.55f && beat % 2 == 1) Hat(d, 0.006f + I * 0.015f);
                if (I > 0.45f && (beat == 0 || beat == 3 || beat == 6)) Bass(R - 12 + chord[0], d, spb * 1.6f, 0.03f + I * 0.06f);
                if (I > 0.7f && beat == 2) Pluck(R + 12 + chord[1], d, 0.025f, 0.8f);
            }
        }
    }
}

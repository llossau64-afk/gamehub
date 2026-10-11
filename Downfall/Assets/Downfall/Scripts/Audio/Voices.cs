// One-shot voices (the browser build's burst/tone and the music instruments). Each one
// renders itself into a bus and reports when it has finished.
using System;

namespace Downfall.Audio
{
    public enum Bus { Sfx, Music, MusicPre, Amb, Eng, Echo }

    public sealed class Mix
    {
        public float[] sfx = new float[0], music = new float[0], musicPre = new float[0], amb = new float[0], eng = new float[0], echo = new float[0];
        public int n;
        public float sr;
        public void Prepare(int n)
        {
            this.n = n;
            if (sfx.Length < n) { sfx = new float[n]; music = new float[n]; musicPre = new float[n]; amb = new float[n]; eng = new float[n]; echo = new float[n]; }
            Array.Clear(sfx, 0, n); Array.Clear(music, 0, n); Array.Clear(musicPre, 0, n); Array.Clear(amb, 0, n); Array.Clear(eng, 0, n); Array.Clear(echo, 0, n);
        }
        public float[] Get(Bus b) => b switch { Bus.Music => music, Bus.MusicPre => musicPre, Bus.Amb => amb, Bus.Eng => eng, Bus.Echo => echo, _ => sfx };
    }

    public abstract class Voice
    {
        public Bus bus = Bus.Sfx;
        public int delay; // samples before the voice starts
        protected int t;  // samples since start
        protected float sr;
        public bool Render(Mix m)
        {
            sr = m.sr;
            int i = 0;
            if (delay > 0) { int d = Math.Min(delay, m.n); delay -= d; i = d; if (i >= m.n) return true; }
            return Run(m, i);
        }
        // render samples [from, m.n); return false when done
        protected abstract bool Run(Mix m, int from);
        protected float Sec => t / sr;
    }

    // WebAudio's env(): 0.0001 → peak linearly over a, then exponentially to sustain over dec.
    public struct Env
    {
        public float a, peak, dec, sus;
        public Env(float a, float peak, float dec, float sus = 0) { this.a = Math.Max(1e-4f, a); this.peak = peak; this.dec = Math.Max(1e-4f, dec); this.sus = Math.Max(1e-4f, sus); }
        public float At(float s)
        {
            if (s < a) return 0.0001f + (peak - 0.0001f) * (s / a);
            float p = Math.Max(1e-4f, peak);
            if (s < a + dec) return p * (float)Math.Pow(sus / p, (s - a) / dec);
            return sus;
        }
        public float End => a + dec + 0.05f;
    }

    public sealed class NoiseVoice : Voice
    {
        NoiseReader src; Biquad f; Env env;
        readonly FilterType type; readonly float freq, q, freqEnd, rampT;
        public NoiseVoice(float[] buf, float freq, float q, FilterType type, float dur, float gain, float attack, float rate, float startFrac, float freqEnd = 0, float rampT = 0)
        {
            src = new NoiseReader(buf, startFrac, rate);
            this.type = type; this.freq = freq; this.q = q; this.freqEnd = freqEnd; this.rampT = rampT;
            env = new Env(attack, gain, dur);
        }
        protected override bool Run(Mix m, int i)
        {
            var o = m.Get(bus);
            float end = env.End;
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > end) return false;
                if ((t & 15) == 0)
                {
                    float fr = freq;
                    if (freqEnd > 0 && rampT > 0) fr = freq * (float)Math.Pow(freqEnd / freq, Math.Min(1, s / rampT));
                    f.Set(type, fr, q, sr);
                }
                o[i] += f.Run(src.Next()) * env.At(s);
            }
            return true;
        }
    }

    public sealed class ToneVoice : Voice
    {
        Osc o1, o2; Env env;
        readonly Wave wave; readonly float freq, slide, dur, detune, harm2;
        readonly bool echo;
        public ToneVoice(float freq, Wave wave, float dur, float gain, float attack, float slide = 0, float detune = 0, float harm2 = 0, bool echo = false)
        {
            this.freq = freq; this.wave = wave; this.dur = dur; this.slide = slide; this.detune = (float)Math.Pow(2, detune / 1200.0); this.harm2 = harm2; this.echo = echo;
            env = new Env(attack, gain, dur);
        }
        protected override bool Run(Mix m, int i)
        {
            var o = m.Get(bus);
            float end = env.End;
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > end) return false;
                float fr = freq;
                if (slide != 0) fr = freq * (float)Math.Pow(Math.Max(20, freq * slide) / freq, Math.Min(1, s / dur));
                float v = o1.Next(wave, fr * detune, sr);
                if (harm2 > 0) v += o2.Next(Wave.Sine, fr * 2.01f, sr) * harm2;
                v *= env.At(s);
                o[i] += v;
                if (echo) m.echo[i] += v;
            }
            return true;
        }
    }

    // music pad: two detuned saws per note through a swelling lowpass
    public sealed class PadVoice : Voice
    {
        readonly float[] freqs; readonly Osc[] osc; Biquad f;
        readonly float dur, gain;
        public PadVoice(float[] freqs, float dur, float gain)
        {
            this.freqs = freqs; this.dur = dur; this.gain = gain;
            osc = new Osc[freqs.Length * 2];
        }
        protected override bool Run(Mix m, int i)
        {
            var o = m.Get(bus);
            float c1 = (float)Math.Pow(2, -7 / 1200.0), c2 = (float)Math.Pow(2, 6 / 1200.0);
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > dur + 0.1f) return false;
                float g = s < dur * 0.35f ? 0.0001f + (gain - 0.0001f) * s / (dur * 0.35f) : Math.Max(0, gain + (0.0001f - gain) * (s - dur * 0.35f) / (dur * 0.65f));
                if ((t & 31) == 0)
                {
                    float ff = s < dur * 0.5f ? 400 + 500 * s / (dur * 0.5f) : 900 - 400 * Math.Min(1, (s - dur * 0.5f) / (dur * 0.5f));
                    f.Set(FilterType.Lowpass, ff, 0.5f, sr);
                }
                float v = 0;
                for (int k = 0; k < freqs.Length; k++) v += osc[k * 2].Next(Wave.Saw, freqs[k] * c1, sr) + osc[k * 2 + 1].Next(Wave.Saw, freqs[k] * c2, sr);
                o[i] += f.Run(v) * g;
            }
            return true;
        }
    }

    public sealed class KickVoice : Voice
    {
        Osc o1; readonly float gain;
        public KickVoice(float gain) { this.gain = gain; }
        protected override bool Run(Mix m, int i)
        {
            var o = m.Get(bus);
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > 0.4f) return false;
                float fr = 120 * (float)Math.Pow(42 / 120.0, Math.Min(1, s / 0.18f));
                float g = gain * (float)Math.Pow(0.0001 / gain, Math.Min(1, s / 0.35f));
                o[i] += o1.Next(Wave.Sine, fr, sr) * g;
            }
            return true;
        }
    }

    public sealed class HatVoice : Voice
    {
        NoiseReader src; Biquad f; readonly float gain; bool init;
        public HatVoice(float gain, float start) { this.gain = gain; src = new NoiseReader(NoiseBufs.White, start); }
        protected override bool Run(Mix m, int i)
        {
            if (!init) { f.Set(FilterType.Highpass, 7000, 1, m.sr); init = true; }
            var o = m.Get(bus);
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > 0.06f) return false;
                o[i] += f.Run(src.Next()) * gain * (float)Math.Pow(0.0001 / gain, Math.Min(1, s / 0.05f));
            }
            return true;
        }
    }

    public sealed class BassVoice : Voice
    {
        Osc o1; Biquad f; readonly float freq, dur, gain; bool init;
        public BassVoice(float freq, float dur, float gain) { this.freq = freq; this.dur = dur; this.gain = gain; }
        protected override bool Run(Mix m, int i)
        {
            if (!init) { f.Set(FilterType.Lowpass, 400, 1, m.sr); init = true; }
            var o = m.Get(bus);
            var env = new Env(0.01f, gain, dur - 0.01f);
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > dur + 0.05f) return false;
                o[i] += f.Run(o1.Next(Wave.Triangle, freq, sr)) * env.At(s);
            }
            return true;
        }
    }

    // impact wrench in the garage: a buzzing saw, gated by a 22 Hz wobble
    public sealed class WrenchVoice : Voice
    {
        Osc o1, lfo; Biquad f; readonly float dur; bool init;
        public WrenchVoice(float dur) { this.dur = dur; }
        protected override bool Run(Mix m, int i)
        {
            if (!init) { f.Set(FilterType.Bandpass, 1400, 1.5f, m.sr); init = true; }
            var o = m.Get(bus);
            for (; i < m.n; i++, t++)
            {
                float s = Sec;
                if (s > dur + 0.05f) return false;
                float g = s < 0.02f ? 0.35f * s / 0.02f : s < dur - 0.05f ? 0.35f : Math.Max(0, 0.35f * (dur - s) / 0.05f);
                g += lfo.Next(Wave.Sine, 22, sr) * 0.5f;
                o[i] += f.Run(o1.Next(Wave.Saw, 70 + 40 * Math.Min(1, s / dur), sr)) * g;
            }
            return true;
        }
    }
}

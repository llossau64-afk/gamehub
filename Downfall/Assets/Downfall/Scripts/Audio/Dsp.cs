// DSP building blocks for the synthesiser: the parts of WebAudio the browser build used
// (biquads with WebAudio's Q conventions, oscillators, noise buffers, smoothed params).
// Everything here runs on Unity's audio thread.
using System;

namespace Downfall.Audio
{
    public enum FilterType { Lowpass, Highpass, Bandpass }
    public enum Wave { Sine, Triangle, Square, Saw }

    // setTargetAtTime: v approaches target with time constant tau. The main thread writes
    // target (and tau); the audio thread steps v.
    public struct Smooth
    {
        public float v, target, tau;
        float c, cTau;
        public Smooth(float v, float tau) { this.v = v; target = v; this.tau = tau; c = 0; cTau = -1; }
        public void To(float target, float tau) { this.target = target; this.tau = tau; }
        public float Step(float sr)
        {
            if (cTau != tau) { cTau = tau; c = tau <= 0 ? 1f : 1f - (float)Math.Exp(-1.0 / (tau * sr)); }
            v += (target - v) * c;
            return v;
        }
    }

    // RBJ biquad, matching WebAudio's BiquadFilterNode: lowpass/highpass Q is in dB,
    // bandpass Q is linear (constant 0 dB peak).
    public struct Biquad
    {
        float b0, b1, b2, a1, a2, x1, x2, y1, y2;
        public FilterType type;

        public void Set(FilterType t, float freq, float q, float sr)
        {
            type = t;
            freq = Math.Max(10f, Math.Min(freq, sr * 0.49f));
            double w0 = 2 * Math.PI * freq / sr, cs = Math.Cos(w0), sn = Math.Sin(w0);
            double Q = t == FilterType.Bandpass ? Math.Max(1e-4, q) : Math.Pow(10, q / 20.0);
            double alpha = sn / (2 * Q);
            double B0, B1, B2, A0 = 1 + alpha, A1 = -2 * cs, A2 = 1 - alpha;
            switch (t)
            {
                case FilterType.Lowpass: B0 = (1 - cs) / 2; B1 = 1 - cs; B2 = (1 - cs) / 2; break;
                case FilterType.Highpass: B0 = (1 + cs) / 2; B1 = -(1 + cs); B2 = (1 + cs) / 2; break;
                default: B0 = alpha; B1 = 0; B2 = -alpha; break;
            }
            b0 = (float)(B0 / A0); b1 = (float)(B1 / A0); b2 = (float)(B2 / A0); a1 = (float)(A1 / A0); a2 = (float)(A2 / A0);
        }

        public float Run(float x)
        {
            float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            if (y > -1e-20f && y < 1e-20f) y1 = 0; // no denormals
            return y;
        }
    }

    public struct Osc
    {
        public double phase;
        public float Next(Wave w, float freq, float sr)
        {
            phase += freq / sr;
            phase -= Math.Floor(phase);
            float p = (float)phase;
            switch (w)
            {
                case Wave.Sine: return (float)Math.Sin(p * 2 * Math.PI);
                case Wave.Triangle: return p < 0.25f ? p * 4 : p < 0.75f ? 2 - p * 4 : p * 4 - 4;
                case Wave.Square: return p < 0.5f ? 1 : -1;
                default: return 2 * p - 1;
            }
        }
        public float Table(float[] table, float freq, float sr)
        {
            phase += freq / sr;
            phase -= Math.Floor(phase);
            double x = phase * table.Length;
            int i = (int)x; float f = (float)(x - i);
            int j = i + 1 == table.Length ? 0 : i + 1;
            return table[i] + (table[j] - table[i]) * f;
        }
    }

    // A looped noise buffer read at a playback rate.
    public struct NoiseReader
    {
        public float[] buf;
        public double pos;
        public float rate;
        public NoiseReader(float[] b, double start, float rate = 1) { buf = b; pos = start * b.Length; this.rate = rate; }
        public float Next()
        {
            int i = (int)pos;
            float v = buf[i];
            pos += rate;
            if (pos >= buf.Length) pos -= buf.Length;
            return v;
        }
    }

    public static class NoiseBufs
    {
        public static float[] White, Pink, Brown;

        public static void Build(int sr, int seed)
        {
            var r = new Random(seed);
            int len = sr * 2;
            White = new float[len]; Pink = new float[len]; Brown = new float[len];
            double b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
            for (int i = 0; i < len; i++)
            {
                double w = r.NextDouble() * 2 - 1;
                White[i] = (float)w;
                b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
                b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
                Pink[i] = (float)((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11); b6 = w * 0.115926;
                last = (last + 0.02 * w) / 1.02; Brown[i] = (float)(last * 3.5);
            }
        }
    }

    // A small Freeverb-style room standing in for the browser build's convolver
    // (tunnels and the garage).
    public sealed class Reverb
    {
        readonly float[][] comb; readonly int[] ci; readonly float[] cf;
        readonly float[][] ap; readonly int[] ai;
        public Reverb(int sr)
        {
            int[] cl = { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 };
            int[] al = { 556, 441, 341, 225 };
            float k = sr / 44100f * 1.6f; // a longer, darker room (~2.4 s)
            comb = new float[cl.Length][]; ci = new int[cl.Length]; cf = new float[cl.Length];
            for (int i = 0; i < cl.Length; i++) comb[i] = new float[(int)(cl[i] * k)];
            ap = new float[al.Length][]; ai = new int[al.Length];
            for (int i = 0; i < al.Length; i++) ap[i] = new float[(int)(al[i] * k)];
        }
        public float Run(float x)
        {
            float o = 0;
            for (int i = 0; i < comb.Length; i++)
            {
                var b = comb[i]; int p = ci[i];
                float y = b[p];
                cf[i] = y * 0.6f + cf[i] * 0.4f;
                b[p] = x * 0.015f + cf[i] * 0.86f;
                ci[i] = p + 1 == b.Length ? 0 : p + 1;
                o += y;
            }
            for (int i = 0; i < ap.Length; i++)
            {
                var b = ap[i]; int p = ai[i];
                float bo = b[p];
                b[p] = o + bo * 0.5f;
                o = bo - o;
                ai[i] = p + 1 == b.Length ? 0 : p + 1;
            }
            return o;
        }
    }

    // DynamicsCompressor stand-in: threshold -14 dB, ratio 4, attack 5 ms, release 200 ms.
    public sealed class Compressor
    {
        float env;
        readonly float att, rel;
        public Compressor(float sr) { att = 1 - (float)Math.Exp(-1 / (0.005 * sr)); rel = 1 - (float)Math.Exp(-1 / (0.2 * sr)); }
        public float Gain(float x)
        {
            float a = Math.Abs(x);
            env += (a - env) * (a > env ? att : rel);
            float db = 20 * (float)Math.Log10(env + 1e-9f);
            if (db <= -14) return 1;
            float over = db + 14;
            return (float)Math.Pow(10, -(over - over / 4) / 20);
        }
    }
}

// Small math, random and noise helpers shared by every system.
// A faithful port of the browser build's util.js: the same seeds give the same numbers,
// so tracks, scenery and bot behaviour match the web version exactly.
using System;

namespace Downfall
{
    public static class U
    {
        public const double TAU = Math.PI * 2;

        public static float Clamp(float v, float a, float b) => v < a ? a : v > b ? b : v;
        public static double Clamp(double v, double a, double b) => v < a ? a : v > b ? b : v;
        public static float Lerp(float a, float b, float t) => a + (b - a) * t;
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;
        public static float InvLerp(float a, float b, float v) => Clamp((v - a) / (b - a), 0f, 1f);
        public static double InvLerp(double a, double b, double v) => Clamp((v - a) / (b - a), 0, 1);
        public static float Smoothstep(float a, float b, float v) { float t = InvLerp(a, b, v); return t * t * (3 - 2 * t); }
        public static double Smoothstep(double a, double b, double v) { double t = InvLerp(a, b, v); return t * t * (3 - 2 * t); }
        // Frame-rate independent exponential approach.
        public static float Damp(float a, float b, float lambda, float dt) => Lerp(a, b, 1f - (float)Math.Exp(-lambda * dt));
        public static double Damp(double a, double b, double lambda, double dt) => Lerp(a, b, 1 - Math.Exp(-lambda * dt));
        public static float Sign(float v) => v < 0 ? -1f : 1f;

        public static double WrapAngle(double a)
        {
            while (a > Math.PI) a -= TAU;
            while (a < -Math.PI) a += TAU;
            return a;
        }
        public static float WrapAngle(float a) => (float)WrapAngle((double)a);

        // JavaScript's ToInt32 (what `x | 0` does to a double).
        public static int ToInt32(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v)) return 0;
            double t = Math.Truncate(v);
            double m = t % 4294967296.0;
            if (m < 0) m += 4294967296.0;
            return unchecked((int)(uint)m);
        }

        public static double Hash2(double x, double y, double seed = 0)
        {
            int h = ToInt32(x * 374761393.0 + y * 668265263.0 + seed * 2147483647.0);
            h = unchecked((int)((uint)(h ^ (int)((uint)h >> 13)) * 1274126177u));
            h ^= (int)((uint)h >> 16);
            return (uint)h / 4294967296.0;
        }

        public static string FmtMoney(double v) => "$" + Math.Round(v).ToString("#,0", System.Globalization.CultureInfo.InvariantCulture);
        public static string FmtKm(double m) => (Math.Max(0, m) / 1000).ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
    }

    // Deterministic PRNG (mulberry32), identical stream to the web build.
    public sealed class Rng
    {
        uint s;
        public Rng(double seed) { s = (uint)U.ToInt32(seed); }
        public double Next()
        {
            unchecked
            {
                s += 0x6d2b79f5u;
                uint t = s;
                t = (t ^ (t >> 15)) * (t | 1u);
                t ^= t + (t ^ (t >> 7)) * (t | 61u);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }
        public float F() => (float)Next();
        public double Range(double a, double b) => a + (b - a) * Next();
        public float Range(float a, float b) => (float)(a + (b - a) * Next());
        public int Int(int a, int b) => (int)Math.Floor(a + (b - a + 1) * Next());
        public T Pick<T>(T[] arr) => arr[(int)Math.Floor(Next() * arr.Length)];
        public T Pick<T>(System.Collections.Generic.IList<T> arr) => arr[(int)Math.Floor(Next() * arr.Count)];
        public bool Chance(double p) => Next() < p;
    }

    // 2D simplex noise (Gustavson), returns roughly -1..1.
    public sealed class Noise
    {
        static readonly int[] GX = { 1, -1, 1, -1, 1, -1, 0, 0 };
        static readonly int[] GY = { 1, 1, -1, -1, 0, 0, 1, -1 };
        readonly byte[] perm = new byte[512];

        public Noise(double seed = 1)
        {
            var r = new Rng(seed);
            var p = new byte[256];
            for (int i = 0; i < 256; i++) p[i] = (byte)i;
            for (int i = 255; i > 0; i--)
            {
                int j = (int)Math.Floor(r.Next() * (i + 1));
                byte t = p[i]; p[i] = p[j]; p[j] = t;
            }
            for (int i = 0; i < 512; i++) perm[i] = p[i & 255];
        }

        public double N2(double xin, double yin)
        {
            const double F2 = 0.3660254037844386, G2 = 0.21132486540518713;
            double s = (xin + yin) * F2;
            int i = (int)Math.Floor(xin + s), j = (int)Math.Floor(yin + s);
            double t = (i + j) * G2;
            double x0 = xin - (i - t), y0 = yin - (j - t);
            int i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
            double x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
            double x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
            int ii = i & 255, jj = j & 255;
            double n0 = 0, n1 = 0, n2 = 0;
            double t0 = 0.5 - x0 * x0 - y0 * y0;
            if (t0 > 0) { int g = perm[ii + perm[jj]] & 7; t0 *= t0; n0 = t0 * t0 * (GX[g] * x0 + GY[g] * y0); }
            double t1 = 0.5 - x1 * x1 - y1 * y1;
            if (t1 > 0) { int g = perm[ii + i1 + perm[jj + j1]] & 7; t1 *= t1; n1 = t1 * t1 * (GX[g] * x1 + GY[g] * y1); }
            double t2 = 0.5 - x2 * x2 - y2 * y2;
            if (t2 > 0) { int g = perm[ii + 1 + perm[jj + 1]] & 7; t2 *= t2; n2 = t2 * t2 * (GX[g] * x2 + GY[g] * y2); }
            return 70 * (n0 + n1 + n2);
        }

        public double Fbm(double x, double y, int oct = 4, double lac = 2, double gain = 0.5)
        {
            double a = 1, f = 1, s = 0, n = 0;
            for (int o = 0; o < oct; o++) { s += a * N2(x * f, y * f); n += a; a *= gain; f *= lac; }
            return s / n;
        }

        public double Ridge(double x, double y, int oct = 4)
        {
            double a = 1, f = 1, s = 0, n = 0;
            for (int o = 0; o < oct; o++) { s += a * (1 - Math.Abs(N2(x * f, y * f))); n += a; a *= 0.5; f *= 2.03; }
            return s / n;
        }
    }
}

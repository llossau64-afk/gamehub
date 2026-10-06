using System;
using UnityEngine;

namespace GuessTheAnswer.Audio
{
    public enum Wave
    {
        Sine,
        Triangle,
        Square,
        Saw,
    }

    /// <summary>
    /// A tiny additive synthesizer that renders into a float buffer. All game sounds are generated with it at
    /// startup, so the build carries no audio files and no third-party sounds.
    /// </summary>
    public sealed class SynthBuffer
    {
        public const int SampleRate = 22050;

        public readonly float[] Data;
        readonly bool wrap;
        uint noiseState = 0x12345678;

        public SynthBuffer(float seconds, bool wrap = false)
        {
            Data = new float[Mathf.Max(1, Mathf.CeilToInt(seconds * SampleRate))];
            this.wrap = wrap;
        }

        public float Length => Data.Length / (float)SampleRate;

        public static float NoteHz(int midi) => 440f * Mathf.Pow(2f, (midi - 69) / 12f);

        static float Osc(Wave wave, double phase)
        {
            double p = phase - Math.Floor(phase);
            switch (wave)
            {
                case Wave.Triangle: return (float)(p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
                case Wave.Square: return p < 0.5 ? 0.7f : -0.7f;
                case Wave.Saw: return (float)(2 * p - 1) * 0.7f;
                default: return (float)Math.Sin(p * 2 * Math.PI);
            }
        }

        /// <summary>A tone with an attack/exponential-decay envelope and an optional pitch glide.</summary>
        public void Tone(float start, float duration, float freq, float amp, Wave wave = Wave.Sine,
            float attack = 0.005f, float decay = 6f, float freqEnd = -1f, float vibrato = 0f, float harmonic = 0f)
        {
            int from = Mathf.RoundToInt(start * SampleRate);
            int count = Mathf.RoundToInt(duration * SampleRate);
            if (freqEnd <= 0f) freqEnd = freq;
            double phase = 0, phase2 = 0;
            float release = Mathf.Min(0.02f, duration * 0.3f);
            for (int i = 0; i < count; i++)
            {
                int idx = from + i;
                if (idx >= Data.Length)
                {
                    if (!wrap) break;
                    idx %= Data.Length;
                }
                float t = i / (float)SampleRate;
                float k = count > 1 ? i / (float)(count - 1) : 0f;
                float f = Mathf.Lerp(freq, freqEnd, k);
                if (vibrato > 0f) f *= 1f + vibrato * Mathf.Sin(t * 2f * Mathf.PI * 6f);
                phase += f / SampleRate;
                phase2 += f * 2f / SampleRate;
                float env = t < attack ? t / attack : Mathf.Exp(-(t - attack) * decay);
                float tail = duration - t;
                if (tail < release) env *= Mathf.Max(0f, tail / release);
                float s = Osc(wave, phase);
                if (harmonic > 0f) s += harmonic * Osc(Wave.Sine, phase2);
                Data[idx] += s * env * amp;
            }
        }

        float Noise()
        {
            noiseState ^= noiseState << 13;
            noiseState ^= noiseState >> 17;
            noiseState ^= noiseState << 5;
            return (noiseState / (float)uint.MaxValue) * 2f - 1f;
        }

        /// <summary>Filtered noise (cutoff glides from cutoffStart to cutoffEnd, 0..1 of the sample rate).</summary>
        public void Noise(float start, float duration, float amp, float cutoffStart, float cutoffEnd, float attack = 0.002f, float decay = 20f)
        {
            int from = Mathf.RoundToInt(start * SampleRate);
            int count = Mathf.RoundToInt(duration * SampleRate);
            float low = 0f;
            for (int i = 0; i < count; i++)
            {
                int idx = from + i;
                if (idx >= Data.Length)
                {
                    if (!wrap) break;
                    idx %= Data.Length;
                }
                float t = i / (float)SampleRate;
                float k = count > 1 ? i / (float)(count - 1) : 0f;
                float a = Mathf.Clamp01(Mathf.Lerp(cutoffStart, cutoffEnd, k));
                low += (Noise() - low) * a;
                float env = t < attack ? t / attack : Mathf.Exp(-(t - attack) * decay);
                Data[idx] += low * env * amp;
            }
        }

        /// <summary>Scales the buffer so the loudest sample reaches the given peak.</summary>
        public void Normalize(float peak = 0.9f)
        {
            float max = 0f;
            for (int i = 0; i < Data.Length; i++) max = Mathf.Max(max, Mathf.Abs(Data[i]));
            if (max < 1e-5f) return;
            float scale = peak / max;
            for (int i = 0; i < Data.Length; i++) Data[i] *= scale;
        }

        public AudioClip ToClip(string name)
        {
            var clip = AudioClip.Create(name, Data.Length, 1, SampleRate, false);
            clip.SetData(Data, 0);
            return clip;
        }
    }
}

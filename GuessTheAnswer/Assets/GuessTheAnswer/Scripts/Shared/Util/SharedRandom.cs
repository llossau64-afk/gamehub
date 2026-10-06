using System;
using System.Collections.Generic;

namespace GuessTheAnswer.Shared
{
    public interface IRandom
    {
        /// <summary>Uniform integer in [0, maxExclusive).</summary>
        int Next(int maxExclusive);

        /// <summary>Uniform double in [0, 1).</summary>
        double NextDouble();
    }

    /// <summary>Small, fast, seedable PRNG (xorshift64*). Identical results on the server and in Unity.</summary>
    public sealed class XorShiftRandom : IRandom
    {
        ulong state;

        public XorShiftRandom(ulong seed)
        {
            state = seed == 0 ? 0x9E3779B97F4A7C15UL : seed;
        }

        public static XorShiftRandom FromTime()
        {
            ulong seed = (ulong)DateTime.UtcNow.Ticks ^ ((ulong)Environment.TickCount << 32) ^ (ulong)Guid.NewGuid().GetHashCode();
            return new XorShiftRandom(seed);
        }

        ulong NextULong()
        {
            state ^= state >> 12;
            state ^= state << 25;
            state ^= state >> 27;
            return state * 0x2545F4914F6CDD1DUL;
        }

        public int Next(int maxExclusive)
        {
            if (maxExclusive <= 1) return 0;
            return (int)(NextULong() % (ulong)maxExclusive);
        }

        public double NextDouble()
        {
            return (NextULong() >> 11) * (1.0 / 9007199254740992.0);
        }
    }

    public static class RandomExtensions
    {
        public static double Range(this IRandom rng, double min, double max)
        {
            return min + (max - min) * rng.NextDouble();
        }

        public static void Shuffle<T>(this IRandom rng, IList<T> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                T tmp = list[i];
                list[i] = list[j];
                list[j] = tmp;
            }
        }
    }
}

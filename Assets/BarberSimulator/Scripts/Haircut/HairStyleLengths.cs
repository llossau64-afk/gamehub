using System;
using UnityEngine;

namespace BarberSimulator.Haircut
{
    /// <summary>Grown-out hair a customer walks in with (cm per zone).</summary>
    [Serializable]
    public struct HairStyleLengths
    {
        public float top;
        public float front;
        public float crown;
        public float sidesUpper;
        public float sidesMiddle;
        public float sidesLower;
        public float temples;
        public float backUpper;
        public float backMiddle;
        public float backLower;
        public float nape;
        [Range(0f, 0.3f)] public float unevenness;

        public float Unevenness => unevenness;

        public float LengthFor(HairZone zone, HairBand band)
        {
            switch (zone)
            {
                case HairZone.Top: return top;
                case HairZone.Front: return front;
                case HairZone.Crown: return crown;
                case HairZone.LeftTemple:
                case HairZone.RightTemple: return temples;
                case HairZone.Nape: return nape;
                case HairZone.LeftSide:
                case HairZone.RightSide:
                    return band == HairBand.Lower ? sidesLower : band == HairBand.Middle ? sidesMiddle : sidesUpper;
                case HairZone.Back:
                    return band == HairBand.Lower ? backLower : band == HairBand.Middle ? backMiddle : backUpper;
                default: return 0f;
            }
        }

        /// <summary>Typical "needs a haircut" head: medium top, grown-out sides.</summary>
        public static HairStyleLengths GrownOut(float scale = 1f)
        {
            return new HairStyleLengths
            {
                top = 5.2f * scale, front = 5.0f * scale, crown = 4.6f * scale,
                sidesUpper = 3.0f * scale, sidesMiddle = 2.7f * scale, sidesLower = 2.4f * scale, temples = 2.3f * scale,
                backUpper = 3.2f * scale, backMiddle = 2.9f * scale, backLower = 2.5f * scale, nape = 2.0f * scale,
                unevenness = 0.12f
            };
        }

        public static HairStyleLengths Uniform(float length)
        {
            return new HairStyleLengths
            {
                top = length, front = length, crown = length, sidesUpper = length, sidesMiddle = length, sidesLower = length,
                temples = length, backUpper = length, backMiddle = length, backLower = length, nape = length, unevenness = 0.05f
            };
        }
    }
}

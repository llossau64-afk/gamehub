using BarberSimulator.Characters;

namespace BarberSimulator.Haircut
{
    /// <summary>Maps the appearance hairstyle to grown-out lengths for the haircut grid.</summary>
    public static class HairPresets
    {
        public static HairStyleLengths For(HairStyle style, float scale)
        {
            HairStyleLengths lengths;
            switch (style)
            {
                case HairStyle.Bald:
                    lengths = HairStyleLengths.Uniform(0.04f);
                    break;
                case HairStyle.Short:
                    lengths = HairStyleLengths.GrownOut(0.55f);
                    break;
                case HairStyle.Curly:
                    lengths = HairStyleLengths.GrownOut(1.05f);
                    lengths.top = 6.2f; lengths.front = 5.6f; lengths.unevenness = 0.2f;
                    break;
                case HairStyle.Long:
                    lengths = HairStyleLengths.GrownOut(1.5f);
                    lengths.backLower = 4.8f; lengths.nape = 4.5f;
                    break;
                case HairStyle.Pompadour:
                    lengths = HairStyleLengths.GrownOut(1f);
                    lengths.top = 6.8f; lengths.front = 7.2f;
                    break;
                default:
                    lengths = HairStyleLengths.GrownOut(1f);
                    break;
            }

            if (scale != 1f)
            {
                lengths.top *= scale; lengths.front *= scale; lengths.crown *= scale;
                lengths.sidesUpper *= scale; lengths.sidesMiddle *= scale; lengths.sidesLower *= scale;
                lengths.temples *= scale; lengths.backUpper *= scale; lengths.backMiddle *= scale; lengths.backLower *= scale;
                lengths.nape *= scale;
            }
            return lengths;
        }
    }
}

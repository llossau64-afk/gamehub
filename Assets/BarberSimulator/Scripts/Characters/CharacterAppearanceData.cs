using System;
using UnityEngine;

namespace BarberSimulator.Characters
{
    public enum HairStyle { Bald = 0, Short = 1, SidePart = 2, Curly = 3, Long = 4, Pompadour = 5 }
    public enum FacialHairStyle { None = 0, Stubble = 1, Moustache = 2, FullBeard = 3 }
    public enum CharacterAccessory { None = 0, Glasses = 1, Cap = 2 }

    /// <summary>
    /// Everything that makes one character look different from another. Indices map onto variant slots of
    /// <see cref="ModularCharacter"/>, so new heads, haircuts or outfits only need new slot entries.
    /// </summary>
    [Serializable]
    public struct CharacterAppearanceData
    {
        public Color skinTone;
        public HairStyle hairStyle;
        public Color hairColor;
        public FacialHairStyle facialHair;
        public int topStyle;
        public Color topColor;
        public Color pantsColor;
        public Color shoeColor;
        public CharacterAccessory accessory;
        [Range(0.92f, 1.08f)] public float heightScale;
        [Range(0.9f, 1.15f)] public float buildScale;

        private static readonly Color[] SkinTones =
        {
            new Color(0.96f, 0.80f, 0.69f), new Color(0.89f, 0.70f, 0.56f), new Color(0.78f, 0.58f, 0.43f),
            new Color(0.63f, 0.44f, 0.31f), new Color(0.47f, 0.32f, 0.22f), new Color(0.34f, 0.23f, 0.16f)
        };

        private static readonly Color[] HairColors =
        {
            new Color(0.08f, 0.06f, 0.05f), new Color(0.2f, 0.13f, 0.08f), new Color(0.36f, 0.24f, 0.14f),
            new Color(0.62f, 0.5f, 0.32f), new Color(0.55f, 0.55f, 0.55f), new Color(0.42f, 0.18f, 0.1f)
        };

        private static readonly Color[] ClothColors =
        {
            new Color(0.16f, 0.22f, 0.32f), new Color(0.45f, 0.14f, 0.12f), new Color(0.24f, 0.31f, 0.22f),
            new Color(0.78f, 0.74f, 0.66f), new Color(0.2f, 0.2f, 0.22f), new Color(0.55f, 0.42f, 0.28f),
            new Color(0.32f, 0.4f, 0.5f), new Color(0.85f, 0.85f, 0.82f)
        };

        private static readonly Color[] PantsColors =
        {
            new Color(0.12f, 0.14f, 0.2f), new Color(0.2f, 0.18f, 0.16f), new Color(0.33f, 0.3f, 0.25f),
            new Color(0.15f, 0.15f, 0.15f), new Color(0.24f, 0.28f, 0.38f)
        };

        public static CharacterAppearanceData CreateRandom(System.Random rng)
        {
            T Pick<T>(T[] array) => array[rng.Next(array.Length)];
            float Range(float a, float b) => a + (float)rng.NextDouble() * (b - a);

            return new CharacterAppearanceData
            {
                skinTone = Pick(SkinTones),
                hairStyle = (HairStyle)rng.Next(0, 6),
                hairColor = Pick(HairColors),
                facialHair = (FacialHairStyle)rng.Next(0, 4),
                topStyle = rng.Next(0, 2),
                topColor = Pick(ClothColors),
                pantsColor = Pick(PantsColors),
                shoeColor = rng.NextDouble() > 0.5 ? new Color(0.1f, 0.08f, 0.07f) : new Color(0.32f, 0.2f, 0.12f),
                accessory = rng.NextDouble() > 0.75 ? (CharacterAccessory)rng.Next(1, 3) : CharacterAccessory.None,
                heightScale = Range(0.95f, 1.05f),
                buildScale = Range(0.94f, 1.1f)
            };
        }
    }
}

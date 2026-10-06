using System.Collections.Generic;
using UnityEngine;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// Anti-aliased UI shapes generated once at startup from signed distance functions: rounded rectangles (9-sliced),
    /// soft shadows, circles, rings and gradients. They cost a few KB of memory and nothing in build size.
    /// </summary>
    public static class Shapes
    {
        const int RoundSize = 128;
        const int RoundRadius = 48;
        const int ShadowSize = 128;
        const int ShadowBlur = 40;

        static Sprite rounded, roundedOutline, shadow, circle, ring, gradientV, white;
        static readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();

        /// <summary>Corner radius in pixels at pixelsPerUnitMultiplier 1 (use <see cref="RadiusMultiplier"/>).</summary>
        public const float RoundedRadius = RoundRadius;
        public const float ShadowBorder = ShadowBlur + 16;

        public static float RadiusMultiplier(float radius) => RoundRadius / Mathf.Max(1f, radius);

        public static Sprite Rounded => rounded ? rounded : rounded = MakeRounded(false);
        public static Sprite RoundedOutline => roundedOutline ? roundedOutline : roundedOutline = MakeRounded(true);
        public static Sprite SoftShadow => shadow ? shadow : shadow = MakeShadow();
        public static Sprite Circle => circle ? circle : circle = MakeCircle(false);
        public static Sprite Ring => ring ? ring : ring = MakeCircle(true);
        public static Sprite GradientVertical => gradientV ? gradientV : gradientV = MakeGradient();
        public static Sprite White => white ? white : white = MakeWhite();

        static Texture2D NewTexture(int w, int h)
        {
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.DontSave,
            };
            return tex;
        }

        static float RoundedRectSdf(float x, float y, float halfW, float halfH, float r)
        {
            float qx = Mathf.Abs(x) - halfW + r;
            float qy = Mathf.Abs(y) - halfH + r;
            float outside = new Vector2(Mathf.Max(qx, 0f), Mathf.Max(qy, 0f)).magnitude;
            return outside + Mathf.Min(Mathf.Max(qx, qy), 0f) - r;
        }

        static Sprite MakeRounded(bool outline)
        {
            var tex = NewTexture(RoundSize, RoundSize);
            var px = new Color32[RoundSize * RoundSize];
            float half = RoundSize / 2f;
            const float stroke = 4f;
            for (int y = 0; y < RoundSize; y++)
            {
                for (int x = 0; x < RoundSize; x++)
                {
                    float d = RoundedRectSdf(x + 0.5f - half, y + 0.5f - half, half, half, RoundRadius);
                    float a = Mathf.Clamp01(0.5f - d);
                    if (outline) a = Mathf.Min(a, Mathf.Clamp01(d + stroke + 0.5f));
                    px[y * RoundSize + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            float b = RoundRadius + 2;
            return Sprite.Create(tex, new Rect(0, 0, RoundSize, RoundSize), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }

        static Sprite MakeShadow()
        {
            int size = ShadowSize;
            var tex = NewTexture(size, size);
            var px = new Color32[size * size];
            float half = size / 2f;
            float inner = half - ShadowBlur;
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float d = RoundedRectSdf(x + 0.5f - half, y + 0.5f - half, inner, inner, 16f);
                    float a = 1f - Mathf.Clamp01((d + 4f) / ShadowBlur);
                    a = a * a * (3f - 2f * a);
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            float b = ShadowBorder;
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }

        static Sprite MakeCircle(bool asRing)
        {
            const int size = 256;
            var tex = NewTexture(size, size);
            var px = new Color32[size * size];
            float half = size / 2f;
            const float thickness = 22f;
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float r = new Vector2(x + 0.5f - half, y + 0.5f - half).magnitude;
                    float a = Mathf.Clamp01(half - 1f - r);
                    if (asRing) a = Mathf.Min(a, Mathf.Clamp01(r - (half - 1f - thickness)));
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
        }

        static Sprite MakeGradient()
        {
            var tex = NewTexture(4, 64);
            var px = new Color32[4 * 64];
            for (int y = 0; y < 64; y++)
            {
                byte a = (byte)(255 * (y / 63f));
                for (int x = 0; x < 4; x++) px[y * 4 + x] = new Color32(255, 255, 255, a);
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, 4, 64), new Vector2(0.5f, 0.5f), 100f);
        }

        static Sprite MakeWhite()
        {
            var tex = NewTexture(4, 4);
            var px = new Color32[16];
            for (int i = 0; i < px.Length; i++) px[i] = new Color32(255, 255, 255, 255);
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 100f);
        }

        /// <summary>Icon sprite from Resources/GTA/Icons (Material Symbols, Apache 2.0). Falls back to a dot.</summary>
        public static Sprite Icon(string name)
        {
            if (string.IsNullOrEmpty(name)) return Circle;
            if (cache.TryGetValue(name, out var s)) return s;
            s = Resources.Load<Sprite>("GTA/Icons/" + name);
            if (s == null)
            {
                var tex = Resources.Load<Texture2D>("GTA/Icons/" + name);
                if (tex != null) s = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), 100f);
            }
            if (s == null)
            {
                Debug.LogWarning("[UI] Icon missing: " + name);
                s = Circle;
            }
            cache[name] = s;
            return s;
        }
    }
}

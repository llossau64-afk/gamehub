using GuessTheAnswer.Save;
using UnityEngine;
using UnityEngine.UI;

namespace GuessTheAnswer.UI
{
    /// <summary>
    /// The living menu background: a soft vertical gradient, a slowly drifting dot grid and quiz cards
    /// (? A B C D and category icons) floating upward. One Update moves a handful of quads on its own canvas,
    /// so it never forces the main UI to rebuild.
    /// </summary>
    public sealed class BackgroundFX : MonoBehaviour
    {
        static readonly string[] Glyphs = { "?", "A", "B", "C", "D", "?", "A", "B" };
        static readonly string[] Icons = { "public", "sports_soccer", "movie", "bolt", "nutrition", "location_city", "sentiment_very_satisfied", "help" };

        struct Card
        {
            public RectTransform Rect;
            public float Speed;
            public float Spin;
            public float Phase;
            public float X;
        }

        Card[] cards = new Card[0];
        RawImage grid;
        RectTransform area;
        CanvasGroup group;
        float time;
        GraphicsQuality quality = GraphicsQuality.High;
        bool animate = true;

        public static BackgroundFX Create(Transform parent)
        {
            var root = UIFactory.Rect("Background", parent);
            UIFactory.Stretch(root);
            var fx = root.gameObject.AddComponent<BackgroundFX>();
            fx.area = root;
            fx.group = UIFactory.Group(fx);
            fx.group.blocksRaycasts = false;
            fx.group.interactable = false;

            var baseColor = UIFactory.Image(root, "Base", Theme.Background, Shapes.White);
            UIFactory.Stretch(baseColor.rectTransform);
            var glow = UIFactory.Image(root, "Top Glow", Theme.BackgroundTop, Shapes.GradientVertical);
            UIFactory.Stretch(glow.rectTransform);

            var gridGo = UIFactory.Rect("Grid", root);
            UIFactory.Stretch(gridGo);
            fx.grid = gridGo.gameObject.AddComponent<RawImage>();
            fx.grid.texture = DotTexture();
            fx.grid.color = new Color(1f, 1f, 1f, 0.05f);
            fx.grid.raycastTarget = false;

            fx.BuildCards(14);
            return fx;
        }

        static Texture2D DotTexture()
        {
            const int size = 64;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false)
            {
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.DontSave,
            };
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float d = new Vector2(x - size / 2f + 0.5f, y - size / 2f + 0.5f).magnitude;
                    byte a = (byte)(Mathf.Clamp01(3.2f - d) * 255);
                    px[y * size + x] = new Color32(255, 255, 255, a);
                }
            }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return tex;
        }

        void BuildCards(int count)
        {
            var rng = new System.Random(1234);
            cards = new Card[count];
            for (int i = 0; i < count; i++)
            {
                float size = 90f + (float)rng.NextDouble() * 80f;
                var panel = UIFactory.Panel(area, "Card " + i, new Color(1f, 1f, 1f, 0.035f + (float)rng.NextDouble() * 0.03f), size * 0.22f);
                var rt = panel.rectTransform;
                rt.anchorMin = rt.anchorMax = new Vector2(0f, 0f);
                rt.sizeDelta = new Vector2(size, size * 1.18f);
                UIFactory.Outline(rt, new Color(1f, 1f, 1f, 0.05f), size * 0.22f);
                if (i % 2 == 0)
                {
                    var t = UIFactory.Label(rt, Glyphs[i % Glyphs.Length], Mathf.RoundToInt(size * 0.55f), new Color(1f, 1f, 1f, 0.16f), Theme.Bold);
                    UIFactory.Stretch(t.rectTransform);
                }
                else
                {
                    var icon = UIFactory.Icon(rt, Icons[i % Icons.Length], size * 0.5f, new Color(1f, 1f, 1f, 0.14f));
                    icon.rectTransform.anchoredPosition = Vector2.zero;
                }
                cards[i] = new Card
                {
                    Rect = rt,
                    Speed = 18f + (float)rng.NextDouble() * 26f,
                    Spin = ((float)rng.NextDouble() - 0.5f) * 14f,
                    Phase = (float)rng.NextDouble() * 1400f,
                    X = (float)rng.NextDouble(),
                };
            }
            Place(0f);
        }

        public void SetQuality(GraphicsQuality q)
        {
            quality = q;
            int visible = q == GraphicsQuality.Low ? 6 : q == GraphicsQuality.Medium ? 9 : cards.Length;
            for (int i = 0; i < cards.Length; i++) cards[i].Rect.gameObject.SetActive(i < visible);
            animate = q != GraphicsQuality.Low;
        }

        /// <summary>Dim the decoration behind busy screens (the game screen keeps it very subtle).</summary>
        public void SetIntensity(float alpha)
        {
            Tween.Fade(group, alpha, Theme.Slow);
        }

        void Place(float t)
        {
            var size = area.rect.size;
            if (size.x < 1f) size = ResponsiveScaler.Reference;
            float travel = size.y + 400f;
            for (int i = 0; i < cards.Length; i++)
            {
                ref var c = ref cards[i];
                float y = Mathf.Repeat(c.Phase + t * c.Speed, travel) - 200f;
                float x = c.X * size.x + Mathf.Sin((t + c.Phase) * 0.25f) * 30f;
                c.Rect.anchoredPosition = new Vector2(x, y);
                c.Rect.localRotation = Quaternion.Euler(0f, 0f, Mathf.Sin((t + c.Phase) * 0.15f) * 12f + c.Spin);
            }
        }

        void Update()
        {
            if (!animate || group.alpha <= 0.01f) return;
            time += Time.unscaledDeltaTime;
            Place(time);
            var size = area.rect.size;
            float tiles = Mathf.Max(1f, size.x / 72f);
            grid.uvRect = new Rect(time * 0.01f, time * 0.02f, tiles, tiles * size.y / Mathf.Max(1f, size.x));
        }
    }
}

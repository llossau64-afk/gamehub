// Look of css/style.css for uGUI: palette, fonts, generated sprites/textures and small
// builders used by UI.cs. Everything is created from code at runtime.
using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;
using Downfall.Audio;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Downfall
{
    public static class Pal
    {
        public static readonly Color ink = C(235, 230, 218), ink2 = C(235, 230, 218, .72f), ink3 = C(235, 230, 218, .48f),
            line = C(235, 230, 218, .16f), line2 = C(235, 230, 218, .32f), bg = C(13, 14, 15, .82f), bg2 = C(13, 14, 15, .55f),
            amber = C(226, 163, 59), amber2 = C(226, 163, 59, .16f), amberHi = C(240, 180, 80), red = C(207, 74, 50), green = C(143, 178, 106),
            steel = C(139, 145, 150), dark = C(21, 18, 12), white = Color.white, gold = C(240, 196, 106), clear = new Color(0, 0, 0, 0);
        public static Color C(int r, int g, int b, float a = 1) => new Color(r / 255f, g / 255f, b / 255f, a);
        public static Color A(Color c, float a) { c.a = a; return c; }
        public static Color Parse(string css, Color fallback)
        {
            if (!string.IsNullOrEmpty(css) && ColorUtility.TryParseHtmlString(css, out var c)) return c;
            return fallback;
        }
        public static string Hex(Color c) => "#" + ColorUtility.ToHtmlStringRGBA(c);
    }

    // Barlow / Barlow Condensed (Resources/Fonts, converted from the web build's woff2 files)
    public static class Fonts
    {
        static readonly Dictionary<string, Font> cache = new Dictionary<string, Font>();
        static Font fallback;
        public static Font Get(string n)
        {
            if (cache.TryGetValue(n, out var f) && f != null) return f;
            f = Resources.Load<Font>("Fonts/" + n);
            if (f == null)
            {
                if (fallback == null) fallback = Font.CreateDynamicFontFromOSFont(new[] { "Arial", "Helvetica", "Liberation Sans", "DejaVu Sans" }, 16);
                f = fallback;
            }
            cache[n] = f;
            return f;
        }
        public static Font Cond(int w = 600) => Get("Cond-" + (w <= 400 ? 400 : w <= 500 ? 500 : w <= 600 ? 600 : 700));
        public static Font Body(int w = 400) => Get("Body-" + (w <= 400 ? 400 : w <= 500 ? 500 : 600));
    }

    public static class Sprites
    {
        static Sprite round, ring, ring2, white, disc;
        // 9-sliced rounded rect (radius 3, like .panel { border-radius: 3px })
        public static Sprite Round => round ? round : (round = Make(16, 3, 0));
        public static Sprite Ring => ring ? ring : (ring = Make(16, 3, 1));
        public static Sprite Ring2 => ring2 ? ring2 : (ring2 = Make(16, 4, 2));
        public static Sprite White => white ? white : (white = Make(4, 0, 0));
        public static Sprite Disc => disc ? disc : (disc = MakeDisc(64));

        static Sprite Make(int size, int rad, int thick)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, hideFlags = HideFlags.HideAndDontSave };
            var px = new Color32[size * size];
            float h = size / 2f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d;
                    if (rad <= 0) d = -10;
                    else
                    {
                        float qx = Mathf.Abs(x + 0.5f - h) - (h - rad), qy = Mathf.Abs(y + 0.5f - h) - (h - rad);
                        d = Mathf.Min(Mathf.Max(qx, qy), 0) + new Vector2(Mathf.Max(qx, 0), Mathf.Max(qy, 0)).magnitude - rad;
                    }
                    float a = Mathf.Clamp01(0.5f - d);
                    if (thick > 0) a *= Mathf.Clamp01(d + thick + 0.5f);
                    px[y * size + x] = new Color32(255, 255, 255, (byte)Mathf.RoundToInt(a * 255));
                }
            t.SetPixels32(px); t.Apply(false, true);
            int b = Mathf.Max(1, rad + thick + 1);
            if (rad <= 0 && thick <= 0) b = 1;
            return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(.5f, .5f), 100, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }
        static Sprite MakeDisc(int size)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, hideFlags = HideFlags.HideAndDontSave };
            var px = new Color32[size * size];
            float h = size / 2f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = new Vector2(x + .5f - h, y + .5f - h).magnitude - (h - 1);
                    px[y * size + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(0.5f - d) * 255));
                }
            t.SetPixels32(px); t.Apply(false, true);
            return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(.5f, .5f), 100);
        }
    }

    public static class Tex
    {
        // linear gradient: stops as (position 0..1, colour); horizontal = left→right, else top→bottom
        public static Texture2D Gradient(bool horizontal, params (float p, Color c)[] stops)
        {
            const int n = 256;
            var t = horizontal ? new Texture2D(n, 1, TextureFormat.RGBA32, false) : new Texture2D(1, n, TextureFormat.RGBA32, false);
            t.wrapMode = TextureWrapMode.Clamp; t.hideFlags = HideFlags.HideAndDontSave;
            var px = new Color[n];
            for (int i = 0; i < n; i++)
            {
                float f = i / (n - 1f);
                if (!horizontal) f = 1 - f; // texture rows go bottom→top; css gradients run top→bottom
                px[i] = Sample(stops, f);
            }
            t.SetPixels(px); t.Apply(false, true);
            return t;
        }
        public static Color Sample((float p, Color c)[] s, float f)
        {
            if (f <= s[0].p) return s[0].c;
            for (int i = 1; i < s.Length; i++)
                if (f <= s[i].p) return Color.Lerp(s[i - 1].c, s[i].c, Mathf.InverseLerp(s[i - 1].p, s[i].p, f));
            return s[s.Length - 1].c;
        }
        public static Texture2D Vignette()
        {
            int w = 256, h = 144;
            var t = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, hideFlags = HideFlags.HideAndDontSave };
            var px = new Color[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float fx = x / (w - 1f), fy = 1 - y / (h - 1f);
                    float dx = (fx - 0.5f) / (0.5f * 1.414f), dy = (fy - 0.55f) / (0.55f * 1.414f);
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    px[y * w + x] = new Color(0, 0, 0, Mathf.Clamp01((d - 0.55f) / 0.45f) * 0.55f);
                }
            t.SetPixels(px); t.Apply(false, true);
            return t;
        }
        public static Texture2D Grain()
        {
            var t = new Texture2D(128, 128, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Repeat, hideFlags = HideFlags.HideAndDontSave };
            var R = new Rng(3);
            var px = new Color32[128 * 128];
            for (int i = 0; i < px.Length; i++) { byte v = (byte)(R.Next() * 255); px[i] = new Color32(v, v, v, 255); }
            t.SetPixels32(px); t.Apply(false, true);
            return t;
        }
    }

    // builders
    public static class K
    {
        public static RectTransform Node(Transform parent, string name = "n")
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            var r = (RectTransform)go.transform;
            r.SetParent(parent, false);
            return r;
        }
        public static RectTransform Fill(this RectTransform r, float l = 0, float t = 0, float rr = 0, float b = 0)
        {
            r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one; r.pivot = new Vector2(.5f, .5f);
            r.offsetMin = new Vector2(l, b); r.offsetMax = new Vector2(-rr, -t);
            return r;
        }
        // a box anchored (and pivoted) at (ax, ay) of the parent (0..1, y up), offset (x, y), size (w, h)
        public static RectTransform At(this RectTransform r, float ax, float ay, float x, float y, float w, float h)
        {
            r.anchorMin = r.anchorMax = r.pivot = new Vector2(ax, ay);
            r.anchoredPosition = new Vector2(x, y); r.sizeDelta = new Vector2(w, h);
            return r;
        }
        // stretch between anchors with insets (css left/top/right/bottom on a positioned box)
        public static RectTransform Span(this RectTransform r, float axMin, float ayMin, float axMax, float ayMax, float l, float t, float rr, float b)
        {
            r.anchorMin = new Vector2(axMin, ayMin); r.anchorMax = new Vector2(axMax, ayMax); r.pivot = new Vector2(.5f, .5f);
            r.offsetMin = new Vector2(l, b); r.offsetMax = new Vector2(-rr, -t);
            return r;
        }
        public static RectTransform RT(this Component c) => (RectTransform)c.transform;

        public static Image Img(Transform p, Color c, Sprite s = null, string name = "img", bool ray = false)
        {
            var r = Node(p, name);
            var i = r.gameObject.AddComponent<Image>();
            i.sprite = s; i.color = c; i.raycastTarget = ray;
            if (s != null && s.border != Vector4.zero) i.type = Image.Type.Sliced;
            return i;
        }
        // .panel: rounded background with a 1px border
        public static Image Panel(Transform p, string name, Color? bgc = null, Color? border = null, bool ray = true)
        {
            var i = Img(p, bgc ?? Pal.bg, Sprites.Round, name, ray);
            var b = Img(i.transform, border ?? Pal.line, Sprites.Ring, "border");
            b.RT().Fill();
            b.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            return i;
        }
        public static Image Border(Transform p, Color c, float grow = 0)
        {
            var b = Img(p, c, Sprites.Ring, "border");
            b.RT().Fill(-grow, -grow, -grow, -grow);
            b.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            return b;
        }

        public static Text Txt(Transform p, string s, Font f, float size, Color c, TextAnchor a = TextAnchor.UpperLeft, float em = 0, bool wrap = false, string name = "t")
        {
            var r = Node(p, name);
            var t = r.gameObject.AddComponent<Text>();
            t.font = f; t.fontSize = Mathf.Max(1, Mathf.RoundToInt(size)); t.color = c; t.alignment = a;
            t.supportRichText = true; t.raycastTarget = false;
            t.horizontalOverflow = wrap ? HorizontalWrapMode.Wrap : HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.lineSpacing = 1;
            t.text = s ?? "";
            if (em != 0) r.gameObject.AddComponent<Tracking>().em = em;
            return t;
        }
        public static Text Cond(Transform p, string s, float size, Color c, int w = 600, float em = 0, TextAnchor a = TextAnchor.UpperLeft) => Txt(p, s, Fonts.Cond(w), size, c, a, em);
        public static Text Body(Transform p, string s, float size, Color c, int w = 400, bool wrap = true, TextAnchor a = TextAnchor.UpperLeft) => Txt(p, s, Fonts.Body(w), size, c, a, 0, wrap);

        public static LayoutElement LE(Component c, float pw = -1, float ph = -1, float fw = -1, float fh = -1, float mw = -1, float mh = -1)
        {
            var e = c.GetComponent<LayoutElement>(); if (!e) e = c.gameObject.AddComponent<LayoutElement>();
            e.preferredWidth = pw; e.preferredHeight = ph; e.flexibleWidth = fw; e.flexibleHeight = fh; e.minWidth = mw; e.minHeight = mh;
            return e;
        }
        public static VerticalLayoutGroup V(Component c, float gap = 0, int l = 0, int r = 0, int t = 0, int b = 0, TextAnchor align = TextAnchor.UpperLeft, bool expandW = true)
        {
            var g = c.gameObject.AddComponent<VerticalLayoutGroup>();
            g.spacing = gap; g.padding = new RectOffset(l, r, t, b); g.childAlignment = align;
            g.childControlWidth = true; g.childControlHeight = true; g.childForceExpandWidth = expandW; g.childForceExpandHeight = false;
            return g;
        }
        public static HorizontalLayoutGroup H(Component c, float gap = 0, int l = 0, int r = 0, int t = 0, int b = 0, TextAnchor align = TextAnchor.MiddleLeft, bool expandH = false)
        {
            var g = c.gameObject.AddComponent<HorizontalLayoutGroup>();
            g.spacing = gap; g.padding = new RectOffset(l, r, t, b); g.childAlignment = align;
            g.childControlWidth = true; g.childControlHeight = true; g.childForceExpandWidth = false; g.childForceExpandHeight = expandH;
            return g;
        }
        public static ContentSizeFitter Fit(Component c, bool w, bool h)
        {
            var f = c.gameObject.AddComponent<ContentSizeFitter>();
            f.horizontalFit = w ? ContentSizeFitter.FitMode.PreferredSize : ContentSizeFitter.FitMode.Unconstrained;
            f.verticalFit = h ? ContentSizeFitter.FitMode.PreferredSize : ContentSizeFitter.FitMode.Unconstrained;
            return f;
        }
        public static RectTransform Row(Transform p, float gap = 0, string name = "row", TextAnchor align = TextAnchor.MiddleLeft)
        {
            var r = Node(p, name); H(r, gap, 0, 0, 0, 0, align); return r;
        }
        public static RectTransform Col(Transform p, float gap = 0, string name = "col")
        {
            var r = Node(p, name); V(r, gap); return r;
        }
        public static RectTransform Spacer(Transform p, float w = -1, float h = -1, float fw = -1, float fh = -1)
        {
            var r = Node(p, "sp"); LE(r, w, h, fw, fh); return r;
        }
        public static Image HLine(Transform p, Color c, float h = 1)
        {
            var i = Img(p, c, Sprites.White, "hr"); LE(i, -1, h, 1, -1, -1, h); return i;
        }
        public static void Clear(Transform t)
        {
            for (int i = t.childCount - 1; i >= 0; i--)
            {
                var ch = t.GetChild(i).gameObject;
                ch.SetActive(false);
                UnityEngine.Object.Destroy(ch);
            }
        }

        // a vertically scrolling list; content gets a VerticalLayoutGroup
        public static ScrollRect Scroll(Transform p, out RectTransform content, bool vertical = true, string name = "scroll")
        {
            var sr = Node(p, name);
            var s = sr.gameObject.AddComponent<ScrollRect>();
            var vp = Node(sr, "viewport").Fill();
            vp.gameObject.AddComponent<RectMask2D>();
            var vi = vp.gameObject.AddComponent<Image>(); vi.color = Pal.clear; vi.raycastTarget = true;
            content = Node(vp, "content");
            if (vertical)
            {
                content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1); content.pivot = new Vector2(.5f, 1);
                content.sizeDelta = Vector2.zero; content.anchoredPosition = Vector2.zero;
                V(content);
                Fit(content, false, true);
            }
            else
            {
                content.anchorMin = new Vector2(0, 0); content.anchorMax = new Vector2(0, 1); content.pivot = new Vector2(0, .5f);
                content.sizeDelta = Vector2.zero; content.anchoredPosition = Vector2.zero;
                var h = H(content, 0, 0, 0, 0, 0, TextAnchor.MiddleLeft, true);
                Fit(content, true, false);
            }
            s.viewport = vp; s.content = content; s.horizontal = !vertical; s.vertical = vertical;
            s.movementType = ScrollRect.MovementType.Clamped; s.scrollSensitivity = 40; s.inertia = true; s.decelerationRate = 0.12f;
            return s;
        }
        public static void ScrollIntoView(ScrollRect s, RectTransform item, bool smooth = false)
        {
            if (s == null || item == null || s.content == null) return;
            Canvas.ForceUpdateCanvases();
            var vp = s.viewport ? s.viewport : (RectTransform)s.transform;
            var b = RectTransformUtility.CalculateRelativeRectTransformBounds(vp, item);
            var vr = vp.rect;
            var pos = s.content.anchoredPosition;
            if (s.vertical)
            {
                if (b.max.y > vr.yMax) pos.y -= b.max.y - vr.yMax + 6;
                else if (b.min.y < vr.yMin) pos.y += vr.yMin - b.min.y + 6;
                float maxY = Mathf.Max(0, s.content.rect.height - vr.height);
                pos.y = Mathf.Clamp(pos.y, 0, maxY);
            }
            if (s.horizontal)
            {
                float c = (b.min.x + b.max.x) / 2, vc = (vr.xMin + vr.xMax) / 2;
                if (b.min.x < vr.xMin + 40 || b.max.x > vr.xMax - 40) pos.x -= c - vc;
                float maxX = Mathf.Max(0, s.content.rect.width - vr.width);
                pos.x = Mathf.Clamp(pos.x, -maxX, 0);
            }
            s.velocity = Vector2.zero;
            s.content.anchoredPosition = pos;
        }

        // html snippets of the web UI → uGUI rich text
        static readonly Regex tagRx = new Regex("<[^>]+>", RegexOptions.Compiled);
        public static string Rich(string html, Color? bold = null, Color? em = null)
        {
            if (string.IsNullOrEmpty(html)) return "";
            string s = html.Replace("<br>", "\n").Replace("<br/>", "\n");
            string bOpen = bold.HasValue ? "<color=" + Pal.Hex(bold.Value) + "><b>" : "<b>", bClose = bold.HasValue ? "</b></color>" : "</b>";
            var sb = new StringBuilder();
            int i = 0;
            foreach (Match m in tagRx.Matches(s))
            {
                sb.Append(s, i, m.Index - i);
                i = m.Index + m.Length;
                string t = m.Value.ToLowerInvariant();
                if (t == "<b>" || t.StartsWith("<b ")) sb.Append(bOpen);
                else if (t == "</b>") sb.Append(bClose);
                else if (t == "<em>") sb.Append("  <color=" + Pal.Hex(em ?? Pal.green) + ">");
                else if (t == "</em>") sb.Append("</color>");
                else if (t == "<kbd>") sb.Append(" <color=" + Pal.Hex(Pal.ink) + ">");
                else if (t == "</kbd>") sb.Append("</color> ");
                else if (t == "<small>") sb.Append("\n<size=12><color=" + Pal.Hex(Pal.ink2) + ">");
                else if (t == "</small>") sb.Append("</color></size>");
            }
            sb.Append(s, i, s.Length - i);
            return Decode(sb.ToString());
        }
        public static string Plain(string html) => string.IsNullOrEmpty(html) ? "" : Decode(tagRx.Replace(html.Replace("<br>", "\n"), ""));
        public static string Decode(string s) => s.Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">").Replace("&quot;", "\"").Replace("&#39;", "'").Replace("&nbsp;", " ");
        // escape '<' so text from other players can't inject rich text
        public static string Esc(string s) => string.IsNullOrEmpty(s) ? "" : s.Replace("<", "<​");
    }

    public static class Tex2
    {
        // diagonal 135deg gradient tile (paint swatches)
        public static Texture2D Diagonal(params (float p, Color c)[] stops)
        {
            int n = 64;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, hideFlags = HideFlags.HideAndDontSave };
            var px = new Color[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                    px[y * n + x] = Tex.Sample(stops, (x + (n - 1 - y)) / (2f * (n - 1)));
            t.SetPixels(px); t.Apply(false, true);
            return t;
        }
    }
}

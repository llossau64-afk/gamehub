// Look of css/style.css for uGUI: palette, fonts, generated sprites/textures and small
// builders used by UI.cs. Everything is created from code at runtime.
using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;
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
            var e = c.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
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

    // css letter-spacing for legacy Text (offsets glyph quads per line)
    [DisallowMultipleComponent]
    public sealed class Tracking : BaseMeshEffect, ILayoutElement
    {
        public float em;
        Text txt;
        static readonly List<UIVertex> vs = new List<UIVertex>();
        Text T => txt ? txt : (txt = GetComponent<Text>());

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || em == 0 || T == null) return;
            float sp = em * T.fontSize;
            vs.Clear();
            vh.GetUIVertexStream(vs);
            int quads = vs.Count / 6;
            if (quads < 2) return;
            int align = (int)T.alignment % 3;
            int lineStart = 0, k = 0;
            float prevX = 0, lineTop = 0;
            var idx = new int[quads];
            for (int q = 0; q < quads; q++)
            {
                float x = Mathf.Min(vs[q * 6].position.x, vs[q * 6 + 4].position.x), y = Mathf.Max(vs[q * 6].position.y, vs[q * 6 + 1].position.y);
                if (q > lineStart && (x < prevX - 0.5f || y < lineTop - T.fontSize * 0.6f)) { ShiftLine(lineStart, q, k, sp, align, idx); lineStart = q; k = 0; }
                if (q == lineStart) lineTop = y;
                idx[q] = k++; prevX = x;
            }
            ShiftLine(lineStart, quads, k, sp, align, idx);
            vh.Clear();
            vh.AddUIVertexTriangleStream(vs);
        }
        static void ShiftLine(int a, int b, int n, float sp, int align, int[] idx)
        {
            float total = (n - 1) * sp;
            float shift = align == 1 ? -total / 2 : align == 2 ? -total : 0;
            for (int q = a; q < b; q++)
            {
                float dx = idx[q] * sp + shift;
                for (int j = 0; j < 6; j++) { var v = vs[q * 6 + j]; v.position.x += dx; vs[q * 6 + j] = v; }
            }
        }
        int LongestLine()
        {
            string s = K.Plain(T.text);
            int best = 0, cur = 0;
            foreach (char c in s) { if (c == '\n') { best = Mathf.Max(best, cur); cur = 0; } else if (c != ' ') cur++; }
            return Mathf.Max(best, cur);
        }
        public void CalculateLayoutInputHorizontal() { }
        public void CalculateLayoutInputVertical() { }
        public float minWidth => -1;
        public float preferredWidth => T == null || em == 0 ? -1 : T.preferredWidth + em * T.fontSize * Mathf.Max(0, LongestLine() - 1) + em * T.fontSize * 0.5f;
        public float flexibleWidth => -1;
        public float minHeight => -1;
        public float preferredHeight => -1;
        public float flexibleHeight => -1;
        public int layoutPriority => 2;
    }

    // Button whose look is painted by code (hover / keyboard focus / on / disabled)
    public class UiButton : Button
    {
        public Action<UiButton> paint;
        public Action onSubmitAlt;
        public bool on, hovered, pref;
        public string hoverSound = "hover";
        public Text label;
        public int st;
        public object tag;
        public static bool kbFocus;
        public bool Selected => EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject;
        public bool Focus => kbFocus && Selected && IsInteractable();
        public bool Hot => (hovered || Focus) && IsInteractable();

        protected override void DoStateTransition(SelectionState state, bool instant)
        {
            st = (int)state;
            paint?.Invoke(this);
        }
        public override void OnPointerEnter(PointerEventData e)
        {
            base.OnPointerEnter(e);
            hovered = true;
            if (IsInteractable() && hoverSound != null && !UI.Touching) AudioSys.A?.Ui(hoverSound);
            paint?.Invoke(this);
        }
        public override void OnPointerExit(PointerEventData e) { base.OnPointerExit(e); hovered = false; paint?.Invoke(this); }
        public override void OnPointerDown(PointerEventData e) { kbFocus = false; base.OnPointerDown(e); }
        public override void OnSelect(BaseEventData e)
        {
            base.OnSelect(e);
            if (e is AxisEventData) { kbFocus = true; AudioSys.A?.Ui("hover"); }
            var sr = GetComponentInParent<ScrollRect>();
            if (sr != null && kbFocus) K.ScrollIntoView(sr, (RectTransform)transform);
            paint?.Invoke(this);
        }
        public override void OnDeselect(BaseEventData e) { base.OnDeselect(e); paint?.Invoke(this); }
        public override void OnSubmit(BaseEventData e)
        {
            kbFocus = true;
            if (onSubmitAlt != null && IsInteractable()) { onSubmitAlt(); return; }
            base.OnSubmit(e);
        }
        public void Repaint() => paint?.Invoke(this);
        protected override void OnDisable() { hovered = false; base.OnDisable(); }
    }

    // keyboard-focusable slider with the amber focus ring
    public sealed class UiSlider : Slider
    {
        public Action<UiSlider> paint;
        protected override void DoStateTransition(SelectionState state, bool instant) { paint?.Invoke(this); }
        public override void OnSelect(BaseEventData e) { base.OnSelect(e); if (e is AxisEventData) { UiButton.kbFocus = true; AudioSys.A?.Ui("hover"); } paint?.Invoke(this); }
        public override void OnDeselect(BaseEventData e) { base.OnDeselect(e); paint?.Invoke(this); }
        public bool Focus => UiButton.kbFocus && EventSystem.current != null && EventSystem.current.currentSelectedGameObject == gameObject;
    }

    // .mitem / .gtab: dash + label that slide on hover and focus
    public sealed class MitemFx : MonoBehaviour
    {
        public UiButton b;
        public RectTransform dash, lab;
        public Image dashImg;
        public Text text;
        public float x0 = 26, x1 = 34, w0 = 12, w1 = 22;
        public Color c0, c1, d0, d1;
        float k;
        void Update()
        {
            float target = b != null && (b.Hot || b.on) ? 1 : 0;
            k = Mathf.MoveTowards(k, target, Time.unscaledDeltaTime / 0.22f);
            float e = k * k * (3 - 2 * k);
            if (lab) lab.anchoredPosition = new Vector2(Mathf.Lerp(x0, x1, e), lab.anchoredPosition.y);
            if (dash) dash.sizeDelta = new Vector2(Mathf.Lerp(w0, w1, e), 1);
            if (dashImg) dashImg.color = Color.Lerp(d0, d1, e);
            if (text) text.color = Color.Lerp(c0, c1, e);
        }
    }

    // on-screen driving button: sets the GameInput touch field while held
    public sealed class TouchBtn : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        public Action<float> set;
        public Image bg, border;
        public Text text;
        bool down;
        public void OnPointerDown(PointerEventData e) { down = true; set?.Invoke(1); UI.Touching = true; Paint(); }
        public void OnPointerUp(PointerEventData e) { Release(); }
        public void OnPointerExit(PointerEventData e) { Release(); }
        void Release() { if (!down) return; down = false; set?.Invoke(0); Paint(); }
        void OnDisable() { if (down) { down = false; set?.Invoke(0); } Paint(); }
        public void Paint()
        {
            if (bg) bg.color = down ? Pal.C(235, 230, 218, .18f) : Pal.C(13, 14, 15, .35f);
            if (border) border.color = down ? Pal.ink : Pal.line2;
            if (text) text.color = down ? Pal.ink : Pal.ink2;
        }
    }

    // sizes a GridLayoutGroup's cells like css `repeat(auto-fill, minmax(min, 1fr))`
    public sealed class GridFit : MonoBehaviour
    {
        public GridLayoutGroup grid;
        public RectTransform viewport;
        public float min = 168, height = 150;
        float lastW = -1;
        void LateUpdate()
        {
            float w = viewport ? viewport.rect.width : ((RectTransform)transform).rect.width;
            if (Mathf.Abs(w - lastW) < 0.5f || w <= 0) return;
            lastW = w;
            float gap = grid.spacing.x;
            int cols = Mathf.Max(1, Mathf.FloorToInt((w + gap) / (min + gap)));
            grid.cellSize = new Vector2((w - gap * (cols - 1)) / cols, height);
            grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
            grid.constraintCount = cols;
        }
    }

    // a scroll area that grows with its content up to a maximum height (css max-height + overflow:auto)
    public sealed class FitScroll : MonoBehaviour
    {
        public LayoutElement le;
        public RectTransform content;
        public Func<float> max;
        void LateUpdate()
        {
            if (!le || !content) return;
            float h = LayoutUtility.GetPreferredHeight(content);
            float m = max != null ? max() : 800;
            float v = Mathf.Min(h, m);
            if (Mathf.Abs(le.preferredHeight - v) > 0.5f) le.preferredHeight = v;
        }
    }

    // 2D vector drawing (canvas-2d style, y down) used for the speedo, minimap, outlines and silhouettes
    public sealed class Vec2D : MaskableGraphic
    {
        public Vector2 design = new Vector2(100, 100);
        readonly List<Vector2> P = new List<Vector2>();
        readonly List<Color32> C = new List<Color32>();
        readonly List<int> I = new List<int>();

        public void Clear() { P.Clear(); C.Clear(); I.Clear(); SetVerticesDirty(); }
        public void Commit() => SetVerticesDirty();
        int Vx(Vector2 p, Color c) { P.Add(p); C.Add(c); return P.Count - 1; }
        void Tri(int a, int b, int c) { I.Add(a); I.Add(b); I.Add(c); }

        public void Quad(Vector2 a, Vector2 b, Vector2 c, Vector2 d, Color col)
        {
            int i = Vx(a, col); Vx(b, col); Vx(c, col); Vx(d, col);
            Tri(i, i + 1, i + 2); Tri(i, i + 2, i + 3);
        }
        public void Seg(Vector2 a, Vector2 b, float w, Color col)
        {
            var d = b - a; float L = d.magnitude;
            if (L < 1e-5f) return;
            var n = new Vector2(-d.y, d.x) / L * (w / 2);
            Quad(a + n, b + n, b - n, a - n, col);
        }
        public void Line(float x0, float y0, float x1, float y1, float w, Color col) => Seg(new Vector2(x0, y0), new Vector2(x1, y1), w, col);
        public void Disc(Vector2 c, float r, Color col, int seg = 0)
        {
            if (r <= 0) return;
            seg = seg > 0 ? seg : Mathf.Clamp((int)(r * 2.2f), 8, 40);
            int o = Vx(c, col);
            for (int i = 0; i <= seg; i++) { float a = i * Mathf.PI * 2 / seg; Vx(c + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r, col); }
            for (int i = 0; i < seg; i++) Tri(o, o + 1 + i, o + 2 + i);
        }
        public void Ellipse(float cx, float cy, float rx, float ry, Color col, int seg = 28)
        {
            int o = Vx(new Vector2(cx, cy), col);
            for (int i = 0; i <= seg; i++) { float a = i * Mathf.PI * 2 / seg; Vx(new Vector2(cx + Mathf.Cos(a) * rx, cy + Mathf.Sin(a) * ry), col); }
            for (int i = 0; i < seg; i++) Tri(o, o + 1 + i, o + 2 + i);
        }
        public void Ring(Vector2 c, float r, float w, Color col) => Arc(c.x, c.y, r, 0, Mathf.PI * 2, w, col);
        public void Stroke(IList<Vector2> pts, float w, Color col, bool closed = false, bool round = true)
        {
            int n = pts.Count;
            if (n < 2) return;
            for (int i = 0; i < n - 1; i++) Seg(pts[i], pts[i + 1], w, col);
            if (closed) Seg(pts[n - 1], pts[0], w, col);
            if (round && w > 2.5f) for (int i = 0; i < n; i++) Disc(pts[i], w / 2, col, 8);
        }
        public void Arc(float cx, float cy, float r, float a0, float a1, float w, Color col)
        {
            int n = Mathf.Max(2, Mathf.CeilToInt(Mathf.Abs(a1 - a0) * r / 3));
            float ri = r - w / 2, ro = r + w / 2;
            int o = P.Count;
            for (int i = 0; i <= n; i++)
            {
                float a = Mathf.Lerp(a0, a1, i / (float)n), ca = Mathf.Cos(a), sa = Mathf.Sin(a);
                Vx(new Vector2(cx + ca * ri, cy + sa * ri), col);
                Vx(new Vector2(cx + ca * ro, cy + sa * ro), col);
            }
            for (int i = 0; i < n; i++) { int k = o + i * 2; Tri(k, k + 1, k + 3); Tri(k, k + 3, k + 2); }
        }
        public void Rect(float x, float y, float w, float h, Color col) => Quad(new Vector2(x, y), new Vector2(x + w, y), new Vector2(x + w, y + h), new Vector2(x, y + h), col);
        // filled polygon (fan from the centroid), vertical gradient top→bottom
        public void Poly(IList<Vector2> pts, Color top, Color bot, float yTop, float yBot)
        {
            int n = pts.Count;
            if (n < 3) return;
            Vector2 c = Vector2.zero;
            foreach (var p in pts) c += p;
            c /= n;
            Color G(float y) => Color.Lerp(top, bot, Mathf.InverseLerp(yTop, yBot, y));
            int o = Vx(c, G(c.y));
            for (int i = 0; i < n; i++) Vx(pts[i], G(pts[i].y));
            for (int i = 0; i < n; i++) Tri(o, o + 1 + i, o + 1 + (i + 1) % n);
        }
        public void Poly(IList<Vector2> pts, Color col) => Poly(pts, col, col, 0, 1);

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            var r = rectTransform.rect;
            float sx = r.width / Mathf.Max(1e-3f, design.x), sy = r.height / Mathf.Max(1e-3f, design.y);
            var v = UIVertex.simpleVert;
            Color32 tint = color;
            int n = Mathf.Min(P.Count, 64000);
            for (int i = 0; i < n; i++)
            {
                v.position = new Vector3(r.xMin + P[i].x * sx, r.yMax - P[i].y * sy);
                var c = C[i];
                v.color = new Color32((byte)(c.r * tint.r / 255), (byte)(c.g * tint.g / 255), (byte)(c.b * tint.b / 255), (byte)(c.a * tint.a / 255));
                vh.AddVert(v);
            }
            for (int i = 0; i + 2 < I.Count; i += 3)
                if (I[i] < n && I[i + 1] < n && I[i + 2] < n) vh.AddTriangle(I[i], I[i + 1], I[i + 2]);
        }
    }
}

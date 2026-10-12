using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Downfall.Audio;

namespace Downfall
{
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

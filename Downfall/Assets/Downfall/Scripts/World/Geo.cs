// Small three.js-style geometry library for the procedural world (world.js, props.js,
// circuit.js). Geometry is built in GAME coordinates with three.js conventions (same
// primitives, vertex order, uv layout, normals and CCW winding), transformed and merged
// like BufferGeometry, and only converted to a Unity mesh at the end (ToMesh: mirrors x
// and flips the winding, exactly like Coord.ApplyToMesh).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Downfall
{
    public sealed class Geo
    {
        public readonly List<Vector3> v = new List<Vector3>();
        public readonly List<Vector3> n = new List<Vector3>();
        public readonly List<Vector2> uv = new List<Vector2>();
        public List<Color> c;                 // vertex colours (linear, like three.js); null = none
        public readonly List<int> idx = new List<int>();
        public bool nonIndexed;

        public int Count => v.Count;

        public int Add(Vector3 p, Vector3 nn, Vector2 t) { v.Add(p); n.Add(nn); uv.Add(t); c?.Add(Color.white); return v.Count - 1; }
        public int Add(double x, double y, double z) => Add(new Vector3((float)x, (float)y, (float)z), Vector3.up, Vector2.zero);
        public void Tri(int a, int b, int cc) { idx.Add(a); idx.Add(b); idx.Add(cc); }

        public Geo Clone()
        {
            var g = new Geo { nonIndexed = nonIndexed };
            g.v.AddRange(v); g.n.AddRange(n); g.uv.AddRange(uv); g.idx.AddRange(idx);
            if (c != null) g.c = new List<Color>(c);
            return g;
        }

        // ------------------------------------------------------------------ transforms (game space)
        public Geo Apply(Matrix4x4 m)
        {
            var nm = m.inverse.transpose;
            for (int i = 0; i < v.Count; i++)
            {
                v[i] = m.MultiplyPoint3x4(v[i]);
                var nn = nm.MultiplyVector(n[i]);
                n[i] = nn.sqrMagnitude > 0 ? nn.normalized : nn;
            }
            return this;
        }
        public Geo Translate(double x, double y, double z)
        {
            var d = new Vector3((float)x, (float)y, (float)z);
            for (int i = 0; i < v.Count; i++) v[i] += d;
            return this;
        }
        public Geo Scale(double x, double y, double z) => Apply(Matrix4x4.Scale(new Vector3((float)x, (float)y, (float)z)));
        public Geo RotateX(double a) => Apply(Matrix4x4.Rotate(G.Axis(1, 0, 0, a)));
        public Geo RotateY(double a) => Apply(Matrix4x4.Rotate(G.Axis(0, 1, 0, a)));
        public Geo RotateZ(double a) => Apply(Matrix4x4.Rotate(G.Axis(0, 0, 1, a)));
        public Geo Rotate(Quaternion q) => Apply(Matrix4x4.Rotate(q));

        public Geo ToNonIndexed()
        {
            if (nonIndexed) return this;
            var g = new Geo { nonIndexed = true };
            if (c != null) g.c = new List<Color>(idx.Count);
            for (int i = 0; i < idx.Count; i++)
            {
                int k = idx[i];
                g.v.Add(v[k]); g.n.Add(n[k]); g.uv.Add(uv[k]); g.c?.Add(c[k]);
                g.idx.Add(i);
            }
            return g;
        }

        // three.js computeVertexNormals: area-weighted for indexed, flat for non-indexed geometry
        public Geo ComputeNormals()
        {
            var acc = new Vector3[v.Count];
            for (int i = 0; i + 2 < idx.Count; i += 3)
            {
                int a = idx[i], b = idx[i + 1], cc = idx[i + 2];
                var fn = Vector3.Cross(v[cc] - v[b], v[a] - v[b]);
                acc[a] += fn; acc[b] += fn; acc[cc] += fn;
            }
            for (int i = 0; i < v.Count; i++) n[i] = acc[i].sqrMagnitude > 0 ? acc[i].normalized : Vector3.up;
            return this;
        }

        public delegate void ColorFn(ref Color col, float x, float y, float z, int i);
        public Geo Colorize(ColorFn fn)
        {
            c = new List<Color>(v.Count);
            for (int i = 0; i < v.Count; i++) { var col = Color.white; fn(ref col, v[i].x, v[i].y, v[i].z, i); c.Add(col); }
            return this;
        }
        public Geo ColorAll(Color col) { c = new List<Color>(v.Count); for (int i = 0; i < v.Count; i++) c.Add(col); return this; }

        public void Append(Geo o)
        {
            int b = v.Count;
            if (o.c != null && c == null) { c = new List<Color>(v.Count + o.Count); for (int i = 0; i < b; i++) c.Add(Color.white); }
            v.AddRange(o.v); n.AddRange(o.n); uv.AddRange(o.uv);
            if (c != null) { if (o.c != null) c.AddRange(o.c); else for (int i = 0; i < o.Count; i++) c.Add(Color.white); }
            for (int i = 0; i < o.idx.Count; i++) idx.Add(o.idx[i] + b);
        }

        public static Geo Merge(IList<Geo> list)
        {
            var g = new Geo();
            bool ni = list.Count > 0;
            foreach (var p in list) { g.Append(p); ni &= p.nonIndexed; }
            g.nonIndexed = ni;
            return g;
        }

        /// <summary>Unity mesh (x mirrored, winding flipped). Normals are taken from the geometry.</summary>
        public Mesh ToMesh(string name = "geo")
        {
            var m = new Mesh { name = name };
            int nv = v.Count;
            var uv3 = new Vector3[nv]; var un = new Vector3[nv];
            for (int i = 0; i < nv; i++) { uv3[i] = Coord.ToUnity(v[i]); un[i] = Coord.ToUnity(n[i]); }
            if (nv > 65535) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.vertices = uv3;
            m.normals = un;
            m.uv = uv.ToArray();
            if (c != null) m.colors = c.ToArray();
            var t = new int[idx.Count];
            for (int i = 0; i + 2 < t.Length; i += 3) { t[i] = idx[i]; t[i + 1] = idx[i + 2]; t[i + 2] = idx[i + 1]; }
            m.triangles = t;
            m.RecalculateBounds();
            return m;
        }

        // =================================================================== primitives (three.js)
        public static Geo Box(double w, double h, double d)
        {
            var g = new Geo();
            void Plane(int u, int vv, int ww, float udir, float vdir, float width, float height, float depth)
            {
                int b = g.Count;
                for (int iy = 0; iy <= 1; iy++)
                {
                    float y = iy * height - height / 2;
                    for (int ix = 0; ix <= 1; ix++)
                    {
                        float x = ix * width - width / 2;
                        var p = Vector3.zero; p[u] = x * udir; p[vv] = y * vdir; p[ww] = depth / 2;
                        var nn = Vector3.zero; nn[ww] = depth > 0 ? 1 : -1;
                        g.Add(p, nn, new Vector2(ix, 1 - iy));
                    }
                }
                int a0 = b, b0 = b + 2, c0 = b + 3, d0 = b + 1;
                g.Tri(a0, b0, d0); g.Tri(b0, c0, d0);
            }
            float W = (float)w, H = (float)h, D = (float)d;
            Plane(2, 1, 0, -1, -1, D, H, W);
            Plane(2, 1, 0, 1, -1, D, H, -W);
            Plane(0, 2, 1, 1, 1, W, D, H);
            Plane(0, 2, 1, 1, -1, W, D, -H);
            Plane(0, 1, 2, 1, -1, W, H, D);
            Plane(0, 1, 2, -1, -1, W, H, -D);
            return g;
        }

        public static Geo Cylinder(double rt, double rb, double h, int radial = 32, int hs = 1, bool open = false, double thetaStart = 0, double thetaLen = Math.PI * 2)
        {
            var g = new Geo();
            float half = (float)h / 2;
            float slope = (float)((rb - rt) / h);
            var grid = new int[hs + 1, radial + 1];
            for (int y = 0; y <= hs; y++)
            {
                float vv = (float)y / hs;
                float r = (float)(vv * (rb - rt) + rt);
                for (int x = 0; x <= radial; x++)
                {
                    float u = (float)x / radial;
                    double th = u * thetaLen + thetaStart;
                    float s = (float)Math.Sin(th), co = (float)Math.Cos(th);
                    grid[y, x] = g.Add(new Vector3(r * s, -vv * (float)h + half, r * co), new Vector3(s, slope, co).normalized, new Vector2(u, 1 - vv));
                }
            }
            for (int x = 0; x < radial; x++)
                for (int y = 0; y < hs; y++)
                {
                    int a = grid[y, x], b = grid[y + 1, x], c = grid[y + 1, x + 1], d = grid[y, x + 1];
                    if (rt > 0 || y != 0) g.Tri(a, b, d);
                    if (rb > 0 || y != hs - 1) g.Tri(b, c, d);
                }
            if (!open)
            {
                void Cap(bool top)
                {
                    float sign = top ? 1 : -1; float r = (float)(top ? rt : rb);
                    int c0 = g.Count;
                    for (int x = 1; x <= radial; x++) g.Add(new Vector3(0, half * sign, 0), new Vector3(0, sign, 0), new Vector2(0.5f, 0.5f));
                    int e0 = g.Count;
                    for (int x = 0; x <= radial; x++)
                    {
                        float u = (float)x / radial; double th = u * thetaLen + thetaStart;
                        float co = (float)Math.Cos(th), s = (float)Math.Sin(th);
                        g.Add(new Vector3(r * s, half * sign, r * co), new Vector3(0, sign, 0), new Vector2(co * 0.5f + 0.5f, s * 0.5f * sign + 0.5f));
                    }
                    for (int x = 0; x < radial; x++)
                    {
                        int c = c0 + x, i = e0 + x;
                        if (top) g.Tri(i, i + 1, c); else g.Tri(i + 1, i, c);
                    }
                }
                if (rt > 0) Cap(true);
                if (rb > 0) Cap(false);
            }
            return g;
        }

        public static Geo Cone(double r, double h, int radial = 32, int hs = 1, bool open = false) => Cylinder(0, r, h, radial, hs, open);

        public static Geo Plane(double w, double h, int ws = 1, int hs = 1)
        {
            var g = new Geo();
            float sw = (float)w / ws, sh = (float)h / hs;
            for (int iy = 0; iy <= hs; iy++)
            {
                float y = iy * sh - (float)h / 2;
                for (int ix = 0; ix <= ws; ix++)
                    g.Add(new Vector3(ix * sw - (float)w / 2, -y, 0), new Vector3(0, 0, 1), new Vector2((float)ix / ws, 1 - (float)iy / hs));
            }
            for (int iy = 0; iy < hs; iy++)
                for (int ix = 0; ix < ws; ix++)
                {
                    int a = ix + (ws + 1) * iy, b = ix + (ws + 1) * (iy + 1), c = ix + 1 + (ws + 1) * (iy + 1), d = ix + 1 + (ws + 1) * iy;
                    g.Tri(a, b, d); g.Tri(b, c, d);
                }
            return g;
        }

        public static Geo Circle(double r, int seg)
        {
            var g = new Geo();
            g.Add(Vector3.zero, new Vector3(0, 0, 1), new Vector2(0.5f, 0.5f));
            for (int s = 0; s <= seg; s++)
            {
                double a = (double)s / seg * Math.PI * 2;
                float x = (float)(r * Math.Cos(a)), y = (float)(r * Math.Sin(a));
                g.Add(new Vector3(x, y, 0), new Vector3(0, 0, 1), new Vector2((x / (float)r + 1) / 2, (y / (float)r + 1) / 2));
            }
            for (int i = 1; i <= seg; i++) g.Tri(i, i + 1, 0);
            return g;
        }

        public static Geo Torus(double R, double r, int radial, int tubular, double arc = Math.PI * 2)
        {
            var g = new Geo();
            for (int j = 0; j <= radial; j++)
                for (int i = 0; i <= tubular; i++)
                {
                    double u = (double)i / tubular * arc, vv = (double)j / radial * Math.PI * 2;
                    var p = new Vector3((float)((R + r * Math.Cos(vv)) * Math.Cos(u)), (float)((R + r * Math.Cos(vv)) * Math.Sin(u)), (float)(r * Math.Sin(vv)));
                    var ctr = new Vector3((float)(R * Math.Cos(u)), (float)(R * Math.Sin(u)), 0);
                    g.Add(p, (p - ctr).normalized, new Vector2((float)i / tubular, (float)j / radial));
                }
            for (int j = 1; j <= radial; j++)
                for (int i = 1; i <= tubular; i++)
                {
                    int a = (tubular + 1) * j + i - 1, b = (tubular + 1) * (j - 1) + i - 1, c = (tubular + 1) * (j - 1) + i, d = (tubular + 1) * j + i;
                    g.Tri(a, b, d); g.Tri(b, c, d);
                }
            return g;
        }

        public static Geo Lathe(IList<Vector2> pts, int seg)
        {
            var g = new Geo();
            for (int i = 0; i <= seg; i++)
            {
                double phi = (double)i / seg * Math.PI * 2;
                float s = (float)Math.Sin(phi), co = (float)Math.Cos(phi);
                for (int j = 0; j < pts.Count; j++)
                    g.Add(new Vector3(pts[j].x * s, pts[j].y, pts[j].x * co), Vector3.up, new Vector2((float)i / seg, (float)j / (pts.Count - 1)));
            }
            int np = pts.Count;
            for (int i = 0; i < seg; i++)
                for (int j = 0; j < np - 1; j++)
                {
                    int b0 = j + i * np, a = b0, b = b0 + np, c = b0 + np + 1, d = b0 + 1;
                    g.Tri(a, b, d); g.Tri(c, d, b);
                }
            return g.ComputeNormals();
        }

        static readonly float T = (1 + Mathf.Sqrt(5)) / 2;
        static readonly float[] ICO_V = { -1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, 0, 0, -1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, T, 0, -1, T, 0, 1, -T, 0, -1, -T, 0, 1 };
        static readonly int[] ICO_I = { 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 };

        // PolyhedronGeometry(icosahedron): non-indexed, flat normals for detail 0, smooth (radial) otherwise
        public static Geo Icosahedron(double radius, int detail)
        {
            var g = new Geo { nonIndexed = true };
            Vector3 V(int i) => new Vector3(ICO_V[i * 3], ICO_V[i * 3 + 1], ICO_V[i * 3 + 2]);
            int cols = detail + 1;
            for (int f = 0; f < ICO_I.Length; f += 3)
            {
                Vector3 a = V(ICO_I[f]), b = V(ICO_I[f + 1]), c = V(ICO_I[f + 2]);
                var vv = new Vector3[cols + 1][];
                for (int i = 0; i <= cols; i++)
                {
                    var aj = Vector3.Lerp(a, c, (float)i / cols); var bj = Vector3.Lerp(b, c, (float)i / cols);
                    int rows = cols - i;
                    vv[i] = new Vector3[rows + 1];
                    for (int j = 0; j <= rows; j++) vv[i][j] = j == 0 && i == cols ? aj : Vector3.Lerp(aj, bj, rows == 0 ? 0 : (float)j / rows);
                }
                for (int i = 0; i < cols; i++)
                    for (int j = 0; j < 2 * (cols - i) - 1; j++)
                    {
                        int k = j / 2;
                        if (j % 2 == 0) { P(vv[i][k + 1]); P(vv[i + 1][k]); P(vv[i][k]); }
                        else { P(vv[i][k + 1]); P(vv[i + 1][k + 1]); P(vv[i + 1][k]); }
                    }
            }
            void P(Vector3 p)
            {
                var d = p.normalized;
                int i = g.Add(d * (float)radius, d, new Vector2(Mathf.Atan2(d.z, -d.x) / (2 * Mathf.PI) + 0.5f, Mathf.Asin(Mathf.Clamp(d.y, -1, 1)) / Mathf.PI + 0.5f));
                g.idx.Add(i);
            }
            if (detail == 0) g.ComputeNormals();
            return g;
        }

        // ExtrudeGeometry(shape, { depth, bevelEnabled: false }) — non-indexed, flat normals
        public static Geo Extrude(IList<Vector2> shape, double depth)
        {
            var pts = new List<Vector2>(shape);
            if (Area(pts) < 0) pts.Reverse();
            var tris = Triangulate(pts);
            var g = new Geo { nonIndexed = true };
            float D = (float)depth;
            void Pt(Vector2 p, float z, Vector2 t) { g.idx.Add(g.Add(new Vector3(p.x, p.y, z), Vector3.forward, t)); }
            for (int i = 0; i < tris.Count; i += 3)
            {
                Vector2 a = pts[tris[i]], b = pts[tris[i + 1]], c = pts[tris[i + 2]];
                Pt(c, 0, c); Pt(b, 0, b); Pt(a, 0, a);   // bottom (facing -z)
                Pt(a, D, a); Pt(b, D, b); Pt(c, D, c);   // top (facing +z)
            }
            float acc = 0;
            for (int i = 0; i < pts.Count; i++)
            {
                Vector2 pk = pts[(i - 1 + pts.Count) % pts.Count], pj = pts[i];
                float l = Vector2.Distance(pk, pj);
                Pt(pk, 0, new Vector2(acc, 0)); Pt(pj, 0, new Vector2(acc + l, 0)); Pt(pj, D, new Vector2(acc + l, D));
                Pt(pk, 0, new Vector2(acc, 0)); Pt(pj, D, new Vector2(acc + l, D)); Pt(pk, D, new Vector2(acc, D));
                acc += l;
            }
            return g.ComputeNormals();
        }

        // ShapeGeometry: flat face in the xy plane facing +z
        public static Geo Shape(IList<Vector2> shape)
        {
            var pts = new List<Vector2>(shape);
            if (Area(pts) < 0) pts.Reverse();
            var g = new Geo();
            foreach (var p in pts) g.Add(new Vector3(p.x, p.y, 0), Vector3.forward, p);
            var t = Triangulate(pts);
            for (int i = 0; i < t.Count; i += 3) g.Tri(t[i], t[i + 1], t[i + 2]);
            return g;
        }

        static float Area(List<Vector2> p)
        {
            float a = 0;
            for (int i = 0, j = p.Count - 1; i < p.Count; j = i++) a += p[j].x * p[i].y - p[i].x * p[j].y;
            return a / 2;
        }

        // ear clipping for a simple CCW polygon -> CCW triangles
        static List<int> Triangulate(List<Vector2> p)
        {
            var res = new List<int>();
            var ix = new List<int>();
            for (int i = 0; i < p.Count; i++) ix.Add(i);
            int guard = 0;
            while (ix.Count > 3 && guard++ < 1000)
            {
                bool clipped = false;
                for (int i = 0; i < ix.Count; i++)
                {
                    int a = ix[(i - 1 + ix.Count) % ix.Count], b = ix[i], c = ix[(i + 1) % ix.Count];
                    Vector2 A = p[a], B = p[b], C = p[c];
                    if ((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) <= 1e-9f) continue;
                    bool inside = false;
                    foreach (int q in ix)
                    {
                        if (q == a || q == b || q == c) continue;
                        if (InTri(p[q], A, B, C)) { inside = true; break; }
                    }
                    if (inside) continue;
                    res.Add(a); res.Add(b); res.Add(c);
                    ix.RemoveAt(i);
                    clipped = true;
                    break;
                }
                if (!clipped) break;
            }
            if (ix.Count == 3) { res.Add(ix[0]); res.Add(ix[1]); res.Add(ix[2]); }
            return res;
        }
        static bool InTri(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
        {
            float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
            float d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
            float d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
            bool neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
            return !(neg && pos);
        }

        // carModel.js beam(a, b, rad, seg): a cylinder from a to b
        public static Geo Beam(Vector3 a, Vector3 b, double rad, int seg = 6)
        {
            float len = Vector3.Distance(a, b);
            var g = Cylinder(rad, rad, len, seg, 1);
            g.Rotate(G.FromUnitVectors(Vector3.up, (b - a).normalized));
            var m = (a + b) * 0.5f;
            return g.Translate(m.x, m.y, m.z);
        }
        public static Geo Beam(double[] a, double[] b, double rad, int seg = 6) =>
            Beam(new Vector3((float)a[0], (float)a[1], (float)a[2]), new Vector3((float)b[0], (float)b[1], (float)b[2]), rad, seg);

        // props.js strip(ni(g)): non-indexed with uvs
        public Geo NI() => ToNonIndexed();
    }

    /// <summary>Game-space (right-handed, three.js) quaternion / matrix helpers. These are plain maths:
    /// the numbers are the three.js ones, conversion to Unity happens through Coord.</summary>
    public static class G
    {
        public static Quaternion Axis(double ax, double ay, double az, double angle)
        {
            double h = angle / 2, s = Math.Sin(h);
            return new Quaternion((float)(ax * s), (float)(ay * s), (float)(az * s), (float)Math.Cos(h));
        }
        public static Quaternion Yaw(double a) => Axis(0, 1, 0, a);

        // three.js Euler 'XYZ' -> quaternion
        public static Quaternion Euler(double x, double y, double z)
        {
            double c1 = Math.Cos(x / 2), c2 = Math.Cos(y / 2), c3 = Math.Cos(z / 2), s1 = Math.Sin(x / 2), s2 = Math.Sin(y / 2), s3 = Math.Sin(z / 2);
            return new Quaternion((float)(s1 * c2 * c3 + c1 * s2 * s3), (float)(c1 * s2 * c3 - s1 * c2 * s3), (float)(c1 * c2 * s3 + s1 * s2 * c3), (float)(c1 * c2 * c3 - s1 * s2 * s3));
        }

        public static Quaternion FromUnitVectors(Vector3 f, Vector3 t)
        {
            double r = Vector3.Dot(f, t) + 1;
            Quaternion q;
            if (r < 1e-6)
            {
                r = 0;
                q = Math.Abs(f.x) > Math.Abs(f.z) ? new Quaternion(-f.y, f.x, 0, (float)r) : new Quaternion(0, -f.z, f.y, (float)r);
            }
            else
            {
                var cr = Vector3.Cross(f, t);
                q = new Quaternion(cr.x, cr.y, cr.z, (float)r);
            }
            float l = Mathf.Sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
            return new Quaternion(q.x / l, q.y / l, q.z / l, q.w / l);
        }

        public static Matrix4x4 TRS(double x, double y, double z, Quaternion q, double sx = 1, double sy = 1, double sz = 1) =>
            Matrix4x4.TRS(new Vector3((float)x, (float)y, (float)z), q, new Vector3((float)sx, (float)sy, (float)sz));

        /// <summary>Game-space matrix to Unity space: S·M·S with S = diag(-1, 1, 1).</summary>
        public static Matrix4x4 ToUnity(Matrix4x4 m)
        {
            m.m01 = -m.m01; m.m02 = -m.m02; m.m03 = -m.m03;
            m.m10 = -m.m10; m.m20 = -m.m20; m.m30 = -m.m30;
            return m;
        }

        public static Vector3 V(double x, double y, double z) => new Vector3((float)x, (float)y, (float)z);

        /// <summary>sRGB hex to a linear colour (what three.js Color.setHex stores).</summary>
        public static Color Lin(int hex) => MatDef.Hex(hex).linear;
        public static Color Mul(Color c, float k) => new Color(c.r * k, c.g * k, c.b * k, c.a);
    }
}

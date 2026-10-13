// Procedural geometry for the gameplay visuals (car model fallback, wheels, upgrade parts,
// pickups, flames, podium, garage room). The builders mirror the three.js geometries the web
// build uses (BoxGeometry, CylinderGeometry, LatheGeometry, TorusGeometry, ...), with the same
// parameters and axis conventions, and work in *simulation space* (right-handed, +x = left).
// MGeo.ToMesh() crosses into Unity through Coord.ApplyToMesh (mirrors x, flips the winding).
//
// Quaternion.AngleAxis / FromToRotation / q * v are used here as plain quaternion maths on
// simulation-space vectors (the component formulas are handedness free); a simulation-space
// rotation becomes a Unity one only through Coord.ToUnity(q) (see Sim* helpers below).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Downfall
{
    public static class GameMesh
    {
        const float PI = Mathf.PI;

        public sealed class MGeo
        {
            public List<Vector3> v = new List<Vector3>(), n = new List<Vector3>();
            public List<Vector2> uv = new List<Vector2>();
            public List<int> t = new List<int>();

            public int Count => v.Count;

            public MGeo Clone()
            {
                var g = new MGeo();
                g.v.AddRange(v); g.n.AddRange(n); g.uv.AddRange(uv); g.t.AddRange(t);
                return g;
            }

            public MGeo Translate(double x, double y, double z)
            {
                var d = new Vector3((float)x, (float)y, (float)z);
                for (int i = 0; i < v.Count; i++) v[i] += d;
                return this;
            }
            public MGeo Scale(double x, double y, double z)
            {
                var s = new Vector3((float)x, (float)y, (float)z);
                for (int i = 0; i < v.Count; i++) v[i] = Vector3.Scale(v[i], s);
                if (n.Count == v.Count)
                {
                    var inv = new Vector3(1 / s.x, 1 / s.y, 1 / s.z);
                    for (int i = 0; i < n.Count; i++) n[i] = Vector3.Scale(n[i], inv).normalized;
                }
                // a mirroring scale flips the faces (three.js keeps the index; normals were recomputed)
                if (s.x * s.y * s.z < 0) FlipWinding();
                return this;
            }
            public MGeo Rotate(Quaternion q)
            {
                for (int i = 0; i < v.Count; i++) v[i] = q * v[i];
                for (int i = 0; i < n.Count; i++) n[i] = q * n[i];
                return this;
            }
            public MGeo RotateX(double a) => Rotate(Quaternion.AngleAxis((float)(a * Mathf.Rad2Deg), Vector3.right));
            public MGeo RotateY(double a) => Rotate(Quaternion.AngleAxis((float)(a * Mathf.Rad2Deg), Vector3.up));
            public MGeo RotateZ(double a) => Rotate(Quaternion.AngleAxis((float)(a * Mathf.Rad2Deg), Vector3.forward));
            public MGeo Apply(Matrix4x4 m)
            {
                for (int i = 0; i < v.Count; i++) v[i] = m.MultiplyPoint3x4(v[i]);
                var nm = m.inverse.transpose;
                for (int i = 0; i < n.Count; i++) n[i] = nm.MultiplyVector(n[i]).normalized;
                if (m.determinant < 0) FlipWinding();
                return this;
            }
            public MGeo FlipWinding()
            {
                for (int i = 0; i + 2 < t.Count; i += 3) { int k = t[i + 1]; t[i + 1] = t[i + 2]; t[i + 2] = k; }
                return this;
            }
            public MGeo SwapUV()
            {
                for (int i = 0; i < uv.Count; i++) uv[i] = new Vector2(uv[i].y, uv[i].x);
                return this;
            }

            // three.js computeVertexNormals: area weighted face normals summed per vertex index
            public MGeo ComputeNormals()
            {
                var acc = new Vector3[v.Count];
                for (int i = 0; i + 2 < t.Count; i += 3)
                {
                    Vector3 a = v[t[i]], b = v[t[i + 1]], c = v[t[i + 2]];
                    var fn = Vector3.Cross(c - b, a - b);
                    acc[t[i]] += fn; acc[t[i + 1]] += fn; acc[t[i + 2]] += fn;
                }
                n.Clear();
                for (int i = 0; i < acc.Length; i++) n.Add(acc[i].sqrMagnitude > 0 ? acc[i].normalized : Vector3.up);
                return this;
            }

            public MGeo Append(MGeo o)
            {
                int b = v.Count;
                v.AddRange(o.v);
                if (o.n.Count == o.v.Count) n.AddRange(o.n); else { var tmp = o.Clone().ComputeNormals(); n.AddRange(tmp.n); }
                if (o.uv.Count == o.v.Count) uv.AddRange(o.uv); else for (int i = 0; i < o.v.Count; i++) uv.Add(Vector2.zero);
                foreach (var k in o.t) t.Add(b + k);
                return this;
            }

            public Bounds SimBounds()
            {
                if (v.Count == 0) return new Bounds();
                var b = new Bounds(v[0], Vector3.zero);
                foreach (var p in v) b.Encapsulate(p);
                return b;
            }

            public Mesh ToMesh(string name = "geo")
            {
                var m = new Mesh { name = name };
                if (n.Count != v.Count) ComputeNormals();
                Coord.ApplyToMesh(m, v.ToArray(), t.ToArray(), n.ToArray());
                if (uv.Count == v.Count) m.uv = uv.ToArray();
                m.RecalculateBounds();
                return m;
            }
        }

        public static MGeo Merge(IEnumerable<MGeo> parts)
        {
            var g = new MGeo();
            foreach (var p in parts) if (p != null) g.Append(p);
            return g;
        }
        public static MGeo Merge(params MGeo[] parts) => Merge((IEnumerable<MGeo>)parts);

        // ------------------------------------------------------------------ primitives (three.js layouts)

        // BoxGeometry(width, height, depth, wSeg, hSeg, dSeg)
        public static MGeo Box(double w, double h, double d, int ws = 1, int hs = 1, int ds = 1)
        {
            var g = new MGeo();
            void Plane(int u, int vv, int ww, float udir, float vdir, float width, float height, float depth, int gx, int gy)
            {
                float segW = width / gx, segH = height / gy, wh = width / 2, hh = height / 2, dh = depth / 2;
                int start = g.v.Count;
                for (int iy = 0; iy <= gy; iy++)
                {
                    float y = iy * segH - hh;
                    for (int ix = 0; ix <= gx; ix++)
                    {
                        float x = ix * segW - wh;
                        var p = new float[3]; p[u] = x * udir; p[vv] = y * vdir; p[ww] = dh;
                        var nn = new float[3]; nn[ww] = depth > 0 ? 1 : -1;
                        g.v.Add(new Vector3(p[0], p[1], p[2]));
                        g.n.Add(new Vector3(nn[0], nn[1], nn[2]));
                        g.uv.Add(new Vector2(ix / (float)gx, 1 - iy / (float)gy));
                    }
                }
                for (int iy = 0; iy < gy; iy++)
                    for (int ix = 0; ix < gx; ix++)
                    {
                        int a = start + ix + (gx + 1) * iy, b = start + ix + (gx + 1) * (iy + 1), c = start + (ix + 1) + (gx + 1) * (iy + 1), dd = start + (ix + 1) + (gx + 1) * iy;
                        g.t.Add(a); g.t.Add(b); g.t.Add(dd);
                        g.t.Add(b); g.t.Add(c); g.t.Add(dd);
                    }
            }
            float W = (float)w, H = (float)h, D = (float)d;
            Plane(2, 1, 0, -1, -1, D, H, W, ds, hs);
            Plane(2, 1, 0, 1, -1, D, H, -W, ds, hs);
            Plane(0, 2, 1, 1, 1, W, D, H, ws, ds);
            Plane(0, 2, 1, 1, -1, W, D, -H, ws, ds);
            Plane(0, 1, 2, 1, -1, W, H, D, ws, hs);
            Plane(0, 1, 2, -1, -1, W, H, -D, ws, hs);
            return g;
        }

        // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength)
        public static MGeo Cylinder(double rt, double rb, double h, int rs = 32, int hsg = 1, bool open = false, double th0 = 0, double thL = Math.PI * 2)
        {
            var g = new MGeo();
            float hh = (float)h / 2;
            var grid = new List<int[]>();
            float slope = (float)((rb - rt) / h);
            for (int y = 0; y <= hsg; y++)
            {
                var row = new int[rs + 1];
                float vv = y / (float)hsg;
                float r = (float)(vv * (rb - rt) + rt);
                for (int x = 0; x <= rs; x++)
                {
                    float u = x / (float)rs;
                    float th = (float)(u * thL + th0);
                    float s = Mathf.Sin(th), c = Mathf.Cos(th);
                    row[x] = g.v.Count;
                    g.v.Add(new Vector3(r * s, -vv * (float)h + hh, r * c));
                    g.n.Add(new Vector3(s, slope, c).normalized);
                    g.uv.Add(new Vector2(u, 1 - vv));
                }
                grid.Add(row);
            }
            for (int x = 0; x < rs; x++)
                for (int y = 0; y < hsg; y++)
                {
                    int a = grid[y][x], b = grid[y + 1][x], c = grid[y + 1][x + 1], d = grid[y][x + 1];
                    if (rt > 0 || y != 0) { g.t.Add(a); g.t.Add(b); g.t.Add(d); }
                    if (rb > 0 || y != hsg - 1) { g.t.Add(b); g.t.Add(c); g.t.Add(d); }
                }
            if (!open)
            {
                if (rt > 0) Cap(true);
                if (rb > 0) Cap(false);
            }
            void Cap(bool top)
            {
                float r = (float)(top ? rt : rb), sign = top ? 1 : -1;
                int c0 = g.v.Count;
                for (int x = 1; x <= rs; x++) { g.v.Add(new Vector3(0, hh * sign, 0)); g.n.Add(new Vector3(0, sign, 0)); g.uv.Add(new Vector2(0.5f, 0.5f)); }
                int c1 = g.v.Count;
                for (int x = 0; x <= rs; x++)
                {
                    float u = x / (float)rs, th = (float)(u * thL + th0), c = Mathf.Cos(th), s = Mathf.Sin(th);
                    g.v.Add(new Vector3(r * s, hh * sign, r * c)); g.n.Add(new Vector3(0, sign, 0));
                    g.uv.Add(new Vector2(c * 0.5f + 0.5f, s * 0.5f * sign + 0.5f));
                }
                for (int x = 0; x < rs; x++)
                {
                    int c = c0 + x, i = c1 + x;
                    if (top) { g.t.Add(i); g.t.Add(i + 1); g.t.Add(c); }
                    else { g.t.Add(i + 1); g.t.Add(i); g.t.Add(c); }
                }
            }
            return g;
        }

        public static MGeo Cone(double r, double h, int rs = 32, int hsg = 1, bool open = false) => Cylinder(0, r, h, rs, hsg, open);

        // SphereGeometry(radius, widthSegments, heightSegments)
        public static MGeo Sphere(double rad, int ws = 32, int hs = 16)
        {
            var g = new MGeo();
            float r = (float)rad;
            var grid = new List<int[]>();
            for (int iy = 0; iy <= hs; iy++)
            {
                var row = new int[ws + 1];
                float vv = iy / (float)hs;
                for (int ix = 0; ix <= ws; ix++)
                {
                    float u = ix / (float)ws;
                    var p = new Vector3(-r * Mathf.Cos(u * PI * 2) * Mathf.Sin(vv * PI), r * Mathf.Cos(vv * PI), r * Mathf.Sin(u * PI * 2) * Mathf.Sin(vv * PI));
                    row[ix] = g.v.Count;
                    g.v.Add(p); g.n.Add(p.normalized); g.uv.Add(new Vector2(u, 1 - vv));
                }
                grid.Add(row);
            }
            for (int iy = 0; iy < hs; iy++)
                for (int ix = 0; ix < ws; ix++)
                {
                    int a = grid[iy][ix + 1], b = grid[iy][ix], c = grid[iy + 1][ix], d = grid[iy + 1][ix + 1];
                    if (iy != 0) { g.t.Add(a); g.t.Add(b); g.t.Add(d); }
                    if (iy != hs - 1) { g.t.Add(b); g.t.Add(c); g.t.Add(d); }
                }
            return g;
        }

        // TorusGeometry(radius, tube, radialSegments, tubularSegments, arc): ring in the xy plane
        public static MGeo Torus(double R, double tube, int radial = 12, int tubular = 48, double arc = Math.PI * 2)
        {
            var g = new MGeo();
            for (int j = 0; j <= radial; j++)
                for (int i = 0; i <= tubular; i++)
                {
                    float u = (float)(i / (double)tubular * arc), vv = j / (float)radial * PI * 2;
                    var p = new Vector3((float)((R + tube * Mathf.Cos(vv)) * Mathf.Cos(u)), (float)((R + tube * Mathf.Cos(vv)) * Mathf.Sin(u)), (float)(tube * Mathf.Sin(vv)));
                    var c = new Vector3((float)(R * Mathf.Cos(u)), (float)(R * Mathf.Sin(u)), 0);
                    g.v.Add(p); g.n.Add((p - c).normalized); g.uv.Add(new Vector2(i / (float)tubular, j / (float)radial));
                }
            for (int j = 1; j <= radial; j++)
                for (int i = 1; i <= tubular; i++)
                {
                    int a = (tubular + 1) * j + i - 1, b = (tubular + 1) * (j - 1) + i - 1, c = (tubular + 1) * (j - 1) + i, d = (tubular + 1) * j + i;
                    g.t.Add(a); g.t.Add(b); g.t.Add(d);
                    g.t.Add(b); g.t.Add(c); g.t.Add(d);
                }
            return g;
        }

        // LatheGeometry(points (x = radius, y = height), segments): revolved around y
        public static MGeo Lathe(IList<Vector2> pts, int segments = 12, double phiStart = 0, double phiLength = Math.PI * 2)
        {
            var g = new MGeo();
            int pl = pts.Count;
            for (int i = 0; i <= segments; i++)
            {
                float phi = (float)(phiStart + i / (double)segments * phiLength);
                float s = Mathf.Sin(phi), c = Mathf.Cos(phi);
                for (int j = 0; j < pl; j++)
                {
                    g.v.Add(new Vector3(pts[j].x * s, pts[j].y, pts[j].x * c));
                    g.uv.Add(new Vector2(i / (float)segments, j / (float)(pl - 1)));
                }
            }
            for (int i = 0; i < segments; i++)
                for (int j = 0; j < pl - 1; j++)
                {
                    int b = j + i * pl;
                    int a = b, bb = b + pl, c = b + pl + 1, d = b + 1;
                    g.t.Add(a); g.t.Add(bb); g.t.Add(d);
                    g.t.Add(c); g.t.Add(d); g.t.Add(bb);
                }
            g.ComputeNormals();
            return g;
        }

        // PlaneGeometry(width, height): xy plane facing +z
        public static MGeo Plane(double w, double h)
        {
            var g = new MGeo();
            float hw = (float)w / 2, hh = (float)h / 2;
            g.v.Add(new Vector3(-hw, hh, 0)); g.v.Add(new Vector3(hw, hh, 0)); g.v.Add(new Vector3(-hw, -hh, 0)); g.v.Add(new Vector3(hw, -hh, 0));
            for (int i = 0; i < 4; i++) g.n.Add(Vector3.forward);
            g.uv.Add(new Vector2(0, 1)); g.uv.Add(new Vector2(1, 1)); g.uv.Add(new Vector2(0, 0)); g.uv.Add(new Vector2(1, 0));
            g.t.AddRange(new[] { 0, 2, 1, 2, 3, 1 });
            return g;
        }

        // CircleGeometry(radius, segments): xy plane facing +z
        public static MGeo Circle(double r, int seg = 32)
        {
            var g = new MGeo();
            g.v.Add(Vector3.zero); g.n.Add(Vector3.forward); g.uv.Add(new Vector2(0.5f, 0.5f));
            for (int s = 0; s <= seg; s++)
            {
                float th = s / (float)seg * PI * 2;
                float c = Mathf.Cos(th), sn = Mathf.Sin(th);
                g.v.Add(new Vector3((float)r * c, (float)r * sn, 0)); g.n.Add(Vector3.forward);
                g.uv.Add(new Vector2(c * 0.5f + 0.5f, sn * 0.5f + 0.5f));
            }
            for (int i = 1; i <= seg; i++) { g.t.Add(i); g.t.Add(i + 1); g.t.Add(0); }
            return g;
        }

        // carModel.js roundedBox(w, h, d, r, seg): three.js extrudes a rounded rectangle with a bevel.
        // Closest equivalent: a subdivided box whose vertices are pushed onto the rounded hull
        // (every edge rounded with radius r), same outer dimensions.
        public static MGeo RoundedBox(double w, double h, double d, double r = 0.04, int seg = 2)
        {
            int n = Math.Max(1, seg) * 2 + 1;
            var g = Box(w, h, d, n, n, n);
            var half = new Vector3((float)w / 2, (float)h / 2, (float)d / 2);
            float rr = (float)Math.Min(r, Math.Min(w, Math.Min(h, d)) / 2 * 0.999);
            var inner = half - Vector3.one * rr;
            for (int i = 0; i < g.v.Count; i++)
            {
                var p = g.v[i];
                // pull the grid lines next to the edges towards them so the rounding has rows
                var q = new Vector3(Snap(p.x, half.x, rr), Snap(p.y, half.y, rr), Snap(p.z, half.z, rr));
                var c = new Vector3(Mathf.Clamp(q.x, -inner.x, inner.x), Mathf.Clamp(q.y, -inner.y, inner.y), Mathf.Clamp(q.z, -inner.z, inner.z));
                var dir = q - c;
                if (dir.sqrMagnitude < 1e-12f) dir = g.n[i];
                dir.Normalize();
                g.v[i] = c + dir * rr;
                g.n[i] = dir;
            }
            return g;
        }
        static float Snap(float p, float half, float r)
        {
            float a = Mathf.Abs(p);
            if (a >= half - 1e-5f) return p;
            // interior grid line: map [0, half) so the last interior row sits inside the rounding band
            float k = a / half;
            float m = k < 0.5f ? k / 0.5f * (half - r) : (half - r) + (k - 0.5f) / 0.5f * r;
            return Mathf.Sign(p) * m;
        }

        // carModel.js beam(a, b, rad, seg): cylinder between two points
        public static MGeo Beam(double[] a, double[] b, double rad, int seg = 6)
        {
            var A = V(a), B = V(b);
            float len = Vector3.Distance(A, B);
            var g = Cylinder(rad, rad, len, seg, 1);
            g.Rotate(Quaternion.FromToRotation(Vector3.up, (B - A).normalized));
            g.Translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
            return g;
        }

        // carModel.js loft(sections, {flip}): consecutive rings joined into quads
        public static MGeo Loft(IList<double[][]> sections, bool flip = false)
        {
            var g = new MGeo();
            int ns = sections.Count, nr = sections[0].Length;
            double along = 0;
            for (int i = 0; i < ns; i++)
            {
                if (i > 0) along += Math.Abs(sections[i][0][2] - sections[i - 1][0][2]);
                double ring = 0;
                for (int j = 0; j < nr; j++)
                {
                    var p = sections[i][j];
                    if (j > 0) { var q = sections[i][j - 1]; ring += Math.Sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1])); }
                    g.v.Add(V(p)); g.uv.Add(new Vector2((float)(ring * 0.5), (float)(along * 0.5)));
                }
            }
            for (int i = 0; i < ns - 1; i++)
                for (int j = 0; j < nr - 1; j++)
                {
                    int a = i * nr + j, b = a + 1, c = a + nr, d = c + 1;
                    if (flip) g.t.AddRange(new[] { a, c, b, b, c, d });
                    else g.t.AddRange(new[] { a, b, c, b, d, c });
                }
            g.ComputeNormals();
            return g;
        }

        // carModel.js fan(ring, flip): a cap over a closed ring (flip = faces -z)
        public static MGeo Fan(IList<double[]> ring, bool flip)
        {
            var g = new MGeo();
            double cx = 0, cy = 0, cz = 0;
            foreach (var p in ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
            cx /= ring.Count; cy /= ring.Count; cz /= ring.Count;
            g.v.Add(new Vector3((float)cx, (float)cy, (float)cz)); g.uv.Add(new Vector2(0.5f, 0.5f));
            foreach (var p in ring) { g.v.Add(V(p)); g.uv.Add(new Vector2((float)(p[0] * 0.5 + 0.5), (float)(p[1] * 0.5))); }
            for (int i = 1; i < ring.Count; i++) { if (flip) g.t.AddRange(new[] { 0, i + 1, i }); else g.t.AddRange(new[] { 0, i, i + 1 }); }
            g.ComputeNormals();
            float nz = g.n[0].z;
            if ((flip && nz > 0) || (!flip && nz < 0)) { g.FlipWinding(); g.ComputeNormals(); }
            return g;
        }

        public static Vector3 V(double[] p) => new Vector3((float)p[0], (float)p[1], (float)p[2]);
        public static Vector3 V(double x, double y, double z) => new Vector3((float)x, (float)y, (float)z);

        // ------------------------------------------------------------------ simulation-space rotations -> Unity

        // three.js object rotations (radians, simulation axes), as Unity local rotations
        public static Quaternion SimX(double a) => Quaternion.AngleAxis((float)(a * Mathf.Rad2Deg), Vector3.right);
        public static Quaternion SimY(double a) => Quaternion.AngleAxis((float)(-a * Mathf.Rad2Deg), Vector3.up);
        public static Quaternion SimZ(double a) => Quaternion.AngleAxis((float)(-a * Mathf.Rad2Deg), Vector3.forward);
        // three.js Euler 'XYZ' (q = qx * qy * qz)
        public static Quaternion SimEuler(double x, double y, double z) => SimX(x) * SimY(y) * SimZ(z);

        public static void SetSimLocal(Transform t, double x, double y, double z) => t.localPosition = Coord.ToUnity(x, y, z);
        public static void SetSimLocal(Transform t, Vector3 simP) => t.localPosition = Coord.ToUnity(simP);
        public static Vector3 SimLocalPos(Transform t) => Coord.FromUnity(t.localPosition);

        // ------------------------------------------------------------------ scene objects

        public static GameObject Node(string name, Transform parent)
        {
            var go = new GameObject(name);
            if (parent) go.transform.SetParent(parent, false);
            return go;
        }

        public static GameObject Obj(string name, Transform parent, MGeo g, Material m, bool castShadow = true, bool receive = true)
        {
            var go = Node(name, parent);
            go.AddComponent<MeshFilter>().sharedMesh = g.ToMesh(name);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = castShadow ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = receive;
            return go;
        }

        public static GameObject Obj(string name, Transform parent, Mesh mesh, Material m, bool castShadow = true)
        {
            var go = Node(name, parent);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = castShadow ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        public static void SetShadows(GameObject go, bool cast)
        {
            foreach (var r in go.GetComponentsInChildren<Renderer>(true))
                r.shadowCastingMode = cast ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        public static void Destroy(UnityEngine.Object o)
        {
            if (!o) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(o); else UnityEngine.Object.DestroyImmediate(o);
        }

        // Destroys a hierarchy and the meshes this file generated for it (shared/cached meshes are kept).
        public static void DestroyTree(GameObject go, ICollection<Mesh> keep = null)
        {
            if (!go) return;
            foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
            {
                var m = mf.sharedMesh;
                if (m && (keep == null || !keep.Contains(m)) && !IsAsset(m)) Destroy(m);
            }
            Destroy(go);
        }
        static readonly HashSet<Mesh> cachedMeshes = new HashSet<Mesh>();
        public static void MarkCached(Mesh m) { if (m) cachedMeshes.Add(m); }
        static bool IsAsset(Mesh m) => cachedMeshes.Contains(m) || (m.hideFlags & HideFlags.DontUnloadUnusedAsset) != 0 || IsPersistent(m);
        static bool IsPersistent(Mesh m)
        {
            // meshes loaded from assets have a negative instance id only when created at runtime
            return m.GetInstanceID() > 0;
        }

        // ------------------------------------------------------------------ materials

        public static Color Hex(int rgb) => MatDef.Hex(rgb);

        // A runtime Lit material like `new MeshStandardMaterial({ color, roughness, metalness })`.
        public static Material Std(string name, int color, float roughness, float metalness = 0, int emissive = 0, float emissiveIntensity = 0, bool twoSided = false)
        {
            var d = new MatDef(name, Hex(color), roughness, metalness);
            if (emissive != 0 && emissiveIntensity > 0) d.Emit(emissive, emissiveIntensity);
            if (twoSided) d.TwoSided();
            return Mats.Create(d);
        }

        // MeshBasicMaterial({ color, transparent, opacity, blending: Additive, depthWrite: false })
        public static Material Additive(string name, int color, float opacity)
        {
            var d = new MatDef(name, Hex(color, opacity), 1).Particle().Additive().TwoSided();
            var m = Mats.Create(d);
            var c = Hex(color, opacity);
            m.SetColor("_TintColor", new Color(c.r * 0.5f, c.g * 0.5f, c.b * 0.5f, opacity * 0.5f)); // legacy particle shaders double the tint
            return m;
        }
        public static Color Hex(int rgb, float a) => MatDef.Hex(rgb, a);

        // MeshBasicMaterial({ color }) (unlit, opaque)
        public static Material Basic(string name, int color)
        {
            var d = new MatDef(name, Hex(color), 1).Unlit();
            return Mats.Create(d);
        }

        public static void SetColor(Material m, Color c)
        {
            if (!m) return;
            m.SetColor("_BaseColor", c); m.SetColor("_Color", c);
        }
        public static Color GetColor(Material m)
        {
            if (!m) return Color.white;
            if (m.HasProperty("_BaseColor")) return m.GetColor("_BaseColor");
            return m.HasProperty("_Color") ? m.GetColor("_Color") : Color.white;
        }
        public static void SetAlpha(Material m, float a)
        {
            var c = GetColor(m); c.a = a; SetColor(m, c);
        }
        // three.js emissive * emissiveIntensity (sRGB colour, linear intensity), like Mats.Configure
        public static void SetEmission(Material m, Color srgb, float intensity)
        {
            if (!m) return;
            bool on = intensity > 0 && srgb.maxColorComponent > 0;
            m.SetColor("_EmissionColor", on ? (srgb.linear * intensity).gamma : Color.black);
            if (on) m.EnableKeyword("_EMISSION"); else m.DisableKeyword("_EMISSION");
        }
        public static void SetPbr(Material m, float roughness, float metalness)
        {
            if (!m) return;
            m.SetFloat("_Smoothness", 1 - roughness); m.SetFloat("_Glossiness", 1 - roughness); m.SetFloat("_Metallic", metalness);
        }
    }
}

// Port of src/models/props.js: procedural environment props. Geometry builders return Geo
// (game space, vertex coloured where the JS colours them) so the world can instance them;
// the group builders (signs, houses, pickups) add their pieces to a MeshGroup, which merges
// everything per material into a few renderers.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Downfall
{
    /// <summary>Static geometry merged per material (and shadow mode) under one GameObject.</summary>
    public sealed class MeshGroup
    {
        sealed class Bucket { public Material mat; public bool cast, receive; public readonly List<Geo> list = new List<Geo>(); }
        readonly Dictionary<(Material, bool, bool), Bucket> map = new Dictionary<(Material, bool, bool), Bucket>();
        readonly List<Bucket> order = new List<Bucket>();
        public int sortingOrder;

        public bool Empty => order.Count == 0;

        /// <summary>Adds game-space geometry (optionally transformed by a game-space matrix; the geo is consumed).</summary>
        public void Add(Geo g, Material m, Matrix4x4? gameM = null, bool cast = true, bool receive = true)
        {
            if (g == null || g.Count == 0 || m == null) return;
            if (gameM.HasValue) g.Apply(gameM.Value);
            var key = (m, cast, receive);
            if (!map.TryGetValue(key, out var b)) { b = new Bucket { mat = m, cast = cast, receive = receive }; map[key] = b; order.Add(b); }
            b.list.Add(g);
        }

        public GameObject Build(Transform parent, string name, List<Mesh> owned = null)
        {
            var root = new GameObject(name);
            root.transform.SetParent(parent, false);
            foreach (var b in order)
            {
                var mesh = Geo.Merge(b.list).ToMesh(name + "_" + b.mat.name);
                owned?.Add(mesh);
                var o = new GameObject(b.mat.name);
                o.transform.SetParent(root.transform, false);
                o.AddComponent<MeshFilter>().sharedMesh = mesh;
                var r = o.AddComponent<MeshRenderer>();
                r.sharedMaterial = b.mat;
                r.shadowCastingMode = b.cast ? ShadowCastingMode.On : ShadowCastingMode.Off;
                r.receiveShadows = b.receive;
                r.sortingOrder = sortingOrder;
            }
            map.Clear(); order.Clear();
            return root;
        }
    }

    public static class PR
    {
        static readonly Noise noise = new Noise(99);
        static readonly Dictionary<string, Geo> cache = new Dictionary<string, Geo>();
        static Geo Memo(string k, Func<Geo> f) { if (!cache.TryGetValue(k, out var g)) cache[k] = g = f(); return g; }

        static Color H(int hex) => G.Lin(hex);
        static Color LerpC(Color a, Color b, float t) => new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1);

        static Geo Jitter(Geo g, double amt, double seed, double vertical = 0.3)
        {
            for (int i = 0; i < g.Count; i++)
            {
                double x = g.v[i].x, y = g.v[i].y, z = g.v[i].z;
                double n = noise.N2(x * 3.1 + seed, z * 3.1 + y * 1.7);
                double m = noise.N2(z * 2.3 - seed, x * 2.9 + y);
                g.v[i] = G.V(x + n * amt, y + m * amt * vertical, z + noise.N2(y * 2.1 + seed, x) * amt);
            }
            return g.ComputeNormals();
        }

        // ---------------------------------------------------------------- trees
        public static Geo TreeGeometry(string kind, int variant, bool snowy, bool autumn, bool dry)
        {
            if (kind != "pine" && kind != "spruce" && kind != "birch" && kind != "oak") kind = kind == "cypress" ? "spruce" : "oak";
            return Memo($"tree_{kind}_{variant}_{(snowy ? 1 : 0)}_{(autumn ? 1 : 0)}_{(dry ? 1 : 0)}", () =>
            {
                var r = new Rng(variant * 13 + kind.Length * 101 + 1);
                var parts = new List<Geo>();
                Color bark = H(0x4a3a2c), barkB = H(0xd8d4c8);
                if (kind == "pine" || kind == "spruce")
                {
                    bool sp = kind == "spruce";
                    double Hh = sp ? 13 + r.Next() * 5 : 10 + r.Next() * 5;
                    var trunk = Geo.Cylinder(0.12, 0.32, Hh * 0.55, 6, 1).Translate(0, Hh * 0.27, 0);
                    trunk.ColorAll(bark);
                    parts.Add(trunk.NI());
                    int layers = sp ? 8 : 6;
                    Color bse = H(sp ? 0x1f3322 : 0x2b4026), tip = H(sp ? 0x35523a : 0x4d6a38);
                    if (dry) { bse = H(0x4a4a2a); tip = H(0x7a7240); }
                    for (int l = 0; l < layers; l++)
                    {
                        double t = (double)l / (layers - 1);
                        double y0 = Hh * (sp ? 0.16 : 0.3) + t * Hh * (sp ? 0.72 : 0.6);
                        double rad = (1 - t * 0.85) * (sp ? 2.3 : 3.0) * (0.85 + r.Next() * 0.3);
                        double h = Hh * (sp ? 0.22 : 0.26);
                        var cone = Geo.Cone(rad, h, 9, 2, true);
                        cone.RotateY(r.Next() * 6);
                        cone.Translate(0, y0 + h * 0.5, 0);
                        for (int i = 0; i < cone.Count; i++)
                        {
                            double x = cone.v[i].x, y = cone.v[i].y, z = cone.v[i].z;
                            double d = Track.JsHypot(x, z) / rad;
                            double ny = y - d * d * 0.35 * h + noise.N2(x * 2 + l, z * 2) * 0.25;
                            double nx = x * (1 + noise.N2(z * 1.5 + l * 3, y) * 0.25), nz = z * (1 + noise.N2(x * 1.5 - l * 3, y) * 0.25);
                            cone.v[i] = G.V(nx, ny, nz);
                        }
                        cone.ComputeNormals();
                        int ll = l; double tt = t;
                        cone.Colorize((ref Color c, float x, float y, float z, int i) =>
                        {
                            float d = Mathf.Sqrt(x * x + z * z) / (float)rad;
                            c = LerpC(bse, tip, d * 0.7f + (float)tt * 0.3f);
                            c = G.Mul(c, 0.8f + (float)noise.N2(x * 4, z * 4 + y) * 0.2f);
                            if (snowy && d < 0.95f && noise.N2(x * 3, z * 3 + ll) > -0.35) c = LerpC(c, H(0xe8edf2), 0.75f);
                        });
                        parts.Add(cone.NI());
                    }
                }
                else
                {
                    bool oak = kind == "oak";
                    double Hh = oak ? 8 + r.Next() * 4 : 11 + r.Next() * 4;
                    var trunk = Geo.Cylinder(oak ? 0.25 : 0.12, oak ? 0.5 : 0.2, Hh * 0.62, 7, 3).Translate(0, Hh * 0.31, 0);
                    Jitter(trunk, 0.08, variant);
                    trunk.Colorize((ref Color c, float x, float y, float z, int i) => { c = oak ? bark : barkB; if (!oak && Math.Sin(y * 7 + x * 30) > 0.7) c = H(0x2a2522); });
                    parts.Add(trunk.NI());
                    int blobs = oak ? 5 : 4;
                    int[] aut = { 0xa35a1c, 0xc28a2a, 0x8a3c1a, 0x6a7a2a };
                    var leaf = H(dry ? 0x7a7038 : autumn ? aut[variant % 4] : oak ? 0x3d5a24 : 0x5a7a30);
                    for (int b = 0; b < blobs; b++)
                    {
                        double rad = (oak ? 2.6 : 1.8) * (0.7 + r.Next() * 0.5);
                        var s = Geo.Icosahedron(rad, 1);
                        Jitter(s, rad * 0.25, b + variant * 7, 1);
                        double a = r.Next() * 6.28, rr = b == 0 ? 0 : (oak ? 1.8 : 1.1) * (0.6 + r.Next() * 0.5);
                        double ty = Hh * (oak ? 0.68 : 0.62) + (b == 0 ? Hh * 0.12 : r.Next() * Hh * 0.18);
                        s.Translate(Math.Cos(a) * rr, ty, Math.Sin(a) * rr);
                        s.Scale(1, oak ? 0.75 : 1.2, 1);
                        s.Colorize((ref Color c, float x, float y, float z, int i) => { c = G.Mul(leaf, 0.75f + (float)noise.N2(x * 2, z * 2 + y) * 0.25f + (y - (float)Hh * 0.6f) * 0.02f); });
                        parts.Add(s.NI());
                    }
                }
                return Geo.Merge(parts);
            });
        }

        public static Geo DeadTreeGeometry(int v = 0)
        {
            return Memo("deadtree_" + v, () =>
            {
                var r = new Rng(v + 500);
                var parts = new List<Geo> { Geo.Cylinder(0.1, 0.28, 7, 6).Translate(0, 3.5, 0).NI() };
                for (int k = 0; k < 5; k++)
                {
                    double y = 3 + r.Next() * 3.5, a = r.Next() * 6.28, len = 1 + r.Next() * 2;
                    parts.Add(Geo.Beam(new[] { 0, y, 0 }, new[] { Math.Cos(a) * len, y + len * 0.6, Math.Sin(a) * len }, 0.05, 4).NI());
                }
                return Geo.Merge(parts).ColorAll(H(0x5a4c3e));
            });
        }

        public static Geo BushGeometry(int v, bool snowy, bool dry)
        {
            return Memo("bush_" + v + (snowy ? "s" : "") + (dry ? "d" : ""), () =>
            {
                var s = Geo.Icosahedron(1, 1);
                Jitter(s, 0.3, v * 3, 1);
                s.Scale(1.3, 0.7, 1.2).Translate(0, 0.4, 0);
                var col = H(dry ? 0x7a6a3a : 0x3e5226);
                s.Colorize((ref Color c, float x, float y, float z, int i) =>
                {
                    c = G.Mul(col, 0.7f + (float)noise.N2(x * 3, z * 3) * 0.3f + y * 0.2f);
                    if (snowy && y > 0.6f) c = LerpC(c, H(0xe6ebef), 0.7f);
                });
                return s.NI();
            });
        }

        // ---------------------------------------------------------------- rocks
        public static Geo RockGeometry(int v, bool snowy, int tint)
        {
            return Memo("rock_" + v + (snowy ? "s" : "") + tint, () =>
            {
                var g = Geo.Icosahedron(1, 2);
                double sx = 1 + (v % 3) * 0.25, sy = 0.55 + ((v * 7) % 5) * 0.08, sz = 0.9 + ((v * 3) % 4) * 0.15;
                for (int i = 0; i < g.Count; i++)
                {
                    double x = g.v[i].x, y = g.v[i].y, z = g.v[i].z;
                    double n = noise.Fbm(x * 1.3 + v * 10, z * 1.3 + y * 1.1, 3) * 0.35 + noise.N2(x * 4 + v, y * 4 - z) * 0.08;
                    double k = 1 + n;
                    x *= k * sx; y *= k * sy; z *= k * sz;
                    if (y < -0.2) y = -0.2 + (y + 0.2) * 0.2;
                    g.v[i] = G.V(x, y, z);
                }
                g.ComputeNormals();
                var bse = H(tint != 0 ? tint : 0x8a8780);
                g.Colorize((ref Color c, float x, float y, float z, int i) =>
                {
                    c = G.Mul(bse, 0.72f + (float)noise.N2(x * 2.5, z * 2.5 + y) * 0.2f + y * 0.1f);
                    if (y < 0) c = LerpC(c, H(0x4a4636), 0.35f);
                    if (snowy && y > 0.2f) c = LerpC(c, H(0xeef2f5), 0.8f);
                });
                for (int i = 0; i < g.Count; i++) g.uv[i] = new Vector2(g.v[i].x * 0.5f + g.v[i].z * 0.3f, g.v[i].y * 0.5f);
                return g;
            });
        }

        // ---------------------------------------------------------------- signs
        public static string SignMaterialName(string type, string text, int km)
        {
            if (type == "km") return "sign_km_" + km;
            if (type == "region" || type == "village") return MatDefs.RegionSignMaterial(text);
            return "sign_" + type;
        }

        /// <summary>buildSign(): pole(s), face and back plate. Placed at game position p with yaw.</summary>
        public static void BuildSign(MeshGroup mg, Vector3 p, double yaw, string type, string text, int km, bool broken)
        {
            bool big = type == "region" || type == "village", chev = type.StartsWith("chev");
            double poleH = big ? 2.2 : chev ? 1.1 : 2.1;
            double rx = 0, rz = 0;
            if (broken) { rz = 0.35 + UnityEngine.Random.value * 0.3; rx = -0.1; }
            var M = Matrix4x4.TRS(p, G.Euler(rx, yaw, rz), Vector3.one);
            var galv = WorldMats.Get("galv");
            if (big)
            {
                mg.Add(Geo.Cylinder(0.04, 0.045, poleH, 6).Translate(-1.6, poleH / 2, 0), galv, M);
                mg.Add(Geo.Cylinder(0.04, 0.045, poleH, 6).Translate(1.6, poleH / 2, 0), galv, M);
            }
            else mg.Add(Geo.Cylinder(0.04, 0.045, poleH, 6).Translate(0, poleH / 2, 0), galv, M);
            double size = big ? 3.6 : chev ? 0.9 : type == "km" ? 0.7 : 1.0;
            double fy = poleH + (chev ? 0.2 : size * 0.38);
            mg.Add(Geo.Plane(size, size).Translate(0, fy, 0.03), WorldMats.Get(SignMaterialName(type, text, km)), M);
            mg.Add(Geo.Plane(size * 0.92, size * (type == "region" ? 0.5 : 0.88)).RotateY(Math.PI).Translate(0, fy, 0.02), WorldMats.Get("signBack"), M);
        }

        // ---------------------------------------------------------------- buildings
        static Geo BoxAt(double w, double h, double d, double x, double y, double z, Quaternion? q = null)
        {
            var g = Geo.Box(w, h, d);
            if (q.HasValue) g.Rotate(q.Value);
            return g.Translate(x, y, z);
        }

        public static void BuildHouse(MeshGroup mg, Matrix4x4 M, int seed, string kind = "house")
        {
            var r = new Rng(seed);
            bool barn = kind == "barn", chapel = kind == "chapel";
            double w = barn ? 9 : chapel ? 6.5 : 6.5 + r.Next() * 2.5;
            double d = barn ? 12 : chapel ? 11 : 7 + r.Next() * 3;
            double h = barn ? 5 : chapel ? 6 : 3 + r.Next() * 2.5;
            string wallMat = barn ? "woodDark" : r.Next() < 0.5 ? "plaster" : "wood";
            mg.Add(BoxAt(w, h, d, 0, h / 2 - 0.3, 0), WorldMats.Get(wallMat), M);
            mg.Add(BoxAt(w + 0.2, 0.9, d + 0.2, 0, 0.1, 0), WorldMats.Get("concreteDark"), M);
            double rh = barn ? 3.5 : 2.4 + r.Next();
            var shape = new List<Vector2> { V2(-w / 2 - 0.6, 0), V2(0, rh), V2(w / 2 + 0.6, 0), V2(w / 2 + 0.45, -0.15), V2(0, rh - 0.2), V2(-w / 2 - 0.45, -0.15) };
            var roof = Geo.Extrude(shape, d + 1.2).Translate(0, 0, -(d + 1.2) / 2).Translate(0, h - 0.3, 0);
            mg.Add(roof, WorldMats.Get(r.Next() < 0.5 ? "roofTile" : "roofSlate"), M);
            var gs = new List<Vector2> { V2(-w / 2, 0), V2(0, rh - 0.25), V2(w / 2, 0) };
            string gableMat = wallMat == "plaster" ? "wood" : wallMat;
            mg.Add(Geo.Shape(gs).Translate(0, h - 0.3, d / 2), WorldMats.Get(gableMat), M);
            mg.Add(Geo.Shape(gs).RotateY(Math.PI).Translate(0, h - 0.3, -d / 2), WorldMats.Get(gableMat), M);
            bool lit = r.Next() < 0.3;
            int nW = Math.Max(2, (int)Math.Floor(d / 2.6));
            var wins = new List<Geo>(); var frames = new List<Geo>();
            for (int i = 0; i < nW; i++)
            {
                double z = -d / 2 + (i + 0.5) * (d / nW);
                foreach (int sx in new[] { 1, -1 })
                {
                    if (barn && (i % 2) != 0) continue;
                    wins.Add(Geo.Plane(0.9, 1.1).RotateY(sx * Math.PI / 2).Translate(sx * (w / 2 + 0.01), h * 0.55, z));
                    frames.Add(BoxAt(0.1, 1.1 + 0.16, 0.9 + 0.16, sx * (w / 2 + 0.01), h * 0.55, z));
                }
            }
            mg.Add(Geo.Merge(wins), WorldMats.Get(lit ? "windowLit" : "windowDark"), M);
            mg.Add(Geo.Merge(frames), WorldMats.Get("woodDark"), M);
            mg.Add(BoxAt(0.1, 2.0, barn ? 3.2 : 1.0, w / 2 + 0.02, 0.85, barn ? 0 : d * 0.15), WorldMats.Get("woodDark"), M);
            if (kind == "house" && r.Next() < 0.7) mg.Add(BoxAt(0.6, 1.8, 0.6, w * 0.2, h + rh * 0.6, -d * 0.25), WorldMats.Get("concreteDark"), M);
            if (chapel)
            {
                mg.Add(BoxAt(2.4, 9, 2.4, 0, 4.2, -d / 2 - 1.2), WorldMats.Get("plaster"), M);
                mg.Add(Geo.Cone(1.9, 4.5, 4).RotateY(Math.PI / 4).Translate(0, 10.9, -d / 2 - 1.2), WorldMats.Get("roofSlate"), M);
            }
            if (r.Next() < 0.5) mg.Add(BoxAt(0.6, 1.2, 2.4, -w / 2 - 0.4, 0.3, d * 0.2), WorldMats.Get("woodDark"), M);
        }

        public static void BuildShack(MeshGroup mg, Matrix4x4 M, int seed)
        {
            var r = new Rng(seed);
            double w = 4 + r.Next() * 2, d = 5 + r.Next() * 2, h = 2.6;
            mg.Add(BoxAt(w, h, d, 0, h / 2 - 0.2, 0), WorldMats.Get("woodDark"), M);
            mg.Add(BoxAt(w + 0.8, 0.08, d + 0.8, 0, h, 0, G.Euler(r.Next() * 0.15, 0, 0.12)), WorldMats.Get("rusty"), M);
            mg.Add(Geo.Plane(1.2, 1.0).RotateY(Math.PI / 2).Translate(w / 2 + 0.01, 1.4, 0), WorldMats.Get("windowDark"), M);
            for (int k = 0; k < 4; k++)
            {
                double bh = 0.6 + r.Next(), bx = -w / 2 - 1 - r.Next() * 2, bz = (r.Next() - 0.5) * d, rot = r.Next() - 0.5;
                mg.Add(BoxAt(0.15, bh, 0.15, bx, 0.3, bz, G.Euler(0, 0, rot)), WorldMats.Get("rusty"), M);
            }
        }

        public static void BuildGasStation(MeshGroup mg, Matrix4x4 M, int seed)
        {
            mg.Add(BoxAt(5, 3.2, 7, -4, 1.4, 0), WorldMats.Get("plaster"), M);
            mg.Add(BoxAt(5.6, 0.25, 7.6, -4, 3.1, 0), WorldMats.Get("concreteDark"), M);
            mg.Add(Geo.Plane(3.5, 1.5).RotateY(Math.PI / 2).Translate(-1.49, 1.5, 0), WorldMats.Get("windowDark"), M);
            var cq = G.Euler(0.05, 0, -0.12);
            mg.Add(BoxAt(6, 0.35, 8, 2.5, 4.1, 0, cq), WorldMats.Get("rusty"), M);
            mg.Add(BoxAt(6.05, 0.15, 8.05, 2.5, 4.1 - 0.12, 0, cq), WorldMats.Get("orange"), M);
            foreach (var p in new[] { new[] { 0.2, 3.5, 4.2 }, new[] { 0.2, -3.5, 4.2 }, new[] { 4.8, 3.5, 3.4 } })
                mg.Add(BoxAt(0.3, p[2], 0.3, p[0], p[2] / 2, p[1]), WorldMats.Get("galv"), M);
            foreach (double z in new[] { -1.5, 1.5 })
            {
                mg.Add(BoxAt(0.6, 1.5, 0.9, 2.5, 0.75, z), WorldMats.Get("orange"), M);
                mg.Add(Geo.Plane(0.4, 0.3).RotateY(Math.PI / 2).Translate(2.81, 1.15, z), WorldMats.Get("windowDark"), M);
            }
            mg.Add(BoxAt(0.2, 1.6, 2.4, 6, 4.5, 4, G.Euler(0, 0, 0.2)), WorldMats.Get("orange"), M);
            mg.Add(Geo.Cylinder(0.1, 0.1, 4, 6).Translate(6, 2, 4), WorldMats.Get("galv"), M);
        }

        static Vector2 V2(double x, double y) => new Vector2((float)x, (float)y);

        // ---------------------------------------------------------------- road furniture
        public static Geo PoleGeometry() => Memo("pole", () =>
        {
            var parts = new List<Geo> { Geo.Cylinder(0.11, 0.15, 8, 7).Translate(0, 4, 0).NI(), Geo.Box(1.8, 0.12, 0.12).Translate(0, 7.4, 0).NI() };
            foreach (double x in new[] { -0.75, 0, 0.75 }) parts.Add(Geo.Cylinder(0.05, 0.05, 0.16, 6).Translate(x, 7.54, 0).NI());
            return Geo.Merge(parts).Colorize((ref Color c, float x, float y, float z, int i) => c = H(y > 7.47f && Mathf.Abs(x) > 0.02f && y < 7.65f ? 0xcfd2cc : 0x5a4636));
        });

        public static Geo SnowPoleGeometry() => Memo("snowpole", () =>
            Geo.Cylinder(0.035, 0.035, 2.2, 5).Translate(0, 1.1, 0).NI()
                .Colorize((ref Color c, float x, float y, float z, int i) => c = H(((int)Math.Floor(y / 0.25) % 2) != 0 && y > 1.2f ? 0x1a1a1a : 0xd2621e)));

        public static Geo FencePostGeometry() => Memo("fencepost", () => Geo.Box(0.12, 1.2, 0.12).Translate(0, 0.6, 0).NI().ColorAll(H(0x6a5440)));

        public static Geo LogsGeometry() => Memo("logs", () =>
        {
            var parts = new List<Geo>();
            for (int row = 0; row < 3; row++)
                for (int k = 0; k < 4 - row; k++)
                    parts.Add(Geo.Cylinder(0.25, 0.25, 5, 8).RotateX(Math.PI / 2).Translate((k - (3 - row) / 2.0) * 0.5, 0.25 + row * 0.43, 0).NI());
            return Geo.Merge(parts).Colorize((ref Color c, float x, float y, float z, int i) => c = H(Mathf.Abs(z) > 2.45f ? 0xb89a70 : 0x5a4636));
        });

        public static Geo BarrierGeometry() => Memo("barrier", () =>
        {
            var s = new List<Vector2> { V2(-0.3, 0), V2(0.3, 0), V2(0.3, 0.08), V2(0.12, 0.3), V2(0.08, 0.82), V2(-0.08, 0.82), V2(-0.12, 0.3), V2(-0.3, 0.08) };
            return Geo.Extrude(s, 2).Translate(0, 0, -1);
        });

        public static Geo BarrelGeometry() => Memo("barrel", () =>
        {
            var pts = new List<Vector2>();
            for (int i = 0; i <= 10; i++) { double t = i / 10.0; pts.Add(V2(0.3 + Math.Sin(t * Math.PI) * 0.04, t * 0.95)); }
            return Geo.Lathe(pts, 14).Colorize((ref Color c, float x, float y, float z, int i) => c = H(((int)Math.Floor(y / 0.19) % 2) != 0 ? 0xe2ddd0 : 0xd2501e));
        });

        public static Geo FallenTreeGeometry(double len, double r)
        {
            var parts = new List<Geo> { Geo.Cylinder(r * 0.7, r, len, 8).RotateZ(Math.PI / 2).Translate(len / 2, r, 0).NI() };
            var rr = new Rng(Track.JsRound(len * 100));
            for (int k = 0; k < 6; k++)
            {
                double x = len * (0.35 + rr.Next() * 0.6), a = rr.Next() * 6.28;
                parts.Add(Geo.Beam(new[] { x, r, 0 }, new[] { x + 0.6, r + Math.Sin(a) * 1.2 + 0.4, Math.Cos(a) * 1.4 }, 0.05, 4).NI());
            }
            parts.Add(Geo.Icosahedron(r * 2.2, 0).Scale(0.4, 1, 1).Translate(-0.1, r * 1.2, 0));
            return Geo.Merge(parts).Colorize((ref Color c, float x, float y, float z, int i) => c = H(x < 0.2f ? 0x3a2e22 : 0x4e3e2e));
        }

        public static Geo BeamGeo(double[] a, double[] b, double r) => Geo.Beam(a, b, r, 5).NI();

        // ---------------------------------------------------------------- pickups
        /// <summary>buildPickup(type): the collectible model (local space, origin on the ground).</summary>
        public static GameObject BuildPickup(string type, Transform parent = null)
        {
            var mg = new MeshGroup();
            var I = Matrix4x4.identity;
            if (type == "fuel")
            {
                mg.Add(BoxAt(0.38, 0.5, 0.18, 0, 0.3, 0), WorldMats.Get("fuelCan"), I);
                mg.Add(Geo.Torus(0.06, 0.018, 5, 10, Math.PI).Translate(-0.08, 0.57, 0), WorldMats.Get("fuelCan"), I);
                mg.Add(Geo.Cylinder(0.025, 0.03, 0.14, 8).RotateZ(-0.5).Translate(0.13, 0.6, 0), WorldMats.Get("darkSteel"), I);
            }
            else if (type == "cash")
            {
                for (int k = 0; k < 3; k++)
                {
                    var q = G.Yaw(k * 0.3);
                    mg.Add(BoxAt(0.34, 0.06, 0.16, (k - 1) * 0.05, 0.2 + k * 0.065, (k % 2) * 0.03, q), WorldMats.Get("cash"), I);
                    mg.Add(BoxAt(0.06, 0.065, 0.165, (k - 1) * 0.05, 0.2 + k * 0.065, (k % 2) * 0.03, q), WorldMats.Get("redWhite"), I);
                }
            }
            else if (type == "repair" || type == "repairL")
            {
                bool big = type == "repairL";
                double by = big ? 0.25 : 0.16;
                mg.Add(BoxAt(big ? 0.8 : 0.5, big ? 0.42 : 0.26, big ? 0.45 : 0.24, 0, by, 0), WorldMats.Get("repair"), I);
                mg.Add(BoxAt(big ? 0.4 : 0.26, 0.04, 0.04, 0, big ? 0.5 : 0.32, 0), WorldMats.Get("darkSteel"), I);
                mg.Add(BoxAt(0.06, 0.06, 0.02, 0, by + 0.04, big ? 0.23 : 0.125), WorldMats.Get("chrome"), I);
                if (big)
                {
                    mg.Add(BoxAt(0.22, 0.06, 0.005, 0.15, 0.3, 0.232), WorldMats.Get("redWhite"), I);
                    mg.Add(BoxAt(0.06, 0.22, 0.005, 0.15, 0.3, 0.232), WorldMats.Get("redWhite"), I);
                }
            }
            else if (type == "rare")
            {
                mg.Add(BoxAt(0.7, 0.4, 0.45, 0, 0.22, 0), WorldMats.Get("rare"), I);
                mg.Add(BoxAt(0.72, 0.05, 0.47, 0, 0.3, 0), WorldMats.Get("rareTrim"), I);
                mg.Add(BoxAt(0.08, 0.42, 0.47, 0.2, 0.22, 0), WorldMats.Get("rareTrim"), I);
            }
            else if (type == "crate")
            {
                mg.Add(BoxAt(0.75, 0.6, 0.75, 0, 0.3, 0), WorldMats.Get("crate"), I);
                mg.Add(BoxAt(0.77, 0.08, 0.77, 0, 0.45, 0), WorldMats.Get("woodDark"), I);
                mg.Add(Geo.Plane(0.3, 0.2).Translate(0, 0.3, 0.378), WorldMats.Get("cash"), I);
            }
            return mg.Build(parent, "pickup_" + type);
        }

        static Mesh beaconMesh;
        /// <summary>pickupBeacon(color): a soft additive light pillar so pickups read at distance.</summary>
        public static GameObject PickupBeacon(Color color, Transform parent = null)
        {
            if (!beaconMesh) beaconMesh = Geo.Cylinder(0.18, 0.5, 4, 10, 1, true).Translate(0, 2, 0).ToMesh("beacon");
            var o = new GameObject("beacon");
            o.transform.SetParent(parent, false);
            o.AddComponent<MeshFilter>().sharedMesh = beaconMesh;
            var r = o.AddComponent<MeshRenderer>();
            var c = color; c.a = 0.12f;
            r.sharedMaterial = WorldMats.Unlit("beacon_" + ColorUtility.ToHtmlStringRGB(color), c, true);
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            return o;
        }
    }
}

// The workshop (port of scenes/garage.js): a real 3D room that grows with the garage level.
// Hosts the selected car on a slow orbit camera, focuses on parts for upgrades, plays
// install animations, shows the three starters side by side, opens the roller door, and
// the exotic dealer showroom.
//
// Unity notes: the JS uses its own THREE.Scene; here the room is a hierarchy placed at
// `Garage.Origin` (far below the world) and toggled with SetActive. Background colour and
// fog are applied to the camera / RenderSettings in Update; the PMREM environment map
// becomes a trilight ambient. The world's directional sun should be disabled by the caller
// while the garage is shown.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Downfall.Audio;
using static Downfall.GameMesh;
using Random = UnityEngine.Random;

namespace Downfall
{
    public sealed class Garage
    {
        public static Vector3 Origin = new Vector3(0, -2000, 0);   // Unity-space placement of the room
        static readonly (double w, double d, double h) ROOM = (13, 15, 5.2), SHOW = (24, 18, 6.5);

        public readonly GameObject root;
        public int level;
        public GameObject room, showroom;
        public List<CarView> cars = new List<CarView>();
        public CarView car;
        public List<CarView> lineup;
        public int lineIdx;
        public Vector3 camPos = V(5, 2, 6), camTarget = V(0, 0.6, 0);
        public sealed class Orbit { public double a = 0.7, r = 6.6, h = 1.75; public bool auto = true, drag; }
        public Orbit orbit = new Orbit();
        public string focus;
        public double door, doorTarget, hoodT, shake, time;
        public string mode;
        public readonly Particles particles;
        Transform turntable, podium;
        GameObject doorMesh;
        Light doorLight, keyLight;
        sealed class Lamp { public Light light; public float baseI; }
        readonly List<Lamp> lights = new List<Lamp>();
        bool motes;
        List<CarView> sideCars = new List<CarView>();
        readonly List<Material> roomMats = new List<Material>(), showMats = new List<Material>();
        Color background = Hex(0x0b0b0c);
        float fogNear = 18, fogFar = 40;
        double lastDrag;
        float lastMouseX;
        readonly RunTimers timers = new RunTimers();
        Color ambSky, ambGround; float ambI;

        public Garage(string quality)
        {
            root = new GameObject("Garage");
            root.transform.position = Origin;
            particles = new Particles(quality ?? "medium");
        }

        static AudioSys Au => AudioSys.A != null && AudioSys.A.Ready() ? AudioSys.A : null;
        static float Light(double i) => (float)(i * GameHelpers.LightScale);
        Vector3 SimOrigin => Coord.FromUnity(Origin);

        public bool visible { get => root.activeSelf; set => root.SetActive(value); }

        // ------------------------------------------------------------- helpers
        static GameObject Mesh(Transform p, MGeo g, Material m, double x, double y, double z, double rx = 0, double ry = 0, double rz = 0, bool cast = true)
        {
            var o = Obj("m", p, g, m, cast);
            SetSimLocal(o.transform, x, y, z);
            o.transform.localRotation = SimEuler(rx, ry, rz);
            return o;
        }
        Material Own(List<Material> l, Material m) { l.Add(m); return m; }
        Material Tiled(List<Material> l, string name, float u, float v)
        {
            var m = Own(l, Mats.Clone(name));
            m.SetTextureScale("_BaseMap", new Vector2(u, v)); m.SetTextureScale("_MainTex", new Vector2(u, v));
            return m;
        }
        static Light AddLight(Transform p, LightType type, int color, double intensity, double range, double x, double y, double z, double angle = 0)
        {
            var go = Node(type + "Light", p);
            var l = go.AddComponent<Light>();
            l.type = type; l.color = Hex(color); l.intensity = Light(intensity); l.range = (float)range;
            if (type == LightType.Spot) l.spotAngle = (float)(angle * 2 * Mathf.Rad2Deg);
            SetSimLocal(go.transform, x, y, z);
            return l;
        }
        static void Aim(Light l, double x, double y, double z)
        {
            var t = l.transform;
            var target = t.parent ? t.parent.TransformPoint(Coord.ToUnity(x, y, z)) : Coord.ToUnity(x, y, z);
            var dir = target - t.position;
            if (dir.sqrMagnitude > 1e-6f) t.rotation = Quaternion.LookRotation(dir, Vector3.up);
        }

        // ------------------------------------------------------------- room
        public void SetLevel(int lv)
        {
            if (lv == level && room) return;
            level = lv;
            if (room) { DestroyTree(room); foreach (var m in roomMats) GameMesh.Destroy(m); roomMats.Clear(); }
            room = Node("room", root.transform);
            var g = room.transform;
            int L = lv;
            var R = new Rng(L * 17 + 3);
            double w = ROOM.w, d = ROOM.d, h = ROOM.h;
            // floor
            var floorMat = Tiled(roomMats, "garageFloor" + Math.Max(0, Math.Min(5, L)), 4, 4);
            Mesh(g, Plane(w, d), floorMat, 0, 0, 0, -Math.PI / 2);
            if (L <= 3)
            {
                var sm = Own(roomMats, Mats.Clone("oilStains")); SetAlpha(sm, L == 1 ? 1 : 0.5f);
                Mesh(g, Plane(w * 0.8, d * 0.8), sm, 0, 0.004, 0, -Math.PI / 2, 0, 0, false);
            }
            if (L >= 2)
            {
                var lm = Own(roomMats, Std("bayLine", L >= 4 ? 0xe2a33b : 0xc9c3b0, 0.6f));
                foreach (var x in new[] { -2.6, 2.6 }) Mesh(g, Plane(0.1, 7.5), lm, x, 0.006, 0.5, -Math.PI / 2, 0, 0, false);
            }
            if (L >= 4)
            {
                turntable = Mesh(g, Cylinder(3.4, 3.4, 0.06, 48), Own(roomMats, Std("turntable", 0x1c1d1f, 0.3f, 0.6f)), 0, 0.03, 0).transform;
                Mesh(g, Torus(3.42, 0.025, 6, 64), Own(roomMats, Std("ring", 0xe2a33b, 0.5f, 0, 0xe2a33b, 0.6f)), 0, 0.065, 0, Math.PI / 2, 0, 0, false);
            }
            else turntable = null;
            // walls
            Material wallMat = L == 1 ? Mats.Get("woodDark") : L == 2 ? Tiled(roomMats, "blockWall", 4, 1.6f) : L == 3 ? Tiled(roomMats, "blockWallLight", 4, 1.6f)
                : L == 4 ? Own(roomMats, Std("wall4", 0x4a4e54, 0.7f, 0.2f)) : Own(roomMats, Std("wall5", 0x3a3d42, 0.45f, 0.25f));
            if (L == 1) wallMat = Tiled(roomMats, "woodDark", 4, 1.6f);
            void wall(double W, double H, double x, double z, double ry) => Mesh(g, Plane(W, H), wallMat, x, H / 2, z, 0, ry, 0);
            wall(d, h, -w / 2, 0, Math.PI / 2);
            wall(d, h, w / 2, 0, -Math.PI / 2);
            wall(w, h, 0, -d / 2, 0);
            // front wall with door opening (door is 4.6 wide x 3.4 high)
            double sideW = (w - 4.8) / 2;
            wall(sideW, h, -w / 2 + sideW / 2, d / 2, Math.PI); wall(sideW, h, w / 2 - sideW / 2, d / 2, Math.PI);
            Mesh(g, Plane(4.8, h - 3.5), wallMat, 0, 3.5 + (h - 3.5) / 2, d / 2, 0, Math.PI, 0);
            if (L >= 3)
            {
                var st = Own(roomMats, Std("stripe", L >= 4 ? 0xe2a33b : 0x2c4a6a, 0.6f, 0, L >= 4 ? 0xe2a33b : 0, L >= 4 ? 0.5f : 0));
                foreach (var (x, z, ry, len) in new[] { (-w / 2 + 0.01, 0.0, Math.PI / 2, d), (w / 2 - 0.01, 0.0, -Math.PI / 2, d), (0.0, -d / 2 + 0.01, 0.0, w) })
                    Mesh(g, Plane(len, L >= 4 ? 0.05 : 0.35), st, x, L >= 4 ? 2.6 : 1.2, z, 0, ry, 0, false);
            }
            // ceiling + beams
            Mesh(g, Plane(w, d), L <= 2 ? Mats.Get("woodDark") : Own(roomMats, Std("ceiling", 0x2a2b2d, 0.9f)), 0, h, 0, Math.PI / 2);
            var beams = new List<MGeo>();
            for (double z = -d / 2 + 1.5; z < d / 2; z += 3) beams.Add(Box(w, 0.3, 0.22).Translate(0, h - 0.15, z));
            Mesh(g, Merge(beams), L <= 2 ? Mats.Get("woodDark") : Mats.Get("darkSteel"), 0, 0, 0);
            // roller door
            var doorMat = Own(roomMats, Mats.Clone("corrugated")); SetColor(doorMat, Hex(L >= 4 ? 0x6a6e74 : 0xbab4a8)); SetPbr(doorMat, 0.7f, 0.5f);
            doorMesh = Mesh(g, Plane(4.6, 3.45), doorMat, 0, 1.72, d / 2 - 0.05, 0, Math.PI, 0);
            // outside light behind the door
            Mesh(g, Plane(30, 14), Own(roomMats, Basic("outside", 0xc7d3dc)), 0, 4, d / 2 + 3, 0, Math.PI, 0, false);
            doorLight = AddLight(g, LightType.Spot, 0xdbe6f0, 0, 26, 0, 3, d / 2 + 2, 0.7);
            Aim(doorLight, 0, 0, 0);
            // window with light shaft on the back wall
            Mesh(g, Plane(2.2, 1.1), Own(roomMats, Basic("window", 0xbfcbd2)), -3.5, 3.4, -d / 2 + 0.02, 0, 0, 0, false);
            Mesh(g, Box(2.3, 0.08, 0.06), Mats.Get("woodDark"), -3.5, 3.4, -d / 2 + 0.05);
            Mesh(g, Box(0.06, 1.15, 0.06), Mats.Get("woodDark"), -3.5, 3.4, -d / 2 + 0.05);
            if (L <= 3) Mesh(g, Cylinder(0.9, 2.2, 6, 4, 1, true), Own(roomMats, Additive("shaft", 0xfff2d8, 0.045f)), -2.6, 2.4, -d / 2 + 2.2, 0.75, Math.PI / 4, 0, false);
            // lights
            lights.Clear();
            ambSky = Hex(0xd8d4cc); ambGround = Hex(0x2a2622); ambI = (float)(L == 1 ? 0.6 : 1.0 + L * 0.22);
            keyLight = AddLight(g, LightType.Spot, L >= 4 ? 0xf4f6ff : 0xffe2b8, L == 1 ? 70 : 110, 16, 0.5, h - 0.3, 0.8, 0.85);
            Aim(keyLight, 0, 0, 0);
            keyLight.shadows = LightShadows.Soft; keyLight.shadowBias = 0.0005f; keyLight.shadowNormalBias = 0.02f;
            var lampPos = L == 1 ? new[] { (0.5, 0.8) } : L == 2 ? new[] { (-2.0, 0.0), (2.0, 0.0) } : new[] { (-2.5, -3.0), (2.5, -3.0), (-2.5, 3.0), (2.5, 3.0) };
            foreach (var (x, z) in lampPos)
            {
                if (L <= 2)
                {
                    Mesh(g, Cone(0.32, 0.25, 16, 1, true), Own(roomMats, Std("shade", 0x3a4a3a, 0.4f, 0.6f, 0, 0, true)), x, h - 1.2, z);
                    Mesh(g, Sphere(0.07, 10, 8), Own(roomMats, Basic("bulb", 0xffe6b8)), x, h - 1.3, z, 0, 0, 0, false);
                    Mesh(g, Cylinder(0.008, 0.008, 1.1, 8), Mats.Get("plastic"), x, h - 0.6, z, 0, 0, 0, false);
                    var pl = AddLight(g, LightType.Point, 0xffd9a8, L == 1 ? 6 : 8, 9, x, h - 1.4, z);
                    lights.Add(new Lamp { light = pl, baseI = pl.intensity });
                }
                else
                {
                    Mesh(g, Box(L >= 5 ? 2.6 : 1.6, 0.06, L >= 5 ? 1.2 : 0.14), Own(roomMats, Std("tube", 0xffffff, 0.5f, 0, L >= 4 ? 0xeaf0ff : 0xf8f4e8, 2)), x, h - 0.4, z, 0, 0, 0, false);
                    var pl = AddLight(g, LightType.Point, L >= 4 ? 0xeef2ff : 0xfff6e6, 9, 11, x, h - 0.7, z);
                    lights.Add(new Lamp { light = pl, baseI = pl.intensity });
                }
            }
            BuildProps(g, L, R);
            room.SetActive(mode != "dealer");
        }

        // Blender-made workshop furniture (Resources/Prefabs/Garage); grows with the level.
        void BuildAssetProps(Transform g, int L)
        {
            double w = ROOM.w, d = ROOM.d, h = ROOM.h;
            GameObject put(string name, double x, double z, double ry = 0, double y = 0, double s = 1)
            {
                var o = Mats.Spawn(name, g);
                if (!o) return null;
                SetSimLocal(o.transform, x, y, z); o.transform.localRotation = SimY(ry); o.transform.localScale = Vector3.one * (float)s;
                foreach (var r in o.GetComponentsInChildren<Renderer>()) { r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On; r.receiveShadows = true; }
                return o;
            }
            double E = Math.PI / 2, W = -Math.PI / 2;
            put("g_bench", -w / 2 + 0.45, -3.2, E);
            put("g_drums", w / 2 - 1.2, -5.8, 0.3);
            put("g_jack", 3.4, 4.2, 2.6);
            if (L >= 2) { put("g_toolchest", -w / 2 + 0.45, 0.6, E); put("g_shelf", 2.6, -d / 2 + 0.4, 0); put("g_compressor", w / 2 - 0.6, 4.8, W); }
            if (L >= 3) { put("g_lift", w / 2 - 1.3, 1.2, W); put("g_tirerack", -2.6, -d / 2 + 0.4, 0); put("g_engine", -4.5, 4.4, 2.2); put("g_hoist", -3.6, 5.3, 2.0); }
            if (L >= 4) { put("fridge", -w / 2 + 0.55, 3.0, E); put("g_lounge", -0.3, -d / 2 + 2.0, 0); }
            if (L >= 5) put("g_bar", 4.6, -d / 2 + 0.5, 0);
            if (L <= 2 && Mats.Prefab("barnlamp"))
            {
                var pts = L == 1 ? new[] { (0.5, 0.8), (-3.5, -3.0) } : new[] { (-2.0, 0.0), (2.0, 0.0), (-3.5, -3.0) };
                foreach (var (x, z) in pts)
                {
                    put("barnlamp", x, z, 0, h - 1.5, 2.6);
                    Mesh(g, Cylinder(0.008, 0.008, 1.2, 8), Mats.Get("plastic"), x, h - 0.6, z, 0, 0, 0, false);
                }
            }
            else if (L >= 3) foreach (var (x, z) in new[] { (-2.5, -3.0), (2.5, -3.0), (-2.5, 3.0), (2.5, 3.0) }) put("g_fixture", x, z, 0, h - 0.75);
            foreach (var (k, x) in new[] { ("map", -0.6), ("oil", 4.6), ("race", -5.2) })
            {
                if (k == "race" && L < 2) continue;
                if (L >= 4 && k == "map") continue;
                Mesh(g, Plane(0.75, 1.05), Mats.Get("poster_" + k), x, 2.7, -d / 2 + 0.02, 0, 0, 0, false);
            }
            if (L >= 4)
            {
                var cover = Mesh(g, Sphere(1, 24, 14), Own(roomMats, Std("cover", 0x34363a, 0.95f)), 4.6, 0.55, -3.6, 0, 0.15, 0);
                cover.transform.localScale = new Vector3(1.0f, 0.62f, 2.3f);
            }
            motes = L <= 3;
        }

        void BuildProps(Transform g, int L, Rng R)
        {
            if (Mats.Prefab("g_bench")) { BuildAssetProps(g, L); return; }
            double w = ROOM.w, d = ROOM.d;
            Material M(string n) => Mats.Get(n);
            // workbench along the left wall
            var bench = Node("bench", g).transform;
            Mesh(bench, Box(3.6, 0.08, 0.9), L >= 4 ? M("darkSteel") : M("wood"), 0, 0.92, 0);
            foreach (var x in new[] { -1.7, 1.7 }) foreach (var z in new[] { -0.38, 0.38 }) Mesh(bench, Box(0.07, 0.92, 0.07), M("darkSteel"), x, 0.46, z);
            Mesh(bench, Box(3.5, 0.04, 0.8), M("woodDark"), 0, 0.25, 0);
            Mesh(bench, RoundedBox(0.25, 0.18, 0.3, 0.03), Own(roomMats, Std("vise", 0x3a5a7a, 0.4f, 0.5f)), 1.4, 1.05, 0);
            for (int i = 0; i < 5; i++) Mesh(bench, Box(0.28 + i * 0.03, 0.012, 0.035), M("steel"), -1.2 + i * 0.16, 0.97, 0.15 + (i % 2) * 0.1, 0, 0.2 * i, 0);
            Mesh(bench, Cylinder(0.09, 0.1, 0.24, 14), Own(roomMats, Std("can", 0x8a2a1e, 0.5f, 0.4f)), 0.3, 1.08, -0.2);
            Obj("lampArm", bench, Beam(new[] { 0, 0.96, -0.35 }, new[] { 0.1, 1.6, -0.1 }, 0.015), M("darkSteel"));
            SetSimLocal(bench, -w / 2 + 0.55, 0, -2.5); bench.localRotation = SimY(Math.PI / 2);
            // pegboard with tool silhouettes
            Mesh(g, Plane(3.4, 1.4), M("pegboard"), -w / 2 + 0.03, 1.9, -2.5, 0, Math.PI / 2, 0);
            for (int i = 0; i < 9; i++) Mesh(g, Box(0.02, 0.32 + (i % 3) * 0.1, 0.04), M("steel"), -w / 2 + 0.06, 1.9 + (i % 2) * 0.2, -3.9 + i * 0.32);
            // tool chest
            Mesh(g, RoundedBox(1.0, 1.05, 0.55, 0.03), Own(roomMats, Std("chest", L >= 4 ? 0x1d1f22 : 0x8e2219, 0.4f, 0.4f)), -w / 2 + 0.5, 0.53, 0.6, 0, Math.PI / 2, 0);
            for (int i = 0; i < 5; i++) Mesh(g, Box(0.02, 0.012, 0.8), M("chrome"), -w / 2 + 0.79, 0.25 + i * 0.18, 0.6);
            // tyre stack
            var tireGeo = Lathe(new[] { new Vector2(0.2f, -0.1f), new Vector2(0.3f, -0.11f), new Vector2(0.32f, -0.08f), new Vector2(0.32f, 0.08f), new Vector2(0.3f, 0.11f), new Vector2(0.2f, 0.1f) }, 28).RotateZ(Math.PI / 2);
            for (int i = 0; i < (L == 1 ? 3 : 5); i++) Mesh(g, tireGeo.Clone(), M("tire_street"), w / 2 - 0.9, 0.12 + i * 0.23, -5.6 + (i % 2) * 0.05, 0, 0, Math.PI / 2);
            // oil drums
            var drumMat = Own(roomMats, Std("drum", L <= 2 ? 0x34503a : 0x2b4a6e, 0.6f, 0.5f));
            foreach (var (x, z) in new[] { (w / 2 - 0.5, -3.6), (w / 2 - 1.2, -3.9) }) Mesh(g, Cylinder(0.3, 0.3, 0.9, 18), drumMat, x, 0.45, z);
            // shelving with boxes on the back wall
            var sh = Node("shelf", g).transform;
            foreach (var y in new[] { 0.4, 1.2, 2.0 }) Mesh(sh, Box(3, 0.04, 0.5), L >= 4 ? M("darkSteel") : M("woodDark"), 0, y, 0);
            foreach (var x in new[] { -1.45, 1.45 }) Mesh(sh, Box(0.05, 2.2, 0.5), M("darkSteel"), x, 1.1, 0);
            int[] boxCols = { 0x8a2a1e, 0x2b4a6e, 0xc9a227 };
            for (int i = 0; i < 9; i++)
            {
                double bw = 0.35 + R.Next() * 0.3, bh = 0.25 + R.Next() * 0.2;
                var bm = R.Next() < 0.5 ? M("cardboard") : Own(roomMats, Std("box", boxCols[i % 3], 0.5f));
                Mesh(sh, Box(bw, bh, 0.35), bm, -1.2 + (i % 4) * 0.75, 0.55 + Math.Floor(i / 4.0) * 0.8, 0);
            }
            SetSimLocal(sh, 2.4, 0, -d / 2 + 0.35);
            foreach (var (k, x) in new[] { ("map", -0.6), ("oil", 4.6), ("race", -5.8) })
            {
                if (k == "race" && L < 2) continue;
                Mesh(g, Plane(0.75, 1.05), M("poster_" + k), x, 2.6, -d / 2 + 0.02, 0, 0, 0, false);
            }
            // two-post lift on the right
            var lift = Node("lift", g).transform;
            var postMat = Own(roomMats, Std("post", L >= 3 ? 0x2c5a8a : 0x6a6a5a, 0.5f, 0.5f));
            foreach (var z in new[] { -1.6, 1.6 })
            {
                Mesh(lift, Box(0.3, 3.6, 0.3), postMat, 0, 1.8, z);
                Mesh(lift, Box(1.6, 0.08, 0.12), M("darkSteel"), -0.8, 0.5, z * 0.85);
            }
            SetSimLocal(lift, w / 2 - 0.9, 0, 1.6);
            Mesh(g, RoundedBox(0.35, 0.18, 1.0, 0.03), Own(roomMats, Std("jack", 0xb8301e, 0.5f, 0.4f)), 3.2, 0.1, 3.6, 0, 0.4, 0);
            if (L >= 2) Mesh(g, Cylinder(0.28, 0.28, 0.9, 16), Own(roomMats, Std("comp", 0xc9a227, 0.5f, 0.3f)), w / 2 - 0.8, 0.35, 4.5, 0, 0, Math.PI / 2);
            if (L >= 3)
            {
                var cart = Node("cart", g).transform;
                Mesh(cart, RoundedBox(0.6, 0.9, 0.5, 0.03), M("darkSteel"), 0, 0.45, 0);
                Mesh(cart, Plane(0.5, 0.32), Own(roomMats, Std("screen", 0x0a1a12, 0.5f, 0, 0x3aa06a, 0.8f)), 0, 1.15, 0.05, -0.2, 0, 0, false);
                SetSimLocal(cart, -3.4, 0, 4.2); cart.localRotation = SimY(2.4);
                Mesh(g, RoundedBox(0.7, 1.0, 0.7, 0.04), Own(roomMats, Std("changer", 0x8a2a1e, 0.5f, 0.3f)), w / 2 - 1.1, 0.5, -1.6);
            }
            if (L >= 4)
            {
                var cover = Mesh(g, Sphere(1, 20, 12), Own(roomMats, Std("cover", 0x3a3c40, 0.95f)), -4.4, 0.55, -5.4, 0, 0.1, 0);
                cover.transform.localScale = new Vector3(1.0f, 0.65f, 2.3f);
            }
            if (L >= 5)
            {
                Mesh(g, Box(2.6, 0.05, 0.35), M("chrome"), -2.6, 2.1, -d / 2 + 0.2);
                var gold = Own(roomMats, Std("trophy", 0xd0a14a, 0.25f, 1));
                for (int i = 0; i < 5; i++) Mesh(g, Cylinder(0.05, 0.09, 0.3 + (i % 2) * 0.1, 10), gold, -3.6 + i * 0.5, 2.3, -d / 2 + 0.2);
            }
            motes = L <= 3;
        }

        // ------------------------------------------------------------- dealership
        // 'workshop' (the player's garage) or 'dealer' (the exotic car showroom)
        public void SetMode(string m)
        {
            if (m == mode) return;
            mode = m;
            if (m == "dealer" && !showroom) BuildShowroom();
            if (room) room.SetActive(m != "dealer");
            if (showroom) showroom.SetActive(m == "dealer");
            fogNear = m == "dealer" ? 30 : 18; fogFar = m == "dealer" ? 70 : 40;
            background = Hex(m == "dealer" ? 0xd7dde2 : 0x0b0b0c);
            orbit.r = m == "dealer" ? 7.4 : 6.6;
            if (m != "dealer") SetSideCars(new List<CarDef>());
        }

        void BuildShowroom()
        {
            showroom = Node("showroom", root.transform);
            var g = showroom.transform;
            double SW = SHOW.w, SD = SHOW.d, SH = SHOW.h;
            Mesh(g, Plane(SW, SD), Own(showMats, Std("showFloor", 0x55585e, 0.14f, 0.2f)), 0, 0, 0, -Math.PI / 2);
            var tiles = Own(showMats, Mats.Create(new MatDef("showTiles", Color.white, 0.2f).Tex("Generated/concrete_7_0.25").Transparent(0.25f).Tile(6, 5)));
            Mesh(g, Plane(SW, SD), tiles, 0, 0.002, 0, -Math.PI / 2, 0, 0, false);
            var wallM = Own(showMats, Std("showWall", 0xe6e3dd, 0.8f));
            var darkM = Own(showMats, Std("showDark", 0x1a1b1d, 0.5f, 0.3f));
            void wall(double W, double H, double x, double z, double ry, Material m) => Mesh(g, Plane(W, H), m, x, H / 2, z, 0, ry, 0);
            wall(SD, SH, -SW / 2, 0, Math.PI / 2, wallM);
            wall(SD, SH, SW / 2, 0, -Math.PI / 2, wallM);
            wall(SW, SH, 0, -SD / 2, 0, Own(showMats, Std("showBack", 0x8c8b88, 0.85f)));
            Mesh(g, Plane(9, 1.8), darkM, 0, 4.6, -SD / 2 + 0.02, 0, 0, 0, false);
            // brand wall with backlit name (fictional dealer)
            Mesh(g, Plane(8, 1.25), Mats.Get("dealerSign"), 0, 4.6, -SD / 2 + 0.03, 0, 0, 0, false);
            // glass front with mullions and a bright outside
            Mesh(g, Plane(SW, SH), Own(showMats, Mats.Create(new MatDef("showGlass", Hex(0xbfd0dc), 0.05f).Transparent(0.18f).TwoSided())), 0, SH / 2, SD / 2, 0, Math.PI, 0, false);
            for (int k = -4; k <= 4; k++) Mesh(g, Box(0.12, SH, 0.12), darkM, k * SW / 9, SH / 2, SD / 2);
            Mesh(g, Plane(60, 20), Own(showMats, Basic("showOutside", 0xdfe8ee)), 0, 6, SD / 2 + 6, 0, Math.PI, 0, false);
            Mesh(g, Plane(SW, SD), Own(showMats, Std("showCeil", 0xb8b6b2, 0.9f)), 0, SH, 0, Math.PI / 2);
            var stripM = Own(showMats, Std("strip", 0xffffff, 0.5f, 0, 0xf4f6ff, 2.2f));
            for (int k = -3; k <= 3; k++) Mesh(g, Box(SW * 0.85, 0.05, 0.16), stripM, 0, SH - 0.05, k * 2.2, 0, 0, 0, false);
            foreach (var (x, z) in new[] { (-6.0, -4.0), (6.0, -4.0), (-6.0, 4.0), (6.0, 4.0), (0.0, 5.0) }) AddLight(g, LightType.Point, 0xfff8ee, 30, 16, x, SH - 0.6, z);
            var key = AddLight(g, LightType.Spot, 0xffffff, 260, 22, 0, SH - 0.3, 1.5, 0.55); Aim(key, 0, 0, 0); key.shadows = LightShadows.Soft;
            foreach (var x in new[] { -7.0, 7.0 }) { var sp = AddLight(g, LightType.Spot, 0xfff4e6, 120, 16, x, SH - 0.3, -2, 0.5); Aim(sp, x, 0, -3.5); }
            // the turntable podium and two side plinths
            var pod = Mats.Spawn("g_podium", g);
            if (pod)
            {
                var top = Own(showMats, Std("podTop", 0x1d1f23, 0.16f, 0.65f));
                foreach (var r in pod.GetComponentsInChildren<MeshRenderer>())
                {
                    r.receiveShadows = true;
                    var arr = r.sharedMaterials;
                    for (int i = 0; i < arr.Length; i++) if (arr[i] && arr[i].name.Contains("checker")) arr[i] = top;
                    r.sharedMaterials = arr;
                }
                podium = pod.transform;
            }
            Mats.Spawn("g_stanchions", g);
            foreach (var x in new[] { -7.0, 7.0 }) Mesh(g, Cylinder(2.6, 2.6, 0.12, 48), darkM, x, 0.06, -3.5);
            var lounge = Mats.Spawn("g_lounge", g); if (lounge) { SetSimLocal(lounge.transform, -8.5, 0, 6); lounge.transform.localRotation = SimY(Math.PI * 0.75); }
            var bar = Mats.Spawn("g_bar", g); if (bar) { SetSimLocal(bar.transform, 8.8, 0, 6.5); bar.transform.localRotation = SimY(-Math.PI / 2); }
            showroom.SetActive(false);
        }

        // ambient of the active room (stands in for the hemisphere light + PMREM environment)
        void ApplyAmbient()
        {
            Color sky = mode == "dealer" ? Hex(0xf2f4f8) : ambSky, ground = mode == "dealer" ? Hex(0x6a6662) : ambGround;
            float i = mode == "dealer" ? 2.4f : ambI;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = sky * i * 0.45f;
            RenderSettings.ambientEquatorColor = Color.Lerp(sky, ground, 0.5f) * i * 0.4f;
            RenderSettings.ambientGroundColor = ground * i * 0.4f;
        }

        // extra display cars on the side plinths of the showroom
        public void SetSideCars(List<CarDef> list)
        {
            foreach (var c in sideCars) c.Dispose();
            sideCars = list.Take(2).Select((cd, i) =>
            {
                var m = new CarView(cd, new CarViewOpts());
                m.group.SetParent(root.transform, false);
                m.SetStaticWheels(0.3);
                SetLocalPose(m, V(i != 0 ? 7 : -7, 0.12 - m.dims.yG, -3.5), i != 0 ? -0.6 : 0.6);
                return m;
            }).ToList();
        }

        static void SetLocalPose(CarView m, Vector3 simPos, double ry)
        {
            m.group.localPosition = Coord.ToUnity(simPos);
            m.group.localRotation = SimY(ry);
        }
        static double Yaw(CarView m) { var e = Coord.FromUnity(m.group.localRotation * Vector3.forward); return Math.Atan2(e.x, e.z); }

        // ------------------------------------------------------------- cars
        public CarView ShowCar(CarDef cd, CarViewOpts opts)
        {
            ClearCars();
            var m = new CarView(cd, opts);
            m.group.SetParent(root.transform, false);
            m.SetStaticWheels(0);
            SetLocalPose(m, V(0, -m.dims.yG + (mode == "dealer" ? 0.16 : 0), 0), 0);
            car = m; carYaw = 0;
            cars = new List<CarView> { m };
            lineup = null;
            return m;
        }
        public void ShowLineup(IList<CarDef> list)
        {
            ClearCars();
            lineup = list.Select((c, i) =>
            {
                var m = new CarView(c, new CarViewOpts());
                m.group.SetParent(root.transform, false);
                m.SetStaticWheels(0.25);
                SetLocalPose(m, V((i - 1) * 3.4, -m.dims.yG, -0.5 + Math.Abs(i - 1) * 0.6), (i - 1) * -0.25);
                return m;
            }).ToList();
            lineYaw = lineup.Select((_, i) => (i - 1) * -0.25).ToList();
            cars = lineup;
            lineIdx = 1;
            car = lineup.Count > 1 ? lineup[1] : lineup.FirstOrDefault();
        }
        public void ClearCars()
        {
            foreach (var c in cars) c.Dispose();
            cars = new List<CarView>(); car = null;
        }
        double carYaw; List<double> lineYaw = new List<double>();

        // focus a part: engine | wheel | suspension | front | rear | cabin | under | null
        public void SetFocus(string f) { focus = f; if (car != null) hoodT = f == "engine" ? 1 : 0; }

        // install animation: ratchet, impact wrench, sparks (330 ms steps); onDone when finished
        public void Install(string cat, Action onDone = null)
        {
            var a = Au; var c = car;
            if (c == null) { onDone?.Invoke(); return; }
            var p = FocusPoint(focus ?? "front");
            var world = Coord.FromUnity(c.group.TransformPoint(Coord.ToUnity(p)));
            var seq = new Action[]
            {
                () => a?.Ratchet(7),
                () => a?.ImpactWrench(0.6f),
                () => { a?.Metal(0.35f, 300); particles.Sparks(world.x, world.y, world.z, 0, 1, 0, 14); },
                () => a?.Ratchet(5, 0, 0.035f),
                () => { a?.ImpactWrench(0.35f); particles.Sparks(world.x, world.y + 0.1f, world.z, 0, 1, 0, 10); },
            };
            for (int i = 0; i < seq.Length; i++) timers.After(i * 330, seq[i]);
            timers.After(seq.Length * 330, () => { shake = 0.12; onDone?.Invoke(); });
            _ = cat;
        }

        public Vector3 FocusPoint(string f)
        {
            var d = car.dims;
            switch (f)
            {
                case "engine": return V(0, d.yNose + 0.1, (d.a + d.zF) / 2);
                case "wheel": return V(d.half, d.wcY, d.a);
                case "suspension": return V(d.half, d.wcY + 0.2, -d.b);
                case "front": return V(0, d.bottom + 0.3, d.zF);
                case "rear": return V(-d.half * 0.5, d.yBelt, d.zR);
                case "cabin": return V(d.half, d.yBelt + 0.3, 0);
                case "under": return V(d.half, d.bottom, 0);
                default: return V(0, 0.4, 0);
            }
        }
        // camera offset (car local) for each focus
        public Vector3? FocusCam(string f)
        {
            var d = car.dims;
            switch (f)
            {
                case "engine": return V(1.5, d.roof + 1.3, d.zF + 2.0);
                case "wheel": return V(d.half + 2.2, d.wcY + 0.5, d.a + 1.6);
                case "suspension": return V(d.half + 2.0, d.wcY + 0.2, -d.b - 1.6);
                case "front": return V(-1.2, d.yBelt + 0.4, d.zF + 2.6);
                case "rear": return V(1.6, d.roof + 0.6, d.zR - 2.8);
                case "cabin": return V(d.half + 2.4, d.roof + 0.4, 0.6);
                case "under": return V(d.half + 2.6, d.bottom + 0.3, -0.5);
                default: return null;
            }
        }

        public void OpenDoor() { doorTarget = 1; Au?.GarageDoor(2.6f); }

        // bindPointer(): drag to orbit, wheel to zoom (ignored over UI)
        void Pointer()
        {
            bool overUi = UnityEngine.EventSystems.EventSystem.current != null && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject();
            double now = Time.realtimeSinceStartup * 1000.0;
            if (Input.GetMouseButtonDown(0) && !overUi) { orbit.drag = true; orbit.auto = false; lastMouseX = Input.mousePosition.x; lastDrag = now; }
            if (orbit.drag && Input.GetMouseButton(0))
            {
                // screen x grows to the right like clientX
                orbit.a -= (Input.mousePosition.x - lastMouseX) * 0.006; lastMouseX = Input.mousePosition.x; lastDrag = now;
            }
            if (Input.GetMouseButtonUp(0)) orbit.drag = false;
            float wheel = Input.mouseScrollDelta.y;
            if (wheel != 0 && !overUi) orbit.r = U.Clamp(orbit.r - wheel * 0.4, 4.2, 9);
        }

        // car-local simulation point to garage space (simulation axes, garage origin)
        Vector3 CarToRoom(CarView c, Vector3 p) => Coord.FromUnity(root.transform.InverseTransformPoint(c.group.TransformPoint(Coord.ToUnity(p))));

        public void Update(double dt, Camera camera)
        {
            time += dt;
            timers.Tick(dt);
            Pointer();
            double now = Time.realtimeSinceStartup * 1000.0;
            if (!orbit.auto && !orbit.drag && now - lastDrag > 5000) orbit.auto = true;
            if (orbit.auto && focus == null) orbit.a += dt * 0.12;
            // lights flicker a touch in the old shed
            foreach (var l in lights)
                if (level == 1 && l.light) l.light.intensity = l.baseI * (float)(0.92 + Math.Sin(time * 23) * 0.03 + (Random.value < 0.01 ? -0.35 : 0));
            Vector3 target = V(0, 0.7, 0); Vector3? camWanted = null;
            if (lineup != null && lineup.Count > 0)
            {
                var m = lineup[Math.Max(0, Math.Min(lineup.Count - 1, lineIdx))];
                target = SimLocalPos(m.group); target.y = 0.75f;
                camWanted = target + V(Math.Sin(0.45 + Math.Sin(time * 0.15) * 0.12) * 7.4, 1.7, Math.Cos(0.45) * 7.4);
                // frame the car left of centre so the stat card does not cover it
                target.x += 1.9f; target.z -= 0.6f;
                for (int i = 0; i < lineup.Count; i++)
                {
                    var c = lineup[i];
                    lineYaw[i] = U.Damp(lineYaw[i], c == m ? -0.35 + Math.Sin(time * 0.2) * 0.1 : lineYaw[i], 2, dt);
                    c.group.localRotation = SimY(lineYaw[i]);
                }
            }
            else if (car != null)
            {
                var c = car;
                if (mode == "dealer") { carYaw += dt * 0.2; c.group.localRotation = SimY(carYaw); if (podium) podium.localRotation = SimY(carYaw); }
                else if (turntable && orbit.auto && focus == null) { carYaw += dt * 0.15; c.group.localRotation = SimY(carYaw); turntable.localRotation = SimY(carYaw); }
                c.OpenHood(U.Damp(c.hood, hoodT, 4, dt));
                var fc = focus != null ? FocusCam(focus) : null;
                if (fc.HasValue)
                {
                    camWanted = CarToRoom(c, fc.Value);
                    target = CarToRoom(c, FocusPoint(focus));
                }
                else camWanted = V(Math.Sin(orbit.a) * orbit.r, orbit.h + Math.Sin(time * 0.13) * 0.15, Math.Cos(orbit.a) * orbit.r);
            }
            if (doorTarget > 0)
            {
                // exit sequence: look out of the door
                camWanted = V(0.8, 1.6, -4.5);
                target = V(0, 1.2, ROOM.d / 2 + 4);
            }
            if (camWanted.HasValue)
            {
                var cw = camWanted.Value;
                camPos.x = (float)U.Damp(camPos.x, cw.x, 2.4, dt); camPos.y = (float)U.Damp(camPos.y, cw.y, 2.4, dt); camPos.z = (float)U.Damp(camPos.z, cw.z, 2.4, dt);
                camTarget.x = (float)U.Damp(camTarget.x, target.x, 3, dt); camTarget.y = (float)U.Damp(camTarget.y, target.y, 3, dt); camTarget.z = (float)U.Damp(camTarget.z, target.z, 3, dt);
            }
            // keep the camera inside the room
            var RM = mode == "dealer" ? SHOW : ROOM;
            camPos.x = (float)U.Clamp(camPos.x, -RM.w / 2 + 0.6, RM.w / 2 - 0.6);
            camPos.z = (float)U.Clamp(camPos.z, -RM.d / 2 + 0.6, RM.d / 2 - 0.6);
            camPos.y = (float)U.Clamp(camPos.y, 0.3, RM.h - 0.4);
            var cp = camPos;
            if (shake > 0) { shake -= dt; cp.x += (float)((Random.value - 0.5) * shake * 0.15); cp.y += (float)((Random.value - 0.5) * shake * 0.15); }
            if (camera)
            {
                var up = root.transform.TransformPoint(Coord.ToUnity(camPos));
                var ut = root.transform.TransformPoint(Coord.ToUnity(camTarget));
                camera.transform.SetPositionAndRotation(root.transform.TransformPoint(Coord.ToUnity(cp)), Quaternion.LookRotation(ut - up, Vector3.up));
                camera.fieldOfView = (float)U.Damp(camera.fieldOfView, focus != null ? 42 : 48, 3, dt);
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = background;
            }
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = background;
            RenderSettings.fogStartDistance = fogNear; RenderSettings.fogEndDistance = fogFar;
            ApplyAmbient();
            // door
            door = U.Damp(door, doorTarget, 1.3, dt);
            if (doorMesh)
            {
                var s = doorMesh.transform.localScale; s.y = (float)Math.Max(0.02, 1 - door); doorMesh.transform.localScale = s;
                var p = SimLocalPos(doorMesh.transform); p.y = (float)(3.45 - 3.45 * (1 - door) / 2); SetSimLocal(doorMesh.transform, p);
                if (doorLight) doorLight.intensity = Light(door * 220);
            }
            // dust motes
            float R() => Random.value;
            var o = SimOrigin;
            if (motes && R() < dt * 6)
                particles.soft.Emit(o.x - 2.6f + (R() - 0.5f) * 2, o.y + 1 + R() * 2.5f, o.z - (float)ROOM.d / 2 + 2 + (R() - 0.5f) * 2, (R() - 0.5f) * 0.05f, -0.02f, (R() - 0.5f) * 0.05f, 6, 0.05f, 0.05f, 0.5f, 1, 0.95f, 0.85f, 0, 0.1f);
            particles.Update((float)dt);
            particles.Draw(camera);
        }

        public void Dispose()
        {
            ClearCars();
            foreach (var c in sideCars) c.Dispose();
            DestroyTree(root);
            foreach (var m in roomMats.Concat(showMats)) GameMesh.Destroy(m);
        }
    }
}

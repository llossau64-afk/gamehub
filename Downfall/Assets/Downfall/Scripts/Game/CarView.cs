// The visual car (port of models/carModel.js `CarModel`; renamed because `CarModel` is the
// car's model *definition* in Data/Cars.cs). Body from the Blender export
// (Resources/Prefabs/Cars/car_<id>, see Art/MANIFEST.md) or, when that is missing, the parametric
// lofted body of the web build; wheels, suspension, engine bay, upgrade parts, lamps, damage
// (dents, hanging/detached bumpers, broken lights, cracked glass) and wear always come from code.
//
// Every number below is in simulation space (right-handed, +x = left, cars face +z, origin =
// centre of mass); Unity transforms are set through Coord / GameMesh.Sim* helpers.
//
// Unity notes (closest equivalents of three.js tricks):
//  - paint wear (dirt / rust / scratches) was a shader patch; here it tints the paint colour and
//    lowers smoothness (no URP wear shader yet).
//  - the canvas instrument cluster is redrawn into a Texture2D (dials, needles, bars; no text).
//  - bake() merges static parts per material with Mesh.CombineMeshes.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using static Downfall.GameMesh;

namespace Downfall
{
    public sealed class CarViewOpts
    {
        public Dictionary<string, int> levels;
        public string tire;
        public CarStats stats;
        public int? paint;
        public string finish;
        public bool procedural;
    }

    public sealed class CarView
    {
        public sealed class Part
        {
            public string name;
            public GameObject go;
            public MeshFilter mf;
            public MeshRenderer mr;
            public Vector3[] orig;       // simulation-space vertices (dent reference)
            public bool detached;
            public Material material { get => mr ? mr.sharedMaterial : null; set { if (mr) mr.sharedMaterial = value; } }
            public bool visible { get => go && go.activeSelf; set { if (go) go.SetActive(value); } }
            public Transform parent => go ? go.transform.parent : null;
        }

        public sealed class WheelView
        {
            public Transform pivot, wg, spin, caliper, tire, face;
            public bool front, left;
            public Quaternion spinBase;
            public double spinAngle;
        }

        // ---------------------------------------------------------------- public state (JS names)
        public readonly CarDef car;
        public readonly CarViewOpts opts;
        public readonly GameObject gameObject;
        public readonly Transform group;
        public Dictionary<string, int> levels;
        public string tireId;
        public Phys ph;
        public double topKmh;
        public BodyType T;
        public CarDimsResult dims;
        public readonly Dictionary<string, Part> parts = new Dictionary<string, Part>();
        public List<WheelView> wheels = new List<WheelView>();
        public double wheelWidth;
        public List<Vector3> exhaustTips = new List<Vector3>();
        public Vector3 enginePos;
        public double[] eye, hoodEye, headPos;
        public double[] exhaustPos;
        public bool fromAsset, baked, lightsOn;
        public double hood;
        public Transform hoodPivot, exhaustGroup, engineBay, extras, upg, hoodExtras, turboMesh;
        public Material paintMat, trimMat, bumperMat, oddMat, glassMat, crackMat, lightMatL, lightMatR, tailMat, strutMat, caliperMat, liveryMat;
        public sealed class Wear { public double dirt, rust, scratch; }
        public Wear wear = new Wear();
        public double? rackY;
        public bool cageForced;
        public Dictionary<string, Transform> engineParts = new Dictionary<string, Transform>();
        public List<Transform> flameMeshes; // Run.Flames
        public object userData;

        List<Part> deform = new List<Part>();
        Quaternion? steerBase;
        bool cockpitOn;
        double tailK;
        Color paintColor;
        float paintRough, paintMetal;
        readonly List<Material> owned = new List<Material>();
        readonly HashSet<Mesh> keepMeshes = new HashSet<Mesh>();
        Gauge gauge;

        static readonly Color HEAD_EMIT = Hex(0xfff1d6), TAIL_EMIT = Hex(0xff1d10);

        public bool cockpit { get => cockpitOn; set => cockpitOn = value; }

        public CarView(CarDef car, CarViewOpts opts = null)
        {
            this.car = car;
            this.opts = opts ?? new CarViewOpts();
            gameObject = new GameObject("car_" + car.id);
            group = gameObject.transform;
            levels = this.opts.levels != null ? new Dictionary<string, int>(this.opts.levels) : new Dictionary<string, int>();
            tireId = this.opts.tire ?? "worn";
            var st = this.opts.stats ?? Stats.ComputeStats(car, levels, tireId);
            ph = st.phys;
            topKmh = st.top;
            Build();
            SetUpgrades(levels, tireId);
            ResetDamage();
        }

        Material Own(Material m) { if (m) owned.Add(m); return m; }
        static Material M(string name) => Mats.Get(name);

        int L(string k) => levels.TryGetValue(k, out var v) ? v : 0;

        // ---------------------------------------------------------------- build
        void Build()
        {
            var md = car.model;
            T = CarDims.TypeOf(md);
            int paint = opts.paint ?? md.paint;
            paintMat = MakePaint(paint, opts.finish ?? (md.sport != 0 ? "metallic" : "solid"));
            trimMat = Own(Mats.Clone("car_trim"));
            SetColor(trimMat, Hex(md.trim)); SetPbr(trimMat, 0.7f, 0.1f);
            bumperMat = md.chrome ? M("chrome") : trimMat;
            oddMat = md.wear > 0.5 ? MakePaint(0x6f7a72, "solid") : paintMat;

            var dm = dims = CarDims.Compute(car, ph);
            double Lc = dm.L, W = dm.W, zF = dm.zF, zR = dm.zR, bottom = dm.bottom, roof = dm.roof, yBelt = dm.yBelt, yNose = dm.yNose, yTail = dm.yTail, a = dm.a, b = dm.b, half = dm.half, r = dm.r, archR = dm.archR, wcY = dm.wcY;
            double[] axles = { a, -b };
            double cr = T.cr;

            double uz(double u) => zR + u * Lc;
            double width(double z)
            {
                double dEnd = Math.Min(z - zR, zF - z);
                double w = half;
                if (dEnd < cr) w = half - cr + Math.Sqrt(Math.Max(0, cr * cr - (cr - dEnd) * (cr - dEnd)));
                return w;
            }
            double topY(double u)
            {
                double y;
                if (u > T.ws) y = U.Lerp(yBelt, yNose, Math.Pow(U.Smoothstep(T.ws, 1, u), 0.85));
                else if (u < T.back && T.bed == 0) y = U.Lerp(yTail, yBelt, U.Smoothstep(0, T.back + 0.0001, u) * 0.15);
                else y = yBelt;
                y -= 0.07 * U.Smoothstep(0.965, 1, u) + 0.06 * U.Smoothstep(0.035, 0, u);
                return y;
            }
            double botY(double z, double u)
            {
                double y = bottom + 0.06 * U.Smoothstep(0.9, 1, u) + 0.05 * U.Smoothstep(0.1, 0, u);
                foreach (var ax in axles)
                {
                    double dz = z - ax;
                    if (Math.Abs(dz) < archR) y = Math.Max(y, wcY + Math.Sqrt(archR * archR - dz * dz) * 0.97);
                }
                return Math.Min(y, topY(u) - 0.1);
            }
            double[][] sideRing(double u, double sgn)
            {
                double z = uz(u), w = width(z), y0 = botY(z, u), y1 = topY(u), h = y1 - y0;
                double[][] pts = { new[] { 0.93, 0 }, new[] { 0.99, 0.2 }, new[] { 1, 0.5 }, new[] { 0.99, 0.78 }, new[] { 0.955, 0.93 }, new[] { 0.88, 1.0 } };
                return pts.Select(p => new[] { sgn * w * p[0], y0 + p[1] * h, z }).ToArray();
            }
            double[][] topRing(double u)
            {
                double z = uz(u), w = width(z), y1 = topY(u);
                double[][] pts = { new[] { 0.88, 0 }, new[] { 0.6, 0.012 }, new[] { 0.25, 0.02 }, new[] { 0, 0.022 }, new[] { -0.25, 0.02 }, new[] { -0.6, 0.012 }, new[] { -0.88, 0.0 } };
                return pts.Select(p => new[] { p[0] * w, y1 + p[1], z }).ToArray();
            }
            List<double> us(double u0, double u1, int n) { var o = new List<double>(); for (int i = 0; i <= n; i++) o.Add(U.Lerp(u0, u1, i / (double)n)); return o; }
            MGeo sideLoft(double u0, double u1, double sgn, int n = 10) => Loft(us(u0, u1, n).Select(u => sideRing(u, sgn)).ToList(), sgn < 0);
            MGeo topLoft(double u0, double u1, int n = 10) => Loft(us(u0, u1, n).Select(u => topRing(u)).ToList());

            double ws = T.ws;
            exhaustGroup = Node("exhaust", group).transform;
            exhaustPos = new[] { -half * 0.55, bottom + 0.08, zR - 0.05 };
            GameObject A = opts.procedural ? null : Mats.Car(car.id);
            fromAsset = A != null;
            if (A != null) BuildAssetBody(A);
            else
            {
                double doorR = T.bed != 0 ? T.back + 0.02 : Math.Max(T.back + 0.12, ws - (md.type == "sedan" || md.type == "wagon" || md.type == "suv" || md.type == "beast" ? 0.42 : 0.3));
                double fenderStart = ws - 0.02;
                foreach (var (sgn, sfx) in new[] { (1.0, "L"), (-1.0, "R") })
                {
                    Add("fenderF" + sfx, sideLoft(fenderStart, 1, sgn, 12), md.wear > 0.5 && sfx == "R" ? oddMat : paintMat);
                    Add("door" + sfx, sideLoft(doorR, fenderStart, sgn, 8), paintMat);
                    Add("quarter" + sfx, sideLoft(0, doorR, sgn, 12), paintMat);
                }
                // hood: separate pivot so it can open
                double hz = uz(ws), hy = topY(ws);
                hoodPivot = Node("hoodPivot", group).transform;
                SetSimLocal(hoodPivot, 0, hy, hz);
                var hoodGeo = topLoft(ws, 0.985, 10); hoodGeo.Translate(0, -hy, -hz);
                Add("hood", hoodGeo, paintMat, hoodPivot);
                if (T.bed == 0)
                {
                    if (T.back > 0.05) Add("trunk", topLoft(0.015, T.back + 0.01, 8), paintMat);
                    else Add("trunk", topLoft(0.004, 0.06, 3), paintMat);
                }
                // nose and tail fascia
                var tr999 = topRing(0.999);
                var frontRing = sideRing(0.999, 1).Concat(tr999.Skip(1).Take(tr999.Length - 2)).Concat(sideRing(0.999, -1).Reverse()).ToList();
                Add("fascia", Fan(frontRing, false), paintMat);
                var tr001 = topRing(0.001);
                var rearRing = sideRing(0.001, 1).Concat(T.bed != 0 ? new double[0][] : tr001.Skip(1).Take(tr001.Length - 2)).Concat(sideRing(0.001, -1).Reverse()).ToList();
                Add("rearPanel", Fan(rearRing, true), paintMat);

                // greenhouse
                var gh = new List<double[][]>();
                double roofY = roof, ghBase = T.back;
                foreach (var u in us(ghBase, ws, 22))
                {
                    double z = uz(u), w = width(z);
                    double yb = topY(Math.Min(Math.Max(u, 0.0001), ws)) + 0.005;
                    double yt;
                    if (u < T.roofR) yt = U.Lerp(yb + 0.02, roofY, T.bed != 0 ? U.Smoothstep(ghBase, ghBase + 0.012, u) : Math.Pow(U.Smoothstep(ghBase, T.roofR, u), 0.75));
                    else if (u > T.roofF) yt = U.Lerp(roofY, yb + 0.02, Math.Pow(U.Smoothstep(T.roofF, ws, u), 1.1));
                    else yt = roofY;
                    double wb = w * 0.9, wr = w * T.tumble;
                    double[][] ring =
                    {
                        new[] { wb, yb }, new[] { U.Lerp(wb, wr, 0.65), U.Lerp(yb, yt, 0.72) }, new[] { wr, yt - 0.035 }, new[] { wr * 0.75, yt - 0.004 }, new[] { 0, yt + 0.008 },
                        new[] { -wr * 0.75, yt - 0.004 }, new[] { -wr, yt - 0.035 }, new[] { -U.Lerp(wb, wr, 0.65), U.Lerp(yb, yt, 0.72) }, new[] { -wb, yb },
                    };
                    gh.Add(ring.Select(p => new[] { p[0], p[1], z }).ToArray());
                }
                var ghGeo = Loft(gh);
                glassMat = Own(Mats.Clone("glass"));
                SetShadows(Add("glass", ghGeo, glassMat).go, false);
                Add("glassBack", Fan(gh[0], true), glassMat);
                Add("glassFront", Fan(gh[gh.Count - 1], false), glassMat);
                var crackGeo = ghGeo.Clone(); crackGeo.Scale(1.004, 1.004, 1.002);
                crackMat = Own(Mats.Clone("crack"));
                SetShadows(Add("crack", crackGeo, crackMat).go, false);
                // roof panel + pillars
                var roofSecs = gh.Where((_, i) => { double u = U.Lerp(ghBase, ws, i / 22.0); return u >= T.roofR - 0.02 && u <= T.roofF + 0.02; })
                    .Select(ring => ring.Skip(2).Take(5).Select(p => new[] { p[0] * 1.01, p[1] + 0.008, p[2] }).ToArray()).ToList();
                if (roofSecs.Count > 1) Add("roof", Loft(roofSecs), paintMat);
                MGeo pillar(double u0, double u1, double thick)
                {
                    int i0 = (int)Math.Round((u0 - ghBase) / (ws - ghBase) * 22), i1 = (int)Math.Round((u1 - ghBase) / (ws - ghBase) * 22);
                    var geos = new List<MGeo>();
                    foreach (var sgn in new[] { 1, -1 })
                    {
                        var Ar = gh[Math.Max(0, Math.Min(22, i0))]; var Br = gh[Math.Max(0, Math.Min(22, i1))];
                        var pa = sgn > 0 ? Ar[0] : Ar[8]; var pb = sgn > 0 ? Br[2] : Br[6];
                        geos.Add(Beam(new[] { pa[0] * 1.012, pa[1], pa[2] }, new[] { pb[0] * 1.012, pb[1], pb[2] }, thick, 5));
                    }
                    return Merge(geos);
                }
                var pillars = new List<MGeo> { pillar(ws, T.roofF, 0.045), pillar(T.bed != 0 ? ghBase + 0.005 : ghBase + 0.01, T.roofR, T.back < 0.05 ? 0.07 : 0.05) };
                if (T.roofF - T.roofR > 0.18)
                {
                    double um = U.Lerp(T.roofR, T.roofF, 0.42);
                    pillars.Add(pillar(um, um, 0.04));
                    int i = Math.Max(0, Math.Min(22, (int)Math.Round((um - ghBase) / (ws - ghBase) * 22)));
                    var R = gh[i];
                    pillars.Add(Beam(new[] { R[0][0] * 1.01, R[0][1], R[0][2] }, new[] { R[2][0] * 1.01, R[2][1], R[2][2] }, 0.04, 4));
                    pillars.Add(Beam(new[] { R[8][0] * 1.01, R[8][1], R[8][2] }, new[] { R[6][0] * 1.01, R[6][1], R[6][2] }, 0.04, 4));
                }
                Add("pillars", Merge(pillars), md.type == "super" || md.type == "hyper" ? trimMat : paintMat);

                // pickup bed
                if (T.bed != 0)
                {
                    double zb = uz(T.back), wB = width(zR + 0.3) - 0.07;
                    double floorY = bottom + (yBelt - bottom) * 0.35;
                    double bedLen = zb - zR - 0.05;
                    var g = new List<MGeo>();
                    g.Add(Box(wB * 2, 0.04, bedLen).Translate(0, floorY, zR + 0.05 + bedLen / 2));
                    foreach (var sgn in new[] { 1, -1 }) g.Add(Box(0.04, yBelt - floorY, bedLen).Translate(sgn * wB, (yBelt + floorY) / 2, zR + 0.05 + bedLen / 2));
                    g.Add(Box(wB * 2, yBelt - floorY, 0.04).Translate(0, (yBelt + floorY) / 2, zb - 0.02));
                    Add("bed", Merge(g), trimMat);
                    var rails = new List<MGeo>();
                    foreach (var sgn in new[] { 1, -1 }) rails.Add(Box(0.1, 0.04, bedLen + 0.04).Translate(sgn * (wB + 0.02), yBelt + 0.01, zR + 0.05 + bedLen / 2));
                    Add("bedRails", Merge(rails), paintMat);
                }

                // wheel wells + underbody
                var wells = new List<MGeo>();
                foreach (var ax in axles) foreach (var sgn in new[] { 1, -1 })
                    {
                        double ww = Math.Max(0.3, r * 0.95);
                        var c = Cylinder(archR * 0.98, archR * 0.98, ww, 14, 1, true, 0, Math.PI);
                        c.RotateZ(Math.PI / 2);
                        c.Translate(sgn * (half - ww / 2 - 0.02), wcY, ax);
                        wells.Add(c);
                    }
                SetShadows(Add("wells", Merge(wells), M("car_wells")).go, false);
                SetShadows(Add("under", Box(W * 0.86, 0.03, Lc * 0.86).Translate(0, bottom + 0.04, (zF + zR) / 2), M("plastic")).go, false);

                // bumpers
                double bh = Math.Min(0.17, (yNose - bottom) * 0.5);
                Add("bumperF", RoundedBox(W * 0.96, bh, 0.16, 0.05, 2).Translate(0, bottom + bh * 0.62, zF - 0.05), bumperMat);
                Add("bumperR", RoundedBox(W * 0.96, bh, 0.16, 0.05, 2).Translate(0, bottom + bh * 0.62, zR + 0.05), bumperMat);
                bool hyper = md.type == "super" || md.type == "hyper";
                double gw = W * (hyper ? 0.5 : 0.42), ghh = Math.Max(0.08, (yNose - bottom) * (hyper ? 0.28 : 0.42));
                SetShadows(Add("grille", Plane(gw, ghh).Translate(0, bottom + bh + ghh * 0.55, zF + 0.002), M("grille")).go, false);
                // lights
                bool old = md.sport == 0 && (md.type == "hatch" || md.type == "wagon" || md.type == "pickup" || md.type == "sedan" || md.type == "coupe" || md.type == "muscle");
                lightMatL = Own(Mats.Clone("headlight")); lightMatR = Own(Mats.Clone("headlight"));
                double ly = Math.Max(bottom + bh + 0.1, yNose - 0.12), lx = half - cr * 0.55 - 0.12;
                foreach (var (sgn, sfx, mm) in new[] { (1.0, "L", lightMatL), (-1.0, "R", lightMatR) })
                {
                    MGeo geo = old ? Cylinder(0.085, 0.085, 0.05, 18).RotateX(Math.PI / 2) : RoundedBox(0.3, 0.09, 0.05, 0.02, 1);
                    geo.Translate(sgn * lx, ly, zF - 0.01 - (hyper ? 0.05 : 0));
                    SetShadows(Add("light" + sfx, geo, mm).go, false);
                }
                headPos = new[] { lx, ly, zF };
                tailMat = Own(Mats.Clone("taillight"));
                var tl = new List<MGeo>();
                foreach (var sgn in new[] { 1, -1 }) tl.Add(RoundedBox(0.24, 0.1, 0.04, 0.015, 1).Translate(sgn * (half - cr * 0.5 - 0.1), Math.Max(bottom + bh + 0.08, yTail - 0.12), zR + 0.012));
                SetShadows(Add("tail", Merge(tl), tailMat).go, false);
                // plates
                var plateMat = M("car_plate_" + car.id);
                SetShadows(Add("plateF", Plane(0.42, 0.11).Translate(0, bottom + bh * 0.62, zF + 0.06), plateMat).go, false);
                SetShadows(Add("plateR", Plane(0.42, 0.11).RotateY(Math.PI).Translate(0, bottom + bh + 0.1, zR - 0.004), plateMat).go, false);
                // mirrors
                var mg = new List<MGeo>();
                foreach (var sgn in new[] { 1, -1 })
                {
                    mg.Add(RoundedBox(0.16, 0.1, 0.07, 0.02, 1).Translate(sgn * (width(uz(ws)) + 0.08), yBelt + 0.1, uz(ws) - 0.12));
                    mg.Add(Box(0.1, 0.03, 0.03).Translate(sgn * (width(uz(ws)) + 0.02), yBelt + 0.07, uz(ws) - 0.12));
                }
                Add("mirrors", Merge(mg), trimMat);
                var dh = new List<MGeo>();
                foreach (var sgn in new[] { 1, -1 }) dh.Add(Box(0.02, 0.03, 0.14).Translate(sgn * (half + 0.005), yBelt - 0.08, uz(U.Lerp(doorR, fenderStart, 0.25))));
                SetShadows(Add("handles", Merge(dh), M("chrome")).go, false);

                // interior
                var ig = new List<MGeo>();
                double zDash = uz(ws) - 0.25;
                ig.Add(Box(W * 0.84, 0.18, 0.35).Translate(0, yBelt - 0.02, zDash));
                foreach (var sgn in new[] { 1, -1 })
                {
                    ig.Add(RoundedBox(0.46, 0.16, 0.48, 0.05, 1).Translate(sgn * W * 0.22, bottom + 0.3 + (yBelt - bottom) * 0.15, zDash - 0.75));
                    ig.Add(RoundedBox(0.44, 0.6, 0.14, 0.05, 1).RotateX(-0.25).Translate(sgn * W * 0.22, bottom + 0.62 + (yBelt - bottom) * 0.15, zDash - 1.02));
                }
                SetShadows(Add("interior", Merge(ig), M("seat")).go, false);
                SetShadows(Add("steering", Torus(0.17, 0.02, 6, 20).RotateX(-0.45).Translate(W * 0.22, yBelt + 0.06, zDash - 0.24), M("plastic")).go, false);
                eye = new[] { W * 0.22, yBelt + 0.32, zDash - 0.85 };
                hoodEye = new[] { 0, yNose + 0.25, uz(U.Lerp(ws, 1, 0.3)) };
            }

            // engine bay (seen when the hood is open in the garage)
            engineBay = BuildEngineBay(uz(ws), zF, yBelt, bottom, half, md);

            // wheels
            double tw = r * (md.type == "monster" ? 0.95 : md.type == "beast" || md.type == "baja" ? 0.75 : 0.66);
            wheelWidth = tw;
            wheels = new List<WheelView>();
            for (int i = 0; i < 4; i++)
            {
                bool front = i < 2, left = i % 2 == 0;
                var pivot = Node("wheel" + i, group).transform;
                var w = BuildWheel(r, tw, md.rim, "street", md.sport != 0, pivot);
                if (!left) { w.spin.localRotation = SimY(Math.PI); w.caliper.localScale = new Vector3(-1, 1, 1); }
                w.spinBase = w.spin.localRotation;
                SetSimLocal(pivot, (left ? 1 : -1) * ph.track / 2, wcY, front ? a : -b);
                w.pivot = pivot; w.front = front; w.left = left;
                wheels.Add(w);
            }
            // suspension struts
            var strut = new List<MGeo>();
            foreach (var w in wheels)
            {
                var p = SimLocalPos(w.pivot);
                double x = p.x * 0.82, z = p.z;
                strut.Add(Beam(new[] { x, wcY, z }, new[] { x * 0.92, Math.Min(yBelt, wcY + r + 0.25), z }, 0.035, 6));
            }
            strutMat = Own(Mats.Clone("darkSteel"));
            SetShadows(Add("struts", Merge(strut), strutMat).go, false);

            extras = Node("extras", group).transform;
            BuildExtras(md, uz, width, topY);

            foreach (var n in new[] { "hood", "fenderFL", "fenderFR", "doorL", "doorR", "quarterL", "quarterR", "trunk", "roof", "fascia", "rearPanel", "bumperF", "bumperR", "glass", "pillars" })
                if (parts.TryGetValue(n, out var pt) && pt.mf && pt.mf.sharedMesh)
                {
                    deform.Add(pt);
                    pt.orig = SimVerts(pt.mf.sharedMesh);
                }
            enginePos = V(0, yNose + 0.05, U.Lerp(uz(ws), zF, 0.5));
        }

        Part Add(string name, MGeo geo, Material mat, Transform parent = null)
        {
            var go = Obj(name, parent ?? group, geo, mat, true, true);
            var p = new Part { name = name, go = go, mf = go.GetComponent<MeshFilter>(), mr = go.GetComponent<MeshRenderer>() };
            parts[name] = p;
            return p;
        }
        Part AddMesh(string name, Mesh mesh, Material[] mats, Transform parent)
        {
            var go = Node(name, parent);
            var mf = go.AddComponent<MeshFilter>(); mf.sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>(); mr.sharedMaterials = mats;
            var p = new Part { name = name, go = go, mf = mf, mr = mr };
            parts[name] = p;
            return p;
        }

        static Vector3[] SimVerts(Mesh m)
        {
            var v = m.vertices;
            for (int i = 0; i < v.Length; i++) v[i] = Coord.FromUnity(v[i]);
            return v;
        }

        // makePaint(color, finish): the paint material with the finish's roughness / metalness
        Material MakePaint(int color, string finish)
        {
            var m = Own(Mats.Clone("car_paint"));
            var f = Upgrades.FINISHES.TryGetValue(finish ?? "solid", out var ff) ? ff : Upgrades.FINISHES["solid"];
            var c = Hex(color);
            SetColor(m, c); SetPbr(m, (float)f.rough, (float)f.metal);
            m.name = "paint_" + car.id;
            if (paintMat == null) { paintColor = c; paintRough = (float)f.rough; paintMetal = (float)f.metal; }
            return m;
        }

        // ---------------------------------------------------------------- asset body
        void BuildAssetBody(GameObject prefab)
        {
            var md = car.model;
            var art = ArtIndex.Car(car.id);
            lightMatL = Own(Mats.Clone("headlight")); lightMatR = Own(Mats.Clone("headlight"));
            tailMat = Own(Mats.Clone("taillight"));
            glassMat = Own(Mats.Clone("glass"));
            crackMat = Own(Mats.Clone("crack"));
            bool sportBody = md.sport != 0 || md.type == "super" || md.type == "hyper" || md.type == "sports";
            bumperMat = md.chrome ? M("chrome") : sportBody ? paintMat : trimMat;
            var inst = UnityEngine.Object.Instantiate(prefab);
            inst.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            inst.transform.localScale = Vector3.one;
            var rootInv = inst.transform.worldToLocalMatrix;
            string pre = car.id + "__";
            var nodes = new Dictionary<string, Vector3>();
            var meshes = new List<(string part, Mesh mesh, Material[] mats, Matrix4x4 local)>();
            Transform steering = null; Matrix4x4 steerLocal = Matrix4x4.identity;
            foreach (var t in inst.GetComponentsInChildren<Transform>(true))
            {
                if (!t.name.StartsWith(pre)) continue;
                string part = t.name.Substring(pre.Length);
                var mf = t.GetComponentInChildren<MeshFilter>(true);
                var local = rootInv * t.localToWorldMatrix;
                if (!mf || !mf.sharedMesh) { nodes[part] = Coord.FromUnity((Vector3)local.GetColumn(3)); continue; }
                var mr = mf.GetComponent<MeshRenderer>();
                var lm = rootInv * mf.transform.localToWorldMatrix;
                if (part == "steering") { steering = mf.transform; steerLocal = lm; meshes.Add((part, mf.sharedMesh, mr ? mr.sharedMaterials : new Material[0], lm)); continue; }
                meshes.Add((part, mf.sharedMesh, mr ? mr.sharedMaterials : new Material[0], lm));
            }
            inst.SetActive(false);
            GameMesh.Destroy(inst);

            Vector3 hinge = nodes.TryGetValue("hoodHinge", out var hh) ? hh : V(0, dims.yBelt, 0);
            hoodPivot = Node("hoodPivot", group).transform;
            SetSimLocal(hoodPivot, hinge);
            var noShadow = ArtIndex.CarNoShadow;
            foreach (var (part, mesh, mats, local) in meshes)
            {
                var ms = mats.Select(m => MatFor(m, part)).ToArray();
                if (part == "steering")
                {
                    var swp = AddMesh("steering", mesh, ms, group);
                    keepMeshes.Add(mesh);
                    var p = (Vector3)local.GetColumn(3);
                    swp.go.transform.localPosition = p;
                    swp.go.transform.localRotation = local.rotation;
                    swp.go.transform.localScale = local.lossyScale;
                    steerBase = swp.go.transform.localRotation;
                    swp.go.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                    continue;
                }
                // bake the part into car space (JS g.applyMatrix4(local)); the hood into hinge space
                var m2 = BakeMesh(mesh, part == "hood" ? Matrix4x4.Translate(-Coord.ToUnity(hinge)) * local : local);
                var pt = AddMesh(part, m2, ms, part == "hood" ? hoodPivot : group);
                pt.mr.shadowCastingMode = noShadow.Contains(part) ? UnityEngine.Rendering.ShadowCastingMode.Off : UnityEngine.Rendering.ShadowCastingMode.On;
            }
            // windscreen crack overlay
            if (parts.TryGetValue("glass", out var gl))
            {
                var cg = UnityEngine.Object.Instantiate(gl.mf.sharedMesh);
                var v = cg.vertices; for (int i = 0; i < v.Length; i++) v[i] = Vector3.Scale(v[i], new Vector3(1.004f, 1.004f, 1.002f)); cg.vertices = v; cg.RecalculateBounds();
                var c = AddMesh("crack", cg, Enumerable.Repeat(crackMat, Math.Max(1, cg.subMeshCount)).ToArray(), group);
                c.mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            }
            // weight reduction strips the seats; the dash stays
            if (parts.TryGetValue("seats", out var seats)) parts["interior"] = seats;
            else if (!parts.ContainsKey("interior")) parts["interior"] = new Part { name = "interior", go = Node("interior", group) };
            foreach (var n in new[] { "dash", "interiorShell" }) if (parts.TryGetValue(n, out var pp) && pp.mr) pp.mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            eye = nodes.TryGetValue("eye", out var e) ? new double[] { e.x, e.y, e.z } : new[] { dims.W * 0.22, dims.yBelt + 0.32, 0 };
            hoodEye = nodes.TryGetValue("hoodEye", out var he) ? new double[] { he.x, he.y, he.z } : new[] { 0, dims.yNose + 0.25, dims.zF - 1 };
            if (parts.TryGetValue("lightL", out var ll) && ll.mf)
            {
                var sv = SimVerts(ll.mf.sharedMesh);
                var b = new Bounds(sv[0], Vector3.zero); foreach (var p in sv) b.Encapsulate(p);
                headPos = new double[] { b.center.x, b.center.y, b.max.z };
            }
            else headPos = new[] { dims.half * 0.6, dims.yNose, dims.zF };
            if (!parts.ContainsKey("bumperF")) Add("bumperF", new MGeo(), bumperMat);
            if (!parts.ContainsKey("bumperR")) Add("bumperR", new MGeo(), bumperMat);
            _ = art;
        }

        static string BaseName(Material m)
        {
            if (!m) return "";
            string n = m.name.Replace(" (Instance)", "");
            int i = n.IndexOf(" (copy)"); if (i >= 0) n = n.Substring(0, i);
            return n;
        }

        // the prefab already carries the registry materials (ArtIndex.CarPartMaterial); swap in the
        // per-car instances the JS creates (paint, odd panel, lamps, glass, gauges)
        Material MatFor(Material m, string part)
        {
            string n = BaseName(m);
            if (n == "car_paint_" + car.id || n == "car_paint" || n == "Models/car_paint") return car.model.wear > 0.5 && part == "fenderFR" ? oddMat : paintMat;
            if (n == "car_odd") return car.model.wear > 0.5 ? oddMat : paintMat;
            if (n == "car_trim_" + car.id) return trimMat;
            if (n == "headlight") return part == "lightR" ? lightMatR : lightMatL;
            if (n == "taillight") return tailMat;
            if (n == "glass") return glassMat;
            if (n == "car_gauges") return GaugeMaterial();
            return m ? m : paintMat;
        }

        static Mesh BakeMesh(Mesh src, Matrix4x4 m)
        {
            var o = UnityEngine.Object.Instantiate(src);
            o.name = src.name + "_car";
            var v = o.vertices; var n = o.normals;
            var nm = m.inverse.transpose;
            for (int i = 0; i < v.Length; i++) v[i] = m.MultiplyPoint3x4(v[i]);
            for (int i = 0; i < n.Length; i++) n[i] = nm.MultiplyVector(n[i]).normalized;
            o.vertices = v;
            if (n.Length == v.Length) o.normals = n; else o.RecalculateNormals();
            o.RecalculateBounds();
            return o;
        }

        // Twin stripes / livery bands lifted off the hood, roof and trunk surfaces (clipped triangles).
        void BuildAssetStripes(CarModel md)
        {
            int col = md.livery != 0 ? md.livery : md.stripes;
            var mat = Own(Mats.Clone("car_paint"));
            SetColor(mat, Hex(col)); SetPbr(mat, 0.35f, 0.05f);
            mat.renderQueue = 2001; // polygonOffset stand-in: drawn after the body, lifted 4 mm
            liveryMat = mat;
            double sw = md.livery != 0 ? 0.24 : 0.13, gap = 0.06;
            foreach (var name in new[] { "hood", "roof", "trunk" })
            {
                if (!parts.TryGetValue(name, out var part) || !part.mf || !part.mf.sharedMesh) continue;
                var mesh = part.mf.sharedMesh;
                var pos = SimVerts(mesh);
                var nor = mesh.normals.Select(Coord.FromUnity).ToArray();
                var idx = mesh.triangles;
                var outV = new List<Vector3>();
                List<double[]> clip(List<double[]> poly, int k, double v, bool keepAbove)
                {
                    var res = new List<double[]>();
                    for (int i = 0; i < poly.Count; i++)
                    {
                        var Ap = poly[i]; var Bp = poly[(i + 1) % poly.Count];
                        bool ia = keepAbove ? Ap[k] >= v : Ap[k] <= v, ib = keepAbove ? Bp[k] >= v : Bp[k] <= v;
                        if (ia) res.Add(Ap);
                        if (ia != ib) { double t = (v - Ap[k]) / (Bp[k] - Ap[k]); res.Add(Ap.Select((q, j) => q + (Bp[j] - q) * t).ToArray()); }
                    }
                    return res;
                }
                double[] vtx(int id) { var p = pos[id]; var nn = nor.Length > id ? nor[id] : Vector3.up; return new double[] { p.x, p.y, p.z, nn.x, nn.y, nn.z }; }
                // Unity triangles have the mirrored winding: swap back to simulation order
                for (int i = 0; i + 2 < idx.Length; i += 3)
                {
                    var tri = new List<double[]> { vtx(idx[i]), vtx(idx[i + 2]), vtx(idx[i + 1]) };
                    foreach (var sgn in new[] { 1, -1 })
                    {
                        double lo = sgn > 0 ? gap : -gap - sw, hi = sgn > 0 ? gap + sw : -gap;
                        var poly = clip(clip(tri, 0, lo, true), 0, hi, false);
                        for (int k = 1; k + 1 < poly.Count; k++)
                            foreach (var q in new[] { poly[0], poly[k], poly[k + 1] }) outV.Add(V(q[0] + q[3] * 0.004, q[1] + q[4] * 0.004, q[2] + q[5] * 0.004));
                    }
                }
                if (outV.Count == 0) continue;
                var g = new MGeo(); g.v.AddRange(outV); for (int i = 0; i < outV.Count; i++) g.t.Add(i); g.ComputeNormals();
                SetShadows(Obj("livery_" + name, part.go.transform, g, mat), false);
            }
        }

        // ---------------------------------------------------------------- instrument cluster
        sealed class Gauge
        {
            public Texture2D tex; public Color32[] px; public Material mat; public double t;
            public const int W = 512, H = 208;
        }

        Material GaugeMaterial()
        {
            if (gauge != null) return gauge.mat;
            var tex = new Texture2D(Gauge.W, Gauge.H, TextureFormat.RGBA32, false) { name = "gauges_" + car.id, wrapMode = TextureWrapMode.Clamp };
            var mat = Own(Mats.Clone("car_gauges"));
            SetColor(mat, Color.white);
            mat.SetTexture("_BaseMap", tex); mat.SetTexture("_MainTex", tex); mat.SetTexture("_EmissionMap", tex);
            SetEmission(mat, Color.white, 0.55f);
            SetPbr(mat, 0.35f, 0);
            gauge = new Gauge { tex = tex, px = new Color32[Gauge.W * Gauge.H], mat = mat };
            DrawGauges(0, 0, 1, 0.4, 1);
            return mat;
        }

        // canvas drawGauges(): two dials (km/h, rpm with red zone), needles, fuel and temperature bars
        void DrawGauges(double kmh, double rpmF, double fuelF, double heat, int gear)
        {
            var G = gauge; if (G == null) return;
            var px = G.px; int W = Gauge.W, H = Gauge.H;
            Color32 C(int hex) => new Color32((byte)(hex >> 16), (byte)(hex >> 8), (byte)hex, 255);
            void Px(int x, int y, Color32 c) { if (x >= 0 && x < W && y >= 0 && y < H) px[(H - 1 - y) * W + x] = c; }
            void Rect(double x, double y, double w, double h, Color32 c) { for (int j = (int)y; j < (int)(y + h); j++) for (int i = (int)x; i < (int)(x + w); i++) Px(i, j, c); }
            void Disc(double cx, double cy, double r, Color32 c) { for (int j = (int)(cy - r); j <= (int)(cy + r); j++) for (int i = (int)(cx - r); i <= (int)(cx + r); i++) if ((i - cx) * (i - cx) + (j - cy) * (j - cy) <= r * r) Px(i, j, c); }
            void Line(double x0, double y0, double x1, double y1, double wdt, Color32 c)
            {
                double len = Math.Max(1, Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)));
                for (double s = 0; s <= len; s += 0.7) { double x = x0 + (x1 - x0) * s / len, y = y0 + (y1 - y0) * s / len; Disc(x, y, wdt / 2, c); }
            }
            void Arc(double cx, double cy, double r, double a0, double a1, double wdt, Color32 c)
            {
                for (double a = a0; a <= a1; a += 1.0 / r) Disc(cx + Math.Cos(a) * r, cy + Math.Sin(a) * r, wdt / 2, c);
            }
            var bg = C(0x07080a);
            for (int i = 0; i < px.Length; i++) px[i] = bg;
            double top = Math.Max(120, Math.Ceiling((topKmh != 0 ? topKmh : 160) * 1.12 / 20) * 20);
            void Dial(double cx, double cy, double R, double frac, double max, double step, double red)
            {
                Disc(cx, cy, R, C(0x101216));
                Arc(cx, cy, R, 0, Math.PI * 2, 3, C(0x2a2d33));
                double a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
                if (red > 0) Arc(cx, cy, R - 8, a0 + (a1 - a0) * red, a1, 7, C(0xc0281c));
                int n = (int)Math.Round(max / step);
                for (int i = 0; i <= n * 2; i++)
                {
                    double a = a0 + (a1 - a0) * i / (n * 2); bool major = i % 2 == 0;
                    Line(cx + Math.Cos(a) * (R - 4), cy + Math.Sin(a) * (R - 4), cx + Math.Cos(a) * (R - (major ? 16 : 10)), cy + Math.Sin(a) * (R - (major ? 16 : 10)), major ? 3 : 1.5, C(0xd8d4c8));
                }
                double an = a0 + (a1 - a0) * Math.Min(1.02, frac);
                Line(cx - Math.Cos(an) * 12, cy - Math.Sin(an) * 12, cx + Math.Cos(an) * (R - 12), cy + Math.Sin(an) * (R - 12), 4, C(0xff5a1e));
                Disc(cx, cy, 9, C(0x1c1e22));
            }
            double redline = ph.engine != null && ph.engine.redline != 0 ? ph.engine.redline : 7000;
            double rmax = Math.Ceiling(redline / 1000 + 1);
            Dial(140, 104, 96, kmh / top, top, top > 260 ? 60 : top > 150 ? 40 : 20, 0);
            Dial(372, 104, 96, rpmF * redline / 1000 / rmax, rmax, 1, redline / 1000 / rmax);
            void Bar(double x, double f, int col) { Rect(x, 40, 10, 120, C(0x1a1c20)); Rect(x, 40 + 120 * (1 - f), 10, 120 * f, C(col)); }
            Bar(248, Math.Max(0, Math.Min(1, fuelF)), fuelF < 0.15 ? 0xe0402a : 0xd8c890);
            Bar(262, Math.Max(0, Math.Min(1, heat)), heat > 0.85 ? 0xe0402a : 0x7fb0d8);
            _ = gear;
            G.tex.SetPixels32(px);
            G.tex.Apply(false);
        }

        // ---------------------------------------------------------------- engine bay
        Transform BuildEngineBay(double z0, double z1, double yBelt, double bottom, double half, CarModel md)
        {
            var g = Node("engineBay", group).transform;
            var eb = Node("eb", g).transform;
            double zc = (z0 + z1) / 2, len = (z1 - z0) * 0.62;
            var block = Obj("block", eb, RoundedBox(half * 0.9, (yBelt - bottom) * 0.55, len * 0.7, 0.04, 1), M("engine")).transform;
            SetSimLocal(block, 0, bottom + (yBelt - bottom) * 0.5, zc - 0.02);
            var coverMat = Own(Std("engineCover", md.sport != 0 ? 0x8a1a14 : 0x2a2b2d, 0.4f, 0.6f));
            var cover = Obj("cover", eb, RoundedBox(half * 0.7, 0.08, len * 0.6, 0.03, 1), coverMat).transform;
            SetSimLocal(cover, 0, bottom + (yBelt - bottom) * 0.5 + (yBelt - bottom) * 0.3, zc - 0.02);
            var filter = Obj("filter", eb, Cylinder(0.16, 0.16, 0.08, 18), M("engineDark")).transform;
            SetSimLocal(filter, half * 0.45, yBelt - 0.12, zc + len * 0.2);
            var battery = Obj("battery", eb, Box(0.22, 0.18, 0.16), M("plastic")).transform;
            SetSimLocal(battery, -half * 0.6, yBelt - 0.2, zc + len * 0.25);
            var radiator = Obj("radiator", eb, Box(half * 1.4, (yBelt - bottom) * 0.5, 0.05), M("engineDark")).transform;
            SetSimLocal(radiator, 0, bottom + (yBelt - bottom) * 0.5, z1 - 0.22);
            engineParts["block"] = block; engineParts["cover"] = cover; engineParts["filter"] = filter; engineParts["radiator"] = radiator;
            g.gameObject.SetActive(false);
            return g;
        }

        // ---------------------------------------------------------------- wheels
        static readonly Dictionary<string, (Mesh tire, Mesh barrel, Mesh face, Mesh disc, Mesh caliper, Mesh rim3d, double rr)> wheelCache = new Dictionary<string, (Mesh, Mesh, Mesh, Mesh, Mesh, Mesh, double)>();

        sealed class Rim3D { public int spokes; public double dish; public string mat, sportMat; public double thick; public int bolts; }
        static readonly Dictionary<string, Rim3D> RIM_3D = new Dictionary<string, Rim3D>
        {
            ["alloy"] = new Rim3D { spokes = 7, dish = 0.0, mat = "rim3d_alloy", sportMat = "rim3d_alloySport" },
            ["dish"] = new Rim3D { spokes = 6, dish = 1.0, mat = "rim3d_dish" },
            ["rally"] = new Rim3D { spokes = 6, dish = 0.3, mat = "rim3d_rally", thick = 1.6 },
            ["beadlock"] = new Rim3D { spokes = 8, dish = 0.6, mat = "rim3d_beadlock", thick = 1.4, bolts = 16 },
            ["offroad"] = new Rim3D { spokes = 6, dish = 0.6, mat = "rim3d_offroad", thick = 1.5 },
        };

        static MGeo RimGeometry(Rim3D st, double rr, double w, bool sport)
        {
            var parts = new List<MGeo>();
            double xFace = w * 0.6, dish = st.dish;
            int n = sport && st.thick == 0 ? 5 : st.spokes; bool twin = sport && st.thick == 0;
            double r0 = rr * 0.2, r1 = rr * 0.92;
            void spoke(double a, double wid0, double wid1, double th)
            {
                var g = Box(1, 1, 1, 4, 1, 1);
                double ca = Math.Cos(a), sa = Math.Sin(a);
                for (int i = 0; i < g.v.Count; i++)
                {
                    var p = g.v[i];
                    double t = p.x + 0.5, side = p.z, up = p.y;
                    double rad = r0 + (r1 - r0) * t;
                    double wd = (wid0 + (wid1 - wid0) * t) * side;
                    double x = xFace + (1 - dish) * (0.03 * (1 - t) - 0.035 * t * t) + dish * (-0.07 * (1 - t) + 0.01 * t) + up * th;
                    g.v[i] = V(x, ca * rad - sa * wd, sa * rad + ca * wd);
                }
                g.ComputeNormals();
                parts.Add(g);
            }
            double thk = 0.024 * (st.thick != 0 ? st.thick : 1);
            for (int k = 0; k < n; k++)
            {
                double a = k / (double)n * Math.PI * 2;
                if (twin) { spoke(a - 0.13, rr * 0.07, rr * 0.045, thk); spoke(a + 0.13, rr * 0.07, rr * 0.045, thk); }
                else spoke(a, rr * 0.16 * (st.thick != 0 ? st.thick : 1), rr * 0.09 * (st.thick != 0 ? st.thick : 1), thk);
            }
            double lipX = xFace - 0.035 + dish * 0.02;
            var lp = new[] { new[] { rr * 0.88, -(lipX - 0.03) }, new[] { rr * 0.99, -(lipX - 0.02) }, new[] { rr * 1.0, -(lipX + 0.005) }, new[] { rr * 0.95, -(lipX + 0.012) }, new[] { rr * 0.89, -(lipX + 0.004) } }
                .Select(p => new Vector2((float)p[0], (float)p[1])).ToList();
            parts.Add(Lathe(lp, 32).RotateZ(Math.PI / 2));
            double hubX = xFace + (1 - dish) * 0.03 - dish * 0.07;
            parts.Add(Cylinder(r0 * 1.05, r0 * 1.15, 0.05, 20).RotateZ(Math.PI / 2).Translate(hubX, 0, 0));
            parts.Add(Cylinder(r0 * 0.45, r0 * 0.5, 0.06, 16).RotateZ(Math.PI / 2).Translate(hubX + 0.015, 0, 0));
            for (int k = 0; k < 5; k++)
            {
                double a = k / 5.0 * Math.PI * 2 + 0.3;
                parts.Add(Cylinder(0.011, 0.011, 0.03, 6).RotateZ(Math.PI / 2).Translate(hubX + 0.022, Math.Cos(a) * r0 * 0.7, Math.Sin(a) * r0 * 0.7));
            }
            if (st.bolts > 0)
                for (int k = 0; k < st.bolts; k++)
                {
                    double a = k / (double)st.bolts * Math.PI * 2;
                    parts.Add(Cylinder(0.009, 0.009, 0.025, 6).RotateZ(Math.PI / 2).Translate(lipX + 0.01, Math.Cos(a) * rr * 0.95, Math.Sin(a) * rr * 0.95));
                }
            return Merge(parts);
        }

        static Mesh Cached(MGeo g, string name) { var m = g.ToMesh(name); MarkCached(m); return m; }

        // buildWheel(r, width, rimStyle, tireKind, sport)
        public WheelView BuildWheel(double r, double width, string rimStyle, string tireKind, bool sport, Transform parent)
        {
            string key = r.ToString("0.000") + "|" + width.ToString("0.000") + "|" + rimStyle + "|" + tireKind + "|" + sport;
            if (!wheelCache.TryGetValue(key, out var P) || !P.tire)
            {
                double rr = r * (rimStyle == "beadlock" || tireKind == "offroad" ? 0.56 : sport ? 0.72 : 0.62);
                double w = width / 2;
                var tp = new[] { new[] { rr * 0.98, -w * 0.92 }, new[] { r * 0.9, -w }, new[] { r * 0.975, -w * 0.94 }, new[] { r, -w * 0.78 }, new[] { r, w * 0.78 }, new[] { r * 0.975, w * 0.94 }, new[] { r * 0.9, w }, new[] { rr * 0.98, w * 0.92 } }
                    .Select(p => new Vector2((float)p[0], (float)p[1])).ToList();
                var tire = Lathe(tp, 28).SwapUV().RotateZ(Math.PI / 2);
                var bp = new[] { new[] { rr * 0.96, -w * 0.85 }, new[] { rr, -w * 0.8 }, new[] { rr, w * 0.75 }, new[] { rr * 0.94, w * 0.82 } }.Select(p => new Vector2((float)p[0], (float)p[1])).ToList();
                var barrel = Lathe(bp, 24).RotateZ(Math.PI / 2);
                var face = Circle(rr * 0.97, 24).RotateY(Math.PI / 2).Translate(w * 0.62, 0, 0);
                var disc = Cylinder(rr * 0.72, rr * 0.72, 0.03, 20).RotateZ(Math.PI / 2).Translate(w * 0.05, 0, 0);
                var caliper = RoundedBox(0.06, rr * 0.45, rr * 0.32, 0.015, 1).Translate(w * 0.2, rr * 0.48, -rr * 0.25);
                Mesh rim3d = RIM_3D.TryGetValue(rimStyle ?? "", out var st) ? Cached(RimGeometry(st, rr, w, sport), "rim3d") : null;
                P = (Cached(tire, "tire"), Cached(barrel, "barrel"), Cached(face, "rimface"), Cached(disc, "disc"), Cached(caliper, "caliper"), rim3d, rr);
                wheelCache[key] = P;
            }
            var wg = Node("wg", parent).transform;
            var spin = Node("spin", wg).transform;
            var tireT = Obj("tire", spin, P.tire, M(TireMat(tireKind))).transform;
            Obj("barrel", spin, P.barrel, M("darkSteel"), false);
            Transform faceT;
            if (P.rim3d) { var st = RIM_3D[rimStyle]; faceT = Obj("rim", spin, P.rim3d, M(sport && st.sportMat != null ? st.sportMat : st.mat)).transform; }
            else faceT = Obj("rim", spin, P.face, M("rim_" + (rimStyle ?? "steel")), false).transform;
            Obj("disc", spin, P.disc, M("brakeDisc"), false);
            if (caliperMat == null) caliperMat = Own(Mats.Clone("caliper"));
            var cal = Obj("caliper", wg, P.caliper, caliperMat, false).transform;
            return new WheelView { wg = wg, spin = spin, caliper = cal, tire = tireT, face = faceT };
        }

        static string TireMat(string tireId) => tireId == "worn" ? "tire_worn" : "tire_" + MatDefs.TireKind(tireId);

        // ---------------------------------------------------------------- extras from the model definition
        void BuildExtras(CarModel md, Func<double, double> uz, Func<double, double> width, Func<double, double> topY)
        {
            var d = dims;
            if (md.rack)
            {
                var rg = new List<MGeo>();
                double y = d.roof + 0.06;
                double z0 = uz(T.roofR + 0.02), z1 = uz(T.roofF - 0.03), w = d.half * T.tumble * 0.9;
                foreach (var sgn in new[] { 1, -1 }) rg.Add(Beam(new[] { sgn * w, y, z0 }, new[] { sgn * w, y, z1 }, 0.018, 5));
                for (int k = 0; k <= 3; k++) { double z = U.Lerp(z0, z1, k / 3.0); rg.Add(Beam(new[] { w, y, z }, new[] { -w, y, z }, 0.015, 5)); }
                foreach (var sgn in new[] { 1, -1 }) foreach (var z in new[] { z0, z1 }) rg.Add(Beam(new[] { sgn * w, y, z }, new[] { sgn * w * 0.98, y - 0.06, z }, 0.015, 4));
                Obj("rack", extras, Merge(rg), M("darkSteel"));
                rackY = y;
            }
            if (md.spare)
            {
                var sp = BuildWheel(d.r * 0.95, wheelWidth * 0.9, md.rim, "at", false, extras);
                sp.wg.localRotation = SimY(Math.PI / 2);
                SetSimLocal(sp.wg, 0, d.bottom + d.H * 0.45, d.zR - 0.12);
            }
            if (md.wing != 0)
            {
                bool big = md.wing == 2;
                var wg = new List<MGeo>();
                double zt = d.zR + (big ? 0.25 : 0.12), yt = (T.back > 0.05 ? d.yTail : d.roof - 0.05) + (big ? 0.32 : 0.06);
                wg.Add(RoundedBox(d.W * (big ? 0.95 : 0.9), 0.03, big ? 0.32 : 0.24, 0.012, 1).Translate(0, yt, zt));
                foreach (var sgn in new[] { 1, -1 })
                {
                    wg.Add(Box(0.02, big ? 0.16 : 0.12, big ? 0.36 : 0.28).Translate(sgn * d.W * (big ? 0.475 : 0.45), yt, zt));
                    if (big) wg.Add(Box(0.03, 0.32, 0.08).Translate(sgn * d.W * 0.25, yt - 0.16, zt + 0.04));
                }
                Obj("wing", extras, Merge(wg), big ? M("carbon") : paintMat);
            }
            if (md.flares != 0 || md.type == "baja" || md.type == "beast")
            {
                var fg = new List<MGeo>();
                foreach (var ax in new[] { d.a, -d.b }) foreach (var sgn in new[] { 1, -1 })
                        fg.Add(Torus(d.archR * 1.02, 0.045, 5, 12, Math.PI).Scale(1, 1, 1.6).RotateY(Math.PI / 2).Translate(sgn * (d.half + 0.02), d.wcY, ax));
                Obj("flares", extras, Merge(fg), M("plastic"));
            }
            if (md.lightbar != 0)
            {
                var lb = Node("lightbar", extras).transform;
                Obj("bar", lb, RoundedBox(d.W * 0.7, 0.07, 0.08, 0.02, 1), M("darkSteel"));
                for (int k = 0; k < 4; k++)
                {
                    var l = Obj("lamp", lb, Cylinder(0.035, 0.035, 0.03, 12).RotateX(Math.PI / 2), M("headlight")).transform;
                    SetSimLocal(l, (k - 1.5) * d.W * 0.17, 0, 0.045);
                }
                SetSimLocal(lb, 0, d.roof + 0.07, uz(T.roofF) - 0.05);
            }
            if (md.cage != 0) cageForced = true;
            if ((md.livery != 0 || md.stripes != 0) && fromAsset) BuildAssetStripes(md);
            else if (md.livery != 0 || md.stripes != 0)
            {
                int col = md.livery != 0 ? md.livery : md.stripes;
                var mat = Own(Mats.Clone("car_paint")); SetColor(mat, Hex(col)); SetPbr(mat, 0.35f, 0.05f);
                var segs = new List<MGeo>();
                MGeo strip(double u0, double u1, double x0, double x1)
                {
                    var secs = new List<double[][]>();
                    for (int i = 0; i <= 8; i++) { double u = U.Lerp(u0, u1, i / 8.0), z = uz(u), y = topY(u) + 0.03; secs.Add(new[] { new[] { x1, y, z }, new[] { x0, y, z } }); }
                    return Loft(secs);
                }
                double sw = md.livery != 0 ? 0.22 : 0.12;
                foreach (var sgn in new[] { 1, -1 }) segs.Add(strip(T.ws + 0.01, 0.97, sgn * 0.06, sgn * (0.06 + sw)));
                var g = Merge(segs);
                var hp = SimLocalPos(hoodPivot);
                g.Translate(-hp.x, -hp.y, -hp.z);
                Obj("livery", hoodPivot, g, mat);
                liveryMat = mat;
            }
        }

        // ---------------------------------------------------------------- upgrades
        public void SetUpgrades(Dictionary<string, int> lv, string tire)
        {
            levels = lv != null ? new Dictionary<string, int>(lv) : new Dictionary<string, int>();
            tireId = tire ?? tireId;
            var d = dims; var md = car.model;
            if (upg) DestroyTree(upg.gameObject, keepMeshes);
            upg = Node("upg", group).transform;
            var g = upg;
            var metal = M("darkSteel");
            int armor = L("armor"), eng = L("engine"), fuel = L("fuel"), cool = L("cooling"), turbo = L("turbo"), wgt = L("weight"), br = L("brakes");
            Transform add(MGeo geo, Material mat, bool cast = true) => Obj("p", g, geo, mat, cast).transform;
            // armour
            var bm = armor >= 1 ? (armor >= 13 ? M("darkSteel") : bumperMat == M("chrome") && armor < 3 ? M("chrome") : M("galv")) : bumperMat;
            SetPartMat("bumperF", bm); SetPartMat("bumperR", bm);
            if (armor >= 2) add(Box(d.W * 0.7, 0.02, 0.9).Translate(0, d.bottom + 0.005, d.zF - 0.55), M("galv"));
            if (armor >= 4)
            {
                var bb = new List<MGeo>();
                double y0 = d.bottom + 0.1, y1 = d.yNose + 0.05, z = d.zF + 0.16, w = d.half * 0.75;
                foreach (var sgn in new[] { 1, -1 })
                {
                    bb.Add(Beam(new[] { sgn * w, y0, z - 0.1 }, new[] { sgn * w, y1, z }, 0.03));
                    bb.Add(Beam(new[] { sgn * w, y1, z }, new[] { sgn * w * 0.4, y1 + 0.05, z - 0.02 }, 0.03));
                }
                bb.Add(Beam(new[] { -w, (y0 + y1) / 2, z - 0.05 }, new[] { w, (y0 + y1) / 2, z - 0.05 }, 0.03));
                bb.Add(Beam(new[] { -w * 0.4, y1 + 0.05, z - 0.02 }, new[] { w * 0.4, y1 + 0.05, z - 0.02 }, 0.03));
                add(Merge(bb), metal);
            }
            if (armor >= 6 || cageForced)
            {
                var cg = new List<MGeo>();
                double[] zs = { GhZ(T.roofR + 0.03), GhZ(T.roofF - 0.02) };
                double yb = d.yBelt - 0.25, yt = d.roof - 0.06, w = d.half * T.tumble * 0.85;
                bool full = armor >= 8 || cageForced;
                foreach (var z in full ? zs : new[] { zs[0] + 0.15 })
                {
                    cg.Add(Beam(new[] { w, yb, z }, new[] { w, yt, z }, 0.022)); cg.Add(Beam(new[] { -w, yb, z }, new[] { -w, yt, z }, 0.022)); cg.Add(Beam(new[] { w, yt, z }, new[] { -w, yt, z }, 0.022));
                }
                if (full) { foreach (var sgn in new[] { 1, -1 }) cg.Add(Beam(new[] { sgn * w, yt, zs[0] }, new[] { sgn * w, yt, zs[1] }, 0.022)); cg.Add(Beam(new[] { w, yb, zs[0] }, new[] { -w, yt, zs[0] }, 0.02)); }
                add(Merge(cg), Own(Std("cage", md.cage != 0 ? 0x1a1a1a : 0x8a1d18, 0.5f, 0.5f)));
            }
            if (armor >= 12)
                foreach (var sgn in new[] { 1, -1 })
                    add(RoundedBox(0.02, (d.yBelt - d.bottom) * 0.45, (d.a + d.b) * 0.55, 0.01, 1).Translate(sgn * (d.half + 0.02), d.bottom + (d.yBelt - d.bottom) * 0.42, (d.a - d.b) / 2 - 0.1), M("darkSteel"));
            // exhaust
            for (int i = exhaustGroup.childCount - 1; i >= 0; i--) DestroyTree(exhaustGroup.GetChild(i).gameObject, keepMeshes);
            double exR = 0.03 + Math.Min(0.03, eng * 0.002) + (md.sport != 0 ? 0.012 : 0);
            var tips = eng >= 10 || md.sport != 0 || md.type == "muscle" ? new[] { -1, 1 } : new[] { -1 };
            foreach (var sgn in tips)
            {
                var t = Obj("tip", exhaustGroup, Cylinder(exR, exR * 0.9, 0.28, 12, 1, true), eng >= 4 || md.sport != 0 ? M("chrome") : M("rusty")).transform;
                t.localRotation = SimX(Math.PI / 2);
                SetSimLocal(t, sgn * d.half * 0.55, d.bottom + 0.08, d.zR - 0.04);
            }
            exhaustTips = tips.Select(sgn => V(sgn * d.half * 0.55, d.bottom + 0.08, d.zR - 0.18)).ToList();
            // hood scoop / vents (on the hood pivot)
            if (hoodExtras) DestroyTree(hoodExtras.gameObject, keepMeshes);
            hoodExtras = Node("hoodExtras", hoodPivot).transform;
            var hp = SimLocalPos(hoodPivot);
            double hoodLen = d.zF - hp.z;
            if (eng >= 14 || turbo >= 10)
                Obj("scoop", hoodExtras, RoundedBox(d.W * 0.26, 0.08, hoodLen * 0.4, 0.03, 1).Translate(0, 0.07 - hoodLen * 0.32 * Math.Tan(0.06), hoodLen * 0.4), paintMat);
            if (cool >= 5)
                foreach (var sgn in new[] { 1, -1 })
                {
                    var vt = Obj("vent", hoodExtras, Plane(0.22, 0.16), M("grille"), false).transform;
                    vt.localRotation = SimX(-Math.PI / 2 + 0.05);
                    SetSimLocal(vt, sgn * d.W * 0.22, 0.03 - 0.02, hoodLen * 0.32);
                }
            // carbon parts from weight reduction
            SetPartMat("hood", wgt >= 8 ? M("carbon") : paintMat);
            if (parts.ContainsKey("roof")) SetPartMat("roof", wgt >= 12 ? M("carbon") : paintMat);
            if (parts.ContainsKey("trunk")) SetPartMat("trunk", wgt >= 10 ? M("carbon") : paintMat);
            if (parts.TryGetValue("interior", out var interior)) interior.visible = wgt < 9;
            // fuel: roof cans
            if (fuel >= 4)
            {
                int cans = fuel >= 10 ? 4 : fuel >= 6 ? 2 : 1;
                double y = (rackY ?? d.roof + 0.04) + 0.14;
                for (int k = 0; k < cans; k++)
                {
                    var c = Obj("can", g, RoundedBox(0.16, 0.26, 0.34, 0.02, 1), M("fuelCan")).transform;
                    SetSimLocal(c, (k % 2 != 0 ? -1 : 1) * 0.22, y, GhZ(U.Lerp(T.roofR, T.roofF, 0.3)) - Math.Floor(k / 2.0) * 0.38);
                }
                if (rackY == null) add(Box(0.8, 0.02, 0.9).Translate(0, d.roof + 0.03, GhZ(U.Lerp(T.roofR, T.roofF, 0.3)) - 0.2), M("darkSteel"));
            }
            // turbo + intercooler
            engineParts["filter"].gameObject.SetActive(turbo == 0);
            if (turboMesh) DestroyTree(turboMesh.gameObject, keepMeshes);
            turboMesh = null;
            if (turbo >= 1 || car.sound.turbo != 0)
            {
                var tm = Node("turbo", engineBay).transform;
                var bz = SimLocalPos(engineParts["block"]).z;
                var snail = Obj("snail", tm, Torus(0.08, 0.04, 8, 14), M("steel")).transform;
                SetSimLocal(snail, d.half * 0.45, d.yBelt - 0.15, bz + 0.1);
                Obj("pipe", tm, Beam(new[] { d.half * 0.45, d.yBelt - 0.15, bz + 0.1 }, new[] { 0, d.yBelt - 0.1, d.zF - 0.3 }, 0.035), M("steel"));
                turboMesh = tm;
                if (turbo >= 3)
                {
                    var ic = Obj("intercooler", g, Box(d.W * 0.5, 0.14, 0.04), M("steel")).transform;
                    SetSimLocal(ic, 0, d.bottom + 0.3, d.zF - 0.06);
                }
            }
            // brakes: calipers colour up with level
            int calCol = br >= 15 ? 0xd0a020 : br >= 8 ? 0xb31d17 : br >= 3 ? 0x5a5a5a : 0x3a3a3a;
            SetColor(caliperMat, Hex(calCol));
            foreach (var w in wheels) { float s = 1 + Math.Min(0.4f, br * 0.025f); var ls = w.caliper.localScale; w.caliper.localScale = new Vector3(Mathf.Sign(ls.x) * s, s, s); }
            // tyres
            string tk = MatDefs.TireKind(tireId);
            var tmat = M(TireMat(tireId));
            foreach (var w in wheels)
            {
                var r = w.tire.GetComponent<MeshRenderer>(); if (r) r.sharedMaterial = tmat;
                w.tire.localScale = new Vector3(tk == "offroad" ? 1.12f : tk == "perf" || tk == "race" ? 1.06f : 1f, 1, 1);
            }
            // suspension colour
            int sus = L("suspension");
            SetColor(strutMat, Hex(sus >= 10 ? 0xc9a227 : sus >= 7 ? 0x2a5aa0 : 0x2c2e30));
        }

        void SetPartMat(string name, Material m)
        {
            if (!parts.TryGetValue(name, out var p) || !p.mr) return;
            var arr = p.mr.sharedMaterials;
            for (int i = 0; i < arr.Length; i++) arr[i] = m;
            p.mr.sharedMaterials = arr;
        }

        public double GhZ(double u) => dims.zR + u * dims.L;

        public void SetPaint(int? color, string finish)
        {
            var md = car.model;
            int c = color ?? md.paint;
            var old = paintMat;
            paintMat = null;
            var fresh = MakePaint(c, finish ?? (md.sport != 0 ? "metallic" : "solid"));
            paintMat = fresh;
            foreach (var r in group.GetComponentsInChildren<MeshRenderer>(true))
            {
                var arr = r.sharedMaterials; bool ch = false;
                for (int i = 0; i < arr.Length; i++) if (arr[i] == old) { arr[i] = fresh; ch = true; }
                if (ch) r.sharedMaterials = arr;
            }
            if (oddMat == old) oddMat = fresh;
            if (bumperMat == old) bumperMat = fresh;
            owned.Remove(old); Destroy(old);
            ApplyWear();
        }

        // ---------------------------------------------------------------- damage
        public void ResetDamage()
        {
            foreach (var m in deform)
            {
                if (m.mf && m.orig != null)
                {
                    var mesh = m.mf.sharedMesh;
                    var v = new Vector3[m.orig.Length];
                    for (int i = 0; i < v.Length; i++) v[i] = Coord.ToUnity(m.orig[i]);
                    mesh.vertices = v; mesh.RecalculateNormals(); mesh.RecalculateBounds();
                }
                m.visible = true;
                m.detached = false;
            }
            foreach (var n in new[] { "bumperF", "bumperR" })
                if (parts.TryGetValue(n, out var b) && b.go)
                {
                    b.go.SetActive(true); b.detached = false;
                    b.go.transform.localPosition = Vector3.zero; b.go.transform.localRotation = Quaternion.identity;
                }
            SetPartMat("lightL", lightMatL); SetPartMat("lightR", lightMatR);
            SetAlpha(crackMat, 0);
            var md = car.model;
            wear = new Wear { dirt = md.wear * 0.25, rust = md.rust, scratch = md.wear * 0.35 };
            ApplyWear();
            hood = 0;
        }

        // patchWear/setWear stand-in: dirt and rust tint the paint, scratches dull it
        public void ApplyWear()
        {
            void Apply(Material m, Color baseC, float rough, float metal, bool trim)
            {
                if (!m) return;
                float dirt = (float)U.Clamp(wear.dirt, 0, 1), rust = trim ? 0 : (float)U.Clamp(wear.rust, 0, 1), scr = (float)U.Clamp(wear.scratch * (trim ? 0.4 : 1), 0, 1.4);
                var c = Color.Lerp(baseC, new Color(0.36f, 0.31f, 0.24f), dirt * 0.45f);
                c = Color.Lerp(c, new Color(0.42f, 0.24f, 0.12f), rust * 0.5f);
                SetColor(m, c);
                SetPbr(m, Mathf.Clamp01(rough + dirt * 0.3f + scr * 0.12f), metal * (1 - dirt * 0.4f));
            }
            Apply(paintMat, paintColor, paintRough, paintMetal, false);
            if (oddMat != paintMat) Apply(oddMat, Hex(0x6f7a72), 0.42f, 0.05f, false);
            Apply(trimMat, Hex(car.model.trim), 0.7f, 0.1f, true);
        }

        // Bots: fold every static body part into one mesh per material, drop hidden parts and give
        // up dents / falling parts, which only the player needs.
        public void Bake()
        {
            if (baked) return;
            baked = true;
            var stops = new HashSet<Transform>(wheels.Select(w => w.pivot));
            foreach (var n in new[] { "lightL", "lightR" }) if (parts.TryGetValue(n, out var p) && p.go) { p.go.transform.SetParent(group, true); stops.Add(p.go.transform); }
            bool UnderStop(Transform t) { for (var x = t; x && x != group; x = x.parent) if (stops.Contains(x)) return true; return false; }
            var buckets = new Dictionary<(Material, bool), List<CombineInstance>>();
            var w2l = group.worldToLocalMatrix;
            var drop = new List<GameObject>();
            foreach (var r in group.GetComponentsInChildren<MeshRenderer>(true))
            {
                if (UnderStop(r.transform)) continue;
                var mf = r.GetComponent<MeshFilter>();
                if (r.gameObject.activeInHierarchy && r.enabled && mf && mf.sharedMesh)
                {
                    var mats = r.sharedMaterials;
                    bool sh = r.shadowCastingMode != UnityEngine.Rendering.ShadowCastingMode.Off;
                    for (int s = 0; s < mf.sharedMesh.subMeshCount; s++)
                    {
                        var m = mats.Length > 0 ? mats[Math.Min(s, mats.Length - 1)] : null;
                        if (!m) continue;
                        if (!buckets.TryGetValue((m, sh), out var l)) buckets[(m, sh)] = l = new List<CombineInstance>();
                        l.Add(new CombineInstance { mesh = mf.sharedMesh, subMeshIndex = s, transform = w2l * r.transform.localToWorldMatrix });
                    }
                }
            }
            for (int i = group.childCount - 1; i >= 0; i--)
            {
                var c = group.GetChild(i);
                if (!stops.Contains(c)) drop.Add(c.gameObject);
            }
            foreach (var kv in buckets)
            {
                var mesh = new Mesh { name = "baked_" + car.id, indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
                mesh.CombineMeshes(kv.Value.ToArray(), true, true);
                var go = Obj("baked", group, mesh, kv.Key.Item1, kv.Key.Item2);
                go.GetComponent<MeshRenderer>().receiveShadows = true;
            }
            foreach (var go in drop) DestroyTree(go, keepMeshes);
            foreach (var w in wheels) SetShadows(w.pivot.gameObject, false);
            // parts that were merged are gone; keep the lamps and the (dead) references null-safe
            foreach (var k in parts.Keys.ToList()) if (k != "lightL" && k != "lightR") parts[k].go = null;
            deform.Clear();
            engineBay = null; hoodPivot = null; exhaustGroup = null; upg = null; hoodExtras = null; extras = null;
        }

        // Dent the panels around a local impact point.
        public void Dent(double lx, double ly, double lz, double amount)
        {
            if (baked) return;
            double radius = 0.35 + Math.Min(1.1, amount * 3);
            double depth = Math.Min(0.2, amount * 0.55);
            double r2 = radius * radius;
            var hp = hoodPivot ? SimLocalPos(hoodPivot) : Vector3.zero;
            foreach (var m in deform)
            {
                if (!m.visible || !m.mf) continue;
                bool onHood = m.parent == hoodPivot;
                double ox_ = onHood ? hp.x : 0, oy_ = onHood ? hp.y : 0, oz_ = onHood ? hp.z : 0;
                double px = lx - ox_, py = ly - oy_, pz = lz - oz_;
                var mesh = m.mf.sharedMesh;
                var uv = mesh.vertices;
                var o = m.orig;
                bool touched = false;
                for (int i = 0; i < uv.Length; i++)
                {
                    double ax = -uv[i].x, ay = uv[i].y, az = uv[i].z;
                    double dx = ax - px, dy = ay - py, dz = az - pz;
                    double d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 > r2) continue;
                    double f = 1 - Math.Sqrt(d2) / radius;
                    double cx = -(ax + ox_), cy = -(ay + oy_) * 0.3, cz = -(az + oz_);
                    double cl = Math.Sqrt(cx * cx + cy * cy + cz * cz); if (cl == 0) cl = 1;
                    double nn = Math.Sin(ax * 37 + az * 23) * 0.35 + 0.8;
                    double k = depth * f * f * nn;
                    ax += cx / cl * k; ay += cy / cl * k - k * 0.15; az += cz / cl * k;
                    double ex = ax - o[i].x, ey = ay - o[i].y, ez = az - o[i].z;
                    double ol = Math.Sqrt(ex * ex + ey * ey + ez * ez);
                    if (ol > 0.28) { double s = 0.28 / ol; ax = o[i].x + ex * s; ay = o[i].y + ey * s; az = o[i].z + ez * s; }
                    uv[i] = new Vector3((float)-ax, (float)ay, (float)az);
                    touched = true;
                }
                if (touched) { mesh.vertices = uv; mesh.RecalculateNormals(); mesh.RecalculateBounds(); }
            }
        }

        static readonly float[] CRACK = { 0, 0.45f, 0.75f, 1 };

        // Visual damage state from the physics damage model.
        public void SyncDamage(VehicleDamage dmg)
        {
            SetPartMat("lightL", dmg.lightL < 0.4 ? M("headlightBroken") : lightMatL);
            SetPartMat("lightR", dmg.lightR < 0.4 ? M("headlightBroken") : lightMatR);
            SetAlpha(crackMat, CRACK[(int)Math.Min(3, Math.Max(0, dmg.glass))]);
            if (baked) return;
            double avg = (dmg.front + dmg.rear + dmg.left + dmg.right) / 4;
            wear.scratch = Math.Max(wear.scratch, (1 - avg) * 1.4);
            if (dmg.bumperF < 0.6 && dmg.bumperF > 0 && parts.TryGetValue("bumperF", out var bf) && !bf.detached && bf.go)
            {
                bf.go.transform.localRotation = SimZ((0.6 - dmg.bumperF) * 0.35);
                SetSimLocal(bf.go.transform, 0, -(0.6 - dmg.bumperF) * 0.12, 0);
            }
            if (dmg.bumperR < 0.6 && dmg.bumperR > 0 && parts.TryGetValue("bumperR", out var brr) && !brr.detached && brr.go)
            {
                brr.go.transform.localRotation = SimZ(-(0.6 - dmg.bumperR) * 0.3);
                SetSimLocal(brr.go.transform, 0, -(0.6 - dmg.bumperR) * 0.1, 0);
            }
            ApplyWear();
        }

        // Detach a part and hand it to the caller as a free world-space object (for Debris).
        public Transform Detach(string name)
        {
            if (baked) return null;
            if (!parts.TryGetValue(name, out var m) || !m.go || m.detached || !m.go.activeSelf) return null;
            var clone = UnityEngine.Object.Instantiate(m.go);
            clone.name = name + "_loose";
            clone.transform.SetPositionAndRotation(m.go.transform.position, m.go.transform.rotation);
            clone.transform.localScale = m.go.transform.lossyScale;
            var mf = clone.GetComponent<MeshFilter>();
            if (mf && mf.sharedMesh) mf.sharedMesh = UnityEngine.Object.Instantiate(mf.sharedMesh);
            SetShadows(clone, true);
            m.go.SetActive(false);
            m.detached = true;
            return clone.transform;
        }

        // ---------------------------------------------------------------- per frame
        public void SetPose(Vehicle.Vec3 p, Vehicle.Quat q)
        {
            group.SetPositionAndRotation(Coord.ToUnity(p.x, p.y, p.z), Coord.ToUnity(new Quaternion((float)q.x, (float)q.y, (float)q.z, (float)q.w)));
        }
        public void SetPose(Vector3 simPos, double hd)
        {
            group.SetPositionAndRotation(Coord.ToUnity(simPos), Coord.Yaw(hd));
        }
        public Vector3 SimPosition => Coord.FromUnity(group.position);
        public bool visible { get => gameObject && gameObject.activeSelf; set { if (gameObject) gameObject.SetActive(value); } }

        // a car-local simulation-space point to simulation world space (group.localToWorld)
        public Vector3 LocalToWorld(Vector3 simLocal) => Coord.FromUnity(group.TransformPoint(Coord.ToUnity(simLocal)));
        public Vector3 LocalToWorld(double x, double y, double z) => LocalToWorld(V(x, y, z));

        // `v` is the physics Vehicle; this maps wheel travel, steer and spin.
        public void UpdateFromVehicle(Vehicle v, double dt)
        {
            for (int i = 0; i < 4 && i < wheels.Count; i++)
            {
                var w = v.wheels[i]; var mw = wheels[i];
                var p = SimLocalPos(mw.pivot);
                p.y = (float)(w.my - (w.rest - w.comp));
                SetSimLocal(mw.pivot, p);
                mw.pivot.localRotation = SimY(w.steer + w.toe * 4) * SimZ((1 - w.health) * 0.12 * (w.left ? 1 : -1));
                mw.spinAngle = w.angle;
                mw.spin.localRotation = SimX(w.angle) * mw.spinBase;
            }
            if (parts.TryGetValue("steering", out var sw) && sw.go && steerBase.HasValue)
                sw.go.transform.localRotation = steerBase.Value * SimZ(-(v.wheels[0].steer + v.wheels[1].steer) * 0.5 * 9);
            if (cockpitOn && gauge != null)
            {
                gauge.t += dt;
                if (gauge.t > 0.066)
                {
                    gauge.t = 0;
                    double red = ph.engine != null && ph.engine.redline != 0 ? ph.engine.redline : 7000;
                    DrawGauges(Math.Abs(v.kmh), v.rpm / red, v.fuel / Math.Max(1, v.p.fuel), v.heat, v.gear);
                }
            }
            bool braking = v.input.brake > 0.1 && v.gear != -1;
            tailK = U.Lerp(tailK, braking ? 2.2 : 0.35, 1 - Math.Exp(-dt * 20));
            SetEmission(tailMat, TAIL_EMIT, (float)tailK);
            float lk = lightsOn ? 2.5f : 0.18f;
            SetEmission(lightMatL, HEAD_EMIT, lk); SetEmission(lightMatR, HEAD_EMIT, lk);
        }

        // spin / steer for cars without physics wheels (online remotes): adds dAngle to the spin
        public void SpinWheels(double dAngle, double frontSteer)
        {
            foreach (var w in wheels)
            {
                w.spinAngle += dAngle;
                w.spin.localRotation = SimX(w.spinAngle) * w.spinBase;
                w.pivot.localRotation = SimY(w.front ? frontSteer : 0);
            }
        }

        public void SetStaticWheels(double steer = 0)
        {
            foreach (var mw in wheels)
            {
                var p = SimLocalPos(mw.pivot); p.y = (float)dims.wcY; SetSimLocal(mw.pivot, p);
                mw.pivot.localRotation = SimY(mw.front ? steer : 0);
            }
        }

        public void OpenHood(double t)
        {
            hood = t;
            if (hoodPivot) hoodPivot.localRotation = SimX(-t * 1.05);
            if (engineBay) engineBay.gameObject.SetActive(t > 0.01);
        }

        // cockpit view: clearer glass from the inside
        public void SetGlassOpacity(float a) => SetAlpha(glassMat, a);

        public void SetInteriorVisible(bool on) { if (parts.TryGetValue("interior", out var p)) p.visible = on; }

        public void HideParts(params string[] names) { foreach (var n in names) if (parts.TryGetValue(n, out var p)) p.visible = false; }

        public void Dispose()
        {
            if (gameObject) DestroyTree(gameObject, keepMeshes);
            foreach (var m in owned) Destroy(m);
            owned.Clear();
            if (gauge != null) Destroy(gauge.tex);
        }
    }
}

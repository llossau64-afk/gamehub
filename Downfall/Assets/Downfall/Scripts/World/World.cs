// Port of src/world/world.js. Streams the mountain around the player in 100 m chunks:
// terrain, road, shoulders, decals, guard rails, tunnels, bridges, trees, rocks, signs,
// buildings, obstacles. Chunks are built in stages under a small per-frame time budget
// ahead of the player and disposed behind.
//
// All geometry is built in game coordinates (exactly the JS numbers) and converted to Unity
// space at the end (Geo.ToMesh mirrors x, instance matrices go through G.ToUnity).
// Static chunk geometry is a handful of merged MeshRenderers per chunk; trees, rocks, bushes,
// ground cover, fences, poles and circuit furniture are drawn with Graphics.DrawMeshInstanced
// from per-chunk matrix arrays (batches of ≤ 1023), switched by distance like the JS LOD groups.
//
// Per frame the game calls (like main.js / run.js):
//   world.Update(progressS, 1);                         // stream chunks (budget > 1: build now, loading screen)
//   world.Update2(dt, cameraPosGame, env.look, camera);  // LOD, wind/snow uniforms, water, instanced draws
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Rendering;

namespace Downfall
{
    public sealed class World
    {
        public const int CHUNK = 100;
        static readonly int NS = (int)(CHUNK / Track.STEP);
        static readonly double[] OFFS = { 0, 0.6, 1.6, 3, 5, 8, 12, 17, 24, 33, 45, 60, 80, 105, 140 };
        static readonly double[] REF = { 0.37, 0.46, 0.17 };

        sealed class RailSeg { public GameObject go; public int j0, j1, side; }
        sealed class Animated { public int chunk; public Material mat; public Vector3 pos; }
        sealed class Saved { public InstBatch b; public int i; public Matrix4x4 m; }
        sealed class Smashed { public WorldCollider o; public readonly List<Saved> saved = new List<Saved>(); }

        sealed class Chunk
        {
            public int k, j0, j1;
            public GameObject go;
            public MeshGroup mg = new MeshGroup();
            public readonly List<Mesh> meshes = new List<Mesh>();
            public readonly List<Material> ownedMats = new List<Material>();
            public readonly List<RailSeg> railSegs = new List<RailSeg>();
            public readonly List<GameObject> cars = new List<GameObject>();
            public double cx, cz;
            public bool hasStream;
            public Vector3 stream;   // game space
            public readonly List<InstBatch>[] layers = new List<InstBatch>[Instancer.LAYERS];
            public readonly bool[] vis = { true, false, true, true, true, true };
            public bool veg, hasBounds;
            public Bounds bounds;
            public Chunk() { for (int i = 0; i < layers.Length; i++) layers[i] = new List<InstBatch>(); }
        }

        sealed class Job { public int k; public IEnumerator it; }

        public readonly Track track;
        public readonly GameObject root;
        readonly Transform rootT;
        readonly Dictionary<int, Chunk> chunks = new Dictionary<int, Chunk>();
        Job job;
        public double sliceMs = 4;    // per-frame build budget while driving
        public string quality;
        public double ahead, behind, treeMul;
        public bool castTrees;
        public double time;
        readonly List<Animated> animated = new List<Animated>();
        readonly Material splat;
        readonly List<Smashed> smashed = new List<Smashed>();
        /// <summary>Unity layer the instanced batches render on.</summary>
        public int renderLayer;
        /// <summary>Builds the wrecked car of a 'car' obstacle (carModel.js is ported elsewhere).
        /// Return a GameObject in Unity space; null falls back to the plain car prefab.</summary>
        public Func<TrackObstacle, GameObject> wreckFactory;

        readonly System.Diagnostics.Stopwatch sw = new System.Diagnostics.Stopwatch();
        readonly List<int> order = new List<int>();
        readonly Dictionary<int, double> want = new Dictionary<int, double>();
        readonly List<int> tmpKeys = new List<int>();
        readonly Plane[] planes = new Plane[6];
        double sortS;
        readonly Comparison<int> cmpLinear;
        readonly TrackQuery q = new TrackQuery(), qr = new TrackQuery();

        public World(Track track, string quality = "medium", Transform parent = null)
        {
            this.track = track;
            root = new GameObject("world");
            rootT = root.transform;
            if (parent) rootT.SetParent(parent, false);
            SetQuality(quality);
            track.extraCol = new Dictionary<int, List<WorldCollider>>();
            splat = WorldMats.Terrain(quality);
            cmpLinear = (a, b) => Math.Abs(a * CHUNK + 50 - sortS).CompareTo(Math.Abs(b * CHUNK + 50 - sortS));
        }

        public void SetQuality(string q)
        {
            quality = q;
            ahead = q == "low" ? 600 : q == "high" ? 1000 : 800;
            behind = 200;
            treeMul = q == "low" ? 0.45 : q == "high" ? 1.15 : 0.8;
            castTrees = q != "low";
        }

        public void Dispose()
        {
            job = null;
            tmpKeys.Clear(); tmpKeys.AddRange(chunks.Keys);
            foreach (var k in tmpKeys) Unload(k);
            ResetBreakables();
            if (root) UnityEngine.Object.Destroy(root);
        }
        public void Clear() => Dispose();

        // ------------------------------------------------------------------ streaming
        /// <summary>Load / unload around progress s; build at most `budget` chunks per call (budget > 1:
        /// loading screen, builds right away). Returns the number of chunks still wanted.</summary>
        public int Update(double s, int budget = 1)
        {
            var t = track;
            order.Clear();
            if (t.loop)
            {
                int nC = (int)Math.Ceiling((t.N - 1) / (double)NS);
                want.Clear();
                double back = Math.Min(behind + 100, t.length / 2), fwd = Math.Min(ahead, t.length - back);
                for (int c = (int)Math.Floor((s - back) / CHUNK); c <= (int)Math.Floor((s + fwd) / CHUNK); c++)
                {
                    int kk = ((c % nC) + nC) % nC;
                    double dist = Math.Abs(c * CHUNK + 50 - s);
                    if (!want.TryGetValue(kk, out var dd) || dd > dist) want[kk] = dist;
                }
                tmpKeys.Clear(); tmpKeys.AddRange(chunks.Keys);
                foreach (var k in tmpKeys) if (!want.ContainsKey(k)) Unload(k);
                foreach (var kv in want) if (!chunks.ContainsKey(kv.Key)) order.Add(kv.Key);
                order.Sort((a, b) => want[a].CompareTo(want[b]));
            }
            else
            {
                int first = Math.Max(0, (int)Math.Floor((s - behind) / CHUNK));
                int last = Math.Min((int)Math.Floor(t.total / CHUNK) - 1, (int)Math.Floor((s + ahead) / CHUNK));
                tmpKeys.Clear(); tmpKeys.AddRange(chunks.Keys);
                foreach (var k in tmpKeys) if (k < first - 1 || k > last + 1) Unload(k);
                for (int c = first; c <= last; c++) if (!chunks.ContainsKey(c)) order.Add(c);
                sortS = s;
                order.Sort(cmpLinear);
            }
            if (budget > 1)
            {
                if (job != null) FinishJob();
                int built = 0;
                foreach (var c in order)
                {
                    if (built >= budget) break;
                    if (!chunks.ContainsKey(c)) Build(c);
                    built++;
                }
                return order.Count - built;
            }
            // while driving: build chunks in stages under a small per-frame time budget
            sw.Restart();
            while (sw.Elapsed.TotalMilliseconds < sliceMs)
            {
                if (job == null)
                {
                    int next = -1; bool found = false;
                    foreach (var c in order) if (!chunks.ContainsKey(c)) { next = c; found = true; break; }
                    if (!found) break;
                    job = new Job { k = next, it = BuildStages(next) };
                }
                if (!job.it.MoveNext()) job = null;
            }
            return order.Count;
        }

        void FinishJob()
        {
            while (job != null && job.it.MoveNext()) { }
            job = null;
        }

        void Unload(int k)
        {
            if (job != null && job.k == k) FinishJob();
            if (!chunks.TryGetValue(k, out var ch)) return;
            DestroyChunk(ch);
            track.extraCol.Remove(k);
            chunks.Remove(k);
            animated.RemoveAll(a => a.chunk == k);
            smashed.RemoveAll(sm => { foreach (var sv in sm.saved) if (BatchIn(ch, sv.b)) return true; return false; });
        }

        static bool BatchIn(Chunk ch, InstBatch b) { foreach (var l in ch.layers) if (l.Contains(b)) return true; return false; }

        void DestroyChunk(Chunk ch)
        {
            if (ch.go) UnityEngine.Object.Destroy(ch.go);
            foreach (var m in ch.meshes) if (m) UnityEngine.Object.Destroy(m);
            foreach (var m in ch.ownedMats) if (m) UnityEngine.Object.Destroy(m);
            foreach (var c in ch.cars) if (c) UnityEngine.Object.Destroy(c);
        }

        void Build(int k)
        {
            if (job != null && job.k == k) { FinishJob(); return; }
            var it = BuildStages(k);
            while (it.MoveNext()) { }
        }

        IEnumerator BuildStages(int k)
        {
            var t = track;
            int j0 = k * NS, j1 = Math.Min(t.N - 1, j0 + NS);
            int jm = Math.Min(t.N - 1, (j0 + j1) >> 1);
            var ch = new Chunk { k = k, j0 = j0, j1 = j1, cx = t.px[jm], cz = t.pz[jm] };
            ch.go = new GameObject("chunk" + k);
            ch.go.SetActive(false);
            ch.go.transform.SetParent(rootT, false);
            var R = new Rng(t.m.seed * 1000 + k * 7919);
            BuildTerrain(ch); yield return null;
            BuildRoad(ch); BuildDecals(ch); yield return null;
            BuildRails(ch); BuildStructures(ch); yield return null;
            var veg = BuildVegetation(ch, R);
            while (veg.MoveNext()) yield return null;
            yield return null;
            BuildSigns(ch); BuildProps(ch, R); BuildObstacles(ch, R);
            if (!ch.mg.Empty) ch.mg.Build(ch.go.transform, "static", ch.meshes);
            ch.go.SetActive(true);
            chunks[k] = ch;
        }

        // ------------------------------------------------------------------ mesh helpers
        GameObject AddMesh(Chunk ch, Mesh mesh, Material mat, bool cast, bool receive, string name)
        {
            var o = new GameObject(name);
            o.transform.SetParent(ch.go.transform, false);
            o.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = o.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = cast ? ShadowCastingMode.On : ShadowCastingMode.Off;
            r.receiveShadows = receive;
            ch.meshes.Add(mesh);
            return o;
        }

        // Geo with several index lists (one per material) -> one mesh with submeshes
        static Mesh SubMesh(Geo g, List<List<int>> subs, string name)
        {
            var m = g.ToMesh(name);
            m.subMeshCount = subs.Count;
            for (int s = 0; s < subs.Count; s++)
            {
                var l = subs[s]; var a = new int[l.Count];
                for (int i = 0; i + 2 < a.Length; i += 3) { a[i] = l[i]; a[i + 1] = l[i + 2]; a[i + 2] = l[i + 1]; }
                m.SetTriangles(a, s);
            }
            m.RecalculateBounds();
            return m;
        }

        static Color LerpC(Color a, Color b, double t) { float f = (float)t; return new Color(a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f, 1); }
        static double Sstep(double a, double b, double v) => U.Smoothstep(a, b, v);
        static double Lerp(double a, double b, double t) => a + (b - a) * t;
        static bool T(double v) => Track.Truthy(v);
        static double TreeD(BiomeDef b) => b.trees != null && T(b.trees.density) ? b.trees.density : 0;

        // ------------------------------------------------------------------ terrain
        void BuildTerrain(Chunk ch)
        {
            var t = track;
            var rows = new List<int>();
            for (int j = ch.j0; j <= ch.j1; j += 2) rows.Add(j);
            if (rows[rows.Count - 1] != ch.j1) rows.Add(ch.j1);
            int cols = OFFS.Length * 2;
            int nv = rows.Count * cols;
            var g = new Geo { c = new List<Color>(nv) };
            var spA = new List<Vector4>(nv); var spB = new List<Vector4>(nv);
            for (int i = 0; i < nv; i++) { g.v.Add(Vector3.zero); g.n.Add(Vector3.up); g.uv.Add(Vector2.zero); g.c.Add(Color.white); spA.Add(Vector4.zero); spB.Add(Vector4.zero); }
            bool sp = splat != null;
            for (int ri = 0; ri < rows.Count; ri++)
            {
                int j = rows[ri];
                double s = j * Track.STEP;
                double k = t.k[j];
                double halfW = t.width[j] / 2;
                var bio = t.Biome(s);
                var look = bio.look;
                var (ba, bb, bt) = t.BiomeBlend(s);
                var lookB = t.m.biomes[bb].look;
                Color grass = LerpC(G.Lin(look.grass), G.Lin(lookB.grass), bt);
                Color dirt = LerpC(G.Lin(look.dirt), G.Lin(lookB.dirt), bt);
                Color rock = LerpC(G.Lin(look.rock), G.Lin(lookB.rock), bt);
                double snow = Lerp(look.snow, lookB.snow, bt);
                double roadY = t.RoadY(s);
                for (int side = 0; side < 2; side++)
                {
                    int sg = side != 0 ? 1 : -1;
                    bool inner = (k > 0 && sg < 0) || (k < 0 && sg > 0);
                    double maxD = inner && Math.Abs(k) > 1e-4 ? 0.85 / Math.Abs(k) : 1e9;
                    for (int ci = 0; ci < OFFS.Length; ci++)
                    {
                        double off = OFFS[ci];
                        double d = halfW + off;
                        if (d > maxD) d = Math.Max(halfW + 0.6, maxD);
                        d *= sg;
                        double x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
                        t.Query(x, z, q);
                        double h = ci == 0 ? roadY - 0.012 * halfW - 0.02 : q.h;
                        int vi = ri * cols + (side != 0 ? OFFS.Length + ci : OFFS.Length - 1 - ci);
                        g.v[vi] = G.V(x, h, z);
                        g.uv[vi] = new Vector2((float)(x * 0.11), (float)(z * 0.11));
                        double u = Math.Abs(d) - halfW;
                        int o = (j * 2 + side) * 5;
                        double wall = t.sw[o], cut = t.sw[o + 3], vd = t.sw[o + 4];
                        double steep = wall * Sstep(0.9, 1.8, t.slW[j * 2 + side]) * Sstep(1.5, 5, u);
                        double n = t.noise.N2(x * 0.05, z * 0.05) * 0.5 + 0.5;
                        double n2 = t.noise.N2(x * 0.21, z * 0.21) * 0.5 + 0.5;
                        double sn = snow * Sstep(0.25, 0.6, n2 * 0.6 + (1 - steep) * 0.5);
                        double slopeK = Sstep(2.2, 3.5, Math.Abs(h - roadY) / Math.Max(1, u));
                        if (sp)
                        {
                            double sand = t.offSurf[j] == SURF.SAND ? 1 : 0;
                            double slopeRock = slopeK * 0.85;
                            double wr = Math.Max(Math.Max(steep, slopeRock), Math.Max(vd > 0.3 ? 0.6 : 0, t.offSurf[j] == SURF.ROCK ? 0.25 * Sstep(3, 10, u) : 0));
                            double wgv = u < Track.SHOULDER + 0.5 ? 1 : u < 2.2 ? 0.45 : 0;
                            double wd = Math.Max(Math.Max(cut > 0.4 && u > 0.5 ? cut * 0.9 : 0, u < 3.5 ? 0.35 : 0), Sstep(0.62, 0.85, n) * 0.5);
                            double dens = TreeD(bio);
                            double forestK = dens > 0.7 ? 1 : dens > 0.45 ? 0.45 : 0;
                            double wf = forestK * Sstep(3, 9, u) * (0.5 + 0.6 * n2);
                            double wsn = snow > 0 ? U.Clamp(sn * 1.15, 0, 1) : 0;
                            double wg = 1;
                            double Rem(double vv) { double kk = Math.Min(vv, wg); wg -= kk; return kk; }
                            double R1 = Rem(wgv), R2 = Rem(wr), R3 = Rem(wd), R4 = Rem(wf);
                            double grassW = wg;
                            double sandW = grassW * sand; grassW -= sandW;
                            double k2 = 1 - wsn * 0.95;
                            spA[vi] = new Vector4((float)(grassW * k2), (float)(R4 * k2), (float)(R3 * k2), (float)(R1 * k2));
                            spB[vi] = new Vector4((float)(R2 * (1 - wsn * 0.6)), (float)(wsn * 0.95), (float)(sandW * k2), 0);
                            double tr = Lerp(1, U.Clamp(grass.r / REF[0], 0.55, 1.8), grassW), tgg = Lerp(1, U.Clamp(grass.g / REF[1], 0.55, 1.6), grassW), tb = Lerp(1, U.Clamp(grass.b / REF[2], 0.55, 1.8), grassW);
                            double rk = R2 * (1 - wsn);
                            double vary = 0.9 + n2 * 0.2;
                            g.c[vi] = new Color((float)(Lerp(tr, rock.r / 0.48, rk * 0.5) * vary), (float)(Lerp(tgg, rock.g / 0.47, rk * 0.5) * vary), (float)(Lerp(tb, rock.b / 0.44, rk * 0.5) * vary), 1);
                        }
                        else
                        {
                            var c = LerpC(grass, dirt, Sstep(0.55, 0.85, n) * 0.6);
                            if (u < Track.SHOULDER + 0.6) c = G.Mul(LerpC(dirt, G.Lin(0x8a8274), 0.45), (float)(0.9 + n2 * 0.2));
                            else if (u < 3.5) c = LerpC(c, dirt, 0.5);
                            c = LerpC(c, rock, Math.Max(steep, slopeK * 0.8));
                            if (cut > 0.4 && u > 0.5) c = LerpC(c, dirt, cut * 0.7);
                            if (vd > 0.3) c = LerpC(c, rock, 0.5);
                            if (sn > 0) c = LerpC(c, G.Lin(0xe9edf1), U.Clamp(sn * (u < Track.SHOULDER ? 0.6 : 1), 0, 0.95));
                            g.c[vi] = G.Mul(c, (float)(0.85 + n2 * 0.25));
                        }
                    }
                }
            }
            for (int ri = 0; ri < rows.Count - 1; ri++)
                for (int ci = 0; ci < cols - 1; ci++)
                {
                    if (ci == OFFS.Length - 1) continue; // the road sits between the two halves
                    int a = ri * cols + ci, b = a + 1, c = a + cols, d = c + 1;
                    g.Tri(a, b, c); g.Tri(b, d, c);
                }
            g.ComputeNormals();
            var mesh = g.ToMesh("terrain" + ch.k);
            if (sp) { mesh.SetUVs(1, spA); mesh.SetUVs(2, spB); }
            AddMesh(ch, mesh, sp ? splat : WorldMats.VC("terrain"), false, true, "terrain");
        }

        // ------------------------------------------------------------------ road
        void BuildRoad(Chunk ch)
        {
            var t = track;
            double[] across = { -1, -0.5, 0, 0.5, 1 };
            int n = ch.j1 - ch.j0 + 1;
            var g = new Geo();
            for (int i = 0; i < n; i++)
            {
                int j = ch.j0 + i; double hw = t.width[j] / 2;
                for (int a = 0; a < 5; a++)
                {
                    double d = across[a] * hw;
                    g.Add(G.V(t.px[j] + t.rx[j] * d, t.py[j] - 0.012 * Math.Abs(d) + 0.015, t.pz[j] + t.rz[j] * d), Vector3.up,
                        new Vector2((float)((across[a] + 1) / 2), (float)((j * Track.STEP) / 16)));
                }
            }
            var subs = new List<List<int>>(); var mats = new List<Material>();
            for (int i = 0; i < n - 1; i++)
            {
                int j = ch.j0 + i;
                var mat = WorldMats.Get(MatDefs.RoadBySurf[Math.Min(t.surf[j], MatDefs.RoadBySurf.Length - 1)]);
                int mi = mats.IndexOf(mat);
                if (mi < 0) { mats.Add(mat); subs.Add(new List<int>()); mi = mats.Count - 1; }
                var l = subs[mi];
                for (int a = 0; a < 4; a++)
                {
                    int p = i * 5 + a, qq = p + 1, r = p + 5, s = r + 1;
                    l.Add(p); l.Add(qq); l.Add(r); l.Add(qq); l.Add(s); l.Add(r);
                    g.Tri(p, qq, r); g.Tri(qq, s, r);
                }
            }
            g.ComputeNormals();
            var mesh = SubMesh(g, subs, "road" + ch.k);
            var o = AddMesh(ch, mesh, mats[0], false, true, "road");
            o.GetComponent<MeshRenderer>().sharedMaterials = mats.ToArray();
        }

        // strip quad following the road between s0..s1 and d0..d1
        Geo RoadQuad(double s0, double s1, double d0, double d1, double lift = 0.03, double uvRepeat = 1)
        {
            var t = track;
            int segs = Math.Max(1, (int)Math.Ceiling((s1 - s0) / 2));
            var g = new Geo();
            for (int i = 0; i <= segs; i++)
            {
                double s = Lerp(s0, s1, (double)i / segs);
                double f = U.Clamp(s / Track.STEP, 0, t.N - 1.001); int a = (int)Math.Floor(f); double tt = f - a;
                double x = Lerp(t.px[a], t.px[a + 1], tt), z = Lerp(t.pz[a], t.pz[a + 1], tt);
                double rx = Lerp(t.rx[a], t.rx[a + 1], tt), rz = Lerp(t.rz[a], t.rz[a + 1], tt);
                double y = Lerp(t.py[a], t.py[a + 1], tt);
                g.Add(G.V(x + rx * d0, y - 0.012 * Math.Abs(d0) + lift, z + rz * d0), Vector3.up, new Vector2(0, (float)((double)i / segs * uvRepeat)));
                g.Add(G.V(x + rx * d1, y - 0.012 * Math.Abs(d1) + lift, z + rz * d1), Vector3.up, new Vector2((float)uvRepeat, (float)((double)i / segs * uvRepeat)));
                if (i < segs) { int b = i * 2; g.Tri(b, b + 1, b + 2); g.Tri(b + 1, b + 3, b + 2); }
            }
            return g.ComputeNormals();
        }

        static Material gravelSpill;
        void BuildDecals(Chunk ch)
        {
            var t = track;
            double s0 = ch.j0 * Track.STEP, s1 = ch.j1 * Track.STEP;
            var mg = new MeshGroup { sortingOrder = 1 };
            foreach (var d in t.decals)
            {
                if (d.s1 < s0 || d.s0 >= s1) continue;
                double a = Math.Max(d.s0, s0), b = Math.Min(d.s1, s1);
                if (b - a < 0.5) continue;
                if (d.type == SURF.GRAVEL)
                {
                    if (!gravelSpill)
                    {
                        var def = new MatDef("gravelSpill", Color.white, 1f).Tex("Generated/road_gravel").Transparent(0.85f).NoShadows();
                        gravelSpill = Mats.Create(def);
                    }
                    mg.Add(RoadQuad(a, b, d.d0, d.d1, 0.03, 1), gravelSpill, null, false);
                    continue;
                }
                var mat = WorldMats.Get(d.type == SURF.MUD ? "mud" : d.type == SURF.WATER ? "puddle" : d.type == SURF.ICE ? "ice" : MatDefs.RoadBySurf[SURF.GRAVEL]);
                mg.Add(RoadQuad(a, b, d.d0, d.d1, d.type == SURF.WATER ? 0.035 : 0.03, 1), mat, null, false);
            }
            foreach (var p in t.potholes)
            {
                if (p.s < s0 || p.s >= s1) continue;
                mg.Add(RoadQuad(p.s - p.r * 1.3, p.s + p.r * 1.3, p.d - p.r * 1.3, p.d + p.r * 1.3, 0.025, 1), WorldMats.Get("pothole"), null, false);
            }
            if (!mg.Empty) mg.Build(ch.go.transform, "decals", ch.meshes);
        }

        // ------------------------------------------------------------------ rails
        void BuildRails(Chunk ch)
        {
            var t = track;
            for (int side = 0; side < 2; side++)
            {
                int j = ch.j0;
                while (j < ch.j1)
                {
                    int type = t.rail[j * 2 + side];
                    if (type == 0 || t.tunnel[j] != 0) { j++; continue; }
                    int e = j;
                    while (e < ch.j1 && e - j < 10 && t.rail[(e + 1) * 2 + side] == type) e++;
                    if (e > j)
                    {
                        var go = RailSegment(ch, j, e, side, type);
                        ch.railSegs.Add(new RailSeg { go = go, j0 = j, j1 = e, side = side });
                    }
                    j = e + 1;
                }
            }
        }

        GameObject RailSegment(Chunk ch, int j0, int j1, int side, int type)
        {
            var t = track; int sg = side != 0 ? 1 : -1;
            double D(int j) => sg * (t.width[j] / 2 + 0.55);
            Vector3 P(int j, double d, double y) => G.V(t.px[j] + t.rx[j] * d, t.py[j] + y, t.pz[j] + t.rz[j] * d);
            if (type == RAIL.CONCRETE)
            {
                double[,] sec = { { -0.3, 0 }, { -0.12, 0.25 }, { -0.08, 0.82 }, { 0.08, 0.82 }, { 0.12, 0.25 }, { 0.3, 0 } };
                var g = new Geo(); int nr = 6;
                for (int j = j0; j <= j1; j++) for (int a = 0; a < nr; a++) g.Add(P(j, D(j) + sec[a, 0] * sg + 0.12 * sg, sec[a, 1] - 0.05), Vector3.up, Vector2.zero);
                for (int i = 0; i < j1 - j0; i++) for (int a = 0; a < nr - 1; a++) { int p = i * nr + a; g.Tri(p, p + nr, p + 1); g.Tri(p + 1, p + nr, p + nr + 1); }
                g.ComputeNormals();
                return AddMesh(ch, g.ToMesh("rail"), WorldMats.Get("concrete"), true, true, "rail");
            }
            bool wood = type == RAIL.WOOD;
            double[,] prof = wood ? new double[,] { { 0, 0.55 }, { 0.06, 0.6 }, { 0, 0.65 }, { -0.06, 0.6 }, { 0, 0.55 } } : new double[,] { { 0, 0.52 }, { 0.05, 0.56 }, { 0.02, 0.63 }, { 0.05, 0.7 }, { 0, 0.74 } };
            var bg = new Geo(); int np = 5;
            for (int j = j0; j <= j1; j++) for (int a = 0; a < np; a++) bg.Add(P(j, D(j) - prof[a, 0] * sg, prof[a, 1]), Vector3.up, Vector2.zero);
            for (int i = 0; i < j1 - j0; i++) for (int a = 0; a < np - 1; a++) { int p = i * np + a; bg.Tri(p, p + 1, p + np); bg.Tri(p + 1, p + np + 1, p + np); }
            bg.ComputeNormals();
            var geos = new List<Geo> { bg.ToNonIndexed() };
            for (int j = j0; j <= j1; j += 2)
            {
                var pp = P(j, D(j) + 0.08 * sg, 0);
                var post = wood ? Geo.Cylinder(0.08, 0.09, 0.85, 6) : Geo.Box(0.08, 0.85, 0.12);
                post.RotateY(-t.hd[j]).Translate(pp.x, pp.y + 0.36, pp.z);
                geos.Add(post.ToNonIndexed());
            }
            return AddMesh(ch, Geo.Merge(geos).ToMesh("rail"), WorldMats.Get(wood ? "post" : "galv"), true, true, "rail");
        }

        /// <summary>Called when the physics breaks a rail: hides the nearby segment and returns it
        /// (the game clones it into debris), or null.</summary>
        public GameObject BreakRail(int idx, int side)
        {
            int k = (int)Math.Floor(idx * Track.STEP / CHUNK);
            for (int kk = k - 1; kk <= k + 1; kk++)
            {
                if (!chunks.TryGetValue(kk, out var ch)) continue;
                foreach (var r in ch.railSegs)
                    if (r.side == side && idx >= r.j0 - 2 && idx <= r.j1 + 2 && r.go.activeSelf) { r.go.SetActive(false); return r.go; }
            }
            return null;
        }
        public void ResetRails() { foreach (var ch in chunks.Values) foreach (var r in ch.railSegs) if (r.go) r.go.SetActive(true); }

        // ------------------------------------------------------------------ tunnels & bridges
        void BuildStructures(Chunk ch)
        {
            var t = track;
            foreach (var tn in t.tunnels)
            {
                int a = Math.Max(tn.a, ch.j0), b = Math.Min(tn.b, ch.j1);
                if (b <= a) continue;
                List<double[]> Arch(double hw)
                {
                    var pts = new List<double[]>();
                    double w = hw + 1.2, Hh = 4.2;
                    pts.Add(new[] { -w, -0.3 }); pts.Add(new[] { -w, 2.6 });
                    for (int i = 1; i < 10; i++) { double ang = Math.PI - i / 10.0 * Math.PI; pts.Add(new[] { Math.Cos(ang) * w, 2.6 + Math.Sin(ang) * (Hh - 2.6 + 1.6) }); }
                    pts.Add(new[] { w, 2.6 }); pts.Add(new[] { w, -0.3 });
                    return pts;
                }
                Geo Make(double scale, double extra, bool flip)
                {
                    var g = new Geo(); int nr = 0;
                    for (int j = a; j <= b; j++)
                    {
                        var pts = Arch(t.width[j] / 2);
                        nr = pts.Count;
                        double acc = 0, pd = 0, py0 = 0;
                        for (int i = 0; i < pts.Count; i++)
                        {
                            double d = pts[i][0] * scale + Math.Sign(pts[i][0]) * extra, y = pts[i][1] * scale + (pts[i][1] > 0 ? extra : 0);
                            if (i > 0) acc += Track.JsHypot(d - pd, y - py0);
                            pd = d; py0 = y;
                            g.Add(G.V(t.px[j] + t.rx[j] * d, t.py[j] + y, t.pz[j] + t.rz[j] * d), Vector3.up, new Vector2((float)(acc * 0.25), (float)(j * Track.STEP * 0.25)));
                        }
                    }
                    for (int i = 0; i < b - a; i++) for (int k2 = 0; k2 < nr - 1; k2++)
                    {
                        int p = i * nr + k2;
                        if (flip) { g.Tri(p, p + 1, p + nr); g.Tri(p + 1, p + nr + 1, p + nr); }
                        else { g.Tri(p, p + nr, p + 1); g.Tri(p + 1, p + nr, p + nr + 1); }
                    }
                    return g.ComputeNormals();
                }
                ch.mg.Add(Make(1, 0, false), WorldMats.Get("concreteDark"), null, false, true);
                var outer = Make(1, 2.2, true);
                var oc = G.Lin(0x7a776f);
                outer.Colorize((ref Color c, float x, float y, float z, int i) => c = G.Mul(oc, 0.85f + UnityEngine.Random.value * 0.2f));
                ch.mg.Add(outer, WorldMats.VC("rock"), null, true, false);
                var lamp = WorldMats.Get("tunnelLamp");
                for (int j = a; j <= b; j += 6)
                    ch.mg.Add(Geo.Box(0.25, 0.08, 1.4).RotateY(-t.hd[j]).Translate(t.px[j], t.py[j] + 5.6, t.pz[j]), lamp, null, false);
                foreach (int pj in new[] { tn.a, tn.b })
                {
                    if (pj < ch.j0 || pj > ch.j1) continue;
                    double hw = t.width[pj] / 2 + 1.2;
                    var M = G.TRS(t.px[pj], t.py[pj], t.pz[pj], G.Yaw(t.hd[pj]));
                    var con = WorldMats.Get("concrete");
                    ch.mg.Add(Geo.Box(4, 9, 1.4).Translate(-hw - 2, 4.2, 0), con, M);
                    ch.mg.Add(Geo.Box(4, 9, 1.4).Translate(hw + 2, 4.2, 0), con, M);
                    ch.mg.Add(Geo.Box(hw * 2 + 8, 2.2, 1.4).Translate(0, 7.9, 0), con, M);
                }
            }
            foreach (var br in t.bridges)
            {
                int a = Math.Max(br.a - 2, ch.j0), b = Math.Min(br.b + 2, ch.j1);
                if (b <= a) continue;
                var g = new Geo();
                for (int j = a; j <= b; j++)
                {
                    double hw = t.width[j] / 2;
                    double[,] sec = { { -hw - 0.7, 0.02 }, { hw + 0.7, 0.02 }, { hw + 0.7, -0.9 }, { -hw - 0.7, -0.9 }, { -hw - 0.7, 0.02 } };
                    for (int i = 0; i < 5; i++) g.Add(G.V(t.px[j] + t.rx[j] * sec[i, 0], t.py[j] + sec[i, 1], t.pz[j] + t.rz[j] * sec[i, 0]), Vector3.up, Vector2.zero);
                }
                for (int i = 0; i < b - a; i++) for (int k2 = 0; k2 < 4; k2++) { int p = i * 5 + k2; g.Tri(p, p + 5, p + 1); g.Tri(p + 1, p + 5, p + 6); }
                ch.mg.Add(g.ComputeNormals(), WorldMats.Get("concrete"));
                var piers = new List<Geo>();
                for (int j = br.a + 12; j < br.b - 6; j += 14)
                {
                    if (j < ch.j0 || j > ch.j1) continue;
                    double w4 = t.width[j] / 2 + 4;
                    double ground = t.Height(t.px[j] + t.rx[j] * w4, t.pz[j] + t.rz[j] * w4);
                    double top = t.py[j] - 0.9;
                    double h = Math.Max(2, top - Math.Min(ground, top - 2) + 4);
                    var p = br.style == "stone" ? Geo.Box(2.2, h, 3.2) : Geo.Cylinder(0.9, 1.2, h, 10);
                    p.RotateY(-t.hd[j]).Translate(t.px[j], top - h / 2, t.pz[j]);
                    piers.Add(p.ToNonIndexed());
                }
                if (piers.Count > 0) ch.mg.Add(Geo.Merge(piers), WorldMats.Get(br.style == "stone" ? "concreteDark" : "concrete"));
                if (br.style == "truss")
                {
                    var tr = new List<Geo>();
                    foreach (int sg in new[] { -1, 1 })
                        for (int j = a; j < b; j += 4)
                        {
                            double d = sg * (t.width[j] / 2 + 0.7); int j2 = Math.Min(b, j + 4);
                            var A = new[] { t.px[j] + t.rx[j] * d, t.py[j] + 0.1, t.pz[j] + t.rz[j] * d };
                            var B = new[] { t.px[j2] + t.rx[j2] * d, t.py[j2] + 3.2, t.pz[j2] + t.rz[j2] * d };
                            var C = new[] { t.px[j2] + t.rx[j2] * d, t.py[j2] + 0.1, t.pz[j2] + t.rz[j2] * d };
                            var D2 = new[] { t.px[j] + t.rx[j] * d, t.py[j] + 3.2, t.pz[j] + t.rz[j] * d };
                            tr.Add(PR.BeamGeo(A, B, 0.08)); tr.Add(PR.BeamGeo(D2, B, 0.1)); tr.Add(PR.BeamGeo(C, B, 0.08)); tr.Add(PR.BeamGeo(A, C, 0.1));
                        }
                    ch.mg.Add(Geo.Merge(tr), WorldMats.Get("rusty"));
                }
                if (br.a >= ch.j0 && br.a <= ch.j1)
                {
                    int jm = Track.JsRoundI((br.a + br.b) / 2.0);
                    double yb = t.Height(t.px[jm] + t.rx[jm] * 25, t.pz[jm] + t.rz[jm] * 25);
                    var pos = G.V(t.px[jm], Math.Min(yb, t.py[jm] - 30) + 0.6, t.pz[jm]);
                    var M = Matrix4x4.TRS(pos, G.Euler(-Math.PI / 2, 0, -t.hd[jm] + Math.PI / 2), Vector3.one);
                    ch.mg.Add(Geo.Plane(24, 220), WorldMats.Get("stream"), M, false, true);
                    ch.hasStream = true; ch.stream = pos;
                }
            }
        }

        // ------------------------------------------------------------------ vegetation
        string[] TreeNames(string kind, int v, BiomeDef b, TreeMix tr, Rng R)
        {
            bool dry = tr != null && T(tr.dry), autumn = b.look.warmth > 0.3 && !dry;
            if (dry && R.Next() < 0.3) return new[] { "dead" + (v % 2) + "_none_lod0", "dead" + (v % 2) + "_none_lod0" };
            string bse;
            if (kind == "pine" || kind == "spruce") bse = kind + (v % 3);
            else if (kind == "birch") bse = "birch" + (v % 2) + (autumn && R.Next() < 0.6 ? "_autumn" : "");
            else if (kind == "cherry") bse = "cherry" + (v % 3);
            else if (kind == "maple") bse = "maple" + (v % 2) + "_maple";
            else if (kind == "cypress") bse = "cypress" + (v % 2);
            else bse = "oak" + (v % 2) + (dry ? "_dry" : autumn && R.Next() < 0.7 ? "_autumn" : "");
            return new[] { bse + "_lod0", bse + "_lod1" };
        }

        static readonly string[] KINDS = { "pine", "spruce", "birch", "oak", "cherry", "maple", "cypress" };

        sealed class Spot { public double s, u, x, z, h, d, halfW; public int j, side, o; }
        sealed class Block { public double x, z, fx, fz, rx, rz, a, b; }

        IEnumerator BuildVegetation(Chunk ch, Rng R)
        {
            var t = track;
            double s0 = ch.j0 * Track.STEP;
            var b = t.Biome(s0 + 50);
            var tr = b.trees ?? new TreeMix();
            double density = (T(tr.density) ? tr.density : 0) * treeMul;
            var kinds = new List<string>(); var weights = new List<double>();
            foreach (var kk in KINDS) if (T(tr.Get(kk))) { kinds.Add(kk); weights.Add(tr.Get(kk)); }
            double wsum = 0; foreach (var w in weights) wsum += w; if (wsum == 0) wsum = 1;
            bool snowy = b.look.snow > 0.5;
            bool useAssets = Parts.Get("pine0_lod0") != null;
            bool dryT = T(tr.dry);
            ch.veg = true;
            var I = new Instancer();
            var cols = new List<WorldCollider>();
            var blocks = new List<Block>();
            foreach (var pr in t.props)
            {
                if (Math.Abs(pr.s - (s0 + 50)) > 260) continue;
                if (pr.type == "farm") blocks.Add(new Block { x = pr.x, z = pr.z, fx = pr.fx, fz = pr.fz, rx = pr.rx, rz = pr.rz, a = pr.w / 2 + 3, b = pr.dpt / 2 + 16 });
                else if (pr.col != null) blocks.Add(new Block { x = pr.col.x, z = pr.col.z, fx = Math.Cos(pr.col.yaw), fz = -Math.Sin(pr.col.yaw), rx = Math.Sin(pr.col.yaw), rz = Math.Cos(pr.col.yaw), a = pr.col.hx + 3, b = pr.col.hz + 3 });
            }
            bool Blocked(double x, double z)
            {
                foreach (var k in blocks)
                {
                    double dx = x - k.x, dz = z - k.z;
                    if (Math.Abs(dx * k.fx + dz * k.fz) < k.a && Math.Abs(dx * k.rx + dz * k.rz) < k.b) return true;
                }
                return false;
            }
            Spot SpotAt(double umin, double umax, double pow)
            {
                double s = s0 + R.Next() * CHUNK;
                int j = Math.Min(t.N - 1, Track.JsRoundI(s / Track.STEP));
                if (t.tunnel[j] != 0 || t.bridge[j] != 0) return null;
                int side = R.Next() < 0.5 ? 0 : 1;
                double u = umin + Math.Pow(R.Next(), pow) * (umax - umin);
                double d = (side != 0 ? 1 : -1) * (t.width[j] / 2 + Track.SHOULDER + u);
                bool inner = (t.k[j] > 0 && side == 0) || (t.k[j] < 0 && side != 0);
                if (inner && Math.Abs(d) > 0.8 / Math.Max(1e-4, Math.Abs(t.k[j]))) return null;
                double x = t.px[j] + t.rx[j] * d, z = t.pz[j] + t.rz[j] * d;
                if (blocks.Count > 0 && Blocked(x, z)) return null;
                t.Query(x, z, qr);
                return new Spot { s = s, j = j, side = side, u = u, x = x, z = z, h = qr.h, d = qr.d, halfW = qr.halfW, o = (j * 2 + side) * 5 };
            }
            string PickKind()
            {
                double r = R.Next() * wsum; int ki = 0;
                while (ki < kinds.Count - 1 && (r -= weights[ki]) > 0) ki++;
                return kinds.Count > 0 ? kinds[ki] : "pine";
            }
            var foliage = WorldMats.VC("foliage");
            PartSet ProcTree(string kind, int v)
            {
                bool aut = b.look.warmth > 0.3;
                return Parts.FromGeo($"ptree_{kind}_{v}_{snowy}_{aut}_{dryT}", () => PR.TreeGeometry(kind, v, snowy, aut, dryT), foliage);
            }
            // trees
            int nTrees = Track.JsRoundI((useAssets ? 170 : 140) * density);
            for (int n = 0; n < nTrees; n++)
            {
                var sp = SpotAt(3, 130, 1.5);
                if (sp == null || Math.Abs(sp.d) < sp.halfW + Track.SHOULDER + 4.2 || t.sw[sp.o + 4] > 0.3) continue;
                double slope = Math.Abs(t.Height(sp.x + 1.5, sp.z) - sp.h);
                if (slope > (useAssets ? 4.2 : 2.2)) continue;
                string kind = PickKind();
                int v = (int)Math.Floor(R.Next() * 3);
                double s2 = 0.75 + R.Next() * 0.55;
                var qy = G.Yaw(R.Next() * 6.28);
                var m4 = G.TRS(sp.x, sp.h - 0.25 - slope * 0.45, sp.z, qy, s2, s2 * (0.88 + R.Next() * 0.24), s2);
                if (useAssets)
                {
                    var nm = TreeNames(kind, v, b, tr, R);
                    var p0 = Parts.Get(nm[0]); var p1 = Parts.Get(nm[1]) ?? p0;
                    if (p0 != null) { I.Push(nm[0], p0, m4, castTrees && sp.u < 45, Instancer.NEAR); I.Push(nm[1], p1, m4, castTrees && sp.u < 30, Instancer.FAR); }
                }
                else I.Push("ptree" + kind + v, ProcTree(kind, v), m4, castTrees && sp.u < 40, Instancer.NEAR);
                if (sp.u < 80) cols.Add(new WorldCollider { t = "s", x = sp.x, y = sp.h + 0.8, z = sp.z, r = 0.28 * s2 + 0.12, s = sp.s });
            }
            yield return null;
            // rocks
            int nRocks = Track.JsRoundI(44 * (T(b.rocks) ? b.rocks : 0.5) * (quality == "low" ? 0.5 : 1));
            for (int n = 0; n < nRocks; n++)
            {
                var sp = SpotAt(1.5, 70, 2);
                if (sp == null || Math.Abs(sp.d) < sp.halfW + 1) continue;
                double size = (0.3 + Math.Pow(R.Next(), 3) * 3.2) * Math.Min(1, 0.25 + sp.u / 14);
                if (Math.Abs(t.Height(sp.x + 1.2, sp.z) - sp.h) > 1.6) continue;
                AddRock(I, sp.x, sp.h, sp.z, R, snowy, b, size, useAssets);
                if (sp.u < 40 && size > 0.7) cols.Add(new WorldCollider { t = "s", x = sp.x, y = sp.h + size * 0.3, z = sp.z, r = size * 0.75, s = sp.s });
            }
            yield return null;
            // groves
            void PlaceTree(double x, double z, double h, double s2, string kind, double uDist, double sAlong)
            {
                if (!useAssets) return;
                var nm = TreeNames(kind, (int)Math.Floor(R.Next() * 3), b, tr, R);
                var p0 = Parts.Get(nm[0]); var p1 = Parts.Get(nm[1]) ?? p0;
                if (p0 == null) return;
                var qy = G.Yaw(R.Next() * 6.28);
                var m4 = G.TRS(x, h - 0.3, z, qy, s2, s2 * (0.88 + R.Next() * 0.24), s2);
                if (uDist > 120) { I.Push(nm[1], p1, m4, false, Instancer.BG); return; }
                I.Push(nm[0], p0, m4, castTrees && uDist < 45, Instancer.NEAR); I.Push(nm[1], p1, m4, false, Instancer.FAR);
                if (uDist < 80) cols.Add(new WorldCollider { t = "s", x = x, y = h + 0.8, z = z, r = 0.28 * s2 + 0.12, s = sAlong });
            }
            if (kinds.Count > 0 && useAssets)
            {
                int nGroves = Track.JsRoundI((2 + density * 5) * (quality == "low" ? 0.5 : 1));
                for (int gI = 0; gI < nGroves; gI++)
                {
                    var c0 = SpotAt(10, 110, 1.2);
                    if (c0 == null || Math.Abs(c0.d) < c0.halfW + 8) continue;
                    string kind = PickKind();
                    int nT = 8 + (int)Math.Floor(R.Next() * 14);
                    double rad = 5 + R.Next() * 9;
                    for (int k = 0; k < nT; k++)
                    {
                        double a = R.Next() * 6.283, rr = Math.Sqrt(R.Next()) * rad;
                        double x = c0.x + Math.Cos(a) * rr, z = c0.z + Math.Sin(a) * rr;
                        if (blocks.Count > 0 && Blocked(x, z)) continue;
                        t.Query(x, z, qr);
                        if (Math.Abs(qr.d) < qr.halfW + Track.SHOULDER + 5) continue;
                        double qh = qr.h, qd = qr.d, qhw = qr.halfW, qs = qr.s;
                        if (Math.Abs(t.Height(x + 1.5, z) - qh) > 3.5) continue;
                        double sc = 0.7 + R.Next() * 0.6;
                        PlaceTree(x, z, qh, sc, R.Next() < 0.8 ? kind : PickKind(), Math.Abs(qd) - qhw, qs);
                    }
                }
                int nBg = Track.JsRoundI((60 + 160 * density) * (quality == "low" ? 0.4 : quality == "high" ? 1.2 : 0.85));
                for (int n = 0; n < nBg; n++)
                {
                    var sp = SpotAt(55, 136, 1.0);
                    if (sp == null || Math.Abs(sp.d) < sp.halfW + 50) continue;
                    if (t.noise.N2(sp.x * 0.012, sp.z * 0.012) < -0.15) continue;
                    double sc = 0.8 + R.Next() * 0.6;
                    PlaceTree(sp.x, sp.z, sp.h, sc, PickKind(), 200, sp.s);
                    if (sp.u < 80) cols.Add(new WorldCollider { t = "s", x = sp.x, y = sp.h + 0.8, z = sp.z, r = 0.4, s = sp.s });
                }
            }
            yield return null;
            // saplings: snap when hit
            if (useAssets)
            {
                int nSap = Track.JsRoundI(26 * density + 4);
                for (int n = 0; n < nSap; n++)
                {
                    var sp = SpotAt(0.6, 28, 1.4);
                    if (sp == null || Math.Abs(sp.d) < sp.halfW + Track.SHOULDER + 0.3 || t.sw[sp.o + 4] > 0.3) continue;
                    string kind = PickKind();
                    var nm = TreeNames(kind, (int)Math.Floor(R.Next() * 3), b, tr, R);
                    var p0 = Parts.Get(nm[0]);
                    if (p0 == null) continue;
                    double s2 = 0.26 + R.Next() * 0.24;
                    var qy = G.Yaw(R.Next() * 6.28);
                    var m4 = G.TRS(sp.x, sp.h - 0.1, sp.z, qy, s2, s2 * (0.9 + R.Next() * 0.3), s2);
                    var hs = I.Push(nm[0], p0, m4, false, Instancer.MID);
                    cols.Add(new WorldCollider { t = "s", x = sp.x, y = sp.h + 0.6, z = sp.z, r = 0.35, s = sp.s, brk = 0, slow = 0.035, dmg = 0.08, vis = new[] { hs }, kind = "sapling" });
                }
            }
            // bushes
            int nBush = Track.JsRoundI(36 * density + 6);
            for (int n = 0; n < nBush; n++)
            {
                var sp = SpotAt(1, 30, 1.3);
                if (sp == null || Math.Abs(sp.d) < sp.halfW + 1) continue;
                double s2 = 0.6 + R.Next() * 0.9;
                var qy = G.Yaw(R.Next() * 6.28);
                var m4 = G.TRS(sp.x, sp.h - 0.1, sp.z, qy, s2, s2 * 0.9, s2);
                if (useAssets)
                {
                    string leaf = dryT ? "dry" : b.look.warmth > 0.3 && R.Next() < 0.5 ? "autumn" : "oak";
                    string name = "bush" + (int)Math.Floor(R.Next() * 2) + "_" + leaf;
                    var hb = I.Push(name, Parts.Get(name), m4, false, Instancer.MID);
                    if (hb != null) cols.Add(new WorldCollider { t = "s", x = sp.x, y = sp.h + 0.4, z = sp.z, r = 0.55 * s2, s = sp.s, brk = 0, slow = 0.01, vis = new[] { hb }, kind = "bush" });
                }
                else
                {
                    int bv = (int)Math.Floor(R.Next() * 3);
                    I.Push("pbush" + bv, Parts.FromGeo($"pbush_{bv}_{snowy}_{dryT}", () => PR.BushGeometry(bv, snowy, dryT), foliage), m4, false, Instancer.NEAR);
                }
            }
            yield return null;
            // ground cover (not on snow, sparse on rock)
            if (useAssets && !snowy && quality != "low")
            {
                bool forest = (T(tr.density) ? tr.density : 0) > 0.7;
                int nCover = Track.JsRoundI((quality == "high" ? 300 : 190) * (b.id == "cliffs" || b.id == "rocky" ? 0.45 : 1) * (dryT ? 0.6 : 1));
                for (int n = 0; n < nCover; n++)
                {
                    var sp = SpotAt(0.3, 55, 1.9);
                    if (sp == null || Math.Abs(sp.d) < sp.halfW + Track.SHOULDER + 0.2) continue;
                    if (Math.Abs(t.Height(sp.x + 0.8, sp.z) - sp.h) > 2.2) continue;
                    string name = "grass" + (int)Math.Floor(R.Next() * 3);
                    if (forest && R.Next() < 0.35) name = "fern0";
                    else if ((b.id == "village" || b.id == "lower" || b.id == "mesa") && R.Next() < 0.25) name = "grass1";
                    var parts = Parts.Get(name);
                    if (parts == null) continue;
                    int nk = 2 + (int)Math.Floor(R.Next() * 4);
                    for (int c = 0; c < nk; c++)
                    {
                        double cx = sp.x + (R.Next() - 0.5) * 2.6, cz = sp.z + (R.Next() - 0.5) * 2.6;
                        t.Query(cx, cz, qr);
                        if (Math.Abs(qr.d) < qr.halfW + Track.SHOULDER) continue;
                        double s2 = (name == "fern0" ? 0.9 : 1.4) + R.Next() * 0.9;
                        var qy = G.Yaw(R.Next() * 6.28);
                        var m4 = G.TRS(cx, qr.h - 0.08, cz, qy, s2, s2 * (0.8 + R.Next() * 0.5), s2);
                        I.Push(name, parts, m4, false, Instancer.COVER);
                    }
                }
            }
            I.Flush(ch.layers, ref ch.bounds, ref ch.hasBounds);
            if (cols.Count > 0) AddColliders(ch.k, cols);
        }

        void AddRock(Instancer I, double x, double y, double z, Rng R, bool snowy, BiomeDef b, double size, bool useAssets)
        {
            int v = (int)Math.Floor(R.Next() * 6);
            double ex = R.Next() * 0.25, ey = R.Next() * 6.28, ez = R.Next() * 0.25;
            var qq = G.Euler(ex, ey, ez);
            if (useAssets)
            {
                string name = size > 2.4 && R.Next() < 0.5 ? "cliffrock" + (v % 2) : "rock" + v;
                var m4 = G.TRS(x, y - size * 0.12, z, qq, size * 0.55, size * (0.4 + R.Next() * 0.3), size * 0.55);
                I.Push(name, Parts.Get(name), m4, size > 1, Instancer.MID);
                return;
            }
            var mm = G.TRS(x, y - size * 0.15, z, qq, size, size * (0.7 + R.Next() * 0.5), size);
            int tint = b.look.rock;
            I.Push("prock" + v, Parts.FromGeo($"prock_{v}_{snowy}_{tint}", () => PR.RockGeometry(v, snowy, tint), WorldMats.VC("rock")), mm, size > 1, Instancer.NEAR);
        }

        void AddColliders(int k, List<WorldCollider> cols)
        {
            var ex = track.extraCol;
            if (!ex.TryGetValue(k, out var l)) ex[k] = l = new List<WorldCollider>();
            l.AddRange(cols);
        }

        // ------------------------------------------------------------------ signs
        void BuildSigns(Chunk ch)
        {
            var t = track;
            double s0 = ch.j0 * Track.STEP, s1 = ch.j1 * Track.STEP;
            foreach (var sg in t.signs)
            {
                if (sg.s < s0 || sg.s >= s1) continue;
                int j = Math.Min(t.N - 1, Track.JsRoundI(sg.s / Track.STEP));
                if (t.tunnel[j] != 0) continue;
                double d = sg.side * (t.width[j] / 2 + (sg.outer ? 1.2 : 1.8));
                var p = t.PosAt(sg.s, d);
                PR.BuildSign(ch.mg, G.V(p.x, Math.Max(p.y, t.py[j] - 0.3) - 0.05, p.z), t.hd[j] + Math.PI, sg.type, sg.text, sg.km, sg.broken && sg.type != "region");
            }
        }

        // ------------------------------------------------------------------ props
        static readonly Dictionary<string, Bounds> boxCache = new Dictionary<string, Bounds>();

        // Fit a building's collision box (track collider) to the model's real footprint (game space).
        static void FitBox(WorldCollider col, string name, PartSet ps, double px, double py, double pz, double yaw, double scl)
        {
            if (!boxCache.TryGetValue(name, out var bu)) boxCache[name] = bu = ps.bounds;
            double minX = -bu.max.x, maxX = -bu.min.x, minY = bu.min.y, maxY = bu.max.y, minZ = bu.min.z, maxZ = bu.max.z;
            double c = Math.Cos(yaw), sn = Math.Sin(yaw);
            double cx = (minX + maxX) / 2 * scl, cz = (minZ + maxZ) / 2 * scl;
            col.x = px + cx * c + cz * sn;
            col.z = pz - cx * sn + cz * c;
            col.hy = (maxY - minY) / 2 * scl;
            col.y = py + (minY + maxY) / 2 * scl;
            col.hx = (maxZ - minZ) / 2 * scl * 0.96;
            col.hz = (maxX - minX) / 2 * scl * 0.96;
        }

        static Material hay, gantrySteel, wireMat;
        static Mesh barrelMesh;

        void BuildProps(Chunk ch, Rng R)
        {
            var t = track;
            double s0 = ch.j0 * Track.STEP, s1 = ch.j1 * Track.STEP;
            var I = new Instancer();
            var poleTops = new List<double[]>();
            var poleParts = Parts.Get("pole0"); var fenceParts = Parts.Get("fence0"); var logParts = Parts.Get("logpile0");
            var foliage = WorldMats.VC("foliage");
            var fenceCols = new List<WorldCollider>();
            const int GRP = Instancer.GROUP;
            foreach (var pr in t.props)
            {
                if (pr.s < s0 || pr.s >= s1) continue;
                string ty = pr.type;
                if (ty == "house" || ty == "barn" || ty == "chapel" || ty == "shack" || ty == "gasstation")
                {
                    string name = ty == "house" ? "chalet" + (pr.seed % 4) : ty + "0";
                    var hp = Parts.Get(name);
                    if (hp != null)
                    {
                        double yaw = pr.yaw - Math.PI / 2;
                        double scl = ty == "house" || ty == "barn" || ty == "chapel" ? pr.size : 1;
                        I.Push(name, hp, G.TRS(pr.x, pr.y - 0.05, pr.z, G.Yaw(yaw), scl, scl, scl), true, GRP);
                        if (pr.col != null) FitBox(pr.col, name, hp, pr.x, pr.y - 0.05, pr.z, yaw, scl);
                    }
                    else
                    {
                        double scl = ty != "shack" && ty != "gasstation" ? pr.size : 1;
                        var M = G.TRS(pr.x, pr.y, pr.z, G.Yaw(pr.yaw), scl, scl, scl);
                        if (ty == "shack") PR.BuildShack(ch.mg, M, pr.seed);
                        else if (ty == "gasstation") PR.BuildGasStation(ch.mg, M, pr.seed);
                        else PR.BuildHouse(ch.mg, M, pr.seed, ty);
                    }
                }
                else if (ty == "pole")
                {
                    double rx = Math.Cos(pr.yaw), rz = -Math.Sin(pr.yaw);
                    if (poleParts != null)
                    {
                        I.Push("pole0", poleParts, G.TRS(pr.x, pr.y - 0.2, pr.z, G.Yaw(pr.yaw + Math.PI / 2)), true, GRP);
                        poleTops.Add(new[] { pr.x, pr.y - 0.2 + 7.85, pr.z, rx, rz });
                    }
                    else
                    {
                        I.Push("ppole", Parts.FromGeo("ppole", PR.PoleGeometry, foliage), G.TRS(pr.x, pr.y - 0.2, pr.z, G.Yaw(pr.yaw)), true, GRP);
                        poleTops.Add(new[] { pr.x, pr.y + 7.45, pr.z, rx, rz });
                    }
                }
                else if (ty == "snowpole")
                {
                    I.Push("psnowpole", Parts.FromGeo("psnowpole", PR.SnowPoleGeometry, foliage, false), G.TRS(pr.x, pr.y - 0.1, pr.z, Quaternion.identity), false, GRP);
                }
                else if (ty == "fence" && fenceParts != null)
                {
                    for (double u = 0; u + 2.6 <= pr.len + 0.5; u += 2.6)
                    {
                        var a = t.PosAt(pr.s + u, pr.d); var bq = t.PosAt(pr.s + u + 2.6, pr.d);
                        double yaw = Math.Atan2(-(bq.z - a.z), bq.x - a.x);
                        var h = I.Push("fence0", fenceParts, G.TRS(a.x, Math.Min(a.y, bq.y) - 0.08, a.z, G.Yaw(yaw)), true, GRP);
                        fenceCols.Add(new WorldCollider { t = "b", x = (a.x + bq.x) / 2, y = a.y + 0.55, z = (a.z + bq.z) / 2, hx = 1.3, hy = 0.6, hz = 0.1, yaw = yaw, s = pr.s + u, brk = 0, slow = 0.015, vis = new[] { h }, kind = "fence" });
                    }
                }
                else if (ty == "fence")
                {
                    var post = Parts.FromGeo("pfencepost", PR.FencePostGeometry, foliage);
                    for (double u = 0; u < pr.len; u += 2.5)
                    {
                        var pp = t.PosAt(pr.s + u, pr.d);
                        I.Push("pfencepost", post, G.TRS(pp.x, pp.y - 0.1, pp.z, G.Yaw(pp.hd)), true, GRP);
                    }
                    var rails = new List<Geo>();
                    foreach (double y in new[] { 0.5, 0.95 })
                    {
                        var pts = new List<double[]>();
                        for (double u = 0; u <= pr.len; u += 2.5) { var pp = t.PosAt(pr.s + u, pr.d); pts.Add(new[] { pp.x, pp.y - 0.1 + y, pp.z }); }
                        for (int i = 0; i < pts.Count - 1; i++) rails.Add(PR.BeamGeo(pts[i], pts[i + 1], 0.035));
                    }
                    if (rails.Count > 0) ch.mg.Add(Geo.Merge(rails), WorldMats.Get("post"));
                }
                else if (ty == "logs" && logParts != null)
                {
                    I.Push("logpile0", logParts, G.TRS(pr.x, pr.y - 0.1, pr.z, G.Yaw(pr.yaw)), true, GRP);
                }
                else if (ty == "logs")
                {
                    I.Push("plogs", Parts.FromGeo("plogs", PR.LogsGeometry, foliage), G.TRS(pr.x, pr.y - 0.1, pr.z, G.Yaw(pr.yaw)), true, GRP);
                }
                else if (ty == "farm" && fenceParts != null)
                {
                    double fx = pr.fx, fz = pr.fz, rx = pr.rx, rz = pr.rz, w = pr.w, dpt = pr.dpt;
                    Vector3 P(double a2, double b2) { double x = pr.x + fx * a2 + rx * b2, z = pr.z + fz * a2 + rz * b2; return G.V(x, t.Height(x, z), z); }
                    double[][] edges = { new[] { -w / 2, -dpt / 2, w / 2, -dpt / 2 }, new[] { w / 2, -dpt / 2, w / 2, dpt / 2 }, new[] { w / 2, dpt / 2, -w / 2, dpt / 2 }, new[] { -w / 2, dpt / 2, -w / 2, -dpt / 2 } };
                    foreach (var e in edges)
                    {
                        double len = Track.JsHypot(e[2] - e[0], e[3] - e[1]);
                        int n = Math.Max(1, Track.JsRoundI(len / 2.6));
                        for (int k = 0; k < n; k++)
                        {
                            if (k == n / 2 && e[1] == -pr.dpt / 2 && e[0] < 0) continue; // a gate gap facing the road
                            var a = P(Lerp(e[0], e[2], (double)k / n), Lerp(e[1], e[3], (double)k / n));
                            var bq = P(Lerp(e[0], e[2], (double)(k + 1) / n), Lerp(e[1], e[3], (double)(k + 1) / n));
                            double yaw = Math.Atan2(-(bq.z - a.z), bq.x - a.x);
                            double sl = Track.JsHypot(bq.x - a.x, bq.z - a.z) / 2.6;
                            var h = I.Push("fence0", fenceParts, G.TRS(a.x, Math.Min(a.y, bq.y) - 0.08, a.z, G.Yaw(yaw), sl, 1, 1), true, GRP);
                            fenceCols.Add(new WorldCollider { t = "b", x = (a.x + bq.x) / 2, y = a.y + 0.55, z = (a.z + bq.z) / 2, hx = 1.3 * sl, hy = 0.6, hz = 0.1, yaw = yaw, s = pr.s + Lerp(e[0], e[2], (double)k / n), brk = 0, slow = 0.015, vis = new[] { h }, kind = "fence" });
                        }
                    }
                    if (!hay) hay = WorldMats.Color("hay", 0xc8a356, 1f);
                    for (int k = 0; k < 4; k++)
                    {
                        var c = P(-w * 0.5 + 2 + k * 1.7, pr.dpt / 2 + 3.5);
                        var M = Matrix4x4.TRS(c + new Vector3(0, 0.7f, 0), G.Euler(0, Math.Atan2(fx, fz), Math.PI / 2), Vector3.one);
                        ch.mg.Add(Geo.Cylinder(0.75, 0.75, 1.2, 14), hay, M);
                    }
                    if (logParts != null) { var c = P(w * 0.5 - 3, pr.dpt / 2 + 4); I.Push("logpile0", logParts, G.TRS(c.x, c.y - 0.1, c.z, G.Yaw(pr.hd)), true, GRP); }
                }
                else if (ty == "waterfall") BuildWaterfall(ch, pr);
                else if (ty == "finish") BuildFinish(ch, pr);
                else if (ty == "gantry") BuildGantry(ch, pr);
                else if (ty == "grandstand") I.Push("stand", CIR.GrandstandParts(), G.TRS(pr.x, pr.y, pr.z, G.Yaw(pr.yaw)), true, GRP);
                else if (ty == "tyres")
                {
                    for (int k = -1; k <= 1; k++)
                    {
                        double fx = Math.Sin(pr.yaw), fz = Math.Cos(pr.yaw);
                        I.Push("tyres", CIR.TyreParts(), G.TRS(pr.x + fx * k * 0.85, pr.y - 0.05, pr.z + fz * k * 0.85, G.Yaw(k)), true, GRP);
                    }
                }
                else if (ty == "block")
                    I.Push("block", CIR.BlockParts(), G.TRS(pr.x, pr.y, pr.z, G.Yaw(pr.yaw), pr.dep, pr.h, pr.w), true, GRP);
            }
            // wires between consecutive poles
            if (poleTops.Count > 1)
            {
                var pts = new List<Vector3>();
                for (int i = 0; i < poleTops.Count - 1; i++)
                {
                    var A = poleTops[i]; var B = poleTops[i + 1];
                    if (Track.JsHypot(A[0] - B[0], A[2] - B[2]) > 60) continue;
                    foreach (double off in new[] { -0.8, 0, 0.8 })
                    {
                        Vector3 prev = default; bool has = false;
                        for (int k = 0; k <= 8; k++)
                        {
                            double f = k / 8.0;
                            double x = Lerp(A[0] + A[3] * off, B[0] + B[3] * off, f), z = Lerp(A[2] + A[4] * off, B[2] + B[4] * off, f);
                            double y = Lerp(A[1], B[1], f) + 0.1 - Math.Sin(f * Math.PI) * 0.9;
                            var cur = Coord.ToUnity(x, y, z);
                            if (has) { pts.Add(prev); pts.Add(cur); }
                            prev = cur; has = true;
                        }
                    }
                }
                if (pts.Count > 0)
                {
                    var lm = new Mesh { name = "wires" };
                    if (pts.Count > 65535) lm.indexFormat = IndexFormat.UInt32;
                    lm.SetVertices(pts);
                    var ix = new int[pts.Count]; for (int i = 0; i < ix.Length; i++) ix[i] = i;
                    var uvs = new Vector2[pts.Count]; for (int i = 0; i < uvs.Length; i++) uvs[i] = new Vector2(0.5f, 0.5f);
                    var cs = new Color[pts.Count]; for (int i = 0; i < cs.Length; i++) cs[i] = new Color(0.1f, 0.1f, 0.1f, 0.7f);
                    lm.uv = uvs; lm.colors = cs;
                    lm.SetIndices(ix, MeshTopology.Lines, 0);
                    lm.RecalculateBounds();
                    if (!wireMat) wireMat = WorldMats.Unlit("wire", new Color(0.102f, 0.102f, 0.102f, 0.7f), false);
                    AddMesh(ch, lm, wireMat, false, false, "wires");
                }
            }
            // red and white kerbs through the corners of the circuits
            bool dress = false;
            if (t.loop) foreach (var bb in t.m.biomes) if (T(bb.circuitDress) || bb.Has("grandstands") || bb.Has("city")) dress = true;
            if (dress)
            {
                var kr = CIR.KerbParts(true); var kw = CIR.KerbParts(false);
                for (int j = ch.j0; j < ch.j1; j++)
                {
                    if (Math.Abs(t.k[j]) < 1.0 / 160) continue;
                    for (double s2 = j * Track.STEP; s2 < (j + 1) * Track.STEP; s2 += 1.6)
                        foreach (int sd in new[] { -1, 1 })
                        {
                            double d = sd * (t.width[j] / 2 + 0.45);
                            var a = t.PosAt(s2 + 0.8, d);
                            bool red = ((long)Math.Floor(s2 / 1.6) % 2) != 0;
                            I.Push(red ? "kerbR" : "kerbW", red ? kr : kw, G.TRS(a.x, a.y + 0.02, a.z, G.Yaw(a.hd)), true, GRP);
                        }
                }
            }
            I.Flush(ch.layers, ref ch.bounds, ref ch.hasBounds);
            if (fenceCols.Count > 0) AddColliders(ch.k, fenceCols);
        }

        void BuildWaterfall(Chunk ch, TrackProp pr)
        {
            var t = track;
            var bse = t.PosAt(pr.s, pr.d);
            double hd = t.PosAt(pr.s, 0).hd;
            double top = bse.y + 40, w = 7;
            var mat = new Material(WorldMats.Get("water")) { name = "waterfall" };
            mat.SetTextureScale("_BaseMap", new Vector2(1, 3)); mat.SetTextureScale("_MainTex", new Vector2(1, 3));
            ch.ownedMats.Add(mat);
            var pos = G.V(bse.x + Math.Cos(hd) * pr.side * 6, (bse.y + top) / 2 + 5, bse.z - Math.Sin(hd) * pr.side * 6);
            ch.mg.Add(Geo.Plane(w, top - bse.y + 30, 1, 8), mat, Matrix4x4.TRS(pos, G.Yaw(hd + (pr.side > 0 ? -Math.PI / 2 : Math.PI / 2)), Vector3.one), false, true);
            ch.mg.Add(Geo.Circle(6, 16), WorldMats.Get("stream"), Matrix4x4.TRS(new Vector3(pos.x, (float)(bse.y + 0.2), pos.z), G.Euler(-Math.PI / 2, 0, 0), Vector3.one), false, true);
            animated.Add(new Animated { chunk = ch.k, mat = mat, pos = new Vector3(pos.x, (float)(bse.y + 1), pos.z) });
        }

        static string BannerMat(string text) => "banner_" + Regex.Replace(text ?? "FINISH", "[^A-Za-z0-9]+", "_").Trim('_');
        static Material Banner(string text)
        {
            string n = BannerMat(text);
            return MatDefs.Find(n) != null ? WorldMats.Get(n) : WorldMats.Get("banner_FINISH");
        }

        void BuildFinish(Chunk ch, TrackProp pr)
        {
            var M = G.TRS(pr.x, pr.y, pr.z, G.Yaw(pr.yaw));
            var wd = WorldMats.Get("woodDark");
            ch.mg.Add(Geo.Box(0.6, 6.5, 0.6).Translate(-7, 3.2, 0), wd, M);
            ch.mg.Add(Geo.Box(0.6, 6.5, 0.6).Translate(7, 3.2, 0), wd, M);
            var bm = Banner("BOTTOM OF THE MOUNTAIN");
            ch.mg.Add(Geo.Plane(13, 1.6).RotateY(Math.PI).Translate(0, 5.6, 0), bm, M);
            ch.mg.Add(Geo.Plane(13, 1.6).Translate(0, 5.6, 0), bm, M);
        }

        // start / finish gantry over the grid, with a chequered line on the road
        void BuildGantry(Chunk ch, TrackProp pr)
        {
            var M = G.TRS(pr.x, pr.y, pr.z, G.Yaw(pr.yaw));
            double W = pr.w + 3;
            if (!gantrySteel) gantrySteel = WorldMats.Color("gantry", 0x3a3e44, 0.45f, 0.7f);
            foreach (int sd in new[] { -1, 1 }) ch.mg.Add(Geo.Box(0.7, 7.2, 0.7).Translate(sd * W / 2, 3.6, 0), gantrySteel, M);
            ch.mg.Add(Geo.Box(W + 0.7, 1.9, 0.9).Translate(0, 6.6, 0), gantrySteel, M);
            var bm = Banner(pr.text ?? "FINISH");
            ch.mg.Add(Geo.Plane(W - 1, 1.5).Translate(0, 6.6, 0.46), bm, M);
            ch.mg.Add(Geo.Plane(W - 1, 1.5).RotateY(Math.PI).Translate(0, 6.6, -0.46), bm, M);
            var lamp = WorldMats.Get("startLamp");
            for (int k = 0; k < 5; k++) ch.mg.Add(Geo.Cylinder(0.22, 0.22, 0.12, 12).RotateX(Math.PI / 2).Translate((k - 2) * 0.7, 5.25, -0.4), lamp, M);
            ch.mg.Add(Geo.Plane(pr.w, 1.0).RotateX(-Math.PI / 2).Translate(0, 0.04, 0), WorldMats.Get("checkerLine"), M, false, true);
        }

        // ------------------------------------------------------------------ obstacles
        static readonly string[] WRECKS = { "rusty", "brick", "dusty", "diplomat", "sparrow", "nomad" };

        void BuildObstacles(Chunk ch, Rng R)
        {
            var t = track;
            double s0 = ch.j0 * Track.STEP, s1 = ch.j1 * Track.STEP;
            foreach (var o in t.obstacles)
            {
                if (o.s < s0 || o.s >= s1) continue;
                if (o.type == "rock")
                {
                    string name = "rock" + ((long)Math.Floor(o.s) % 6);
                    var go = Mats.Spawn(name, ch.go.transform);
                    if (go)
                    {
                        go.transform.position = Coord.ToUnity(o.x, o.y - o.r * 0.15, o.z);
                        go.transform.localScale = new Vector3((float)(o.r * 0.6), (float)(o.r * 0.5), (float)(o.r * 0.55));
                        go.transform.rotation = Coord.Yaw(o.s);
                        foreach (var r in go.GetComponentsInChildren<MeshRenderer>()) r.sharedMaterials = Array.ConvertAll(r.sharedMaterials, WorldMats.Foliage);
                    }
                    else
                    {
                        var g = PR.RockGeometry((int)((long)Math.Floor(o.s) % 6), false, t.Biome(o.s).look.rock).Clone();
                        ch.mg.Add(g, WorldMats.VC("rock"), G.TRS(o.x, o.y - o.r * 0.1, o.z, G.Yaw(o.s), o.r * 1.05, o.r * 0.9, o.r));
                    }
                }
                else if (o.type == "tree")
                {
                    var g = PR.FallenTreeGeometry(o.len + 1.5, o.r);
                    var root = t.PosAt(o.s, o.d + o.side * 0.8);
                    var tip = o.colliders[o.colliders.Count - 1];
                    double yaw = Math.Atan2(-(tip.z - root.z), tip.x - root.x);
                    ch.mg.Add(g, WorldMats.VC("foliage"), G.TRS(root.x, root.y - 0.05, root.z, G.Yaw(yaw)), true, true);
                }
                else if (o.type == "car")
                {
                    GameObject go = wreckFactory?.Invoke(o);
                    if (!go)
                    {
                        string id = WRECKS[(int)((long)Math.Floor(o.s) % WRECKS.Length)];
                        var pf = Mats.Car(id);
                        if (pf) go = UnityEngine.Object.Instantiate(pf);
                        else
                        {
                            go = new GameObject("wreck");
                            var mgc = new MeshGroup();
                            mgc.Add(Geo.Box(1.7, 1.3, 4.0).Translate(0, 0.75, 0), WorldMats.Get("rusty"));
                            mgc.Build(go.transform, "body", ch.meshes);
                        }
                        double tilt = ((long)Math.Floor(o.s) % 3) == 0 ? -0.08 : 0;
                        go.transform.position = Coord.ToUnity(o.x, o.y - 0.08, o.z);
                        go.transform.rotation = Coord.ToUnity(G.Euler(0, o.yaw, tilt));
                    }
                    go.transform.SetParent(ch.go.transform, true);
                    ch.cars.Add(go);
                }
                else if (o.type == "barrier")
                {
                    var c = o.colliders[0];
                    ch.mg.Add(PR.BarrierGeometry().Clone(), WorldMats.Get("concrete"), G.TRS(o.x, o.y - 0.02, o.z, G.Yaw(c.yaw)), true, true);
                }
                else if (o.type == "barrel")
                {
                    if (!barrelMesh) barrelMesh = PR.BarrelGeometry().ToMesh("barrel");
                    var go = new GameObject("barrel");
                    go.transform.SetParent(ch.go.transform, false);
                    go.transform.position = Coord.ToUnity(o.x, o.y, o.z);
                    go.AddComponent<MeshFilter>().sharedMesh = barrelMesh;
                    var r = go.AddComponent<MeshRenderer>();
                    r.sharedMaterial = WorldMats.VC("foliage");
                    r.shadowCastingMode = ShadowCastingMode.On;
                    o.colliders[0].mesh = go;
                }
            }
        }

        // ------------------------------------------------------------------ per frame
        /// <summary>world.js update2: wind/snow uniforms, LOD switching by chunk distance, animated water,
        /// then draws every instanced batch. cam: game-space camera position. camera: for frustum culling (optional).</summary>
        public void Update2(float dt, Vector3 cam, EnvLook look, Camera camera = null)
        {
            time += dt;
            WorldMats.time += dt;
            if (look != null)
            {
                WorldMats.wind += ((float)look.wind - WorldMats.wind) * Math.Min(1, dt);
                WorldMats.snow += ((float)look.snow - WorldMats.snow) * Math.Min(1, dt);
            }
            WorldMats.PushGlobals();
            double nearR = quality == "high" ? 120 : quality == "low" ? 55 : 85;
            double midR = quality == "low" ? 260 : 380;
            double coverR = quality == "high" ? 170 : 120;
            double farR = quality == "high" ? 1400 : quality == "low" ? 600 : 950;
            foreach (var ch in chunks.Values)
            {
                if (!ch.veg) continue;
                double d = Track.JsHypot(ch.cx - cam.x, ch.cz - cam.z) - 50;
                bool isNear = d < nearR;
                ch.vis[Instancer.NEAR] = isNear; ch.vis[Instancer.FAR] = !isNear && d < farR; ch.vis[Instancer.MID] = d < midR; ch.vis[Instancer.COVER] = d < coverR;
            }
            foreach (var a in animated)
            {
                var off = new Vector2(0, (float)(-time * 0.9));
                a.mat.SetTextureOffset("_BaseMap", off);
                if (a.mat.HasProperty("_MainTex")) a.mat.SetTextureOffset("_MainTex", off);
            }
            Draw(camera, cam);
        }

        /// <summary>Issues the instanced draws (called by Update2; call it yourself every frame if you don't use Update2).</summary>
        public void Draw(Camera camera, Vector3 camGame)
        {
            bool cull = camera != null;
            if (cull) GeometryUtility.CalculateFrustumPlanes(camera, planes);
            foreach (var ch in chunks.Values)
            {
                if (!ch.hasBounds) continue;
                if (cull)
                {
                    var bb = ch.bounds; bb.Expand(new Vector3(30, 60, 30));
                    bool near = Track.JsHypot(ch.cx - camGame.x, ch.cz - camGame.z) < 150; // shadow casters just out of view
                    if (!near && !GeometryUtility.TestPlanesAABB(planes, bb)) continue;
                }
                for (int l = 0; l < Instancer.LAYERS; l++)
                {
                    if (!ch.vis[l]) continue;
                    var list = ch.layers[l];
                    for (int i = 0; i < list.Count; i++) list[i].Draw(renderLayer);
                }
            }
        }

        // ------------------------------------------------------------------ breakables
        static readonly Matrix4x4 ZERO_M4 = Matrix4x4.Scale(Vector3.zero);

        /// <summary>Put everything that was knocked over back (new run).</summary>
        public void ResetBreakables()
        {
            foreach (var sm in smashed)
            {
                sm.o.dead = false;
                foreach (var sv in sm.saved) sv.b.arr[sv.i / 1023][sv.i % 1023] = sv.m;
            }
            smashed.Clear();
        }

        /// <summary>A breakable thing was hit: hides its instances and returns loose debris objects
        /// (Unity space, to hand to FX Debris).</summary>
        public List<GameObject> Smash(WorldCollider o)
        {
            var outList = new List<GameObject>();
            var sm = new Smashed { o = o };
            smashed.Add(sm);
            if (!(o.vis is InstHandle[] vis)) return outList;
            for (int k = 0; k < vis.Length; k++)
            {
                var h = vis[k];
                if (h == null || h.e == null) continue;
                foreach (var b in h.e.batches)
                {
                    ref var slot = ref b.arr[h.i / 1023][h.i % 1023];
                    sm.saved.Add(new Saved { b = b, i = h.i, m = slot });
                    slot = ZERO_M4;
                }
                if (k > 0) continue;
                outList.Add(Parts.Instantiate(h.e.list, h.e.mats[h.i], rootT));
            }
            return outList;
        }

        /// <summary>Distance (m) from a game-space position to the nearest waterfall (streams count 1.5x).</summary>
        public double NearestWaterfall(Vector3 pos)
        {
            double best = 1e9;
            foreach (var a in animated) best = Math.Min(best, Vector3.Distance(a.pos, pos));
            foreach (var ch in chunks.Values) if (ch.hasStream) best = Math.Min(best, Vector3.Distance(ch.stream, pos) * 1.5);
            return best;
        }

        public int LoadedChunks => chunks.Count;
        public bool Building => job != null;
    }
}

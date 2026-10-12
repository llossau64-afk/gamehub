// The mountain road: a single deterministic centreline sampled every STEP metres,
// plus everything that lives along it (surfaces, rails, hazards, pickups, shortcuts,
// tunnels, bridges, props). The terrain is defined *relative* to the road so the
// physics and the visible meshes share exactly one height function: `Query()`.
//
// Port of track.js. Constants live on Track (Track.STEP, Track.SHOULDER, Track.SURF_INFO,
// Track.RAIL_BREAK); surface and rail ids are the static classes SURF and RAIL (TrackTypes.cs).
// The JS typed arrays are F32Array / U8Array so stores round exactly like Float32Array:
// generation is bit-identical to the web build for the same seed.
//
// World builder: iterate `props` (TrackProp, by type), `obstacles` (each with its own
// colliders, the drawn ones), `pickups`, `signs`, `decals`, `potholes`, `tunnels`/`bridges`
// (sample ranges a..b), `farms`. Physics uses `colliders` (copies of the obstacle colliders
// with s/ref set, plus building/grandstand/tyre/block boxes) through CollidersNear(s).
using System;
using System.Collections.Generic;

namespace Downfall
{
    public sealed class Track
    {
        public const double STEP = 2;
        public const double SHOULDER = 1.0;

        public static readonly SurfInfo[] SURF_INFO =
        {
            new SurfInfo { name = "ASPHALT", mu = 1.0, roll = 1.0, group = 0, dust = 0, rough = 0.02 },
            new SurfInfo { name = "BROKEN ASPHALT", mu = 0.93, roll = 1.25, group = 0, dust = 0.15, rough = 0.12 },
            new SurfInfo { name = "GRAVEL", mu = 0.72, roll = 2.0, group = 1, dust = 0.85, rough = 0.25 },
            new SurfInfo { name = "DIRT", mu = 0.75, roll = 2.3, group = 1, dust = 1.0, rough = 0.3 },
            new SurfInfo { name = "MUD", mu = 0.47, roll = 6.5, group = 2, dust = 0, splash = 1, rough = 0.15 },
            new SurfInfo { name = "SNOW", mu = 0.52, roll = 2.4, group = 3, dust = 0.7, snow = 1, rough = 0.08 },
            new SurfInfo { name = "ICE", mu = 0.2, roll = 0.9, group = 3, dust = 0.1, snow = 1, rough = 0 },
            new SurfInfo { name = "GRASS", mu = 0.62, roll = 3.2, group = 1, dust = 0.3, rough = 0.3 },
            new SurfInfo { name = "ROCK", mu = 0.8, roll = 1.6, group = 1, dust = 0.4, rough = 0.5 },
            new SurfInfo { name = "WATER", mu = 0.68, roll = 5.0, group = 0, splash = 1, rough = 0.05 },
            new SurfInfo { name = "SAND", mu = 0.56, roll = 5.0, group = 1, dust = 1.0, rough = 0.2 },
            new SurfInfo { name = "CONCRETE", mu = 1.02, roll = 1.0, group = 0, dust = 0, rough = 0.03 },
        };

        public static readonly double[] RAIL_BREAK = { 0, 21, 15, 999 }; // impact speed (m/s) needed to break a rail section

        const int COARSE = 8; // coarse sample stride for spatial queries
        const double CELL = 80;
        static long Key(long cx, long cz) => (cx + 4096) * 8192 + (cz + 4096);

        // ---- JS number helpers
        // Math.round: nearest, ties towards +infinity
        public static double JsRound(double x) { double f = Math.Floor(x); return x - f >= 0.5 ? f + 1 : f; }
        public static int JsRoundI(double x) => (int)JsRound(x);
        // V8's Math.hypot (normalised, Kahan summed): not the same bits as sqrt(x*x + y*y)
        public static double JsHypot(double a, double b)
        {
            if (double.IsInfinity(a) || double.IsInfinity(b)) return double.PositiveInfinity;
            if (double.IsNaN(a) || double.IsNaN(b)) return double.NaN;
            a = Math.Abs(a); b = Math.Abs(b);
            double max = a > b ? a : b;
            if (max == 0) return 0;
            double sum = 0, comp = 0;
            double n = a / max, summand = n * n - comp, pre = sum + summand;
            comp = (pre - sum) - summand; sum = pre;
            n = b / max; summand = n * n - comp; pre = sum + summand;
            sum = pre;
            return Math.Sqrt(sum) * max;
        }
        // JS truthiness for numbers that may be "undefined" (NaN)
        public static bool Truthy(double v) => v != 0 && !double.IsNaN(v);
        static double Or0(double v) => Truthy(v) ? v : 0;
        static double JsSign(double v) => v > 0 ? 1 : v < 0 ? -1 : v;

        // ---- public state (JS field names)
        public MountainDef m;
        public bool loop;
        public double seed;
        public Noise noise;
        public Rng rand;
        public double length, total;
        public int N;
        public double baseH;

        public F32Array k, px, pz, hd, py, width, grade, rx, rz;
        public U8Array isHairpin;
        public F32Array sw, slW, slD, cutSl;   // per side weights: [wall, drop, flat, cut, void] and slopes
        public U8Array offSurf, surf, rail, railBroken, tunnel, bridge;

        public List<TrackSpan> tunnels, bridges;
        public List<TrackJump> jumps;
        public List<TrackShortcut> shortcuts;
        public List<TrackRailGap> railGaps;
        public List<TrackDecal> decals;
        public List<TrackPothole> potholes;
        public List<TrackObstacle> obstacles;
        public List<TrackRockfall> rockfalls;
        public List<TrackPickup> pickups;
        public List<TrackSign> signs;
        public List<TrackProp> props;
        public List<TrackProp> farms;
        public List<WorldCollider> colliders;

        public Dictionary<int, List<TrackPothole>> potB;
        public Dictionary<int, List<TrackDecal>> decalB;
        public Dictionary<int, List<WorldCollider>> colB;
        // per chunk colliders the world adds (trees, rocks, fences near the road), keyed floor(s / 100)
        public Dictionary<int, List<WorldCollider>> extraCol;

        public Dictionary<long, List<int>> cells;
        Dictionary<long, List<int>> _grid50; // dense spatial index used by the wall-side analysis
        TrackQuery _out, _bf;
        readonly int[] _legI = new int[6];
        readonly double[] _legD = new double[6];

        static readonly List<WorldCollider> EMPTY = new List<WorldCollider>();

        public Track(MountainDef mountain)
        {
            m = mountain;
            loop = mountain.circuit != null;
            if (loop)
            {
                seed = mountain.seed;
                noise = new Noise(seed * 7 + 3);
                Generate();
                return;
            }
            length = mountain.length;
            total = mountain.length + 700;
            N = (int)Math.Ceiling(total / STEP) + 1;
            // a few seeds may produce a road that crosses itself; walk forward deterministically
            for (int kk = 0; kk < 12; kk++)
            {
                seed = mountain.seed + kk * 101;
                noise = new Noise(seed * 7 + 3);
                Generate();
                if (MinSeparation() > 34) break;
            }
        }

        public double MinSeparation()
        {
            double min = 1e9;
            for (int i = 0; i < N; i += 3)
            {
                long cx = (long)Math.Floor(px[i] / CELL), cz = (long)Math.Floor(pz[i] / CELL);
                for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++)
                {
                    if (!cells.TryGetValue(Key(cx + dx, cz + dz), out var a)) continue;
                    foreach (int q0 in a) for (int q = q0; q < Math.Min(N, q0 + COARSE); q += 2)
                    {
                        if (Math.Abs(q - i) < 150) continue;
                        double d = JsHypot(px[q] - px[i], pz[q] - pz[i]);
                        if (d < min) min = d;
                    }
                }
            }
            return min;
        }

        // ---------------------------------------------------------------- biomes
        public int BiomeIndex(double s)
        {
            var b = m.biomes;
            for (int i = 0; i < b.Length; i++) if (s < b[i].end) return i;
            return b.Length - 1;
        }
        public BiomeDef Biome(double s) => m.biomes[BiomeIndex(s)];
        // (indexA, indexB, t) for smooth blending of numeric biome params.
        public (int a, int b, double t) BiomeBlend(double s)
        {
            var b = m.biomes;
            int i = BiomeIndex(s);
            double half = Mountains.BLEND / 2;
            if (i < b.Length - 1 && s > b[i].end - half) return (i, i + 1, U.Smoothstep(b[i].end - half, b[i].end + half, s));
            if (i > 0 && s < b[i].start + half) return (i - 1, i, U.Smoothstep(b[i].start - half, b[i].start + half, s));
            return (i, i, 0);
        }
        public double BiomeNum(double s, Func<BiomeDef, double> getter)
        {
            var (a, c, t) = BiomeBlend(s);
            var b = m.biomes;
            return t == 0 ? getter(b[a]) : U.Lerp(getter(b[a]), getter(b[c]), t);
        }

        // -------------------------------------------------------------- generation
        public void Generate()
        {
            if (loop)
            {
                var LR = new Rng(seed);
                rand = LR;
                var lgrid = PlanLoop(LR);
                FinishGenerate(LR, lgrid);
                return;
            }
            int N = this.N;
            var R = new Rng(seed);
            rand = R;
            var k = this.k = new F32Array(N);
            var px = this.px = new F32Array(N);
            var pz = this.pz = new F32Array(N);
            var hd = this.hd = new F32Array(N);
            py = new F32Array(N);
            isHairpin = new U8Array(N);

            // --- plan curvature piece by piece, rejecting pieces that approach older road
            var grid = new Dictionary<long, List<int>>();
            void addGrid(int j)
            {
                long kk = Key((long)Math.Floor(px[j] / 50), (long)Math.Floor(pz[j] / 50));
                if (!grid.TryGetValue(kk, out var a)) grid[kk] = a = new List<int>();
                a.Add(j);
            }
            bool clearOK(int j0, int j1)
            {
                for (int j = j0; j <= j1; j++)
                {
                    long cx = (long)Math.Floor(px[j] / 50), cz = (long)Math.Floor(pz[j] / 50);
                    for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++)
                    {
                        if (!grid.TryGetValue(Key(cx + dx, cz + dz), out var a)) continue;
                        foreach (int q in a)
                        {
                            if (q > j - 160) continue;
                            double ex = px[q] - px[j], ez = pz[q] - pz[j];
                            if (ex * ex + ez * ez < 46 * 46) return false;
                        }
                    }
                }
                return true;
            }
            void integrate(int j0, int j1)
            {
                for (int j = Math.Max(1, j0); j <= j1; j++)
                {
                    double th = hd[j - 1] + 0.5 * (k[j - 1] + k[j]) * STEP;
                    hd[j] = th;
                    double tm = 0.5 * (hd[j - 1] + th);
                    px[j] = px[j - 1] + Math.Sin(tm) * STEP;
                    pz[j] = pz[j - 1] + Math.Cos(tm) * STEP;
                }
            }
            void curve(List<double> o, double angle, double radius, double dir)
            {
                double arc = angle * radius;
                double tr = U.Clamp(arc * 0.28, 6, 34);
                double kmax = dir / radius;
                double hold = Math.Max(0, arc - tr);
                double nt = Math.Max(1, JsRound(tr / STEP)), nh = JsRound(hold / STEP);
                for (int q = 0; q < nt; q++) o.Add(kmax * (q + 0.5) / nt);
                for (int q = 0; q < nh; q++) o.Add(kmax);
                for (int q = 0; q < nt; q++) o.Add(kmax * (1 - (q + 0.5) / nt));
            }
            void straight(List<double> o, double len) { for (int q = 0, n = JsRoundI(len / STEP); q < n; q++) o.Add(0); }

            int i = 0;
            hd[0] = 0; px[0] = 0; pz[0] = 0; addGrid(0);
            // Summit: a calm opening straight through the village square.
            var opening = new List<double>(); straight(opening, 90);
            foreach (double v in opening) k[++i] = v;
            integrate(1, i); for (int j = 1; j <= i; j++) addGrid(j);

            while (i < N - 1)
            {
                double s = i * STEP;
                var b = Biome(s);
                double th = hd[i];
                bool placed = false;
                for (int attempt = 0; attempt < 10 && !placed; attempt++)
                {
                    var o = new List<double>();
                    var w = b.plan;
                    string type;
                    if (attempt >= 7) type = "straight";
                    else
                    {
                        double tot = w.straight + w.sweep + w.tight + w.hairpin;
                        double r = R.Next() * tot;
                        type = (r -= w.straight) < 0 ? "straight" : (r -= w.sweep) < 0 ? "sweep" : (r -= w.tight) < 0 ? "tight" : "hairpin";
                        if (s > length - 400) type = R.Next() < 0.7 ? "straight" : "sweep";
                    }
                    // turn direction biased so the road keeps heading generally "down" the mountain (+z)
                    double dir = R.Next() < 0.5 + U.Clamp(-th * 0.45, -0.45, 0.45) ? 1 : -1;
                    if (Math.Abs(th) > 1.15) dir = -JsSign(th);
                    if (attempt % 2 == 1) dir = -dir;
                    bool hairpin = false;
                    if (type == "straight") straight(o, b.id == "highway" || b.id == "dryhwy" ? R.Range(90.0, 330.0) : R.Range(30.0, 150.0));
                    else if (type == "sweep") curve(o, R.Range(0.25, 0.95), R.Range(b.id == "highway" ? 180.0 : 90.0, b.id == "highway" ? 420.0 : 260.0), dir);
                    else if (type == "tight") curve(o, R.Range(0.7, 1.75), R.Range(36.0, 70.0), dir);
                    else
                    {
                        if (Math.Abs(th) > 0.85) { curve(o, R.Range(0.5, 1.0), R.Range(40.0, 60.0), -JsSign(th)); }
                        else
                        {
                            hairpin = true;
                            double d0 = R.Next() < 0.5 ? 1 : -1;
                            straight(o, R.Range(20.0, 50.0));
                            curve(o, Math.PI, R.Range(23.0, 29.0), d0);
                            straight(o, R.Range(70.0, 150.0));
                            curve(o, Math.PI, R.Range(23.0, 29.0), -d0);
                            straight(o, R.Range(20.0, 40.0));
                        }
                    }
                    int n = Math.Min(o.Count, N - 1 - i);
                    for (int j = 0; j < n; j++) k[i + 1 + j] = o[j];
                    integrate(i + 1, i + n);
                    if (clearOK(i + 1, i + n) || attempt == 9)
                    {
                        if (hairpin) for (int j = 0; j < n; j++) if (Math.Abs(o[j]) > 1.0 / 32) isHairpin[i + 1 + j] = 1;
                        for (int j = 1; j <= n; j++) addGrid(i + j);
                        i += n;
                        placed = true;
                    }
                    else
                    {
                        for (int j = 0; j < n; j++) k[i + 1 + j] = 0;
                    }
                }
            }
            FinishGenerate(R, grid);
        }

        void FinishGenerate(Rng R, Dictionary<long, List<int>> grid)
        {
            int N = this.N;
            var noise = this.noise; var k = this.k; var py = this.py;
            _grid50 = grid;

            // --- widths, grade and height
            var width = this.width = new F32Array(N);
            var grade = new F32Array(N);
            for (int j = 0; j < N; j++)
            {
                double s = j * STEP;
                double ak = Math.Abs(k[j]);
                width[j] = BiomeNum(s, b => b.width) + 1.8 * U.Smoothstep(0.012, 0.04, ak);
                double gmin = BiomeNum(s, b => b.grade[0]), gmax = BiomeNum(s, b => b.grade[1]);
                double g = U.Lerp(gmin, gmax, 0.5 + 0.5 * noise.Fbm(s * 0.0011, 4.7, 3));
                g *= 1 - 0.6 * U.Smoothstep(0.012, 0.035, ak);
                // the odd short climb keeps torque and fuel meaningful
                double climb = noise.N2(s * 0.0021, 91.3);
                if (climb > 0.62 && s > 1500) g = U.Lerp(g, -0.035, U.Smoothstep(0.62, 0.8, climb));
                if (s < 120) g = 0.01;
                grade[j] = g;
            }
            SmoothArr(width, 10);
            SmoothArr(grade, 20);
            if (loop)
            {
                // closed elevation profile: a few whole sine periods around the lap
                var C = m.circuit;
                double A = Truthy(C.elev) ? C.elev : 4;
                double[][] comps = { new[] { 1, A * 0.6, R.Next() * 6.28 }, new[] { 2, A * 0.3, R.Next() * 6.28 }, new[] { 3, A * 0.15, R.Next() * 6.28 } };
                for (int j = 0; j < N; j++)
                {
                    double u = (double)j / (N - 1);
                    double y = m.startAltitude;
                    foreach (var c in comps) y += c[1] * Math.Sin(6.2832 * c[0] * u + c[2]);
                    py[j] = y;
                }
                py[N - 1] = py[0];
                for (int j = 1; j < N; j++) grade[j] = (py[j - 1] - py[j]) / STEP;
                width.Fill(m.biomes[0].width);
                baseH = m.startAltitude;
            }
            else
            {
                py[0] = m.startAltitude;
                for (int j = 1; j < N; j++) py[j] = py[j - 1] - grade[j] * STEP;
            }
            this.grade = grade;

            // --- right vectors
            rx = new F32Array(N); rz = new F32Array(N);
            for (int j = 0; j < N; j++) { rx[j] = -Math.Cos(hd[j]); rz[j] = Math.Sin(hd[j]); }

            BuildCoarseIndex();
            PlaceStructures(R);
            BuildSides(R);
            PlaceJumps(R);
            PlaceShortcuts(R);
            PlaceSurfaces(R);
            PlaceRails(R);
            PlaceHazards(R);
            PlacePickups(R);
            PlaceSigns(R);
            PlaceProps(R);
            railBroken = new U8Array(N * 2);
        }

        // Closed circuit centreline from a control polygon (see Data/Maps.cs `circuit`).
        Dictionary<long, List<int>> PlanLoop(Rng R)
        {
            var C = m.circuit;
            double size = Truthy(C.size) ? C.size : 380, rmin = Truthy(C.rmin) ? C.rmin : 22;
            List<double[]> P = null;
            for (int attempt = 0; attempt < 60 && P == null; attempt++)
            {
                var ctrl = LoopShape(C.shape ?? "gp", size, R);
                var pts = CatmullClosed(ctrl, 16);
                pts = ResampleClosed(pts, STEP);
                // relax until no corner is tighter than rmin
                for (int it = 0; it < 400; it++)
                {
                    int n = pts.Count;
                    double worst = 0;
                    var o = new List<double[]>(n);
                    for (int i = 0; i < n; i++)
                    {
                        double[] p = pts[i], a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
                        double kk = TurnK(a, p, c);
                        worst = Math.Max(worst, kk);
                        if (kk < 1 / rmin) { o.Add(p); continue; }
                        o.Add(new[] { p[0] * 0.5 + (a[0] + c[0]) * 0.25, p[1] * 0.5 + (a[1] + c[1]) * 0.25 });
                    }
                    pts = o;
                    if (worst < 1 / rmin) break;
                    if (it % 20 == 19) pts = ResampleClosed(pts, STEP);
                }
                pts = ResampleClosed(pts, STEP);
                if (pts.Count * STEP < (Truthy(C.minLen) ? C.minLen : 1800)) continue;
                if (LoopClear(pts, 34)) P = pts;
            }
            if (P == null) throw new InvalidOperationException("could not build circuit " + m.id);
            // start / finish on the middle of the longest gentle stretch
            int np = P.Count;
            double kAt(int i) => TurnK(P[(i - 1 + np) % np], P[i], P[(i + 1) % np]);
            int bestLen = 0, bestMid = 0, run = 0;
            for (int i = 0; i < np * 2; i++)
            {
                if (kAt(i % np) < 0.004) { run++; if (run > bestLen) { bestLen = run; bestMid = i - run / 2; } } else run = 0;
                if (run >= np) break;
            }
            int s0 = ((bestMid - (int)Math.Floor(Math.Min(bestLen, 80) * 0.25)) % np + np) % np;
            var rot = new List<double[]>(np + 1);
            for (int i = s0; i < np; i++) rot.Add(P[i]);
            for (int i = 0; i < s0; i++) rot.Add(P[i]);
            rot.Add(rot[0]);
            int N = this.N = rot.Count;
            length = total = (N - 1) * STEP;
            var px = this.px = new F32Array(N); var pz = this.pz = new F32Array(N);
            var hd = this.hd = new F32Array(N); var k = this.k = new F32Array(N);
            py = new F32Array(N);
            isHairpin = new U8Array(N);
            for (int i = 0; i < N; i++) { px[i] = rot[i][0]; pz[i] = rot[i][1]; }
            for (int i = 0; i < N; i++)
            {
                int a = Math.Max(0, i - 1), c = Math.Min(N - 1, i + 1);
                int ia = i == 0 ? N - 2 : a, ic = i == N - 1 ? 1 : c;
                hd[i] = Math.Atan2(px[ic] - px[ia], pz[ic] - pz[ia]);
            }
            for (int i = 1; i < N; i++) { while (hd[i] - hd[i - 1] > Math.PI) hd[i] -= 6.2832; while (hd[i] - hd[i - 1] < -Math.PI) hd[i] += 6.2832; }
            for (int i = 0; i < N; i++)
            {
                int a = i == 0 ? N - 2 : i - 1, c = i == N - 1 ? 1 : i + 1;
                double dh = Math.Atan2(px[c] - px[i], pz[c] - pz[i]) - Math.Atan2(px[i] - px[a], pz[i] - pz[a]);
                while (dh > Math.PI) dh -= 6.2832; while (dh < -Math.PI) dh += 6.2832;
                k[i] = dh / STEP;
                if (Math.Abs(k[i]) > 1.0 / 30) isHairpin[i] = 1;
            }
            SmoothArr(k, 2);
            var grid = new Dictionary<long, List<int>>();
            for (int j = 0; j < N; j++)
            {
                long kk = Key((long)Math.Floor(px[j] / 50), (long)Math.Floor(pz[j] / 50));
                if (!grid.TryGetValue(kk, out var a2)) grid[kk] = a2 = new List<int>();
                a2.Add(j);
            }
            return grid;
        }

        // wrap a distance onto the lap (circuits) or clamp it (point to point)
        public double WrapS(double s) => loop ? ((s % length) + length) % length : s;

        void BuildCoarseIndex()
        {
            cells = new Dictionary<long, List<int>>();
            for (int j = 0; j < N; j += COARSE)
            {
                long kk = Key((long)Math.Floor(px[j] / CELL), (long)Math.Floor(pz[j] / CELL));
                if (!cells.TryGetValue(kk, out var a)) cells[kk] = a = new List<int>();
                a.Add(j);
            }
        }

        // Find stretches with low curvature.
        public bool StraightAt(int j0, double len, double maxK)
        {
            int n = JsRoundI(len / STEP);
            if (j0 + n >= N) return false;
            for (int j = j0; j < j0 + n; j++) if (Math.Abs(k[j]) > maxK || isHairpin[j] != 0) return false;
            return true;
        }

        void PlaceStructures(Rng R)
        {
            int N = this.N;
            tunnel = new U8Array(N);
            bridge = new U8Array(N);
            tunnels = new List<TrackSpan>(); bridges = new List<TrackSpan>();
            double lastEnd = 1600 / STEP;
            for (int j = JsRoundI(1500 / STEP); j < N - 400; j += JsRoundI(120 / STEP))
            {
                double s = j * STEP;
                var b = Biome(s);
                if (j < lastEnd + 200 / STEP) continue;
                if (s > length - 600) break;
                if (Truthy(b.tunnel) && R.Next() < b.tunnel * 0.4)
                {
                    double len = R.Range(110.0, 260.0);
                    if (StraightAt(j, len, 0.02))
                    {
                        int n = JsRoundI(len / STEP);
                        for (int q = j; q < j + n; q++) tunnel[q] = 1;
                        tunnels.Add(new TrackSpan { a = j, b = j + n });
                        lastEnd = j + n; continue;
                    }
                }
                if (Truthy(b.bridge) && R.Next() < b.bridge * 0.2)
                {
                    double len = R.Range(60.0, 150.0);
                    if (StraightAt(j, len, 0.009))
                    {
                        int n = JsRoundI(len / STEP);
                        for (int q = j; q < j + n; q++) bridge[q] = 1;
                        bridges.Add(new TrackSpan { a = j, b = j + n, style = b.id == "highway" || b.id == "dryhwy" ? "concrete" : R.Next() < 0.5 ? "truss" : "stone" });
                        lastEnd = j + n;
                    }
                }
            }
            // flatten the grade a little inside tunnels and over bridges
            var all = new List<TrackSpan>(tunnels); all.AddRange(bridges);
            foreach (var t in all)
            {
                double y0 = py[t.a], y1 = py[t.b];
                for (int q = t.a; q <= t.b; q++)
                {
                    double u = (double)(q - t.a) / (t.b - t.a);
                    py[q] = U.Lerp(py[q], U.Lerp(y0, y1, u), 0.85);
                }
            }
        }

        void BuildSides(Rng R)
        {
            int N = this.N;
            // Which side is uphill? Look for older (higher) road nearby on either side.
            var score = new F32Array(N);
            var g = _grid50;
            for (int j = 0; j < N; j++)
            {
                double x = px[j], z = pz[j];
                long cx = (long)Math.Floor(x / 50), cz = (long)Math.Floor(z / 50);
                double sc = 0;
                for (int dz = -3; dz <= 3; dz++) for (int dx = -3; dx <= 3; dx++)
                {
                    if (!g.TryGetValue(Key(cx + dx, cz + dz), out var a)) continue;
                    for (int n = 0; n < a.Count; n += 3)
                    {
                        int q = a[n];
                        if (Math.Abs(q - j) < 70) continue;
                        double ex = px[q] - x, ez = pz[q] - z;
                        double d2 = ex * ex + ez * ez;
                        if (d2 > 160 * 160) continue;
                        double dy = py[q] - py[j];
                        double side = ex * rx[j] + ez * rz[j];
                        sc += JsSign(side) * U.Clamp(dy / 15, -1, 1) * (1 - Math.Sqrt(d2) / 160);
                    }
                }
                score[j] = sc * 0.35 + noise.N2(j * STEP * 0.0016, 17.1) * 0.9;
            }
            SmoothArr(score, 30);
            sw = new F32Array(N * 2 * 5);
            slW = new F32Array(N * 2);
            slD = new F32Array(N * 2);
            cutSl = new F32Array(N * 2);
            offSurf = new U8Array(N);
            // proper circuits and street tracks sit on level ground
            bool flatAll = false;
            if (loop) foreach (var b in m.biomes) if (Truthy(b.circuitDress) || b.Has("grandstands") || b.Has("city")) { flatAll = true; break; }
            for (int j = 0; j < N; j++)
            {
                double s = j * STEP;
                double wallR = U.Smoothstep(-0.35, 0.35, score[j]);
                double flat = U.Clamp(BiomeNum(s, b => b.flat) + noise.N2(s * 0.003, 5.5) * 0.25, 0, 1);
                if (s < 160 || flatAll) flat = 1;
                double wS = BiomeNum(s, b => b.wallSlope) * (0.75 + 0.5 * (0.5 + 0.5 * noise.N2(s * 0.004, 2.2)));
                double dS = BiomeNum(s, b => b.dropSlope) * (0.75 + 0.5 * (0.5 + 0.5 * noise.N2(s * 0.005, 8.8)));
                for (int side = 0; side < 2; side++)
                {
                    double isWall = side == 1 ? wallR : 1 - wallR;
                    int o = (j * 2 + side) * 5;
                    sw[o] = isWall * (1 - flat);
                    sw[o + 1] = (1 - isWall) * (1 - flat);
                    sw[o + 2] = flat;
                    slW[j * 2 + side] = wS;
                    slD[j * 2 + side] = dS;
                }
                var bb = Biome(s);
                offSurf[j] = bb.look.snow > 0.5 ? SURF.SNOW : bb.id.StartsWith("mesa", StringComparison.Ordinal) || bb.id == "redwall" || bb.id == "gorge" || bb.id == "dryhwy" ? SURF.SAND : bb.id == "rocky" || bb.id == "cliffs" ? SURF.ROCK : SURF.GRASS;
            }
            // tunnels: rock both sides; bridges: void both sides (with abutment ramps)
            foreach (var t in tunnels) for (int q = t.a - 6; q <= t.b + 6; q++)
            {
                if (q < 0 || q >= N) continue;
                double u = q < t.a ? (q - (t.a - 6)) / 6.0 : q > t.b ? 1 - (q - t.b) / 6.0 : 1;
                for (int side = 0; side < 2; side++)
                {
                    int o = (q * 2 + side) * 5;
                    sw[o] = U.Lerp(sw[o], 1, u); sw[o + 1] *= 1 - u; sw[o + 2] *= 1 - u;
                    slW[q * 2 + side] = U.Lerp(slW[q * 2 + side], 3.2, u);
                }
            }
            foreach (var t in bridges) for (int q = t.a; q <= t.b; q++)
            {
                double u = Math.Min(1, Math.Min((q - t.a) / 5.0, (t.b - q) / 5.0));
                for (int side = 0; side < 2; side++)
                {
                    int o = (q * 2 + side) * 5;
                    for (int c = 0; c < 4; c++) sw[o + c] *= 1 - u;
                    sw[o + 4] = u;
                }
            }
        }

        void PlaceJumps(Rng R)
        {
            jumps = new List<TrackJump>();
            for (int j = JsRoundI(1200 / STEP); j < N - 200; j += JsRoundI(60 / STEP))
            {
                double s = j * STEP; var b = Biome(s);
                if (!Truthy(b.hazards.jumps) || R.Next() > b.hazards.jumps * 0.12) continue;
                if (!StraightAt(j - 20, 120, 0.006) || tunnel[j] != 0 || bridge[j] != 0 || bridge[j + 20] != 0) continue;
                bool big = R.Next() < 0.35;
                jumps.Add(new TrackJump { s = s, h = big ? 1.35 : 0.85 });
                for (int q = j - 10; q < j + 20; q++)
                {
                    double u = (q - j) * STEP;
                    double h;
                    double H = big ? 1.35 : 0.85;
                    if (u < -14) h = 0;
                    else if (u <= 0) h = H * Math.Pow((u + 14) / 14, 1.6);
                    else if (u <= 7) h = H - (u / 7) * (H + 0.5);
                    else h = -0.5 * (1 - U.Smoothstep(7, 36, u));
                    py[q] += h;
                }
                j += JsRoundI(200 / STEP);
            }
        }

        void PlaceShortcuts(Rng R)
        {
            shortcuts = new List<TrackShortcut>();
            int N = this.N;
            // (a) switchback drops: older leg directly above a newer leg
            int lastB = 0;
            for (int a = 200; a < N - 300; a += 4)
            {
                if (a < lastB + 150) continue;
                double s = a * STEP; var b = Biome(s);
                if (!b.Has("shortcuts")) continue;
                int best = -1; double bd = 1e9;
                for (int q = a + 70; q < Math.Min(N - 1, a + 260); q += 2)
                {
                    double ex = px[q] - px[a], ez = pz[q] - pz[a];
                    double d2 = ex * ex + ez * ez;
                    if (d2 < bd) { bd = d2; best = q; }
                }
                if (best < 0) continue;
                double dist = Math.Sqrt(bd), dy = py[a] - py[best];
                if (dist < 44 || dist > 75 || dy < 6 || dy > 28 || tunnel[a] != 0 || bridge[a] != 0 || tunnel[best] != 0) continue;
                if (R.Next() > 0.75) { lastB = best; continue; }
                int sideA = (px[best] - px[a]) * rx[a] + (pz[best] - pz[a]) * rz[a] > 0 ? 1 : 0;
                int sideB = (px[a] - px[best]) * rx[best] + (pz[a] - pz[best]) * rz[best] > 0 ? 1 : 0;
                double slope = dy / Math.Max(10, dist - width[a] / 2 - width[best] / 2 - 2);
                CarveCut(a, sideA, 7, slope);
                CarveCut(best, sideB, 9, -slope);
                shortcuts.Add(new TrackShortcut { kind = "drop", a = a, b = best, sideA = sideA, sideB = sideB, s0 = a * STEP, s1 = best * STEP, reward = 300 + JsRound(dy * 15) });
                lastB = best;
            }
            // (b) corner cuts: rough dirt across the inside of tight bends
            for (int j = 300; j < N - 200; j += 10)
            {
                double s = j * STEP; var b = Biome(s);
                if (!b.Has("shortcuts") && b.id != "forest" && b.id != "lower") continue;
                double kk = k[j];
                if (Math.Abs(kk) < 1.0 / 75 || Math.Abs(kk) > 1.0 / 30 || isHairpin[j] != 0 || tunnel[j] != 0 || bridge[j] != 0) continue;
                bool near = false;
                foreach (var c in shortcuts) if (Math.Abs(c.a - j) < 150) { near = true; break; }
                if (near) continue;
                if (R.Next() > 0.35) { j += 40; continue; }
                int a = j, e = j;
                while (a > 0 && Math.Abs(k[a]) > 1.0 / 120) a--;
                while (e < N - 1 && Math.Abs(k[e]) > 1.0 / 120) e++;
                if (e - a < 15 || e - a > 70) continue;
                int inner = kk > 0 ? 0 : 1; // left turn -> inside is the left (negative d) side
                for (int q = a - 4; q <= e + 4; q++)
                {
                    double u = Math.Min(1, Math.Min((q - (a - 4)) / 6.0, (e + 4 - q) / 6.0));
                    int o = (q * 2 + inner) * 5;
                    for (int c = 0; c < 5; c++) sw[o + c] *= 1 - u;
                    sw[o + 3] += u;
                    cutSl[q * 2 + inner] = 0.015;
                }
                shortcuts.Add(new TrackShortcut { kind = "cut", a = a, b = e, side = inner, s0 = a * STEP, s1 = e * STEP, reward = 120 + (e - a) * 3 });
                j = e + 60;
            }
        }

        public void CarveCut(int j, int side, int half, double slope)
        {
            for (int q = j - half - 5; q <= j + half + 5; q++)
            {
                if (q < 0 || q >= N) continue;
                double u = U.Clamp(Math.Min(q - (j - half - 5), j + half + 5 - q) / 5.0, 0, 1);
                int o = (q * 2 + side) * 5;
                for (int c = 0; c < 5; c++) sw[o + c] *= 1 - u;
                sw[o + 3] += u;
                cutSl[q * 2 + side] = slope;
            }
        }

        void PlaceSurfaces(Rng R)
        {
            int N = this.N;
            surf = new U8Array(N);
            int j = 0;
            while (j < N)
            {
                double s = j * STEP; var b = Biome(s);
                int len = JsRoundI(R.Range(80.0, 260.0) / STEP);
                var sf = b.surface;
                int t = sf.@base;
                double r = R.Next();
                if (r < Or0(sf.damaged)) t = t == SURF.SNOW ? SURF.SNOW : SURF.DAMAGED;
                else if (r < Or0(sf.damaged) + Or0(sf.gravel)) t = SURF.GRAVEL;
                else if (r < Or0(sf.damaged) + Or0(sf.gravel) + Or0(sf.dirt)) t = SURF.DIRT;
                if (s < 300) t = SURF.ASPHALT;
                if (b.id == "snow" && R.Next() < 0.3) t = SURF.ASPHALT; // ploughed stretches
                for (int q = j; q < Math.Min(N, j + len); q++) surf[q] = bridge[q] != 0 ? SURF.CONCRETE : tunnel[q] != 0 ? SURF.ASPHALT : t;
                j += len;
            }
        }

        void PlaceRails(Rng R)
        {
            int N = this.N;
            rail = new U8Array(N * 2);
            for (int j = 0; j < N; j++)
            {
                double s = j * STEP; var b = Biome(s);
                for (int side = 0; side < 2; side++)
                {
                    int o = (j * 2 + side) * 5;
                    double drop = sw[o + 1], cut = sw[o + 3];
                    int t = RAIL.NONE;
                    if (bridge[j] != 0) t = b.railType == 2 ? RAIL.STEEL : b.railType != 0 ? b.railType : RAIL.STEEL;
                    else if (tunnel[j] == 0 && drop > 0.55 && cut < 0.1 && noise.N2(s * 0.006, side * 40 + 3) < b.rails * 1.6 - 0.6) t = b.railType;
                    if (isHairpin[j] != 0 && drop > 0.4 && cut < 0.1 && tunnel[j] == 0) t = b.railType != 0 ? b.railType : RAIL.STEEL;
                    rail[j * 2 + side] = t;
                }
            }
            // occasional missing sections ("someone went through here before")
            railGaps = new List<TrackRailGap>();
            for (int j = 400; j < N - 100; j += 50)
            {
                if (R.Next() > 0.1) continue;
                int side = R.Next() < 0.5 ? 0 : 1;
                if (rail[j * 2 + side] == 0 || bridge[j] != 0) continue;
                int n = R.Int(3, 7);
                for (int q = j; q < j + n; q++) rail[q * 2 + side] = RAIL.NONE;
                railGaps.Add(new TrackRailGap { j = j + (n >> 1), side = side });
            }
        }

        void PlaceHazards(Rng R)
        {
            int N = this.N;
            decals = new List<TrackDecal>();
            potholes = new List<TrackPothole>();
            obstacles = new List<TrackObstacle>();
            rockfalls = new List<TrackRockfall>();
            potB = new Dictionary<int, List<TrackPothole>>();
            decalB = new Dictionary<int, List<TrackDecal>>();
            double per(double rate, double lenM) => rate * lenM / 1000;
            for (int j = JsRoundI(250 / STEP); j < N - 60; j += JsRoundI(100 / STEP))
            {
                double s = j * STEP; var b = Biome(s); var hz = b.hazards;
                if (s > length) break;
                double W = width[j];
                bool inT = tunnel[j] != 0, onB = bridge[j] != 0;
                int sf = surf[j];
                // potholes cluster on broken asphalt
                double pr = per(hz.potholes * (sf == SURF.DAMAGED ? 30 : 6), 100);
                for (int n = 0; n < pr; n++) if (R.Next() < pr - n)
                {
                    potholes.Add(new TrackPothole { s = s + R.Range(0.0, 100.0), d = R.Range(-W / 2 + 0.6, W / 2 - 0.6), r = R.Range(0.35, 0.75), depth = R.Range(0.07, 0.16) });
                }
                if (!onB && R.Next() < per(hz.puddles * 3.5, 100))
                {
                    double L = R.Range(2.0, 6.0), dd = R.Range(-W / 2 + 1, W / 2 - 1);
                    decals.Add(new TrackDecal { s0 = s + 20, s1 = s + 20 + L, d0 = dd - R.Range(0.8, 2.0), d1 = dd + R.Range(0.8, 2.0), type = SURF.WATER });
                }
                if (!inT && !onB && R.Next() < per(hz.mud * 3, 100))
                {
                    double L = R.Range(8.0, 24.0); int side = R.Next() < 0.5 ? -1 : 1;
                    double d0 = side < 0 ? -W / 2 - 0.5 : R.Range(-W / 2, 0), d1 = side < 0 ? R.Range(0, W / 2) : W / 2 + 0.5;
                    decals.Add(new TrackDecal { s0 = s + 40, s1 = s + 40 + L, d0 = d0, d1 = d1, type = SURF.MUD });
                }
                if (!inT && R.Next() < per(hz.ice * 4, 100))
                {
                    double L = R.Range(10.0, 40.0);
                    decals.Add(new TrackDecal { s0 = s + 30, s1 = s + 30 + L, d0 = R.Range(-W / 2 - 0.5, -1), d1 = R.Range(1, W / 2 + 0.5), type = SURF.ICE });
                }
                if ((b.id == "rocky" || b.id == "cliffs" || b.id == "redwall") && Math.Abs(k[j]) > 1.0 / 90 && R.Next() < 0.35)
                {
                    decals.Add(new TrackDecal { s0 = s + 10, s1 = s + 30, d0 = -W / 2, d1 = W / 2, type = SURF.GRAVEL });
                }
                // obstacles
                int wallSide = sw[(j * 2 + 1) * 5] > sw[(j * 2) * 5] ? 1 : -1;
                if (!onB && R.Next() < per(hz.rocks * 2.2, 100))
                {
                    double ss = s + R.Range(0.0, 100.0), dd = wallSide * R.Range(W / 2 - 1.4, W / 2 + 0.6);
                    AddObstacle("rock", ss, dd, R.Range(0.45, 1.05), R);
                }
                if (!onB && !inT && R.Next() < per(hz.fallenTrees * 1.6, 100) && Math.Abs(k[j + 25]) < 1.0 / 120)
                {
                    double ss = s + 50;
                    double r = R.Range(0.25, 0.38);
                    AddObstacle("tree", ss, wallSide * (W / 2 + 0.5), r, R, len: R.Range(W * 0.35, W * 0.52), side: wallSide);
                }
                if (R.Next() < per(hz.abandoned * 1.4, 100))
                {
                    double ss = s + R.Range(0.0, 100.0); int side = R.Next() < 0.5 ? -1 : 1;
                    double dd = side * R.Range(W / 2 - 1.2, W / 2 + 0.6);
                    AddObstacle("car", ss, dd, 1, R, yaw: R.Range(-0.5, 0.5) + (R.Next() < 0.3 ? Math.PI : 0));
                }
                if ((b.id == "highway" || b.id == "dryhwy") && R.Next() < 0.12 && !onB)
                {
                    // roadworks / lane closure
                    double ss = s + R.Range(0.0, 60.0); int side = R.Next() < 0.5 ? -1 : 1;
                    for (int n = 0; n < 5; n++) AddObstacle("barrier", ss + n * 2.6, side * (W / 2 - 1.6 - n * 0.35), 0.5, R);
                    AddObstacle("barrel", ss - 6, side * (W / 2 - 1.2), 0.32, R);
                    AddObstacle("barrel", ss - 10, side * (W / 2 - 0.9), 0.32, R);
                }
                if (Truthy(hz.rockfall) && !inT && wallSide != 0 && R.Next() < 0.12 && sw[(j * 2 + (wallSide > 0 ? 1 : 0)) * 5] > 0.6)
                {
                    rockfalls.Add(new TrackRockfall { s = s + 50, side = wallSide });
                }
            }
            // spatial buckets (20 m) for the per-step lookups
            decalB = Bucket(decals, o => o.s0, o => o.s1);
            potB = Bucket(potholes, o => o.s, null);
        }

        public static Dictionary<int, List<T>> Bucket<T>(List<T> arr, Func<T, double> s0key, Func<T, double> s1key)
        {
            var mm = new Dictionary<int, List<T>>();
            foreach (var o in arr)
            {
                int a = (int)Math.Floor((s0key(o) - 3) / 20), e = (int)Math.Floor(((s1key != null ? s1key(o) : s0key(o)) + 3) / 20);
                for (int q = a; q <= e; q++) { if (!mm.TryGetValue(q, out var l)) mm[q] = l = new List<T>(); l.Add(o); }
            }
            return mm;
        }

        // extra: len/side for fallen trees, yaw offset for abandoned cars (NaN = not given)
        public TrackObstacle AddObstacle(string type, double s, double d, double r, Rng R, double len = double.NaN, int side = 0, double yaw = double.NaN)
        {
            var p = PosAt(s, d);
            var o = new TrackObstacle { type = type, s = s, d = d, x = p.x, z = p.z, y = p.y, r = r };
            if (!double.IsNaN(len)) { o.len = len; o.side = side; }
            if (!double.IsNaN(yaw)) o.yaw = yaw;
            int j = JsRoundI(s / STEP);
            double hd = this.hd[(int)U.Clamp(j, 0, N - 1)];
            if (type == "rock") o.colliders.Add(new WorldCollider { t = "s", x = p.x, y = p.y + r * 0.4, z = p.z, r = r });
            else if (type == "barrel") o.colliders.Add(new WorldCollider { t = "s", x = p.x, y = p.y + 0.45, z = p.z, r = 0.4, light = true, m = 35, vx = 0, vy = 0, vz = 0, x0 = p.x, y0 = p.y + 0.45, z0 = p.z });
            else if (type == "barrier") o.colliders.Add(new WorldCollider { t = "b", x = p.x, y = p.y + 0.42, z = p.z, hx = 0.25, hy = 0.42, hz = 1.0, yaw = hd });
            else if (type == "car") { o.yaw = hd + Or0(yaw); o.colliders.Add(new WorldCollider { t = "b", x = p.x, y = p.y + 0.75, z = p.z, hx = 0.85, hy = 0.7, hz = 2.0, yaw = o.yaw }); }
            else if (type == "tree")
            {
                // trunk lying across part of the road, root on the shoulder
                int dirIn = -side;
                for (double u = 0; u <= len; u += 0.7)
                {
                    var q = PosAt(s + u * 0.15, d + dirIn * u);
                    o.colliders.Add(new WorldCollider { t = "s", x = q.x, y = q.y + r, z = q.z, r = r * (1 - u / len * 0.35) });
                }
                o.yaw = hd;
            }
            obstacles.Add(o);
            return o;
        }

        void PlacePickups(Rng R)
        {
            var pk = pickups = new List<TrackPickup>();
            void add(string type, double s, double d, bool risky = false)
            {
                var p = PosAt(s, d);
                pk.Add(new TrackPickup { type = type, s = s, d = d, x = p.x, y = p.y, z = p.z, risky = risky });
            }
            // shortcut rewards
            foreach (var c in shortcuts)
            {
                if (c.kind == "drop")
                {
                    TrackPos A = PosAt(c.s0, 0), B = PosAt(c.s1, 0);
                    double x = (A.x + B.x) / 2, z = (A.z + B.z) / 2;
                    double h = Height(x, z);
                    pk.Add(new TrackPickup { type = R.Next() < 0.3 ? "rare" : "crate", s = (c.s0 + c.s1) / 2, d = 0, x = x, y = h, z = z, free = true });
                }
                else
                {
                    int mid = JsRoundI((c.a + c.b) / 2.0);
                    double R0 = 1 / Math.Max(0.01, Math.Abs(k[mid]));
                    string type = R.Next() < 0.5 ? "fuel" : "cash";
                    add(type, mid * STEP, (c.side != 0 ? 1 : -1) * Math.Min(R0 * 0.45, width[mid] / 2 + 9));
                }
            }
            // fuel: spacing grows with depth so fuel matters more further down
            double s = 850;
            while (s < length - 200)
            {
                int j = JsRoundI(s / STEP);
                double W = width[j];
                // risky spots: on the drop side shoulder, beyond rail gaps, or tucked behind obstacles
                TrackRailGap gap = null;
                foreach (var g in railGaps) if (Math.Abs(g.j * STEP - s) < 260) { gap = g; break; }
                if (gap != null) add("fuel", gap.j * STEP, (gap.side != 0 ? 1 : -1) * (width[gap.j] / 2 + 1.0), true);
                else { double sg = R.Next() < 0.5 ? -1 : 1; add("fuel", s, sg * R.Range(W / 2 - 0.8, W / 2 + 0.7)); }
                s += R.Range(1100.0, 1600.0) + s * 0.045;
            }
            // cash bundles, sometimes in a line along the road
            for (s = 220; s < length; s += R.Range(170.0, 330.0))
            {
                int j = JsRoundI(s / STEP); double W = width[j];
                if (R.Next() < 0.3) for (int n = 0; n < 3; n++) add("cash", s + n * 7, -W / 4 + n * W / 4 * (R.Next() < 0.5 ? 1 : -1) * 0.5);
                else add("cash", s, R.Range(-W / 2 + 0.7, W / 2 - 0.7));
            }
            for (s = 1700; s < length; s += R.Range(1500.0, 2400.0))
            {
                int j = JsRoundI(s / STEP);
                add("repair", s, R.Range(-width[j] / 2 + 0.8, width[j] / 2 - 0.8));
            }
            for (s = 4800; s < length; s += R.Range(4200.0, 5600.0)) add("repairL", s, 0);
            for (s = 3500; s < length; s += R.Range(3200.0, 4600.0))
            {
                int j = JsRoundI(s / STEP);
                double sg = R.Next() < 0.5 ? -1 : 1;
                add("rare", s, sg * (width[j] / 2 + 0.4));
            }
            StableSortByS(pk);
        }

        // Array.prototype.sort is stable; List.Sort is not.
        static void StableSortByS(List<TrackPickup> l)
        {
            for (int i = 1; i < l.Count; i++)
            {
                var v = l[i]; int j = i - 1;
                while (j >= 0 && l[j].s - v.s > 0) { l[j + 1] = l[j]; j--; }
                l[j + 1] = v;
            }
        }

        void PlaceSigns(Rng R)
        {
            var sg = signs = new List<TrackSign>();
            int N = this.N;
            // curve warnings and chevrons
            for (int j = 60; j < N - 60; j++)
            {
                double ak = Math.Abs(k[j]);
                if (ak > 1.0 / 45 && Math.Abs(k[j - 1]) <= 1.0 / 45)
                {
                    bool left = k[j] > 0;
                    int sj = Math.Max(0, j - 35);
                    int side = 1; // warning on the right shoulder
                    sg.Add(new TrackSign { type = isHairpin[j] != 0 ? (left ? "hairpinL" : "hairpinR") : left ? "curveL" : "curveR", s = sj * STEP, side = side });
                    // chevrons on the outside of the bend
                    int e = j; while (e < N - 1 && Math.Abs(k[e]) > 1.0 / 60) e++;
                    for (int q = j + 4; q < e - 2; q += 9) sg.Add(new TrackSign { type = left ? "chevL" : "chevR", s = q * STEP, side = left ? 1 : -1, outer = true });
                    j = e;
                }
            }
            foreach (var jm in jumps) sg.Add(new TrackSign { type = "bump", s = jm.s - 70, side = 1 });
            foreach (var t in tunnels) sg.Add(new TrackSign { type = "tunnel", s = t.a * STEP - 90, side = 1 });
            foreach (var rf in rockfalls) sg.Add(new TrackSign { type = "rockfall", s = rf.s - 120, side = 1 });
            foreach (var d in decals) if (d.type == SURF.ICE && R.Next() < 0.6) sg.Add(new TrackSign { type = "ice", s = d.s0 - 60, side = 1 });
            for (int km = 1; km * 1000 < length; km++) sg.Add(new TrackSign { type = "km", s = km * 1000, side = 1, km = km });
            foreach (var b in m.biomes) if (b.start > 0) sg.Add(new TrackSign { type = "region", s = b.start + 20, side = -1, text = b.name });
            // shortcut markers: crude hand painted arrows
            foreach (var c in shortcuts) sg.Add(new TrackSign { type = "shortcut", s = c.s0 - 12, side = c.kind == "drop" ? (c.sideA != 0 ? 1 : -1) : c.side != 0 ? 1 : -1 });
            foreach (var s in sg)
            {
                s.broken = R.Next() < 0.12;
                if (s.s < 0) s.s = 0;
            }
        }

        void PlaceProps(Rng R)
        {
            // Large decorative structures positioned in world space.
            var pr = props = new List<TrackProp>();
            farms = new List<TrackProp>();
            int N = this.N;
            const double HP = Math.PI / 2;
            // every building claims a footprint: nothing may overlap another building or any road leg
            var bld = new List<double[]>();
            bool room(double x, double z, double r)
            {
                foreach (var b in bld) if (JsHypot(b[0] - x, b[1] - z) < b[2] + r + 2.5) return false;
                return BlockFree(x, z, r * 0.75);
            }
            void claim(double x, double z, double r) => bld.Add(new[] { x, z, r });
            bool anyType(string type) { foreach (var q in pr) if (q.type == type) return true; return false; }
            for (int j = 10; j < N - 10; j += 6)
            {
                double s = j * STEP; var b = Biome(s);
                if (s > length + 400) break;
                if (tunnel[j] != 0 || bridge[j] != 0) continue;
                double W = width[j];
                if (b.Has("houses") && R.Next() < 0.22 && s > 20)
                {
                    for (int side = 0; side < 2; side++)
                    {
                        if (sw[(j * 2 + side) * 5 + 2] < 0.6 || R.Next() < 0.4) continue;
                        int sd = side != 0 ? 1 : -1;
                        double d = sd * (W / 2 + R.Range(7.0, 16.0));
                        var p = PosAt(s, d);
                        double size = R.Range(0.85, 1.3);
                        double yaw = hd[j] + (sd > 0 ? -HP : HP) + R.Range(-0.15, 0.15);
                        string kind = R.Next() < 0.18 ? "barn" : R.Next() < 0.1 && !anyType("chapel") ? "chapel" : "house";
                        double fr = (kind == "barn" ? 7.5 : 6) * size;
                        if (!room(p.x, p.z, fr)) continue;
                        claim(p.x, p.z, fr);
                        pr.Add(new TrackProp { type = kind, x = p.x, y = p.y, z = p.z, yaw = yaw, size = size, seed = R.Int(0, 1000000), s = s, collider = true });
                    }
                }
                // farms: a fenced pasture with a barn and a farmhouse, set back from the road
                bool farmTry = (b.Has("houses") || b.Has("fences") || b.Has("poles") || b.Has("logs")) && R.Next() < (b.Has("houses") ? 0.07 : 0.03) && s > 120;
                if (farmTry) foreach (var q in pr) if (q.type == "farm" && Math.Abs(q.s - s) < 700) { farmTry = false; break; }
                if (farmTry)
                {
                    int sd = R.Next() < 0.5 ? -1 : 1;
                    int side = sd > 0 ? 1 : 0;
                    if (sw[(j * 2 + side) * 5 + 2] > 0.3 && sw[(j * 2 + side) * 5] < 0.6)
                    {
                        double w = R.Range(26.0, 40.0), dpt = R.Range(16.0, 24.0);
                        double dc = sd * (W / 2 + 10 + dpt / 2);
                        var c = PosAt(s, dc);
                        // keep it reasonably flat
                        double[][] corners = { new[] { -w / 2, -dpt / 2 }, new[] { w / 2, -dpt / 2 }, new[] { w / 2, dpt / 2 }, new[] { -w / 2, dpt / 2 } };
                        double fhd = hd[j];
                        double fx = Math.Sin(fhd), fz = Math.Cos(fhd), frx = rx[j] * sd, frz = rz[j] * sd;
                        bool ok = true;
                        foreach (var cn in corners) { double h = Height(c.x + fx * cn[0] + frx * cn[1], c.z + fz * cn[0] + frz * cn[1]); if (Math.Abs(h - c.y) > 5.5) ok = false; }
                        if (ok && !room(c.x, c.z, Math.Max(w, dpt) * 0.5 + 12)) ok = false;
                        if (ok)
                        {
                            claim(c.x, c.z, Math.Max(w, dpt) * 0.5 + 12);
                            var farm = new TrackProp { type = "farm", s = s, x = c.x, y = c.y, z = c.z, hd = fhd, sd = sd, w = w, dpt = dpt, fx = fx, fz = fz, rx = frx, rz = frz, seed = R.Int(0, 1000000), animal = R.Next() < 0.55 ? "cow" : "sheep" };
                            pr.Add(farm);
                            farms.Add(farm);
                            // barn + farmhouse just outside the far side of the pasture
                            foreach (var (kf, kind) in new[] { (-0.3, "barn"), (0.32, "house") })
                            {
                                double bx = c.x + fx * w * kf + frx * (dpt / 2 + 9), bz = c.z + fz * w * kf + frz * (dpt / 2 + 9);
                                pr.Add(new TrackProp { type = kind, x = bx, y = Height(bx, bz), z = bz, yaw = fhd + (sd > 0 ? -HP : HP), size = R.Range(0.95, 1.2), seed = R.Int(0, 1000000), s = s, collider = true });
                            }
                            j += 40;
                        }
                    }
                }
                if (b.Has("poles") && j % 18 == 0)
                {
                    double d = (W / 2 + 2.2) * (sw[(j * 2 + 1) * 5] > 0.5 ? 1 : -1);
                    var p = PosAt(s, d);
                    pr.Add(new TrackProp { type = "pole", x = p.x, y = p.y, z = p.z, yaw = hd[j], s = s });
                }
                if (b.Has("snowpoles") && j % 12 == 0)
                {
                    for (int sd = -1; sd <= 1; sd += 2)
                    {
                        var p = PosAt(s, sd * (W / 2 + 0.7));
                        if (rail[j * 2 + (sd > 0 ? 1 : 0)] == 0) pr.Add(new TrackProp { type = "snowpole", x = p.x, y = p.y, z = p.z, s = s });
                    }
                }
                if (b.Has("fences") && R.Next() < 0.05)
                {
                    int sd = R.Next() < 0.5 ? -1 : 1;
                    if (sw[(j * 2 + (sd > 0 ? 1 : 0)) * 5 + 2] > 0.5) pr.Add(new TrackProp { type = "fence", s = s, d = sd * (W / 2 + 3.5), len = R.Range(20.0, 60.0) });
                }
                if (b.Has("logs") && R.Next() < 0.025)
                {
                    int sd = R.Next() < 0.5 ? -1 : 1;
                    var p = PosAt(s, sd * (W / 2 + 3));
                    pr.Add(new TrackProp { type = "logs", x = p.x, y = p.y, z = p.z, yaw = hd[j], s = s });
                }
                if (b.Has("ruins") && R.Next() < 0.02)
                {
                    int sd = R.Next() < 0.5 ? -1 : 1;
                    if (sw[(j * 2 + (sd > 0 ? 1 : 0)) * 5 + 1] < 0.6)
                    {
                        var p = PosAt(s, sd * (W / 2 + R.Range(8.0, 14.0)));
                        if (!room(p.x, p.z, 6)) continue;
                        claim(p.x, p.z, 6);
                        pr.Add(new TrackProp { type = R.Next() < 0.35 ? "gasstation" : "shack", x = p.x, y = p.y, z = p.z, yaw = hd[j] + (sd > 0 ? -HP : HP), s = s, collider = true, seed = R.Int(0, 1000000) });
                        j += 60;
                    }
                }
                if (b.Has("waterfalls") && R.Next() < 0.01)
                {
                    int sd = sw[(j * 2 + 1) * 5] > 0.5 ? 1 : -1;
                    pr.Add(new TrackProp { type = "waterfall", s = s, d = sd * (W / 2 + 14), side = sd });
                    j += 150;
                }
            }
            // circuit furniture: grandstands by the start, tyre walls on the outside of slow
            // corners, a start/finish gantry; street circuits get city blocks
            if (loop)
            {
                bool dressed = false, city = false;
                foreach (var b in m.biomes) { if (Truthy(b.circuitDress) || b.Has("grandstands")) dressed = true; if (b.Has("city")) city = true; }
                pr.Add(new TrackProp { type = "gantry", x = px[0], y = py[0], z = pz[0], yaw = hd[0], s = 0, w = width[0], text = "START · FINISH" });
                if (dressed)
                {
                    // the outside of the lap (k > 0 turns towards -d)
                    double ks = 0; for (int j = 0; j < N; j++) ks += k[j];
                    int sd = ks > 0 ? 1 : -1;
                    for (double s = -90; s <= 150; s += 25)
                    {
                        double ss = WrapS(s); int j = JsRoundI(ss / STEP);
                        if (Math.Abs(k[j]) > 1.0 / 300) continue;
                        int[] sides = s > 40 && s < 110 ? new[] { sd, -sd } : new[] { sd };
                        foreach (int side in sides)
                        {
                            double d = side * (width[j] / 2 + 9);
                            var p = PosAt(ss, d);
                            double yaw = hd[j] + (side > 0 ? Math.PI : 0);
                            var c = PosAt(ss, d + side * 4.6);
                            var st = new TrackProp { type = "grandstand", x = p.x, y = Math.Min(p.y, py[j]) - 0.2, z = p.z, yaw = yaw, s = ss };
                            st.col = new WorldCollider { t = "b", x = c.x, y = st.y + 3, z = c.z, hx = 4.8, hy = 3.4, hz = 12, yaw = hd[j], s = ss, heavy = true };
                            pr.Add(st);
                        }
                    }
                }
                // tyre walls where a slow corner would throw you off
                for (int j = 4; j < N - 4; j += 3)
                {
                    double kj = k[j];
                    if (Math.Abs(kj) < 1.0 / 70 || !(dressed || city)) continue;
                    int sd = kj > 0 ? 1 : -1; // outside of the corner
                    double W = width[j];
                    double d = sd * (W / 2 + (city ? 1.6 : 6.5));
                    var p = PosAt(j * STEP, d);
                    pr.Add(new TrackProp { type = "tyres", x = p.x, y = p.y, z = p.z, yaw = hd[j], s = j * STEP, col2 = new WorldCollider { t = "b", x = p.x, y = p.y + 0.4, z = p.z, hx = 0.5, hy = 0.45, hz = 1.6, yaw = hd[j], s = j * STEP, heavy = true } });
                }
                // city: blocks of flats along both sides, set back behind the pavement
                if (city)
                {
                    for (int j = 6; j < N - 6; j += 9)
                    {
                        for (int side = -1; side <= 1; side += 2)
                        {
                            if (R.Next() < 0.18) continue;
                            double W = width[j];
                            double dep = R.Range(10.0, 18.0), wid = R.Range(10.0, 17.0), hgt = R.Range(9.0, 30.0) * (R.Next() < 0.15 ? 2 : 1);
                            double d = side * (W / 2 + 5 + dep / 2);
                            var p = PosAt(j * STEP, d);
                            double fr = JsHypot(dep, wid) * 0.5;
                            if (!BlockFree(p.x, p.z, Math.Max(dep, wid) * 0.5 + 2) || !room(p.x, p.z, fr * 0.8)) continue;
                            claim(p.x, p.z, fr * 0.8);
                            var blk = new TrackProp { type = "block", x = p.x, y = Math.Min(p.y, py[j]) - 0.5, z = p.z, yaw = hd[j], s = j * STEP, w = wid, dep = dep, h = hgt, tint = R.Next() };
                            blk.col = new WorldCollider { t = "b", x = p.x, y = blk.y + hgt / 2, z = p.z, hx = dep / 2, hy = hgt / 2, hz = wid / 2, yaw = hd[j], s = j * STEP, heavy = true };
                            pr.Add(blk);
                        }
                    }
                }
            }
            bool finish = false;
            foreach (var b in m.biomes) if (b.Has("finish")) finish = true;
            if (!loop && m.kind == "sprint")
            {
                foreach (var (ss, text) in new[] { (60.0, "START"), (length - 1, "FINISH") })
                {
                    int j = Math.Min(N - 1, JsRoundI(ss / STEP));
                    pr.Add(new TrackProp { type = "gantry", x = px[j], y = py[j], z = pz[j], yaw = hd[j], s = ss, w = width[j], text = text });
                }
            }
            else if (finish)
            {
                var p = PosAt(length, 0);
                pr.Add(new TrackProp { type = "finish", x = p.x, y = p.y, z = p.z, yaw = hd[JsRoundI(length / STEP)], s = length });
            }
            // gas station ruins always carry fuel by the pumps
            foreach (var p in pr) if (p.type == "gasstation")
            {
                int j = JsRoundI(p.s / STEP); int sd = DOf(p.x, p.z) > 0 ? 1 : -1;
                var q = PosAt(p.s, sd * (width[j] / 2 + 4));
                pickups.Add(new TrackPickup { type = "fuel", s = p.s, d = sd * (width[j] / 2 + 4), x = q.x, y = q.y, z = q.z });
            }
            StableSortByS(pickups);
            // static colliders: obstacles + buildings (box approximations)
            colliders = new List<WorldCollider>();
            foreach (var o in obstacles) foreach (var c in o.colliders) { var cc = c.Clone(); cc.s = o.s; cc.@ref = o; colliders.Add(cc); }
            foreach (var p in pr) { if (p.type == "grandstand" || p.type == "block") colliders.Add(p.col); else if (p.type == "tyres") colliders.Add(p.col2); }
            foreach (var p in pr) if (p.collider)
            {
                double sz = Truthy(p.size) ? p.size : 1;
                double[] dims = p.type == "barn" ? new[] { 4.5, 3.5, 6 } : p.type == "chapel" ? new[] { 3.5, 4, 6.0 } : p.type == "gasstation" ? new[] { 3.5, 2.2, 4.5 } : p.type == "shack" ? new[] { 2.5, 2, 3.0 } : new[] { 3.5, 3, 4.5 };
                p.col = new WorldCollider { t = "b", x = p.x, y = p.y + dims[1] * sz, z = p.z, hx = dims[0] * sz, hy = dims[1] * sz, hz = dims[2] * sz, yaw = p.yaw, s = p.s, heavy = true };
                colliders.Add(p.col);
            }
            colB = new Dictionary<int, List<WorldCollider>>();
            foreach (var c in colliders)
            {
                int q = (int)Math.Floor(c.s / 20);
                for (int e = q - 1; e <= q + 1; e++) { if (!colB.TryGetValue(e, out var l)) colB[e] = l = new List<WorldCollider>(); l.Add(c); }
            }
        }

        // true when nothing of the road is within r of (x, z)
        public bool BlockFree(double x, double z, double r)
        {
            var q = Query(x, z, _bf ?? (_bf = new TrackQuery()));
            return Math.Abs(q.d) > q.halfW + r + 1.5;
        }

        // ------------------------------------------------------------------ queries
        public TrackPos PosAt(double s, double d = 0)
        {
            if (loop) s = WrapS(s);
            double f = U.Clamp(s / STEP, 0, N - 1.001);
            int a = (int)Math.Floor(f); double t = f - a;
            double x = U.Lerp(px[a], px[a + 1], t), z = U.Lerp(pz[a], pz[a + 1], t);
            double rxa = U.Lerp(rx[a], rx[a + 1], t), rza = U.Lerp(rz[a], rz[a + 1], t);
            double wx = x + rxa * d, wz = z + rza * d;
            return new TrackPos { x = wx, z = wz, y = Height(wx, wz), ry = U.Lerp(py[a], py[a + 1], t), hd = U.Lerp(hd[a], hd[a + 1], t) };
        }
        public double RoadY(double s)
        {
            if (loop) s = WrapS(s);
            double f = U.Clamp(s / STEP, 0, N - 1.001);
            int a = (int)Math.Floor(f);
            return U.Lerp(py[a], py[a + 1], f - a);
        }
        public double DOf(double x, double z) => Query(x, z).d;
        public double Height(double x, double z) => Query(x, z).h;

        // Core terrain query. Blends the profiles of every road "leg" within reach so
        // switchbacks share smooth terrain between them. Without `o` the result lives in a
        // shared object that the next call overwrites (as in the JS).
        public TrackQuery Query(double x, double z, TrackQuery o = null, bool wantSurf = false)
        {
            if (o == null) o = _out ?? (_out = new TrackQuery());
            long cx = (long)Math.Floor(x / CELL), cz = (long)Math.Floor(z / CELL);
            var legI = _legI; var legD = _legD;
            int nl = 0;
            for (int dz = -2; dz <= 2; dz++) for (int dx = -2; dx <= 2; dx++)
            {
                if (!cells.TryGetValue(Key(cx + dx, cz + dz), out var a)) continue;
                for (int n = 0; n < a.Count; n++)
                {
                    int q = a[n];
                    double ex = px[q] - x, ez = pz[q] - z;
                    double d2 = ex * ex + ez * ez;
                    if (d2 > 40000) continue;
                    bool found = false;
                    for (int l = 0; l < nl; l++)
                    {
                        if (Math.Abs(legI[l] - q) < 48)
                        {
                            if (d2 < legD[l]) { legD[l] = d2; legI[l] = q; }
                            found = true; break;
                        }
                    }
                    if (!found && nl < 6) { legI[nl] = q; legD[nl] = d2; nl++; }
                }
            }
            if (nl == 0)
            {
                o.h = loop ? baseH - 1.5 + noise.Fbm(x * 0.006, z * 0.006, 3) * 6 : py[N - 1] - 200; o.s = 0; o.d = 999; o.idx = 0; o.surf = SURF.GRASS; o.halfW = 4; o.dist = 999;
                return o;
            }
            double wsum = 0, hsum = 0, best = 1e18;
            for (int l = 0; l < nl; l++)
            {
                // refine around the coarse hit
                int bi = legI[l]; double bd = 1e18;
                int lo = Math.Max(0, legI[l] - COARSE), hi = Math.Min(N - 1, legI[l] + COARSE);
                for (int q = lo; q <= hi; q++)
                {
                    double ex = px[q] - x, ez = pz[q] - z;
                    double d2 = ex * ex + ez * ez;
                    if (d2 < bd) { bd = d2; bi = q; }
                }
                // project onto the adjacent segment
                double f = bi;
                for (int sa = bi - 1; sa <= bi; sa++)
                {
                    if (sa < 0 || sa >= N - 1) continue;
                    double ax = px[sa], az = pz[sa];
                    double sx = px[sa + 1] - ax, sz = pz[sa + 1] - az;
                    double tt = U.Clamp(((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz), 0, 1);
                    double qx = ax + sx * tt - x, qz = az + sz * tt - z;
                    double d2 = qx * qx + qz * qz;
                    if (d2 <= bd + 1e-9) { bd = d2; f = sa + tt; }
                }
                int ai = Math.Min(N - 2, (int)Math.Floor(f)); double t = f - ai;
                double rxa = U.Lerp(rx[ai], rx[ai + 1], t), rza = U.Lerp(rz[ai], rz[ai + 1], t);
                double cxp = U.Lerp(px[ai], px[ai + 1], t), czp = U.Lerp(pz[ai], pz[ai + 1], t);
                double d = (x - cxp) * rxa + (z - czp) * rza;
                double h = Profile(ai, t, d, x, z);
                double dist = Math.Sqrt(bd);
                double w = 1 / (dist * dist * dist * dist + 1);
                wsum += w; hsum += w * h;
                if (bd < best)
                {
                    best = bd;
                    o.s = f * STEP; o.d = d; o.idx = ai; o.dist = dist; o.hLeg = h;
                }
            }
            o.h = hsum / wsum;
            int ia = o.idx;
            o.halfW = width[ia] * 0.5;
            if (wantSurf) o.surf = SurfaceAt(o.s, o.d, ia);
            return o;
        }

        public double Profile(int a, double t, double d, double x, double z)
        {
            double y = U.Lerp(py[a], py[a + 1], t);
            double halfW = U.Lerp(width[a], width[a + 1], t) * 0.5;
            double ad = Math.Abs(d);
            if (ad <= halfW)
            {
                double hr = y - 0.012 * ad;
                // potholes
                if (potB.TryGetValue((int)Math.Floor((a + t) * STEP / 20), out var pl))
                {
                    double s = (a + t) * STEP;
                    for (int n = 0; n < pl.Count; n++)
                    {
                        var p = pl[n];
                        double ds = s - p.s, dd = d - p.d;
                        double q = (ds * ds + dd * dd) / (p.r * p.r);
                        if (q < 1) hr -= p.depth * (1 - q);
                    }
                }
                return hr;
            }
            if (ad <= halfW + SHOULDER) return y - 0.012 * halfW - 0.07 * (ad - halfW);
            int side = d >= 0 ? 1 : 0;
            int o = (a * 2 + side) * 5, o2 = o + 10;
            double u = ad - halfW - SHOULDER;
            var sw = this.sw;
            double wW = U.Lerp(sw[o], sw[o2], t), wD = U.Lerp(sw[o + 1], sw[o2 + 1], t), wF = U.Lerp(sw[o + 2], sw[o2 + 2], t);
            double wC = U.Lerp(sw[o + 3], sw[o2 + 3], t), wV = U.Lerp(sw[o + 4], sw[o2 + 4], t);
            double h = 0;
            if (wW > 0.001)
            {
                double slw = U.Lerp(slW[a * 2 + side], slW[a * 2 + 2 + side], t);
                double ditch = -0.3 * Math.Exp(-(u - 0.8) * (u - 0.8) * 2) * U.Smoothstep(0, 0.4, u);
                double rise = slw * Math.Pow(Math.Max(0, u - 1.1), 1.2);
                double crag = slw > 1.5 ? (noise.Ridge(x * 0.07, z * 0.07, 2) - 0.5) * slw * 2.4 * U.Smoothstep(2, 9, u) : 0;
                h += wW * (ditch + rise + crag);
            }
            if (wD > 0.001)
            {
                double sld = U.Lerp(slD[a * 2 + side], slD[a * 2 + 2 + side], t);
                h += wD * (-sld * u * (1 + u * 0.004) - (sld > 1.8 ? U.Smoothstep(4, 14, u) * 25 : 0));
            }
            if (wF > 0.001) h += wF * (-0.05 * u);
            if (wC > 0.001) h += wC * (-U.Lerp(cutSl[a * 2 + side], cutSl[a * 2 + 2 + side], t) * u);
            if (wV > 0.001) h += wV * -Math.Min(48, u * u * 3 + u * 5);
            // natural irregularity, faded in away from the road edge
            double fade = U.Smoothstep(0.5, 7, u);
            if (fade > 0) h += fade * (noise.Fbm(x * 0.018, z * 0.018, 3) * 3.2 + noise.N2(x * 0.11, z * 0.11) * 0.35) * (1 - wV);
            return y - 0.012 * halfW - 0.07 * SHOULDER + h;
        }

        public int SurfaceAt(double s, double d, int a)
        {
            double halfW = width[a] * 0.5;
            double ad = Math.Abs(d);
            if (ad <= halfW + 0.15)
            {
                if (decalB.TryGetValue((int)Math.Floor(s / 20), out var dl)) for (int n = 0; n < dl.Count; n++)
                {
                    var q = dl[n];
                    if (s >= q.s0 && s <= q.s1 && d >= q.d0 && d <= q.d1) return q.type;
                }
                return surf[a];
            }
            if (bridge[a] != 0 && ad < halfW + 0.6) return SURF.CONCRETE;
            if (ad <= halfW + SHOULDER)
            {
                if (decalB.TryGetValue((int)Math.Floor(s / 20), out var dl)) for (int n = 0; n < dl.Count; n++)
                {
                    var q = dl[n];
                    if (s >= q.s0 && s <= q.s1 && d >= q.d0 && d <= q.d1) return q.type;
                }
                return offSurf[a] == SURF.SNOW ? SURF.SNOW : SURF.GRAVEL;
            }
            int side = d >= 0 ? 1 : 0;
            int o = (a * 2 + side) * 5;
            if (sw[o + 3] > 0.5) return offSurf[a] == SURF.SNOW ? SURF.SNOW : SURF.DIRT;
            if (sw[o] > 0.6 && slW[a * 2 + side] > 1.2 && ad > halfW + 3) return offSurf[a] == SURF.SNOW ? SURF.SNOW : SURF.ROCK;
            return offSurf[a];
        }

        public int RailAt(int idx, int side)
        {
            int kk = idx * 2 + side;
            return railBroken[kk] != 0 ? 0 : rail[kk];
        }
        public double RailBreakSpeed(int type) => type >= 0 && type < RAIL_BREAK.Length && Truthy(RAIL_BREAK[type]) ? RAIL_BREAK[type] : 999;
        public void BreakRail(int idx, int side)
        {
            for (int q = idx - 2; q <= idx + 2; q++) if (q >= 0 && q < N) railBroken[q * 2 + side] = 1;
        }
        public void ResetRun() { railBroken.Fill(0); }

        public List<WorldCollider> CollidersNear(double s) => colB.TryGetValue((int)Math.Floor(s / 20), out var l) ? l : EMPTY;

        static void SmoothArr(F32Array a, int radius)
        {
            int n = a.Length; var tmp = new F32Array(n);
            double acc = 0; int cnt = 0;
            for (int i = 0; i < Math.Min(n, radius); i++) { acc += a[i]; cnt++; }
            for (int i = 0; i < n; i++)
            {
                int add = i + radius, rem = i - radius - 1;
                if (add < n) { acc += a[add]; cnt++; }
                if (rem >= 0) { acc -= a[rem]; cnt--; }
                tmp[i] = acc / cnt;
            }
            a.Set(tmp);
        }

        // ---------------------------------------------------------------- circuit helpers
        static double TurnK(double[] a, double[] b, double[] c)
        {
            double ax = b[0] - a[0], az = b[1] - a[1], cx = c[0] - b[0], cz = c[1] - b[1];
            double la = JsHypot(ax, az), lc = JsHypot(cx, cz);
            if (la == 0) la = 1; if (lc == 0) lc = 1;
            double cr = (ax * cz - az * cx) / (la * lc), dt = (ax * cx + az * cz) / (la * lc);
            return Math.Abs(Math.Atan2(cr, dt)) / ((la + lc) / 2);
        }

        static List<double[]> CatmullClosed(List<double[]> P, int sub)
        {
            int n = P.Count; var o = new List<double[]>(n * sub);
            for (int i = 0; i < n; i++)
            {
                double[] p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
                for (int kk = 0; kk < sub; kk++)
                {
                    double t = (double)kk / sub, t2 = t * t, t3 = t2 * t;
                    var v = new double[2];
                    for (int c = 0; c < 2; c++)
                        v[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
                    o.Add(v);
                }
            }
            return o;
        }

        static List<double[]> ResampleClosed(List<double[]> P, double step)
        {
            int n = P.Count;
            var cum = new List<double>(n + 1) { 0 };
            for (int i = 1; i <= n; i++) cum.Add(cum[i - 1] + JsHypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
            double L = cum[n];
            int mm = (int)Math.Max(8, JsRound(L / step));
            var o = new List<double[]>(mm);
            int j = 0;
            for (int i = 0; i < mm; i++)
            {
                double s = ((double)i / mm) * L;
                while (cum[j + 1] < s) j++;
                double t = (s - cum[j]) / Math.Max(1e-6, cum[j + 1] - cum[j]);
                double[] a = P[j], b = P[(j + 1) % n];
                o.Add(new[] { a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t });
            }
            return o;
        }

        static bool LoopClear(List<double[]> P, double minD)
        {
            int n = P.Count; const double cell = 40; var g = new Dictionary<long, List<int>>();
            for (int i = 0; i < n; i++)
            {
                var p = P[i];
                long kk = Key((long)Math.Floor(p[0] / cell), (long)Math.Floor(p[1] / cell));
                if (!g.TryGetValue(kk, out var a)) g[kk] = a = new List<int>();
                a.Add(i);
            }
            for (int i = 0; i < n; i += 2)
            {
                var p = P[i]; long cx = (long)Math.Floor(p[0] / cell), cz = (long)Math.Floor(p[1] / cell);
                for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++)
                {
                    if (!g.TryGetValue(Key(cx + dx, cz + dz), out var a)) continue;
                    foreach (int j in a)
                    {
                        int sep = Math.Min(Math.Abs(i - j), n - Math.Abs(i - j));
                        if (sep < 45) continue;
                        if (JsHypot(P[j][0] - p[0], P[j][1] - p[1]) < minD) return false;
                    }
                }
            }
            return true;
        }

        // Control polygons for the different kinds of circuit.
        static List<double[]> LoopShape(string shape, double size, Rng R)
        {
            var pts = new List<double[]>();
            if (shape == "oval")
            {
                const int n = 8;
                for (int i = 0; i < n; i++)
                {
                    double a = ((double)i / n) * 6.2832;
                    double x = Math.Sin(a) * size * 0.45 * (1 + 0.08 * (R.Next() - 0.5));
                    pts.Add(new[] { x, Math.Cos(a) * size * (1.15 + 0.1 * (R.Next() - 0.5)) });
                }
                return pts;
            }
            if (shape == "street")
            {
                // city blocks: a rectilinear outline with a few notches
                double w = size * (0.9 + R.Next() * 0.4), h = size * (0.6 + R.Next() * 0.4);
                var raw = new List<double[]>();
                raw.Add(new[] { -w, -h });
                { double x = w * (0.2 + R.Next() * 0.3); raw.Add(new[] { x, -h }); }
                { double x = w * (0.2 + R.Next() * 0.3); double z = -h * (0.4 + R.Next() * 0.3); raw.Add(new[] { x, z }); }
                { double z = -h * (0.4 + R.Next() * 0.3); raw.Add(new[] { w, z }); }
                raw.Add(new[] { w, h });
                { double x = w * (R.Next() * 0.3); raw.Add(new[] { x, h }); }
                { double x = w * (R.Next() * 0.3); double z = h * (0.3 + R.Next() * 0.3); raw.Add(new[] { x, z }); }
                { double x = -w * (0.4 + R.Next() * 0.3); double z = h * (0.3 + R.Next() * 0.3); raw.Add(new[] { x, z }); }
                { double x = -w * (0.4 + R.Next() * 0.3); raw.Add(new[] { x, h }); }
                raw.Add(new[] { -w, h });
                // densify the straight edges so the spline keeps them straight with sharp-ish corners
                for (int i = 0; i < raw.Count; i++)
                {
                    double[] a = raw[i], b = raw[(i + 1) % raw.Count];
                    pts.Add(a);
                    pts.Add(new[] { a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15 });
                    pts.Add(new[] { a[0] + (b[0] - a[0]) * 0.85, a[1] + (b[1] - a[1]) * 0.85 });
                }
                return pts;
            }
            int np = shape == "twisty" ? 16 + (int)Math.Floor(R.Next() * 6) : 11 + (int)Math.Floor(R.Next() * 5);
            double ax = 1.4 + R.Next() * 0.6;
            for (int i = 0; i < np; i++)
            {
                double a = ((double)i / np) * 6.2832 + (R.Next() - 0.5) * (2.4 / np);
                double r = size * (shape == "twisty" ? 0.5 + R.Next() * 0.5 : 0.62 + R.Next() * 0.38);
                if (shape == "gp" && R.Next() < 0.18) r *= 0.42;           // a hairpin pulled into the infield
                pts.Add(new[] { Math.Sin(a) * r * ax, Math.Cos(a) * r });
            }
            if (shape == "gp")
            {
                // one long main straight: flatten the two points either side of the start
                int i0 = (int)Math.Floor(R.Next() * np), i1 = (i0 + 1) % np;
                var mid = new[] { (pts[i0][0] + pts[i1][0]) / 2, (pts[i0][1] + pts[i1][1]) / 2 };
                pts.Insert(i1, mid);
            }
            return pts;
        }
    }
}

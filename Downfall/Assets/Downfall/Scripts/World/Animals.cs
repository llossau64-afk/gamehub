// Port of src/world/animals.js. Wildlife and farm animals along the road. Animals graze,
// wander and sometimes bolt across the road when a car approaches. They are breakable
// colliders (`cols`, give them to vehicle.animalCols): hitting one knocks it away.
// Simulation in game coordinates; the GameObjects are placed through Coord.
using System;
using System.Collections.Generic;
using UnityEngine;
using Random = UnityEngine.Random;

namespace Downfall
{
    public sealed class Species
    {
        public double r, y, slow, dmg, walk, run, bolt, step;
        public int h0, h1;
        public Species Clone() => (Species)MemberwiseClone();
    }

    public sealed class Animal
    {
        public string kind, state;
        public Species sp;
        public GameObject obj;
        public double x, y, z, hd, speed, t, phase, s, target, targetS, vx, vy, vz;
        public int side;
        public bool dead;
        public TrackProp pen;
        public WorldCollider col;
        public double rx, ry, rz;     // game-space Euler XYZ of the object (JS obj.rotation)
        public Vector3 spin;
        // legs (procedural animation) or the fox's animator
        public readonly List<(Transform tr, Quaternion rest, bool front, bool left)> legs = new List<(Transform, Quaternion, bool, bool)>();
        public Animator anim;
        public string cur = "idle";
    }

    public sealed class Animals
    {
        static readonly Dictionary<string, Species> SPECIES = new Dictionary<string, Species>
        {
            { "deer", new Species { r = 0.55, y = 0.95, slow = 0.07, dmg = 0.06, walk = 1.2, run = 9, h0 = 1, h1 = 3, bolt = 0.55, step = 2.4 } },
            { "cow", new Species { r = 0.8, y = 0.95, slow = 0.22, dmg = 0.16, walk = 0.7, run = 3.5, h0 = 3, h1 = 6, bolt = 0.05, step = 1.4 } },
            { "sheep", new Species { r = 0.5, y = 0.55, slow = 0.05, dmg = 0.04, walk = 0.6, run = 4.5, h0 = 4, h1 = 8, bolt = 0.15, step = 2.6 } },
            { "boar", new Species { r = 0.5, y = 0.5, slow = 0.08, dmg = 0.07, walk = 0.9, run = 7, h0 = 1, h1 = 4, bolt = 0.45, step = 2.8 } },
            { "ibex", new Species { r = 0.5, y = 0.7, slow = 0.06, dmg = 0.05, walk = 0.8, run = 6, h0 = 2, h1 = 4, bolt = 0.3, step = 2.4 } },
            { "fox", new Species { r = 0.32, y = 0.3, slow = 0.01, dmg = 0.0, walk = 1.0, run = 8, h0 = 1, h1 = 1, bolt = 0.6, step = 0 } },
        };

        static (string, double)[] H(params (string, double)[] a) => a;
        static readonly Dictionary<string, (string, double)[]> HABITAT = new Dictionary<string, (string, double)[]>
        {
            { "village", H(("cow", 3), ("sheep", 3), ("deer", 1), ("fox", 1)) },
            { "lower", H(("cow", 2), ("sheep", 2), ("deer", 2), ("fox", 1)) },
            { "bottom", H(("cow", 2), ("sheep", 2), ("fox", 1)) },
            { "forest", H(("deer", 4), ("boar", 3), ("fox", 2)) },
            { "rocky", H(("ibex", 4), ("deer", 1), ("fox", 1)) },
            { "snow", H(("ibex", 3), ("fox", 1)) },
            { "highway", H(("deer", 2), ("boar", 2), ("fox", 2)) },
            { "cliffs", H(("ibex", 4), ("fox", 1)) },
            { "mesa", H(("cow", 2), ("fox", 2)) },
            { "redwall", H(("ibex", 2), ("fox", 2)) },
            { "dryhwy", H(("boar", 2), ("fox", 2), ("cow", 1)) },
            { "gorge", H(("ibex", 3), ("fox", 1)) },
        };

        static readonly Dictionary<string, string> NAMES = new Dictionary<string, string>
        { { "deer", "DEER" }, { "cow", "COW" }, { "sheep", "SHEEP" }, { "boar", "BOAR" }, { "ibex", "IBEX" }, { "fox", "FOX" } };

        public readonly Track track;
        public readonly List<Animal> list = new List<Animal>();
        public readonly List<WorldCollider> cols = new List<WorldCollider>();
        public double nextSpawn;
        public readonly GameObject root;
        /// <summary>ui.feed(text, amount) hook ("DEER HIT").</summary>
        public Action<string, double> feed;
        readonly TrackQuery tmp = new TrackQuery();

        public Animals(Track track, Transform parent = null)
        {
            this.track = track;
            root = new GameObject("animals");
            if (parent) root.transform.SetParent(parent, false);
        }

        public void Reset(double s0)
        {
            Clear();
            if (track.farms != null) foreach (var f in track.farms) f.spawned = false;
            nextSpawn = s0 + 80;
        }

        public void Clear()
        {
            foreach (var a in list) if (a.obj) UnityEngine.Object.Destroy(a.obj);
            list.Clear();
            cols.Clear();
        }

        public void Dispose() { Clear(); if (root) UnityEngine.Object.Destroy(root); }

        string PickSpecies(string biomeId, double R)
        {
            if (!HABITAT.TryGetValue(biomeId ?? "", out var h)) h = HABITAT["forest"];
            double sum = 0;
            foreach (var e in h) sum += e.Item2;
            double r = R * sum;
            foreach (var e in h) if ((r -= e.Item2) <= 0) return e.Item1;
            return h[0].Item1;
        }

        static Mesh boxMesh;
        // simple stand-in when the prefab is missing: a body box and four pivoting legs
        GameObject Primitive(string kind, Species sp, Animal a)
        {
            if (!boxMesh) boxMesh = Geo.Box(1, 1, 1).ToMesh("animalBox");
            var mat = WorldMats.Solid("animal_" + kind, kind == "sheep" ? 0xd8d2c4 : kind == "cow" ? 0x5a4636 : kind == "fox" ? 0xb8642a : 0x7a6248, 0.9f);
            var o = new GameObject(kind);
            float L = (float)(sp.r * 2.6), W = (float)(sp.r * 1.1), Hh = (float)(sp.y * 0.55), legH = (float)(sp.y * 0.6);
            GameObject Box(Transform p, Vector3 pos, Vector3 size)
            {
                var b = new GameObject("box");
                b.transform.SetParent(p, false);
                b.transform.localPosition = pos; b.transform.localScale = size;
                b.AddComponent<MeshFilter>().sharedMesh = boxMesh;
                b.AddComponent<MeshRenderer>().sharedMaterial = mat;
                return b;
            }
            Box(o.transform, new Vector3(0, legH + Hh / 2, 0), new Vector3(W, Hh, L));
            Box(o.transform, new Vector3(0, legH + Hh, L * 0.55f), new Vector3(W * 0.6f, Hh * 0.7f, L * 0.3f));
            foreach (bool front in new[] { true, false })
                foreach (bool left in new[] { true, false })
                {
                    var pivot = new GameObject("leg");
                    pivot.transform.SetParent(o.transform, false);
                    pivot.transform.localPosition = new Vector3((left ? 1 : -1) * W * 0.35f, legH, (front ? 1 : -1) * L * 0.38f);
                    Box(pivot.transform, new Vector3(0, -legH / 2, 0), new Vector3(W * 0.18f, legH, W * 0.18f));
                    a.legs.Add((pivot.transform, Quaternion.identity, front, left));
                }
            return o;
        }

        GameObject MakeObject(string kind, Animal a)
        {
            var sp = SPECIES[kind];
            var o = Mats.Spawn(kind, root.transform);
            if (!o) { o = Primitive(kind, sp, a); o.transform.SetParent(root.transform, false); return o; }
            if (kind == "fox")
            {
                a.anim = o.GetComponentInChildren<Animator>();
                foreach (var r in o.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                return o;
            }
            foreach (var t in o.GetComponentsInChildren<Transform>(true))
            {
                string n = t.name;
                int k = n.LastIndexOf("__leg", StringComparison.Ordinal);
                if (k < 0) continue;
                string suf = n.Substring(k + 5);
                if (suf != "FL" && suf != "FR" && suf != "RL" && suf != "RR") continue;
                a.legs.Add((t, t.localRotation, suf[0] == 'F', suf[1] == 'L'));
            }
            return o;
        }

        void Place(Animal a)
        {
            a.obj.transform.position = Coord.ToUnity(a.x, a.y, a.z);
            a.obj.transform.rotation = Coord.ToUnity(G.Euler(a.rx, a.ry, a.rz));
        }

        void SpawnGroup(double s)
        {
            var t = track;
            var b = t.Biome(s);
            string kind = PickSpecies(b.animals != null ? b.animals.Replace("race-", "") : b.id, Random.value);
            var sp = SPECIES[kind];
            int n = sp.h0 + (int)Math.Floor(Random.value * (sp.h1 - sp.h0 + 1));
            int side = Random.value < 0.5 ? -1 : 1;
            bool farm = kind == "cow" || kind == "sheep";
            double dist = farm ? 12 + Random.value * 30 : 6 + Random.value * 28;
            for (int i = 0; i < n; i++)
            {
                double ss = s + (Random.value - 0.5) * (farm ? 30 : 14);
                int j = Math.Min(t.N - 1, Math.Max(0, Track.JsRoundI(t.WrapS(ss) / Track.STEP)));
                if (t.tunnel[j] != 0 || t.bridge[j] != 0) continue;
                double d = side * (t.width[j] / 2 + dist + (Random.value - 0.5) * (farm ? 16 : 6));
                var p = t.PosAt(ss, d);
                double h = t.Height(p.x, p.z);
                if (Math.Abs(t.Height(p.x + 1, p.z) - h) > 0.9 || Math.Abs(h - p.y) > 6) continue;
                var a = new Animal { kind = kind, sp = sp, x = p.x, z = p.z, y = h, hd = Random.value * Math.PI * 2, state = "graze", t = Random.value * 4, phase = Random.value * 6, s = ss, side = side };
                a.obj = MakeObject(kind, a);
                if (!a.obj) continue;
                a.col = new WorldCollider { t = "s", x = a.x, y = h + sp.y, z = a.z, r = sp.r, s = ss, brk = 1.2, slow = sp.slow, dmg = sp.dmg, animal = a, kind = "animal" };
                a.ry = a.hd;
                Place(a);
                list.Add(a);
                cols.Add(a.col);
            }
        }

        /// <summary>Hit at speed: the animal is gone (the game plays the explosion).</summary>
        public void Explode(WorldCollider o)
        {
            if (!(o.animal is Animal a) || a.dead) return;
            a.dead = true;
            cols.Remove(a.col);
            if (a.obj) UnityEngine.Object.Destroy(a.obj);
            list.Remove(a);
        }

        /// <summary>The car smashed into an animal: send it flying.</summary>
        public void Hit(WorldCollider o, VehicleEvent e)
        {
            if (!(o.animal is Animal a) || a.dead) return;
            a.dead = true;
            a.state = "tumble";
            double k = 0.55 + Random.value * 0.2;
            a.vx = e.vx * k + (Random.value - 0.5) * 3; a.vz = e.vz * k + (Random.value - 0.5) * 3;
            a.vy = 3 + Math.Min(9, Track.JsHypot(e.vx, e.vz) * 0.12);
            a.spin = new Vector3((Random.value - 0.5f) * 9, (Random.value - 0.5f) * 6, (Random.value - 0.5f) * 9);
            a.t = 0;
            cols.Remove(a.col);
            feed?.Invoke(NAMES[a.kind] + " HIT", 0);
        }

        void SpawnFarm(TrackProp f)
        {
            var t = track;
            if (!SPECIES.TryGetValue(f.animal ?? "cow", out var sp0)) return;
            var sp = sp0.Clone(); sp.bolt = 0;
            int n = 4 + (int)Math.Floor(Random.value * 5);
            for (int i = 0; i < n; i++)
            {
                double a2 = (Random.value - 0.5) * (f.w - 4), b2 = (Random.value - 0.5) * (f.dpt - 4);
                double x = f.x + f.fx * a2 + f.rx * b2, z = f.z + f.fz * a2 + f.rz * b2;
                var a = new Animal { kind = f.animal, sp = sp, x = x, z = z, hd = Random.value * 6.28, state = "graze", t = Random.value * 5, phase = Random.value * 6, s = f.s, pen = f };
                a.obj = MakeObject(f.animal, a);
                if (!a.obj) continue;
                double h = t.Height(x, z);
                a.y = h;
                a.col = new WorldCollider { t = "s", x = x, y = h + sp.y, z = z, r = sp.r, s = f.s, brk = 1.2, slow = sp.slow, dmg = sp.dmg, animal = a, kind = "animal" };
                Place(a);
                list.Add(a);
                cols.Add(a.col);
            }
        }

        void Remove(int i)
        {
            var a = list[i];
            if (a.obj) UnityEngine.Object.Destroy(a.obj);
            list.RemoveAt(i);
            cols.Remove(a.col);
        }

        public void Update(float dt, Vehicle v, double sProg) => Update(dt, v.pos.x, v.pos.z, v.speed, sProg);

        public void Update(float dt, double cx, double cz, double carSpeed, double sProg)
        {
            var t = track;
            if (t.farms != null)
                foreach (var f in t.farms)
                {
                    if (!f.spawned && f.s > sProg + 60 && f.s < sProg + 420) { f.spawned = true; SpawnFarm(f); }
                    if (f.spawned && f.s < sProg - 200) f.spawned = false;
                }
            while (nextSpawn < sProg + 420)
            {
                if (nextSpawn > sProg + 120) SpawnGroup(nextSpawn);
                nextSpawn += 110 + Random.value * 170;
            }
            for (int i = list.Count - 1; i >= 0; i--)
            {
                var a = list[i];
                if (a.s < sProg - 140) { Remove(i); continue; }
                a.t += dt;
                if (a.state == "tumble")
                {
                    a.vy -= 9.8 * dt;
                    a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
                    a.rx += a.spin.x * dt; a.rz += a.spin.z * dt; a.ry += a.spin.y * dt;
                    double h = t.Height(a.x, a.z);
                    if (a.y < h + 0.2 && a.vy < 0)
                    {
                        a.y = h + 0.2; a.vy *= -0.25; a.vx *= 0.6; a.vz *= 0.6; a.spin *= 0.5f;
                        if (Track.JsHypot(a.vx, a.vz) < 0.6 && a.t > 1)
                        {
                            a.state = "down";
                            a.rx = 0; a.rz = Math.PI / 2 * (Random.value < 0.5 ? 1 : -1);
                            a.y = h + a.sp.r * 0.6;
                        }
                    }
                    Place(a);
                    Legs(a, 0, dt);
                    continue;
                }
                if (a.state == "down") { if (a.t > 25) { if (a.obj) UnityEngine.Object.Destroy(a.obj); list.RemoveAt(i); } continue; }
                double dx = cx - a.x, dz = cz - a.z, dCar = Track.JsHypot(dx, dz);
                var q = t.Query(a.x, a.z, tmp);
                if (a.state != "flee" && dCar < 35 + carSpeed * 1.2 && carSpeed > 4)
                {
                    if (Random.value < a.sp.bolt && Math.Abs(q.d) < q.halfW + 30)
                    {
                        a.state = "flee";
                        a.target = -Math.Sign(q.d != 0 ? q.d : 1) * (q.halfW + 12 + Random.value * 10);
                        a.targetS = q.s + (Random.value - 0.5) * 10;
                    }
                    else a.state = "alert";
                    a.t = 0;
                }
                double want = 0;
                if (a.state == "graze" || a.state == "alert")
                {
                    if (a.state == "graze" && a.t > 3 + Random.value * 6) { a.state = "walk"; a.t = 0; a.hd += (Random.value - 0.5) * 2; }
                    if (a.state == "alert") { a.hd = Math.Atan2(dx, dz) * 0.15 + a.hd * 0.85; if (a.t > 4) { a.state = "graze"; a.t = 0; } }
                }
                else if (a.state == "walk")
                {
                    want = a.sp.walk;
                    if (Math.Abs(q.d) < q.halfW + 3) a.hd += Math.Sign(q.d != 0 ? q.d : 1) * 0.6 * dt * 3;
                    if (a.t > 2 + Random.value * 5) { a.state = "graze"; a.t = 0; }
                }
                else if (a.state == "flee")
                {
                    want = a.sp.run;
                    var tp = t.PosAt(a.targetS, a.target);
                    double wantHd = Math.Atan2(tp.x - a.x, tp.z - a.z);
                    double dh = wantHd - a.hd; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
                    a.hd += dh * Math.Min(1, dt * 4);
                    if (Track.JsHypot(tp.x - a.x, tp.z - a.z) < 2 || a.t > 8) { a.state = "graze"; a.t = 0; }
                }
                a.speed += (want - a.speed) * Math.Min(1, dt * 3);
                a.x += Math.Sin(a.hd) * a.speed * dt; a.z += Math.Cos(a.hd) * a.speed * dt;
                if (a.pen != null)
                {
                    var f = a.pen;
                    double lx = (a.x - f.x) * f.fx + (a.z - f.z) * f.fz, lz = (a.x - f.x) * f.rx + (a.z - f.z) * f.rz;
                    if (Math.Abs(lx) > f.w / 2 - 1.5 || Math.Abs(lz) > f.dpt / 2 - 1.5)
                    {
                        double cl = Math.Max(-f.w / 2 + 1.5, Math.Min(f.w / 2 - 1.5, lx)), cz2 = Math.Max(-f.dpt / 2 + 1.5, Math.Min(f.dpt / 2 - 1.5, lz));
                        a.x = f.x + f.fx * cl + f.rx * cz2; a.z = f.z + f.fz * cl + f.rz * cz2;
                        a.hd = Math.Atan2(f.x - a.x, f.z - a.z) + (Random.value - 0.5);
                    }
                }
                a.y = t.Height(a.x, a.z);
                a.rx = 0; a.rz = 0; a.ry = a.hd;
                Place(a);
                a.col.x = a.x; a.col.y = a.y + a.sp.y; a.col.z = a.z;
                a.col.s = q.s;
                Legs(a, a.speed, dt);
            }
        }

        void Legs(Animal a, double speed, float dt)
        {
            if (a.anim)
            {
                string want = a.state == "tumble" || a.state == "down" ? "idle" : speed > 3 ? "run" : speed > 0.3 ? "walk" : "idle";
                if (want != a.cur)
                {
                    a.anim.CrossFadeInFixedTime(want == "run" ? "Run" : want == "walk" ? "Walk" : "Survey", 0.25f);
                    a.cur = want;
                }
                a.anim.speed = want == "run" ? (float)Math.Max(0.8, speed / 6) : 1;
                return;
            }
            if (a.legs.Count == 0) return;
            bool gallop = speed > a.sp.walk * 2;
            a.phase += dt * (speed > 0.05 ? a.sp.step * (0.8 + speed * (gallop ? 0.25 : 0.9)) : 0);
            double amp = Math.Min(0.75, speed * (gallop ? 0.09 : 0.35));
            foreach (var l in a.legs)
            {
                double off = gallop ? (l.front ? 0 : Math.PI * 0.7) + (l.left ? 0.25 : 0) : (l.front == l.left ? 0 : Math.PI);
                // rotation about the game x axis (mirroring keeps an x rotation as is)
                l.tr.localRotation = l.rest * G.Axis(1, 0, 0, Math.Sin(a.phase + off) * amp);
            }
        }
    }
}

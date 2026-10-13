// Race presentation (port of game/presentation.js): the cinematic intro before the countdown,
// the finish-line camera and the podium. Works on whatever entrants the race holds (bots
// offline, real drivers online), so both modes get the same show.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Downfall.Audio;
using static Downfall.GameMesh;
using Random = UnityEngine.Random;

namespace Downfall
{
    public sealed class Presentation
    {
        public const double INTRO_SECONDS = RaceLogic.INTRO_SECONDS;

        readonly Race r;
        public string mode;   // null | 'intro' | 'finish' | 'podium' | 'after'
        public double t;
        Vector3 pos, look;
        sealed class Shot { public double dur; public Func<double, (Vector3 p, Vector3 l)> cam; }
        List<Shot> shots = new List<Shot>();
        int shot;
        double total;
        Vector3 finishCam;
        Vector3 pc, pf, pr;
        GameObject podium;
        readonly List<Material> podiumMats = new List<Material>();
        sealed class SlotCar { public Entrant e; public Vector3 pos; public int place; }
        List<SlotCar> slotCars = new List<SlotCar>();
        double confT;
        Action onDone;

        public Presentation(Race race) { r = race; }

        public bool active => mode != null;
        static AudioSys Au => AudioSys.A != null && AudioSys.A.Ready() ? AudioSys.A : null;
        static double Ease(double k) => k * k * (3 - 2 * k);

        // ------------------------------------------------------------------ intro
        // `seconds` lets an online race fit the intro into the time left before the synced start
        public void StartIntro(double seconds = INTRO_SECONDS)
        {
            var tr = r.track;
            double scale = U.Clamp(seconds / INTRO_SECONDS, 0.35, 1);
            double s0 = r.startS;
            double sd = OutsideSide();
            var field = r.field;
            double unwrap(Entrant e) => tr.loop && e.lastS > tr.length * 0.5 ? e.lastS - tr.length : e.lastS;
            double grid0 = field.Min(unwrap);
            Vector3 P(double s, double d, double h) { var p = tr.PosAt(s, d); return V(p.x, Math.Max(p.y, tr.Height(p.x, p.z)) + h, p.z); }
            shots = new List<Shot>
            {
                // 1. crane over the start: drift down the straight towards the grid
                new Shot { dur = 3.0 * scale, cam = k => (P(s0 + 70 - 40 * k, -sd * (18 + 6 * (1 - k)), 16 - 8 * k), P(s0 - 8, 0, 1)) },
                // 2. low hero shot of the player car, sweeping across its nose
                new Shot { dur = 2.7 * scale, cam = k =>
                {
                    var v = r.vehicle; var f = v.GetForward(new Vehicle.Vec3()); var p = v.pos;
                    double rtx = f.z, rtz = -f.x;
                    double a = U.Lerp(-0.9, 0.9, Ease(k));
                    var ps = V(p.x + f.x * 4.6 * Math.Cos(a) + rtx * 4.6 * Math.Sin(a), p.y - 0.15, p.z + f.z * 4.6 * Math.Cos(a) + rtz * 4.6 * Math.Sin(a));
                    return (ps, V(p.x, p.y + 0.15, p.z));
                } },
                // 3. tracking shot along the grid at bumper height
                new Shot { dur = 2.7 * scale, cam = k => (P(U.Lerp(grid0 - 4, s0 + 2, Ease(k)), sd * (tr.width[0] / 2 + 2.6), 1.0), P(U.Lerp(grid0 + 6, s0 + 14, Ease(k)), 0, 0.6)) },
            };
            mode = "intro"; t = 0; shot = -1;
            total = shots.Sum(x => x.dur);
            var m = r.map; double km = tr.length / 1000;
            var d = new RaceIntroData
            {
                cc = m.country != null && Maps.COUNTRY_CODES.TryGetValue(m.country, out var cc) ? cc : "", country = m.country ?? "", region = m.region ?? "", name = m.name,
                line = (tr.loop ? r.laps + " LAPS · " : "SPRINT · ") + km.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture) + " KM · " + field.Count + " DRIVERS",
                skippable = !r.online,
            };
            var sorted = field.OrderByDescending(unwrap).ToList();
            for (int i = 0; i < sorted.Count; i++) d.grid.Add(new GridRow { pos = i + 1, name = sorted[i].name, car = sorted[i].car.name, me = sorted[i].isPlayer, color = sorted[i].color });
            r.g.ui.RaceIntro(d);
            Au?.Whoosh(0.5f);
        }

        double OutsideSide()
        {
            var tr = r.track;
            if (!tr.loop) return 1;
            double ks = 0; for (int j = 0; j < tr.N; j += 4) ks += tr.k[j];
            return ks > 0 ? 1 : -1;
        }

        public void Skip()
        {
            if (mode != "intro" || r.online) return;
            EndIntro();
            r.startCountdownNow?.Invoke();
        }

        public void EndIntro()
        {
            if (mode != "intro") return;
            mode = null;
            r.g.ui.RaceIntroHide();
            r.camIntro = 0;
            r.PlaceIntroCamera();
            if (!r.online) r.startCountdownNow?.Invoke();
        }

        // ------------------------------------------------------------------ finish
        // a trackside camera at the line watches the car cross, in slow motion
        public void StartFinish()
        {
            var tr = r.track; var v = r.vehicle;
            double s = tr.loop ? tr.WrapS(v.lastQuery.s + 26) : Math.Min(tr.length - 2, v.lastQuery.s + 26);
            double sd = v.lastQuery.d > 0 ? -1 : 1;
            var p = tr.PosAt(s, sd * (tr.width[Math.Min(tr.N - 1, Track.JsRoundI(s / 2))] / 2 + 4));
            finishCam = V(p.x, Math.Max(p.y, tr.Height(p.x, p.z)) + 1.3, p.z);
            mode = "finish"; t = 0;
            r.timeScale = 0.35;
            Au?.Cheer(0.7f);
        }

        // ------------------------------------------------------------------ podium
        // rows: (entrant, time label) in finishing order
        public void StartPodium(List<(Entrant e, string label)> rows, Action done)
        {
            var g = r.g; var tr = r.track;
            var top = rows.Take(3).Where(x => x.e != null && x.e.model != null).ToList();
            if (top.Count == 0) { done(); return; }
            onDone = done;
            // a clear, level spot on the start/finish straight
            double s = tr.loop ? tr.WrapS(r.startS + 30) : Math.Max(r.startS + 30, Math.Min(tr.length - 40, r.vehicle.lastQuery.s - 60));
            int j = Math.Min(tr.N - 1, Track.JsRoundI(s / 2));
            var c = tr.PosAt(s, 0); double hd = tr.hd[j];
            var f = V(Math.Sin(hd), 0, Math.Cos(hd)); var rt = V(-Math.Cos(hd), 0, Math.Sin(hd));
            pc = V(c.x, tr.RoadY(s), c.z); pf = f; pr = rt;
            podium = Node("podium", g.worldScene);
            var mat = Std("podium", 0xe8e6e0, 0.5f, 0.05f);
            var trim = Std("podiumTrim", 0xe2a33b, 0.4f, 0.3f, 0x3a2508, 0.4f);
            podiumMats.Add(mat); podiumMats.Add(trim);
            double[][] slots = { new[] { 0, 0.9 }, new[] { -1, 0.6 }, new[] { 1, 0.35 } };
            slotCars = new List<SlotCar>();
            for (int i = 0; i < top.Count; i++)
            {
                double side = slots[i][0], h = slots[i][1];
                double off = side * 5.2;
                var bp = V(pc.x + rt.x * off, pc.y + h / 2, pc.z + rt.z * off);
                var b = Obj("step", podium.transform, Box(4.6, h, 6.4), mat);
                b.transform.SetPositionAndRotation(Coord.ToUnity(bp), SimY(hd));
                var band = Obj("band", podium.transform, Box(4.66, 0.12, 6.46), trim);
                band.transform.SetPositionAndRotation(Coord.ToUnity(bp.x, pc.y + h - 0.06, bp.z), SimY(hd));
                var m = top[i].e.model;
                // park the car on its step, nose towards the camera side
                double y = pc.y + h - m.dims.yG + 0.02;
                m.SetPose(V(bp.x, y, bp.z), hd + Math.PI + side * 0.25);
                m.visible = true;
                m.SetStaticWheels(0);
                slotCars.Add(new SlotCar { e = top[i].e, pos = V(bp.x, y + 0.6, bp.z), place = i + 1 });
            }
            // everyone else leaves the stage
            foreach (var e in r.field) if (!top.Any(x => x.e == e) && e.model != null) e.model.visible = false;
            mode = "podium"; t = 0; confT = 0;
            // engines off for the ceremony
            r.engine?.SetRunning(false);
            foreach (var e in r.field) e.voice?.SetRunning(false);
            var pd = new PodiumData();
            for (int i = 0; i < top.Count; i++) pd.places.Add(new PodiumPlace { place = i + 1, name = top[i].e.name, car = top[i].e.car.name, me = top[i].e.isPlayer, time = top[i].label });
            r.g.ui.Podium(pd);
            Au?.Fanfare();
            Au?.Cheer(1);
        }

        public void EndPodium()
        {
            if (mode != "podium") return;
            // keep the slow orbit running behind the result panel
            mode = "after";
            r.g.ui.PodiumHide();
            var done = onDone; onDone = null;
            done?.Invoke();
        }

        public void Dispose()
        {
            if (podium) { DestroyTree(podium); podium = null; }
            foreach (var m in podiumMats) GameMesh.Destroy(m);
            podiumMats.Clear();
            if (mode == "intro") r.g.ui.RaceIntroHide();
            if (mode == "podium") r.g.ui.PodiumHide();
            mode = null;
            foreach (var e in r.field) if (e.model != null) e.model.visible = true;
        }

        // ------------------------------------------------------------------ per frame
        // returns true when it drives the camera this frame
        public bool Update(double dt)
        {
            if (mode == null) return false;
            var cam = r.g.camera;
            t += dt;
            if (mode == "intro")
            {
                if (r.countdownStarted && r.online) { EndIntro(); return false; }
                double acc = 0; int i = 0;
                while (i < shots.Count - 1 && t > acc + shots[i].dur) { acc += shots[i].dur; i++; }
                var sh = shots[i]; double k = U.Clamp((t - acc) / sh.dur, 0, 1);
                if (i != shot) { shot = i; r.g.ui.IntroCut(); if (i > 0) Au?.Whoosh(0.6f); }
                var (p, l) = sh.cam(k);
                r.ApplyCamera(p, l, Vector3.up);
                if (cam) cam.fieldOfView = 42;
                if (t > total + 0.2) { EndIntro(); return false; }
                return true;
            }
            if (mode == "finish")
            {
                var v = r.vehicle;
                look = V(v.pos.x, v.pos.y + 0.4, v.pos.z);
                r.ApplyCamera(finishCam, look, Vector3.up);
                if (cam) cam.fieldOfView = (float)U.Lerp(48, 30, U.Smoothstep(0, 1.4, t));
                if (t > 1.6) { r.timeScale = 1; mode = null; }
                return true;
            }
            if (mode == "podium" || mode == "after")
            {
                // slow orbit in front of the podium
                double a = Math.Sin(t * 0.22) * 0.55;
                Vector3 c = pc, f = pf, rt = pr;
                double dist = 16 - Math.Min(4, t * 0.6);
                pos = V(c.x + (-f.x * Math.Cos(a) + rt.x * Math.Sin(a)) * dist, c.y + 3.2 + Math.Sin(t * 0.3) * 0.4, c.z + (-f.z * Math.Cos(a) + rt.z * Math.Sin(a)) * dist);
                look = V(c.x, c.y + 1.2, c.z);
                r.ApplyCamera(pos, look, Vector3.up);
                if (cam) cam.fieldOfView = 45;
                // confetti + sparks over the winners
                confT -= dt;
                if (confT <= 0 && slotCars.Count > 0 && t < 14)
                {
                    confT = 0.05;
                    var P = r.g.particles; var w = slotCars[0].pos;
                    float[][] cols = { new[] { 1f, 0.78f, 0.25f }, new[] { 1f, 1f, 1f }, new[] { 0.95f, 0.3f, 0.2f }, new[] { 0.3f, 0.6f, 1f } };
                    float R() => Random.value;
                    for (int n = 0; n < 6; n++)
                    {
                        var cc = cols[(int)Math.Floor(R() * cols.Length) % cols.Length];
                        P.glow.Emit(w.x + (R() - 0.5f) * 14, w.y + 7 + R() * 3, w.z + (R() - 0.5f) * 14,
                            (R() - 0.5f) * 1.5f, -1 - R(), (R() - 0.5f) * 1.5f, 3.5f, 0.18f, 0.14f, 1, cc[0], cc[1], cc[2], 0.6f, 0.6f);
                    }
                }
                r.g.particles.Update((float)dt);
                if (mode == "podium" && t > 9) EndPodium();
                return true;
            }
            return false;
        }
    }
}

// One run down the mountain (port of game/run.js): drives the physics, keeps the visuals,
// camera, audio and HUD in sync, handles pickups, bonuses, records, and ends the run with a
// payout. Race extends it for the circuits and sprints.
//
// Simulation-space maths (camera rig, effects) uses UnityEngine.Vector3 as a plain container;
// positions/rotations reach Unity only through Coord (camera) and CarView / GameMesh helpers.
// setTimeout becomes `timers` (game clock, ticked with the unscaled frame time).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Downfall.Audio;
using static Downfall.GameMesh;
using Random = UnityEngine.Random;

namespace Downfall
{
    public class Run
    {
        public readonly IGameHost g;
        public bool active;
        public string camMode;
        public Vector3 camPos, camLook, camVel;
        public double shake;
        public readonly Dictionary<int, GameObject> pickMeshes = new Dictionary<int, GameObject>();
        readonly Dictionary<int, (Transform item, TrackPickup pk, double phase, double rot)> pickInfo = new Dictionary<int, (Transform, TrackPickup, double, double)>();
        protected readonly RunTimers timers = new RunTimers();

        public CarDef car;
        public CarStats stats;
        public CarView model;
        public Vehicle vehicle;
        public Light headlight, flash;
        public EngineVoice engine;
        public RoadVoice road;

        public double startS, best, maxS, runCash, time, timeScale = 1, lastS, lastRegionS, topSpeed;
        public string mountain;
        public sealed class Bonus { public double shortcuts, stunts, crates; }
        public Bonus bonus = new Bonus();
        public HashSet<int> collected = new HashSet<int>();
        public bool record, ended, countdown, go, countdownStarted;
        public int region = -1, recoveries, nextKm;
        public double stuckT, flipT, stopT, criticalDistance, maxAir, maxDrift;
        public bool fumes, recoveredRoll, rolled;
        public List<string> rareParts = new List<string>();
        public sealed class Hints { public bool brake, hand, turbo, cam; }
        public Hints hints = new Hints();
        public HashSet<TrackRockfall> rockfallsDone = new HashSet<TrackRockfall>();
        public List<WorldCollider> dynamic = new List<WorldCollider>();
        readonly Dictionary<WorldCollider, Vector2> spinRot = new Dictionary<WorldCollider, Vector2>();
        public Animals animals;
        public double camIntro;
        public int cdToken;
        public Action startCountdownNow;
        public double lastTotal;
        public double airCam, fovKick, flashT, flashI;
        public bool drifting;
        public double lastDrift;
        public int fps;
        double fpsAcc; int fpsN; double hudT;
        Track petalTrack; bool petals;
        TrackQuery camQ = new TrackQuery();
        sealed class Head { public double x, y, z, yaw; }
        Head head;
        Vector3? prevVel;

        public Run(IGameHost game)
        {
            g = game;
            active = false;
            camMode = game.save.data.settings.camera ?? "chase";
        }

        public Track track => g.track;
        protected static AudioSys Au => AudioSys.A != null && AudioSys.A.Ready() ? AudioSys.A : null;
        protected double ShakeSetting => g.save.data.settings.shake;

        static readonly Dictionary<string, int> PICK_COLORS = new Dictionary<string, int> { ["cash"] = 0x9fd07a, ["fuel"] = 0xe05a3a, ["repair"] = 0x5aa0e0, ["repairL"] = 0x5aa0e0, ["rare"] = 0xe2b04a, ["crate"] = 0xe2b04a };

        // ------------------------------------------------------------------ setup
        public void Start(string carId)
        {
            var sv = g.save.data;
            var car = Cars.CarById(carId);
            var cs = SaveManager.CarState(sv, carId);
            this.car = car;
            stats = Stats.ComputeStats(car, cs.levels, cs.tire, sv.garageLevel);
            if (model != null) model.Dispose();
            var paint = GameHelpers.PaintFor(car, cs);
            model = new CarView(car, new CarViewOpts { levels = cs.levels, tire = cs.tire, stats = stats, paint = paint.color, finish = paint.finish });
            model.group.SetParent(g.worldScene, true);
            SetShadows(model.gameObject, true);
            vehicle = new Vehicle(track, car, stats);
            vehicle.assist = sv.settings.assist ? 1 : 0;
            headlight = g.headlight;
            flash = g.flashLight;
            if (engine != null) engine.Dispose();
            engine = null;
            var a = Au;
            if (a != null)
            {
                engine = new EngineVoice(a, GameHelpers.Sound(car));
                if (road == null) road = new RoadVoice(a);
            }
            Restart(true);
        }

        public virtual void Restart(bool first = false)
        {
            var sv = g.save.data;
            var t = track;
            t.ResetRun();
            g.world?.ResetRails();
            g.particles?.Clear(); g.skids?.Clear(); g.debris?.Clear();
            foreach (var o in t.obstacles) foreach (var c in o.colliders)
                    if (c.HasHome)
                    {
                        c.x = c.x0; c.y = c.y0; c.z = c.z0; c.vx = c.vy = c.vz = 0; c.hit = false;
                        var mt = AsT(c.mesh);
                        if (mt) { mt.position = Coord.ToUnity(c.x0, c.y0 - 0.45, c.z0); mt.rotation = Quaternion.identity; }
                        spinRot.Remove(c);
                    }
            startS = 30;
            var v = vehicle;
            double dbgS = g.debug != null ? g.debug.startS : 0;
            v.Reset(dbgS != 0 ? dbgS : startS, 1.6);
            model.ResetDamage();
            mountain = sv.mountain;
            best = sv.best.TryGetValue(mountain ?? "", out var b) ? b : 0;
            maxS = dbgS != 0 ? dbgS : startS;
            runCash = 0;
            bonus = new Bonus();
            collected = new HashSet<int>();
            record = false;
            ended = false;
            time = 0;
            timeScale = 1;
            region = -1;
            stuckT = 0; flipT = 0; stopT = 0; recoveries = 2;
            criticalDistance = 0; fumes = false; maxAir = 0; maxDrift = 0; recoveredRoll = false; rolled = false;
            lastS = startS;
            lastRegionS = 0;
            rareParts = new List<string>();
            topSpeed = 0;
            nextKm = 1;
            hints = new Hints();
            rockfallsDone = new HashSet<TrackRockfall>();
            foreach (var r in dynamic) DestroyMesh(r);
            dynamic = new List<WorldCollider>();
            v.dynamic = dynamic;
            g.world?.ResetBreakables();
            if (animals == null || animals.track != track) { animals?.Dispose(); animals = new Animals(track, g.worldScene); }
            animals.feed = (text, amount) => g.ui.Feed(text, amount);
            animals.Reset(maxS);
            v.animalCols = animals?.cols;
            foreach (var m in pickMeshes.Values) DestroyTree(m);
            pickMeshes.Clear(); pickInfo.Clear();
            g.world?.Update(maxS, 30);
            active = false;
            countdown = true;
            camIntro = 0;
            PlaceIntroCamera();
            g.ui.HudInit(best, sv.cash);
            g.ui.Only("hud", "touch");
            engine?.SetRunning(false);
            Au?.musicGen?.SetMode("drive");
            Au?.SetReverb(0);
            g.Platform("gameplayStart");
            go = false;
            int tok = ++cdToken;
            void startCd()
            {
                if (tok != cdToken) return;
                g.ui.Countdown(best, n =>
                {
                    if (tok != cdToken) return;
                    Au?.Countdown(n == "GO");
                    if (n == "3" && engine != null) { Au?.Starter(); timers.After(520, () => engine?.SetRunning(true)); }
                    if (n == "GO") { go = true; active = true; countdown = false; ShowStartHints(); }
                });
            }
            // online races line the countdown up with the host's start time
            double delay = CountdownDelay();
            timers.Cancel(1);
            bool cdStarted = false;
            void startOnce() { if (cdStarted) return; cdStarted = true; timers.Cancel(1); countdownStarted = true; startCd(); }
            countdownStarted = false;
            // a race intro may start the countdown early (skip)
            startCountdownNow = startOnce;
            if (delay > 50) timers.After(delay, startOnce, 1); else startOnce();
            if (first) Au?.Ui("click");
        }

        // run.js has none (`this.countdownDelay ? ... : 0`); Race overrides it
        public virtual double CountdownDelay() => 0;

        public void ShowStartHints()
        {
            var ui = g.ui;
            if (g.input.isTouch) ui.Hint("HOLD <kbd>GAS</kbd> · STEER WITH THE ARROWS", 3500);
            else ui.Hint("<kbd>W</kbd> GAS <kbd>S</kbd> BRAKE <kbd>A</kbd><kbd>D</kbd> STEER", 3500);
        }

        public void PlaceIntroCamera()
        {
            var v = vehicle; var f = v.GetForward(new Vehicle.Vec3());
            var p = v.pos;
            camPos = V(p.x + f.x * 7 + f.z * 4, p.y + 1.4, p.z + f.z * 7 - f.x * 4);
            camLook = V(p.x, p.y + 0.6, p.z);
        }

        protected static Transform AsT(object o) => o is Transform t ? t : o is GameObject go ? go.transform : o is Component c ? c.transform : null;

        // ------------------------------------------------------------------ frame
        public virtual void Update(double rawDt)
        {
            timers.Tick(rawDt);
            var v = vehicle; var t = track; var ui = g.ui;
            double dt = rawDt * timeScale;
            time += dt;
            var inp = g.input.state;
            if (active && !ended && g.debug != null && g.debug.bot) BotDrive();
            else if (active && !ended)
            {
                v.input.throttle = inp.throttle; v.input.brake = inp.brake; v.input.steer = inp.steer;
                v.input.handbrake = inp.handbrake; v.input.boost = inp.boost;
            }
            else
            {
                // before the start: handbrake only, first gear (a held brake at standstill would engage reverse)
                if (ended) { v.input.throttle = 0; v.input.brake = 0.3; v.input.steer = 0; v.input.handbrake = 0; v.input.boost = 0; }
                else { v.input.throttle = 0; v.input.brake = 0; v.input.steer = 0; v.input.handbrake = 1; v.input.boost = 0; v.gear = 1; }
            }
            if (g.input.CameraPressed) CycleCamera();
            // physics
            if (!countdown || go) v.Update(dt);
            else { v.Update(dt * 0.5); v.vel.x = 0; v.vel.z = 0; v.angVel.y = 0; }
            UpdateDynamic(dt);
            animals?.Update((float)dt, v, maxS);
            // progress
            var q = v.lastQuery;
            if (q.dist < q.halfW + 30 && q.s > maxS && Math.Abs(v.pos.y - t.RoadY(q.s)) < 12)
            {
                double jump = q.s - maxS;
                if (jump > 70 && active) ShortcutTaken(jump);
                maxS = q.s;
            }
            double dist = maxS - startS;
            if (!record && best > 50 && dist > best && active)
            {
                record = true;
                ui.Notice("NEW RECORD", U.FmtKm(dist) + " KM", true, 2400);
                Au?.Record();
                shake = Math.Max(shake, 0.15);
            }
            HandleEvents();
            SyncModel(rawDt);
            Effects(dt);
            UpdatePickups();
            UpdateCamera(rawDt);
            RegionCheck();
            Hazards();
            Bonuses(dt);
            Audio(dt);
            Hud(rawDt);
            if (active && !ended) CheckEnd(dt);
            g.world?.Update(maxS, 1);
        }

        // debug autopilot (?bot)
        public void BotDrive()
        {
            var v = vehicle; var t = track; double s = v.lastQuery.s;
            double lane = 1.4;
            foreach (var o in t.obstacles)
                if (o.s > s && o.s < s + 60 && Math.Abs(o.d - lane) < 3.2)
                {
                    double span = (Track.Truthy(o.len) ? o.len : o.r * 2) + 1.6;
                    lane = o.d > 0 ? o.d - span : o.d + span;
                }
            var tgt = t.PosAt(s + 8 + v.speed * 0.6, lane);
            var f = v.GetForward(new Vehicle.Vec3());
            double a = Math.Atan2(tgt.x - v.pos.x, tgt.z - v.pos.z) - Math.Atan2(f.x, f.z);
            while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
            double kmax = 0;
            for (double u = 0; u < 20 + v.speed * 3; u += 4) kmax = Math.Max(kmax, Math.Abs(t.k[Math.Min(t.N - 1, Track.JsRoundI((s + u) / Track.STEP))]));
            double vt = Math.Min(38, Math.Sqrt(0.7 * 9.81 * v.p.mu / Math.Max(kmax, 1e-3)));
            v.input.steer = U.Clamp(a * 2.2, -1, 1);
            v.input.throttle = v.speed < vt ? 1 : 0;
            v.input.brake = v.speed > vt + 2 ? 1 : 0;
            v.input.handbrake = 0; v.input.boost = 0;
        }

        static readonly string[] CAM_MODES = { "chase", "far", "hood", "cockpit" };
        public void CycleCamera()
        {
            camMode = CAM_MODES[(Array.IndexOf(CAM_MODES, camMode) + 1) % CAM_MODES.Length];
            g.save.data.settings.camera = camMode; g.save.Save();
            g.ui.Notice(camMode == "cockpit" ? "FIRST PERSON" : camMode.ToUpperInvariant(), "CAMERA", false, 900);
        }

        // ------------------------------------------------------------------ events
        public void HandleEvents()
        {
            var v = vehicle; var m = model; var a = Au;
            foreach (var e in v.events)
            {
                switch (e.type)
                {
                    case "impact":
                        {
                            double k = U.Clamp((e.speed - 2) / 14, 0, 1);
                            a?.Impact((float)e.speed, e.kind);
                            if (e.speed > 4)
                            {
                                shake = Math.Max(shake, k * 0.55 * ShakeSetting);
                                g.particles.Sparks((float)e.x, (float)e.y, (float)e.z, (float)v.vel.x, 1, (float)v.vel.z, (int)Math.Round(4 + k * 18));
                                if (e.kind == "ground" || e.kind == "object") g.particles.Debris((float)e.x, (float)e.y, (float)e.z, (float)v.vel.x, 1, (float)v.vel.z, 4, new Color(0.35f, 0.3f, 0.25f));
                            }
                            break;
                        }
                    case "damage":
                        if (e.amount > 0.01 && e.zone != "susp") m.Dent(e.lx, e.ly, e.lz, e.amount * 1.6);
                        CheckDetach();
                        m.SyncDamage(v.dmg);
                        break;
                    case "smash": SmashEvent(e, true); break;
                    case "nitro": NitroIgnite(m, v, true); break;
                    case "glass":
                        a?.Glass();
                        { var p = m.SimPosition; g.particles.Glass(p.x, p.y + 0.8f, p.z, (float)v.vel.x, 1, (float)v.vel.z); }
                        break;
                    case "bottom": a?.Thump((float)U.Clamp(e.speed / 8, 0, 1)); shake = Math.Max(shake, U.Clamp(e.speed / 20, 0, 0.3) * ShakeSetting); break;
                    case "land":
                        maxAir = Math.Max(maxAir, e.air);
                        if (e.air > 0.9 && active) { double bb = Math.Round(e.air * 60 / 5) * 5; bonus.stunts += bb; runCash += bb; g.ui.Feed("AIRTIME " + e.air.ToString("0.0", Inv) + "s", bb); }
                        break;
                    case "shift": a?.Shift(); break;
                    case "blowoff": engine?.Blowoff((float)e.amount); break;
                    case "railbreak":
                        {
                            var mesh = g.world?.BreakRail(e.idx, e.side);
                            if (mesh)
                            {
                                var clone = UnityEngine.Object.Instantiate(mesh, mesh.transform.position, mesh.transform.rotation);
                                clone.transform.localScale = mesh.transform.lossyScale;
                                clone.SetActive(true);
                                g.debris.Add(clone.transform, V(v.vel.x * 0.4, 2, v.vel.z * 0.4), V(Random.value, Random.value * 2, Random.value));
                            }
                            a?.Metal(1, 200);
                            g.ui.Notice("GUARD RAIL GONE", "", false, 1200);
                            break;
                        }
                    case "stall": a?.Burst(freq: 200, type: FilterType.Lowpass, dur: 0.4f, gain: 0.3f, buf: NoiseBufs.Brown); engine?.SetRunning(false); break;
                    case "engineCritical": g.ui.Notice("ENGINE CRITICAL", "POWER REDUCED", true, 2000); break;
                    case "engineDead": g.ui.Notice("ENGINE DEAD", e.why == "heat" ? "OVERHEATED" : "COASTING", true, 2400); break;
                    case "misfire": a?.Burst(freq: 500, q: 0.7f, type: FilterType.Lowpass, dur: 0.08f, gain: 0.5f, buf: NoiseBufs.Brown, bus: Bus.Eng); break;
                }
            }
            v.events.Clear();
        }

        protected static readonly System.Globalization.CultureInfo Inv = System.Globalization.CultureInfo.InvariantCulture;

        // something breakable was hit (by the player or any other car)
        public void SmashEvent(VehicleEvent e, bool isPlayer)
        {
            var a = Au; var o = e.o;
            double sp = e.speed;
            double near = isPlayer ? 1 : U.Clamp(1 - Math.Sqrt((o.x - vehicle.pos.x) * (o.x - vehicle.pos.x) + (o.z - vehicle.pos.z) * (o.z - vehicle.pos.z)) / 80, 0, 1);
            if (o.animal != null)
            {
                // a short, sharp explosion: flash, fireball, smoke, tufts -- and the animal is gone
                animals?.Explode(o);
                string kind = (o.animal as Animal)?.kind;
                Explosion(o.x, o.y + 0.3, o.z, e.vx, e.vz, kind == "cow" ? 1.3 : kind == "fox" ? 0.6 : 1, near);
                if (isPlayer) shake = Math.Max(shake, 0.35 * ShakeSetting);
                return;
            }
            var parts = g.world?.Smash(o) ?? new List<GameObject>();
            var dir = V(e.vx, 0, e.vz).normalized;
            foreach (var go in parts)
            {
                if (!go) continue;
                var grp = go.transform;
                if (o.kind == "sapling")
                {
                    // snaps and topples away from the car
                    var axis = V(dir.z, 0, -dir.x) * (float)(2.5 + Math.Min(4, sp * 0.08));
                    g.debris.Add(grp, V(e.vx * 0.15, 1.5, e.vz * 0.15), axis, 0);
                }
                else
                {
                    double up = 2 + Math.Min(6, sp * 0.15);
                    g.debris.Add(grp, V(e.vx * 0.55 + (Random.value - 0.5) * 3, up, e.vz * 0.55 + (Random.value - 0.5) * 3),
                        V((Random.value - 0.5) * 8, (Random.value - 0.5) * 6, (Random.value - 0.5) * 8), 0);
                }
            }
            var leaf = o.kind == "fence" ? new Color(0.42f, 0.36f, 0.28f) : new Color(0.3f, 0.38f, 0.18f);
            g.particles.Debris((float)o.x, (float)o.y, (float)o.z, (float)(e.vx * 0.5), 2, (float)(e.vz * 0.5), o.kind == "fence" ? 10 : 14, leaf);
            if (a != null && near > 0.05)
            {
                a.Thump((float)(U.Clamp(sp / 30, 0.2, 0.8) * near));
                a.Burst(freq: o.kind == "fence" ? 900 : 2400, q: 0.8f, dur: 0.25f, gain: (float)(0.25 * near), type: FilterType.Bandpass, buf: NoiseBufs.Pink);
            }
            if (isPlayer) shake = Math.Max(shake, 0.12 * ShakeSetting);
        }

        public void Explosion(double x, double y, double z, double vx, double vz, double size = 1, double vol = 1)
        {
            var P = g.particles; var a = Au;
            if (!flash) flash = g.flashLight;
            if (flash) flash.transform.position = Coord.ToUnity(x, y + 1, z);
            SetFlash(900 * size); flashT = 0.25;
            float R() => Random.value;
            for (int i = 0; i < 46 * size; i++)
            {
                float r = R(), th = R() * 6.283f, phi = R() * 3.14f;
                float sp = (float)((4 + R() * 9) * size);
                P.glow.Emit((float)x, (float)y, (float)z, (float)(vx * 0.35) + Mathf.Cos(th) * Mathf.Sin(phi) * sp, Mathf.Abs(Mathf.Cos(phi)) * sp * 0.8f + 2, (float)(vz * 0.35) + Mathf.Sin(th) * Mathf.Sin(phi) * sp,
                    0.35f + r * 0.35f, (float)(0.9 * size), 0.2f, 1, 1, 0.45f + r * 0.35f, 0.08f, -2, 3);
            }
            P.Sparks((float)x, (float)y, (float)z, (float)(vx * 0.4), 3, (float)(vz * 0.4), (int)Math.Round(30 * size));
            for (int i = 0; i < 10 * size; i++)
                P.Smoke((float)x + (R() - 0.5f) * 2, (float)y + R(), (float)z + (R() - 0.5f) * 2, (float)(vx * 0.2) + (R() - 0.5f) * 4, 2 + R() * 3, (float)(vz * 0.2) + (R() - 0.5f) * 4, true, (float)(1.6 * size));
            P.Debris((float)x, (float)y, (float)z, (float)(vx * 0.5), 4, (float)(vz * 0.5), (int)Math.Round(16 * size), new Color(0.75f, 0.7f, 0.62f));
            if (a != null && vol > 0.02)
            {
                a.Burst(freq: 90, type: FilterType.Lowpass, dur: 0.9f, gain: (float)(0.55 * vol), buf: NoiseBufs.Brown, attack: 0.002f);
                a.Burst(freq: 1400, q: 0.5f, type: FilterType.Bandpass, dur: 0.35f, gain: (float)(0.3 * vol), buf: NoiseBufs.White);
                a.Thump((float)(0.9 * vol));
            }
        }

        void SetFlash(double i) { flashI = i; if (flash) flash.intensity = (float)(i * GameHelpers.LightScale); }

        // nitro fired: kick, whoosh and a burst of flame
        public void NitroIgnite(CarView m, Vehicle v, bool isPlayer)
        {
            var a = Au; var P = g.particles;
            var fw = v.GetForward(new Vehicle.Vec3());
            float R() => Random.value;
            foreach (var tip in m.exhaustTips)
            {
                var ep = m.LocalToWorld(tip);
                for (int i = 0; i < 18; i++) P.glow.Emit(ep.x, ep.y, ep.z, (float)(v.vel.x - fw.x * (8 + R() * 8)), R(), (float)(v.vel.z - fw.z * (8 + R() * 8)), 0.25f, 0.8f, 0.15f, 1, 0.7f, 0.35f, 0.1f, 0, 2);
            }
            if (isPlayer)
            {
                fovKick = 1;
                shake = Math.Max(shake, 0.3 * ShakeSetting);
                if (a != null)
                {
                    a.Burst(freq: 600, q: 0.4f, type: FilterType.Bandpass, dur: 1.1f, gain: 0.32f, buf: NoiseBufs.White, attack: 0.03f);
                    a.Burst(freq: 70, type: FilterType.Lowpass, dur: 0.8f, gain: 0.45f, buf: NoiseBufs.Brown);
                }
                g.ui.Feed("TURBO", 0);
            }
        }

        // FLAME_GEO / FLAME_CORE and the additive materials
        static Mesh flameGeo, flameCore;
        static Material flameOut, flameIn;
        static void FlameAssets()
        {
            if (flameGeo) return;
            flameGeo = Cone(0.095, 0.62, 12, 1, true).Translate(0, -0.31, 0).RotateX(Math.PI).ToMesh("flame");
            flameCore = Cone(0.05, 0.26, 10, 1, true).Translate(0, -0.13, 0).RotateX(Math.PI).ToMesh("flameCore");
            MarkCached(flameGeo); MarkCached(flameCore);
            flameOut = Additive("flameOut", 0xff7a24, 0.8f);
            flameIn = Additive("flameIn", 0x8fc4ff, 0.95f);
        }

        // flames out of the exhaust while the nitro burns
        public void Flames(CarView m, Vehicle v, double dt, bool isPlayer)
        {
            var P = g.particles;
            var fw = v.GetForward(new Vehicle.Vec3());
            float R() => Random.value;
            if (m.flameMeshes == null)
            {
                FlameAssets();
                m.flameMeshes = m.exhaustTips.Select(tip =>
                {
                    var grp = Node("flame", m.group).transform;
                    // orange plume, white-blue core and a short shock diamond at the mouth
                    var outer = Obj("outer", grp, flameGeo, flameOut, false).transform;
                    var inner = Obj("inner", grp, flameGeo, flameIn, false).transform;
                    Obj("core", grp, flameCore, flameIn, false);
                    inner.localScale = new Vector3(0.5f, 0.55f, 0.5f);
                    SetSimLocal(grp, tip.x, tip.y, tip.z - 0.08);
                    grp.localRotation = SimX(-Math.PI / 2);
                    return grp;
                }).ToList();
            }
            bool on = v.nitroT > 0;
            foreach (var f in m.flameMeshes)
            {
                if (!f) continue;
                f.gameObject.SetActive(on);
                if (on)
                {
                    // licking, uneven flame: length and width flicker every frame, longest in the first second
                    double fresh = 1 + Math.Max(0, v.nitroT - 3) * 0.5;
                    float k = (float)((0.75 + R() * 0.45) * fresh);
                    f.localScale = new Vector3(0.9f + R() * 0.25f, k, 0.9f + R() * 0.25f);
                    var o = f.GetChild(0); var i = f.GetChild(1); var c = f.GetChild(2);
                    o.localRotation = SimY(R() * 6.28);
                    i.localScale = new Vector3(0.5f, 0.45f + R() * 0.2f, 0.5f);
                    c.localScale = new Vector3(1, 0.8f + R() * 0.5f, 1);
                }
            }
            if (!on) return;
            foreach (var tip in m.exhaustTips)
            {
                var ep = m.LocalToWorld(tip);
                if (R() < dt * 60) P.glow.Emit(ep.x, ep.y, ep.z, (float)(v.vel.x - fw.x * 9), 0.4f, (float)(v.vel.z - fw.z * 9), 0.14f, 0.55f, 0.1f, 1, 0.55f + R() * 0.3f, 0.25f, 0.08f, 0, 2);
                // embers and heat puffs trailing behind
                if (R() < dt * 25) P.glow.Emit(ep.x, ep.y, ep.z, (float)(v.vel.x * 0.6 - fw.x * 4) + (R() - 0.5f) * 2, 0.6f + R(), (float)(v.vel.z * 0.6 - fw.z * 4) + (R() - 0.5f) * 2, 0.35f, 0.09f, 0.03f, 1, 1, 0.55f, 0.2f, 2, 1);
            }
            if (isPlayer && flash && m.exhaustTips.Count > 0)
            {
                flash.transform.position = Coord.ToUnity(m.LocalToWorld(m.exhaustTips[0]));
                SetFlash(Math.Max(flashI, 18 + R() * 14)); flashT = Math.Max(flashT, 0.05);
            }
        }

        public void CheckDetach()
        {
            var v = vehicle;
            foreach (var name in new[] { "bumperF", "bumperR" })
            {
                if ((name == "bumperF" ? v.dmg.bumperF : v.dmg.bumperR) <= 0.02)
                {
                    var piece = model.Detach(name);
                    if (piece)
                    {
                        piece.SetParent(g.worldScene, true);
                        g.debris.Add(piece, V(v.vel.x * 0.7, 1.5, v.vel.z * 0.7), V(Random.value * 3, Random.value * 3, Random.value * 3));
                        Au?.Metal(0.6f, 260);
                        g.ui.Feed(name == "bumperF" ? "LOST THE FRONT BUMPER" : "LOST THE REAR BUMPER", 0);
                    }
                }
            }
        }

        // ------------------------------------------------------------------ visuals
        public virtual void SyncModel(double dt)
        {
            var v = vehicle; var m = model;
            m.SetPose(v.pos, v.q);
            m.UpdateFromVehicle(v, 1 / 60.0);
            double tun = g.env != null ? g.env.tunnel : 0;
            m.lightsOn = tun > 0.2;
            // headlight
            var f = v.GetForward(new Vehicle.Vec3());
            var hp = headlight;
            if (hp)
            {
                var pos = Coord.ToUnity(v.pos.x + f.x * 2, v.pos.y + 0.4, v.pos.z + f.z * 2);
                var tgt = Coord.ToUnity(v.pos.x + f.x * 20, v.pos.y - 1.5, v.pos.z + f.z * 20);
                hp.transform.SetPositionAndRotation(pos, Quaternion.LookRotation(tgt - pos, Vector3.up));
                double lights = (v.dmg.lightL + v.dmg.lightR) / 2;
                hp.intensity = (float)(tun * 120 * U.Clamp(lights * 1.5, 0, 1) * GameHelpers.LightScale);
            }
        }

        public void Effects(double dt)
        {
            var v = vehicle; var P = g.particles;
            double speed = v.speed;
            float R() => Random.value;
            double dirty = 0;
            var right = v.GetRight(new Vehicle.Vec3());
            foreach (var w in v.wheels)
            {
                if (!w.contact) { g.skids.Add(w.i, 0, 0, 0, 0, 0, 0, 0); continue; }
                var si = Track.SURF_INFO[w.surf];
                float cy = (float)(w.gy - v.p.r + 0.02);
                // tyre marks: slip on paved, ruts on loose
                double mark = si.group == 0 ? U.Clamp(w.slip * 1.2, 0, 1) : si.group > 0 ? U.Clamp(0.18 + speed / 60 + w.slip * 0.5, 0, 0.7) * (speed > 1 ? 1 : 0) : 0;
                g.skids.Add(w.i, (float)w.gx, cy, (float)w.gz, (float)right.x, (float)right.z, (float)(model.wheelWidth * 0.8), (float)(mark * (si.group == 3 ? 0.6 : 1)));
                if (si.dust != 0 && speed > 4)
                {
                    if (si.snow != 0) { if (R() < si.dust * dt * 30) P.SnowSpray((float)w.gx, cy, (float)w.gz, (float)v.vel.x, (float)v.vel.z); }
                    else
                    {
                        var L = g.env?.look;
                        var col = L != null ? L.dirt : Hex(0x8a7a60);
                        P.Dust((float)w.gx, cy, (float)w.gz, (float)v.vel.x, (float)v.vel.z, (float)(si.dust * dt * U.Clamp(speed / 6, 0, 3) * 3), col);
                    }
                    dirty += si.dust;
                }
                if (si.splash != 0 && speed > 3 && R() < dt * 25) { P.Splash((float)w.gx, cy, (float)w.gz, (float)v.vel.x, (float)v.vel.z, w.surf == SURF.MUD); dirty += 3; }
                if (si.group == 0 && w.slip > 0.45 && speed > 3 && R() < dt * 30 * w.slip) P.TireSmoke((float)w.gx, cy, (float)w.gz, (float)v.vel.x, (float)v.vel.z);
            }
            var m = model;
            m.wear.dirt = Math.Min(1, m.wear.dirt + dirty * dt * 0.004);
            // engine smoke / fire
            double eh = v.dmg.engine;
            if (eh < 0.55 || v.heat > 1.02)
            {
                var ep = m.LocalToWorld(m.enginePos);
                if (R() < dt * (eh < 0.25 ? 26 : 10)) P.Smoke(ep.x, ep.y, ep.z, (float)(v.vel.x * 0.8), 0, (float)(v.vel.z * 0.8), eh < 0.3, eh < 0.25 ? 1.4f : 0.9f);
                if (eh <= 0.05 && R() < dt * 12) P.glow.Emit(ep.x, ep.y, ep.z, R() - 0.5f, 1.5f, R() - 0.5f, 0.35f, 0.5f, 0.1f, 0.8f, 1, 0.45f, 0.12f, -1, 1);
            }
            // exhaust puffs
            if (v.engineOn && !v.stalled && R() < dt * (3 + v.input.throttle * 8))
                foreach (var tip in m.exhaustTips)
                {
                    var ep = m.LocalToWorld(tip);
                    P.soft.Emit(ep.x, ep.y, ep.z, (float)(v.vel.x * 0.9), 0.2f, (float)(v.vel.z * 0.9), 0.9f, 0.15f, 0.9f, (float)(0.12 + (1 - eh) * 0.25), 0.5f, 0.5f, 0.5f, -0.2f, 2);
                }
            // nitro flames + explosion flash decay
            Flames(m, v, dt, true);
            if (flash) { flashT -= dt; SetFlash(flashT > 0 ? flashI * 0.88 : 0); }
            // scraping sparks
            if (v.scrape > 0.3 && speed > 4) { var p = v.pos; P.Sparks((float)p.x, (float)(p.y - v.p.cg * 0.6), (float)p.z, (float)v.vel.x, 0.5f, (float)v.vel.z, 2); }
            // falling rocks visuals
            foreach (var r in dynamic)
            {
                var mt = AsT(r.mesh);
                if (!mt) continue;
                var rot = spinRot.TryGetValue(r, out var rr) ? rr : Vector2.zero;
                rot.x += (float)(r.vz * dt); rot.y -= (float)(r.vx * dt);
                spinRot[r] = rot;
                mt.SetPositionAndRotation(Coord.ToUnity(r.x, r.y, r.z), SimEuler(rot.x, 0, rot.y));
            }
            // cherry blossom petals drifting through the air on the sakura maps
            if (petalTrack != track) { petalTrack = track; petals = track.m.biomes.Any(b => b.look != null && b.look.cherry != 0); }
            if (petals && dt > 0 && g.camera)
            {
                var cam = Coord.FromUnity(g.camera.transform.position);
                var fw = v.GetForward(new Vehicle.Vec3());
                for (int i = 0; i < 3; i++)
                {
                    float a = R() * 6.283f, rad = 4 + R() * 22;
                    float x = cam.x + (float)fw.x * 14 + Mathf.Cos(a) * rad, z = cam.z + (float)fw.z * 14 + Mathf.Sin(a) * rad;
                    float c = 0.9f + R() * 0.1f;
                    P.soft.Emit(x, cam.y + 2 + R() * 6, z, 0.6f + R() * 0.8f, -0.5f - R() * 0.4f, (R() - 0.5f) * 0.8f,
                        4 + R() * 2, 0.07f, 0.07f, 0.85f, c, c * 0.74f, c * 0.82f, 0.12f, 0.25f);
                }
            }
            P.Update((float)dt);
            g.debris.Update((float)dt);
        }

        // ------------------------------------------------------------------ camera
        public void ApplyCamera(Vector3 pos, Vector3 look, Vector3 up)
        {
            var cam = g.camera; if (!cam) return;
            var p = Coord.ToUnity(pos);
            var dir = Coord.ToUnity(look) - p;
            if (dir.sqrMagnitude < 1e-8f) dir = cam.transform.forward;
            cam.transform.SetPositionAndRotation(p, Quaternion.LookRotation(dir, Coord.ToUnity(up)));
        }
        protected void OffsetCamera(Vector3 simDelta) { if (g.camera) g.camera.transform.position += Coord.ToUnity(simDelta); }

        public virtual void UpdateCamera(double dt)
        {
            var cam = g.camera; var v = vehicle; var m = model;
            if (!cam) return;
            var f = v.GetForward(new Vehicle.Vec3()); var up = v.GetUp(new Vehicle.Vec3());
            double speed = v.speed;
            var p = v.pos;
            var flatF = V(f.x, 0, f.z).normalized;
            // heading the camera follows: blend between car nose and travel direction
            var velDir = V(v.vel.x, 0, v.vel.z);
            if (speed > 6 && v.fwdSpeed > 0) { velDir.Normalize(); flatF = Vector3.Lerp(flatF, velDir, 0.35f).normalized; }
            if (v.gear == -1 && v.fwdSpeed < -2 && !countdown) flatF = Vector3.Lerp(-flatF, V(f.x, 0, f.z).normalized, 0).normalized;
            double len = m.dims.L;
            double air = v.wheelsOnGround == 0 ? 1 : 0;
            airCam = U.Damp(airCam, air, 2, dt);
            double fov = 60 + U.Clamp((speed * 3.6 - 40) / 140, 0, 1) * 14;
            bool ck = camMode == "cockpit" && !countdown;
            if (m.cockpit != ck)
            {
                m.cockpit = ck;
                g.BodyClass("cockpit", ck);
                // clearer glass from the inside
                m.SetGlassOpacity(ck ? 0.16f : 0.72f);
            }
            float Fp(double x) => (float)x;
            if (camMode == "chase" || camMode == "far" || countdown)
            {
                bool far = camMode == "far";
                double back = (far ? 8.8 : 4.4 + len * 0.36) + airCam * 1.6 + U.Clamp(speed / 40, 0, 1) * 0.8;
                double height = (far ? 3.3 : 1.55 + m.dims.H * 0.32) + airCam * 0.8;
                var want = V(p.x - flatF.x * back, p.y + height, p.z - flatF.z * back);
                var look = V(p.x + flatF.x * 3.5, p.y + 0.75 + m.dims.H * 0.15, p.z + flatF.z * 3.5);
                // look a little where the car is going (into the corner), not only where it points
                if (speed > 3 && !countdown)
                {
                    double la = Math.Min(6, speed * 0.12) / Math.Max(speed, 1e-3);
                    look.x += Fp(v.vel.x * la); look.z += Fp(v.vel.z * la);
                }
                if (countdown)
                {
                    // intro: start beside the car, swing in behind
                    camIntro = Math.Min(1, camIntro + dt * (go ? 1.2 : 0.22));
                    float k = (float)U.Smoothstep(0, 1, camIntro);
                    var side = V(p.x + flatF.x * 6 + flatF.z * 4.5, p.y + 1.3, p.z + flatF.z * 6 - flatF.x * 4.5);
                    want = Vector3.Lerp(side, want, k);
                    look = Vector3.Lerp(look, V(p.x, p.y + 0.5, p.z), 1 - k);
                }
                double lam = countdown ? 3 : 7;
                camPos.x = Fp(U.Damp(camPos.x, want.x, lam, dt));
                camPos.z = Fp(U.Damp(camPos.z, want.z, lam, dt));
                camPos.y = Fp(U.Damp(camPos.y, want.y, lam * 0.8, dt));
                camLook.x = Fp(U.Damp(camLook.x, look.x, 12, dt)); camLook.y = Fp(U.Damp(camLook.y, look.y, 8, dt)); camLook.z = Fp(U.Damp(camLook.z, look.z, 12, dt));
                // terrain + tunnel clearance
                double th = track.Height(camPos.x, camPos.z);
                if (camPos.y < th + 0.7) camPos.y = Fp(th + 0.7);
                // keep the line of sight to the car clear of slopes: pull in where the ground blocks it
                if (!countdown)
                {
                    double hx = p.x, hy = p.y + 1.0, hz = p.z;
                    for (double k = 0.35; k <= 0.95; k += 0.2)
                    {
                        double px = U.Lerp(hx, camPos.x, k), pz = U.Lerp(hz, camPos.z, k), py = U.Lerp(hy, camPos.y, k);
                        double gh = track.Height(px, pz);
                        if (py < gh + 0.35)
                        {
                            double kk = Math.Max(0.3, k - 0.2);
                            camPos.x = Fp(U.Lerp(hx, camPos.x, kk)); camPos.z = Fp(U.Lerp(hz, camPos.z, kk));
                            camPos.y = Fp(Math.Max(U.Lerp(hy, camPos.y, kk), gh + 0.6));
                            break;
                        }
                    }
                }
                var cq = track.Query(camPos.x, camPos.z, camQ);
                if (track.tunnel[cq.idx] != 0 && Math.Abs(cq.d) < cq.halfW + 1.5) camPos.y = Fp(Math.Min(camPos.y, track.RoadY(cq.s) + 4.2));
                // keep the camera at a sensible distance after crashes / flips
                double dx = camPos.x - p.x, dz = camPos.z - p.z, dd = Math.Sqrt(dx * dx + dz * dz);
                if (dd > back * 2.2) { camPos.x = Fp(p.x + dx / dd * back * 2.2); camPos.z = Fp(p.z + dz / dd * back * 2.2); }
                ApplyCamera(camPos, camLook, Vector3.up);
                var cs = g.save.data.cars.TryGetValue(car.id, out var cc) ? cc : null;
                int wl = cs != null && cs.levels != null && cs.levels.TryGetValue("weight", out var w8) ? w8 : 0;
                m.SetInteriorVisible(wl < 9);
                m.visible = true;
            }
            else
            {
                var eye = camMode == "hood" ? m.hoodEye : m.eye;
                bool fp = camMode == "cockpit";
                // head sways with the g-forces and looks a little into the corner
                var hb = head ??= new Head();
                var pv = prevVel ?? V(v.vel.x, v.vel.y, v.vel.z);
                double idt = Math.Max(dt, 1e-3);
                double ax = (v.vel.x - pv.x) / idt, ay = (v.vel.y - pv.y) / idt, az = (v.vel.z - pv.z) / idt;
                prevVel = V(v.vel.x, v.vel.y, v.vel.z);
                var upv = V(up.x, up.y, up.z); var fv = V(f.x, f.y, f.z);
                var rgt = Vector3.Cross(upv, fv).normalized;
                double accX = 0, accY = 0, accZ = 0;
                if (dt > 0) { accX = ax * rgt.x + ay * rgt.y + az * rgt.z; accY = ax * upv.x + ay * upv.y + az * upv.z; accZ = ax * fv.x + ay * fv.y + az * fv.z; }
                hb.x = U.Damp(hb.x, U.Clamp(-accX * 0.006, -0.06, 0.06), 6, dt);
                hb.z = U.Damp(hb.z, U.Clamp(-accZ * 0.004, -0.05, 0.05), 6, dt);
                hb.y = U.Damp(hb.y, U.Clamp(-accY * 0.002, -0.03, 0.03), 9, dt);
                hb.yaw = U.Damp(hb.yaw, (v.wheels[0].steer + v.wheels[1].steer) * 0.5 * 0.9, 4, dt);
                double ex = eye[0] + (fp ? hb.x : 0), ey = eye[1] + (fp ? hb.y : 0), ez = eye[2] + (fp ? hb.z : 0);
                var wp = m.LocalToWorld(ex, ey, ez);
                double ya = fp ? hb.yaw : 0;
                var ahead = m.LocalToWorld(ex - (fp ? 0.05 : eye[0] * 0.4) + Math.Sin(ya) * 20, ey - (fp ? 1.1 : 0.15), ez + Math.Cos(ya) * 20);
                var cup = V(up.x * 0.25, 1, up.z * 0.25).normalized;
                ApplyCamera(wp, ahead, cup);
                fov = camMode == "cockpit" ? 72 : 66;
            }
            float Rn() => Random.value - 0.5f;
            if (shake > 0)
            {
                float s = (float)shake;
                OffsetCamera(new Vector3(Rn() * s * 0.5f, Rn() * s * 0.5f, Rn() * s * 0.5f));
                shake = Math.Max(0, shake - dt * 1.4);
            }
            // subtle high-speed vibration
            double hs = U.Clamp((speed - 25) / 40, 0, 1) * 0.012 * ShakeSetting;
            OffsetCamera(new Vector3(0, (float)(Rn() * hs), 0));
            fovKick = Math.Max(0, fovKick - dt * 0.8);
            if (v.nitroT > 0 && (camMode == "chase" || camMode == "far")) fov += 9 + fovKick * 8;
            cam.fieldOfView = (float)U.Damp(cam.fieldOfView, fov, v.nitroT > 0 ? 5 : 3, dt);
            cam.nearClipPlane = camMode == "cockpit" || camMode == "hood" ? 0.05f : 0.15f;
        }

        // ------------------------------------------------------------------ pickups
        public virtual void UpdatePickups()
        {
            var t = track; var v = vehicle;
            double s = maxS;
            for (int i = 0; i < t.pickups.Count; i++)
            {
                var pk = t.pickups[i];
                bool inRange = pk.s > s - 60 && pk.s < s + 380 && !collected.Contains(i);
                bool has = pickMeshes.TryGetValue(i, out var mesh);
                if (inRange && !has)
                {
                    var grp = Node("pickup_" + pk.type, g.worldScene);
                    var item = BuildPickup(pk.type, grp.transform);
                    PickupBeacon(PICK_COLORS.TryGetValue(pk.type, out var pc) ? pc : 0xffffff, grp.transform);
                    grp.transform.position = Coord.ToUnity(pk.x, pk.y + 0.05, pk.z);
                    pickMeshes[i] = grp;
                    pickInfo[i] = (item, pk, Random.value * 6, 0);
                }
                else if (!inRange && has)
                {
                    DestroyTree(mesh);
                    pickMeshes.Remove(i); pickInfo.Remove(i);
                }
            }
            var cp = v.pos;
            foreach (var key in pickMeshes.Keys.ToList())
            {
                var grp = pickMeshes[key];
                var u = pickInfo[key];
                u.rot += 0.02;
                pickInfo[key] = u;
                u.item.localRotation = SimY(u.rot);
                SetSimLocal(u.item, 0, 0.15 + Math.Sin(time * 2 + u.phase) * 0.08, 0);
                var gp = Coord.FromUnity(grp.transform.position);
                double dx = gp.x - cp.x, dy = gp.y + 0.4 - cp.y, dz = gp.z - cp.z;
                if (dx * dx + dz * dz < 5.5 && Math.Abs(dy) < 2.6 && !ended) Collect(key, grp);
            }
        }

        public void Collect(int key, GameObject grp)
        {
            var v = vehicle; var pk = pickInfo[key].pk;
            collected.Add(key);
            var gp = Coord.FromUnity(grp.transform.position);
            DestroyTree(grp);
            pickMeshes.Remove(key); pickInfo.Remove(key);
            Au?.Pickup(pk.type);
            var col = Hex(PICK_COLORS.TryGetValue(pk.type, out var pc) ? pc : 0xffffff);
            g.particles.Burst(gp.x, gp.y, gp.z, col, 26);
            double depth = pk.s / 1000;
            var sv = g.save.data;
            switch (pk.type)
            {
                case "cash": { double amt = Math.Round((40 + depth * 14) / 5) * 5; runCash += amt; g.ui.Feed("CASH", amt); break; }
                case "crate": { double amt = Math.Round((300 + depth * 70) / 10) * 10; runCash += amt; bonus.crates += amt; g.ui.Feed("BONUS CRATE", amt); break; }
                case "fuel":
                    {
                        if (v.fuel < 1) fumes = true;
                        const double add = 9;
                        v.fuel = Math.Min(v.p.fuel, v.fuel + add);
                        if (v.fuel > 0 && v.dmg.engine > 0 && v.stalled) { v.stalled = false; v.engineOn = true; engine?.SetRunning(true); }
                        g.ui.Feed("FUEL +" + add + " L", 0);
                        break;
                    }
                case "repair": v.Repair(0.25 * Upgrades.RepairBonus(sv.garageLevel)); model.SyncDamage(v.dmg); g.ui.Feed("REPAIR KIT", 0); if (engine != null && !v.stalled) engine.SetRunning(true); break;
                case "repairL": v.Repair(0.6 * Upgrades.RepairBonus(sv.garageLevel)); model.SyncDamage(v.dmg); g.ui.Feed("LARGE REPAIR KIT", 0); if (engine != null && !v.stalled) engine.SetRunning(true); break;
                case "rare":
                    {
                        var cs = SaveManager.CarState(sv, car.id);
                        var open = Upgrades.CATEGORIES.Where(c => (cs.levels.TryGetValue(c.id, out var l) ? l : 0) < car.caps[c.id] + (sv.garageLevel >= 4 ? 2 : 0) + (sv.garageLevel >= 5 ? 2 : 0)).ToList();
                        if (open.Count > 0)
                        {
                            var c = open[(int)Math.Floor(Random.value * open.Count) % open.Count];
                            rareParts.Add(c.id);
                            g.ui.Notice("RARE PART", c.name + " +1 LEVEL", true, 2200);
                        }
                        else { runCash += 2500; g.ui.Feed("RARE PART (SOLD)", 2500); }
                        break;
                    }
            }
        }

        public void ShortcutTaken(double jump)
        {
            double amt = Math.Round((150 + jump * 2.2) / 10) * 10;
            runCash += amt; bonus.shortcuts += amt;
            var st = g.save.data.stats; st["shortcuts"] = (st.TryGetValue("shortcuts", out var n) ? n : 0) + 1;
            g.ui.Feed("SHORTCUT", amt);
            Au?.Pickup("crate");
        }

        // props.js buildPickup(type)
        public static Transform BuildPickup(string type, Transform parent)
        {
            var g = Node("item", parent).transform;
            Transform add(MGeo geo, string mat, double x, double y, double z, Quaternion? rot = null)
            {
                var o = Obj("m", g, geo, Mats.Get(mat)).transform;
                SetSimLocal(o, x, y, z); if (rot.HasValue) o.localRotation = rot.Value;
                return o;
            }
            if (type == "fuel")
            {
                add(RoundedBox(0.38, 0.5, 0.18, 0.03), "fuelCan", 0, 0.3, 0);
                add(Torus(0.06, 0.018, 5, 10, Math.PI), "fuelCan", -0.08, 0.57, 0);
                add(Cylinder(0.025, 0.03, 0.14, 8), "darkSteel", 0.13, 0.6, 0, SimZ(-0.5));
            }
            else if (type == "cash")
            {
                for (int k = 0; k < 3; k++)
                {
                    var rot = SimY(k * 0.3);
                    add(Box(0.34, 0.06, 0.16), "cash", (k - 1) * 0.05, 0.2 + k * 0.065, (k % 2) * 0.03, rot);
                    add(Box(0.06, 0.065, 0.165), "redWhite", (k - 1) * 0.05, 0.2 + k * 0.065, (k % 2) * 0.03, rot);
                }
            }
            else if (type == "repair" || type == "repairL")
            {
                bool big = type == "repairL";
                double by = big ? 0.25 : 0.16;
                add(RoundedBox(big ? 0.8 : 0.5, big ? 0.42 : 0.26, big ? 0.45 : 0.24, 0.03), "repair", 0, by, 0);
                add(Box(big ? 0.4 : 0.26, 0.04, 0.04), "darkSteel", 0, big ? 0.5 : 0.32, 0);
                add(Box(0.06, 0.06, 0.02), "chrome", 0, by + 0.04, big ? 0.23 : 0.125);
                if (big)
                {
                    add(Box(0.22, 0.06, 0.005), "redWhite", 0.15, 0.3, 0.232);
                    add(Box(0.06, 0.22, 0.005), "redWhite", 0.15, 0.3, 0.232);
                }
            }
            else if (type == "rare")
            {
                add(RoundedBox(0.7, 0.4, 0.45, 0.04), "rare", 0, 0.22, 0);
                add(Box(0.72, 0.05, 0.47), "rareTrim", 0, 0.3, 0);
                add(Box(0.08, 0.42, 0.47), "rareTrim", 0.2, 0.22, 0);
            }
            else if (type == "crate")
            {
                add(Box(0.75, 0.6, 0.75), "crate", 0, 0.3, 0);
                add(Box(0.77, 0.08, 0.77), "woodDark", 0, 0.45, 0);
                add(Plane(0.3, 0.2), "cash", 0, 0.3, 0.378);
            }
            return g;
        }

        static readonly Dictionary<int, Material> beaconMats = new Dictionary<int, Material>();
        static Mesh beaconMesh;
        // props.js pickupBeacon(color): a soft vertical light pillar so pickups read at distance
        public static Transform PickupBeacon(int color, Transform parent)
        {
            if (!beaconMesh) { beaconMesh = Cylinder(0.18, 0.5, 4, 10, 1, true).Translate(0, 2, 0).ToMesh("beacon"); MarkCached(beaconMesh); }
            if (!beaconMats.TryGetValue(color, out var m) || !m) beaconMats[color] = m = Additive("beacon", color, 0.12f);
            return Obj("beacon", parent, beaconMesh, m, false).transform;
        }

        // ------------------------------------------------------------------ hazards
        static Mesh rockGeo; static Material rockMat;
        public virtual void Hazards()
        {
            var t = track;
            float R() => Random.value;
            foreach (var rf in t.rockfalls)
            {
                if (rockfallsDone.Contains(rf) || maxS < rf.s - 70 || maxS > rf.s) continue;
                rockfallsDone.Add(rf);
                // a few boulders tumble off the wall ahead of the car
                int n = 2 + (int)Math.Floor(R() * 3);
                for (int i = 0; i < n; i++)
                {
                    double s = rf.s + 15 + i * 6 + R() * 8;
                    int j = Track.JsRoundI(s / Track.STEP);
                    double d = rf.side * (t.width[j] / 2 + 6 + R() * 4);
                    var p = t.PosAt(s, d);
                    double r = 0.5 + R() * 0.6;
                    if (!rockGeo) { var rg = Sphere(1, 7, 5); rockGeo = rg.ToMesh("rock"); MarkCached(rockGeo); rockMat = Std("hazardRock", 0x77736c, 0.95f); }
                    var mesh = Obj("rock", g.worldScene, rockGeo, rockMat, true);
                    mesh.transform.localScale = Vector3.one * (float)r;
                    double inward = -rf.side;
                    dynamic.Add(new WorldCollider { t = "s", x = p.x, y = p.y + 6 + R() * 5, z = p.z, r = r, m = 900 * r * r * r, vx = t.rx[j] * inward * (4 + R() * 3), vy = 0, vz = t.rz[j] * inward * (4 + R() * 3), mesh = mesh, life = 12, rock = true });
                }
                Au?.Burst(freq: 140, q: 0.4f, type: FilterType.Lowpass, dur: 2.2f, gain: 0.5f, buf: NoiseBufs.Brown);
                g.ui.Notice("ROCKFALL", "", true, 1500);
            }
        }

        void DestroyMesh(WorldCollider r) { var mt = AsT(r.mesh); if (mt) GameMesh.Destroy(mt.gameObject); spinRot.Remove(r); }

        public void UpdateDynamic(double dt)
        {
            var t = track;
            for (int i = dynamic.Count - 1; i >= 0; i--)
            {
                var r = dynamic[i];
                r.life -= dt;
                r.vy -= 9.8 * dt;
                r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
                double h = t.Height(r.x, r.z) + r.r;
                if (r.y < h) { r.y = h; if (r.vy < 0) r.vy = -r.vy * 0.35; r.vx *= 0.985; r.vz *= 0.985; }
                if (r.life <= 0) { DestroyMesh(r); dynamic.RemoveAt(i); }
            }
            // knocked-over barrels
            foreach (var o in t.obstacles) foreach (var c in o.colliders)
                {
                    if (!c.hit || !c.HasHome) continue;
                    c.vy -= 9.8 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
                    double h = t.Height(c.x, c.z) + 0.4;
                    if (c.y < h) { c.y = h; c.vy *= -0.3; c.vx *= 0.9; c.vz *= 0.9; }
                    var mt = AsT(c.mesh);
                    if (mt)
                    {
                        var rot = spinRot.TryGetValue(c, out var rr) ? rr : Vector2.zero;
                        rot.x += (float)(c.vz * dt * 0.5); rot.y += (float)(c.vx * dt * 0.5);
                        spinRot[c] = rot;
                        mt.SetPositionAndRotation(Coord.ToUnity(c.x, c.y - 0.45, c.z), SimEuler(rot.x, 0, rot.y));
                    }
                }
        }

        // ------------------------------------------------------------------ bonuses, regions
        public virtual void Bonuses(double dt)
        {
            var v = vehicle;
            maxDrift = Math.Max(maxDrift, v.drift);
            if (v.drift > 1.5 && !drifting) drifting = true;
            if (drifting && v.drift < 0.2)
            {
                drifting = false;
                double secs = lastDrift;
                if (secs > 1.5 && active) { double b = Math.Round(secs * 40 / 5) * 5; bonus.stunts += b; runCash += b; g.ui.Feed("DRIFT " + secs.ToString("0.0", Inv) + "s", b); }
            }
            lastDrift = v.drift;
            if (v.dmg.engine < 0.25 && v.dmg.engine > 0) criticalDistance += v.speed * dt;
            var up = v.GetUp(new Vehicle.Vec3());
            if (up.y < 0.1) rolled = true;
            if (rolled && up.y > 0.9 && v.wheelsOnGround >= 3 && v.speed > 3 && !recoveredRoll) { recoveredRoll = true; g.ui.Feed("SHINY SIDE UP", 0); }
            topSpeed = Math.Max(topSpeed, v.kmh);
            // contextual hints, once
            var H = hints; var ui = g.ui; bool touch = g.input.isTouch;
            if (!H.brake && active && v.speed > 18 && time > 6)
            {
                int j = Track.JsRoundI(maxS / Track.STEP);
                double k = 0; for (int u = 0; u < 40; u++) k = Math.Max(k, Math.Abs(track.k[Math.Min(track.N - 1, j + u)]));
                if (k > 1.0 / 40) { H.brake = true; ui.Hint(touch ? "BRAKE BEFORE THE BEND" : "<kbd>S</kbd> BRAKE BEFORE THE BEND", 2600); }
            }
            if (!H.hand && active && track.isHairpin[Math.Min(track.N - 1, Track.JsRoundI(maxS / Track.STEP) + 30)] != 0) { H.hand = true; ui.Hint(touch ? "HANDBRAKE SWINGS THE TAIL ROUND" : "<kbd>SPACE</kbd> HANDBRAKE FOR HAIRPINS", 3200); }
            if (!H.turbo && active && v.p.boostCap > 0 && time > 12) { H.turbo = true; ui.Hint(touch ? "TURBO GIVES A BURST OF POWER" : "<kbd>SHIFT</kbd> TURBO BOOST", 2600); }
            if (!H.cam && active && time > 25 && !touch) { H.cam = true; ui.Hint("<kbd>C</kbd> CHANGE CAMERA", 2200); }
        }

        public virtual void RegionCheck()
        {
            var t = track;
            int bi = t.BiomeIndex(maxS);
            if (bi != region)
            {
                bool first = region == -1;
                region = bi;
                var b = t.m.biomes[bi];
                if (!first) g.ui.Notice(b.name, U.FmtKm(b.start - startS + 30) + " KM", false, 2800);
            }
        }

        // ------------------------------------------------------------------ audio
        public void Audio(double dt)
        {
            var a = Au; var v = vehicle;
            if (a == null) return;
            if (engine == null) { engine = new EngineVoice(a, GameHelpers.Sound(car)); engine.SetRunning(!countdown); }
            if (road == null) road = new RoadVoice(a);
            bool pops = engine.Update((float)dt, (float)v.rpm, (float)v.p.engine.redline, (float)v.input.throttle, (float)v.boost, (float)v.limiter, (float)v.dmg.engine, ended ? 0.6f : 1);
            if (pops && model != null)
                foreach (var tip in model.exhaustTips)
                {
                    var ep = model.LocalToWorld(tip);
                    g.particles.glow.Emit(ep.x, ep.y, ep.z, (float)(v.vel.x * 0.9), 0, (float)(v.vel.z * 0.9), 0.08f, 0.5f, 0.2f, 0.9f, 1, 0.55f, 0.2f, 0, 1);
                }
            double paved = 0, loose = 0, inWater = 0; SurfInfo si = null;
            foreach (var w in v.wheels)
            {
                if (!w.contact) continue;
                var s = Track.SURF_INFO[w.surf];
                si = s;
                if (s.group == 0) paved = Math.Max(paved, w.slip); else loose = Math.Max(loose, w.slip);
                if (s.splash != 0) inWater = 1;
            }
            var rsi = v.wheelsOnGround != 0 ? si : null;
            road.Update((float)v.speed, (float)(v.wheelsOnGround != 0 ? paved : 0), (float)loose, rsi != null ? (float)rsi.rough : 0, rsi != null ? rsi.group : 0, rsi != null && rsi.snow != 0, (float)v.scrape, (float)inWater, ended ? 0.5f : 1);
            var L = g.env?.look;
            double tun = g.env != null ? g.env.tunnel : 0;
            double wf = g.world != null ? g.world.NearestWaterfall(V(v.pos.x, v.pos.y, v.pos.z)) : double.PositiveInfinity;
            a.ambience?.Update((float)dt, (float)((L != null && L.wind != 0 ? L.wind : 0.3) * 0.8 + 0.1), (float)((L?.birds ?? 0) * (1 - tun)), 0.6f, (float)U.Clamp(1 - wf / 140, 0, 1), (float)((L?.rain ?? 0) * (1 - tun)));
            a.SetReverb((float)(tun * 0.7));
            // thunder: Env plays its scheduled events itself (env.autoThunder)
            // music intensity: speed, danger, record chase
            double danger = (1 - v.hp / v.p.hpPool) * 0.4 + (v.fuel / v.p.fuel < 0.15 ? 0.25 : 0);
            double inten = U.Clamp(v.speed / 45, 0, 1) * 0.6 + danger + (record ? 0.15 : 0) + (best > 0 && maxS - startS > best - 300 && !record ? 0.2 : 0);
            a.musicGen?.SetIntensity((float)inten);
        }

        // ------------------------------------------------------------------ HUD
        public virtual void Hud(double dt)
        {
            var v = vehicle; var sv = g.save.data;
            fpsAcc += dt; fpsN++;
            if (fpsAcc > 0.5) { fps = (int)Math.Round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
            bool mph = sv.settings.units == "mph";
            double sp = Math.Abs(v.fwdSpeed) * 3.6 * (mph ? 0.621 : 1);
            g.ui.HudSpeedo(new SpeedoData
            {
                speed = sp, units = mph ? "MPH" : "KM/H", rpm = v.rpm, redline = v.p.engine.redline,
                gear = v.shiftT > 0 ? "–" : v.gear == -1 ? "R" : v.gear.ToString(), boostCap = v.p.boostCap, boostTank = v.p.boostCap != 0 ? v.boostTank / v.p.boostCap : 0,
                boost = v.boost, overboost = v.overboost,
                lowFuel = v.fuel / v.p.fuel < 0.15, engineWarn = v.dmg.engine < 0.4, brakeWarn = v.dmg.brakes < 0.4 || v.brakeTemp / v.p.brakeFade > 0.8, hot = v.heat > 0.95,
            });
            hudT += dt;
            if (hudT < 0.08) return;
            hudT = 0;
            var b = track.Biome(maxS);
            g.ui.Hud(new HudData
            {
                dist = maxS - startS, record = record, cash = sv.cash + runCash,
                fuel = v.fuel, fuelFrac = v.fuel / v.p.fuel, hp = v.hp / v.p.hpPool,
                parts = new HudParts { engine = v.dmg.engine, tires = v.tireHealth, susp = v.dmg.susp, brakes = Math.Min(v.dmg.brakes, 1 - U.Clamp(v.brakeTemp / v.p.brakeFade - 0.6, 0, 1)) },
                region = b.name, fps = sv.settings.showFps ? fps + " FPS" : "",
            });
        }

        // ------------------------------------------------------------------ ending
        public virtual void CheckEnd(double dt)
        {
            var v = vehicle; var t = track;
            var q = v.lastQuery;
            if (v.destroyed) { Finish("VEHICLE DESTROYED", "WRECKED"); return; }
            if (v.pos.y < t.RoadY(q.s) - 22 || (q.dist > 70 && v.pos.y < q.h + 0.5 && v.pos.y < t.RoadY(q.s) - 8)) { Finish("OVER THE EDGE", "GONE"); return; }
            if (maxS >= t.length) { Finish("BOTTOM OF THE MOUNTAIN", "MOUNTAIN COMPLETE", true); return; }
            var up = v.GetUp(new Vehicle.Vec3());
            if (up.y < 0.25 && v.speed < 2)
            {
                flipT += dt;
                if (flipT > 2.2)
                {
                    if (recoveries > 0) { recoveries--; flipT = 0; Recover(); }
                    else { Finish("OVERTURNED", "RUN OVER"); return; }
                }
            }
            else flipT = 0;
            bool noPower = v.fuel <= 0 || v.dmg.engine <= 0;
            if (noPower && v.speed < 0.6) { stopT += dt; if (stopT > 2.2) { Finish(v.fuel <= 0 ? "OUT OF FUEL" : "ENGINE FAILURE", "RUN OVER"); return; } }
            else stopT = 0;
            if (maxS > lastS + 3) { lastS = maxS; stuckT = 0; }
            else { stuckT += dt; if (stuckT > 25) { Finish("STUCK", "RUN OVER"); return; } }
        }

        // right the car on the road where it stopped (costs some condition)
        public void Recover()
        {
            var v = vehicle; var q = v.lastQuery;
            double hp = v.hp, fuel = v.fuel;
            var dmg = v.dmg;
            var wh = v.wheels.Select(w => (w.health, w.toe)).ToArray();
            double d = Math.Max(-q.halfW + 1.2, Math.Min(q.halfW - 1.2, q.d));
            v.Reset(Math.Max(startS, q.s), d);
            v.dmg = dmg; v.fuel = fuel; v.hp = hp - v.p.hpPool * 0.08;
            for (int i = 0; i < v.wheels.Length; i++) { v.wheels[i].health = wh[i].health; v.wheels[i].toe = wh[i].toe; }
            if (v.fuel > 0 && v.dmg.engine > 0) engine?.SetRunning(true);
            rolled = false;
            g.ui.Notice("BACK ON YOUR WHEELS", recoveries == 1 ? "1 RECOVERY LEFT" : "LAST RECOVERY USED", true, 2000);
            Au?.Metal(0.4f, 240);
        }

        public virtual void Finish(string reason, string title, bool complete = false)
        {
            if (ended) return;
            ended = true;
            active = false;
            // slow motion beat
            timeScale = complete ? 1 : 0.3;
            timers.After(complete ? 0 : 900, () => timeScale = 1);
            if (!complete) timers.After(700, () => { if (engine != null) { engine.SetRunning(false); Au?.Burst(freq: 160, type: FilterType.Lowpass, dur: 0.6f, gain: 0.25f, buf: NoiseBufs.Brown); } });
            Au?.musicGen?.SetIntensity(0);
            g.Platform("gameplayStop");
            timers.After(complete ? 1800 : 1500, () => Payout(reason, title, complete));
            if (complete) g.ui.Notice("MOUNTAIN COMPLETE", "HOLLOW PEAK CONQUERED", true, 3600);
        }

        public void Payout(string reason, string title, bool complete)
        {
            var sv = g.save.data; var v = vehicle;
            double dist = Math.Max(0, maxS - startS);
            double dkm = dist / 1000;
            double oldBest = sv.best.TryGetValue(mountain ?? "", out var ob) ? ob : 0;
            bool isRecord = dist > oldBest + 1;
            double mult = Upgrades.GarageEarnMult(sv.garageLevel) * (mountain == "m2" ? 1.35 : 1);
            double distR = Math.Round((300 * dkm + 40 * dkm * dkm) * mult);
            double recR = isRecord ? Math.Round((100 + (dist - oldBest) * 0.6) * mult) : 0;
            double condFrac = U.Clamp(v.hp / v.p.hpPool, 0, 1);
            double condR = Math.Round(condFrac * dkm * 60 * mult);
            double completeR = complete ? (mountain == "m2" ? 60000 : 25000) : 0;
            var lines = new List<string[]>();
            string M(double x) => "+" + U.FmtMoney(x);
            if (isRecord && oldBest > 0) lines.Add(new[] { "NEW RECORD", M(recR) });
            else if (isRecord) lines.Add(new[] { "FIRST DISTANCE", M(recR) });
            lines.Add(new[] { "DISTANCE REWARD", M(distR) });
            double pickCash = runCash - bonus.shortcuts - bonus.stunts - bonus.crates;
            if (pickCash > 0) lines.Add(new[] { "CASH COLLECTED", M(pickCash) });
            if (bonus.crates != 0) lines.Add(new[] { "BONUS CRATES", M(bonus.crates) });
            if (bonus.shortcuts != 0) lines.Add(new[] { "SHORTCUTS", M(bonus.shortcuts) });
            if (bonus.stunts != 0) lines.Add(new[] { "AIRTIME & DRIFTS", M(bonus.stunts) });
            lines.Add(new[] { "CONDITION BONUS", M(condR) });
            if (completeR != 0) lines.Add(new[] { "MOUNTAIN COMPLETE", M(completeR) });
            double total = distR + recR + runCash + condR + completeR;
            lastTotal = total;
            sv.cash += total; sv.totalEarned += total;
            if (isRecord) sv.best[mountain] = dist;
            var st = sv.stats;
            double S(string k) => st.TryGetValue(k, out var x) ? x : 0;
            st["runs"] = S("runs") + 1; st["distance"] = S("distance") + dist; st["topSpeed"] = Math.Max(S("topSpeed"), topSpeed); st["cashCollected"] = S("cashCollected") + runCash;
            var cs = SaveManager.CarState(sv, car.id);
            foreach (var c in rareParts) { cs.levels[c] = (cs.levels.TryGetValue(c, out var l) ? l : 0) + 1; lines.Add(new[] { "RARE PART", c.ToUpperInvariant() + " +1" }); }
            if (complete && !sv.completed.Contains(mountain))
            {
                sv.completed.Add(mountain);
                if (mountain == "m1" && !sv.unlocked.Contains("m2")) { sv.unlocked.Add("m2"); timers.After(1200, () => g.ui.Toast("UNLOCKED <b>MOUNTAIN II · THE CANYON</b>", 5000)); }
            }
            var runInfo = new RunInfo { distance = dist, mountain = mountain, criticalDistance = criticalDistance, fumes = fumes, maxAir = maxAir, maxDrift = maxDrift, recoveredRoll = recoveredRoll };
            g.CheckAchievements(runInfo);
            g.save.Save(); g.save.Flush();
            var d = v.dmg;
            var sd = new SummaryData { reason = reason, title = complete ? "MOUNTAIN COMPLETE" : "RUN OVER", distance = dist, record = isRecord && oldBest > 0, lines = lines, total = total, next = g.NextGoalText() };
            sd.condition.Add(new KeyValuePair<string, double>("BODY", condFrac));
            sd.condition.Add(new KeyValuePair<string, double>("ENGINE", d.engine));
            sd.condition.Add(new KeyValuePair<string, double>("TYRES", v.tireHealth));
            sd.condition.Add(new KeyValuePair<string, double>("SUSP", d.susp));
            sd.condition.Add(new KeyValuePair<string, double>("BRAKES", d.brakes));
            g.ui.Summary(sd);
            g.ui.Show("hud", false); g.ui.Show("touch", false);
            if (isRecord) g.Platform("happytime");
            _ = title;
        }

        // cleanup when leaving to the garage
        public virtual void Stop()
        {
            active = false; ended = true; cdToken++;
            timers.Clear();
            engine?.SetRunning(false);
            road?.Stop();
            foreach (var m in pickMeshes.Values) DestroyTree(m);
            pickMeshes.Clear(); pickInfo.Clear();
            foreach (var r in dynamic) DestroyMesh(r);
            dynamic.Clear();
            animals?.Clear();
            g.BodyClass("cockpit", false);
            if (model != null) { model.SetGlassOpacity(0.72f); model.Dispose(); model = null; }
            if (engine != null) { engine.Dispose(); engine = null; }
            if (headlight) headlight.intensity = 0;
            g.Platform("gameplayStop");
        }
    }
}

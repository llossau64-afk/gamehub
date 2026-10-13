// A race (port of game/race.js): up to eight cars (the player, bots and/or online players)
// on a circuit or a point-to-point sprint. Reuses the single-car Run for the player's
// camera, effects, audio and damage handling, and adds the field, laps, positions and the
// result. Laps / order / result rows are in RaceLogic (Unity free).
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Downfall.Audio;
using Random = UnityEngine.Random;

namespace Downfall
{
    // Unity-side entrant fields
    public sealed partial class Entrant
    {
        public CarView model;
        public EngineVoice voice;
    }

    public class Race : Run
    {
        static readonly string[] BOT_NAMES = { "K. TAKAHASHI", "M. SCHNEIDER", "L. MOREAU", "R. OKADA", "J. BAUER", "C. LEFEVRE", "S. ROSSI", "T. NAKAMURA", "F. WEBER", "A. DUBOIS", "H. MORI", "E. KLEIN", "N. GIRARD", "D. FISCHER" };
        static readonly int[] BOT_PAINTS = { 0xc81e1e, 0x1e5ac8, 0xf0c020, 0x1a1a1a, 0xe8e8e8, 0x2a8a3a, 0xe86a10, 0x7a2ac8, 0x18a0b8, 0x9a9da2 };
        public static double[] PRIZE => RaceLogic.PRIZE;
        public static string FmtTime(double t) => RaceLogic.FmtTime(t);

        public List<Entrant> field = new List<Entrant>();
        public List<Entrant> order = new List<Entrant>();
        public List<Entrant> finishOrder = new List<Entrant>();
        public readonly Presentation pres;
        public RaceConfig cfg;
        public MapDef map;
        public int laps;
        public Entrant me;
        public double raceTime;
        public bool resultShown, introDone;
        bool botSkids = true;
        double rhT;
        readonly List<NameTag> tags = new List<NameTag>();

        public Race(IGameHost game) : base(game)
        {
            pres = new Presentation(this);
        }

        public bool online => cfg != null && cfg.net != null;

        // cfg: { map, opponents, net }
        public void StartRace(string carId, RaceConfig cfg)
        {
            this.cfg = cfg;
            map = cfg.map;
            laps = track.loop ? cfg.map.laps : 1;
            Start(carId);
        }

        // ------------------------------------------------------------------ setup
        public void ClearField()
        {
            foreach (var e in field)
            {
                if (e.isPlayer) continue;
                e.model?.Dispose();
                e.voice?.Dispose(); e.voice = null;
            }
            field = new List<Entrant>();
            g.ui.Tags(new List<NameTag>());
        }

        // cars around the player's performance: similar top speed, random upgrades to match
        public List<(CarDef car, Dictionary<string, int> levels)> PickOpponents(int n)
        {
            double mine = stats.top;
            var pool = Cars.CARS.Select(c => (c, d: Math.Abs(Stats.ComputeStats(c, new Dictionary<string, int>(), "street").top - mine))).OrderBy(x => x.d).Take(8).ToList();
            var outl = new List<(CarDef, Dictionary<string, int>)>();
            for (int i = 0; i < n; i++)
            {
                var c = pool[(int)Math.Floor(Random.value * Math.Min(pool.Count, 6)) % pool.Count].c;
                var levels = Stats.DefaultLevels();
                var mx = Stats.MaxStats(c);
                var bs = Stats.ComputeStats(c, new Dictionary<string, int>(), "street");
                double f = U.Clamp((mine - bs.top) / Math.Max(1, mx.top - bs.top), 0, 1) * (0.75 + Random.value * 0.4);
                foreach (var k in c.caps.Keys.ToList()) levels[k] = (int)Math.Round(c.caps[k] * U.Clamp(f, 0, 1), MidpointRounding.AwayFromZero);
                outl.Add((c, levels));
            }
            return outl;
        }

        public (double s, double d) SlotPos(int k) => RaceLogic.SlotPos(track, startS, k);

        public override void Restart(bool first = false)
        {
            var t = track;
            t.pickups = new List<TrackPickup>(); t.rockfalls = new List<TrackRockfall>();
            pres?.Dispose();
            if (model != null) model.visible = true;
            base.Restart(first);
            g.BodyClass("race-mode", true);
            ClearField();
            startS = t.loop ? 0 : 60;
            int nOpp = online ? 0 : (int)U.Clamp(cfg.opponents ?? 5, 0, 7);
            int total = nOpp + 1 + (online ? cfg.net.RemoteCount() : 0);
            int mySlot = online ? cfg.net.MySlot() : Math.Min(total - 1, Math.Max(0, total / 2));
            var mine = new Entrant { isPlayer = true, name = "YOU", vehicle = vehicle, model = model, car = car, stats = stats, color = "#e2a33b" };
            var sp = SlotPos(mySlot);
            vehicle.Reset(t.WrapS(sp.s), sp.d);
            vehicle.fuel = vehicle.p.fuel; vehicle.p = vehicle.p.Clone(); vehicle.p.fuelUse = 0;
            mine.lastS = t.WrapS(sp.s);
            mine.lap = t.loop && sp.s < 0 ? -1 : 0;
            field.Add(mine);
            me = mine;
            // bots
            var opp = PickOpponents(nOpp);
            var names = BOT_NAMES.ToList();
            for (int i = names.Count - 1; i > 0; i--) { int j = (int)(Random.value * (i + 1)) % (i + 1); (names[i], names[j]) = (names[j], names[i]); }
            int slot = 0;
            for (int i = 0; i < opp.Count; i++)
            {
                var o = opp[i];
                if (slot == mySlot) slot++;
                var p = SlotPos(slot++);
                var st = Stats.ComputeStats(o.car, o.levels, "perf");
                var bm = new CarView(o.car, new CarViewOpts { levels = o.levels, tire = "perf", stats = st, paint = BOT_PAINTS[i % BOT_PAINTS.Length] });
                bm.HideParts("interior", "dash", "cabin", "seats", "steering", "gauges");
                bm.Bake();
                bm.group.SetParent(g.worldScene, true);
                var v = new Vehicle(t, o.car, st);
                v.assist = 1;
                v.Reset(t.WrapS(p.s), p.d);
                v.p = v.p.Clone(); v.p.fuelUse = 0;
                field.Add(new Entrant
                {
                    isBot = true, name = names[i % names.Count], vehicle = v, model = bm, car = o.car, stats = st,
                    color = GameHelpers.Hex6(BOT_PAINTS[i % BOT_PAINTS.Length]), skill = 0.9 + Random.value * 0.12, lane = p.d, lastS = t.WrapS(p.s), lap = t.loop && p.s < 0 ? -1 : 0,
                });
            }
            if (online) cfg.net.Attach(this, SlotPos);
            // collision boxes so the cars bump into each other
            foreach (var e in field)
            {
                var d = e.model.dims;
                e.box = new WorldCollider { t = "b", x = 0, y = 0, z = 0, hx = d.W / 2, hy = (d.roof - d.bottom) / 2, hz = d.L / 2, yaw = 0, m = e.vehicle.m, vx = 0, vy = 0, vz = 0, s = 0 };
            }
            foreach (var e in field)
            {
                e.vehicle.carCols = field.Where(o => o != e).Select(o => o.box).ToList();
                e.vehicle.animalCols = animals?.cols;
            }
            raceTime = 0;
            finishOrder = new List<Entrant>();
            resultShown = false;
            g.ui.RaceHudInit(field.Count, laps, track);
            SyncBots(0);
            SyncModel(0.016);
            PlaceIntroCamera();
            // the event intro: establishing shots, the hero car, the grid -- then the countdown
            double left = online ? CountdownDelay() / 1000 : introDone ? 3.2 : RaceLogic.INTRO_SECONDS;
            if (left > 2) pres.StartIntro(left);
            else if (!online) startCountdownNow?.Invoke();
        }

        // ------------------------------------------------------------------ loop
        static bool EnterOrSpace() => GameInput.Pressed(KeyCode.Return, KeyCode.KeypadEnter, KeyCode.Space);

        public override void Update(double rawDt)
        {
            timers.Tick(rawDt);
            var v = vehicle;
            if (pres.mode == "podium" || pres.mode == "after")
            {
                if (pres.mode == "podium" && EnterOrSpace()) pres.EndPodium();
                else pres.Update(rawDt);
                return;
            }
            if (pres.mode == "intro" && EnterOrSpace()) { pres.Skip(); introDone = true; }
            double dt = rawDt * timeScale;
            time += dt;
            var inp = g.input.state;
            if (active && !me.finished && g.debug != null && g.debug.bot) AiDrive(me, dt);
            else if (active && !me.finished)
            {
                v.input.throttle = inp.throttle; v.input.brake = inp.brake; v.input.steer = inp.steer;
                v.input.handbrake = inp.handbrake; v.input.boost = inp.boost;
            }
            else if (me.finished) AiDrive(me, dt, 0.55);
            // on the grid: held on the handbrake (a held foot brake at standstill engages reverse)
            else { v.input.throttle = 0; v.input.brake = 0; v.input.steer = 0; v.input.handbrake = 1; v.input.boost = 0; v.gear = 1; }
            if (g.input.CameraPressed) CycleCamera();
            if (GameInput.Pressed(KeyCode.R) && active && !me.finished) ResetCar(me, true);
            // bots decide
            foreach (var e in field) if (e.isBot) { if (go) AiDrive(e, dt); else HoldOnGrid(e); }
            // physics for everyone
            foreach (var e in field)
            {
                var b = e.box; var ve = e.vehicle;
                b.vx = ve.vel.x; b.vy = ve.vel.y; b.vz = ve.vel.z; e.v0[0] = b.vx; e.v0[1] = b.vy; e.v0[2] = b.vz;
            }
            foreach (var e in field)
            {
                if (e.remote) continue;
                if (!countdown || go) e.vehicle.Update(dt); else e.vehicle.Update(dt * 0.5);
            }
            // nobody creeps off the grid before the start
            if (!go) foreach (var e in field) if (!e.remote) { e.vehicle.vel.x = 0; e.vehicle.vel.z = 0; e.vehicle.angVel.y = 0; }
            // car-to-car impulses collected on the boxes go back to their owners
            foreach (var e in field)
            {
                if (e.remote) continue;
                var b = e.box; var ve = e.vehicle;
                ve.vel.x += b.vx - e.v0[0]; ve.vel.y += b.vy - e.v0[1]; ve.vel.z += b.vz - e.v0[2];
            }
            UpdateDynamic(dt);
            if (go && !ended) raceTime += dt;
            ProgressAll();
            animals?.Update(dt, v, me.progress + startS);
            maxS = v.lastQuery.s;
            HandleEvents();
            BotEvents();
            SyncModel(rawDt);
            SyncBots(rawDt);
            Effects(dt);
            UpdateCamera(rawDt);
            Audio(dt);
            BotAudio(dt);
            Hud(rawDt);
            cfg.net?.Update(dt, this);
            UpdateTags();
            if (active && !ended) CheckEnd(dt);
            g.world?.Update(track.loop ? v.lastQuery.s : Math.Max(maxS, startS), 1);
        }

        // ------------------------------------------------------------------ online
        public Entrant AddRemote(Entrant e)
        {
            e.remote = true;
            field.Add(e);
            return e;
        }
        public void RemoteFinished(Entrant e, double time)
        {
            e.finished = true; e.finishTime = time;
            finishOrder.Add(e);
            finishOrder = finishOrder.OrderBy(x => x.finishTime).ToList();
        }
        public void RemoteLeft(Entrant e) { e.dnf = true; e.left = true; }

        public override double CountdownDelay()
        {
            var n = cfg?.net;
            if (n != null && n.startAt != 0) return Math.Max(0, n.startAt - GameHelpers.NowMs() - 2850);
            // offline the intro itself starts the countdown when it ends (game clock, not wall clock)
            return 600000;
        }

        public override void UpdateCamera(double dt)
        {
            if (pres.Update(dt)) return;
            base.UpdateCamera(dt);
        }

        // name tags over the other drivers (online: real players); the UI projects them
        public void UpdateTags()
        {
            tags.Clear();
            bool show = online && !pres.active;
            var cam = g.camera;
            if (show && cam)
            {
                var cp = Coord.FromUnity(cam.transform.position);
                foreach (var e in field)
                {
                    if (e.isPlayer || !e.remote || e.gone) continue;
                    var v = e.vehicle;
                    double d = Math.Sqrt((v.pos.x - cp.x) * (v.pos.x - cp.x) + (v.pos.z - cp.z) * (v.pos.z - cp.z));
                    if (d >= 260) continue;
                    tags.Add(new NameTag { pos = Coord.ToUnity(v.pos.x, v.pos.y, v.pos.z), name = e.name, color = e.color, label = e.pos != 0 ? e.pos.ToString() : "" });
                }
            }
            g.ui.Tags(tags);
        }

        public void HoldOnGrid(Entrant e)
        {
            var v = e.vehicle;
            v.input.throttle = 0; v.input.brake = 0; v.input.handbrake = 1; v.input.steer = 0; v.input.boost = 0; v.gear = 1;
        }

        public void ProgressAll()
        {
            order = RaceLogic.ProgressAll(field, track, laps, startS, raceTime, go,
                (e, lt) =>
                {
                    if (e.isPlayer && e.lap < laps && e.lap >= 1)
                        g.ui.Notice(e.lap == laps - 1 ? "FINAL LAP" : "LAP " + (e.lap + 1) + " / " + laps, FmtTime(lt), e.lap == laps - 1, 1800);
                },
                e =>
                {
                    finishOrder.Add(e);
                    if (e.isPlayer) Finish("FINISH", "RACE COMPLETE", true);
                });
        }

        // ------------------------------------------------------------------ AI
        readonly AiOptions aiOpts = new AiOptions();
        public void AiDrive(Entrant e, double dt, double cruise = 1)
        {
            aiOpts.cruise = cruise; aiOpts.go = go; aiOpts.me = me;
            if (BotAI.AiDrive(e, field, track, dt, aiOpts)) ResetCar(e);
        }

        // put a car back on the road where it left it
        public void ResetCar(Entrant e, bool player = false)
        {
            var t = track; var v = e.vehicle; var q = v.lastQuery;
            int lap = e.lap;
            double d = U.Clamp(q.d, -t.width[q.idx] / 2 + 1.5, t.width[q.idx] / 2 - 1.5);
            var dmg = v.dmg; double hp = v.hp, nitro = v.nitro;
            v.Reset(t.WrapS(q.s), d);
            v.dmg = dmg; v.hp = hp; v.nitro = nitro;
            v.vel.x = v.vel.z = 0;
            e.lap = lap; e.flipT = 0; e.stuckT = 0;
            if (player) { g.ui.Notice("BACK ON TRACK", "", false, 1000); Au?.Ui("click"); }
        }

        public void SyncBots(double dt)
        {
            for (int fi = 0; fi < field.Count; fi++)
            {
                var e = field[fi];
                if (e.isPlayer) continue;
                var v = e.vehicle; var m = e.model;
                if (m == null) continue;
                if (!e.remote)
                {
                    m.SetPose(v.pos, v.q);
                    m.UpdateFromVehicle(v, dt != 0 ? dt : 0.016);
                }
                // flames when a bot fires its nitro
                if (dt != 0) Flames(m, v, dt, false);
                // tyre marks + smoke for the other cars too
                if (dt != 0)
                {
                    int idx = 4 + fi * 4;
                    var right = v.GetRight(new Vehicle.Vec3());
                    foreach (var w in v.wheels)
                    {
                        if (botSkids)
                        {
                            try
                            {
                                if (!w.contact) g.skids.Add(idx + w.i, 0, 0, 0, 0, 0, 0, 0);
                                else g.skids.Add(idx + w.i, (float)w.gx, (float)(w.gy - v.p.r + 0.02), (float)w.gz, (float)right.x, (float)right.z, (float)(m.wheelWidth * 0.8), (float)U.Clamp(w.slip * 1.2, 0, 1));
                            }
                            catch (IndexOutOfRangeException) { botSkids = false; } // SkidMarks sized for the player's 4 wheels only
                        }
                        if (w.contact && w.slip > 0.45 && v.speed > 3 && Random.value < dt * 20 * w.slip) g.particles.TireSmoke((float)w.gx, (float)(w.gy - v.p.r), (float)w.gz, (float)v.vel.x, (float)v.vel.z);
                    }
                }
            }
            foreach (var e in field)
            {
                var b = e.box; var v = e.vehicle;
                var fw = v.GetForward(new Vehicle.Vec3());
                b.x = v.pos.x; b.y = v.pos.y; b.z = v.pos.z; b.yaw = Math.Atan2(fw.x, fw.z); b.s = v.lastQuery.s;
            }
        }

        public void BotEvents()
        {
            foreach (var e in field)
            {
                if (e.isPlayer || e.remote) continue;
                var v = e.vehicle;
                bool dmg = false;
                foreach (var ev in v.events)
                {
                    if (ev.type == "smash") SmashEvent(ev, false);
                    else if (ev.type == "damage" && ev.amount > 0.01 && ev.zone != "susp") e.model.Dent(ev.lx, ev.ly, ev.lz, ev.amount * 1.6);
                    else if (ev.type == "impact" && ev.speed > 6)
                    {
                        double k = U.Clamp((ev.speed - 2) / 14, 0, 1);
                        g.particles.Sparks((float)ev.x, (float)ev.y, (float)ev.z, (float)v.vel.x, 1, (float)v.vel.z, (int)Math.Round(4 + k * 12));
                        double dd = Math.Sqrt((ev.x - vehicle.pos.x) * (ev.x - vehicle.pos.x) + (ev.z - vehicle.pos.z) * (ev.z - vehicle.pos.z));
                        if (dd < 40) Au?.Impact((float)(ev.speed * U.Clamp(1 - dd / 40, 0, 1)), ev.kind);
                    }
                    if (ev.type == "damage") dmg = true;
                }
                if (dmg) e.model.SyncDamage(v.dmg);
                v.events.Clear();
            }
        }

        // two nearest opponents get an engine voice
        public void BotAudio(double dt)
        {
            var a = Au;
            if (a == null) return;
            var near = field.Where(e => !e.isPlayer).Select(e => (e, d: Math.Sqrt((e.vehicle.pos.x - vehicle.pos.x) * (e.vehicle.pos.x - vehicle.pos.x) + (e.vehicle.pos.z - vehicle.pos.z) * (e.vehicle.pos.z - vehicle.pos.z)))).OrderBy(x => x.d).ToList();
            for (int i = 0; i < near.Count; i++)
            {
                var (e, d) = near[i];
                bool want = i < 2 && d < 120;
                if (want && e.voice == null) { e.voice = new EngineVoice(a, GameHelpers.Sound(e.car)); e.voice.SetRunning(true); }
                if (!want && e.voice != null) { e.voice.Dispose(); e.voice = null; }
                if (e.voice != null)
                {
                    var v = e.vehicle;
                    e.voice.Update((float)dt, (float)v.rpm, (float)v.p.engine.redline, (float)v.input.throttle, (float)v.boost, (float)v.limiter, (float)v.dmg.engine, (float)(U.Clamp(1 - d / 120, 0, 1) * 0.55));
                }
            }
        }

        // ------------------------------------------------------------------ HUD
        public override void Hud(double dt)
        {
            base.Hud(dt);
            rhT += dt;
            if (rhT < 0.1) return;
            rhT = 0;
            var lead = order.Count > 0 ? order[0] : me;
            var d = new RaceHudData
            {
                pos = me.pos, n = field.Count, lap = Math.Min(laps, Math.Max(1, me.lap + 1)), laps = laps, sprint = !track.loop,
                time = FmtTime(raceTime), best = FmtTime(me.bestLap),
                nitro = vehicle.nitro, nitroOn = vehicle.nitroT > 0,
                progress = track.loop ? (double?)null : U.Clamp(me.progress / (track.length - startS), 0, 1),
            };
            foreach (var e in order)
                d.board.Add(new BoardRow
                {
                    name = e.name, pos = e.pos, me = e.isPlayer, color = e.color,
                    gap = e == lead ? (e.finished ? FmtTime(e.finishTime) : "LEADER") : e.finished ? "+" + (e.finishTime - lead.finishTime).ToString("0.0", Inv) + "s" : "-" + Math.Max(0, (lead.progress - e.progress) / Math.Max(10, lead.vehicle.speed)).ToString("0.0", Inv) + "s",
                });
            foreach (var e in field) d.dots.Add(new MapDot { x = e.vehicle.pos.x, z = e.vehicle.pos.z, me = e.isPlayer, color = e.color });
            g.ui.RaceHud(d);
        }

        // ------------------------------------------------------------------ ending
        public override void CheckEnd(double dt)
        {
            var v = vehicle;
            if (v.destroyed) { Finish("WRECKED", "DID NOT FINISH"); return; }
            var up = v.GetUp(new Vehicle.Vec3());
            if (up.y < 0.25 && v.speed < 2) { flipT += dt; if (flipT > 2.2) { flipT = 0; ResetCar(me, true); } } else flipT = 0;
            if (v.lastQuery.dist > v.lastQuery.halfW + 60 || v.pos.y < track.RoadY(v.lastQuery.s) - 30) ResetCar(me, true);
        }

        public override void Finish(string reason, string title, bool complete = false)
        {
            if (ended) return;
            ended = true;
            me.dnf = !complete;
            var a = Au;
            a?.musicGen?.SetIntensity(0.2f);
            if (complete)
            {
                g.ui.Notice(me.pos == 1 ? "YOU WIN" : "P" + me.pos, FmtTime(me.finishTime), me.pos <= 3, 3000);
                if (me.pos == 1) a?.Record();
                pres.StartFinish();
            }
            introDone = true;
            g.Platform("gameplayStop");
            // keep driving the cool-down lap; show the result once the others are in (or after a few seconds)
            timers.After(complete ? 3500 : 1500, ShowResult);
        }

        public void ShowResult()
        {
            if (resultShown) return;
            resultShown = true;
            var sv = g.save.data;
            var rows = RaceLogic.ResultRows(field, finishOrder, me, track, laps, startS, raceTime);
            int myPos = rows.FindIndex(r => r.e == me) + 1;
            double mult = Upgrades.GarageEarnMult(sv.garageLevel);
            double bse = map.reward != 0 ? map.reward : 5000;
            double prize = RaceLogic.Prize(bse, myPos, field.Count, mult, me.dnf);
            var lines = new List<string[]> { new[] { "P" + myPos + " OF " + rows.Count, "+" + U.FmtMoney(prize) } };
            double total = prize;
            bool firstWin = myPos == 1 && !me.dnf && !(sv.wins.TryGetValue(map.id, out var w0) && w0 != 0);
            if (firstWin) { double b = Math.Round(bse * 0.5); lines.Add(new[] { "FIRST WIN ON THIS TRACK", "+" + U.FmtMoney(b) }); total += b; }
            double clean = vehicle.hp / vehicle.p.hpPool;
            if (!me.dnf && clean > 0.9) { double b = Math.Round(bse * 0.08); lines.Add(new[] { "CLEAN RACE", "+" + U.FmtMoney(b) }); total += b; }
            if (me.bestLap < double.PositiveInfinity && track.loop) lines.Add(new[] { "BEST LAP", FmtTime(me.bestLap) });
            sv.cash += total; sv.totalEarned += total;
            sv.races++;
            if (myPos == 1 && !me.dnf) sv.wins[map.id] = (sv.wins.TryGetValue(map.id, out var wn) ? wn : 0) + 1;
            if (myPos <= 3 && !me.dnf) { double old = sv.podiums.TryGetValue(map.id, out var pd) && pd != 0 ? pd : 9; sv.podiums[map.id] = Math.Min(old, myPos); }
            double prevBest = sv.bestLaps.TryGetValue(map.id, out var bl) && bl != 0 && !double.IsNaN(bl) ? bl : double.PositiveInfinity;
            if (me.bestLap < prevBest) sv.bestLaps[map.id] = me.bestLap;
            string gift = g.CheckFreeCar();
            g.save.Save(); g.save.Flush();
            var data = new RaceResultsData
            {
                title = me.dnf ? "DID NOT FINISH" : myPos == 1 ? "VICTORY" : "P" + myPos,
                mapName = map.name, mapCountry = map.country,
                lines = lines, total = total, gift = gift, online = online, host = g.onlineIsHost,
            };
            for (int i = 0; i < rows.Count; i++)
            {
                var r = rows[i];
                data.rows.Add(new ResultRow { pos = i + 1, name = r.e.name, car = r.e.car.name, me = r.e.isPlayer, color = r.e.color, time = double.IsPositiveInfinity(r.t) ? "DNF" : (r.est ? "~" : "") + FmtTime(r.t), best = FmtTime(r.e.bestLap) });
            }
            void panel() => g.ui.RaceResults(data);
            g.ui.Show("hud", false); g.ui.Show("touch", false);
            // podium for the top three, then the result panel
            pres.StartPodium(rows.Select(r => (r.e, double.IsPositiveInfinity(r.t) ? "DNF" : (r.est ? "~" : "") + FmtTime(r.t))).ToList(), panel);
        }

        // ------------------------------------------------------------------ no mountain-run extras
        public override void UpdatePickups() { }
        public override void RegionCheck() { }
        public override void Hazards() { }
        public override void Bonuses(double dt) { }

        public override void Stop()
        {
            pres.Dispose();
            ClearField();
            g.BodyClass("race-mode", false);
            cfg?.net?.Detach();
            base.Stop();
        }
    }
}

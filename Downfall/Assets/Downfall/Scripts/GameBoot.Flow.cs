// main.js game flow: menu, first car, garage (upgrades / tyres / paint / workshop levels / showroom /
// dealer), mountain runs, race select and races, settings, achievements and goals.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;
using Downfall.Audio;
using static Downfall.GameMesh;

namespace Downfall
{
    public sealed partial class GameBoot
    {
        public string tab, browse, upgSel, raceSel;
        public int? raceOpp;
        public int firstIdx = 1;
        public bool installingNow;
        CarStats lastStats;
        bool choosing, driving;

        sealed class Outline { public List<Vector2> pts; public double km; }
        readonly Dictionary<string, Outline> outlines = new Dictionary<string, Outline>();
        bool outlinesRunning;
        readonly Dictionary<string, CarSil> silCache = new Dictionary<string, CarSil>();

        static string Money(double v) => U.FmtMoney(v);
        static double JsRound(double v) => Math.Floor(v + 0.5);
        static string Fixed(double v, int dec) => v.ToString("F" + dec, CultureInfo.InvariantCulture);

        // ------------------------------------------------------------------ races
        static readonly int[] RACE_TIERS = { 0, 2, 5, 9, 14 };
        List<MapInfo> MapInfos()
        {
            var sv = _save.data;
            int races = sv.races;
            var list = new List<MapInfo>();
            foreach (var m in Maps.MAPS)
            {
                int ti = (m.tier != 0 ? m.tier : 1) - 1;
                int need = ti >= 0 && ti < RACE_TIERS.Length ? RACE_TIERS[ti] : 0;
                outlines.TryGetValue(m.id, out var o);
                list.Add(new MapInfo
                {
                    id = m.id, name = m.name, country = m.country, cc = m.country != null && Maps.COUNTRY_CODES.TryGetValue(m.country, out var cc) ? cc : "",
                    region = m.region, desc = m.desc, kind = m.kind, laps = m.laps,
                    km = o != null ? o.km : (m.length != 0 ? m.length : (m.circuit != null ? m.circuit.minLen : 3000)) / 1000,
                    reward = m.reward, locked = races < need, need = need,
                    wins = (int)(sv.wins.TryGetValue(m.id, out var w) ? w : 0),
                    bestLap = sv.bestLaps.TryGetValue(m.id, out var bl) && bl != 0 && !double.IsNaN(bl) && !double.IsInfinity(bl) ? Race.FmtTime(bl) : null,
                    outline = o?.pts, loop = m.kind == "circuit",
                });
            }
            return list;
        }
        // track outlines for the cards are built in the background, one per frame
        IEnumerator BuildOutlines()
        {
            outlinesRunning = true;
            while (true)
            {
                var m = Maps.MAPS.FirstOrDefault(x => !outlines.ContainsKey(x.id));
                if (m == null) break;
                try
                {
                    var t = new Track(m);
                    var pts = new List<Vector2>();
                    int lim = m.kind == "sprint" ? (int)JsRound(t.length / 2) : t.N;
                    lim = Math.Min(lim, t.N);
                    for (int j = 0; j < lim; j += 6) pts.Add(new Vector2((float)t.px[j], (float)t.pz[j]));
                    outlines[m.id] = new Outline { pts = pts, km = t.length / 1000 };
                }
                catch (Exception e) { Debug.LogWarning("[Downfall] outline " + m.id + ": " + e.Message); outlines[m.id] = new Outline { pts = null, km = 3 }; }
                if (state == "racesel") RenderRaceSelect();
                yield return Wait(0.03f);
            }
            outlinesRunning = false;
        }
        public void OpenRaceSelect()
        {
            var sv = _save.data;
            if (sv.owned.Count == 0) { EnterFirst(); return; }
            StopRun();
            state = "racesel";
            if (menuCar == null) SetupMenuScene();
            if (raceSel == null || !Maps.MAPS.Any(m => m.id == raceSel)) raceSel = sv.lastMap != null && Maps.MAPS.Any(m => m.id == sv.lastMap) ? sv.lastMap : Maps.MAPS[0].id;
            if (raceOpp == null) raceOpp = 5;
            ui.Only("racesel");
            RenderRaceSelect();
            if (!outlinesRunning) Co(BuildOutlines());
            Au?.musicGen?.SetMode("menu");
        }
        void RenderRaceSelect()
        {
            ui.RaceSelect(new RaceSelectData { maps = MapInfos(), sel = raceSel, opponents = raceOpp ?? 5, cash = _save.data.cash });
        }

        public void StartRace(string id, int? opponents, IRaceNet net) => Co(StartRaceCo(id, opponents, net));
        IEnumerator StartRaceCo(string id, int? opponents, IRaceNet net)
        {
            var sv = _save.data;
            var map = Maps.MapById(id) ?? Maps.MAPS[0];
            sv.lastMap = map.id; _save.Save();
            yield return ui.FadeCo(true);
            ui.Only();
            StopRun();
            if (mapId != map.id) LoadTrack(map);
            state = "run";
            paused = false;
            if (menuCar != null) menuCar.visible = false;
            if (run != null && !(run is Race) && run.model != null) run.Stop();
            if (!(run is Race)) run = new Race(this);
            run.camMode = sv.settings.camera;
            ((Race)run).StartRace(SelectedCar().id, new RaceConfig { map = map, opponents = opponents ?? raceOpp ?? 5, net = net });
            Au?.ambience?.Update(0);
            yield return Wait(0.12f);
            ui.Fade(false);
        }

        // the free car: five races of any kind earn a solid all-rounder
        const string FREE_CAR = "wasp";
        string FreeCarProgress()
        {
            var sv = _save.data;
            if (sv.owned.Contains(FREE_CAR)) return null;
            return $"{Cars.CarById(FREE_CAR).name} · {Math.Min(5, sv.races)}/5 RACES";
        }
        public string CheckFreeCar()
        {
            var sv = _save.data;
            if (sv.owned.Contains(FREE_CAR) || sv.races < 5) return null;
            sv.owned.Add(FREE_CAR); SaveManager.CarState(sv, FREE_CAR);
            var c = Cars.CarById(FREE_CAR);
            return $"<b>FREE CAR UNLOCKED:</b> the {c.name} ({c.cls.ToLowerInvariant()}) is waiting in your garage.";
        }

        // ------------------------------------------------------------------ helpers
        public CarDef SelectedCar()
        {
            var sv = _save.data;
            return Cars.CarById(sv.selected ?? (sv.owned.Count > 0 ? sv.owned[0] : "rusty"));
        }
        CarStats StatsFor(CarDef car)
        {
            var cs = SaveManager.CarState(_save.data, car.id);
            return Stats.ComputeStats(car, cs.levels, cs.tire, _save.data.garageLevel);
        }
        static double? Stat(CarStats s, string k)
        {
            switch (k)
            {
                case "top": return s.top; case "hp": return s.hp; case "nm": return s.nm; case "grip": return s.grip;
                case "brakes": return s.brakes; case "susp": return s.susp; case "dur": return s.dur; case "fuel": return s.fuel;
                case "kg": return s.kg; case "t100": return s.t100;
            }
            return null;
        }

        // main.js rows(st, mx, prev): the stat block
        List<StatRow> Rows(CarStats st, CarStats mx, CarStats prev)
        {
            StatRow R(string label, string k, string unit, double scale, Func<double, string> fmtv = null, bool inv = false)
            {
                fmtv ??= v => JsRound(v).ToString(CultureInfo.InvariantCulture);
                var sv = Stat(st, k);
                var row = new StatRow
                {
                    label = label, value = sv == null ? "—" : fmtv(sv.Value), unit = unit,
                    frac = sv == null ? 0 : (inv ? 1 - sv.Value / scale : sv.Value / scale),
                };
                if (mx != null)
                {
                    var mv = Stat(mx, k);
                    row.maxFrac = inv ? 1 - (mv is double m && m != 0 ? m : scale) / scale : (mv ?? 0) / scale;
                }
                if (prev != null && sv != null)
                {
                    double dv = sv.Value - (Stat(prev, k) ?? double.NaN);
                    if (!(Math.Abs(dv) < 0.05) && !double.IsNaN(dv) && !double.IsInfinity(dv))
                    {
                        bool good = inv ? dv < 0 : dv > 0;
                        row.delta = (dv > 0 ? "+" : "−") + Fixed(Math.Abs(dv), 0);
                        row.deltaNeg = !good; row.up = good;
                    }
                }
                return row;
            }
            double Acc(double t) => U.Clamp(1 - (t - 2) / 16, 0, 1);
            var t100 = new StatRow
            {
                label = "0–100 KM/H", value = st.t100.HasValue && st.t100 != 0 ? Fixed(st.t100.Value, 1) : "—", unit = "SEC",
                frac = st.t100.HasValue && st.t100 != 0 ? Acc(st.t100.Value) : 0,
                maxFrac = mx != null && mx.t100.HasValue && mx.t100 != 0 ? Acc(mx.t100.Value) : (double?)null,
            };
            if (prev != null && prev.t100.HasValue && prev.t100 != 0 && st.t100.HasValue && st.t100 != 0 && Math.Abs(st.t100.Value - prev.t100.Value) > 0.04)
            {
                t100.delta = (st.t100 < prev.t100 ? "−" : "+") + Fixed(Math.Abs(st.t100.Value - prev.t100.Value), 1);
                t100.deltaNeg = st.t100 > prev.t100; t100.up = st.t100 < prev.t100;
            }
            return new List<StatRow>
            {
                R("TOP SPEED", "top", "KM/H", 420),
                R("POWER", "hp", "HP", 1500),
                R("TORQUE", "nm", "NM", 2400),
                t100,
                R("GRIP", "grip", "/100", 100),
                R("BRAKES", "brakes", "/100", 100),
                R("SUSPENSION", "susp", "/100", 100),
                R("DURABILITY", "dur", "/100", 100),
                R("FUEL", "fuel", "L", 200),
                R("WEIGHT", "kg", "KG", 4600, v => JsRound(v).ToString("#,0", CultureInfo.InvariantCulture), true),
            };
        }

        // ------------------------------------------------------------------ menu
        void SetupMenuScene()
        {
            var sv = _save.data;
            var car = SelectedCar();
            if (menuCar != null) menuCar.Dispose();
            var cs = SaveManager.CarState(sv, car.id);
            var paint = GameHelpers.PaintFor(car, cs);
            var m = menuCar = new CarView(car, new CarViewOpts { levels = cs.levels, tire = cs.tire, paint = paint.color, finish = paint.finish });
            var p = _track.PosAt(18, _track.width[9] / 2 + 2.6);
            double ground = _track.Height(p.x, p.z);
            m.group.SetParent(_worldScene, false);
            m.group.localPosition = Coord.ToUnity(p.x, ground - m.dims.yG - 0.02, p.z);
            m.group.localRotation = Coord.Yaw(p.hd + 0.35);
            m.SetStaticWheels(-0.3);
            SetShadows(m.gameObject, true);
            menuT = 0;
        }

        public void EnterMenu()
        {
            var sv = _save.data;
            state = "menu";
            StopRun();
            if (menuCar == null || menuCar.car.id != SelectedCar().id) SetupMenuScene();
            menuCar.visible = true;
            _world.Update(30, 20);
            int done = Achievements.ACHIEVEMENTS.Count(a => sv.achievements.ContainsKey(a.id));
            ui.SetMenu(new MenuData
            {
                races = sv.races, gift = FreeCarProgress(), best = sv.best.TryGetValue(sv.mountain, out var b) ? b : 0,
                car = sv.owned.Count > 0 ? SelectedCar().name : null, cash = sv.cash, hasCar = sv.owned.Count > 0,
                ach = $"{done}/{Achievements.ACHIEVEMENTS.Length}", mountain = Mountains.MountainById(sv.mountain).title,
                mountains = sv.unlocked.Count, mountainTitle = "RACING · 20 TRACKS · 8 COUNTRIES",
            });
            ui.Only("menu");
            Au?.musicGen?.SetMode("menu");
            Platform("gameplayStop");
            // opened through an invite link: join that lobby right away (once)
            glue.CheckInvite();
        }

        IEnumerator SwitchMountain()
        {
            var sv = _save.data;
            int i = sv.unlocked.IndexOf(sv.mountain);
            sv.mountain = sv.unlocked[(i + 1) % sv.unlocked.Count];
            _save.Save();
            yield return ui.FadeCo(true);
            LoadMountain(sv.mountain);
            _world.Update(30, 25);
            SetupMenuScene();
            EnterMenu();
            ui.Fade(false);
        }

        // ------------------------------------------------------------------ first start
        public void EnterFirst()
        {
            state = "first";
            garage.SetLevel(1);
            garage.ShowLineup(Cars.STARTERS);
            firstIdx = 1;
            UpdateFirst();
            ui.Only("first");
            Au?.musicGen?.SetMode("garage");
        }
        void UpdateFirst()
        {
            var car = Cars.STARTERS[firstIdx];
            garage.lineIdx = firstIdx;
            var st = Stats.ComputeStats(car, new Dictionary<string, int>(), "worn");
            ui.SetFirst(car, Rows(st, Stats.MaxStats(car), null), firstIdx, Cars.STARTERS.Length);
        }
        IEnumerator ChooseFirst()
        {
            if (choosing || state != "first") yield break;
            choosing = true;
            var sv = _save.data;
            var car = Cars.STARTERS[firstIdx];
            sv.owned = new List<string> { car.id }; sv.selected = car.id; sv.firstStartDone = true;
            SaveManager.CarState(sv, car.id);
            _save.Save(); _save.Flush();
            ui.Only();
            // short garage sequence: engine starts, door opens, out onto the mountain
            Au?.Starter();
            ui.After(0.8f, () => Au?.Burst(freq: 150, type: FilterType.Lowpass, dur: 1.2f, gain: 0.35f, buf: NoiseBufs.Brown));
            yield return Wait(0.9f);
            garage.OpenDoor();
            yield return Wait(2.2f);
            yield return ui.FadeCo(true);
            garage.ClearCars();
            choosing = false;
            // a friend arriving through an invite goes straight to the lobby instead of the mountain
            if (glue.PendingInvite() != null && !glue.inviteDone) { EnterMenu(); ui.Fade(false); yield break; }
            StartRun();
            yield return Wait(0.2f);
            ui.Fade(false);
        }

        // ------------------------------------------------------------------ garage
        public void EnterGarage(string t = "upgrades")
        {
            var sv = _save.data;
            state = "garage";
            StopRun();
            garage.doorTarget = 0; garage.door = 0;
            garage.SetLevel(sv.garageLevel);
            browse = SelectedCar().id;
            ShowGarageCar(browse);
            ui.Only("garage");
            Au?.musicGen?.SetMode("garage");
            Gtab(t);
        }
        void ShowGarageCar(string id)
        {
            var sv = _save.data; var car = Cars.CarById(id);
            var cs = SaveManager.CarState(sv, id);
            var paint = GameHelpers.PaintFor(car, cs);
            garage.ShowCar(car, new CarViewOpts { levels = cs.levels, tire = cs.tire, paint = paint.color, finish = paint.finish });
        }
        void Gtab(string t)
        {
            if (t == "drive") { Co(DriveFromGarage()); return; }
            if (t == "menu") { FadeThen(EnterMenu); return; }
            bool wasDealer = tab == "dealer";
            tab = t;
            ui.SetGarageTab(t);
            ui.CarMode(t == "vehicles" || t == "dealer");
            garage.SetFocus(null);
            garage.SetMode(t == "dealer" ? "dealer" : "workshop");
            if (t == "dealer")
            {
                var ex = Cars.CARS.Where(c => c.exotic).ToList();
                if (!Cars.CarById(browse).exotic) browse = ex[0].id;
                ShowGarageCar(browse);
                garage.SetSideCars(ex.Where(c => c.id != browse).ToList());
            }
            else if ((t != "vehicles" || wasDealer) && browse != SelectedCar().id) { browse = SelectedCar().id; ShowGarageCar(browse); }
            if (t == "upgrades") RenderUpgrades();
            else if (t == "vehicles" || t == "dealer") RenderVehicles();
            else if (t == "paint") RenderPaint();
            else if (t == "garage") RenderGarageLevels();
        }
        void CycleTab(int d)
        {
            string[] tabs = { "upgrades", "vehicles", "dealer", "paint", "garage" };
            int i = Math.Max(0, Array.IndexOf(tabs, tab));
            Au?.Ui("click");
            Gtab(tabs[(i + d + tabs.Length) % tabs.Length]);
        }
        void Header()
        {
            var sv = _save.data; var car = Cars.CarById(browse ?? sv.selected);
            var exo = Cars.CARS.Where(c => c.exotic).ToList();
            string title, sub;
            switch (tab)
            {
                case "upgrades": title = car.name; sub = car.cls + " · " + car.drive; break;
                case "vehicles": title = "SHOWROOM"; sub = Cars.CARS.Count(c => !c.exotic && sv.owned.Contains(c.id)) + " / " + (Cars.CARS.Length - exo.Count) + " OWNED"; break;
                case "dealer": title = "MONTAGNA MOTORS"; sub = "EXOTICS · " + exo.Count(c => sv.owned.Contains(c.id)) + " / " + exo.Count + " OWNED"; break;
                case "paint": title = "PAINT SHOP"; sub = car.name; break;
                case "garage": title = Upgrades.GARAGE_LEVELS[sv.garageLevel - 1].name; sub = "LEVEL " + sv.garageLevel + " / 5"; break;
                default: title = "GARAGE"; sub = ""; break;
            }
            ui.SetGarageHeader(title, sub, sv.cash);
        }
        void GStats(CarStats prev = null)
        {
            var car = Cars.CarById(browse);
            var st = StatsFor(car);
            ui.SetGStats(car.name, st.tire, Rows(st, Stats.MaxStats(car, _save.data.garageLevel), prev));
        }

        // ---- upgrades
        void RenderUpgrades(string selected = null)
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            browse = car.id;
            Header();
            GStats(lastStats);
            lastStats = null;
            var sel = selected ?? upgSel ?? "engine";
            upgSel = sel;
            var d = new UpgradesData { car = car.name, sel = sel };
            foreach (var c in Upgrades.CATEGORIES)
            {
                int lv = cs.levels.TryGetValue(c.id, out var l) ? l : 0, cap = Stats.CapOf(car, c.id, sv.garageLevel), bse = car.caps[c.id];
                double? cost = lv < cap ? Upgrades.UpgradeCost(car, c.id, lv, sv.garageLevel) : (double?)null;
                d.rows.Add(new UpgRow
                {
                    id = c.id, name = c.name, lv = lv, cap = cap, baseCap = bse, part = c.parts[Math.Min(lv, c.parts.Length - 1)],
                    price = cost == null ? "MAXED" : Money(cost.Value), priceState = cost == null ? "max" : cost > sv.cash ? "no" : "",
                });
            }
            ui.Upgrades(d);
            RenderUpgDetail();
        }

        void RenderUpgDetail()
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            var c = Upgrades.CatById(upgSel) ?? Upgrades.CATEGORIES[0];
            int lv = cs.levels.TryGetValue(c.id, out var l) ? l : 0, cap = Stats.CapOf(car, c.id, sv.garageLevel);
            double? cost = lv < cap ? Upgrades.UpgradeCost(car, c.id, lv, sv.garageLevel) : (double?)null;
            var now = Stats.ComputeStats(car, cs.levels, cs.tire, sv.garageLevel);
            List<Effect> effects = null;
            if (cost != null)
            {
                var nl = new Dictionary<string, int>(cs.levels) { [c.id] = lv + 1 };
                var nx = Stats.ComputeStats(car, nl, cs.tire, sv.garageLevel);
                effects = new List<Effect>();
                void Add(string name, double a, double b, string unit, int dec = 0, bool inv = false)
                {
                    double dv = b - a;
                    if (Math.Abs(dv) < (dec != 0 ? 0.05 : 0.5)) return;
                    bool good = inv ? dv < 0 : dv > 0;
                    effects.Add(new Effect { text = $"{(dv > 0 ? "+" : "−")}{Fixed(Math.Abs(dv), dec)} {unit} {name}", good = good });
                }
                Add("POWER", now.hp, nx.hp, "HP"); Add("TORQUE", now.nm, nx.nm, "NM"); Add("TOP SPEED", now.top, nx.top, "KM/H");
                if (now.t100.HasValue && now.t100 != 0 && nx.t100.HasValue && nx.t100 != 0) Add("0–100", now.t100.Value, nx.t100.Value, "S", 1, true);
                Add("GRIP", now.grip, nx.grip, ""); Add("BRAKES", now.brakes, nx.brakes, ""); Add("SUSPENSION", now.susp, nx.susp, ""); Add("DURABILITY", now.dur, nx.dur, "");
                Add("FUEL", now.fuel, nx.fuel, "L", 1); Add("WEIGHT", now.kg, nx.kg, "KG", 0, true);
                if (c.id == "cooling") effects.Add(new Effect { text = "+ HEAT CAPACITY", good = true });
                if (c.id == "turbo")
                {
                    effects.Add(new Effect { text = lv == 0 ? "FITS A TURBO · SHIFT TO BOOST" : "+ BOOST DURATION · − LAG", good = true });
                    effects.Add(new Effect { text = "+ ENGINE HEAT", good = false });
                }
                if (c.id == "brakes" && lv + 1 == 6) effects.Add(new Effect { text = "ABS FITTED", good = true });
                if (c.id == "transmission" && (lv + 1 == 5 || lv + 1 == 12)) effects.Add(new Effect { text = "+1 GEAR", good = true });
                var tu = Upgrades.TIRES.FirstOrDefault(x => x.unlock == lv + 1);
                if (c.id == "tires" && tu != null) effects.Add(new Effect { text = $"UNLOCKS {tu.name} TYRES", good = true });
            }
            List<TireBtn> tires = null; string tireDesc = null;
            if (c.id == "tires")
            {
                tires = Upgrades.TIRES.Select(t => new TireBtn { id = t.id, name = t.name, desc = t.desc, on = cs.tire == t.id, disabled = lv < t.unlock }).ToList();
                tireDesc = Upgrades.TireById(cs.tire).desc;
            }
            bool can = cost != null && cost <= sv.cash;
            ui.UpgDetail(new UpgDetail
            {
                id = c.id, name = c.name,
                pn = cost == null ? "FULLY UPGRADED" : "NEXT: " + c.parts[Math.Min(lv + 1, c.parts.Length - 1)].ToUpperInvariant(),
                desc = c.desc, effects = effects, tires = tires, tireDesc = tireDesc,
                buyLabel = cost == null ? "MAXED" : "BUY · " + Money(cost.Value), buyEnabled = can, buyAmber = can,
            });
            garage.SetFocus(c.focus == "engine" ? "engine" : c.focus);
        }

        void TireSel(string id)
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            var t = Upgrades.TIRES.FirstOrDefault(x => x.id == id);
            int lv = cs.levels.TryGetValue("tires", out var l) ? l : 0;
            if (t == null || lv < t.unlock) return;
            cs.tire = id; _save.Save(); Au?.Ratchet(4);
            garage.car?.SetUpgrades(cs.levels, cs.tire);
            RenderUpgrades(upgSel);
        }

        void BuyUpgrade(string cat)
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            if (Upgrades.CatById(cat) == null) return;
            int lv = cs.levels.TryGetValue(cat, out var l) ? l : 0, cap = Stats.CapOf(car, cat, sv.garageLevel);
            if (lv >= cap) return;
            double cost = Upgrades.UpgradeCost(car, cat, lv, sv.garageLevel);
            if (cost > sv.cash) { Au?.Ui("deny"); return; }
            if (installingNow) return;
            installingNow = true;
            var prev = StatsFor(car);
            sv.cash -= cost; cs.levels[cat] = lv + 1; sv.stats["upgrades"] = sv.Stat("upgrades") + 1;
            if (cat == "tires")
            {
                var t = Upgrades.TIRES.LastOrDefault(x => x.unlock <= lv + 1);
                int ti = Array.IndexOf(Upgrades.TIRES, t), ci = Array.FindIndex(Upgrades.TIRES, x => x.id == cs.tire);
                if (t != null && ti > ci && cs.tire != "race") cs.tire = cs.tire == "worn" ? "street" : cs.tire;
            }
            _save.Save();
            Au?.Ui("buy");
            ui.Installing(true);
            Header();
            garage.Install(cat, () =>
            {
                garage.car?.SetUpgrades(cs.levels, cs.tire);
                ui.Installing(false);
                lastStats = prev;
                CheckAchievements(null);
                if (state == "garage" && tab == "upgrades") RenderUpgrades(cat);
                installingNow = false;
            });
        }

        // ---- showroom / dealer carousel
        // performance index and class letter (like a racing game's car classes)
        static (int pi, string letter) PerfIndex(CarStats st)
        {
            int pi = (int)JsRound(st.top * 0.8 + st.grip * 2 + (st.hp / st.kg) * 400 + (st.brakes != 0 ? st.brakes : 60) * 0.6);
            string letter = pi < 300 ? "D" : pi < 400 ? "C" : pi < 500 ? "B" : pi < 620 ? "A" : pi < 760 ? "S1" : pi < 920 ? "S2" : "X";
            return (pi, letter);
        }
        CarSil CarSilOf(CarDef car)
        {
            if (silCache.TryGetValue(car.id, out var cached)) return cached;
            var ph = Stats.ComputeStats(car, new Dictionary<string, int>(), "worn").phys;
            var d = CarDims.Compute(car, ph); var T = CarDims.TypeOf(car.model);
            double Z(double u) => d.zR + u * d.L;
            double back = T.bed != 0 ? T.back : Math.Max(0.02, T.back);
            double roofY = d.roof, belt = d.yBelt;
            Vector2 P(double z, double y) => new Vector2((float)z, (float)y);
            var sil = new CarSil
            {
                body = new List<Vector2> { P(d.zR + 0.05, d.bottom + 0.05), P(d.zR, d.yTail - 0.05), P(Z(back), d.yTail), P(Z(T.roofR), roofY), P(Z(T.roofF), roofY), P(Z(T.ws), belt), P(Z(0.97), d.yNose), P(d.zF, d.yNose - 0.1), P(d.zF - 0.03, d.bottom + 0.06) },
                pts = new List<Vector2> { P(Z(back) + 0.12, d.yTail + 0.04), P(Z(T.roofR) + 0.04, roofY - 0.05), P(Z(T.roofF) - 0.03, roofY - 0.05), P(Z(T.ws) - 0.1, belt + 0.04) },
                shoulder = new List<Vector2> { P(d.zR + 0.02, d.yTail - 0.12), P(Z(T.ws), belt - 0.06), P(d.zF - 0.06, d.yNose - 0.14) },
                wheels = new List<Vector3> { new Vector3((float)d.a, (float)d.wcY, (float)d.r), new Vector3((float)-d.b, (float)d.wcY, (float)d.r) },
                z0 = d.zR, z1 = d.zF, y0 = d.wcY - d.r, y1 = roofY,
            };
            silCache[car.id] = sil;
            return sil;
        }
        List<CarDef> CarouselList()
        {
            bool dealer = tab == "dealer";
            return Cars.CARS.Where(c => c.exotic == dealer).OrderBy(c => c.price).ToList();
        }
        void RenderVehicles()
        {
            var sv = _save.data;
            Header();
            var list = CarouselList();
            if (!list.Any(c => c.id == browse)) { browse = list[0].id; ShowGarageCar(browse); }
            var cars = list.Select(c =>
            {
                bool own = sv.owned.Contains(c.id), cur = sv.selected == c.id;
                double price = JsRound(c.price * Upgrades.CarDiscount(sv.garageLevel));
                var (pi, letter) = PerfIndex(Stats.ComputeStats(c, new Dictionary<string, int>(), "street"));
                return new CarCard { id = c.id, name = c.name, cls = c.cls, price = Money(price), state = cur ? "driving" : own ? "owned" : price > sv.cash ? "nocash" : "buy", pi = pi, letter = letter, sil = CarSilOf(c), color = GameHelpers.Hex6(c.model.paint) };
            }).ToList();
            var car = Cars.CarById(browse);
            bool own2 = sv.owned.Contains(car.id), cur2 = sv.selected == car.id;
            double price2 = JsRound(car.price * Upgrades.CarDiscount(sv.garageLevel));
            var cs = own2 ? SaveManager.CarState(sv, car.id) : null;
            var st = own2 ? Stats.ComputeStats(car, cs.levels, cs.tire, sv.garageLevel) : Stats.ComputeStats(car, new Dictionary<string, int>(), "street");
            var mx = Stats.MaxStats(car, sv.garageLevel);
            var (pi2, letter2) = PerfIndex(st);
            // bars are scaled against the fastest car in the game
            const double RTOP = 650, RACC = 2.2, RGRIP = 100, RBRAKES = 100, RDUR = 100;
            double Acc(CarStats s) => U.Clamp((12 - (s.t100 is double t && t != 0 ? t : 12)) / (12 - RACC), 0.03, 1);
            var bars = new List<CarBar>
            {
                new CarBar { label = "TOP SPEED", v = U.Clamp(st.top / RTOP, 0, 1), max = U.Clamp(mx.top / RTOP, 0, 1), txt = JsRound(st.top) + " KM/H" },
                new CarBar { label = "0–100", v = Acc(st), max = Acc(mx), txt = st.t100 is double t1 && t1 != 0 ? Fixed(t1, 1) + " S" : "—" },
                new CarBar { label = "POWER", v = U.Clamp(st.hp / 1600, 0, 1), max = U.Clamp(mx.hp / 1600, 0, 1), txt = JsRound(st.hp) + " HP" },
                new CarBar { label = "HANDLING", v = U.Clamp(st.grip / RGRIP, 0, 1), max = U.Clamp(mx.grip / RGRIP, 0, 1), txt = JsRound(st.grip).ToString(CultureInfo.InvariantCulture) },
                new CarBar { label = "BRAKING", v = U.Clamp(st.brakes / RBRAKES, 0, 1), max = U.Clamp(mx.brakes / RBRAKES, 0, 1), txt = JsRound(st.brakes).ToString(CultureInfo.InvariantCulture) },
                new CarBar { label = "DURABILITY", v = U.Clamp(st.dur / RDUR, 0, 1), max = U.Clamp(mx.dur / RDUR, 0, 1), txt = JsRound(st.dur).ToString(CultureInfo.InvariantCulture) },
            };
            ui.Carousel(new CarouselData
            {
                cars = cars, sel = car.id,
                detail = new CarDetail
                {
                    name = car.name, cls = car.cls, drive = car.drive + " · " + JsRound(st.kg) + " KG", desc = car.desc, traits = car.traits ?? new string[0], pi = pi2, letter = letter2, bars = bars,
                    price = Money(price2), need = Money(price2 - sv.cash), action = cur2 ? "current" : own2 ? "select" : price2 > sv.cash ? "nocash" : "buy",
                },
            });
            GStats();
        }
        void crStep(int dir)
        {
            var list = CarouselList();
            int i = Math.Max(0, list.FindIndex(c => c.id == browse));
            var n = list[(i + dir + list.Count) % list.Count];
            if (n == null || n.id == browse) return;
            Au?.Ui("hover");
            crSel(n.id);
        }
        void crSel(string id)
        {
            if (id == null || !Cars.CARS.Any(c => c.id == id)) return;
            browse = id;
            ShowGarageCar(id);
            if (tab == "dealer") garage.SetSideCars(Cars.CARS.Where(c => c.exotic && c.id != id).ToList());
            RenderVehicles();
        }
        void crAct()
        {
            var sv = _save.data; var c = Cars.CarById(browse);
            if (c == null) return;
            bool own = sv.owned.Contains(c.id);
            if (sv.selected == c.id) return;
            if (!own)
            {
                double price = JsRound(c.price * Upgrades.CarDiscount(sv.garageLevel));
                if (price > sv.cash) { Au?.Ui("back"); return; }
                sv.cash -= price; sv.owned.Add(c.id); SaveManager.CarState(sv, c.id);
                Au?.Ui("buy"); Au?.Starter();
                ui.Toast($"<b>{c.name}</b> IS YOURS");
            }
            else Au?.Ui("click");
            sv.selected = c.id;
            _save.Save();
            CheckAchievements(null);
            RenderVehicles();
            Header();
        }

        // ---- paint
        void RenderPaint()
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            Header();
            GStats();
            var d = new PaintData { car = car.name };
            foreach (var pt in Upgrades.PAINTS)
            {
                bool lk = Upgrades.FINISHES[pt.finish].level > sv.garageLevel;
                d.swatches.Add(new Swatch { id = pt.id, name = pt.name, finish = pt.finish, color = GameHelpers.Hex6(pt.color ?? car.model.paint), on = cs.paint == pt.id, locked = lk });
            }
            ui.Paint(d);
            PaintDetailFor(cs.paint);
            garage.SetFocus(null);
        }
        void PaintDetailFor(string id)
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            var pt = Upgrades.PAINTS.FirstOrDefault(x => x.id == id) ?? Upgrades.PAINTS[0];
            bool owned = cs.paints.Contains(pt.id) || pt.cost == 0;
            int need = Upgrades.FINISHES[pt.finish].level;
            bool lk = need > sv.garageLevel;
            ui.PaintDetail(new PaintDetail
            {
                id = pt.id, name = pt.name, finish = pt.finish, lockMsg = lk ? $"Requires garage level {need}." : null,
                label = cs.paint == pt.id ? "APPLIED" : owned ? "APPLY" : "BUY · " + Money(pt.cost),
                style = owned ? "main" : pt.cost <= sv.cash ? "amber" : "",
                enabled = !(lk || (!owned && pt.cost > sv.cash) || cs.paint == pt.id),
            });
            // preview without buying
            garage.car?.SetPaint(pt.color ?? car.model.paint, pt.color.HasValue ? pt.finish : car.model.sport != 0 ? "metallic" : "solid");
        }
        void PaintAct(string id)
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            var pt = Upgrades.PAINTS.FirstOrDefault(x => x.id == id);
            if (pt == null) return;
            bool owned = cs.paints.Contains(id) || pt.cost == 0;
            bool lk = Upgrades.FINISHES[pt.finish].level > sv.garageLevel;
            if (lk || (!owned && pt.cost > sv.cash) || cs.paint == id) return;
            if (!owned) { sv.cash -= pt.cost; cs.paints.Add(id); }
            cs.paint = id; _save.Save();
            Au?.Burst(freq: 3000, q: 0.5f, type: FilterType.Highpass, dur: 0.8f, gain: 0.12f, attack: 0.1f, buf: NoiseBufs.Pink);
            var pf = GameHelpers.PaintFor(car, cs);
            garage.car?.SetPaint(pf.color, pf.finish);
            RenderPaint();
        }

        // ---- workshop levels
        void RenderGarageLevels()
        {
            var sv = _save.data;
            Header();
            ui.SetGStats(null, null, null);
            var d = new GarageLevelsData { level = sv.garageLevel };
            foreach (var g in Upgrades.GARAGE_LEVELS)
                d.rows.Add(new GLRow
                {
                    level = g.level, name = g.name, perks = g.perks ?? new string[0],
                    right = g.level <= sv.garageLevel ? (g.level == sv.garageLevel ? "CURRENT" : "✓") : Money(g.cost),
                    state = g.level < sv.garageLevel ? "done" : g.level == sv.garageLevel ? "cur" : "",
                });
            var next = sv.garageLevel < Upgrades.GARAGE_LEVELS.Length ? Upgrades.GARAGE_LEVELS[sv.garageLevel] : null;
            if (next != null) d.next = new GLNext { name = next.name, cost = Money(next.cost), enabled = next.cost <= sv.cash };
            ui.GarageLevels(d);
        }
        IEnumerator GarageLevelBuy()
        {
            var sv = _save.data;
            var next = sv.garageLevel < Upgrades.GARAGE_LEVELS.Length ? Upgrades.GARAGE_LEVELS[sv.garageLevel] : null;
            if (next == null || next.cost > sv.cash || installingNow) yield break;
            sv.cash -= next.cost; sv.garageLevel = next.level; _save.Save();
            Au?.Ui("buy");
            installingNow = true;
            yield return ui.FadeCo(true);
            garage.SetLevel(sv.garageLevel);
            ShowGarageCar(SelectedCar().id);
            Au?.Metal(0.5f, 200); Au?.ImpactWrench(0.8f, 0.2f);
            ui.Toast($"WORKSHOP UPGRADED · <b>{next.name}</b>");
            CheckAchievements(null);
            RenderGarageLevels();
            ui.Fade(false);
            installingNow = false;
        }

        IEnumerator DriveFromGarage()
        {
            if (_save.data.owned.Count == 0 || driving) yield break;
            driving = true;
            garage.SetFocus(null);
            if (garage.mode == "dealer" || browse != SelectedCar().id)
            {
                tab = "upgrades"; ui.SetGarageTab("upgrades");
                garage.SetMode("workshop");
                browse = SelectedCar().id; ShowGarageCar(browse);
            }
            garage.OpenDoor();
            Au?.Starter();
            yield return Wait(1.4f);
            yield return ui.FadeCo(true);
            garage.ClearCars();
            driving = false;
            StartRun();
            yield return Wait(0.15f);
            ui.Fade(false);
        }

        // ------------------------------------------------------------------ runs
        public void StartRun()
        {
            var sv = _save.data;
            state = "run";
            paused = false;
            if (menuCar != null) menuCar.visible = false;
            if (mountainId != sv.mountain) LoadMountain(sv.mountain);
            if (run == null || run is Race) run = new Run(this);
            run.camMode = sv.settings.camera;
            run.Start(SelectedCar().id);
            Au?.ambience?.Update(0);
        }
        public void StopRun()
        {
            if (run != null && run.model != null) run.Stop();
            AudioListener.pause = false;
            ui.Show("hud", false); ui.Show("touch", false); ui.Show("summary", false); ui.Show("pause", false); ui.Show("count", false); ui.Show("raceres", false);
        }
        void Retry()
        {
            ui.Show("summary", false); ui.Show("raceres", false);
            if (run != null && run.model != null) run.Restart();
            else StartRun();
        }
        void Pause(bool on)
        {
            if (state != "run" || (run != null && run.ended)) return;
            paused = on;
            ui.Show("pause", on);
            Platform(on ? "gameplayStop" : "gameplayStart");
            AudioListener.pause = on;   // the web build suspends the audio context
        }

        // ------------------------------------------------------------------ progression
        public void CheckAchievements(RunInfo r)
        {
            var sv = _save.data;
            foreach (var a in Achievements.ACHIEVEMENTS)
            {
                if (sv.achievements.ContainsKey(a.id)) continue;
                bool ok;
                try { ok = a.check(sv, r); } catch (Exception) { ok = false; }
                if (!ok) continue;
                sv.achievements[a.id] = GameHelpers.NowMs();
                sv.cash += a.reward; sv.totalEarned += a.reward;
                ui.Toast($"ACHIEVEMENT · <b>{a.name}</b> · +{Money(a.reward)}", 4200);
                Au?.Record();
            }
            _save.Save();
        }

        // "Two more runs until …" — the nearest affordable goal
        public string NextGoalText()
        {
            var sv = _save.data; var car = SelectedCar(); var cs = SaveManager.CarState(sv, car.id);
            var goals = new List<(string name, double cost, bool car)>();
            foreach (var c in Upgrades.CATEGORIES)
            {
                int lv = cs.levels.TryGetValue(c.id, out var l) ? l : 0;
                if (lv < Stats.CapOf(car, c.id, sv.garageLevel)) goals.Add(($"{c.name} LV {lv + 1}", Upgrades.UpgradeCost(car, c.id, lv, sv.garageLevel), false));
            }
            foreach (var c in Cars.CARS) if (!sv.owned.Contains(c.id)) goals.Add(($"THE {c.name}", JsRound(c.price * Upgrades.CarDiscount(sv.garageLevel)), true));
            var gl = sv.garageLevel < Upgrades.GARAGE_LEVELS.Length ? Upgrades.GARAGE_LEVELS[sv.garageLevel] : null;
            if (gl != null) goals.Add((gl.name, gl.cost, false));
            var affordable = goals.Where(g => g.cost <= sv.cash).OrderByDescending(g => g.cost).ToList();
            var later = goals.Where(g => g.cost > sv.cash).OrderBy(g => g.cost).ToList();
            double lastRun = run != null && run.lastTotal != 0 ? run.lastTotal : Math.Max(400, sv.totalEarned / Math.Max(1, sv.Stat("runs")));
            if (affordable.Count > 0)
            {
                var best = affordable.FirstOrDefault(g => g.car);
                if (best.name == null) best = affordable[0];
                return $"You can afford <b>{best.name}</b> right now.";
            }
            if (later.Count > 0)
            {
                var g = later[0];
                double runs = Math.Max(1, Math.Ceiling((g.cost - sv.cash) / lastRun));
                return runs == 1 ? $"One more run until <b>{g.name}</b> ({Money(g.cost)})." : $"About {runs} more runs until <b>{g.name}</b> ({Money(g.cost)}).";
            }
            return "";
        }

        // ------------------------------------------------------------------ settings
        void OpenSettings()
        {
            var sv = _save.data;
            ui.Settings(sv.settings, (k, v) =>
            {
                var s = sv.settings;
                if (k == "reset") { _save.Reset(); UnityEngine.SceneManagement.SceneManager.LoadScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene().buildIndex); return; }
                switch (k)
                {
                    case "master": s.master = Convert.ToDouble(v, CultureInfo.InvariantCulture); break;
                    case "music": s.music = Convert.ToDouble(v, CultureInfo.InvariantCulture); break;
                    case "sfx": s.sfx = Convert.ToDouble(v, CultureInfo.InvariantCulture); break;
                    case "shake": s.shake = Convert.ToDouble(v, CultureInfo.InvariantCulture); break;
                    case "quality": s.quality = v as string ?? "auto"; break;
                    case "camera": s.camera = v as string ?? "chase"; break;
                    case "units": s.units = v as string ?? "kmh"; break;
                    case "assist": s.assist = v is bool b && b; break;
                    case "showFps": s.showFps = v is bool f && f; break;
                }
                if (k == "master" || k == "music" || k == "sfx") Au?.SetVolumes((float)s.master, (float)s.music, (float)s.sfx);
                if (k == "camera" && run != null) run.camMode = s.camera;
                if (k == "assist" && run != null && run.vehicle != null) run.vehicle.assist = s.assist ? 1 : 0;
                if (k == "quality")
                {
                    // the render level and world detail switch now; particle pools, shadows and the sky after a reload
                    var q = PickQuality();
                    ApplyQualityLevel(q);
                    _world?.SetQuality(q);
                    if (cam) cam.allowMSAA = q != "low";
                    postEnabled = q != "low";
                    ui.Toast("GRAPHICS CHANGE APPLIES AFTER <b>RELOAD</b>");
                }
                _save.Save();
            });
        }
    }
}

// Versioned, defensive save (port of save.js). Stored as JSON in PlayerPrefs with a rolling
// backup, in the browser build's format, so the fields read the same as there.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Downfall
{
    public sealed class CarSave
    {
        public Dictionary<string, int> levels;
        public string tire = "worn", paint = "factory", finish;
        public List<string> paints = new List<string> { "factory" };
    }

    public sealed class Settings
    {
        public double master = 0.8, music = 0.5, sfx = 0.85, shake = 1;
        public string quality = "auto", camera = "chase", units = "kmh", touchLayout = "buttons";
        public bool assist = true, showFps;
    }

    public sealed class SaveData : IAchSave
    {
        public int version = SaveManager.SAVE_VERSION;
        public double created = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        public bool firstStartDone;
        public double cash, totalEarned, testGrant;
        public List<string> owned = new List<string>();
        public string selected;
        public Dictionary<string, CarSave> cars = new Dictionary<string, CarSave>();
        public int garageLevel = 1;
        public Dictionary<string, double> best = new Dictionary<string, double> { ["m1"] = 0, ["m2"] = 0 };
        public string mountain = "m1";
        public List<string> unlocked = new List<string> { "m1" };
        public List<string> completed = new List<string>();
        public Dictionary<string, double> achievements = new Dictionary<string, double>();
        public Dictionary<string, double> stats = new Dictionary<string, double> { ["runs"] = 0, ["upgrades"] = 0, ["distance"] = 0, ["shortcuts"] = 0, ["topSpeed"] = 0, ["crashes"] = 0, ["cashCollected"] = 0 };
        public Settings settings = new Settings();
        // racing
        public int races;
        public Dictionary<string, double> wins = new Dictionary<string, double>(), podiums = new Dictionary<string, double>(), bestLaps = new Dictionary<string, double>();
        public string lastMap, nick;
        public List<string> usedCodes = new List<string>();

        public double Stat(string k) => stats.TryGetValue(k, out var v) ? v : 0;

        IList<string> IAchSave.completed => completed;
        IList<string> IAchSave.owned => owned;
        int IAchSave.garageLevel => garageLevel;
        double IAchSave.totalEarned => totalEarned;
        double IAchSave.statUpgrades => Stat("upgrades");
        double IAchSave.statTopSpeed => Stat("topSpeed");
        double IAchSave.statShortcuts => Stat("shortcuts");
    }

    public sealed class SaveManager
    {
        public const int SAVE_VERSION = 1;
        const string KEY = "oneroaddown.save.v1", BAK = "oneroaddown.save.v1.bak";
        public SaveData data;
        bool dirty;
        float flushT;

        public SaveManager() { data = Load(); }

        public static CarSave CarState(SaveData save, string id)
        {
            if (!save.cars.TryGetValue(id, out var c)) save.cars[id] = c = new CarSave();
            var lv = Stats.DefaultLevels();
            if (c.levels != null) foreach (var kv in c.levels) lv[kv.Key] = kv.Value;
            c.levels = lv;
            if (c.paints == null || c.paints.Count == 0) c.paints = new List<string> { "factory" };
            return c;
        }

        SaveData Load()
        {
            return Validate(Json.Parse(PlayerPrefs.GetString(KEY, ""))) ?? Validate(Json.Parse(PlayerPrefs.GetString(BAK, ""))) ?? new SaveData();
        }

        public void Save() { dirty = true; }

        // call every frame; writes at most every 4 s (and on Flush)
        public void Tick(float dt)
        {
            flushT += dt;
            if (flushT > 4) { flushT = 0; Flush(); }
        }

        public void Flush()
        {
            if (!dirty) return;
            dirty = false;
            try
            {
                string json = Json.Write(ToJson(data));
                string prev = PlayerPrefs.GetString(KEY, "");
                if (prev.Length > 0) PlayerPrefs.SetString(BAK, prev);
                PlayerPrefs.SetString(KEY, json);
                PlayerPrefs.Save();
            }
            catch (Exception e) { Debug.LogWarning("save failed: " + e.Message); }
        }

        public void Reset() { data = new SaveData(); dirty = true; Flush(); }

        // ---------------------------------------------------------------- JSON
        static Dictionary<string, double> NumMap(object o)
        {
            var r = new Dictionary<string, double>();
            if (o is Dictionary<string, object> d) foreach (var kv in d) if (kv.Value is double x) r[kv.Key] = x;
            return r;
        }
        static List<string> StrList(object o) => o is List<object> l ? l.OfType<string>().ToList() : null;

        static SaveData Validate(object s)
        {
            if (!(s is Dictionary<string, object> d)) return null;
            var o = new SaveData();
            o.version = (int)Json.Num(d, "version", SAVE_VERSION);
            o.created = Json.Num(d, "created", o.created);
            o.firstStartDone = Json.Bool(d, "firstStartDone");
            o.cash = Json.Num(d, "cash");
            o.totalEarned = Json.Num(d, "totalEarned");
            o.testGrant = Json.Num(d, "testGrant");
            o.owned = (StrList(d.TryGetValue("owned", out var ow) ? ow : null) ?? new List<string>()).Where(id => Cars.CARS.Any(c => c.id == id)).Distinct().ToList();
            o.selected = Json.Str(d, "selected");
            o.garageLevel = Math.Min(5, Math.Max(1, (int)Json.Num(d, "garageLevel", 1)));
            foreach (var kv in NumMap(Json.Obj(d, "best"))) o.best[kv.Key] = kv.Value;
            o.mountain = Json.Str(d, "mountain", "m1");
            var un = StrList(Json.Arr(d, "unlocked"));
            if (un != null && un.Count > 0) o.unlocked = un;
            o.completed = StrList(Json.Arr(d, "completed")) ?? new List<string>();
            o.achievements = NumMap(Json.Obj(d, "achievements"));
            foreach (var kv in NumMap(Json.Obj(d, "stats"))) o.stats[kv.Key] = kv.Value;
            var st = Json.Obj(d, "settings");
            if (st != null)
            {
                var t = o.settings;
                t.master = Json.Num(st, "master", t.master); t.music = Json.Num(st, "music", t.music); t.sfx = Json.Num(st, "sfx", t.sfx); t.shake = Json.Num(st, "shake", t.shake);
                t.quality = Json.Str(st, "quality", t.quality); t.camera = Json.Str(st, "camera", t.camera); t.units = Json.Str(st, "units", t.units); t.touchLayout = Json.Str(st, "touchLayout", t.touchLayout);
                t.assist = Json.Bool(st, "assist", t.assist); t.showFps = Json.Bool(st, "showFps", t.showFps);
            }
            var cars = Json.Obj(d, "cars");
            if (cars != null)
                foreach (var kv in cars)
                {
                    if (!(kv.Value is Dictionary<string, object> c)) continue;
                    var cs = new CarSave { levels = new Dictionary<string, int>() };
                    foreach (var lv in NumMap(Json.Obj(c, "levels"))) cs.levels[lv.Key] = (int)lv.Value;
                    cs.tire = Json.Str(c, "tire", "worn"); cs.paint = Json.Str(c, "paint", "factory"); cs.finish = Json.Str(c, "finish");
                    cs.paints = StrList(Json.Arr(c, "paints")) ?? new List<string> { "factory" };
                    o.cars[kv.Key] = cs;
                }
            o.races = (int)Json.Num(d, "races");
            o.wins = NumMap(Json.Obj(d, "wins")); o.podiums = NumMap(Json.Obj(d, "podiums")); o.bestLaps = NumMap(Json.Obj(d, "bestLaps"));
            o.lastMap = Json.Str(d, "lastMap"); o.nick = Json.Str(d, "nick");
            o.usedCodes = StrList(Json.Arr(d, "usedCodes")) ?? new List<string>();
            if (double.IsNaN(o.cash) || double.IsInfinity(o.cash) || o.cash < 0) o.cash = 0;
            if (o.selected != null && !o.owned.Contains(o.selected)) o.selected = o.owned.Count > 0 ? o.owned[0] : null;
            if (!o.firstStartDone && o.owned.Count > 0) o.firstStartDone = true;
            foreach (var id in o.owned) CarState(o, id);
            return o;
        }

        static object ToJson(SaveData s)
        {
            var cars = new Dictionary<string, object>();
            foreach (var kv in s.cars)
            {
                var lv = new Dictionary<string, object>();
                if (kv.Value.levels != null) foreach (var l in kv.Value.levels) lv[l.Key] = (double)l.Value;
                var c = new Dictionary<string, object> { ["levels"] = lv, ["tire"] = kv.Value.tire, ["paint"] = kv.Value.paint, ["paints"] = kv.Value.paints.Cast<object>().ToList() };
                if (kv.Value.finish != null) c["finish"] = kv.Value.finish;
                cars[kv.Key] = c;
            }
            Dictionary<string, object> M(Dictionary<string, double> m) => m.ToDictionary(k => k.Key, k => (object)k.Value);
            var t = s.settings;
            return new Dictionary<string, object>
            {
                ["version"] = (double)s.version, ["created"] = s.created, ["firstStartDone"] = s.firstStartDone,
                ["cash"] = s.cash, ["totalEarned"] = s.totalEarned, ["testGrant"] = s.testGrant,
                ["owned"] = s.owned.Cast<object>().ToList(), ["selected"] = s.selected, ["cars"] = cars,
                ["garageLevel"] = (double)s.garageLevel, ["best"] = M(s.best), ["mountain"] = s.mountain,
                ["unlocked"] = s.unlocked.Cast<object>().ToList(), ["completed"] = s.completed.Cast<object>().ToList(),
                ["achievements"] = M(s.achievements), ["stats"] = M(s.stats),
                ["settings"] = new Dictionary<string, object>
                {
                    ["master"] = t.master, ["music"] = t.music, ["sfx"] = t.sfx, ["quality"] = t.quality, ["camera"] = t.camera,
                    ["assist"] = t.assist, ["units"] = t.units, ["showFps"] = t.showFps, ["shake"] = t.shake, ["touchLayout"] = t.touchLayout,
                },
                ["races"] = (double)s.races, ["wins"] = M(s.wins), ["podiums"] = M(s.podiums), ["bestLaps"] = M(s.bestLaps),
                ["lastMap"] = s.lastMap, ["nick"] = s.nick, ["usedCodes"] = s.usedCodes.Cast<object>().ToList(),
            };
        }
    }
}

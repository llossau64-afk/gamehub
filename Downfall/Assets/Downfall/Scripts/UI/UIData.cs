// Data objects passed to the UI (the object literals of main.js / run.js / race.js).
// Field names follow the JS; colours stay CSS strings ("#e2a33b").
using System.Collections.Generic;
using UnityEngine;

namespace Downfall
{
    public sealed class MenuData
    {
        public int races; public string gift; public double best; public string car; public double cash; public bool hasCar;
        public string ach, mountain; public int mountains; public string mountainTitle;
    }

    // one line of the car stat block (main.js rows())
    public sealed class StatRow
    {
        public string label, value, unit, delta;
        public double? frac, maxFrac;
        public bool deltaNeg, up;
    }

    public sealed class HudParts { public double engine = 1, tires = 1, susp = 1, brakes = 1; }
    public sealed class HudData
    {
        public double dist; public bool record; public double cash, fuel, fuelFrac, hp;
        public HudParts parts = new HudParts();
        public string region, fps;
    }
    public sealed class SpeedoData
    {
        public double speed; public string units = "KM/H"; public double rpm, redline = 6000; public string gear = "1";
        public double boostCap, boostTank, boost; public bool overboost, lowFuel, engineWarn, brakeWarn, hot;
    }

    public sealed class BoardRow { public string name; public int pos; public bool me; public string color, gap; }
    public sealed class MapDot { public double x, z; public bool me; public string color; }
    public sealed class RaceHudData
    {
        public int pos, n, lap, laps; public bool sprint; public string time, best;
        public List<BoardRow> board = new List<BoardRow>();
        public double nitro; public bool nitroOn;
        public List<MapDot> dots = new List<MapDot>();
        public double? progress;
    }
    // name tag over another driver: world position of the car (Unity space), the tag is drawn 1.6 m above it
    public sealed class NameTag { public Vector3 pos; public string name, color, label; }

    public sealed class MapInfo
    {
        public string id, name, country, cc, region, desc, kind; public int laps; public double km, reward;
        public bool locked; public int need, wins; public string bestLap;
        public List<Vector2> outline; public bool loop;
    }
    public sealed class RaceSelectData { public List<MapInfo> maps = new List<MapInfo>(); public string sel; public int opponents; public double cash; }

    public sealed class CarSil
    {
        public List<Vector2> body = new List<Vector2>(), pts = new List<Vector2>(), shoulder = new List<Vector2>();
        public List<Vector3> wheels = new List<Vector3>(); // (z, y, r)
        public double z0, z1, y0, y1;
    }
    public sealed class CarCard { public string id, name, cls, price, state, letter, color; public int pi; public CarSil sil; }
    public sealed class CarBar { public string label; public double v; public double? max; public string txt; }
    public sealed class CarDetail
    {
        public string name, cls, drive, desc; public string[] traits = new string[0]; public int pi; public string letter;
        public List<CarBar> bars = new List<CarBar>(); public string price, need, action; // action: current | select | buy | nocash
    }
    public sealed class CarouselData { public List<CarCard> cars = new List<CarCard>(); public string sel; public CarDetail detail; }

    // garage panels (built as HTML inside main.js in the web version)
    public sealed class UpgRow { public string id, name, part, price, priceState; public int lv, cap, baseCap; } // priceState: "" | no | max
    public sealed class UpgradesData { public string car, sel; public List<UpgRow> rows = new List<UpgRow>(); }
    public sealed class Effect { public string text; public bool good; }
    public sealed class TireBtn { public string id, name, desc; public bool on, disabled; }
    public sealed class UpgDetail
    {
        public string id, name, pn, desc; public List<Effect> effects; public List<TireBtn> tires; public string tireDesc;
        public string buyLabel; public bool buyEnabled, buyAmber;
    }
    public sealed class Swatch { public string id, name, finish, color; public bool on, locked; } // finish: solid | metallic | pearl | candy | chrome | matte
    public sealed class PaintData { public string car; public List<Swatch> swatches = new List<Swatch>(); }
    public sealed class PaintDetail { public string id, name, finish, lockMsg, label, style; public bool enabled; } // style: main | amber | ""
    public sealed class GLRow { public int level; public string name, right, state; public string[] perks = new string[0]; } // state: done | cur | ""
    public sealed class GLNext { public string name, cost; public bool enabled; }
    public sealed class GarageLevelsData { public int level; public List<GLRow> rows = new List<GLRow>(); public GLNext next; }

    public sealed class GridRow { public int pos; public string name, car, color; public bool me; }
    public sealed class RaceIntroData { public string cc, country, region, name, line; public List<GridRow> grid = new List<GridRow>(); public bool skippable; }
    public sealed class PodiumPlace { public int place; public string name, car, time; public bool me; }
    public sealed class PodiumData { public List<PodiumPlace> places = new List<PodiumPlace>(); }

    public sealed class LobbyInfo { public string code, host, map, mapName, st; public int n; }
    public sealed class MemberInfo { public string name, car, carName; public bool host, rdy, me; }
    public sealed class MapRef { public string id, name, cc; }
    public sealed class OnlineData
    {
        public bool avail, connected; public string via; public bool busy; public string name;
        public List<LobbyInfo> lobbies = new List<LobbyInfo>();
        public bool inLobby; public string code; public bool pub, isHost, ready; public string msg, invite; public bool following;
        public List<MemberInfo> members = new List<MemberInfo>();
        public string map, mapName; public List<MapRef> maps = new List<MapRef>();
    }

    public sealed class ResultRow { public int pos; public string name, car, color, time, best; public bool me; }
    public sealed class RaceResultsData
    {
        public string title, mapName, mapCountry;
        public List<ResultRow> rows = new List<ResultRow>();
        public List<string[]> lines = new List<string[]>();
        public double total; public string gift; public bool online, host;
    }
    public sealed class SummaryData
    {
        public string reason, title; public double distance; public bool record;
        public List<string[]> lines = new List<string[]>(); public double total;
        public List<KeyValuePair<string, double>> condition = new List<KeyValuePair<string, double>>();
        public string next;
    }
    public sealed class AchItem { public string name, desc; public double reward; public bool done; }
}

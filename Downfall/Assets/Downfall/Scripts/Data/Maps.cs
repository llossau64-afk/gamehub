// Race maps. Circuits are closed loops built from a control polygon (see
// Track.PlanLoop); sprints use the point-to-point mountain generator.
// Every map gets one or more biome bands that drive the look and the roadside.
using System;
using System.Collections.Generic;
using static Downfall.Mountains;

namespace Downfall
{
    public sealed class MapDef : MountainDef
    {
        public string country, region, desc;
        public int tier, reward;
    }

    public static class Maps
    {
        static HazardDef RaceHz() => new HazardDef { potholes = 0.15, puddles = 0.2, mud = 0, rocks = 0, fallenTrees = 0, abandoned = 0, ice = 0, jumps = 0 };
        static SurfaceDef CleanSurf() => new SurfaceDef { @base = 0, damaged = 0.05, gravel = 0 };

        // A biome band for a whole circuit. Like the JS spread, anything `o` sets wins outright:
        // a map that sets hazards or surface replaces the race defaults with exactly what it lists.
        static BiomeDef Band(BiomeDef b, Action<BiomeDef> o = null, params Action<LookDef>[] look)
        {
            var r = b.Clone();
            r.id = "race-" + b.id; r.animals = b.id; r.start = 0; r.end = 1e9;
            r.hazards = RaceHz(); r.surface = CleanSurf(); r.rails = 0.35;
            o?.Invoke(r);
            r.look = b.look.Clone();
            foreach (var l in look) l(r.look);
            return r;
        }
        static BiomeDef Span(BiomeDef b, double start, double end) => b.With(x => { x.start = start; x.end = end; });

        // looks
        static readonly Action<LookDef> GOLDEN = l => { l.sun = 0xffc884; l.sunIntensity = 3.4; l.sunElev = 11; l.hemiSky = 0xd4c2aa; l.hemiGround = 0x5a4a34; l.skyTop = 0x5a86c0; l.skyHorizon = 0xf0d2a8; l.fog = 0xe0c7a4; l.fogDensity = 0.0024; };
        static readonly Action<LookDef> NOON = l => { l.sun = 0xfff3e0; l.sunIntensity = 3.2; l.sunElev = 52; l.skyTop = 0x3f78c4; l.skyHorizon = 0xbcd4e8; l.fog = 0xc4d6e4; l.fogDensity = 0.0018; l.clouds = 0.3; };
        static readonly Action<LookDef> DUSK = l => { l.sun = 0xff8f5a; l.sunIntensity = 2.2; l.sunElev = 4; l.skyTop = 0x2c3a6a; l.skyHorizon = 0xf09a6a; l.fog = 0x9a7a8a; l.fogDensity = 0.003; l.hemiSky = 0x8a7aa0; l.hemiGround = 0x3a3040; l.hemiIntensity = 0.75; };
        static readonly Action<LookDef> MORNING = l => { l.sun = 0xffe2c0; l.sunIntensity = 2.8; l.sunElev = 16; l.skyTop = 0x6f9ccc; l.skyHorizon = 0xdfe6ea; l.fog = 0xd0dbe0; l.fogDensity = 0.0032; };
        static readonly Action<LookDef> RAIN = l => { l.weather = "rain"; l.clouds = 0.95; l.cloudDark = 0.5; l.sunIntensity = 1.4; l.fogDensity = 0.0045; l.skyTop = 0x5d6976; l.skyHorizon = 0xa2aab0; l.fog = 0x8f989e; };

        static readonly Action<LookDef> sakura = l => { l.cherry = 1; l.warmth = 0.15; };
        static readonly TreeMix japanTrees = new TreeMix { pine = 0.35, cherry = 0.45, spruce = 0.2, density = 0.85 };
        static readonly TreeMix mapleTrees = new TreeMix { pine = 0.3, maple = 0.55, birch = 0.15, density = 0.95 };
        static readonly TreeMix blackForest = new TreeMix { spruce = 0.65, pine = 0.3, birch = 0.05, density = 1.1 };
        static readonly TreeMix provence = new TreeMix { oak = 0.5, pine = 0.4, cypress = 0.1, density = 0.5 };
        static readonly TreeMix meadow = new TreeMix { oak = 0.45, birch = 0.3, pine = 0.25, density = 0.55 };

        // `circuit({...})` / `sprint({...})`: defaults the map did not set
        static MapDef Circuit(this MapDef m) { m.kind = "circuit"; if (m.laps == 0) m.laps = 3; if (m.startAltitude == 0) m.startAltitude = 300; return m; }
        static MapDef Sprint(this MapDef m) { m.kind = "sprint"; if (m.laps == 0) m.laps = 1; if (m.startAltitude == 0) m.startAltitude = 1200; return m; }

        public static readonly MapDef[] MAPS =
        {
            // ---------------------------------------------------------------- JAPAN
            new MapDef
            {
                id = "jp-sakura", name = "SAKURA RING", country = "JAPAN", region = "Kawazu, Shizuoka", tier = 1, reward = 4000, seed = 3101,
                circuit = new CircuitDef { shape = "twisty", size = 300, rmin = 22, elev = 9, minLen = 2200 },
                biomes = new[] { Band(village, b => { b.width = 9; b.trees = japanTrees; b.props = new[] { "houses", "poles", "fences" }; b.rails = 0.6; b.railType = 1; }, GOLDEN, sakura, l => l.grass = 0x6f7a3c) },
                desc = "Cherry trees in full bloom line a tight hillside loop. Petals on the asphalt, guard rails everywhere.",
            }.Circuit(),
            new MapDef
            {
                id = "jp-hakone", name = "HAKONE TOUGE", country = "JAPAN", region = "Hakone, Kanagawa", tier = 1, reward = 4500, seed = 3117, length = 4200,
                biomes = new[]
                {
                    Span(Band(forest, b => { b.width = 7.4; b.trees = japanTrees; b.plan = new PlanDef { straight = 1.5, sweep = 3, tight = 3.5, hairpin = 1.5 }; b.rails = 0.85; b.railType = 1; b.props = new[] { "poles" }; }, GOLDEN, sakura), 0, 2500),
                    Span(Band(forest, b => { b.width = 7.2; b.trees = mapleTrees; b.plan = new PlanDef { straight = 1, sweep = 2.5, tight = 4, hairpin = 2.5 }; b.rails = 0.9; b.railType = 1; b.props = new[] { "poles" }; }, GOLDEN, l => l.warmth = 0.75), 2500, 1e9),
                },
                desc = "The classic mountain pass: blossoms at the top, red maples at the bottom and a hairpin for every regret.",
            }.Sprint(),
            new MapDef
            {
                id = "jp-kirin", name = "MOUNT KIRIN SPEEDWAY", country = "JAPAN", region = "Oyama, Shizuoka", tier = 2, reward = 7000, seed = 3127,
                circuit = new CircuitDef { shape = "gp", size = 520, rmin = 30, elev = 12, minLen = 3600 },
                biomes = new[] { Band(lower, b => { b.width = 13; b.trees = new TreeMix { pine = 0.35, cherry = 0.45, spruce = 0.2, density = 0.45 }; b.props = new[] { "grandstands", "poles" }; b.rails = 0.2; b.circuitDress = 1; }, NOON, sakura, l => l.snowPeak = 1) },
                desc = "A long main straight under a snow-capped volcano. Brake late, the run-off is generous.",
            }.Circuit(),
            new MapDef
            {
                id = "jp-odaiba", name = "ODAIBA BAY STREETS", country = "JAPAN", region = "Tokyo", tier = 2, reward = 7500, seed = 3139,
                circuit = new CircuitDef { shape = "street", size = 300, rmin = 17, elev = 1.5, minLen = 2400 },
                biomes = new[] { Band(highway, b => { b.width = 11; b.trees = new TreeMix { cherry = 0.6, oak = 0.4, density = 0.25 }; b.props = new[] { "city", "poles" }; b.rails = 1; b.railType = 3; b.surface = new SurfaceDef { @base = 0, damaged = 0 }; }, DUSK, l => { l.weather = "none"; l.clouds = 0.3; l.cloudDark = 0.1; l.warmth = 0.2; l.city = 1; }) },
                desc = "Concrete walls, ninety-degree corners and the bay glowing orange. No room for mistakes.",
            }.Circuit(),
            new MapDef
            {
                id = "jp-iroha", name = "IROHAZAKA HAIRPINS", country = "JAPAN", region = "Nikko, Tochigi", tier = 3, reward = 11000, seed = 3149, length = 5200,
                biomes = new[] { Span(Band(rocky, b => { b.width = 7.6; b.trees = mapleTrees; b.plan = new PlanDef { straight = 1, sweep = 2, tight = 3, hairpin = 4.5 }; b.rails = 0.95; b.railType = 1; b.props = new[] { "poles" }; b.hazards = new HazardDef { rockfall = 0 }; }, MORNING, l => { l.warmth = 0.8; l.grass = 0x7a6a34; }), 0, 1e9) },
                desc = "Forty-eight hairpins down a gorge on fire with autumn colour.",
            }.Sprint(),
            // ---------------------------------------------------------------- GERMANY
            new MapDef
            {
                id = "de-eifel", name = "EIFELRING NORD", country = "GERMANY", region = "Eifel, Rhineland-Palatinate", tier = 4, reward = 18000, seed = 4201, laps = 2,
                circuit = new CircuitDef { shape = "twisty", size = 820, rmin = 26, elev = 34, minLen = 6500 },
                biomes = new[] { Band(forest, b => { b.width = 9.5; b.trees = blackForest; b.props = new[] { "poles", "logs" }; b.rails = 0.9; b.railType = 1; b.flat = 0.3; }, MORNING, l => l.grass = 0x4f6a2e) },
                desc = "Twenty kilometres of folklore squeezed into a long forest loop. Crests, compressions and no forgiveness.",
            }.Circuit(),
            new MapDef
            {
                id = "de-schwarzwald", name = "SCHWARZWALD PASS", country = "GERMANY", region = "Black Forest, Baden-Württemberg", tier = 1, reward = 5000, seed = 4211, length = 4600,
                biomes = new[] { Span(Band(forest, b => { b.width = 7; b.trees = blackForest; b.props = new[] { "houses", "poles", "logs", "fences" }; b.rails = 0.7; b.railType = 2; }, MORNING, l => { l.fog = 0xbcc8c4; l.fogDensity = 0.004; }), 0, 1e9) },
                desc = "Dark fir forest, half-timbered farms and cows that do not care about your lap time.",
            }.Sprint(),
            new MapDef
            {
                id = "de-autobahn", name = "AUTOBAHN A8 SPRINT", country = "GERMANY", region = "Bavaria", tier = 2, reward = 9000, seed = 4223, length = 7000, startAltitude = 700,
                biomes = new[] { Span(Band(highway, b => { b.width = 14; b.trees = meadow; b.plan = new PlanDef { straight = 6, sweep = 4, tight = 0, hairpin = 0 }; b.grade = new[] { 0.005, 0.02 }; b.rails = 1; b.railType = 1; b.props = new[] { "poles", "fences" }; b.surface = new SurfaceDef { @base = 0, damaged = 0 }; }, NOON, l => { l.weather = "none"; l.clouds = 0.35; l.cloudDark = 0.1; }), 0, 1e9) },
                desc = "No speed limit. Long, wide and fast: the place to find out what your car really does.",
            }.Sprint(),
            new MapDef
            {
                id = "de-alpen", name = "ALPENRING BAYERN", country = "GERMANY", region = "Garmisch, Bavaria", tier = 3, reward = 12000, seed = 4231,
                circuit = new CircuitDef { shape = "twisty", size = 420, rmin = 22, elev = 22, minLen = 3200 },
                biomes = new[] { Band(village, b => { b.width = 9; b.trees = new TreeMix { spruce = 0.5, pine = 0.3, birch = 0.2, density = 0.7 }; b.props = new[] { "houses", "fences", "poles" }; b.rails = 0.5; b.railType = 2; }, NOON, l => { l.snowPeak = 1; l.grass = 0x6a8a3a; }) },
                desc = "Alpine meadows, wooden balconies and a view of the Zugspitze between corners.",
            }.Circuit(),
            new MapDef
            {
                id = "de-hockenring", name = "HOCKENRING GP", country = "GERMANY", region = "Baden", tier = 3, reward = 14000, seed = 4243,
                circuit = new CircuitDef { shape = "gp", size = 460, rmin = 24, elev = 3, minLen = 3800 },
                biomes = new[] { Band(lower, b => { b.width = 13; b.trees = new TreeMix { oak = 0.4, birch = 0.3, pine = 0.3, density = 0.4 }; b.props = new[] { "grandstands" }; b.rails = 0.15; b.circuitDress = 1; }, NOON, l => l.warmth = 0.1) },
                desc = "A Grand Prix circuit: a stadium section, a fast back straight and a hairpin into the grandstands.",
            }.Circuit(),
            // ---------------------------------------------------------------- FRANCE
            new MapDef
            {
                id = "fr-riviera", name = "RIVIERA STREET CIRCUIT", country = "FRANCE", region = "Côte d'Azur", tier = 4, reward = 20000, seed = 5101,
                circuit = new CircuitDef { shape = "street", size = 260, rmin = 15, elev = 14, minLen = 2300 },
                biomes = new[] { Band(village, b => { b.width = 9.5; b.trees = new TreeMix { pine = 0.5, oak = 0.3, cypress = 0.2, density = 0.35 }; b.props = new[] { "city", "houses" }; b.rails = 1; b.railType = 3; }, GOLDEN, l => { l.sunElev = 18; l.warmth = 0.45; l.grass = 0x7a8040; l.sea = 1; }) },
                desc = "Barriers inches from the mirrors, a harbour full of yachts and a tunnel of noise.",
            }.Circuit(),
            new MapDef
            {
                id = "fr-provence", name = "PROVENCE LAVENDER RUN", country = "FRANCE", region = "Valensole, Provence", tier = 2, reward = 8000, seed = 5113, length = 5000, startAltitude = 600,
                biomes = new[] { Span(Band(lower, b => { b.width = 7.5; b.trees = provence; b.props = new[] { "fences", "poles", "houses", "lavender" }; b.plan = new PlanDef { straight = 3, sweep = 5, tight = 1.5, hairpin = 0 }; b.grade = new[] { 0.01, 0.035 }; }, GOLDEN, l => { l.warmth = 0.6; l.grass = 0x8a8a44; l.lavender = 1; }), 0, 1e9) },
                desc = "Purple fields to the horizon, plane trees and stone farmhouses. Bring sunglasses.",
            }.Sprint(),
            new MapDef
            {
                id = "fr-sarthe", name = "SARTHE 24", country = "FRANCE", region = "Le Mans, Sarthe", tier = 5, reward = 26000, seed = 5129, laps = 2,
                circuit = new CircuitDef { shape = "gp", size = 950, rmin = 36, elev = 6, minLen = 5200 },
                biomes = new[] { Band(lower, b => { b.width = 12; b.trees = new TreeMix { oak = 0.4, pine = 0.4, birch = 0.2, density = 0.65 }; b.props = new[] { "grandstands", "poles" }; b.rails = 0.4; b.railType = 1; b.circuitDress = 1; }, DUSK, l => l.sunElev = 8) },
                desc = "Endless straights through the countryside at dusk. Top speed is everything here.",
            }.Circuit(),
            new MapDef
            {
                id = "fr-galibier", name = "COL DU GALIBIER", country = "FRANCE", region = "Savoie", tier = 4, reward = 17000, seed = 5131, length = 5600, startAltitude = 2600,
                biomes = new[]
                {
                    Span(Band(snow, b => { b.width = 6.8; b.trees = new TreeMix { spruce = 0.6, pine = 0.4, density = 0.25, snowy = 1 }; b.props = new[] { "snowpoles" }; b.rails = 0.6; b.railType = 1; b.hazards = new HazardDef { ice = 0.2 }; }, l => { l.weather = "none"; l.sunIntensity = 2.6; l.sunElev = 30; }), 0, 2600),
                    Span(Band(rocky, b => { b.width = 7; b.trees = new TreeMix { pine = 0.7, spruce = 0.3, density = 0.4 }; b.rails = 0.7; b.railType = 1; b.hazards = new HazardDef { rockfall = 0 }; }, NOON), 2600, 1e9),
                },
                desc = "From the snow line down to the valley in one breath. Thin air, thin margins.",
            }.Sprint(),
            new MapDef
            {
                id = "fr-bordeaux", name = "BORDEAUX VINEYARDS", country = "FRANCE", region = "Saint-Émilion", tier = 3, reward = 13000, seed = 5147,
                circuit = new CircuitDef { shape = "twisty", size = 380, rmin = 21, elev = 12, minLen = 2900 },
                biomes = new[] { Band(lower, b => { b.width = 8.5; b.trees = new TreeMix { oak = 0.6, cypress = 0.2, birch = 0.2, density = 0.45 }; b.props = new[] { "houses", "fences", "vines" }; b.rails = 0.2; }, GOLDEN, l => { l.warmth = 0.55; l.vines = 1; }) },
                desc = "Rolling vine rows, a château on every hill and corners named after grape varieties.",
            }.Circuit(),
            // ---------------------------------------------------------------- ELSEWHERE
            new MapDef
            {
                id = "it-brianza", name = "AUTODROMO BRIANZA", country = "ITALY", region = "Lombardy", tier = 5, reward = 24000, seed = 6101,
                circuit = new CircuitDef { shape = "gp", size = 620, rmin = 34, elev = 2, minLen = 4600 },
                biomes = new[] { Band(lower, b => { b.width = 13; b.trees = new TreeMix { oak = 0.5, pine = 0.3, birch = 0.2, density = 0.7 }; b.props = new[] { "grandstands" }; b.rails = 0.2; b.circuitDress = 1; }, NOON, l => l.warmth = 0.3) },
                desc = "The temple of speed: long straights in a royal park and chicanes that punish greed.",
            }.Circuit(),
            new MapDef
            {
                id = "us-mesa", name = "MESA SPEEDWAY", country = "USA", region = "Arizona", tier = 4, reward = 19000, seed = 6113,
                circuit = new CircuitDef { shape = "oval", size = 600, rmin = 45, elev = 2, minLen = 3200 },
                biomes = new[] { Band(lower, b => { b.width = 15; b.trees = new TreeMix { pine = 0.4, oak = 0.6, density = 0.12, dry = 1 }; b.props = new[] { "grandstands" }; b.rails = 1; b.railType = 3; b.circuitDress = 1; },
                    l => { l.skyTop = 0x6c93c0; l.skyHorizon = 0xe9cfae; l.fog = 0xd9b993; l.fogDensity = 0.002; l.sun = 0xffd29a; l.sunIntensity = 3.4; l.sunElev = 30; l.hemiSky = 0xd8c3a5; l.hemiGround = 0x7a4e30; l.grass = 0x8a7a48; l.dirt = 0x9a6a44; l.rock = 0xa0644a; l.warmth = 0.6; }) },
                desc = "A banked desert oval. Flat out, door to door, for as long as your nerve holds.",
            }.Circuit(),
            new MapDef
            {
                id = "no-fjord", name = "FJORD COAST ROAD", country = "NORWAY", region = "Geiranger", tier = 4, reward = 18000, seed = 6127, length = 5400,
                biomes = new[] { Span(Band(cliffs, b => { b.width = 6.8; b.trees = new TreeMix { spruce = 0.6, pine = 0.3, birch = 0.1, density = 0.6 }; b.rails = 0.9; b.railType = 1; b.props = new[] { "waterfalls", "poles" }; b.hazards = new HazardDef { rockfall = 0 }; }, RAIN, l => { l.weather = "rain"; l.grass = 0x4a6a34; }), 0, 1e9) },
                desc = "Waterfalls, wet rock and a sheer drop to the fjord. The rain never really stops.",
            }.Sprint(),
            new MapDef
            {
                id = "ch-summit", name = "ALPINE SUMMIT", country = "SWITZERLAND", region = "Furka Pass, Valais", tier = 5, reward = 28000, seed = 6131, length = 6200, startAltitude = 2400,
                biomes = new[]
                {
                    Span(Band(snow, b => { b.width = 6.6; b.trees = new TreeMix { spruce = 0.7, pine = 0.3, density = 0.3, snowy = 1 }; b.props = new[] { "snowpoles" }; b.rails = 0.8; b.railType = 1; b.plan = new PlanDef { straight = 1, sweep = 2, tight = 3, hairpin = 3.5 }; b.hazards = new HazardDef { ice = 0.25 }; }, l => { l.weather = "snow"; l.sunIntensity = 2.0; }), 0, 3200),
                    Span(Band(rocky, b => { b.width = 7; b.trees = new TreeMix { spruce = 0.6, pine = 0.4, density = 0.55 }; b.rails = 0.8; b.railType = 1; b.plan = new PlanDef { straight = 1, sweep = 2, tight = 3, hairpin = 3 }; b.hazards = new HazardDef { rockfall = 0 }; }, MORNING), 3200, 1e9),
                },
                desc = "The hardest descent in the game: ice, hairpins and a glacier staring at you the whole way down.",
            }.Sprint(),
            new MapDef
            {
                id = "uk-highlands", name = "HIGHLANDS RALLY LOOP", country = "SCOTLAND", region = "Cairngorms", tier = 5, reward = 25000, seed = 6143,
                circuit = new CircuitDef { shape = "twisty", size = 460, rmin = 20, elev = 26, minLen = 3500 },
                biomes = new[] { Band(lower, b => { b.width = 7.5; b.trees = new TreeMix { pine = 0.6, birch = 0.4, density = 0.5 }; b.props = new[] { "fences", "logs" }; b.rails = 0.1; b.surface = new SurfaceDef { @base = 2, damaged = 0.1, gravel = 0.3 }; b.hazards = new HazardDef { puddles = 0.8, mud = 0.4 }; },
                    RAIN, l => { l.weather = "none"; l.clouds = 0.8; l.sunIntensity = 2.0; l.grass = 0x5a6a34; l.warmth = 0.05; }) },
                desc = "Gravel, heather and puddles you cannot see the bottom of. Rally cars welcome.",
            }.Circuit(),
        };

        public static MapDef MapById(string id)
        {
            foreach (var m in MAPS) if (m.id == id) return m;
            return MAPS[0];
        }

        public static readonly Dictionary<string, string> COUNTRY_CODES = new Dictionary<string, string>
        {
            { "JAPAN", "JP" }, { "GERMANY", "DE" }, { "FRANCE", "FR" }, { "ITALY", "IT" }, { "USA", "US" }, { "NORWAY", "NO" }, { "SWITZERLAND", "CH" }, { "SCOTLAND", "GB" },
        };
    }
}

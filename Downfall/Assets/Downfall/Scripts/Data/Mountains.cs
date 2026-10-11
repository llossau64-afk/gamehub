// Mountain definitions. A mountain is one continuous road; biomes are distance bands
// that drive both the road generator (curves, grade, hazards) and the look
// (light, fog, ground, weather). Neighbouring biomes blend over `BLEND` metres.
//
// JS object spreads become Clone() + overrides. Optional numbers the JS leaves undefined:
// HazardDef / SurfaceDef fields are NaN when absent (so `x * rate` and comparisons behave
// like undefined in JS: use Track.Truthy / `|| 0` style reads), everything else defaults to 0.
using System;

namespace Downfall
{
    public sealed class PlanDef { public double straight, sweep, tight, hairpin; }

    public sealed class SurfaceDef
    {
        public int @base;
        public double damaged = double.NaN, gravel = double.NaN, dirt = double.NaN;
    }

    public sealed class HazardDef
    {
        public double potholes = double.NaN, puddles = double.NaN, mud = double.NaN, rocks = double.NaN,
            fallenTrees = double.NaN, abandoned = double.NaN, ice = double.NaN, jumps = double.NaN, rockfall = double.NaN;
    }

    public sealed class TreeMix
    {
        public double pine, spruce, birch, oak, cherry, maple, cypress, density, snowy, dry;
        public double Get(string k)
        {
            switch (k)
            {
                case "pine": return pine; case "spruce": return spruce; case "birch": return birch; case "oak": return oak;
                case "cherry": return cherry; case "maple": return maple; case "cypress": return cypress;
                case "density": return density; case "snowy": return snowy; case "dry": return dry;
            }
            return 0;
        }
    }

    // Colours are 0xRRGGBB ints, everything else interpolates as a number.
    public sealed class LookDef
    {
        public int skyTop, skyHorizon, fog, sun, hemiSky, hemiGround, grass, dirt, rock;
        public double fogDensity, sunIntensity, sunElev, sunAzim, hemiIntensity, snow, clouds, cloudDark;
        public string weather = "none";
        public double wind, birds, warmth;
        // optional extras some maps switch on
        public double snowPeak, cherry, city, sea, lavender, vines;
        public LookDef Clone() => (LookDef)MemberwiseClone();
    }

    public sealed class BiomeDef
    {
        public string id, name;
        public double start, end;
        public double width;
        public double[] grade;
        public PlanDef plan;
        public double flat, wallSlope, dropSlope, rails;
        public int railType;
        public SurfaceDef surface;
        public HazardDef hazards;
        public TreeMix trees;
        public double rocks;
        public string[] props = new string[0];
        public double tunnel, bridge;
        public LookDef look;
        public string animals;       // race bands: which habitat the animals use
        public double circuitDress;

        public bool Has(string prop) => Array.IndexOf(props, prop) >= 0;
        // shallow, like `{ ...biome }`
        public BiomeDef Clone() => (BiomeDef)MemberwiseClone();
        public BiomeDef With(Action<BiomeDef> o) { var c = Clone(); o(c); return c; }
    }

    public sealed class CircuitDef
    {
        public string shape;
        public double size, rmin, elev, minLen;
    }

    // Shared by the downhill mountains and the race maps (MapDef): Track only needs this.
    public class MountainDef
    {
        public string id, name, title;
        public double length, seed, startAltitude;
        public BiomeDef[] biomes;
        public string requires;
        public string kind;          // null for mountains, 'circuit' / 'sprint' for maps
        public int laps;
        public CircuitDef circuit;   // null unless a closed loop
    }

    public static class Mountains
    {
        public const double BLEND = 350;

        public static readonly BiomeDef village = new BiomeDef
        {
            id = "village", name = "MOUNTAIN VILLAGE", start = 0, end = 1000,
            width = 7.2, grade = new[] { 0.025, 0.05 }, plan = new PlanDef { straight = 3, sweep = 4, tight = 1.2, hairpin = 0 },
            flat = 0.75, wallSlope = 0.45, dropSlope = 0.35, rails = 0.25, railType = 2,
            surface = new SurfaceDef { @base = 0, damaged = 0.15, gravel = 0.05 },
            hazards = new HazardDef { potholes = 0.4, puddles = 0.5, mud = 0.1, rocks = 0.1, fallenTrees = 0, abandoned = 0.2, ice = 0, jumps = 0 },
            trees = new TreeMix { pine = 0.55, spruce = 0.35, birch = 0.1, density = 0.55 }, rocks = 0.25,
            props = new[] { "houses", "fences", "poles" },
            look = new LookDef
            {
                skyTop = 0x5d86b5, skyHorizon = 0xc9d6df, fog = 0xbfcdd6, fogDensity = 0.0026,
                sun = 0xffe2bd, sunIntensity = 3.0, sunElev = 14, sunAzim = 120, hemiSky = 0xb8cde0, hemiGround = 0x5a5440, hemiIntensity = 0.9,
                grass = 0x5f6e37, dirt = 0x6b5a42, rock = 0x77746d, snow = 0, clouds = 0.35, cloudDark = 0.1,
                weather = "none", wind = 0.3, birds = 1, warmth = 0.1,
            },
        };

        public static readonly BiomeDef forest = new BiomeDef
        {
            id = "forest", name = "FOREST ROAD", start = 1000, end = 3000,
            width = 6.8, grade = new[] { 0.045, 0.075 }, plan = new PlanDef { straight = 2, sweep = 4, tight = 3, hairpin = 0.4 },
            flat = 0.2, wallSlope = 0.75, dropSlope = 0.6, rails = 0.55, railType = 2,
            surface = new SurfaceDef { @base = 0, damaged = 0.3, gravel = 0.2, dirt = 0.08 },
            hazards = new HazardDef { potholes = 0.8, puddles = 0.9, mud = 0.6, rocks = 0.2, fallenTrees = 0.5, abandoned = 0.15, ice = 0, jumps = 0.25 },
            trees = new TreeMix { pine = 0.5, spruce = 0.45, birch = 0.05, density = 1.0 }, rocks = 0.5,
            props = new[] { "poles", "logs" },
            look = new LookDef
            {
                skyTop = 0x557ca6, skyHorizon = 0xb9c8cf, fog = 0xa7b7b8, fogDensity = 0.0042,
                sun = 0xffe6c4, sunIntensity = 2.6, sunElev = 22, sunAzim = 135, hemiSky = 0xa9bfcf, hemiGround = 0x3e4430, hemiIntensity = 0.8,
                grass = 0x4b5a2d, dirt = 0x5a4a35, rock = 0x6d6c66, snow = 0, clouds = 0.45, cloudDark = 0.15,
                weather = "none", wind = 0.4, birds = 1, warmth = 0.05,
            },
        };

        public static readonly BiomeDef rocky = new BiomeDef
        {
            id = "rocky", name = "ROCKY PASS", start = 3000, end = 6000,
            width = 6.4, grade = new[] { 0.06, 0.1 }, plan = new PlanDef { straight = 1.5, sweep = 2, tight = 4, hairpin = 2.2 },
            flat = 0.05, wallSlope = 1.6, dropSlope = 0.95, rails = 0.75, railType = 1,
            surface = new SurfaceDef { @base = 0, damaged = 0.35, gravel = 0.35 },
            hazards = new HazardDef { potholes = 0.7, puddles = 0.2, mud = 0.1, rocks = 1.0, fallenTrees = 0.05, abandoned = 0.2, ice = 0, jumps = 0.25, rockfall = 1 },
            trees = new TreeMix { pine = 0.8, spruce = 0.2, birch = 0, density = 0.3 }, rocks = 1.4,
            props = new[] { "tunnels", "shortcuts" }, tunnel = 0.5, bridge = 0.3,
            look = new LookDef
            {
                skyTop = 0x4f73a0, skyHorizon = 0xb4c1c9, fog = 0xa9b3b8, fogDensity = 0.0034,
                sun = 0xfff0d8, sunIntensity = 2.9, sunElev = 30, sunAzim = 160, hemiSky = 0xaebccc, hemiGround = 0x4b4840, hemiIntensity = 0.85,
                grass = 0x5b5f3a, dirt = 0x6a5f50, rock = 0x7b7770, snow = 0.05, clouds = 0.5, cloudDark = 0.2,
                weather = "none", wind = 0.6, birds = 0.4, warmth = 0,
            },
        };

        public static readonly BiomeDef snow = new BiomeDef
        {
            id = "snow", name = "SNOW LINE", start = 6000, end = 10000,
            width = 6.4, grade = new[] { 0.05, 0.09 }, plan = new PlanDef { straight = 1.5, sweep = 2.5, tight = 3, hairpin = 2.5 },
            flat = 0.1, wallSlope = 1.1, dropSlope = 0.85, rails = 0.7, railType = 1,
            surface = new SurfaceDef { @base = 5, damaged = 0.1, gravel = 0.1 },
            hazards = new HazardDef { potholes = 0.3, puddles = 0, mud = 0, rocks = 0.5, fallenTrees = 0.3, abandoned = 0.25, ice = 1.0, jumps = 0.2 },
            trees = new TreeMix { pine = 0.3, spruce = 0.7, birch = 0, density = 0.6, snowy = 1 }, rocks = 0.8,
            props = new[] { "snowpoles", "shortcuts", "tunnels" }, tunnel = 0.25, bridge = 0.2,
            look = new LookDef
            {
                skyTop = 0x7c8ea3, skyHorizon = 0xd2d8dd, fog = 0xc9d0d6, fogDensity = 0.0068,
                sun = 0xe8eef5, sunIntensity = 1.7, sunElev = 26, sunAzim = 170, hemiSky = 0xcfd8e2, hemiGround = 0x8a8f96, hemiIntensity = 1.15,
                grass = 0x6e7360, dirt = 0x6f6a62, rock = 0x6c6d70, snow = 1, clouds = 0.85, cloudDark = 0.35,
                weather = "snow", wind = 0.8, birds = 0, warmth = -0.15,
            },
        };

        public static readonly BiomeDef highway = new BiomeDef
        {
            id = "highway", name = "ABANDONED HIGHWAY", start = 10000, end = 15000,
            width = 10.5, grade = new[] { 0.025, 0.06 }, plan = new PlanDef { straight = 4, sweep = 4, tight = 0.8, hairpin = 0 },
            flat = 0.35, wallSlope = 0.9, dropSlope = 0.55, rails = 0.9, railType = 3,
            surface = new SurfaceDef { @base = 1, damaged = 0.55, gravel = 0.1 },
            hazards = new HazardDef { potholes = 1.4, puddles = 1.0, mud = 0.2, rocks = 0.4, fallenTrees = 0.2, abandoned = 1.4, ice = 0, jumps = 0.35 },
            trees = new TreeMix { pine = 0.6, spruce = 0.3, birch = 0.1, density = 0.5 }, rocks = 0.6,
            props = new[] { "ruins", "barriers", "tunnels", "bridges", "shortcuts" }, tunnel = 0.45, bridge = 0.9,
            look = new LookDef
            {
                skyTop = 0x5f6a78, skyHorizon = 0xa9adb0, fog = 0x8f979c, fogDensity = 0.0048,
                sun = 0xdfe3e6, sunIntensity = 1.5, sunElev = 34, sunAzim = 190, hemiSky = 0x9aa4ae, hemiGround = 0x484840, hemiIntensity = 1.0,
                grass = 0x55603a, dirt = 0x5e5446, rock = 0x6c6a64, snow = 0, clouds = 0.95, cloudDark = 0.55,
                weather = "rain", wind = 0.5, birds = 0.2, warmth = -0.05,
            },
        };

        public static readonly BiomeDef cliffs = new BiomeDef
        {
            id = "cliffs", name = "THE CLIFFS", start = 15000, end = 20000,
            width = 6.0, grade = new[] { 0.06, 0.11 }, plan = new PlanDef { straight = 1.5, sweep = 3, tight = 3.5, hairpin = 1.6 },
            flat = 0.0, wallSlope = 2.6, dropSlope = 2.4, rails = 0.65, railType = 1,
            surface = new SurfaceDef { @base = 0, damaged = 0.4, gravel = 0.25 },
            hazards = new HazardDef { potholes = 0.7, puddles = 0.4, mud = 0.2, rocks = 0.9, fallenTrees = 0.05, abandoned = 0.3, ice = 0, jumps = 0.15, rockfall = 1 },
            trees = new TreeMix { pine = 0.9, spruce = 0.1, birch = 0, density = 0.25 }, rocks = 1.2,
            props = new[] { "tunnels", "bridges", "waterfalls", "shortcuts" }, tunnel = 0.6, bridge = 0.6,
            look = new LookDef
            {
                skyTop = 0x48586b, skyHorizon = 0xa3a6a6, fog = 0x8e9496, fogDensity = 0.0036,
                sun = 0xffd9ab, sunIntensity = 2.1, sunElev = 18, sunAzim = 220, hemiSky = 0x99a3ad, hemiGround = 0x4a4038, hemiIntensity = 0.9,
                grass = 0x56583a, dirt = 0x6b5843, rock = 0x7a7066, snow = 0, clouds = 0.8, cloudDark = 0.6,
                weather = "storm", wind = 1.0, birds = 0.3, warmth = 0.1,
            },
        };

        public static readonly BiomeDef lower = new BiomeDef
        {
            id = "lower", name = "THE LOWER PASS", start = 20000, end = 25000,
            width = 7.0, grade = new[] { 0.035, 0.07 }, plan = new PlanDef { straight = 2.5, sweep = 4.5, tight = 2, hairpin = 0.3 },
            flat = 0.4, wallSlope = 0.7, dropSlope = 0.5, rails = 0.5, railType = 2,
            surface = new SurfaceDef { @base = 0, damaged = 0.25, gravel = 0.25, dirt = 0.1 },
            hazards = new HazardDef { potholes = 0.8, puddles = 0.5, mud = 0.5, rocks = 0.3, fallenTrees = 0.3, abandoned = 0.4, ice = 0, jumps = 0.45 },
            trees = new TreeMix { pine = 0.25, spruce = 0.1, birch = 0.25, oak = 0.4, density = 0.85 }, rocks = 0.5,
            props = new[] { "poles", "fences", "ruins", "bridges", "shortcuts" }, bridge = 0.5,
            look = new LookDef
            {
                skyTop = 0x5b7fa8, skyHorizon = 0xe8c9a0, fog = 0xd6bf9c, fogDensity = 0.0028,
                sun = 0xffc27d, sunIntensity = 3.2, sunElev = 9, sunAzim = 255, hemiSky = 0xc9b9a3, hemiGround = 0x5a4a30, hemiIntensity = 0.85,
                grass = 0x7a7a3a, dirt = 0x7a6040, rock = 0x86766a, snow = 0, clouds = 0.3, cloudDark = 0.05,
                weather = "none", wind = 0.35, birds = 1, warmth = 0.45,
            },
        };

        static readonly BiomeDef bottom = lower.With(b =>
        {
            b.id = "bottom"; b.name = "BOTTOM OF THE MOUNTAIN"; b.start = 25000; b.end = 26000;
            b.plan = new PlanDef { straight = 6, sweep = 1, tight = 0, hairpin = 0 }; b.grade = new[] { 0.0, 0.01 }; b.flat = 0.9; b.rails = 0;
            b.hazards = new HazardDef { potholes = 0, puddles = 0, mud = 0, rocks = 0, fallenTrees = 0, abandoned = 0, ice = 0, jumps = 0 };
            b.props = new[] { "finish", "fences", "poles" };
        });

        // ---------------------------------------------------------------------------
        // Mountain II: a dry canyon, unlocked after the first mountain is completed.
        static LookDef CanyonLook(Action<LookDef> o = null)
        {
            var l = new LookDef
            {
                skyTop = 0x6c93c0, skyHorizon = 0xe9cfae, fog = 0xd9b993, fogDensity = 0.0026,
                sun = 0xffd29a, sunIntensity = 3.4, sunElev = 30, sunAzim = 200, hemiSky = 0xd8c3a5, hemiGround = 0x7a4e30, hemiIntensity = 0.8,
                grass = 0x8a7a48, dirt = 0x9a6a44, rock = 0xa0644a, snow = 0, clouds = 0.15, cloudDark = 0.05,
                weather = "none", wind = 0.6, birds = 0.3, warmth = 0.6,
            };
            o?.Invoke(l);
            return l;
        }

        static readonly BiomeDef[] canyon =
        {
            village.With(b => { b.id = "mesa"; b.name = "MESA RIM"; b.start = 0; b.end = 2000; b.flat = 0.5; b.rails = 0.2;
                b.trees = new TreeMix { pine = 0.6, oak = 0.4, density = 0.2, dry = 1 }; b.rocks = 0.9; b.props = new[] { "ruins", "poles" };
                b.surface = new SurfaceDef { @base = 0, damaged = 0.3, gravel = 0.2, dirt = 0.1 }; b.look = CanyonLook(); }),
            rocky.With(b => { b.id = "redwall"; b.name = "RED WALLS"; b.start = 2000; b.end = 7000; b.trees = new TreeMix { pine = 1, density = 0.12, dry = 1 };
                b.surface = new SurfaceDef { @base = 2, damaged = 0.2, gravel = 0.5, dirt = 0.3 }; b.look = CanyonLook(l => { l.rock = 0xa8573a; l.fogDensity = 0.003; l.sunElev = 40; }); }),
            highway.With(b => { b.id = "dryhwy"; b.name = "DUST HIGHWAY"; b.start = 7000; b.end = 13000; b.trees = new TreeMix { oak = 1, density = 0.1, dry = 1 };
                b.look = CanyonLook(l => { l.weather = "dust"; l.fog = 0xcaa27a; l.fogDensity = 0.0045; l.clouds = 0.4; }); }),
            cliffs.With(b => { b.id = "gorge"; b.name = "THE GORGE"; b.start = 13000; b.end = 20000; b.trees = new TreeMix { pine = 1, density = 0.1, dry = 1 };
                b.look = CanyonLook(l => { l.rock = 0x9c5236; l.sunElev = 16; l.sunAzim = 250; l.fog = 0xc09070; l.clouds = 0.5; l.weather = "none"; }); }),
            lower.With(b => { b.id = "riverbed"; b.name = "DRY RIVERBED"; b.start = 20000; b.end = 25000; b.trees = new TreeMix { oak = 0.7, birch = 0.3, density = 0.4, dry = 1 };
                b.surface = new SurfaceDef { @base = 3, damaged = 0.2, gravel = 0.4 }; b.look = CanyonLook(l => { l.sunElev = 7; l.sunAzim = 270; l.sun = 0xffa860; l.warmth = 0.8; }); }),
            bottom.With(b => { b.id = "canyonend"; b.name = "CANYON FLOOR"; b.start = 25000; b.end = 26000; b.look = CanyonLook(l => { l.sunElev = 6; l.sun = 0xff9850; }); }),
        };

        public static readonly MountainDef[] MOUNTAINS =
        {
            new MountainDef
            {
                id = "m1", name = "MOUNTAIN I", title = "HOLLOW PEAK", length = 25000, seed = 1931, startAltitude = 2410,
                biomes = new[] { village, forest, rocky, snow, highway, cliffs, lower, bottom },
            },
            new MountainDef
            {
                id = "m2", name = "MOUNTAIN II", title = "THE CANYON", length = 25000, seed = 7713, startAltitude = 1980,
                biomes = canyon, requires = "m1",
            },
        };

        public static MountainDef MountainById(string id)
        {
            foreach (var m in MOUNTAINS) if (m.id == id) return m;
            return MOUNTAINS[0];
        }
    }
}

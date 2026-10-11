// Upgrade categories, part names, pricing, tyre compounds, garage levels and paints.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Downfall
{
    public sealed class UpgradeCategory { public string id, name, focus, desc; public string[] parts; }
    // Grip multipliers per surface group: [paved, loose, mud, snow/ice].
    public sealed class TireDef { public string id, name, desc; public int unlock; public double[] grip; public double roll; }
    public sealed class GarageLevel { public int level, cost; public string name; public string[] perks; }
    public sealed class PaintFinish { public double rough, metal, clear, sheen; public int level; }
    // color null = factory paint
    public sealed class PaintDef { public string id, name, finish; public int? color; public int cost; }

    public static class Upgrades
    {
        public static readonly UpgradeCategory[] CATEGORIES =
        {
            new UpgradeCategory { id = "engine", name = "ENGINE", focus = "engine", desc = "More horsepower at the top of the rev range. Adds heat and a little weight.",
                parts = new[] { "Stock", "Fresh plugs & filter", "Cold air intake", "Free-flow manifold", "Performance exhaust", "Ported head", "Hot cams", "Lightened flywheel", "Forged pistons", "Big valves", "Stroker kit", "Race ECU", "Dry sump", "Titanium valvetrain", "Competition block", "Individual throttle bodies", "Race-built long block", "Blueprinted engine", "Works engine", "Prototype engine", "Ultimate engine", "Beyond spec" } },
            new UpgradeCategory { id = "transmission", name = "TRANSMISSION", focus = "under", desc = "Taller gearing and faster shifts. Raises the gear-limited top speed; extra ratios at levels 5 and 12.",
                parts = new[] { "Stock", "Fresh fluid", "Short shifter", "Uprated clutch", "Close-ratio gears", "Extra ratio", "Lightened gearset", "Paddle actuator", "Twin-plate clutch", "Dog box", "Sequential conversion", "Race final drive", "Extra ratio II", "Carbon clutch", "Flat-shift ECU", "Race gearbox", "Works gearbox", "Seamless shift", "Prototype gearbox", "Ultimate gearbox", "Beyond spec", "Beyond spec II" } },
            new UpgradeCategory { id = "torque", name = "TORQUE", focus = "engine", desc = "Low-end pulling power. Helps out of hairpins, up climbs and through mud. Slightly thirstier.",
                parts = new[] { "Stock", "Ignition retune", "Long runners", "Torque cam", "Big-bore throttle", "Stroker crank", "Variable timing", "Low-end map", "Equal-length headers", "Torque plate", "High-compression pistons", "Diesel-grade crank", "Torque ECU", "Heavy flywheel", "Twin-scroll manifold", "Works torque kit", "Prototype map", "Ultimate torque", "Beyond spec", "Beyond spec II", "Beyond spec III", "Beyond spec IV" } },
            new UpgradeCategory { id = "tires", name = "TYRES", focus = "wheel", desc = "Grip on every surface. Higher levels unlock new compounds, each with trade-offs.",
                parts = new[] { "Worn street tyres", "Fresh street tyres", "Better rubber", "Wider tyres", "Performance compound", "Stiffer sidewalls", "All-terrain compound", "Sticky compound", "Lightweight wheels", "Off-road compound", "Rally compound", "Wide rims", "Snow compound", "Semi-slick compound", "Forged wheels", "Race compound", "Works tyres", "Prototype rubber", "Ultimate tyres", "Beyond spec", "Beyond spec II", "Beyond spec III" } },
            new UpgradeCategory { id = "brakes", name = "BRAKES", focus = "wheel", desc = "Stopping power and fade resistance. Long descents cook weak brakes.",
                parts = new[] { "Stock", "Fresh pads", "Braided lines", "Sport pads", "Slotted discs", "Race fluid", "Two-piston calipers", "Bigger discs", "Four-piston calipers", "Brake ducts", "Six-piston calipers", "Floating discs", "Race pads", "Carbon pads", "Big brake kit", "Carbon-ceramic discs", "Works brakes", "Prototype brakes", "Ultimate brakes", "Beyond spec", "Beyond spec II", "Beyond spec III" } },
            new UpgradeCategory { id = "suspension", name = "SUSPENSION", focus = "suspension", desc = "Travel, damping and body control. Reduces landing damage and keeps the car settled over bumps.",
                parts = new[] { "Stock suspension", "Fresh bushings", "Stronger shocks", "Uprated springs", "Anti-roll bars", "Strut braces", "Adjustable dampers", "Rally suspension", "Long-travel arms", "Remote-reservoir shocks", "Heavy-duty suspension", "Coilovers", "Bump stops", "Race geometry", "Works suspension", "Trophy suspension", "Prototype suspension", "Ultimate suspension", "Beyond spec", "Beyond spec II", "Beyond spec III", "Beyond spec IV" } },
            new UpgradeCategory { id = "armor", name = "ARMOUR", focus = "front", desc = "Durability and protection. Heavy: blunts acceleration and adds drag.",
                parts = new[] { "None", "Reinforced bumper", "Skid plate", "Sill guards", "Bull bar", "Seam welding", "Half roll cage", "Reinforced doors", "Full roll cage", "Rock sliders", "Window nets", "Armoured sump", "Steel side plates", "Ram bumper", "Mesh windows", "Armoured shell", "Works armour", "Prototype armour", "Ultimate armour", "Beyond spec", "Beyond spec II", "Beyond spec III" } },
            new UpgradeCategory { id = "fuel", name = "FUEL TANK", focus = "rear", desc = "More litres, more range. Every litre also weighs something.",
                parts = new[] { "Stock tank", "Baffled tank", "Long-range tank", "Auxiliary tank", "Roof jerry can", "Bladder cell", "Twin jerry cans", "Extended cell", "Underfloor tank", "Expedition tank", "Four jerry cans", "Long-haul cell", "Works tank", "Endurance cell", "Prototype tank", "Ultimate tank", "Beyond spec", "Beyond spec II", "Beyond spec III", "Beyond spec IV", "Beyond spec V", "Beyond spec VI" } },
            new UpgradeCategory { id = "cooling", name = "COOLING", focus = "front", desc = "Keeps the engine out of the red under load and turbo. Overheating damages the engine.",
                parts = new[] { "Stock radiator", "Fresh coolant", "Electric fan", "Aluminium radiator", "Oil cooler", "Hood vents", "Twin fans", "Big radiator", "Intercooler spray", "Race radiator", "Dual oil coolers", "Ducted nose", "Works cooling", "Prototype cooling", "Ultimate cooling", "Beyond spec", "Beyond spec II", "Beyond spec III", "Beyond spec IV", "Beyond spec V", "Beyond spec VI", "Beyond spec VII" } },
            new UpgradeCategory { id = "turbo", name = "TURBO", focus = "engine", desc = "Forced induction: big power once it spools, and SHIFT overboost. Adds lag and heat.",
                parts = new[] { "None", "Small turbo", "Wastegate", "Front-mount intercooler", "Bigger turbine", "Blow-off valve", "Boost controller", "Ball-bearing turbo", "Anti-lag", "Twin-scroll turbo", "Big intercooler", "Race turbo", "Twin turbos", "Works turbo", "Prototype turbo", "Ultimate turbo", "Beyond spec", "Beyond spec II", "Beyond spec III", "Beyond spec IV", "Beyond spec V", "Beyond spec VI" } },
            new UpgradeCategory { id = "weight", name = "WEIGHT", focus = "cabin", desc = "Strip it out. Less mass means better everything, but a lighter shell is a weaker shell.",
                parts = new[] { "Stock", "Spare wheel removed", "Rear seats removed", "Sound deadening removed", "Lightweight battery", "Plastic windows", "Bucket seats", "Aluminium doors", "Carbon hood", "Stripped interior", "Carbon trunk lid", "Lightweight wiring", "Carbon roof", "Titanium exhaust", "Magnesium wheels", "Carbon doors", "Works diet", "Prototype diet", "Ultimate diet", "Beyond spec", "Beyond spec II", "Beyond spec III" } },

        };

        public static UpgradeCategory CatById(string id) => CATEGORIES.FirstOrDefault(c => c.id == id);

        // Price multipliers per category.
        static readonly Dictionary<string, double> CAT_MULT = new Dictionary<string, double> { ["engine"] = 1.25, ["transmission"] = 1.1, ["torque"] = 1.0, ["tires"] = 0.9, ["brakes"] = 0.85, ["suspension"] = 1.0, ["armor"] = 1.0, ["fuel"] = 0.7, ["cooling"] = 0.75, ["turbo"] = 1.6, ["weight"] = 1.15 };

        // Cost to go from `level` to `level + 1`. Early levels are cheap, late levels steep.
        public static double UpgradeCost(CarDef car, string cat, int level, int garageLevel = 1)
        {
            double l = level;
            double f = 1 + 0.55 * l + 0.08 * Math.Pow(l, 2.4);
            double disc = garageLevel >= 3 ? 0.92 : 1; // professional garage: trade discount
            double raw = car.upBase * CAT_MULT[cat] * f * disc;
            double step = raw < 1000 ? 10 : raw < 10000 ? 50 : raw < 100000 ? 250 : 1000;
            return JsRound(raw / step) * step;
        }

        // JS Math.round: halves go up.
        internal static double JsRound(double v) => Math.Floor(v + 0.5);

        public static readonly TireDef[] TIRES =
        {
            new TireDef { id = "worn", name = "WORN STREET", unlock = 0, grip = new[] { 0.86, 0.78, 0.62, 0.55 }, roll = 1, desc = "Bald and hard. Better than nothing." },
            new TireDef { id = "street", name = "STREET", unlock = 1, grip = new[] { 1, 0.86, 0.66, 0.62 }, roll = 1, desc = "Honest all-round road tyre." },
            new TireDef { id = "perf", name = "PERFORMANCE", unlock = 4, grip = new[] { 1.16, 0.8, 0.55, 0.44 }, roll = 1, desc = "+ Asphalt grip. − Snow and mud." },
            new TireDef { id = "at", name = "ALL-TERRAIN", unlock = 6, grip = new[] { 0.95, 1.04, 0.9, 0.8 }, roll = 1.12, desc = "Balanced on mixed surfaces. Slight rolling drag." },
            new TireDef { id = "offroad", name = "OFF-ROAD", unlock = 9, grip = new[] { 0.83, 1.18, 1.25, 0.86 }, roll = 1.32, desc = "+ Dirt and mud grip. − Asphalt grip and top speed." },
            new TireDef { id = "snow", name = "SNOW", unlock = 12, grip = new[] { 0.9, 0.94, 0.86, 1.38 }, roll = 1.12, desc = "+ Snow and ice. − Slightly soft on tarmac." },
            new TireDef { id = "race", name = "RACE", unlock = 15, grip = new[] { 1.26, 0.74, 0.5, 0.38 }, roll = 0.95, desc = "+ Huge asphalt grip. − Useless when loose or cold." },

        };
        public static TireDef TireById(string id) => TIRES.FirstOrDefault(t => t.id == id) ?? TIRES[0];

        public static readonly GarageLevel[] GARAGE_LEVELS =
        {
            new GarageLevel { level = 1, name = "OLD SHED", cost = 0, perks = new[] { "Basic paints" } },
            new GarageLevel { level = 2, name = "CLEAN WORKSHOP", cost = 6000, perks = new[] { "Metallic paints", "Repair kits restore +25%", "+5% run earnings" } },
            new GarageLevel { level = 3, name = "PROFESSIONAL GARAGE", cost = 45000, perks = new[] { "Matte paints", "8% trade discount on upgrades", "Rare vehicle offers (−15%)", "+10% run earnings" } },
            new GarageLevel { level = 4, name = "PERFORMANCE WORKSHOP", cost = 220000, perks = new[] { "Pearl paints & liveries", "Advanced tuning: +2 levels per category", "+15% run earnings" } },
            new GarageLevel { level = 5, name = "RACING FACILITY", cost = 1100000, perks = new[] { "Chrome & candy paints", "Advanced tuning: +4 levels per category", "+25% run earnings" } },

        };
        static readonly double[] EARN = { 1, 1, 1.05, 1.1, 1.15, 1.25 };
        public static double GarageEarnMult(int lvl) => lvl >= 0 && lvl < EARN.Length ? EARN[lvl] : 1;
        public static int GarageCapBonus(int lvl) => lvl >= 5 ? 4 : lvl >= 4 ? 2 : 0;
        public static double CarDiscount(int lvl) => lvl >= 3 ? 0.85 : 1;
        public static double RepairBonus(int lvl) => lvl >= 2 ? 1.25 : 1;

        // Paints: finish affects the material (roughness / metalness / clearcoat).
        public static readonly Dictionary<string, PaintFinish> FINISHES = new Dictionary<string, PaintFinish>
        {
            ["solid"] = new PaintFinish { rough = 0.42, metal = 0.05, clear = 0.6, sheen = 0, level = 1 },
            ["metallic"] = new PaintFinish { rough = 0.3, metal = 0.55, clear = 1, sheen = 0, level = 2 },
            ["matte"] = new PaintFinish { rough = 0.78, metal = 0.2, clear = 0, sheen = 0, level = 3 },
            ["pearl"] = new PaintFinish { rough = 0.25, metal = 0.35, clear = 1, sheen = 1, level = 4 },
            ["chrome"] = new PaintFinish { rough = 0.08, metal = 1, clear = 1, sheen = 0, level = 5 },
            ["candy"] = new PaintFinish { rough = 0.15, metal = 0.7, clear = 1, sheen = 0, level = 5 },

        };
        public static readonly PaintDef[] PAINTS =
        {
            new PaintDef { id = "factory", name = "FACTORY", color = null, finish = "solid", cost = 0 },
            new PaintDef { id = "chalk", name = "CHALK WHITE", color = 0xd9d6cc, finish = "solid", cost = 300 },
            new PaintDef { id = "signal", name = "SIGNAL RED", color = 0xa3261d, finish = "solid", cost = 300 },
            new PaintDef { id = "moss", name = "MOSS GREEN", color = 0x46553a, finish = "solid", cost = 300 },
            new PaintDef { id = "navy", name = "POLICE NAVY", color = 0x1f2b44, finish = "solid", cost = 300 },
            new PaintDef { id = "mustard", name = "MUSTARD", color = 0xc49a2c, finish = "solid", cost = 300 },
            new PaintDef { id = "black", name = "GLOSS BLACK", color = 0x121314, finish = "solid", cost = 500 },
            new PaintDef { id = "gunmetal", name = "GUNMETAL", color = 0x4a4f55, finish = "metallic", cost = 1500 },
            new PaintDef { id = "glacier", name = "GLACIER BLUE", color = 0x6e9ac0, finish = "metallic", cost = 1500 },
            new PaintDef { id = "copper", name = "COPPER", color = 0x9a5a34, finish = "metallic", cost = 1800 },
            new PaintDef { id = "racing", name = "RACING GREEN", color = 0x173d2a, finish = "metallic", cost = 1800 },
            new PaintDef { id = "mattegrey", name = "MATTE SLATE", color = 0x3b3e42, finish = "matte", cost = 4000 },
            new PaintDef { id = "mattesand", name = "MATTE SAND", color = 0xa69878, finish = "matte", cost = 4000 },
            new PaintDef { id = "matteolive", name = "MATTE OLIVE", color = 0x4d5137, finish = "matte", cost = 4000 },
            new PaintDef { id = "pearlwhite", name = "PEARL WHITE", color = 0xe9e6e0, finish = "pearl", cost = 12000 },
            new PaintDef { id = "pearlviolet", name = "MIDNIGHT PEARL", color = 0x2e2547, finish = "pearl", cost = 12000 },
            new PaintDef { id = "candyred", name = "CANDY RED", color = 0x8a0c12, finish = "candy", cost = 40000 },
            new PaintDef { id = "chrome", name = "MIRROR CHROME", color = 0xc8ccd0, finish = "chrome", cost = 75000 },
        };
    }
}

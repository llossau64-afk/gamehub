// Achievement definitions. `check(save, run)` is evaluated after each run and on
// purchases; `run` may be null outside of runs.
using System;
using System.Collections.Generic;

namespace Downfall
{
    // What the checks read from the save. Implement it explicitly on the save class
    // (`IList<string> IAchSave.completed => completed;` ...) so the field names can stay.
    public interface IAchSave
    {
        IList<string> completed { get; }
        IList<string> owned { get; }
        int garageLevel { get; }
        double totalEarned { get; }
        double statUpgrades { get; }   // save.stats.upgrades
        double statTopSpeed { get; }   // save.stats.topSpeed
        double statShortcuts { get; }  // save.stats.shortcuts
    }

    // The `runInfo` object a run hands to the checks.
    public sealed class RunInfo
    {
        public double distance;
        public string mountain;
        public double criticalDistance;
        public bool fumes;
        public double maxAir, maxDrift;
        public bool recoveredRoll;
    }

    public sealed class Achievement
    {
        public string id, name, desc;
        public int reward;
        public Func<IAchSave, RunInfo, bool> check;
    }

    public static class Achievements
    {
        public static readonly Achievement[] ACHIEVEMENTS =
        {
            new Achievement { id = "first_run", name = "FIRST RUN", desc = "Travel 1 km in a single run.", reward = 250, check = (s, r) => r != null && r.distance >= 1000 },
            new Achievement { id = "survivor", name = "SURVIVOR", desc = "Travel 5 km in a single run.", reward = 1500, check = (s, r) => r != null && r.distance >= 5000 },
            new Achievement { id = "snowline", name = "ABOVE THE CLOUDS", desc = "Reach the Snow Line (6 km).", reward = 3000, check = (s, r) => r != null && r.mountain == "m1" && r.distance >= 6000 },
            new Achievement { id = "deep", name = "DEEP DESCENT", desc = "Travel 10 km in a single run.", reward = 8000, check = (s, r) => r != null && r.distance >= 10000 },
            new Achievement { id = "cliffs", name = "EDGE OF THE WORLD", desc = "Reach The Cliffs (15 km).", reward = 20000, check = (s, r) => r != null && r.mountain == "m1" && r.distance >= 15000 },
            new Achievement { id = "lower", name = "ALMOST THERE", desc = "Reach The Lower Pass (20 km).", reward = 40000, check = (s, r) => r != null && r.mountain == "m1" && r.distance >= 20000 },
            new Achievement { id = "conquered", name = "MOUNTAIN CONQUERED", desc = "Reach the bottom of Hollow Peak.", reward = 100000, check = (s, r) => s.completed.Contains("m1") },
            new Achievement { id = "canyon", name = "CANYON RUNNER", desc = "Reach the floor of The Canyon.", reward = 250000, check = (s, r) => s.completed.Contains("m2") },
            new Achievement { id = "mechanic", name = "MECHANIC", desc = "Buy 10 upgrades.", reward = 500, check = (s, r) => s.statUpgrades >= 10 },
            new Achievement { id = "master_mech", name = "MASTER MECHANIC", desc = "Buy 100 upgrades.", reward = 15000, check = (s, r) => s.statUpgrades >= 100 },
            new Achievement { id = "speed_demon", name = "SPEED DEMON", desc = "Reach 200 km/h.", reward = 5000, check = (s, r) => s.statTopSpeed >= 200 },
            new Achievement { id = "broken", name = "BROKEN BUT MOVING", desc = "Drive 500 m with critical engine damage.", reward = 2000, check = (s, r) => r != null && r.criticalDistance >= 500 },
            new Achievement { id = "fumes", name = "RUNNING ON FUMES", desc = "Grab a fuel can with less than 1 litre left.", reward = 1500, check = (s, r) => r != null && r.fumes },
            new Achievement { id = "flyer", name = "HIGH FLYER", desc = "Stay airborne for 2 seconds.", reward = 2500, check = (s, r) => r != null && r.maxAir >= 2 },
            new Achievement { id = "sideways", name = "SIDEWAYS", desc = "Hold a drift for 4 seconds.", reward = 2000, check = (s, r) => r != null && r.maxDrift >= 4 },
            new Achievement { id = "shortcuts", name = "LOCAL KNOWLEDGE", desc = "Take 10 shortcuts.", reward = 4000, check = (s, r) => s.statShortcuts >= 10 },
            new Achievement { id = "rollover", name = "SHINY SIDE UP", desc = "Roll the car and keep driving.", reward = 1500, check = (s, r) => r != null && r.recoveredRoll },
            new Achievement { id = "collector", name = "COLLECTOR", desc = "Own 10 vehicles.", reward = 50000, check = (s, r) => s.owned.Count >= 10 },
            new Achievement { id = "facility", name = "RACING FACILITY", desc = "Upgrade the garage to level 5.", reward = 50000, check = (s, r) => s.garageLevel >= 5 },
            new Achievement { id = "millionaire", name = "MILLIONAIRE", desc = "Earn $1,000,000 in total.", reward = 25000, check = (s, r) => s.totalEarned >= 1000000 },
        };
    }
}

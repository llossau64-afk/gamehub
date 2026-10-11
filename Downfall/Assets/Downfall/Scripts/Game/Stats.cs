// Turns a car + its upgrade levels into (a) the numbers shown in the garage and
// (b) the parameters the physics actually uses. The displayed top speed and 0-100
// time are *computed* from the same engine/gearing/drag model the car drives with.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Downfall
{
    // computeStats().phys.engine
    public sealed class EngineSpec
    {
        public double idle, redline, rpmP, rpmT, tpk, tAtP;
        public double turbo, factoryTurbo, lag, boostCap;
        public EngineSpec Clone() => (EngineSpec)MemberwiseClone();
    }

    // computeStats().phys: everything the vehicle simulation reads.
    public sealed class Phys
    {
        public double mass, cda, crr, mu;
        public TireDef tire;
        public EngineSpec engine;
        public double[] ratios;
        public double shiftTime, finalTop;
        public string drive;
        public double r, wb, track, cg, weightFront, steer, stability;
        public double freq, zeta, travel, arb, landing;
        public double brakeDecel, brakeFade, hpPool, dmgMult;
        public double fuel, fuelUse, heat, cooling;
        public double offroad, rearGrip, ground, downforce, boostCap;
        public int armorLevel, susLevel;
        public bool abs, tcs;
        // shallow copy, like `{ ...v.p, fuelUse: 0 }`
        public Phys Clone() => (Phys)MemberwiseClone();
    }

    // computeStats() result
    public sealed class CarStats
    {
        public double top, hp, nm;
        public double? t100; // null when the car can't reach 100 km/h
        public double grip, brakes, susp, dur, fuel, kg;
        public int gears;
        public string drive;
        public string tire; // tyre name
        public bool turbo;
        public Phys phys;
    }

    public static class Stats
    {
        public const double G = 9.81;
        const double RHO = 1.2;
        const double ETA = 0.86; // drivetrain efficiency
        const double CRR = 0.012;

        static readonly Dictionary<string, double> BODY_CDA = new Dictionary<string, double> { ["hatch"] = 0.66, ["wagon"] = 0.74, ["pickup"] = 0.95, ["sedan"] = 0.7, ["coupe"] = 0.62, ["suv"] = 0.98, ["muscle"] = 0.76, ["sports"] = 0.6, ["baja"] = 1.1, ["beast"] = 1.35, ["super"] = 0.6, ["monster"] = 1.9, ["hyper"] = 0.62, ["wedge"] = 0.56, ["berlinetta"] = 0.55, ["longtail"] = 0.5, ["gt"] = 0.6, ["rear"] = 0.58 };

        public static int CapOf(CarDef car, string cat, int garageLevel = 1) => car.caps[cat] + Upgrades.GarageCapBonus(garageLevel);
        static double Frac(CarDef car, Dictionary<string, int> levels, string cat)
        {
            levels.TryGetValue(cat, out int l);
            return Math.Max(0, l) / (double)car.caps[cat];
        }

        public static Dictionary<string, int> DefaultLevels() => new Dictionary<string, int>
        {
            ["engine"] = 0, ["transmission"] = 0, ["torque"] = 0, ["tires"] = 0, ["brakes"] = 0, ["suspension"] = 0,
            ["armor"] = 0, ["fuel"] = 0, ["cooling"] = 0, ["turbo"] = 0, ["weight"] = 0,
        };
        public static Dictionary<string, int> MaxLevels(CarDef car, int garageLevel = 1) => car.caps.Keys.ToDictionary(k => k, k => CapOf(car, k, garageLevel));

        public static TireDef[] UnlockedTires(int level) => Upgrades.TIRES.Where(t => level >= t.unlock).ToArray();

        // Engine torque at a given rpm (Nm, without boost). `e` comes from ComputeStats().phys.engine
        public static double EngineTorque(EngineSpec e, double rpm)
        {
            double r = U.Clamp(rpm, e.idle, e.redline * 1.1);
            if (r < e.rpmT)
            {
                double t = (r - e.idle) / (e.rpmT - e.idle);
                return e.tpk * (0.58 + 0.42 * t * (2 - t));
            }
            if (r < e.rpmP) return U.Lerp(e.tpk, e.tAtP, (r - e.rpmT) / (e.rpmP - e.rpmT));
            return U.Lerp(e.tAtP, e.tAtP * 0.8, (r - e.rpmP) / (e.redline - e.rpmP));
        }
        // Boost target for a given rpm and throttle (0..1)
        public static double BoostTarget(EngineSpec e, double rpm, double throttle) => e.turbo > 0 ? throttle * U.Smoothstep(e.redline * 0.3, e.redline * 0.55, rpm) : 0;

        public static CarStats ComputeStats(CarDef car, Dictionary<string, int> levels, string tireId = "worn", int garageLevel = 1)
        {
            var L = DefaultLevels();
            if (levels != null) foreach (var kv in levels) L[kv.Key] = kv.Value;
            var b = car.@base; var p = car.pot; var ph = car.phys;
            double f(string cat) => Frac(car, L, cat);

            // --- engine
            double hpNA = b.hp + p.hp * f("engine");
            double turboHp = L["turbo"] > 0 ? p.turbo * (0.25 + 0.75 * f("turbo")) : 0;
            double nmNA = b.nm + p.nm * f("torque") + p.hp * f("engine") * 0.35;
            double turboFrac = turboHp / hpNA;
            double factoryTurbo = car.sound.turbo != 0 ? 1 : 0;

            double redline = ph.redline * (1 + 0.06 * f("engine"));
            double pmax = hpNA * 745.7;
            double rpmP = redline * 0.86;
            double rpmNeeded = (pmax / (nmNA * 0.97)) * 60 / (2 * Math.PI);
            if (rpmNeeded > rpmP) { rpmP = rpmNeeded; redline = Math.Max(redline, rpmP / 0.86); }
            double rpmT = Math.Min(rpmP * 0.82, (car.sound.tone == "diesel" ? 0.42 : 0.58) * redline);
            var engine = new EngineSpec
            {
                idle = Math.Min(950, redline * 0.16), redline = redline, rpmP = rpmP, rpmT = rpmT, tpk = nmNA,
                tAtP = pmax / (rpmP * 2 * Math.PI / 60),
                turbo = turboFrac, factoryTurbo = factoryTurbo,
                lag = L["turbo"] > 0 ? U.Lerp(1.1, 0.35, f("turbo")) : 1,
                boostCap = L["turbo"] > 0 ? 2.2 + 3.8 * f("turbo") : 0,
            };

            // --- mass
            double extraFuel = p.fuel * f("fuel");
            double kg = b.kg
                + 1.4 * L["engine"] + 1.0 * L["torque"] + 1.6 * L["suspension"] + 0.9 * L["cooling"] + 2.2 * L["turbo"]
                + b.kg * 0.11 * f("armor")
                + extraFuel * 0.95
                - p.kg * f("weight");

            // --- chassis
            double dur = U.Clamp(b.dur + p.dur * f("armor") - 3 * f("weight"), 1, 100);
            double grip = U.Clamp(b.grip + p.grip * f("tires"), 1, 100);
            double brakes = U.Clamp(b.brakes + p.brakes * f("brakes"), 1, 100);
            double susp = U.Clamp(b.susp + p.susp * f("suspension"), 1, 100);
            double fuel = b.fuel + extraFuel;

            var tire = Upgrades.TireById(tireId);
            double mu = 0.62 + (grip / 100) * 0.62;
            double cooling = 1 + 1.6 * f("cooling");

            // --- transmission: gear-limited top speed and ratios
            double gearTop = (b.top + p.top * f("transmission") + b.top * 0.03 * f("engine")) / 3.6;
            int nGears = ph.gears + (L["transmission"] >= 5 ? 1 : 0) + (L["transmission"] >= 12 ? 1 : 0);
            double r = ph.r;
            double wRed = redline * 2 * Math.PI / 60;
            double gTop = (wRed * r) / gearTop;
            double spread = U.Lerp(3.0, 4.6, (nGears - 4) / 3.0);
            double g1 = gTop * spread;
            var ratios = new double[nGears];
            for (int i = 0; i < nGears; i++) ratios[i] = g1 * Math.Pow(gTop / g1, (double)i / (nGears - 1));
            double shiftTime = U.Lerp(0.42, 0.1, f("transmission"));

            // --- aero: stock car is gear limited; drag is calibrated so stock drag-limited speed is ~6% above
            double cdaBody = BODY_CDA.TryGetValue(car.model.type, out var cb) ? cb : 0.75;
            double stockCda = CalibrateCda(car);
            double cda = Math.Min(cdaBody, stockCda) * (1 + 0.1 * f("armor") + 0.03 * f("fuel"));
            double crr = CRR * tire.roll;

            var phys = new Phys
            {
                mass = kg, cda = cda, crr = crr, mu = mu, tire = tire, engine = engine, ratios = ratios, shiftTime = shiftTime, finalTop = gTop,
                drive = car.drive, r = r, wb = ph.wb, track = ph.track, cg = ph.cg + car.model.lift * 0.5,
                weightFront = ph.weightFront, steer = (ph.steer * Math.PI) / 180, stability = ph.stability,
                freq = ph.freq * (0.92 + 0.2 * (susp / 100)), zeta = 0.24 + (susp / 100) * 0.36,
                travel = (ph.travel != 0 ? ph.travel : 0.17 + ph.ground * 0.35) * (0.82 + 0.36 * (susp / 100)),
                arb = (0.25 + (susp / 100) * 0.6) * ph.stability,
                landing = 3.2 + (susp / 100) * 6.5,
                brakeDecel = (0.35 + (brakes / 100) * 0.95) * G, brakeFade = 0.5 + brakes / 100,
                hpPool = 100 * (0.55 + dur / 100), dmgMult = 1 / (0.4 + (dur / 100) * 1.25),
                fuel = fuel, fuelUse = ph.fuelUse * (1 + 0.004 * L["engine"] + 0.006 * L["torque"] + 0.01 * L["turbo"]),
                heat = 1 + 0.02 * L["engine"] + 0.035 * L["turbo"], cooling = cooling,
                offroad = ph.offroad != 0 ? ph.offroad : 1, rearGrip = ph.rearGrip != 0 ? ph.rearGrip : 1, ground = ph.ground,
                downforce = ph.downforce, boostCap = engine.boostCap,
                armorLevel = L["armor"], susLevel = L["suspension"], abs = L["brakes"] >= 6, tcs = car.exotic || car.model.sport != 0,
            };

            double top = TopSpeed(phys);
            double? t100 = ZeroTo100(phys);
            return new CarStats
            {
                top = top * 3.6, hp = hpNA + turboHp, nm = nmNA * (1 + turboFrac * 0.85), t100 = t100,
                grip = grip, brakes = brakes, susp = susp, dur = dur, fuel = fuel, kg = kg, gears = nGears, drive = car.drive, tire = tire.name,
                turbo = L["turbo"] > 0, phys = phys,
            };
        }

        // Highest flat-ground speed: limited by gearing (rev limiter) or by drag.
        public static double TopSpeed(Phys ph)
        {
            var e = ph.engine;
            double gTop = ph.ratios[ph.ratios.Length - 1];
            double vGear = (e.redline * 2 * Math.PI / 60) * ph.r / gTop;
            double vmax = 0;
            foreach (double g in ph.ratios)
            {
                for (double v = 5; v <= vGear * (gTop / g) + 0.01 && v <= vGear; v += 0.25)
                {
                    double rpm = (v / ph.r) * g * 60 / (2 * Math.PI);
                    if (rpm > e.redline) break;
                    double T = EngineTorque(e, rpm) * (1 + e.turbo * BoostTarget(e, rpm, 1));
                    double F = (T * g * ETA) / ph.r - ph.crr * (ph.mass * G + ph.downforce * 0.72 * v * v) - 0.5 * RHO * ph.cda * v * v;
                    if (F > 0) vmax = Math.Max(vmax, v);
                }
            }
            return vmax;
        }

        // Numerical 0-100 km/h using the drivetrain, traction limit, drag and shift time.
        public static double? ZeroTo100(Phys ph)
        {
            var e = ph.engine;
            double v = 0, t = 0, shiftT = 0, boost = 0;
            int gear = 0;
            const double target = 100 / 3.6;
            double driven = ph.drive == "AWD" || ph.drive == "4WD" ? 1 : ph.drive == "FWD" ? ph.weightFront - 0.06 : 1 - ph.weightFront + 0.07;
            double muRoad = ph.mu * ph.tire.grip[0];
            const double dt = 0.005;
            while (v < target && t < 60)
            {
                double g = ph.ratios[gear];
                double rpm = (v / ph.r) * g * 60 / (2 * Math.PI);
                rpm = Math.Max(rpm, Math.Min(e.rpmT * 1.05, e.redline * 0.55));
                boost += (BoostTarget(e, rpm, 1) - boost) * Math.Min(1, dt / e.lag);
                double F = shiftT > 0 ? 0 : (EngineTorque(e, rpm) * (1 + e.turbo * boost) * g * ETA) / ph.r;
                F = Math.Min(F, muRoad * ph.mass * G * driven);
                F -= ph.crr * ph.mass * G + 0.5 * RHO * ph.cda * v * v;
                v += (F / (ph.mass * 1.06)) * dt;
                t += dt;
                if (shiftT > 0) shiftT -= dt;
                double rpmNow = (v / ph.r) * g * 60 / (2 * Math.PI);
                if (rpmNow > e.redline * 0.97 && gear < ph.ratios.Length - 1) { gear++; shiftT = ph.shiftTime; }
                if (v < 0.01 && t > 5) return null;
            }
            return v >= target ? t : (double?)null;
        }

        static readonly Dictionary<string, double> _cdaCache = new Dictionary<string, double>();
        static double CalibrateCda(CarDef car)
        {
            if (_cdaCache.TryGetValue(car.id, out double cached)) return cached;
            var b = car.@base; var ph = car.phys;
            // stock engine model (same maths as above with zero levels)
            double redline = ph.redline;
            double pmax = b.hp * 745.7;
            double rpmP = redline * 0.86;
            double rpmNeeded = (pmax / (b.nm * 0.97)) * 60 / (2 * Math.PI);
            if (rpmNeeded > rpmP) { rpmP = rpmNeeded; redline = Math.Max(redline, rpmP / 0.86); }
            double rpmT = Math.Min(rpmP * 0.82, (car.sound.tone == "diesel" ? 0.42 : 0.58) * redline);
            var e = new EngineSpec { idle = 900, redline = redline, rpmP = rpmP, rpmT = rpmT, tpk = b.nm, tAtP = pmax / (rpmP * 2 * Math.PI / 60), turbo = 0 };
            double v = (b.top * 1.06) / 3.6;
            // best force available at v across a plausible top gear (rpm at ~90% of redline)
            double rpm = redline * 0.9;
            double g = (rpm * 2 * Math.PI / 60) * ph.r / v;
            double F = (EngineTorque(e, rpm) * g * ETA) / ph.r - CRR * b.kg * G;
            double cda = U.Clamp(F / (0.5 * RHO * v * v), 0.35, 3.0);
            _cdaCache[car.id] = cda;
            return cda;
        }

        // Stats with every category maxed (for the showroom "MAX POTENTIAL" column).
        public static CarStats MaxStats(CarDef car, int garageLevel = 1)
        {
            var lv = new Dictionary<string, int>();
            foreach (var k in car.caps.Keys) lv[k] = car.caps[k] + Upgrades.GarageCapBonus(garageLevel);
            return ComputeStats(car, lv, "street", garageLevel);
        }
    }
}

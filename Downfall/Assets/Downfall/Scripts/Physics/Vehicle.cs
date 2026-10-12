// Semi-realistic vehicle simulation: one rigid body, four raycast suspension corners,
// a load-sensitive tyre model with a friction circle, an automatic gearbox driven by
// a real torque curve, turbo spool, brake fade, engine heat, fuel burn and a damage
// model that feeds back into the handling. Pure math (doubles, JS coordinates), no Unity.
using System;
using System.Collections.Generic;

namespace Downfall
{
    public sealed class VehicleInput
    {
        public double throttle, brake, steer, handbrake, boost;
        public void Clear() { throttle = brake = steer = handbrake = boost = 0; }
    }

    // One entry of `vehicle.events`. Only the fields of its `type` are meaningful.
    public sealed class VehicleEvent
    {
        public string type;   // shift stall blowoff nitro nitroEnd misfire land railbreak smash bump impact glass damage engineCritical engineDead bottom
        public bool? up;      // shift: true/false for auto shifts, null for reverse engage
        public double amount; // blowoff (boost), damage (fraction of the hp pool)
        public double air;    // land
        public double x, y, z, nx, ny, nz, speed, vx, vy, vz;
        public double lx, ly, lz; // impact / damage: local hit point
        public int idx, side;     // railbreak
        public string kind;       // impact: ground rail wall object light
        public string zone;       // damage: front rear left right roof susp
        public string why;        // engineDead: heat impact landing
        public int level;         // glass
        public int wheel;         // bottom
        public WorldCollider o;        // smash
    }

    public sealed class Wheel
    {
        public int i;
        public bool front, left;
        public double mc, k, c, rest, sag, mx, mz, my;
        public double comp, compPrev;
        public bool contact;
        public double load;
        public int surf;
        public double spin, angle, steer, slip, slipLat, spinning;
        public int locked;
        public double gx, gy, gz, nx, ny = 1, nz, vLong, health = 1, toe, roughPhase;
        public double s, d;
        public bool bottomed;
    }

    public sealed class VehicleDamage
    {
        public double engine = 1, susp = 1, brakes = 1, glass, lightL = 1, lightR = 1, bumperF = 1, bumperR = 1;
        public double front = 1, rear = 1, left = 1, right = 1, roof = 1;
        public double this[string zone]
        {
            get => zone switch { "front" => front, "rear" => rear, "left" => left, "right" => right, "roof" => roof, "engine" => engine, "susp" => susp, "brakes" => brakes, _ => 0 };
            set { switch (zone) { case "front": front = value; break; case "rear": rear = value; break; case "left": left = value; break; case "right": right = value; break; case "roof": roof = value; break; case "engine": engine = value; break; case "susp": susp = value; break; case "brakes": brakes = value; break; } }
        }
    }

    public sealed class Vehicle
    {
        public sealed class Vec3 { public double x, y, z; public Vec3() { } public Vec3(double x, double y, double z) { this.x = x; this.y = y; this.z = z; } }
        public sealed class Quat { public double x, y, z, w = 1; }

        const double DT = 1.0 / 120;
        public const double NITRO_TIME = 4, NITRO_RECHARGE = 20;
        const double RHO = 1.2;
        const double ETA = 0.86;
        const double G = Stats.G;
        static readonly string[] ZONES = { "front", "rear", "left", "right", "roof" };

        // Math.random() of the web build: one shared stream for every car (and the bot AI).
        public static Rng Rand = new Rng(Environment.TickCount);

        // ---- tiny vector / quaternion helpers (allocation free in the hot path)
        static Vec3 Qrot(Quat q, double x, double y, double z, Vec3 o)
        {
            // o = q * v * q^-1
            double ix = q.w * x + q.y * z - q.z * y;
            double iy = q.w * y + q.z * x - q.x * z;
            double iz = q.w * z + q.x * y - q.y * x;
            double iw = -q.x * x - q.y * y - q.z * z;
            o.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
            o.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
            o.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
            return o;
        }
        readonly Quat qc = new Quat();
        Vec3 Qinvrot(Quat q, double x, double y, double z, Vec3 o)
        {
            qc.x = -q.x; qc.y = -q.y; qc.z = -q.z; qc.w = q.w;
            return Qrot(qc, x, y, z, o);
        }
        public static Vec3 QrotS(Quat q, double x, double y, double z, Vec3 o) => Qrot(q, x, y, z, o);

        // V8's Math.hypot (normalised Kahan sum), so the numbers match the web build.
        static double Hypot(double a, double b, double c, double d = 0)
        {
            a = Math.Abs(a); b = Math.Abs(b); c = Math.Abs(c); d = Math.Abs(d);
            if (double.IsNaN(a) || double.IsNaN(b) || double.IsNaN(c) || double.IsNaN(d))
                return double.IsPositiveInfinity(a) || double.IsPositiveInfinity(b) || double.IsPositiveInfinity(c) || double.IsPositiveInfinity(d) ? double.PositiveInfinity : double.NaN;
            double max = Math.Max(Math.Max(a, b), Math.Max(c, d));
            if (double.IsPositiveInfinity(max)) return max;
            if (max == 0) return 0;
            double sum = 0, comp = 0;
            void Add(double v) { double n = v / max; double summand = n * n - comp; double pre = sum + summand; comp = (pre - sum) - summand; sum = pre; }
            Add(a); Add(b); Add(c); Add(d);
            return Math.Sqrt(sum) * max;
        }
        // JS Math.sign (0 stays 0, NaN stays NaN; never throws)
        static double Sign(double v) => v > 0 ? 1 : v < 0 ? -1 : v;
        // JS `v || 1`
        static double Or1(double v) => v != 0 && !double.IsNaN(v) ? v : 1;
        static double JsRound(double v) => Math.Floor(v + 0.5);

        readonly Vec3 T1 = new Vec3(), T2 = new Vec3(), T3 = new Vec3(), T4 = new Vec3(), T5 = new Vec3(), T6 = new Vec3(), T7 = new Vec3();

        public Track track;
        public CarDef car;
        public CarStats stats;
        public Phys p;
        public double vTop, m;
        public Vec3 half, I;
        public double yb, yt;
        public Wheel[] wheels;
        public int[] driven;
        public double[][] pts;

        public Vec3 pos = new Vec3(), vel = new Vec3(), angVel = new Vec3();
        public Quat q = new Quat();
        public VehicleInput input = new VehicleInput();
        public readonly List<VehicleEvent> events = new List<VehicleEvent>();
        public List<WorldCollider> dynamic = new List<WorldCollider>();
        public List<WorldCollider> animalCols, carCols;
        public double acc, alpha;
        public double assist = 1;
        public TrackQuery q0 = new TrackQuery(), q1 = new TrackQuery(), q2 = new TrackQuery();

        // state (set in Reset)
        public double rpm;
        public int gear, nextGear;
        public double shiftT, reverseT;
        public double boost, boostTank;
        public bool overboost;
        public double nitro, nitroT, prevBoost, prevThrottle;
        public double fuel, heat, brakeTemp;
        public bool engineOn, stalled;
        public double hp;
        public VehicleDamage dmg = new VehicleDamage();
        public double air, airTime, landCool, drift, groundY;
        public TrackQuery lastQuery = new TrackQuery();
        public double speed, fwdSpeed;
        public int wheelsOnGround;
        public double limiter, misfire, scrape, surfMix, totalSlip;

        public Vehicle(Track track, CarDef car, CarStats stats)
        {
            this.track = track;
            this.car = car;
            SetStats(stats);
        }

        public void SetStats(CarStats stats)
        {
            this.stats = stats;
            vTop = (stats.top != 0 ? stats.top : 150) / 3.6;
            var p = this.p = stats.phys;
            var md = car.model;
            m = p.mass;
            // body box for inertia + collision
            double L = md.len, W = md.wid, H = md.hgt;
            half = new Vec3(W / 2, 0, L / 2);
            double cg = p.cg;
            yb = -(cg - p.ground) + 0.02; // body bottom relative to CoM
            yt = H + md.lift - cg; // roof
            double ix = (m / 12) * (H * H + L * L) * 0.9;
            double iy = (m / 12) * (W * W + L * L) * 0.85;
            double iz = (m / 12) * (W * W + H * H) * 1.25;
            I = new Vec3(ix, iy, iz);
            // wheels
            double a = p.wb * (1 - p.weightFront), b = p.wb * p.weightFront;
            double tr = p.track / 2;
            double travel = p.travel;
            wheels = new Wheel[4];
            for (int i = 0; i < 4; i++)
            {
                bool front = i < 2, left = i % 2 == 0;
                double share = (front ? p.weightFront : 1 - p.weightFront) / 2;
                double mc = m * share;
                double w = 2 * Math.PI * p.freq * (front ? 1 : 1.06);
                double k = mc * w * w;
                double c = 2 * p.zeta * Math.Sqrt(k * mc);
                double sag = (mc * G) / k;
                wheels[i] = new Wheel
                {
                    i = i, front = front, left = left, mc = mc, k = k, c = c, rest = travel, sag = sag,
                    mx = left ? tr : -tr, mz = front ? a : -b,
                    my = -(cg - p.r) + travel - sag,
                    comp = sag, compPrev = sag, contact = false, load = 0, surf = SURF.ASPHALT,
                    spin = 0, angle = 0, steer = 0, slip = 0, slipLat = 0, spinning = 0, locked = 0,
                    gx = 0, gy = 0, gz = 0, nx = 0, ny = 1, nz = 0, vLong = 0, health = 1, toe = 0, roughPhase = Rand.Next() * 10,
                };
            }
            driven = p.drive == "FWD" ? new[] { 0, 1 } : p.drive == "RWD" ? new[] { 2, 3 } : new[] { 0, 1, 2, 3 };
            // collision sample points (local)
            double hx = half.x * 0.96, hz = half.z * 0.97, yb_ = yb, ym = yb + (yt - yb) * 0.42, yt_ = yt;
            pts = new[]
            {
                new[] { hx, yb_, hz }, new[] { -hx, yb_, hz }, new[] { hx, yb_, -hz }, new[] { -hx, yb_, -hz },
                new[] { hx, yb_, 0 }, new[] { -hx, yb_, 0 }, new[] { 0, yb_, 0 }, new[] { 0, yb_, hz * 0.55 }, new[] { 0, yb_, -hz * 0.55 },
                new[] { hx, ym, hz }, new[] { -hx, ym, hz }, new[] { 0, ym, hz * 1.02 }, new[] { hx * 0.5, ym, hz * 1.02 }, new[] { -hx * 0.5, ym, hz * 1.02 },
                new[] { hx, ym, -hz }, new[] { -hx, ym, -hz }, new[] { 0, ym, -hz * 1.02 },
                new[] { hx * 1.02, ym, hz * 0.4 }, new[] { -hx * 1.02, ym, hz * 0.4 }, new[] { hx * 1.02, ym, -hz * 0.4 }, new[] { -hx * 1.02, ym, -hz * 0.4 },
                new[] { hx * 0.8, yt_, hz * 0.3 }, new[] { -hx * 0.8, yt_, hz * 0.3 }, new[] { hx * 0.8, yt_, -hz * 0.35 }, new[] { -hx * 0.8, yt_, -hz * 0.35 },
            };
        }

        public void Reset(double s, double d = 0)
        {
            var t = track;
            var pos = t.PosAt(s, d);
            double hd = pos.hd;
            this.pos.x = pos.x; this.pos.z = pos.z;
            this.pos.y = pos.y + p.cg + 0.05;
            vel.x = vel.y = vel.z = 0;
            angVel.x = angVel.y = angVel.z = 0;
            // pitch to match the road grade
            double ahead = t.RoadY(s + 2) - t.RoadY(s - 2);
            double pitch = -Math.Atan2(ahead, 4);
            double cy = Math.Cos(hd / 2), sy = Math.Sin(hd / 2), cp = Math.Cos(pitch / 2), sp = Math.Sin(pitch / 2);
            // yaw (around Y) then pitch (around local X)
            q = new Quat { x = cy * sp, y = sy * cp, z = -sy * sp, w = cy * cp };
            foreach (var w in wheels) { w.comp = w.compPrev = w.sag; w.spin = 0; w.health = 1; w.toe = 0; }
            rpm = p.engine.idle; gear = 1; shiftT = 0; nextGear = 1; reverseT = 0;
            boost = 0; boostTank = p.boostCap; overboost = false;
            nitro = 1; nitroT = 0; prevBoost = 0;
            fuel = p.fuel; heat = 0.4; brakeTemp = 0;
            engineOn = true; stalled = false;
            hp = p.hpPool;
            dmg = new VehicleDamage(); // every zone starts at 1
            air = 0; airTime = 0; landCool = 0; drift = 0; groundY = pos.y;
            lastQuery = new TrackQuery { idx = (int)JsRound(s / Track.STEP), s = s, d = 0 };
            speed = 0; fwdSpeed = 0;
            wheelsOnGround = 4;
            limiter = 0;
            events.Clear();
            misfire = 0;
            scrape = 0;
            surfMix = 0;
            totalSlip = 0;
        }

        public bool destroyed => hp <= 0;
        public double engineHealth => dmg.engine;
        public double tireHealth => (wheels[0].health + wheels[1].health + wheels[2].health + wheels[3].health) / 4;

        public void Update(double dt)
        {
            acc += Math.Min(dt, 0.1);
            int n = 0;
            while (acc >= DT && n < 6) { Step(DT); acc -= DT; n++; }
            if (n == 6) acc = 0;
            alpha = acc / DT;
        }

        VehicleEvent Ev(string type) { var e = new VehicleEvent { type = type }; events.Add(e); return e; }

        public void Step(double dt)
        {
            var p = this.p; var t = track; double m = this.m; var q = this.q;
            var inp = input;
            double Fx = 0, Fy = -m * G, Fz = 0;
            double Tx = 0, Ty = 0, Tz = 0;
            void addF(double fx, double fy, double fz, double px_, double py_, double pz_)
            {
                Fx += fx; Fy += fy; Fz += fz;
                double rx_ = px_ - pos.x, ry_ = py_ - pos.y, rz_ = pz_ - pos.z;
                Tx += ry_ * fz - rz_ * fy; Ty += rz_ * fx - rx_ * fz; Tz += rx_ * fy - ry_ * fx;
            }
            var Uv = Qrot(q, 0, 1, 0, T1);
            double ux = Uv.x, uy = Uv.y, uz = Uv.z;
            var Fw = Qrot(q, 0, 0, 1, T2);
            double fwx = Fw.x, fwy = Fw.y, fwz = Fw.z;
            double vx = vel.x, vy = vel.y, vz = vel.z;
            double speed = Math.Sqrt(vx * vx + vy * vy + vz * vz);
            double fwdSpeed = vx * fwx + vy * fwy + vz * fwz;
            this.speed = speed; this.fwdSpeed = fwdSpeed;

            // ---------------------------------------------------------- driver inputs
            double throttle = inp.throttle, brake = inp.brake;
            if (gear == -1) { double tmp = throttle; throttle = brake; brake = tmp; }
            // reverse engage / disengage
            if (gear > 0 && fwdSpeed < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1)
            {
                reverseT += dt; if (reverseT > 0.3) { gear = -1; reverseT = 0; Ev("shift"); }
            }
            else if (gear == -1 && fwdSpeed > -0.8 && inp.throttle > 0.5 && inp.brake < 0.1)
            {
                reverseT += dt; if (reverseT > 0.15) { gear = 1; reverseT = 0; }
            }
            else reverseT = 0;

            double steerMax = p.steer / (1 + Math.Pow(Math.Max(0, fwdSpeed) / 26, 2) * 1.1);
            double steerTarget = inp.steer * steerMax;

            // ---------------------------------------------------------- engine
            var e = p.engine;
            var dmg = this.dmg;
            bool engineAlive = engineOn && dmg.engine > 0 && fuel > 0;
            if (!engineAlive && !stalled) { stalled = true; Ev("stall"); }
            // wheel based rpm
            double vDriven = 0; int nd = 0;
            foreach (int i in driven) { vDriven += wheels[i].vLong; nd++; }
            vDriven /= nd;
            double ratio = gear == -1 ? p.ratios[0] * 1.1 : p.ratios[Math.Max(0, gear - 1)];
            double wheelRpm = Math.Abs(vDriven) / p.r * ratio * 60 / (2 * Math.PI);
            double rpm = wheelRpm;
            double launch = Math.Min(e.rpmT * 1.05, e.redline * 0.55);
            if (rpm < launch && engineAlive) rpm = U.Lerp(Math.Max(e.idle, rpm), launch, throttle * (wheelsOnGround != 0 ? 1 : 0.4));
            if (wheelsOnGround == 0 && engineAlive) rpm = U.Lerp(this.rpm, e.idle + throttle * (e.redline - e.idle), 1 - Math.Exp(-dt * 6));
            rpm = Math.Max(rpm, engineAlive ? e.idle : 0);
            this.rpm = U.Lerp(this.rpm, rpm, 1 - Math.Exp(-dt * 22));

            // turbo
            if (e.turbo > 0 || e.factoryTurbo != 0)
            {
                double tgt = throttle * U.Smoothstep(e.redline * 0.3, e.redline * 0.55, this.rpm); // boostTarget with turbo forced on
                boost += (tgt - boost) * Math.Min(1, dt / (tgt > boost ? e.lag : 0.25));
                if (throttle < 0.2 && boost > 0.55 && prevThrottle > 0.6) Ev("blowoff").amount = boost;
            }
            prevThrottle = throttle;
            overboost = false;
            // nitro: press to fire 4 s of thrust (+40 % of top speed), then 20 s to recharge
            if (nitroT > 0)
            {
                nitroT = Math.Max(0, nitroT - dt);
                if (nitroT == 0) Ev("nitroEnd");
            }
            else
            {
                nitro = Math.Min(1, nitro + dt / NITRO_RECHARGE);
                if (inp.boost != 0 && prevBoost == 0 && nitro >= 1 && engineAlive && !destroyed)
                {
                    nitro = 0; nitroT = NITRO_TIME;
                    Ev("nitro");
                }
            }
            prevBoost = inp.boost;
            overboost = nitroT > 0;

            // engine torque
            double Te = 0;
            double engF = 0.25 + 0.75 * Math.Sqrt(Math.Max(0, dmg.engine));
            double redline = e.redline * (dmg.engine < 0.25 ? 0.72 : 1);
            if (engineAlive)
            {
                if (throttle > 0.01)
                {
                    Te = Stats.EngineTorque(e, this.rpm) * (1 + e.turbo * boost) * throttle * engF;
                    if (dmg.engine < 0.3) { misfire -= dt; if (misfire < 0) { misfire = 0.05 + Rand.Next() * 0.6; if (Rand.Next() < 0.45) { Te *= 0.2; Ev("misfire"); } } }
                }
                else Te = -(0.05 + 0.12 * this.rpm / e.redline) * e.tpk;
                if (this.rpm >= redline)
                {
                    Te = Math.Min(Te, 0); limiter = 0.08;
                }
            }
            else Te = -0.02 * e.tpk * (this.rpm / e.redline);
            // over-rev engine braking (descending in too high a gear)
            if (wheelRpm > redline && !(nitroT > 0)) Te -= e.tpk * Math.Min(2.2, (wheelRpm / redline - 1) * 9);
            if (nitroT > 0 && Te < 0) Te = 0; // the clutch slips: no engine braking while the nitro pushes
            if (limiter > 0) limiter -= dt;

            // gearbox
            if (shiftT > 0)
            {
                shiftT -= dt; Te = 0;
                if (shiftT <= 0) gear = nextGear;
            }
            else if (gear > 0 && wheelsOnGround != 0)
            {
                int n = p.ratios.Length;
                if (this.rpm > redline * 0.94 && gear < n && throttle > 0.2) { nextGear = gear + 1; shiftT = p.shiftTime; Ev("shift").up = true; }
                else if (gear > 1)
                {
                    double lower = p.ratios[gear - 2];
                    double rpmLower = Math.Abs(vDriven) / p.r * lower * 60 / (2 * Math.PI);
                    if (rpmLower < redline * (throttle > 0.5 ? 0.86 : 0.7) && this.rpm < redline * (brake > 0.3 ? 0.62 : 0.5))
                    {
                        nextGear = gear - 1; shiftT = Math.Min(0.15, p.shiftTime); Ev("shift").up = false;
                    }
                }
            }
            double wheelTorque = (Te * ratio * ETA) / nd * (gear == -1 ? -1 : 1);

            // fuel + heat
            if (engineAlive)
            {
                double pk = Math.Max(0, Te) * this.rpm * 2 * Math.PI / 60 / 1000;
                fuel = Math.Max(0, fuel - dt * p.fuelUse * (0.045 + 0.2 * throttle * Math.Sqrt(pk / 74.6)) * (overboost ? 1.6 : 1));
                double airF = 0.6 + 0.4 * Math.Min(1, speed / 25);
                double load = throttle * (this.rpm / e.redline) * (overboost ? 2.2 : 1) / airF;
                double target = 0.35 + 0.55 * load * p.heat / p.cooling;
                heat += (target - heat) * dt * (target > heat ? 0.09 : 0.05);
                if (heat > 1) DamageEngine((heat - 1) * 0.06 * dt, "heat");
            }
            else heat += (0.3 - heat) * dt * 0.02;

            // ---------------------------------------------------------- brakes
            double fade = 1 - 0.55 * U.Smoothstep(0.75, 1.35, brakeTemp / p.brakeFade);
            double brakeTotal = brake * p.brakeDecel * m * fade * (0.4 + 0.6 * dmg.brakes);
            double brakePower = 0;

            // ---------------------------------------------------------- wheels
            int onGround = 0;
            var qr = q0;
            double loadRef = (m * G) / 4;
            foreach (var w in wheels)
            {
                w.steer = w.front ? U.Lerp(w.steer, steerTarget, 1 - Math.Exp(-dt * 14)) : 0;
                var M = Qrot(q, w.mx, w.my, w.mz, T3);
                double mx = M.x + pos.x, my = M.y + pos.y, mz = M.z + pos.z;
                double maxLen = w.rest + p.r;
                bool contact = false; double comp = 0;
                double cx = mx, cy = my, cz = mz;
                if (uy > 0.15)
                {
                    t.Query(mx, mz, qr);
                    double dist = (my - qr.h) / uy;
                    double px = mx - ux * dist, pz = mz - uz * dist;
                    t.Query(px, pz, qr, true);
                    dist = (my - qr.h) / uy;
                    if (dist < maxLen + 0.02 && dist > p.r * 0.35)
                    {
                        contact = true;
                        comp = Math.Min(maxLen - dist, w.rest + 0.12);
                        px = mx - ux * dist; pz = mz - uz * dist;
                        double h0 = qr.h;
                        w.surf = qr.surf;
                        w.s = qr.s; w.d = qr.d;
                        double hx = t.Query(px + 0.3, pz, q1).h, hz = t.Query(px, pz + 0.3, q2).h;
                        double nx_ = -(hx - h0) / 0.3, nz_ = -(hz - h0) / 0.3, ny_ = 1;
                        double nl = Math.Sqrt(nx_ * nx_ + 1 + nz_ * nz_); nx_ /= nl; ny_ /= nl; nz_ /= nl;
                        w.nx = nx_; w.ny = ny_; w.nz = nz_;
                        cx = px; cy = h0; cz = pz;
                    }
                }
                w.contact = contact;
                // wheel centre for rendering
                double susLen = contact ? maxLen - comp - p.r : w.rest;
                w.gx = mx - ux * susLen; w.gy = my - uy * susLen; w.gz = mz - uz * susLen;
                w.compPrev = w.comp;
                w.comp = contact ? comp : U.Lerp(w.comp, 0, 1 - Math.Exp(-dt * 12));
                if (!contact)
                {
                    w.load = 0; w.slip = 0; w.slipLat = 0;
                    // free wheel: keep spinning, driven wheels rev with engine
                    w.spin = U.Lerp(w.spin, Array.IndexOf(driven, w.i) >= 0 && throttle > 0.1 ? this.rpm / ratio * 2 * Math.PI / 60 : w.spin * 0.98, 1 - Math.Exp(-dt * 3));
                    if (brake > 0.3 || (inp.handbrake != 0 && !w.front)) w.spin *= 0.8;
                    w.angle += w.spin * dt;
                    continue;
                }
                onGround++;
                // --- suspension
                double compVel = U.Clamp((w.comp - w.compPrev) / dt, -5, 5);
                // closing speed of the chassis corner towards the ground (for landing damage)
                var mv = PointVel(mx, my, mz, T6);
                double closing = -(mv.x * w.nx + mv.y * w.ny + mv.z * w.nz);
                double sDamp = w.c * (0.45 + 0.55 * dmg.susp);
                double Fs = w.k * w.comp + sDamp * compVel;
                if (w.comp > w.rest * 0.92)
                {
                    double over = w.comp - w.rest * 0.92;
                    Fs += w.k * 9 * over + w.c * 2.5 * Math.Max(0, compVel);
                    if (closing > p.landing * 0.6 && !w.bottomed && w.ny > 0.82 && landCool <= 0) { LandingHit(Math.Min(closing, 16), w); w.bottomed = true; landCool = 0.25; }
                }
                else w.bottomed = false;
                // anti-roll bar
                var other = wheels[w.i ^ 1];
                Fs += (w.comp - other.comp) * w.k * p.arb * (other.contact ? 1 : 0.3);
                if (Fs < 0) Fs = 0;
                // steep ground (a wall) is the body's job, not the spring's: fade the
                // suspension out as the contact normal tilts away from the car's up axis
                double align = w.nx * ux + w.ny * uy + w.nz * uz;
                Fs = Math.Min(Fs, w.mc * G * 6) * U.Smoothstep(0.35, 0.75, align);
                w.load = Fs;
                addF(ux * Fs, uy * Fs, uz * Fs, cx, cy + p.r * 0.2, cz);

                // --- tyre frame
                double nx = w.nx, ny = w.ny, nz = w.nz;
                double sa = Math.Sin(w.steer + w.toe), ca = Math.Cos(w.steer + w.toe);
                var fw = Qrot(q, sa, 0, ca, T4);
                double dn = fw.x * nx + fw.y * ny + fw.z * nz;
                double fx = fw.x - nx * dn, fy = fw.y - ny * dn, fz = fw.z - nz * dn;
                double fl = Or1(Math.Sqrt(fx * fx + fy * fy + fz * fz)); fx /= fl; fy /= fl; fz /= fl;
                // left vector = n x f
                double lx = ny * fz - nz * fy, ly = nz * fx - nx * fz, lz = nx * fy - ny * fx;
                // contact point velocity
                double rx = cx - pos.x, ry = cy - pos.y, rz = cz - pos.z;
                var av = angVel;
                double pvx = vx + (av.y * rz - av.z * ry), pvy = vy + (av.z * rx - av.x * rz), pvz = vz + (av.x * ry - av.y * rx);
                double vLong = pvx * fx + pvy * fy + pvz * fz;
                double vLat = pvx * lx + pvy * ly + pvz * lz;
                w.vLong = vLong;

                var si = Track.SURF_INFO[w.surf];
                double mu = p.mu * si.mu * p.tire.grip[si.group] * (si.group > 0 ? p.offroad : 1) * (0.62 + 0.38 * w.health);
                if (!w.front) mu *= p.rearGrip;
                mu *= U.Clamp(1 - 0.12 * (Fs / loadRef - 1), 0.72, 1.12);
                if (si.group == 0 && p.downforce != 0) mu *= 1 + p.downforce * Math.Min(1, speed / 60) * 0.25;
                // standing water: aquaplaning at speed
                if (w.surf == SURF.WATER) mu *= 1 - 0.45 * U.Smoothstep(18, 32, speed);
                double maxF = mu * Fs;

                // longitudinal
                double fLong = 0;
                bool isDriven = p.drive == "FWD" ? w.front : p.drive == "RWD" ? !w.front : true;
                double drive = isDriven && shiftT <= 0 ? wheelTorque / p.r : 0;
                fLong += drive;
                double share = w.front ? 0.32 : 0.18;
                double bF = brakeTotal * share;
                bool locked = false;
                if (inp.handbrake != 0 && !w.front) { bF = Math.Max(bF, maxF * 1.2); locked = speed > 1.5; }
                if (bF > 0)
                {
                    if (Math.Abs(vLong) > 0.6)
                    {
                        if ((p.abs || assist > 0) && !locked) bF = Math.Min(bF, maxF * 0.95);
                        if (bF > maxF * 1.02 && speed > 2) locked = true;
                        fLong -= Sign(vLong) * bF;
                        brakePower += bF * Math.Abs(vLong);
                    }
                    else fLong += U.Clamp(-vLong * w.mc / dt, -bF, bF);
                }
                fLong -= p.crr * si.roll * Fs * U.Clamp(vLong / 0.6, -1, 1);

                // lateral (simplified Pacejka)
                double alphaS = Math.Atan2(vLat, Math.Abs(vLong) + 0.6);
                double mf = Math.Sin(1.35 * Math.Atan(9.5 * alphaS));
                double latMu = locked ? 0.55 : 1;
                double fDyn = -maxF * mf * latMu;
                double fStatic = U.Clamp(-vLat * w.mc / dt * 0.5, -maxF, maxF);
                double fLat = U.Lerp(fStatic, fDyn, U.Smoothstep(0.8, 4, speed));
                // traction control (sports cars, assist on): keep the driven tyre inside its grip circle
                if (p.tcs && assist > 0 && drive * Sign(Or1(vLong)) > 0 && bF == 0)
                {
                    double room = Math.Sqrt(Math.Max(0, maxF * maxF * 0.96 - fLat * fLat));
                    if (Math.Abs(fLong) > room) fLong = Sign(fLong) * room;
                }
                // friction circle
                double spinning = 0;
                double tot = Math.Sqrt(fLong * fLong + fLat * fLat);
                if (tot > maxF && tot > 0)
                {
                    double k = maxF / tot;
                    if (Math.Abs(drive) > maxF * 0.9) spinning = U.Clamp((Math.Abs(drive) - maxF * 0.9) / (maxF + 1), 0, 1);
                    fLong *= k; fLat *= k;
                }
                w.spinning = spinning; w.locked = locked ? 1 : 0;
                w.slipLat = Math.Abs(vLat);
                w.slip = U.Clamp((Math.Abs(vLat) - 1.2) / 6, 0, 1) + spinning * 0.8 + (locked ? U.Clamp(Math.Abs(vLong) / 8, 0, 1) : 0);
                // apply at a raised point to soften the roll moment
                double lift = Math.Min(p.cg * 0.5 * p.stability, p.cg * 0.75);
                double ax = cx + ux * lift, ay = cy + uy * lift, az = cz + uz * lift;
                addF(fx * fLong + lx * fLat, fy * fLong + ly * fLat, fz * fLong + lz * fLat, ax, ay, az);
                // wheel spin for visuals
                double targetSpin = locked ? 0 : vLong / p.r + Sign(Or1(drive)) * spinning * 25;
                w.spin = U.Lerp(w.spin, targetSpin, 1 - Math.Exp(-dt * 30));
                w.angle += w.spin * dt;
                // surface roughness vibration (small vertical jitters)
                if (si.rough > 0.05 && speed > 2)
                {
                    w.roughPhase += speed * dt * 2.3;
                    double jitter = Math.Sin(w.roughPhase * 3.1) * Math.Sin(w.roughPhase * 1.7) * si.rough * w.mc * 3 * (1.2 - p.ground);
                    addF(ux * jitter, uy * jitter, uz * jitter, cx, cy, cz);
                }
            }
            wheelsOnGround = onGround;
            if (landCool > 0) landCool -= dt;
            // brake heat
            brakeTemp += (brakePower / (m * 900) - brakeTemp * (0.04 + speed * 0.0015)) * dt;
            if (brakeTemp < 0) brakeTemp = 0;

            // ---------------------------------------------------------- aero
            double drag = 0.5 * RHO * p.cda * speed;
            Fx -= drag * vx; Fy -= drag * vy; Fz -= drag * vz;
            if (nitroT > 0 && onGround >= 2 && inp.brake < 0.1)
            {
                // thrust along the body: cancels drag and adds ~10 % of top speed per second,
                // fading out at 1.4x top speed
                var fw = Qrot(q, 0, 0, 1, T7);
                double vt = vTop != 0 ? vTop : 50;
                double nFade = 1 - U.Smoothstep(1.36, 1.46, speed / vt);
                double ramp = Math.Min(1, (NITRO_TIME - nitroT) * 4);
                double F = (drag * speed * 1.12 + m * vt * 0.16) * nFade * ramp;
                Fx += fw.x * F; Fy += fw.y * F; Fz += fw.z * F;
            }
            if (p.downforce != 0)
            {
                double df = p.downforce * 0.5 * RHO * 1.2 * speed * speed;
                Fx -= ux * df; Fy -= uy * df; Fz -= uz * df;
            }

            // ---------------------------------------------------------- stability assist + air control
            var avB = Qinvrot(q, angVel.x, angVel.y, angVel.z, T5);
            if (onGround >= 3 && speed > 6 && assist > 0)
            {
                // compare actual yaw rate with what the front wheels ask for
                double want = (fwdSpeed * Math.Tan(wheels[0].steer)) / p.wb;
                double excess = avB.y - want;
                double slipAngle = Math.Atan2(LateralSpeed(), Math.Abs(fwdSpeed) + 1);
                double k = assist * 0.55 * p.stability * U.Smoothstep(0.25, 0.7, Math.Abs(slipAngle)) * (inp.handbrake != 0 ? 0.2 : 1);
                if (k > 0)
                {
                    double ty = -excess * I.y * k * 2.2;
                    var W = Qrot(q, 0, ty, 0, T6);
                    Tx += W.x; Ty += W.y; Tz += W.z;
                }
            }
            if (onGround >= 2)
            {
                // chassis roll damping: keeps the car from snapping over on kerbs and embankments
                double k = 3.2 * p.stability;
                var W = Qrot(q, 0, 0, -avB.z * I.z * k, T6);
                Tx += W.x; Ty += W.y; Tz += W.z;
            }
            if (onGround == 0)
            {
                air += dt;
                // a little air control: steer yaws, throttle/brake pitch
                double tbx = (inp.throttle - inp.brake) * -0.35 * I.x - avB.x * I.x * 0.6, tby = inp.steer * 0.35 * I.y, tbz = -avB.z * I.z * 0.5;
                var W = Qrot(q, tbx, tby, tbz, T6);
                Tx += W.x; Ty += W.y; Tz += W.z;
            }
            else
            {
                if (air > 0.45) Ev("land").air = air;
                airTime = air;
                air = 0;
            }

            // ---------------------------------------------------------- integrate velocities
            vel.x += (Fx / m) * dt; vel.y += (Fy / m) * dt; vel.z += (Fz / m) * dt;
            var tb = Qinvrot(q, Tx, Ty, Tz, T5);
            double dwx = (tb.x / I.x) * dt, dwy = (tb.y / I.y) * dt, dwz = (tb.z / I.z) * dt;
            var dW = Qrot(q, dwx, dwy, dwz, T6);
            angVel.x += dW.x; angVel.y += dW.y; angVel.z += dW.z;
            double ad = Math.Exp(-dt * 0.15);
            angVel.x *= ad; angVel.y *= ad; angVel.z *= ad;

            // ---------------------------------------------------------- contacts
            Collide(dt);

            // ---------------------------------------------------------- integrate positions
            pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
            var wv = angVel;
            double hq = 0.5 * dt;
            double nqx = q.x + hq * (wv.x * q.w + wv.y * q.z - wv.z * q.y);
            double nqy = q.y + hq * (wv.y * q.w + wv.z * q.x - wv.x * q.z);
            double nqz = q.z + hq * (wv.z * q.w + wv.x * q.y - wv.y * q.x);
            double nqw = q.w + hq * (-wv.x * q.x - wv.y * q.y - wv.z * q.z);
            double ql = Hypot(nqx, nqy, nqz, nqw);
            q.x = nqx / ql; q.y = nqy / ql; q.z = nqz / ql; q.w = nqw / ql;

            // drift tracking
            double lat = LateralSpeed();
            double slipA = Math.Abs(Math.Atan2(lat, Math.Abs(fwdSpeed) + 0.1));
            if (onGround >= 3 && speed > 12 && slipA > 0.26 && slipA < 1.4) drift += dt; else drift = Math.Max(0, drift - dt * 3);
            totalSlip = 0;
            foreach (var ww in wheels) totalSlip += ww.slip;
        }

        readonly Vec3 _lt = new Vec3();
        public double LateralSpeed()
        {
            var L = Qrot(q, 1, 0, 0, _lt);
            return vel.x * L.x + vel.y * L.y + vel.z * L.z;
        }

        // ------------------------------------------------------------------ contacts
        void Collide(double dt)
        {
            var t = track; var q = this.q; var pos = this.pos;
            var qr = q0;
            // where is the car relative to the road (for rails, tunnels, colliders)
            var c = t.Query(pos.x, pos.z, q1);
            lastQuery.idx = c.idx; lastQuery.s = c.s; lastQuery.d = c.d;
            lastQuery.halfW = c.halfW; lastQuery.dist = c.dist; groundY = c.h;
            double cS = c.s, cDist = c.dist; // q1 is reused below
            double roadY = t.RoadY(cS);
            scrape = Math.Max(0, scrape - dt * 4);
            var P = T3;
            for (int n = 0; n < pts.Length; n++)
            {
                var lp = pts[n];
                Qrot(q, lp[0], lp[1], lp[2], P);
                double px = P.x + pos.x, py = P.y + pos.y, pz = P.z + pos.z;
                if (py - groundY > 2.5 && py - roadY > 2.5) continue;
                t.Query(px, pz, qr);
                double h = qr.h;
                if (py < h)
                {
                    // terrain normal
                    double hx = t.Query(px + 0.4, pz, q2).h;
                    double hz = t.Query(px, pz + 0.4, q2).h;
                    double nx = -(hx - h) / 0.4, nz = -(hz - h) / 0.4, ny = 1;
                    double nl = Hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
                    double pen = (h - py) * ny;
                    double imp = Resolve(px, py, pz, nx, ny, nz, pen, 0.12, 0.5, double.PositiveInfinity);
                    if (imp > 0) Hit(lp, imp, px, py, pz, nx, ny, nz, "ground");
                }
                // guard rails
                int side = qr.d >= 0 ? 1 : 0;
                double adst = Math.Abs(qr.d);
                double ry = t.RoadY(qr.s);
                int rt = t.RailAt(qr.idx, side);
                double railD = qr.halfW + 0.55;
                if (rt != 0 && adst > railD && adst < railD + 1.6 && py < ry + 0.95 && py > ry - 0.8)
                {
                    double sg = side != 0 ? -1 : 1;
                    double nx = t.rx[qr.idx] * sg, nz = t.rz[qr.idx] * sg;
                    var pv = PointVel(px, py, pz, T4);
                    double vn = pv.x * nx + pv.z * nz;
                    if (-vn > t.RailBreakSpeed(rt) * (1 + p.armorLevel * 0.01))
                    {
                        t.BreakRail(qr.idx, side);
                        var ev = Ev("railbreak"); ev.x = px; ev.y = py; ev.z = pz; ev.idx = qr.idx; ev.side = side; ev.speed = -vn;
                        vel.x *= 0.82; vel.z *= 0.82;
                        Hit(lp, -vn * 0.7, px, py, pz, nx, 0, nz, "rail");
                    }
                    else
                    {
                        double imp = Resolve(px, py, pz, nx, 0, nz, adst - railD, 0.15, 0.35, double.PositiveInfinity);
                        if (imp > 0) Hit(lp, imp, px, py, pz, nx, 0, nz, "rail");
                    }
                }
                // tunnel walls
                if (t.tunnel[qr.idx] != 0 && adst > qr.halfW + 1.1 && py < ry + 5)
                {
                    double sg = side != 0 ? -1 : 1;
                    double nx = t.rx[qr.idx] * sg, nz = t.rz[qr.idx] * sg;
                    double imp = Resolve(px, py, pz, nx, 0, nz, adst - qr.halfW - 1.1, 0.1, 0.3, double.PositiveInfinity);
                    if (imp > 0) Hit(lp, imp, px, py, pz, nx, 0, nz, "wall");
                }
            }
            // static colliders
            var list = t.CollidersNear(cS);
            for (int n = 0; n < list.Count; n++) CollideShape(list[n]);
            var ex = t.extraCol;
            if (ex != null)
            {
                int kc = (int)Math.Floor(cS / 100);
                for (int kk = kc - 1; kk <= kc + 1; kk++)
                {
                    if (ex.TryGetValue(kk, out var l) && l != null)
                        for (int n = 0; n < l.Count; n++) if (Math.Abs(l[n].s - cS) < 25) CollideShape(l[n]);
                }
            }
            for (int n = 0; n < dynamic.Count; n++) CollideShape(dynamic[n]);
            var an = animalCols;
            if (an != null) for (int n = 0; n < an.Count; n++) CollideShape(an[n]);
            var cc = carCols;
            if (cc != null) for (int n = 0; n < cc.Count; n++) CollideShape(cc[n]);
            // body sunk below terrain (safety)
            if (pos.y < groundY - 1.5 && cDist < 30) { pos.y = groundY + 0.5; vel.y = Math.Max(0, vel.y); }
        }

        // Breakable things (saplings, bushes, fences, animals): above `brk` m/s they give way
        // instead of stopping the car. Returns true when the object was smashed.
        bool SmashCheck(WorldCollider o)
        {
            var pos = this.pos; var q = this.q;
            bool touch = false; double lz = 0, lx = 0;
            if (o.t == "s")
            {
                var lc = Qinvrot(q, o.x - pos.x, o.y - pos.y, o.z - pos.z, T5);
                double cx = U.Clamp(lc.x, -half.x, half.x), cy = U.Clamp(lc.y, yb, yt), cz = U.Clamp(lc.z, -half.z, half.z);
                double ex = cx - lc.x, ey = cy - lc.y, ez = cz - lc.z;
                touch = ex * ex + ey * ey + ez * ez < o.r * o.r;
                lz = cz; lx = cx;
            }
            else
            {
                double cyaw = Math.Cos(o.yaw), syaw = Math.Sin(o.yaw);
                for (int n = 0; n < pts.Length && !touch; n++)
                {
                    var lp = pts[n];
                    var P = Qrot(q, lp[0], lp[1], lp[2], T3);
                    double rx = P.x + pos.x - o.x, ry = P.y + pos.y - o.y, rz = P.z + pos.z - o.z;
                    double bx = rx * cyaw - rz * syaw, bz = rx * syaw + rz * cyaw;
                    if (Math.Abs(bx) <= o.hx && Math.Abs(ry) <= o.hy + 0.2 && Math.Abs(bz) <= o.hz + 0.15) { touch = true; lz = lp[2]; lx = lp[0]; }
                }
            }
            if (!touch) return false;
            double sp = Hypot(vel.x, vel.y, vel.z);
            if (sp < o.brk) return false;
            o.dead = true;
            double k = 1 - o.slow * Math.Min(1, 25 / Math.Max(sp, 1));
            vel.x *= k; vel.z *= k;
            var ev = Ev("smash"); ev.o = o; ev.speed = sp; ev.vx = vel.x; ev.vy = vel.y; ev.vz = vel.z;
            if (o.dmg != 0) Hit(new[] { lx, 0, lz }, sp * o.dmg, o.x, o.y, o.z, 0, 1, 0, "light", o);
            return true;
        }

        void CollideShape(WorldCollider o)
        {
            var pos = this.pos; var q = this.q;
            double dx = o.x - pos.x, dy = o.y - pos.y, dz = o.z - pos.z;
            double reach = o.hz != 0 ? o.hz : o.r != 0 ? o.r : 1;
            if (dx * dx + dz * dz > 100 + reach * 10) return;
            if (o.dead) return;
            if (o.Breakable && SmashCheck(o)) return;
            if (o.t == "s")
            {
                // sphere vs car box
                var lc = Qinvrot(q, dx, dy, dz, T5);
                double cx = U.Clamp(lc.x, -half.x, half.x), cy = U.Clamp(lc.y, yb, yt), cz = U.Clamp(lc.z, -half.z, half.z);
                double ex = cx - lc.x, ey = cy - lc.y, ez = cz - lc.z;
                double d2 = ex * ex + ey * ey + ez * ez;
                if (d2 >= o.r * o.r) return;
                double d = Math.Sqrt(d2);
                if (d < 1e-4) { ex = 0; ey = 0; ez = lc.z > 0 ? -1 : 1; d = 1; d2 = 1; }
                var W = Qrot(q, ex / d, ey / d, ez / d, T6);
                var wp = Qrot(q, cx, cy, cz, T4);
                double px = wp.x + pos.x, py = wp.y + pos.y, pz = wp.z + pos.z;
                double mass = o.m != 0 ? o.m : double.PositiveInfinity;
                double imp = Resolve(px, py, pz, W.x, W.y, W.z, o.r - d, 0.2, 0.4, mass, o);
                if (imp > 0) Hit(new[] { cx, cy, cz }, o.light ? imp * 0.3 : imp, px, py, pz, W.x, W.y, W.z, o.light ? "light" : "object", o);
            }
            else if (o.t == "b")
            {
                // car sample points inside an oriented box (yaw only)
                double cyaw = Math.Cos(o.yaw), syaw = Math.Sin(o.yaw);
                for (int n = 0; n < pts.Length; n++)
                {
                    var lp = pts[n];
                    var P = Qrot(q, lp[0], lp[1], lp[2], T3);
                    double rx = P.x + pos.x - o.x, ry = P.y + pos.y - o.y, rz = P.z + pos.z - o.z;
                    // into box frame (box forward = yaw heading)
                    double bx = rx * cyaw - rz * syaw, bz = rx * syaw + rz * cyaw;
                    if (Math.Abs(bx) > o.hx || Math.Abs(ry) > o.hy || Math.Abs(bz) > o.hz) continue;
                    double px = o.hx - Math.Abs(bx), py = o.hy - Math.Abs(ry), pz = o.hz - Math.Abs(bz);
                    double nx = 0, ny = 0, nz = 0, pen;
                    if (px < pz && px < py) { pen = px; double s = Sign(bx); nx = s * cyaw; nz = -s * syaw; }
                    else if (pz < py) { pen = pz; double s = Sign(bz); nx = s * syaw; nz = s * cyaw; }
                    else { pen = py; ny = Sign(ry); }
                    double wx = P.x + pos.x, wy = P.y + pos.y, wz = P.z + pos.z;
                    double imp = Resolve(wx, wy, wz, nx, ny, nz, pen, 0.15, 0.4, o.m != 0 ? o.m : double.PositiveInfinity, o);
                    if (imp > 0) Hit(lp, imp, wx, wy, wz, nx, ny, nz, "object", o);
                }
            }
        }

        public Vec3 PointVel(double px, double py, double pz, Vec3 o)
        {
            double rx = px - pos.x, ry = py - pos.y, rz = pz - pos.z; var w = angVel;
            o.x = vel.x + (w.y * rz - w.z * ry);
            o.y = vel.y + (w.z * rx - w.x * rz);
            o.z = vel.z + (w.x * ry - w.y * rx);
            return o;
        }

        Vec3 ApplyInvI(double x, double y, double z, Vec3 o)
        {
            var b = Qinvrot(q, x, y, z, o);
            return Qrot(q, b.x / I.x, b.y / I.y, b.z / I.z, o);
        }

        readonly Vec3 _pv = new Vec3(), _ii = new Vec3(), _iw = new Vec3();
        // Impulse based contact. Returns the closing speed (m/s) if there was an impact.
        double Resolve(double px, double py, double pz, double nx, double ny, double nz, double pen, double e, double mu, double otherMass, WorldCollider other = null)
        {
            double rx = px - pos.x, ry = py - pos.y, rz = pz - pos.z;
            var pv = PointVel(px, py, pz, _pv);
            double ovx = 0, ovy = 0, ovz = 0;
            if (other != null) { ovx = other.vx; ovy = other.vy; ovz = other.vz; }
            double rvx = pv.x - ovx, rvy = pv.y - ovy, rvz = pv.z - ovz;
            double vn = rvx * nx + rvy * ny + rvz * nz;
            bool inf = double.IsPositiveInfinity(otherMass);
            // positional correction
            if (pen > 0.005)
            {
                double corr = Math.Min(pen, 0.2) * (inf ? 0.3 : 0.2);
                pos.x += nx * corr; pos.y += ny * corr; pos.z += nz * corr;
                if (other != null && !inf) { other.x -= nx * corr; other.y -= ny * corr; other.z -= nz * corr; }
            }
            if (vn >= 0) return 0;
            // r x n
            double cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
            var ii = ApplyInvI(cx, cy, cz, _ii);
            double ang = (ii.y * rz - ii.z * ry) * nx + (ii.z * rx - ii.x * rz) * ny + (ii.x * ry - ii.y * rx) * nz;
            double invO = inf ? 0 : 1 / otherMass;
            double jn = (-(1 + e) * vn) / (1 / m + ang + invO);
            Impulse(px, py, pz, nx * jn, ny * jn, nz * jn);
            if (invO != 0) { other.vx -= nx * jn * invO; other.vy -= ny * jn * invO; other.vz -= nz * jn * invO; other.hit = true; }
            // friction
            double tx = rvx - nx * vn, ty = rvy - ny * vn, tz = rvz - nz * vn;
            double tl = Math.Sqrt(tx * tx + ty * ty + tz * tz);
            if (tl > 1e-3)
            {
                tx /= tl; ty /= tl; tz /= tl;
                double c2x = ry * tz - rz * ty, c2y = rz * tx - rx * tz, c2z = rx * ty - ry * tx;
                var i2 = ApplyInvI(c2x, c2y, c2z, _ii);
                double ang2 = (i2.y * rz - i2.z * ry) * tx + (i2.z * rx - i2.x * rz) * ty + (i2.x * ry - i2.y * rx) * tz;
                double jt = tl / (1 / m + ang2 + invO);
                jt = Math.Min(jt, mu * jn);
                Impulse(px, py, pz, -tx * jt, -ty * jt, -tz * jt);
                if (tl > 3 && jn > m * 0.2) scrape = Math.Min(1, scrape + 0.25);
            }
            return -vn;
        }

        void Impulse(double px, double py, double pz, double jx, double jy, double jz)
        {
            vel.x += jx / m; vel.y += jy / m; vel.z += jz / m;
            double rx = px - pos.x, ry = py - pos.y, rz = pz - pos.z;
            double tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
            var d = ApplyInvI(tx, ty, tz, _iw);
            angVel.x += d.x; angVel.y += d.y; angVel.z += d.z;
        }

        // ------------------------------------------------------------------ damage
        void Hit(double[] lp, double speed, double x, double y, double z, double nx, double ny, double nz, string kind, WorldCollider obj = null)
        {
            if (speed < 2.2)
            {
                if (speed > 1.2) { var b = Ev("bump"); b.speed = speed; b.x = x; b.y = y; b.z = z; }
                return;
            }
            var p = this.p;
            double bse = speed - 3.0;
            var ev = Ev("impact"); ev.speed = speed; ev.x = x; ev.y = y; ev.z = z; ev.nx = nx; ev.ny = ny; ev.nz = nz; ev.kind = kind; ev.lx = lp[0]; ev.ly = lp[1]; ev.lz = lp[2];
            if (bse <= 0) return;
            double dmgAmt = Math.Pow(bse, 1.55) * 0.85 * p.dmgMult;
            if (kind == "light") dmgAmt *= 0.3;
            ApplyDamage(lp, dmgAmt);
        }

        public void ApplyDamage(double[] lp, double dmgAmt)
        {
            var p = this.p; var d = this.dmg;
            double pool = p.hpPool;
            double f = dmgAmt / pool;
            hp -= dmgAmt;
            double x = lp[0], y = lp[1], z = lp[2];
            string zone;
            if (y > yt - 0.25) zone = "roof";
            else if (z > half.z * 0.45) zone = "front";
            else if (z < -half.z * 0.45) zone = "rear";
            else zone = x > 0 ? "left" : "right";
            d[zone] = Math.Max(0, d[zone] - f * 2.4);
            if (zone == "front")
            {
                DamageEngine(f * 1.0, "impact");
                d.brakes = Math.Max(0, d.brakes - f * 0.25);
                if (x > 0.15) d.lightL = Math.Max(0, d.lightL - f * 4); else if (x < -0.15) d.lightR = Math.Max(0, d.lightR - f * 4); else { d.lightL -= f * 2; d.lightR -= f * 2; }
                d.bumperF = Math.Max(0, d.bumperF - f * 3);
            }
            else if (zone == "rear") d.bumperR = Math.Max(0, d.bumperR - f * 3);
            else DamageEngine(f * 0.2, "impact");
            if (dmgAmt > 7)
            {
                double before = d.glass;
                d.glass = Math.Min(3, d.glass + (dmgAmt > 25 ? 2 : 1) * (Rand.Next() < 0.6 ? 1 : 0));
                if (d.glass > before) Ev("glass").level = (int)d.glass;
            }
            // wheels near the hit point
            foreach (var w in wheels)
            {
                double dx = w.mx - x, dz = w.mz - z;
                if (dx * dx + dz * dz < 1.4)
                {
                    w.health = Math.Max(0, w.health - f * 1.8);
                    w.toe = (1 - w.health) * 0.045 * (w.left ? 1 : -1) * (w.front ? 1 : 0.6);
                    d.susp = Math.Max(0, d.susp - f * 0.5);
                }
            }
            var ev = Ev("damage"); ev.zone = zone; ev.amount = f; ev.lx = x; ev.ly = y; ev.lz = z;
        }

        public void DamageEngine(double f, string why)
        {
            double before = dmg.engine;
            dmg.engine = Math.Max(0, dmg.engine - f);
            if (before > 0.25 && dmg.engine <= 0.25) Ev("engineCritical");
            if (before > 0 && dmg.engine <= 0) Ev("engineDead").why = why;
            if (why == "heat") hp -= f * p.hpPool * 0.3;
        }

        void LandingHit(double compVel, Wheel w)
        {
            var p = this.p;
            double over = compVel - p.landing;
            var b = Ev("bottom"); b.speed = compVel; b.wheel = w.i;
            if (over <= 0) return;
            double dmgAmt = Math.Pow(over, 1.4) * 1.6 * p.dmgMult;
            double f = dmgAmt / p.hpPool;
            hp -= dmgAmt * 0.5;
            dmg.susp = Math.Max(0, dmg.susp - f * 1.4);
            w.health = Math.Max(0, w.health - f * 1.2);
            w.toe = (1 - w.health) * 0.04 * (w.left ? 1 : -1);
            if (w.front) DamageEngine(f * 0.15, "landing");
            var ev = Ev("damage"); ev.zone = "susp"; ev.amount = f; ev.lx = w.mx; ev.ly = yb; ev.lz = w.mz;
        }

        public void Repair(double amount)
        {
            var d = dmg;
            hp = Math.Min(p.hpPool, hp + p.hpPool * amount);
            d.engine = Math.Min(1, d.engine + amount * 0.8);
            d.susp = Math.Min(1, d.susp + amount);
            d.brakes = Math.Min(1, d.brakes + amount);
            foreach (var w in wheels) { w.health = Math.Min(1, w.health + amount); w.toe *= 1 - Math.Min(1, amount * 1.5); }
            if (dmg.engine > 0 && fuel > 0) { engineOn = true; stalled = false; }
        }

        // Convenience for renderers
        public Vec3 GetForward(Vec3 o) => Qrot(q, 0, 0, 1, o);
        public Vec3 GetUp(Vec3 o) => Qrot(q, 0, 1, 0, o);
        public Vec3 GetRight(Vec3 o) => Qrot(q, -1, 0, 0, o);
        public Vec3 LocalToWorld(double x, double y, double z, Vec3 o) { Qrot(q, x, y, z, o); o.x += pos.x; o.y += pos.y; o.z += pos.z; return o; }
        public double kmh => speed * 3.6;
    }
}

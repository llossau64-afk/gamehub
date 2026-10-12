// Racing AI: follows a racing line, brakes for the slowest corner it can still reach,
// overtakes on the free side and uses the nitro on long straights. Pure (no Unity),
// so it runs headless. Returns true when the car needs a reset.
using System;
using System.Collections.Generic;

namespace Downfall
{
    // One car in the field (race.js `Entrant`). Partial so the race code can add its own
    // fields (model, box, tag, ...) in another file.
    public sealed partial class Entrant
    {
        public int lap;
        public double lastS, progress;
        public bool finished;
        public double finishTime, bestLap = double.PositiveInfinity, lapStart;
        public double stuckT, flipT, lane, laneT, skill = 1;
        public double passSide;
        public bool isBot;
        public string name;
        public Vehicle vehicle;
        public CarDef car;
        public CarStats stats;
    }

    public sealed class AiOptions
    {
        public double cruise = 1;
        public bool go;
        public Entrant me;
    }

    public static class BotAI
    {
        // globalThis.__AIK: corner-speed factor override for tuning (0 = default 0.72)
        public static double AIK = 0;

        static readonly Vehicle.Vec3 TMP = new Vehicle.Vec3(), TMP2 = new Vehicle.Vec3();
        static readonly AiOptions NoOpts = new AiOptions();

        static double Sign(double v) => v > 0 ? 1 : v < 0 ? -1 : v;

        public static bool AiDrive(Entrant e, IList<Entrant> field, Track t, double dt, AiOptions o = null)
        {
            o ??= NoOpts;
            double cruise = o.cruise;
            var v = e.vehicle; var q = v.lastQuery; var p = v.p;
            double s = q.s, spd = v.speed;
            double halfW = t.width[Math.Min(t.N - 1, q.idx)] / 2.0;
            double kAt(double u) => t.k[Math.Min(t.N - 1, Math.Max(0, (int)Math.Floor(t.WrapS(s + u) / Track.STEP + 0.5)))];
            // racing line: drift to the inside of the coming corner
            double kAhead = 0;
            for (double u = 10; u < 50; u += 10) kAhead += kAt(u + spd * 0.6);
            kAhead /= 4;
            double want = U.Clamp(-Sign(kAhead) * Math.Min(1, Math.Abs(kAhead) * 70) * halfW * 0.55, -halfW + 1.3, halfW - 1.3);
            // overtaking: find the nearest car ahead in our lane
            e.laneT -= dt;
            foreach (var ot in field)
            {
                if (ot == e) continue;
                double gap = ot.progress - e.progress;
                if (gap > 0 && gap < 22 + spd * 0.4 && Math.Abs(ot.vehicle.lastQuery.d - e.lane) < 2.4)
                {
                    if (e.laneT <= 0) { e.passSide = ot.vehicle.lastQuery.d > 0 ? -1 : 1; e.laneT = 2.5; }
                }
            }
            if (e.laneT > 0) want = U.Clamp(e.passSide * halfW * 0.55, -halfW + 1.3, halfW - 1.3);
            e.lane = U.Damp(e.lane, want, 1.2, dt);
            // steering: pure pursuit on the lane line
            double look = 7 + spd * 0.5;
            var tgt = t.PosAt(s + look, e.lane);
            var fw = v.GetForward(TMP);
            double ang = Math.Atan2(tgt.x - v.pos.x, tgt.z - v.pos.z) - Math.Atan2(fw.x, fw.z);
            while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
            v.input.steer = U.Clamp(ang * 2.4, -1, 1);
            // speed: the slowest corner speed we can still brake down to
            double mu = p.mu * (p.tire != null && p.tire.grip != null ? p.tire.grip[0] : 1) * 9.81 * e.skill * (p.downforce != 0 ? 1 + p.downforce * Math.Min(1, spd / 60) * 0.25 : 1);
            double dec = Math.Min(p.brakeDecel, mu) * 0.7;
            double vt = 999;
            double reach = 30 + (spd * spd) / (2 * dec) + 20;
            double aik = AIK != 0 ? AIK : 0.72;
            for (double u = 4; u < reach; u += 6)
            {
                double k = Math.Abs(kAt(u));
                double vc = Math.Sqrt(mu * aik / Math.Max(k, 1e-4));
                vt = Math.Min(vt, Math.Sqrt(vc * vc + 2 * dec * Math.Max(0, u - 8)));
            }
            vt *= cruise;
            // keep the bunch together a little
            if (e.isBot && o.me != null)
            {
                double gap = e.progress - o.me.progress;
                vt *= U.Clamp(1 - gap / 4000, 0.95, 1.04);
            }
            v.input.throttle = spd < vt * 0.98 ? 1 : spd < vt ? 0.4 : 0;
            v.input.brake = spd > vt * 1.03 ? U.Clamp((spd - vt) / 5, 0.25, 1) : 0;
            v.input.handbrake = 0;
            // nitro on a long straight
            // (only when the straight lasts the whole burn plus the braking for the next corner)
            bool straight = v.input.brake == 0;
            double vb = spd * 1.4, need = vb * 4 + (vb * vb) / (2 * dec) * 0.6;
            for (double u = 0; straight && u < need; u += 15) if (Math.Abs(kAt(u)) > 1.0 / 350) straight = false;
            v.input.boost = e.isBot && straight && v.nitro >= 1 && spd > 20 && Vehicle.Rand.Next() < dt * 0.8 ? 1 : 0;
            // recover from crashes
            var up = v.GetUp(TMP2);
            if (up.y < 0.3) e.flipT += dt; else e.flipT = 0;
            if (o.go && spd < 1.5 && v.input.throttle > 0.5) e.stuckT += dt; else e.stuckT = Math.Max(0, e.stuckT - dt);
            return e.flipT > 2 || e.stuckT > 3.5 || q.dist > halfW + 40;
        }
    }
}

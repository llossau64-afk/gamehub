// The Race's net interface (online.js raceIface / attach / update / interp / detach):
// remote cars are Entrants with a CarView and a Vehicle that is never stepped, only placed
// from the peers' 'r' presence, interpolated DELAY seconds in the past.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Downfall
{
    public sealed partial class Online
    {
        static readonly string[] REMOTE_COLORS = { "#5aa0ff", "#ff6a5a", "#7ad07a", "#d78cff", "#ffd25a", "#5ae0d0", "#ff9a3a" };

        sealed class Snap { public double t, x, y, z, vx, vy, vz; public double[] q; }
        sealed class RemoteNet { public List<Snap> snaps = new List<Snap>(); public double[] lastR; public double netNitro, netSteer, seen; }

        public Race race;
        readonly Dictionary<string, Entrant> remote = new Dictionary<string, Entrant>();
        double sendT, raceSeq;
        readonly double[] rbuf = new double[16];

        sealed class NetIface : IRaceNet
        {
            public Online o; public OnlineView view; public List<string> grid; public string mePeer;
            public double startAt => view.at;
            public int RemoteCount() => grid.Count - 1;
            public int MySlot() => Math.Max(0, grid.IndexOf(mePeer));
            public void Attach(Race race, Func<int, (double s, double d)> slotPos) => o.Attach(race, slotPos, grid, view.seq);
            public void Update(double dt, Race race) => o.Update(dt, race);
            public void Detach() => o.Detach();
        }

        // set as cfg.net when a race starts from a lobby
        public IRaceNet RaceIface(OnlineView v)
        {
            var me = members.FirstOrDefault(m => m.me);
            var grid = v.grid.Where(p => members.Any(m => m.peer == p)).ToList();
            if (me != null && !grid.Contains(me.peer)) grid.Add(me.peer);
            return new NetIface { o = this, view = v, grid = grid, mePeer = me?.peer };
        }

        void Attach(Race r, Func<int, (double s, double d)> slotPos, List<string> grid, double seq)
        {
            state = "racing";
            race = r;
            raceSeq = seq;
            remote.Clear();
            var t = r.track;
            for (int slot = 0; slot < grid.Count; slot++)
            {
                var peer = grid[slot];
                var m = members.FirstOrDefault(x => x.peer == peer);
                if (m == null || m.me) continue;
                var car = Cars.CarById(m.car);
                var st = Stats.ComputeStats(car, new Dictionary<string, int>(), "perf");
                var model = new CarView(car, new CarViewOpts { tire = "perf", stats = st, paint = m.paint });
                model.HideParts("interior", "dash", "cabin", "seats", "steering", "gauges");
                model.Bake();
                model.group.SetParent(r.g.worldScene, true);
                var v = new Vehicle(t, car, st);
                var p = slotPos(slot);
                v.Reset(t.WrapS(p.s), p.d);
                model.SetPose(v.pos, v.q);
                var e = r.AddRemote(new Entrant
                {
                    remote = true, peer = peer, name = m.name, vehicle = v, model = model, car = car, stats = st, color = REMOTE_COLORS[slot % REMOTE_COLORS.Length],
                    lane = p.d, lastS = t.WrapS(p.s), lap = t.loop && p.s < 0 ? -1 : 0, net = new RemoteNet(),
                });
                remote[peer] = e;
            }
            Changed();
        }

        // per race frame (Race.Update calls cfg.net.Update)
        public void Update(double dt, Race r)
        {
            if (lobby == null) return;
            // send my car
            sendT -= dt;
            if (sendT <= 0)
            {
                sendT = 1 / SEND_HZ;
                var v = r.vehicle; var me = r.me;
                lobby.Presence(Pres.P(("r", PackR(raceSeq, v.pos.x, v.pos.y, v.pos.z, v.q.x, v.q.y, v.q.z, v.q.w, v.vel.x, v.vel.y, v.vel.z,
                    me.progress, me.finished, me.finishTime, v.nitroT > 0, v.input.steer))));
            }
            // read everyone else
            double now = clock;
            var peers = lobby.Peers();
            foreach (var p in peers)
            {
                if (!remote.TryGetValue(p.peer, out var e)) continue;
                var n = (RemoteNet)e.net;
                if (p.presence == null || !p.presence.TryGetValue("r", out var ro) || !ReadR(ro, raceSeq, rbuf)) continue;
                // (by value: transports that resend full state re-create the array)
                if (n.lastR != null && n.lastR.SequenceEqual(rbuf)) continue;
                n.lastR = (double[])rbuf.Clone();
                var a = n.lastR;
                n.snaps.Add(new Snap { t = now, x = a[1], y = a[2], z = a[3], q = new[] { a[4], a[5], a[6], a[7] }, vx = a[8], vy = a[9], vz = a[10] });
                if (n.snaps.Count > 6) n.snaps.RemoveAt(0);
                e.netProgress = a[11];
                n.netNitro = a[14];
                n.netSteer = a[15];
                if (a[12] != 0 && !e.finished) r.RemoteFinished(e, a[13]);
                n.seen = now;
            }
            foreach (var e in remote.Values)
            {
                // the car left the lobby: park it
                if (!peers.Any(p => p.peer == e.peer))
                {
                    if (!e.gone) { e.gone = true; e.model.visible = false; if (e.box != null) e.box.hx = e.box.hy = e.box.hz = 0; r.RemoteLeft(e); }
                    continue;
                }
                Interp(e, now, dt, r);
            }
        }

        void Interp(Entrant e, double now, double dt, Race r)
        {
            var n = (RemoteNet)e.net;
            var sn = n.snaps;
            if (sn.Count == 0) return;
            double t = now - DELAY;
            Snap a = sn[0], b = sn[sn.Count - 1];
            double f = 1;
            for (int i = 0; i < sn.Count - 1; i++)
                if (sn[i].t <= t && sn[i + 1].t >= t) { a = sn[i]; b = sn[i + 1]; f = (t - a.t) / Math.Max(1e-3, b.t - a.t); break; }
            var v = e.vehicle;
            if (t > b.t)
            {
                // ran out of data: extrapolate a little along the last velocity
                double k = Math.Min(0.35, t - b.t);
                v.pos.x = b.x + b.vx * k; v.pos.y = b.y + b.vy * k; v.pos.z = b.z + b.vz * k;
                v.q = new Vehicle.Quat { x = b.q[0], y = b.q[1], z = b.q[2], w = b.q[3] };
                v.vel.x = b.vx; v.vel.y = b.vy; v.vel.z = b.vz;
            }
            else
            {
                v.pos.x = a.x + (b.x - a.x) * f; v.pos.y = a.y + (b.y - a.y) * f; v.pos.z = a.z + (b.z - a.z) * f;
                v.vel.x = a.vx + (b.vx - a.vx) * f; v.vel.y = a.vy + (b.vy - a.vy) * f; v.vel.z = a.vz + (b.vz - a.vz) * f;
                // nlerp is plenty for 70 ms apart
                double dot = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3];
                double s = dot < 0 ? -1 : 1;
                var q = new double[4];
                for (int i = 0; i < 4; i++) q[i] = a.q[i] + (b.q[i] * s - a.q[i]) * f;
                double l = Math.Sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
                if (l == 0) l = 1;
                v.q = new Vehicle.Quat { x = q[0] / l, y = q[1] / l, z = q[2] / l, w = q[3] / l };
            }
            v.speed = Math.Sqrt(v.vel.x * v.vel.x + v.vel.y * v.vel.y + v.vel.z * v.vel.z);
            v.nitroT = n.netNitro != 0 ? 1 : 0;
            v.lastQuery = r.track.Query(v.pos.x, v.pos.z, e.q ??= new TrackQuery());
            var m = e.model;
            m.SetPose(v.pos, v.q);
            m.SpinWheels(v.speed / Math.Max(0.2, v.p.r) * dt, n.netSteer * 0.5);
        }

        void Detach()
        {
            // (the race's ClearField removes and disposes the models)
            remote.Clear();
            race = null;
            EndRace();
        }
    }
}

// The Unity-free half of race.js: the entrant fields the race keeps, laps / positions / order,
// the grid slots and the result rows. Pure C# so it runs headless (tests, bot sims).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Downfall
{
    // race.js Entrant fields beyond the ones BotAI declares (Unity-side ones live in Race.cs)
    public sealed partial class Entrant
    {
        public bool isPlayer, remote, dnf, left, gone;
        public string color = "#ffffff";
        public int pos;                                   // place in the field (1-based)
        public double netProgress = double.NaN;           // online: progress reported by the peer
        public string peer;                               // online: peer id
        public object net;                                // online: anything the net layer keeps (snapshots...)
        public WorldCollider box;                         // collision box other cars hit
        public double[] v0 = new double[3];               // box velocity before the physics step
        public TrackQuery q;                              // scratch query (online interpolation)
    }

    public sealed class ResultEntry { public Entrant e; public double t; public bool est; }

    public static class RaceLogic
    {
        public static readonly double[] PRIZE = { 1, 0.62, 0.45, 0.34, 0.26, 0.2, 0.16, 0.12 };
        public const double INTRO_SECONDS = 8.4;

        public static string FmtTime(double t)
        {
            if (double.IsNaN(t) || double.IsInfinity(t)) return "--:--.---";
            double m = Math.Floor(t / 60), s = t - m * 60;
            return m.ToString("0", Inv) + ":" + (s < 10 ? "0" : "") + s.ToString("0.000", Inv);
        }
        static readonly System.Globalization.CultureInfo Inv = System.Globalization.CultureInfo.InvariantCulture;

        // the grid: two columns, 8 m apart, behind the start line
        public static (double s, double d) SlotPos(Track t, double startS, int k) =>
            (startS - 6 - Math.Floor(k / 2.0) * 9 - (k % 2) * 3, (k % 2 != 0 ? 1 : -1) * Math.Min(2.4, t.width[0] / 2 - 1.4));

        public static double Goal(Track t, int laps, double startS) => t.loop ? laps * t.length : t.length - startS;

        // keep each car's lap / distance up to date and sort the field (race.js progressAll)
        public static List<Entrant> ProgressAll(IList<Entrant> field, Track t, int laps, double startS, double raceTime, bool go,
            Action<Entrant, double> onLap = null, Action<Entrant> onFinish = null)
        {
            double L = t.length;
            foreach (var e in field)
            {
                if (e.remote) { if (!double.IsNaN(e.netProgress)) e.progress = e.netProgress; continue; }
                double s = e.vehicle.lastQuery.s;
                if (t.loop)
                {
                    if (e.lastS > L * 0.7 && s < L * 0.3)
                    {
                        e.lap++;
                        if (e.lap >= 1 && !e.finished)
                        {
                            double lt = raceTime - e.lapStart;
                            e.bestLap = Math.Min(e.bestLap, lt);
                            e.lapStart = raceTime;
                            onLap?.Invoke(e, lt);
                        }
                    }
                    else if (e.lastS < L * 0.3 && s > L * 0.7) e.lap--;
                    e.progress = e.lap * L + s;
                }
                else e.progress = s - startS;
                e.lastS = s;
                double goal = Goal(t, laps, startS);
                if (!e.finished && go && e.progress >= goal)
                {
                    e.finished = true; e.finishTime = raceTime;
                    onFinish?.Invoke(e);
                }
            }
            var order = field.OrderBy(x => x, Comparer<Entrant>.Create((a, b) =>
            {
                if (a.finished && b.finished) return a.finishTime.CompareTo(b.finishTime);
                if (a.finished) return -1; if (b.finished) return 1;
                return b.progress.CompareTo(a.progress);
            })).ToList();
            for (int i = 0; i < order.Count; i++) order[i].pos = i + 1;
            return order;
        }

        // cars still racing get an estimated time from their average pace (race.js showResult)
        public static List<ResultEntry> ResultRows(IList<Entrant> field, IList<Entrant> finishOrder, Entrant me, Track t, int laps, double startS, double raceTime)
        {
            double goal = Goal(t, laps, startS);
            var est = field.Where(e => !e.finished).Select(e =>
            {
                double pace = Math.Max(8, e.progress / Math.Max(1, raceTime));
                return (e, t: raceTime + (goal - e.progress) / pace);
            }).OrderBy(x => x.t).ToList();
            var rows = finishOrder.Select(e => new ResultEntry { e = e, t = e.finishTime }).ToList();
            rows.AddRange(est.Select(x => new ResultEntry { e = x.e, t = x.e.dnf ? double.PositiveInfinity : x.t, est = true }));
            if (me != null && me.dnf)
            {
                int i = rows.FindIndex(r => r.e == me);
                if (i >= 0) { var r = rows[i]; rows.RemoveAt(i); r.t = double.PositiveInfinity; rows.Add(r); }
            }
            return rows;
        }

        public static double Prize(double baseReward, int place, int fieldCount, double mult, bool dnf)
        {
            double fieldK = 0.55 + 0.45 * (fieldCount - 1) / 7.0;
            return dnf ? 0 : Math.Round(baseReward * PRIZE[Math.Max(0, Math.Min(PRIZE.Length - 1, place - 1))] * fieldK * mult);
        }
    }
}

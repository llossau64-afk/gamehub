// Online races (online.js port), written against IRoom (Room.cs).
//
// Everything travels as presence (no event topics):
//   lobby room (everyone online):   { nm, lob: { code, map, n, st, pub } | null }   (hosts advertise)
//   named room "ord-<code>":        { nm, car, paint, rdy, hs, ts, cfg?, r? }
//     cfg (host only): { map, laps, seq, go, grid: [peer...], at, used?, closed?, next? }
//     r   (racing):    [seq, x, y, z, qx, qy, qz, qw, vx, vy, vz, progress, finished, finishTime, nitro, steer]
// Presence is never authority: the host is simply the earliest member that claims it,
// and every client computes the same answer from the same snapshot.
//
// This file is engine-agnostic (no UnityEngine) so it runs in the headless loopback test;
// the race side (remote cars, interpolation) is in Online.Race.cs.
//
// Timers: JS setTimeout / await sleep run on Online's own clock, advanced by Update(dt),
// which the game controller calls every frame (also ticks the transport).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Downfall
{
    // what Online needs from the game controller (main.js `this.g` as seen by online.js)
    public interface IOnlineGame
    {
        string nick { get; set; }              // save.data.nick (setter saves)
        List<string> usedCodes { get; set; }   // save.data.usedCodes (setter saves)
        string selectedCar { get; }            // save.data.selected
        bool CarExists(string id);             // carById(id) != null
        int? PaintOf(string carId);            // paintFor(car, carState(...)).color
        void OnlineStart(OnlineView view);     // g.onlineStart: a lobby race begins
        void OnlineRematch();                  // g.onlineRematch: we followed the host into the rematch lobby
    }

    public sealed class OnlineLobby { public string code, map, st, host; public int n; }

    public sealed class OnlineMember
    {
        public string peer; public bool me; public string name, car; public int? paint;
        public bool rdy, hs, host, guest; public double ts;
        public Dictionary<string, object> cfg; public List<object> r;
    }

    // the host's cfg as every client reads it (online.js `view`)
    public sealed class OnlineView
    {
        public string map = ""; public int laps; public double seq; public bool go; public List<string> grid = new List<string>(); public double at;
        public Dictionary<string, object> ToCfg() => Pres.P(("map", map), ("laps", (double)laps), ("seq", seq), ("go", go ? 1.0 : 0.0), ("grid", grid.Cast<object>().ToList()), ("at", at));
    }

    public sealed partial class Online
    {
        public const int MAX_PLAYERS = 8;
        const double SEND_HZ = 15, DELAY = 0.12;
        const string CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
        static readonly Random rng = new Random();
        static string Rnd(int n) { var c = new char[n]; lock (rng) for (int i = 0; i < n; i++) c[i] = CODE_CHARS[rng.Next(CODE_CHARS.Length)]; return new string(c); }
        static double R2(double x) => Math.Round(x * 100, MidpointRounding.AwayFromZero) / 100;
        static double R3(double x) => Math.Round(x * 1000, MidpointRounding.AwayFromZero) / 1000;
        static readonly Regex CleanRx = new Regex(@"[^\p{L}\p{N} ._-]");
        public static string Clean(object s, int n = 16)
        {
            var v = CleanRx.Replace(s as string ?? (s == null ? "" : Convert.ToString(s, System.Globalization.CultureInfo.InvariantCulture)), "");
            return (v.Length > n ? v.Substring(0, n) : v).Trim();
        }
        // wall clock (ms since epoch) for ts / cfg.at; tests replace it
        public static Func<long> NowMs = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public readonly IOnlineGame g;
        public IRoom room;              // lobby namespace (null: offline only)
        public IRoom lobby;             // named room while in a lobby
        public string code;
        public string state = "off";    // off | idle | lobby | racing
        public string via;              // transport name ('ugs', 'loop')
        public List<OnlineLobby> lobbies = new List<OnlineLobby>();
        public List<OnlineMember> members = new List<OnlineMember>();
        public bool isHost, myReady, following, pub = true;
        public string closedMsg = "", lastMap;
        public Dictionary<string, object> cfg;   // host only
        public OnlineView view;                  // the host's cfg as we see it
        public readonly Task<bool> ready;

        readonly List<Action<Online>> listeners = new List<Action<Online>>();
        double seqSeen, joinTs;
        string lobKey, hostPeer;
        bool closing, wantHost;
        Action unsubLobby;

        public Online(IOnlineGame game, Func<Task<IRoom>> connect, string via)
        {
            g = game;
            ready = Init(connect, via);
        }

        async Task<bool> Init(Func<Task<IRoom>> connect, string v)
        {
            try { room = connect != null ? await connect() : null; } catch (Exception) { room = null; }
            via = room != null ? v : null;
            if (room == null) { state = "off"; Changed(); return false; }
            state = "idle";
            room.OnPeers(_ => ReadLobbies());
            room.Presence(Pres.P(("nm", Name()), ("lob", null)));
            Changed();
            return true;
        }

        public bool Available() => room != null;
        public bool Connected() => room != null && room.Connected();
        public Action On(Action<Online> fn) { listeners.Add(fn); return () => listeners.Remove(fn); }
        void Changed() { foreach (var f in listeners.ToArray()) try { f(this); } catch (Exception e) { Log(e); } }
        public static Action<Exception> Log = e => Console.Error.WriteLine(e);

        // ------------------------------------------------------------ clock / timers
        sealed class Timer { public double at; public Action f; }
        readonly List<Timer> timers = new List<Timer>();
        double clock;   // seconds (performance.now() / 1000)
        public double Now => clock;
        void After(double ms, Action f) => timers.Add(new Timer { at = clock + ms / 1000, f = f });
        Task Wait(double ms) { var t = new TaskCompletionSource<bool>(); After(ms, () => t.TrySetResult(true)); return t.Task; }
        static void Fire(Task t) { t.ContinueWith(x => Log(x.Exception), TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously); }

        // call every frame (unscaled dt, seconds)
        public void Update(double dt)
        {
            clock += dt;
            (room as IRoomTick)?.Tick(dt);
            if (lobby != null && !ReferenceEquals(lobby, room)) (lobby as IRoomTick)?.Tick(dt);
            for (int i = 0; i < timers.Count; i++)
            {
                var t = timers[i];
                if (t.at > clock) continue;
                timers.RemoveAt(i--);
                try { t.f(); } catch (Exception e) { Log(e); }
            }
        }

        // ------------------------------------------------------------ name
        public string Name()
        {
            if (string.IsNullOrEmpty(g.nick)) { int n; lock (rng) n = 1000 + rng.Next(9000); g.nick = "DRIVER " + n; }
            return g.nick;
        }
        public void SetName(string n)
        {
            var v = Clean(n).ToUpperInvariant();
            if (v.Length == 0) v = Name();
            g.nick = v;
            room?.Presence(Pres.P(("nm", v)));
            lobby?.Presence(Pres.P(("nm", v)));
            Changed();
        }

        // ------------------------------------------------------------ lobby list
        static readonly Regex CodeRx = new Regex("^[a-z0-9]{4,8}$");
        void ReadLobbies()
        {
            if (room == null) return;
            var outl = new List<OnlineLobby>();
            foreach (var p in room.Peers())
            {
                var l = p.presence != null && p.presence.TryGetValue("lob", out var lo) ? lo as Dictionary<string, object> : null;
                if (l == null || p.sameTab) continue;
                var c = Json.Str(l, "code");
                if (!Truthy(l, "pub") || c == null || !CodeRx.IsMatch(c)) continue;
                var host = Clean(Json.Str(p.presence, "nm"));
                outl.Add(new OnlineLobby { code = c, map = Json.Str(l, "map") ?? "", n = (int)Math.Max(1, Math.Min(MAX_PLAYERS, Json.Num(l, "n", 1) is var x && x != 0 ? x : 1)),
                    st = Json.Str(l, "st") == "race" ? "race" : "open", host = host.Length > 0 ? host : "DRIVER" });
            }
            lobbies = outl;
            Changed();
        }

        static bool Truthy(Dictionary<string, object> d, string k)
        {
            if (d == null || !d.TryGetValue(k, out var v) || v == null) return false;
            return v switch { bool b => b, double x => x != 0 && !double.IsNaN(x), string s => s.Length > 0, _ => true };
        }

        // ------------------------------------------------------------ joining
        // a fresh code nobody has used: every lobby gets its own and it is never reused
        public string NewCode()
        {
            var mine = g.usedCodes ?? new List<string>();
            var used = new HashSet<string>(mine);
            foreach (var l in lobbies) used.Add(l.code);
            string c;
            do c = Rnd(6); while (used.Contains(c));
            var list = new List<string>(mine) { c };
            if (list.Count > 60) list = list.Skip(list.Count - 60).ToList();
            g.usedCodes = list;
            return c;
        }

        public async Task<string> Host(string mapId, bool pub = true)
        {
            var c = NewCode();
            lastMap = mapId; this.pub = pub;
            view = null;
            await Enter(c, true);
            return c;
        }

        public double JoinWaitSeconds => via == "ugs" ? 15 : 1.5;

        public async Task<string> Join(string c)
        {
            c = Regex.Replace((c ?? "").ToLowerInvariant(), "[^a-z0-9]", "");
            if (c.Length < 4) throw new Exception("CODE TOO SHORT");
            view = null; pub = true;
            await Enter(c, false);
            // wait for the others to answer (connections can take several seconds to form)
            double until = clock + JoinWaitSeconds;
            while (clock < until && members.Count <= 1) await Wait(250);
            if (members.Count > MAX_PLAYERS) { await Leave(); throw new Exception("LOBBY IS FULL"); }
            if (members.Count <= 1) { await Leave(); throw new Exception("NO LOBBY WITH THAT CODE"); }
            // one-time lobbies: a code dies once its race has started or the lobby was closed
            var host = members.FirstOrDefault(m => m.host);
            if (host == null) { await Leave(); throw new Exception("NO LOBBY WITH THAT CODE"); }
            var hc = host.cfg;
            if (hc != null && (Truthy(hc, "used") || Truthy(hc, "closed")) && !following) { await Leave(); throw new Exception("THIS CODE HAS EXPIRED"); }
            return c;
        }

        // join the fullest open public lobby, or open a new one
        public async Task<(string code, bool hosted)> Quick(string mapId)
        {
            var open = lobbies.Where(l => l.st == "open" && l.n < MAX_PLAYERS).OrderByDescending(l => l.n).ToList();
            foreach (var l in open)
            {
                try { return (await Join(l.code), false); } catch (Exception) { /* try the next */ }
            }
            return (await Host(mapId, true), true);
        }

        async Task Enter(string c, bool asHost)
        {
            if (room == null) throw new Exception("ONLINE NOT AVAILABLE");
            if (lobby != null) await Leave();
            lobby = room is IRoomCreate rc ? await rc.Join("ord-" + c, asHost) : await room.Join("ord-" + c);
            code = c;
            state = "lobby";
            seqSeen = 0; isHost = false; lobKey = null; hostPeer = null; closing = false; closedMsg = "";
            joinTs = NowMs();
            cfg = null;
            wantHost = asHost;
            var lob = lobby;
            unsubLobby = lobby.OnPeers(_ => { if (lobby == lob) ReadMembers(); });
            After(2700, () => { if (lobby == lob) ReadMembers(); });
            var car = g.selectedCar;
            lobby.Presence(Pres.P(("nm", Name()), ("car", car), ("paint", PaintOfD(car)), ("rdy", 0.0), ("hs", asHost ? 1.0 : 0.0), ("ts", joinTs)));
            ReadMembers();
        }

        public async Task Leave()
        {
            var l = lobby;
            unsubLobby?.Invoke(); unsubLobby = null;
            lobby = null; code = null; cfg = null;
            state = room != null ? "idle" : "off";
            members = new List<OnlineMember>();
            if (l != null) { try { await l.Leave(); } catch (Exception) { } }
            room?.Presence(Pres.P(("lob", null)));
            Changed();
        }

        public void SetCar(string carId) => lobby?.Presence(Pres.P(("car", carId), ("paint", PaintOfD(carId))));
        object PaintOfD(string carId) { try { var c = g.PaintOf(carId); return c.HasValue ? (object)(double)c.Value : null; } catch (Exception) { return null; } }
        public void SetReady(bool b) { lobby?.Presence(Pres.P(("rdy", b ? 1.0 : 0.0))); myReady = b; Changed(); }

        // ------------------------------------------------------------ members / host
        void ReadMembers()
        {
            if (lobby == null) return;
            var ms = new List<OnlineMember>();
            foreach (var p in lobby.Peers())
            {
                var pr = p.presence ?? new Dictionary<string, object>();
                if (!Truthy(pr, "nm") && !p.sameTab) continue;
                var nm = Clean(Json.Str(pr, "nm") ?? "");
                var car = Json.Str(pr, "car") ?? (pr.TryGetValue("car", out var cv) && cv != null ? Convert.ToString(cv, System.Globalization.CultureInfo.InvariantCulture) : "");
                double paint = Json.Num(pr, "paint", double.NaN);
                ms.Add(new OnlineMember { peer = p.peer, me = p.sameTab, name = nm.Length > 0 ? nm : "DRIVER", car = g.CarExists(car) ? car : "kestrel",
                    paint = double.IsNaN(paint) || double.IsInfinity(paint) ? (int?)null : (int)paint, rdy = Truthy(pr, "rdy"), hs = Truthy(pr, "hs"), ts = Json.Num(pr, "ts", 0),
                    cfg = Json.Obj(pr, "cfg"), r = Json.Arr(pr, "r"), guest = p.guest });
            }
            // host: the earliest member claiming it
            // one-time lobbies have exactly one host: nobody takes over when it leaves
            var host = ms.Where(m => m.hs).OrderBy(m => m.ts).ThenBy(m => m.peer, StringComparer.Ordinal).FirstOrDefault();
            foreach (var m in ms) m.host = m == host;
            ms = ms.OrderByDescending(m => m.host ? 1 : 0).ThenBy(m => m.ts).ToList();
            members = ms;
            var me = ms.FirstOrDefault(m => m.me);
            // the host left: this lobby and its code are finished
            if (host != null) hostPeer = host.peer;
            else if (hostPeer != null && !wantHost && !closing && !following && state != "racing") { closing = true; closedMsg = "THE HOST CLOSED THE LOBBY"; Fire(Leave()); return; }
            // the host opened a rematch lobby with a new code: follow it
            var next = host != null && !host.me && host.cfg != null && Truthy(host.cfg, "next") ? Convert.ToString(host.cfg["next"], System.Globalization.CultureInfo.InvariantCulture) : null;
            if (next != null && next != code && !following)
            {
                following = true;
                After(400, () => Fire(FollowTo(next)));
            }
            bool wasHost = isHost;
            isHost = me != null && me.host;
            if (wasHost && !isHost)
            {
                lobby.Presence(Pres.P(("hs", 0.0), ("cfg", null)));
                room?.Presence(Pres.P(("lob", null)));
                lobKey = null; cfg = null;
            }
            if (isHost && !wasHost)
            {
                // took over (or created): keep the last config we saw
                if (cfg == null)
                {
                    if (view != null) { cfg = view.ToCfg(); cfg["go"] = 0.0; }
                    else cfg = Pres.P(("map", lastMap ?? "jp-sakura"), ("laps", 0.0), ("seq", 0.0), ("go", 0.0), ("grid", new List<object>()), ("at", 0.0));
                }
                lobby.Presence(Pres.P(("hs", 1.0), ("cfg", cfg)));
                PushLobby();
            }
            // the host's config is the lobby's
            var hc = host?.cfg;
            if (hc != null)
            {
                var grid = Json.Arr(hc, "grid");
                view = new OnlineView { map = Json.Str(hc, "map") ?? (hc.TryGetValue("map", out var mv) && mv != null ? Convert.ToString(mv, System.Globalization.CultureInfo.InvariantCulture) : ""),
                    laps = (int)Json.Num(hc, "laps", 0), seq = Json.Num(hc, "seq", 0), go = Truthy(hc, "go"),
                    grid = grid != null ? grid.Take(MAX_PLAYERS).Select(x => Convert.ToString(x, System.Globalization.CultureInfo.InvariantCulture)).ToList() : new List<string>(), at = Json.Num(hc, "at", 0) };
                lastMap = view.map;
                if (view.go && view.seq != seqSeen && me != null && view.grid.Contains(me.peer))
                {
                    seqSeen = view.seq;
                    g.OnlineStart(view);
                }
                if (!view.go && state == "racing") state = "lobby";
            }
            if (isHost) PushLobby();
            Changed();
        }

        async Task FollowTo(string next)
        {
            try { await Join(next); following = false; g.OnlineRematch(); }
            catch (Exception e) { following = false; closedMsg = e.Message; Changed(); }
        }

        void PushLobby()
        {
            if (room == null || lobby == null || !isHost) return;
            var map = cfg != null ? Json.Str(cfg, "map") ?? "" : "";
            var st = cfg != null && (Truthy(cfg, "go") || Truthy(cfg, "used") || Truthy(cfg, "closed")) ? "race" : "open";
            int n = members.Count > 0 ? members.Count : 1;
            var key = string.Join("|", code, map, n, st, pub);
            if (key == lobKey) return;
            lobKey = key;
            room.Presence(Pres.P(("lob", Pres.P(("code", code), ("map", map), ("n", (double)n), ("st", st), ("pub", pub)))));
        }

        public void SetMap(string mapId, int laps = 0)
        {
            if (!isHost || cfg == null) return;
            cfg = Pres.Merge(cfg, Pres.P(("map", mapId), ("laps", (double)laps)));
            lobby.Presence(Pres.P(("cfg", cfg)));
            PushLobby();
        }

        // host: everybody in the room right now races
        public bool StartRace()
        {
            if (!isHost || cfg == null) return false;
            var grid = members.Take(MAX_PLAYERS).Select(m => m.peer).ToList();
            lock (rng) for (int i = grid.Count - 1; i > 0; i--) { int j = rng.Next(i + 1); (grid[i], grid[j]) = (grid[j], grid[i]); }
            // `used`: from now on the code no longer lets anyone in
            cfg = Pres.Merge(cfg, Pres.P(("seq", Json.Num(cfg, "seq", 0) + 1), ("go", 1.0), ("used", 1.0), ("grid", grid.Cast<object>().ToList()), ("at", (double)(NowMs() + 9000))));
            lobby.Presence(Pres.P(("cfg", cfg)));
            PushLobby();
            // our own presence change may or may not echo through onPeers: start here
            view = new OnlineView { map = Json.Str(cfg, "map") ?? "", laps = (int)Json.Num(cfg, "laps", 0), seq = Json.Num(cfg, "seq", 0), go = true, grid = grid, at = Json.Num(cfg, "at", 0) };
            seqSeen = view.seq;
            g.OnlineStart(view);
            return true;
        }

        // host: a rematch is a brand-new lobby with a new code; everyone still here follows
        public async Task<string> Rematch()
        {
            if (!isHost || lobby == null) return null;
            var next = NewCode();
            cfg = Pres.Merge(cfg, Pres.P(("next", next), ("closed", 1.0)));
            lobby.Presence(Pres.P(("cfg", cfg)));
            await Wait(900);
            var p = pub;
            view = null;
            pub = p;
            await Enter(next, true);
            return next;
        }

        // invites: the web used `#join-<code>`; here the code plus how to use it (and a deep link)
        public const string DEEP_LINK = "downfall://join-";
        public static string InviteText(string c) =>
            "Race me in DOWNFALL: NO BRAKES — ONLINE › JOIN › code " + (c ?? "").ToUpperInvariant() + "   (or open " + DEEP_LINK + c + ")";
        public string InviteLink() => code != null ? InviteText(code) : null;
        // `#join-CODE`, `?join=CODE`, `downfall://join-CODE`, or the command line `-join CODE`
        public static string ParseInvite(string s)
        {
            if (string.IsNullOrEmpty(s)) return null;
            var m = Regex.Match(s, "join[-=/]([a-z0-9]{4,8})", RegexOptions.IgnoreCase);
            return m.Success ? m.Groups[1].Value.ToLowerInvariant() : null;
        }
        public static string ParseArgs(string[] args)
        {
            if (args == null) return null;
            for (int i = 0; i < args.Length; i++)
            {
                if ((args[i] == "-join" || args[i] == "--join") && i + 1 < args.Length)
                {
                    var c = Regex.Replace(args[i + 1].ToLowerInvariant(), "[^a-z0-9]", "");
                    if (c.Length >= 4 && c.Length <= 8) return c;
                }
                var p = ParseInvite(args[i]);
                if (p != null && args[i].StartsWith("downfall:", StringComparison.OrdinalIgnoreCase)) return p;
            }
            return null;
        }

        public void EndRace()
        {
            if (isHost && cfg != null && Truthy(cfg, "go")) { cfg = Pres.Merge(cfg, Pres.P(("go", 0.0))); lobby?.Presence(Pres.P(("cfg", cfg))); PushLobby(); }
            lobby?.Presence(Pres.P(("r", null), ("rdy", 0.0)));
            myReady = false;
            if (lobby != null) state = "lobby";
            Changed();
        }

        // ------------------------------------------------------------ race-state message
        // r: [seq, x, y, z, qx, qy, qz, qw, vx, vy, vz, progress, finished, finishTime, nitro, steer]
        public static List<object> PackR(double seq, double px, double py, double pz, double qx, double qy, double qz, double qw, double vx, double vy, double vz,
            double progress, bool finished, double finishTime, bool nitro, double steer) =>
            new List<object> { seq, R2(px), R2(py), R2(pz), R3(qx), R3(qy), R3(qz), R3(qw), R2(vx), R2(vy), R2(vz),
                Math.Round(progress * 10, MidpointRounding.AwayFromZero) / 10, finished ? 1.0 : 0.0, R2(finishTime), nitro ? 1.0 : 0.0, R2(steer) };

        public static bool ReadR(object o, double seq, double[] dst)
        {
            if (!(o is List<object> r) || r.Count < 16) return false;
            for (int i = 0; i < 16; i++) { if (!(r[i] is double d) || double.IsNaN(d) || double.IsInfinity(d)) return false; dst[i] = d; }
            return dst[0] == seq;
        }
    }
}

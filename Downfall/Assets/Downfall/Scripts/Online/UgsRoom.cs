// The internet transport: Unity Gaming Services (com.unity.services.multiplayer 1.x Sessions SDK +
// Relay + Netcode for GameObjects 2.x). Compiled only when the asmdef defines DOWNFALL_UGS
// (com.unity.services.multiplayer installed). Not compiled by the offline check — APIs marked
// "UNSURE" are the ones to verify first if Unity reports an error.
//
// Mapping onto the room API online.js expects:
//   lobby room  = a Sessions query. peers() = me + one synthetic peer per public session, whose
//                 presence is { nm, lob: { code, map, n, st, pub } } read from session properties.
//                 Presence({ lob }) from the host writes those properties on its own session.
//   "ord-<code>"= one UGS session (MaxPlayers 8, Relay, NGO started by the Sessions SDK).
//                 Our one-time 6-char code is a public session property indexed as String1;
//                 joiners find the session with QuerySessions(filter String1 == code) and join it by
//                 id. The UGS session code is never shown: the user-facing code stays ours.
//   presence    = JSON over an NGO named message: clients -> server, the server merges and
//                 rebroadcasts to everyone; 'r'-only patches go UnreliableSequenced, the rest
//                 ReliableSequenced (full state fragmented). Full state on connect, and every
//                 client re-sends its own presence every 2.5 s (p2p.js RESEND_MS) so drops heal.
#if DOWNFALL_UGS
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Unity.Collections;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Unity.Services.Multiplayer;
using UnityEngine;

namespace Downfall
{
    public sealed class UgsRoom : IRoom, IRoomCreate, IRoomTick
    {
        const double QUERY_EVERY = 6;

        // sign in and return the lobby room, or null (no Cloud project linked, offline, ...)
        public static async Task<IRoom> Connect()
        {
            try
            {
                var opts = new InitializationOptions();
                // several copies on one machine need their own anonymous player: -ugsprofile <name>
                var args = Environment.GetCommandLineArgs();
                int pi = Array.IndexOf(args, "-ugsprofile");
                if (pi >= 0 && pi + 1 < args.Length) opts.SetProfile(args[pi + 1]);   // UNSURE: AuthenticationExtensions.SetProfile
                await UnityServices.InitializeAsync(opts);
                if (!AuthenticationService.Instance.IsSignedIn) await AuthenticationService.Instance.SignInAnonymouslyAsync();
                EnsureNetworkManager();
                return new UgsRoom(AuthenticationService.Instance.PlayerId);
            }
            catch (Exception e) { Debug.LogWarning("[online] UGS unavailable: " + e.Message); return null; }
        }

        static NetworkManager EnsureNetworkManager()
        {
            var nm = NetworkManager.Singleton;
            if (nm) return nm;
            var go = new GameObject("NetworkManager");
            UnityEngine.Object.DontDestroyOnLoad(go);
            var ut = go.AddComponent<UnityTransport>();
            nm = go.AddComponent<NetworkManager>();
            if (nm.NetworkConfig == null) nm.NetworkConfig = new NetworkConfig();
            nm.NetworkConfig.NetworkTransport = ut;
            nm.NetworkConfig.EnableSceneManagement = false;   // no networked scenes / objects: messages only
            nm.NetworkConfig.ConnectionApproval = false;
            return nm;
        }

        readonly string selfId;
        Dictionary<string, object> mine = new Dictionary<string, object>();
        List<Peer> found = new List<Peer>();
        readonly List<Action<PeersEvent>> listeners = new List<Action<PeersEvent>>();
        bool notify, querying, propsDirty, alive = true;
        double queryT, propsT;
        UgsSessionRoom current;

        UgsRoom(string id) { selfId = id; queryT = 0; }

        public string Name => "lobby";
        public bool Connected() => alive && AuthenticationService.Instance.IsSignedIn;
        public IReadOnlyList<Peer> Peers()
        {
            var l = new List<Peer> { new Peer { peer = selfId, isMe = true, sameTab = true, presence = mine } };
            l.AddRange(found);
            return l;
        }
        public Action OnPeers(Action<PeersEvent> f) { listeners.Add(f); notify = true; return () => listeners.Remove(f); }
        public void Presence(Dictionary<string, object> patch)
        {
            mine = Pres.Merge(mine, patch);
            if (patch.ContainsKey("lob") || patch.ContainsKey("nm")) propsDirty = true;
            notify = true;
        }
        public Task<IRoom> Join(string name) => Join(name, false);

        public async Task<IRoom> Join(string name, bool create)
        {
            if (current != null) { await current.Leave(); current = null; }
            var code = name.StartsWith("ord-") ? name.Substring(4) : name;
            ISession s;
            if (create)
            {
                var o = new SessionOptions
                {
                    Name = name, MaxPlayers = Online.MAX_PLAYERS, IsPrivate = false,   // queryable: our code finds it
                    SessionProperties = new Dictionary<string, SessionProperty>
                    {
                        ["code"] = new SessionProperty(code, VisibilityPropertyOptions.Public, PropertyIndex.String1),   // UNSURE: ctor (value, visibility, index)
                        ["pub"] = new SessionProperty("0", VisibilityPropertyOptions.Public, PropertyIndex.String2),
                        ["nm"] = new SessionProperty(Json.Str(mine, "nm") ?? "DRIVER", VisibilityPropertyOptions.Public),
                        ["map"] = new SessionProperty("", VisibilityPropertyOptions.Public),
                        ["st"] = new SessionProperty("open", VisibilityPropertyOptions.Public),
                    },
                }.WithRelayNetwork();                                                  // UNSURE: extension on SessionOptions (Relay + NGO)
                s = await MultiplayerService.Instance.CreateSessionAsync(o);
                propsDirty = true;
            }
            else
            {
                // the host may still be opening it (rematch): look for a while
                ISessionInfo info = null;
                for (int i = 0; i < 8 && info == null; i++)
                {
                    if (i > 0) await Task.Delay(1500);
                    info = (await Query(code)).FirstOrDefault();
                }
                if (info == null) throw new Exception("NO LOBBY WITH THAT CODE");
                if (info.AvailableSlots <= 0) throw new Exception("LOBBY IS FULL");
                s = await MultiplayerService.Instance.JoinSessionByIdAsync(info.Id, new JoinSessionOptions());
            }
            current = new UgsSessionRoom(this, name, s, selfId);
            current.Start();
            return current;
        }
        internal void Gone(UgsSessionRoom r) { if (current == r) current = null; }

        async Task<IList<ISessionInfo>> Query(string code)
        {
            var q = new QuerySessionsOptions { Count = 50 };
            if (code != null) q.FilterOptions = new List<FilterOption> { new FilterOption(FilterField.StringIndex1, code, FilterOperation.Equal) };   // UNSURE: FilterOption / FilterField names
            else q.FilterOptions = new List<FilterOption> { new FilterOption(FilterField.StringIndex2, "1", FilterOperation.Equal) };
            try
            {
                var res = await MultiplayerService.Instance.QuerySessionsAsync(q);
                return res.Sessions.Where(x => code == null || Prop(x, "code") == code).ToList();
            }
            catch (Exception e) when (!(e is OperationCanceledException))
            {
                // filters not accepted: list everything and filter here
                var res = await MultiplayerService.Instance.QuerySessionsAsync(new QuerySessionsOptions { Count = 100 });
                return res.Sessions.Where(x => code != null ? Prop(x, "code") == code : Prop(x, "pub") == "1").ToList();
            }
        }
        static string Prop(ISessionInfo s, string k) => s.Properties != null && s.Properties.TryGetValue(k, out var p) ? p.Value : null;   // UNSURE: ISessionInfo.Properties

        public void Tick(double dt)
        {
            if (!alive) return;
            queryT -= dt; propsT -= dt;
            // the public lobby list (Lobby query rate limits: keep it slow, one in flight)
            if (queryT <= 0 && !querying && listeners.Count > 0)
            {
                queryT = QUERY_EVERY;
                querying = true;
                Fire(RefreshList());
            }
            // advertise our hosted lobby
            if (propsDirty && propsT <= 0 && current != null && current.session.IsHost)
            {
                propsDirty = false; propsT = 1.5;
                Fire(SaveProps(current.session));
            }
            current?.Tick(dt);
            if (notify)
            {
                notify = false;
                var ev = new PeersEvent { peers = Peers(), joined = Array.Empty<Peer>(), left = Array.Empty<Peer>(), updated = Array.Empty<Peer>() };
                foreach (var f in listeners.ToArray()) try { f(ev); } catch (Exception e) { Debug.LogException(e); }
            }
        }

        async Task RefreshList()
        {
            try
            {
                var list = await Query(null);
                found = list.Where(x => current == null || x.Id != current.session.Id).Select(x => new Peer
                {
                    peer = "s:" + x.Id,
                    presence = Pres.P(("nm", Prop(x, "nm") ?? "DRIVER"), ("lob", Pres.P(("code", Prop(x, "code")), ("map", Prop(x, "map") ?? ""),
                        ("n", (double)Math.Max(1, x.MaxPlayers - x.AvailableSlots)), ("st", Prop(x, "st") ?? "open"), ("pub", Prop(x, "pub") == "1")))),
                }).ToList();
                notify = true;
            }
            catch (Exception e) { Debug.LogWarning("[online] session query failed: " + e.Message); }
            finally { querying = false; }
        }

        async Task SaveProps(ISession s)
        {
            var lob = Json.Obj(mine, "lob");
            var h = s.AsHost();                                                     // UNSURE: ISession.AsHost() -> IHostSession
            h.SetProperty("nm", new SessionProperty(Online.Clean(Json.Str(mine, "nm") ?? "DRIVER"), VisibilityPropertyOptions.Public));
            h.SetProperty("map", new SessionProperty(Json.Str(lob, "map") ?? "", VisibilityPropertyOptions.Public));
            h.SetProperty("st", new SessionProperty(Json.Str(lob, "st") ?? "race", VisibilityPropertyOptions.Public));
            h.SetProperty("pub", new SessionProperty(lob != null && Json.Bool(lob, "pub") ? "1" : "0", VisibilityPropertyOptions.Public, PropertyIndex.String2));
            await h.SavePropertiesAsync();
        }

        public async Task Leave()
        {
            alive = false; listeners.Clear();
            if (current != null) await current.Leave();
        }

        internal static void Fire(Task t) { t.ContinueWith(x => Debug.LogException(x.Exception), TaskContinuationOptions.OnlyOnFaulted); }
    }

    // one session = one named room; presence over NGO named messages
    sealed class UgsSessionRoom : IRoom, IRoomTick
    {
        const string MSG = "ord.pr";
        readonly UgsRoom owner;
        internal readonly ISession session;
        readonly string selfId;
        Dictionary<string, object> mine = new Dictionary<string, object>();
        readonly Dictionary<string, Dictionary<string, object>> others = new Dictionary<string, Dictionary<string, object>>();
        readonly Dictionary<ulong, string> byClient = new Dictionary<ulong, string>();   // server: NGO client id -> peer
        readonly List<Action<PeersEvent>> listeners = new List<Action<PeersEvent>>();
        bool alive = true, notify, wasUp;
        double resendT;
        NetworkManager nm;

        internal UgsSessionRoom(UgsRoom owner, string name, ISession s, string self) { this.owner = owner; Name = name; session = s; selfId = self; }

        public string Name { get; }
        bool Server => nm && nm.IsServer;
        bool Up => nm && nm.IsListening && (nm.IsServer || nm.IsConnectedClient);

        internal void Start()
        {
            nm = NetworkManager.Singleton;
            nm.OnClientConnectedCallback += OnConnected;
            nm.OnClientDisconnectCallback += OnDisconnected;
            Register();
        }
        bool registered;
        void Register()
        {
            // CustomMessagingManager exists once NGO is started (the Sessions SDK starts it)
            if (registered || !nm || nm.CustomMessagingManager == null) return;
            nm.CustomMessagingManager.RegisterNamedMessageHandler(MSG, OnMessage);
            registered = true;
        }

        public bool Connected() => alive && Up;
        public IReadOnlyList<Peer> Peers()
        {
            var l = new List<Peer> { new Peer { peer = selfId, isMe = true, sameTab = true, presence = mine } };
            foreach (var kv in others) l.Add(new Peer { peer = kv.Key, presence = kv.Value });
            return l;
        }
        public Action OnPeers(Action<PeersEvent> f) { listeners.Add(f); notify = true; return () => listeners.Remove(f); }
        public Task<IRoom> Join(string name) => owner.Join(name, false);

        public void Presence(Dictionary<string, object> patch)
        {
            if (!alive) return;
            mine = Pres.Merge(mine, patch);
            notify = true;
            bool onlyR = patch.Count == 1 && patch.ContainsKey("r") && patch["r"] != null;
            Send(Pres.P(("t", "p"), ("id", selfId), ("pr", patch)), onlyR ? NetworkDelivery.UnreliableSequenced : NetworkDelivery.ReliableSequenced);
        }

        // ------------------------------------------------------------ wire
        void Send(Dictionary<string, object> msg, NetworkDelivery how, ulong? to = null, ulong? except = null)
        {
            if (!Up) return;
            Register();
            var s = Json.Write(msg);
            if (s.Length > 600 && how == NetworkDelivery.ReliableSequenced) how = NetworkDelivery.ReliableFragmentedSequenced;
            using (var w = new FastBufferWriter(16 + s.Length * 2, Allocator.Temp, 1 << 17))
            {
                w.WriteValueSafe(s);
                var cmm = nm.CustomMessagingManager;
                if (!Server) { cmm.SendNamedMessage(MSG, NetworkManager.ServerClientId, w, how); return; }
                foreach (var id in nm.ConnectedClientsIds)
                {
                    if (id == nm.LocalClientId || (to.HasValue && id != to.Value) || (except.HasValue && id == except.Value)) continue;
                    cmm.SendNamedMessage(MSG, id, w, how);
                }
            }
        }

        void OnMessage(ulong sender, FastBufferReader reader)
        {
            if (!alive) return;
            reader.ReadValueSafe(out string s);
            if (!(Json.Parse(s) is Dictionary<string, object> m)) return;
            var t = Json.Str(m, "t");
            var id = Json.Str(m, "id");
            if (t == "s")
            {
                // full state from the server
                var all = Json.Obj(m, "all");
                if (all == null) return;
                others.Clear();
                foreach (var kv in all) if (kv.Key != selfId && kv.Value is Dictionary<string, object> pr) others[kv.Key] = pr;
                notify = true;
                return;
            }
            if (id == null || id == selfId) return;
            if (t == "x") { others.Remove(id); notify = true; return; }
            if (t != "p") return;
            var patch = Json.Obj(m, "pr");
            if (patch == null) return;
            others.TryGetValue(id, out var cur);
            others[id] = Json.Bool(m, "f") ? Pres.Merge(null, patch) : Pres.Merge(cur, patch);
            notify = true;
            if (Server)
            {
                byClient[sender] = id;
                bool onlyR = patch.Count == 1 && patch.ContainsKey("r");
                Send(m, onlyR ? NetworkDelivery.UnreliableSequenced : NetworkDelivery.ReliableSequenced, null, sender);
            }
        }

        void OnConnected(ulong clientId)
        {
            if (!alive) return;
            Register();
            if (Server && clientId != nm.LocalClientId) SendFull(clientId);
            else if (!Server && clientId == nm.LocalClientId) ResendMine();
        }
        void OnDisconnected(ulong clientId)
        {
            if (!alive) return;
            if (Server)
            {
                if (byClient.TryGetValue(clientId, out var id)) { byClient.Remove(clientId); others.Remove(id); notify = true; Send(Pres.P(("t", "x"), ("id", id)), NetworkDelivery.ReliableSequenced); }
            }
            else if (clientId == nm.LocalClientId || clientId == NetworkManager.ServerClientId) Dropped();
        }
        // lost the server: everybody else is gone (online.js then sees the host leave)
        void Dropped() { if (others.Count > 0) { others.Clear(); notify = true; } }

        void SendFull(ulong to)
        {
            var all = new Dictionary<string, object> { [selfId] = mine };
            foreach (var kv in others) all[kv.Key] = kv.Value;
            Send(Pres.P(("t", "s"), ("all", all)), NetworkDelivery.ReliableFragmentedSequenced, to);
        }
        void ResendMine() => Send(Pres.P(("t", "p"), ("id", selfId), ("f", true), ("pr", mine)), NetworkDelivery.ReliableFragmentedSequenced);

        public void Tick(double dt)
        {
            if (!alive) return;
            bool up = Up;
            if (up && !wasUp) { Register(); if (!Server) ResendMine(); }
            if (!up && wasUp) Dropped();
            wasUp = up;
            resendT -= dt;
            if (up && resendT <= 0) { resendT = 2.5; ResendMine(); }
            if (notify)
            {
                notify = false;
                var ev = new PeersEvent { peers = Peers(), joined = Array.Empty<Peer>(), left = Array.Empty<Peer>(), updated = Array.Empty<Peer>() };
                foreach (var f in listeners.ToArray()) try { f(ev); } catch (Exception e) { Debug.LogException(e); }
            }
        }

        public async Task Leave()
        {
            if (!alive) return;
            alive = false; listeners.Clear();
            owner.Gone(this);
            if (nm)
            {
                nm.OnClientConnectedCallback -= OnConnected;
                nm.OnClientDisconnectCallback -= OnDisconnected;
                if (registered && nm.CustomMessagingManager != null) nm.CustomMessagingManager.UnregisterNamedMessageHandler(MSG);
            }
            registered = false;
            try
            {
                // one-time lobbies: the host's leaving ends the session (no host migration)
                if (session.IsHost) await session.AsHost().DeleteAsync();          // UNSURE: IHostSession.DeleteAsync
                else await session.LeaveAsync();
            }
            catch (Exception e) { Debug.LogWarning("[online] leave: " + e.Message); }
            if (nm && nm.IsListening) nm.Shutdown();
            for (int i = 0; i < 100 && nm && nm.ShutdownInProgress; i++) await Task.Yield();   // UNSURE: NetworkManager.ShutdownInProgress
        }
    }
}
#endif

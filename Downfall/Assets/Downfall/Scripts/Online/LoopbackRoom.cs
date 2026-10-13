// In-process IRoom: several Online instances in one process share a LoopbackHub (tests, local
// split testing). Same semantics as p2p.js: presence patches merge (null deletes), onPeers fires
// asynchronously (on the next Pump / Tick) and once right after subscribing, peers() includes me.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Downfall
{
    public sealed class LoopbackHub
    {
        int nextId;
        readonly Dictionary<string, List<LoopbackRoom>> rooms = new Dictionary<string, List<LoopbackRoom>>();
        readonly List<(LoopbackRoom room, Action<PeersEvent> f)> queue = new List<(LoopbackRoom, Action<PeersEvent>)>();

        // a new client: its lobby room
        public LoopbackRoom Connect() => Add(new LoopbackRoom(this, "lobby", "peer" + (++nextId)));
        public Task<IRoom> ConnectAsync() => Task.FromResult<IRoom>(Connect());

        internal LoopbackRoom Add(LoopbackRoom r)
        {
            if (!rooms.TryGetValue(r.Name, out var l)) rooms[r.Name] = l = new List<LoopbackRoom>();
            l.Add(r);
            Changed(r.Name);
            return r;
        }
        internal void Remove(LoopbackRoom r)
        {
            if (rooms.TryGetValue(r.Name, out var l)) { l.Remove(r); if (l.Count == 0) rooms.Remove(r.Name); }
            Changed(r.Name);
        }
        internal IEnumerable<LoopbackRoom> Members(string name) => rooms.TryGetValue(name, out var l) ? l : Enumerable.Empty<LoopbackRoom>();
        internal void Changed(string name) { foreach (var m in Members(name)) m.QueueAll(); }
        internal void Queue(LoopbackRoom r, Action<PeersEvent> f) { if (!queue.Any(q => q.room == r && q.f == f)) queue.Add((r, f)); }

        // deliver pending onPeers notifications (repeats until quiet, like a microtask queue)
        public void Pump()
        {
            for (int guard = 0; queue.Count > 0 && guard < 100; guard++)
            {
                var batch = queue.ToArray();
                queue.Clear();
                foreach (var (r, f) in batch)
                {
                    if (!r.alive) continue;
                    try { f(new PeersEvent { peers = r.Peers(), joined = Array.Empty<Peer>(), left = Array.Empty<Peer>(), updated = Array.Empty<Peer>() }); }
                    catch (Exception e) { Online.Log(e); }
                }
            }
        }
    }

    public sealed class LoopbackRoom : IRoom, IRoomTick
    {
        readonly LoopbackHub hub;
        readonly string selfId;
        internal Dictionary<string, object> mine = new Dictionary<string, object>();
        internal bool alive = true;
        readonly List<Action<PeersEvent>> listeners = new List<Action<PeersEvent>>();
        readonly Dictionary<string, LoopbackRoom> sub = new Dictionary<string, LoopbackRoom>();

        internal LoopbackRoom(LoopbackHub hub, string name, string selfId) { this.hub = hub; Name = name; this.selfId = selfId; }

        public string Name { get; }
        public void Presence(Dictionary<string, object> patch)
        {
            if (!alive) return;
            mine = Pres.Merge(mine, patch);
            hub.Changed(Name);
        }
        public IReadOnlyList<Peer> Peers() =>
            hub.Members(Name).Select(m => new Peer { peer = m.selfId, isMe = m == this, sameTab = m == this, presence = m.mine }).ToList();
        public Action OnPeers(Action<PeersEvent> f)
        {
            listeners.Add(f);
            hub.Queue(this, f);
            return () => listeners.Remove(f);
        }
        internal void QueueAll() { foreach (var f in listeners) hub.Queue(this, f); }
        public bool Connected() => alive;
        public Task<IRoom> Join(string name)
        {
            if (sub.TryGetValue(name, out var r) && r.alive) return Task.FromResult<IRoom>(r);
            r = hub.Add(new LoopbackRoom(hub, name, selfId));
            sub[name] = r;
            return Task.FromResult<IRoom>(r);
        }
        public Task Leave()
        {
            if (alive) { alive = false; listeners.Clear(); hub.Remove(this); }
            return Task.CompletedTask;
        }
        public void Tick(double dt) => hub.Pump();
    }
}

// The transport behind Online (online.js): the same small room API the web build used for the
// Claude room capability and p2p.js — presence(), peers(), onPeers(), connected(), join(), leave().
// Presence values are Json-style objects (double / string / bool / List<object> / Dictionary).
// Implementations: LoopbackRoom (in-process, tests), UgsRoom (Unity Gaming Services, internet).
// Engine-agnostic: no UnityEngine here.
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Downfall
{
    public sealed class Peer
    {
        public string peer;
        public bool isMe, sameTab, guest;
        public Dictionary<string, object> presence;
    }

    public sealed class PeersEvent
    {
        public IReadOnlyList<Peer> peers;
        public IReadOnlyList<Peer> joined, left, updated;
    }

    public interface IRoom
    {
        string Name { get; }
        // merge a patch into my presence (a null value deletes the key)
        void Presence(Dictionary<string, object> patch);
        // snapshot of everyone in the room, me included (isMe / sameTab)
        IReadOnlyList<Peer> Peers();
        // f is called (asynchronously) whenever the peers or their presence change, and once right away;
        // returns the unsubscribe
        Action OnPeers(Action<PeersEvent> f);
        bool Connected();
        // a named sub-room ("ord-<code>"); call on the lobby room
        Task<IRoom> Join(string name);
        Task Leave();
    }

    // optional: rooms that need to know whether a named room is being created or looked up
    // (UGS: the host creates the session, a joiner must find an existing one)
    public interface IRoomCreate
    {
        Task<IRoom> Join(string name, bool create);
    }

    // optional: rooms that want the game clock (Online.Update ticks the lobby room and the named room)
    public interface IRoomTick
    {
        void Tick(double dt);
    }

    public static class Pres
    {
        public static Dictionary<string, object> P(params (string k, object v)[] kv)
        {
            var d = new Dictionary<string, object>();
            foreach (var (k, v) in kv) d[k] = v;
            return d;
        }

        // `{ ...a, ...patch }` with null deleting (p2p.js presence merge)
        public static Dictionary<string, object> Merge(Dictionary<string, object> a, Dictionary<string, object> patch)
        {
            var n = a != null ? new Dictionary<string, object>(a) : new Dictionary<string, object>();
            if (patch != null) foreach (var kv in patch) { if (kv.Value == null) n.Remove(kv.Key); else n[kv.Key] = kv.Value; }
            return n;
        }
    }
}

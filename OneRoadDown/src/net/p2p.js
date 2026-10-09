// Public online play without a server of our own: browsers meet through public relays
// (nostr, with BitTorrent trackers as a second path) and then talk directly over WebRTC.
// This file wraps that in the same small interface online.js already uses for the
// Claude room capability: presence(), peers(), onPeers(), join(), connected(), leave().
//
// Used only where the page may open network connections (the public web build).
// Inside a Claude artifact the frame blocks WebRTC and websockets, so online.js keeps
// using the room capability there.

const APP_ID = 'downfall-no-brakes-v1';
const RESEND_MS = 2500; // presence is re-sent now and then so a dropped message heals

export async function createP2P() {
  if (typeof RTCPeerConnection === 'undefined') return null;
  let lib;
  try { lib = await import('../../vendor/trystero.js'); } catch (e) { return null; }
  // tests can point the game at a local relay
  const testRelays = globalThis.__P2P_RELAYS;
  const strategies = (testRelays ? [lib.nostr] : [lib.nostr, lib.torrent]).filter((s) => s && s.joinRoom);
  if (!strategies.length) return null;
  const selfId = strategies[0].selfId;
  const config = testRelays ? { appId: APP_ID, relayUrls: testRelays } : { appId: APP_ID };

  function room(name) {
    // join the same room over every strategy; whichever finds a peer first carries it
    const rs = [];
    for (const st of strategies) {
      try { rs.push(st.joinRoom(config, name)); } catch (e) { /* relay unavailable */ }
    }
    if (!rs.length) return null;
    let mine = {};
    const others = new Map(); // peerId -> frozen presence
    const listeners = new Set();
    const connL = new Set();
    let snap = Object.freeze([]);
    let pending = false, lastSend = 0, sendTimer = 0, alive = true;
    const senders = [];
    const rebuild = () => {
      const arr = [{ peer: selfId, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() }];
      for (const [peer, pr] of others) arr.push({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: pr, updatedAt: Date.now() });
      snap = Object.freeze(arr);
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; for (const f of listeners) try { f({ peers: snap, joined: [], left: [], updated: [] }); } catch (e) { console.error(e); } });
    };
    const sendNow = (to) => { lastSend = performance.now(); for (const s of senders) try { s(mine, to); } catch (e) { /* peer gone */ } };
    for (const r of rs) {
      const [send, get] = r.makeAction('pr');
      senders.push(send);
      get((data, peer) => {
        if (!alive || !data || typeof data !== 'object') return;
        others.set(peer, Object.freeze(data));
        rebuild();
      });
      r.onPeerJoin((peer) => { if (alive) sendNow(peer); for (const f of connL) f(true); });
      r.onPeerLeave((peer) => {
        // a peer reached over several strategies only leaves when none still has it
        if (rs.some((x) => x !== r && Object.keys(x.getPeers()).includes(peer))) return;
        others.delete(peer); rebuild();
      });
    }
    const beat = setInterval(() => { if (alive && performance.now() - lastSend > RESEND_MS) sendNow(); }, 1000);
    rebuild();
    const api = {
      name,
      // merge a patch into my presence; sends are coalesced to at most ~30 per second
      presence: async (patch) => {
        const n = { ...mine };
        for (const k in patch) { if (patch[k] === null) delete n[k]; else n[k] = patch[k]; }
        mine = n;
        rebuild();
        const wait = 33 - (performance.now() - lastSend);
        if (wait <= 0) sendNow();
        else if (!sendTimer) sendTimer = setTimeout(() => { sendTimer = 0; sendNow(); }, wait);
      },
      peers: () => snap,
      onPeers: (f) => { listeners.add(f); queueMicrotask(() => f({ peers: snap, joined: snap, left: [], updated: [] })); return () => listeners.delete(f); },
      connected: () => true,
      onConnection: (f) => { connL.add(f); queueMicrotask(() => f(true)); return () => connL.delete(f); },
      emit: async () => {}, on: () => () => {},
      leave: async () => {
        alive = false; clearInterval(beat); clearTimeout(sendTimer);
        listeners.clear(); connL.clear();
        for (const r of rs) try { r.leave(); } catch (e) { /* already gone */ }
      },
    };
    return api;
  }

  const lobby = room('lobby');
  if (!lobby) return null;
  const rooms = new Map();
  lobby.join = async (n) => {
    if (rooms.has(n)) return rooms.get(n);
    const r = room(n);
    if (!r) throw new Error('COULD NOT REACH THE MATCHMAKING RELAYS');
    const leave = r.leave;
    r.leave = async () => { rooms.delete(n); await leave(); };
    rooms.set(n, r);
    return r;
  };
  lobby.p2p = true;
  addEventListener('beforeunload', () => { lobby.leave(); for (const r of rooms.values()) r.leave(); });
  return lobby;
}

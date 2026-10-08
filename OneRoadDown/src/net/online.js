// Online races over the artifact `room` capability.
//
// Everything travels as presence (no event topics, so every viewer may play):
//   lobby room (everyone on the page):  { nm, lob: { code, map, n, st, pub } | null }   (hosts advertise)
//   named room "ord-<code>":            { nm, car, paint, rdy, hs, ts, cfg?, r? }
//     cfg (host only): { map, laps, seq, go, grid: [peer...], at }
//     r   (racing):    [seq, x, y, z, qx, qy, qz, qw, vx, vy, vz, progress, finished, finishTime, nitro, steer]
// Presence is never authority: the host is simply the earliest member that claims it,
// and every client computes the same answer from the same snapshot.
import { CarModel } from '../models/carModel.js';
import { Vehicle } from '../physics/vehicle.js';
import { computeStats } from '../game/stats.js';
import { carById } from '../data/cars.js';
import { carState } from '../core/save.js';

export const MAX_PLAYERS = 8;
const SEND_HZ = 15, DELAY = 0.12;
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const rnd = (n) => Array.from({ length: n }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clean = (s, n = 16) => String(s || '').replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, n).trim();

export class Online {
  constructor(game) {
    this.g = game;
    this.room = null;           // lobby namespace (null: offline only)
    this.lobby = null;          // NamedRoom while in a lobby
    this.code = null;
    this.state = 'off';         // off | idle | lobby | racing
    this.listeners = new Set();
    this.lobbies = [];
    this.members = [];
    this.remote = new Map();    // peer -> remote entrant
    this.sendT = 0;
    this.seqSeen = 0;
    this.ready = (async () => {
      try {
        const c = window.claude;
        this.room = c && c.use ? await c.use('room') : null;
      } catch (e) { this.room = null; }
      if (!this.room) { this.state = 'off'; this.changed(); return false; }
      this.state = 'idle';
      this.room.onPeers(() => this.readLobbies(), () => { this.room = null; this.state = 'off'; this.changed(); });
      this.room.onConnection(() => this.changed());
      this.room.presence({ nm: this.name(), lob: null }).catch(() => {});
      this.changed();
      return true;
    })();
  }

  available() { return !!this.room; }
  connected() { return !!this.room && this.room.connected(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) try { f(this); } catch (e) { console.error(e); } }

  name() {
    const sv = this.g.save.data;
    if (!sv.nick) { sv.nick = 'DRIVER ' + Math.floor(1000 + Math.random() * 9000); this.g.save.save(); }
    return sv.nick;
  }
  setName(n) {
    const v = clean(n).toUpperCase() || this.name();
    this.g.save.data.nick = v; this.g.save.save();
    this.room?.presence({ nm: v }).catch(() => {});
    this.lobby?.presence({ nm: v }).catch(() => {});
    this.changed();
  }

  // ------------------------------------------------------------ lobby list
  readLobbies() {
    if (!this.room) return;
    const out = [];
    for (const p of this.room.peers()) {
      const l = p.presence && p.presence.lob;
      if (!l || typeof l !== 'object' || p.sameTab) continue;
      if (!l.pub || typeof l.code !== 'string' || !/^[a-z0-9]{4,8}$/.test(l.code)) continue;
      out.push({ code: l.code, map: String(l.map || ''), n: Math.max(1, Math.min(MAX_PLAYERS, +l.n || 1)), st: l.st === 'race' ? 'race' : 'open', host: clean(p.presence.nm) || 'DRIVER' });
    }
    this.lobbies = out;
    this.changed();
  }

  // ------------------------------------------------------------ joining
  async host(mapId, pub = true) {
    const code = rnd(5);
    this.lastMap = mapId; this.pub = pub;
    this.view = null;
    await this.enter(code, true);
    return code;
  }

  async join(code) {
    code = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (code.length < 4) throw new Error('CODE TOO SHORT');
    this.view = null; this.pub = true;
    await this.enter(code, false);
    // wait a moment for the others to answer, then check the size
    await new Promise((r) => setTimeout(r, 1200));
    if (this.members.length > MAX_PLAYERS) { await this.leave(); throw new Error('LOBBY IS FULL'); }
    if (this.members.length <= 1) { await this.leave(); throw new Error('NO LOBBY WITH THAT CODE'); }
    return code;
  }

  // join the fullest open public lobby, or open a new one
  async quick(mapId) {
    const open = this.lobbies.filter((l) => l.st === 'open' && l.n < MAX_PLAYERS).sort((a, b) => b.n - a.n);
    for (const l of open) {
      try { return { code: await this.join(l.code), hosted: false }; } catch (e) { /* try the next */ }
    }
    return { code: await this.host(mapId, true), hosted: true };
  }

  async enter(code, asHost) {
    if (!this.room) throw new Error('ONLINE NOT AVAILABLE');
    if (this.lobby) await this.leave();
    this.lobby = await this.room.join('ord-' + code);
    this.code = code;
    this.state = 'lobby';
    this.seqSeen = 0; this.isHost = false; this.lobKey = null;
    this.joinTs = Date.now();
    this.cfg = null;
    this.wantHost = asHost;
    this.lobby.onPeers(() => this.readMembers(), () => { this.lobby = null; this.state = 'idle'; this.changed(); });
    const lob = this.lobby;
    setTimeout(() => { if (this.lobby === lob) this.readMembers(); }, 2700);
    const car = this.g.save.data.selected;
    await this.lobby.presence({ nm: this.name(), car, paint: this.paintOf(car), rdy: 0, hs: asHost ? 1 : 0, ts: this.joinTs });
    this.readMembers();
  }

  async leave() {
    const l = this.lobby;
    this.lobby = null; this.code = null; this.cfg = null;
    this.state = this.room ? 'idle' : 'off';
    this.members = [];
    if (l) await l.leave().catch(() => {});
    this.room?.presence({ lob: null }).catch(() => {});
    this.changed();
  }

  setCar(carId) {
    this.lobby?.presence({ car: carId, paint: this.paintOf(carId) }).catch(() => {});
  }
  paintOf(carId) {
    try { const c = this.g.paintFor(carById(carId), carState(this.g.save.data, carId)).color; return Number.isFinite(c) ? c : null; } catch (e) { return null; }
  }
  setReady(b) { this.lobby?.presence({ rdy: b ? 1 : 0 }).catch(() => {}); this.myReady = !!b; this.changed(); }

  // ------------------------------------------------------------ members / host
  readMembers() {
    if (!this.lobby) return;
    const ms = [];
    for (const p of this.lobby.peers()) {
      const pr = p.presence || {};
      if (!pr.nm && !p.sameTab) continue;
      ms.push({ peer: p.peer, me: p.sameTab, name: clean(pr.nm) || 'DRIVER', car: carById(String(pr.car || '')) ? String(pr.car) : 'kestrel',
        paint: Number.isFinite(pr.paint) ? pr.paint : null, rdy: !!pr.rdy, hs: !!pr.hs, ts: +pr.ts || 0, cfg: pr.cfg, r: pr.r, guest: p.guest });
    }
    // host: the earliest member claiming it; nobody claims -> the earliest member
    const claim = ms.filter((m) => m.hs).sort((a, b) => a.ts - b.ts || (a.peer < b.peer ? -1 : 1));
    // a fresh joiner waits a moment for the others to answer before it may take over
    const canClaim = this.wantHost || Date.now() - this.joinTs > 2500;
    const host = claim[0] || (canClaim ? [...ms].sort((a, b) => a.ts - b.ts || (a.peer < b.peer ? -1 : 1))[0] : null);
    for (const m of ms) m.host = m === host;
    ms.sort((a, b) => (b.host - a.host) || a.ts - b.ts);
    this.members = ms;
    const me = ms.find((m) => m.me);
    const wasHost = this.isHost;
    this.isHost = !!(me && me.host);
    if (wasHost && !this.isHost) {
      this.lobby.presence({ hs: 0, cfg: null }).catch(() => {});
      this.room?.presence({ lob: null }).catch(() => {});
      this.lobKey = null; this.cfg = null;
    }
    if (this.isHost && !wasHost) {
      // took over (or created): keep the last config we saw
      if (!this.cfg) this.cfg = this.view ? { ...this.view, go: 0 } : { map: this.lastMap || 'jp-sakura', laps: 0, seq: 0, go: 0, grid: [], at: 0 };
      this.lobby.presence({ hs: 1, cfg: this.cfg }).catch(() => {});
      this.pushLobby();
    }
    // the host's config is the lobby's
    const hc = host && host.cfg && typeof host.cfg === 'object' ? host.cfg : null;
    if (hc) {
      this.view = { map: String(hc.map || ''), laps: +hc.laps || 0, seq: +hc.seq || 0, go: !!hc.go, grid: Array.isArray(hc.grid) ? hc.grid.slice(0, MAX_PLAYERS).map(String) : [], at: +hc.at || 0 };
      this.lastMap = this.view.map;
      if (this.view.go && this.view.seq !== this.seqSeen && this.view.grid.includes(me && me.peer)) {
        this.seqSeen = this.view.seq;
        this.g.onlineStart && this.g.onlineStart(this.view);
      }
      if (!this.view.go && this.state === 'racing') this.state = 'lobby';
    }
    if (this.isHost) this.pushLobby();
    this.changed();
  }

  async pushLobby() {
    if (!this.room || !this.lobby || !this.isHost) return;
    const map = (this.cfg && this.cfg.map) || '';
    const st = this.cfg && this.cfg.go ? 'race' : 'open';
    const n = this.members.length || 1;
    const key = [this.code, map, n, st, this.pub].join('|');
    if (key === this.lobKey) return;
    this.lobKey = key;
    this.room.presence({ lob: { code: this.code, map, n, st, pub: this.pub !== false } }).catch(() => {});
  }

  setMap(mapId, laps) {
    if (!this.isHost || !this.cfg) return;
    this.cfg = { ...this.cfg, map: mapId, laps: laps || 0 };
    this.lobby.presence({ cfg: this.cfg }).catch(() => {});
    this.pushLobby();
  }

  // host: everybody in the room right now races
  startRace() {
    if (!this.isHost || !this.cfg) return false;
    const grid = this.members.slice(0, MAX_PLAYERS).map((m) => m.peer).sort(() => Math.random() - 0.5);
    this.cfg = { ...this.cfg, seq: (this.cfg.seq || 0) + 1, go: 1, grid, at: Date.now() + 9000 };
    this.lobby.presence({ cfg: this.cfg }).catch(() => {});
    this.pushLobby();
    // our own presence change may or may not echo through onPeers: start here
    this.view = { ...this.cfg };
    this.seqSeen = this.cfg.seq;
    this.g.onlineStart && this.g.onlineStart(this.view);
    return true;
  }
  endRace() {
    if (this.isHost && this.cfg && this.cfg.go) { this.cfg = { ...this.cfg, go: 0 }; this.lobby?.presence({ cfg: this.cfg }).catch(() => {}); this.pushLobby(); }
    this.lobby?.presence({ r: null, rdy: 0 }).catch(() => {});
    this.myReady = false;
    if (this.lobby) this.state = 'lobby';
    this.changed();
  }

  // ------------------------------------------------------------ the Race's net interface
  // (set as cfg.net when a race starts from a lobby)
  raceIface(view) {
    const self = this;
    const me = this.members.find((m) => m.me);
    const grid = view.grid.filter((p) => this.members.some((m) => m.peer === p));
    if (me && !grid.includes(me.peer)) grid.push(me.peer);
    return {
      online: true,
      startAt: view.at,
      remoteCount: () => grid.length - 1,
      mySlot: () => Math.max(0, grid.indexOf(me.peer)),
      attach: (race, slotPos) => self.attach(race, slotPos, grid, view.seq),
      update: (dt, race) => self.update(dt, race),
      detach: () => self.detach(),
    };
  }

  attach(race, slotPos, grid, seq) {
    this.state = 'racing';
    this.race = race;
    this.raceSeq = seq;
    this.remote.clear();
    const t = race.track, g = this.g;
    grid.forEach((peer, slot) => {
      const m = this.members.find((x) => x.peer === peer);
      if (!m || m.me) return;
      const car = carById(m.car) || carById('kestrel');
      const st = computeStats(car, {}, 'perf');
      const model = new CarModel(car, { tire: 'perf', stats: st, paint: m.paint ?? undefined });
      for (const n of ['interior', 'dash', 'cabin', 'seats', 'steering', 'gauges']) if (model.parts[n]) model.parts[n].visible = false;
      model.bake();
      g.worldScene.add(model.group);
      const v = new Vehicle(t, car, st);
      const p = slotPos(slot);
      v.reset(t.wrapS(p.s), p.d);
      model.group.position.set(v.pos.x, v.pos.y, v.pos.z);
      model.group.quaternion.set(v.q.x, v.q.y, v.q.z, v.q.w);
      const e = race.addRemote({ remote: true, peer, name: m.name, vehicle: v, model, car, stats: st, color: ['#5aa0ff', '#ff6a5a', '#7ad07a', '#d78cff', '#ffd25a', '#5ae0d0', '#ff9a3a'][slot % 7],
        lane: p.d, lastS: t.wrapS(p.s), lap: t.loop && p.s < 0 ? -1 : 0 });
      e.snaps = [];
      this.remote.set(peer, e);
    });
    this.changed();
  }

  update(dt, race) {
    if (!this.lobby) return;
    // send my car
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      const v = race.vehicle, me = race.me;
      const r = [this.raceSeq, r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r3(v.q.x), r3(v.q.y), r3(v.q.z), r3(v.q.w), r2(v.vel.x), r2(v.vel.y), r2(v.vel.z),
        Math.round(me.progress * 10) / 10, me.finished ? 1 : 0, r2(me.finishTime || 0), v.nitroT > 0 ? 1 : 0, r2(v.input.steer || 0)];
      this.lobby.presence({ r }).catch(() => {});
    }
    // read everyone else
    const now = performance.now() / 1000;
    for (const p of this.lobby.peers()) {
      const e = this.remote.get(p.peer);
      if (!e) continue;
      const r = p.presence && p.presence.r;
      if (!Array.isArray(r) || r.length < 16 || r[0] !== this.raceSeq || !r.every(Number.isFinite)) continue;
      if (r !== e.lastR) {
        e.lastR = r;
        e.snaps.push({ t: now, x: r[1], y: r[2], z: r[3], q: [r[4], r[5], r[6], r[7]], vx: r[8], vy: r[9], vz: r[10] });
        if (e.snaps.length > 6) e.snaps.shift();
        e.netProgress = r[11];
        e.netNitro = r[14];
        e.netSteer = r[15];
        if (r[12] && !e.finished) race.remoteFinished(e, r[13]);
        e.seen = now;
      }
    }
    for (const e of this.remote.values()) {
      // the car left the lobby: park it
      if (!this.lobby.peers().some((p) => p.peer === e.peer)) { if (!e.gone) { e.gone = true; e.model.group.visible = false; e.box.hx = e.box.hy = e.box.hz = 0; race.remoteLeft(e); } continue; }
      this.interp(e, now, dt, race);
    }
  }

  interp(e, now, dt, race) {
    const sn = e.snaps;
    if (!sn.length) return;
    const t = now - DELAY;
    let a = sn[0], b = sn[sn.length - 1], f = 1;
    for (let i = 0; i < sn.length - 1; i++) {
      if (sn[i].t <= t && sn[i + 1].t >= t) { a = sn[i]; b = sn[i + 1]; f = (t - a.t) / Math.max(1e-3, b.t - a.t); break; }
    }
    const v = e.vehicle;
    if (t > b.t) {
      // ran out of data: extrapolate a little along the last velocity
      const k = Math.min(0.35, t - b.t);
      v.pos.x = b.x + b.vx * k; v.pos.y = b.y + b.vy * k; v.pos.z = b.z + b.vz * k;
      v.q = { x: b.q[0], y: b.q[1], z: b.q[2], w: b.q[3] };
      v.vel.x = b.vx; v.vel.y = b.vy; v.vel.z = b.vz;
    } else {
      v.pos.x = a.x + (b.x - a.x) * f; v.pos.y = a.y + (b.y - a.y) * f; v.pos.z = a.z + (b.z - a.z) * f;
      v.vel.x = a.vx + (b.vx - a.vx) * f; v.vel.y = a.vy + (b.vy - a.vy) * f; v.vel.z = a.vz + (b.vz - a.vz) * f;
      // nlerp is plenty for 70 ms apart
      let dot = a.q[0] * b.q[0] + a.q[1] * b.q[1] + a.q[2] * b.q[2] + a.q[3] * b.q[3];
      const s = dot < 0 ? -1 : 1;
      const q = [0, 1, 2, 3].map((i) => a.q[i] + (b.q[i] * s - a.q[i]) * f);
      const l = Math.hypot(...q) || 1;
      v.q = { x: q[0] / l, y: q[1] / l, z: q[2] / l, w: q[3] / l };
    }
    v.speed = Math.hypot(v.vel.x, v.vel.y, v.vel.z);
    v.nitroT = e.netNitro ? 1 : 0;
    v.lastQuery = race.track.query(v.pos.x, v.pos.z, e.q || (e.q = {}));
    const m = e.model;
    m.group.position.set(v.pos.x, v.pos.y, v.pos.z);
    m.group.quaternion.set(v.q.x, v.q.y, v.q.z, v.q.w);
    for (const w of m.wheels) {
      w.wg.userData.spin.rotation.x += (v.speed / Math.max(0.2, v.p.r)) * dt;
      w.pivot.rotation.y = w.front ? (e.netSteer || 0) * 0.5 : 0;
    }
  }

  detach() {
    // (the race's clearField removes and disposes the models)
    this.remote.clear();
    this.race = null;
    this.endRace();
  }
}

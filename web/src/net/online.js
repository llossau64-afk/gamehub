// Online co-op: up to three barbers in one shop. Everyone plays their own game (own
// customers, own money, own day) at their own chair; the others appear as barbers walking
// around your shop and working at the extra chairs, with the customer they're cutting and
// that customer's hair as it gets shorter.
//
// Transport: the artifact runtime's `room` capability, presence only (no event topics, so
// Viewers can play too). Each player's presence is one small object:
//   { v, nick, col, st, p:[x,z,yaw], cu:{id, look}|null, hr:[top,front,left,right,back] }
// Everything received is untrusted: numbers are clamped, colours checked, strings capped.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { SPOTS, STATION2, STATION3 } from '../world/shop.js';
import { spawnProp } from '../world/props.js';
import { clamp } from '../core/util.js';
import { joinRelay } from './relay.js';
import { xpFor } from '../world/upgrades.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// all the XP ever earned (level + progress), so XP changes add up across level-ups
function totalXp(s) { let t = s.xp; for (let l = 1; l < s.level; l++) t += xpFor(l); return t; }

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SLOT_COLS = ['#d1a956', '#4aa3df', '#e0455a'];
const SLOTS = [STATION2, STATION3];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PLAYERS = 3;

const BARBER = {
  colors: {
    Skin: '#c48a64', Top: '#2b2f38', Sleeve: '#2b2f38', Pants: '#2b2f38', Shoes: '#1a1410', Hair: '#1f1611', Iris: '#3e3226',
    EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15',
    Metal: '#b9a06a', Button: '#2a2420', MouthDark: '#2a0d0b', Apron: '#2b2f33', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#2b2f38', TopDark: '#1d2026',
  },
  accessories: ['tee', 'apron'],
  scale: 1.0, hunch: 0.02,
  voice: { pitch: 130, rate: 1.05, wobble: 0.08, vol: 0.08 },
};
const SKINS = ['#f1c9a5', '#e2b591', '#c48a64', '#9a6644', '#6e4630', '#d29b77'];

const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const str = (v, n) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} _.\-!?']/gu, '').slice(0, n) : '');

// a customer's look, reduced to safe, known fields
function cleanLook(L) {
  if (!L || typeof L !== 'object') return null;
  const colors = {};
  for (const [k, v] of Object.entries(L.colors || {}).slice(0, 40)) if (/^[A-Za-z]{2,12}$/.test(k) && HEX.test(v)) colors[k] = v;
  const accessories = Array.isArray(L.accessories) ? L.accessories.filter((a) => typeof a === 'string' && /^[a-z]{2,12}$/.test(a)).slice(0, 10) : [];
  return {
    colors, accessories,
    scale: num(L.scale, 0.85, 1.15, 1), width: num(L.width, 0.9, 1.15, 1), hunch: num(L.hunch, 0, 0.3, 0),
    head: Array.isArray(L.head) ? L.head.slice(0, 3).map((x) => num(x, 0.9, 1.1, 1)) : [1, 1, 1],
    hairColor: HEX.test(L.hairColor) ? L.hairColor : '#2a1d15',
    curl: num(L.curl, 0, 1, 0),
    voice: { pitch: 140, rate: 1, wobble: 0.08, vol: 0.08 },
  };
}

function nameTag(text, col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(20,16,12,0.78)';
  x.beginPath(); x.roundRect(8, 10, 240, 44, 22); x.fill();
  x.fillStyle = col; x.beginPath(); x.arc(32, 32, 9, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#f3ead8'; x.font = 'bold 24px sans-serif'; x.textBaseline = 'middle';
  x.fillText(text || 'Barber', 50, 33, 188);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(0.5, 0.125, 1);
  return s;
}

class RemoteBarber {
  constructor(game, peer, slot) {
    this.game = game;
    this.peer = peer;
    this.slot = slot;
    this.state = 'play';
    this.target = V(0, 0, 0);
    this.yaw = 0;
    this.custId = null;
    this.hairKey = '';
    this.nick = '';
    this.col = SLOT_COLS[slot + 1];
    const look = JSON.parse(JSON.stringify(BARBER));
    look.colors.Top = look.colors.Sleeve = look.colors.Lapel = this.col;
    look.colors.Skin = SKINS[(peer.length + slot) % SKINS.length];
    const ch = this.ch = new Character(game.scene, look);
    const hair = new HairSystem({ color: '#1f1611', skin: look.colors.Skin, layers: 8 });
    hair.attach(ch.bones.Head);
    hair.setStyle({ top: 0.3, front: 0.28, left: 0.06, right: 0.06, back: 0.08, fuzz: 0, fade: 0.5 }, 0.3);
    ch.hair = hair;
    ch.onFootstep = (c) => game.footstepAt?.(c.root.position);
    ch.root.visible = false;
    this.placed = false;
    this.clipper = spawnProp('ClipperCheap', { shadows: false });
  }

  setNick(nick) {
    if (nick === this.nick && this.tag) return;
    this.nick = nick;
    if (this.tag) { this.tag.parent?.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    this.tag = nameTag(nick, this.col);
    this.tag.position.set(0, 0.32, 0);
    this.ch.bones.Head.add(this.tag);
  }

  get st() { return SLOTS[this.slot]; }

  // their main chair is your extra chair: positions near their chair are moved to it
  mapPos(x, z) {
    const near = Math.hypot(x - SPOTS.chair.x, z - SPOTS.chair.z) < 1.5 && z < 0.2;
    if (!near) return V(x, 0, z);
    return V(x - SPOTS.chair.x + this.st.chair.x, 0, z - SPOTS.chair.z + this.st.chair.z);
  }

  apply(p) {
    this.setNick(str(p.nick, 16) || `Barber ${this.slot + 2}`);
    this.state = ['play', 'barber', 'menu'].includes(p.st) ? p.st : 'menu';
    if (Array.isArray(p.p)) {
      const x = num(p.p[0], -16, 16), z = num(p.p[1], -3, 18), yaw = num(p.p[2], -20, 20);
      this.target.copy(this.mapPos(x, z));
      this.yaw = yaw;
    }
    // the customer in their chair
    const cu = p.cu && typeof p.cu === 'object' ? p.cu : null;
    const id = cu ? str(String(cu.id ?? ''), 24) : null;
    if (id !== this.custId) {
      this.removeCustomer();
      this.custId = id;
      const look = cu && cleanLook(cu.look);
      if (id && look) this.addCustomer(look);
    }
    if (this.cust && Array.isArray(p.hr) && p.hr.length === 5) {
      const h = p.hr.map((v) => num(v, 0, 1, 0.2));
      const key = h.map((v) => v.toFixed(2)).join(',');
      if (key !== this.hairKey) {
        this.hairKey = key;
        this.cust.hair.setStyle({ top: h[0], front: h[1], left: h[2], right: h[3], back: h[4], fuzz: 0, noise: 0.06 }, 0.42);
      }
    }
  }

  addCustomer(look) {
    const g = this.game;
    const ch = new Character(g.scene, look);
    const hair = new HairSystem({ color: look.hairColor, skin: look.colors.Skin || '#c48a64', layers: Math.max(8, g.quality.hairLayers - 6), curl: look.curl });
    hair.attach(ch.bones.Head);
    hair.setStyle({ top: 0.4, front: 0.4, left: 0.3, right: 0.3, back: 0.3, fuzz: 0 }, 0.42);
    ch.hair = hair;
    ch.sitOn({ pos: this.st.chair.clone().add(V(0, 0, -0.05)), rot: Math.PI, height: g.shop.seatHeight() - 0.03 }, true);
    const cape = spawnProp('Cape');
    ch.bones.Chest.add(cape);
    cape.position.set(0, 0.215, 0.005);
    ch.lookAt(V(this.st.chair.x, 1.2, SPOTS.mirror.z), 0.6);
    this.cust = { ch, hair, color: look.hairColor };
    this.hairKey = '';
  }

  removeCustomer() {
    if (!this.cust) return;
    this.cust.ch.dispose();
    this.cust = null;
  }

  update(dt) {
    const ch = this.ch;
    const show = this.state !== 'menu';
    ch.root.visible = show;
    if (!show) { this.cust && (this.cust.ch.root.visible = false); return; }
    if (this.cust) { this.cust.ch.root.visible = true; this.cust.ch.update(dt); }
    if (!this.placed) { ch.place(this.target, this.yaw + Math.PI); this.placed = true; }
    const pos = ch.root.position;
    const d = Math.hypot(this.target.x - pos.x, this.target.z - pos.z);
    if (d > 4) { ch.place(this.target, this.yaw + Math.PI); }
    else if (d > 0.25) {
      if (!ch.path.length || ch.path[ch.path.length - 1].distanceTo(this.target) > 0.2) ch.walkTo([this.target.clone()], d > 1.2 ? 'speedwalk' : 'walk');
    } else if (!ch.path.length) {
      // standing: face where they look
      const want = this.yaw + Math.PI;
      ch.faceYaw = want;
    }
    // working on their customer
    const cutting = this.state === 'barber' && this.cust;
    if (cutting) {
      if (!this.holding) { ch.hold('R', this.clipper, { pos: [0.012, -0.08, 0.0], rot: [Math.PI / 2, 0, 0] }); this.holding = true; }
      const head = this.cust.ch.headWorld(new THREE.Vector3());
      const t = performance.now() / 1000;
      ch.reach('R', head.clone().add(V(Math.sin(t * 2.3) * 0.07, 0.02 + Math.sin(t * 3.1) * 0.03, Math.cos(t * 1.7) * 0.07)), { speed: 6, hand: 'grip' });
      ch.reach('L', head.clone().add(V(0, 0.12, 0)), { speed: 4, hand: 'open', weight: 0.6 });
      ch.lookAt(head, 1);
      if (Math.random() < dt * 4) this.game.clippings?.spawn(ch.handWorld('R', new THREE.Vector3()), V(0, -1, 0), 1, this.cust.color, 0.2);
    } else if (this.holding) {
      ch.release('R'); ch.release('L'); ch.lookAt(null);
      ch.drop('R', this.game.scene);
      this.clipper.parent?.remove(this.clipper);
      this.holding = false;
    }
    ch.update(dt);
  }

  dispose() {
    this.removeCustomer();
    this.clipper.parent?.remove(this.clipper);
    this.ch.dispose();
  }
}

export class Online {
  constructor(game) {
    this.game = game;
    this.room = null;        // the named room
    this.remotes = new Map(); // peer -> RemoteBarber
    this.sendT = 0;
    this.hairT = 0;
    this.last = {};
    this.available = null;
  }

  get active() { return !!this.room; }

  // the artifact runtime's room: only a fallback for views that can't reach the relay
  async probe() {
    if (this.available !== null) return this.available;
    try {
      if (!window.claude?.use) { this.available = false; return false; }
      this.lobby = await window.claude.use('room');
      this.available = !!this.lobby;
    } catch (e) { this.available = false; }
    return this.available;
  }

  async connect(code) {
    try { return await joinRelay(code); } catch (e) {
      if (!this.lobby) await this.probe();
      if (!this.lobby) throw e;
      return this.lobby.join('barber-' + code.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12));
    }
  }

  // others in the room who are actually playing this game
  othersIn(room) { return room.peers().filter((p) => !p.isMe && p.presence && p.presence.v === 1); }

  // ---- a lobby is one-time: a fresh random code nobody is using, gone when the host leaves
  async createLobby(nick) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const room = await this.connect(code);
      await wait(room.relay ? 1600 : 1200);
      if (room.peers().some((p) => !p.isMe)) { await room.leave().catch(() => {}); continue; }
      this.host = true;
      this.started = false;
      await this.enter(room, code, nick, { host: 1, lobby: 'wait', born: Date.now() });
      return code;
    }
    throw new Error('Couldn’t create a lobby. Try again.');
  }

  async joinLobby(code, nick) {
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) throw new Error('That code is too short.');
    const room = await this.connect(code);
    // the host must be there: an old or made-up code finds nobody
    let host = null;
    for (let t = 0; t < 14 && !host; t++) {
      await wait(250);
      host = this.othersIn(room).find((p) => p.presence.host === 1);
    }
    if (!host) { await room.leave().catch(() => {}); throw new Error('No lobby with this code. It may have been closed — ask your colleague for a new code.'); }
    if (this.othersIn(room).length >= MAX_PLAYERS) { await room.leave().catch(() => {}); throw new Error('This lobby is full (3 barbers).'); }
    this.host = false;
    this.started = false;
    await this.enter(room, code, nick, {});
    return code;
  }

  async enter(room, code, nick, extra) {
    this.code = code;
    this.nick = nick;
    this.room = room;
    this.last = {};
    this.unsub = room.onPeers((ch) => this.onPeers(ch.peers));
    this.teamTs = null;
    await room.presence({ v: 1, nick, pid: this.pid, st: 'menu', p: null, cu: null, hr: null, ...extra }).catch(() => {});
    this.onPeers(room.peers());
  }

  // host: everybody into the shop
  async start() {
    if (!this.room || !this.host) return;
    // the team's shop: the newest save any of us has for exactly this group of people,
    // or a brand-new shop if we've never played together
    const k = this.teamKey();
    const cands = [this.teamTs, ...this.othersIn(this.room).map((p) => p.presence.ts)].filter((t) => t && t.k === k && t.s);
    cands.sort((a, b) => (b.at || 0) - (a.at || 0));
    const team = { k, s: cands[0]?.s || null, seen: {} };
    await this.room.presence({ lobby: 'play', team }).catch(() => {});
    this.started = true;
    this.onStart?.(team);
  }

  // ---- the team: who's playing, and the save we share
  get pid() {
    const st = this.game.settings;
    if (!st.pid) { st.pid = Math.random().toString(36).slice(2, 12); this.game.saveSettings?.(); }
    return st.pid;
  }

  teamKey() {
    const ids = [this.pid, ...(this.room ? this.othersIn(this.room) : []).map((p) => String(p.presence.pid || '').replace(/[^a-z0-9]/g, '').slice(0, 16)).filter(Boolean)];
    return [...new Set(ids)].sort().join('-');
  }

  static slim(save) {
    return {
      money: save.money, xp: save.xp, level: save.level, day: save.day, owned: [...save.owned], equipped: { ...save.equipped },
      served: save.stats.served || 0, fiveStars: save.stats.fiveStars || 0, earned: save.stats.earned || 0, at: save.savedAt || 0,
    };
  }

  static cleanSlim(s) {
    if (!s || typeof s !== 'object') return null;
    const n = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : lo);
    return {
      money: n(s.money, -9999, 9999999), xp: n(s.xp, 0, 1e7), level: n(s.level, 1, 99), day: n(s.day, 1, 99999),
      owned: Array.isArray(s.owned) ? s.owned.filter((x) => typeof x === 'string' && /^[A-Za-z0-9]{2,24}$/.test(x)).slice(0, 80) : [],
      equipped: s.equipped && typeof s.equipped === 'object' ? Object.fromEntries(Object.entries(s.equipped).filter(([k, v]) => /^[a-z]{2,12}$/.test(k) && typeof v === 'string' && /^[A-Za-z0-9]{2,24}$/.test(v))) : {},
      served: n(s.served, 0, 1e7), fiveStars: n(s.fiveStars, 0, 1e7), earned: n(s.earned, 0, 1e9),
    };
  }

  // what the lobby shows: is there a shop we've already built together?
  teamSummary() {
    if (!this.room) return '';
    const k = this.teamKey();
    const others = this.othersIn(this.room);
    if (!others.length) return 'Solo for now — the team shop is saved for whoever plays together.';
    const best = [this.teamTs, ...others.map((p) => p.presence.ts)].filter((t) => t && t.k === k && t.s).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
    const s = best && Online.cleanSlim(best.s);
    return s ? `Your team shop with these barbers: Day ${s.day} · $${s.money} · ${s.owned.length} upgrades` : 'New team shop — your progress together will be saved.';
  }

  // in the lobby: tell the host which save I have for this exact team
  lobbyTeam() {
    const k = this.teamKey();
    if (this.teamTs?.k === k) return;
    const local = this.game.loadTeam(k);
    this.teamTs = { k, at: local?.savedAt || 0, s: local ? Online.slim(local) : null };
    this.room.presence({ ts: this.teamTs }).catch(() => {});
  }

  // ---- shared wallet: every change to money, XP, upgrades or the day becomes an event
  // the others apply. Events ride in presence as a short log so a dropped update is
  // caught by the next one.
  beginTeam(team) {
    const s = this.game.save;
    this.base = { money: s.money, xp: totalXp(s), owned: new Set(s.owned), day: s.day };
    this.seq = 0;
    this.evLog = [];
    // the snapshot says how far it already includes everyone's events (host's view)
    this.seen = new Map();
    if (team?.seen && typeof team.seen === 'object') {
      for (const [k, v] of Object.entries(team.seen).slice(0, 8)) if (/^[A-Za-z0-9_-]{1,40}$/.test(k)) this.seen.set(k, num(v, 0, 1e9));
    }
    this.room?.presence({ ev: [] }).catch(() => {});
  }

  myPeer() { return this.room?.peers().find((p) => p.isMe)?.peer; }

  // the host keeps a full snapshot up to date for anyone joining later
  hostSnapshot() {
    const g = this.game;
    if (!this.host || !g.coopKey) return;
    const seen = Object.fromEntries(this.seen);
    const me = this.myPeer();
    if (me) seen[me] = this.seq;
    this.room.presence({ team: { k: g.coopKey, s: Online.slim(g.save), seen } }).catch(() => {});
  }

  emitChanges() {
    const g = this.game, s = g.save, b = this.base;
    if (!b || !g.coopKey) return;
    const dm = s.money - b.money, dx = totalXp(s) - b.xp;
    const bought = s.owned.filter((id) => !b.owned.has(id));
    const day = s.day > b.day ? s.day : 0;
    if (!dm && !dx && !bought.length && !day) return;
    b.money = s.money; b.xp = totalXp(s); bought.forEach((id) => b.owned.add(id)); b.day = Math.max(b.day, s.day);
    this.evLog.push([++this.seq, dm, dx, bought, day]);
    if (this.evLog.length > 24) this.evLog.shift();
    this.room.presence({ ev: this.evLog }).catch(() => {});
    this.hostSnapshot();
  }

  applyEvents(p) {
    const g = this.game, b = this.base;
    if (!b || !g.coopKey || !Array.isArray(p.presence.ev)) return;
    const evs = p.presence.ev.filter((e) => Array.isArray(e) && typeof e[0] === 'number');
    const top = evs.reduce((m, e) => Math.max(m, e[0]), 0);
    const last = this.seen.get(p.peer) || 0;
    const nick = str(p.presence.nick, 16) || 'Your colleague';
    for (const e of evs.sort((a, c) => a[0] - c[0])) {
      if (e[0] <= last) continue;
      const dm = num(e[1], -1e6, 1e6), dx = num(e[2], 0, 1e6), day = num(e[4], 0, 99999);
      const bought = Array.isArray(e[3]) ? e[3].filter((x) => typeof x === 'string' && /^[A-Za-z0-9]{2,24}$/.test(x)) : [];
      if (dm) { g.save.money += dm; b.money += dm; g.ui.setMoney(g.save.money); if (dm >= 5) g.ui.toast(`+$${Math.round(dm)} from ${nick}`, 'Team'); }
      if (dx) { b.xp += dx; g.addXP(dx); }
      for (const id of bought) {
        if (g.save.owned.includes(id)) continue;
        g.save.owned.push(id); b.owned.add(id);
        g.onTeamUpgrade?.(id, nick);
      }
      if (day > g.save.day) { g.save.day = day; b.day = day; }
    }
    if (top > last) { this.seen.set(p.peer, top); g.persist(); this.hostSnapshot(); }
  }

  get players() {
    return [{ nick: this.nick, col: SLOT_COLS[0], me: true, host: !!this.host },
      ...[...this.remotes.values()].map((r) => ({ nick: r.nick, col: r.col, host: r.isHost }))];
  }

  async leave() {
    const r = this.room;
    this.base = null;
    this.room = null;
    this.host = false;
    this.started = false;
    this.hostSeen = false;
    this.unsub?.();
    for (const rb of this.remotes.values()) rb.dispose();
    this.remotes.clear();
    this.game.ui.setOnline?.(null);
    await r?.leave().catch(() => {});
  }

  // assign the others to the extra chairs in a stable order (by peer id)
  onPeers(peers) {
    if (!this.room) return;
    const others = peers.filter((p) => !p.isMe && p.presence && p.presence.v === 1)
      .sort((a, b) => (a.peer < b.peer ? -1 : 1)).slice(0, MAX_PLAYERS - 1);
    const keep = new Set(others.map((p) => p.peer));
    for (const [id, rb] of this.remotes) if (!keep.has(id)) { rb.dispose(); this.remotes.delete(id); this.game.ui.toast(`${rb.nick || 'A barber'} left`, 'Online'); }
    others.forEach((p, i) => {
      let rb = this.remotes.get(p.peer);
      if (rb && rb.slot !== i) { rb.dispose(); this.remotes.delete(p.peer); rb = null; }
      if (!rb) {
        rb = new RemoteBarber(this.game, p.peer, i);
        this.remotes.set(p.peer, rb);
        this.game.ui.toast(`${str(p.presence.nick, 16) || 'A barber'} joined`, 'Online');
      }
      rb.isHost = p.presence.host === 1;
      rb.apply(p.presence);
    });
    if (!this.started) this.lobbyTeam();
    for (const p of others) this.applyEvents(p);
    if (!this.host) {
      const host = others.find((p) => p.presence.host === 1);
      if (host) this.hostSeen = true;
      // the host left: the lobby (and its code) is gone
      if (!host && this.hostSeen) { this.onClosed?.(); return; }
      if (host?.presence.lobby === 'play' && !this.started && host.presence.team) { this.started = true; this.onStart?.(host.presence.team); }
    }
    this.game.ui.setOnline?.({ code: this.code, players: this.players });
    this.onChange?.();
  }

  // what I tell the others
  update(dt) {
    if (!this.room) return;
    for (const rb of this.remotes.values()) rb.update(dt);
    this.emitT = (this.emitT || 0) - dt;
    if (this.emitT <= 0) { this.emitT = 0.25; this.emitChanges(); }
    const g = this.game;
    this.sendT -= dt; this.hairT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.12;
    const st = g.state === 'menu' || g.state === 'intro' ? 'menu' : g.state === 'barber' ? 'barber' : 'play';
    const P = g.player.pos;
    const patch = {};
    // while cutting, the camera flies around the head: show me standing beside my chair
    const pos = st === 'barber'
      ? [+(SPOTS.chair.x + 0.45).toFixed(2), +(SPOTS.chair.z + 0.45).toFixed(2), 2.4]
      : [+P.x.toFixed(2), +P.z.toFixed(2), +g.player.yaw.toFixed(2)];
    if (st !== this.last.st) patch.st = st;
    if (!this.last.p || Math.abs(pos[0] - this.last.p[0]) + Math.abs(pos[1] - this.last.p[1]) > 0.03 || Math.abs(pos[2] - this.last.p[2]) > 0.05) patch.p = pos;
    const c = g.customers.inChair;
    const seated = c && (c.state === 'seated' || g.state === 'barber') && c.ch.sitW > 0.5 ? c : null;
    const cid = seated ? String(seated.uid ||= Math.random().toString(36).slice(2, 10)) : null;
    if (cid !== this.last.cid) {
      patch.cu = seated ? { id: cid, look: { colors: seated.look.colors, accessories: seated.look.accessories, scale: seated.look.scale, width: seated.look.width, hunch: seated.look.hunch, head: seated.look.head, hairColor: seated.look.hairColor, curl: seated.look.curl } } : null;
      this.last.cid = cid;
      this.last.hr = null;
    }
    if (seated && this.hairT <= 0) {
      this.hairT = 0.6;
      const r = seated.hair.regionStats();
      const hr = ['top', 'front', 'left', 'right', 'back'].map((k) => +(r[k]?.mean ?? 0).toFixed(2));
      if (!this.last.hr || hr.some((v, i) => v !== this.last.hr[i])) { patch.hr = hr; this.last.hr = hr; }
    }
    if (!Object.keys(patch).length) return;
    if (patch.st) this.last.st = patch.st;
    if (patch.p) this.last.p = pos;
    this.room.presence(patch).catch(() => {});
  }
}

export function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

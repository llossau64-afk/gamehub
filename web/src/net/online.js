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

  // can this view go online at all? (null until known)
  async probe() {
    if (this.available !== null) return this.available;
    try {
      if (!window.claude?.use) { this.available = false; return false; }
      this.lobby = await window.claude.use('room');
      this.available = !!this.lobby;
    } catch (e) { this.available = false; }
    // the lobby: everyone who has the game open advertises the shop they're in, so a
    // colleague can join with one click instead of typing the code
    if (this.lobby) {
      this.shops = [];
      this.lobby.onPeers((ch) => {
        const seen = new Map();
        for (const p of ch.peers) {
          if (p.isMe) continue;
          const code = str(p.presence?.shop, 8).toUpperCase();
          if (!code) continue;
          const e = seen.get(code) || { code, nicks: [] };
          e.nicks.push(str(p.presence?.nick, 16) || 'Barber');
          seen.set(code, e);
        }
        this.shops = [...seen.values()];
        this.onShops?.(this.shops);
      }, () => {});
    }
    return this.available;
  }

  async join(code, nick) {
    // the code relay works everywhere and needs no account; the artifact runtime's room
    // (Claude sign-in + invite) is only the fallback when the relay can't be reached
    let room = null, relayErr = null;
    try { room = await joinRelay(code); } catch (e) { relayErr = e; }
    if (!room) {
      if (!this.lobby) await this.probe();
      if (!this.lobby) throw relayErr || new Error('offline');
      room = await this.lobby.join('barber-' + code.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12));
    }
    this.code = code.toUpperCase();
    this.nick = nick;
    // wait a moment for the others to answer, then check the room isn't full
    await new Promise((r) => setTimeout(r, room.relay ? 1800 : 1200));
    const others = room.peers().filter((p) => !p.isMe && p.presence && p.presence.v === 1);
    if (others.length >= MAX_PLAYERS) { await room.leave().catch(() => {}); throw new Error('That shop is full (3 barbers).'); }
    this.room = room;
    this.unsub = room.onPeers((ch) => this.onPeers(ch.peers));
    await room.presence({ v: 1, nick, st: 'menu', p: null, cu: null, hr: null }).catch(() => {});
    this.onPeers(room.peers());
    this.lobby?.presence({ shop: this.code, nick }).catch(() => {});
    return this.code;
  }

  async leave() {
    const r = this.room;
    this.room = null;
    this.unsub?.();
    for (const rb of this.remotes.values()) rb.dispose();
    this.remotes.clear();
    this.game.ui.setOnline?.(null);
    this.lobby?.presence({ shop: null }).catch(() => {});
    await r?.leave().catch(() => {});
  }

  // assign the others to the extra chairs in a stable order (by peer id)
  onPeers(peers) {
    if (!this.room) return;
    const others = peers.filter((p) => !p.isMe && p.presence && p.presence.v === 1)
      .sort((a, b) => (a.peer < b.peer ? -1 : 1)).slice(0, MAX_PLAYERS - 1);
    const keep = new Set(others.map((p) => p.peer));
    for (const [id, rb] of this.remotes) if (!keep.has(id)) { rb.dispose(); this.remotes.delete(id); this.game.ui.toast(`${rb.nick || 'A barber'} left the shop`, 'Online'); }
    others.forEach((p, i) => {
      let rb = this.remotes.get(p.peer);
      if (rb && rb.slot !== i) { rb.dispose(); this.remotes.delete(p.peer); rb = null; }
      if (!rb) {
        rb = new RemoteBarber(this.game, p.peer, i);
        this.remotes.set(p.peer, rb);
        if (this.game.state !== 'menu') this.game.ui.toast(`${str(p.presence.nick, 16) || 'A barber'} joined the shop`, 'Online');
      }
      rb.apply(p.presence);
    });
    this.game.ui.setOnline?.({ code: this.code, players: [{ nick: this.nick, col: SLOT_COLS[0], me: true }, ...[...this.remotes.values()].map((r) => ({ nick: r.nick, col: r.col }))] });
  }

  // what I tell the others
  update(dt) {
    if (!this.room) return;
    for (const rb of this.remotes.values()) rb.update(dt);
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

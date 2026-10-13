// Player accounts without e-mail: a username and a password, nothing else.
//
// There is no server of our own, so accounts live where online play already lives: retained
// messages on the public MQTT brokers (the same ones the co-op uses, reachable from the
// artifact, GitHub Pages and the Mac app alike).
//   acc1/u/<name>          the account record   { v, u, salt, iv, ct, at }
//   acc1/r/<to>/<from>     a friend request      { from, at }      (retained until handled)
//   acc1/p/<name>          presence              { at, lvl, lobby } (refreshed while online)
// The password never leaves the device: PBKDF2 turns it into an AES-GCM key, and everything
// private (friends, saved games) is encrypted with it before it goes out. Logging in means
// "can you decrypt your record". A copy of the record is kept locally and re-published on
// every login, so the account survives a broker that forgets its retained messages.
import { Mqtt, BROKERS } from './relay.js';

const ROOT = 'barberempire/acc1/';
const MAX = 120000;
const NAME_RE = /^[a-z0-9]{3,15}$/;
const enc = new TextEncoder(), dec = new TextDecoder();

const b64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* */ } },
};

// plain JSON (streams-based compression stalled while the game boots in some browsers)
async function pack(obj) {
  return { z: 0, bytes: enc.encode(JSON.stringify(obj)) };
}
async function unpack(bytes, z) {
  if (!z) return JSON.parse(dec.decode(bytes));
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(dec.decode(await new Response(ds).arrayBuffer()));
}
async function deriveKey(name, password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('barberempire:' + name + ':' + salt), iterations: 150000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export const cleanName = (s) => String(s || '').trim().toLowerCase();
export const nameError = (n) => (NAME_RE.test(n) ? '' : 'Usernames are 3–15 letters or digits (a–z, 0–9).');

class AccountService {
  constructor() {
    this.user = null;
    this.key = null;
    this.data = null;          // { friends: [], teams: {}, save, savedAt }
    this.conns = [];
    this.handlers = new Map(); // topic filter -> fn(topic, msg)
    this.requests = new Map(); // from -> at
    this.presence = new Map(); // friend -> { at, lvl, lobby }
    this.listeners = new Set();
    this.lobby = null;
  }

  get loggedIn() { return !!this.user; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- transport
  async connect() {
    if (this.conns.length) return true;
    if (this._connecting) return this._connecting;
    const override = new URLSearchParams(location.search).get('relay');
    const urls = override ? [override] : BROKERS;
    this._connecting = (async () => {
      const id = 'ba-' + Math.random().toString(36).slice(2, 10);
      const res = await Promise.allSettled(urls.map(async (u) => { const m = new Mqtt(u, MAX); await m.connect(id + u.length); return m; }));
      this.conns = res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      for (const m of this.conns) {
        m.onMessage = (t, txt) => this.dispatch(t, txt);
        m.onClose = () => { this.conns = this.conns.filter((x) => x !== m); };
        for (const f of this.handlers.keys()) m.subscribe(f);
      }
      this._connecting = null;
      return this.conns.length > 0;
    })();
    return this._connecting;
  }

  dispatch(topic, txt) {
    let msg = null;
    if (txt) { try { msg = JSON.parse(txt); } catch (e) { return; } }
    for (const [f, fn] of this.handlers) if (match(f, topic)) fn(topic, msg);
  }

  sub(filter, fn) { this.handlers.set(filter, fn); for (const m of this.conns) m.subscribe(filter); }
  unsub(filter) { this.handlers.delete(filter); for (const m of this.conns) m.unsubscribe(filter); }
  put(topic, obj) { const s = obj ? JSON.stringify(obj) : ''; for (const m of this.conns) m.publish(ROOT + topic, s, true); }

  // the newest retained message on a topic from any broker (null if nobody has one)
  async fetch(topic, wait = 2200) {
    if (!(await this.connect())) throw new Error('offline');
    const full = ROOT + topic;
    let best = null;
    this.sub(full, (t, msg) => { if (msg && (!best || (msg.at || 0) > (best.at || 0))) best = msg; });
    await new Promise((r) => setTimeout(r, wait));
    this.unsub(full);
    return best;
  }

  // ---------------------------------------------------------------- records
  async seal(name, key, salt, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const { z, bytes } = await pack(data);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { v: 1, u: name, salt, z, iv: b64(iv), ct: b64(ct), at: Date.now() };
  }

  async open(rec, key) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct));
    return unpack(new Uint8Array(pt), rec.z);
  }

  async register(nameIn, password) {
    const name = cleanName(nameIn);
    const err = nameError(name);
    if (err) throw new Error(err);
    if (String(password).length < 6) throw new Error('Pick a password with at least 6 characters.');
    let existing;
    try { existing = await this.fetch('u/' + name); } catch (e) { throw new Error('Can’t reach the account server. Check your connection.'); }
    if (existing || store.get('acc:rec:' + name)) throw new Error('That username is taken.');
    const salt = b64(crypto.getRandomValues(new Uint8Array(12)));
    const key = await deriveKey(name, password, salt);
    this.salt = salt;
    await this.begin(name, key, { friends: [], teams: {}, save: null, savedAt: 0, created: Date.now() });
    await this.flush();
  }

  async login(nameIn, password, remember = true) {
    const name = cleanName(nameIn);
    if (nameError(name)) throw new Error('No account with that name.');
    let rec = null;
    try { rec = await this.fetch('u/' + name); } catch (e) { /* offline: try the local copy */ }
    const local = store.get('acc:rec:' + name);
    if (!rec || (local && (local.at || 0) > (rec.at || 0))) rec = local || rec;
    if (!rec || !rec.salt) throw new Error('No account with that name.');
    const key = await deriveKey(name, password, rec.salt);
    let data;
    try { data = await this.open(rec, key); } catch (e) { throw new Error('Wrong password.'); }
    this.salt = rec.salt;
    await this.begin(name, key, data, rec);
    this.put('u/' + name, rec);                                      // self-heal on every login
    if (remember) store.set('acc:session', { u: name, salt: rec.salt, k: b64(await crypto.subtle.exportKey('raw', key)) });
  }

  // remembered on this device: log back in without the password
  async resume() {
    const s = store.get('acc:session');
    if (!s?.u || !s.k) return false;
    try {
      const key = await crypto.subtle.importKey('raw', unb64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
      const local = store.get('acc:rec:' + s.u);
      // the local copy signs you in at once; the network copy (another device may have
      // saved since) is checked right after
      if (local) {
        const data = await this.open(local, key);
        this.salt = local.salt;
        await this.begin(s.u, key, data, null);
      }
      let rec = null;
      try { rec = await this.fetch('u/' + s.u, 1800); } catch (e) { /* offline */ }
      if (rec && (!local || (rec.at || 0) > (local.at || 0))) {
        const data = await this.open(rec, key);
        this.salt = rec.salt;
        store.set('acc:rec:' + s.u, rec);
        if (this.user === s.u) { this.data = { friends: [], teams: {}, save: null, savedAt: 0, ...data }; for (const f of this.data.friends) this.watch(f); this.emit(); }
        else await this.begin(s.u, key, data, rec);
      } else if (local) this.put('u/' + s.u, local);                 // self-heal: the broker may have forgotten it
      return !!this.user;
    } catch (e) { return !!this.user; }
  }

  async begin(name, key, data, rec = null) {
    this.user = name;
    this.key = key;
    this.data = { friends: [], teams: {}, save: null, savedAt: 0, ...data };
    this.data.friends = (this.data.friends || []).filter((f) => NAME_RE.test(f)).slice(0, 50);
    if (rec) store.set('acc:rec:' + name, rec);
    this.requests.clear(); this.presence.clear();
    this.connect().then(() => this.ping()).catch(() => false);      // subscriptions below go out once connected
    this.sub(ROOT + 'r/' + name + '/+', (t, msg) => {
      const from = t.split('/').pop();
      if (msg && NAME_RE.test(from) && !this.data.friends.includes(from)) this.requests.set(from, msg.at || 0);
      else this.requests.delete(from);
      this.emit();
    });
    for (const f of this.data.friends) this.watch(f);
    clearInterval(this.beat);
    this.beat = setInterval(() => this.ping(), 25000);
    this.ping();
    this.emit();
  }

  logout() {
    if (!this.user) return;
    this.put('p/' + this.user, { at: 0 });
    for (const f of this.handlers.keys()) this.unsub(f);
    clearInterval(this.beat);
    store.del('acc:session');
    this.user = null; this.key = null; this.data = null;
    this.requests.clear(); this.presence.clear();
    this.emit();
  }

  // encrypted record out (debounced by the callers)
  async flush() {
    if (!this.user || !this.key) return;
    const rec = await this.seal(this.user, this.key, this.salt, this.data);
    store.set('acc:rec:' + this.user, rec);
    if (!this.conns.length) await this.connect().catch(() => false);
    this.put('u/' + this.user, rec);
  }

  save(delay = 4000) {
    if (!this.user) return;
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.flush().catch((e) => console.warn('account save failed', e)), delay);
  }

  // ---------------------------------------------------------------- friends
  watch(f) {
    this.sub(ROOT + 'p/' + f, (t, msg) => { if (msg) this.presence.set(f, msg); this.emit(); });
  }

  online(f) { const p = this.presence.get(f); return !!p && Date.now() - (p.at || 0) < 75000; }

  async addFriend(nameIn) {
    const name = cleanName(nameIn);
    if (!this.user) throw new Error('Sign in first.');
    if (name === this.user) throw new Error('That’s you.');
    if (nameError(name)) throw new Error('No player with that name.');
    if (this.data.friends.includes(name)) throw new Error(`${name} is already your friend.`);
    const rec = await this.fetch('u/' + name).catch(() => null);
    if (!rec) throw new Error(`No player called “${name}”.`);
    this.data.friends.push(name);
    this.requests.delete(name);
    this.put('r/' + this.user + '/' + name, null);          // their request to me is handled
    this.put('r/' + name + '/' + this.user, { from: this.user, at: Date.now() });
    this.watch(name);
    await this.flush();
    this.emit();
  }

  dismiss(from) { this.requests.delete(from); this.put('r/' + this.user + '/' + from, null); this.emit(); }

  removeFriend(name) {
    this.data.friends = this.data.friends.filter((f) => f !== name);
    this.unsub(ROOT + 'p/' + name);
    this.presence.delete(name);
    this.save(0);
    this.emit();
  }

  // presence: online, my level, and a lobby code when I'm hosting or waiting in one
  ping() {
    if (!this.user) return;
    this.put('p/' + this.user, { at: Date.now(), lvl: this.level || 1, lobby: this.lobby || null });
  }

  setLobby(code) { if (this.lobby === code) return; this.lobby = code; this.ping(); }

  // ---------------------------------------------------------------- saves
  saveSolo(save) {
    if (!this.user) return;
    this.data.save = save; this.data.savedAt = Date.now();
    this.save(8000);
  }

  saveTeam(k, slim, members) {
    if (!this.user || !k) return;
    const t = this.data.teams || (this.data.teams = {});
    t[k] = { members: members.filter((m) => NAME_RE.test(m)), s: slim, at: Date.now() };
    const keys = Object.keys(t).sort((a, b) => (t[b].at || 0) - (t[a].at || 0));
    for (const old of keys.slice(12)) delete t[old];
    this.save(6000);
  }

  team(k) { return this.data?.teams?.[k] || null; }

  teams() { return Object.entries(this.data?.teams || {}).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.at - a.at); }
}

// MQTT topic filter match (+ one level, # the rest)
function match(filter, topic) {
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

export const account = new AccountService();

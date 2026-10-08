// Versioned, defensive save system. Writes to localStorage with a rolling backup
// and mirrors to the portal's cloud data module when one is available.

import { defaultLevels } from '../game/stats.js';
import { CARS } from '../data/cars.js';

const KEY = 'oneroaddown.save.v1';
const BAK = 'oneroaddown.save.v1.bak';
export const SAVE_VERSION = 1;

export function freshSave() {
  return {
    version: SAVE_VERSION,
    created: Date.now(),
    firstStartDone: false,
    cash: 0,
    totalEarned: 0,
    owned: [],
    selected: null,
    cars: {}, // id -> { levels, tire, paint, finish }
    garageLevel: 1,
    best: { m1: 0, m2: 0 },
    mountain: 'm1',
    unlocked: ['m1'],
    completed: [],
    achievements: {},
    stats: { runs: 0, upgrades: 0, distance: 0, shortcuts: 0, topSpeed: 0, crashes: 0, cashCollected: 0 },
    settings: { master: 0.8, music: 0.5, sfx: 0.85, quality: 'auto', camera: 'chase', assist: true, units: 'kmh', showFps: false, shake: 1, touchLayout: 'buttons' },
  };
}

export function carState(save, id) {
  if (!save.cars[id]) save.cars[id] = { levels: defaultLevels(), tire: 'worn', paint: 'factory', paints: ['factory'] };
  const c = save.cars[id];
  c.levels = { ...defaultLevels(), ...(c.levels || {}) };
  if (!c.paints) c.paints = ['factory'];
  return c;
}

function storage() {
  try { const t = '__ord_t'; window.localStorage.setItem(t, '1'); window.localStorage.removeItem(t); return window.localStorage; } catch (e) { return null; }
}

function validate(s) {
  if (!s || typeof s !== 'object') return null;
  const f = freshSave();
  const out = { ...f, ...s };
  out.settings = { ...f.settings, ...(s.settings || {}) };
  out.stats = { ...f.stats, ...(s.stats || {}) };
  out.best = { ...f.best, ...(s.best || {}) };
  out.owned = Array.isArray(s.owned) ? s.owned.filter((id) => CARS.some((c) => c.id === id)) : [];
  out.cars = s.cars && typeof s.cars === 'object' ? s.cars : {};
  out.unlocked = Array.isArray(s.unlocked) && s.unlocked.length ? s.unlocked : ['m1'];
  out.completed = Array.isArray(s.completed) ? s.completed : [];
  out.achievements = s.achievements && typeof s.achievements === 'object' ? s.achievements : {};
  if (!Number.isFinite(out.cash) || out.cash < 0) out.cash = 0;
  out.garageLevel = Math.min(5, Math.max(1, out.garageLevel | 0));
  if (out.selected && !out.owned.includes(out.selected)) out.selected = out.owned[0] || null;
  if (!out.firstStartDone && out.owned.length) out.firstStartDone = true;
  for (const id of out.owned) carState(out, id);
  return out;
}

export class SaveManager {
  constructor() {
    this.ls = storage();
    this.data = this.load();
    this.dirty = false;
    this.portal = null;
    window.addEventListener('beforeunload', () => this.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    setInterval(() => this.flush(), 4000);
  }
  load() {
    const tryParse = (k) => { try { const r = this.ls && this.ls.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
    return validate(tryParse(KEY)) || validate(tryParse(BAK)) || freshSave();
  }
  // optional cloud copy (CrazyGames data module): prefer it if it is newer
  attachPortal(portal) {
    this.portal = portal;
    try {
      const raw = portal && portal.getItem(KEY);
      if (raw) {
        const remote = validate(JSON.parse(raw));
        if (remote && (remote.totalEarned || 0) >= (this.data.totalEarned || 0)) this.data = remote;
      }
    } catch (e) { /* ignore broken remote saves */ }
  }
  save() { this.dirty = true; }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const json = JSON.stringify(this.data);
    try {
      if (this.ls) {
        const prev = this.ls.getItem(KEY);
        if (prev) this.ls.setItem(BAK, prev);
        this.ls.setItem(KEY, json);
      }
    } catch (e) { /* storage full or blocked: keep running */ }
    try { if (this.portal) this.portal.setItem(KEY, json); } catch (e) { /* ignore */ }
  }
  reset() {
    this.data = freshSave();
    this.dirty = true;
    this.flush();
  }
}

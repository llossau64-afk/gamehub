// Local JSON save in localStorage. Survives browser restarts; tolerant of blocked storage.

const KEY = 'onemorefloor.save.v1';

const DEFAULTS = () => ({
  version: 1,
  coins: 0,          // spendable bank
  totalCoins: 0,     // lifetime
  bestFloor: 0,
  totalKills: 0,
  runs: 0,
  xp: 0,
  bossesKilled: { warden: 0, crusher: 0, hunter: 0 },
  perm: { power: 0, vitality: 0, reflex: 0, greed: 0, fortune: 0 },
  skins: ['default'],
  skin: 'default',
  achievements: [],
  discovered: [],
  settings: { master: 0.8, music: 0.6, sfx: 0.9, shake: 1, numbers: true, quality: 'auto' },
});

function merge(base, data) {
  for (const k in data) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && data[k] && typeof data[k] === 'object') merge(base[k], data[k]);
    else if (k in base) base[k] = data[k];
  }
  return base;
}

export const save = {
  data: DEFAULTS(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(DEFAULTS(), JSON.parse(raw));
    } catch (e) { this.data = DEFAULTS(); }
    return this.data;
  },
  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked: keep playing */ }
  },
  reset() {
    const settings = this.data.settings;
    this.data = DEFAULTS();
    this.data.settings = settings;
    this.write();
  },
};

// XP curve: level n needs 120 * n^1.35 xp to reach n+1.
export function levelFromXp(xp) {
  let level = 1, need = 120;
  while (xp >= need) { xp -= need; level++; need = Math.round(120 * Math.pow(level, 1.35)); }
  return { level, into: xp, need };
}

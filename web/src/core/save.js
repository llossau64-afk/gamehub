// Versioned save data, autosaved after every meaningful change.
import { platform } from '../platform/platform.js';

const KEY = 'save';
const SETTINGS_KEY = 'settings';
const VERSION = 1;

export function defaultSave() {
  return {
    version: VERSION,
    started: false,
    introSeen: false,
    tutorialDone: false,
    money: 0,
    xp: 0,
    level: 1,
    day: 1,
    reputation: 50,
    owned: [],                 // upgrade ids
    equipped: { clipper: 'clipperRusty', scissors: 'scissorsBasic' },
    stats: { served: 0, perfect: 0, fiveStars: 0, earned: 0, tips: 0, streak: 0, bestStreak: 0, lost: 0 },
    achievements: [],
    playTime: 0,
  };
}

export function defaultSettings() {
  return {
    master: 0.9, music: 0.6, sfx: 0.9, amb: 0.7, voice: 0.85,
    quality: 'auto', sensitivity: 1, invertY: false, subtitles: true, reduceMotion: false,
  };
}

export const store = {
  data: defaultSave(),
  settings: defaultSettings(),

  load() {
    try {
      const raw = platform.load(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = migrate(Object.assign(defaultSave(), d));
        this.data.stats = Object.assign(defaultSave().stats, d.stats || {});
        this.data.equipped = Object.assign(defaultSave().equipped, d.equipped || {});
      }
    } catch (e) { this.data = defaultSave(); }
    try {
      const rs = platform.load(SETTINGS_KEY);
      if (rs) this.settings = Object.assign(defaultSettings(), JSON.parse(rs));
    } catch (e) { /* defaults */ }
    return this.data;
  },

  save() {
    try { platform.save(KEY, JSON.stringify(this.data)); } catch (e) { /* storage blocked: keep playing */ }
  },

  saveSettings() {
    try { platform.save(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (e) { /* */ }
  },

  reset() {
    const introSeen = this.data.introSeen;
    this.data = defaultSave();
    this.data.introSeen = introSeen;
    this.save();
  },

  wipe() {
    this.data = defaultSave();
    platform.remove(KEY);
  },

  get hasProgress() { return this.data.started; },
};

function migrate(d) {
  d.version = VERSION;
  return d;
}

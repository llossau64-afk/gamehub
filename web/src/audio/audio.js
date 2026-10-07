// All sound is synthesised with WebAudio at runtime: no audio downloads, every
// sound tuned to the same warm, slightly lo-fi palette.
import { rand, pick, clamp } from '../core/util.js';

const clamp01 = (v) => Math.max(0, Math.min(0.35, v));

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.9, sfx: 0.9, music: 0.55, amb: 0.7, voice: 0.85, ui: 0.8 };
    this.muted = false;
    this._loops = new Map();
    this.unlocked = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.bus = {};
    for (const k of ['sfx', 'music', 'amb', 'voice', 'ui']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.bus[k] = g;
    }
    // small room reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.1, 2.6);
    this.revIn = ctx.createGain();
    this.revIn.gain.value = 0.32;
    this.revIn.connect(this.reverb).connect(this.bus.sfx);
    this.noise = this._noiseBuffer(2.0, 'white');
    this.brown = this._noiseBuffer(4.0, 'brown');
    this.applyVolumes();
  }

  unlock() {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    for (const k of Object.keys(this.bus)) this.bus[k].gain.setTargetAtTime(this.vol[k] ?? 1, t, 0.05);
  }
  setMuted(m) { this.muted = m; this.applyVolumes(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  _noiseBuffer(sec, kind) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // early reflections then a smooth tail
        const er = i < ctx.sampleRate * 0.03 && Math.random() < 0.02 ? 1 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + er * 0.5) * 0.5;
      }
    }
    return b;
  }

  // ------------------------------------------------------------------ primitives
  _out(bus = 'sfx', room = 0, pan = 0) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p); node = p;
    }
    node.connect(this.bus[bus]);
    if (room > 0) {
      const s = ctx.createGain();
      s.gain.value = room;
      g.connect(s).connect(this.revIn);
    }
    return g;
  }

  _env(g, t, a, peak, dec, sustain = 0, rel = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    if (rel) {
      g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0002), t + a + dec);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    }
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, bus = 'sfx', room = 0.1, when = 0, pan = 0,
    slide = 0, detune = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    o.detune.value = detune;
    const g = this._out(bus, room, pan);
    o.connect(g);
    this._env(g, t, attack, vol, dur);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }

  noiseBurst(dur, { vol = 0.3, type = 'bandpass', freq = 2000, q = 1, attack = 0.002, bus = 'sfx', room = 0.1,
    when = 0, sweep = 0, pan = 0, brown = false } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = this._out(bus, room, pan);
    s.connect(f).connect(g);
    this._env(g, t, attack, vol, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
  }

  // inharmonic metallic partials (bells, keys, coins)
  metal(f0, dur, ratios, { vol = 0.2, when = 0, room = 0.25, bus = 'sfx', pan = 0 } = {}) {
    for (let i = 0; i < ratios.length; i++) {
      if (f0 * ratios[i] > 16000) continue;
      this.tone(f0 * ratios[i], dur * (1 - i * 0.12), { vol: vol / (1 + i * 0.7), when, room, bus, pan, attack: 0.001 });
    }
  }

  // ------------------------------------------------------------------ sound library
  bell(strength = 1, when = 0) {
    const f = 1760 * rand(0.985, 1.015);
    this.noiseBurst(0.012, { vol: 0.18 * strength, freq: 5000, q: 2, when, room: 0.2 });
    this.metal(f, 1.4, [1, 2.33, 3.87, 5.12, 6.9], { vol: 0.16 * strength, when, room: 0.35 });
  }

  bellFrantic(count = 7) {
    for (let i = 0; i < count; i++) this.bell(rand(0.6, 1.1), i * rand(0.07, 0.13));
  }

  doorOpen(fast = false) {
    if (!this.ctx) return;
    this.noiseBurst(0.04, { vol: 0.25, freq: 1800, q: 3, room: 0.2 });           // latch
    // hinge creak
    const ctx = this.ctx, t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const dur = fast ? 0.35 : 0.8;
    o.frequency.setValueAtTime(380, t);
    o.frequency.linearRampToValueAtTime(520, t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(430, t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 34;
    const lg = ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 6;
    const g = this._out('sfx', 0.3);
    o.connect(f).connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }

  doorClose(when = 0) {
    this.noiseBurst(0.18, { vol: 0.45, type: 'lowpass', freq: 380, q: 0.7, when, room: 0.35, brown: true });
    this.tone(70, 0.15, { vol: 0.3, when, slide: 0.6, room: 0.2 });
    this.noiseBurst(0.03, { vol: 0.2, freq: 2400, q: 4, when: when + 0.04, room: 0.2 });
  }

  squeak(len = 0.55) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const t0 = t + k * len * 0.55;
      const base = rand(620, 760);
      o.frequency.setValueAtTime(base, t0);
      o.frequency.linearRampToValueAtTime(base * 1.45, t0 + len * 0.3);
      o.frequency.linearRampToValueAtTime(base * 1.1, t0 + len * 0.5);
      const vib = ctx.createOscillator(); vib.frequency.value = 48;
      const vg = ctx.createGain(); vg.gain.value = 55;
      vib.connect(vg).connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 5;
      const g = this._out('sfx', 0.25);
      o.connect(f).connect(g);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len * 0.5);
      o.start(t0); vib.start(t0); o.stop(t0 + len); vib.stop(t0 + len);
    }
  }

  chairThump() {
    this.noiseBurst(0.12, { vol: 0.35, type: 'lowpass', freq: 300, brown: true, room: 0.2 });
    this.noiseBurst(0.2, { vol: 0.08, freq: 1200, q: 1, when: 0.03, room: 0.1 });
  }

  creak() {
    this.tone(rand(180, 240), 0.25, { type: 'sawtooth', vol: 0.03, slide: 1.3, room: 0.2 });
  }

  footstep(surface = 'tile', vol = 1) {
    const v = rand(0.8, 1.1) * vol;
    this.noiseBurst(0.06, { vol: 0.13 * v, type: 'lowpass', freq: rand(450, 650), brown: true, room: 0.18 });
    if (surface === 'tile') this.noiseBurst(0.018, { vol: 0.05 * v, freq: rand(2800, 3600), q: 2, room: 0.15 });
  }

  snip(close = true) {
    this.noiseBurst(0.022, { vol: 0.22, freq: rand(5200, 6400), q: 3, room: 0.1 });
    this.metal(rand(3800, 4300), 0.05, [1, 1.7], { vol: 0.05, room: 0.05 });
    if (close) this.noiseBurst(0.05, { vol: 0.06, type: 'highpass', freq: 3000, when: 0.012, room: 0.05 });
  }

  scissorOpen() { this.noiseBurst(0.04, { vol: 0.05, type: 'highpass', freq: 4000, room: 0.05 }); }

  cloth(vol = 1, dur = 0.35) {
    this.noiseBurst(dur, { vol: 0.12 * vol, freq: 1400, q: 0.6, attack: dur * 0.3, room: 0.15, sweep: 0.6 });
  }

  capeSnap() {
    this.noiseBurst(0.3, { vol: 0.16, freq: 900, q: 0.7, attack: 0.08, sweep: 2.2, room: 0.2 });
    this.noiseBurst(0.04, { vol: 0.2, freq: 2500, q: 1.5, when: 0.3, room: 0.2 });
  }

  whoosh(vol = 1) {
    this.noiseBurst(0.35, { vol: 0.12 * vol, freq: 500, q: 1.2, attack: 0.12, sweep: 4, room: 0.1 });
  }

  paperFlick() {
    this.noiseBurst(0.05, { vol: 0.12, type: 'highpass', freq: rand(2500, 4000), room: 0.1 });
    this.noiseBurst(0.03, { vol: 0.05, freq: 1200, q: 2, when: 0.02, room: 0.05 });
  }

  paperCrumple() {
    for (let i = 0; i < 6; i++) this.noiseBurst(0.03, { vol: 0.08, freq: rand(1500, 5000), q: 2, when: i * rand(0.03, 0.06) });
  }

  coin(when = 0) {
    const f = rand(2900, 3400);
    for (let i = 0; i < 3; i++) this.metal(f, 0.25 - i * 0.06, [1, 1.52, 2.4], { vol: 0.09 / (i + 1), when: when + i * (0.11 - i * 0.025) });
  }

  keys() {
    for (let i = 0; i < 7; i++) this.metal(rand(2400, 5200), rand(0.1, 0.25), [1, 2.7], { vol: 0.06, when: i * rand(0.025, 0.07), room: 0.15 });
  }

  keySmall() {
    for (let i = 0; i < 3; i++) this.metal(rand(3000, 5000), 0.12, [1, 2.4], { vol: 0.05, when: i * 0.04 });
  }

  register() {
    // ka-ching
    this.noiseBurst(0.05, { vol: 0.3, freq: 900, q: 1.5, room: 0.2 });
    this.metal(2093, 0.9, [1, 2.0, 3.0, 4.2], { vol: 0.12, when: 0.07, room: 0.3 });
    this.noiseBurst(0.15, { vol: 0.2, type: 'lowpass', freq: 500, when: 0.12, brown: true, room: 0.2 });
  }

  throatClear() {
    if (!this.ctx) return;
    this._vowel(130, 0.12, [600, 1100], 0.16, 0, true);
    this._vowel(115, 0.22, [500, 950], 0.18, 0.16, true);
  }

  sigh(pitch = 1) {
    this.noiseBurst(0.9, { vol: 0.07, freq: 700 * pitch, q: 0.8, attack: 0.25, sweep: 0.5, bus: 'voice', room: 0.15 });
  }

  gasp() {
    this.noiseBurst(0.25, { vol: 0.08, freq: 1500, q: 1, attack: 0.03, sweep: 1.6, bus: 'voice', room: 0.15 });
  }

  // vocal-ish blip with two formants, used for "voices"
  _vowel(pitch, dur, formants, vol = 0.1, when = 0, noisy = false) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(pitch * 1.06, t);
    src.frequency.exponentialRampToValueAtTime(pitch * 0.94, t + dur);
    const g = this._out('voice', 0.12);
    for (const f of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 7;
      src.connect(bp).connect(g);
    }
    if (noisy) {
      const n = ctx.createBufferSource(); n.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = formants[0]; bp.Q.value = 2;
      const ng = ctx.createGain(); ng.gain.value = 0.25;
      n.connect(bp).connect(ng).connect(g);
      n.start(t); n.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // Gibberish speech: returns array of syllable start times (seconds from now) for lip sync
  speak(text, voice = { pitch: 150, rate: 1, wobble: 0.08, vol: 0.09 }) {
    const out = [];
    if (!this.ctx) return { syll: out, dur: text.length * 0.05 };
    const vowels = [[730, 1090], [530, 1840], [570, 840], [300, 2300], [440, 1020]];
    let t = 0;
    const words = text.split(/(\s+|[,.!?—…-]+)/).filter((w) => w.length);
    for (const w of words) {
      if (/^[,—…-]+$/.test(w)) { t += 0.18 / voice.rate; continue; }
      if (/^[.!?]+$/.test(w)) { t += 0.3 / voice.rate; continue; }
      if (/^\s+$/.test(w)) { t += 0.035 / voice.rate; continue; }
      const syl = Math.max(1, Math.round(w.replace(/[^a-z]/gi, '').length / 2.6));
      for (let i = 0; i < syl; i++) {
        const d = rand(0.07, 0.11) / voice.rate;
        const p = voice.pitch * (1 + (Math.random() - 0.5) * voice.wobble * 2) * (text.endsWith('?') && i === syl - 1 ? 1.15 : 1);
        this._vowel(p, d, pick(vowels), voice.vol ?? 0.09, t);
        out.push(t);
        t += d + 0.02 / voice.rate;
      }
    }
    return { syll: out, dur: t };
  }

  // ------------------------------------------------------------------ UI
  click() { this.tone(1400, 0.035, { type: 'triangle', vol: 0.08, bus: 'ui', room: 0 }); }
  hover() { this.tone(2200, 0.02, { type: 'sine', vol: 0.025, bus: 'ui', room: 0 }); }
  back() { this.tone(900, 0.05, { type: 'triangle', vol: 0.07, bus: 'ui', room: 0, slide: 0.7 }); }
  error() { this.tone(160, 0.18, { type: 'square', vol: 0.05, bus: 'ui', room: 0, slide: 0.8 }); }
  tick(i = 0) { this.tone(2400 + i * 30, 0.02, { type: 'square', vol: 0.025, bus: 'ui', room: 0 }); }
  purchase() {
    this.tone(784, 0.18, { type: 'triangle', vol: 0.12, bus: 'ui', room: 0.1 });
    this.tone(1175, 0.35, { type: 'triangle', vol: 0.11, bus: 'ui', room: 0.15, when: 0.09 });
    this.coin(0.05);
  }
  objective() {
    this.tone(660, 0.12, { type: 'sine', vol: 0.09, bus: 'ui', room: 0.15 });
    this.tone(990, 0.25, { type: 'sine', vol: 0.08, bus: 'ui', room: 0.2, when: 0.08 });
  }
  star(i) {
    const f = [880, 1047, 1319, 1568, 1760][i] || 1760;
    this.tone(f, 0.3, { type: 'triangle', vol: 0.1, bus: 'ui', room: 0.25 });
    this.tone(f * 2, 0.15, { type: 'sine', vol: 0.04, bus: 'ui', room: 0.2 });
  }
  levelUp() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.09, bus: 'ui', room: 0.3, when: i * 0.07 }));
  }
  // "got item" fanfare: a bright arpeggio over a soft swell, with a metallic glint
  itemGet() {
    if (!this.ctx) return;
    this.noiseBurst(0.9, { vol: 0.05, type: 'bandpass', freq: 900, q: 0.7, attack: 0.35, bus: 'ui', room: 0.4, sweep: 5 });
    [587, 740, 880, 1175, 1480].forEach((f, i) => {
      this.tone(f, 0.5 - i * 0.04, { type: 'triangle', vol: 0.085, bus: 'ui', room: 0.35, when: 0.05 + i * 0.075 });
      this.tone(f * 2, 0.25, { type: 'sine', vol: 0.02, bus: 'ui', room: 0.3, when: 0.05 + i * 0.075 });
    });
    this.tone(1175, 1.3, { type: 'sine', vol: 0.05, bus: 'ui', room: 0.5, when: 0.45 });
    this.tone(1760, 1.1, { type: 'sine', vol: 0.03, bus: 'ui', room: 0.5, when: 0.47, detune: 6 });
    this.metal(2400, 0.7, [1, 2.76, 5.4], { vol: 0.05, when: 0.42, room: 0.4, bus: 'ui' });
  }
  achievement(tier = 'bronze') {
    if (!this.ctx) return;
    const base = { bronze: 523, silver: 659, gold: 784 }[tier] || 523;
    [1, 1.25, 1.5, 2].forEach((m, i) => this.tone(base * m, 0.45, { type: 'triangle', vol: 0.08, bus: 'ui', room: 0.35, when: i * 0.09 }));
    this.metal(base * 4, 0.9, [1, 2.76, 5.4], { vol: 0.04, when: 0.36, room: 0.4, bus: 'ui' });
    if (tier === 'gold') this.tone(base * 3, 1.2, { type: 'sine', vol: 0.04, bus: 'ui', room: 0.5, when: 0.4, detune: 7 });
  }
  // comic realisation "!": a quick rising blip and a bright ping
  exclaim() {
    if (!this.ctx) return;
    this.tone(520, 0.12, { type: 'square', vol: 0.05, bus: 'ui', room: 0.1, slide: 2.4 });
    this.tone(1568, 0.5, { type: 'triangle', vol: 0.09, bus: 'ui', room: 0.3, when: 0.09 });
    this.tone(2093, 0.4, { type: 'sine', vol: 0.05, bus: 'ui', room: 0.3, when: 0.11 });
  }
  question() {
    if (!this.ctx) return;
    this.tone(660, 0.12, { type: 'triangle', vol: 0.07, bus: 'ui', room: 0.2 });
    this.tone(990, 0.22, { type: 'triangle', vol: 0.06, bus: 'ui', room: 0.25, when: 0.1, slide: 1.12 });
  }
  angerPop() {
    if (!this.ctx) return;
    this.tone(180, 0.18, { type: 'square', vol: 0.05, bus: 'ui', room: 0.1, slide: 0.6 });
    this.noiseBurst(0.08, { vol: 0.08, freq: 900, q: 2, bus: 'ui' });
  }
  hearts() {
    if (!this.ctx) return;
    [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.06, bus: 'ui', room: 0.4, when: i * 0.06 }));
  }
  sparkle() {
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) this.tone(2000 + Math.random() * 2500, 0.15, { type: 'sine', vol: 0.03, bus: 'ui', room: 0.4, when: i * 0.05 });
  }
  // wah wah wah waaah
  sadTrombone() {
    if (!this.ctx) return;
    [[311, 0.32], [294, 0.32], [277, 0.32], [262, 0.95]].forEach(([f, d], i) => {
      const o = this.tone(f, d, { type: 'sawtooth', vol: 0.045, bus: 'ui', room: 0.3, when: i * 0.36, attack: 0.03, slide: i === 3 ? 0.94 : 0.98 });
      if (o && i === 3) { const t = this.ctx.currentTime + i * 0.36; for (let k = 0; k < 8; k++) o.detune.setValueAtTime(k % 2 ? 30 : -30, t + 0.2 + k * 0.08); }
    });
  }
  steam() {
    if (!this.ctx) return;
    this.noiseBurst(0.9, { vol: 0.07, type: 'highpass', freq: 3000, attack: 0.05, bus: 'ui', room: 0.2 });
    this.tone(1400, 0.6, { type: 'sine', vol: 0.025, bus: 'ui', slide: 1.6 });
  }
  coinBounce(v = 1) {
    if (!this.ctx) return;
    this.metal(3200 + Math.random() * 600, 0.18 + v * 0.05, [1, 2.4, 3.9], { vol: clamp01(0.03 + v * 0.025), room: 0.25 });
  }
  paperTap(v = 1) { this.noiseBurst(0.04, { vol: clamp01(0.03 + v * 0.03), freq: 1500, q: 1.2, room: 0.15 }); }
  binCrash() {
    if (!this.ctx) return;
    this.metal(420, 0.6, [1, 1.7, 2.9, 4.3], { vol: 0.16, room: 0.4 });
    this.noiseBurst(0.35, { vol: 0.2, freq: 1200, q: 0.6, room: 0.4 });
    this.tone(90, 0.3, { type: 'sine', vol: 0.12, room: 0.2 });
  }
  thud(v = 1) { this.tone(80, 0.15, { type: 'sine', vol: clamp01(0.05 + 0.08 * v), room: 0.2 }); this.noiseBurst(0.06, { vol: clamp01(0.04 * v), freq: 400, q: 0.8 }); }
  doorSlam() {
    if (!this.ctx) return;
    this.tone(70, 0.4, { type: 'sine', vol: 0.3, room: 0.5 });
    this.noiseBurst(0.25, { vol: 0.35, freq: 600, q: 0.5, room: 0.5, brown: true });
    this.noiseBurst(0.05, { vol: 0.2, freq: 2500, q: 1, room: 0.4, when: 0.01 });
    this.bellFrantic(10);
  }
  cheer() {
    if (!this.ctx) return;
    // a short whoop
    const o = this.tone(320, 0.45, { type: 'triangle', vol: 0.07, room: 0.2, slide: 2.2, bus: 'voice' });
    this.tone(640, 0.3, { type: 'sine', vol: 0.03, room: 0.2, slide: 2.0, bus: 'voice' });
  }
  pop() { this.tone(500, 0.08, { type: 'sine', vol: 0.12, bus: 'ui', room: 0.05, slide: 2.2 }); }
  bulbPop() {
    this.noiseBurst(0.06, { vol: 0.3, freq: 3000, q: 1, room: 0.3 });
    this.tone(1200, 0.1, { type: 'square', vol: 0.03, slide: 0.3, room: 0.2 });
  }
  lightOn() {
    this.noiseBurst(0.02, { vol: 0.25, freq: 1500, q: 2, room: 0.2 });
    this.tone(120, 0.6, { type: 'sine', vol: 0.03, room: 0.1, when: 0.02 });
  }

  // ------------------------------------------------------------------ loops
  // electric tools: returns a handle with setLoad(), stop()
  motor(kind = 'clipperCheap') {
    if (!this.ctx) return { setLoad() {}, stop() {}, setGain() {} };
    const ctx = this.ctx, t = ctx.currentTime;
    const cfg = {
      clipperCheap: { f: 116, buzz: 0.06, rattle: 0.5, hp: 300, bp: 1700 },
      clipperPro: { f: 128, buzz: 0.045, rattle: 0.15, hp: 200, bp: 1500 },
      trimmer: { f: 190, buzz: 0.035, rattle: 0.2, hp: 600, bp: 3000 },
    }[kind] || { f: 120, buzz: 0.05, rattle: 0.3, hp: 300, bp: 1700 };
    const out = this._out('sfx', 0.08);
    out.gain.value = 0.0001;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = cfg.f;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = cfg.f * 2.01;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = cfg.bp; bp.Q.value = 1.2;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = cfg.hp;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    o1.connect(g1).connect(bp); o2.connect(g2).connect(bp);
    // rattle: noise amplitude modulated at motor rate
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0;
    const am = ctx.createOscillator(); am.frequency.value = cfg.f; const amg = ctx.createGain(); amg.gain.value = cfg.rattle * 0.08;
    am.connect(amg).connect(ng.gain);
    n.connect(nf).connect(ng).connect(hp);
    bp.connect(hp).connect(out);
    // cutting layer
    const cut = ctx.createBufferSource(); cut.buffer = this.noise; cut.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3500;
    const cg = ctx.createGain(); cg.gain.value = 0;
    cut.connect(cf).connect(cg).connect(out);
    const start = [o1, o2, n, am, cut];
    start.forEach((s) => s.start(t));
    out.gain.exponentialRampToValueAtTime(cfg.buzz, t + 0.08);
    o1.frequency.setValueAtTime(cfg.f * 0.6, t);
    o1.frequency.exponentialRampToValueAtTime(cfg.f, t + 0.12);
    let stopped = false;
    return {
      setLoad: (l) => {
        if (stopped) return;
        const tt = ctx.currentTime;
        o1.frequency.setTargetAtTime(cfg.f * (1 - 0.07 * l), tt, 0.03);
        o2.frequency.setTargetAtTime(cfg.f * 2.01 * (1 - 0.07 * l), tt, 0.03);
        cg.gain.setTargetAtTime(0.05 * l, tt, 0.02);
      },
      setGain: (v) => { if (!stopped) out.gain.setTargetAtTime(cfg.buzz * v, ctx.currentTime, 0.05); },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const tt = ctx.currentTime;
        o1.frequency.exponentialRampToValueAtTime(cfg.f * 0.4, tt + 0.15);
        out.gain.setTargetAtTime(0.0001, tt, 0.04);
        start.forEach((s) => s.stop(tt + 0.3));
      },
    };
  }

  // flickering bulb hum
  hum(level = 1) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 100;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = this._out('amb', 0.05);
    g.gain.value = 0.006 * level;
    o.connect(f).connect(g);
    o.start();
    return { gain: g, osc: o, set: (v) => g.gain.setTargetAtTime(0.0001 + 0.008 * v, ctx.currentTime, 0.02), stop: () => { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1); o.stop(ctx.currentTime + 0.5); } };
  }

  // street ambience + room tone; returns controller
  ambience() {
    if (!this.ctx || this._amb) return this._amb;
    const ctx = this.ctx;
    const street = ctx.createBufferSource(); street.buffer = this.brown; street.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const sg = ctx.createGain(); sg.gain.value = 0.0001;
    street.connect(lp).connect(sg).connect(this.bus.amb);
    street.start();
    const room = ctx.createOscillator(); room.type = 'sine'; room.frequency.value = 58;
    const rg = ctx.createGain(); rg.gain.value = 0.004;
    room.connect(rg).connect(this.bus.amb);
    room.start();
    let outside = 0.35, last = 0;
    const self = this;
    const amb = this._amb = {
      setOutside(v) { outside = v; sg.gain.setTargetAtTime(0.03 + v * 0.11, ctx.currentTime, 0.4); lp.frequency.setTargetAtTime(380 + v * 900, ctx.currentTime, 0.4); },
      update(time) {
        if (time - last < 1) return;
        last = time;
        if (Math.random() < 0.08) self._carPass(outside);
        if (Math.random() < 0.05 * (0.3 + outside)) self._bird(outside);
      },
    };
    amb.setOutside(0.35);
    return amb;
  }

  _carPass(outside) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.brown; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    const dur = rand(3, 5);
    f.frequency.setValueAtTime(250, t); f.frequency.linearRampToValueAtTime(700, t + dur * 0.5); f.frequency.linearRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    const v = 0.05 + outside * 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(f).connect(g);
    if (p) { p.pan.setValueAtTime(-0.8, t); p.pan.linearRampToValueAtTime(0.8, t + dur); g.connect(p).connect(this.bus.amb); } else g.connect(this.bus.amb);
    s.start(t); s.stop(t + dur + 0.1);
  }

  _bird(outside) {
    const base = rand(2800, 4200);
    const n = Math.floor(rand(2, 5));
    for (let i = 0; i < n; i++) this.tone(base * rand(0.9, 1.2), 0.07, { vol: 0.012 + outside * 0.02, bus: 'amb', when: i * 0.11, slide: rand(0.8, 1.3), room: 0.05, pan: -0.4 });
  }

  // ------------------------------------------------------------------ music
  startMusic(style = 'menu') {
    if (!this.ctx) return;
    if (this._music && this._music.style === style) return;
    this.stopMusic();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    let dest = out;
    const filt = ctx.createBiquadFilter();
    if (style === 'radio') {
      filt.type = 'bandpass'; filt.frequency.value = 1300; filt.Q.value = 0.5;
    } else { filt.type = 'lowpass'; filt.frequency.value = 5200; }
    out.connect(filt).connect(this.bus.music);
    out.gain.setTargetAtTime(style === 'radio' ? 0.55 : 0.45, ctx.currentTime, 1.2);
    const bpm = style === 'menu' ? 74 : 82;
    const beat = 60 / bpm;
    // Dm9 - G13 - Cmaj9 - A7b9 style voicings (midi notes)
    const prog = style === 'menu'
      ? [[50, 57, 60, 64, 65], [43, 53, 59, 64, 69], [48, 55, 59, 62, 64], [45, 55, 58, 61, 64]]
      : [[53, 60, 64, 67, 69], [50, 57, 60, 65, 69], [55, 62, 65, 69, 72], [52, 59, 62, 67, 71]];
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    let step = 0, nextT = ctx.currentTime + 0.1;
    const crackle = ctx.createBufferSource(); crackle.buffer = this.noise; crackle.loop = true;
    const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 6000;
    const cg = ctx.createGain(); cg.gain.value = 0.006;
    crackle.connect(cf).connect(cg).connect(out);
    crackle.start();
    const self = this;
    const ep = (f, t, dur, v) => {
      // electric piano: sine carrier, quick FM bell attack
      const c = ctx.createOscillator(); c.frequency.value = f;
      const m = ctx.createOscillator(); m.frequency.value = f * 14;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.2, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.25);
      m.connect(mg).connect(c.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.01);
      g.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      c.connect(g).connect(out);
      c.start(t); m.start(t); c.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
    };
    const drum = (kind, t, v = 1) => {
      if (kind === 'k') {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.32 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
      } else {
        const s = ctx.createBufferSource(); s.buffer = self.noise;
        const f = ctx.createBiquadFilter();
        f.type = kind === 'h' ? 'highpass' : 'bandpass';
        f.frequency.value = kind === 'h' ? 7000 : 1800; f.Q.value = kind === 'h' ? 0.7 : 0.9;
        const g = ctx.createGain();
        const dur = kind === 'h' ? 0.04 : 0.16;
        g.gain.setValueAtTime((kind === 'h' ? 0.05 : 0.12) * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
      }
    };
    const bass = (f, t, dur) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
    };
    const timer = setInterval(() => {
      while (nextT < ctx.currentTime + 0.25) {
        const bar = Math.floor(step / 8) % prog.length;
        const s8 = step % 8;
        const swing = (s8 % 2 === 1) ? beat * 0.16 : 0;
        const t = nextT + swing;
        const chord = prog[bar];
        if (s8 === 0) chord.slice(1).forEach((n, i) => ep(midi(n), t + i * 0.012, beat * 3.6, 0.045));
        if (s8 === 5 && Math.random() < 0.6) chord.slice(2).forEach((n, i) => ep(midi(n + 12), t + i * 0.01, beat * 1.2, 0.02));
        if (s8 === 0 || s8 === 3 || s8 === 6) bass(midi(chord[0] - 12 + (s8 === 6 ? 7 : 0)), t, beat * 0.9);
        if (style !== 'menu' || bar % 2 === 1 || step > 32) {
          if (s8 === 0 || s8 === 5) drum('k', t);
          if (s8 === 2 || s8 === 6) drum('s', t, 0.8);
          drum('h', t, s8 % 2 ? 0.6 : 1);
        }
        // occasional melody note
        if (Math.random() < 0.18) ep(midi(pick(chord) + 24), t, beat * 0.8, 0.02);
        step++;
        nextT += beat / 2;
      }
    }, 40);
    this._music = { style, out, timer, crackle };
  }

  stopMusic(fade = 0.8) {
    if (!this._music) return;
    const m = this._music;
    this._music = null;
    m.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 3);
    setTimeout(() => { clearInterval(m.timer); try { m.crackle.stop(); } catch (e) { /* */ } m.out.disconnect(); }, fade * 1000 + 300);
  }

  duckMusic(v) {
    if (this._music) this._music.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }
}

export const audio = new AudioEngine();

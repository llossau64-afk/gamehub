// Fully synthesized audio: every SFX and the adaptive music are built with WebAudio at runtime.
// No audio files to download, so the game starts instantly.

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

// Chord progressions as MIDI roots + chord tones.
const PROG_RUN = [ // Am - F - C - G
  { root: 45, tones: [57, 60, 64] }, { root: 41, tones: [57, 60, 65] },
  { root: 48, tones: [55, 60, 64] }, { root: 43, tones: [55, 59, 62] },
];
const PROG_BOSS = [ // Dm - Bb - Gm - A
  { root: 38, tones: [62, 65, 69] }, { root: 46, tones: [62, 65, 70] },
  { root: 43, tones: [62, 67, 70] }, { root: 45, tones: [61, 64, 69] },
];
const PROG_MENU = [ // Am9 - Fmaj7 - Cmaj7 - Em7
  { root: 45, tones: [60, 64, 67, 71] }, { root: 41, tones: [60, 64, 69, 72] },
  { root: 48, tones: [59, 64, 67, 71] }, { root: 40, tones: [59, 62, 67, 71] },
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.last = {};
    this.mode = 'off';
    this.intensity = 0;
    this.targetIntensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.muffled = false;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.9 };
    this.coinChain = 0;
    this.coinChainT = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.comp.connect(this.master); this.master.connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.connect(this.comp);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.music = ctx.createGain(); this.music.connect(this.musicFilter); this.musicFilter.connect(this.comp);

    // Short generated room reverb shared by music and some SFX.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb); this.reverb.connect(this.comp);

    const nlen = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    this.applyVolumes();
    this.ready = true;
    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.02);
    this.music.gain.setTargetAtTime(this.vol.music * 0.42, t, 0.05);
  }

  setMuffled(on) {
    if (!this.ctx || this.muffled === on) return;
    this.muffled = on;
    this.musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, 0.12);
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.ctx) this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
  }
  setIntensity(x) { this.targetIntensity = Math.max(0, Math.min(1, x)); }

  // ---------- low level voices ----------
  osc(type, freq, t, dur, gain, dest, opts = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t + (opts.glide || dur));
    if (opts.detune) o.detune.value = opts.detune;
    const a = opts.attack || 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter(); f.type = opts.filter; f.frequency.value = opts.cutoff || 1000; f.Q.value = opts.q || 0.7;
      if (opts.cutoffTo) f.frequency.exponentialRampToValueAtTime(opts.cutoffTo, t + dur);
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(dest || this.sfx);
    if (opts.send) { const s = ctx.createGain(); s.gain.value = opts.send; g.connect(s); s.connect(this.reverbSend); }
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  noiseHit(t, dur, gain, type, cutoff, dest, opts = {}) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; s.playbackRate.value = opts.rate || 1;
    f.type = type; f.frequency.setValueAtTime(cutoff, t); f.Q.value = opts.q || 0.8;
    if (opts.cutoffTo) f.frequency.exponentialRampToValueAtTime(opts.cutoffTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + (opts.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    if (opts.send) { const sg = ctx.createGain(); sg.gain.value = opts.send; g.connect(sg); sg.connect(this.reverbSend); }
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---------- SFX ----------
  play(name, p = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const gap = { hit: 0.035, swing: 0.04, coin: 0.025, enemyShoot: 0.05, death: 0.04, explode: 0.06, zap: 0.06, step: 0.1, hover: 0.03, telegraph: 0.08, hurtEnemy: 0.03, talk: 0.045 }[name] || 0;
    if (gap && this.last[name] && t - this.last[name] < gap) return;
    this.last[name] = t;
    const r = (a = 0.06) => 1 + (Math.random() * 2 - 1) * a;
    switch (name) {
      case 'swing':
        this.noiseHit(t, 0.13, 0.22, 'bandpass', 1200 * r(), null, { cutoffTo: 4200, q: 1.2 });
        break;
      case 'hit': {
        const crit = p.crit;
        this.osc('sine', 190 * r(), t, 0.12, 0.55, null, { to: 60 });
        this.noiseHit(t, 0.07, 0.4, 'bandpass', 2600 * r(), null, { q: 0.9 });
        if (crit) {
          this.osc('triangle', 1320 * r(0.02), t, 0.25, 0.16, null, { send: 0.4 });
          this.osc('square', 1980, t + 0.01, 0.12, 0.05, null, { filter: 'lowpass', cutoff: 4000 });
        }
        break;
      }
      case 'heavy':
        this.osc('sine', 120, t, 0.25, 0.8, null, { to: 40 });
        this.noiseHit(t, 0.16, 0.45, 'lowpass', 2400, null, { cutoffTo: 300 });
        break;
      case 'dash':
        this.noiseHit(t, 0.18, 0.26, 'bandpass', 600, null, { cutoffTo: 3200, q: 2 });
        this.osc('sine', 220, t, 0.14, 0.12, null, { to: 520 });
        break;
      case 'coin': {
        if (t - this.coinChainT > 0.6) this.coinChain = 0;
        this.coinChainT = t;
        const step = Math.min(this.coinChain++, 14);
        const f = NOTE(84 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33][step]);
        this.osc('square', f, t, 0.07, 0.07, null, { filter: 'lowpass', cutoff: 5000 });
        this.osc('triangle', f * 1.5, t + 0.045, 0.16, 0.1, null, { send: 0.25 });
        break;
      }
      case 'select':
        [0, 4, 7, 12].forEach((n, i) => this.osc('triangle', NOTE(72 + n), t + i * 0.045, 0.4, 0.14, null, { send: 0.5 }));
        this.osc('sine', NOTE(48), t, 0.4, 0.25);
        break;
      case 'card':
        this.noiseHit(t, 0.09, 0.12, 'highpass', 3000, null, { cutoffTo: 8000 });
        this.osc('triangle', 660 * r(0.03), t, 0.08, 0.06);
        break;
      case 'legendary':
        [0, 7, 12, 16, 19, 24].forEach((n, i) => this.osc('sine', NOTE(76 + n), t + i * 0.06, 0.7, 0.07, null, { send: 0.8 }));
        break;
      case 'doorOpen':
        this.osc('sine', NOTE(88), t, 0.9, 0.12, null, { send: 0.6 }); // elevator ding
        this.osc('sine', NOTE(84), t + 0.16, 1.1, 0.1, null, { send: 0.6 });
        this.noiseHit(t + 0.1, 0.6, 0.12, 'lowpass', 500, null, { attack: 0.15 });
        this.osc('sawtooth', 55, t + 0.1, 0.5, 0.05, null, { filter: 'lowpass', cutoff: 200 });
        break;
      case 'doorClose':
        this.noiseHit(t, 0.4, 0.14, 'lowpass', 600, null, { attack: 0.1 });
        this.osc('sine', 70, t + 0.32, 0.25, 0.4, null, { to: 40 });
        break;
      case 'elevator':
        this.osc('sawtooth', 48, t, 1.6, 0.05, null, { filter: 'lowpass', cutoff: 180, attack: 0.3 });
        this.noiseHit(t, 1.6, 0.05, 'lowpass', 300, null, { attack: 0.4 });
        break;
      case 'death':
        this.osc('square', 300 * r(0.1), t, 0.16, 0.12, null, { to: 70, filter: 'lowpass', cutoff: 2000 });
        this.noiseHit(t, 0.22, 0.3, 'lowpass', 3000, null, { cutoffTo: 200 });
        break;
      case 'explode':
        this.osc('sine', 110, t, 0.4, 0.7, null, { to: 32 });
        this.noiseHit(t, 0.45, 0.5, 'lowpass', 3000, null, { cutoffTo: 120, send: 0.2 });
        break;
      case 'zap':
        for (let i = 0; i < 3; i++) this.osc('sawtooth', 900 + Math.random() * 1600, t + i * 0.025, 0.05, 0.05, null, { filter: 'highpass', cutoff: 800 });
        this.noiseHit(t, 0.12, 0.15, 'highpass', 4000);
        break;
      case 'hurt':
        this.osc('sawtooth', 160, t, 0.25, 0.25, null, { to: 60, filter: 'lowpass', cutoff: 900 });
        this.noiseHit(t, 0.2, 0.4, 'bandpass', 900, null, { q: 1.5 });
        break;
      case 'hurtEnemy':
        this.osc('square', 520 * r(0.15), t, 0.05, 0.04, null, { to: 300 });
        break;
      case 'enemyShoot':
        this.osc('sine', 760 * r(0.05), t, 0.12, 0.09, null, { to: 330 });
        break;
      case 'telegraph':
        this.osc('triangle', 330, t, 0.35, 0.07, null, { to: 990, glide: 0.33 });
        break;
      case 'slam':
        this.osc('sine', 80, t, 0.5, 0.9, null, { to: 28 });
        this.noiseHit(t, 0.5, 0.45, 'lowpass', 1200, null, { cutoffTo: 80, send: 0.3 });
        break;
      case 'spawn':
        this.osc('sine', 200, t, 0.25, 0.08, null, { to: 600 });
        break;
      case 'bossIntro':
        this.osc('sawtooth', 41, t, 2.2, 0.25, null, { filter: 'lowpass', cutoff: 400, cutoffTo: 60, attack: 0.02 });
        this.osc('sine', 55, t, 2.4, 0.6, null, { to: 30, glide: 2.2 });
        this.noiseHit(t, 1.6, 0.25, 'lowpass', 2000, null, { cutoffTo: 100, send: 0.6 });
        [0, 3, 7].forEach((n, i) => this.osc('square', NOTE(50 + n), t + 0.6 + i * 0.12, 1.2, 0.04, null, { filter: 'lowpass', cutoff: 1200, send: 0.6 }));
        break;
      case 'bossDown':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.osc('triangle', NOTE(67 + n), t + i * 0.07, 0.9, 0.11, null, { send: 0.7 }));
        this.osc('sine', 60, t, 1, 0.6, null, { to: 30 });
        break;
      case 'gameOver':
        [0, -3, -7, -12].forEach((n, i) => this.osc('triangle', NOTE(64 + n), t + i * 0.16, 0.6, 0.12, null, { send: 0.6 }));
        this.osc('sine', 80, t, 1.2, 0.4, null, { to: 30 });
        break;
      case 'hover':
        this.osc('sine', 1400, t, 0.03, 0.04);
        break;
      case 'click':
        this.osc('triangle', 520, t, 0.08, 0.14, null, { to: 300 });
        this.noiseHit(t, 0.03, 0.08, 'highpass', 3000);
        break;
      case 'back':
        this.osc('triangle', 380, t, 0.08, 0.12, null, { to: 220 });
        break;
      case 'buy':
        [0, 7, 12].forEach((n, i) => this.osc('square', NOTE(79 + n), t + i * 0.05, 0.12, 0.05, null, { filter: 'lowpass', cutoff: 4000 }));
        break;
      case 'deny':
        this.osc('square', 140, t, 0.12, 0.08, null, { filter: 'lowpass', cutoff: 800 });
        this.osc('square', 120, t + 0.09, 0.14, 0.08, null, { filter: 'lowpass', cutoff: 800 });
        break;
      case 'heal':
        this.osc('sine', NOTE(76), t, 0.2, 0.08, null, { to: NOTE(83), send: 0.3 });
        break;
      case 'best':
        [0, 4, 7, 11, 14].forEach((n, i) => this.osc('triangle', NOTE(72 + n), t + i * 0.05, 0.5, 0.09, null, { send: 0.6 }));
        break;
      case 'crate':
        this.noiseHit(t, 0.15, 0.35, 'bandpass', 700, null, { q: 1.2 });
        this.osc('square', 140, t, 0.08, 0.1, null, { to: 70, filter: 'lowpass', cutoff: 900 });
        break;
      case 'spike':
        this.noiseHit(t, 0.08, 0.15, 'highpass', 2500);
        this.osc('square', 900, t, 0.05, 0.03, null, { to: 300 });
        break;
      case 'fireCast':
        this.noiseHit(t, 0.35, 0.35, 'bandpass', 900, null, { cutoffTo: 2600, q: 0.8 });
        this.osc('sawtooth', 120, t, 0.3, 0.12, null, { to: 260, filter: 'lowpass', cutoff: 900 });
        break;
      case 'thunder':
        this.noiseHit(t, 0.08, 0.5, 'highpass', 3000);
        this.noiseHit(t + 0.02, 0.9, 0.45, 'lowpass', 1400, null, { cutoffTo: 90, send: 0.6 });
        this.osc('sine', 70, t, 0.6, 0.6, null, { to: 30 });
        for (let i = 0; i < 4; i++) this.osc('square', 1400 + Math.random() * 2000, t + i * 0.02, 0.04, 0.05, null, { filter: 'highpass', cutoff: 1200 });
        break;
      case 'earthCast':
        this.noiseHit(t, 0.4, 0.4, 'lowpass', 700, null, { cutoffTo: 200 });
        this.osc('sine', 90, t, 0.35, 0.5, null, { to: 50 });
        break;
      case 'frostCast':
        this.noiseHit(t, 0.6, 0.25, 'highpass', 5000, null, { send: 0.6 });
        [0, 5, 12].forEach((n, i) => this.osc('sine', NOTE(86 + n), t + i * 0.04, 0.6, 0.05, null, { send: 0.8 }));
        break;
      case 'windCast':
        this.noiseHit(t, 0.35, 0.3, 'bandpass', 1500, null, { cutoffTo: 5000, q: 3 });
        this.noiseHit(t + 0.06, 0.3, 0.2, 'bandpass', 2500, null, { cutoffTo: 7000, q: 3 });
        break;
      case 'levelUp':
        [0, 4, 7, 12, 16].forEach((n, i) => this.osc('square', NOTE(72 + n), t + i * 0.06, 0.25, 0.05, null, { filter: 'lowpass', cutoff: 5000 }));
        [0, 7, 12].forEach((n, i) => this.osc('triangle', NOTE(60 + n), t + 0.3, 0.9, 0.08, null, { send: 0.7 }));
        break;
      case 'ride':
        this.osc('sawtooth', 45, t, 1.1, 0.06, null, { filter: 'lowpass', cutoff: 220, attack: 0.2 });
        this.noiseHit(t, 1.0, 0.07, 'lowpass', 500, null, { attack: 0.25 });
        this.osc('sine', NOTE(88), t + 0.85, 0.8, 0.1, null, { send: 0.6 });
        break;
      case 'talk': // intercom voice blip
        this.osc('square', 300 + Math.random() * 140, t, 0.045, 0.035, null, { filter: 'bandpass', cutoff: 1400, q: 2 });
        break;
      case 'dialogOpen':
        this.noiseHit(t, 0.12, 0.08, 'bandpass', 2400, null, { q: 3 });
        this.osc('sine', 880, t + 0.05, 0.12, 0.05);
        this.osc('sine', 1320, t + 0.11, 0.16, 0.04);
        break;
      case 'objective':
        [0, 7, 12].forEach((n, i) => this.osc('triangle', NOTE(79 + n), t + i * 0.06, 0.35, 0.09, null, { send: 0.5 }));
        break;
      case 'flip':
        this.noiseHit(t, 0.07, 0.1, 'highpass', 4000, null, { cutoffTo: 9000 });
        break;
      case 'revive':
        [0, 7, 12, 19, 24].forEach((n, i) => this.osc('sine', NOTE(60 + n), t + i * 0.08, 1, 0.12, null, { send: 0.8 }));
        break;
    }
  }

  // ---------- adaptive music ----------
  schedule() {
    if (!this.ready || this.ctx.state !== 'running') return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.04;
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.12) {
      if (this.mode !== 'off') this.playStep(this.nextTime, this.step);
      const bpm = this.mode === 'boss' ? 132 : this.mode === 'menu' ? 84 : 104 + this.intensity * 8;
      this.nextTime += 60 / bpm / 4;
      this.step++;
    }
  }

  playStep(t, step) {
    const m = this.music, I = this.intensity, s16 = step % 16, bar = Math.floor(step / 16);
    const mode = this.mode;
    if (mode === 'menu') {
      const ch = PROG_MENU[bar % 4];
      if (s16 === 0) {
        ch.tones.forEach((n, i) => this.pad(t, NOTE(n), 60 / 84 * 4, 0.035, i));
        this.osc('sine', NOTE(ch.root - 12), t, 2.6, 0.22, m, { attack: 0.3 });
      }
      if (s16 % 4 === 2 && (bar + s16) % 3 !== 0) {
        const n = ch.tones[(s16 + bar) % ch.tones.length] + 12;
        this.osc('triangle', NOTE(n), t, 0.6, 0.05, m, { send: 0.9 });
      }
      return;
    }
    const boss = mode === 'boss';
    const prog = boss ? PROG_BOSS : PROG_RUN;
    const ch = prog[bar % 4];
    const spb = boss ? 60 / 132 / 4 : 60 / 104 / 4;

    // kick
    const kickPat = boss || I > 0.55 ? s16 % 4 === 0 : (s16 === 0 || s16 === 8 || (s16 === 10 && I > 0.3));
    if (kickPat) this.kick(t, boss ? 0.9 : 0.75);
    // snare / clap
    if ((s16 === 4 || s16 === 12) && (boss || I > 0.2)) this.snare(t, boss ? 0.35 : 0.22 + I * 0.1);
    // hats
    if (s16 % 2 === 0 || boss || I > 0.65) this.hat(t, (s16 % 4 === 2 ? 0.07 : 0.035) * (boss ? 1.2 : 0.6 + I * 0.6));
    // bass
    const bassPat = boss ? true : I > 0.45 ? s16 % 2 === 0 : [0, 3, 6, 10, 12].includes(s16);
    if (bassPat) {
      const oct = boss && s16 % 4 === 2 ? 12 : 0;
      this.bass(t, NOTE(ch.root + oct), spb * (boss ? 0.9 : 1.6), boss ? 0.2 : 0.16);
    }
    // pad
    if (s16 === 0) ch.tones.forEach((n, i) => this.pad(t, NOTE(n), spb * 16, boss ? 0.022 : 0.028, i));
    // arp, fades in with intensity
    const arpOn = boss || I > 0.35;
    if (arpOn && (boss || s16 % 2 === 0)) {
      const tones = ch.tones, idx = (step * (boss ? 3 : 1)) % (tones.length * 2);
      const n = tones[idx % tones.length] + (idx >= tones.length ? 12 : 0);
      const g = boss ? 0.045 : 0.03 * Math.min(1, (I - 0.35) * 3);
      this.osc('square', NOTE(n), t, spb * 1.5, g, m, { filter: 'lowpass', cutoff: 1500 + I * 2000, send: 0.4 });
    }
  }

  kick(t, g) {
    this.osc('sine', 150, t, 0.32, g, this.music, { to: 42, glide: 0.11 });
    this.osc('triangle', 2400, t, 0.012, g * 0.12, this.music);
  }
  snare(t, g) {
    this.noiseHit(t, 0.16, g, 'bandpass', 1900, this.music, { q: 0.6, send: 0.3 });
    this.osc('triangle', 190, t, 0.08, g * 0.5, this.music);
  }
  hat(t, g) { this.noiseHit(t, 0.035, g, 'highpass', 7500, this.music); }
  bass(t, f, dur, g) {
    this.osc('sawtooth', f, t, dur, g, this.music, { filter: 'lowpass', cutoff: 900, cutoffTo: 200 });
    this.osc('sine', f / 2, t, dur, g * 0.9, this.music);
  }
  pad(t, f, dur, g, i) {
    this.osc('sawtooth', f, t, dur, g, this.music, { filter: 'lowpass', cutoff: 900, attack: dur * 0.3, detune: i % 2 ? 7 : -7, send: 0.6 });
  }
}

export const audio = new AudioEngine();

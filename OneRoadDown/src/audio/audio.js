// All sound is synthesised with WebAudio: engines (per-car cylinder count, tone,
// roughness, turbo, pops), tyres, surfaces, impacts, ambience and generative music.
// Nothing is streamed, so the download stays tiny.

import { clamp, lerp } from '../core/util.js';

let A = null;

export function audio() { return A; }

export class AudioSys {
  constructor() {
    A = this;
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.5, sfx: 0.8 };
    this.muted = false;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.connect(this.sfxBus);
    this.engBus = ctx.createGain(); this.engBus.connect(this.sfxBus);
    // reverb send (tunnels, garage)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.2);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0;
    this.revSend.connect(this.reverb).connect(this.sfxBus);
    this.engBus.connect(this.revSend);
    // noise buffers
    this.white = this.noiseBuf('white');
    this.pink = this.noiseBuf('pink');
    this.brown = this.noiseBuf('brown');
    this.applyVolumes();
    this.ambience = new Ambience(this);
    this.music = new Music(this);
    if (this.pending) { for (const f of this.pending) f(); this.pending = null; }
  }

  ready() { return !!this.ctx && this.ctx.state === 'running'; }
  when(f) { if (this.ctx) f(); else (this.pending || (this.pending = [])).push(f); }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }
  setMuted(m) { this.muted = m; this.applyVolumes(); }

  noiseBuf(kind) {
    const ctx = this.ctx, len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return b;
  }
  impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  noiseSrc(buf = this.white, loop = true) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop;
    s.loopStart = Math.random(); s.loopEnd = 2;
    return s;
  }
  setReverb(v) { if (this.ctx) this.revSend.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }

  // ------------------------------------------------------------- one shots
  env(g, t, a, peak, dec, sustain = 0) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + dec);
  }
  burst({ freq = 1000, q = 1, type = 'bandpass', dur = 0.2, gain = 0.5, buf, attack = 0.002, bus, delay = 0, rate = 1 }) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = this.noiseSrc(buf || this.white, false); s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    this.env(g, t, attack, gain, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
    return f;
  }
  tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.3, attack = 0.005, slide = 0, bus, delay = 0, detune = 0 }) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    o.connect(g).connect(bus || this.sfxBus);
    this.env(g, t, attack, gain, dur);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }
  // metallic ring: a few inharmonic resonators excited by noise
  metal(intensity = 0.5, base = 220) {
    if (!this.ready()) return;
    const k = clamp(intensity, 0, 1);
    this.burst({ freq: 180 + Math.random() * 80, q: 0.7, type: 'lowpass', dur: 0.15 + k * 0.25, gain: 0.5 + k * 0.6, buf: this.brown });
    this.burst({ freq: 1400 + Math.random() * 800, q: 1.2, dur: 0.08 + k * 0.15, gain: 0.25 + k * 0.4 });
    for (const m of [1, 2.76, 5.4]) this.burst({ freq: base * m * (0.9 + Math.random() * 0.2), q: 30, dur: 0.3 + k * 0.6, gain: 0.15 * k, attack: 0.001 });
  }
  impact(speed, kind) {
    const k = clamp((speed - 2) / 16, 0, 1);
    if (kind === 'ground' && speed < 6) { this.thump(k); return; }
    this.metal(k, kind === 'rail' ? 340 : kind === 'object' ? 160 : 260);
    if (k > 0.5) this.burst({ freq: 90, q: 0.5, type: 'lowpass', dur: 0.5, gain: 0.8 * k, buf: this.brown });
  }
  thump(k = 0.5) {
    this.tone({ freq: 90, type: 'sine', dur: 0.18, gain: 0.25 + k * 0.4, slide: 0.5 });
    this.burst({ freq: 300, type: 'lowpass', dur: 0.08, gain: 0.15 + k * 0.2, buf: this.brown });
  }
  glass() {
    this.burst({ freq: 4500, q: 2, dur: 0.25, gain: 0.35, type: 'highpass' });
    for (let i = 0; i < 9; i++) this.tone({ freq: 2500 + Math.random() * 4000, type: 'triangle', dur: 0.06 + Math.random() * 0.1, gain: 0.05, delay: 0.02 + Math.random() * 0.35 });
  }
  splash(k = 1) { this.burst({ freq: 900, q: 0.6, dur: 0.35, gain: 0.3 * k, type: 'bandpass', buf: this.pink }); }
  shift() { this.burst({ freq: 220, q: 2, dur: 0.05, gain: 0.12, type: 'bandpass', buf: this.brown }); }
  pickup(type) {
    if (type === 'cash' || type === 'crate') {
      this.tone({ freq: 1318, type: 'triangle', dur: 0.18, gain: 0.12 }); this.tone({ freq: 1976, type: 'triangle', dur: 0.3, gain: 0.1, delay: 0.07 });
      this.burst({ freq: 6000, q: 1, dur: 0.12, gain: 0.08, type: 'highpass', delay: 0.02 });
    } else if (type === 'fuel') {
      for (let i = 0; i < 4; i++) this.tone({ freq: 160 + i * 25, type: 'sine', dur: 0.09, gain: 0.18, slide: 1.6, delay: i * 0.08 });
      this.metal(0.15, 500);
    } else if (type === 'repair' || type === 'repairL') { this.ratchet(type === 'repairL' ? 10 : 6, 0); this.tone({ freq: 880, type: 'triangle', dur: 0.25, gain: 0.08, delay: 0.4 }); }
    else if (type === 'rare') { [784, 988, 1175, 1568].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.4, gain: 0.08, delay: i * 0.07 })); this.metal(0.2, 700); }
  }
  ratchet(n = 8, delay = 0, rate = 0.045) {
    for (let i = 0; i < n; i++) this.burst({ freq: 3200, q: 4, dur: 0.018, gain: 0.25, delay: delay + i * rate, type: 'bandpass' });
  }
  impactWrench(dur = 0.7, delay = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(110, t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22; const lg = ctx.createGain(); lg.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.5;
    lfo.connect(lg).connect(g.gain);
    o.connect(f).connect(g).connect(this.sfxBus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02); g.gain.setValueAtTime(0.35, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.burst({ freq: 2500, q: 3, dur: dur, gain: 0.08, delay, type: 'bandpass' });
  }
  garageDoor(dur = 2.4) {
    if (!this.ready()) return;
    this.burst({ freq: 260, q: 0.8, dur, gain: 0.35, type: 'lowpass', buf: this.brown, attack: 0.3 });
    for (let i = 0; i < 16; i++) this.metal(0.12, 300 + Math.random() * 200 + i);
  }
  ui(kind = 'click') {
    if (kind === 'hover') this.tone({ freq: 2200, type: 'sine', dur: 0.025, gain: 0.025 });
    else if (kind === 'buy') { this.tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.1 }); this.tone({ freq: 990, type: 'triangle', dur: 0.2, gain: 0.08, delay: 0.08 }); }
    else if (kind === 'deny') this.tone({ freq: 160, type: 'square', dur: 0.12, gain: 0.05 });
    else if (kind === 'back') this.tone({ freq: 700, type: 'sine', dur: 0.05, gain: 0.05, slide: 0.6 });
    else { this.tone({ freq: 1200, type: 'sine', dur: 0.03, gain: 0.06 }); this.burst({ freq: 3000, q: 2, dur: 0.02, gain: 0.05 }); }
  }
  countdown(go) { this.tone({ freq: go ? 1046 : 523, type: 'triangle', dur: go ? 0.5 : 0.18, gain: 0.16 }); }
  // camera cut / transition: a short filtered-noise sweep
  whoosh(k = 0.5) {
    const f = this.burst({ freq: 500, q: 1.4, type: 'bandpass', dur: 0.5, gain: 0.22 * k, buf: this.pink, attack: 0.12 });
    if (f) f.frequency.exponentialRampToValueAtTime(3200, this.ctx.currentTime + 0.5);
  }
  // grandstand crowd: a swelling roar with scattered claps
  cheer(k = 1) {
    if (!this.ready()) return;
    this.burst({ freq: 900, q: 0.6, type: 'bandpass', dur: 3.2, gain: 0.16 * k, buf: this.pink, attack: 0.5 });
    this.burst({ freq: 2400, q: 0.8, type: 'bandpass', dur: 2.6, gain: 0.07 * k, buf: this.white, attack: 0.6 });
    for (let i = 0; i < 26; i++) this.burst({ freq: 1600 + Math.random() * 1800, q: 2, dur: 0.05, gain: 0.05 * k, delay: 0.2 + Math.random() * 2.6 });
  }
  // podium fanfare: a short brassy major arpeggio
  fanfare() {
    [[392, 0], [523, 0.16], [659, 0.32], [784, 0.48], [1046, 0.72]].forEach(([f, d], i) => {
      this.tone({ freq: f, type: 'sawtooth', dur: i === 4 ? 1.1 : 0.22, gain: 0.05, delay: d, bus: this.musicBus, attack: 0.02 });
      this.tone({ freq: f * 1.005, type: 'square', dur: i === 4 ? 1.1 : 0.22, gain: 0.025, delay: d, bus: this.musicBus, attack: 0.02 });
    });
  }
  record() { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.07, delay: i * 0.09, bus: this.musicBus })); }
  thunder(power = 1) {
    this.burst({ freq: 120, q: 0.4, type: 'lowpass', dur: 2.5 + power * 2, gain: 0.5 * power, buf: this.brown, attack: 0.05 });
    this.burst({ freq: 400, q: 0.3, type: 'lowpass', dur: 0.4, gain: 0.3 * power, buf: this.pink, delay: 0.05 });
  }
  starter(car, delay = 0) { // crank, crank, catch
    for (let i = 0; i < 5; i++) { this.tone({ freq: 55, type: 'sawtooth', dur: 0.12, gain: 0.12, delay: delay + i * 0.16 }); this.burst({ freq: 900, q: 2, dur: 0.1, gain: 0.05, delay: delay + i * 0.16 }); }
  }
}

// ---------------------------------------------------------------- engine voice
export class EngineVoice {
  constructor(sys, car) {
    this.sys = sys;
    const ctx = sys.ctx;
    const sp = (this.sp = car.sound);
    this.cyl = sp.cyl;
    const out = (this.out = ctx.createGain()); out.gain.value = 0;
    out.connect(sys.engBus);
    // harmonic exhaust note
    const harm = 24, real = new Float32Array(harm), imag = new Float32Array(harm);
    for (let n = 1; n < harm; n++) {
      let a = 1 / Math.pow(n, sp.tone === 'smooth' || sp.tone === 'v12' ? 1.25 : sp.tone === 'scream' || sp.tone === 'v10' ? 0.85 : 1.0);
      if (sp.tone === 'boxy' && n % 2 === 0) a *= 0.4;
      if (sp.tone === 'diesel' && n > 4) a *= 1.3;
      if (sp.tone === 'flat6' && n % 3 === 0) a *= 1.6;
      imag[n] = a * (n % 2 ? 1 : 0.7);
    }
    const wave = ctx.createPeriodicWave(real, imag);
    this.osc = ctx.createOscillator(); this.osc.setPeriodicWave(wave);
    this.osc2 = ctx.createOscillator(); this.osc2.setPeriodicWave(wave); this.osc2.detune.value = 9;
    this.sub = ctx.createOscillator(); this.sub.type = 'triangle';
    const shaper = (this.shaper = ctx.createWaveShaper());
    shaper.curve = curve(sp.tone === 'diesel' ? 3.5 : sp.tone === 'v8' ? 2.6 : 1.8);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.5;
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 35;
    this.mixO = ctx.createGain(); this.mixO.gain.value = 0.32;
    this.mixS = ctx.createGain(); this.mixS.gain.value = 0.2 + sp.rough * 0.35;
    // AM lump for uneven firing (v8 burble, old engines)
    this.am = ctx.createGain(); this.am.gain.value = 1;
    this.lfo = ctx.createOscillator(); this.lfoG = ctx.createGain(); this.lfoG.gain.value = sp.rough * 0.45;
    this.lfo.connect(this.lfoG).connect(this.am.gain);
    this.osc.connect(this.mixO); this.osc2.connect(this.mixO); this.sub.connect(this.mixS);
    this.mixO.connect(shaper); this.mixS.connect(shaper);
    shaper.connect(this.am).connect(this.lp).connect(this.hp).connect(out);
    // intake / exhaust roar
    this.noise = sys.noiseSrc(sys.pink);
    this.nf = ctx.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.Q.value = 1.2;
    this.ng = ctx.createGain(); this.ng.gain.value = 0;
    this.noise.connect(this.nf).connect(this.ng).connect(out);
    // turbo whistle + supercharger whine
    this.tw = ctx.createOscillator(); this.tw.type = 'sine';
    this.twg = ctx.createGain(); this.twg.gain.value = 0;
    this.tw.connect(this.twg).connect(out);
    for (const o of [this.osc, this.osc2, this.sub, this.lfo, this.tw]) o.start();
    this.noise.start();
    this.on = false;
    this.popT = 0;
    this.gainT = 0;
  }
  setRunning(on) { this.on = on; }
  // rpm, redline, throttle 0..1, load 0..1, boost 0..1
  update(dt, rpm, redline, throttle, boost, limiter, engineHealth, vol = 1) {
    const ctx = this.sys.ctx, t = ctx.currentTime, sp = this.sp;
    const f = Math.max(8, (rpm / 60) * (this.cyl / 2) * 0.62 * sp.base);
    const r = clamp(rpm / redline, 0, 1.2);
    this.osc.frequency.setTargetAtTime(f, t, 0.02);
    this.osc2.frequency.setTargetAtTime(f * 1.003, t, 0.02);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    this.lfo.frequency.setTargetAtTime(f / (this.cyl >= 8 ? 4 : 2), t, 0.02);
    const bright = 280 + r * r * 2600 * (0.45 + throttle * 0.55) + (sp.tone === 'scream' || sp.tone === 'v10' ? 1200 * r : 0);
    this.lp.frequency.setTargetAtTime(bright * (0.6 + engineHealth * 0.4), t, 0.03);
    this.nf.frequency.setTargetAtTime(500 + r * 2400, t, 0.05);
    this.ng.gain.setTargetAtTime((0.02 + throttle * 0.09 * r) * sp.exhaust * (2 - engineHealth), t, 0.05);
    const twf = 1800 + boost * 5200 + (sp.blower ? r * 3000 : 0);
    this.tw.frequency.setTargetAtTime(twf, t, 0.05);
    this.twg.gain.setTargetAtTime(boost * 0.025 + (sp.blower ? r * 0.02 : 0), t, 0.08);
    let g = this.on ? (0.18 + throttle * 0.16 + r * 0.12) * sp.exhaust * vol : 0;
    if (limiter > 0) g *= 0.55 + Math.random() * 0.3;
    if (engineHealth < 0.3 && this.on && Math.random() < dt * 4) g *= 0.3;
    this.out.gain.setTargetAtTime(g, t, this.on ? 0.03 : 0.25);
    this.lfoG.gain.setTargetAtTime(sp.rough * (0.35 + (1 - r) * 0.4) + (1 - engineHealth) * 0.4, t, 0.1);
    // pops on lift-off at high rpm
    this.popT -= dt;
    if (sp.pops && this.on && throttle < 0.1 && r > 0.55 && this.popT <= 0 && Math.random() < dt * 9 * sp.pops) {
      this.popT = 0.05 + Math.random() * 0.12;
      this.sys.burst({ freq: 700 + Math.random() * 900, q: 0.8, type: 'lowpass', dur: 0.06, gain: 0.35 * sp.pops, buf: this.sys.brown, bus: this.sys.engBus });
      return true;
    }
    return false;
  }
  blowoff(a = 1) { this.sys.burst({ freq: 3500, q: 0.7, type: 'highpass', dur: 0.35, gain: 0.12 * a, attack: 0.01, bus: this.sys.engBus }); }
  dispose() {
    const t = this.sys.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      for (const o of [this.osc, this.osc2, this.sub, this.lfo, this.tw, this.noise]) { try { o.stop(); } catch (e) { /* already stopped */ } }
      this.out.disconnect();
    }, 400);
  }
}
function curve(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
  return c;
}

// ---------------------------------------------------------------- driving loops
export class RoadVoice {
  constructor(sys) {
    this.sys = sys;
    const ctx = sys.ctx;
    const mk = (buf, type, freq, q) => {
      const s = sys.noiseSrc(buf); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(sys.sfxBus); s.start();
      return { s, f, g };
    };
    this.roll = mk(sys.brown, 'lowpass', 400, 0.7);
    this.gravel = mk(sys.white, 'bandpass', 2200, 0.9);
    this.squeal = mk(sys.white, 'bandpass', 1500, 9);
    this.wind = mk(sys.pink, 'bandpass', 600, 0.6);
    this.scrape = mk(sys.white, 'bandpass', 3000, 3);
    this.splash = mk(sys.pink, 'bandpass', 900, 0.8);
    // crunchy gating for gravel
    this.gate = ctx.createOscillator(); this.gate.type = 'square'; this.gate.frequency.value = 31;
    const gg = ctx.createGain(); gg.gain.value = 0.5; this.gate.connect(gg).connect(this.gravel.g.gain); this.gate.start();
    this.gateG = gg;
    this.sqLfo = ctx.createOscillator(); this.sqLfo.frequency.value = 7; const sl = ctx.createGain(); sl.gain.value = 60; this.sqLfo.connect(sl).connect(this.squeal.f.frequency); this.sqLfo.start();
  }
  update(speed, slipPaved, slipLoose, surfInfo, scrape, inWater, vol = 1) {
    const t = this.sys.ctx.currentTime;
    const v = clamp(speed / 40, 0, 1.5);
    const rough = surfInfo ? surfInfo.rough : 0;
    const loose = surfInfo && surfInfo.group > 0 ? 1 : 0;
    this.roll.g.gain.setTargetAtTime((0.05 + v * 0.22) * vol * (1 + rough), t, 0.1);
    this.roll.f.frequency.setTargetAtTime(220 + v * 500 + rough * 600, t, 0.1);
    const gr = loose * clamp(speed / 12, 0, 1) * (surfInfo && surfInfo.snow ? 0.4 : 1);
    this.gravel.g.gain.setTargetAtTime(gr * 0.12 * vol, t, 0.08);
    this.gateG.gain.setTargetAtTime(gr * 0.08 * vol, t, 0.08);
    this.gate.frequency.setTargetAtTime(18 + speed * 1.6 + Math.random() * 10, t, 0.02);
    this.gravel.f.frequency.setTargetAtTime(surfInfo && surfInfo.snow ? 4200 : surfInfo && surfInfo.group === 2 ? 500 : 2200, t, 0.1);
    this.squeal.g.gain.setTargetAtTime(clamp(slipPaved, 0, 1) * 0.16 * vol, t, 0.04);
    this.squeal.f.frequency.setTargetAtTime(1200 + clamp(slipPaved, 0, 1) * 600, t, 0.1);
    this.wind.g.gain.setTargetAtTime(clamp(v * v * 0.35, 0, 0.5) * vol, t, 0.2);
    this.wind.f.frequency.setTargetAtTime(400 + v * 900, t, 0.2);
    this.scrape.g.gain.setTargetAtTime(scrape * 0.22 * vol, t, 0.03);
    this.splash.g.gain.setTargetAtTime(inWater * clamp(speed / 10, 0, 1) * 0.25 * vol, t, 0.05);
  }
  stop() {
    const t = this.sys.ctx.currentTime;
    for (const k of ['roll', 'gravel', 'squeal', 'wind', 'scrape', 'splash']) this[k].g.gain.setTargetAtTime(0, t, 0.1);
    this.gateG.gain.setTargetAtTime(0, t, 0.1);
  }
}

// ---------------------------------------------------------------- ambience
class Ambience {
  constructor(sys) {
    this.sys = sys;
    const ctx = sys.ctx;
    const mk = (buf, type, freq, q) => {
      const s = sys.noiseSrc(buf); const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(sys.ambBus); s.start();
      return { s, f, g };
    };
    this.wind = mk(sys.pink, 'bandpass', 380, 0.5);
    this.leaves = mk(sys.white, 'highpass', 5000, 0.5);
    this.water = mk(sys.pink, 'lowpass', 1100, 0.6);
    this.rain = mk(sys.white, 'highpass', 2500, 0.4);
    this.room = mk(sys.brown, 'lowpass', 160, 0.5);
    this.birdT = 2;
    this.t = 0;
  }
  // p: { wind, birds, water (0..1 proximity), rain, room }
  update(dt, p) {
    const ctx = this.sys.ctx, t = ctx.currentTime;
    this.t += dt;
    const gust = 0.6 + 0.4 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.11 + 1);
    this.wind.g.gain.setTargetAtTime((p.wind || 0) * 0.16 * gust, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(280 + gust * 260, t, 0.5);
    this.leaves.g.gain.setTargetAtTime((p.trees || 0) * (p.wind || 0) * 0.025 * gust, t, 0.5);
    this.water.g.gain.setTargetAtTime((p.water || 0) * 0.3, t, 0.5);
    this.rain.g.gain.setTargetAtTime((p.rain || 0) * 0.12, t, 0.5);
    this.room.g.gain.setTargetAtTime((p.room || 0) * 0.2, t, 0.5);
    this.birdT -= dt;
    if (this.birdT < 0 && (p.birds || 0) > 0.2) {
      this.birdT = 1.5 + Math.random() * 5 / p.birds;
      this.chirp();
    }
  }
  chirp() {
    const s = this.sys;
    const base = 2600 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) s.tone({ freq: base * (0.9 + Math.random() * 0.25), type: 'sine', dur: 0.06 + Math.random() * 0.06, gain: 0.025, slide: 0.7 + Math.random() * 0.7, delay: i * (0.09 + Math.random() * 0.05), bus: s.ambBus });
  }
}

// ---------------------------------------------------------------- music
// Sparse, generative: a slow pad + plucked figure for menus, a low beat in the garage,
// and a quiet tension layer while driving that swells with speed and danger.
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // aeolian
const CHORDS = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]]; // i - VI - VII - v (A minor based)

class Music {
  constructor(sys) {
    this.sys = sys;
    this.mode = 'off';
    this.intensity = 0;
    this.step = 0;
    this.next = 0;
    this.bpm = 72;
    this.root = 57; // A3
    this.out = sys.ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(sys.musicBus);
    this.delay = sys.ctx.createDelay(1); this.delay.delayTime.value = 0.42;
    this.fb = sys.ctx.createGain(); this.fb.gain.value = 0.35;
    this.dlp = sys.ctx.createBiquadFilter(); this.dlp.type = 'lowpass'; this.dlp.frequency.value = 1800;
    this.delay.connect(this.dlp).connect(this.fb).connect(this.delay);
    this.dlp.connect(this.out);
    this.pads = [];
    this.timer = setInterval(() => this.tick(), 90);
  }
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    const t = this.sys.ctx.currentTime;
    this.out.gain.setTargetAtTime(m === 'off' ? 0 : m === 'drive' ? 0.6 : 1, t, 1.2);
    this.bpm = m === 'garage' ? 84 : 72;
    this.step = 0;
    this.next = t + 0.1;
  }
  setIntensity(v) { this.intensity = clamp(v, 0, 1); }
  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  tick() {
    const s = this.sys;
    if (!s.ready() || this.mode === 'off') return;
    const ctx = s.ctx;
    const spb = 60 / this.bpm / 2; // eighth notes
    while (this.next < ctx.currentTime + 0.25) {
      this.play(this.step, this.next, spb);
      this.next += spb;
      this.step++;
    }
  }
  pad(notes, t, dur, gain) {
    const ctx = this.sys.ctx;
    for (const n of notes) for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.midi(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.5;
      const g = ctx.createGain();
      o.connect(f).connect(g).connect(this.out);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(900, t + dur * 0.5); f.frequency.linearRampToValueAtTime(500, t + dur);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
  pluck(n, t, gain = 0.06, len = 1.2) {
    const ctx = this.sys.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = this.midi(n);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = this.midi(n) * 2.01;
    const g = ctx.createGain(); const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.out); g.connect(this.delay);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }
  kick(t, g = 0.25) {
    const ctx = this.sys.ctx;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const gg = ctx.createGain(); o.connect(gg).connect(this.out);
    gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.4);
  }
  hat(t, g = 0.03) {
    const s = this.sys, ctx = s.ctx;
    const src = s.noiseSrc(s.white, false); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const gg = ctx.createGain(); src.connect(f).connect(gg).connect(this.out);
    gg.gain.setValueAtTime(g, t); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.start(t, Math.random()); src.stop(t + 0.06);
  }
  bass(n, t, dur, g = 0.12) {
    const ctx = this.sys.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = this.midi(n);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const gg = ctx.createGain(); o.connect(f).connect(gg).connect(this.out);
    gg.gain.setValueAtTime(0.0001, t); gg.gain.linearRampToValueAtTime(g, t + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  play(step, t, spb) {
    const bar = Math.floor(step / 8), beat = step % 8;
    const chord = CHORDS[bar % 4];
    const R = this.root;
    if (this.mode === 'menu') {
      if (beat === 0) this.pad(chord.map((c) => R + c), t, spb * 8.4, 0.022);
      if (beat === 0 || beat === 3 || beat === 5 || (beat === 6 && bar % 2)) {
        const deg = SCALE[(bar * 3 + beat * 2) % 7] + (beat === 5 ? 12 : 0);
        this.pluck(R + 12 + deg, t, 0.045, 1.6);
      }
      if (beat === 0 && bar % 2 === 0) this.bass(R - 12 + chord[0], t, spb * 7, 0.07);
    } else if (this.mode === 'garage') {
      if (beat === 0 || beat === 4 || (beat === 7 && bar % 2)) this.kick(t, 0.16);
      if (beat % 2 === 1) this.hat(t, 0.018);
      if (beat === 0 || beat === 3 || beat === 6) this.bass(R - 12 + chord[0] + (beat === 6 ? 7 : 0), t, spb * 2, 0.09);
      if (beat === 2 && bar % 2 === 0) this.pad(chord.map((c) => R + c), t, spb * 6, 0.012);
      if (beat === 5 && bar % 4 === 3) this.pluck(R + 12 + chord[2], t, 0.03, 1);
    } else if (this.mode === 'drive') {
      const I = this.intensity;
      if (beat === 0 && bar % 2 === 0) this.pad([R - 12 + chord[0], R + chord[0] - 5], t, spb * 16, 0.006 + I * 0.02);
      if (I > 0.35 && (beat === 0 || beat === 4)) this.kick(t, 0.05 + I * 0.12);
      if (I > 0.55 && beat % 2 === 1) this.hat(t, 0.006 + I * 0.015);
      if (I > 0.45 && (beat === 0 || beat === 3 || beat === 6)) this.bass(R - 12 + chord[0], t, spb * 1.6, 0.03 + I * 0.06);
      if (I > 0.7 && beat === 2) this.pluck(R + 12 + chord[1], t, 0.025, 0.8);
    }
  }
}

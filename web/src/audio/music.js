// Generative soundtrack: a small playlist of original instrumental tracks synthesised live
// with WebAudio (no samples, no files). Each track has its own groove, chords, bass line,
// drum kit and a hook melody, arranged in sections (intro, A, B, break) so it doesn't loop
// like a ringtone. The shop always has music; the radio/hi-fi upgrades make it fuller.
import { rand, pick } from '../core/util.js';

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// chord = [root, ...voicing] in midi; melody: scale degrees indexes into `scale` (null = rest)
export const TRACKS = [
  {
    id: 'fresh', title: 'Fresh Fade', artist: 'The Clippers', bpm: 90, swing: 0.14, kit: 'boom',
    scale: [62, 64, 65, 67, 69, 72, 74, 76],
    prog: { A: [[50, 57, 60, 64, 65], [55, 59, 62, 65, 69], [48, 55, 59, 62, 64], [45, 55, 57, 61, 64]], B: [[53, 57, 60, 64, 67], [52, 55, 59, 62, 67], [50, 57, 60, 65, 69], [55, 59, 62, 65, 71]] },
    hook: [4, null, 3, 2, null, 4, 5, null, 4, 3, null, 2, 1, null, 2, null],
    form: ['intro', 'A', 'A', 'B', 'A', 'break', 'B', 'A'],
    lead: 'ep', bassStyle: 'walk',
  },
  {
    id: 'saturday', title: 'Saturday Line-Up', artist: 'DJ Sideburn', bpm: 112, swing: 0.04, kit: 'disco',
    scale: [57, 60, 62, 64, 67, 69, 72, 74],
    prog: { A: [[45, 57, 60, 64, 67], [50, 57, 62, 65, 69], [43, 55, 59, 62, 67], [48, 55, 60, 64, 67]], B: [[41, 57, 60, 65, 69], [43, 55, 59, 62, 67], [45, 57, 60, 64, 69], [52, 56, 59, 62, 68]] },
    hook: [5, 5, null, 4, 5, null, 7, null, 5, null, 4, 2, null, 4, null, null],
    form: ['intro', 'A', 'B', 'A', 'B', 'break', 'B', 'B'],
    lead: 'brass', bassStyle: 'octave',
  },
  {
    id: 'smooth', title: 'Hot Towel', artist: 'Velvet Razor', bpm: 76, swing: 0.2, kit: 'soft',
    scale: [60, 62, 63, 65, 67, 70, 72, 74],
    prog: { A: [[48, 58, 62, 63, 67], [53, 57, 60, 63, 67], [46, 58, 62, 65, 69], [51, 58, 62, 65, 70]], B: [[56, 60, 63, 67, 70], [55, 58, 62, 65, 70], [53, 57, 60, 63, 67], [55, 59, 62, 65, 69]] },
    hook: [4, null, null, 5, 4, null, 2, null, 3, null, null, 2, 0, null, null, null],
    form: ['intro', 'A', 'A', 'B', 'break', 'A', 'B', 'A'],
    lead: 'flute', bassStyle: 'sub',
  },
  {
    id: 'grind', title: 'Grind Mode', artist: 'Lil Taper', bpm: 140, swing: 0, kit: 'trap', half: true,
    scale: [53, 56, 58, 60, 63, 65, 68, 70],
    prog: { A: [[41, 56, 60, 63, 65], [44, 56, 60, 63, 68], [39, 55, 58, 63, 67], [46, 58, 61, 65, 70]], B: [[37, 56, 60, 61, 65], [39, 55, 58, 63, 67], [41, 56, 60, 63, 65], [43, 55, 58, 62, 67]] },
    hook: [4, null, 4, null, 3, null, 4, 6, null, null, 4, null, 3, 1, null, null],
    form: ['intro', 'A', 'A', 'B', 'A', 'break', 'B', 'A'],
    lead: 'pluck', bassStyle: '808',
  },
];

export class Music {
  constructor(engine) {
    this.e = engine;          // the AudioEngine (ctx, bus, noise buffers)
    this.track = null;
    this.idx = 0;
    this.quality = 0;         // 0 tinny shop speaker, 1 radio, 2 hi-fi
  }

  get ctx() { return this.e.ctx; }

  play(i = this.idx, opts = {}) {
    const ctx = this.ctx;
    if (!ctx) return null;
    this.stop(0.6);
    this.idx = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    const T = TRACKS[this.idx];
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    // tone of the playback system
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
    const q = opts.quality ?? this.quality;
    lp.frequency.value = [3200, 7000, 16000][q]; hp.frequency.value = [260, 90, 30][q];
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    const makeup = ctx.createGain(); makeup.gain.value = 2.6;
    out.connect(hp).connect(lp).connect(comp).connect(makeup).connect(this.e.bus.music);
    out.gain.setTargetAtTime((opts.volume ?? 0.6) * [0.75, 0.9, 1][q], ctx.currentTime, 0.8);
    // a little room
    const dl = ctx.createDelay(); dl.delayTime.value = 60 / T.bpm * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.22;
    const wet = ctx.createGain(); wet.gain.value = 0.18;
    const send = ctx.createGain(); send.gain.value = 1;
    send.connect(dl).connect(fb).connect(dl); dl.connect(wet).connect(out);
    // vinyl bed
    const vin = ctx.createBufferSource(); vin.buffer = this.e.noise; vin.loop = true;
    const vf = ctx.createBiquadFilter(); vf.type = 'bandpass'; vf.frequency.value = 5000; vf.Q.value = 0.4;
    const vg = ctx.createGain(); vg.gain.value = T.kit === 'soft' || T.kit === 'boom' ? 0.008 : 0.003;
    vin.connect(vf).connect(vg).connect(out); vin.start();

    const st = { T, out, send, vin, timer: null, step: (opts.startBar || 0) * 16, next: ctx.currentTime + 0.12, sec: 0, opts };
    this.track = st;
    const sixteenth = 60 / T.bpm / 4;
    const barSteps = 16;
    st.timer = setInterval(() => {
      if (!this.ctx) return;
      while (st.next < ctx.currentTime + 0.3) {
        const s = st.step;
        const bar = Math.floor(s / barSteps);
        const secIdx = Math.floor(bar / 4);
        if (secIdx >= T.form.length) {
          // the song is over: next one
          clearInterval(st.timer);
          setTimeout(() => { if (this.track === st) { const T2 = this.play(this.idx + 1, st.opts); this.onTrack?.(T2); } }, 400);
          return;
        }
        const section = T.form[secIdx];
        const i16 = s % barSteps;
        const sw = (i16 % 2 === 1) ? sixteenth * T.swing * 2 : 0;
        const t = st.next + sw;
        const prog = T.prog[section === 'B' ? 'B' : 'A'];
        const chord = prog[bar % 4];
        this.voice(T, section, chord, i16, bar, t, sixteenth, out, send);
        st.step++;
        st.next += sixteenth;
      }
    }, 30);
    return T;
  }

  stop(fade = 0.8) {
    const st = this.track;
    if (!st || !this.ctx) return;
    this.track = null;
    clearInterval(st.timer);
    st.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 3);
    setTimeout(() => { try { st.vin.stop(); } catch (e) { /* */ } st.out.disconnect(); }, fade * 1000 + 400);
  }

  setQuality(q) { this.quality = q; }

  // ------------------------------------------------------------------ one sixteenth
  voice(T, section, chord, i16, bar, t, six, out, send) {
    const intro = section === 'intro', brk = section === 'break';
    const beat = six * 4;
    // chords
    if (i16 === 0) {
      const v = intro || brk ? 0.05 : 0.04;
      chord.slice(1).forEach((n, k) => this.keys(midi(n), t + k * 0.01, beat * (T.kit === 'disco' ? 1.6 : 3.8), v, T, out));
    }
    if (T.kit === 'disco' && (i16 === 6 || i16 === 10 || i16 === 14) && !intro) chord.slice(2).forEach((n, k) => this.keys(midi(n), t + k * 0.008, six * 1.5, 0.03, T, out));
    if (T.kit === 'boom' && i16 === 11 && !intro) chord.slice(3).forEach((n, k) => this.keys(midi(n + 12), t + k * 0.01, beat, 0.018, T, out));
    // bass
    if (!intro) this.bassLine(T, chord, i16, t, six, out);
    // drums
    if (!intro || bar % 4 === 3) this.drums(T, i16, t, brk, out, send);
    // hook melody (A/B sections, every other bar it answers itself an octave down)
    if ((section === 'A' || section === 'B') && !(T.kit === 'trap' && bar % 2)) {
      const deg = T.hook[i16];
      if (deg !== null && deg !== undefined && (section === 'B' || bar % 4 < 3)) {
        const n = T.scale[(deg + (section === 'B' ? 1 : 0)) % T.scale.length] + (bar % 2 ? 0 : 12);
        this.lead(T, midi(n), t, six * (T.hook[i16 + 1] === null ? 2.6 : 1.4), out, send);
      }
    }
    // break: a filtered pad swell and a fill on the last bar
    if (brk && i16 === 0) chord.slice(1).forEach((n) => this.pad(midi(n + 12), t, beat * 4, out));
  }

  osc(type, f, t, dur, v, out, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + (opts.slideT || dur));
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opts.a || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(opts.lp, t); if (opts.lpTo) f2.frequency.exponentialRampToValueAtTime(opts.lpTo, t + dur); f2.Q.value = opts.q || 1; node = o.connect(f2); }
    node.connect(g).connect(out);
    if (opts.send) g.connect(opts.send);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  keys(f, t, dur, v, T, out) {
    if (T.kit === 'trap') { this.osc('triangle', f, t, dur, v * 0.9, out, { lp: 2400, a: 0.02 }); return; }
    if (T.kit === 'disco') { this.osc('sawtooth', f, t, dur, v * 0.5, out, { lp: 2600, lpTo: 900, a: 0.005 }); this.osc('square', f * 2, t, dur * 0.6, v * 0.12, out, { lp: 3000 }); return; }
    // Rhodes-ish: FM bell attack over a sine
    const ctx = this.ctx;
    const c = ctx.createOscillator(); c.frequency.value = f;
    const m = ctx.createOscillator(); m.frequency.value = f * 7;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.4, t); mg.gain.exponentialRampToValueAtTime(1, t + 0.3);
    m.connect(mg).connect(c.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // tremolo
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.5; const lg = ctx.createGain(); lg.gain.value = v * 0.25;
    lfo.connect(lg).connect(g.gain);
    c.connect(g).connect(out);
    c.start(t); m.start(t); lfo.start(t); c.stop(t + dur + 0.1); m.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }

  pad(f, t, dur, out) {
    for (const d of [-8, 8]) this.osc('sawtooth', f, t, dur, 0.012, out, { lp: 400, lpTo: 2200, a: dur * 0.6, detune: d });
  }

  lead(T, f, t, dur, out, send) {
    if (T.lead === 'brass') { this.osc('sawtooth', f, t, dur, 0.05, out, { lp: 1200, lpTo: 3600, a: 0.02, send }); this.osc('sawtooth', f, t, dur, 0.03, out, { lp: 1800, detune: 9 }); }
    else if (T.lead === 'flute') { this.osc('sine', f, t, dur, 0.06, out, { a: 0.05, send }); this.osc('triangle', f * 2, t, dur * 0.8, 0.01, out, { a: 0.06 }); }
    else if (T.lead === 'pluck') this.osc('square', f, t, dur * 0.7, 0.035, out, { lp: 4000, lpTo: 500, a: 0.003, send });
    else { this.keys(f, t, dur * 1.6, 0.045, T, out); if (send) this.keys(f, t, dur, 0.02, T, send); }
  }

  bassLine(T, chord, i16, t, six, out) {
    const r = chord[0] - 12;
    if (T.bassStyle === '808') {
      if (i16 === 0 || i16 === 7 || i16 === 10) this.osc('sine', midi(r), t, six * (i16 === 0 ? 7 : 3), 0.32, out, { slide: midi(r) * (i16 === 10 ? 0.92 : 0.98), a: 0.004 });
    } else if (T.bassStyle === 'octave') {
      if (i16 % 2 === 0) this.osc('sawtooth', midi(r + (i16 % 4 === 2 ? 12 : 0)), t, six * 1.2, 0.09, out, { lp: 900, a: 0.004 });
    } else if (T.bassStyle === 'sub') {
      if (i16 === 0 || i16 === 6 || i16 === 10) this.osc('sine', midi(r + (i16 === 10 ? 7 : 0)), t, six * 3.2, 0.2, out, { a: 0.01 });
    } else {
      // walking: root, fifth, octave, approach
      const pat = { 0: 0, 4: 7, 8: 12, 11: 10, 14: 5 };
      if (pat[i16] !== undefined) this.osc('triangle', midi(r + pat[i16]), t, six * 2.6, 0.17, out, { lp: 1100, a: 0.006 });
    }
  }

  drums(T, i16, t, brk, out, send) {
    const k = T.kit;
    const kick = (v = 1) => this.osc('sine', 150, t, 0.32, 0.5 * v, out, { slide: 40, slideT: 0.12, a: 0.002 });
    const click = () => this.noise(t, 0.01, 0.05, 'highpass', 3000, out);
    const snare = (v = 1) => { this.noise(t, 0.18, 0.16 * v, 'bandpass', 1900, out, 0.8); this.osc('triangle', 210, t, 0.1, 0.12 * v, out, { slide: 160 }); };
    const clap = () => { for (let d = 0; d < 3; d++) this.noise(t + d * 0.012, 0.12, 0.09, 'bandpass', 1400, out, 1.4); };
    const hat = (v = 1, open = false) => this.noise(t, open ? 0.25 : 0.035, 0.05 * v, 'highpass', 8000, out);
    if (brk) { if (i16 % 4 === 0) hat(0.6); if (i16 === 12 || i16 === 14 || i16 === 15) snare(0.6); return; }
    if (k === 'boom') {
      if (i16 === 0 || i16 === 10 || (i16 === 7 && Math.random() < 0.4)) { kick(); click(); }
      if (i16 === 4 || i16 === 12) snare();
      if (i16 % 2 === 0) hat(i16 % 4 ? 0.6 : 1);
    } else if (k === 'disco') {
      if (i16 % 4 === 0) { kick(); click(); }
      if (i16 === 4 || i16 === 12) { clap(); snare(0.5); }
      if (i16 % 4 === 2) hat(1, true); else if (i16 % 2 === 1) hat(0.5);
    } else if (k === 'soft') {
      if (i16 === 0 || i16 === 9) kick(0.7);
      if (i16 === 4 || i16 === 12) this.noise(t, 0.12, 0.07, 'bandpass', 2400, out, 0.6);      // rimshot-ish
      if (i16 % 2 === 0) this.noise(t, 0.05, 0.025, 'bandpass', 6000, out, 0.5);              // brushed hat
    } else if (k === 'trap') {
      if (i16 === 0 || i16 === 11) kick();
      if (i16 === 8) { clap(); snare(0.6); }
      if (i16 % 2 === 0 || (i16 > 12 && Math.random() < 0.7)) hat(i16 % 4 ? 0.5 : 0.9);
    }
  }

  noise(t, dur, v, type, f, out, q = 0.7) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.e.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(out);
    s.start(t, rand(0, 1.5)); s.stop(t + dur + 0.02);
  }
}

export { pick };

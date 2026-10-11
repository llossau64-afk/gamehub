// Generates ASCEND's original sound effects procedurally (no third-party audio).
// Usage: node scripts/generate-sounds.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');
mkdirSync(OUT, { recursive: true });
const R = 22050;

function wav(name, samples, rate = R) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const norm = peak > 0.98 ? 0.98 / peak : 1;
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * norm)) * 32767), 44 + i * 2));
  writeFileSync(join(OUT, name), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB`);
}

const TAU = Math.PI * 2;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz
let seed = 1;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647) * 2 - 1;
};

function render(seconds, fn, rate = R) {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / rate, i);
  return out;
}

// Bell-like tone with inharmonic partials and exponential decay.
const bell = (t, f, start, decay = 3, amp = 1) => {
  const x = t - start;
  if (x < 0) return 0;
  const env = Math.exp(-decay * x) * Math.min(1, x * 400);
  return amp * env * (Math.sin(TAU * f * x) + 0.45 * Math.sin(TAU * f * 2.01 * x) * Math.exp(-decay * x) + 0.2 * Math.sin(TAU * f * 3.98 * x) * Math.exp(-2 * decay * x));
};

const soft = (t, f, start, len, amp = 1) => {
  const x = t - start;
  if (x < 0 || x > len) return 0;
  const env = Math.min(1, x / 0.08) * Math.min(1, (len - x) / 0.25);
  return amp * env * (Math.sin(TAU * f * x) + 0.3 * Math.sin(TAU * f * 2 * x) + 0.12 * Math.sin(TAU * f * 3 * x));
};

// UI tap — a short, soft, glassy tick.
wav('tap.wav', render(0.06, (t) => 0.35 * Math.exp(-70 * t) * (Math.sin(TAU * 2100 * t) + 0.3 * noise() * Math.exp(-200 * t))), R);

// XP collect — quick rising blip.
wav('xp.wav', render(0.16, (t) => {
  const f = 900 + 2400 * t;
  return 0.5 * Math.exp(-14 * t) * Math.min(1, t * 300) * Math.sin(TAU * f * t);
}));

// Reward chime — two bright bell notes.
wav('reward.wav', render(0.9, (t) => 0.5 * (bell(t, note(88), 0, 5) + bell(t, note(95), 0.09, 4.5))));

// Rest finished — two gentle pips.
wav('rest-end.wav', render(0.45, (t) => 0.45 * (bell(t, note(84), 0, 14) + bell(t, note(84), 0.2, 14))));

// Workout complete — warm rising triad held into a shimmer.
wav('complete.wav', render(1.6, (t) => {
  const chord = soft(t, note(67), 0, 1.5, 0.35) + soft(t, note(72), 0.12, 1.38, 0.35) + soft(t, note(76), 0.24, 1.26, 0.35);
  const sparkle = bell(t, note(91), 0.3, 4, 0.25) + bell(t, note(96), 0.42, 4, 0.2);
  return chord + sparkle;
}));

// Level up — ascending arpeggio, sub swell and shimmer tail.
wav('levelup.wav', render(2.0, (t) => {
  const arp = [72, 76, 79, 84, 88].reduce((a, n, i) => a + bell(t, note(n), i * 0.085, 3.2, 0.35), 0);
  const swell = Math.sin(TAU * note(48) * t) * Math.min(1, t / 0.4) * Math.exp(-1.8 * t) * 0.35;
  const shimmer = 0.06 * noise() * Math.exp(-3 * Math.abs(t - 0.6)) * (t > 0.4 ? 1 : 0);
  return arp + swell + shimmer;
}));

// Rank promotion — low impact, minor→major resolution, long airy tail.
wav('rank.wav', render(3.2, (t) => {
  const boom = Math.sin(TAU * (55 - 20 * t) * t) * Math.exp(-3 * t) * 0.8 + noise() * Math.exp(-25 * t) * 0.25;
  const minor = [57, 60, 64].reduce((a, n) => a + soft(t, note(n), 0.15, 1.0, 0.18), 0);
  const major = [60, 64, 67, 72].reduce((a, n) => a + soft(t, note(n), 1.0, 2.1, 0.18), 0);
  const crown = bell(t, note(96), 1.05, 2.5, 0.25) + bell(t, note(100), 1.2, 2.5, 0.2) + bell(t, note(103), 1.35, 2.5, 0.18);
  return boom + minor + major + crown;
}));

// Ambient music loop — seamless 24 s pad (all partials complete whole cycles).
{
  const rate = 16000;
  const T = 24;
  const fit = (f) => Math.round(f * T) / T;
  const chord = [45, 52, 57, 59, 64].map((n) => fit(note(n)));
  const lfo = (k) => 0.5 + 0.5 * Math.sin((TAU * k * t0) / T);
  let t0 = 0;
  const samples = render(
    T,
    (t) => {
      t0 = t;
      let s = 0;
      chord.forEach((f, i) => {
        const breathe = lfo(i + 1);
        s += (0.12 + 0.1 * breathe) * (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * 2 * f * t));
      });
      return s * 0.35;
    },
    rate,
  );
  wav('ambient.wav', samples, rate);
}

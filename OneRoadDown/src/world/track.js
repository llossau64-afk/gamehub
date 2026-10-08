// The mountain road: a single deterministic centreline sampled every STEP metres,
// plus everything that lives along it (surfaces, rails, hazards, pickups, shortcuts,
// tunnels, bridges, props). The terrain is defined *relative* to the road so the
// physics and the visible meshes share exactly one height function: `query()`.

import { rng, Noise, clamp, lerp, smoothstep } from '../core/util.js';
import { BLEND } from '../data/mountains.js';

export const STEP = 2;
export const SHOULDER = 1.0;

export const SURF = {
  ASPHALT: 0, DAMAGED: 1, GRAVEL: 2, DIRT: 3, MUD: 4, SNOW: 5, ICE: 6,
  GRASS: 7, ROCK: 8, WATER: 9, SAND: 10, CONCRETE: 11,
};
// mu: base friction, roll: rolling resistance multiplier, group: tyre compound class
// (0 paved, 1 loose, 2 mud, 3 snow/ice), dust: particle amount, rough: vibration.
export const SURF_INFO = [
  { name: 'ASPHALT', mu: 1.0, roll: 1.0, group: 0, dust: 0, rough: 0.02 },
  { name: 'BROKEN ASPHALT', mu: 0.93, roll: 1.25, group: 0, dust: 0.15, rough: 0.12 },
  { name: 'GRAVEL', mu: 0.72, roll: 2.0, group: 1, dust: 0.85, rough: 0.25 },
  { name: 'DIRT', mu: 0.75, roll: 2.3, group: 1, dust: 1.0, rough: 0.3 },
  { name: 'MUD', mu: 0.47, roll: 6.5, group: 2, dust: 0, splash: 1, rough: 0.15 },
  { name: 'SNOW', mu: 0.52, roll: 2.4, group: 3, dust: 0.7, snow: 1, rough: 0.08 },
  { name: 'ICE', mu: 0.2, roll: 0.9, group: 3, dust: 0.1, snow: 1, rough: 0 },
  { name: 'GRASS', mu: 0.62, roll: 3.2, group: 1, dust: 0.3, rough: 0.3 },
  { name: 'ROCK', mu: 0.8, roll: 1.6, group: 1, dust: 0.4, rough: 0.5 },
  { name: 'WATER', mu: 0.68, roll: 5.0, group: 0, splash: 1, rough: 0.05 },
  { name: 'SAND', mu: 0.56, roll: 5.0, group: 1, dust: 1.0, rough: 0.2 },
  { name: 'CONCRETE', mu: 1.02, roll: 1.0, group: 0, dust: 0, rough: 0.03 },
];

export const RAIL = { NONE: 0, STEEL: 1, WOOD: 2, CONCRETE: 3 };
const RAIL_BREAK = [0, 21, 15, 999]; // impact speed (m/s) needed to break a rail section

const COARSE = 8; // coarse sample stride for spatial queries
const CELL = 80;
const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

export class Track {
  constructor(mountain) {
    this.m = mountain;
    this.length = mountain.length;
    this.total = mountain.length + 700;
    this.N = Math.ceil(this.total / STEP) + 1;
    // a few seeds may produce a road that crosses itself; walk forward deterministically
    for (let k = 0; k < 12; k++) {
      this.seed = mountain.seed + k * 101;
      this.noise = new Noise(this.seed * 7 + 3);
      this.generate();
      if (this.minSeparation() > 34) break;
    }
  }

  minSeparation() {
    let min = 1e9;
    for (let i = 0; i < this.N; i += 3) {
      const cx = Math.floor(this.px[i] / CELL), cz = Math.floor(this.pz[i] / CELL);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = this.cells.get(key(cx + dx, cz + dz)); if (!a) continue;
        for (const q0 of a) for (let q = q0; q < Math.min(this.N, q0 + COARSE); q += 2) {
          if (Math.abs(q - i) < 150) continue;
          const d = Math.hypot(this.px[q] - this.px[i], this.pz[q] - this.pz[i]);
          if (d < min) min = d;
        }
      }
    }
    return min;
  }

  // ---------------------------------------------------------------- biomes
  biomeIndex(s) {
    const b = this.m.biomes;
    for (let i = 0; i < b.length; i++) if (s < b[i].end) return i;
    return b.length - 1;
  }
  biome(s) { return this.m.biomes[this.biomeIndex(s)]; }
  // Returns [indexA, indexB, t] for smooth blending of numeric biome params.
  biomeBlend(s) {
    const b = this.m.biomes;
    const i = this.biomeIndex(s);
    const half = BLEND / 2;
    if (i < b.length - 1 && s > b[i].end - half) return [i, i + 1, smoothstep(b[i].end - half, b[i].end + half, s)];
    if (i > 0 && s < b[i].start + half) return [i - 1, i, smoothstep(b[i].start - half, b[i].start + half, s)];
    return [i, i, 0];
  }
  biomeNum(s, getter) {
    const [a, c, t] = this.biomeBlend(s);
    const b = this.m.biomes;
    return t === 0 ? getter(b[a]) : lerp(getter(b[a]), getter(b[c]), t);
  }

  // -------------------------------------------------------------- generation
  generate() {
    const N = this.N, R = rng(this.seed), noise = this.noise;
    this.rand = R;
    const k = (this.k = new Float32Array(N));
    const px = (this.px = new Float32Array(N));
    const pz = (this.pz = new Float32Array(N));
    const hd = (this.hd = new Float32Array(N));
    const py = (this.py = new Float32Array(N));
    this.isHairpin = new Uint8Array(N);

    // --- plan curvature piece by piece, rejecting pieces that approach older road
    const grid = new Map();
    const addGrid = (j) => {
      const kk = key(Math.floor(px[j] / 50), Math.floor(pz[j] / 50));
      let a = grid.get(kk); if (!a) grid.set(kk, (a = [])); a.push(j);
    };
    const clearOK = (j0, j1) => {
      for (let j = j0; j <= j1; j++) {
        const cx = Math.floor(px[j] / 50), cz = Math.floor(pz[j] / 50);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const a = grid.get(key(cx + dx, cz + dz)); if (!a) continue;
          for (const q of a) {
            if (q > j - 160) continue;
            const ex = px[q] - px[j], ez = pz[q] - pz[j];
            if (ex * ex + ez * ez < 46 * 46) return false;
          }
        }
      }
      return true;
    };
    const integrate = (j0, j1) => {
      for (let j = Math.max(1, j0); j <= j1; j++) {
        const th = hd[j - 1] + 0.5 * (k[j - 1] + k[j]) * STEP;
        hd[j] = th;
        const tm = 0.5 * (hd[j - 1] + th);
        px[j] = px[j - 1] + Math.sin(tm) * STEP;
        pz[j] = pz[j - 1] + Math.cos(tm) * STEP;
      }
    };
    const curve = (out, angle, radius, dir) => {
      const arc = angle * radius;
      const tr = clamp(arc * 0.28, 6, 34);
      const kmax = dir / radius;
      const hold = Math.max(0, arc - tr);
      const nt = Math.max(1, Math.round(tr / STEP)), nh = Math.round(hold / STEP);
      for (let i = 0; i < nt; i++) out.push(kmax * (i + 0.5) / nt);
      for (let i = 0; i < nh; i++) out.push(kmax);
      for (let i = 0; i < nt; i++) out.push(kmax * (1 - (i + 0.5) / nt));
    };
    const straight = (out, len) => { for (let i = 0, n = Math.round(len / STEP); i < n; i++) out.push(0); };

    let i = 0;
    hd[0] = 0; px[0] = 0; pz[0] = 0; addGrid(0);
    // Summit: a calm opening straight through the village square.
    const opening = []; straight(opening, 90);
    for (const v of opening) k[++i] = v;
    integrate(1, i); for (let j = 1; j <= i; j++) addGrid(j);

    while (i < N - 1) {
      const s = i * STEP;
      const b = this.biome(s);
      const th = hd[i];
      let placed = false;
      for (let attempt = 0; attempt < 10 && !placed; attempt++) {
        const out = [];
        const w = b.plan;
        let type;
        if (attempt >= 7) type = 'straight';
        else {
          const tot = w.straight + w.sweep + w.tight + w.hairpin;
          let r = R() * tot;
          type = (r -= w.straight) < 0 ? 'straight' : (r -= w.sweep) < 0 ? 'sweep' : (r -= w.tight) < 0 ? 'tight' : 'hairpin';
          if (s > this.length - 400) type = R() < 0.7 ? 'straight' : 'sweep';
        }
        // turn direction biased so the road keeps heading generally "down" the mountain (+z)
        let dir = R() < 0.5 + clamp(-th * 0.45, -0.45, 0.45) ? 1 : -1;
        if (Math.abs(th) > 1.15) dir = -Math.sign(th);
        if (attempt % 2 === 1) dir = -dir;
        let hairpin = false;
        if (type === 'straight') straight(out, b.id === 'highway' || b.id === 'dryhwy' ? R.range(90, 330) : R.range(30, 150));
        else if (type === 'sweep') curve(out, R.range(0.25, 0.95), R.range(b.id === 'highway' ? 180 : 90, b.id === 'highway' ? 420 : 260), dir);
        else if (type === 'tight') curve(out, R.range(0.7, 1.75), R.range(36, 70), dir);
        else {
          if (Math.abs(th) > 0.85) { curve(out, R.range(0.5, 1.0), R.range(40, 60), -Math.sign(th)); }
          else {
            hairpin = true;
            const d0 = R() < 0.5 ? 1 : -1;
            straight(out, R.range(20, 50));
            curve(out, Math.PI, R.range(23, 29), d0);
            straight(out, R.range(70, 150));
            curve(out, Math.PI, R.range(23, 29), -d0);
            straight(out, R.range(20, 40));
          }
        }
        const n = Math.min(out.length, N - 1 - i);
        for (let j = 0; j < n; j++) k[i + 1 + j] = out[j];
        integrate(i + 1, i + n);
        if (clearOK(i + 1, i + n) || attempt === 9) {
          if (hairpin) for (let j = 0; j < n; j++) if (Math.abs(out[j]) > 1 / 32) this.isHairpin[i + 1 + j] = 1;
          for (let j = 1; j <= n; j++) addGrid(i + j);
          i += n;
          placed = true;
        } else {
          for (let j = 0; j < n; j++) k[i + 1 + j] = 0;
        }
      }
    }
    // Dense spatial index used by the wall-side analysis.
    this._grid50 = grid;

    // --- widths, grade and height
    const width = (this.width = new Float32Array(N));
    const grade = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const s = j * STEP;
      const ak = Math.abs(k[j]);
      width[j] = this.biomeNum(s, (b) => b.width) + 1.8 * smoothstep(0.012, 0.04, ak);
      const gmin = this.biomeNum(s, (b) => b.grade[0]), gmax = this.biomeNum(s, (b) => b.grade[1]);
      let g = lerp(gmin, gmax, 0.5 + 0.5 * noise.fbm(s * 0.0011, 4.7, 3));
      g *= 1 - 0.6 * smoothstep(0.012, 0.035, ak);
      // the odd short climb keeps torque and fuel meaningful
      const climb = noise.n2(s * 0.0021, 91.3);
      if (climb > 0.62 && s > 1500) g = lerp(g, -0.035, smoothstep(0.62, 0.8, climb));
      if (s < 120) g = 0.01;
      grade[j] = g;
    }
    smoothArr(width, 10);
    smoothArr(grade, 20);
    py[0] = this.m.startAltitude;
    for (let j = 1; j < N; j++) py[j] = py[j - 1] - grade[j] * STEP;
    this.grade = grade;

    // --- right vectors
    this.rx = new Float32Array(N); this.rz = new Float32Array(N);
    for (let j = 0; j < N; j++) { this.rx[j] = -Math.cos(hd[j]); this.rz[j] = Math.sin(hd[j]); }

    this.buildCoarseIndex();
    this.placeStructures(R);
    this.buildSides(R);
    this.placeJumps(R);
    this.placeShortcuts(R);
    this.placeSurfaces(R);
    this.placeRails(R);
    this.placeHazards(R);
    this.placePickups(R);
    this.placeSigns(R);
    this.placeProps(R);
    this.railBroken = new Uint8Array(N * 2);
  }

  buildCoarseIndex() {
    this.cells = new Map();
    for (let j = 0; j < this.N; j += COARSE) {
      const kk = key(Math.floor(this.px[j] / CELL), Math.floor(this.pz[j] / CELL));
      let a = this.cells.get(kk); if (!a) this.cells.set(kk, (a = [])); a.push(j);
    }
  }

  // Find stretches with low curvature.
  straightAt(j0, len, maxK) {
    const n = Math.round(len / STEP);
    if (j0 + n >= this.N) return false;
    for (let j = j0; j < j0 + n; j++) if (Math.abs(this.k[j]) > maxK || this.isHairpin[j]) return false;
    return true;
  }

  placeStructures(R) {
    const N = this.N;
    this.tunnel = new Uint8Array(N);
    this.bridge = new Uint8Array(N);
    this.tunnels = []; this.bridges = [];
    let lastEnd = 1600 / STEP;
    for (let j = Math.round(1500 / STEP); j < N - 400; j += Math.round(120 / STEP)) {
      const s = j * STEP;
      const b = this.biome(s);
      if (j < lastEnd + 200 / STEP) continue;
      if (s > this.length - 600) break;
      if (b.tunnel && R() < b.tunnel * 0.4) {
        const len = R.range(110, 260);
        if (this.straightAt(j, len, 0.02)) {
          const n = Math.round(len / STEP);
          for (let q = j; q < j + n; q++) this.tunnel[q] = 1;
          this.tunnels.push({ a: j, b: j + n });
          lastEnd = j + n; continue;
        }
      }
      if (b.bridge && R() < b.bridge * 0.2) {
        const len = R.range(60, 150);
        if (this.straightAt(j, len, 0.009)) {
          const n = Math.round(len / STEP);
          for (let q = j; q < j + n; q++) this.bridge[q] = 1;
          this.bridges.push({ a: j, b: j + n, style: b.id === 'highway' || b.id === 'dryhwy' ? 'concrete' : R() < 0.5 ? 'truss' : 'stone' });
          lastEnd = j + n;
        }
      }
    }
    // flatten the grade a little inside tunnels and over bridges
    for (const t of [...this.tunnels, ...this.bridges]) {
      const y0 = this.py[t.a], y1 = this.py[t.b];
      for (let q = t.a; q <= t.b; q++) {
        const u = (q - t.a) / (t.b - t.a);
        this.py[q] = lerp(this.py[q], lerp(y0, y1, u), 0.85);
      }
    }
  }

  buildSides(R) {
    const N = this.N, noise = this.noise;
    // Which side is uphill? Look for older (higher) road nearby on either side.
    const score = new Float32Array(N);
    const g = this._grid50;
    for (let j = 0; j < N; j++) {
      const x = this.px[j], z = this.pz[j];
      const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
      let sc = 0;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const a = g.get(key(cx + dx, cz + dz)); if (!a) continue;
        for (let n = 0; n < a.length; n += 3) {
          const q = a[n];
          if (Math.abs(q - j) < 70) continue;
          const ex = this.px[q] - x, ez = this.pz[q] - z;
          const d2 = ex * ex + ez * ez;
          if (d2 > 160 * 160) continue;
          const dy = this.py[q] - this.py[j];
          const side = ex * this.rx[j] + ez * this.rz[j];
          sc += Math.sign(side) * clamp(dy / 15, -1, 1) * (1 - Math.sqrt(d2) / 160);
        }
      }
      score[j] = sc * 0.35 + noise.n2(j * STEP * 0.0016, 17.1) * 0.9;
    }
    smoothArr(score, 30);
    // per side weights: [wall, drop, flat, cut, void] and slopes
    this.sw = new Float32Array(N * 2 * 5);
    this.slW = new Float32Array(N * 2);
    this.slD = new Float32Array(N * 2);
    this.cutSl = new Float32Array(N * 2);
    this.offSurf = new Uint8Array(N);
    for (let j = 0; j < N; j++) {
      const s = j * STEP;
      const wallR = smoothstep(-0.35, 0.35, score[j]);
      let flat = clamp(this.biomeNum(s, (b) => b.flat) + noise.n2(s * 0.003, 5.5) * 0.25, 0, 1);
      if (s < 160) flat = 1;
      const wS = this.biomeNum(s, (b) => b.wallSlope) * (0.75 + 0.5 * (0.5 + 0.5 * noise.n2(s * 0.004, 2.2)));
      const dS = this.biomeNum(s, (b) => b.dropSlope) * (0.75 + 0.5 * (0.5 + 0.5 * noise.n2(s * 0.005, 8.8)));
      for (let side = 0; side < 2; side++) {
        const isWall = side === 1 ? wallR : 1 - wallR;
        const o = (j * 2 + side) * 5;
        this.sw[o] = isWall * (1 - flat);
        this.sw[o + 1] = (1 - isWall) * (1 - flat);
        this.sw[o + 2] = flat;
        this.slW[j * 2 + side] = wS;
        this.slD[j * 2 + side] = dS;
      }
      const b = this.biome(s);
      this.offSurf[j] = b.look.snow > 0.5 ? SURF.SNOW : b.id.startsWith('mesa') || b.id === 'redwall' || b.id === 'gorge' || b.id === 'dryhwy' ? SURF.SAND : b.id === 'rocky' || b.id === 'cliffs' ? SURF.ROCK : SURF.GRASS;
    }
    // tunnels: rock both sides; bridges: void both sides (with abutment ramps)
    for (const t of this.tunnels) for (let q = t.a - 6; q <= t.b + 6; q++) {
      if (q < 0 || q >= N) continue;
      const u = q < t.a ? (q - (t.a - 6)) / 6 : q > t.b ? 1 - (q - t.b) / 6 : 1;
      for (let side = 0; side < 2; side++) {
        const o = (q * 2 + side) * 5;
        this.sw[o] = lerp(this.sw[o], 1, u); this.sw[o + 1] *= 1 - u; this.sw[o + 2] *= 1 - u;
        this.slW[q * 2 + side] = lerp(this.slW[q * 2 + side], 3.2, u);
      }
    }
    for (const t of this.bridges) for (let q = t.a; q <= t.b; q++) {
      const u = Math.min(1, (q - t.a) / 5, (t.b - q) / 5);
      for (let side = 0; side < 2; side++) {
        const o = (q * 2 + side) * 5;
        for (let c = 0; c < 4; c++) this.sw[o + c] *= 1 - u;
        this.sw[o + 4] = u;
      }
    }
  }

  placeJumps(R) {
    this.jumps = [];
    for (let j = Math.round(1200 / STEP); j < this.N - 200; j += Math.round(60 / STEP)) {
      const s = j * STEP, b = this.biome(s);
      if (!b.hazards.jumps || R() > b.hazards.jumps * 0.12) continue;
      if (!this.straightAt(j - 20, 120, 0.006) || this.tunnel[j] || this.bridge[j] || this.bridge[j + 20]) continue;
      const big = R() < 0.35;
      this.jumps.push({ s, h: big ? 1.35 : 0.85 });
      for (let q = j - 10; q < j + 20; q++) {
        const u = (q - j) * STEP;
        let h;
        const H = big ? 1.35 : 0.85;
        if (u < -14) h = 0;
        else if (u <= 0) h = H * Math.pow((u + 14) / 14, 1.6);
        else if (u <= 7) h = H - (u / 7) * (H + 0.5);
        else h = -0.5 * (1 - smoothstep(7, 36, u));
        this.py[q] += h;
      }
      j += Math.round(200 / STEP);
    }
  }

  placeShortcuts(R) {
    this.shortcuts = [];
    const N = this.N;
    // (a) switchback drops: older leg directly above a newer leg
    let lastB = 0;
    for (let a = 200; a < N - 300; a += 4) {
      if (a < lastB + 150) continue;
      const s = a * STEP, b = this.biome(s);
      if (!b.props.includes('shortcuts')) continue;
      let best = -1, bd = 1e9;
      for (let q = a + 70; q < Math.min(N - 1, a + 260); q += 2) {
        const ex = this.px[q] - this.px[a], ez = this.pz[q] - this.pz[a];
        const d2 = ex * ex + ez * ez;
        if (d2 < bd) { bd = d2; best = q; }
      }
      if (best < 0) continue;
      const dist = Math.sqrt(bd), dy = this.py[a] - this.py[best];
      if (dist < 44 || dist > 75 || dy < 6 || dy > 28 || this.tunnel[a] || this.bridge[a] || this.tunnel[best]) continue;
      if (R() > 0.75) { lastB = best; continue; }
      const sideA = (this.px[best] - this.px[a]) * this.rx[a] + (this.pz[best] - this.pz[a]) * this.rz[a] > 0 ? 1 : 0;
      const sideB = (this.px[a] - this.px[best]) * this.rx[best] + (this.pz[a] - this.pz[best]) * this.rz[best] > 0 ? 1 : 0;
      const slope = dy / Math.max(10, dist - this.width[a] / 2 - this.width[best] / 2 - 2);
      this.carveCut(a, sideA, 7, slope);
      this.carveCut(best, sideB, 9, -slope);
      this.shortcuts.push({ kind: 'drop', a, b: best, sideA, sideB, s0: a * STEP, s1: best * STEP, reward: 300 + Math.round(dy * 15) });
      lastB = best;
    }
    // (b) corner cuts: rough dirt across the inside of tight bends
    for (let j = 300; j < N - 200; j += 10) {
      const s = j * STEP, b = this.biome(s);
      if (!b.props.includes('shortcuts') && b.id !== 'forest' && b.id !== 'lower') continue;
      const kk = this.k[j];
      if (Math.abs(kk) < 1 / 75 || Math.abs(kk) > 1 / 30 || this.isHairpin[j] || this.tunnel[j] || this.bridge[j]) continue;
      if (this.shortcuts.some((c) => Math.abs(c.a - j) < 150)) continue;
      if (R() > 0.35) { j += 40; continue; }
      let a = j, e = j;
      while (a > 0 && Math.abs(this.k[a]) > 1 / 120) a--;
      while (e < N - 1 && Math.abs(this.k[e]) > 1 / 120) e++;
      if (e - a < 15 || e - a > 70) continue;
      const inner = kk > 0 ? 0 : 1; // left turn -> inside is the left (negative d) side
      for (let q = a - 4; q <= e + 4; q++) {
        const u = Math.min(1, (q - (a - 4)) / 6, (e + 4 - q) / 6);
        const o = (q * 2 + inner) * 5;
        for (let c = 0; c < 5; c++) this.sw[o + c] *= 1 - u;
        this.sw[o + 3] += u;
        this.cutSl[q * 2 + inner] = 0.015;
      }
      this.shortcuts.push({ kind: 'cut', a, b: e, side: inner, s0: a * STEP, s1: e * STEP, reward: 120 + (e - a) * 3 });
      j = e + 60;
    }
  }

  carveCut(j, side, half, slope) {
    for (let q = j - half - 5; q <= j + half + 5; q++) {
      if (q < 0 || q >= this.N) continue;
      const u = clamp(Math.min(q - (j - half - 5), j + half + 5 - q) / 5, 0, 1);
      const o = (q * 2 + side) * 5;
      for (let c = 0; c < 5; c++) this.sw[o + c] *= 1 - u;
      this.sw[o + 3] += u;
      this.cutSl[q * 2 + side] = slope;
    }
  }

  placeSurfaces(R) {
    const N = this.N;
    this.surf = new Uint8Array(N);
    let j = 0;
    while (j < N) {
      const s = j * STEP, b = this.biome(s);
      const len = Math.round(R.range(80, 260) / STEP);
      const sf = b.surface;
      let t = sf.base;
      const r = R();
      if (r < (sf.damaged || 0)) t = t === SURF.SNOW ? SURF.SNOW : SURF.DAMAGED;
      else if (r < (sf.damaged || 0) + (sf.gravel || 0)) t = SURF.GRAVEL;
      else if (r < (sf.damaged || 0) + (sf.gravel || 0) + (sf.dirt || 0)) t = SURF.DIRT;
      if (s < 300) t = SURF.ASPHALT;
      if (b.id === 'snow' && R() < 0.3) t = SURF.ASPHALT; // ploughed stretches
      for (let q = j; q < Math.min(N, j + len); q++) this.surf[q] = this.bridge[q] ? SURF.CONCRETE : this.tunnel[q] ? SURF.ASPHALT : t;
      j += len;
    }
  }

  placeRails(R) {
    const N = this.N, noise = this.noise;
    this.rail = new Uint8Array(N * 2);
    for (let j = 0; j < N; j++) {
      const s = j * STEP, b = this.biome(s);
      for (let side = 0; side < 2; side++) {
        const o = (j * 2 + side) * 5;
        const drop = this.sw[o + 1], cut = this.sw[o + 3];
        let t = RAIL.NONE;
        if (this.bridge[j]) t = b.railType === 2 ? RAIL.STEEL : b.railType || RAIL.STEEL;
        else if (!this.tunnel[j] && drop > 0.55 && cut < 0.1 && noise.n2(s * 0.006, side * 40 + 3) < b.rails * 1.6 - 0.6) t = b.railType;
        if (this.isHairpin[j] && drop > 0.4 && cut < 0.1 && !this.tunnel[j]) t = b.railType || RAIL.STEEL;
        this.rail[j * 2 + side] = t;
      }
    }
    // occasional missing sections ("someone went through here before")
    this.railGaps = [];
    for (let j = 400; j < N - 100; j += 50) {
      if (R() > 0.1) continue;
      const side = R() < 0.5 ? 0 : 1;
      if (!this.rail[j * 2 + side] || this.bridge[j]) continue;
      const n = R.int(3, 7);
      for (let q = j; q < j + n; q++) this.rail[q * 2 + side] = RAIL.NONE;
      this.railGaps.push({ j: j + (n >> 1), side });
    }
  }

  placeHazards(R) {
    const N = this.N;
    this.decals = [];
    this.potholes = [];
    this.obstacles = [];
    this.rockfalls = [];
    this.potB = new Map();
    this.decalB = new Map();
    const per = (rate, lenM) => rate * lenM / 1000;
    for (let j = Math.round(250 / STEP); j < N - 60; j += Math.round(100 / STEP)) {
      const s = j * STEP, b = this.biome(s), hz = b.hazards;
      if (s > this.length) break;
      const W = this.width[j];
      const inT = this.tunnel[j], onB = this.bridge[j];
      const surf = this.surf[j];
      // potholes cluster on broken asphalt
      const pr = per(hz.potholes * (surf === SURF.DAMAGED ? 30 : 6), 100);
      for (let n = 0; n < pr; n++) if (R() < pr - n) {
        this.potholes.push({ s: s + R.range(0, 100), d: R.range(-W / 2 + 0.6, W / 2 - 0.6), r: R.range(0.35, 0.75), depth: R.range(0.07, 0.16) });
      }
      if (!onB && R() < per(hz.puddles * 3.5, 100)) {
        const L = R.range(2, 6), dd = R.range(-W / 2 + 1, W / 2 - 1);
        this.decals.push({ s0: s + 20, s1: s + 20 + L, d0: dd - R.range(0.8, 2), d1: dd + R.range(0.8, 2), type: SURF.WATER });
      }
      if (!inT && !onB && R() < per(hz.mud * 3, 100)) {
        const L = R.range(8, 24), side = R() < 0.5 ? -1 : 1;
        const d0 = side < 0 ? -W / 2 - 0.5 : R.range(-W / 2, 0), d1 = side < 0 ? R.range(0, W / 2) : W / 2 + 0.5;
        this.decals.push({ s0: s + 40, s1: s + 40 + L, d0, d1, type: SURF.MUD });
      }
      if (!inT && R() < per(hz.ice * 4, 100)) {
        const L = R.range(10, 40);
        this.decals.push({ s0: s + 30, s1: s + 30 + L, d0: R.range(-W / 2 - 0.5, -1), d1: R.range(1, W / 2 + 0.5), type: SURF.ICE });
      }
      if ((b.id === 'rocky' || b.id === 'cliffs' || b.id === 'redwall') && Math.abs(this.k[j]) > 1 / 90 && R() < 0.35) {
        this.decals.push({ s0: s + 10, s1: s + 30, d0: -W / 2, d1: W / 2, type: SURF.GRAVEL });
      }
      // obstacles
      const wallSide = this.sw[(j * 2 + 1) * 5] > this.sw[(j * 2) * 5] ? 1 : -1;
      if (!onB && R() < per(hz.rocks * 2.2, 100)) {
        const ss = s + R.range(0, 100), dd = wallSide * R.range(W / 2 - 1.4, W / 2 + 0.6);
        this.addObstacle('rock', ss, dd, R.range(0.45, 1.05), R);
      }
      if (!onB && !inT && R() < per(hz.fallenTrees * 1.6, 100) && Math.abs(this.k[j + 25]) < 1 / 120) {
        const ss = s + 50;
        this.addObstacle('tree', ss, wallSide * (W / 2 + 0.5), R.range(0.25, 0.38), R, { len: R.range(W * 0.35, W * 0.52), side: wallSide });
      }
      if (R() < per(hz.abandoned * 1.4, 100)) {
        const ss = s + R.range(0, 100), side = R() < 0.5 ? -1 : 1;
        this.addObstacle('car', ss, side * R.range(W / 2 - 1.2, W / 2 + 0.6), 1, R, { yaw: R.range(-0.5, 0.5) + (R() < 0.3 ? Math.PI : 0) });
      }
      if ((b.id === 'highway' || b.id === 'dryhwy') && R() < 0.12 && !onB) {
        // roadworks / lane closure
        const ss = s + R.range(0, 60), side = R() < 0.5 ? -1 : 1;
        for (let n = 0; n < 5; n++) this.addObstacle('barrier', ss + n * 2.6, side * (W / 2 - 1.6 - n * 0.35), 0.5, R);
        this.addObstacle('barrel', ss - 6, side * (W / 2 - 1.2), 0.32, R);
        this.addObstacle('barrel', ss - 10, side * (W / 2 - 0.9), 0.32, R);
      }
      if (hz.rockfall && !inT && wallSide && R() < 0.12 && this.sw[(j * 2 + (wallSide > 0 ? 1 : 0)) * 5] > 0.6) {
        this.rockfalls.push({ s: s + 50, side: wallSide });
      }
    }
    // spatial buckets (20 m) for the per-step lookups
    this.bucket = (arr, s0key, s1key) => {
      const m = new Map();
      for (const o of arr) {
        const a = Math.floor((o[s0key] - 3) / 20), e = Math.floor(((s1key ? o[s1key] : o[s0key]) + 3) / 20);
        for (let q = a; q <= e; q++) { let l = m.get(q); if (!l) m.set(q, (l = [])); l.push(o); }
      }
      return m;
    };
    this.decalB = this.bucket(this.decals, 's0', 's1');
    this.potB = this.bucket(this.potholes, 's');
  }

  addObstacle(type, s, d, r, R, extra = {}) {
    const p = this.posAt(s, d);
    const o = { type, s, d, x: p.x, z: p.z, y: p.y, r, ...extra, colliders: [] };
    const j = Math.round(s / STEP);
    const hd = this.hd[clamp(j, 0, this.N - 1)];
    if (type === 'rock') o.colliders.push({ t: 's', x: p.x, y: p.y + r * 0.4, z: p.z, r });
    else if (type === 'barrel') o.colliders.push({ t: 's', x: p.x, y: p.y + 0.45, z: p.z, r: 0.4, light: 1, m: 35, vx: 0, vy: 0, vz: 0, x0: p.x, y0: p.y + 0.45, z0: p.z });
    else if (type === 'barrier') o.colliders.push({ t: 'b', x: p.x, y: p.y + 0.42, z: p.z, hx: 0.25, hy: 0.42, hz: 1.0, yaw: hd });
    else if (type === 'car') { o.yaw = hd + (extra.yaw || 0); o.colliders.push({ t: 'b', x: p.x, y: p.y + 0.75, z: p.z, hx: 0.85, hy: 0.7, hz: 2.0, yaw: o.yaw }); }
    else if (type === 'tree') {
      // trunk lying across part of the road, root on the shoulder
      const dirIn = -extra.side;
      for (let u = 0; u <= extra.len; u += 0.7) {
        const q = this.posAt(s + u * 0.15, d + dirIn * u);
        o.colliders.push({ t: 's', x: q.x, y: q.y + r, z: q.z, r: r * (1 - u / extra.len * 0.35) });
      }
      o.yaw = hd;
    }
    this.obstacles.push(o);
    return o;
  }

  placePickups(R) {
    const pk = (this.pickups = []);
    const add = (type, s, d, extra = {}) => {
      const p = this.posAt(s, d);
      pk.push({ type, s, d, x: p.x, y: p.y, z: p.z, ...extra });
    };
    // shortcut rewards
    for (const c of this.shortcuts) {
      if (c.kind === 'drop') {
        const A = this.posAt(c.s0, 0), B = this.posAt(c.s1, 0);
        const x = (A.x + B.x) / 2, z = (A.z + B.z) / 2;
        const h = this.height(x, z);
        pk.push({ type: R() < 0.3 ? 'rare' : 'crate', s: (c.s0 + c.s1) / 2, d: 0, x, y: h, z, free: true });
      } else {
        const mid = Math.round((c.a + c.b) / 2);
        const R0 = 1 / Math.max(0.01, Math.abs(this.k[mid]));
        add(R() < 0.5 ? 'fuel' : 'cash', mid * STEP, (c.side ? 1 : -1) * Math.min(R0 * 0.45, this.width[mid] / 2 + 9));
      }
    }
    // fuel: spacing grows with depth so fuel matters more further down
    let s = 850;
    while (s < this.length - 200) {
      const j = Math.round(s / STEP);
      const W = this.width[j];
      // risky spots: on the drop side shoulder, beyond rail gaps, or tucked behind obstacles
      const gap = this.railGaps.find((g) => Math.abs(g.j * STEP - s) < 260);
      if (gap) add('fuel', gap.j * STEP, (gap.side ? 1 : -1) * (this.width[gap.j] / 2 + 1.0), { risky: true });
      else add('fuel', s, (R() < 0.5 ? -1 : 1) * R.range(W / 2 - 0.8, W / 2 + 0.7));
      s += R.range(1100, 1600) + s * 0.045;
    }
    // cash bundles, sometimes in a line along the road
    for (s = 220; s < this.length; s += R.range(170, 330)) {
      const j = Math.round(s / STEP), W = this.width[j];
      if (R() < 0.3) for (let n = 0; n < 3; n++) add('cash', s + n * 7, -W / 4 + n * W / 4 * (R() < 0.5 ? 1 : -1) * 0.5);
      else add('cash', s, R.range(-W / 2 + 0.7, W / 2 - 0.7));
    }
    for (s = 1700; s < this.length; s += R.range(1500, 2400)) {
      const j = Math.round(s / STEP);
      add('repair', s, R.range(-this.width[j] / 2 + 0.8, this.width[j] / 2 - 0.8));
    }
    for (s = 4800; s < this.length; s += R.range(4200, 5600)) add('repairL', s, 0);
    for (s = 3500; s < this.length; s += R.range(3200, 4600)) {
      const j = Math.round(s / STEP);
      add('rare', s, (R() < 0.5 ? -1 : 1) * (this.width[j] / 2 + 0.4));
    }
    pk.sort((a, b) => a.s - b.s);
  }

  placeSigns(R) {
    const sg = (this.signs = []);
    const N = this.N;
    // curve warnings and chevrons
    for (let j = 60; j < N - 60; j++) {
      const ak = Math.abs(this.k[j]);
      if (ak > 1 / 45 && Math.abs(this.k[j - 1]) <= 1 / 45) {
        const left = this.k[j] > 0;
        const sj = Math.max(0, j - 35);
        const side = 1; // warning on the right shoulder
        sg.push({ type: this.isHairpin[j] ? (left ? 'hairpinL' : 'hairpinR') : left ? 'curveL' : 'curveR', s: sj * STEP, side });
        // chevrons on the outside of the bend
        let e = j; while (e < N - 1 && Math.abs(this.k[e]) > 1 / 60) e++;
        for (let q = j + 4; q < e - 2; q += 9) sg.push({ type: left ? 'chevL' : 'chevR', s: q * STEP, side: left ? 1 : -1, outer: true });
        j = e;
      }
    }
    for (const jm of this.jumps) sg.push({ type: 'bump', s: jm.s - 70, side: 1 });
    for (const t of this.tunnels) sg.push({ type: 'tunnel', s: t.a * STEP - 90, side: 1 });
    for (const rf of this.rockfalls) sg.push({ type: 'rockfall', s: rf.s - 120, side: 1 });
    for (const d of this.decals) if (d.type === SURF.ICE && R() < 0.6) sg.push({ type: 'ice', s: d.s0 - 60, side: 1 });
    for (let km = 1; km * 1000 < this.length; km++) sg.push({ type: 'km', s: km * 1000, side: 1, km });
    for (const b of this.m.biomes) if (b.start > 0) sg.push({ type: 'region', s: b.start + 20, side: -1, text: b.name });
    // shortcut markers: crude hand painted arrows
    for (const c of this.shortcuts) sg.push({ type: 'shortcut', s: c.s0 - 12, side: c.kind === 'drop' ? (c.sideA ? 1 : -1) : c.side ? 1 : -1 });
    for (const s of sg) {
      if (s.broken === undefined) s.broken = R() < 0.12;
      if (s.s < 0) s.s = 0;
    }
  }

  placeProps(R) {
    // Large decorative structures positioned in world space.
    const pr = (this.props = []);
    this.farms = [];
    const N = this.N;
    for (let j = 10; j < N - 10; j += 6) {
      const s = j * STEP, b = this.biome(s);
      if (s > this.length + 400) break;
      if (this.tunnel[j] || this.bridge[j]) continue;
      const W = this.width[j];
      const has = (p) => b.props.includes(p);
      if (has('houses') && R() < 0.22 && s > 20) {
        for (let side = 0; side < 2; side++) {
          if (this.sw[(j * 2 + side) * 5 + 2] < 0.6 || R() < 0.4) continue;
          const sd = side ? 1 : -1;
          const d = sd * (W / 2 + R.range(7, 16));
          const p = this.posAt(s, d);
          const size = R.range(0.85, 1.3);
          const yaw = this.hd[j] + (sd > 0 ? -Math.PI / 2 : Math.PI / 2) + R.range(-0.15, 0.15);
          const kind = R() < 0.18 ? 'barn' : R() < 0.1 && !pr.some((q) => q.type === 'chapel') ? 'chapel' : 'house';
          pr.push({ type: kind, x: p.x, y: p.y, z: p.z, yaw, size, seed: R.int(0, 1e6), s, collider: true });
        }
      }
      // farms: a fenced pasture with a barn and a farmhouse, set back from the road
      if ((has('houses') || has('fences') || has('poles') || has('logs')) && R() < (has('houses') ? 0.07 : 0.03) && s > 120 && !pr.some((q) => q.type === 'farm' && Math.abs(q.s - s) < 700)) {
        const sd = R() < 0.5 ? -1 : 1;
        const side = sd > 0 ? 1 : 0;
        if (this.sw[(j * 2 + side) * 5 + 2] > 0.3 && this.sw[(j * 2 + side) * 5] < 0.6) {
          const w = R.range(26, 40), dpt = R.range(16, 24);
          const dc = sd * (W / 2 + 10 + dpt / 2);
          const c = this.posAt(s, dc);
          // keep it reasonably flat
          const corners = [[-w / 2, -dpt / 2], [w / 2, -dpt / 2], [w / 2, dpt / 2], [-w / 2, dpt / 2]];
          const hd = this.hd[j];
          const fx = Math.sin(hd), fz = Math.cos(hd), rx = this.rx[j] * sd, rz = this.rz[j] * sd;
          let ok = true;
          for (const [a2, b2] of corners) { const h = this.height(c.x + fx * a2 + rx * b2, c.z + fz * a2 + rz * b2); if (Math.abs(h - c.y) > 5.5) ok = false; }
          if (ok) {
            const farm = { type: 'farm', s, x: c.x, y: c.y, z: c.z, hd, sd, w, dpt, fx, fz, rx, rz, seed: R.int(0, 1e6), animal: R() < 0.55 ? 'cow' : 'sheep' };
            pr.push(farm);
            this.farms = this.farms || [];
            this.farms.push(farm);
            // barn + farmhouse just outside the far side of the pasture
            for (const [k, kind] of [[-0.3, 'barn'], [0.32, 'house']]) {
              const bx = c.x + fx * w * k + rx * (dpt / 2 + 9), bz = c.z + fz * w * k + rz * (dpt / 2 + 9);
              pr.push({ type: kind, x: bx, y: this.height(bx, bz), z: bz, yaw: hd + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), size: R.range(0.95, 1.2), seed: R.int(0, 1e6), s, collider: true });
            }
            j += 40;
          }
        }
      }
      if ((has('poles')) && j % 18 === 0) {
        const d = (W / 2 + 2.2) * (this.sw[(j * 2 + 1) * 5] > 0.5 ? 1 : -1);
        const p = this.posAt(s, d);
        pr.push({ type: 'pole', x: p.x, y: p.y, z: p.z, yaw: this.hd[j], s });
      }
      if (has('snowpoles') && j % 12 === 0) {
        for (const sd of [-1, 1]) {
          const p = this.posAt(s, sd * (W / 2 + 0.7));
          if (!this.rail[j * 2 + (sd > 0 ? 1 : 0)]) pr.push({ type: 'snowpole', x: p.x, y: p.y, z: p.z, s });
        }
      }
      if (has('fences') && R() < 0.05) {
        const sd = R() < 0.5 ? -1 : 1;
        if (this.sw[(j * 2 + (sd > 0 ? 1 : 0)) * 5 + 2] > 0.5) pr.push({ type: 'fence', s, d: sd * (W / 2 + 3.5), len: R.range(20, 60) });
      }
      if (has('logs') && R() < 0.025) {
        const sd = R() < 0.5 ? -1 : 1;
        const p = this.posAt(s, sd * (W / 2 + 3));
        pr.push({ type: 'logs', x: p.x, y: p.y, z: p.z, yaw: this.hd[j], s });
      }
      if (has('ruins') && R() < 0.02) {
        const sd = R() < 0.5 ? -1 : 1;
        if (this.sw[(j * 2 + (sd > 0 ? 1 : 0)) * 5 + 1] < 0.6) {
          const p = this.posAt(s, sd * (W / 2 + R.range(8, 14)));
          pr.push({ type: R() < 0.35 ? 'gasstation' : 'shack', x: p.x, y: p.y, z: p.z, yaw: this.hd[j] + (sd > 0 ? -Math.PI / 2 : Math.PI / 2), s, collider: true, seed: R.int(0, 1e6) });
          j += 60;
        }
      }
      if (has('waterfalls') && R() < 0.01) {
        const sd = this.sw[(j * 2 + 1) * 5] > 0.5 ? 1 : -1;
        pr.push({ type: 'waterfall', s, d: sd * (W / 2 + 14), side: sd });
        j += 150;
      }
    }
    if (this.m.biomes.some((b) => b.props.includes('finish'))) {
      const p = this.posAt(this.length, 0);
      pr.push({ type: 'finish', x: p.x, y: p.y, z: p.z, yaw: this.hd[Math.round(this.length / STEP)], s: this.length });
    }
    // gas station ruins always carry fuel by the pumps
    for (const p of pr) if (p.type === 'gasstation') {
      const j = Math.round(p.s / STEP), sd = this.dOf(p.x, p.z) > 0 ? 1 : -1;
      const q = this.posAt(p.s, sd * (this.width[j] / 2 + 4));
      this.pickups.push({ type: 'fuel', s: p.s, d: sd * (this.width[j] / 2 + 4), x: q.x, y: q.y, z: q.z });
    }
    this.pickups.sort((a, b) => a.s - b.s);
    // static colliders: obstacles + buildings (box approximations)
    this.colliders = [];
    for (const o of this.obstacles) for (const c of o.colliders) this.colliders.push({ ...c, s: o.s, ref: o });
    for (const p of pr) if (p.collider) {
      const sz = (p.size || 1);
      const dims = p.type === 'barn' ? [4.5, 3.5, 6] : p.type === 'chapel' ? [3.5, 4, 6] : p.type === 'gasstation' ? [3.5, 2.2, 4.5] : p.type === 'shack' ? [2.5, 2, 3] : [3.5, 3, 4.5];
      p.col = { t: 'b', x: p.x, y: p.y + dims[1] * sz, z: p.z, hx: dims[0] * sz, hy: dims[1] * sz, hz: dims[2] * sz, yaw: p.yaw, s: p.s, heavy: 1 };
      this.colliders.push(p.col);
    }
    this.colB = new Map();
    for (const c of this.colliders) {
      const q = Math.floor(c.s / 20);
      for (let e = q - 1; e <= q + 1; e++) { let l = this.colB.get(e); if (!l) this.colB.set(e, (l = [])); l.push(c); }
    }
  }

  // ------------------------------------------------------------------ queries
  posAt(s, d = 0) {
    const f = clamp(s / STEP, 0, this.N - 1.001);
    const a = Math.floor(f), t = f - a;
    const x = lerp(this.px[a], this.px[a + 1], t), z = lerp(this.pz[a], this.pz[a + 1], t);
    const rx = lerp(this.rx[a], this.rx[a + 1], t), rz = lerp(this.rz[a], this.rz[a + 1], t);
    const wx = x + rx * d, wz = z + rz * d;
    return { x: wx, z: wz, y: this.height(wx, wz), ry: lerp(this.py[a], this.py[a + 1], t), hd: lerp(this.hd[a], this.hd[a + 1], t) };
  }
  roadY(s) {
    const f = clamp(s / STEP, 0, this.N - 1.001);
    const a = Math.floor(f);
    return lerp(this.py[a], this.py[a + 1], f - a);
  }
  dOf(x, z) { return this.query(x, z).d; }
  height(x, z) { return this.query(x, z).h; }

  // Core terrain query. Blends the profiles of every road "leg" within reach so
  // switchbacks share smooth terrain between them.
  query(x, z, out = this._out || (this._out = {}), wantSurf = false) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const legI = this._legI || (this._legI = new Int32Array(6));
    const legD = this._legD || (this._legD = new Float64Array(6));
    let nl = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const a = this.cells.get(key(cx + dx, cz + dz));
      if (!a) continue;
      for (let n = 0; n < a.length; n++) {
        const q = a[n];
        const ex = this.px[q] - x, ez = this.pz[q] - z;
        const d2 = ex * ex + ez * ez;
        if (d2 > 40000) continue;
        let found = false;
        for (let l = 0; l < nl; l++) {
          if (Math.abs(legI[l] - q) < 48) {
            if (d2 < legD[l]) { legD[l] = d2; legI[l] = q; }
            found = true; break;
          }
        }
        if (!found && nl < 6) { legI[nl] = q; legD[nl] = d2; nl++; }
      }
    }
    if (nl === 0) {
      out.h = this.py[this.N - 1] - 200; out.s = 0; out.d = 999; out.idx = 0; out.surf = SURF.GRASS; out.halfW = 4; out.dist = 999;
      return out;
    }
    let wsum = 0, hsum = 0, best = 1e18;
    for (let l = 0; l < nl; l++) {
      // refine around the coarse hit
      let bi = legI[l], bd = 1e18;
      const lo = Math.max(0, legI[l] - COARSE), hi = Math.min(this.N - 1, legI[l] + COARSE);
      for (let q = lo; q <= hi; q++) {
        const ex = this.px[q] - x, ez = this.pz[q] - z;
        const d2 = ex * ex + ez * ez;
        if (d2 < bd) { bd = d2; bi = q; }
      }
      // project onto the adjacent segment
      let f = bi;
      const tryseg = (a) => {
        if (a < 0 || a >= this.N - 1) return;
        const ax = this.px[a], az = this.pz[a];
        const sx = this.px[a + 1] - ax, sz = this.pz[a + 1] - az;
        const t = clamp(((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz), 0, 1);
        const qx = ax + sx * t - x, qz = az + sz * t - z;
        const d2 = qx * qx + qz * qz;
        if (d2 <= bd + 1e-9) { bd = d2; f = a + t; }
      };
      tryseg(bi - 1); tryseg(bi);
      const a = Math.min(this.N - 2, Math.floor(f)), t = f - a;
      const rx = lerp(this.rx[a], this.rx[a + 1], t), rz = lerp(this.rz[a], this.rz[a + 1], t);
      const cxp = lerp(this.px[a], this.px[a + 1], t), czp = lerp(this.pz[a], this.pz[a + 1], t);
      const d = (x - cxp) * rx + (z - czp) * rz;
      const h = this.profile(a, t, d, x, z);
      const dist = Math.sqrt(bd);
      const w = 1 / (dist * dist * dist * dist + 1);
      wsum += w; hsum += w * h;
      if (bd < best) {
        best = bd;
        out.s = f * STEP; out.d = d; out.idx = a; out.dist = dist; out.hLeg = h;
      }
    }
    out.h = hsum / wsum;
    const a = out.idx;
    out.halfW = this.width[a] * 0.5;
    if (wantSurf) out.surf = this.surfaceAt(out.s, out.d, a);
    return out;
  }

  profile(a, t, d, x, z) {
    const y = lerp(this.py[a], this.py[a + 1], t);
    const halfW = lerp(this.width[a], this.width[a + 1], t) * 0.5;
    const ad = Math.abs(d);
    if (ad <= halfW) {
      let h = y - 0.012 * ad;
      // potholes
      const pl = this.potB.get(Math.floor((a + t) * STEP / 20));
      if (pl) {
        const s = (a + t) * STEP;
        for (let n = 0; n < pl.length; n++) {
          const p = pl[n];
          const ds = s - p.s, dd = d - p.d;
          const q = (ds * ds + dd * dd) / (p.r * p.r);
          if (q < 1) h -= p.depth * (1 - q);
        }
      }
      return h;
    }
    if (ad <= halfW + SHOULDER) return y - 0.012 * halfW - 0.07 * (ad - halfW);
    const side = d >= 0 ? 1 : 0;
    const j = t < 0.5 ? a : a + 1;
    const o = (a * 2 + side) * 5, o2 = o + 10;
    const u = ad - halfW - SHOULDER;
    const sw = this.sw;
    const wW = lerp(sw[o], sw[o2], t), wD = lerp(sw[o + 1], sw[o2 + 1], t), wF = lerp(sw[o + 2], sw[o2 + 2], t);
    const wC = lerp(sw[o + 3], sw[o2 + 3], t), wV = lerp(sw[o + 4], sw[o2 + 4], t);
    let h = 0;
    if (wW > 0.001) {
      const slw = lerp(this.slW[a * 2 + side], this.slW[a * 2 + 2 + side], t);
      const ditch = -0.3 * Math.exp(-(u - 0.8) * (u - 0.8) * 2) * smoothstep(0, 0.4, u);
      const rise = slw * Math.pow(Math.max(0, u - 1.1), 1.2);
      const crag = slw > 1.5 ? (this.noise.ridge(x * 0.07, z * 0.07, 2) - 0.5) * slw * 2.4 * smoothstep(2, 9, u) : 0;
      h += wW * (ditch + rise + crag);
    }
    if (wD > 0.001) {
      const sld = lerp(this.slD[a * 2 + side], this.slD[a * 2 + 2 + side], t);
      h += wD * (-sld * u * (1 + u * 0.004) - (sld > 1.8 ? smoothstep(4, 14, u) * 25 : 0));
    }
    if (wF > 0.001) h += wF * (-0.05 * u);
    if (wC > 0.001) h += wC * (-lerp(this.cutSl[a * 2 + side], this.cutSl[a * 2 + 2 + side], t) * u);
    if (wV > 0.001) h += wV * -Math.min(48, u * u * 3 + u * 5);
    // natural irregularity, faded in away from the road edge
    const fade = smoothstep(0.5, 7, u);
    if (fade > 0) h += fade * (this.noise.fbm(x * 0.018, z * 0.018, 3) * 3.2 + this.noise.n2(x * 0.11, z * 0.11) * 0.35) * (1 - wV);
    return y - 0.012 * halfW - 0.07 * SHOULDER + h;
  }

  surfaceAt(s, d, a) {
    const halfW = this.width[a] * 0.5;
    const ad = Math.abs(d);
    if (ad <= halfW + 0.15) {
      const dl = this.decalB.get(Math.floor(s / 20));
      if (dl) for (let n = 0; n < dl.length; n++) {
        const q = dl[n];
        if (s >= q.s0 && s <= q.s1 && d >= q.d0 && d <= q.d1) return q.type;
      }
      return this.surf[a];
    }
    if (this.bridge[a] && ad < halfW + 0.6) return SURF.CONCRETE;
    if (ad <= halfW + SHOULDER) {
      const dl = this.decalB.get(Math.floor(s / 20));
      if (dl) for (let n = 0; n < dl.length; n++) {
        const q = dl[n];
        if (s >= q.s0 && s <= q.s1 && d >= q.d0 && d <= q.d1) return q.type;
      }
      return this.offSurf[a] === SURF.SNOW ? SURF.SNOW : SURF.GRAVEL;
    }
    const side = d >= 0 ? 1 : 0;
    const o = (a * 2 + side) * 5;
    if (this.sw[o + 3] > 0.5) return this.offSurf[a] === SURF.SNOW ? SURF.SNOW : SURF.DIRT;
    if (this.sw[o] > 0.6 && this.slW[a * 2 + side] > 1.2 && ad > halfW + 3) return this.offSurf[a] === SURF.SNOW ? SURF.SNOW : SURF.ROCK;
    return this.offSurf[a];
  }

  railAt(idx, side) {
    const k = idx * 2 + side;
    return this.railBroken[k] ? 0 : this.rail[k];
  }
  railBreakSpeed(type) { return RAIL_BREAK[type] || 999; }
  breakRail(idx, side) {
    for (let q = idx - 2; q <= idx + 2; q++) if (q >= 0 && q < this.N) this.railBroken[q * 2 + side] = 1;
  }
  resetRun() { this.railBroken.fill(0); }

  collidersNear(s) { return this.colB.get(Math.floor(s / 20)) || EMPTY; }
}
const EMPTY = [];

function smoothArr(a, radius) {
  const n = a.length, tmp = new Float32Array(n);
  let acc = 0, cnt = 0;
  for (let i = 0; i < Math.min(n, radius); i++) { acc += a[i]; cnt++; }
  for (let i = 0; i < n; i++) {
    const add = i + radius, rem = i - radius - 1;
    if (add < n) { acc += a[add]; cnt++; }
    if (rem >= 0) { acc -= a[rem]; cnt--; }
    tmp[i] = acc / cnt;
  }
  a.set(tmp);
}

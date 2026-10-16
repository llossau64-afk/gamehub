// Minimap: the road around the player in a round frame at the bottom left.
// Modes: 'heading' (rotates with the view, more road ahead than behind), 'north'
// (fixed orientation), 'full' (whole circuit / sprint), 'off'.
// The road is pre-rendered once per track into an offscreen tile (long downhill
// tracks: a window tile that is re-rendered when the player nears its edge), so a
// frame only costs one transformed drawImage plus a handful of dots, at ~30 Hz.

const TS = 1;            // tile pixels per metre
const TILE = 1400;       // tile edge in pixels
const HZ = 1 / 30;
const TAU = Math.PI * 2;
const COL = {
  bg0: 'rgba(24,26,28,0.86)', bg1: 'rgba(10,11,12,0.9)',
  edge: 'rgba(6,7,8,0.92)', road: '#d9d3c4', tunnel: '#6c7077', tunnelEdge: '#24272b',
  bridgeEdge: '#7fb3d9', curve: '#d98f2e', hairpin: '#d0563c',
  ring: 'rgba(235,230,218,0.30)', prog: '#e2a33b', best: '#ffffff', me: '#ffffff', amber: '#e2a33b',
};
const PICK = { cash: '#9fd07a', fuel: '#e05a3a', repair: '#5aa0e0', repairL: '#5aa0e0', rare: '#e2b04a', crate: '#e2b04a' };

export const MAP_MODES = ['heading', 'north', 'full', 'off'];

export class Minimap {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.mode = 'heading';
    this.tile = document.createElement('canvas');
    this.tile.width = this.tile.height = TILE;
    this.full = document.createElement('canvas');
    this.frame = document.createElement('canvas');
    this.acc = HZ;
    this.W = 0;
    this.rot = 0; this.zoom = 0;
    this.track = null;
  }

  setMode(m) { this.mode = MAP_MODES.includes(m) ? m : 'heading'; this.c.style.display = this.mode === 'off' ? 'none' : ''; this.acc = HZ; }

  // o: { race, loop, startS, endS, marks: [s...] (checkpoints / regions), shortcuts }
  init(track, o) {
    this.track = track; this.o = o;
    this.tileKey = null; this.fullKey = null;
    this.rot = null; this.zoom = 0;
    // a track small enough for one tile is rendered once, whole
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let j = 0; j < track.N; j += 2) { const x = track.px[j], z = track.pz[j]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    this.bbox = [x0, z0, x1, z1];
    this.whole = Math.max(x1 - x0, z1 - z0) + 120 < TILE / TS;
    this.acc = HZ;
    this.resize();
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    if (r.width < 4) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr);
    if (W !== this.W) {
      this.W = W; this.dpr = dpr;
      this.c.width = this.c.height = W;
      this.fullKey = null;
      this.paintFrame();
    }
    return true;
  }

  // background disc, drawn once per size
  paintFrame() {
    const W = this.W, f = this.frame, g = f.getContext('2d');
    f.width = f.height = W;
    const R = W / 2;
    const grd = g.createRadialGradient(R, R * 0.8, R * 0.1, R, R, R);
    grd.addColorStop(0, COL.bg0); grd.addColorStop(1, COL.bg1);
    g.fillStyle = grd; g.beginPath(); g.arc(R, R, R - 1, 0, TAU); g.fill();
    // faint range rings
    g.strokeStyle = 'rgba(235,230,218,0.05)'; g.lineWidth = 1;
    for (const k of [0.33, 0.66]) { g.beginPath(); g.arc(R, R, R * k, 0, TAU); g.stroke(); }
  }

  // ------------------------------------------------------------------ pre-render
  // road drawn in short runs so width and colour can follow the track
  strokeRoad(g, tf, j0, j1, lw, inside) {
    const t = this.track, o = this.o, N = t.N;
    const last = Math.min(N - 1, j1);
    const RUN = 8;
    const runs = [];
    let a = -1;
    const flush = (b) => { for (let s = a; s < b; s += RUN) runs.push([s, Math.min(b, s + RUN)]); a = -1; };
    for (let j = j0; j <= last; j++) {
      const ok = inside(t.px[j], t.pz[j]);
      if (ok && a < 0) a = Math.max(j0, j - 1);
      else if (!ok && a >= 0) flush(j);
    }
    if (a >= 0) flush(last);
    const path = (r) => {
      g.beginPath();
      for (let j = r[0]; j <= r[1]; j++) { const p = tf(t.px[j], t.pz[j]); j === r[0] ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); }
    };
    const kAt = (r) => { let k = 0; for (let j = r[0]; j <= r[1]; j++) k = Math.max(k, Math.abs(t.k[j])); return k; };
    const wAt = (r) => t.width[(r[0] + r[1]) >> 1];
    const flag = (arr, r) => arr && arr[(r[0] + r[1]) >> 1];
    g.lineJoin = 'round'; g.lineCap = 'round';
    // 1. edges: dark; warm on tight corners; blue over bridges
    for (const r of runs) {
      const k = kAt(r);
      g.strokeStyle = flag(t.bridge, r) ? COL.bridgeEdge : flag(t.tunnel, r) ? COL.tunnelEdge : k > 1 / 26 ? COL.hairpin : k > 1 / 48 ? COL.curve : COL.edge;
      g.lineWidth = lw(wAt(r)) + lw.edge;
      path(r); g.stroke();
    }
    // 2. surface
    for (const r of runs) {
      g.strokeStyle = flag(t.tunnel, r) ? COL.tunnel : COL.road;
      g.lineWidth = lw(wAt(r));
      path(r); g.stroke();
    }
    // 3. tunnels: dashed roof line
    g.setLineDash([lw.edge * 1.2, lw.edge * 1.2]);
    g.strokeStyle = 'rgba(20,22,25,0.9)';
    for (const r of runs) if (flag(t.tunnel, r)) { g.lineWidth = Math.max(1, lw(wAt(r)) * 0.3); path(r); g.stroke(); }
    g.setLineDash([]);
    // 4. shortcuts (downhill): dashed amber hop between the legs
    if (t.shortcuts && !o.race) {
      g.strokeStyle = 'rgba(226,163,59,0.85)'; g.lineWidth = Math.max(1, lw.edge * 0.8); g.setLineDash([lw.edge * 1.5, lw.edge]);
      for (const c of t.shortcuts) {
        if (c.kind !== 'drop' || c.a > last || c.b < j0) continue;
        const A = tf(t.px[c.a], t.pz[c.a]), B = tf(t.px[c.b], t.pz[c.b]);
        g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
      }
      g.setLineDash([]);
    }
    // 5. start / finish (chequered) and checkpoints / region marks
    const bar = (s, style, w) => {
      const j = Math.max(0, Math.min(N - 1, Math.round(s / 2)));
      if (j < j0 - 2 || j > last + 2 || !inside(t.px[j], t.pz[j])) return;
      const hw = t.width[j] / 2 + 3;
      const A = tf(t.px[j] - t.rx[j] * hw, t.pz[j] - t.rz[j] * hw), B = tf(t.px[j] + t.rx[j] * hw, t.pz[j] + t.rz[j] * hw);
      g.lineCap = 'butt';
      if (style === 'chk') {
        g.lineWidth = w; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
        g.setLineDash([w * 0.5, w * 0.5]); g.strokeStyle = '#fff'; g.stroke(); g.setLineDash([]);
      } else { g.lineWidth = w; g.strokeStyle = style; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); }
      g.lineCap = 'round';
    };
    const bw = lw.edge * 1.6;
    for (const s of o.marks || []) bar(s, COL.amber, bw * 0.6);
    bar(o.startS, 'chk', bw);
    if (!o.loop) bar(o.endS, 'chk', bw);
  }

  renderTile(cx, cz) {
    const t = this.track, g = this.tile.getContext('2d');
    const half = TILE / TS / 2;
    const X0 = cx - half, Z0 = cz - half;
    this.tileX0 = X0; this.tileZ0 = Z0; this.tileCx = cx; this.tileCz = cz;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, TILE, TILE);
    const m = 60;
    const inside = (x, z) => x > X0 - m && x < X0 + TILE / TS + m && z > Z0 - m && z < Z0 + TILE / TS + m;
    const out = [0, 0];
    const tf = (x, z) => { out[0] = (x - X0) * TS; out[1] = (z - Z0) * TS; return out; };
    // roads are drawn wider than life so they read at minimap scale
    const lw = (w) => (w * 1.7 + 3) * TS;
    lw.edge = 7 * TS;
    this.strokeRoad(g, tf, 0, t.N - 1, lw, inside);
  }

  renderFull() {
    const t = this.track, W = this.W, g = this.full.getContext('2d');
    this.full.width = this.full.height = W;
    const [x0, z0, x1, z1] = this.bbox;
    const sc = (W * 0.74) / Math.max(1, x1 - x0, z1 - z0);
    const ox = W / 2 - (x0 + x1) / 2 * sc, oz = W / 2 - (z0 + z1) / 2 * sc;
    this.fullTf = [sc, ox, oz];
    const out = [0, 0];
    const tf = (x, z) => { out[0] = ox + x * sc; out[1] = oz + z * sc; return out; };
    const k = W / 170;
    const lw = () => 3.2 * k;
    lw.edge = 3 * k;
    this.strokeRoad(g, tf, 0, t.N - 1, lw, () => true);
  }

  // ------------------------------------------------------------------ per frame
  // st: { x, z, fx, fz (view heading), speed, s, dots: [{x,z,color,me}], dotN, picks, progress, best, ticks }
  update(dt, st) {
    if (!this.track || this.mode === 'off') return;
    this.acc += dt;
    if (this.acc < HZ) return;
    const step = Math.min(0.25, this.acc);
    this.acc = 0;
    // follow layout changes (window resize, touch layout) once a second
    this.sizeT = (this.sizeT || 0) + step;
    if (!this.W || this.sizeT > 1) { this.sizeT = 0; if (!this.resize() && !this.W) return; }
    if (this.c.offsetParent === null || document.body.classList.contains('cine-on')) return; // hidden
    this.draw(step, st);
  }

  draw(dt, st) {
    const g = this.g, W = this.W, R = W / 2, o = this.o;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.drawImage(this.frame, 0, 0);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.clip();
    const full = this.mode === 'full';
    // heading (smoothed, wrapped) and speed zoom
    const want = this.mode === 'heading' ? -Math.PI / 2 - Math.atan2(st.fz, st.fx) : 0;
    if (this.rot === null || !Number.isFinite(this.rot)) this.rot = want;
    let d = want - this.rot; d -= Math.round(d / TAU) * TAU;
    this.rot += d * Math.min(1, dt * 8);
    const zr = o.race ? 190 + Math.min(1, st.speed / 50) * 140 : 160 + Math.min(1, st.speed / 45) * 120;
    this.zoom = this.zoom ? this.zoom + (zr - this.zoom) * Math.min(1, dt * 2) : zr;
    let toScreen;
    if (full) {
      if (this.fullKey !== W) { this.renderFull(); this.fullKey = W; }
      g.drawImage(this.full, 0, 0);
      const [sc, ox, oz] = this.fullTf;
      toScreen = (x, z, out) => { out[0] = ox + x * sc; out[1] = oz + z * sc; return out; };
    } else {
      const vs = R / this.zoom; // screen px per metre
      const cs = Math.cos(this.rot), sn = Math.sin(this.rot);
      const ax = R, ay = this.mode === 'heading' ? W * 0.62 : R;
      // world point at the disc centre: the tile must cover the disc around it
      const offM = (ay - R) / vs;
      const fl = Math.hypot(st.fx, st.fz) || 1;
      const ccx = st.x + (this.mode === 'heading' ? st.fx / fl * offM : 0), ccz = st.z + (this.mode === 'heading' ? st.fz / fl * offM : 0);
      if (this.whole) {
        if (this.tileKey !== 'whole') { const [x0, z0, x1, z1] = this.bbox; this.renderTile((x0 + x1) / 2, (z0 + z1) / 2); this.tileKey = 'whole'; }
      } else {
        const half = TILE / TS / 2, need = this.zoom * 1.5 + 40;
        if (this.tileKey === null || Math.abs(ccx - this.tileCx) + need > half || Math.abs(ccz - this.tileCz) + need > half) {
          // recentre ahead of the car so the tile lasts longer
          const lead = half - need - 20;
          this.renderTile(ccx + st.fx / fl * Math.max(0, lead), ccz + st.fz / fl * Math.max(0, lead));
          this.tileKey = 'win';
        }
      }
      const k = vs / TS;
      const ex = this.tileX0 - st.x, ez = this.tileZ0 - st.z;
      g.setTransform(cs * k, sn * k, -sn * k, cs * k, ax + (cs * ex - sn * ez) * vs, ay + (sn * ex + cs * ez) * vs);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.tile, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
      toScreen = (x, z, out) => { const dx = x - st.x, dz = z - st.z; out[0] = ax + (cs * dx - sn * dz) * vs; out[1] = ay + (sn * dx + cs * dz) * vs; return out; };
    }
    const P = this._p || (this._p = [0, 0]);
    const u = W / 170; // size unit
    // pickups (downhill)
    if (st.picks && !full) {
      for (let i = 0; i < st.picks.length; i++) {
        const pk = st.picks[i];
        if (pk.s < st.s - 80) continue;
        if (pk.s > st.s + this.zoom * 1.6) break;
        if (st.collected && st.collected.has(i)) continue;
        toScreen(pk.x, pk.z, P);
        g.fillStyle = PICK[pk.type] || '#fff';
        g.beginPath(); g.arc(P[0], P[1], 2.2 * u, 0, TAU); g.fill();
      }
    }
    // other cars: coloured dots; off the map they sit on the rim
    for (let i = 0; i < (st.dotN || 0); i++) {
      const e = st.dots[i];
      toScreen(e.x, e.z, P);
      let x = P[0] - R, y = P[1] - R;
      const r = Math.hypot(x, y), lim = R - 6 * u;
      const out = r > lim;
      if (out) { x *= lim / r; y *= lim / r; }
      g.globalAlpha = out ? 0.75 : 1;
      g.fillStyle = e.color; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 1.6 * u;
      g.beginPath(); g.arc(R + x, R + y, (out ? 3 : 4.2) * u, 0, TAU); g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
    // the player: arrow
    let px, py, ang;
    if (full) { toScreen(st.x, st.z, P); px = P[0]; py = P[1]; ang = Math.atan2(st.fz, st.fx) + Math.PI / 2; }
    else { px = R; py = this.mode === 'heading' ? W * 0.62 : R; ang = this.mode === 'heading' ? 0 : Math.atan2(st.fz, st.fx) + Math.PI / 2; }
    g.translate(px, py); g.rotate(ang);
    const a = 7.5 * u;
    g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.68, a * 0.72); g.lineTo(0, a * 0.36); g.lineTo(-a * 0.68, a * 0.72); g.closePath();
    g.fillStyle = COL.me; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 2 * u; g.lineJoin = 'round';
    g.stroke(); g.fill();
    g.fillStyle = COL.amber; g.beginPath(); g.moveTo(0, -a * 0.55); g.lineTo(a * 0.3, a * 0.3); g.lineTo(0, a * 0.12); g.lineTo(-a * 0.3, a * 0.3); g.closePath(); g.fill();
    g.restore();
    // rim: thin ring, progress arc, record / lap ticks, north marker
    g.lineCap = 'butt';
    g.strokeStyle = COL.ring; g.lineWidth = 2.4 * u;
    g.beginPath(); g.arc(R, R, R - 2.4 * u, 0, TAU); g.stroke();
    const top = -Math.PI / 2;
    if (st.progress != null) {
      g.strokeStyle = COL.prog; g.lineWidth = 3.2 * u;
      g.beginPath(); g.arc(R, R, R - 2.4 * u, top, top + TAU * Math.max(0.002, Math.min(1, st.progress))); g.stroke();
    }
    const tick = (f, col, len) => {
      const an = top + TAU * f, c = Math.cos(an), s = Math.sin(an);
      g.strokeStyle = col; g.lineWidth = 1.6 * u;
      g.beginPath(); g.moveTo(R + c * (R - 0.5 * u), R + s * (R - 0.5 * u)); g.lineTo(R + c * (R - len * u), R + s * (R - len * u)); g.stroke();
    };
    if (st.ticks) for (let i = 0; i < st.ticks.length; i++) tick(st.ticks[i], 'rgba(235,230,218,0.55)', 5);
    if (st.best > 0 && st.best < 1) tick(st.best, COL.best, 7);
    if (this.mode === 'heading') {
      // north (screen up in north-up mode) marker riding the rim
      const nu = Math.max(u, 1.15 * (this.dpr || 1)), an = this.rot - Math.PI / 2, rr = R - 9 * nu;
      const nx = R + Math.cos(an) * rr, ny = R + Math.sin(an) * rr;
      g.fillStyle = 'rgba(10,11,12,0.85)'; g.strokeStyle = 'rgba(226,163,59,0.7)'; g.lineWidth = 1.2 * nu;
      g.beginPath(); g.arc(nx, ny, 6.5 * nu, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = COL.amber; g.font = `700 ${Math.round(9.5 * nu)}px Cond, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('N', nx, ny + 0.5 * nu);
    }
  }
}

// Visual effects: pooled particles, swing arcs, rings, lightning, telegraph markers, damage numbers.
import * as THREE from '../lib/three.module.min.js';
import { Batch } from './world.js';
import { rand, TAU } from './util.js';

const MAXP = 900;

export class FX {
  constructor(world, overlayCanvas) {
    this.world = world;
    const scene = world.scene;
    // ---- particles (struct of arrays) ----
    this.p = {
      x: new Float32Array(MAXP), y: new Float32Array(MAXP), z: new Float32Array(MAXP),
      vx: new Float32Array(MAXP), vy: new Float32Array(MAXP), vz: new Float32Array(MAXP),
      life: new Float32Array(MAXP), max: new Float32Array(MAXP), size: new Float32Array(MAXP),
      r: new Float32Array(MAXP), g: new Float32Array(MAXP), b: new Float32Array(MAXP),
      grav: new Float32Array(MAXP), drag: new Float32Array(MAXP), rot: new Float32Array(MAXP), add: new Uint8Array(MAXP),
    };
    this.pn = 0;
    const sparkGeo = new THREE.OctahedronGeometry(0.5, 0);
    this.sparks = new Batch(sparkGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXP, true);
    const debrisGeo = new THREE.TetrahedronGeometry(0.5, 0);
    this.debris = new Batch(debrisGeo, new THREE.MeshLambertMaterial({ flatShading: true }), MAXP, true);
    scene.add(this.sparks.mesh, this.debris.mesh);

    // ---- expanding rings ----
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 40); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.rings.push({ m, t: 0, life: 0, r0: 0, r1: 1 });
    }

    // ---- swing arcs ----
    this.slashes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      this.slashes.push({ m, t: 0, life: 0, arc: 0 });
    }

    // ---- lightning ----
    this.bolts = [];
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.visible = false; line.frustumCulled = false; scene.add(line);
      this.bolts.push({ line, t: 0, life: 0 });
    }

    // ---- telegraph markers ----
    this.markers = [];
    const discGeo = new THREE.CircleGeometry(1, 32); discGeo.rotateX(-Math.PI / 2);
    const outlineGeo = new THREE.RingGeometry(0.93, 1, 40); outlineGeo.rotateX(-Math.PI / 2);
    const lineGeo = new THREE.PlaneGeometry(1, 1); lineGeo.rotateX(-Math.PI / 2); lineGeo.translate(0, 0, 0.5);
    for (let i = 0; i < 40; i++) {
      const g = new THREE.Group(); g.visible = false;
      const mat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
      const mat2 = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const disc = new THREE.Mesh(discGeo, mat), outline = new THREE.Mesh(outlineGeo, mat2);
      const lineFill = new THREE.Mesh(lineGeo, mat), lineBack = new THREE.Mesh(lineGeo, mat2);
      g.add(disc, outline, lineFill, lineBack);
      g.position.y = 0.035;
      scene.add(g);
      this.markers.push({ g, disc, outline, lineFill, lineBack, mat, mat2, active: false, t: 0, dur: 1, kind: 'circle' });
    }

    // ---- damage numbers on a 2D overlay ----
    this.cv = overlayCanvas; this.ctx = overlayCanvas.getContext('2d');
    this.nums = [];
    this.showNumbers = true;
    this._v = new THREE.Vector3();
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.cv.width = Math.round(window.innerWidth * dpr); this.cv.height = Math.round(window.innerHeight * dpr);
  }

  clear() {
    this.pn = 0; this.nums.length = 0;
    for (const r of this.rings) { r.life = 0; r.m.visible = false; }
    for (const s of this.slashes) { s.life = 0; s.m.visible = false; }
    for (const b of this.bolts) { b.life = 0; b.line.visible = false; }
    for (const m of this.markers) this.releaseMarker(m);
  }

  // ---------- particles ----------
  emit(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    if (this.pn >= MAXP) return;
    const p = this.p, i = this.pn++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.max[i] = life; p.size[i] = size;
    p.r[i] = color.r; p.g[i] = color.g; p.b[i] = color.b;
    p.grav[i] = opts.grav ?? 14; p.drag[i] = opts.drag ?? 2.5; p.rot[i] = rand(0, TAU);
    p.add[i] = opts.debris ? 0 : 1;
  }

  burst(x, y, z, n, color, o = {}) {
    const c = color.isColor ? color : new THREE.Color(color);
    const sp = o.speed ?? 6, up = o.up ?? 3, life = o.life ?? 0.45, size = o.size ?? 0.14;
    for (let i = 0; i < n; i++) {
      const a = o.dir !== undefined ? o.dir + rand(-(o.spread ?? 0.6), o.spread ?? 0.6) : rand(0, TAU);
      const s = sp * rand(0.35, 1);
      this.emit(x, y, z, Math.sin(a) * s, up * rand(0.3, 1.2), Math.cos(a) * s, life * rand(0.6, 1.2), size * rand(0.6, 1.3), c, o);
    }
  }

  ring(x, z, color, r0, r1, life = 0.35, y = 0.06) {
    const r = this.rings.find(r => r.life <= 0) || this.rings[0];
    r.m.material.color.set(color); r.m.position.set(x, y, z);
    r.t = 0; r.life = life; r.r0 = r0; r.r1 = r1; r.m.visible = true;
  }

  slash(x, y, z, angle, arc, range, color, life = 0.16, flip = false) {
    const s = this.slashes.find(s => s.life <= 0) || this.slashes[0];
    if (s.arc !== arc || s.flip !== flip) {
      // Rebuild geometry: brighter at the outer edge and toward the end of the swing.
      const seg = 24, inner = 0.6, pos = [], col = [], idx = [];
      for (let k = 0; k <= seg; k++) {
        const t = k / seg, a = -arc / 2 + arc * (flip ? 1 - t : t);
        const bright = Math.pow(t, 2.2) * 0.9;
        pos.push(Math.sin(a) * inner, 0, Math.cos(a) * inner, Math.sin(a), 0, Math.cos(a));
        col.push(0, 0, 0, bright, bright, bright);
        // a bright rim on the outer edge reads as the blade's path
        if (k < seg) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      s.m.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      s.m.geometry = g; s.arc = arc; s.flip = flip;
    }
    s.m.material.color.set(color);
    s.m.position.set(x, y, z); s.m.rotation.set(0, angle, 0); s.m.scale.setScalar(range);
    s.t = 0; s.life = life; s.range = range; s.m.visible = true;
  }

  bolt(ax, ay, az, bx, by, bz, color = 0xcfe8ff, life = 0.16) {
    const b = this.bolts.find(b => b.life <= 0) || this.bolts[0];
    const arr = b.line.geometry.attributes.position.array;
    for (let k = 0; k < 10; k++) {
      const t = k / 9, j = k === 0 || k === 9 ? 0 : 0.35;
      arr[k * 3] = ax + (bx - ax) * t + rand(-j, j);
      arr[k * 3 + 1] = ay + (by - ay) * t + rand(-j, j) * 0.5;
      arr[k * 3 + 2] = az + (bz - az) * t + rand(-j, j);
    }
    b.line.geometry.attributes.position.needsUpdate = true;
    b.line.material.color.set(color);
    b.t = 0; b.life = life; b.line.visible = true;
  }

  // ---------- telegraph markers ----------
  circleMarker(x, z, radius, dur, color = 0xff4a3a) {
    const m = this.markers.find(m => !m.active); if (!m) return null;
    m.active = true; m.kind = 'circle'; m.t = 0; m.dur = dur; m.radius = radius;
    m.g.visible = true; m.g.position.set(x, 0.035, z); m.g.rotation.y = 0;
    m.disc.visible = m.outline.visible = true; m.lineFill.visible = m.lineBack.visible = false;
    m.outline.scale.setScalar(radius); m.disc.scale.setScalar(0.01);
    m.mat.color.set(color); m.mat2.color.set(color);
    return m;
  }
  lineMarker(x, z, angle, length, width, dur, color = 0xff4a3a) {
    const m = this.markers.find(m => !m.active); if (!m) return null;
    m.active = true; m.kind = 'line'; m.t = 0; m.dur = dur; m.length = length; m.width = width;
    m.g.visible = true; m.g.position.set(x, 0.035, z); m.g.rotation.y = angle;
    m.disc.visible = m.outline.visible = false; m.lineFill.visible = m.lineBack.visible = true;
    m.lineBack.scale.set(width, 1, length); m.lineFill.scale.set(width, 1, 0.01);
    m.mat.color.set(color); m.mat2.color.set(color);
    m.mat2.opacity = 0.18;
    return m;
  }
  releaseMarker(m) { if (!m) return; m.active = false; m.g.visible = false; }

  // ---------- damage numbers ----------
  number(x, y, z, value, kind = 'normal') {
    if (!this.showNumbers) return;
    if (this.nums.length > 70) this.nums.shift();
    this.nums.push({ x: x + rand(-0.2, 0.2), y, z, text: String(Math.round(value)), kind, t: 0, vx: rand(-0.6, 0.6) });
  }
  text(x, y, z, text, kind = 'info') { this.nums.push({ x, y, z, text, kind, t: 0, vx: 0 }); }

  // ---------- update ----------
  update(dt) {
    const p = this.p;
    // particles: swap-remove dead
    for (let i = 0; i < this.pn; i++) {
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        const j = --this.pn;
        for (const k in p) p[k][i] = p[k][j];
        i--; continue;
      }
      const d = Math.exp(-p.drag[i] * dt);
      p.vx[i] *= d; p.vz[i] *= d; p.vy[i] = p.vy[i] * d - p.grav[i] * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      if (p.y[i] < 0.03) { p.y[i] = 0.03; p.vy[i] *= -0.35; p.vx[i] *= 0.7; p.vz[i] *= 0.7; }
      p.rot[i] += dt * 6;
    }
    this.sparks.begin(); this.debris.begin();
    for (let i = 0; i < this.pn; i++) {
      const f = p.life[i] / p.max[i], s = p.size[i] * (p.add[i] ? f : Math.min(1, f * 3));
      const b = p.add[i] ? this.sparks : this.debris;
      const k = b.push(p.x[i], p.y[i], p.z[i], s, s, s, p.rot[i]);
      const br = p.add[i] ? Math.min(1, f * 1.6) : 1;
      b.color(k, p.r[i] * br, p.g[i] * br, p.b[i] * br);
    }
    this.sparks.end(); this.debris.end();

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.t += dt;
      const f = r.t / r.life;
      if (f >= 1) { r.life = 0; r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - f, 3), rad = r.r0 + (r.r1 - r.r0) * e;
      r.m.scale.setScalar(rad); r.m.material.opacity = (1 - f) * 0.9;
    }
    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.t += dt;
      const f = s.t / s.life;
      if (f >= 1) { s.life = 0; s.m.visible = false; continue; }
      s.m.material.opacity = 1 - f * f;
      s.m.scale.setScalar(s.range * (0.92 + f * 0.12));
    }
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.t += dt;
      if (b.t >= b.life) { b.life = 0; b.line.visible = false; continue; }
      b.line.material.opacity = 1 - b.t / b.life;
    }
    for (const m of this.markers) {
      if (!m.active) continue;
      m.t += dt;
      const f = Math.min(1, m.t / m.dur);
      const pulse = 0.75 + Math.sin(m.t * 22) * 0.25 * f;
      if (m.kind === 'circle') { m.disc.scale.setScalar(Math.max(0.01, m.radius * f)); }
      else { m.lineFill.scale.set(m.width, 1, Math.max(0.01, m.length * f)); }
      m.mat.opacity = 0.22 + 0.2 * f; m.mat2.opacity = (m.kind === 'circle' ? 0.85 : 0.22) * pulse;
    }
  }

  drawNumbers(dt, camera) {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, dpr = this.dpr;
    ctx.clearRect(0, 0, W, H);
    if (!this.nums.length) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const v = this._v;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      const life = n.kind === 'info' ? 1.1 : n.kind === 'crit' ? 0.8 : 0.6;
      if (n.t > life) { this.nums.splice(i, 1); continue; }
      n.x += n.vx * dt;
      v.set(n.x, n.y + n.t * 1.6, n.z).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const pop = n.t < 0.08 ? 1 + (1 - n.t / 0.08) * 0.6 : 1;
      const a = n.t > life - 0.25 ? (life - n.t) / 0.25 : 1;
      let size = 22, fill = '#f3ede2';
      if (n.kind === 'crit') { size = 32; fill = '#f2b24a'; }
      else if (n.kind === 'player') { size = 26; fill = '#ff5a4a'; }
      else if (n.kind === 'heal') { size = 22; fill = '#8fe388'; }
      else if (n.kind === 'info') { size = 22; fill = '#f2b24a'; }
      else if (n.kind === 'aoe') { size = 18; fill = '#e6d6c0'; }
      ctx.globalAlpha = a;
      ctx.font = `800 ${Math.round(size * pop * dpr)}px "Big Shoulders Display", sans-serif`;
      ctx.lineWidth = 4 * dpr; ctx.strokeStyle = 'rgba(12,12,16,0.9)';
      ctx.strokeText(n.text, sx, sy);
      ctx.fillStyle = fill; ctx.fillText(n.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}

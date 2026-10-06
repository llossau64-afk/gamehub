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
      r2: new Float32Array(MAXP), g2: new Float32Array(MAXP), b2: new Float32Array(MAXP), grow: new Float32Array(MAXP),
    };
    this.pn = 0;
    const sparkGeo = new THREE.OctahedronGeometry(0.5, 0);
    this.sparks = new Batch(sparkGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXP, true);
    const debrisGeo = new THREE.TetrahedronGeometry(0.5, 0);
    this.debris = new Batch(debrisGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 500, true);
    this.sparks.mesh.visible = false; // glow particles are drawn as soft points now
    scene.add(this.sparks.mesh, this.debris.mesh);
    // Soft round particles: additive "glow" (fire, sparks, magic) and normal-blended "smoke".
    const mkPoints = (additive) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(MAXP * 3), col = new Float32Array(MAXP * 3), size = new Float32Array(MAXP), alpha = new Float32Array(MAXP);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
      const mat = new THREE.ShaderMaterial({
        uniforms: { scale: { value: 600 }, soft: { value: additive ? 1.6 : 1.2 } },
        vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
          void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; varying float vA; uniform float soft;
          void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, soft) * vA;
          ${additive ? 'gl_FragColor = vec4(vC + vec3(pow(1.0 - d, 6.0)) * 0.35 * vA, a);' : 'gl_FragColor = vec4(vC, a);'}
          #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 4 : 3;
      scene.add(pts);
      return { pts, geo, mat, pos, col, size, alpha, n: 0 };
    };
    this.glow = mkPoints(true);
    this.smoke = mkPoints(false);

    // Sword trail ribbon that follows the real blade path.
    this.trail = { n: 0, max: 22, base: [], tip: [], t: [], color: new THREE.Color(1, 1, 1) };
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(22 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let k = 0; k < 21; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(idx);
    this.trailMesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.trailMesh.frustumCulled = false; this.trailMesh.renderOrder = 5;
    scene.add(this.trailMesh);

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

    // ---- impact stars (camera-facing sprites) ----
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sg = sc.getContext('2d');
    const rg = sg.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.25)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
    sg.fillStyle = '#fff'; sg.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? 9 : 62; sg.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    sg.closePath(); sg.fill();
    const starTex = new THREE.CanvasTexture(sc); starTex.colorSpace = THREE.SRGBColorSpace;
    this.impacts = [];
    for (let i = 0; i < 24; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      sp.visible = false; sp.renderOrder = 5; scene.add(sp);
      this.impacts.push({ sp, t: 0, life: 0, size: 1 });
    }

    // ---- dash afterimages ----
    this.ghosts = [];
    const gBody = new THREE.CylinderGeometry(0.27, 0.33, 0.52, 7); gBody.translate(0, 0.42, 0);
    const gHead = new THREE.DodecahedronGeometry(0.27, 0); gHead.translate(0, 0.9, 0);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const grp = new THREE.Group(); grp.add(new THREE.Mesh(gBody, mat), new THREE.Mesh(gHead, mat));
      grp.visible = false; scene.add(grp);
      this.ghosts.push({ grp, mat, t: 0, life: 0 });
    }

    // ---- spawn light columns ----
    this.beams = [];
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, true); beamGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      this.beams.push({ m, t: 0, life: 0, r: 0.5 });
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
    for (const i of this.impacts) { i.life = 0; i.sp.visible = false; }
    for (const g of this.ghosts) { g.life = 0; g.grp.visible = false; }
    for (const b of this.beams) { b.life = 0; b.m.visible = false; }
    for (const m of this.markers) this.releaseMarker(m);
    this.trailClear();
  }

  // ---------- particles ----------
  emit(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    if (this.pn >= MAXP) return;
    const p = this.p, i = this.pn++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.max[i] = life; p.size[i] = size;
    p.r[i] = color.r; p.g[i] = color.g; p.b[i] = color.b;
    p.grav[i] = opts.grav ?? 14; p.drag[i] = opts.drag ?? 2.5; p.rot[i] = rand(0, TAU);
    p.add[i] = opts.debris ? 0 : opts.smoke ? 2 : 1;
    const c2 = opts.col2 ? (opts.col2.isColor ? opts.col2 : (opts.col2 = new THREE.Color(opts.col2))) : color;
    p.r2[i] = c2.r; p.g2[i] = c2.g; p.b2[i] = c2.b;
    p.grow[i] = opts.grow ?? (opts.smoke ? 2.5 : 0);
  }

  // Sword trail: called every frame with the blade's base and tip in world space.
  trailPush(bx, by, bz, tx, ty, tz, color) {
    const T = this.trail, now = performance.now() / 1000;
    T.base.unshift([bx, by, bz]); T.tip.unshift([tx, ty, tz]); T.t.unshift(now);
    if (T.base.length > T.max) { T.base.pop(); T.tip.pop(); T.t.pop(); }
    if (color) T.color.set(color);
  }
  trailClear() { const T = this.trail; T.base.length = T.tip.length = T.t.length = 0; }

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
        const bright = Math.pow(t, 3) * 0.42;
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
    // soft glow along the bolt gives it body (a 1px line alone looks thin)
    const gc = this._boltCol || (this._boltCol = new THREE.Color());
    gc.set(color);
    for (let k = 0; k < 10; k++) for (let m = 0; m < 2; m++) {
      const t = m / 2, k2 = Math.min(9, k + 1);
      this.emit(arr[k * 3] + (arr[k2 * 3] - arr[k * 3]) * t, arr[k * 3 + 1] + (arr[k2 * 3 + 1] - arr[k * 3 + 1]) * t, arr[k * 3 + 2] + (arr[k2 * 3 + 2] - arr[k * 3 + 2]) * t, 0, 0, 0, life * 1.1, 0.26, gc, { grav: 0, drag: 0 });
    }
    b.t = 0; b.life = life; b.line.visible = true;
  }

  impact(x, y, z, color = 0xffffff, size = 1.2, life = 0.13) {
    const it = this.impacts.find(i => i.life <= 0) || this.impacts[0];
    it.sp.material.color.set(color); it.sp.position.set(x, y, z);
    it.sp.material.rotation = Math.random() * Math.PI;
    it.t = 0; it.life = life; it.size = size; it.sp.visible = true;
  }

  ghost(x, y, z, rotY, color, life = 0.26) {
    const g = this.ghosts.find(g => g.life <= 0) || this.ghosts[0];
    g.grp.position.set(x, y, z); g.grp.rotation.y = rotY; g.mat.color.set(color);
    g.t = 0; g.life = life; g.grp.visible = true;
  }

  beam(x, z, color, r = 0.5, life = 0.7) {
    const b = this.beams.find(b => b.life <= 0) || this.beams[0];
    b.m.position.set(x, 0, z); b.m.material.color.set(color);
    b.t = 0; b.life = life; b.r = r; b.m.visible = true;
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
    this.debris.begin();
    const G = this.glow, S = this.smoke; G.n = 0; S.n = 0;
    for (let i = 0; i < this.pn; i++) {
      const f = p.life[i] / p.max[i], k1 = 1 - f;
      const r = p.r[i] + (p.r2[i] - p.r[i]) * k1, g = p.g[i] + (p.g2[i] - p.g[i]) * k1, b = p.b[i] + (p.b2[i] - p.b[i]) * k1;
      if (p.add[i] === 0) {
        const s = p.size[i] * Math.min(1, f * 3);
        const k = this.debris.push(p.x[i], p.y[i], p.z[i], s, s, s, p.rot[i]);
        this.debris.color(k, r, g, b);
        continue;
      }
      const P = p.add[i] === 1 ? G : S, n = P.n++;
      P.pos[n * 3] = p.x[i]; P.pos[n * 3 + 1] = p.y[i]; P.pos[n * 3 + 2] = p.z[i];
      P.col[n * 3] = r; P.col[n * 3 + 1] = g; P.col[n * 3 + 2] = b;
      const grow = 1 + p.grow[i] * k1;
      if (p.add[i] === 1) { P.size[n] = p.size[i] * 2.8 * (p.grow[i] ? grow : 0.35 + 0.65 * f); P.alpha[n] = Math.min(1, f * 2.2); }
      else { P.size[n] = p.size[i] * 3.2 * grow; P.alpha[n] = Math.min(1, f * 1.5, k1 * 8) * 0.55; }
    }
    this.debris.end();
    const cam = this.world.camera, h = this.world.renderer.domElement.height;
    const scale = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    for (const P of [G, S]) {
      P.mat.uniforms.scale.value = scale;
      P.geo.setDrawRange(0, P.n);
      for (const k of ['position', 'color', 'size', 'alpha']) P.geo.attributes[k].needsUpdate = true;
    }
    // sword trail
    const T = this.trail, now = performance.now() / 1000, tp = this.trailMesh.geometry.attributes.position.array, tc = this.trailMesh.geometry.attributes.color.array;
    while (T.t.length && now - T.t[T.t.length - 1] > 0.13) { T.base.pop(); T.tip.pop(); T.t.pop(); }
    const nT = T.base.length;
    this.trailMesh.visible = nT > 1;
    if (nT > 1) {
      for (let k = 0; k < T.max; k++) {
        const q = Math.min(k, nT - 1), b = T.base[q], t = T.tip[q], o = k * 6;
        // pull the inner edge toward the tip so the ribbon tapers like a smear
        tp[o] = b[0] + (t[0] - b[0]) * 0.35; tp[o + 1] = b[1] + (t[1] - b[1]) * 0.35; tp[o + 2] = b[2] + (t[2] - b[2]) * 0.35;
        tp[o + 3] = t[0]; tp[o + 4] = t[1]; tp[o + 5] = t[2];
        const age = k < nT ? Math.max(0, 1 - (now - T.t[q]) / 0.13) * (1 - k / T.max) : 0;
        const a = age * age;
        tc[o] = T.color.r * a * 0.25; tc[o + 1] = T.color.g * a * 0.25; tc[o + 2] = T.color.b * a * 0.25;
        tc[o + 3] = Math.min(1, T.color.r * a * 1.3 + a * 0.3); tc[o + 4] = Math.min(1, T.color.g * a * 1.3 + a * 0.3); tc[o + 5] = Math.min(1, T.color.b * a * 1.3 + a * 0.3);
      }
      this.trailMesh.geometry.attributes.position.needsUpdate = true;
      this.trailMesh.geometry.attributes.color.needsUpdate = true;
    }

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
    for (const it of this.impacts) {
      if (it.life <= 0) continue;
      it.t += dt; const f = it.t / it.life;
      if (f >= 1) { it.life = 0; it.sp.visible = false; continue; }
      const s = it.size * (0.45 + Math.sqrt(f) * 0.8);
      it.sp.scale.set(s, s, 1); it.sp.material.opacity = 1 - f * f; it.sp.material.rotation += dt * 4;
    }
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.t += dt; const f = g.t / g.life;
      if (f >= 1) { g.life = 0; g.grp.visible = false; continue; }
      g.mat.opacity = 0.42 * (1 - f); g.grp.scale.setScalar(1 + f * 0.15);
    }
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.t += dt; const f = b.t / b.life;
      if (f >= 1) { b.life = 0; b.m.visible = false; continue; }
      const grow = Math.min(1, f * 4), h = 3.2 * grow;
      b.m.scale.set(b.r * (1 - f * 0.6), h, b.r * (1 - f * 0.6));
      b.m.material.opacity = 0.35 * (1 - f);
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

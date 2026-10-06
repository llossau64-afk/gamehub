// Renderer, camera, room geometry and instanced batches.
import * as THREE from '../lib/three.module.min.js';
import { TILE, T, tileAt, toWorld } from './rooms.js';
import { lambert } from './models.js';
import { damp, clamp } from './util.js';

// Biomes shift the palette every 10 floors while keeping the same materials and lighting.
export const THEMES = [
  { name: 'Basement', floor: '#3a3633', floor2: '#34302e', grout: '#24211f', wall: 0x5b524a, wallTop: 0x8a7d70, accent: '#f2b24a', bg: 0x0f0f12, hemiSky: 0xd8d2ff, hemiGround: 0x3b2c22 },
  { name: 'Offices', floor: '#2f3a3d', floor2: '#2b3538', grout: '#1c2426', wall: 0x46585c, wallTop: 0x7a9396, accent: '#7fd6c8', bg: 0x0d1113, hemiSky: 0xcfe8ff, hemiGround: 0x22302e },
  { name: 'Foundry', floor: '#3d302a', floor2: '#382b25', grout: '#231a16', wall: 0x6b4a3a, wallTop: 0xa0705a, accent: '#ff8a4a', bg: 0x120d0b, hemiSky: 0xffe0c8, hemiGround: 0x40241a },
  { name: 'Penthouse', floor: '#332f3d', floor2: '#2e2a38', grout: '#1d1a25', wall: 0x544a68, wallTop: 0x8a7cab, accent: '#d4a8ff', bg: 0x0f0d14, hemiSky: 0xeadcff, hemiGround: 0x2a2038 },
];
export const themeFor = floor => THEMES[Math.floor(Math.max(0, floor - 1) / 10) % THEMES.length];

const _m = new THREE.Matrix4();

// Immediate-mode instanced batch: push transforms every frame, then end().
export class Batch {
  constructor(geometry, material, max, colors = false) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.max = max; this.n = 0;
    this.arr = this.mesh.instanceMatrix.array;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (colors) {
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.col = this.mesh.instanceColor.array;
    }
  }
  begin() { this.n = 0; }
  push(x, y, z, sx, sy = sx, sz = sx, ry = 0) {
    if (this.n >= this.max) return -1;
    const a = this.arr, o = this.n * 16, c = Math.cos(ry), s = Math.sin(ry);
    a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = s * sz; a[o + 9] = 0; a[o + 10] = c * sz; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
    return this.n++;
  }
  color(i, r, g, b) { if (i < 0) return; const o = i * 3; this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b; }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.col) this.mesh.instanceColor.needsUpdate = true;
  }
}

function radialTexture(inner = 'rgba(0,0,0,0.55)', size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.6, inner.replace(/[\d.]+\)$/, m => (parseFloat(m) * 0.6) + ')')); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.setClearColor(0x0f0f12);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 120);
    this.pitch = 1.0; // radians from horizontal
    this.dist = 22;
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.shake = { trauma: 0, x: 0, z: 0, t: 0 };
    this.shakeScale = 1;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.quality = 'auto';

    this.hemi = new THREE.HemisphereLight(0xd8d2ff, 0x3b2c22, 1.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
    this.sun.position.set(-6, 14, 7);
    this.scene.add(this.sun);

    this.roomGroup = new THREE.Group(); this.scene.add(this.roomGroup);
    this.dynamic = new THREE.Group(); this.scene.add(this.dynamic);

    // ---- shared instanced batches ----
    const add = b => { this.scene.add(b.mesh); return b; };
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.6)'), transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
    this.shadows = add(new Batch(shadowGeo, shadowMat, 200));
    this.shadows.mesh.renderOrder = -1;

    const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8); coinGeo.rotateX(Math.PI / 2);
    this.coins = add(new Batch(coinGeo, lambert(0xf2b24a, { emissive: 0x6b4300, emissiveIntensity: 0.6 }), 400));

    const bGeo = new THREE.IcosahedronGeometry(0.16, 0);
    this.bulletCore = add(new Batch(bGeo, new THREE.MeshBasicMaterial({ color: 0xfff0f6 }), 400));
    this.bulletGlow = add(new Batch(bGeo, new THREE.MeshBasicMaterial({ color: 0xff3d8b, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), 400));

    // Blade wave: a flat crescent.
    const cres = new THREE.Shape();
    cres.absarc(0, 0, 0.62, -1.1, 1.1, false);
    cres.absarc(-0.3, 0, 0.62, 0.95, -0.95, true);
    const cresGeo = new THREE.ShapeGeometry(cres, 6); cresGeo.rotateX(-Math.PI / 2); cresGeo.rotateY(-Math.PI / 2);
    this.waveMat = new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.waves = add(new Batch(cresGeo, this.waveMat, 200));
    const boltGeo = new THREE.BoxGeometry(0.09, 0.09, 0.42);
    this.droneShots = add(new Batch(boltGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), 200));
    const orbitGeo = new THREE.OctahedronGeometry(0.22, 0); orbitGeo.scale(0.5, 0.4, 1.6);
    this.orbitMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8 });
    this.orbits = add(new Batch(orbitGeo, this.orbitMat, 12));
    const droneGeo = new THREE.OctahedronGeometry(0.2, 0);
    this.drones = add(new Batch(droneGeo, lambert(0xe9e2d4, { emissive: 0xf2b24a, emissiveIntensity: 0.35 }), 8));

    this.resize();
  }

  setQuality(q) { this.quality = q; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const cap = this.quality === 'low' ? 1 : this.quality === 'high' ? 2 : Math.min(this.autoCap || 2, 2);
    this.pixelRatio = Math.min(dpr, cap);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Frame roughly the same play area on every screen shape.
    const portrait = w < h;
    const wantW = portrait ? 10.5 : 21, wantH = portrait ? 15 : 14;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dW = wantW / (2 * tanV * this.camera.aspect), dH = wantH / (2 * tanV);
    this.baseDist = clamp(Math.max(dW, dH * 0.9), 15, 34);
    this.camera.updateProjectionMatrix();
    this.viewW = 2 * tanV * this.camera.aspect * this.baseDist;
    this.viewH = 2 * tanV * this.baseDist / Math.sin(this.pitch);
  }

  // Adaptive resolution: drop pixel ratio if frames are consistently slow.
  perfSample(dt) {
    if (this.quality !== 'auto') return;
    this._acc = (this._acc || 0) + dt; this._frames = (this._frames || 0) + 1;
    if (this._acc < 2) return;
    const avg = this._acc / this._frames; this._acc = 0; this._frames = 0;
    const cur = this.autoCap || 2;
    if (avg > 1 / 50 && cur > 0.75) { this.autoCap = Math.max(0.75, Math.min(cur, this.pixelRatio) - 0.25); this.resize(); }
  }

  addShake(amount) { this.shake.trauma = Math.min(1, this.shake.trauma + amount * this.shakeScale); }

  updateCamera(dt, tx, tz, opts = {}) {
    const room = this.room;
    let x = tx, z = tz;
    if (room && !opts.free) {
      const hw = room.w * TILE / 2, hh = room.h * TILE / 2;
      const mx = Math.max(0, hw - this.viewW / 2 + 1.2), mz = Math.max(0, hh - this.viewH / 2 + 1.4);
      x = clamp(x, -mx, mx); z = clamp(z, -mz + 0.8, mz + 0.8);
    }
    const k = opts.snap ? 1000 : (opts.lambda || 7);
    this.camTarget.x = damp(this.camTarget.x, x, k, dt);
    this.camTarget.z = damp(this.camTarget.z, z, k, dt);
    this.camTarget.y = opts.y || 0;
    const targetDist = this.baseDist * (opts.zoom || 1);
    this.dist = opts.snap ? targetDist : damp(this.dist, targetDist, 4, dt);

    const s = this.shake;
    s.trauma = Math.max(0, s.trauma - dt * 1.6);
    s.t += dt * 38;
    const amt = s.trauma * s.trauma * 0.55;
    const sx = (Math.sin(s.t * 1.1) + Math.sin(s.t * 2.3) * 0.5) * amt;
    const sz = (Math.cos(s.t * 1.3) + Math.sin(s.t * 1.9) * 0.5) * amt;
    const p = opts.pitch || this.pitch;
    this.camPos.set(this.camTarget.x + sx, this.camTarget.y + Math.sin(p) * this.dist, this.camTarget.z + Math.cos(p) * this.dist + sz);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x + sx, this.camTarget.y, this.camTarget.z + sz);
    if (opts.roll) this.camera.rotateZ(opts.roll);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  // ---------------- room construction ----------------
  clearRoom() {
    for (const c of [...this.roomGroup.children]) {
      this.roomGroup.remove(c);
      c.traverse(o => {
        if (o.geometry && o.userData.own) o.geometry.dispose();
        if (o.material && o.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }
  }

  buildRoom(room, floorNum) {
    this.clearRoom();
    this.room = room;
    const th = this.theme = themeFor(floorNum);
    this.renderer.setClearColor(th.bg);
    this.hemi.color.set(th.hemiSky); this.hemi.groundColor.set(th.hemiGround);
    const W = room.w * TILE, H = room.h * TILE;

    // Floor: one plane with a generated tile texture.
    const ppt = 40, cv = document.createElement('canvas');
    cv.width = room.w * ppt; cv.height = room.h * ppt;
    const g = cv.getContext('2d');
    const bg = '#' + new THREE.Color(th.bg).getHexString();
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    let seed = floorNum * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
      const t = tileAt(room, i, j);
      if (t === T.VOID || t === T.WALL) continue;
      const x = i * ppt, y = j * ppt;
      g.fillStyle = th.grout; g.fillRect(x, y, ppt, ppt);
      g.fillStyle = (i + j) % 2 ? th.floor : th.floor2; g.fillRect(x + 1.5, y + 1.5, ppt - 3, ppt - 3);
      const v = rnd();
      if (v < 0.25) { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(x + 2, y + 2, ppt - 4, (ppt - 4) / 2); }
      if (v > 0.93) { // crack
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.beginPath();
        g.moveTo(x + rnd() * ppt, y + 3); g.lineTo(x + ppt * 0.5, y + ppt * 0.5); g.lineTo(x + rnd() * ppt, y + ppt - 3); g.stroke();
      }
      if (t === T.TRAP) {
        g.fillStyle = '#1b1c20'; g.fillRect(x + 4, y + 4, ppt - 8, ppt - 8);
        g.fillStyle = '#0c0c0e';
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { g.beginPath(); g.arc(x + 12 + a * 16, y + 12 + b * 16, 3, 0, 7); g.fill(); }
      }
    }
    // Soft ambient occlusion along walls.
    for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
      const t = tileAt(room, i, j);
      if (t === T.VOID || t === T.WALL) continue;
      const x = i * ppt, y = j * ppt;
      const occ = (di, dj) => { const n = tileAt(room, i + di, j + dj); return n === T.WALL || n === T.PILLAR; };
      const shade = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => {
        const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      };
      if (occ(0, -1)) shade(x, y, x + ppt, y + ppt * 0.5, x, y, x, y + ppt * 0.5);
      if (occ(-1, 0)) shade(x, y, x + ppt * 0.35, y + ppt, x, y, x + ppt * 0.35, y);
      if (occ(1, 0)) shade(x + ppt * 0.65, y, x + ppt, y + ppt, x + ppt, y, x + ppt * 0.65, y);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: tex }));
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.userData.own = true;
    this.roomGroup.add(floorMesh);
    // Bigger dark ground so the edges never show.
    const under = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80), new THREE.MeshBasicMaterial({ color: th.bg }));
    under.rotation.x = -Math.PI / 2; under.position.y = -0.02; under.userData.own = true;
    this.roomGroup.add(under);

    // Walls: instanced boxes with a lighter top face (vertex colours).
    const wallTiles = [];
    for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
      if (tileAt(room, i, j) !== T.WALL) continue;
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) {
        const n = tileAt(room, i + di, j + dj); if (n !== T.WALL && n !== T.VOID) { near = true; break; }
      }
      if (!near) continue;
      const south = tileAt(room, i, j + 1), north = tileAt(room, i, j - 1);
      const open = t => t !== T.WALL && t !== T.VOID;
      // Back walls stand tall; front walls stay low so they never hide the action.
      const hgt = open(south) ? 1.9 : open(north) && !open(south) ? 0.55 : 1.25;
      wallTiles.push([i, j, hgt]);
    }
    const wallGeo = new THREE.BoxGeometry(TILE, 1, TILE);
    wallGeo.translate(0, 0.5, 0);
    const wc = new THREE.Color(th.wall), wt = new THREE.Color(th.wallTop);
    const cols = [];
    const pos = wallGeo.attributes.position, nrm = wallGeo.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const top = nrm.getY(k) > 0.5, y = pos.getY(k);
      const c = top ? wt : wc.clone().multiplyScalar(0.65 + y * 0.35);
      cols.push(c.r, c.g, c.b);
    }
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const wallMesh = new THREE.InstancedMesh(wallGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), wallTiles.length);
    wallTiles.forEach(([i, j, hgt], k) => {
      const [x, z] = toWorld(room, i, j);
      _m.makeScale(1, hgt, 1); _m.setPosition(x, 0, z);
      wallMesh.setMatrixAt(k, _m);
      const v = 0.92 + ((i * 7 + j * 13) % 5) * 0.03;
      wallMesh.setColorAt(k, new THREE.Color(v, v, v));
    });
    wallMesh.userData.own = true;
    this.roomGroup.add(wallMesh);

    // Wall lamps on tall back walls: small warm panels.
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.accent).lerp(new THREE.Color(0xffffff), 0.35) });
    const lampGeo = new THREE.BoxGeometry(0.5, 0.18, 0.06);
    const lamps = wallTiles.filter(([i, j, h]) => h > 1.8 && i % 4 === 1);
    if (lamps.length) {
      const lm = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
      lamps.forEach(([i, j], k) => { const [x, z] = toWorld(room, i, j); _m.makeTranslation(x, 1.45, z + TILE / 2 + 0.03); lm.setMatrixAt(k, _m); });
      lm.userData.own = true; this.roomGroup.add(lm);
    }

    // Floor number painted on the back wall above the exit.
    if (room.exit) {
      const [ex] = toWorld(room, room.exit[0], room.exit[1]);
      let wallJ = room.exit[1] - 1;
      const [, wz] = toWorld(room, room.exit[0], wallJ);
      const c2 = document.createElement('canvas'); c2.width = 256; c2.height = 96;
      const g2 = c2.getContext('2d');
      g2.fillStyle = 'rgba(0,0,0,0)'; g2.fillRect(0, 0, 256, 96);
      g2.font = '800 70px "Big Shoulders Display", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillStyle = th.accent; g2.globalAlpha = 0.85;
      g2.fillText(String(floorNum).padStart(2, '0'), 128, 52);
      const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: t2, transparent: true, depthWrite: false }));
      sign.position.set(ex, 1.1, wz + TILE / 2 + 0.02); sign.userData.own = true;
      this.roomGroup.add(sign);
    }

    // Pillars.
    if (room.pillars.length) {
      // Square columns: neighbouring pillar tiles merge into solid blocks.
      const pg = new THREE.BoxGeometry(TILE * 0.98, 1.9, TILE * 0.98); pg.translate(0, 0.95, 0);
      const pm = new THREE.InstancedMesh(pg, lambert(new THREE.Color(th.wall).multiplyScalar(1.05).getHex()), room.pillars.length);
      const capG = new THREE.BoxGeometry(TILE * 1.02, 0.16, TILE * 1.02); capG.translate(0, 1.9, 0);
      const cm = new THREE.InstancedMesh(capG, lambert(th.wallTop), room.pillars.length);
      room.pillars.forEach(([i, j], k) => { const [x, z] = toWorld(room, i, j); _m.makeTranslation(x, 0, z); pm.setMatrixAt(k, _m); cm.setMatrixAt(k, _m); });
      pm.userData.own = cm.userData.own = true;
      this.roomGroup.add(pm, cm);
    }

    // Crates (breakable).
    this.crateMesh = null;
    if (room.crates.length) {
      const cg = new THREE.BoxGeometry(TILE * 0.82, 0.8, TILE * 0.82); cg.translate(0, 0.4, 0);
      const cc = []; const cp = cg.attributes.position, cn = cg.attributes.normal;
      const wood = new THREE.Color(0x8a6440), woodTop = new THREE.Color(0xb48a5c);
      for (let k = 0; k < cp.count; k++) { const c = cn.getY(k) > 0.5 ? woodTop : wood; cc.push(c.r, c.g, c.b); }
      cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
      this.crateMesh = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ vertexColors: true }), room.crates.length);
      room.crates.forEach(([i, j], k) => this.setCrate(k, true));
      this.crateMesh.userData.own = true;
      this.roomGroup.add(this.crateMesh);
    }

    // Traps: plates + spikes.
    this.trapPlates = this.trapSpikes = null;
    if (room.traps.length) {
      const plateG = new THREE.BoxGeometry(TILE * 0.86, 0.04, TILE * 0.86);
      this.trapPlates = new THREE.InstancedMesh(plateG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }), room.traps.length);
      this.trapPlates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(room.traps.length * 3), 3);
      room.traps.forEach(([i, j], k) => { const [x, z] = toWorld(room, i, j); _m.makeTranslation(x, 0.03, z); this.trapPlates.setMatrixAt(k, _m); });
      this.trapPlates.material.opacity = 1;
      const sg = new THREE.ConeGeometry(0.11, 0.55, 4); sg.translate(0, 0.27, 0);
      this.trapSpikes = new THREE.InstancedMesh(sg, lambert(0xc9ccd4), room.traps.length * 4);
      this.trapPlates.userData.own = this.trapSpikes.userData.own = true;
      this.roomGroup.add(this.trapPlates, this.trapSpikes);
      this.setTraps(0, 0);
    }

    // Lifts.
    this.exitLift = room.exit ? this.makeLift(room.exit, true) : null;
    this.entryLift = room.entry ? this.makeLift(room.entry, false) : null;
  }

  makeLift([i, j], isExit) {
    const [x, z] = toWorld(this.room, i, j);
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(TILE * 0.62, TILE * 0.68, 0.12, 12), lambert(0x2a2c33));
    base.position.y = 0.06; g.add(base);
    const ringMat = new THREE.MeshBasicMaterial({ color: isExit ? 0x5a3b3b : 0x4a4f5a });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TILE * 0.52, 0.05, 4, 24), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.13; g.add(ring);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xf2b24a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(TILE * 0.5, TILE * 0.55, 3.2, 16, 1, true), beamMat);
    beam.position.y = 1.6; g.add(beam);
    g.traverse(o => { o.userData.own = true; });
    this.roomGroup.add(g);
    return { group: g, ring, ringMat, beam, beamMat, x, z, base };
  }

  setCrate(k, alive) {
    const [i, j] = this.room.crates[k], [x, z] = toWorld(this.room, i, j);
    const s = alive ? 1 : 0;
    _m.makeRotationY(((i * 31 + j * 17) % 7) * 0.08); _m.scale(new THREE.Vector3(s, s, s)); _m.setPosition(x, 0, z);
    this.crateMesh.setMatrixAt(k, _m); this.crateMesh.instanceMatrix.needsUpdate = true;
  }

  // warn: 0..1 glow, up: 0..1 spike extension
  setTraps(warn, up) {
    if (!this.trapSpikes) return;
    const room = this.room;
    const c = new THREE.Color(0xff4a3a).multiplyScalar(warn * 0.55);
    room.traps.forEach(([i, j], k) => {
      const [x, z] = toWorld(room, i, j);
      this.trapPlates.setColorAt(k, c);
      for (let s = 0; s < 4; s++) {
        const ox = (s % 2 ? 0.22 : -0.22) * TILE, oz = (s < 2 ? 0.22 : -0.22) * TILE;
        _m.makeScale(1, Math.max(0.001, up), 1); _m.setPosition(x + ox, -0.25 * (1 - up), z + oz);
        this.trapSpikes.setMatrixAt(k * 4 + s, _m);
      }
    });
    this.trapPlates.instanceColor.needsUpdate = true;
    this.trapSpikes.instanceMatrix.needsUpdate = true;
  }
}

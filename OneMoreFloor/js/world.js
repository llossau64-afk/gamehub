// Renderer, camera, room geometry and instanced batches.
import * as THREE from '../lib/three.module.min.js';
import { TILE, T, tileAt, toWorld } from './rooms.js';
import { lambert } from './models.js';
import { toonRamp as toonRampW } from './characters.js';
import { damp, clamp } from './util.js';

// Biomes shift the palette every 10 floors while keeping the same materials and lighting.
export const THEMES = [
  { name: 'Basement', style: 'tiles', pipes: true, floor: '#3a3633', floor2: '#34302e', grout: '#24211f', wall: 0x5b524a, wallTop: 0x8a7d70, accent: '#f2b24a', bg: 0x0f0f12, hemiSky: 0xd8d2ff, hemiGround: 0x3b2c22 },
  { name: 'Offices', style: 'carpet', floor: '#2f3a3d', floor2: '#2b3538', grout: '#1c2426', wall: 0x46585c, wallTop: 0x7a9396, accent: '#7fd6c8', bg: 0x0d1113, hemiSky: 0xcfe8ff, hemiGround: 0x22302e },
  { name: 'Foundry', style: 'plates', pipes: true, floor: '#3d302a', floor2: '#382b25', grout: '#231a16', wall: 0x6b4a3a, wallTop: 0xa0705a, accent: '#ff8a4a', bg: 0x120d0b, hemiSky: 0xffe0c8, hemiGround: 0x40241a },
  { name: 'Penthouse', style: 'marble', floor: '#332f3d', floor2: '#2e2a38', grout: '#1d1a25', wall: 0x544a68, wallTop: 0x8a7cab, accent: '#d4a8ff', bg: 0x0f0d14, hemiSky: 0xeadcff, hemiGround: 0x2a2038 },
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

    this.glowTex = radialTexture('rgba(255,255,255,1)', 128);
    this.roomGroup = new THREE.Group(); this.scene.add(this.roomGroup);
    // A faint light that travels with the player: keeps the hero readable in dark corners.
    const plGeo = new THREE.PlaneGeometry(1, 1); plGeo.rotateX(-Math.PI / 2);
    this.playerLight = new THREE.Mesh(plGeo, new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0x3a3226, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.playerLight.scale.set(7, 1, 7); this.playerLight.position.y = 0.015; this.playerLight.renderOrder = -2;
    this.scene.add(this.playerLight);
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
    // Powers: fireballs, boulders, wind blades and scorch marks.
    const fbGeo = new THREE.IcosahedronGeometry(0.26, 1);
    this.fireCore = add(new Batch(fbGeo, new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), 60));
    this.fireGlow = add(new Batch(fbGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 60));
    this.rocks = add(new Batch(new THREE.DodecahedronGeometry(0.42, 0), lambert(0x8a7258), 60));
    this.winds = add(new Batch(cresGeo, new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 80));
    const scGeo = new THREE.CircleGeometry(0.5, 14); scGeo.rotateX(-Math.PI / 2);
    this.scorch = add(new Batch(scGeo, new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)'), transparent: true, depthWrite: false }), 40, true));
    this.scorch.mesh.renderOrder = -1;
    const fzGeo = new THREE.CircleGeometry(0.5, 20); fzGeo.rotateX(-Math.PI / 2);
    this.zones = add(new Batch(fzGeo, new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,255,255,1)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 30, true));
    // Ground spikes for Earth Throw and Frost Nova (erupt, hold, sink).
    const stoneG = new THREE.ConeGeometry(0.22, 1, 5); stoneG.translate(0, 0.5, 0);
    this.stoneSpikes = add(new Batch(stoneG, new THREE.MeshToonMaterial({ color: 0x8a7258, gradientMap: toonRampW() }), 120));
    const iceG = new THREE.OctahedronGeometry(0.2, 0); iceG.scale(1, 2.6, 1); iceG.translate(0, 0.4, 0);
    this.iceSpikes = add(new Batch(iceG, new THREE.MeshToonMaterial({ color: 0xcff4ff, emissive: 0x2a7a9a, emissiveIntensity: 0.6, gradientMap: toonRampW() }), 120));
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

  // Quick zoom-in kick on big hits; decays on its own.
  punch(amount) { this.punchAmt = Math.min(0.12, (this.punchAmt || 0) + amount * this.shakeScale); }

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
    this.punchAmt = Math.max(0, (this.punchAmt || 0) - dt * 0.6);
    const targetDist = this.baseDist * (opts.zoom || 1) * (1 - (this.punchAmt || 0));
    this.dist = opts.snap ? targetDist : damp(this.dist, targetDist, this.punchAmt > 0.01 ? 18 : 4, dt);

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
        if (o.material && o.userData.own) { if (o.material.map && o.material.map !== this.glowTex) o.material.map.dispose(); o.material.dispose(); }
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

    // Floor: one plane with a generated texture. Each biome has its own surface.
    const ppt = 48, cv = document.createElement('canvas');
    cv.width = room.w * ppt; cv.height = room.h * ppt;
    const g = cv.getContext('2d');
    const bg = '#' + new THREE.Color(th.bg).getHexString();
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    let seed = floorNum * 9301 + 49297 + room.w * 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const walkable = t => t !== T.VOID && t !== T.WALL;
    const shadeHex = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); };
    for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
      const t = tileAt(room, i, j);
      if (!walkable(t)) continue;
      const x = i * ppt, y = j * ppt;
      const jit = 0.93 + rnd() * 0.12;
      g.fillStyle = th.grout; g.fillRect(x, y, ppt, ppt);
      if (th.style === 'carpet') {
        // large woven panels: grout only every second tile
        g.fillStyle = shadeHex(((i >> 1) + (j >> 1)) % 2 ? th.floor : th.floor2, jit);
        g.fillRect(x + (i % 2 ? 0 : 1), y + (j % 2 ? 0 : 1), ppt - (i % 2 ? 1 : 1), ppt - (j % 2 ? 1 : 1));
        g.fillStyle = 'rgba(255,255,255,0.018)';
        for (let k = 2; k < ppt; k += 4) g.fillRect(x, y + k, ppt, 1);
      } else if (th.style === 'plates') {
        g.fillStyle = shadeHex(th.floor, jit); g.fillRect(x + 1.5, y + 1.5, ppt - 3, ppt - 3);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 1.5, y + 1.5, ppt - 3, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1.5, y + ppt - 3, ppt - 3, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        for (const [rx, ry] of [[6, 6], [ppt - 6, 6], [6, ppt - 6], [ppt - 6, ppt - 6]]) { g.beginPath(); g.arc(x + rx, y + ry, 1.8, 0, 7); g.fill(); }
        if (rnd() < 0.25) { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; for (let k = 10; k < ppt - 6; k += 6) { g.beginPath(); g.moveTo(x + k, y + 10); g.lineTo(x + k - 4, y + ppt - 10); g.stroke(); } }
      } else {
        g.fillStyle = shadeHex((i + j) % 2 ? th.floor : th.floor2, jit);
        g.fillRect(x + 1.5, y + 1.5, ppt - 3, ppt - 3);
        // bevel
        g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x + 1.5, y + 1.5, ppt - 3, 2); g.fillRect(x + 1.5, y + 1.5, 2, ppt - 3);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1.5, y + ppt - 3.5, ppt - 3, 2); g.fillRect(x + ppt - 3.5, y + 1.5, 2, ppt - 3);
        if (th.style === 'marble' && rnd() < 0.5) {
          g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1; g.beginPath();
          let vx = x + rnd() * ppt, vy = y + 2; g.moveTo(vx, vy);
          for (let k = 0; k < 4; k++) { vx += (rnd() - 0.5) * 18; vy += ppt / 4; g.lineTo(Math.max(x + 2, Math.min(x + ppt - 2, vx)), Math.min(y + ppt - 2, vy)); }
          g.stroke();
        }
      }
      const v = rnd();
      if (v > 0.9 && th.style !== 'carpet') { // crack
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.3; g.beginPath();
        g.moveTo(x + rnd() * ppt, y + 3); g.lineTo(x + ppt * (0.3 + rnd() * 0.4), y + ppt * 0.5); g.lineTo(x + rnd() * ppt, y + ppt - 3); g.stroke();
      }
      if (t === T.TRAP) {
        g.fillStyle = '#18191d'; g.fillRect(x + 4, y + 4, ppt - 8, ppt - 8);
        g.strokeStyle = 'rgba(232,88,74,0.35)'; g.lineWidth = 1.5; g.strokeRect(x + 5, y + 5, ppt - 10, ppt - 10);
        g.fillStyle = '#0b0b0d';
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { g.beginPath(); g.arc(x + 15 + a * 18, y + 15 + b * 18, 3.5, 0, 7); g.fill(); }
      }
    }
    // Grime, stains and (in the basement) puddles: they break up the grid.
    const blobs = Math.round(room.w * room.h / 14);
    for (let k = 0; k < blobs; k++) {
      const bx = rnd() * cv.width, by = rnd() * cv.height, r = ppt * (0.6 + rnd() * 1.6);
      const puddle = th.style === 'tiles' && rnd() < 0.25;
      const gr = g.createRadialGradient(bx, by, 0, bx, by, r);
      gr.addColorStop(0, puddle ? 'rgba(10,14,20,0.4)' : 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(bx, by, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
      if (puddle) { g.fillStyle = 'rgba(200,215,255,0.05)'; g.beginPath(); g.ellipse(bx - r * 0.2, by - r * 0.15, r * 0.35, r * 0.12, 0.3, 0, 7); g.fill(); }
    }
    // Landing marks around both lifts: a dashed ring and chevrons pointing at the exit.
    const accent = th.accent;
    for (const [pt, isExit] of [[room.entry, false], [room.exit, true]]) {
      if (!pt) continue;
      const cx = (pt[0] + 0.5) * ppt, cy = (pt[1] + 0.5) * ppt;
      g.save(); g.strokeStyle = isExit ? accent : 'rgba(236,230,218,0.35)'; g.globalAlpha = isExit ? 0.55 : 0.4; g.lineWidth = 3;
      g.setLineDash([8, 7]); g.beginPath(); g.arc(cx, cy, ppt * 0.95, 0, 7); g.stroke(); g.restore();
      if (isExit) {
        g.save(); g.fillStyle = accent; g.globalAlpha = 0.28;
        for (let k = 0; k < 3; k++) {
          const yy = cy + ppt * (1.5 + k * 0.55);
          g.beginPath(); g.moveTo(cx - 12, yy + 7); g.lineTo(cx, yy - 3); g.lineTo(cx + 12, yy + 7); g.lineTo(cx + 12, yy + 12); g.lineTo(cx, yy + 2); g.lineTo(cx - 12, yy + 12); g.closePath(); g.fill();
        }
        g.restore();
      }
    }
    // Soft ambient occlusion along walls, pillars and props.
    for (let j = 0; j < room.h; j++) for (let i = 0; i < room.w; i++) {
      const t = tileAt(room, i, j);
      if (!walkable(t) || t === T.PILLAR || t === T.PROP) continue;
      const x = i * ppt, y = j * ppt;
      const occ = (di, dj) => { const n = tileAt(room, i + di, j + dj); return n === T.WALL || n === T.PILLAR || n === T.PROP; };
      const shade = (x0, y0, x1, y1, gx0, gy0, gx1, gy1, a) => {
        const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      };
      if (occ(0, -1)) shade(x, y, x + ppt, y + ppt * 0.7, x, y, x, y + ppt * 0.7, 0.5);
      if (occ(-1, 0)) shade(x, y, x + ppt * 0.4, y + ppt, x, y, x + ppt * 0.4, y, 0.4);
      if (occ(1, 0)) shade(x + ppt * 0.6, y, x + ppt, y + ppt, x + ppt, y, x + ppt * 0.6, y, 0.4);
      if (occ(0, 1)) shade(x, y + ppt * 0.75, x + ppt, y + ppt, x, y + ppt, x, y + ppt * 0.75, 0.25);
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

    // Wall lamps on tall back walls, each with a soft glow and a warm pool of light on the floor.
    const lampCol = new THREE.Color(th.accent).lerp(new THREE.Color(0xffffff), 0.45);
    const lampMat = new THREE.MeshBasicMaterial({ color: lampCol });
    const lampGeo = new THREE.BoxGeometry(0.55, 0.16, 0.08);
    const lamps = wallTiles.filter(([i, j, h]) => h > 1.8 && i % 4 === 1);
    if (lamps.length) {
      const lm = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
      const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.26, 0.12), lambert(0x1c1d22), lamps.length);
      const glowMat = new THREE.SpriteMaterial({ map: this.glowTex, color: lampCol, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const poolMat = new THREE.MeshBasicMaterial({ map: this.glowTex, color: new THREE.Color(th.accent).multiplyScalar(0.32), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
      lamps.forEach(([i, j], k) => {
        const [x, z] = toWorld(room, i, j), fz = z + TILE / 2;
        _m.makeTranslation(x, 1.45, fz + 0.05); lm.setMatrixAt(k, _m);
        _m.makeTranslation(x, 1.45, fz + 0.01); housing.setMatrixAt(k, _m);
        const sp = new THREE.Sprite(glowMat); sp.position.set(x, 1.45, fz + 0.2); sp.scale.set(1.5, 0.9, 1); sp.userData.own = true; this.roomGroup.add(sp);
        const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(x, 0.012, fz + 1.1); pool.scale.set(3.6, 1, 2.6); pool.userData.own = true; this.roomGroup.add(pool);
      });
      lm.userData.own = housing.userData.own = true; this.roomGroup.add(lm, housing);
    }

    // Pilasters on back walls and, in industrial biomes, a pipe run with brackets.
    const backs = wallTiles.filter(([i, j, h]) => h > 1.8);
    const pil = backs.filter(([i]) => i % 4 === 3);
    if (pil.length) {
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 1.9, 0.14), lambert(new THREE.Color(th.wallTop).multiplyScalar(0.8).getHex()), pil.length);
      pil.forEach(([i, j], k) => { const [x, z] = toWorld(room, i, j); _m.makeTranslation(x, 0.95, z + TILE / 2 + 0.06); pm.setMatrixAt(k, _m); });
      pm.userData.own = true; this.roomGroup.add(pm);
    }
    // baseboard strip along every back wall
    if (backs.length) {
      const bb = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.16, 0.06), lambert(new THREE.Color(th.wall).multiplyScalar(0.45).getHex()), backs.length);
      backs.forEach(([i, j], k) => { const [x, z] = toWorld(room, i, j); _m.makeTranslation(x, 0.08, z + TILE / 2 + 0.03); bb.setMatrixAt(k, _m); });
      bb.userData.own = true; this.roomGroup.add(bb);
    }
    if (th.pipes && backs.length) {
      const pipeMat = lambert(new THREE.Color(th.wall).multiplyScalar(0.7).lerp(new THREE.Color(0x6a7078), 0.5).getHex());
      // group contiguous back-wall tiles per row into runs
      const rows = {};
      for (const [i, j] of backs) (rows[j] = rows[j] || []).push(i);
      for (const j in rows) {
        const xs = rows[j].sort((a, b) => a - b);
        let start = xs[0];
        for (let k = 1; k <= xs.length; k++) {
          if (k < xs.length && xs[k] === xs[k - 1] + 1) continue;
          const end = xs[k - 1];
          if (end - start >= 3) {
            const [x0, z] = toWorld(room, start, +j), [x1] = toWorld(room, end, +j);
            const len = x1 - x0 + TILE * 0.8;
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 8), pipeMat);
            pipe.rotation.z = Math.PI / 2; pipe.position.set((x0 + x1) / 2, 1.78, z + TILE / 2 + 0.12); pipe.userData.own = true;
            this.roomGroup.add(pipe);
            for (let bx = start; bx <= end; bx += 3) {
              const [x] = toWorld(room, bx, +j);
              const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.2), pipeMat);
              br.position.set(x, 1.78, z + TILE / 2 + 0.08); br.userData.own = true; this.roomGroup.add(br);
            }
          }
          start = xs[k];
        }
      }
    }

    // Props that hug the walls.
    for (const [i, j, side, kind] of room.props || []) this.addProp(i, j, side, kind, th);

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
    const poolMat = new THREE.MeshBasicMaterial({ map: this.glowTex, color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const pool = new THREE.Mesh(pg, poolMat); pool.scale.set(5, 1, 5); pool.position.y = 0.014; g.add(pool);
    // rails: four short posts so the pad reads as a machine, not a decal
    const postG = new THREE.BoxGeometry(0.08, 0.5, 0.08), postM = lambert(0x3a3d45);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, p = new THREE.Mesh(postG, postM); p.position.set(Math.sin(a) * TILE * 0.66, 0.25, Math.cos(a) * TILE * 0.66); g.add(p); }
    g.traverse(o => { o.userData.own = true; });
    this.roomGroup.add(g);
    return { group: g, ring, ringMat, beam, beamMat, x, z, base, poolMat };
  }

  addProp(i, j, side, kind, th) {
    const [x, z] = toWorld(this.room, i, j);
    const g = new THREE.Group();
    // push toward the wall it leans on
    const off = TILE * 0.12, dir = [[0, -1], [1, 0], [0, 1], [-1, 0]][side];
    g.position.set(x + dir[0] * off, 0, z + dir[1] * off);
    g.rotation.y = side * Math.PI / 2 + (((i * 13 + j * 7) % 5) - 2) * 0.06;
    const metal = lambert(0x4a4f58), dark = lambert(0x23252b), rust = lambert(0x7a4a32), wood = lambert(0x8a6440), woodTop = lambert(0xa8805a);
    const add = (geo, mat, px, py, pz, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); return m; };
    if (kind === 0) { // barrels
      const bmat = th.style === 'plates' ? rust : th.style === 'carpet' ? lambert(0x3d6a7a) : lambert(0x5b6b4a);
      const bg = new THREE.CylinderGeometry(0.3, 0.3, 0.82, 10);
      add(bg, bmat, -0.2, 0.41, 0); add(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 10), dark, -0.2, 0.62, 0); add(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 10), dark, -0.2, 0.2, 0);
      add(bg, bmat, 0.34, 0.41, 0.12).scale.set(0.85, 0.85, 0.85);
    } else if (kind === 1) { // stacked boxes
      add(new THREE.BoxGeometry(0.7, 0.55, 0.6), wood, -0.1, 0.275, 0, 0.1); add(new THREE.BoxGeometry(0.72, 0.04, 0.62), woodTop, -0.1, 0.56, 0, 0.1);
      add(new THREE.BoxGeometry(0.5, 0.42, 0.45), wood, 0.05, 0.79, 0.02, -0.25);
      add(new THREE.BoxGeometry(0.42, 0.34, 0.4), wood, 0.45, 0.17, 0.15, 0.4);
    } else if (kind === 2) { // lockers / cabinets
      const lm = th.style === 'carpet' ? lambert(0x6f7f88) : metal;
      for (let k = 0; k < 2; k++) {
        add(new THREE.BoxGeometry(0.46, 1.35, 0.42), lm, -0.24 + k * 0.48, 0.675, -0.1);
        add(new THREE.BoxGeometry(0.3, 0.03, 0.02), dark, -0.24 + k * 0.48, 1.1, 0.12);
        add(new THREE.BoxGeometry(0.3, 0.03, 0.02), dark, -0.24 + k * 0.48, 1.0, 0.12);
      }
    } else { // rubble pile
      const rock = lambert(new THREE.Color(th.wall).multiplyScalar(0.9).getHex());
      const rg = new THREE.DodecahedronGeometry(0.22, 0);
      [[-0.25, 0.12, 0, 1.2], [0.15, 0.1, 0.1, 1], [0.0, 0.3, -0.05, 0.9], [0.35, 0.08, -0.15, 0.7], [-0.4, 0.07, 0.2, 0.6]].forEach(([px, py, pz, s]) => {
        const m = add(rg, rock, px, py, pz); m.scale.setScalar(s); m.rotation.set(px * 4, pz * 6, py * 3);
      });
    }
    g.traverse(o => { o.userData.own = true; });
    this.roomGroup.add(g);
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

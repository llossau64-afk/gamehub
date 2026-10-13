// Facade detail for the street block: real window frames with sills and lintels, glass with
// eight different "rooms" behind it (some lit at dusk), pilasters between the houses, string
// courses, cornices, parapets and rooftop clutter. Everything shares a handful of materials,
// so the static batching in Shop.optimize() folds it into a few draw calls.
import * as THREE from 'three';
import { rng } from '../render/textures.js';

const box = new THREE.BoxGeometry(1, 1, 1);

// 4 x 2 atlas of window interiors; a second canvas holds only what glows at night
function windowAtlas() {
  const C = 128, W = C * 4, H = C * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const e = document.createElement('canvas'); e.width = W; e.height = H;
  const x = c.getContext('2d'), xe = e.getContext('2d');
  xe.fillStyle = '#000'; xe.fillRect(0, 0, W, H);
  const r = rng(7);
  for (let i = 0; i < 8; i++) {
    const ox = (i % 4) * C, oy = Math.floor(i / 4) * C;
    const lit = i === 1 || i === 4 || i === 6;
    // room: warm and lit, or dark with the sky reflected
    const g = x.createLinearGradient(ox, oy, ox, oy + C);
    if (lit) { g.addColorStop(0, '#f3cf8e'); g.addColorStop(1, '#a8743e'); }
    else { g.addColorStop(0, '#6f8394'); g.addColorStop(0.45, '#33404b'); g.addColorStop(1, '#1d2329'); }
    x.fillStyle = g; x.fillRect(ox, oy, C, C);
    if (lit) { xe.fillStyle = '#ffdca0'; xe.fillRect(ox + 4, oy + 4, C - 8, C - 8); }
    // furniture silhouettes in lit rooms
    if (lit) {
      x.fillStyle = 'rgba(70,44,26,0.55)';
      if (i === 4) { x.fillRect(ox + 70, oy + 84, 40, 44); x.beginPath(); x.ellipse(ox + 90, oy + 76, 22, 16, 0, 0, 7); x.fill(); }   // plant
      if (i === 6) { x.fillRect(ox + 20, oy + 30, 6, 70); x.beginPath(); x.ellipse(ox + 23, oy + 30, 16, 10, 0, 0, 7); x.fill(); xe.fillStyle = '#fff1c8'; xe.beginPath(); xe.ellipse(ox + 23, oy + 32, 14, 9, 0, 0, 7); xe.fill(); }
      if (i === 1) { x.fillRect(ox + 10, oy + 96, 108, 32); }
      xe.fillStyle = 'rgba(0,0,0,0.6)';
      if (i === 4) xe.fillRect(ox + 70, oy + 70, 40, 58);
    }
    // curtains / blinds
    if (i === 1 || i === 3) {
      x.fillStyle = i === 1 ? '#b0472f' : '#c9b48a';
      x.fillRect(ox, oy, 26, C); x.fillRect(ox + C - 26, oy, 26, C);
      x.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 4; k++) { x.fillRect(ox + 4 + k * 6, oy, 2, C); x.fillRect(ox + C - 22 + k * 6, oy, 2, C); }
      if (i === 1) { xe.fillStyle = '#000'; xe.fillRect(ox, oy, 26, C); xe.fillRect(ox + C - 26, oy, 26, C); }
    }
    if (i === 2 || i === 5) {
      const n = i === 2 ? 9 : 18;
      x.fillStyle = '#d8d0bc';
      for (let k = 0; k < n; k++) { x.fillRect(ox, oy + k * 7, C, 5); }
      x.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = 0; k < n; k++) x.fillRect(ox, oy + k * 7 + 4, C, 1);
    }
    if (i === 7) { x.fillStyle = 'rgba(40,60,40,0.6)'; x.beginPath(); x.ellipse(ox + 30, oy + 40, 50, 36, 0, 0, 7); x.fill(); }
    // sky reflection streak
    x.fillStyle = `rgba(255,255,255,${lit ? 0.08 : 0.16})`;
    x.beginPath(); x.moveTo(ox + 10 + r() * 20, oy); x.lineTo(ox + 50 + r() * 20, oy); x.lineTo(ox + 10, oy + C); x.lineTo(ox - 30, oy + C); x.fill();
    // mullion + transom
    x.fillStyle = '#2a2420'; x.fillRect(ox + C / 2 - 3, oy, 6, C); x.fillRect(ox, oy + 40, C, 5);
    xe.fillStyle = '#000'; xe.fillRect(ox + C / 2 - 3, oy, 6, C); xe.fillRect(ox, oy + 40, C, 5);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const te = new THREE.CanvasTexture(e); te.colorSpace = THREE.SRGBColorSpace;
  return { map: t, emissive: te };
}

function cellPlane(i, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 2;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.25 + (uv.getX(k) < 0.5 ? 0.004 : -0.004), v0 + uv.getY(k) * 0.5 + (uv.getY(k) < 0.5 ? 0.006 : -0.006));
  return g;
}

export class Facades {
  constructor(group) {
    this.g = group;
    const atlas = windowAtlas();
    this.glassMat = new THREE.MeshStandardMaterial({ map: atlas.map, emissiveMap: atlas.emissive, emissive: new THREE.Color('#ffd49a'), emissiveIntensity: 0.15, roughness: 0.18, metalness: 0.15 });
    this.glassGeo = [];
    for (let i = 0; i < 8; i++) this.glassGeo.push(cellPlane(i, 1, 1));
    this.stone = [
      new THREE.MeshStandardMaterial({ color: '#c9bea8', roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: '#a59a88', roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: '#7d746a', roughness: 0.85 }),
    ];
    this.frame = [
      new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#2f3a33', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#5a2c22', roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#1f2328', roughness: 0.5 }),
    ];
    this.metal = new THREE.MeshStandardMaterial({ color: '#8d9294', roughness: 0.5, metalness: 0.6 });
    this.metalDark = new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.6, metalness: 0.5 });
    this.tar = new THREE.MeshStandardMaterial({ color: '#4b4744', roughness: 0.95 });
    this.brickCh = new THREE.MeshStandardMaterial({ color: '#8a4a36', roughness: 0.9 });
    this.wood = new THREE.MeshStandardMaterial({ color: '#6e5238', roughness: 0.9 });
  }

  // a box in facade space: (u along the facade, y up, n out of the wall)
  part(F, mat, u, y, n, su, sy, sn) {
    const m = new THREE.Mesh(box, mat);
    m.scale.set(su, sy, sn);
    m.position.set(F.x(u), y, F.z(n));
    this.g.add(m);
    return m;
  }

  // one building front. dir +1 faces +z (our side), -1 faces -z (the far side)
  building({ x0, x1, h, z, dir = 1, seed = 1, groundTop = 3.3, roof = true, depth = 6, skipWindows = null }) {
    const r = rng(seed * 31 + 7);
    const w = x1 - x0;
    const F = { x: (u) => (dir > 0 ? x0 + u : x1 - u), z: (n) => z + dir * n };
    const stone = this.stone[seed % 3], trim = this.stone[(seed + 1) % 3];
    const frame = this.frame[seed % 4];
    // pilasters at both ends separate the houses
    this.part(F, trim, 0.16, h / 2, 0.06, 0.32, h, 0.14);
    this.part(F, trim, w - 0.16, h / 2, 0.06, 0.32, h, 0.14);
    // string course over the shopfront, cornice, frieze and parapet
    this.part(F, stone, w / 2, groundTop + 0.12, 0.08, w, 0.18, 0.18);
    this.part(F, stone, w / 2, h - 0.12, 0.2, w + 0.12, 0.26, 0.42);
    this.part(F, trim, w / 2, h - 0.42, 0.09, w, 0.2, 0.2);
    for (let u = 0.45; u < w - 0.3; u += 0.42) this.part(F, stone, u, h - 0.28, 0.17, 0.12, 0.08, 0.1);     // dentils
    this.part(F, trim, w / 2, h + 0.3, -0.12, w, 0.6, 0.24);
    this.part(F, stone, w / 2, h + 0.63, -0.12, w + 0.06, 0.07, 0.34);
    // upper floor windows
    const floorH = 2.5 + r() * 0.3;
    const cols = Math.max(1, Math.floor((w - 0.9) / (1.75 + r() * 0.3)));
    const span = (w - 0.9) / cols;
    const ww = Math.min(1.05, span - 0.5), wh = 1.45;
    let fl = 0;
    for (let yc = groundTop + 1.25; yc + wh / 2 < h - 0.5; yc += floorH, fl++) {
      for (let i = 0; i < cols; i++) {
        const u = 0.45 + span * (i + 0.5);
        if (skipWindows && skipWindows(F.x(u), yc)) continue;
        this.window(F, u, yc, ww, wh, frame, stone, r, fl === 0 && (seed + i) % 3 === 0);
      }
    }
    if (roof) this.rooftop(x0, x1, h, z, depth, r, dir);
  }

  window(F, u, y, w, h, frame, stone, r, flowerBox) {
    const v = Math.floor(r() * 8);
    const gl = new THREE.Mesh(this.glassGeo[v], this.glassMat);
    gl.scale.set(w, h, 1);
    gl.position.set(F.x(u), y, F.z(0.015));
    if (F.z(1) < F.z(0)) gl.rotation.y = Math.PI;
    this.g.add(gl);
    const t = 0.07;
    this.part(F, frame, u, y + h / 2, 0.05, w + t * 2, t, 0.1);
    this.part(F, frame, u, y - h / 2, 0.05, w + t * 2, t, 0.1);
    this.part(F, frame, u - w / 2, y, 0.05, t, h, 0.1);
    this.part(F, frame, u + w / 2, y, 0.05, t, h, 0.1);
    this.part(F, stone, u, y - h / 2 - 0.07, 0.1, w + 0.32, 0.07, 0.2);    // sill
    this.part(F, stone, u, y + h / 2 + 0.11, 0.05, w + 0.26, 0.16, 0.1);   // lintel
    this.part(F, stone, u, y + h / 2 + 0.11, 0.1, 0.16, 0.2, 0.04);        // keystone
    if (flowerBox) {
      this.part(F, this.wood, u, y - h / 2 - 0.03, 0.22, w * 0.9, 0.18, 0.2);
      const leaf = this.leafMat ||= new THREE.MeshStandardMaterial({ color: '#3f6b38', roughness: 0.85 });
      const bloom = this.bloomMat ||= new THREE.MeshStandardMaterial({ color: '#d8455a', roughness: 0.8 });
      for (let k = 0; k < 5; k++) {
        const m = new THREE.Mesh(this.blob ||= new THREE.IcosahedronGeometry(0.09, 0), k % 2 ? bloom : leaf);
        m.position.set(F.x(u - w * 0.36 + k * w * 0.18), y - h / 2 + 0.1 + r() * 0.04, F.z(0.22));
        this.g.add(m);
      }
    }
  }

  // AC units, chimneys, vents, a water tower now and then
  rooftop(x0, x1, h, z, depth, r, dir = 1) {
    const w = x1 - x0;
    const at = (u, n) => [x0 + u, z - dir * n];
    const add = (mat, x, y, zz, sx, sy, sz) => { const m = new THREE.Mesh(box, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, zz); this.g.add(m); return m; };
    // tar roof surface a hair above the box top so it reads darker
    add(this.tar, (x0 + x1) / 2, h + 0.01, z - dir * depth / 2, w - 0.1, 0.02, depth - 0.2);
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const [x, zz] = at(0.9 + r() * (w - 1.8), 1.6 + r() * (depth - 2.4));
      const k = r();
      if (k < 0.45) {                                            // AC unit with a fan grille
        add(this.metal, x, h + 0.42, zz, 1.1, 0.8, 0.85);
        add(this.metalDark, x, h + 0.83, zz, 0.7, 0.02, 0.6);
      } else if (k < 0.75) {                                     // brick chimney
        add(this.brickCh, x, h + 0.75, zz, 0.55, 1.5, 0.55);
        add(this.stone[1], x, h + 1.52, zz, 0.65, 0.08, 0.65);
      } else {                                                   // vent pipes
        const cyl = this.cyl ||= new THREE.CylinderGeometry(0.09, 0.09, 1, 10);
        for (let j = 0; j < 2; j++) { const m = new THREE.Mesh(cyl, this.metal); m.scale.set(1, 0.6 + j * 0.3, 1); m.position.set(x + j * 0.3, h + 0.3 + j * 0.15, zz); this.g.add(m); }
      }
    }
    if (w > 5.8 && h > 7 && r() < 0.6) this.waterTower(x0 + w * (0.3 + r() * 0.4), h, z - dir * depth * 0.55);
  }

  waterTower(x, h, z) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.8, 16), this.wood);
    tank.position.set(x, h + 2.4, z); this.g.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.7, 16), this.metalDark);
    cap.position.set(x, h + 3.65, z); this.g.add(cap);
    const hoop = this.hoop ||= new THREE.CylinderGeometry(0.98, 0.98, 0.05, 16, 1, true);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(hoop, this.metalDark); b.position.set(x, h + 1.8 + k * 0.6, z); this.g.add(b); }
    for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
      const l = new THREE.Mesh(box, this.metalDark); l.scale.set(0.08, 1.5, 0.08); l.position.set(x + dx, h + 0.75, z + dz); this.g.add(l);
    }
  }

  setDusk(k) { this.glassMat.emissiveIntensity = 0.12 + k * 1.1; }
}

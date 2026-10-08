// Pooled GPU-friendly particles (one Points draw per blend mode) + tyre mark ribbons
// + simple rigid debris for detached parts and broken rails.

import * as THREE from 'three';
import { softSprite } from './textures.js';

const vert = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
#include <fog_pars_vertex>
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const frag = `
uniform sampler2D uMap; varying float vAlpha; varying vec3 vColor;
#include <fog_pars_fragment>
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
  #include <fog_fragment>
}`;

class PointPool {
  constructor(n, additive) {
    this.n = n;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.size0 = new Float32Array(n); this.size1 = new Float32Array(n);
    this.a0 = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.col = new Float32Array(n * 3);
    this.sizeA = new Float32Array(n); this.alphaA = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaA, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: softSprite() }, uScale: { value: 600 }, ...THREE.UniformsLib.fog }, fog: !additive,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.cursor = 0;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, r, gg, b, grav = 0, drag = 0.5) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size0[i] = s0; this.size1[i] = s1; this.a0[i] = a0;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gg; this.col[i * 3 + 2] = b;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alphaA[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.max[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= dr; this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt; this.v[i * 3 + 2] *= dr;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.sizeA[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.alphaA[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alphaA.fill(0); }
}

export class Particles {
  constructor(scene, quality) {
    const n = quality === 'low' ? 900 : quality === 'high' ? 3000 : 2000;
    this.soft = new PointPool(n, false);
    this.glow = new PointPool(Math.round(n / 3), true);
    scene.add(this.soft.points, this.glow.points);
    this.q = quality === 'low' ? 0.5 : 1;
  }
  setScale(h) { this.soft.mat.uniforms.uScale.value = h * 0.9; this.glow.mat.uniforms.uScale.value = h * 0.9; }
  update(dt) { this.soft.update(dt); this.glow.update(dt); }
  clear() { this.soft.clear(); this.glow.clear(); }

  dust(x, y, z, vx, vz, amount, col) {
    if (Math.random() > amount * this.q) return;
    const r = Math.random;
    this.soft.emit(x + (r() - 0.5) * 0.4, y + 0.1, z + (r() - 0.5) * 0.4, vx * 0.2 + (r() - 0.5), 0.6 + r() * 0.8, vz * 0.2 + (r() - 0.5),
      1.4 + r() * 1.4, 0.6, 3.2 + r() * 2, 0.32, col.r, col.g, col.b, -0.15, 0.9);
  }
  smoke(x, y, z, vx, vy, vz, dark, size = 1) {
    const r = Math.random, c = dark ? 0.12 + r() * 0.06 : 0.62 + r() * 0.1;
    this.soft.emit(x, y, z, vx + (r() - 0.5) * 0.6, vy + 0.8 + r() * 0.6, vz + (r() - 0.5) * 0.6, 1.6 + r(), 0.4 * size, 2.6 * size, dark ? 0.55 : 0.32, c, c, c * 1.02, -0.5, 1.2);
  }
  tireSmoke(x, y, z, vx, vz) {
    const r = Math.random;
    this.soft.emit(x, y + 0.15, z, vx * 0.3 + (r() - 0.5), 0.5 + r() * 0.5, vz * 0.3 + (r() - 0.5), 1.8 + r(), 0.5, 4 + r() * 2, 0.28, 0.85, 0.85, 0.86, -0.1, 0.8);
  }
  splash(x, y, z, vx, vz, mud) {
    const r = Math.random;
    for (let k = 0; k < 3; k++) {
      const c = mud ? [0.25, 0.19, 0.12] : [0.75, 0.8, 0.85];
      this.soft.emit(x, y + 0.1, z, vx * 0.3 + (r() - 0.5) * 3, 1.5 + r() * 2.5, vz * 0.3 + (r() - 0.5) * 3, 0.6 + r() * 0.4, 0.2, 0.5, mud ? 0.9 : 0.5, c[0], c[1], c[2], 9.8, 0.5);
    }
  }
  snowSpray(x, y, z, vx, vz) {
    const r = Math.random;
    this.soft.emit(x, y + 0.1, z, vx * 0.25 + (r() - 0.5) * 1.5, 0.8 + r(), vz * 0.25 + (r() - 0.5) * 1.5, 1 + r(), 0.3, 1.8, 0.6, 0.93, 0.95, 0.98, 2, 1.2);
  }
  sparks(x, y, z, vx, vy, vz, n = 8) {
    const r = Math.random;
    for (let k = 0; k < n * this.q; k++) {
      this.glow.emit(x, y, z, vx * 0.5 + (r() - 0.5) * 6, vy + r() * 4, vz * 0.5 + (r() - 0.5) * 6, 0.25 + r() * 0.4, 0.12, 0.04, 1, 1, 0.6 + r() * 0.3, 0.2, 9.8, 0.4);
    }
  }
  debris(x, y, z, vx, vy, vz, n, col) {
    const r = Math.random;
    for (let k = 0; k < n; k++) this.soft.emit(x, y, z, vx * 0.4 + (r() - 0.5) * 5, vy + r() * 4, vz * 0.4 + (r() - 0.5) * 5, 0.8 + r() * 0.6, 0.15, 0.12, 1, col[0], col[1], col[2], 9.8, 0.2);
  }
  glass(x, y, z, vx, vy, vz) {
    const r = Math.random;
    for (let k = 0; k < 14 * this.q; k++) this.glow.emit(x, y, z, vx * 0.4 + (r() - 0.5) * 4, vy + r() * 3, vz * 0.4 + (r() - 0.5) * 4, 0.6 + r() * 0.5, 0.07, 0.05, 0.6, 0.7, 0.8, 0.9, 9.8, 0.3);
  }
  burst(x, y, z, col, n = 30) {
    const r = Math.random;
    for (let k = 0; k < n; k++) this.glow.emit(x, y + 0.4, z, (r() - 0.5) * 5, r() * 5, (r() - 0.5) * 5, 0.6 + r() * 0.5, 0.25, 0.05, 0.9, col[0], col[1], col[2], 6, 1);
  }
  mist(x, y, z) {
    const r = Math.random;
    this.soft.emit(x + (r() - 0.5) * 6, y, z + (r() - 0.5) * 6, (r() - 0.5) * 2, 1 + r(), (r() - 0.5) * 2, 3, 2, 8, 0.15, 0.9, 0.93, 0.96, -0.1, 0.5);
  }
}

// Tyre marks: ring buffer of quads with per-vertex alpha in the colour channel.
export class SkidMarks {
  constructor(scene, max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 3);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) { const b = i * 4; idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -4 });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.cursor = 0;
    this.last = [null, null, null, null];
  }
  // add a segment for wheel i at world point p with lateral dir (rx,rz), intensity a (0..1)
  add(i, x, y, z, rx, rz, w, a) {
    const L = this.last[i];
    if (L && a > 0.02) {
      const dx = x - L[0], dz = z - L[2];
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.09) return;
      if (d2 < 9) {
        const c = this.cursor; this.cursor = (this.cursor + 1) % this.max;
        const o = c * 12;
        const hw = w / 2;
        this.pos.set([L[0] - L[3] * hw, L[1], L[2] - L[4] * hw, L[0] + L[3] * hw, L[1], L[2] + L[4] * hw, x - rx * hw, y, z - rz * hw, x + rx * hw, y, z + rz * hw], o);
        const k0 = 1 - L[5] * 0.6, k1 = 1 - a * 0.6;
        this.col.set([k0, k0, k0, k0, k0, k0, k1, k1, k1, k1, k1, k1], o);
        this.mesh.geometry.attributes.position.needsUpdate = true;
        this.mesh.geometry.attributes.color.needsUpdate = true;
      }
    }
    this.last[i] = a > 0.02 ? [x, y, z, rx, rz, a] : null;
  }
  clear() { this.col.fill(1); this.pos.fill(0); this.last.fill(null); this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true; }
}

// Loose rigid pieces (bumpers, rail sections, barrels) with cheap physics.
export class Debris {
  constructor(scene, track) { this.scene = scene; this.track = track; this.items = []; }
  add(mesh, vel, spin) {
    this.scene.add(mesh);
    this.items.push({ mesh, v: vel.clone(), w: spin.clone(), life: 12 });
    if (this.items.length > 40) this.remove(this.items[0]);
  }
  remove(it) {
    this.scene.remove(it.mesh);
    if (it.mesh.geometry && !it.mesh.userData.sharedGeo) it.mesh.geometry.dispose();
    this.items.splice(this.items.indexOf(it), 1);
  }
  update(dt) {
    for (const it of [...this.items]) {
      it.life -= dt;
      if (it.life <= 0) { this.remove(it); continue; }
      it.v.y -= 9.8 * dt;
      it.mesh.position.addScaledVector(it.v, dt);
      it.mesh.rotation.x += it.w.x * dt; it.mesh.rotation.y += it.w.y * dt; it.mesh.rotation.z += it.w.z * dt;
      const h = this.track.height(it.mesh.position.x, it.mesh.position.z) + (it.mesh.userData.groundOff ?? 0.1);
      if (it.mesh.position.y < h) {
        it.mesh.position.y = h;
        if (it.v.y < 0) it.v.y *= -0.3;
        it.v.x *= 0.7; it.v.z *= 0.7; it.w.multiplyScalar(0.6);
      }
    }
  }
  clear() { while (this.items.length) this.remove(this.items[0]); }
}

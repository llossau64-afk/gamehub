// Falling hair clippings: one instanced mesh, pooled. Landed clippings stay on the
// floor (and on the cape) until swept, which makes a busy day visibly messy.
import * as THREE from 'three';
import { rand } from '../core/util.js';

const MAX = 1400;

export class Clippings {
  constructor(scene) {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0, 0);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    this.mesh = new THREE.InstancedMesh(g, m, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    const col = new Float32Array(MAX * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
    scene.add(this.mesh);
    this.p = [];
    this.next = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.capeSurface = null;   // fn(pos) -> y of cape surface or null
    this.landed = 0;
  }

  spawn(pos, normal, amount, color, lenNorm = 0.3) {
    const n = Math.min(10, Math.floor(amount) + (Math.random() < amount % 1 ? 1 : 0));
    this.color.set(color);
    for (let i = 0; i < n; i++) {
      const idx = this.next;
      this.next = (this.next + 1) % MAX;
      if (this.mesh.count < MAX) this.mesh.count = Math.max(this.mesh.count, idx + 1);
      const L = Math.max(0.004, lenNorm * 0.06 * rand(0.3, 0.9));
      const part = this.p[idx] || (this.p[idx] = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), len: 0, alive: false, rest: false });
      part.pos.copy(pos).addScaledVector(normal, 0.01).add(new THREE.Vector3(rand(-0.01, 0.01), rand(-0.01, 0.01), rand(-0.01, 0.01)));
      part.vel.copy(normal).multiplyScalar(rand(0.15, 0.5)).add(new THREE.Vector3(rand(-0.15, 0.15), rand(0, 0.25), rand(-0.15, 0.15)));
      part.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
      part.spin.set(rand(-12, 12), rand(-12, 12), rand(-12, 12));
      part.len = L;
      part.alive = true;
      part.rest = false;
      const k = rand(0.85, 1.1);
      this.mesh.instanceColor.setXYZ(idx, this.color.r * k, this.color.g * k, this.color.b * k);
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  update(dt) {
    if (!this.mesh.count) return;
    let changed = false;
    const d = this.dummy;
    for (let i = 0; i < this.mesh.count; i++) {
      const p = this.p[i];
      if (!p || !p.alive || p.rest) continue;
      changed = true;
      p.vel.y -= 3.2 * dt;                         // light: air drag keeps them floaty
      p.vel.multiplyScalar(1 - 2.2 * dt);
      p.vel.x += Math.sin(p.rot.x * 3 + p.pos.y * 20) * 0.4 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt; p.rot.y += p.spin.y * dt; p.rot.z += p.spin.z * dt;
      let floorY = 0.002;
      const cy = this.capeSurface ? this.capeSurface(p.pos) : null;
      if (cy !== null && p.pos.y < cy && p.pos.y > cy - 0.06 && Math.random() < 0.02) {
        // some clippings stick on the cape and slide later
        p.vel.multiplyScalar(0.2);
      }
      if (p.pos.y <= floorY) {
        p.pos.y = floorY;
        p.rest = true;
        p.rot.x = Math.PI / 2 + rand(-0.2, 0.2);
        p.rot.z = 0;
        this.landed++;
      }
      d.position.copy(p.pos);
      d.rotation.copy(p.rot);
      d.scale.set(0.0018, 0.0018, p.len);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }

  get floorCount() { return this.landed; }

  sweep() {
    for (let i = 0; i < this.mesh.count; i++) if (this.p[i]) this.p[i].alive = false;
    this.mesh.count = 0;
    this.next = 0;
    this.landed = 0;
  }
}

// fine water mist from the spray bottle
export class Mist {
  constructor(scene) {
    const N = 160;
    this.N = N;
    this.pos = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.011, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.6, color: '#dfeff5' }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
  }
  burst(from, to) {
    const d = to.clone().sub(from);
    const len = d.length();
    d.normalize();
    for (let n = 0; n < 40; n++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      this.pos[i * 3] = from.x; this.pos[i * 3 + 1] = from.y; this.pos[i * 3 + 2] = from.z;
      const sp = len * rand(2.2, 3.4);
      this.vel[i * 3] = d.x * sp + rand(-0.12, 0.12); this.vel[i * 3 + 1] = d.y * sp + rand(-0.12, 0.12); this.vel[i * 3 + 2] = d.z * sp + rand(-0.12, 0.12);
      this.life[i] = rand(0.25, 0.45);
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -10; continue; }
      any = true;
      this.life[i] -= dt;
      const k = 1 - 3 * dt;
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - 0.3 * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any || this._was) this.points.geometry.attributes.position.needsUpdate = true;
    this._was = any;
  }
}

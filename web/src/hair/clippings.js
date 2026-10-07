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
      d.scale.set(0.0011, 0.0011, p.len);
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

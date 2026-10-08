// First-person barber: camera, movement, head bob and the visible forearms/hands.
import * as THREE from 'three';
import { createBody } from '../chars/template.js';
import { PLAYER_LOOK } from '../chars/looks.js';
import { clamp, damp, dampVec, lerp, noise1 } from '../core/util.js';
import { audio } from '../audio/audio.js';

const HAND_POSES = {
  relaxed: { curl: [0.25, 0.3, 0.35, 0.42], thumb: 0.2 },
  open: { curl: [0.04, 0.04, 0.06, 0.08], thumb: -0.15 },
  grip: { curl: [1.05, 1.15, 1.2, 1.25], thumb: 0.75 },
  hold: { curl: [0.8, 0.9, 0.95, 1.0], thumb: 0.6 },
  pinch: { curl: [0.6, 0.75, 0.9, 1.0], thumb: 0.65 },
  cup: { curl: [0.2, 0.22, 0.25, 0.3], thumb: 0.0 },
  point: { curl: [0.0, 1.3, 1.35, 1.4], thumb: 0.8 },
  scissors: { curl: [0.45, 0.9, 1.1, 1.2], thumb: 0.5 },
};
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
const _m = new THREE.Matrix4();

class FPArm {
  constructor(side, parent) {
    this.side = side;
    const joints = ['ForeArm', 'Hand', ...FINGERS.flatMap((f) => [f + '1', f + '2', f + '3']), 'Thumb1', 'Thumb2', 'Thumb3'].map((n) => {
      if (n === 'ForeArm' || n === 'Hand') return n + side;
      if (n.startsWith('Thumb')) return 'Thumb' + side + n.slice(-1);
      return n.slice(0, -1) + side + n.slice(-1);
    });
    this.body = createBody(PLAYER_LOOK.colors, [], { joints });
    this.mesh = this.body.mesh;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 10;
    this.bones = this.body.bones;
    for (const b of Object.values(this.bones)) b.rotation.order = 'YXZ';
    this.fore = this.bones['ForeArm' + side];
    this.hand = this.bones['Hand' + side];
    this.foreRest = this.fore.position.clone();
    // the mesh is skinned around rest-pose world positions; we drive the root bone in camera space
    this.pivot = new THREE.Group();
    parent.add(this.pivot);
    this.pivot.add(this.mesh);
    this.mesh.position.set(0, 0, 0);
    const sx = side === 'R' ? 1 : -1;
    this.target = new THREE.Vector3(0.2 * sx, -0.32, -0.42);
    this.pos = this.target.clone();
    this.fingers = new THREE.Vector3(0, 0.1, -1).normalize();
    this.palm = new THREE.Vector3(-sx, 0, 0);
    this.curFingers = this.fingers.clone();
    this.curPalm = this.palm.clone();
    this.pose = 'relaxed';
    this.curl = [...HAND_POSES.relaxed.curl];
    this.thumb = HAND_POSES.relaxed.thumb;
    this.visible = false;
    this.show = 0;
    this.shoulder = new THREE.Vector3(0.26 * sx, -0.5, 0.15);
    this.lambda = 9;
    this.held = null;
  }

  set(o) {
    if (o.pos) this.target.copy(o.pos);
    if (o.fingers) this.fingers.copy(o.fingers).normalize();
    if (o.palm) this.palm.copy(o.palm).normalize();
    if (o.pose) this.pose = o.pose;
    if (o.visible !== undefined) this.visible = o.visible;
    if (o.speed) this.lambda = o.speed;
  }

  hold(obj, offset = {}) {
    if (this.held && this.held !== obj) this.hand.remove(this.held);
    this.held = obj;
    this.hand.add(obj);
    obj.position.set(...(offset.pos || [0, -0.075, 0]));
    obj.rotation.set(...(offset.rot || [0, 0, 0]));
    obj.scale.setScalar(offset.scale || 1);
    obj.traverse((o) => { if (o.isMesh) { o.renderOrder = 11; o.castShadow = false; } });
  }

  drop() { const h = this.held; if (h) this.hand.remove(h); this.held = null; return h; }

  update(dt, bob) {
    this.show = damp(this.show, this.visible ? 1 : 0, 8, dt);
    this.mesh.visible = this.show > 0.02;
    if (!this.mesh.visible) return;
    dampVec(this.pos, this.target, this.lambda, dt);
    dampVec(this.curFingers, this.fingers, this.lambda, dt);
    dampVec(this.curPalm, this.palm, this.lambda, dt);
    // hidden arms drop out of view
    const W = this.pos.clone();
    W.y -= (1 - this.show) * 0.35;
    W.add(bob);
    const F = this.curFingers.clone().normalize();
    const wrist = W.clone().addScaledVector(F, -0.06);
    const dir = wrist.clone().sub(this.shoulder).normalize();
    const elbow = wrist.clone().addScaledVector(dir, -0.25);
    // forearm basis: -Y along dir, roll from the palm direction
    const y = dir.clone().negate();
    const sx = this.side === 'R' ? 1 : -1;
    let x = this.side === 'L' ? this.curPalm.clone().negate() : this.curPalm.clone();
    x.addScaledVector(y, -x.dot(y));
    if (x.lengthSq() < 1e-5) x.set(1, 0, 0);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const qf = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
    // place the pivot so that the forearm bone (at its rest world position) sits at the elbow
    this.fore.position.copy(this.foreRest);
    this.pivot.quaternion.copy(qf);
    const restWorld = this.foreRest.clone().applyQuaternion(qf);
    this.pivot.position.copy(elbow).sub(restWorld);
    // hand orientation relative to forearm
    const hy = F.clone().negate();
    let hx = this.side === 'L' ? this.curPalm.clone().negate() : this.curPalm.clone();
    hx.addScaledVector(hy, -hx.dot(hy)).normalize();
    const hz = new THREE.Vector3().crossVectors(hx, hy);
    const qh = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(hx, hy, hz));
    this.hand.quaternion.copy(qf.clone().invert().multiply(qh));
    this.fore.quaternion.identity();
    // fingers
    const tp = HAND_POSES[this.pose] || HAND_POSES.relaxed;
    for (let i = 0; i < 4; i++) this.curl[i] = damp(this.curl[i], tp.curl[i], 16, dt);
    this.thumb = damp(this.thumb, tp.thumb, 16, dt);
    const sign = this.side === 'L' ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      const f = FINGERS[i];
      this.bones[f + this.side + '1'].rotation.set((i - 1.5) * 0.05 * (1 - Math.min(1, this.curl[i])), 0, sign * this.curl[i] * 0.8);
      this.bones[f + this.side + '2'].rotation.set(0, 0, sign * this.curl[i] * 0.8);
      this.bones[f + this.side + '3'].rotation.set(0, 0, sign * this.curl[i] * 0.52);
    }
    this.bones['Thumb' + this.side + '1'].rotation.set(-this.thumb * 0.3, 0, sign * this.thumb * 0.45);
    this.bones['Thumb' + this.side + '2'].rotation.set(0, 0, sign * this.thumb * 0.5);
    this.bones['Thumb' + this.side + '3'].rotation.set(0, 0, sign * this.thumb * 0.4);
  }

  handWorld(out = new THREE.Vector3()) { return this.hand.localToWorld(out.set(0, -0.06, 0)); }
}

export class Player {
  constructor(scene, camera, shop) {
    this.scene = scene;
    this.camera = camera;
    this.shop = shop;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.62;
    this.control = false;
    this.vel = new THREE.Vector3();
    this.bobT = 0;
    this.bobAmt = 0;
    this.stepAcc = 0;
    this.armsRoot = new THREE.Group();
    camera.add(this.armsRoot);
    scene.add(camera);
    this.arms = { R: new FPArm('R', this.armsRoot), L: new FPArm('L', this.armsRoot) };
    this.bobVec = new THREE.Vector3();
    this.lookOverride = null;   // cutscene camera control
    this.sensitivity = 1;
    this.invertY = false;
    this.shake = 0;
    this.kick = 0;      // a quick downward dip when you put the boot in
  }

  place(pos, yaw = 0, pitch = 0) {
    this.pos.set(pos.x, 0, pos.z);
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this.applyCamera(0);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  update(dt, input) {
    if (this.control) {
      const s = 0.0022 * this.sensitivity;
      this.yaw -= input.look.x * s;
      this.pitch -= input.look.y * s * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.35, 1.25);
      const sp = input.held('sprint') ? 3.0 : 2.05;
      const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const want = f.multiplyScalar(input.move.y).addScaledVector(r, input.move.x).multiplyScalar(sp);
      dampVec(this.vel, want, 10, dt);
    } else {
      dampVec(this.vel, new THREE.Vector3(), 10, dt);
    }
    this.pos.addScaledVector(this.vel, dt);
    // keep a polite distance from people
    for (const o of this.obstacles || []) {
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz), r = 0.6;
      if (d < r && d > 1e-4) { this.pos.x = o.x + dx / d * r; this.pos.z = o.z + dz / d * r; }
    }
    this.shop.collide(this.pos, 0.28);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmt = damp(this.bobAmt, clamp(speed / 2, 0, 1), 8, dt);
    this.bobT += dt * (5 + speed * 2.2);
    this.stepAcc += speed * dt;
    if (this.stepAcc > 0.72) { this.stepAcc = 0; audio.footstep(this.pos.z > 2.95 ? 'stone' : this.shop.has('floorWood') ? 'wood' : 'tile', 0.7); }
    this.applyCamera(dt);
    const b = this.bobAmt;
    this.bobVec.set(Math.cos(this.bobT * 0.5) * 0.008 * b, -Math.abs(Math.sin(this.bobT * 0.5)) * 0.01 * b, 0);
    this.arms.R.update(dt, this.bobVec);
    this.arms.L.update(dt, this.bobVec);
  }

  applyCamera(dt) {
    if (this.lookOverride) return;
    const b = this.bobAmt;
    const bobY = Math.sin(this.bobT) * 0.022 * b;
    const bobX = Math.cos(this.bobT * 0.5) * 0.015 * b;
    this.shake = Math.max(0, this.shake - dt * 2);
    this.kick = Math.max(0, this.kick - dt);
    const kd = Math.sin(Math.min(1, this.kick / 0.35) * Math.PI) * 0.12;
    const sh = this.shake * this.shake;
    this.camera.position.set(this.pos.x + Math.cos(this.yaw) * bobX, this.eye + bobY + noise1(performance.now() * 0.03) * sh * 0.02, this.pos.z - Math.sin(this.yaw) * bobX);
    this.camera.rotation.set(this.pitch - kd + noise1(performance.now() * 0.02 + 5) * sh * 0.02, this.yaw, Math.sin(this.bobT * 0.5) * 0.004 * b, 'YXZ');
  }

  // camera points at a world position (used for focus moments)
  lookTowards(target, dt, lambda = 4) {
    const d = target.clone().sub(this.camera.position);
    const yaw = Math.atan2(-d.x, -d.z);
    const pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    let dy = ((yaw - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.yaw += dy * (1 - Math.exp(-lambda * dt));
    this.pitch = damp(this.pitch, pitch, lambda, dt);
  }

  hideArms() { this.arms.R.visible = false; this.arms.L.visible = false; }
}

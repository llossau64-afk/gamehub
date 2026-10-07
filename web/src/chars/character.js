// Procedurally animated character: locomotion, sitting, look-at, emotions, lip-sync,
// two-bone arm IK and finger poses. No baked clips: everything blends continuously.
import * as THREE from 'three';
import { createBody, getTemplate } from './template.js';
import { clamp, lerp, damp, dampAngle, noise1, rand, smooth, easeInOut, wrapAngle } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { blobShadowTexture } from '../render/textures.js';

// ------------------------------------------------------------------ emotions
// brow: raise (-1..1), inner (sad/worried raise), angry (inner down), asym
// lids: openness (1 normal), mouth morphs, posture
export const EMOTIONS = {
  neutral:      { raise: 0, inner: 0, angry: 0, asym: 0, lids: 1.0, smile: 0.08, frown: 0, open: 0, wide: 0, O: 0, smirk: 0, lean: 0, shoulders: 0, tilt: 0, pitch: 0, chest: 0 },
  happy:        { raise: 0.25, inner: 0, angry: 0, asym: 0, lids: 0.82, smile: 0.85, frown: 0, open: 0.05, wide: 0.15, O: 0, smirk: 0, lean: -0.02, shoulders: 0, tilt: 0.06, pitch: -0.04, chest: 0.1 },
  excited:      { raise: 0.7, inner: 0, angry: 0, asym: 0, lids: 1.15, smile: 1, frown: 0, open: 0.35, wide: 0.5, O: 0, smirk: 0, lean: -0.04, shoulders: 0.25, tilt: 0, pitch: -0.08, chest: 0.2 },
  ecstatic:     { raise: 0.85, inner: 0.1, angry: 0, asym: 0, lids: 0.55, smile: 1, frown: 0, open: 0.45, wide: 0.9, O: 0, smirk: 0, lean: -0.05, shoulders: 0.3, tilt: 0.08, pitch: -0.1, chest: 0.25 },
  nervous:      { raise: 0.2, inner: 0.8, angry: 0, asym: 0, lids: 1.12, smile: 0.1, frown: 0.25, open: 0, wide: 0.35, O: 0, smirk: 0, lean: 0.06, shoulders: 0.55, tilt: 0, pitch: 0.08, chest: -0.1 },
  confused:     { raise: 0.2, inner: 0.2, angry: 0, asym: 0.8, lids: 0.95, smile: 0, frown: 0.15, open: 0.05, wide: 0, O: 0.25, smirk: 0.3, lean: 0, shoulders: 0.1, tilt: 0.16, pitch: 0, chest: 0 },
  annoyed:      { raise: -0.3, inner: 0, angry: 0.75, asym: 0, lids: 0.68, smile: 0, frown: 0.75, open: 0, wide: 0.1, O: 0, smirk: 0, lean: 0, shoulders: 0.05, tilt: 0, pitch: 0.06, chest: 0.05 },
  surprised:    { raise: 1, inner: 0.1, angry: 0, asym: 0, lids: 1.35, smile: 0, frown: 0, open: 0.75, wide: 0, O: 0.45, smirk: 0, lean: -0.05, shoulders: 0.35, tilt: 0, pitch: -0.1, chest: 0.05 },
  disappointed: { raise: -0.15, inner: 0.55, angry: 0, asym: 0, lids: 0.7, smile: 0, frown: 0.65, open: 0, wide: 0, O: 0, smirk: 0, lean: 0.08, shoulders: -0.2, tilt: 0.05, pitch: 0.16, chest: -0.15 },
  proud:        { raise: 0.15, inner: 0, angry: 0, asym: 0, lids: 0.82, smile: 0.55, frown: 0, open: 0, wide: 0, O: 0, smirk: 0.5, lean: -0.06, shoulders: 0, tilt: -0.04, pitch: -0.12, chest: 0.3 },
  awkward:      { raise: 0.15, inner: 0.45, angry: 0, asym: 0.2, lids: 0.95, smile: 0.5, frown: 0.25, open: 0, wide: 0.3, O: 0, smirk: 0.2, lean: 0.02, shoulders: 0.25, tilt: 0.1, pitch: 0.02, chest: 0 },
  nostalgic:    { raise: 0, inner: 0.6, angry: 0, asym: 0, lids: 0.72, smile: 0.35, frown: 0, open: 0, wide: 0, O: 0, smirk: 0, lean: 0.03, shoulders: -0.1, tilt: 0.08, pitch: 0.12, chest: 0 },
  greedy:       { raise: 0.45, inner: 0, angry: 0.2, asym: 0.3, lids: 0.8, smile: 0.9, frown: 0, open: 0.1, wide: 0.6, O: 0, smirk: 0.4, lean: 0.04, shoulders: 0.2, tilt: 0.05, pitch: 0.06, chest: 0 },
  concerned:    { raise: 0.1, inner: 0.6, angry: 0, asym: 0.25, lids: 1.0, smile: 0, frown: 0.35, open: 0, wide: 0.1, O: 0, smirk: 0, lean: 0.02, shoulders: 0.2, tilt: 0.06, pitch: 0.04, chest: 0 },
  wince:        { raise: -0.1, inner: 0.7, angry: 0.3, asym: 0.2, lids: 0.45, smile: 0, frown: 0.3, open: 0.1, wide: 0.8, O: 0, smirk: 0, lean: 0.04, shoulders: 0.45, tilt: 0.05, pitch: 0.06, chest: 0 },
};
const FACE_KEYS = Object.keys(EMOTIONS.neutral);

const HAND_POSES = {
  relaxed: { curl: [0.25, 0.3, 0.35, 0.42], thumb: 0.2 },
  open: { curl: [0.02, 0.02, 0.04, 0.06], thumb: -0.1 },
  fist: { curl: [1.3, 1.35, 1.4, 1.4], thumb: 0.9 },
  grip: { curl: [1.0, 1.1, 1.15, 1.2], thumb: 0.7 },
  hold: { curl: [0.75, 0.85, 0.9, 0.95], thumb: 0.55 },
  point: { curl: [0.0, 1.3, 1.35, 1.4], thumb: 0.8 },
  pinch: { curl: [0.55, 0.7, 0.85, 0.95], thumb: 0.6 },
  cup: { curl: [0.3, 0.32, 0.35, 0.4], thumb: 0.05 },
  count: { curl: [0.5, 0.75, 0.9, 1.0], thumb: 0.15 },
};
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

const _v = [...Array(14)].map(() => new THREE.Vector3());
const _q = [...Array(6)].map(() => new THREE.Quaternion());
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

let blobTex = null;

export class Character {
  constructor(scene, look) {
    this.scene = scene;
    this.look = look;
    this.root = new THREE.Group();
    this.root.name = look.name || 'character';
    const body = createBody(look.colors, look.accessories || []);
    this.body = body;
    this.bones = body.bones;
    this.mouth = body.mouth;
    this.mesh = body.mesh;
    this.root.add(body.mesh);
    const sc = look.scale || 1;
    this.mesh.scale.set(sc * (look.width || 1), sc, sc * (look.width || 1));
    scene.add(this.root);
    for (const b of Object.values(this.bones)) b.rotation.order = 'YXZ';
    // rig measurements
    const T = getTemplate();
    const jpos = (n) => T.joints[T.jointIndex.get(n)].pos.length();
    this.L1 = jpos('ForeArmL') * sc;
    this.L2 = jpos('HandL') * sc;
    this.hipsY = T.joints[T.jointIndex.get('Hips')].world.y * sc;
    // blob shadow
    blobTex ||= blobShadowTexture();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.75 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 2;
    scene.add(this.shadow);

    // state
    this.yaw = 0;
    this.speed = 0;
    this.targetSpeed = 0;
    this.phase = 0;
    this.gait = 'walk';
    this.path = [];
    this.onArrive = null;
    this.sitW = 0;
    this.sitTarget = 0;
    this.seat = null;
    this.face = { ...EMOTIONS.neutral };
    this.emotion = 'neutral';
    this.emotionTarget = { ...EMOTIONS.neutral };
    this.emotionHold = 0;
    this.lookTarget = null;
    this.lookW = 0;
    this.headYaw = 0; this.headPitch = 0; this.eyeYaw = 0; this.eyePitch = 0;
    this.saccade = { x: 0, y: 0, t: 0 };
    this.blinkT = rand(1, 3); this.blink = 0;
    this.talk = null;
    this.mouthOpen = 0;
    this.ik = { L: this._ikState(), R: this._ikState() };
    this.hand = { L: { ...HAND_POSES.relaxed, curl: [...HAND_POSES.relaxed.curl] }, R: { ...HAND_POSES.relaxed, curl: [...HAND_POSES.relaxed.curl] } };
    this.handTarget = { L: 'relaxed', R: 'relaxed' };
    this.held = { L: null, R: null };
    this.gestures = [];
    this.extra = {};          // additive bone offsets from scripts: name -> [x,y,z]
    this.posture = { hunch: look.hunch || 0, armsOut: 0 };
    this.t = rand(0, 100);
    this.idleSeed = rand(0, 100);
    this.voice = look.voice || { pitch: 150, rate: 1, wobble: 0.08, vol: 0.09 };
    this.footsteps = true;
    this.onFootstep = null;
    this.headTurnSpeed = 6;
    this.visible = true;
    this.bounce = 0;
  }

  _ikState() {
    return { w: 0, wt: 0, target: new THREE.Vector3(), targetFn: null, fingers: null, palm: null, space: 'world', speed: 5, pole: null };
  }

  get position() { return this.root.position; }

  setVisible(v) { this.visible = v; this.root.visible = v; this.shadow.visible = v; }

  dispose() {
    this.scene.remove(this.root);
    this.scene.remove(this.shadow);
    this.body.material.dispose();
    this.body.palette.dispose();
    if (this.hair) this.hair.dispose();
  }

  // ------------------------------------------------------------------ high level API
  place(pos, yaw = 0) {
    this.root.position.set(pos.x, 0, pos.z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
    this.path = [];
    this.speed = 0;
  }

  walkTo(points, gait = 'walk') {
    const pts = (Array.isArray(points) ? points : [points]).map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.path = pts;
    this.gait = gait;
    return new Promise((res) => { this.onArrive = res; });
  }

  stop() { this.path = []; if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); } }

  faceTo(target, instant = false) {
    const dx = target.x - this.root.position.x, dz = target.z - this.root.position.z;
    this.faceYaw = Math.atan2(dx, dz);
    if (instant) { this.yaw = this.faceYaw; this.root.rotation.y = this.yaw; }
    return new Promise((res) => { this._faceRes = res; });
  }

  setEmotion(name, hold = 0) {
    const e = EMOTIONS[name] || EMOTIONS.neutral;
    this.emotion = name;
    this.emotionTarget = { ...e };
    this.emotionHold = hold;
  }

  lookAt(target, w = 1) {
    this.lookTarget = target;
    this.lookWTarget = target ? w : 0;
  }

  setHand(side, pose) { this.handTarget[side] = pose; }

  // IK: reach a world point (Vector3, Object3D or function returning Vector3).
  // opts.fingers / opts.palm: world directions; opts.speed: blend rate
  reach(side, target, opts = {}) {
    const k = this.ik[side];
    k.targetFn = typeof target === 'function' ? target : null;
    k.obj = target && target.isObject3D ? target : null;
    if (target && target.isVector3) k.target.copy(target);
    k.wt = opts.weight ?? 1;
    k.speed = opts.speed ?? 5;
    k.fingers = opts.fingers || null;
    k.palm = opts.palm || null;
    k.local = !!opts.local;          // target and dirs in character local space
    k.pole = opts.pole || null;
    k.offset = opts.offset || null;
    if (opts.hand) this.setHand(side, opts.hand);
  }

  release(side, speed = 4) { const k = this.ik[side]; k.wt = 0; k.speed = speed; }

  hold(side, obj, offset = {}) {
    const hand = this.bones['Hand' + side];
    hand.updateMatrixWorld(true);
    this.held[side] = obj;
    hand.add(obj);
    obj.position.set(...(offset.pos || [side === 'L' ? -0.012 : 0.012, -0.075, 0.0]));
    if (offset.rot) obj.rotation.set(...offset.rot); else obj.rotation.set(0, 0, 0);
    if (offset.scale) obj.scale.setScalar(offset.scale);
  }

  drop(side, parent) {
    const obj = this.held[side];
    if (!obj) return null;
    this.held[side] = null;
    obj.updateMatrixWorld(true);
    parent.attach(obj);
    return obj;
  }

  say(text, opts = {}) {
    const speech = audio.speak(text, { ...this.voice, ...(opts.voice || {}) });
    const start = performance.now() / 1000;
    this.talk = { syll: speech.syll, start, dur: speech.dur, i: 0, flap: 0 };
    const dur = Math.max(speech.dur, text.length * 0.045);
    return dur;
  }

  // gestures are small procedural clips: fn(t01, ch, dt) sets IK targets / extra pose
  gesture(name, opts = {}) {
    const g = typeof name === 'string' ? GESTURES[name] : name;
    if (!g) return Promise.resolve();
    if (typeof name !== 'string') name = g.channel || 'custom';
    const inst = { name, t: 0, dur: (opts.dur ?? g.dur), opts, g, done: null };
    this.gestures = this.gestures.filter((x) => x.g.channel !== g.channel || !g.channel);
    this.gestures.push(inst);
    if (g.start) g.start(this, inst);
    return new Promise((res) => { inst.done = res; });
  }

  endGesture(name) {
    for (const g of this.gestures) if (g.name === name || g.g.channel === name) { g.t = g.dur; g.ending = true; }
    // loops end on the next update
    for (let i = this.gestures.length - 1; i >= 0; i--) {
      const g = this.gestures[i];
      if (g.ending && g.g.loop) { this.gestures.splice(i, 1); if (g.g.end) g.g.end(this, g); if (g.done) g.done(); }
    }
  }

  sitOn(seat, instant = false) {
    // seat: { pos, rot, height }
    this.seat = seat;
    if (instant) {
      this.place(seat.pos, seat.rot);
      this.sitW = this.sitTarget = 1;
      return Promise.resolve();
    }
    return new Promise((res) => {
      this.sitTarget = 1;
      this._sitStart = this.root.position.clone();
      this._sitRes = res;
      this.faceYaw = seat.rot;
    });
  }

  standUp() {
    return new Promise((res) => {
      this.sitTarget = 0;
      this._standRes = res;
    });
  }

  // ------------------------------------------------------------------ update
  update(dt, camera) {
    if (!this.visible) return;
    this.t += dt;
    const P = this._pose = {};
    const add = (n, x = 0, y = 0, z = 0) => { const p = P[n] || (P[n] = [0, 0, 0]); p[0] += x; p[1] += y; p[2] += z; };
    this._add = add;

    this.updateLocomotion(dt);
    this.updateFace(dt);

    const t = this.t;
    const F = this.face;
    const spd = this.speed;
    const walkW = clamp(spd / 1.2, 0, 1) * (1 - this.sitW);
    const runW = clamp((spd - 2.2) / 1.2, 0, 1);
    const fast = this.gait === 'speedwalk';

    // --- idle (always, faded under walking)
    const idleW = 1 - walkW;
    const br = Math.sin(t * 1.7 + this.idleSeed) * 0.5 + 0.5;
    add('Chest', -0.015 * br * idleW, 0, 0);
    add('Spine', 0.01 * br * idleW, 0, 0);
    add('Shoulder' + 'L', 0, 0, 0.02 * br * idleW);
    add('Shoulder' + 'R', 0, 0, -0.02 * br * idleW);
    const sway = noise1(t * 0.35 + this.idleSeed) * idleW * (1 - this.sitW);
    add('Hips', 0, sway * 0.05, sway * 0.025);
    add('Spine', 0, -sway * 0.03, -sway * 0.02);
    add('Neck', noise1(t * 0.5 + 7) * 0.03, noise1(t * 0.4 + 3) * 0.05, 0);
    // arms hang naturally
    add('UpperArmL', 0.03, 0, 0.07 + this.posture.armsOut);
    add('UpperArmR', 0.03, 0, -0.07 - this.posture.armsOut);
    add('ForeArmL', -0.18 - br * 0.03, 0.15, 0);
    add('ForeArmR', -0.18 - br * 0.03, -0.15, 0);
    add('HandL', 0.05, 0, 0.05);
    add('HandR', 0.05, 0, -0.05);

    // --- walk / run / speedwalk cycle
    if (walkW > 0.001) {
      const ph = this.phase;
      const s = Math.sin(ph), c = Math.cos(ph);
      const A = lerp(fast ? 0.42 : 0.38, 0.75, runW) * walkW;
      add('ThighL', -s * A, 0, 0); add('ThighR', s * A, 0, 0);
      const kneeA = lerp(0.6, 1.25, runW) * walkW;
      add('ShinL', Math.max(0, Math.sin(ph + 1.2)) * kneeA + 0.06 * walkW, 0, 0);
      add('ShinR', Math.max(0, Math.sin(ph + Math.PI + 1.2)) * kneeA + 0.06 * walkW, 0, 0);
      add('FootL', (c * 0.15 - 0.05) * walkW, 0, 0); add('FootR', (-c * 0.15 - 0.05) * walkW, 0, 0);
      const armA = lerp(fast ? 0.55 : 0.32, 0.9, runW) * walkW;
      add('UpperArmL', s * armA, 0, 0.04 * walkW); add('UpperArmR', -s * armA, 0, -0.04 * walkW);
      const elbow = lerp(fast ? 1.1 : 0.25, 1.45, runW) * walkW;
      add('ForeArmL', -elbow - Math.max(0, s) * 0.2 * walkW, 0, 0);
      add('ForeArmR', -elbow - Math.max(0, -s) * 0.2 * walkW, 0, 0);
      add('Hips', 0, -s * 0.1 * walkW, c * 0.035 * walkW);
      add('Spine', lerp(0.02, 0.22, runW) * walkW + (fast ? 0.08 : 0) * walkW, s * 0.12 * walkW, 0);
      add('Chest', 0, s * 0.08 * walkW, 0);
      add('Head', -lerp(0.0, 0.18, runW) * walkW, -s * 0.08 * walkW, 0);
    }

    // --- sitting
    if (this.sitW > 0.001) {
      const w = smooth(this.sitW);
      add('ThighL', -1.5 * w, 0, -0.06 * w); add('ThighR', -1.5 * w, 0, 0.06 * w);
      add('ShinL', 1.45 * w, 0, 0); add('ShinR', 1.45 * w, 0, 0);
      add('Spine', -0.06 * w, 0, 0);
      add('UpperArmL', -0.35 * w, 0, 0.04 * w); add('UpperArmR', -0.35 * w, 0, -0.04 * w);
      add('ForeArmL', -0.75 * w, 0, 0); add('ForeArmR', -0.75 * w, 0, 0);
    }

    // --- posture from emotion + character traits
    const hunch = this.posture.hunch;
    add('Spine', F.lean + hunch * 0.12 - F.chest * 0.05, 0, 0);
    add('Chest', F.lean * 0.5 + hunch * 0.15 - F.chest * 0.08, 0, 0);
    add('Neck', -hunch * 0.12 + F.pitch * 0.4, 0, F.tilt * 0.4);
    add('Head', -hunch * 0.06 + F.pitch * 0.6, 0, F.tilt * 0.6);
    add('ShoulderL', 0, 0, F.shoulders * 0.12); add('ShoulderR', 0, 0, -F.shoulders * 0.12);

    // --- scripted extras + gestures
    for (const [n, v] of Object.entries(this.extra)) add(n, v[0], v[1], v[2]);
    for (let i = this.gestures.length - 1; i >= 0; i--) {
      const g = this.gestures[i];
      g.t += dt;
      const u = clamp(g.t / g.dur, 0, 1);
      g.g.update(this, u, g, dt);
      if (u >= 1 && !g.g.loop) {
        this.gestures.splice(i, 1);
        if (g.g.end) g.g.end(this, g);
        if (g.done) g.done();
      } else if (g.g.loop && u >= 1) g.t = 0;
    }

    // --- look-at (neck + head + eyes)
    this.updateLook(dt, add);

    // talking: nods on syllables
    if (this.talk) add('Head', this.mouthOpen * 0.05, 0, 0);

    // bounce (hops, laughter): applied to root height
    // write pose to bones
    for (const [name, b] of Object.entries(this.bones)) {
      const p = P[name];
      if (p) b.rotation.set(p[0], p[1], p[2]); else b.rotation.set(0, 0, 0);
    }
    this.applyFingers(dt);
    this.applyFaceBones();

    // root height (sitting, bob)
    const sitY = this.seat ? this.seat.height + 0.075 - this.hipsY : 0;
    const bob = walkW * (Math.abs(Math.cos(this.phase)) * lerp(0.025, 0.06, runW) - 0.015);
    this.root.position.y = lerp(0, sitY, smooth(this.sitW)) + bob + this.bounce;

    // IK pass
    this.root.updateMatrixWorld(true);
    this.solveArm('L', dt);
    this.solveArm('R', dt);

    // shadow
    this.shadow.position.set(this.root.position.x, 0.006, this.root.position.z);
    const sh = 1 - clamp(this.root.position.y, 0, 0.6);
    this.shadow.material.opacity = 0.7 * sh;
    if (this.hair) this.hair.update(dt);
  }

  updateLocomotion(dt) {
    const pos = this.root.position;
    let want = 0;
    if (this.path.length && this.sitW < 0.01) {
      const tgt = this.path[0];
      const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
      const d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      const gs = { walk: 1.2, speedwalk: 2.1, run: 3.6, stroll: 0.85 }[this.gait] || 1.2;
      want = last ? Math.min(gs, d * 2.2 + 0.25) : gs;
      if (d < (last ? 0.05 : 0.3)) {
        this.path.shift();
        if (!this.path.length) {
          want = 0;
          if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); }
        }
      } else {
        const targetYaw = Math.atan2(dx, dz);
        this.yaw = dampAngle(this.yaw, targetYaw, this.gait === 'run' ? 9 : 7, dt);
        const step = Math.min(d, this.speed * dt);
        const fwdErr = Math.cos(wrapAngle(targetYaw - this.yaw));
        pos.x += Math.sin(this.yaw) * step * Math.max(0.2, fwdErr);
        pos.z += Math.cos(this.yaw) * step * Math.max(0.2, fwdErr);
      }
    }
    this.speed = damp(this.speed, want, this.gait === 'run' ? 4 : 6, dt);
    if (this.speed < 0.01) this.speed = 0;
    // gait phase
    const stride = { walk: 0.62, speedwalk: 0.42, run: 0.95, stroll: 0.55 }[this.gait] || 0.62;
    const prev = this.phase;
    this.phase += dt * this.speed / stride * Math.PI;
    if (this.speed > 0.2 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) {
      if (this.onFootstep) this.onFootstep(this);
    }
    // explicit facing (when not walking)
    if (this.faceYaw !== undefined && this.faceYaw !== null && !this.path.length) {
      this.yaw = dampAngle(this.yaw, this.faceYaw, 6, dt);
      if (Math.abs(wrapAngle(this.yaw - this.faceYaw)) < 0.04) {
        this.faceYaw = null;
        if (this._faceRes) { const f = this._faceRes; this._faceRes = null; f(); }
      }
    }
    this.root.rotation.y = this.yaw;
    // sitting transitions
    if (this.sitTarget !== this.sitW) {
      const rate = 1.5;
      this.sitW = this.sitTarget > this.sitW ? Math.min(1, this.sitW + dt * rate) : Math.max(0, this.sitW - dt * rate);
      if (this.seat) {
        if (this.sitTarget === 1 && this._sitStart) {
          const k = easeInOut(this.sitW);
          pos.x = lerp(this._sitStart.x, this.seat.pos.x, k);
          pos.z = lerp(this._sitStart.z, this.seat.pos.z, k);
        } else if (this.sitTarget === 0) {
          // slide forward off the seat while standing up
          const fwd = new THREE.Vector3(Math.sin(this.seat.rot), 0, Math.cos(this.seat.rot));
          const k = easeInOut(1 - this.sitW);
          pos.x = this.seat.pos.x + fwd.x * 0.42 * k;
          pos.z = this.seat.pos.z + fwd.z * 0.42 * k;
        }
      }
      if (this.sitW === 1 && this._sitRes) { const f = this._sitRes; this._sitRes = null; f(); }
      if (this.sitW === 0 && this.sitTarget === 0) {
        this.seat = null;
        if (this._standRes) { const f = this._standRes; this._standRes = null; f(); }
      }
    }
  }

  updateFace(dt) {
    if (this.emotionHold > 0) {
      this.emotionHold -= dt;
      if (this.emotionHold <= 0) this.setEmotion('neutral');
    }
    const tgt = this.emotionTarget;
    for (const k of FACE_KEYS) this.face[k] = damp(this.face[k], tgt[k], 7, dt);
    // blinking
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 1; this.blinkT = rand(1.8, 5) * (this.emotion === 'nervous' ? 0.4 : 1); }
    this.blink = Math.max(0, this.blink - dt * 7.5);
    // saccades
    this.saccade.t -= dt;
    if (this.saccade.t < 0) {
      const amp = this.emotion === 'nervous' ? 0.25 : 0.1;
      this.saccade.x = rand(-amp, amp); this.saccade.y = rand(-amp, amp) * 0.6;
      this.saccade.t = rand(0.4, 2.2) * (this.emotion === 'nervous' ? 0.35 : 1);
    }
    // talking mouth flap
    let open = 0;
    if (this.talk) {
      const now = performance.now() / 1000 - this.talk.start;
      const s = this.talk.syll;
      let near = 0;
      for (let i = 0; i < s.length; i++) {
        const d = now - s[i];
        if (d >= 0 && d < 0.12) near = Math.max(near, Math.sin(d / 0.12 * Math.PI));
      }
      open = near;
      if (now > this.talk.dur + 0.1) this.talk = null;
    }
    this.mouthOpen = damp(this.mouthOpen, open, 25, dt);
  }

  updateLook(dt, add) {
    this.lookW = damp(this.lookW, this.lookWTarget || 0, 5, dt);
    let yaw = 0, pitch = 0;
    if (this.lookTarget && this.lookW > 0.01) {
      const tp = this.lookTarget.isObject3D ? this.lookTarget.getWorldPosition(_v[0]) : (typeof this.lookTarget === 'function' ? this.lookTarget() : this.lookTarget);
      const head = this.bones.Head;
      // eye height in world (approx)
      const eye = _v[1].set(0, 1.68 * (this.look.scale || 1), 0);
      this.root.localToWorld(eye);
      eye.y = this.root.position.y + 1.66 * (this.look.scale || 1) * (this.sitW > 0.5 ? 0.78 : 1);
      const d = _v[2].subVectors(tp, eye);
      const localYaw = wrapAngle(Math.atan2(d.x, d.z) - this.yaw);
      yaw = clamp(localYaw, -1.3, 1.3);
      pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.6);
    }
    const ty = yaw * this.lookW, tpch = pitch * this.lookW;
    // eyes lead, head follows
    this.eyeYaw = damp(this.eyeYaw, ty, 18, dt);
    this.eyePitch = damp(this.eyePitch, tpch, 18, dt);
    this.headYaw = damp(this.headYaw, ty, this.headTurnSpeed, dt);
    this.headPitch = damp(this.headPitch, tpch, this.headTurnSpeed, dt);
    add('Chest', 0, this.headYaw * 0.15, 0);
    add('Neck', this.headPitch * 0.35, this.headYaw * 0.35, 0);
    add('Head', this.headPitch * 0.5, this.headYaw * 0.45, 0);
    this._eyeRel = [clamp(this.eyeYaw - this.headYaw * 0.95, -0.45, 0.45) + this.saccade.x, clamp(this.eyePitch - this.headPitch * 0.85, -0.35, 0.35) + this.saccade.y];
  }

  applyFaceBones() {
    const F = this.face, b = this.bones;
    const [ey, ep] = this._eyeRel || [0, 0];
    for (const s of ['L', 'R']) {
      b['Eye' + s].rotation.set(ep, ey, 0);
      // lids: openness and blink; lids also follow vertical gaze a little
      const open = clamp(F.lids * (1 - this.blink), 0, 1.4);
      b['Lid' + s].rotation.set(lerp(0.62, -0.62, Math.min(open, 1)) - Math.max(0, open - 1) * 0.6 + ep * 0.4, 0, 0);
      const sign = s === 'L' ? 1 : -1;
      const asym = s === 'L' ? F.asym : -F.asym * 0.6;
      b['Brow' + s].position.y = b['Brow' + s].userData.y0 ??= b['Brow' + s].position.y;
      b['Brow' + s].position.y = b['Brow' + s].userData.y0 + (F.raise + asym * 0.5) * 0.006 + F.inner * 0.002 - F.angry * 0.003;
      // inner end up (sad) / down (angry); rotation about the face axis
      b['Brow' + s].rotation.set(0, 0, sign * (-F.inner * 0.32 + F.angry * 0.38 + asym * 0.1));
    }
    if (this.mouth) {
      const d = this.mouth.morphTargetDictionary, inf = this.mouth.morphTargetInfluences;
      inf[d.Smile] = clamp(F.smile, 0, 1);
      inf[d.Frown] = clamp(F.frown, 0, 1);
      inf[d.Open] = clamp(F.open + this.mouthOpen * 0.65, 0, 1.2);
      inf[d.Wide] = clamp(F.wide, 0, 1);
      inf[d.O] = clamp(F.O + this.mouthOpen * 0.15, 0, 1);
      inf[d.Smirk] = clamp(F.smirk, 0, 1);
    }
  }

  applyFingers(dt) {
    for (const s of ['L', 'R']) {
      const target = HAND_POSES[this.handTarget[s]] || HAND_POSES.relaxed;
      const h = this.hand[s];
      for (let i = 0; i < 4; i++) h.curl[i] = damp(h.curl[i], target.curl[i], 14, dt);
      h.thumb = damp(h.thumb, target.thumb, 14, dt);
      const sign = s === 'L' ? -1 : 1;
      for (let i = 0; i < 4; i++) {
        const f = FINGERS[i];
        this.bones[f + s + '1'].rotation.set(0, 0, sign * h.curl[i] * 0.9);
        this.bones[f + s + '2'].rotation.set(0, 0, sign * h.curl[i] * 1.0);
      }
      this.bones['Thumb' + s + '1'].rotation.set(-h.thumb * 0.3, 0, sign * h.thumb * 0.5);
      this.bones['Thumb' + s + '2'].rotation.set(0, 0, sign * h.thumb * 0.7);
    }
  }

  // ------------------------------------------------------------------ IK
  solveArm(side, dt) {
    const k = this.ik[side];
    k.w = damp(k.w, k.wt, k.speed, dt);
    if (k.w < 0.002) return;
    const b = this.bones;
    const upper = b['UpperArm' + side], fore = b['ForeArm' + side], hand = b['Hand' + side];
    // target in world
    const T = _v[3];
    if (k.targetFn) T.copy(k.targetFn(this));
    else if (k.obj) k.obj.getWorldPosition(T);
    else T.copy(k.target);
    if (k.local) this.root.localToWorld(T);
    if (k.offset) T.add(k.offset);
    // hand orientation (world)
    const rootQ = this.root.getWorldQuaternion(_q[0]);
    let F = null, N = null;
    if (k.fingers) { F = _v[4].copy(typeof k.fingers === 'function' ? k.fingers(this) : k.fingers); if (k.local) F.applyQuaternion(rootQ); F.normalize(); }
    if (k.palm) { N = _v[5].copy(typeof k.palm === 'function' ? k.palm(this) : k.palm); if (k.local) N.applyQuaternion(rootQ); N.normalize(); }
    // wrist = palm centre target minus palm offset
    const W = _v[6].copy(T);
    if (F) W.addScaledVector(F, -0.06 * (this.look.scale || 1));
    const S = upper.getWorldPosition(_v[7]);
    const L1 = this.L1, L2 = this.L2;
    const d = _v[8].subVectors(W, S);
    let dist = d.length();
    dist = clamp(dist, 0.06, (L1 + L2) * 0.995);
    d.normalize();
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const pole = _v[9];
    if (k.pole) { pole.copy(k.pole); if (k.local) pole.applyQuaternion(rootQ); } else pole.set(side === 'L' ? 0.55 : -0.55, -0.5, -0.65).applyQuaternion(rootQ);
    const pp = _v[10].copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    const E = _v[11].copy(S).addScaledVector(d, L1 * cosA).addScaledVector(pp, L1 * sinA);
    const Wc = _v[12].copy(S).addScaledVector(d, dist);
    const u = _v[13].subVectors(E, S).normalize();
    const f = new THREE.Vector3().subVectors(Wc, E).normalize();
    // upper arm basis
    const y = u.clone().negate();
    let z = f.clone().addScaledVector(u, -f.dot(u));
    if (z.lengthSq() < 1e-6) z = pp.clone().negate();
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const qUpper = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
    const y2 = f.clone().negate();
    const z2 = new THREE.Vector3().crossVectors(x, y2).normalize();
    const qFore = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y2, z2));
    // convert to local and blend with FK
    const parentQ = upper.parent.getWorldQuaternion(_q[1]);
    const locU = _q[2].copy(parentQ).invert().multiply(qUpper);
    upper.quaternion.slerp(locU, k.w);
    upper.updateMatrixWorld(true);
    const upQ = upper.getWorldQuaternion(_q[3]);
    const locF = _q[4].copy(upQ).invert().multiply(qFore);
    fore.quaternion.slerp(locF, k.w);
    fore.updateMatrixWorld(true);
    if (F && N) {
      const hy = F.clone().negate();
      let hx = side === 'L' ? N.clone().negate() : N.clone();
      hx.addScaledVector(hy, -hx.dot(hy)).normalize();
      const hz = new THREE.Vector3().crossVectors(hx, hy);
      const qHand = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(hx, hy, hz));
      const fq = fore.getWorldQuaternion(_q[5]);
      const locH = fq.invert().multiply(qHand);
      hand.quaternion.slerp(locH, k.w);
    } else {
      hand.quaternion.slerp(_q[5].identity(), k.w * 0.5);
    }
    hand.updateMatrixWorld(true);
  }

  // world position of a point in front of the chest (useful for gestures)
  localPoint(x, y, z, out = new THREE.Vector3()) {
    out.set(x, y, z);
    return this.root.localToWorld(out);
  }

  handWorld(side, out = new THREE.Vector3()) {
    return this.bones['Hand' + side].localToWorld(out.set(0, -0.06, 0));
  }

  headWorld(out = new THREE.Vector3()) {
    return this.bones.Head.localToWorld(out.set(0, 0.12, 0.02));
  }
}

// ------------------------------------------------------------------ gesture library
// update(ch, u, inst, dt): u = 0..1 progress. Hand targets are given in character-local space
// (x left, y up, z forward).
const fwd = new THREE.Vector3(0, 0, 1);
const env = (u, a = 0.18, b = 0.2) => smooth(clamp(u / a, 0, 1)) * smooth(clamp((1 - u) / b, 0, 1));

export const GESTURES = {
  straightenSuit: {
    dur: 1.6, channel: 'arms',
    update(ch, u) {
      const w = env(u, 0.2, 0.25);
      const pull = smooth(clamp((u - 0.35) / 0.35, 0, 1));
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 1 : -1;
        ch.reach(s, new THREE.Vector3(sx * 0.07, 1.38 - pull * 0.13, 0.17), { local: true, weight: w, speed: 30,
          fingers: new THREE.Vector3(-sx * 0.1, -1, 0.2), palm: new THREE.Vector3(0, 0, -1), hand: 'grip' });
      }
      ch._add('Head', -0.12 * pull * w, 0, 0);
      ch._add('Chest', -0.08 * pull * w, 0, 0);
    },
    end(ch) { ch.release('L'); ch.release('R'); ch.setHand('L', 'relaxed'); ch.setHand('R', 'relaxed'); },
  },
  shrug: {
    dur: 1.2, channel: 'arms',
    update(ch, u) {
      const w = env(u, 0.25, 0.35);
      ch._add('ShoulderL', 0, 0, 0.25 * w); ch._add('ShoulderR', 0, 0, -0.25 * w);
      ch._add('UpperArmL', -0.2 * w, 0, 0.25 * w); ch._add('UpperArmR', -0.2 * w, 0, -0.25 * w);
      ch._add('ForeArmL', -1.1 * w, 0.6 * w, 0); ch._add('ForeArmR', -1.1 * w, -0.6 * w, 0);
      ch._add('Head', 0, 0, 0.12 * w);
    },
  },
  nod: {
    dur: 0.8, channel: 'head',
    update(ch, u) { ch._add('Head', Math.sin(u * Math.PI * 2) * 0.16 * env(u, 0.1, 0.1), 0, 0); },
  },
  headShake: {
    dur: 1.0, channel: 'head',
    update(ch, u) { ch._add('Head', 0, Math.sin(u * Math.PI * 4) * 0.25 * env(u, 0.1, 0.2), 0); },
  },
  lookAround: {
    dur: 3.2, channel: 'head',
    update(ch, u) {
      const w = env(u, 0.1, 0.15);
      ch._add('Neck', -0.08 * w, Math.sin(u * Math.PI * 2) * 0.55 * w, 0);
      ch._add('Head', -0.1 * w + Math.sin(u * 9) * 0.03, Math.sin(u * Math.PI * 2) * 0.35 * w, 0);
    },
  },
  scratchHead: {
    dur: 1.8, channel: 'armR',
    update(ch, u) {
      const w = env(u, 0.25, 0.25);
      const head = ch.headWorld(new THREE.Vector3());
      head.y += 0.04;
      head.x += Math.sin(u * 40) * 0.01;
      ch.reach('R', head, { weight: w, speed: 30, hand: 'pinch' });
      ch._add('Head', 0.08 * w, 0, 0.1 * w);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  touchHair: {
    dur: 2.2, channel: 'armR',
    update(ch, u) {
      const w = env(u, 0.2, 0.25);
      const head = ch.headWorld(new THREE.Vector3());
      const side = new THREE.Vector3(-0.06, 0.02 + Math.sin(u * 8) * 0.015, -0.02).applyQuaternion(ch.root.quaternion);
      head.add(side);
      ch.reach('R', head, { weight: w, speed: 30, hand: 'open' });
      ch._add('Head', 0, 0.12 * Math.sin(u * 5) * w, -0.05 * w);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  wave: {
    dur: 1.6, channel: 'armR',
    update(ch, u) {
      const w = env(u, 0.2, 0.25);
      ch.reach('R', new THREE.Vector3(-0.28 + Math.sin(u * 22) * 0.06, 1.62, 0.18), { local: true, weight: w, speed: 25,
        fingers: new THREE.Vector3(Math.sin(u * 22) * 0.3, 1, 0), palm: new THREE.Vector3(0, 0, 1), hand: 'open' });
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  point: {
    dur: 1.6, channel: 'armR',
    start(ch, inst) { inst.target = inst.opts.target.clone(); },
    update(ch, u, inst) {
      const w = env(u, 0.22, 0.25);
      const sh = ch.bones.UpperArmR.getWorldPosition(new THREE.Vector3());
      const dir = inst.target.clone().sub(sh).normalize();
      const p = sh.clone().addScaledVector(dir, 0.55);
      ch.reach('R', p, { weight: w, speed: 25, fingers: dir, palm: new THREE.Vector3(0, -1, 0).cross(dir).cross(dir).negate(), hand: 'point' });
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  presentL: {
    dur: 1.8, channel: 'armL',
    start(ch, inst) { inst.target = inst.opts.target.clone(); },
    update(ch, u, inst) {
      const w = env(u, 0.22, 0.25);
      const sh = ch.bones.UpperArmL.getWorldPosition(new THREE.Vector3());
      const dir = inst.target.clone().sub(sh); dir.y *= 0.4; dir.normalize();
      const p = sh.clone().addScaledVector(dir, 0.48); p.y -= 0.12;
      ch.reach('L', p, { weight: w, speed: 25, fingers: dir, palm: new THREE.Vector3(0, 1, 0), hand: 'open' });
    },
    end(ch) { ch.release('L'); ch.setHand('L', 'relaxed'); },
  },
  armsCrossed: {
    dur: 1, channel: 'arms', loop: true,
    update(ch) {
      ch.reach('L', new THREE.Vector3(-0.1, 1.2, 0.14), { local: true, weight: 1, speed: 6, fingers: new THREE.Vector3(-1, 0, 0), palm: new THREE.Vector3(0, 0, -1), hand: 'relaxed' });
      ch.reach('R', new THREE.Vector3(0.1, 1.23, 0.17), { local: true, weight: 1, speed: 6, fingers: new THREE.Vector3(1, 0, 0), palm: new THREE.Vector3(0, 0, -1), hand: 'relaxed' });
    },
    end(ch) { ch.release('L'); ch.release('R'); },
  },
  handsOnHips: {
    dur: 1, channel: 'arms', loop: true,
    update(ch) {
      ch.reach('L', new THREE.Vector3(0.17, 1.0, 0.02), { local: true, weight: 1, speed: 6, fingers: new THREE.Vector3(-0.3, -0.3, 1), palm: new THREE.Vector3(-1, 0, 0), hand: 'relaxed' });
      ch.reach('R', new THREE.Vector3(-0.17, 1.0, 0.02), { local: true, weight: 1, speed: 6, fingers: new THREE.Vector3(0.3, -0.3, 1), palm: new THREE.Vector3(1, 0, 0), hand: 'relaxed' });
    },
    end(ch) { ch.release('L'); ch.release('R'); },
  },
  phone: {
    dur: 1, channel: 'arms', loop: true,
    start(ch) { ch.setEmotion('neutral'); },
    update(ch, u, inst) {
      const tt = ch.t;
      const p = new THREE.Vector3(0.02, ch.sitW > 0.5 ? 1.12 : 1.25, 0.3);
      ch.reach('L', p, { local: true, weight: 1, speed: 4, fingers: new THREE.Vector3(-0.2, 0.6, 0.6), palm: new THREE.Vector3(-0.3, 0.6, -0.5), hand: 'hold' });
      const tap = Math.max(0, Math.sin(tt * 7)) * 0.012;
      ch.reach('R', new THREE.Vector3(-0.03, p.y + 0.03 + tap, p.z + 0.02), { local: true, weight: 1, speed: 4, fingers: new THREE.Vector3(0.6, 0.2, 0.7), palm: new THREE.Vector3(0, -1, 0.2), hand: 'point' });
      ch._add('Neck', 0.25, 0, 0); ch._add('Head', 0.2, 0, 0);
    },
    end(ch) { ch.release('L'); ch.release('R'); ch.setHand('L', 'relaxed'); ch.setHand('R', 'relaxed'); },
  },
  laugh: {
    dur: 1.4, channel: 'body',
    start(ch) { ch.setEmotion('ecstatic', 1.6); },
    update(ch, u) {
      const w = env(u, 0.1, 0.3);
      ch._add('Chest', -0.12 * w + Math.sin(u * 30) * 0.04 * w, 0, 0);
      ch._add('Head', -0.15 * w + Math.sin(u * 30) * 0.05 * w, 0, 0);
      ch.mouthOpen = Math.max(ch.mouthOpen, (0.5 + 0.5 * Math.sin(u * 30)) * w * 0.8);
    },
  },
  sigh: {
    dur: 1.6, channel: 'body',
    start(ch) { audio.sigh(ch.voice.pitch / 150); },
    update(ch, u) {
      const inhale = Math.sin(clamp(u / 0.4, 0, 1) * Math.PI / 2);
      const exhale = smooth(clamp((u - 0.4) / 0.6, 0, 1));
      const v = inhale * (1 - exhale);
      ch._add('Chest', -0.12 * v, 0, 0);
      ch._add('ShoulderL', 0, 0, 0.12 * v - 0.06 * exhale * (1 - u)); ch._add('ShoulderR', 0, 0, -0.12 * v + 0.06 * exhale * (1 - u));
      ch._add('Head', -0.08 * v + 0.08 * exhale * (1 - u), 0, 0);
    },
  },
  flinch: {
    dur: 0.6, channel: 'body',
    update(ch, u) {
      const w = Math.sin(clamp(u, 0, 1) * Math.PI);
      ch._add('Spine', -0.08 * w, 0, 0); ch._add('Head', -0.12 * w, 0, 0);
      ch._add('ShoulderL', 0, 0, 0.2 * w); ch._add('ShoulderR', 0, 0, -0.2 * w);
    },
  },
  chinUp: {
    dur: 1.4, channel: 'head',
    update(ch, u) { ch._add('Head', -0.28 * env(u, 0.25, 0.3), 0, 0); ch._add('Neck', -0.1 * env(u, 0.25, 0.3), 0, 0); },
  },
  selfie: {
    dur: 2.4, channel: 'armR',
    update(ch, u) {
      const w = env(u, 0.2, 0.2);
      const p = new THREE.Vector3(-0.15, ch.sitW > 0.5 ? 1.45 : 1.7, 0.42);
      ch.reach('R', p, { local: true, weight: w, speed: 20, fingers: new THREE.Vector3(0.2, 1, 0.1), palm: new THREE.Vector3(0.2, 0, -1), hand: 'hold' });
      ch._add('Head', -0.06 * w, -0.25 * w, 0.12 * w);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  checkHair: {
    dur: 2.6, channel: 'arms',
    update(ch, u) {
      const w = env(u, 0.2, 0.2);
      const h = ch.headWorld(new THREE.Vector3());
      const q = ch.root.quaternion;
      const l = new THREE.Vector3(0.09, -0.02, 0.0).applyQuaternion(q).add(h);
      const r = new THREE.Vector3(-0.09, -0.02 + Math.sin(u * 6) * 0.02, 0.0).applyQuaternion(q).add(h);
      ch.reach('R', r, { weight: w, speed: 25, hand: 'open' });
      ch.reach('L', l, { weight: w * 0.8, speed: 25, hand: 'open' });
      ch._add('Head', 0, Math.sin(u * Math.PI * 2) * 0.3 * w, 0);
    },
    end(ch) { ch.release('R'); ch.release('L'); ch.setHand('R', 'relaxed'); ch.setHand('L', 'relaxed'); },
  },
};

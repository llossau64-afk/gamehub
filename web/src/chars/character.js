// Procedurally animated character: locomotion, sitting, look-at, emotions, lip-sync,
// two-bone arm IK and finger poses. No baked clips: everything blends continuously.
import * as THREE from 'three';
import { createBody, getTemplate } from './template.js';
import { clamp, lerp, damp, dampAngle, noise1, rand, pick, smooth, easeInOut, wrapAngle } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { blobShadowTexture } from '../render/textures.js';
import { HEAD_C, HEAD_R, hairline } from '../hair/hair.js';
import { PAL_SLOTS } from '../render/materials.js';
const FACE_SLOT = PAL_SLOTS.indexOf('Face');

const _hs = new THREE.Vector3(), _hs2 = new THREE.Vector3();

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
  furious:      { raise: -0.45, inner: 0, angry: 1, asym: 0.1, lids: 0.6, smile: 0, frown: 1, open: 0.55, wide: 0.9, O: 0, smirk: 0, lean: 0.1, shoulders: 0.45, tilt: 0, pitch: 0.1, chest: 0.2 },
  devastated:   { raise: 0.1, inner: 1, angry: 0, asym: 0, lids: 0.62, smile: 0, frown: 1, open: 0.12, wide: 0.15, O: 0.1, smirk: 0, lean: 0.12, shoulders: -0.35, tilt: 0.1, pitch: 0.28, chest: -0.3 },
  horrified:    { raise: 1, inner: 0.7, angry: 0, asym: 0, lids: 1.45, smile: 0, frown: 0.6, open: 0.85, wide: 0.6, O: 0.3, smirk: 0, lean: -0.08, shoulders: 0.5, tilt: 0, pitch: -0.06, chest: 0.1 },
  starstruck:   { raise: 0.9, inner: 0.35, angry: 0, asym: 0, lids: 1.25, smile: 1, frown: 0, open: 0.6, wide: 1, O: 0, smirk: 0, lean: -0.06, shoulders: 0.35, tilt: 0.05, pitch: -0.14, chest: 0.35 },
  smug:         { raise: 0.25, inner: 0, angry: 0, asym: 0.6, lids: 0.7, smile: 0.5, frown: 0, open: 0, wide: 0, O: 0, smirk: 1, lean: -0.08, shoulders: -0.05, tilt: -0.08, pitch: -0.12, chest: 0.3 },
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
  thumb: { curl: [1.35, 1.4, 1.45, 1.45], thumb: -0.45 },
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
    // under a big moustache the mouth corners would peek out at the sides: keep it narrower
    if (this.mouth && (look.accessories || []).includes('moustache')) { this.mouth.scale.x = 0.72; this.mouth.position.z -= 0.001; }
    this.mesh = body.mesh;
    this.root.add(body.mesh);
    const sc = look.scale || 1;
    this.mesh.scale.set(sc * (look.width || 1), sc, sc * (look.width || 1));
    // head proportions: a touch wider, longer or rounder per person (hair follows the bone)
    if (look.head) this.bones.Head.scale.set(look.head[0], look.head[1], look.head[2]);
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
    if (this.beard) this.beard.dispose();
  }

  // ------------------------------------------------------------------ high level API
  place(pos, yaw = 0) {
    this.root.position.set(pos.x, 0, pos.z);
    this.yaw = yaw;
    this._prevYaw = yaw;
    this.yawVel = 0;
    this.root.rotation.y = yaw;
    this.path = [];
    this.speed = 0;
    this._prevSpeed = 0;
    this.accel = 0;
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
    // people blink when their expression changes; strong changes get a little overshoot
    if (name !== this.emotion) {
      if (this.blink < 0.2) this.blink = 1;
      this.faceKick = ['surprised', 'horrified', 'furious', 'ecstatic', 'starstruck'].includes(name) ? 1 : 0.4;
    }
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
    const fast = this.gait === 'speedwalk' || this.gait === 'storm';
    const gait = this.gait;

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
      if (gait === 'skip') {
        // happy hop-skip: knees high, arms swinging up
        add('ThighL', -Math.max(0, s) * 0.5 * walkW, 0, 0); add('ThighR', -Math.max(0, -s) * 0.5 * walkW, 0, 0);
        add('UpperArmL', -Math.max(0, -s) * 0.7 * walkW, 0, 0.15 * walkW); add('UpperArmR', -Math.max(0, s) * 0.7 * walkW, 0, -0.15 * walkW);
        add('Head', -0.1 * walkW, 0, Math.sin(ph) * 0.1 * walkW);
      } else if (gait === 'storm') {
        // angry stomp: stiff arms, chest forward, head down
        add('Spine', 0.12 * walkW, 0, 0); add('Head', 0.12 * walkW, 0, 0);
        add('UpperArmL', 0, 0, 0.12 * walkW); add('UpperArmR', 0, 0, -0.12 * walkW);
        add('ShoulderL', 0, 0, 0.12 * walkW); add('ShoulderR', 0, 0, -0.12 * walkW);
      } else if (gait === 'sulk') {
        // dragging feet, shoulders hanging, looking at the floor
        add('Spine', 0.18 * walkW, 0, 0); add('Neck', 0.25 * walkW, 0, 0); add('Head', 0.2 * walkW, 0, 0);
        add('ShoulderL', 0, 0, -0.1 * walkW); add('ShoulderR', 0, 0, 0.1 * walkW);
      }
    }

    // --- turning on the spot: little alternating steps, hips lead the turn
    if (this.turnW > 0.02) {
      const w = this.turnW, tp = this.turnPhase;
      const l = Math.max(0, Math.sin(tp)), r = Math.max(0, Math.sin(tp + Math.PI));
      add('ThighL', -0.32 * l * w, 0, 0); add('ShinL', 0.6 * l * w, 0, 0); add('FootL', -0.15 * l * w, 0, 0);
      add('ThighR', -0.32 * r * w, 0, 0); add('ShinR', 0.6 * r * w, 0, 0); add('FootR', -0.15 * r * w, 0, 0);
      const dirT = Math.sign(this.yawVel);
      add('Hips', 0, 0.12 * dirT * w, 0);
      add('Spine', 0, -0.05 * dirT * w, 0);
      add('UpperArmL', 0.1 * (l - r) * w, 0, 0.05 * w); add('UpperArmR', -0.1 * (l - r) * w, 0, -0.05 * w);
    }
    // --- weight shifts: lean into acceleration, rock back when stopping, bank into turns while walking
    {
      const lean = clamp((this.accel || 0) * 0.045, -0.12, 0.16) * (1 - this.sitW);
      add('Spine', lean, 0, 0);
      add('Chest', lean * 0.4, 0, 0);
      add('Head', -lean * 0.5, 0, 0);
      const bank = clamp(-(this.yawVel || 0) * 0.05, -0.14, 0.14) * walkW;
      add('Hips', 0, 0, bank * 0.6);
      add('Spine', 0, 0, bank);
      add('Head', 0, 0, -bank * 0.8);
      // the head leads a turn on the spot
      if (this.faceYaw !== undefined && this.faceYaw !== null) {
        const ahead = clamp(wrapAngle(this.faceYaw - this.yaw) * 0.45, -0.55, 0.55) * (1 - walkW);
        add('Neck', 0, ahead * 0.5, 0); add('Head', 0, ahead * 0.5, 0);
      }
    }

    // --- sitting
    if (this.sitW > 0.001) {
      const w = smooth(this.sitW);
      add('ThighL', -1.5 * w, 0, -0.06 * w); add('ThighR', -1.5 * w, 0, 0.06 * w);
      add('ShinL', 1.45 * w, 0, 0); add('ShinR', 1.45 * w, 0, 0);
      add('Spine', -0.06 * w, 0, 0);
      add('UpperArmL', -0.12 * w, 0, -0.05 * w); add('UpperArmR', -0.12 * w, 0, 0.05 * w);
      add('ForeArmL', -0.95 * w, -0.25 * w, 0); add('ForeArmR', -0.95 * w, 0.25 * w, 0);
      add('HandL', 0.25 * w, 0, -0.1 * w); add('HandR', 0.25 * w, 0, 0.1 * w);
      // getting in or out of a seat: the chest swings forward over the knees, then settles
      if (this.sitW < 0.999 && this.sitW > 0.001) {
        const mid = Math.sin(Math.PI * this.sitW);
        add('Spine', 0.38 * mid, 0, 0);
        add('Chest', 0.16 * mid, 0, 0);
        add('Head', -0.22 * mid, 0, 0);
        add('UpperArmL', -0.35 * mid, 0, 0.08 * mid); add('UpperArmR', -0.35 * mid, 0, -0.08 * mid);
      } else {
        // seated breathing and the odd fidget
        const br2 = Math.sin(t * 1.5 + this.idleSeed) * 0.5 + 0.5;
        add('Chest', -0.02 * br2 * w, 0, 0);
        add('Spine', noise1(t * 0.23 + this.idleSeed) * 0.04 * w, noise1(t * 0.19 + 3) * 0.05 * w, 0);
      }
    }

    // --- posture from emotion + character traits
    const hunch = this.posture.hunch;
    add('Spine', F.lean + hunch * 0.12 - F.chest * 0.05, 0, 0);
    add('Chest', F.lean * 0.5 + hunch * 0.15 - F.chest * 0.08, 0, 0);
    add('Neck', -hunch * 0.12 + F.pitch * 0.4, 0, F.tilt * 0.4);
    add('Head', -hunch * 0.06 + F.pitch * 0.6, 0, F.tilt * 0.6);
    if (this.microFace) add('Head', 0, 0, this.microFace.tilt);
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
    // talking with the hands: one arm comes up and beats on the stressed syllables, the
    // brows lift with it. Only when the arms are free (no gesture, no reach).
    const armsBusy = this.gestures.some((g) => ['arms', 'armR', 'armL', 'body'].includes(g.g.channel)) || this.ik.R.wt > 0 || this.ik.L.wt > 0;
    this.talkW = damp(this.talkW || 0, this.talk && !armsBusy && walkW < 0.3 ? 1 : 0, this.talk ? 4 : 2.5, dt);
    if (this.talkW > 0.01) {
      const w = this.talkW, beat = this.mouthOpen;
      const side = (this.idleSeed * 10) % 2 > 1 ? 'L' : 'R', sg = side === 'L' ? 1 : -1;
      const sit = this.sitW > 0.5 ? 0.5 : 1;
      add('UpperArm' + side, -0.35 * w * sit - beat * 0.12 * w, 0, sg * 0.12 * w);
      add('ForeArm' + side, -0.9 * w - beat * 0.35 * w, sg * 0.4 * w, 0);
      add('Hand' + side, -0.25 * w + beat * 0.3 * w, 0, sg * 0.2 * w);
      add('Chest', 0, -sg * 0.04 * w, 0);
      if (!armsBusy) this.handTarget[side] = beat > 0.3 ? 'open' : 'relaxed';
      this.browBeat = beat * w;
    } else this.browBeat = 0;
    // idle: shift the weight from one leg to the other every few seconds
    if (walkW < 0.05 && this.sitW < 0.05 && this.turnW < 0.05) {
      const sh = Math.sin(t * 0.21 + this.idleSeed * 7);
      const k = smooth(clamp(sh * 1.5 * 0.5 + 0.5, 0, 1)) * 2 - 1;
      add('Hips', 0, 0, k * 0.035);
      add('ThighL', 0, 0, -k * 0.035); add('ThighR', 0, 0, -k * 0.035);
      add('ShinL', Math.max(0, k) * 0.12, 0, 0); add('ShinR', Math.max(0, -k) * 0.12, 0, 0);
      add('Spine', 0, 0, -k * 0.025);
    }

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
    let bob = walkW * (Math.abs(Math.cos(this.phase)) * lerp(0.025, 0.06, runW) - 0.015);
    if (this.gait === 'skip') bob += walkW * Math.abs(Math.sin(this.phase)) * 0.09;
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
    if (this.beard) this.beard.update(dt);
  }

  updateLocomotion(dt) {
    const pos = this.root.position;
    let want = 0;
    if (this.path.length && this.sitW < 0.01) {
      const tgt = this.path[0];
      const dx = tgt.x - pos.x, dz = tgt.z - pos.z;
      const d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      const gs = { walk: 1.2, speedwalk: 2.1, run: 3.6, stroll: 0.85, skip: 1.6, storm: 1.9, sulk: 0.6 }[this.gait] || 1.2;
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
    const stride = { walk: 0.62, speedwalk: 0.42, run: 0.95, stroll: 0.55, skip: 0.55, storm: 0.45, sulk: 0.42 }[this.gait] || 0.62;
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
    // motion derivatives for secondary animation (turn steps, leaning into turns, weight shifts)
    if (dt > 0) {
      const yv = wrapAngle(this.yaw - (this._prevYaw ?? this.yaw)) / dt;
      this.yawVel = damp(this.yawVel || 0, yv, 10, dt);
      const acc = (this.speed - (this._prevSpeed ?? this.speed)) / dt;
      this.accel = damp(this.accel || 0, acc, 6, dt);
    }
    this._prevYaw = this.yaw;
    this._prevSpeed = this.speed;
    // stepping on the spot while turning instead of skating round
    const turning = this.speed < 0.25 && this.sitW < 0.05 ? clamp((Math.abs(this.yawVel) - 0.6) / 1.5, 0, 1) : 0;
    this.turnW = damp(this.turnW || 0, turning, 10, dt);
    if (this.turnW > 0.02) {
      const prevT = this.turnPhase || 0;
      this.turnPhase = prevT + dt * (5 + Math.abs(this.yawVel) * 2.2);
      if (Math.floor(prevT / Math.PI) !== Math.floor(this.turnPhase / Math.PI) && this.onFootstep) this.onFootstep(this);
    }
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

  // face colour: red with anger, pale with shock. amount 0..1, eases in and out
  flush(color = '#e0412f', amount = 0.55, hold = 3) {
    this._flush = { c: new THREE.Color(color), a: amount, hold };
  }

  updateFlush(dt) {
    const f = this._flush;
    const want = f && f.hold > 0 ? f.a : 0;
    if (f) f.hold -= dt;
    const prev = this._flushW || 0;
    this._flushW = damp(prev, want, want > prev ? 3 : 1.2, dt);
    if (Math.abs(this._flushW - prev) < 1e-4 && !(this._flushW > 0 && f)) return;
    const d = this.body.palette.image.data;
    const o = FACE_SLOT * 4;
    if (!this._skin0) this._skin0 = [d[o], d[o + 1], d[o + 2]];
    const s0 = this._skin0, c = f ? f.c : null, w = this._flushW;
    for (let k = 0; k < 3; k++) d[o + k] = c ? s0[k] + ([c.r, c.g, c.b][k] - s0[k]) * w : s0[k];
    this.body.palette.needsUpdate = true;
    // the scalp under short hair is drawn by the hair shader: tint it the same way
    for (const sys of [this.hair, this.beard]) {
      const u = sys?.mesh?.material?.uniforms?.uSkin;
      if (!u) continue;
      sys._skin0 ||= u.value.clone();
      u.value.copy(sys._skin0);
      if (c) u.value.lerp(c, w);
    }
    if (w < 0.002 && f && f.hold <= 0) this._flush = null;
  }

  updateFace(dt) {
    this.updateFlush(dt);
    if (this.emotionHold > 0) {
      this.emotionHold -= dt;
      if (this.emotionHold <= 0) this.setEmotion('neutral');
    }
    const tgt = this.emotionTarget;
    // fast attack with a small overshoot on big changes, then settle
    this.faceKick = Math.max(0, (this.faceKick || 0) - dt * 2.5);
    const rate = 7 + this.faceKick * 10;
    for (const k of FACE_KEYS) {
      const over = (k === 'raise' || k === 'open' || k === 'smile' || k === 'wide') ? 1 + this.faceKick * 0.18 : 1;
      this.face[k] = damp(this.face[k], tgt[k] * over, rate, dt);
    }
    // micro expressions while idle: a brow flick, a half smile, a quick squint
    this.microT = (this.microT ?? rand(2, 6)) - dt;
    if (this.microT < 0) {
      this.microT = rand(2.5, 7);
      if (!this.talk) this.micro = { kind: pick(['brow', 'brow', 'smirk', 'squint', 'tilt']), t: 0, dur: rand(0.5, 0.9), side: Math.random() < 0.5 ? 1 : -1 };
    }
    if (this.micro) {
      const m = this.micro;
      m.t += dt;
      const w = Math.sin(clamp(m.t / m.dur, 0, 1) * Math.PI);
      this.microFace = { raise: m.kind === 'brow' ? 0.35 * w : 0, asym: m.kind === 'brow' ? 0.4 * w * m.side : 0, smirk: m.kind === 'smirk' ? 0.35 * w : 0,
        lids: m.kind === 'squint' ? -0.18 * w : 0, tilt: m.kind === 'tilt' ? 0.06 * w * m.side : 0 };
      if (m.t > m.dur) { this.micro = null; this.microFace = null; }
    }
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
        if (d >= 0 && d < 0.12) { near = Math.max(near, Math.sin(d / 0.12 * Math.PI)); this.talk.vowel = ((i * 7919) % 5) / 4; }
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
      const M = this.microFace;
      // a real smile squints the eyes a little
      const duch = 1 - Math.max(0, F.smile - 0.35) * 0.22;
      const open = clamp((F.lids + (M ? M.lids : 0)) * duch * (1 - this.blink), 0, 1.4);
      b['Lid' + s].rotation.set(lerp(0.62, -0.62, Math.min(open, 1)) - Math.max(0, open - 1) * 0.6 + ep * 0.4, 0, 0);
      const sign = s === 'L' ? 1 : -1;
      const A = F.asym + (M ? M.asym : 0);
      const asym = s === 'L' ? A : -A * 0.6;
      b['Brow' + s].position.y = b['Brow' + s].userData.y0 ??= b['Brow' + s].position.y;
      b['Brow' + s].position.y = b['Brow' + s].userData.y0 + (F.raise + (M ? M.raise : 0) + asym * 0.5) * 0.006 + F.inner * 0.002 - F.angry * 0.003 + (this.browBeat || 0) * 0.0025;
      // inner end up (sad) / down (angry); rotation about the face axis
      b['Brow' + s].rotation.set(0, 0, sign * (-F.inner * 0.32 + F.angry * 0.38 + asym * 0.1));
    }
    if (this.mouth) {
      const d = this.mouth.morphTargetDictionary, inf = this.mouth.morphTargetInfluences;
      inf[d.Smile] = clamp(F.smile, 0, 1);
      inf[d.Frown] = clamp(F.frown, 0, 1);
      inf[d.Open] = clamp(F.open + this.mouthOpen * 0.65, 0, 1.2);
      // vowels: alternate rounder and wider shapes from syllable to syllable
      const vow = this.talk ? (this.talk.vowel ?? 0) : 0;
      inf[d.O] = clamp(F.O + this.mouthOpen * (0.1 + 0.45 * vow), 0, 1);
      inf[d.Wide] = clamp(F.wide + this.mouthOpen * 0.35 * (1 - vow), 0, 1);
      inf[d.Smirk] = clamp(F.smirk + (this.microFace ? this.microFace.smirk : 0), 0, 1);
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
        // a slight fan: the outer fingers spread a little when the hand opens
        this.bones[f + s + '1'].rotation.set((i - 1.5) * 0.05 * (1 - Math.min(1, h.curl[i])), 0, sign * h.curl[i] * 0.8);
        this.bones[f + s + '2'].rotation.set(0, 0, sign * h.curl[i] * 0.8);
        this.bones[f + s + '3'].rotation.set(0, 0, sign * h.curl[i] * 0.52);
      }
      this.bones['Thumb' + s + '1'].rotation.set(-h.thumb * 0.3, 0, sign * h.thumb * 0.45);
      this.bones['Thumb' + s + '2'].rotation.set(0, 0, sign * h.thumb * 0.5);
      this.bones['Thumb' + s + '3'].rotation.set(0, 0, sign * h.thumb * 0.4);
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

  // A point on the skull (an ellipsoid in head space: x left, y up, z forward) plus its outward
  // normal, both in world space. `lift` pushes the point off the skin (hair, palm thickness).
  headSurface(dx, dy, dz, lift = 0, out = { p: new THREE.Vector3(), n: new THREE.Vector3() }) {
    const d = _hs.set(dx, dy, dz).normalize();
    const t = 1 / Math.sqrt((d.x / HEAD_R.x) ** 2 + (d.y / HEAD_R.y) ** 2 + (d.z / HEAD_R.z) ** 2);
    const n = out.n.set(d.x / HEAD_R.x ** 2, d.y / HEAD_R.y ** 2, d.z / HEAD_R.z ** 2).normalize();
    out.p.copy(HEAD_C).addScaledVector(d, t).addScaledVector(n, lift);
    // hair adds its own thickness where there is hair
    if (this.hair) {
      const theta = Math.acos(clamp(d.y, -1, 1)), phi = Math.atan2(d.x, d.z);
      if (theta < hairline(phi)) out.p.addScaledVector(n, (this.hair.lengthAt(phi, theta) || 0) * 0.06 * 0.55);
    }
    const head = this.bones.Head;
    head.localToWorld(out.p);
    out.n.transformDirection(head.matrixWorld);
    return out;
  }

  // put a palm flat on the head: target at the palm centre, palm facing the skull,
  // fingers along `along` (head space) projected onto the surface
  touchHead(side, dx, dy, dz, along, opts = {}) {
    const s = this.headSurface(dx, dy, dz, opts.lift ?? 0.016);
    const a = _hs2.copy(along).transformDirection(this.bones.Head.matrixWorld);
    a.addScaledVector(s.n, -a.dot(s.n)).normalize();
    this.reach(side, s.p.clone(), { weight: opts.weight ?? 1, speed: opts.speed ?? 30, fingers: a.clone(), palm: s.n.clone().negate(), hand: opts.hand || 'relaxed' });
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
      // fingertips work the side of the crown in small circles
      const wob = Math.sin(u * 38) * 0.12;
      ch.touchHead('R', -0.45 + wob * 0.3, 0.85, -0.15 + wob, new THREE.Vector3(0.6, 0.6, -0.2), { weight: w, hand: 'pinch', lift: 0.022 });
      ch._add('Head', 0.08 * w, 0, 0.1 * w);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  touchHair: {
    dur: 2.2, channel: 'armR',
    update(ch, u) {
      const w = env(u, 0.2, 0.25);
      // palm slides up the side of the head, front to back
      const k = 0.5 + 0.5 * Math.sin(u * 8);
      ch.touchHead('R', -0.95, 0.15 + k * 0.35, 0.25 - k * 0.45, new THREE.Vector3(0, 0.6, -0.8), { weight: w, hand: 'open' });
      ch._add('Head', 0, 0.12 * Math.sin(u * 5) * w, -0.05 * w);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  wipeBrow: {
    dur: 1.5, channel: 'armR',
    start(ch) { audio.sigh(ch.voice.pitch / 150); },
    update(ch, u) {
      const w = env(u, 0.22, 0.2);
      // the palm wipes across the forehead from his left to his right, head tipping back with relief
      const k = smooth(clamp((u - 0.18) / 0.6, 0, 1));
      ch.touchHead('R', 0.55 - k * 1.1, 0.42, 0.85, new THREE.Vector3(1, 0.25, 0), { weight: w, hand: 'open', lift: 0.014 });
      ch._add('Head', -0.14 * w * k, 0.08 * w * (k - 0.5), 0);
      ch._add('Chest', -0.05 * w, 0, 0);
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
      const p = new THREE.Vector3(0.02, ch.sitW > 0.5 ? 0.98 : 1.25, 0.34);
      ch.reach('L', p, { local: true, weight: 1, speed: 4, fingers: new THREE.Vector3(-0.2, 0.6, 0.6), palm: new THREE.Vector3(-0.3, 0.6, -0.5), hand: 'hold' });
      const tap = Math.max(0, Math.sin(tt * 7)) * 0.012;
      ch.reach('R', new THREE.Vector3(-0.03, p.y + 0.03 + tap, p.z + 0.02), { local: true, weight: 1, speed: 4, fingers: new THREE.Vector3(0.6, 0.2, 0.7), palm: new THREE.Vector3(0, -1, 0.2), hand: 'point' });
      ch._add('Neck', 0.3, 0, 0); ch._add('Head', 0.28, 0, 0); ch._add('Spine', 0.06, 0, 0);
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
  facepalm: {
    dur: 2.0, channel: 'armR',
    start(ch) { audio.thud(0.4); },
    update(ch, u) {
      const w = env(u, 0.15, 0.25);
      ch.touchHead('R', 0, 0.25, 1, new THREE.Vector3(0.2, 1, 0), { weight: w, hand: 'open', lift: 0.01, speed: 40 });
      ch._add('Head', 0.22 * w, Math.sin(u * 14) * 0.08 * w, 0);
      ch._add('Chest', 0.1 * w, 0, 0);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  coverHead: {
    // both hands clamped on top of the head in horror
    dur: 2.2, channel: 'arms',
    update(ch, u) {
      const w = env(u, 0.12, 0.2);
      ch.touchHead('R', -0.45, 0.85, 0.15, new THREE.Vector3(0.4, 0.2, -0.8), { weight: w, hand: 'open', speed: 40 });
      ch.touchHead('L', 0.45, 0.85, 0.15, new THREE.Vector3(-0.4, 0.2, -0.8), { weight: w, hand: 'open', speed: 40 });
      ch._add('Head', 0, Math.sin(u * 22) * 0.12 * w, 0);
      ch._add('Spine', 0.05 * w, 0, 0);
    },
    end(ch) { ch.release('R'); ch.release('L'); ch.setHand('R', 'relaxed'); ch.setHand('L', 'relaxed'); },
  },
  thumbsUp: {
    dur: 1.6, channel: 'armR',
    update(ch, u) {
      const w = env(u, 0.2, 0.25);
      const pump = Math.max(0, Math.sin(u * 12)) * 0.02;
      ch.reach('R', new THREE.Vector3(-0.2, (ch.sitW > 0.5 ? 1.12 : 1.32) + pump, 0.34), { local: true, weight: w, speed: 22,
        fingers: new THREE.Vector3(0.9, 0, 0.3), palm: new THREE.Vector3(0, 0, -1), hand: 'thumb' });
      ch._add('Head', 0, 0, -0.08 * w);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  fistPump: {
    dur: 1.4, channel: 'armR',
    start(ch) { audio.cheer(); },
    update(ch, u) {
      const w = env(u, 0.12, 0.25);
      const yank = Math.max(0, Math.sin(u * Math.PI * 3)) ;
      ch.reach('R', new THREE.Vector3(-0.2, (ch.sitW > 0.5 ? 1.15 : 1.4) + yank * 0.14, 0.22 - yank * 0.06), { local: true, weight: w, speed: 30,
        fingers: new THREE.Vector3(0, 1, 0.2), palm: new THREE.Vector3(1, 0, 0), hand: 'fist' });
      ch._add('Chest', -0.1 * w, 0, 0);
      ch._add('Head', -0.15 * w * yank, 0, 0);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  rage: {
    // fists shaking at the sky, stomping
    dur: 2.0, channel: 'arms',
    update(ch, u) {
      const w = env(u, 0.12, 0.2);
      const sh = Math.sin(u * 60) * 0.025;
      const y = ch.sitW > 0.5 ? 1.25 : 1.55;
      ch.reach('R', new THREE.Vector3(-0.22 + sh, y + sh, 0.26), { local: true, weight: w, speed: 40, fingers: new THREE.Vector3(0, 1, 0.3), palm: new THREE.Vector3(1, 0, 0), hand: 'fist' });
      ch.reach('L', new THREE.Vector3(0.22 - sh, y - sh, 0.26), { local: true, weight: w, speed: 40, fingers: new THREE.Vector3(0, 1, 0.3), palm: new THREE.Vector3(-1, 0, 0), hand: 'fist' });
      ch._add('Chest', -0.12 * w, Math.sin(u * 30) * 0.05 * w, 0);
      ch._add('Head', -0.2 * w, Math.sin(u * 26) * 0.1 * w, 0);
      if (ch.sitW < 0.5) {
        const st = Math.max(0, Math.sin(u * Math.PI * 6));
        ch._add('ThighL', -0.5 * st * w, 0, 0); ch._add('ShinL', 0.7 * st * w, 0, 0);
        if (Math.sin(u * Math.PI * 6) < -0.95 && !ch._stomped) { ch._stomped = true; audio.thud(0.9); ch.onStomp?.(ch); }
        if (Math.sin(u * Math.PI * 6) > 0) ch._stomped = false;
      }
    },
    end(ch) { ch.release('R'); ch.release('L'); ch.setHand('R', 'relaxed'); ch.setHand('L', 'relaxed'); },
  },
  pointAccuse: {
    dur: 1.8, channel: 'armR',
    update(ch, u, inst) {
      const w = env(u, 0.12, 0.2);
      const tgt = inst.opts.target ? (typeof inst.opts.target === 'function' ? inst.opts.target() : inst.opts.target) : ch.root.localToWorld(new THREE.Vector3(0, 1.5, 2));
      const sh = ch.bones.UpperArmR.getWorldPosition(new THREE.Vector3());
      const dir = tgt.clone().sub(sh).normalize();
      const jab = Math.max(0, Math.sin(u * Math.PI * 5)) * 0.06;
      const p = sh.clone().addScaledVector(dir, 0.5 + jab);
      ch.reach('R', p, { weight: w, speed: 35, fingers: dir, palm: new THREE.Vector3(0, -1, 0), hand: 'point' });
      ch._add('Chest', 0.06 * w, 0, 0);
      ch._add('Head', 0.05 * w + jab, 0, 0);
    },
    end(ch) { ch.release('R'); ch.setHand('R', 'relaxed'); },
  },
  dance: {
    dur: 2.4, channel: 'body',
    update(ch, u) {
      const w = env(u, 0.12, 0.2);
      const b = u * Math.PI * 8;
      ch._add('Hips', 0, Math.sin(b) * 0.25 * w, Math.sin(b) * 0.08 * w);
      ch._add('Spine', 0, -Math.sin(b) * 0.15 * w, -Math.sin(b) * 0.06 * w);
      ch._add('Head', -0.08 * w, Math.sin(b) * 0.15 * w, Math.sin(b + 1) * 0.1 * w);
      ch._add('UpperArmL', -0.6 * w, 0, 0.5 * w + Math.sin(b) * 0.3 * w); ch._add('ForeArmL', -1.2 * w, 0, 0);
      ch._add('UpperArmR', -0.6 * w, 0, -0.5 * w + Math.sin(b) * 0.3 * w); ch._add('ForeArmR', -1.2 * w, 0, 0);
      const l = Math.max(0, Math.sin(b)), r = Math.max(0, -Math.sin(b));
      ch._add('ThighL', -0.35 * l * w, 0, 0); ch._add('ShinL', 0.55 * l * w, 0, 0);
      ch._add('ThighR', -0.35 * r * w, 0, 0); ch._add('ShinR', 0.55 * r * w, 0, 0);
      ch.bounce = Math.abs(Math.sin(b)) * 0.04 * w;
    },
    end(ch) { ch.bounce = 0; },
  },
  sob: {
    dur: 2.4, channel: 'arms',
    start(ch) { audio.sigh((ch.voice.pitch / 150) * 1.2); },
    update(ch, u) {
      const w = env(u, 0.15, 0.2);
      const hic = Math.max(0, Math.sin(u * 30)) * 0.04;
      ch.touchHead('R', -0.35, -0.05, 1, new THREE.Vector3(0.3, 1, 0), { weight: w, hand: 'open', speed: 30 });
      ch.touchHead('L', 0.35, -0.05, 1, new THREE.Vector3(-0.3, 1, 0), { weight: w, hand: 'open', speed: 30 });
      ch._add('Chest', 0.15 * w - hic, 0, 0);
      ch._add('Head', 0.3 * w, 0, 0);
      ch._add('ShoulderL', 0, 0, hic * 2); ch._add('ShoulderR', 0, 0, -hic * 2);
    },
    end(ch) { ch.release('R'); ch.release('L'); ch.setHand('R', 'relaxed'); ch.setHand('L', 'relaxed'); },
  },
  checkHair: {
    dur: 2.6, channel: 'arms',
    update(ch, u) {
      const w = env(u, 0.2, 0.2);
      const k = Math.sin(u * 6) * 0.5 + 0.5;
      ch.touchHead('R', -0.95, 0.2 + k * 0.3, 0.1 - k * 0.3, new THREE.Vector3(0, 0.6, -0.8), { weight: w, hand: 'open' });
      ch.touchHead('L', 0.95, 0.35, -0.05, new THREE.Vector3(0, 0.6, -0.8), { weight: w, hand: 'open' });
      ch._add('Head', 0, Math.sin(u * Math.PI * 2) * 0.3 * w, 0);
    },
    end(ch) { ch.release('R'); ch.release('L'); ch.setHand('R', 'relaxed'); ch.setHand('L', 'relaxed'); },
  },
};

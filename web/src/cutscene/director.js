// Script timing + camera choreography. Waits run on game time, so pausing freezes
// cutscenes, and a skip unwinds the running script through a SKIP exception.
import * as THREE from 'three';
import { clamp, easeInOut, damp, noise1 } from '../core/util.js';

export const SKIP = Symbol('skip');

export class Director {
  constructor(game) {
    this.game = game;
    this.timers = [];
    this.conds = [];
    this.cancelled = false;
    this.cam = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), tween: null, track: null, fov: 68, fovTarget: 68,
      handheld: 0.6, lookLambda: 6 };
    this._q = new THREE.Quaternion();
  }

  // ---------------------------------------------------------------- timing
  wait(sec) {
    if (this.cancelled) { const p = Promise.reject(SKIP); p.catch(() => {}); return p; }
    const p = new Promise((res, rej) => this.timers.push({ t: sec, res, rej }));
    p.catch(() => {});   // un-awaited waits must not raise on skip
    return p;
  }

  until(fn, timeout = Infinity) {
    if (this.cancelled) { const p = Promise.reject(SKIP); p.catch(() => {}); return p; }
    const p = new Promise((res, rej) => this.conds.push({ fn, res, rej, t: timeout }));
    p.catch(() => {});
    return p;
  }

  check() { if (this.cancelled) throw SKIP; }

  cancel() {
    this.cancelled = true;
    for (const t of this.timers) t.rej(SKIP);
    for (const c of this.conds) c.rej(SKIP);
    this.timers = []; this.conds = [];
  }

  reset() { this.cancelled = false; this.timers = []; this.conds = []; }

  update(dt) {
    if (this.timers.length) {
      const done = [];
      for (const t of this.timers) { t.t -= dt; if (t.t <= 0) done.push(t); }
      if (done.length) { this.timers = this.timers.filter((t) => t.t > 0); done.forEach((t) => t.res()); }
    }
    if (this.conds.length) {
      const done = [];
      for (const c of this.conds) { c.t -= dt; let ok = false; try { ok = c.fn(); } catch (e) { ok = false; } if (ok || c.t <= 0) done.push(c); }
      if (done.length) { this.conds = this.conds.filter((c) => !done.includes(c)); done.forEach((c) => c.res()); }
    }
    this.updateCamera(dt);
  }

  // ---------------------------------------------------------------- camera
  takeCamera(pos, look) {
    const c = this.cam;
    c.active = true;
    c.pos.copy(pos); c.look.copy(look);
    c.curLook = look.clone();
    c.tween = null; c.track = null;
    this.game.player.lookOverride = true;
  }

  releaseCamera() {
    const c = this.cam;
    if (!c.active) return;
    c.active = false;
    const p = this.game.player;
    // hand the camera back to the player with matching yaw/pitch
    const cam = this.game.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    p.yaw = Math.atan2(-dir.x, -dir.z);
    p.pitch = Math.asin(clamp(dir.y, -1, 1));
    p.pos.set(cam.position.x, 0, cam.position.z);
    p.lookOverride = false;
    this.game.camera.fov = 68; this.game.camera.updateProjectionMatrix();
  }

  // move the camera (and/or its look target) over `dur` seconds
  move(pos, look, dur = 1.5, ease = easeInOut) {
    const c = this.cam;
    // a position-only move keeps whatever the camera is tracking
    c.tween = { fromP: c.pos.clone(), toP: pos ? pos.clone() : c.pos.clone(), fromL: c.look.clone(), toL: look ? look.clone() : c.look.clone(), t: 0, dur, ease, keepLook: !look };
    if (look) c.track = null;
    return this.wait(dur);
  }

  // keep looking at a moving thing (Object3D / function / Vector3)
  track(target, lambda = 5) { this.cam.track = target; this.cam.lookLambda = lambda; }

  fov(v) { this.cam.fovTarget = v; }

  updateCamera(dt) {
    const c = this.cam;
    if (!c.active) return;
    if (c.tween) {
      const tw = c.tween;
      tw.t += dt;
      const k = tw.ease(clamp(tw.t / tw.dur, 0, 1));
      c.pos.lerpVectors(tw.fromP, tw.toP, k);
      if (!tw.keepLook) c.look.lerpVectors(tw.fromL, tw.toL, k);
      if (tw.t >= tw.dur) c.tween = null;
    }
    if (c.track) {
      const t = c.track.isObject3D ? c.track.getWorldPosition(new THREE.Vector3()) : (typeof c.track === 'function' ? c.track() : c.track);
      c.look.x = damp(c.look.x, t.x, c.lookLambda, dt);
      c.look.y = damp(c.look.y, t.y, c.lookLambda, dt);
      c.look.z = damp(c.look.z, t.z, c.lookLambda, dt);
    }
    c.curLook ||= c.look.clone();
    c.curLook.lerp(c.look, 1 - Math.exp(-12 * dt));
    const cam = this.game.camera;
    const tt = performance.now() / 1000;
    const hh = c.handheld * (this.game.settings?.reduceMotion ? 0 : 1);
    cam.position.set(c.pos.x + noise1(tt * 0.6) * 0.012 * hh, c.pos.y + noise1(tt * 0.5 + 9) * 0.01 * hh, c.pos.z + noise1(tt * 0.55 + 4) * 0.012 * hh);
    cam.lookAt(c.curLook);
    cam.rotateZ(noise1(tt * 0.4 + 2) * 0.006 * hh);
    if (Math.abs(cam.fov - c.fovTarget) > 0.01) {
      cam.fov = damp(cam.fov, c.fovTarget, 3, dt);
      cam.updateProjectionMatrix();
    }
  }
}

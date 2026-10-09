// One run down the mountain: drives the physics, keeps the visuals, camera, audio
// and HUD in sync, handles pickups, bonuses, records, and ends the run with a payout.

import * as THREE from 'three';
import { Vehicle } from '../physics/vehicle.js';
import { CarModel } from '../models/carModel.js';
import { buildPickup, pickupBeacon } from '../models/props.js';
import { computeStats } from './stats.js';
import { carById } from '../data/cars.js';
import { CATEGORIES, garageEarnMult, repairBonus } from '../data/upgrades.js';
import { SURF, SURF_INFO, STEP } from '../world/track.js';
import { Animals } from '../world/animals.js';
import { EngineVoice, RoadVoice, audio } from '../audio/audio.js';
import { carState } from '../core/save.js';
import { clamp, lerp, damp, fmtMoney, fmtKm, smoothstep } from '../core/util.js';

const V = () => new THREE.Vector3();
const FLAME_GEO = new THREE.ConeGeometry(0.095, 0.62, 12, 1, true).translate(0, -0.31, 0).rotateX(Math.PI);
const FLAME_CORE = new THREE.ConeGeometry(0.05, 0.26, 10, 1, true).translate(0, -0.13, 0).rotateX(Math.PI);
const FLAME_OUT = new THREE.MeshBasicMaterial({ color: 0xff7a24, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const PICK_COLORS = { cash: 0x9fd07a, fuel: 0xe05a3a, repair: 0x5aa0e0, repairL: 0x5aa0e0, rare: 0xe2b04a, crate: 0xe2b04a };

export class Run {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.camMode = game.save.data.settings.camera || 'chase';
    this.camPos = V(); this.camLook = V(); this.camVel = V();
    this.shake = 0;
    this.pickMeshes = new Map();
    this.tmp = { f: V(), u: V(), r: V(), p: V(), q: new THREE.Quaternion() };
  }

  get track() { return this.g.track; }

  // ------------------------------------------------------------------ setup
  start(carId) {
    const g = this.g, sv = g.save.data;
    const car = carById(carId);
    const cs = carState(sv, carId);
    this.car = car;
    this.stats = computeStats(car, cs.levels, cs.tire, sv.garageLevel);
    if (this.model) { g.worldScene.remove(this.model.group); this.model.dispose(); }
    const paint = g.paintFor(car, cs);
    this.model = new CarModel(car, { levels: cs.levels, tire: cs.tire, stats: this.stats, paint: paint.color, finish: paint.finish });
    this.model.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.worldScene.add(this.model.group);
    this.vehicle = new Vehicle(this.track, car, this.stats);
    this.vehicle.assist = sv.settings.assist ? 1 : 0;
    // headlight for tunnels
    this.headlight = g.headlight;
    this.flash = g.flashLight;
    if (this.engine) this.engine.dispose();
    this.engine = null;
    if (audio() && audio().ctx) {
      this.engine = new EngineVoice(audio(), car);
      if (!this.road) this.road = new RoadVoice(audio());
    }
    this.restart(true);
  }

  restart(first = false) {
    const g = this.g, sv = g.save.data;
    const t = this.track;
    t.resetRun();
    g.world.resetRails();
    g.particles.clear(); g.skids.clear(); g.debris.clear();
    for (const o of t.obstacles) for (const c of o.colliders) if (c.x0 !== undefined) { c.x = c.x0; c.y = c.y0; c.z = c.z0; c.vx = c.vy = c.vz = 0; c.hit = false; if (c.mesh) { c.mesh.position.set(c.x0, c.y0 - 0.45, c.z0); c.mesh.rotation.set(0, 0, 0); } }
    this.startS = 30;
    const v = this.vehicle;
    const dbgS = g.debug && g.debug.startS;
    v.reset(dbgS || this.startS, 1.6);
    this.model.resetDamage();
    if (this.model.parts.bumperF.parent !== this.model.group) this.model.group.add(this.model.parts.bumperF);
    if (this.model.parts.bumperR.parent !== this.model.group) this.model.group.add(this.model.parts.bumperR);
    this.mountain = sv.mountain;
    this.best = sv.best[this.mountain] || 0;
    this.maxS = dbgS || this.startS;
    this.runCash = 0;
    this.items = [];
    this.bonus = { shortcuts: 0, stunts: 0, crates: 0 };
    this.collected = new Set();
    this.record = false;
    this.ended = false;
    this.time = 0;
    this.timeScale = 1;
    this.region = -1;
    this.stuckT = 0; this.flipT = 0; this.stopT = 0; this.recoveries = 2;
    this.criticalDistance = 0; this.fumes = false; this.maxAir = 0; this.maxDrift = 0; this.recoveredRoll = false; this.rolled = false;
    this.offRoad = null;
    this.lastS = this.startS;
    this.lastRegionS = 0;
    this.rareParts = [];
    this.topSpeed = 0;
    this.nextKm = 1;
    this.hints = { brake: false, hand: false, turbo: false, cam: false };
    this.rockfallsDone = new Set();
    this.dynamic = [];
    v.dynamic = this.dynamic;
    g.world.resetBreakables();
    if (!this.animals) this.animals = new Animals(g);
    this.animals.reset(this.maxS);
    v.animalCols = this.animals.cols;
    for (const m of this.pickMeshes.values()) g.worldScene.remove(m);
    this.pickMeshes.clear();
    // world streaming around the start
    g.world.update(this.maxS, 30);
    this.active = false;
    this.countdown = true;
    this.camIntro = 0;
    this.placeIntroCamera();
    g.ui.hudInit(this.best, sv.cash);
    g.ui.only('hud', 'touch');
    if (this.engine) { this.engine.setRunning(false); }
    audio()?.music?.setMode('drive');
    audio()?.setReverb(0);
    g.platform.gameplayStart();
    this.go = false;
    const tok = (this.cdToken = (this.cdToken || 0) + 1);
    const startCd = () => {
      if (tok !== this.cdToken) return;
      g.ui.countdown(this.best, (n) => {
        if (tok !== this.cdToken) return;
        audio()?.countdown(n === 'GO');
        if (n === '3' && this.engine) { audio()?.starter(this.car); setTimeout(() => this.engine && this.engine.setRunning(true), 520); }
        if (n === 'GO') { this.go = true; this.active = true; this.countdown = false; this.showStartHints(); }
      });
    };
    // online races line the countdown up with the host's start time
    const delay = this.countdownDelay ? this.countdownDelay() : 0;
    clearTimeout(this.cdTimer);
    let cdStarted = false;
    const startOnce = () => { if (cdStarted) return; cdStarted = true; clearTimeout(this.cdTimer); this.countdownStarted = true; startCd(); };
    this.countdownStarted = false;
    // a race intro may start the countdown early (skip)
    this.startCountdownNow = startOnce;
    if (delay > 50) this.cdTimer = setTimeout(startOnce, delay); else startOnce();
    if (first) audio()?.ui('click');
  }

  showStartHints() {
    const ui = this.g.ui;
    if (this.g.input.isTouch) ui.hint('HOLD <kbd>GAS</kbd> · STEER WITH THE ARROWS', 3500);
    else ui.hint('<kbd>W</kbd> GAS <kbd>S</kbd> BRAKE <kbd>A</kbd><kbd>D</kbd> STEER', 3500);
  }

  placeIntroCamera() {
    const v = this.vehicle, f = v.getForward({});
    const p = v.pos;
    this.camPos.set(p.x + f.x * 7 + f.z * 4, p.y + 1.4, p.z + f.z * 7 - f.x * 4);
    this.camLook.set(p.x, p.y + 0.6, p.z);
  }

  // ------------------------------------------------------------------ frame
  update(rawDt) {
    const g = this.g, v = this.vehicle, t = this.track, ui = g.ui;
    const dt = rawDt * this.timeScale;
    this.time += dt;
    // input
    const inp = g.input.state;
    if (this.active && !this.ended && g.debug && g.debug.bot) this.botDrive();
    else if (this.active && !this.ended) {
      v.input.throttle = inp.throttle; v.input.brake = inp.brake; v.input.steer = inp.steer;
      v.input.handbrake = inp.handbrake; v.input.boost = inp.boost;
    } else {
      // before the start: handbrake only, first gear (a held brake at standstill would engage reverse)
      if (this.ended) { v.input.throttle = 0; v.input.brake = 0.3; v.input.steer = 0; v.input.handbrake = 0; v.input.boost = 0; }
      else { v.input.throttle = 0; v.input.brake = 0; v.input.steer = 0; v.input.handbrake = 1; v.input.boost = 0; v.gear = 1; }
    }
    if (g.input.wasPressed('KeyC')) this.cycleCamera();
    // physics
    if (!this.countdown || this.go) v.update(dt);
    else { v.update(dt * 0.5); v.vel.x = 0; v.vel.z = 0; v.angVel.y = 0; }
    this.updateDynamic(dt);
    if (this.animals) this.animals.update(dt, v, this.maxS);
    // progress
    const q = v.lastQuery;
    if (q.dist < q.halfW + 30 && q.s > this.maxS && Math.abs(v.pos.y - t.roadY(q.s)) < 12) {
      const jump = q.s - this.maxS;
      if (jump > 70 && this.active) this.shortcutTaken(jump);
      this.maxS = q.s;
    }
    const dist = this.maxS - this.startS;
    // record
    if (!this.record && this.best > 50 && dist > this.best && this.active) {
      this.record = true;
      ui.notice('NEW RECORD', fmtKm(dist) + ' KM', true, 2400);
      audio()?.record();
      this.shake = Math.max(this.shake, 0.15);
    }
    this.handleEvents();
    this.syncModel(rawDt);
    this.effects(dt);
    this.updatePickups();
    this.updateCamera(rawDt);
    this.regionCheck();
    this.hazards();
    this.bonuses(dt);
    this.audio(dt);
    this.hud(rawDt);
    if (this.active && !this.ended) this.checkEnd(dt);
    g.world.update(this.maxS, 1);
  }

  // debug autopilot (?bot) used by the automated browser tests
  botDrive() {
    const v = this.vehicle, t = this.track, s = v.lastQuery.s;
    let lane = 1.4;
    for (const o of t.obstacles) if (o.s > s && o.s < s + 60 && Math.abs(o.d - lane) < 3.2) { const span = (o.len || o.r * 2) + 1.6; lane = o.d > 0 ? o.d - span : o.d + span; }
    const tgt = t.posAt(s + 8 + v.speed * 0.6, lane);
    const f = v.getForward({});
    let a = Math.atan2(tgt.x - v.pos.x, tgt.z - v.pos.z) - Math.atan2(f.x, f.z);
    while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
    let kmax = 0;
    for (let u = 0; u < 20 + v.speed * 3; u += 4) kmax = Math.max(kmax, Math.abs(t.k[Math.min(t.N - 1, Math.round((s + u) / STEP))]));
    const vt = Math.min(38, Math.sqrt(0.7 * 9.81 * v.p.mu / Math.max(kmax, 1e-3)));
    v.input.steer = clamp(a * 2.2, -1, 1);
    v.input.throttle = v.speed < vt ? 1 : 0;
    v.input.brake = v.speed > vt + 2 ? 1 : 0;
    v.input.handbrake = 0; v.input.boost = 0;
  }

  cycleCamera() {
    const modes = ['chase', 'far', 'hood', 'cockpit'];
    this.camMode = modes[(modes.indexOf(this.camMode) + 1) % modes.length];
    this.g.save.data.settings.camera = this.camMode; this.g.save.save();
    this.g.ui.notice(this.camMode === 'cockpit' ? 'FIRST PERSON' : this.camMode.toUpperCase(), 'CAMERA', false, 900);
  }

  // ------------------------------------------------------------------ events
  handleEvents() {
    const v = this.vehicle, g = this.g, m = this.model, a = audio();
    for (const e of v.events) {
      switch (e.type) {
        case 'impact': {
          const k = clamp((e.speed - 2) / 14, 0, 1);
          a && a.impact(e.speed, e.kind);
          if (e.speed > 4) {
            this.shake = Math.max(this.shake, k * 0.55 * this.g.save.data.settings.shake);
            g.particles.sparks(e.x, e.y, e.z, v.vel.x, 1, v.vel.z, Math.round(4 + k * 18));
            if (e.kind === 'ground' || e.kind === 'object') g.particles.debris(e.x, e.y, e.z, v.vel.x, 1, v.vel.z, 4, [0.35, 0.3, 0.25]);
          }
          break;
        }
        case 'damage':
          if (e.amount > 0.01 && e.zone !== 'susp') m.dent(e.lx, e.ly, e.lz, e.amount * 1.6);
          this.checkDetach();
          m.syncDamage(v.dmg);
          break;
        case 'smash': this.smashEvent(e, true); break;
        case 'nitro': this.nitroIgnite(m, v, true); break;
        case 'glass': a && a.glass(); { const p = this.model.group.position; g.particles.glass(p.x, p.y + 0.8, p.z, v.vel.x, 1, v.vel.z); } break;
        case 'bottom': a && a.thump(clamp(e.speed / 8, 0, 1)); this.shake = Math.max(this.shake, clamp(e.speed / 20, 0, 0.3) * this.g.save.data.settings.shake); break;
        case 'land':
          this.maxAir = Math.max(this.maxAir, e.air);
          if (e.air > 0.9 && this.active) { const b = Math.round(e.air * 60 / 5) * 5; this.bonus.stunts += b; this.runCash += b; g.ui.feed(`AIRTIME ${e.air.toFixed(1)}s`, b); }
          break;
        case 'shift': a && a.shift(); break;
        case 'blowoff': this.engine && this.engine.blowoff(e.amount); break;
        case 'railbreak': {
          const mesh = g.world.breakRail(e.idx, e.side);
          if (mesh) {
            const clone = mesh.clone(); clone.geometry = mesh.geometry.clone();
            g.debris.add(clone, new THREE.Vector3(v.vel.x * 0.4, 2, v.vel.z * 0.4), new THREE.Vector3(Math.random(), Math.random() * 2, Math.random()));
          }
          a && a.metal(1, 200);
          g.ui.notice('GUARD RAIL GONE', '', false, 1200);
          break;
        }
        case 'stall': a && a.burst({ freq: 200, type: 'lowpass', dur: 0.4, gain: 0.3, buf: a.brown }); this.engine && this.engine.setRunning(false); break;
        case 'engineCritical': g.ui.notice('ENGINE CRITICAL', 'POWER REDUCED', true, 2000); break;
        case 'engineDead': g.ui.notice('ENGINE DEAD', e.why === 'heat' ? 'OVERHEATED' : 'COASTING', true, 2400); break;
        case 'misfire': a && a.burst({ freq: 500, q: 0.7, type: 'lowpass', dur: 0.08, gain: 0.5, buf: a.brown, bus: a.engBus }); break;
        default: break;
      }
    }
    v.events.length = 0;
  }

  // something breakable was hit (by the player or any other car)
  smashEvent(e, isPlayer) {
    const g = this.g, a = audio(), o = e.o;
    const sp = e.speed;
    const near = isPlayer ? 1 : clamp(1 - Math.hypot(o.x - this.vehicle.pos.x, o.z - this.vehicle.pos.z) / 80, 0, 1);
    if (o.animal) {
      // a short, sharp explosion: flash, fireball, smoke, tufts -- and the animal is gone
      this.animals && this.animals.explode(o);
      this.explosion(o.x, o.y + 0.3, o.z, e.vx, e.vz, o.animal.kind === 'cow' ? 1.3 : o.animal.kind === 'fox' ? 0.6 : 1, near);
      if (isPlayer) this.shake = Math.max(this.shake, 0.35 * g.save.data.settings.shake);
      return;
    }
    const parts = g.world.smash(o);
    const dir = new THREE.Vector3(e.vx, 0, e.vz).normalize();
    for (const grp of parts) {
      grp.userData.groundOff = 0;
      if (o.kind === 'sapling') {
        // snaps and topples away from the car
        const axis = new THREE.Vector3(dir.z, 0, -dir.x);
        g.debris.add(grp, new THREE.Vector3(e.vx * 0.15, 1.5, e.vz * 0.15), axis.multiplyScalar(2.5 + Math.min(4, sp * 0.08)));
      } else {
        const up = 2 + Math.min(6, sp * 0.15);
        g.debris.add(grp, new THREE.Vector3(e.vx * 0.55 + (Math.random() - 0.5) * 3, up, e.vz * 0.55 + (Math.random() - 0.5) * 3),
          new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8));
      }
    }
    const leaf = o.kind === 'fence' ? [0.42, 0.36, 0.28] : [0.3, 0.38, 0.18];
    g.particles.debris(o.x, o.y, o.z, e.vx * 0.5, 2, e.vz * 0.5, o.kind === 'fence' ? 10 : 14, leaf);
    if (a && near > 0.05) { a.thump(clamp(sp / 30, 0.2, 0.8) * near); a.burst({ freq: o.kind === 'fence' ? 900 : 2400, q: 0.8, dur: 0.25, gain: 0.25 * near, type: 'bandpass', buf: a.pink }); }
    if (isPlayer) this.shake = Math.max(this.shake, 0.12 * g.save.data.settings.shake);
  }

  explosion(x, y, z, vx, vz, size = 1, vol = 1) {
    const g = this.g, P = g.particles, a = audio();
    // flash
    if (!this.flash) this.flash = g.flashLight;
    this.flash.position.set(x, y + 1, z); this.flash.intensity = 900 * size; this.flashT = 0.25;
    // fireball + sparks + smoke + tufts
    for (let i = 0; i < 46 * size; i++) {
      const r = Math.random(), th = Math.random() * 6.283, ph = Math.random() * 3.14;
      const sp = (4 + Math.random() * 9) * size;
      P.glow.emit(x, y, z, vx * 0.35 + Math.cos(th) * Math.sin(ph) * sp, Math.abs(Math.cos(ph)) * sp * 0.8 + 2, vz * 0.35 + Math.sin(th) * Math.sin(ph) * sp,
        0.35 + r * 0.35, 0.9 * size, 0.2, 1, 1, 0.45 + r * 0.35, 0.08, -2, 3);
    }
    P.sparks(x, y, z, vx * 0.4, 3, vz * 0.4, Math.round(30 * size));
    for (let i = 0; i < 10 * size; i++) P.smoke(x + (Math.random() - 0.5) * 2, y + Math.random(), z + (Math.random() - 0.5) * 2, vx * 0.2 + (Math.random() - 0.5) * 4, 2 + Math.random() * 3, vz * 0.2 + (Math.random() - 0.5) * 4, true, 1.6 * size);
    P.debris(x, y, z, vx * 0.5, 4, vz * 0.5, Math.round(16 * size), [0.75, 0.7, 0.62]);
    if (a && vol > 0.02) {
      a.burst({ freq: 90, type: 'lowpass', dur: 0.9, gain: 0.55 * vol, buf: a.brown, attack: 0.002 });
      a.burst({ freq: 1400, q: 0.5, type: 'bandpass', dur: 0.35, gain: 0.3 * vol, buf: a.white });
      a.thump(0.9 * vol);
    }
  }

  // nitro fired: kick, whoosh and a burst of flame
  nitroIgnite(m, v, isPlayer) {
    const a = audio(), P = this.g.particles;
    const fw = v.getForward(this.tmp.f);
    for (const tip of m.exhaustTips) {
      const ep = m.group.localToWorld(this.tmp.p.copy(tip));
      for (let i = 0; i < 18; i++) P.glow.emit(ep.x, ep.y, ep.z, v.vel.x - fw.x * (8 + Math.random() * 8), Math.random(), v.vel.z - fw.z * (8 + Math.random() * 8), 0.25, 0.8, 0.15, 1, 0.7, 0.35, 0.1, 0, 2);
    }
    if (isPlayer) {
      this.fovKick = 1;
      this.shake = Math.max(this.shake, 0.3 * this.g.save.data.settings.shake);
      if (a) {
        a.burst({ freq: 600, q: 0.4, type: 'bandpass', dur: 1.1, gain: 0.32, buf: a.white, attack: 0.03 });
        a.burst({ freq: 70, type: 'lowpass', dur: 0.8, gain: 0.45, buf: a.brown });
      }
      this.g.ui.feed('TURBO', 0);
    }
  }

  // flames out of the exhaust while the nitro burns
  flames(m, v, dt, isPlayer) {
    const P = this.g.particles;
    const fw = v.getForward(this.tmp.f);
    if (!m.flameMeshes) {
      m.flameMeshes = m.exhaustTips.map((tip) => {
        const grp = new THREE.Group();
        // orange plume, white-blue core and a short shock diamond at the mouth
        const outer = new THREE.Mesh(FLAME_GEO, FLAME_OUT), inner = new THREE.Mesh(FLAME_GEO, FLAME_IN), core = new THREE.Mesh(FLAME_CORE, FLAME_IN);
        inner.scale.set(0.5, 0.55, 0.5);
        grp.add(outer, inner, core);
        grp.userData.parts = [outer, inner, core];
        grp.position.copy(tip); grp.position.z -= 0.08;
        grp.rotation.x = -Math.PI / 2;
        m.group.add(grp);
        return grp;
      });
    }
    const on = v.nitroT > 0;
    for (const f of m.flameMeshes) {
      f.visible = on;
      if (on) {
        // licking, uneven flame: length and width flicker every frame, longest in the first second
        const fresh = 1 + Math.max(0, v.nitroT - 3) * 0.5;
        const k = (0.75 + Math.random() * 0.45) * fresh;
        f.scale.set(0.9 + Math.random() * 0.25, k, 0.9 + Math.random() * 0.25);
        const [o, i, c] = f.userData.parts;
        o.rotation.y = Math.random() * 6.28; i.scale.y = 0.45 + Math.random() * 0.2; c.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      }
    }
    if (!on) return;
    for (const tip of m.exhaustTips) {
      const ep = m.group.localToWorld(this.tmp.p.copy(tip));
      if (Math.random() < dt * 60) P.glow.emit(ep.x, ep.y, ep.z, v.vel.x - fw.x * 9, 0.4, v.vel.z - fw.z * 9, 0.14, 0.55, 0.1, 1, 0.55 + Math.random() * 0.3, 0.25, 0.08, 0, 2);
      // embers and heat puffs trailing behind
      if (Math.random() < dt * 25) P.glow.emit(ep.x, ep.y, ep.z, v.vel.x * 0.6 - fw.x * 4 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), v.vel.z * 0.6 - fw.z * 4 + (Math.random() - 0.5) * 2, 0.35, 0.09, 0.03, 1, 1, 0.55, 0.2, 2, 1);
    }
    if (isPlayer && this.flash) { this.flash.position.copy(m.group.localToWorld(this.tmp.p.copy(m.exhaustTips[0]))); this.flash.intensity = Math.max(this.flash.intensity, 18 + Math.random() * 14); this.flashT = Math.max(this.flashT || 0, 0.05); }
  }

  checkDetach() {
    const v = this.vehicle, g = this.g;
    for (const [name, k] of [['bumperF', 'bumperF'], ['bumperR', 'bumperR']]) {
      if (v.dmg[k] <= 0.02) {
        const piece = this.model.detach(name);
        if (piece) {
          g.debris.add(piece, new THREE.Vector3(v.vel.x * 0.7, 1.5, v.vel.z * 0.7), new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3));
          audio()?.metal(0.6, 260);
          g.ui.feed(name === 'bumperF' ? 'LOST THE FRONT BUMPER' : 'LOST THE REAR BUMPER');
        }
      }
    }
  }

  // ------------------------------------------------------------------ visuals
  syncModel() {
    const v = this.vehicle, m = this.model;
    m.group.position.set(v.pos.x, v.pos.y, v.pos.z);
    m.group.quaternion.set(v.q.x, v.q.y, v.q.z, v.q.w);
    m.updateFromVehicle(v, 1 / 60);
    m.lightsOn = this.g.env.tunnel > 0.2;
    // headlight
    const f = v.getForward(this.tmp.f);
    const hp = this.headlight;
    hp.position.set(v.pos.x + f.x * 2, v.pos.y + 0.4, v.pos.z + f.z * 2);
    hp.target.position.set(v.pos.x + f.x * 20, v.pos.y - 1.5, v.pos.z + f.z * 20);
    const lights = (v.dmg.lightL + v.dmg.lightR) / 2;
    hp.intensity = this.g.env.tunnel * 120 * clamp(lights * 1.5, 0, 1);
  }

  effects(dt) {
    const v = this.vehicle, g = this.g, P = g.particles;
    const speed = v.speed;
    // dirt build-up
    let dirty = 0;
    for (const w of v.wheels) {
      if (!w.contact) { g.skids.add(w.i, 0, 0, 0, 0, 0, 0, 0); continue; }
      const si = SURF_INFO[w.surf];
      const cy = w.gy - v.p.r + 0.02;
      const right = v.getRight(this.tmp.r);
      // tyre marks: slip on paved, ruts on loose
      const mark = si.group === 0 ? clamp(w.slip * 1.2, 0, 1) : si.group > 0 ? clamp(0.18 + speed / 60 + w.slip * 0.5, 0, 0.7) * (speed > 1 ? 1 : 0) : 0;
      g.skids.add(w.i, w.gx, cy, w.gz, right.x, right.z, this.model.wheelWidth * 0.8, mark * (si.group === 3 ? 0.6 : 1));
      if (si.dust && speed > 4) {
        const col = si.snow ? null : g.env.look ? g.env.look.dirt : new THREE.Color(0x8a7a60);
        if (si.snow) { if (Math.random() < si.dust * dt * 30) P.snowSpray(w.gx, cy, w.gz, v.vel.x, v.vel.z); }
        else P.dust(w.gx, cy, w.gz, v.vel.x, v.vel.z, si.dust * dt * clamp(speed / 6, 0, 3) * 3, col);
        dirty += si.dust;
      }
      if (si.splash && speed > 3 && Math.random() < dt * 25) P.splash(w.gx, cy, w.gz, v.vel.x, v.vel.z, w.surf === SURF.MUD), dirty += 3;
      if (si.group === 0 && w.slip > 0.45 && speed > 3 && Math.random() < dt * 30 * w.slip) P.tireSmoke(w.gx, cy, w.gz, v.vel.x, v.vel.z);
    }
    const m = this.model;
    m.wear.dirt = Math.min(1, m.wear.dirt + dirty * dt * 0.004);
    // engine smoke / fire
    const eh = v.dmg.engine;
    if (eh < 0.55 || v.heat > 1.02) {
      const ep = m.group.localToWorld(this.tmp.p.copy(m.enginePos));
      if (Math.random() < dt * (eh < 0.25 ? 26 : 10)) P.smoke(ep.x, ep.y, ep.z, v.vel.x * 0.8, 0, v.vel.z * 0.8, eh < 0.3, eh < 0.25 ? 1.4 : 0.9);
      if (eh <= 0.05 && Math.random() < dt * 12) P.glow.emit(ep.x, ep.y, ep.z, (Math.random() - 0.5), 1.5, (Math.random() - 0.5), 0.35, 0.5, 0.1, 0.8, 1, 0.45, 0.12, -1, 1);
    }
    // exhaust puffs
    if (v.engineOn && !v.stalled && Math.random() < dt * (3 + v.input.throttle * 8)) {
      for (const tip of m.exhaustTips) {
        const ep = m.group.localToWorld(this.tmp.p.copy(tip));
        P.soft.emit(ep.x, ep.y, ep.z, v.vel.x * 0.9, 0.2, v.vel.z * 0.9, 0.9, 0.15, 0.9, 0.12 + (1 - eh) * 0.25, 0.5, 0.5, 0.5, -0.2, 2);
      }
    }
    // nitro flames + explosion flash decay
    this.flames(m, v, dt, true);
    if (this.flash) { this.flashT = (this.flashT || 0) - dt; this.flash.intensity = this.flashT > 0 ? this.flash.intensity * 0.88 : 0; }
    // scraping sparks
    if (v.scrape > 0.3 && speed > 4) { const p = v.pos; P.sparks(p.x, p.y - v.p.cg * 0.6, p.z, v.vel.x, 0.5, v.vel.z, 2); }
    // falling rocks visuals
    for (const r of this.dynamic) if (r.mesh) { r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.x += r.vz * dt; r.mesh.rotation.z -= r.vx * dt; }
    // cherry blossom petals drifting through the air on the sakura maps
    if (this.petalTrack !== this.track) { this.petalTrack = this.track; this.petals = this.track.m.biomes.some((b) => b.look && b.look.cherry); }
    if (this.petals && dt > 0) {
      const cam = g.camera.position, fw = v.getForward(this.tmp.f);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.283, rr = 4 + Math.random() * 22;
        const x = cam.x + fw.x * 14 + Math.cos(a) * rr, z = cam.z + fw.z * 14 + Math.sin(a) * rr;
        const c = 0.9 + Math.random() * 0.1;
        P.soft.emit(x, cam.y + 2 + Math.random() * 6, z, 0.6 + Math.random() * 0.8, -0.5 - Math.random() * 0.4, (Math.random() - 0.5) * 0.8,
          4 + Math.random() * 2, 0.07, 0.07, 0.85, c, c * 0.74, c * 0.82, 0.12, 0.25);
      }
    }
    // waterfall mist
    P.setScale(g.renderer.domElement.height);
    P.update(dt);
    g.debris.update(dt);
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt) {
    const g = this.g, v = this.vehicle, cam = g.camera, m = this.model;
    const f = v.getForward(this.tmp.f), up = v.getUp(this.tmp.u);
    const speed = v.speed;
    const p = v.pos;
    const flatF = new THREE.Vector3(f.x, 0, f.z).normalize();
    // heading the camera follows: blend between car nose and travel direction
    const velDir = new THREE.Vector3(v.vel.x, 0, v.vel.z);
    if (speed > 6 && v.fwdSpeed > 0) { velDir.normalize(); flatF.lerp(velDir, 0.35).normalize(); }
    if (v.gear === -1 && v.fwdSpeed < -2 && !this.countdown) flatF.negate().lerp(new THREE.Vector3(f.x, 0, f.z).normalize(), 0.0);
    const len = m.dims.L;
    const air = v.wheelsOnGround === 0 ? 1 : 0;
    this.airCam = damp(this.airCam || 0, air, 2, dt);
    let fov = 60 + clamp((speed * 3.6 - 40) / 140, 0, 1) * 14;
    const ck = this.camMode === 'cockpit' && !this.countdown;
    if (m.cockpit !== ck) {
      m.cockpit = ck;
      document.body.classList.toggle('cockpit', ck);
      // clearer glass from the inside
      if (m.glassMat) { m.glassMat.opacity = ck ? 0.16 : 0.72; }
    }
    if (this.camMode === 'chase' || this.camMode === 'far' || this.countdown) {
      const far = this.camMode === 'far';
      const back = (far ? 8.8 : 4.4 + len * 0.36) + this.airCam * 1.6 + clamp(speed / 40, 0, 1) * 0.8;
      const height = (far ? 3.3 : 1.55 + m.dims.H * 0.32) + this.airCam * 0.8;
      let want = new THREE.Vector3(p.x - flatF.x * back, p.y + height, p.z - flatF.z * back);
      let look = new THREE.Vector3(p.x + flatF.x * 3.5, p.y + 0.75 + m.dims.H * 0.15, p.z + flatF.z * 3.5);
      // look a little where the car is going (into the corner), not only where it points
      if (speed > 3 && !this.countdown) {
        const la = Math.min(6, speed * 0.12) / Math.max(speed, 1e-3);
        look.x += v.vel.x * la; look.z += v.vel.z * la;
      }
      if (this.countdown) {
        // intro: start beside the car, swing in behind
        this.camIntro = Math.min(1, this.camIntro + dt * (this.go ? 1.2 : 0.22));
        const k = smoothstep(0, 1, this.camIntro);
        const side = new THREE.Vector3(p.x + flatF.x * 6 + flatF.z * 4.5, p.y + 1.3, p.z + flatF.z * 6 - flatF.x * 4.5);
        want = side.lerp(want, k);
        look.lerp(new THREE.Vector3(p.x, p.y + 0.5, p.z), 1 - k);
      }
      const lam = this.countdown ? 3 : 7;
      this.camPos.x = damp(this.camPos.x, want.x, lam, dt);
      this.camPos.z = damp(this.camPos.z, want.z, lam, dt);
      this.camPos.y = damp(this.camPos.y, want.y, lam * 0.8, dt);
      this.camLook.x = damp(this.camLook.x, look.x, 12, dt); this.camLook.y = damp(this.camLook.y, look.y, 8, dt); this.camLook.z = damp(this.camLook.z, look.z, 12, dt);
      // terrain + tunnel clearance
      const th = this.track.height(this.camPos.x, this.camPos.z);
      if (this.camPos.y < th + 0.7) this.camPos.y = th + 0.7;
      // keep the line of sight to the car clear of slopes: pull in where the ground blocks it
      if (!this.countdown) {
        const hx = p.x, hy = p.y + 1.0, hz = p.z;
        for (let k = 0.35; k <= 0.95; k += 0.2) {
          const px = lerp(hx, this.camPos.x, k), pz = lerp(hz, this.camPos.z, k), py = lerp(hy, this.camPos.y, k);
          const gh = this.track.height(px, pz);
          if (py < gh + 0.35) {
            const kk = Math.max(0.3, k - 0.2);
            this.camPos.x = lerp(hx, this.camPos.x, kk); this.camPos.z = lerp(hz, this.camPos.z, kk);
            this.camPos.y = Math.max(lerp(hy, this.camPos.y, kk), gh + 0.6);
            break;
          }
        }
      }
      const cq = this.track.query(this.camPos.x, this.camPos.z, this.camQ || (this.camQ = {}));
      if (this.track.tunnel[cq.idx] && Math.abs(cq.d) < cq.halfW + 1.5) this.camPos.y = Math.min(this.camPos.y, this.track.roadY(cq.s) + 4.2);
      // keep the camera at a sensible distance after crashes / flips
      const dx = this.camPos.x - p.x, dz = this.camPos.z - p.z, dd = Math.hypot(dx, dz);
      if (dd > back * 2.2) { this.camPos.x = p.x + dx / dd * back * 2.2; this.camPos.z = p.z + dz / dd * back * 2.2; }
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      m.parts.interior.visible = (this.g.save.data.cars[this.car.id]?.levels?.weight || 0) < 9;
      m.group.visible = true;
    } else {
      const eye = this.camMode === 'hood' ? m.hoodEye : m.eye;
      const fp = this.camMode === 'cockpit';
      // head sways with the g-forces and looks a little into the corner
      const hb = this.head || (this.head = { x: 0, y: 0, z: 0, yaw: 0 });
      // local acceleration from the velocity change (x left, y up, z forward)
      const pv = this.prevVel || (this.prevVel = new THREE.Vector3(v.vel.x, v.vel.y, v.vel.z));
      const ax = (v.vel.x - pv.x) / Math.max(dt, 1e-3), ay = (v.vel.y - pv.y) / Math.max(dt, 1e-3), az = (v.vel.z - pv.z) / Math.max(dt, 1e-3);
      pv.set(v.vel.x, v.vel.y, v.vel.z);
      const rgt = this.tmp.r || (this.tmp.r = new THREE.Vector3());
      rgt.crossVectors(up, f).normalize();
      const acc = dt > 0 ? { x: ax * rgt.x + ay * rgt.y + az * rgt.z, y: ax * up.x + ay * up.y + az * up.z, z: ax * f.x + ay * f.y + az * f.z } : { x: 0, y: 0, z: 0 };
      hb.x = damp(hb.x, clamp(-(acc.x || 0) * 0.006, -0.06, 0.06), 6, dt);
      hb.z = damp(hb.z, clamp(-(acc.z || 0) * 0.004, -0.05, 0.05), 6, dt);
      hb.y = damp(hb.y, clamp(-(acc.y || 0) * 0.002, -0.03, 0.03), 9, dt);
      hb.yaw = damp(hb.yaw, (v.wheels[0].steer + v.wheels[1].steer) * 0.5 * 0.9, 4, dt);
      const ex = eye[0] + (fp ? hb.x : 0), ey = eye[1] + (fp ? hb.y : 0), ez = eye[2] + (fp ? hb.z : 0);
      const wp = m.group.localToWorld(new THREE.Vector3(ex, ey, ez));
      cam.position.copy(wp);
      const ya = fp ? hb.yaw : 0;
      const ahead = m.group.localToWorld(new THREE.Vector3(ex - (fp ? 0.05 : eye[0] * 0.4) + Math.sin(ya) * 20, ey - (fp ? 1.1 : 0.15), ez + Math.cos(ya) * 20));
      cam.up.set(up.x * 0.25, 1, up.z * 0.25).normalize();
      cam.lookAt(ahead);
      cam.up.set(0, 1, 0);
      fov = this.camMode === 'cockpit' ? 72 : 66;
    }
    // shake
    if (this.shake > 0) {
      const s = this.shake;
      cam.position.x += (Math.random() - 0.5) * s * 0.5; cam.position.y += (Math.random() - 0.5) * s * 0.5; cam.position.z += (Math.random() - 0.5) * s * 0.5;
      this.shake = Math.max(0, this.shake - dt * 1.4);
    }
    // subtle high-speed vibration
    const hs = clamp((speed - 25) / 40, 0, 1) * 0.012 * this.g.save.data.settings.shake;
    cam.position.y += (Math.random() - 0.5) * hs;
    this.fovKick = Math.max(0, (this.fovKick || 0) - dt * 0.8);
    if (v.nitroT > 0 && (this.camMode === 'chase' || this.camMode === 'far')) fov += 9 + this.fovKick * 8;
    cam.fov = damp(cam.fov, fov, v.nitroT > 0 ? 5 : 3, dt);
    cam.near = this.camMode === 'cockpit' || this.camMode === 'hood' ? 0.05 : 0.15;
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ pickups
  updatePickups() {
    const g = this.g, t = this.track, v = this.vehicle;
    const s = this.maxS;
    // spawn visuals ahead, remove behind
    for (let i = 0; i < t.pickups.length; i++) {
      const pk = t.pickups[i];
      const key = i;
      const inRange = pk.s > s - 60 && pk.s < s + 380 && !this.collected.has(key);
      const mesh = this.pickMeshes.get(key);
      if (inRange && !mesh) {
        const grp = new THREE.Group();
        const item = buildPickup(pk.type);
        grp.add(item);
        grp.add(pickupBeacon(PICK_COLORS[pk.type]));
        grp.position.set(pk.x, pk.y + 0.05, pk.z);
        grp.userData = { item, pk, key, phase: Math.random() * 6 };
        g.worldScene.add(grp);
        this.pickMeshes.set(key, grp);
      } else if (!inRange && mesh) {
        g.worldScene.remove(mesh);
        this.pickMeshes.delete(key);
      }
    }
    // animate + collect
    const cp = v.pos;
    for (const [key, grp] of this.pickMeshes) {
      const u = grp.userData;
      u.item.rotation.y += 0.02;
      u.item.position.y = 0.15 + Math.sin(this.time * 2 + u.phase) * 0.08;
      const dx = grp.position.x - cp.x, dy = grp.position.y + 0.4 - cp.y, dz = grp.position.z - cp.z;
      if (dx * dx + dz * dz < 5.5 && Math.abs(dy) < 2.6 && !this.ended) this.collect(key, grp);
    }
  }

  collect(key, grp) {
    const g = this.g, v = this.vehicle, pk = grp.userData.pk;
    this.collected.add(key);
    g.worldScene.remove(grp);
    this.pickMeshes.delete(key);
    audio()?.pickup(pk.type);
    const col = new THREE.Color(PICK_COLORS[pk.type]);
    g.particles.burst(grp.position.x, grp.position.y, grp.position.z, [col.r, col.g, col.b], 26);
    const depth = pk.s / 1000;
    const sv = g.save.data;
    switch (pk.type) {
      case 'cash': { const amt = Math.round((40 + depth * 14) / 5) * 5; this.runCash += amt; g.ui.feed('CASH', amt); break; }
      case 'crate': { const amt = Math.round((300 + depth * 70) / 10) * 10; this.runCash += amt; this.bonus.crates += amt; g.ui.feed('BONUS CRATE', amt); break; }
      case 'fuel': {
        if (v.fuel < 1) this.fumes = true;
        const add = 9;
        v.fuel = Math.min(v.p.fuel, v.fuel + add);
        if (v.fuel > 0 && v.dmg.engine > 0 && v.stalled) { v.stalled = false; v.engineOn = true; this.engine && this.engine.setRunning(true); }
        g.ui.feed(`FUEL +${add} L`);
        break;
      }
      case 'repair': v.repair(0.25 * repairBonus(sv.garageLevel)); this.model.syncDamage(v.dmg); g.ui.feed('REPAIR KIT'); this.engine && !v.stalled && this.engine.setRunning(true); break;
      case 'repairL': v.repair(0.6 * repairBonus(sv.garageLevel)); this.model.syncDamage(v.dmg); g.ui.feed('LARGE REPAIR KIT'); this.engine && !v.stalled && this.engine.setRunning(true); break;
      case 'rare': {
        const cs = carState(sv, this.car.id);
        const open = CATEGORIES.filter((c) => (cs.levels[c.id] || 0) < this.car.caps[c.id] + (sv.garageLevel >= 4 ? 2 : 0) + (sv.garageLevel >= 5 ? 2 : 0));
        if (open.length) {
          const c = open[Math.floor(Math.random() * open.length)];
          this.rareParts.push(c.id);
          g.ui.notice('RARE PART', c.name + ' +1 LEVEL', true, 2200);
        } else { this.runCash += 2500; g.ui.feed('RARE PART (SOLD)', 2500); }
        break;
      }
      default: break;
    }
  }

  shortcutTaken(jump) {
    const amt = Math.round((150 + jump * 2.2) / 10) * 10;
    this.runCash += amt; this.bonus.shortcuts += amt;
    this.g.save.data.stats.shortcuts++;
    this.g.ui.feed('SHORTCUT', amt);
    audio()?.pickup('crate');
  }

  // ------------------------------------------------------------------ hazards
  hazards() {
    const t = this.track, v = this.vehicle, g = this.g;
    for (const rf of t.rockfalls) {
      if (this.rockfallsDone.has(rf) || this.maxS < rf.s - 70 || this.maxS > rf.s) continue;
      this.rockfallsDone.add(rf);
      // a few boulders tumble off the wall ahead of the car
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const s = rf.s + 15 + i * 6 + Math.random() * 8;
        const j = Math.round(s / STEP);
        const d = rf.side * (t.width[j] / 2 + 6 + Math.random() * 4);
        const p = t.posAt(s, d);
        const r = 0.5 + Math.random() * 0.6;
        const mesh = new THREE.Mesh(g.rockGeo || (g.rockGeo = new THREE.DodecahedronGeometry(1, 1)), g.rockMat || (g.rockMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95, flatShading: true })));
        mesh.scale.setScalar(r); mesh.castShadow = true;
        g.worldScene.add(mesh);
        const inward = -rf.side;
        this.dynamic.push({ t: 's', x: p.x, y: p.y + 6 + Math.random() * 5, z: p.z, r, m: 900 * r * r * r, vx: t.rx[j] * inward * (4 + Math.random() * 3), vy: 0, vz: t.rz[j] * inward * (4 + Math.random() * 3), mesh, life: 12, rock: true });
      }
      audio()?.burst({ freq: 140, q: 0.4, type: 'lowpass', dur: 2.2, gain: 0.5, buf: audio().brown });
      g.ui.notice('ROCKFALL', '', true, 1500);
    }
  }

  updateDynamic(dt) {
    const t = this.track;
    for (let i = this.dynamic.length - 1; i >= 0; i--) {
      const r = this.dynamic[i];
      r.life -= dt;
      r.vy -= 9.8 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      const h = t.height(r.x, r.z) + r.r;
      if (r.y < h) { r.y = h; if (r.vy < 0) r.vy = -r.vy * 0.35; r.vx *= 0.985; r.vz *= 0.985; }
      if (r.life <= 0) { if (r.mesh) this.g.worldScene.remove(r.mesh); this.dynamic.splice(i, 1); }
    }
    // knocked-over barrels
    for (const o of t.obstacles) for (const c of o.colliders) {
      if (!c.hit || c.vx === undefined) continue;
      c.vy -= 9.8 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      const h = t.height(c.x, c.z) + 0.4;
      if (c.y < h) { c.y = h; c.vy *= -0.3; c.vx *= 0.9; c.vz *= 0.9; }
      if (c.mesh) { c.mesh.position.set(c.x, c.y - 0.45, c.z); c.mesh.rotation.z += c.vx * dt * 0.5; c.mesh.rotation.x += c.vz * dt * 0.5; }
    }
  }

  // ------------------------------------------------------------------ bonuses, regions
  bonuses(dt) {
    const v = this.vehicle;
    this.maxDrift = Math.max(this.maxDrift, v.drift);
    if (v.drift > 1.5 && !this.drifting) this.drifting = true;
    if (this.drifting && v.drift < 0.2) {
      this.drifting = false;
      const secs = this.lastDrift || 0;
      if (secs > 1.5 && this.active) { const b = Math.round(secs * 40 / 5) * 5; this.bonus.stunts += b; this.runCash += b; this.g.ui.feed(`DRIFT ${secs.toFixed(1)}s`, b); }
    }
    this.lastDrift = v.drift;
    if (v.dmg.engine < 0.25 && v.dmg.engine > 0) this.criticalDistance += v.speed * dt;
    const up = v.getUp(this.tmp.u);
    if (up.y < 0.1) this.rolled = true;
    if (this.rolled && up.y > 0.9 && v.wheelsOnGround >= 3 && v.speed > 3 && !this.recoveredRoll) { this.recoveredRoll = true; this.g.ui.feed('SHINY SIDE UP'); }
    this.topSpeed = Math.max(this.topSpeed, v.kmh);
    // contextual hints, once
    const H = this.hints, ui = this.g.ui, touch = this.g.input.isTouch;
    if (!H.brake && this.active && v.speed > 18 && this.time > 6) {
      const j = Math.round(this.maxS / STEP);
      let k = 0; for (let u = 0; u < 40; u++) k = Math.max(k, Math.abs(this.track.k[Math.min(this.track.N - 1, j + u)]));
      if (k > 1 / 40) { H.brake = true; ui.hint(touch ? 'BRAKE BEFORE THE BEND' : '<kbd>S</kbd> BRAKE BEFORE THE BEND', 2600); }
    }
    if (!H.hand && this.active && this.track.isHairpin[Math.min(this.track.N - 1, Math.round(this.maxS / STEP) + 30)]) { H.hand = true; ui.hint(touch ? 'HANDBRAKE SWINGS THE TAIL ROUND' : '<kbd>SPACE</kbd> HANDBRAKE FOR HAIRPINS', 3200); }
    if (!H.turbo && this.active && v.p.boostCap > 0 && this.time > 12) { H.turbo = true; ui.hint(touch ? 'TURBO GIVES A BURST OF POWER' : '<kbd>SHIFT</kbd> TURBO BOOST', 2600); }
    if (!H.cam && this.active && this.time > 25 && !touch) { H.cam = true; ui.hint('<kbd>C</kbd> CHANGE CAMERA', 2200); }
  }

  regionCheck() {
    const t = this.track;
    const bi = t.biomeIndex(this.maxS);
    if (bi !== this.region) {
      const first = this.region === -1;
      this.region = bi;
      const b = t.m.biomes[bi];
      if (!first) this.g.ui.notice(b.name, fmtKm(b.start - this.startS + 30) + ' KM', false, 2800);
    }
  }

  // ------------------------------------------------------------------ audio
  audio(dt) {
    const a = audio(), v = this.vehicle, g = this.g;
    if (!a || !a.ctx) return;
    if (!this.engine) { this.engine = new EngineVoice(a, this.car); this.engine.setRunning(!this.countdown); }
    if (!this.road) this.road = new RoadVoice(a);
    const pops = this.engine.update(dt, v.rpm, v.p.engine.redline, v.input.throttle, v.boost, v.limiter, v.dmg.engine, this.ended ? 0.6 : 1);
    if (pops && this.model) {
      for (const tip of this.model.exhaustTips) { const ep = this.model.group.localToWorld(this.tmp.p.copy(tip)); g.particles.glow.emit(ep.x, ep.y, ep.z, v.vel.x * 0.9, 0, v.vel.z * 0.9, 0.08, 0.5, 0.2, 0.9, 1, 0.55, 0.2, 0, 1); }
    }
    let paved = 0, loose = 0, inWater = 0, si = null;
    for (const w of v.wheels) {
      if (!w.contact) continue;
      const s = SURF_INFO[w.surf];
      si = s;
      if (s.group === 0) paved = Math.max(paved, w.slip); else loose = Math.max(loose, w.slip);
      if (s.splash) inWater = 1;
    }
    this.road.update(v.speed, v.wheelsOnGround ? paved : 0, loose, v.wheelsOnGround ? si : null, v.scrape, inWater, this.ended ? 0.5 : 1);
    const L = g.env.look || {};
    a.ambience.update(dt, { wind: (L.wind || 0.3) * 0.8 + 0.1, birds: (L.birds || 0) * (1 - g.env.tunnel), trees: 0.6, rain: (L.rain || 0) * (1 - g.env.tunnel), water: clamp(1 - g.world.nearestWaterfall(v.pos) / 140, 0, 1) });
    a.setReverb(g.env.tunnel * 0.7);
    for (const e of g.env.events) if (e.type === 'thunder') setTimeout(() => a.thunder(e.power), e.delay * 1000);
    g.env.events.length = 0;
    // music intensity: speed, danger, record chase
    const danger = (1 - v.hp / v.p.hpPool) * 0.4 + (v.fuel / v.p.fuel < 0.15 ? 0.25 : 0);
    const inten = clamp(v.speed / 45, 0, 1) * 0.6 + danger + (this.record ? 0.15 : 0) + (this.best > 0 && this.maxS - this.startS > this.best - 300 && !this.record ? 0.2 : 0);
    a.music.setIntensity(inten);
  }

  // ------------------------------------------------------------------ HUD
  hud(dt) {
    const v = this.vehicle, g = this.g, sv = g.save.data;
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    const mph = sv.settings.units === 'mph';
    const sp = Math.abs(v.fwdSpeed) * 3.6 * (mph ? 0.621 : 1);
    g.ui.hudSpeedo({
      speed: sp, units: mph ? 'MPH' : 'KM/H', rpm: v.rpm, redline: v.p.engine.redline,
      gear: v.shiftT > 0 ? '–' : v.gear === -1 ? 'R' : String(v.gear), boostCap: v.p.boostCap, boostTank: v.p.boostCap ? v.boostTank / v.p.boostCap : 0,
      boost: v.boost, overboost: v.overboost,
      lowFuel: v.fuel / v.p.fuel < 0.15, engineWarn: v.dmg.engine < 0.4, brakeWarn: v.dmg.brakes < 0.4 || v.brakeTemp / v.p.brakeFade > 0.8, hot: v.heat > 0.95,
    });
    this.hudT = (this.hudT || 0) + dt;
    if (this.hudT < 0.08) return;
    this.hudT = 0;
    const b = this.track.biome(this.maxS);
    const tires = v.tireHealth;
    g.ui.hud({
      dist: this.maxS - this.startS, record: this.record, cash: sv.cash + this.runCash,
      fuel: v.fuel, fuelFrac: v.fuel / v.p.fuel, hp: v.hp / v.p.hpPool,
      parts: { engine: v.dmg.engine, tires, susp: v.dmg.susp, brakes: Math.min(v.dmg.brakes, 1 - clamp(v.brakeTemp / v.p.brakeFade - 0.6, 0, 1)) },
      region: b.name, fps: sv.settings.showFps ? this.fps + ' FPS' : '',
    });
  }

  // ------------------------------------------------------------------ ending
  checkEnd(dt) {
    const v = this.vehicle, t = this.track;
    const q = v.lastQuery;
    if (v.destroyed) return this.finish('VEHICLE DESTROYED', 'WRECKED');
    if (v.pos.y < t.roadY(q.s) - 22 || (q.dist > 70 && v.pos.y < q.h + 0.5 && v.pos.y < t.roadY(q.s) - 8)) return this.finish('OVER THE EDGE', 'GONE');
    if (this.maxS >= t.length) return this.finish('BOTTOM OF THE MOUNTAIN', 'MOUNTAIN COMPLETE', true);
    const up = v.getUp(this.tmp.u);
    if (up.y < 0.25 && v.speed < 2) {
      this.flipT += dt;
      if (this.flipT > 2.2) {
        if (this.recoveries > 0) { this.recoveries--; this.flipT = 0; this.recover(); }
        else return this.finish('OVERTURNED', 'RUN OVER');
      }
    } else this.flipT = 0;
    const noPower = v.fuel <= 0 || v.dmg.engine <= 0;
    if (noPower && v.speed < 0.6) { this.stopT += dt; if (this.stopT > 2.2) return this.finish(v.fuel <= 0 ? 'OUT OF FUEL' : 'ENGINE FAILURE', 'RUN OVER'); } else this.stopT = 0;
    if (this.maxS > this.lastS + 3) { this.lastS = this.maxS; this.stuckT = 0; } else { this.stuckT += dt; if (this.stuckT > 25) return this.finish('STUCK', 'RUN OVER'); }
  }

  // right the car on the road where it stopped (costs some condition)
  recover() {
    const v = this.vehicle, q = v.lastQuery;
    const hp = v.hp, fuel = v.fuel, dmg = { ...v.dmg }, wh = v.wheels.map((w) => [w.health, w.toe]);
    const d = Math.max(-q.halfW + 1.2, Math.min(q.halfW - 1.2, q.d));
    v.reset(Math.max(this.startS, q.s), d);
    Object.assign(v.dmg, dmg); v.fuel = fuel; v.hp = hp - v.p.hpPool * 0.08;
    v.wheels.forEach((w, i) => { w.health = wh[i][0]; w.toe = wh[i][1]; });
    if (v.fuel > 0 && v.dmg.engine > 0) this.engine && this.engine.setRunning(true);
    this.rolled = false;
    this.g.ui.notice('BACK ON YOUR WHEELS', this.recoveries === 1 ? '1 RECOVERY LEFT' : 'LAST RECOVERY USED', true, 2000);
    audio()?.metal(0.4, 240);
  }

  finish(reason, title, complete = false) {
    if (this.ended) return;
    this.ended = true;
    this.active = false;
    const g = this.g, a = audio();
    // slow motion beat
    this.timeScale = complete ? 1 : 0.3;
    setTimeout(() => { this.timeScale = 1; }, complete ? 0 : 900);
    if (!complete) setTimeout(() => { if (this.engine) { this.engine.setRunning(false); a && a.burst({ freq: 160, type: 'lowpass', dur: 0.6, gain: 0.25, buf: a.brown }); } }, 700);
    a?.music?.setIntensity(0);
    g.platform.gameplayStop();
    setTimeout(() => this.payout(reason, title, complete), complete ? 1800 : 1500);
    if (complete) g.ui.notice('MOUNTAIN COMPLETE', 'HOLLOW PEAK CONQUERED', true, 3600);
  }

  payout(reason, title, complete) {
    const g = this.g, sv = g.save.data, v = this.vehicle;
    const dist = Math.max(0, this.maxS - this.startS);
    const dkm = dist / 1000;
    const oldBest = sv.best[this.mountain] || 0;
    const isRecord = dist > oldBest + 1;
    const mult = garageEarnMult(sv.garageLevel) * (this.mountain === 'm2' ? 1.35 : 1);
    const distR = Math.round((300 * dkm + 40 * dkm * dkm) * mult);
    const recR = isRecord ? Math.round((100 + (dist - oldBest) * 0.6) * mult) : 0;
    const condFrac = clamp(v.hp / v.p.hpPool, 0, 1);
    const condR = Math.round(condFrac * dkm * 60 * mult);
    const completeR = complete ? (this.mountain === 'm2' ? 60000 : 25000) : 0;
    const lines = [];
    if (isRecord && oldBest > 0) lines.push(['NEW RECORD', '+' + fmtMoney(recR)]);
    else if (isRecord) lines.push(['FIRST DISTANCE', '+' + fmtMoney(recR)]);
    lines.push(['DISTANCE REWARD', '+' + fmtMoney(distR)]);
    const pickCash = this.runCash - this.bonus.shortcuts - this.bonus.stunts - this.bonus.crates;
    if (pickCash > 0) lines.push(['CASH COLLECTED', '+' + fmtMoney(pickCash)]);
    if (this.bonus.crates) lines.push(['BONUS CRATES', '+' + fmtMoney(this.bonus.crates)]);
    if (this.bonus.shortcuts) lines.push(['SHORTCUTS', '+' + fmtMoney(this.bonus.shortcuts)]);
    if (this.bonus.stunts) lines.push(['AIRTIME & DRIFTS', '+' + fmtMoney(this.bonus.stunts)]);
    lines.push(['CONDITION BONUS', '+' + fmtMoney(condR)]);
    if (completeR) lines.push(['MOUNTAIN COMPLETE', '+' + fmtMoney(completeR)]);
    const total = distR + recR + this.runCash + condR + completeR;
    this.lastTotal = total;
    // apply
    sv.cash += total; sv.totalEarned += total;
    if (isRecord) sv.best[this.mountain] = dist;
    sv.stats.runs++; sv.stats.distance += dist; sv.stats.topSpeed = Math.max(sv.stats.topSpeed, this.topSpeed); sv.stats.cashCollected += this.runCash;
    const cs = carState(sv, this.car.id);
    for (const c of this.rareParts) { cs.levels[c] = (cs.levels[c] || 0) + 1; lines.push(['RARE PART', c.toUpperCase() + ' +1']); }
    if (complete && !sv.completed.includes(this.mountain)) {
      sv.completed.push(this.mountain);
      if (this.mountain === 'm1' && !sv.unlocked.includes('m2')) { sv.unlocked.push('m2'); setTimeout(() => g.ui.toast('UNLOCKED <b>MOUNTAIN II · THE CANYON</b>', 5000), 1200); }
    }
    const runInfo = { distance: dist, mountain: this.mountain, criticalDistance: this.criticalDistance, fumes: this.fumes, maxAir: this.maxAir, maxDrift: this.maxDrift, recoveredRoll: this.recoveredRoll };
    g.checkAchievements(runInfo);
    g.save.save(); g.save.flush();
    const d = v.dmg;
    g.ui.summary({
      reason, title: complete ? 'MOUNTAIN COMPLETE' : 'RUN OVER', distance: dist, record: isRecord && oldBest > 0, lines, total,
      condition: { BODY: condFrac, ENGINE: d.engine, TYRES: v.tireHealth, SUSP: d.susp, BRAKES: d.brakes },
      next: g.nextGoalText(),
    });
    g.ui.show('hud', false); g.ui.show('touch', false);
    if (isRecord) g.platform.happytime();
  }

  // cleanup when leaving to the garage
  stop() {
    this.active = false; this.ended = true; this.cdToken = (this.cdToken || 0) + 1;
    if (this.engine) { this.engine.setRunning(false); }
    this.road && this.road.stop();
    for (const m of this.pickMeshes.values()) this.g.worldScene.remove(m);
    this.pickMeshes.clear();
    for (const r of this.dynamic) if (r.mesh) this.g.worldScene.remove(r.mesh);
    this.dynamic.length = 0;
    if (this.animals) this.animals.clear();
    document.body.classList.remove('cockpit');
    if (this.model) { if (this.model.glassMat) this.model.glassMat.opacity = 0.72; this.g.worldScene.remove(this.model.group); this.model.dispose(); this.model = null; }
    if (this.engine) { this.engine.dispose(); this.engine = null; }
    if (this.headlight) this.headlight.intensity = 0;
    this.g.platform.gameplayStop();
  }
}

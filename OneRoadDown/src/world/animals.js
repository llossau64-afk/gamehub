// Wildlife and farm animals along the road. Animals graze, wander and sometimes bolt
// across the road when a car approaches. They are breakable colliders: hitting one
// knocks it away (and costs the car a little speed and some paint).

import * as THREE from 'three';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';
import { cloneAsset, getFox } from './assets.js';
import { STEP } from './track.js';

const SPECIES = {
  deer: { r: 0.55, y: 0.95, slow: 0.07, dmg: 0.06, walk: 1.2, run: 9, herd: [1, 3], bolt: 0.55, step: 2.4 },
  cow: { r: 0.8, y: 0.95, slow: 0.22, dmg: 0.16, walk: 0.7, run: 3.5, herd: [3, 6], bolt: 0.05, step: 1.4 },
  sheep: { r: 0.5, y: 0.55, slow: 0.05, dmg: 0.04, walk: 0.6, run: 4.5, herd: [4, 8], bolt: 0.15, step: 2.6 },
  boar: { r: 0.5, y: 0.5, slow: 0.08, dmg: 0.07, walk: 0.9, run: 7, herd: [1, 4], bolt: 0.45, step: 2.8 },
  ibex: { r: 0.5, y: 0.7, slow: 0.06, dmg: 0.05, walk: 0.8, run: 6, herd: [2, 4], bolt: 0.3, step: 2.4 },
  fox: { r: 0.32, y: 0.3, slow: 0.01, dmg: 0.0, walk: 1.0, run: 8, herd: [1, 1], bolt: 0.6, step: 0 },
};

// which animals live where (biome id -> weights)
const HABITAT = {
  village: { cow: 3, sheep: 3, deer: 1, fox: 1 },
  lower: { cow: 2, sheep: 2, deer: 2, fox: 1 },
  bottom: { cow: 2, sheep: 2, fox: 1 },
  forest: { deer: 4, boar: 3, fox: 2 },
  rocky: { ibex: 4, deer: 1, fox: 1 },
  snow: { ibex: 3, fox: 1 },
  highway: { deer: 2, boar: 2, fox: 2 },
  cliffs: { ibex: 4, fox: 1 },
  mesa: { cow: 2, fox: 2 },
  redwall: { ibex: 2, fox: 2 },
  dryhwy: { boar: 2, fox: 2, cow: 1 },
  gorge: { ibex: 3, fox: 1 },
};

export class Animals {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.cols = [];
    this.nextSpawn = 0;
    this.root = new THREE.Group();
    this.root.name = 'animals';
    game.worldScene.add(this.root);
    this.tmp = {};
  }

  reset(s0) {
    this.clear();
    for (const f of this.g.track.farms || []) f.spawned = false;
    this.nextSpawn = s0 + 80;
  }

  clear() {
    for (const a of this.list) this.root.remove(a.obj);
    this.list.length = 0;
    this.cols.length = 0;
  }

  pickSpecies(biomeId, R) {
    const h = HABITAT[biomeId] || HABITAT.forest;
    const keys = Object.keys(h);
    let sum = 0;
    for (const k of keys) sum += h[k];
    let r = R * sum;
    for (const k of keys) { if ((r -= h[k]) <= 0) return k; }
    return keys[0];
  }

  makeObject(kind) {
    if (kind === 'fox') {
      const F = getFox();
      if (!F) return null;
      const o = cloneSkinned(F.scene);
      // the sample fox is modelled in centimetres
      o.scale.setScalar(0.0055);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      const wrap = new THREE.Group();
      wrap.add(o);
      const mixer = new THREE.AnimationMixer(o);
      const clip = (n) => F.animations.find((c) => c.name === n) || F.animations[0];
      const acts = { walk: mixer.clipAction(clip('Walk')), run: mixer.clipAction(clip('Run')), idle: mixer.clipAction(clip('Survey')) };
      acts.idle.play();
      wrap.userData = { mixer, acts, cur: 'idle' };
      return wrap;
    }
    const o = cloneAsset(kind);
    if (!o) return null;
    const legs = [];
    o.traverse((m) => {
      if (m.isMesh) { m.castShadow = true; m.userData.sharedGeo = true; }
      if (/__leg(FL|FR|RL|RR)$/.test(m.name)) legs.push({ obj: m, front: /F[LR]$/.test(m.name), left: /L$/.test(m.name) });
    });
    o.userData = { legs };
    return o;
  }

  spawnGroup(s) {
    const t = this.g.track;
    const b = t.biome(s);
    const kind = this.pickSpecies(b.animals ? b.animals.replace('race-', '') : b.id, Math.random());
    const sp = SPECIES[kind];
    const n = sp.herd[0] + Math.floor(Math.random() * (sp.herd[1] - sp.herd[0] + 1));
    const side = Math.random() < 0.5 ? -1 : 1;
    const farm = kind === 'cow' || kind === 'sheep';
    const dist = farm ? 12 + Math.random() * 30 : 6 + Math.random() * 28;
    for (let i = 0; i < n; i++) {
      const ss = s + (Math.random() - 0.5) * (farm ? 30 : 14);
      const j = Math.min(t.N - 1, Math.max(0, Math.round(t.wrapS(ss) / STEP)));
      if (t.tunnel[j] || t.bridge[j]) continue;
      const d = side * (t.width[j] / 2 + dist + (Math.random() - 0.5) * (farm ? 16 : 6));
      const p = t.posAt(ss, d);
      const h = t.height(p.x, p.z);
      // skip cliffs and steep slopes
      if (Math.abs(t.height(p.x + 1, p.z) - h) > 0.9 || Math.abs(h - p.y) > 6) continue;
      const obj = this.makeObject(kind);
      if (!obj) continue;
      const a = {
        kind, sp, obj, x: p.x, z: p.z, y: h, hd: Math.random() * Math.PI * 2, speed: 0, state: 'graze', t: Math.random() * 4,
        phase: Math.random() * 6, s: ss, side, dead: false,
      };
      a.col = { t: 's', x: a.x, y: h + sp.y, z: a.z, r: sp.r, s: ss, brk: 1.2, slow: sp.slow, dmg: sp.dmg, animal: a, kind: 'animal' };
      obj.position.set(a.x, h, a.z);
      obj.rotation.y = a.hd;
      this.root.add(obj);
      this.list.push(a);
      this.cols.push(a.col);
    }
  }

  // Hit at speed: the animal goes up in a short explosion (no corpse left behind).
  explode(o) {
    const a = o.animal;
    if (!a || a.dead) return;
    a.dead = true;
    const ci = this.cols.indexOf(a.col);
    if (ci >= 0) this.cols.splice(ci, 1);
    this.root.remove(a.obj);
    const li = this.list.indexOf(a);
    if (li >= 0) this.list.splice(li, 1);
  }

  // The car smashed into an animal: send it flying.
  hit(o, e) {
    const a = o.animal;
    if (!a || a.dead) return;
    a.dead = true;
    a.state = 'tumble';
    const k = 0.55 + Math.random() * 0.2;
    a.vx = e.vx * k + (Math.random() - 0.5) * 3; a.vz = e.vz * k + (Math.random() - 0.5) * 3;
    a.vy = 3 + Math.min(9, Math.hypot(e.vx, e.vz) * 0.12);
    a.spin = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9);
    a.t = 0;
    const i = this.cols.indexOf(a.col);
    if (i >= 0) this.cols.splice(i, 1);
    const names = { deer: 'DEER', cow: 'COW', sheep: 'SHEEP', boar: 'BOAR', ibex: 'IBEX', fox: 'FOX' };
    this.g.ui.feed(`${names[a.kind]} HIT`, 0);
  }

  spawnFarm(f) {
    const t = this.g.track;
    const sp = SPECIES[f.animal];
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a2 = (Math.random() - 0.5) * (f.w - 4), b2 = (Math.random() - 0.5) * (f.dpt - 4);
      const x = f.x + f.fx * a2 + f.rx * b2, z = f.z + f.fz * a2 + f.rz * b2;
      const obj = this.makeObject(f.animal);
      if (!obj) continue;
      const h = t.height(x, z);
      const a = { kind: f.animal, sp: { ...sp, bolt: 0 }, obj, x, z, y: h, hd: Math.random() * 6.28, speed: 0, state: 'graze', t: Math.random() * 5, phase: Math.random() * 6, s: f.s, pen: f, dead: false };
      a.col = { t: 's', x, y: h + sp.y, z, r: sp.r, s: f.s, brk: 1.2, slow: sp.slow, dmg: sp.dmg, animal: a, kind: 'animal' };
      obj.position.set(x, h, z);
      this.root.add(obj);
      this.list.push(a);
      this.cols.push(a.col);
    }
  }

  update(dt, v, sProg) {
    const t = this.g.track;
    for (const f of t.farms || []) {
      if (!f.spawned && f.s > sProg + 60 && f.s < sProg + 420) { f.spawned = true; this.spawnFarm(f); }
      if (f.spawned && f.s < sProg - 200) f.spawned = false;
    }
    // keep a few groups ahead of the player
    while (this.nextSpawn < sProg + 420) {
      if (this.nextSpawn > sProg + 120) this.spawnGroup(this.nextSpawn);
      this.nextSpawn += 110 + Math.random() * 170;
    }
    const cx = v.pos.x, cz = v.pos.z;
    const carSpeed = v.speed;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      // despawn far behind
      if (a.s < sProg - 140) { this.root.remove(a.obj); this.list.splice(i, 1); const ci = this.cols.indexOf(a.col); if (ci >= 0) this.cols.splice(ci, 1); continue; }
      a.t += dt;
      if (a.state === 'tumble') {
        a.vy -= 9.8 * dt;
        a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
        a.obj.rotation.x += a.spin.x * dt; a.obj.rotation.z += a.spin.z * dt; a.obj.rotation.y += a.spin.y * dt;
        const h = t.height(a.x, a.z);
        if (a.y < h + 0.2 && a.vy < 0) {
          a.y = h + 0.2; a.vy *= -0.25; a.vx *= 0.6; a.vz *= 0.6; a.spin.multiplyScalar(0.5);
          if (Math.hypot(a.vx, a.vz) < 0.6 && a.t > 1) {
            a.state = 'down';
            a.obj.rotation.set(0, a.obj.rotation.y, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1));
            a.y = h + a.sp.r * 0.6;
          }
        }
        a.obj.position.set(a.x, a.y, a.z);
        this.legs(a, 0, dt);
        continue;
      }
      if (a.state === 'down') { if (a.t > 25) { this.root.remove(a.obj); this.list.splice(i, 1); } continue; }
      // behaviour
      const dx = cx - a.x, dz = cz - a.z, dCar = Math.hypot(dx, dz);
      const q = t.query(a.x, a.z, this.tmp);
      if (a.state !== 'flee' && dCar < 35 + carSpeed * 1.2 && carSpeed > 4) {
        if (Math.random() < a.sp.bolt && Math.abs(q.d) < q.halfW + 30) {
          // bolt across the road (that is what deer do)
          a.state = 'flee';
          a.target = -Math.sign(q.d || 1) * (q.halfW + 12 + Math.random() * 10);
          a.targetS = q.s + (Math.random() - 0.5) * 10;
        } else if (a.state !== 'flee') {
          a.state = 'alert';
        }
        a.t = 0;
      }
      let want = 0;
      if (a.state === 'graze' || a.state === 'alert') {
        if (a.state === 'graze' && a.t > 3 + Math.random() * 6) { a.state = 'walk'; a.t = 0; a.hd += (Math.random() - 0.5) * 2; }
        if (a.state === 'alert') { a.hd = Math.atan2(dx, dz) * 0.15 + a.hd * 0.85; if (a.t > 4) { a.state = 'graze'; a.t = 0; } }
      } else if (a.state === 'walk') {
        want = a.sp.walk;
        // stay away from the asphalt unless fleeing
        if (Math.abs(q.d) < q.halfW + 3) a.hd += Math.sign(q.d || 1) * 0.6 * dt * 3;
        if (a.t > 2 + Math.random() * 5) { a.state = 'graze'; a.t = 0; }
      } else if (a.state === 'flee') {
        want = a.sp.run;
        const tp = t.posAt(a.targetS, a.target);
        const wantHd = Math.atan2(tp.x - a.x, tp.z - a.z);
        let dh = wantHd - a.hd; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
        a.hd += dh * Math.min(1, dt * 4);
        if (Math.hypot(tp.x - a.x, tp.z - a.z) < 2 || a.t > 8) { a.state = 'graze'; a.t = 0; }
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 3);
      a.x += Math.sin(a.hd) * a.speed * dt; a.z += Math.cos(a.hd) * a.speed * dt;
      if (a.pen) {
        // stay inside the pasture: turn back at the fence
        const f = a.pen, lx = (a.x - f.x) * f.fx + (a.z - f.z) * f.fz, lz = (a.x - f.x) * f.rx + (a.z - f.z) * f.rz;
        if (Math.abs(lx) > f.w / 2 - 1.5 || Math.abs(lz) > f.dpt / 2 - 1.5) {
          const cl = Math.max(-f.w / 2 + 1.5, Math.min(f.w / 2 - 1.5, lx)), cz2 = Math.max(-f.dpt / 2 + 1.5, Math.min(f.dpt / 2 - 1.5, lz));
          a.x = f.x + f.fx * cl + f.rx * cz2; a.z = f.z + f.fz * cl + f.rz * cz2;
          a.hd = Math.atan2(f.x - a.x, f.z - a.z) + (Math.random() - 0.5);
        }
      }
      a.y = t.height(a.x, a.z);
      a.obj.position.set(a.x, a.y, a.z);
      a.obj.rotation.y = a.hd;
      a.col.x = a.x; a.col.y = a.y + a.sp.y; a.col.z = a.z;
      a.col.s = q.s;
      this.legs(a, a.speed, dt);
    }
  }

  legs(a, speed, dt) {
    const u = a.obj.userData;
    if (u.mixer) {
      const want = a.state === 'tumble' || a.state === 'down' ? 'idle' : speed > 3 ? 'run' : speed > 0.3 ? 'walk' : 'idle';
      if (want !== u.cur) { u.acts[u.cur].fadeOut(0.25); u.acts[want].reset().fadeIn(0.25).play(); u.cur = want; }
      u.mixer.update(dt * (want === 'run' ? Math.max(0.8, speed / 6) : 1));
      return;
    }
    if (!u.legs) return;
    const gallop = speed > a.sp.walk * 2;
    a.phase += dt * (speed > 0.05 ? a.sp.step * (0.8 + speed * (gallop ? 0.25 : 0.9)) : 0);
    const amp = Math.min(0.75, speed * (gallop ? 0.09 : 0.35));
    for (const l of u.legs) {
      // walk: diagonal pairs; gallop: front pair then rear pair
      const off = gallop ? (l.front ? 0 : Math.PI * 0.7) + (l.left ? 0.25 : 0) : (l.front === l.left ? 0 : Math.PI);
      l.obj.rotation.x = Math.sin(a.phase + off) * amp;
    }
  }
}

// Small rigid-body world for loose things: coins, paper balls, notes, a thrown cape,
// the trash bin. Bodies are spheres (with an optional flat "disc" mode for coins and
// paper so they come to rest lying down), integrated with gravity, bounce and friction
// against the floor, the room walls and the furniture boxes, plus sphere-sphere pushes.
import * as THREE from 'three';
import { ROOM, DOOR } from '../world/shop.js';
import { clamp } from '../core/util.js';

const G = 9.81;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Physics {
  constructor(game) {
    this.game = game;
    this.bodies = [];
  }

  // obj: Object3D already in the scene. opts: r (radius), vel, ang (angular velocity),
  // bounce, friction, flat (settle lying down), sound (fn(speed)), drag, mass, outside (allow leaving the room)
  add(obj, opts = {}) {
    const b = {
      obj, r: opts.r ?? 0.03, vel: (opts.vel || new THREE.Vector3()).clone(), ang: (opts.ang || new THREE.Vector3()).clone(),
      bounce: opts.bounce ?? 0.35, friction: opts.friction ?? 0.5, flat: !!opts.flat, drag: opts.drag ?? 0.15,
      mass: opts.mass ?? 1, sound: opts.sound || null, outside: !!opts.outside, sleep: 0, asleep: false,
      onRest: opts.onRest || null, lift: opts.lift ?? 0, tag: opts.tag || null, life: opts.life ?? Infinity, t: 0,
    };
    this.bodies.push(b);
    return b;
  }

  remove(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  // push every body near `p` away (a kick, a stomp, a slammed door)
  impulse(p, radius, strength, up = 0.4) {
    for (const b of this.bodies) {
      const d = b.obj.position.distanceTo(p);
      if (d > radius) continue;
      const k = (1 - d / radius) * strength / b.mass;
      _v.subVectors(b.obj.position, p).setY(0).normalize();
      b.vel.addScaledVector(_v, k).add(new THREE.Vector3(0, up * k, 0));
      b.ang.add(new THREE.Vector3((Math.random() - 0.5) * 20 * k, (Math.random() - 0.5) * 10 * k, (Math.random() - 0.5) * 20 * k));
      b.asleep = false; b.sleep = 0;
    }
  }

  // walkers (player, customers) nudge whatever lies at their feet: coins skitter, paper rolls
  feet(dt) {
    const g = this.game;
    const walkers = [];
    if (g.player && !g.dir.cam.active && g.state === 'play') walkers.push({ p: g.player.pos, v: g.player.vel || null, r: 0.22 });
    for (const c of g.customers.list) if (c.ch.visible && c.ch.sitW < 0.5) walkers.push({ p: c.ch.root.position, v: null, r: 0.2, ch: c.ch });
    if (g.employee) walkers.push({ p: g.employee.ch.root.position, v: null, r: 0.2, ch: g.employee.ch });
    for (const w of walkers) {
      if (!w.prev) w.prev = w.p.clone();
      for (const b of this.bodies) {
        const o = b.obj.position;
        if (o.y > 0.25) continue;
        const dx = o.x - w.p.x, dz = o.z - w.p.z;
        const d = Math.hypot(dx, dz);
        if (d > w.r || d < 1e-4) continue;
        const spd = w.ch ? w.ch.speed : (w.v ? Math.hypot(w.v.x, w.v.z) : 1.2);
        if (spd < 0.15) continue;
        const k = (1 - d / w.r) * Math.min(3, spd) * 1.4 / b.mass;
        const fx = w.ch ? Math.sin(w.ch.yaw) : 0, fz = w.ch ? Math.cos(w.ch.yaw) : 0;
        b.vel.x += (dx / d * 0.7 + fx * 0.5) * k;
        b.vel.z += (dz / d * 0.7 + fz * 0.5) * k;
        b.vel.y += 0.6 * k * (b.flat ? 0.5 : 0.2);
        b.ang.x += (Math.random() - 0.5) * 30 * k; b.ang.z += (Math.random() - 0.5) * 30 * k;
        b.asleep = false; b.sleep = 0;
      }
    }
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.feet(dt);
    const n = Math.min(4, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let s = 0; s < n; s++) this.step(h);
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.t += dt;
      if (b.t > b.life) { b.obj.parent?.remove(b.obj); this.bodies.splice(i, 1); }
    }
  }

  step(h) {
    const colliders = this.game.shop.colliders;
    for (const b of this.bodies) {
      if (b.asleep) continue;
      const p = b.obj.position;
      b.vel.y -= G * h;
      b.vel.multiplyScalar(1 - b.drag * h);
      p.addScaledVector(b.vel, h);
      // spin
      const w = b.ang.length();
      if (w > 1e-4) {
        _q.setFromAxisAngle(_ax.copy(b.ang).divideScalar(w), w * h);
        b.obj.quaternion.premultiply(_q);
      }
      // floor
      const floorY = b.r + b.lift;
      if (p.y < floorY) {
        p.y = floorY;
        const vin = -b.vel.y;
        if (vin > 0.4 && b.sound) b.sound(vin, b);
        b.vel.y = vin > 0.25 ? vin * b.bounce : 0;
        // friction: tangential velocity rolls into spin, both slow down
        const f = Math.min(1, b.friction * G * h * 6);
        b.vel.x *= 1 - f; b.vel.z *= 1 - f;
        b.ang.multiplyScalar(1 - Math.min(1, f * 1.2));
        if (!b.flat) {
          // roll without slipping: ang = up x vel / r
          const roll = _v.set(b.vel.z, 0, -b.vel.x).divideScalar(Math.max(0.005, b.r));
          b.ang.lerp(roll, 0.5);
        } else if (Math.abs(b.vel.y) < 0.05) {
          // a settling coin spins down like a real one
          if (b.r < 0.02) b.ang.y += (b.ang.y >= 0 ? 1 : -1) * h * 8 * Math.min(1, b.vel.length() * 3 + 0.2);
          // flat things tip over onto a face
          const up = _v.set(0, 1, 0).applyQuaternion(b.obj.quaternion);
          const target = up.y >= 0 ? UP : _ax.set(0, -1, 0);
          _q.setFromUnitVectors(up, target);
          b.obj.quaternion.premultiply(new THREE.Quaternion().slerp(_q, Math.min(1, h * 10)));
        }
      }
      // room walls (except through the open door when allowed)
      const R = ROOM;
      const inDoor = Math.abs(p.x - DOOR.x) < DOOR.w * 0.5 - b.r;
      if (!b.outside || !inDoor) {
        if (p.z < R.z1 + 0.5 || !b.outside) {
          if (p.x < R.x0 + b.r) { p.x = R.x0 + b.r; b.vel.x = Math.abs(b.vel.x) * b.bounce; this.hit(b); }
          if (p.x > R.x1 - b.r) { p.x = R.x1 - b.r; b.vel.x = -Math.abs(b.vel.x) * b.bounce; this.hit(b); }
          if (p.z < R.z0 + b.r) { p.z = R.z0 + b.r; b.vel.z = Math.abs(b.vel.z) * b.bounce; this.hit(b); }
          if (p.z > R.z1 - b.r && !(b.outside && inDoor)) { p.z = R.z1 - b.r; b.vel.z = -Math.abs(b.vel.z) * b.bounce; this.hit(b); }
        }
      }
      // furniture footprints: only below their rough height (0.8 m)
      if (p.y < 0.8) {
        for (const c of colliders) {
          if (c.active && !c.active()) continue;
          const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1);
          const dx = p.x - cx, dz = p.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= b.r * b.r) continue;
          const d = Math.sqrt(d2) || 1e-4;
          const nx = d2 > 1e-8 ? dx / d : 0, nz = d2 > 1e-8 ? dz / d : 1;
          p.x = cx + nx * b.r; p.z = cz + nz * b.r;
          const vn = b.vel.x * nx + b.vel.z * nz;
          if (vn < 0) { b.vel.x -= (1 + b.bounce) * vn * nx; b.vel.z -= (1 + b.bounce) * vn * nz; this.hit(b); }
        }
      }
      // sleep when settled
      const still = b.vel.lengthSq() < 0.0025 && b.ang.lengthSq() < 0.05 && p.y <= floorY + 0.002;
      b.sleep = still ? b.sleep + h : 0;
      if (b.sleep > 0.4) {
        b.asleep = true; b.vel.set(0, 0, 0); b.ang.set(0, 0, 0);
        if (b.onRest) { const f = b.onRest; b.onRest = null; f(b); }
      }
    }
    // body vs body
    const B = this.bodies;
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        const a = B[i], c = B[j];
        if (a.asleep && c.asleep) continue;
        _v.subVectors(c.obj.position, a.obj.position);
        const rr = a.r + c.r, d2 = _v.lengthSq();
        if (d2 >= rr * rr || d2 < 1e-10) continue;
        const d = Math.sqrt(d2);
        _v.divideScalar(d);
        const pen = rr - d, ma = 1 / a.mass, mc = 1 / c.mass, mt = ma + mc;
        a.obj.position.addScaledVector(_v, -pen * ma / mt);
        c.obj.position.addScaledVector(_v, pen * mc / mt);
        const rel = (c.vel.x - a.vel.x) * _v.x + (c.vel.y - a.vel.y) * _v.y + (c.vel.z - a.vel.z) * _v.z;
        if (rel < 0) {
          const j2 = -(1 + Math.min(a.bounce, c.bounce)) * rel / mt;
          a.vel.addScaledVector(_v, -j2 * ma);
          c.vel.addScaledVector(_v, j2 * mc);
          a.asleep = c.asleep = false; a.sleep = c.sleep = 0;
        }
      }
    }
  }

  hit(b) {
    const s = b.vel.length();
    if (s > 0.5 && b.sound) b.sound(s * 0.7, b);
  }
}

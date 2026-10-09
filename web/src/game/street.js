// People walking past outside: the shop sits on a living street.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { randomCustomerLook } from '../chars/looks.js';
import { ROOM, WINDOW } from '../world/shop.js';
import { rand, chance, pick } from '../core/util.js';
import { audio } from '../audio/audio.js';

const STYLES = [
  { top: 0.5, front: 0.45, left: 0.3, right: 0.3, back: 0.32, fuzz: 0 },
  { top: 0.2, front: 0.2, left: 0.08, right: 0.08, back: 0.08, fuzz: 0 },
  { top: 0.7, front: 0.6, left: 0.55, right: 0.55, back: 0.6, fuzz: 0 },
  { top: 0.05, front: 0.05, left: 0.05, right: 0.05, back: 0.05, fuzz: 0 },
];

export class Street {
  constructor(game) {
    this.game = game;
    this.walkers = [];
    this.t = rand(2, 5);
    this.max = game.quality.hairLayers <= 10 ? 2 : 4;
    this.cars = [];
    this.carT = rand(3, 8);
  }

  // traffic: simple cars drive past; they brake and honk if you stand on the road
  makeCar(col) {
    const c = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1d2630', roughness: 0.1, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.75, 1.75), paint); body.position.y = 0.62; c.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 1.6), glass); cab.position.set(-0.2, 1.28, 0); c.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.55), paint); roof.position.set(-0.2, 1.62, 0); c.add(roof);
    const tyre = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
    c.userData.wheels = [];
    for (const [wx, wz] of [[-1.3, 0.85], [1.3, 0.85], [-1.3, -0.85], [1.3, -0.85]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14), tyre);
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.34, wz); c.add(w); c.userData.wheels.push(w);
    }
    const lightM = new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: new THREE.Color('#fff2cc'), emissiveIntensity: 0.8 });
    for (const lz of [0.6, -0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.3), lightM); l.position.set(2.06, 0.75, lz); c.add(l); }
    c.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return c;
  }

  spawnCar() {
    const fz = ROOM.z1 + 0.24;
    const dir = chance(0.5) ? 1 : -1;
    const obj = this.makeCar(pick(['#8f2f2a', '#3b5f7d', '#d8cfb4', '#2f4a3a', '#1c1c1e', '#c9922e', '#e8e4dc']));
    obj.position.set(-dir * 60, -0.07, dir > 0 ? fz + 5.6 : fz + 9.4);
    obj.rotation.y = dir > 0 ? 0 : Math.PI;
    this.game.scene.add(obj);
    this.cars.push({ obj, dir, v: rand(8, 11), vmax: rand(8, 11), honked: 0, careful: chance(0.6) });
  }

  updateCars(dt) {
    const g = this.game, P = g.player.pos;
    this.carT -= dt;
    if (this.carT <= 0 && this.cars.length < 3) { this.carT = rand(5, 14); this.spawnCar(); }
    const outside = P.z > ROOM.z1 + 0.6;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const C = this.cars[i], o = C.obj;
      // someone in front of me in my lane?
      // careful drivers brake for you (if they see you in time); the others honk and keep going
      const ahead = (P.x - o.position.x) * C.dir;
      const inLane = Math.abs(P.z - o.position.z) < 1.4 && g.state === 'play' && !g.knockedOut;
      const blocked = inLane && ahead > 1.6 && ahead < 14;
      const brakes = blocked && C.careful;
      const want = brakes ? Math.max(0, (ahead - 2.8) * 1.4) : C.vmax;
      C.v += Math.sign(want - C.v) * Math.min(Math.abs(want - C.v), (brakes ? 7 : 4) * dt);
      if (blocked && C.honked <= 0) { C.honked = 2.5; this.honk(o.position); }
      C.honked -= dt;
      o.position.x += C.v * C.dir * dt;
      for (const w of o.userData.wheels) w.rotation.y += C.v * dt / 0.34;
      // solid: you can't walk through a car
      const dx = P.x - o.position.x, dz = P.z - o.position.z;
      if (Math.abs(dx) < 2.35 && Math.abs(dz) < 1.15 && C.v > 2.5 && g.state === 'play' && !g.knockedOut) {
        g.runOver(o.position, C.dir * C.v);
      } else if (Math.abs(dx) < 2.35 && Math.abs(dz) < 1.15) {
        if (2.35 - Math.abs(dx) < 1.15 - Math.abs(dz)) P.x = o.position.x + Math.sign(dx || 1) * 2.35;
        else P.z = o.position.z + Math.sign(dz || 1) * 1.15;
      }
      if (outside && !C.passed && Math.abs(P.x - o.position.x) < 8) { C.passed = true; audio._carPass?.(1); }
      if (Math.abs(o.position.x) > 62) {
        o.parent?.remove(o);
        o.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); } });
        this.cars.splice(i, 1);
      }
    }
  }

  honk(pos) {
    if (!audio.ctx) return;
    const d = pos.distanceTo(this.game.player.pos);
    const v = Math.max(0.02, 0.12 - d * 0.006);
    audio.tone(392, 0.32, { type: 'square', vol: v, room: 0.3 });
    audio.tone(494, 0.32, { type: 'square', vol: v * 0.8, room: 0.3 });
    setTimeout(() => { audio.tone(392, 0.5, { type: 'square', vol: v, room: 0.3 }); audio.tone(494, 0.5, { type: 'square', vol: v * 0.8, room: 0.3 }); }, 380);
  }

  spawn() {
    const g = this.game;
    const look = randomCustomerLook();
    const ch = new Character(g.scene, look);
    const hair = new HairSystem({ color: look.hairColor, skin: look.colors.Skin, layers: 6 });
    hair.attach(ch.bones.Head);
    hair.setStyle(pick(STYLES));
    ch.hair = hair;
    const dir = chance(0.5) ? 1 : -1;
    const z = ROOM.z1 + rand(1.0, 2.2);
    const x0 = -dir * 44, x1 = dir * 44;
    ch.place(new THREE.Vector3(x0, 0, z), dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const w = { ch, dir, z, stop: chance(0.35) ? rand(WINDOW.x - 1, WINDOW.x + 1) : null, stopped: false, phone: chance(0.25) };
    ch.walkTo([new THREE.Vector3(x1, 0, z)], chance(0.3) ? 'stroll' : 'walk');
    if (w.phone) ch.gesture('phone');
    this.walkers.push(w);
  }

  update(dt) {
    const g = this.game;
    const active = ['play', 'menu', 'barber', 'reaction'].includes(g.state);
    this.t -= dt;
    if (active && this.t <= 0) {
      this.t = rand(7, 16);
      if (this.walkers.length < this.max) this.spawn();
    }
    if (active) this.updateCars(dt);
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i];
      const ch = w.ch;
      // some stop and peek through the window for a moment
      if (w.stop !== null && !w.stopped && Math.abs(ch.root.position.x - w.stop) < 0.3) {
        w.stopped = true;
        const target = ch.path[0];
        ch.stop();
        ch.faceTo(new THREE.Vector3(ch.root.position.x, 0, ROOM.z1 - 2));
        ch.lookAt(new THREE.Vector3(-0.9, 1.2, -1.4), 1);
        if (chance(0.5)) ch.gesture('scratchHead');
        g.dir.wait(rand(2, 4)).then(() => { ch.lookAt(null); ch.walkTo([target], 'walk'); }).catch(() => {});
      }
      // cheap: skip animation when far away or hidden behind the facade
      const d = ch.root.position.distanceTo(g.camera.position);
      if (d < 22) ch.update(dt); else { ch.updateLocomotion(dt); }
      ch.hair.setLOD(d);
      if (Math.abs(ch.root.position.x) > 43.5 && !ch.path.length && !w.stopped) { ch.dispose(); this.walkers.splice(i, 1); continue; }
      if (Math.abs(ch.root.position.x) > 43.5 && !ch.path.length) { ch.dispose(); this.walkers.splice(i, 1); }
    }
  }

  clear() { for (const w of this.walkers) w.ch.dispose(); this.walkers = []; for (const c of this.cars) c.obj.parent?.remove(c.obj); this.cars = []; }
}

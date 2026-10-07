// People walking past outside: the shop sits on a living street.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { randomCustomerLook } from '../chars/looks.js';
import { ROOM, WINDOW } from '../world/shop.js';
import { rand, chance, pick } from '../core/util.js';

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
    this.max = game.quality.hairLayers <= 10 ? 1 : 2;
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
    const x0 = -dir * 13, x1 = dir * 13;
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
      if (Math.abs(ch.root.position.x) > 12.5 && !ch.path.length && !w.stopped) { ch.dispose(); this.walkers.splice(i, 1); continue; }
      if (Math.abs(ch.root.position.x) > 12.5 && !ch.path.length) { ch.dispose(); this.walkers.splice(i, 1); }
    }
  }

  clear() { for (const w of this.walkers) w.ch.dispose(); this.walkers = []; }
}

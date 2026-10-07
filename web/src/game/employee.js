// Marco, the hired barber: takes waiting customers to the second station and cuts
// their hair himself. His skill and speed come from the staff upgrades.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { STATION2, SPOTS } from '../world/shop.js';
import { spawnProp } from '../world/props.js';
import { evaluate, payment, fadeTarget } from '../hair/styles.js';
import { audio } from '../audio/audio.js';
import { pick, rand, chance, damp, clamp, formatMoney } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MARCO = {
  name: 'Marco',
  colors: {
    Skin: '#c48a64', Top: '#e9e1cf', Sleeve: '#c48a64', Pants: '#2b2f38', Shoes: '#2a1a12', Hair: '#1f1611', Iris: '#3e3226',
    EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15',
    Metal: '#b9a06a', Button: '#2a2420', MouthDark: '#2a0d0b', Apron: '#2b2f33', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#e9e1cf', TopDark: '#2d2a28',
  },
  accessories: ['tee', 'apron'],
  scale: 1.02, hunch: 0.05,
  voice: { pitch: 128, rate: 1.05, wobble: 0.08, vol: 0.085 },
};

export class Employee {
  constructor(game) {
    this.game = game;
    const ch = this.ch = new Character(game.scene, MARCO);
    const hair = new HairSystem({ color: '#1f1611', skin: MARCO.colors.Skin, layers: Math.max(8, game.quality.hairLayers - 6) });
    hair.attach(ch.bones.Head);
    hair.setStyle({ top: 0.32, front: 0.3, left: 0.05, right: 0.05, back: 0.06, fuzz: 0, fade: 0.5 }, 0.7);
    ch.hair = hair;
    ch.onFootstep = (c) => game.footstepAt(c.root.position);
    ch.place(STATION2.stand, -0.6);
    this.state = 'idle';
    this.customer = null;
    this.chairAngle = 0;
    this.chairTarget = 0;
    this.checkT = 2;
    this.idleT = 3;
    this.clipper = spawnProp('ClipperCheap', { shadows: false });
  }

  dispose() {
    if (this.motor) { this.motor.stop(); this.motor = null; }
    if (this.customer) { this.customer.byEmployee = false; }
    this.ch.dispose();
  }

  get busy() { return this.state !== 'idle'; }

  update(dt) {
    const g = this.game;
    this.ch.update(dt);
    // chair 2 turns, the seated customer turns with it
    this.chairAngle = damp(this.chairAngle, this.chairTarget, 3, dt);
    const pivot = g.shop.chair2Pivot();
    pivot.rotation.y = this.chairAngle;
    const c = this.customer;
    if (c && c.seatedInChair2 && c.ch.sitW > 0.98) {
      c.ch.yaw = Math.PI + this.chairAngle;
      c.ch.faceYaw = null;
      const f = V(Math.sin(c.ch.yaw), 0, Math.cos(c.ch.yaw));
      c.ch.root.position.set(STATION2.chair.x - f.x * 0.05, c.ch.root.position.y, STATION2.chair.z - f.z * 0.05);
      c.ch.root.rotation.y = c.ch.yaw;
    }
    if (this.state === 'idle') {
      this.checkT -= dt;
      if (this.checkT <= 0 && ['play', 'barber', 'reaction'].includes(g.state)) {
        this.checkT = 1.5;
        const next = g.customers.list.find((x) => x.talked && !x.byEmployee && !x.tutorial && ['waiting', 'standing'].includes(x.state));
        if (next) this.serve(next).catch((e) => console.error(e));
      }
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = rand(4, 9);
        const r = Math.random();
        if (r < 0.3) this.ch.gesture('armsCrossed', { dur: rand(3, 5) });
        else if (r < 0.5) this.ch.lookAt(g.camera, 0.8);
        else if (r < 0.7) this.ch.gesture('lookAround', { dur: 2.4 });
        else this.ch.lookAt(null);
      }
      if (this.ch.gestures.some((x) => x.name === 'arms' || x.g.channel === 'arms') && this.idleT < 1) this.ch.endGesture('arms');
    }
    if (this.state === 'cutting') this.cutting(dt);
  }

  async serve(c) {
    const g = this.game, ch = this.ch, dir = g.dir;
    const wait = (s) => dir.wait(s);
    this.state = 'calling';
    this.customer = c;
    c.byEmployee = true;
    ch.endGesture('arms');
    g.customers.stopIdle(c);
    ch.lookAt(() => c.headPos(), 1);
    const callLine = pick([`${c.name}? Over here!`, 'Next, please!', 'I can take you, come on over.']);
    const d = ch.say(callLine);
    g.showLine('Marco', callLine, d + 1);
    ch.gesture('wave', { dur: 1.2 });
    c.state = 'toEmployee';
    if (c.ch.sitW > 0) { await c.ch.standUp(); c.seat = null; }
    this.chairTarget = Math.PI;
    c.ch.lookAt(null);
    await c.ch.walkTo([STATION2.chairFront], 'walk');
    await c.ch.faceTo(V(STATION2.chair.x, 0, 3));
    await c.ch.sitOn({ pos: STATION2.chair.clone().add(V(0, 0, -0.05)), rot: 0, height: g.shop.seatHeight() - 0.03 });
    audio.chairThump();
    c.seatedInChair2 = true;
    // cape on, chair to the mirror
    const cape = spawnProp('Cape');
    c.ch.bones.Chest.add(cape);
    cape.position.set(0, 0.215, 0.005);
    c.cape = cape;
    audio.capeSnap();
    await wait(0.6);
    this.chairTarget = 0;
    await ch.walkTo([V(STATION2.chair.x + 0.45, 0, STATION2.chair.z + 0.35)], 'walk');
    ch.faceTo(c.headPos());
    // start cutting
    c.state = 'employeeCut';
    const fx = g.fx;
    c.hair.beginService(c.cut, fx.staffSkill, fadeTarget);
    if (c.beard && c.cut.beard) c.beard.beginService(c.cut, fx.staffSkill);
    this.progress = 0;
    this.duration = (38 + c.cut.par * 0.25) / fx.staffSpeed;
    ch.hold('R', this.clipper, { pos: [0.012, -0.08, 0.0], rot: [Math.PI / 2, 0, 0] });
    this.motor = audio.motor(fx.staffSpeed > 1 ? 'clipperPro' : 'clipperCheap');
    this.motor.setGain(0.4);
    this.walkT = 0;
    this.state = 'cutting';
  }

  cutting(dt) {
    const g = this.game, ch = this.ch, c = this.customer;
    if (!c || !g.customers.list.includes(c)) { this.reset(); return; }
    this.progress = Math.min(1, this.progress + dt / this.duration);
    c.hair.serviceProgress(this.progress);
    if (c.beard && c.cut.beard) c.beard.serviceProgress(this.progress);
    // move around the chair and work on different sides
    this.walkT -= dt;
    if (this.walkT <= 0) {
      this.walkT = rand(3, 5);
      const a = rand(-1.2, 1.4);
      ch.walkTo([V(STATION2.chair.x + Math.sin(a) * 0.5, 0, STATION2.chair.z + Math.cos(a) * 0.5)], 'stroll').then(() => ch.faceTo(c.headPos()));
      if (chance(0.25)) { const d = ch.say(pick(['Hold still for me.', 'Looking good so far.', 'So, any plans this weekend?', 'Little more off the sides...'])); }
    }
    const head = c.headPos();
    const t = performance.now() / 1000;
    ch.reach('R', head.clone().add(V(Math.sin(t * 2.3) * 0.07, 0.02 + Math.sin(t * 3.1) * 0.03, Math.cos(t * 1.7) * 0.07)), { speed: 6, hand: 'grip' });
    ch.reach('L', head.clone().add(V(0, 0.12, 0)), { speed: 4, hand: 'open', weight: 0.6 });
    ch.lookAt(head, 1);
    c.ch.lookAt(V(STATION2.chair.x, 1.2, SPOTS.mirror.z), 0.6);
    // a few clippings
    if (Math.random() < dt * 6) g.clippings.spawn(ch.handWorld('R', new THREE.Vector3()), V(0, -1, 0), 2, c.look.hairColor, 0.2);
    // motor volume by distance
    if (this.motor) this.motor.setGain(clamp(1.2 / (ch.root.position.distanceTo(g.camera.position) + 0.5), 0.05, 0.5));
    if (this.progress >= 1) this.finish().catch((e) => console.error(e));
  }

  async finish() {
    const g = this.game, ch = this.ch, c = this.customer;
    this.state = 'finishing';
    if (this.motor) { this.motor.stop(); this.motor = null; }
    ch.release('R'); ch.release('L');
    ch.drop('R', g.scene);
    this.clipper.parent?.remove(this.clipper);
    const result = evaluate(c, c.cutId, c.cut.par);
    result.overall = clamp(result.overall + g.fx.sat * 0.2, 0, 1);
    result.stars = result.overall >= 0.88 ? 5 : result.overall >= 0.76 ? 4 : result.overall >= 0.6 ? 3 : result.overall >= 0.42 ? 2 : 1;
    if (!g.owns('trainBarber')) result.stars = Math.min(result.stars, 4);   // untrained: never perfect
    // quick look in the mirror
    c.ch.lookAt(V(STATION2.chair.x, 1.25, SPOTS.mirror.z), 1);
    await g.dir.wait(1.2).catch(() => {});
    c.ch.gesture('touchHair');
    c.ch.setEmotion(result.stars >= 4 ? 'happy' : result.stars === 3 ? 'neutral' : 'disappointed', 2.5);
    await g.dir.wait(1.6).catch(() => {});
    const pay = payment(c.cutId, result, c.personality, { tips: g.fx.tips });
    const total = Math.round((pay.pay + pay.tip) * 0.65);
    // chair to the room, cape off, pay, leave
    this.chairTarget = Math.PI;
    await g.dir.wait(0.9).catch(() => {});
    c.cape?.parent?.remove(c.cape); c.cape = null;
    audio.capeSnap();
    await c.ch.standUp();
    c.seatedInChair2 = false;
    g.addMoney(total);
    g.addXP(Math.round(pay.xp * 0.4));
    audio.register();
    g.ui.toast(`Marco: ${c.name} · ${'★'.repeat(result.stars)} · +${formatMoney(total)}`, 'Staff');
    g.save.stats.served++;
    g.persist();
    g.updateGoal();
    c.say(result.stars >= 4 ? pick(['Thanks, Marco!', 'Nice work, man.']) : pick(['Hm. Okay.', 'Thanks... I guess.']), result.stars >= 4 ? 'happy' : 'neutral');
    g.customers.walkOut(c, 'walk');
    this.customer = null;
    this.chairTarget = 0;
    await ch.walkTo([STATION2.stand], 'walk');
    ch.faceTo(V(0, 0, 1));
    this.state = 'idle';
    this.checkT = 3;
  }

  reset() {
    if (this.motor) { this.motor.stop(); this.motor = null; }
    this.ch.release('R'); this.ch.release('L');
    if (this.clipper.parent) this.clipper.parent.remove(this.clipper);
    this.ch.held.R = null;
    this.customer = null;
    this.state = 'idle';
    this.chairTarget = 0;
    this.ch.stop();
    this.ch.place(STATION2.stand, -0.6);
  }
}

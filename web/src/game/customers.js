// Customers: appearance, hair, personality, patience and their visit from door to door.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { randomCustomerLook, randomPersonality, PERSONALITIES, VIPS, VIP_PERSONALITY } from '../chars/looks.js';
import { HAIRCUTS, availableHaircuts, startStyle, startBeard } from '../hair/styles.js';
import { BeardSystem, BEARD_STYLES } from '../hair/beard.js';
import { SPOTS } from '../world/shop.js';
import { pick, rand, chance, clamp } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { spawnProp } from '../world/props.js';

const FIRST = ['Sam', 'Leo', 'Marco', 'Jonas', 'Theo', 'Malik', 'Finn', 'Omar', 'Luca', 'Ravi', 'Ben', 'Elias', 'Noah', 'Kai', 'Diego', 'Arthur', 'Milo', 'Yusuf', 'Hugo', 'Tariq', 'Felix', 'Dev', 'Oscar', 'Nico'];

let nextId = 1;

export class Customer {
  constructor(game, opts = {}) {
    this.game = game;
    this.id = nextId++;
    let look = opts.look || randomCustomerLook();
    if (opts.vip) {
      const v = opts.vip;
      look = { ...look, colors: { ...look.colors, ...v.colors, Skin: v.skin, Sleeve: v.colors.Sleeve || v.colors.Top }, accessories: v.accessories, scale: 1.0, hunch: 0 };
      this.vip = v;
    }
    this.look = look;
    this.name = opts.name || (opts.vip ? opts.vip.name : pick(FIRST));
    this.personality = opts.personality || (opts.vip ? VIP_PERSONALITY : randomPersonality(game.level));
    this.cutId = opts.cutId || game.pickCut(!!opts.vip);
    this.cut = HAIRCUTS[this.cutId];
    this.ch = new Character(game.scene, { ...look, name: this.name, voice: { ...look.voice, rate: (look.voice?.rate || 1) * this.personality.voiceRate } });
    this.hair = new HairSystem({ color: look.hairColor, skin: look.colors.Skin, curl: look.curl, layers: game.quality.hairLayers });
    this.hair.attach(this.ch.bones.Head);
    this.hair.setStyle(startStyle(this.cutId));
    this.ch.hair = this.hair;
    // beard: required by beard cuts, otherwise a matter of taste
    const beardSpec = startBeard(this.cutId) || opts.beard || (opts.noBeard ? null : (chance(0.38) ? BEARD_STYLES[pick(['stubble', 'stubble', 'short', 'full', 'goatee', 'moustache'])] : null));
    if (beardSpec) {
      this.beard = new BeardSystem({ color: look.hairColor, skin: look.colors.Skin, layers: game.quality.hairLayers });
      this.beard.attach(this.ch.bones.Head);
      this.beard.setStyle(beardSpec);
      this.ch.beard = this.beard;
    }
    this.ch.onFootstep = (c) => this.game.footstepAt(c.root.position);
    this.state = 'arriving';
    this.patienceMax = 70 * this.personality.patience * game.fx.patience;
    this.patience = this.patienceMax;
    this.talked = false;
    this.seat = null;
    this.idleT = rand(2, 5);
    this.served = false;
  }

  get pos() { return this.ch.root.position; }
  headPos(out = new THREE.Vector3()) { return this.ch.headWorld(out); }

  dispose() {
    this.ch.dispose();
    this.game.ui.removeBubble(this.id);
  }

  say(text, emotion, hold = 2.5) {
    if (emotion) this.ch.setEmotion(emotion, hold + 1);
    const d = this.ch.say(text);
    this.game.showLine(this.name, text, d + 1.2);
    return d;
  }
}

export class CustomerManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnT = 6;
    this.enabled = false;
    this.inChair = null;
  }

  get count() { return this.list.length; }

  spawn(opts = {}) {
    const c = new Customer(this.game, opts);
    c.ch.place(SPOTS.doorOut.clone().add(new THREE.Vector3(rand(-2.5, -1.5), 0, rand(-0.3, 0.3))), 0);
    this.list.push(c);
    this.enter(c);
    return c;
  }

  // a customer already in place (main menu background)
  spawnStatic(opts = {}) {
    const g = this.game;
    const c = new Customer(g, opts.customer || {});
    this.list.push(c);
    c.state = 'menu';
    if (opts.chair) {
      this.inChair = c;
      c.seatedInChair = true;
      g.setChairAngle(0.35, 2);
      c.ch.sitOn({ pos: SPOTS.chair.clone().add(new THREE.Vector3(0, 0, -0.05)), rot: Math.PI, height: g.shop.seatHeight() - 0.03 }, true);
      const cape = spawnProp('Cape');
      c.ch.bones.Chest.add(cape);
      cape.position.set(0, 0.215, 0.005);
      c.cape = cape;
      c.ch.lookAt(new THREE.Vector3(SPOTS.chair.x, 1.2, SPOTS.mirror.z), 0.8);
    } else {
      const seat = g.shop.waitSeats()[opts.seatIndex || 0];
      c.seat = seat;
      c.ch.sitOn({ pos: seat.pos, rot: seat.rot, height: g.shop.has('couch') ? 0.42 : 0.46 }, true);
      if (opts.phone) { c.personality = { ...c.personality, idle: 'phone' }; this.idleBehaviour(c); }
    }
    return c;
  }

  spawnVIP() {
    const v = pick(VIPS);
    const c = this.spawn({ vip: v });
    this.game.ui.toast(`${v.title} ${v.name} is coming in`, 'VIP');
    audio.levelUp();
    return c;
  }

  remove(c) {
    this.list = this.list.filter((x) => x !== c);
    if (this.inChair === c) this.inChair = null;
    if (c.seat) c.seat.taken = null;
    c.dispose();
  }

  async enter(c) {
    const ch = c.ch;
    const shop = this.game.shop;
    await ch.walkTo([SPOTS.doorStep], 'walk');
    shop.openDoor(false, 1.4);
    await ch.walkTo([SPOTS.doorIn, SPOTS.hub.clone().add(new THREE.Vector3(rand(-0.15, 0.15), 0, rand(-0.1, 0.25)))], 'walk');
    // someone already waiting at the counter spot? take a seat instead
    const busy = this.list.some((x) => x !== c && ['looking', 'waitingTalk', 'talking'].includes(x.state));
    if (busy && !c.tutorial) {
      ch.gesture('lookAround', { dur: 2.0 });
      await this.game.dir.wait(1.2).catch(() => {});
      await this.toSeat(c);
      return;
    }
    c.state = 'looking';
    ch.gesture('lookAround', { dur: 2.6 });
    if (!this.game.shop.has('clean')) ch.setEmotion('concerned', 2.5);
    await this.game.dir.wait(2.4).catch(() => {});
    ch.lookAt(this.game.camera, 1);
    c.state = 'waitingTalk';
    if (c.vip) c.say(c.vip.line, 'proud', 3);
    else if (!c.tutorial && chance(0.7)) c.say(pick(['Hey. Got time for one?', 'Hi! Can I get a cut?', 'You open?', 'Morning. One haircut, please.']), 'neutral');
  }

  // player talks to a customer standing at the hub
  async talk(c) {
    if (c.talked) return;
    c.talked = true;
    const seated = c.ch.sitW > 0.5;
    this.stopIdle(c);
    c.state = 'talking';
    const ch = c.ch;
    ch.lookAt(this.game.camera, 1);
    const line = c.vip ? 'The usual for someone like me. Your best work.' : pick(c.personality.greet);
    const d = c.say(line, c.personality.id === 'nervous' ? 'nervous' : c.personality.id === 'impatient' ? 'annoyed' : 'happy', 3);
    this.game.ui.showRequest(c.cut, c, true);
    audio.paperFlick();
    await this.game.dir.wait(Math.max(2.2, d)).catch(() => {});
    this.game.ui.shrinkRequest();
    if (seated) { if (!this.inChair) this.toChair(c); else { c.state = 'waiting'; this.idleBehaviour(c); } return; }
    this.afterTalk(c);
  }

  afterTalk(c) {
    if (!this.inChair) this.toChair(c);
    else this.toSeat(c);
  }

  async toSeat(c) {
    const seats = this.game.shop.waitSeats();
    const free = seats.find((s) => !this.list.some((x) => x.seat === s));
    if (!free) { c.state = 'standing'; return; }
    c.seat = free;
    c.state = 'toSeat';
    const front = free.pos.clone().add(new THREE.Vector3(Math.sin(free.rot) * 0.5, 0, Math.cos(free.rot) * 0.5));
    await c.ch.walkTo([front], 'walk');
    if (c.state !== 'toSeat') return;
    await c.ch.faceTo(free.pos.clone().add(new THREE.Vector3(Math.sin(free.rot), 0, Math.cos(free.rot))));
    await c.ch.sitOn({ pos: free.pos, rot: free.rot, height: this.game.shop.has('couch') ? 0.42 : 0.46 });
    audio.chairThump();
    if (c.state !== 'toSeat') return;
    c.state = 'waiting';
    this.idleBehaviour(c);
  }

  idleBehaviour(c) {
    const kind = c.personality.idle;
    if (kind === 'phone' || (kind !== 'tap' && chance(0.5))) {
      if (!c.phone) {
        c.phone = spawnProp('Phone');
        c.ch.hold('L', c.phone, { pos: [-0.01, -0.085, 0.0], rot: [0, 0, Math.PI / 2], scale: 1 });
      }
      c.ch.gesture('phone');
      c.ch.lookAt(null);
    } else {
      c.ch.lookAt(() => (this.inChair ? this.inChair.headPos() : this.game.camera.position), 0.8);
    }
  }

  stopIdle(c) {
    c.ch.endGesture('phone');
    if (c.phone) { c.ch.held.L?.parent?.remove(c.phone); c.ch.held.L = null; c.phone = null; }
  }

  async toChair(c) {
    if (this.inChair && this.inChair !== c) return;
    this.inChair = c;
    this.stopIdle(c);
    const ch = c.ch;
    c.state = 'toChair';
    if (ch.sitW > 0) { await ch.standUp(); c.seat = null; }
    ch.lookAt(null);
    const shop = this.game.shop;
    // the barber spins the chair toward the customer first
    this.game.setChairAngle(Math.PI);
    const front = SPOTS.chairFront.clone();
    await ch.walkTo([front], 'walk');
    // turn around, back to the chair
    await ch.faceTo(new THREE.Vector3(SPOTS.chair.x, 0, 3));
    await ch.sitOn({ pos: SPOTS.chair.clone().add(new THREE.Vector3(0, 0, -0.05)), rot: 0, height: shop.seatHeight() - 0.03 });
    c.seatedInChair = true;
    audio.chairThump();
    if (!shop.has('chairClassic')) audio.squeak(0.4); else audio.creak();
    this.game.chairBounce(0.6);
    c.state = 'seated';
    ch.lookAt(this.game.camera, 0.7);
  }

  update(dt) {
    const g = this.game;
    // spawning
    if (this.enabled) {
      this.spawnT -= dt;
      const cap = g.shop.waitSeats().length + 2;
      if (this.spawnT <= 0) {
        if (this.list.length < cap) {
          const vipChance = g.level >= 3 ? (g.event?.id === 'vipDay' ? 0.35 : 0.1) : 0;
          if (chance(vipChance) && !this.list.some((x) => x.vip)) this.spawnVIP();
          else this.spawn();
        }
        const base = this.list.length === 0 ? 9 : 26;
        this.spawnT = base / g.fx.arrival * (g.event?.id === 'rush' ? 0.55 : 1) * rand(0.75, 1.25);
      }
    }
    for (const c of this.list) {
      c.ch.update(dt);
      // patience while waiting to be served
      if (['waitingTalk', 'waiting', 'standing', 'seated', 'looking'].includes(c.state) && !c.tutorial && g.state !== 'barber') {
        const rate = c.state === 'seated' ? 0.6 : 1;
        c.patience -= dt * rate;
        if (c.patience < c.patienceMax * 0.35 && !c.sighed) { c.sighed = true; c.ch.gesture('sigh'); c.ch.setEmotion('annoyed', 2); if (chance(0.6)) c.say(pick(c.personality.wait), 'annoyed'); }
        if (c.patience <= 0) this.leaveAngry(c);
      }
      // waiting customers occasionally glance around
      if (c.state === 'waiting') {
        c.idleT -= dt;
        if (c.idleT < 0) {
          c.idleT = rand(4, 9);
          if (chance(0.3) && !c.phone) c.ch.gesture('lookAround', { dur: 2.4 });
        }
      }
    }
  }

  async leaveAngry(c) {
    if (c.state === 'leaving') return;
    c.state = 'leaving';
    this.stopIdle(c);
    if (this.inChair === c) this.inChair = null;
    c.say(pick(['Forget it.', 'I’m out. Unbelievable.', 'Wow. Okay. Bye.']), 'annoyed', 3);
    this.game.loseCustomer(c);
    if (c.ch.sitW > 0) await c.ch.standUp();
    if (c.seat) c.seat = null;
    await this.walkOut(c, 'speedwalk');
  }

  async walkOut(c, gait = 'walk') {
    c.state = 'leaving';
    c.ch.lookAt(null);
    await c.ch.walkTo([SPOTS.hub, SPOTS.doorIn], gait);
    this.game.shop.openDoor(gait !== 'walk', 1.3);
    await c.ch.walkTo([SPOTS.doorStep, SPOTS.doorOut.clone().add(new THREE.Vector3(rand(-6, -4), 0, 0.4))], gait);
    this.remove(c);
  }

  // the next customer to bring to the chair (talked & waiting longest)
  nextWaiting() {
    return this.list.find((c) => c.talked && ['waiting', 'standing'].includes(c.state));
  }

  clear() {
    if (this.game.employee?.customer) this.game.employee.reset();
    for (const c of [...this.list]) this.remove(c);
    this.inChair = null;
  }
}

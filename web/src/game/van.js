// Holgs & Bonnie: a blue van that cruises the street every now and then. If you're out on
// the pavement it pulls up next to you, the side door slides open and Bonnie offers you a
// ride. Get in and they lock the doors, take a hundred bucks off you and dump you in an
// alley a couple of hours later (a full cutscene). Stay out and they drive on.
// Online the host drives the van; anyone can (foolishly) get in.
import * as THREE from 'three';
import { StreetNPC } from './story.js';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { PLAYER_LOOK } from '../chars/looks.js';
import { ROOM } from '../world/shop.js';
import { makeVan, VAN } from '../world/van.js';
import { audio } from '../audio/audio.js';
import { pick, rand, clamp, damp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FZ = ROOM.z1 + 0.24;
const LANE = FZ + 5.6;        // the near lane (traffic going +x)
const KERB = FZ + 4.35;       // pulled over at the kerb
const HIDE_X = -66;
const PRICE = 100;
const PARKED_NEAR = [-8.5, 16, -33, 40];   // parked cars on our side of the street (see shop.js)

const base = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#111', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#d8c06a', Button: '#2a2420', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#2a2a2e', TopDark: '#1f2a44' };
const HOLGS = { colors: { ...base, Skin: '#e3b08c', Top: '#1f2a44', Sleeve: '#1f2a44', Pants: '#2b2f38', Shoes: '#1b1b1d', Hair: '#2e2018', Iris: '#3b2a1e' },
  accessories: ['jacket', 'glasses', 'chain', 'moustache', 'belly'], scale: 1.06, width: 1.12, hunch: 0.15 };
const BONNIE = { colors: { ...base, Skin: '#f1c9a8', Top: '#d6457a', Sleeve: '#d6457a', Pants: '#2b2f38', Shoes: '#e8e2d6', Hair: '#e6c46a', Iris: '#4a6a7a', Frame: '#d6457a' },
  accessories: ['jacket', 'glasses', 'earring'], scale: 0.94, width: 0.92, hunch: 0 };

const L = {
  pullUp: ['Heyyy! You! Yeah, you with the scissors!', 'Hop in, sweetie! Free ride! Anywhere you want!', 'Need a lift? We’re going your way. Whatever way that is.'],
  wait: [
    'Come on, we’ve got snacks! And a little tree that smells like vanilla!',
    'It’s a FREE ride. Free! When did you last get anything for free?',
    'Holgs, tell them we’re nice.',
    'We don’t bite. Holgs bites a little. But only sandwiches.',
    'Door’s open, sweetie. Clock’s ticking.',
    'Look at this van. Does this look like a bad idea?',
  ],
  holgsWait: ['We’re nice.', 'Very nice. Get in.', 'Seatbelts are optional.'],
  leave: ['Your loss, sweetie! Free rides don’t grow on trees!', 'Fine! More snacks for us!', 'Next time, scissors! We’ll be back!'],
  driveBy: ['Free riiiides!', 'Woo-hoo! Holgs, honk!', 'Hey barber! Looking good!'],
};

export class RideVan {
  constructor(game) {
    this.game = game;
    this.phase = 'idle';
    this.nextT = rand(150, 220);
    this.v = 0;
    this.doorK = 0; this.doorTarget = 0;
    this.remote = null;
    this.cut = false;
  }

  get active() { return this.phase !== 'idle'; }

  build() {
    const g = this.game;
    const van = this.van = makeVan();
    van.position.set(HIDE_X, -0.07, LANE);
    van.visible = false;
    g.scene.add(van);
    // the two of them, sitting up front
    this.holgs = new StreetNPC(g, { name: 'Holgs', look: HOLGS, voice: { pitch: 92, rate: 0.9, wobble: 0.08, vol: 0.11 },
      hair: { color: '#2e2018', style: { top: 0.08, front: 0.05, left: 0.12, right: 0.12, back: 0.14, fuzz: 0.02, bald: 0.7 }, cut: 0.2 } });
    this.holgs.ch.setCap('#111214');
    this.bonnie = new StreetNPC(g, { name: 'Bonnie', look: BONNIE, voice: { pitch: 232, rate: 1.12, wobble: 0.14, vol: 0.11 },
      hair: { color: '#e6c46a', style: { top: 0.6, front: 0.55, left: 0.78, right: 0.78, back: 0.9, fuzz: 0.04 }, cut: 0.5 } });
    for (const [n, k] of [[this.holgs, 'driver'], [this.bonnie, 'passenger']]) {
      const [x, z] = VAN.seats[k];
      n.seatL = V(x, 0, z);
      n.noLod = true;
      n.ch.sitOn({ pos: this.toWorld(n.seatL), rot: Math.PI / 2, height: 0.45 }, true);
      n.show(false);
    }
    // online: the host drives
    g.netActors.set('van', {
      owned: () => g.isHost && this.active,
      get: () => [+van.position.x.toFixed(2), +van.position.z.toFixed(2), 0, this.doorTarget ? 1 : 0, van.visible ? 1 : 0],
      remote: (v) => { if (!g.isHost) this.remote = { x: v[0], z: v[1], door: v[3], vis: v[4] }; },
      release: () => { if (this.remote) { this.remote = null; if (!this.cut) this.hide(); } },
    });
  }

  toWorld(l, y = 0) { const p = this.van.position; return V(p.x + l.x, y, p.z + l.z); }
  doorPoint() { const p = this.van.position; return V(p.x + (VAN.door.x0 + VAN.door.x1) / 2, 0, p.z - VAN.W / 2 - 0.55); }

  interactables(I) {
    I({ id: 'van', label: () => this.label(), pos: () => this.doorPoint().setY(1.2), radius: 3.2,
      action: () => { this.getIn().catch((e) => { console.error(e); this.endCut(); }); return 'van'; } });
  }

  label() {
    const g = this.game;
    if (g.state !== 'play' || !g.player.control || this.cut || this.doorK < 0.8 || !this.van.visible) return null;
    const d = this.doorPoint().distanceTo(V(g.player.pos.x, 0, g.player.pos.z));
    return d < 2.0 ? 'Get in the van' : null;
  }

  // ---------------------------------------------------------------- driving (host / offline)
  start() {
    const g = this.game;
    this.phase = 'drive';
    this.v = 9;
    this.stopX = null;
    this.drivenBy = false;
    this.van.position.set(-62, -0.07, LANE);
    this.van.visible = true;
    this.holgs.show(true); this.bonnie.show(true);
    this.saidBy = false;
    void g;
  }

  hide() {
    this.phase = 'idle';
    this.van.visible = false;
    this.van.position.x = HIDE_X;
    this.doorK = this.doorTarget = 0;
    this.holgs.show(false); this.bonnie.show(false);
    this.nextT = rand(220, 340);
    this.motor?.stop?.(); this.motor = null;
  }

  playerOnPavement() {
    const g = this.game, P = g.player.pos;
    return g.state === 'play' && P.z > FZ + 0.3 && P.z < FZ + 3.0 && Math.abs(P.x) < 40;
  }

  update(dt) {
    const g = this.game, van = this.van;
    if (!van) return;
    // a teammate's van
    if (this.remote && !g.isHost && !this.cut) {
      const r = this.remote;
      if (!r.vis) { if (van.visible) this.hide(); }
      else {
        if (!van.visible) { van.visible = true; this.holgs.show(true); this.bonnie.show(true); van.position.set(r.x, -0.07, r.z); this.phase = 'remote'; }
        const dx = r.x - van.position.x;
        this.v = damp(this.v, Math.abs(dx) > 0.05 ? dx / 0.25 : 0, 6, dt);
        van.position.x = Math.abs(dx) > 8 ? r.x : damp(van.position.x, r.x, 6, dt);
        van.position.z = damp(van.position.z, r.z, 6, dt);
        this.doorTarget = r.door;
      }
    } else if (!this.cut) this.drive(dt);
    else this.cutUpdate(dt);
    // door, wheels, seats, sway
    this.doorK = damp(this.doorK, this.doorTarget, this.doorTarget ? 5 : 7, dt);
    const door = van.userData.door;
    door.position.x = VAN.door.x0 - this.doorK * 1.42;
    door.position.z = -VAN.W / 2 + 0.01 - Math.min(1, this.doorK * 3) * 0.1;
    for (const w of van.userData.wheels) w.rotation.z -= this.v * dt / 0.4;
    const tree = van.userData.tree;
    tree.rotation.z = Math.sin(performance.now() / 300) * 0.25 * clamp(this.v / 6, 0.2, 1);
    van.rotation.z = damp(van.rotation.z, clamp(-(this.v - (this._pv ?? this.v)) / dt * 0.004, -0.04, 0.04), 4, dt);
    this._pv = this.v;
    for (const n of [this.holgs, this.bonnie]) {
      n.update(dt);
      if (!n.shown) continue;
      const p = this.toWorld(n.seatL);
      n.ch.seat.pos.copy(p);
      n.ch.root.position.set(p.x, n.ch.root.position.y + van.position.y + VAN.floor + 0.05, p.z);
    }
    if (this.stand) {
      const s = this.stand;
      s.ch.update(dt);
      if (s.seated) { const p = this.toWorld(s.seatL); s.ch.seat.pos.copy(p); s.ch.root.position.set(p.x, s.ch.root.position.y + van.position.y + VAN.floor + 0.05, p.z); }
      else s.ch.root.position.y += s.y;
    }
    // you can't walk through it
    if (van.visible && g.state === 'play' && !g.knockedOut) {
      const P = g.player.pos, dx = P.x - van.position.x, dz = P.z - van.position.z;
      if (Math.abs(dx) < VAN.L / 2 + 0.25 && Math.abs(dz) < VAN.W / 2 + 0.25) {
        if (this.v > 3) g.runOver(van.position.clone(), this.v);
        else if (VAN.L / 2 + 0.25 - Math.abs(dx) < VAN.W / 2 + 0.25 - Math.abs(dz)) P.x = van.position.x + Math.sign(dx || 1) * (VAN.L / 2 + 0.25);
        else P.z = van.position.z + Math.sign(dz || 1) * (VAN.W / 2 + 0.25);
      }
    }
  }

  drive(dt) {
    const g = this.game, van = this.van, P = g.player.pos;
    if (this.phase === 'idle') {
      if (!g.save.tutorialDone || g.state === 'menu' || g.state === 'intro') return;
      this.nextT -= dt;
      const busy = ['beg', 'toShop', 'talk'].includes(g.story?.julian?.phase) || g.story?.thief || g.mart?.chase;
      if (this.nextT <= 0 && !busy && !g.street?.cars?.some((c) => c.dir > 0 && c.obj.position.x < -40)) this.start();
      return;
    }
    const x = van.position.x;
    if (this.phase === 'drive') {
      // spot you on the pavement ahead: pull over right next to you
      if (this.stopX == null && !this.passed && this.playerOnPavement() && P.x - x > 9 && P.x - x < 30) {
        this.stopX = P.x - (VAN.door.x0 + VAN.door.x1) / 2;
        // don't pull over into a parked car: stop just past it instead
        for (const px of PARKED_NEAR) if (Math.abs(this.stopX - px) < 4.7) this.stopX = px + 4.8;
        const n = this.bonnie; n.ch.lookAt(g.camera, 1);
        this.bonnie.say(pick(L.pullUp), 'excited');
      }
      if (this.stopX != null) {
        const left = this.stopX - x;
        const want = clamp(Math.sqrt(Math.max(0, left) * 5), 0, 9);
        this.v = want < this.v ? Math.max(want, this.v - 6 * dt) : damp(this.v, want, 2.5, dt);
        van.position.z = damp(van.position.z, left < 14 ? KERB : LANE, 1.6, dt);
        if (left < 0.15 && this.v < 0.4) { this.v = 0; this.phase = 'wait'; this.waitT = 22; this.callT = 3.2; this.doorTarget = 1; audio.squeak?.(0.4); audio.thud?.(0.4); }
      } else {
        this.v = damp(this.v, 9, 1.2, dt);
        van.position.z = damp(van.position.z, LANE, 1.2, dt);
        // driving past you: they shout out the window
        if (!this.saidBy && Math.abs(P.x - x) < 10 && P.z > FZ - 0.5) { this.saidBy = true; this.bonnie.say(pick(L.driveBy), 'excited'); g.street?.honk?.(van.position); }
      }
      van.position.x += this.v * dt;
      if (van.position.x > 62) this.hide();
    } else if (this.phase === 'wait') {
      this.bonnie.ch.lookAt(g.camera, 1);
      this.holgs.ch.lookAt(g.camera, 0.5);
      this.waitT -= dt; this.callT -= dt;
      const d = this.doorPoint().distanceTo(V(P.x, 0, P.z));
      if (this.callT <= 0 && d < 14) {
        this.callT = rand(5, 7);
        if (Math.random() < 0.3) this.holgs.say(pick(L.holgsWait), 'smug');
        else { this.bonnie.ch.gesture('wave', { target: () => g.camera.position }); this.bonnie.say(pick(L.wait), 'excited'); }
      }
      if (this.waitT <= 0 || d > 22) this.driveOff(true);
    } else if (this.phase === 'leaving') {
      this.v = damp(this.v, 11, 1.4, dt);
      van.position.z = damp(van.position.z, LANE, 1.5, dt);
      van.position.x += this.v * dt;
      if (van.position.x > 62) this.hide();
    }
  }

  driveOff(say = false) {
    this.doorTarget = 0;
    this.phase = 'leaving';
    this.passed = true;
    if (say) this.bonnie.say(pick(L.leave), 'annoyed');
    audio.doorSlam?.();
    setTimeout(() => { this.passed = false; }, 20000);
  }

  // a teammate got in: our van leaves (it's off with them)
  remoteTaken() {
    if (!this.game.isHost || this.cut || this.phase !== 'wait') return;
    this.driveOff(false);
  }

  // ---------------------------------------------------------------- the kidnapping
  async getIn() {
    const g = this.game, dir = g.dir, van = this.van, p = g.player;
    if (this.cut) return;
    this.cut = true;
    if (g.coop && !g.isHost) g.netOut.push({ bus: 1 });
    const wait = (s) => dir.wait(s).catch(() => {});
    p.control = false;
    g.knockedOut = true;              // traffic leaves you alone during the scene
    g.ui.showHud(false);
    g.ui.letterbox(true);
    g.ui.tip?.(null);
    for (const a of ['L', 'R']) p.arms[a].set({ visible: false });
    this.phase = 'cut';
    this.v = 0;
    // you, as seen from the pavement
    const ch = new Character(g.scene, { colors: PLAYER_LOOK.colors, name: 'You', voice: { pitch: 125, rate: 1, wobble: 0.1, vol: 0.1 } });
    const hair = new HairSystem({ color: PLAYER_LOOK.colors.Hair, skin: PLAYER_LOOK.colors.Skin, layers: 6 });
    hair.attach(ch.bones.Head); hair.setStyle({ top: 0.35, front: 0.3, left: 0.2, right: 0.2, back: 0.24, fuzz: 0.03 }, 0.3); ch.hair = hair;
    const P0 = V(p.pos.x, 0, p.pos.z);
    ch.place(P0, Math.atan2(this.doorPoint().x - P0.x, this.doorPoint().z - P0.z));
    this.stand = { ch, y: 0, seated: false, seatL: V(VAN.seats.bench[0] + 0.05, 0, VAN.seats.bench[1]) };
    const dp = this.doorPoint();
    dir.takeCamera(V(P0.x - 3.0, 1.75, FZ + 0.35), V(dp.x, 1.2, dp.z + 0.6));
    dir.cam.handheld = 0.6;
    this.bonnie.ch.lookAt(ch.bones.Head, 1);
    this.bonnie.ch.gesture('wave', { target: () => ch.headWorld(V()) });
    this.bonnie.say('Ooh! We’ve got one, Holgs!', 'excited');
    await ch.walkTo([dp], 'walk');
    // step up into the van
    const inL = V(VAN.inside[0], 0, VAN.inside[1]);
    const t0 = dir.timers.length; void t0;
    const climb = ch.walkTo([this.toWorld(inL)], 'walk');
    for (let k = 0; k <= 10; k++) { this.stand.y = (van.position.y + VAN.floor + 0.05) * k / 10; await wait(0.05); }
    await climb;
    dir.move(V(van.position.x - 0.6, 1.9, FZ + 1.4), V(van.position.x, 1.3, van.position.z), 1.4);
    await ch.walkTo([this.toWorld(V(VAN.seats.bench[0] + 0.5, 0, VAN.seats.bench[1]))], 'walk');
    await ch.sitOn({ pos: this.toWorld(this.stand.seatL), rot: Math.PI / 2, height: 0.45 });
    this.stand.seated = true;
    // slam, lock
    this.doorTarget = 0;
    await wait(0.35);
    audio.doorSlam?.();
    g.player.shake = 0.2;
    await wait(0.3);
    audio.keys?.();
    audio.tone?.(1400, 0.05, { type: 'square', vol: 0.05 });
    audio.tone?.(900, 0.06, { type: 'square', vol: 0.05, when: 0.08 });
    this.holgs.say('Doors locked.', 'smug');
    await wait(1.4);
    // inside: from behind the bench
    van.userData.lamp.intensity = 0.8;
    this.camIn = { pos: V(-2.4, VAN.floor + 1.5, 0.55), look: V(1.8, VAN.floor + 1.0, -0.1) };
    this.v = 0.5;
    this.phase = 'cut-drive';
    this.bonnie.ch.lookAt(dir.cam.pos, 1);
    ch.setEmotion('nervous', 20);
    await this.line(this.bonnie, 'Comfy back there, sweetie?', 'happy');
    await this.line(null, 'Uh... where exactly are we going?');
    await this.line(this.holgs, 'Scenic route.', 'smug');
    // from the dashboard, looking back at you
    this.camIn = { pos: V(1.95, VAN.floor + 1.45, 0.05), look: V(-1.6, VAN.floor + 0.95, -0.3) };
    ch.lookAt(this.bonnie.ch.bones.Head, 1);
    this.bonnie.ch.gesture('presentL', { target: () => ch.headWorld(V()) });
    await this.line(this.bonnie, 'Wallet, please. Nice and slow.', 'smug');
    ch.setEmotion('horrified', 6);
    ch.gesture('coverHead', { dur: 1.0 });
    await this.line(null, 'This isn’t a free ride, is it?');
    this.holgs.ch.lookAt(dir.cam.pos, 0.7);
    await this.line(this.holgs, 'Nothing in life is free, barber.', 'smug');
    audio.coin?.(); audio.paperFlick?.();
    g.addMoney(-PRICE);
    g.ui.toast(`−$${PRICE} · Holgs & Bonnie`, 'Robbed');
    await this.line(this.bonnie, 'Thanks, sweetie! Ooh, a hundred! Holgs, we’re eating good tonight!', 'excited');
    // outside: the van tears past
    this.camIn = null;
    van.userData.lamp.intensity = 0;
    for (const c of g.street?.cars || []) if (c.dir > 0) c.obj.position.x = 70;
    const cx = 8;
    van.position.x = cx - 26;
    van.position.z = LANE;
    this.v = 13;
    dir.takeCamera(V(cx, 0.75, FZ + 3.35), V(cx - 20, 1.2, LANE));
    dir.track(() => van.position.clone().setY(1.1), 7);
    dir.cam.handheld = 1.2;
    audio.noiseBurst?.(0.9, { vol: 0.12, freq: 2400, q: 1.5 });
    await wait(1.4);
    g.street?.honk?.(van.position);
    this.bonnie.say('Byeee!', 'excited');
    await wait(1.8);
    await g.ui.fade(true, 700);
    // two hours later, in an alley
    this.endVanScene();
    g.ui.banner('Two hours later…', '', '', 1500);
    await wait(1.6);
    const A = V(24.5, 0, FZ - 1.9);
    p.place(A, Math.PI, 0);
    dir.takeCamera(V(A.x, 0.28, A.z), V(A.x + 0.4, 3.2, A.z + 1.2));
    dir.cam.handheld = 1.4;
    g.clock && (g.clock.hour = Math.min(20.5, g.clock.hour + (g.clock.open ? 2 : 0)));
    await g.ui.fade(false, 900);
    audio.groan ? audio.groan() : audio.sigh?.();
    await wait(1.0);
    await dir.move(V(A.x, 1.62, A.z), V(A.x, 1.45, A.z + 4), 2.2);
    dir.releaseCamera();
    g.ui.letterbox(false);
    g.ui.showHud(true);
    g.ui.banner('Kidnapped!', `−$${PRICE}`, 'Never get in the van.', 2600);
    g.save.stats.kidnapped = (g.save.stats.kidnapped || 0) + 1;
    g.persist();
    g.checkAchievements?.();
    this.endCut();
  }

  async line(npc, text, emo) {
    const g = this.game;
    if (npc) await npc.say(text, emo);
    else { g.showLine('You', text, 2.2); this.stand?.ch.say?.(text); await g.dir.wait(Math.max(1.6, text.length * 0.055)).catch(() => {}); }
  }

  endVanScene() {
    if (this.stand) { this.stand.ch.dispose?.(); this.stand = null; }
    this.camIn = null;
    this.van.userData.lamp.intensity = 0;
    this.hide();
  }

  endCut() {
    const g = this.game;
    if (this.stand) this.endVanScene();
    this.cut = false;
    g.knockedOut = false;
    if (g.dir.cam.active) g.dir.releaseCamera();
    g.ui.letterbox(false);
    g.ui.showHud(true);
    if (g.state === 'play') g.player.control = true;
  }

  // the cutscene's own frame: drive in circles nobody can see, keep the camera inside
  cutUpdate(dt) {
    if (this.phase !== 'cut-drive') return;
    const van = this.van, dir = this.game.dir;
    if (this.camIn) {
      this.v = damp(this.v, 10, 0.8, dt);
      van.position.x += this.v * dt;
      if (van.position.x > 48) van.position.x = -48;
      van.position.z = damp(van.position.z, LANE, 1.5, dt);
      dir.cam.pos.copy(this.toWorld(this.camIn.pos, this.camIn.pos.y));
      dir.cam.look.copy(this.toWorld(this.camIn.look, this.camIn.look.y));
      dir.cam.curLook?.copy(dir.cam.look);
      dir.cam.tween = null; dir.cam.track = null;
      dir.cam.handheld = 0.9 + Math.min(1, this.v / 10) * 0.6;
    } else {
      van.position.x += this.v * dt;
    }
  }
}

// How customers react to their haircut: in the mirror, then while paying and leaving.
// One star is a full meltdown (cape thrown, coins on the floor, bin kicked, door slammed),
// five stars a celebration. Everything is comic but driven by the same rig and physics.
import * as THREE from 'three';
import { spawnProp } from '../world/props.js';
import { propMaterial } from '../render/materials.js';
import { SPOTS, ROOM } from '../world/shop.js';
import { audio } from '../audio/audio.js';
import { pick, rand, chance, clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const LINES = {
  1: {
    mirror: ['WHAT DID YOU DO?!', 'My head looks like a lawn mower accident!', 'I look like a boiled egg with opinions!', 'Is this... a cry for help?', 'My dog has better hair. My DOG.'],
    exit: ['I’m NEVER coming back!', 'I’m telling EVERYONE about this place!', 'You owe me a hat! A big one!', 'I’m calling my mom. And a lawyer. In that order!', 'One star! ONE! And that’s generous!'],
    coins: ['Here. Keep the change. Pick it up yourself!', 'There’s your money. Off the floor!', 'You want paying? FETCH!'],
  },
  2: {
    mirror: ['Oh no. Oh no no no.', 'I’m wearing a hat for a month.', 'My girlfriend is going to laugh at me.', 'It’s... symmetrical. Ish. No. It isn’t.', 'Why is one side... bigger?'],
    exit: ['I’ll... manage. Somehow.', 'Hat shop’s still open, right?', 'Hair grows back. Hair grows back. Hair grows back.'],
  },
  3: {
    mirror: ['It’s... okay. Yeah. Okay.', 'Hm. Not bad. Not great. Hm.', 'It’ll grow.', 'Acceptable. Like airport food.'],
    exit: ['See you around.', 'Thanks. I guess.', 'Okay. Bye.'],
  },
  4: {
    mirror: ['Oh yeah. That’s clean.', 'Look at that! Sharp!', 'Nice, man. Real nice.'],
    exit: ['See you next time!', 'Thanks, man!', 'I’ll tell my friends.'],
  },
  5: {
    mirror: ['BRO COOKED ME.', 'Who IS that handsome guy?!', 'I look like a movie poster!', 'Mom, come get me, I’m famous!', 'This is the best day of my life. Including my wedding.'],
    exit: ['Keep the change! KEEP IT ALL!', 'I’m coming back every week!', 'You’re a legend! A LEGEND!'],
  },
};

// a crumpled paper ball for the trash spill
let paperGeo = null;
function paperBall() {
  if (!paperGeo) {
    paperGeo = new THREE.IcosahedronGeometry(0.035, 1);
    const p = paperGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + Math.random() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    paperGeo.computeVertexNormals();
  }
  const m = new THREE.Mesh(paperGeo, propMaterial('Paper'));
  m.castShadow = true;
  return m;
}

export class Reactions {
  constructor(game) {
    this.game = game;
    this.loose = [];   // coins/notes on the floor the player can pick up
    this.bin = null;
    this.timers = [];
  }

  // game-time timer (pauses with the game, works in the test harness)
  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  // ---------------------------------------------------------------- mirror
  async mirror(c, result) {
    const g = this.game, dir = g.dir, ch = c.ch, st = result.stars;
    const at = (dx) => V(SPOTS.chair.x + dx, 1.25, SPOTS.mirror.z);
    // big reactions cut to the face: a quick push-in from the mirror side
    const faceCam = (dist = 0.62, side = 0.12, dur = 0.45) => {
      const hp = c.headPos();
      dir.move(V(hp.x + side, hp.y + 0.02, hp.z - dist), hp.clone().add(V(0, -0.05, 0)), dur);
    };
    let line;
    if (st >= 5) {
      ch.setEmotion('surprised');
      await dir.wait(0.5);
      faceCam(0.7, 0.18, 0.5);
      ch.setEmotion('starstruck', 5);
      g.exclaim.show(c.ch, 2.6, 'sparkle');
      ch.gesture('fistPump');
      await dir.wait(0.9);
      g.exclaim.show(c.ch, 2.4, 'hearts');
      line = pick([...LINES[5].mirror, ...(c.personality.happy || [])]);
    } else if (st === 4) {
      ch.setEmotion('happy', 4);
      ch.gesture('thumbsUp');
      line = pick([...LINES[4].mirror, ...(c.personality.happy || [])]);
    } else if (st === 3) {
      ch.setEmotion('confused', 3);
      g.exclaim.show(c.ch, 1.6, '?');
      ch.lookAt(at(-0.25), 1); await dir.wait(0.5);
      ch.lookAt(at(0.25), 1); await dir.wait(0.5);
      ch.lookAt(at(0), 1);
      ch.gesture('shrug');
      line = pick(LINES[3].mirror);
    } else if (st === 2) {
      ch.setEmotion('confused');
      ch.lookAt(at(-0.3), 1); await dir.wait(0.55);
      ch.lookAt(at(0.3), 1); await dir.wait(0.55);
      ch.lookAt(at(0), 1);
      faceCam(0.75, -0.15, 0.9);
      ch.setEmotion('devastated', 6);
      ch.flush('#d9d6c8', 0.25, 4);   // goes a bit pale
      g.exclaim.show(c.ch, 4.5, 'cloud');
      ch.gesture('facepalm');
      await dir.wait(0.8);
      line = pick([...LINES[2].mirror, ...(c.personality.bad || [])]);
    } else {
      // the double take
      ch.setEmotion('neutral');
      ch.lookAt(at(0), 1);
      await dir.wait(0.5);
      ch.lookAt(at(-0.4), 1); await dir.wait(0.25);
      ch.lookAt(at(0), 1);
      faceCam(0.55, 0.08, 0.25);
      ch.setEmotion('horrified', 3);
      audio.gasp();
      g.exclaim.show(c.ch, 1.2, '!');
      g.player.shake = 0.3;
      ch.gesture('coverHead');
      await dir.wait(1.4);
      // ...then the anger rises
      ch.setEmotion('furious', 8);
      ch.flush('#d8402c', 0.6, 8);
      g.exclaim.show(c.ch, 6, 'anger');
      g.exclaim.show(c.ch, 2.2, 'steam');
      ch.gesture('rage');
      line = pick(LINES[1].mirror);
    }
    c.reactionLine = line;
    const d = c.say(line, null, 0, st <= 1 ? { pitch: c.ch.voice.pitch * 1.25, rate: 1.25, vol: 0.13 } : null);
    await dir.wait(d + 0.6);
    if (st >= 5 && !c.tutorial) {
      // selfie
      c.selfie = spawnProp('Phone');
      ch.hold('R', c.selfie, { pos: [0.01, -0.09, 0.0], rot: [Math.PI / 2, 0, 0] });
      ch.gesture('selfie');
      await dir.wait(1.2);
      audio.tone(1800, 0.05, { vol: 0.08 }); audio.noiseBurst(0.06, { vol: 0.12, freq: 3000 });
      g.ui.flash?.();
      await dir.wait(1.1);
      ch.held.R?.parent?.remove(c.selfie); ch.held.R = null;
    }
  }

  // ---------------------------------------------------------------- leaving
  // returns true when it handled payment itself
  async leave(c, pay, stars) {
    if (stars <= 1) { await this.meltdown(c, pay); return true; }
    return false;
  }

  // one star: up out of the chair, cape thrown, coins on the floor, bin kicked, door slammed
  async meltdown(c, pay) {
    const g = this.game, dir = g.dir, ch = c.ch;
    ch.setEmotion('furious', 20);
    ch.flush('#d8402c', 0.65, 14);
    // he does not wait for the chair: spins it himself and jumps out
    g.setChairAngle(Math.PI, 6);
    await dir.wait(0.5);
    // rips the cape off and flings it
    const cape = c.cape;
    if (cape) {
      c.cape = null;
      cape.updateMatrixWorld(true);
      const wp = cape.getWorldPosition(V(0, 0, 0)), wq = cape.getWorldQuaternion(new THREE.Quaternion());
      g.scene.attach(cape);
      cape.position.copy(wp); cape.quaternion.copy(wq);
      const f = V(Math.sin(ch.yaw), 0, Math.cos(ch.yaw));
      g.physics.add(cape, { tag: 'cape', r: 0.18, vel: f.clone().multiplyScalar(2.2).add(V(0.6, 2.6, 0)), ang: V(2, 6, 1), bounce: 0.05, friction: 2, flat: true, drag: 1.6, lift: -0.16,
        sound: (v) => audio.cloth(Math.min(1, v), 0.2) });
      audio.capeSnap(); audio.whoosh(0.8);
      g.shop.slots.capeHook.visible = true;
    }
    await ch.standUp();
    c.seatedInChair = false;
    g.customers.inChair = null;
    // marches up to you
    ch.lookAt(g.camera, 1);
    await ch.walkTo([V(SPOTS.chair.x + 0.2, 0, SPOTS.chair.z + 0.4)], 'storm');
    await ch.faceTo(g.camera.position);
    g.exclaim.show(ch, 5, 'anger');
    ch.gesture('pointAccuse', { target: () => g.camera.localToWorld(V(0.22, -0.12, 0)) });
    const l1 = pick(LINES[1].exit);
    let d = c.say(l1, null, 0, { pitch: ch.voice.pitch * 1.3, rate: 1.3, vol: 0.14 });
    g.player.shake = 0.35;
    await dir.wait(d + 0.3);
    // pays the bare minimum, thrown on the floor
    const money = Math.max(1, Math.round(pay.pay * 0.4));
    const l2 = pick(LINES[1].coins);
    d = c.say(l2, null, 0, { pitch: ch.voice.pitch * 1.2, rate: 1.2, vol: 0.12 });
    ch.reach('R', ch.root.localToWorld(V(-0.15, 1.1, 0.35)), { speed: 6, hand: 'fist' });
    await dir.wait(0.5);
    ch.reach('R', ch.root.localToWorld(V(-0.1, 0.8, 0.45)), { speed: 18, hand: 'open', fingers: V(0, -1, 0.4), palm: V(0, -1, 0) });
    await dir.wait(0.12);
    this.scatterCoins(ch.handWorld('R', V(0, 0, 0)), money, V(Math.sin(ch.yaw), 0, Math.cos(ch.yaw)));
    audio.whoosh(0.5);
    ch.release('R');
    await dir.wait(Math.max(0.6, d - 0.4));
    g.enterFP();
    g.ui.toast(`${c.name} threw ${'$' + money} on the floor`, 'Rage');
    // now he stomps slowly towards the door, muttering. This is your moment.
    this.startEject(c);
  }

  // ---------------------------------------------------------------- the bouncer
  // phases: walk (slowly to the door, can be hit) -> fly (knocked through the air)
  // -> down (lying there, can be grabbed) -> held (in your hands) -> fly ... -> flee
  startEject(c) {
    const g = this.game, ch = c.ch;
    c.state = 'ejecting';
    ch.lookAt(null);
    ch.onStomp = (who) => g.physics.impulse(who.root.position, 0.8, 1.2, 0.8);
    this.eject = { c, phase: 'walk', t: 0, mutterT: 1.2, hits: 0 };
    ch.walkTo([SPOTS.hub, SPOTS.doorIn], 'stomp');
    g.ui.tip(g.input.touch ? 'Throw him out: walk up and tap' : 'Want them gone faster? Walk up — kick or punch (E)', 'E');
    this.later(4, () => g.ui.tip(null));
  }

  // what the bouncer prompt says right now (null = nothing to do)
  bouncerLabel() {
    const E = this.eject;
    if (!E || this.game.state !== 'play') return null;
    const g = this.game, ch = E.c.ch;
    const d = (E.center ? E.center.clone().setY(0) : ch.root.position).distanceTo(g.player.pos);
    if (E.phase === 'walk' && d < 1.7) {
      const f = V(Math.sin(ch.yaw), 0, Math.cos(ch.yaw));
      const toMe = g.player.pos.clone().sub(ch.root.position).setY(0).normalize();
      return f.dot(toMe) < 0 ? 'Kick in the butt' : 'Punch in the face';
    }
    if (E.phase === 'down' && d < 1.6) return 'Grab';
    if (E.phase === 'held') return 'Throw out!';
    return null;
  }

  bouncerPos() {
    const E = this.eject;
    if (!E) return V(0, -9, 0);
    return (E.center || E.c.ch.root.position).clone().setY(E.phase === 'down' ? 0.25 : 1.0);
  }

  bouncerAction() {
    const E = this.eject;
    if (!E) return;
    const g = this.game, ch = E.c.ch;
    if (E.phase === 'walk') {
      const f = V(Math.sin(ch.yaw), 0, Math.cos(ch.yaw));
      const away = ch.root.position.clone().sub(g.player.pos).setY(0).normalize();
      const behind = f.dot(away) > 0;
      const R = g.player.arms.R;
      if (behind) {
        // the boot: camera dips, a whoosh, and he flies face-first
        g.player.shake = 0.5;
        g.player.kick = 0.35;
        audio.whoosh(1);
        this.later(0.12, () => {
          audio.thud(1); audio.tone(180, 0.25, { type: 'square', vol: 0.06, slide: 2.6 });
          E.c.say(pick(['OWWW! MY BEHIND!', 'HEY! That’s assault!', 'You can’t kick customers!!', 'AAAAAH!']), null, 0, { pitch: ch.voice.pitch * 1.5, rate: 1.5, vol: 0.14 });
          this.launch(E, away.multiplyScalar(4.6).add(V(0, 3.6, 0)), 'faceplant');
          g.save.stats.kicks = (g.save.stats.kicks || 0) + 1;
        });
      } else {
        // the fist
        R.set({ visible: true, pos: V(0.12, -0.25, -0.3), fingers: V(0, 0.1, -1), palm: V(-1, 0, 0), pose: 'fist', speed: 40 });
        this.later(0.08, () => R.set({ pos: V(0.05, -0.12, -0.62) }));
        this.later(0.16, () => {
          audio.thud(1); audio.noiseBurst(0.08, { vol: 0.25, freq: 900, q: 1 });
          g.player.shake = 0.45;
          E.c.say(pick(['OOF!', 'My NOSE!', 'You punched me?!', 'Ow ow ow ow!']), null, 0, { pitch: ch.voice.pitch * 1.4, rate: 1.4, vol: 0.14 });
          this.game.exclaim.show(ch, 2.6, 'sparkle');
          this.launch(E, away.multiplyScalar(3.4).add(V(0, 2.6, 0)), 'backflop');
          g.save.stats.punches = (g.save.stats.punches || 0) + 1;
        });
        this.later(0.42, () => R.set({ pos: V(0.2, -0.6, -0.25), speed: 10 }));
        this.later(0.8, () => R.set({ visible: false }));
      }
      E.phase = 'windup';
      g.checkAchievements();
    } else if (E.phase === 'down') {
      E.phase = 'held';
      E.t = 0;
      audio.cloth(0.9, 0.3);
      E.c.say(pick(['Put me down!', 'Hey hey hey!', 'Don’t you dare!', 'MOMMY!']), null, 0, { pitch: ch.voice.pitch * 1.45, rate: 1.4, vol: 0.13 });
      const L = g.player.arms.L, R = g.player.arms.R;
      L.set({ visible: true, pos: V(-0.18, -0.2, -0.45), fingers: V(0.3, 0, -1), palm: V(1, 0, 0), pose: 'grip', speed: 12 });
      R.set({ visible: true, pos: V(0.18, -0.2, -0.45), fingers: V(-0.3, 0, -1), palm: V(-1, 0, 0), pose: 'grip', speed: 12 });
    } else if (E.phase === 'held') {
      // throw along the view
      g.camera.updateMatrixWorld();
      const fwd = V(0, 0, -1).applyQuaternion(g.camera.getWorldQuaternion(new THREE.Quaternion()));
      fwd.y = Math.max(0.15, fwd.y + 0.35);
      fwd.normalize();
      audio.whoosh(1.2);
      g.player.shake = 0.3;
      g.player.arms.L.set({ pos: V(-0.12, -0.05, -0.7), speed: 30 });
      g.player.arms.R.set({ pos: V(0.12, -0.05, -0.7), speed: 30 });
      this.later(0.35, () => { g.player.arms.L.set({ visible: false }); g.player.arms.R.set({ visible: false }); });
      E.c.say('WAAAAAAAH!', null, 0, { pitch: ch.voice.pitch * 1.6, rate: 1.1, vol: 0.14 });
      this.launch(E, fwd.multiplyScalar(7.5), 'tumble');
    }
  }

  launch(E, vel, style) {
    const ch = E.c.ch;
    ch.stop();
    ch.path = [];
    ch.faceYaw = null;
    if (!E.center) this.bodyInit(E);
    E.phase = 'fly';
    E.vel = vel.clone();
    E.style = style;
    E.out = E.out || false;
    E.hits++;
    ch.setEmotion(style === 'tumble' ? 'horrified' : 'wince', 6);
    // he flies in the direction of the hit; backflop = facing the hit
    if (style !== 'tumble') {
      const yaw = Math.atan2(vel.x, vel.z);
      ch.yaw = style === 'backflop' ? yaw + Math.PI : yaw;
    }
    const g = this.game;
    if (E.center.z > 0.8 && vel.z > 0) g.shop.openDoor(true, 2.2);
  }

  // the body is simulated as one point at the hips; the feet (= the rig's root) follow
  bodyInit(E) {
    const ch = E.c.ch;
    ch.root.rotation.order = 'YXZ';
    E.rx = 0; E.rz = 0;
    E.center = ch.root.position.clone().setY(ch.hipsY || 0.9);
  }

  bodyApply(E) {
    const ch = E.c.ch, h = ch.hipsY || 0.9;
    const off = V(0, h, 0).applyEuler(new THREE.Euler(E.rx, ch.yaw, E.rz, 'YXZ'));
    ch.root.position.x = E.center.x - off.x;
    ch.root.position.z = E.center.z - off.z;
    ch.bounce = E.center.y - off.y;
    ch.root.rotation.set(E.rx, ch.yaw, E.rz, 'YXZ');
  }

  updateEject(dt) {
    const E = this.eject;
    if (!E) return;
    const g = this.game, c = E.c, ch = c.ch, p = ch.root.position;
    E.t += dt;
    const k = (l) => 1 - Math.exp(-l * dt);
    const flail = (f) => {
      const t = ch.t * 16;
      ch.extra.UpperArmL = [-1.6 + Math.sin(t) * 0.8 * f, 0, 0.6 * f]; ch.extra.UpperArmR = [-1.6 + Math.sin(t + 2) * 0.8 * f, 0, -0.6 * f];
      ch.extra.ThighL = [-0.6 + Math.sin(t * 1.1) * 0.7 * f, 0, 0]; ch.extra.ThighR = [-0.6 + Math.sin(t * 1.1 + 3) * 0.7 * f, 0, 0];
      ch.extra.ShinL = [0.8, 0, 0]; ch.extra.ShinR = [0.8, 0, 0];
    };
    if (E.phase === 'walk') {
      E.mutterT -= dt;
      if (E.mutterT < 0) { E.mutterT = rand(2.2, 3.5); c.say(pick(['Unbelievable...', 'Worst. Barber. Ever.', 'I’m posting a review...', 'One star. ONE.', 'My poor head...']), null, 0, { rate: 1.2 }); }
      // reached the door without being touched: the classic exit
      if (!ch.path.length && p.distanceTo(SPOTS.doorIn) < 0.4) { this.eject = null; this.slamExit(c).catch((e) => console.error(e)); }
      return;
    }
    if (E.phase === 'windup') return;
    const C = E.center;
    if (E.phase === 'fly') {
      E.vel.y -= 9.8 * dt;
      C.addScaledVector(E.vel, dt);
      // body attitude: head first, or cartwheeling when thrown
      if (E.style === 'tumble') E.rx += 7 * dt;
      else E.rx += ((E.style === 'faceplant' ? 1.2 : -1.2) - E.rx) * k(4);
      E.rz += (0 - E.rz) * k(5);
      flail(1);
      // walls, except the open doorway
      const R = ROOM, m = 0.35;
      const outside = C.z > R.z1 + 0.15;
      const inDoor = Math.abs(C.x - 1.9) < 0.5;
      if (!outside) {
        if (C.x < R.x0 + m) { C.x = R.x0 + m; E.vel.x *= -0.35; this.bonk(E); }
        if (C.x > R.x1 - m && !(g.owns('extension') && C.z > 1.05 && C.z < 2.3)) { C.x = R.x1 - m; E.vel.x *= -0.35; this.bonk(E); }
        if (C.z < R.z0 + m) { C.z = R.z0 + m; E.vel.z *= -0.35; this.bonk(E); }
        if (C.z > R.z1 - m && !inDoor) { C.z = R.z1 - m; E.vel.z *= -0.35; this.bonk(E); }
        if (C.z > R.z1 - 1.2 && inDoor) g.shop.openDoor(true, 2);
        // through the doorway: squeeze towards its middle
        if (C.z > R.z1 - 0.4 && inDoor) C.x += (1.9 - C.x) * k(10);
      } else {
        C.z = Math.min(C.z, R.z1 + 5);
        if (!E.out) { E.out = true; g.save.stats.bounced = (g.save.stats.bounced || 0) + 1; g.ui.toast('Thrown out!', 'Bouncer'); g.checkAchievements(); audio.cheer?.(); }
      }
      if (C.y <= 0.16 && E.vel.y < 0) {
        C.y = 0.14;
        audio.thud(1); audio.cloth(1, 0.3);
        g.physics.impulse(C, 1.0, 1.4, 0.6);
        g.player.shake = Math.max(g.player.shake, 0.25);
        E.phase = 'down';
        E.t = 0;
        // lie on the side he's closest to
        const r = ((E.rx % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        E.rx = r;
        E.rxT = r >= 0 ? Math.PI / 2 : -Math.PI / 2;
        ch.setEmotion('devastated', 4);
        g.exclaim.show(ch, 2.4, 'sparkle');
      }
    } else if (E.phase === 'down') {
      // lying there, legs twitching; gets up on his own after a while
      E.rx += (E.rxT - E.rx) * k(10);
      E.rz += (0 - E.rz) * k(10);
      C.y = 0.14;
      const t = ch.t * 7;
      ch.extra = { ThighL: [Math.sin(t) * 0.2, 0, 0], ThighR: [Math.sin(t + 1) * 0.2, 0, 0], UpperArmL: [-0.3, 0, 1.2], UpperArmR: [-0.3, 0, -1.2] };
      if (E.t > (E.out ? 1.6 : 3.4)) this.getUp(E);
    } else if (E.phase === 'held') {
      // carried in front of you, across your arms, kicking and screaming
      const cam = g.camera;
      cam.updateMatrixWorld();
      const tgt = V(0, -0.42, -0.85).applyMatrix4(cam.matrixWorld);
      tgt.y = Math.max(0.5, tgt.y);
      C.lerp(tgt, k(12));
      const camYaw = Math.atan2(-cam.matrixWorld.elements[8], -cam.matrixWorld.elements[10]);
      ch.yaw = camYaw;
      E.rx += (0 - E.rx) * k(10);
      E.rz += (Math.PI / 2 - E.rz) * k(10);
      flail(1.2);
      E.yell = (E.yell ?? 1.5) - dt;
      if (E.yell < 0) { E.yell = rand(1.4, 2.4); c.say(pick(['LET ME GO!', 'I’ll sue!', 'This is a hair salon, not a wrestling ring!', 'HELP!']), null, 0, { pitch: ch.voice.pitch * 1.5, rate: 1.4, vol: 0.12 }); }
    } else if (E.phase === 'rise') {
      const u = Math.min(1, E.t / 0.7);
      E.rx *= 1 - k(8); E.rz *= 1 - k(8);
      C.y += ((ch.hipsY || 0.9) - C.y) * k(8);
      if (u >= 1) {
        E.rx = 0; E.rz = 0; C.y = ch.hipsY || 0.9;
        this.bodyApply(E);
        ch.root.rotation.set(0, ch.yaw, 0, 'XYZ');
        ch.bounce = 0;
        ch.extra = {};
        E.phase = 'flee';
        c.say(pick(['I’M LEAVING! I’M LEAVING!', 'You’re CRAZY!', 'Never coming back! NEVER!']), 'horrified', 2, { pitch: ch.voice.pitch * 1.4, rate: 1.5, vol: 0.14 });
        const outside = p.z > ROOM.z1 + 0.2;
        const route = outside ? [V(p.x - 3, 0, 4.0), V(-12, 0, 4.1)] : [SPOTS.doorIn, SPOTS.doorStep, V(0, 0, 4.0), V(-12, 0, 4.1)];
        if (!outside) g.shop.openDoor(true, 2.5);
        ch.walkTo(route, 'run').then(() => this.finishEject(c));
        return;
      }
    } else return;
    this.bodyApply(E);
  }

  getUp(E) {
    E.phase = 'rise';
    E.t = 0;
    audio.cloth(0.7, 0.4);
  }

  bonk(E) {
    if (E.bonked && E.t - E.bonked < 0.3) return;
    E.bonked = E.t;
    audio.thud(1);
    audio.tone(320, 0.2, { type: 'sine', vol: 0.08, slide: 0.5 });
    this.game.player.shake = 0.3;
  }

  finishEject(c) {
    const g = this.game;
    this.eject = null;
    c.ch.extra = {};
    c.ch.root.rotation.order = 'XYZ';
    g.customers.remove(c);
    this.later(1.5, () => {
      const n = g.customers.nextWaiting();
      if (n && !g.customers.inChair && g.state === 'play') g.customers.toChair(n);
    });
  }

  // nobody stopped him: bin, door slam, a fist through the window
  async slamExit(c) {
    const g = this.game, dir = g.dir, ch = c.ch;
    this.kickBin(ch);
    g.shop.openDoor(true, 0.6);
    await ch.walkTo([SPOTS.doorStep], 'storm');
    this.later(0.35, () => {
      g.shop.slamDoor?.();
      audio.doorSlam();
      g.player.shake = 0.8;
      g.physics.impulse(V(1.9, 0, 2.4), 2.2, 1.6, 0.6);
    });
    await ch.walkTo([V(1.2, 0, 3.7)], 'storm');
    await ch.faceTo(V(0.6, 0, 0));
    ch.gesture('rage', { dur: 1.6 });
    c.say('NEVER!', null, 0, { pitch: ch.voice.pitch * 1.35, rate: 1.4, vol: 0.12 });
    await dir.wait(1.5).catch(() => {});
    await ch.walkTo([V(-8, 0, 4.1)], 'storm');
    this.finishEject(c);
  }

  // how the others leave after paying
  exitStyle(c, stars) {
    const ch = c.ch;
    if (stars >= 5) {
      c.say(pick(LINES[5].exit), 'starstruck');
      ch.gesture('dance', { dur: 1.8 });
      this.game.exclaim.show(ch, 2.2, 'hearts');
      return 'skip';
    }
    if (stars === 2) {
      c.say(pick(LINES[2].exit), 'devastated');
      ch.gesture('sigh');
      return 'sulk';
    }
    c.say(pick(LINES[stars].exit), stars >= 4 ? 'happy' : 'neutral');
    ch.gesture('wave', { dur: 1.2 });
    return 'walk';
  }

  // ---------------------------------------------------------------- props
  scatterCoins(from, money, fwd) {
    const g = this.game;
    const notes = Math.floor(money / 10);
    let coins = Math.min(14, money - notes * 10 + 3);
    const per = (money - notes * 10) / Math.max(1, coins);
    const spawn = (name, value, r, flat) => {
      const o = spawnProp(name, { shadows: false });
      o.position.copy(from).add(V(rand(-0.05, 0.05), rand(-0.02, 0.05), rand(-0.05, 0.05)));
      o.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      g.scene.add(o);
      const v = fwd.clone().multiplyScalar(rand(0.8, 2.2)).add(V(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)));
      const b = g.physics.add(o, { r, vel: v, ang: V(rand(-30, 30), rand(-30, 30), rand(-30, 30)), bounce: name === 'Coin' ? 0.45 : 0.05, friction: name === 'Coin' ? 0.35 : 1.5,
        flat, drag: name === 'Coin' ? 0.1 : 2.2, lift: name === 'Coin' ? -r + 0.002 : -r + 0.001, sound: name === 'Coin' ? (s) => audio.coinBounce(Math.min(1, s / 3)) : (s) => audio.paperTap(s) });
      this.loose.push({ b, value });
    };
    for (let i = 0; i < notes; i++) spawn('Note', 10, 0.035, true);
    for (let i = 0; i < coins; i++) spawn('Coin', per, 0.012, true);
  }

  kickBin(ch) {
    const g = this.game;
    const bin = g.shop.slots.trash;
    if (!bin || this.bin) return;
    const d = bin.position.distanceTo(ch.root.position);
    if (d > 2.6) return;
    ch.gesture({ dur: 0.5, channel: 'legs', update(c, u) { const w = Math.sin(u * Math.PI); c._add('ThighR', -1.1 * w, 0, 0); c._add('ShinR', 0.2 * w, 0, 0); } });
    this.later(0.22, () => {
      audio.binCrash();
      g.player.shake = 0.4;
      const away = bin.position.clone().sub(ch.root.position).setY(0).normalize();
      // the bin tips over (pivoting on its base rim) and slides
      this.bin = { home: bin.position.clone(), obj: bin, ang: 0, vel: 5.5, axis: V(away.z, 0, -away.x), slide: away.multiplyScalar(1.6), q0: bin.quaternion.clone(), p0: bin.position.clone(), t: 0 };
      // paper spills out
      for (let i = 0; i < 6; i++) {
        const p = paperBall();
        p.position.copy(bin.position).add(V(rand(-0.05, 0.05), 0.38, rand(-0.05, 0.05)));
        g.scene.add(p);
        g.physics.add(p, { r: 0.03, vel: this.bin.slide.clone().multiplyScalar(rand(0.6, 1.5)).add(V(rand(-0.6, 0.6), rand(1, 2.4), rand(-0.6, 0.6))), ang: V(rand(-10, 10), rand(-10, 10), rand(-10, 10)),
          bounce: 0.3, friction: 0.6, sound: (s) => audio.paperTap(s), tag: 'trash' });
      }
      g.save.stats.binsKicked = (g.save.stats.binsKicked || 0) + 1;
      g.checkAchievements();
    });
  }

  update(dt) {
    const g = this.game;
    this.updateEject(dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const T = this.timers[i];
      T.t -= dt;
      if (T.t <= 0) { this.timers.splice(i, 1); T.fn(); }
    }
    // tipping bin: angular motion under gravity until it lies on its side, small bounce
    const B = this.bin;
    if (B) {
      B.t += dt;
      if (B.ang < Math.PI / 2 || B.vel > 0.05) {
        B.vel += 9 * Math.sin(Math.max(0.05, B.ang)) * dt;
        B.ang += B.vel * dt;
        if (B.ang > Math.PI / 2) { B.ang = Math.PI / 2; if (B.vel > 0.6) audio.thud(Math.min(1, B.vel / 4)); B.vel = -B.vel * 0.25; }
      }
      B.slide.multiplyScalar(Math.max(0, 1 - 3 * dt));
      B.p0.addScaledVector(B.slide, dt);
      B.p0.x = clamp(B.p0.x, ROOM.x0 + 0.25, ROOM.x1 - 0.25); B.p0.z = clamp(B.p0.z, ROOM.z0 + 0.25, ROOM.z1 - 0.25);
      const q = new THREE.Quaternion().setFromAxisAngle(B.axis, B.ang);
      B.obj.quaternion.copy(q).multiply(B.q0);
      // pivot around the rim on the floor (radius 0.14)
      const rim = B.axis.clone().cross(V(0, 1, 0)).multiplyScalar(0.14);
      B.obj.position.copy(B.p0).add(rim).sub(rim.clone().applyQuaternion(q));
    }
    // pick up money from the floor by walking over it
    if (this.loose.length && g.state === 'play') {
      const pp = g.camera.position;
      for (let i = this.loose.length - 1; i >= 0; i--) {
        const L = this.loose[i], o = L.b.obj;
        const dx = o.position.x - pp.x, dz = o.position.z - pp.z;
        if (o.position.y < 0.3 && dx * dx + dz * dz < 0.55 * 0.55) {
          g.physics.remove(L.b);
          o.parent?.remove(o);
          this.loose.splice(i, 1);
          this.pickedValue = (this.pickedValue || 0) + L.value;
          audio.coin();
          clearTimeout(this._pickT);
          this._pickT = setTimeout(() => {
            const v = Math.round(this.pickedValue);
            this.pickedValue = 0;
            if (v > 0) { g.addMoney(v); g.ui.floatText(innerWidth / 2, innerHeight * 0.6, `+$${v}`); g.persist(); g.updateGoal(); }
          }, 250);
        }
      }
    }
  }

  // tidy up the floor: the broom also puts the bin back
  tidy() {
    const g = this.game;
    // the broom finds the money too
    let found = 0;
    for (const L of this.loose) { found += L.value; g.physics.remove(L.b); L.b.obj.parent?.remove(L.b.obj); }
    this.loose = [];
    if (found >= 1) { g.addMoney(Math.round(found)); g.ui.toast(`Found $${Math.round(found)} under the dust`, 'Broom'); }
    for (const b of [...g.physics.bodies]) if (b.tag === 'cape') { b.obj.parent?.remove(b.obj); g.physics.remove(b); }
    for (const b of [...g.physics.bodies]) if (b.tag === 'trash') { b.obj.parent?.remove(b.obj); g.physics.remove(b); }
    if (this.bin) { this.bin.obj.quaternion.copy(this.bin.q0); this.bin.obj.position.copy(this.bin.home); this.bin = null; }
  }
}

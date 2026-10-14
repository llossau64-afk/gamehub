// Dirk Reck's Box Club: a quest from the old champion and a real boxing fight in the ring.
//   boxclub — "The Wreck’s Gym": talk to Dirk, warm up on the heavy bag, then box your colleague
//             Marco in the ring. Afterwards: rematches, and — if you dare — Dirk himself.
// The fight is first person: Q / left click jab, E / right click hook, hold SPACE to block,
// A / D to slip a punch. Watch your opponent wind up, block or slip, then counter.
import * as THREE from 'three';
import { StreetNPC } from './story.js';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { ROOM } from '../world/shop.js';
import { BOX } from '../world/boxclub.js';
import { audio } from '../audio/audio.js';
import { pick, rand, clamp, damp, chance } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FZ = ROOM.z1 + 0.24;
const base = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#2a2a2e', TopDark: '#2d2a28' };
const DIRK = { colors: { ...base, Skin: '#d9a888', Top: '#8a1d17', Sleeve: '#8a1d17', Pants: '#1f2228', Shoes: '#f0f0f0', Hair: '#3a3028', Iris: '#4a3a2a', TopDark: '#5a120e' },
  accessories: ['track', 'moustache', 'chain', 'broad'], scale: 1.06, width: 1.2, hunch: 0.2 };
const MARCO = { colors: { ...base, Skin: '#c48a64', Top: '#2f62c8', Sleeve: '#c48a64', Pants: '#1f2a44', Shoes: '#1b1b1d', Hair: '#1f1611', Iris: '#3e3226' },
  accessories: ['tee'], scale: 1.02, width: 1.0, hunch: 0.05, voice: { pitch: 128, rate: 1.05, wobble: 0.08, vol: 0.1 } };
const DIRK_FIGHT = { ...DIRK, accessories: ['tee', 'moustache', 'broad'], colors: { ...DIRK.colors, Top: '#1c1c1e', Sleeve: '#d9a888' } };

export const BOX_QUESTS = {
  boxclub: { title: 'The Wreck’s Gym', ch: 99, giver: 'Dirk Reck', reward: { money: 150, xp: 160 },
    steps: ['Talk to Dirk Reck at the Box Club (east end of the street)', 'Warm up: hit the heavy bag 12 times', 'Spar with your colleague Marco in the ring (talk to Dirk)', 'Tell Dirk how it went'] },
};

const OPPONENTS = {
  marco: { name: 'Marco', look: MARCO, hp: 100, dmg: 8, speed: 1, block: 0.25, hair: { color: '#1f1611', style: { top: 0.4, front: 0.35, left: 0.08, right: 0.08, back: 0.1, fuzz: 0, fade: 0.4 } },
    taunts: ['Come on, boss, hit me!', 'That all you got?', 'I cut hair AND I box.', 'Ow! Okay, okay!'], hurt: ['Ow!', 'Oof!', 'Hey!', 'Not the face!'], down: 'I’m good... I’m good... the ceiling is pretty.' },
  dirk: { name: 'Dirk Reck', look: DIRK_FIGHT, hp: 150, dmg: 12, speed: 1.35, block: 0.4, hair: { color: '#3a3028', style: { top: 0.06, front: 0.04, left: 0.12, right: 0.12, back: 0.14, fuzz: 0, bald: 0.8 } },
    taunts: ['Thirty years I’ve been doing this.', 'Keep your hands UP!', 'Is that a punch or a haircut?', 'Hah! Good one, kid.'], hurt: ['Hmph!', 'Ugh!', 'Not bad!', 'Oof — again!'], down: 'Hah... HAH! You got me, kid. You actually got me.' },
};

function glove(col = '#c8302b') {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 10), m); fist.scale.set(1, 0.9, 1.25); fist.position.z = 0.02; g.add(fist);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), m); thumb.position.set(0.045, 0.01, 0.0); g.add(thumb);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12), new THREE.MeshStandardMaterial({ color: '#f3efe4', roughness: 0.6 })); cuff.rotation.x = Math.PI / 2; cuff.position.z = -0.06; g.add(cuff);
  return g;
}

export class BoxClub {
  constructor(story) {
    this.story = story;
    this.game = story.game;
    this.fight = null;
  }

  get s() { return this.story.s; }
  step(id) { return this.story.step(id); }

  build() {
    const g = this.game;
    const d = this.dirk = new StreetNPC(g, { name: 'Dirk Reck', look: DIRK, voice: { pitch: 86, rate: 0.95, wobble: 0.14, vol: 0.12 },
      hair: { color: '#3a3028', style: { top: 0.06, front: 0.04, left: 0.12, right: 0.12, back: 0.14, fuzz: 0, bald: 0.8 }, cut: 0.1 } });
    d.home = V(BOX.dirk.x, 0, FZ + BOX.dirk.dz);
    d.ch.place(d.home, 0.25);
    d.ch.gesture('armsCrossed');
    this.bags = g.shop.boxClub?.bags || [];
    this.bagHits = this.s.bagHits || 0;
  }

  interactables(I) {
    const g = this.game;
    const play = () => g.state === 'play' && g.player.control;
    I({ id: 'dirk', label: () => (play() && this.dirk.shown && this.dirk.dist() < 2.6 && !this.dirk.busy ? 'Talk to Dirk Reck' : null),
      pos: () => this.dirk.head(), radius: 3, action: () => { this.talkDirk().catch((e) => console.error(e)); return 'dirk'; } });
    this.bags.forEach((b, i) => I({ id: 'bag' + i,
      label: () => (play() && Math.hypot(g.player.pos.x - b.x, g.player.pos.z - b.z) < 1.4 ? 'Punch the bag' : null),
      pos: () => V(b.x, 1.3, b.z), radius: 2, action: () => { this.punchBag(b); return 'bag'; } }));
  }

  // ---------------------------------------------------------------- Dirk
  async talkDirk() {
    const g = this.game, n = this.dirk;
    await this.story.side.talking(n, async () => {
      const st = this.step('boxclub');
      if (st < 0) {
        n.ch.gesture('chinUp');
        await n.say('You. The barber. Dirk Reck. “The Wreck”. Champion, nineteen ninety-four. Ask anyone. Ask Ralf.', 'proud');
        await n.say('All day you stand there with scissors. Soft hands, soft head. This street needs barbers who can take a punch.', 'smug');
        await n.say('Your colleague Marco trains here every week. He talks about you. Says you hit like a hairdryer.', 'smug');
        const i = await g.ui.choices('Dirk Reck', ['A hairdryer?! I’ll show him.', 'I’m a barber, not a boxer.']);
        if (i === 1) await n.say('Everybody is a boxer until the bell rings. Then they find out what they are.', 'neutral');
        await n.say('Warm up first. Twelve good shots on the heavy bag. Then we’ll put you in the ring with Marco.', 'proud');
        this.story.setStep('boxclub', 1);
        return;
      }
      if (st === 1) { await n.say(`Bag first. ${this.bagHits || 0} of twelve. Hit it like it owes you money.`, 'smug'); return; }
      if (st === 2) {
        await n.say('Warm? Good. Marco! Gloves on! Your boss is here!', 'excited');
        const i = await g.ui.choices('Dirk Reck', ['Let’s box!', 'Wait — how does this work?', 'Not yet.']);
        if (i === 2) { await n.say('Take your time. Marco isn’t going anywhere. He’s stretching. Badly.', 'neutral'); return; }
        if (i === 1) {
          await n.say('Jab: Q or left click. Hook: E or right click — slower, hurts more.', 'neutral');
          await n.say('Hold SPACE to block. A or D to slip sideways. When he pulls his arm back — block or slip, then hit back!', 'proud');
        }
        this.pendingFight = 'marco';
        return;
      }
      if (st === 3) {
        await n.say(this.s.boxLastWin ? 'THAT is what I’m talking about! Soft hands, my foot.' : 'You went down, but you got up. That counts in my gym.', 'proud');
        await n.say('Here. Your first purse. And the gym is yours whenever you want. Rematch anytime.', 'happy');
        this.story.setStep('boxclub', 4);
        return;
      }
      // done: rematches, and the boss fight
      const opts = ['Spar with Marco', this.s.dirkBeaten ? 'Rematch: Dirk “The Wreck” Reck' : 'Fight YOU, Dirk.', 'Bye, Dirk.'];
      await n.say(pick(['Back for more?', 'Hands up, chin down. What’ll it be?', 'The ring is warm. Who are you fighting?']), 'proud');
      const i = await g.ui.choices('Dirk Reck', opts);
      if (i === 0) this.pendingFight = 'marco';
      else if (i === 1) {
        await n.say(this.s.dirkBeaten ? 'Again? Fine. I let you win last time. I think.' : 'Me? HAH! Alright, kid. Don’t cry on my canvas.', 'excited');
        this.pendingFight = 'dirk';
      }
    });
    if (this.pendingFight) { const who = this.pendingFight; this.pendingFight = null; this.startFight(who).catch((e) => { console.error(e); this.endFight(); }); }
  }

  // ---------------------------------------------------------------- heavy bag
  punchBag(b) {
    const g = this.game, R = g.player.arms[this._bagSide ? 'L' : 'R'];
    this._bagSide = !this._bagSide;
    const sx = this._bagSide ? 0.14 : -0.14;
    R.set({ visible: true, pos: V(sx, -0.22, -0.32), fingers: V(0, 0.1, -1), palm: V(-Math.sign(sx), 0, 0), pose: 'fist', speed: 40 });
    setTimeout(() => R.set({ pos: V(sx * 0.4, -0.1, -0.68) }), 60);
    setTimeout(() => {
      audio.thud?.(1); audio.noiseBurst?.(0.06, { vol: 0.2, freq: 700, q: 0.8 });
      const away = V(b.x - g.player.pos.x, 0, b.z - g.player.pos.z).normalize();
      b.vx = (b.vx || 0) + away.x * 1.6; b.vz = (b.vz || 0) + away.z * 1.6;
      g.player.shake = Math.max(g.player.shake || 0, 0.12);
      if (this.step('boxclub') === 1) {
        this.bagHits = (this.bagHits || 0) + 1; this.s.bagHits = this.bagHits;
        if (this.bagHits % 3 === 0 && this.bagHits < 12) g.ui.toast(`Heavy bag ${this.bagHits}/12`, 'Box Club');
        if (this.bagHits >= 12) { this.story.setStep('boxclub', 2); this.dirk.say('Good! Now you’re warm. Come talk to me.', 'proud'); }
      }
    }, 120);
    setTimeout(() => R.set({ pos: V(sx * 1.2, -0.6, -0.3), speed: 12 }), 260);
    setTimeout(() => R.set({ visible: false }), 520);
  }

  updateBags(dt) {
    for (const b of this.bags) {
      // a damped pendulum swinging round the chain
      b.ax = (b.ax || 0) + (b.vx || 0) * dt; b.az = (b.az || 0) + (b.vz || 0) * dt;
      b.vx = (b.vx || 0) - (b.ax * 9 + b.vx * 1.6) * dt; b.vz = (b.vz || 0) - (b.az * 9 + b.vz * 1.6) * dt;
      b.piv.rotation.z = -clamp(b.ax, -0.5, 0.5) * 0.9; b.piv.rotation.x = clamp(b.az, -0.5, 0.5) * 0.9;
    }
  }

  // ---------------------------------------------------------------- the fight
  async startFight(who) {
    const g = this.game, dir = g.dir, O = OPPONENTS[who];
    const R = BOX.ring, rz = FZ + R.dz;
    const wait = (s) => dir.wait(s).catch(() => {});
    g.player.control = false;
    await g.ui.fade(true, 500);
    // opponent
    const ch = new Character(g.scene, { ...O.look, name: O.name, voice: O.look.voice || { pitch: 90, rate: 0.95, wobble: 0.12, vol: 0.12 } });
    const hair = new HairSystem({ color: O.hair.color, skin: O.look.colors.Skin, layers: 8 });
    hair.attach(ch.bones.Head); hair.setStyle(O.hair.style, 0.2); ch.hair = hair;
    ch.noLod = true;
    const oPos = V(R.x + 0.85, 0, rz);
    ch.place(oPos, -Math.PI / 2);
    ch.hold('L', glove(who === 'dirk' ? '#1c1c1e' : '#2f62c8'), { pos: [0, -0.02, 0.03] });
    ch.hold('R', glove(who === 'dirk' ? '#1c1c1e' : '#2f62c8'), { pos: [0, -0.02, 0.03] });
    // the referee: Dirk climbs in (unless he's the one fighting)
    const ref = this.dirk;
    if (who !== 'dirk') { ref.ch.place(V(R.x, 0, rz - 1.9), 0); ref.ringY = R.h; }
    else ref.show(false);
    // you: in the red corner, gloves up
    const eye = V(R.x - 0.85, R.h + 1.6, rz);
    dir.takeCamera(eye.clone(), V(oPos.x, R.h + 1.45, rz));
    dir.cam.handheld = 0.4;
    g.state = 'boxing';
    g.ui.showHud(false);
    const F = this.fight = { who, O, ch, hp: 100, ohp: O.hp, stam: 100, t: 0, phase: 'intro', ai: { state: 'idle', t: 1.4, side: 1 },
      eye, base: eye.clone(), events: [], look: V(oPos.x, R.h + 1.45, rz), slip: 0, slipT: 0, block: false, cd: 0, jolt: 0, ojolt: 0, combo: 0, hits: 0, oPos, rz };
    const gl = this.gloves = [glove(), glove()];
    g.player.arms.L.set({ visible: true, pose: 'fist', fingers: V(0, 0.2, -1), palm: V(1, 0, 0), pos: V(-0.16, -0.17, -0.36), speed: 12 });
    g.player.arms.R.set({ visible: true, pose: 'fist', fingers: V(0, 0.2, -1), palm: V(-1, 0, 0), pos: V(0.16, -0.2, -0.34), speed: 12 });
    g.player.arms.L.hold(gl[0], { pos: [0, -0.01, 0.0], rot: [0, 0, 0], scale: 1 });
    g.player.arms.R.hold(gl[1], { pos: [0, -0.01, 0.0], rot: [0, 0, 0], scale: 1 });
    this.hud(true);
    await g.ui.fade(false, 500);
    audio.bell?.(); setTimeout(() => audio.bell?.(), 350);
    if (who !== 'dirk') await ref.say('Gloves up! Clean fight! ...BOX!', 'excited');
    else { ch.say('Let’s dance, kid.'); g.showLine('Dirk Reck', 'Let’s dance, kid.', 1.6); await wait(1.2); }
    F.phase = 'fight';
  }

  hud(on) {
    const ui = this.game.ui;
    this.hudEl?.remove(); this.hudEl = null;
    if (!on) return;
    const F = this.fight;
    const el = document.createElement('div');
    el.className = 'boxhud';
    el.innerHTML = `<div class="bx-row"><div class="bx-side"><b>YOU</b><div class="bx-bar"><i class="bx-you"></i></div><div class="bx-st"><i class="bx-stam"></i></div></div>
      <div class="bx-mid">VS</div><div class="bx-side r"><b>${F.O.name.toUpperCase()}</b><div class="bx-bar"><i class="bx-opp"></i></div></div></div>
      <div class="bx-keys">${ui.touch ? '' : 'Q / click — jab · E / right click — hook · SPACE — block · A / D — slip'}</div>
      ${ui.touch ? '<div class="bx-btns"><button data-a="slipL">◀</button><button data-a="jab">JAB</button><button data-a="block">BLOCK</button><button data-a="hook">HOOK</button><button data-a="slipR">▶</button></div>' : ''}`;
    ui.root.append(el);
    this.hudEl = el;
    el.querySelectorAll('.bx-btns button').forEach((b) => {
      const a = b.dataset.a;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); if (a === 'block') this.touchBlock = true; else this.touchPress = a; }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); if (a === 'block') this.touchBlock = false; }, { passive: false });
    });
  }

  hudUpdate() {
    const F = this.fight, el = this.hudEl;
    if (!F || !el) return;
    el.querySelector('.bx-you').style.width = `${clamp(F.hp, 0, 100)}%`;
    el.querySelector('.bx-opp').style.width = `${clamp(F.ohp / F.O.hp * 100, 0, 100)}%`;
    el.querySelector('.bx-stam').style.width = `${clamp(F.stam, 0, 100)}%`;
  }

  // things that happen a moment later, on game time (so pausing pauses the fight too)
  later(t, fn) { this.fight?.events.push({ t, fn }); }

  // your punches
  punch(kind) {
    const F = this.fight, g = this.game;
    if (F.cd > 0 || F.phase !== 'fight') return;
    const cost = kind === 'jab' ? 10 : 22;
    if (F.stam < cost * 0.6) { audio.error?.(); return; }
    F.stam -= cost;
    F.cd = kind === 'jab' ? 0.32 : 0.6;
    const A = g.player.arms[kind === 'jab' ? 'L' : 'R'];
    const home = kind === 'jab' ? V(-0.16, -0.17, -0.36) : V(0.16, -0.2, -0.34);
    audio.whoosh?.(kind === 'jab' ? 0.6 : 1);
    if (kind === 'jab') { A.set({ pos: V(-0.05, -0.06, -0.78), speed: 45 }); }
    else { A.set({ pos: V(0.32, -0.08, -0.42), speed: 35 }); this.later(0.11, () => A.set({ pos: V(-0.04, -0.03, -0.72), speed: 40 })); }
    this.later(kind === 'jab' ? 0.11 : 0.23, () => this.land(kind));
    this.later(kind === 'jab' ? 0.22 : 0.42, () => { if (!this._blockOn) A.set({ pos: home, speed: 14 }); });
  }

  land(kind) {
    const F = this.fight, g = this.game;
    if (!F || F.phase !== 'fight') return;
    const ai = F.ai, ch = F.ch;
    // he blocks (and a lot of jabs get caught on the gloves), or slips the big hook
    const blocked = ai.state === 'block' || (ai.state === 'idle' && chance(F.O.block * (kind === 'jab' ? 0.7 : 0.4)));
    const slipped = ai.state === 'slip';
    if (slipped) { g.ui.floatText(innerWidth * 0.62, innerHeight * 0.42, 'MISS', '#c9c2b0'); F.combo = 0; return; }
    let dmg = kind === 'jab' ? rand(5, 8) : rand(11, 16);
    // punish a wind-up: counters land double
    const counter = ai.state === 'windup';
    if (counter) { dmg *= 1.8; ai.state = 'stunned'; ai.t = 0.7; }
    if (blocked) { dmg *= 0.2; audio.thud?.(0.4); ai.state = 'block'; ai.t = 0.35; }
    else { audio.thud?.(1); audio.noiseBurst?.(0.07, { vol: 0.25, freq: 950, q: 1 }); F.ojolt = kind === 'jab' ? 0.6 : 1; ch.flush?.('#e0412f', 0.5, 1.5); if (chance(0.35)) { const l = pick(F.O.hurt); ch.say(l); this.game.showLine(F.O.name, l, 1.0); } }
    F.ohp -= dmg;
    F.hits++;
    F.combo = blocked ? 0 : F.combo + 1;
    g.player.shake = Math.max(g.player.shake || 0, blocked ? 0.06 : 0.16);
    const txt = blocked ? 'BLOCKED' : counter ? `COUNTER! −${Math.round(dmg)}` : F.combo >= 3 ? `${F.combo}× COMBO −${Math.round(dmg)}` : `−${Math.round(dmg)}`;
    g.ui.floatText(innerWidth * (0.55 + Math.random() * 0.1), innerHeight * 0.38, txt, blocked ? '#c9c2b0' : counter ? '#f2cf7c' : '#ff8a6a');
    if (F.ohp <= 0) this.knockout(true);
  }

  // their punch lands now (unless you blocked or slipped)
  hitYou() {
    const F = this.fight, g = this.game;
    if (F.phase !== 'fight') return;
    if (Math.abs(F.slip) > 0.18) { g.ui.floatText(innerWidth * 0.4, innerHeight * 0.45, 'SLIPPED!', '#9fd08a'); audio.whoosh?.(0.8); return; }
    let dmg = F.O.dmg * rand(0.85, 1.2) * (F.ai.big ? 1.6 : 1);
    if (F.block && F.stam > 5) { dmg *= 0.18; F.stam -= 12; audio.thud?.(0.5); g.ui.floatText(innerWidth * 0.45, innerHeight * 0.5, 'BLOCK', '#c9c2b0'); }
    else { audio.thud?.(1.2); g.ui.flash?.('rgba(200,30,20,0.35)'); F.combo = 0; }
    F.hp -= dmg;
    F.jolt = 1;
    g.player.shake = Math.max(g.player.shake || 0, F.block ? 0.12 : 0.45);
    if (F.hp <= 0) this.knockout(false);
  }

  update(dt) {
    this.updateBags(dt);
    this.tick();
    this.dirk.update(dt);
    const g = this.game, F = this.fight;
    // Dirk stands on the ring canvas while he referees
    if (this.dirk.ringY) this.dirk.ch.root.position.y = this.dirk.ringY;
    if (!F) return;
    const ch = F.ch, ai = F.ai, inp = g.input;
    ch.update(dt);
    ch.root.position.y += BOX.ring.h;
    if (F.koOpp) { F.koT = Math.min(1, F.koT + dt * 1.6); ch.root.rotation.order = 'YXZ'; ch.root.rotation.x = -F.koT * Math.PI / 2 * 0.95; ch.root.position.y = BOX.ring.h + 0.08 * F.koT; }
    // the camera: you, bobbing on your feet, slipping, rocked when hit
    F.t += dt;
    for (let i = F.events.length - 1; i >= 0; i--) { const e = F.events[i]; e.t -= dt; if (e.t <= 0) { F.events.splice(i, 1); try { e.fn(); } catch (err) { console.error(err); } } }
    if (!this.fight) return;
    F.cd = Math.max(0, F.cd - dt);
    F.stam = Math.min(100, F.stam + dt * (F.block ? 6 : 16));
    F.slipT = Math.max(0, F.slipT - dt);
    if (F.slipT <= 0) F.slip = damp(F.slip, 0, 8, dt);
    F.jolt = Math.max(0, F.jolt - dt * 3);
    F.ojolt = Math.max(0, F.ojolt - dt * 3.5);
    const bob = Math.sin(F.t * 5.2) * 0.025;
    if (!F.koYou) {
      g.dir.cam.pos.set(F.base.x - F.jolt * 0.12, F.base.y + bob - F.jolt * 0.05, F.base.z + F.slip);
      g.dir.cam.look.set(F.look.x, F.look.y + Math.sin(F.t * 2.6) * 0.02 + F.jolt * 0.12, F.look.z + F.slip * 0.4 + F.jolt * 0.15);
    }
    // his head snaps back when you land one
    const j = F.ojolt;
    ch.extra.Head = [-0.35 * j, 0.25 * j * (F.hits % 2 ? 1 : -1), 0];
    ch.extra.Chest = [-0.12 * j, 0, 0];
    if (F.phase === 'fight') {
      // your inputs
      const p = inp.pointer;
      const jab = inp.pressed('boxJab') || (p.justDown && p.button === 0) || this.touchPress === 'jab';
      const rightNow = p.right;
      const hook = inp.pressed('boxHook') || (rightNow && !this._prevRight) || this.touchPress === 'hook';
      this._prevRight = rightNow;
      F.block = inp.held('boxBlock') || !!this.touchBlock;
      if (inp.pressed('boxSlipL') || this.touchPress === 'slipL') { F.slip = -0.42; F.slipT = 0.42; audio.whoosh?.(0.4); }
      if (inp.pressed('boxSlipR') || this.touchPress === 'slipR') { F.slip = 0.42; F.slipT = 0.42; audio.whoosh?.(0.4); }
      this.touchPress = null;
      if (jab) this.punch('jab'); else if (hook) this.punch('hook');
      // gloves up while blocking
      if (F.block && !this._blockOn) { this._blockOn = true; g.player.arms.L.set({ pos: V(-0.07, -0.05, -0.27), speed: 18 }); g.player.arms.R.set({ pos: V(0.07, -0.06, -0.27), speed: 18 }); }
      if (!F.block && this._blockOn) { this._blockOn = false; g.player.arms.L.set({ pos: V(-0.16, -0.17, -0.36), speed: 14 }); g.player.arms.R.set({ pos: V(0.16, -0.2, -0.34), speed: 14 }); }
      // the opponent
      this.ai(dt);
    }
    this.hudUpdate();
  }

  ai(dt) {
    const F = this.fight, ai = F.ai, ch = F.ch, O = F.O;
    const cam = this.game.camera.position;
    const head = () => ch.headWorld(V());
    const guard = (side, k = 1) => () => { const h = head(); const f = V(cam.x - h.x, 0, cam.z - h.z).normalize(); const r = V(-f.z, 0, f.x); return h.addScaledVector(f, 0.24 * k).addScaledVector(r, side * 0.12).add(V(0, -0.06, 0)); };
    ai.t -= dt * O.speed;
    const aggro = 1 + (1 - F.ohp / O.hp) * 0.6;
    if (ai.state === 'idle') {
      ch.reach('L', guard(1), { speed: 10, hand: 'fist' }); ch.reach('R', guard(-1), { speed: 10, hand: 'fist' });
      ch.lookAt(cam, 1);
      if (ai.t <= 0) {
        const r = Math.random();
        if (r < 0.62 * aggro) {
          ai.state = 'windup'; ai.big = chance(0.3); ai.side = chance(0.5) ? 1 : -1; ai.t = ai.big ? 0.75 : 0.5;
          // the tell: the glove pulls back
          const back = () => { const h = head(); const f = V(cam.x - h.x, 0, cam.z - h.z).normalize(); const r2 = V(-f.z, 0, f.x); return h.addScaledVector(f, -0.12).addScaledVector(r2, ai.side * 0.32).add(V(0, -0.1, 0)); };
          ch.reach(ai.side > 0 ? 'L' : 'R', back, { speed: 12, hand: 'fist' });
          if (ai.big) audio.tone?.(320, 0.12, { type: 'square', vol: 0.03 });
        } else if (r < 0.82) { ai.state = 'block'; ai.t = rand(0.6, 1.1); ch.reach('L', guard(0.4, 0.6), { speed: 16 }); ch.reach('R', guard(-0.4, 0.6), { speed: 16 }); }
        else { ai.state = 'slip'; ai.t = 0.45; ai.slipDir = chance(0.5) ? 1 : -1; if (chance(0.3)) { const l = pick(O.taunts); ch.say(l); this.game.showLine(O.name, l, 1.6); } }
      }
    } else if (ai.state === 'windup') {
      if (ai.t <= 0) {
        ai.state = 'punch'; ai.t = 0.18;
        ch.reach(ai.side > 0 ? 'L' : 'R', () => cam.clone().add(V(0, -0.05, 0)), { speed: 34, hand: 'fist' });
        this.later(0.12, () => this.hitYou());
      }
    } else if (ai.state === 'punch') { if (ai.t <= 0) { ai.state = 'idle'; ai.t = rand(0.9, 1.8) / aggro; } }
    else if (ai.state === 'block' || ai.state === 'stunned') { if (ai.t <= 0) { ai.state = 'idle'; ai.t = rand(0.5, 1.2); } }
    else if (ai.state === 'slip') {
      ch.extra.Hips = [0, 0, 0.18 * ai.slipDir * Math.sin(Math.min(1, (0.45 - ai.t) / 0.45) * Math.PI)];
      if (ai.t <= 0) { ai.state = 'idle'; ai.t = rand(0.3, 0.8); ch.extra.Hips = [0, 0, 0]; }
    }
  }

  async knockout(youWon) {
    const F = this.fight, g = this.game, ref = this.dirk;
    if (F.phase !== 'fight') return;
    F.phase = 'ko';
    const wait = (s) => g.dir.wait(s).catch(() => {});
    if (youWon) {
      F.koOpp = true; F.koT = 0;
      F.ch.release('L'); F.ch.release('R');
      F.ch.setEmotion('devastated', 6);
      audio.thud?.(1.4); audio.cheer?.();
      g.player.shake = 0.5;
      await wait(0.8);
      const speaker = F.who === 'dirk' ? null : ref;
      for (const nmb of ['ONE!', 'TWO!', 'THREE!', '...TEN!']) { if (speaker) speaker.say(nmb, 'excited'); else g.showLine('Crowd', nmb, 0.8); audio.bell?.(); await wait(0.7); }
      F.ch.say(F.O.down); g.showLine(F.O.name, F.O.down, 2.6);
      await wait(2.4);
    } else {
      F.koYou = true;
      audio.thud?.(1.5);
      g.ui.flash?.('rgba(200,30,20,0.5)');
      // you go down: the world tilts and the canvas comes up
      g.dir.move(V(F.base.x - 0.3, BOX.ring.h + 0.35, F.base.z + 0.2), V(F.base.x + 0.6, BOX.ring.h + 2.6, F.base.z - 0.4), 0.8);
      await wait(1.0);
      if (F.who !== 'dirk') ref.say('...eight... nine... TEN! That’s it!', 'concerned'); else g.showLine('Dirk Reck', 'Hah! Stay down, kid. Stay down.', 2.2);
      await wait(2.4);
    }
    await this.finishFight(youWon);
  }

  async finishFight(won) {
    const g = this.game, F = this.fight;
    await g.ui.fade(true, 600);
    this.endFight();
    g.player.place(V(74.4, 0, FZ - 1.6), Math.PI * 0.9, 0);
    await g.ui.fade(false, 600);
    const st = this.step('boxclub');
    if (F.who === 'marco') {
      this.s.boxLastWin = won;
      if (st === 2) this.story.setStep('boxclub', 3);
      else if (won) { g.addMoney(25); g.addXP(40); }
      g.ui.banner(won ? 'K.O.!' : 'Knocked down', won ? 'You beat Marco' : 'Marco got you this time', won ? (st === 2 ? 'Talk to Dirk' : '+$25 · +40 XP') : 'Rematch anytime', 2400);
    } else {
      if (won && !this.s.dirkBeaten) { this.s.dirkBeaten = true; g.addMoney(200); g.addXP(250); g.ui.banner('K.O.!', 'You beat Dirk “The Wreck” Reck', '+$200 · +250 XP · Box Club legend', 3000); }
      else if (won) { g.addMoney(40); g.addXP(60); g.ui.banner('K.O.!', 'The Wreck goes down again', '+$40 · +60 XP', 2400); }
      else g.ui.banner('Knocked down', 'The Wreck still has it', 'Hands up next time', 2400);
    }
    this.s.boxFights = (this.s.boxFights || 0) + 1;
    g.persist();
  }

  endFight() {
    const g = this.game, F = this.fight;
    this.hud(false);
    if (F) { F.ch.dispose(); this.fight = null; }
    for (const a of ['L', 'R']) { g.player.arms[a].drop?.(); g.player.arms[a].set({ visible: false }); }
    this._blockOn = false;
    this.dirk.ringY = 0;
    this.dirk.show(true);
    this.dirk.ch.place(this.dirk.home, 0.25);
    if (g.dir.cam.active) g.dir.releaseCamera();
    g.state = 'play';
    g.player.control = true;
    g.ui.showHud(true);
    g.enterFP?.();
  }

  // markers and visibility
  tick() {
    const g = this.game, st = this.step('boxclub');
    this.dirk.show(g.save.tutorialDone && !(this.fight && this.fight.who === 'dirk'));
    this.dirk.mark = st < 0 || st === 3 ? '!' : st === 2 ? '?' : null;
  }
}

// Julian Krüger: the street's homeless regular. He makes his rounds along the block (and
// across the road when the traffic lets him), and every so often he pushes the shop door
// open to ask for money. You can always: give him $100, slap him, or throw him out. He
// has a lot to say about all three, and he never stays away for long.
// Online the host walks him; everyone sees him, hears him and can deal with him.
import * as THREE from 'three';
import { StreetNPC, followRemote, gaitIndex, gaitName } from './story.js';
import { ROOM, SPOTS } from '../world/shop.js';
import { makeBeanie } from '../world/storyassets.js';
import { audio } from '../audio/audio.js';
import { pick, rand, chance } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FZ = ROOM.z1 + 0.24;
const NEAR = FZ + 1.35;        // his lane on the shop side
const FAR = FZ + 12.9;         // the sidewalk in front of Fresh Mart
const BEG = V(0.75, 0, 1.5);   // where he stands in the shop, just inside the door
const PRICE = 100;

const base = { EyeWhite: '#e8dfcf', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#d9cdb0', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#8a8a80', Button: '#3a2c20', MouthDark: '#2a0d0b', Shirt: '#8a8170', Tie: '#5a2a22', Lapel: '#3e3428', TopDark: '#2e2a22' };
const LOOK = { colors: { ...base, Skin: '#d9a888', Top: '#5c4e3a', Sleeve: '#5c4e3a', Pants: '#3d3a33', Shoes: '#4a3a2a', Hair: '#7a6a58', Iris: '#5a6a72', Scarf: '#7a2f2a' },
  accessories: ['jacket', 'scarf', 'moustache'], scale: 0.99, width: 0.98, hunch: 0.45 };

// phases (shared online as a number)
const PH = ['patrol', 'toShop', 'beg', 'leave', 'flee', 'talk'];

const L = {
  hello: [
    'Barber! My favourite person on this whole street. Got a little something for old Julian?',
    'Don’t look at me like that. I’m a customer. Spiritually. Spare a hundred?',
    'Hundred bucks. That’s all. I’ll pay you back. In vibes.',
    'You know what this street needs? A rich barber helping a poor genius. Hundred dollars.',
    'Psst. Hey. I’m doing a fundraiser. For me. Minimum donation: one hundred dollars.',
    'I had a dream last night. You gave me a hundred bucks. Let’s not make me a liar.',
    'My cardboard box got a parking ticket. I’m not joking. I need a hundred dollars.',
    'Smells like money in here. And hair spray. Mostly money though. A hundred?',
    'Nice place. Very clean. Very... rich. You can spare a hundred, right?',
    'It’s me again, Julian Krüger. The legend. The myth. The guy who needs a hundred bucks.',
    'I’m not begging. I’m offering you the chance to be a good person. For a hundred.',
    'Kowalski gave me a coupon for expired yoghurt. You can do better than Kowalski.',
  ],
  afterPaid: [
    'Barber! Last time you gave me a hundred. I bought a sandwich and a lottery ticket. The ticket lost. The sandwich won.',
    'Remember the hundred? Gone. Invested. In pigeons. Long story. Another hundred?',
    'You’re the only one who ever helps me. So naturally I’m back.',
    'I told the whole street you’re generous. That’s why I’m first in line.',
  ],
  afterSlap: [
    'My cheek still remembers your hand. I forgive you. For a hundred dollars.',
    'Last time you slapped me. Let’s turn this relationship around. A hundred?',
    'No slapping today, okay? I’m fragile. Financially and emotionally.',
  ],
  afterOut: [
    'You threw me out last time. I came back. That’s called character. Hundred bucks?',
    'Door works fine, by the way. Tested it with my face. Got a hundred?',
  ],
  call: [
    'Barber... barber... BARBER!',
    'Still here! Still poor!',
    'I can wait. I’ve got nothing but time. And no money.',
    'Hey! The guy with scissors! A hundred bucks!',
    'I’ll just stand here and smell nice. That’ll be a hundred.',
    'Your customer’s hair looks great, by the way. A hundred?',
    'Hellooo? Julian Krüger is in the building!',
  ],
  street: [
    'Lovely day for not having any money.',
    'Bins on this street are five stars. Real gourmet stuff.',
    'Morning, barber. Or is it evening? I don’t own a watch. Or anything.',
    'One day I’ll own this whole street. Then I’ll be nice to me.',
    'Nice haircut. Did you do it yourself? Respect.',
    'Kowalski chased me with a broom again. I let him win.',
    'Hey, if you see a hundred bucks lying around... it’s mine.',
    'Bruno gave me a croissant. Best day of the week.',
    'I used to be a business man, you know. Business was bad.',
    'Don’t mind me. Just doing my rounds. Like a cop. But poor.',
  ],
  paid: [
    'A HUNDRED?! You beautiful human being! I’m buying a sandwich. Two sandwiches!',
    'Ohhh yes. Julian eats tonight! You’re in my will now. Which is empty, but still.',
    'This is the best day of my life. Second best. The first one was also you.',
    'I’m gonna frame this bill. Then I’m gonna spend it. Thank you, barber!',
    'You’re a legend. I’ll tell everybody your haircuts are great. Some of them are!',
    'Respect. Big respect. Julian Krüger never forgets. Except where he sleeps.',
    'Hundred dollars! I’m rich! ...For about an hour.',
  ],
  broke: [
    'You don’t even HAVE a hundred? Brother... you need a hundred more than me.',
    'Broke? You? With these chairs? Okay, okay. We’re in this together.',
  ],
  slap: [
    'OW! What was that for?!',
    'AAH! My face! My only asset!',
    'Did you just... slap me? In public?!',
    'OWWW! Okay! Okay! That’s a no, then?',
    'You hit like my ex-wife. ...Still a no?',
    'My cheek! Now I need a hundred for a doctor too!',
    'Ow. Ow ow ow. Rude. Very rude. Still poor though.',
    'I felt that in my soul. And my wallet. Which is empty.',
  ],
  slapLeave: [
    'Fine! FINE! I’m going! But I’ll be back! *sniff*',
    'Three slaps?! I’m telling Bruno! He’ll... give me a croissant!',
  ],
  out: [
    'Hey hey hey! Easy! I’m going! I’m going!',
    'Don’t touch the jacket! It’s vintage!',
    'Okay! Okay! I can see myself out! With your help, apparently!',
    'This is how you treat your best not-customer?!',
    'I’ll be back! I always come back!',
    'Ow! Fine! Your loss! I would have recommended you!',
  ],
  giveUp: [
    'Fine. I’ll come back later. You’ll be richer then.',
    'Busy, huh? I get it. I’ll be around. I’m always around.',
    'Okay, nobody loves Julian today. Tomorrow, maybe.',
  ],
  you: {
    pay: ['Here. A hundred. Go get something to eat.', 'Fine. Take it. Don’t spend it on lottery tickets.', 'Here you go, Julian.'],
    broke: ['I don’t even have a hundred bucks, man.', 'I’m broke too, Julian.'],
    slap: ['*SLAP*'],
    out: ['Out. Now.', 'Get out of my shop, Julian!', 'Not today. Out you go.'],
  },
};

// his rounds: shop side west to east, across, back along Fresh Mart, across again
const ROUTE = [
  { x: -36, z: NEAR }, { x: -19, z: NEAR }, { x: -19, z: FAR, cross: true }, { x: 6, z: FAR, stop: 'window' }, { x: 34, z: FAR },
  { x: 34, z: NEAR, cross: true }, { x: 19, z: NEAR, stop: 'bin' }, { x: 6, z: NEAR }, { x: -12, z: NEAR, stop: 'bin' },
];

export class Julian {
  constructor(game) {
    this.game = game;
    this.phase = 'patrol';
    this.leg = 0;
    this.visitT = rand(90, 140);
    this.callT = 6;
    this.mutterT = 3;
    this.slaps = 0;
    this.token = 0;
    this.remote = null;
  }

  get mem() { const sv = this.game.save; return (sv.julian ||= { paid: 0, slapped: 0, out: 0, last: null }); }

  build() {
    const g = this.game;
    const hat = new THREE.Group(); hat.add(makeBeanie('#5a6a4a')); hat.position.set(0, 0.07, -0.01); hat.rotation.x = -0.12;
    const n = this.npc = new StreetNPC(g, { name: 'Julian Krüger', look: LOOK, voice: { pitch: 104, rate: 0.98, wobble: 0.2, vol: 0.1 },
      hair: { color: '#7a6a58', style: { top: 0.3, front: 0.2, left: 0.55, right: 0.55, back: 0.7, fuzz: 0.16, noise: 0.45 }, cut: 0.5 }, hat });
    // a paper cup for change
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.1, 14, 1, true), new THREE.MeshStandardMaterial({ color: '#e8e0cc', roughness: 0.9, side: THREE.DoubleSide }));
    n.ch.hold('L', cup, { pos: [0.0, -0.08, 0.03], rot: [0, 0, 0] });
    n.ch.place(V(-30, 0, NEAR), Math.PI / 2);
    n.ch.gait = 'stroll';
    // online: the host walks him; the others follow
    g.netActors.set('julian', {
      owned: () => g.isHost,
      get: () => { const c = n.ch; return [+c.root.position.x.toFixed(2), +c.root.position.z.toFixed(2), +c.yaw.toFixed(2), gaitIndex(c.gait), PH.indexOf(this.phase)]; },
      remote: (v) => { if (!g.isHost) { this.remote = { x: v[0], z: v[1], yaw: v[2], gait: gaitName(v[3]) }; if (!this.talking) this.phase = PH[v[4] | 0] || 'patrol'; } },
      release: () => { this.remote = null; },
    });
  }

  interactables(I) {
    const g = this.game;
    I({ id: 'julian', label: () => this.label(),
      pos: () => this.npc.head(), radius: 3.0, action: () => { this.talk().catch((e) => console.error(e)); return 'julian'; } });
  }

  label() {
    const g = this.game, n = this.npc;
    if (g.state !== 'play' || !g.player.control || !g.save.tutorialDone || this.talking || !n.shown) return null;
    if (['leave', 'flee'].includes(this.phase) || n.dist() > 2.4) return null;
    return this.phase === 'beg' ? 'Deal with Julian' : 'Talk to Julian';
  }

  // ---------------------------------------------------------------- the conversation
  async talk() {
    const g = this.game, n = this.npc, ch = n.ch;
    if (this.talking) return;
    this.talking = true; n.busy = true;
    const was = this.phase;
    if (g.isHost) { this.token++; ch.stop(); }
    this.phase = 'talk';
    g.player.control = false;
    ch.lookAt(g.camera, 1);
    this.faceHim();
    let outcome = null;
    try {
      const m = this.mem;
      const open = was === 'beg' || was === 'toShop'
        ? (m.last === 'paid' && chance(0.6) ? pick(L.afterPaid) : m.last === 'slap' && chance(0.6) ? pick(L.afterSlap) : m.last === 'out' && chance(0.6) ? pick(L.afterOut) : pick(L.hello))
        : pick(L.street) + ' ' + pick(['Spare a hundred?', 'Got a hundred for me?', 'A hundred bucks would fix my whole week.']);
      ch.gesture(chance(0.5) ? 'presentL' : 'shrug', { target: () => g.camera.position });
      await n.say(open, 'greedy');
      let slapsNow = 0;
      for (;;) {
        const i = await g.ui.choices('Julian Krüger', [`Here, $${PRICE}.`, 'Slap him', was === 'beg' || was === 'toShop' ? 'Throw him out' : 'Shove him away', 'Not now.']);
        if (i === 0) {
          if (g.save.money < PRICE) {
            g.showLine('You', pick(L.you.broke), 2);
            await g.dir.wait(1.6).catch(() => {});
            ch.gesture('sigh');
            await n.say(pick(L.broke), 'disappointed');
            outcome = 'broke';
            break;
          }
          g.showLine('You', pick(L.you.pay), 2);
          await this.payOut();
          outcome = 'paid';
          break;
        } else if (i === 1) {
          slapsNow++;
          await this.slap(slapsNow);
          if (slapsNow >= 3) { outcome = 'slapLeave'; break; }
          continue;
        } else if (i === 2) {
          g.showLine('You', pick(L.you.out), 1.6);
          outcome = 'out';
          await this.shove();
          break;
        } else {
          await n.say(pick(['Not now? Now is the only time I have!', 'Okay. I’ll wait. Right here.', 'Later then. I’ll remember your face.']), 'disappointed');
          outcome = 'later';
          break;
        }
      }
    } finally {
      g.player.control = true;
      n.busy = false;
      this.talking = false;
      ch.lookAt(null);
    }
    // what happens next (the host decides where he walks; teammates tell the host)
    if (g.coop && !g.isHost) {
      this.phase = was;
      if (['paid', 'out', 'slapLeave', 'broke'].includes(outcome)) g.netOut.push({ ju: outcome });
      return;
    }
    this.after(outcome, was);
  }

  // turn your view to him, quickly but not in one snap
  faceHim() {
    const P = this.game.player, h = this.npc.head();
    const dx = h.x - P.pos.x, dz = h.z - P.pos.z;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(h.y - (P.eye ?? 1.6) - (P.pos.y || 0), Math.hypot(dx, dz)) * 0.8;
    let dy = yaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const y0 = P.yaw, p0 = P.pitch;
    let k = 0;
    const t = setInterval(() => { k = Math.min(1, k + 0.12); const e = 1 - (1 - k) ** 3; P.yaw = y0 + dy * e; P.pitch = p0 + (pitch - p0) * e; if (k >= 1) clearInterval(t); }, 16);
  }

  // what the host does after somebody dealt with him
  after(outcome, was = this.phase) {
    const inShop = this.inShop();
    if (outcome === 'paid' || outcome === 'broke' || outcome === 'slapLeave') this.leave(outcome === 'paid' ? 'speedwalk' : 'walk');
    else if (outcome === 'out') this.leave('run');
    else if (inShop) { this.phase = 'beg'; this.begT = Math.max(this.begT || 0, 30); }
    else this.resumePatrol();
    void was;
  }

  // a teammate dealt with him
  remoteOutcome(o) {
    if (!this.game.isHost || this.talking) return;
    const n = this.npc;
    if (o === 'paid') { n.ch.setEmotion('happy', 4); n.ch.gesture('fistPump', { dur: 1.2 }); }
    if (o === 'out') { n.ch.setEmotion('horrified', 2); }
    this.token++; n.ch.stop();
    this.after(o);
  }

  async payOut() {
    const g = this.game, n = this.npc, ch = n.ch;
    const R = g.player.arms.R;
    R.set({ visible: true, pos: V(0.14, -0.22, -0.48), fingers: V(0, 0.2, -1), palm: V(0, 1, 0), pose: 'pinch', speed: 10 });
    audio.paperFlick?.();
    await g.dir.wait(0.5).catch(() => {});
    R.set({ visible: false });
    audio.coin?.();
    g.addMoney(-PRICE);
    g.ui.toast(`-$${PRICE} · Julian Krüger`, 'Given');
    const m = this.mem; m.paid++; m.last = 'paid';
    g.save.stats.julianPaid = m.paid;
    ch.setEmotion('happy', 5);
    ch.gesture(chance(0.5) ? 'fistPump' : 'thumbsUp', { dur: 1.2 });
    g.exclaim?.show(ch, 2.2, 'hearts');
    audio.hearts?.();
    await n.say(pick(L.paid), 'happy');
    g.persist();
  }

  async slap(k) {
    const g = this.game, n = this.npc, ch = n.ch;
    const A = g.player.arms.L;
    g.camera.updateMatrixWorld();
    const cheek = () => ch.headWorld(V(0, 0, 0)).add(V(0, -0.04, 0)).applyMatrix4(g.camera.matrixWorldInverse);
    A.set({ visible: true, pos: cheek().add(V(-0.36, 0.06, 0.14)), fingers: V(0.3, 1, -0.2), palm: V(1, 0, -0.3), pose: 'open', speed: 40 });
    await g.dir.wait(0.12).catch(() => {});
    A.set({ pos: cheek().add(V(-0.02, 0, 0.09)), speed: 60 });
    await g.dir.wait(0.08).catch(() => {});
    g.showLine('You', '*SLAP*', 0.8);
    audio.slap();
    ch.flush?.('#e0412f', 0.7, 3);
    ch.gesture('flinch');
    ch.setEmotion(k >= 2 ? 'furious' : 'wince', 3);
    g.exclaim?.show(ch, 1.6, k >= 2 ? 'anger' : '!');
    g.player.shake = Math.max(g.player.shake || 0, 0.25);
    const m = this.mem; m.slapped++; m.last = 'slap';
    g.save.stats.julianSlapped = m.slapped;
    setTimeout(() => A.set({ pos: V(-0.3, -0.6, -0.3), speed: 12 }), 200);
    setTimeout(() => A.set({ visible: false }), 600);
    await g.dir.wait(0.4).catch(() => {});
    if (k >= 3) { ch.gesture('sob'); await n.say(pick(L.slapLeave), 'devastated'); }
    else await n.say(pick(L.slap), k >= 2 ? 'furious' : 'wince');
  }

  async shove() {
    const g = this.game, n = this.npc, ch = n.ch;
    const Lh = g.player.arms.L, R = g.player.arms.R;
    Lh.set({ visible: true, pos: V(-0.18, -0.22, -0.42), fingers: V(0.3, 0.4, -1), palm: V(0.2, 0, -1), pose: 'open', speed: 14 });
    R.set({ visible: true, pos: V(0.18, -0.22, -0.42), fingers: V(-0.3, 0.4, -1), palm: V(-0.2, 0, -1), pose: 'open', speed: 14 });
    audio.cloth?.(0.9, 0.3);
    await g.dir.wait(0.3).catch(() => {});
    Lh.set({ pos: V(-0.14, -0.15, -0.72), speed: 40 }); R.set({ pos: V(0.14, -0.15, -0.72), speed: 40 });
    audio.whoosh?.(1);
    audio.thud?.(0.6);
    g.player.shake = Math.max(g.player.shake || 0, 0.3);
    ch.setEmotion('horrified', 3);
    ch.gesture('coverHead', { dur: 1.2 });
    const m = this.mem; m.out++; m.last = 'out';
    g.save.stats.julianOut = m.out;
    setTimeout(() => { Lh.set({ visible: false }); R.set({ visible: false }); }, 450);
    n.say(pick(L.out), 'horrified');
    await g.dir.wait(0.6).catch(() => {});
  }

  // ---------------------------------------------------------------- walking (host / offline)
  inShop() { const p = this.npc.ch.root.position; return p.z < ROOM.z1 + 0.2 && Math.abs(p.x) < ROOM.x1; }

  async go(points, gait) {
    const t = this.token;
    await this.npc.ch.walkTo(points, gait);
    return t === this.token;
  }

  resumePatrol() {
    this.phase = 'patrol';
    this.token++;
    const p = this.npc.ch.root.position;
    // pick up the round at the closest leg
    let best = 0, bd = 1e9;
    ROUTE.forEach((r, i) => { const d = Math.hypot(r.x - p.x, r.z - p.z); if (d < bd) { bd = d; best = i; } });
    this.leg = best;
    this.walking = false;
  }

  async patrolStep() {
    const r = ROUTE[this.leg];
    const n = this.npc, ch = n.ch;
    this.walking = true;
    if (r.cross) {
      // look both ways, wait for the cars
      ch.gesture('lookAround');
      const t = this.token;
      await this.game.dir.until(() => !this.carNear(ch.root.position.x), 25).catch(() => {});
      if (t !== this.token) return;
    }
    const ok = await this.go([V(r.x, 0, r.z)], r.cross ? 'speedwalk' : 'stroll');
    if (!ok) return;
    if (r.stop) {
      ch.gesture(r.stop === 'bin' ? 'scratchHead' : 'lookAround');
      const t = this.token;
      await this.game.dir.wait(rand(2.5, 5)).catch(() => {});
      if (t !== this.token) return;
    }
    this.leg = (this.leg + 1) % ROUTE.length;
    this.walking = false;
  }

  carNear(x) { return (this.game.street?.cars || []).some((c) => Math.abs(c.obj.position.x - x) < 14); }

  async visit() {
    const n = this.npc, ch = n.ch, g = this.game;
    this.phase = 'toShop';
    this.token++;
    const p = ch.root.position;
    // cross back to the shop side first if he's over at Fresh Mart
    if (p.z > FZ + 6) {
      const t = this.token;
      await g.dir.until(() => !this.carNear(p.x), 25).catch(() => {});
      if (t !== this.token) return;
      if (!(await this.go([V(p.x, 0, NEAR)], 'speedwalk'))) return;
    }
    if (!(await this.go([V(SPOTS.doorOut.x, 0, NEAR)], 'walk'))) return;
    if (!(await this.go([SPOTS.doorStep], 'walk'))) return;
    g.shop.openDoor(false, 1.6);
    audio.bell?.();
    if (!(await this.go([SPOTS.doorIn, BEG], 'walk'))) return;
    this.phase = 'beg';
    this.begT = 70;
    this.callT = 1.5;
  }

  leave(gait = 'walk') {
    const g = this.game, n = this.npc;
    this.phase = gait === 'run' ? 'flee' : 'leave';
    this.token++;
    this.visitT = rand(160, 260);
    const t = this.token;
    const inside = this.inShop();
    (async () => {
      if (inside) {
        if (!(await this.go([SPOTS.hub.clone().setX(1.3), SPOTS.doorIn], gait))) return;
        g.shop.openDoor(gait === 'run', 1.4);
        if (!(await this.go([SPOTS.doorStep, V(SPOTS.doorOut.x - 2, 0, NEAR)], gait))) return;
      } else {
        const p = n.ch.root.position, dir = p.x > 0 ? 1 : -1;
        if (!(await this.go([V(p.x + dir * 7, 0, p.z > FZ + 6 ? FAR : NEAR)], gait))) return;
      }
      if (t === this.token) this.resumePatrol();
    })();
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game, n = this.npc;
    if (!n) return;
    const live = g.save.tutorialDone && g.state !== 'menu' && g.state !== 'intro';
    n.show(live);
    n.update(dt);
    if (!live) return;
    n.mark = this.phase === 'beg' && !this.talking ? '!' : null;
    if (this.remote && !g.isHost) { if (!this.talking) followRemote(n.ch, this.remote); this.mutter(dt); return; }
    if (this.talking) return;
    this.visitT -= dt;
    if (this.phase === 'patrol') {
      if (!this.walking) this.patrolStep().catch(() => { this.walking = false; });
      // he only comes in during opening hours... or whenever he feels like it
      // one thing at a time: not while the van is about or the shop is packed
      if (this.visitT <= 0 && g.state !== 'reaction' && !g.van?.active && g.customers.list.length < 3) { this.walking = false; this.visit().catch(() => {}); }
      this.mutter(dt);
    } else if (this.phase === 'beg') {
      n.ch.lookAt(g.camera, 0.6);
      this.begT -= dt;
      this.callT -= dt;
      const d = n.dist();
      if (this.callT <= 0 && d < 9) { this.callT = rand(7, 11); n.ch.gesture(chance(0.5) ? 'wave' : 'presentL', { target: () => g.camera.position }); n.say(pick(L.call), 'greedy'); }
      if (this.begT <= 0) { n.say(pick(L.giveUp), 'disappointed'); this.leave('stroll'); }
    }
  }

  // street chatter when you walk past
  mutter(dt) {
    const n = this.npc;
    this.mutterT -= dt;
    if (this.phase !== 'patrol' || this.mutterT > 0 || n.dist() > 4.5 || this.talking) return;
    this.mutterT = rand(18, 30);
    n.ch.lookAt(this.game.camera, 0.6);
    n.say(pick(L.street), 'neutral');
  }
}

// Side quests on the street:
//   flowers  — Elli Krüger, the florist, has a crush on Bruno the baker. Play messenger.
//   enrico   — Enrico busks with his guitar and has a gig tonight. He needs a proper fade.
//   jannis   — "Jannis Luftberlong ist weg": Enrico's drummer has vanished. Ask around, find
//              him hiding in an alley, get him into the chair.
import * as THREE from 'three';
import { StreetNPC } from './story.js';
import { ROOM, DOOR } from '../world/shop.js';
import { randomCustomerLook } from '../chars/looks.js';
import { audio } from '../audio/audio.js';
import { pick, rand } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FZ = ROOM.z1 + 0.24;
const base = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#2a2a2e', TopDark: '#2d2a28' };

const ELLI = { colors: { ...base, Skin: '#f1c9a8', Top: '#e8a0b4', Sleeve: '#e8a0b4', Pants: '#3a3f4a', Shoes: '#e8e2d6', Hair: '#c9a35a', Iris: '#5f7a52', Apron: '#3e6b4a' },
  accessories: ['tee', 'apron'], scale: 0.93, width: 0.92, hunch: 0 };
const ENRICO = { colors: { ...base, Skin: '#d29b77', Top: '#2a2a2e', Sleeve: '#2a2a2e', Pants: '#34404f', Shoes: '#6a4a2e', Hair: '#1f1611', Iris: '#3b2a1e', Shirt: '#c8302b', Frame: '#111' },
  accessories: ['jacket', 'glasses', 'chain'], scale: 1.02, width: 1.0, hunch: 0.05 };
const JANNIS = { colors: { ...base, Skin: '#efc3a0', Top: '#4a6a8a', Sleeve: '#4a6a8a', Pants: '#2b2f38', Shoes: '#e8e2d6', Hair: '#8c6a42', Iris: '#6a8aa0', TopDark: '#2f4a66' },
  accessories: ['hoodie'], scale: 0.98, width: 0.96, hunch: 0.2 };

export const SIDE_QUESTS = {
  flowers: { title: 'Flowers for Bruno', ch: 99, giver: 'Elli Krüger', reward: { money: 40, xp: 60 },
    steps: ['Talk to Elli Krüger outside the flower shop', 'Bring Elli’s bouquet to Bruno the baker', 'Tell Elli what Bruno said'] },
  enrico: { title: 'Enrico’s Big Gig', ch: 99, giver: 'Enrico', reward: { money: 70, xp: 90 },
    steps: ['Talk to Enrico, the street musician', 'Give Enrico a 4-star cut (he comes in when the shop is open)', 'See Enrico on the street before his gig'] },
  jannis: { title: 'Jannis Luftberlong ist weg', ch: 99, giver: 'Enrico', reward: { money: 80, xp: 110 },
    steps: ['Ask Bruno or Elli if they’ve seen Jannis', 'Find Jannis Luftberlong (try the alleys)', 'Give Jannis a fresh cut (he’s on his way to the shop)', 'Tell Enrico you found his drummer'] },
};

// ------------------------------------------------------------------ props
function bouquet() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#f2e6c8', roughness: 0.9, side: THREE.DoubleSide }));
  paper.rotation.x = Math.PI; paper.position.y = 0.0; g.add(paper);
  const cols = ['#e0455a', '#f2cf7c', '#ffffff', '#c985d6', '#e86a50', '#e0455a'];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = i ? 0.045 : 0;
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.7 }));
    f.position.set(Math.cos(a) * r, 0.14 + Math.random() * 0.03, Math.sin(a) * r); g.add(f);
  }
  const leaf = new THREE.MeshStandardMaterial({ color: '#3f6b38', roughness: 0.8 });
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 4), leaf); const a = i * 1.6; l.position.set(Math.cos(a) * 0.06, 0.12, Math.sin(a) * 0.06); l.rotation.z = Math.cos(a) * 0.8; g.add(l); }
  return g;
}

function guitar() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#b5651d', roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.6 });
  for (const [r, y] of [[0.17, 0], [0.13, 0.2]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.09, 20), wood); b.rotation.x = Math.PI / 2; b.position.y = y; g.add(b); }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), dark); hole.position.set(0, 0.12, 0.046); g.add(hole);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.03), dark); neck.position.set(0, 0.55, 0.02); g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.03), dark); head.position.set(0, 0.85, 0.02); g.add(head);
  g.scale.setScalar(0.95);
  return g;
}

function sticks() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: '#e1c38a', roughness: 0.6 });
  for (const x of [-0.015, 0.015]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.38, 6), m); s.position.set(x, 0.12, 0); s.rotation.z = x * 6; g.add(s); }
  return g;
}

// ------------------------------------------------------------------ the quests
export class SideQuests {
  constructor(story) {
    this.story = story;
    this.game = story.game;
    this.npcs = {};
    this.carrying = null;
  }

  get s() { return this.story.s; }
  step(id) { return this.story.step(id); }

  build() {
    const g = this.game;
    const elli = this.npcs.elli = new StreetNPC(g, { name: 'Elli Krüger', look: ELLI, voice: { pitch: 215, rate: 1.05, wobble: 0.12, vol: 0.1 },
      hair: { color: '#c9a35a', style: { top: 0.55, front: 0.5, left: 0.6, right: 0.6, back: 0.72, fuzz: 0.03 }, cut: 0.45 } });
    elli.home = V(12.3, 0, FZ + 0.6);
    elli.ch.place(elli.home, 0);
    const en = this.npcs.enrico = new StreetNPC(g, { name: 'Enrico', look: ENRICO, voice: { pitch: 118, rate: 1.1, wobble: 0.14, vol: 0.1 },
      hair: { color: '#1f1611', style: { top: 0.42, front: 0.4, left: 0.3, right: 0.3, back: 0.34, fuzz: 0.05 }, cut: 0.35 } });
    en.home = V(-7.6, 0, FZ + 0.75);
    en.ch.place(en.home, 0.2);
    const gt = guitar();
    // slung across the chest on a strap
    en.ch.bones.Chest.add(gt);
    gt.position.set(0.02, -0.28, 0.17); gt.rotation.set(0.1, 0, 0.95);
    en.guitar = gt;
    const ja = this.npcs.jannis = new StreetNPC(g, { name: 'Jannis Luftberlong', look: JANNIS, voice: { pitch: 150, rate: 0.95, wobble: 0.1, vol: 0.09 },
      hair: { color: '#8c6a42', style: { top: 0.62, front: 0.66, left: 0.5, right: 0.42, back: 0.6, fuzz: 0.12, noise: 0.3 }, cut: 0.5 } });
    ja.home = V(24.6, 0, FZ - 8.6);
    ja.ch.sitOn({ pos: ja.home, rot: 0, height: 0.42 }, true);
    ja.ch.setCap('#c8302b');
    ja.ch.hold('R', sticks(), { pos: [0.01, -0.07, 0.02], rot: [0, 0, 0.3] });
    // the crate he sits on
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.45), new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.9 }));
    crate.position.set(ja.home.x, 0.21, ja.home.z - 0.05);
    g.scene.add(crate);
    this.strumT = 2;
    this.drumT = 1;
  }

  interactables(I) {
    const g = this.game;
    const play = () => g.state === 'play' && g.player.control;
    const near = (n, r = 2.6) => n.shown && n.dist() < r && !n.busy;
    I({ id: 'elli', label: () => (play() && near(this.npcs.elli) ? (this.carrying === 'answer' ? 'Tell Elli what Bruno said' : 'Talk to Elli Krüger') : null),
      pos: () => this.npcs.elli.head(), radius: 3, action: () => { this.talkElli().catch((e) => console.error(e)); return 'elli'; } });
    I({ id: 'enrico', label: () => (play() && near(this.npcs.enrico) ? 'Talk to Enrico' : null),
      pos: () => this.npcs.enrico.head(), radius: 3, action: () => { this.talkEnrico().catch((e) => console.error(e)); return 'enrico'; } });
    I({ id: 'jannis', label: () => (play() && near(this.npcs.jannis, 2.8) ? 'Talk to the guy on the crate' : null),
      pos: () => this.npcs.jannis.head(), radius: 3.2, action: () => { this.talkJannis().catch((e) => console.error(e)); return 'jannis'; } });
  }

  // Bruno's label when you're carrying something for him
  bakerLabel() {
    if (this.carrying === 'bouquet') return 'Give Bruno the flowers';
    if (this.step('jannis') === 0) return 'Ask Bruno about Jannis';
    return null;
  }

  // ---------------------------------------------------------------- helpers
  async talking(n, fn) {
    const g = this.game;
    if (n.busy) return;
    n.busy = true; g.player.control = false;
    n.ch.lookAt(g.camera, 1);
    try { await fn(); } finally {
      n.busy = false; n.ch.lookAt(null);
      if (g.state === 'play') { g.player.control = true; g.enterFP(); }
      this.story.refresh();
    }
  }

  holdItem(obj) {
    const R = this.game.player.arms.R;
    R.set({ visible: true, pos: V(0.2, -0.3, -0.42), fingers: V(0, 0, -1), palm: V(-1, 0, 0), pose: 'grip', speed: 10 });
    R.hold(obj, { pos: [0, -0.08, 0], rot: [0, 0, 0], scale: 1 });
  }

  dropItem() { const R = this.game.player.arms.R; R.drop(); R.set({ visible: false }); }

  // ---------------------------------------------------------------- Elli
  async talkElli() {
    const n = this.npcs.elli, st = this.step('flowers');
    await this.talking(n, async () => {
      if (st <= 0) {
        n.ch.gesture('wave', { dur: 1.2 });
        await n.say('Oh! Hi! You’re the barber, right? I’m Elli. Elli Krüger. I do the flowers.', 'happy');
        n.ch.setEmotion('surprised', 2);
        await n.say('Can I ask you something... weird? You know Bruno? From the bakery?', 'neutral');
        await n.say('He gives me a free croissant every morning. EVERY morning. That means something, right?', 'happy');
        const i = await this.game.ui.choices('Elli Krüger', ['That definitely means something.', 'Maybe he just likes croissants.']);
        await n.say(i === 0 ? 'I KNEW it! Okay. Okay okay okay.' : 'Nobody likes croissants THAT much.', i === 0 ? 'happy' : 'annoyed');
        await n.say('Could you bring him these? Don’t say they’re from me. ...Okay, say they’re from me.', 'happy');
        this.story.setStep('flowers', 1);
        this.carrying = 'bouquet';
        this.holdItem(bouquet());
        audio.cloth?.(0.6, 0.2);
      } else if (st === 1) {
        if (this.carrying !== 'bouquet') { this.carrying = 'bouquet'; this.holdItem(bouquet()); }
        await n.say(pick(['Did you give them to him yet? Don’t look at me, LOOK AT THE BAKERY.', 'Go go go! Before they wilt!']), 'happy');
      } else if (st === 2) {
        this.dropItem(); this.carrying = null;
        await n.say('Well?! What did he say?!', 'surprised');
        const i = await this.game.ui.choices('Tell Elli', ['He turned red and said he’ll bake you a cake.', 'He said: “Croissant tomorrow. Same time.”']);
        n.ch.setEmotion('happy', 4);
        n.ch.gesture('fistPump', { dur: 1.4 });
        await n.say(i === 0 ? 'A CAKE?! That’s basically a proposal!' : 'Same time! That’s a DATE. In bakery language.', 'happy');
        await n.say('Thank you! Here — and your shop gets free flowers from me. Forever. Or a month.', 'happy');
        this.story.setStep('flowers', 3);
        if (this.step('jannis') === 0) await this.jannisHint(n);
      } else if (this.step('jannis') === 0) {
        await this.jannisHint(n);
      } else {
        await n.say(pick(['Bruno brought me a cake. A CAKE. With my name on it.', 'Roses are on sale today. Don’t tell anyone.', 'Your shop needs a plant. Trust me. I’m a professional.', 'Have you seen Enrico play? He’s actually good. Don’t tell him.']), 'happy');
      }
    });
  }

  async jannisHint(n) {
    await n.say('Jannis? Enrico’s drummer? Curly hair, red cap, always drumming on everything?', 'neutral');
    await n.say('I saw him sneaking into the side street by the café. He looked... sad. And his hair looked worse.', 'disappointed');
    this.story.setStep('jannis', 1);
  }

  // Bruno: called from the baker's own talk; returns true when it handled the conversation
  async bakerTalk(br) {
    if (this.carrying === 'bouquet' && this.step('flowers') === 1) {
      this.dropItem(); this.carrying = 'answer';
      br.ch.setEmotion('surprised', 2);
      await br.say('Flowers? For... me? From who?', 'surprised');
      this.game.showLine('You', 'From Elli. The florist.', 1.6);
      await this.game.dir.wait(1.4).catch(() => {});
      br.ch.flush?.('#e86a7a', 0.5, 5);
      br.ch.setEmotion('happy', 4);
      await br.say('Elli... sent me FLOWERS? I give her croissants every morning! I never know what to say!', 'happy');
      await br.say('Tell her... tell her I’ll bake her a cake. The biggest one. With her name on it!', 'happy');
      this.story.setStep('flowers', 2);
      return true;
    }
    if (this.step('jannis') === 0) {
      await br.say('Jannis? The drummer kid? He used to drum on my bread trays. Drove me crazy.', 'annoyed');
      await br.say('Haven’t seen him in two days. Ask Elli, she sees everybody from her shop window.', 'neutral');
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Enrico
  async talkEnrico() {
    const n = this.npcs.enrico, st = this.step('enrico'), js = this.step('jannis');
    await this.talking(n, async () => {
      if (st <= 0) {
        audio.tone?.(196, 0.5, { type: 'triangle', vol: 0.06 }); audio.tone?.(247, 0.5, { type: 'triangle', vol: 0.05, when: 0.08 });
        await n.say('Ayy, my barber! Listen. Big night. Café Luna. Tonight. Me, my guitar, a sold-out crowd of... twelve people.', 'happy');
        await n.say('But look at this hair. I look like a broom that gave up. I need a fade that says “rock star”.', 'disappointed');
        const i = await this.game.ui.choices('Enrico', ['Come by the shop, I’ll fix you up.', 'Twelve people isn’t sold out.']);
        if (i === 1) await n.say('It’s a SMALL café, man.', 'annoyed');
        await n.say('I’ll swing by when you’re open. Four stars or I’m wearing a hat on stage.', 'happy');
        this.story.setStep('enrico', 1);
      } else if (st === 1) {
        await n.say(this.enricoIn ? 'I’m already in your shop, man! Go cut my hair!' : 'Open the shop and I’ll come right in. Four stars, remember!', 'happy');
      } else if (st === 2) {
        n.ch.gesture('fistPump', { dur: 1.2 });
        await n.say('LOOK at me. The crowd is gonna lose it. All twelve of them.', 'happy');
        await n.say('Here’s your cut of the door money. And a free ticket, obviously.', 'happy');
        this.story.setStep('enrico', 3);
        if (js < 0) await this.startJannis(n);
      } else if (js < 0 && st >= 1) {
        await this.startJannis(n);
      } else if (js === 3) {
        n.ch.gesture('fistPump', { dur: 1.4 });
        await n.say('JANNIS IS BACK?! With a fresh cut?! Bro. BRO. The band is whole again!', 'happy');
        await n.say('You saved the gig. Here, take this. And come see us play!', 'happy');
        this.story.setStep('jannis', 4);
        setTimeout(() => this.game.ui.banner('Tonight at Café Luna', 'Enrico & Jannis', 'Live. Fresh fades. Twelve fans.', 2600), 400);
      } else if (js >= 0 && js < 3) {
        await n.say(pick(['Any sign of Jannis? The gig is TONIGHT, man.', 'Without a drummer I’m just a guy yelling with a guitar.']), 'disappointed');
      } else {
        await n.say(pick(['This one’s called “Fade Into You”. I wrote it in your chair.', 'Twelve fans last night. Thirteen if you count the dog.', 'You ever think about getting a jukebox in there?']), 'happy');
        audio.tone?.(220, 0.4, { type: 'triangle', vol: 0.05 }); audio.tone?.(277, 0.4, { type: 'triangle', vol: 0.05, when: 0.15 });
      }
    });
  }

  async startJannis(n) {
    n.ch.setEmotion('devastated', 3);
    await n.say('One problem though. Jannis is gone. Jannis Luftberlong. My drummer. Two days, no calls, nothing.', 'devastated');
    await n.say('He had a bad haircut last week and just... disappeared. Can you ask around? Bruno, Elli, anybody?', 'disappointed');
    this.story.setStep('jannis', 0);
  }

  // ---------------------------------------------------------------- Jannis
  async talkJannis() {
    const n = this.npcs.jannis, js = this.step('jannis');
    await this.talking(n, async () => {
      if (js < 1) {
        await n.say(pick(['...Leave me alone.', 'Not now, man.', '*quiet drumming on a bucket*']), 'disappointed');
        return;
      }
      if (js === 1) {
        n.ch.setEmotion('surprised', 1.5);
        await n.say('How did you find me? ...Did Enrico send you?', 'surprised');
        n.ch.setEmotion('devastated', 4);
        await n.say('Look at my hair. Some guy downtown gave me a “trendy cut”. I look like a pineapple in a storm.', 'devastated');
        await n.say('I can’t go on stage like this. I’m Jannis Luftberlong. People EXPECT things.', 'disappointed');
        const i = await this.game.ui.choices('Jannis Luftberlong', ['Come to my shop. I’ll fix it, for free.', 'Honestly? Pineapples are in this year.']);
        if (i === 1) await n.say('...That’s not helping.', 'annoyed');
        await n.say('For free? ...Okay. Okay! I’ll come. But if it goes wrong I’m moving into this alley for good.', 'happy');
        this.story.setStep('jannis', 2);
        // he gets up and heads for the shop; he'll come in as a customer
        n.ch.standUp?.();
        n.leaving = true;
      } else if (js === 2) {
        await n.say('I’m coming, I’m coming! Just finishing this drum solo.', 'happy');
      }
    });
  }

  // ---------------------------------------------------------------- the shop side
  spawnQuestCustomer(kind) {
    const g = this.game;
    const look = { ...randomCustomerLook(), ...(kind === 'enrico' ? ENRICO : JANNIS) };
    look.hairColor = kind === 'enrico' ? '#1f1611' : '#8c6a42';
    look.curl = kind === 'jannis' ? 0.75 : 0.3;
    look.hairType = kind === 'jannis' ? 'curly' : 'wavy';
    look.cap = kind === 'jannis' ? '#c8302b' : null;
    look.voice = kind === 'enrico' ? { pitch: 118, rate: 1.1, wobble: 0.14, vol: 0.1 } : { pitch: 150, rate: 0.95, wobble: 0.1, vol: 0.09 };
    const cutId = kind === 'enrico' ? (g.level >= 4 ? 'lowFade' : 'taperFade') : 'shortBackSides';
    const c = g.customers.spawn({ name: kind === 'enrico' ? 'Enrico' : 'Jannis', look, cutId, noBeard: kind === 'jannis', noDye: true });
    c.questId = kind;
    this.npcs[kind].show(false);
    if (kind === 'enrico') this.enricoIn = true; else this.jannisIn = true;
    g.ui.toast(kind === 'enrico' ? 'Enrico just walked in for his gig cut' : 'Jannis made it to the shop!', 'Quest');
  }

  on(type, data) {
    if (type !== 'cut') return;
    const { c, result } = data;
    if (c.questId === 'enrico') {
      this.enricoIn = false;
      this.npcs.enrico.show(true);
      if (result.stars >= 4) this.story.setStep('enrico', 2);
      else setTimeout(() => this.game.ui.toast('Enrico: “Not rock star enough...” — he’ll be back for another try', 'Quest'), 2500);
    }
    if (c.questId === 'jannis') {
      this.jannisIn = false;
      this.story.setStep('jannis', 3);
      if (result.stars >= 4) this.game.addMoney(15);
    }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game, sv = g.save;
    if (!sv?.tutorialDone) { for (const n of Object.values(this.npcs)) n.show(false); return; }
    const fl = this.step('flowers'), en = this.step('enrico'), js = this.step('jannis');
    const { elli, enrico, jannis } = this.npcs;
    elli.show(true);
    enrico.show(!this.enricoIn && this.s.ch >= 1);
    jannis.show(js >= 1 && js < 3 && !this.jannisIn && !jannis.arrived);
    for (const n of [elli, enrico, jannis]) n.update(dt);
    // markers
    elli.mark = fl < 1 ? '!' : (fl === 2 || js === 0) ? '?' : null;
    enrico.mark = (en < 1 && this.s.ch >= 2) ? '!' : (en === 2 || js === 3 || (en >= 1 && js < 0)) ? '?' : null;
    jannis.mark = js === 1 ? '!' : null;
    // Enrico busks: a strum now and then when you're near
    if (enrico.shown && !enrico.busy && enrico.dist() < 9) {
      this.strumT -= dt;
      if (this.strumT < 0) { this.strumT = rand(2.5, 4); const r = pick([196, 220, 247, 262]); for (let k = 0; k < 3; k++) audio.tone?.(r * [1, 1.26, 1.5][k], 0.6, { type: 'triangle', vol: 0.025, when: k * 0.04 }); }
    }
    // Jannis drums on his bucket
    if (jannis.shown && !jannis.busy && jannis.dist() < 10 && !jannis.leaving) {
      this.drumT -= dt;
      if (this.drumT < 0) { this.drumT = rand(0.25, 0.5); audio.noiseBurst?.(0.05, { vol: 0.05, type: 'lowpass', freq: 500 }); }
    }
    // Jannis walks to the shop
    if (jannis.leaving && !jannis.walking) {
      jannis.walking = true;
      jannis.ch.walkTo([V(24.6, 0, FZ + 1.4), V(DOOR.x + 1, 0, FZ + 1.4)], 'walk').then(() => { jannis.leaving = false; jannis.walking = false; jannis.arrived = true; });
    }
    // a quest customer who stormed off (or got thrown out) comes back another time
    if (this.enricoIn && !g.customers.list.some((c) => c.questId === 'enrico')) { this.enricoIn = false; this.spawnT = 40; }
    if (this.jannisIn && !g.customers.list.some((c) => c.questId === 'jannis')) { this.jannisIn = false; this.spawnT = 40; }
    // after a reload mid-quest: Jannis was already on his way
    if (js === 2 && !jannis.arrived && !jannis.leaving && !jannis.walking) jannis.leaving = true;
    // quest customers come in while the shop is open
    this.spawnT = (this.spawnT || 0) - dt;
    if (this.spawnT < 0 && g.clock?.open && !g.clock.closing && g.state === 'play') {
      this.spawnT = 6;
      const room = g.customers.list.length < 5;
      if (en === 1 && !this.enricoIn && room && Math.random() < 0.5) this.spawnQuestCustomer('enrico');
      else if (js === 2 && jannis.arrived && !this.jannisIn && room) this.spawnQuestCustomer('jannis');
    }
    // Jannis arrives even when the shop is closed: he waits by the door
    if (js === 2 && !this.jannisIn && jannis.arrived) jannis.show(true);
    // quests open up with the story
    if (fl < 0 && this.s.ch >= 1) this.story.setStep('flowers', 0, { silent: false });
    if (en < 0 && this.s.ch >= 2) this.story.setStep('enrico', 0);
  }
}

// The people of the outer blocks and their quests:
//   ralf   — "Ralf’s Lucky Ticket": the kiosk owner lost the ticket he swears is a winner
//   dork   — "Mr. Dörk’s Standards": the old antique dealer only trusts barbers who prove it
//   willi  — "Currywurst Crisis": Willi's sausage delivery ended up at Fresh Mart
//   party  — "Street Party": once all three know you, Ralf wants a party on Willi's square
// Ralf also sells scratch cards ($5) any time. Online everything is shared like the other quests.
import * as THREE from 'three';
import { StreetNPC } from './story.js';
import { ROOM } from '../world/shop.js';
import { OUTER } from '../world/outerblocks.js';
import { MART } from '../world/martinterior.js';
import { makeBox, makeMarker } from '../world/storyassets.js';
import { randomCustomerLook } from '../chars/looks.js';
import { audio } from '../audio/audio.js';
import { pick, rand, chance } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FZ = ROOM.z1 + 0.24;
const base = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#2a2a2e', TopDark: '#2d2a28' };

const RALF = { colors: { ...base, Skin: '#e3b08c', Top: '#2f62c8', Sleeve: '#2f62c8', Pants: '#3a332c', Shoes: '#2a1a12', Hair: '#6b4a2e', Iris: '#4a6a7a', Apron: '#2a2a2e' },
  accessories: ['vest', 'belly', 'moustache'], scale: 1.0, width: 1.1, hunch: 0.1 };
const DORK = { colors: { ...base, Skin: '#efc3a0', Top: '#3a332c', Sleeve: '#3a332c', Pants: '#2b2f38', Shoes: '#1b1b1d', Hair: '#d8d4cc', Iris: '#5a7380', Lapel: '#2a2420', Tie: '#5a2a5a' },
  accessories: ['jacket', 'tie', 'glasses'], scale: 0.95, width: 0.9, hunch: 0.55 };
const WILLI = { colors: { ...base, Skin: '#d29b77', Top: '#f3efe4', Sleeve: '#f3efe4', Pants: '#3a3f4a', Shoes: '#2a1a12', Hair: '#2e2018', Iris: '#3b2a1e', Apron: '#c8302b' },
  accessories: ['tee', 'apron', 'belly'], scale: 1.03, width: 1.12, hunch: 0.05 };

export const OUTER_QUESTS = {
  ralf: { title: 'Ralf’s Lucky Ticket', ch: 99, giver: 'Ralf', reward: { money: 80, xp: 90 },
    steps: ['Talk to Ralf at his kiosk (east end of the street)', 'Find Ralf’s lucky ticket (he lost it feeding pigeons at Willi’s square)', 'Bring the ticket back to Ralf'] },
  dork: { title: 'Mr. Dörk’s Standards', ch: 99, giver: 'Mr. Dörk', reward: { money: 160, xp: 160 },
    steps: ['Talk to Mr. Dörk outside his antique shop (east end)', 'Give two 4-star cuts — Mr. Dörk is “inspecting”', 'Tell Mr. Dörk you are ready for him', 'Give Mr. Dörk a 4-star cut in your shop'] },
  willi: { title: 'Currywurst Crisis', ch: 99, giver: 'Willi', reward: { money: 60, xp: 80 },
    steps: ['Talk to Willi at his snack stand (west end)', 'Pick up Willi’s sausage delivery from Dennis at Fresh Mart', 'Bring the box to Willi'] },
  party: { title: 'Street Party', ch: 99, giver: 'Ralf', reward: { money: 120, xp: 150 },
    steps: ['Tell Willi about Ralf’s party idea', 'Ask Mr. Dörk to lend his gramophone', 'Come to the party on Willi’s square'] },
};

function ticket() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffe066'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#1f5fa8'; x.font = '900 24px Arial'; x.fillText('LOTTO', 10, 30);
  x.font = '700 14px Arial'; x.fillText('7 13 21 33 42', 10, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, side: THREE.DoubleSide }));
  return m;
}

export class OuterQuests {
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
    const ralf = this.npcs.ralf = new StreetNPC(g, { name: 'Ralf', look: RALF, voice: { pitch: 108, rate: 1.15, wobble: 0.1, vol: 0.11 },
      hair: { color: '#6b4a2e', style: { top: 0.18, front: 0.12, left: 0.2, right: 0.2, back: 0.24, fuzz: 0.04, bald: 0.45 }, cut: 0.3 } });
    ralf.home = V(OUTER.ralf.x, 0, FZ + OUTER.ralf.z);
    ralf.ch.place(ralf.home, 0.3);
    const dork = this.npcs.dork = new StreetNPC(g, { name: 'Mr. Dörk', look: DORK, voice: { pitch: 98, rate: 0.85, wobble: 0.16, vol: 0.1 },
      hair: { color: '#d8d4cc', style: { top: 0.2, front: 0.15, left: 0.22, right: 0.22, back: 0.26, fuzz: 0.02, bald: 0.6 }, cut: 0.2 } });
    dork.home = V(OUTER.dork.x, 0, FZ + OUTER.dork.z);
    dork.ch.sitOn({ pos: dork.home, rot: 0, height: 0.46 }, true);
    const willi = this.npcs.willi = new StreetNPC(g, { name: 'Willi', look: WILLI, voice: { pitch: 120, rate: 1.05, wobble: 0.12, vol: 0.12 },
      hair: { color: '#2e2018', style: { top: 0.3, front: 0.25, left: 0.18, right: 0.18, back: 0.2, fuzz: 0.03 }, cut: 0.3 } });
    willi.home = V(OUTER.willi.x, 0, FZ - 1.4 + 0.55);
    willi.ch.place(willi.home, 0);
    willi.ch.setCap('#c8302b');
    // Ralf's ticket lying by the fountain (only while you're looking for it)
    const t = this.ticketMesh = ticket();
    t.rotation.x = -Math.PI / 2; t.rotation.z = 0.5;
    t.position.set(OUTER.ticket.x, 0.012, FZ + OUTER.ticket.z);
    t.visible = false;
    g.scene.add(t);
    this.ticketMark = makeMarker('?');
    this.ticketMark.visible = false;
    g.scene.add(this.ticketMark);
    // party decorations (bunting) for the finale
    this.bunting = new THREE.Group();
    const cols = ['#e0455a', '#f2cf7c', '#4aa3df', '#5fbf6a', '#c985d6'];
    for (let i = 0; i < 22; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 0.8 }));
      f.rotation.z = Math.PI; f.position.set(-67.5 + i * 0.52, 3.0 - Math.sin(i / 21 * Math.PI) * 0.6, FZ - 0.4); this.bunting.add(f);
    }
    this.bunting.visible = !!this.s.flagsParty;
    g.scene.add(this.bunting);
  }

  interactables(I) {
    const g = this.game;
    const play = () => g.state === 'play' && g.player.control;
    const near = (n, r = 2.6) => n.shown && n.dist() < r && !n.busy;
    I({ id: 'ralf', label: () => (play() && near(this.npcs.ralf) ? (this.carrying === 'ticket' ? 'Give Ralf his ticket' : 'Talk to Ralf') : null),
      pos: () => this.npcs.ralf.head(), radius: 3, action: () => { this.talkRalf().catch((e) => console.error(e)); return 'ralf'; } });
    I({ id: 'dork', label: () => (play() && near(this.npcs.dork, 2.4) ? 'Talk to Mr. Dörk' : null),
      pos: () => this.npcs.dork.head(), radius: 3, action: () => { this.talkDork().catch((e) => console.error(e)); return 'dork'; } });
    I({ id: 'willi', label: () => (play() && near(this.npcs.willi, 3.0) ? (this.carrying === 'sausages' ? 'Give Willi his sausages' : 'Talk to Willi') : null),
      pos: () => this.npcs.willi.head(), radius: 3.4, action: () => { this.talkWilli().catch((e) => console.error(e)); return 'willi'; } });
    I({ id: 'ticket', label: () => (play() && this.ticketMesh.visible && !this.handsFull() && this.ticketMesh.position.distanceTo(g.player.pos) < 1.8 ? 'Pick up the lottery ticket' : null),
      pos: () => this.ticketMesh.position.clone().add(V(0, 0.15, 0)), radius: 2.4, action: () => { this.pickTicket(); return 'ticket'; } });
    I({ id: 'sausages', label: () => (play() && this.step('willi') === 1 && !this.handsFull() && MART.counter && this.counterDist() < 2.2 ? 'Pick up Willi’s sausage delivery' : null),
      pos: () => V(MART.counter.x, 1.1, (MART.counter.z0 + MART.counter.z1) / 2), radius: 2.6, action: () => { this.pickSausages().catch((e) => console.error(e)); return 'sausages'; } });
  }

  handsFull() { return !!(this.carrying || this.story.carrying || this.story.side?.carrying); }
  counterDist() { const c = MART.counter, P = this.game.player.pos; return Math.hypot(P.x - c.x, P.z - (c.z0 + c.z1) / 2); }

  holdItem(obj) {
    const R = this.game.player.arms.R;
    R.set({ visible: true, pos: V(0.2, -0.3, -0.42), fingers: V(0, 0, -1), palm: V(-1, 0, 0), pose: 'grip', speed: 10 });
    R.hold(obj, { pos: [0, -0.08, 0], rot: [0, 0, 0], scale: 1 });
  }

  dropItem() { const R = this.game.player.arms.R; R.drop(); R.set({ visible: false }); this.carrying = null; }

  async talking(n, fn) { return this.story.side.talking(n, fn); }

  // ---------------------------------------------------------------- Ralf
  async talkRalf() {
    const g = this.game, n = this.npcs.ralf;
    await this.talking(n, async () => {
      const st = this.step('ralf'), pt = this.step('party');
      if (this.carrying === 'ticket') {
        this.dropItem();
        n.ch.setEmotion('excited', 3);
        await n.say('MY TICKET! Let me see... seven... thirteen... twenty-one...', 'excited');
        n.ch.gesture('fistPump', { dur: 1.2 });
        audio.cheer?.();
        await n.say('WINNER! Only four numbers, but still! A hundred and sixty bucks! Half is yours, partner!', 'ecstatic');
        this.story.setStep('ralf', 3);
        return;
      }
      if (st < 0) {
        n.ch.gesture('wave', { dur: 1.2 });
        await n.say('Hey hey, the barber! Ralf. Kiosk. Papers, snacks, lottery, gossip. Mostly gossip.', 'happy');
        await n.say('Listen. I had a ticket. My lucky ticket. Seven, thirteen, twenty-one. Gone!', 'disappointed');
        await n.say('I was feeding the pigeons on Willi’s square this morning. Must have dropped it by the fountain.', 'concerned');
        const i = await g.ui.choices('Ralf', ['I’ll go and look for it.', 'Lottery is a scam, Ralf.']);
        await n.say(i === 0 ? 'You’re a good one! If it wins, we split. Ralf’s word!' : 'A scam?! It’s a SYSTEM, my friend. Find the ticket and I’ll prove it.', i === 0 ? 'happy' : 'annoyed');
        this.story.setStep('ralf', 1);
        return;
      }
      if (st === 3 && pt < 0 && this.done('dork') && this.done('willi')) {
        await n.say('You know what this street needs? A PARTY. On Willi’s square. Music, currywurst, everybody!', 'excited');
        await n.say('Tell Willi. And ask old Dörk for that gramophone of his. He’ll say no. Make him say yes.', 'smug');
        this.story.setStep('party', 0);
        return;
      }
      // scratch cards any time
      await n.say(pick(['Scratch card? Five bucks. Could be your lucky day!', 'Feeling lucky? Five dollars, one scratch.', 'Gossip’s free. Scratch cards are five.']), 'happy');
      const i = await g.ui.choices('Ralf', ['Buy a scratch card ($5)', 'Any gossip?', 'Bye, Ralf.']);
      if (i === 0) {
        if (g.save.money < 5) { await n.say('Five bucks, partner. You don’t have five bucks? Oof.', 'concerned'); return; }
        g.addMoney(-5);
        audio.paperFlick?.();
        await g.dir.wait(0.6).catch(() => {});
        const r = Math.random();
        const win = r < 0.03 ? 75 : r < 0.2 ? 15 : r < 0.32 ? 5 : 0;
        if (win) { g.addMoney(win); audio.coin?.(); g.ui.toast(`Scratch card: +$${win}`, 'Lucky'); await n.say(win >= 75 ? 'NO WAY! SEVENTY-FIVE! I’m telling everyone!' : win > 5 ? 'Fifteen! See? It’s a system!' : 'Your money back. Not bad, not good.', 'excited'); }
        else { g.ui.toast('Scratch card: nothing', 'Unlucky'); await n.say(pick(['Nothing. Next one’s a winner, I can feel it.', 'Ah. The system needs time.', 'Unlucky! Again?']), 'awkward'); }
        g.persist();
      } else if (i === 1) {
        await n.say(pick([
          'Kowalski from Fresh Mart? Owes me forty bucks since 2019.',
          'Bruno and Elli? Oh, everyone knows. Everyone except Bruno.',
          'Dörk once sold a chair to a museum. Then bought it back. Twice the price.',
          'Willi’s currywurst sauce is a secret recipe. It’s ketchup. Don’t tell him I said that.',
          'A blue van keeps cruising the street. Holgs and Bonnie. Don’t get in. Trust Ralf.',
          'Julian Krüger came by. Asked for a hundred. I gave him a scratch card. He won five.',
        ]), 'smug');
      }
    });
  }

  done(id) { return this.story.done(id); }

  pickTicket() {
    this.ticketMesh.visible = false;
    this.carrying = 'ticket';
    const t = ticket(); t.rotation.x = -0.3;
    this.holdItem(t);
    audio.paperFlick?.();
    this.story.setStep('ralf', 2);
  }

  // ---------------------------------------------------------------- Mr. Dörk
  async talkDork() {
    const g = this.game, n = this.npcs.dork;
    await this.talking(n, async () => {
      const st = this.step('dork'), pt = this.step('party');
      if (st < 0) {
        await n.say('Hmpf. You are the new barber. I have seen your customers walk past. Some of them twice, to hide.', 'smug');
        await n.say('Dörk. Mister Dörk. I have had the same haircut since nineteen sixty-eight. My barber died. Inconsiderate.', 'disappointed');
        await n.say('I do not let just anyone near my head. Prove yourself. Two excellent cuts. I will be... watching.', 'smug');
        const i = await g.ui.choices('Mr. Dörk', ['Challenge accepted, Mr. Dörk.', 'How will you even know?']);
        await n.say(i === 0 ? 'We shall see. Hmpf.' : 'I have binoculars, young man. Antique ones. Very good ones.', 'smug');
        this.s.dorkCuts = 0;
        this.story.setStep('dork', 1);
        return;
      }
      if (st === 1) { await n.say(`Hmpf. ${this.s.dorkCuts || 0} of two. I am still watching.`, 'smug'); return; }
      if (st === 2) {
        await n.say('Two excellent cuts. I saw them. Through the binoculars. Adequate.', 'neutral');
        await n.say('Very well. I shall visit your establishment. Do not make me regret it. I regret very easily.', 'smug');
        this.story.setStep('dork', 3);
        this.spawnT = 6;
        return;
      }
      if (st === 3) { await n.say('I am coming, I am coming. At my age, “coming” takes a while.', 'annoyed'); return; }
      if (pt === 1) {
        await n.say('My gramophone? For a STREET party? With... currywurst?', 'horrified');
        const i = await g.ui.choices('Mr. Dörk', ['You can play your own records.', 'Please, it would mean a lot to Ralf.']);
        if (i === 0) { await n.say('My own records? Swing. Real music. ...Hmpf. Fine. Fine! But nobody touches the needle.', 'proud'); }
        else { await n.say('Ralf owes me forty dollars since nineteen ninety-four. ...Oh, very well. For the street.', 'disappointed'); }
        this.story.setStep('party', 2);
        return;
      }
      await n.say(pick(['Hmpf. Good day.', 'Your last cut was... acceptable. Do not let it go to your head.', 'Everything in my shop is older than you. Including the dust.', 'Young people. Always walking. Where to? Hmpf.']), 'smug');
    });
  }

  spawnDork() {
    const g = this.game;
    const look = { ...randomCustomerLook(), ...DORK };
    look.hairColor = '#d8d4cc'; look.curl = 0.1; look.hairType = 'straight'; look.cap = null;
    look.voice = { pitch: 98, rate: 0.85, wobble: 0.16, vol: 0.1 };
    const c = g.customers.spawn({ name: 'Mr. Dörk', look, cutId: 'sidePart', noDye: true });
    c.questId = 'dork';
    this.dorkIn = true;
    this.npcs.dork.show(false);
    if (g.coop) g.netOut.push({ vis: ['dork', 0] });
    g.ui.toast('Mr. Dörk walked in. Side part, 1968 style.', 'Quest');
  }

  // ---------------------------------------------------------------- Willi
  async talkWilli() {
    const g = this.game, n = this.npcs.willi;
    await this.talking(n, async () => {
      const st = this.step('willi'), pt = this.step('party');
      if (this.carrying === 'sausages') {
        this.dropItem();
        n.ch.setEmotion('ecstatic', 3);
        n.ch.gesture('fistPump', { dur: 1.2 });
        await n.say('MY SAUSAGES! Mahlzeit! You saved the lunch rush, buddy!', 'ecstatic');
        await n.say('From now on: you eat here, you pay half. Willi’s word.', 'happy');
        this.story.setStep('willi', 3);
        return;
      }
      if (st < 0) {
        await n.say('Mahlzeit! Willi. Willi’s Imbiss. Best currywurst this side of the river. Only one this side of the river.', 'happy');
        await n.say('Problem though. No sausages. The delivery guy dropped my box at Fresh Mart. Kowalski won’t let me in. Long story.', 'disappointed');
        const i = await g.ui.choices('Willi', ['I’ll get your box from Fresh Mart.', 'What did you do to Kowalski?']);
        if (i === 1) await n.say('I told him his sausages taste like cardboard. Which is TRUE.', 'annoyed');
        await n.say('Dennis at the till has it. Bring it here and the first wurst is on me!', 'happy');
        this.story.setStep('willi', 1);
        return;
      }
      if (pt === 0) {
        await n.say('A party? On MY square? With Ralf? ...Who pays?', 'confused');
        await n.say('...I’ll grill. I always grill. Get Dörk’s gramophone and we’re in business!', 'excited');
        this.story.setStep('party', 1);
        return;
      }
      if (pt === 2) { await this.partyTime(); return; }
      // a currywurst any time
      const price = st >= 3 ? 2 : 4;
      const i = await g.ui.choices('Willi', [`Currywurst ($${price})`, 'How’s business?', 'See you, Willi.']);
      if (i === 0) {
        if (g.save.money < price) { await n.say('No money? Here, a pommes. On the house. Don’t tell Ralf.', 'happy'); return; }
        g.addMoney(-price);
        audio.coin?.();
        await n.say(pick(['One currywurst, extra sauce. Mahlzeit!', 'Here you go. Careful, hot!', 'Best in town. Also only one in town.']), 'happy');
        g.addXP(5);
        g.ui.toast('Currywurst! Delicious. +5 XP', 'Willi');
      } else if (i === 1) {
        await n.say(pick(['Busy busy! The gym guys eat three each. “Protein,” they say.', 'Slow. Everyone’s at your barbershop, getting fades.', 'Mr. Dörk eats here every Tuesday. Never says anything. Just “Hmpf”.']), 'neutral');
      }
    });
  }

  async pickSausages() {
    const g = this.game;
    const dennis = g.mart?.jess;
    this.carrying = 'sausages';
    this.holdItem(makeBox(0.42));
    audio.cloth?.(0.6, 0.2);
    this.story.setStep('willi', 2);
    if (dennis?.say) await dennis.say('Oh, Willi’s sausages? Take them. Please. They smell weird.', 'neutral');
    else g.showLine('Dennis', 'Oh, Willi’s sausages? Take them. Please. They smell weird.', 2.4);
  }

  // ---------------------------------------------------------------- the party
  async partyTime() {
    const g = this.game, { willi, ralf, dork } = this.npcs;
    await willi.say('Party? Right now? Give me a minute to fire up the grill!', 'excited');
    // that evening: bunting up, everybody on the square
    await g.ui.fade(true, 600);
    this.s.flagsParty = true;
    this.bunting.visible = true;
    this.partying = true;
    ralf.ch.place(V(-60.6, 0, FZ + 1.5), -2.4);
    dork.ch.standUp?.();
    dork.ch.place(V(-63.8, 0, FZ + 1.7), 2.2);
    dork.ch.sitW = dork.ch.sitTarget = 0; dork.ch.seat = null;
    g.ui.banner('That evening…', 'Street Party', 'Willi’s square', 1600);
    await g.dir.wait(1.2).catch(() => {});
    await g.ui.fade(false, 700);
    await willi.say('THERE they are! Ralf, Mister Dörk — currywurst for everyone!', 'ecstatic');
    audio.cheer?.();
    g.burstSparkles?.(V(-62, 2.4, FZ));
    await ralf.say('To the barber! Best thing that happened to this street since the lottery!', 'excited');
    await dork.say('Hmpf. ...The music is adequate. I may even tap my foot.', 'proud');
    dork.ch.gesture('dance', { dur: 3 });
    ralf.ch.gesture('dance', { dur: 3 });
    await willi.say('Mahlzeit, everybody!', 'ecstatic');
    this.story.setStep('party', 3);
    // they go home once you've wandered off (see update)
  }

  // ---------------------------------------------------------------- events from the game
  on(type, data) {
    if (type !== 'cut') return;
    const { c, result } = data;
    if (this.step('dork') === 1 && result.stars >= 4 && !c.questId) {
      this.s.dorkCuts = (this.s.dorkCuts || 0) + 1;
      if (this.s.dorkCuts >= 2) this.story.setStep('dork', 2);
      else this.game.ui.toast('Mr. Dörk saw that. 1 of 2.', 'Quest');
    }
    if (c.questId === 'dork') {
      this.dorkIn = false;
      if (this.game.coop) this.game.netOut.push({ vis: ['dork', 1] });
      this.npcs.dork.show(true);
      if (result.stars >= 4) this.story.setStep('dork', 4);
      else setTimeout(() => this.game.ui.toast('Mr. Dörk: “Hmpf. Inadequate.” He’ll give you one more chance tomorrow.', 'Quest'), 2500);
    }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game;
    const live = g.save.tutorialDone;
    const { ralf, dork, willi } = this.npcs;
    ralf.show(live);
    willi.show(live);
    dork.show(live && !this.dorkIn && !this.story.side?.remoteHidden?.dork);
    for (const n of [ralf, dork, willi]) n.update(dt);
    const rs = this.step('ralf'), ds = this.step('dork'), ws = this.step('willi'), ps = this.step('party');
    ralf.mark = rs < 0 || (rs >= 3 && ps < 0 && this.done('dork') && this.done('willi')) ? '!' : this.carrying === 'ticket' ? '?' : null;
    dork.mark = ds < 0 || ds === 2 || ps === 1 ? '!' : null;
    willi.mark = ws < 0 || ps === 0 || ps === 2 ? '!' : this.carrying === 'sausages' ? '?' : null;
    // the ticket, glinting by the fountain
    this.ticketMesh.visible = live && rs === 1 && this.carrying !== 'ticket';
    this.ticketMark.visible = this.ticketMesh.visible && this.ticketMesh.position.distanceTo(g.player.pos) < 25;
    if (this.ticketMark.visible) this.ticketMark.position.set(this.ticketMesh.position.x, 0.6 + Math.sin(performance.now() / 300) * 0.05, this.ticketMesh.position.z);
    if (rs === 2 && this.carrying !== 'ticket' && !this.handsFull() && !g.coop) this.story.s.q.ralf = 1;   // lost it again (reload)
    if (ws === 2 && this.carrying !== 'sausages' && !this.handsFull() && !g.coop) this.story.s.q.willi = 1;
    // Dörk walks in (host only online)
    if (ds === 3 && !this.dorkIn && g.isHost && g.clock?.open) {
      this.spawnT = (this.spawnT ?? 8) - dt;
      if (this.spawnT <= 0 && g.customers.list.length < 4) { this.spawnT = 40; this.spawnDork(); }
    }
    if (this.dorkIn && !g.customers.list.some((c) => c.questId === 'dork')) { this.dorkIn = false; this.spawnT = 40; if (g.coop) g.netOut.push({ vis: ['dork', 1] }); }
    this.bunting.visible = !!this.s.flagsParty;
    // after the party, everyone's back at their spot once you're out of sight
    if (this.partying && ralf.dist() > 40 && dork.dist() > 40) {
      this.partying = false;
      ralf.ch.place(ralf.home, 0.3);
      dork.ch.place(dork.home, 0);
      dork.ch.sitOn({ pos: dork.home, rot: 0, height: 0.46 }, true);
    }
  }
}

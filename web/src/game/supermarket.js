// FRESH MART's manager stands outside the supermarket across the road with a gold "!" over
// his head. Talk to him and he offers you a job stacking shelves. You can't take it — the
// only answers are "Hell no." and "F*** you." He takes both about as well as you'd expect.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { ROOM, SUPER } from '../world/shop.js';
import { audio } from '../audio/audio.js';
import { pick, rand, clamp } from '../core/util.js';
import { makeBox, makePallet } from '../world/storyassets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MANAGER = {
  name: 'Mr. Kowalski',
  colors: {
    Skin: '#e2b591', Top: '#2f8a4a', Sleeve: '#2f8a4a', Pants: '#2b2f38', Shoes: '#1a1410', Hair: '#6b5b4a', Iris: '#4a6a8a',
    EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15',
    Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Apron: '#2f8a4a', Shirt: '#2f8a4a', Tie: '#c8302b', Lapel: '#2f8a4a', TopDark: '#226a38',
  },
  accessories: ['tee', 'glasses', 'belly', 'watch'],
  scale: 1.0, hunch: 0.08, width: 1.08,
  voice: { pitch: 112, rate: 1.08, wobble: 0.1, vol: 0.1 },
};

function markerSprite() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#f2cf7c'; x.strokeStyle = '#3a2410'; x.lineWidth = 6; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(20, 6); x.lineTo(44, 6); x.lineTo(38, 62); x.lineTo(26, 62); x.closePath(); x.stroke(); x.fill();
  x.beginPath(); x.arc(32, 80, 10, 0, Math.PI * 2); x.stroke(); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }));
  s.renderOrder = 30;
  s.scale.set(0.18, 0.27, 1);
  return s;
}

export class Supermarket {
  constructor(game) {
    this.game = game;
    const fz = ROOM.z1 + 0.24;
    this.home = V(SUPER.door + 1.9, 0, fz + 12.3);
    const ch = this.ch = new Character(game.scene, MANAGER);
    const hair = new HairSystem({ color: '#6b5b4a', skin: MANAGER.colors.Skin, layers: 8 });
    hair.attach(ch.bones.Head);
    hair.setStyle({ top: 0.02, front: 0.04, left: 0.14, right: 0.14, back: 0.16, fuzz: 0, bald: 0.85 }, 0.2);
    ch.hair = hair;
    ch.place(this.home, Math.PI);
    this.marker = markerSprite();
    game.scene.add(this.marker);
    this.idleT = 3;
    this.busy = false;
  }

  // done = nothing more to offer (story: the job has been done and the register robbed)
  // the job is always on offer until you've worked the shift (and robbed the register)
  get done() { return this.game.save.flags?.superJob === 'robbed' || !!this.game.story?.done('martJob'); }

  // online the shift is twice as long: the whole team carries 16 boxes together
  get need() { return this.game.coop ? 16 : 8; }

  dist() { return this.ch.root.position.distanceTo(this.game.player.pos); }

  label() {
    if (this.busy || this.game.state !== 'play' || this.dist() > 2.6 || this.job?.boxes < this.need) return null;
    return this.done ? 'Talk to the manager' : 'Talk to the manager (!)';
  }

  pos() { return this.ch.root.position.clone().setY(1.5); }

  update(dt) {
    const g = this.game, ch = this.ch;
    const d = this.dist();
    // far away and out of sight: just keep the pose
    if (d < 30) ch.update(dt); else ch.updateLocomotion?.(dt);
    this.marker.visible = !this.done && !this.busy && !(this.job && this.job.boxes < this.need);
    if (this.marker.visible) {
      const h = ch.headWorld(V(0, 0, 0));
      this.marker.position.set(h.x, h.y + 0.42 + Math.sin(performance.now() / 300) * 0.04, h.z);
    }
    if (this.busy) return;
    if (this.job && this.job.boxes < this.need) {
      this.job.insultT -= dt;
      ch.lookAt(g.camera, 0.9);
      if (this.job.insultT < 0) { this.job.insultT = rand(7, 11); if (d < 16) this.insult(); }
      return;
    }
    // waves you over when you come close
    if (d < 7) ch.lookAt(g.camera, 0.8); else ch.lookAt(null);
    this.idleT -= dt;
    if (this.idleT < 0) {
      this.idleT = 6 + Math.random() * 6;
      if (d < 9 && !this.done) {
        ch.gesture('wave');
        const line = pick(['Hey! You! Yes, you!', 'Looking for a real job?', 'Psst! Great opportunity here!', 'We’re hiring! Come over!']);
        ch.say(line);
        g.showLine('Mr. Kowalski', line, 2.4, true);
      } else if (Math.random() < 0.5) ch.gesture('lookAround', { dur: 2.2 });
    }
  }

  // ---------------------------------------------------------------- the shift
  startJob(fromTeam = false) {
    const g = this.game;
    if (this.job) return;
    const fz = ROOM.z1 + 0.24;
    if (!fromTeam) g.story?.setStep('martJob', 1);
    const pal = makePallet();
    pal.position.set(SUPER.x0 + 2.0, 0, fz + 12.1);
    g.scene.add(pal);
    const boxes = [];
    for (let i = 0; i < this.need; i++) {
      const b = makeBox();
      b.position.set(-0.25 + (i % 2) * 0.5, 0.31 + Math.floor(i / 4) * 0.33, -0.2 + (Math.floor(i / 2) % 2) * 0.4);
      b.rotation.y = (Math.random() - 0.5) * 0.2;
      pal.add(b); boxes.push(b);
    }
    void boxes;
    this.job = { pal, boxes: 0, carrying: null, insultT: 6 };
    g.shop.colliders.push(this.palCol = { x0: pal.position.x - 0.65, x1: pal.position.x + 0.65, z0: pal.position.z - 0.55, z1: pal.position.z + 0.55, outside: true });
    g.ui.toast(`Carry ${this.need} boxes from the pallet into Fresh Mart${g.coop ? ' (together with your team)' : ''}`, 'Job');
  }

  jobLabel() {
    const j = this.job, g = this.game;
    if (!j || j.boxes >= this.need || g.state !== 'play' || !g.player.control) return null;
    const P = g.player.pos;
    if (!j.carrying && j.pal.position.distanceTo(P) < 2.0) return 'Pick up a box';
    if (j.carrying && this.doorPos().distanceTo(P) < 2.2) return 'Carry the box inside';
    return null;
  }

  doorPos() { return V(SUPER.door, 0, ROOM.z1 + 0.24 + 13.5); }

  jobAction() {
    const j = this.job, g = this.game;
    const R = g.player.arms.R, L = g.player.arms.L;
    if (!j.carrying) {
      const top = j.pal.children.filter((c) => c.isMesh && c.position.y > 0.2).pop();
      if (!top) return;
      top.parent.remove(top);
      j.carrying = top;
      R.set({ visible: true, pos: V(0.17, -0.3, -0.45), fingers: V(0, 0, -1), palm: V(-1, 0, 0), pose: 'grip', speed: 9 });
      L.set({ visible: true, pos: V(-0.17, -0.3, -0.45), fingers: V(0, 0, -1), palm: V(1, 0, 0), pose: 'grip', speed: 9 });
      R.hold(top, { pos: [-0.17, -0.05, -0.02], rot: [0, 0, 0], scale: 1 });
      audio.cloth?.(0.7, 0.25);
    } else {
      R.drop(); R.set({ visible: false }); L.set({ visible: false });
      j.carrying = null;
      j.boxes++;
      if (g.coop) g.netOut.push({ jb: j.boxes });
      audio.chairThump?.();
      g.story?.refresh();
      if (j.boxes < this.need) this.insult(true);
      else {
        this.ch.setEmotion('neutral', 2);
        const line = 'Done? Hmph. Come talk to me. Let’s discuss your... “pay”.';
        this.ch.say(line); g.showLine('Mr. Kowalski', line, 3, true);
        g.story?.setStep('martJob', 2);
        if (this.palCol) { const i = g.shop.colliders.indexOf(this.palCol); if (i >= 0) g.shop.colliders.splice(i, 1); }
        j.pal.parent?.remove(j.pal);
      }
    }
  }

  // a teammate carried a box: the shared count goes up, a box disappears from my pallet
  teamBoxes(n) {
    const g = this.game;
    if (!this.job) { if (g.story?.step('martJob') === 1) this.startJob(true); else return; }
    const j = this.job;
    while (j.boxes < Math.min(n, this.need)) {
      j.boxes++;
      const top = j.pal.children.filter((c) => c.isMesh && c.position.y > 0.2).pop();
      top?.parent?.remove(top);
    }
    g.story?.refresh();
    if (j.boxes >= this.need && j.pal.parent) {
      if (this.palCol) { const i = g.shop.colliders.indexOf(this.palCol); if (i >= 0) g.shop.colliders.splice(i, 1); }
      j.pal.parent.remove(j.pal);
    }
  }

  // the shift is over for the whole team (someone already robbed the till)
  endJob() {
    const g = this.game, j = this.job;
    if (!j) return;
    if (j.carrying) { g.player.arms.R.drop(); g.player.arms.R.set({ visible: false }); g.player.arms.L.set({ visible: false }); }
    if (this.palCol) { const i = g.shop.colliders.indexOf(this.palCol); if (i >= 0) g.shop.colliders.splice(i, 1); }
    j.pal.parent?.remove(j.pal);
    this.job = null;
  }

  insult(now = false) {
    const g = this.game;
    const lines = ['Faster! My grandma carries more than that!', 'Is that a box or a pillow? Lift with your back!', 'Ten seconds per box. I’m timing you.',
      'Don’t look at me. Look at the boxes.', 'You call that a haircut? You call that WORK?', 'Smile! Customers are watching! No — not like that.',
      'If you break the eggs, you ARE the eggs.', 'Break time is at 9 pm. Tomorrow.'];
    const line = pick(lines);
    this.ch.setEmotion('annoyed', 3);
    if (now || Math.random() < 0.5) this.ch.gesture('pointAccuse', { target: () => g.player.pos.clone().setY(1.5) });
    this.ch.say(line); g.showLine('Mr. Kowalski', line, 2.6, true);
  }

  // end of the shift: the "pay" is an insult, so the register gets emptied
  async payday(say) {
    const g = this.game, ch = this.ch, dir = g.dir;
    await g.ui.fade?.(true, 500);
    if (g.clock?.open) g.clock.hour = Math.min(20.4, g.clock.hour + 3);
    await g.ui.fade?.(false, 600);
    await g.ui.banner?.('Fresh Mart', 'A few hours later…', 'Your back hurts. Mr. Kowalski counts the money.', 1800);
    ch.setEmotion('happy', 3);
    await say('Not bad, not bad. Here’s your pay:', 'happy');
    ch.gesture('presentL', { dur: 1.6 });
    await say('One Fresh Mart name badge! And a coupon. Five percent off bananas.', 'happy');
    await say('Oh, and I’m keeping twenty bucks for the gloves you used. Bye now.', 'annoyed');
    const i = await g.ui.choices('Fresh Mart · Payday', ['Rob the register.', 'Rob the register. Obviously.']);
    g.showLine('You', i ? 'Rob the register. Obviously.' : '...', 1.2);
    // the heist: one slap of the till, both hands full of cash, a scream
    const R = g.player.arms.R, L = g.player.arms.L;
    R.set({ visible: true, pos: V(0.15, -0.15, -0.5), pose: 'open', fingers: V(0, 0, -1), palm: V(0, -1, 0), speed: 25 });
    L.set({ visible: true, pos: V(-0.15, -0.15, -0.5), pose: 'open', fingers: V(0, 0, -1), palm: V(0, -1, 0), speed: 25 });
    audio.register?.();
    await dir.wait(0.35).catch(() => {});
    R.set({ pos: V(0.22, -0.32, -0.3), pose: 'fist' }); L.set({ pos: V(-0.22, -0.32, -0.3), pose: 'fist' });
    for (let k = 0; k < 6; k++) setTimeout(() => audio.coin?.(), k * 70);
    ch.setEmotion('horrified', 2);
    g.exclaim.show(ch, 1.6, '!');
    await say('HEY! HEY!! THAT’S MY REGISTER!', 'horrified', 0.1);
    ch.flush?.('#d8402c', 0.6, 4);
    ch.gesture('rage', { dur: 1.6 });
    g.exclaim.show(ch, 2.5, 'anger');
    await say('SECURITY! ...We don’t have security. I’M CALLING MY MOTHER!', 'furious');
    R.set({ visible: false }); L.set({ visible: false });
    g.save.flags.superJob = 'robbed';
    g.save.stats.robberies = (g.save.stats.robberies || 0) + 1;
    g.addMoney(100);
    g.addXP(120);
    g.ui.toast('Robbed Fresh Mart: +$100 · +120 XP', 'Heist');
    this.job = null;
    g.story?.setStep('martJob', 3);
    g.persist();
  }

  async talk() {
    const g = this.game, ch = this.ch, dir = g.dir;
    if (this.busy) return;
    this.busy = true;
    g.player.control = false;
    ch.lookAt(g.camera, 1);
    await ch.faceTo(g.player.pos).catch?.(() => {});
    const say = async (text, emo, extra = 0.4) => {
      const d = ch.say(text);
      if (emo) ch.setEmotion(emo, d + 1);
      g.showLine('Mr. Kowalski', text, d + 0.8);
      await dir.wait(d + extra).catch(() => {});
    };
    try {
      const story = g.story;
      if (this.job && this.job.boxes >= this.need) { await this.payday(say); return; }
      if (g.save.flags?.superJob === 'robbed' || g.story?.done('martJob')) {
        ch.setEmotion('furious', 3); g.exclaim.show(ch, 1.4, 'anger');
        await say(pick(['YOU! Thief! I’ve got my eye on you!', 'Security still has your picture on the wall.', 'Get away from my supermarket, you robber!']), 'furious');
        return;
      }
      ch.gesture('wave');
      const prev = g.save.flags?.superJob;
      if (prev === 'fu') { ch.setEmotion('annoyed', 2); await say('You again. After what you said? ...Fine. I’m desperate. Nobody wants this job.', 'annoyed'); }
      else if (prev) await say('Oh. You again. Changed your mind? Look, I’m desperate. Nobody wants this job.', 'disappointed');
      else await say('Ah, finally! A young, motivated face!', 'happy');
      ch.gesture('pointAccuse', { target: () => this.home.clone().add(V(0, 1.6, 2)) });
      await say('Fresh Mart is looking for a shelf stacker. Night shifts, weekends, holidays.', 'happy');
      await say('Minimum wage, but you get a free name badge. Whaddaya say?', 'happy', 0.2);
      const opts = ['Hell no.', 'F*** you.', 'Aight, bet.'];
      const pickN = await g.ui.choices('Fresh Mart · Job offer', opts);
      g.save.flags ||= {};
      if (pickN === 2) {
        g.showLine('You', 'Aight, bet.', 1.4);
        await dir.wait(1.0).catch(() => {});
        ch.setEmotion('surprised', 1.2);
        await say('...Really? REALLY? Okay! Great! Wonderful!', 'happy');
        ch.setEmotion('annoyed', 4);
        await say('The truck dumped eight boxes on the pavement. Carry them inside. Chop chop!', 'annoyed');
        await say('And don’t drop anything. It comes out of your pay.', 'annoyed');
        this.startJob();
        return;
      }
      if (pickN === 0) {
        g.showLine('You', 'Hell no.', 1.6);
        await dir.wait(1.0).catch(() => {});
        ch.setEmotion('devastated', 3);
        ch.gesture('sigh');
        await say('Wow. Okay. The badge was really nice, though.', 'disappointed');
        g.save.flags.superJob = 'no';
      } else {
        g.showLine('You', 'F*** you.', 1.6);
        await dir.wait(0.9).catch(() => {});
        audio.tone(220, 0.3, { type: 'square', vol: 0.05, slide: 0.5 });
        ch.setEmotion('horrified', 1.2);
        g.exclaim.show(ch, 1.4, '!');
        await dir.wait(1.0).catch(() => {});
        ch.flush?.('#d8402c', 0.5, 4);
        g.exclaim.show(ch, 3, 'anger');
        ch.gesture('rage', { dur: 1.4 });
        await say('EXCUSE ME?! In front of MY supermarket?!', 'furious');
        await say('I’m telling your mother! ...SECURITY!', 'furious');
        g.save.flags.superJob = 'fu';
      }
      g.save.stats.jobsRefused = (g.save.stats.jobsRefused || 0) + 1;
      g.ui.toast('Job offer declined', 'Fresh Mart');
      g.persist();
      g.checkAchievements();
    } finally {
      ch.lookAt(null);
      this.busy = false;
      if (g.state === 'play') { g.player.control = true; g.enterFP(); }
    }
  }
}

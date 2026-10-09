// FRESH MART's manager stands outside the supermarket across the road with a gold "!" over
// his head. Talk to him and he offers you a job stacking shelves. You can't take it — the
// only answers are "Hell no." and "F*** you." He takes both about as well as you'd expect.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { ROOM, SUPER } from '../world/shop.js';
import { audio } from '../audio/audio.js';
import { pick } from '../core/util.js';

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

  get done() { return !!this.game.save.flags?.superJob; }

  dist() { return this.ch.root.position.distanceTo(this.game.player.pos); }

  label() {
    if (this.busy || this.game.state !== 'play' || this.dist() > 2.6) return null;
    return this.done ? 'Talk to the manager' : 'Talk to the manager (!)';
  }

  pos() { return this.ch.root.position.clone().setY(1.5); }

  update(dt) {
    const g = this.game, ch = this.ch;
    const d = this.dist();
    // far away and out of sight: just keep the pose
    if (d < 30) ch.update(dt); else ch.updateLocomotion?.(dt);
    this.marker.visible = !this.done && !this.busy;
    if (this.marker.visible) {
      const h = ch.headWorld(V(0, 0, 0));
      this.marker.position.set(h.x, h.y + 0.42 + Math.sin(performance.now() / 300) * 0.04, h.z);
    }
    if (this.busy) return;
    // waves you over when you come close
    if (d < 7) ch.lookAt(g.camera, 0.8); else ch.lookAt(null);
    this.idleT -= dt;
    if (this.idleT < 0) {
      this.idleT = 6 + Math.random() * 6;
      if (d < 9 && !this.done) {
        ch.gesture('wave');
        const line = pick(['Hey! You! Yes, you!', 'Looking for a real job?', 'Psst! Great opportunity here!', 'We’re hiring! Come over!']);
        ch.say(line);
        g.showLine('Mr. Kowalski', line, 2.4);
      } else if (Math.random() < 0.5) ch.gesture('lookAround', { dur: 2.2 });
    }
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
      if (this.done) {
        ch.setEmotion(g.save.flags.superJob === 'fu' ? 'annoyed' : 'neutral', 2);
        await say(g.save.flags.superJob === 'fu' ? 'You again. Keep walking, scissor boy.' : 'Changed your mind? No? Didn’t think so.', null);
        return;
      }
      ch.gesture('wave');
      await say('Ah, finally! A young, motivated face!', 'happy');
      ch.gesture('pointAccuse', { target: () => this.home.clone().add(V(0, 1.6, 2)) });
      await say('Fresh Mart is looking for a shelf stacker. Night shifts, weekends, holidays.', 'happy');
      await say('Minimum wage, but you get a free name badge. Whaddaya say?', 'happy', 0.2);
      const pickN = await g.ui.choices('Fresh Mart · Job offer', ['Hell no.', 'F*** you.']);
      g.save.flags ||= {};
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

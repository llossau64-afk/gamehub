// Shopping at Fresh Mart: walk in, take drinks out of the fridges at the back (they go into a
// red basket on your arm), then pay at the till where Jess scans them one by one. Walk out
// with unpaid stuff and the security gate shrieks.
import * as THREE from 'three';
import { MART } from '../world/martinterior.js';
import { DRINKS, makeDrink } from '../world/storyassets.js';
import { StreetNPC } from './story.js';
import { audio } from '../audio/audio.js';
import { pick, rand, formatMoney } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const base = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#3a332c', TopDark: '#226a38' };
const JESS = { colors: { ...base, Skin: '#c98f6b', Top: '#2f8a4a', Sleeve: '#2f8a4a', Pants: '#2b2f38', Shoes: '#e8e2d6', Hair: '#2a1a12', Iris: '#4a3a2a', Apron: '#2f8a4a' },
  accessories: ['tee', 'apron', 'glasses'], scale: 0.95, width: 0.94, hunch: 0.05 };

export class Mart {
  constructor(game) {
    this.game = game;
    this.basket = {};
    this.inside = false;
    this.busy = false;
    const ck = MART.counter;
    const n = this.jess = new StreetNPC(game, { name: 'Jess', look: JESS, voice: { pitch: 205, rate: 1.08, wobble: 0.1, vol: 0.1 },
      hair: { color: '#2a1a12', style: { top: 0.5, front: 0.42, left: 0.48, right: 0.48, back: 0.62, fuzz: 0.04 }, cut: 0.4 } });
    this.home = V(ck.x + 0.75, 0, (ck.z0 + ck.z1) / 2 - 0.2);
    n.ch.place(this.home, -Math.PI / 2);
    this.idleT = 4;
    // the red basket you carry while shopping
    const b = this.basketObj = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#c8302b', roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), red); body.position.y = -0.1; b.add(body);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.5 }));
    handle.rotation.y = Math.PI / 2; b.add(handle);
    this.basketItems = new THREE.Group(); this.basketItems.position.y = -0.04; b.add(this.basketItems);
  }

  get count() { return Object.values(this.basket).reduce((a, b) => a + b, 0); }
  get total() { return Object.entries(this.basket).reduce((t, [id, n]) => t + DRINKS[id].price * n, 0); }

  nearestFridge() {
    const P = this.game.player.pos;
    let best = null, bd = 1.9;
    for (const f of MART.fridges) { const d = Math.hypot(f.pos.x - P.x, f.pos.z - P.z); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  interactables(I) {
    const g = this.game;
    const play = () => g.state === 'play' && g.player.control && !this.busy;
    I({ id: 'martFridge', label: () => {
      if (!play() || !this.inside) return null;
      const f = this.nearestFridge(); if (!f) return null;
      const d = DRINKS[f.id];
      return `Take a ${d.name} · ${formatMoney(d.price)}${this.basket[f.id] ? ` (${this.basket[f.id]} in basket)` : ''}`;
    }, pos: () => this.nearestFridge().pos, radius: 3, action: () => { this.take(this.nearestFridge().id); return 'martFridge'; } });
    I({ id: 'jess', label: () => (play() && this.jess.dist() < 2.8 ? (this.count ? `Pay at the till · ${formatMoney(this.total)}` : 'Talk to Jess') : null),
      pos: () => this.jess.head(), radius: 3.4, action: () => { this.talk().catch((e) => console.error(e)); return 'jess'; } });
  }

  take(id) {
    if (this.count >= 12) { this.game.ui.toast('Your basket is full', 'Fresh Mart'); return; }
    this.basket[id] = (this.basket[id] || 0) + 1;
    audio.cloth?.(0.5, 0.15);
    audio.tone?.(900, 0.05, { vol: 0.03 });
    this.showBasket();
    // a can lands in the basket
    const k = this.count - 1;
    const dr = makeDrink(id);
    dr.scale.setScalar(0.7);
    dr.position.set(-0.11 + (k % 4) * 0.07, 0, -0.06 + Math.floor(k / 4) % 3 * 0.06);
    dr.traverse((o) => { if (o.isMesh) { o.renderOrder = 11; o.castShadow = false; } });
    this.basketItems.add(dr);
  }

  showBasket() {
    const L = this.game.player.arms.L;
    if (this.count) {
      L.set({ visible: true, pos: V(-0.26, -0.44, -0.5), fingers: V(0, 0, -1), palm: V(1, 0, 0), pose: 'grip', speed: 8 });
      if (L.held !== this.basketObj) L.hold(this.basketObj, { pos: [0.0, -0.04, 0.0], rot: [0, 0, 0], scale: 0.72 });
    } else {
      if (L.held === this.basketObj) L.drop();
      L.set({ visible: false });
    }
  }

  emptyBasket() {
    this.basket = {};
    this.basketItems.clear();
    this.showBasket();
  }

  async talk() {
    const g = this.game, j = this.jess, dir = g.dir;
    if (this.busy) return;
    this.busy = true; j.busy = true;
    g.player.control = false;
    j.ch.lookAt(g.camera, 1);
    try {
      const robbed = g.save.flags?.superJob === 'robbed';
      if (!this.count) {
        await j.say(pick(robbed
          ? ['Mr. Kowalski put your photo next to the register. It’s a good photo, actually.', 'You’re the guy who robbed my boss? ...Honestly? Respect.']
          : ['Hi! Drinks are in the fridges at the back.', 'Welcome to Fresh Mart! Don’t mind the manager.', 'Need anything? The cola is on special. It’s always on special.', 'You’re the barber from across the street, right? Love the pole.']), 'happy');
        return;
      }
      await j.say(pick(['Hi! Find everything okay?', 'Hey there! Just these?', 'Welcome! Let me scan those for you.']), 'happy');
      // scan, item by item, with the beep
      const items = Object.entries(this.basket).flatMap(([id, n]) => Array(n).fill(id));
      j.ch.reach('R', () => V(MART.counter.x + 0.05, 1.0, MART.counter.z0 + 0.45), { speed: 12, hand: 'grip' });
      for (const id of items) {
        audio.tone?.(1840, 0.07, { type: 'square', vol: 0.05 });
        g.showLine('Jess', `${DRINKS[id].name} · ${formatMoney(DRINKS[id].price)}`, 0.6);
        await dir.wait(0.32).catch(() => {});
      }
      j.ch.release('R');
      const total = this.total + (robbed ? 1 : 0);
      await j.say(`That’s ${formatMoney(total)}${robbed ? ' — plus one dollar “robbery tax”. Boss’s orders.' : '.'}`, 'happy', 0.2);
      const opts = [`Pay ${formatMoney(total)}`, 'Put it all back'];
      const i = await g.ui.choices('Fresh Mart · Checkout', opts);
      if (i === 1) {
        await j.say('No problem, I’ll put them back. Have a nice day!', 'neutral');
        this.emptyBasket();
        return;
      }
      if (g.save.money < total) {
        audio.error?.();
        await j.say('Hmm... card declined. Sorry! Maybe put something back?', 'disappointed');
        return;
      }
      g.addMoney(-total);
      audio.register?.();
      const inv = g.story.s.inv;
      for (const [id, n] of Object.entries(this.basket)) inv[id] = (inv[id] || 0) + n;
      g.save.stats.martVisits = (g.save.stats.martVisits || 0) + 1;
      this.emptyBasket();
      g.story.on('bought');
      g.story.refresh();
      g.persist();
      g.ui.toast(`Paid ${formatMoney(total)} · drinks are in your bag (give them with F)`, 'Fresh Mart');
      j.ch.gesture('wave', { dur: 1.2 });
      await j.say(pick(['Thanks! Come again!', 'Have a great day!', 'Enjoy! And tell your customers we said hi.']), 'happy');
    } finally {
      this.busy = false; j.busy = false;
      j.ch.lookAt(null);
      if (g.state === 'play') { g.player.control = true; g.enterFP(); }
    }
  }

  // walking out with unpaid things: the gate goes off, Jess calls you back, it all goes back
  alarm() {
    const g = this.game, j = this.jess;
    for (let k = 0; k < 6; k++) setTimeout(() => audio.tone?.(k % 2 ? 960 : 1240, 0.18, { type: 'square', vol: 0.06 }), k * 190);
    j.ch.setEmotion('surprised', 2.5);
    g.exclaim.show(j.ch, 1.6, '!');
    const line = pick(['Hey! You have to pay for those first!', 'Sir! SIR! The basket!', 'Nice try. Basket. Now.']);
    j.ch.say(line); g.showLine('Jess', line, 2.6);
    g.save.stats.shoplift = (g.save.stats.shoplift || 0) + 1;
    this.emptyBasket();
    g.ui.toast('The alarm went off. You put everything back.', 'Fresh Mart');
  }

  update(dt) {
    const g = this.game;
    if (g.state === 'menu' || g.state === 'intro') return;
    const P = g.player.pos;
    const inside = P.x > MART.x0 && P.x < MART.x1 && P.z > MART.z0 + 0.25 && P.z < MART.z1;
    if (this.inside && !inside && this.count && P.z < MART.z0 + 0.25) this.alarm();
    if (inside !== this.inside) {
      this.inside = inside;
      if (inside && !this.greeted) { this.greeted = true; const l = pick(['Welcome to Fresh Mart!', 'Hi! Let me know if you need anything!']); this.jess.ch.say(l); g.showLine('Jess', l, 2); }
      if (!inside) this.greeted = false;
      g.ambience?.setOutside?.(inside ? 0.35 : 1);
    }
    // Jess only needs animating when you're near
    if (this.jess.dist() < 25) this.jess.update(dt); else this.jess.marker.visible = false;
    if (!this.busy && inside) {
      this.idleT -= dt;
      if (this.idleT < 0) { this.idleT = rand(5, 10); this.jess.ch.gesture(pick(['lookAround', 'nod', 'checkHair']), { dur: 2.2 }); }
    }
  }
}

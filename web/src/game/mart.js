// Shopping at Fresh Mart: walk in, take drinks out of the fridges at the back (they go into a
// red basket on your arm), then pay at the till where Jess scans them one by one. Walk out
// with unpaid stuff and the security gate shrieks.
import * as THREE from 'three';
import { MART } from '../world/martinterior.js';
import { ROOM } from '../world/shop.js';
import { DRINKS, makeDrink } from '../world/storyassets.js';
import { StreetNPC, followRemote, gaitIndex, gaitName } from './story.js';
import { audio } from '../audio/audio.js';
import { pick, rand, formatMoney } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const base = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#3a332c', TopDark: '#226a38' };
const JESS = { colors: { ...base, Skin: '#e0ac86', Top: '#2f8a4a', Sleeve: '#2f8a4a', Pants: '#2b2f38', Shoes: '#1b1b1d', Hair: '#5a3a22', Iris: '#4a6a7a', Apron: '#2f8a4a' },
  accessories: ['tee', 'apron'], scale: 1.02, width: 1.05, hunch: 0.05 };

export class Mart {
  constructor(game) {
    this.game = game;
    this.basket = {};
    this.inside = false;
    this.busy = false;
    const ck = MART.counter;
    const n = this.jess = new StreetNPC(game, { name: 'Dennis', look: JESS, voice: { pitch: 128, rate: 1.05, wobble: 0.1, vol: 0.1 },
      hair: { color: '#5a3a22', style: { top: 0.32, front: 0.3, left: 0.12, right: 0.12, back: 0.14, fuzz: 0.02 }, cut: 0.35 } });
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
    // online: whoever is being chased drives Dennis; the rest of the team sees the chase
    game.netActors.set('dennis', {
      owned: () => !!this.chase,
      get: () => { const c = this.jess.ch; return [+c.root.position.x.toFixed(2), +c.root.position.z.toFixed(2), +c.yaw.toFixed(2), gaitIndex(c.gait)]; },
      remote: (v) => { if (!this.chase) { this.remoteChase = { x: v[0], z: v[1], yaw: v[2], gait: gaitName(v[3]) }; this.jess.busy = true; } },
      release: () => { if (this.remoteChase) { this.remoteChase = null; this.walkHome(); } },
    });
  }

  walkHome() {
    const j = this.jess, ck = MART.counter;
    const pts = [];
    if (j.ch.root.position.z < MART.z0) pts.push(V(MART.door, 0, MART.z0 - 0.9));
    pts.push(V(MART.door, 0, MART.z0 + 0.55), V(ck.x + 0.75, 0, MART.z0 + 0.55), this.home.clone());
    j.ch.walkTo(pts, 'walk').then(() => { j.busy = false; j.ch.faceYaw = -Math.PI / 2; });
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
    I({ id: 'jess', label: () => (play() && this.jess.dist() < 2.8 ? (this.count ? `Pay at the till · ${formatMoney(this.total)}` : 'Talk to Dennis') : null),
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
        g.showLine('Dennis', `${DRINKS[id].name} · ${formatMoney(DRINKS[id].price)}`, 0.6);
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

  // walking out with unpaid things: the gate shrieks and Dennis comes after you. He's
  // faster than you. When he catches you he takes it all back, knocks you down, and the
  // store charges you $10 for the trouble.
  alarm() {
    const g = this.game, j = this.jess;
    if (this.chase) return;
    for (let k = 0; k < 8; k++) setTimeout(() => audio.tone?.(k % 2 ? 960 : 1240, 0.18, { type: 'square', vol: 0.07 }), k * 190);
    j.ch.setEmotion('furious', 6);
    g.exclaim.show(j.ch, 1.8, 'anger');
    const line = pick(['HEY! STOP! THIEF!', 'Oh no you don’t! Come back here!', 'You didn’t pay for that! STOP!']);
    j.ch.say(line); g.showLine('Dennis', line, 2.6);
    g.save.stats.shoplift = (g.save.stats.shoplift || 0) + 1;
    g.ui.toast('You walked out without paying. RUN!', 'Thief');
    this.chase = { t: 0, retarget: 0, yell: 3, out: false };
    j.busy = true;
    const ck = MART.counter;
    j.ch.lookAt(null);
    // out from behind the till, through the doors
    j.ch.walkTo([V(ck.x + 0.75, 0, MART.z0 + 0.55), V(MART.door, 0, MART.z0 + 0.55), V(MART.door, 0, MART.z0 - 0.9)], 'run')
      .then(() => { if (this.chase) this.chase.out = true; });
  }

  updateChase(dt) {
    const g = this.game, j = this.jess, c = this.chase;
    c.t += dt;
    const P = g.player.pos, J = j.ch.root.position;
    const d = Math.hypot(P.x - J.x, P.z - J.z);
    if (c.out) {
      c.retarget -= dt;
      if (c.retarget <= 0) {
        c.retarget = 0.25;
        // the barbershop has walls: go through its door, not through the brick
        const R = ROOM.z1;
        let target = P.clone().setY(0);
        if (P.z < R + 0.2 && J.z > R + 0.4) target = V(1.9, 0, R + 0.7);
        j.ch.walkTo([target], 'run');
      }
      c.yell -= dt;
      if (c.yell <= 0) { c.yell = 3.2; const l = pick(['GIVE IT BACK!', 'I’m faster than you, buddy!', 'Stop right there!', 'You can run but you can’t hide!', 'That’s store property!']); j.ch.say(l); g.showLine('Dennis', l, 1.8); }
    }
    if (d < 1.15 && g.state === 'play' && !g.knockedOut) this.caught().catch((e) => console.error(e));
  }

  async caught() {
    const g = this.game, j = this.jess, p = g.player, cam = g.camera;
    this.chase = null;
    g.knockedOut = true;
    p.control = false;
    j.ch.stop();
    j.ch.faceTo(p.pos, true);
    // grab the basket, then a right hook
    const l1 = pick(['GOTCHA! Give me that!', 'Got you! Hand it over!']);
    j.ch.say(l1); g.showLine('Dennis', l1, 1.6);
    this.emptyBasket();
    audio.cloth?.(0.8, 0.2);
    await new Promise((r) => setTimeout(r, 650));
    j.ch.reach('R', () => cam.position.clone(), { speed: 30, hand: 'fist' });
    await new Promise((r) => setTimeout(r, 160));
    audio.slap?.(); audio.thud?.(1);
    g.ui.flash?.('#ffffff');
    p.lookOverride = true; p.shake = 1;
    const start = cam.position.clone(), yaw = p.yaw;
    const away = V(cam.position.x - j.ch.root.position.x, 0, cam.position.z - j.ch.root.position.z).normalize();
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / 650);
        const e = 1 - (1 - t) * (1 - t);
        cam.position.set(start.x + away.x * 0.8 * e, Math.max(0.3, start.y - 1.25 * e), start.z + away.z * 0.8 * e);
        cam.rotation.set(-0.2 + e * 0.9, yaw + e * 0.6, e * 1.1, 'YXZ');
        if (t < 1) requestAnimationFrame(tick); else res();
      };
      tick();
    });
    j.ch.release('R');
    const l2 = pick(['And THAT’s for running!', 'Stay down. And stay out of my store!', 'Shoplifting at Fresh Mart? Not on my shift!']);
    j.ch.say(l2); g.showLine('Dennis', l2, 2.4);
    j.ch.setEmotion('annoyed', 4);
    await new Promise((r) => setTimeout(r, 1200));
    await g.ui.fade(true, 500);
    g.save.money -= 10;
    g.ui.setMoney(g.save.money);
    g.save.stats.caughtShoplifting = (g.save.stats.caughtShoplifting || 0) + 1;
    p.lookOverride = false;
    p.place({ x: p.pos.x + away.x * 0.6, z: p.pos.z + away.z * 0.6 }, yaw, -0.05);
    g.persist();
    g.knockedOut = false;
    if (g.state === 'play') { p.control = true; g.enterFP(); }
    await g.ui.fade(false, 600);
    g.ui.banner('Busted', '−$10', 'Dennis took everything back. Crime doesn’t pay. (Not at Fresh Mart.)', 2200);
    g.checkAchievements?.();
    // back to the till
    this.walkHome();
  }

  update(dt) {
    const g = this.game;
    if (g.state === 'menu' || g.state === 'intro') return;
    const P = g.player.pos;
    const inside = P.x > MART.x0 && P.x < MART.x1 && P.z > MART.z0 + 0.25 && P.z < MART.z1;
    if (this.inside && !inside && this.count && P.z < MART.z0 + 0.25) this.alarm();
    if (this.chase) this.updateChase(dt);
    else if (this.remoteChase) followRemote(this.jess.ch, this.remoteChase);
    if (inside !== this.inside) {
      this.inside = inside;
      if (inside && !this.greeted) { this.greeted = true; const l = pick(['Welcome to Fresh Mart!', 'Hi! Let me know if you need anything!']); this.jess.ch.say(l); g.showLine('Dennis', l, 2, true); }
      if (!inside) this.greeted = false;
      g.ambience?.setOutside?.(inside ? 0.35 : 1);
    }
    // Dennis only needs animating when you're near (or chasing you)
    if (this.chase || this.remoteChase || this.jess.busy || this.jess.dist() < 25) this.jess.update(dt); else this.jess.marker.visible = false;
    if (!this.busy && !this.chase && !this.jess.busy && inside) {
      this.idleT -= dt;
      if (this.idleT < 0) { this.idleT = rand(5, 10); this.jess.ch.gesture(pick(['lookAround', 'nod', 'checkHair']), { dur: 2.2 }); }
    }
  }
}

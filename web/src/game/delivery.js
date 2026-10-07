// Deliveries: equipment and crates don't appear out of thin air. A courier walks in,
// says a line or two, hands the parcel over and leaves; the parcel waits on the floor by
// the counter until you open it (E). Openings show the item with the GOT ITEM moment;
// crates spin a reel first.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { SPOTS } from '../world/shop.js';
import { audio } from '../audio/audio.js';
import { pick, rand } from '../core/util.js';
import { propMaterial } from '../render/materials.js';
import { byId } from '../world/upgrades.js';
import { CRATES, rollItem, grantItem, ownsItem, RARITY, inventory, applySkin } from './items.js';
import { spawnProp } from '../world/props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const COURIER = {
  name: 'Courier',
  colors: {
    Skin: '#b77b55', Top: '#5a3b1c', Sleeve: '#5a3b1c', Pants: '#3b2a1a', Shoes: '#1a1410', Hair: '#1a1410', Iris: '#3e3226',
    EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#d1a956',
    Metal: '#d1a956', Button: '#d1a956', MouthDark: '#2a0d0b', Apron: '#5a3b1c', Shirt: '#5a3b1c', Tie: '#d1a956', Lapel: '#5a3b1c', TopDark: '#3d2812',
  },
  accessories: ['tee'],
  scale: 1.0, hunch: 0,
  voice: { pitch: 118, rate: 1.1, wobble: 0.1, vol: 0.09 },
};

const LINES = [
  ['Delivery for the barber!', 'Sign here... nah, just kidding. Enjoy!'],
  ['Package! Careful, it’s heavy-ish.', 'Have a good one!'],
  ['Express delivery, as ordered.', 'Nice place. Bit of hair on the floor though.'],
  ['You the boss? This is for you.', 'Don’t cut yourself!'],
];
const CRATE_LINES = [['Something rattles in this one...', 'Good luck!'], ['A mystery crate! My favourite.', 'Hope it’s something shiny.']];

function makeBox(color = '#b98b55', size = [0.42, 0.3, 0.34]) {
  const g = new THREE.Group();
  const card = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(...size), card);
  box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const tape = new THREE.MeshStandardMaterial({ color: '#d9c48c', roughness: 0.5 });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.004, size[1] + 0.004, 0.06), tape); g.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, size[1] + 0.006, size[2] + 0.004), tape); g.add(t2);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), new THREE.MeshStandardMaterial({ color: '#f3efe4', roughness: 0.9 }));
  label.position.set(0.1, size[1] / 2 + 0.003, 0.08); label.rotation.x = -Math.PI / 2; g.add(label);
  return g;
}

export class Deliveries {
  constructor(game) {
    this.game = game;
    this.parcels = [];       // on the floor, waiting to be opened
    this.courier = null;
    this.busy = false;
  }

  get inv() { return inventory(this.game.save); }

  // queue something: { kind: 'tool', id } | { kind: 'crate', id }
  order(entry) {
    this.inv.pending.push(entry);
    this.game.persist();
    this.game.ui.toast(entry.kind === 'crate' ? `${CRATES[entry.id].name} ordered — on its way` : `${byId[entry.id].name} ordered — on its way`, 'Delivery');
    this.waitT = Math.min(this.waitT ?? 6, 6);
  }

  update(dt) {
    const g = this.game;
    this.courier?.ch.update(dt);
    if (this.busy || g.state !== 'play' || !this.inv.pending.length) return;
    this.waitT = (this.waitT ?? 6) - dt;
    if (this.waitT <= 0) { this.waitT = 4; this.run().catch((e) => console.error(e)); }
  }

  async run() {
    const g = this.game, dir = g.dir;
    this.busy = true;
    const batch = this.inv.pending.splice(0);
    g.persist();
    const ch = new Character(g.scene, COURIER);
    const hair = new HairSystem({ color: '#1a1410', skin: COURIER.colors.Skin, layers: 10 });
    hair.attach(ch.bones.Head);
    hair.setStyle({ top: 0.08, front: 0.08, left: 0.05, right: 0.05, back: 0.06, fuzz: 0 });
    ch.hair = hair;
    ch.onFootstep = (c) => g.footstepAt(c.root.position);
    // cap
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), propMaterial('LeatherBrown'));
    cap.material = new THREE.MeshStandardMaterial({ color: '#5a3b1c', roughness: 0.7 });
    cap.position.set(0, 0.16, -0.005); cap.scale.set(1, 0.75, 1.05);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 16, 1, false, -Math.PI / 2, Math.PI), cap.material);
    brim.position.set(0, 0.165, 0.07); brim.scale.set(1, 1, 0.8);
    ch.bones.Head.add(cap, brim);
    this.courier = { ch };
    ch.place(SPOTS.doorOut.clone().add(V(-3, 0, 0.3)), Math.PI);
    // carry the parcel(s) in front
    const crate = batch.find((b) => b.kind === 'crate');
    const box = makeBox(crate ? CRATES[crate.id].color : '#b98b55', crate ? [0.36, 0.3, 0.36] : [0.42, 0.28, 0.32]);
    ch.bones.Chest.add(box);
    box.position.set(0, -0.05, 0.25);
    ch.reach('L', () => box.localToWorld(V(0.22, 0, 0)), { speed: 6, hand: 'open' });
    ch.reach('R', () => box.localToWorld(V(-0.22, 0, 0)), { speed: 6, hand: 'open' });
    await ch.walkTo([SPOTS.doorOut, SPOTS.doorStep], 'walk');
    g.shop.openDoor(false, 2.4);
    await ch.walkTo([SPOTS.doorIn, V(1.35, 0, 1.25)], 'walk');
    // to the player
    ch.lookAt(g.camera, 1);
    await ch.faceTo(g.camera.position);
    const lines = pick(crate ? CRATE_LINES : LINES);
    let d = ch.say(lines[0]);
    g.showLine('Courier', lines[0], d + 0.8);
    ch.setEmotion('happy', 3);
    await dir.wait(d + 0.4).catch(() => {});
    // puts it down
    ch.release('L'); ch.release('R');
    box.parent.remove(box);
    const drop = V(1.0 + rand(-0.15, 0.15), 0.18, 1.55 + rand(-0.1, 0.1));
    box.position.copy(drop);
    g.scene.add(box);
    g.physics.add(box, { r: 0.16, vel: V(0, 0.4, 0), bounce: 0.05, friction: 2, flat: true, lift: -0.02, sound: (v) => audio.thud(Math.min(1, v)) });
    audio.thud(0.6);
    ch.gesture('wave');
    d = ch.say(lines[1]);
    g.showLine('Courier', lines[1], d + 0.8);
    this.parcels.push({ obj: box, items: batch });
    g.ui.toast(batch.length > 1 ? `${batch.length} parcels delivered` : 'Parcel delivered — open it (E)', 'Delivery');
    await dir.wait(d).catch(() => {});
    ch.lookAt(null);
    await ch.walkTo([V(1.35, 0, 1.25), SPOTS.doorIn], 'walk');
    g.shop.openDoor(false, 1.4);
    await ch.walkTo([SPOTS.doorStep, SPOTS.doorOut.clone().add(V(5, 0, 0.3))], 'walk');
    ch.dispose();
    this.courier = null;
    this.busy = false;
  }

  // interactable: the nearest parcel
  nearest() { return this.parcels[0] || null; }

  async open(parcel) {
    const g = this.game;
    this.parcels.splice(this.parcels.indexOf(parcel), 1);
    // the lid pops, cardboard flies
    audio.paperCrumple?.();
    audio.whoosh(0.5);
    const pb = g.physics.bodies.find((b) => b.obj === parcel.obj);
    if (pb) g.physics.remove(pb);
    for (let i = 0; i < 4; i++) {
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), new THREE.MeshStandardMaterial({ color: '#b98b55', side: THREE.DoubleSide, roughness: 0.9 }));
      flap.position.copy(parcel.obj.position).add(V(0, 0.15, 0));
      g.scene.add(flap);
      g.physics.add(flap, { r: 0.04, vel: V(rand(-1.5, 1.5), rand(2, 3.2), rand(-1.5, 1.5)), ang: V(rand(-8, 8), rand(-8, 8), rand(-8, 8)), drag: 1.8, flat: true, bounce: 0.1, friction: 1.5, lift: -0.039, life: 12 });
    }
    parcel.obj.parent?.remove(parcel.obj);
    g.player.control = false;
    g.input.setMode('ui');
    for (const it of parcel.items) {
      if (it.kind === 'tool') await this.showTool(it.id);
      else await this.openCrate(it.id);
    }
    if (g.state === 'play') { g.player.control = true; g.enterFP(); }
  }

  showTool(id) {
    const g = this.game, u = byId[id];
    const prop = { clipperBasic: 'ClipperCheap', clipperPro: 'ClipperPro', scissorsPro: 'Scissors', dyeStation: 'Spray' }[id] || 'ClipperCheap';
    let obj;
    try { obj = spawnProp(prop, { shadows: false }); } catch (e) { return Promise.resolve(); }
    g.barber.makeTools?.();
    return new Promise((res) => g.itemFx.show(obj, { title: 'NEW GEAR!', name: u.name, desc: u.effect }).then(res));
  }

  async openCrate(id) {
    const g = this.game;
    const item = rollItem(id);
    const dupe = ownsItem(g.save, item);
    await g.ui.crateReel(id, item);
    if (dupe) {
      const r = RARITY[item.rarity].refund;
      g.addMoney(r);
      g.ui.toast(`Duplicate ${item.name} — sold for $${r}`, 'Crate');
    } else {
      grantItem(g.save, item);
      g.ui.toast(item.kind === 'dye' ? `New colour for the Colour Bar: ${item.name}` : `${item.name} skin equipped`, RARITY[item.rarity].label);
      g.barber.makeTools?.();
    }
    g.persist();
  }
}

export { makeBox, applySkin };

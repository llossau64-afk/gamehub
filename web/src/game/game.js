// Game orchestration: states, interactions, economy, saving and the scripted moments
// that connect cutscene, tutorial and the endless "one more customer" loop.
import * as THREE from 'three';
import { Shop, SPOTS, ROOM } from '../world/shop.js';
import { spawnProp, part } from '../world/props.js';
import { Player } from './player.js';
import { Character } from '../chars/character.js';
import { HairSystem, hairLight, HEAD_C } from '../hair/hair.js';
import { Clippings, Mist } from '../hair/clippings.js';
import { evaluate, payment, HAIRCUTS } from '../hair/styles.js';
import { OWNER_LOOK, randomCustomerLook, PERSONALITIES } from '../chars/looks.js';
import { CustomerManager } from './customers.js';
import { BarberMode } from './barber.js';
import { Director, SKIP } from '../cutscene/director.js';
import { playIntro, introEndState } from '../cutscene/intro.js';
import { ItemShowcase } from '../fx/itemGet.js';
import { Exclaim } from '../fx/exclaim.js';
import { DayClock } from './dayclock.js';
import { Physics } from '../fx/physics.js';
import { Reactions } from './reactions.js';
import { playTutorial } from './tutorial.js';
import { UPGRADES, byId, effects, xpFor, ACHIEVEMENTS, EVENTS } from '../world/upgrades.js';
import { Street } from './street.js';
import { Employee } from './employee.js';
import { availableHaircuts } from '../hair/styles.js';
import { audio } from '../audio/audio.js';
import { store } from '../core/save.js';
import { platform } from '../platform/platform.js';
import { Spring, clamp, damp, rand, pick, chance, formatMoney, lerp, easeInOut } from '../core/util.js';
import { makeEnvironment, applyQuality, QUALITY } from '../render/renderer.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Game {
  constructor({ renderer, ui, input, qualityName }) {
    this.renderer = renderer;
    this.ui = ui;
    this.input = input;
    this.qualityName = qualityName;
    this.quality = QUALITY[qualityName];
    this.scene = new THREE.Scene();
    this.scene.environment = makeEnvironment(renderer);
    this.scene.environmentIntensity = 0.28;
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.03, 120);
    this.shop = new Shop(this.scene, renderer, this.quality);
    this.player = new Player(this.scene, this.camera, this.shop);
    this.clippings = new Clippings(this.scene);
    this.mist = new Mist(this.scene);
    this.itemFx = new ItemShowcase(this);
    this.exclaim = new Exclaim(this.scene);
    this.clock = new DayClock(this);
    this.physics = new Physics(this);
    this.reactions = new Reactions(this);
    this.dir = new Director(this);
    this.customers = new CustomerManager(this);
    this.barber = new BarberMode(this);
    this.street = new Street(this);
    this.save = store.data;
    this.settings = store.settings;
    this.state = 'boot';
    this.fx = effects(this.save.owned);
    this.chairAngle = Math.PI;
    this.chairAngleTarget = 0;
    this.chairSpeed = 4;
    this.chairBob = new Spring(0, 140, 9);
    this.items = [];
    this.waiters = {};
    this.highlights = [];
    this.lineQueue = 0;
    this.time = 0;
    this.servedToday = 0;
    this.cartTools = [];
    this.buildCartTools();
    this.buildMarker();
    this.registerInteractables();
    this.shop.applyState(new Set(this.save.owned));
    this.clippings.capeSurface = null;
    this.ambience = null;
    this.paused = false;
    this.applySettings();
    this.bindUI();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ------------------------------------------------------------------ setup
  bindUI() {
    this.ui.upBtn.addEventListener('click', () => this.openUpgrades());
    this.ui.pauseBtn.addEventListener('click', () => this.pause());
    this.ui.trophyBtn.addEventListener('click', () => { if (this.state === 'play') this.openAchievements(); });
    ACHIEVEMENTS.find((a) => a.id === 'repertoire').goal = Object.keys(HAIRCUTS).length;
    const sk = this.ui.skipEl;
    sk.addEventListener('pointerdown', (e) => { e.preventDefault(); this.skipPointer = true; });
    addEventListener('pointerup', () => { this.skipPointer = false; });
    sk.addEventListener('pointerleave', () => { this.skipPointer = false; });
    addEventListener('ad-start', () => { this.adPlaying = true; audio.setMuted(true); });
    addEventListener('ad-end', () => { this.adPlaying = false; audio.setMuted(false); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { audio.suspend(); if (this.state === 'play') this.pause(); } else audio.resume();
    });
    // pointer lock lost while playing -> pause (desktop)
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'play' && !this.ui.openPanel && this.input.mode === 'fp' && !this._noPauseOnUnlock && !this.input.touch) {
        this._unlockPauseTimer = setTimeout(() => { if (!document.pointerLockElement && this.state === 'play' && !this.ui.openPanel) this.pause(); }, 120);
      }
    });
  }

  applySettings() {
    const s = this.settings;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, amb: s.amb, voice: s.voice, ui: s.sfx });
    this.player.sensitivity = 0.4 + s.sensitivity * 1.2;
    this.player.invertY = s.invertY;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 1.2 ? 78 : 68;
    this.camera.updateProjectionMatrix();
  }

  buildCartTools() {
    const top = this.shop.cartTop;
    const items = [['ClipperCheap', -0.12, 0.3], ['Scissors', 0.02, 1.2], ['Trimmer', 0.14, -0.4], ['Comb', 0.05, 0.1], ['Spray', -0.15, 0]];
    for (const [n, dx, rot] of items) {
      const o = spawnProp(n);
      o.position.set(top.x + dx, top.y + (n === 'Comb' ? 0.003 : 0.016), top.z + (n === 'Spray' ? -0.08 : 0.03));
      if (n === 'Spray') o.position.y = top.y;
      else o.rotation.set(Math.PI / 2 * 0, rot, 0);
      if (n === 'Comb') o.rotation.set(-Math.PI / 2, 0, rot);
      if (n !== 'Spray' && n !== 'Comb') o.rotation.set(0, rot, n === 'Scissors' ? 0 : Math.PI / 2);
      this.scene.add(o);
      this.cartTools.push(o);
    }
  }

  buildMarker() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.translate(32, 32);
    ctx.fillStyle = '#efe4cf';
    ctx.strokeStyle = '#7a2a26';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(16, 0); ctx.lineTo(0, 22); ctx.lineTo(-16, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    this.marker.scale.setScalar(0.09);
    this.marker.renderOrder = 20;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  makeOwner() {
    const o = new Character(this.scene, OWNER_LOOK);
    o.hair = new HairSystem({ color: OWNER_LOOK.hair.color, skin: OWNER_LOOK.colors.Skin, layers: Math.max(8, this.quality.hairLayers - 6) });
    o.hair.attach(o.bones.Head);
    o.hair.setStyle(OWNER_LOOK.hair.style, 0.42);
    o.onFootstep = (c) => this.footstepAt(c.root.position);
    return o;
  }

  // ------------------------------------------------------------------ highlights
  highlight(obj, kind = 'prop') {
    for (const h of this.highlights) h.parent?.remove(h);
    this.highlights = [];
    this.highlightTarget = obj;
    this.marker.visible = !!obj;
    if (!obj) return;
    const mk = (skinned) => {
      const m = new THREE.MeshBasicMaterial({ color: '#f3d9a2', side: THREE.BackSide, transparent: true, opacity: 0.55, depthWrite: false });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uW = this.outlineW ||= { value: 0.008 };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uW;')
          .replace(skinned ? '#include <skinning_vertex>' : '#include <begin_vertex>', (skinned ? '#include <skinning_vertex>' : '#include <begin_vertex>') + (skinned ? '\ntransformed += normalize(objectNormal) * uW;' : '\ntransformed += normalize(normal) * uW;'));
      };
      this.outlineMats = this.outlineMats || [];
      this.outlineMats.push(m);
      return m;
    };
    if (kind === 'char') {
      const sm = obj;
      const o = new THREE.SkinnedMesh(sm.geometry, mk(true));
      o.bind(sm.skeleton, sm.bindMatrix);
      o.frustumCulled = false;
      sm.parent.add(o);
      o.position.copy(sm.position); o.quaternion.copy(sm.quaternion); o.scale.copy(sm.scale);
      this.highlights.push(o);
    } else {
      const mat = mk(false);
      obj.traverse((m) => {
        if (!m.isMesh || m.userData.outline || m.material.transparent) return;
        const o = new THREE.Mesh(m.geometry, mat);
        o.userData.outline = true;
        o.renderOrder = -1;
        m.add(o);
        this.highlights.push(o);
      });
    }
  }

  updateHighlight(dt) {
    if (!this.highlightTarget) return;
    const t = this.time;
    if (this.outlineMats) for (const m of this.outlineMats) m.opacity = 0.32 + 0.28 * Math.sin(t * 4);
    const box = new THREE.Box3().setFromObject(this.highlightTarget);
    const c = box.getCenter(new THREE.Vector3());
    this.marker.position.set(c.x, box.max.y + 0.14 + Math.sin(t * 3) * 0.025, c.z);
  }

  // ------------------------------------------------------------------ interactables
  registerInteractables() {
    const I = (def) => this.shop.addInteractable(def);
    I({
      id: 'chair', label: () => {
        const c = this.customers.inChair;
        if (c && c.state === 'seated') return this.tutorialActive ? null : 'Start haircut';
        if (this.allowChairCall) return 'Show to the chair';
        if (this.customers.nextWaiting() && !c) return 'Call to chair';
        return null;
      },
      pos: () => V(SPOTS.chair.x, 1.0, SPOTS.chair.z), radius: 2.6,
      action: () => {
        const c = this.customers.inChair;
        if (c && c.state === 'seated') { if (!this.tutorialActive) this.startHaircut(c); return 'chair'; }
        if (this.allowChairCall) { this.allowChairCall = false; return 'chair'; }
        const n = this.customers.nextWaiting();
        if (n && !this.customers.inChair) { this.customers.toChair(n); n.say(pick(['Finally!', 'My turn? Great.', 'Alright!']), 'happy'); }
        return 'chair';
      },
    });
    I({
      id: 'cape', label: () => (this.tutorialActive && this.customers.inChair?.state === 'seated' ? 'Take the cape' : null),
      pos: () => SPOTS.capeHook.clone(), radius: 3.2, action: () => 'cape',
    });
    I({
      id: 'opensign', label: () => (this.state === 'play' && !this.clock.open && !this.tutorialActive ? 'Open the shop' : null),
      pos: () => V(1.9, 1.5, 2.45), radius: 3.4,
      action: () => { this.clock.openShop(); this.customers.enabled = true; this.customers.spawnT = 2.5; this.ui.objective('', ''); this.showEvent(); return 'opensign'; },
    });
    I({ id: 'catalog', label: () => 'Upgrades', pos: () => this.shop.slots.catalog.getWorldPosition(V()).add(V(0, 0.05, 0)), radius: 2.2, action: () => { this.openUpgrades(); return 'catalog'; } });
    I({
      id: 'broom', label: () => (this.clippings.floorCount > 15 ? 'Sweep the floor' : null),
      pos: () => SPOTS.broom.clone().setY(0.8), radius: 2.4, action: () => { this.sweep(); return 'broom'; },
    });
    I({
      id: 'radio', label: () => (this.owns('radio') ? (this.radioOn ? 'Radio off' : 'Radio on') : null),
      pos: () => this.shop.slots.radio.getWorldPosition(V()).add(V(0, 0.1, 0)), radius: 2.6,
      action: () => { this.setRadio(!this.radioOn); return 'radio'; },
    });
  }

  // candidates including customers
  findInteractable() {
    const cam = this.camera;
    const fwd = this.player.forward(V());
    const eye = cam.position;
    let best = null, bestScore = Infinity;
    const consider = (pos, radius, label, action, id, obj) => {
      if (!label) return;
      const d = pos.clone().sub(eye);
      const dist = d.length();
      if (dist > radius) return;
      const ang = Math.acos(clamp(d.normalize().dot(fwd), -1, 1));
      const lim = Math.atan2(0.42, dist) + 0.1;
      if (ang > lim) return;
      const score = ang * 2 + dist * 0.15;
      if (score < bestScore) { bestScore = score; best = { label, action, id, obj }; }
    };
    for (const it of this.shop.interactables) consider(it.pos(), it.radius, it.label(), it.action, it.id);
    for (const c of this.customers.list) {
      let label = null, action = null;
      if (c.state === 'waitingTalk' || (c.state === 'looking' && !c.tutorial) || (c.state === 'waiting' && !c.talked)) { label = 'Talk'; action = () => { if (!c.tutorial) this.customers.talk(c); return 'customer'; }; }
      else if (c.talked && ['waiting', 'standing'].includes(c.state) && !this.customers.inChair) { label = `Call ${c.name}`; action = () => { this.customers.toChair(c); return 'callNext'; }; }
      if (label) consider(c.headPos().add(V(0, -0.15, 0)), 2.8, label, action, 'customer');
    }
    return best;
  }

  waitInteract(id) { return new Promise((res) => { (this.waiters[id] ||= []).push(res); }); }

  fireInteract(id) {
    const w = this.waiters[id];
    if (w && w.length) { this.waiters[id] = []; w.forEach((f) => f()); }
  }

  // ------------------------------------------------------------------ flow
  start() {
    this.toMenu(true).catch((e) => console.error("toMenu", e.message, e.stack));
  }

  async toMenu(first = false) {
    this.state = 'menu';
    platform.gameplayStop();
    this.input.setMode('ui');
    this.dir.cancel(); this.dir.reset();
    this.barber.active && this.barber.exit();
    this.customers.enabled = false;
    for (const e of this.staff) e.reset();
    this.customers.clear();
    if (this.owner) { this.owner.dispose(); this.owner = null; }
    this.syncEmployee();
    this.ui.showHud(false);
    this.ui.letterbox(false);
    this.ui.subtitle(null);
    this.ui.tip(null);
    this.ui.objective('', '');
    this.ui.hideRequest();
    this.ui.clearBubbles();
    this.ui.closePanel();
    this.player.hideArms();
    this.player.control = false;
    this.highlight(null);
    this.shop.applyState(new Set(this.save.owned));
    this.fx = effects(this.save.owned);
    this.menuT = 0;
    this.menuShot = 0;
    this.dir.takeCamera(V(1.6, 1.55, 1.7), V(-0.9, 1.0, -1.4));
    this.dir.cam.handheld = 0.4;
    this.menuAmbient();
    audio.startMusic('menu');
    this.ambience?.setOutside(0.25);
    if (!first) await this.ui.fade(false, 700); else this.ui.fade(false, 1200);
    const s = this.save;
    this.ui.showMenu({
      hasSave: store.hasProgress,
      saveInfo: store.hasProgress ? `Lv ${s.level} · ${formatMoney(s.money)}` : '',
      onContinue: () => this.continueGame(),
      onNew: () => this.newGame(),
      onUpgrades: () => this.ui.upgradesPanel(this, { readOnly: true }),
      onAchievements: () => this.openAchievements(),
      onSettings: () => this.openSettings(),
    });
  }

  menuAmbient() {
    // a couple of customers live in the shop behind the menu
    if (!store.hasProgress) return;
    const a = this.customers.spawnStatic({ seatIndex: 1, phone: true });
    const b = this.customers.spawnStatic({ chair: true });
    this.menuChars = [a, b].filter(Boolean);
  }

  updateMenu(dt) {
    this.menuT += dt;
    const shots = [
      [V(1.6, 1.55, 1.7), V(-0.9, 1.0, -1.4), V(0.8, 1.45, 1.9)],
      [V(-2.2, 1.35, 1.6), V(-0.9, 1.2, -1.5), V(-1.6, 1.4, 1.2)],
      [V(2.2, 1.7, -1.8), V(-0.5, 1.0, 0.6), V(2.0, 1.6, -0.9)],
    ];
    const dur = 11;
    const i = Math.floor(this.menuT / dur) % shots.length;
    const k = (this.menuT % dur) / dur;
    if (i !== this.menuShot) { this.menuShot = i; this.ui.fade(true, 350).then(() => this.ui.fade(false, 600)); }
    const [a, look, b] = shots[i];
    if (k > 0.03) {
      this.dir.cam.pos.lerpVectors(a, b, easeInOut(k));
      this.dir.cam.look.copy(look);
      this.dir.cam.tween = null;
    }
  }

  async newGame() {
    audio.unlock();
    store.reset();
    this.save = store.data;
    this.save.started = true;
    this.fx = effects(this.save.owned);
    this.syncEmployee();
    this.shop.applyState(new Set());
    this.clippings.sweep();
    this.persist();
    this.ui.hideMenu();
    audio.stopMusic(1.2);
    await this.ui.fade(true, 900);
    this.customers.clear();
    this.ui.setMoney(this.save.money, false);
    this.ui.setLevel(this.save.level, this.save.xp);
    await this.runIntro();
    await this.runTutorial();
    this.beginPlay();
  }

  async continueGame() {
    this.fx = effects(this.save.owned);
    this.shop.applyState(new Set(this.save.owned));
    audio.unlock();
    this.ui.hideMenu();
    audio.stopMusic(1.0);
    await this.ui.fade(true, 700);
    this.customers.clear();
    this.dir.releaseCamera();
    this.player.place(SPOTS.playerStart, 0.6, -0.05);
    this.ui.setMoney(this.save.money, false);
    this.ui.setLevel(this.save.level, this.save.xp);
    if (!this.save.tutorialDone) {
      this.ui.fade(false, 900);
      await this.runTutorial();
      this.beginPlay();
      return;
    }
    this.beginPlay(true);
    await this.ui.fade(false, 900);
    this.ui.banner('Welcome back', `Day ${this.save.day}`, '', 1800);
  }

  async runIntro() {
    this.state = 'intro';
    this.input.setMode('ui');
    this.dir.reset();
    this.skipHold = 0;
    this.canSkip = true;
    try {
      await playIntro(this);
    } catch (e) {
      if (e !== SKIP) console.error(e);
      if (e === SKIP) { await this.ui.fade(true, 300); }
    }
    this.dir.reset();
    this.itemFx.cancel();
    introEndState(this);
    this.ui.setSkip(false);
    this.canSkip = false;
    this.save.introSeen = true;
    this.persist();
    // hand control to the player
    if (this.dir.cam.active) this.dir.releaseCamera();
    if (this.fadeWasSkip) this.player.place(V(0.1, 0, 0.1), -2.4, -0.05);
    this.ui.letterbox(false);
    this.ui.fade(false, 700);
  }

  async runTutorial() {
    this.state = 'play';
    this.enterFP();
    this.ui.showHud(true);
    platform.gameplayStart();
    this.dir.reset();
    try { await playTutorial(this); } catch (e) { if (e !== SKIP) console.error(e); }
    this.tutorialActive = false;
  }

  beginPlay(resume = false) {
    // after the day banner, so the popups don't pile up on top of it
    this.reactions.later(4.5, () => this.checkAchievements());
    this.state = 'play';
    this.enterFP();
    this.ui.showHud(true);
    // the shop opens when you flip the door sign (8:00); until then nobody comes in
    this.clock.morning();
    this.shop.setOpenSign(false);
    this.customers.enabled = false;
    this.customers.spawnT = 3;
    setTimeout(() => { if (!this.clock.open && this.state === 'play') this.ui.objective('Morning', 'Flip the door sign to OPEN'); }, 2600);
    platform.gameplayStart();
    this.updateGoal();
    if (this.owns('radio')) this.setRadio(true);
    this.syncEmployee();
    this.rollEvent();
    setTimeout(() => { if (this.clock.open) this.showEvent(); }, 2500);
    platform.loadingStop();
  }

  enterFP() {
    this.state = this.state === 'barber' ? 'play' : this.state;
    this.input.setMode('fp');
    this.player.control = true;
    this.ui.showHud(true);
    if (!this.input.touch) {
      this._noPauseOnUnlock = true;
      this.input.requestLock();
      setTimeout(() => { this._noPauseOnUnlock = false; }, 400);
    }
  }

  pause() {
    if (this.paused || !['play', 'barber'].includes(this.state) || this.ui.openPanel) return;
    this.paused = true;
    platform.gameplayStop();
    this.input.setMode('ui');
    this.ui.pauseMenu({
      resume: () => this.resume(),
      upgrades: () => { this.ui.closePanel(); this.openUpgrades(true); },
      settings: () => { this.ui.closePanel(); this.openSettings(true); },
      achievements: () => { this.ui.closePanel(); this.openAchievements(true); },
      menu: () => { this.paused = false; this.ui.openPanel?.el.remove(); this.ui.openPanel = null; this.persist(); this.ui.fade(true, 500).then(() => this.toMenu()); },
    });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.ui.openPanel?.el.remove();
    this.ui.openPanel = null;
    platform.gameplayStart();
    if (this.state === 'barber') this.input.setMode('pointer'); else this.enterFP();
  }

  openSettings(fromPause = false) {
    const prevQ = this.settings.quality;
    this.ui.settingsPanel(this.settings, (k) => {
      this.applySettings();
      store.saveSettings();
      if (k === 'quality') this.ui.toast('Graphics change applies after reload');
    }, {
      onReplayTutorial: this.save.started ? () => { this.save.tutorialDone = false; this.persist(); this.ui.toast('The tutorial plays next time you continue'); } : null,
      onReset: () => { store.wipe(); this.save = store.data; this.shop.applyState(new Set()); this.fx = effects([]); this.ui.closePanel(); this.toMenu(); },
      onClose: () => { if (fromPause) this.pause(); },
    });
  }

  openUpgrades(fromPause = false) {
    if (this.state !== 'play' && this.state !== 'menu' && !fromPause) return;
    if (this.ui.openPanel) return;
    const wasMode = this.input.mode;
    this.input.setMode('ui');
    this.player.control = false;
    this.ui.upgradesPanel(this, {
      hint: this.tutorialUpgrade ? 'bulb' : null,
      // after a purchase in the shop, close the catalogue and show the new thing off
      reveal: (id) => {
        if (fromPause || this.state !== 'play' || this.tutorialUpgrade) return false;
        this.ui.openPanel?.el.remove(); this.ui.openPanel = null;
        this.revealUpgrade(id).catch((e) => { if (e !== SKIP) console.error(e); }).finally(() => { if (this.state === 'play') { this.player.control = true; this.enterFP(); } });
        return true;
      },
      onClose: () => {
        if (fromPause) { this.pause(); return; }
        if (this.state === 'play') { this.player.control = true; this.enterFP(); }
      },
    });
  }

  // camera glides over to a new upgrade, sparkles, caption, then back to you
  async revealUpgrade(id) {
    const u = byId[id];
    const dir = this.dir;
    const R = { x0: -3.2, x1: 3.2, z0: -2.6, z1: 2.6 };
    const SHOTS = {
      bulb: [V(-0.2, 1.7, 0.3), V(-0.9, 2.55, -1.25)],
      clean: [V(1.2, 1.9, 1.6), V(-0.4, 0.2, -0.6)],
      radio: [V(-1.9, 1.75, -0.2), V(R.x0 + 0.13, 1.8, -1.1)],
      decor: [V(0.6, 1.6, 0.9), V(-2.4, 1.4, 0.6)],
      paint: [V(1.6, 1.6, 1.6), V(-1.6, 1.3, -1.8)],
      couch: [V(0.9, 1.4, -0.2), V(2.78, 0.5, -0.35)],
      pole: [V(-0.8, 1.6, 1.4), V(-0.15, 1.7, 2.7)],
      products: [V(-1.7, 1.6, 0.1), V(R.x0, 1.5, -0.75)],
      floorWood: [V(1.5, 2.1, 1.7), V(-0.3, 0, -0.4)],
      tv: [V(1.0, 1.6, 0.6), V(R.x1 - 0.06, 1.85, 0.75)],
      chairClassic: [V(0.1, 1.4, 0.0), V(-0.9, 0.7, -1.45)],
      mirrorLarge: [V(-0.4, 1.55, 0.0), V(-0.9, 1.6, -2.55)],
      station2: [V(0.4, 1.5, 0.2), V(1.2, 0.9, -1.8)],
      hireBarber: [V(0.8, 1.6, 0.0), V(1.75, 1.5, -1.05)],
      trainBarber: [V(0.8, 1.6, 0.0), V(1.75, 1.5, -1.05)],
      fastHands: [V(0.8, 1.6, 0.0), V(1.75, 1.5, -1.05)],
    };
    this.player.control = false;
    this.input.setMode('ui');
    this.ui.showHud(false);
    if (u.cat === 'tools' && u.equip) {
      // tools: straight into your hands
      const prop = { clipperBasic: 'ClipperCheap', clipperPro: 'ClipperPro', scissorsPro: 'Scissors' }[id];
      if (prop) {
        let obj = null;
        try { obj = spawnProp(prop, { shadows: false }); } catch (e) { obj = null; }
        if (obj) { await new Promise((res) => { this.itemFx.show(obj, { title: 'NEW GEAR!', name: u.name, desc: u.effect }).then(res); }); this.ui.showHud(true); return; }
      }
    }
    const shot = SHOTS[id];
    if (!shot) { this.ui.showHud(true); return; }
    dir.takeCamera(this.camera.position.clone(), this.camera.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)));
    dir.cam.handheld = 0.5;
    dir.move(shot[0], shot[1], 1.3);
    await dir.wait(1.25);
    audio.sparkle?.();
    audio.purchase();
    this.player.shake = 0.1;
    this.burstSparkles(shot[1]);
    const cap = this.ui.revealCaption(u.name, u.effect);
    await dir.wait(2.2);
    cap.classList.add('out'); setTimeout(() => cap.remove(), 500);
    const back = this.player.pos.clone().setY(this.player.eye ?? 1.62);
    dir.move(back, back.clone().add(new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw))), 0.9);
    await dir.wait(0.9);
    dir.releaseCamera();
    this.ui.showHud(true);
  }

  // a puff of golden sparkles at a world point (physics-driven confetti)
  burstSparkles(p) {
    const geo = new THREE.PlaneGeometry(0.035, 0.035);
    const cols = ['#f2cf7c', '#fff3cf', '#d1a956', '#e0455a', '#9fd08a'];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, toneMapped: false }));
      m.position.copy(p).add(V((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2));
      this.scene.add(m);
      this.physics.add(m, { r: 0.01, vel: V((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3), ang: V(Math.random() * 20, Math.random() * 20, Math.random() * 20),
        drag: 2.6, bounce: 0.1, flat: true, friction: 2, lift: -0.009, life: 6 });
    }
  }

  // ------------------------------------------------------------------ economy
  get money() { return this.save.money; }
  get level() { return this.save.level; }
  owns(id) { return this.save.owned.includes(id); }

  buy(id) {
    const u = byId[id];
    if (!u || this.owns(id) || this.money < u.price || this.level < u.level || (u.req && !this.owns(u.req))) return false;
    this.save.money -= u.price;
    this.save.owned.push(id);
    if (u.equip) this.save.equipped[u.equip] = id;
    this.fx = effects(this.save.owned);
    this.ui.setMoney(this.save.money);
    audio.purchase();
    this.persist();
    this.onUpgradeBought(id);
    this.updateGoal();
    return true;
  }

  async onUpgradeBought(id) {
    const shop = this.shop;
    if (id === 'bulb') {
      // the old bulb pops, then the new warm light clicks on
      shop.flicker(true);
      await wait(700);
      shop.applyState(new Set(this.save.owned));
      audio.lightOn();
      this.checkAchievements();
    } else {
      shop.applyState(new Set(this.save.owned));
    }
    if (id === 'radio') this.setRadio(true);
    if (id === 'hireBarber') {
      this.syncEmployee();
      this.checkAchievements();
      const m = this.employee.ch;
      m.lookAt(this.camera, 1);
      const d = m.say('Hey boss! Marco. I’ll take the next one in line.');
      this.showLine('Marco', 'Hey boss! Marco. I’ll take the next one in line.', d + 1);
      m.gesture('wave');
    }
    if (id === 'hireBarber2') {
      this.syncEmployee();
      const m = this.employee2.ch;
      m.lookAt(this.camera, 1);
      const line = 'Luca, at your service. Nice back room, boss!';
      const d = m.say(line);
      this.showLine('Luca', line, d + 1);
      m.gesture('wave');
    }
    if (id === 'clean') this.clippings.sweep();
    this.checkAchievements();
    this.ui.toast(byId[id].name, 'New');
  }

  addMoney(v) {
    this.save.money += v;
    this.save.stats.earned += Math.max(0, v);
    this.ui.setMoney(this.save.money);
    this.checkAchievements();
  }

  addXP(v) {
    const s = this.save;
    s.xp += v;
    let up = false;
    while (s.xp >= xpFor(s.level)) { s.xp -= xpFor(s.level); s.level++; up = true; }
    this.ui.setLevel(s.level, s.xp);
    if (up) {
      this.checkAchievements();
      setTimeout(() => { audio.levelUp(); this.ui.banner('Level up', `Level ${s.level}`, 'New upgrades and haircuts unlocked', 2000); }, 300);
    }
    return up;
  }

  unlock(id, quiet = false) {
    const s = this.save;
    if (s.achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    s.achievements.push(id);
    (s.achDays ||= {})[id] = s.day;
    if (!quiet) this.ui.achievementPop(a);
    this.ui.setTrophies(this.unclaimed());
    this.persist();
  }

  // every achievement reads its progress from the save; unlock whatever is reached
  checkAchievements() {
    const fresh = ACHIEVEMENTS.filter((a) => a.goal && !this.save.achievements.includes(a.id) && a.progress(this.save) >= a.goal);
    // a pile at once (an old save, a big purchase): one summary instead of a queue of popups
    const quiet = fresh.length > 2;
    for (const a of fresh) this.unlock(a.id, quiet);
    if (quiet) {
      const best = fresh.reduce((m, a) => ({ bronze: 0, silver: 1, gold: 2 }[a.tier] > { bronze: 0, silver: 1, gold: 2 }[m.tier] ? a : m), fresh[0]);
      this.ui.achievementPop({ ...best, name: `${fresh.length} achievements`, desc: fresh.map((a) => a.name).slice(0, 4).join(', ') + (fresh.length > 4 ? '…' : ''),
        reward: fresh.reduce((r, a) => ({ money: r.money + a.reward.money, xp: r.xp + a.reward.xp }), { money: 0, xp: 0 }) });
    }
  }

  unclaimed() {
    const c = this.save.achClaimed || [];
    return this.save.achievements.filter((id) => !c.includes(id)).length;
  }

  claimAchievement(id) {
    const s = this.save;
    s.achClaimed ||= [];
    if (!s.achievements.includes(id) || s.achClaimed.includes(id)) return null;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    s.achClaimed.push(id);
    s.money += a.reward.money;
    this.ui.setMoney(s.money);
    this.addXP(a.reward.xp);
    this.ui.setTrophies(this.unclaimed());
    this.persist();
    this.updateGoal();
    return a.reward;
  }

  openAchievements(fromPause = false) {
    if (this.ui.openPanel) return;
    const inPlay = this.state === 'play';
    if (inPlay) { this.input.setMode('ui'); this.player.control = false; }
    this.ui.achievementsPanel(this, {
      onClose: () => {
        if (fromPause) { this.pause(); return; }
        if (inPlay && this.state === 'play') { this.player.control = true; this.enterFP(); }
      },
    });
  }

  persist() { store.data = this.save; store.save(); }

  updateGoal() {
    const s = this.save;
    this.ui.setTrophies(this.unclaimed());
    const next = UPGRADES.filter((u) => !this.owns(u.id) && u.level <= s.level && (!u.req || this.owns(u.req))).sort((a, b) => a.price - b.price)[0];
    let text = '';
    if (next) {
      const d = next.price - s.money;
      text = d > 0 ? `${formatMoney(d)} until ${next.name}` : `You can afford: ${next.name}`;
      this.ui.attention('upgrades', d <= 0);
    } else {
      text = `${xpFor(s.level) - s.xp} XP to level ${s.level + 1}`;
      this.ui.attention('upgrades', false);
    }
    this.ui.setGoal(text);
  }

  // what the next customer asks for
  randLook() { return randomCustomerLook(); }

  pickCut(vip = false) {
    const av = availableHaircuts(this.level);
    if (vip) return pick([...av].sort((a, b) => HAIRCUTS[b].price - HAIRCUTS[a].price).slice(0, 3));
    if (this.event?.id === 'fadeChallenge') {
      const fades = av.filter((id) => HAIRCUTS[id].fade);
      if (fades.length && chance(0.6)) return pick(fades);
    }
    // freshly unlocked cuts show up a bit more often
    const w = av.map((id) => (HAIRCUTS[id].level >= this.level - 1 ? 1.8 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < av.length; i++) { r -= w[i]; if (r <= 0) return av[i]; }
    return av[av.length - 1];
  }

  get staff() { return [this.employee, this.employee2].filter(Boolean); }

  syncEmployee() {
    if (this.owns('hireBarber') && !this.employee) this.employee = new Employee(this);
    if (!this.owns('hireBarber') && this.employee) { this.employee.dispose(); this.employee = null; }
    if (this.owns('hireBarber2') && !this.employee2) this.employee2 = new Employee(this, 'luca');
    if (!this.owns('hireBarber2') && this.employee2) { this.employee2.dispose(); this.employee2 = null; }
  }

  rollEvent() {
    const s = this.save;
    if (s.level < 2 || s.day < 2) { this.event = null; return; }
    if (s.eventDay === s.day) { this.event = EVENTS.find((e) => e.id === s.eventId) || null; return; }
    s.eventDay = s.day;
    let pool = EVENTS.filter((e) => !(e.id === 'fadeChallenge' && s.level < 4) && !(e.id === 'vipDay' && s.level < 3));
    this.event = chance(0.5) && pool.length ? pick(pool) : null;
    s.eventId = this.event?.id || null;
    this.persist();
  }

  showEvent() {
    if (this.event) this.ui.objective(`Today · ${this.event.name}`, this.event.desc);
    else this.ui.objective('', '');
  }

  loseCustomer(c) {
    this.save.stats.lost++;
    this.checkAchievements();
    this.save.stats.streak = 0;
    this.save.reputation = Math.max(0, this.save.reputation - 3);
    this.ui.toast(`${c.name} walked out`, 'Lost');
    this.persist();
  }

  // ------------------------------------------------------------------ chair, cape, items
  setChairAngle(a, speed = 4) { this.chairAngleTarget = a; this.chairSpeed = speed; }
  chairBounce(v) { this.chairBob.kick(-v); }

  async putCape(c) {
    const shop = this.shop;
    const R = this.player.arms.R, L = this.player.arms.L;
    this.player.control = false;
    // turn to the hook, grab the cape
    const hook = SPOTS.capeHook.clone();
    const t0 = this.time;
    await this.dir.until(() => { this.player.lookTowards(hook, 1 / 60, 6); return this.time - t0 > 0.6; }, 2);
    R.set({ visible: true, pos: V(0.14, -0.2, -0.5), fingers: V(0, 0.3, -1), palm: V(-1, 0, -0.3), pose: 'grip', speed: 10 });
    L.set({ visible: true, pos: V(-0.14, -0.2, -0.5), fingers: V(0, 0.3, -1), palm: V(1, 0, -0.3), pose: 'grip', speed: 10 });
    audio.cloth(0.8, 0.3);
    await this.dir.wait(0.45);
    shop.slots.capeHook.visible = false;
    // throw it open around the customer
    const cape = spawnProp('Cape');
    this.scene.add(cape);
    const startPos = hook.clone();
    const neck = () => c.ch.bones.Chest.localToWorld(V(0, 0.215, 0.005));
    const t1 = this.time;
    R.set({ pos: V(0.32, -0.12, -0.55), pose: 'open' });
    L.set({ pos: V(-0.32, -0.12, -0.55), pose: 'open' });
    c.ch.gesture('chinUp', { dur: 1.6 });
    audio.capeSnap();
    await this.dir.until(() => {
      this.player.lookTowards(neck().add(V(0, -0.1, 0)), 1 / 60, 5);
      const k = clamp((this.time - t1) / 0.75, 0, 1);
      const e = easeInOut(k);
      const p = startPos.clone().lerp(neck(), e);
      p.y += Math.sin(k * Math.PI) * 0.35;
      cape.position.copy(p);
      cape.rotation.set(0, c.ch.yaw + (1 - e) * 2.4, (1 - e) * 0.8);
      const s = 0.25 + 0.75 * e + Math.sin(k * Math.PI) * 0.18;
      cape.scale.set(s, 0.4 + 0.6 * e, s);
      return k >= 1;
    }, 3);
    // attach to the customer and let it settle
    c.ch.bones.Chest.add(cape);
    cape.position.set(0, 0.215, 0.005);
    cape.rotation.set(0, 0, 0);
    c.cape = cape;
    this.capeSettle = { obj: cape, spring: new Spring(1.12, 120, 7) };
    audio.cloth(1, 0.5);
    R.set({ visible: false }); L.set({ visible: false });
    await this.dir.wait(0.6);
    this.player.control = true;
  }

  removeCape(c) {
    if (!c.cape) return;
    const cape = c.cape;
    c.cape = null;
    cape.parent?.remove(cape);
    this.shop.slots.capeHook.visible = true;
    audio.capeSnap();
  }

  throwItem(obj, vel, spin = V(3, 2, 1)) {
    this.physics.add(obj, { r: 0.025, vel, ang: spin, flat: true, bounce: 0.15, friction: 1.2, drag: 1.4, lift: -0.022, sound: (s) => audio.paperTap(s) });
  }

  updateItems(dt) {
    for (const it of this.items) {
      if (it.rest) continue;
      it.vel.y -= 4.5 * dt;
      it.vel.multiplyScalar(1 - 1.2 * dt);
      it.obj.position.addScaledVector(it.vel, dt);
      it.obj.rotation.x += it.spin.x * dt; it.obj.rotation.y += it.spin.y * dt; it.obj.rotation.z += it.spin.z * dt;
      if (it.obj.position.y < 0.01) { it.obj.position.y = 0.01; it.rest = true; it.obj.rotation.x = 0; it.obj.rotation.z = 0; audio.paperFlick(); }
    }
  }

  footstepAt(pos, loud = 1) {
    const d = pos.distanceTo(this.camera.position);
    if (d < 9) audio.footstep(this.shop.has('floorWood') ? 'wood' : 'tile', clamp(1.4 * loud / (d + 0.6), 0.05, loud > 1 ? 1.2 : 0.8));
  }

  walkSteps(dur) {
    const n = Math.floor(dur / 0.5);
    for (let i = 0; i < n; i++) setTimeout(() => audio.footstep('tile', 0.6), i * 500 + 150);
  }

  // dialogue line with subtitle; returns how long it plays
  line(ch, who, text) {
    const d = ch.say(text);
    this.showLine(who, text, d + 1.0);
    return d;
  }

  showLine(who, text, dur) {
    this.ui.subtitle(who, text);
    clearTimeout(this._subT);
    this._subT = setTimeout(() => this.ui.subtitle(null), dur * 1000);
  }

  setRadio(on) {
    this.radioOn = on;
    if (on) audio.startMusic('radio'); else audio.stopMusic();
  }

  sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    const R = this.player.arms.R;
    this.player.control = false;
    let n = 0;
    const timer = setInterval(() => { audio.noiseBurst(0.25, { vol: 0.12, freq: 1800, q: 0.6, attack: 0.08 }); n++; if (n > 4) clearInterval(timer); }, 260);
    R.set({ visible: true, pos: V(0.1, -0.45, -0.5), fingers: V(0, -1, -0.5), palm: V(-1, 0, 0), pose: 'grip' });
    setTimeout(() => {
      this.clippings.sweep();
      this.reactions.tidy();
      R.set({ visible: false });
      this.player.control = true;
      this.sweeping = false;
      this.save.stats.sweeps = (this.save.stats.sweeps || 0) + 1;
      this.checkAchievements();
      this.ui.toast('Floor swept');
    }, 1400);
  }

  // ------------------------------------------------------------------ haircut flow
  async startHaircut(c) {
    if (this.state !== 'play') return;
    this.player.control = false;
    this.ui.hideRequest();
    await this.putCape(c);
    this.enterBarber(c, {});
  }

  enterBarber(c, opts) {
    this.state = 'barber';
    this.player.control = false;
    this.ui.prompt(null);
    c.state = 'cutting';
    // the chair faces the mirror; beard work starts with the camera in front
    this.barber.enter(c, opts);
    this.ui.objective('', '');
    platform.gameplayStart();
  }

  waitHaircutDone() { return new Promise((res) => { this._haircutDone = res; }); }

  async finishHaircut() {
    const c = this.barber.c;
    const secs = this.barber.time;
    const groom = this.barber.groom;
    this.barber.exit();
    this.ui.hideRequest();
    this.state = 'reaction';
    if (this._haircutDone) { const f = this._haircutDone; this._haircutDone = null; f(); }
    const result = evaluate(c, c.cutId, c.tutorial ? Math.min(secs, HAIRCUTS[c.cutId].par) : secs);
    // shop comfort and a dirty floor nudge the rating
    const floorPenalty = this.clippings.floorCount > 250 ? 0.04 : 0;
    result.overall = clamp(result.overall + this.fx.sat * 0.25 + groom * 0.035 - floorPenalty, 0, 1);
    result.groom = groom;
    result.stars = result.overall >= 0.88 ? 5 : result.overall >= 0.76 ? 4 : result.overall >= 0.6 ? 3 : result.overall >= 0.42 ? 2 : 1;
    if (window.__forceStars) result.stars = window.__forceStars;   // debug harness only
    if (c.tutorial) { result.stars = Math.max(result.stars, 3); }
    c.stars = result.stars;
    try {
      await this.mirrorReaction(c, result);
    } catch (e) { if (e !== SKIP) console.error(e); }
    // result screen
    const pay = payment(c.cutId, result, c.personality, { tips: this.fx.tips * (1 + Math.min(3, this.save.stats.streak) * 0.05) * (this.event?.id === 'doubleTips' ? 2 : 1) });
    if (this.event?.id === 'fadeChallenge' && c.cut.fade && result.stars >= 4) { pay.tip += 25; this.ui.toast('Fade Challenge bonus +$25', 'Event'); }
    const s = this.save;
    const xpBefore = s.xp, needBefore = xpFor(s.level), lvlBefore = s.level;
    this.ui.showHud(true, { crosshair: false });
    this.input.setMode('ui');
    const up = this.addXP(pay.xp);
    const quote = c.reactionLine || '';
    await this.ui.showResult({
      kicker: c.tutorial ? 'First cut complete' : `${c.name} · ${c.cut.name}`,
      title: ['Rough', 'Not great', 'Decent', 'Clean', 'Perfect'][result.stars - 1] + (result.stars >= 4 ? '!' : ''),
      quote, stars: result.stars, accuracy: result.accuracy, symmetry: result.symmetry, edges: result.edges, fade: result.fade, style: result.style,
      speed: result.speed, groom: result.groom, pay: pay.pay, tip: pay.tip, xp: pay.xp, level: lvlBefore, levelUp: up,
      xpBefore, xpNeedBefore: needBefore, xpAfter: s.xp, xpNeedAfter: xpFor(s.level),
    });
    // stats
    s.stats.served++;
    if (result.stars >= 4) { s.stats.streak++; s.stats.bestStreak = Math.max(s.stats.bestStreak, s.stats.streak); } else s.stats.streak = 0;
    if (result.stars === 5) { s.stats.fiveStars++; platform.happyTime(); }
    s.stats.cuts ||= {};
    s.stats.cuts[c.cutId] = (s.stats.cuts[c.cutId] || 0) + 1;
    if (result.stars === 5 && c.cut.fade) s.stats.fades5 = (s.stats.fades5 || 0) + 1;
    if (result.stars === 5 && c.cut.beard) s.stats.beards5 = (s.stats.beards5 || 0) + 1;
    if (result.stars === 5 && c.cut.style) s.stats.styled5 = (s.stats.styled5 || 0) + 1;
    if (result.stars >= 4 && !c.tutorial && secs < c.cut.par * 0.7) s.stats.fast = (s.stats.fast || 0) + 1;
    if (c.vip && result.stars >= 4) { s.stats.vips ||= []; if (!s.stats.vips.includes(c.vip.name)) s.stats.vips.push(c.vip.name); }
    s.reputation = clamp(s.reputation + (result.stars - 3) * 2, 0, 100);
    this.checkAchievements();
    if (c.vip) {
      if (result.stars >= 4) { s.reputation = clamp(s.reputation + 5, 0, 100); this.ui.toast(`${c.vip.title} ${c.vip.name} loved it`, 'VIP'); platform.happyTime(); }
      else { s.reputation = clamp(s.reputation - 6, 0, 100); this.ui.toast('The VIP was not impressed', 'VIP'); }
    }
    this.persist();
    await this.customerPays(c, pay);
    this.servedToday++;
  }

  async mirrorReaction(c, result) {
    const dir = this.dir;
    const ch = c.ch;
    // camera over the shoulder, chair turns to the mirror
    this.setChairAngle(0, 3);
    const mirror = SPOTS.mirror.clone();
    const camPos = V(SPOTS.chair.x + 0.42, 1.48, SPOTS.chair.z + 0.62);
    dir.takeCamera(this.camera.position.clone(), this.barber.camLook.clone());
    dir.cam.handheld = 0.3;
    dir.move(camPos, V(SPOTS.chair.x - 0.05, 1.3, SPOTS.mirror.z), 1.4);
    ch.headTurnSpeed = 3;
    ch.lookAt(V(SPOTS.chair.x, 1.25, SPOTS.mirror.z), 1);
    audio.duckMusic(0.15);
    await dir.wait(1.5);
    ch.setEmotion('neutral');
    await dir.wait(0.6);
    ch.gesture('touchHair');
    await dir.wait(1.5);
    if (c.tutorial) {
      ch.setEmotion('happy');
      c.say('Okay...', 'happy', 2);
      await dir.wait(1.3);
      const line = 'That’s actually clean.';
      ch.setEmotion('excited', 2.5);
      ch.gesture('thumbsUp');
      c.reactionLine = line;
      const d = c.say(line, null);
      await dir.wait(d + 0.6);
    } else {
      await this.reactions.mirror(c, result);
    }
    audio.duckMusic(0.55);
  }

  async customerPays(c, pay) {
    const dir = this.dir;
    const ch = c.ch;
    this.state = 'play';
    // back to first person standing behind the chair
    const stand = V(SPOTS.chair.x + 0.35, 0, SPOTS.chair.z + 1.25);
    this.player.place(stand, 0.25, -0.1);
    dir.releaseCamera();
    this.player.pos.copy(stand);
    this.player.yaw = Math.atan2(-(SPOTS.chair.x - stand.x), -(SPOTS.chair.z - stand.z));
    this.player.pitch = -0.15;
    this.player.control = false;
    this.input.setMode('ui');
    if (!c.tutorial && c.stars <= 1) {
      try { await this.reactions.meltdown(c, pay); } catch (e) { if (e !== SKIP) console.error(e); }
      this.player.control = true;
      return;
    }
    // spin to face the room, cape off, stand up
    this.setChairAngle(Math.PI, 3);
    await dir.wait(0.9);
    this.removeCape(c);
    await dir.wait(0.3);
    await ch.standUp();
    c.seatedInChair = false;
    this.customers.inChair = null;
    ch.lookAt(this.camera, 1);
    await ch.walkTo([V(SPOTS.chair.x + 0.25, 0, SPOTS.chair.z + 0.62)], 'walk');
    await ch.faceTo(this.camera.position);
    ch.gesture('touchHair', { dur: 1.8 });
    await dir.wait(1.6);
    // hands over the money
    const note = spawnProp('Note');
    ch.hold('R', note, { pos: [0.012, -0.1, 0.01], rot: [Math.PI / 2, 0, 0] });
    const give = () => this.camera.localToWorld(V(0.05, -0.18, -0.55));
    ch.reach('R', give, { speed: 4, hand: 'pinch', fingers: () => this.camera.position.clone().sub(ch.root.position).setY(-0.3).normalize(), palm: () => V(0, -1, 0) });
    const R = this.player.arms.R;
    R.set({ visible: true, pos: V(0.08, -0.4, -0.4), fingers: V(-0.2, 0.2, -1), palm: V(0, 1, 0), pose: 'cup', speed: 6 });
    await dir.wait(0.3);
    R.set({ pos: V(0.05, -0.24, -0.5) });
    await dir.wait(0.9);
    ch.drop('R', this.scene);
    R.hold(note, { pos: [0.025, -0.075, 0.0], rot: [0, 0, -Math.PI / 2] });
    R.set({ pose: 'grip' });
    ch.release('R');
    audio.paperFlick();
    audio.register();
    this.addMoney(pay.pay + pay.tip);
    this.save.stats.tips += pay.tip;
    this.ui.floatText(innerWidth / 2, innerHeight * 0.55, `+${formatMoney(pay.pay + pay.tip)}`);
    this.persist();
    this.updateGoal();
    await dir.wait(0.5);
    R.set({ pos: V(0.2, -0.6, -0.2) });
    setTimeout(() => { R.set({ visible: false }); R.drop(); }, 500);
    let gait = 'walk';
    if (c.tutorial) { c.say('I’ll be back.', 'happy'); ch.gesture('wave', { dur: 1.2 }); }
    else gait = this.reactions.exitStyle(c, c.stars);
    this.enterFP();
    if (gait === 'skip') await dir.wait(1.6).catch(() => {});
    this.customers.walkOut(c, gait);
    // call the next waiting customer automatically after a moment
    setTimeout(() => {
      const n = this.customers.nextWaiting();
      if (n && !this.customers.inChair && this.state === 'play') { this.customers.toChair(n); }
    }, 2500);
  }

  async endOfDay() {
    const served = this.servedToday;
    this.servedToday = 0;
    const s = this.save;
    s.day++;
    this.persist();
    this.checkAchievements();
    this.rollEvent();
    audio.duckMusic?.(0.2);
    await this.ui.fade(true, 700);
    this.clock.morning();
    this.shop.setOpenSign(false);
    this.clippings.sweep();
    this.ui.fade(false, 900);
    await this.ui.banner(`Day ${s.day - 1} done · ${served} served`, `Day ${s.day}`, this.event ? `Today: ${this.event.name}` : 'Flip the sign when you are ready', 2400);
    audio.duckMusic?.(0.55);
    this.ui.objective('Morning', 'Flip the door sign to OPEN');
    if (this.state === 'play') {
      platform.gameplayStop();
      await platform.showMidgame();
      platform.gameplayStart();
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.time += dt;
    hairLight.time.value = this.time;
    const input = this.input;
    input.update();
    if (this.adPlaying) { input.endFrame(); return; }
    // ---- skip / pause keys
    if (this.state === 'intro' && this.canSkip) {
      const held = input.held('skip') || this.skipPointer;
      this.skipHold = held ? this.skipHold + dt : Math.max(0, this.skipHold - dt * 2);
      this.ui.setSkip(true, clamp(this.skipHold / 0.9, 0, 1));
      if (this.skipHold > 0.9) { this.canSkip = false; this.fadeWasSkip = true; this.dir.cancel(); }
    }
    if (input.pressed('pause')) {
      if (this.ui.openPanel) { if (this.paused) this.resume(); else this.ui.closePanel(); }
      else if (['play', 'barber'].includes(this.state)) this.pause();
    }
    if (this.paused) { input.endFrame(); return; }
    if (input.pressed('upgrades') && this.state === 'play' && !this.ui.openPanel) this.openUpgrades();
    // ---- world
    this.dir.update(dt);
    if (this.state === 'menu') this.updateMenu(dt);
    this.updateChair(dt);
    if (this.owner) this.owner.update(dt);
    this.customers.update(dt);
    this.street.update(dt);
    for (const e of this.staff) e.update(dt);
    this.updateItems(dt);
    this.clippings.update(dt);
    this.mist.update(dt);
    this.shop.update(dt, this.camera);
    this.updateCape(dt);
    // ---- player
    if (this.state === 'barber') this.barber.update(dt);
    this.player.obstacles = this.customers.list.filter((c) => c.ch.sitW < 0.5).map((c) => c.ch.root.position);
    if (!this.dir.cam.active && this.state !== 'barber') this.player.update(dt, input);
    else { this.player.arms.R.update(dt, new THREE.Vector3()); this.player.arms.L.update(dt, new THREE.Vector3()); }
    // ---- interaction
    if (this.state === 'play' && this.player.control && !this.ui.openPanel) {
      const it = this.findInteractable();
      this.ui.prompt(it ? it.label : null);
      if (it && (input.pressed('interact') || input.pressed('tap'))) {
        const id = it.action();
        audio.click();
        if (id) this.fireInteract(id);
      }
    } else if (this.state !== 'barber') this.ui.prompt(null);
    this.updateHighlight(dt);
    this.updateBubbles();
    // hair level of detail by distance
    for (const c of this.customers.list) {
      const d = this.state === 'barber' && this.barber.c === c ? 0 : c.ch.root.position.distanceTo(this.camera.position);
      c.hair.setLOD(d);
      if (c.beard) c.beard.setLOD(d);
    }
    if (this.owner?.hair) this.owner.hair.setLOD(this.owner.root.position.distanceTo(this.camera.position));
    // hair lighting follows the main lamp
    const L = this.shop.lampSpot;
    hairLight.keyDir.value.copy(L.position).sub(V(SPOTS.chair.x, 1.2, SPOTS.chair.z)).normalize();
    const k = L.intensity / 26;
    hairLight.keyColor.value.setRGB(0.95 * k + 0.25, 0.85 * k + 0.22, 0.7 * k + 0.18);
    this.ambience?.update(this.time);
    if (this.state === 'play' || this.state === 'barber') this.save.playTime += dt;
    // last, after every camera move of the frame, so the showcased item sticks to the view
    this.itemFx.update(dt);
    this.exclaim.update(dt);
    this.physics.update(dt);
    if (this.state !== 'menu') this.clock.update(dt);
    this.reactions.update(dt);
    input.endFrame();
  }

  updateChair(dt) {
    this.chairAngle = damp(this.chairAngle, this.chairAngleTarget, this.chairSpeed, dt);
    const pivot = this.shop.chairPivot();
    pivot.rotation.y = this.chairAngle;
    pivot.position.y = (pivot.userData.y0 ??= pivot.position.y) + this.chairBob.update(dt) * 0.03;
    // a seated customer turns with the chair
    const c = this.customers.inChair;
    if (c && c.seatedInChair && c.ch.sitW > 0.98) {
      c.ch.yaw = Math.PI + this.chairAngle;
      c.ch.faceYaw = null;
      const f = V(Math.sin(c.ch.yaw), 0, Math.cos(c.ch.yaw));
      c.ch.root.position.set(SPOTS.chair.x - f.x * 0.05, c.ch.root.position.y, SPOTS.chair.z - f.z * 0.05);
      c.ch.root.rotation.y = c.ch.yaw;
    }
    // other chair (when the classic is not bought) spins too
    for (const k of ['chairOld', 'chairClassic']) {
      const p = part(this.shop.slots[k], 'pivot');
      if (p !== pivot) p.rotation.y = this.chairAngle;
    }
  }

  updateCape(dt) {
    const s = this.capeSettle;
    if (!s) return;
    const v = s.spring.update(dt);
    s.spring.target = 1;
    s.obj.scale.set(v, 1 + (1 - v) * 0.6, v);
    if (Math.abs(v - 1) < 0.002 && Math.abs(s.spring.vel) < 0.01) { s.obj.scale.set(1, 1, 1); this.capeSettle = null; }
  }

  updateBubbles() {
    if (!['play', 'barber'].includes(this.state)) { if (this.ui.bubbles.size) this.ui.clearBubbles(); return; }
    const w = innerWidth, h = innerHeight;
    for (const c of this.customers.list) {
      const show = !c.tutorial && ['waitingTalk', 'waiting', 'standing', 'seated', 'looking'].includes(c.state) && this.state === 'play';
      if (!show) { this.ui.removeBubble(c.id); continue; }
      const p = c.headPos().add(V(0, 0.28, 0)).project(this.camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) { this.ui.removeBubble(c.id); continue; }
      const pat = c.patience / c.patienceMax;
      const text = (c.vip ? '★ ' : '') + (!c.talked ? '!' : c.state === 'seated' ? '✂' : '…');
      this.ui.setBubble(c.id, (p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, text, pat, pat < 0.25 ? 'bad' : pat < 0.5 ? 'warn' : '');
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

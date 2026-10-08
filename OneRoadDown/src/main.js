// ONE ROAD DOWN — entry point and game state machine.
//   boot → (first start | menu) → garage ⇄ run → summary → run | garage

import * as THREE from 'three';
import { initMaterials, mats } from './gfx/materials.js';
import { setAnisotropy } from './gfx/textures.js';
import { Particles, SkidMarks, Debris } from './gfx/particles.js';
import { Post } from './gfx/post.js';
import { Track } from './world/track.js';
import { World } from './world/world.js';
import { Environment } from './world/env.js';
import { Garage } from './scenes/garage.js';
import { CarModel } from './models/carModel.js';
import { TYPE, carDims } from './models/carDims.js';
import { Run } from './game/run.js';
import { Race, fmtTime } from './game/race.js';
import { Online } from './net/online.js';
import { MAPS, mapById, COUNTRY_CODES } from './data/maps.js';
import { computeStats, maxStats, capOf, unlockedTires } from './game/stats.js';
import { CARS, carById, STARTERS } from './data/cars.js';
import { CATEGORIES, upgradeCost, TIRES, tireById, GARAGE_LEVELS, PAINTS, FINISHES, carDiscount, garageCapBonus } from './data/upgrades.js';
import { MOUNTAINS, mountainById } from './data/mountains.js';
import { ACHIEVEMENTS } from './data/achievements.js';
import { SaveManager, carState } from './core/save.js';
import { Input } from './core/input.js';
import { Platform } from './core/platform.js';
import { AudioSys, audio } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { clamp, damp, fmtMoney, fmtKm, lerp } from './core/util.js';
import { loadAssets } from './world/assets.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

class Game {
  constructor() {
    this.save = new SaveManager();
    this.platform = new Platform();
    this.input = new Input();
    this.sound = new AudioSys();
    this.ui = new UI(document.getElementById('ui'));
    this.state = 'boot';
    const qp = new URLSearchParams(location.search);
    this.debug = { bot: qp.has('bot'), fixed: qp.has('fixed'), startS: +(qp.get('s') || 0), race: qp.get('race'), opp: qp.has('opp') ? +qp.get('opp') : null };
    this.clock = new THREE.Clock();
    if (this.input.isTouch) document.body.classList.add('touch');
    this.input.bindTouch(this.ui.screens.touch);
    this.wireUI();
    // keyboard control of every menu (the run itself reads keys through Input)
    window.addEventListener('keydown', (e) => {
      if (!this.navActive()) return;
      // typing in a text field (driver name, friend code) is not menu navigation
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (this.state === 'garage' && !this.ui.modalOpen && (this.tab === 'vehicles' || this.tab === 'dealer')) {
        if (['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) { this.crStep(e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1); e.preventDefault(); return; }
        if (e.code === 'Enter') { this.crAct(); e.preventDefault(); return; }
      }
      if (this.state === 'first' && !this.ui.modalOpen && ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { e.preventDefault(); return; }
      if (this.state === 'garage' && !this.ui.modalOpen && (e.code === 'KeyQ' || e.code === 'KeyE')) { this.cycleTab(e.code === 'KeyE' ? 1 : -1); e.preventDefault(); return; }
      if (this.ui.navKey(e)) e.preventDefault();
    }, true);
    window.focus();
    window.addEventListener('pointerdown', () => window.focus());
    window.addEventListener('blur', () => { if (this.state === 'run' && this.run && this.run.active && !this.paused) this.pause(true); });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('error', (e) => console.error('[ORD]', e.message));
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    const ui = this.ui;
    ui.cycleTips();
    await this.platform.init();
    this.platform.loadingStart();
    if (this.platform.data) this.save.attachPortal(this.platform.data);
    await document.fonts.ready.catch(() => {});
    ui.bootArt();
    const sv = this.save.data;
    this.sound.setVolumes({ master: sv.settings.master, music: sv.settings.music, sfx: sv.settings.sfx });
    // renderer
    this.quality = this.pickQuality();
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance', stencil: false }));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = this.quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.post = new Post(renderer, this.quality);
    document.getElementById('game').appendChild(renderer.domElement);
    setAnisotropy(Math.min(this.quality === 'high' ? 8 : 4, renderer.capabilities.getMaxAnisotropy()));
    this.renderScale = 1;
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.15, 6000);
    this.resize();
    ui.setLoad(0.08, 'LOADING VEHICLES…');
    await frame();
    initMaterials();
    ui.setLoad(0.1, 'PLANTING FORESTS…');
    await loadAssets(renderer, (p) => ui.setLoad(0.1 + p * 0.12, 'PLANTING FORESTS…'));
    ui.setLoad(0.22, 'BUILDING MOUNTAIN…');
    await frame();
    this.loadMountain(sv.mountain);
    ui.setLoad(0.38, 'PREPARING ROAD…');
    for (let i = 0; i < 12; i++) { this.world.update(30, 1); ui.setLoad(0.38 + i * 0.03, 'PREPARING ROAD…'); await frame(); }
    ui.setLoad(0.78, 'OPENING THE WORKSHOP…');
    await frame();
    this.garage = new Garage(renderer, this.quality);
    this.garage.setLevel(sv.garageLevel);
    this.garage.bindPointer(renderer.domElement);
    ui.setLoad(0.9, 'STARTING ENGINE…');
    this.setupMenuScene();
    this.env.update(0.016, this.track, 30, this.camera, this.menuCar.group.position, 0);
    // lights that come and go during play exist from the start: adding a light later
    // changes every shader's light count and recompiles them all mid-race (a freeze)
    this.headlight = new THREE.SpotLight(0xfff0d8, 0, 60, 0.5, 0.5, 1.2);
    this.headlight.target = new THREE.Object3D();
    this.flashLight = new THREE.PointLight(0xffa040, 0, 30, 1.6);
    this.worldScene.add(this.headlight, this.headlight.target, this.flashLight);
    renderer.compile(this.worldScene, this.camera);
    renderer.compile(this.garage.scene, this.camera);
    await frame();
    ui.setLoad(1, 'READY');
    this.platform.loadingStop();
    this.loop();
    await wait(400);
    ui.bootReady();
    await this.waitForGesture();
    this.sound.init();
    this.sound.starter(null);
    this.sound.burst({ freq: 140, type: 'lowpass', dur: 1.2, gain: 0.3, buf: this.sound.brown, delay: 0.7 });
    await ui.fade(true);
    ui.endBoot();
    if (!sv.firstStartDone || !sv.owned.length) this.enterFirst();
    else if (this.debug.race) { this.enterMenu(); this.startRace(this.debug.race, { opponents: this.debug.opp ?? 5 }); }
    else this.enterMenu();
    await wait(150);
    ui.fade(false);
  }

  waitForGesture() {
    return new Promise((res) => {
      const go = () => { window.removeEventListener('keydown', go); window.removeEventListener('pointerdown', go); res(); };
      window.addEventListener('keydown', go); window.addEventListener('pointerdown', go);
    });
  }

  pickQuality() {
    const q = this.save.data.settings.quality;
    if (q !== 'auto') return q;
    if (this.input.isTouch) return 'low';
    const cores = navigator.hardwareConcurrency || 4;
    return cores >= 8 ? 'high' : 'medium';
  }

  resize() {
    if (!this.renderer) return;
    const w = innerWidth, h = innerHeight;
    const maxPR = this.quality === 'high' ? 2 : this.quality === 'low' ? 1 : 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxPR) * this.renderScale);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.ui.speedo.resize();
  }

  loadMountain(id) { return this.loadTrack(mountainById(id)); }
  loadTrack(m) {
    if (this.world) { this.world.dispose(); }
    if (!this.worldScene) {
      this.worldScene = new THREE.Scene();
      this.env = new Environment(this.renderer, this.worldScene, this.quality);
      this.particles = new Particles(this.worldScene, this.quality);
      this.skids = new SkidMarks(this.worldScene);
    }
    this.track = new Track(m);
    this.world = new World(this.worldScene, this.track, this.quality);
    this.debris = new Debris(this.worldScene, this.track);
    this.mountainId = m.circuit || m.kind ? null : m.id;
    this.mapId = m.kind ? m.id : null;
    if (this.menuCar) { this.worldScene.remove(this.menuCar.group); this.menuCar.dispose(); this.menuCar = null; }
  }

  // ------------------------------------------------------------------ races
  raceTiers() { return [0, 2, 5, 9, 14]; }
  mapInfo() {
    const sv = this.save.data;
    const races = sv.races || 0;
    this.outlines = this.outlines || {};
    return MAPS.map((m) => {
      const need = this.raceTiers()[(m.tier || 1) - 1] || 0;
      const o = this.outlines[m.id];
      return {
        id: m.id, name: m.name, country: m.country, cc: COUNTRY_CODES[m.country] || '', region: m.region, desc: m.desc, kind: m.kind, laps: m.laps,
        km: o ? o.km : (m.length || (m.circuit ? m.circuit.minLen : 3000)) / 1000, reward: m.reward, locked: races < need, need,
        wins: (sv.wins || {})[m.id] || 0, bestLap: (sv.bestLaps || {})[m.id] ? fmtTime(sv.bestLaps[m.id]) : null,
        outline: o ? o.pts : null, loop: m.kind === 'circuit',
      };
    });
  }
  // track outlines for the cards are built in the background, one per frame
  buildOutlines() {
    this.outlines = this.outlines || {};
    const todo = MAPS.filter((m) => !this.outlines[m.id]);
    if (!todo.length) return;
    const m = todo[0];
    try {
      const t = new Track(m);
      const pts = [];
      const lim = m.kind === 'sprint' ? Math.round(t.length / 2) : t.N;
      for (let j = 0; j < lim; j += 6) pts.push([t.px[j], t.pz[j]]);
      this.outlines[m.id] = { pts, km: t.length / 1000 };
    } catch (e) { this.outlines[m.id] = { pts: null, km: 3 }; }
    if (this.state === 'racesel') this.renderRaceSelect();
    setTimeout(() => this.buildOutlines(), 30);
  }
  openRaceSelect() {
    const sv = this.save.data;
    if (!sv.owned.length) return this.enterFirst();
    this.stopRun();
    this.state = 'racesel';
    if (!this.menuCar) this.setupMenuScene();
    if (!this.raceSel || !MAPS.some((m) => m.id === this.raceSel)) this.raceSel = sv.lastMap || MAPS[0].id;
    if (this.raceOpp == null) this.raceOpp = 5;
    this.ui.only('racesel');
    this.renderRaceSelect();
    this.buildOutlines();
    audio()?.music?.setMode('menu');
  }
  renderRaceSelect() {
    this.ui.raceSelect({ maps: this.mapInfo(), sel: this.raceSel, opponents: this.raceOpp, cash: this.save.data.cash });
  }
  // ------------------------------------------------------------------ online
  openOnline() {
    const sv = this.save.data;
    if (!sv.owned.length) return this.enterFirst();
    if (!this.online) {
      this.online = new Online(this);
      this.online.on(() => { if (this.state === 'online') this.renderOnline(); });
    }
    this.ui.fade(true).then(() => {
      this.stopRun();
      this.state = 'online';
      if (!this.menuCar) this.setupMenuScene();
      this.menuCar.group.visible = true;
      this.ui.only('online');
      this.olMsg = '';
      this.renderOnline();
      if (this.online.lobby) this.online.setCar(this.selectedCar().id);
      audio()?.music?.setMode('menu');
      this.ui.fade(false);
    });
  }
  renderOnline() {
    const o = this.online;
    if (!o) return;
    const mid = (o.view && o.view.map) || (o.cfg && o.cfg.map) || '';
    this.ui.online({
      avail: o.available(), connected: o.connected(), busy: !!this.olBusy, name: o.name(),
      lobbies: o.lobbies.map((l) => ({ ...l, mapName: (mapById(l.map) && mapById(l.map).name) || '—' })),
      inLobby: !!o.lobby, code: o.code || '', pub: o.pub !== false, isHost: !!o.isHost, ready: !!o.myReady, msg: this.olMsg,
      members: o.members.map((m) => ({ ...m, carName: (carById(m.car) || {}).name || m.car })),
      map: mid, mapName: (mapById(mid) && mapById(mid).name) || '—',
      maps: MAPS.map((m) => ({ id: m.id, name: m.name, cc: COUNTRY_CODES[m.country] || '' })),
    });
  }
  // a lobby race begins (host pressed start)
  onlineStart(view) {
    const map = mapById(view.map) || MAPS[0];
    this.ui.show('raceres', false);
    this.startRace(map.id, { net: this.online.raceIface(view) });
  }
  async startRace(mapId, opts = {}) {
    const sv = this.save.data;
    const map = mapById(mapId);
    sv.lastMap = map.id; this.save.save();
    await this.ui.fade(true);
    this.ui.only();
    this.stopRun();
    if (this.mapId !== map.id) this.loadTrack(map);
    this.state = 'run';
    this.paused = false;
    if (this.menuCar) this.menuCar.group.visible = false;
    if (this.run && !(this.run instanceof Race)) { this.run.stop && this.run.vehicle && this.run.stop(); }
    if (!(this.run instanceof Race)) this.run = new Race(this);
    this.run.camMode = sv.settings.camera;
    this.run.startRace(this.selectedCar().id, { map, opponents: opts.opponents ?? this.raceOpp ?? 5, net: opts.net || null });
    audio()?.ambience && audio().ambience.update(0, { room: 0 });
    await new Promise((r) => setTimeout(r, 120));
    this.ui.fade(false);
  }
  // the free car: five races of any kind earn a solid all-rounder
  freeCarProgress() {
    const sv = this.save.data;
    const id = 'wasp';
    if (sv.owned.includes(id)) return null;
    return `${carById(id).name} · ${Math.min(5, sv.races || 0)}/5 RACES`;
  }
  checkFreeCar() {
    const sv = this.save.data;
    const id = 'wasp';
    if (sv.owned.includes(id) || (sv.races || 0) < 5) return null;
    sv.owned.push(id); carState(sv, id);
    return `<b>FREE CAR UNLOCKED:</b> the ${carById(id).name} (${carById(id).cls.toLowerCase()}) is waiting in your garage.`;
  }

  // ------------------------------------------------------------------ helpers
  paintFor(car, cs) {
    const p = PAINTS.find((x) => x.id === cs.paint) || PAINTS[0];
    return { color: p.color ?? car.model.paint, finish: p.color ? p.finish : (car.model.sport ? 'metallic' : 'solid') };
  }
  selectedCar() { return carById(this.save.data.selected || this.save.data.owned[0] || 'rusty'); }
  statsFor(car) { const cs = carState(this.save.data, car.id); return computeStats(car, cs.levels, cs.tire, this.save.data.garageLevel); }

  rows(st, mx, prev) {
    const d = (k, fmt = (v) => v.toFixed(0), inv = false) => {
      if (!prev) return {};
      const dv = st[k] - prev[k];
      if (Math.abs(dv) < 0.05 || !Number.isFinite(dv)) return {};
      const good = inv ? dv < 0 : dv > 0;
      return { delta: (dv > 0 ? '+' : '−') + fmt(Math.abs(dv)), deltaNeg: !good, up: good };
    };
    const r = (label, k, unit, scale, fmtv = (v) => Math.round(v), inv = false, dfmt) => ({
      label, value: st[k] == null ? '—' : fmtv(st[k]), unit, frac: st[k] == null ? 0 : (inv ? 1 - st[k] / scale : st[k] / scale), maxFrac: mx ? (inv ? 1 - (mx[k] || scale) / scale : mx[k] / scale) : undefined, ...d(k, dfmt, inv),
    });
    return [
      r('TOP SPEED', 'top', 'KM/H', 420),
      r('POWER', 'hp', 'HP', 1500),
      r('TORQUE', 'nm', 'NM', 2400),
      { label: '0–100 KM/H', value: st.t100 ? st.t100.toFixed(1) : '—', unit: 'SEC', frac: st.t100 ? clamp(1 - (st.t100 - 2) / 16, 0, 1) : 0, maxFrac: mx && mx.t100 ? clamp(1 - (mx.t100 - 2) / 16, 0, 1) : undefined, ...(prev && prev.t100 && st.t100 && Math.abs(st.t100 - prev.t100) > 0.04 ? { delta: (st.t100 < prev.t100 ? '−' : '+') + Math.abs(st.t100 - prev.t100).toFixed(1), deltaNeg: st.t100 > prev.t100, up: st.t100 < prev.t100 } : {}) },
      r('GRIP', 'grip', '/100', 100),
      r('BRAKES', 'brakes', '/100', 100),
      r('SUSPENSION', 'susp', '/100', 100),
      r('DURABILITY', 'dur', '/100', 100),
      r('FUEL', 'fuel', 'L', 200),
      r('WEIGHT', 'kg', 'KG', 4600, (v) => Math.round(v).toLocaleString('en-US'), true),
    ];
  }

  // ------------------------------------------------------------------ menu
  setupMenuScene() {
    const sv = this.save.data;
    const car = this.selectedCar();
    if (this.menuCar) { this.worldScene.remove(this.menuCar.group); this.menuCar.dispose(); }
    const cs = carState(sv, car.id);
    const paint = this.paintFor(car, cs);
    const m = (this.menuCar = new CarModel(car, { levels: cs.levels, tire: cs.tire, paint: paint.color, finish: paint.finish }));
    const p = this.track.posAt(18, this.track.width[9] / 2 + 2.6);
    const ground = this.track.height(p.x, p.z);
    m.group.position.set(p.x, ground - m.dims.yG - 0.02, p.z);
    m.group.rotation.y = p.hd + 0.35;
    m.setStaticWheels(-0.3);
    m.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.worldScene.add(m.group);
    this.menuT = 0;
  }

  enterMenu() {
    const sv = this.save.data;
    this.state = 'menu';
    this.stopRun();
    if (!this.menuCar || this.menuCar.car.id !== this.selectedCar().id) this.setupMenuScene();
    this.menuCar.group.visible = true;
    this.world.update(30, 20);
    const done = ACHIEVEMENTS.filter((a) => sv.achievements[a.id]).length;
    this.ui.setMenu({ races: sv.races || 0, gift: this.freeCarProgress(), best: sv.best[sv.mountain] || 0, car: sv.owned.length ? this.selectedCar().name : null, cash: sv.cash, hasCar: sv.owned.length > 0, ach: `${done}/${ACHIEVEMENTS.length}`, mountain: mountainById(sv.mountain).title, mountains: sv.unlocked.length, mountainTitle: 'RACING · 20 TRACKS · 8 COUNTRIES' });
    this.ui.only('menu');
    audio()?.music?.setMode('menu');
    this.platform.gameplayStop();
  }

  // ------------------------------------------------------------------ first start
  enterFirst() {
    this.state = 'first';
    this.garage.setLevel(1);
    this.garage.showLineup(STARTERS);
    this.firstIdx = 1;
    this.updateFirst();
    this.ui.only('first');
    audio()?.music?.setMode('garage');
  }
  updateFirst() {
    const car = STARTERS[this.firstIdx];
    this.garage.lineIdx = this.firstIdx;
    const st = computeStats(car, {}, 'worn');
    this.ui.setFirst(car, this.rows(st, maxStats(car)), this.firstIdx, STARTERS.length);
  }
  async chooseFirst() {
    const sv = this.save.data;
    const car = STARTERS[this.firstIdx];
    sv.owned = [car.id]; sv.selected = car.id; sv.firstStartDone = true;
    carState(sv, car.id);
    this.save.save(); this.save.flush();
    this.ui.only();
    // short garage sequence: engine starts, door opens, out onto the mountain
    const a = audio();
    a?.starter(car);
    setTimeout(() => a?.burst({ freq: 150, type: 'lowpass', dur: 1.2, gain: 0.35, buf: a.brown }), 800);
    await wait(900);
    this.garage.openDoor();
    await wait(2200);
    await this.ui.fade(true);
    this.garage.clearCars();
    this.startRun();
    await wait(200);
    this.ui.fade(false);
  }

  // ------------------------------------------------------------------ garage
  enterGarage(tab = 'upgrades') {
    const sv = this.save.data;
    this.state = 'garage';
    this.stopRun();
    this.garage.doorTarget = 0; this.garage.door = 0;
    this.garage.setLevel(sv.garageLevel);
    this.browse = this.selectedCar().id;
    this.showGarageCar(this.browse);
    this.ui.only('garage');
    audio()?.music?.setMode('garage');
    this.gtab(tab);
  }
  showGarageCar(id) {
    const sv = this.save.data, car = carById(id);
    const cs = carState(sv, id);
    const paint = this.paintFor(car, cs);
    this.garage.showCar(car, { levels: cs.levels, tire: cs.tire, paint: paint.color, finish: paint.finish });
  }
  gtab(t) {
    const ui = this.ui;
    if (t === 'drive') { this.driveFromGarage(); return; }
    if (t === 'menu') { this.ui.fade(true).then(() => { this.enterMenu(); this.ui.fade(false); }); return; }
    const wasDealer = this.tab === 'dealer';
    this.tab = t;
    ui.setGarageTab(t);
    ui.carMode(t === 'vehicles' || t === 'dealer');
    this.garage.setFocus(null);
    this.garage.setMode(t === 'dealer' ? 'dealer' : 'workshop');
    if (t === 'dealer') {
      const ex = CARS.filter((c) => c.exotic);
      if (!carById(this.browse).exotic) { this.browse = ex[0].id; }
      this.showGarageCar(this.browse);
      this.garage.setSideCars(ex.filter((c) => c.id !== this.browse));
    } else if ((t !== 'vehicles' || wasDealer) && this.browse !== this.selectedCar().id) { this.browse = this.selectedCar().id; this.showGarageCar(this.browse); }
    if (t === 'upgrades') this.renderUpgrades();
    else if (t === 'vehicles' || t === 'dealer') this.renderVehicles();
    else if (t === 'paint') this.renderPaint();
    else if (t === 'garage') this.renderGarageLevels();
  }
  header() {
    const sv = this.save.data, car = carById(this.browse || sv.selected);
    const exo = CARS.filter((c) => c.exotic);
    const titles = { upgrades: car.name, vehicles: 'SHOWROOM', dealer: 'MONTAGNA MOTORS', paint: 'PAINT SHOP', garage: GARAGE_LEVELS[sv.garageLevel - 1].name };
    const subs = { upgrades: car.cls + ' · ' + car.drive, vehicles: CARS.filter((c) => !c.exotic && sv.owned.includes(c.id)).length + ' / ' + (CARS.length - exo.length) + ' OWNED',
      dealer: 'EXOTICS · ' + exo.filter((c) => sv.owned.includes(c.id)).length + ' / ' + exo.length + ' OWNED', paint: car.name, garage: 'LEVEL ' + sv.garageLevel + ' / 5' };
    this.ui.setGarageHeader(titles[this.tab] || 'GARAGE', subs[this.tab] || '', sv.cash);
  }
  gStats(prev) {
    const car = carById(this.browse);
    const st = this.statsFor(car);
    this.ui.setGStats(`<div class="ptitle"><span>${car.name}</span><span>${st.tire}</span></div><div class="stats">${this.ui.statBlock(this.rows(st, maxStats(car, this.save.data.garageLevel), prev))}</div>`);
  }

  renderUpgrades(selected) {
    const sv = this.save.data, car = this.selectedCar(), cs = carState(sv, car.id);
    this.browse = car.id;
    this.header();
    this.gStats(this.lastStats);
    this.lastStats = null;
    const sel = selected || this.upgSel || 'engine';
    this.upgSel = sel;
    const rows = CATEGORIES.map((c) => {
      const lv = cs.levels[c.id] || 0, cap = capOf(car, c.id, sv.garageLevel), base = car.caps[c.id];
      const cost = lv < cap ? upgradeCost(car, c.id, lv, sv.garageLevel) : null;
      const pips = Array.from({ length: cap }, (_, i) => `<i class="${i < lv ? 'on' : i >= base ? 'bonus' : ''}"></i>`).join('');
      return `<div class="upg ${c.id === sel ? 'sel' : ''}" data-c="${c.id}"><div class="n">${c.name}</div><div class="lv">LV ${lv}/${cap}</div>
        <div class="part">${c.parts[Math.min(lv, c.parts.length - 1)]}</div><div class="price ${cost === null ? 'max' : cost > sv.cash ? 'no' : ''}">${cost === null ? 'MAXED' : fmtMoney(cost)}</div><div class="pips">${pips}</div></div>`;
    }).join('');
    const p = this.ui.gpanel;
    p.innerHTML = `<div class="ptitle"><span>UPGRADES</span><span>${car.name}</span></div><div class="scroll">${rows}</div><div class="detail"></div>`;
    p.querySelectorAll('.upg').forEach((el) => el.addEventListener('click', () => { audio()?.ui('click'); this.upgSel = el.dataset.c; p.querySelectorAll('.upg').forEach((x) => x.classList.toggle('sel', x === el)); this.renderUpgDetail(); }));
    this.renderUpgDetail();
  }

  renderUpgDetail() {
    const sv = this.save.data, car = this.selectedCar(), cs = carState(sv, car.id);
    const c = CATEGORIES.find((x) => x.id === this.upgSel);
    const lv = cs.levels[c.id] || 0, cap = capOf(car, c.id, sv.garageLevel);
    const cost = lv < cap ? upgradeCost(car, c.id, lv, sv.garageLevel) : null;
    const now = computeStats(car, cs.levels, cs.tire, sv.garageLevel);
    let effects = '';
    if (cost !== null) {
      const nx = computeStats(car, { ...cs.levels, [c.id]: lv + 1 }, cs.tire, sv.garageLevel);
      const items = [];
      const add = (name, a, b, unit, dec = 0, inv = false) => { const dv = b - a; if (Math.abs(dv) < (dec ? 0.05 : 0.5)) return; const good = inv ? dv < 0 : dv > 0; items.push(`<span class="${good ? 'p' : 'm'}">${dv > 0 ? '+' : '−'}${Math.abs(dv).toFixed(dec)} ${unit} ${name}</span>`); };
      add('POWER', now.hp, nx.hp, 'HP'); add('TORQUE', now.nm, nx.nm, 'NM'); add('TOP SPEED', now.top, nx.top, 'KM/H');
      if (now.t100 && nx.t100) add('0–100', now.t100, nx.t100, 'S', 1, true);
      add('GRIP', now.grip, nx.grip, ''); add('BRAKES', now.brakes, nx.brakes, ''); add('SUSPENSION', now.susp, nx.susp, ''); add('DURABILITY', now.dur, nx.dur, '');
      add('FUEL', now.fuel, nx.fuel, 'L', 1); add('WEIGHT', now.kg, nx.kg, 'KG', 0, true);
      if (c.id === 'cooling') items.push('<span class="p">+ HEAT CAPACITY</span>');
      if (c.id === 'turbo') items.push(`<span class="p">${lv === 0 ? 'FITS A TURBO · SHIFT TO BOOST' : '+ BOOST DURATION · − LAG'}</span><span class="m">+ ENGINE HEAT</span>`);
      if (c.id === 'brakes' && lv + 1 === 6) items.push('<span class="p">ABS FITTED</span>');
      if (c.id === 'transmission' && (lv + 1 === 5 || lv + 1 === 12)) items.push('<span class="p">+1 GEAR</span>');
      const t = TIRES.find((x) => x.unlock === lv + 1);
      if (c.id === 'tires' && t) items.push(`<span class="p">UNLOCKS ${t.name} TYRES</span>`);
      effects = `<div class="effects">${items.join('') || '<span class="p">IMPROVED</span>'}</div>`;
    }
    let tires = '';
    if (c.id === 'tires') {
      tires = `<div class="tires">${TIRES.map((t) => `<button data-t="${t.id}" class="${cs.tire === t.id ? 'on' : ''}" ${lv < t.unlock ? 'disabled' : ''} title="${t.desc}">${t.name}</button>`).join('')}</div>
        <p style="margin-top:-6px">${tireById(cs.tire).desc}</p>`;
    }
    const d = this.ui.gpanel.querySelector('.detail');
    d.innerHTML = `<h3>${c.name}</h3><div class="pn">${cost === null ? 'FULLY UPGRADED' : 'NEXT: ' + c.parts[Math.min(lv + 1, c.parts.length - 1)].toUpperCase()}</div><p>${c.desc}</p>${tires}${effects}
      <div class="row"><button class="btn ${cost !== null && cost <= sv.cash ? 'amber' : ''} buy" ${cost === null || cost > sv.cash ? 'disabled' : ''}>${cost === null ? 'MAXED' : 'BUY · ' + fmtMoney(cost)}</button></div>`;
    d.querySelector('.buy').addEventListener('click', () => this.buyUpgrade(c.id));
    d.querySelectorAll('.tires button').forEach((b) => b.addEventListener('click', () => {
      cs.tire = b.dataset.t; this.save.save(); audio()?.ratchet(4);
      this.garage.car.setUpgrades(cs.levels, cs.tire);
      this.renderUpgrades(c.id);
    }));
    this.garage.setFocus(c.focus === 'engine' ? 'engine' : c.focus);
  }

  async buyUpgrade(cat) {
    const sv = this.save.data, car = this.selectedCar(), cs = carState(sv, car.id);
    const lv = cs.levels[cat] || 0, cap = capOf(car, cat, sv.garageLevel);
    if (lv >= cap) return;
    const cost = upgradeCost(car, cat, lv, sv.garageLevel);
    if (cost > sv.cash) { audio()?.ui('deny'); return; }
    if (this.installingNow) return;
    this.installingNow = true;
    const prev = this.statsFor(car);
    sv.cash -= cost; cs.levels[cat] = lv + 1; sv.stats.upgrades++;
    if (cat === 'tires') { const t = TIRES.filter((x) => x.unlock <= lv + 1).pop(); if (t && TIRES.indexOf(t) > TIRES.findIndex((x) => x.id === cs.tire) && cs.tire !== 'race') cs.tire = cs.tire === 'worn' ? 'street' : cs.tire; }
    this.save.save();
    audio()?.ui('buy');
    this.ui.installing(true);
    this.header();
    await this.garage.install(cat);
    this.garage.car.setUpgrades(cs.levels, cs.tire);
    this.ui.installing(false);
    this.lastStats = prev;
    this.checkAchievements(null);
    this.renderUpgrades(cat);
    this.installingNow = false;
  }

  // performance index and class letter (like a racing game's car classes)
  perfIndex(st) {
    const pi = Math.round(st.top * 0.8 + st.grip * 2 + (st.hp / st.kg) * 400 + (st.brakes || 60) * 0.6);
    const letter = pi < 300 ? 'D' : pi < 400 ? 'C' : pi < 500 ? 'B' : pi < 620 ? 'A' : pi < 760 ? 'S1' : pi < 920 ? 'S2' : 'X';
    return { pi, letter };
  }
  carSil(car) {
    this.silCache = this.silCache || {};
    if (this.silCache[car.id]) return this.silCache[car.id];
    const ph = computeStats(car, {}, 'worn').phys;
    const d = carDims(car, ph), T = TYPE[car.model.type] || TYPE.hatch;
    const z = (u) => d.zR + u * d.L;
    const back = T.bed ? T.back : Math.max(0.02, T.back);
    const roofY = d.roof, belt = d.yBelt;
    const body = [[d.zR + 0.05, d.bottom + 0.05], [d.zR, d.yTail - 0.05], [z(back), d.yTail], [z(T.roofR), roofY], [z(T.roofF), roofY], [z(T.ws), belt], [z(0.97), d.yNose], [d.zF, d.yNose - 0.1], [d.zF - 0.03, d.bottom + 0.06]];
    const ins = 0.05;
    const glass = [[z(back) + 0.12, d.yTail + 0.04], [z(T.roofR) + 0.04, roofY - ins], [z(T.roofF) - 0.03, roofY - ins], [z(T.ws) - 0.1, belt + 0.04]];
    const shoulder = [[d.zR + 0.02, d.yTail - 0.12], [z(T.ws), belt - 0.06], [d.zF - 0.06, d.yNose - 0.14]];
    const sil = { body, pts: glass, shoulder, wheels: [[d.a, d.wcY, d.r], [-d.b, d.wcY, d.r]], z0: d.zR, z1: d.zF, y0: d.wcY - d.r, y1: roofY };
    this.silCache[car.id] = sil;
    return sil;
  }
  carouselList() {
    const dealer = this.tab === 'dealer';
    return CARS.filter((c) => !!c.exotic === dealer).sort((a, b) => a.price - b.price);
  }
  renderVehicles() {
    const sv = this.save.data;
    this.header();
    const list = this.carouselList();
    if (!list.some((c) => c.id === this.browse)) { this.browse = list[0].id; this.showGarageCar(this.browse); }
    const cars = list.map((c) => {
      const own = sv.owned.includes(c.id), cur = sv.selected === c.id;
      const price = Math.round(c.price * carDiscount(sv.garageLevel));
      const { pi, letter } = this.perfIndex(computeStats(c, {}, 'street'));
      return { id: c.id, name: c.name, cls: c.cls, price: fmtMoney(price), state: cur ? 'driving' : own ? 'owned' : price > sv.cash ? 'nocash' : 'buy', pi, letter, sil: this.carSil(c), color: '#' + c.model.paint.toString(16).padStart(6, '0') };
    });
    const c = carById(this.browse);
    const own = sv.owned.includes(c.id), cur = sv.selected === c.id;
    const price = Math.round(c.price * carDiscount(sv.garageLevel));
    const cs = own ? carState(sv, c.id) : null;
    const st = own ? computeStats(c, cs.levels, cs.tire, sv.garageLevel) : computeStats(c, {}, 'street');
    const mx = maxStats(c, sv.garageLevel);
    const { pi, letter } = this.perfIndex(st);
    // bars are scaled against the fastest car in the game
    const R = { top: 650, acc: 2.2, grip: 100, brakes: 100, dur: 100 };
    const acc = (s) => clamp((12 - (s.t100 || 12)) / (12 - R.acc), 0.03, 1);
    const bars = [
      { label: 'TOP SPEED', v: clamp(st.top / R.top, 0, 1), max: clamp(mx.top / R.top, 0, 1), txt: Math.round(st.top) + ' KM/H' },
      { label: '0–100', v: acc(st), max: acc(mx), txt: st.t100 ? st.t100.toFixed(1) + ' S' : '—' },
      { label: 'POWER', v: clamp(st.hp / 1600, 0, 1), max: clamp(mx.hp / 1600, 0, 1), txt: Math.round(st.hp) + ' HP' },
      { label: 'HANDLING', v: clamp(st.grip / R.grip, 0, 1), max: clamp(mx.grip / R.grip, 0, 1), txt: String(Math.round(st.grip)) },
      { label: 'BRAKING', v: clamp(st.brakes / R.brakes, 0, 1), max: clamp(mx.brakes / R.brakes, 0, 1), txt: String(Math.round(st.brakes)) },
      { label: 'DURABILITY', v: clamp(st.dur / R.dur, 0, 1), max: clamp(mx.dur / R.dur, 0, 1), txt: String(Math.round(st.dur)) },
    ];
    this.ui.carousel({
      cars, sel: c.id,
      detail: { name: c.name, cls: c.cls, drive: c.drive + ' · ' + Math.round(st.kg) + ' KG', desc: c.desc, traits: c.traits || [], pi, letter, bars,
        price: fmtMoney(price), need: fmtMoney(price - sv.cash), action: cur ? 'current' : own ? 'select' : price > sv.cash ? 'nocash' : 'buy' },
    });
    this.gStats();
  }
  crStep(dir) {
    const list = this.carouselList();
    const i = Math.max(0, list.findIndex((c) => c.id === this.browse));
    const n = list[(i + dir + list.length) % list.length];
    if (!n || n.id === this.browse) return;
    audio()?.ui('hover');
    this.crSel(n.id);
  }
  crSel(id) {
    this.browse = id;
    this.showGarageCar(id);
    if (this.tab === 'dealer') this.garage.setSideCars(CARS.filter((c) => c.exotic && c.id !== id));
    this.renderVehicles();
  }
  crAct() {
    const sv = this.save.data, c = carById(this.browse);
    if (!c) return;
    const own = sv.owned.includes(c.id);
    if (sv.selected === c.id) return;
    if (!own) {
      const price = Math.round(c.price * carDiscount(sv.garageLevel));
      if (price > sv.cash) { audio()?.ui('back'); return; }
      sv.cash -= price; sv.owned.push(c.id); carState(sv, c.id);
      audio()?.ui('buy'); audio()?.starter(c);
      this.ui.toast(`<b>${c.name}</b> IS YOURS`);
    } else audio()?.ui('click');
    sv.selected = c.id;
    this.save.save();
    this.checkAchievements(null);
    this.renderVehicles();
    this.header();
  }

  renderPaint() {
    const sv = this.save.data, car = this.selectedCar(), cs = carState(sv, car.id);
    this.header();
    this.gStats();
    const p = this.ui.gpanel;
    const sw = PAINTS.map((pt) => {
      const lock = FINISHES[pt.finish].level > sv.garageLevel;
      const col = pt.color ?? car.model.paint;
      const hex = '#' + col.toString(16).padStart(6, '0');
      const bg = pt.finish === 'metallic' || pt.finish === 'pearl' || pt.finish === 'candy' ? `linear-gradient(135deg, ${hex}, #ffffff33 55%, ${hex})` : pt.finish === 'chrome' ? 'linear-gradient(135deg,#eee,#666,#ddd)' : hex;
      return `<div class="sw ${cs.paint === pt.id ? 'on' : ''} ${lock ? 'lock' : ''}" data-id="${pt.id}" style="background:${bg}" title="${pt.name}"><span>${pt.name}</span></div>`;
    }).join('');
    p.innerHTML = `<div class="ptitle"><span>PAINT</span><span>${car.name}</span></div><div class="scroll"><div class="swatches" style="row-gap:26px">${sw}</div></div><div class="detail"></div>`;
    const detail = (id) => {
      const pt = PAINTS.find((x) => x.id === id);
      const owned = cs.paints.includes(id) || pt.cost === 0;
      const lock = FINISHES[pt.finish].level > sv.garageLevel;
      const d = p.querySelector('.detail');
      d.innerHTML = `<h3>${pt.name}</h3><div class="pn">${pt.finish.toUpperCase()} FINISH</div>${lock ? `<p>Requires garage level ${FINISHES[pt.finish].level}.</p>` : ''}
        <div class="row"><button class="btn ${owned ? 'main' : pt.cost <= sv.cash ? 'amber' : ''} act" ${lock || (!owned && pt.cost > sv.cash) || cs.paint === id ? 'disabled' : ''}>${cs.paint === id ? 'APPLIED' : owned ? 'APPLY' : 'BUY · ' + fmtMoney(pt.cost)}</button></div>`;
      const b = d.querySelector('.act');
      b.addEventListener('click', () => {
        if (!owned) { sv.cash -= pt.cost; cs.paints.push(id); }
        cs.paint = id; this.save.save();
        audio()?.burst({ freq: 3000, q: 0.5, type: 'highpass', dur: 0.8, gain: 0.12, attack: 0.1, buf: audio().pink });
        const pf = this.paintFor(car, cs);
        this.garage.car.setPaint(pf.color, pf.finish);
        this.renderPaint();
      });
      // preview without buying
      const pf = { color: pt.color ?? car.model.paint, finish: pt.color ? pt.finish : car.model.sport ? 'metallic' : 'solid' };
      this.garage.car.setPaint(pf.color, pf.finish);
    };
    p.querySelectorAll('.sw').forEach((el) => el.addEventListener('click', () => {
      audio()?.ui('click');
      p.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === el));
      detail(el.dataset.id);
    }));
    detail(cs.paint);
    this.garage.setFocus(null);
  }

  renderGarageLevels() {
    const sv = this.save.data;
    this.header();
    this.ui.setGStats('');
    const p = this.ui.gpanel;
    const rows = GARAGE_LEVELS.map((g) => `<div class="gl ${g.level < sv.garageLevel ? 'done' : g.level === sv.garageLevel ? 'cur' : ''}"><h4><span>${g.level}. ${g.name}</span><span>${g.level <= sv.garageLevel ? (g.level === sv.garageLevel ? 'CURRENT' : '✓') : fmtMoney(g.cost)}</span></h4><ul>${g.perks.map((x) => `<li>${x}</li>`).join('')}</ul></div>`).join('');
    const next = GARAGE_LEVELS[sv.garageLevel];
    p.innerHTML = `<div class="ptitle"><span>WORKSHOP</span><span>LEVEL ${sv.garageLevel}/5</span></div><div class="scroll glevels">${rows}</div>
      <div class="detail">${next ? `<h3>${next.name}</h3><p>Expand the workshop. Unlocks new paint finishes, tuning headroom and better payouts.</p><div class="row"><button class="btn ${next.cost <= sv.cash ? 'amber' : ''} act" ${next.cost > sv.cash ? 'disabled' : ''}>UPGRADE · ${fmtMoney(next.cost)}</button></div>` : '<h3>TOP OF THE LINE</h3><p>Nothing left to build. The mountain is the only thing standing between you and everything.</p>'}</div>`;
    const b = p.querySelector('.act');
    if (b) b.addEventListener('click', async () => {
      if (next.cost > sv.cash) return;
      sv.cash -= next.cost; sv.garageLevel = next.level; this.save.save();
      audio()?.ui('buy');
      await this.ui.fade(true);
      this.garage.setLevel(sv.garageLevel);
      this.showGarageCar(this.selectedCar().id);
      audio()?.metal(0.5, 200); audio()?.impactWrench(0.8, 0.2);
      this.ui.toast(`WORKSHOP UPGRADED · <b>${next.name}</b>`);
      this.checkAchievements(null);
      this.renderGarageLevels();
      this.ui.fade(false);
    });
  }

  async driveFromGarage() {
    if (!this.save.data.owned.length) return;
    this.garage.setFocus(null);
    if (this.garage.mode === 'dealer' || this.browse !== this.selectedCar().id) {
      this.tab = 'upgrades'; this.ui.setGarageTab('upgrades');
      this.garage.setMode('workshop');
      this.browse = this.selectedCar().id; this.showGarageCar(this.browse);
    }
    this.garage.openDoor();
    audio()?.starter(this.selectedCar());
    await wait(1400);
    await this.ui.fade(true);
    this.garage.clearCars();
    this.startRun();
    await wait(150);
    this.ui.fade(false);
  }

  // ------------------------------------------------------------------ runs
  startRun() {
    const sv = this.save.data;
    this.state = 'run';
    this.paused = false;
    if (this.menuCar) this.menuCar.group.visible = false;
    if (this.mountainId !== sv.mountain) this.loadMountain(sv.mountain);
    if (!this.run || this.run instanceof Race) this.run = new Run(this);
    this.run.camMode = sv.settings.camera;
    this.run.start(this.selectedCar().id);
    audio()?.ambience && audio().ambience.update(0, { room: 0 });
  }
  stopRun() {
    if (this.run && this.run.vehicle) this.run.stop();
    this.ui.show('hud', false); this.ui.show('touch', false); this.ui.show('summary', false); this.ui.show('pause', false); this.ui.show('count', false); this.ui.show('raceres', false);
  }
  retry() {
    this.ui.show('summary', false); this.ui.show('raceres', false);
    if (this.run.model) this.run.restart();
    else this.startRun();
  }
  pause(on) {
    if (this.state !== 'run' || (this.run && this.run.ended)) return;
    this.paused = on;
    this.ui.show('pause', on);
    if (on) { this.platform.gameplayStop(); this.sound.ctx && this.sound.ctx.suspend(); }
    else { this.platform.gameplayStart(); this.sound.ctx && this.sound.ctx.resume(); }
  }

  // ------------------------------------------------------------------ progression
  checkAchievements(run) {
    const sv = this.save.data;
    for (const a of ACHIEVEMENTS) {
      if (sv.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(sv, run); } catch (e) { ok = false; }
      if (ok) {
        sv.achievements[a.id] = Date.now();
        sv.cash += a.reward; sv.totalEarned += a.reward;
        this.ui.toast(`ACHIEVEMENT · <b>${a.name}</b> · +${fmtMoney(a.reward)}`, 4200);
        audio()?.record();
      }
    }
    this.save.save();
  }

  // "Two more runs until …" — the nearest affordable goal
  nextGoalText() {
    const sv = this.save.data, car = this.selectedCar(), cs = carState(sv, car.id);
    const goals = [];
    for (const c of CATEGORIES) {
      const lv = cs.levels[c.id] || 0;
      if (lv < capOf(car, c.id, sv.garageLevel)) goals.push({ name: `${c.name} LV ${lv + 1}`, cost: upgradeCost(car, c.id, lv, sv.garageLevel) });
    }
    for (const c of CARS) if (!sv.owned.includes(c.id)) goals.push({ name: `THE ${c.name}`, cost: Math.round(c.price * carDiscount(sv.garageLevel)), car: true });
    const gl = GARAGE_LEVELS[sv.garageLevel];
    if (gl) goals.push({ name: gl.name, cost: gl.cost });
    const affordable = goals.filter((g) => g.cost <= sv.cash).sort((a, b) => b.cost - a.cost);
    const later = goals.filter((g) => g.cost > sv.cash).sort((a, b) => a.cost - b.cost);
    const lastRun = this.run && this.run.lastTotal ? this.run.lastTotal : Math.max(400, sv.totalEarned / Math.max(1, sv.stats.runs));
    if (affordable.length) {
      const best = affordable.find((g) => g.car) || affordable[0];
      return `You can afford <b>${best.name}</b> right now.`;
    }
    if (later.length) {
      const g = later[0];
      const runs = Math.max(1, Math.ceil((g.cost - sv.cash) / lastRun));
      return runs === 1 ? `One more run until <b>${g.name}</b> (${fmtMoney(g.cost)}).` : `About ${runs} more runs until <b>${g.name}</b> (${fmtMoney(g.cost)}).`;
    }
    return '';
  }

  // ------------------------------------------------------------------ ui wiring
  wireUI() {
    const ui = this.ui;
    ui.on('menu', (a) => {
      const sv = this.save.data;
      if (a === 'race') this.ui.fade(true).then(() => { this.openRaceSelect(); this.ui.fade(false); });
      else if (a === 'online') this.openOnline();
      else if (a === 'continue') { if (!sv.owned.length) this.enterFirst(); else this.ui.fade(true).then(() => { this.startRun(); this.ui.fade(false); }); }
      else if (a === 'garage') this.ui.fade(true).then(() => { this.enterGarage('upgrades'); this.ui.fade(false); });
      else if (a === 'vehicles') this.ui.fade(true).then(() => { this.enterGarage('vehicles'); this.ui.fade(false); });
      else if (a === 'settings') this.openSettings();
      else if (a === 'achievements') ui.achievements(ACHIEVEMENTS.map((x) => ({ ...x, done: !!sv.achievements[x.id] })));
      else if (a === 'credits') ui.credits();
      else if (a === 'mountain') this.switchMountain();
    });
    ui.on('firstNav', (d) => { this.firstIdx = (this.firstIdx + d + STARTERS.length) % STARTERS.length; this.updateFirst(); });
    ui.on('firstSelect', () => this.chooseFirst());
    ui.on('gtab', (t) => this.gtab(t));
    ui.on('crSel', (id) => this.crSel(id));
    ui.on('podiumSkip', () => { if (this.run && this.run.pres) this.run.pres.endPodium(); });
    ui.on('crStep', (d) => this.crStep(d));
    ui.on('crAct', () => this.crAct());
    ui.on('retry', () => this.retry());
    ui.on('raceSel', (id) => { this.raceSel = id; this.renderRaceSelect(); });
    ui.on('raceOpp', (d) => { this.raceOpp = clamp((this.raceOpp ?? 5) + d, 0, 7); this.renderRaceSelect(); });
    ui.on('raceGo', (id) => this.startRace(id));
    ui.on('raceBack', () => this.ui.fade(true).then(() => { this.enterMenu(); this.ui.fade(false); }));
    ui.on('raceAgain', () => { if (this.run && this.run.cfg && this.run.cfg.net) return; this.ui.show('raceres', false); if (this.run instanceof Race) this.run.restart(); });
    // online lobbies
    const olTry = async (fn) => {
      if (this.olBusy) return;
      this.olBusy = true; this.olMsg = ''; this.renderOnline();
      try { await fn(); } catch (e) { this.olMsg = String((e && e.message) || e).toUpperCase().slice(0, 80); }
      this.olBusy = false; this.renderOnline();
    };
    ui.on('olName', (v) => { this.online.setName(v); });
    ui.on('olQuick', () => olTry(() => this.online.quick(this.raceSel || this.save.data.lastMap || MAPS[0].id)));
    ui.on('olHost', (pub) => olTry(() => this.online.host(this.raceSel || this.save.data.lastMap || MAPS[0].id, pub)));
    ui.on('olJoin', (code) => olTry(() => this.online.join(code)));
    ui.on('olLeave', () => olTry(() => this.online.leave()));
    ui.on('olReady', () => this.online.setReady(!this.online.myReady));
    ui.on('olMap', (id) => this.online.setMap(id));
    ui.on('olStart', () => this.online.startRace());
    ui.on('olBack', () => { if (this.online) this.online.leave(); this.ui.fade(true).then(() => { this.enterMenu(); this.ui.fade(false); }); });
    ui.on('olLobby', () => { this.ui.show('raceres', false); this.openOnline(); });
    ui.on('raceTracks', () => this.ui.fade(true).then(() => { this.ui.show('raceres', false); this.openRaceSelect(); this.ui.fade(false); }));
    ui.on('toGarage', () => this.ui.fade(true).then(() => { this.enterGarage(); this.ui.fade(false); }));
    ui.on('pause', () => this.pause(true));
    ui.on('pauseMenu', (a) => {
      if (a === 'resume') this.pause(false);
      else if (a === 'restart') { this.pause(false); if (!(this.run.cfg && this.run.cfg.net)) this.run.restart(); }
      else if (a === 'settings') this.openSettings();
      else if (a === 'garage') { this.pause(false); this.ui.fade(true).then(() => { this.enterGarage(); this.ui.fade(false); }); }
    });
  }

  async switchMountain() {
    const sv = this.save.data;
    const i = sv.unlocked.indexOf(sv.mountain);
    sv.mountain = sv.unlocked[(i + 1) % sv.unlocked.length];
    this.save.save();
    await this.ui.fade(true);
    this.loadMountain(sv.mountain);
    this.world.update(30, 25);
    this.setupMenuScene();
    this.enterMenu();
    this.ui.fade(false);
  }

  openSettings() {
    const sv = this.save.data;
    this.ui.settings(sv.settings, (k, v) => {
      if (k === 'reset') { this.save.reset(); location.reload(); return; }
      sv.settings[k] = v;
      if (k === 'master' || k === 'music' || k === 'sfx') this.sound.setVolumes({ [k]: v });
      if (k === 'camera' && this.run) this.run.camMode = v;
      if (k === 'assist' && this.run && this.run.vehicle) this.run.vehicle.assist = v ? 1 : 0;
      if (k === 'quality') this.ui.toast('GRAPHICS CHANGE APPLIES AFTER <b>RELOAD</b>');
      this.save.save();
    });
  }

  navActive() {
    if (this.state === 'boot') return false;
    if (this.state === 'run') return this.paused || this.ui.modalOpen || (this.run && this.run.ended);
    return true;
  }
  cycleTab(d) {
    const tabs = ['upgrades', 'vehicles', 'dealer', 'paint', 'garage'];
    const i = Math.max(0, tabs.indexOf(this.tab));
    audio()?.ui('click');
    this.gtab(tabs[(i + d + tabs.length) % tabs.length]);
  }

  // ------------------------------------------------------------------ loop
  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      let dt = Math.min(0.05, this.clock.getDelta());
      if (this.debug.fixed) dt = 1 / 30;
      this.input.update(dt);
      try { this.update(dt); } catch (e) { console.error(e); }
      this.input.endFrame();
    };
    tick();
  }

  update(dt) {
    const inp = this.input;
    if (inp.wasPressed('Escape')) {
      if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.state === 'run' && !(this.run && this.run.ended)) this.pause(!this.paused);
      else if (this.state === 'garage' && !this.installingNow) { audio()?.ui('back'); this.gtab('menu'); }
      else if (this.state === 'racesel') { audio()?.ui('back'); this.ui.emit('raceBack'); }
      else if (this.state === 'online' && !this.ui.modalOpen) { audio()?.ui('back'); this.ui.emit('olBack'); }
    }
    if (this.state === 'run' && this.run && this.run.ended && inp.wasPressed('KeyR') && !(this.run.cfg && this.run.cfg.net)) this.retry();
    if (this.state === 'run' && this.run && this.run.ended && inp.wasPressed('KeyG')) this.ui.emit('toGarage');
    if (this.state === 'first') {
      if (inp.wasPressed('ArrowLeft', 'KeyA')) { this.firstIdx = (this.firstIdx + 2) % 3; this.updateFirst(); audio()?.ui('click'); }
      if (inp.wasPressed('ArrowRight', 'KeyD')) { this.firstIdx = (this.firstIdx + 1) % 3; this.updateFirst(); audio()?.ui('click'); }
    }
    const r = this.renderer;
    if (this.state === 'garage' || this.state === 'first') {
      this.garage.update(dt, this.camera);
      audio()?.ambience?.update(dt, { room: 1, wind: 0.05 });
      audio()?.setReverb(0.25);
      this.post.enabled = this.quality !== 'low';
      this.post.render(this.garage.scene, this.camera, { bloom: 0.45, warm: 0.6, vig: 0.42 });
      return;
    }
    if (this.state === 'run' && this.run) {
      if (!this.paused) this.run.update(dt);
      const v = this.run.vehicle;
      const s = this.run.maxS;
      const q = v.lastQuery;
      const inTunnel = this.track.tunnel[q.idx] && Math.abs(q.d) < q.halfW + 2 ? 1 : 0;
      this.env.update(this.paused ? 0 : dt, this.track, Math.max(s, q.s), this.camera, this.run.model ? this.run.model.group.position : this.camera.position, inTunnel);
      this.world.update2(dt, this.camera.position, this.env.look);
      this.autoQuality(dt);
      this.post.enabled = this.quality !== 'low';
      this.post.render(this.worldScene, this.camera, this.postLook(this.env.look));
      return;
    }
    // menu / boot: slow orbit around the parked car
    this.menuT = (this.menuT || 0) + dt;
    if (this.menuCar) {
      const c = this.menuCar.group.position;
      const a = 0.9 + this.menuT * 0.05;
      const rad = 7.5 + Math.sin(this.menuT * 0.07) * 1.2;
      this.camera.position.set(c.x + Math.sin(a) * rad, c.y + 1.4 + Math.sin(this.menuT * 0.11) * 0.3, c.z + Math.cos(a) * rad);
      const th = this.track.height(this.camera.position.x, this.camera.position.z);
      if (this.camera.position.y < th + 0.8) this.camera.position.y = th + 0.8;
      this.camera.lookAt(c.x - 1.5 * Math.cos(a), c.y + 0.6, c.z + 1.5 * Math.sin(a));
      this.camera.fov = 46; this.camera.updateProjectionMatrix();
      this.env.update(dt, this.track, 40, this.camera, c, 0);
      if (audio()?.ambience) audio().ambience.update(dt, { wind: 0.45, birds: 0.8, trees: 0.7 });
      audio()?.setReverb(0);
      // cooling engine ticks
      if (audio() && Math.random() < dt * 0.25) audio().tone({ freq: 2800 + Math.random() * 1500, type: 'triangle', dur: 0.02, gain: 0.02 });
    }
    this.world.update2(dt, this.camera.position, this.env.look);
    this.post.enabled = this.quality !== 'low';
    this.post.render(this.worldScene, this.camera, this.postLook(this.env.look));
  }

  // grading follows the light: golden hour warmer with more glow, rain flatter and cooler
  postLook(L) {
    if (!L) return null;
    const rain = Math.max(L.rain || 0, L.storm || 0), low = 1 - clamp(((L.sunElev ?? 30) - 4) / 40, 0, 1);
    const pl = this._pl || (this._pl = {});
    pl.bloom = 0.42 + low * 0.38 - rain * 0.15; pl.warm = 0.45 + low * 0.95 - rain * 0.5;
    pl.contrast = 1.02 + low * 0.02 - rain * 0.03; pl.sat = 1.07 + low * 0.05 - rain * 0.16; pl.vig = 0.2 + rain * 0.1;
    return pl;
  }
  autoQuality(dt) {
    if (this.save.data.settings.quality !== 'auto') return;
    this.fpsT = (this.fpsT || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsT < 4) return;
    const fps = this.fpsN / this.fpsT;
    this.fpsT = 0; this.fpsN = 0;
    if (fps < 38 && this.renderScale > 0.6) { this.renderScale = Math.max(0.6, this.renderScale - 0.15); this.resize(); }
    else if (fps > 57 && this.renderScale < 1) { this.renderScale = Math.min(1, this.renderScale + 0.1); this.resize(); }
  }
}

const game = new Game();
window.__game = game;
game.boot().catch((e) => {
  console.error(e);
  const s = document.querySelector('#boot .status');
  if (s) s.textContent = 'THIS DEVICE COULD NOT START WEBGL';
});

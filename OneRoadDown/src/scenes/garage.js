// The workshop: a real 3D room that grows with the garage level (old shed → premium hall),
// plus the dealer showroom. Hosts the selected car with a free orbit camera, detail views
// (front / rear / side / wheel / cockpit / engine bay), six selectable light modes, the
// car's lamps and a startable engine.
//
// Hitch-free by construction: every light lives in one persistent rig that never changes
// count, the six studio reflections are pre-built PMREM textures of identical size, and a
// light mode is only a set of values (colours, intensities, roughness) eased over a second.

import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { mats } from '../gfx/materials.js';
import * as TX from '../gfx/textures.js';
import { CarModel, roundedBox, beam, buildWheel } from '../models/carModel.js';
import { clamp, lerp, damp, rng } from '../core/util.js';
import { audio, EngineVoice } from '../audio/audio.js';
import { Particles } from '../gfx/particles.js';
import { cloneAsset, hasAsset } from '../world/assets.js';

const ROOM = { w: 13, d: 15, h: 5.2 };
const SHOW = { w: 24, d: 18, h: 6.5 };
const HALL = { w: 26, d: 22, h: 7.2 };

// ------------------------------------------------------------------ light modes
export const LIGHT_MODES = [
  { id: 'studio', name: 'CLEAN WHITE STUDIO', short: 'STUDIO', swatch: 'linear-gradient(135deg,#ffffff 20%,#b9bec6)' },
  { id: 'warm', name: 'LUXURY WARM LIGHT', short: 'WARM', swatch: 'linear-gradient(135deg,#ffd59a 15%,#8a5426)' },
  { id: 'neon', name: 'NEON BLUE', short: 'NEON', swatch: 'linear-gradient(135deg,#3fe0ff 10%,#2b2fb8 70%,#b040ff)' },
  { id: 'red', name: 'RED PERFORMANCE', short: 'RED', swatch: 'linear-gradient(135deg,#ff5a46 10%,#5a0a06)' },
  { id: 'cinema', name: 'DARK CINEMATIC', short: 'CINEMA', swatch: 'radial-gradient(circle at 35% 30%,#cfd6e6 0 12%,#2a2d34 40%,#040405)' },
  { id: 'daylight', name: 'DAYLIGHT SHOWROOM', short: 'DAYLIGHT', swatch: 'linear-gradient(135deg,#cfe8ff 15%,#fff2dc)' },
];
export const lightModeById = (id) => LIGHT_MODES.find((m) => m.id === id) || LIGHT_MODES[0];

// values for the premium hall; other rooms scale them with their own factors.
// [colour, intensity]; env.* are the studio panels baked into the reflection texture.
const MODE = {
  studio: {
    hemi: [0xf2f4f8, 0x9a9da2, 1.0], key: [0xffffff, 231], rimA: [0xffffff, 90], rimB: [0xffffff, 90], fill: [0xffffff, 26], sun: [0xffffff, 0],
    led: [0xffffff, 1.8], panel: [0xffffff, 2.4], sky: [0xe6ebf0, 1.0], wall: 0xd4d6d9, floor: 0x8e9196, rough: 0.2, bg: 0xc9ccd0,
    env: { wall: [0xc8cacd, 1.1], floor: [0x707276, 1], back: [0x9a9c9f, 1], panel: [0xffffff, 5], led: [0xffffff, 4], win: [0xeef2f6, 2.2] }, envI: 0.95,
    look: { exposure: 0.9, bloom: 0.14, warm: 0.15, contrast: 1.02, sat: 1.0, vig: 0.1 },
  },
  warm: {
    hemi: [0xffd9b0, 0x3a2618, 0.64], key: [0xffd9a8, 237], rimA: [0xffb060, 102], rimB: [0xffc890, 72], fill: [0xffb070, 30], sun: [0xffc080, 0],
    led: [0xffa040, 2.4], panel: [0xffe0b8, 1.5], sky: [0xc08050, 0.55], wall: 0x6a5240, floor: 0x3a2e26, rough: 0.22, bg: 0x1c140e,
    env: { wall: [0x5a4030, 0.8], floor: [0x2a1e16, 1], back: [0x3a2618, 1], panel: [0xffd8a8, 5], led: [0xffa040, 5], win: [0xd08a50, 1.0] }, envI: 0.9,
    look: { exposure: 1.0, bloom: 0.27, warm: 0.9, contrast: 1.03, sat: 1.06, vig: 0.22 },
  },
  neon: {
    hemi: [0x5a78ff, 0x0a0c22, 0.44], key: [0xdde8ff, 220], rimA: [0x20d0ff, 168], rimB: [0xb040ff, 132], fill: [0x3a60ff, 22], sun: [0x4060ff, 0],
    led: [0x10b8ff, 4.5], panel: [0x9ac8ff, 0.9], sky: [0x1a2850, 0.4], wall: 0x14161c, floor: 0x14161c, rough: 0.16, bg: 0x04060c,
    env: { wall: [0x0c1020, 1], floor: [0x06080e, 1], back: [0x080a14, 1], panel: [0xa8d0ff, 3.5], led: [0x10b8ff, 7], win: [0x203868, 0.8] }, envI: 1.0,
    look: { exposure: 1.05, bloom: 0.43, warm: 0.0, contrast: 1.05, sat: 1.12, vig: 0.28 },
  },
  red: {
    hemi: [0xff7060, 0x1a0606, 0.36], key: [0xfff0ea, 231], rimA: [0xff2a18, 180], rimB: [0xff5030, 132], fill: [0xff3020, 20], sun: [0xff4020, 0],
    led: [0xff1808, 4.2], panel: [0xffd8d0, 0.9], sky: [0x401010, 0.35], wall: 0x18100f, floor: 0x161012, rough: 0.16, bg: 0x0a0303,
    env: { wall: [0x200a08, 1], floor: [0x0a0606, 1], back: [0x140606, 1], panel: [0xfff0e8, 3.5], led: [0xff1808, 7], win: [0x501810, 0.6] }, envI: 1.0,
    look: { exposure: 1.05, bloom: 0.41, warm: 0.35, contrast: 1.06, sat: 1.1, vig: 0.3 },
  },
  cinema: {
    hemi: [0x8a94a8, 0x050506, 0.2], key: [0xf4f6ff, 352], rimA: [0xc8d8ff, 156], rimB: [0xffffff, 132], fill: [0xb0c0e0, 4], sun: [0xffffff, 0],
    led: [0xe8eeff, 0.45], panel: [0xffffff, 0.35], sky: [0x0c1018, 0.25], wall: 0x0e0f12, floor: 0x0c0d10, rough: 0.14, bg: 0x020203,
    env: { wall: [0x0a0b0d, 1], floor: [0x050506, 1], back: [0x060607, 1], panel: [0xffffff, 6], led: [0xd8e4ff, 1.4], win: [0x101420, 0.3] }, envI: 0.95,
    look: { exposure: 1.08, bloom: 0.28, warm: 0.1, contrast: 1.08, sat: 0.96, vig: 0.42 },
  },
  daylight: {
    hemi: [0xd6e8ff, 0x7a7064, 1.16], key: [0xfff6ea, 143], rimA: [0xffffff, 54], rimB: [0xdfeaff, 54], fill: [0xfff4e6, 18], sun: [0xfff0dc, 2.6],
    led: [0xffffff, 0.8], panel: [0xffffff, 1.4], sky: [0xffffff, 1.6], wall: 0xe6e3dc, floor: 0x9a9894, rough: 0.24, bg: 0xdfe8ee,
    env: { wall: [0xd8d6d0, 1.2], floor: [0x7a7874, 1], back: [0xb0aea8, 1], panel: [0xffffff, 4], led: [0xffffff, 1.5], win: [0xf0f6ff, 4.5] }, envI: 1.0,
    look: { exposure: 0.88, bloom: 0.17, warm: 0.3, contrast: 1.02, sat: 1.04, vig: 0.12 },
  },
};
// low quality keeps three reflection textures (memory on phones): modes share the closest
const ENV_LOW = { studio: 'studio', daylight: 'studio', warm: 'warm', neon: 'cinema', red: 'cinema', cinema: 'cinema' };

// ------------------------------------------------------------------ camera presets
export const CAM_VIEWS = [
  { id: 'free', name: 'FREE' },
  { id: 'front', name: 'FRONT' },
  { id: 'rear', name: 'REAR' },
  { id: 'side', name: 'SIDE' },
  { id: 'wheel', name: 'WHEEL' },
  { id: 'cockpit', name: 'COCKPIT' },
  { id: 'engine', name: 'ENGINE' },
];

// ------------------------------------------------------------------ rims
export const RIMS = [
  { id: 'factory', name: 'FACTORY', cost: 0 },
  { id: 'alloy', name: 'SPORT ALLOY', cost: 2500 },
  { id: 'dish', name: 'DEEP DISH', cost: 4000 },
  { id: 'rally', name: 'RALLY', cost: 3000 },
  { id: 'beadlock', name: 'BEADLOCK', cost: 3500 },
  { id: 'offroad', name: 'OFF-ROAD', cost: 2500 },
  { id: 'hubcap', name: 'CLASSIC HUBCAP', cost: 800 },
  { id: 'steel', name: 'STEELIES', cost: 400 },
];
// Swap the four wheels of a car model for another rim style (null / 'factory' = the car's own).
export function applyRim(model, style) {
  if (!model || !model.wheels) return;
  const md = model.car.model;
  const want = !style || style === 'factory' ? md.rim : style;
  const cur = model.rimStyle || md.rim;
  if (want === cur) { model.rimStyle = cur; return; }
  const cast = model.wheels[0] && model.wheels[0].wg.userData.tire.castShadow;
  for (const w of model.wheels) {
    const old = w.wg;
    const wg = buildWheel(model.dims.r, model.wheelWidth, want, 'street', md.sport);
    if (!w.left) { wg.userData.spin.rotation.y = Math.PI; wg.userData.caliper.scale.x = -1; }
    wg.userData.spin.rotation.x = old.userData.spin.rotation.x;
    wg.traverse((o) => { if (o.isMesh) { o.castShadow = cast !== false; o.receiveShadow = true; } });
    w.pivot.remove(old);
    w.pivot.add(wg);
    w.wg = wg;
    for (const k of ['tireMat', 'caliperMat', 'rimMat']) { const m = old.userData[k]; if (m && m !== wg.userData[k]) m.dispose(); }
  }
  model.rimStyle = want;
  model.setUpgrades(model.levels, model.tireId);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const col = (hex) => new THREE.Color(hex);

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Garage {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0c);
    this.scene.fog = new THREE.Fog(0x0b0b0c, 26, 60);
    this.level = 0;
    this.room = null;
    this.cars = [];
    this.car = null;
    this.camPos = new THREE.Vector3(5, 2, 6);
    this.camTarget = new THREE.Vector3(0, 0.6, 0);
    this.focus = null;
    this.view = 'free';
    this.pose = { p: new THREE.Vector3(0, 0.55, 0), yaw: 0.75, pitch: 0.2, dist: 6.6, fov: 46 };
    this.tween = null;
    this.drag = { on: false, auto: true, last: 0 };
    this.door = 0;
    this.doorTarget = 0;
    this.particles = new Particles(this.scene, quality);
    this.time = 0;
    this.lineup = null;
    this.lineIdx = 0;
    this.lamps = false;
    this.lampK = 0;
    this.eng = null;
    this.rf = { hemi: 1, key: 1, rim: 1, fill: [1, 1, 1, 1], sun: 1, env: 1, led: 1, door: [0, 3, 10] };
    this.makeSharedMats();
    this.buildRig();
    this.makeEnvs();
    this.modeId = 'studio';
    this.lookState = this.modeState('studio');
    this.applyLook(this.lookState);
    this.scene.environment = this.envFor('studio');
  }

  // ------------------------------------------------------------- shared, mode-driven materials
  makeSharedMats() {
    this.mLed = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xffffff, emissiveIntensity: 2, roughness: 0.4 });
    this.mPanel = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2, roughness: 0.6 });
    this.mSky = new THREE.MeshBasicMaterial({ map: this.skyTexture(), fog: false });
    this.mWall = new THREE.MeshStandardMaterial({ color: 0xd4d6d9, roughness: 0.82, metalness: 0.02 });
    this.mSign = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4 });
  }

  skyTexture() {
    return canvasTex(1024, 512, (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
      sky.addColorStop(0, '#9fa8b2'); sky.addColorStop(0.7, '#e6e9ec'); sky.addColorStop(1, '#ffffff');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const R = rng(41);
      // far mountain ridge, nearer hills, a low skyline, forecourt
      const ridge = (y0, amp, fr, colr) => {
        g.fillStyle = colr; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) g.lineTo(x, y0 - Math.abs(Math.sin(x * fr + 1.3) * amp + Math.sin(x * fr * 2.7) * amp * 0.35));
        g.lineTo(W, H); g.fill();
      };
      ridge(H * 0.6, 70, 0.006, '#b9bec4');
      ridge(H * 0.64, 30, 0.013, '#9ea3a8');
      g.fillStyle = '#8a8e93';
      for (let x = 0; x < W;) { const bw = 20 + R() * 46, bh = 10 + R() * 44; g.fillRect(x, H * 0.66 - bh, bw, bh + 4); x += bw + R() * 14; }
      const grd = g.createLinearGradient(0, H * 0.66, 0, H);
      grd.addColorStop(0, '#7a7d80'); grd.addColorStop(1, '#4a4c4e');
      g.fillStyle = grd; g.fillRect(0, H * 0.66, W, H);
    });
  }

  // ------------------------------------------------------------- persistent light rig
  buildRig() {
    const s = this.scene, R = (this.rig = {});
    R.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    R.key = new THREE.SpotLight(0xffffff, 300, 24, 0.8, 0.6, 1.3);
    R.key.castShadow = true; R.key.shadow.mapSize.set(1024, 1024); R.key.shadow.bias = -0.0005; R.key.shadow.normalBias = 0.02;
    R.rimA = new THREE.SpotLight(0xffffff, 100, 26, 0.62, 0.7, 1.3);
    R.rimB = new THREE.SpotLight(0xffffff, 100, 26, 0.62, 0.7, 1.3);
    R.fill = [0, 1, 2, 3].map(() => new THREE.PointLight(0xffffff, 0, 14, 1.5));
    R.sun = new THREE.DirectionalLight(0xffffff, 0);
    R.door = new THREE.SpotLight(0xdbe6f0, 0, 26, 0.7, 0.6, 1.2);
    R.headL = new THREE.SpotLight(0xfff2dc, 0, 16, 0.42, 0.6, 1.4);
    R.headR = new THREE.SpotLight(0xfff2dc, 0, 16, 0.42, 0.6, 1.4);
    for (const l of [R.hemi, R.key, R.rimA, R.rimB, ...R.fill, R.sun, R.door, R.headL, R.headR]) s.add(l);
    for (const l of [R.key, R.rimA, R.rimB, R.sun, R.door, R.headL, R.headR]) s.add(l.target);
  }

  // where this room puts the rig and how strongly (the mode supplies colours and base values)
  setRig(cfg) {
    const R = this.rig;
    R.key.position.set(...cfg.key); R.key.target.position.set(0, 0, 0);
    R.rimA.position.set(...cfg.rimA); R.rimA.target.position.set(0, 0.5, 0);
    R.rimB.position.set(...cfg.rimB); R.rimB.target.position.set(0, 0.5, 0);
    cfg.fill.forEach((p, i) => R.fill[i].position.set(p[0], p[1], p[2]));
    R.sun.position.set(...cfg.sun); R.sun.target.position.set(0, 0, 0);
    R.door.position.set(...cfg.door); R.door.target.position.set(0, 0, 0);
    this.rf = { hemi: cfg.k.hemi, key: cfg.k.key, rim: cfg.k.rim, fill: cfg.fill.map((p) => p[3]), sun: cfg.k.sun, env: cfg.k.env ?? 1, keyAngle: cfg.keyAngle };
    this.applyLook(this.lookState);
  }

  // ------------------------------------------------------------- studio reflections
  // One small HDR room per light mode: ceiling softbox, LED lines, window wall, door. Same
  // size for all, so switching never recompiles a shader.
  makeEnvs() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const build = (P) => {
      const E = P.env, sc = new THREE.Scene();
      const basic = (c, k = 1) => new THREE.MeshBasicMaterial({ color: col(c).multiplyScalar(k), side: THREE.DoubleSide });
      const W = HALL.w, D = HALL.d, Hh = HALL.h;
      const box = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D), basic(...E.wall));
      box.material.side = THREE.BackSide; box.position.y = Hh / 2 - 1; sc.add(box);
      const plane = (w, h, m, x, y, z, rx, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y - 1, z); p.rotation.set(rx, ry, 0); sc.add(p); };
      plane(W, D, basic(...E.floor), 0, 0.01, 0, -Math.PI / 2, 0);
      plane(W, Hh, basic(...E.back), 0, Hh / 2, -D / 2 + 0.05, 0, 0);
      plane(W, D, basic(0x0c0d0e, 1), 0, Hh - 0.05, 0, Math.PI / 2, 0);
      const panel = basic(...E.panel), led = basic(...E.led), win = basic(...E.win);
      plane(4.5, 7.5, panel, 0, Hh - 0.1, 0, Math.PI / 2, 0);                       // key softbox over the car
      for (const x of [-6, 6]) plane(0.25, 18, panel, x, Hh - 0.1, 0, Math.PI / 2, 0); // linear strips
      for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) { plane(W, 0.12, led, 0, Hh - 0.3, z, 0, z > 0 ? Math.PI : 0); plane(W, 0.1, led, 0, 0.1, z, 0, z > 0 ? Math.PI : 0); }
      for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) { plane(D, 0.12, led, x, Hh - 0.3, 0, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2); plane(D, 0.1, led, x, 0.1, 0, 0, x > 0 ? -Math.PI / 2 : Math.PI / 2); }
      for (let z = -9; z <= 9; z += 2.6) plane(2.2, Hh - 0.6, win, -W / 2 + 0.12, Hh / 2, z, 0, Math.PI / 2);  // window bays
      plane(8, 5, win, 0, 2.5, D / 2 - 0.12, 0, Math.PI);                             // glass door
      for (const x of [-4, 0, 4]) plane(0.5, 2.6, panel, W / 2 - 0.12, 1.6, x, 0, -Math.PI / 2); // fill cards on the workshop wall
      const t = pm.fromScene(sc, 0.02).texture;
      sc.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      return t;
    };
    this.envs = {};
    const ids = this.quality === 'low' ? ['studio', 'warm', 'cinema'] : Object.keys(MODE);
    for (const id of ids) this.envs[id] = build(MODE[id]);
    pm.dispose();
  }
  envFor(id) { return this.envs[id] || this.envs[ENV_LOW[id]] || this.envs.studio; }

  // ------------------------------------------------------------- light-mode state + transitions
  modeState(id) {
    const P = MODE[id] || MODE.studio;
    const pair = (a) => ({ c: col(a[0]), k: a[1] });
    return {
      hemiSky: col(P.hemi[0]), hemiGround: col(P.hemi[1]), hemi: P.hemi[2],
      key: pair(P.key), rimA: pair(P.rimA), rimB: pair(P.rimB), fill: pair(P.fill), sun: pair(P.sun),
      led: pair(P.led), panel: pair(P.panel), sky: pair(P.sky), wall: col(P.wall), floor: col(P.floor), rough: P.rough, bg: col(P.bg),
      envI: P.envI, keyAngle: P.keyAngle || 0.8, look: { ...P.look },
    };
  }
  lerpState(a, b, t, out) {
    const L = (k) => { out[k] = lerp(a[k], b[k], t); };
    const C = (k) => { (out[k] || (out[k] = new THREE.Color())).copy(a[k]).lerp(b[k], t); };
    const Pp = (k) => { const o = out[k] || (out[k] = { c: new THREE.Color(), k: 0 }); o.c.copy(a[k].c).lerp(b[k].c, t); o.k = lerp(a[k].k, b[k].k, t); };
    C('hemiSky'); C('hemiGround'); L('hemi'); for (const k of ['key', 'rimA', 'rimB', 'fill', 'sun', 'led', 'panel', 'sky']) Pp(k);
    C('wall'); C('floor'); L('rough'); C('bg'); L('envI'); L('keyAngle');
    out.look = out.look || {};
    for (const k of Object.keys(b.look)) out.look[k] = lerp(a.look[k], b.look[k], t);
    return out;
  }

  setLightMode(id, instant = false) {
    if (!MODE[id]) id = 'studio';
    const to = this.modeState(id);
    if (instant || !this.lookState) {
      this.modeTween = null;
      this.lookState = to; this.applyLook(to);
      this.scene.environment = this.envFor(id);
    } else {
      this.modeTween = { from: this.lerpState(this.lookState, this.lookState, 0, {}), to, t: 0, env: this.envFor(id), swapped: false };
    }
    this.modeId = id;
  }
  get look() { return this.lookState.look; }

  applyLook(S) {
    if (!S) return;
    const R = this.rig, f = this.rf, dealer = this.mode === 'dealer';
    R.hemi.color.copy(S.hemiSky); R.hemi.groundColor.copy(S.hemiGround); R.hemi.intensity = S.hemi * f.hemi;
    R.key.color.copy(S.key.c); R.key.intensity = S.key.k * f.key; R.key.angle = f.keyAngle || S.keyAngle;
    R.rimA.color.copy(S.rimA.c); R.rimA.intensity = S.rimA.k * f.rim;
    R.rimB.color.copy(S.rimB.c); R.rimB.intensity = S.rimB.k * f.rim;
    for (let i = 0; i < 4; i++) { R.fill[i].color.copy(S.fill.c); R.fill[i].intensity = S.fill.k * (f.fill[i] || 0) * (this.flicker || 1); }
    R.sun.color.copy(S.sun.c); R.sun.intensity = S.sun.k * f.sun;
    this.mLed.emissive.copy(S.led.c); this.mLed.emissiveIntensity = S.led.k;
    this.mSign.emissive.copy(S.led.c); this.mSign.emissiveIntensity = Math.max(0.6, S.led.k * 0.6);
    this.mPanel.emissive.copy(S.panel.c); this.mPanel.emissiveIntensity = S.panel.k;
    this.mSky.color.copy(S.sky.c).multiplyScalar(S.sky.k);
    this.mWall.color.copy(S.wall);
    if (this.mShedFloor) this.mShedFloor.color.copy(S.floor).multiplyScalar(1.45);
    if (this.mFloor) { this.mFloor.color.copy(S.floor); this.mFloor.roughness = S.rough + (this.reflect ? 0.08 : 0); }
    if (!dealer) { this.scene.background.copy(S.bg); this.scene.fog.color.copy(S.bg); }
    this.scene.environmentIntensity = S.envI * (f.env ?? 1);
  }

  updateLook(dt) {
    const T = this.modeTween;
    if (!T) return;
    T.t = Math.min(1, T.t + dt / 0.9);
    const e = ease(T.t);
    this.lookState = this.lerpState(T.from, T.to, e, this.lookState === T.from ? {} : this.lookState);
    if (!T.swapped && T.t >= 0.5) { this.scene.environment = T.env; T.swapped = true; }
    this.applyLook(this.lookState);
    // the reflections cross over at the darkest point of a short dip
    this.scene.environmentIntensity *= 1 - 0.45 * Math.sin(Math.PI * T.t);
    if (T.t >= 1) { this.lookState = T.to; this.applyLook(T.to); this.modeTween = null; }
  }

  // ------------------------------------------------------------- room
  setLevel(level) {
    if (level === this.level && this.room) return;
    this.level = level;
    if (this.room) { this.scene.remove(this.room); this.room.traverse((o) => { if (o.isMesh && !o.userData.keep) o.geometry.dispose(); }); }
    this.mFloor = null; this.mShedFloor = null; this.reflect = null; this.floorMesh = null; this.turntable = null; this.motes = false; this.hallDoor = null; this.doorMesh = null;
    if (level >= 4) this.buildHall(level);
    else this.buildShed(level);
    if (this.mode !== 'dealer') this.setRig(this.roomRig);
    if (this.room) this.room.visible = this.mode !== 'dealer';
  }

  get roomSize() { return this.mode === 'dealer' ? SHOW : this.level >= 4 ? HALL : ROOM; }

  // levels 1-3: the old shed, the clean workshop, the professional garage
  buildShed(level) {
    const g = (this.room = new THREE.Group());
    const L = level;
    const R = rng(level * 17 + 3);
    const { w, d, h } = ROOM;
    const floorMat = new THREE.MeshStandardMaterial({
      map: TX.concreteTexture(20 + L, L >= 3 ? 1.05 : 0.85), roughness: 0.85, metalness: 0, color: 0xffffff,
    });
    floorMat.map = floorMat.map.clone(); floorMat.map.repeat.set(4, 4); floorMat.map.needsUpdate = true;
    this.mShedFloor = floorMat; // the light mode sets its tone (the studio reflections would wash it out)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const stains = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, d * 0.8), new THREE.MeshStandardMaterial({ map: TX.oilStains(), transparent: true, roughness: 0.4, depthWrite: false, opacity: L === 1 ? 1 : 0.5 }));
    stains.rotation.x = -Math.PI / 2; stains.position.y = 0.004; g.add(stains);
    if (L >= 2) { // painted bay lines
      const lm = new THREE.MeshStandardMaterial({ color: 0xc9c3b0, roughness: 0.6 });
      for (const x of [-2.6, 2.6]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 7.5), lm); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.006, 0.5); g.add(l); }
    }
    const wallMat = L === 1 ? mats.woodDark : L === 2 ? new THREE.MeshStandardMaterial({ map: TX.blockWallTexture([132, 128, 118]), roughness: 0.95 })
      : new THREE.MeshStandardMaterial({ map: TX.blockWallTexture([206, 204, 198]), roughness: 0.9 });
    if (wallMat.map) { wallMat.map = wallMat.map.clone(); wallMat.map.repeat.set(4, 1.6); wallMat.map.needsUpdate = true; }
    const wall = (W, H, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m; };
    wall(d, h, -w / 2, 0, Math.PI / 2);
    wall(d, h, w / 2, 0, -Math.PI / 2);
    wall(w, h, 0, -d / 2, 0);
    const sideW = (w - 4.8) / 2;
    wall(sideW, h, -w / 2 + sideW / 2, d / 2, Math.PI); wall(sideW, h, w / 2 - sideW / 2, d / 2, Math.PI);
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(4.8, h - 3.5), wallMat); lintel.position.set(0, 3.5 + (h - 3.5) / 2, d / 2); lintel.rotation.y = Math.PI; g.add(lintel);
    if (L >= 3) { // wall stripe
      const st = new THREE.MeshStandardMaterial({ color: 0x2c4a6a, roughness: 0.6 });
      for (const [x, z, ry, len] of [[-w / 2 + 0.01, 0, Math.PI / 2, d], [w / 2 - 0.01, 0, -Math.PI / 2, d], [0, -d / 2 + 0.01, 0, w]]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.35), st); s.position.set(x, 1.2, z); s.rotation.y = ry; g.add(s);
      }
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), L <= 2 ? mats.woodDark : new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = h; g.add(ceil);
    const beams = [];
    for (let z = -d / 2 + 1.5; z < d / 2; z += 3) { const b = new THREE.BoxGeometry(w, 0.3, 0.22); b.translate(0, h - 0.15, z); beams.push(b); }
    g.add(new THREE.Mesh(mergeGeometries(beams), L <= 2 ? mats.woodDark : mats.darkSteel));
    // roller door + the bright outside behind it
    const doorMat = new THREE.MeshStandardMaterial({ map: TX.corrugatedTexture(), roughness: 0.7, metalness: 0.5, color: 0xbab4a8 });
    this.doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.45), doorMat);
    this.doorMesh.position.set(0, 1.72, d / 2 - 0.05); this.doorMesh.rotation.y = Math.PI;
    g.add(this.doorMesh);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), this.mSky);
    outside.position.set(0, 4, d / 2 + 3); outside.rotation.y = Math.PI; g.add(outside);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), this.mSky);
    win.position.set(-3.5, 3.4, -d / 2 + 0.02); g.add(win);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.06), mats.woodDark); frame.position.set(-3.5, 3.4, -d / 2 + 0.05); g.add(frame);
    const frame2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), mats.woodDark); frame2.position.set(-3.5, 3.4, -d / 2 + 0.05); g.add(frame2);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 6, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    shaft.position.set(-2.6, 2.4, -d / 2 + 2.2); shaft.rotation.set(0.75, Math.PI / 4, 0); g.add(shaft);
    // light fixtures (the light itself comes from the rig)
    const lampPos = L === 1 ? [[0.5, 0.8]] : L === 2 ? [[-2, 0], [2, 0]] : [[-2.5, -3], [2.5, -3], [-2.5, 3], [2.5, 3]];
    for (const [x, z] of lampPos) {
      if (L <= 2) {
        if (!hasAsset('barnlamp')) {
          const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
          shade.position.set(x, h - 1.2, z); g.add(shade);
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1), mats.plastic); cord.position.set(x, h - 0.6, z); g.add(cord);
        }
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b8 }));
        bulb.position.set(x, h - 1.3, z); g.add(bulb);
      } else if (!hasAsset('g_fixture')) {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.14), this.mPanel);
        tube.position.set(x, h - 0.4, z); g.add(tube);
      }
    }
    const fillK = L === 1 ? [0.9, 0, 0, 0] : L === 2 ? [0.6, 0.6, 0, 0] : [0.4, 0.4, 0.4, 0.4];
    const fp = [...lampPos, [0, 0], [0, 0], [0, 0]].slice(0, 4);
    this.roomRig = {
      key: [0.5, h - 0.3, 0.8], rimA: [-5.5, 4.2, -6], rimB: [5.5, 4.2, 5], sun: [-6, 9, -20], door: [0, 3, d / 2 + 2],
      fill: fp.map(([x, z], i) => [x, h - 1.4, z, fillK[i]]),
      k: { hemi: L === 1 ? 0.45 : 0.55 + L * 0.05, key: L === 1 ? 0.13 : 0.16, rim: L === 1 ? 0.18 : 0.25, sun: 0.15, env: L === 1 ? 0.55 : 0.75 },
      keyAngle: 0.62,
    };
    this.doorZ = d / 2;
    this.buildProps(g, L, R);
    this.scene.add(g);
  }

  // ------------------------------------------------------------- premium hall (levels 4-5)
  buildHall(L) {
    const g = (this.room = new THREE.Group());
    const { w, d, h } = HALL;
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    // polished epoxy floor: big tiles with fine seams, a little mottling
    const ftex = canvasTex(1024, 1024, (c, W) => {
      c.fillStyle = '#8c8c8c'; c.fillRect(0, 0, W, W);
      const R = rng(9);
      for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + R() * 0.02})`; const r = 6 + R() * 60; c.beginPath(); c.arc(R() * W, R() * W, r, 0, 7); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,0.55)';
      for (let k = 0; k <= 4; k++) { c.fillRect(k * W / 4 - 1, 0, 2, W); c.fillRect(0, k * W / 4 - 1, W, 2); }
    });
    ftex.wrapS = ftex.wrapT = THREE.RepeatWrapping; ftex.repeat.set(w / 6, d / 6); ftex.anisotropy = aniso;
    this.mFloor = new THREE.MeshStandardMaterial({ map: ftex, color: 0x8e9196, roughness: 0.2, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.mFloor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    this.floorMesh = floor;
    if (this.quality === 'high') this.makeReflector(this.mFloor);
    // display platform (turns with the car) with an LED ring at its foot
    const plat = new THREE.Group();
    // The rim spots graze this glossy disc from behind the car, so their GGX highlight
    // stretched into a blown-out white streak under the nose in every mode. The disc keeps
    // its studio (env) reflections but takes punctual-light specular at a quarter.
    const topMat = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.4, metalness: 0.1 });
    topMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\nreflectedLight.directSpecular *= 0.22;');
    };
    topMat.customProgramCacheKey = () => 'garagePlatformTop';
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.38, 0.1, 72), topMat);
    top.position.y = 0.05; top.receiveShadow = true; plat.add(top);
    const lines = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.63, 72), new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.3, metalness: 0.9 }));
    lines.rotation.x = -Math.PI / 2; lines.position.y = 0.101; plat.add(lines);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.022, 6, 96), this.mLed);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.025; plat.add(ring);
    g.add(plat);
    this.turntable = plat;
    this.platformY = 0.1;
    // ---- walls: light side walls, dark walnut slat feature wall at the back
    const wall = (W, H, x, y, z, ry, m = this.mWall) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m); o.position.set(x, y, z); o.rotation.y = ry; o.receiveShadow = true; g.add(o); return o; };
    wall(d, h, w / 2, h / 2, 0, -Math.PI / 2);                     // workshop wall
    const dark = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.6, metalness: 0.2 });
    wall(w, h, 0, h / 2, -d / 2, 0, dark);                         // back
    const walnut = new THREE.MeshStandardMaterial({ color: 0x3e2a1c, roughness: 0.5, metalness: 0.05 });
    const slats = [];
    for (let x = -7; x <= 7.001; x += 0.17) { const b = new THREE.BoxGeometry(0.075, 4.6, 0.05); b.translate(x, 2.45, -d / 2 + 0.06); slats.push(b); }
    const sl = new THREE.Mesh(mergeGeometries(slats), walnut); sl.receiveShadow = true; g.add(sl);
    // backlit sign over the slats
    const signTex = canvasTex(1024, 192, (c, W, H) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 104px "Barlow Condensed", Arial'; c.fillText('D O W N F A L L', W / 2, H * 0.42);
      c.font = '500 30px "Barlow Condensed", Arial'; c.fillText('P R I V A T E   C O L L E C T I O N', W / 2, H * 0.85);
    });
    this.mSign.emissiveMap = signTex; this.mSign.map = null; this.mSign.needsUpdate = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.35), this.mSign); sign.position.set(0, 5.75, -d / 2 + 0.03); g.add(sign);
    // front wall with a glass sectional door
    const dw = 8, dh = 5;
    const sw = (w - dw) / 2;
    wall(sw, h, -w / 2 + sw / 2, h / 2, d / 2, Math.PI); wall(sw, h, w / 2 - sw / 2, h / 2, d / 2, Math.PI);
    wall(dw, h - dh, 0, dh + (h - dh) / 2, d / 2, Math.PI);
    const graphite = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xc8d6e0, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.4 });
    const door = new THREE.Group();
    const fr = [];
    for (let k = 0; k <= 4; k++) { const b = new THREE.BoxGeometry(dw, 0.07, 0.08); b.translate(0, k * dh / 4, 0); fr.push(b); }
    for (const x of [-dw / 2, -dw / 4, 0, dw / 4, dw / 2]) { const b = new THREE.BoxGeometry(0.07, dh, 0.08); b.translate(x, dh / 2, 0); fr.push(b); }
    door.add(new THREE.Mesh(mergeGeometries(fr), graphite));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), glass); pane.position.y = dh / 2; pane.rotation.y = Math.PI; door.add(pane);
    door.position.set(0, 0, d / 2 - 0.08); g.add(door);
    this.hallDoor = door;
    // the left side is glass from floor to ceiling, the outside beyond
    const mull = [];
    for (let z = -d / 2; z <= d / 2 + 0.01; z += d / 8) { const b = new THREE.BoxGeometry(0.12, h, 0.12); b.translate(-w / 2, h / 2, z); mull.push(b); }
    for (const y of [0.04, 3.6, h - 0.06]) { const b = new THREE.BoxGeometry(0.1, 0.1, d); b.translate(-w / 2, y, 0); mull.push(b); }
    g.add(new THREE.Mesh(mergeGeometries(mull), graphite));
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(d, h), glass); gl.position.set(-w / 2, h / 2, 0); gl.rotation.y = Math.PI / 2; g.add(gl);
    const out1 = new THREE.Mesh(new THREE.PlaneGeometry(64, 30), this.mSky); out1.position.set(-w / 2 - 14, 9, 0); out1.rotation.y = Math.PI / 2; g.add(out1);
    const out2 = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), this.mSky); out2.position.set(0, 9, d / 2 + 14); out2.rotation.y = Math.PI; g.add(out2);
    // ceiling: dark, a big softbox over the car, linear strips, downlights, a perimeter cove
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = h; g.add(ceil);
    const soft = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 7.5), this.mPanel); soft.rotation.x = Math.PI / 2; soft.position.y = h - 0.12; g.add(soft);
    const sframe = [];
    for (const [sx, sz, lx, lz] of [[0, -3.8, 4.7, 0.1], [0, 3.8, 4.7, 0.1], [-2.3, 0, 0.1, 7.7], [2.3, 0, 0.1, 7.7]]) { const b = new THREE.BoxGeometry(lx, 0.22, lz); b.translate(sx, h - 0.11, sz); sframe.push(b); }
    const strips = [], dls = [];
    for (const x of [-6, 6]) { const b = new THREE.BoxGeometry(0.22, 0.05, 18); b.translate(x, h - 0.03, 0); strips.push(b); }
    for (const [x, z] of [[-9.5, -6], [-9.5, 0], [-9.5, 6], [9.5, -6], [9.5, 0], [9.5, 6], [-3, -8.5], [3, -8.5], [-3, 8.5], [3, 8.5]]) { const c = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20); c.translate(x, h - 0.02, z); dls.push(c); }
    g.add(new THREE.Mesh(mergeGeometries(sframe), graphite));
    g.add(new THREE.Mesh(mergeGeometries([...strips, ...dls]), this.mPanel));
    const cove = [];
    for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) { const b = new THREE.BoxGeometry(w, 0.05, 0.04); b.translate(0, h - 0.3, z); cove.push(b); }
    for (const x of [-w / 2 + 0.1, w / 2 - 0.06]) { const b = new THREE.BoxGeometry(0.04, 0.05, d); b.translate(x, h - 0.3, 0); cove.push(b); }
    // skirting LEDs wash the floor along the back and the workshop wall
    { const b = new THREE.BoxGeometry(w - 0.2, 0.025, 0.03); b.translate(0, 0.06, -d / 2 + 0.1); cove.push(b); }
    { const b = new THREE.BoxGeometry(0.03, 0.025, d - 0.2); b.translate(w / 2 - 0.1, 0.06, 0); cove.push(b); }
    { const b = new THREE.BoxGeometry(14.2, 0.03, 0.04); b.translate(0, 4.8, -d / 2 + 0.1); cove.push(b); }
    // columns with vertical LED lines
    const cols = [], colLed = [];
    for (const [x, z] of [[-9.6, -7.6], [9.6, 7.4], [-9.6, 7.4]]) {
      const b = new THREE.BoxGeometry(0.62, h, 0.62); b.translate(x, h / 2, z); cols.push(b);
      for (const s of [-1, 1]) { const l = new THREE.BoxGeometry(0.03, h - 0.6, 0.03); l.translate(x + s * 0.315, h / 2, z + 0.2); colLed.push(l); }
    }
    g.add(new THREE.Mesh(mergeGeometries(cols), graphite));
    g.add(new THREE.Mesh(mergeGeometries([...cove, ...colLed]), this.mLed));
    // workshop zone: hatched safety line around the lift bay
    const zone = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5 });
    const zl = [];
    for (const [x, z, lx, lz] of [[6.7, -4.6, 0.08, 7.6], [8.55, -0.8, 3.7, 0.08], [8.55, -8.4, 3.7, 0.08]]) { const b = new THREE.BoxGeometry(lx, 0.004, lz); b.translate(x, 0.004, z); zl.push(b); }
    g.add(new THREE.Mesh(mergeGeometries(zl), zone));
    // ---- furniture from Blender (assets/models/garage.glb)
    const put = (name, x, z, ry = 0, y = 0, s = 1) => {
      const o = cloneAsset(name);
      if (!o) return null;
      o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true; m.userData.keep = true;
        if (m.material && /^g_led/.test(m.material.name)) { m.material = this.mLed; m.castShadow = false; }
        if (m.material && /^g_glass/.test(m.material.name)) { m.material = glass; m.castShadow = false; }
      });
      g.add(o);
      return o;
    };
    const W90 = -Math.PI / 2;
    put('g_cabinets', w / 2 - 0.4, -4.4, W90);
    put('g_scissor', 8.6, -4.6, 0);
    put('g_diag', 10.5, 0.4, -2.2);
    put('g_wheelwall', w / 2 - 0.12, 3.6, W90);
    put('g_engine', 10.9, -8.8, 2.4);
    put('g_trophycase', -4.4, -d / 2 + 0.3, 0);
    put('g_lounge', -9.2, -d / 2 + 1.25, 0);
    for (const [x, z] of [[-w / 2 + 0.6, -d / 2 + 0.6], [-w / 2 + 0.6, d / 2 - 0.6], [3.4, -d / 2 + 0.5], [w / 2 - 0.6, d / 2 - 0.6]]) put('g_planter', x, z, x);
    if (L >= 5) { put('g_bar', 5.6, -d / 2 + 0.55, 0); put('g_toolchest', w / 2 - 0.5, -9.4, W90); }
    else put('g_drums', w / 2 - 1.0, -9.6, 0.3);
    // a covered project car in the workshop corner
    const cover = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.92 }));
    cover.scale.set(1.0, 0.6, 2.3); cover.position.set(8.6, 0.62 + 0.55, -4.6); cover.castShadow = true; cover.receiveShadow = true;
    if (L >= 5) g.add(cover);
    this.roomRig = {
      key: [0, h - 0.4, 0.8], rimA: [-7.5, 5.6, -6.5], rimB: [7.5, 5.6, 6.0], sun: [-26, 16, 7], door: [0, 4, d / 2 + 3],
      fill: [[-7, h - 0.8, -6, 1], [7, h - 0.8, -6, 1], [-7, h - 0.8, 6, 1], [7, h - 0.8, 6, 1]],
      k: { hemi: 1, key: 1, rim: 1, sun: 1, env: 1 },
    };
    this.doorZ = d / 2;
    this.scene.add(g);
  }

  // Planar mirror for the floor (high quality only): the scene seen from below the floor,
  // blurred a little and added on top of the floor's own (rough) lighting.
  makeReflector(mat) {
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType });
    const R = (this.reflect = {
      rt, cam: new THREE.PerspectiveCamera(), texMat: new THREE.Matrix4(), size: new THREE.Vector2(),
      u: { tRefl: { value: rt.texture }, uTexMat: { value: new THREE.Matrix4() }, uReflK: { value: 0.32 }, uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) } },
    });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, R.u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uTexMat; varying vec4 vReflUv;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = uTexMat * vec4(position, 1.0);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl; uniform float uReflK; uniform vec2 uTexel; varying vec4 vReflUv;')
        .replace('#include <opaque_fragment>', `
  {
    vec2 ruv = vReflUv.xy / vReflUv.w;
    vec2 o = uTexel * 2.0;
    vec3 rc = texture2D(tRefl, ruv).rgb * 0.36
      + (texture2D(tRefl, ruv + vec2(o.x, 0.0)).rgb + texture2D(tRefl, ruv - vec2(o.x, 0.0)).rgb
      +  texture2D(tRefl, ruv + vec2(0.0, o.y)).rgb + texture2D(tRefl, ruv - vec2(0.0, o.y)).rgb) * 0.16;
    float cosT = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float fres = 0.18 + 0.82 * pow(1.0 - cosT, 4.0);
    outgoingLight += rc * uReflK * fres * (1.0 - roughnessFactor * 0.6);
  }
  #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'garageFloorRefl';
  }

  renderReflection(camera) {
    const R = this.reflect;
    if (!R || !this.floorMesh || !this.room || !this.room.visible) return;
    const r = this.renderer;
    const sz = r.getDrawingBufferSize(R.size);
    const w = Math.max(2, Math.floor(sz.x / 2)), h = Math.max(2, Math.floor(sz.y / 2));
    if (R.rt.width !== w || R.rt.height !== h) { R.rt.setSize(w, h); R.u.uTexel.value.set(1 / w, 1 / h); }
    const floor = this.floorMesh;
    floor.updateMatrixWorld(); camera.updateMatrixWorld();
    const V = R.v || (R.v = { p: new THREE.Vector3(), c: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0), look: new THREE.Vector3(), t: new THREE.Vector3(), rot: new THREE.Matrix4(), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4() });
    V.p.setFromMatrixPosition(floor.matrixWorld);
    V.c.setFromMatrixPosition(camera.matrixWorld);
    if (V.c.y <= V.p.y + 0.01) return;
    const vc = R.cam;
    const view = V.t.copy(V.p).sub(V.c).reflect(V.n).negate().add(V.p);
    V.rot.extractRotation(camera.matrixWorld);
    V.look.set(0, 0, -1).applyMatrix4(V.rot).add(V.c);
    const tgt = V.look.sub(V.p).reflect(V.n).negate().add(V.p);
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(V.rot).reflect(V.n);
    vc.lookAt(tgt);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    // oblique near plane = the floor, so nothing below it shows up
    V.plane.setFromNormalAndCoplanarPoint(V.n, V.p).applyMatrix4(vc.matrixWorldInverse);
    V.clip.set(V.plane.normal.x, V.plane.normal.y, V.plane.normal.z, V.plane.constant);
    const pe = vc.projectionMatrix.elements;
    V.q.set((Math.sign(V.clip.x) + pe[8]) / pe[0], (Math.sign(V.clip.y) + pe[9]) / pe[5], -1, (1 + pe[10]) / pe[14]);
    V.clip.multiplyScalar(2 / V.clip.dot(V.q));
    pe[2] = V.clip.x; pe[6] = V.clip.y; pe[10] = V.clip.z + 1 - 0.003; pe[14] = V.clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    const tm = R.u.uTexMat.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(camera.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(floor.matrixWorld);
    floor.visible = false;
    const prevT = r.getRenderTarget(), au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(R.rt); r.clear(); r.render(this.scene, vc);
    r.setRenderTarget(prevT);
    r.shadowMap.autoUpdate = au;
    floor.visible = true;
  }

  // Blender-made workshop furniture (assets/models/garage.glb); grows with the level.
  buildAssetProps(g, L) {
    const { w, d, h } = ROOM;
    const put = (name, x, z, ry = 0, y = 0, s = 1) => {
      const o = cloneAsset(name);
      if (!o) return null;
      o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.keep = true; } });
      g.add(o);
      return o;
    };
    const E = Math.PI / 2, W = -Math.PI / 2;
    put('g_bench', -w / 2 + 0.45, -3.2, E);
    put('g_drums', w / 2 - 1.2, -5.8, 0.3);
    put('g_jack', 3.4, 4.2, 2.6);
    if (L >= 2) { put('g_toolchest', -w / 2 + 0.45, 0.6, E); put('g_shelf', 2.6, -d / 2 + 0.4, 0); put('g_compressor', w / 2 - 0.6, 4.8, W); }
    if (L >= 3) { put('g_lift', w / 2 - 1.3, 1.2, W); put('g_tirerack', -2.6, -d / 2 + 0.4, 0); put('g_engine', -4.5, 4.4, 2.2); put('g_hoist', -3.6, 5.3, 2.0); }
    if (L <= 2 && hasAsset('barnlamp')) {
      for (const [x, z] of L === 1 ? [[0.5, 0.8], [-3.5, -3]] : [[-2, 0], [2, 0], [-3.5, -3]]) {
        put('barnlamp', x, z, 0, h - 1.5, 2.6);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2), mats.plastic); cord.position.set(x, h - 0.6, z); g.add(cord);
      }
    } else if (L >= 3) {
      for (const [x, z] of [[-2.5, -3], [2.5, -3], [-2.5, 3], [2.5, 3]]) put('g_fixture', x, z, 0, h - 0.75);
    }
    for (const [k, x] of [['map', -0.6], ['oil', 4.6], ['race', -5.2]]) {
      if (k === 'race' && L < 2) continue;
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05), new THREE.MeshStandardMaterial({ map: TX.posterTexture(k), roughness: 0.9 }));
      pm.position.set(x, 2.7, -d / 2 + 0.02); g.add(pm);
    }
    this.motes = true;
  }

  buildProps(g, L, R) {
    if (hasAsset('g_bench')) return this.buildAssetProps(g, L);
    const { w, d } = ROOM;
    const add = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // fallback when the GLB is missing: a few primitive stand-ins
    const bench = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.9), mats.wood); top.position.y = 0.92; bench.add(top);
    for (const x of [-1.7, 1.7]) for (const z of [-0.38, 0.38]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.92, 0.07), mats.darkSteel); leg.position.set(x, 0.46, z); bench.add(leg); }
    add(bench, -w / 2 + 0.55, 0, -2.5, Math.PI / 2);
    const chest = new THREE.Mesh(roundedBox(1.0, 1.05, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: 0x8e2219, roughness: 0.4, metalness: 0.4 }));
    add(chest, -w / 2 + 0.5, 0.53, 0.6, Math.PI / 2);
    const tw = buildWheel(0.32, 0.22, 'steel', 'street', false);
    for (let i = 0; i < (L === 1 ? 3 : 5); i++) { const t = tw.userData.tire.clone(); t.rotation.z = Math.PI / 2; add(t, w / 2 - 0.9, 0.12 + i * 0.23, -5.6 + (i % 2) * 0.05); }
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x34503a, roughness: 0.6, metalness: 0.5 });
    for (const [x, z] of [[w / 2 - 0.5, -3.6], [w / 2 - 1.2, -3.9]]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18), drumMat), x, 0.45, z);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4 + R() * 0.3, 0.3, 0.35), mats.cardboard); add(b, 1.6 + i * 0.7, 0.15, -d / 2 + 0.4); }
    const lift = new THREE.Mesh(beam([0, 0, 0], [0, 3.6, 0], 0.15), mats.darkSteel); add(lift, w / 2 - 0.9, 0, 1.6);
    this.motes = true;
  }

  // ------------------------------------------------------------- dealership
  // 'workshop' (the player's garage) or 'dealer' (the exotic car showroom)
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'dealer' && !this.showroom) this.buildShowroom();
    if (this.room) this.room.visible = mode !== 'dealer';
    if (this.showroom) this.showroom.visible = mode === 'dealer';
    this.scene.fog.near = mode === 'dealer' ? 30 : 26; this.scene.fog.far = mode === 'dealer' ? 70 : 60;
    if (mode === 'dealer') { this.scene.background.setHex(0xd7dde2); this.scene.fog.color.setHex(0xd7dde2); }
    this.setRig(mode === 'dealer' ? this.showRig : this.roomRig);
    if (mode !== 'dealer') this.setSideCars([]);
    this.setView('free', true);
  }

  buildShowroom() {
    const g = (this.showroom = new THREE.Group());
    const S = SHOW;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.14, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), new THREE.MeshStandardMaterial({ map: TX.concreteTexture(7, 0.25), transparent: true, opacity: 0.25, roughness: 0.2, depthWrite: false }));
    tiles.material.map = tiles.material.map.clone(); tiles.material.map.repeat.set(6, 5); tiles.material.map.needsUpdate = true;
    tiles.rotation.x = -Math.PI / 2; tiles.position.y = 0.002; g.add(tiles);
    const wallM = new THREE.MeshStandardMaterial({ color: 0xd6d3cd, roughness: 0.8 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.3 });
    const wall = (W, H, x, z, ry, m = wallM) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m); o.position.set(x, H / 2, z); o.rotation.y = ry; o.receiveShadow = true; g.add(o); return o; };
    wall(S.d, S.h, -S.w / 2, 0, Math.PI / 2);
    wall(S.d, S.h, S.w / 2, 0, -Math.PI / 2);
    wall(S.w, S.h, 0, -S.d / 2, 0, new THREE.MeshStandardMaterial({ color: 0x7c7b78, roughness: 0.85 }));
    const signBack = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), darkM); signBack.position.set(0, 4.6, -S.d / 2 + 0.02); g.add(signBack);
    const nameTex = canvasTex(1024, 160, (x2) => {
      x2.fillStyle = '#16171a'; x2.fillRect(0, 0, 1024, 160);
      x2.fillStyle = '#f2ede2'; x2.font = '600 92px "Barlow Condensed", Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillText('MONTAGNA  MOTORS', 512, 84);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.25), new THREE.MeshStandardMaterial({ map: nameTex, emissiveMap: nameTex, emissive: 0xffffff, emissiveIntensity: 0.9 }));
    sign.position.set(0, 4.6, -S.d / 2 + 0.03); g.add(sign);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshPhysicalMaterial({ color: 0xbfd0dc, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }));
    glass.position.set(0, S.h / 2, S.d / 2); glass.rotation.y = Math.PI; g.add(glass);
    for (let k = -4; k <= 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, S.h, 0.12), darkM); m.position.set(k * S.w / 9, S.h / 2, S.d / 2); g.add(m); }
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), this.mSky);
    outside.position.set(0, 6, S.d / 2 + 6); outside.rotation.y = Math.PI; g.add(outside);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), new THREE.MeshStandardMaterial({ color: 0xb8b6b2, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = S.h; g.add(ceil);
    const st = [];
    for (let k = -3; k <= 3; k++) { const b = new THREE.BoxGeometry(S.w * 0.85, 0.05, 0.16); b.translate(0, S.h - 0.05, k * 2.2); st.push(b); }
    g.add(new THREE.Mesh(mergeGeometries(st), this.mPanel));
    const pod = cloneAsset('g_podium');
    if (pod) {
      const top = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.16, metalness: 0.65 });
      pod.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.userData.keep = true; if (/checker/.test(m.material.name)) m.material = top; } });
      g.add(pod); this.podium = pod;
    }
    const sts = cloneAsset('g_stanchions'); if (sts) g.add(sts);
    for (const x of [-7, 7]) {
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 48), darkM); pl.position.set(x, 0.06, -3.5); pl.receiveShadow = true; g.add(pl);
    }
    const lounge = cloneAsset('g_lounge'); if (lounge) { lounge.position.set(-8.5, 0, 6); lounge.rotation.y = Math.PI * 0.75; g.add(lounge); }
    const bar = cloneAsset('g_bar'); if (bar) { bar.position.set(8.8, 0, 6.5); bar.rotation.y = -Math.PI / 2; g.add(bar); }
    this.showRig = {
      key: [0, S.h - 0.3, 1.5], rimA: [-7, S.h - 0.3, -2], rimB: [7, S.h - 0.3, -2], sun: [0, 10, 30], door: [0, 3, S.d / 2 + 2],
      fill: [[-6, S.h - 0.6, -4, 1], [6, S.h - 0.6, -4, 1], [-6, S.h - 0.6, 4, 1], [6, S.h - 0.6, 4, 1]],
      k: { hemi: 0.95, key: 0.55, rim: 0.7, sun: 0.4, env: 0.9 },
    };
    g.visible = false;
    this.scene.add(g);
  }

  // extra display cars on the side plinths of the showroom
  setSideCars(list) {
    for (const c of this.sideCars || []) { this.scene.remove(c.group); c.dispose(); }
    this.sideCars = list.slice(0, 2).map((car, i) => {
      const m = new CarModel(car, {});
      m.setStaticWheels(0.3);
      m.group.position.set(i ? 7 : -7, 0.12 - m.dims.yG, -3.5);
      m.group.rotation.y = i ? -0.6 : 0.6;
      this.scene.add(m.group);
      return m;
    });
  }

  // ------------------------------------------------------------- cars
  showCar(car, opts = {}) {
    this.stopEngine(true);
    this.clearCars();
    const m = new CarModel(car, opts);
    if (opts.rim) applyRim(m, opts.rim);
    m.setStaticWheels(0);
    const lift = this.mode === 'dealer' ? 0.16 : this.level >= 4 ? this.platformY || 0 : 0;
    m.group.position.set(0, -m.dims.yG + lift, 0);
    m.group.rotation.y = this.turntable && this.mode !== 'dealer' ? this.turntable.rotation.y : 0;
    this.scene.add(m.group);
    this.car = m;
    this.cars = [m];
    this.lineup = null;
    this.hood = 0;
    this.applyLamps(true);
    if (this.view === 'focus' && this.focus && this.focus !== 'story') this.go(this.poseFromFocus(this.focus), true);
    else if (this.view !== 'free' && this.view !== 'focus') this.setView(this.view, true);
    return m;
  }
  showLineup(cars) {
    this.stopEngine(true);
    this.clearCars();
    this.lineup = cars.map((c, i) => {
      const m = new CarModel(c, {});
      m.setStaticWheels(0.25);
      m.group.position.set((i - 1) * 3.4, -m.dims.yG, -0.5 + Math.abs(i - 1) * 0.6);
      m.group.rotation.y = (i - 1) * -0.25;
      this.scene.add(m.group);
      return m;
    });
    this.cars = this.lineup;
    this.lineIdx = 1;
    this.car = this.lineup[1];
  }
  clearCars() {
    this.setCockpitGlass(false);
    for (const c of this.cars) { this.scene.remove(c.group); c.dispose(); }
    this.cars = []; this.car = null;
  }
  setRim(style) { if (this.car) applyRim(this.car, style); }

  // ------------------------------------------------------------- car lamps
  setLamps(on) { this.lamps = !!on; audio()?.ui('click'); }
  applyLamps(instant) {
    const c = this.car;
    if (instant) this.lampK = this.lamps ? 1 : 0;
    if (!c || !c.lightMatL) return;
    const k = this.lampK;
    c.lightMatL.emissiveIntensity = c.lightMatR.emissiveIntensity = lerp(0.12, 2.6, k);
    if (c.tailMat) c.tailMat.emissiveIntensity = lerp(0.25, 1.15, k) + (this.eng && this.eng.brake ? 1.2 : 0);
  }
  placeHeadBeams() {
    const R = this.rig, c = this.car;
    const on = this.lampK > 0.001 && c && !this.lineup && this.mode !== 'dealer' ? this.lampK : 0;
    R.headL.intensity = R.headR.intensity = on * 70;
    if (!on) return;
    const hp = c.headPos || [c.dims.half * 0.6, c.dims.yNose, c.dims.zF];
    const V = this._hb || (this._hb = new THREE.Vector3());
    c.group.updateMatrixWorld();
    for (const [L, s] of [[R.headL, 1], [R.headR, -1]]) {
      L.position.copy(c.group.localToWorld(V.set(hp[0] * s, hp[1], hp[2] + 0.05)));
      L.target.position.copy(c.group.localToWorld(V.set(hp[0] * s * 1.6, -0.6, hp[2] + 7)));
      L.target.updateMatrixWorld();
    }
  }

  // ------------------------------------------------------------- engine
  get engineOn() { return !!this.eng && this.eng.state !== 'off'; }
  startEngine() {
    const c = this.car;
    if (!c || this.lineup || this.engineOn) return false;
    const a = audio();
    const ph = c.ph && c.ph.engine;
    const e = (this.eng = { state: 'crank', t: 0, rpm: 0, thr: 0, thrT: 0, idle: (ph && ph.idle) || 850, red: (ph && ph.redline) || 7000, voice: null, puff: 0, limiter: 0, g: 0 });
    if (a && a.ctx) {
      a.starter(c.car);
      try { e.voice = new EngineVoice(a, c.car); } catch (err) { e.voice = null; }
    }
    return true;
  }
  stopEngine(instant) {
    const e = this.eng;
    if (!e) return;
    if (e.voice) { e.voice.setRunning(false); const v = e.voice; setTimeout(() => v.dispose(), instant ? 0 : 500); }
    this.eng = null;
    if (this.car) { this.car.group.rotation.z = 0; this.car.group.rotation.x = 0; }
    if (!instant) audio()?.burst({ freq: 300, q: 0.7, type: 'lowpass', dur: 0.4, gain: 0.08, buf: audio().brown });
  }
  setThrottle(v) { if (this.eng) this.eng.thrT = clamp(v, 0, 1); }
  get rpm() { return this.eng ? this.eng.rpm : 0; }
  get redline() { return this.eng ? this.eng.red : (this.car && this.car.ph && this.car.ph.engine && this.car.ph.engine.redline) || 7000; }

  updateEngine(dt) {
    const e = this.eng, c = this.car;
    if (!e || !c) return;
    e.t += dt;
    if (e.state === 'crank') {
      e.rpm = 180 + Math.abs(Math.sin(e.t * 19)) * 260;
      if (e.t > 0.85) { e.state = 'run'; e.rpm = e.idle * 1.9; if (e.voice) e.voice.setRunning(true); this.exhaustPuff(5, true); }
    } else {
      e.thr = damp(e.thr, e.thrT, 14, dt);
      const target = e.idle + e.thr * (e.red * 0.97 - e.idle);
      const up = e.red * 1.6 * (0.4 + e.thr), down = e.red * 0.9;
      e.rpm = e.rpm < target ? Math.min(target, e.rpm + up * dt) : Math.max(target, e.rpm - down * dt);
      e.limiter = e.rpm > e.red * 0.955 ? 1 : 0;
      if (e.limiter && Math.random() < dt * 20) e.rpm -= e.red * 0.05;
      e.rpm += Math.sin(e.t * 31) * 8;
      if (e.prevThr > 0.6 && e.thrT < 0.1 && e.rpm > e.red * 0.55) this.exhaustPuff(2, false);
      e.prevThr = e.thrT;
      if (e.thr > 0.3 && Math.random() < dt * 4 * e.thr) this.exhaustPuff(1, false);
    }
    if (e.voice) {
      const boost = c.car.sound && c.car.sound.turbo ? e.thr * clamp((e.rpm / e.red - 0.3) * 2, 0, 1) : 0;
      e.voice.update(dt, e.rpm, e.red, e.thr, boost, e.limiter, 1, 1);
    }
    // the body rocks on its mounts: idle shake, a twist against the crank when revved
    const r = e.rpm / e.red;
    e.g = damp(e.g, e.state === 'run' ? e.thr : 0, 5, dt);
    const shake = e.state === 'crank' ? 0.006 : 0.0012 + r * 0.0012;
    c.group.rotation.z = Math.sin(e.t * (e.state === 'crank' ? 22 : 48 + r * 60)) * shake + e.g * 0.014;
    c.group.rotation.x = -e.g * 0.006;
    // the dials in the cockpit follow (only while someone looks at them)
    if (c.gauge && this.view === 'cockpit') {
      c.gauge.t += dt;
      if (c.gauge.t > 0.05) { c.gauge.t = 0; c.drawGauges(0, e.rpm / e.red, 1, 0.42, 0); }
    }
  }
  exhaustPuff(n, dark) {
    const c = this.car;
    if (!c || !c.exhaustTips) return;
    c.group.updateMatrixWorld();
    const V = this._ep || (this._ep = new THREE.Vector3());
    const back = new THREE.Vector3(0, 0, -1).transformDirection(c.group.matrixWorld);
    for (const t of c.exhaustTips) {
      V.copy(t); c.group.localToWorld(V);
      for (let i = 0; i < n; i++) this.particles.smoke(V.x, V.y, V.z, back.x * 1.5, 0.1, back.z * 1.5, dark, 0.35);
    }
  }

  // ------------------------------------------------------------- camera views
  // A pose orbits a pivot given in car space: yaw (relative to the car), pitch, distance, fov.
  // Free orbit, the detail presets, upgrade focus shots and the cockpit are all poses,
  // so every move between them is one eased interpolation.
  presetPose(id) {
    const c = this.car;
    if (!c) return null;
    const d = c.dims, L = d.L;
    const P = (x, y, z, yaw, pitch, dist, fov) => ({ p: new THREE.Vector3(x, y, z), yaw, pitch, dist, fov });
    const mid = (d.zF + d.zR) / 2;
    switch (id) {
      case 'front': return P(0, d.yBelt * 0.55, mid + L * 0.08, 0.62, 0.13, Math.max(5.0, L * 1.22), 42);
      case 'rear': return P(0, d.yBelt * 0.55, mid - L * 0.08, Math.PI + 0.62, 0.15, Math.max(5.0, L * 1.22), 42);
      case 'side': return P(0, d.yBelt * 0.5, mid, Math.PI / 2, 0.06, Math.max(5.6, L * 1.35), 40);
      case 'wheel': return P(d.half + 0.05, d.wcY, d.a, Math.PI / 2 - 0.42, 0.1, 1.55 + d.r, 40);
      case 'engine': {
        const e = this.focusPoint('engine');
        return P(e.x, e.y, e.z, 0.42, 0.72, 2.3 + L * 0.12, 44);
      }
      case 'cockpit': {
        const e = c.eye || [d.W * 0.22, d.yBelt + 0.32, 0];
        return P(e[0], e[1], e[2], Math.PI, 0.1, 0.03, 72);
      }
      default: return null;
    }
  }
  freePose() {
    const room = this.roomSize;
    return { p: new THREE.Vector3(0, this.car ? this.car.dims.yBelt * 0.55 : 0.6, 0), yaw: 0.75, pitch: 0.2, dist: this.mode === 'dealer' ? 7.4 : room === HALL ? 7.2 : 6.6, fov: 46 };
  }
  poseFromFocus(f) {
    const fc = this.focusCam(f);
    if (!fc) return null;
    const p = this.focusPoint(f);
    const off = fc.clone().sub(p), dist = off.length();
    return { p, yaw: Math.atan2(off.x, off.z), pitch: Math.asin(clamp(off.y / dist, -1, 1)), dist, fov: 42 };
  }
  // views: free | front | rear | side | wheel | cockpit | engine
  setView(id, instant = false) {
    this.view = id;
    this.focus = null;
    this.drag.auto = id === 'free';
    this.drag.last = performance.now();
    this.hoodT = id === 'engine' ? 1 : 0;
    const target = id === 'free' ? this.freePose() : this.presetPose(id);
    this.go(target, instant);
    this.setCockpitGlass(id === 'cockpit');
  }
  go(target, instant) {
    if (!target) return;
    if (instant || !this.car) { this.copyPose(this.pose, target); this.tween = null; return; }
    this.tween = { from: this.copyPose({ p: new THREE.Vector3() }, this.pose), to: target, t: 0, dur: target.dist < 0.2 || this.pose.dist < 0.2 ? 1.5 : 1.1 };
  }
  copyPose(o, s) { o.p = (o.p || new THREE.Vector3()).copy(s.p); o.yaw = s.yaw; o.pitch = s.pitch; o.dist = s.dist; o.fov = s.fov; return o; }
  setCockpitGlass(on) {
    const c = this.car;
    if (this.cockpitGlass === on) return;
    this.cockpitGlass = on;
    if (c && c.glassMat && c.glassMat.opacity !== undefined) c.glassMat.opacity = on ? 0.16 : 0.72;
    if (!on && mats.glass) mats.glass.opacity = 0.72;
  }

  // focus a part for upgrades: engine | wheel | suspension | front | rear | cabin | under | null
  setFocus(f) {
    if (f === this.focus && (f || this.view === 'free')) return;
    this.focus = f;
    if (!f) { if (this.view === 'focus') this.setView('free'); this.hoodT = this.view === 'engine' ? 1 : 0; return; }
    this.view = 'focus';
    this.setCockpitGlass(false);
    this.hoodT = f === 'engine' ? 1 : 0;
    this.drag.auto = false;
    this.go(this.poseFromFocus(f), !this.car);
  }

  async install(cat) {
    const a = audio();
    const c = this.car;
    if (!c) return;
    const p = this.focusPoint(this.focus && this.focus !== 'story' ? this.focus : 'front');
    const world = c.group.localToWorld(p.clone());
    const seq = [
      () => a && a.ratchet(7),
      () => a && a.impactWrench(0.6),
      () => { a && a.metal(0.35, 300); this.particles.sparks(world.x, world.y, world.z, 0, 1, 0, 14); },
      () => a && a.ratchet(5, 0, 0.035),
      () => { a && a.impactWrench(0.35); this.particles.sparks(world.x, world.y + 0.1, world.z, 0, 1, 0, 10); },
    ];
    for (const f of seq) { f(); await new Promise((r) => setTimeout(r, 330)); }
    this.shake = 0.12;
  }

  focusPoint(f) {
    const d = this.car.dims;
    switch (f) {
      case 'engine': return new THREE.Vector3(0, d.yNose + 0.1, (d.a + d.zF) / 2);
      case 'wheel': return new THREE.Vector3(d.half, d.wcY, d.a);
      case 'suspension': return new THREE.Vector3(d.half, d.wcY + 0.2, -d.b);
      case 'front': return new THREE.Vector3(0, d.bottom + 0.3, d.zF);
      case 'rear': return new THREE.Vector3(-d.half * 0.5, d.yBelt, d.zR);
      case 'cabin': return new THREE.Vector3(d.half, d.yBelt + 0.3, 0);
      case 'under': return new THREE.Vector3(d.half, d.bottom, 0);
      default: return new THREE.Vector3(0, 0.4, 0);
    }
  }
  focusCam(f) {
    const d = this.car.dims;
    switch (f) {
      case 'engine': return new THREE.Vector3(1.5, d.roof + 1.3, d.zF + 2.0);
      case 'wheel': return new THREE.Vector3(d.half + 2.2, d.wcY + 0.5, d.a + 1.6);
      case 'suspension': return new THREE.Vector3(d.half + 2.0, d.wcY + 0.2, -d.b - 1.6);
      case 'front': return new THREE.Vector3(-1.2, d.yBelt + 0.4, d.zF + 2.6);
      case 'rear': return new THREE.Vector3(1.6, d.roof + 0.6, d.zR - 2.8);
      case 'cabin': return new THREE.Vector3(d.half + 2.4, d.roof + 0.4, 0.6);
      case 'under': return new THREE.Vector3(d.half + 2.6, d.bottom + 0.3, -0.5);
      default: return null;
    }
  }

  openDoor() { this.doorTarget = 1; audio()?.garageDoor(2.6); }

  // mouse drag / one-finger drag orbits (looks around in the cockpit), wheel / pinch zooms
  bindPointer(el) {
    const pts = new Map();
    let pinch = 0;
    const touchStart = () => { this.drag.on = true; this.drag.auto = false; this.drag.last = performance.now(); if (this.tween) { this.tween = null; } };
    el.addEventListener('pointerdown', (e) => {
      if (e.target !== el) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      touchStart();
    });
    window.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this.drag.last = performance.now();
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.zoom((pinch - dd) * 0.006);
        pinch = dd;
        return;
      }
      this.orbitBy(dx, dy);
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) this.drag.on = false; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { this.zoom(e.deltaY * 0.0012); this.drag.last = performance.now(); }, { passive: true });
  }
  orbitBy(dx, dy) {
    const P = this.pose, inside = this.view === 'cockpit';
    if (this.tween) this.tween = null;
    const k = inside ? 0.0045 : 0.0062;
    P.yaw += (inside ? 1 : -1) * dx * k;
    P.pitch = clamp(P.pitch + (inside ? -1 : 1) * dy * k, inside ? -0.55 : -0.04, inside ? 0.6 : 1.25);
    if (inside) { const b = Math.PI; P.yaw = b + clamp(((P.yaw - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.9, 1.9); }
    if (this.view === 'free') this.drag.auto = false;
  }
  zoom(d) {
    const P = this.pose;
    if (this.tween) this.tween = null;
    if (this.view === 'cockpit') { P.fov = clamp(P.fov + d * 30, 45, 85); return; }
    const near = this.view === 'wheel' || this.view === 'engine' || this.view === 'focus';
    const room = this.roomSize;
    const maxD = this.mode === 'dealer' ? 10 : room === HALL ? 11 : 8.5;
    P.dist = clamp(P.dist * Math.exp(d), near ? 1.2 : 3.2, near ? 5 : maxD);
  }

  update(dt, camera) {
    this.time += dt;
    this.updateLook(dt);
    // the bulbs in the old shed flicker a touch
    if (this.level === 1 && this.mode !== 'dealer') {
      this.flicker = 0.92 + Math.sin(this.time * 23) * 0.03 + (Math.random() < 0.01 ? -0.35 : 0);
      const S = this.lookState;
      for (let i = 0; i < 4; i++) this.rig.fill[i].intensity = S.fill.k * (this.rf.fill[i] || 0) * this.flicker;
    } else this.flicker = 1;
    const now = performance.now();
    if (!this.drag.auto && !this.drag.on && this.view === 'free' && now - this.drag.last > 6000) this.drag.auto = true;
    let target = this.camTarget, camWanted = null;
    const C = this._cv || (this._cv = { t: new THREE.Vector3(), w: new THREE.Vector3(), d: new THREE.Vector3(), p: new THREE.Vector3() });
    if (this.lineup) {
      const m = this.lineup[this.lineIdx];
      target = C.t.copy(m.group.position).setY(0.75);
      camWanted = C.w.copy(target).add(C.d.set(Math.sin(0.45 + Math.sin(this.time * 0.15) * 0.12) * 7.4, 1.7, Math.cos(0.45) * 7.4));
      target.x += 1.9; target.z -= 0.6;
      for (const c of this.lineup) c.group.rotation.y = damp(c.group.rotation.y, c === m ? -0.35 + Math.sin(this.time * 0.2) * 0.1 : c.group.rotation.y, 2, dt);
    } else if (this.car) {
      const c = this.car;
      // idle spin: the car turns on its platform (the camera stays), or the camera orbits
      const spin = this.drag.auto && this.view === 'free' && this.focus !== 'story' && !this.engineOn;
      if (spin) {
        const da = dt * (this.mode === 'dealer' ? 0.2 : 0.15);
        if (this.mode === 'dealer' || this.turntable) {
          c.group.rotation.y += da; this.pose.yaw -= da;
          if (this.mode === 'dealer' && this.podium) this.podium.rotation.y = c.group.rotation.y;
          else if (this.turntable) this.turntable.rotation.y = c.group.rotation.y;
        } else this.pose.yaw += dt * 0.12;
      }
      this.hood = damp(this.hood || 0, this.focus === 'story' ? 0 : this.hoodT || 0, 4, dt);
      c.openHood(this.hood);
      // eased move between poses
      let P = this.pose;
      if (this.tween) {
        const T = this.tween;
        T.t = Math.min(1, T.t + dt / T.dur);
        const e = ease(T.t), a = T.from, b = T.to;
        P.p.copy(a.p).lerp(b.p, e);
        P.yaw = angLerp(a.yaw, b.yaw, e);
        P.pitch = lerp(a.pitch, b.pitch, e);
        P.dist = Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), e));
        P.fov = lerp(a.fov, b.fov, e);
        if (T.t >= 1) this.tween = null;
      }
      c.group.updateMatrixWorld();
      const pv = c.group.localToWorld(C.p.copy(P.p));
      const wy = c.group.rotation.y + P.yaw;
      const dir = C.d.set(Math.sin(wy) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(wy) * Math.cos(P.pitch));
      camWanted = C.w.copy(pv).addScaledVector(dir, P.dist);
      if (this.view === 'free' && !this.tween) camWanted.y += Math.sin(this.time * 0.13) * 0.08;
      target = C.t.copy(pv);
      this.camPos.copy(camWanted);
      this.camTarget.copy(target);
      camWanted = null;
      camera.fov = P.fov;
    }
    if (this.doorTarget > 0) {
      camWanted = C.w.set(0.8, 1.6, -(this.doorZ || ROOM.d / 2) * 0.6);
      target = C.t.set(0, 1.2, (this.doorZ || ROOM.d / 2) + 4);
    }
    if (camWanted) {
      this.camPos.x = damp(this.camPos.x, camWanted.x, 2.4, dt); this.camPos.y = damp(this.camPos.y, camWanted.y, 2.4, dt); this.camPos.z = damp(this.camPos.z, camWanted.z, 2.4, dt);
      this.camTarget.x = damp(this.camTarget.x, target.x, 3, dt); this.camTarget.y = damp(this.camTarget.y, target.y, 3, dt); this.camTarget.z = damp(this.camTarget.z, target.z, 3, dt);
      camera.fov = damp(camera.fov, this.lineup ? 48 : 46, 3, dt);
    }
    // keep the camera inside the room (the cockpit is inside the car anyway)
    if (this.view !== 'cockpit' || this.lineup) {
      const RM = this.roomSize;
      this.camPos.x = clamp(this.camPos.x, -RM.w / 2 + 0.6, RM.w / 2 - 0.6);
      this.camPos.z = clamp(this.camPos.z, -RM.d / 2 + 0.6, RM.d / 2 - 0.6);
      this.camPos.y = clamp(this.camPos.y, 0.28, RM.h - 0.4);
    }
    camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; camera.position.x += (Math.random() - 0.5) * this.shake * 0.15; camera.position.y += (Math.random() - 0.5) * this.shake * 0.15; }
    camera.lookAt(this.camTarget);
    camera.near = this.view === 'cockpit' && !this.lineup ? 0.04 : 0.15;
    camera.updateProjectionMatrix();
    // door
    this.door = damp(this.door, this.doorTarget, 1.3, dt);
    if (this.doorMesh) {
      this.doorMesh.scale.y = Math.max(0.02, 1 - this.door);
      this.doorMesh.position.y = 3.45 - (3.45 * (1 - this.door)) / 2;
    }
    if (this.hallDoor) this.hallDoor.position.y = this.door * 4.9;
    this.rig.door.intensity = this.door * 220;
    // lamps + engine
    this.lampK = damp(this.lampK, this.lamps ? 1 : 0, 9, dt);
    this.applyLamps(false);
    this.placeHeadBeams();
    this.updateEngine(dt);
    // dust motes in the old rooms
    if (this.motes && this.mode !== 'dealer' && Math.random() < dt * 6) this.particles.soft.emit(-2.6 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, -ROOM.d / 2 + 2 + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.05, -0.02, (Math.random() - 0.5) * 0.05, 6, 0.05, 0.05, 0.5, 1, 0.95, 0.85, 0, 0.1);
    this.particles.setScale(this.renderer.domElement.height);
    this.particles.update(dt);
  }

  // called right before the frame is drawn with the real camera (floor mirror on 'high')
  prepareRender(camera) {
    if (this.reflect && this.mode !== 'dealer') this.renderReflection(camera);
  }

  // leaving the garage: silence the engine, reset the cockpit glass and camera near plane
  leave() {
    this.stopEngine(true);
    this.setCockpitGlass(false);
    if (this.view !== 'free') this.setView('free', true);
  }
}

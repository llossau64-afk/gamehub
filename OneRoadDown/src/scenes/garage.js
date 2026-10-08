// The workshop: a real 3D room that grows with the garage level. Hosts the selected
// car on a slow orbit camera, focuses on parts for upgrades, plays install
// animations, shows the three starters side by side and opens the roller door.

import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { mats } from '../gfx/materials.js';
import * as TX from '../gfx/textures.js';
import { CarModel, roundedBox, beam, buildWheel } from '../models/carModel.js';
import { clamp, lerp, damp, rng } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { Particles } from '../gfx/particles.js';
import { cloneAsset, hasAsset } from '../world/assets.js';

const ROOM = { w: 13, d: 15, h: 5.2 };
const SHOW = { w: 24, d: 18, h: 6.5 };

export class Garage {
  constructor(renderer, quality) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0c);
    this.scene.fog = new THREE.Fog(0x0b0b0c, 18, 40);
    this.level = 0;
    this.room = null;
    this.cars = [];
    this.car = null;
    this.camPos = new THREE.Vector3(5, 2, 6);
    this.camTarget = new THREE.Vector3(0, 0.6, 0);
    this.orbit = { a: 0.7, r: 6.6, h: 1.75, auto: true, drag: false };
    this.focus = null;
    this.door = 0;
    this.doorTarget = 0;
    this.particles = new Particles(this.scene, quality);
    this.time = 0;
    this.lineup = null;
    this.lineIdx = 0;
    this.makeEnv();
  }

  makeEnv() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const sc = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), new THREE.MeshBasicMaterial({ color: 0x2a2a2a, side: THREE.BackSide }));
    sc.add(box);
    for (const [x, z] of [[-4, 0], [4, 0], [0, -6], [0, 6]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      p.rotation.x = Math.PI / 2; p.position.set(x, 3.9, z); sc.add(p);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ color: 0x8ea2b4 }));
    door.position.set(0, 1, 9.9); door.rotation.y = Math.PI; sc.add(door);
    this.envTex = pm.fromScene(sc, 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;
  }

  // ------------------------------------------------------------- room
  setLevel(level) {
    if (level === this.level && this.room) return;
    this.level = level;
    if (this.room) { this.scene.remove(this.room); this.room.traverse((o) => { if (o.isMesh && !o.userData.keep) o.geometry.dispose(); }); }
    const g = (this.room = new THREE.Group());
    const L = level;
    const R = rng(level * 17 + 3);
    const { w, d, h } = ROOM;
    // floor
    const floorMat = new THREE.MeshStandardMaterial({
      map: TX.concreteTexture(20 + L, L >= 4 ? 0.55 : L >= 3 ? 1.05 : 0.85), roughness: L >= 5 ? 0.18 : L >= 4 ? 0.35 : 0.85, metalness: 0,
      color: L >= 5 ? 0x5a5c60 : L >= 4 ? 0x6a6c70 : 0xffffff,
    });
    floorMat.map = floorMat.map.clone(); floorMat.map.repeat.set(4, 4); floorMat.map.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    if (L <= 3) {
      const stains = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, d * 0.8), new THREE.MeshStandardMaterial({ map: TX.oilStains(), transparent: true, roughness: 0.4, depthWrite: false, opacity: L === 1 ? 1 : 0.5 }));
      stains.rotation.x = -Math.PI / 2; stains.position.y = 0.004; g.add(stains);
    }
    if (L >= 2) { // painted bay lines
      const lm = new THREE.MeshStandardMaterial({ color: L >= 4 ? 0xe2a33b : 0xc9c3b0, roughness: 0.6 });
      for (const x of [-2.6, 2.6]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 7.5), lm); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.006, 0.5); g.add(l); }
    }
    if (L >= 4) { // turntable
      const tt = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.3, metalness: 0.6 }));
      tt.position.y = 0.03; tt.receiveShadow = true; g.add(tt);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.025, 6, 64), new THREE.MeshStandardMaterial({ color: 0xe2a33b, emissive: 0xe2a33b, emissiveIntensity: 0.6 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.065; g.add(ring);
      this.turntable = tt;
    } else this.turntable = null;
    // walls
    const wallMat = L === 1 ? mats.woodDark : L === 2 ? new THREE.MeshStandardMaterial({ map: TX.blockWallTexture([132, 128, 118]), roughness: 0.95 })
      : L === 3 ? new THREE.MeshStandardMaterial({ map: TX.blockWallTexture([206, 204, 198]), roughness: 0.9 })
        : L === 4 ? new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.7, metalness: 0.2 }) : new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.25 });
    if (wallMat.map) { wallMat.map = wallMat.map.clone(); wallMat.map.repeat.set(4, 1.6); wallMat.map.needsUpdate = true; }
    const wall = (W, H, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m; };
    wall(d, h, -w / 2, 0, Math.PI / 2);
    wall(d, h, w / 2, 0, -Math.PI / 2);
    wall(w, h, 0, -d / 2, 0);
    // front wall with door opening (door is 4.6 wide x 3.4 high)
    const sideW = (w - 4.8) / 2;
    const fw1 = wall(sideW, h, -w / 2 + sideW / 2, d / 2, Math.PI); const fw2 = wall(sideW, h, w / 2 - sideW / 2, d / 2, Math.PI);
    const lintel = new THREE.Mesh(new THREE.PlaneGeometry(4.8, h - 3.5), wallMat); lintel.position.set(0, 3.5 + (h - 3.5) / 2, d / 2); lintel.rotation.y = Math.PI; g.add(lintel);
    if (L >= 3) { // wall stripe
      const st = new THREE.MeshStandardMaterial({ color: L >= 4 ? 0xe2a33b : 0x2c4a6a, roughness: 0.6, emissive: L >= 4 ? 0xe2a33b : 0, emissiveIntensity: L >= 4 ? 0.5 : 0 });
      for (const [x, z, ry, len] of [[-w / 2 + 0.01, 0, Math.PI / 2, d], [w / 2 - 0.01, 0, -Math.PI / 2, d], [0, -d / 2 + 0.01, 0, w]]) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(len, L >= 4 ? 0.05 : 0.35), st); s.position.set(x, L >= 4 ? 2.6 : 1.2, z); s.rotation.y = ry; g.add(s);
      }
    }
    // ceiling + beams
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), L <= 2 ? mats.woodDark : new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = h; g.add(ceil);
    const beams = [];
    for (let z = -d / 2 + 1.5; z < d / 2; z += 3) { const b = new THREE.BoxGeometry(w, 0.3, 0.22); b.translate(0, h - 0.15, z); beams.push(b); }
    g.add(new THREE.Mesh(mergeGeometries(beams), L <= 2 ? mats.woodDark : mats.darkSteel));
    // roller door
    const doorMat = new THREE.MeshStandardMaterial({ map: TX.corrugatedTexture(), roughness: 0.7, metalness: 0.5, color: L >= 4 ? 0x6a6e74 : 0xbab4a8 });
    this.doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.45), doorMat);
    this.doorMesh.position.set(0, 1.72, d / 2 - 0.05); this.doorMesh.rotation.y = Math.PI;
    g.add(this.doorMesh);
    // outside light behind the door
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshBasicMaterial({ color: 0xc7d3dc }));
    outside.position.set(0, 4, d / 2 + 3); outside.rotation.y = Math.PI; g.add(outside);
    this.doorLight = new THREE.SpotLight(0xdbe6f0, 0, 26, 0.7, 0.6, 1.2);
    this.doorLight.position.set(0, 3, d / 2 + 2); this.doorLight.target.position.set(0, 0, 0);
    g.add(this.doorLight, this.doorLight.target);
    // window with light shaft on the back wall
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ color: 0xbfcbd2 }));
    win.position.set(-3.5, 3.4, -d / 2 + 0.02); g.add(win);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.06), mats.woodDark); frame.position.set(-3.5, 3.4, -d / 2 + 0.05); g.add(frame);
    const frame2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), mats.woodDark); frame2.position.set(-3.5, 3.4, -d / 2 + 0.05); g.add(frame2);
    if (L <= 3) {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 6, 4, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.045, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      shaft.position.set(-2.6, 2.4, -d / 2 + 2.2); shaft.rotation.set(0.75, Math.PI / 4, 0); g.add(shaft);
    }
    // lights
    this.lights = [];
    const amb = new THREE.HemisphereLight(0xd8d4cc, 0x2a2622, L === 1 ? 0.6 : 1.0 + L * 0.22); g.add(amb);
    const key = new THREE.SpotLight(L >= 4 ? 0xf4f6ff : 0xffe2b8, L === 1 ? 70 : 110, 16, 0.85, 0.55, 1.4);
    key.position.set(0.5, h - 0.3, 0.8); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    g.add(key, key.target);
    this.keyLight = key;
    const fixtures = [];
    const lampPos = L === 1 ? [[0.5, 0.8]] : L === 2 ? [[-2, 0], [2, 0]] : [[-2.5, -3], [2.5, -3], [-2.5, 3], [2.5, 3]];
    for (const [x, z] of lampPos) {
      if (L <= 2) {
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
        shade.position.set(x, h - 1.2, z); g.add(shade);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b8 }));
        bulb.position.set(x, h - 1.3, z); g.add(bulb);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1), mats.plastic); cord.position.set(x, h - 0.6, z); g.add(cord);
        const pl = new THREE.PointLight(0xffd9a8, L === 1 ? 6 : 8, 9, 1.6); pl.position.set(x, h - 1.4, z); g.add(pl);
        this.lights.push({ light: pl, base: pl.intensity, bulb });
      } else {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(L >= 5 ? 2.6 : 1.6, 0.06, L >= 5 ? 1.2 : 0.14), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: L >= 4 ? 0xeaf0ff : 0xf8f4e8, emissiveIntensity: 2 }));
        tube.position.set(x, h - 0.4, z); g.add(tube);
        const pl = new THREE.PointLight(L >= 4 ? 0xeef2ff : 0xfff6e6, 9, 11, 1.4); pl.position.set(x, h - 0.7, z); g.add(pl);
        this.lights.push({ light: pl, base: pl.intensity });
      }
    }
    // ---- props
    this.buildProps(g, L, R);
    this.scene.add(g);
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
    // left wall: bench with pegboard, tool chest
    put('g_bench', -w / 2 + 0.45, -3.2, E);
    put('g_drums', w / 2 - 1.2, -5.8, 0.3);
    put('g_jack', 3.4, 4.2, 2.6);
    if (L >= 2) { put('g_toolchest', -w / 2 + 0.45, 0.6, E); put('g_shelf', 2.6, -d / 2 + 0.4, 0); put('g_compressor', w / 2 - 0.6, 4.8, W); }
    if (L >= 3) { put('g_lift', w / 2 - 1.3, 1.2, W); put('g_tirerack', -2.6, -d / 2 + 0.4, 0); put('g_engine', -4.5, 4.4, 2.2); put('g_hoist', -3.6, 5.3, 2.0); }
    if (L >= 4) { put('fridge', -w / 2 + 0.55, 3.0, E); put('g_lounge', -0.3, -d / 2 + 2.0, 0); }
    if (L >= 5) { put('g_bar', 4.6, -d / 2 + 0.5, 0); }
    // pendant lamps (old shed) or fluorescent fixtures
    if (L <= 2 && hasAsset('barnlamp')) {
      for (const [x, z] of L === 1 ? [[0.5, 0.8], [-3.5, -3]] : [[-2, 0], [2, 0], [-3.5, -3]]) {
        put('barnlamp', x, z, 0, h - 1.5, 2.6);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.2), mats.plastic); cord.position.set(x, h - 0.6, z); g.add(cord);
      }
    } else if (L >= 3) {
      for (const [x, z] of [[-2.5, -3], [2.5, -3], [-2.5, 3], [2.5, 3]]) put('g_fixture', x, z, 0, h - 0.75);
    }
    // posters stay: they make it personal
    for (const [k, x] of [['map', -0.6], ['oil', 4.6], ['race', -5.2]]) {
      if (k === 'race' && L < 2) continue;
      if (L >= 4 && k === 'map') continue;
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05), new THREE.MeshStandardMaterial({ map: TX.posterTexture(k), roughness: 0.9 }));
      pm.position.set(x, 2.7, -d / 2 + 0.02); g.add(pm);
    }
    if (L >= 4) { // covered project car in the corner
      const cover = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), new THREE.MeshStandardMaterial({ color: 0x34363a, roughness: 0.95 }));
      cover.scale.set(1.0, 0.62, 2.3); cover.position.set(4.6, 0.55, -3.6); cover.rotation.y = 0.15; cover.castShadow = true; g.add(cover);
    }
    this.motes = L <= 3;
  }

  buildProps(g, L, R) {
    if (hasAsset('g_bench')) return this.buildAssetProps(g, L);
    const { w, d, h } = ROOM;
    const add = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    // workbench along the left wall
    const bench = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.9), L >= 4 ? mats.darkSteel : mats.wood); top.position.y = 0.92; bench.add(top);
    for (const x of [-1.7, 1.7]) for (const z of [-0.38, 0.38]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.92, 0.07), mats.darkSteel); leg.position.set(x, 0.46, z); bench.add(leg); }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.04, 0.8), mats.woodDark); shelf.position.y = 0.25; bench.add(shelf);
    const vise = new THREE.Mesh(roundedBox(0.25, 0.18, 0.3, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a5a7a, metalness: 0.5, roughness: 0.4 })); vise.position.set(1.4, 1.05, 0); bench.add(vise);
    // tools on the bench: wrenches, hammer, oil can
    for (let i = 0; i < 5; i++) {
      const wr = new THREE.Mesh(new THREE.BoxGeometry(0.28 + i * 0.03, 0.012, 0.035), mats.steel);
      wr.position.set(-1.2 + i * 0.16, 0.97, 0.15 + (i % 2) * 0.1); wr.rotation.y = 0.2 * i; bench.add(wr);
    }
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.24, 14), new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.5, metalness: 0.4 })); can.position.set(0.3, 1.08, -0.2); bench.add(can);
    const lampArm = new THREE.Mesh(beam([0, 0.96, -0.35], [0.1, 1.6, -0.1], 0.015), mats.darkSteel); bench.add(lampArm);
    add(bench, -w / 2 + 0.55, 0, -2.5, Math.PI / 2);
    // pegboard with tool silhouettes
    const peg = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.4), new THREE.MeshStandardMaterial({ map: TX.pegboardTexture(), roughness: 0.9 }));
    add(peg, -w / 2 + 0.03, 1.9, -2.5, Math.PI / 2);
    for (let i = 0; i < 9; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32 + (i % 3) * 0.1, 0.04), mats.steel);
      add(t, -w / 2 + 0.06, 1.9 + (i % 2) * 0.2, -3.9 + i * 0.32);
    }
    // tool chest (red, the one thing everyone owns)
    const chest = new THREE.Mesh(roundedBox(1.0, 1.05, 0.55, 0.03), new THREE.MeshStandardMaterial({ color: L >= 4 ? 0x1d1f22 : 0x8e2219, roughness: 0.4, metalness: 0.4 }));
    add(chest, -w / 2 + 0.5, 0.53, 0.6, Math.PI / 2);
    for (let i = 0; i < 5; i++) { const dr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.8), mats.chrome); add(dr, -w / 2 + 0.79, 0.25 + i * 0.18, 0.6); }
    // tyre stack
    const tw = buildWheel(0.32, 0.22, 'steel', 'street', false);
    for (let i = 0; i < (L === 1 ? 3 : 5); i++) {
      const t = tw.userData.tire.clone(); t.rotation.z = Math.PI / 2; add(t, w / 2 - 0.9, 0.12 + i * 0.23, -5.6 + (i % 2) * 0.05);
    }
    // oil drums
    const drumGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18);
    const drumMat = new THREE.MeshStandardMaterial({ color: L <= 2 ? 0x34503a : 0x2b4a6e, roughness: 0.6, metalness: 0.5 });
    for (const [x, z] of [[w / 2 - 0.5, -3.6], [w / 2 - 1.2, -3.9]]) add(new THREE.Mesh(drumGeo, drumMat), x, 0.45, z);
    // shelving with boxes on the back wall
    const sh = new THREE.Group();
    for (const y of [0.4, 1.2, 2.0]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 0.5), L >= 4 ? mats.darkSteel : mats.woodDark); p.position.y = y; sh.add(p); }
    for (const x of [-1.45, 1.45]) { const u = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.5), mats.darkSteel); u.position.set(x, 1.1, 0); sh.add(u); }
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.35 + R() * 0.3, 0.25 + R() * 0.2, 0.35), R() < 0.5 ? mats.cardboard : new THREE.MeshStandardMaterial({ color: [0x8a2a1e, 0x2b4a6e, 0xc9a227][i % 3], roughness: 0.5 }));
      b.position.set(-1.2 + (i % 4) * 0.75, 0.55 + Math.floor(i / 4) * 0.8, 0); sh.add(b);
    }
    add(sh, 2.4, 0, -d / 2 + 0.35);
    // posters
    const posters = [['map', -0.6], ['oil', 4.6], ['race', -5.8]];
    for (const [k, x] of posters) {
      if (k === 'race' && L < 2) continue;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05), new THREE.MeshStandardMaterial({ map: TX.posterTexture(k), roughness: 0.9 }));
      add(p, x, 2.6, -d / 2 + 0.02).castShadow = false;
    }
    // two-post lift on the right
    const lift = new THREE.Group();
    for (const z of [-1.6, 1.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.6, 0.3), new THREE.MeshStandardMaterial({ color: L >= 3 ? 0x2c5a8a : 0x6a6a5a, roughness: 0.5, metalness: 0.5 }));
      post.position.set(0, 1.8, z); lift.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.12), mats.darkSteel); arm.position.set(-0.8, 0.5, z * 0.85); lift.add(arm);
    }
    add(lift, w / 2 - 0.9, 0, 1.6);
    // jack + creeper
    const jack = new THREE.Mesh(roundedBox(0.35, 0.18, 1.0, 0.03), new THREE.MeshStandardMaterial({ color: 0xb8301e, metalness: 0.4, roughness: 0.5 }));
    add(jack, 3.2, 0.1, 3.6, 0.4);
    if (L >= 2) { // compressor
      const comp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 16), new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.5, metalness: 0.3 }));
      comp.rotation.z = Math.PI / 2; add(comp, w / 2 - 0.8, 0.35, 4.5);
    }
    if (L >= 3) { // diagnostics cart
      const cart = new THREE.Group();
      const base = new THREE.Mesh(roundedBox(0.6, 0.9, 0.5, 0.03), mats.darkSteel); base.position.y = 0.45; cart.add(base);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshStandardMaterial({ color: 0x0a1a12, emissive: 0x3aa06a, emissiveIntensity: 0.8 }));
      scr.position.set(0, 1.15, 0.05); scr.rotation.x = -0.2; cart.add(scr);
      add(cart, -3.4, 0, 4.2, 2.4);
      // tyre changer
      const tc = new THREE.Mesh(roundedBox(0.7, 1.0, 0.7, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.5, metalness: 0.3 }));
      add(tc, w / 2 - 1.1, 0.5, -1.6);
    }
    if (L >= 4) { // covered project car
      const cover = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.95 }));
      cover.scale.set(1.0, 0.65, 2.3); add(cover, -4.4, 0.55, -5.4, 0.1);
    }
    if (L >= 5) { // trophy shelf
      const ts = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.35), mats.chrome); add(ts, -2.6, 2.1, -d / 2 + 0.2);
      for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.3 + (i % 2) * 0.1, 10), new THREE.MeshStandardMaterial({ color: 0xd0a14a, metalness: 1, roughness: 0.25 })); add(t, -3.6 + i * 0.5, 2.3, -d / 2 + 0.2); }
    }
    // dust motes in the light
    this.motes = L <= 3;
  }

  // ------------------------------------------------------------- dealership
  // 'workshop' (the player's garage) or 'dealer' (the exotic car showroom)
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'dealer' && !this.showroom) this.buildShowroom();
    if (this.room) this.room.visible = mode !== 'dealer';
    if (this.showroom) this.showroom.visible = mode === 'dealer';
    this.scene.fog.near = mode === 'dealer' ? 30 : 18; this.scene.fog.far = mode === 'dealer' ? 70 : 40;
    this.scene.background.setHex(mode === 'dealer' ? 0xd7dde2 : 0x0b0b0c);
    this.orbit.r = mode === 'dealer' ? 7.4 : 6.6;
    if (mode !== 'dealer') this.setSideCars([]);
  }

  buildShowroom() {
    const g = (this.showroom = new THREE.Group());
    const S = SHOW;
    // polished floor, light walls, glass front
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.14, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), new THREE.MeshStandardMaterial({ map: TX.concreteTexture(7, 0.25), transparent: true, opacity: 0.25, roughness: 0.2, depthWrite: false }));
    tiles.material.map = tiles.material.map.clone(); tiles.material.map.repeat.set(6, 5); tiles.material.map.needsUpdate = true;
    tiles.rotation.x = -Math.PI / 2; tiles.position.y = 0.002; g.add(tiles);
    const wallM = new THREE.MeshStandardMaterial({ color: 0xe6e3dd, roughness: 0.8 });
    const darkM = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.3 });
    const wall = (W, H, x, z, ry, m = wallM) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m); o.position.set(x, H / 2, z); o.rotation.y = ry; o.receiveShadow = true; g.add(o); return o; };
    wall(S.d, S.h, -S.w / 2, 0, Math.PI / 2);
    wall(S.d, S.h, S.w / 2, 0, -Math.PI / 2);
    wall(S.w, S.h, 0, -S.d / 2, 0, new THREE.MeshStandardMaterial({ color: 0x8c8b88, roughness: 0.85 }));
    const signBack = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.8), darkM); signBack.position.set(0, 4.6, -S.d / 2 + 0.02); g.add(signBack);
    // brand wall with backlit name (fictional dealer)
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
    const x2 = c.getContext('2d'); x2.fillStyle = '#16171a'; x2.fillRect(0, 0, 1024, 160);
    x2.fillStyle = '#f2ede2'; x2.font = '600 92px "Barlow Condensed", Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
    x2.fillText('MONTAGNA  MOTORS', 512, 84);
    const nameTex = new THREE.CanvasTexture(c); nameTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.25), new THREE.MeshStandardMaterial({ map: nameTex, emissiveMap: nameTex, emissive: 0xffffff, emissiveIntensity: 0.9 }));
    sign.position.set(0, 4.6, -S.d / 2 + 0.03); g.add(sign);
    // glass front with mullions and a bright outside
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshPhysicalMaterial({ color: 0xbfd0dc, roughness: 0.05, transparent: true, opacity: 0.18 }));
    glass.position.set(0, S.h / 2, S.d / 2); glass.rotation.y = Math.PI; g.add(glass);
    for (let k = -4; k <= 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, S.h, 0.12), darkM); m.position.set(k * S.w / 9, S.h / 2, S.d / 2); g.add(m); }
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ color: 0xdfe8ee }));
    outside.position.set(0, 6, S.d / 2 + 6); outside.rotation.y = Math.PI; g.add(outside);
    // ceiling with light strips
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.d), new THREE.MeshStandardMaterial({ color: 0xb8b6b2, roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = S.h; g.add(ceil);
    const stripM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f6ff, emissiveIntensity: 2.2 });
    for (let k = -3; k <= 3; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(S.w * 0.85, 0.05, 0.16), stripM); st.position.set(0, S.h - 0.05, k * 2.2); g.add(st); }
    g.add(new THREE.HemisphereLight(0xf2f4f8, 0x6a6662, 2.4));
    for (const [x, z] of [[-6, -4], [6, -4], [-6, 4], [6, 4], [0, 5]]) { const pl = new THREE.PointLight(0xfff8ee, 30, 16, 1.4); pl.position.set(x, S.h - 0.6, z); g.add(pl); }
    const key = new THREE.SpotLight(0xffffff, 260, 22, 0.55, 0.45, 1.3);
    key.position.set(0, S.h - 0.3, 1.5); key.target.position.set(0, 0, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
    g.add(key, key.target);
    for (const x of [-7, 7]) { const sp = new THREE.SpotLight(0xfff4e6, 120, 16, 0.5, 0.5, 1.4); sp.position.set(x, S.h - 0.3, -2); sp.target.position.set(x, 0, -3.5); g.add(sp, sp.target); }
    // the turntable podium and two side plinths
    const pod = cloneAsset('g_podium');
    if (pod) {
      const top = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.16, metalness: 0.65 });
      pod.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.userData.keep = true; if (/checker/.test(m.material.name)) m.material = top; } });
      g.add(pod); this.podium = pod;
    }
    const st = cloneAsset('g_stanchions'); if (st) g.add(st);
    for (const x of [-7, 7]) {
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.12, 48), darkM); pl.position.set(x, 0.06, -3.5); pl.receiveShadow = true; g.add(pl);
    }
    // a lounge corner for the customers
    const lounge = cloneAsset('g_lounge'); if (lounge) { lounge.position.set(-8.5, 0, 6); lounge.rotation.y = Math.PI * 0.75; g.add(lounge); }
    const bar = cloneAsset('g_bar'); if (bar) { bar.position.set(8.8, 0, 6.5); bar.rotation.y = -Math.PI / 2; g.add(bar); }
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
  showCar(car, opts) {
    this.clearCars();
    const m = new CarModel(car, opts);
    m.setStaticWheels(0);
    m.group.position.set(0, -m.dims.yG + (this.mode === 'dealer' ? 0.16 : 0), 0);
    m.group.rotation.y = 0.0;
    this.scene.add(m.group);
    this.car = m;
    this.cars = [m];
    this.lineup = null;
    return m;
  }
  showLineup(cars) {
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
    for (const c of this.cars) { this.scene.remove(c.group); c.dispose(); }
    this.cars = []; this.car = null;
  }

  // focus a part: engine | wheel | suspension | front | rear | cabin | under | null
  setFocus(f) { this.focus = f; if (this.car) this.hoodT = f === 'engine' ? 1 : 0; }

  async install(cat) {
    const a = audio();
    const c = this.car;
    if (!c) return;
    const p = this.focusPoint(this.focus || 'front');
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
  // camera offset (car local) for each focus
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

  bindPointer(el) {
    let lx = 0;
    el.addEventListener('pointerdown', (e) => { if (e.target !== el) return; this.orbit.drag = true; this.orbit.auto = false; lx = e.clientX; this.lastDrag = performance.now(); });
    window.addEventListener('pointermove', (e) => { if (!this.orbit.drag) return; this.orbit.a -= (e.clientX - lx) * 0.006; lx = e.clientX; this.lastDrag = performance.now(); });
    window.addEventListener('pointerup', () => { this.orbit.drag = false; });
    el.addEventListener('wheel', (e) => { this.orbit.r = clamp(this.orbit.r + e.deltaY * 0.004, 4.2, 9); }, { passive: true });
  }

  update(dt, camera) {
    this.time += dt;
    if (!this.orbit.auto && !this.orbit.drag && performance.now() - (this.lastDrag || 0) > 5000) this.orbit.auto = true;
    if (this.orbit.auto && !this.focus) this.orbit.a += dt * 0.12;
    // lights flicker a touch in the old shed
    for (const l of this.lights) {
      if (this.level === 1) l.light.intensity = l.base * (0.92 + Math.sin(this.time * 23) * 0.03 + (Math.random() < 0.01 ? -0.35 : 0));
    }
    // car target
    let target = new THREE.Vector3(0, 0.7, 0), camWanted;
    if (this.lineup) {
      const m = this.lineup[this.lineIdx];
      target.copy(m.group.position).setY(0.75);
      camWanted = target.clone().add(new THREE.Vector3(Math.sin(0.45 + Math.sin(this.time * 0.15) * 0.12) * 7.4, 1.7, Math.cos(0.45) * 7.4));
      // frame the car left of centre so the stat card does not cover it
      target.x += 1.9; target.z -= 0.6;
      for (const c of this.lineup) c.group.rotation.y = damp(c.group.rotation.y, c === m ? -0.35 + Math.sin(this.time * 0.2) * 0.1 : c.group.rotation.y, 2, dt);
    } else if (this.car) {
      const c = this.car;
      if (this.mode === 'dealer') { c.group.rotation.y += dt * 0.2; if (this.podium) this.podium.rotation.y = c.group.rotation.y; }
      else if (this.turntable && this.orbit.auto && !this.focus) { c.group.rotation.y += dt * 0.15; this.turntable.rotation.y = c.group.rotation.y; }
      c.openHood(damp(c.hood || 0, this.hoodT || 0, 4, dt));
      const fc = this.focus ? this.focusCam(this.focus) : null;
      if (fc) {
        c.group.updateMatrixWorld();
        camWanted = c.group.localToWorld(fc.clone());
        target = c.group.localToWorld(this.focusPoint(this.focus));
      } else {
        const o = this.orbit;
        camWanted = new THREE.Vector3(Math.sin(o.a) * o.r, o.h + Math.sin(this.time * 0.13) * 0.15, Math.cos(o.a) * o.r);
      }
    }
    if (this.doorTarget > 0) {
      // exit sequence: look out of the door
      camWanted = new THREE.Vector3(0.8, 1.6, -4.5);
      target = new THREE.Vector3(0, 1.2, ROOM.d / 2 + 4);
    }
    if (camWanted) {
      this.camPos.x = damp(this.camPos.x, camWanted.x, 2.4, dt); this.camPos.y = damp(this.camPos.y, camWanted.y, 2.4, dt); this.camPos.z = damp(this.camPos.z, camWanted.z, 2.4, dt);
      this.camTarget.x = damp(this.camTarget.x, target.x, 3, dt); this.camTarget.y = damp(this.camTarget.y, target.y, 3, dt); this.camTarget.z = damp(this.camTarget.z, target.z, 3, dt);
    }
    // keep the camera inside the room
    const RM = this.mode === 'dealer' ? SHOW : ROOM;
    this.camPos.x = clamp(this.camPos.x, -RM.w / 2 + 0.6, RM.w / 2 - 0.6);
    this.camPos.z = clamp(this.camPos.z, -RM.d / 2 + 0.6, RM.d / 2 - 0.6);
    this.camPos.y = clamp(this.camPos.y, 0.3, RM.h - 0.4);
    camera.position.copy(this.camPos);
    if (this.shake > 0) { this.shake -= dt; camera.position.x += (Math.random() - 0.5) * this.shake * 0.15; camera.position.y += (Math.random() - 0.5) * this.shake * 0.15; }
    camera.lookAt(this.camTarget);
    camera.fov = damp(camera.fov, this.focus ? 42 : 48, 3, dt); camera.updateProjectionMatrix();
    // door
    this.door = damp(this.door, this.doorTarget, 1.3, dt);
    if (this.doorMesh) {
      this.doorMesh.scale.y = Math.max(0.02, 1 - this.door);
      this.doorMesh.position.y = 3.45 - (3.45 * (1 - this.door)) / 2;
      this.doorLight.intensity = this.door * 220;
    }
    // dust motes
    if (this.motes && Math.random() < dt * 6) this.particles.soft.emit(-2.6 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5, -ROOM.d / 2 + 2 + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.05, -0.02, (Math.random() - 0.5) * 0.05, 6, 0.05, 0.05, 0.5, 1, 0.95, 0.85, 0, 0.1);
    this.particles.setScale(this.renderer.domElement.height);
    this.particles.update(dt);
  }
}

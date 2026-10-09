// The barbershop: room shell, street outside, props, lights and every visible upgrade state.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { spawnProp, part, setSpecialMaterial, meshesByMaterial } from './props.js';
import { propMaterial, addDetail, shared } from '../render/materials.js';
const propColor = (n) => propMaterial(n).color;
import * as T from '../render/textures.js';
import { SHOPS, SUPERMARKET, shopWindowTexture, shopSignTexture } from '../render/shopfronts.js';

// the street runs from STREET.x0 to STREET.x1; side alleys cut into our block
export const STREET = { x0: -46, x1: 46, alleys: [[-27.5, -21.5], [21.5, 27.5]] };
export const SUPER = { x0: -4.5, x1: 9.5, door: 2.5 };
const R0 = { z1: 2.6 };
const PARKED = [[-8.5, 4.2, 0, '#8f2f2a'], [10.5, 10.9, Math.PI, '#3b5f7d'], [16, 4.2, 0, '#d8cfb4'], [-33, 4.2, 0, '#2f4a3a'], [31, 10.9, Math.PI, '#c9922e'], [-15, 10.9, Math.PI, '#e8e4dc'], [40, 4.2, 0, '#1c1c1e']];
const TREES_NEAR = [[-12, 1], [14, 0.9], [-16, 1.1], [-31, 1], [-41, 0.9], [31, 1.05], [42, 0.95]];
const TREES_FAR = [[-9, 0.9], [-1, 1], [12, 0.95], [18, 1], [-30, 1], [-40, 0.9], [31, 1], [41, 0.95]];
const LAMPS_EXTRA = [-18, 18, -36, 36];
import { Spring, clamp, rand, damp, noise1 } from '../core/util.js';
import { audio } from '../audio/audio.js';
import menuPosterUrl from '../assets/menu-poster.jpg?inline';

export const ROOM = { x0: -3.2, x1: 3.2, z0: -2.6, z1: 2.6, h: 2.9 };
export const DOOR = { x: 1.9, w: 0.95 };
export const WINDOW = { x: -1.05, w: 2.9, y0: 0.72, h: 2.0 };

export const SPOTS = {
  chair: new THREE.Vector3(-0.9, 0, -1.45),
  chairFront: new THREE.Vector3(-0.9, 0, -0.62),
  barberStand: new THREE.Vector3(-0.9, 0, -0.55),
  mirror: new THREE.Vector3(-0.9, 1.55, -2.57),
  cart: new THREE.Vector3(-1.85, 0, -1.55),
  capeHook: new THREE.Vector3(-2.05, 1.62, -2.56),
  doorOut: new THREE.Vector3(1.9, 0, 4.2),
  doorStep: new THREE.Vector3(1.9, 0, 3.0),
  doorIn: new THREE.Vector3(1.9, 0, 2.0),
  hub: new THREE.Vector3(1.35, 0, 1.15),
  counter: new THREE.Vector3(-2.2, 0, 1.25),
  playerStart: new THREE.Vector3(0.2, 0, 0.0),
  ownerStart: new THREE.Vector3(-0.2, 0, -0.9),
  lamp: new THREE.Vector3(-0.9, 2.9, -1.25),
  broom: new THREE.Vector3(2.95, 0, 2.25),
};

// the extension behind the right wall (bought later): a third station
export const ANNEX = { x0: 3.2, x1: 6.2, z0: 0.2, z1: 2.6, arch0: 1.05, arch1: 2.3, archH: 2.3 };
export const STATION3 = {
  chair: new THREE.Vector3(4.9, 0, 0.95),
  chairFront: new THREE.Vector3(4.9, 0, 1.78),
  stand: new THREE.Vector3(5.45, 0, 1.35),
  cart: new THREE.Vector3(5.8, 0, 0.8),
};
export const STATION2 = {
  chair: new THREE.Vector3(1.2, 0, -1.45),
  chairFront: new THREE.Vector3(1.2, 0, -0.62),
  stand: new THREE.Vector3(1.75, 0, -1.05),
  cart: new THREE.Vector3(2.1, 0, -1.6),
};

const WAIT_CHAIRS = [
  { pos: new THREE.Vector3(2.88, 0, -1.05), rot: -Math.PI / 2 },
  { pos: new THREE.Vector3(2.88, 0, -0.35), rot: -Math.PI / 2 },
  { pos: new THREE.Vector3(2.88, 0, 0.35), rot: -Math.PI / 2 },
];
const COUCH_SEATS = [
  { pos: new THREE.Vector3(2.75, 0, -0.95), rot: -Math.PI / 2 },
  { pos: new THREE.Vector3(2.75, 0, -0.35), rot: -Math.PI / 2 },
  { pos: new THREE.Vector3(2.75, 0, 0.25), rot: -Math.PI / 2 },
];

function plane(w, h, mat, repeat) {
  const g = new THREE.PlaneGeometry(w, h);
  if (repeat) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat[0] + (repeat[2] || 0), uv.getY(i) * repeat[1] + (repeat[3] || 0));
  }
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

function texMat(map, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: opts.rough ?? 0.85, metalness: 0, color: opts.color ?? 0xffffff });
  if (opts.detail) addDetail(m, opts.detail, opts.scale ?? 3, opts.grime ?? 0.6, { key: 'tex' });
  return m;
}

export class Shop {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.colliders = [];
    this.interactables = [];
    this.anim = [];
    this.state = new Set();
    this.time = 0;
    this.doorSpring = new Spring(0, 60, 9);
    this.bellSpring = new Spring(0, 90, 2.2);
    this.lampFlicker = 1;
    this.flickerTimer = 2;
    this.flickerSeq = [];
    this.fanAngle = 0;
    this.poleOffset = 0;
    this.doorCloseTimer = 0;
    this.slots = {};
    this.build();
  }

  // ------------------------------------------------------------------ build
  build() {
    this.tex = {
      floorOld: T.floorTiles('old'), floorClean: T.floorTiles('clean'), floorWood: T.floorWood(),
      wallOld: T.wallTexture('old'), wallPaint: T.wallTexture('paint'),
      ceiling: T.plasterTexture([220, 212, 194], 8, true), ceilingClean: T.plasterTexture([236, 230, 216], 9, false),
      brick: T.brickTexture([150, 74, 52], 4), brick2: T.brickTexture([120, 96, 80], 6),
      asphalt: T.asphaltTexture(), sidewalk: T.sidewalkTexture(),
      dirt: T.windowDirt(), crack: T.crackTexture(), blob: T.blobShadowTexture(),
    };
        this.buildSky();
    this.buildRoom();
    this.buildExterior();
    this.buildLights();
    this.buildProps();
    this.buildDirt();
    this.optimize();
    this.applyState(new Set());
  }

  // merge static meshes by material and keep shadow casting to the few things that matter
  optimize() {
    const batch = (group) => {
      group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
      const byMat = new Map();
      const victims = [];
      group.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.keep || o.material.transparent) return;
        let p = o.parent, dyn = !!o.userData.dynamic;
        while (p && p !== group.parent) { if (p.userData.dynamic || /^(pivot|hinge|bell|rotor|bulb|stripes|glass|signface|hourHand|minuteHand|screen)/.test(p.name)) dyn = true; p = p.parent; }
        if (dyn || /^(bulb|glass|stripes|signface|screen)/.test(o.name)) return;
        const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        const key = o.material.uuid + (g.attributes.uv ? 'uv' : '');
        if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [], shadow: false });
        const e = byMat.get(key);
        e.geos.push(g.index ? g.toNonIndexed() : g);
        e.shadow ||= o.castShadow;
        victims.push(o);
      });
      for (const o of victims) o.parent.remove(o);
      for (const { mat, geos, shadow } of byMat.values()) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        const m = new THREE.Mesh(merged, mat);
        m.receiveShadow = true;
        m.castShadow = false;
        group.add(m);
      }
    };
    batch(this.exterior);
    batch(this.shellGroup);
    // only big furniture and people cast shadows from the lamp
    const casters = new Set(['chairOld', 'chairClassic', 'cart', 'counter', 'stationOld', 'stationClassic', 'couch', 'waitChairs', 'lampOld', 'lampPendant']);
    for (const [k, o] of Object.entries(this.slots)) {
      o.traverse((m) => { if (m.isMesh) m.castShadow = casters.has(k); });
    }
  }

  buildSky() {
    const g = new THREE.SphereGeometry(60, 24, 12);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#8fa7b8') }, mid: { value: new THREE.Color('#e9cfa8') }, bot: { value: new THREE.Color('#b9a58c') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
        void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(g, m);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#d9c3a2', 18, 55);
  }

  buildRoom() {
    const R = ROOM;
    const shell = new THREE.Group();
    this.shellGroup = shell;
    this.root.add(shell);
    const root = this.root;
    this.root = shell;
    const W = R.x1 - R.x0, D = R.z1 - R.z0;
    // floor
    this.floorMat = texMat(this.tex.floorOld, { rough: 0.6, detail: [0.3, 0, 0, 0.5], scale: 2, grime: 0.8 });
    this.tex.floorOld.repeat.set(2.6, 2.1);
    this.tex.floorClean.repeat.set(2.6, 2.1);
    this.tex.floorWood.repeat.set(1.3, 1.1);
    const floor = plane(W, D, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((R.x0 + R.x1) / 2, 0, 0);
    this.root.add(floor);
    this.floor = floor;
    // ceiling
    this.ceilMat = texMat(this.tex.ceiling, { rough: 0.95 });
    this.tex.ceiling.repeat.set(3, 2.4);
    const ceil = plane(W, D, this.ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, R.h, 0);
    this.root.add(ceil);

    // walls: upper plaster + lower wainscot
    this.wallMat = texMat(this.tex.wallOld, { rough: 0.9, detail: [0.25, 0, 0, 0.3], scale: 2, grime: 0.6 });
    this.tex.wallOld.repeat.set(1.5, 1);
    this.tex.wallPaint.repeat.set(1.5, 1);
    this.wainMat = new THREE.MeshStandardMaterial({ color: '#b7a888', roughness: 0.6 });
    addDetail(this.wainMat, [0.35, 0.3, 0, 0.5], 3, 1, { key: 'wain' });
    this.trimMat = propMaterial('WoodOld');
    const wainH = 1.05;
    const addWall = (x0, x1, y0, y1, z, face, isFront = false) => {
      // face: +1 normal points +z (back wall), -1 normal -z (front wall), or 'x+' / 'x-'
      const w = Math.abs(x1 - x0), h = y1 - y0;
      const mk = (mat, ya, yb) => {
        if (yb <= ya) return;
        const m = plane(w, yb - ya, mat, [w / 4, (yb - ya) / 2.9, x0 / 4, ya / 2.9]);
        m.position.set((x0 + x1) / 2, (ya + yb) / 2, 0);
        return m;
      };
      const g = new THREE.Group();
      const upper = mk(this.wallMat, Math.max(y0, wainH), y1);
      const lower = mk(this.wainMat, y0, Math.min(y1, wainH));
      if (upper) g.add(upper);
      if (lower) g.add(lower);
      return g;
    };
    // back wall (z0) faces +z
    const back = addWall(R.x0, R.x1, 0, R.h);
    back.position.z = R.z0;
    this.root.add(back);
    // left wall (x0) faces +x
    const left = addWall(R.z0, R.z1, 0, R.h);
    left.rotation.y = Math.PI / 2;
    left.position.x = R.x0;
    this.root.add(left);
    // right wall (x1) faces -x, with an archway into the extension (plugged until bought)
    const A = ANNEX;
    const right = new THREE.Group();
    for (const [a, b, c, d] of [[R.z0, A.arch0, 0, R.h], [A.arch0, A.arch1, A.archH, R.h], [A.arch1, R.z1, 0, R.h]]) right.add(addWall(a, b, c, d));
    right.rotation.y = -Math.PI / 2;
    right.position.x = R.x1;
    this.root.add(right);
    this.archPlug = addWall(A.arch0, A.arch1, 0, A.archH);
    this.archPlug.rotation.y = -Math.PI / 2;
    this.archPlug.position.x = R.x1;
    this.archPlug.userData.dynamic = true;
    this.root.add(this.archPlug);
    this.annexWall = addWall;
    // front wall (z1) faces -z, with window + door holes
    const wx0 = WINDOW.x - WINDOW.w / 2 - 0.09, wx1 = WINDOW.x + WINDOW.w / 2 + 0.09;
    const dx0 = DOOR.x - DOOR.w / 2 - 0.08, dx1 = DOOR.x + DOOR.w / 2 + 0.08;
    const wy0 = WINDOW.y0 - 0.09, wy1 = WINDOW.y0 + WINDOW.h + 0.09, dy1 = 2.15 + 0.08;
    const front = new THREE.Group();
    const pieces = [
      [R.x0, wx0, 0, R.h], [wx0, wx1, 0, wy0], [wx0, wx1, wy1, R.h],
      [wx1, dx0, 0, R.h], [dx0, dx1, dy1, R.h], [dx1, R.x1, 0, R.h],
    ];
    for (const [a, b, c, d] of pieces) {
      // mirrored x because the plane is rotated by PI
      const g = addWall(-b, -a, c, d);
      front.add(g);
    }
    front.rotation.y = Math.PI;
    front.position.z = R.z1;
    this.root.add(front);
    // trims: chair rail + baseboards
    const rail = (len, pos, rotY) => {
      const g = new THREE.Group();
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.03), this.trimMat);
      r1.position.y = wainH;
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.022), this.trimMat);
      r2.position.y = 0.06;
      g.add(r1, r2);
      g.position.copy(pos);
      g.rotation.y = rotY;
      r1.receiveShadow = r2.receiveShadow = true;
      return g;
    };
    this.root.add(rail(W, new THREE.Vector3(0, 0, R.z0 + 0.015), 0));
    this.root.add(rail(D, new THREE.Vector3(R.x0 + 0.015, 0, 0), Math.PI / 2));
    this.root.add(rail(D, new THREE.Vector3(R.x1 - 0.015, 0, 0), Math.PI / 2));
    // crown moulding
    const crownMat = propMaterial('PaintedWood');
    for (const [len, pos, ry] of [[W, [0, R.h - 0.04, R.z0 + 0.03], 0], [W, [0, R.h - 0.04, R.z1 - 0.03], 0],
      [D, [R.x0 + 0.03, R.h - 0.04, 0], Math.PI / 2], [D, [R.x1 - 0.03, R.h - 0.04, 0], Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), crownMat);
      m.position.set(...pos); m.rotation.y = ry;
      this.root.add(m);
    }
    // window reveals (wall thickness)
    const revMat = this.wallMat;
    const rev = (w, h, x, y, z, ry) => {
      const m = plane(w, h, revMat);
      m.position.set(x, y, z); m.rotation.y = ry;
      this.root.add(m);
    };
    rev(0.24, wy1 - wy0, wx0, (wy0 + wy1) / 2, R.z1 + 0.12, Math.PI / 2);
    rev(0.24, wy1 - wy0, wx1, (wy0 + wy1) / 2, R.z1 + 0.12, -Math.PI / 2);
    rev(0.24, dy1, dx0, dy1 / 2, R.z1 + 0.12, Math.PI / 2);
    rev(0.24, dy1, dx1, dy1 / 2, R.z1 + 0.12, -Math.PI / 2);
    const top = plane(wx1 - wx0, 0.24, revMat); top.rotation.x = Math.PI / 2; top.position.set(WINDOW.x, wy1, R.z1 + 0.12); this.root.add(top);
    const dtop = plane(dx1 - dx0, 0.24, revMat); dtop.rotation.x = Math.PI / 2; dtop.position.set(DOOR.x, dy1, R.z1 + 0.12); this.root.add(dtop);

    this.root = root;
    // colliders (player)
    const annexOwned = () => this.has('extension');
    this.colliders.push(
      { x0: -99, x1: R.x0 + 0.25, z0: -99, z1: R.z1 },
      // right wall: solid, except through the archway once the extension is open
      { x0: R.x1 - 0.25, x1: 99, z0: -99, z1: ANNEX.arch0 + 0.2 }, { x0: R.x1 - 0.25, x1: 99, z0: ANNEX.arch1 - 0.2, z1: R.z1 },
      { x0: R.x1 - 0.25, x1: 99, z0: ANNEX.arch0, z1: ANNEX.arch1, active: () => !annexOwned() },
      // extension room bounds
      { x0: ANNEX.x1 - 0.25, x1: 99, z0: -99, z1: R.z1, active: annexOwned },
      { x0: R.x1, x1: 99, z0: -99, z1: ANNEX.z0 + 0.25, active: annexOwned },
      { x0: -99, x1: 99, z0: -99, z1: R.z0 + 0.25 },
      // the front wall, with the doorway: you can walk out onto the street
      { x0: STREET.alleys[0][1], x1: DOOR.x - DOOR.w / 2 + 0.02, z0: R.z1 - 0.25, z1: R.z1 + 0.5 },
      { x0: DOOR.x + DOOR.w / 2 - 0.02, x1: STREET.alleys[1][0], z0: R.z1 - 0.25, z1: R.z1 + 0.5 },
      { x0: -199, x1: STREET.alleys[0][0], z0: R.z1 - 0.25, z1: R.z1 + 0.5 },
      { x0: STREET.alleys[1][1], x1: 199, z0: R.z1 - 0.25, z1: R.z1 + 0.5 },
      // the door itself, while it's shut
      { x0: DOOR.x - DOOR.w / 2, x1: DOOR.x + DOOR.w / 2, z0: R.z1 - 0.12, z1: R.z1 + 0.2, active: () => this.doorSpring.value < 0.55 },
      // the street: pavement, road, the far pavement; the other shops are closed to you
      { x0: -199, x1: STREET.x0, z0: -99, z1: 99 }, { x0: STREET.x1, x1: 199, z0: -99, z1: 99 },
      { x0: -99, x1: 99, z0: R.z1 + 13.8, z1: 99 },
    );
  }

  // a lit shop window material for one of the neighbours
  shopWindowMat(shop, aspect, seed) {
    const t = shopWindowTexture(shop, aspect, seed);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.3, metalness: 0.05 });
    (this.shopWinMats ||= []).push(m);
    return m;
  }

  buildExterior() {
    const R = ROOM;
    const g = new THREE.Group();
    this.exterior = g;
    this.root.add(g);
    const brickMat = texMat(this.tex.brick, { rough: 0.9, detail: [0.4, 0, 0.2, 0.2], scale: 2, grime: 0.8 });
    this.tex.brick.repeat.set(4, 3);
    // facade of our building (outer face of the front wall), with holes
    const fz = R.z1 + 0.24;
    const wx0 = WINDOW.x - WINDOW.w / 2 - 0.09, wx1 = WINDOW.x + WINDOW.w / 2 + 0.09;
    const dx0 = DOOR.x - DOOR.w / 2 - 0.08, dx1 = DOOR.x + DOOR.w / 2 + 0.08;
    const wy0 = WINDOW.y0 - 0.09, wy1 = WINDOW.y0 + WINDOW.h + 0.09, dy1 = 2.23;
    const H = 6.4, X0 = R.x0 - 0.3, X1 = R.x1 + 0.3;
    const pcs = [[X0, wx0, 0, H], [wx0, wx1, 0, wy0], [wx0, wx1, wy1, H], [wx1, dx0, 0, H], [dx0, dx1, dy1, H], [dx1, X1, 0, H]];
    for (const [a, b, c, d] of pcs) {
      const w = b - a, h = d - c;
      const m = plane(w, h, brickMat, [w / 2, h / 2, a / 2, c / 2]);
      m.position.set((a + b) / 2, (c + d) / 2, fz);
      g.add(m);
    }
    // stone base + cornice + upper windows
    const stone = propMaterial('Stone');
    const base = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.35, 0.08), stone);
    base.position.set((X0 + X1) / 2, 0.175, fz + 0.04);
    g.add(base);
    const corn = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 0.3, 0.25, 0.35), stone);
    corn.position.set((X0 + X1) / 2, H, fz + 0.1);
    g.add(corn);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.12, 0.2), stone);
    ledge.position.set((X0 + X1) / 2, 3.95, fz + 0.06);
    g.add(ledge);
    const winMat = new THREE.MeshStandardMaterial({ color: '#3c4a55', roughness: 0.15, metalness: 0.3 });
    const frameMat = propMaterial('PaintedWood');
    for (let i = 0; i < 3; i++) {
      const x = -2.2 + i * 2.2;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.3, 0.06), frameMat);
      fr.position.set(x, 5.0, fz + 0.01);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.16), winMat);
      gl.position.set(x, 5.0, fz + 0.045);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.14), stone);
      sill.position.set(x, 4.32, fz + 0.06);
      g.add(fr, gl, sill);
    }
    // neighbours
    const nb = (x0, x1, tint, seed, h, shopIdx) => {
      const t = T.facadeTexture(seed, tint);
      t.repeat.set(1, 1);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      // a single material (multi-material boxes vanish in the static batching)
      const box = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, 6), m);
      box.position.set((x0 + x1) / 2, h / 2, fz - 3 + 0.02);
      g.add(box);
      // shopfront at street level: framed window with a warm glow, a sign and an awning
      const w = x1 - x0, cx = (x0 + x1) / 2;
      const shop = SHOPS[shopIdx ?? ((seed >> 2) % SHOPS.length)];
      const sf = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.9, 2.0), this.shopWindowMat(shop, (w - 0.9) / 2.0, seed));
      sf.position.set(cx, 1.45, fz + 0.03);
      g.add(sf);
      const frame = propMaterial('PaintedWood');
      for (const [sx, sy, x, y] of [[w - 0.7, 0.1, cx, 2.5], [w - 0.7, 0.1, cx, 0.42], [0.1, 2.1, cx - (w - 0.8) / 2, 1.45], [0.1, 2.1, cx + (w - 0.8) / 2, 1.45]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.08), frame); b.position.set(x, y, fz + 0.05); g.add(b);
      }
      const signCol = ['#24344d', '#2f4a3a', '#7a2a26', '#3a2a1e'][seed % 4];
      const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3.2, w - 1.2), 0.42, 0.08), new THREE.MeshStandardMaterial({ color: signCol, roughness: 0.6 }));
      sign.position.set(cx, 2.95, fz + 0.06);
      g.add(sign);
      const sw = Math.min(3.2, w - 1.2);
      const st = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.06, 0.38), new THREE.MeshStandardMaterial({ map: shopSignTexture(shop), roughness: 0.6 }));
      st.position.set(cx, 2.95, fz + 0.105);
      g.add(st);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.05, 0.9), new THREE.MeshStandardMaterial({ color: ['#b8302b', '#3e6b4a', '#c9922e', '#24344d'][seed % 4], roughness: 0.8 }));
      aw.position.set(cx, 2.68, fz + 0.45); aw.rotation.x = 0.3;
      g.add(aw);
    };
    nb(X0 - 6, X0, [140, 132, 116], 21, 7.5, 5);
    nb(X1, X1 + 5.5, [96, 104, 98], 33, 5.8, 0);
    nb(X1 + 5.5, X1 + 12, [168, 136, 104], 45, 8.2, 3);
    nb(X0 - 12, X0 - 6, [118, 92, 78], 57, 6.6, 6);
    // the rest of our block, up to the alleys, and the next blocks beyond them
    const A = STREET.alleys;
    nb(A[0][1], X0 - 12, [150, 128, 104], 61, 7.2, 8);
    nb(X1 + 12, A[1][0], [120, 110, 96], 63, 6.4, 9);
    nb(STREET.x0 - 2, -38, [110, 100, 92], 65, 8.4, 10);
    nb(-38, -33, [160, 140, 110], 67, 6.8, 11);
    nb(-33, A[0][0], [128, 104, 90], 69, 7.6, 7);
    nb(A[1][1], 33, [146, 122, 98], 71, 7.0, 1);
    nb(33, 39, [104, 112, 120], 73, 8.8, 2);
    nb(39, STREET.x1 + 2, [170, 150, 120], 75, 6.2, 4);
    for (const [a0, a1] of A) this.buildAlley(g, a0, a1, fz);
    // sidewalk, curb, road
    const sw = texMat(this.tex.sidewalk, { rough: 0.95 });
    this.tex.sidewalk.repeat.set(40, 3);
    const swm = plane(STREET.x1 - STREET.x0 + 8, 3.0, sw);
    swm.rotation.x = -Math.PI / 2;
    swm.position.set(0, 0.0, fz + 1.5);
    g.add(swm);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(STREET.x1 - STREET.x0 + 8, 0.15, 0.25), propMaterial('Concrete'));
    curb.position.set(0, 0.0, fz + 3.0);
    g.add(curb);
    const rd = texMat(this.tex.asphalt, { rough: 0.95 });
    this.tex.asphalt.repeat.set(46, 4);
    const road = plane(140, 9, rd);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.07, fz + 7.5);
    g.add(road);
    const lineMat = new THREE.MeshStandardMaterial({ color: '#d8cfb4', roughness: 0.8 });
    for (let i = -22; i < 22; i++) {
      if (STREET.alleys.some(([a, b]) => i * 3 > a - 1 && i * 3 < b + 1)) continue;
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.12), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(i * 3, -0.065, fz + 7.5);
      g.add(l);
    }
    // opposite side
    const opp = (x0, x1, tint, seed, h) => {
      const t = T.facadeTexture(seed, tint);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, h), m);
      p.position.set((x0 + x1) / 2, h / 2, fz + 14);
      p.rotation.y = Math.PI;
      g.add(p);
    };
    // the far side: shops, a cross street opposite each alley, and the supermarket across from us
    const oppBld = [[STREET.x0 - 2, -36, 8, 12], [-36, -27.5, 7, 13], [-21.5, -13, 8.5, 5], [-13, SUPER.x0, 7, 14],
      [SUPER.x1, 16, 9, 15], [16, 21.5, 7.5, 7], [27.5, 36, 8, 0], [36, STREET.x1 + 2, 7, 3]];
    oppBld.forEach(([x0, x1, h, si], i) => {
      opp(x0, x1, [[150, 118, 92], [112, 120, 112], [176, 150, 120], [126, 98, 86]][i % 4], 81 + i * 2, h);
      this.oppShopfront(g, (x0 + x1) / 2, Math.min(x1 - x0 - 1.2, 6), h, fz + 13.95, SHOPS[si % SHOPS.length], i);
    });
    this.buildSupermarket(g, fz + 14);
    // the cross streets carry on past the far side
    for (const [a0, a1] of STREET.alleys) {
      const t = T.facadeTexture(91, [130, 112, 96]);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0 + 6, 9), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
      back.position.set((a0 + a1) / 2, 4.5, fz + 34); back.rotation.y = Math.PI; g.add(back);
      const cr = plane(a1 - a0, 20, rd); cr.rotation.x = -Math.PI / 2; cr.position.set((a0 + a1) / 2, -0.069, fz + 24); g.add(cr);
      for (const sx of [a0 - 0.6, a1 + 0.6]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 20), new THREE.MeshStandardMaterial({ map: T.facadeTexture(93, [120, 104, 92]), roughness: 0.9 }));
        side.position.set(sx + (sx < a0 ? -0.6 : 0.6), 4.5, fz + 24); g.add(side);
      }
    }
    this.buildStreetLife(g, fz);
    const swo = plane(STREET.x1 - STREET.x0 + 8, 3.5, sw); swo.rotation.x = -Math.PI / 2; swo.position.set(0, 0, fz + 12.3); g.add(swo);

    // street props
    const lampP = spawnProp('StreetLamp'); lampP.position.set(-3.9, 0, fz + 2.6); g.add(lampP);
    const bench = spawnProp('Bench'); bench.position.set(-1.4, 0, fz + 1.0); g.add(bench);
    const planter = spawnProp('Planter'); planter.position.set(0.55, 0, fz + 0.45); g.add(planter);
    const bin = spawnProp('Trash'); bin.position.set(3.0, 0, fz + 2.5); g.add(bin);
    const lamp2 = spawnProp('StreetLamp'); lamp2.position.set(6.5, 0, fz + 2.6); g.add(lamp2);
    const tree = this.makeTree(); tree.position.set(-6.2, 0, fz + 2.2); g.add(tree);
    const tree2 = this.makeTree(); tree2.position.set(9.5, 0, fz + 2.3); tree2.scale.setScalar(0.85); g.add(tree2);
    // things on the street you bump into
    const solid = (x, z, hw, hd) => this.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, outside: true });
    solid(-1.4, fz + 1.0, 0.8, 0.28);          // bench
    solid(0.55, fz + 0.45, 0.3, 0.3);          // planter
    solid(3.0, fz + 2.5, 0.22, 0.22);          // bin
    for (const x of [-3.9, 6.5, ...LAMPS_EXTRA]) solid(x, fz + 2.6, 0.1, 0.1);       // lamps
    for (const x of [-6.2, 9.5, ...TREES_NEAR.map((t) => t[0])]) solid(x, fz + 2.25, 0.15, 0.15);  // trees
    for (const [x] of TREES_FAR) solid(x, fz + 12.4, 0.15, 0.15);
    for (const [x, z] of PARKED) solid(x, fz + z, 2.1, 0.92);  // parked cars
    solid(WINDOW.x, fz + 0.24, 1.35, 0.16);    // flower box
    for (let i = -4; i <= 6; i++) if (Math.abs(i * 1.6 - 1.9) >= 0.8) solid(i * 1.6, fz + 2.8, 0.07, 0.07);  // bollards
    // sign + awning + pole on our facade
    this.signTex = { on: T.signTexture(-1), off: T.signTexture(3) };
    this.signEm = { on: T.signEmissive(-1), off: T.signEmissive(3) };
    this.sign = spawnProp('SignBoard');
    this.sign.position.set(-0.3, 3.35, fz + 0.1);
    g.add(this.sign);
    const face = part(this.sign, 'signface');
    this.signMat = new THREE.MeshStandardMaterial({ map: this.signTex.on, emissiveMap: this.signEm.on, emissive: new THREE.Color('#ffcf8f'), emissiveIntensity: 0.6, roughness: 0.6 });
    face.traverse((o) => { if (o.isMesh) o.material = this.signMat; });
    this.awning = spawnProp('Awning');
    this.awning.position.set(WINDOW.x, 3.02, fz);
    g.add(this.awning);
    this.pole = spawnProp('BarberPole');
    this.pole.position.set(2.75, 2.15, fz);
    g.add(this.pole);
    this.poleMat = this.makePoleMaterial();
    part(this.pole, 'stripes').traverse((o) => { if (o.isMesh) o.material = this.poleMat; });
  }

  // the neighbourhood: shopfronts with depth, rooftops, parked cars, more trees, hanging
  // planters, bollards and lamp lights that come on at dusk
  buildStreetLife(g, fz) {
    const box = (w, h, d, mat, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'string' ? propMaterial(mat) : mat);
      m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = false; m.receiveShadow = true; g.add(m); return m;
    };
    // parked cars (simple stylised shapes), one on each side of the road
    const car = (x, z, ry, col) => {
      const c = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.5 });
      const glass = new THREE.MeshStandardMaterial({ color: '#1d2630', roughness: 0.1, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.75, 1.75), paint); body.position.y = 0.62; c.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 1.6), glass); cab.position.set(-0.2, 1.28, 0); c.add(cab);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.55), paint); roof.position.set(-0.2, 1.62, 0); c.add(roof);
      const tyre = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.9 });
      for (const [wx, wz] of [[-1.3, 0.85], [1.3, 0.85], [-1.3, -0.85], [1.3, -0.85]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 14), tyre);
        w.rotation.x = Math.PI / 2; w.position.set(wx, 0.34, wz); c.add(w);
      }
      const lightM = new THREE.MeshStandardMaterial({ color: '#fff2cc', emissive: new THREE.Color('#fff2cc'), emissiveIntensity: 0.4 });
      for (const lz of [0.6, -0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.3), lightM); l.position.set(2.06, 0.75, lz); c.add(l); }
      c.position.set(x, -0.07, z); c.rotation.y = ry;
      c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(c);
      return c;
    };
    for (const [x, z, ry, col] of PARKED) car(x, fz + z, ry, col);
    // more trees and planters along the pavement
    for (const [x, s] of TREES_NEAR) { const t = this.makeTree(); t.position.set(x, 0, fz + 2.3); t.scale.setScalar(s); g.add(t); }
    for (const [x, s] of TREES_FAR) { const t = this.makeTree(); t.position.set(x, 0, fz + 12.4); t.scale.setScalar(s); g.add(t); }
    // zebra crossings at the side streets
    const zebra = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.85 });
    for (const [a0, a1] of STREET.alleys) {
      for (let k = 0; k < 7; k++) { const z = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0 - 1, 0.5), zebra); z.rotation.x = -Math.PI / 2; z.position.set((a0 + a1) / 2, -0.064, fz + 3.6 + k * 1.15); g.add(z); }
    }
    // more street lamps along the whole street
    for (const x of LAMPS_EXTRA) { const l = spawnProp('StreetLamp'); l.position.set(x, 0, fz + 2.6); g.add(l); }
    // bollards
    for (let i = -4; i <= 6; i++) { if (Math.abs(i * 1.6 - 1.9) < 0.8) continue; box(0.12, 0.7, 0.12, 'MetalDark', i * 1.6, 0.35, fz + 2.8); }
    // flower boxes under our window
    const fb = box(2.6, 0.22, 0.28, 'WoodDark', WINDOW.x, 0.62, fz + 0.24);
    const flower = ['#e0455a', '#f2cf7c', '#ffffff', '#c985d6'];
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 + Math.random() * 0.03, 0), new THREE.MeshStandardMaterial({ color: i % 3 ? propColor('Leaf') : flower[i % 4], roughness: 0.8 }));
      f.position.set(WINDOW.x - 1.2 + i * 0.18 + Math.random() * 0.05, 0.78 + Math.random() * 0.06, fz + 0.24 + (Math.random() - 0.5) * 0.12);
      g.add(f);
    }
    // street lamp light pools (only shine at dusk)
    this.streetLights = [];
    for (const x of [-3.9, 6.5, -18, 18, -36, 36]) {
      const L = new THREE.PointLight('#ffc98a', 0, 8, 2);
      L.position.set(x, 3.4, fz + 2.6);
      g.add(L);
      this.streetLights.push(L);
    }
  }

  // a shopfront on the far side of the road (facing us): window, door, awning, sign, cornice
  oppShopfront(g, x, w, hgt, z, shop, i) {
    const box = (bw, bh, bd, mat, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), typeof mat === 'string' ? propMaterial(mat) : mat); m.position.set(px, py, pz); g.add(m); return m; };
    box(w + 1, 0.25, 0.4, 'Concrete', x, hgt - 0.1, z - 0.2);
    box(w + 1, 0.18, 0.3, 'Concrete', x, 3.15, z - 0.15);
    const awn = ['#7a2a26', '#24344d', '#3e6b4a', '#b58a3c'];
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.06, 1.1), new THREE.MeshStandardMaterial({ color: awn[i % 4], roughness: 0.8 }));
    aw.position.set(x, 2.85, z - 0.55); aw.rotation.x = -0.32; g.add(aw);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 1.8), this.shopWindowMat(shop, (w - 0.4) / 1.8, 90 + i));
    win.position.set(x, 1.4, z - 0.02); win.rotation.y = Math.PI; g.add(win);
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.4, 3.6), 0.52), new THREE.MeshStandardMaterial({ map: shopSignTexture(shop), roughness: 0.6 }));
    sgn.position.set(x, 3.55, z - 0.32); sgn.rotation.y = Math.PI; g.add(sgn);
    box(1.4, 0.8, 1.2, 'MetalPainted', x - w * 0.3, hgt + 0.4, z + 1);
  }

  // a narrow side street between two blocks: a back wall, a dumpster, crates, a fire escape
  buildAlley(g, a0, a1, fz) {
    const w = a1 - a0, cx = (a0 + a1) / 2, depth = 11;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, depth), texMat(this.tex.asphalt, { rough: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.01, fz - depth / 2 + 0.2); g.add(ground);
    const wallMat = new THREE.MeshStandardMaterial({ map: T.facadeTexture(Math.round(a0) + 100, [120, 98, 84]), roughness: 0.92 });
    for (const sx of [a0, a1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.4, 8, depth), wallMat);
      side.position.set(sx + (sx === a0 ? -0.2 : 0.2), 4, fz - depth / 2); g.add(side);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 8, 0.4), wallMat);
    back.position.set(cx, 4, fz - depth); g.add(back);
    const bin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.0), new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.6, metalness: 0.3 }));
    bin.position.set(a0 + 1.2, 0.6, fz - depth + 1.0); g.add(bin);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 1.05), new THREE.MeshStandardMaterial({ color: '#1f3a28', roughness: 0.5 }));
    lid.position.set(a0 + 1.2, 1.24, fz - depth + 0.95); lid.rotation.x = -0.12; g.add(lid);
    const crate = new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.9 });
    for (const [dx, dz, y] of [[w - 1.0, -depth + 0.8, 0.3], [w - 1.5, -depth + 1.1, 0.3], [w - 1.2, -depth + 0.9, 0.9]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), crate); c.position.set(a0 + dx, y, fz + dz); c.rotation.y = dx; g.add(c); }
    // fire escape on one wall
    const metal = propMaterial('MetalDark');
    for (const y of [3.2, 5.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 3), metal); p.position.set(a1 - 0.6, y, fz - 5); g.add(p); const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 3), metal); r.position.set(a1 - 1.05, y + 0.45, fz - 5); g.add(r); }
    this.colliders.push(
      { x0: a0 - 1, x1: a0 + 0.05, z0: fz - depth - 1, z1: R0.z1 + 0.5, outside: true },
      { x0: a1 - 0.05, x1: a1 + 1, z0: fz - depth - 1, z1: R0.z1 + 0.5, outside: true },
      { x0: a0, x1: a1, z0: fz - depth - 2, z1: fz - depth + 0.3, outside: true },
      { x0: a0 + 0.2, x1: a0 + 2.2, z0: fz - depth, z1: fz - depth + 1.6, outside: true },
    );
  }

  // FRESH MART across the road: wide glass front, sliding doors, a big lit sign, carts, and
  // a manager outside who is very keen to hire you
  buildSupermarket(g, z) {
    const S = SUPER, w = S.x1 - S.x0, cx = (S.x0 + S.x1) / 2, h = 7.5;
    const box = (bw, bh, bd, mat, px, py, pz, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), typeof mat === 'string' ? propMaterial(mat) : mat); m.position.set(px, py, pz); m.rotation.y = ry; g.add(m); return m; };
    const wallM = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.8 });
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallM);
    facade.position.set(cx, h / 2, z); facade.rotation.y = Math.PI; g.add(facade);
    const red = new THREE.MeshStandardMaterial({ color: '#c8302b', roughness: 0.5 });
    box(w + 0.2, 0.9, 0.5, red, cx, 3.6, z - 0.25);                         // red band
    box(w + 0.2, 0.2, 0.6, 'Concrete', cx, h, z - 0.2);
    // glass front with the store inside
    const sm = SUPERMARKET;
    const gw = w - 0.6;
    const glassL = new THREE.Mesh(new THREE.PlaneGeometry(gw / 2 - 1.3, 2.9), this.shopWindowMat({ ...sm, noDoor: true }, (gw / 2 - 1.3) / 2.9, 7));
    glassL.position.set(S.x0 + 0.3 + (gw / 2 - 1.3) / 2, 1.55, z - 0.03); glassL.rotation.y = Math.PI; g.add(glassL);
    const glassR = new THREE.Mesh(new THREE.PlaneGeometry(gw / 2 - 1.3, 2.9), this.shopWindowMat({ ...sm, noDoor: true }, (gw / 2 - 1.3) / 2.9, 9));
    glassR.position.set(S.x1 - 0.3 - (gw / 2 - 1.3) / 2, 1.55, z - 0.03); glassR.rotation.y = Math.PI; g.add(glassR);
    // sliding doors (they open when someone walks up)
    const doorGlass = new THREE.MeshStandardMaterial({ color: '#6f8a9a', roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.55 });
    const frame = propMaterial('MetalDark');
    box(2.8, 0.12, 0.2, frame, S.door, 2.95, z - 0.1);
    this.superDoors = [];
    for (const sx of [-1, 1]) {
      const d = new THREE.Group();
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.8), doorGlass); pane.rotation.y = Math.PI; d.add(pane);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.28, 2.84, 0.04), frame); fr.scale.set(1, 1, 1); fr.position.z = 0.03;
      d.position.set(S.door + sx * 0.64, 1.42, z - 0.05);
      g.add(d);
      this.superDoors.push({ obj: d, base: S.door + sx * 0.64, dir: sx, open: 0 });
    }
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.8), new THREE.MeshStandardMaterial({ color: '#fff7e6', emissive: new THREE.Color('#fff1d6'), emissiveIntensity: 0.35, roughness: 0.9 }));
    inside.position.set(S.door, 1.42, z + 0.6); inside.rotation.y = Math.PI; g.add(inside);
    // the big sign, lit at night
    const st = shopSignTexture(sm);
    const signM = new THREE.MeshStandardMaterial({ map: st, emissiveMap: st, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25, roughness: 0.5 });
    (this.shopWinMats ||= []).push(signM);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.4), signM);
    sign.position.set(cx, 5.3, z - 0.06); sign.rotation.y = Math.PI; g.add(sign);
    // NOW HIRING poster in the window
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const x = c.getContext('2d');
    x.fillStyle = '#fff6c8'; x.fillRect(0, 0, 256, 320);
    x.fillStyle = '#c8302b'; x.fillRect(0, 0, 256, 70);
    x.fillStyle = '#fff'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.fillText('NOW', 128, 50);
    x.fillStyle = '#c8302b'; x.font = 'bold 54px sans-serif'; x.fillText('HIRING', 128, 130);
    x.fillStyle = '#222'; x.font = '22px sans-serif'; x.fillText('Shelf stacker', 128, 180); x.fillText('Night shifts', 128, 210); x.fillText('Great team spirit!*', 128, 240);
    x.font = '13px sans-serif'; x.fillText('*mandatory', 128, 300);
    const pt = new THREE.CanvasTexture(c); pt.colorSpace = THREE.SRGBColorSpace;
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.8 }));
    poster.position.set(S.door - 2.4, 1.8, z - 0.06); poster.rotation.y = Math.PI; g.add(poster);
    // shopping carts lined up outside
    const cartM = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.35, metalness: 0.8, wireframe: false });
    for (let i = 0; i < 4; i++) {
      const cg = new THREE.Group();
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.85), new THREE.MeshStandardMaterial({ color: '#c8302b', roughness: 0.5, transparent: true, opacity: 0.85 }));
      basket.position.y = 0.75; cg.add(basket);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), cartM); handle.rotation.z = Math.PI / 2; handle.position.set(0, 1.0, -0.45); cg.add(handle);
      for (const [wx, wz] of [[-0.22, -0.35], [0.22, -0.35], [-0.22, 0.35], [0.22, 0.35]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), propMaterial('MetalDark')); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.06, wz); cg.add(wh); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), cartM); leg.position.set(wx, 0.3, wz); cg.add(leg); }
      cg.position.set(S.x1 - 2.2, 0, z - 1.0 - i * 0.32); cg.rotation.y = Math.PI / 2;
      g.add(cg);
    }
    this.colliders.push({ x0: S.x1 - 2.6, x1: S.x1 - 1.8, z0: z - 2.4, z1: z - 0.6, outside: true });
    // a planter each side of the doors
    for (const sx of [-1.9, 1.9]) { const p = spawnProp('Planter'); p.position.set(S.door + sx, 0, z - 0.5); g.add(p); }
    this.colliders.push({ x0: S.door - 2.2, x1: S.door - 1.6, z0: z - 0.8, z1: z, outside: true }, { x0: S.door + 1.6, x1: S.door + 2.2, z0: z - 0.8, z1: z, outside: true });
  }

  updateSupermarket(dt, who) {
    for (const d of this.superDoors || []) {
      const near = who.some((p) => Math.abs(p.x - SUPER.door) < 1.6 && p.z > ROOM.z1 + 0.24 + 11.5);
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 5);
      d.obj.position.x = d.base + d.dir * d.open * 1.2;
    }
  }

  setDusk(k) {
    for (const L of this.streetLights || []) L.intensity = k * 6;
    if (this.nightWindowMat) this.nightWindowMat.emissiveIntensity = 0.05 + k * 0.9;
    for (const m of this.shopWinMats || []) m.emissiveIntensity = 0.1 + k * 0.7;
    const lamps = this.exterior ? [] : [];
    if (this.signMat) this.signMat.emissiveIntensity = 0.6 + k * 1.2;
  }

  // the little OPEN / CLOSED card hanging in the door
  setOpenSign(open) {
    this.isOpen = open;
    if (!this.doorCard) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      this.doorCardCanvas = c;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      this.doorCard = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.15 }));
      this.doorCard.position.set(0.05, 1.62, 0.04);
      this.doorHinge.add(this.doorCard);
    }
    const g = this.doorCardCanvas.getContext('2d');
    g.fillStyle = open ? '#2f5e3c' : '#7a2a26'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#efe4cf'; g.lineWidth = 8; g.strokeRect(8, 8, 240, 112);
    g.fillStyle = '#efe4cf'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(open ? 'OPEN' : 'CLOSED', 128, 68);
    this.doorCard.material.map.needsUpdate = true;
    this.doorCard.rotation.y = Math.PI;
  }

  makeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8), propMaterial('WoodDark'));
    trunk.position.y = 1.3;
    g.add(trunk);
    const leaf = propMaterial('Leaf'), leaf2 = propMaterial('LeafDark');
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.35, 1), i % 2 ? leaf : leaf2);
      s.position.set((Math.random() - 0.5) * 1.1, 2.7 + Math.random() * 0.9, (Math.random() - 0.5) * 1.1);
      s.castShadow = true;
      g.add(s);
    }
    return g;
  }

  makePoleMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOff = { value: 0 };
      m.userData.shader = sh;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; uniform float uOff;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float a = atan(vOP.x, vOP.y) / 6.28318;
          float s = fract(a * 2.0 + vOP.z * 3.2 + uOff);
          vec3 c = s < 0.25 ? vec3(0.62,0.1,0.08) : (s < 0.5 ? vec3(0.9,0.87,0.8) : (s < 0.75 ? vec3(0.1,0.18,0.42) : vec3(0.9,0.87,0.8)));
          diffuseColor.rgb = c;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= diffuseColor.rgb;');
    };
    return m;
  }

  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#f3dcc0', '#3d3027', 0.55);
    s.add(this.hemi);
    // daylight through the big window (warm, low)
    this.sun = new THREE.DirectionalLight('#ffd9a8', 0.9);
    this.sun.position.set(-4, 6.5, 9);
    this.sun.target.position.set(-0.5, 0, -0.5);
    s.add(this.sun, this.sun.target);
    if (this.quality.shadows && this.quality.shadowSize >= 2048) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -5; c.right = 5; c.top = 5; c.bottom = -5; c.near = 2; c.far = 20;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.02;
    }
    // main lamp: point (fill) + spot (shadows)
    this.lampPoint = new THREE.PointLight('#ffd7a0', 3, 7, 2);
    this.lampPoint.position.set(SPOTS.lamp.x, 2.1, SPOTS.lamp.z);
    s.add(this.lampPoint);
    this.lampSpot = new THREE.SpotLight('#ffdcae', 10, 9, 1.0, 0.75, 2);
    this.lampSpot.position.set(SPOTS.lamp.x, 2.2, SPOTS.lamp.z);
    this.lampSpot.target.position.set(SPOTS.lamp.x, 0, SPOTS.lamp.z + 0.2);
    s.add(this.lampSpot, this.lampSpot.target);
    if (this.quality.shadows) {
      this.lampSpot.castShadow = true;
      this.lampSpot.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
      this.lampSpot.shadow.bias = -0.0006;
      this.lampSpot.shadow.normalBias = 0.02;
      this.lampSpot.shadow.camera.near = 0.3;
      this.lampSpot.shadow.camera.far = 6;
    }
    // waiting area lamp
    this.lamp2 = new THREE.PointLight('#ffcf98', 2, 6, 2);
    this.lamp2.position.set(2.1, 2.2, -0.1);
    s.add(this.lamp2);
    // exterior lamp glow (sign)
    this.signLight = new THREE.PointLight('#ffc98a', 2.5, 5, 2);
    this.signLight.position.set(-0.3, 3.2, ROOM.z1 + 1.0);
    s.add(this.signLight);
  }

  addProp(name, pos, rotY = 0, parent = this.root) {
    const o = spawnProp(name);
    o.position.copy(pos);
    o.rotation.y = rotY;
    parent.add(o);
    return o;
  }

  buildProps() {
    const R = ROOM;
    const S = this.slots;
    // station + mirror (old & classic variants)
    S.stationOld = this.addProp('StationOld', new THREE.Vector3(SPOTS.chair.x, 0, R.z0 + 0.23));
    S.stationClassic = this.addProp('StationClassic', new THREE.Vector3(SPOTS.chair.x, 0, R.z0 + 0.23));
    S.mirrorOld = this.addProp('MirrorOld', new THREE.Vector3(SPOTS.chair.x, 1.62, R.z0 + 0.03));
    S.mirrorLarge = this.addProp('MirrorLarge', new THREE.Vector3(SPOTS.chair.x, 1.66, R.z0 + 0.03));
    this.setupMirror(S.mirrorOld, 0.58, 0.78, true);
    this.setupMirror(S.mirrorLarge, 0.86, 1.12, false);
    // chairs
    S.chairOld = this.addProp('ChairOld', SPOTS.chair, Math.PI);
    S.chairClassic = this.addProp('ChairClassic', SPOTS.chair, Math.PI);
    this.colliders.push({ x0: SPOTS.chair.x - 0.38, x1: SPOTS.chair.x + 0.38, z0: SPOTS.chair.z - 0.4, z1: SPOTS.chair.z + 0.45, chair: true });
    this.colliders.push({ x0: SPOTS.chair.x - 0.62, x1: SPOTS.chair.x + 0.62, z0: R.z0, z1: R.z0 + 0.5 });
    // tool cart
    S.cart = this.addProp('Cart', SPOTS.cart, 0.2);
    this.colliders.push({ x0: SPOTS.cart.x - 0.28, x1: SPOTS.cart.x + 0.28, z0: SPOTS.cart.z - 0.24, z1: SPOTS.cart.z + 0.24 });
    // cape on hook
    S.capeHook = this.addProp('CapeFolded', SPOTS.capeHook, 0);
    // counter + register + catalog
    const cpos = new THREE.Vector3(R.x0 + 0.32, 0, 1.25);
    S.counter = this.addProp('Counter', cpos, Math.PI / 2);
    S.register = this.addProp('Register', new THREE.Vector3(cpos.x - 0.02, 1.02, 1.45), Math.PI / 2);
    S.catalog = this.addProp('Catalog', new THREE.Vector3(cpos.x + 0.02, 1.02, 0.95), Math.PI / 2 + 0.25);
    this.colliders.push({ x0: R.x0, x1: R.x0 + 0.62, z0: 0.55, z1: 1.95 });
    // shelf + products
    S.shelf = this.addProp('Shelf', new THREE.Vector3(R.x0 + 0.01, 1.35, -0.75), Math.PI / 2);
    S.productsFew = this.addProp('ProductsFew', new THREE.Vector3(R.x0 + 0.01, 1.367, -0.75), Math.PI / 2);
    S.productsFull = this.addProp('ProductsFull', new THREE.Vector3(R.x0 + 0.01, 1.367, -0.75), Math.PI / 2);
    S.productsFull2 = this.addProp('ProductsFull', new THREE.Vector3(R.x0 + 0.01, 1.787, -0.75), Math.PI / 2);
    S.radio = this.addProp('Radio', new THREE.Vector3(R.x0 + 0.13, 1.787, -1.1), Math.PI / 2 + 0.3);
    this.buildStation2();
    this.buildAnnex();
    this.buildExtras();
    this.buildExpansion();
    
    // waiting chairs / couch
    S.waitChairs = new THREE.Group();
    this.root.add(S.waitChairs);
    this.waitChairObjs = WAIT_CHAIRS.map((w, i) => this.addProp('WaitChairOld', w.pos, w.rot + (i === 1 ? 0.12 : -0.05), S.waitChairs));
    S.couch = this.addProp('Couch', new THREE.Vector3(2.78, 0, -0.35), -Math.PI / 2);
    this.colliders.push({ x0: 2.55, x1: R.x1, z0: -1.4, z1: 0.75, seat: true });
    // lamps
    S.lampOld = this.addProp('LampOld', SPOTS.lamp, 0);
    S.lampPendant = this.addProp('LampPendant', SPOTS.lamp, 0);
    S.lamp2Old = this.addProp('LampOld', new THREE.Vector3(2.1, 2.9, -0.1), 0);
    S.lamp2Pendant = this.addProp('LampPendant', new THREE.Vector3(2.1, 2.9, -0.1), 0);
    S.fan = this.addProp('Fan', new THREE.Vector3(0.6, 2.9, 0.6), 0);
    this.fanRotor = part(S.fan, 'rotor');
    // door + window frame
    S.door = this.addProp('Door', new THREE.Vector3(DOOR.x, 0, R.z1 + 0.12), 0);
    this.doorHinge = part(S.door, 'hinge');
    this.bell = part(S.door, 'bell');
    S.windowFrame = this.addProp('WindowFrame', new THREE.Vector3(WINDOW.x, WINDOW.y0, R.z1 + 0.12), 0);
    // window glass + dirt
    this.windowGlass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w, WINDOW.h), new THREE.MeshStandardMaterial({
      color: '#c9d6d6', roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.12, depthWrite: false }));
    this.windowGlass.position.set(WINDOW.x, WINDOW.y0 + WINDOW.h / 2, R.z1 + 0.12);
    this.root.add(this.windowGlass);
    this.windowDirt = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w, WINDOW.h), new THREE.MeshBasicMaterial({
      map: this.tex.dirt, transparent: true, depthWrite: false, opacity: 0.85 }));
    this.windowDirt.position.set(WINDOW.x, WINDOW.y0 + WINDOW.h / 2, R.z1 + 0.11);
    this.windowDirt.rotation.y = Math.PI;
    this.root.add(this.windowDirt);
    // painted window lettering seen from inside (mirrored text would be outside; keep simple)
    // clock above the door, posters, decor
    S.clock = this.addProp('Clock', new THREE.Vector3(0.75, 2.4, R.z1 - 0.03), Math.PI);
    this.hourHand = part(S.clock, 'hourHand'); this.minuteHand = part(S.clock, 'minuteHand');
    S.posterOld = this.addProp('Poster', new THREE.Vector3(R.x0 + 0.02, 1.7, 0.2), Math.PI / 2);
    this.setPoster(S.posterOld, T.posterTexture(0), true);
    S.posters = new THREE.Group(); this.root.add(S.posters);
    const p1 = this.addProp('Poster', new THREE.Vector3(R.x1 - 0.02, 1.75, -0.7), -Math.PI / 2, S.posters);
    this.setPoster(p1, T.posterTexture(1));
    const p2 = this.addProp('Poster', new THREE.Vector3(R.x0 + 0.02, 1.7, 0.2), Math.PI / 2, S.posters);
    this.setPoster(p2, T.posterTexture(0));
    S.plants = new THREE.Group(); this.root.add(S.plants);
    this.addProp('PlantSnake', new THREE.Vector3(0.75, 0, 2.25), 0, S.plants);
    this.addProp('PlantFern', new THREE.Vector3(-2.95, 1.02, 1.75), 0, S.plants);
    this.addProp('PlantSnake', new THREE.Vector3(2.95, 0, -2.3), 1, S.plants);
    S.tv = this.addProp('TV', new THREE.Vector3(R.x1 - 0.06, 1.85, 0.75), -Math.PI / 2);
    this.tvScreen = part(S.tv, 'screen');
    S.neon = this.addProp('NeonOpen', new THREE.Vector3(WINDOW.x + 0.9, 1.75, R.z1 + 0.05), 0);
    S.menu = this.buildMenuPoster(new THREE.Vector3(R.x1 - 0.025, 1.78, -0.78), -Math.PI / 2);
    S.trash = this.addProp('Trash', new THREE.Vector3(1.16, 0, 2.3), 0);
    S.trash.userData.dynamic = true;
    S.broom = this.addProp('Broom', SPOTS.broom, 0);
    S.broom.rotation.z = 0.18;
    S.broom.rotation.x = -0.12;
    // blob shadows under static furniture make everything sit on the floor
    for (const [x, z, sx, sz] of [[SPOTS.chair.x, SPOTS.chair.z, 1.0, 1.1], [SPOTS.cart.x, SPOTS.cart.z, 0.7, 0.6],
      [R.x0 + 0.32, 1.25, 0.9, 1.6], [2.85, -0.35, 0.8, 2.2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: this.tex.blob, transparent: true, depthWrite: false, opacity: 0.8 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.004, z);
      m.renderOrder = 1;
      this.root.add(m);
    }
    // tools live on the cart; game code spawns the actual tool objects
    this.cartTop = new THREE.Vector3(SPOTS.cart.x, 0.645, SPOTS.cart.z);
  }

  // the framed haircut menu on the wall (the same pictures the customers point at)
  buildMenuPoster(pos, rotY) {
    const g = new THREE.Group();
    const w = 1.3, hgt = w * 694 / 1024;
    const tex = new THREE.TextureLoader().load(menuPosterUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    face.userData.keep = true;
    face.position.z = 0.012;
    g.add(face);
    const wood = propMaterial('WoodDark');
    const t = 0.035, d = 0.03;
    for (const [sx, sy, x, y] of [[w + 2 * t, t, 0, hgt / 2 + t / 2], [w + 2 * t, t, 0, -hgt / 2 - t / 2], [t, hgt, -w / 2 - t / 2, 0], [t, hgt, w / 2 + t / 2, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, d), wood);
      b.position.set(x, y, d / 2);
      b.castShadow = false; b.receiveShadow = true;
      g.add(b);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, 0.01), wood);
    back.position.z = 0.005;
    g.add(back);
    g.position.copy(pos);
    g.rotation.y = rotY;
    this.root.add(g);
    return g;
  }

  setPoster(p, tex, torn = false) {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    part(p, 'poster').traverse((o) => { if (o.isMesh) o.material = m; });
    if (torn) { p.rotation.z = 0.06; }
  }

  // second barber station (bought later): its own chair, mirror and cart
  buildStation2() {
    const S = this.slots, R = ROOM, P = STATION2;
    const g = new THREE.Group();
    this.root.add(g);
    S.station2 = g;
    S.st2StationOld = this.addProp('StationOld', new THREE.Vector3(P.chair.x, 0, R.z0 + 0.23), 0, g);
    S.st2StationClassic = this.addProp('StationClassic', new THREE.Vector3(P.chair.x, 0, R.z0 + 0.23), 0, g);
    S.st2MirrorOld = this.addProp('MirrorOld', new THREE.Vector3(P.chair.x, 1.62, R.z0 + 0.03), 0, g);
    S.st2MirrorLarge = this.addProp('MirrorLarge', new THREE.Vector3(P.chair.x, 1.66, R.z0 + 0.03), 0, g);
    this.setupMirror(S.st2MirrorOld, 0.58, 0.78, true, true);
    this.setupMirror(S.st2MirrorLarge, 0.86, 1.12, false, true);
    S.st2ChairOld = this.addProp('ChairOld', P.chair, Math.PI, g);
    S.st2ChairClassic = this.addProp('ChairClassic', P.chair, Math.PI, g);
    S.st2Cart = this.addProp('Cart', P.cart, -0.3, g);
    const own = () => this.has('station2');
    this.colliders.push({ x0: P.chair.x - 0.38, x1: P.chair.x + 0.38, z0: P.chair.z - 0.4, z1: P.chair.z + 0.45, active: own });
    this.colliders.push({ x0: P.chair.x - 0.62, x1: P.chair.x + 0.62, z0: R.z0, z1: R.z0 + 0.5, active: own });
    this.colliders.push({ x0: P.cart.x - 0.28, x1: P.cart.x + 0.28, z0: P.cart.z - 0.24, z1: P.cart.z + 0.24, active: own });
  }

  // the extension: floor, walls, ceiling, a lamp, a third station and a lounge corner
  buildAnnex() {
    const A = ANNEX, S = this.slots;
    const g = new THREE.Group();
    g.userData.dynamic = true;
    this.root.add(g);
    S.annex = g;
    const W = A.x1 - A.x0, D = A.z1 - A.z0, cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2;
    const floorMat = texMat(this.tex.floorWood, { rough: 0.55 });
    const f = plane(W, D, floorMat); f.rotation.x = -Math.PI / 2; f.position.set(cx, 0.001, cz); f.receiveShadow = true; g.add(f);
    const c = plane(W, D, this.ceilMat); c.rotation.x = Math.PI / 2; c.position.set(cx, ROOM.h, cz); g.add(c);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#2f4a3a', roughness: 0.6 });
    const wain = new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.5 });
    const wall = (w, x, z, ry) => {
      const up = plane(w, ROOM.h - 1.05, wallMat); up.position.set(x, 1.05 + (ROOM.h - 1.05) / 2, z); up.rotation.y = ry; g.add(up);
      const lo = plane(w, 1.05, wain); lo.position.set(x, 0.525, z); lo.rotation.y = ry; g.add(lo);
    };
    wall(W, cx, A.z0, 0);                 // back (mirror wall)
    wall(D, A.x1, cz, -Math.PI / 2);      // far wall
    wall(W, cx, A.z1, Math.PI);           // front
    // archway trim
    const trim = propMaterial('WoodDark');
    for (const z of [A.arch0, A.arch1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, A.archH, 0.08), trim); p.position.set(A.x0, A.archH / 2, z); g.add(p); }
    const lint = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, A.arch1 - A.arch0 + 0.08), trim); lint.position.set(A.x0, A.archH + 0.05, (A.arch0 + A.arch1) / 2); g.add(lint);
    // station 3
    const P = STATION3;
    this.addProp('StationClassic', new THREE.Vector3(P.chair.x, 0, A.z0 + 0.23), 0, g);
    const mir = this.addProp('MirrorLarge', new THREE.Vector3(P.chair.x, 1.66, A.z0 + 0.03), 0, g);
    this.setupMirror(mir, 0.86, 1.12, false, true);
    S.st3Chair = this.addProp('ChairClassic', P.chair, Math.PI, g);
    this.addProp('Cart', P.cart, -0.3, g);
    // lounge: couch, plant, neon
    this.addProp('Couch', new THREE.Vector3(A.x1 - 0.42, 0, 2.0), -Math.PI / 2, g);
    this.addProp('PlantSnake', new THREE.Vector3(A.x1 - 0.3, 0, 0.45), 0.4, g);
    this.addProp('LampPendant', new THREE.Vector3(cx, ROOM.h, 1.2), 0, g);
    const L = new THREE.PointLight('#ffd7a0', 2.4, 6, 2); L.position.set(cx, 2.3, 1.2); g.add(L);
    this.annexLight = L;
    const own = () => this.has('extension');
    this.colliders.push({ x0: P.chair.x - 0.38, x1: P.chair.x + 0.38, z0: P.chair.z - 0.4, z1: P.chair.z + 0.45, active: own });
    this.colliders.push({ x0: P.chair.x - 0.62, x1: P.chair.x + 0.62, z0: A.z0, z1: A.z0 + 0.5, active: own });
    this.colliders.push({ x0: A.x1 - 0.85, x1: A.x1, z0: 1.4, z1: 2.6, active: own, seat: true });
  }

  // small extras: arcade cabinet, wall speakers, colour bar shelf
  // the second wave of upgrades: espresso machine, wash basin, neon wall sign, aquarium,
  // snack machine out front, chandelier
  buildExpansion() {
    const S = this.slots, R = ROOM;
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
    const grp = (name) => { const g = new THREE.Group(); g.userData.dynamic = true; this.root.add(g); S[name] = g; return g; };
    const add = (g, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    // espresso machine on the counter
    const cf = grp('coffee');
    const steel = mat('#c9ccd0', { metalness: 0.85, roughness: 0.25 });
    add(cf, new THREE.BoxGeometry(0.34, 0.3, 0.28), mat('#7a2a26', { roughness: 0.35 }), 0, 0.15, 0);
    add(cf, new THREE.BoxGeometry(0.36, 0.04, 0.3), steel, 0, 0.32, 0);
    add(cf, new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), steel, -0.08, 0.1, 0.16);
    add(cf, new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), steel, 0.08, 0.1, 0.16);
    for (const x of [-0.08, 0.08]) add(cf, new THREE.CylinderGeometry(0.03, 0.025, 0.05, 12), mat('#f3efe4'), x, 0.025, 0.16);
    add(cf, new THREE.SphereGeometry(0.03, 10, 8), mat('#d1a956', { metalness: 0.9, roughness: 0.2 }), 0.12, 0.36, 0);
    cf.position.set(R.x0 + 0.3, 1.02, 1.8); cf.rotation.y = Math.PI / 2;
    // wash basin against the left wall
    const wb = grp('washBasin');
    add(wb, new THREE.BoxGeometry(0.6, 0.8, 0.5), mat('#2b2f33', { roughness: 0.6 }), 0, 0.4, 0);
    const bowl = add(wb, new THREE.SphereGeometry(0.24, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#f6f4ee', { roughness: 0.15 }), 0, 0.92, 0.02);
    bowl.scale.set(1, 0.6, 0.8);
    add(wb, new THREE.TorusGeometry(0.24, 0.025, 8, 24), mat('#f6f4ee', { roughness: 0.15 }), 0, 0.92, 0.02).rotation.x = Math.PI / 2;
    const tap = add(wb, new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8), steel, 0, 1.06, -0.2);
    tap.rotation.x = 0.0;
    add(wb, new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8), steel, 0, 1.18, -0.13).rotation.x = Math.PI / 2;
    add(wb, new THREE.BoxGeometry(0.5, 0.6, 0.04), mat('#d9e6ea', { roughness: 0.1, metalness: 0.3 }), 0, 1.65, -0.24);
    wb.position.set(R.x0 + 0.28, 0, -1.9); wb.rotation.y = Math.PI / 2;
    this.colliders.push({ x0: R.x0, x1: R.x0 + 0.55, z0: -2.2, z1: -1.6, active: () => this.has('washBasin') });
    // neon scissors on the right wall
    const nn = grp('neonWall');
    const neonMat = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 2.2, roughness: 0.4, toneMapped: false });
    const tube = (pts, c) => { const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0))); add(nn, new THREE.TubeGeometry(curve, 40, 0.012, 6, false), neonMat(c), 0, 0, 0); };
    // two rings and two blades
    const ring = (cx, cy) => tube(Array.from({ length: 17 }, (_, i) => [cx + Math.cos(i / 16 * Math.PI * 2) * 0.09, cy + Math.sin(i / 16 * Math.PI * 2) * 0.09]), '#ff4fa3');
    ring(-0.3, -0.12); ring(-0.3, 0.12);
    tube([[-0.22, -0.08], [0.1, 0.02], [0.42, 0.1]], '#4cc3ff');
    tube([[-0.22, 0.08], [0.1, -0.02], [0.42, -0.1]], '#4cc3ff');
    add(nn, new THREE.BoxGeometry(1.1, 0.5, 0.02), mat('#111111', { roughness: 0.9 }), 0.05, 0, -0.02);
    const glow = new THREE.PointLight('#ff6fb5', 0.9, 3, 2); glow.position.set(0, 0, 0.3); nn.add(glow);
    nn.position.set(R.x1 - 0.03, 2.05, -0.35); nn.rotation.y = -Math.PI / 2;
    // aquarium on a stand by the front window
    const aq = grp('aquarium');
    add(aq, new THREE.BoxGeometry(0.8, 0.7, 0.4), mat('#3a2a1e', { roughness: 0.6 }), 0, 0.35, 0);
    add(aq, new THREE.BoxGeometry(0.78, 0.5, 0.38), new THREE.MeshStandardMaterial({ color: '#5fb8d8', transparent: true, opacity: 0.45, roughness: 0.05, emissive: new THREE.Color('#2a7fa8'), emissiveIntensity: 0.4 }), 0, 0.96, 0);
    add(aq, new THREE.BoxGeometry(0.8, 0.04, 0.4), mat('#222'), 0, 1.23, 0);
    add(aq, new THREE.BoxGeometry(0.76, 0.06, 0.36), mat('#d9c08a', { roughness: 0.9 }), 0, 0.74, 0);
    this.fish = [];
    ['#ff8a3c', '#f2cf7c', '#4cc3ff', '#ff4f6f'].forEach((c, i) => {
      const f = add(aq, new THREE.ConeGeometry(0.025, 0.08, 6), mat(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.3 }), 0, 0.95, 0);
      f.rotation.z = Math.PI / 2; this.fish.push({ f, ph: i * 1.7, sp: 0.6 + i * 0.15 });
    });
    for (let i = 0; i < 4; i++) add(aq, new THREE.ConeGeometry(0.03, 0.22, 5), mat('#3e8a4a'), -0.3 + i * 0.2, 0.86, -0.1);
    aq.position.set(0.75, 0, R.z1 - 0.3); aq.rotation.y = Math.PI;
    this.colliders.push({ x0: 0.33, x1: 1.17, z0: R.z1 - 0.52, z1: R.z1, active: () => this.has('aquarium') });
    // snack machine on the pavement next to our door
    const vm = grp('vending');
    add(vm, new THREE.BoxGeometry(0.85, 1.85, 0.7), mat('#c8302b', { roughness: 0.4 }), 0, 0.925, 0);
    add(vm, new THREE.PlaneGeometry(0.55, 1.2), new THREE.MeshStandardMaterial({ color: '#cfe8ff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35, roughness: 0.1 }), -0.1, 1.15, 0.351);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) add(vm, new THREE.BoxGeometry(0.08, 0.12, 0.02), mat(['#f2cf7c', '#4cc3ff', '#9cc94a', '#ff8a3c'][(r + c) % 4]), -0.3 + c * 0.13, 0.75 + r * 0.26, 0.36);
    add(vm, new THREE.BoxGeometry(0.18, 0.5, 0.02), mat('#222'), 0.3, 1.25, 0.36);
    vm.position.set(3.15, 0, R.z1 + 0.24 + 0.4); vm.rotation.y = 0;
    this.colliders.push({ x0: 2.7, x1: 3.6, z0: R.z1 + 0.24, z1: R.z1 + 1.0, active: () => this.has('vending'), outside: true });
    // chandelier
    const ch = grp('chandelier');
    const gold = mat('#d1a956', { metalness: 0.9, roughness: 0.25 });
    add(ch, new THREE.CylinderGeometry(0.01, 0.01, 0.5, 6), gold, 0, -0.25, 0);
    add(ch, new THREE.TorusGeometry(0.32, 0.02, 8, 32), gold, 0, -0.55, 0).rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      add(ch, new THREE.CylinderGeometry(0.03, 0.02, 0.06, 8), gold, Math.cos(a) * 0.32, -0.52, Math.sin(a) * 0.32);
      add(ch, new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff4d2', emissive: new THREE.Color('#ffe2a0'), emissiveIntensity: 1.6, toneMapped: false }), Math.cos(a) * 0.32, -0.46, Math.sin(a) * 0.32);
    }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; add(ch, new THREE.OctahedronGeometry(0.02), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 }), Math.cos(a) * 0.36, -0.64, Math.sin(a) * 0.36); }
    const cl = new THREE.PointLight('#ffe2a0', 1.4, 6, 2); cl.position.set(0, -0.6, 0); ch.add(cl);
    ch.position.set(0.6, R.h, 0.3);
  }

  buildExtras() {
    const S = this.slots, R = ROOM;
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
    // arcade
    const a = new THREE.Group();
    const body = mat('#1d2b52');
    const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; a.add(o); return o; };
    add(new THREE.BoxGeometry(0.62, 1.75, 0.6), body, 0, 0.875, 0);
    this.arcadeScreen = mat('#000000', { emissive: new THREE.Color('#4cc3ff'), emissiveIntensity: 1.2, roughness: 0.2 });
    add(new THREE.PlaneGeometry(0.46, 0.36), this.arcadeScreen, 0, 1.32, 0.302, -0.25);
    add(new THREE.BoxGeometry(0.62, 0.08, 0.3), mat('#e0455a'), 0, 1.0, 0.36);
    for (const [x, c] of [[-0.12, '#f2cf7c'], [0.05, '#e0455a'], [0.14, '#4cc3ff']]) add(new THREE.SphereGeometry(0.025, 10, 8), mat(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.6 }), x, 1.05, 0.42);
    add(new THREE.BoxGeometry(0.62, 0.16, 0.1), mat('#000000', { emissive: new THREE.Color('#f2cf7c'), emissiveIntensity: 0.9 }), 0, 1.66, 0.27);
    a.position.set(R.x0 + 0.36, 0, 2.27); a.rotation.y = Math.PI / 2;
    a.userData.dynamic = true;
    this.root.add(a);
    S.arcade = a;
    this.colliders.push({ x0: R.x0, x1: R.x0 + 0.7, z0: 1.95, z1: R.z1, active: () => this.has('arcade') });
    // speakers in the back corners
    const sp = new THREE.Group();
    for (const x of [R.x0 + 0.25, R.x1 - 0.25]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.24), mat('#141414', { roughness: 0.7 }));
      b.position.set(x, 2.55, R.z0 + 0.14);
      sp.add(b);
      for (const [y, r] of [[2.62, 0.08], [2.44, 0.045]]) {
        const cone = new THREE.Mesh(new THREE.CircleGeometry(r, 18), mat('#2c2c2c', { roughness: 0.9 }));
        cone.position.set(x, y, R.z0 + 0.261);
        sp.add(cone);
      }
    }
    this.root.add(sp);
    S.speakers = sp;
    // colour bar: a little shelf of dye bottles beside the mirror
    const cb = new THREE.Group();
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.16), propMaterial('WoodDark'));
    shelf.position.set(SPOTS.chair.x - 0.75, 1.32, R.z0 + 0.1);
    cb.add(shelf);
    ['#e0455a', '#f2cf7c', '#4cc3ff', '#9b5de5', '#f0f0f0', '#3e6b4a'].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.13, 10), mat(c, { roughness: 0.3 }));
      b.position.set(SPOTS.chair.x - 0.95 + i * 0.08, 1.4, R.z0 + 0.1);
      cb.add(b);
    });
    this.root.add(cb);
    S.colourBar = cb;
  }

  chair3Pivot() { return part(this.slots.st3Chair, 'pivot'); }

  chair2Pivot() { return part(this.has('chairClassic') ? this.slots.st2ChairClassic : this.slots.st2ChairOld, 'pivot'); }

  setupMirror(mirrorObj, w, h, old, cheap = false) {
    const glassNode = part(mirrorObj, 'glass');
    glassNode.visible = false;
    const holder = new THREE.Group();
    holder.position.set(0, 0, 0.006);
    mirrorObj.add(holder);
    let surface;
    if (this.quality.mirror && !cheap) {
      const scale = this.quality.shadowSize >= 2048 ? 0.6 : 0.42;
      surface = new Reflector(new THREE.PlaneGeometry(w, h), {
        textureWidth: Math.min(1024, Math.round(innerWidth * scale * w)), textureHeight: Math.min(1024, Math.round(innerHeight * scale * h)),
        color: old ? 0x9a9688 : 0xb8b6ae, clipBias: 0.003,
      });
      surface.userData.reflector = true;
      // the reflection refreshes at half rate: nobody notices, the GPU does
      const orig = surface.onBeforeRender;
      let frame = 0;
      surface.onBeforeRender = function (r, sc, cam) { if ((frame++ & 1) === 1) return; orig.call(this, r, sc, cam); };
    } else {
      surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#4c5456', metalness: 0.9, roughness: 0.18, envMapIntensity: 0.5 }));
    }
    holder.add(surface);
    if (old) {
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex.crack, transparent: true, depthWrite: false }));
      crack.position.z = 0.002;
      holder.add(crack);
    }
    mirrorObj.userData.surface = surface;
  }

  buildDirt() {
    // grime details that vanish with the deep clean upgrade
    const g = new THREE.Group();
    this.dirt = g;
    this.root.add(g);
    const stainTex = T.blobShadowTexture();
    const stainMat = new THREE.MeshBasicMaterial({ map: stainTex, color: '#5a4426', transparent: true, depthWrite: false, opacity: 0.55 });
    for (let i = 0; i < 9; i++) {
      const s = 0.4 + Math.random() * 0.9;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * (0.6 + Math.random() * 0.5)), stainMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.random() * 3;
      m.position.set(rand(-2.8, 2.8), 0.003 + i * 0.0002, rand(-2.2, 2.2));
      m.renderOrder = 1;
      g.add(m);
    }
    // crumpled paper + an old receipt on the floor
    const paper = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), propMaterial('Paper'));
    paper.position.set(2.2, 0.03, 1.8);
    paper.scale.set(1, 0.8, 1.1);
    g.add(paper);
    // cobweb in the corner
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(235,230,220,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(0, 0); const a = i / 8 * Math.PI / 2; ctx.lineTo(Math.cos(a) * 256, Math.sin(a) * 256); ctx.stroke(); }
    for (let r = 30; r < 250; r += 26) { ctx.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; const rr = r + Math.sin(i * 1.7) * 5; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.stroke(); }
    const webTex = new THREE.CanvasTexture(c);
    const web = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    web.position.set(ROOM.x1 - 0.3, ROOM.h - 0.3, ROOM.z0 + 0.02);
    web.rotation.z = Math.PI;
    g.add(web);
    const web2 = web.clone();
    web2.position.set(ROOM.x0 + 0.3, ROOM.h - 0.3, ROOM.z1 - 0.02);
    web2.rotation.set(0, Math.PI, Math.PI / 2);
    g.add(web2);
  }

  // ------------------------------------------------------------------ upgrade states
  has(id) { return this.state.has(id); }

  applyState(owned) {
    this.state = new Set(owned);
    // online co-op: the extra chairs are always there for the other barbers
    for (const id of this.forced || []) this.state.add(id);
    const S = this.slots, h = (id) => this.state.has(id);
    const goodLight = h('bulb');
    S.lampOld.visible = !goodLight; S.lampPendant.visible = goodLight;
    S.lamp2Old.visible = !h('decor'); S.lamp2Pendant.visible = h('decor');
    S.chairOld.visible = !h('chairClassic'); S.chairClassic.visible = h('chairClassic');
    S.mirrorOld.visible = !h('mirrorLarge'); S.mirrorLarge.visible = h('mirrorLarge');
    S.stationOld.visible = !h('mirrorLarge'); S.stationClassic.visible = h('mirrorLarge');
    for (const m of [S.mirrorOld, S.mirrorLarge]) { const s = m.userData.surface; if (s) s.visible = m.visible; }
    S.waitChairs.visible = !h('couch'); S.couch.visible = h('couch');
    S.station2.visible = h('station2');
    S.annex.visible = h('extension');
    S.arcade.visible = h('arcade');
    for (const id of ['coffee', 'washBasin', 'neonWall', 'aquarium', 'vending', 'chandelier']) if (S[id]) S[id].visible = h(id);
    S.speakers.visible = h('sound');
    S.colourBar.visible = h('dyeStation');
    this.archPlug.visible = !h('extension');
    S.st2ChairOld.visible = !h('chairClassic'); S.st2ChairClassic.visible = h('chairClassic');
    S.st2MirrorOld.visible = !h('mirrorLarge'); S.st2MirrorLarge.visible = h('mirrorLarge');
    S.st2StationOld.visible = !h('mirrorLarge'); S.st2StationClassic.visible = h('mirrorLarge');
    S.posterOld.visible = !h('decor'); S.posters.visible = h('decor'); S.plants.visible = h('decor');
    S.radio.visible = h('radio');
    S.productsFew.visible = !h('products'); S.productsFull.visible = h('products'); S.productsFull2.visible = h('products');
    S.tv.visible = h('tv');
    S.neon.visible = h('pole');
    // cleanliness
    const clean = h('clean');
    this.dirt.visible = !clean;
    this.windowDirt.visible = !clean;
    shared.grime.value = clean ? (h('paint') ? 0.12 : 0.3) : 1.0;
    // floor
    this.floorMat.map = h('floorWood') ? this.tex.floorWood : (clean ? this.tex.floorClean : this.tex.floorOld);
    this.floorMat.roughness = h('floorWood') ? 0.45 : (clean ? 0.35 : 0.6);
    this.floorMat.needsUpdate = true;
    this.ceilMat.map = clean ? this.tex.ceilingClean : this.tex.ceiling;
    this.tex.ceilingClean.repeat.set(3, 2.4);
    this.ceilMat.needsUpdate = true;
    // walls
    const paint = h('paint');
    this.wallMat.map = paint ? this.tex.wallPaint : this.tex.wallOld;
    this.wallMat.needsUpdate = true;
    this.wainMat.color.set(paint ? '#4a2f1e' : '#b7a888');
    this.wainMat.roughness = paint ? 0.45 : 0.6;
    // lights
    this.lampFlicker = 1;
    this.lampSpot.color.set(goodLight ? '#ffd7a2' : '#f7e6c4');
    this.baseSpot = goodLight ? 34 : 15;
    this.basePoint = goodLight ? 3.4 : 1.1;
    this.lamp2.intensity = h('decor') ? 3.2 : 1.4;
    this.hemi.intensity = (clean ? 0.4 : 0.22) + (goodLight ? 0.08 : 0);
    this.hemi.color.set(paint ? '#f5dfc2' : '#e6d6bf');
    // pole + neon + sign
    this.poleOn = h('pole');
    this.poleMat.emissiveIntensity = this.poleOn ? 0.35 : 0;
    const pb = part(this.pole, 'bulb');
    pb.traverse((o) => { if (o.isMesh) o.material = propMaterial(this.poleOn ? 'Bulb' : 'BulbOff'); });
    this.signFixed = h('pole');
    this.updateBulbMaterials();
  }

  updateBulbMaterials() {
    // emissive bulbs follow the light flicker
    if (!this._bulbMat) {
      this._bulbMat = propMaterial('Bulb').clone();
      for (const lamp of [this.slots.lampOld]) {
        part(lamp, 'bulb').traverse((o) => { if (o.isMesh) o.material = this._bulbMat; });
      }
    }
  }

  // ------------------------------------------------------------------ interactions
  addInteractable(def) { this.interactables.push(def); return def; }

  openDoor(fast = false, hold = 1.6) {
    this.doorSpring.target = 1.25;
    if (fast) this.doorSpring.kick(9);
    this.doorCloseTimer = hold;
    audio.doorOpen(fast);
    if (fast) audio.bellFrantic(8); else audio.bell(1);
    this.bellSpring.kick(fast ? 9 : 4);
    this.doorOpenAmount = 1;
  }

  closeDoor() {
    this.doorSpring.target = 0;
  }

  // slammed shut from outside: it overshoots, rattles in the frame
  slamDoor() {
    this.doorCloseTimer = 0;
    this.doorSpring.target = 0;
    this.doorSpring.kick(-16);
    this.bellSpring.kick(14);
    this._closing = false;
  }

  flicker(strong = true) {
    // queue a dramatic flicker pattern [duration, level]
    const seq = strong
      ? [[0.06, 0.1], [0.05, 1], [0.08, 0.05], [0.04, 0.8], [0.12, 0.08], [0.07, 1], [0.05, 0.3], [0.3, 1]]
      : [[0.05, 0.25], [0.06, 1], [0.04, 0.4], [0.2, 1]];
    this.flickerSeq = seq.slice();
    this.flickerT = 0;
    if (strong) audio.bulbPop();
  }

  update(dt, camera) {
    if (this.fish && this.slots.aquarium?.visible) for (const F of this.fish) { const t = this.time * F.sp + F.ph; F.f.position.set(Math.sin(t) * 0.3, 0.9 + Math.sin(t * 1.7) * 0.12, Math.cos(t * 0.8) * 0.1); F.f.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI; }
    if (camera) { this.sky?.position.set(camera.position.x, 0, camera.position.z); this.updateSupermarket(dt, [camera.position]); }
    if (this.arcadeScreen && this.slots.arcade.visible) this.arcadeScreen.emissive.setHSL((this.time * 0.07) % 1, 0.7, 0.5);
    this.time += dt;
    const t = this.time;
    // door + bell
    if (this.doorCloseTimer > 0) {
      this.doorCloseTimer -= dt;
      if (this.doorCloseTimer <= 0) {
        this.doorSpring.target = 0;
        this._closing = true;
      }
    }
    const prev = this.doorSpring.value;
    const v = this.doorSpring.update(dt);
    this.doorHinge.rotation.z = 0; // keep
    this.doorHinge.rotation.y = 0;
    this.doorHinge.rotation.set(0, v, 0);
    if (this._closing && Math.abs(v) < 0.03) {
      this._closing = false;
      audio.doorClose();
      audio.bell(0.5);
      this.bellSpring.kick(3);
    }
    this.bellSpring.kick(Math.abs(v - prev) * 6);
    this.bell.rotation.x = this.bellSpring.update(dt) * 0.25;
    // flickering old bulb
    let level = 1;
    if (!this.has('bulb')) {
      if (this.flickerSeq.length) {
        this.flickerT += dt;
        while (this.flickerSeq.length && this.flickerT > this.flickerSeq[0][0]) { this.flickerT -= this.flickerSeq[0][0]; this.flickerSeq.shift(); }
        level = this.flickerSeq.length ? this.flickerSeq[0][1] : 1;
      } else {
        this.flickerTimer -= dt;
        if (this.flickerTimer < 0) {
          this.flickerTimer = rand(4, 11);
          if (Math.random() < 0.7) this.flicker(false);
        }
        level = 0.92 + noise1(t * 7) * 0.08;
      }
      if (!this._hum && audio.ctx) this._hum = audio.hum(1);
      if (this._hum) this._hum.set(level < 0.6 ? 1.6 : 0.5);
    } else if (this._hum) { this._hum.stop(); this._hum = null; }
    this.lampSpot.intensity = this.baseSpot * level;
    this.lampPoint.intensity = this.basePoint * level;
    if (this._bulbMat) this._bulbMat.emissiveIntensity = 1.6 * level;
    // sign letter flicker
    if (!this.signFixed) {
      const off = (Math.sin(t * 13) > 0.6 && noise1(t * 2) > 0) || noise1(t * 4.3) > 0.55;
      const want = off ? 'off' : 'on';
      if (this._signState !== want) {
        this._signState = want;
        this.signMat.map = this.signTex[want];
        this.signMat.emissiveMap = this.signEm[want];
        this.signMat.needsUpdate = true;
      }
    } else if (this._signState !== 'on') {
      this._signState = 'on';
      this.signMat.map = this.signTex.on; this.signMat.emissiveMap = this.signEm.on; this.signMat.needsUpdate = true;
    }
    // fan: slow and wobbly
    this.fanAngle += dt * (this.has('clean') ? 2.4 : 1.6);
    this.fanRotor.rotation.y = this.fanAngle;
    this.fanRotor.rotation.x = this.has('clean') ? 0 : Math.sin(this.fanAngle * 1.0) * 0.025;
    // clock (real time)
    const d = new Date();
    const mins = d.getMinutes() + d.getSeconds() / 60;
    this.minuteHand.rotation.y = -(mins / 60) * Math.PI * 2;
    this.hourHand.rotation.y = -((d.getHours() % 12 + mins / 60) / 12) * Math.PI * 2;
    // pole
    if (this.poleOn) {
      this.poleOffset += dt * 0.6;
      const sh = this.poleMat.userData.shader;
      if (sh) sh.uniforms.uOff.value = this.poleOffset;
    }
    // TV flicker
    if (this.has('tv') && this.tvScreen) {
      this.tvScreen.traverse((o) => { if (o.isMesh) { if (!o.userData.own) { o.material = o.material.clone(); o.userData.own = true; } o.material.emissiveIntensity = 0.5 + noise1(t * 3) * 0.25; } });
    }
  }

  // ------------------------------------------------------------------ queries
  waitSeats() { return this.has('couch') ? COUCH_SEATS : WAIT_CHAIRS; }
  chairObj() { return this.has('chairClassic') ? this.slots.chairClassic : this.slots.chairOld; }
  chairPivot() { return part(this.chairObj(), 'pivot'); }
  mirrorObj() { return this.has('mirrorLarge') ? this.slots.mirrorLarge : this.slots.mirrorOld; }
  seatHeight() { return 0.28 + 0.21; }

  collide(pos, radius = 0.25) {
    for (const c of this.colliders) {
      if (c.active && !c.active()) continue;
      const cx = clamp(pos.x, c.x0, c.x1), cz = clamp(pos.z, c.z0, c.z1);
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 < 1e-8) {
          // inside: push out along the shortest axis
          const px = Math.min(pos.x - c.x0, c.x1 - pos.x), pz = Math.min(pos.z - c.z0, c.z1 - pos.z);
          if (px < pz) pos.x = (pos.x - c.x0 < c.x1 - pos.x) ? c.x0 - radius : c.x1 + radius;
          else pos.z = (pos.z - c.z0 < c.z1 - pos.z) ? c.z0 - radius : c.z1 + radius;
        } else {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        }
      }
    }
    return pos;
  }
}

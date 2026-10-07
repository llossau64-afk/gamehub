// The barbershop: room shell, street outside, props, lights and every visible upgrade state.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { spawnProp, part, setSpecialMaterial, meshesByMaterial } from './props.js';
import { propMaterial, addDetail, shared } from '../render/materials.js';
import * as T from '../render/textures.js';
import { Spring, clamp, rand, damp, noise1 } from '../core/util.js';
import { audio } from '../audio/audio.js';

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
        let p = o.parent, dyn = false;
        while (p && p !== group) { if (p.userData.dynamic || /^(pivot|hinge|bell|rotor|bulb|stripes|glass|signface|hourHand|minuteHand|screen)/.test(p.name)) dyn = true; p = p.parent; }
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
    // right wall (x1) faces -x
    const right = addWall(R.z0, R.z1, 0, R.h);
    right.rotation.y = -Math.PI / 2;
    right.position.x = R.x1;
    this.root.add(right);
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
    this.colliders.push(
      { x0: -99, x1: R.x0 + 0.25, z0: -99, z1: 99 }, { x0: R.x1 - 0.25, x1: 99, z0: -99, z1: 99 },
      { x0: -99, x1: 99, z0: -99, z1: R.z0 + 0.25 }, { x0: -99, x1: 99, z0: R.z1 - 0.25, z1: 99 },
    );
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
    const nb = (x0, x1, tint, seed, h) => {
      const t = T.facadeTexture(seed, tint);
      t.repeat.set(1, 1);
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, 6), [m, m, m, m, m, m]);
      box.position.set((x0 + x1) / 2, h / 2, fz - 3 + 0.02);
      g.add(box);
      // shopfront at street level
      const sf = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.6, 2.4), new THREE.MeshStandardMaterial({ color: '#2b3438', roughness: 0.2, metalness: 0.2 }));
      sf.position.set((x0 + x1) / 2, 1.5, fz + 0.03);
      g.add(sf);
    };
    nb(X0 - 6, X0, [140, 132, 116], 21, 7.5);
    nb(X1, X1 + 5.5, [96, 104, 98], 33, 5.8);
    nb(X1 + 5.5, X1 + 12, [168, 136, 104], 45, 8.2);
    nb(X0 - 12, X0 - 6, [118, 92, 78], 57, 6.6);
    // sidewalk, curb, road
    const sw = texMat(this.tex.sidewalk, { rough: 0.95 });
    this.tex.sidewalk.repeat.set(16, 3);
    const swm = plane(40, 3.0, sw);
    swm.rotation.x = -Math.PI / 2;
    swm.position.set(0, 0.0, fz + 1.5);
    g.add(swm);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(40, 0.15, 0.25), propMaterial('Concrete'));
    curb.position.set(0, 0.0, fz + 3.0);
    g.add(curb);
    const rd = texMat(this.tex.asphalt, { rough: 0.95 });
    this.tex.asphalt.repeat.set(20, 4);
    const road = plane(60, 9, rd);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.07, fz + 7.5);
    g.add(road);
    const lineMat = new THREE.MeshStandardMaterial({ color: '#d8cfb4', roughness: 0.8 });
    for (let i = -10; i < 10; i++) {
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
    opp(-14, -6, [150, 118, 92], 71, 8); opp(-6, 1, [112, 120, 112], 73, 7); opp(1, 8, [176, 150, 120], 75, 9); opp(8, 16, [126, 98, 86], 77, 7.5);
    const swo = plane(40, 3.5, sw); swo.rotation.x = -Math.PI / 2; swo.position.set(0, 0, fz + 12.3); g.add(swo);

    // street props
    const lampP = spawnProp('StreetLamp'); lampP.position.set(-3.9, 0, fz + 2.6); g.add(lampP);
    const bench = spawnProp('Bench'); bench.position.set(-1.4, 0, fz + 1.0); g.add(bench);
    const planter = spawnProp('Planter'); planter.position.set(0.55, 0, fz + 0.45); g.add(planter);
    const bin = spawnProp('Trash'); bin.position.set(3.0, 0, fz + 2.5); g.add(bin);
    const lamp2 = spawnProp('StreetLamp'); lamp2.position.set(6.5, 0, fz + 2.6); g.add(lamp2);
    const tree = this.makeTree(); tree.position.set(-6.2, 0, fz + 2.2); g.add(tree);
    const tree2 = this.makeTree(); tree2.position.set(9.5, 0, fz + 2.3); tree2.scale.setScalar(0.85); g.add(tree2);
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
    S.trash = this.addProp('Trash', new THREE.Vector3(R.x0 + 0.3, 0, 2.25), 0);
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

  setPoster(p, tex, torn = false) {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    part(p, 'poster').traverse((o) => { if (o.isMesh) o.material = m; });
    if (torn) { p.rotation.z = 0.06; }
  }

  setupMirror(mirrorObj, w, h, old) {
    const glassNode = part(mirrorObj, 'glass');
    glassNode.visible = false;
    const holder = new THREE.Group();
    holder.position.set(0, 0, 0.006);
    mirrorObj.add(holder);
    let surface;
    if (this.quality.mirror) {
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
    const S = this.slots, h = (id) => this.state.has(id);
    const goodLight = h('bulb');
    S.lampOld.visible = !goodLight; S.lampPendant.visible = goodLight;
    S.lamp2Old.visible = !h('decor'); S.lamp2Pendant.visible = h('decor');
    S.chairOld.visible = !h('chairClassic'); S.chairClassic.visible = h('chairClassic');
    S.mirrorOld.visible = !h('mirrorLarge'); S.mirrorLarge.visible = h('mirrorLarge');
    S.stationOld.visible = !h('mirrorLarge'); S.stationClassic.visible = h('mirrorLarge');
    for (const m of [S.mirrorOld, S.mirrorLarge]) { const s = m.userData.surface; if (s) s.visible = m.visible; }
    S.waitChairs.visible = !h('couch'); S.couch.visible = h('couch');
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

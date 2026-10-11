// Turns the Blender person rig (joint empties + rigid pieces) into a single
// rigid-skinned mesh per character: one draw call, bones animated procedurally.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL_SLOTS, makePalette, characterMaterial } from '../render/materials.js';
import { toFloat } from '../world/props.js';

let TEMPLATE = null;

export function buildTemplate(gltfScene) {
  const root = gltfScene.getObjectByName('Person');
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const joints = [];
  const jointIndex = new Map();
  root.traverse((o) => {
    if (o.name.startsWith('J_')) {
      jointIndex.set(o.name.slice(2), joints.length);
      joints.push({ name: o.name.slice(2), obj: o });
    }
  });
  for (const j of joints) {
    const p = j.obj.parent;
    j.parent = p && p.name.startsWith('J_') ? jointIndex.get(p.name.slice(2)) : -1;
    j.pos = j.obj.position.clone();
    j.world = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(rootInv, j.obj.matrixWorld));
  }
  const pieces = [];
  let mouth = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    // owning joint
    let p = o.parent;
    while (p && !p.name.startsWith('J_')) p = p.parent;
    const jname = p ? p.name.slice(2) : 'Hips';
    // gltfpack nests meshes (auto-named mesh_N) under the named node
    const name = o.name && !/^mesh_\d+$/.test(o.name) ? o.name : (o.parent ? o.parent.name : '');
    const acc = (name.match(/__acc_(\w+?)(?:_\d+)?$/) || name.match(/__acc_(\w+)/) || [])[1] || null;
    const g = toFloat(o.geometry.clone());
    const m = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    g.applyMatrix4(m);
    const slot = (Array.isArray(o.material) ? o.material[0] : o.material).name.replace(/\.\d+$/, '');
    if (name.includes('__morph')) {
      // The exported mouth is not used: gltfpack quantizes it, and its morph targets come out
      // as absolute positions, so applying them as glTF deltas slid the mouth sideways next
      // to the nose. A proper lip mesh is built below, anchored on the mouth cavity.
      mouth = { joint: jname };
      return;
    }
    pieces.push({ name, geometry: g, joint: jname, slot, acc });
  });
  if (mouth) {
    // the cavity sits 4 mm below the lip line and 17 mm behind the lip surface (see characters.py)
    const cav = pieces.find((p) => p.name.includes('MouthCavity'));
    cav.geometry.computeBoundingBox();
    const c = cav.geometry.boundingBox.getCenter(new THREE.Vector3());
    mouth.center = new THREE.Vector3(c.x, c.y + 0.004, c.z + 0.0172);
  }
  TEMPLATE = { joints, jointIndex, pieces, mouth };
  return TEMPLATE;
}

export function getTemplate() { return TEMPLATE; }

const geoCache = new Map();

function buildGeometry(accs, jointFilter) {
  const key = [...accs].sort().join(',') + '|' + (jointFilter ? jointFilter.key : '');
  if (geoCache.has(key)) return geoCache.get(key);
  const T = TEMPLATE;
  const parts = [];
  for (const pc of T.pieces) {
    if (pc.acc && !accs.has(pc.acc)) continue;
    if (jointFilter && !jointFilter.set.has(pc.joint)) continue;
    const g = pc.geometry.clone();
    const n = g.attributes.position.count;
    const ji = jointFilter ? jointFilter.remap.get(pc.joint) : T.jointIndex.get(pc.joint);
    const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4);
    const pal = new Float32Array(n);
    // the head's skin gets its own slot so faces can blush or go pale on their own
    let slot = PAL_SLOTS.indexOf(pc.slot === 'Skin' && (pc.joint === 'Head' || pc.joint === 'Neck' || pc.joint === 'Jaw' || pc.joint.startsWith('Lid') || pc.joint.startsWith('Brow')) ? 'Face' : pc.slot);
    if (slot < 0) slot = 0;
    for (let i = 0; i < n; i++) { si[i * 4] = ji; sw[i * 4] = 1; pal[i] = slot; }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.morphAttributes = {};
    g.morphTargetsRelative = false;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('pal', new THREE.Float32BufferAttribute(pal, 1));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  merged.boundingSphere.radius = 1.4;
  geoCache.set(key, merged);
  return merged;
}

function buildBones(jointFilter) {
  const T = TEMPLATE;
  const list = jointFilter ? T.joints.filter((j) => jointFilter.set.has(j.name)) : T.joints;
  const bones = [];
  const byName = {};
  for (const j of list) {
    const b = new THREE.Bone();
    b.name = j.name;
    byName[j.name] = b;
    bones.push(b);
  }
  for (const j of list) {
    const b = byName[j.name];
    const parent = j.parent >= 0 ? T.joints[j.parent].name : null;
    if (parent && byName[parent]) {
      byName[parent].add(b);
      b.position.copy(j.pos);
    } else {
      b.position.copy(j.world);
    }
  }
  return { bones, byName };
}

// Creates the renderable body. Returns { mesh, bones, palette, mouth }
export function createBody(colors, accessories = [], opts = {}) {
  const T = TEMPLATE;
  const accs = new Set(accessories);
  let filter = null;
  if (opts.joints) {
    const set = new Set(opts.joints);
    const remap = new Map();
    T.joints.filter((j) => set.has(j.name)).forEach((j, i) => remap.set(j.name, i));
    filter = { set, remap, key: opts.joints.join(',') };
  }
  const geom = buildGeometry(accs, filter);
  const palette = makePalette(colors);
  const material = characterMaterial(palette);
  const { bones, byName } = buildBones(filter);
  const mesh = new THREE.SkinnedMesh(geom, material);
  const rootBones = bones.filter((b) => !b.parent);
  for (const b of rootBones) mesh.add(b);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  mesh.castShadow = true;
  mesh.frustumCulled = false;

  let mouth = null;
  if (!opts.joints && T.mouth) {
    const hw = TEMPLATE.joints[T.jointIndex.get(T.mouth.joint)].world;
    mouthGeo ||= buildMouthGeometry(T.mouth.center.clone().sub(hw));
    const mm = new THREE.MeshStandardMaterial({ color: lipColor(colors), roughness: 0.55, vertexColors: true });
    mouth = new THREE.Mesh(mouthGeo, mm);
    mouth.morphTargetInfluences = new Array(MOUTH_SHAPES.length).fill(0);
    mouth.morphTargetDictionary = Object.fromEntries(MOUTH_SHAPES.map((n, i) => [n, i]));
    mouth.name = 'Mouth';
    byName[T.mouth.joint].add(mouth);
  }
  return { mesh, bones: byName, palette, material, mouth };
}

// ---------------------------------------------------------------- mouth
// Lips as a small curved grid on the face, in head-local space (+z out of the face, +y up).
// Rows from the top of the upper lip to the bottom of the lower lip; the inner rows are dark
// (vertex colour), so a closed mouth shows a fine line between the lips and an open one a
// dark opening. Expressions are relative morph targets built from the same function.
const MOUTH_SHAPES = ['Smile', 'Frown', 'Open', 'Wide', 'O', 'Smirk'];
let mouthGeo = null;

function lipColor(colors) {
  // lips: a little darker and warmer than the skin; deep skin gets deep, brownish lips
  const skin = new THREE.Color(colors.Skin || '#c48a64');
  const hsl = {}; skin.getHSL(hsl);
  const deep = hsl.l < 0.36;
  const lip = skin.clone().lerp(new THREE.Color(deep ? '#5a2a26' : '#a8484a'), deep ? 0.3 : 0.36).multiplyScalar(deep ? 0.84 : 0.88);
  return lip;
}

function buildMouthGeometry(center) {
  const cols = 15, W = 0.044;
  // row: [which lip, fraction] -> rows 0..6
  const ROWS = 7;
  const shape = (o) => {
    const { width = 1, corner = 0, gap = 0.0006, up = 0.0034, lo = 0.0044, smirk = 0, round = 0, lift = 0 } = o;
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < cols; c++) {
        const s = -1 + 2 * c / (cols - 1);
        const edge = Math.max(0, 1 - s * s);          // 1 in the middle, 0 at the corners
        const roundW = 1 - round * 0.35 * (1 - edge);
        const x = s * W / 2 * width * roundW;
        // the line between the lips: corners curl up (smile) or down (frown), one side for a smirk
        const line = corner * s * s + smirk * Math.max(0, s) * Math.abs(s) * 1.2 + lift;
        const g = gap * (0.25 + 0.75 * Math.pow(edge, 0.7)) + 0.0004 * edge;
        // a cupid's bow: the upper lip dips a little in the middle
        const bow = up * (0.85 + 0.25 * Math.abs(s) * (1 - Math.abs(s)) * 4) * Math.pow(edge, 0.45);
        const low = lo * Math.pow(edge, 0.5) * (1 + round * 0.3);
        const ys = [line + g / 2 + bow, line + g / 2 + bow * 0.5, line + g / 2, line, line - g / 2, line - g / 2 - low * 0.55, line - g / 2 - low];
        const y = ys[r];
        // follow the curve of the face: further back towards the corners and below the lip line
        const z = -Math.pow(x / 0.05, 2) * 0.022 - Math.max(0, -(y)) * 0.12 + (r === 3 ? -0.0015 * edge : 0.0008 * edge) + 0.0006;
        out.push(center.x + x, center.y + y, center.z + z);
      }
    }
    return out;
  };
  const basePos = shape({});
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(basePos, 3));
  // dark inside, lip colour outside
  const col = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) {
    const k = r === 3 ? 0.12 : (r === 2 || r === 4) ? 0.32 : r === 0 || r === 6 ? 0.92 : 1.0;
    col.push(k, k, k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = [];
  for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c;
    idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
  }
  geo.setIndex(idx);
  const targets = {
    Smile: { width: 1.1, corner: 0.0062, up: 0.0028, lo: 0.0040, lift: 0.0006 },
    Frown: { width: 0.94, corner: -0.0055, lo: 0.0048 },
    Open: { gap: 0.013, width: 0.94, lo: 0.0040 },
    Wide: { gap: 0.007, width: 1.18, corner: 0.0022 },
    O: { gap: 0.011, width: 0.56, round: 1, up: 0.0038, lo: 0.0046 },
    Smirk: { smirk: 0.0065 },
  };
  geo.morphAttributes.position = MOUTH_SHAPES.map((n) => {
    const t = shape(targets[n]);
    return new THREE.Float32BufferAttribute(t.map((v, i) => v - basePos[i]), 3);
  });
  geo.morphTargetsRelative = true;
  geo.computeVertexNormals();
  return geo;
}

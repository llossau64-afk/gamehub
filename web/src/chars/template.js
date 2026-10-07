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
      mouth = { geometry: toFloat(o.geometry.clone()), joint: jname, matrix: m, morphDict: o.morphTargetDictionary };
      return;
    }
    pieces.push({ name, geometry: g, joint: jname, slot, acc });
  });
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
    let slot = PAL_SLOTS.indexOf(pc.slot);
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
    const mg = T.mouth.geometry;
    const mm = new THREE.MeshStandardMaterial({ color: colors.Mouth || '#4a1f1c', roughness: 0.5 });
    mouth = new THREE.Mesh(mg, mm);
    mouth.morphTargetInfluences = new Array(Object.keys(T.mouth.morphDict).length).fill(0);
    mouth.morphTargetDictionary = T.mouth.morphDict;
    const head = byName[T.mouth.joint];
    // matrix (root space) -> head local
    const hw = TEMPLATE.joints[T.jointIndex.get(T.mouth.joint)].world;
    mouth.applyMatrix4(T.mouth.matrix);
    mouth.position.sub(hw);
    head.add(mouth);
  }
  return { mesh, bones: byName, palette, material, mouth };
}

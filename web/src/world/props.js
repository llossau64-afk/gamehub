// Prop library: Blender props (P_<Name>) with materials assigned by name.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { propMaterial } from '../render/materials.js';

const library = new Map();
const special = new Map(); // material-name -> material override (set by the world)

export function setSpecialMaterial(name, mat) { special.set(name, mat); }

function materialFor(m) {
  const n = m.name.replace(/(\.\d+|\d{3})$/, '');
  return special.get(n) || propMaterial(n);
}

export function registerProps(gltfScene) {
  for (const child of [...gltfScene.children]) {
    if (!child.name.startsWith('P_')) continue;
    library.set(child.name.slice(2), child);
  }
}

export function propNames() { return [...library.keys()]; }

// Merge meshes that share a material inside each "rigid" group (a node that the game may
// animate keeps its own subtree). Cuts draw calls a lot for multi-part props.
const KEEP = new Set(['pivot', 'glass', 'bulb', 'hinge', 'bell', 'bladeA', 'bladeB', 'stripes', 'poster',
  'rotor', 'hourHand', 'minuteHand', 'signface', 'screen', 'drawer']);

function prepare(root) {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  out.name = root.name;
  const groups = new Map(); // node -> { node, mats: Map }
  function owner(o) {
    let p = o.parent;
    while (p && p !== root && !KEEP.has(p.name.replace(/(\.\d+|\d{3})$/, ''))) p = p.parent;
    return p || root;
  }
  // build output group hierarchy for KEEP nodes
  const nodeMap = new Map([[root, out]]);
  function ensureNode(n) {
    if (nodeMap.has(n)) return nodeMap.get(n);
    const parentOut = ensureNode(owner(n));
    const g = new THREE.Group();
    g.name = n.name.replace(/(\.\d+|\d{3})$/, '');
    // position relative to its owner
    const ownerWorld = owner(n).matrixWorld;
    const rel = new THREE.Matrix4().copy(ownerWorld).invert().multiply(n.matrixWorld);
    rel.decompose(g.position, g.quaternion, g.scale);
    parentOut.add(g);
    nodeMap.set(n, g);
    return g;
  }
  root.traverse((o) => {
    if (o !== root && KEEP.has(o.name.replace(/(\.\d+|\d{3})$/, ''))) ensureNode(o);
  });
  root.traverse((o) => {
    if (!o.isMesh) return;
    const isKeepMesh = KEEP.has(o.name.replace(/(\.\d+|\d{3})$/, ''));
    const own = isKeepMesh ? o : owner(o);
    const target = isKeepMesh ? ensureNode(o) : ensureNode(own);
    const ownWorld = own.matrixWorld;
    const rel = new THREE.Matrix4().copy(ownWorld).invert().multiply(o.matrixWorld);
    const g = o.geometry.clone().applyMatrix4(rel);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const mname = o.material.name.replace(/(\.\d+|\d{3})$/, '');
    if (!groups.has(target)) groups.set(target, new Map());
    const mm = groups.get(target);
    if (!mm.has(mname)) mm.set(mname, { mat: o.material, geos: [] });
    mm.get(mname).geos.push(g.index ? g.toNonIndexed() : g);
  });
  for (const [target, mm] of groups) {
    for (const [mname, { mat, geos }] of mm) {
      const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      geo.computeBoundingSphere();
      if (UV_NAMES.has(target.name) || UV_MATS.has(mname)) planarUV(geo);
      const mesh = new THREE.Mesh(geo, materialFor(mat));
      mesh.name = mname;
      mesh.userData.materialName = mname;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      target.add(mesh);
    }
  }
  return out;
}

// planar UVs for flat textured parts (Blender export skips UVs to keep files small)
const UV_NAMES = new Set(['poster', 'signface', 'screen']);
const UV_MATS = new Set(['CashNote', 'PaperSign']);
export function planarUV(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, size = b.getSize(new THREE.Vector3());
  const axes = [['x', size.x], ['y', size.y], ['z', size.z]].sort((a, c) => a[1] - c[1]);
  const n = axes[0][0];
  // u runs along x when possible, v along y (or z for flat-lying planes)
  const uA = n === 'x' ? 'z' : 'x';
  const vA = n === 'y' ? 'z' : 'y';
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    uv[i * 2] = (v[uA] - b.min[uA]) / (size[uA] || 1);
    uv[i * 2 + 1] = vA === 'z' ? 1 - (v[vA] - b.min[vA]) / (size[vA] || 1) : (v[vA] - b.min[vA]) / (size[vA] || 1);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const prepared = new Map();

export function spawnProp(name, opts = {}) {
  if (!prepared.has(name)) {
    const src = library.get(name);
    if (!src) throw new Error('Unknown prop ' + name);
    prepared.set(name, prepare(src));
  }
  const obj = prepared.get(name).clone(true);
  if (opts.shadows === false) obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return obj;
}

// find a named child (Blender names may have .001 suffixes)
export function part(obj, name) {
  let found = null;
  obj.traverse((o) => { if (!found && (o.name === name || o.name.replace(/(\.\d+|\d{3})$/, '') === name)) found = o; });
  return found;
}

export function meshesByMaterial(obj, matName) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && o.userData.materialName === matName) out.push(o); });
  return out;
}

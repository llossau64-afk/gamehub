// The barber cape as worn by a seated customer, built to the seated pose: a snug collar, a
// dome over the shoulders, wide enough to swallow the arms on the armrests, and a front that
// runs out over the thighs and hangs down past the knees. The back stays short so it doesn't
// fight the chair's backrest. Local space: neck at the origin, +z forward, y up (Chest bone).
import * as THREE from 'three';
import { propMaterial } from '../render/materials.js';

// profiles: [out, y] from the neck down, for the side, the front and the back
const SIDE = [[0.085, 0], [0.17, -0.035], [0.26, -0.09], [0.36, -0.23], [0.45, -0.4], [0.5, -0.56], [0.52, -0.86]];
const FRONT = [[0.085, 0.0], [0.13, -0.05], [0.21, -0.17], [0.3, -0.33], [0.5, -0.48], [0.68, -0.55], [0.74, -0.9]];
const BACK = [[0.075, 0.01], [0.11, -0.04], [0.15, -0.12], [0.17, -0.26], [0.18, -0.36], [0.18, -0.42], [0.18, -0.46]];

function sample(prof, t) {
  const f = t * (prof.length - 1), i = Math.min(prof.length - 2, Math.floor(f)), k = f - i;
  // smooth step between points so the silhouette has no kinks
  const s = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
  return [prof[i][0] + (prof[i + 1][0] - prof[i][0]) * s, prof[i][1] + (prof[i + 1][1] - prof[i][1]) * s];
}

let geoCache = null;
function capeGeometry() {
  if (geoCache) return geoCache;
  const rings = 26, seg = 48;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const [sx, sy] = sample(SIDE, t), [fz, fy] = sample(FRONT, t), [bz, by] = sample(BACK, t);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const front = sa > 0;
      const rz = front ? fz : bz, yz = front ? fy : by;
      // soft folds that grow towards the hem, more of them at the front
      const fold = 1 + t * t * (0.05 * Math.sin(a * 9 + 0.6) + 0.025 * Math.sin(a * 17));
      const x = ca * sx * fold, z = sa * rz * fold;
      let y = sy * ca * ca + yz * sa * sa;
      y += t * t * 0.03 * Math.sin(a * 9 + 0.6);           // the hem rises and falls with the folds
      pos.push(x, y, z);
      uv.push(k / seg * 4, t * 2);
    }
  }
  const row = seg + 1;
  for (let r = 0; r < rings; r++) for (let k = 0; k < seg; k++) {
    const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  geoCache = g;
  return g;
}

export function makeCape() {
  const root = new THREE.Group();
  root.name = 'Cape';
  const cloth = new THREE.Mesh(capeGeometry(), propMaterial('Cape'));
  cloth.name = 'cape_cloth';
  cloth.castShadow = true; cloth.receiveShadow = true;
  root.add(cloth);
  // a striped trim along the hem and the paper neck strip
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.012, 6, 28), propMaterial('CapeStripe'));
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.004;
  collar.name = 'cape_collar';
  root.add(collar);
  return root;
}

// Circuit furniture: grandstands with a crowd, tyre walls, kerbs, the start gantry and
// simple city blocks for the street circuits. Everything is built once and instanced.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { rng } from '../core/util.js';

const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function colorBox(w, h, d, x, y, z, col) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function crowdTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 512, 64);
  const r = rng(77);
  const shirts = ['#d8d4cc', '#c23b2a', '#2f5fa8', '#e2a33b', '#2b2b2e', '#5b8a3a', '#e8e2d0', '#8a2a3a', '#f0c040', '#3a7ab8'];
  for (let x = 2; x < 512; x += 7) {
    for (const y0 of [6, 38]) {
      const y = y0 + r() * 4;
      g.fillStyle = shirts[Math.floor(r() * shirts.length)];
      g.fillRect(x, y + 9, 5, 12);
      g.fillStyle = ['#e8c4a0', '#c49a74', '#8a6448', '#f0d4b8'][Math.floor(r() * 4)];
      g.beginPath(); g.arc(x + 2.5, y + 6, 2.6, 0, Math.PI * 2); g.fill();
      if (r() < 0.12) { g.fillStyle = shirts[Math.floor(r() * shirts.length)]; g.fillRect(x - 1, y - 4, 7, 5); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// A 24 m grandstand facing -x (the road side), origin at the front foot.
export function grandstandParts() {
  return memo('stand', () => {
    const L = 24, steps = 7, sd = 1.1, sh = 0.62;
    const s = [];
    for (let i = 0; i < steps; i++) s.push(colorBox(sd, sh * (i + 1), L, sd * (i + 0.5), sh * (i + 1) / 2, 0, i % 2 ? 0x8d9096 : 0x9ea1a6));
    s.push(colorBox(0.3, sh * steps + 4.2, L, sd * steps + 0.15, (sh * steps + 4.2) / 2, 0, 0x6c7076)); // back wall
    s.push(colorBox(0.4, 1.1, L, -0.2, 0.55, 0, 0xd8d6d0)); // front wall
    const roofY = sh * steps + 4.2;
    s.push(colorBox(sd * steps + 2.4, 0.25, L + 0.6, sd * steps / 2 - 0.6, roofY, 0, 0xe6e4de));
    for (let k = -2; k <= 2; k++) s.push(colorBox(0.22, roofY, 0.22, sd * steps, roofY / 2, k * L / 4.4, 0x50545a));
    // sponsor-free banner strip along the front
    s.push(colorBox(0.06, 0.7, L, -0.42, 0.75, 0, 0xb83224));
    const struct = mergeGeometries(s.map((g) => g.toNonIndexed()));
    const crowd = [];
    for (let i = 0; i < steps; i++) {
      const pl = new THREE.PlaneGeometry(L - 0.4, 0.9, 1, 1);
      pl.rotateY(-Math.PI / 2);
      pl.translate(sd * i + 0.12, sh * (i + 1) + 0.45, 0);
      const uv = pl.attributes.uv;
      for (let k = 0; k < uv.count; k++) { uv.setX(k, uv.getX(k) * 3 + i * 0.37); uv.setY(k, uv.getY(k) * 0.5 + (i % 2) * 0.5); }
      crowd.push(pl);
    }
    const crowdGeo = mergeGeometries(crowd);
    const mStruct = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    const mCrowd = new THREE.MeshStandardMaterial({ map: crowdTexture(), roughness: 0.95, side: THREE.DoubleSide });
    return [{ geometry: struct, material: mStruct }, { geometry: crowdGeo, material: mCrowd }];
  });
}

// A stack of three tyres, 0.8 m across; laid in rows along corners.
export function tyreParts() {
  return memo('tyres', () => {
    const g = [];
    for (let k = 0; k < 3; k++) {
      const t = new THREE.TorusGeometry(0.31, 0.12, 6, 12);
      t.rotateX(Math.PI / 2);
      t.translate(0, 0.12 + k * 0.24, 0);
      g.push(t);
    }
    const geo = mergeGeometries(g);
    return [{ geometry: geo, material: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.9 }) }];
  });
}

// One kerb block: 1.6 m long (z), 1 m wide (x), red or white.
export function kerbParts(red) {
  return memo('kerb' + red, () => {
    const g = new THREE.BoxGeometry(1, 0.1, 1.6);
    g.translate(0, 0.0, 0);
    return [{ geometry: g, material: new THREE.MeshStandardMaterial({ color: red ? 0xc0281e : 0xe8e6e0, roughness: 0.6 }) }];
  });
}

// City block: a unit box (1 x 1 x 1, origin at the base); scaled per instance.
// Windows come from world position in the shader so every scale looks right.
export function blockParts() {
  return memo('block', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const m = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 0.8, metalness: 0.05 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying float vLY; varying float vTint;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 wpp = vec4(transformed, 1.0);\nfloat baseY = 0.0; vec3 wn = objectNormal;\n#ifdef USE_INSTANCING\nwpp = instanceMatrix * wpp; baseY = instanceMatrix[3].y; wn = mat3(instanceMatrix) * wn; vTint = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5);\n#else\nvTint = 0.5;\n#endif\nvLY = wpp.y - baseY;\nwpp = modelMatrix * wpp; vWP = wpp.xyz; vWN = normalize(mat3(modelMatrix) * wn);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; varying float vLY; varying float vTint;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float side = abs(vWN.y) < 0.5 ? 1.0 : 0.0;
            vec2 f = vec2(abs(vWN.x) > 0.5 ? vWP.z : vWP.x, vLY);
            vec2 cell = floor(f / vec2(1.9, 3.2));
            vec2 lf = fract(f / vec2(1.9, 3.2));
            float win = step(0.28, lf.x) * step(lf.x, 0.72) * step(0.38, lf.y) * step(lf.y, 0.82) * side * step(3.3, vLY);
            float lit = step(0.55, h21(cell + floor(vWP.xz * 0.05)));
            vec3 pal = vTint < 0.25 ? vec3(0.78, 0.74, 0.66) : vTint < 0.5 ? vec3(0.62, 0.6, 0.58) : vTint < 0.75 ? vec3(0.74, 0.62, 0.52) : vec3(0.85, 0.84, 0.8);
            diffuseColor.rgb = pal;
            // a band at every floor
            diffuseColor.rgb *= 1.0 - 0.12 * step(0.94, fract(vLY / 3.2)) * side;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.2), win);
            totalEmissiveRadiance += win * lit * vec3(1.0, 0.82, 0.55) * 0.55;
            // shop fronts: a darker ground floor
            diffuseColor.rgb *= 1.0 - 0.45 * side * (1.0 - step(3.3, vLY));
          }`);
    };
    m.customProgramCacheKey = () => 'cityblock1';
    return [{ geometry: g, material: m }];
  });
}

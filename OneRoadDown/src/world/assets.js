// Loads the Blender-made assets (assets/models/*.glb, assets/textures/*.jpg) and
// exposes them as instancing-ready parts. Foliage and rock materials get wind sway
// and world-space snow; the terrain gets a six-layer splat material.

import * as THREE from 'three';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';

export const shared = {
  time: { value: 0 },
  wind: { value: 0.4 },
  snow: { value: 0 },
  ready: false,
};

const parts = new Map();   // name -> [{ geometry, material }]
const objects = new Map(); // name -> Object3D (template)
const tex = {};

export const hasAsset = (n) => parts.has(n);
export const assetParts = (n) => parts.get(n) || null;
export const assetNames = () => [...parts.keys()];
export function cloneAsset(n) {
  const o = objects.get(n);
  return o ? o.clone() : null;
}
export const groundTex = tex;

// cars.glb: one root per car id with children `${id}__${part}` (meshes + anchor empties)
const cars = new Map();
export const carAsset = (id) => cars.get(id) || null;
function registerCars(scene) {
  for (const root of scene.children) {
    const id = root.name;
    const A = { parts: {}, nodes: {} };
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    for (const o of root.children) {
      const part = o.name.slice(id.length + 2);
      const local = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      if (o.isMesh || o.isGroup) {
        const meshes = [];
        o.traverse((m) => { if (m.isMesh) meshes.push(m); });
        if (!meshes.length) { A.nodes[part] = new THREE.Vector3().setFromMatrixPosition(local); continue; }
        const m = meshes[0];
        const g = m.geometry;
        if (part === 'steering') {
          // keep the hub transform: the wheel turns about its local z axis
          g.computeVertexNormals();
          A.steering = { geometry: g, matrix: local.clone(), material: m.material.name };
        } else {
          g.applyMatrix4(local);
          if (!g.attributes.normal) g.computeVertexNormals();
          A.parts[part] = { geometry: g, material: (m.material.name || '').replace(/^car_/, '') };
        }
      } else {
        A.nodes[part] = new THREE.Vector3().setFromMatrixPosition(local);
      }
    }
    cars.set(id, A);
  }
}

function patchFoliage(m, kind) {
  m.userData.patched = kind;
  const card = kind === 'leaf' || kind === 'needle' || kind === 'grass';
  if (card) { m.alphaTest = 0.45; m.transparent = false; m.side = THREE.DoubleSide; }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time; sh.uniforms.uWind = shared.wind; sh.uniforms.uSnow = shared.snow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; varying float vSnowY; varying float vHgt;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
        ip = instanceMatrix[3].xyz;
        #endif
        float ph = dot(ip.xz, vec2(0.131, 0.173));
        float hgt = max(0.0, position.y);
        vHgt = position.y;
        float sw = sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25;
        ${kind === 'rock' ? '' : `transformed.x += sw * uWind * hgt * hgt * ${kind === 'grass' ? '0.12' : '0.0035'};
        transformed.z += sw * uWind * hgt * hgt * ${kind === 'grass' ? '0.08' : '0.0025'};`}
        ${kind === 'leaf' ? 'transformed += objectNormal * sin(uTime * 5.0 + position.x * 3.1 + position.z * 2.3 + ph) * 0.035 * (0.4 + uWind);' : ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${kind === 'grass' ? 'objectNormal = vec3(0.0, 1.0, 0.0);' : ''}
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
        wn = mat3(instanceMatrix) * wn;
        #endif
        vSnowY = normalize(mat3(modelMatrix) * wn).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow; varying float vSnowY; varying float vHgt;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float snowK = smoothstep(${kind === 'rock' ? '0.45, 0.85' : '0.25, 0.75'}, vSnowY) * uSnow;
        ${kind === 'grass' ? 'diffuseColor.rgb *= mix(0.45, 0.95, smoothstep(0.0, 0.45, vHgt));' : ''}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), snowK * 0.9);`);
    if (card) {
      // cards: keep the authored (canopy / up) normal on both sides instead of flipping it
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;');
    }
  };
  m.customProgramCacheKey = () => 'fol_' + kind;
}

function classify(name) {
  if (/needles/.test(name)) return 'needle';
  if (/leaves/.test(name)) return 'leaf';
  if (/grass|fern/.test(name)) return 'grass';
  if (/rock/.test(name)) return 'rock';
  if (/bark/.test(name)) return 'bark';
  return null;
}

function register(scene, anisotropy) {
  for (const root of scene.children) {
    const list = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      // bake the node transform relative to the root (Blender origin)
      const m = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld);
      g.applyMatrix4(m);
      const mat = o.material;
      if (mat.map) mat.map.anisotropy = anisotropy;
      const kind = classify(mat.name || '');
      if (kind && !mat.userData.patched) patchFoliage(mat, kind);
      if (mat.name && mat.name.startsWith('b_') && /railing|flowers/.test(mat.name)) { mat.alphaTest = 0.5; mat.transparent = false; }
      list.push({ geometry: g, material: mat });
    });
    if (list.length) parts.set(root.name, list);
    root.position.set(0, 0, 0);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    objects.set(root.name, root);
  }
}

// Hosts that do not serve .glb get a base64 JSON copy ({ glb: "<base64>" }) next to it.
async function loadGLB(loader, path) {
  let r = await fetch(path + '.glb').catch(() => null);
  let buf;
  if (r && r.ok && !/text\/html/.test(r.headers.get('content-type') || '')) buf = await r.arrayBuffer();
  else {
    r = await fetch(path + '.glb.json');
    if (!r.ok) throw new Error('missing ' + path);
    const bin = atob((await r.json()).glb);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    buf = u8.buffer;
  }
  return loader.parseAsync(buf, '');
}

export async function loadAssets(renderer, onProgress = () => {}, base = './assets/') {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loader = new GLTFLoader();
  const files = ['nature', 'buildings', 'cars'];
  let done = 0;
  const steps = files.length + 1;
  for (const f of files) {
    try {
      const gl = await loadGLB(loader, `${base}models/${f}`);
      if (f === 'cars') registerCars(gl.scene);
      else register(gl.scene, aniso);
    } catch (e) {
      console.warn('[assets] could not load', f, e && e.message);
    }
    onProgress(++done / steps);
  }
  const tl = new THREE.TextureLoader();
  const names = ['grass', 'forest', 'dirt', 'gravel', 'rock', 'snow', 'sand'];
  await Promise.all(names.map(async (n) => {
    try {
      const t = await tl.loadAsync(`${base}textures/${n}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      tex[n] = t;
    } catch (e) { console.warn('[assets] texture', n, e && e.message); }
  }));
  onProgress(1);
  shared.ready = parts.size > 0;
  return shared.ready;
}

// Six-layer terrain material: grass, forest floor, dirt, gravel, rock (triplanar),
// snow, sand. Weights come from two vertex attributes; the vertex colour tints.
export function makeTerrainMaterial(quality) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (!tex.grass) return null;
  const tri = quality !== 'low';
  m.onBeforeCompile = (sh) => {
    for (const k of ['grass', 'forest', 'dirt', 'gravel', 'rock', 'snow', 'sand']) sh.uniforms['t_' + k] = { value: tex[k] || tex.grass };
    sh.uniforms.uSnowGlobal = shared.snow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splatA; attribute vec4 splatB; varying vec4 vSA; varying vec4 vSB; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSA = splatA; vSB = splatB; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D t_grass; uniform sampler2D t_forest; uniform sampler2D t_dirt; uniform sampler2D t_gravel; uniform sampler2D t_rock; uniform sampler2D t_snow; uniform sampler2D t_sand;
        varying vec4 vSA; varying vec4 vSB; varying vec3 vWP; varying vec3 vWN;
        vec3 twoScale(sampler2D t, vec2 uv) { return mix(texture2D(t, uv).rgb, texture2D(t, uv * 0.23 + 0.37).rgb, 0.35); }`)
      .replace('#include <map_fragment>', `
        vec2 uv = vWP.xz * 0.16;
        vec3 c = vec3(0.0);
        float wsum = 0.0001;
        if (vSA.x > 0.01) { c += twoScale(t_grass, uv) * vSA.x; wsum += vSA.x; }
        if (vSA.y > 0.01) { c += twoScale(t_forest, uv * 1.2) * vSA.y; wsum += vSA.y; }
        if (vSA.z > 0.01) { c += texture2D(t_dirt, uv * 1.3).rgb * vSA.z; wsum += vSA.z; }
        if (vSA.w > 0.01) { c += texture2D(t_gravel, uv * 1.6).rgb * vSA.w; wsum += vSA.w; }
        if (vSB.x > 0.01) {
          ${tri ? `vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 rk = texture2D(t_rock, vWP.zy * 0.09).rgb * bw.x + texture2D(t_rock, vWP.xz * 0.09).rgb * bw.y + texture2D(t_rock, vWP.xy * 0.09).rgb * bw.z;`
          : 'vec3 rk = texture2D(t_rock, vWP.xz * 0.09).rgb;'}
          c += rk * vSB.x; wsum += vSB.x; }
        if (vSB.y > 0.01) { c += texture2D(t_snow, uv * 0.6).rgb * vSB.y; wsum += vSB.y; }
        if (vSB.z > 0.01) { c += twoScale(t_sand, uv * 0.7) * vSB.z; wsum += vSB.z; }
        c /= wsum;
        diffuseColor.rgb *= c * 1.55;
        float terrLum = dot(c, vec3(0.333));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // cheap bump from the blended albedo luminance
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(terrLum), hy = dFdy(terrLum);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2) * 1.4;
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  m.customProgramCacheKey = () => 'terrain' + (tri ? 3 : 1);
  return m;
}

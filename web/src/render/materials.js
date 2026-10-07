// One material library for the whole game. Blender assets only carry material
// names; the look of every surface is defined here so everything stays in one style.
import * as THREE from 'three';
import { detailTexture, cashTexture, doorSignTexture } from './textures.js';

export const shared = {
  detail: null,
  grime: { value: 1.0 },      // 1 = filthy starting shop, 0 = spotless
  time: { value: 0 },
};

export function initMaterials() {
  shared.detail = detailTexture();
}

// detail channel weights: [grain, wood, leather, scratches]
const DEFS = {
  WoodDark:     { color: '#4a2f1e', rough: 0.55, detail: [0.25, 0.7, 0, 0.3], scale: 3 },
  WoodLight:    { color: '#9a6e45', rough: 0.6, detail: [0.25, 0.75, 0, 0.3], scale: 3 },
  WoodOld:      { color: '#7d6448', rough: 0.8, detail: [0.4, 0.6, 0, 0.6], scale: 3, grime: 1 },
  Laminate:     { color: '#b5a184', rough: 0.55, detail: [0.35, 0.2, 0, 0.5], scale: 2, grime: 1 },
  PaintedWood:  { color: '#d9cdb4', rough: 0.6, detail: [0.3, 0.3, 0, 0.4], scale: 3, grime: 1 },
  PaintGreen:   { color: '#2f4a3a', rough: 0.55, detail: [0.25, 0.25, 0, 0.3], scale: 3 },
  Chrome:       { color: '#d8d8d4', rough: 0.18, metal: 1, detail: [0.15, 0, 0, 0.35], scale: 4 },
  ChromeWorn:   { color: '#a9a49a', rough: 0.42, metal: 0.85, detail: [0.45, 0, 0, 0.7], scale: 4, grime: 1 },
  Brass:        { color: '#b58a3c', rough: 0.32, metal: 1, detail: [0.25, 0, 0, 0.4], scale: 4 },
  Metal:        { color: '#5b5f5e', rough: 0.5, metal: 0.6, detail: [0.3, 0, 0, 0.5], scale: 4 },
  MetalDark:    { color: '#2c2d2e', rough: 0.45, metal: 0.5, detail: [0.25, 0, 0, 0.4], scale: 4 },
  MetalPainted: { color: '#6f7a6c', rough: 0.6, metal: 0.2, detail: [0.35, 0, 0, 0.6], scale: 4, grime: 1 },
  Leather:      { color: '#7a2622', rough: 0.45, detail: [0.1, 0, 0.55, 0.1], scale: 6 },
  LeatherBlack: { color: '#26211f', rough: 0.42, detail: [0.1, 0, 0.55, 0.1], scale: 6 },
  LeatherOld:   { color: '#6b3d2e', rough: 0.7, detail: [0.3, 0, 0.8, 0.5], scale: 6, grime: 1 },
  LeatherBrown: { color: '#6a4126', rough: 0.5, detail: [0.1, 0, 0.6, 0.15], scale: 6 },
  Foam:         { color: '#d6b45c', rough: 0.95, detail: [0.7, 0, 0, 0], scale: 10 },
  Tape:         { color: '#9a9a92', rough: 0.4, detail: [0.4, 0, 0, 0.2], scale: 8 },
  Plastic:      { color: '#cfc4ae', rough: 0.45, detail: [0.2, 0, 0, 0.3], scale: 6, grime: 1 },
  PlasticBlack: { color: '#1e1f21', rough: 0.4, detail: [0.15, 0, 0, 0.3], scale: 6 },
  PlasticOrange:{ color: '#b8613a', rough: 0.5, detail: [0.25, 0, 0, 0.45], scale: 6, grime: 1 },
  PlasticRed:   { color: '#9c2f2a', rough: 0.4, detail: [0.15, 0, 0, 0.2], scale: 6 },
  Rubber:       { color: '#202020', rough: 0.85, detail: [0.4, 0, 0, 0], scale: 8 },
  Enamel:       { color: '#ece6d8', rough: 0.25, detail: [0.15, 0, 0, 0.3], scale: 4 },
  Ceramic:      { color: '#e8e2d4', rough: 0.3, detail: [0.1, 0, 0, 0.2], scale: 4 },
  Terracotta:   { color: '#a8583a', rough: 0.85, detail: [0.5, 0, 0, 0.2], scale: 5 },
  Soil:         { color: '#3a2a1c', rough: 1, detail: [0.8, 0, 0, 0], scale: 12 },
  Leaf:         { color: '#4c6b3a', rough: 0.6, detail: [0.2, 0.3, 0, 0], scale: 8, side: THREE.DoubleSide },
  LeafDark:     { color: '#2f4b2a', rough: 0.6, detail: [0.2, 0.3, 0, 0], scale: 8, side: THREE.DoubleSide },
  Fabric:       { color: '#6d6a5c', rough: 0.95, detail: [0.6, 0, 0.2, 0], scale: 14 },
  FabricGreen:  { color: '#3b5546', rough: 0.95, detail: [0.6, 0, 0.2, 0], scale: 14 },
  Cape:         { color: '#24344d', rough: 0.55, detail: [0.25, 0, 0, 0], scale: 10, side: THREE.DoubleSide },
  CapeStripe:   { color: '#e6dcc4', rough: 0.55, detail: [0.25, 0, 0, 0], scale: 10, side: THREE.DoubleSide },
  Paper:        { color: '#e6dcc4', rough: 0.9, detail: [0.35, 0, 0, 0], scale: 10, side: THREE.DoubleSide },
  Envelope:     { color: '#c7a678', rough: 0.85, detail: [0.35, 0, 0, 0], scale: 10 },
  Cash:         { color: '#9fb48f', rough: 0.8, detail: [0.3, 0, 0, 0], scale: 12, side: THREE.DoubleSide },
  CashBand:     { color: '#c8b26a', rough: 0.6, detail: [0.2, 0, 0, 0], scale: 12 },
  Glass:        { color: '#b8c8c8', rough: 0.05, metal: 0, transparent: true, opacity: 0.25 },
  Bottle:       { color: '#4d6a4f', rough: 0.12, transparent: true, opacity: 0.85 },
  BottleAmber:  { color: '#8a4b18', rough: 0.12, transparent: true, opacity: 0.88 },
  Liquid:       { color: '#2d7f9a', rough: 0.1, transparent: true, opacity: 0.8 },
  LabelRed:     { color: '#8e2c27', rough: 0.6 },
  LabelCream:   { color: '#e7dcc2', rough: 0.6 },
  LabelBlue:    { color: '#2a3f5f', rough: 0.6 },
  LabelGold:    { color: '#c09a4a', rough: 0.5, metal: 0.4 },
  Cord:         { color: '#1c1b1a', rough: 0.6 },
  CordFabric:   { color: '#8d7a5b', rough: 0.9, detail: [0.5, 0, 0, 0], scale: 30 },
  Bulb:         { color: '#fff3d6', rough: 0.2, emissive: '#ffcf8a', emissiveIntensity: 1.5 },
  BulbOff:      { color: '#d9d2c2', rough: 0.2 },
  Neon:         { color: '#ff7a5c', rough: 0.3, emissive: '#ff5a3c', emissiveIntensity: 2.2 },
  ScreenDark:   { color: '#111316', rough: 0.2 },
  Screen:       { color: '#202830', rough: 0.25, emissive: '#5c86a0', emissiveIntensity: 0.6 },
  Concrete:     { color: '#8f8a80', rough: 0.9, detail: [0.6, 0, 0, 0.3], scale: 3 },
  Stone:        { color: '#9a9284', rough: 0.85, detail: [0.6, 0, 0.3, 0.2], scale: 2 },
  Awning:       { color: '#7a2a26', rough: 0.8, detail: [0.5, 0, 0, 0.2], scale: 8, side: THREE.DoubleSide, grime: 1 },
  AwningStripe: { color: '#d8c9a6', rough: 0.8, detail: [0.5, 0, 0, 0.2], scale: 8, side: THREE.DoubleSide, grime: 1 },
  PoleRed:      { color: '#a8302a', rough: 0.4 },
  PoleWhite:    { color: '#ece6d8', rough: 0.4 },
  PoleBlue:     { color: '#2a4a7a', rough: 0.4 },
  Comb:         { color: '#262626', rough: 0.35 },
  Steel:        { color: '#c4c6c6', rough: 0.22, metal: 1, detail: [0.1, 0, 0, 0.3], scale: 6 },
  Gold:         { color: '#c7a24a', rough: 0.28, metal: 1, detail: [0.15, 0, 0, 0.3], scale: 6 },
  Hook:         { color: '#3c3a36', rough: 0.4, metal: 0.8 },
  CashNote:     { color: '#ffffff', rough: 0.85, tex: 'cash', side: THREE.DoubleSide },
  PaperSign:    { color: '#ffffff', rough: 0.8, tex: 'doorSign' },
  Default:      { color: '#888888', rough: 0.6 },
};

const cache = new Map();
const TEX = {};

export function propMaterial(name) {
  const key = name.replace(/\.\d+$/, '');
  if (cache.has(key)) return cache.get(key);
  const d = DEFS[key] || DEFS.Default;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(d.color),
    roughness: d.rough ?? 0.6,
    metalness: d.metal ?? 0,
    side: d.side ?? THREE.FrontSide,
    transparent: !!d.transparent,
    opacity: d.opacity ?? 1,
  });
  if (d.emissive) {
    m.emissive = new THREE.Color(d.emissive);
    m.emissiveIntensity = d.emissiveIntensity ?? 1;
  }
  if (d.transparent) m.depthWrite = false;
  if (d.tex) m.map = (TEX[d.tex] ||= { cash: cashTexture, doorSign: doorSignTexture }[d.tex]());
  m.name = key;
  if (d.detail) addDetail(m, d.detail, d.scale ?? 4, d.grime ? 1 : 0.35);
  cache.set(key, m);
  return m;
}

export function hasPropMaterial(name) {
  return !!DEFS[name.replace(/\.\d+$/, '')];
}

// Triplanar object-space detail + world-space grime, injected into MeshStandardMaterial.
export function addDetail(m, weights, scale = 4, grimeAmount = 0.35, opts = {}) {
  const w = new THREE.Vector4(...weights);
  m.userData.detail = { weights: w, scale, grimeAmount };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uDetail = { value: shared.detail };
    shader.uniforms.uDetailW = { value: w };
    shader.uniforms.uDetailScale = { value: scale };
    shader.uniforms.uGrime = shared.grime;
    shader.uniforms.uGrimeAmt = { value: grimeAmount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos; varying vec3 vObjN; varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vObjPos = position; vObjN = normal;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#ifdef USE_INSTANCING
vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos; varying vec3 vObjN; varying vec3 vWPos;
uniform sampler2D uDetail; uniform vec4 uDetailW; uniform float uDetailScale;
uniform float uGrime; uniform float uGrimeAmt;
vec4 triDetail(){
  vec3 n = abs(normalize(vObjN)); n = pow(n, vec3(4.0)); n /= (n.x+n.y+n.z+1e-5);
  vec3 p = vObjPos * uDetailScale;
  vec4 a = texture2D(uDetail, p.zy);
  vec4 b = texture2D(uDetail, p.xz);
  vec4 c = texture2D(uDetail, p.xy);
  return a*n.x + b*n.y + c*n.z;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec4 dt = triDetail();
float dv = (dt.r-0.5)*uDetailW.x*0.5 + (dt.g-0.5)*uDetailW.y*0.6 + (dt.b-0.55)*uDetailW.z*0.7;
diffuseColor.rgb *= 1.0 + dv;
float scr = (1.0 - dt.a) * uDetailW.w;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.25+0.03, scr*0.5);
float lowDirt = (1.0 - smoothstep(0.0, 0.5, vWPos.y)) * 0.35 + (dt.r * 0.3);
diffuseColor.rgb *= 1.0 - uGrime * uGrimeAmt * lowDirt * 0.55;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (dt.r-0.5)*0.25*(uDetailW.x+uDetailW.z) + scr*0.2 + uGrime*uGrimeAmt*0.15, 0.04, 1.0);`);
  };
  m.customProgramCacheKey = () => 'detail' + (opts.key || '');
}

// --------------------------------------------------------------- characters
export const PAL_SLOTS = ['Skin', 'Top', 'Sleeve', 'Pants', 'Shoes', 'Hair', 'EyeWhite', 'Iris', 'Pupil',
  'Shirt', 'Tie', 'Lapel', 'Mouth', 'Teeth', 'Frame', 'Sole', 'Belt', 'Metal', 'Button', 'TopDark',
  'MouthDark', 'Apron'];
export const PAL_SIZE = 32;

export function makePalette(colors) {
  const data = new Float32Array(PAL_SIZE * 2 * 4);
  const tex = new THREE.DataTexture(data, PAL_SIZE, 2, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  setPalette(tex, colors);
  return tex;
}

const DEFAULT_ROUGH = { Skin: 0.55, EyeWhite: 0.15, Iris: 0.2, Pupil: 0.1, Shoes: 0.35, Sole: 0.8, Metal: 0.3,
  Frame: 0.3, Tie: 0.45, Teeth: 0.3, Mouth: 0.4, Belt: 0.4, Button: 0.3, Hair: 0.7 };
const DEFAULT_METAL = { Metal: 1, Frame: 0.6 };

export function setPalette(tex, colors) {
  const d = tex.image.data;
  const c = new THREE.Color();
  PAL_SLOTS.forEach((slot, i) => {
    c.set(colors[slot] || '#ff00ff');
    d[i * 4] = c.r; d[i * 4 + 1] = c.g; d[i * 4 + 2] = c.b;
    d[i * 4 + 3] = colors[slot + 'Rough'] ?? DEFAULT_ROUGH[slot] ?? 0.8;
    const j = (PAL_SIZE + i) * 4;
    d[j] = colors[slot + 'Metal'] ?? DEFAULT_METAL[slot] ?? 0;
  });
  tex.needsUpdate = true;
}

export function characterMaterial(palette) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPal = { value: palette };
    shader.uniforms.uDetail = { value: shared.detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float pal; varying float vPal; varying vec3 vBindPos; varying vec3 vBindN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPal = pal; vBindPos = position; vBindN = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uPal; uniform sampler2D uDetail; varying float vPal; varying vec3 vBindPos; varying vec3 vBindN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pu = (floor(vPal + 0.5) + 0.5) / ${PAL_SIZE}.0;
vec4 palC = texture2D(uPal, vec2(pu, 0.25));
vec4 palM = texture2D(uPal, vec2(pu, 0.75));
vec3 bn = abs(normalize(vBindN)); bn = pow(bn, vec3(4.0)); bn /= (bn.x+bn.y+bn.z+1e-5);
vec3 bp = vBindPos * 22.0;
float fab = texture2D(uDetail, bp.zy).r*bn.x + texture2D(uDetail, bp.xz).r*bn.y + texture2D(uDetail, bp.xy).r*bn.z;
diffuseColor.rgb = palC.rgb * (1.0 + (fab - 0.5) * 0.12 * palC.a);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = palC.a;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = palM.r;`);
  };
  m.customProgramCacheKey = () => 'charpal';
  return m;
}

// Shared materials. Car paint uses a small shader patch that layers dirt, rust and
// scratches from a mask texture so wear can be animated per car without new textures.

import * as THREE from 'three';
import * as TX from './textures.js';
import { FINISHES } from '../data/upgrades.js';

const M = {};
export const mats = M;

export function initMaterials() {
  const road = (k, rough) => new THREE.MeshStandardMaterial({ map: TX.roadTexture(k), roughness: rough, metalness: 0, bumpMap: TX.roadTexture(k), bumpScale: 0.6 });
  M.road = [
    road('asphalt', 0.86), road('damaged', 0.9), road('gravel', 0.95), road('dirt', 0.97),
    road('dirt', 0.97), road('snow', 0.7), road('snow', 0.35), road('dirt', 0.97), road('gravel', 0.95), road('asphalt', 0.86), road('dirt', 0.97), road('concrete', 0.85),
  ];
  M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.terrainDetail(), roughness: 0.95, metalness: 0 });
  M.rock = new THREE.MeshStandardMaterial({ vertexColors: true, map: TX.rockTexture(), roughness: 0.9, bumpMap: TX.rockTexture(), bumpScale: 1.2 });
  M.bark = new THREE.MeshStandardMaterial({ map: TX.barkTexture(), roughness: 0.95, color: 0xb8a690 });
  M.foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0x9a9c9e, roughness: 0.42, metalness: 0.8 });
  M.galv = new THREE.MeshStandardMaterial({ color: 0x8e9294, roughness: 0.5, metalness: 0.75 });
  M.rusty = new THREE.MeshStandardMaterial({ color: 0x7d5a40, roughness: 0.9, metalness: 0.3, map: TX.concreteTexture(9, 1) });
  M.darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.55, metalness: 0.7 });
  M.wood = new THREE.MeshStandardMaterial({ map: TX.planksTexture(), roughness: 0.9 });
  M.woodDark = new THREE.MeshStandardMaterial({ map: TX.planksTexture([82, 62, 44]), roughness: 0.92 });
  M.post = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95, map: TX.barkTexture() });
  M.concrete = new THREE.MeshStandardMaterial({ map: TX.concreteTexture(3, 1), roughness: 0.92 });
  M.concreteDark = new THREE.MeshStandardMaterial({ map: TX.concreteTexture(4, 0.7), roughness: 0.95 });
  M.plaster = new THREE.MeshStandardMaterial({ map: TX.concreteTexture(5, 1.35), roughness: 0.95, color: 0xe8e0d0 });
  M.roofTile = new THREE.MeshStandardMaterial({ map: TX.planksTexture([96, 56, 44]), roughness: 0.85 });
  M.roofSlate = new THREE.MeshStandardMaterial({ map: TX.planksTexture([62, 64, 68]), roughness: 0.8 });
  M.windowDark = new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.15, metalness: 0.4 });
  M.windowLit = new THREE.MeshStandardMaterial({ color: 0x3a3428, emissive: 0xffc77a, emissiveIntensity: 0.45, roughness: 0.3 });
  M.signBack = new THREE.MeshStandardMaterial({ color: 0x7c7e80, roughness: 0.6, metalness: 0.5 });
  M.redWhite = new THREE.MeshStandardMaterial({ color: 0xc9c5ba, roughness: 0.6 });
  M.orange = new THREE.MeshStandardMaterial({ color: 0xd2621e, roughness: 0.55 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.92 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.75 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdfe2e5, roughness: 0.12, metalness: 1 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x101820, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.72, envMapIntensity: 1.6, clearcoat: 1 });
  M.crack = new THREE.MeshBasicMaterial({ map: TX.crackTexture(), transparent: true, opacity: 0, depthWrite: false });
  M.headlight = new THREE.MeshStandardMaterial({ color: 0xf0eee6, emissive: 0xfff1d6, emissiveIntensity: 0.12, roughness: 0.15, metalness: 0.2 });
  M.headlightBroken = new THREE.MeshStandardMaterial({ color: 0x2d2c2a, roughness: 0.6 });
  M.taillight = new THREE.MeshStandardMaterial({ color: 0x5a0d0b, emissive: 0xff1d10, emissiveIntensity: 0.25, roughness: 0.25 });
  M.grille = new THREE.MeshStandardMaterial({ map: TX.grilleTexture(), roughness: 0.7, metalness: 0.3 });
  M.carbon = new THREE.MeshPhysicalMaterial({ map: TX.carbonTexture(), roughness: 0.3, metalness: 0.2, clearcoat: 1 });
  M.engine = new THREE.MeshStandardMaterial({ color: 0x5b5d60, roughness: 0.55, metalness: 0.7 });
  M.engineDark = new THREE.MeshStandardMaterial({ color: 0x232426, roughness: 0.65, metalness: 0.5 });
  M.interior = new THREE.MeshStandardMaterial({ color: 0x252322, roughness: 0.9 });
  M.seat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.95 });
  M.brakeDisc = new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.4, metalness: 0.9 });
  M.mud = new THREE.MeshStandardMaterial({ map: TX.mudTexture(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.puddle = new THREE.MeshStandardMaterial({ color: 0x5f6b72, alphaMap: TX.puddleTexture(), transparent: true, roughness: 0.02, metalness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, envMapIntensity: 1.4 });
  M.ice = new THREE.MeshStandardMaterial({ map: TX.iceTexture(), transparent: true, roughness: 0.05, metalness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.pothole = new THREE.MeshStandardMaterial({ color: 0x1d1c1a, alphaMap: TX.puddleTexture(), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  M.water = new THREE.MeshStandardMaterial({ map: TX.waterTexture(), transparent: true, color: 0xbcd0d6, roughness: 0.1, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  M.stream = new THREE.MeshStandardMaterial({ color: 0x3b4e52, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.88 });
  M.cardboard = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.95 });
  M.crate = new THREE.MeshStandardMaterial({ map: TX.planksTexture([150, 118, 74]), roughness: 0.85 });
  M.fuelCan = new THREE.MeshStandardMaterial({ color: 0xa8281e, roughness: 0.45, metalness: 0.3 });
  M.cash = new THREE.MeshStandardMaterial({ color: 0x5d7a4a, roughness: 0.8, emissive: 0x1d2a10, emissiveIntensity: 0.3 });
  M.repair = new THREE.MeshStandardMaterial({ color: 0x2c5f8a, roughness: 0.5, metalness: 0.2 });
  M.rare = new THREE.MeshStandardMaterial({ color: 0x38363a, roughness: 0.35, metalness: 0.8 });
  M.rareTrim = new THREE.MeshStandardMaterial({ color: 0xd0a14a, roughness: 0.3, metalness: 1, emissive: 0x3a2a08, emissiveIntensity: 0.4 });
  M.tireMarks = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4 });
  for (const k of ['galv', 'concrete', 'concreteDark', 'post', 'rusty']) M[k].side = THREE.DoubleSide;
  return M;
}

export function signMaterial(type, text) {
  const key = 'sign_' + type + (text || '');
  if (!M[key]) M[key] = new THREE.MeshStandardMaterial({ map: TX.signTexture(type, text), transparent: true, alphaTest: 0.5, roughness: 0.55, metalness: 0.1 });
  return M[key];
}

// ---------------------------------------------------------------- car paint
export function makePaint(color, finish = 'solid', wear = {}) {
  const f = FINISHES[finish] || FINISHES.solid;
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: f.rough, metalness: f.metal, clearcoat: f.clear, clearcoatRoughness: 0.08,
    sheen: f.sheen ? 0.6 : 0, sheenColor: new THREE.Color(0x8fa0ff), envMapIntensity: 1.1,
  });
  patchWear(m, wear);
  return m;
}

export function patchWear(m, wear = {}) {
  m.userData.wear = {
    uMask: { value: TX.carMask() },
    uDirt: { value: wear.dirt || 0 },
    uRust: { value: wear.rust || 0 },
    uScratch: { value: wear.scratch || 0 },
    uDirtColor: { value: new THREE.Color(wear.dirtColor || 0x6a5a44) },
  };
  m.defines = { ...(m.defines || {}), USE_UV: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.wear);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vObjY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uMask; uniform float uDirt; uniform float uRust; uniform float uScratch; uniform vec3 uDirtColor;
varying float vObjY;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec4 mk = texture2D(uMask, vUv * 1.7);
  float lowness = smoothstep(0.35, -0.55, vObjY);
  float dirtA = clamp(uDirt * (0.25 + lowness * 1.1) * (0.55 + mk.r * 0.9), 0.0, 1.0);
  float rustA = smoothstep(1.0 - uRust * 0.5, 1.04 - uRust * 0.5, mk.g * (0.5 + lowness * 0.8)) * step(0.01, uRust);
  float scrA = smoothstep(1.0 - uScratch * 0.55, 1.0 - uScratch * 0.5, mk.b);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.54, 0.52), scrA * 0.85);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.15, 0.07) * (0.7 + mk.r * 0.6), rustA);
  diffuseColor.rgb = mix(diffuseColor.rgb, uDirtColor * (0.8 + mk.r * 0.4), dirtA * 0.9);
  float wearF = max(dirtA, rustA);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.95, wearF);
  roughnessFactor = mix(roughnessFactor, 0.5, scrA);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = mix(metalnessFactor, 0.0, wearF);`);
    if (sh.fragmentShader.includes('#include <lights_physical_fragment>')) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
  material.clearcoat *= (1.0 - wearF);
  #endif`);
    }
  };
  m.customProgramCacheKey = () => 'wear' + m.type;
  return m;
}

export function setWear(m, k, v) { if (m.userData.wear) m.userData.wear[k].value = v; }

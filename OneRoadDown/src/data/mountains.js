// Mountain definitions. A mountain is one continuous road; biomes are distance bands
// that drive both the road generator (curves, grade, hazards) and the look
// (light, fog, ground, weather). Neighbouring biomes blend over `BLEND` metres.

export const BLEND = 350;

// Look parameters are plain numbers / hex colours so they can be interpolated.
export const village = {
  id: 'village', name: 'MOUNTAIN VILLAGE', start: 0, end: 1000,
  width: 7.2, grade: [0.025, 0.05], plan: { straight: 3, sweep: 4, tight: 1.2, hairpin: 0 },
  flat: 0.75, wallSlope: 0.45, dropSlope: 0.35, rails: 0.25, railType: 2,
  surface: { base: 0, damaged: 0.15, gravel: 0.05 },
  hazards: { potholes: 0.4, puddles: 0.5, mud: 0.1, rocks: 0.1, fallenTrees: 0, abandoned: 0.2, ice: 0, jumps: 0 },
  trees: { pine: 0.55, spruce: 0.35, birch: 0.1, density: 0.55 }, rocks: 0.25,
  props: ['houses', 'fences', 'poles'],
  look: {
    skyTop: 0x5d86b5, skyHorizon: 0xc9d6df, fog: 0xbfcdd6, fogDensity: 0.0026,
    sun: 0xffe2bd, sunIntensity: 3.0, sunElev: 14, sunAzim: 120, hemiSky: 0xb8cde0, hemiGround: 0x5a5440, hemiIntensity: 0.9,
    grass: 0x5f6e37, dirt: 0x6b5a42, rock: 0x77746d, snow: 0, clouds: 0.35, cloudDark: 0.1,
    weather: 'none', wind: 0.3, birds: 1, warmth: 0.1,
  },
};

export const forest = {
  id: 'forest', name: 'FOREST ROAD', start: 1000, end: 3000,
  width: 6.8, grade: [0.045, 0.075], plan: { straight: 2, sweep: 4, tight: 3, hairpin: 0.4 },
  flat: 0.2, wallSlope: 0.75, dropSlope: 0.6, rails: 0.55, railType: 2,
  surface: { base: 0, damaged: 0.3, gravel: 0.2, dirt: 0.08 },
  hazards: { potholes: 0.8, puddles: 0.9, mud: 0.6, rocks: 0.2, fallenTrees: 0.5, abandoned: 0.15, ice: 0, jumps: 0.25 },
  trees: { pine: 0.5, spruce: 0.45, birch: 0.05, density: 1.0 }, rocks: 0.5,
  props: ['poles', 'logs'],
  look: {
    skyTop: 0x557ca6, skyHorizon: 0xb9c8cf, fog: 0xa7b7b8, fogDensity: 0.0042,
    sun: 0xffe6c4, sunIntensity: 2.6, sunElev: 22, sunAzim: 135, hemiSky: 0xa9bfcf, hemiGround: 0x3e4430, hemiIntensity: 0.8,
    grass: 0x4b5a2d, dirt: 0x5a4a35, rock: 0x6d6c66, snow: 0, clouds: 0.45, cloudDark: 0.15,
    weather: 'none', wind: 0.4, birds: 1, warmth: 0.05,
  },
};

export const rocky = {
  id: 'rocky', name: 'ROCKY PASS', start: 3000, end: 6000,
  width: 6.4, grade: [0.06, 0.1], plan: { straight: 1.5, sweep: 2, tight: 4, hairpin: 2.2 },
  flat: 0.05, wallSlope: 1.6, dropSlope: 0.95, rails: 0.75, railType: 1,
  surface: { base: 0, damaged: 0.35, gravel: 0.35 },
  hazards: { potholes: 0.7, puddles: 0.2, mud: 0.1, rocks: 1.0, fallenTrees: 0.05, abandoned: 0.2, ice: 0, jumps: 0.25, rockfall: 1 },
  trees: { pine: 0.8, spruce: 0.2, birch: 0, density: 0.3 }, rocks: 1.4,
  props: ['tunnels', 'shortcuts'], tunnel: 0.5, bridge: 0.3,
  look: {
    skyTop: 0x4f73a0, skyHorizon: 0xb4c1c9, fog: 0xa9b3b8, fogDensity: 0.0034,
    sun: 0xfff0d8, sunIntensity: 2.9, sunElev: 30, sunAzim: 160, hemiSky: 0xaebccc, hemiGround: 0x4b4840, hemiIntensity: 0.85,
    grass: 0x5b5f3a, dirt: 0x6a5f50, rock: 0x7b7770, snow: 0.05, clouds: 0.5, cloudDark: 0.2,
    weather: 'none', wind: 0.6, birds: 0.4, warmth: 0,
  },
};

export const snow = {
  id: 'snow', name: 'SNOW LINE', start: 6000, end: 10000,
  width: 6.4, grade: [0.05, 0.09], plan: { straight: 1.5, sweep: 2.5, tight: 3, hairpin: 2.5 },
  flat: 0.1, wallSlope: 1.1, dropSlope: 0.85, rails: 0.7, railType: 1,
  surface: { base: 5, damaged: 0.1, gravel: 0.1 },
  hazards: { potholes: 0.3, puddles: 0, mud: 0, rocks: 0.5, fallenTrees: 0.3, abandoned: 0.25, ice: 1.0, jumps: 0.2 },
  trees: { pine: 0.3, spruce: 0.7, birch: 0, density: 0.6, snowy: 1 }, rocks: 0.8,
  props: ['snowpoles', 'shortcuts', 'tunnels'], tunnel: 0.25, bridge: 0.2,
  look: {
    skyTop: 0x7c8ea3, skyHorizon: 0xd2d8dd, fog: 0xc9d0d6, fogDensity: 0.0068,
    sun: 0xe8eef5, sunIntensity: 1.7, sunElev: 26, sunAzim: 170, hemiSky: 0xcfd8e2, hemiGround: 0x8a8f96, hemiIntensity: 1.15,
    grass: 0x6e7360, dirt: 0x6f6a62, rock: 0x6c6d70, snow: 1, clouds: 0.85, cloudDark: 0.35,
    weather: 'snow', wind: 0.8, birds: 0, warmth: -0.15,
  },
};

export const highway = {
  id: 'highway', name: 'ABANDONED HIGHWAY', start: 10000, end: 15000,
  width: 10.5, grade: [0.025, 0.06], plan: { straight: 4, sweep: 4, tight: 0.8, hairpin: 0 },
  flat: 0.35, wallSlope: 0.9, dropSlope: 0.55, rails: 0.9, railType: 3,
  surface: { base: 1, damaged: 0.55, gravel: 0.1 },
  hazards: { potholes: 1.4, puddles: 1.0, mud: 0.2, rocks: 0.4, fallenTrees: 0.2, abandoned: 1.4, ice: 0, jumps: 0.35 },
  trees: { pine: 0.6, spruce: 0.3, birch: 0.1, density: 0.5 }, rocks: 0.6,
  props: ['ruins', 'barriers', 'tunnels', 'bridges', 'shortcuts'], tunnel: 0.45, bridge: 0.9,
  look: {
    skyTop: 0x5f6a78, skyHorizon: 0xa9adb0, fog: 0x8f979c, fogDensity: 0.0048,
    sun: 0xdfe3e6, sunIntensity: 1.5, sunElev: 34, sunAzim: 190, hemiSky: 0x9aa4ae, hemiGround: 0x484840, hemiIntensity: 1.0,
    grass: 0x55603a, dirt: 0x5e5446, rock: 0x6c6a64, snow: 0, clouds: 0.95, cloudDark: 0.55,
    weather: 'rain', wind: 0.5, birds: 0.2, warmth: -0.05,
  },
};

export const cliffs = {
  id: 'cliffs', name: 'THE CLIFFS', start: 15000, end: 20000,
  width: 6.0, grade: [0.06, 0.11], plan: { straight: 1.5, sweep: 3, tight: 3.5, hairpin: 1.6 },
  flat: 0.0, wallSlope: 2.6, dropSlope: 2.4, rails: 0.65, railType: 1,
  surface: { base: 0, damaged: 0.4, gravel: 0.25 },
  hazards: { potholes: 0.7, puddles: 0.4, mud: 0.2, rocks: 0.9, fallenTrees: 0.05, abandoned: 0.3, ice: 0, jumps: 0.15, rockfall: 1 },
  trees: { pine: 0.9, spruce: 0.1, birch: 0, density: 0.25 }, rocks: 1.2,
  props: ['tunnels', 'bridges', 'waterfalls', 'shortcuts'], tunnel: 0.6, bridge: 0.6,
  look: {
    skyTop: 0x48586b, skyHorizon: 0xa3a6a6, fog: 0x8e9496, fogDensity: 0.0036,
    sun: 0xffd9ab, sunIntensity: 2.1, sunElev: 18, sunAzim: 220, hemiSky: 0x99a3ad, hemiGround: 0x4a4038, hemiIntensity: 0.9,
    grass: 0x56583a, dirt: 0x6b5843, rock: 0x7a7066, snow: 0, clouds: 0.8, cloudDark: 0.6,
    weather: 'storm', wind: 1.0, birds: 0.3, warmth: 0.1,
  },
};

export const lower = {
  id: 'lower', name: 'THE LOWER PASS', start: 20000, end: 25000,
  width: 7.0, grade: [0.035, 0.07], plan: { straight: 2.5, sweep: 4.5, tight: 2, hairpin: 0.3 },
  flat: 0.4, wallSlope: 0.7, dropSlope: 0.5, rails: 0.5, railType: 2,
  surface: { base: 0, damaged: 0.25, gravel: 0.25, dirt: 0.1 },
  hazards: { potholes: 0.8, puddles: 0.5, mud: 0.5, rocks: 0.3, fallenTrees: 0.3, abandoned: 0.4, ice: 0, jumps: 0.45 },
  trees: { pine: 0.25, spruce: 0.1, birch: 0.25, oak: 0.4, density: 0.85 }, rocks: 0.5,
  props: ['poles', 'fences', 'ruins', 'bridges', 'shortcuts'], bridge: 0.5,
  look: {
    skyTop: 0x5b7fa8, skyHorizon: 0xe8c9a0, fog: 0xd6bf9c, fogDensity: 0.0028,
    sun: 0xffc27d, sunIntensity: 3.2, sunElev: 9, sunAzim: 255, hemiSky: 0xc9b9a3, hemiGround: 0x5a4a30, hemiIntensity: 0.85,
    grass: 0x7a7a3a, dirt: 0x7a6040, rock: 0x86766a, snow: 0, clouds: 0.3, cloudDark: 0.05,
    weather: 'none', wind: 0.35, birds: 1, warmth: 0.45,
  },
};

const bottom = {
  ...lower, id: 'bottom', name: 'BOTTOM OF THE MOUNTAIN', start: 25000, end: 26000,
  plan: { straight: 6, sweep: 1, tight: 0, hairpin: 0 }, grade: [0.0, 0.01], flat: 0.9, rails: 0,
  hazards: { potholes: 0, puddles: 0, mud: 0, rocks: 0, fallenTrees: 0, abandoned: 0, ice: 0, jumps: 0 },
  props: ['finish', 'fences', 'poles'],
};

// ---------------------------------------------------------------------------
// Mountain II: a dry canyon, unlocked after the first mountain is completed.
const canyonLook = (o) => ({
  skyTop: 0x6c93c0, skyHorizon: 0xe9cfae, fog: 0xd9b993, fogDensity: 0.0026,
  sun: 0xffd29a, sunIntensity: 3.4, sunElev: 30, sunAzim: 200, hemiSky: 0xd8c3a5, hemiGround: 0x7a4e30, hemiIntensity: 0.8,
  grass: 0x8a7a48, dirt: 0x9a6a44, rock: 0xa0644a, snow: 0, clouds: 0.15, cloudDark: 0.05,
  weather: 'none', wind: 0.6, birds: 0.3, warmth: 0.6, ...o,
});
const canyon = [
  { ...village, id: 'mesa', name: 'MESA RIM', start: 0, end: 2000, flat: 0.5, rails: 0.2,
    trees: { pine: 0.6, oak: 0.4, density: 0.2, dry: 1 }, rocks: 0.9, props: ['ruins', 'poles'],
    surface: { base: 0, damaged: 0.3, gravel: 0.2, dirt: 0.1 }, look: canyonLook({}) },
  { ...rocky, id: 'redwall', name: 'RED WALLS', start: 2000, end: 7000, trees: { pine: 1, density: 0.12, dry: 1 },
    surface: { base: 2, damaged: 0.2, gravel: 0.5, dirt: 0.3 }, look: canyonLook({ rock: 0xa8573a, fogDensity: 0.003, sunElev: 40 }) },
  { ...highway, id: 'dryhwy', name: 'DUST HIGHWAY', start: 7000, end: 13000, trees: { oak: 1, density: 0.1, dry: 1 },
    look: canyonLook({ weather: 'dust', fog: 0xcaa27a, fogDensity: 0.0045, clouds: 0.4 }) },
  { ...cliffs, id: 'gorge', name: 'THE GORGE', start: 13000, end: 20000, trees: { pine: 1, density: 0.1, dry: 1 },
    look: canyonLook({ rock: 0x9c5236, sunElev: 16, sunAzim: 250, fog: 0xc09070, clouds: 0.5, weather: 'none' }) },
  { ...lower, id: 'riverbed', name: 'DRY RIVERBED', start: 20000, end: 25000, trees: { oak: 0.7, birch: 0.3, density: 0.4, dry: 1 },
    surface: { base: 3, damaged: 0.2, gravel: 0.4 }, look: canyonLook({ sunElev: 7, sunAzim: 270, sun: 0xffa860, warmth: 0.8 }) },
  { ...bottom, id: 'canyonend', name: 'CANYON FLOOR', start: 25000, end: 26000, look: canyonLook({ sunElev: 6, sun: 0xff9850 }) },
];

export const MOUNTAINS = [
  {
    id: 'm1', name: 'MOUNTAIN I', title: 'HOLLOW PEAK', length: 25000, seed: 1931, startAltitude: 2410,
    biomes: [village, forest, rocky, snow, highway, cliffs, lower, bottom],
  },
  {
    id: 'm2', name: 'MOUNTAIN II', title: 'THE CANYON', length: 25000, seed: 7713, startAltitude: 1980,
    biomes: canyon, requires: 'm1',
  },
];

export const mountainById = (id) => MOUNTAINS.find((m) => m.id === id) || MOUNTAINS[0];

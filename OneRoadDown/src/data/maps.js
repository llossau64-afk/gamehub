// Race maps. Circuits are closed loops built from a control polygon (see
// Track.planLoop); sprints use the point-to-point mountain generator.
// Every map gets one or more biome bands that drive the look and the roadside.

import { village, forest, rocky, snow, highway, cliffs, lower } from './mountains.js';

const raceHz = { potholes: 0.15, puddles: 0.2, mud: 0, rocks: 0, fallenTrees: 0, abandoned: 0, ice: 0, jumps: 0 };
const cleanSurf = { base: 0, damaged: 0.05, gravel: 0 };

// a biome band for a whole circuit
const band = (base, o = {}, look = {}) => ({
  ...base, id: 'race-' + base.id, animals: o.animals || base.id, start: 0, end: 1e9, hazards: { ...raceHz, ...(o.hazards || {}) }, surface: { ...cleanSurf, ...(o.surface || {}) },
  rails: o.rails ?? 0.35, ...o, look: { ...base.look, ...look },
});

// looks
const GOLDEN = { sun: 0xffc884, sunIntensity: 3.4, sunElev: 11, hemiSky: 0xd4c2aa, hemiGround: 0x5a4a34, skyTop: 0x5a86c0, skyHorizon: 0xf0d2a8, fog: 0xe0c7a4, fogDensity: 0.0024 };
const NOON = { sun: 0xfff3e0, sunIntensity: 3.2, sunElev: 52, skyTop: 0x3f78c4, skyHorizon: 0xbcd4e8, fog: 0xc4d6e4, fogDensity: 0.0018, clouds: 0.3 };
const DUSK = { sun: 0xff8f5a, sunIntensity: 2.2, sunElev: 4, skyTop: 0x2c3a6a, skyHorizon: 0xf09a6a, fog: 0x9a7a8a, fogDensity: 0.003, hemiSky: 0x8a7aa0, hemiGround: 0x3a3040, hemiIntensity: 0.75 };
const MORNING = { sun: 0xffe2c0, sunIntensity: 2.8, sunElev: 16, skyTop: 0x6f9ccc, skyHorizon: 0xdfe6ea, fog: 0xd0dbe0, fogDensity: 0.0032 };
const RAIN = { weather: 'rain', clouds: 0.95, cloudDark: 0.5, sunIntensity: 1.4, fogDensity: 0.0045, skyTop: 0x5d6976, skyHorizon: 0xa2aab0, fog: 0x8f989e };

const sakura = { cherry: 1, warmth: 0.15 };
const japanTrees = { pine: 0.35, cherry: 0.45, spruce: 0.2, density: 0.85 };
const mapleTrees = { pine: 0.3, maple: 0.55, birch: 0.15, density: 0.95 };
const blackForest = { spruce: 0.65, pine: 0.3, birch: 0.05, density: 1.1 };
const provence = { oak: 0.5, pine: 0.4, cypress: 0.1, density: 0.5 };
const meadow = { oak: 0.45, birch: 0.3, pine: 0.25, density: 0.55 };

const circuit = (o) => ({ kind: 'circuit', laps: 3, startAltitude: 300, ...o });
const sprint = (o) => ({ kind: 'sprint', laps: 1, startAltitude: 1200, ...o });

export const MAPS = [
  // ---------------------------------------------------------------- JAPAN
  circuit({
    id: 'jp-sakura', name: 'SAKURA RING', country: 'JAPAN', region: 'Kawazu, Shizuoka', tier: 1, reward: 4000, seed: 3101,
    circuit: { shape: 'twisty', size: 300, rmin: 22, elev: 9, minLen: 2200 },
    biomes: [band(village, { width: 9, trees: japanTrees, props: ['houses', 'poles', 'fences'], rails: 0.6, railType: 1 }, { ...GOLDEN, ...sakura, grass: 0x6f7a3c })],
    desc: 'Cherry trees in full bloom line a tight hillside loop. Petals on the asphalt, guard rails everywhere.',
  }),
  sprint({
    id: 'jp-hakone', name: 'HAKONE TOUGE', country: 'JAPAN', region: 'Hakone, Kanagawa', tier: 1, reward: 4500, seed: 3117, length: 4200,
    biomes: [
      { ...band(forest, { width: 7.4, trees: japanTrees, plan: { straight: 1.5, sweep: 3, tight: 3.5, hairpin: 1.5 }, rails: 0.85, railType: 1, props: ['poles'] }, { ...GOLDEN, ...sakura }), start: 0, end: 2500 },
      { ...band(forest, { width: 7.2, trees: mapleTrees, plan: { straight: 1, sweep: 2.5, tight: 4, hairpin: 2.5 }, rails: 0.9, railType: 1, props: ['poles'] }, { ...GOLDEN, warmth: 0.75 }), start: 2500, end: 1e9 },
    ],
    desc: 'The classic mountain pass: blossoms at the top, red maples at the bottom and a hairpin for every regret.',
  }),
  circuit({
    id: 'jp-kirin', name: 'MOUNT KIRIN SPEEDWAY', country: 'JAPAN', region: 'Oyama, Shizuoka', tier: 2, reward: 7000, seed: 3127,
    circuit: { shape: 'gp', size: 520, rmin: 30, elev: 12, minLen: 3600 },
    biomes: [band(lower, { width: 13, trees: { ...japanTrees, density: 0.45 }, props: ['grandstands', 'poles'], rails: 0.2, circuitDress: 1 }, { ...NOON, ...sakura, snowPeak: 1 })],
    desc: 'A long main straight under a snow-capped volcano. Brake late, the run-off is generous.',
  }),
  circuit({
    id: 'jp-odaiba', name: 'ODAIBA BAY STREETS', country: 'JAPAN', region: 'Tokyo', tier: 2, reward: 7500, seed: 3139,
    circuit: { shape: 'street', size: 300, rmin: 17, elev: 1.5, minLen: 2400 },
    biomes: [band(highway, { width: 11, trees: { cherry: 0.6, oak: 0.4, density: 0.25 }, props: ['city', 'poles'], rails: 1, railType: 3, surface: { base: 0, damaged: 0 } }, { ...DUSK, weather: 'none', clouds: 0.3, cloudDark: 0.1, warmth: 0.2, city: 1 })],
    desc: 'Concrete walls, ninety-degree corners and the bay glowing orange. No room for mistakes.',
  }),
  sprint({
    id: 'jp-iroha', name: 'IROHAZAKA HAIRPINS', country: 'JAPAN', region: 'Nikko, Tochigi', tier: 3, reward: 11000, seed: 3149, length: 5200,
    biomes: [{ ...band(rocky, { width: 7.6, trees: mapleTrees, plan: { straight: 1, sweep: 2, tight: 3, hairpin: 4.5 }, rails: 0.95, railType: 1, props: ['poles'], hazards: { rockfall: 0 } }, { ...MORNING, warmth: 0.8, grass: 0x7a6a34 }), start: 0, end: 1e9 }],
    desc: 'Forty-eight hairpins down a gorge on fire with autumn colour.',
  }),
  // ---------------------------------------------------------------- GERMANY
  circuit({
    id: 'de-eifel', name: 'EIFELRING NORD', country: 'GERMANY', region: 'Eifel, Rhineland-Palatinate', tier: 4, reward: 18000, seed: 4201, laps: 2,
    circuit: { shape: 'twisty', size: 820, rmin: 26, elev: 34, minLen: 6500 },
    biomes: [band(forest, { width: 9.5, trees: blackForest, props: ['poles', 'logs'], rails: 0.9, railType: 1, flat: 0.3 }, { ...MORNING, grass: 0x4f6a2e })],
    desc: 'Twenty kilometres of folklore squeezed into a long forest loop. Crests, compressions and no forgiveness.',
  }),
  sprint({
    id: 'de-schwarzwald', name: 'SCHWARZWALD PASS', country: 'GERMANY', region: 'Black Forest, Baden-Württemberg', tier: 1, reward: 5000, seed: 4211, length: 4600,
    biomes: [{ ...band(forest, { width: 7, trees: blackForest, props: ['houses', 'poles', 'logs', 'fences'], rails: 0.7, railType: 2 }, { ...MORNING, fog: 0xbcc8c4, fogDensity: 0.004 }), start: 0, end: 1e9 }],
    desc: 'Dark fir forest, half-timbered farms and cows that do not care about your lap time.',
  }),
  sprint({
    id: 'de-autobahn', name: 'AUTOBAHN A8 SPRINT', country: 'GERMANY', region: 'Bavaria', tier: 2, reward: 9000, seed: 4223, length: 7000, startAltitude: 700,
    biomes: [{ ...band(highway, { width: 14, trees: meadow, plan: { straight: 6, sweep: 4, tight: 0, hairpin: 0 }, grade: [0.005, 0.02], rails: 1, railType: 1, props: ['poles', 'fences'], surface: { base: 0, damaged: 0 } }, { ...NOON, weather: 'none', clouds: 0.35, cloudDark: 0.1 }), start: 0, end: 1e9 }],
    desc: 'No speed limit. Long, wide and fast: the place to find out what your car really does.',
  }),
  circuit({
    id: 'de-alpen', name: 'ALPENRING BAYERN', country: 'GERMANY', region: 'Garmisch, Bavaria', tier: 3, reward: 12000, seed: 4231,
    circuit: { shape: 'twisty', size: 420, rmin: 22, elev: 22, minLen: 3200 },
    biomes: [band(village, { width: 9, trees: { spruce: 0.5, pine: 0.3, birch: 0.2, density: 0.7 }, props: ['houses', 'fences', 'poles'], rails: 0.5, railType: 2 }, { ...NOON, snowPeak: 1, grass: 0x6a8a3a })],
    desc: 'Alpine meadows, wooden balconies and a view of the Zugspitze between corners.',
  }),
  circuit({
    id: 'de-hockenring', name: 'HOCKENRING GP', country: 'GERMANY', region: 'Baden', tier: 3, reward: 14000, seed: 4243,
    circuit: { shape: 'gp', size: 460, rmin: 24, elev: 3, minLen: 3800 },
    biomes: [band(lower, { width: 13, trees: { oak: 0.4, birch: 0.3, pine: 0.3, density: 0.4 }, props: ['grandstands'], rails: 0.15, circuitDress: 1 }, { ...NOON, warmth: 0.1 })],
    desc: 'A Grand Prix circuit: a stadium section, a fast back straight and a hairpin into the grandstands.',
  }),
  // ---------------------------------------------------------------- FRANCE
  circuit({
    id: 'fr-riviera', name: 'RIVIERA STREET CIRCUIT', country: 'FRANCE', region: "Côte d'Azur", tier: 4, reward: 20000, seed: 5101,
    circuit: { shape: 'street', size: 260, rmin: 15, elev: 14, minLen: 2300 },
    biomes: [band(village, { width: 9.5, trees: { pine: 0.5, oak: 0.3, cypress: 0.2, density: 0.35 }, props: ['city', 'houses'], rails: 1, railType: 3 }, { ...GOLDEN, sunElev: 18, warmth: 0.45, grass: 0x7a8040, sea: 1 })],
    desc: 'Barriers inches from the mirrors, a harbour full of yachts and a tunnel of noise.',
  }),
  sprint({
    id: 'fr-provence', name: 'PROVENCE LAVENDER RUN', country: 'FRANCE', region: 'Valensole, Provence', tier: 2, reward: 8000, seed: 5113, length: 5000, startAltitude: 600,
    biomes: [{ ...band(lower, { width: 7.5, trees: provence, props: ['fences', 'poles', 'houses', 'lavender'], plan: { straight: 3, sweep: 5, tight: 1.5, hairpin: 0 }, grade: [0.01, 0.035] }, { ...GOLDEN, warmth: 0.6, grass: 0x8a8a44, lavender: 1 }), start: 0, end: 1e9 }],
    desc: 'Purple fields to the horizon, plane trees and stone farmhouses. Bring sunglasses.',
  }),
  circuit({
    id: 'fr-sarthe', name: 'SARTHE 24', country: 'FRANCE', region: 'Le Mans, Sarthe', tier: 5, reward: 26000, seed: 5129, laps: 2,
    circuit: { shape: 'gp', size: 950, rmin: 36, elev: 6, minLen: 5200 },
    biomes: [band(lower, { width: 12, trees: { oak: 0.4, pine: 0.4, birch: 0.2, density: 0.65 }, props: ['grandstands', 'poles'], rails: 0.4, railType: 1, circuitDress: 1 }, { ...DUSK, sunElev: 8 })],
    desc: 'Endless straights through the countryside at dusk. Top speed is everything here.',
  }),
  sprint({
    id: 'fr-galibier', name: 'COL DU GALIBIER', country: 'FRANCE', region: 'Savoie', tier: 4, reward: 17000, seed: 5131, length: 5600, startAltitude: 2600,
    biomes: [
      { ...band(snow, { width: 6.8, trees: { spruce: 0.6, pine: 0.4, density: 0.25, snowy: 1 }, props: ['snowpoles'], rails: 0.6, railType: 1, hazards: { ice: 0.2 } }, { weather: 'none', sunIntensity: 2.6, sunElev: 30 }), start: 0, end: 2600 },
      { ...band(rocky, { width: 7, trees: { pine: 0.7, spruce: 0.3, density: 0.4 }, rails: 0.7, railType: 1, hazards: { rockfall: 0 } }, NOON), start: 2600, end: 1e9 },
    ],
    desc: 'From the snow line down to the valley in one breath. Thin air, thin margins.',
  }),
  circuit({
    id: 'fr-bordeaux', name: 'BORDEAUX VINEYARDS', country: 'FRANCE', region: 'Saint-Émilion', tier: 3, reward: 13000, seed: 5147,
    circuit: { shape: 'twisty', size: 380, rmin: 21, elev: 12, minLen: 2900 },
    biomes: [band(lower, { width: 8.5, trees: { oak: 0.6, cypress: 0.2, birch: 0.2, density: 0.45 }, props: ['houses', 'fences', 'vines'], rails: 0.2 }, { ...GOLDEN, warmth: 0.55, vines: 1 })],
    desc: 'Rolling vine rows, a château on every hill and corners named after grape varieties.',
  }),
  // ---------------------------------------------------------------- ELSEWHERE
  circuit({
    id: 'it-brianza', name: 'AUTODROMO BRIANZA', country: 'ITALY', region: 'Lombardy', tier: 5, reward: 24000, seed: 6101,
    circuit: { shape: 'gp', size: 620, rmin: 34, elev: 2, minLen: 4600 },
    biomes: [band(lower, { width: 13, trees: { oak: 0.5, pine: 0.3, birch: 0.2, density: 0.7 }, props: ['grandstands'], rails: 0.2, circuitDress: 1 }, { ...NOON, warmth: 0.3 })],
    desc: 'The temple of speed: long straights in a royal park and chicanes that punish greed.',
  }),
  circuit({
    id: 'us-mesa', name: 'MESA SPEEDWAY', country: 'USA', region: 'Arizona', tier: 4, reward: 19000, seed: 6113,
    circuit: { shape: 'oval', size: 600, rmin: 45, elev: 2, minLen: 3200 },
    biomes: [band(lower, { width: 15, trees: { pine: 0.4, oak: 0.6, density: 0.12, dry: 1 }, props: ['grandstands'], rails: 1, railType: 3, circuitDress: 1 },
      { skyTop: 0x6c93c0, skyHorizon: 0xe9cfae, fog: 0xd9b993, fogDensity: 0.002, sun: 0xffd29a, sunIntensity: 3.4, sunElev: 30, hemiSky: 0xd8c3a5, hemiGround: 0x7a4e30, grass: 0x8a7a48, dirt: 0x9a6a44, rock: 0xa0644a, warmth: 0.6 })],
    desc: 'A banked desert oval. Flat out, door to door, for as long as your nerve holds.',
  }),
  sprint({
    id: 'no-fjord', name: 'FJORD COAST ROAD', country: 'NORWAY', region: 'Geiranger', tier: 4, reward: 18000, seed: 6127, length: 5400,
    biomes: [{ ...band(cliffs, { width: 6.8, trees: { spruce: 0.6, pine: 0.3, birch: 0.1, density: 0.6 }, rails: 0.9, railType: 1, props: ['waterfalls', 'poles'], hazards: { rockfall: 0 } }, { ...RAIN, weather: 'rain', grass: 0x4a6a34 }), start: 0, end: 1e9 }],
    desc: 'Waterfalls, wet rock and a sheer drop to the fjord. The rain never really stops.',
  }),
  sprint({
    id: 'ch-summit', name: 'ALPINE SUMMIT', country: 'SWITZERLAND', region: 'Furka Pass, Valais', tier: 5, reward: 28000, seed: 6131, length: 6200, startAltitude: 2400,
    biomes: [
      { ...band(snow, { width: 6.6, trees: { spruce: 0.7, pine: 0.3, density: 0.3, snowy: 1 }, props: ['snowpoles'], rails: 0.8, railType: 1, plan: { straight: 1, sweep: 2, tight: 3, hairpin: 3.5 }, hazards: { ice: 0.25 } }, { weather: 'snow', sunIntensity: 2.0 }), start: 0, end: 3200 },
      { ...band(rocky, { width: 7, trees: { spruce: 0.6, pine: 0.4, density: 0.55 }, rails: 0.8, railType: 1, plan: { straight: 1, sweep: 2, tight: 3, hairpin: 3 }, hazards: { rockfall: 0 } }, MORNING), start: 3200, end: 1e9 },
    ],
    desc: 'The hardest descent in the game: ice, hairpins and a glacier staring at you the whole way down.',
  }),
  circuit({
    id: 'uk-highlands', name: 'HIGHLANDS RALLY LOOP', country: 'SCOTLAND', region: 'Cairngorms', tier: 5, reward: 25000, seed: 6143,
    circuit: { shape: 'twisty', size: 460, rmin: 20, elev: 26, minLen: 3500 },
    biomes: [band(lower, { width: 7.5, trees: { pine: 0.6, birch: 0.4, density: 0.5 }, props: ['fences', 'logs'], rails: 0.1, surface: { base: 2, damaged: 0.1, gravel: 0.3 }, hazards: { puddles: 0.8, mud: 0.4 } },
      { ...RAIN, weather: 'none', clouds: 0.8, sunIntensity: 2.0, grass: 0x5a6a34, warmth: 0.05 })],
    desc: 'Gravel, heather and puddles you cannot see the bottom of. Rally cars welcome.',
  }),
];

export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
export const COUNTRY_CODES = { JAPAN: 'JP', GERMANY: 'DE', FRANCE: 'FR', ITALY: 'IT', USA: 'US', NORWAY: 'NO', SWITZERLAND: 'CH', SCOTLAND: 'GB' };

// Flat-straight acceleration / top speed test:  node tools/topspeed.mjs furia,zenith [max]
import { Track, SURF } from '../src/world/track.js';
import { MOUNTAINS } from '../src/data/mountains.js';
import { carById } from '../src/data/cars.js';
import { computeStats, defaultLevels, maxStats } from '../src/game/stats.js';
import { Vehicle } from '../src/physics/vehicle.js';

const track = new Track(MOUNTAINS[0]);
const q0 = track.query.bind(track);
track.query = (x, z, out = {}) => { q0(0, 0, out); out.h = 0; out.d = x; out.halfW = 50; out.surf = SURF.ASPHALT ?? out.surf; out.dist = 0; return out; };
track.roadY = () => 0;
track.railAt = () => null;
track.collidersNear = () => [];
track.extraCol = new Map();
const ids = (process.argv[2] || 'halo,rivale,furia,zenith').split(',');
for (const id of ids) {
  const car = carById(id);
  const st = process.argv[3] === 'max' ? maxStats(car) : computeStats(car, defaultLevels(), 'race');
  const v = new Vehicle(track, car, st);
  v.reset(30, 0);
  v.pos.x = 0; v.pos.y = st.phys.cg + 0.05; v.pos.z = 0;
  v.q = { x: 0, y: 0, z: 0, w: 1 };
  let t = 0, t100 = 0, t300 = 0, top = 0, flips = 0;
  while (t < +(process.env.T || 90)) {
    v.input.throttle = 1; v.input.steer = 0; v.input.brake = 0;
    v.update(1 / 60); t += 1 / 60;
    v.events.length = 0;
    const k = v.kmh;
    if (!t100 && k >= 100) t100 = t;
    if (!t300 && k >= 300) t300 = t;
    top = Math.max(top, k);
    if (v.getUp({}).y < 0.5) { flips++; break; }
  }
  console.log(id.padEnd(8), 'top', top.toFixed(0), 'km/h  0-100', t100.toFixed(2), 's  0-300', t300.toFixed(1), 's', flips ? 'FLIPPED' : '', 'y', v.pos.y.toFixed(2));
}
// nitro check: from top speed, fire nitro and watch 4 s
if (process.env.NITRO) {
  const car = carById(process.env.NITRO);
  const st = computeStats(car, defaultLevels(), 'race');
  const v = new Vehicle(track, car, st);
  v.reset(30, 0); v.pos.x = 0; v.pos.z = 0; v.pos.y = st.phys.cg + 0.05; v.q = { x: 0, y: 0, z: 0, w: 1 };
  for (let t = 0; t < 120; t += 1 / 60) { v.input.throttle = 1; v.update(1 / 60); v.events.length = 0; }
  const k0 = v.kmh;
  let out = [];
  for (let t = 0; t < 8; t += 1 / 60) { v.input.throttle = 1; v.input.boost = t < 0.1 ? 1 : 0; v.update(1 / 60); v.events.length = 0; if (Math.abs(t % 1) < 1 / 60) out.push(v.kmh.toFixed(0)); }
  console.log(process.env.NITRO, 'top', k0.toFixed(0), 'nitro per second:', out.join(' '), 'target', (k0 * 1.4).toFixed(0), 'charge', v.nitro.toFixed(2));
}
if (process.env.BRAKE) {
  const car = carById(process.env.BRAKE);
  const st = computeStats(car, defaultLevels(), 'perf');
  const v = new Vehicle(track, car, st);
  v.assist = +(process.env.ASSIST ?? 1);
  v.reset(30, 0); v.pos.x = 0; v.pos.z = 0; v.pos.y = st.phys.cg + 0.05; v.q = { x: 0, y: 0, z: 0, w: 1 };
  for (let t = 0; t < 40 && v.kmh < 160; t += 1 / 60) { v.input.throttle = 1; v.update(1 / 60); v.events.length = 0; }
  const k0 = v.kmh; let t = 0, z0 = v.pos.z; const log = [];
  while (v.kmh > 20 && t < 20) { v.input.throttle = 0; v.input.brake = 1; v.update(1 / 60); v.events.length = 0; t += 1 / 60; if (Math.abs(t % 0.5) < 1 / 60) log.push(v.kmh.toFixed(0) + '/' + v.wheels.map((w) => (w.locked ? 'L' : '') + w.slip.toFixed(1)).join(',')); }
  console.log(process.env.BRAKE, 'brake from', k0.toFixed(0), 'to 20 in', t.toFixed(2), 's, dist', (v.pos.z - z0).toFixed(0), 'm, avg decel', ((k0 - 20) / 3.6 / t).toFixed(1), 'm/s2 (nominal', st.phys.brakeDecel.toFixed(1), ')', log.join(' '));
}

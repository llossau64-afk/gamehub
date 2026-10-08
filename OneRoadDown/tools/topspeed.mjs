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

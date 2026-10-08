// Physics-only check of breakable vs solid objects:  node tools/smash-test.mjs
import { Track, SURF } from '../src/world/track.js';
import { MOUNTAINS } from '../src/data/mountains.js';
import { carById } from '../src/data/cars.js';
import { computeStats, defaultLevels } from '../src/game/stats.js';
import { Vehicle } from '../src/physics/vehicle.js';

const track = new Track(MOUNTAINS[0]);
const q0 = track.query.bind(track);
track.query = (x, z, out = {}) => { q0(0, 0, out); out.h = 0; out.d = x; out.halfW = 50; out.surf = SURF.ASPHALT; out.dist = 0; out.s = 500; return out; };
track.roadY = () => 0; track.railAt = () => null; track.collidersNear = () => []; track.extraCol = new Map();
function run(label, obj, kmh) {
  const car = carById('kestrel');
  const st = computeStats(car, defaultLevels(), 'street');
  const v = new Vehicle(track, car, st);
  v.reset(30, 0); v.pos.x = 0; v.pos.z = 0; v.pos.y = st.phys.cg + 0.05; v.q = { x: 0, y: 0, z: 0, w: 1 };
  v.vel.z = kmh / 3.6;
  for (const w of v.wheels) w.spin = v.vel.z / st.phys.r;
  v.animalCols = [obj];
  let smashed = false, hits = 0;
  for (let t = 0; t < 2; t += 1 / 60) {
    v.input.throttle = 0.4;
    v.update(1 / 60);
    for (const e of v.events) { if (e.type === 'smash') smashed = true; if (e.type === 'impact' && e.kind !== 'ground') hits++; }
    v.events.length = 0;
  }
  console.log(label.padEnd(22), 'smashed', smashed, 'impacts', hits, 'kmh after', v.kmh.toFixed(0), 'hp', (v.hp / v.p.hpPool).toFixed(2));
}
run('sapling @60', { t: 's', x: 0, y: 0.6, z: 15, r: 0.35, s: 500, brk: 0, slow: 0.035, dmg: 0.08 }, 60);
run('bush @40', { t: 's', x: 0, y: 0.4, z: 12, r: 0.6, s: 500, brk: 0, slow: 0.01 }, 40);
run('fence @50', { t: 'b', x: 0, y: 0.55, z: 12, hx: 1.3, hy: 0.6, hz: 0.1, yaw: 0, s: 500, brk: 0, slow: 0.015 }, 50);
run('deer @80', { t: 's', x: 0, y: 0.95, z: 20, r: 0.55, s: 500, brk: 1.2, slow: 0.07, dmg: 0.06 }, 80);
run('cow @80', { t: 's', x: 0, y: 0.95, z: 20, r: 0.8, s: 500, brk: 1.2, slow: 0.22, dmg: 0.16 }, 80);
run('big tree @60 (solid)', { t: 's', x: 0, y: 0.8, z: 15, r: 0.42, s: 500, tree: 1 }, 60);
run('house @40 (solid)', { t: 'b', x: 0, y: 3, z: 12, hx: 4.5, hy: 3, hz: 4, yaw: 0, s: 500, heavy: 1 }, 40);

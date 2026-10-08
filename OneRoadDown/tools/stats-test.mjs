import { CARS } from '../src/data/cars.js';
import { computeStats, maxStats, defaultLevels } from '../src/game/stats.js';
for (const c of CARS) {
  const s = computeStats(c, defaultLevels(), 'street');
  const m = maxStats(c);
  const f = (s) => `top ${s.top.toFixed(0)} hp ${s.hp.toFixed(0)} nm ${s.nm.toFixed(0)} 0-100 ${s.t100?s.t100.toFixed(1):'--'} grip ${s.grip.toFixed(0)} kg ${s.kg.toFixed(0)} cda ${s.phys.cda.toFixed(2)} red ${s.phys.engine.redline.toFixed(0)}`;
  console.log(c.name.padEnd(11), f(s), '|| MAX', f(m));
}

// Build every race map and report length / corners / time:  node tools/maps-test.mjs
import { Track } from '../src/world/track.js';
import { MAPS } from '../src/data/maps.js';
for (const m of MAPS) {
  const t0 = performance.now();
  try {
    const t = new Track(m);
    let tight = 0;
    for (let j = 0; j < t.N; j++) if (Math.abs(t.k[j]) > 1 / 45) tight++;
    const ys = Array.from(t.py);
    console.log(m.id.padEnd(16), m.kind.padEnd(8), 'len', Math.round(t.length), 'm  tight%', (tight / t.N * 100).toFixed(0), ' dy', Math.round(Math.max(...ys) - Math.min(...ys)), ' ms', Math.round(performance.now() - t0), ' props', t.props.length, ' obst', t.obstacles.length);
  } catch (e) { console.log(m.id, 'FAILED', e.message); }
}

// Headless driving test: a bot drives each car down the mountain.
import { Track, STEP } from '../src/world/track.js';
import { MOUNTAINS } from '../src/data/mountains.js';
import { CARS, carById } from '../src/data/cars.js';
import { computeStats, defaultLevels, maxStats } from '../src/game/stats.js';
import { Vehicle } from '../src/physics/vehicle.js';

const track = new Track(MOUNTAINS[0]);
const ids = process.argv[2] ? process.argv[2].split(',') : ['rusty','brick','dusty','kestrel','vanta','mammoth'];
const maxT = +(process.argv[3] || 200);
const useMax = process.argv[4] === 'max';
for (const id of ids) {
  const car = carById(id);
  const st = useMax ? maxStats(car) : computeStats(car, defaultLevels(), 'street');
  const v = new Vehicle(track, car, st);
  v.reset(30, -1.5);
  let t = 0, maxS = 30, topK = 0, flips = 0, impacts = 0, maxImp = 0, land = 0, nan = false;
  const t0 = performance.now();
  let lastS = 30, stuckT = 0, endReason = 'time';
  while (t < maxT) {
    // bot: aim at a point ahead on the centreline (right lane)
    const s = v.lastQuery.s;
    const look = 8 + v.speed * 0.6;
    let lane = 1.4;
    for (const o of track.obstacles) { if (o.s > s && o.s < s + 60 && Math.abs(o.d - lane) < 3.2) { const span = (o.len || o.r * 2) + 1.6; lane = o.d > 0 ? o.d - span : o.d + span; } }
    const tgt = track.posAt(s + look, lane);
    const fw = v.getForward({});
    const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z;
    const ang = Math.atan2(dx, dz) - Math.atan2(fw.x, fw.z);
    let a = ang; while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI;
    // speed target from curvature ahead
    let kmax = 0;
    for (let u = 0; u < 20 + v.speed * 3; u += 4) { const j = Math.min(track.N-1, Math.round((s + u) / STEP)); kmax = Math.max(kmax, Math.abs(track.k[j])); }
    const vt = Math.min(40, Math.sqrt(0.75 * 9.81 * st.phys.mu / Math.max(kmax, 1e-3)));
    v.input.steer = Math.max(-1, Math.min(1, a * 2.2));
    v.input.throttle = v.speed < vt ? 1 : 0;
    v.input.brake = v.speed > vt + 2 ? 1 : 0;
    v.update(1/60); t += 1/60;
    for (const e of v.events) { if (e.type === 'impact') { impacts++; maxImp = Math.max(maxImp, e.speed); } if (e.type==='land') land++; if (e.type==='damage' && e.amount>0.05 && process.env.DBG) console.log('  dmg',e.zone,e.amount.toFixed(2),'at s',v.lastQuery.s.toFixed(0),'kmh',v.kmh.toFixed(0)); if (e.type==='impact' && e.speed>6 && process.env.DBG) console.log('  imp',e.kind,e.speed.toFixed(1),'s',v.lastQuery.s.toFixed(0)); }
    v.events.length = 0;
    if (!Number.isFinite(v.pos.x)) { nan = true; endReason='NaN'; break; }
    maxS = Math.max(maxS, v.lastQuery.s);
    topK = Math.max(topK, v.kmh);
    const up = v.getUp({});
    if (up.y < 0.2) flips++;
    if (v.destroyed) { endReason = 'destroyed'; break; }
    if (v.fuel <= 0 && v.speed < 0.5) { endReason = 'fuel'; break; }
    if (v.pos.y < track.roadY(v.lastQuery.s) - 25) { endReason = 'fell'; break; }
    if (Math.abs(v.lastQuery.s - lastS) < 0.05) stuckT += 1/60; else stuckT = 0; lastS = v.lastQuery.s;
    if (stuckT > 10) { endReason = 'stuck'; break; }
  }
  const ms = performance.now() - t0;
  console.log(`${car.name.padEnd(10)} ${endReason.padEnd(9)} t=${t.toFixed(0)}s dist=${((maxS-30)/1000).toFixed(2)}km top=${topK.toFixed(0)} avg=${((maxS-30)/t*3.6).toFixed(0)}km/h hp=${(v.hp/v.p.hpPool*100).toFixed(0)}% fuel=${v.fuel.toFixed(1)}/${v.p.fuel.toFixed(0)} eng=${v.dmg.engine.toFixed(2)} heat=${v.heat.toFixed(2)} imp=${impacts} max=${maxImp.toFixed(1)} flipFrames=${flips} lands=${land} gear=${v.gear} cpu=${(ms/t).toFixed(2)}ms/s`);
}

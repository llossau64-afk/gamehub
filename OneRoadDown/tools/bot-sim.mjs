// Headless race: N bots on a map, real physics + AI + car contact.
//   node tools/bot-sim.mjs <mapId> [cars=8] [seconds=240]
import { Track } from '../src/world/track.js';
import { mapById } from '../src/data/maps.js';
import { CARS, carById } from '../src/data/cars.js';
import { computeStats } from '../src/game/stats.js';
import { Vehicle } from '../src/physics/vehicle.js';
import { aiDrive } from '../src/game/ai.js';

const [mapId = 'jp-sakura', nArg = '8', secArg = '240'] = process.argv.slice(2);
const map = mapById(mapId);
const t = new Track(map);
const laps = t.loop ? map.laps : 1;
const startS = t.loop ? 0 : 60;
const ids = (process.env.CARS || 'kestrel,wasp,rook,bulldog,stiletto,kestrel,wasp,rook').split(',');
const field = [];
for (let i = 0; i < +nArg; i++) {
  const car = carById(ids[i % ids.length]);
  const st = computeStats(car, {}, 'perf');
  const v = new Vehicle(t, car, st);
  const s = startS - 6 - Math.floor(i / 2) * 9 - (i % 2) * 3, d = (i % 2 ? 1 : -1) * 2.4;
  v.reset(t.wrapS(s), d); v.p = { ...v.p, fuelUse: 0 };
  field.push({ isBot: true, name: car.id + i, vehicle: v, lap: t.loop && s < 0 ? -1 : 0, lastS: t.wrapS(s), progress: 0, lane: d, laneT: 0, skill: 0.95, stuckT: 0, flipT: 0, resets: 0, finished: false });
}
for (const e of field) {
  const md = e.vehicle.car.model;
  e.box = { t: 'b', hx: md.wid / 2, hy: md.hgt / 2, hz: md.len / 2, m: e.vehicle.m, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0, yaw: 0, s: 0 };
}
for (const e of field) e.vehicle.carCols = field.filter((o) => o !== e).map((o) => o.box);
const L = t.length, goal = t.loop ? laps * L : L - startS;
let time = 0, cpu = 0, frames = 0, impacts = 0;
const dt = 1 / 60;
while (time < +secArg && field.some((e) => !e.finished)) {
  const t0 = performance.now();
  for (const e of field) {
    const v = e.vehicle, fw = v.getForward({});
    Object.assign(e.box, { x: v.pos.x, y: v.pos.y, z: v.pos.z, yaw: Math.atan2(fw.x, fw.z), vx: v.vel.x, vy: v.vel.y, vz: v.vel.z });
    e.box.v0 = [v.vel.x, v.vel.y, v.vel.z];
    if (!e.finished && aiDrive(e, field, t, dt, { go: true })) {
      const q = v.lastQuery; if (process.env.DBG) console.log('reset', e.name, 't', time.toFixed(1), 's', Math.round(q.s), 'flip', e.flipT.toFixed(1), 'stuck', e.stuckT.toFixed(1), 'dist', q.dist.toFixed(1), 'halfW', q.halfW.toFixed(1), 'kmh', v.kmh.toFixed(0), 'k', t.k[q.idx].toFixed(4)); v.reset(t.wrapS(q.s), 0); e.flipT = e.stuckT = 0; e.resets++;
    }
    if (e.finished) { v.input.throttle = 0; v.input.brake = 0.3; }
  }
  for (const e of field) e.vehicle.update(dt);
  for (const e of field) { const b = e.box, v = e.vehicle; v.vel.x += b.vx - b.v0[0]; v.vel.y += b.vy - b.v0[1]; v.vel.z += b.vz - b.v0[2]; for (const ev of v.events) if (ev.type === 'impact' && ev.kind === 'object') impacts++; v.events.length = 0; }
  for (const e of field) {
    const s = e.vehicle.lastQuery.s;
    if (t.loop) { if (e.lastS > L * 0.7 && s < L * 0.3) e.lap++; else if (e.lastS < L * 0.3 && s > L * 0.7) e.lap--; e.progress = e.lap * L + s; }
    else e.progress = s - startS;
    e.lastS = s;
    if (!e.finished && e.progress >= goal) { e.finished = true; e.time = time; }
  }
  if (process.env.TRACE && time > +process.env.TRACE - 6 && time < +process.env.TRACE && frames % 15 === 0) { const e = field[0], v = e.vehicle, q = v.lastQuery; console.log('t', time.toFixed(1), 's', q.s.toFixed(0), 'd', q.d.toFixed(1), 'lane', e.lane.toFixed(1), 'kmh', v.kmh.toFixed(0), 'steer', v.input.steer.toFixed(2), 'thr', v.input.throttle, 'brk', v.input.brake.toFixed(2), 'k', t.k[q.idx].toFixed(4), 'slip', v.wheels.map((w) => w.slip.toFixed(1)).join(','), 'ground', v.wheelsOnGround, 'bt', (v.brakeTemp / v.p.brakeFade).toFixed(2), 'vy', v.vel.y.toFixed(1), 'dmgB', v.dmg?.brakes); }
  cpu += performance.now() - t0; frames++; time += dt;
}
field.sort((a, b) => (a.finished && b.finished ? a.time - b.time : b.progress - a.progress));
console.log(`${mapId}: ${laps} lap(s) of ${Math.round(L)} m, ${field.length} cars, sim ${time.toFixed(0)} s, cpu ${(cpu / frames).toFixed(2)} ms/frame, car contacts ${impacts}`);
for (const e of field) console.log('  ', e.name.padEnd(12), e.finished ? 'FINISH ' + e.time.toFixed(1) + 's' : 'progress ' + Math.round(e.progress) + 'm', ' avg', (e.progress / (e.time || time) * 3.6).toFixed(0), 'km/h', ' resets', e.resets, ' hp', (e.vehicle.hp / e.vehicle.p.hpPool).toFixed(2));

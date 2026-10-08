// Dumps the body dimensions of every car (same formulas as CarModel.build) for the
// Blender body generator:  node tools/car-dims.mjs > tools/blender/cars.json
import { CARS } from '../src/data/cars.js';
import { computeStats } from '../src/game/stats.js';
import { TYPE, carDims } from '../src/models/carDims.js';
const out = {};
for (const car of CARS) {
  const ph = computeStats(car, {}, 'worn').phys;
  out[car.id] = { id: car.id, drive: car.drive, model: car.model, T: TYPE[car.model.type] || TYPE.hatch, dims: carDims(car, ph), ph: { wb: ph.wb, track: ph.track, r: ph.r, cg: ph.cg, ground: ph.ground } };
}
console.log(JSON.stringify(out, null, 1));

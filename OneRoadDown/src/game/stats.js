// Turns a car + its upgrade levels into (a) the numbers shown in the garage and
// (b) the parameters the physics actually uses. The displayed top speed and 0-100
// time are *computed* from the same engine/gearing/drag model the car drives with.

import { clamp, lerp, smoothstep } from '../core/util.js';
import { tireById, TIRES, garageCapBonus } from '../data/upgrades.js';

export const G = 9.81;
const RHO = 1.2;
const ETA = 0.86; // drivetrain efficiency
const CRR = 0.012;

const BODY_CDA = { hatch: 0.66, wagon: 0.74, pickup: 0.95, sedan: 0.7, coupe: 0.62, suv: 0.98, muscle: 0.76, sports: 0.6, baja: 1.1, beast: 1.35, super: 0.6, monster: 1.9, hyper: 0.62, wedge: 0.56, berlinetta: 0.55, longtail: 0.5 };

export const capOf = (car, cat, garageLevel = 1) => car.caps[cat] + garageCapBonus(garageLevel);
const frac = (car, levels, cat) => Math.max(0, levels[cat] || 0) / car.caps[cat];

export function defaultLevels() {
  return { engine: 0, transmission: 0, torque: 0, tires: 0, brakes: 0, suspension: 0, armor: 0, fuel: 0, cooling: 0, turbo: 0, weight: 0 };
}
export const maxLevels = (car, garageLevel = 1) => Object.fromEntries(Object.keys(car.caps).map((k) => [k, capOf(car, k, garageLevel)]));

export function unlockedTires(level) { return TIRES.filter((t) => level >= t.unlock); }

// Engine torque at a given rpm (Nm, without boost). `e` comes from computeStats().phys.engine
export function engineTorque(e, rpm) {
  const r = clamp(rpm, e.idle, e.redline * 1.1);
  if (r < e.rpmT) {
    const t = (r - e.idle) / (e.rpmT - e.idle);
    return e.tpk * (0.58 + 0.42 * t * (2 - t));
  }
  if (r < e.rpmP) return lerp(e.tpk, e.tAtP, (r - e.rpmT) / (e.rpmP - e.rpmT));
  return lerp(e.tAtP, e.tAtP * 0.8, (r - e.rpmP) / (e.redline - e.rpmP));
}
// Boost target for a given rpm and throttle (0..1)
export const boostTarget = (e, rpm, throttle) => (e.turbo > 0 ? throttle * smoothstep(e.redline * 0.3, e.redline * 0.55, rpm) : 0);

export function computeStats(car, levels, tireId = 'worn', garageLevel = 1) {
  const L = { ...defaultLevels(), ...levels };
  const b = car.base, p = car.pot, ph = car.phys;
  const f = (cat) => frac(car, L, cat);

  // --- engine
  const hpNA = b.hp + p.hp * f('engine');
  const turboHp = L.turbo > 0 ? p.turbo * (0.25 + 0.75 * f('turbo')) : 0;
  const nmNA = b.nm + p.nm * f('torque') + p.hp * f('engine') * 0.35;
  const turboFrac = turboHp / hpNA;
  const factoryTurbo = car.sound.turbo ? 1 : 0;

  let redline = ph.redline * (1 + 0.06 * f('engine'));
  const pmax = hpNA * 745.7;
  let rpmP = redline * 0.86;
  const rpmNeeded = (pmax / (nmNA * 0.97)) * 60 / (2 * Math.PI);
  if (rpmNeeded > rpmP) { rpmP = rpmNeeded; redline = Math.max(redline, rpmP / 0.86); }
  const rpmT = Math.min(rpmP * 0.82, (car.sound.tone === 'diesel' ? 0.42 : 0.58) * redline);
  const engine = {
    idle: Math.min(950, redline * 0.16), redline, rpmP, rpmT, tpk: nmNA,
    tAtP: pmax / (rpmP * 2 * Math.PI / 60),
    turbo: turboFrac, factoryTurbo,
    lag: L.turbo > 0 ? lerp(1.1, 0.35, f('turbo')) : 1,
    boostCap: L.turbo > 0 ? 2.2 + 3.8 * f('turbo') : 0,
  };

  // --- mass
  const extraFuel = p.fuel * f('fuel');
  const kg = b.kg
    + 1.4 * L.engine + 1.0 * L.torque + 1.6 * L.suspension + 0.9 * L.cooling + 2.2 * L.turbo
    + b.kg * 0.11 * f('armor')
    + extraFuel * 0.95
    - p.kg * f('weight');

  // --- chassis
  const dur = clamp(b.dur + p.dur * f('armor') - 3 * f('weight'), 1, 100);
  const grip = clamp(b.grip + p.grip * f('tires'), 1, 100);
  const brakes = clamp(b.brakes + p.brakes * f('brakes'), 1, 100);
  const susp = clamp(b.susp + p.susp * f('suspension'), 1, 100);
  const fuel = b.fuel + extraFuel;

  const tire = tireById(tireId);
  const mu = 0.62 + (grip / 100) * 0.62;
  const cooling = 1 + 1.6 * f('cooling');

  // --- transmission: gear-limited top speed and ratios
  const gearTop = (b.top + p.top * f('transmission') + b.top * 0.03 * f('engine')) / 3.6;
  const nGears = ph.gears + (L.transmission >= 5 ? 1 : 0) + (L.transmission >= 12 ? 1 : 0);
  const r = ph.r;
  const wRed = redline * 2 * Math.PI / 60;
  const gTop = (wRed * r) / gearTop;
  const spread = lerp(3.0, 4.6, (nGears - 4) / 3);
  const g1 = gTop * spread;
  const ratios = [];
  for (let i = 0; i < nGears; i++) ratios.push(g1 * Math.pow(gTop / g1, i / (nGears - 1)));
  const shiftTime = lerp(0.42, 0.1, f('transmission'));

  // --- aero: stock car is gear limited; drag is calibrated so stock drag-limited speed is ~6% above
  const cdaBody = BODY_CDA[car.model.type] || 0.75;
  const stockCda = calibrateCda(car);
  const cda = Math.min(cdaBody, stockCda) * (1 + 0.1 * f('armor') + 0.03 * f('fuel'));
  const crr = CRR * tire.roll;

  const phys = {
    mass: kg, cda, crr, mu, tire, engine, ratios, shiftTime, finalTop: gTop,
    drive: car.drive, r, wb: ph.wb, track: ph.track, cg: ph.cg + (car.model.lift || 0) * 0.5,
    weightFront: ph.weightFront, steer: (ph.steer * Math.PI) / 180, stability: ph.stability,
    freq: ph.freq * (0.92 + 0.2 * (susp / 100)), zeta: 0.24 + (susp / 100) * 0.36,
    travel: (ph.travel || 0.17 + ph.ground * 0.35) * (0.82 + 0.36 * (susp / 100)),
    arb: (0.25 + (susp / 100) * 0.6) * ph.stability,
    landing: 3.2 + (susp / 100) * 6.5,
    brakeDecel: (0.35 + (brakes / 100) * 0.95) * G, brakeFade: 0.5 + brakes / 100,
    hpPool: 100 * (0.55 + dur / 100), dmgMult: 1 / (0.4 + (dur / 100) * 1.25),
    fuel, fuelUse: ph.fuelUse * (1 + 0.004 * L.engine + 0.006 * L.torque + 0.01 * L.turbo),
    heat: 1 + 0.02 * L.engine + 0.035 * L.turbo, cooling,
    offroad: ph.offroad || 1, rearGrip: ph.rearGrip || 1, ground: ph.ground,
    downforce: ph.downforce || 0, boostCap: engine.boostCap,
    armorLevel: L.armor, susLevel: L.suspension, abs: L.brakes >= 6, tcs: !!(car.exotic || car.model.sport),
  };

  const top = topSpeed(phys);
  const t100 = zeroTo100(phys);
  return {
    top: top * 3.6, hp: (hpNA + turboHp), nm: nmNA * (1 + turboFrac * 0.85), t100,
    grip, brakes, susp, dur, fuel, kg, gears: nGears, drive: car.drive, tire: tire.name,
    turbo: L.turbo > 0, phys,
  };
}

// Highest flat-ground speed: limited by gearing (rev limiter) or by drag.
export function topSpeed(ph) {
  const e = ph.engine;
  const gTop = ph.ratios[ph.ratios.length - 1];
  const vGear = (e.redline * 2 * Math.PI / 60) * ph.r / gTop;
  let vmax = 0;
  for (const g of ph.ratios) {
    for (let v = 5; v <= vGear * (gTop / g) + 0.01 && v <= vGear; v += 0.25) {
      const rpm = (v / ph.r) * g * 60 / (2 * Math.PI);
      if (rpm > e.redline) break;
      const T = engineTorque(e, rpm) * (1 + e.turbo * boostTarget(e, rpm, 1));
      const F = (T * g * ETA) / ph.r - ph.crr * (ph.mass * G + (ph.downforce || 0) * 0.72 * v * v) - 0.5 * RHO * ph.cda * v * v;
      if (F > 0) vmax = Math.max(vmax, v);
    }
  }
  return vmax;
}

// Numerical 0-100 km/h using the drivetrain, traction limit, drag and shift time.
export function zeroTo100(ph) {
  const e = ph.engine;
  let v = 0, t = 0, gear = 0, shiftT = 0, boost = 0;
  const target = 100 / 3.6;
  const driven = ph.drive === 'AWD' || ph.drive === '4WD' ? 1 : ph.drive === 'FWD' ? ph.weightFront - 0.06 : 1 - ph.weightFront + 0.07;
  const muRoad = ph.mu * ph.tire.grip[0];
  const dt = 0.005;
  while (v < target && t < 60) {
    const g = ph.ratios[gear];
    let rpm = (v / ph.r) * g * 60 / (2 * Math.PI);
    rpm = Math.max(rpm, Math.min(e.rpmT * 1.05, e.redline * 0.55));
    boost += (boostTarget(e, rpm, 1) - boost) * Math.min(1, dt / e.lag);
    let F = shiftT > 0 ? 0 : (engineTorque(e, rpm) * (1 + e.turbo * boost) * g * ETA) / ph.r;
    F = Math.min(F, muRoad * ph.mass * G * driven);
    F -= ph.crr * ph.mass * G + 0.5 * RHO * ph.cda * v * v;
    v += (F / (ph.mass * 1.06)) * dt;
    t += dt;
    if (shiftT > 0) shiftT -= dt;
    const rpmNow = (v / ph.r) * g * 60 / (2 * Math.PI);
    if (rpmNow > e.redline * 0.97 && gear < ph.ratios.length - 1) { gear++; shiftT = ph.shiftTime; }
    if (v < 0.01 && t > 5) return null;
  }
  return v >= target ? t : null;
}

const _cdaCache = new Map();
function calibrateCda(car) {
  if (_cdaCache.has(car.id)) return _cdaCache.get(car.id);
  const b = car.base, ph = car.phys;
  // stock engine model (same maths as above with zero levels)
  let redline = ph.redline;
  const pmax = b.hp * 745.7;
  let rpmP = redline * 0.86;
  const rpmNeeded = (pmax / (b.nm * 0.97)) * 60 / (2 * Math.PI);
  if (rpmNeeded > rpmP) { rpmP = rpmNeeded; redline = Math.max(redline, rpmP / 0.86); }
  const rpmT = Math.min(rpmP * 0.82, (car.sound.tone === 'diesel' ? 0.42 : 0.58) * redline);
  const e = { idle: 900, redline, rpmP, rpmT, tpk: b.nm, tAtP: pmax / (rpmP * 2 * Math.PI / 60), turbo: 0 };
  const v = (b.top * 1.06) / 3.6;
  // best force available at v across a plausible top gear (rpm at ~90% of redline)
  const rpm = redline * 0.9;
  const g = (rpm * 2 * Math.PI / 60) * ph.r / v;
  const F = (engineTorque(e, rpm) * g * ETA) / ph.r - CRR * b.kg * G;
  const cda = clamp(F / (0.5 * RHO * v * v), 0.35, 3.0);
  _cdaCache.set(car.id, cda);
  return cda;
}

// Stats with every category maxed (for the showroom "MAX POTENTIAL" column).
export function maxStats(car, garageLevel = 1) {
  const lv = {};
  for (const k of Object.keys(car.caps)) lv[k] = car.caps[k] + garageCapBonus(garageLevel);
  return computeStats(car, lv, 'street', garageLevel);
}

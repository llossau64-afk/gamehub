// Semi-realistic vehicle simulation: one rigid body, four raycast suspension corners,
// a load-sensitive tyre model with a friction circle, an automatic gearbox driven by
// a real torque curve, turbo spool, brake fade, engine heat, fuel burn and a damage
// model that feeds back into the handling. Pure math, no rendering dependencies.

import { clamp, lerp, smoothstep } from '../core/util.js';
import { engineTorque, boostTarget, G } from '../game/stats.js';
import { SURF, SURF_INFO, STEP } from '../world/track.js';

const DT = 1 / 120;
const RHO = 1.2;
const ETA = 0.86;

// ---- tiny vector / quaternion helpers (allocation free in the hot path)
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
function qrot(q, x, y, z, o) {
  // o = q * v * q^-1
  const ix = q.w * x + q.y * z - q.z * y;
  const iy = q.w * y + q.z * x - q.x * z;
  const iz = q.w * z + q.x * y - q.y * x;
  const iw = -q.x * x - q.y * y - q.z * z;
  o.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y;
  o.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z;
  o.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x;
  return o;
}
function qinvrot(q, x, y, z, o) {
  const c = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  return qrot(c, x, y, z, o);
}
const T1 = v3(), T2 = v3(), T3 = v3(), T4 = v3(), T5 = v3(), T6 = v3();

const ZONES = ['front', 'rear', 'left', 'right', 'roof'];

export class Vehicle {
  constructor(track, car, stats) {
    this.track = track;
    this.car = car;
    this.setStats(stats);
    this.pos = v3(); this.vel = v3(); this.angVel = v3();
    this.q = { x: 0, y: 0, z: 0, w: 1 };
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0, boost: 0 };
    this.events = [];
    this.dynamic = [];
    this.acc = 0;
    this.assist = 1;
    this.q0 = {}; this.q1 = {}; this.q2 = {};
  }

  setStats(stats) {
    this.stats = stats;
    const p = (this.p = stats.phys);
    const m = this.car.model;
    this.m = p.mass;
    // body box for inertia + collision
    const L = m.len, W = m.wid, H = m.hgt;
    this.half = { x: W / 2, z: L / 2 };
    const cg = p.cg;
    this.yb = -(cg - p.ground) + 0.02; // body bottom relative to CoM
    this.yt = H + (m.lift || 0) - cg; // roof
    const ix = (this.m / 12) * (H * H + L * L) * 0.9;
    const iy = (this.m / 12) * (W * W + L * L) * 0.85;
    const iz = (this.m / 12) * (W * W + H * H) * 1.25;
    this.I = v3(ix, iy, iz);
    // wheels
    const a = p.wb * (1 - p.weightFront), b = p.wb * p.weightFront;
    const tr = p.track / 2;
    const travel = p.travel;
    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const share = (front ? p.weightFront : 1 - p.weightFront) / 2;
      const mc = this.m * share;
      const w = 2 * Math.PI * p.freq * (front ? 1 : 1.06);
      const k = mc * w * w;
      const c = 2 * p.zeta * Math.sqrt(k * mc);
      const sag = (mc * G) / k;
      this.wheels.push({
        i, front, left, mc, k, c, rest: travel, sag,
        mx: left ? tr : -tr, mz: front ? a : -b,
        my: -(cg - p.r) + travel - sag,
        comp: sag, compPrev: sag, contact: false, load: 0, surf: SURF.ASPHALT,
        spin: 0, angle: 0, steer: 0, slip: 0, slipLat: 0, spinning: 0, locked: 0,
        gx: 0, gy: 0, gz: 0, nx: 0, ny: 1, nz: 0, vLong: 0, health: 1, toe: 0, roughPhase: Math.random() * 10,
      });
    }
    this.driven = p.drive === 'FWD' ? [0, 1] : p.drive === 'RWD' ? [2, 3] : [0, 1, 2, 3];
    // collision sample points (local)
    const hx = this.half.x * 0.96, hz = this.half.z * 0.97, yb = this.yb, ym = yb + (this.yt - yb) * 0.42, yt = this.yt;
    this.pts = [
      [hx, yb, hz], [-hx, yb, hz], [hx, yb, -hz], [-hx, yb, -hz],
      [hx, yb, 0], [-hx, yb, 0], [0, yb, 0], [0, yb, hz * 0.55], [0, yb, -hz * 0.55],
      [hx, ym, hz], [-hx, ym, hz], [0, ym, hz * 1.02], [hx * 0.5, ym, hz * 1.02], [-hx * 0.5, ym, hz * 1.02],
      [hx, ym, -hz], [-hx, ym, -hz], [0, ym, -hz * 1.02],
      [hx * 1.02, ym, hz * 0.4], [-hx * 1.02, ym, hz * 0.4], [hx * 1.02, ym, -hz * 0.4], [-hx * 1.02, ym, -hz * 0.4],
      [hx * 0.8, yt, hz * 0.3], [-hx * 0.8, yt, hz * 0.3], [hx * 0.8, yt, -hz * 0.35], [-hx * 0.8, yt, -hz * 0.35],
    ];
  }

  reset(s, d = 0) {
    const t = this.track;
    const pos = t.posAt(s, d);
    const hd = pos.hd;
    this.pos.x = pos.x; this.pos.z = pos.z;
    this.pos.y = pos.y + this.p.cg + 0.05;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.angVel.x = this.angVel.y = this.angVel.z = 0;
    // pitch to match the road grade
    const ahead = t.roadY(s + 2) - t.roadY(s - 2);
    const pitch = -Math.atan2(ahead, 4);
    const cy = Math.cos(hd / 2), sy = Math.sin(hd / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
    // yaw (around Y) then pitch (around local X)
    this.q = { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
    for (const w of this.wheels) { w.comp = w.compPrev = w.sag; w.spin = 0; w.health = 1; w.toe = 0; }
    this.rpm = this.p.engine.idle; this.gear = 1; this.shiftT = 0; this.nextGear = 1; this.reverseT = 0;
    this.boost = 0; this.boostTank = this.p.boostCap; this.overboost = false;
    this.fuel = this.p.fuel; this.heat = 0.4; this.brakeTemp = 0;
    this.engineOn = true; this.stalled = false;
    this.hp = this.p.hpPool;
    this.dmg = { engine: 1, susp: 1, brakes: 1, glass: 0, lightL: 1, lightR: 1, bumperF: 1, bumperR: 1 };
    for (const z of ZONES) this.dmg[z] = 1;
    this.air = 0; this.airTime = 0; this.drift = 0; this.groundY = pos.y;
    this.lastQuery = { idx: Math.round(s / STEP), s, d: 0 };
    this.speed = 0; this.fwdSpeed = 0;
    this.wheelsOnGround = 4;
    this.limiter = 0;
    this.events.length = 0;
    this.misfire = 0;
    this.scrape = 0;
    this.surfMix = 0;
    this.totalSlip = 0;
  }

  get destroyed() { return this.hp <= 0; }
  get engineHealth() { return this.dmg.engine; }
  get tireHealth() { return (this.wheels[0].health + this.wheels[1].health + this.wheels[2].health + this.wheels[3].health) / 4; }

  update(dt) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= DT && n < 6) { this.step(DT); this.acc -= DT; n++; }
    if (n === 6) this.acc = 0;
    this.alpha = this.acc / DT;
  }

  step(dt) {
    const p = this.p, t = this.track, m = this.m, q = this.q;
    const inp = this.input;
    let Fx = 0, Fy = -m * G, Fz = 0;
    let Tx = 0, Ty = 0, Tz = 0;
    const addF = (fx, fy, fz, px, py, pz) => {
      Fx += fx; Fy += fy; Fz += fz;
      const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
      Tx += ry * fz - rz * fy; Ty += rz * fx - rx * fz; Tz += rx * fy - ry * fx;
    };
    const U = qrot(q, 0, 1, 0, T1);
    const ux = U.x, uy = U.y, uz = U.z;
    const Fw = qrot(q, 0, 0, 1, T2);
    const fwx = Fw.x, fwy = Fw.y, fwz = Fw.z;
    const vx = this.vel.x, vy = this.vel.y, vz = this.vel.z;
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const fwdSpeed = vx * fwx + vy * fwy + vz * fwz;
    this.speed = speed; this.fwdSpeed = fwdSpeed;

    // ---------------------------------------------------------- driver inputs
    let throttle = inp.throttle, brake = inp.brake;
    if (this.gear === -1) { const tmp = throttle; throttle = brake; brake = tmp; }
    // reverse engage / disengage
    if (this.gear > 0 && fwdSpeed < 0.8 && inp.brake > 0.5 && inp.throttle < 0.1) {
      this.reverseT += dt; if (this.reverseT > 0.3) { this.gear = -1; this.reverseT = 0; this.events.push({ type: 'shift' }); }
    } else if (this.gear === -1 && fwdSpeed > -0.8 && inp.throttle > 0.5 && inp.brake < 0.1) {
      this.reverseT += dt; if (this.reverseT > 0.15) { this.gear = 1; this.reverseT = 0; }
    } else this.reverseT = 0;

    const steerMax = p.steer / (1 + Math.pow(Math.max(0, fwdSpeed) / 26, 2) * 1.1);
    const steerTarget = inp.steer * steerMax;

    // ---------------------------------------------------------- engine
    const e = p.engine;
    const dmg = this.dmg;
    const engineAlive = this.engineOn && dmg.engine > 0 && this.fuel > 0;
    if (!engineAlive && !this.stalled) { this.stalled = true; this.events.push({ type: 'stall' }); }
    // wheel based rpm
    let vDriven = 0, nd = 0;
    for (const i of this.driven) { vDriven += this.wheels[i].vLong; nd++; }
    vDriven /= nd;
    const ratio = this.gear === -1 ? p.ratios[0] * 1.1 : p.ratios[Math.max(0, this.gear - 1)];
    const wheelRpm = Math.abs(vDriven) / p.r * ratio * 60 / (2 * Math.PI);
    let rpm = wheelRpm;
    const launch = Math.min(e.rpmT * 1.05, e.redline * 0.55);
    if (rpm < launch && engineAlive) rpm = lerp(Math.max(e.idle, rpm), launch, throttle * (this.wheelsOnGround ? 1 : 0.4));
    if (!this.wheelsOnGround && engineAlive) rpm = lerp(this.rpm, e.idle + throttle * (e.redline - e.idle), 1 - Math.exp(-dt * 6));
    rpm = Math.max(rpm, engineAlive ? e.idle : 0);
    this.rpm = lerp(this.rpm, rpm, 1 - Math.exp(-dt * 22));

    // turbo
    if (e.turbo > 0 || e.factoryTurbo) {
      const tgt = boostTarget({ ...e, turbo: 1 }, this.rpm, throttle);
      this.boost += (tgt - this.boost) * Math.min(1, dt / (tgt > this.boost ? e.lag : 0.25));
      if (throttle < 0.2 && this.boost > 0.55 && this.prevThrottle > 0.6) this.events.push({ type: 'blowoff', amount: this.boost });
    }
    this.prevThrottle = throttle;
    this.overboost = false;
    if (inp.boost && this.boostTank > 0 && engineAlive && throttle > 0.3 && p.boostCap > 0) {
      this.overboost = true; this.boostTank = Math.max(0, this.boostTank - dt);
    } else if (!inp.boost) this.boostTank = Math.min(p.boostCap, this.boostTank + dt * 0.12);

    // engine torque
    let Te = 0;
    const engF = 0.25 + 0.75 * Math.sqrt(Math.max(0, dmg.engine));
    let redline = e.redline * (dmg.engine < 0.25 ? 0.72 : 1);
    if (engineAlive) {
      if (throttle > 0.01) {
        Te = engineTorque(e, this.rpm) * (1 + e.turbo * this.boost) * throttle * engF * (this.overboost ? 1.3 : 1);
        if (dmg.engine < 0.3) { this.misfire -= dt; if (this.misfire < 0) { this.misfire = 0.05 + Math.random() * 0.6; if (Math.random() < 0.45) { Te *= 0.2; this.events.push({ type: 'misfire' }); } } }
      } else Te = -(0.05 + 0.12 * this.rpm / e.redline) * e.tpk;
      if (this.rpm >= redline) {
        Te = Math.min(Te, 0); this.limiter = 0.08;
      }
    } else Te = -0.02 * e.tpk * (this.rpm / e.redline);
    // over-rev engine braking (descending in too high a gear)
    if (wheelRpm > redline) Te -= e.tpk * Math.min(2.2, (wheelRpm / redline - 1) * 9);
    if (this.limiter > 0) this.limiter -= dt;

    // gearbox
    if (this.shiftT > 0) {
      this.shiftT -= dt; Te = 0;
      if (this.shiftT <= 0) this.gear = this.nextGear;
    } else if (this.gear > 0 && this.wheelsOnGround) {
      const n = p.ratios.length;
      if (this.rpm > redline * 0.94 && this.gear < n && throttle > 0.2) { this.nextGear = this.gear + 1; this.shiftT = p.shiftTime; this.events.push({ type: 'shift', up: true }); }
      else if (this.gear > 1) {
        const lower = p.ratios[this.gear - 2];
        const rpmLower = Math.abs(vDriven) / p.r * lower * 60 / (2 * Math.PI);
        if (rpmLower < redline * (throttle > 0.5 ? 0.86 : 0.7) && this.rpm < redline * (brake > 0.3 ? 0.62 : 0.5)) {
          this.nextGear = this.gear - 1; this.shiftT = Math.min(0.15, p.shiftTime); this.events.push({ type: 'shift', up: false });
        }
      }
    }
    const wheelTorque = (Te * ratio * ETA) / nd * (this.gear === -1 ? -1 : 1);

    // fuel + heat
    if (engineAlive) {
      const pk = Math.max(0, Te) * this.rpm * 2 * Math.PI / 60 / 1000;
      this.fuel = Math.max(0, this.fuel - dt * p.fuelUse * (0.045 + 0.2 * throttle * Math.sqrt(pk / 74.6)) * (this.overboost ? 1.6 : 1));
      const air = 0.6 + 0.4 * Math.min(1, speed / 25);
      const load = throttle * (this.rpm / e.redline) * (this.overboost ? 2.2 : 1) / air;
      const target = 0.35 + 0.55 * load * p.heat / p.cooling;
      this.heat += (target - this.heat) * dt * (target > this.heat ? 0.09 : 0.05);
      if (this.heat > 1) this.damageEngine((this.heat - 1) * 0.06 * dt, 'heat');
    } else this.heat += (0.3 - this.heat) * dt * 0.02;

    // ---------------------------------------------------------- brakes
    const fade = 1 - 0.55 * smoothstep(0.75, 1.35, this.brakeTemp / p.brakeFade);
    const brakeTotal = brake * p.brakeDecel * m * fade * (0.4 + 0.6 * dmg.brakes);
    let brakePower = 0;

    // ---------------------------------------------------------- wheels
    let onGround = 0;
    const qr = this.q0, Q = t.query.bind(t);
    const loadRef = (m * G) / 4;
    for (const w of this.wheels) {
      w.steer = w.front ? lerp(w.steer, steerTarget, 1 - Math.exp(-dt * 14)) : 0;
      const M = qrot(q, w.mx, w.my, w.mz, T3);
      const mx = M.x + this.pos.x, my = M.y + this.pos.y, mz = M.z + this.pos.z;
      const maxLen = w.rest + p.r;
      let contact = false, comp = 0;
      let cx = mx, cy = my, cz = mz;
      if (uy > 0.15) {
        Q(mx, mz, qr);
        let dist = (my - qr.h) / uy;
        let px = mx - ux * dist, pz = mz - uz * dist;
        Q(px, pz, qr, true);
        dist = (my - qr.h) / uy;
        if (dist < maxLen + 0.02 && dist > p.r * 0.35) {
          contact = true;
          comp = Math.min(maxLen - dist, w.rest + 0.12);
          px = mx - ux * dist; pz = mz - uz * dist;
          const h0 = qr.h;
          w.surf = qr.surf;
          w.s = qr.s; w.d = qr.d;
          const hx = Q(px + 0.3, pz, this.q1).h, hz = Q(px, pz + 0.3, this.q2).h;
          let nx = -(hx - h0) / 0.3, nz = -(hz - h0) / 0.3, ny = 1;
          const nl = Math.sqrt(nx * nx + 1 + nz * nz); nx /= nl; ny /= nl; nz /= nl;
          w.nx = nx; w.ny = ny; w.nz = nz;
          cx = px; cy = h0; cz = pz;
        }
      }
      w.contact = contact;
      // wheel centre for rendering
      const susLen = contact ? maxLen - comp - p.r : w.rest;
      w.gx = mx - ux * (susLen); w.gy = my - uy * (susLen); w.gz = mz - uz * (susLen);
      w.compPrev = w.comp;
      w.comp = contact ? comp : lerp(w.comp, 0, 1 - Math.exp(-dt * 12));
      if (!contact) {
        w.load = 0; w.slip = 0; w.slipLat = 0;
        // free wheel: keep spinning, driven wheels rev with engine
        w.spin = lerp(w.spin, this.driven.includes(w.i) && throttle > 0.1 ? this.rpm / ratio * 2 * Math.PI / 60 : w.spin * 0.98, 1 - Math.exp(-dt * 3));
        if (brake > 0.3 || (inp.handbrake && !w.front)) w.spin *= 0.8;
        w.angle += w.spin * dt;
        continue;
      }
      onGround++;
      // --- suspension
      const compVel = clamp((w.comp - w.compPrev) / dt, -5, 5);
      // closing speed of the chassis corner towards the ground (for landing damage)
      const mv = this.pointVel(mx, my, mz, T6);
      const closing = -(mv.x * w.nx + mv.y * w.ny + mv.z * w.nz);
      const sDamp = w.c * (0.45 + 0.55 * dmg.susp);
      let Fs = w.k * w.comp + sDamp * compVel;
      if (w.comp > w.rest * 0.92) {
        const over = w.comp - w.rest * 0.92;
        Fs += w.k * 9 * over + w.c * 2.5 * Math.max(0, compVel);
        if (closing > p.landing * 0.6 && !w.bottomed) { this.landingHit(closing, w); w.bottomed = true; }
      } else w.bottomed = false;
      // anti-roll bar
      const other = this.wheels[w.i ^ 1];
      Fs += (w.comp - other.comp) * w.k * p.arb * (other.contact ? 1 : 0.3);
      if (Fs < 0) Fs = 0;
      // steep ground (a wall) is the body's job, not the spring's: fade the
      // suspension out as the contact normal tilts away from the car's up axis
      const align = w.nx * ux + w.ny * uy + w.nz * uz;
      Fs = Math.min(Fs, w.mc * G * 6) * smoothstep(0.35, 0.75, align);
      w.load = Fs;
      addF(ux * Fs, uy * Fs, uz * Fs, cx, cy + p.r * 0.2, cz);

      // --- tyre frame
      const nx = w.nx, ny = w.ny, nz = w.nz;
      const sa = Math.sin(w.steer + w.toe), ca = Math.cos(w.steer + w.toe);
      const fw = qrot(q, sa, 0, ca, T4);
      let dn = fw.x * nx + fw.y * ny + fw.z * nz;
      let fx = fw.x - nx * dn, fy = fw.y - ny * dn, fz = fw.z - nz * dn;
      let fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      // left vector = n x f
      const lx = ny * fz - nz * fy, ly = nz * fx - nx * fz, lz = nx * fy - ny * fx;
      // contact point velocity
      const rx = cx - this.pos.x, ry = cy - this.pos.y, rz = cz - this.pos.z;
      const av = this.angVel;
      const pvx = vx + (av.y * rz - av.z * ry), pvy = vy + (av.z * rx - av.x * rz), pvz = vz + (av.x * ry - av.y * rx);
      const vLong = pvx * fx + pvy * fy + pvz * fz;
      const vLat = pvx * lx + pvy * ly + pvz * lz;
      w.vLong = vLong;

      const si = SURF_INFO[w.surf];
      let mu = p.mu * si.mu * p.tire.grip[si.group] * (si.group > 0 ? p.offroad : 1) * (0.62 + 0.38 * w.health);
      if (!w.front) mu *= p.rearGrip;
      mu *= clamp(1 - 0.12 * (Fs / loadRef - 1), 0.72, 1.12);
      if (si.group === 0 && p.downforce) mu *= 1 + p.downforce * Math.min(1, speed / 60) * 0.25;
      // standing water: aquaplaning at speed
      if (w.surf === SURF.WATER) mu *= 1 - 0.45 * smoothstep(18, 32, speed);
      const maxF = mu * Fs;

      // longitudinal
      let fLong = 0;
      const driven = p.drive === 'FWD' ? w.front : p.drive === 'RWD' ? !w.front : true;
      const drive = driven && this.shiftT <= 0 ? wheelTorque / p.r : 0;
      fLong += drive;
      const share = w.front ? 0.32 : 0.18;
      let bF = brakeTotal * share;
      let locked = false;
      if (inp.handbrake && !w.front) { bF = Math.max(bF, maxF * 1.2); locked = speed > 1.5; }
      if (bF > 0) {
        if (Math.abs(vLong) > 0.6) {
          if (p.abs && !locked) bF = Math.min(bF, maxF * 0.95);
          if (bF > maxF * 1.02 && speed > 2) locked = true;
          fLong -= Math.sign(vLong) * bF;
          brakePower += bF * Math.abs(vLong);
        } else fLong += clamp(-vLong * w.mc / dt, -bF, bF);
      }
      fLong -= p.crr * si.roll * Fs * clamp(vLong / 0.6, -1, 1);

      // lateral (simplified Pacejka)
      const alpha = Math.atan2(vLat, Math.abs(vLong) + 0.6);
      const mf = Math.sin(1.35 * Math.atan(9.5 * alpha));
      const latMu = locked ? 0.55 : 1;
      const fDyn = -maxF * mf * latMu;
      const fStatic = clamp(-vLat * w.mc / dt * 0.5, -maxF, maxF);
      let fLat = lerp(fStatic, fDyn, smoothstep(0.8, 4, speed));
      // friction circle
      let spinning = 0;
      const tot = Math.sqrt(fLong * fLong + fLat * fLat);
      if (tot > maxF && tot > 0) {
        const k = maxF / tot;
        if (Math.abs(drive) > maxF * 0.9) spinning = clamp((Math.abs(drive) - maxF * 0.9) / (maxF + 1), 0, 1);
        fLong *= k; fLat *= k;
      }
      w.spinning = spinning; w.locked = locked ? 1 : 0;
      w.slipLat = Math.abs(vLat);
      w.slip = clamp((Math.abs(vLat) - 1.2) / 6, 0, 1) + spinning * 0.8 + (locked ? clamp(Math.abs(vLong) / 8, 0, 1) : 0);
      // apply at a raised point to soften the roll moment
      const lift = Math.min(p.cg * 0.5 * p.stability, p.cg * 0.75);
      const ax = cx + ux * lift, ay = cy + uy * lift, az = cz + uz * lift;
      addF(fx * fLong + lx * fLat, fy * fLong + ly * fLat, fz * fLong + lz * fLat, ax, ay, az);
      // wheel spin for visuals
      const target = locked ? 0 : vLong / p.r + Math.sign(drive || 1) * spinning * 25;
      w.spin = lerp(w.spin, target, 1 - Math.exp(-dt * 30));
      w.angle += w.spin * dt;
      // surface roughness vibration (small vertical jitters)
      if (si.rough > 0.05 && speed > 2) {
        w.roughPhase += speed * dt * 2.3;
        const jitter = Math.sin(w.roughPhase * 3.1) * Math.sin(w.roughPhase * 1.7) * si.rough * w.mc * 3 * (1.2 - p.ground);
        addF(ux * jitter, uy * jitter, uz * jitter, cx, cy, cz);
      }
    }
    this.wheelsOnGround = onGround;
    // brake heat
    this.brakeTemp += (brakePower / (m * 900) - this.brakeTemp * (0.04 + speed * 0.0015)) * dt;
    if (this.brakeTemp < 0) this.brakeTemp = 0;

    // ---------------------------------------------------------- aero
    const drag = 0.5 * RHO * p.cda * speed;
    Fx -= drag * vx; Fy -= drag * vy; Fz -= drag * vz;
    if (p.downforce) {
      const df = p.downforce * 0.5 * RHO * 1.2 * speed * speed;
      Fx -= ux * df; Fy -= uy * df; Fz -= uz * df;
    }

    // ---------------------------------------------------------- stability assist + air control
    const avB = qinvrot(q, this.angVel.x, this.angVel.y, this.angVel.z, T5);
    if (onGround >= 3 && speed > 6 && this.assist > 0) {
      // compare actual yaw rate with what the front wheels ask for
      const want = (fwdSpeed * Math.tan(this.wheels[0].steer)) / p.wb;
      const excess = avB.y - want;
      const slipAngle = Math.atan2(this.lateralSpeed(), Math.abs(fwdSpeed) + 1);
      const k = this.assist * 0.55 * p.stability * smoothstep(0.25, 0.7, Math.abs(slipAngle)) * (inp.handbrake ? 0.2 : 1);
      if (k > 0) {
        const ty = -excess * this.I.y * k * 2.2;
        const W = qrot(q, 0, ty, 0, T6);
        Tx += W.x; Ty += W.y; Tz += W.z;
      }
    }
    if (onGround === 0) {
      this.air += dt;
      // a little air control: steer yaws, throttle/brake pitch
      const tb = { x: (inp.throttle - inp.brake) * -0.35 * this.I.x - avB.x * this.I.x * 0.6, y: inp.steer * 0.35 * this.I.y, z: -avB.z * this.I.z * 0.5 };
      const W = qrot(q, tb.x, tb.y, tb.z, T6);
      Tx += W.x; Ty += W.y; Tz += W.z;
    } else {
      if (this.air > 0.45) this.events.push({ type: 'land', air: this.air });
      this.airTime = this.air;
      this.air = 0;
    }

    // ---------------------------------------------------------- integrate velocities
    this.vel.x += (Fx / m) * dt; this.vel.y += (Fy / m) * dt; this.vel.z += (Fz / m) * dt;
    const tb = qinvrot(q, Tx, Ty, Tz, T5);
    const dw = { x: (tb.x / this.I.x) * dt, y: (tb.y / this.I.y) * dt, z: (tb.z / this.I.z) * dt };
    const dW = qrot(q, dw.x, dw.y, dw.z, T6);
    this.angVel.x += dW.x; this.angVel.y += dW.y; this.angVel.z += dW.z;
    const ad = Math.exp(-dt * 0.15);
    this.angVel.x *= ad; this.angVel.y *= ad; this.angVel.z *= ad;

    // ---------------------------------------------------------- contacts
    this.collide(dt);

    // ---------------------------------------------------------- integrate positions
    this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
    const w = this.angVel;
    const hq = 0.5 * dt;
    const nq = {
      x: q.x + hq * (w.x * q.w + w.y * q.z - w.z * q.y),
      y: q.y + hq * (w.y * q.w + w.z * q.x - w.x * q.z),
      z: q.z + hq * (w.z * q.w + w.x * q.y - w.y * q.x),
      w: q.w + hq * (-w.x * q.x - w.y * q.y - w.z * q.z),
    };
    const ql = Math.hypot(nq.x, nq.y, nq.z, nq.w);
    q.x = nq.x / ql; q.y = nq.y / ql; q.z = nq.z / ql; q.w = nq.w / ql;

    // drift tracking
    const lat = this.lateralSpeed();
    const slipA = Math.abs(Math.atan2(lat, Math.abs(fwdSpeed) + 0.1));
    if (onGround >= 3 && speed > 12 && slipA > 0.26 && slipA < 1.4) this.drift += dt; else this.drift = Math.max(0, this.drift - dt * 3);
    this.totalSlip = 0;
    for (const ww of this.wheels) this.totalSlip += ww.slip;
  }

  lateralSpeed() {
    const L = qrot(this.q, 1, 0, 0, this._lt || (this._lt = v3()));
    return this.vel.x * L.x + this.vel.y * L.y + this.vel.z * L.z;
  }

  // ------------------------------------------------------------------ contacts
  collide(dt) {
    const t = this.track, q = this.q, pos = this.pos;
    const qr = this.q0;
    // where is the car relative to the road (for rails, tunnels, colliders)
    const c = t.query(pos.x, pos.z, this.q1);
    this.lastQuery.idx = c.idx; this.lastQuery.s = c.s; this.lastQuery.d = c.d;
    this.lastQuery.halfW = c.halfW; this.lastQuery.dist = c.dist; this.groundY = c.h;
    const roadY = t.roadY(c.s);
    this.scrape = Math.max(0, this.scrape - dt * 4);
    const P = T3;
    for (let n = 0; n < this.pts.length; n++) {
      const lp = this.pts[n];
      qrot(q, lp[0], lp[1], lp[2], P);
      const px = P.x + pos.x, py = P.y + pos.y, pz = P.z + pos.z;
      if (py - this.groundY > 2.5 && py - roadY > 2.5) continue;
      t.query(px, pz, qr);
      const h = qr.h;
      if (py < h) {
        // terrain normal
        const hx = t.query(px + 0.4, pz, this.q2).h;
        const hz = t.query(px, pz + 0.4, this.q2).h;
        let nx = -(hx - h) / 0.4, nz = -(hz - h) / 0.4, ny = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const pen = (h - py) * ny;
        const imp = this.resolve(px, py, pz, nx, ny, nz, pen, 0.12, 0.5, Infinity);
        if (imp > 0) this.hit(lp, imp, px, py, pz, nx, ny, nz, 'ground');
      }
      // guard rails
      const side = qr.d >= 0 ? 1 : 0;
      const ad = Math.abs(qr.d);
      const ry = t.roadY(qr.s);
      const rt = t.railAt(qr.idx, side);
      const railD = qr.halfW + 0.55;
      if (rt && ad > railD && ad < railD + 1.6 && py < ry + 0.95 && py > ry - 0.8) {
        const sg = side ? -1 : 1;
        const nx = t.rx[qr.idx] * sg, nz = t.rz[qr.idx] * sg;
        const pv = this.pointVel(px, py, pz, T4);
        const vn = pv.x * nx + pv.z * nz;
        if (-vn > t.railBreakSpeed(rt) * (1 + this.p.armorLevel * 0.01)) {
          t.breakRail(qr.idx, side);
          this.events.push({ type: 'railbreak', x: px, y: py, z: pz, idx: qr.idx, side, speed: -vn });
          this.vel.x *= 0.82; this.vel.z *= 0.82;
          this.hit(lp, -vn * 0.7, px, py, pz, nx, 0, nz, 'rail');
        } else {
          const imp = this.resolve(px, py, pz, nx, 0, nz, ad - railD, 0.15, 0.35, Infinity);
          if (imp > 0) this.hit(lp, imp, px, py, pz, nx, 0, nz, 'rail');
        }
      }
      // tunnel walls
      if (t.tunnel[qr.idx] && ad > qr.halfW + 1.1 && py < ry + 5) {
        const sg = side ? -1 : 1;
        const nx = t.rx[qr.idx] * sg, nz = t.rz[qr.idx] * sg;
        const imp = this.resolve(px, py, pz, nx, 0, nz, ad - qr.halfW - 1.1, 0.1, 0.3, Infinity);
        if (imp > 0) this.hit(lp, imp, px, py, pz, nx, 0, nz, 'wall');
      }
    }
    // static colliders
    const list = t.collidersNear(c.s);
    for (let n = 0; n < list.length; n++) this.collideShape(list[n], dt);
    const ex = t.extraCol;
    if (ex) {
      const kc = Math.floor(c.s / 100);
      for (let kk = kc - 1; kk <= kc + 1; kk++) {
        const l = ex.get(kk);
        if (l) for (let n = 0; n < l.length; n++) if (Math.abs(l[n].s - c.s) < 25) this.collideShape(l[n], dt);
      }
    }
    for (let n = 0; n < this.dynamic.length; n++) this.collideShape(this.dynamic[n], dt);
    // body sunk below terrain (safety)
    if (pos.y < this.groundY - 1.5 && c.dist < 30) { pos.y = this.groundY + 0.5; this.vel.y = Math.max(0, this.vel.y); }
  }

  collideShape(o) {
    const pos = this.pos, q = this.q;
    const dx = o.x - pos.x, dy = o.y - pos.y, dz = o.z - pos.z;
    if (dx * dx + dz * dz > 100 + (o.hz || o.r || 1) * 10) return;
    if (o.dead) return;
    if (o.t === 's') {
      // sphere vs car box
      const lc = qinvrot(q, dx, dy, dz, T5);
      const cx = clamp(lc.x, -this.half.x, this.half.x), cy = clamp(lc.y, this.yb, this.yt), cz = clamp(lc.z, -this.half.z, this.half.z);
      let ex = cx - lc.x, ey = cy - lc.y, ez = cz - lc.z;
      let d2 = ex * ex + ey * ey + ez * ez;
      if (d2 >= o.r * o.r) return;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { ex = 0; ey = 0; ez = lc.z > 0 ? -1 : 1; d = 1; d2 = 1; }
      const W = qrot(q, ex / d, ey / d, ez / d, T6);
      const wp = qrot(q, cx, cy, cz, T4);
      const px = wp.x + pos.x, py = wp.y + pos.y, pz = wp.z + pos.z;
      const mass = o.m || Infinity;
      const imp = this.resolve(px, py, pz, W.x, W.y, W.z, o.r - d, 0.2, 0.4, mass, o);
      if (imp > 0) this.hit([cx, cy, cz], o.light ? imp * 0.3 : imp, px, py, pz, W.x, W.y, W.z, o.light ? 'light' : 'object', o);
    } else if (o.t === 'b') {
      // car sample points inside an oriented box (yaw only)
      const cyaw = Math.cos(o.yaw), syaw = Math.sin(o.yaw);
      for (let n = 0; n < this.pts.length; n++) {
        const lp = this.pts[n];
        const P = qrot(q, lp[0], lp[1], lp[2], T3);
        const rx = P.x + pos.x - o.x, ry = P.y + pos.y - o.y, rz = P.z + pos.z - o.z;
        // into box frame (box forward = yaw heading)
        const bx = rx * cyaw - rz * syaw, bz = rx * syaw + rz * cyaw;
        if (Math.abs(bx) > o.hx || Math.abs(ry) > o.hy || Math.abs(bz) > o.hz) continue;
        const px = o.hx - Math.abs(bx), py = o.hy - Math.abs(ry), pz = o.hz - Math.abs(bz);
        let nx = 0, ny = 0, nz = 0, pen;
        if (px < pz && px < py) { pen = px; const s = Math.sign(bx); nx = s * cyaw; nz = -s * syaw; }
        else if (pz < py) { pen = pz; const s = Math.sign(bz); nx = s * syaw; nz = s * cyaw; }
        else { pen = py; ny = Math.sign(ry); }
        const imp = this.resolve(P.x + pos.x, P.y + pos.y, P.z + pos.z, nx, ny, nz, pen, 0.15, 0.4, o.m || Infinity, o);
        if (imp > 0) this.hit(lp, imp, P.x + pos.x, P.y + pos.y, P.z + pos.z, nx, ny, nz, 'object', o);
      }
    }
  }

  pointVel(px, py, pz, out) {
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z, w = this.angVel;
    out.x = this.vel.x + (w.y * rz - w.z * ry);
    out.y = this.vel.y + (w.z * rx - w.x * rz);
    out.z = this.vel.z + (w.x * ry - w.y * rx);
    return out;
  }

  applyInvI(x, y, z, out) {
    const b = qinvrot(this.q, x, y, z, out);
    return qrot(this.q, b.x / this.I.x, b.y / this.I.y, b.z / this.I.z, out);
  }

  // Impulse based contact. Returns the closing speed (m/s) if there was an impact.
  resolve(px, py, pz, nx, ny, nz, pen, e, mu, otherMass, other) {
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
    const pv = this.pointVel(px, py, pz, this._pv || (this._pv = v3()));
    let ovx = 0, ovy = 0, ovz = 0;
    if (other && other.vx !== undefined) { ovx = other.vx; ovy = other.vy; ovz = other.vz; }
    const rvx = pv.x - ovx, rvy = pv.y - ovy, rvz = pv.z - ovz;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    // positional correction
    if (pen > 0.005) {
      const corr = Math.min(pen, 0.2) * (otherMass === Infinity ? 0.3 : 0.2);
      this.pos.x += nx * corr; this.pos.y += ny * corr; this.pos.z += nz * corr;
      if (other && otherMass !== Infinity) { other.x -= nx * corr; other.y -= ny * corr; other.z -= nz * corr; }
    }
    if (vn >= 0) return 0;
    // r x n
    const cx = ry * nz - rz * ny, cy = rz * nx - rx * nz, cz = rx * ny - ry * nx;
    const ii = this.applyInvI(cx, cy, cz, this._ii || (this._ii = v3()));
    const ang = (ii.y * rz - ii.z * ry) * nx + (ii.z * rx - ii.x * rz) * ny + (ii.x * ry - ii.y * rx) * nz;
    const invO = otherMass === Infinity ? 0 : 1 / otherMass;
    const jn = (-(1 + e) * vn) / (1 / this.m + ang + invO);
    this.impulse(px, py, pz, nx * jn, ny * jn, nz * jn);
    if (invO) { other.vx -= nx * jn * invO; other.vy -= ny * jn * invO; other.vz -= nz * jn * invO; other.hit = true; }
    // friction
    let tx = rvx - nx * vn, ty = rvy - ny * vn, tz = rvz - nz * vn;
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-3) {
      tx /= tl; ty /= tl; tz /= tl;
      const c2x = ry * tz - rz * ty, c2y = rz * tx - rx * tz, c2z = rx * ty - ry * tx;
      const i2 = this.applyInvI(c2x, c2y, c2z, this._ii);
      const ang2 = (i2.y * rz - i2.z * ry) * tx + (i2.z * rx - i2.x * rz) * ty + (i2.x * ry - i2.y * rx) * tz;
      let jt = tl / (1 / this.m + ang2 + invO);
      jt = Math.min(jt, mu * jn);
      this.impulse(px, py, pz, -tx * jt, -ty * jt, -tz * jt);
      if (tl > 3 && jn > this.m * 0.2) this.scrape = Math.min(1, this.scrape + 0.25);
    }
    return -vn;
  }

  impulse(px, py, pz, jx, jy, jz) {
    this.vel.x += jx / this.m; this.vel.y += jy / this.m; this.vel.z += jz / this.m;
    const rx = px - this.pos.x, ry = py - this.pos.y, rz = pz - this.pos.z;
    const tx = ry * jz - rz * jy, ty = rz * jx - rx * jz, tz = rx * jy - ry * jx;
    const d = this.applyInvI(tx, ty, tz, this._iw || (this._iw = v3()));
    this.angVel.x += d.x; this.angVel.y += d.y; this.angVel.z += d.z;
  }

  // ------------------------------------------------------------------ damage
  hit(lp, speed, x, y, z, nx, ny, nz, kind, obj) {
    if (speed < 2.2) { if (speed > 1.2) this.events.push({ type: 'bump', speed, x, y, z }); return; }
    const p = this.p;
    const base = speed - 3.0;
    this.events.push({ type: 'impact', speed, x, y, z, nx, ny, nz, kind, lx: lp[0], ly: lp[1], lz: lp[2] });
    if (base <= 0) return;
    let dmg = Math.pow(base, 1.55) * 0.85 * p.dmgMult;
    if (kind === 'light') dmg *= 0.3;
    this.applyDamage(lp, dmg);
  }

  applyDamage(lp, dmg) {
    const p = this.p, d = this.dmg;
    const pool = p.hpPool;
    const f = dmg / pool;
    this.hp -= dmg;
    const [x, y, z] = lp;
    let zone;
    if (y > this.yt - 0.25) zone = 'roof';
    else if (z > this.half.z * 0.45) zone = 'front';
    else if (z < -this.half.z * 0.45) zone = 'rear';
    else zone = x > 0 ? 'left' : 'right';
    d[zone] = Math.max(0, d[zone] - f * 2.4);
    if (zone === 'front') {
      this.damageEngine(f * 1.0, 'impact');
      d.brakes = Math.max(0, d.brakes - f * 0.25);
      if (x > 0.15) d.lightL = Math.max(0, d.lightL - f * 4); else if (x < -0.15) d.lightR = Math.max(0, d.lightR - f * 4); else { d.lightL -= f * 2; d.lightR -= f * 2; }
      d.bumperF = Math.max(0, d.bumperF - f * 3);
    } else if (zone === 'rear') d.bumperR = Math.max(0, d.bumperR - f * 3);
    else this.damageEngine(f * 0.2, 'impact');
    if (dmg > 7) {
      const before = d.glass;
      d.glass = Math.min(3, d.glass + (dmg > 25 ? 2 : 1) * (Math.random() < 0.6 ? 1 : 0));
      if (d.glass > before) this.events.push({ type: 'glass', level: d.glass });
    }
    // wheels near the hit point
    for (const w of this.wheels) {
      const dx = w.mx - x, dz = w.mz - z;
      if (dx * dx + dz * dz < 1.4) {
        w.health = Math.max(0, w.health - f * 1.8);
        w.toe = (1 - w.health) * 0.045 * (w.left ? 1 : -1) * (w.front ? 1 : 0.6);
        d.susp = Math.max(0, d.susp - f * 0.5);
      }
    }
    this.events.push({ type: 'damage', zone, amount: f, lx: x, ly: y, lz: z });
  }

  damageEngine(f, why) {
    const before = this.dmg.engine;
    this.dmg.engine = Math.max(0, this.dmg.engine - f);
    if (before > 0.25 && this.dmg.engine <= 0.25) this.events.push({ type: 'engineCritical' });
    if (before > 0 && this.dmg.engine <= 0) this.events.push({ type: 'engineDead', why });
    if (why === 'heat') this.hp -= f * this.p.hpPool * 0.3;
  }

  landingHit(compVel, w) {
    const p = this.p;
    const over = compVel - p.landing;
    this.events.push({ type: 'bottom', speed: compVel, wheel: w.i });
    if (over <= 0) return;
    const dmg = Math.pow(over, 1.5) * 2.2 * p.dmgMult;
    const f = dmg / p.hpPool;
    this.hp -= dmg * 0.5;
    this.dmg.susp = Math.max(0, this.dmg.susp - f * 1.4);
    w.health = Math.max(0, w.health - f * 1.2);
    w.toe = (1 - w.health) * 0.04 * (w.left ? 1 : -1);
    if (w.front) this.damageEngine(f * 0.15, 'landing');
    this.events.push({ type: 'damage', zone: 'susp', amount: f, lx: w.mx, ly: this.yb, lz: w.mz });
  }

  repair(amount) {
    const d = this.dmg;
    this.hp = Math.min(this.p.hpPool, this.hp + this.p.hpPool * amount);
    d.engine = Math.min(1, d.engine + amount * 0.8);
    d.susp = Math.min(1, d.susp + amount);
    d.brakes = Math.min(1, d.brakes + amount);
    for (const w of this.wheels) { w.health = Math.min(1, w.health + amount); w.toe *= 1 - Math.min(1, amount * 1.5); }
    if (this.dmg.engine > 0 && this.fuel > 0) { this.engineOn = true; this.stalled = false; }
  }

  // Convenience for renderers
  getForward(out) { return qrot(this.q, 0, 0, 1, out); }
  getUp(out) { return qrot(this.q, 0, 1, 0, out); }
  getRight(out) { return qrot(this.q, -1, 0, 0, out); }
  localToWorld(x, y, z, out) { qrot(this.q, x, y, z, out); out.x += this.pos.x; out.y += this.pos.y; out.z += this.pos.z; return out; }
  get kmh() { return this.speed * 3.6; }
}

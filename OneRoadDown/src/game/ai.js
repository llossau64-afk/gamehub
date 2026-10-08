// Racing AI: follows a racing line, brakes for the slowest corner it can still reach,
// overtakes on the free side and uses the nitro on long straights. Pure (no three.js),
// so tools/bot-sim.mjs can run whole races in Node. Returns true when the car needs a reset.
import { STEP } from '../world/track.js';
import { clamp, damp } from '../core/util.js';

const TMP = {}, TMP2 = {};

export function aiDrive(e, field, t, dt, o = {}) {
  const cruise = o.cruise ?? 1;
  {
    const v = e.vehicle, q = v.lastQuery, p = v.p;
    const s = q.s, spd = v.speed;
    const halfW = t.width[Math.min(t.N - 1, q.idx)] / 2;
    const kAt = (u) => t.k[Math.min(t.N - 1, Math.max(0, Math.round(t.wrapS(s + u) / STEP)))];
    // racing line: drift to the inside of the coming corner
    let kAhead = 0;
    for (let u = 10; u < 50; u += 10) kAhead += kAt(u + spd * 0.6);
    kAhead /= 4;
    let want = clamp(-Math.sign(kAhead) * Math.min(1, Math.abs(kAhead) * 70) * halfW * 0.55, -halfW + 1.3, halfW - 1.3);
    // overtaking: find the nearest car ahead in our lane
    e.laneT -= dt;
    for (const ot of field) {
      if (ot === e) continue;
      const gap = ot.progress - e.progress;
      if (gap > 0 && gap < 22 + spd * 0.4 && Math.abs(ot.vehicle.lastQuery.d - e.lane) < 2.4) {
        if (e.laneT <= 0) { e.passSide = ot.vehicle.lastQuery.d > 0 ? -1 : 1; e.laneT = 2.5; }
      }
    }
    if (e.laneT > 0) want = clamp(e.passSide * halfW * 0.55, -halfW + 1.3, halfW - 1.3);
    e.lane = damp(e.lane, want, 1.2, dt);
    // steering: pure pursuit on the lane line
    const look = 7 + spd * 0.5;
    const tgt = t.posAt(s + look, e.lane);
    const fw = v.getForward(TMP);
    let ang = Math.atan2(tgt.x - v.pos.x, tgt.z - v.pos.z) - Math.atan2(fw.x, fw.z);
    while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
    v.input.steer = clamp(ang * 2.4, -1, 1);
    // speed: the slowest corner speed we can still brake down to
    const mu = p.mu * (p.tire && p.tire.grip ? p.tire.grip[0] : 1) * 9.81 * e.skill * (p.downforce ? 1 + p.downforce * Math.min(1, spd / 60) * 0.25 : 1);
    const dec = Math.min(p.brakeDecel, mu) * 0.7;
    let vt = 999;
    const reach = 30 + (spd * spd) / (2 * dec) + 20;
    for (let u = 4; u < reach; u += 6) {
      const k = Math.abs(kAt(u));
      const vc = Math.sqrt(mu * (globalThis.__AIK || 0.72) / Math.max(k, 1e-4));
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * dec * Math.max(0, u - 8)));
    }
    vt *= cruise;
    // keep the bunch together a little
    if (e.isBot && o.me) {
      const gap = e.progress - o.me.progress;
      vt *= clamp(1 - gap / 4000, 0.95, 1.04);
    }
    v.input.throttle = spd < vt * 0.98 ? 1 : spd < vt ? 0.4 : 0;
    v.input.brake = spd > vt * 1.03 ? clamp((spd - vt) / 5, 0.25, 1) : 0;
    v.input.handbrake = 0;
    // nitro on a long straight
    let straight = true;
    for (let u = 0; u < 140; u += 20) if (Math.abs(kAt(u)) > 1 / 300) { straight = false; break; }
    v.input.boost = e.isBot && straight && v.nitro >= 1 && spd > 20 && Math.random() < dt * 0.8 ? 1 : 0;
    // recover from crashes
    const up = v.getUp(TMP2);
    if (up.y < 0.3) e.flipT += dt; else e.flipT = 0;
    if (o.go && spd < 1.5 && v.input.throttle > 0.5) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt);
    return e.flipT > 2 || e.stuckT > 3.5 || q.dist > halfW + 40;
  }
}


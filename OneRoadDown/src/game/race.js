// A race: up to eight cars (the player, bots and/or online players) on a circuit or
// a point-to-point sprint. Reuses the single-car Run for the player's camera, effects,
// audio and damage handling, and adds the field, laps, positions and the result.

import * as THREE from 'three';
import { Run } from './run.js';
import { Vehicle } from '../physics/vehicle.js';
import { CarModel } from '../models/carModel.js';
import { computeStats, maxStats, defaultLevels } from './stats.js';
import { CARS, carById } from '../data/cars.js';
import { garageEarnMult } from '../data/upgrades.js';
import { STEP } from '../world/track.js';
import { EngineVoice, audio } from '../audio/audio.js';
import { carState } from '../core/save.js';
import { clamp, lerp, damp, fmtMoney } from '../core/util.js';
import { aiDrive } from './ai.js';

const BOT_NAMES = ['K. TAKAHASHI', 'M. SCHNEIDER', 'L. MOREAU', 'R. OKADA', 'J. BAUER', 'C. LEFEVRE', 'S. ROSSI', 'T. NAKAMURA', 'F. WEBER', 'A. DUBOIS', 'H. MORI', 'E. KLEIN', 'N. GIRARD', 'D. FISCHER'];
const BOT_PAINTS = [0xc81e1e, 0x1e5ac8, 0xf0c020, 0x1a1a1a, 0xe8e8e8, 0x2a8a3a, 0xe86a10, 0x7a2ac8, 0x18a0b8, 0x9a9da2];
export const PRIZE = [1, 0.62, 0.45, 0.34, 0.26, 0.2, 0.16, 0.12];

export const fmtTime = (t) => {
  if (!Number.isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
};

// One car in the field.
class Entrant {
  constructor(o) { Object.assign(this, { lap: 0, lastS: 0, progress: 0, finished: false, finishTime: 0, bestLap: Infinity, lapStart: 0, stuckT: 0, flipT: 0, lane: 0, laneT: 0, skill: 1 }, o); }
}

export class Race extends Run {
  constructor(game) {
    super(game);
    this.field = [];
  }

  // cfg: { map, opponents, net }
  startRace(carId, cfg) {
    this.cfg = cfg;
    this.map = cfg.map;
    this.laps = this.track.loop ? cfg.map.laps : 1;
    this.start(carId);
  }

  // ------------------------------------------------------------------ setup
  clearField() {
    for (const e of this.field) {
      if (e.isPlayer) continue;
      this.g.worldScene.remove(e.model.group); e.model.dispose();
      if (e.voice) e.voice.dispose();
    }
    this.field = [];
  }

  pickOpponents(n) {
    // cars around the player's performance: similar top speed, random upgrades to match
    const me = this.stats.top;
    const pool = CARS.map((c) => ({ c, d: Math.abs(computeStats(c, {}, 'street').top - me) })).sort((a, b) => a.d - b.d).slice(0, 8);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = pool[Math.floor(Math.random() * Math.min(pool.length, 6))].c;
      const levels = defaultLevels();
      // tune each opponent towards the player's top speed
      const mx = maxStats(c);
      const base = computeStats(c, {}, 'street');
      const f = clamp((me - base.top) / Math.max(1, mx.top - base.top), 0, 1) * (0.75 + Math.random() * 0.4);
      for (const k of Object.keys(c.caps)) levels[k] = Math.round(c.caps[k] * clamp(f, 0, 1));
      out.push({ car: c, levels });
    }
    return out;
  }

  restart(first = false) {
    const t = this.track;
    t.pickups = []; t.rockfalls = [];
    super.restart(first);
    const g = this.g;
    document.body.classList.add('race-mode');
    this.clearField();
    // the grid: two columns, 8 m apart, behind the start line
    this.startS = t.loop ? 0 : 60;
    const nOpp = this.cfg.net ? 0 : clamp(this.cfg.opponents ?? 5, 0, 7);
    const total = nOpp + 1 + (this.cfg.net ? this.cfg.net.remoteCount() : 0);
    const mySlot = this.cfg.net ? this.cfg.net.mySlot() : Math.min(total - 1, Math.max(0, Math.floor(total / 2)));
    const slotPos = (k) => ({ s: this.startS - 6 - Math.floor(k / 2) * 9 - (k % 2) * 3, d: (k % 2 ? 1 : -1) * Math.min(2.4, t.width[0] / 2 - 1.4) });
    const me = new Entrant({ isPlayer: true, name: 'YOU', vehicle: this.vehicle, model: this.model, car: this.car, stats: this.stats, color: '#e2a33b' });
    const sp = slotPos(mySlot);
    this.vehicle.reset(t.wrapS(sp.s), sp.d);
    this.vehicle.fuel = this.vehicle.p.fuel; this.vehicle.p = { ...this.vehicle.p, fuelUse: 0 };
    me.lastS = t.wrapS(sp.s);
    me.lap = t.loop && sp.s < 0 ? -1 : 0;
    this.field.push(me);
    this.me = me;
    // bots
    const opp = this.pickOpponents(nOpp);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let slot = 0;
    opp.forEach((o, i) => {
      if (slot === mySlot) slot++;
      const p = slotPos(slot++);
      const st = computeStats(o.car, o.levels, 'perf');
      const model = new CarModel(o.car, { levels: o.levels, tire: 'perf', stats: st, paint: BOT_PAINTS[i % BOT_PAINTS.length] });
      for (const n of ['interior', 'dash', 'cabin', 'seats', 'steering', 'gauges']) if (model.parts[n]) model.parts[n].visible = false;
      model.bake();
      g.worldScene.add(model.group);
      const v = new Vehicle(t, o.car, st);
      v.assist = 1;
      v.reset(t.wrapS(p.s), p.d);
      v.p = { ...v.p, fuelUse: 0 };
      const e = new Entrant({ isBot: true, name: names[i % names.length], vehicle: v, model, car: o.car, stats: st,
        color: '#' + BOT_PAINTS[i % BOT_PAINTS.length].toString(16).padStart(6, '0'), skill: 0.9 + Math.random() * 0.12, lane: p.d, lastS: t.wrapS(p.s), lap: t.loop && p.s < 0 ? -1 : 0 });
      this.field.push(e);
    });
    if (this.cfg.net) this.cfg.net.attach(this, slotPos);
    // collision boxes so the cars bump into each other
    for (const e of this.field) {
      const d = e.model.dims;
      e.box = { t: 'b', x: 0, y: 0, z: 0, hx: d.W / 2, hy: (d.roof - d.bottom) / 2, hz: d.L / 2, yaw: 0, m: e.vehicle.m, vx: 0, vy: 0, vz: 0, s: 0, car: e };
    }
    for (const e of this.field) {
      e.vehicle.carCols = this.field.filter((o) => o !== e).map((o) => o.box);
      e.vehicle.animalCols = this.animals ? this.animals.cols : null;
    }
    this.raceTime = 0;
    this.finishOrder = [];
    this.resultShown = false;
    g.ui.raceHudInit(this.field.length, this.laps, this.track);
    this.syncBots(0);
    this.syncModel(0.016);
    this.placeIntroCamera();
  }

  // ------------------------------------------------------------------ loop
  update(rawDt) {
    const g = this.g, v = this.vehicle;
    const dt = rawDt * this.timeScale;
    this.time += dt;
    const inp = g.input.state;
    if (this.active && !this.me.finished && g.debug && g.debug.bot) this.aiDrive(this.me, dt);
    else if (this.active && !this.me.finished) {
      v.input.throttle = inp.throttle; v.input.brake = inp.brake; v.input.steer = inp.steer;
      v.input.handbrake = inp.handbrake; v.input.boost = inp.boost;
    } else if (this.me.finished) this.aiDrive(this.me, dt, 0.55);
    else { v.input.throttle = 0; v.input.brake = 1; v.input.steer = 0; v.input.handbrake = 0; v.input.boost = 0; }
    if (g.input.wasPressed('KeyC')) this.cycleCamera();
    if (g.input.wasPressed('KeyR') && this.active && !this.me.finished) this.resetCar(this.me, true);
    // bots decide
    for (const e of this.field) if (e.isBot) { if (this.go) this.aiDrive(e, dt); else this.holdOnGrid(e); }
    // physics for everyone
    for (const e of this.field) {
      const b = e.box, ve = e.vehicle;
      b.vx = ve.vel.x; b.vy = ve.vel.y; b.vz = ve.vel.z; b.v0 = [b.vx, b.vy, b.vz];
    }
    for (const e of this.field) {
      if (e.remote) continue;
      if (!this.countdown || this.go) e.vehicle.update(dt); else e.vehicle.update(dt * 0.5);
    }
    // car-to-car impulses collected on the boxes go back to their owners
    for (const e of this.field) {
      const b = e.box, ve = e.vehicle;
      if (e.remote) continue;
      ve.vel.x += b.vx - b.v0[0]; ve.vel.y += b.vy - b.v0[1]; ve.vel.z += b.vz - b.v0[2];
    }
    this.updateDynamic(dt);
    if (this.go && !this.ended) this.raceTime += dt;
    this.progressAll();
    if (this.animals) this.animals.update(dt, v, this.me.progress + this.startS);
    this.maxS = v.lastQuery.s;
    this.handleEvents();
    this.botEvents();
    this.syncModel(rawDt);
    this.syncBots(rawDt);
    this.effects(dt);
    this.updateCamera(rawDt);
    this.audio(dt);
    this.botAudio(dt);
    this.hud(rawDt);
    if (this.cfg.net) this.cfg.net.update(dt, this);
    if (this.active && !this.ended) this.checkEnd(dt);
    g.world.update(this.track.loop ? v.lastQuery.s : Math.max(this.maxS, this.startS), 1);
  }

  // ------------------------------------------------------------------ online
  addRemote(o) {
    const e = new Entrant(o);
    this.field.push(e);
    return e;
  }
  remoteFinished(e, time) {
    e.finished = true; e.finishTime = time;
    this.finishOrder.push(e);
    this.finishOrder.sort((a, b) => a.finishTime - b.finishTime);
  }
  remoteLeft(e) { e.dnf = true; e.left = true; }
  countdownDelay() {
    const n = this.cfg && this.cfg.net;
    return n && n.startAt ? Math.max(0, n.startAt - Date.now() - 2850) : 0;
  }

  holdOnGrid(e) {
    const v = e.vehicle;
    v.input.throttle = 0; v.input.brake = 1; v.input.steer = 0; v.input.boost = 0;
  }

  // keep each car's lap / distance up to date and sort the field
  progressAll() {
    const t = this.track, L = t.length;
    for (const e of this.field) {
      if (e.remote) { if (e.netProgress !== undefined) e.progress = e.netProgress; continue; }
      const s = e.vehicle.lastQuery.s;
      if (t.loop) {
        if (e.lastS > L * 0.7 && s < L * 0.3) {
          e.lap++;
          if (e.lap >= 1 && !e.finished) {
            const lt = this.raceTime - e.lapStart;
            if (e.lap > 1 || e.lapStart > 0 || true) e.bestLap = Math.min(e.bestLap, lt);
            e.lapStart = this.raceTime;
            if (e.isPlayer && e.lap < this.laps && e.lap >= 1) this.g.ui.notice(e.lap === this.laps - 1 ? 'FINAL LAP' : `LAP ${e.lap + 1} / ${this.laps}`, fmtTime(lt), e.lap === this.laps - 1, 1800);
          }
        } else if (e.lastS < L * 0.3 && s > L * 0.7) e.lap--;
        e.progress = e.lap * L + s;
      } else e.progress = s - this.startS;
      e.lastS = s;
      const goal = t.loop ? this.laps * L : t.length - this.startS;
      if (!e.finished && this.go && e.progress >= goal) {
        e.finished = true; e.finishTime = this.raceTime;
        this.finishOrder.push(e);
        if (e.isPlayer) this.finish('FINISH', 'RACE COMPLETE', true);
      }
    }
    const order = [...this.field].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.progress - a.progress;
    });
    order.forEach((e, i) => { e.pos = i + 1; });
    this.order = order;
  }

  // ------------------------------------------------------------------ AI
  aiDrive(e, dt, cruise = 1) {
    if (aiDrive(e, this.field, this.track, dt, { cruise, go: this.go, me: this.me })) this.resetCar(e);
  }

  // put a car back on the road where it left it
  resetCar(e, player = false) {
    const t = this.track, v = e.vehicle, q = v.lastQuery;
    const lap = e.lap;
    const d = clamp(q.d, -t.width[q.idx] / 2 + 1.5, t.width[q.idx] / 2 - 1.5);
    const dmg = { ...v.dmg }, hp = v.hp, nitro = v.nitro;
    v.reset(t.wrapS(q.s), d);
    Object.assign(v.dmg, dmg); v.hp = hp; v.nitro = nitro;
    v.vel.x = v.vel.z = 0;
    e.lap = lap; e.flipT = 0; e.stuckT = 0;
    if (player) { this.g.ui.notice('BACK ON TRACK', '', false, 1000); audio()?.ui('click'); }
  }

  syncBots(dt) {
    for (const e of this.field) {
      if (e.isPlayer) continue;
      const v = e.vehicle, m = e.model;
      if (!e.remote) {
        m.group.position.set(v.pos.x, v.pos.y, v.pos.z);
        m.group.quaternion.set(v.q.x, v.q.y, v.q.z, v.q.w);
        m.updateFromVehicle(v, dt || 0.016);
      }
      // flames when a bot fires its nitro
      if (dt) this.flames(m, v, dt, false);
      // tyre marks + smoke for the other cars too
      if (dt) {
        const idx = 4 + this.field.indexOf(e) * 4;
        const right = v.getRight(this.tmp.r);
        for (const w of v.wheels) {
          if (!w.contact) { this.g.skids.add(idx + w.i, 0, 0, 0, 0, 0, 0, 0); continue; }
          const mark = clamp(w.slip * 1.2, 0, 1);
          this.g.skids.add(idx + w.i, w.gx, w.gy - v.p.r + 0.02, w.gz, right.x, right.z, m.wheelWidth * 0.8, mark);
          if (w.slip > 0.45 && v.speed > 3 && Math.random() < dt * 20 * w.slip) this.g.particles.tireSmoke(w.gx, w.gy - v.p.r, w.gz, v.vel.x, v.vel.z);
        }
      }
    }
    for (const e of this.field) {
      const b = e.box, v = e.vehicle;
      const fw = v.getForward(this.tmp.f);
      b.x = v.pos.x; b.y = v.pos.y; b.z = v.pos.z; b.yaw = Math.atan2(fw.x, fw.z); b.s = v.lastQuery.s;
    }
  }

  botEvents() {
    for (const e of this.field) {
      if (e.isPlayer || e.remote) continue;
      const v = e.vehicle;
      for (const ev of v.events) {
        if (ev.type === 'smash') this.smashEvent(ev, false);
        else if (ev.type === 'damage' && ev.amount > 0.01 && ev.zone !== 'susp') e.model.dent(ev.lx, ev.ly, ev.lz, ev.amount * 1.6);
        else if (ev.type === 'impact' && ev.speed > 6) {
          const k = clamp((ev.speed - 2) / 14, 0, 1);
          this.g.particles.sparks(ev.x, ev.y, ev.z, v.vel.x, 1, v.vel.z, Math.round(4 + k * 12));
          const dd = Math.hypot(ev.x - this.vehicle.pos.x, ev.z - this.vehicle.pos.z);
          if (dd < 40) audio()?.impact(ev.speed * clamp(1 - dd / 40, 0, 1), ev.kind);
        }
      }
      if (v.events.some((x) => x.type === 'damage')) e.model.syncDamage(v.dmg);
      v.events.length = 0;
    }
  }

  // two nearest opponents get an engine voice
  botAudio(dt) {
    const a = audio();
    if (!a || !a.ctx) return;
    const near = this.field.filter((e) => !e.isPlayer).map((e) => ({ e, d: Math.hypot(e.vehicle.pos.x - this.vehicle.pos.x, e.vehicle.pos.z - this.vehicle.pos.z) })).sort((x, y) => x.d - y.d);
    near.forEach(({ e, d }, i) => {
      const want = i < 2 && d < 120;
      if (want && !e.voice) { e.voice = new EngineVoice(a, e.car); e.voice.setRunning(true); }
      if (!want && e.voice) { e.voice.dispose(); e.voice = null; }
      if (e.voice) {
        const v = e.vehicle;
        e.voice.update(dt, v.rpm, v.p.engine.redline, v.input.throttle, v.boost, v.limiter, v.dmg.engine, clamp(1 - d / 120, 0, 1) * 0.55);
      }
    });
  }

  // ------------------------------------------------------------------ HUD
  hud(dt) {
    super.hud(dt);
    this.rhT = (this.rhT || 0) + dt;
    if (this.rhT < 0.1) return;
    this.rhT = 0;
    const me = this.me;
    const lead = this.order[0];
    const board = this.order.map((e) => ({
      name: e.name, pos: e.pos, me: e.isPlayer, color: e.color,
      gap: e === lead ? (e.finished ? fmtTime(e.finishTime) : 'LEADER') : e.finished ? '+' + (e.finishTime - lead.finishTime).toFixed(1) + 's' : '-' + Math.max(0, (lead.progress - e.progress) / Math.max(10, lead.vehicle.speed)).toFixed(1) + 's',
    }));
    this.g.ui.raceHud({
      pos: me.pos, n: this.field.length, lap: Math.min(this.laps, Math.max(1, me.lap + 1)), laps: this.laps, sprint: !this.track.loop,
      time: fmtTime(this.raceTime), best: fmtTime(me.bestLap), board,
      nitro: this.vehicle.nitro, nitroOn: this.vehicle.nitroT > 0,
      dots: this.field.map((e) => ({ x: e.vehicle.pos.x, z: e.vehicle.pos.z, me: e.isPlayer, color: e.color })),
      progress: this.track.loop ? null : clamp(me.progress / (this.track.length - this.startS), 0, 1),
    });
  }

  // ------------------------------------------------------------------ ending
  checkEnd(dt) {
    const v = this.vehicle;
    if (v.destroyed) return this.finish('WRECKED', 'DID NOT FINISH');
    const up = v.getUp(this.tmp.u);
    if (up.y < 0.25 && v.speed < 2) { this.flipT += dt; if (this.flipT > 2.2) { this.flipT = 0; this.resetCar(this.me, true); } } else this.flipT = 0;
    if (v.lastQuery.dist > v.lastQuery.halfW + 60 || v.pos.y < this.track.roadY(v.lastQuery.s) - 30) this.resetCar(this.me, true);
  }

  finish(reason, title, complete = false) {
    if (this.ended) return;
    this.ended = true;
    this.me.dnf = !complete;
    const a = audio();
    a?.music?.setIntensity(0.2);
    if (complete) {
      this.g.ui.notice(this.me.pos === 1 ? 'YOU WIN' : `P${this.me.pos}`, fmtTime(this.me.finishTime), this.me.pos <= 3, 3000);
      if (this.me.pos === 1) a?.record();
    }
    this.g.platform.gameplayStop();
    // keep driving the cool-down lap; show the result once the others are in (or after a few seconds)
    setTimeout(() => this.showResult(), complete ? 3500 : 1500);
  }

  showResult() {
    if (this.resultShown) return;
    this.resultShown = true;
    const g = this.g, sv = g.save.data;
    // cars still racing get an estimated time from their average pace
    const goal = this.track.loop ? this.laps * this.track.length : this.track.length - this.startS;
    const est = this.field.filter((e) => !e.finished).map((e) => {
      const pace = Math.max(8, e.progress / Math.max(1, this.raceTime));
      return { e, t: this.raceTime + (goal - e.progress) / pace };
    }).sort((a, b) => a.t - b.t);
    const rows = [...this.finishOrder.map((e) => ({ e, t: e.finishTime })), ...est.map((x) => ({ e: x.e, t: x.e.dnf ? Infinity : x.t, est: true }))];
    if (this.me.dnf) { const i = rows.findIndex((r) => r.e === this.me); const r = rows.splice(i, 1)[0]; r.t = Infinity; rows.push(r); }
    const myPos = rows.findIndex((r) => r.e === this.me) + 1;
    const mult = garageEarnMult(sv.garageLevel);
    const base = this.map.reward || 5000;
    const fieldK = 0.55 + 0.45 * (this.field.length - 1) / 7;
    const prize = this.me.dnf ? 0 : Math.round(base * PRIZE[myPos - 1] * fieldK * mult);
    const lines = [];
    lines.push([`P${myPos} OF ${rows.length}`, '+' + fmtMoney(prize)]);
    let total = prize;
    const firstWin = myPos === 1 && !this.me.dnf && !(sv.wins || {})[this.map.id];
    if (firstWin) { const b = Math.round(base * 0.5); lines.push(['FIRST WIN ON THIS TRACK', '+' + fmtMoney(b)]); total += b; }
    const clean = this.vehicle.hp / this.vehicle.p.hpPool;
    if (!this.me.dnf && clean > 0.9) { const b = Math.round(base * 0.08); lines.push(['CLEAN RACE', '+' + fmtMoney(b)]); total += b; }
    if (this.me.bestLap < Infinity && this.track.loop) lines.push(['BEST LAP', fmtTime(this.me.bestLap)]);
    sv.cash += total; sv.totalEarned += total;
    sv.races = (sv.races || 0) + 1;
    sv.wins = sv.wins || {}; sv.podiums = sv.podiums || {};
    if (myPos === 1 && !this.me.dnf) sv.wins[this.map.id] = (sv.wins[this.map.id] || 0) + 1;
    if (myPos <= 3 && !this.me.dnf) sv.podiums[this.map.id] = Math.max(sv.podiums[this.map.id] || 9, myPos) && Math.min(sv.podiums[this.map.id] || 9, myPos);
    sv.bestLaps = sv.bestLaps || {};
    if (this.me.bestLap < (sv.bestLaps[this.map.id] || Infinity)) sv.bestLaps[this.map.id] = this.me.bestLap;
    const gift = g.checkFreeCar ? g.checkFreeCar() : null;
    g.save.save(); g.save.flush();
    g.ui.raceResults({
      title: this.me.dnf ? 'DID NOT FINISH' : myPos === 1 ? 'VICTORY' : `P${myPos}`,
      map: this.map,
      rows: rows.map((r, i) => ({ pos: i + 1, name: r.e.name, car: r.e.car.name, me: r.e.isPlayer, color: r.e.color, time: r.t === Infinity ? 'DNF' : (r.est ? '~' : '') + fmtTime(r.t), best: fmtTime(r.e.bestLap) })),
      lines, total, gift, online: !!(this.cfg && this.cfg.net),
    });
    g.ui.show('hud', false); g.ui.show('touch', false);
  }

  // ------------------------------------------------------------------ no mountain-run extras
  updatePickups() {}
  regionCheck() {}
  hazards() {}
  bonuses() {}

  stop() {
    this.clearField();
    document.body.classList.remove('race-mode');
    if (this.cfg && this.cfg.net) this.cfg.net.detach();
    super.stop();
  }
}

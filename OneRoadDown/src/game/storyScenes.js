// Story cutscene scripts. Each builder gets the story controller and a fresh Cutscene,
// sets up its stage (a race map's world or the workshop), places actors and authors
// the timeline. Dialogue text lives in data/story.js (SCENES).
import * as THREE from 'three';
import { Person } from './people.js';
import { CarModel } from '../models/carModel.js';
import { Vehicle } from '../physics/vehicle.js';
import { computeStats, defaultLevels } from './stats.js';
import { aiDrive } from './ai.js';
import { carById } from '../data/cars.js';
import { mapById } from '../data/maps.js';
import { SCENES, PEOPLE, eventById } from '../data/story.js';
import { carState } from '../core/save.js';
import { clamp } from '../core/util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lineDur = (text) => clamp(1.7 + text.length * 0.052, 2.4, 5.2);

// ------------------------------------------------------------------ stages
function lineText(S, sceneId, key) {
  const l = SCENES[sceneId].lines[key];
  return [l[0], l[1].replace(/\{NAME\}/g, S.driverName())];
}

// the workshop at night: the outside light behind the door and window goes dark blue
export function garageStage(S, cs, { carId, level, night = true, paint } = {}) {
  const g = S.g, gar = g.garage, sv = g.save.data;
  gar.setMode('workshop');
  gar.setLevel(level || sv.garageLevel || 1);
  gar.doorTarget = 0; gar.door = 0;
  gar.focus = 'story'; gar.hoodT = 0; // no turntable spin, no hood
  const car = carById(carId);
  const own = sv.owned.includes(car.id);
  const st = own ? carState(sv, car.id) : null;
  const pf = st ? g.paintFor(car, st) : { color: paint ?? car.model.paint, finish: car.model.sport ? 'metallic' : 'solid' };
  const model = gar.showCar(car, { levels: st ? st.levels : {}, tire: st ? st.tire : 'street', paint: pf.color, finish: pf.finish });
  model.group.rotation.y = 0.5;
  const tinted = [];
  if (night && gar.room) {
    gar.room.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const m = o.material;
      if (m.isMeshBasicMaterial && m.blending === THREE.AdditiveBlending) { tinted.push([o, 'vis', o.visible]); o.visible = false; return; }
      if (m.isMeshBasicMaterial && m.color && m.color.getHex() > 0x909090) { tinted.push([m, 'col', m.color.getHex()]); m.color.setHex(0x101a2c); }
    });
  }
  cs.cleanup.push(() => {
    for (const [o, k, v] of tinted) { if (k === 'vis') o.visible = v; else o.color.setHex(v); }
    gar.focus = null;
  });
  return { model, scene: gar.scene, ground: () => 0 };
}

// a race map's world; P(s, d, h) gives a point above the road
export function worldStage(S, cs, mapId, s0 = 0) {
  const g = S.g;
  const map = mapById(mapId);
  if (g.mapId !== map.id) g.loadTrack(map);
  if (g.menuCar) g.menuCar.group.visible = false;
  const t = g.track;
  g.world.update(s0, 40);
  const P = (s, d = 0, h = 0) => { const p = t.posAt(t.wrapS ? t.wrapS(s) : s, d); return V(p.x, Math.max(p.y, t.height(p.x, p.z)) + h, p.z); };
  const hd = (s) => t.posAt(t.wrapS ? t.wrapS(s) : s, 0).hd;
  const ground = (x, z) => t.height(x, z);
  return { t, P, hd, ground, scene: g.worldScene };
}

// a parked car on the road (s, d), nose along the road (+ yaw offset)
function parkCar(S, cs, W, carId, s, d, yaw = 0, paint) {
  const car = carById(carId);
  const m = new CarModel(car, { levels: {}, tire: 'perf', paint: paint ?? car.model.paint, finish: 'metallic' });
  const p = W.t.posAt(W.t.wrapS(s), d);
  const y = W.t.height(p.x, p.z);
  m.group.position.set(p.x, y - m.dims.yG - 0.02, p.z);
  m.group.rotation.y = p.hd + yaw;
  m.setStaticWheels(0.15);
  m.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  S.g.worldScene.add(m.group);
  cs.cleanup.push(() => { S.g.worldScene.remove(m.group); m.dispose(); });
  return m;
}

// AI traffic: a few cars lapping the circuit under the racing AI
function traffic(S, cs, W, list) {
  const g = S.g, t = W.t;
  const field = list.map((o, i) => {
    const car = carById(o.car);
    const levels = defaultLevels();
    for (const k of Object.keys(car.caps)) levels[k] = Math.round(car.caps[k] * 0.6);
    const st = computeStats(car, levels, 'perf');
    const model = new CarModel(car, { levels, tire: 'perf', stats: st, paint: o.paint ?? car.model.paint, finish: 'metallic' });
    for (const n of ['interior', 'dash', 'cabin', 'seats', 'steering', 'gauges']) if (model.parts[n]) model.parts[n].visible = false;
    model.bake();
    model.group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.worldScene.add(model.group);
    const v = new Vehicle(t, car, st);
    v.assist = 1;
    v.reset(t.wrapS(o.s), o.d);
    v.p = { ...v.p, fuelUse: 0 };
    const f = v.getForward(V());
    v.vel.x = f.x * (o.v || 20); v.vel.z = f.z * (o.v || 20);
    return { isBot: true, vehicle: v, model, car, stats: st, lane: o.d, laneT: 0, skill: 0.85 + i * 0.03, progress: o.s, flipT: 0, stuckT: 0, lastS: o.s };
  });
  const step = (dt) => {
    for (const e of field) { e.progress = e.vehicle.lastQuery.s; aiDrive(e, field, t, dt, { cruise: 0.92, go: true }); }
    for (const e of field) e.vehicle.update(dt);
    for (const e of field) {
      const v = e.vehicle, m = e.model;
      m.group.position.set(v.pos.x, v.pos.y, v.pos.z);
      m.group.quaternion.set(v.q.x, v.q.y, v.q.z, v.q.w);
      m.updateFromVehicle(v, dt);
    }
  };
  for (let i = 0; i < 45; i++) step(1 / 30); // settle on the springs, get rolling
  cs.every((dt) => step(Math.min(dt, 1 / 20)));
  cs.cleanup.push(() => { for (const e of field) { g.worldScene.remove(e.model.group); e.model.dispose(); } });
  return field;
}

function person(S, cs, stage, id, x, y, z, yaw, anim = 'idle') {
  const p = new Person(id, { anim });
  p.place(x, y, z, yaw);
  stage.scene.add(p.group);
  cs.actor(p);
  return p;
}

// camera framing helpers around a person
const fwdOf = (p) => V(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));
const rightOf = (p) => { const f = fwdOf(p); return V(-f.z, 0, f.x); };
function closeUp(p, dist = 1.5, side = 0.42, up = -0.04) {
  const h = p.headPos(), f = fwdOf(p), r = rightOf(p);
  return { pos: h.clone().addScaledVector(f, dist).addScaledVector(r, side).add(V(0, up, 0)), target: h.clone().addScaledVector(r, side * 0.18).add(V(0, -0.05, 0)) };
}

// a run of dialogue lines; each speaker gets a slow push-in close-up and the talk clip
function dialogue(S, cs, stage, t0, sceneId, keys, cast, o = {}) {
  let t = t0;
  for (const key of keys) {
    const [who, text] = lineText(S, sceneId, key);
    const d = lineDur(text);
    const p = cast[who];
    cs.say(t + 0.1, d - 0.2, who, text);
    if (p) {
      const a = closeUp(p, o.dist || 1.55, (o.side || 0.42) * (o.flip && o.flip[who] ? -1 : 1));
      const b = closeUp(p, (o.dist || 1.55) - 0.22, (o.side || 0.42) * (o.flip && o.flip[who] ? -1 : 1) * 0.85);
      cs.shot(t, d, { set: stage.set, s: stage.s, from: { pos: a.pos, target: a.target, fov: 34 }, to: { pos: b.pos, target: b.target, fov: 32 }, ease: 'inOut' });
      const rest = (o.rest && o.rest[who]) || 'idle';
      cs.anim(t, p, o.gesture && o.gesture[key] ? o.gesture[key] : 'talk', 0.3);
      cs.anim(t + d - 0.25, p, rest, 0.4);
    }
    t += d;
  }
  return t;
}

// ------------------------------------------------------------------ scenes
export const SCENE_BUILDERS = {
  // PROLOGUE: dusk flight over Odaiba with traffic, then the workshop at night
  async intro(S, cs) {
    const W = worldStage(S, cs, 'jp-odaiba', 0);
    W.set = 'world';
    const t = W.t, L = t.length;
    const field = traffic(S, cs, W, [
      { car: 'stallion', s: 40, d: -2.2, paint: 0xc81e1e, v: 26 },
      { car: 'samurai', s: 26, d: 2.0, paint: 0xe9e7e1, v: 24 },
      { car: 'falke', s: 12, d: -1.0, paint: 0x1e5ac8, v: 23 },
      { car: 'wasp', s: 0, d: 2.4, paint: 0xf0c020, v: 22 },
    ]);
    const lead = field[0].vehicle, second = field[1].vehicle;
    cs.cue(0.05, () => S.ui.blackout(false));
    const sOf = (v) => v.lastQuery.s;
    // 1. high aerial drift along the bay, looking down the road ahead
    cs.shot(0, 5.4, { set: 'world', s: (tt) => sOf(lead), ease: 'linear',
      from: { pos: () => W.P(sOf(lead) - 60, -70, 58), target: () => W.P(sOf(lead) + 90, 0, 0), fov: 50 },
      to: { pos: () => W.P(sOf(lead) - 20, -48, 38), target: () => W.P(sOf(lead) + 40, 0, 0), fov: 46 } });
    // 2. tracking alongside the pack
    cs.shot(5.4, 4.2, { set: 'world', s: () => sOf(second), ease: 'linear',
      from: { pos: () => { const v = second, f = v.getForward(V()); return V(v.pos.x - f.z * 5.5 - f.x * 3, v.pos.y + 1.4, v.pos.z + f.x * 5.5 - f.z * 3); }, target: () => V(second.pos.x, second.pos.y + 0.6, second.pos.z), fov: 44 },
      to: { pos: () => { const v = second, f = v.getForward(V()); return V(v.pos.x - f.z * 5 + f.x * 2, v.pos.y + 1.1, v.pos.z + f.x * 5 + f.z * 2); }, target: () => V(lead.pos.x, lead.pos.y + 0.6, lead.pos.z), fov: 40 } });
    // 3. low, trackside: the cars sweep past
    let pass = null;
    cs.cue(9.55, () => { pass = W.P(sOf(lead) + 70, t.width[0] / 2 + 3.2, 0.9); });
    cs.shot(9.6, 4.3, { set: 'world', s: () => sOf(lead), ease: 'linear',
      from: { pos: () => pass || W.P(0, 8, 1), target: () => V(lead.pos.x, lead.pos.y + 0.5, lead.pos.z), fov: 38 },
      to: { pos: () => pass || W.P(0, 8, 1), target: () => V(lead.pos.x, lead.pos.y + 0.5, lead.pos.z), fov: 30 } });
    cs.sound(0.2, 'music:menu');
    cs.sound(0.3, 'whoosh', 0.6);
    cs.sound(5.4, 'whoosh', 0.5);
    cs.sound(9.6, 'whoosh', 0.7);
    cs.title(1.4, 6.2, 'FROM NOTHING TO LEGEND', 'A STORY IN SIX CHAPTERS');
    let tt = 1.2;
    for (const k of ['vo1', 'vo2']) { const [who, text] = lineText(S, 'intro', k); cs.say(tt, 3.6, who, text); tt += 6.2; }
    cs.fade(13.4, true);
    // --- the workshop ---------------------------------------------------------------
    const T = 14.2;
    let G = null, mara = null;
    cs.cue(T - 0.05, () => {
      for (const e of field) e.model.group.visible = false;
      G = garageStage(S, cs, { carId: 'rusty', level: 1, night: true });
      G.set = 'garage';
      mara = person(S, cs, G, 'mara', -1.9, 0, 2.1, 0.35, 'armscross');
      cast.mara = mara;
      S.ui.blackout(false);
    });
    const cast = {};
    const carC = V(0, 0.6, 0);
    // establishing: from the door, slow push in on the car under the bulbs
    cs.shot(T, 4.4, { set: 'garage', ease: 'out', from: { pos: V(2.4, 1.9, 6.6), target: V(-0.6, 0.9, 0.6), fov: 46 }, to: { pos: V(1.6, 1.65, 5.2), target: V(-0.9, 1.0, 1.0), fov: 42 } });
    cs.sound(T, 'music:garage');
    cs.cue(T + 1.2, () => { if (mara) { mara.face(1.6, 5.2); mara.play('wave', 0.4); } });
    const g1 = lineText(S, 'intro', 'g1');
    cs.say(T + 1.4, 3.0, g1[0], g1[1]);
    cs.cue(T + 4.2, () => mara && mara.play('idle', 0.4));
    // Mara talks (close-ups), the car in between
    const later = T + 4.4;
    const cutDialogue = (t0, key, gesture = 'talk') => {
      const [who, text] = lineText(S, 'intro', key);
      const d = lineDur(text);
      cs.say(t0 + 0.1, d - 0.2, who, text);
      cs.cue(t0, () => mara && mara.play(gesture, 0.3));
      cs.cue(t0 + d - 0.3, () => mara && mara.play('idle', 0.4));
      return d;
    };
    const head = () => (mara ? mara.headPos() : V(-1.9, 1.62, 2.1));
    const marafwd = () => (mara ? fwdOf(mara) : V(0.4, 0, 0.9));
    const marart = () => (mara ? rightOf(mara) : V(0.9, 0, -0.4));
    const cu = (dist, side, up = -0.03) => () => head().addScaledVector(marafwd(), dist).addScaledVector(marart(), side).add(V(0, up, 0));
    const cuT = () => head().add(V(0, -0.06, 0)).addScaledVector(marart(), 0.08);
    let d = cutDialogue(later, 'g2', 'talk');
    cs.shot(later, d, { set: 'garage', ease: 'inOut', from: { pos: cu(1.75, 0.5), target: cuT, fov: 34 }, to: { pos: cu(1.45, 0.38), target: cuT, fov: 32 } });
    // orbit the old car while she talks about it
    const t3 = later + d;
    d = cutDialogue(t3, 'g3', 'armscross');
    cs.shot(t3, d + 0.4, { set: 'garage', ease: 'inOut', from: { pos: V(), target: carC, fov: 40 }, to: { pos: V(), target: carC, fov: 38 }, orbit: { center: carC, r: 5.0, a0: 1.9, a1: 3.4, h0: 1.5, h1: 1.1 } });
    cs.sound(t3 + 0.6, 'ratchet', 4);
    const t4 = t3 + d + 0.4;
    d = cutDialogue(t4, 'g4', 'point');
    // two-shot: Mara and the car
    cs.shot(t4, d, { set: 'garage', ease: 'inOut', from: { pos: V(2.6, 1.5, 4.6), target: V(-1.0, 1.1, 1.2), fov: 40 }, to: { pos: V(2.1, 1.45, 4.0), target: V(-1.2, 1.15, 1.4), fov: 38 } });
    const t5 = t4 + d;
    d = cutDialogue(t5, 'g5', 'talk');
    cs.shot(t5, d + 1.4, { set: 'garage', ease: 'inOut', from: { pos: cu(1.6, -0.45), target: cuT, fov: 34 }, to: { pos: cu(1.35, -0.35, 0), target: cuT, fov: 31 } });
    cs.sound(t5 + d - 0.2, 'starter', null);
    cs.sound(t5 + d + 0.6, 'burst', { freq: 150, type: 'lowpass', dur: 1.2, gain: 0.35 });
    cs.fade(t5 + d + 0.9, true);
    cs.extend(t5 + d + 1.6);
  },

  // a rival steps out from behind their car on the grid
  async rival(S, cs, sceneId, rivalId, carId, mapId) {
    const W = worldStage(S, cs, mapId, 30);
    W.set = 'world';
    const t = W.t;
    const s0 = t.loop ? 26 : 90;
    W.s = s0;
    const w = t.width[Math.round(s0 / 2)] || 9;
    const car = parkCar(S, cs, W, carId, s0, -w * 0.18, 0, parseInt(PEOPLE[rivalId].color.slice(1), 16));
    const hd = W.hd(s0);
    const f = V(Math.sin(hd), 0, Math.cos(hd)), r = V(-f.z, 0, f.x);
    const cp = car.group.position.clone();
    // the rival stands at the car's front corner on the outside, the camera sits on the road ahead
    const rp = cp.clone().addScaledVector(f, 2.4).addScaledVector(r, -1.6);
    rp.y = W.ground(rp.x, rp.z);
    const camSpot = cp.clone().addScaledVector(f, 9).addScaledVector(r, 1.2);
    const riv = person(S, cs, W, rivalId === 'vanta' ? 'vanta' : rivalId, rp.x, rp.y, rp.z, 0, 'armscross');
    riv.face(camSpot.x, camSpot.z);
    const cast = { [rivalId]: riv };
    const keys = Object.keys(SCENES[sceneId].lines);
    let mara = null;
    if (keys.some((k) => SCENES[sceneId].lines[k][0] === 'mara')) {
      const mp = cp.clone().addScaledVector(f, 5.2).addScaledVector(r, 2.6);
      mp.y = W.ground(mp.x, mp.z);
      mara = person(S, cs, W, 'mara', mp.x, mp.y, mp.z, 0, 'idle');
      mara.face(rp.x, rp.z);
      cast.mara = mara;
    }
    cs.cue(0.05, () => S.ui.blackout(false));
    const P = PEOPLE[rivalId];
    cs.title(0.5, 3.6, P.name, P.trait.toUpperCase() + ' · ' + carById(carId).name);
    // low sweep along the car
    const c = cp.clone().add(V(0, 0.5, 0));
    cs.shot(0, 3.8, { set: 'world', s: s0, ease: 'inOut', from: { pos: c.clone().addScaledVector(f, 4.2).addScaledVector(r, 2.4).add(V(0, -0.15, 0)), target: c, fov: 40 },
      to: { pos: c.clone().addScaledVector(f, 1.2).addScaledVector(r, 4.4).add(V(0, 0.2, 0)), target: c.clone().addScaledVector(f, -0.6), fov: 36 } });
    cs.sound(0.1, 'whoosh', 0.6);
    cs.sound(0.4, 'starter', null);
    // reveal the driver
    cs.shot(3.8, 2.4, { set: 'world', s: s0, ease: 'out', from: { pos: rp.clone().addScaledVector(fwdOf(riv), 4.5).add(V(0.6, 1.2, 0)), target: riv.headPos().add(V(0, -0.4, 0)), fov: 40 },
      to: { pos: rp.clone().addScaledVector(fwdOf(riv), 3.0).add(V(0.3, 1.45, 0)), target: riv.headPos().add(V(0, -0.2, 0)), fov: 38 } });
    const end = dialogue(S, cs, W, 6.2, sceneId, keys, cast, { rest: { [rivalId]: 'armscross' }, gesture: { k3: 'talk', v2: 'talk', l2: 'armscross', e2: 'wave' } });
    cs.fade(end + 0.2, true);
    cs.extend(end + 0.8);
  },

  // a talk in the workshop (chapter openers / closers): establishing shot, then close-ups
  async workshop(S, cs, sceneId, castIds, o = {}) {
    const sv = S.g.save.data;
    const carId = o.car || sv.selected || 'rusty';
    const G = garageStage(S, cs, { carId, night: o.night !== false });
    G.set = 'garage';
    const cast = {};
    const spots = [[-2.0, 2.2], [2.1, 2.4], [-2.9, 0.6], [2.9, 0.8]];
    castIds.forEach((id, i) => {
      const [x, z] = spots[i];
      const p = person(S, cs, G, id, x, 0, z, 0, i === 0 ? 'idle' : 'armscross');
      p.face(0, 6);
      p.group.rotation.y += (x < 0 ? 0.25 : -0.25);
      cast[id] = p;
    });
    cs.cue(0.05, () => S.ui.blackout(false));
    const sc = SCENES[sceneId];
    cs.title(0.6, 3.4, sc.title.split(' · ')[0], sc.title.split(' · ')[1] || '');
    cs.shot(0, 4.0, { set: 'garage', ease: 'out', from: { pos: V(0.4, 2.6, 6.6), target: V(0, 0.9, 0.6), fov: 46 }, to: { pos: V(0.2, 1.9, 5.4), target: V(0, 1.0, 1.0), fov: 42 } });
    cs.sound(0.2, 'music:garage');
    if (o.cheer) { for (const id of castIds) cs.anim(0.3, cast[id], 'cheer'); cs.sound(0.4, 'cheer', 0.5); for (const id of castIds) cs.anim(3.6, cast[id], 'idle'); }
    const keys = Object.keys(sc.lines);
    let t = 4.0;
    const giftKey = o.giftKey;
    for (const key of keys) {
      if (key === giftKey && o.gift) {
        // gift reveal: the new car on the floor, slow orbit
        const gid = o.gift;
        cs.cue(t - 0.02, () => { const gm = garageStage(S, cs, { carId: gid, night: o.night !== false, paint: carById(gid).model.paint }); });
        const [who, text] = lineText(S, sceneId, key);
        const d = lineDur(text) + 1.2;
        cs.say(t + 0.1, d - 0.2, who, text);
        cs.shot(t, d, { set: 'garage', ease: 'inOut', from: { pos: V(), target: V(0, 0.6, 0), fov: 40 }, to: { pos: V(), target: V(0, 0.6, 0), fov: 38 }, orbit: { center: V(0, 0.6, 0), r: 5.2, a0: 0.6, a1: 1.9, h0: 1.6, h1: 1.2 } });
        cs.sound(t + 0.2, 'fanfare');
        cs.title(t + 0.4, 3.2, carById(gid).name, 'NEW CAR · IN YOUR GARAGE');
        t += d;
        continue;
      }
      t = dialogue(S, cs, G, t, sceneId, [key], cast, { rest: Object.fromEntries(castIds.map((id) => [id, id === castIds[0] ? 'idle' : 'armscross'])) });
    }
    cs.fade(t + 0.2, true);
    cs.extend(t + 0.8);
  },

  // on a map's grid: people beside the player's car (chapter openers on location)
  async onLocation(S, cs, sceneId, mapId, castIds, o = {}) {
    const W = worldStage(S, cs, mapId, 30);
    W.set = 'world';
    const t = W.t, s0 = t.loop ? 30 : 95;
    W.s = s0;
    const sv = S.g.save.data;
    const carId = sv.selected || 'rusty';
    const car = parkCar(S, cs, W, carId, s0, 0, 0.5);
    const hd = W.hd(s0), f = V(Math.sin(hd), 0, Math.cos(hd)), r = V(-f.z, 0, f.x);
    const cp = car.group.position.clone();
    const camSpot = cp.clone().addScaledVector(f, 7).addScaledVector(r, -2.5);
    const cast = {};
    castIds.forEach((id, i) => {
      const p0 = cp.clone().addScaledVector(f, 2.6 + i * 0.9).addScaledVector(r, -2.0 + i * 1.7);
      p0.y = W.ground(p0.x, p0.z);
      const p = person(S, cs, W, id, p0.x, p0.y, p0.z, 0, i ? 'armscross' : 'idle');
      p.face(camSpot.x, camSpot.z);
      cast[id] = p;
    });
    cs.cue(0.05, () => S.ui.blackout(false));
    const sc = SCENES[sceneId];
    cs.title(0.8, 3.6, sc.title.split(' · ')[0], sc.title.split(' · ')[1] || '');
    // crane down from above the road onto the group
    const c = cp.clone().addScaledVector(f, 2.4).add(V(0, 1.0, 0));
    cs.shot(0, 4.6, { set: 'world', s: s0, ease: 'out', from: { pos: c.clone().addScaledVector(f, 26).addScaledVector(r, -10).add(V(0, 14, 0)), target: c, fov: 46 },
      to: { pos: camSpot.clone().add(V(0, 1.6, 0)), target: c, fov: 42 } });
    cs.sound(0.2, 'music:menu');
    cs.sound(0.3, 'whoosh', 0.5);
    if (o.cheer) { for (const id of castIds) cs.anim(0.5, cast[id], 'cheer'); cs.sound(0.6, 'cheer', 0.8); for (const id of castIds) cs.anim(4.2, cast[id], 'idle'); }
    const keys = Object.keys(sc.lines);
    const end = dialogue(S, cs, W, 4.6, sceneId, keys, cast, { rest: Object.fromEntries(castIds.map((id, i) => [id, i ? 'armscross' : 'idle'])) });
    if (o.finale) {
      // pull back and up into the sunset
      cs.shot(end, 6.5, { set: 'world', s: s0, ease: 'inOut', from: { pos: camSpot.clone().add(V(0, 1.8, 0)), target: c, fov: 42 }, to: { pos: c.clone().addScaledVector(f, -30).addScaledVector(r, -16).add(V(0, 22, 0)), target: c.clone().addScaledVector(f, 30), fov: 50 } });
      for (const id of castIds) cs.anim(end + 0.1, cast[id], 'cheer');
      cs.sound(end + 0.2, 'fanfare');
      cs.sound(end + 0.4, 'cheer', 1);
      cs.title(end + 1.0, 5.2, 'LEGEND', 'FROM NOTHING · ' + S.driverName());
      cs.fade(end + 6.2, true);
      cs.extend(end + 6.8);
      return;
    }
    cs.fade(end + 0.2, true);
    cs.extend(end + 0.8);
  },
};

// sceneId → builder call
export function buildScene(S, cs, id) {
  const B = SCENE_BUILDERS;
  switch (id) {
    case 'intro': return B.intro(S, cs);
    case 'rival-kenji': return B.rival(S, cs, id, 'kenji', 'samurai', 'jp-hakone');
    case 'rival-kenji2': return B.rival(S, cs, id, 'kenji', 'ronin', 'jp-odaiba');
    case 'rival-lukas': return B.rival(S, cs, id, 'lukas', 'bauhaus', 'de-hockenring');
    case 'rival-elise': return B.rival(S, cs, id, 'elise', 'elfer', 'fr-riviera');
    case 'rival-vanta': return B.rival(S, cs, id, 'vanta', 'zenith', 'ch-summit');
    case 'vanta-reveal': return B.rival(S, cs, id, 'vanta', 'zenith', 'uk-highlands');
    case 'c1-close': return B.workshop(S, cs, id, ['mara'], { cheer: true, gift: 'wasp', giftKey: 'm2' });
    case 'c2-open': return B.workshop(S, cs, id, ['iris', 'mara'], { night: false });
    case 'c2-close': return B.workshop(S, cs, id, ['kenji', 'iris', 'mara'], { cheer: false, gift: 'kestrel', giftKey: 'i2', night: false });
    case 'c3-open': return B.onLocation(S, cs, id, 'de-hockenring', ['mara']);
    case 'c3-close': return B.workshop(S, cs, id, ['lukas', 'mara'], { gift: 'kaiju', giftKey: 'm1' });
    case 'c4-open': return B.onLocation(S, cs, id, 'fr-riviera', ['iris', 'mara']);
    case 'c4-close': return B.workshop(S, cs, id, ['elise', 'mara'], { gift: 'apex', giftKey: 'm1', night: false });
    case 'c5-open': return B.workshop(S, cs, id, ['mara'], {});
    case 'c5-close': return B.onLocation(S, cs, id, 'uk-highlands', ['iris', 'mara'], { cheer: true });
    case 'c6-open': return B.onLocation(S, cs, id, 'fr-sarthe', ['mara']);
    case 'finale': return B.onLocation(S, cs, id, 'jp-hakone', ['vanta', 'mara', 'kenji', 'elise', 'lukas'].slice(0, 4), { finale: true });
    default: return null;
  }
}

// which event a scene belongs to (for "already seen" bookkeeping and the scenes list)
export const sceneEvent = (id) => eventById(id);

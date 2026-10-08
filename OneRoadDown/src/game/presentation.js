// Race presentation: the cinematic intro before the countdown, the finish-line camera and
// the podium. Works on whatever entrants the race holds (bots offline, real drivers online),
// so both modes get the same show.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { COUNTRY_CODES } from '../data/maps.js';

const V = () => new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);

export const INTRO_SECONDS = 8.4;

export class Presentation {
  constructor(race) {
    this.r = race;
    this.mode = null; // 'intro' | 'finish' | 'podium'
    this.t = 0;
    this.pos = V(); this.look = V();
  }

  get active() { return !!this.mode; }

  // ------------------------------------------------------------------ intro
  // `seconds` lets an online race fit the intro into the time left before the synced start
  startIntro(seconds = INTRO_SECONDS) {
    const r = this.r, t = r.track;
    const scale = clamp(seconds / INTRO_SECONDS, 0.35, 1);
    const s0 = r.startS;
    const sd = this.outsideSide();
    const me = () => r.vehicle;
    const field = r.field;
    const unwrap = (e) => (t.loop && e.lastS > t.length * 0.5 ? e.lastS - t.length : e.lastS);
    const grid0 = Math.min(...field.map(unwrap));
    const P = (s, d, h) => { const p = t.posAt(s, d); return V().set(p.x, Math.max(p.y, t.height(p.x, p.z)) + h, p.z); };
    this.shots = [
      // 1. crane over the start: drift down the straight towards the grid
      { dur: 3.0 * scale, cam: (k) => [P(s0 + 70 - 40 * k, -sd * (18 + 6 * (1 - k)), 16 - 8 * k), P(s0 - 8, 0, 1)] },
      // 2. low hero shot of the player car, sweeping across its nose
      { dur: 2.7 * scale, cam: (k) => {
        const v = me(), f = v.getForward(V()), rt = V().set(f.z, 0, -f.x), p = v.pos;
        const a = lerp(-0.9, 0.9, ease(k));
        const pos = V().set(p.x + f.x * 4.6 * Math.cos(a) + rt.x * 4.6 * Math.sin(a), p.y - 0.15, p.z + f.z * 4.6 * Math.cos(a) + rt.z * 4.6 * Math.sin(a));
        return [pos, V().set(p.x, p.y + 0.15, p.z)];
      } },
      // 3. tracking shot along the grid at bumper height
      { dur: 2.7 * scale, cam: (k) => [P(lerp(grid0 - 4, s0 + 2, ease(k)), sd * (t.width[0] / 2 + 2.6), 1.0), P(lerp(grid0 + 6, s0 + 14, ease(k)), 0, 0.6)] },
    ];
    this.mode = 'intro'; this.t = 0; this.shot = -1;
    this.total = this.shots.reduce((a, b) => a + b.dur, 0);
    const m = r.map, km = t.length / 1000;
    r.g.ui.raceIntro({
      cc: COUNTRY_CODES[m.country] || '', country: m.country || '', region: m.region || '', name: m.name,
      line: (t.loop ? r.laps + ' LAPS · ' : 'SPRINT · ') + km.toFixed(2) + ' KM · ' + field.length + ' DRIVERS',
      grid: [...field].sort((a, b) => unwrap(b) - unwrap(a)).map((e, i) => ({ pos: i + 1, name: e.name, car: e.car.name, me: !!e.isPlayer, color: e.color })),
      skippable: !(r.cfg && r.cfg.net),
    });
    audio()?.whoosh?.(0.5);
  }

  outsideSide() {
    const t = this.r.track;
    if (!t.loop) return 1;
    let ks = 0; for (let j = 0; j < t.N; j += 4) ks += t.k[j];
    return ks > 0 ? 1 : -1;
  }

  skip() {
    if (this.mode !== 'intro' || (this.r.cfg && this.r.cfg.net)) return;
    this.endIntro();
    this.r.startCountdownNow && this.r.startCountdownNow();
  }

  endIntro() {
    if (this.mode !== 'intro') return;
    this.mode = null;
    this.r.g.ui.raceIntroHide();
    this.r.camIntro = 0;
    this.r.placeIntroCamera();
    if (!(this.r.cfg && this.r.cfg.net)) this.r.startCountdownNow && this.r.startCountdownNow();
  }

  // ------------------------------------------------------------------ finish
  // a trackside camera at the line watches the car cross, in slow motion
  startFinish() {
    const r = this.r, t = r.track, v = r.vehicle;
    const s = t.loop ? t.wrapS(v.lastQuery.s + 26) : Math.min(t.length - 2, v.lastQuery.s + 26);
    const sd = (v.lastQuery.d > 0 ? -1 : 1);
    const p = t.posAt(s, sd * (t.width[Math.min(t.N - 1, Math.round(s / 2))] / 2 + 4));
    this.finishCam = V().set(p.x, Math.max(p.y, t.height(p.x, p.z)) + 1.3, p.z);
    this.mode = 'finish'; this.t = 0;
    r.timeScale = 0.35;
  }

  // ------------------------------------------------------------------ podium
  // rows: [{ e, t }] in finishing order
  startPodium(rows, onDone) {
    const r = this.r, g = r.g, t = r.track;
    const top = rows.slice(0, 3).filter((x) => x.e && x.e.model);
    if (!top.length) { onDone(); return; }
    this.onDone = onDone;
    // a clear, level spot on the start/finish straight
    const s = t.loop ? t.wrapS(r.startS + 30) : Math.max(r.startS + 30, Math.min(t.length - 40, r.vehicle.lastQuery.s - 60));
    const j = Math.min(t.N - 1, Math.round(s / 2));
    const c = t.posAt(s, 0), hd = t.hd[j];
    const f = V().set(Math.sin(hd), 0, Math.cos(hd)), rt = V().set(-Math.cos(hd), 0, Math.sin(hd));
    this.pc = V().set(c.x, t.roadY(s), c.z); this.pf = f; this.pr = rt;
    const grp = (this.podium = new THREE.Group());
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.5, metalness: 0.05 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xe2a33b, roughness: 0.4, metalness: 0.3, emissive: 0x3a2508, emissiveIntensity: 0.4 });
    const slots = [[0, 0.9], [-1, 0.6], [1, 0.35]];
    this.slotCars = [];
    top.forEach((row, i) => {
      const [side, h] = slots[i];
      const off = side * 5.2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, h, 6.4), mat);
      base.position.set(this.pc.x + rt.x * off, this.pc.y + h / 2, this.pc.z + rt.z * off);
      base.rotation.y = hd; base.castShadow = base.receiveShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(4.66, 0.12, 6.46), trim);
      band.position.copy(base.position); band.position.y = this.pc.y + h - 0.06; band.rotation.y = hd;
      grp.add(base, band);
      const m = row.e.model;
      // park the car on its step, nose towards the camera side
      const y = this.pc.y + h - m.dims.yG + 0.02;
      m.group.position.set(base.position.x, y, base.position.z);
      m.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hd + Math.PI + side * 0.25);
      m.group.visible = true;
      if (m.setStaticWheels) m.setStaticWheels(0);
      this.slotCars.push({ e: row.e, pos: base.position.clone().setY(y + 0.6), place: i + 1 });
    });
    g.worldScene.add(grp);
    // everyone else leaves the stage
    for (const e of r.field) if (!top.some((x) => x.e === e) && e.model) e.model.group.visible = false;
    this.mode = 'podium'; this.t = 0; this.confT = 0;
    // engines off for the ceremony
    if (r.engine) r.engine.setRunning(false);
    for (const e of r.field) if (e.voice && e.voice.setRunning) e.voice.setRunning(false);
    r.g.ui.podium({ places: top.map((x, i) => ({ place: i + 1, name: x.e.name, car: x.e.car.name, me: !!x.e.isPlayer, time: x.label })) });
    audio()?.record?.();
  }

  endPodium() {
    if (this.mode !== 'podium') return;
    // keep the slow orbit running behind the result panel
    this.mode = 'after';
    this.r.g.ui.podiumHide();
    const done = this.onDone; this.onDone = null;
    done && done();
  }

  dispose() {
    if (this.podium) { this.r.g.worldScene.remove(this.podium); this.podium.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); this.podium = null; }
    if (this.mode === 'intro') this.r.g.ui.raceIntroHide();
    if (this.mode === 'podium') this.r.g.ui.podiumHide();
    this.mode = null;
    for (const e of this.r.field) if (e.model) e.model.group.visible = true;
  }

  // ------------------------------------------------------------------ per frame
  // returns true when it drives the camera this frame
  update(dt) {
    if (!this.mode) return false;
    const r = this.r, cam = r.g.camera;
    this.t += dt;
    if (this.mode === 'intro') {
      if (r.countdownStarted && r.cfg && r.cfg.net) { this.endIntro(); return false; }
      let acc = 0, i = 0;
      while (i < this.shots.length - 1 && this.t > acc + this.shots[i].dur) { acc += this.shots[i].dur; i++; }
      const sh = this.shots[i], k = clamp((this.t - acc) / sh.dur, 0, 1);
      if (i !== this.shot) { this.shot = i; r.g.ui.introCut && r.g.ui.introCut(); }
      const [p, l] = sh.cam(k);
      cam.position.copy(p); cam.lookAt(l);
      cam.fov = 42; cam.updateProjectionMatrix();
      if (this.t > this.total + 0.2) { this.endIntro(); return false; }
      return true;
    }
    if (this.mode === 'finish') {
      const v = r.vehicle;
      cam.position.copy(this.finishCam);
      this.look.set(v.pos.x, v.pos.y + 0.4, v.pos.z);
      cam.lookAt(this.look);
      cam.fov = lerp(48, 30, smoothstep(0, 1.4, this.t)); cam.updateProjectionMatrix();
      if (this.t > 1.6) { r.timeScale = 1; this.mode = null; }
      return true;
    }
    if (this.mode === 'podium' || this.mode === 'after') {
      // slow orbit in front of the podium
      const a = Math.sin(this.t * 0.22) * 0.55;
      const c = this.pc, f = this.pf, rt = this.pr;
      const dist = 16 - Math.min(4, this.t * 0.6);
      cam.position.set(c.x + (-f.x * Math.cos(a) + rt.x * Math.sin(a)) * dist, c.y + 3.2 + Math.sin(this.t * 0.3) * 0.4, c.z + (-f.z * Math.cos(a) + rt.z * Math.sin(a)) * dist);
      this.look.set(c.x, c.y + 1.2, c.z);
      cam.lookAt(this.look);
      cam.fov = 45; cam.updateProjectionMatrix();
      // confetti + sparks over the winners
      this.confT -= dt;
      if (this.confT <= 0 && this.slotCars.length && this.t < 14) {
        this.confT = 0.05;
        const P = r.g.particles, w = this.slotCars[0].pos;
        const cols = [[1, 0.78, 0.25], [1, 1, 1], [0.95, 0.3, 0.2], [0.3, 0.6, 1]];
        for (let n = 0; n < 6; n++) {
          const cc = cols[Math.floor(Math.random() * cols.length)];
          P.glow.emit(w.x + (Math.random() - 0.5) * 14, w.y + 7 + Math.random() * 3, w.z + (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 1.5, -1 - Math.random(), (Math.random() - 0.5) * 1.5, 3.5, 0.18, 0.14, 1, cc[0], cc[1], cc[2], 0.6, 0.6);
        }
      }
      r.g.particles.update(dt);
      if (this.mode === 'podium' && this.t > 9) this.endPodium();
      return true;
    }
    return false;
  }
}

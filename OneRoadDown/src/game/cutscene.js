// Cutscene timeline player for story mode.
//
// A cutscene is a list of timed tracks on one clock:
//   shot(t, dur, { set, from, to, ease, s, shake })  camera move; from/to = { pos, target, fov }
//                                                    (Vector3 or () => Vector3, re-evaluated per frame)
//   say(t, dur, who, text)                           subtitle with the speaker's name
//   title(t, dur, big, small)                        chapter / title card
//   anim(t, actor, clip[, fade])                     actor (story Person) changes clip
//   sound(t, name, ...args)                          audio.js cue: whoosh, cheer, starter, fanfare, music:<mode> …
//   cue(t, fn)                                       anything else, once
//   fade(t, out = true)                              fade to / from black
//   every(fn(dt, t))                                 per-frame hook (traffic AI, actor updates)
// Sets: 'world' renders game.worldScene with the environment (needs `s`, the road distance the
// sky / fog / streaming use), 'garage' renders the workshop scene.
// play() resolves { skipped } after the last track (or a skip) once the screen is black.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { clamp, lerp } from '../core/util.js';

const EASE = {
  linear: (k) => k,
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  inOut: (k) => k * k * (3 - 2 * k),
  smooth: (k) => k * k * k * (k * (k * 6 - 15) + 10),
};

const val = (x, t) => (typeof x === 'function' ? x(t) : x);

export class Cutscene {
  constructor(game, ui, o = {}) {
    this.g = game;
    this.ui = ui;            // StoryUI (subtitles, letterbox, skip)
    this.id = o.id || 'scene';
    this.subs = o.subs !== false;
    this.shots = []; this.lines = []; this.titles = []; this.cues = []; this.hooks = []; this.actors = []; this.cleanup = [];
    this.t = 0; this.duration = 0;
    this.done = false; this.skipped = false;
    this.cam = game.camera;
    this.tmpP = new THREE.Vector3(); this.tmpT = new THREE.Vector3(); this.tmpA = new THREE.Vector3(); this.tmpB = new THREE.Vector3();
    this.lastSet = null;
    this.dummyCam = new THREE.PerspectiveCamera();
  }

  // ------------------------------------------------------------------ authoring
  shot(t, dur, o) { this.shots.push({ t, dur, ...o }); this.shots.sort((a, b) => a.t - b.t); this.extend(t + dur); return this; }
  say(t, dur, who, text) { this.lines.push({ t, dur, who, text }); this.extend(t + dur); return this; }
  title(t, dur, big, small = '') { this.titles.push({ t, dur, big, small }); return this; }
  cue(t, fn) { this.cues.push({ t, fn, fired: false }); return this; }
  anim(t, actor, clip, fade = 0.35) { return this.cue(t, () => actor && actor.play(clip, fade)); }
  sound(t, name, ...args) {
    return this.cue(t, () => {
      const a = audio();
      if (!a || !a.ctx) return;
      if (name.startsWith('music:')) { a.music && a.music.setMode(name.slice(6)); return; }
      if (typeof a[name] === 'function') a[name](...args);
    });
  }
  fade(t, out = true) { return this.cue(t, () => this.ui.blackout(out)); }
  every(fn) { this.hooks.push(fn); return this; }
  actor(p) { this.actors.push(p); return p; }
  extend(t) { this.duration = Math.max(this.duration, t); }

  // ------------------------------------------------------------------ playback
  play() {
    this.t = 0; this.done = false;
    this.ui.cineOn(true, () => this.skip());
    return new Promise((res) => { this.resolve = res; });
  }

  skip() {
    if (this.done || this.skipping) return;
    this.skipping = true;
    this.skipped = true;
    audio()?.ui('click');
    this.finish();
  }

  async finish() {
    if (this.done) return;
    this.done = true;
    this.ui.say(null);
    this.ui.titleCard(null);
    await this.ui.blackout(true);
    this.ui.cineOn(false);
    const r = this.resolve; this.resolve = null;
    r && r({ skipped: this.skipped });
  }

  currentShot() {
    let cur = this.shots[0];
    for (const s of this.shots) if (this.t >= s.t) cur = s;
    return cur;
  }

  // returns the set being rendered
  update(dt) {
    if (!this.done) this.t += dt;
    const t = this.t;
    for (const c of this.cues) if (!c.fired && t >= c.t) { c.fired = true; try { c.fn(); } catch (e) { console.error('[cutscene] cue', e); } }
    for (const h of this.hooks) h(dt, t);
    for (const a of this.actors) a.update(dt);
    // subtitles + title cards
    let line = null;
    if (this.subs) for (const l of this.lines) if (t >= l.t && t < l.t + l.dur) line = l;
    if (line !== this.curLine) { this.curLine = line; this.ui.say(line); }
    let tc = null;
    for (const c of this.titles) if (t >= c.t && t < c.t + c.dur) tc = c;
    if (tc !== this.curTitle) { this.curTitle = tc; this.ui.titleCard(tc); }
    // camera
    const sh = this.currentShot();
    if (sh) {
      const k = clamp((t - sh.t) / sh.dur, 0, 1);
      const e = (EASE[sh.ease] || EASE.inOut)(k);
      const from = sh.from, to = sh.to || sh.from;
      const p0 = val(from.pos, t), p1 = val(to.pos, t), t0 = val(from.target, t), t1 = val(to.target, t);
      this.tmpP.lerpVectors(p0, p1, e);
      this.tmpT.lerpVectors(t0, t1, e);
      if (sh.orbit) {
        // orbit: angle sweeps around the target at a fixed radius / height
        const o = sh.orbit, a = lerp(o.a0, o.a1, e), c = val(o.center, t);
        this.tmpP.set(c.x + Math.sin(a) * o.r, c.y + lerp(o.h0 ?? o.h, o.h1 ?? o.h, e), c.z + Math.cos(a) * o.r);
        this.tmpT.copy(c);
      }
      if (sh.shake) { this.tmpP.x += (Math.random() - 0.5) * sh.shake; this.tmpP.y += (Math.random() - 0.5) * sh.shake; }
      this.cam.position.copy(this.tmpP);
      this.cam.lookAt(this.tmpT);
      this.cam.fov = lerp(from.fov || 45, to.fov || from.fov || 45, e);
      this.cam.updateProjectionMatrix();
      if (sh.set !== this.lastSet) { this.lastSet = sh.set; }
    }
    if (!this.done && t >= this.duration) this.finish();
    return sh ? sh : null;
  }

  // draw the current frame (called by the story controller)
  render(dt) {
    const g = this.g, sh = this.update(dt);
    const set = sh ? sh.set : 'world';
    if (set === 'garage') {
      // the workshop runs its own lights / dust / door; its camera logic goes to a dummy
      g.garage.update(dt, this.dummyCam);
      audio()?.ambience?.update(dt, { room: 1, wind: 0.05 });
      audio()?.setReverb(0.25);
      g.post.enabled = g.quality !== 'low';
      g.post.render(g.garage.scene, this.cam, { bloom: 0.38, warm: 0.3, vig: 0.3, contrast: 1.04, sat: 1.0 });
      return;
    }
    const s = sh && sh.s !== undefined ? val(sh.s, this.t) : 0;
    const track = g.track;
    g.world.update(s, 1);
    g.env.probeHide[0] = null;
    g.env.update(dt, track, s, this.cam, this.cam.position, 0);
    g.world.update2(dt, this.cam.position, g.env.look);
    if (audio()?.ambience) audio().ambience.update(dt, { wind: 0.4, birds: 0.5, trees: 0.5 });
    audio()?.setReverb(0);
    g.post.enabled = g.quality !== 'low';
    g.post.render(g.worldScene, this.cam, g.postLook ? g.postLook(g.env.look) : null);
  }

  dispose() {
    for (const a of this.actors) a.dispose();
    this.actors = [];
    this.ui.say(null); this.ui.titleCard(null);
  }
}

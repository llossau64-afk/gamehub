// STORY MODE controller: "FROM NOTHING TO LEGEND".
//
// Owns the story screen (game.state = 'story'), plays cutscenes, runs the interactive
// tutorial and turns ordinary races into story events. It hooks into the existing game
// without editing it:
//   * Race.prototype.pickOpponents   -> the event's rival cars join the field
//   * Presentation.prototype.startIntro / startPodium -> rival names / colours, result evaluation
//   * game.openSettings              -> two extra rows (subtitles, story hints)
//   * menu + first-start screen      -> a STORY MODE button each (injected DOM)
// main.js only constructs it and calls story.update(dt) at the top of Game.update; when
// that returns true the story drew the frame itself.
//
// Save: sv.story (see storyState). Rewards, gifts and chapter progress are written the
// moment a race result is evaluated, before any cutscene, so skipping never loses progress.
import * as THREE from 'three';
import { Race } from './race.js';
import { Presentation } from './presentation.js';
import { Cutscene } from './cutscene.js';
import { loadPeople, Person, peopleReady } from './people.js';
import { buildScene, garageStage } from './storyScenes.js';
import { StoryUI } from '../ui/story.js';
import { CHAPTERS, ALL_EVENTS, eventById, chapterById, PEOPLE, SCENES, CLASSES, classOf, classIndex, levelOf } from '../data/story.js';
import { carById } from '../data/cars.js';
import { mapById, COUNTRY_CODES } from '../data/maps.js';
import { computeStats, maxStats, defaultLevels } from './stats.js';
import { carState } from '../core/save.js';
import { audio } from '../audio/audio.js';
import { clamp, fmtMoney } from '../core/util.js';

const RULES = {
  rival: { short: 'BEAT RIVAL', long: 'FINISH AHEAD OF YOUR RIVAL' },
  clean: { short: 'CLEAN', long: 'FINISH WITH 70 % CONDITION OR MORE' },
};

// sv.story, created / repaired on demand (old saves have none: a fresh story)
export function storyState(sv) {
  // repaired in place: callers keep references to the same object
  if (!sv.story || typeof sv.story !== 'object' || Array.isArray(sv.story)) sv.story = {};
  const st = sv.story;
  const def = { chapter: 1, skippedTutorial: false, tutorialDone: false, xp: 0, complete: false };
  for (const k in def) if (st[k] === undefined) st[k] = def[k];
  st.chapter = clamp((st.chapter | 0) || 1, 1, CHAPTERS.length);
  for (const k of ['done', 'seen', 'gifts']) if (!st[k] || typeof st[k] !== 'object') st[k] = {};
  if (!Array.isArray(st.pending)) st.pending = [];
  if (st.pending.some((id) => !SCENES[id])) st.pending = st.pending.filter((id) => SCENES[id]);
  if (!Number.isFinite(st.xp)) st.xp = 0;
  return st;
}

export class StoryMode {
  constructor(game) {
    this.g = game;
    this.ui = new StoryUI(game.ui);
    this.ui.people = PEOPLE;
    this.mode = null;       // 'screen' | 'cine' | null (transition)
    this.ctx = null;        // the story race in progress: { event | tutorial, map }
    this.cine = null;
    this.bg = null;
    this.busy = false;
    this.time = 0;
    storyState(game.save.data);
    this.wireUI();
    this.installHooks();
    this.injectButtons();
    // the characters load in the background; scenes wait for them if needed
    setTimeout(() => loadPeople(), 2500);
  }

  get sv() { return this.g.save.data; }
  get st() { return storyState(this.g.save.data); }
  save() { this.g.save.save(); this.g.save.flush && this.g.save.flush(); }
  driverName() { return String(this.sv.nick || 'ROOKIE').toUpperCase().slice(0, 16); }
  setting(k) { const v = this.sv.settings[k]; return v === undefined ? true : !!v; }

  // ------------------------------------------------------------------ hooks into the game
  installHooks() {
    const S = this;
    if (Race.prototype.__story) return;
    Race.prototype.__story = true;
    const pick = Race.prototype.pickOpponents;
    Race.prototype.pickOpponents = function (n) {
      const out = pick.call(this, n);
      const ctx = S.ctxFor(this);
      const rv = ctx && ctx.event && ctx.event.rivals;
      if (rv) rv.forEach((r, i) => { if (i < out.length) { const car = carById(r.car); out[i] = { car, levels: S.rivalLevels(car, this.stats.top, r.edge || 0) }; } });
      return out;
    };
    const intro = Presentation.prototype.startIntro;
    Presentation.prototype.startIntro = function (sec) {
      const ctx = S.ctxFor(this.r);
      if (ctx && ctx.event) S.dressField(this.r, ctx);
      if (ctx && ctx.tutorial) { this.r.startCountdownNow && this.r.startCountdownNow(); return; }
      return intro.call(this, sec);
    };
    const podium = Presentation.prototype.startPodium;
    Presentation.prototype.startPodium = function (rows, onDone) {
      const ctx = S.ctxFor(this.r);
      if (!ctx) return podium.call(this, rows, onDone);
      let res = null;
      try { res = S.evaluate(this.r, rows, ctx); } catch (e) { console.error('[story] evaluate', e); }
      return podium.call(this, rows, () => { onDone(); if (res) S.decorate(res); });
    };
    // settings: subtitles + story hints
    const openSettings = this.g.openSettings.bind(this.g);
    this.g.openSettings = () => {
      openSettings();
      const body = this.g.ui.screens.modal.querySelector('.body');
      if (!body) return;
      const row = (k, label) => `<div class="srow st-srow"><label>${label}</label><div class="seg" data-sk="${k}"><button data-v="1" class="${this.setting(k) ? 'on' : ''}">ON</button><button data-v="0" class="${this.setting(k) ? '' : 'on'}">OFF</button></div></div>`;
      const wrap = document.createElement('div');
      wrap.innerHTML = row('subtitles', 'STORY SUBTITLES') + row('storyHints', 'STORY &amp; TUTORIAL HINTS');
      const before = [...body.querySelectorAll('.srow')].find((r) => /CONTROLS/.test(r.textContent));
      [...wrap.children].forEach((r) => body.insertBefore(r, before || null));
      body.querySelectorAll('.seg[data-sk]').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        audio()?.ui('click');
        this.sv.settings[sg.dataset.sk] = b.dataset.v === '1';
        this.g.save.save();
        if (this.cine) this.cine.subs = this.setting('subtitles');
      })));
    };
  }

  injectButtons() {
    const ui = this.g.ui;
    const list = ui.screens.menu && ui.screens.menu.querySelector('.mlist');
    if (list) {
      const b = document.createElement('button');
      b.className = 'mitem primary st-menu';
      b.innerHTML = 'STORY MODE <small></small>';
      b.addEventListener('click', () => { audio()?.ui('click'); this.openFromMenu(); });
      b.addEventListener('mouseenter', () => audio()?.ui('hover'));
      list.prepend(b);
      this.menuBtn = b;
      this.menuLabel();
    }
    const bar = ui.screens.first && ui.screens.first.querySelector('.bottombar');
    if (bar) {
      const b = document.createElement('button');
      b.className = 'btn st-first';
      b.textContent = 'STORY MODE';
      b.title = 'Start with the story: a rusty car and a mentor';
      b.addEventListener('click', () => { audio()?.ui('buy'); this.openFromFirst(); });
      bar.appendChild(b);
    }
  }

  menuLabel() {
    if (!this.menuBtn) return;
    const st = this.st, ch = CHAPTERS[st.chapter - 1];
    this.menuBtn.querySelector('small').textContent = !st.seen.intro ? 'NEW · FROM NOTHING TO LEGEND' : st.complete ? 'COMPLETE · REPLAY ANY EVENT' : `CH ${ch.n} · ${ch.title}`;
  }

  // ------------------------------------------------------------------ helpers
  ctxFor(race) {
    const c = this.ctx;
    if (!c || !race || race !== this.g.run || (race.cfg && race.cfg.net)) return null;
    if (race.map && race.map.id !== c.map) return null;
    return c;
  }
  rivalLevels(car, meTop, edge) {
    const levels = defaultLevels();
    const mx = maxStats(car), base = computeStats(car, {}, 'street');
    const f = clamp(clamp((meTop - base.top) / Math.max(1, mx.top - base.top), 0, 1) * 0.95 + edge, 0, 1);
    for (const k of Object.keys(car.caps)) levels[k] = Math.round(car.caps[k] * f);
    return levels;
  }
  dressField(race, ctx) {
    const bots = race.field.filter((e) => e.isBot);
    (ctx.event.rivals || []).forEach((rv, i) => {
      const e = bots[i], P = PEOPLE[rv.who];
      if (!e || !P) return;
      e.name = P.short; e.color = P.color; e.rival = rv.who;
      e.skill = Math.max(e.skill, 0.99 + (rv.edge || 0) * 0.15);
      try { e.model.setPaint(parseInt(P.color.slice(1), 16), 'metallic'); } catch (err) { /* baked model: keep its paint */ }
    });
  }
  carOk(car, ev) { return classIndex(classOf(car).id) <= classIndex(ev.chapter.cls); }
  eventState(ev) {
    const st = this.st, ch = ev.chapter;
    if (st.done[ev.id]) return 'done';
    if (ch.n > st.chapter) return 'locked';
    const i = ch.events.indexOf(ch.events.find((x) => x.id === ev.id));
    if (i > 0 && !st.done[ch.events[i - 1].id]) return 'locked';
    return 'open';
  }
  chapterDone(ch) { return ch.events.every((e) => this.st.done[e.id]); }
  nextEvent() {
    for (const ev of ALL_EVENTS) if (this.eventState(ev) === 'open') return ev;
    return null;
  }
  grantCar(id) {
    const sv = this.sv;
    if (sv.owned.includes(id)) return false;
    sv.owned.push(id); carState(sv, id);
    return true;
  }
  async black() { if (!this.g.ui.fadeEl.classList.contains('on')) await this.g.ui.fade(true); }
  async flow(fn) {
    if (this.busy) return;
    this.busy = true;
    try { await fn(); } catch (e) { console.error('[story]', e); this.showScreen(); this.g.ui.fade(false); }
    this.busy = false;
  }

  // ------------------------------------------------------------------ entry points
  openFromMenu() {
    this.flow(async () => {
      await this.black();
      if (!this.st.seen.intro) { await this.playScene('intro'); await this.afterIntro(); return; }
      if (this.st.pending.length) await this.playPending();
      this.showScreen();
      this.g.ui.fade(false);
    });
  }
  // fresh save: the story's prologue replaces the car pick (Mara lends you her rusty hatchback)
  openFromFirst() {
    this.flow(async () => {
      await this.black();
      await this.playScene('intro');
      await this.afterIntro();
    });
  }
  async afterIntro() {
    const sv = this.sv, st = this.st;
    if (!sv.owned.length || !sv.owned.includes('rusty')) {
      const fresh = !sv.owned.length;
      this.grantCar('rusty');
      if (fresh || !sv.selected) sv.selected = 'rusty';
    }
    sv.firstStartDone = true;
    this.save();
    this.menuLabel();
    if (!st.tutorialDone && !st.skippedTutorial) { await this.startTutorial(); return; }
    this.showScreen();
    this.g.ui.fade(false);
  }

  async playPending() {
    const st = this.st;
    while (st.pending.length) {
      const id = st.pending.shift();
      this.save();
      await this.playScene(id);
    }
  }

  // plays one cutscene; resolves when it is over and the screen is black
  async playScene(id) {
    const g = this.g;
    await this.black();
    this.disposeBg();
    g.stopRun();
    g.ui.only();
    if (g.menuCar) g.menuCar.group.visible = false;
    g.state = 'story';
    this.mode = null;
    if (!peopleReady()) await loadPeople();
    const cs = new Cutscene(g, this.ui, { id, subs: this.setting('subtitles') });
    cs.cleanup = [];
    try { await buildScene(this, cs, id); } catch (e) { console.error('[story] scene', id, e); cs.shots = []; cs.duration = 0.1; }
    // the scene's own lights / materials compile now, behind the black screen
    try { g.renderer.compile(g.worldScene, g.camera); g.renderer.compile(g.garage.scene, g.camera); } catch (e) { /* ignore */ }
    this.cine = cs;
    this.mode = 'cine';
    const res = await cs.play();
    this.mode = null;
    this.cine = null;
    for (const f of cs.cleanup.reverse()) { try { f(); } catch (e) { console.error(e); } }
    cs.dispose();
    this.st.seen[id] = true;
    this.save();
    return res;
  }

  // ------------------------------------------------------------------ story screen
  showScreen() {
    const g = this.g;
    g.stopRun();
    g.state = 'story';
    this.mode = 'screen';
    this.ctx = null;
    this.ui.tutorial(null);
    this.setupBg();
    if (!this.selCh) this.selCh = CHAPTERS[this.st.chapter - 1].id;
    this.render();
    g.ui.only('story');
    audio()?.music?.setMode('menu');
    if (g.buildOutlines) g.buildOutlines();
    this.menuLabel();
  }

  setupBg() {
    if (this.bg) this.disposeBg();
    const g = this.g, sv = this.sv;
    const stub = { cleanup: [] };
    const carId = sv.selected || 'rusty';
    garageStage(this, stub, { carId, night: false });
    let mara = null;
    if (peopleReady()) {
      mara = new Person('mara', { anim: 'armscross' });
      mara.place(-2.3, 0, 1.5, 0); mara.face(1.5, 7);
      g.garage.scene.add(mara.group);
    }
    this.bg = { stub, mara, carId, t: 0 };
  }
  disposeBg() {
    if (!this.bg) return;
    for (const f of this.bg.stub.cleanup.reverse()) f();
    if (this.bg.mara) this.bg.mara.dispose();
    this.bg = null;
  }
  renderBg(dt) {
    const g = this.g, b = this.bg;
    if (!b) return;
    b.t += dt;
    if (b.mara) b.mara.update(dt);
    const cam = g.camera, a = 0.55 + Math.sin(b.t * 0.05) * 0.5;
    cam.position.set(Math.sin(a) * 6.6 + 0.4, 1.5 + Math.sin(b.t * 0.13) * 0.1, Math.cos(a) * 6.6);
    cam.lookAt(-0.6, 0.85, 0.4);
    cam.fov = 44; cam.updateProjectionMatrix();
    this.dummy = this.dummy || new THREE.PerspectiveCamera();
    g.garage.update(dt, this.dummy);
    audio()?.ambience?.update(dt, { room: 1, wind: 0.05 });
    g.post.enabled = g.quality !== 'low';
    g.post.render(g.garage.scene, cam, { bloom: 0.3, warm: 0.35, vig: 0.22, contrast: 1.0, sat: 1.05 });
  }

  chapterView(ch) {
    const st = this.st, sv = this.sv, g = this.g;
    const outlines = g.outlines || {};
    const locked = ch.n > st.chapter;
    const events = ch.events.map((ev0) => {
      const ev = ALL_EVENTS.find((x) => x.id === ev0.id);
      const m = mapById(ev.map), o = outlines[m.id];
      const rv = ev.rivals && ev.rivals[0] && PEOPLE[ev.rivals[0].who];
      return {
        id: ev.id, title: ev.title, mapName: m.name, cc: COUNTRY_CODES[m.country] || '', target: ev.target, rule: ev.rule || null,
        ruleShort: ev.rule ? RULES[ev.rule].short : '', state: this.eventState(ev), best: st.done[ev.id] || 0,
        rival: rv ? { name: rv.name, color: rv.color } : null, outline: o ? o.pts : null, loop: m.kind === 'circuit',
      };
    });
    const gift = carById(ch.gift);
    const disc = ch.discount || 0;
    return {
      id: ch.id, n: ch.n, title: ch.title, tagline: ch.tagline, cls: ch.cls, clsColor: CLASSES[classIndex(ch.cls)].color, locked,
      done: events.filter((e) => e.state === 'done').length, total: events.length, events,
      rivals: ch.rivals.map((id) => { const P = PEOPLE[id]; return { name: P.name, trait: P.trait, bio: P.bio, color: P.color, cc: P.cc, initials: id === 'vanta' ? 'V' : P.name.split(' ').map((w) => w[0]).join('') }; }),
      gift: { name: gift.name, cls: classOf(gift).id + ' · ' + gift.cls, got: !!st.gifts[ch.id] },
      discount: disc,
      offers: (ch.offers || []).map((id) => { const c = carById(id); const deal = Math.round(c.price * (1 - disc)); return { id, name: c.name, cls: classOf(c).id, price: c.price, deal, owned: sv.owned.includes(id), afford: deal <= sv.cash }; }),
    };
  }

  render() {
    if (this.g.state !== 'story' || this.mode !== 'screen') return;
    const st = this.st, sv = this.sv;
    const ch = chapterById(this.selCh) || CHAPTERS[st.chapter - 1];
    const view = this.chapterView(ch);
    if (!this.selEvent || !ch.events.some((e) => e.id === this.selEvent)) {
      const open = view.events.find((e) => e.state === 'open') || view.events[0];
      this.selEvent = open.id;
    }
    const nx = this.nextEvent();
    const cont = st.pending.length ? { label: 'CONTINUE STORY ›' } : nx ? { label: `CONTINUE · CH ${nx.chapter.n} · ${nx.title} ›`, id: nx.id } : null;
    this.ui.render({
      name: this.driverName(), level: levelOf(st.xp), xp: st.xp, cash: sv.cash,
      chapters: CHAPTERS.map((c) => {
        const done = c.events.filter((e) => st.done[e.id]).length;
        return { id: c.id, n: c.n, title: c.title, done, total: c.events.length, state: c.n > st.chapter ? 'locked' : done === c.events.length ? 'done' : 'current' };
      }),
      sel: view, selEvent: this.selEvent, detail: this.detail(eventById(this.selEvent)), cont,
    });
    this.outlineKey = view.events.map((e) => (e.outline ? 1 : 0)).join('');
  }

  detail(ev0) {
    if (!ev0) return null;
    const ev = ALL_EVENTS.find((x) => x.id === ev0.id);
    const sv = this.sv, st = this.st, m = mapById(ev.map);
    const o = (this.g.outlines || {})[m.id];
    const owned = sv.owned.map((id) => carById(id)).sort((a, b) => a.price - b.price);
    const cars = owned.map((c) => ({ id: c.id, name: c.name, cls: classOf(c).id, ok: this.carOk(c, ev) }));
    const sel = carById(sv.selected || 'rusty');
    const okCar = cars.find((c) => c.id === sel.id && c.ok) || cars.find((c) => c.ok);
    const state = this.eventState(ev);
    const rv = ev.rivals && ev.rivals[0] && PEOPLE[ev.rivals[0].who];
    let reason = '';
    if (state === 'locked') reason = ev.chapter.n > st.chapter ? `Finish chapter ${ev.chapter.n - 1} first.` : 'Finish the previous event first.';
    else if (!okCar) reason = `Every car you own is above ${ev.chapter.cls} class. Buy one from Mara's contacts or the dealer.`;
    return {
      id: ev.id, title: ev.title, brief: ev.brief, mapName: m.name, cc: COUNTRY_CODES[m.country] || '', place: (m.country + (m.region ? ' · ' + m.region : '')).toUpperCase(),
      line: (m.kind === 'circuit' ? m.laps + ' LAPS' : 'SPRINT') + (o ? ' · ' + o.km.toFixed(1) + ' KM' : ''),
      target: ev.target, rule: ev.rule || null, ruleLong: ev.rule ? RULES[ev.rule].long : '', opp: ev.opp, rival: rv ? { name: rv.name } : null,
      cls: ev.chapter.cls, clsColor: CLASSES[classIndex(ev.chapter.cls)].color, cash: ev.cash, xp: ev.xp, done: !!st.done[ev.id], best: st.done[ev.id] || 0,
      cars, car: okCar ? okCar.id : null, canStart: state !== 'locked' && !!okCar, reason,
    };
  }

  wireUI() {
    const U = this.ui;
    U.on('back', () => this.flow(async () => { await this.g.ui.fade(true); this.disposeBg(); this.mode = null; this.g.enterMenu(); this.g.ui.fade(false); }));
    U.on('chapter', (id) => { const c = chapterById(id); if (!c || c.n > this.st.chapter) { audio()?.ui('deny'); return; } this.selCh = id; this.selEvent = null; this.render(); });
    U.on('event', (id) => { this.selEvent = id; this.render(); });
    U.on('car', (id) => {
      const sv = this.sv;
      if (!sv.owned.includes(id)) return;
      sv.selected = id; this.g.save.save();
      if (this.bg) { this.setupBg(); }
      this.render();
    });
    U.on('buy', (id) => {
      const sv = this.sv, ch = chapterById(this.selCh);
      if (!ch || ch.n > this.st.chapter || sv.owned.includes(id)) return;
      const c = carById(id), price = Math.round(c.price * (1 - (ch.discount || 0)));
      if (price > sv.cash) { audio()?.ui('deny'); return; }
      sv.cash -= price; this.grantCar(id);
      this.st.bought = { ...(this.st.bought || {}), [id]: true };
      this.save();
      audio()?.starter(c);
      this.g.ui.toast(`<b>${c.name}</b> IS YOURS · ${fmtMoney(price)}`);
      this.render();
    });
    U.on('start', (id) => this.startEvent(id));
    U.on('continue', () => this.flow(async () => {
      if (this.st.pending.length) { await this.black(); await this.playPending(); this.showScreen(); this.g.ui.fade(false); return; }
      const nx = this.nextEvent();
      if (nx) { this.busy = false; this.selCh = nx.chapter.id; this.selEvent = nx.id; await this.startEvent(nx.id); }
    }));
    U.on('scenes', () => {
      const st = this.st;
      this.ui.scenesModal(Object.keys(SCENES).filter((id) => id !== 'tutorial').map((id) => ({ id, title: SCENES[id].title, chapter: 'CHAPTER ' + (chapterById(SCENES[id].chapter) || {}).n, seen: !!st.seen[id] })));
    });
    U.on('replay', (id) => this.flow(async () => { await this.black(); await this.playScene(id); this.showScreen(); this.g.ui.fade(false); }));
    U.on('tutorial', () => this.flow(() => this.startTutorial()));
    U.on('name', (v) => { const n = String(v || '').trim().toUpperCase().slice(0, 16); if (n) { this.sv.nick = n; this.g.save.save(); } this.render(); });
    U.on('skipTutorial', () => this.endTutorial(false));
    U.on('retry', () => { const r = this.g.run; this.g.ui.show('raceres', false); if (r instanceof Race) r.restart(); });
    U.on('afterRace', () => this.afterRace());
  }

  // ------------------------------------------------------------------ events
  async startEvent(id) {
    if (this.busy) return;
    const ev = eventById(id);
    if (!ev || this.eventState(ev) === 'locked') { audio()?.ui('deny'); return; }
    const sv = this.sv;
    let car = carById(sv.selected || 'rusty');
    if (!sv.owned.includes(car.id) || !this.carOk(car, ev)) {
      const alt = sv.owned.map((x) => carById(x)).filter((c) => this.carOk(c, ev)).sort((a, b) => b.price - a.price)[0];
      if (!alt) { audio()?.ui('deny'); this.g.ui.toast(`YOU NEED A <b>${ev.chapter.cls}</b> CLASS CAR`); return; }
      sv.selected = alt.id; car = alt;
    }
    this.busy = true;
    try {
      await this.black();
      if (ev.pre && !this.st.seen[ev.pre]) await this.playScene(ev.pre);
      this.disposeBg();
      this.mode = null;
      this.ctx = { event: ev, map: ev.map };
      await this.g.startRace(ev.map, { opponents: ev.opp });
    } catch (e) { console.error('[story] start', e); }
    this.busy = false;
  }

  evaluate(race, rows, ctx) {
    const me = race.me;
    const pos = rows.findIndex((r) => r.e === me) + 1;
    if (ctx.tutorial) return { tutorial: true, pos };
    const ev = ctx.event, st = this.st, sv = this.sv, ch = ev.chapter;
    const dnf = !!me.dnf;
    const posOk = !dnf && pos > 0 && pos <= ev.target;
    let ruleOk = true, ruleVal = '';
    if (ev.rule === 'rival') {
      const rivals = rows.map((r, i) => ({ r, i })).filter((x) => x.r.e.rival);
      const behind = rivals.filter((x) => x.i < pos - 1);
      ruleOk = !dnf && behind.length === 0;
      ruleVal = ruleOk ? 'AHEAD' : 'BEHIND ' + (PEOPLE[behind[0].r.e.rival] || {}).name;
      if (dnf) ruleVal = 'DNF';
    } else if (ev.rule === 'clean') {
      const cond = clamp(race.vehicle.hp / Math.max(1, race.vehicle.p.hpPool), 0, 1);
      ruleOk = !dnf && cond >= 0.7;
      ruleVal = Math.round(cond * 100) + '%';
    }
    const pass = posOk && ruleOk;
    const first = pass && !st.done[ev.id];
    let cash = 0, xp = 0, extra = '';
    if (pass) {
      cash = first ? ev.cash : Math.round(ev.cash * 0.25);
      xp = first ? ev.xp : Math.round(ev.xp * 0.25);
      sv.cash += cash; sv.totalEarned = (sv.totalEarned || 0) + cash;
      const lv0 = levelOf(st.xp).lv;
      st.xp += xp;
      const lv1 = levelOf(st.xp).lv;
      if (lv1 > lv0) extra += `DRIVER LEVEL <b>${lv1}</b>. `;
      st.done[ev.id] = Math.min(st.done[ev.id] || 99, pos);
      if (first && ev.post && !st.seen[ev.post]) st.pending.push(ev.post);
      // chapter complete: gift, next chapter, scenes queued (played after the result)
      if (first && this.chapterDone(ch) && !st.gifts[ch.id]) {
        const gift = carById(ch.gift);
        if (this.grantCar(gift.id)) extra += `CHAPTER COMPLETE · GIFT: <b>${gift.name}</b> IS IN YOUR GARAGE.`;
        else { const b = Math.round(gift.price * 0.25); sv.cash += b; extra += `CHAPTER COMPLETE · ${gift.name} ALREADY OWNED: <b>+${fmtMoney(b)}</b>.`; }
        st.gifts[ch.id] = gift.id;
        if (ch.close) st.pending.push(ch.close);
        const next = CHAPTERS[ch.n];
        if (next) { st.chapter = Math.max(st.chapter, next.n); if (next.open && !st.seen[next.open]) st.pending.push(next.open); extra += ` <b>CHAPTER ${next.n}: ${next.title}</b> UNLOCKED.`; this.selCh = next.id; this.selEvent = null; }
        else st.complete = true;
      }
      if (pass && first) audio()?.record();
    }
    this.save();
    this.menuLabel();
    return { chapter: ch.n, title: ev.title, pos, target: ev.target, posOk, rule: ev.rule || null, ruleLong: ev.rule ? RULES[ev.rule].long : '', ruleOk, ruleVal, pass, first, cash, xp, extra };
  }

  decorate(res) {
    if (res.tutorial) {
      const p = this.g.ui.screens.raceres && this.g.ui.screens.raceres.querySelector('.panel .foot');
      if (p) { p.innerHTML = '<button class="btn main amber">CONTINUE ›</button>'; p.querySelector('button').addEventListener('click', () => this.endTutorial(true)); }
      return;
    }
    this.ui.resultBlock(res);
  }

  afterRace() {
    this.flow(async () => {
      await this.g.ui.fade(true);
      this.g.stopRun();
      this.ctx = null;
      await this.playPending();
      this.showScreen();
      this.g.ui.fade(false);
    });
  }

  // ------------------------------------------------------------------ tutorial
  async startTutorial() {
    const sv = this.sv;
    await this.black();
    if (!sv.owned.length) { this.grantCar('rusty'); sv.selected = 'rusty'; this.save(); }
    this.disposeBg();
    this.mode = null;
    this.tut = { i: 0, k: 0, wait: 0, done: false, esc: 0, end: 0 };
    this.ctx = { tutorial: true, map: 'jp-sakura' };
    await this.g.startRace('jp-sakura', { opponents: 0 });
  }

  tutorialSteps() {
    const touch = this.g.input.isTouch;
    const k = (x) => `<kbd>${x}</kbd>`;
    return [
      { name: 'ACCELERATE', html: touch ? `Hold ${k('GAS')} and get her up to <b>60 km/h</b>.` : `Hold ${k('W')} or ${k('↑')} to accelerate. Get her up to <b>60 km/h</b>.`,
        tick: (v, dt, T) => clamp((v.speed * 3.6) / 60, T.k, 1) },
      { name: 'STEER', html: touch ? `Steer with ${k('‹')} ${k('›')}. Follow the road through the bends.` : `Steer with ${k('A')} ${k('D')} or ${k('←')} ${k('→')}. Follow the road through the bends.`,
        tick: (v, dt, T) => T.k + (Math.abs(v.input.steer) > 0.25 && v.speed > 5 ? dt / 2.2 : 0) },
      { name: 'BRAKE', html: touch ? `Hit ${k('BRAKE')} before the next corner.` : `Brake with ${k('S')} or ${k('↓')} before the next corner.`,
        tick: (v, dt, T) => T.k + (v.input.brake > 0.4 && v.speed > 4 ? dt / 0.7 : 0) },
      { name: 'HANDBRAKE DRIFT', html: touch ? `Turn in and tap ${k('HANDBRAKE')}: the tail steps out.` : `Turn in and tap ${k('SPACE')}: the handbrake kicks the tail out.`,
        tick: (v, dt, T) => T.k + (v.input.handbrake > 0.5 && v.speed > 6 ? dt / 0.45 : 0) },
      { name: 'TURBO', html: touch ? `The blue bar is your turbo. Tap ${k('TURBO')} on a straight.` : `The blue bar is your turbo. Press ${k('SHIFT')} on a straight.`,
        start: (v) => { v.nitro = 1; }, tick: (v) => (v.nitroT > 0 ? 1 : 0) },
      { name: 'CAMERA', html: touch ? 'Camera views live in the pause menu settings. You\'re set.' : `Press ${k('C')} to cycle the camera. Pick the one you like.`,
        tick: (v, dt, T) => (touch ? T.k + dt / 2.5 : this.g.input.wasPressed('KeyC') ? 1 : T.k) },
    ];
  }

  tutorialTick(dt) {
    const g = this.g, r = g.run, T = this.tut;
    if (!T || !(r instanceof Race) || !r.vehicle) return;
    const inp = g.input;
    // Esc: a tap pauses as usual, holding it for a second skips the tutorial
    if (!g.paused) {
      if (inp.wasPressed('Escape')) { inp.pressed.delete('Escape'); T.esc = 0.001; }
      if (T.esc > 0) {
        if (inp.down('Escape')) { T.esc += dt; this.ui.tutorialEsc(clamp(T.esc / 1, 0, 1)); if (T.esc >= 1) { T.esc = 0; this.ui.tutorialEsc(0); this.endTutorial(false); return; } }
        else { const tap = T.esc < 0.35; T.esc = 0; this.ui.tutorialEsc(0); if (tap) g.pause(true); }
      }
    }
    const steps = this.tutorialSteps();
    const quiet = !this.setting('storyHints');
    if (!r.go) { this.ui.tutorial({ step: 'FIRST DRIVE', html: 'Wait for the lights. Then we\'ll take her round.', k: 0, quiet }); this.tutShown = true; return; }
    if (g.paused) return;
    if (T.done) {
      T.end += dt;
      if (T.end > 3.2) this.endTutorial(true);
      return;
    }
    const s = steps[T.i];
    if (!T.started) { T.started = true; s.start && s.start(r.vehicle); }
    if (T.wait > 0) { T.wait -= dt; if (T.wait <= 0) { T.i++; T.k = 0; T.started = false; if (T.i >= steps.length) { T.done = true; audio()?.fanfare(); this.ui.tutorial({ step: 'DONE', html: '<b>Not bad at all.</b> The real races start now.', k: 1, done: true, quiet }); } } return; }
    T.k = clamp(s.tick(r.vehicle, dt, T), 0, 1);
    this.ui.tutorial({ step: `STEP ${T.i + 1} / ${steps.length} · ${s.name}`, html: s.html, k: T.k, quiet });
    this.tutShown = true;
    if (T.k >= 1) { T.wait = 0.7; audio()?.ui('buy'); }
  }

  endTutorial(completed) {
    if (this.tutEnding) return;
    this.tutEnding = true;
    const st = this.st;
    if (completed) st.tutorialDone = true; else st.skippedTutorial = true;
    this.save();
    this.ui.tutorial(null); this.ui.tutorialEsc(0); this.tutShown = false;
    this.tut = null;
    this.flow(async () => {
      await this.g.ui.fade(true);
      if (this.g.paused) { this.g.paused = false; this.g.ui.show('pause', false); this.g.sound.ctx && this.g.sound.ctx.resume(); }
      this.g.stopRun();
      this.ctx = null;
      this.showScreen();
      this.g.ui.toast(completed ? 'TUTORIAL COMPLETE · <b>CHAPTER 1</b> IS OPEN' : 'TUTORIAL SKIPPED · REPLAY IT ANY TIME FROM THE STORY SCREEN', 3800);
      this.g.ui.fade(false);
    }).finally(() => { this.tutEnding = false; });
  }

  // ------------------------------------------------------------------ per frame
  // returns true when the story drew this frame (main.js then skips its own update)
  update(dt) {
    const g = this.g;
    this.time += dt;
    if (g.state === 'menu' && (this.labelT = (this.labelT || 0) + dt) > 1) { this.labelT = 0; this.menuLabel(); }
    if (this.ctx && g.state !== 'run' && g.state !== 'story') { this.ctx = null; this.tut = null; }
    if (g.state !== 'story') {
      if (this.bg) this.disposeBg();
      if (this.mode === 'screen') this.mode = null;
      if (this.ctx && this.ctx.tutorial && g.state === 'run') this.tutorialTick(dt);
      else if (this.tutShown) { this.ui.tutorial(null); this.tutShown = false; }
      if (this.ctx && this.ctx.event && g.state === 'run') this.raceTick(dt);
      return false;
    }
    const inp = g.input;
    if (this.mode === 'cine' && this.cine) {
      if (inp.wasPressed('Escape', 'Enter', 'NumpadEnter')) this.cine.skip();
      inp.pressed.delete('Escape');
      this.cine.render(dt);
      return true;
    }
    if (this.mode === 'screen') {
      if (inp.wasPressed('Escape')) {
        inp.pressed.delete('Escape');
        if (g.ui.modalOpen) g.ui.closeModal(); else this.ui.emit('back');
      }
      // track outlines arrive in the background: redraw once they do
      if ((this.olT = (this.olT || 0) + dt) > 1) {
        this.olT = 0;
        const ch = chapterById(this.selCh);
        if (ch) { const key = ch.events.map((e) => ((g.outlines || {})[e.map] ? 1 : 0)).join(''); if (key !== this.outlineKey && !g.ui.modalOpen && !this.ui.el.contains(document.activeElement)) this.render(); }
      }
      this.renderBg(dt);
      return true;
    }
    // between screens (behind a fade): keep the last frame
    return true;
  }

  raceTick(dt) {
    const g = this.g, r = g.run, c = this.ctx;
    if (!(r instanceof Race) || !r.go || c.hinted) return;
    c.goT = (c.goT || 0) + dt;
    if (c.goT < 3.6) return;
    c.hinted = true;
    if (!this.setting('storyHints')) return;
    const ev = c.event, rv = ev.rivals && ev.rivals[0] && PEOPLE[ev.rivals[0].who];
    g.ui.hint(`OBJECTIVE · <b>${ev.target === 1 ? 'WIN' : 'TOP ' + ev.target}</b>${ev.rule ? ' · ' + RULES[ev.rule].long : ''}${rv ? ` · RIVAL <b style="color:${rv.color}">${rv.name}</b>` : ''}`, 4200);
  }
}

// Story mode: chapters, quests with a tracker on the HUD and a quest log (J), daily jobs,
// and the people of the street who hand them out: old Mr. Albrecht on the bench, Bruno the
// baker next door, a bread thief, and the drinks cooler outside Fresh Mart.
// Progress lives in save.story = { ch, q: {id: step}, daily: {day, list}, inv: {drink: n} }.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { OWNER_LOOK } from '../chars/looks.js';
import { ROOM, SUPER } from '../world/shop.js';
import { audio } from '../audio/audio.js';
import { pick, rand, clamp, formatMoney } from '../core/util.js';
import { SideQuests, SIDE_QUESTS } from './sidequests.js';
import { Julian } from './julian.js';
import { OuterQuests, OUTER_QUESTS } from './outerquests.js';
import { BoxClub, BOX_QUESTS } from './boxing.js';
import { DRINKS, makeDrink, drinkSVG, makeFridge, makeBreadBag, makeChefHat, makeBeanie, makeEyeMask, makeMarker } from '../world/storyassets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FZ = ROOM.z1 + 0.24;

// ------------------------------------------------------------------ chapters & quests
export const CHAPTERS = [
  { title: 'The Keys', sub: 'Take over the old barbershop.' },
  { title: 'Open for Business', sub: 'Serve your first customers. The street is watching.' },
  { title: 'Neighbours', sub: 'The bakery got robbed, people are thirsty, and an old friend is back.' },
  { title: 'Fresh Mart', sub: 'Mr. Kowalski still needs a shelf stacker. Desperately.' },
  { title: 'Barber Empire', sub: 'Grow the shop. Mr. Albrecht has one last thing for you.' },
  { title: 'Epilogue', sub: 'The shop is yours. Keep the chairs busy.' },
];

export const QUESTS = {
  albrecht: { title: 'An Old Friend', ch: 2, giver: 'Mr. Albrecht', reward: { money: 60, xp: 80 },
    steps: ['Find Mr. Albrecht on the bench outside', 'Give someone a 4-star cut or better', 'Tell Mr. Albrecht about it'] },
  thief: { title: 'Stop, Thief!', ch: 3, giver: 'Bruno the baker', reward: { money: 45, xp: 70 },
    steps: ['Talk to Bruno outside the bakery', 'Catch the bread thief', 'Pick up the stolen bread', 'Bring the bread back to Bruno'] },
  drinks: { title: 'Thirsty Customers', ch: 3, giver: 'Fresh Mart', reward: { money: 15, xp: 40 },
    steps: ['Buy a drink inside Fresh Mart (pay Dennis at the till)', 'Give a drink to a waiting customer (F)'] },
  martJob: { title: 'One Shift at Fresh Mart', ch: 4, giver: 'Mr. Kowalski', reward: { money: 0, xp: 0 },
    steps: ['Talk to Mr. Kowalski across the street', 'Carry the boxes into Fresh Mart', 'Collect your “pay”'] },
  deed: { title: 'The Deed', ch: 5, giver: 'Mr. Albrecht', reward: { money: 250, xp: 200 },
    steps: ['Reach shop level 6', 'Get a second barber chair', 'Meet Mr. Albrecht outside'] },
};

// Elli, Enrico and Jannis (side quests, started by talking to them on the street)
Object.assign(QUESTS, SIDE_QUESTS, OUTER_QUESTS, BOX_QUESTS);

const DAILY_POOL = [
  { id: 'serve', t: (n) => `Serve ${n} customers`, n: [4, 6], money: 30, xp: 40 },
  { id: 'five', t: (n) => `Get ${n} five-star cuts`, n: [1, 2], money: 35, xp: 50 },
  { id: 'fade', t: (n) => `Finish ${n} fades`, n: [2, 3], money: 30, xp: 45 },
  { id: 'earn', t: (n) => `Earn ${formatMoney(n)} today`, n: [120, 220], money: 25, xp: 35 },
  { id: 'drink', t: (n) => `Hand out ${n} drinks`, n: [1, 2], money: 15, xp: 30 },
  { id: 'style', t: () => 'A styled cut with 80% styling', n: [1, 1], money: 25, xp: 40 },
  { id: 'beard', t: (n) => `Do ${n} beard jobs`, n: [1, 2], money: 20, xp: 30 },
  { id: 'fast', t: () => 'A 4★ cut under par time', n: [1, 1], money: 25, xp: 40 },
];

// ------------------------------------------------------------------ a person on the street
export class StreetNPC {
  constructor(game, { name, look, hair, voice, hat }) {
    this.game = game;
    this.name = name;
    const ch = this.ch = new Character(game.scene, { ...look, name, voice });
    if (hair) {
      const h = new HairSystem({ color: hair.color, skin: look.colors.Skin, layers: 8 });
      h.attach(ch.bones.Head); h.setStyle(hair.style, hair.cut ?? 0.3); ch.hair = h;
    }
    if (hat) ch.bones.Head.add(hat);
    ch.onFootstep = (c) => game.footstepAt?.(c.root.position);
    this.marker = makeMarker('!');
    this.markerQ = makeMarker('?');
    game.scene.add(this.marker, this.markerQ);
    this.marker.visible = this.markerQ.visible = false;
    this.shown = true;
    this.busy = false;
    this.mark = null;
    game.npcByName?.set(name, this.ch);          // online: teammates hear this person's lines
    (game.streetNpcs ||= []).push(this);
    this.idleT = rand(4, 9);
  }

  show(v) {
    if (this.shown === v) return;
    this.shown = v;
    this.ch.root.visible = v;
    if (this.ch.shadow) this.ch.shadow.visible = v;
  }

  dist() { return this.ch.root.position.distanceTo(this.game.player.pos); }
  head() { return this.ch.headWorld(V(0, 0, 0)); }

  update(dt) {
    if (!this.shown) { this.marker.visible = this.markerQ.visible = false; return; }
    const d = this.dist();
    // far away people animate at a lower rate (the street is long and full of them)
    this._acc = (this._acc || 0) + dt;
    this._n = (this._n || 0) + 1;
    const every = this.noLod || this.busy || this.remote ? 1 : d > 45 ? 6 : d > 22 ? 3 : 1;
    if (this._n % every === 0) { this.ch.update(this._acc); this._acc = 0; }
    if (!this.busy) this.ch.lookAt(d < 6 ? this.game.camera : null, 0.8);
    const h = d < 40 ? this.head() : null;
    for (const [m, k] of [[this.marker, '!'], [this.markerQ, '?']]) {
      m.visible = !!h && this.mark === k && !this.busy && !this.game.van?.cut && d > 2.6;   // not in your face up close
      if (m.visible) m.position.set(h.x, h.y + 0.42 + Math.sin(performance.now() / 300) * 0.04, h.z);
    }
  }

  // talk: line with voice, face and subtitle; waits until it's said
  async say(text, emo = null, extra = 0.35) {
    const g = this.game;
    // not part of the conversation you're in: stay quiet
    if (!g.convoAllows(this.name)) { if (emo) this.ch.setEmotion(emo, 1.5); return; }
    const d = this.ch.say(text);
    if (emo) this.ch.setEmotion(emo, d + 1);
    g.showLine(this.name, text, d + 0.8);
    await g.dir.wait(d + extra).catch(() => {});
  }

  dispose() {
    if (this.game.npcByName?.get(this.name) === this.ch) this.game.npcByName.delete(this.name);
    if (this.game.streetNpcs) this.game.streetNpcs = this.game.streetNpcs.filter((n) => n !== this);
    this.ch.dispose?.();
    this.marker.parent?.remove(this.marker); this.markerQ.parent?.remove(this.markerQ);
  }
}

// online: move a character toward where a teammate's game says it is
export function followRemote(ch, r) {
  const p = ch.root.position;
  const d = Math.hypot(r.x - p.x, r.z - p.z);
  if (d > 5) { ch.place(new THREE.Vector3(r.x, 0, r.z), r.yaw); ch.stop(); }
  else if (d > 0.35) { if (!ch.path?.length || ch.gait !== r.gait || Math.hypot(ch.path[ch.path.length - 1].x - r.x, ch.path[ch.path.length - 1].z - r.z) > 0.3) ch.walkTo([new THREE.Vector3(r.x, 0, r.z)], r.gait); }
  else if (ch.path?.length) ch.stop();
}
const GAITS = ['walk', 'speedwalk', 'run', 'stroll'];
export const gaitIndex = (g) => Math.max(0, GAITS.indexOf(g));
export const gaitName = (i) => GAITS[i] || 'walk';

const baseColors = { EyeWhite: '#efe8dc', Pupil: '#0d0b0a', Mouth: '#5a2622', Teeth: '#ece6da', Frame: '#1d1b1a', Sole: '#1e1916', Belt: '#2a1d15', Metal: '#c4c6c6', Button: '#f3efe4', MouthDark: '#2a0d0b', Shirt: '#e9e1cf', Tie: '#7a2a26', Lapel: '#3a332c', TopDark: '#2d2a28' };
const BAKER = { colors: { ...baseColors, Skin: '#e8b996', Top: '#f2eee6', Sleeve: '#f2eee6', Pants: '#3a3f4a', Shoes: '#1b1b1d', Hair: '#3a2a20', Iris: '#5c4632', Apron: '#f7f4ee' },
  accessories: ['tee', 'apron', 'belly', 'moustache'], scale: 1.02, width: 1.1, hunch: 0.1 };
const THIEF = { colors: { ...baseColors, Skin: '#d29b77', Top: '#262628', Sleeve: '#262628', Pants: '#1f2228', Shoes: '#e8e2d6', Hair: '#1f1611', Iris: '#3b2a1e', TopDark: '#111' },
  accessories: ['hoodie'], scale: 0.97, hunch: 0.25 };

// ------------------------------------------------------------------ the story
export class Story {
  constructor(game) {
    this.game = game;
    this.npcs = {};
    this.thief = null;
    this.bag = null;
    this.trackerKey = '';
  }

  get s() {
    const sv = this.game.save;
    if (!sv) return { ch: 0, q: {}, daily: null, inv: {}, seen: {} };
    sv.story ||= { ch: 0, q: {}, daily: null, inv: {}, seen: {} };
    sv.story.inv ||= {}; sv.story.q ||= {}; sv.story.seen ||= {};
    return sv.story;
  }

  // ---------------------------------------------------------------- world setup
  build() {
    const g = this.game;
    // Mr. Albrecht on the bench outside the shop
    const al = this.npcs.albrecht = new StreetNPC(g, { name: 'Mr. Albrecht', look: OWNER_LOOK, voice: OWNER_LOOK.voice, hair: { color: OWNER_LOOK.hair.color, style: OWNER_LOOK.hair.style, cut: 0.42 } });
    al.ch.sitOn({ pos: V(-1.4, 0, FZ + 0.95), rot: 0, height: 0.46 }, true);
    // Bruno outside his bakery next door
    const br = this.npcs.baker = new StreetNPC(g, { name: 'Bruno', look: BAKER, voice: { pitch: 98, rate: 1.0, wobble: 0.1, vol: 0.1 }, hair: { color: '#3a2a20', style: { top: 0.1, front: 0.08, left: 0.12, right: 0.12, back: 0.13, fuzz: 0 } }, hat: makeChefHat() });
    br.home = V(5.1, 0, FZ + 0.6);
    br.ch.place(br.home, 0);
    // the cooler outside Fresh Mart: buy drinks here
    // (the drinks are sold inside Fresh Mart now)
    this.fridge = null;
    this.side = new SideQuests(this);
    this.side.build();
    this.outer = new OuterQuests(this);
    this.outer.build();
    this.box = new BoxClub(this);
    this.box.build();
    this.julian = new Julian(this.game);
    this.julian.build();
    g.npcByName.set('Mr. Kowalski', g.supermarket.ch);
    // online: the host's thief is the one everybody chases
    g.netActors.set('thief', {
      owned: () => !!this.thief && !this.thief.caught && g.isHost,
      get: () => { const c = this.thief.ch; return [+c.root.position.x.toFixed(2), +c.root.position.z.toFixed(2), +c.yaw.toFixed(2), gaitIndex(c.gait)]; },
      remote: (v) => { if (this.thief && !this.thief.caught) this.thief.remote = { x: v[0], z: v[1], yaw: v[2], gait: gaitName(v[3]) }; },
      release: () => { if (this.thief) this.thief.remote = null; },
    });
  }

  interactables(I) {
    const g = this.game;
    const play = () => g.state === 'play' && g.player.control;
    I({ id: 'albrecht', label: () => (play() && this.npcs.albrecht?.shown && this.npcs.albrecht.dist() < 2.6 && !this.npcs.albrecht.busy ? 'Talk to Mr. Albrecht' : null),
      pos: () => this.npcs.albrecht.head(), radius: 3.0, action: () => { this.talkAlbrecht().catch((e) => console.error(e)); return 'albrecht'; } });
    I({ id: 'baker', label: () => (play() && this.npcs.baker && this.npcs.baker.dist() < 2.6 && !this.npcs.baker.busy ? (this.step('thief') === 3 && this.carrying === 'bread' ? 'Give Bruno his bread' : this.side?.bakerLabel() || 'Talk to Bruno') : null),
      pos: () => this.npcs.baker.head(), radius: 3.0, action: () => { this.talkBaker().catch((e) => console.error(e)); return 'baker'; } });
    this.side.interactables(I);
    this.julian.interactables(I);
    this.outer.interactables(I);
    this.box.interactables(I);
    I({ id: 'thief', label: () => (play() && this.thief && !this.thief.caught && this.thief.ch.root.position.distanceTo(g.player.pos) < 2.2 ? 'Tackle the thief!' : null),
      pos: () => this.thief.ch.headWorld(V()), radius: 3.2, action: () => { this.tackleThief().catch((e) => console.error(e)); return 'thief'; } });
    I({ id: 'bread', label: () => (play() && this.bag && !this.carrying && this.bag.position.distanceTo(g.player.pos) < 2.0 ? 'Pick up the stolen bread' : null),
      pos: () => this.bag.position.clone().add(V(0, 0.2, 0)), radius: 2.6, action: () => { this.pickBread(); return 'bread'; } });
    // the cooler outside is just for show now: shopping happens inside the store
  }

  // ---------------------------------------------------------------- progress
  step(id) { return this.s.q[id] ?? -1; }
  active(id) { const st = this.step(id); return st >= 0 && st < QUESTS[id].steps.length; }
  done(id) { return this.step(id) >= QUESTS[id].steps.length; }

  // move a quest on (never back); shared with the team online
  setStep(id, st, { share = true, silent = false } = {}) {
    const q = QUESTS[id];
    if (!q || st <= this.step(id)) return;
    const was = this.step(id);
    this.s.q[id] = Math.min(st, q.steps.length);
    const g = this.game;
    if (!silent) {
      if (was < 0) { g.ui.toast(`New quest: ${q.title}`, 'Quest'); audio.objective(); }
      else if (this.done(id)) this.complete(id);
      else { g.ui.toast(q.steps[this.s.q[id]], q.title); audio.objective(); }
    }
    if (share) g.netOut?.push({ q: [id, this.s.q[id]] });
    g.persist();
    this.refresh();
  }

  complete(id) {
    const g = this.game, q = QUESTS[id];
    g.ui.banner('Quest complete', q.title, [q.reward.money ? `+${formatMoney(q.reward.money)}` : '', q.reward.xp ? `+${q.reward.xp} XP` : ''].filter(Boolean).join(' · ') || 'Done.', 2400);
    audio.achievement?.('gold');
    if (q.reward.money) g.addMoney(q.reward.money);
    if (q.reward.xp) g.addXP(q.reward.xp);
    g.save.stats.quests = (g.save.stats.quests || 0) + 1;
  }

  // the team shares quest steps: take the furthest anyone got (rewards were paid by them)
  merge(id, st) {
    if (!QUESTS[id] || typeof st !== 'number') return;
    if (st > this.step(id)) this.setStep(id, st, { share: false, silent: false });
  }

  setChapter(n) {
    if (n <= this.s.ch) return;
    this.s.ch = n;
    const c = CHAPTERS[n];
    const g = this.game;
    g.persist();
    g.netOut?.push({ ch: n });
    if (c) setTimeout(() => g.ui.banner(`Chapter ${n + 1}`, c.title, c.sub, 3200), 600);
    // new quests open up with the chapter
    for (const [id, q] of Object.entries(QUESTS)) if (q.ch === n + 1 && this.step(id) < 0 && id !== 'martJob') this.setStep(id, 0);
    if (n === 3 && this.step('martJob') < 0) this.setStep('martJob', 0);
    this.refresh();
  }

  // chapter gates, checked every second
  checkChapters() {
    const g = this.game, sv = g.save, s = this.s;
    if (!sv.tutorialDone) return;
    // one chapter per check, so the banners don't pile up
    if (s.ch < 1) return this.setChapter(1);
    if (s.ch === 1 && sv.stats.served >= 3) return this.setChapter(2);
    if (s.ch === 2 && this.done('thief') && this.done('drinks')) return this.setChapter(3);
    if (s.ch === 3 && this.done('martJob')) return this.setChapter(4);
    if (s.ch === 4 && this.done('deed')) return this.setChapter(5);
    // deed: level and second chair tick themselves off
    if (this.step('deed') === 0 && sv.level >= 6) this.setStep('deed', 1);
    if (this.step('deed') === 1 && g.owns('station2')) this.setStep('deed', 2);
  }

  // ---------------------------------------------------------------- events from the game
  on(type, data = {}) {
    const g = this.game;
    this.side?.on(type, data);
    this.outer?.on(type, data);
    if (type === 'cut') {
      const { result, c } = data;
      if (this.step('albrecht') === 1 && result.stars >= 4) this.setStep('albrecht', 2);
      this.dailyAdd('serve', 1);
      if (result.stars === 5) this.dailyAdd('five', 1);
      if (c.cut.fade) this.dailyAdd('fade', 1);
      if (c.cut.beard) this.dailyAdd('beard', 1);
      if ((result.style ?? 0) >= 0.8) this.dailyAdd('style', 1);
      if (result.stars >= 4 && (data.secs ?? 999) <= c.cut.par) this.dailyAdd('fast', 1);
    } else if (type === 'earn') this.dailyAdd('earn', data.amount);
    else if (type === 'drink') { this.dailyAdd('drink', 1); if (this.step('drinks') === 1) this.setStep('drinks', 2); }
    else if (type === 'bought' && this.step('drinks') === 0) this.setStep('drinks', 1);
    void g;
  }

  // ---------------------------------------------------------------- daily jobs
  rollDaily() {
    const g = this.game, s = this.s;
    if (s.daily && s.daily.day === g.save.day) return;
    const pool = [...DAILY_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    s.daily = { day: g.save.day, bonus: false, list: pool.map((p) => {
      // online the team's daily jobs are twice as big
      const n = Math.round(rand(p.n[0], p.n[1]) / (p.id === 'earn' ? 10 : 1)) * (p.id === 'earn' ? 10 : 1) * (g.coop ? 2 : 1);
      return { id: p.id, t: p.t(n), n, p: 0, money: p.money, xp: p.xp, done: false };
    }) };
    g.persist();
    this.refresh();
  }

  dailyAdd(id, v) {
    const g = this.game, d = this.s.daily;
    if (!d || !g.save.tutorialDone) return;
    for (const j of d.list) {
      if (j.id !== id || j.done) continue;
      j.p = Math.min(j.n, j.p + v);
      if (j.p >= j.n) {
        j.done = true;
        g.ui.toast(`Daily done: ${j.t}  +${formatMoney(j.money)}`, 'Daily');
        audio.coin?.(); g.addMoney(j.money); g.addXP(j.xp);
      }
    }
    if (!d.bonus && d.list.every((j) => j.done)) {
      d.bonus = true;
      g.save.stats.dailySweeps = (g.save.stats.dailySweeps || 0) + 1;
      setTimeout(() => { g.ui.banner('All daily jobs done', 'Daily sweep', `+${formatMoney(40)} · +60 XP`, 2200); g.addMoney(40); g.addXP(60); }, 1200);
    }
    g.persist();
    this.refresh();
  }

  // ---------------------------------------------------------------- HUD tracker + log
  refresh() {
    const g = this.game, s = this.s;
    const rows = [];
    for (const [id, q] of Object.entries(QUESTS)) {
      if (!this.active(id)) continue;
      let t = q.steps[this.step(id)];
      if (id === 'martJob' && this.step(id) === 1) t += ` (${g.supermarket.job?.boxes || 0}/${g.supermarket.need})`;
      rows.push({ k: q.title, t });
    }
    const d = s.daily;
    const daily = d && g.save.tutorialDone ? d.list.map((j) => ({ t: j.t, p: j.p, n: j.n, done: j.done })) : [];
    g.ui.questTracker?.({ chapter: g.save.tutorialDone ? `Chapter ${s.ch + 1} · ${CHAPTERS[s.ch]?.title || ''}` : '', quests: rows.slice(0, 3), daily });
    // markers over the people who want you
    const al = this.npcs.albrecht, br = this.npcs.baker;
    if (al) {
      const ast = this.step('albrecht'), dst = this.step('deed');
      al.show(g.save.tutorialDone && ((ast >= 0 && ast !== 1 && ast < 3) || dst === 2 || (ast >= 3 && dst < 0)));
      al.mark = ast === 0 || dst === 2 ? '!' : ast === 2 ? '?' : null;
    }
    if (br) br.mark = this.step('thief') === 0 ? '!' : this.step('thief') === 3 && this.carrying === 'bread' ? '?' : null;
  }

  openLog() {
    const g = this.game, ui = g.ui, s = this.s;
    const body = document.createElement('div');
    body.className = 'qlog';
    const chap = CHAPTERS.map((c, i) => `<div class="ql-ch ${i < s.ch ? 'done' : i === s.ch ? 'now' : 'lock'}"><b>${i + 1}</b><div><div class="t">${i <= s.ch ? c.title : '???'}</div><div class="s">${i <= s.ch ? c.sub : 'Keep playing to unlock'}</div></div></div>`).join('');
    const quests = Object.entries(QUESTS).filter(([id]) => this.step(id) >= 0).map(([id, q]) => {
      const st = this.step(id), done = this.done(id);
      return `<div class="ql-q ${done ? 'done' : ''}"><div class="h"><span>${q.title}</span><small>${q.giver}</small></div>
        <ol>${q.steps.map((t, i) => `<li class="${i < st ? 'ok' : i === st ? 'cur' : ''}">${t}</li>`).join('')}</ol>
        ${q.reward.money || q.reward.xp ? `<div class="rw">Reward: ${q.reward.money ? formatMoney(q.reward.money) : ''}${q.reward.money && q.reward.xp ? ' · ' : ''}${q.reward.xp ? q.reward.xp + ' XP' : ''}</div>` : '<div class="rw">Reward: ???</div>'}</div>`;
    }).join('') || '<p class="ql-empty">No quests yet. Finish the tutorial and serve a few customers.</p>';
    const d = s.daily;
    const daily = d ? d.list.map((j) => `<div class="ql-d ${j.done ? 'done' : ''}"><span>${j.t}</span><div class="bar"><i style="width:${Math.round(j.p / j.n * 100)}%"></i></div><small>${j.done ? 'Done' : `${j.id === 'earn' ? formatMoney(j.p) : j.p} / ${j.id === 'earn' ? formatMoney(j.n) : j.n}`} · +${formatMoney(j.money)}</small></div>`).join('') : '';
    const inv = Object.entries(s.inv).filter(([, n]) => n > 0).map(([id, n]) => `<span class="ql-inv">${drinkSVG(id)}<b>×${n}</b></span>`).join('') || '<span class="ql-empty">Nothing. The cooler outside Fresh Mart sells drinks.</span>';
    body.innerHTML = `<div class="ql-cols"><div><h4>Story</h4>${chap}</div><div><h4>Quests</h4>${quests}<h4>Daily jobs · Day ${g.save.day}</h4>${daily}<h4>Your bag</h4><div class="ql-bag">${inv}</div></div></div>`;
    ui.panel('Story mode', 'Journal', body);
  }

  // ---------------------------------------------------------------- Fresh Mart cooler
  openShop() {
    const g = this.game, s = this.s;
    const cart = {};
    const body = document.createElement('div');
    body.className = 'mart';
    const render = () => {
      const total = Object.entries(cart).reduce((t, [id, n]) => t + DRINKS[id].price * n, 0);
      body.innerHTML = `<p class="mart-lead">Ice cold drinks for your customers. A drink fills up their patience and puts them in a better mood (a better rating). Give one with <b>F</b> while looking at a waiting customer.</p>
        <div class="mart-grid">${Object.entries(DRINKS).map(([id, d]) => `<div class="mart-card" data-id="${id}">
          <div class="art">${drinkSVG(id)}</div><div class="nm">${d.name}</div>
          <div class="fx">+${Math.round(d.patience * 100)}% patience · +${Math.round(d.mood * 100)}% rating</div>
          <div class="row"><b>${formatMoney(d.price)}</b><div class="qty"><button data-a="-">−</button><span>${cart[id] || 0}</span><button data-a="+">+</button></div></div>
          <div class="own">${s.inv[id] ? `in your bag: ${s.inv[id]}` : '&nbsp;'}</div></div>`).join('')}</div>
        <div class="mart-foot"><div>Total <b>${formatMoney(total)}</b> · you have ${formatMoney(g.save.money)}</div><button class="mart-pay" ${total && total <= g.save.money ? '' : 'disabled'}>Pay ${formatMoney(total)}</button></div>`;
      body.querySelectorAll('.mart-card').forEach((card) => {
        const id = card.dataset.id;
        card.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
          cart[id] = clamp((cart[id] || 0) + (b.dataset.a === '+' ? 1 : -1), 0, 9);
          audio.click(); render();
        }));
      });
      body.querySelector('.mart-pay').addEventListener('click', () => {
        if (!total || total > g.save.money) return;
        g.addMoney(-total);
        for (const [id, n] of Object.entries(cart)) { if (n) s.inv[id] = (s.inv[id] || 0) + n; cart[id] = 0; }
        audio.register?.(); audio.purchase?.();
        g.ui.toast(`Bought drinks for ${formatMoney(total)}`, 'Fresh Mart');
        this.on('bought');
        g.persist();
        render();
      });
    };
    render();
    g.ui.panel('Fresh Mart', 'Ice Cold Drinks', body);
  }

  hasDrinks() { return Object.values(this.s.inv).some((n) => n > 0); }

  async giveDrink(c) {
    const g = this.game, s = this.s;
    const ids = Object.keys(s.inv).filter((id) => s.inv[id] > 0);
    if (!ids.length || c.drink) return;
    let id = ids[0];
    if (ids.length > 1) {
      const i = await g.ui.choices(`A drink for ${c.name}?`, ids.map((x) => `${DRINKS[x].name} (${s.inv[x]})`));
      id = ids[i];
    }
    s.inv[id]--;
    const d = DRINKS[id];
    c.drink = id;
    c.drinkBonus = d.mood * (c.wantsDrink ? 1.6 : 1);
    if (c.wantsDrink) { c.tipBonus = (c.tipBonus || 0) + 3; g.ui.toast(`${c.name} really needed that`, 'Drink'); }
    c.patience = Math.min(c.patienceMax, (c.patience ?? 0) + c.patienceMax * d.patience);
    // hand it over: the can travels from your hand into theirs
    const R = g.player.arms.R;
    const mine = makeDrink(id);
    R.set({ visible: true, pos: V(0.16, -0.22, -0.42), fingers: V(0, 1, -0.2), palm: V(-1, 0, 0), pose: 'grip', speed: 10 });
    R.hold(mine, { pos: [0.0, -0.05, 0.02], rot: [0, 0, 0] });
    setTimeout(() => R.set({ pos: V(0.1, -0.12, -0.6) }), 250);
    setTimeout(() => {
      R.drop(); R.set({ visible: false });
      const theirs = makeDrink(id);
      c.ch.hold('L', theirs, { pos: [-0.02, -0.07, 0.03], rot: [0, 0, 0.2] });
      c.drinkObj = theirs;
      c.ch.setEmotion('happy', 3);
      c.ch.gesture('thumbsUp', { dur: 1.2 });
      c.say?.(d.line, 'happy', 2.5) ?? g.line?.(c.ch, c.name, d.line);
      audio.noiseBurst?.(0.25, { vol: 0.12, type: 'highpass', freq: 4000 });   // the hiss of the can
    }, 650);
    g.save.stats.drinks = (g.save.stats.drinks || 0) + 1;
    this.on('drink');
    g.persist();
    this.refresh();
  }

  // ---------------------------------------------------------------- Mr. Albrecht
  async talkAlbrecht() {
    const g = this.game, al = this.npcs.albrecht;
    if (al.busy) return;
    al.busy = true; g.player.control = false;
    al.ch.lookAt(g.camera, 1);
    try {
      const a = this.step('albrecht'), dd = this.step('deed');
      if (dd === 2) {
        await al.say('There he is. The man who saved my little shop.', 'happy');
        await al.say('Two chairs, a full waiting area, people talking about you on the whole street...', 'happy');
        al.ch.gesture('presentL', { dur: 2 });
        await al.say('This is the deed. I kept it for thirty-one years. Now it’s yours. Properly yours.', 'happy');
        await g.ui.choices('Mr. Albrecht', ['Thank you, Mr. Albrecht.']);
        await al.say('Don’t thank me. Just never let anyone leave with a bad fade. Promise?', 'happy');
        this.setStep('deed', 3);
        setTimeout(() => this.finale(), 2600);
        return;
      }
      if (a === 0) {
        await al.say('Well, well. Look who it is. Remember me? I gave you the keys.', 'happy');
        await al.say('I couldn’t stay away. I sit here and watch who comes out of my old shop.', 'neutral');
        const i = await g.ui.choices('Mr. Albrecht', ['How’s retirement?', 'Any advice for me?']);
        if (i === 0) await al.say('Boring! I feed pigeons. They don’t even tip.', 'annoyed');
        else await al.say('Fades are like bread: patience, and never rush the bottom.', 'neutral');
        await al.say('Tell you what. Give somebody a proper cut. Four stars or better. Then come tell me.', 'happy');
        this.setStep('albrecht', 1);
      } else if (a === 2) {
        await al.say('I heard! The whole street is talking about that cut.', 'happy');
        al.ch.gesture('thumbsUp', { dur: 1.2 });
        await al.say('Here. For the shop. I always kept a little something under the mattress.', 'happy');
        this.setStep('albrecht', 3);
        if (this.step('deed') < 0 && this.s.ch >= 4) this.setStep('deed', 0);
      } else {
        await al.say(pick(['The pigeons send their regards.', 'Keep the clippers oiled, son.', 'Don’t forget to sweep. I never did.', 'My old chair still squeaks? Good.']), 'happy');
      }
    } finally {
      al.busy = false; al.ch.lookAt(null);
      if (g.state === 'play') { g.player.control = true; g.enterFP(); }
      this.refresh();
    }
  }

  async finale() {
    const g = this.game;
    g.save.stats.storyDone = 1;
    g.persist();
    audio.levelUp?.();
    await g.ui.banner('Barber Empire', 'The End?', 'The deed is yours. Free play continues — daily jobs, VIPs, and a full shop.', 5200);
    g.checkAchievements?.();
  }

  // ---------------------------------------------------------------- Bruno the baker
  async talkBaker() {
    const g = this.game, br = this.npcs.baker;
    if (br.busy) return;
    br.busy = true; g.player.control = false;
    br.ch.lookAt(g.camera, 1);
    try {
      const st = this.step('thief');
      if ((this.side.carrying === 'bouquet' || (st !== 0 && !(st === 3 && this.carrying === 'bread'))) && await this.side.bakerTalk(br)) return;
      if (st === 0) {
        br.ch.setEmotion('furious', 3);
        br.ch.gesture('rage', { dur: 1.2 });
        await br.say('HEY! Barber! Did you see him?! That little rat stole my best baguettes!', 'furious');
        br.ch.gesture('pointAccuse', { target: () => V(-20, 1.2, FZ + 1.5) });
        await br.say('Black hoodie, beanie, a mask like a raccoon. He ran down the street!', 'furious');
        const i = await g.ui.choices('Bruno', ['I’ll get your bread back.', 'Not my problem, Bruno.']);
        if (i === 1) { await br.say('Not your problem?! Who do you think sells you breakfast?! ...Fine. Please?', 'disappointed'); }
        await br.say('Bring it back and there’s money in it for you. And a cinnamon roll!', 'happy');
        this.setStep('thief', 1);
        this.spawnThief();
      } else if (st === 1 || st === 2) {
        await br.say(st === 1 ? 'He’s still out there! Black hoodie, beanie! Go go go!' : 'You got him?! Where’s my bread?!', 'annoyed');
      } else if (st === 3 && this.carrying === 'bread') {
        g.player.arms.R.drop(); g.player.arms.R.set({ visible: false });
        this.carrying = null;
        br.ch.setEmotion('happy', 3);
        br.ch.gesture('fistPump', { dur: 1.2 });
        await br.say('MY BAGUETTES! You absolute legend!', 'happy');
        await br.say('Here, take this. And come by any morning, coffee’s on me.', 'happy');
        this.setStep('thief', 4);
      } else {
        await br.say(pick(['Fresh rolls in ten minutes!', 'Your haircuts are better than my bread. Almost.', 'Keep an eye out for that raccoon kid.', 'Flour everywhere. Every day. It’s in my soul now.']), 'happy');
      }
    } finally {
      br.busy = false; br.ch.lookAt(null);
      if (g.state === 'play') { g.player.control = true; g.enterFP(); }
      this.refresh();
    }
  }

  // ---------------------------------------------------------------- the thief
  spawnThief() {
    const g = this.game;
    if (this.thief) return;
    const hat = new THREE.Group(); hat.add(makeBeanie('#141416')); hat.add(makeEyeMask());
    const t = this.thief = new StreetNPC(g, { name: 'Thief', look: THIEF, voice: { pitch: 168, rate: 1.25, wobble: 0.1, vol: 0.1 }, hat });
    const bag = makeBreadBag();
    t.ch.hold('R', bag, { pos: [0.02, -0.12, 0.02], rot: [0, 0, 0] });
    t.loot = bag;
    t.caught = false;
    t.ch.place(V(-14, 0, FZ + 1.6), Math.PI / 2);
    t.tauntT = 2;
    this.runThief();
  }

  // laps of the block: our pavement one way, the far pavement back
  runThief() {
    const t = this.thief;
    if (!t || t.caught) return;
    if (!this.game.isHost) return;          // online: the host's thief leads, we follow his position
    const dir = t.ch.root.position.x < 0 ? 1 : -1;
    const near = FZ + rand(1.3, 2.0), far = FZ + rand(11.6, 12.6);
    const pts = dir > 0
      ? [V(38, 0, near), V(40, 0, (near + far) / 2), V(36, 0, far), V(-36, 0, far), V(-40, 0, (near + far) / 2), V(-30, 0, near)]
      : [V(-38, 0, near), V(-40, 0, (near + far) / 2), V(-36, 0, far), V(36, 0, far), V(40, 0, (near + far) / 2), V(30, 0, near)];
    t.ch.walkTo(pts, 'speedwalk').then(() => this.runThief());
  }

  updateThief(dt) {
    const t = this.thief, g = this.game;
    if (!t) return;
    t.update(dt);
    if (t.caught) return;
    const d = t.dist();
    if (t.remote && !g.isHost) { followRemote(t.ch, t.remote); return; }
    // far away he dawdles; closer he hurries; right next to you he bursts away, then has to
    // catch his breath (that's your chance)
    t.burst = Math.max(0, (t.burst || 0) - dt);
    t.puff = Math.max(0, (t.puff || 0) - dt);
    if (d < 3.2 && !t.burst && !t.puff) { t.burst = 0.9; t.puff = 3.2; }
    const want = t.burst > 0 ? 'run' : t.puff > 0 && t.puff < 2.3 ? 'stroll' : d > 14 ? 'walk' : 'speedwalk';
    if (t.ch.gait !== want && t.ch.path?.length) t.ch.gait = want;
    t.tauntT -= dt;
    if (t.tauntT < 0 && d < 9) {
      t.tauntT = rand(4, 7);
      const line = pick(['Can’t catch me, scissor boy!', 'Too slow!', 'These baguettes are MINE!', 'Get a real job!', 'Ha! Nice haircut, nerd!']);
      t.ch.say(line); g.showLine('Thief', line, 2, true);
    }
  }

  async tackleThief() {
    const g = this.game, t = this.thief;
    if (!t || t.caught) return;
    t.caught = true;
    t.ch.stop();
    const R = g.player.arms.R;
    R.set({ visible: true, pos: V(0.2, -0.2, -0.3), pose: 'fist', fingers: V(0, 0, -1), palm: V(-1, 0, 0), speed: 30 });
    setTimeout(() => R.set({ pos: V(0.04, -0.05, -0.65), speed: 40 }), 90);
    setTimeout(() => { R.set({ visible: false, speed: 10 }); }, 450);
    await g.dir.wait(0.18).catch(() => {});
    audio.slap?.(); audio.chairThump?.();
    g.save.stats.thievesCaught = (g.save.stats.thievesCaught || 0) + 1;
    // knocked back, drops the bag, begs, runs for it
    const away = t.ch.root.position.clone().sub(g.player.pos).setY(0).normalize();
    t.ch.root.position.addScaledVector(away, 0.6);
    t.ch.faceTo(g.player.pos, true);
    t.ch.setEmotion('horrified', 3);
    g.exclaim.show(t.ch, 1.6, '!');
    t.ch.gesture('coverHead', { dur: 1.6 });
    const bag = t.ch.drop('R', g.scene);
    if (bag) { bag.position.copy(t.ch.root.position).addScaledVector(away, -0.5).setY(0); bag.rotation.set(0, Math.random() * 3, 0); this.bag = bag; }
    this.setStep('thief', 2);
    await g.dir.wait(0.5).catch(() => {});
    const line = pick(['OW! Okay, okay! Take it! I was hungry!', 'Not the face! NOT THE FACE!', 'Alright! I’ll steal from the supermarket instead!']);
    t.ch.say(line); g.showLine('Thief', line, 2.6);
    await g.dir.wait(1.8).catch(() => {});
    const x = t.ch.root.position.x > 0 ? 52 : -52;
    t.ch.walkTo([V(x, 0, t.ch.root.position.z)], 'run').then(() => { t.dispose(); if (this.thief === t) this.thief = null; });
  }

  thiefFlees() {
    const t = this.thief;
    t.caught = true;
    t.remote = null;
    t.ch.stop();
    t.ch.setEmotion('horrified', 2);
    const x = t.ch.root.position.x > 0 ? 52 : -52;
    t.ch.walkTo([V(x, 0, t.ch.root.position.z)], 'run').then(() => { t.dispose(); if (this.thief === t) this.thief = null; });
  }

  pickBread() {
    const g = this.game;
    if (!this.bag) return;
    const bag = this.bag; this.bag = null;
    bag.parent?.remove(bag);
    const R = g.player.arms.R;
    R.set({ visible: true, pos: V(0.2, -0.3, -0.42), fingers: V(0, 0, -1), palm: V(-1, 0, 0), pose: 'grip', speed: 10 });
    R.hold(bag, { pos: [0, -0.12, 0], rot: [0, Math.PI / 2, 0], scale: 0.8 });
    this.carrying = 'bread';
    audio.cloth?.(0.6, 0.2);
    this.setStep('thief', 3);
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.game;
    if (g.state === 'menu' || g.state === 'intro') return;
    for (const n of Object.values(this.npcs)) n.update(dt);
    this.updateThief(dt);
    this.side.update(dt);
    this.julian.update(dt);
    this.outer.update(dt);
    this.box.update(dt);
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT < 0) {
      this.checkT = 1;
      this.checkChapters();
      this.refresh();
      if (g.save.tutorialDone) this.rollDaily();
      // online: keep everyone's clock together (the furthest clock wins)
      if (g.online?.active && g.coopKey) { this.syncT = (this.syncT || 0) - 1; if (this.syncT <= 0 && g.clock?.open) { this.syncT = 15; g.netOut.push({ h: +g.clock.hour.toFixed(3) }); } }
      else g.netOut.length = 0;
      // the thief is back if you left mid-chase (e.g. after reloading)
      if (this.step('thief') === 1 && !this.thief) this.spawnThief();
      // (offline only: online a teammate may have the bread, so never step back)
      if (!g.coop && ((this.step('thief') === 2 && !this.bag && !this.carrying && !this.thief) || (this.step('thief') === 3 && !this.carrying))) { this.s.q.thief = 1; this.spawnThief(); this.refresh(); }
      // a teammate tackled the thief: mine gives up and runs off
      if (this.thief && !this.thief.caught && this.step('thief') >= 2) this.thiefFlees();
      // the Fresh Mart shift is a team job: everyone gets the pallet, and it's gone once someone got paid
      if (g.coop && this.step('martJob') === 1 && !g.supermarket.job) g.supermarket.startJob(true);
      if (this.done('martJob') && g.supermarket.job) g.supermarket.endJob();
    }
  }
}

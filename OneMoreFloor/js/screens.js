// Shop (upgrades, weapons, powers, skins), mastery pass, Register, power choice, lift ride and
// small UI effects. Installed onto the UI class so they share its helpers.
import * as THREE from '../lib/three.module.min.js';
import { save, levelFromXp } from './save.js';
import { audio } from './audio.js';
import { icon } from './upgrades.js';
import { PERMS, SKINS, ACHIEVEMENTS, BESTIARY, SKIN_RARITY, RARITY_TIERS } from './meta.js';
import { animateOutfit, buildPowerModel } from './characters.js';
import { WEAPONS, WEAPON_BY_ID, buildWeapon } from './weapons.js';
import { ABILITIES, ABILITY_BY_ID, masteryFromXp, TRACK, MAX_MASTERY, rewardLabel } from './abilities.js';
import { buildPlayer, buildEnemy, buildBoss, buildOperator } from './models.js';
import { Preview } from './preview.js';
import { fmt, pad2 } from './util.js';
import { crazy } from './crazy.js';

const $ = (s, el = document) => el.querySelector(s);
const hex = n => '#' + n.toString(16).padStart(6, '0');
const BACK = '<svg viewBox="0 0 24 24"><path d="M15 5 L8 12 L15 19"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 A4 4 0 0 1 16 8 V11"/></svg>';
const RCOL = Object.fromEntries(RARITY_TIERS.map(r => [r.id, r.color]));
const RLABEL = Object.fromEntries(RARITY_TIERS.map(r => [r.id, r.label]));

// Extra icons for powers and weapons.
const XI = {
  fire: '<path d="M12 21 C7 21 5 17 6 13 C7 10 9 9 9 6 C11 7 12 9 12 11 C13 9 14 8 14 5 C17 8 19 11 19 14 C19 18 16 21 12 21 Z"/><path d="M12 18 C10.5 18 10 16.5 10.5 15 C11 14 12 13.5 12 12 C13.5 13.5 14 15 13.8 16 C13.6 17.2 13 18 12 18 Z"/>',
  bolt: '<path d="M13 2 L5 13 H11 L10 22 L19 10 H13 Z"/>',
  rock: '<path d="M4 15 L7 8 L12 5 L18 7 L21 13 L17 19 L9 20 Z"/><path d="M7 8 L11 12 L18 7 M11 12 L9 20 M11 12 L21 13"/>',
  frost: '<path d="M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5"/><path d="M10 5 L12 7 L14 5 M10 19 L12 17 L14 19"/>',
  wind: '<path d="M3 9 H14 A3 3 0 1 0 11 6"/><path d="M3 14 H18 A3 3 0 1 1 15 17"/><path d="M3 19 H9"/>',
  sword: '<path d="M5 19 L16 8 M14 5 L19 10 M8 13 L11 16 M4 20 L6 18"/>',
};
export const xicon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${XI[n] || ''}</svg>`;

function playerLevel() { return levelFromXp(save.data.xp).level; }

export function installScreens(UI) {
  const P = UI.prototype;

  // ------------------------------------------------------------ shared 3D previews
  P.previews = function () {
    if (!this._pv) {
      this._pv = new Preview({ spin: 0.6 });
      this._op = new Preview({ floor: false, spin: 0, fov: 26, rim: 0xff9a2a });
      const op = buildOperator();
      this._opModel = op;
      this._op.setModel(op.root, { y: 1.45, dist: 4.6, pitch: -0.08, rot: -0.32, floor: false });
      this._op.onFrame = (dt, t) => {
        const talking = this.dlg && this.dlg.typing;
        op.body.position.y = Math.sin(t * 1.6) * 0.02;
        op.body.scale.y = 1 + Math.sin(t * 1.6) * 0.008;
        op.head.rotation.y = Math.sin(t * 0.7) * 0.12 + (talking ? Math.sin(t * 9) * 0.03 : 0);
        op.head.rotation.x = talking ? Math.sin(t * 13) * 0.025 : Math.sin(t * 0.9) * 0.02;
        const g = talking ? 0.55 + Math.abs(Math.sin(t * 17)) * 0.45 : 0.35 + Math.sin(t * 2) * 0.08;
        op.eyeGlow.material.opacity = g;
        op.visor.scale.y = talking ? 1 + Math.abs(Math.sin(t * 17)) * 0.6 : 1;
        op.crystal.rotation.y = t * 1.5;
        op.cape.rotation.x = Math.sin(t * 1.3) * 0.04;
      };
    }
    return this._pv;
  };
  P.skinThumb = function (s) {
    this._thumbs = this._thumbs || {};
    const key = s.id;
    if (this._thumbs[key]) return this._thumbs[key];
    if (!this._thumbPv) this._thumbPv = new Preview({ spin: 0, floor: false });
    const m = buildPlayer(s, 'stick');
    m.armL.rotation.set(0.15, 0, -0.1); m.pivot.rotation.set(0, 0.45, 0.15);
    animateOutfit(m.root, 0.4);
    const url = this._thumbPv.snap(m.root, { y: 0.66, dist: 2.7, pitch: 0.16, rot: 0.42, floor: false }, 168, 168);
    this._thumbs[key] = url;
    return url;
  };

  P.renderPreviews = function (dt) {
    if (this._pv) this._pv.render(dt);
    if (this._op) this._op.render(dt);
  };
  P.mountOperator = function (el) { this.previews(); this._op.mount(el); };

  // ------------------------------------------------------------ menu
  P.menuAction = function (act) {
    audio.play('click');
    if (act === 'play') return this.playPressed();
    if (act === 'shop') this.showShop('upgrades');
    else if (act === 'mastery') this.showMastery();
    else if (act === 'register') this.showRegister('monsters');
    else if (act === 'settings') { this.prevScreen = 'menu'; this.showSettings(); }
  };

  P.playPressed = function () {
    const g = this.game, d = save.data;
    if (!d.tutorialDone) {
      this.show('none');
      g.say([
        "Can you hear me, climber? Good. You will be hearing a lot of me.",
        'I am Argus. I watch over this tower, and nobody has ever reached its top. Every floor is guarded, and every floor you clear sends you higher.',
        'Before I let you climb, I want to see you fight. Training floor first?',
      ], [{ label: 'START TRAINING', value: 'tut' }, { label: 'SKIP, JUST PLAY', value: 'skip' }]).then(v => {
        if (v === 'skip') {
          d.tutorialDone = true; save.write();
          if (!d.ability) this.showElementChoice(g, () => g.startRun()); else g.startRun();
        } else g.startRun({ tutorial: true });
      });
      return;
    }
    if (!d.ability) { this.showElementChoice(g, () => g.startRun()); return; }
    g.startRun();
  };

  // ------------------------------------------------------------ power choice (after tutorial)
  P.showElementChoice = function (g, onDone) {
    const el = $('#choice');
    const opts = ABILITIES.filter(a => !a.shop);
    el.innerHTML = `<div class="choice-wrap">
      <div class="cards-head"><small>ARGUS OFFERS YOU</small><h2>CHOOSE YOUR POWER</h2></div>
      <div class="choice-row">${opts.map((a, k) => `<button class="pcard" data-id="${a.id}" style="--pc:${a.css};--d:${0.1 + k * 0.12}s">
        <div class="pc-orb">${xicon(a.icon)}</div>
        <div class="pc-name">${a.name}</div>
        <div class="pc-desc">${a.desc}</div>
        <div class="pc-track"><span>LV 1</span><i></i><span>LV 20</span></div>
        <div class="pc-perks"><b>LV 3</b> ${a.perks[3]}<br><b>LV 10</b> ${a.perks[10]}<br><b>LV 20</b> ${a.perks[20]}</div>
        <div class="pc-cta">CHOOSE</div>
      </button>`).join('')}</div>
      <p class="choice-note">Starts weak at level 1. It levels up like a pass every time you climb with it. You can buy more powers in the shop later.</p>
    </div>`;
    this.show('choice');
    const lines = {
      fire: ['Fire. Loud and messy. I approve.'],
      lightning: ['Lightning. Fast and precise. Let them never see it coming.'],
      earth: ['Earth. Heavy and patient, like this tower. Throw it hard.'],
    };
    let picked = false;
    el.querySelectorAll('.pcard').forEach(b => b.addEventListener('click', () => {
      if (picked) return; picked = true;
      const id = b.dataset.id;
      audio.play('select'); audio.play('levelUp');
      b.classList.add('picked');
      el.querySelectorAll('.pcard').forEach(o => { if (o !== b) o.classList.add('discard'); });
      g.chooseAbility(id);
      setTimeout(() => {
        this.show(g.mode === 'run' ? 'hud' : 'none');
        g.say(lines[id]).then(() => { audio.setMuffled(false); onDone && onDone(); });
      }, 650);
    }));
  };

  // ------------------------------------------------------------ shop
  P.showShop = function (tab = this.shopTab || 'upgrades', sel) {
    this.shopTab = tab;
    const d = save.data, lvl = playerLevel();
    const tabs = [['upgrades', 'UPGRADES'], ['weapons', 'WEAPONS'], ['powers', 'POWERS'], ['skins', 'SKINS']];
    const el = $('#shop');
    let list = '', stage = true;
    if (tab === 'upgrades') {
      stage = false;
      list = PERMS.map(p => {
        const lv = d.perm[p.id], maxed = lv >= p.max, cost = p.costs[lv];
        const pips = Array.from({ length: p.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
        const btn = maxed ? `<button class="btn off">MAX</button>` : `<button class="btn ${d.coins >= cost ? 'primary' : ''}" data-buy="${p.id}"><i class="coin-ico"></i>${fmt(cost)}</button>`;
        return `<div class="row" data-row="${p.id}"><div class="ico">${icon(p.icon)}</div><div class="txt"><b>${p.name.toUpperCase()}</b><span>${p.desc}</span><div class="pips">${pips}</div></div>${btn}</div>`;
      }).join('') + `<p class="shop-note">Permanent for every run. Coins from runs are always kept.</p>`;
    } else if (tab === 'weapons') {
      sel = sel || this.shopSel?.weapons || d.weapon;
      list = WEAPONS.map(w => {
        const owned = d.weapons.includes(w.id), locked = lvl < w.level;
        const state = d.weapon === w.id ? '<span class="tag-eq">EQUIPPED</span>' : owned ? '<span class="tag-own">OWNED</span>' : locked ? `<span class="tag-lock">${LOCK} LV ${w.level}</span>` : `<span class="tag-cost"><i class="coin-ico"></i>${fmt(w.cost)}</span>`;
        return `<button class="srow ${sel === w.id ? 'sel' : ''} ${locked && !owned ? 'locked' : ''}" data-sel="${w.id}"><span class="si">${xicon('sword')}</span><span class="st"><b>${w.name}</b><small>${w.dmg} DMG · ${w.rate.toFixed(1)} SPD · ${w.range.toFixed(1)} RANGE</small></span>${state}</button>`;
      }).join('');
    } else if (tab === 'powers') {
      sel = sel || this.shopSel?.powers || d.ability || 'fire';
      list = ABILITIES.map(a => {
        const own = d.abilities[a.id], lv = own ? masteryFromXp(own.xp).level : 0;
        const locked = a.shop && !own && lvl < a.shop.level;
        const state = d.ability === a.id ? '<span class="tag-eq">EQUIPPED</span>' : own ? `<span class="tag-own">LV ${lv}</span>` : !a.shop ? '<span class="tag-own">STARTER</span>' : locked ? `<span class="tag-lock">${LOCK} LV ${a.shop.level}</span>` : `<span class="tag-cost"><i class="coin-ico"></i>${fmt(a.shop.cost)}</span>`;
        return `<button class="srow ${sel === a.id ? 'sel' : ''} ${locked ? 'locked' : ''}" data-sel="${a.id}" style="--pc:${a.css}"><span class="si pw">${xicon(a.icon)}</span><span class="st"><b>${a.name}</b><small>${a.desc}</small></span>${state}</button>`;
      }).join('');
    } else {
      sel = sel || this.shopSel?.skins || d.skin;
      list = RARITY_TIERS.map(tier => {
        const group = SKINS.filter(s => (SKIN_RARITY[s.id] || 'common') === tier.id);
        if (!group.length) return '';
        return `<div class="tier" style="--rc:${tier.color}"><div class="tier-h"><span>${tier.label}</span><i></i><small>${group.filter(s => d.skins.includes(s.id)).length}/${group.length}</small></div><div class="skin-grid">${group.map(s => {
          const owned = d.skins.includes(s.id);
          return `<button class="stile ${sel === s.id ? 'sel' : ''} ${owned ? '' : 'locked'}" data-sel="${s.id}">
            <span class="thumb"><img alt="" src="${this.skinThumb(s)}"></span>
            <b>${s.name}</b>${d.skin === s.id ? '<em>ON</em>' : owned ? '' : s.unlock.type === 'coins' ? `<small><i class="coin-ico"></i>${fmt(s.unlock.cost)}</small>` : `<small>${LOCK}</small>`}
          </button>`;
        }).join('')}</div></div>`;
      }).join('');
    }
    this.shopSel = this.shopSel || {};
    if (tab !== 'upgrades') this.shopSel[tab] = sel;
    el.innerHTML = `<div class="shop ${stage ? 'with-stage' : ''}">
      <div class="panel-head"><button class="back" aria-label="Back">${BACK}</button><h2>SHOP</h2><div class="plevel">LV ${lvl}</div><div class="wallet"><i class="coin-ico"></i><span>${fmt(d.coins)}</span></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="shop-body">
        ${stage ? `<div class="stage"><div class="stage-view"></div><div class="stage-info"></div></div>` : ''}
        <div class="shop-list">${list}</div>
      </div></div>`;
    $('.back', el).addEventListener('click', () => this.back());
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { audio.play('click'); this.showShop(b.dataset.tab); }));
    el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => this.buyPerm(b.dataset.buy)));
    el.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => { audio.play('hover'); this.showShop(tab, b.dataset.sel); }));
    if (this.screen !== 'shop') { this.prevScreen = this.screen === 'results' ? 'results' : 'menu'; }
    this.show('shop');
    if (stage) this.fillStage(tab, sel);
  };

  P.fillStage = function (tab, id) {
    const d = save.data, lvl = playerLevel(), pv = this.previews();
    const view = $('#shop .stage-view'), info = $('#shop .stage-info');
    pv.mount(view);
    let html = '', action = '';
    if (tab === 'skins') {
      const s = SKINS.find(x => x.id === id), owned = d.skins.includes(id), r = SKIN_RARITY[id] || 'common';
      const m = buildPlayer(s, d.weapon); m.armL.rotation.set(0.1, 0, -0.1); m.pivot.rotation.set(0, 0.45, 0.15);
      pv.setModel(m.root, { y: 0.66, dist: 3.1, pitch: 0.18 });
      pv.onFrame = (dt, t) => { animateOutfit(m.root, t); m.rig.position.y = Math.sin(t * 2.3) * 0.008; m.head.rotation.y = Math.sin(t * 0.8) * 0.15; m.eyes.scale.y = (t % 3.2) < 0.09 ? 0.12 : 1; };
      const u = s.unlock;
      html = `<div class="si-rar" style="color:${RCOL[r]}">${RLABEL[r]} SKIN</div><h3>${s.name}</h3><p>${owned ? 'You own this skin.' : u.type === 'coins' ? 'Buy it with coins.' : u.label + '.'} Skins only change how you look.</p>`;
      if (d.skin === id) action = `<button class="btn equipped off">EQUIPPED</button>`;
      else if (owned) action = `<button class="btn primary" data-act="equip-skin">EQUIP</button>`;
      else if (u.type === 'coins') action = `<button class="btn ${d.coins >= u.cost ? 'primary' : ''}" data-act="buy-skin"><i class="coin-ico"></i>BUY · ${fmt(u.cost)}</button>`;
      else action = `<button class="btn off">${LOCK} LOCKED</button>`;
    } else if (tab === 'weapons') {
      const w = WEAPON_BY_ID[id], cur = WEAPON_BY_ID[d.weapon], owned = d.weapons.includes(id);
      const g = new THREE.Group(); const wm = buildWeapon(id); wm.rotation.x = -Math.PI / 2; wm.position.y = 0.05; g.add(wm); g.scale.setScalar(1.25);
      pv.setModel(g, { y: 0.75, dist: 2.6, pitch: 0.12 });
      const cmp = (a, b, label, max) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, a / max * 100)}%"></i></div><b class="${a > b ? 'up' : a < b ? 'down' : ''}">${typeof a === 'number' ? (Number.isInteger(a) ? a : a.toFixed(1)) : a}</b></div>`;
      html = `<div class="si-rar">WEAPON · LEVEL ${w.level}+</div><h3>${w.name}</h3><p>${w.desc}</p>
        ${cmp(w.dmg, cur.dmg, 'DAMAGE', 30)}${cmp(w.rate, cur.rate, 'SPEED', 3.2)}${cmp(w.range, cur.range, 'RANGE', 2.9)}`;
      if (d.weapon === id) action = `<button class="btn equipped off">EQUIPPED</button>`;
      else if (owned) action = `<button class="btn primary" data-act="equip-weapon">EQUIP</button>`;
      else if (lvl < w.level) action = `<button class="btn off">${LOCK} REACH LEVEL ${w.level}</button>`;
      else action = `<button class="btn ${d.coins >= w.cost ? 'primary' : ''}" data-act="buy-weapon"><i class="coin-ico"></i>BUY · ${fmt(w.cost)}</button>`;
    } else if (tab === 'powers') {
      const a = ABILITY_BY_ID[id], own = d.abilities[id];
      const pm = buildPowerModel(id);
      pv.onFrame = (dt, t) => pm.animate(t);
      pv.setModel(pm.group, { y: 0.85, dist: 3.2, pitch: 0.12 });
      const lv = own ? masteryFromXp(own.xp).level : 1;
      html = `<div class="si-rar" style="color:${a.css}">POWER${own ? ` · MASTERY ${lv}/20` : ''}</div><h3>${a.name}</h3><p>${a.desc}</p>
        <ul class="perks">${[3, 7, 10, 14, 20].map(l => `<li class="${own && lv >= l ? 'got' : ''}"><b>LV ${l}</b>${a.perks[l]}</li>`).join('')}</ul>`;
      if (d.ability === id) action = `<button class="btn equipped off">EQUIPPED</button>`;
      else if (own) action = `<button class="btn primary" data-act="equip-power">EQUIP</button>`;
      else if (!a.shop) action = `<button class="btn ${d.coins >= 300 ? 'primary' : ''}" data-act="buy-power"><i class="coin-ico"></i>BUY · 300</button>`;
      else if (lvl < a.shop.level) action = `<button class="btn off">${LOCK} REACH LEVEL ${a.shop.level}</button>`;
      else action = `<button class="btn ${d.coins >= a.shop.cost ? 'primary' : ''}" data-act="buy-power"><i class="coin-ico"></i>BUY · ${fmt(a.shop.cost)}</button>`;
    }
    if (tab === 'weapons') pv.onFrame = null;
    info.innerHTML = html + `<div class="stage-act">${action}</div>`;
    const btn = info.querySelector('[data-act]');
    if (btn) btn.addEventListener('click', () => this.shopAct(btn.dataset.act, tab, id));
  };

  P.shopAct = function (act, tab, id) {
    const d = save.data, g = this.game;
    const pay = cost => { if (d.coins < cost) { audio.play('deny'); const v = $('#shop .stage-act'); v && v.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 180 }); return false; } d.coins -= cost; audio.play('buy'); return true; };
    if (act === 'equip-skin') { d.skin = id; audio.play('select'); }
    else if (act === 'buy-skin') { if (!pay(SKINS.find(s => s.id === id).unlock.cost)) return; d.skins.push(id); d.skin = id; this.celebrate(); }
    else if (act === 'equip-weapon') { d.weapon = id; audio.play('select'); }
    else if (act === 'buy-weapon') { if (!pay(WEAPON_BY_ID[id].cost)) return; d.weapons.push(id); d.weapon = id; this.celebrate(); }
    else if (act === 'equip-power') { d.ability = id; audio.play('select'); }
    else if (act === 'buy-power') { const a = ABILITY_BY_ID[id]; if (!pay(a.shop ? a.shop.cost : 300)) return; d.abilities[id] = { xp: 0, claimed: 1 }; d.ability = id; this.celebrate(); }
    save.write();
    g.buildPlayerModel();
    this.showShop(tab, id);
  };

  P.celebrate = function () {
    audio.play('levelUp');
    const v = $('#shop .stage-view');
    if (v) { v.classList.remove('boom'); void v.offsetWidth; v.classList.add('boom'); }
  };

  // ------------------------------------------------------------ mastery pass
  P.showMastery = function (id) {
    const d = save.data;
    const owned = ABILITIES.filter(a => d.abilities[a.id]);
    const el = $('#mastery');
    if (!owned.length) {
      el.innerHTML = `<div class="panel"><div class="panel-head"><button class="back">${BACK}</button><h2>MASTERY</h2></div><div class="panel-body"><p class="empty">Finish the training floor and choose a power. Its mastery pass shows up here.</p></div></div>`;
      $('.back', el).addEventListener('click', () => this.back());
      this.show('mastery'); return;
    }
    id = id || d.ability || owned[0].id;
    const a = ABILITY_BY_ID[id], m = masteryFromXp(d.abilities[id].xp);
    const nodes = [];
    for (let l = 1; l <= MAX_MASTERY; l++) {
      const r = TRACK[l], got = m.level >= l, cur = m.level + 1 === l;
      const kind = r.t === 'perk' ? (r.skin ? 'ult' : 'perk') : r.t;
      const glyph = r.t === 'coins' ? '<i class="coin-ico"></i>' : r.t === 'dmg' ? '⬆' : r.t === 'cd' ? '⟳' : r.t === 'unlock' ? '★' : '◆';
      nodes.push(`<div class="node ${kind} ${got ? 'got' : ''} ${cur ? 'cur' : ''}"><div class="n-lv">${l}</div><div class="n-ico">${glyph}</div><div class="n-txt">${rewardLabel(a, l)}</div></div>`);
    }
    el.innerHTML = `<div class="mastery" style="--pc:${a.css}">
      <div class="panel-head"><button class="back" aria-label="Back">${BACK}</button><h2>MASTERY</h2><div class="wallet"><i class="coin-ico"></i><span>${fmt(d.coins)}</span></div></div>
      <div class="tabs">${owned.map(o => `<button class="tab ${o.id === id ? 'on' : ''}" data-pw="${o.id}">${o.name.toUpperCase()}</button>`).join('')}</div>
      <div class="m-head"><div class="m-orb">${xicon(a.icon)}</div><div><small>${d.ability === id ? 'EQUIPPED POWER' : 'POWER'}</small><h3>${a.name} <em>LV ${m.level}</em></h3>
        <div class="m-xp"><div class="xpbar"><i style="width:${m.need ? m.into / m.need * 100 : 100}%"></i></div><span>${m.need ? `${fmt(m.into)} / ${fmt(m.need)} XP` : 'MAXED'}</span></div></div></div>
      <div class="track">${nodes.join('')}</div>
      <p class="shop-note">Every run with this power equipped earns mastery XP. Rewards are claimed automatically.</p>
    </div>`;
    $('.back', el).addEventListener('click', () => this.back());
    el.querySelectorAll('[data-pw]').forEach(b => b.addEventListener('click', () => { audio.play('click'); this.showMastery(b.dataset.pw); }));
    this.show('mastery');
    const cur = el.querySelector('.node.cur') || el.querySelector('.node.got:last-of-type');
    if (cur) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
  };

  // ------------------------------------------------------------ register (bestiary + achievements)
  P.showRegister = function (tab = 'monsters', id) {
    const d = save.data, el = $('#register');
    const seenCount = BESTIARY.filter(b => d.bestiary[b.id]).length;
    let body;
    if (tab === 'monsters') {
      id = id || (BESTIARY.find(b => d.bestiary[b.id]) || BESTIARY[0]).id;
      body = `<div class="shop-body"><div class="stage"><div class="stage-view"></div><div class="stage-info"></div></div>
        <div class="shop-list">${BESTIARY.map((b, k) => {
          const e = d.bestiary[b.id], kills = e ? e.kills : 0;
          return `<button class="srow ${id === b.id ? 'sel' : ''} ${e ? '' : 'locked'}" data-sel="${b.id}"><span class="si num">${pad2(k + 1)}</span><span class="st"><b>${e ? b.name : '???'}</b><small>${e ? b.where : 'Not encountered yet'}</small></span>${e ? (kills ? `<span class="tag-own">${b.boss ? 'DEFEATED' : '✓'} ×${fmt(kills)}</span>` : '<span class="tag-lock">NOT DEFEATED</span>') : ''}${b.boss ? '<span class="tag-boss">BOSS</span>' : ''}</button>`;
        }).join('')}</div></div>`;
    } else {
      body = `<div class="panel-body">${ACHIEVEMENTS.map(a => {
        const got = d.achievements.includes(a.id);
        return `<div class="row ach-row ${got ? 'got' : ''}"><div class="ico">${icon(got ? 'crit2' : 'crit')}</div><div class="txt"><b>${a.name.toUpperCase()}</b><span>${a.desc}</span></div></div>`;
      }).join('')}</div>`;
    }
    el.innerHTML = `<div class="shop ${tab === 'monsters' ? 'with-stage' : ''}">
      <div class="panel-head"><button class="back" aria-label="Back">${BACK}</button><h2>REGISTER</h2><div class="plevel">${seenCount}/${BESTIARY.length} FOUND</div></div>
      <div class="tabs"><button class="tab ${tab === 'monsters' ? 'on' : ''}" data-tab="monsters">MONSTERS</button><button class="tab ${tab === 'ach' ? 'on' : ''}" data-tab="ach">ACHIEVEMENTS · ${d.achievements.length}/${ACHIEVEMENTS.length}</button></div>
      ${body}</div>`;
    $('.back', el).addEventListener('click', () => this.back());
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { audio.play('click'); this.showRegister(b.dataset.tab); }));
    el.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => { audio.play('hover'); this.showRegister('monsters', b.dataset.sel); }));
    this.show('register');
    if (tab !== 'monsters') return;
    const b = BESTIARY.find(x => x.id === id), e = d.bestiary[id], pv = this.previews();
    pv.mount($('#register .stage-view')); pv.onFrame = null;
    let model, frame;
    if (b.boss) { model = buildBoss(id).root; frame = { y: 1.4, dist: 7.5, pitch: 0.15 }; }
    else {
      const m = buildEnemy(id === 'splitling' ? 'splitter' : id);
      if (id === 'splitling') m.root.scale.setScalar(0.62);
      model = m.root; frame = { y: 0.5, dist: id === 'tank' ? 5 : 4.2, pitch: 0.25 };
    }
    pv.setModel(model, frame);
    pv.silhouette(!e);
    const kills = e ? e.kills : 0;
    $('#register .stage-info').innerHTML = e
      ? `<div class="si-rar">${b.boss ? 'BOSS' : 'MONSTER'} · ${b.where.toUpperCase()}</div><h3>${b.name}</h3><p>${b.lore}</p><div class="stage-act">${kills ? `<span class="kill-badge">DEFEATED ×${fmt(kills)}</span>` : '<span class="kill-badge no">NOT YET DEFEATED</span>'}</div>`
      : `<div class="si-rar">UNKNOWN</div><h3>???</h3><p>You have not met this one yet. Keep climbing.</p>`;
  };

  // ------------------------------------------------------------ lift ride between floors
  P.ride = function (g, f, cb) {
    const el = $('#ride');
    el.innerHTML = `<div class="shaft">${Array.from({ length: 9 }, (_, k) => `<i style="left:${6 + k * 11}%;animation-delay:${(k * 0.13) % 0.5}s"></i>`).join('')}</div>
      <div class="ride-num"><small>GOING UP</small><div class="roll"><div class="roll-col"><span>${pad2(f)}</span><span>${pad2(f + 1)}</span></div></div></div>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    audio.play('ride');
    this.show('hud');
    setTimeout(() => { cb(); setTimeout(() => el.classList.remove('on'), 120); }, 1050);
  };

  // ------------------------------------------------------------ revive offer (CrazyGames rewarded ad)
  P.showRevive = function (g) {
    const el = $('#revive');
    el.innerHTML = `<div class="rev"><small>YOU FELL ON FLOOR ${g.run.floor}</small><h2>CONTINUE?</h2>
      <div class="rev-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" /></svg><b>6</b></div>
      <button class="btn primary" data-rv="ad">REVIVE · WATCH AN AD</button><button class="btn ghost" data-rv="no">NO THANKS</button></div>`;
    this.show('revive');
    let left = 6, done = false;
    const num = $('.rev-ring b', el);
    const finish = ok => { if (done) return; done = true; clearInterval(timer); ok ? g.revive() : g.giveUp(); };
    const timer = setInterval(() => { left--; num.textContent = left; audio.play('hover'); if (left <= 0) finish(false); }, 1000);
    $('[data-rv=ad]', el).addEventListener('click', () => { if (done) return; clearInterval(timer); audio.play('click'); crazy.rewarded().then(ok => { done = false; finish(ok); }); });
    $('[data-rv=no]', el).addEventListener('click', () => { audio.play('back'); finish(false); });
  };

  // ------------------------------------------------------------ daily reward (7-day streak)
  const DAILY = [50, 80, 120, 160, 220, 300, 500];
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const yesterday = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  P.dailyState = function () {
    const dl = save.data.daily;
    const can = dl.last !== today();
    const streak = can ? (dl.last === yesterday() ? dl.streak % 7 : 0) : (dl.streak - 1) % 7;
    return { can, day: streak };
  };
  P.updateDailyChip = function () {
    let chip = $('#daily-chip');
    if (!chip) {
      chip = document.createElement('button'); chip.id = 'daily-chip'; chip.className = 'daily-chip';
      chip.innerHTML = '<span class="dc-ico"><i class="coin-ico"></i></span><span><b>DAILY REWARD</b><small></small></span>';
      $('.menu-foot').prepend(chip);
      chip.addEventListener('click', () => { audio.play('click'); this.showDaily(); });
    }
    const st = this.dailyState();
    chip.classList.toggle('ready', st.can);
    $('small', chip).textContent = st.can ? `Day ${st.day + 1} · ${DAILY[st.day]} coins` : 'Come back tomorrow';
  };
  P.showDaily = function () {
    const st = this.dailyState(), el = $('#daily');
    el.innerHTML = `<div class="panel daily"><div class="panel-head"><button class="back" aria-label="Back">${BACK}</button><h2>DAILY REWARD</h2><div class="wallet"><i class="coin-ico"></i><span>${fmt(save.data.coins)}</span></div></div>
      <div class="panel-body"><p class="daily-note">Come back every day. Miss a day and the streak starts over.</p>
      <div class="days">${DAILY.map((c, k) => `<div class="day ${k < st.day || (!st.can && k === st.day) ? 'got' : ''} ${st.can && k === st.day ? 'today' : ''} ${k === 6 ? 'big' : ''}"><small>DAY ${k + 1}</small><i class="coin-ico"></i><b>${c}</b></div>`).join('')}</div>
      <div class="stage-act">${st.can ? `<button class="btn primary" data-claim>CLAIM ${DAILY[st.day]} COINS</button>` : '<button class="btn off">CLAIMED TODAY</button>'}</div></div></div>`;
    $('.back', el).addEventListener('click', () => this.back());
    const cl = $('[data-claim]', el);
    if (cl) cl.addEventListener('click', () => {
      const dl = save.data.daily, s2 = this.dailyState();
      if (!s2.can) return;
      save.data.coins += DAILY[s2.day];
      dl.streak = s2.day + 1; dl.last = today(); save.write();
      audio.play('levelUp'); audio.play('buy');
      const tile = el.querySelector('.day.today'), w = $('.wallet', el);
      if (tile && w) {
        const a = tile.getBoundingClientRect(), b = w.getBoundingClientRect();
        for (let k = 0; k < 12; k++) {
          const c = document.createElement('i'); c.className = 'coin-ico fly'; c.style.left = (a.left + a.width / 2) + 'px'; c.style.top = (a.top + a.height / 2) + 'px'; document.body.appendChild(c);
          const dx = b.left + 10 - a.left - a.width / 2 + (Math.random() - 0.5) * 10, dy = b.top + 12 - a.top - a.height / 2;
          c.animate([{ transform: 'translate(-50%,-50%) scale(1.4)' }, { transform: `translate(calc(-50% + ${dx * 0.2 + (Math.random() - 0.5) * 120}px), calc(-50% + ${-60 - Math.random() * 60}px)) scale(1.2)`, offset: 0.35 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)` }], { duration: 700 + k * 40, easing: 'cubic-bezier(.5,0,.8,.6)' }).onfinish = () => { c.remove(); audio.play('coin'); };
        }
      }
      setTimeout(() => { this.showDaily(); this.updateDailyChip(); }, 1300);
    });
    this.show('daily');
  };

  // ------------------------------------------------------------ effects
  P.flash = function () {
    const f = $('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  };

  P.coinFly = function (x, y, z) {
    const now = performance.now();
    if (now - (this._lastFly || 0) < 45) return;
    this._lastFly = now;
    const v = this._v.set(x, y, z).project(this.world.camera);
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth, sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const target = $('.hud-tr .coin-ico').getBoundingClientRect();
    const c = document.createElement('i');
    c.className = 'coin-ico fly';
    c.style.left = sx + 'px'; c.style.top = sy + 'px';
    document.body.appendChild(c);
    const dx = target.left + 7 - sx, dy = target.top + 7 - sy;
    c.animate([
      { transform: 'translate(-50%,-50%) scale(1.3)', offset: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.3}px), calc(-50% + ${dy * 0.3 - 40}px)) scale(1.1)`, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.7)`, offset: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.5,0,.8,.6)' }).onfinish = () => { c.remove(); this.coinBump(); };
  };

  // ------------------------------------------------------------ HUD: power slot
  P.updatePowerHud = function (g) {
    const slot = this._slot || (this._slot = $('#power-slot')), btn = this._skillBtn || (this._skillBtn = $('#btn-skill'));
    const pw = g.mode === 'run' && g.run && g.run.power;
    document.body.classList.toggle('has-power', !!pw);
    if (!pw) return;
    const key = pw.a.id + pw.lvl;
    if (this._slotKey !== key) {
      this._slotKey = key;
      for (const el of [slot, btn]) { el.style.setProperty('--pc', pw.a.css); el.querySelector('.ps-ico').innerHTML = xicon(pw.a.icon); }
      slot.querySelector('.ps-lv').textContent = 'LV ' + pw.lvl;
    }
    const k = Math.max(0, g.player.abilityCd || 0) / pw.cd;
    const deg = Math.round(k * 360);
    if (this._slotDeg !== deg) {
      this._slotDeg = deg;
      for (const el of [slot, btn]) { el.style.setProperty('--cd', deg + 'deg'); el.classList.toggle('ready', deg === 0); }
      if (deg === 0) { slot.classList.remove('pop'); void slot.offsetWidth; slot.classList.add('pop'); }
    }
  };
}

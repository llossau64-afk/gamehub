// DOM UI: menu, shop, skins, settings, HUD, upgrade cards, results, pause, toasts.
import { save, levelFromXp } from './save.js';
import { audio } from './audio.js';
import { icon, RARITY, UPGRADE_BY_ID, synergyWith } from './upgrades.js';
import { PERMS, SKINS, ACHIEVEMENTS } from './meta.js';
import { input } from './input.js';
import { themeFor } from './world.js';
import { fmt, pad2, TAU } from './util.js';
import { toWorld } from './rooms.js';
import * as THREE from '../lib/three.module.min.js';
import { installScreens, xicon } from './screens.js';
import { WEAPONS } from './weapons.js';
import { ABILITY_BY_ID } from './abilities.js';

const $ = (s, el = document) => el.querySelector(s);
import { rewardLabel as rewardLabelFor } from './abilities.js';
const BACK = '<svg viewBox="0 0 24 24"><path d="M15 5 L8 12 L15 19"/></svg>';
const hex = n => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor() {
    this.screen = 'boot';
    this.prevScreen = 'menu';
    this.notes = [];
    this.hud = $('#hud');
    this.el = {
      hpFill: $('.hp-fill'), hpLag: $('.hp-lag'), hpNum: $('.hp-num'), hpBar: $('.hp-bar'), pips: $('.dash-pips'),
      floor: $('.floor-label b'), info: $('.room-info'), bossBar: $('.boss-bar'), bossName: $('.boss-name'), bbFill: $('.bb-fill'), bbLag: $('.bb-lag'),
      coins: $('.hud-tr .coins'), coinNum: $('.hud-tr .coins span'), build: $('.build'), hurt: $('#hurt'), fade: $('#fade'),
      banner: $('#banner'), toasts: $('#toasts'), letterbox: $('#letterbox'),
    };
    this._last = {};
    this._v = new THREE.Vector3();
  }

  init(game, world, fx) {
    this.game = game; this.world = world; this.fx = fx;
    // Every button gets hover + press sounds.
    document.addEventListener('pointerover', e => { const b = e.target.closest('button, .card'); if (b && b !== this._hovered && !input.touchMode) { this._hovered = b; audio.play('hover'); } });
    document.addEventListener('pointerdown', () => audio.init(), { capture: true });
    document.addEventListener('keydown', () => audio.init(), { capture: true });

    $('#menu').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      this.menuAction(b.dataset.act);
    });
    $('#pause-btn').addEventListener('click', () => this.togglePause(game));
    $('#dialog').addEventListener('click', e => { if (!e.target.closest('.dlg-choices button')) this.dialogAdvance(); });
    document.addEventListener('keydown', e => this.onKey(e));
    this.applySettings();
  }

  // ---------------------------------------------------------------- screens
  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id);
    this.screen = id;
    this.focusIdx = 0;
    document.body.classList.toggle('playing', id === 'hud');
    this.hud.classList.toggle('on', id === 'hud' || id === 'pause' || id === 'cards');
  }

  showMenu() {
    const d = save.data;
    $('.ind-num').textContent = pad2(d.bestFloor);
    $('.m-coins').textContent = fmt(d.coins);
    const lv = levelFromXp(d.xp);
    $('.m-level').textContent = 'LV ' + lv.level;
    $('.xpbar i', $('#menu')).style.width = (lv.into / lv.need * 100) + '%';
    $('.m-hint').innerHTML = input.touchMode ? '' : 'WASD move &nbsp;·&nbsp; mouse aim &nbsp;·&nbsp; click attack &nbsp;·&nbsp; space dash';
    $('[data-act=shop]').classList.toggle('has-dot', this.canAffordPerm() || this.canAffordSkin());
    this.show('menu');
    this.setMenuFocus(0);
    this.game.player && (this.game.player.face = 0.5);
  }

  canAffordPerm() { const d = save.data; return PERMS.some(p => d.perm[p.id] < p.max && d.coins >= p.costs[d.perm[p.id]]); }
  canAffordSkin() { const d = save.data; return SKINS.some(s => s.unlock.type === 'coins' && !d.skins.includes(s.id) && d.coins >= s.unlock.cost); }

  menuAction(act) {
    audio.play('click');
    if (act === 'play') {
      if (save.data.tutorialDone) { this.game.startRun(); return; }
      this.show('none');
      this.game.say([
        "Signal's up. Can you hear me, climber?",
        'Nobody has ever seen the top of this tower. Every floor is guarded, and every floor you clear sends you higher.',
        "I'll be on the intercom the whole way up. Want a quick warm-up before the real thing?",
      ], [{ label: 'START TRAINING', value: 'tut' }, { label: 'SKIP, JUST PLAY', value: 'skip' }]).then(v => {
        if (v === 'skip') { save.data.tutorialDone = true; save.write(); this.game.startRun(); }
        else this.game.startRun({ tutorial: true });
      });
    }
    else if (act === 'upgrades') this.showUpgrades();
    else if (act === 'skins') this.showSkins('skins');
    else if (act === 'settings') { this.prevScreen = 'menu'; this.showSettings(); }
  }

  setMenuFocus(i) {
    const items = [...document.querySelectorAll('#menu .mi')];
    this.focusIdx = (i + items.length) % items.length;
    items.forEach((b, k) => b.classList.toggle('focus', k === this.focusIdx && !input.mouseActive && !input.touchMode));
  }

  onKey(e) {
    const k = e.code;
    if (this.dlg) {
      if (k === 'Space' || k === 'Enter' || k === 'NumpadEnter') { e.preventDefault(); if (this.dlg.choicesShown && this.dlg.choices) this.dialogChoose(this.dlg.choices[this.dlg.focus || 0].value); else this.dialogAdvance(); }
      else if (this.dlg.choicesShown && (k === 'Digit1' || k === 'Digit2')) this.dialogChoose(this.dlg.choices[k === 'Digit1' ? 0 : 1].value);
      else if (this.dlg.choicesShown && /Arrow|KeyA|KeyD|KeyW|KeyS/.test(k)) { this.dlg.focus = 1 - (this.dlg.focus || 0); this.renderChoiceFocus(); audio.play('hover'); }
      return;
    }
    if (this.screen === 'menu') {
      if (k === 'ArrowDown' || k === 'KeyS') { this.setMenuFocus(this.focusIdx + 1); audio.play('hover'); }
      else if (k === 'ArrowUp' || k === 'KeyW') { this.setMenuFocus(this.focusIdx - 1); audio.play('hover'); }
      else if (k === 'Enter' || k === 'Space') { const items = document.querySelectorAll('#menu .mi'); this.menuAction(items[this.focusIdx].dataset.act); }
    } else if (['upgrades', 'skins', 'settings', 'shop', 'mastery', 'register'].includes(this.screen)) {
      if (k === 'Escape' || k === 'Backspace') this.back();
    } else if (this.screen === 'cards') {
      if (k === 'Digit1' || k === 'Numpad1') this.pickCard(0);
      else if (k === 'Digit2' || k === 'Numpad2') this.pickCard(1);
      else if (k === 'Digit3' || k === 'Numpad3') this.pickCard(2);
      else if (k === 'ArrowRight' || k === 'KeyD' || k === 'ArrowDown') this.focusCard(this.cardFocus + 1);
      else if (k === 'ArrowLeft' || k === 'KeyA' || k === 'ArrowUp') this.focusCard(this.cardFocus - 1);
      else if ((k === 'Enter' || k === 'Space') && this.cardFocus >= 0) this.pickCard(this.cardFocus);
      else if (k === 'KeyR') this.reroll();
    } else if (this.screen === 'results') {
      if ((k === 'Enter' || k === 'Space' || k === 'KeyR') && performance.now() - this.resultsAt > 600) this.playAgain();
      else if (k === 'Escape') { audio.play('back'); this.game.enterMenu(); this.showMenu(); }
    } else if (this.screen === 'pause') {
      if (k === 'Escape' || k === 'KeyP') this.togglePause(this.game);
    }
  }

  back() {
    audio.play('back');
    if (this.screen === 'settings' && this.prevScreen === 'pause') { this.show('pause'); return; }
    if ((this.screen === 'shop' || this.screen === 'upgrades') && this.prevScreen === 'results') { this.show('results'); this.refreshResultsDots(); return; }
    this.showMenu();
  }

  panel(id, title, body, opts = {}) {
    const el = $('#' + id);
    el.innerHTML = `<div class="panel ${opts.right ? 'right' : ''}">
      <div class="panel-head"><button class="back" aria-label="Back">${BACK}</button><h2>${title}</h2>${opts.wallet ? `<div class="wallet"><i class="coin-ico"></i><span>${fmt(save.data.coins)}</span></div>` : ''}</div>
      ${opts.tabs || ''}
      <div class="panel-body">${body}</div></div>`;
    $('.back', el).addEventListener('click', () => this.back());
    return el;
  }

  // ---------------------------------------------------------------- permanent upgrades
  showUpgrades(fromResults) {
    if (fromResults) this.prevScreen = 'results';
    else if (this.screen === 'menu') this.prevScreen = 'menu';
    const d = save.data;
    const rows = PERMS.map(p => {
      const lv = d.perm[p.id], maxed = lv >= p.max, cost = p.costs[lv];
      const pips = Array.from({ length: p.max }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
      const btn = maxed ? `<button class="btn off">MAX</button>` : `<button class="btn ${d.coins >= cost ? 'primary' : ''}" data-buy="${p.id}"><i class="coin-ico"></i>${fmt(cost)}</button>`;
      return `<div class="row" data-row="${p.id}"><div class="ico">${icon(p.icon)}</div><div class="txt"><b>${p.name.toUpperCase()}</b><span>${p.desc}</span><div class="pips">${pips}</div></div>${btn}</div>`;
    }).join('');
    const el = this.panel('upgrades', 'UPGRADES', rows + `<p style="margin-top:14px;font-size:12px;color:var(--muted)">Permanent. Coins you collect in runs are always kept.</p>`, { wallet: true });
    el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => this.buyPerm(b.dataset.buy)));
    this.show('upgrades');
  }

  buyPerm(id) {
    const d = save.data, p = PERMS.find(p => p.id === id), lv = d.perm[id], cost = p.costs[lv];
    if (lv >= p.max) return;
    if (d.coins < cost) {
      audio.play('deny');
      const row = $(`[data-row=${id}]`); row.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 180 });
      return;
    }
    d.coins -= cost; d.perm[id]++;
    save.write();
    audio.play('buy');
    this.showShop('upgrades');
    const row = $(`[data-row=${id}]`);
    row.animate([{ background: 'rgba(242,178,74,.16)' }, { background: 'transparent' }], { duration: 500 });
  }

  // ---------------------------------------------------------------- skins & achievements
  showSkins(tab = 'skins') {
    const d = save.data;
    const tabs = `<div class="tabs"><button class="tab ${tab === 'skins' ? 'on' : ''}" data-tab="skins">SKINS</button><button class="tab ${tab === 'ach' ? 'on' : ''}" data-tab="ach">ACHIEVEMENTS · ${d.achievements.length}/${ACHIEVEMENTS.length}</button></div>`;
    let body = '';
    if (tab === 'skins') {
      body = SKINS.map(s => {
        const owned = d.skins.includes(s.id), sel = d.skin === s.id, u = s.unlock;
        let cond = 'Unlocked', btn;
        if (sel) btn = `<button class="btn equipped off">EQUIPPED</button>`;
        else if (owned) btn = `<button class="btn" data-equip="${s.id}">EQUIP</button>`;
        else if (u.type === 'coins') { cond = 'Buy with coins'; btn = `<button class="btn ${d.coins >= u.cost ? 'primary' : ''}" data-skinbuy="${s.id}"><i class="coin-ico"></i>${fmt(u.cost)}</button>`; }
        else { cond = u.label; btn = `<button class="btn off">LOCKED</button>`; }
        if (!owned && u.type === 'kills') cond += ` (${fmt(Math.min(d.totalKills, u.kills))}/${fmt(u.kills)})`;
        if (!owned && u.type === 'floor') cond += ` (best ${d.bestFloor})`;
        return `<div class="row skin-row ${owned ? '' : 'locked'} ${sel ? 'sel' : ''}" data-row="${s.id}"><div class="swatch"><i style="background:${hex(s.c.body)}"></i><i style="background:${hex(s.c.trim)}"></i></div><div class="txt"><b>${s.name.toUpperCase()}</b><span>${cond}</span></div>${btn}</div>`;
      }).join('') + `<p style="margin-top:14px;font-size:12px;color:var(--muted)">Skins only change how you look.</p>`;
    } else {
      body = ACHIEVEMENTS.map(a => {
        const got = d.achievements.includes(a.id);
        return `<div class="row ach-row ${got ? 'got' : ''}"><div class="ico">${icon(got ? 'crit2' : 'crit')}</div><div class="txt"><b>${a.name.toUpperCase()}</b><span>${a.desc}</span></div></div>`;
      }).join('');
    }
    const el = this.panel('skins', 'SKINS', body, { wallet: true, right: true, tabs });
    el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { audio.play('click'); this.showSkins(b.dataset.tab); }));
    el.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => this.equipSkin(b.dataset.equip)));
    el.querySelectorAll('[data-skinbuy]').forEach(b => b.addEventListener('click', () => {
      const s = SKINS.find(s => s.id === b.dataset.skinbuy);
      if (d.coins < s.unlock.cost) { audio.play('deny'); return; }
      d.coins -= s.unlock.cost; d.skins.push(s.id); save.write(); audio.play('buy');
      this.equipSkin(s.id);
    }));
    this.show('skins');
  }

  equipSkin(id) {
    save.data.skin = id; save.write();
    audio.play('select');
    this.game.buildPlayerModel();
    this.showSkins('skins');
  }

  // ---------------------------------------------------------------- settings
  showSettings() {
    const s = save.data.settings;
    const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const slider = (key, label) => `<div class="set"><label>${label}</label><input type="range" min="0" max="100" value="${Math.round(s[key] * 100)}" data-range="${key}"></div>`;
    const body = slider('master', 'MASTER') + slider('music', 'MUSIC') + slider('sfx', 'EFFECTS') +
      `<div class="set"><label>SCREEN SHAKE</label>${seg('shake', [[1, 'FULL'], [0.5, 'LOW'], [0, 'OFF']])}</div>` +
      `<div class="set"><label>DAMAGE NUMBERS</label>${seg('numbers', [[true, 'ON'], [false, 'OFF']])}</div>` +
      `<div class="set"><label>QUALITY</label>${seg('quality', [['auto', 'AUTO'], ['high', 'HIGH'], ['low', 'LOW']])}</div>` +
      `<div class="controls-help">
        <b>Move</b><span>WASD / arrow keys · left stick · left side of the screen</span>
        <b>Attack</b><span>Left mouse (hold) · J · right button on touch</span>
        <b>Aim</b><span>Mouse · right stick · auto-aim on touch and keyboard</span>
        <b>Dash</b><span>Space · Shift · right mouse · K</span>
        <b>Pause</b><span>Esc · P</span>
      </div>
      <div class="danger-zone"><button class="btn ghost" data-tut>REPLAY TUTORIAL</button><button class="btn ghost" data-full>FULLSCREEN</button><button class="btn danger" data-reset>RESET PROGRESS</button></div>`;
    const el = this.panel('settings', 'SETTINGS', body);
    el.querySelectorAll('[data-range]').forEach(r => r.addEventListener('input', () => { s[r.dataset.range] = r.value / 100; this.applySettings(); save.write(); }));
    el.querySelectorAll('[data-seg]').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const key = g.dataset.seg, raw = b.dataset.v;
      s[key] = raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw;
      g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      audio.play('click'); this.applySettings(); save.write();
    }));
    $('[data-full]', el).addEventListener('click', () => {
      audio.play('click');
      const de = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen(); else (de.requestFullscreen || de.webkitRequestFullscreen || (() => { })).call(de);
    });
    $('[data-tut]', el).addEventListener('click', () => {
      audio.play('click');
      if (this.game.mode === 'run') { this.game.paused = false; audio.setMuffled(false); }
      this.game.startRun({ tutorial: true });
    });
    const reset = $('[data-reset]', el);
    reset.addEventListener('click', () => {
      if (!reset.dataset.armed) { reset.dataset.armed = 1; reset.textContent = 'TAP AGAIN TO ERASE'; audio.play('deny'); return; }
      save.reset(); audio.play('back'); this.game.buildPlayerModel(); this.showMenu();
    });
    this.show('settings');
  }

  applySettings() {
    const s = save.data.settings;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    if (this.world) { this.world.shakeScale = s.shake; if (this.world.quality !== s.quality) this.world.setQuality(s.quality); }
    if (this.fx) this.fx.showNumbers = s.numbers;
  }

  // ---------------------------------------------------------------- run HUD
  onRunStart(game) {
    this.objective(null);
    this.el.build.innerHTML = '';
    this._last = {};
    this.el.bossBar.classList.remove('on');
    this.el.hurt.classList.remove('low');
    this.fade(false, 0.25);
    this.show('hud');
  }

  onFloor(game, f) {
    this.el.floor.textContent = pad2(f);
    this.show('hud');
    this.fade(false, 0.45);
    this.el.bossBar.classList.toggle('on', false);
    if (f === 0) this.banner('TRAINING', 'FLOOR 00', true);
    else if (f % 10 !== 0) {
      const th = themeFor(f), prevTh = themeFor(f - 1);
      this.floorBanner(f, f === 1 || th !== prevTh ? th.name.toUpperCase() : '');
    }
  }

  updateHUD(game) {
    this.updatePowerHud(game);
    if (game.mode !== 'run' || !game.player) return;
    const p = game.player, el = this.el, L = this._last;
    const hpK = Math.max(0, p.hp) / p.maxHp;
    if (L.hp !== p.hp || L.max !== p.maxHp) {
      el.hpFill.style.transform = `scaleX(${hpK})`;
      el.hpLag.style.transform = `scaleX(${hpK})`;
      el.hpNum.innerHTML = `${Math.max(0, Math.ceil(p.hp))}<small> / ${p.maxHp}</small>`;
      el.hpBar.style.setProperty('--seg', (100 / Math.max(1, p.maxHp / 2)) + '%');
      el.hurt.classList.toggle('low', hpK <= 0.3 && hpK > 0);
      L.hp = p.hp; L.max = p.maxHp;
    }
    const s = game.stats;
    const pipKey = p.dashCharges + '/' + s.dashCharges + '/' + Math.round(p.dashRecharge / s.dashCooldown * 20);
    if (L.pips !== pipKey) {
      let h = '';
      for (let k = 0; k < s.dashCharges; k++) {
        if (k < p.dashCharges) h += '<i class="full"></i>';
        else if (k === p.dashCharges) h += `<i><b style="width:${p.dashRecharge / s.dashCooldown * 100}%"></b></i>`;
        else h += '<i></i>';
      }
      el.pips.innerHTML = h; L.pips = pipKey;
    }
    if (L.coins !== game.run.coins) { el.coinNum.textContent = fmt(game.run.coins); L.coins = game.run.coins; }
    // room info
    let info = '', exit = false;
    if (game.tut) info = '';
    else if (game.phase === 'fight' && !game.boss) {
      const alive = game.enemies.filter(e => !e.dead && !e.decor).length;
      let pending = 0; for (let k = game.waveIdx; k < game.waves.length; k++) pending += game.waves[k].length;
      info = `${alive + pending} LEFT` + (game.waves.length > 1 ? ` &nbsp;·&nbsp; WAVE ${Math.min(game.waveIdx, game.waves.length)}/${game.waves.length}` : '');
    } else if (game.phase === 'clear' || game.phase === 'leave') { info = 'EXIT OPEN'; exit = true; }
    if (L.info !== info) { el.info.innerHTML = info; el.info.classList.toggle('exit', exit); L.info = info; }
    // boss bar
    const b = game.boss;
    if (b && b.active && !b.dead) {
      if (!el.bossBar.classList.contains('on')) { el.bossBar.classList.add('on'); el.bossName.textContent = (b.phase2 ? '' : '') + document.querySelector('#letterbox .name').textContent; }
      const k = Math.max(0, b.hp / b.maxHp);
      if (L.boss !== k) { el.bbFill.style.transform = `scaleX(${k})`; el.bbLag.style.transform = `scaleX(${k})`; L.boss = k; }
    } else if (el.bossBar.classList.contains('on') && (!b || b.dead)) {
      el.bbFill.style.transform = 'scaleX(0)';
      setTimeout(() => el.bossBar.classList.remove('on'), 700);
    }
  }

  updateBuild(game) {
    const run = game.run;
    const order = [...new Set(run.picks)];
    const last = run.picks[run.picks.length - 1];
    this.el.build.innerHTML = order.map(id => {
      const u = UPGRADE_BY_ID[id], n = run.owned[id];
      return `<div class="bi ${u.rarity} ${id === last ? 'new' : ''}" title="${u.name}">${icon(u.icon)}${n > 1 ? `<em>${n}</em>` : ''}</div>`;
    }).join('');
  }

  coinBump() {
    const c = this.el.coins;
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }

  hurtFlash() {
    const h = this.el.hurt;
    h.classList.add('on');
    const tl = $('.hud-tl'); tl.classList.remove('shake'); void tl.offsetWidth; tl.classList.add('shake');
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => h.classList.remove('on'), 90);
  }

  onDeath() { document.body.classList.remove('playing'); }

  fade(on, dur = 0.35) {
    const f = this.el.fade;
    f.style.transitionDuration = dur + 's';
    f.style.opacity = on ? 1 : 0;
  }

  letterbox(on, name, sub) {
    const lb = this.el.letterbox;
    if (name) { $('.name', lb).textContent = name; $('.sub', lb).textContent = sub; }
    lb.classList.toggle('on', on);
    document.body.classList.toggle('playing', !on);
  }

  banner(main, sub = '', small = false) {
    const b = this.el.banner;
    $('.b-main', b).textContent = main; $('.b-sub', b).textContent = sub;
    b.classList.remove('on', 'small'); void b.offsetWidth;
    b.classList.toggle('small', small);
    b.classList.add('on');
  }

  // Elevator-style counter: the previous floor number rolls up into the new one.
  floorBanner(f, sub) {
    const b = this.el.banner;
    $('.b-main', b).innerHTML = `FLOOR <span class="roll"><span class="roll-col"><i>${pad2(Math.max(0, f - 1))}</i><i>${pad2(f)}</i></span></span>`;
    $('.b-sub', b).textContent = sub;
    b.classList.remove('on', 'small'); void b.offsetWidth;
    b.classList.add('small', 'on');
  }

  clearBanner(isBoss) { if (!isBoss) this.banner('CLEAR', '', true); }

  toast(label, text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<small>${label}</small><span>${text}</span>`;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 2700);
  }

  queueResultNote(text) { this.notes.push(text); }

  // ---------------------------------------------------------------- cards
  showCards(game, cards) {
    this.cards = cards;
    this.cardFocus = -1;
    this.cardLock = performance.now() + 380;
    const run = game.run;
    const f = run.floor;
    const el = $('#cards');
    const keys = ['1', '2', '3'];
    const html = cards.map((u, k) => {
      const lv = run.owned[u.id] || 0;
      const isNew = !save.data.discovered.includes(u.id);
      const syn = synergyWith(u, run.owned);
      const motes = u.rarity === 'legendary' ? `<div class="motes">${Array.from({ length: 7 }, (_, i) => `<i style="left:${10 + i * 13}%;animation-delay:${(i * 0.43) % 3}s"></i>`).join('')}</div>` : '';
      return `<button class="card ${u.rarity}" data-k="${k}" style="--d:${0.08 + k * 0.11}s;--rot:${(k - 1) * 2}deg">
        ${motes}<span class="c-key">${keys[k]}</span>
        <div class="c-ico">${icon(u.icon)}</div>
        <div class="c-name">${u.name}</div>
        <div class="c-desc">${u.desc}</div>
        <div class="tags">${isNew ? '<span class="tag new">NEW</span>' : ''}${syn ? `<span class="tag syn">SYNERGY · ${syn.toUpperCase()}</span>` : ''}</div>
        <div class="c-foot"><span class="c-rar">${RARITY[u.rarity].label}</span><span class="c-lv">${lv ? `LV ${lv} → ${lv + 1}` : ''}</span></div>
      </button>`;
    }).join('');
    const rerolls = run.rerolls > 0 ? `<button class="btn ghost" data-reroll>REROLL · ${run.rerolls}</button>` : '';
    el.innerHTML = `<div class="cards-wrap">
      <div class="cards-head"><small>FLOOR ${pad2(f)} ${f % 10 === 0 ? 'CONQUERED' : 'CLEARED'}</small><h2>CHOOSE AN UPGRADE</h2></div>
      <div class="card-row">${html}</div>
      <div class="cards-foot">${rerolls}<span class="keys"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> to pick${run.rerolls > 0 ? ' &nbsp;·&nbsp; <kbd>R</kbd> reroll' : ''}</span></div>
    </div>`;
    el.querySelectorAll('.card').forEach(c => {
      c.addEventListener('click', () => this.pickCard(+c.dataset.k));
      c.addEventListener('animationend', () => c.classList.add('dealt'), { once: true });
    });
    const rr = $('[data-reroll]', el); if (rr) rr.addEventListener('click', () => this.reroll());
    this.show('cards');
    cards.forEach((u, k) => setTimeout(() => { audio.play('card'); audio.play('flip'); }, 80 + k * 110));
    if (cards.some(u => u.rarity === 'legendary')) setTimeout(() => audio.play('legendary'), 300);
  }

  focusCard(i) {
    if (!this.cards) return;
    this.cardFocus = (i + this.cards.length) % this.cards.length;
    document.querySelectorAll('#cards .card').forEach((c, k) => c.classList.toggle('focus', k === this.cardFocus));
    audio.play('hover');
  }

  reroll() {
    const g = this.game;
    if (!this.cards || g.run.rerolls <= 0 || this.picking) return;
    g.run.rerolls--;
    audio.play('click');
    this.showCards(g, g.rollCards(true));
  }

  pickCard(k) {
    if (!this.cards || this.picking || performance.now() < this.cardLock) return;
    const u = this.cards[k]; if (!u) return;
    this.picking = true;
    audio.play('select');
    document.querySelectorAll('#cards .card').forEach((c, i) => { c.classList.add('dealt'); c.classList.add(i === k ? 'picked' : 'discard'); });
    const g = this.game;
    g.pickUpgrade(u);
    setTimeout(() => {
      this.picking = false; this.cards = null;
      audio.setMuffled(false);
      g.nextFloor();
    }, 430);
  }

  // ---------------------------------------------------------------- results
  showResults(game, r) {
    this.resultsAt = performance.now();
    const d = save.data;
    const notes = [];
    if (r.newBest && r.prevBest > 0) notes.push(`<span class="hl">New best: floor ${r.floor} (was ${r.prevBest})</span>`);
    if (r.lvAfter.level > r.lvBefore.level) {
      notes.push(`<span class="hl">Level up: you are now level ${r.lvAfter.level}</span>`);
      for (const w of WEAPONS) if (w.level > r.lvBefore.level && w.level <= r.lvAfter.level) notes.push(`<span class="hl">New weapon in the shop: ${w.name}</span>`);
    }
    for (const s of r.skins) notes.push(`<span class="hl">New skin unlocked: ${s.name}</span>`);
    for (const n of this.notes) notes.push(`<span class="hl">${n}</span>`);
    if (r.discoveries) notes.push(`${r.discoveries} new upgrade${r.discoveries > 1 ? 's' : ''} discovered`);
    this.notes = [];
    // One concrete next goal keeps the "one more run" pull.
    const goal = this.nextGoal(r);
    if (goal) notes.push(goal);

    const el = $('#results');
    el.innerHTML = `<div class="res">
      <div class="res-top"><div><small>YOU REACHED</small><div class="res-floor">FLOOR <em>${r.floor}</em></div></div>${r.newBest ? '<span class="chip">NEW BEST!</span>' : ''}</div>
      <div class="res-stats">
        <div><small>Enemies</small><b data-count="${r.kills}">0</b></div>
        <div><small>Coins</small><b data-count="${r.coins}">0</b></div>
        <div><small>Best floor</small><b>${r.best}</b></div>
        <div><small>XP</small><b data-count="${r.xp}" data-prefix="+">0</b></div>
      </div>
      <div class="res-xp"><span>LV ${r.lvAfter.level}</span><div class="xpbar"><i style="width:${r.lvAfter.level > r.lvBefore.level ? 0 : r.lvBefore.into / r.lvBefore.need * 100}%"></i></div><span style="color:var(--muted)">${fmt(d.coins)} <i class="coin-ico" style="width:11px;height:11px;vertical-align:-1px"></i></span></div>
      ${r.mastery ? (() => { const a = ABILITY_BY_ID[r.mastery.id], m = r.mastery; return `<div class="res-mastery" style="--pc:${a.css}"><span class="rm-ico">${xicon(a.icon)}</span><div class="rm-main"><b>${a.name} <em>LV ${m.after.level}</em>${m.rewards.length ? '<span class="rm-up">LEVEL UP</span>' : ''}</b><div class="xpbar"><i data-w="${m.after.need ? m.after.into / m.after.need * 100 : 100}" style="width:${m.rewards.length ? 0 : (m.before.need ? m.before.into / m.before.need * 100 : 100)}%"></i></div></div><span class="rm-xp">+${fmt(r.xp)} XP</span></div>${m.rewards.length ? `<div class="rm-rewards">${m.rewards.map((l, i) => `<span style="animation-delay:${0.9 + i * 0.15}s">LV ${l} · ${rewardLabelFor(a, l)}</span>`).join('')}</div>` : ''}`; })() : ''}
      <div class="res-notes">${notes.map(n => `<div>${n}</div>`).join('')}</div>
      <div class="res-btns">
        <button class="btn primary" data-again>PLAY AGAIN</button>
        <button class="btn ${this.canAffordPerm() ? 'has-dot' : ''}" data-up>SHOP</button>
        <button class="btn ghost" data-menu>MENU</button>
      </div>
      <div class="res-hint">Space / Enter to play again</div>
    </div>`;
    $('[data-again]', el).addEventListener('click', () => this.playAgain());
    $('[data-up]', el).addEventListener('click', () => { audio.play('click'); this.prevScreen = 'results'; this.screen = 'results'; this.showShop('upgrades'); });
    $('[data-menu]', el).addEventListener('click', () => { audio.play('back'); game.enterMenu(); this.showMenu(); });
    this.show('results');
    this.hud.classList.remove('on');
    audio.setMuffled(false);
    audio.setMode('menu');
    // count-up
    const t0 = performance.now();
    const counters = [...el.querySelectorAll('[data-count]')];
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      for (const c of counters) c.textContent = (c.dataset.prefix || '') + fmt(+c.dataset.count * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => {
      const bar = $('.res-xp .xpbar i', el); if (bar) bar.style.width = (r.lvAfter.into / r.lvAfter.need * 100) + '%';
      const mb = $('.res-mastery .xpbar i', el); if (mb) mb.style.width = mb.dataset.w + '%';
    }, 50);
    if (r.mastery && r.mastery.rewards.length) setTimeout(() => audio.play('levelUp'), 900);
  }

  refreshResultsDots() { const b = $('#results [data-up]'); if (b) b.classList.toggle('has-dot', this.canAffordPerm()); }

  nextGoal(r) {
    const d = save.data;
    const perm = PERMS.map(p => ({ p, lv: d.perm[p.id] })).filter(x => x.lv < x.p.max).sort((a, b) => a.p.costs[a.lv] - b.p.costs[b.lv])[0];
    if (perm && d.coins >= perm.p.costs[perm.lv]) return `<span class="hl">You can afford ${perm.p.name} ${perm.lv + 1}: ${perm.p.desc}</span>`;
    const nextBoss = Math.ceil((r.floor + 1) / 10) * 10;
    const skin = SKINS.find(s => s.unlock.type === 'coins' && !d.skins.includes(s.id));
    if (perm) {
      const need = perm.p.costs[perm.lv] - d.coins;
      if (need <= 60) return `${need} coins until ${perm.p.name} ${perm.lv + 1}`;
    }
    if (skin && skin.unlock.cost - d.coins <= 150) return `${skin.unlock.cost - d.coins} coins until the ${skin.name} skin`;
    if (nextBoss - r.floor <= 4) return `Floor ${nextBoss} boss was ${nextBoss - r.floor} floor${nextBoss - r.floor > 1 ? 's' : ''} away`;
    if (perm) return `${perm.p.costs[perm.lv] - d.coins} coins until ${perm.p.name} ${perm.lv + 1}`;
    return '';
  }

  playAgain() {
    if (performance.now() - this.resultsAt < 250) return;
    audio.play('click');
    this.game.startRun();
  }

  // ---------------------------------------------------------------- pause
  togglePause(game) {
    if (game.mode !== 'run') return;
    if (game.paused) {
      game.paused = false; audio.setMuffled(false); this.show('hud'); audio.play('back');
      return;
    }
    if (!['fight', 'clear', 'arrive'].includes(game.phase)) return;
    game.paused = true; audio.setMuffled(true); audio.play('click');
    const run = game.run;
    const order = [...new Set(run.picks)];
    const el = $('#pause');
    el.innerHTML = `<div class="pause-box"><h2>PAUSED</h2><nav class="menu-list">
        <button class="mi mi-play" data-p="resume">RESUME</button>
        <button class="mi" data-p="settings">SETTINGS</button>
        <button class="mi" data-p="quit">END RUN</button></nav></div>
      <div class="pause-build"><h3>BUILD · FLOOR ${run.floor}</h3>${order.length ? order.map(id => { const u = UPGRADE_BY_ID[id]; return `<div class="pb" style="color:${RARITY[u.rarity].color}">${icon(u.icon)}<span style="color:var(--text)">${u.name}</span><em>×${run.owned[id]}</em></div>`; }).join('') : '<div class="pb" style="color:var(--muted)">No upgrades yet</div>'}</div>`;
    el.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.p;
      if (a === 'resume') this.togglePause(game);
      else if (a === 'settings') { audio.play('click'); this.prevScreen = 'pause'; this.showSettings(); }
      else if (a === 'quit') { game.paused = false; audio.setMuffled(false); game.killPlayer(); this.show('hud'); }
    }));
    this.show('pause');
  }

  // ---------------------------------------------------------------- intercom dialog
  dialog(lines, choices) {
    return new Promise(resolve => {
      const el = $('#dialog');
      this.dlg = { lines, choices, idx: -1, resolve, choicesShown: false, focus: 0 };
      el.classList.add('on');
      document.body.classList.add('dialog-open');
      $('.dlg-choices', el).innerHTML = '';
      audio.play('dialogOpen');
      this.mountOperator($('.dlg-portrait .op-view', el));
      this.dialogNext();
    });
  }

  dialogNext() {
    const d = this.dlg, el = $('#dialog');
    d.idx++;
    if (d.idx >= d.lines.length) { this.dialogClose(undefined); return; }
    const text = d.lines[d.idx];
    const tEl = $('.dlg-text', el);
    tEl.textContent = '';
    el.classList.add('talking'); el.classList.remove('waiting');
    d.typing = true; d.chars = 0;
    clearInterval(d.timer);
    d.timer = setInterval(() => {
      d.chars += 1;
      tEl.textContent = text.slice(0, d.chars);
      if (d.chars % 3 === 1 && text[d.chars - 1] !== ' ') audio.play('talk');
      if (d.chars >= text.length) this.dialogTypeDone();
    }, 22);
  }

  dialogTypeDone() {
    const d = this.dlg, el = $('#dialog');
    clearInterval(d.timer); d.typing = false;
    $('.dlg-text', el).textContent = d.lines[d.idx];
    el.classList.remove('talking'); el.classList.add('waiting');
    if (d.idx === d.lines.length - 1 && d.choices) {
      d.choicesShown = true;
      el.classList.add('has-choices');
      const box = $('.dlg-choices', el);
      box.innerHTML = d.choices.map((c, i) => `<button class="btn ${i === 0 ? 'primary' : 'ghost'}" data-v="${c.value}">${c.label}</button>`).join('');
      box.querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); this.dialogChoose(b.dataset.v); }));
      this.renderChoiceFocus();
    }
  }

  renderChoiceFocus() {
    const btns = document.querySelectorAll('#dialog .dlg-choices button');
    btns.forEach((b, i) => b.classList.toggle('kfocus', i === (this.dlg.focus || 0) && !input.touchMode));
  }

  dialogAdvance() {
    const d = this.dlg; if (!d) return;
    if (d.typing) { this.dialogTypeDone(); return; }
    if (d.choicesShown) return;
    audio.play('click');
    this.dialogNext();
  }

  dialogChoose(v) { audio.play('select'); this.dialogClose(v); }

  dialogClose(v) {
    const d = this.dlg, el = $('#dialog');
    clearInterval(d.timer);
    el.classList.remove('on', 'talking', 'waiting', 'has-choices');
    document.body.classList.remove('dialog-open');
    this.dlg = null;
    d.resolve(v);
  }

  // ---------------------------------------------------------------- tutorial objective
  objective(o) {
    const el = $('#objective');
    if (!o) { el.classList.remove('on', 'done'); return; }
    $('.obj-label', el).textContent = o.label;
    $('.obj-text span', el).textContent = o.text;
    $('.obj-hint', el).innerHTML = o.hint || '';
    el.classList.remove('on', 'done'); void el.offsetWidth;
    el.classList.add('on');
  }
  objectiveDone() { $('#objective').classList.add('done'); }

  // ---------------------------------------------------------------- world-space indicators
  drawIndicators(game) {
    if (game.mode !== 'run' || game.phase !== 'clear') return;
    const lift = this.world.exitLift; if (!lift) return;
    const fx = this.fx, ctx = fx.ctx, W = fx.cv.width, H = fx.cv.height, dpr = fx.dpr;
    const v = this._v.set(lift.x, 2.2, lift.z).project(this.world.camera);
    let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
    const m = 48 * dpr, t = performance.now() / 1000;
    const on = sx > m && sx < W - m && sy > m && sy < H - m;
    ctx.save();
    ctx.fillStyle = '#f2b24a'; ctx.strokeStyle = 'rgba(12,12,16,.85)'; ctx.lineWidth = 3 * dpr; ctx.lineJoin = 'round';
    if (on) {
      const y = sy + Math.sin(t * 5) * 6 * dpr;
      ctx.beginPath(); ctx.moveTo(sx - 11 * dpr, y - 8 * dpr); ctx.lineTo(sx + 11 * dpr, y - 8 * dpr); ctx.lineTo(sx, y + 6 * dpr); ctx.closePath();
      ctx.stroke(); ctx.fill();
    } else {
      const cx = W / 2, cy = H / 2, a = Math.atan2(sy - cy, sx - cx);
      const ex = Math.max(m, Math.min(W - m, cx + Math.cos(a) * W)), ey = Math.max(m, Math.min(H - m, cy + Math.sin(a) * H));
      ctx.translate(ex, ey); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(14 * dpr, 0); ctx.lineTo(-8 * dpr, -11 * dpr); ctx.lineTo(-8 * dpr, 11 * dpr); ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
    ctx.restore();
  }
}

installScreens(UI);

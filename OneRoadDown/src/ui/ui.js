// DOM user interface: loading screen, menus, garage panels, HUD, countdown,
// run summary, pause, settings, achievements, credits, toasts.

import { fmtMoney, fmtKm, clamp, rng } from '../core/util.js';
import { Speedo } from './speedo.js';
import { audio } from '../audio/audio.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const $ = (root, sel) => root.querySelector(sel);

export const TIPS = [
  'Better suspension reduces landing damage.',
  'Armour protects your car but adds weight.',
  'Off-road tyres lose performance on asphalt.',
  'Fuel becomes increasingly important deeper into the mountain.',
  'Long descents cook weak brakes. Upgraded brakes resist fade.',
  'A turbo without cooling will overheat the engine.',
  'Hand-painted SHORTCUT signs mark the risky way down.',
  'Weight reduction makes every other upgrade work better.',
  'Engine power raises your speed ceiling; the transmission decides how far it goes.',
  'Snow tyres turn the Snow Line from a nightmare into a road.',
  'Torque pulls you out of hairpins and through mud.',
  'Repair kits are rare. Drive like you know that.',
  'A guard rail will stop you once. Maybe.',
];

export class UI {
  constructor(root) {
    this.root = root;
    this.handlers = {};
    this.screens = {};
    this.build();
  }

  on(name, fn) { this.handlers[name] = fn; }

  // ------------------------------------------------------------- keyboard navigation
  // Arrow keys / WASD move focus spatially between controls of the visible screens,
  // Enter or Space activates, left/right adjust sliders. Driving keys are untouched
  // while a run is active (navEnabled = false).
  focusables() {
    const scopes = this.modalOpen ? [this.screens.modal] : Object.entries(this.screens).filter(([k, s]) => k !== 'modal' && s.classList.contains('show')).map(([, s]) => s);
    const out = [];
    for (const sc of scopes) sc.querySelectorAll('button:not([disabled]), .upg, .vrow, .sw:not(.lock), input[type=range]').forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (!el.hasAttribute('tabindex') && el.tagName !== 'BUTTON' && el.tagName !== 'INPUT') el.tabIndex = 0;
      out.push(el);
    });
    return out;
  }
  navKey(e) {
    const dirs = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
    const list = this.focusables();
    if (!list.length) return false;
    let cur = document.activeElement;
    if (!list.includes(cur)) cur = null;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || (e.code === 'Space' && cur)) {
      if (!cur) { this.focusFirst(list); return true; }
      if (cur.matches('.upg.sel')) { const b = this.gpanel.querySelector('.detail .buy:not([disabled])'); if (b) { b.click(); return true; } }
      if (cur.matches('.vrow.sel, .sw.on')) { const b = this.gpanel.querySelector('.detail .act:not([disabled])'); if (b) { b.click(); return true; } }
      cur.click();
      return true;
    }
    const d = dirs[e.code];
    if (!d) return false;
    if (cur && cur.type === 'range' && d[0]) { cur.value = +cur.value + d[0] * 0.05; cur.dispatchEvent(new Event('input')); return true; }
    if (!cur) { this.focusFirst(list); return true; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bs = 1e9;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const along = dx * d[0] + dy * d[1];
      if (along <= 4) continue;
      const across = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
      const sc = along + across * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) { best.focus({ preventScroll: false }); best.scrollIntoView({ block: 'nearest' }); audio()?.ui('hover'); }
    return true;
  }
  focusFirst(list) {
    const pref = list.find((el) => el.matches('.mitem.primary, .sel-btn, .s-retry, .upg.sel, .vrow.sel, .sw.on')) || list[0];
    pref.focus(); pref.scrollIntoView({ block: 'nearest' });
  }
  emit(name, ...a) { const f = this.handlers[name]; if (f) return f(...a); }

  build() {
    const r = this.root;
    r.innerHTML = '';
    r.appendChild(h('<canvas id="grain"></canvas>'));
    r.appendChild(h('<div id="vignette"></div>'));
    r.appendChild(h('<div id="fade"></div>'));
    r.appendChild(h('<div id="toast"></div>'));
    this.fadeEl = $(r, '#fade');
    this.toastEl = $(r, '#toast');
    this.paintGrain();
    // loading screen
    const boot = h(`<div id="boot" class="screen show live">
      <canvas class="art"></canvas>
      <div class="logo"><div class="logotype">ONE ROAD <span class="thin">DOWN</span></div><div class="tagline">HOLLOW PEAK · 25 KM · ONE WAY</div></div>
      <div class="press">CLICK OR PRESS ANY KEY</div>
      <div class="foot"><div class="tip"><b>TIP</b><span></span></div>
      <div class="barrow"><div class="bar"><i></i></div><div class="status">STARTING ENGINE…</div></div></div>
    </div>`);
    r.appendChild(boot);
    this.screens.boot = boot;
    // menu
    const menu = h(`<div id="menu" class="screen live">
      <div class="col">
        <div class="logotype">ONE ROAD <span class="thin">DOWN</span></div>
        <div class="sub">HOLLOW PEAK PASS ROAD</div>
        <div class="mlist">
          <button class="mitem primary" data-a="continue">CONTINUE</button>
          <button class="mitem" data-a="garage">GARAGE</button>
          <button class="mitem" data-a="vehicles">VEHICLES</button>
          <button class="mitem" data-a="mountain">MOUNTAIN <small></small></button>
          <button class="mitem" data-a="settings">SETTINGS</button>
          <button class="mitem" data-a="achievements">ACHIEVEMENTS <small></small></button>
          <button class="mitem" data-a="credits">CREDITS</button>
        </div>
      </div>
      <div class="infobar">
        <div class="kv"><span>BEST DISTANCE</span><b class="i-best">0.00 KM</b></div>
        <div class="kv"><span>CURRENT CAR</span><b class="i-car">—</b></div>
        <div class="kv"><span>CASH</span><b class="i-cash">$0</b></div>
        <div class="ver">v1.0 · BROWSER EDITION</div>
      </div>
    </div>`);
    menu.querySelectorAll('[data-a]').forEach((b) => {
      b.addEventListener('click', () => { audio()?.ui('click'); this.emit('menu', b.dataset.a); });
      b.addEventListener('mouseenter', () => audio()?.ui('hover'));
    });
    r.appendChild(menu);
    this.screens.menu = menu;
    // first start
    const first = h(`<div id="first" class="screen">
      <div class="toptitle"><h2>CHOOSE YOUR FIRST CAR<small>THREE WRECKS. ONE MOUNTAIN. PICK ONE.</small></h2></div>
      <div class="carcard panel live"></div>
      <div class="nav-arrows live"><button class="arrow" data-d="-1">‹</button><div class="dots"></div><button class="arrow" data-d="1">›</button></div>
      <div class="bottombar live"><button class="btn main sel-btn">SELECT VEHICLE</button></div>
    </div>`);
    first.querySelectorAll('.arrow').forEach((b) => b.addEventListener('click', () => { audio()?.ui('click'); this.emit('firstNav', +b.dataset.d); }));
    $(first, '.sel-btn').addEventListener('click', () => { audio()?.ui('buy'); this.emit('firstSelect'); });
    r.appendChild(first);
    this.screens.first = first;
    // garage
    const gar = h(`<div id="garage" class="screen">
      <div class="toptitle"><h2 class="g-title">GARAGE<small class="g-sub"></small></h2><div class="cash"><span>CASH</span><b class="g-cash">$0</b></div></div>
      <div class="gtabs live">
        <button class="gtab on" data-t="upgrades">UPGRADES</button>
        <button class="gtab" data-t="vehicles">VEHICLES</button>
        <button class="gtab" data-t="dealer">DEALER</button>
        <button class="gtab" data-t="paint">PAINT</button>
        <button class="gtab" data-t="garage">GARAGE</button>
        <button class="gtab" data-t="menu">MENU</button>
        <button class="gtab drive" data-t="drive">DRIVE ›</button>
      </div>
      <div class="gpanel panel live"></div>
      <div class="gstats panel"></div>
      <div class="installing">INSTALLING<i></i></div>
      <div class="keyhints">↑↓←→ SELECT · ENTER BUY / CHOOSE · Q E SWITCH TAB · ESC MENU · DRAG TO ROTATE</div>
    </div>`);
    gar.querySelectorAll('.gtab').forEach((b) => {
      b.addEventListener('click', () => { audio()?.ui(b.dataset.t === 'drive' ? 'buy' : 'click'); this.emit('gtab', b.dataset.t); });
      b.addEventListener('mouseenter', () => audio()?.ui('hover'));
    });
    r.appendChild(gar);
    this.screens.garage = gar;
    // hud
    const hud = h(`<div id="hud" class="screen">
      <div class="tl"><div class="dist">0.00<small>KM</small></div><div class="best">BEST <b>0.00 KM</b></div><div class="region"></div></div>
      <div class="tr"><div class="money"><small>CASH</small><span>$0</span></div><div class="gain"></div></div>
      <button class="pausebtn live" aria-label="Pause"></button>
      <div class="feed"></div>
      <div class="notice"><div class="n"></div></div>
      <div class="hint"></div>
      <div class="bottom">
        <div class="gauge g-fuel"><div class="lab">FUEL <b>0 L</b></div><div class="track"><i></i></div><div class="dmg"><span data-k="engine">ENGINE</span><span data-k="tires">TYRES</span></div></div>
        <canvas class="speedo"></canvas>
        <div class="gauge g-hp"><div class="lab">CONDITION <b>100%</b></div><div class="track"><i></i></div><div class="dmg"><span data-k="susp">SUSP</span><span data-k="brakes">BRAKES</span></div></div>
      </div>
      <div class="fps"></div>
    </div>`);
    $(hud, '.pausebtn').addEventListener('click', () => this.emit('pause'));
    r.appendChild(hud);
    this.screens.hud = hud;
    this.speedo = new Speedo($(hud, 'canvas.speedo'));
    // touch controls
    const touch = h(`<div id="touch" class="screen">
      <div class="tbtn l" data-touch="left"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></div>
      <div class="tbtn r" data-touch="right"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></div>
      <div class="tbtn gas" data-touch="gas">GAS</div>
      <div class="tbtn brk" data-touch="brake">BRAKE</div>
      <div class="tbtn boost" data-touch="boost">TURBO</div>
      <div class="tbtn hand" data-touch="hand">HANDBRAKE</div>
    </div>`);
    r.appendChild(touch);
    this.screens.touch = touch;
    // countdown
    const count = h('<div id="count" class="screen"><div class="rec">CURRENT RECORD<b>0.00 KM</b></div><div class="num"></div></div>');
    r.appendChild(count);
    this.screens.count = count;
    // summary
    const sum = h('<div id="summary" class="screen live"><div class="panel"></div></div>');
    r.appendChild(sum);
    this.screens.summary = sum;
    // pause
    const pause = h(`<div id="pause" class="screen live"><div><h2>PAUSED</h2><div class="mlist">
      <button class="mitem" data-a="resume">RESUME</button>
      <button class="mitem" data-a="restart">RESTART RUN</button>
      <button class="mitem" data-a="settings">SETTINGS</button>
      <button class="mitem" data-a="garage">BACK TO GARAGE</button></div></div></div>`);
    pause.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { audio()?.ui('click'); this.emit('pauseMenu', b.dataset.a); }));
    r.appendChild(pause);
    this.screens.pause = pause;
    // modal
    const modal = h('<div id="modal" class="screen modal live"><div class="panel"><div class="ptitle"><span class="m-title"></span><button class="btn small m-close">CLOSE</button></div><div class="body"></div></div></div>');
    $(modal, '.m-close').addEventListener('click', () => { audio()?.ui('back'); this.closeModal(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });
    r.appendChild(modal);
    this.screens.modal = modal;
  }

  paintGrain() {
    // small tiling noise tile used as a CSS background (cheap, resolution independent)
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    const R = rng(3);
    for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const el = $(this.root, '#grain');
    const div = document.createElement('div');
    div.id = 'grain';
    div.style.backgroundImage = `url(${c.toDataURL()})`;
    el.replaceWith(div);
  }

  show(name, on = true) { const s = this.screens[name]; if (s) s.classList.toggle('show', on); }
  only(...names) {
    for (const k of Object.keys(this.screens)) if (k !== 'modal') this.show(k, names.includes(k));
    this.autoFocus();
  }
  autoFocus() {
    setTimeout(() => {
      if (document.body.classList.contains('touch')) return;
      const l = this.focusables();
      if (l.length && !l.includes(document.activeElement)) this.focusFirst(l);
    }, 120);
  }
  fade(on) { this.fadeEl.classList.toggle('on', on); return new Promise((res) => setTimeout(res, 620)); }

  toast(html, ms) {
    const d = document.createElement('div');
    d.innerHTML = html;
    this.toastEl.appendChild(d);
    setTimeout(() => d.remove(), ms || 3400);
  }

  // ------------------------------------------------------------- boot
  bootArt() {
    // painted mountain backdrop: layered ridges, mist and a thin road line
    const boot = this.screens.boot, c = $(boot, 'canvas.art');
    const W = (c.width = innerWidth), H = (c.height = innerHeight);
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1d2632'); sky.addColorStop(0.55, '#5d6a74'); sky.addColorStop(1, '#2a2d30');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const R = rng(11);
    const layers = [['#46525c', 0.32, 0.36], ['#3a444c', 0.42, 0.3], ['#2c343a', 0.55, 0.26], ['#1e2428', 0.7, 0.2], ['#121619', 0.86, 0.14]];
    layers.forEach(([col, base, amp], li) => {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, H);
      let y = H * base;
      const peaks = [];
      for (let x = 0; x <= W + 20; x += 18) {
        const n = Math.sin(x * 0.004 + li * 2) * 0.5 + Math.sin(x * 0.011 + li) * 0.3 + (R() - 0.5) * 0.12;
        y = H * (base - amp * 0.5 * (n + 0.6));
        peaks.push([x, y]);
        g.lineTo(x, y);
      }
      g.lineTo(W, H); g.closePath(); g.fill();
      if (li === 0) { // snow caps
        g.fillStyle = 'rgba(225,230,235,0.55)';
        for (const [x, y] of peaks) if (y < H * 0.2) { g.beginPath(); g.moveTo(x - 12, y + 14); g.lineTo(x, y); g.lineTo(x + 12, y + 14); g.fill(); }
      }
      // mist band
      const m = g.createLinearGradient(0, H * base - 30, 0, H * base + 60);
      m.addColorStop(0, 'rgba(160,172,180,0)'); m.addColorStop(0.5, 'rgba(160,172,180,0.12)'); m.addColorStop(1, 'rgba(160,172,180,0)');
      g.fillStyle = m; g.fillRect(0, H * base - 30, W, 90);
    });
    // the road: a pale switchback line on the nearest slope
    g.strokeStyle = 'rgba(200,190,170,0.35)'; g.lineWidth = 2;
    g.beginPath();
    let x = W * 0.62, y = H * 0.58;
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) { const dx = (i % 2 ? -1 : 1) * W * (0.08 + i * 0.03); g.quadraticCurveTo(x + dx, y + H * 0.02, x + dx * 0.9, y + H * 0.05); x += dx * 0.9; y += H * 0.05; }
    g.stroke();
    boot.classList.add('art-on');
  }
  setLoad(p, text) {
    const b = this.screens.boot;
    $(b, '.bar i').style.width = Math.round(clamp(p, 0, 1) * 100) + '%';
    if (text) $(b, '.status').textContent = text;
  }
  cycleTips() {
    const el = $(this.screens.boot, '.tip span');
    let i = Math.floor(Math.random() * TIPS.length);
    const next = () => { el.parentElement.style.opacity = 0; setTimeout(() => { el.textContent = TIPS[i++ % TIPS.length]; el.parentElement.style.opacity = 1; }, 500); };
    next();
    this.tipTimer = setInterval(next, 4200);
  }
  bootReady() { this.screens.boot.classList.add('ready'); $(this.screens.boot, '.status').textContent = 'READY'; }
  endBoot() { clearInterval(this.tipTimer); this.show('boot', false); }

  // ------------------------------------------------------------- menu
  setMenu(d) {
    const m = this.screens.menu;
    $(m, '.i-best').textContent = fmtKm(d.best) + ' KM';
    $(m, '.i-car').textContent = d.car || '—';
    $(m, '.i-cash').textContent = fmtMoney(d.cash);
    $(m, '[data-a=continue]').firstChild.textContent = d.hasCar ? 'CONTINUE' : 'START';
    $(m, '[data-a=achievements] small').textContent = d.ach;
    $(m, '[data-a=mountain] small').textContent = d.mountain;
    $(m, '[data-a=mountain]').style.display = d.mountains > 1 ? '' : 'none';
    $(m, '.sub').textContent = d.mountainTitle;
  }

  // ------------------------------------------------------------- car stat block
  statBlock(rows) {
    return rows.map((r) => {
      const bar = r.frac !== undefined ? `<div class="barline">${r.maxFrac !== undefined ? `<i class="max" style="width:${r.maxFrac * 100}%"></i>` : ''}<i style="width:${clamp(r.frac, 0, 1) * 100}%"></i></div>` : '';
      const delta = r.delta ? `<span class="delta ${r.deltaNeg ? 'neg' : ''}">${r.delta}</span>` : '';
      return `<div class="st ${r.up ? 'up' : ''}"><label>${r.label}</label><b>${r.value}<em>${r.unit || ''}</em>${delta}</b>${bar}</div>`;
    }).join('');
  }

  setFirst(car, rows, idx, n) {
    const f = this.screens.first;
    $(f, '.carcard').innerHTML = `<div class="head"><div class="cls">${car.cls}</div><div class="nm">${car.name}</div><div class="desc">${car.desc}</div>
      <div class="traits">${car.traits.map((t) => `<span>${t}</span>`).join('')}</div></div><div class="stats">${this.statBlock(rows)}</div>`;
    $(f, '.dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
  }

  // ------------------------------------------------------------- garage
  setGarageHeader(title, sub, cash) {
    const g = this.screens.garage;
    $(g, '.g-title').firstChild.textContent = title;
    $(g, '.g-sub').textContent = sub;
    $(g, '.g-cash').textContent = fmtMoney(cash);
  }
  setGarageTab(t) { this.screens.garage.querySelectorAll('.gtab').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); }
  get gpanel() { return $(this.screens.garage, '.gpanel'); }
  setGStats(html) { $(this.screens.garage, '.gstats').innerHTML = html; $(this.screens.garage, '.gstats').style.display = html ? '' : 'none'; }
  installing(on) { $(this.screens.garage, '.installing').classList.toggle('show', on); if (on) { const i = $(this.screens.garage, '.installing i'); i.replaceWith(i.cloneNode()); } }

  // ------------------------------------------------------------- hud
  hudInit(best, cash) {
    const h2 = this.screens.hud;
    this.hudBest = best;
    $(h2, '.best b').textContent = fmtKm(best) + ' KM';
    $(h2, '.dist').classList.remove('rec');
    this.cashShown = cash;
    $(h2, '.money span').textContent = fmtMoney(cash);
    $(h2, '.gain').textContent = '';
    $(h2, '.feed').innerHTML = '';
    this.speedo.resize();
  }
  hud(d) {
    const H2 = this.screens.hud;
    if (!this._h) this._h = { dist: $(H2, '.dist'), money: $(H2, '.money span'), fuelB: $(H2, '.g-fuel .lab b'), fuelI: $(H2, '.g-fuel .track i'), fuelG: $(H2, '.g-fuel'), hpB: $(H2, '.g-hp .lab b'), hpI: $(H2, '.g-hp .track i'), hpG: $(H2, '.g-hp'), dmg: H2.querySelectorAll('.dmg span'), region: $(H2, '.region'), fps: $(H2, '.fps') };
    const E = this._h;
    E.dist.firstChild.textContent = fmtKm(d.dist);
    E.dist.classList.toggle('rec', d.record);
    this.cashShown += (d.cash - this.cashShown) * 0.15;
    if (Math.abs(d.cash - this.cashShown) < 1) this.cashShown = d.cash;
    E.money.textContent = fmtMoney(this.cashShown);
    E.fuelB.textContent = d.fuel.toFixed(1) + ' L';
    E.fuelI.style.width = (d.fuelFrac * 100).toFixed(1) + '%';
    E.fuelG.classList.toggle('warn', d.fuelFrac < 0.15);
    E.hpB.textContent = Math.max(0, Math.round(d.hp * 100)) + '%';
    E.hpI.style.width = Math.max(0, d.hp * 100).toFixed(1) + '%';
    E.hpG.classList.toggle('warn', d.hp < 0.25);
    E.dmg.forEach((s) => { const v = d.parts[s.dataset.k]; s.className = v < 0.25 ? 'c' : v < 0.6 ? 'w' : ''; });
    E.region.textContent = d.region;
    E.fps.textContent = d.fps || '';
  }
  hudSpeedo(d) { this.speedo.draw(d); }
  notice(text, sub = '', amber = false, ms = 2200) {
    const n = $(this.screens.hud, '.notice .n');
    n.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
    n.className = 'n show' + (amber ? ' amber' : '');
    clearTimeout(this._nt);
    this._nt = setTimeout(() => n.classList.remove('show'), ms);
  }
  feed(text, amount) {
    const f = $(this.screens.hud, '.feed');
    const d = document.createElement('div');
    d.innerHTML = text + (amount ? `<em>+${fmtMoney(amount)}</em>` : '');
    f.appendChild(d);
    setTimeout(() => d.remove(), 2700);
    while (f.children.length > 5) f.firstChild.remove();
  }
  hint(html, ms = 4000) {
    const el = $(this.screens.hud, '.hint');
    el.innerHTML = html; el.classList.add('show');
    clearTimeout(this._hint);
    this._hint = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------- countdown
  async countdown(best, onTick) {
    const c = this.screens.count;
    $(c, '.rec b').textContent = fmtKm(best) + ' KM';
    $(c, '.rec').style.display = best > 0 ? '' : 'none';
    this.show('count', true);
    const num = $(c, '.num');
    await new Promise((r) => setTimeout(r, 900));
    for (const v of ['3', '2', '1', 'GO']) {
      num.textContent = v; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
      onTick && onTick(v);
      await new Promise((r) => setTimeout(r, v === 'GO' ? 450 : 650));
    }
    $(c, '.rec').style.display = 'none';
    setTimeout(() => this.show('count', false), 400);
  }

  // ------------------------------------------------------------- summary
  summary(d) {
    const s = this.screens.summary, p = $(s, '.panel');
    const lines = d.lines.map((l) => `<div class="line"><span>${l[0]}</span><b>${l[1]}</b></div>`).join('');
    const cond = Object.entries(d.condition).map(([k, v]) => `<span>${k}<i>${Math.round(v * 100)}%</i></span>`).join('');
    p.innerHTML = `<div class="why">${d.reason}</div><h2>${d.title}</h2>
      <div class="bigd"><div><b>${fmtKm(d.distance)}<small>KM</small></b></div>${d.record ? '<div class="recbadge">NEW RECORD</div>' : ''}</div>
      <div class="lines">${lines}<div class="line total"><span>TOTAL</span><b>${fmtMoney(d.total)}</b></div></div>
      <div class="cond-row">${cond}</div>
      ${d.next ? `<div class="next">${d.next}</div>` : ''}
      <div class="foot"><button class="btn s-garage">GARAGE</button><button class="btn main s-retry">RETRY <span style="opacity:.5;font-size:.8em;letter-spacing:.1em">[R]</span></button></div>`;
    $(p, '.s-retry').addEventListener('click', () => { audio()?.ui('buy'); this.emit('retry'); });
    $(p, '.s-garage').addEventListener('click', () => { audio()?.ui('click'); this.emit('toGarage'); });
    this.show('summary', true);
    this.autoFocus();
    const ls = p.querySelectorAll('.line');
    ls.forEach((l, i) => setTimeout(() => { l.classList.add('show'); audio()?.ui('hover'); }, 250 + i * 160));
  }

  // ------------------------------------------------------------- modal content
  openModal(title, html, onMount) {
    const m = this.screens.modal;
    $(m, '.m-title').textContent = title;
    $(m, '.body').innerHTML = html;
    m.classList.add('show');
    onMount && onMount($(m, '.body'));
    this.autoFocus();
  }
  closeModal() { this.screens.modal.classList.remove('show'); this.emit('modalClosed'); }
  get modalOpen() { return this.screens.modal.classList.contains('show'); }

  settings(set, onChange) {
    const seg = (key, opts) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(set[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const rng2 = (key) => `<input type="range" min="0" max="1" step="0.05" value="${set[key]}" data-k="${key}">`;
    this.openModal('SETTINGS', `
      <div class="srow"><label>MASTER VOLUME</label>${rng2('master')}</div>
      <div class="srow"><label>MUSIC</label>${rng2('music')}</div>
      <div class="srow"><label>SOUND EFFECTS</label>${rng2('sfx')}</div>
      <div class="srow"><label>GRAPHICS</label>${seg('quality', [['auto', 'AUTO'], ['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']])}</div>
      <div class="srow"><label>CAMERA</label>${seg('camera', [['chase', 'CHASE'], ['far', 'FAR'], ['hood', 'HOOD'], ['cockpit', 'FIRST PERSON']])}</div>
      <div class="srow"><label>SPEED UNITS</label>${seg('units', [['kmh', 'KM/H'], ['mph', 'MPH']])}</div>
      <div class="srow"><label>DRIVING ASSIST</label>${seg('assist', [['true', 'ON'], ['false', 'OFF']])}</div>
      <div class="srow"><label>CAMERA SHAKE</label>${seg('shake', [['1', 'ON'], ['0.4', 'LOW'], ['0', 'OFF']])}</div>
      <div class="srow"><label>SHOW FPS</label>${seg('showFps', [['true', 'ON'], ['false', 'OFF']])}</div>
      <div class="srow"><label>CONTROLS</label><span style="font:500 13px Cond;letter-spacing:.12em;color:var(--ink2);text-align:right">W/↑ GAS · S/↓ BRAKE/REVERSE · A D STEER<br>SPACE HANDBRAKE · SHIFT TURBO · C CAMERA · ESC PAUSE</span></div>
      <div class="srow"><label>SAVE DATA</label><button class="btn small s-reset">RESET PROGRESS</button></div>`, (body) => {
      body.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', () => onChange(el.dataset.k, +el.value)));
      body.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        audio()?.ui('click');
        let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
        onChange(sg.dataset.k, v);
      })));
      const rb = body.querySelector('.s-reset');
      rb.addEventListener('click', () => {
        if (rb.dataset.armed) { onChange('reset', true); return; }
        rb.dataset.armed = 1; rb.textContent = 'CLICK AGAIN TO ERASE EVERYTHING';
      });
    });
  }

  achievements(list) {
    const done = list.filter((a) => a.done).length;
    this.openModal(`ACHIEVEMENTS · ${done}/${list.length}`, list.map((a) => `<div class="ach ${a.done ? 'done' : ''}"><div class="ic">${a.done ? '✓' : '·'}</div><div><h4>${a.name}</h4><p>${a.desc}</p></div><div class="rw">${fmtMoney(a.reward)}</div></div>`).join(''));
  }

  credits() {
    this.openModal('CREDITS', `<div class="credits">
      <h4>ONE ROAD DOWN</h4><p>A downhill driving progression game. Cars, trees, buildings, animals and the workshop were modelled with Blender scripts made for this game; sounds and music are synthesised live.</p>
      <h4>DESIGN, CODE, VEHICLES, WORLD</h4><p>Built for the browser with three.js (MIT licence).</p>
      <h4>THIRD-PARTY MODELS</h4><p>Fox: model by PixelMannen (CC0), rigging and animation by tomkranis (CC-BY 4.0), glTF conversion by AsoboStudio and scurest (CC-BY 4.0).<br>
      Drinks fridge: Eric Chadwick / Darmstadt Graphics Group, based on "Commercial Fridge" by Sean Thomas (CC-BY 4.0).<br>
      Barn lamp: Eric Chadwick / Wayfair LLC (CC-BY 4.0). All from the Khronos glTF Sample Assets.</p>
      <h4>SOUND</h4><p>All engine notes, tyres, impacts, weather and music are synthesised live with the Web Audio API.</p>
      <h4>TYPE</h4><p>Barlow and Barlow Condensed by Jeremy Tribby (SIL Open Font Licence).</p>
      <h4>VEHICLES</h4><p>All vehicles and the Montagna Motors dealership are fictional and carry no real brands or logos.</p>
      <h4>THANKS</h4><p>To everyone who ever drove a bad car down a good road.</p></div>`);
  }
}

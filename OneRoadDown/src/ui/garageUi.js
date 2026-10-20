// Premium garage controls layered over the existing garage screen: light-mode switcher,
// camera view bar, car lamps, engine start + rev with a tachometer, hide-UI, and the
// RIMS and PERFORMANCE tabs. Upgrades, paint, cars, dealer and workshop levels stay in
// main.js; this module only adds what did not exist.

import { LIGHT_MODES, CAM_VIEWS, RIMS, lightModeById } from '../scenes/garage.js';
import { carState } from '../core/save.js';
import { CARS } from '../data/cars.js';
import { computeStats, maxStats } from '../game/stats.js';
import { rimTexture } from '../gfx/textures.js';
import { fmtMoney, clamp } from '../core/util.js';
import { audio } from '../audio/audio.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

const ICON = {
  free: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="9" ry="4.2"/><path d="M12 4v5M9.5 6.5 12 4l2.5 2.5"/></svg>',
  front: '<svg viewBox="0 0 24 24"><path d="M3 15h18M5 15l2-5h10l2 5M6 18v-3M18 18v-3"/><circle cx="8" cy="13.5" r=".9"/><circle cx="16" cy="13.5" r=".9"/></svg>',
  rear: '<svg viewBox="0 0 24 24"><path d="M3 15h18M5 15l2-5h10l2 5M6 18v-3M18 18v-3M9 13h6"/></svg>',
  side: '<svg viewBox="0 0 24 24"><path d="M2 15h20l-1-3-5-1-3-3H8l-3 3-3 1z"/><circle cx="6.5" cy="15.5" r="2"/><circle cx="17.5" cy="15.5" r="2"/></svg>',
  wheel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3v6.6M12 14.4V21M3 12h6.6M14.4 12H21"/></svg>',
  cockpit: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M3.6 10.5 10 12M20.4 10.5 14 12M12 14v6.5"/></svg>',
  engine: '<svg viewBox="0 0 24 24"><path d="M4 10h3l2-2h6v3h2v-2h3v8h-3v-2h-2v3H9l-2-2H4z"/></svg>',
  lamp: '<svg viewBox="0 0 24 24"><path d="M10 6c-4 0-6 3-6 6s2 6 6 6h2V6z"/><path d="M15 8h6M15 12h6M15 16h6"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
};

export class GarageUI {
  constructor(game) {
    this.g = game;
    this.root = game.ui.screens.garage;
    this.hidden = false;
    this.rimSel = null;
    this.rimUrls = {};
    this.build();
    this.bindKeys();
    this.tick();
  }

  get garage() { return this.g.garage; }
  get sv() { return this.g.save.data; }

  build() {
    const r = this.root;
    r.classList.add('gx');
    // tabs: clearer names, plus the two new ones before MENU
    const tabs = r.querySelector('.gtabs');
    const lab = { vehicles: 'MY CARS', dealer: 'BUY CAR', garage: 'WORKSHOP' };
    tabs.querySelectorAll('.gtab').forEach((b) => { if (lab[b.dataset.t]) b.textContent = lab[b.dataset.t]; });
    const menuBtn = tabs.querySelector('.gtab[data-t="menu"]');
    for (const [t, name] of [['rims', 'RIMS'], ['perf', 'PERFORMANCE']]) {
      const b = h(`<button class="gtab" data-t="${t}">${name}</button>`);
      b.addEventListener('click', () => { audio()?.ui('click'); this.g.ui.emit('gtab', t); });
      b.addEventListener('mouseenter', () => audio()?.ui('hover'));
      tabs.insertBefore(b, menuBtn);
    }
    const paintBtn = tabs.querySelector('.gtab[data-t="paint"]');
    tabs.insertBefore(tabs.querySelector('.gtab[data-t="rims"]'), paintBtn.nextSibling);
    // light modes
    const modes = h(`<div class="gx-modes live"><span class="gx-mlabel"><small>LIGHT</small><b></b></span>${LIGHT_MODES.map((m, i) =>
      `<button class="gx-mode" data-m="${m.id}" title="${m.name} [${i + 1}]" aria-label="${m.name}"><i style="background:${m.swatch}"></i></button>`).join('')}</div>`);
    modes.querySelectorAll('.gx-mode').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.m)));
    // camera views + car controls
    const dock = h(`<div class="gx-dock live">
      <div class="gx-views">${CAM_VIEWS.map((v) => `<button class="gx-btn gx-view" data-v="${v.id}" title="${v.name} VIEW">${ICON[v.id]}<span>${v.name}</span></button>`).join('')}</div>
      <div class="gx-ctrl">
        <button class="gx-btn gx-lamps" title="HEADLIGHTS [L]">${ICON.lamp}<span>LIGHTS</span></button>
        <button class="gx-btn gx-start" title="START / STOP ENGINE [N]">${ICON.power}<span class="gx-st">START ENGINE</span></button>
        <button class="gx-btn gx-rev" title="HOLD TO REV [R]" disabled><span>REV</span></button>
        <div class="gx-tach"><i></i><b>0</b><small>RPM</small></div>
        <button class="gx-btn gx-hide" title="SHOW / HIDE INTERFACE [H]">${ICON.eye}<span>VIEW</span></button>
      </div></div>`);
    dock.querySelectorAll('.gx-view').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.v)));
    dock.querySelector('.gx-lamps').addEventListener('click', () => this.toggleLamps());
    dock.querySelector('.gx-start').addEventListener('click', () => this.toggleEngine());
    dock.querySelector('.gx-hide').addEventListener('click', () => this.toggleHide());
    const rev = dock.querySelector('.gx-rev');
    const on = (e) => { e.preventDefault(); rev.setPointerCapture?.(e.pointerId); this.garage.setThrottle(1); rev.classList.add('on'); };
    const off = () => { this.garage.setThrottle(0); rev.classList.remove('on'); };
    rev.addEventListener('pointerdown', on);
    rev.addEventListener('pointerup', off); rev.addEventListener('pointercancel', off); rev.addEventListener('lostpointercapture', off);
    rev.addEventListener('contextmenu', (e) => e.preventDefault());
    const show = h('<button class="gx-unhide live" title="SHOW INTERFACE [H]">' + ICON.eye + '<span>SHOW MENU</span></button>');
    show.addEventListener('click', () => this.toggleHide(false));
    r.append(modes, dock, show);
    this.el = { modes, dock, rev, start: dock.querySelector('.gx-start'), st: dock.querySelector('.gx-st'), lamps: dock.querySelector('.gx-lamps'), tach: dock.querySelector('.gx-tach'), tachBar: dock.querySelector('.gx-tach i'), tachNum: dock.querySelector('.gx-tach b'), mlabel: modes.querySelector('.gx-mlabel b') };
    const hint = r.querySelector('.keyhints');
    if (hint) hint.textContent = 'DRAG ORBIT · WHEEL ZOOM · 1–6 LIGHT MODE · C VIEW · L LIGHTS · N ENGINE · HOLD R REV · H HIDE · Q E TAB · ESC MENU';
    this.syncMode();
  }

  // ------------------------------------------------------------- actions
  setMode(id) {
    if (!LIGHT_MODES.some((m) => m.id === id)) return;
    audio()?.ui('click');
    this.garage.setLightMode(id);
    this.sv.garageLight = id; this.g.save.save();
    this.syncMode();
  }
  syncMode() {
    const id = this.garage ? this.garage.modeId : this.sv.garageLight || 'studio';
    this.el.modes.querySelectorAll('.gx-mode').forEach((b) => b.classList.toggle('on', b.dataset.m === id));
    this.el.mlabel.textContent = lightModeById(id).name;
  }
  setView(v) {
    audio()?.ui('click');
    this.garage.setView(v);
  }
  toggleLamps() { this.garage.setLamps(!this.garage.lamps); }
  toggleEngine() {
    const G = this.garage;
    if (G.engineOn) G.stopEngine(); else G.startEngine();
  }
  toggleHide(force) {
    this.hidden = force ?? !this.hidden;
    this.root.classList.toggle('gx-hidden', this.hidden);
    audio()?.ui('click');
  }

  bindKeys() {
    const active = () => this.g.state === 'garage' && !this.g.ui.modalOpen && !this.g.installingNow;
    window.addEventListener('keydown', (e) => {
      if (!active() || e.repeat && e.code !== 'KeyR') return;
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const d = /^Digit([1-6])$/.exec(e.code);
      if (d) { this.setMode(LIGHT_MODES[+d[1] - 1].id); return; }
      if (e.code === 'KeyL') this.toggleLamps();
      else if (e.code === 'KeyN') this.toggleEngine();
      else if (e.code === 'KeyH') this.toggleHide();
      else if (e.code === 'KeyR' && this.garage.engineOn) { this.garage.setThrottle(1); this.el.rev.classList.add('on'); }
      else if (e.code === 'KeyC') {
        const ids = CAM_VIEWS.map((v) => v.id), i = ids.indexOf(this.garage.view);
        this.setView(ids[(i + 1) % ids.length]);
      }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'KeyR') { this.garage?.setThrottle(0); this.el.rev.classList.remove('on'); } });
  }

  // per-frame: button states and the tachometer
  tick() {
    requestAnimationFrame(() => this.tick());
    const G = this.garage;
    if (!G || this.g.state !== 'garage') return;
    const on = G.engineOn, run = on && G.eng.state === 'run';
    if (this._on !== on) { this._on = on; this.el.start.classList.toggle('on', on); this.el.st.textContent = on ? 'STOP ENGINE' : 'START ENGINE'; this.root.classList.toggle('gx-running', on); }
    if (this._run !== run) { this._run = run; this.el.rev.disabled = !run; if (!run) G.setThrottle(0); }
    if (this._lamps !== G.lamps) { this._lamps = G.lamps; this.el.lamps.classList.toggle('on', G.lamps); }
    if (this._view !== G.view) { this._view = G.view; this.el.dock.querySelectorAll('.gx-view').forEach((b) => b.classList.toggle('on', b.dataset.v === G.view)); }
    if (this._mode !== G.modeId) { this._mode = G.modeId; this.syncMode(); }
    if (on) {
      const f = clamp(G.rpm / G.redline, 0, 1.05);
      this.el.tachBar.style.transform = `scaleX(${f.toFixed(3)})`;
      this.el.tach.classList.toggle('red', f > 0.9);
      this.el.tachNum.textContent = String(Math.round(G.rpm / 10) * 10);
    }
  }

  // ------------------------------------------------------------- tabs owned here
  // called by main.gtab for every tab change; returns true when this module rendered it
  onTab(t) {
    this.root.dataset.tab = t;
    if (t === 'rims') { this.renderRims(); return true; }
    if (t === 'perf') { this.renderPerf(); return true; }
    if (this.rimPreview) this.endRimPreview();
    return false;
  }

  car() { return this.g.selectedCar(); }

  rimUrl(style) {
    if (!this.rimUrls[style]) {
      try { const img = rimTexture(style).image; this.rimUrls[style] = img && img.toDataURL ? img.toDataURL() : ''; } catch (e) { this.rimUrls[style] = ''; }
    }
    return this.rimUrls[style];
  }

  renderRims() {
    const g = this.g, sv = this.sv, car = this.car(), cs = carState(sv, car.id);
    if (!cs.rims) cs.rims = ['factory'];
    const cur = cs.rim || 'factory';
    this.rimSel = this.rimSel && RIMS.some((r) => r.id === this.rimSel) ? this.rimSel : cur;
    g.browse = car.id;
    g.ui.setGarageHeader('RIMS', car.name + ' · ' + car.cls, sv.cash);
    g.gStats();
    const p = g.ui.gpanel;
    const tile = (r) => {
      const style = r.id === 'factory' ? car.model.rim : r.id;
      const owned = r.cost === 0 || cs.rims.includes(r.id);
      return `<button class="gx-rim ${r.id === this.rimSel ? 'sel' : ''} ${r.id === cur ? 'cur' : ''}" data-r="${r.id}">
        <span class="gx-rimimg" style="background-image:url(${this.rimUrl(style)})"></span>
        <b>${r.name}</b><small>${r.id === cur ? 'FITTED' : owned ? 'OWNED' : fmtMoney(r.cost)}</small></button>`;
    };
    p.innerHTML = `<div class="ptitle"><span>RIMS</span><span>${car.name}</span></div><div class="scroll"><div class="gx-rims">${RIMS.map(tile).join('')}</div></div><div class="detail"></div>`;
    p.querySelectorAll('.gx-rim').forEach((b) => b.addEventListener('click', () => { audio()?.ui('click'); this.rimSel = b.dataset.r; this.renderRims(); }));
    const r = RIMS.find((x) => x.id === this.rimSel);
    const owned = r.cost === 0 || cs.rims.includes(r.id);
    const fitted = r.id === cur;
    const d = p.querySelector('.detail');
    d.innerHTML = `<h3>${r.name}</h3><div class="pn">${r.id === 'factory' ? 'THE CAR\'S ORIGINAL WHEELS' : 'SAVED PER CAR · CHANGE ANY TIME'}</div>
      <p>Previewing on the car. ${fitted ? 'These are on the car now.' : owned ? 'Already paid for: fit them for free.' : 'Buy once, swap back and forth for free.'}</p>
      <div class="row"><button class="btn ${fitted ? '' : owned ? 'main' : r.cost <= sv.cash ? 'amber' : ''} act" ${fitted || (!owned && r.cost > sv.cash) ? 'disabled' : ''}>${fitted ? 'FITTED' : owned ? 'FIT RIMS' : r.cost > sv.cash ? 'NEED ' + fmtMoney(r.cost - sv.cash) : 'BUY · ' + fmtMoney(r.cost)}</button></div>`;
    d.querySelector('.act').addEventListener('click', () => {
      if (!owned) { if (r.cost > sv.cash) return; sv.cash -= r.cost; cs.rims.push(r.id); audio()?.ui('buy'); }
      cs.rim = r.id === 'factory' ? undefined : r.id;
      if (!cs.rim) delete cs.rim;
      g.save.save();
      audio()?.impactWrench(0.5); audio()?.ratchet(5, 0.5);
      this.renderRims();
    });
    // preview the selected rim on the 3D car, wheel close-up
    this.garage.setRim(this.rimSel);
    this.rimPreview = true;
    if (this.garage.view !== 'wheel' && !this.rimViewSet) { this.garage.setView('wheel'); this.rimViewSet = true; }
  }
  endRimPreview() {
    this.rimPreview = false; this.rimViewSet = false; this.rimSel = null;
    const car = this.car(), cs = carState(this.sv, car.id);
    if (this.garage.car && this.garage.car.car.id === car.id) this.garage.setRim(cs.rim || 'factory');
    if (this.garage.view === 'wheel') this.garage.setView('free');
  }

  renderPerf() {
    const g = this.g, sv = this.sv, car = this.car(), cs = carState(sv, car.id);
    g.browse = car.id;
    const st = computeStats(car, cs.levels, cs.tire, sv.garageLevel);
    const stock = computeStats(car, {}, 'street');
    const mx = maxStats(car, sv.garageLevel);
    const { pi, letter } = g.perfIndex(st);
    const sp = g.perfIndex(stock);
    g.ui.setGarageHeader('PERFORMANCE', car.name + ' · ' + car.cls, sv.cash);
    g.ui.setGStats('');
    const acc = (s) => clamp((12 - (s.t100 || 12)) / (12 - 2.2), 0.03, 1);
    const bars = [
      ['TOP SPEED', st.top / 650, mx.top / 650, Math.round(st.top) + ' KM/H'],
      ['ACCELERATION', acc(st), acc(mx), st.t100 ? st.t100.toFixed(1) + ' S 0–100' : '—'],
      ['POWER', st.hp / 1600, mx.hp / 1600, Math.round(st.hp) + ' HP'],
      ['TORQUE', st.nm / 1600, mx.nm / 1600, Math.round(st.nm) + ' NM'],
      ['HANDLING', st.grip / 100, mx.grip / 100, String(Math.round(st.grip))],
      ['BRAKING', st.brakes / 100, mx.brakes / 100, String(Math.round(st.brakes))],
      ['SUSPENSION', st.susp / 100, mx.susp / 100, String(Math.round(st.susp))],
      ['DURABILITY', st.dur / 100, mx.dur / 100, String(Math.round(st.dur))],
    ].map(([l, v, m, t]) => `<div class="crb"><label>${l}</label><div class="bar"><i style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></i><s style="left:${Math.round(clamp(m, 0, 1) * 100)}%"></s></div><b>${t}</b></div>`).join('');
    let lv = 0, cap = 0;
    for (const k of Object.keys(car.caps || {})) { lv += cs.levels[k] || 0; cap += car.caps[k] || 0; }
    const pw = st.hp / (st.kg / 1000);
    const rank = CARS.filter((c) => !c.exotic || sv.owned.includes(c.id)).map((c) => g.perfIndex(sv.owned.includes(c.id) ? computeStats(c, carState(sv, c.id).levels, carState(sv, c.id).tire, sv.garageLevel) : computeStats(c, {}, 'street')).pi).sort((a, b) => b - a).indexOf(pi) + 1;
    const p = g.ui.gpanel;
    p.innerHTML = `<div class="ptitle"><span>PERFORMANCE</span><span>${car.name}</span></div>
      <div class="scroll"><div class="gx-perf">
        <div class="crh"><span class="pi big pi-${letter}">${letter}<b>${pi}</b></span><div><h3>${car.name}</h3><div class="pn">${car.cls} · ${car.drive}</div></div></div>
        <div class="gx-kpis">
          <div><small>POWER / WEIGHT</small><b>${Math.round(pw)}</b><span>HP / T</span></div>
          <div><small>WEIGHT</small><b>${Math.round(st.kg).toLocaleString('en-US')}</b><span>KG</span></div>
          <div><small>STOCK PI</small><b>${sp.pi}</b><span>+${pi - sp.pi} TUNED</span></div>
          <div><small>TUNING</small><b>${cap ? Math.round((lv / cap) * 100) : 0}%</b><span>${lv} / ${cap} LV</span></div>
        </div>
        <div class="crbars">${bars}</div>
        <p class="gx-note">Bars: your car now. Tick: the most this car can reach in your current workshop. Rank among cars on sale: #${rank}.</p>
      </div></div>
      <div class="detail"><div class="row"><button class="btn main act">UPGRADE THIS CAR ›</button></div></div>`;
    p.querySelector('.act').addEventListener('click', () => { audio()?.ui('click'); g.gtab('upgrades'); });
    if (this.garage.view !== 'side') this.garage.setView('side');
  }
}


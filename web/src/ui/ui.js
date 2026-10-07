// DOM user interface. Everything lives in #ui; the 3D canvas is underneath.
import './ui.css';
const ROT_ICON = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/><circle cx="12" cy="12" r="2.5"/></svg>';
const ZOOM_ICON = '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/></svg>';
const ARROW = {
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>', down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>', right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
};
import { ICON, starSVG } from './icons.js';
import { audio } from '../audio/audio.js';
import { UPGRADES, CATS, ACHIEVEMENTS, ACH_CATS, xpFor } from '../world/upgrades.js';
import { REGION_LABEL, EDGE_REGIONS } from '../hair/hair.js';
import { GUARDS, mm } from '../hair/styles.js';
import { formatMoney, clamp } from '../core/util.js';
import { CRATES, RARITY, allItems, ownsItem, inventory, TOOL_LABEL } from '../game/items.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.touch = input.touch;
    this.fadeEl = h('<div class="fade on"></div>');
    this.lb = h('<div class="letterbox" style="position:absolute;inset:0;pointer-events:none"></div>');
    root.append(h('<div class="vignette"></div>'), this.lb, this.fadeEl);
    this.buildHud();
    this.subsEl = h('<div class="subs off"><div class="who"></div><div><span class="line"></span></div></div>');
    this.bannerEl = h('<div class="banner off"><div class="k"></div><div class="t"></div><div class="s"></div></div>');
    this.toastsEl = h('<div class="toasts"></div>');
    this.bubblesEl = h('<div class="bubbles"></div>');
    this.skipEl = h(`<button class="skip off"><span>Hold to skip</span><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15"/></svg></button>`);
    this.rotateEl = h('<div class="rotate-hint">Turn your device sideways<br>for the best haircut</div>');
    root.append(this.bubblesEl, this.subsEl, this.bannerEl, this.toastsEl, this.skipEl, this.rotateEl);
    this.bubbles = new Map();
    // generic click sound on buttons
    root.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) { audio.unlock(); audio.click(); } });
    root.addEventListener('pointerover', (e) => { const b = e.target.closest('.mbtn,.up .buy,.tool,.cbtn'); if (b && !this.touch) audio.hover(); });
  }

  // ------------------------------------------------------------------ loading / fade
  setLoading(p, text) {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.querySelector('.bar i').style.width = Math.round(p * 100) + '%';
    if (text) boot.querySelector('.t').textContent = text;
  }

  hideLoading() {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.style.opacity = 0;
    setTimeout(() => boot.remove(), 700);
  }

  fade(on, ms = 600) {
    this.fadeEl.style.transitionDuration = ms + 'ms';
    this.fadeEl.classList.toggle('on', on);
    return wait(ms);
  }

  letterbox(on) { this.lb.classList.toggle('on', on); }

  // ------------------------------------------------------------------ menu
  showMenu(opts) {
    this.hideMenu();
    const el = h(`<div class="menu">
      <div class="shade"></div>
      <div class="col">
        <div class="logo"><div class="top">Est. today</div><div class="name">Barber<br><em>Empire</em></div><div class="sub">From a broken chair to the best shop in town</div></div>
        <div class="btns"></div>
      </div>
      <div class="foot">v0.1 · made with Blender & three.js</div>
    </div>`);
    const btns = el.querySelector('.btns');
    const add = (label, cb, cls = '', small = '') => {
      const b = h(`<button class="mbtn ${cls}">${label}${small ? `<small>${small}</small>` : ''}</button>`);
      b.addEventListener('click', cb);
      btns.append(b);
      return b;
    };
    if (opts.hasSave) add('Continue', opts.onContinue, 'primary', opts.saveInfo);
    add('New Game', opts.onNew, opts.hasSave ? '' : 'primary');
    add('Upgrades', opts.onUpgrades);
    add('Achievements', opts.onAchievements);
    add('Settings', opts.onSettings);
    this.root.append(el);
    this.menuEl = el;
    el.style.opacity = 0;
    requestAnimationFrame(() => { el.style.transition = 'opacity .8s'; el.style.opacity = 1; });
  }

  hideMenu() { if (this.menuEl) { this.menuEl.remove(); this.menuEl = null; } }

  // ------------------------------------------------------------------ panels
  panel(kicker, title, bodyEl, onClose, extraHead = '') {
    const wrap = h(`<div class="panel-wrap"><div class="card panel"><header><div><div class="kicker">${kicker}</div><h2>${title}</h2></div><div style="display:flex;gap:12px;align-items:center">${extraHead}<button class="xbtn">Close</button></div></header><div class="body"></div></div></div>`);
    wrap.querySelector('.body').append(bodyEl);
    const close = () => { wrap.remove(); this.openPanel = null; audio.back(); onClose && onClose(); };
    wrap.querySelector('.xbtn').addEventListener('click', close);
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
    this.root.append(wrap);
    this.openPanel = { el: wrap, close };
    return wrap;
  }

  closePanel() { if (this.openPanel) this.openPanel.close(); }

  settingsPanel(settings, onChange, extra = {}) {
    const body = h('<div></div>');
    const slider = (key, label) => {
      const row = h(`<div class="set-row"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${settings[key]}"></div>`);
      row.querySelector('input').addEventListener('input', (e) => { settings[key] = +e.target.value; onChange(key); });
      body.append(row);
    };
    const seg = (key, label, options) => {
      const row = h(`<div class="set-row"><span>${label}</span><div class="seg"></div></div>`);
      const s = row.querySelector('.seg');
      for (const [v, l] of options) {
        const b = h(`<button class="${settings[key] === v ? 'on' : ''}">${l}</button>`);
        b.addEventListener('click', () => { settings[key] = v; s.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); onChange(key); });
        s.append(b);
      }
      body.append(row);
    };
    slider('master', 'Master volume');
    slider('music', 'Music');
    slider('sfx', 'Effects');
    slider('amb', 'Ambience');
    slider('voice', 'Voices');
    seg('quality', 'Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']]);
    slider('sensitivity', 'Look speed');
    seg('invertY', 'Invert look', [[false, 'Off'], [true, 'On']]);
    if (extra.onReplayTutorial) {
      const row = h('<div class="set-row"><span>Tutorial</span><div class="seg"><button>Replay tutorial</button></div></div>');
      row.querySelector('button').addEventListener('click', extra.onReplayTutorial);
      body.append(row);
    }
    if (extra.onReset) {
      const row = h('<div class="set-row"><span>Save data</span><div class="seg"><button class="danger">Delete progress</button></div></div>');
      const b = row.querySelector('button');
      let armed = false;
      b.addEventListener('click', () => {
        if (!armed) { armed = true; b.textContent = 'Tap again to confirm'; return; }
        extra.onReset();
        b.textContent = 'Deleted';
      });
      body.append(row);
    }
    return this.panel('Options', 'Settings', body, extra.onClose);
  }

  upgradesPanel(game, opts = {}) {
    const CAT_INFO = {
      shop: { label: 'Shop', sub: 'Walls, floors and lights', icon: 'paint', color: '#7a2a26' },
      decor: { label: 'Comfort', sub: 'Keep them waiting happily', icon: 'couch', color: '#3e6b4a' },
      tools: { label: 'Equipment', sub: 'Better tools, better cuts', icon: 'clipper', color: '#24344d' },
      staff: { label: 'Staff', sub: 'Grow the business', icon: 'users', color: '#8a5e14' },
      crates: { label: 'Crates', sub: 'Exclusive colours & tool skins', icon: 'star', color: '#6a2c8a' },
    };
    const body = h('<div class="cat2"></div>');
    let cat = opts.cat || 'all';
    if (opts.hint) cat = UPGRADES.find((u) => u.id === opts.hint)?.cat || cat;
    const state = (u) => {
      const owned = game.owns(u.id);
      const needs = u.req && !game.owns(u.req);
      const lvl = game.level < u.level;
      return { owned, needs, lvl, locked: !owned && (lvl || needs), afford: game.money >= u.price };
    };
    const featured = () => UPGRADES.filter((u) => { const st = state(u); return !st.owned && !st.locked; }).sort((x, y) => x.price - y.price)[0];
    const render = () => {
      const totalOwned = game.save.owned.length;
      const f = featured();
      body.innerHTML = `
        <aside class="c2-side">
          <div class="c2-wallet"><span>Cash on hand</span><b>${formatMoney(game.money)}</b><div class="c2-own"><i style="width:${Math.round(totalOwned / UPGRADES.length * 100)}%"></i></div><small>${totalOwned} / ${UPGRADES.length} upgrades owned</small></div>
          <nav>${[['all', { label: 'Everything', sub: 'All upgrades', icon: 'shop', color: '#4a3d33' }], ...Object.entries(CAT_INFO)].map(([id, c]) => {
            if (id === 'crates') {
              const n = allItems().filter((it) => ownsItem(game.save, it)).length;
              return `<button data-c="${id}" class="${id === cat ? 'on' : ''}" style="--cc:${c.color}"><span class="ci">${ICON[c.icon] || ''}</span><span class="ct"><b>${c.label}</b><small>${n}/${allItems().length} collected</small></span>${game.money >= CRATES.basic.price ? '<i class="pip"></i>' : ''}</button>`;
            }
            const list = id === 'all' ? UPGRADES : UPGRADES.filter((u) => u.cat === id);
            const own = list.filter((u) => game.owns(u.id)).length;
            const buyable = list.some((u) => { const st = state(u); return !st.owned && !st.locked && st.afford; });
            return `<button data-c="${id}" class="${id === cat ? 'on' : ''}" style="--cc:${c.color}"><span class="ci">${ICON[c.icon] || ''}</span><span class="ct"><b>${c.label}</b><small>${own}/${list.length} owned</small></span>${buyable ? '<i class="pip"></i>' : ''}</button>`;
          }).join('')}</nav>
        </aside>
        <section class="c2-main">
          ${f ? `<div class="c2-hero" style="--cc:${CAT_INFO[f.cat].color}">
            <div class="hl">Next up</div>
            <div class="hi">${ICON[f.icon] || ''}</div>
            <div class="ht"><h3>${f.name}</h3><p>${f.desc}</p><div class="chips"><span class="chip eff">${f.effect}</span><span class="chip">${CAT_INFO[f.cat].label}</span></div></div>
            <div class="hb">${state(f).afford ? `<button class="buy big" data-id="${f.id}">Buy · ${formatMoney(f.price)}</button>` : `<div class="save"><div class="bar"><i style="width:${Math.round(Math.min(1, game.money / f.price) * 100)}%"></i></div><span>${formatMoney(f.price - game.money)} to go</span></div><button class="buy big cant" data-id="${f.id}">${formatMoney(f.price)}</button>`}</div>
          </div>` : '<div class="c2-hero done"><div class="ht"><h3>Everything is bought.</h3><p>This is the best barbershop on the street.</p></div></div>'}
          <div class="c2-grid"></div>
        </section>`;
      body.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.c; audio.click(); render(); }));
      const grid = body.querySelector('.c2-grid');
      if (cat === 'crates') { body.querySelector('.c2-hero')?.remove(); renderCrates(grid); return; }
      const list = UPGRADES.filter((u) => cat === 'all' || u.cat === cat)
        .map((u) => ({ u, st: state(u) }))
        .sort((x, y) => (x.st.owned - y.st.owned) || (x.st.locked - y.st.locked) || x.u.price - y.u.price);
      for (const { u, st } of list) {
        const c = CAT_INFO[u.cat];
        const lockTxt = st.lvl ? `Shop level ${u.level}` : st.needs ? 'Needs ' + (UPGRADES.find((x) => x.id === u.req)?.name || '') : '';
        const el = h(`<div class="c2-card ${st.owned ? 'owned' : ''} ${st.locked ? 'locked' : ''} ${st.afford && !st.owned && !st.locked ? 'can' : ''} ${opts.hint === u.id ? 'hint' : ''}" style="--cc:${c.color}">
          <div class="cc-top"><div class="cc-ic">${ICON[u.icon] || ''}</div><div class="cc-tag">${c.label}</div></div>
          <h4>${u.name}</h4><p>${u.desc}</p>
          <div class="chips"><span class="chip eff">${u.effect}</span></div>
          <div class="cc-foot">${st.owned ? '<div class="stamp">Owned</div>' : st.locked ? `<div class="lock">${ICON.lock}<span>${lockTxt}</span></div>` : `<button class="buy ${st.afford ? '' : 'cant'}" data-id="${u.id}">${formatMoney(u.price)}</button>${st.afford ? '' : `<div class="short">${formatMoney(u.price - game.money)} short</div>`}`}</div>
        </div>`);
        grid.append(el);
      }
      body.querySelectorAll('.buy').forEach((btn) => btn.addEventListener('click', (e) => buy(btn.dataset.id, btn.closest('.c2-card, .c2-hero'), e)));
    };
    const renderCrates = (grid) => {
      grid.classList.add('crates');
      for (const [id, c] of Object.entries(CRATES)) {
        const can = game.money >= c.price;
        const odds = Object.entries(c.odds).filter(([, v]) => v > 0).map(([r, v]) => `<span style="color:${RARITY[r].color}">${RARITY[r].label} ${v}%</span>`).join('');
        const el = h(`<div class="crate-card ${can ? 'can' : ''}" style="--cc:${c.color}">
          <div class="cr-box"><div class="cr-lid"></div><div class="cr-q">?</div></div>
          <h4>${c.name}</h4><div class="cr-odds">${odds}</div>
          <button class="buy ${can ? '' : 'cant'}">${formatMoney(c.price)}</button>
          <small>Delivered by courier — open it in the shop</small>
        </div>`);
        el.querySelector('.buy').addEventListener('click', (e) => {
          if (!game.buyCrate(id)) { audio.error(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
          el.classList.add('sold'); const st = h('<div class="sold-stamp">Ordered!</div>'); el.append(st);
          setTimeout(render, 700);
        });
        grid.append(el);
      }
      // collection: every collectible, owned ones lit, skins can be equipped
      const inv = inventory(game.save);
      const col = h('<div class="collection"><h4>Collection</h4><div class="col-grid"></div></div>');
      const cg = col.querySelector('.col-grid');
      for (const it of allItems()) {
        const own = ownsItem(game.save, it);
        const eq = it.kind === 'skin' && inv.equip[it.tool] === it.id;
        const el = h(`<div class="col-item ${own ? 'own' : ''} ${eq ? 'eq' : ''}" style="--rc:${RARITY[it.rarity].color}">
          <div class="ci-sw" style="background:${it.color}">${it.kind === 'skin' ? (ICON[it.tool === 'clipper' ? 'clipper' : it.tool === 'scissors' ? 'scissors' : 'spray'] || '') : ''}</div>
          <b>${own ? it.name : '???'}</b><span>${it.kind === 'dye' ? 'Hair colour' : TOOL_LABEL[it.tool]} · ${RARITY[it.rarity].label}</span>
          ${own && it.kind === 'skin' ? `<button class="eqb">${eq ? 'Equipped' : 'Equip'}</button>` : ''}
        </div>`);
        el.querySelector('.eqb')?.addEventListener('click', () => { game.equipSkin(it.tool, eq ? null : it.id); audio.click(); render(); });
        cg.append(el);
      }
      grid.after(col);
    };
    const buy = (id, el, e) => {
      const u = UPGRADES.find((x) => x.id === id);
      const st = state(u);
      if (st.owned || st.locked) return;
      if (!st.afford) { audio.error(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
      if (!game.buy(id)) return;
      // SOLD stamp, coins, then show it off in the shop
      el.classList.add('sold');
      const stamp = h('<div class="sold-stamp">Sold!</div>');
      el.append(stamp);
      const r = (e.currentTarget || e.target).getBoundingClientRect(), rr = this.root.getBoundingClientRect();
      for (let i = 0; i < 12; i++) {
        const coin = h(`<div class="coin-fly">${ICON.coin}</div>`);
        coin.style.left = r.left - rr.left + r.width / 2 + 'px';
        coin.style.top = r.top - rr.top + r.height / 2 + 'px';
        coin.style.setProperty('--dx', (Math.random() - 0.5) * 220 + 'px');
        coin.style.setProperty('--dy', -50 - Math.random() * 120 + 'px');
        coin.style.animationDelay = i * 0.025 + 's';
        this.root.append(coin);
        setTimeout(() => coin.remove(), 1100);
      }
      if (opts.onBuy) opts.onBuy(id);
      setTimeout(() => {
        if (opts.reveal && opts.reveal(id)) return;   // the panel closes for the reveal shot
        render();
      }, 650);
    };
    render();
    const wrap = this.panel('Barber supply co.', 'Catalogue', body, opts.onClose);
    wrap.querySelector('.panel').classList.add('wide', 'catalogue');
    return wrap;
  }

  // crate opening: a reel of items scrolls past and stops on the prize
  crateReel(crateId, prize) {
    return new Promise((resolve) => {
      const c = CRATES[crateId];
      const pool = allItems();
      const N = 46, WIN = 40;
      const cards = [];
      for (let i = 0; i < N; i++) {
        let it = i === WIN ? prize : pool[Math.floor(Math.random() * pool.length)];
        if (i !== WIN && Math.random() < 0.55) it = pool.filter((p) => p.rarity === 'common' || p.rarity === 'rare')[Math.floor(Math.random() * 10) % pool.filter((p) => p.rarity === 'common' || p.rarity === 'rare').length];
        cards.push(`<div class="rl-card" style="--rc:${RARITY[it.rarity].color}"><div class="rl-sw" style="background:${it.color}"></div><b>${it.name}</b><span>${RARITY[it.rarity].label}</span></div>`);
      }
      const el = h(`<div class="crate-open">
        <div class="co-title" style="--cc:${c.color}">${c.name}</div>
        <div class="co-reel"><div class="co-strip">${cards.join('')}</div><div class="co-marker"></div></div>
        <div class="co-prize"></div>
      </div>`);
      this.root.append(el);
      const strip = el.querySelector('.co-strip');
      const cardW = 138;
      const reelW = el.querySelector('.co-reel').clientWidth || 700;
      const target = WIN * cardW + cardW / 2 - reelW / 2 + (Math.random() - 0.5) * (cardW * 0.6);
      const t0 = performance.now(), dur = 5200;
      let lastIdx = -1;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const e = 1 - Math.pow(1 - k, 4);
        const x = target * e;
        strip.style.transform = `translateX(${-x}px)`;
        const idx = Math.floor((x + reelW / 2) / cardW);
        if (idx !== lastIdx) { lastIdx = idx; audio.tick(idx % 10); }
        if (k < 1) requestAnimationFrame(step);
        else {
          const r = RARITY[prize.rarity];
          audio.achievement?.(prize.rarity === 'legendary' ? 'gold' : prize.rarity === 'epic' ? 'silver' : 'bronze');
          if (prize.rarity === 'legendary' || prize.rarity === 'epic') audio.itemGet?.();
          el.querySelector('.co-prize').innerHTML = `<div class="cp-card" style="--rc:${r.color}"><div class="cp-glow"></div><div class="cp-sw" style="background:${prize.color}"></div>
            <div class="cp-r">${r.label}</div><div class="cp-n">${prize.name}</div><div class="cp-k">${prize.kind === 'dye' ? 'Exclusive hair & beard colour' : 'Skin · ' + TOOL_LABEL[prize.tool]}</div><div class="cp-tap">Click to continue</div></div>`;
          el.classList.add('done');
          const close = () => { el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 400); };
          setTimeout(() => el.addEventListener('pointerdown', close, { once: true }), 500);
          setTimeout(close, 6000);
        }
      };
      requestAnimationFrame(step);
    });
  }

  // ------------------------------------------------------------------ achievements
  setTrophies(n) {
    if (!this.trophyBtn) return;
    const b = this.trophyBtn.querySelector('.badge');
    b.textContent = n > 9 ? '9+' : n;
    this.trophyBtn.classList.toggle('has', n > 0);
  }

  achievementsPanel(game, opts = {}) {
    const s = game.save;
    const claimed = () => s.achClaimed || [];
    const body = h('<div class="achp"></div>');
    let cat = opts.cat || 'all';
    const tierOrder = { bronze: 0, silver: 1, gold: 2 };
    const total = ACHIEVEMENTS.length;
    const render = () => {
      const got = ACHIEVEMENTS.filter((a) => s.achievements.includes(a.id));
      const pct = got.length / total;
      const tiers = ['bronze', 'silver', 'gold'].map((t) => [t, ACHIEVEMENTS.filter((a) => a.tier === t), got.filter((a) => a.tier === t)]);
      const earned = got.filter((a) => claimed().includes(a.id)).reduce((m, a) => m + a.reward.money, 0);
      const toClaim = got.filter((a) => !claimed().includes(a.id));
      const R = 34, C = 2 * Math.PI * R;
      body.innerHTML = `
        <div class="ach-sum">
          <div class="ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="${R}" class="bg"/><circle cx="42" cy="42" r="${R}" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct)}"/></svg><div class="pc"><b>${Math.round(pct * 100)}%</b><span>${got.length}/${total}</span></div></div>
          <div class="tiers">${tiers.map(([t, all, g]) => `<div class="tier ${t}"><i class="mini ${t}">${ICON.star}</i><b>${g.length}</b><span>/ ${all.length}</span><em>${t}</em></div>`).join('')}</div>
          <div class="earned"><span>Rewards collected</span><b>${formatMoney(earned)}</b>${toClaim.length ? `<button class="claim-all">Claim all (${toClaim.length})</button>` : ''}</div>
        </div>
        <div class="ach-tabs">${[{ id: 'all', label: 'All' }, ...ACH_CATS].map((c) => {
          const list = c.id === 'all' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.cat === c.id);
          const n = list.filter((a) => s.achievements.includes(a.id)).length;
          const dot = list.some((a) => s.achievements.includes(a.id) && !claimed().includes(a.id));
          return `<button data-c="${c.id}" class="${c.id === cat ? 'on' : ''}">${c.label}<small>${n}/${list.length}</small>${dot ? '<i class="pip"></i>' : ''}</button>`;
        }).join('')}</div>
        <div class="ach-grid"></div>`;
      body.querySelectorAll('.ach-tabs button').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.c; audio.click(); render(); }));
      body.querySelector('.claim-all')?.addEventListener('click', (e) => {
        let i = 0;
        for (const a of toClaim) setTimeout(() => claim(a, null), i++ * 140);
        setTimeout(render, i * 140 + 450);
        e.currentTarget.disabled = true;
      });
      const grid = body.querySelector('.ach-grid');
      const list = ACHIEVEMENTS.filter((a) => cat === 'all' || a.cat === cat).map((a) => {
        const done = s.achievements.includes(a.id);
        const cl = claimed().includes(a.id);
        const p = Math.min(a.goal || 1, a.progress(s));
        return { a, done, cl, p, k: done ? (cl ? 2 : 0) : 1, frac: p / (a.goal || 1) };
      }).sort((x, y) => x.k - y.k || (x.k === 1 ? y.frac - x.frac : 0) || tierOrder[x.a.tier] - tierOrder[y.a.tier]);
      for (const { a, done, cl, p, frac } of list) {
        const hidden = a.secret && !done;
        const fmt = (v) => (a.money ? formatMoney(v) : Math.floor(v).toLocaleString('en-US'));
        const el = h(`<div class="achc ${a.tier} ${done ? 'done' : 'locked'} ${done && !cl ? 'claimable' : ''} ${cl ? 'claimed' : ''} ${hidden ? 'secret' : ''}">
          <div class="medal ${a.tier}"><div class="rim"></div><div class="face">${hidden ? '<b>?</b>' : ICON[a.icon] || ICON.star}</div>${done ? '' : `<div class="lk">${ICON.lock}</div>`}<div class="ribbon"></div></div>
          <div class="info">
            <div class="row1"><b>${hidden ? 'Secret' : a.name}</b><span class="tier-tag">${a.tier}</span></div>
            <p>${hidden ? 'Keep playing. Some things only happen once you stop being careful.' : a.desc}</p>
            ${done ? `<div class="when">Unlocked${s.achDays?.[a.id] ? ' on day ' + s.achDays[a.id] : ''}</div>` : hidden ? '' : `<div class="prog"><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div><span>${fmt(p)} / ${fmt(a.goal)}</span></div>`}
          </div>
          <div class="rew">
            <div class="chip">${ICON.coin}<span>${formatMoney(a.reward.money)}</span></div><div class="chip xp"><span>+${a.reward.xp} XP</span></div>
            ${done && !cl ? '<button class="claim">Claim</button>' : cl ? '<div class="ok">Collected</div>' : ''}
          </div>
        </div>`);
        el.querySelector('.claim')?.addEventListener('click', () => { claim(a, el); });
        grid.append(el);
      }
    };
    const claim = (a, el) => {
      const r = game.claimAchievement(a.id);
      if (!r) return;
      audio.purchase();
      const src = (el?.querySelector('.claim') || body.querySelector('.earned')).getBoundingClientRect();
      const rr = this.root.getBoundingClientRect();
      for (let i = 0; i < 9; i++) {
        const c = h(`<div class="coin-fly">${ICON.coin}</div>`);
        c.style.left = src.left - rr.left + src.width / 2 + 'px';
        c.style.top = src.top - rr.top + src.height / 2 + 'px';
        c.style.setProperty('--dx', (Math.random() - 0.5) * 160 + 'px');
        c.style.setProperty('--dy', -60 - Math.random() * 90 + 'px');
        c.style.animationDelay = i * 0.03 + 's';
        this.root.append(c);
        setTimeout(() => c.remove(), 1100);
      }
      this.floatText(src.left - rr.left + src.width / 2, src.top - rr.top - 10, `+${formatMoney(r.money)}  +${r.xp} XP`);
      if (el) { el.classList.add('pop'); setTimeout(render, 420); }
    };
    render();
    const wrap = this.panel('Hall of fame', 'Achievements', body, opts.onClose);
    wrap.querySelector('.panel').classList.add('wide');
    return wrap;
  }

  // the unlock moment, in game: a medal drops in at the top of the screen
  achievementPop(a) {
    this._achQ ||= [];
    this._achQ.push(a);
    if (this._achBusy) return;
    const next = () => {
      const x = this._achQ.shift();
      if (!x) { this._achBusy = false; return; }
      this._achBusy = true;
      const el = h(`<div class="ach-pop ${x.tier}">
        <div class="medal ${x.tier}"><div class="rim"></div><div class="face">${ICON[x.icon] || ICON.star}</div><div class="ribbon"></div></div>
        <div class="tx"><div class="k">Achievement unlocked · ${x.tier}</div><b>${x.name}</b><span>${x.desc}</span><div class="rw">Reward ${formatMoney(x.reward.money)} · ${x.reward.xp} XP <em>claim it in Achievements</em></div></div>
        <div class="shine"></div>
      </div>`);
      this.root.append(el);
      audio.achievement?.(x.tier);
      setTimeout(() => el.classList.add('out'), 3600);
      setTimeout(() => { el.remove(); next(); }, 4100);
    };
    next();
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    const el = h(`<div class="hud off">
      <div class="clock"><div class="ck-t">08:00</div><div class="ck-s">Closed</div><div class="ck-bar"><i></i></div></div><div class="hud-tl"><div class="money"><span class="cur">$</span><span class="v">0</span></div>
        <div class="lvl"><div class="l"><span>Shop level</span><b>1</b></div><div class="bar"><i></i></div></div></div>
      <div class="goal hidden"></div>
      <div class="objective off"><div class="k"></div><div class="t"></div></div>
      <div class="hud-tr"><button class="ibtn trophy-btn" title="Achievements">${ICON.trophy}<span class="badge"></span></button><button class="ibtn up-btn" title="Upgrades (U)">${ICON.shop}<span class="dot"></span></button><button class="ibtn pause-btn" title="Pause (Esc)">${ICON.pause}</button></div>
      <div class="crosshair"></div>
      <div class="prompt off"></div>
      <div class="tip off"></div>
      <button class="interact-btn off">Use</button>
      <div class="req card off"></div>
    </div>`);
    this.root.append(el);
    this.hud = el;
    this.moneyV = el.querySelector('.money .v');
    this.moneyBox = el.querySelector('.money');
    this.lvlB = el.querySelector('.lvl b');
    this.lvlBar = el.querySelector('.lvl .bar i');
    this.goalEl = el.querySelector('.goal');
    this.objEl = el.querySelector('.objective');
    this.promptEl = el.querySelector('.prompt');
    this.tipEl = el.querySelector('.tip');
    this.crossEl = el.querySelector('.crosshair');
    this.reqEl = el.querySelector('.req');
    this.interactBtn = el.querySelector('.interact-btn');
    this.upBtn = el.querySelector('.up-btn');
    this.clockEl = el.querySelector('.clock');
    this.trophyBtn = el.querySelector('.trophy-btn');
    this.pauseBtn = el.querySelector('.pause-btn');
    this.interactBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('interact'); });
    if (!this.touch) this.interactBtn.classList.add('hidden');
    this.shownMoney = 0;
  }

  showHud(on, opts = {}) {
    this.hud.classList.toggle('off', !on);
    this.hud.querySelector('.hud-tr').style.display = opts.buttons === false ? 'none' : '';
    this.crossEl.style.display = opts.crosshair === false ? 'none' : '';
  }

  setMoney(v, animate = true) {
    this.targetMoney = v;
    if (!animate) { this.shownMoney = v; this.moneyV.textContent = Math.round(v).toLocaleString('en-US'); return; }
    if (this._moneyAnim) return;
    const step = () => {
      const d = this.targetMoney - this.shownMoney;
      if (Math.abs(d) < 0.5) { this.shownMoney = this.targetMoney; this.moneyV.textContent = Math.round(this.shownMoney).toLocaleString('en-US'); this._moneyAnim = null; return; }
      const inc = Math.sign(d) * Math.max(1, Math.abs(d) * 0.12);
      this.shownMoney += inc;
      this.moneyV.textContent = Math.round(this.shownMoney).toLocaleString('en-US');
      if (d > 0 && Math.random() < 0.5) audio.tick(Math.random() * 10);
      this._moneyAnim = requestAnimationFrame(step);
    };
    this.moneyBox.classList.remove('bump'); void this.moneyBox.offsetWidth; this.moneyBox.classList.add('bump');
    this._moneyAnim = requestAnimationFrame(step);
  }

  setClock(label, open, k, closing) {
    if (!this.clockEl) return;
    this.clockEl.querySelector('.ck-t').textContent = label;
    this.clockEl.querySelector('.ck-s').textContent = !open ? 'Closed' : closing ? 'Closing' : 'Open';
    this.clockEl.querySelector('.ck-bar i').style.width = Math.round(k * 100) + '%';
    this.clockEl.classList.toggle('open', open && !closing);
    this.clockEl.classList.toggle('closing', !!closing);
  }

  setLevel(level, xp) {
    this.lvlB.textContent = level;
    this.lvlBar.style.width = Math.round(clamp(xp / xpFor(level), 0, 1) * 100) + '%';
  }

  setGoal(text) {
    this.goalEl.classList.toggle('hidden', !text);
    this.goalEl.textContent = text || '';
  }

  objective(k, t) {
    if (!t) { this.objEl.classList.add('off'); return; }
    const same = this.objEl.querySelector('.t').textContent === t;
    this.objEl.querySelector('.k').textContent = k;
    this.objEl.querySelector('.t').textContent = t;
    this.objEl.classList.remove('off');
    if (!same) audio.objective();
  }

  prompt(text, key = 'E') {
    if (!text) { this.promptEl.classList.add('off'); this.crossEl.classList.remove('active'); this.interactBtn.classList.add('off'); return; }
    const html = this.touch ? `<span>${text}</span>` : `<span class="key">${key}</span><span>${text}</span>`;
    if (this._promptHtml !== html) { this.promptEl.innerHTML = html; this._promptHtml = html; }
    this.promptEl.classList.remove('off');
    this.crossEl.classList.add('active');
    if (this.touch) { this.interactBtn.classList.remove('off'); this.interactBtn.textContent = text.split(' ')[0]; }
  }

  tip(text, key) {
    if (!text) { this.tipEl.classList.add('off'); return; }
    const k = key ? (this.touch ? '' : `<span class="key">${key}</span>`) : '';
    this.tipEl.innerHTML = `${k}<span>${text}</span>`;
    this.tipEl.classList.remove('off');
  }

  attention(btn, on) { (btn === 'upgrades' ? this.upBtn : this.pauseBtn).classList.toggle('attn', on); }

  // ------------------------------------------------------------------ dialogue
  subtitle(who, text) {
    if (!text) { this.subsEl.classList.add('off'); return; }
    this.subsEl.querySelector('.who').textContent = who || '';
    this.subsEl.querySelector('.line').textContent = text;
    this.subsEl.classList.remove('off');
  }

  // ------------------------------------------------------------------ request card
  showRequest(cut, customer, big = false) {
    const el = this.reqEl;
    el.innerHTML = `<div class="k">Request</div><div class="n">${cut.name}</div><ul>${cut.lines.map((l) => `<li>${l}</li>`).join('')}${customer.dyeReq ? `<li class="dye-li"><i style="background:${customer.dyeReq.color}"></i>Colour it ${customer.dyeReq.name}</li>` : ''}</ul>
      ${customer.refImg ? `<button class="ref-thumb" title="Show the reference"><img src="${customer.refImg}" alt=""><span>Reference</span></button>` : ''}
      <div class="who"><span>${customer.name}</span><span>${customer.personality.label}</span></div>
      ${customer.tutorial ? '' : `<button class="decline">${this.touch ? '' : '<span class="key">X</span>'}Turn away</button>`}`;
    el.querySelector('.decline')?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.onDecline?.(customer); });
    el.querySelector('.ref-thumb')?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.showReference(cut, customer.refImg); });
    el.classList.remove('off');
    el.classList.toggle('big', big);
  }
  // a barbershop poster with the requested cut from three sides; click anywhere to close
  showReference(cut, img, autoClose = 0) {
    this.hideReference();
    if (!img) return;
    const el = h(`<div class="ref-poster">
      <div class="rp-card">
        <div class="rp-top"><span class="rp-k">Barber Empire · Style guide</span><span class="rp-x">×</span></div>
        <div class="rp-title">${cut.name}</div>
        ${img.startsWith('data:image/jpeg') ? `<div class="rp-img menu"><img src="${img}" alt=""><div class="rp-note">From the haircut menu</div></div>` : `<div class="rp-img"><img src="${img}" alt=""><div class="rp-lbl"><span>Front</span><span>Side</span><span>Back</span></div></div>`}
        <ul class="rp-lines">${cut.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      </div>
    </div>`);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.hideReference(); });
    this.root.append(el);
    this.refEl = el;
    audio.paperFlick?.();
    if (autoClose) this._refT = setTimeout(() => this.hideReference(), autoClose);
  }

  hideReference() {
    clearTimeout(this._refT);
    if (!this.refEl) return;
    const el = this.refEl; this.refEl = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
  }

  shrinkRequest() { this.reqEl.classList.remove('big'); }
  hideRequest() { this.reqEl.classList.add('off'); this.reqEl.classList.remove('big'); }

  // ------------------------------------------------------------------ barber mode HUD
  showBarber(cfg) {
    this.hideBarber();
    const el = h(`<div class="barber">
      <div class="barber-help"></div>
      <div class="regions card"><div class="k"><span>Request</span><span>now / target</span></div><div class="rname"></div></div>
      <div class="tools"></div>
      <button class="finish">Finish cut<small>F</small></button>
      <div class="cut-timer"></div>
    </div>`);
    this.root.append(el);
    this.barberEl = el;
    const tools = el.querySelector('.tools');
    this.toolBtns = {};
    cfg.tools.forEach((t, i) => {
      const b = h(`<button class="tool" data-tool="${t.id}"><span class="num">${i + 1}</span>${ICON[t.icon]}<span>${t.label}</span></button>`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); cfg.onTool(t.id); });
      tools.append(b);
      this.toolBtns[t.id] = b;
    });
    const power = h(`<button class="power">${ICON.power}<span>Power</span></button>`);
    power.addEventListener('pointerdown', (e) => { e.preventDefault(); cfg.onPower(); });
    tools.prepend(power);
    this.powerBtn = power;
    const guards = h('<div class="guards"><div class="gl">Guard</div><div class="row"></div></div>');
    GUARDS.forEach((g, i) => {
      const b = h(`<button data-i="${i}">${g.id}</button>`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); cfg.onGuard(i); });
      guards.querySelector('.row').append(b);
    });
    tools.append(guards);
    this.guardsEl = guards;
    el.querySelector('.finish').addEventListener('click', cfg.onFinish);
    this.finishBtn = el.querySelector('.finish');
    if (this.touch) this.finishBtn.querySelector('small').remove();
    const regions = el.querySelector('.regions');
    regions.querySelector('.rname').textContent = cfg.cutName || '';
    if (cfg.refImg) {
      const rb = h(`<button class="ref-thumb small" title="Show the reference"><img src="${cfg.refImg}" alt=""><span>Reference</span></button>`);
      rb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cfg.onRef?.(); });
      regions.querySelector('.rname').after(rb);
    }
    this.regionEls = {};
    for (const r of cfg.regions || ['top', 'front', 'left', 'right', 'back', 'edges']) {
      const row = h(`<div class="rg" data-r="${r}"><div class="h"><span>${REGION_LABEL[r]}</span><b></b></div><div class="track"><div class="zone"></div><div class="cur"></div></div></div>`);
      regions.append(row);
      this.regionEls[r] = row;
    }
    this.dyeEl = null;
    if (cfg.dye) {
      this.dyeEl = h(`<div class="rg style dye"><div class="h"><span>Colour · ${cfg.dye.name}</span><b></b></div><div class="track"><div class="zone" style="left:85%;width:15%"></div><div class="cur" style="background:${cfg.dye.color}"></div></div></div>`);
      regions.append(this.dyeEl);
    }
    this.styleEl = null;
    if (cfg.style) {
      this.styleEl = h('<div class="rg style"><div class="h"><span>Combed into shape</span><b></b></div><div class="track"><div class="zone" style="left:85%;width:15%"></div><div class="cur"></div></div></div>');
      regions.append(this.styleEl);
    }
    // left: what the mouse does (cut / rotate the view around the head)
    const modes = h(`<div class="bmodes">
      <div class="bm-title">Mouse</div>
      <button data-m="cut" title="Cut (R toggles)">${ICON.scissors}<span>Cut</span></button>
      <button data-m="rotate" title="Turn the head view (R, or hold right mouse)">${ROT_ICON}<span>Rotate</span></button>
    </div>`);
    modes.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cfg.onMode?.(b.dataset.m); }));
    el.append(modes);
    this.modesEl = modes;
    // tiny close-up toggle next to the tools
    const closeBtn = h(`<button class="closeup" title="Close-up (C)">${ZOOM_ICON}</button>`);
    closeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); cfg.onClose?.(); });
    tools.append(closeBtn);
    this.closeBtn = closeBtn;
    el.querySelector('.barber-help').innerHTML = this.touch ? '' :
      '<div><span class="key">LMB</span>cut</div><div><span class="key">RMB</span> / <span class="key">R</span>rotate view</div><div><span class="key">C</span>close-up</div>';
  }

  revealCaption(name, effect) {
    const el = h(`<div class="reveal-cap"><div class="k">New in the shop</div><div class="t">${name}</div><div class="s">${effect}</div></div>`);
    this.root.append(el);
    return el;
  }

  setBarberMode(mode, close) {
    if (!this.modesEl) return;
    this.modesEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    this.closeBtn.classList.toggle('on', !!close);
    this.barberEl?.classList.toggle('rotating', mode === 'rotate');
    document.querySelector('canvas').style.cursor = mode === 'rotate' ? 'grab' : '';
  }

  hideBarber() {
    this.hideReference(); if (this.barberEl) { this.barberEl.remove(); this.barberEl = null; } }

  updateBarber(st) {
    if (!this.barberEl) return;
    for (const [id, b] of Object.entries(this.toolBtns)) b.classList.toggle('on', id === st.tool);
    this.powerBtn.classList.toggle('on', !!st.power);
    this.powerBtn.style.display = st.electric ? '' : 'none';
    this.guardsEl.style.display = st.tool === 'clipper' ? '' : 'none';
    this.guardsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === st.guard));
    const cut = st.cut;
    for (const [r, row] of Object.entries(this.regionEls)) {
      const stat = st.stats[r];
      const tgt = cut.target[r];
      if (!stat) continue;
      const edge = EDGE_REGIONS.has(r);
      const scale = 0.75;
      const cur = clamp(stat.mean / scale, 0, 1);
      const zl = clamp((tgt - cut.tol) / scale, 0, 1), zr = clamp((tgt + cut.tol) / scale, 0, 1);
      row.querySelector('.cur').style.width = (edge ? clamp(stat.messy * 6, 0, 1) : cur) * 100 + '%';
      const zone = row.querySelector('.zone');
      if (edge) { zone.style.left = '0%'; zone.style.width = '8%'; }
      else { zone.style.left = zl * 100 + '%'; zone.style.width = Math.max(2, (zr - zl) * 100) + '%'; }
      const ok = edge ? stat.messy < 0.04 : Math.abs(stat.mean - tgt) <= cut.tol;
      const short = !edge && stat.mean < tgt - cut.tol;
      row.classList.toggle('ok', ok);
      row.classList.toggle('short', short);
      row.classList.toggle('focus', st.focus === r);
      row.querySelector('b').textContent = edge ? (ok ? 'clean' : 'messy') : `${mm(stat.mean)} / ${mm(tgt)} mm`;
    }
    if (this.dyeEl && st.dyed !== null && st.dyed !== undefined) {
      this.dyeEl.querySelector('.cur').style.width = st.dyed * 100 + '%';
      this.dyeEl.querySelector('b').textContent = Math.round(st.dyed * 100) + '%';
      this.dyeEl.classList.toggle('ok', st.dyed >= 0.85);
    }
    if (this.styleEl && st.styled !== null && st.styled !== undefined) {
      this.styleEl.querySelector('.cur').style.width = st.styled * 100 + '%';
      this.styleEl.querySelector('b').textContent = Math.round(st.styled * 100) + '%';
      this.styleEl.classList.toggle('ok', st.styled >= 0.85);
    }
    this.barberEl.querySelector('.cut-timer').textContent = `Time ${Math.floor(st.time / 60)}:${String(Math.floor(st.time % 60)).padStart(2, '0')}`;
  }

  barberHint(what, on = true) {
    if (!this.barberEl) return;
    this.barberEl.querySelectorAll('.hint').forEach((e) => e.classList.remove('hint'));
    if (!on || !what) return;
    if (what === 'power') this.powerBtn.classList.add('hint');
    else if (what === 'finish') this.finishBtn.classList.add('hint');
    else if (what === 'view') this.modesEl?.querySelector('[data-m="rotate"]').classList.add('hint');
    else if (what === 'cutmode') this.modesEl?.querySelector('[data-m="cut"]').classList.add('hint');
    else if (what === 'close') this.closeBtn?.classList.add('hint');
    else if (what.startsWith('guard:')) this.guardsEl.querySelector(`button[data-i="${what.split(':')[1]}"]`)?.classList.add('hint');
    else if (this.toolBtns[what]) this.toolBtns[what].classList.add('hint');
  }

  // ------------------------------------------------------------------ result
  showResult(r) {
    return new Promise((resolve) => {
      const pct = (v) => Math.round(v * 100) + '%';
      const cls = (v) => (v >= 0.85 ? 'good' : v >= 0.6 ? 'mid' : 'bad');
      const rows = [['Accuracy', r.accuracy], ['Symmetry', r.symmetry], ['Edges', r.edges]];
      if (r.fade !== null && r.fade !== undefined) rows.push(['Fade', r.fade]);
      if (r.style !== null && r.style !== undefined) rows.push(['Styling', r.style]);
      if (r.dye !== null && r.dye !== undefined) rows.push(['Colour', r.dye]);
      rows.push(['Speed', r.speed]);
      if (r.groom > 0.05) rows.push(['Grooming', r.groom]);
      const wrap = h(`<div class="panel-wrap"><div class="card result">
        <div class="k">${r.kicker}</div><h3>${r.title}</h3>
        <div class="quote">“${r.quote}”</div>
        <div class="stars">${starSVG.repeat(5)}</div>
        <div class="stats">${rows.map(([l, v]) => `<div class="stat"><span>${l}</span><span class="v ${cls(v)}">${pct(v)}</span></div>`).join('')}</div>
        <div class="payout"><div><span class="n pay">$0</span><span class="l">Payment</span></div><div><span class="n tipn">$0</span><span class="l">Tip</span></div><div><span class="n xp">+0</span><span class="l">XP</span></div></div>
        <div class="lvlbar"><i></i></div><div class="lvltxt"><span class="lv">Level ${r.level}</span><span class="nx"></span></div>
        <button class="cbtn">Continue</button></div></div>`);
      this.root.append(wrap);
      const stars = wrap.querySelectorAll('.stars svg');
      const stats = wrap.querySelectorAll('.stat');
      const btn = wrap.querySelector('.cbtn');
      btn.style.visibility = 'hidden';
      const lvlbar = wrap.querySelector('.lvlbar i');
      lvlbar.style.width = Math.round(r.xpBefore / r.xpNeedBefore * 100) + '%';
      wrap.querySelector('.nx').textContent = `${r.xpBefore} / ${r.xpNeedBefore} XP`;
      let t = 250;
      stats.forEach((s) => { setTimeout(() => { s.classList.add('show'); audio.tick(); }, t); t += 220; });
      t += 150;
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          stars[i].classList.add(i < r.stars ? 'on' : 'shown');
          if (i < r.stars) audio.star(i);
        }, t);
        t += 230;
      }
      const count = (el, to, prefix, dur) => {
        const t0 = performance.now();
        const f = () => {
          const k = clamp((performance.now() - t0) / dur, 0, 1);
          const v = Math.round(to * (1 - Math.pow(1 - k, 3)));
          el.textContent = prefix + v;
          if (k < 1) { if (Math.random() < 0.4) audio.tick(k * 10); requestAnimationFrame(f); }
        };
        f();
      };
      setTimeout(() => count(wrap.querySelector('.pay'), r.pay, '$', 700), t);
      t += 650;
      setTimeout(() => { count(wrap.querySelector('.tipn'), r.tip, '$', 500); if (r.tip > 0) audio.coin(); }, t);
      t += 550;
      setTimeout(() => {
        count(wrap.querySelector('.xp'), r.xp, '+', 500);
        lvlbar.style.width = Math.round(r.levelUp ? 100 : r.xpAfter / r.xpNeedAfter * 100) + '%';
        wrap.querySelector('.nx').textContent = r.levelUp ? 'Level up!' : `${r.xpAfter} / ${r.xpNeedAfter} XP`;
      }, t);
      t += 700;
      if (r.levelUp) {
        setTimeout(() => {
          audio.levelUp();
          wrap.querySelector('.lv').textContent = `Level ${r.level + 1}`;
          lvlbar.style.transition = 'none'; lvlbar.style.width = '0%';
          requestAnimationFrame(() => { lvlbar.style.transition = ''; lvlbar.style.width = Math.round(r.xpAfter / r.xpNeedAfter * 100) + '%'; });
        }, t);
        t += 500;
      }
      setTimeout(() => { btn.style.visibility = ''; }, t);
      const done = () => { wrap.remove(); this.input.virtual.delete('interact'); resolve(); };
      btn.addEventListener('click', done);
      this._resultClose = () => { if (btn.style.visibility !== 'hidden') done(); };
    });
  }

  // ------------------------------------------------------------------ banners, toasts
  async banner(k, t, s = '', ms = 2200) {
    const el = this.bannerEl;
    el.querySelector('.k').textContent = k;
    el.querySelector('.t').textContent = t;
    el.querySelector('.s').textContent = s;
    el.classList.remove('off');
    await wait(ms);
    el.classList.add('off');
    await wait(600);
  }

  // "GOT KEY!" style moment over the 3D item showcase; null hides it
  itemGet(info) {
    if (this.itemEl) {
      const old = this.itemEl; this.itemEl = null;
      old.classList.add('out');
      setTimeout(() => old.remove(), 500);
    }
    if (!info) return;
    const word = (info.title || 'GOT ITEM!');
    const letters = [...word].map((ch, i) => `<span style="animation-delay:${0.18 + i * 0.045}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    const el = h(`<div class="item-get">
      <div class="ig-dim"></div>
      <div class="ig-flash"></div>
      <div class="ig-title"><div class="ig-word">${letters}</div><div class="ig-shine"></div></div>
      <div class="ig-card"><div class="ig-name">${info.name || ''}</div><div class="ig-desc">${info.desc || ''}</div></div>
    </div>`);
    this.root.append(el);
    this.itemEl = el;
  }

  // camera flash (selfies)
  flash() {
    const el = h('<div class="cam-flash"></div>');
    this.root.append(el);
    setTimeout(() => el.remove(), 500);
  }

  toast(text, badge = '') {
    // never stack more than three
    const live = [...this.toastsEl.children].filter((e) => !e.classList.contains('out'));
    if (live.length >= 3) { live[0].classList.add('out'); setTimeout(() => live[0].remove(), 400); }
    const el = h(`<div class="toast">${badge ? `<span class="b">${badge}</span>` : ''}<span>${text}</span></div>`);
    this.toastsEl.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 2600);
  }

  floatText(x, y, text, color) {
    const el = h(`<div class="float-money" style="left:${x}px;top:${y}px">${text}</div>`);
    if (color) el.style.color = color;
    this.root.append(el);
    setTimeout(() => el.remove(), 1500);
  }

  setSkip(visible, progress = 0) {
    this.skipEl.classList.toggle('off', !visible);
    this.skipEl.querySelector('.fg').style.strokeDashoffset = 94.2 * (1 - progress);
  }

  // ------------------------------------------------------------------ patience bubbles
  setBubble(id, x, y, text, patience, cls = '') {
    let el = this.bubbles.get(id);
    if (!el) {
      el = h('<div class="bubble"><span class="t"></span><span class="pbar"><i></i></span></div>');
      this.bubblesEl.append(el);
      this.bubbles.set(id, el);
    }
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.className = 'bubble ' + cls;
    el.querySelector('.t').textContent = text;
    el.querySelector('i').style.width = Math.round(clamp(patience, 0, 1) * 100) + '%';
    el.querySelector('i').style.background = patience > 0.5 ? '#3e6b4a' : patience > 0.25 ? '#b5822c' : '#9a3428';
  }

  removeBubble(id) { const el = this.bubbles.get(id); if (el) { el.remove(); this.bubbles.delete(id); } }
  clearBubbles() { for (const id of [...this.bubbles.keys()]) this.removeBubble(id); }

  pauseMenu(cb) {
    const body = h('<div class="pause"><div class="col"></div></div>');
    const col = body.querySelector('.col');
    const add = (label, f, cls = '') => { const b = h(`<button class="mbtn ${cls}" style="color:var(--ink)">${label}</button>`); b.addEventListener('click', f); col.append(b); };
    add('Resume', cb.resume);
    add('Upgrades', cb.upgrades);
    add('Achievements', cb.achievements);
    add('Settings', cb.settings);
    add('Main menu', cb.menu);
    return this.panel('Paused', 'Take a break', body, cb.resume);
  }
}

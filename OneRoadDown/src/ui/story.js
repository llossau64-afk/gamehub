// Story mode DOM: the chapter / event screen, the cutscene overlay (letterbox, subtitles,
// title cards, skip), the tutorial prompt and the story block on the race result panel.
// Styles: css/story.css. Registers itself as ui.screens.story so ui.only() and the
// keyboard navigation of the main UI cover it.
import { fmtMoney } from '../core/util.js';
import { audio } from '../audio/audio.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const $ = (r, s) => r.querySelector(s);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const click = (el, fn, snd = 'click') => el && el.addEventListener('click', (e) => { e.stopPropagation(); audio()?.ui(snd); fn(e); });
const ord = (n) => (n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : n + 'TH');

export class StoryUI {
  constructor(ui) {
    this.ui = ui;
    this.handlers = {};
    // ---- story screen
    const s = (this.el = h(`<div id="story" class="screen">
      <div class="toptitle"><h2>STORY MODE<small>FROM NOTHING TO LEGEND</small></h2>
        <div class="st-driver"><div class="st-dname"></div><div class="st-lv"><b></b><i><s></s></i><span></span></div></div>
        <div class="cash"><span>CASH</span><b class="st-cash">$0</b></div></div>
      <div class="st-wrap live">
        <div class="st-chapters"></div>
        <div class="st-main"></div>
        <div class="st-side panel"></div>
      </div>
      <div class="st-bottom live">
        <button class="btn st-back">‹ MENU</button>
        <button class="btn st-scenes">SCENES</button>
        <button class="btn st-tut">TUTORIAL</button>
        <label class="st-name"><span>DRIVER</span><input maxlength="16" spellcheck="false" autocomplete="off"></label>
        <button class="btn main amber st-cont">CONTINUE STORY ›</button>
      </div>
    </div>`));
    ui.root.appendChild(s);
    ui.screens.story = s;
    click($(s, '.st-back'), () => this.emit('back'), 'back');
    click($(s, '.st-scenes'), () => this.emit('scenes'));
    click($(s, '.st-tut'), () => this.emit('tutorial'));
    click($(s, '.st-cont'), () => this.emit('continue'), 'buy');
    const nm = $(s, '.st-name input');
    nm.addEventListener('change', () => this.emit('name', nm.value));
    nm.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') nm.blur(); });
    // ---- cutscene overlay
    const c = (this.cine = h(`<div id="storycine">
      <div class="sc-lb top"></div><div class="sc-lb bot"></div>
      <div class="sc-title"><b></b><span></span></div>
      <div class="sc-sub"><b></b><span></span></div>
      <button class="sc-skip live"><i></i><span>SKIP</span><em>›</em></button>
      <div class="sc-tap live"></div>
    </div>`));
    ui.root.appendChild(c);
    const skip = $(c, '.sc-skip');
    // desktop: click skips; touch: hold for 0.7 s (the ring fills), so a stray tap never skips
    let holdT = null, holdStart = 0;
    const hold = (on) => {
      clearInterval(holdT);
      skip.style.setProperty('--k', 0);
      if (!on) return;
      holdStart = performance.now();
      holdT = setInterval(() => {
        const k = Math.min(1, (performance.now() - holdStart) / 700);
        skip.style.setProperty('--k', k);
        if (k >= 1) { clearInterval(holdT); this.onSkip && this.onSkip(); }
      }, 30);
    };
    let lastType = null;
    skip.addEventListener('pointerdown', (e) => { lastType = e.pointerType; if (e.pointerType === 'touch') { e.preventDefault(); hold(true); } });
    skip.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') hold(false); });
    skip.addEventListener('pointercancel', () => hold(false));
    skip.addEventListener('pointerleave', () => hold(false));
    // mouse click, keyboard (Enter on the focused button) and the main UI's navigation all land here
    skip.addEventListener('click', (e) => { e.stopPropagation(); const t = lastType; lastType = null; if (t === 'touch') return; this.onSkip && this.onSkip(); });
    // a tap anywhere on touch reveals the skip button
    $(c, '.sc-tap').addEventListener('pointerdown', () => { c.classList.add('reveal'); clearTimeout(this.revealT); this.revealT = setTimeout(() => c.classList.remove('reveal'), 3000); });
    // ---- tutorial prompt
    const t = (this.tut = h(`<div id="storytut">
      <div class="tu-card"><div class="tu-top"><span class="tu-step"></span><span class="tu-who">MARA</span></div>
        <div class="tu-text"></div><div class="tu-bar"><i></i></div></div>
      <button class="btn tu-skip live">SKIP TUTORIAL ›</button>
      <div class="tu-esc"><i></i>HOLD ESC TO SKIP</div>
    </div>`));
    ui.root.appendChild(t);
    click($(t, '.tu-skip'), () => this.emit('skipTutorial'), 'back');
  }

  on(n, f) { this.handlers[n] = f; }
  emit(n, ...a) { const f = this.handlers[n]; return f && f(...a); }

  // ------------------------------------------------------------------ cutscene overlay
  cineOn(on, onSkip) {
    this.onSkip = on ? onSkip : null;
    this.cine.classList.toggle('on', !!on);
    this.cine.classList.remove('reveal');
    document.body.classList.toggle('story-cine', !!on);
    this.say(null); this.titleCard(null);
    if (on) setTimeout(() => { const b = $(this.cine, '.sc-skip'); if (!document.body.classList.contains('touch')) b.focus({ preventScroll: true }); }, 60);
  }
  say(line, people) {
    const el = $(this.cine, '.sc-sub');
    if (!line) { el.classList.remove('on'); return; }
    const P = (this.people || {})[line.who];
    const b = $(el, 'b'), sp = $(el, 'span');
    b.textContent = line.who === 'radio' ? 'TRACK RADIO' : line.who === 'you' ? 'YOU' : P ? P.name : String(line.who).toUpperCase();
    b.style.color = P ? P.color : '';
    sp.textContent = line.text;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  titleCard(tc) {
    const el = $(this.cine, '.sc-title');
    if (!tc) { el.classList.remove('on'); return; }
    $(el, 'b').textContent = tc.big; $(el, 'span').textContent = tc.small || '';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  blackout(on) { return this.ui.fade(on); }

  // ------------------------------------------------------------------ tutorial
  tutorial(d) {
    const t = this.tut;
    if (!d) { t.classList.remove('on'); return; }
    t.classList.add('on');
    t.classList.toggle('hints-off', !!d.quiet);
    $(t, '.tu-step').textContent = d.step;
    $(t, '.tu-text').innerHTML = d.html;
    $(t, '.tu-bar i').style.width = Math.round((d.k || 0) * 100) + '%';
    t.classList.toggle('done', !!d.done);
  }
  tutorialEsc(k) { const e = $(this.tut, '.tu-esc'); e.classList.toggle('on', k > 0); $(e, 'i').style.width = Math.round(k * 100) + '%'; }

  // ------------------------------------------------------------------ story screen
  render(d) {
    const s = this.el;
    $(s, '.st-cash').textContent = fmtMoney(d.cash);
    $(s, '.st-dname').textContent = d.name;
    $(s, '.st-lv b').textContent = 'LV ' + d.level.lv;
    $(s, '.st-lv s').style.width = Math.round(d.level.frac * 100) + '%';
    $(s, '.st-lv span').textContent = d.xp.toLocaleString('en-US') + ' XP';
    const nm = $(s, '.st-name input');
    if (document.activeElement !== nm) nm.value = d.name;
    const cont = $(s, '.st-cont');
    cont.textContent = d.cont ? d.cont.label : 'STORY COMPLETE';
    cont.disabled = !d.cont;
    // chapter rail
    $(s, '.st-chapters').innerHTML = d.chapters.map((c) => `<button class="st-ch ${c.state} ${c.id === d.sel.id ? 'sel' : ''}" data-c="${c.id}" ${c.state === 'locked' ? 'aria-disabled="true"' : ''}>
        <i>${c.n}</i><span><b>${esc(c.title)}</b><small>${c.state === 'locked' ? 'LOCKED' : c.done + ' / ' + c.total + ' EVENTS'}</small></span>${c.state === 'done' ? '<em>✓</em>' : ''}
        <s style="width:${Math.round(c.done / c.total * 100)}%"></s></button>`).join('');
    s.querySelectorAll('.st-ch').forEach((b) => click(b, () => this.emit('chapter', b.dataset.c)));
    // chapter main
    const c = d.sel;
    const evs = c.events.map((e, i) => `<button class="st-ev ${e.state} ${e.id === d.selEvent ? 'sel' : ''}" data-e="${e.id}">
        <div class="se-top"><span class="cc">${esc(e.cc)}</span><span>EVENT ${i + 1}</span>${e.state === 'done' ? `<em class="medal m${Math.min(4, e.best)}">${e.best <= 3 ? ord(e.best).slice(0, -2) : 'P' + e.best}</em>` : e.state === 'locked' ? '<em class="lock">LOCKED</em>' : '<em class="new">OPEN</em>'}</div>
        <canvas width="160" height="54"></canvas>
        <div class="se-name">${esc(e.title)}</div><div class="se-map">${esc(e.mapName)}</div>
        <div class="se-obj">${e.target === 1 ? 'WIN' : 'TOP ' + e.target}${e.rule ? ' · ' + esc(e.ruleShort) : ''}${e.rival ? ' · <b style="color:' + e.rival.color + '">' + esc(e.rival.name) + '</b>' : ''}</div>
      </button>`).join('<i class="st-link"></i>');
    const rivals = c.rivals.map((r) => `<div class="st-rival" style="--rc:${r.color}"><div class="sr-badge">${esc(r.initials)}<small>${esc(r.cc)}</small></div>
        <div><b>${esc(r.name)}</b><span>${esc(r.trait)}</span><p>${esc(r.bio)}</p></div></div>`).join('');
    const offers = c.offers.map((o) => `<button class="st-offer ${o.owned ? 'owned' : ''}" data-car="${o.id}" ${o.owned || !o.afford || c.locked ? 'disabled' : ''}>
        <b>${esc(o.name)}</b><span>${esc(o.cls)}</span><em>${o.owned ? 'OWNED' : `<s>${fmtMoney(o.price)}</s> ${fmtMoney(o.deal)}`}</em></button>`).join('');
    $(s, '.st-main').innerHTML = `<div class="st-head"><div class="sh-n">CHAPTER ${c.n}</div><h3>${esc(c.title)}</h3><p>${esc(c.tagline)}</p>
        <div class="sh-row"><span class="cls" style="--cc:${c.clsColor}">${c.cls} CLASS</span><span class="sh-prog"><i style="width:${Math.round(c.done / c.total * 100)}%"></i></span><span class="sh-pct">${c.done}/${c.total}</span></div></div>
      <div class="st-events">${evs}</div>
      <div class="st-lower">
        <div class="st-box"><div class="sb-h">RIVALS</div>${rivals}</div>
        <div class="st-box"><div class="sb-h">CHAPTER REWARD</div><div class="st-gift ${c.gift.got ? 'got' : ''}"><b>${esc(c.gift.name)}</b><span>${esc(c.gift.cls)} · ${c.gift.got ? 'CLAIMED' : 'GIFT ON COMPLETION'}</span></div>
          <div class="sb-h">MARA'S CONTACTS · ${Math.round(c.discount * 100)}% OFF</div><div class="st-offers">${offers}</div></div>
      </div>`;
    s.querySelectorAll('.st-ev').forEach((b) => click(b, () => this.emit('event', b.dataset.e)));
    s.querySelectorAll('.st-offer').forEach((b) => click(b, () => this.emit('buy', b.dataset.car), 'buy'));
    s.querySelectorAll('.st-ev canvas').forEach((cv, i) => { const e = c.events[i]; if (e.outline) this.ui.drawOutline(cv, e.outline, e.loop, false); });
    // event detail
    const e = d.detail;
    const side = $(s, '.st-side');
    if (!e) { side.innerHTML = '<div class="sd-empty">Select an event.</div>'; return; }
    const cars = e.cars.map((x) => `<option value="${x.id}" ${x.id === e.car ? 'selected' : ''} ${x.ok ? '' : 'disabled'}>${esc(x.name)} · ${x.cls}${x.ok ? '' : ' (TOO FAST)'}</option>`).join('');
    side.innerHTML = `<div class="sd-top"><span class="cc">${esc(e.cc)}</span>${esc(e.place)}</div><h3>${esc(e.title)}</h3><div class="sd-map">${esc(e.mapName)} · ${esc(e.line)}</div>
      <div class="sd-brief"><b>MARA</b>${esc(e.brief)}</div>
      <div class="sd-obj"><div><span>OBJECTIVE</span><b>${e.target === 1 ? 'WIN THE RACE' : 'FINISH TOP ' + e.target}</b></div>
        ${e.rule ? `<div><span>RULE</span><b>${esc(e.ruleLong)}</b></div>` : ''}
        <div><span>FIELD</span><b>${e.opp + 1} DRIVERS${e.rival ? ' · ' + esc(e.rival.name) : ''}</b></div>
        <div><span>CLASS</span><b style="color:${e.clsColor}">UP TO ${e.cls}</b></div>
        <div><span>REWARD</span><b>${fmtMoney(e.cash)} · ${e.xp} XP${e.done ? ' <small>(REPLAY: 25%)</small>' : ''}</b></div>
        ${e.done ? `<div><span>BEST</span><b>P${e.best}</b></div>` : ''}</div>
      <label class="sd-car"><span>YOUR CAR</span><select>${cars || '<option disabled selected>NO CAR FITS THIS CLASS</option>'}</select></label>
      ${e.reason ? `<div class="sd-warn">${esc(e.reason)}</div>` : ''}
      <button class="btn main amber sd-go" ${e.canStart ? '' : 'disabled'}>${e.done ? 'REPLAY EVENT ›' : 'START EVENT ›'}</button>`;
    const sel = $(side, 'select');
    if (sel) { sel.addEventListener('change', () => this.emit('car', sel.value)); sel.addEventListener('keydown', (ev) => ev.stopPropagation()); }
    click($(side, '.sd-go'), () => this.emit('start', e.id), 'buy');
  }

  // ------------------------------------------------------------------ scenes list
  scenesModal(list) {
    this.ui.openModal('SCENES', `<div class="st-scenes">${list.map((x) => `<div class="ss-row ${x.seen ? '' : 'locked'}"><div><b>${esc(x.seen ? x.title : '? ? ?')}</b><span>${esc(x.chapter)}</span></div>
        <button class="btn small ss-play" data-id="${x.id}" ${x.seen ? '' : 'disabled'}>${x.seen ? 'PLAY ›' : 'LOCKED'}</button></div>`).join('')}</div>`, (body) => {
      body.querySelectorAll('.ss-play').forEach((b) => click(b, () => { this.ui.closeModal(); this.emit('replay', b.dataset.id); }));
    });
  }

  // ------------------------------------------------------------------ race results
  resultBlock(d) {
    const p = this.ui.screens.raceres && this.ui.screens.raceres.querySelector('.panel');
    if (!p) return;
    const ok = (b) => (b ? '<i class="ok">✓</i>' : '<i class="no">✗</i>');
    const blk = h(`<div class="st-res ${d.pass ? 'pass' : 'fail'}"><div class="sr-h">STORY · CHAPTER ${d.chapter} · ${esc(d.title)}</div>
      <div class="sr-o">${ok(d.posOk)}<span>${d.target === 1 ? 'WIN THE RACE' : 'FINISH TOP ' + d.target}</span><b>P${d.pos}</b></div>
      ${d.rule ? `<div class="sr-o">${ok(d.ruleOk)}<span>${esc(d.ruleLong)}</span><b>${esc(d.ruleVal)}</b></div>` : ''}
      <div class="sr-v">${d.pass ? (d.first ? 'EVENT COMPLETE' : 'EVENT COMPLETE · REPLAY') : 'OBJECTIVE FAILED · TRY AGAIN'}</div>
      ${d.pass ? `<div class="sr-r"><span>STORY REWARD</span><b>+${fmtMoney(d.cash)} · +${d.xp} XP</b></div>` : ''}
      ${d.extra ? `<div class="sr-x">${d.extra}</div>` : ''}</div>`);
    p.querySelectorAll('.st-res').forEach((x) => x.remove());
    const h2 = p.querySelector('h2');
    if (h2 && h2.nextSibling) p.insertBefore(blk, h2.nextSibling); else p.prepend(blk);
    const foot = p.querySelector('.foot');
    if (foot) {
      foot.innerHTML = `<button class="btn rr-sretry">RETRY EVENT <span style="opacity:.5;font-size:.8em">[R]</span></button><button class="btn main amber rr-scont">${d.pass ? 'CONTINUE STORY ›' : 'BACK TO STORY ›'}</button>`;
      click($(foot, '.rr-sretry'), () => this.emit('retry'));
      click($(foot, '.rr-scont'), () => this.emit('afterRace'), 'buy');
    }
    this.ui.autoFocus();
  }
}

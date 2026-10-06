// Frame-exact trailer recorder: fakes the clock, steps the game at 30 fps, screenshots every frame.
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = __dirname + '/' + (process.env.OUTDIR || 'frames');
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
fs.mkdirSync(DIR, { recursive: true });

const FAKE = () => {
  const F = window.__F = { on: false, t: 0, timers: [], id: 1e7, raf: [] };
  const pn = performance.now.bind(performance);
  performance.now = () => F.on ? F.t : pn();
  const rST = setTimeout.bind(window), rCT = clearTimeout.bind(window), rSI = setInterval.bind(window), rCI = clearInterval.bind(window), rRAF = requestAnimationFrame.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => { if (!F.on) return rST(fn, ms, ...a); const id = F.id++; F.timers.push({ id, due: F.t + (+ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { if (!F.on) return rSI(fn, ms, ...a); const id = F.id++; F.timers.push({ id, due: F.t + Math.max(1, +ms || 0), fn, a, every: Math.max(1, +ms || 0) }); return id; };
  window.clearTimeout = window.clearInterval = id => { if (id >= 1e7) F.timers = F.timers.filter(t => t.id !== id); else { rCT(id); rCI(id); } };
  window.requestAnimationFrame = fn => { if (!F.on) return rRAF(fn); F.raf.push(fn); return 1; };
  F.start = () => { F.t = pn(); F.on = true; };
  F.step = ms => {
    F.t += ms;
    for (let guard = 0; guard < 500; guard++) {
      let best = null; for (const t of F.timers) if (t.due <= F.t && (!best || t.due < best.due)) best = t;
      if (!best) break;
      if (best.every) best.due += best.every; else F.timers = F.timers.filter(t => t !== best);
      try { typeof best.fn === 'function' ? best.fn(...best.a) : 0; } catch (e) { console.error(e); }
    }
    const r = F.raf; F.raf = []; for (const f of r) f(F.t);
  };
};

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(FAKE);
  await page.goto('http://localhost:8123/'); await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await page.evaluate(async () => {
    const d = __omf.save.data;
    Object.assign(d, { tutorialDone: true, introDone: true, ability: 'lightning', coins: 99999, keys: 20, seenBoss: { warden: true, crusher: true, hunter: true, argus: true } });
    d.abilities = { lightning: { xp: 999999, claimed: 20 }, fire: { xp: 999999, claimed: 20 }, earth: { xp: 999999, claimed: 20 } };
    d.skins.push('knight', 'dragon', 'ember', 'oni'); d.weapons.push('steel', 'dragonfang', 'ember');
    const m = await import('./js/input.js'); window.__I = m.input;
    const st = document.createElement('style');
    st.textContent = `#toasts,.m-hint,#daily-chip,.daily-chip,#banner{display:none!important}
      #chestopen .co-rays{width:100vmax!important;height:100vmax!important;-webkit-mask:none!important;mask:none!important;background:repeating-conic-gradient(from 0deg,rgba(242,178,74,.10) 0deg 7deg,transparent 7deg 22deg)!important}
      #tov{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:'Big Shoulders Display',sans-serif}
      #tov .blk{position:absolute;inset:0;background:#000;opacity:0}
      #tov .grad{position:absolute;inset:0;background:radial-gradient(80% 70% at 50% 50%,transparent 30%,rgba(0,0,0,.75));opacity:0}
      #tov .tx{position:absolute;left:0;right:0;text-align:center;top:50%;transform:translateY(-50%)}
      #tov .tx.low{top:auto;bottom:9%;transform:none}
      #tov .tx.top{top:7%;transform:none}
      #tov small{display:block;font:800 1.5vw/1 Manrope,sans-serif;letter-spacing:.42em;color:#f2b24a;margin-bottom:.8vw;text-shadow:0 2px 12px rgba(0,0,0,.8)}
      #tov h1{margin:0;font-weight:900;font-size:5.6vw;line-height:.92;letter-spacing:.02em;color:#f4efe6;text-shadow:0 6px 0 rgba(0,0,0,.45),0 0 40px rgba(0,0,0,.7)}
      #tov h1 em{font-style:normal;color:#f2b24a}
      #tov .logo h1{font-size:10vw}
      #tov .bar{width:0;height:.25vw;background:#f2b24a;margin:1vw auto 0}`;
    document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'tov'; ov.innerHTML = '<div class="grad"></div><div class="blk"></div><div class="tx"><small></small><h1></h1><div class="bar"></div></div>';
    document.body.appendChild(ov);
    window.__ov = o => {
      ov.querySelector('.blk').style.opacity = o.black || 0;
      ov.querySelector('.grad').style.opacity = o.grad || 0;
      const tx = ov.querySelector('.tx');
      tx.className = 'tx ' + (o.pos || '') + (o.logo ? ' logo' : '');
      tx.style.opacity = o.a ?? 0;
      tx.querySelector('h1').innerHTML = o.text || '';
      tx.querySelector('small').textContent = o.sub || '';
      tx.querySelector('small').style.display = o.sub ? '' : 'none';
      const s = o.s ?? 1; tx.querySelector('h1').style.transform = `scale(${s})`;
      tx.querySelector('.bar').style.width = o.bar || 0;
    };
    // bot: fight the nearest thing, dodge bullets, cast the power on a rhythm
    const g = __omf.game, I = window.__I, orig = g.update.bind(g);
    window.__botOn = false; window.__cast = 0;
    g.update = dt => {
      const p = g.player;
      if (window.__botOn && g.mode === 'run' && p) {
        if (!p.dead) p.hp = p.maxHp;
        let mx = 0, mz = 0, atk = false;
        let best = null, bd = 1e9;
        for (const e of g.enemies) if (!e.dead && e.state !== 'spawn') { const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; best = e; } }
        if (g.boss && g.boss.active && !g.boss.dead && g.boss.visible) { const bb = g.boss, d = (bb.x - p.x) ** 2 + (bb.z - p.z) ** 2; if (d < bd) { bd = d; best = bb; } }
        if (best && (g.phase === 'fight')) {
          const dx = best.x - p.x, dz = best.z - p.z, d = Math.hypot(dx, dz);
          const want = window.__keep || 1.8;
          if (d > want + best.r) { mx = dx / d; mz = dz / d; } else { mx = -dz / d * 0.6; mz = dx / d * 0.6; }
          atk = d < 3 + best.r;
          if (g.bullets.some(b => (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 2.5) && Math.random() < 0.25) I.dashPressed = true;
          if (window.__cast && (g.frameNo = (g.frameNo || 0) + 1) % window.__cast === 0) { p.abilityCd = 0; I.abilityPressed = true; }
        }
        I.move.x = mx; I.move.z = mz; I.attackHeld = atk; I.mouseActive = false;
      }
      orig(dt);
    };
  });

  let frame = +(process.env.FRAME0 || 0), realMs = 0;
  const shot = async () => {
    const t0 = Date.now();
    await page.screenshot({ path: `${DIR}/${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90, timeout: 180000 });
    frame++; realMs = realMs * 0.9 + (Date.now() - t0) * 0.1;
  };
  const step = (n = 1) => page.evaluate(n => { for (let i = 0; i < n; i++) __F.step(1000 / 30); }, n);
  // record n frames; ov(i, n) returns overlay state for local frame i
  const rec = async (n, ov = () => ({})) => {
    for (let i = 0; i < n; i++) {
      await page.evaluate(o => { __ov(o); __F.step(1000 / 30); }, ov(i, n));
      if (i % 15 === 0) await cdp.send('Animation.setPlaybackRate', { playbackRate: Math.max(0.02, Math.min(1, 33 / Math.max(33, realMs + 120))) });
      await shot();
    }
  };
  const fadeIO = (i, n, k = 5) => Math.max(0, 1 - i / k, 1 - (n - 1 - i) / k);
  const textIn = (i, n, from = 4, to = n - 4) => i < from ? 0 : i > to ? Math.max(0, 1 - (i - to) / 5) : Math.min(1, (i - from) / 8);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const setRun = (floor, o = {}) => ev(({ floor, o }) => {
    const g = __omf.game, d = __omf.save.data;
    if (o.ability) d.ability = o.ability; if (o.skin) d.skin = o.skin; if (o.weapon) d.weapon = o.weapon;
    g.buildPlayerModel();
    g.startRun(); g.run.floor = floor - 1; g.nextFloor();
    g.stats.damageMul = o.dmg || 2.2;
    window.__keep = o.keep || 1.8; window.__cast = o.cast || 0;
  }, { floor, o });

  await ev(() => __F.start());
  const scenes = {};

  // 1. cold open: menu backdrop in the dark
  scenes.intro = async () => {
    await ev(() => { __omf.game.enterMenu(); __omf.ui.showMenu(); __omf.ui.show('none'); });
    await step(10);
    await rec(90, (i, n) => ({ black: Math.max(0.55, 1 - i / 30), grad: 1, text: 'NOBODY HAS EVER<br>REACHED <em>THE TOP</em>', a: textIn(i, n, 18, 82), s: 1 + i * 0.0008 }));
  };
  // 2. Argus speaks
  scenes.argus = async () => {
    await ev(() => { const g = __omf.game; g.enterMenu(); __omf.ui.show('none'); g.say(['Forty floors. Eight worlds. A guardian on every tenth.', 'Climb, if you dare. I will be waiting at the top.']); });
    await rec(45, (i, n) => ({ grad: 0.6, black: Math.max(0, 1 - i / 6) }));
    await ev(() => { const u = __omf.ui; if (u.dlg && u.dlg.typing) u.dialogTypeDone(); u.dialogAdvance(); });
    await rec(45, (i, n) => ({ grad: 0.6, black: Math.max(0, (i - 40) / 5) }));
    await ev(() => { const u = __omf.ui; while (u.dlg) { if (u.dlg.typing) u.dialogTypeDone(); u.dialogAdvance(); if (u.dlg && !u.dlg.typing) break; } });
  };
  // 3. worlds
  const fight = async (floor, n, o, ov) => {
    await setRun(floor, o);
    await ev(() => { window.__botOn = true; });
    await step(o.pre || 95);
    await rec(n, ov);
  };
  scenes.worlds = async () => {
    const T = (i, n) => ({ text: '40 FLOORS · <em>8 WORLDS</em>', pos: 'low', a: textIn(i, n, 6, n), black: Math.max(0, 1 - i / 3) });
    await fight(4, 75, { skin: 'knight', weapon: 'steel', ability: 'fire', cast: 70 }, (i, n) => ({ ...T(i, 225), black: Math.max(0, 1 - i / 3) }));
    await fight(9, 75, { skin: 'knight', weapon: 'steel', ability: 'fire', cast: 70 }, (i, n) => T(i + 75, 225));
    await fight(18, 75, { skin: 'knight', weapon: 'steel', ability: 'fire', cast: 70 }, (i, n) => ({ ...T(i + 150, 225), black: Math.max(0, (i - 71) / 3) }));
  };
  // 4. powers
  scenes.powers = async () => {
    const T = (i) => ({ sub: 'CHOOSE YOUR POWER', text: '<em>MASTER</em> IT', pos: 'low', a: textIn(i, 180, 4, 176) });
    await fight(27, 60, { skin: 'oni', weapon: 'ember', ability: 'lightning', cast: 22, keep: 3 }, (i) => T(i));
    await fight(23, 60, { skin: 'oni', weapon: 'ember', ability: 'fire', cast: 20, keep: 3 }, (i) => T(i + 60));
    await fight(32, 60, { skin: 'oni', weapon: 'ember', ability: 'earth', cast: 24, keep: 3 }, (i) => ({ ...T(i + 120), black: Math.max(0, (i - 56) / 3) }));
  };
  // 5. a guardian
  scenes.boss = async () => {
    await setRun(20, { skin: 'ember', weapon: 'ember', ability: 'fire', cast: 45, dmg: 1.2 });
    await ev(() => { window.__botOn = true; });
    await step(20);
    await rec(45, (i) => ({ black: Math.max(0, 1 - i / 4) }));
    await step(Math.max(0, 0));
    await ev(() => { const g = __omf.game; for (let k = 0; k < 90 && g.phase !== 'fight'; k++) __F.step(1000 / 30); });
    await step(30);
    await rec(90, (i, n) => ({ sub: 'EVERY TENTH FLOOR', text: 'A <em>GUARDIAN</em>', pos: 'low', a: textIn(i, n, 4, 84), black: Math.max(0, (i - 86) / 3) }));
  };
  // 6. chests
  scenes.chest = async () => {
    await ev(() => { const g = __omf.game; window.__botOn = false; g.enterMenu(); __omf.ui.showShop('chests'); });
    await rec(30, (i) => ({ black: Math.max(0, 1 - i / 4), sub: 'OPEN CHESTS', text: 'EXCLUSIVE <em>LOOT</em>', pos: 'low', a: 0 }));
    await ev(() => { __omf.ui.openChest('gold', { rarity: 'legendary', kind: 'skin', id: 'dragon', name: 'Dragon Lord' }); });
    await rec(40);
    await ev(() => document.querySelector('#chestopen .co-view').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
    await rec(110, (i, n) => ({ sub: 'OPEN CHESTS', text: 'EXCLUSIVE <em>SKINS & WEAPONS</em>', pos: 'top', a: i > 60 ? Math.min(1, (i - 60) / 8) : 0, black: Math.max(0, (i - 106) / 3) }));
  };
  // 7. Argus
  scenes.final = async () => {
    await ev(() => { __omf.ui.show('none'); const g = __omf.game; g.say = () => Promise.resolve(); });
    await setRun(40, { skin: 'dragon', weapon: 'dragonfang', ability: 'lightning', cast: 40, dmg: 1, keep: 3 });
    await ev(() => { window.__botOn = true; });
    await step(18);
    await rec(95, (i, n) => ({ black: Math.max(0, 1 - i / 5), sub: 'AND AT THE TOP', text: 'HE <em>WAITS</em>', pos: 'low', a: textIn(i, n, 50, 92) }));
    await ev(() => { const g = __omf.game; for (let k = 0; k < 60 && g.phase !== 'fight'; k++) __F.step(1000 / 30); });
    await step(40);
    await rec(55);
    await ev(() => { const b = __omf.game.boss; b.hp = b.maxHp * 0.49; });
    await rec(60, (i, n) => ({ black: Math.max(0, (i - 56) / 3) }));
  };
  // 8. logo
  scenes.logo = async () => {
    await ev(() => { const g = __omf.game; window.__botOn = false; document.getElementById('chestopen').innerHTML = ''; g.enterMenu(); __omf.ui.showMenu(); __omf.ui.show('none'); });
    await step(5);
    await rec(120, (i, n) => ({ logo: true, black: 0.55, grad: 1, sub: 'PLAY FREE IN YOUR BROWSER', text: 'TOWER<br><em>OF ARGUS</em>', a: Math.min(1, i / 10), s: 1.12 - Math.min(1, i / 14) * 0.12 + i * 0.0004, bar: Math.min(27, i * 1.2) + 'vw' }));
  };

  const order = ['intro', 'argus', 'worlds', 'powers', 'boss', 'chest', 'final', 'logo'];
  const marks = {};
  for (const s of order) {
    if (ONLY && !ONLY.includes(s)) continue;
    marks[s] = frame; const t0 = Date.now();
    await scenes[s]();
    console.log(s, 'frames', marks[s], '->', frame, ((Date.now() - t0) / 1000).toFixed(0) + 's', 'avgShot', realMs.toFixed(0));
  }
  fs.writeFileSync(__dirname + '/marks' + (process.env.FRAME0 || '') + '.json', JSON.stringify({ marks, total: frame }));
  await b.close();
})();

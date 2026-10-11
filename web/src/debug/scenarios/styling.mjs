// Phase C: styling tools (brush, dryer, wax, powder), fade guides, burst fade, result screen
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 8, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  // burst fade with beginner guide lines
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'burstFade', noBeard: true } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(1.5);
  await ev(() => { const b = window.__game.barber; b.setView('right'); b.selectTool('clipper'); });
  await step(0.6); await snap('burst_guides');
  await ev(() => window.__game.barber.toggleClose()); await step(0.8); await snap('burst_guides_close');
  await ev(() => { const g = window.__game; g.barber.exit(); g.state = 'play'; g.customers.clear(); });
  await step(0.3);
  // quiff: let an "employee" cut it, then style by hand
  await ev(async () => { const { fadeTarget } = await import('/src/hair/styles.js'); const g = window.__game; const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'quiff', noBeard: true } }); g.removeCape(c); c.state = 'seated';
    const st = c.hair; st.beginService(c.cut, 0.9, fadeTarget); window.__c = c; g.enterBarber(c, {}); });
  await step(1.2);
  await ev(() => { const c = window.__c; c.hair._svcStyling = null; c.hair.serviceProgress(1); });
  await ev(() => { const b = window.__game.barber; b.setView('front'); b.selectTool('spray'); });
  await step(0.5); await snap('quiff_cut');
  const sweep = async (tool, n, from, to, back = 0.0) => {
    await ev((t) => window.__game.barber.selectTool(t), tool);
    for (let i = 0; i < n; i++) {
      const k = (i % 10) / 9, row = Math.floor(i / 10);
      await ev(([k, row, from, to]) => { const g = window.__game, c = g.barber.c; const phi = -1.1 + (row % 10) * 0.25; const th = from + (to - from) * k; const p = c.hair.surfacePoint(phi, th, 0.0).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true }); }, [k, row, from, to]);
      await step(1 / 30);
      if (k === 1) { await ev(() => { window.__game.input.pointer.down = false; }); await step(1 / 30); }
    }
    await ev(() => { window.__game.input.pointer.down = false; });
    await step(0.2);
  };
  await sweep('dryer', 200, 0.95, 0.3);
  await snap('quiff_dryer');
  await sweep('pomade', 100, 0.9, 0.35);
  await ev(() => window.__game.barber.setView('right')); await step(0.6);
  await snap('quiff_styled_side');
  console.log('style', await ev(() => { const c = window.__c, h = c.hair; let n = 0, e = 0, s = 0, v = 0, pr = 0, st = 0;
    for (let k = 0; k < h.len.length; k++) { if (h.region[k] !== 1 && h.region[k] !== 2) continue; n++; e += h.dirE[k]; s += h.dirS[k]; v += h.volume[k]; pr += h.product[k]; st += h.styled[k]; }
    return JSON.stringify({ share: h.styledShare().toFixed(2), score: h.styleScore(c.cut.styling).toFixed(2), e: (e / n).toFixed(2), s: (s / n).toFixed(2), v: (v / n).toFixed(2), p: (pr / n).toFixed(2), st: (st / n).toFixed(2) }); }));
  await ev(() => window.__game.barber.requestFinish());
  await until(() => !!document.querySelector('.result .cbtn') && document.querySelector('.result .cbtn').style.visibility !== 'hidden', 40);
  await snap('result');
};

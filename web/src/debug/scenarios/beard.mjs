export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: window.__cut || 'beardTrim' } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(2.5);
  await snap('beard_start');
  await ev(() => { const b = window.__game.barber; b.selectTool('clipper'); b.setGuard(2); b.togglePower(); });
  const cut = async (aFrom, aTo, yFrom, yTo, secs) => {
    const n = Math.round(secs * 30);
    for (let i = 0; i < n; i++) {
      await ev(([i, n, aFrom, aTo, yFrom, yTo]) => {
        const g = window.__game, c = g.barber.c;
        const k = i / n, rows = 4, row = Math.floor(k * rows), kk = (k * rows) % 1;
        const a = aFrom + (aTo - aFrom) * (row % 2 ? 1 - kk : kk), y = yFrom + (yTo - yFrom) * row / (rows - 1);
        const p = c.beard.surfacePoint(a, y, 0.004).project(g.camera);
        g.input.pointer.x = p.x; g.input.pointer.y = p.y; g.input.pointer.down = true; g.barber.dragging = false;
      }, [i, n, aFrom, aTo, yFrom, yTo]);
      await step(1 / 30);
    }
    await ev(() => { window.__game.input.pointer.down = false; });
  };
  await cut(-1.2, 1.2, 0.006, 0.07, 8);
  await snap('beard_clipped');
  await ev(() => { const b = window.__game.barber; b.selectTool('trimmer'); b.togglePower(); window.__game.barber.camPitch = -0.2; });
  await step(1);
  await cut(-1.5, 1.5, -0.025, 0.003, 6);
  await snap('neck');
  console.log(await ev(() => JSON.stringify(window.__game.barber.stats, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v)));
  await ev(() => window.__game.barber.requestFinish());
  await step(9);
  await snap('mirror');
};

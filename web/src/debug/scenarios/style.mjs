// slick back + side part: comb the top and check the styled share and the look
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 7, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  for (const cutId of ['slickBack', 'sidePart', 'curlyFade']) {
    await ev((cutId) => { const g = window.__game; g.customers.enabled = false; if (g.barber.active) { g.barber.exit(); g.state = 'play'; } g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId, noBeard: true, look: { ...window.__game.randLook(), curl: cutId === 'curlyFade' ? 0.8 : 0 } } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); }, cutId);
    await step(2.5);
    await snap(cutId + '-before');
    const aim = (phi, th) => ev(([phi, th]) => { const g = window.__game, c = g.barber.c; const p = c.hair.surfacePoint(phi, th, 0.01).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true, dragDX: 3 }); g.barber.dragging = false; }, [phi, th]);
    await ev(() => window.__game.barber.selectTool('comb'));
    for (let pass = 0; pass < 14; pass++) for (let i = 0; i < 12; i++) { await aim(-1.4 + i * 0.25 + (pass % 2) * 0.1, 0.12 + pass * 0.07); await step(1 / 30); }
    await ev(() => { window.__game.input.pointer.down = false; });
    await step(0.4);
    await snap(cutId + '-combed');
    await ev(() => { const b = window.__game.barber; b.camYawOff = 2.6; b.camPitch = 0.75; b.camDist = 0.55; });
    await step(1.2);
    await snap(cutId + '-top');
    console.log(cutId, await ev(() => window.__game.barber.c.hair.styledShare().toFixed(2)));
  }
};

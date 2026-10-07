export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 5, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'midFade', noBeard: true } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(2.5);
  const aim = (phi, th) => ev(([phi, th]) => { const g = window.__game, c = g.barber.c; const p = c.hair.surfacePoint(phi, th, 0.01).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true, dragDX: 3 }); g.barber.dragging = false; }, [phi, th]);
  await ev(() => window.__game.barber.selectTool('spray'));
  await step(0.5);
  for (let i = 0; i < 4; i++) { await aim(2.6 + i * 0.1, 0.6); await step(0.1); }
  await snap('spray');
  await ev(() => { window.__game.input.pointer.down = false; window.__game.barber.selectTool('comb'); });
  for (let i = 0; i < 20; i++) { await aim(2.4 + i * 0.03, 0.4 + i * 0.03); await step(1 / 30); }
  await snap('comb');
  await ev(() => { window.__game.input.pointer.down = false; });
  console.log(await ev(() => JSON.stringify({ groom: window.__game.barber.groom, wet: window.__game.barber.c.hair.wetShare().toFixed(3), target: window.__game.barber.c.cut.target })));
};

export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'beardTrim' } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(1.5);
  await snap('front');
  await ev(() => { const b = window.__game.barber; b.orbYawT = Math.PI - 1.2; b.toggleClose(); });
  await step(1.2); await snap('side_close');
  await ev(() => { const b = window.__game.barber; b.selectTool('clipper'); b.togglePower(); b.setGuard(0); });
  await step(0.6);
  for (let i = 0; i < 40; i++) { await ev((i) => { const g = window.__game, c = g.barber.c; const p = c.beard.surfacePoint(-0.9 + (i % 10) * 0.05, 0.02 + Math.floor(i / 10) * 0.015, 0.003).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true }); }, i); await step(1 / 30); }
  await snap('clipping_beard');
  await ev(() => { window.__game.input.pointer.down = false; });
};

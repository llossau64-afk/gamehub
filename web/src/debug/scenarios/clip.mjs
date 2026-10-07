export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'skinFade', noBeard: true } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(1.5);
  await ev(() => { const b = window.__game.barber; b.setView('right'); b.selectTool('clipper'); b.togglePower(); b.setGuard(0); });
  await step(1.2);
  let maxPush = 0;
  for (let i = 0; i < 60; i++) {
    await ev((i) => { const g = window.__game, c = g.barber.c; const p = c.hair.surfacePoint(-1.6 + (i % 12) * 0.08, 1.2 + Math.floor(i / 12) * 0.15, 0.0).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true }); }, i);
    await step(1 / 30);
  }
  await snap('side_clip');
  await ev(() => { const b = window.__game.barber; b.toggleClose(); });
  await step(1); await snap('side_clip_close');
};

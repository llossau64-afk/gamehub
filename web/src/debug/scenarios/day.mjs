export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3); await snap('morning');
  await ev(() => { window.__game.shop.interactables.find((i) => i.id === 'opensign').action(); });
  await step(3);
  for (const h of [14, 19.5, 20.7]) { await ev((h) => { const g = window.__game; g.clock.hour = h; const V = g.camera.position.constructor; g.dir.takeCamera(new V(-0.6, 1.6, 1.6), new V(-0.4, 1.7, 8)); }, h); await step(1); await snap('h' + h); }
  await ev(() => { const g = window.__game; g.dir.releaseCamera(); g.customers.clear(); g.clock.hour = 20.99; });
  await step(4);
  console.log(await ev(() => JSON.stringify({ day: window.__game.save.day, open: window.__game.clock.open, hour: window.__game.clock.hour.toFixed(2) })));
  await step(4); await snap('next_morning');
};

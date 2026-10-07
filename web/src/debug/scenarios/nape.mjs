// cutting the back of the head: camera behind, bow + backrest fade
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'shortBackSides', noBeard: true } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(2.5);
  await snap('front');
  await ev(() => window.__game.setChairAngle(0, 3));
  await step(2.5);
  await snap('behind');
  await ev(() => { window.__game.barber.selectTool('clipper'); window.__game.barber.togglePower(); });
  await step(0.5);
  for (let i = 0; i < 60; i++) {
    await ev((i) => { const g = window.__game, c = g.barber.c; const phi = Math.PI - 0.6 + (i % 12) * 0.1; const th = 1.3 + Math.floor(i / 12) * 0.12; const p = c.hair.surfacePoint(phi > Math.PI ? phi - 2 * Math.PI : phi, th, 0.01).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true }); }, i);
    await step(1 / 30);
  }
  await snap('cutting_back');
  await ev(() => { window.__game.input.pointer.down = false; });
  console.log(await ev(() => JSON.stringify({ bow: window.__game.barber.bow.toFixed(2), fade: window.__game.barber.fadeA.toFixed(2), back: window.__game.barber.c.hair.regionStats().back.mean.toFixed(3) })));
};

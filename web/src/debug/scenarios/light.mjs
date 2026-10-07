export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 2000, level: 5, owned: [] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); g.player.place({ x: 1.6, z: 1.9 }, 0.75, -0.12); });
  await step(1);
  await snap('old_shop');
  const buys = ['bulb', 'clean', 'radio', 'paint', 'decor', 'couch', 'chairClassic', 'mirrorLarge', 'pole', 'products', 'floorWood', 'tv'];
  for (const b of buys) {
    await ev((b) => { const g = window.__game; g.save.level = 9; g.buy(b); }, b);
    await step(1.2);
    if (['bulb', 'clean', 'paint', 'couch', 'mirrorLarge', 'tv'].includes(b)) await snap('after_' + b);
  }
  await ev(() => { const g = window.__game; g.player.place({ x: -2.2, z: 1.9 }, -0.6, -0.1); });
  await step(1);
  await snap('full_other_angle');
};

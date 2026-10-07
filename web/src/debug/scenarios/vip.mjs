export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 300, level: 4, day: 3, owned: ['bulb', 'clean'] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.spawnVIP(); g.street.t = 0; });
  await until(() => window.__game.customers.list[0]?.state === 'waitingTalk', 40);
  await ev(() => { const g = window.__game; g.player.lookTowards(g.customers.list[0].headPos(), 1, 60); g.player.applyCamera(0); });
  await step(0.5);
  await snap('vip');
  await ev(() => { const g = window.__game; g.player.place({ x: 0.2, z: 0.6 }, 0, 0); g.player.lookTowards(new g.camera.position.constructor(-1, 1.3, 4), 1, 60); g.player.applyCamera(0); });
  await step(6);
  await snap('street');
  console.log(await ev(() => JSON.stringify({ ev: window.__game.event, walkers: window.__game.street.walkers.length, cust: window.__game.customers.list.map((c) => [c.name, c.cutId, c.personality.id]) })));
};

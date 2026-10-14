export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 4, owned: ['bulb'] }); g.save.stats.served = 5; g.save.story = { ch: 2, q: { flowers: 3, enrico: 3, jannis: 1 }, inv: {}, seen: {} }; g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(2.5);
  await ev(() => window.__game.player.place({ x: 24.6, z: 2.84 - 6.4 }, 0, -0.2)); await step(0.5); await snap('jannis');
  await ev(() => window.__game.player.place({ x: -7.6, z: 2.84 + 2.2 }, 0, -0.1)); await step(0.5); await snap('enrico');
};

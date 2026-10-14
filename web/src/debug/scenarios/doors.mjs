export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  await step(2);
  for (const [x, z, n] of [[2.5, 2.84 + 10.5, 'far'], [2.5, 2.84 + 12.6, 'near']]) { await ev(([x, z]) => window.__game.player.place({ x, z }, Math.PI, 0), [x, z]); await step(0.6); await snap(n); }
};

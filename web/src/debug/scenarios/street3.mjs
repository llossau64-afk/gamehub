// Phase D street block: close-ups of the new detail
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  await step(3);
  const views = [[-9, 4.6, -0.9, 0.05], [14, 4.4, 0.5, 0.0], [-24.5, 1.8, Math.PI, -0.15], [-24.5, -3.5, 0.3, -0.45], [24.5, 0.5, Math.PI, -0.1], [0, 13, 0, -0.3], [-30, 15, -0.3, -0.25], [5, 4.5, 0.9, -0.1], [-26.5, -0.5, -0.6, 0.55], [-6.6, 2.0, 0.0, -0.4]];
  let i = 0;
  for (const [x, z, yaw, pitch] of views) {
    await ev(([x, z, yaw, pitch]) => { window.__game.player.place({ x, z }, yaw, pitch); }, [x, z, yaw, pitch]);
    await step(0.3); await snap('s' + (i++));
  }
  await ev(() => window.__game.shop.setDusk(1)); await ev(() => window.__game.player.place({ x: 0, z: 12 }, 0, -0.3)); await step(0.3); await snap('dusk');
};

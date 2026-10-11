// exterior walls from many angles, looking for broken geometry
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  await step(3);
  const views = [[0, 9, 0.0, 0.35], [-10, 9, 0.3, 0.3], [10, 9, -0.3, 0.3], [-24.5, 8, 0.0, 0.25], [24.5, 8, 0, 0.25], [-24.5, 1.5, 0, 0.35], [-30, 5, 1.2, 0.2], [30, 5, -1.2, 0.2], [0, 4, Math.PI, 0.3], [-20, 5, Math.PI, 0.2]];
  let i = 0;
  for (const [x, z, yaw, pitch] of views) {
    await ev(([x, z, yaw, pitch]) => { window.__game.player.place({ x, z }, yaw, pitch); }, [x, z, yaw, pitch]);
    await step(0.3); await snap('x' + (i++));
  }
};

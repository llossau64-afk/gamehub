export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 7, owned: ['bulb', 'paint', 'floorWood', 'coffee', 'washBasin', 'neonWall', 'aquarium', 'vending', 'chandelier', 'couch'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3);
  const shot = async (name, x, z, yaw, pitch = 0) => { await ev(([x, z, yaw, pitch]) => { window.__game.player.place({ x, z }, yaw, pitch); }, [x, z, yaw, pitch]); await step(0.4); await snap(name); };
  await shot('e1_left', 0.6, 0.6, 1.25, 0.05);
  await shot('e2_right', -0.5, 0.2, -1.4, 0.15);
  await shot('e3_front', 0.2, -0.6, Math.PI + 0.3, -0.05);
  await shot('e4_out', 2.0, 6.5, 0.15, 0);
};

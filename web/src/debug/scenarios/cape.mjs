// the cape on a seated customer, from several angles
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'simpleTrim' } }); c.state = 'seated'; window.__c = c; });
  await step(1.5);
  const ch = await ev(() => { const p = window.__c.ch.root.position; return [p.x, p.z]; });
  const shots = [[0, 1.6, 'front'], [1.3, 1.5, 'side'], [-1.4, 0.9, 'side2'], [0.9, -1.2, 'back']];
  for (const [dx, dz, n] of shots) {
    await ev(([x, z, cx, cz]) => { const g = window.__game; g.player.place({ x: cx + x, z: cz + z }, Math.atan2(x, z), -0.3); }, [dx, dz, ch[0], ch[1]]);
    await step(0.3); await snap(n);
  }
};

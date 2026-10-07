export default async ({ step, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'beardTrim' } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(2.5);
  console.log(await ev(() => {
    const g = window.__game, c = g.barber.c, THREE = g.camera.position.constructor;
    const out = [];
    for (const [a, y] of [[0, 0.02], [0.5, 0.03], [-0.5, 0.03], [0, -0.01]]) {
      const wp = c.beard.surfacePoint(a, y, 0.004);
      const p = wp.clone().project(g.camera);
      const rc = g.barber.raycaster;
      rc.setFromCamera({ x: p.x, y: p.y }, g.camera);
      const bh = c.beard.pick(rc);
      const hh = c.hair.pick(rc.ray, 0.02);
      out.push({ a, y, ndc: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(3)], beard: bh && [bh.phi.toFixed(2), bh.theta.toFixed(3), bh.distance.toFixed(3)], hair: hh && [hh.phi.toFixed(2), hh.theta.toFixed(2)], idx: c.beard.pickMesh.geometry.index.count });
    }
    return JSON.stringify(out);
  }));
};

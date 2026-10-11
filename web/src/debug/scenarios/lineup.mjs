// a lineup of random customers: full body and face close-ups
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3);
  const N = +(globalThis.process?.env?.N || 6);
  await ev((N) => {
    const g = window.__game; g.customers.enabled = false; g.customers.clear();
    window.__cs = [];
    for (let i = 0; i < N; i++) {
      const c = g.customers.spawnStatic({ seatIndex: 0 });
      c.ch.sitW = c.ch.sitTarget = 0; c.ch.seat = null; c.seat = null;
      c.ch.place({ x: -1.95 + i * 0.78, y: 0, z: 0.0 }, 0);
      c.state = 'menu';
      if (c.look.cap) c.ch.setCap(c.look.cap);
      window.__cs.push(c);
    }
  }, N);
  await step(0.5);
  await ev(() => { window.__game.dir.takeCamera({ x: 0, y: 1.25, z: 3.1, clone() { return new (window.__game.camera.position.constructor)(this.x, this.y, this.z); } }, new (window.__game.camera.position.constructor)(0, 1.0, 0)); });
  await step(0.3); await snap('line_full');
  for (let i = 0; i < N; i++) {
    await ev((i) => { const g = window.__game, c = window.__cs[i]; const h = c.ch.headWorld(new (g.camera.position.constructor)()); g.dir.takeCamera(h.clone().add({ x: 0.05, y: 0.0, z: 0.34 }), h.clone().add({ x: 0, y: -0.025, z: 0 })); c.ch.lookAt(g.camera, 1); }, i);
    await step(0.25); await snap('f' + i);
  }
  console.log(await ev(() => JSON.stringify(window.__cs.map((c) => [c.look.outfit, c.look.accessories.join(','), c.look.hairType, c.cutId]))));
};

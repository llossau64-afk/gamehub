export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 2000, level: 5, owned: [] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); for (let i = 0; i < 3; i++) g.customers.spawnStatic({ seatIndex: i, phone: true }); g.customers.spawnStatic({ chair: true }); g.player.place({ x: 1.6, z: 1.9 }, 0.75, -0.12); });
  await step(1);
  const info = async (label) => console.log(label, await ev(() => { const g = window.__game; g.renderer.info.autoReset = false; g.renderer.info.reset(); g.render(); const r = g.renderer.info; const o = { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, progs: r.programs.length }; r.autoReset = true; return JSON.stringify(o); }));
  await info('old shop + 4 customers');
  // time 200 CPU updates (without rendering)
  console.log('update ms/frame', await ev(async () => { const g = window.__game; const t0 = performance.now(); for (let i = 0; i < 200; i++) g.update(1 / 60); return ((performance.now() - t0) / 200).toFixed(2); }));
  for (const b of ['bulb', 'clean', 'radio', 'paint', 'decor', 'couch', 'chairClassic', 'mirrorLarge', 'pole', 'products', 'floorWood', 'tv']) await ev((b) => { const g = window.__game; g.save.level = 9; g.buy(b); }, b);
  await step(1);
  await info('full shop + 4 customers');
};

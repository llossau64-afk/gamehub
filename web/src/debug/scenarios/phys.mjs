// meltdown exit seen from a fixed camera: coins, cape, bin, door slam
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'simpleTrim', noBeard: true } }); c.state = 'seated'; g.enterBarber(c, {}); window.__forceStars = 1; });
  await step(1.5);
  await ev(() => { window.__game.barber.requestFinish(); });
  await until(() => document.querySelector('.result .cbtn'), 30);
  await ev(() => document.querySelector('.result .cbtn')?.click());
  await step(5.5);
  await ev(() => { const g = window.__game; const V = g.camera.position.constructor; g.dir.takeCamera(new V(0.4, 2.3, -0.4), new V(0.6, 0, 1.4)); });
  for (const t of [1, 2, 3, 4, 6]) { await step(1); await snap('phys_' + t); }
  console.log(await ev(() => { const t = window.__game.shop.slots.trash; let n = 0; t.traverse((o) => { if (o.isMesh) n++; }); return JSON.stringify({ meshes: n, parent: t.parent?.name, q: t.quaternion.toArray().map((x) => x.toFixed(2)), binq: window.__game.reactions.bin?.obj === t, ang: window.__game.reactions.bin?.ang }); }));
  console.log(await ev(() => JSON.stringify({ bin: !!window.__game.reactions.bin, loose: window.__game.reactions.loose.map((l) => [l.b.obj.position.x.toFixed(2), l.b.obj.position.y.toFixed(3), l.b.obj.position.z.toFixed(2), l.b.asleep]) })));
};
export const dbg = 1;

export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => {
    const g = window.__game;
    g.ui.hideMenu();
    g.customers.clear(); g.state = 'cine';
    const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z);
    const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.4); o.setEmotion('happy'); g.owner = o;
    window.__o = o;
    window.__cs = [];
    const looks = [0, 1, 2];
    for (let i = 0; i < 3; i++) { const c = g.customers.spawnStatic({ seatIndex: i, phone: i === 1 }); window.__cs.push(c); }
    g.dir.takeCamera(V(1.4, 1.5, 1.6), V(0.6, 1.0, -0.4));
  });
  await step(2);
  await snap('group');
  await ev(() => { const g = window.__game; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); g.dir.takeCamera(V(0.1, 1.62, 0.75), V(-0.2, 1.55, 0.0)); window.__o.lookAt(g.camera, 1); });
  await step(1.5);
  await snap('owner_face');
  for (const e of ['surprised', 'awkward', 'ecstatic', 'nostalgic']) {
    await ev((e) => window.__o.setEmotion(e), e);
    await step(1);
    await snap('owner_' + e);
  }
  await ev(() => { const g = window.__game; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); g.dir.takeCamera(V(0.6, 1.4, 1.2), V(-0.2, 1.1, 0.0)); });
  await step(1);
  await snap('owner_body');
  await ev(() => { const g = window.__game; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); g.dir.takeCamera(V(1.7, 1.3, -0.4), V(2.8, 0.9, -0.4)); });
  await step(1);
  await snap('seated');
};

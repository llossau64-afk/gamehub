export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => {
    const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine';
    const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z);
    const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.5); g.owner = o; window.__o = o;
    g.dir.takeCamera(V(0.25, 1.68, 0.75), V(-0.2, 1.62, 0.0));
  });
  await step(1);
  for (const [gname, times] of [['checkHair', [1.0]]]) { console.log('g', gname);
    await ev((n) => { window.__o.gesture(n); }, gname);
    let t0 = 0;
    for (const t of times) { await step(t - t0); t0 = t; await snap(gname + '_' + t); }
    await step(2.5);
  }
};

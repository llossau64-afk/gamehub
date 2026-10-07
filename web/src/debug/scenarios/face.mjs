export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z);
    const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.35); g.owner = o; window.__o = o;
    const c = g.customers.spawnStatic({ customer: { noBeard: true } }); c.state = 'idle'; c.ch.place(V(0.5, 0, 0), -0.35); window.__c = c;
    g.dir.takeCamera(V(0.0, 1.66, 0.42), V(-0.2, 1.64, 0.0)); o.lookAt(g.camera, 1); c.ch.lookAt(g.camera, 1); });
  await step(1.2);
  for (const e of ['neutral', 'happy', 'furious', 'devastated', 'starstruck']) { await ev((e) => window.__o.setEmotion(e), e); await step(0.8); await snap('o_' + e); }
  await ev(() => { const g = window.__game; const V = g.camera.position.constructor; const h = window.__c.headPos(); g.dir.takeCamera(h.clone().add(new V(-0.12, 0.0, 0.4)), h.clone().add(new V(0, -0.04, 0))); window.__c.ch.lookAt(g.camera, 1); });
  for (const e of ['neutral', 'happy', 'horrified']) { await ev((e) => window.__c.ch.setEmotion(e), e); await step(0.8); await snap('c_' + e); }
};

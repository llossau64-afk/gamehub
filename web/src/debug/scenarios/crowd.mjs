export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z);
    for (let i = 0; i < 6; i++) { const c = g.customers.spawnStatic({ customer: {} }); c.state = 'idle'; c.ch.place(V(-1.6 + i * 0.62, 0, 0.4 + (i % 2) * 0.35), 0); c.ch.setEmotion(['happy', 'neutral', 'confused', 'smug', 'excited', 'nervous'][i]); }
    g.dir.takeCamera(V(0, 1.45, 2.4), V(0, 1.25, 0.4)); });
  await step(1.5); await snap('crowd');
  await ev(() => { const g = window.__game; const V = g.camera.position.constructor; g.dir.takeCamera(new V(-0.9, 1.6, 1.3), new V(-1.2, 1.5, 0.5)); });
  await step(1); await snap('close');
};

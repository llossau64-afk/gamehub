// close-ups of the owner's hands in several poses, plus the key
export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => {
    const g = window.__game;
    g.ui.hideMenu();
    g.customers.clear(); g.state = 'cine';
    const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z);
    const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.0); g.owner = o; window.__o = o;
    o.reach('R', V(-0.32, 1.25, 0.32), { speed: 8, fingers: V(0, 0.3, 1), palm: V(0, -1, 0), hand: 'open' });
    o.reach('L', V(-0.02, 1.2, 0.3), { speed: 8, fingers: V(0, 0.2, 1), palm: V(0, 1, 0), hand: 'relaxed' });
    g.dir.takeCamera(V(-0.15, 1.38, 0.62), V(-0.17, 1.2, 0.3));
  });
  await step(1.5);
  await snap('hands_open_relaxed');
  for (const pose of ['grip', 'point', 'pinch', 'fist']) {
    await ev((pose) => { window.__o.setHand('R', pose); window.__o.setHand('L', pose); }, pose);
    await step(0.8);
    await snap('hands_' + pose);
  }
  await ev(() => {
    const g = window.__game; const o = window.__o;
    const key = window.__spawnProp('Key', { shadows: false });
    o.hold('R', key, { pos: [0.01, -0.105, 0.012], rot: [Math.PI / 2, 0, 0] });
    o.setHand('R', 'pinch');
  });
  await step(1);
  await snap('key_hold');
};

export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0); g.owner = o; window.__o = o; g.dir.takeCamera(V(1.6, 1.3, 1.6), V(-0.2, 0.9, 0.0)); });
  await step(0.5);
  await ev(() => { const V = window.__game.camera.position.constructor; window.__o.faceTo(new V(-0.2, 0, -5)); });
  await step(0.25); await snap('turn1');
  await step(0.15); await snap('turn2');
  await step(1.5);
  await ev(() => { const V = window.__game.camera.position.constructor; window.__o.walkTo([new V(-0.2, 0, -1.6)], 'run'); });
  await step(0.25); await snap('accel');
  await step(0.8); await snap('decel');
  console.log(await ev(() => JSON.stringify({ tw: window.__o.turnW, acc: window.__o.accel })));
};

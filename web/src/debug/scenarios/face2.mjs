export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z);
    const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.35); g.owner = o; window.__o = o;
    g.dir.takeCamera(V(0.0, 1.66, 0.42), V(-0.2, 1.64, 0.0)); o.lookAt(g.camera, 1); });
  await step(1.2);
  await snap('a');
  console.log(await ev(() => { const o = window.__o; return JSON.stringify({ mouth: !!o.body.mouth, kids: o.root.children.map((c) => c.type + ':' + c.name) }); }));
  await ev(() => { const o = window.__o; if (o.body.mouth) o.body.mouth.visible = false; });
  await step(0.1); await snap('nomouth');
};

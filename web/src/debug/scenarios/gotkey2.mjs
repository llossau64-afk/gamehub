export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); g.dir.takeCamera(V(0.2, 1.6, 0.6), V(-0.5, 1.4, -1.5)); });
  await step(0.5);
  await ev(() => { const g = window.__game; g.itemFx.show(window.__spawnProp('Key', { shadows: false }), { title: 'GOT KEY!', rot: [Math.PI / 2, 0, -2.3], name: 'Old Shop Key', desc: 'Worn brass.' }); });
  await step(0.3);
  console.log(await ev(() => { const g = window.__game, f = g.itemFx; f.obj.updateMatrixWorld(true); const p = f.obj.getWorldPosition(new (g.camera.position.constructor)()); const n = p.clone().project(g.camera); return JSON.stringify({ p, n, gpos: f.group.position, s: f.holder.scale.x, cam: g.camera.position, near: g.camera.near, vis: f.obj.visible, kids: f.obj.children.length }); }));
  await step(0.6); await snap('a');
  await step(1.0); await snap('b');
};

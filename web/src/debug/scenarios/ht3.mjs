export default async ({ step, ev }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.5); g.owner = o; window.__o = o; });
  await step(0.2);
  await ev(() => { window.__o.gesture('checkHair'); });
  await step(1.0);
  console.log(await ev(() => { const o = window.__o; const V = window.__game.camera.position.constructor; const r = (v) => [v.x, v.y, v.z].map((x) => x.toFixed(3)).join(','); return ['targetL', r(o.headSurface(0.95, 0.35, -0.05, 0.016).p), 'palmL', r(o.handWorld('L', new V())), 'targetR', r(o.headSurface(-0.95, 0.35, -0.05, 0.016).p), 'palmR', r(o.handWorld('R', new V())), 'ikL', o.ik.L.w.toFixed(2), o.ik.L.wt, 'gest', o.gestures.map((x) => x.name).join('/')].join(' '); }));
};

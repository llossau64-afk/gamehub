export default async ({ step, ev, snap }) => {
  await step(0.5);
  await ev(() => { const g = window.__game; g.ui.hideMenu(); g.customers.clear(); g.state = 'cine'; const V = (x, y, z) => new (g.camera.position.constructor)(x, y, z); const o = g.makeOwner(); o.place(V(-0.2, 0, 0.0), 0.5); g.owner = o; window.__o = o; g.dir.takeCamera(V(0.25, 1.68, 0.75), V(-0.2, 1.62, 0.0)); });
  await step(0.2);
  console.log(await ev(() => { try { const s = window.__o.headSurface(0, 0.4, 0.9, 0.01); return JSON.stringify(s); } catch (e) { return 'ERR ' + e.message + e.stack; } }));
  console.log(await ev(() => { try { window.__o.gesture('wipeBrow'); return 'ok'; } catch (e) { return 'ERR ' + e.message; } }));
  for (let i = 0; i < 40; i++) { await step(1 / 30); if (i % 10 === 5) { console.log('snap', i); await snap('s' + i); } }
};
export const more = 1;

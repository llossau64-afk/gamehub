// walk into Fresh Mart, shop at the fridges, pay Jess, then try walking out with a can
export default async ({ step, snap, ev, until, page }) => {
  await ev(() => { setInterval(() => { const b = document.querySelectorAll('.choices .ch-b'); if (b.length) b[Math.min(window.__pick ?? 0, b.length - 1)].click(); }, 300); });
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  await step(2);
  const fz = 2.84;
  const shot = async (x, z, yaw, pitch, name) => { await ev(([x, z, yaw, pitch]) => window.__game.player.place({ x, z }, yaw, pitch), [x, z, yaw, pitch]); await step(0.4); await snap(name); };
  await shot(2.5, fz + 12.2, Math.PI, 0, 'doors');
  // walk in through the doors for real (no teleport): hold forward
  await ev(() => window.__game.player.place({ x: 2.5, z: 2.84 + 12.6 }, Math.PI, 0));
  await ev(() => { window.__game.input.held = ((orig) => (a) => a === 'forward' || orig(a))(window.__game.input.held.bind(window.__game.input)); });
  await step(1.6);
  await ev(() => { delete window.__game.input.held; });
  console.log('walked to', await ev(() => JSON.stringify(window.__game.player.pos.toArray().map((v) => +v.toFixed(2)))), 'inside', await ev(() => window.__game.mart.inside));
  await step(0.3); await snap('entered');
  await shot(1.2, fz + 15.4, Math.PI, -0.05, 'aisles');
  await shot(4.0, fz + 21.4, Math.PI, -0.05, 'fridges');
  await ev(() => { const m = window.__game.mart; m.take('cola'); m.take('cola'); m.take('energy'); m.take('coffee'); });
  await step(0.4); await snap('basket');
  await shot(4.0, fz + 16.0, -Math.PI / 2 + 0.35, -0.1, 'checkout');
  await ev(() => { window.__pick = 0; window.__game.mart.talk(); });
  for (let i = 0; i < 160; i++) { await step(0.25); await page.waitForTimeout(30); if (i === 14) await snap('scan'); if (await ev(() => !window.__game.mart.busy)) break; }
  console.log('after pay', await ev(() => JSON.stringify({ money: window.__game.save.money, inv: window.__game.story.s.inv, basket: window.__game.mart.basket })));
  // steal: walk out with an unpaid can -> Dennis chases, catches, punches, -$10
  await ev(() => { window.__game.mart.take('water'); window.__game.mart.take('cola'); });
  await ev(() => window.__game.player.place({ x: 2.5, z: 2.84 + 15.0 }, 0, 0)); await step(0.2);
  await ev(() => window.__game.player.place({ x: 2.5, z: 2.84 + 13.6 }, 0, 0)); await step(0.3);
  console.log('stole', await ev(() => JSON.stringify({ chase: !!window.__game.mart.chase, money: window.__game.save.money })));
  await ev(() => window.__game.player.place({ x: 0, z: 2.84 + 8 }, 0, 0));
  for (let i = 0; i < 40; i++) { await step(0.1); if (i === 12) await snap('chase'); }
  await ev(() => window.__game.player.place({ x: -2, z: 2.84 + 4 }, 0, -0.1));
  for (let i = 0; i < 60; i++) { await step(0.1); await page.waitForTimeout(25); if (await ev(() => !window.__game.mart.chase)) break; }
  await page.waitForTimeout(300); await step(0.05); await snap('punch');
  await page.waitForTimeout(3500); await step(0.5);
  await snap('busted');
  console.log('after busted', await ev(() => JSON.stringify({ basket: window.__game.mart.basket, money: window.__game.save.money, caught: window.__game.save.stats.caughtShoplifting, ctrl: window.__game.player.control })));
  await step(6);
  console.log('dennis back', await ev(() => JSON.stringify(window.__game.mart.jess.ch.root.position.toArray().map((v) => +v.toFixed(1)))));
  await shot(2.5, 2.84 + 12.0, Math.PI, 0, 'doors_fixed');
};

// Fresh Mart shift + robbery, journal and HUD (starts at chapter 4)
export default async ({ step, snap, ev, until, page }) => {
  await ev(() => { setInterval(() => { const b = document.querySelectorAll('.choices .ch-b'); if (b.length) b[Math.min(window.__pick ?? 99, b.length - 1)].click(); }, 300); });
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 5, owned: ['bulb'] }); g.save.stats.served = 9;
    g.save.story = { ch: 3, q: { albrecht: 1, thief: 4, drinks: 2, martJob: 0 }, inv: { cola: 2 }, seen: {} }; g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  await step(2);
  const S = () => ev(() => { const g = window.__game, s = g.story.s; return JSON.stringify({ ch: s.ch, q: s.q, money: g.save.money, flag: g.save.flags?.superJob }); });
  await ev(() => { window.__pick = 2; const g = window.__game; const p = g.supermarket.ch.root.position; g.player.place({ x: p.x, z: p.z - 1.6 }, Math.PI, -0.1); g.supermarket.talk(); });
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(30); if (i === 10) await snap('offer'); if (await ev(() => !!window.__game.supermarket.job && !window.__game.supermarket.busy)) break; }
  for (let k = 0; k < 8; k++) {
    await ev(() => { const g = window.__game, j = g.supermarket.job; g.player.place({ x: j.pal.position.x, z: j.pal.position.z - 1.2 }, Math.PI, -0.3); g.supermarket.jobAction(); });
    await step(0.3); if (k === 0) await snap('carry');
    await ev(() => { const g = window.__game, d = g.supermarket.doorPos(); g.player.place({ x: d.x, z: d.z - 1.2 }, Math.PI, -0.1); g.supermarket.jobAction(); });
    await step(0.3);
  }
  console.log('boxes', await S());
  await ev(() => { window.__pick = 1; window.__game.supermarket.talk(); });
  for (let i = 0; i < 300; i++) { await step(0.25); await page.waitForTimeout(30); if (i === 70) await snap('payday'); if (i === 95) await snap('robbery'); if (await ev(() => !window.__game.supermarket.busy)) break; }
  console.log('after robbery', await S());
  await step(3); await page.waitForTimeout(400); await step(1.5);
  console.log('ch5', await S());
  await ev(() => window.__game.player.place({ x: 0, z: 0 }, 0, 0)); await step(0.3); await snap('hud');
  await ev(() => window.__game.story.openLog()); await step(0.1); await snap('journal');
};

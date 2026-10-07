export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 2000, level: 6, owned: ['bulb', 'dyeStation'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play', 40);
  await step(1);
  await ev(() => window.__game.openUpgrades());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.c2-side nav button[data-c="crates"]').click());
  await page.waitForTimeout(400);
  await snap('crates_tab');
  await page.evaluate(() => document.querySelectorAll('.crate-card .buy')[1].click());
  await page.waitForTimeout(800);
  await ev(() => window.__game.ui.closePanel());
  // courier
  for (let i = 0; i < 40 && !(await ev(() => !!window.__game.deliveries.courier)); i++) await step(0.5);
  await step(4); await snap('courier');
  for (let i = 0; i < 60 && !(await ev(() => window.__game.deliveries.parcels.length > 0)); i++) await step(0.5);
  await step(1); await snap('parcel');
  await ev(() => { const g = window.__game; g.deliveries.open(g.deliveries.nearest()); });
  await page.waitForTimeout(2500); await snap('reel');
  await page.waitForTimeout(3500); await snap('prize');
  await page.mouse.click(480, 270);
  await page.waitForTimeout(800);
  console.log(await ev(() => JSON.stringify(window.__game.save.inv)));
  // dye customer
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'buzzCut', dye: 'iceBlue', noBeard: true } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(1.5);
  await ev(() => { const b = window.__game.barber; b.selectTool('dye'); b.setView('back'); b.setLevel(2); });
  await step(1);
  for (let i = 0; i < 90; i++) { await ev((i) => { const g = window.__game, c = g.barber.c; const p = c.hair.surfacePoint(-1.5 + (i % 15) * 0.2, 0.2 + Math.floor(i / 15) * 0.17, 0.01).project(g.camera); Object.assign(g.input.pointer, { x: p.x, y: p.y, down: true, dragDX: 3 }); }, i); await step(1 / 30); }
  await snap('dyed');
  console.log(await ev(() => window.__game.barber.dyeCoverage().toFixed(2)));
};

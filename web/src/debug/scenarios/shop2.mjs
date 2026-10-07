export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 480, level: 4, owned: ['bulb', 'clean', 'radio'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(1);
  await ev(() => window.__game.openUpgrades());
  await page.waitForTimeout(800);
  await snap('catalogue');
  await page.evaluate(() => document.querySelector('.c2-side nav button[data-c="decor"]').click());
  await page.waitForTimeout(300);
  await snap('decor');
  await page.evaluate(() => [...document.querySelectorAll('.c2-card .buy')].find((b) => b.dataset.id === 'couch')?.click());
  await page.waitForTimeout(300);
  await snap('sold');
  for (const t of [0.6, 1.6, 2.6, 4.5]) { await step(t === 0.6 ? 0.6 : 1); await page.waitForTimeout(100); await snap('reveal_' + t); }
  await step(2);
  console.log(await ev(() => JSON.stringify({ st: window.__game.state, cam: window.__game.dir.cam.active, owned: window.__game.save.owned })));
  await ev(() => window.__game.openUpgrades());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.c2-side nav button[data-c="tools"]').click());
  await page.evaluate(() => [...document.querySelectorAll('.buy')].find((b) => b.dataset.id === 'clipperBasic')?.click());
  await step(1.3); await page.waitForTimeout(200); await snap('newgear');
};

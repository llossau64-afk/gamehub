export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 7, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  for (const cutId of ['midFade', 'slickBack', 'trimAndBeard']) {
    await ev((cutId) => { const g = window.__game; g.customers.enabled = false; if (g.barber.active) { g.barber.exit(); g.state = 'play'; } g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId } }); c.state = 'seated'; g.enterBarber(c, {}); }, cutId);
    await step(1.5);
    await ev(() => { const c = window.__game.barber.c; window.__game.ui.showReference(c.cut, c.refImg || (c.refImg = window.__ref(c.cutId, c.look))); });
    await page.waitForTimeout(600);
    await snap('ref_' + cutId);
  }
};

export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 7, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; const V = g.camera.position.constructor; g.dir.takeCamera(new V(1.2, 1.65, -0.6), new V(3.2, 1.75, -0.78)); });
  await step(1.2); await snap('wall');
  await ev(() => { const g = window.__game; g.dir.releaseCamera(); g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'curtainHair' } }); c.state = 'seated'; c.refImg = window.__menuPic('curtainHair'); g.enterBarber(c, {}); });
  await step(1.5); await snap('barber');
  await page.evaluate(() => document.querySelector('.ref-thumb').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForTimeout(600); await snap('poster');
};

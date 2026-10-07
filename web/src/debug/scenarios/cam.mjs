export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'skinFade', noBeard: true } }); g.removeCape(c); c.state = 'seated'; g.enterBarber(c, {}); });
  await step(1.5);
  await snap('start');
  // rotate mode via the left button, then a real mouse drag
  await page.evaluate(() => document.querySelector('.bmodes [data-m="rotate"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.mouse.move(480, 270); await page.mouse.down();
  for (let i = 0; i < 20; i++) { await page.mouse.move(480 + i * 18, 270); await step(1 / 30); }
  await page.mouse.up();
  await step(0.6);
  await snap('rotated');
  console.log(await ev(() => JSON.stringify({ yaw: window.__game.barber.orbYaw.toFixed(2), chair: window.__game.chairAngle.toFixed(2), mode: window.__game.barber.mode, back: window.__game.barber.c.hair.regionStats().back.mean.toFixed(3) })));
  await ev(() => { window.__game.barber.setView('back'); });
  await step(1); await snap('back');
  console.log(await ev(() => JSON.stringify({ fade: window.__game.barber.fadeA.toFixed(2) })));
  await ev(() => { const b = window.__game.barber; b.setView('front'); b.setMode('cut'); });
  await step(0.8);
  await page.evaluate(() => document.querySelector('.closeup').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await step(1); await snap('front_close');
};

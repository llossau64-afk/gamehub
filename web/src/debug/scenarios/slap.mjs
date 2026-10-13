// itch -> slap x3 -> customer storms out
export default async ({ step, snap, ev, until, page }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'simpleTrim' } }); g.removeCape(c); c.state = 'seated'; window.__c = c; g.enterBarber(c, {}); });
  await step(1.2);
  await ev(() => { const b = window.__game.barber; b.setView('right'); b.itchT = 0.05; });
  await step(1.0); await snap('itching');
  await page.waitForTimeout(500);
  await ev(() => window.__game.barber.slap());
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(60); await step(0.06); }
  await snap('slap1');
  await page.waitForTimeout(700); await step(0.5);
  console.log('after 1', await ev(() => JSON.stringify({ slaps: window.__c.slaps, itching: window.__game.barber.itching, st: window.__game.state })));
  await step(0.5); await ev(() => window.__game.barber.slap()); await page.waitForTimeout(1000); await step(1.2);
  console.log('cd', await ev(() => JSON.stringify({ cd: window.__game.barber.slapCD, act: window.__game.barber.active, lv: window.__game.barber.leaving, t: window.__game.barber.time })));
  await ev(() => window.__game.barber.slap()); await page.waitForTimeout(400); await step(0.2); await snap('slap3');
  await page.waitForTimeout(1500); await step(1.5);
  await snap('leaving');
  console.log('after 3', await ev(() => JSON.stringify({ slaps: window.__c.slaps, cstate: window.__c.state, st: window.__game.state, lost: window.__game.save.stats.lost })));
};

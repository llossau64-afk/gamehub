export default async ({ step, snap, ev, until, page }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.save.flags = { superJob: 'no' }; g.save.story = { ch: 1, q: { albrecht: 0 }, inv: {}, seen: {} }; g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(2);
  console.log('label', await ev(() => { const g = window.__game, p = g.supermarket.ch.root.position; g.player.place({ x: p.x, z: p.z - 1.6 }, Math.PI, -0.1); return g.supermarket.label(); }));
  await ev(() => { window.__game.supermarket.talk(); });
  let opts = null;
  for (let i = 0; i < 200 && !opts; i++) { await step(0.25); await page.waitForTimeout(30); opts = await ev(() => { const b = [...document.querySelectorAll('.choices .ch-b')]; return b.length ? b.map((x) => x.textContent).join(' | ') : null; }); }
  console.log('options', opts);
  await snap('offer');
  await ev(() => document.querySelectorAll('.choices .ch-b')[2].click());
  for (let i = 0; i < 120; i++) { await step(0.25); await page.waitForTimeout(30); if (await ev(() => !!window.__game.supermarket.job && !window.__game.supermarket.busy)) break; }
  console.log('job', await ev(() => JSON.stringify({ job: !!window.__game.supermarket.job, q: window.__game.story.s.q.martJob })));
};

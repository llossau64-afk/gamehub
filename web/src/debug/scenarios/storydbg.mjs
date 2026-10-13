export default async ({ step, ev, until, page }) => {
  await ev(() => { setInterval(() => { const b = document.querySelectorAll('.choices .ch-b'); if (b.length) b[0].click(); }, 300); });
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(2);
  await ev(() => { window.__game.story.talkAlbrecht().then(() => { window.__done = 1; }).catch((e) => { window.__err = e.stack; }); });
  for (let i = 0; i < 30; i++) { await step(0.25); await page.waitForTimeout(100); }
  console.log(await ev(() => JSON.stringify({ err: window.__err, done: window.__done, busy: window.__game.story.npcs.albrecht.busy, q: window.__game.story.s.q, sub: document.querySelector('.subs .line')?.textContent, ch: !!document.querySelector('.choices') })));
};

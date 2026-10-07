// achievements panel with a mid-game save, claiming, and the unlock popup
export default async ({ step, snap, ev, page, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 340, level: 6, day: 7, owned: ['bulb', 'clean', 'radio', 'decor', 'clipperBasic'], achievements: [] });
    Object.assign(g.save.stats, { served: 34, fiveStars: 6, bestStreak: 4, earned: 2400, tips: 180, fades5: 1, sweeps: 3, cuts: { simpleTrim: 5, buzzCut: 4, basicFade: 3 } }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(0.6);
  await snap('popup');
  await step(5);
  await ev(() => window.__game.openAchievements());
  await page.waitForTimeout(1200);
  await snap('panel');
  await page.evaluate(() => document.querySelector('.achc .claim')?.click());
  await page.waitForTimeout(250);
  await snap('claiming');
  await page.waitForTimeout(900);
  await snap('claimed');
  await page.evaluate(() => document.querySelector('.ach-tabs button[data-c="secret"]')?.click());
  await page.waitForTimeout(300);
  await snap('secret_tab');
  await page.evaluate(() => document.querySelector('.panel .body').scrollTop = 0);
};

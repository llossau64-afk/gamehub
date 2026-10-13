// story mode end to end: chapters, Albrecht, thief, drinks, Fresh Mart shift + robbery
export default async ({ step, snap, ev, until, page }) => {
  // answer dialogue choices automatically: window.__pick = index (default last)
  await ev(() => { setInterval(() => { const b = document.querySelectorAll('.choices .ch-b'); if (b.length) b[Math.min(window.__pick ?? 99, b.length - 1)].click(); }, 300); });
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.save.stats.served = 0; g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  const S = () => ev(() => { const g = window.__game, s = g.story.s; return JSON.stringify({ ch: s.ch, q: s.q, money: g.save.money, inv: s.inv, daily: s.daily?.list.map((j) => j.id + ':' + j.p + '/' + j.n) }); });
  await step(2); await page.waitForTimeout(500); await step(1.5);
  console.log('start', await S());
  // Albrecht on the bench
  await ev(() => window.__game.player.place({ x: -1.4, z: 5.4 }, 0, -0.15)); await step(0.6); await snap('albrecht');
  await ev(() => { window.__pick = 0; window.__game.story.talkAlbrecht(); });
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(40); if (await ev(() => !window.__game.story.npcs.albrecht.busy)) break; }
  console.log('after albrecht', await S());
  // chapter 3
  await ev(() => { window.__game.save.stats.served = 3; });
  await step(2.5); await page.waitForTimeout(400); await step(1.2);
  console.log('ch3', await S());
  await ev(() => window.__game.player.place({ x: 5.1, z: 4.9 }, 0, -0.15)); await step(0.6); await snap('baker');
  await ev(() => { window.__pick = 0; window.__game.story.talkBaker(); });
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(40); if (await ev(() => !window.__game.story.npcs.baker.busy)) break; }
  await step(1);
  await ev(() => { const t = window.__game.story.thief.ch.root.position; window.__game.player.place({ x: t.x - 2.2, z: t.z }, -Math.PI / 2, -0.1); });
  await step(0.15); await snap('thief');
  await ev(() => { window.__game.story.tackleThief(); }); await page.waitForTimeout(300); await step(0.4); await snap('tackle');
  await page.waitForTimeout(800); await step(1);
  await ev(() => window.__game.story.pickBread()); await step(0.4); await snap('bread');
  await ev(() => window.__game.player.place({ x: 5.1, z: 4.6 }, 0, -0.15));
  await ev(() => { window.__game.story.talkBaker(); });
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(40); if (await ev(() => !window.__game.story.npcs.baker.busy)) break; }
  console.log('after thief', await S());
  // drinks
  await ev(() => window.__game.player.place({ x: 8.2, z: 14.9 }, Math.PI, -0.1)); await step(0.5); await snap('fridge');
  await ev(() => window.__game.story.openShop()); await step(0.1);
  await ev(() => { document.querySelector('.mart-card[data-id="cola"] [data-a="+"]').click(); document.querySelector('.mart-card[data-id="energy"] [data-a="+"]').click(); });
  await step(0.1); await snap('mart');
  await ev(() => document.querySelector('.mart-pay').click()); await step(0.2);
  await ev(() => window.__game.ui.closePanel());
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ seatIndex: 0 }); c.state = 'waiting'; c.talked = true; c.patienceMax = 60; c.patience = 20; window.__wc = c; });
  await ev(() => { const p = window.__wc.ch.root.position; window.__game.player.place({ x: p.x, z: p.z + 1.4 }, 0, -0.2); });
  await ev(() => { window.__pick = 0; window.__game.story.giveDrink(window.__wc); }); await page.waitForTimeout(1200); await step(1.0); await snap('drink');
  console.log('after drink', await S());
  await step(2.5); await page.waitForTimeout(300); await step(1);
  console.log('ch4', await S());
  // Fresh Mart shift
  await ev(() => { window.__pick = 2; const g = window.__game; const p = g.supermarket.ch.root.position; g.player.place({ x: p.x, z: p.z - 1.6 }, Math.PI, -0.1); g.supermarket.talk(); });
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(40); if (await ev(() => !!window.__game.supermarket.job && !window.__game.supermarket.busy)) break; }
  await ev(() => { const g = window.__game, j = g.supermarket.job; g.player.place({ x: j.pal.position.x, z: j.pal.position.z - 1.3 }, Math.PI, -0.35); }); await step(0.4); await snap('pallet');
  for (let k = 0; k < 8; k++) {
    await ev(() => { const g = window.__game, j = g.supermarket.job; g.player.place({ x: j.pal.position.x, z: j.pal.position.z - 1.2 }, Math.PI, -0.3); g.supermarket.jobAction(); });
    await step(0.3); if (k === 0) await snap('carry');
    await ev(() => { const g = window.__game, d = g.supermarket.doorPos(); g.player.place({ x: d.x, z: d.z - 1.2 }, Math.PI, -0.1); g.supermarket.jobAction(); });
    await step(0.3);
  }
  console.log('boxes', await ev(() => window.__game.supermarket.job?.boxes), await S());
  await ev(() => { window.__pick = 1; window.__game.supermarket.talk(); });
  for (let i = 0; i < 260; i++) { await step(0.25); await page.waitForTimeout(40); if (i === 40) await snap('robbery'); if (await ev(() => !window.__game.supermarket.busy)) break; }
  console.log('after robbery', await S(), await ev(() => window.__game.save.flags.superJob));
  await step(3); await page.waitForTimeout(500);
  await ev(() => window.__game.player.place({ x: 0, z: 0 }, Math.PI, 0)); await step(0.3); await snap('hud');
  await ev(() => window.__game.story.openLog()); await step(0.1); await snap('journal');
};

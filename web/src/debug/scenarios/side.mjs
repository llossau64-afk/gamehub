// side quests: Elli's flowers, Enrico's gig, Jannis Luftberlong ist weg
export default async ({ step, snap, ev, until, page }) => {
  await ev(() => { setInterval(() => { const b = document.querySelectorAll('.choices .ch-b'); if (b.length) b[0].click(); }, 250); });
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 4, owned: ['bulb'] }); g.save.stats.served = 5; g.save.story = { ch: 2, q: { albrecht: 1, thief: 0, drinks: 0 }, inv: {}, seen: {} }; g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const st = window.__game.street; st.carT = 1e9; st.cars.forEach((c) => c.obj.parent?.remove(c.obj)); st.cars = []; });
  await step(2.5);
  const Q = () => ev(() => JSON.stringify(Object.fromEntries(['flowers', 'enrico', 'jannis'].map((k) => [k, window.__game.story.step(k)]))));
  const talk = async (fn, who) => {
    await ev(([fn]) => { window.__game.story[fn === 'baker' ? 'talkBaker' : 'x']?.(); if (fn !== 'baker') window.__game.story.side['talk' + fn](); }, [fn]);
    for (let i = 0; i < 240; i++) { await step(0.25); await page.waitForTimeout(15); if (await ev(([w]) => { const s = window.__game.story; const n = w === 'baker' ? s.npcs.baker : s.side.npcs[w]; return !n.busy; }, [who])) break; }
    await step(0.3);
  };
  const look = async (x, z, yaw, name) => { await ev(([x, z, yaw]) => window.__game.player.place({ x, z }, yaw, -0.08), [x, z, yaw]); await step(0.4); if (name) await snap(name); };
  console.log('start', await Q());
  await look(12.3, 2.84 + 2.6, 0, 'elli');
  await talk('Elli', 'elli'); console.log('elli 1', await Q());
  await look(5.1, 2.84 + 2.4, 0, null);
  await ev(() => { window.__game.story.talkBaker(); });
  for (let i = 0; i < 40; i++) { await step(0.25); if (i === 16) await snap('bruno_blush'); }
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(15); if (await ev(() => !window.__game.story.npcs.baker.busy)) break; }
  console.log('bruno', await Q());
  await talk('Elli', 'elli'); console.log('elli 2', await Q());
  await look(-7.6, 2.84 + 2.6, 0, 'enrico');
  await talk('Enrico', 'enrico'); console.log('enrico 1', await Q());
  await ev(() => { const g = window.__game; g.clock.openShop(); g.customers.enabled = false; g.story.side.spawnT = 0; });
  for (let i = 0; i < 30; i++) { await step(0.5); if (await ev(() => window.__game.customers.list.some((c) => c.questId === 'enrico'))) break; }
  console.log('enrico customer', await ev(() => window.__game.customers.list.filter((c) => c.questId).map((c) => c.name + ':' + c.cutId).join(',')));
  await ev(() => { const g = window.__game; const c = g.customers.list.find((x) => x.questId === 'enrico'); g.story.on('cut', { c, result: { stars: 5, style: 0 }, secs: 50 }); g.customers.remove?.(c); });
  await step(1);
  console.log('after enrico cut', await Q());
  await talk('Enrico', 'enrico'); console.log('enrico 2', await Q());
  await look(5.1, 2.84 + 2.4, 0, null); await ev(() => { window.__game.story.talkBaker(); });
  for (let i = 0; i < 200; i++) { await step(0.25); await page.waitForTimeout(15); if (await ev(() => !window.__game.story.npcs.baker.busy)) break; }
  await talk('Elli', 'elli'); console.log('asked around', await Q());
  await look(24.6, 2.84 - 6.6, Math.PI, 'jannis_alley');
  await talk('Jannis', 'jannis'); console.log('found jannis', await Q());
  for (let i = 0; i < 80; i++) { await step(0.5); if (await ev(() => window.__game.customers.list.some((c) => c.questId === 'jannis'))) break; }
  console.log('jannis customer', await ev(() => window.__game.customers.list.filter((c) => c.questId).map((c) => c.name + ':' + c.cutId).join(',')));
  await ev(() => { const g = window.__game; const c = g.customers.list.find((x) => x.questId === 'jannis'); if (c) { g.story.on('cut', { c, result: { stars: 4, style: 0 }, secs: 50 }); g.customers.remove?.(c); } });
  await step(1);
  await talk('Enrico', 'enrico'); console.log('done', await Q(), await ev(() => window.__game.save.money));
  await ev(() => window.__game.story.openLog()); await step(0.1); await snap('journal');
};

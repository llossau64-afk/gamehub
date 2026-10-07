// normal day: continue a saved game, serve two customers
export default async ({ step, snap, ev, page, until }) => {
  await ev(() => {
    const g = window.__game;
    Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 120, level: 2, xp: 30, owned: ['bulb'] });
    g.persist();
  });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await step(3);
  await snap('start');
  await ev(() => { const g = window.__game; g.shop.interactables.find((i) => i.id === 'opensign').action(); });
  await step(2.5);
  await snap('opened');
  await until(() => window.__game.customers.list[0]?.state === 'waitingTalk', 40);
  await step(1);
  const lookAt = (fn) => ev((f) => { const g = window.__game; const p = new Function('g', 'return ' + f)(g); g.player.lookTowards(p, 1, 60); g.player.applyCamera(0); }, fn);
  await lookAt('g.customers.list[0].headPos()');
  await step(0.2);
  await snap('customer');
  await ev(() => window.__game.input.press('interact'));
  await step(3);
  await snap('talked');
  await step(5);
  await snap('walking_to_chair');
  await until(() => window.__game.customers.inChair?.state === 'seated', 20);
  await ev(() => { const g = window.__game; g.player.place({ x: -0.5, z: 0.4 }, 0, -0.2); });
  await lookAt('new g.camera.position.constructor(-0.9, 1.0, -1.45)');
  await step(0.3);
  await snap('start_prompt');
  await ev(() => window.__game.input.press('interact'));
  await until(() => window.__game.state === 'barber', 10);
  await step(2);
  await snap('barber');
  // quick buzz everything
  await ev(() => { const b = window.__game.barber; b.selectTool('clipper'); b.setGuard(3); b.togglePower(); });
  const cutAll = async (secs) => {
    for (let i = 0; i < secs * 30; i++) {
      await ev((i) => {
        const g = window.__game, c = g.barber.c;
        const phi = -Math.PI + (i * 0.37) % (Math.PI * 2), th = 0.2 + ((i * 0.13) % 1) * 1.9;
        const p = c.hair.surfacePoint(phi, th, 0.01).project(g.camera);
        g.input.pointer.x = p.x; g.input.pointer.y = p.y; g.input.pointer.down = true;
        g.chairAngleTarget = Math.sin(i * 0.02) * 3;
      }, i);
      await step(1 / 30);
    }
    await ev(() => { window.__game.input.pointer.down = false; });
  };
  await cutAll(8);
  await snap('buzzed');
  await ev(() => window.__game.barber.requestFinish());
  await step(5);
  await snap('mirror');
  await step(4);
  await snap('result');
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.querySelector('.cbtn')?.click());
  await step(6);
  await snap('paid');
  await step(10);
  await snap('later');
  await step(20);
  await snap('waiting_area');
  console.log(await ev(() => JSON.stringify({ st: window.__game.state, money: window.__game.money, cust: window.__game.customers.list.map((c) => c.state + ':' + c.patience.toFixed(0)) })));
};

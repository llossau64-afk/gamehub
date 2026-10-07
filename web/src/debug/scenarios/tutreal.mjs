// skips the intro, plays the tutorial by driving the same calls the input would trigger
export default async ({ step, snap, ev, page, until }) => {
  await step(0.5);
  await ev(() => { window.__game.newGame(); });
  await until(() => window.__game.state === 'intro');
  await step(1);
  await ev(() => { window.__game.skipPointer = true; });
  await until(() => window.__game.state === 'play');
  await ev(() => { window.__game.skipPointer = false; });
  await step(1);
  await snap('after_intro');
  // wait for the customer
  await step(7);
  await snap('customer_enters');
  await until(() => window.__game.customers.list[0]?.state === 'waitingTalk');
  await step(1);
  const look = () => ev(() => { const g = window.__game; const c = g.customers.list[0]; if (!c) return 'nocust'; const p = c.headPos(); g.player.lookTowards(p, 1, 50); g.player.applyCamera(0); return c.state; });
  console.log('state', await look());
  await step(0.3);
  await snap('talk_prompt');
  await ev(() => { window.__game.input.press('interact'); });
  await step(2);
  await snap('request');
  await step(4);
  // chair
  await ev(() => { const g = window.__game; g.player.place({ x: -0.2, z: 0.2 }, 0.6, -0.2); g.player.lookTowards(new (g.camera.position.constructor)(-0.9, 1.0, -1.45), 1, 50); g.player.applyCamera(0); });
  await step(0.3);
  await snap('chair_prompt');
  await ev(() => { window.__game.input.press('interact'); });
  await step(7);
  await snap('seated');
  // cape
  await ev(() => { const g = window.__game; g.player.lookTowards(new (g.camera.position.constructor)(-2.05, 1.5, -2.56), 1, 50); g.player.applyCamera(0); });
  await step(0.3);
  await snap('cape_prompt');
  await ev(() => { window.__game.input.press('interact'); });
  await step(0.9);
  await snap('cape_throw');
  await until(() => window.__game.state === 'barber');
  await step(1.5);
  await snap('barber_mode');
  await step(3);
  // pick up clippers, power
  await ev(() => window.__game.barber.selectTool('clipper'));
  await step(2);
  await ev(() => window.__game.barber.togglePower());
  await step(1.5);
  await snap('clipper_on');
  // REAL mouse input: move the cursor over the right side and hold the left button
  const stats = () => ev(() => JSON.stringify(Object.fromEntries(Object.entries(window.__game.barber.c.hair.regionStats()).map(([k, v]) => [k, +v.mean.toFixed(3)]))));
  console.log('before', await stats());
  console.log('tutorial', await ev(() => JSON.stringify({ tool: window.__game.barber.tool, power: window.__game.barber.power, guard: window.__game.barber.guard, lock: window.__game.barber.lockTools, tip: document.querySelector('.tip')?.textContent })));
  await snap('real_before');
  const screenOf = (phi, th) => ev(([phi, th]) => { const g = window.__game, c = g.barber.c; const p = c.hair.surfacePoint(phi, th, 0.01).project(g.camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; }, [phi, th]);
  // try where the head currently is (whatever side faces the camera)
  const ang = await ev(() => window.__game.chairAngle);
  console.log('chair', ang);
  for (const phi of [-2.0, -1.5, -1.0, 1.0, 1.5, 2.0, 2.8]) {
    const [x, y] = await screenOf(phi, 1.3);
    await page.mouse.move(x, y);
    await step(0.1);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) { const [x2, y2] = await screenOf(phi + Math.sin(i * 0.9) * 0.3, 1.2 + (i % 10) * 0.04); await page.mouse.move(x2, y2); await step(1 / 30); }
    await page.mouse.up();
    console.log(phi.toFixed(1), x.toFixed(0), y.toFixed(0), await ev(() => JSON.stringify({ dragging: window.__game.barber.dragging, chairT: +window.__game.chairAngleTarget.toFixed(2) })), await stats());
  }
  await snap('real_after');
};

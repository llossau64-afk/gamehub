export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 2000, level: 6, day: 4, owned: ['bulb', 'clean', 'paint'] }); g.persist(); });
  await step(0.5);
  await ev(() => window.__game.continueGame());
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); g.buy('station2'); g.buy('hireBarber'); });
  await step(2);
  await ev(() => { const g = window.__game; g.player.place({ x: 0.3, z: 1.4 }, 0.15, -0.15); });
  await step(1);
  await snap('marco');
  // a customer who already talked and waits
  await ev(() => { const g = window.__game; const c = g.customers.spawnStatic({ seatIndex: 0, customer: { cutId: 'shortBackSides' } }); c.talked = true; c.state = 'waiting'; });
  await until(() => window.__game.employee.state === 'cutting', 40);
  await step(3);
  await snap('marco_cutting');
  await step(25);
  await snap('marco_progress');
  await until(() => window.__game.employee.state === 'idle', 90);
  await step(2);
  await snap('done');
  console.log(await ev(() => JSON.stringify({ money: window.__game.money, served: window.__game.save.stats.served, cust: window.__game.customers.list.map((c) => c.state) })));
};

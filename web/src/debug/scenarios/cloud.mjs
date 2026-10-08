// cloud save: a mocked runtime db with a newer save is adopted on the menu; writes go back
export default async ({ step, snap, ev, until }) => {
  await until(() => window.__game.state === 'menu');
  await ev(() => {
    const docs = window.__docs = {};
    const remote = { started: true, introSeen: true, tutorialDone: true, money: 777, level: 4, day: 5, owned: ['bulb'], savedAt: Date.now() + 60000, clock: { day: 5, hour: 15.5, open: true } };
    docs['data/users/u1/barber'] = { v: 1, save: JSON.stringify(remote), settings: JSON.stringify({ clipSpeed: 0.2 }), at: Date.now() };
    const ref = (p) => ({ get: async () => ({ exists: !!docs[p], data: () => docs[p] }), set: async (d) => { docs[p] = d; window.__writes = (window.__writes || 0) + 1; } });
    const db = { collection: (c) => ({ doc: (id) => ref(c + '/' + id) }) };
    window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? { id: async () => 'u1' } : null) };
    window.__game.syncCloud();
  });
  await step(1);
  console.log('menu', await ev(() => JSON.stringify({ money: window.__game.save.money, day: window.__game.save.day, speed: window.__game.settings.clipSpeed })));
  await snap('c1_menu');
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(2);
  console.log('play', await ev(() => JSON.stringify({ hour: window.__game.clock.hour, open: window.__game.clock.open, cust: window.__game.customers.enabled })));
  await ev(() => { window.__game.addMoney(10); window.__game.persist(); });
  await new Promise((r) => setTimeout(r, 4500));
  console.log('cloud', await ev(() => { const d = window.__docs['data/users/u1/barber']; const s = JSON.parse(d.save); return JSON.stringify({ writes: window.__writes, money: s.money, clock: s.clock }); }));
  await snap('c2_play');
};

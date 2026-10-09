// throw a 1-star customer out, chase him down the street, hit him again; then get run over
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 5, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.customers.enabled = false; g.customers.clear(); const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'simpleTrim', noBeard: true } }); c.state = 'seated'; g.enterBarber(c, {}); window.__forceStars = 1; });
  await step(1.5);
  await ev(() => { window.__game.barber.requestFinish(); });
  await until(() => document.querySelector('.result .cbtn'), 20);
  await ev(() => document.querySelector('.result .cbtn')?.click());
  await until(() => window.__game.reactions.eject?.phase === 'walk', 30);
  // fast-forward: he lands outside
  await ev(() => { const R = window.__game.reactions, E = R.eject; E.c.ch.place({ x: 1.9, y: 0, z: 2.2 }, 0); window.__game.player.place({ x: 1.9, z: 1.0 }, Math.PI, 0); R.launch(E, { x: 0, y: 3, z: 5, clone() { return this; } }, 'tumble'); });
  await until(() => window.__game.reactions.eject?.phase === 'flee', 15);
  await step(1.5);
  const st1 = await ev(() => { const E = window.__game.reactions.eject; return JSON.stringify({ ph: E?.phase, p: E?.c.ch.root.position, gait: E?.c.ch.gait }); });
  console.log('fleeing', st1);
  // catch up behind him
  await ev(() => { const g = window.__game, ch = g.reactions.eject.c.ch, p = ch.root.position; g.player.place({ x: p.x - Math.sin(ch.yaw) * 1.0, z: p.z - Math.cos(ch.yaw) * 1.0 }, 0, -0.2); const d = { x: p.x - g.player.pos.x, z: p.z - g.player.pos.z }; g.player.yaw = Math.atan2(-d.x, -d.z); });
  await step(0.1);
  console.log('label', await ev(() => window.__game.reactions.bouncerLabel()));
  await ev(() => window.__game.reactions.bouncerAction());
  await step(0.4); await snap('c1_streetkick');
  await until(() => window.__game.reactions.eject?.phase === 'flee', 15);
  await step(0.5);
  console.log('again', await ev(() => JSON.stringify({ ph: window.__game.reactions.eject?.phase, hits: window.__game.reactions.eject?.hits, st: window.__game.save.stats.streetHits })));
  // run over
  await ev(() => { const g = window.__game; g.player.place({ x: 0, z: 2.84 + 5.6 }, Math.PI / 2, 0); g.street.cars.forEach((c) => c.obj.parent?.remove(c.obj)); g.street.cars = []; g.street.spawnCar(); const C = g.street.cars[0]; C.dir = 1; C.obj.rotation.y = 0; C.obj.position.set(-14, -0.07, 2.84 + 5.6); C.careful = false; C.v = 10; C.vmax = 10; });
  await step(1.4);
  await snap('c2_hit');
  await new Promise((r) => setTimeout(r, 3500));
  await step(0.5);
  await snap('c3_back');
  console.log('after', await ev(() => JSON.stringify({ money: window.__game.save.money, pos: window.__game.player.pos, ko: window.__game.knockedOut, ach: window.__game.save.achievements })));
};

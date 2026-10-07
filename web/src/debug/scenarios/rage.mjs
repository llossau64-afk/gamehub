// forces star ratings and plays the mirror + exit reactions
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  for (const stars of [1, 5, 2]) {
    await ev((stars) => {
      const g = window.__game; g.customers.enabled = false; g.customers.clear();
      const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'simpleTrim', noBeard: true } });
      c.state = 'seated'; g.enterBarber(c, {});
      window.__forceStars = stars;
    }, stars);
    await step(1.5);
    await ev(() => { window.__game.barber.requestFinish(); });
    const marks = stars === 1 ? [6] : [4.6, 5.6, 7];
    let t0 = 0;
    for (const t of marks) { await step(t - t0); t0 = t; await snap(`s${stars}_mirror_${t}`); }
    await until(() => document.querySelector('.result .cbtn'), 20);
    await ev(() => document.querySelector('.result .cbtn')?.click());
    const ex = stars === 1 ? [3.5, 8, 9.5, 11] : [2, 4.5];
    t0 = 0;
    for (const t of ex) { await step(t - t0); t0 = t; await snap(`s${stars}_exit_${t}`); }
    await step(6);
    console.log(stars, await ev(() => JSON.stringify({ st: window.__game.state, loose: window.__game.reactions.loose.length, bodies: window.__game.physics.bodies.length, bin: !!window.__game.reactions.bin, money: window.__game.money })));
  }
};

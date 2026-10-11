// close-ups of several customer faces, from the front and three-quarter
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3);
  await ev(() => {
    const g = window.__game; g.customers.enabled = false; g.customers.clear();
    window.__cs = [];
    for (let i = 0; i < 4; i++) {
      const c = g.customers.spawnStatic({ seatIndex: i % 3 });
      c.ch.standUp?.(); c.ch.sitW = c.ch.sitTarget = 0; c.ch.seat = null;
      c.ch.place({ x: -2 + i * 1.2, y: 0, z: 0.4 }, 0);
      c.state = 'menu';
      window.__cs.push(c);
    }
  });
  await step(0.6);
  for (let i = 0; i < 4; i++) {
    await ev((i) => {
      const g = window.__game, c = window.__cs[i], h = c.ch.headWorld(new (g.camera.position.constructor)());
      g.dir.takeCamera(h.clone().add({ x: 0, y: 0.02, z: 0.55 }), h.clone(), 0);
      c.ch.lookAt(g.camera, 1);
    }, i);
    await step(0.5);
    await ev((i) => { const g = window.__game, c = window.__cs[i]; const h = c.ch.headWorld(new (g.camera.position.constructor)()); g.dir.takeCamera(h.clone().add({ x: 0, y: 0.0, z: 0.3 }), h.clone().add({ x: 0, y: -0.03, z: 0 })); c.ch.setEmotion(['neutral', 'happy', 'annoyed', 'surprised'][i], 5); c.ch.say(i === 3 ? 'Oh wow, really?' : ''); }, i);
    await step(0.25); await snap('face' + i + '_front');
    await ev((i) => {
      const g = window.__game, c = window.__cs[i], h = c.ch.headWorld(new (g.camera.position.constructor)());
      g.dir.takeCamera(h.clone().add({ x: 0.38, y: 0.02, z: 0.4 }), h.clone(), 0);
    }, i);
    await step(0.05);
    await ev((i) => { const g = window.__game, c = window.__cs[i]; const h = c.ch.headWorld(new (g.camera.position.constructor)()); g.dir.takeCamera(h.clone().add({ x: 0.2, y: 0.0, z: 0.23 }), h.clone().add({ x: 0, y: -0.03, z: 0 })); }, i);
    await step(0.1); await snap('face' + i + '_34');
  }
};

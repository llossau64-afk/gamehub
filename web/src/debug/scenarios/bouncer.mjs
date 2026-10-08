// 1 star -> money thrown -> player punches, grabs and throws him out
export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => {
    const g = window.__game; g.customers.enabled = false; g.customers.clear();
    const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'simpleTrim', noBeard: true } });
    c.state = 'seated'; g.enterBarber(c, {});
    window.__forceStars = 1;
  });
  await step(1.5);
  await ev(() => { window.__game.barber.requestFinish(); });
  await until(() => document.querySelector('.result .cbtn'), 20);
  await ev(() => document.querySelector('.result .cbtn')?.click());
  await until(() => window.__game.reactions.eject, 30);
  await step(1.5);
  // walk up in front of him and face him
  const face = async () => ev(() => {
    const g = window.__game, p = g.reactions.eject.c.ch.root.position;
    const d = { x: p.x - g.player.pos.x, z: p.z - g.player.pos.z };
    g.player.yaw = Math.atan2(-d.x, -d.z); g.player.pitch = -0.25;
  });
  await ev(() => {
    const g = window.__game, ch = g.reactions.eject.c.ch, p = ch.root.position;
    g.player.pos.set(p.x + Math.sin(ch.yaw) * 1.1, 0, p.z + Math.cos(ch.yaw) * 1.1);
  });
  await face();
  await step(0.1);
  console.log('label', await ev(() => window.__game.reactions.bouncerLabel() + ' | ' + window.__game.findInteractable()?.label));
  await snap('b0_front');
  await ev(() => { window.__game.reactions.bouncerAction(); });
  await step(0.18); await snap('b1_punch');
  await step(0.4); await snap('b2_fly');
  await until(() => window.__game.reactions.eject?.phase === 'down', 5);
  await ev(() => { const g = window.__game, p = g.reactions.eject.c.ch.root.position; g.player.pos.set(p.x + 0.8, 0, p.z - 0.6); });
  await face();
  await ev(() => { window.__game.player.pitch = -0.8; });
  await step(0.1);
  console.log('label2', await ev(() => window.__game.reactions.bouncerLabel() + ' | ' + window.__game.findInteractable()?.label));
  await snap('b3_down');
  await ev(() => { window.__game.reactions.bouncerAction(); });
  await step(0.8); await snap('b4_held');
  // turn to the door and throw
  await ev(() => { const g = window.__game; g.player.pos.set(1.9, 0, 0.6); g.player.yaw = Math.PI; g.player.pitch = 0; });
  await step(0.6); await snap('b5_held_door');
  console.log('held', await ev(() => { const g = window.__game, E = g.reactions.eject; return JSON.stringify({ ph: E.phase, c: E.center, cam: g.camera.position, root: E.c.ch.root.position, b: E.c.ch.bounce, vis: E.c.ch.root.visible }); }));
  await ev(() => { window.__game.reactions.bouncerAction(); });
  for (let i = 0; i < 6; i++) { await step(0.1); console.log('fly', await ev(() => { const E = window.__game.reactions.eject; return JSON.stringify({ ph: E?.phase, c: E?.center, v: E?.vel }); })); }
  await snap('b6_throw');
  await step(0.6); await snap('b7_out');
  await step(5); await snap('b8_after');
  console.log(await ev(() => JSON.stringify({ phase: window.__game.reactions.eject?.phase, st: window.__game.save.stats.bounced, p: window.__game.save.stats.punches, ach: window.__game.save.achievements })));
};

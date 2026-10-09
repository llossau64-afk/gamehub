// the long street, the alleys, Fresh Mart and the job offer
export default async ({ page, step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3);
  const shot = async (name, x, z, yaw, pitch = 0.02) => { await ev(([x, z, yaw, pitch]) => { window.__game.player.place({ x, z }, yaw, pitch); }, [x, z, yaw, pitch]); await step(0.4); await snap(name); };
  await shot('s1_super', 2.5, 4.2, Math.PI, 0.12);
  await shot('s2_left', 0, 7.5, Math.PI / 2);
  await shot('s3_right', 0, 7.5, -Math.PI / 2);
  await shot('s4_alley', -24.5, 6.5, 0.05, 0.05);
  await shot('s5_far', 30, 4.2, Math.PI / 2);
  // walk to the manager and talk
  await ev(() => { const g = window.__game, m = g.supermarket.ch.root.position; g.player.place({ x: m.x, z: m.z - 1.6 }, Math.PI, -0.1); });
  await step(0.5);
  console.log('label', await ev(() => window.__game.findInteractable()?.label));
  await snap('s6_manager');
  await ev(() => { window.__game.supermarket.talk(); });
  await until(() => document.querySelector('.choices'), 30);
  await step(0.3); await snap('s7_choice');
  await ev(() => document.querySelectorAll('.ch-b')[1].click());
  await step(2.5); await snap('s8_fu');
  await step(5);
  console.log(await ev(() => JSON.stringify({ flag: window.__game.save.flags, ach: window.__game.save.achievements, ctrl: window.__game.player.control })));
};

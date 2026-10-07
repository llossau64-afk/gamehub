export default async ({ step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 900, level: 8, owned: ['bulb', 'station2', 'hireBarber', 'extension', 'hireBarber2', 'arcade', 'sound', 'dyeStation', 'chairClassic', 'paint', 'floorWood'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play', 40);
  await step(2);
  await ev(() => { const g = window.__game; const V = g.camera.position.constructor; g.dir.takeCamera(new V(1.5, 1.7, 1.8), new V(5, 1.0, 1.0)); });
  await step(1.2); await snap('annex');
  await ev(() => { const g = window.__game; const V = g.camera.position.constructor; g.dir.takeCamera(new V(0.5, 1.7, 0.5), new V(-3, 1.2, 2.2)); });
  await step(1.2); await snap('arcade');
  console.log(await ev(() => { try { window.__game.shop.applyState(new Set(window.__game.save.owned)); return 'ok ' + window.__game.shop.slots.annex.visible + ' ' + window.__game.shop.slots.arcade.visible; } catch (e) { return 'ERR ' + e.message + e.stack; } }));
  console.log(await ev(() => JSON.stringify({ staff: window.__game.staff.map((e) => e.name) })));
};
export const x = 1;

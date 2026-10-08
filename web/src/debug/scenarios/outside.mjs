// walk out of the door onto the street
export default async ({ page, step, snap, ev, until }) => {
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 100, level: 3, owned: ['bulb'] }); g.persist(); });
  await step(0.5);
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await ev(() => { const g = window.__game; g.player.place({ x: 1.9, z: 1.2 }, Math.PI, 0); });
  // hold W through the door
  await page.keyboard.down('KeyW');
  await step(1.0); await snap('o1_door');
  await step(2.2); await snap('o2_out');
  await page.keyboard.up('KeyW');
  console.log(await ev(() => JSON.stringify({ p: window.__game.player.pos, out: window.__game.playerOutside })));
  await ev(() => { const g = window.__game; g.player.yaw = 0; });
  await step(0.5); await snap('o3_lookback');
  await ev(() => { const g = window.__game; g.player.place({ x: 0, z: 7.5 }, -Math.PI / 2, 0); g.street.spawnCar(); });
  await step(3); await snap('o4_road');
  await ev(() => { const g = window.__game; g.player.place({ x: 2, z: 7 }, 0, 0.05); });
  await step(0.3); await snap('o5_ours');
  await ev(() => { const g = window.__game; g.player.place({ x: 0, z: 7 }, Math.PI, 0.05); });
  await step(0.3); await snap('o6_opp');
  await ev(() => { const g = window.__game; g.player.place({ x: 7, z: 5 }, 0.3, 0.05); });
  await step(0.3); await snap('o7_nb');
  console.log(await ev(() => JSON.stringify({ p: window.__game.player.pos, cars: window.__game.street.cars.map((c) => [c.obj.position.x.toFixed(1), c.obj.position.z.toFixed(1), c.v.toFixed(1)]) })));
  // try to walk into the neighbour shop and far away
  await ev(() => { const g = window.__game; g.player.place({ x: 6, z: 3.2 }, Math.PI, 0); });
  await page.keyboard.down('KeyS');
  await step(2);
  await page.keyboard.up('KeyS');
  console.log('neighbour', await ev(() => JSON.stringify(window.__game.player.pos)));
};

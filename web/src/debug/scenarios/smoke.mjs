export default async ({ step, snap, ev, until }) => {
  await step(1);
  await snap('menu');
  await ev(() => window.__game.newGame());
  await until(() => window.__game.state === 'intro');
  await step(8);
  await snap('intro');
  console.log(await ev(() => JSON.stringify({ st: window.__game.state, fps: 0 })));
};

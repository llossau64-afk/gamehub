export default async ({ step, snap, ev }) => {
  await step(0.5);
  await ev(() => { window.__game.newGame(); });
  for (let i = 0; i < 8; i++) {
    await step(0.5);
    console.log(i, await ev(() => JSON.stringify({ st: window.__game.state, skip: window.__game.skipHold, can: window.__game.canSkip })));
  }
  await ev(() => { window.__game.skipPointer = true; });
  for (let i = 0; i < 6; i++) {
    await step(0.5);
    console.log('h', i, await ev(() => JSON.stringify({ st: window.__game.state, skip: window.__game.skipHold, can: window.__game.canSkip, tut: window.__game.tutorialActive })));
  }
};

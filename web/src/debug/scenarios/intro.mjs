export default async ({ step, snap, ev, page }) => {
  await step(1);
  await snap('menu');
  await ev(() => { window.__game.newGame(); });
  const marks = [[3, 'exterior'], [3.5, 'sign'], [3, 'door'], [3, 'inside'], [3, 'owner_turn'], [3, 'so_youre_here'], [4, 'beautiful'], [4, 'mostly'], [4, 'chair'], [4, 'mirror'], [4, 'crack'], [4, 'money1'], [3, 'money2'], [3, 'right'], [4, 'count'], [4, 'pocket'], [4, 'receipt'], [4, 'key'], [3, 'key_hand'], [3, 'yours'], [3, 'money_look'], [3, 'run'], [3, 'run2'], [3, 'poke'], [4, 'poke2'], [5, 'alone']];
  for (const [t, n] of marks) {
    await step(t);
    await snap(n);
  }
  console.log(await ev(() => JSON.stringify({ st: window.__game.state, tut: window.__game.tutorialActive })));
};

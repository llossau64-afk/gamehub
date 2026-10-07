// plays the intro up to the key handover and captures the GOT KEY moment
export default async ({ step, snap, ev, until }) => {
  await step(0.5);
  await ev(() => { window.__game.newGame(); });
  await until(() => window.__game.state === 'intro');
  for (let i = 0; i < 40 && !(await ev(() => window.__game.itemFx.active)); i++) { await step(2); if (i % 5 === 0) console.log(i, await ev(() => window.__game.state + ' ' + document.querySelector('.subs')?.textContent)); }
  await snap('key_in_hand');
  await step(0.4); await snap('got_key_0');
  await step(0.8); await snap('got_key_1');
  await step(1.4); await snap('got_key_2');
  await until(() => !window.__game.itemFx.active, 10);
  await step(0.6); await snap('after');
};

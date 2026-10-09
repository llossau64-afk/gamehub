// screenshots of every UI surface: menu, HUD + dialog, barber mode with dialog, upgrades, result, pause
export default async ({ page, step, snap, ev, until }) => {
  await step(1.5);
  await snap('u0_menu');
  await ev(() => { const g = window.__game; Object.assign(g.save, { started: true, introSeen: true, tutorialDone: true, money: 340, level: 4, owned: ['bulb', 'radio'] }); g.persist(); g.showMainMenu(); });
  await step(1); await snap('u1_menu_save');
  await ev(() => { window.__game.continueGame(); });
  await until(() => window.__game.state === 'play');
  await step(3);
  await ev(() => { const g = window.__game; g.showLine('Customer', 'Hey, can you do a low fade? Not too short on top please.', 5); g.ui.toast('Parcel delivered — open it (E)', 'Delivery'); });
  await step(0.6); await snap('u2_hud_dialog');
  await ev(() => {
    const g = window.__game; g.customers.enabled = false; g.customers.clear();
    const c = g.customers.spawnStatic({ chair: true, customer: { cutId: 'lowFade' } }); c.state = 'seated'; g.enterBarber(c, {});
  });
  await step(1.5);
  await ev(() => { const g = window.__game; g.barber.selectTool('clipper'); g.showLine('Customer', 'Careful around the ears, they stick out a bit, haha.', 5); });
  await step(0.6); await snap('u3_barber_dialog');
  await ev(() => { window.__game.barber.requestFinish(); });
  await until(() => document.querySelector('.result .cbtn'), 20);
  await step(0.5); await snap('u4_result');
  await ev(() => document.querySelector('.result .cbtn')?.click());
  await step(2);
  await ev(() => { window.__game.openUpgrades(); });
  await step(0.5); await snap('u5_upgrades');
  await ev(() => { window.__game.ui.closePanel(); window.__game.pause(); });
  await step(0.5); await snap('u6_pause');
};

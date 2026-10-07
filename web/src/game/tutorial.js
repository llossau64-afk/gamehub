// First customer: teaches one action at a time, inside the real game loop.
import { referenceImage } from './reference.js';
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { TUTORIAL_LOOK } from '../chars/looks.js';
import { HAIRCUTS } from '../hair/styles.js';
import { SPOTS } from '../world/shop.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function playTutorial(game) {
  const { dir, ui, shop } = game;
  const wait = (s) => dir.wait(s);
  const key = (k, touch) => (game.input.touch ? touch : k);
  game.tutorialActive = true;

  ui.objective('Your first day', 'Let’s figure this out');
  await wait(4.0);

  // ---- the first customer walks in
  const c = game.customers.spawn({
    look: TUTORIAL_LOOK, name: 'Danny', cutId: 'simpleTrim', noBeard: true,
    personality: { id: 'friendly', label: 'Friendly', patience: 99, payMult: 1, tipMult: 1, voiceRate: 1, greet: [], happy: [], bad: [], wait: [], idle: 'look' },
  });
  c.tutorial = true;
  c.hair.setStyle({ top: 0.64, front: 0.6, left: 0.4, right: 0.41, back: 0.42, fuzz: 0.08, noise: 0.1 }, 0.37);
  await dir.until(() => c.state === 'waitingTalk', 30);
  c.ch.setEmotion('concerned');
  c.say('Uh... you are open, right?', 'concerned', 3);
  await wait(1.2);

  // ---- 1: talk
  ui.objective('Your first customer', 'Talk to Danny');
  game.highlight(c.ch.mesh, 'char');
  ui.tip(key('Press E to talk', 'Tap TALK'), 'E');
  await game.waitInteract('customer');
  game.highlight(null);
  ui.tip(null);
  c.talked = true;
  c.state = 'talking';
  c.ch.setEmotion('happy');
  const d = c.say('Just a simple trim today.', 'happy', 3);
  c.refImg ||= referenceImage('simpleTrim', c.look);
  ui.showRequest(HAIRCUTS.simpleTrim, c, true);
  audio.paperFlick();
  await wait(Math.max(1.6, d));
  ui.tip('Customers tell you what haircut they want');
  await wait(2.8);
  ui.shrinkRequest();
  ui.tip(null);

  // ---- 2: chair
  ui.objective('Your first customer', 'Show Danny to the chair');
  game.highlight(shop.chairObj(), 'prop');
  game.allowChairCall = true;
  await game.waitInteract('chair');
  game.highlight(null);
  c.say('Okay. Here goes.', 'concerned', 2);
  await game.customers.toChair(c);
  await wait(0.4);
  c.say('Huh. It squeaks.', 'confused', 2);

  // ---- 3: cape
  ui.objective('Your first customer', 'Prepare your customer');
  game.highlight(shop.slots.capeHook, 'prop');
  ui.tip(key('Take the cape from the hook', 'Tap the cape on the hook'));
  await game.waitInteract('cape');
  game.highlight(null);
  ui.tip(null);
  await game.putCape(c);

  // ---- 4: barber mode, read the request
  game.enterBarber(c, { tutorial: true });
  const bm = game.barber;
  bm.allowFinish = false;
  bm.lockTools = ['clipper'];
  ui.objective('', '');
  await wait(0.8);
  ui.tip('Your target: get every bar into its green zone');
  await wait(3.0);

  // ---- 5: pick up the clippers
  ui.tip(key('Pick up the clippers  (1)', 'Tap the clippers'), '1');
  ui.barberHint('clipper');
  await waitEvent(bm, 'tool', (id) => id === 'clipper');
  ui.barberHint(null);
  ui.tip('Cheap clippers. They’ll do.');
  await wait(1.6);

  // ---- 6: turn on
  ui.tip(key('Press SPACE to switch them on', 'Tap POWER to switch them on'), 'Space');
  ui.barberHint('power');
  await waitEvent(bm, 'power');
  ui.barberHint(null);
  c.say('Whoa. They’re loud.', 'surprised', 1.5);
  await wait(1.0);

  // ---- 7: first section, right side, guard 3 is already on
  bm.setGuard(4);
  ui.tip(key('Hold the mouse and move over the glowing hair', 'Drag across the glowing hair'), 'LMB');
  c.hair.setHighlight('right');
  bm.focus = 'right';
  bm.setView('right');
  await waitRegion(game, c, 'right');
  c.hair.setHighlight(null);
  audio.objective();
  ui.tip('Nice. Your cut changed the hair.');
  await wait(1.8);

  // ---- 8: match both sides
  ui.tip(key('Other side: pick ROTATE on the left (or hold the right mouse button) and drag to turn the view', 'Other side: pick ROTATE on the left and drag to turn the view'), 'R');
  ui.barberHint('view');
  await dir.until(() => Math.sin(bm.orbYaw) < 0.2, 60).catch(() => {});
  ui.barberHint(null);
  if (bm.mode !== 'cut') { ui.tip('Back to CUT, then clip the other side', 'R'); ui.barberHint('cutmode'); await dir.until(() => bm.mode === 'cut', 40).catch(() => {}); ui.barberHint(null); }
  ui.tip('Match both sides');
  c.hair.setHighlight('left');
  bm.focus = 'left';
  await waitRegion(game, c, 'left');
  ui.barberHint(null);
  c.hair.setHighlight('back');
  bm.focus = 'back';
  ui.tip(key('And the back — rotate behind him', 'And the back — rotate behind him'), 'R');
  await waitRegion(game, c, 'back');
  c.hair.setHighlight(null);
  audio.objective();
  if (bm.power) bm.togglePower();

  // ---- 9: scissors on top
  bm.lockTools = ['clipper', 'scissors'];
  ui.tip(key('Use scissors for longer hair  (2)', 'Use scissors for longer hair'), '2');
  ui.barberHint('scissors');
  await waitEvent(bm, 'tool', (id) => id === 'scissors');
  ui.barberHint(null);
  c.hair.setHighlight('top');
  bm.focus = 'top';
  bm.setView('back');
  bm.setLevel(2);
  ui.tip('Small controlled cuts on the top');
  await waitRegions(game, c, ['top', 'front'], (r) => { c.hair.setHighlight(r); bm.focus = r; });
  c.hair.setHighlight(null);
  audio.objective();

  // ---- 10: edges with the trimmer
  bm.lockTools = null;
  ui.tip(key('Finish with clean edges — trimmer  (3)', 'Finish with clean edges — trimmer'), '3');
  ui.barberHint('trimmer');
  await waitEvent(bm, 'tool', (id) => id === 'trimmer');
  ui.barberHint(null);
  if (!bm.power) {
    ui.tip(key('Switch it on (SPACE) and clean the fuzz below the hairline', 'Tap POWER, then clean the fuzz below the hairline'), 'Space');
  } else ui.tip('Clean the fuzz below the hairline');
  setTimeout(() => { if (bm.active && !bm.close) { ui.tip(key('Tip: the magnifier next to the tools (C) zooms right in for edges', 'Tip: the magnifier zooms right in for edges'), 'C'); ui.barberHint('close'); } }, 3500);
  c.hair.setHighlight('edges');
  bm.focus = 'edges';
  await dir.until(() => bm.stats && bm.stats.edges.messy < 0.09, 240);
  c.hair.setHighlight(null);
  ui.tip('Clean edges get better ratings.');
  await wait(1.6);

  // ---- 11: finish
  bm.allowFinish = true;
  bm.focus = null;
  ui.tip(key('Happy with it? Finish the cut  (F)', 'Happy with it? Tap FINISH'), 'F');
  ui.barberHint('finish');
  await game.waitHaircutDone();
  ui.tip(null);
  // (mirror reaction, result, payment and goodbye run inside game.finishHaircut)
  await dir.until(() => !game.customers.list.includes(c), 60);

  // ---- 12: first upgrade
  game.tutorialUpgrade = true;
  ui.objective('Your first upgrade', 'Buy a better light bulb');
  ui.attention('upgrades', true);
  ui.tip(key('Open the upgrades (U) or use the catalogue on the counter', 'Tap the shop button (top right)'), 'U');
  game.highlight(shop.slots.catalog, 'prop');
  await dir.until(() => game.owns('bulb'), 600);
  game.highlight(null);
  ui.objective('', '');
  ui.attention('upgrades', false);
  ui.tip(null);
  game.tutorialUpgrade = false;
  await dir.until(() => !ui.openPanel, 60);
  await wait(1.2);
  ui.tip('Your money changes your shop.');
  await wait(2.4);
  ui.tip(null);

  // ---- done
  game.tutorialActive = false;
  game.save.tutorialDone = true;
  game.persist();
  await ui.banner('Tutorial complete', 'Day 1', 'The shop is open', 2400);
  ui.objective('', '');
}

function waitEvent(bm, name, pred = () => true) {
  return new Promise((res) => {
    const prev = bm.onEvent;
    bm.onEvent = (n, data) => {
      prev?.(n, data);
      if (n === name && pred(data)) { bm.onEvent = prev; res(data); }
    };
  });
}

function regionDone(c, r) {
  const st = c.hair.regionStats()[r];
  const cut = c.cut;
  return st.mean <= cut.target[r] + cut.tol * 0.8;
}

function waitRegion(game, c, r) {
  return game.dir.until(() => regionDone(c, r), 600);
}

async function waitRegions(game, c, regions, onFocus) {
  for (const r of regions) {
    if (regionDone(c, r)) continue;
    onFocus(r);
    await waitRegion(game, c, r);
  }
}

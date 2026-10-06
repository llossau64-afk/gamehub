// Boot + main loop.
import { save } from './save.js';
import { audio } from './audio.js';
import { initInput, pollInput, endFrame } from './input.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { crazy } from './crazy.js';

async function boot() {
  save.load();
  const sdkReady = crazy.init();
  // Wait for the display font so the canvas-drawn floor numbers use it.
  try { await Promise.race([document.fonts.load('800 40px "Big Shoulders Display"'), new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* fine */ }

  const world = new World(document.getElementById('gl'));
  const fx = new FX(world, document.getElementById('fx2d'));
  const ui = new UI();
  const game = new Game(world, fx, ui);
  ui.init(game, world, fx);
  initInput(document.getElementById('gl'), ui);

  game.enterMenu();
  ui.showMenu();

  // iPad/iPhone report the new size late after a rotation (and inside the CrazyGames iframe even
  // later), so re-measure a few times; the visual viewport also catches toolbar show/hide.
  const onResize = () => { world.resize(); fx.resize(); document.body.classList.toggle('portrait', innerHeight > innerWidth); };
  const settle = () => { onResize(); for (const ms of [120, 350, 800]) setTimeout(onResize, ms); };
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  if (window.visualViewport) visualViewport.addEventListener('resize', onResize);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', settle);
  onResize();

  // Never lose progress: save when the tab is hidden, and pause running games.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save.write();
      if (game.mode === 'run' && !game.paused && ['fight', 'clear', 'arrive'].includes(game.phase)) ui.togglePause(game);
      if (audio.ctx) audio.ctx.suspend();
    } else if (audio.ctx) audio.ctx.resume().catch(() => { });
  });
  window.addEventListener('pagehide', () => save.write());

  let last = performance.now();
  const frame = now => {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000; last = now;
    const dt = Math.min(raw, 1 / 30); // clamp: a hitch never teleports anything through walls
    pollInput();
    game.update(dt);
    if (ui.screen !== 'chestopen') world.render(); // the chest reveal covers the whole screen
    fx.drawNumbers(game.paused ? 0 : dt, world.camera);
    ui.drawIndicators(game);
    ui.renderPreviews(Math.min(raw, 0.05));
    ui.updateHUD(game);
    world.perfSample(raw);
    endFrame();
  };
  requestAnimationFrame(frame);

  await Promise.race([sdkReady, new Promise(r => setTimeout(r, 2500))]);
  crazy.loadingStop();
  const bootEl = document.getElementById('boot');
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 500);

  // Small hook for automated testing / debugging from the console.
  window.__omf = { game, world, fx, ui, save, audio, crazy };
}

boot().catch(err => {
  console.error(err);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<div class="boot-title">Could not start</div><div style="color:#8d8a83;font:13px sans-serif;max-width:320px;text-align:center">${String(err && err.message || err)}<br><br>This game needs WebGL. Try a current Chrome, Edge, Firefox or Safari.</div>`;
});

// Boot + main loop.
import { save } from './save.js';
import { audio } from './audio.js';
import { initInput, pollInput, endFrame } from './input.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Game } from './game.js';
import { UI } from './ui.js';

async function boot() {
  save.load();
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

  const onResize = () => { world.resize(); fx.resize(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

  // Never lose progress: save when the tab is hidden, and pause running games.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save.write();
      if (game.mode === 'run' && !game.paused && ['fight', 'clear', 'arrive'].includes(game.phase)) ui.togglePause(game);
      if (audio.ctx) audio.ctx.suspend();
    } else if (audio.ctx) audio.ctx.resume();
  });
  window.addEventListener('pagehide', () => save.write());

  let last = performance.now();
  const frame = now => {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000; last = now;
    const dt = Math.min(raw, 1 / 30); // clamp: a hitch never teleports anything through walls
    pollInput();
    game.update(dt);
    world.render();
    fx.drawNumbers(game.paused ? 0 : dt, world.camera);
    ui.drawIndicators(game);
    ui.renderPreviews(raw > 0.1 ? 0.016 : raw);
    ui.updateHUD(game);
    world.perfSample(raw);
    endFrame();
  };
  requestAnimationFrame(frame);

  const bootEl = document.getElementById('boot');
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 500);

  // Small hook for automated testing / debugging from the console.
  window.__omf = { game, world, fx, ui, save, audio };
}

boot().catch(err => {
  console.error(err);
  const b = document.getElementById('boot');
  if (b) b.innerHTML = `<div class="boot-title">Could not start</div><div style="color:#8d8a83;font:13px sans-serif;max-width:320px;text-align:center">${String(err && err.message || err)}<br><br>This game needs WebGL. Try a current Chrome, Edge, Firefox or Safari.</div>`;
});

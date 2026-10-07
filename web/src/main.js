import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRenderer, detectQuality } from './render/renderer.js';
import { initMaterials } from './render/materials.js';
import { registerProps } from './world/props.js';
import { buildTemplate } from './chars/template.js';
import { Input } from './core/input.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { store } from './core/save.js';
import { platform } from './platform/platform.js';
import { audio } from './audio/audio.js';

const ASSETS = { props: 'assets/props.glb', characters: 'assets/characters.glb' };

async function boot() {
  const canvas = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  const input = new Input(canvas, uiRoot);
  const ui = new UI(uiRoot, input);
  ui.setLoading(0.05);
  await platform.init();
  platform.loadingStart();
  store.load();
  const qualityName = store.settings.quality === 'auto' ? detectQuality() : store.settings.quality;
  const renderer = createRenderer(canvas, qualityName);
  initMaterials();
  // fonts are needed for the canvas-painted signs and posters
  try {
    await Promise.race([
      Promise.all(['700 40px "Barlow Condensed"', '600 20px "Barlow Condensed"', '400 40px "DM Serif Display"'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fall back to system fonts */ }
  ui.setLoading(0.15);
  const loader = new GLTFLoader();
  const progress = { props: 0, characters: 0 };
  const load = (key) => new Promise((res, rej) => loader.load(ASSETS[key], res, (e) => {
    if (e.total) { progress[key] = e.loaded / e.total; ui.setLoading(0.15 + 0.6 * (progress.props + progress.characters) / 2); }
  }, rej));
  const [props, chars] = await Promise.all([load('props'), load('characters')]);
  registerProps(props.scene);
  buildTemplate(chars.scene);
  ui.setLoading(0.82, 'Sweeping the floor');
  await new Promise((r) => setTimeout(r, 30));
  const game = new Game({ renderer, ui, input, qualityName });
  window.__game = game;
  // warm up shaders so the first frames do not hitch
  game.camera.position.set(1.6, 1.55, 1.7);
  game.camera.lookAt(-0.9, 1, -1.4);
  renderer.compile(game.scene, game.camera);
  ui.setLoading(1, 'Opening up');
  // first user gesture unlocks audio
  const unlock = () => { audio.unlock(); game.ambience = audio.ambience(); };
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });

  let last = performance.now();
  let acc = 0, frames = 0;
  const stats = { fps: 0 };
  window.__stats = stats;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!(dt > 0)) dt = 0;
    game.update(dt);
    game.render();
    acc += dt; frames++;
    if (acc > 1) { stats.fps = frames / acc; stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles; acc = 0; frames = 0; }
  }
  // test harness: ?manual disables the real-time loop; tests call __step()
  if (new URLSearchParams(location.search).has('manual')) {
    window.__step = async (n = 1, dt = 1 / 30, render = true) => {
      // yield between frames so awaited script continuations run like in real time
      for (let i = 0; i < n; i++) { game.update(dt); await new Promise((r) => setTimeout(r, 0)); }
      if (render) game.render();
    };
  } else requestAnimationFrame(frame);
  ui.hideLoading();
  platform.loadingStop();
  game.start();
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.t').textContent = 'Something went wrong. Please reload.';
});

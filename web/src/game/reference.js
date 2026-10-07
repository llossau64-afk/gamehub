// Haircut reference cards: the requested cut rendered on a stand-in head (front, side,
// back) in the game's own style, shown on a little barbershop poster. Rendered once per
// request in a small offscreen renderer and cached by cut + hair colour.
import * as THREE from 'three';
import { Character } from '../chars/character.js';
import { HairSystem } from '../hair/hair.js';
import { BeardSystem } from '../hair/beard.js';
import { HAIRCUTS, fadeTarget } from '../hair/styles.js';

const W = 220, H = 260;
const cache = new Map();
let R = null;

function renderer() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  canvas.width = W * 3; canvas.height = H;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(W * 3, H, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.setScissorTest(true);
  R = { r, canvas };
  return R;
}

// long start hair so every target is shorter than what we cut from
const LONG = { top: 0.8, front: 0.8, left: 0.6, right: 0.6, back: 0.7, fuzz: 0.08, noise: 0.05 };
const LONG_BEARD = { chin: 0.35, cheeks: 0.3, moustache: 0.3, neck: 0.15, noise: 0.1 };

export function referenceImage(cutId, look) {
  const key = cutId + '|' + look.hairColor + '|' + (look.curl > 0.5 ? 'c' : 's');
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try { url = draw(cutId, look); } catch (e) { console.warn('reference render failed', e); }
  if (url) cache.set(key, url);
  return url;
}

function draw(cutId, look) {
  const cut = HAIRCUTS[cutId];
  const { r, canvas } = renderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4e0', '#5a4a3c', 1.6));
  const key = new THREE.DirectionalLight('#ffe6c8', 2.4); key.position.set(1.2, 2.5, 2); scene.add(key);
  const rim = new THREE.DirectionalLight('#c9d8ff', 1.2); rim.position.set(-2, 1.5, -2); scene.add(rim);
  // a calm, neutral stand-in in the customer's hair colour
  const ch = new Character(scene, { ...look, accessories: (look.accessories || []).filter((a) => a !== 'glasses'), name: 'ref' });
  ch.shadow.visible = false;
  ch.place(new THREE.Vector3(0, 0, 0), 0);
  ch.setEmotion('neutral');
  const hair = new HairSystem({ color: look.hairColor, skin: look.colors.Skin, curl: look.curl, layers: 18 });
  hair.attach(ch.bones.Head);
  hair.setStyle(LONG, 0.5);
  hair.setStyleDir(cut.style);
  hair.beginService(cut, 1, fadeTarget);
  hair.serviceProgress(1);
  hair.dirty = true;
  ch.hair = hair;
  let beard = null;
  if (cut.beard) {
    beard = new BeardSystem({ color: look.hairColor, skin: look.colors.Skin, layers: 14 });
    beard.attach(ch.bones.Head);
    beard.setStyle(LONG_BEARD);
    beard.beginService(cut, 1);
    beard.serviceProgress(1);
    ch.beard = beard;
  }
  for (let i = 0; i < 4; i++) ch.update(1 / 30);
  ch.blinkT = 99;
  scene.updateMatrixWorld(true);
  hair.update(0); beard?.update(0);
  const head = ch.headWorld(new THREE.Vector3()).add(new THREE.Vector3(0, -0.07, 0));
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 10);
  const views = [[0.55, 0.05], [Math.PI / 2, 0.02], [Math.PI, 0.12]];
  r.setClearColor(0x000000, 0);
  r.clear();
  views.forEach(([yaw, pitch], i) => {
    cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(0.72).add(head);
    cam.lookAt(head);
    r.setViewport(i * W, 0, W, H);
    r.setScissor(i * W, 0, W, H);
    r.render(scene, cam);
  });
  const url = canvas.toDataURL('image/png');
  ch.dispose();
  return url;
}

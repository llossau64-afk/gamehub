import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRenderer, makeEnvironment } from '../render/renderer.js';
import { initMaterials } from '../render/materials.js';
import { buildTemplate } from '../chars/template.js';
import { Character } from '../chars/character.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
const renderer = createRenderer(canvas, 'high');
renderer.setSize(innerWidth, innerHeight);
initMaterials();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#3a3530');
scene.environment = makeEnvironment(renderer);
scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight('#ffe8cc', '#40352c', 0.8));
const key = new THREE.DirectionalLight('#ffe2b8', 2.2);
key.position.set(1.5, 3, 2.5);
scene.add(key);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#5a4a3c' }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 50);
const view = params.get('cam') || 'full';
if (view === 'face') { cam.position.set(0.12, 1.68, 0.6); cam.lookAt(0, 1.66, 0); }
else if (view === 'upper') { cam.position.set(0.6, 1.5, 1.6); cam.lookAt(0, 1.3, 0); }
else if (view === 'hand') { cam.position.set(0.5, 1.1, 0.7); cam.lookAt(0, 1.1, 0.2); }
else { cam.position.set(1.4, 1.3, 3.6); cam.lookAt(0, 0.9, 0); }
new GLTFLoader().load('/assets/characters.glb', (g) => {
  buildTemplate(g.scene);
  const accs = (params.get('acc') ?? 'jacket,tie,moustache,belly').split(',');
  const ch = new Character(scene, { colors: { Skin: '#d9a585', Top: '#4a4038', Sleeve: '#4a4038', Pants: '#3a332c', Shoes: '#2a1a12',
    Hair: '#bcb5aa', EyeWhite: '#f2ece2', Iris: '#4a6a7a', Pupil: '#111', Shirt: '#eae2d0', Tie: '#7a2a26',
    Lapel: '#3c342d', Mouth: '#5a2420', Teeth: '#eee', Frame: '#222', Sole: '#1a1410', Belt: '#2a1c14',
    Metal: '#b58a3c', Button: '#2a2420', TopDark: '#333', MouthDark: '#2a0c0a', Apron: '#333' }, accessories: accs, hunch: +(params.get('hunch') || 0.5) });
  window.__ch = ch;
  if (params.get('emo')) ch.setEmotion(params.get('emo'));
  if (params.get('g')) ch.gesture(params.get('g'), { target: new THREE.Vector3(2, 1, 1) });
  if (params.get('walk')) { ch.place(new THREE.Vector3(0, 0, -3), 0); ch.walkTo([new THREE.Vector3(0, 0, 30)], params.get('walk')); }
  ch.lookAt(cam, 1);
  const clock = new THREE.Clock();
  let tt = 0;
  const fixedT = parseFloat(params.get('t') || '1.2');
  // simulate fixed time then render
  for (let i = 0; i < fixedT * 60; i++) ch.update(1 / 60, cam);
  if (params.get('walk')) { cam.lookAt(ch.root.position.x, 0.9, ch.root.position.z); cam.position.z = ch.root.position.z + 3.6; cam.position.x = 1.4; cam.lookAt(ch.root.position.x, 0.9, ch.root.position.z); }
  window.__ready = true;
  function loop() { renderer.render(scene, cam); requestAnimationFrame(loop); }
  loop();
});

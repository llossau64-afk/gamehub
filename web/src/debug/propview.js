import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createRenderer, makeEnvironment } from '../render/renderer.js';
import { initMaterials } from '../render/materials.js';
import { registerProps, spawnProp, propNames } from '../world/props.js';

const params = new URLSearchParams(location.search);
const renderer = createRenderer(document.getElementById('c'), 'high');
renderer.setSize(innerWidth, innerHeight);
initMaterials();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#3a3530');
scene.environment = makeEnvironment(renderer);
scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight('#ffe8cc', '#40352c', 0.9));
const key = new THREE.DirectionalLight('#ffe2b8', 2.0);
key.position.set(2, 4, 3);
scene.add(key);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 80);
new GLTFLoader().load('/assets/props.glb', (g) => {
  registerProps(g.scene);
  const list = (params.get('only') || propNames().join(',')).split(',');
  const cols = Math.ceil(Math.sqrt(list.length));
  const sp = parseFloat(params.get('sp') || '1.6');
  list.forEach((n, i) => {
    const o = spawnProp(n);
    const x = (i % cols) * sp, z = -Math.floor(i / cols) * sp;
    o.position.set(x, 0, z);
    const s = parseFloat(params.get('scale') || '1');
    o.scale.setScalar(s);
    scene.add(o);
  });
  const cx = (cols - 1) * sp / 2, cz = -(Math.ceil(list.length / cols) - 1) * sp / 2;
  const d = parseFloat(params.get('dist') || String(cols * sp * 1.1));
  cam.position.set(cx + d * 0.35, d * 0.6, cz + d * 0.9);
  cam.lookAt(cx, 0.3, cz);
  window.__ready = true;
});
(function loop() { renderer.render(scene, cam); requestAnimationFrame(loop); })();

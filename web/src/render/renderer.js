import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const QUALITY = {
  low:    { pixelRatio: 0.85, shadows: false, shadowSize: 512, mirror: false, hairLayers: 10, antialias: false },
  medium: { pixelRatio: 1.25, shadows: true, shadowSize: 1024, mirror: true, hairLayers: 16, antialias: true },
  high:   { pixelRatio: 2.0, shadows: true, shadowSize: 2048, mirror: true, hairLayers: 22, antialias: true },
};

export function detectQuality() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export function createRenderer(canvas, qualityName) {
  const q = QUALITY[qualityName] || QUALITY.medium;
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  return renderer;
}

export function applyQuality(renderer, qualityName) {
  const q = QUALITY[qualityName] || QUALITY.medium;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.needsUpdate = true;
  return q;
}

export function makeEnvironment(renderer, intensity = 0.4) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

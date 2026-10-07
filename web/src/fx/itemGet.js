// "Got item" moment: the object floats in front of the camera, turns slowly in a
// burst of light rays and sparkles, then drops into your pocket.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { clamp, easeOut, smooth } from '../core/util.js';

const PARK = new THREE.Vector3(0, -60, 0);

const raysMat = () => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color('#ffd27a') } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uT; uniform float uA; uniform vec3 uCol; varying vec2 vUv;
    void main(){
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      float a = atan(p.y, p.x);
      float rays = pow(0.5 + 0.5 * sin(a * 9.0 + uT * 0.6), 6.0) + 0.6 * pow(0.5 + 0.5 * sin(a * 14.0 - uT * 0.9 + 1.3), 10.0);
      float core = exp(-r * r * 9.0);
      float fall = smoothstep(1.0, 0.15, r);
      float v = (rays * 0.5 * fall + core * 0.45) * uA;
      gl_FragColor = vec4(uCol * v, v);
    }`,
  transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

const sparkMat = () => new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uA: { value: 0 }, uScale: { value: 1 } },
  vertexShader: /* glsl */`
    attribute vec4 seed; uniform float uT; uniform float uScale; varying float vTw; varying float vFade;
    void main(){
      // burst outward, then drift and twinkle
      float t = uT;
      float burst = 1.0 - exp(-t * (2.5 + seed.w * 2.0));
      vec3 dir = normalize(seed.xyz - 0.5);
      vec3 p = dir * (0.03 + burst * (0.06 + seed.w * 0.07));
      p.y += t * 0.006 * (0.5 + seed.x);
      p += 0.004 * vec3(sin(t * 3.0 + seed.y * 20.0), cos(t * 2.0 + seed.z * 20.0), 0.0);
      vTw = 0.5 + 0.5 * sin(t * (8.0 + seed.w * 10.0) + seed.x * 30.0);
      vFade = clamp(1.0 - (t - 1.6 - seed.y) * 0.8, 0.0, 1.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uScale * (6.0 + seed.z * 10.0) / -mv.z * 0.0009;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uA; varying float vTw; varying float vFade;
    void main(){
      vec2 q = gl_PointCoord - 0.5;
      float star = max(0.0, 1.0 - abs(q.x) * 14.0) * max(0.0, 1.0 - abs(q.y) * 2.2) + max(0.0, 1.0 - abs(q.y) * 14.0) * max(0.0, 1.0 - abs(q.x) * 2.2);
      float dotc = exp(-dot(q, q) * 60.0);
      float v = (star * 0.8 + dotc) * uA * vFade * (0.35 + 0.65 * vTw);
      gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * v, v);
    }`,
  transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
});

export class ItemShowcase {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.position.copy(PARK);
    this.rays = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), raysMat());
    this.rays.renderOrder = 20;
    this.group.add(this.rays);
    const n = 46;
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.sparks = new THREE.Points(g, sparkMat());
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 22;
    this.group.add(this.sparks);
    this.holder = new THREE.Group();
    this.orient = new THREE.Group();
    this.orient.rotation.order = 'ZXY';
    this.holder.add(this.orient);
    this.group.add(this.holder);
    game.scene.add(this.group);
    this.active = false;
  }

  // obj: a prop; returns when it is pocketed
  show(obj, info = {}) {
    const g = this.game;
    this.obj = obj;
    obj.parent?.remove(obj);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(1);
    // centre the item on its own bounds (measured before it is parented) so it spins around its middle
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    obj.position.copy(c).negate();
    this.orient.rotation.set(info.rot?.[0] ?? 0, info.rot?.[1] ?? 0, info.rot?.[2] ?? 0);
    this.orient.add(obj);
    this.fit = (info.size ?? 0.145) / Math.max(0.02, size);
    this.t = 0;
    this.active = true;
    this.dur = info.dur ?? 3.4;
    this.sparks.material.uniforms.uScale.value = g.renderer.domElement.height;
    audio.itemGet?.();
    g.ui.itemGet(info);
    return new Promise((res) => { this.done = res; });
  }

  // skipped cutscene: put everything away at once
  cancel() {
    if (!this.active) return;
    this.t = this.dur + 10;
    this.update(0);
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game, cam = g.camera;
    cam.updateMatrixWorld();
    this.t += dt;
    const t = this.t, D = this.dur;
    // position in camera space: rise in, hold, then drop toward the right pocket
    const inK = easeOut(clamp(t / 0.55, 0, 1));
    const outK = smooth(clamp((t - D) / 0.5, 0, 1));
    const local = new THREE.Vector3(0.02 * (1 - inK), 0.018 - 0.1 * (1 - inK) + Math.sin(t * 2.2) * 0.004, -0.24);
    local.lerp(new THREE.Vector3(0.16, -0.24, -0.3), outK);
    this.group.position.copy(local.applyMatrix4(cam.matrixWorld));
    this.group.quaternion.copy(cam.quaternion);
    // the item turns slowly and tilts so the worn bit catches the light
    const s = this.fit * (0.6 + 0.4 * inK) * (1 - outK * 0.75);
    this.holder.scale.setScalar(s);
    this.holder.rotation.set(0.15 + Math.sin(t * 1.3) * 0.12, Math.sin(t * 1.1) * 0.75 + (1 - inK) * 2.5, Math.sin(t * 0.9) * 0.08);
    const ra = clamp(t / 0.35, 0, 1) * (1 - outK);
    this.rays.material.uniforms.uT.value = t;
    this.rays.material.uniforms.uA.value = ra * (0.75 + 0.25 * Math.sin(t * 5));
    this.rays.position.z = -0.03;
    this.sparks.material.uniforms.uT.value = t;
    this.sparks.material.uniforms.uA.value = 1 - outK;
    if (t > D + 0.55) {
      this.active = false;
      this.orient.remove(this.obj);
      this.group.position.copy(PARK);
      this.rays.material.uniforms.uA.value = 0;
      this.sparks.material.uniforms.uA.value = 0;
      audio.cloth(0.8, 0.25);
      audio.keySmall();
      g.ui.itemGet(null);
      const d = this.done; this.done = null; d?.();
    }
  }
}

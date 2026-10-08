// Atmosphere: sky dome with drifting clouds, sun + shadows, hemisphere light, fog,
// distant mountain ranges, valley floor, reflections, weather and birds.
// Everything blends continuously with the biome under the player.

import * as THREE from 'three';
import { lerp, clamp, smoothstep, rng } from '../core/util.js';
import { softSprite } from '../gfx/textures.js';

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'grass', 'dirt', 'rock'];
const NUM_KEYS = ['fogDensity', 'sunIntensity', 'sunElev', 'sunAzim', 'hemiIntensity', 'snow', 'clouds', 'cloudDark', 'wind', 'birds', 'warmth'];
const WEATHERS = ['snow', 'rain', 'storm', 'dust'];

export function lookAt(track, s) {
  const [a, b, t] = track.biomeBlend(s);
  const A = track.m.biomes[a].look, B = track.m.biomes[b].look;
  const o = {};
  for (const k of COLOR_KEYS) o[k] = new THREE.Color(A[k]).lerp(new THREE.Color(B[k]), t);
  for (const k of NUM_KEYS) o[k] = lerp(A[k], B[k], t);
  for (const w of WEATHERS) o[w] = lerp(A.weather === w ? 1 : 0, B.weather === w ? 1 : 0, t);
  if (o.storm > 0) o.rain = Math.max(o.rain, o.storm * 0.7);
  return o;
}

const skyVert = `
varying vec3 vDir;
void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
const skyFrag = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uCloud; uniform float uCloudDark; uniform float uTime; uniform float uFlash;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), 0.5));
  col = mix(col, uHorizon * 0.92, smoothstep(0.02, -0.25, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(sd, 1400.0) * 14.0 + pow(sd, 18.0) * 0.22 + pow(sd, 3.0) * 0.08) * (1.0 - uCloud * 0.6);
  if (h > -0.02) {
    vec2 uv = d.xz / (h + 0.11) * 0.55 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv * 1.3) * 0.75 + fbm(uv * 4.1 + 3.7) * 0.25;
    float cov = mix(0.72, 0.36, uCloud);
    float a = smoothstep(cov, cov + 0.22, n) * smoothstep(-0.02, 0.18, h);
    float thick = smoothstep(cov, cov + 0.5, n);
    vec3 lit = mix(vec3(1.0), uSun, 0.35) * (0.95 + pow(sd, 6.0) * 0.4);
    vec3 dark = mix(uHorizon, vec3(0.32, 0.34, 0.38), 0.6);
    vec3 cc = mix(lit, dark, clamp(thick * (0.4 + uCloudDark), 0.0, 1.0));
    col = mix(col, cc, a * 0.92);
  }
  col += vec3(0.85, 0.88, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const ridgeFrag = `
uniform vec3 uBase; uniform vec3 uHaze; uniform float uHazeAmt; uniform vec3 uSnow; uniform float uSnowLine;
varying float vH; varying float vN;
void main(){
  vec3 c = uBase * (0.8 + vN * 0.3);
  c = mix(c, uSnow, smoothstep(uSnowLine, uSnowLine + 60.0, vH + vN * 40.0));
  c = mix(c, uHaze, uHazeAmt);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
const ridgeVert = `
attribute float aN; varying float vH; varying float vN;
void main(){ vH = position.y; vN = aN; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.time = 0;
    this.flash = 0;
    this.events = [];

    scene.fog = new THREE.FogExp2(0xb0bcc4, 0.003);
    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSun: { value: new THREE.Color() }, uCloud: { value: 0.4 }, uCloudDark: { value: 0.1 }, uTime: { value: 0 }, uFlash: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1536;
    this.sun.shadow.mapSize.set(sm, sm);
    const ext = quality === 'high' ? 55 : 42;
    Object.assign(this.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 260 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    // distant ranges
    this.ridges = new THREE.Group();
    this.ridgeMats = [];
    const r = rng(77);
    [[2400, 520, 0.25], [3300, 760, 0.45], [4300, 1050, 0.62]].forEach(([rad, amp, haze], li) => {
      const seg = 160, pos = [], aN = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const n = Math.abs(Math.sin(a * 3 + li) * 0.5 + Math.sin(a * 7.3 + li * 2) * 0.3 + Math.sin(a * 17.1 + li) * 0.15 + Math.sin(a * 41 + li) * 0.05);
        const h = 80 + n * amp * (0.6 + r() * 0.4);
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        pos.push(x, -700, z, x * 1.002, h, z * 1.002);
        aN.push(0, n);
        if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aN', new THREE.Float32BufferAttribute(aN, 1));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        vertexShader: ridgeVert, fragmentShader: ridgeFrag, side: THREE.DoubleSide, fog: false, depthWrite: true,
        uniforms: { uBase: { value: new THREE.Color(0x4a5058) }, uHaze: { value: new THREE.Color() }, uHazeAmt: { value: haze }, uSnow: { value: new THREE.Color(0xe8eef4) }, uSnowLine: { value: 300 + li * 150 } },
      });
      mat.userData.haze = haze;
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = -5; m.frustumCulled = false;
      this.ridges.add(m);
      this.ridgeMats.push(mat);
    });
    scene.add(this.ridges);

    // valley floor far below
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: 0x3a4430 }));
    this.floor.rotation.x = -Math.PI / 2;
    scene.add(this.floor);

    // weather particles around the camera
    this.weather = this.makeWeather(quality);
    scene.add(this.weather.snow, this.weather.rain, this.weather.dust);

    // birds
    this.birds = this.makeBirds();
    scene.add(this.birds.mesh);

    this.envTarget = null;
    this.lastEnvKey = '';
    this.look = null;
    this.tunnel = 0;
  }

  makeWeather(quality) {
    const n = quality === 'low' ? 700 : quality === 'high' ? 2600 : 1600;
    const box = 60;
    const mk = (count, size, color, opacity) => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * box;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ size, map: softSprite(), color, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
      const p = new THREE.Points(g, m); p.frustumCulled = false;
      return p;
    };
    const snow = mk(n, 0.22, 0xffffff, 0.9);
    const dust = mk(Math.round(n * 0.5), 0.7, 0xc8a27a, 0.35);
    const rc = Math.round(n * 0.8);
    const rp = new Float32Array(rc * 6);
    for (let i = 0; i < rc; i++) { const x = (Math.random() - 0.5) * box, y = (Math.random() - 0.5) * box, z = (Math.random() - 0.5) * box; rp.set([x, y, z, x, y - 0.6, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35, depthWrite: false }));
    rain.frustumCulled = false;
    return { snow, rain, dust, box, center: new THREE.Vector3() };
  }

  makeBirds() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -0.9, 0.1, -0.2, 0, 0, -0.1, 0, 0, 0.3, 0.9, 0.1, -0.2, 0, 0, -0.1], 3));
    g.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x1a1a1c, side: THREE.DoubleSide }), 16);
    mesh.frustumCulled = false;
    const birds = [];
    for (let i = 0; i < 16; i++) birds.push({ a: Math.random() * 6.28, r: 30 + Math.random() * 40, h: 25 + Math.random() * 25, sp: 0.15 + Math.random() * 0.1, ph: Math.random() * 6, flock: i < 9 ? 0 : 1 });
    return { mesh, birds, center: new THREE.Vector3(), m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler() };
  }

  // s: progress on the track, focus: world position the camera looks at
  update(dt, track, s, camera, focus, inTunnel = 0) {
    this.time += dt;
    const L = (this.look = lookAt(track, s));
    this.tunnel = lerp(this.tunnel, inTunnel, 1 - Math.exp(-dt * 4));
    const tun = this.tunnel;
    // sun direction
    const el = THREE.MathUtils.degToRad(L.sunElev), az = THREE.MathUtils.degToRad(L.sunAzim);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.sunDir = dir;
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(L.skyTop); u.uHorizon.value.copy(L.skyHorizon); u.uSunDir.value.copy(dir); u.uSun.value.copy(L.sun);
    u.uCloud.value = L.clouds; u.uCloudDark.value = L.cloudDark; u.uTime.value = this.time * (0.6 + L.wind);
    // lightning in storms
    if (L.storm > 0.3 && Math.random() < dt * 0.05 * L.storm) { this.flash = 1; this.events.push({ type: 'thunder', delay: 0.6 + Math.random() * 2.5, power: 0.5 + Math.random() * 0.5 }); }
    this.flash = Math.max(0, this.flash - dt * 5);
    const fl = this.flash > 0.5 ? this.flash : this.flash * 0.3;
    u.uFlash.value = fl * 0.35;
    this.sky.position.copy(camera.position);
    // fog
    this.scene.fog.color.copy(L.fog).lerp(new THREE.Color(0x1a1c1e), tun * 0.85);
    this.scene.fog.density = L.fogDensity * (1 + tun * 0.6);
    // lights
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunIntensity * (1 - tun * 0.92) * (1 - L.clouds * 0.25);
    this.hemi.color.copy(L.hemiSky); this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiIntensity * 1.7 * (1 - tun * 0.75) + fl * 1.5;
    this.sun.position.copy(focus).addScaledVector(dir, 120);
    this.sun.target.position.copy(focus);
    // snap shadow camera to texels to avoid shimmering
    // ridges + floor follow the camera
    this.ridges.position.set(camera.position.x, camera.position.y - 380, camera.position.z);
    for (const m of this.ridgeMats) {
      m.uniforms.uHaze.value.copy(L.skyHorizon).lerp(L.fog, 0.4);
      m.uniforms.uBase.value.copy(L.rock).multiplyScalar(0.55).lerp(L.hemiGround, 0.25);
      m.uniforms.uSnowLine.value = (L.snow > 0.5 ? 120 : 380) + this.ridgeMats.indexOf(m) * 140 - L.warmth * 200;
    }
    this.floor.position.set(camera.position.x, track.roadY(s) - 240, camera.position.z);
    this.floor.material.color.copy(L.grass).multiplyScalar(0.55).lerp(L.fog, 0.3);
    // weather
    this.updateWeather(dt, camera, L, tun);
    this.updateBirds(dt, camera, L, focus);
    // environment reflections, refreshed when the look changes enough
    const key = [L.skyTop.getHexString(), L.skyHorizon.getHexString(), Math.round(L.sunElev / 5)].join();
    if (key !== this.lastEnvKey && (this.time - (this.envTime || -99) > 2 || !this.envTarget)) {
      this.lastEnvKey = key; this.envTime = this.time;
      this.refreshEnvMap();
    }
  }

  refreshEnvMap() {
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const sc = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), this.skyMat);
    sc.add(sky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 16), new THREE.MeshBasicMaterial({ color: this.look ? this.look.hemiGround : 0x444444 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -8;
    sc.add(ground);
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(sc, 0.02);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.9;
    if (old) old.dispose();
    sky.geometry.dispose(); ground.geometry.dispose(); ground.material.dispose();
  }

  updateWeather(dt, camera, L, tun) {
    const W = this.weather, box = W.box, half = box / 2;
    const c = camera.position;
    const snowAmt = L.snow > 0.5 ? Math.max(L.snow > 0.9 ? 0.85 : 0.4, 0) * (1 - tun) : 0;
    const vis = (p, amt, baseOp) => { p.visible = amt > 0.02; p.material.opacity = baseOp * amt; };
    vis(W.snow, Math.max(snowAmt, 0), 0.9);
    vis(W.rain, (L.rain || 0) * (1 - tun), 0.35);
    vis(W.dust, (L.dust || 0) * (1 - tun) + L.warmth * 0.15 * (1 - tun), 0.3);
    const wind = L.wind;
    const step = (p, vy, vx, jitter) => {
      if (!p.visible) return;
      const a = p.geometry.attributes.position.array;
      const isLine = p.isLineSegments;
      const stride = isLine ? 6 : 3;
      for (let i = 0; i < a.length; i += stride) {
        let x = a[i] + vx * dt + (jitter ? Math.sin(this.time * 1.3 + i) * jitter * dt : 0), y = a[i + 1] + vy * dt, z = a[i + 2] + vx * 0.4 * dt;
        // wrap inside a box centred on the camera
        const rx = x - c.x, ry = y - c.y, rz = z - c.z;
        if (rx > half) x -= box; else if (rx < -half) x += box;
        if (ry < -half) y += box; else if (ry > half) y -= box;
        if (rz > half) z -= box; else if (rz < -half) z += box;
        a[i] = x; a[i + 1] = y; a[i + 2] = z;
        if (isLine) { a[i + 3] = x + vx * 0.03; a[i + 4] = y - 0.7; a[i + 5] = z; }
      }
      p.geometry.attributes.position.needsUpdate = true;
    };
    step(W.snow, -2.2, wind * 3, 1.2);
    step(W.rain, -22, wind * 4, 0);
    step(W.dust, 0.2, wind * 9, 2);
  }

  updateBirds(dt, camera, L, focus) {
    const B = this.birds;
    B.mesh.visible = L.birds > 0.3 && this.tunnel < 0.5;
    if (!B.mesh.visible) return;
    // flocks circle somewhere ahead of the camera
    const cx = focus.x + 60, cz = focus.z + 140;
    B.center.x = lerp(B.center.x, cx, 1 - Math.exp(-dt * 0.05));
    B.center.z = lerp(B.center.z, cz, 1 - Math.exp(-dt * 0.05));
    if (Math.abs(B.center.x - cx) > 400) B.center.set(cx, 0, cz);
    B.birds.forEach((b, i) => {
      b.a += b.sp * dt;
      const fx = b.flock ? -80 : 0;
      const x = B.center.x + fx + Math.cos(b.a) * b.r, z = B.center.z + Math.sin(b.a) * b.r, y = focus.y + b.h + Math.sin(this.time * 0.5 + b.ph) * 3;
      const flap = Math.sin(this.time * 9 + b.ph) * 0.6;
      B.e.set(0, -b.a, flap);
      B.q.setFromEuler(B.e);
      B.m4.compose(new THREE.Vector3(x, y, z), B.q, new THREE.Vector3(1.2, 1 + flap * 0.4, 1.2));
      B.mesh.setMatrixAt(i, B.m4);
    });
    B.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Small post-processing chain: the scene renders to a linear HDR target, bright parts
// bloom at two radii, then one composite pass does ACES (same curve as the renderer's),
// a gentle grade (warmth, contrast, saturation), vignette and the sRGB encode.
// Quality 'low' skips all of it and renders straight to the screen.
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThr, uThr * 2.2, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR = `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tSrc, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692).rgb * 0.0702703;
  c += texture2D(tSrc, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMP = `uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2;
uniform float uExposure, uBloom, uWarm, uContrast, uSat, uVig;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color) {
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure * 1.05 / 0.6;
  return clamp(O * RRTAndODTFit(I * color), 0.0, 1.0);
}
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(tB1, vUv).rgb * 0.6 + texture2D(tB2, vUv).rgb * 0.55;
  c += b * uBloom;
  c = aces(c);
  // grade: a touch of warmth in the highlights, cool shadows, contrast, saturation
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += vec3(0.035, 0.012, -0.03) * uWarm * smoothstep(0.35, 0.9, l) + vec3(-0.012, 0.0, 0.02) * uWarm * (1.0 - smoothstep(0.0, 0.35, l));
  c = mix(vec3(l), c, uSat);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVig * dot(q, q) * 1.6;
  gl_FragColor = vec4(srgb(c), 1.0);
}`;

export class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.enabled = quality !== 'low';
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mk(BRIGHT, { tSrc: { value: null }, uThr: { value: 1.0 } });
    this.mBlur = mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mComp = mk(COMP, {
      tScene: { value: null }, tB1: { value: null }, tB2: { value: null },
      uExposure: { value: 1.0 }, uBloom: { value: 0.55 }, uWarm: { value: 1.0 }, uContrast: { value: 1.06 }, uSat: { value: 1.08 }, uVig: { value: 0.32 },
    });
    this.w = 0; this.h = 0;
  }

  setSize(w, h) {
    if (!this.enabled) return;
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    for (const t of [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD]) if (t) t.dispose();
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 2 });
    this.rtA = new THREE.WebGLRenderTarget(w >> 2, h >> 2, opt);
    this.rtB = new THREE.WebGLRenderTarget(w >> 2, h >> 2, opt);
    this.rtC = new THREE.WebGLRenderTarget(w >> 3, h >> 3, opt);
    this.rtD = new THREE.WebGLRenderTarget(w >> 3, h >> 3, opt);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  blur(src, tmp, w, h) {
    this.mBlur.uniforms.tSrc.value = src.texture; this.mBlur.uniforms.uDir.value.set(1 / w, 0); this.pass(this.mBlur, tmp);
    this.mBlur.uniforms.tSrc.value = tmp.texture; this.mBlur.uniforms.uDir.value.set(0, 1 / h); this.pass(this.mBlur, src);
  }

  // look: optional per-map grading { bloom, warm, contrast, sat, vig }
  render(scene, camera, look) {
    const r = this.r;
    if (!this.enabled) { r.render(scene, camera); return; }
    const size = r.getDrawingBufferSize(this._v || (this._v = new THREE.Vector2()));
    this.setSize(size.x, size.y);
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    // bloom: bright pass at 1/4, blurred; again at 1/8 for the wide glow
    this.mBright.uniforms.tSrc.value = this.rtScene.texture;
    this.pass(this.mBright, this.rtA);
    this.blur(this.rtA, this.rtB, this.rtA.width, this.rtA.height);
    this.mBlur.uniforms.tSrc.value = this.rtA.texture; this.mBlur.uniforms.uDir.value.set(0, 0); this.pass(this.mBlur, this.rtC);
    this.blur(this.rtC, this.rtD, this.rtC.width, this.rtC.height);
    this.blur(this.rtC, this.rtD, this.rtC.width, this.rtC.height);
    const u = this.mComp.uniforms;
    u.tScene.value = this.rtScene.texture; u.tB1.value = this.rtA.texture; u.tB2.value = this.rtC.texture;
    u.uExposure.value = r.toneMappingExposure;
    const L = look || {};
    u.uBloom.value = L.bloom ?? 0.55; u.uWarm.value = L.warm ?? 1; u.uContrast.value = L.contrast ?? 1.06; u.uSat.value = L.sat ?? 1.08; u.uVig.value = L.vig ?? 0.32;
    this.pass(this.mComp, null);
    r.toneMapping = tm;
  }
}

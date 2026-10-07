// Comic emotes over a character's head: "!", "?", anger vein, hearts, rain cloud,
// sweat drop, puffs of steam, sparkles. Drawn once to canvases, shown as sprites.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { clamp, easeOut } from '../core/util.js';

const INK = '#221a15';
const texCache = new Map();

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function burst(g, r1, r2, n, fill) {
  g.fillStyle = fill; g.strokeStyle = INK; g.lineWidth = 7;
  g.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r1 : r2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.18);
  }
  g.closePath(); g.fill(); g.stroke();
}

function heart(g, x, y, s, fill) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath();
  g.moveTo(0, 14);
  g.bezierCurveTo(-26, -4, -16, -26, 0, -12);
  g.bezierCurveTo(16, -26, 26, -4, 0, 14);
  g.closePath();
  g.fillStyle = fill; g.strokeStyle = INK; g.lineWidth = 4 / s;
  g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.beginPath(); g.ellipse(-8, -10, 4, 2.5, -0.6, 0, Math.PI * 2); g.fill();
  g.restore();
}

const DRAW = {
  '!': [128, 192, (g) => {
    g.translate(64, 92);
    burst(g, 44, 60, 14, '#f2cf7c');
    g.fillStyle = '#7a2a26'; g.strokeStyle = INK; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-13, -50); g.lineTo(13, -50); g.lineTo(7, 18); g.lineTo(-7, 18); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 40, 11, 0, Math.PI * 2); g.fill(); g.stroke();
  }],
  '?': [128, 192, (g) => {
    g.translate(64, 92);
    burst(g, 46, 56, 10, '#e9e1cf');
    g.strokeStyle = INK; g.lineWidth = 20;
    g.beginPath(); g.arc(0, -18, 22, Math.PI * 1.05, Math.PI * 2.35); g.lineTo(0, 16); g.stroke();
    g.strokeStyle = '#24344d'; g.lineWidth = 11;
    g.beginPath(); g.arc(0, -18, 22, Math.PI * 1.05, Math.PI * 2.35); g.lineTo(0, 16); g.stroke();
    g.fillStyle = '#24344d'; g.strokeStyle = INK; g.lineWidth = 5;
    g.beginPath(); g.arc(0, 40, 10, 0, Math.PI * 2); g.fill(); g.stroke();
  }],
  anger: [160, 160, (g) => {
    // the classic four-part forehead vein
    g.translate(80, 80);
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4);
      g.beginPath();
      g.moveTo(10, -24); g.quadraticCurveTo(16, -10, 32, -8); g.lineTo(32, 8); g.quadraticCurveTo(12, 6, 8, -8); g.closePath();
      g.restore();
    }
    g.fillStyle = '#d2382e'; g.strokeStyle = INK; g.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4);
      g.beginPath();
      g.moveTo(8, -30); g.quadraticCurveTo(12, -8, 34, -6); g.lineTo(36, 10); g.quadraticCurveTo(4, 8, -4, -26); g.closePath();
      g.fill(); g.stroke();
      g.restore();
    }
  }],
  hearts: [192, 160, (g) => {
    heart(g, 60, 90, 2.0, '#e0455a');
    heart(g, 128, 62, 1.5, '#f06a7e');
    heart(g, 150, 118, 1.0, '#e0455a');
  }],
  cloud: [192, 176, (g) => {
    // little rain cloud
    g.strokeStyle = '#3d6f9e'; g.lineWidth = 6;
    for (const [x, y] of [[62, 110], [96, 124], [130, 108], [78, 146], [116, 150]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 16); g.stroke(); }
    g.fillStyle = '#7c8794'; g.strokeStyle = INK; g.lineWidth = 6;
    g.beginPath();
    g.arc(60, 76, 26, Math.PI * 0.5, Math.PI * 1.5);
    g.arc(92, 52, 32, Math.PI * 1.05, Math.PI * 1.95);
    g.arc(134, 70, 28, Math.PI * 1.3, Math.PI * 0.5);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.25)';
    g.beginPath(); g.ellipse(84, 44, 16, 7, -0.3, 0, Math.PI * 2); g.fill();
  }],
  sweat: [96, 128, (g) => {
    g.translate(48, 70);
    g.beginPath();
    g.moveTo(0, -46); g.bezierCurveTo(14, -18, 30, 0, 30, 18); g.arc(0, 18, 30, 0, Math.PI); g.bezierCurveTo(-30, 0, -14, -18, 0, -46);
    g.fillStyle = '#8fc8ec'; g.strokeStyle = INK; g.lineWidth = 6; g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-10, 10, 6, 11, 0.4, 0, Math.PI * 2); g.fill();
  }],
  steam: [128, 128, (g) => {
    g.fillStyle = '#f3efe8'; g.strokeStyle = 'rgba(34,26,21,.55)'; g.lineWidth = 5;
    for (const [x, y, r] of [[64, 74, 30], [40, 60, 20], [88, 56, 22], [64, 38, 20]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = '#f3efe8';
    for (const [x, y, r] of [[64, 74, 26], [40, 60, 16], [88, 56, 18], [64, 38, 16]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }],
  sparkle: [160, 160, (g) => {
    const star = (x, y, r, c) => {
      g.save(); g.translate(x, y);
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const rr = i % 2 ? r * 0.28 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = c; g.strokeStyle = INK; g.lineWidth = 4; g.fill(); g.stroke(); g.restore();
    };
    star(70, 86, 46, '#f2cf7c'); star(126, 46, 26, '#fff3cf'); star(124, 122, 18, '#f2cf7c');
  }],
};

function texture(type) {
  if (!texCache.has(type)) { const [w, h, d] = DRAW[type] || DRAW['!']; texCache.set(type, { t: canvas(w, h, d), aspect: w / h }); }
  return texCache.get(type);
}

// per type: size, height above the head, sideways offset, sound
const STYLE = {
  '!': { size: 0.34, y: 0.17, x: 0, snd: 'exclaim' },
  '?': { size: 0.26, y: 0.17, x: 0, snd: 'question' },
  anger: { size: 0.17, y: 0.07, x: 0.09, snd: 'angerPop' },
  hearts: { size: 0.26, y: 0.16, x: 0.02, snd: 'hearts', float: true },
  cloud: { size: 0.3, y: 0.2, x: 0, snd: 'sadTrombone', loop: true },
  sweat: { size: 0.1, y: 0.04, x: -0.1, snd: null, drip: true },
  steam: { size: 0.12, y: 0.0, x: 0.1, snd: 'steam', puff: true },
  sparkle: { size: 0.24, y: 0.16, x: 0, snd: 'sparkle' },
};

export class Exclaim {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  // pop an emote over `ch` for `dur` seconds
  show(ch, dur = 1.4, type = '!') {
    const st = STYLE[type] || STYLE['!'];
    const tx = texture(type);
    const mk = () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.t, depthTest: false, transparent: true, toneMapped: false }));
      s.renderOrder = 30;
      s.center.set(0.5, 0);
      this.scene.add(s);
      return s;
    };
    const e = { s: mk(), ch, t: 0, dur, type, st, aspect: tx.aspect };
    // steam comes out of both ears
    if (st.puff) e.s2 = mk();
    this.list.push(e);
    if (st.snd) audio[st.snd]?.();
    return e;
  }

  clear(ch) { for (const e of this.list) if (!ch || e.ch === ch) e.t = Math.max(e.t, e.dur - 0.2); }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i], st = e.st;
      e.t += dt;
      const t = e.t;
      const head = e.ch.headWorld(new THREE.Vector3());
      const q = e.ch.root.quaternion;
      // jump in with an overshoot, wobble, then shrink away
      const pop = t < 0.35 ? easeOut(t / 0.35) * (1 + 0.35 * Math.sin((t / 0.35) * Math.PI)) : 1;
      const out = clamp((e.dur - t) / 0.2, 0, 1);
      let sc = st.size * pop * out;
      let y = st.y + Math.sin(t * 9) * 0.008 * out;
      let x = st.x;
      if (e.type === 'anger') sc *= 1 + 0.18 * Math.max(0, Math.sin(t * 16));   // throbbing
      if (st.float) y += t * 0.05;
      if (st.drip) y -= Math.min(0.06, t * 0.03);
      if (st.puff) { const k = (t * 2.2) % 1; sc *= 0.5 + k; y += k * 0.12; e.s.material.opacity = e.s2.material.opacity = (1 - k) * out; }
      e.s.scale.set(sc * e.aspect, sc, 1);
      e.s.position.copy(head).add(new THREE.Vector3(x, y, 0).applyQuaternion(q));
      e.s.material.rotation = e.type === 'anger' ? 0 : Math.sin(t * 14) * 0.12 * Math.exp(-t * 3);
      if (e.s2) {
        e.s2.scale.copy(e.s.scale);
        e.s2.position.copy(head).add(new THREE.Vector3(-x, y, 0).applyQuaternion(q));
      }
      if (t >= e.dur) {
        this.scene.remove(e.s); e.s.material.dispose();
        if (e.s2) { this.scene.remove(e.s2); e.s2.material.dispose(); }
        this.list.splice(i, 1);
      }
    }
  }
}

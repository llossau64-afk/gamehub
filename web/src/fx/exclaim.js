// A big comic "!" that pops up over a character's head.
import * as THREE from 'three';
import { audio } from '../audio/audio.js';
import { clamp, easeOut } from '../core/util.js';

let tex = null;
function texture() {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  // burst behind the mark
  g.translate(64, 92);
  g.fillStyle = '#f2cf7c';
  g.strokeStyle = '#221a15';
  g.lineWidth = 7;
  g.beginPath();
  const n = 14;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 44 : 60;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 1.18);
  }
  g.closePath();
  g.fill(); g.stroke();
  // the mark
  g.fillStyle = '#7a2a26';
  g.strokeStyle = '#221a15';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(-13, -50); g.lineTo(13, -50); g.lineTo(7, 18); g.lineTo(-7, 18); g.closePath();
  g.fill(); g.stroke();
  g.beginPath(); g.arc(0, 40, 11, 0, Math.PI * 2); g.fill(); g.stroke();
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Exclaim {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  // pop a "!" over `ch` for `dur` seconds
  show(ch, dur = 1.4) {
    const mat = new THREE.SpriteMaterial({ map: texture(), depthTest: false, transparent: true, toneMapped: false });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 30;
    s.center.set(0.5, 0);
    this.scene.add(s);
    this.list.push({ s, ch, t: 0, dur });
    audio.exclaim?.();
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      const t = e.t;
      const head = e.ch.headWorld(new THREE.Vector3());
      // jump in with an overshoot, wobble, then shrink away
      const pop = t < 0.35 ? easeOut(t / 0.35) * (1 + 0.35 * Math.sin((t / 0.35) * Math.PI)) : 1;
      const out = clamp((e.dur - t) / 0.2, 0, 1);
      const sc = 0.34 * pop * out;
      e.s.scale.set(sc * 0.667, sc, 1);
      e.s.position.copy(head).add(new THREE.Vector3(0, 0.17 + Math.sin(t * 9) * 0.008 * out, 0));
      e.s.material.rotation = Math.sin(t * 14) * 0.12 * Math.exp(-t * 3);
      if (t >= e.dur) { this.scene.remove(e.s); e.s.material.dispose(); this.list.splice(i, 1); }
    }
  }
}

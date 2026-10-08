// Keyboard, touch and gamepad input merged into one analogue driving state.

import { clamp } from './util.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: 0, right: 0, gas: 0, brake: 0, boost: 0, hand: 0 };
    this.steer = 0;
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: 0, boost: 0 };
    this.pressed = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.lastDevice = this.isTouch ? 'touch' : 'keyboard';
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code); this.lastDevice = 'keyboard';
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && e.target === document.body) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); for (const k in this.touch) this.touch[k] = 0; });
  }

  bindTouch(root) {
    const map = { left: 'left', right: 'right', gas: 'gas', brake: 'brake', boost: 'boost', hand: 'hand' };
    root.querySelectorAll('[data-touch]').forEach((el) => {
      const k = map[el.dataset.touch];
      const on = (e) => { e.preventDefault(); this.touch[k] = 1; el.classList.add('on'); this.lastDevice = 'touch'; if (navigator.vibrate && k !== 'gas') navigator.vibrate(8); };
      const off = (e) => { e.preventDefault(); this.touch[k] = 0; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(...codes) { return codes.some((c) => this.pressed.has(c)); }

  update(dt) {
    const k = this;
    let thr = k.down('KeyW', 'ArrowUp') ? 1 : 0;
    let brk = k.down('KeyS', 'ArrowDown') ? 1 : 0;
    let left = k.down('KeyA', 'ArrowLeft') ? 1 : 0;
    let right = k.down('KeyD', 'ArrowRight') ? 1 : 0;
    let hand = k.down('Space') ? 1 : 0;
    let boost = k.down('ShiftLeft', 'ShiftRight') ? 1 : 0;
    const t = this.touch;
    thr = Math.max(thr, t.gas); brk = Math.max(brk, t.brake); left = Math.max(left, t.left); right = Math.max(right, t.right);
    hand = Math.max(hand, t.hand); boost = Math.max(boost, t.boost);
    let analog = null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) { analog = -ax; this.lastDevice = 'gamepad'; }
      const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05 || lt > 0.05) this.lastDevice = 'gamepad';
      thr = Math.max(thr, rt, p.buttons[0] && p.buttons[0].pressed ? 1 : 0);
      brk = Math.max(brk, lt);
      if (p.buttons[1] && p.buttons[1].pressed) hand = 1;
      if (p.buttons[2] && p.buttons[2].pressed) boost = 1;
      if (p.buttons[3] && p.buttons[3].pressed && !this._padCam) this.pressed.add('KeyC');
      this._padCam = p.buttons[3] && p.buttons[3].pressed;
      if (p.buttons[9] && p.buttons[9].pressed && !this._padStart) this.pressed.add('Escape');
      this._padStart = p.buttons[9] && p.buttons[9].pressed;
    }
    // keyboard steering: quick ramp, faster return to centre
    const target = analog !== null ? analog : left - right;
    const rate = Math.sign(target) !== Math.sign(this.steer) || target === 0 ? 7 : 3.6;
    if (analog !== null) this.steer = target;
    else {
      const d = target - this.steer;
      this.steer += clamp(d, -rate * dt, rate * dt);
    }
    const s = this.state;
    s.throttle = thr; s.brake = brk; s.steer = clamp(this.steer, -1, 1); s.handbrake = hand; s.boost = boost;
    return s;
  }
  endFrame() { this.pressed.clear(); }
}

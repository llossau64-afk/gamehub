// Unified keyboard / mouse / touch input.
// Modes: 'fp' (first person look + move), 'pointer' (free cursor, barber mode), 'ui' (menus)
import * as THREE from 'three';

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Input {
  constructor(canvas, root) {
    this.canvas = canvas;
    this.root = root;
    this.mode = 'ui';
    this.keys = new Set();
    this.justKeys = new Set();
    this.move = new THREE.Vector2();
    this.look = new THREE.Vector2();
    this.wheel = 0;
    this.pointer = { x: 0, y: 0, px: 0, py: 0, down: false, justDown: false, justUp: false, button: 0, right: false,
      dragDX: 0, dragDY: 0, onCanvas: false, touch: false };
    this.virtual = new Set();      // actions pressed by on-screen buttons this frame
    this.virtualHeld = new Set();
    this.touch = isTouch();
    this.sensitivity = 1;
    this.locked = false;
    this.pinch = 0;
    this._bind();
    if (this.touch) this._buildTouchControls();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justKeys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.pointer.down = false; });
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (this.touch && e.sourceCapabilities?.firesTouchEvents) return;
      if (this.mode === 'fp' && !this.locked && !this.touch) { this.requestLock(); return; }
      if (e.button === 2) { this.pointer.right = true; return; }
      this.pointer.down = true; this.pointer.justDown = true; this.pointer.button = e.button;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) { this.pointer.right = false; return; }
      if (this.pointer.down) this.pointer.justUp = true;
      this.pointer.down = false;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.look.x += e.movementX; this.look.y += e.movementY;
      } else {
        this._setPointer(e.clientX, e.clientY);
        if (this.pointer.down || this.pointer.right) { this.pointer.dragDX += e.movementX; this.pointer.dragDY += e.movementY; }
      }
    });
    c.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
    });
    // touch on canvas = pointer (barber mode) or look (fp mode)
    this._touchLook = null;
    this._pinchStart = null;
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.mode === 'fp') {
          if (!this._touchLook) this._touchLook = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 };
        } else if (this.mode === 'pointer') {
          if (e.touches.length === 2) {
            const [a, b] = e.touches;
            this._pinchStart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            this.pointer.down = false;
          } else if (!this._pointerTouch) {
            this._pointerTouch = t.identifier;
            this.pointer.touch = true;
            this._setPointer(t.clientX, t.clientY);
            this.pointer.down = true; this.pointer.justDown = true;
          }
        }
      }
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this._pinchStart && e.touches.length === 2) {
        const [a, b] = e.touches;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        this.pinch += (this._pinchStart - d) * 0.01;
        this._pinchStart = d;
        return;
      }
      for (const t of e.changedTouches) {
        if (this._touchLook && t.identifier === this._touchLook.id) {
          const dx = t.clientX - this._touchLook.x, dy = t.clientY - this._touchLook.y;
          this.look.x += dx * 1.6; this.look.y += dy * 1.6;
          this._touchLook.moved += Math.abs(dx) + Math.abs(dy);
          this._touchLook.x = t.clientX; this._touchLook.y = t.clientY;
        }
        if (t.identifier === this._pointerTouch) {
          const ox = this.pointer.px, oy = this.pointer.py;
          this._setPointer(t.clientX, t.clientY);
          this.pointer.dragDX += this.pointer.px - ox; this.pointer.dragDY += this.pointer.py - oy;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this._touchLook && t.identifier === this._touchLook.id) {
          // a quick tap in fp mode interacts with what is in front of you
          if (this._touchLook.moved < 12 && performance.now() - this._touchLook.t0 < 260) this.virtual.add('tap');
          this._touchLook = null;
        }
        if (t.identifier === this._pointerTouch) {
          this._pointerTouch = null;
          if (this.pointer.down) this.pointer.justUp = true;
          this.pointer.down = false;
        }
      }
      if (e.touches.length < 2) this._pinchStart = null;
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);
  }

  _setPointer(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.px = cx - r.left; this.pointer.py = cy - r.top;
    this.pointer.x = ((cx - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((cy - r.top) / r.height) * 2 + 1;
    this.pointer.onCanvas = true;
  }

  requestLock() {
    if (this.touch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  setMode(m) {
    this.mode = m;
    if (m !== 'fp') this.exitLock();
    if (this.touchEl) {
      this.touchEl.classList.toggle('show-fp', m === 'fp');
    }
    this.pointer.down = false;
    this.keys.clear();
  }

  // ------------------------------------------------------------------ touch controls
  _buildTouchControls() {
    const el = document.createElement('div');
    el.className = 'touch-controls';
    el.innerHTML = `<div class="joy"><div class="joy-base"><div class="joy-knob"></div></div></div>`;
    this.root.appendChild(el);
    this.touchEl = el;
    const joy = el.querySelector('.joy'), knob = el.querySelector('.joy-knob'), base = el.querySelector('.joy-base');
    let id = null, cx = 0, cy = 0;
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = joy.getBoundingClientRect();
      cx = t.clientX; cy = t.clientY;
      base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px';
      base.classList.add('active');
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const m = Math.hypot(dx, dy), max = 46;
        if (m > max) { dx *= max / m; dy *= max / m; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this._joy = { x: dx / max, y: dy / max };
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null; this._joy = null; knob.style.transform = ''; base.classList.remove('active');
      }
    };
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);
  }

  press(action) { this.virtual.add(action); }
  hold(action, on) { if (on) this.virtualHeld.add(action); else this.virtualHeld.delete(action); }

  // ------------------------------------------------------------------ queries
  key(code) { return this.keys.has(code); }
  pressed(action) {
    const map = ACTIONS[action] || [];
    for (const k of map) if (this.justKeys.has(k)) return true;
    return this.virtual.has(action);
  }
  held(action) {
    const map = ACTIONS[action] || [];
    for (const k of map) if (this.keys.has(k)) return true;
    return this.virtualHeld.has(action);
  }

  update() {
    // movement vector
    let x = 0, y = 0;
    if (this.mode === 'fp') {
      if (this.held('left')) x -= 1;
      if (this.held('right')) x += 1;
      if (this.held('forward')) y += 1;
      if (this.held('back')) y -= 1;
      if (this._joy) { x += this._joy.x; y -= this._joy.y; }
    }
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
  }

  endFrame() {
    this.justKeys.clear();
    this.virtual.clear();
    this.look.set(0, 0);
    this.wheel = 0;
    this.pinch = 0;
    this.pointer.justDown = false;
    this.pointer.justUp = false;
    this.pointer.dragDX = 0; this.pointer.dragDY = 0;
  }
}

const ACTIONS = {
  forward: ['KeyW', 'ArrowUp', 'KeyZ'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft', 'KeyQ'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE', 'Enter'],
  pause: ['Escape', 'KeyP'],
  tool1: ['Digit1'], tool2: ['Digit2'], tool3: ['Digit3'], tool4: ['Digit4'], tool5: ['Digit5'],
  guardDown: ['KeyQ'], guardUp: ['KeyE'],
  power: ['Space'],
  finish: ['KeyF'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  skip: ['Space', 'Enter', 'Escape'],
  upgrades: ['KeyU', 'Tab'],
  orbitLeft: ['KeyA', 'ArrowLeft'], orbitRight: ['KeyD', 'ArrowRight'],
  orbitUp: ['KeyW', 'ArrowUp'], orbitDown: ['KeyS', 'ArrowDown'],
};

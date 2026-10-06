// Unified input: keyboard + mouse, touch (floating joystick + buttons), gamepad.
// Everything is read synchronously every frame, so there is no queued latency.

export const input = {
  move: { x: 0, z: 0 },
  aimScreen: null,          // {x,y} in CSS px while the mouse is being used
  mouseActive: false,
  attackHeld: false,
  attackPressed: false,     // edge, consumed per frame
  dashPressed: false,
  pausePressed: false,
  confirmPressed: false,
  anyPressed: false,
  touchMode: false,
  gpAim: null,              // right-stick aim {x,z}
  keys: new Set(),
  lastDevice: 'keyboard',
};

const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, el: null, knob: null };
const btn = { attack: null, dash: null, attackId: null };
let gpPrev = {};

export function initInput(canvas, ui) {
  const k = input.keys;
  const onKey = (e, down) => {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code) && !isTyping(e)) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      k.add(code);
      input.anyPressed = true;
      input.lastDevice = 'keyboard';
      if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyK') input.dashPressed = true;
      if (code === 'KeyJ') input.attackPressed = true;
      if (code === 'Escape' || code === 'KeyP') input.pausePressed = true;
      if (code === 'Enter' || code === 'NumpadEnter') input.confirmPressed = true;
    } else k.delete(code);
  };
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  window.addEventListener('blur', () => { k.clear(); input.attackHeld = false; });

  canvas.addEventListener('mousemove', e => {
    input.aimScreen = { x: e.clientX, y: e.clientY };
    input.mouseActive = true;
    input.lastDevice = 'mouse';
    if (input.touchMode) setTouchMode(false);
  });
  canvas.addEventListener('mousedown', e => {
    input.anyPressed = true;
    input.aimScreen = { x: e.clientX, y: e.clientY };
    input.mouseActive = true;
    if (e.button === 0) { input.attackHeld = true; input.attackPressed = true; }
    if (e.button === 2) input.dashPressed = true;
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) input.attackHeld = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ----- touch -----
  joy.el = document.getElementById('joy');
  joy.knob = document.getElementById('joy-knob');
  btn.attack = document.getElementById('btn-attack');
  btn.dash = document.getElementById('btn-dash');

  const touchZone = document.getElementById('touch-zone');
  touchZone.addEventListener('touchstart', e => {
    e.preventDefault();
    setTouchMode(true);
    input.anyPressed = true;
    for (const t of e.changedTouches) {
      if (joy.id === null && t.clientX < window.innerWidth * 0.55) {
        joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.x = 0; joy.y = 0;
        joy.el.style.transform = `translate(${t.clientX}px, ${t.clientY}px)`;
        joy.el.classList.add('on');
        joy.knob.style.transform = 'translate(-50%, -50%)';
      }
    }
  }, { passive: false });
  const moveJoy = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joy.id) continue;
      e.preventDefault();
      let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
      const R = 52, d = Math.hypot(dx, dy);
      if (d > R) {
        // Drag the base along so the stick never "runs out".
        const over = d - R;
        joy.ox += dx / d * over; joy.oy += dy / d * over;
        dx = t.clientX - joy.ox; dy = t.clientY - joy.oy;
        joy.el.style.transform = `translate(${joy.ox}px, ${joy.oy}px)`;
      }
      joy.x = dx / R; joy.y = dy / R;
      joy.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  };
  const endJoy = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joy.id) continue;
      joy.id = null; joy.x = 0; joy.y = 0;
      joy.el.classList.remove('on');
    }
  };
  touchZone.addEventListener('touchmove', moveJoy, { passive: false });
  touchZone.addEventListener('touchend', endJoy);
  touchZone.addEventListener('touchcancel', endJoy);

  const press = (el, onDown, onUp) => {
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); setTouchMode(true); el.classList.add('down'); onDown(e); }, { passive: false });
    const up = e => { e.preventDefault(); el.classList.remove('down'); onUp && onUp(e); };
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    // Allow testing the buttons with a mouse too.
    el.addEventListener('mousedown', e => { e.preventDefault(); el.classList.add('down'); onDown(e); });
    el.addEventListener('mouseup', e => { el.classList.remove('down'); onUp && onUp(e); });
    el.addEventListener('mouseleave', e => { if (el.classList.contains('down')) { el.classList.remove('down'); onUp && onUp(e); } });
  };
  press(btn.attack, () => { input.attackHeld = true; input.attackPressed = true; }, () => { input.attackHeld = false; });
  press(btn.dash, () => { input.dashPressed = true; });

  // Block page gestures (pinch, double-tap zoom, pull to refresh) during play.
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());

  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) setTouchMode(true);
}

function isTyping(e) { return e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'); }

function setTouchMode(on) {
  if (input.touchMode === on) return;
  input.touchMode = on;
  document.body.classList.toggle('touch', on);
  if (on) { input.mouseActive = false; input.aimScreen = null; input.lastDevice = 'touch'; }
}

export function pollInput() {
  const k = input.keys;
  let x = 0, z = 0;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
  if (k.has('KeyJ')) input.attackHeldKey = true; else input.attackHeldKey = false;

  if (joy.id !== null) {
    const m = Math.hypot(joy.x, joy.y);
    if (m > 0.18) { const s = Math.min(1, (m - 0.18) / 0.62) / m; x = joy.x * s; z = joy.y * s; }
  }

  // Gamepad
  input.gpAim = null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const ax = gp.axes[0] || 0, az = gp.axes[1] || 0;
    if (Math.hypot(ax, az) > 0.22) { x = ax; z = az; input.lastDevice = 'gamepad'; }
    const rx = gp.axes[2] || 0, rz = gp.axes[3] || 0;
    if (Math.hypot(rx, rz) > 0.35) input.gpAim = { x: rx, z: rz };
    const b = i => gp.buttons[i] && gp.buttons[i].pressed;
    const edge = (i) => { const p = b(i), was = gpPrev[i]; gpPrev[i] = p; return p && !was; };
    const attack = b(2) || b(7) || b(0);
    if (attack && !input._gpAttack) input.attackPressed = true;
    input._gpAttack = attack;
    if (edge(1) || edge(5) || edge(6)) input.dashPressed = true;
    if (edge(9)) input.pausePressed = true;
    if (edge(0)) input.confirmPressed = true;
    if (attack || Math.hypot(ax, az) > 0.22) input.anyPressed = input.anyPressed || attack;
    break;
  }

  const m = Math.hypot(x, z);
  if (m > 1) { x /= m; z /= m; }
  input.move.x = x; input.move.z = z;
}

export function wantsAttack() { return input.attackHeld || input.attackHeldKey || input._gpAttack; }

export function endFrame() {
  input.attackPressed = false;
  input.dashPressed = false;
  input.pausePressed = false;
  input.confirmPressed = false;
  input.anyPressed = false;
}

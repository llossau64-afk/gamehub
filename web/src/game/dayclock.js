// Shop hours: the day starts when you flip the sign to OPEN at 8:00 and runs to 21:00.
// One game hour lasts ~45 real seconds. The sun moves, the sky goes from morning to
// golden hour to dusk, and the street lamps come on. At closing time no new customers
// come in; once the last one is gone the day ends.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { audio } from '../audio/audio.js';

export const OPEN_H = 8, CLOSE_H = 21;
const SEC_PER_HOUR = 45;

const KEYS = [
  // hour, sky top, horizon, sun colour, sun intensity, hemi intensity
  [7, '#9fb4c8', '#f2d3b0', '#ffd3a0', 0.55, 0.42],
  [10, '#86a9c9', '#eedbbf', '#fff0d8', 0.95, 0.56],
  [14, '#7ca3c8', '#ecdcc4', '#fff4e2', 1.05, 0.6],
  [18, '#8a9bb8', '#f0c591', '#ffc27a', 0.8, 0.5],
  [20, '#5d6489', '#e59a66', '#ff9a5a', 0.45, 0.36],
  [21.5, '#283456', '#8a5f6a', '#6f7cb0', 0.12, 0.24],
];
const _a = new THREE.Color(), _b = new THREE.Color();

export class DayClock {
  constructor(game) {
    this.game = game;
    this.hour = OPEN_H;
    this.open = false;
    this.closing = false;
    this.shownHour = -1;
  }

  get label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60 / 15) * 15;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // morning before opening: light, sign says CLOSED
  morning() {
    this.hour = OPEN_H - 0.25;
    this.open = false;
    this.closing = false;
    this.applyLight();
    this.game.ui.setClock?.(this.label, false, 0);
  }

  openShop() {
    if (this.open) return;
    this.open = true;
    this.closing = false;
    this.hour = OPEN_H;
    audio.bell(1);
    this.game.shop.setOpenSign?.(true);
    this.game.ui.banner('Open for business', `Day ${this.game.save.day}`, 'Doors open 08:00 — close 21:00', 2000);
  }

  update(dt) {
    const g = this.game;
    if (this.open && g.state !== 'menu' && g.state !== 'intro' && !g.paused) {
      // the clock runs a bit slower while you cut, so a haircut doesn't eat the afternoon
      const k = g.state === 'barber' ? 0.6 : 1;
      this.hour = Math.min(CLOSE_H + 1.5, this.hour + dt * k / SEC_PER_HOUR);
      if (this.hour >= CLOSE_H && !this.closing) {
        this.closing = true;
        g.customers.enabled = false;
        audio.bell(0.7);
        g.ui.toast('21:00 — closing time. Finish the last customers.', 'Closing');
        g.shop.setOpenSign?.(false);
      }
      if (this.closing && g.state === 'play' && !g.customers.list.length && !g.customers.inChair) {
        this.open = false;
        g.endOfDay();
      }
    }
    // every full game hour the day is saved (local + this link's cloud save)
    if (this.open && Math.floor(this.hour) !== this.savedHour) { if (this.savedHour !== undefined) g.persist(); this.savedHour = Math.floor(this.hour); }
    if (Math.floor(this.hour * 4) !== this.shownHour) {
      this.shownHour = Math.floor(this.hour * 4);
      this.applyLight();
      g.ui.setClock?.(this.label, this.open, clamp((this.hour - OPEN_H) / (CLOSE_H - OPEN_H), 0, 1), this.closing);
    }
  }

  applyLight() {
    const shop = this.game.shop;
    const h = this.hour;
    let i = 0;
    while (i < KEYS.length - 2 && h > KEYS[i + 1][0]) i++;
    const A = KEYS[i], B = KEYS[i + 1];
    const t = clamp((h - A[0]) / (B[0] - A[0]), 0, 1);
    const sky = shop.sky?.material?.uniforms;
    if (sky) {
      sky.top.value.copy(_a.set(A[1]).lerp(_b.set(B[1]), t));
      sky.mid.value.copy(_a.set(A[2]).lerp(_b.set(B[2]), t));
      sky.bot.value.copy(sky.mid.value).multiplyScalar(0.75);
    }
    if (shop.scene.fog) shop.scene.fog.color.copy(_a.set(A[2]).lerp(_b.set(B[2]), t));
    if (shop.sun) {
      shop.sun.color.copy(_a.set(A[3]).lerp(_b.set(B[3]), t));
      shop.sun.intensity = lerp(A[4], B[4], t);
      // east in the morning, west in the evening, low at both ends
      const ang = (clamp((h - 6) / 15, 0, 1) - 0.5) * Math.PI * 0.9;
      const el = Math.max(0.25, Math.cos(ang) * 1.0);
      shop.sun.position.set(Math.sin(ang) * 9, el * 7, 8);
    }
    if (shop.hemi) shop.hemi.intensity = lerp(A[5], B[5], t);
    // street lamps and the window glow come on at dusk
    const dusk = clamp((h - 19.2) / 1.2, 0, 1);
    shop.setDusk?.(dusk);
  }
}

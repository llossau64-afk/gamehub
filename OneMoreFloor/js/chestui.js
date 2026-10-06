// Chest shop tab + the full-screen chest opening: drop, shake, charge, burst, reveal.
import * as THREE from '../lib/three.module.min.js';
import { save } from './save.js';
import { audio } from './audio.js';
import { CHESTS, CHEST_BY_ID, KEY_PACKS, RARITY_ORDER, RARITY_COLOR, RARITY_LABEL, rollChest, grantLoot, buildChest, buildKey, softTex } from './chests.js';
import { SKINS } from './meta.js';
import { WEAPON_BY_ID, buildWeapon } from './weapons.js';
import { buildPlayer, animateOutfit } from './characters.js';
import { Preview } from './preview.js';
import { payments } from './payments.js';
import { crazy } from './crazy.js';
import { fmt } from './util.js';

const $ = (s, el = document) => el.querySelector(s);
export const KEY_ICO = '<svg class="key-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="8" cy="8" r="4.2"/><path d="M11 11 L20 20 M16.5 16.5 L19 14 M18.5 18.5 L21 16"/></svg>';
const easeOutBack = x => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
const easeOutBounce = x => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };

export function installChests(UI) {
  const P = UI.prototype;

  P.chestThumb = function (id) {
    this._chestThumbs = this._chestThumbs || {};
    if (this._chestThumbs[id]) return this._chestThumbs[id];
    if (!this._thumbPv) this._thumbPv = new Preview({ spin: 0, floor: false });
    const c = buildChest(id);
    c.lid.rotation.x = -0.08;
    this._chestThumbs[id] = this._thumbPv.snap(c.root, { y: 0.45, dist: 3.3, pitch: 0.42, rot: 0.55, floor: false }, 220, 180);
    return this._chestThumbs[id];
  };

  // Shop tab body.
  P.chestTabHtml = function () {
    const d = save.data;
    const cards = CHESTS.map((c, k) => {
      const canPay = c.price.coins ? d.coins >= c.price.coins : d.keys >= c.price.keys;
      const price = c.price.coins ? `<i class="coin-ico"></i>${fmt(c.price.coins)}` : `${KEY_ICO}${c.price.keys}`;
      const odds = RARITY_ORDER.filter(r => c.odds[r] > 0).map(r => `<span style="--rc:${RARITY_COLOR[r]};flex:${c.odds[r]}" title="${RARITY_LABEL[r]} ${c.odds[r]}%"></span>`).join('');
      return `<div class="ccard ${c.id}" style="--cc:${c.css};--d:${k * 0.08}s">
        <div class="cc-shine"></div>
        <div class="cc-img"><img alt="" src="${this.chestThumb(c.id)}"></div>
        <b>${c.name.toUpperCase()}</b>
        <small>${c.desc}</small>
        <div class="cc-odds">${odds}</div>
        <div class="cc-legend">${RARITY_ORDER.filter(r => c.odds[r] > 0).map(r => `<i style="color:${RARITY_COLOR[r]}">${RARITY_LABEL[r]} ${c.odds[r]}%</i>`).join('')}</div>
        <button class="btn ${canPay ? 'primary' : ''}" data-chest="${c.id}">OPEN · ${price}</button>
      </div>`;
    }).join('');
    const ad = crazy.ads ? `<button class="kpack ad" data-keyad><span class="kp-n">${KEY_ICO}+1</span><b>WATCH AN AD</b><small>${this.keyAdReady() ? 'Free key' : 'Again in ' + this.keyAdWait()}</small></button>` : '';
    const packs = KEY_PACKS.map(p => `<button class="kpack" data-pack="${p.id}">${p.tag ? `<em>${p.tag}</em>` : ''}<span class="kp-n">${KEY_ICO}${p.keys}</span><b>${p.keys} KEY${p.keys > 1 ? 'S' : ''}</b><small>${p.price}</small></button>`).join('');
    return `<div class="chest-shop">
      <div class="cs-top"><div class="cs-keys">${KEY_ICO}<b>${d.keys}</b><span>KEYS</span></div><p>Exclusive skins and weapons are only found in chests. Keys drop from monsters from floor 20 up (about 1 in 20).</p></div>
      <div class="cs-row">${cards}</div>
      <div class="cs-store"><h4>${KEY_ICO} GET KEYS</h4><div class="kp-row">${packs}${ad}</div></div>
    </div>`;
  };

  P.bindChestTab = function (el) {
    el.querySelectorAll('[data-chest]').forEach(b => b.addEventListener('click', () => this.buyChest(b.dataset.chest)));
    el.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => this.buyKeys(b.dataset.pack)));
    const ad = el.querySelector('[data-keyad]');
    if (ad) ad.addEventListener('click', () => this.keyAd());
  };

  P.keyAdReady = function () { return Date.now() - (save.data.keyAdAt || 0) > 4 * 3600e3; };
  P.keyAdWait = function () { const m = Math.ceil((4 * 3600e3 - (Date.now() - (save.data.keyAdAt || 0))) / 60000); return m > 60 ? Math.ceil(m / 60) + ' h' : m + ' min'; };
  P.keyAd = async function () {
    if (!this.keyAdReady()) { audio.play('deny'); return; }
    const ok = await crazy.rewarded();
    if (!ok) { this.toast('NO AD AVAILABLE', 'Try again in a moment'); return; }
    const d = save.data; d.keys++; d.keyAdAt = Date.now(); save.write();
    audio.play('key'); this.toast('+1 KEY', 'Thanks for watching'); this.showShop('chests');
  };

  P.buyKeys = async function (packId) {
    const pack = KEY_PACKS.find(p => p.id === packId);
    audio.play('click');
    const res = await payments.buy(pack);
    if (res.ok) {
      save.data.keys += pack.keys; save.write();
      audio.play('key'); this.toast(`+${pack.keys} KEYS`, 'Thank you for supporting the game!');
      this.showShop('chests');
    } else this.toast('SHOP', res.message || 'Purchase not completed');
  };

  P.buyChest = function (id) {
    const c = CHEST_BY_ID[id], d = save.data;
    if (c.price.coins ? d.coins < c.price.coins : d.keys < c.price.keys) {
      audio.play('deny');
      const b = $(`[data-chest="${id}"]`); b && b.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 180 });
      if (!c.price.coins) this.toast('NOT ENOUGH KEYS', `You need ${c.price.keys} key${c.price.keys > 1 ? 's' : ''}`);
      return;
    }
    if (c.price.coins) d.coins -= c.price.coins; else d.keys -= c.price.keys;
    const loot = rollChest(id, d);
    grantLoot(loot, d);
    if (!d.achievements.includes('chest')) { d.achievements.push('chest'); }
    save.write();
    audio.play('buy');
    this.openChest(id, loot);
  };

  // ------------------------------------------------------------ opening sequence
  P.openChest = function (id, loot) {
    const el = $('#chestopen');
    const rc = RARITY_COLOR[loot.rarity], ri = RARITY_ORDER.indexOf(loot.rarity);
    el.style.setProperty('--rc', rc);
    el.innerHTML = `<div class="co-bg"></div><div class="co-rays"></div><div class="co-view"></div>
      <div class="co-flash"></div>
      <div class="co-hint">TAP TO OPEN</div>
      <div class="co-reveal">
        <div class="co-rar">${RARITY_LABEL[loot.rarity]}</div>
        <h2 class="co-name">${loot.name}</h2>
        <div class="co-sub">${loot.kind === 'skin' ? 'EXCLUSIVE SKIN' : loot.kind === 'weapon' ? 'EXCLUSIVE WEAPON' : loot.kind === 'keys' ? 'KEYS' : loot.dupe ? 'ALREADY OWNED · CONVERTED' + (loot.bonusKey ? ' · +1 KEY' : '') : 'COINS'}</div>
        <div class="co-btns">
          ${loot.kind === 'skin' || loot.kind === 'weapon' ? '<button class="btn primary" data-co="equip">EQUIP</button>' : ''}
          <button class="btn ${loot.kind === 'skin' || loot.kind === 'weapon' ? '' : 'primary'}" data-co="again">OPEN ANOTHER</button>
          <button class="btn" data-co="done">DONE</button>
        </div>
      </div>`;
    this.show('chestopen');
    audio.setMuffled(false);

    // dedicated 3D stage
    if (!this._chestPv) this._chestPv = new Preview({ floor: false, spin: 0, fov: 34, rim: 0xffffff });
    const pv = this._chestPv;
    pv.mount($('.co-view', el));
    const stage = new THREE.Group();
    const chest = buildChest(id);
    stage.add(chest.root);
    // light rays behind the item: thin additive blades around a pivot
    const rays = new THREE.Group(); rays.position.set(0, 1.2, -0.4); stage.add(rays);
    const rayMat = new THREE.MeshBasicMaterial({ color: rc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const rayG = new THREE.PlaneGeometry(0.22, 4.5); rayG.translate(0, 2.25, 0);
    for (let k = 0; k < 14; k++) { const r = new THREE.Mesh(rayG, rayMat); r.rotation.z = k / 14 * Math.PI * 2; r.scale.x = 0.6 + (k % 3) * 0.4; rays.add(r); }
    // the prize
    const prize = new THREE.Group(); prize.visible = false; stage.add(prize);
    let prizeModel = null;
    if (loot.kind === 'skin') {
      const s = SKINS.find(x => x.id === loot.id), m = buildPlayer(s, save.data.weapon);
      m.armL.rotation.set(0.1, 0, -0.1); m.pivot.rotation.set(0, 0.45, 0.15); m.root.scale.setScalar(1.25); m.root.position.y = -0.55;
      prize.add(m.root); prizeModel = m;
    } else if (loot.kind === 'weapon') {
      const w = buildWeapon(loot.id); w.rotation.set(-Math.PI / 2, 0, 0); w.position.y = -0.55; w.scale.setScalar(1.5); prize.add(w);
    } else if (loot.kind === 'keys') {
      for (let k = 0; k < loot.amount; k++) { const key = buildKey(1.4); key.position.set((k - (loot.amount - 1) / 2) * 0.45, 0, 0); key.rotation.z = (k - 0.5) * 0.3; prize.add(key); }
    } else {
      const coinG = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 18), coinM = new THREE.MeshToonMaterial({ color: 0xf2c94a, emissive: 0x6a4a00, emissiveIntensity: 0.45 });
      const n = Math.min(14, 5 + Math.floor(loot.amount / 300));
      for (let k = 0; k < n; k++) { const c = new THREE.Mesh(coinG, coinM); const a = k * 2.4; c.position.set(Math.sin(a) * 0.12 * (k % 4), (k % 7) * 0.06 - 0.2, Math.cos(a) * 0.12 * (k % 4)); c.rotation.set(Math.PI / 2 + (k % 3) * 0.3, a, 0); prize.add(c); }
    }
    const pGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: rc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    pGlow.scale.set(3, 3, 1); prize.add(pGlow);
    // particles: sparks (additive sprites) recycled from a pool
    const sparks = [];
    const sparkMat = c => new THREE.SpriteMaterial({ map: softTex(), color: c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 90; k++) { const s = new THREE.Sprite(sparkMat(k % 3 ? rc : 0xffffff)); s.visible = false; stage.add(s); sparks.push({ s, life: 0 }); }
    const spawn = (n, o = {}) => {
      for (let k = 0; k < n; k++) {
        const sp = sparks.find(x => x.life <= 0); if (!sp) return;
        const a = Math.random() * Math.PI * 2, v = (o.speed || 3) * (0.4 + Math.random() * 0.8);
        sp.x = (o.x || 0) + (Math.random() - 0.5) * (o.spread || 0.8); sp.y = o.y ?? 0.7; sp.z = (o.z || 0) + (Math.random() - 0.5) * (o.spread || 0.8) * 0.6;
        sp.vx = Math.cos(a) * v * 0.6; sp.vz = Math.sin(a) * v * 0.3; sp.vy = (o.up || 4) * (0.5 + Math.random() * 0.8);
        sp.life = sp.max = (o.life || 1.2) * (0.6 + Math.random() * 0.6); sp.size = (o.size || 0.14) * (0.6 + Math.random());
        sp.g = o.grav ?? 5; sp.s.visible = true;
      }
    };
    pv.setModel(stage, { y: 0.55, dist: 7.6, pitch: 0.3, rot: 0.42, floor: false });

    const S = this._chestS = { t: 0, phase: 'drop', taps: 0, shake: 0, lid: 0, lidV: 0, open: 0, revealT: 0 };
    const hint = $('.co-hint', el), flash = $('.co-flash', el), reveal = $('.co-reveal', el), raysEl = $('.co-rays', el);
    chest.root.position.y = 4;
    const goCharge = () => { if (S.phase !== 'idle') return; S.phase = 'charge'; S.t = 0; hint.classList.remove('on'); audio.play('chestCharge'); };
    const skip = () => { if (S.phase === 'charge') S.t = Math.max(S.t, 1.3); };
    $('.co-view', el).addEventListener('pointerdown', e => { e.preventDefault(); if (S.phase === 'idle') goCharge(); else skip(); });
    hint.addEventListener('pointerdown', () => goCharge());

    pv.onFrame = (dt, t) => {
      S.t += dt;
      const ch = chest.root;
      // sparks
      for (const sp of sparks) {
        if (sp.life <= 0) continue;
        sp.life -= dt; sp.vy -= sp.g * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
        sp.s.position.set(sp.x, sp.y, sp.z); const q = sp.life / sp.max; sp.s.material.opacity = q; sp.s.scale.setScalar(sp.size * (0.4 + q));
        if (sp.life <= 0) sp.s.visible = false;
      }
      if (S.phase === 'drop') {
        const q = Math.min(1, S.t / 0.75);
        ch.position.y = 4 * (1 - easeOutBounce(q));
        ch.rotation.y = (1 - q) * 0.9;
        if (q >= 1) { S.phase = 'land'; S.t = 0; audio.play('chestDrop'); spawn(18, { y: 0.05, speed: 4, up: 1.2, life: 0.7, size: 0.22, spread: 1.4, grav: 2 }); }
      } else if (S.phase === 'land') {
        const sq = Math.exp(-S.t * 9) * Math.sin(S.t * 30) * 0.12;
        ch.scale.set(1 + sq, 1 - sq, 1 + sq);
        if (S.t > 0.35) { S.phase = 'idle'; S.t = 0; ch.scale.setScalar(1); hint.classList.add('on'); }
      } else if (S.phase === 'idle') {
        // breathe and let a little light leak out of the seam: a hint of what is inside
        ch.rotation.z = Math.sin(t * 2.2) * 0.015;
        chest.glow.material.opacity = 0.15 + Math.sin(t * 3) * 0.08;
        chest.lid.rotation.x = -0.03 - Math.max(0, Math.sin(t * 2.2)) * 0.03;
        if (S.t > 4.5) goCharge();
      } else if (S.phase === 'charge') {
        const k = Math.min(1, S.t / 1.4);
        ch.position.x = (Math.random() - 0.5) * 0.09 * k; ch.rotation.z = (Math.random() - 0.5) * 0.12 * k;
        ch.scale.set(1 + k * 0.06, 1 - k * 0.04, 1 + k * 0.06);
        chest.lid.rotation.x = -0.04 - k * 0.12 - Math.random() * 0.05 * k;
        chest.glow.material.opacity = 0.2 + k * 0.8; chest.glow.material.color.set(k > 0.55 ? rc : 0xffe0a0);
        chest.glow.scale.setScalar(2.4 + k * 2);
        if (Math.random() < 0.15 + k * 0.5) spawn(1, { y: chest.H + 0.05, speed: 1.5, up: 2.5, life: 0.6, size: 0.1, spread: 1.0, grav: 1 });
        S.shakeT = (S.shakeT || 0) - dt; if (S.shakeT <= 0) { S.shakeT = 0.16 - k * 0.1; audio.play('chestShake', { k }); }
        if (S.t >= 1.4) {
          S.phase = 'burst'; S.t = 0; ch.position.x = 0; ch.rotation.z = 0; ch.scale.setScalar(1);
          S.lidV = -16; audio.play('chestOpen');
          flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
          raysEl.classList.add('on'); el.classList.add('burst', 'r' + ri);
          spawn(60, { y: chest.H + 0.1, speed: 4 + ri, up: 6 + ri, life: 1.5, size: 0.16, spread: 0.9 });
          chest.inner.material.opacity = 1;
          prize.visible = true; prize.position.y = chest.H; prize.scale.setScalar(0.1);
          setTimeout(() => audio.play('reveal', { r: ri }), 380);
          if (ri >= 3) setTimeout(() => audio.play('legendary'), 900);
        }
      } else {
        // lid: damped spring to fully open
        const target = -2.0;
        S.lidV += ((target - chest.lid.rotation.x) * 90 - S.lidV * 9) * dt;
        chest.lid.rotation.x += S.lidV * dt;
        // prize rises out with an overshoot, then floats and spins
        const q = Math.min(1, S.t / 0.9);
        prize.position.y = chest.H + easeOutBack(q) * 1.15;
        prize.scale.setScalar(0.1 + easeOutBack(q) * 0.9);
        prize.rotation.y = S.t * (q < 1 ? 7 * (1 - q) + 0.8 : 0.8);
        pGlow.material.opacity = Math.min(0.85, S.t * 2) * (0.85 + Math.sin(t * 5) * 0.15);
        rays.rotation.z = t * 0.35; rayMat.opacity = Math.min(0.12 + ri * 0.07, S.t * 0.8);
        rays.scale.setScalar(0.6 + Math.min(1, S.t * 1.5) * (0.6 + ri * 0.12));
        chest.glow.material.opacity = 0.7 + Math.sin(t * 6) * 0.15;
        if (prizeModel) { animateOutfit(prizeModel.root, t); prizeModel.eyes.scale.y = (t % 3.2) < 0.09 ? 0.12 : 1; }
        if (Math.random() < 0.25 + ri * 0.12) spawn(1, { y: prize.position.y, speed: 2, up: 1.5, life: 1.0, size: 0.1, spread: 1.4, grav: -0.5 });
        if (S.phase === 'burst' && S.t > 0.95) { S.phase = 'show'; reveal.classList.add('on'); }
      }
    };

    const close = (next) => {
      pv.onFrame = null; pv.setModel(null); pv.unmount();
      el.classList.remove('burst'); this.game.buildPlayerModel();
      if (next === 'again') { this.showShop('chests'); this.buyChest(id); }
      else this.showShop('chests');
    };
    el.querySelectorAll('[data-co]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.co;
      audio.play('click');
      if (a === 'equip') { if (loot.kind === 'skin') save.data.skin = loot.id; else save.data.weapon = loot.id; save.write(); audio.play('select'); close('done'); }
      else close(a);
    }));
  };

  P.renderChestPreview = function (dt) { if (this._chestPv) this._chestPv.render(dt); };
}

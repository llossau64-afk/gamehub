// Core gameplay: player, combat, enemies, projectiles, coins, traps, room flow and the run itself.
import * as THREE from '../lib/three.module.min.js';
import { RNG, clamp, damp, angleDiff, rand, TAU, dist2 } from './util.js';
import { TILE, T, makeRoom, menuRoom, tutorialRoom, toWorld, toTile, tileAt, collideCircle, lineOfSight, FlowField, solidAt } from './rooms.js';
import { buildPlayer, buildEnemy, ENEMY_COLORS } from './models.js';
import { animateOutfit } from './characters.js';
import { baseStats, rollCards, UPGRADE_BY_ID } from './upgrades.js';
import { SKINS, ACHIEVEMENTS, checkSkinProgress } from './meta.js';
import { input, wantsAttack } from './input.js';
import { audio } from './audio.js';
import { save, levelFromXp } from './save.js';
import { themeFor } from './world.js';
import { createBoss, updateBoss, BOSS_INFO } from './boss.js';
import { WEAPON_BY_ID } from './weapons.js';
import { crazy } from './crazy.js';
import { ABILITY_BY_ID, abilityPower, masteryFromXp, TRACK } from './abilities.js';

// Enemy archetypes. hp/speed are scaled per floor; dmg is what they deal to the player.
const ETYPES = {
  runner: { hp: 18, speed: 4.1, r: 0.36, dmg: 2, coins: 1, cost: 1, unlock: 1, weight: 3 },
  shooter: { hp: 20, speed: 2.6, r: 0.42, dmg: 2, coins: 2, cost: 2, unlock: 2, weight: 2 },
  splitter: { hp: 34, speed: 2.4, r: 0.46, dmg: 2, coins: 1, cost: 2, unlock: 3, weight: 2 },
  dasher: { hp: 30, speed: 3.2, r: 0.4, dmg: 3, coins: 2, cost: 2.5, unlock: 5, weight: 1.6 },
  tank: { hp: 85, speed: 1.75, r: 0.7, dmg: 4, coins: 4, cost: 4, unlock: 6, weight: 1 },
  dummy: { hp: 30, speed: 0, r: 0.42, dmg: 0, coins: 0, cost: 99, unlock: 999, weight: 0 },
};

const _v3 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
const _ndc = new THREE.Vector2();

export class Game {
  constructor(world, fx, ui) {
    this.world = world; this.fx = fx; this.ui = ui;
    this.mode = 'menu';
    this.phase = 'none';
    this.paused = false;
    this.time = 0;
    this.hitstop = 0;
    this.timeScale = 1;
    this.enemies = [];
    this.bullets = [];
    this.projs = [];
    this.coins = [];
    this.hazards = [];
    this.timers = [];
    this.pools = {};
    this.boss = null;
    this.player = null;
    this.menuActors = [];
    this.killTimes = [];
    this.magnetAll = false;
    this.recentRooms = [];
    this.buildPlayerModel();
  }

  // ------------------------------------------------------------------ setup
  buildPlayerModel() {
    const skin = SKINS.find(s => s.id === save.data.skin) || SKINS[0];
    if (this.pm) this.world.dynamic.remove(this.pm.root);
    this.pm = buildPlayer(skin, save.data.weapon);
    this.skin = skin;
    const wpn = WEAPON_BY_ID[save.data.weapon];
    this.trailColor = new THREE.Color(wpn && wpn.trail ? wpn.trail : skin.c.trail);
    this.world.waveMat.color.set(skin.c.blade).lerp(new THREE.Color(skin.c.trail), 0.4);
    this.world.orbitMat.color.set(skin.c.blade);
    this.world.dynamic.add(this.pm.root);
    this.world.playerLight.material.color.copy(this.trailColor).multiplyScalar(0.2);
  }

  weapon() { return WEAPON_BY_ID[save.data.weapon] || WEAPON_BY_ID.stick; }

  // The equipped power at its current mastery level (null until one is chosen).
  power() {
    const d = save.data;
    if (!d.ability || !d.abilities[d.ability]) return null;
    return abilityPower(d.ability, masteryFromXp(d.abilities[d.ability].xp).level);
  }

  later(delay, fn) { this.timers.push({ t: this.time + delay, fn }); }

  // ------------------------------------------------------------------ menu scene
  enterMenu() {
    crazy.gameplayStop();
    this.mode = 'menu'; this.phase = 'menu'; this.paused = false;
    this.clearEntities();
    const room = menuRoom();
    this.room = room;
    this.world.buildRoom(room, 1);
    this.flow = new FlowField(room);
    this.player = this.makePlayerState(0, 0);
    this.player.face = 0.5;
    this.pm.root.visible = true;
    // A few residents wander around in the background.
    const types = ['runner', 'shooter', 'tank', 'dasher', 'splitter'];
    this.menuActors = types.map((t, k) => {
      const [x, z] = toWorld(room, 3 + k * 3, 2 + (k % 3) * 3);
      const e = this.spawnEnemy(t, x, z, { instant: true, decor: true });
      e.wx = x; e.wz = z;
      return e;
    });
    this.menuT = 0;
    audio.setMode('menu'); audio.setMuffled(false);
  }

  // ------------------------------------------------------------------ run lifecycle
  startRun(opts = {}) {
    const d = save.data;
    this.mode = 'run';
    this.paused = false;
    this.clearEntities();
    const seed = opts.seed ?? ((Math.random() * 2 ** 31) >>> 0);
    this.run = {
      seed, rng: new RNG(seed), floor: 0, owned: {}, picks: [], kills: 0, coins: 0, bossKills: 0,
      rerolls: d.perm.fortune, phoenixUsed: false, prevBest: d.bestFloor, bestToastShown: false,
      startTime: performance.now(), swings: 0, hurtThisFloor: false, newDiscoveries: 0, tutorial: !!opts.tutorial,
    };
    this.tut = null; this.holdWaves = false;
    this.stats = baseStats(d.perm, this.weapon());
    this.player = this.makePlayerState(0, 0);
    this.player.maxHp = this.stats.maxHp; this.player.hp = this.player.maxHp;
    this.run.power = opts.tutorial ? null : this.power();
    this.player.abilityCd = 0.5;
    this.zones = []; this.scorches = []; this.spikes = [];
    this.player.dashCharges = this.stats.dashCharges;
    if (!opts.tutorial) d.runs++;
    save.write();
    this.ui.onRunStart(this);
    if (opts.tutorial) this.enterTutorial(); else this.nextFloor();
    crazy.gameplayStart();
  }

  // ------------------------------------------------------------------ register
  registerSeen(id) {
    const b = save.data.bestiary;
    if (!b[id]) { b[id] = { seen: true, kills: 0 }; if (this.mode === 'run') this.ui.toast('NEW REGISTER ENTRY', REG_NAMES[id] || id); }
  }
  registerKill(id) {
    const b = save.data.bestiary;
    if (!b[id]) b[id] = { seen: true, kills: 0 };
    b[id].kills++;
  }

  chooseAbility(id) {
    const d = save.data;
    d.ability = id;
    if (!d.abilities[id]) d.abilities[id] = { xp: 0, claimed: 1 };
    save.write();
    if (this.run) this.run.power = this.power();
  }

  // ------------------------------------------------------------------ powers
  powerTarget(range) {
    const p = this.player;
    let best = null, bd = range * range;
    const aimA = this.aimAngle();
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn' || e.decor) continue;
      const d2 = dist2(e.x, e.z, p.x, p.z);
      const off = Math.abs(angleDiff(aimA, Math.atan2(e.x - p.x, e.z - p.z)));
      const score = d2 * (1 + off * 0.6);
      if (score < bd) { bd = score; best = e; }
    }
    const b = this.boss;
    if (b && b.active && !b.dead && dist2(b.x, b.z, p.x, p.z) < range * range && (!best || dist2(b.x, b.z, p.x, p.z) < dist2(best.x, best.z, p.x, p.z))) best = b;
    return { target: best, aim: aimA };
  }

  powerDmg(pw) { return pw.dmg * (1 + 0.08 * save.data.perm.power) * this.stats.damageMul; }

  castPower() {
    const pw = this.run.power, p = this.player, a = pw.a, has = pw.has;
    p.abilityCd = pw.cd;
    p.castT = 0.25;
    const dmg = this.powerDmg(pw);
    const { target, aim } = this.powerTarget(10);
    const ang = target ? Math.atan2(target.x - p.x, target.z - p.z) : aim;
    p.face = ang; p.aim = ang;
    const col = new THREE.Color(a.color);
    const hx = p.x + Math.sin(ang) * 0.45, hz = p.z + Math.cos(ang) * 0.45;
    // charge-up: particles rush into the casting hand, then a flash
    for (let k = 0; k < 14; k++) {
      const an = rand(0, TAU), r = rand(0.7, 1.2);
      this.fx.emit(hx + Math.sin(an) * r, 0.8 + rand(-0.4, 0.5), hz + Math.cos(an) * r, -Math.sin(an) * r * 7, rand(-1, 1), -Math.cos(an) * r * 7, 0.13, 0.12, col, { grav: 0, drag: 0 });
    }
    this.fx.impact(hx, 0.8, hz, a.color, 1.6, 0.14);
    this.fx.ring(p.x, p.z, a.color, 0.3, 1.4, 0.3);
    if (a.id === 'fire') {
      const n = has(20) ? 3 : has(10) ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const an = ang + (k - (n - 1) / 2) * 0.22;
        this.projs.push({ kind: 'fireball', x: p.x + Math.sin(an) * 0.6, z: p.z + Math.cos(an) * 0.6, angle: an, vx: Math.sin(an) * 13, vz: Math.cos(an) * 13, speed: 13, dmg,
          life: 1.1, r: has(20) ? 0.42 : 0.3, pierce: 0, bounce: 0, hit: new Set(), split: false, age: 0, power: pw, big: has(20) });
      }
      audio.play('fireCast');
      this.fx.burst(hx, 0.8, hz, 12, 0xffb050, { speed: 5, up: 2, life: 0.3, size: 0.14, dir: ang, spread: 0.6, col2: 0xd8300a, grav: 0 });
    } else if (a.id === 'lightning') {
      const strikes = has(20) ? 5 : has(10) ? 2 : 1;
      const used = new Set();
      for (let k = 0; k < strikes; k++) {
        this.later(k * 0.12, () => {
          let t = k === 0 ? target : null;
          if (!t) { let bd = 81; for (const e of this.enemies) { if (e.dead || e.state === 'spawn' || e.decor || used.has(e)) continue; const d2 = dist2(e.x, e.z, p.x, p.z); if (d2 < bd) { bd = d2; t = e; } } }
          if (t) used.add(t);
          const tx = t ? t.x : p.x + Math.sin(ang) * 4, tz = t ? t.z : p.z + Math.cos(ang) * 4;
          this.lightningStrike(tx, tz, t, dmg, pw);
        });
      }
    } else if (a.id === 'earth') {
      const tx = target ? target.x : p.x + Math.sin(ang) * 6, tz = target ? target.z : p.z + Math.cos(ang) * 6;
      const flight = has(14) ? 0.42 : 0.58;
      const ex = p.x + Math.sin(ang) * 0.9, ez = p.z + Math.cos(ang) * 0.9;
      this.addScorch(ex, ez, 0.8, 0x4a3a2a);
      for (let k = 0; k < 8; k++) this.fx.emit(ex + rand(-0.4, 0.4), 0.1, ez + rand(-0.4, 0.4), rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), 0.9, 0.2, DUST_COL, { smoke: true, grav: -0.3, drag: 2 });
      this.spikes.push({ x: ex + 0.35, z: ez, h: 0.6, t: 0, life: 0.5, kind: 'stone', rot: 0.3 }, { x: ex - 0.35, z: ez + 0.1, h: 0.5, t: 0, life: 0.45, kind: 'stone', rot: -0.4 });
      this.projs.push({ kind: 'boulder', x: ex, z: ez, sx: ex, sz: ez, tx, tz, t: -0.13, flight, angle: ang, vx: 0, vz: 0, dmg: dmg * (has(14) ? 1.3 : 1) * (has(20) ? 2 : 1),
        life: 99, r: 0.4, hit: new Set(), age: 0, power: pw, big: has(20), pierce: 0, bounce: 0 });
      this.fx.burst(p.x, 0.1, p.z, 12, 0x9a8a72, { speed: 4, up: 5, life: 0.6, size: 0.16, debris: true });
      audio.play('earthCast');
    } else if (a.id === 'frost') {
      const nova = (delay) => this.later(delay, () => {
        const R = 3 * (has(7) ? 1.4 : 1) * (has(20) ? 1.5 : 1);
        this.fx.ring(p.x, p.z, 0x9feaff, 0.4, R, 0.45);
        this.fx.ring(p.x, p.z, 0xffffff, 0.2, R * 0.8, 0.3);
        this.fx.impact(p.x, 0.5, p.z, 0xdff8ff, R * 1.4, 0.2);
        // two rings of ice spikes erupt outward
        for (const [rr, n, dl] of [[R * 0.45, 8, 0], [R * 0.85, 14, 0.07]]) {
          for (let k = 0; k < n; k++) {
            const an = k / n * TAU + rr;
            this.spikes.push({ x: p.x + Math.sin(an) * rr, z: p.z + Math.cos(an) * rr, h: rand(0.5, 0.9) * (rr > R * 0.6 ? 1 : 0.8), t: -dl, life: 0.9, kind: 'ice', rot: an, tilt: 0.35 });
          }
        }
        for (let k = 0; k < 18; k++) { const an = rand(0, TAU); this.fx.emit(p.x, 0.2, p.z, Math.sin(an) * R * 2.2, rand(0.2, 0.8), Math.cos(an) * R * 2.2, 0.8, 0.3, FROST_COL, { smoke: true, grav: -0.2, drag: 3 }); }
        this.fx.burst(p.x, 0.4, p.z, 30, 0xffffff, { speed: R * 3, up: 2, life: 0.6, size: 0.08, grav: 0.5 });
        this.addZone(p.x, p.z, R, 0x5fc8e8, 0.7, 0);
        audio.play('frostCast');
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn' || e.decor || dist2(e.x, e.z, p.x, p.z) > (R + e.r) ** 2) continue;
          e.slow = has(3) ? 4 : 2; if (has(10)) e.stun = Math.max(e.stun || 0, 1);
          this.damageEnemy(e, dmg, { aoe: true, dirx: (e.x - p.x) / 3, dirz: (e.z - p.z) / 3, kb: 0.4 });
        }
        const b = this.boss; if (b && b.active && !b.dead && dist2(b.x, b.z, p.x, p.z) < (R + b.r) ** 2) { b.slow = 2; this.damageBoss(dmg, { aoe: true }); }
      });
      nova(0); if (has(14)) nova(0.5);
    } else if (a.id === 'wind') {
      const n = has(20) ? 12 : 3 + (has(3) ? 1 : 0) + (has(14) ? 2 : 0);
      const spread = has(20) ? Math.PI * 2 / n : 0.24;
      for (let k = 0; k < n; k++) {
        const an = has(20) ? ang + k * spread : ang + (k - (n - 1) / 2) * spread;
        this.projs.push({ kind: 'wind', x: p.x, z: p.z, angle: an, vx: Math.sin(an) * 15, vz: Math.cos(an) * 15, speed: 15, dmg, life: 0.7, r: 0.45,
          pierce: has(7) ? 99 : 2, bounce: 0, hit: new Set(), split: false, age: 0, power: pw, returns: has(10) });
      }
      audio.play('windCast');
      for (let k = 0; k < 20; k++) { const an = k / 20 * TAU; this.fx.emit(p.x + Math.sin(an) * 0.6, 0.6, p.z + Math.cos(an) * 0.6, Math.cos(an) * 5, rand(0, 1), -Math.sin(an) * 5, 0.35, 0.1, WIND_COL, { grav: 0, drag: 2 }); }
    }
    this.world.addShake(0.12);
  }

  lightningStrike(x, z, t, dmg, pw) {
    const has = pw.has;
    // a split second of warning: charge glow where it will land
    this.fx.ring(x, z, 0x9fd4ff, 1.4, 0.2, 0.12);
    this.fx.burst(x, 0.15, z, 8, 0xcfe8ff, { speed: 2, up: 0.5, life: 0.12, size: 0.1, grav: 0 });
    this.later(0.1, () => {
      if (t && t !== this.boss && t.dead) t = null;
      const sx = x + rand(-1.2, 1.2), sz = z - 3.5;
      this.fx.bolt(sx, 11, sz, x, 0.15, z, 0xffffff, 0.24);
      this.fx.bolt(sx + rand(-0.4, 0.4), 11, sz, x, 0.15, z, 0x9fd4ff, 0.2);
      // branches
      for (let k = 0; k < 2; k++) { const my = rand(2.5, 6), mx = sx + (x - sx) * (1 - my / 11), mz = sz + (z - sz) * (1 - my / 11); this.fx.bolt(mx, my, mz, mx + rand(-1.6, 1.6), my - rand(1.5, 3), mz + rand(-1, 1), 0x7ab8ff, 0.15); }
      this.fx.impact(x, 0.5, z, 0xe8f6ff, 3.6, 0.2);
      this.fx.ring(x, z, 0x9fd4ff, 0.2, 2, 0.32);
      this.fx.burst(x, 0.3, z, 22, 0xcfe8ff, { speed: 9, up: 6, life: 0.4, size: 0.09, grav: 12, col2: 0x3a7aff });
      for (let k = 0; k < 6; k++) this.fx.emit(x + rand(-0.3, 0.3), 0.2, z + rand(-0.3, 0.3), rand(-1, 1), rand(0.5, 1.4), rand(-1, 1), 1, 0.22, SMOKE_COL, { smoke: true, grav: -0.3, drag: 2 });
      this.addScorch(x, z, 1);
      this.addZone(x, z, 1.6, 0x6ab8ff, 0.25, 0);
      this.ui.flash();
      audio.play('thunder');
      this.world.addShake(0.24); this.world.punch(0.02);
      // electricity keeps crawling over the target for a moment
      for (let k = 1; k <= 3; k++) this.later(k * 0.1, () => { const tx = t ? t.x : x, tz = t ? t.z : z; this.fx.bolt(tx + rand(-0.5, 0.5), rand(0.2, 1.2), tz + rand(-0.5, 0.5), tx + rand(-0.5, 0.5), rand(0.2, 1.2), tz + rand(-0.5, 0.5), 0xcfe8ff, 0.08); });
      if (t && t !== this.boss) {
        if (has(7)) t.stun = Math.max(t.stun || 0, 0.7);
        this.damageEnemy(t, dmg, { aoe: true });
        const chains = has(14) ? 4 : has(3) ? 2 : 0;
        if (chains) this.chainLightning(t.x, t.z, chains, dmg * 0.6, t);
      } else if (t === this.boss && t) this.damageBoss(dmg, { aoe: true });
      else for (const e of this.enemies) if (!e.dead && e.state !== 'spawn' && !e.decor && dist2(e.x, e.z, x, z) < 1.4) this.damageEnemy(e, dmg, { aoe: true });
    });
  }

  addScorch(x, z, r, col) { this.scorches.push({ x, z, r, t: 0, life: 5, rot: rand(0, TAU) }); if (this.scorches.length > 30) this.scorches.shift(); }
  addZone(x, z, r, color, life, dps) { this.zones.push({ x, z, r, color: new THREE.Color(color), t: 0, life, dps, tick: 0 }); }

  fireExplode(pr) {
    const pw = pr.power, has = pw.has;
    const R = 1.3 * (has(7) ? 1.5 : 1) * (pr.big ? 1.4 : 1);
    const x = pr.x, z = pr.z;
    this.fx.impact(x, 0.7, z, 0xfff0c0, R * 2.8, 0.2);
    this.fx.ring(x, z, 0xffa04a, 0.2, R * 1.1, 0.3);
    // the fireball itself: hot core turning to deep red as it expands and rises
    for (let k = 0; k < 30; k++) {
      const an = rand(0, TAU), sp = rand(0.4, 1) * R * 3.4;
      this.fx.emit(x, 0.5 + rand(0, 0.4), z, Math.sin(an) * sp, rand(1, 4), Math.cos(an) * sp, rand(0.35, 0.6), rand(0.3, 0.5) * (pr.big ? 1.3 : 1), FIRE_HOT, { grav: -3, drag: 4.5, col2: 0xb01e06 });
    }
    for (let k = 0; k < 12; k++) this.fx.emit(x + rand(-0.5, 0.5) * R, 0.4, z + rand(-0.5, 0.5) * R, rand(-0.8, 0.8), rand(1.2, 2.5), rand(-0.8, 0.8), rand(1, 1.6), rand(0.25, 0.4), SMOKE_COL, { smoke: true, grav: -0.4, drag: 1.5, grow: 2.5 });
    for (let k = 0; k < 14; k++) { const an = rand(0, TAU), sp = rand(4, 9); this.fx.emit(x, 0.6, z, Math.sin(an) * sp, rand(3, 7), Math.cos(an) * sp, rand(0.5, 0.9), 0.06, FIRE_COL, { grav: 14, drag: 1 }); }
    this.addScorch(x, z, R);
    this.addZone(x, z, R * 1.6, 0xff7a2a, 0.35, 0);
    audio.play('explode');
    this.world.addShake(0.18); this.world.punch(0.015);
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn' || e.decor || dist2(e.x, e.z, pr.x, pr.z) > (R + e.r) ** 2) continue;
      const d = Math.sqrt(dist2(e.x, e.z, pr.x, pr.z)) || 1;
      if (has(3)) { e.burn = 3; e.burnDps = Math.max(e.burnDps || 0, pr.dmg * 0.35); }
      this.damageEnemy(e, pr.dmg, { aoe: true, dirx: (e.x - pr.x) / d, dirz: (e.z - pr.z) / d, kb: 0.8 });
    }
    const b = this.boss; if (b && b.active && !b.dead && dist2(b.x, b.z, pr.x, pr.z) < (R + b.r) ** 2) this.damageBoss(pr.dmg, { aoe: true });
    if (has(14)) this.addZone(pr.x, pr.z, R * 0.9, 0xff5a1a, 2.5, pr.dmg * 0.4);
    this.breakCratesNear(pr.x, pr.z, R);
  }

  boulderLand(pr) {
    const pw = pr.power, has = pw.has;
    const R = (has(7) ? 2.2 : 1.4) * (pr.big ? 1.6 : 1);
    this.fx.ring(pr.x, pr.z, 0xc9a06a, 0.3, R + 0.4, 0.4);
    this.fx.impact(pr.x, 0.4, pr.z, 0xffe0b0, R * 1.6, 0.15);
    this.fx.burst(pr.x, 0.3, pr.z, pr.big ? 34 : 22, 0x8a7258, { speed: R * 5, up: 7, life: 1, size: pr.big ? 0.3 : 0.2, debris: true, grav: 22 });
    for (let k = 0; k < 18; k++) { const an = k / 18 * TAU; this.fx.emit(pr.x + Math.sin(an) * 0.4, 0.15, pr.z + Math.cos(an) * 0.4, Math.sin(an) * R * 3, rand(0.3, 1), Math.cos(an) * R * 3, rand(0.9, 1.4), 0.3, DUST_COL, { smoke: true, grav: -0.2, drag: 3, grow: 2 }); }
    // a crown of stone spikes bursts out of the floor
    const ns = pr.big ? 12 : 8;
    for (let k = 0; k < ns; k++) { const an = k / ns * TAU + rand(-0.2, 0.2), rr = R * rand(0.55, 0.85); this.spikes.push({ x: pr.x + Math.sin(an) * rr, z: pr.z + Math.cos(an) * rr, h: rand(0.5, 0.95) * (pr.big ? 1.4 : 1), t: -k * 0.012, life: 0.85, kind: 'stone', rot: an, tilt: 0.4 }); }
    this.addScorch(pr.x, pr.z, R * 0.9);
    audio.play('slam');
    this.world.addShake(pr.big ? 0.5 : 0.28); this.world.punch(0.03);
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn' || e.decor || dist2(e.x, e.z, pr.x, pr.z) > (R + e.r) ** 2) continue;
      const d = Math.sqrt(dist2(e.x, e.z, pr.x, pr.z)) || 1;
      if (has(3)) e.stun = Math.max(e.stun || 0, 0.6);
      this.damageEnemy(e, pr.dmg, { aoe: true, dirx: (e.x - pr.x) / d, dirz: (e.z - pr.z) / d, kb: 1.4 });
    }
    const b = this.boss; if (b && b.active && !b.dead && dist2(b.x, b.z, pr.x, pr.z) < (R + b.r) ** 2) this.damageBoss(pr.dmg, { aoe: true });
    this.breakCratesNear(pr.x, pr.z, R);
    if (has(10)) for (let k = 0; k < 3; k++) {
      const an = pr.angle + (k - 1) * 0.8;
      this.projs.push({ kind: 'shard', x: pr.x, z: pr.z, angle: an, vx: Math.sin(an) * 12, vz: Math.cos(an) * 12, speed: 12, dmg: pr.dmg * 0.4, life: 0.5, r: 0.25, pierce: 1, bounce: 0, hit: new Set(), split: false, age: 0 });
    }
  }

  breakCratesNear(x, z, R) {
    if (!this.room.crates.length) return;
    this.room.crates.forEach(([i, j], k) => { if (!this.crates[k]) return; const [cx, cz] = toWorld(this.room, i, j); if (dist2(cx, cz, x, z) < R * R + 0.3) this.breakCrate(k); });
  }

  updatePowerFx(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zn = this.zones[i]; zn.t += dt;
      if (zn.t > zn.life) { this.zones.splice(i, 1); continue; }
      if (zn.dps > 0) {
        zn.tick -= dt;
        if (Math.random() < dt * 20) this.fx.emit(zn.x + rand(-zn.r, zn.r) * 0.7, 0.1, zn.z + rand(-zn.r, zn.r) * 0.7, 0, 2, 0, 0.5, 0.14, FIRE_COL, { grav: -1, drag: 1 });
        if (zn.tick <= 0) {
          zn.tick = 0.4;
          for (const e of this.enemies) if (!e.dead && e.state !== 'spawn' && !e.decor && dist2(e.x, e.z, zn.x, zn.z) < (zn.r + e.r) ** 2) this.damageEnemy(e, zn.dps * 0.4, { aoe: true, canCrit: false });
        }
      }
    }
    for (let i = this.scorches.length - 1; i >= 0; i--) { const sc = this.scorches[i]; sc.t += dt; if (sc.t > sc.life) this.scorches.splice(i, 1); }
    for (let i = this.spikes.length - 1; i >= 0; i--) { const sp = this.spikes[i]; sp.t += dt; if (sp.t > sp.life) this.spikes.splice(i, 1); else if (sp.t >= 0 && !sp.puffed) { sp.puffed = true; this.fx.emit(sp.x, 0.1, sp.z, 0, 0.6, 0, 0.6, 0.18, sp.kind === 'ice' ? FROST_COL : DUST_COL, { smoke: true, grav: -0.2, drag: 3 }); } }
  }

  // ------------------------------------------------------------------ dialog + tutorial
  say(lines, choices) {
    this.dialog = true;
    return this.ui.dialog(lines, choices).then(v => { this.dialog = false; this.graceUntil = performance.now() + 220; return v; });
  }

  enterTutorial() {
    const run = this.run;
    run.floor = 0;
    this.clearEntities();
    const room = tutorialRoom();
    this.room = room;
    this.world.buildRoom(room, 0);
    this.flow = new FlowField(room);
    this.crates = [];
    const [ex, ez] = toWorld(room, room.entry[0], room.entry[1]);
    const p = this.player;
    p.x = ex; p.z = ez; p.vx = p.vz = 0; p.face = Math.PI;
    this.phase = 'arrive'; this.phaseT = 0;
    this.waves = []; this.waveIdx = 0; this.isBossFloor = false; this.magnetAll = false;
    this.tut = { step: -1, busy: false, dashes: 0, marker: null };
    this.world.updateCamera(1, ex, ez - 1.5, { snap: true });
    audio.setMode('run'); audio.setIntensity(0.05);
    this.ui.onFloor(this, 0);
  }

  tutSteps() {
    const kb = !input.touchMode;
    const room = this.room;
    return [
      {
        intro: ['This is the training floor. Nothing in here hits hard.', 'First, get moving. Walk onto the marked spot.'],
        obj: 'Walk onto the marker',
        hint: kb ? '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys' : 'Drag anywhere on the left half of the screen',
        enter: () => { const [x, z] = toWorld(room, 7, 5); this.tut.target = [x, z]; this.tut.marker = this.fx.circleMarker(x, z, 0.85, 0.6, 0xf2b24a); },
        done: () => { const [x, z] = this.tut.target; return dist2(x, z, this.player.x, this.player.z) < 0.8; },
      },
      {
        intro: ['Good. See those dummies? Break them.'],
        obj: 'Destroy the 3 training dummies',
        hint: kb ? 'Hold <kbd>left mouse</kbd> and aim with the mouse, or hold <kbd>J</kbd>' : 'Hold the sword button. It aims for you.',
        enter: () => { for (const [i, j] of [[3, 3], [7, 3], [11, 3]]) { const [x, z] = toWorld(room, i, j); const e = this.spawnEnemy('dummy', x, z, { delay: 0.1 }); e.face = 0; } },
        done: () => !this.enemies.some(e => e.type === 'dummy' && !e.dead),
      },
      {
        intro: ['Clean. Gold numbers are critical hits. Some upgrades make them far more common.', 'Now the dash. It is the most important thing you have.'],
        obj: 'Dash 2 times',
        hint: kb ? '<kbd>Space</kbd> or <kbd>Shift</kbd>. The bars under your health show your charges.' : 'Tap DASH. The bars under your health show your charges.',
        enter: () => { this.tut.dashes = 0; },
        done: () => this.tut.dashes >= 2,
      },
      {
        intro: ['While you dash, nothing can touch you. Remember that when things get busy.', 'Now something that fights back. Runners crouch right before they lunge.'],
        obj: 'Defeat the runners',
        hint: 'Watch for the crouch, then hit first or dash away',
        enter: () => { for (const [i, j] of [[3, 7], [11, 7], [7, 3]]) { const [x, z] = toWorld(room, i, j); this.spawnEnemy('runner', x, z, { delay: 0.15 }); } },
        done: () => !this.enemies.some(e => !e.dead && !e.decor),
      },
    ];
  }

  tutAdvance() {
    const tut = this.tut, steps = this.tutSteps();
    tut.step++;
    if (tut.step >= steps.length) {
      this.ui.objective(null);
      this.roomClear();
      this.say(['Floor clear. When a floor is clear, the lift opens.', 'Step onto the glowing ring to ride up.']).then(() => {
        this.ui.objective({ label: 'TRAINING', text: 'Step onto the lift', hint: 'Follow the arrow to the glowing ring' });
      });
      return;
    }
    const st = steps[tut.step];
    tut.busy = true;
    this.say(st.intro).then(() => {
      tut.busy = false;
      st.enter();
      this.ui.objective({ label: `TRAINING · ${tut.step + 1}/${steps.length}`, text: st.obj, hint: st.hint });
    });
  }

  updateTutorial(dt) {
    const tut = this.tut;
    if (tut.busy || tut.step < 0) return;
    const st = this.tutSteps()[tut.step];
    if (st && st.done()) {
      tut.busy = true;
      if (tut.marker) { this.fx.releaseMarker(tut.marker); tut.marker = null; this.fx.ring(this.player.x, this.player.z, 0xf2b24a, 0.3, 1.6, 0.4); }
      this.ui.objectiveDone();
      audio.play('objective');
      this.later(0.7, () => this.tutAdvance());
    }
  }

  finishTutorial() {
    save.data.tutorialDone = true; save.write();
    this.tut = null; this.holdWaves = false;
    this.run.tutorial = false;
    this.run.fromTutorial = true;
    this.ui.objective(null);
  }

  makePlayerState(x, z) {
    return {
      x, z, y: 0, vx: 0, vz: 0, r: 0.36, face: 0, aim: 0, hp: 20, maxHp: 20, iframes: 0, dashT: 0, dashDX: 0, dashDZ: 1,
      dashCharges: 1, dashRecharge: 0, attackCd: 0, attackBuffer: 0, swingT: 1, swingFlip: false, swingCount: 0, flash: 0,
      dead: false, dashId: 0, moving: 0, step: 0, hurtT: 0, deathT: 0, lunge: 0,
    };
  }

  heal(n) {
    const p = this.player;
    if (!p || p.dead) return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + n);
    if (p.hp > before) { this.fx.number(p.x, 1.4, p.z, '+' + (p.hp - before), 'heal'); }
  }

  recomputeStats() {
    const s = baseStats(save.data.perm, this.weapon());
    for (const id of this.run.picks) UPGRADE_BY_ID[id].apply(s, null);
    this.stats = s;
    const p = this.player;
    const newMax = Math.max(4, Math.round(s.maxHp * s.maxHpMul));
    p.maxHp = newMax; p.hp = Math.min(p.hp, newMax);
    p.dashCharges = Math.min(p.dashCharges, s.dashCharges);
  }

  pickUpgrade(u) {
    const run = this.run;
    run.owned[u.id] = (run.owned[u.id] || 0) + 1;
    run.picks.push(u.id);
    const before = this.player.maxHp;
    this.recomputeStats();
    if (u.id === 'dash2') this.player.dashCharges++;
    u.apply(baseStats(save.data.perm, this.weapon()), this); // heal side effects only
    if (this.player.maxHp > before && u.id !== 'skin') this.player.hp += this.player.maxHp - before;
    this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    const d = save.data;
    if (!d.discovered.includes(u.id)) { d.discovered.push(u.id); run.newDiscoveries++; }
    if (u.rarity === 'legendary') this.unlock('legendary');
    if (run.picks.length >= 15) this.unlock('broken');
    this.ui.updateBuild(this);
    save.write();
  }

  rollCards(reroll = false) {
    const run = this.run, f = run.floor;
    const luck = clamp((f - 1) / 35, 0, 1);
    return rollCards(run.rng, run.owned, luck, f % 10 === 0 && !reroll);
  }

  nextFloor() {
    const run = this.run;
    if (run.tutorial) this.finishTutorial();
    run.floor++;
    run.hurtThisFloor = false;
    this.clearEntities();
    const f = run.floor;
    const room = makeRoom(run.rng, f, this.recentRooms);
    this.room = room;
    this.world.buildRoom(room, f);
    this.flow = new FlowField(room);
    this.crates = room.crates.map(() => true);
    const [ex, ez] = toWorld(room, room.entry[0], room.entry[1]);
    const p = this.player;
    p.x = ex; p.z = ez; p.vx = p.vz = 0; p.face = Math.PI; p.dashT = 0; p.iframes = 0;
    p.dashCharges = this.stats.dashCharges;
    this.phase = 'arrive'; this.phaseT = 0;
    this.magnetAll = false;
    this.trapClock = 0;
    this.waves = this.generateWaves(f);
    this.waveIdx = 0; this.waveT = 0;
    this.isBossFloor = f % 10 === 0;
    this.world.updateCamera(1, ex, ez - 1.5, { snap: true });
    audio.setMode(this.isBossFloor ? 'off' : 'run');
    audio.setMuffled(false);
    audio.setIntensity(0.1);
    this.ui.onFloor(this, f);
    if (f > 1) audio.play('elevator');
    // Progress moments, kept rare on purpose.
    if (!run.bestToastShown && run.prevBest > 0 && f === run.prevBest + 1) {
      run.bestToastShown = true;
      this.later(1.2, () => { this.ui.toast('NEW BEST!', `Past floor ${run.prevBest}`); audio.play('best'); crazy.happytime(); });
    }
    if (f === 5) this.unlock('f5');
    if (f === 40) this.unlock('f40');
    save.write();
  }

  generateWaves(f) {
    if (f % 10 === 0) return [];
    const rng = this.run.rng;
    const unlocked = Object.keys(ETYPES).filter(t => ETYPES[t].unlock <= f);
    // Each room gets a "squad" of 2-3 types, so rooms feel different from each other.
    let squad = rng.shuffle([...unlocked]).slice(0, Math.min(unlocked.length, f < 4 ? 2 : rng.int(2, 3)));
    const fresh = unlocked.find(t => ETYPES[t].unlock === f);
    if (fresh && !squad.includes(fresh)) squad[0] = fresh;
    if (!squad.includes('runner') && rng.chance(0.5)) squad.push('runner');
    const budget = 3 + f * 1.3 + Math.max(0, f - 12) * 0.5;
    const nWaves = f < 3 ? 1 : f < 7 ? 2 : rng.chance(0.55) ? 3 : 2;
    const waves = [];
    for (let w = 0; w < nWaves; w++) {
      let b = budget / nWaves * (w === 0 ? 0.85 : 1.1);
      const list = [];
      while (b > 0.5 && list.length < 13) {
        const opts = squad.filter(t => ETYPES[t].cost <= b + 0.5);
        if (!opts.length) break;
        let total = 0; for (const t of opts) total += ETYPES[t].weight;
        let r = rng.next() * total, pick = opts[0];
        for (const t of opts) { r -= ETYPES[t].weight; if (r <= 0) { pick = t; break; } }
        const elite = f >= 12 && rng.chance(Math.min(0.3, 0.04 * (f - 11)));
        list.push({ type: pick, elite });
        b -= ETYPES[pick].cost * (elite ? 2 : 1);
      }
      waves.push(list);
    }
    return waves;
  }

  spawnWave(list) {
    const room = this.room, p = this.player, rng = this.run.rng;
    let pts = room.spawns.map(([i, j]) => toWorld(room, i, j)).filter(([x, z]) => dist2(x, z, p.x, p.z) > 16);
    if (pts.length < 3) pts = room.spawns.map(([i, j]) => toWorld(room, i, j));
    rng.shuffle(pts);
    list.forEach((s, k) => {
      const [bx, bz] = pts[k % pts.length];
      const ox = k >= pts.length ? rand(-0.6, 0.6) : 0, oz = k >= pts.length ? rand(-0.6, 0.6) : 0;
      this.spawnEnemy(s.type, bx + ox, bz + oz, { elite: s.elite, delay: 0.1 + k * 0.06 });
    });
    audio.play('spawn');
  }

  // ------------------------------------------------------------------ entities
  clearEntities() {
    for (const e of this.enemies) this.releaseModel(e);
    this.enemies.length = 0; this.bullets.length = 0; this.projs.length = 0; this.coins.length = 0; this.hazards.length = 0;
    this.timers.length = 0;
    if (this.zones) this.zones.length = 0;
    if (this.scorches) this.scorches.length = 0;
    if (this.spikes) this.spikes.length = 0;
    if (this.boss) { this.world.dynamic.remove(this.boss.model.root); this.boss = null; }
    this.fx.clear();
    this.killTimes.length = 0;
  }

  acquireModel(type) {
    const pool = this.pools[type] || (this.pools[type] = []);
    const m = pool.pop() || buildEnemy(type);
    m.root.visible = true; m.root.scale.setScalar(1);
    this.world.dynamic.add(m.root);
    return m;
  }
  releaseModel(e) {
    if (!e.model) return;
    this.world.dynamic.remove(e.model.root);
    for (const mat of e.model.mats) mat.emissiveIntensity = 0;
    this.pools[e.type].push(e.model);
    e.model = null;
  }

  floorScale() {
    const f = this.mode === 'run' ? this.run.floor : 1;
    return {
      hp: 1 + 0.085 * (f - 1) + Math.max(0, f - 20) * 0.05,
      speed: 1 + Math.min(0.38, f * 0.013),
      cd: Math.max(0.55, 1 - f * 0.014),
      dmg: Math.floor(f / 15),
      f,
    };
  }

  spawnEnemy(type, x, z, o = {}) {
    const def = ETYPES[type], sc = this.floorScale();
    const mini = !!o.mini;
    const model = this.acquireModel(type);
    const e = {
      type, x, z, vx: 0, vz: 0, kbx: 0, kby: 0, kbz: 0, def, model,
      r: def.r * (mini ? 0.62 : 1) * (o.elite ? 1.2 : 1),
      hp: def.hp * sc.hp * (mini ? 0.35 : 1) * (o.elite ? 2.4 : 1),
      speed: def.speed * sc.speed * (mini ? 1.35 : 1) * (o.elite ? 0.92 : 1),
      dmg: Math.max(1, (mini ? def.dmg - 1 : def.dmg) + sc.dmg),
      state: 'spawn', t: 0, cd: rand(0.6, 1.6), face: rand(0, TAU), flash: 0, slow: 0,
      elite: !!o.elite, mini, decor: !!o.decor, dead: false, deathT: 0,
      spawnT: o.instant ? 0 : 0.75 + (o.delay || 0), pop: o.instant ? 1 : 0, orbitCd: 0, dashHit: -1, touchCd: 0,
      strafe: Math.random() < 0.5 ? 1 : -1, wob: rand(0, TAU), trapHit: -1, kbResist: type === 'tank' ? 0.75 : 0,
      bossMinion: !!o.bossMinion, y: 0, dvx: 0, dvy: 0, dvz: 0, spin: 0, sq: 0, sqv: 0, hitT: 0, hx: 0, hz: 1, popped: false,
    };
    e.maxHp = e.hp;
    model.eliteBand.visible = e.elite;
    model.root.scale.setScalar(e.r / def.r);
    model.root.position.set(x, 0, z);
    if (!o.instant) {
      e.marker = this.fx.circleMarker(x, z, e.r + 0.35, e.spawnT, 0xf2d6a0);
      model.root.visible = false;
    }
    this.enemies.push(e);
    return e;
  }

  fireBullet(x, z, angle, speed, dmg, o = {}) {
    this.bullets.push({ x, z, vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed, r: o.r || 0.17, dmg, life: o.life || 6, y: o.y || 0.75, s: o.scale || 1 });
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    if (this.mode === 'menu') { this.updateMenu(dt); return; }
    if (input.pausePressed && ['fight', 'clear', 'arrive'].includes(this.phase)) this.ui.togglePause(this);
    if (this.paused) return;
    if (this.dialog) { this.updateVisuals(0, dt); return; }

    if (this.hitstop > 0) { this.hitstop -= dt; this.updateVisuals(0, dt); return; }
    this.timeScale = damp(this.timeScale, 1, this.phase === 'dying' ? 1.4 : 5, dt);
    const gdt = dt * this.timeScale;
    this.time += gdt;
    this.phaseT += gdt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].t) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }

    this.updatePhase(gdt);
    if (this.phase !== 'cards' && this.phase !== 'dead') {
      this.updatePlayer(gdt);
      this.updateEnemies(gdt);
      if (this.boss) updateBoss(this, this.boss, gdt);
      this.updateProjectiles(gdt);
      this.updateBullets(gdt);
      this.updateHazards(gdt);
      this.updatePowerFx(gdt);
      this.updateCoins(gdt);
      this.updateTraps(gdt);
    }
    this.updateVisuals(gdt, dt);
  }

  updatePhase(dt) {
    const p = this.player, w = this.world;
    switch (this.phase) {
      case 'arrive': {
        const t = Math.min(1, this.phaseT / 0.85);
        const e = 1 - Math.pow(1 - t, 3);
        const lift = w.entryLift;
        if (lift) { lift.group.position.y = -2.6 * (1 - e); p.y = lift.group.position.y; }
        if (this.phaseT >= 0.85) {
          p.y = 0; p.landT = 0.25;
          this.fx.burst(p.x, 0.1, p.z, 10, 0xb8b0a4, { speed: 4, up: 1.5, life: 0.45, size: 0.12, debris: false });
          audio.play('doorOpen');
          if (this.tut) { this.phase = 'fight'; this.phaseT = 0; this.tutAdvance(); }
          else if (this.run.floor === 1 && this.run.fromTutorial) {
            this.run.fromTutorial = false;
            this.phase = 'fight'; this.phaseT = 0; this.holdWaves = true;
            this.say([
              "That's the training done. From here on it's real, and every floor is harder than the last.",
              'Clear the room, take an upgrade, ride up. How high can you get?',
            ]).then(() => { this.holdWaves = false; this.spawnWave(this.waves[0]); this.waveIdx = 1; this.waveT = 0; });
          }
          else if (this.isBossFloor) { this.phase = 'bossIntro'; this.phaseT = 0; this.startBossIntro(); }
          else { this.phase = 'fight'; this.phaseT = 0; this.spawnWave(this.waves[0]); this.waveIdx = 1; this.waveT = 0; }
        }
        break;
      }
      case 'bossIntro':
        if (this.phaseT > 2.1 && !this._bossTalk) {
          const kind = this.boss.kind, seen = save.data.seenBoss || (save.data.seenBoss = {});
          const go = () => { this._bossTalk = false; this.phase = 'fight'; this.phaseT = 0; this.boss.active = true; audio.setMode('boss'); };
          this.ui.letterbox(false);
          if (!seen[kind]) {
            seen[kind] = true; save.write(); this._bossTalk = true;
            this.say(BOSS_LINES[kind]).then(go);
          } else go();
        }
        break;
      case 'fight': {
        if (this.tut) { this.updateTutorial(dt); break; }
        if (this.holdWaves) break;
        this.waveT += dt;
        const alive = this.enemies.filter(e => !e.dead && !e.decor).length;
        if (this.boss) { if (this.boss.dead && this.boss.deathT > 1.4 && alive === 0) this.roomClear(); break; }
        if (this.waveIdx < this.waves.length) {
          const prev = this.waves[this.waveIdx - 1].length;
          if (alive === 0 || (alive <= Math.max(1, Math.floor(prev * 0.25)) && this.waveT > 4)) {
            this.spawnWave(this.waves[this.waveIdx]); this.waveIdx++; this.waveT = 0;
          }
        } else if (alive === 0 && this.waveT > 0.3) this.roomClear();
        break;
      }
      case 'clear': {
        const lift = w.exitLift;
        if (lift && !p.dead && dist2(p.x, p.z, lift.x, lift.z) < (TILE * 0.55) ** 2 && this.phaseT > 0.25) {
          this.phase = 'leave'; this.phaseT = 0;
          if (this.tut) this.ui.objective(null);
          audio.play('doorClose');
          this.ui.fade(true, 0.55, 0.35);
        }
        break;
      }
      case 'leave': {
        const lift = w.exitLift;
        p.x = damp(p.x, lift.x, 12, dt); p.z = damp(p.z, lift.z, 12, dt);
        p.vx = p.vz = 0;
        const t = Math.max(0, this.phaseT - 0.15);
        lift.group.position.y = t * t * 5;
        p.y = lift.group.position.y;
        if (this.phaseT > 0.9) {
          const f = this.run.floor;
          if (this.run.tutorial) {
            this.phase = 'cards'; this.phaseT = 0;
            audio.setMuffled(true);
            if (!save.data.ability) {
              this.say(['Last thing. That stick will not get you far up there.', 'Choose a power. It starts out weak, but the more you climb with it, the stronger it gets. Choose well.'])
                .then(() => this.ui.showElementChoice(this, () => this.nextFloor()));
            } else this.ui.ride(this, f, () => this.nextFloor());
          } else if (f % 5 === 0) {
            // Upgrade cards only every 5th floor: they should feel like a reward, not a routine.
            this.phase = 'cards'; this.phaseT = 0;
            audio.setMuffled(true);
            this.ui.showCards(this, this.rollCards());
          } else {
            this.phase = 'cards'; this.phaseT = 0;
            this.ui.ride(this, f, () => this.nextFloor());
          }
        }
        break;
      }
      case 'dying':
        if (this.phaseT > 1.25) {
          // On CrazyGames: one revive per run for watching an ad.
          if (crazy.ads && !this.run.revived && !this.run.tutorial && this.run.floor >= 3) { this.phase = 'revive'; this.ui.showRevive(this); }
          else this.giveUp();
        }
        break;
    }
  }

  roomClear() {
    this.phase = 'clear'; this.phaseT = 0;
    this.magnetAll = true;
    this.world.setTraps(0, 0);
    const lift = this.world.exitLift;
    if (lift) { lift.ringMat.color.set(0xf2b24a); }
    audio.play('doorOpen');
    audio.setIntensity(0.1);
    if (this.run.floor >= 8 && !this.run.hurtThisFloor) this.unlock('untouched');
    this.ui.clearBanner(this.isBossFloor);
    if (this.isBossFloor) audio.setMode('run');
  }

  startBossIntro() {
    const f = this.run.floor;
    const kind = BOSS_INFO.order[Math.floor(f / 10 - 1) % 3];
    const [bx, bz] = toWorld(this.room, Math.floor(this.room.w / 2), 4);
    this.boss = createBoss(this, kind, bx, bz, f);
    this.registerSeen(kind);
    this.ui.letterbox(true, BOSS_INFO[kind].name, `FLOOR ${f}`);
    audio.play('bossIntro');
  }

  // ------------------------------------------------------------------ player
  aimAngle() {
    const p = this.player;
    if (input.gpAim) return Math.atan2(input.gpAim.x, input.gpAim.z);
    if (input.mouseActive && input.aimScreen && !input.touchMode) {
      _ndc.set(input.aimScreen.x / window.innerWidth * 2 - 1, -(input.aimScreen.y / window.innerHeight) * 2 + 1);
      _ray.setFromCamera(_ndc, this.world.camera);
      if (_ray.ray.intersectPlane(_plane, _v3)) return Math.atan2(_v3.x - p.x, _v3.z - p.z);
    }
    // Touch / keyboard-only: soft auto-aim at the closest threat, biased to where you face.
    let best = null, bestScore = 1e9;
    const consider = (x, z, r) => {
      const d = Math.sqrt(dist2(x, z, p.x, p.z)) - r;
      if (d > 7.5) return;
      const a = Math.atan2(x - p.x, z - p.z);
      const score = d + Math.abs(angleDiff(p.face, a)) * 1.2;
      if (score < bestScore) { bestScore = score; best = a; }
    };
    for (const e of this.enemies) if (!e.dead && e.state !== 'spawn' && !e.decor) consider(e.x, e.z, e.r);
    if (this.boss && !this.boss.dead && this.boss.active) consider(this.boss.x, this.boss.z, this.boss.r);
    if (best !== null) return best;
    return p.face;
  }

  updatePlayer(dt) {
    const p = this.player, s = this.stats;
    if (p.dead) { p.deathT += dt; return; }
    const canAct = this.phase === 'fight' || this.phase === 'clear' || (this.phase === 'arrive' && this.phaseT > 0.6);
    p.iframes -= dt; p.flash -= dt; p.hurtT -= dt;

    // dash recharge: one charge at a time
    if (p.dashCharges < s.dashCharges) {
      p.dashRecharge += dt;
      if (p.dashRecharge >= s.dashCooldown) { p.dashRecharge = 0; p.dashCharges++; }
    } else p.dashRecharge = 0;

    if (performance.now() < (this.graceUntil || 0)) { input.dashPressed = false; input.attackPressed = false; input.abilityPressed = false; }
    const mx = canAct ? input.move.x : 0, mz = canAct ? input.move.z : 0;
    const moving = Math.hypot(mx, mz) > 0.1;

    if (canAct && input.dashPressed && p.dashCharges > 0 && p.dashT <= 0) this.dash(mx, mz, moving);

    if (p.dashT > 0) {
      p.dashT -= dt;
      const sp = 25;
      p.vx = p.dashDX * sp; p.vz = p.dashDZ * sp;
      if (this.time - (p.lastTrail || 0) > 0.012) {
        p.lastTrail = this.time;
        this.fx.emit(p.x + rand(-0.15, 0.15), 0.4 + rand(0, 0.5), p.z + rand(-0.15, 0.15), 0, 0.5, 0, 0.28, 0.2, this.trailColor, { grav: 0, drag: 1 });
      }
      if (s.dashDamage > 0) {
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn' || e.decor || e.dashHit === p.dashId) continue;
          if (dist2(e.x, e.z, p.x, p.z) < (e.r + p.r + 0.5) ** 2) { e.dashHit = p.dashId; this.damageEnemy(e, s.damage * s.damageMul * s.dashDamage, { dirx: p.dashDX, dirz: p.dashDZ, kb: 1.2, proc: true }); }
        }
        const b = this.boss;
        if (b && b.active && !b.dead && b.dashHit !== p.dashId && dist2(b.x, b.z, p.x, p.z) < (b.r + p.r + 0.5) ** 2) { b.dashHit = p.dashId; this.damageBoss(s.damage * s.damageMul * s.dashDamage, { proc: true }); }
      }
      if (p.dashT <= 0) {
        p.vx *= 0.25; p.vz *= 0.25;
        if (s.dashShock > 0) {
          this.explosion(p.x, p.z, 2.3 + 0.4 * s.dashShock, s.damage * s.damageMul * 0.8 * s.dashShock, { color: this.trailColor, sound: false, kb: 2.2 });
          audio.play('heavy');
        }
      }
    } else {
      const sp = s.moveSpeed * (p.swingT < 0.12 ? 0.82 : 1);
      p.vx = damp(p.vx, mx * sp, 32, dt);
      p.vz = damp(p.vz, mz * sp, 32, dt);
    }
    if (p.lunge > 0) { p.lunge -= dt; }

    p.x += p.vx * dt; p.z += p.vz * dt;
    collideCircle(this.room, p, p.r);

    // facing
    p.moving = damp(p.moving, moving ? 1 : 0, 14, dt);
    const attacking = canAct && (wantsAttack() || input.attackPressed || p.attackBuffer > 0);
    if (attacking || p.swingT < 0.25) p.aim = this.aimAngle();
    const want = p.swingT < 0.25 || attacking ? p.aim : moving ? Math.atan2(mx, mz) : p.face;
    p.face += angleDiff(p.face, want) * Math.min(1, dt * 26);

    // power
    p.abilityCd = Math.max(0, (p.abilityCd || 0) - dt);
    if (canAct && input.abilityPressed && this.run.power && p.abilityCd <= 0 && p.dashT <= 0) this.castPower();
    else if (canAct && input.abilityPressed && this.run.power) audio.play('deny');

    // attacking
    p.attackCd -= dt; p.swingT += dt;
    if (input.attackPressed) p.attackBuffer = 0.18;
    p.attackBuffer -= dt;
    if (canAct && p.attackCd <= 0 && p.dashT <= 0 && (wantsAttack() || p.attackBuffer > 0)) {
      p.attackBuffer = 0;
      const rate = s.attackRate * (s.berserk && p.hp <= p.maxHp / 2 ? 1 + 0.2 * s.berserk : 1);
      p.attackCd = 1 / rate;
      p.aim = this.aimAngle(); p.face = p.aim;
      this.swing(p.aim, 1, false);
    }

    // footsteps dust
    if (moving && p.dashT <= 0) {
      p.step += dt * 9;
      if (p.step > 1) { p.step = 0; this.fx.emit(p.x, 0.05, p.z, rand(-0.4, 0.4), 0.6, rand(-0.4, 0.4), 0.35, 0.09, this._dust || (this._dust = new THREE.Color(0x8a8378)), { grav: 1, drag: 3, debris: false }); }
    }

    // drones and orbit blades
    this.updateCompanions(dt);
  }

  dash(mx, mz, moving) {
    const p = this.player;
    if (this.tut) this.tut.dashes++;
    let dx = mx, dz = mz;
    if (!moving) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
    const l = Math.hypot(dx, dz) || 1;
    p.dashDX = dx / l; p.dashDZ = dz / l;
    p.dashT = 0.16; p.iframes = Math.max(p.iframes, 0.22);
    p.dashCharges--; p.dashId++;
    p.face = Math.atan2(p.dashDX, p.dashDZ);
    audio.play('dash');
    this.fx.ring(p.x, p.z, this.trailColor, 0.3, 1.2, 0.25);
    this.fx.burst(p.x, 0.2, p.z, 6, 0xcfc6b8, { speed: 3, up: 1, life: 0.3, size: 0.1, dir: Math.atan2(-dx, -dz), spread: 0.7, debris: false });
  }

  swing(angle, mult, isEcho) {
    const p = this.player, s = this.stats, run = this.run;
    if (!isEcho) {
      // combo: right swing, left swing, then a spin finisher (if you keep the pressure on)
      p.combo = p.swingT < 0.62 ? ((p.combo || 0) + 1) % 3 : 0;
      p.finisher = p.combo === 2;
      p.swingDir = p.combo === 1 ? -1 : 1;
      p.swingFlip = p.swingDir < 0;
      p.swingCount++; p.swingT = 0;
    }
    const finisher = !isEcho && p.finisher;
    const fifth = s.fifth > 0 && !isEcho && p.swingCount % 5 === 0;
    const berserk = s.berserk && p.hp <= p.maxHp / 2 ? 1 + 0.4 * s.berserk : 1;
    const dmg = s.damage * s.damageMul * berserk * mult * (fifth ? 2 + 0.5 * (s.fifth - 1) : 1) * (finisher ? 1.35 : 1);
    const range = s.range + (finisher ? 0.3 : 0), arc = finisher ? Math.PI * 2.05 : s.arc;
    this.fx.slash(p.x, 0.55, p.z, angle, Math.min(arc, Math.PI * 1.98), range + 0.15, fifth || finisher ? 0xffffff : this.trailColor, isEcho ? 0.12 : finisher ? 0.22 : 0.15, p.swingFlip);
    if (finisher) { audio.play('heavy'); this.world.addShake(0.16); this.fx.ring(p.x, p.z, this.trailColor, 0.4, range + 0.4, 0.28); }
    if (isEcho) this.fx.slash(p.x, 0.5, p.z, angle, arc, range * 0.9, this.trailColor, 0.1, !p.swingFlip);
    audio.play('swing');
    if (fifth) { audio.play('heavy'); this.world.addShake(0.18); }
    const dirx = Math.sin(angle), dirz = Math.cos(angle);
    p.vx += dirx * 2.2; p.vz += dirz * 2.2;

    let hits = 0, crit = false, kill = false;
    const inArc = (x, z, r) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > range + r) return false;
      if (d < r + 0.55) return true;
      const a = Math.atan2(dx, dz);
      return Math.abs(angleDiff(angle, a)) <= arc / 2 + Math.atan2(r, d);
    };
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn' || e.decor) continue;
      if (!inArc(e.x, e.z, e.r)) continue;
      const ex = e.x - p.x, ez = e.z - p.z, el = Math.hypot(ex, ez) || 1;
      const res = this.damageEnemy(e, dmg, { dirx: finisher ? ex / el : dirx, dirz: finisher ? ez / el : dirz, kb: s.knockback * (fifth ? 1.8 : 1) * (finisher ? 1.7 : 1), proc: true, forceCrit: fifth });
      hits++; if (res.crit) crit = true; if (res.kill) kill = true;
    }
    const b = this.boss;
    if (b && b.active && !b.dead && inArc(b.x, b.z, b.r)) { const res = this.damageBoss(dmg, { proc: true, forceCrit: fifth }); hits++; if (res.crit) crit = true; }
    // crates
    if (this.room.crates.length) this.room.crates.forEach(([i, j], k) => {
      if (!this.crates[k]) return;
      const [cx, cz] = toWorld(this.room, i, j);
      if (inArc(cx, cz, 0.45)) this.breakCrate(k);
    });
    // Swings cut enemy bullets: a reward for aggressive play.
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bl = this.bullets[i];
      if (inArc(bl.x, bl.z, bl.r)) { this.fx.burst(bl.x, bl.y, bl.z, 5, 0xff7ab0, { speed: 4, up: 2, life: 0.25, size: 0.1 }); this.bullets.splice(i, 1); }
    }
    // Blade waves
    if (s.waves > 0) {
      const n = s.waves, spread = 0.22;
      for (let k = 0; k < n; k++) {
        const a = angle + (k - (n - 1) / 2) * spread;
        this.spawnProj('wave', p.x + Math.sin(a) * 0.5, p.z + Math.cos(a) * 0.5, a, 15, dmg * 0.55);
      }
    }
    if (hits) {
      this.hitstop = Math.max(this.hitstop, crit || kill ? 0.065 : 0.035);
      this.world.addShake(crit ? 0.22 : 0.12);
    }
    if (s.echo > 0 && !isEcho) {
      for (let k = 1; k <= s.echo; k++) this.later(0.13 * k, () => { if (!this.player.dead) this.swing(angle, mult * 0.6, true); });
    }
  }

  spawnProj(kind, x, z, angle, speed, dmg, o = {}) {
    const s = this.stats;
    this.projs.push({
      kind, x, z, angle, vx: Math.sin(angle) * speed, vz: Math.cos(angle) * speed, speed, dmg,
      life: kind === 'wave' ? 0.55 : kind === 'mini' ? 0.4 : 0.9, r: kind === 'wave' ? 0.5 : 0.2,
      pierce: s.pierce + (o.pierce || 0), bounce: s.bounce, hit: new Set(), split: kind !== 'mini', age: 0,
    });
  }

  updateCompanions(dt) {
    const p = this.player, s = this.stats;
    // Orbit blades
    if (s.orbit > 0) {
      this._orbitA = (this._orbitA || 0) + dt * 3.4;
      const R = 1.75;
      for (let k = 0; k < s.orbit; k++) {
        const a = this._orbitA + k * TAU / s.orbit, ox = p.x + Math.sin(a) * R, oz = p.z + Math.cos(a) * R;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn' || e.decor || e.orbitCd > this.time) continue;
          if (dist2(e.x, e.z, ox, oz) < (e.r + 0.4) ** 2) { e.orbitCd = this.time + 0.3; this.damageEnemy(e, s.damage * s.damageMul * 0.45, { dirx: Math.cos(a), dirz: -Math.sin(a), kb: 0.5 }); }
        }
        const b = this.boss;
        if (b && b.active && !b.dead && (b.orbitCd || 0) < this.time && dist2(b.x, b.z, ox, oz) < (b.r + 0.4) ** 2) { b.orbitCd = this.time + 0.3; this.damageBoss(s.damage * s.damageMul * 0.45, {}); }
      }
    }
    // Drones
    if (s.drones > 0) {
      this.droneT = (this.droneT || 0) - dt;
      if (this.droneT <= 0 && (this.phase === 'fight')) {
        this.droneT = 0.75 / Math.sqrt(s.drones);
        const k = (this._droneTurn = ((this._droneTurn || 0) + 1) % s.drones);
        const dp = this.dronePos(k);
        let best = null, bd = 64;
        for (const e of this.enemies) {
          if (e.dead || e.state === 'spawn' || e.decor) continue;
          const d = dist2(e.x, e.z, dp.x, dp.z);
          if (d < bd && lineOfSight(this.room, dp.x, dp.z, e.x, e.z)) { bd = d; best = e; }
        }
        const b = this.boss;
        if (!best && b && b.active && !b.dead) best = b;
        if (best) {
          const a = Math.atan2(best.x - dp.x, best.z - dp.z);
          this.spawnProj('drone', dp.x, dp.z, a, 17, s.damage * s.damageMul * 0.45);
          audio.play('enemyShoot');
        }
      }
    }
  }

  dronePos(k) {
    const p = this.player, a = this.time * 1.4 + k * TAU / Math.max(1, this.stats.drones);
    return { x: p.x + Math.sin(a) * 1.15, y: 1.45 + Math.sin(this.time * 3 + k) * 0.12, z: p.z + Math.cos(a) * 1.15 };
  }

  hurtPlayer(dmg, sx, sz) {
    const p = this.player;
    if (p.dead || p.iframes > 0 || p.dashT > 0 || this.phase === 'leave' || this.phase === 'cards') return false;
    p.hp -= dmg;
    p.iframes = 0.9; p.flash = 0.15; p.hurtT = 0.3;
    this.run.hurtThisFloor = true;
    const dx = p.x - sx, dz = p.z - sz, l = Math.hypot(dx, dz) || 1;
    p.vx += dx / l * 9; p.vz += dz / l * 9;
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.world.addShake(0.5);
    this.fx.number(p.x, 1.5, p.z, dmg, 'player');
    this.fx.burst(p.x, 0.7, p.z, 10, 0xff5a4a, { speed: 5, up: 3, life: 0.4, size: 0.13 });
    audio.play('hurt');
    this.ui.hurtFlash();
    if (this.stats.thorns > 0) this.explosion(p.x, p.z, 2.6, this.stats.damage * this.stats.damageMul * 0.9 * this.stats.thorns, { color: 0xff8a6a, kb: 2.5 });
    if (p.hp <= 0 && this.run.tutorial) { p.hp = 1; this.ui.toast('TRAINING', 'You cannot fall here. Keep going.'); }
    if (p.hp <= 0) {
      if (this.stats.phoenix && !this.run.phoenixUsed) {
        this.run.phoenixUsed = true;
        p.hp = Math.ceil(p.maxHp * 0.6); p.iframes = 2.2;
        this.fx.ring(p.x, p.z, 0xf2b24a, 0.5, 7, 0.7);
        this.fx.burst(p.x, 0.6, p.z, 40, 0xf2b24a, { speed: 9, up: 6, life: 0.8, size: 0.18 });
        this.bullets.length = 0;
        for (const e of this.enemies) { const ex = e.x - p.x, ez = e.z - p.z, el = Math.hypot(ex, ez) || 1; e.kbx += ex / el * 14; e.kbz += ez / el * 14; }
        audio.play('revive');
        this.ui.toast('PHOENIX HEART', 'Back from the ashes');
        this.timeScale = 0.25;
        return true;
      }
      this.killPlayer();
    }
    return true;
  }

  giveUp() { this.phase = 'dead'; this.ui.showResults(this, this.finishRun()); }

  revive() {
    const p = this.player, run = this.run;
    run.revived = true;
    p.dead = false; p.hp = Math.ceil(p.maxHp * 0.5); p.iframes = 2.5; p.dashT = 0;
    this.bullets.length = 0; this.hazards.length = 0;
    for (const e of this.enemies) { const ex = e.x - p.x, ez = e.z - p.z, el = Math.hypot(ex, ez) || 1; e.kbx += ex / el * 14; e.kbz += ez / el * 14; e.stun = 1; }
    this.phase = this.prePhase || 'fight'; this.phaseT = 1; this.timeScale = 1;
    this.pm.root.visible = true;
    this.fx.ring(p.x, p.z, 0xf2b24a, 0.5, 7, 0.7);
    this.fx.burst(p.x, 0.6, p.z, 40, 0xf2b24a, { speed: 9, up: 6, life: 0.8, size: 0.18 });
    audio.play('revive'); audio.setMode(this.boss && !this.boss.dead ? 'boss' : 'run');
    this.ui.show('hud');
    crazy.gameplayStart();
  }

  killPlayer() {
    const p = this.player;
    this.prePhase = this.phase === 'dying' ? this.prePhase : this.phase;
    crazy.gameplayStop();
    p.dead = true; p.hp = 0; p.deathT = 0;
    this.phase = 'dying'; this.phaseT = 0;
    this.timeScale = 0.25;
    this.world.addShake(0.8);
    this.pm.root.visible = false;
    const c = this.skin.c;
    for (const col of [c.body, c.trim, c.head]) this.fx.burst(p.x, 0.6, p.z, 12, col, { speed: 6, up: 6, life: 1.6, size: 0.2, debris: true, grav: 18 });
    this.fx.burst(p.x, 0.6, p.z, 24, this.trailColor, { speed: 8, up: 4, life: 0.7, size: 0.14 });
    this.fx.ring(p.x, p.z, 0xffffff, 0.3, 4, 0.6);
    audio.play('gameOver');
    audio.setMode('off');
    this.ui.onDeath();
  }

  // ------------------------------------------------------------------ damage
  rollCrit(o) {
    const s = this.stats;
    return o.forceCrit || (o.canCrit !== false && Math.random() < s.critChance);
  }

  damageEnemy(e, amount, o = {}) {
    if (e.dead || e.state === 'spawn') return { crit: false, kill: false };
    const s = this.stats;
    const crit = this.rollCrit(o);
    const dmg = amount * (crit ? s.critMult : 1);
    e.hp -= dmg;
    e.flash = 0.1;
    const kb = (o.kb ?? 1) * (1 - e.kbResist) * (e.mini ? 1.3 : 1);
    if (o.dirx !== undefined) { e.kbx += o.dirx * 7 * kb; e.kbz += o.dirz * 7 * kb; e.hx = o.dirx; e.hz = o.dirz; }
    e.sqv += o.aoe ? 5 : 11; e.hitT = 0.18;
    if (!o.aoe) {
      const hy = e.model ? e.model.height * (e.r / e.def.r) * 0.55 : 0.6;
      this.fx.impact(e.x - (o.dirx || 0) * e.r * 0.7, hy, e.z - (o.dirz || 0) * e.r * 0.7, crit ? 0xffc35a : 0xffffff, crit ? 2.4 : 1.4);
      if (crit) this.world.punch(0.03);
    }
    if (s.frost > 0 && o.proc) e.slow = 1.5;
    if (s.burnHits && o.proc && !o.aoe) { e.burn = 2; e.burnDps = Math.max(e.burnDps || 0, s.damage * 0.3); }
    const y = e.model ? e.model.height * (e.r / e.def.r) * 0.6 : 0.8;
    this.fx.number(e.x, y + 0.5, e.z, dmg, crit ? 'crit' : o.aoe ? 'aoe' : 'normal');
    if (o.quiet) { e.flash = 0.05; }
    const col = ENEMY_COLORS[e.type];
    if (!o.aoe) {
      const dir = o.dirx !== undefined ? Math.atan2(o.dirx, o.dirz) : undefined;
      this.fx.burst(e.x, y, e.z, crit ? 9 : 5, crit ? 0xffd08a : 0xfff4e0, { speed: crit ? 9 : 6, up: 3, life: 0.28, size: 0.11, dir, spread: 0.9 });
      this.fx.burst(e.x, y, e.z, 3, col, { speed: 4, up: 4, life: 0.5, size: 0.12, debris: true, dir, spread: 1 });
      audio.play('hit', { crit });
    }
    let kill = false;
    if (e.hp <= 0) { this.killEnemy(e, o); kill = true; }
    if (o.proc) this.procs(e.x, e.z, amount, crit, e);
    return { crit, kill };
  }

  // On-hit effects shared by enemies and the boss.
  procs(x, z, amount, crit, target) {
    const s = this.stats, base = s.damage * s.damageMul;
    if (s.explode > 0) this.later(0.04, () => this.explosion(x, z, 1.3 + 0.3 * (s.explode - 1), base * 0.4 * s.explode, { color: 0xffa04a, small: true }));
    if (s.chain > 0 && Math.random() < s.chain) this.chainLightning(x, z, 2 + Math.floor(s.chain / 0.4), base * 0.55, target);
    if (s.storm > 0 && crit) this.stormStrike(x, z, base * 0.9);
  }

  damageBoss(amount, o = {}) {
    const b = this.boss;
    if (!b || b.dead || !b.active) return { crit: false };
    const s = this.stats;
    const crit = this.rollCrit(o);
    const dmg = amount * (crit ? s.critMult : 1);
    b.hp -= dmg; b.flash = 0.1;
    this.fx.number(b.x, b.model.height * 0.7, b.z, dmg, crit ? 'crit' : o.aoe ? 'aoe' : 'normal');
    if (!o.aoe) { this.fx.burst(b.x, b.model.height * 0.5, b.z, crit ? 8 : 4, 0xfff4e0, { speed: 7, up: 3, life: 0.28, size: 0.12 }); audio.play('hit', { crit }); }
    if (s.frost > 0 && o.proc) b.slow = 1.0;
    if (o.proc) this.procs(b.x, b.z, amount, crit, b);
    if (b.hp <= 0) this.killBoss();
    return { crit };
  }

  killBoss() {
    const b = this.boss, run = this.run;
    b.dead = true; b.deathT = 0;
    run.bossKills++;
    const d = save.data;
    d.bossesKilled[b.kind] = (d.bossesKilled[b.kind] || 0) + 1;
    this.registerKill(b.kind);
    this.unlock(b.kind);
    this.timeScale = 0.2;
    this.hitstop = 0.15;
    this.world.addShake(1);
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e, { silent: true });
    this.bullets.length = 0; this.hazards.length = 0;
    for (const m of this.fx.markers) this.fx.releaseMarker(m);
    audio.play('bossDown');
    crazy.happytime();
    this.ui.banner('BOSS DEFEATED', BOSS_INFO[b.kind].name);
    for (let k = 0; k < 5; k++) this.later(k * 0.12, () => {
      this.fx.burst(b.x + rand(-1, 1), 1.5, b.z + rand(-1, 1), 26, k % 2 ? 0xffd08a : 0xff6a4a, { speed: 10, up: 8, life: 0.9, size: 0.2 });
      this.fx.ring(b.x, b.z, 0xffd08a, 0.5, 4 + k, 0.5);
      audio.play('explode');
    });
    this.dropCoins(b.x, b.z, Math.round((30 + run.floor * 1.5) * this.stats.coinMul));
    this.later(0.6, () => { if (b.model) b.model.root.visible = false; });
  }

  killEnemy(e, o = {}) {
    if (e.dead) return;
    e.dead = true; e.deathT = 0;
    if (e.marker) { this.fx.releaseMarker(e.marker); e.marker = null; }
    if (e.tele) { this.fx.releaseMarker(e.tele); e.tele = null; }
    if (e.decor) return;
    const run = this.run, s = this.stats;
    run.kills++;
    save.data.totalKills++;
    this.registerKill(e.mini ? 'splitling' : e.type);
    const col = ENEMY_COLORS[e.type];
    const fling = e.type === 'tank' ? 3 : 7;
    e.dvx = (e.hx || 0) * fling + rand(-1, 1); e.dvz = (e.hz || 0) * fling + rand(-1, 1); e.dvy = e.type === 'tank' ? 3 : 6;
    e.spin = rand(8, 16) * (Math.random() < 0.5 ? -1 : 1);
    this.fx.burst(e.x, 0.5, e.z, 5, col, { speed: 5, up: 4, life: 0.5, size: 0.12, debris: true });
    if (!o.silent) audio.play('death');
    // coins
    const sc = this.floorScale();
    const base = e.mini ? (Math.random() < 0.4 ? 1 : 0) : e.def.coins * (e.elite ? 3 : 1);
    const n = base * s.coinMul * (1 + sc.f * 0.025);
    this.dropCoins(e.x, e.z, Math.floor(n) + (Math.random() < n % 1 ? 1 : 0));
    if (s.lifesteal > 0) this.heal(s.lifesteal);
    if (s.corpse > 0) this.later(0.07, () => this.explosion(e.x, e.z, 1.8 + 0.25 * s.corpse, s.damage * s.damageMul * 0.6 * s.corpse, { color: col }));
    if (e.type === 'splitter' && !e.mini) {
      for (let k = 0; k < 2; k++) {
        const a = rand(0, TAU);
        const m = this.spawnEnemy('splitter', e.x + Math.sin(a) * 0.4, e.z + Math.cos(a) * 0.4, { mini: true, instant: true, elite: false });
        this.registerSeen('splitling');
        m.state = 'chase'; m.kbx = Math.sin(a) * 8; m.kbz = Math.cos(a) * 8; m.cd = 0.5;
      }
    }
    // Chain-kill achievement + last kill punch.
    const now = performance.now();
    this.killTimes.push(now);
    while (this.killTimes.length && now - this.killTimes[0] > 1000) this.killTimes.shift();
    if (this.killTimes.length >= 8) this.unlock('chain');
    if (this.phase === 'fight' && !this.boss && this.waveIdx >= this.waves.length && this.enemies.every(x => x.dead || x.decor)) {
      this.hitstop = Math.max(this.hitstop, 0.12);
      this.timeScale = 0.35;
      this.world.addShake(0.3);
      this.world.punch(0.07);
    }
  }

  explosion(x, z, radius, dmg, o = {}) {
    this.fx.ring(x, z, o.color || 0xffa04a, 0.2, radius, 0.32);
    this.fx.burst(x, 0.4, z, o.small ? 8 : 16, o.color || 0xffa04a, { speed: radius * 4, up: 4, life: 0.4, size: 0.16 });
    if (o.sound !== false) audio.play('explode');
    this.world.addShake(o.small ? 0.06 : 0.15);
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn' || e.decor) continue;
      const d2 = dist2(e.x, e.z, x, z);
      if (d2 > (radius + e.r) ** 2) continue;
      const d = Math.sqrt(d2) || 1;
      this.damageEnemy(e, dmg, { aoe: true, dirx: (e.x - x) / d, dirz: (e.z - z) / d, kb: o.kb ?? 0.7 });
    }
    const b = this.boss;
    if (b && b.active && !b.dead && dist2(b.x, b.z, x, z) < (radius + b.r) ** 2) this.damageBoss(dmg, { aoe: true });
    if (this.room.crates.length) this.room.crates.forEach(([i, j], k) => {
      if (!this.crates[k]) return;
      const [cx, cz] = toWorld(this.room, i, j);
      if (dist2(cx, cz, x, z) < r2 + 0.3) this.breakCrate(k);
    });
  }

  chainLightning(x, z, count, dmg, from) {
    let cx = x, cz = z;
    const hit = new Set([from]);
    for (let k = 0; k < count; k++) {
      let best = null, bd = 4.8 * 4.8;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e) || e.state === 'spawn' || e.decor) continue;
        const d = dist2(e.x, e.z, cx, cz);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hit.add(best);
      this.fx.bolt(cx, 0.8, cz, best.x, 0.8, best.z, 0xbfe4ff);
      this.damageEnemy(best, dmg, { aoe: true });
      cx = best.x; cz = best.z;
    }
    if (hit.size > 1) audio.play('zap');
  }

  stormStrike(x, z, dmg) {
    const targets = this.enemies.filter(e => !e.dead && e.state !== 'spawn' && !e.decor && dist2(e.x, e.z, x, z) < 49).sort(() => Math.random() - 0.5).slice(0, 3);
    const b = this.boss;
    if (b && b.active && !b.dead && targets.length < 3) targets.push(b);
    for (const t of targets) {
      this.fx.bolt(t.x + rand(-1, 1), 9, t.z - 2, t.x, 0.3, t.z, 0xe8f2ff, 0.2);
      this.fx.ring(t.x, t.z, 0xbfe4ff, 0.1, 1.2, 0.25);
      if (t === b) this.damageBoss(dmg, { aoe: true }); else this.damageEnemy(t, dmg, { aoe: true });
    }
    if (targets.length) { audio.play('zap'); this.world.addShake(0.1); }
  }

  breakCrate(k) {
    this.crates[k] = false;
    const [i, j] = this.room.crates[k];
    this.room.tiles[j * this.room.w + i] = T.FLOOR;
    this.flow.ti = -1;
    this.world.setCrate(k, false);
    const [x, z] = toWorld(this.room, i, j);
    this.fx.burst(x, 0.5, z, 14, 0x9a7048, { speed: 6, up: 6, life: 1, size: 0.18, debris: true, grav: 20 });
    audio.play('crate');
    if (this.mode === 'run') this.dropCoins(x, z, Math.round((1 + Math.random() * 2) * this.stats.coinMul));
  }

  dropCoins(x, z, n) {
    for (let k = 0; k < n; k++) {
      const a = rand(0, TAU), s = rand(1.5, 4.5);
      this.coins.push({ x, y: 0.6, z, vx: Math.sin(a) * s, vy: rand(4, 7), vz: Math.cos(a) * s, t: 0, spin: rand(0, TAU) });
    }
  }

  // ------------------------------------------------------------------ enemies
  updateEnemies(dt) {
    const p = this.player, room = this.room;
    const [pi, pj] = toTile(room, p.x, p.z);
    this.flow.update(pi, pj);
    const list = this.enemies;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) {
        // Knocked away, spinning, then it bursts.
        e.deathT += dt;
        e.x += e.dvx * dt; e.z += e.dvz * dt; e.y += e.dvy * dt; e.dvy -= 26 * dt;
        if (e.y < 0) { e.y = 0; e.dvy = 0; }
        e.dvx *= Math.exp(-3 * dt); e.dvz *= Math.exp(-3 * dt);
        if (e.deathT > 0.26 && !e.popped) {
          e.popped = true;
          const col = ENEMY_COLORS[e.type], big = e.type === 'tank';
          this.fx.burst(e.x, e.y + 0.5, e.z, big ? 18 : 11, col, { speed: 7, up: 6, life: 0.9, size: big ? 0.22 : 0.16, debris: true, grav: 20 });
          this.fx.burst(e.x, e.y + 0.5, e.z, 10, 0xfff2dc, { speed: 9, up: 3, life: 0.3, size: 0.1 });
          this.fx.impact(e.x, e.y + 0.6, e.z, col, big ? 3.2 : 2.2, 0.16);
          this.fx.ring(e.x, e.z, col, 0.2, 1.5 * (e.r / 0.4), 0.32);
        }
        collideCircle(this.room, e, e.r * 0.5);
        if (e.deathT > 0.3) { this.releaseModel(e); list.splice(i, 1); }
        continue;
      }
      e.flash -= dt; e.slow -= dt;
      if (e.state === 'spawn') {
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.state = 'chase'; e.pop = 0;
          if (!e.decor) this.registerSeen(e.mini ? 'splitling' : e.type);
          if (e.marker) { this.fx.releaseMarker(e.marker); e.marker = null; }
          e.model.root.visible = true;
          this.fx.burst(e.x, 0.2, e.z, 8, 0xf2d6a0, { speed: 3.5, up: 4, life: 0.4, size: 0.1 });
          this.fx.beam(e.x, e.z, e.elite ? 0xf2b24a : 0xffd9a8, e.r + 0.25, 0.55);
          this.fx.ring(e.x, e.z, 0xf2d6a0, 0.1, e.r + 0.9, 0.35);
        }
        continue;
      }
      e.pop = Math.min(1, e.pop + dt * 5);
      this.enemyAI(e, dt);
      // knockback decays
      const kd = Math.exp(-9 * dt);
      e.kbx *= kd; e.kbz *= kd;
      e.x += (e.vx + e.kbx) * dt; e.z += (e.vz + e.kbz) * dt;
    }
    // Separation (cheap O(n^2), n is small).
    for (let a = 0; a < list.length; a++) {
      const A = list[a]; if (A.dead || A.state === 'spawn') continue;
      for (let b = a + 1; b < list.length; b++) {
        const B = list[b]; if (B.dead || B.state === 'spawn') continue;
        const dx = B.x - A.x, dz = B.z - A.z, rr = A.r + B.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
          const wa = A.type === 'tank' ? 0.2 : 1, wb = B.type === 'tank' ? 0.2 : 1;
          A.x -= nx * push * wa; A.z -= nz * push * wa; B.x += nx * push * wb; B.z += nz * push * wb;
        }
      }
    }
    for (const e of list) if (!e.dead && e.state !== 'spawn') {
      const hit = collideCircle(room, e, e.r);
      if (hit.hit && e.state === 'dash') { e.state = 'stun'; e.t = 0.55; e.vx = e.vz = 0; this.world.addShake(0.08); if (e.tele) { this.fx.releaseMarker(e.tele); e.tele = null; } }
    }
  }

  moveToward(e, dt, tx, tz, speedMul = 1) {
    const room = this.room;
    let dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    if (!lineOfSight(room, e.x, e.z, tx, tz)) {
      const f = this.flow.dir(e.x, e.z);
      if (f) { dx = f.x; dz = f.z; }
    }
    const sp = e.speed * speedMul * (e.slow > 0 ? 0.6 : 1);
    e.vx = damp(e.vx, dx * sp, 8, dt); e.vz = damp(e.vz, dz * sp, 8, dt);
    if (Math.hypot(e.vx, e.vz) > 0.3) e.face += angleDiff(e.face, Math.atan2(e.vx, e.vz)) * Math.min(1, dt * 10);
  }

  enemyAI(e, dt) {
    const p = this.player, sc = this.floorScale();
    if (e.decor) { this.decorAI(e, dt); return; }
    if (e.burn > 0) {
      e.burn -= dt; e.burnTick = (e.burnTick || 0) - dt;
      if (Math.random() < dt * 14) this.fx.emit(e.x + rand(-0.2, 0.2), 0.5 + rand(0, 0.5), e.z + rand(-0.2, 0.2), 0, 1.8, 0, 0.45, 0.13, FIRE_COL, { grav: -1, drag: 1 });
      if (e.burnTick <= 0) { e.burnTick = 0.5; this.damageEnemy(e, e.burnDps * 0.5, { aoe: true, canCrit: false, quiet: true }); if (e.dead) return; }
    }
    if (e.stun > 0) {
      e.stun -= dt; e.vx = damp(e.vx, 0, 14, dt); e.vz = damp(e.vz, 0, 14, dt);
      if (e.tele) { this.fx.releaseMarker(e.tele); e.tele = null; }
      if (e.state !== 'chase' && e.state !== 'spawn') { e.state = 'chase'; e.cd = Math.max(e.cd, 0.6); }
      if (Math.random() < dt * 8) this.fx.emit(e.x + rand(-0.3, 0.3), 1.1, e.z + rand(-0.3, 0.3), rand(-1, 1), 0.3, rand(-1, 1), 0.3, 0.09, STUN_COL, { grav: 0, drag: 2 });
      return;
    }
    const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz);
    const toP = Math.atan2(dx, dz);
    const slow = e.slow > 0 ? 0.6 : 1;
    e.cd -= dt * slow; e.t -= dt * slow; e.touchCd -= dt;
    const stop = () => { e.vx = damp(e.vx, 0, 12, dt); e.vz = damp(e.vz, 0, 12, dt); };
    const face = (a, k = 12) => { e.face += angleDiff(e.face, a) * Math.min(1, dt * k); };
    const playerTargetable = !p.dead && this.phase !== 'leave';
    switch (e.type) {
      case 'runner':
        if (e.state === 'chase') {
          if (!playerTargetable) { stop(); break; }
          this.moveToward(e, dt, p.x, p.z);
          if (d < 1.5 && e.cd <= 0) { e.state = 'windup'; e.t = 0.3 * sc.cd + 0.05; e.aim = toP; }
        } else if (e.state === 'windup') {
          stop(); face(e.aim, 20);
          if (e.t <= 0) { e.state = 'bite'; e.t = 0.16; e.hitDone = false; e.vx = Math.sin(e.aim) * 9; e.vz = Math.cos(e.aim) * 9; }
        } else if (e.state === 'bite') {
          if (!e.hitDone && d < e.r + p.r + 0.3) { e.hitDone = true; this.hurtPlayer(e.dmg, e.x, e.z); }
          if (e.t <= 0) { e.state = 'recover'; e.t = 0.38; }
        } else if (e.state === 'recover') { stop(); if (e.t <= 0) { e.state = 'chase'; e.cd = 0.7 * sc.cd; } }
        break;
      case 'shooter':
        if (e.state === 'chase') {
          if (!playerTargetable) { stop(); break; }
          const los = lineOfSight(this.room, e.x, e.z, p.x, p.z);
          if (d > 7.5 || !los) this.moveToward(e, dt, p.x, p.z, 1);
          else if (d < 4.5) this.moveToward(e, dt, e.x - dx, e.z - dz, 1);
          else {
            const sx = -dz / d * e.strafe, sz = dx / d * e.strafe;
            e.vx = damp(e.vx, sx * e.speed * 0.6, 4, dt); e.vz = damp(e.vz, sz * e.speed * 0.6, 4, dt);
            if (Math.random() < dt * 0.4) e.strafe *= -1;
          }
          face(toP);
          if (e.cd <= 0 && los && d < 11) { e.state = 'windup'; e.t = 0.55; audio.play('telegraph'); }
        } else if (e.state === 'windup') {
          stop(); face(toP);
          if (e.t <= 0) {
            const n = sc.f >= 20 ? 5 : sc.f >= 8 ? 3 : 1, spread = 0.32;
            const speed = 6.3 + Math.min(3, sc.f * 0.06);
            for (let k = 0; k < n; k++) this.fireBullet(e.x + Math.sin(toP) * 0.4, e.z + Math.cos(toP) * 0.4, toP + (k - (n - 1) / 2) * spread, speed, e.dmg, { y: 0.95 });
            audio.play('enemyShoot');
            e.state = 'recover'; e.t = 0.3;
          }
        } else if (e.state === 'recover') { stop(); if (e.t <= 0) { e.state = 'chase'; e.cd = rand(2.0, 2.6) * sc.cd; } }
        break;
      case 'tank':
        if (e.state === 'chase') {
          if (!playerTargetable) { stop(); break; }
          this.moveToward(e, dt, p.x, p.z);
          if (d < 2.4 && e.cd <= 0) { e.state = 'windup'; e.t = 0.8 * Math.max(0.75, sc.cd); e.tele = this.fx.circleMarker(e.x, e.z, 2.5, e.t); audio.play('telegraph'); }
        } else if (e.state === 'windup') {
          stop(); face(toP);
          if (e.tele) e.tele.g.position.set(e.x, 0.035, e.z);
          if (e.t <= 0) {
            if (e.tele) { this.fx.releaseMarker(e.tele); e.tele = null; }
            this.fx.ring(e.x, e.z, 0xffb08a, 0.4, 2.6, 0.35);
            this.fx.burst(e.x, 0.1, e.z, 14, 0xb8a898, { speed: 7, up: 3, life: 0.5, size: 0.15, debris: true });
            audio.play('slam'); this.world.addShake(0.25);
            if (d < 2.5 + p.r) this.hurtPlayer(e.dmg, e.x, e.z);
            e.state = 'recover'; e.t = 0.7;
          }
        } else if (e.state === 'recover') { stop(); if (e.t <= 0) { e.state = 'chase'; e.cd = 1.6 * sc.cd; } }
        break;
      case 'dasher':
        if (e.state === 'chase') {
          if (!playerTargetable) { stop(); break; }
          const los = lineOfSight(this.room, e.x, e.z, p.x, p.z);
          if (d > 6 || !los) this.moveToward(e, dt, p.x, p.z);
          else {
            const sx = -dz / d * e.strafe, sz = dx / d * e.strafe;
            e.vx = damp(e.vx, sx * e.speed, 5, dt); e.vz = damp(e.vz, sz * e.speed, 5, dt);
          }
          face(toP);
          if (e.cd <= 0 && los && d < 9) {
            e.state = 'aim'; e.t = 0.65 * Math.max(0.8, sc.cd); e.aim = toP;
            e.dashLen = Math.min(9, d + 2.5);
            e.tele = this.fx.lineMarker(e.x, e.z, e.aim, e.dashLen, e.r * 2 + 0.2, e.t);
            audio.play('telegraph');
          }
        } else if (e.state === 'aim') {
          stop(); face(e.aim, 25);
          if (e.tele) e.tele.g.position.set(e.x, 0.035, e.z);
          if (e.t <= 0) { e.state = 'dash'; e.t = e.dashLen / 17; e.hitDone = false; e.vx = Math.sin(e.aim) * 17; e.vz = Math.cos(e.aim) * 17; audio.play('dash'); }
        } else if (e.state === 'dash') {
          if (this.time % 0.02 < dt) this.fx.emit(e.x, 0.5, e.z, 0, 0, 0, 0.25, 0.25, this._dashCol || (this._dashCol = new THREE.Color(ENEMY_COLORS.dasher)), { grav: 0 });
          if (!e.hitDone && d < e.r + p.r + 0.15) { e.hitDone = true; this.hurtPlayer(e.dmg, e.x, e.z); }
          if (e.t <= 0) { e.state = 'stun'; e.t = 0.5; if (e.tele) { this.fx.releaseMarker(e.tele); e.tele = null; } }
        } else if (e.state === 'stun') { stop(); if (e.t <= 0) { e.state = 'chase'; e.cd = rand(2.2, 3) * sc.cd; } }
        break;
      case 'splitter':
        if (!playerTargetable) { stop(); break; }
        e.wob += dt * 6;
        this.moveToward(e, dt, p.x + Math.sin(e.wob) * 0.6, p.z + Math.cos(e.wob * 0.7) * 0.6);
        if (d < e.r + p.r + 0.05 && e.touchCd <= 0) { e.touchCd = 0.9; this.hurtPlayer(e.dmg, e.x, e.z); }
        break;
    }
    if (e.state === 'dash' || e.state === 'bite') face(Math.atan2(e.vx, e.vz), 30);
  }

  decorAI(e, dt) {
    e.t -= dt;
    if (e.t <= 0 || dist2(e.x, e.z, e.wx, e.wz) < 0.3) {
      if (e.t <= -1.5 || dist2(e.x, e.z, e.wx, e.wz) < 0.3) {
        const room = this.room;
        for (let k = 0; k < 10; k++) {
          const i = 1 + Math.floor(Math.random() * (room.w - 2)), j = 1 + Math.floor(Math.random() * (room.h - 2));
          if (tileAt(room, i, j) === T.FLOOR) { [e.wx, e.wz] = toWorld(room, i, j); break; }
        }
        e.t = rand(1.5, 4);
      }
    }
    const dx = e.wx - e.x, dz = e.wz - e.z, d = Math.hypot(dx, dz);
    const sp = d > 0.4 && e.t > 0 ? e.speed * 0.35 : 0;
    e.vx = damp(e.vx, d > 0 ? dx / d * sp : 0, 4, dt); e.vz = damp(e.vz, d > 0 ? dz / d * sp : 0, 4, dt);
    if (sp > 0) e.face += angleDiff(e.face, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
  }

  // ------------------------------------------------------------------ projectiles & bullets
  updateProjectiles(dt) {
    const room = this.room;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.age += dt; pr.life -= dt;
      if (pr.kind === 'boulder') {
        pr.t += dt;
        pr.spin = (pr.spin || 0) + dt * 9;
        if (pr.t < 0) { const q = 1 + pr.t / 0.13; pr.x = pr.sx; pr.z = pr.sz; pr.y = -0.5 + q * 1.2; continue; }
        const k = Math.min(1, pr.t / pr.flight);
        pr.x = pr.sx + (pr.tx - pr.sx) * k; pr.z = pr.sz + (pr.tz - pr.sz) * k;
        pr.y = Math.sin(k * Math.PI) * (2.4 + (pr.big ? 1.5 : 0)) + 0.7 * (1 - k) + 0.3;
        if (Math.random() < dt * 30) this.fx.emit(pr.x, pr.y, pr.z, 0, 0, 0, 0.4, 0.12, DUST_COL, { grav: 2, drag: 2, debris: true });
        if (k >= 1) { this.boulderLand(pr); this.projs.splice(i, 1); }
        continue;
      }
      if (pr.kind === 'fireball') {
        pr.tr = (pr.tr || 0) + dt;
        while (pr.tr > 0.012) {
          pr.tr -= 0.012;
          const bk = rand(0.05, 0.25);
          this.fx.emit(pr.x - pr.vx * 0.01 + rand(-0.1, 0.1), 0.75 + rand(-0.08, 0.08), pr.z - pr.vz * 0.01 + rand(-0.1, 0.1), -pr.vx * bk * 0.15, rand(0.5, 1.5), -pr.vz * bk * 0.15, rand(0.22, 0.38), (pr.big ? 0.42 : 0.3), FIRE_HOT, { grav: -2, drag: 3, col2: 0xb01e06 });
          if (Math.random() < 0.3) this.fx.emit(pr.x, 0.8, pr.z, rand(-0.5, 0.5), rand(0.6, 1.2), rand(-0.5, 0.5), 0.9, 0.22, SMOKE_COL, { smoke: true, grav: -0.3, drag: 1.5, grow: 2 });
          if (Math.random() < 0.15) this.fx.emit(pr.x, 0.75, pr.z, rand(-2, 2), rand(1, 3), rand(-2, 2), 0.5, 0.05, FIRE_COL, { grav: 8, drag: 1 });
        }
      }
      if (pr.kind === 'wind' && Math.random() < dt * 50) { const sd = Math.sin(pr.age * 30) * 0.3; this.fx.emit(pr.x + Math.cos(pr.angle) * sd, 0.6, pr.z - Math.sin(pr.angle) * sd, 0, 0.2, 0, 0.3, 0.12, WIND_COL, { grav: 0, drag: 2 }); }
      if (pr.kind === 'wind' && pr.returns && pr.age > 0.35 && !pr.back) { pr.back = true; pr.hit.clear(); pr.life = 0.8; }
      if (pr.back) { const p = this.player, dx = p.x - pr.x, dz = p.z - pr.z, dd = Math.hypot(dx, dz) || 1; pr.vx = damp(pr.vx, dx / dd * 16, 8, dt); pr.vz = damp(pr.vz, dz / dd * 16, 8, dt); pr.angle = Math.atan2(pr.vx, pr.vz); if (dd < 0.6) pr.life = 0; }
      pr.x += pr.vx * dt; pr.z += pr.vz * dt;
      let dead = pr.life <= 0;
      if (dead && pr.kind === 'fireball') { this.fireExplode(pr); this.projs.splice(i, 1); continue; }
      // walls
      if (!dead && solidAt(room, pr.x, pr.z)) {
        // breakable crates
        const [ti, tj] = toTile(room, pr.x, pr.z);
        if (tileAt(room, ti, tj) === T.CRATE) {
          const k = room.crates.findIndex(([a, b]) => a === ti && b === tj);
          if (k >= 0 && this.crates[k]) this.breakCrate(k);
        }
        if (pr.bounce > 0) {
          pr.bounce--;
          pr.x -= pr.vx * dt; pr.z -= pr.vz * dt;
          const bx = solidAt(room, pr.x + pr.vx * dt, pr.z), bz = solidAt(room, pr.x, pr.z + pr.vz * dt);
          if (bx || !bz) pr.vx = -pr.vx;
          if (bz || !bx) pr.vz = -pr.vz;
          pr.angle = Math.atan2(pr.vx, pr.vz); pr.life = Math.max(pr.life, 0.35);
          this.fx.burst(pr.x, 0.5, pr.z, 4, 0xffe2a8, { speed: 3, up: 2, life: 0.2, size: 0.08 });
        } else if (pr.kind === 'fireball') { dead = true; pr.x -= pr.vx * dt; pr.z -= pr.vz * dt; this.fireExplode(pr); }
        else if (pr.kind === 'wind') { dead = true; }
        else {
          dead = true;
          if (this.stats.explode > 0) this.explosion(pr.x, pr.z, 1.1, this.stats.damage * this.stats.damageMul * 0.3 * this.stats.explode, { small: true, color: 0xffa04a });
          this.fx.burst(pr.x, 0.5, pr.z, 5, 0xffe2a8, { speed: 3, up: 2, life: 0.2, size: 0.09 });
        }
      }
      // cut enemy bullets (waves only)
      if (!dead && pr.kind === 'wave') {
        for (let b = this.bullets.length - 1; b >= 0; b--) {
          const bl = this.bullets[b];
          if (dist2(bl.x, bl.z, pr.x, pr.z) < (pr.r + bl.r) ** 2) { this.bullets.splice(b, 1); this.fx.burst(bl.x, bl.y, bl.z, 4, 0xff7ab0, { speed: 3, up: 2, life: 0.2, size: 0.09 }); }
        }
      }
      // enemies
      if (!dead) {
        const targets = this.enemies;
        let hitSomething = null;
        for (const e of targets) {
          if (e.dead || e.state === 'spawn' || e.decor || pr.hit.has(e)) continue;
          if (dist2(e.x, e.z, pr.x, pr.z) < (e.r + pr.r) ** 2) { hitSomething = e; break; }
        }
        const b = this.boss;
        let hitBoss = false;
        if (!hitSomething && b && b.active && !b.dead && !pr.hit.has(b) && dist2(b.x, b.z, pr.x, pr.z) < (b.r + pr.r) ** 2) hitBoss = true;
        if ((hitSomething || hitBoss) && pr.kind === 'fireball') { this.fireExplode(pr); this.projs.splice(i, 1); continue; }
        if (hitSomething || hitBoss) {
          const t = hitSomething || b;
          pr.hit.add(t);
          const l = Math.hypot(pr.vx, pr.vz) || 1;
          if (hitSomething) this.damageEnemy(t, pr.dmg, { dirx: pr.vx / l, dirz: pr.vz / l, kb: 0.6, proc: true });
          else this.damageBoss(pr.dmg, { proc: true });
          if (this.stats.hydra > 0 && pr.split && (pr.kind === 'wave' || pr.kind === 'drone')) {
            pr.split = false;
            for (const s of [-0.6, 0.6]) this.spawnProj('mini', pr.x, pr.z, pr.angle + s, pr.speed * 0.9, pr.dmg * 0.5);
            const last = this.projs[this.projs.length - 1], prev = this.projs[this.projs.length - 2];
            last.hit.add(t); prev.hit.add(t);
          }
          if (pr.pierce > 0) pr.pierce--;
          else if (pr.bounce > 0) {
            // ricochet to the next closest enemy
            pr.bounce--;
            let best = null, bd = 36;
            for (const e of targets) {
              if (e.dead || e.state === 'spawn' || e.decor || pr.hit.has(e)) continue;
              const dd = dist2(e.x, e.z, pr.x, pr.z); if (dd < bd) { bd = dd; best = e; }
            }
            if (best) { pr.angle = Math.atan2(best.x - pr.x, best.z - pr.z); }
            else pr.angle += Math.PI + rand(-0.6, 0.6);
            pr.vx = Math.sin(pr.angle) * pr.speed; pr.vz = Math.cos(pr.angle) * pr.speed;
            pr.life = Math.max(pr.life, 0.4);
          } else dead = true;
        }
      }
      if (dead) this.projs.splice(i, 1);
    }
  }

  updateBullets(dt) {
    const p = this.player, room = this.room;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.life <= 0 || solidAt(room, b.x, b.z)) {
        this.fx.burst(b.x, b.y, b.z, 4, 0xff6aa0, { speed: 3, up: 2, life: 0.2, size: 0.08 });
        this.bullets.splice(i, 1); continue;
      }
      if (!p.dead && dist2(b.x, b.z, p.x, p.z) < (b.r + p.r - 0.05) ** 2) {
        if (this.hurtPlayer(b.dmg, b.x - b.vx, b.z - b.vz)) { this.bullets.splice(i, 1); continue; }
      }
    }
  }

  // Expanding ring hazards (boss shockwaves): dodge by being outside the band or dashing through.
  updateHazards(dt) {
    const p = this.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.r += h.speed * dt;
      h.ringT = (h.ringT || 0) + dt;
      if (h.ringT > 0.05) { h.ringT = 0; this.fx.ring(h.x, h.z, 0xff7a3a, h.r, h.r + 0.05, 0.12, 0.08); }
      const d = Math.sqrt(dist2(p.x, p.z, h.x, h.z));
      if (!h.hit && Math.abs(d - h.r) < h.width && !p.dead) { if (this.hurtPlayer(h.dmg, h.x, h.z)) h.hit = true; }
      if (h.r > h.maxR) this.hazards.splice(i, 1);
    }
  }

  updateCoins(dt) {
    const p = this.player, s = this.stats;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt; c.spin += dt * 6;
      const d2 = dist2(c.x, c.z, p.x, p.z);
      if (c.t > 0.35 && !p.dead && (this.magnetAll || d2 < s.pickup * s.pickup || c.mag)) {
        c.mag = true;
        const d = Math.sqrt(d2) || 1, sp = Math.min(26, 8 + c.t * 14);
        c.vx = damp(c.vx, (p.x - c.x) / d * sp, 10, dt); c.vz = damp(c.vz, (p.z - c.z) / d * sp, 10, dt);
        c.y = damp(c.y, 0.7, 8, dt); c.vy = 0;
        if (d2 < 0.45) {
          this.coins.splice(i, 1);
          this.run.coins++; save.data.coins++; save.data.totalCoins++;
          audio.play('coin');
          this.fx.burst(p.x, 0.9, p.z, 2, 0xf2b24a, { speed: 2, up: 2, life: 0.25, size: 0.08 });
          this.ui.coinFly(c.x, c.y, c.z);
          this.ui.coinBump(this);
          continue;
        }
      } else {
        c.vy -= 22 * dt;
        const k = Math.exp(-2.2 * dt); c.vx *= k; c.vz *= k;
        if (c.y < 0.18) { c.y = 0.18; c.vy = Math.abs(c.vy) > 1.5 ? -c.vy * 0.4 : 0; }
      }
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      collideCircle(this.room, c, 0.15);
    }
  }

  updateTraps(dt) {
    if (!this.room.traps.length || this.phase !== 'fight') return;
    const period = 3.2, warnAt = 1.9, upAt = 2.55;
    const prev = this.trapClock;
    this.trapClock = (this.trapClock + dt) % period;
    const t = this.trapClock, cycle = Math.floor(this.time / period);
    const warn = t > warnAt ? Math.min(1, (t - warnAt) / 0.3) * (0.6 + 0.4 * Math.sin(t * 30)) : 0;
    const up = t > upAt ? Math.min(1, (t - upAt) / 0.06) : 0;
    this.world.setTraps(warn, up);
    if (prev < upAt && t >= upAt) audio.play('spike');
    if (up >= 1) {
      const room = this.room, p = this.player;
      const [pi, pj] = toTile(room, p.x, p.z);
      if (tileAt(room, pi, pj) === T.TRAP && p.dashT <= 0) this.hurtPlayer(3 + this.floorScale().dmg, p.x, p.z + 0.01);
      for (const e of this.enemies) {
        if (e.dead || e.state === 'spawn' || e.trapHit === cycle) continue;
        const [ei, ej] = toTile(room, e.x, e.z);
        if (tileAt(room, ei, ej) === T.TRAP) { e.trapHit = cycle; this.damageEnemy(e, 25 * this.floorScale().hp, { aoe: true }); }
      }
    }
  }

  // ------------------------------------------------------------------ visuals
  updateVisuals(gdt, dt) {
    const p = this.player, w = this.world, pm = this.pm, time = this.time;
    // player model: speed-driven run cycle + 3-hit combo swings
    if (p && !p.dead) {
      pm.root.visible = true;
      pm.root.position.set(p.x, p.y, p.z);
      const A = p.anim || (p.anim = { ph: 0, lean: 0, prevSpd: 0, blink: 2, spin: 0 });
      const t = time, adt = gdt;
      const spd = Math.hypot(p.vx, p.vz), maxS = this.stats ? this.stats.moveSpeed : 6.4;
      const run = p.dashT > 0 ? 0 : Math.min(1, spd / maxS);
      if (run > 0.04) A.ph += adt * (6.5 + 6 * run); else A.ph = damp(A.ph, Math.round(A.ph / Math.PI) * Math.PI, 10, adt);
      const ph = A.ph, sn = Math.sin(ph), cs = Math.cos(ph);
      const accel = (spd - A.prevSpd) / Math.max(adt, 1e-3); A.prevSpd = spd;
      A.lean = damp(A.lean, 0.16 * run + Math.max(-0.1, Math.min(0.15, accel * 0.006)), 10, adt);
      // swing timeline (scaled down when attacking very fast)
      const rate = this.stats ? this.stats.attackRate : 2.5, k = Math.min(1, 1 / rate / 0.36);
      const S = 0.095 * k, F = 0.11 * k, Rc = 0.2 * k;
      const st = p.swingT, d = p.swingDir || 1, fin = p.finisher, arcH = (this.stats ? this.stats.arc : 2.2) / 2;
      const restYaw = 0.45, restRoll = 0.15;
      let yaw = restYaw, roll = restRoll, lunge = 0, atk = 0, spinY = 0;
      if (st < S + F + Rc) {
        if (fin) {
          const q = Math.min(1, st / (S * 1.7)), e = 1 - Math.pow(1 - q, 3);
          spinY = -e * Math.PI * 2; yaw = -0.15; roll = 0.5; lunge = Math.sin(q * Math.PI) * 0.15; atk = 1 - q;
          if (st > S * 1.7) { const r2 = Math.min(1, (st - S * 1.7) / Rc); yaw = -0.15 + (restYaw + 0.15) * r2 * r2; roll = 0.5 + (restRoll - 0.5) * r2; }
        } else {
          const y0 = d * (arcH + 0.4), y1 = -d * (arcH + 0.2);
          if (st < S) { const q = st / S, e = 1 - Math.pow(1 - q, 4); yaw = y0 + (y1 - y0) * e; lunge = e * 0.14; atk = 1; roll = d * 0.45; }
          else if (st < S + F) { const q = (st - S) / F; yaw = y1 - d * 0.12 * Math.sin(q * Math.PI); lunge = 0.14 * (1 - q * 0.5); atk = 1 - q; roll = d * 0.45 * (1 - q * 0.3); }
          else { const q = (st - S - F) / Rc, e = q * q * (3 - 2 * q); yaw = y1 + (restYaw - y1) * e; roll = d * 0.32 + (restRoll - d * 0.32) * e; lunge = 0.07 * (1 - e); }
        }
      }
      pm.root.rotation.y = p.face + spinY;
      // body: bob twice per stride, hip sway, torso counter-twist, lean into speed and attacks
      const bob = Math.abs(sn) * 0.075 * run;
      const breathe = Math.sin(t * 2.3) * (1 - run);
      pm.rig.position.set(0, bob + breathe * 0.008, lunge);
      pm.rig.rotation.x = A.lean + atk * 0.18 + (p.dashT > 0 ? 0.32 : 0) - Math.max(0, p.hurtT) / 0.3 * 0.5;
      pm.rig.rotation.z = sn * 0.06 * run;
      pm.body.rotation.y = -sn * 0.2 * run + (yaw - restYaw) * 0.3;
      pm.head.position.y = 0.98 - bob * 0.35 + breathe * 0.006;
      pm.head.rotation.x = -A.lean * 0.55 + Math.sin(t * 1.1) * 0.03 * (1 - run);
      pm.head.rotation.y = (yaw - restYaw) * 0.15 + Math.sin(t * 0.7) * 0.08 * (1 - run) * (st > 1 ? 1 : 0);
      // feet: lift on the forward swing, plant on the back swing
      pm.footL.position.set(-0.12, 0.06 + Math.max(0, cs) * 0.11 * run, 0.02 + sn * 0.19 * run);
      pm.footR.position.set(0.12, 0.06 + Math.max(0, -cs) * 0.11 * run, 0.02 - sn * 0.19 * run);
      pm.footL.rotation.x = -cs * 0.4 * run; pm.footR.rotation.x = cs * 0.4 * run;
      // arms
      p.castT = (p.castT || 0) - adt;
      if (p.castT > 0) { pm.armL.rotation.set(-1.7, 0, 0.15); }
      else if (st < S + F) { pm.armL.rotation.set(0.7, 0, -0.55); }
      else pm.armL.rotation.set(sn * 0.85 * run + breathe * 0.04, 0, -0.08 - 0.05 * run);
      pm.pivot.rotation.set(0, yaw, roll);
      // squash & stretch: dash stretches, strike stretches forward, landings squash
      p.landT = (p.landT || 0) - adt;
      const land = Math.max(0, p.landT) / 0.25;
      const stretch = (p.dashT > 0 ? 1.22 : 1) * (1 + atk * 0.1);
      pm.rig.scale.set((1 + land * 0.2) / Math.sqrt(stretch), (1 - land * 0.24) * (1 + breathe * 0.012), stretch);
      // blink every few seconds
      A.blink -= dt;
      const eyes = pm.root.userData.eyesRef;
      if (eyes) eyes.scale.y = A.blink < 0.09 ? 0.12 : 1;
      if (A.blink < 0) A.blink = 2 + Math.random() * 3;
      // cloth chain lags behind movement and turning
      const chain = pm.root.userData.chain;
      if (chain) {
        const turn = angleDiff(p._lastFace ?? p.face, p.face) / Math.max(dt, 1e-3);
        p._lastFace = p.face;
        p._sway = damp(p._sway || 0, Math.max(-1, Math.min(1, -turn * 0.08)), 6, dt);
        const sp2 = Math.min(1, spd / 7) + (p.dashT > 0 ? 0.6 : 0);
        chain.forEach((seg, k2) => {
          const target = 0.2 + sp2 * 0.35 * (k2 ? 0.6 : 1) + Math.sin(t * 10 - k2 * 1.2) * (0.06 + sp2 * 0.12);
          seg.rotation.x = damp(seg.rotation.x, k2 === 0 ? -0.9 + sp2 * 0.7 + target * 0.3 : target - 0.15, 10 - k2, dt);
          seg.rotation.y = damp(seg.rotation.y, p._sway * (0.3 + k2 * 0.15), 8, dt);
        });
      }
      animateOutfit(pm.root, t);
      // real sword trail from the blade's path
      if (st < S * (fin ? 1.9 : 1) + F * 0.7) {
        pm.root.updateMatrixWorld(true);
        const v1 = this._tv1 || (this._tv1 = new THREE.Vector3()), v2 = this._tv2 || (this._tv2 = new THREE.Vector3());
        v1.set(0, 0, 0.18); pm.hand.localToWorld(v1);
        v2.set(0, 0, pm.bladeLen * 1.05); pm.hand.localToWorld(v2);
        this.fx.trailPush(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, fin ? 0xffffff : this.trailColor);
      }
      // legendary auras
      const aura = pm.root.userData.aura;
      if (aura && this.time - (p.lastAura || 0) > 0.05) {
        p.lastAura = this.time;
        const c = this._auraCol || (this._auraCol = new THREE.Color()); c.set(aura.color);
        const ax = p.x + rand(-0.35, 0.35), az = p.z + rand(-0.35, 0.35);
        if (aura.kind === 'fire') this.fx.emit(ax, rand(0.6, 1.3), az, 0, rand(0.8, 1.6), 0, 0.5, 0.11, c, { grav: 0, drag: 1, col2: 0xb8200a });
        else if (aura.kind === 'sparkle') this.fx.emit(ax, rand(0.2, 1.3), az, 0, 0.6, 0, 0.6, 0.07, c, { grav: 0, drag: 1 });
        else if (aura.kind === 'spark') { this.fx.emit(ax, rand(0.3, 1.3), az, rand(-2, 2), rand(-1, 2), rand(-2, 2), 0.18, 0.06, c, { grav: 0, drag: 3 }); if (Math.random() < 0.06) this.fx.bolt(p.x, 1.4, p.z, ax, 0.4, az, aura.color, 0.08); }
        else if (aura.kind === 'snow') this.fx.emit(ax, rand(1.2, 1.6), az, rand(-0.2, 0.2), -0.4, rand(-0.2, 0.2), 1.0, 0.06, c, { grav: 0, drag: 0.3 });
        else if (aura.kind === 'dust' && run > 0.3) this.fx.emit(p.x, 0.1, p.z, rand(-0.5, 0.5), 0.4, rand(-0.5, 0.5), 0.7, 0.12, c, { smoke: true, grav: -0.2, drag: 2 });
        else if (aura.kind === 'wind') { const an = this.time * 6; this.fx.emit(p.x + Math.sin(an) * 0.55, rand(0.2, 1.1), p.z + Math.cos(an) * 0.55, Math.cos(an) * 2, 0.4, -Math.sin(an) * 2, 0.35, 0.07, c, { grav: 0, drag: 0.5 }); }
      }
      // dash afterimages
      if (p.dashT > 0 && this.time - (p.lastGhost || 0) > 0.028) { p.lastGhost = this.time; this.fx.ghost(p.x, p.y, p.z, p.face, this.trailColor); }
      w.playerLight.position.set(p.x, 0.015, p.z);
      const flashOn = p.flash > 0 || (p.iframes > 0 && p.dashT <= 0 && Math.floor(time * 20) % 2 === 0 && this.phase !== 'arrive');
      for (const m of pm.mats) { m.emissive.setHex(flashOn ? 0xffffff : 0x000000); m.emissiveIntensity = flashOn ? 0.8 : 0; }
      pm.hand.visible = true;
    }

    // enemies
    for (const e of this.enemies) {
      const m = e.model; if (!m) continue;
      const base = e.r / e.def.r;
      let sx = 1, sy = 1;
      // squash spring driven by hits
      e.sqv += (-170 * e.sq - 13 * e.sqv) * gdt; e.sq += e.sqv * gdt; e.hitT -= gdt;
      if (e.dead) { const k = Math.max(0, (e.deathT - 0.18) / 0.12); sx = 1 + k * 0.5; sy = Math.max(0.05, 1 - k * 0.9); }
      else if (e.state === 'windup' || e.state === 'aim') { const k = 1 - Math.max(0, e.t) * 0.5; sx = 1 + 0.18 * k; sy = 1 - 0.15 * k; }
      else if (e.state === 'spawn') continue;
      sx *= 1 + e.sq * 0.035; sy *= 1 - e.sq * 0.035;
      const pe = 1 - Math.pow(1 - Math.min(1, e.pop), 3);
      const pop = e.pop < 1 ? 0.3 + 0.7 * pe * (1 + Math.sin(e.pop * Math.PI) * 0.25) : 1;
      m.root.position.set(e.x, (e.y || 0) - (1 - pe) * 0.9, e.z);
      m.root.rotation.y = e.face + (e.dead ? e.deathT * e.spin : 0);
      m.root.rotation.z = e.dead ? e.deathT * e.spin * 0.4 : 0;
      m.root.scale.set(base * sx * pop, base * sy * pop, base * sx * pop);
      const speed = Math.hypot(e.vx, e.vz);
      const t = time + e.wob;
      if (m.float) m.rig.position.y = Math.sin(t * 2.5) * 0.08;
      else m.rig.position.y = Math.abs(Math.sin(t * 12)) * 0.06 * Math.min(1, speed / 2);
      const hitK = Math.max(0, e.hitT) / 0.18;
      m.rig.rotation.x = Math.min(0.3, speed * 0.04) - hitK * 0.45;
      if (e.type === 'dummy') m.rig.rotation.z = Math.sin(time * 26) * hitK * 0.35;
      if (m.orbiters) m.orbiters.rotation.y = t * (e.state === 'windup' ? 9 : 2.2);
      if (m.thruster) { const k = e.state === 'dash' ? 1.8 : 0.7 + Math.sin(t * 30) * 0.15; m.thruster.scale.set(1, 1, k); }
      if (m.legL) { m.legL.position.z = Math.sin(t * 16) * 0.12 * Math.min(1, speed / 2); m.legR.position.z = -m.legL.position.z; }
      if (m.ring) m.ring.rotation.z = t * 2;
      if (m.core) { const g = e.state === 'windup' ? 1.6 + Math.sin(t * 40) * 0.3 : 1; m.core.scale.setScalar(g); }
      if (m.armL) { const k = e.state === 'windup' ? 0.6 * (1 - Math.max(0, e.t)) : 0; m.armL.position.y = 0.42 + k; m.armR.position.y = 0.42 + k; }
      const fl = e.dead ? 0.4 + e.deathT * 2 : e.flash > 0 ? 0.9 : e.slow > 0 ? 0.25 : 0;
      for (const mat of m.mats) { mat.emissiveIntensity = fl; mat.emissive.setHex(e.slow > 0 && e.flash <= 0 ? 0x7fc8ff : 0xffffff); }
      if (m.eliteBand.visible) m.eliteBand.rotation.z = t;
    }

    // boss visuals handled in boss.js (sync)
    // batches
    const sh = w.shadows; sh.begin();
    if (p && !p.dead) sh.push(p.x, 0.02, p.z, 1.0 - Math.min(0.5, p.y * 0.1));
    for (const e of this.enemies) if (e.model && e.state !== 'spawn' && !(e.dead && e.popped)) sh.push(e.x, 0.02, e.z, e.r * 2.6 * Math.min(1, e.pop * 1.5));
    if (this.boss && this.boss.model.root.visible) sh.push(this.boss.x, 0.02, this.boss.z, this.boss.r * 2.8);

    const cb = w.coins; cb.begin();
    for (const c of this.coins) { cb.push(c.x, c.y, c.z, 1, 1, 1, c.spin); sh.push(c.x, 0.02, c.z, 0.35); }
    cb.end();

    const bc = w.bulletCore, bg = w.bulletGlow; bc.begin(); bg.begin();
    const pulse = 1 + Math.sin(time * 30) * 0.12;
    for (const b of this.bullets) { bc.push(b.x, b.y, b.z, b.s); bg.push(b.x, b.y, b.z, 2.1 * b.s * pulse); }
    bc.end(); bg.end();

    const wv = w.waves, ds = w.droneShots, fc = w.fireCore, fg = w.fireGlow, rk = w.rocks, wn = w.winds;
    wv.begin(); ds.begin(); fc.begin(); fg.begin(); rk.begin(); wn.begin();
    for (const pr of this.projs) {
      if (pr.kind === 'wave') { const f = Math.min(1, pr.life / 0.15); wv.push(pr.x, 0.55, pr.z, 1.1 * f + 0.2, 1, 1.1 * f + 0.2, pr.angle); }
      else if (pr.kind === 'fireball') { const s = pr.big ? 1.5 : 1; fc.push(pr.x, 0.75, pr.z, s * 0.8); fg.push(pr.x, 0.75, pr.z, s * (1.6 + Math.sin(time * 40) * 0.15)); }
      else if (pr.kind === 'boulder') { const s = pr.big ? 2 : 1; rk.push(pr.x, pr.y, pr.z, s, s, s, pr.spin); sh.push(pr.x, 0.02, pr.z, s * (1.4 - (pr.y || 0) * 0.12)); }
      else if (pr.kind === 'shard') rk.push(pr.x, 0.4, pr.z, 0.4, 0.4, 0.4, pr.age * 12);
      else if (pr.kind === 'wind') { const f = Math.min(1, pr.life / 0.12); wn.push(pr.x, 0.6, pr.z, 1.2 * f + 0.2, 1, 1.2 * f + 0.2, pr.angle + Math.sin(pr.age * 30) * 0.05); }
      else ds.push(pr.x, 0.9, pr.z, pr.kind === 'mini' ? 0.7 : 1, 1, 1, pr.angle);
    }
    wv.end(); ds.end(); fc.end(); fg.end(); rk.end(); wn.end();
    const sc = w.scorch, zb = w.zones; sc.begin(); zb.begin();
    for (const s2 of this.scorches || []) { const k = sc.push(s2.x, 0.013, s2.z, s2.r * 2.2); const a = Math.min(1, (s2.life - s2.t) / 1.5); sc.color(k, a, a, a); }
    for (const zn of this.zones || []) {
      const f = zn.t / zn.life, a = (1 - f) * (zn.dps ? 0.6 + Math.sin(time * 18) * 0.1 : 0.4);
      const k = zb.push(zn.x, 0.02, zn.z, zn.r * 2 * (zn.dps ? 1 : 0.6 + f * 0.5)); zb.color(k, zn.color.r * a, zn.color.g * a, zn.color.b * a);
    }
    sc.end(); zb.end();
    const ss = w.stoneSpikes, is = w.iceSpikes; ss.begin(); is.begin();
    for (const sp of this.spikes || []) {
      if (sp.t < 0) continue;
      const up = Math.min(1, sp.t / 0.07), out = Math.max(0, (sp.t - sp.life + 0.25) / 0.25);
      const h = sp.h * (up < 1 ? up * 1.15 : 1 + Math.max(0, 0.15 - (sp.t - 0.07) * 1.5)) * (1 - out);
      const b = sp.kind === 'ice' ? is : ss;
      b.push(sp.x, -0.05, sp.z, 0.9 + sp.h * 0.4, Math.max(0.001, h), 0.9 + sp.h * 0.4, sp.rot);
    }
    ss.end(); is.end();

    const ob = w.orbits, dr = w.drones; ob.begin(); dr.begin();
    if (p && !p.dead && this.mode === 'run' && this.stats) {
      for (let k = 0; k < this.stats.orbit; k++) {
        const a = (this._orbitA || 0) + k * TAU / this.stats.orbit;
        ob.push(p.x + Math.sin(a) * 1.75, 0.6, p.z + Math.cos(a) * 1.75, 1, 1, 1, a + Math.PI / 2);
      }
      for (let k = 0; k < this.stats.drones; k++) {
        const d = this.dronePos(k);
        dr.push(d.x, d.y, d.z, 1, 1, 1, time * 3);
        sh.push(d.x, 0.02, d.z, 0.4);
      }
    }
    ob.end(); dr.end();
    sh.end();

    // lifts
    const now = performance.now() / 1000;
    if (w.exitLift) {
      const open = this.phase === 'clear' || this.phase === 'leave';
      const k = open ? 0.45 + Math.sin(now * 4) * 0.1 : 0;
      w.exitLift.poolMat.color.setRGB(0.95 * k, 0.7 * k, 0.29 * k);
      w.exitLift.beamMat.opacity = open ? 0.18 + Math.sin(now * 4) * 0.06 : 0;
      w.exitLift.ring.scale.setScalar(open ? 1 + Math.sin(now * 5) * 0.04 : 1);
    }
    if (w.entryLift && this.phase !== 'arrive') w.entryLift.group.position.y = 0;

    this.fx.update(gdt);

    // camera
    if (this.mode === 'run') {
      if (this.phase === 'bossIntro' && this.boss) {
        w.updateCamera(dt, this.boss.x, this.boss.z + 1, { lambda: 3, zoom: 0.62 });
      } else if (this.phase === 'dying' || this.phase === 'dead') {
        w.updateCamera(dt, p.x, p.z, { lambda: 3, zoom: 0.7 });
      } else if (this.phase === 'leave') {
        w.updateCamera(dt, p.x, p.z, { lambda: 4, y: p.y * 0.6, zoom: 0.85 });
      } else {
        const ax = Math.sin(p.aim) * (p.swingT < 0.5 ? 0.8 : 0), az = Math.cos(p.aim) * (p.swingT < 0.5 ? 0.8 : 0);
        w.updateCamera(dt, p.x + p.vx * 0.12 + ax, p.z + p.vz * 0.12 + az, { lambda: 6 });
      }
      // music intensity follows danger
      const alive = this.enemies.filter(e => !e.dead && !e.decor && e.state !== 'spawn').length;
      if (this.phase === 'fight') audio.setIntensity(Math.min(1, alive / 9 + (p.hp < p.maxHp * 0.35 ? 0.3 : 0)));
    }
  }

  // ------------------------------------------------------------------ menu
  updateMenu(dt) {
    this.time += dt;
    this.menuT += dt;
    this.updateEnemies(dt);
    const p = this.player;
    p.moving = 0;
    p.swingT += dt;
    // Idle swing now and then, so the character feels alive.
    if (this.menuT > 3.2) { this.menuT = 0; p.swingT = 0; p.swingFlip = !p.swingFlip; this.fx.slash(p.x, 0.55, p.z, p.face, 2.2, 2.4, this.trailColor, 0.18, p.swingFlip); }
    if (Math.random() < dt * 6) {
      const room = this.room;
      this.fx.emit(rand(-room.w, room.w) * TILE * 0.4, rand(0.2, 2.5), rand(-room.h, room.h) * TILE * 0.4, rand(-0.2, 0.2), rand(0.1, 0.3), rand(-0.2, 0.2), rand(3, 6), 0.05, this._mote || (this._mote = new THREE.Color(0xf2d6a0)), { grav: -0.02, drag: 0.1 });
    }
    this.updateVisuals(dt, dt);
    const t = this.time;
    if (this.ui.screen === 'skins') {
      p.face += dt * 0.7;
      this.world.updateCamera(dt, p.x + 0.2, p.z + 0.4, { free: true, lambda: 4, zoom: 0.28, pitch: 0.42 });
    } else {
      // slow cinematic drift; framing offset so the title on the left stays readable
      const off = this.world.camera.aspect > 1 ? -3.4 : 0;
      this.world.updateCamera(dt, off + Math.sin(t * 0.07) * 3.5, Math.cos(t * 0.05) * 2.2 + 0.5, { free: true, lambda: 1.5, zoom: 0.78, pitch: 0.78 + Math.sin(t * 0.09) * 0.06 });
      p.face = damp(p.face, 0.5 + Math.sin(t * 0.3) * 0.4, 2, dt);
    }
  }

  // ------------------------------------------------------------------ results & meta
  finishRun() {
    const run = this.run, d = save.data;
    const floor = run.floor;
    const newBest = floor > d.bestFloor;
    if (newBest) d.bestFloor = floor;
    const xp = floor * 25 + run.kills * 3 + run.bossKills * 200;
    // mastery pass for the equipped power
    let mastery = null;
    if (d.ability && d.abilities[d.ability]) {
      const ab = d.abilities[d.ability], before = masteryFromXp(ab.xp);
      ab.xp += xp;
      const after = masteryFromXp(ab.xp);
      const rewards = [];
      for (let l = (ab.claimed || 1) + 1; l <= after.level; l++) {
        const r = TRACK[l];
        if (r.t === 'coins') d.coins += r.v;
        rewards.push(l);
      }
      ab.claimed = Math.max(ab.claimed || 1, after.level);
      mastery = { id: d.ability, before, after, rewards };
    }
    const lvBefore = levelFromXp(d.xp);
    d.xp += xp;
    const lvAfter = levelFromXp(d.xp);
    if (d.totalCoins >= 1000) this.unlock('coins1k', true);
    if (d.totalCoins >= 10000) this.unlock('coins10k', true);
    if (d.totalKills >= 500) this.unlock('kills500', true);
    const skins = checkSkinProgress(d);
    save.write();
    return { mastery, discoveries: run.newDiscoveries, floor, kills: run.kills, coins: run.coins, best: d.bestFloor, newBest, prevBest: run.prevBest, xp, lvBefore, lvAfter, skins, picks: run.picks.slice() };
  }

  unlock(id, quiet) {
    const d = save.data;
    if (d.achievements.includes(id)) return;
    d.achievements.push(id);
    save.write();
    const a = ACHIEVEMENTS.find(a => a.id === id);
    if (a && !quiet) this.ui.toast('ACHIEVEMENT', a.name);
    if (a && quiet) this.ui.queueResultNote(`Achievement: ${a.name}`);
  }
}

const FIRE_COL = new THREE.Color(0xff7a2a), STUN_COL = new THREE.Color(0xfff0a0), DUST_COL = new THREE.Color(0x8a7a62);
const FIRE_HOT = new THREE.Color(0xffe08a), SMOKE_COL = new THREE.Color(0x2e2a28), FROST_COL = new THREE.Color(0xcfeeff), WIND_COL = new THREE.Color(0xc8ffd8);
const REG_NAMES = { dummy: 'Training Dummy', runner: 'Runner', shooter: 'Shooter', splitter: 'Splitter', splitling: 'Splitling', dasher: 'Dasher', tank: 'Tank', warden: 'The Warden', crusher: 'The Crusher', hunter: 'The Hunter' };

const BOSS_LINES = {
  warden: ['That is the Warden. It keeps this part of the tower locked down.', 'It glows before every volley. The gaps in its bullet rings are your way through.'],
  crusher: ['The Crusher. Big, slow and very angry.', 'When it charges, step aside and let it hit the wall. It is stunned for a moment after that.'],
  hunter: ['The Hunter. Fast, and it likes to vanish.', 'Every one of its dashes is drawn on the floor first. Read the lines, then dash through them.'],
};

export { ETYPES };

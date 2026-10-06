// Core gameplay: player, combat, enemies, projectiles, coins, traps, room flow and the run itself.
import * as THREE from '../lib/three.module.min.js';
import { RNG, clamp, damp, angleDiff, rand, TAU, dist2 } from './util.js';
import { TILE, T, makeRoom, menuRoom, toWorld, toTile, tileAt, collideCircle, lineOfSight, FlowField, solidAt } from './rooms.js';
import { buildPlayer, buildEnemy, ENEMY_COLORS } from './models.js';
import { baseStats, rollCards, UPGRADE_BY_ID } from './upgrades.js';
import { SKINS, ACHIEVEMENTS, checkSkinProgress } from './meta.js';
import { input, wantsAttack } from './input.js';
import { audio } from './audio.js';
import { save, levelFromXp } from './save.js';
import { themeFor } from './world.js';
import { createBoss, updateBoss, BOSS_INFO } from './boss.js';

// Enemy archetypes. hp/speed are scaled per floor; dmg is what they deal to the player.
const ETYPES = {
  runner: { hp: 18, speed: 4.1, r: 0.36, dmg: 2, coins: 1, cost: 1, unlock: 1, weight: 3 },
  shooter: { hp: 20, speed: 2.6, r: 0.42, dmg: 2, coins: 2, cost: 2, unlock: 2, weight: 2 },
  splitter: { hp: 34, speed: 2.4, r: 0.46, dmg: 2, coins: 1, cost: 2, unlock: 3, weight: 2 },
  dasher: { hp: 30, speed: 3.2, r: 0.4, dmg: 3, coins: 2, cost: 2.5, unlock: 5, weight: 1.6 },
  tank: { hp: 85, speed: 1.75, r: 0.7, dmg: 4, coins: 4, cost: 4, unlock: 6, weight: 1 },
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
    this.pm = buildPlayer(skin);
    this.skin = skin;
    this.trailColor = new THREE.Color(skin.c.trail);
    this.world.waveMat.color.set(skin.c.blade).lerp(new THREE.Color(skin.c.trail), 0.4);
    this.world.orbitMat.color.set(skin.c.blade);
    this.world.dynamic.add(this.pm.root);
  }

  later(delay, fn) { this.timers.push({ t: this.time + delay, fn }); }

  // ------------------------------------------------------------------ menu scene
  enterMenu() {
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
      startTime: performance.now(), swings: 0, hurtThisFloor: false, newDiscoveries: 0,
    };
    this.stats = baseStats(d.perm);
    this.player = this.makePlayerState(0, 0);
    this.player.maxHp = this.stats.maxHp; this.player.hp = this.player.maxHp;
    this.player.dashCharges = this.stats.dashCharges;
    d.runs++; save.write();
    this.ui.onRunStart(this);
    this.nextFloor();
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
    const s = baseStats(save.data.perm);
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
    u.apply(baseStats(save.data.perm), this); // heal side effects only
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
      this.later(1.2, () => { this.ui.toast('NEW BEST!', `Past floor ${run.prevBest}`); audio.play('best'); });
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
      bossMinion: !!o.bossMinion,
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
          p.y = 0;
          audio.play('doorOpen');
          if (this.isBossFloor) { this.phase = 'bossIntro'; this.phaseT = 0; this.startBossIntro(); }
          else { this.phase = 'fight'; this.phaseT = 0; this.spawnWave(this.waves[0]); this.waveIdx = 1; this.waveT = 0; }
        }
        break;
      }
      case 'bossIntro':
        if (this.phaseT > 2.1) { this.phase = 'fight'; this.phaseT = 0; this.ui.letterbox(false); this.boss.active = true; audio.setMode('boss'); }
        break;
      case 'fight': {
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
          this.phase = 'cards'; this.phaseT = 0;
          audio.setMuffled(true);
          this.ui.showCards(this, this.rollCards());
        }
        break;
      }
      case 'dying':
        if (this.phaseT > 1.25) { this.phase = 'dead'; this.ui.showResults(this, this.finishRun()); }
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
    if (!isEcho) { p.swingCount++; p.swingFlip = !p.swingFlip; p.swingT = 0; }
    const fifth = s.fifth > 0 && !isEcho && p.swingCount % 5 === 0;
    const berserk = s.berserk && p.hp <= p.maxHp / 2 ? 1 + 0.4 * s.berserk : 1;
    const dmg = s.damage * s.damageMul * berserk * mult * (fifth ? 2 + 0.5 * (s.fifth - 1) : 1);
    const range = s.range, arc = s.arc;
    this.fx.slash(p.x, 0.55, p.z, angle, arc, range + 0.15, fifth ? 0xffffff : this.trailColor, isEcho ? 0.12 : 0.16, p.swingFlip);
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
      const res = this.damageEnemy(e, dmg, { dirx, dirz, kb: s.knockback * (fifth ? 1.8 : 1), proc: true, forceCrit: fifth });
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

  killPlayer() {
    const p = this.player;
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
    if (o.dirx !== undefined) { e.kbx += o.dirx * 7 * kb; e.kbz += o.dirz * 7 * kb; }
    if (s.frost > 0 && o.proc) e.slow = 1.5;
    const y = e.model ? e.model.height * (e.r / e.def.r) * 0.6 : 0.8;
    this.fx.number(e.x, y + 0.5, e.z, dmg, crit ? 'crit' : o.aoe ? 'aoe' : 'normal');
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
    this.unlock(b.kind);
    this.timeScale = 0.2;
    this.hitstop = 0.15;
    this.world.addShake(1);
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e, { silent: true });
    this.bullets.length = 0; this.hazards.length = 0;
    for (const m of this.fx.markers) this.fx.releaseMarker(m);
    audio.play('bossDown');
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
    const col = ENEMY_COLORS[e.type];
    this.fx.burst(e.x, 0.5, e.z, e.type === 'tank' ? 16 : 10, col, { speed: 7, up: 6, life: 0.9, size: e.type === 'tank' ? 0.22 : 0.16, debris: true, grav: 20 });
    this.fx.burst(e.x, 0.5, e.z, 8, 0xfff2dc, { speed: 8, up: 3, life: 0.3, size: 0.1 });
    this.fx.ring(e.x, e.z, col, 0.2, 1.4 * (e.r / 0.4), 0.3);
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
        e.deathT += dt;
        if (e.deathT > 0.14) { this.releaseModel(e); list.splice(i, 1); }
        continue;
      }
      e.flash -= dt; e.slow -= dt;
      if (e.state === 'spawn') {
        e.spawnT -= dt;
        if (e.spawnT <= 0) {
          e.state = 'chase'; e.pop = 0;
          if (e.marker) { this.fx.releaseMarker(e.marker); e.marker = null; }
          e.model.root.visible = true;
          this.fx.burst(e.x, 0.2, e.z, 6, 0xf2d6a0, { speed: 3, up: 3, life: 0.35, size: 0.1 });
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
      pr.x += pr.vx * dt; pr.z += pr.vz * dt;
      let dead = pr.life <= 0;
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
        } else {
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
        if (hitSomething || hitBoss) {
          const t = hitSomething || b;
          pr.hit.add(t);
          const l = Math.hypot(pr.vx, pr.vz) || 1;
          if (hitSomething) this.damageEnemy(t, pr.dmg, { dirx: pr.vx / l, dirz: pr.vz / l, kb: 0.6, proc: true });
          else this.damageBoss(pr.dmg, { proc: true });
          if (this.stats.hydra > 0 && pr.split) {
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
    // player model
    if (p && !p.dead) {
      pm.root.visible = true;
      pm.root.position.set(p.x, p.y, p.z);
      pm.root.rotation.y = p.face;
      const run = p.moving, t = time;
      const bob = Math.abs(Math.sin(t * 13)) * 0.08 * run;
      pm.rig.position.y = bob + Math.sin(t * 2.4) * 0.015 * (1 - run);
      pm.rig.rotation.x = 0.16 * run + (p.dashT > 0 ? 0.35 : 0);
      pm.footL.position.z = Math.sin(t * 13) * 0.16 * run; pm.footR.position.z = -Math.sin(t * 13) * 0.16 * run;
      pm.footL.position.y = 0.05 + Math.max(0, Math.cos(t * 13)) * 0.08 * run; pm.footR.position.y = 0.05 + Math.max(0, -Math.cos(t * 13)) * 0.08 * run;
      // swing: pivot rotates through the arc quickly then eases back to rest
      const sw = Math.min(1, p.swingT / 0.11), arc = this.stats ? this.stats.arc : 2;
      let pa;
      if (p.swingT < 0.11) pa = (p.swingFlip ? 1 : -1) * (-arc / 2 + arc * (1 - Math.pow(1 - sw, 2)));
      else { const back = Math.min(1, (p.swingT - 0.11) / 0.25); pa = (p.swingFlip ? 1 : -1) * (arc / 2) * (1 - back) + (-0.9) * back; }
      pm.pivot.rotation.y = pa;
      pm.pivot.rotation.z = p.swingT < 0.2 ? 0 : 0.1;
      pm.body.rotation.y = pa * 0.25;
      const squash = p.dashT > 0 ? 1.2 : 1;
      pm.rig.scale.set(1 / Math.sqrt(squash), 1, squash);
      if (pm.root.userData.tail) pm.root.userData.tail.rotation.x = 0.5 + run * 0.6 + Math.sin(t * 9) * 0.15 * run;
      const flashOn = p.flash > 0 || (p.iframes > 0 && p.dashT <= 0 && Math.floor(time * 20) % 2 === 0 && this.phase !== 'arrive');
      for (const m of pm.mats) { m.emissive.setHex(flashOn ? 0xffffff : 0x000000); m.emissiveIntensity = flashOn ? 0.8 : 0; }
      pm.hand.visible = true;
    }

    // enemies
    for (const e of this.enemies) {
      const m = e.model; if (!m) continue;
      const base = e.r / e.def.r;
      let sx = 1, sy = 1;
      if (e.dead) { const k = 1 + e.deathT * 4; sx = k; sy = Math.max(0.01, 1 - e.deathT * 7); }
      else if (e.state === 'windup' || e.state === 'aim') { const k = 1 - Math.max(0, e.t) * 0.5; sx = 1 + 0.18 * k; sy = 1 - 0.15 * k; }
      else if (e.state === 'spawn') continue;
      const pop = e.pop < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - e.pop, 3)) * (1 + Math.sin(e.pop * Math.PI) * 0.25) : 1;
      m.root.position.set(e.x, 0, e.z);
      m.root.rotation.y = e.face;
      m.root.scale.set(base * sx * pop, base * sy * pop, base * sx * pop);
      const speed = Math.hypot(e.vx, e.vz);
      const t = time + e.wob;
      if (m.float) m.rig.position.y = Math.sin(t * 2.5) * 0.08;
      else m.rig.position.y = Math.abs(Math.sin(t * 12)) * 0.06 * Math.min(1, speed / 2);
      m.rig.rotation.x = Math.min(0.3, speed * 0.04);
      if (m.legL) { m.legL.position.z = Math.sin(t * 16) * 0.12 * Math.min(1, speed / 2); m.legR.position.z = -m.legL.position.z; }
      if (m.ring) m.ring.rotation.z = t * 2;
      if (m.core) { const g = e.state === 'windup' ? 1.6 + Math.sin(t * 40) * 0.3 : 1; m.core.scale.setScalar(g); }
      if (m.armL) { const k = e.state === 'windup' ? 0.6 * (1 - Math.max(0, e.t)) : 0; m.armL.position.y = 0.42 + k; m.armR.position.y = 0.42 + k; }
      const fl = e.flash > 0 ? 0.9 : e.slow > 0 ? 0.25 : 0;
      for (const mat of m.mats) { mat.emissiveIntensity = fl; mat.emissive.setHex(e.slow > 0 && e.flash <= 0 ? 0x7fc8ff : 0xffffff); }
      if (m.eliteBand.visible) m.eliteBand.rotation.z = t;
    }

    // boss visuals handled in boss.js (sync)
    // batches
    const sh = w.shadows; sh.begin();
    if (p && !p.dead) sh.push(p.x, 0.02, p.z, 1.0 - Math.min(0.5, p.y * 0.1));
    for (const e of this.enemies) if (e.model && e.state !== 'spawn') sh.push(e.x, 0.02, e.z, e.r * 2.6 * (e.dead ? 1 - e.deathT * 5 : 1));
    if (this.boss && this.boss.model.root.visible) sh.push(this.boss.x, 0.02, this.boss.z, this.boss.r * 2.8);

    const cb = w.coins; cb.begin();
    for (const c of this.coins) { cb.push(c.x, c.y, c.z, 1, 1, 1, c.spin); sh.push(c.x, 0.02, c.z, 0.35); }
    cb.end();

    const bc = w.bulletCore, bg = w.bulletGlow; bc.begin(); bg.begin();
    const pulse = 1 + Math.sin(time * 30) * 0.12;
    for (const b of this.bullets) { bc.push(b.x, b.y, b.z, b.s); bg.push(b.x, b.y, b.z, 2.1 * b.s * pulse); }
    bc.end(); bg.end();

    const wv = w.waves, ds = w.droneShots; wv.begin(); ds.begin();
    for (const pr of this.projs) {
      if (pr.kind === 'wave') { const f = Math.min(1, pr.life / 0.15); wv.push(pr.x, 0.55, pr.z, 1.1 * f + 0.2, 1, 1.1 * f + 0.2, pr.angle); }
      else ds.push(pr.x, 0.9, pr.z, pr.kind === 'mini' ? 0.7 : 1, 1, 1, pr.angle);
    }
    wv.end(); ds.end();

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
    const xp = floor * 12 + run.kills * 2 + run.bossKills * 120;
    const lvBefore = levelFromXp(d.xp);
    d.xp += xp;
    const lvAfter = levelFromXp(d.xp);
    if (d.totalCoins >= 1000) this.unlock('coins1k', true);
    if (d.totalCoins >= 10000) this.unlock('coins10k', true);
    if (d.totalKills >= 500) this.unlock('kills500', true);
    const skins = checkSkinProgress(d);
    save.write();
    return { discoveries: run.newDiscoveries, floor, kills: run.kills, coins: run.coins, best: d.bestFloor, newBest, prevBest: run.prevBest, xp, lvBefore, lvAfter, skins, picks: run.picks.slice() };
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

export { ETYPES };

// Bosses: one every 10 floors, cycling Warden -> Crusher -> Hunter (each cycle tougher).
// Every strong attack is announced with an animation, a ground marker and a sound.
import * as THREE from '../lib/three.module.min.js';
import { buildBoss } from './models.js';
import { collideCircle, solidAt } from './rooms.js';
import { audio } from './audio.js';
import { damp, angleDiff, rand, TAU, dist2 } from './util.js';

const HUNTER_COL = new THREE.Color(0x46d8e8);

export const BOSS_INFO = {
  order: ['warden', 'crusher', 'hunter'],
  warden: { name: 'THE WARDEN', hp: 900 },
  crusher: { name: 'THE CRUSHER', hp: 1100 },
  hunter: { name: 'THE HUNTER', hp: 1000 },
};

export function createBoss(game, kind, x, z, floor) {
  const model = buildBoss(kind);
  game.world.dynamic.add(model.root);
  const cycle = Math.floor((floor / 10 - 1) / 3);
  const hp = BOSS_INFO[kind].hp * (1 + 0.075 * (floor - 1)) * (1 + 0.3 * cycle);
  const b = {
    kind, x, z, y: 0, vx: 0, vz: 0, r: model.radius, hp, maxHp: hp, model, active: false, dead: false, deathT: 0,
    flash: 0, slow: 0, state: 'idle', t: 0, cd: 1.2, face: 0, phase2: false, step: 0, cycle, floor,
    dmg: 3 + Math.floor(floor / 15), seq: 0, visible: true, scale: 1, spawned2: false,
  };
  model.root.position.set(x, 0, z);
  return b;
}

function moveToward(game, b, dt, tx, tz, speed) {
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
  b.vx = damp(b.vx, dx / d * speed, 5, dt); b.vz = damp(b.vz, dz / d * speed, 5, dt);
}

function ringOfBullets(game, b, n, speed, offset = 0) {
  for (let k = 0; k < n; k++) {
    const a = offset + k * TAU / n;
    game.fireBullet(b.x + Math.sin(a) * b.r, b.z + Math.cos(a) * b.r, a, speed, b.dmg - 1, { y: 1.2, scale: 1.15, r: 0.2 });
  }
  audio.play('enemyShoot');
}

export function updateBoss(game, b, dt) {
  const p = game.player, fx = game.fx;
  b.flash -= dt; b.slow -= dt;
  syncBoss(game, b, dt);
  if (b.dead) { b.deathT += dt; return; }
  if (!b.active) return;

  const slow = b.slow > 0 ? 0.7 : 1;
  b.t -= dt * slow; b.cd -= dt * slow;
  const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz) || 1, toP = Math.atan2(dx, dz);

  if (!b.phase2 && b.hp < b.maxHp * 0.5) {
    b.phase2 = true;
    game.world.addShake(0.5); audio.play('slam');
    fx.ring(b.x, b.z, 0xffffff, 0.5, 5, 0.5);
    game.ui.toast(BOSS_INFO[b.kind].name, 'is enraged');
  }

  const kind = b.kind;
  if (kind === 'warden') warden(game, b, dt, d, toP);
  else if (kind === 'crusher') crusher(game, b, dt, d, toP);
  else hunter(game, b, dt, d, toP);

  b.x += b.vx * dt; b.z += b.vz * dt;
  const hit = collideCircle(game.room, b, b.r);
  if (hit.hit && b.state === 'charge') {
    b.state = 'stunned'; b.t = 1.4; b.vx = b.vz = 0;
    if (b.tele) { fx.releaseMarker(b.tele); b.tele = null; }
    game.world.addShake(0.7); audio.play('slam');
    fx.burst(b.x, 1, b.z, 20, 0xb8a898, { speed: 8, up: 6, life: 0.8, size: 0.2, debris: true });
    // falling rocks, each clearly marked
    const n = b.phase2 ? 6 : 4;
    for (let k = 0; k < n; k++) {
      const rx = p.x + rand(-4, 4), rz = p.z + rand(-3, 3);
      if (solidAt(game.room, rx, rz)) continue;
      const m = fx.circleMarker(rx, rz, 1.1, 0.95);
      game.later(0.95, () => {
        fx.releaseMarker(m);
        fx.burst(rx, 0.3, rz, 10, 0x9a8d80, { speed: 5, up: 5, life: 0.7, size: 0.2, debris: true });
        fx.ring(rx, rz, 0xffb08a, 0.2, 1.2, 0.25);
        audio.play('crate');
        if (!b.dead && dist2(game.player.x, game.player.z, rx, rz) < (1.1 + game.player.r) ** 2) game.hurtPlayer(b.dmg - 1, rx, rz);
      });
    }
  }
  // the boss body is solid
  const pd = Math.hypot(p.x - b.x, p.z - b.z), min = b.r + p.r;
  if (pd < min && pd > 0.001 && b.visible) {
    p.x = b.x + (p.x - b.x) / pd * min; p.z = b.z + (p.z - b.z) / pd * min;
    if ((b.state === 'charge' || b.state === 'dash') && !b.hitDone) { b.hitDone = true; game.hurtPlayer(b.dmg + 1, b.x, b.z); }
  }
}

function idleDrift(game, b, dt, d, toP, want, speed) {
  const p = game.player;
  if (d > want + 1) moveToward(game, b, dt, p.x, p.z, speed);
  else if (d < want - 1.5) moveToward(game, b, dt, b.x - (p.x - b.x), b.z - (p.z - b.z), speed);
  else { b.vx = damp(b.vx, Math.cos(toP) * speed * 0.5 * (b.seq % 2 ? 1 : -1), 3, dt); b.vz = damp(b.vz, -Math.sin(toP) * speed * 0.5 * (b.seq % 2 ? 1 : -1), 3, dt); }
  b.face += angleDiff(b.face, toP) * Math.min(1, dt * 5);
}
const stop = (b, dt, k = 10) => { b.vx = damp(b.vx, 0, k, dt); b.vz = damp(b.vz, 0, k, dt); };

// ---------------- THE WARDEN: bullet rings, aimed bursts, summons, spiral (phase 2)
function warden(game, b, dt, d, toP) {
  const fx = game.fx, p = game.player;
  switch (b.state) {
    case 'idle': {
      idleDrift(game, b, dt, d, toP, 5.5, 1.7);
      if (b.cd <= 0) {
        const minions = game.enemies.filter(e => !e.dead).length;
        const opts = ['ring', 'burst', 'ring', 'burst'];
        if (minions < 3) opts.push('summon');
        if (b.phase2) opts.push('spiral', 'spiral');
        b.attack = opts[Math.floor(Math.random() * opts.length)];
        if (b.attack === b.lastAttack && Math.random() < 0.6) b.attack = b.attack === 'ring' ? 'burst' : 'ring';
        b.lastAttack = b.attack;
        b.state = 'tele'; b.t = b.attack === 'burst' ? 0.5 : b.attack === 'spiral' ? 0.8 : 0.85;
        b.tele = fx.circleMarker(b.x, b.z, b.r + (b.attack === 'ring' || b.attack === 'spiral' ? 1.2 : 0.4), b.t, 0xff4fa3);
        audio.play('telegraph');
      }
      break;
    }
    case 'tele':
      stop(b, dt);
      if (b.tele) b.tele.g.position.set(b.x, 0.035, b.z);
      b.face += angleDiff(b.face, toP) * Math.min(1, dt * 6);
      if (b.t <= 0) {
        fx.releaseMarker(b.tele); b.tele = null;
        b.state = b.attack; b.t = 0; b.step = 0;
        if (b.attack === 'summon') {
          const n = b.phase2 ? 3 : 3;
          for (let k = 0; k < n; k++) {
            const a = k * TAU / n + rand(-0.3, 0.3), x = b.x + Math.sin(a) * 2.6, z = b.z + Math.cos(a) * 2.6;
            if (!solidAt(game.room, x, z)) game.spawnEnemy(k === 2 && b.phase2 ? 'shooter' : 'runner', x, z, { bossMinion: true });
          }
          b.state = 'recover'; b.t = 0.6;
        }
      }
      break;
    case 'ring':
      stop(b, dt);
      if (b.t <= 0) {
        const n = b.phase2 ? 22 : 16;
        ringOfBullets(game, b, n, 5.2 + b.cycle * 0.4, b.step * (Math.PI / n));
        fx.ring(b.x, b.z, 0xff4fa3, b.r, b.r + 2, 0.3);
        b.step++; b.t = 0.45;
        if (b.step >= (b.phase2 ? 3 : 2)) { b.state = 'recover'; b.t = 0.5; }
      }
      break;
    case 'burst':
      stop(b, dt);
      b.face += angleDiff(b.face, toP) * Math.min(1, dt * 8);
      if (b.t <= 0) {
        const n = b.phase2 ? 5 : 3;
        for (let k = 0; k < n; k++) game.fireBullet(b.x + Math.sin(toP) * b.r, b.z + Math.cos(toP) * b.r, toP + (k - (n - 1) / 2) * 0.22, 8 + b.cycle * 0.5, b.dmg - 1, { y: 1.4, scale: 1.1 });
        audio.play('enemyShoot');
        b.step++; b.t = 0.3;
        if (b.step >= 3) { b.state = 'recover'; b.t = 0.4; }
      }
      break;
    case 'spiral':
      stop(b, dt);
      if (b.t <= 0) {
        b.t = 0.085;
        const a = b.step * 0.36;
        for (const off of [0, Math.PI]) game.fireBullet(b.x + Math.sin(a + off) * b.r, b.z + Math.cos(a + off) * b.r, a + off, 5, b.dmg - 1, { y: 1.2 });
        if (b.step % 3 === 0) audio.play('enemyShoot');
        b.step++;
        if (b.step > 30) { b.state = 'recover'; b.t = 0.6; }
      }
      break;
    case 'recover':
      stop(b, dt);
      if (b.t <= 0) { b.state = 'idle'; b.cd = b.phase2 ? 0.9 : 1.3; b.seq++; }
      break;
  }
}

// ---------------- THE CRUSHER: jump slams, wall charges (stuns itself), shockwave pounds
function crusher(game, b, dt, d, toP) {
  const fx = game.fx, p = game.player;
  switch (b.state) {
    case 'idle':
      moveToward(game, b, dt, p.x, p.z, 2.1);
      b.face += angleDiff(b.face, toP) * Math.min(1, dt * 4);
      if (b.cd <= 0) {
        const opts = ['jump', 'charge', 'pound'];
        b.attack = opts[(b.seq + (Math.random() < 0.35 ? 1 : 0)) % 3];
        b.state = 'tele'; b.step = 0;
        if (b.attack === 'jump') { b.t = 0.45; audio.play('telegraph'); }
        if (b.attack === 'charge') {
          b.t = 0.85; b.aim = toP;
          b.tele = fx.lineMarker(b.x, b.z, b.aim, 14, b.r * 2, b.t);
          audio.play('telegraph');
        }
        if (b.attack === 'pound') { b.t = 0.75; b.tele = fx.circleMarker(b.x, b.z, b.r + 0.9, b.t, 0xff7a3a); audio.play('telegraph'); }
      }
      break;
    case 'tele':
      stop(b, dt, 14);
      if (b.attack === 'charge') { b.face += angleDiff(b.face, b.aim) * Math.min(1, dt * 12); if (b.tele) b.tele.g.position.set(b.x, 0.035, b.z); }
      else b.face += angleDiff(b.face, toP) * Math.min(1, dt * 6);
      if (b.t <= 0) {
        if (b.tele && b.attack !== 'charge') { fx.releaseMarker(b.tele); b.tele = null; }
        if (b.attack === 'jump') {
          b.state = 'air'; b.t = 1.0; b.tx = p.x; b.tz = p.z; b.sx = b.x; b.sz = b.z;
          b.tele = fx.circleMarker(b.tx, b.tz, 2.7, 1.0, 0xff7a3a);
          audio.play('dash');
        } else if (b.attack === 'charge') {
          b.state = 'charge'; b.t = 1.8; b.hitDone = false;
          b.vx = Math.sin(b.aim) * 15; b.vz = Math.cos(b.aim) * 15;
          audio.play('dash');
        } else { b.state = 'pound'; b.t = 0; }
      }
      break;
    case 'air': {
      const k = 1 - b.t / 1.0;
      // marker tracks you for the first half, then locks: always dodgeable
      if (k < 0.45) { b.tx = damp(b.tx, p.x, 5, dt); b.tz = damp(b.tz, p.z, 5, dt); if (b.tele) b.tele.g.position.set(b.tx, 0.035, b.tz); }
      b.x = b.sx + (b.tx - b.sx) * k; b.z = b.sz + (b.tz - b.sz) * k;
      b.y = Math.sin(Math.min(1, k) * Math.PI) * 5;
      b.vx = b.vz = 0;
      b.visible = b.y < 2.5;
      if (b.t <= 0) {
        b.y = 0; b.visible = true;
        b.x = b.tx; b.z = b.tz;
        if (b.tele) { fx.releaseMarker(b.tele); b.tele = null; }
        game.world.addShake(0.6); audio.play('slam');
        fx.ring(b.x, b.z, 0xffb08a, 0.5, 3, 0.35);
        fx.burst(b.x, 0.2, b.z, 22, 0xb8a898, { speed: 9, up: 5, life: 0.7, size: 0.2, debris: true });
        if (Math.hypot(p.x - b.x, p.z - b.z) < 2.7 + p.r) game.hurtPlayer(b.dmg + 1, b.x, b.z);
        if (b.phase2) game.hazards.push({ x: b.x, z: b.z, r: 1, speed: 7, width: 0.45, maxR: 14, dmg: b.dmg - 1 });
        b.state = 'recover'; b.t = 0.8;
      }
      break;
    }
    case 'charge':
      if (game.time % 0.03 < dt) fx.burst(b.x, 0.1, b.z, 2, 0xb8a898, { speed: 2, up: 2, life: 0.4, size: 0.14, debris: true });
      if (b.t <= 0) { b.state = 'recover'; b.t = 0.5; b.vx = b.vz = 0; if (b.tele) { fx.releaseMarker(b.tele); b.tele = null; } }
      break;
    case 'stunned':
      stop(b, dt);
      if (b.t <= 0) { b.state = 'idle'; b.cd = 0.6; b.seq++; }
      break;
    case 'pound':
      stop(b, dt);
      if (b.t <= 0) {
        game.hazards.push({ x: b.x, z: b.z, r: b.r, speed: 6.5, width: 0.45, maxR: 14, dmg: b.dmg - 1 });
        game.world.addShake(0.35); audio.play('slam');
        fx.ring(b.x, b.z, 0xffb08a, b.r, b.r + 1.5, 0.3);
        b.step++; b.t = 0.6;
        if (b.step >= (b.phase2 ? 3 : 2)) { b.state = 'recover'; b.t = 0.6; }
      }
      break;
    case 'recover':
      stop(b, dt);
      if (b.t <= 0) { b.state = 'idle'; b.cd = b.phase2 ? 0.8 : 1.2; b.seq++; }
      break;
  }
}

// ---------------- THE HUNTER: chained dash strikes, knife fans, blink ambush
function hunter(game, b, dt, d, toP) {
  const fx = game.fx, p = game.player;
  if (b.phase2 && !b.spawned2) {
    b.spawned2 = true;
    for (const s of [-1, 1]) game.spawnEnemy('dasher', b.x + s * 2, b.z, { bossMinion: true });
  }
  switch (b.state) {
    case 'idle':
      idleDrift(game, b, dt, d, toP, 6, 4);
      if (b.cd <= 0) {
        const opts = ['dashes', 'knives', 'blink'];
        b.attack = opts[(b.seq + (Math.random() < 0.4 ? 1 : 0)) % 3];
        b.step = 0;
        if (b.attack === 'dashes') startHunterDash(game, b);
        else if (b.attack === 'knives') { b.state = 'tele'; b.t = 0.5; b.tele = fx.circleMarker(b.x, b.z, b.r + 0.5, 0.5, 0x46d8e8); audio.play('telegraph'); }
        else { b.state = 'vanish'; b.t = 0.35; audio.play('dash'); }
      }
      break;
    case 'tele':
      stop(b, dt);
      b.face += angleDiff(b.face, toP) * Math.min(1, dt * 10);
      if (b.tele) b.tele.g.position.set(b.x, 0.035, b.z);
      if (b.t <= 0) {
        if (b.tele) { fx.releaseMarker(b.tele); b.tele = null; }
        if (b.attack === 'dashes') {
          b.state = 'dash'; b.t = b.dashLen / 20; b.hitDone = false;
          b.vx = Math.sin(b.aim) * 20; b.vz = Math.cos(b.aim) * 20;
          audio.play('dash');
        } else { b.state = 'knives'; b.t = 0; }
      }
      break;
    case 'dash':
      if (game.time % 0.02 < dt) fx.emit(b.x, 1, b.z, 0, 0, 0, 0.3, 0.35, HUNTER_COL, { grav: 0 });
      if (b.t <= 0) {
        b.vx = b.vz = 0; b.step++;
        if (b.step < (b.phase2 ? 4 : 3)) { b.state = 'gap'; b.t = 0.15; }
        else { b.state = 'recover'; b.t = 0.8; }
      }
      break;
    case 'gap':
      stop(b, dt, 20);
      if (b.t <= 0) startHunterDash(game, b);
      break;
    case 'knives':
      stop(b, dt);
      if (b.t <= 0) {
        const n = 7;
        for (let k = 0; k < n; k++) game.fireBullet(b.x + Math.sin(toP) * b.r, b.z + Math.cos(toP) * b.r, toP + (k - (n - 1) / 2) * 0.15 + (b.step % 2 ? 0.075 : 0), 9.5, b.dmg - 1, { y: 1.3, r: 0.17 });
        audio.play('swing'); audio.play('enemyShoot');
        b.step++; b.t = 0.35;
        if (b.step >= (b.phase2 ? 2 : 1)) { b.state = 'recover'; b.t = 0.6; }
      }
      break;
    case 'vanish':
      stop(b, dt);
      b.scale = Math.max(0.01, b.t / 0.35);
      if (b.t <= 0) {
        b.visible = false; b.state = 'hidden'; b.t = 1.0; b.tx = p.x; b.tz = p.z;
        b.tele = fx.circleMarker(b.tx, b.tz, 2.3, 1.0, 0x46d8e8);
        audio.play('telegraph');
      }
      break;
    case 'hidden':
      if (b.t > 0.55) { b.tx = damp(b.tx, p.x, 6, dt); b.tz = damp(b.tz, p.z, 6, dt); if (b.tele) b.tele.g.position.set(b.tx, 0.035, b.tz); }
      if (b.t <= 0) {
        if (b.tele) { fx.releaseMarker(b.tele); b.tele = null; }
        b.x = b.tx; b.z = b.tz; b.visible = true; b.scale = 1;
        collideCircle(game.room, b, b.r);
        fx.ring(b.x, b.z, 0x46d8e8, 0.4, 2.4, 0.3);
        fx.slash(b.x, 1, b.z, toP, TAU * 0.95, 2.4, 0x46d8e8, 0.2);
        audio.play('heavy'); game.world.addShake(0.4);
        if (Math.hypot(p.x - b.x, p.z - b.z) < 2.3 + p.r) game.hurtPlayer(b.dmg, b.x, b.z);
        b.state = 'recover'; b.t = 0.7;
      }
      break;
    case 'recover':
      stop(b, dt);
      b.scale = Math.min(1, b.scale + dt * 4);
      if (b.t <= 0) { b.state = 'idle'; b.cd = b.phase2 ? 0.7 : 1.0; b.seq++; }
      break;
  }
}

function startHunterDash(game, b) {
  const p = game.player, fx = game.fx;
  b.aim = Math.atan2(p.x - b.x, p.z - b.z);
  b.dashLen = Math.min(12, Math.hypot(p.x - b.x, p.z - b.z) + 3);
  b.state = 'tele'; b.t = b.phase2 ? 0.42 : 0.55;
  b.tele = fx.lineMarker(b.x, b.z, b.aim, b.dashLen, 1.4, b.t, 0x46d8e8);
  b.face = b.aim;
  audio.play('telegraph');
}

function syncBoss(game, b, dt) {
  const m = b.model, t = game.time;
  m.root.visible = b.visible && !(b.dead && b.deathT > 0.55);
  let sink = 0, sc = b.scale;
  if (b.dead) { sink = b.deathT * 1.5; sc = Math.max(0.01, 1 - b.deathT * 1.4); if (Math.random() < 0.5) game.fx.burst(b.x + rand(-1, 1), 1 + rand(0, 1.5), b.z + rand(-1, 1), 2, 0xffd08a, { speed: 4, up: 4, life: 0.4, size: 0.15 }); }
  m.root.position.set(b.x + (b.dead ? rand(-0.08, 0.08) : 0), b.y - sink * 0.3, b.z);
  m.root.rotation.y = b.face;
  const tele = b.state === 'tele' || b.state === 'vanish';
  const squash = tele ? 1 + Math.sin(t * 30) * 0.03 : 1;
  m.root.scale.set(sc * squash, sc * (tele ? 0.94 : 1), sc * squash);
  if (m.float) m.rig.position.y = Math.sin(t * 2) * 0.15;
  if (m.core) m.core.scale.setScalar(tele ? 1.5 + Math.sin(t * 35) * 0.25 : b.phase2 ? 1.2 : 1);
  if (b.kind === 'crusher' && m.armL) {
    const up = b.state === 'tele' && b.attack === 'pound' ? 1 : b.state === 'tele' && b.attack === 'jump' ? -0.3 : 0;
    m.armL.position.y = damp(m.armL.position.y, 0.75 + up * 1.4, 12, dt); m.armR.position.y = m.armL.position.y;
  }
  if (b.kind === 'hunter' && m.armL) {
    const spread = b.state === 'dash' ? 1.2 : b.state === 'tele' ? 0.9 : 0.35;
    m.armL.rotation.y = damp(m.armL.rotation.y, -spread, 10, dt); m.armR.rotation.y = -m.armL.rotation.y;
  }
  if (b.kind === 'warden' && m.armL) { m.armL.position.y = 1.9 + Math.sin(t * 2.2) * 0.1; m.armR.position.y = 1.9 + Math.cos(t * 2.2) * 0.1; }
  const fl = b.flash > 0 ? 0.7 : b.phase2 ? 0.08 + Math.sin(t * 6) * 0.05 : 0;
  for (const mat of m.mats) { mat.emissiveIntensity = fl; mat.emissive.setHex(b.flash > 0 ? 0xffffff : 0xff3a3a); }
}

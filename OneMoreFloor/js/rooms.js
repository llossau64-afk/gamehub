// Modular room templates. Legend:
//  # wall   . floor   P pillar   c crate (breakable, drops coins)   ^ spike trap
//  s enemy spawn   E exit lift   B arrival lift   (space) outside
// Templates are randomly mirrored, so 11 layouts give ~20 distinct rooms.

export const TILE = 1.35;
export const T = { VOID: 0, FLOOR: 1, WALL: 2, PILLAR: 3, CRATE: 4, TRAP: 5 };

const TEMPLATES = [
  { name: 'Box', minFloor: 1, map: `
###############
#......E......#
#.............#
#..s.......s..#
#.............#
#......s......#
#.............#
#..s.......s..#
#.............#
#......B......#
###############` },
  { name: 'Long Hall', minFloor: 2, map: `
#########################
#...........E...........#
#..s.....c.....c.....s..#
#.......................#
#...s.......s.......s...#
#.......................#
#..s.....c.....c.....s..#
#...........B...........#
#########################` },
  { name: 'Pillars', minFloor: 1, map: `
###################
#........E........#
#..s...........s..#
#....PP.....PP....#
#....PP.....PP....#
#........s........#
#.................#
#....PP.....PP....#
#....PP.....PP....#
#..s...........s..#
#........B........#
###################` },
  { name: 'Cross', minFloor: 2, map: `
      #########
      #...E...#
      #..s.s..#
#######.......#######
#.s...............s.#
#...................#
#.s.......c.......s.#
#...................#
#######.......#######
      #.......#
      #...B...#
      #########` },
  { name: 'Storage', minFloor: 3, map: `
#######################
#..........E..........#
#..c..c....s....c..c..#
#.....................#
#.s...ccc.....ccc...s.#
#.....................#
#.........c.c.........#
#.s.................s.#
#.....ccc.....ccc.....#
#.....................#
#..c......s......c....#
#..........B..........#
#######################` },
  { name: 'Arena', minFloor: 4, map: `
#####################
#.........E.........#
#.s.....s...s.....s.#
#...................#
#...P...........P...#
#...................#
#.s.......s.......s.#
#...................#
#.s.......s.......s.#
#...................#
#...P...........P...#
#...................#
#.s.....s...s.....s.#
#.........B.........#
#####################` },
  { name: 'Spike Run', minFloor: 4, traps: true, map: `
###################
#........E........#
#..s....s....s....#
#.................#
#^^^^^^^...^^^^^^^#
#.................#
#...s.........s...#
#.................#
#^^^^^^^...^^^^^^^#
#.................#
#..s....s.....s...#
#........B........#
###################` },
  { name: 'Corner', minFloor: 3, map: `
###########
#....E....#
#..s...s..#
#.........#
#.........#
#..s......##########
#..................#
#.......s......s...#
#.........c........#
#..s...............#
#.........B........#
####################` },
  { name: 'Ring', minFloor: 2, map: `
#####################
#.........E.........#
#.s.......s.......s.#
#...................#
#.....#########.....#
#.s...#########...s.#
#.....#########.....#
#...................#
#.s.......s.......s.#
#.........B.........#
#####################` },
  { name: 'Twin Rooms', minFloor: 5, map: `
#######################
#..........E..........#
#..s...s..#..s....s...#
#.........#...........#
#.........#...........#
#..s.................s#
#.........#...........#
#..s...s..#..s....s...#
#.........#...........#
#..........B..........#
#######################` },
  { name: 'Spike Garden', minFloor: 6, traps: true, map: `
###################
#........E........#
#.s.....^.....s...#
#...P.......P.....#
#..^^^...s...^^^..#
#.................#
#.s...P.^.P.....s.#
#.................#
#..^^^.......^^^..#
#...P...s...P.....#
#.................#
#........B........#
###################` },
];

const BOSS_ROOM = { name: 'Boss', map: `
#######################
#..........E..........#
#.....................#
#..PP.............PP..#
#..PP......s......PP..#
#.....................#
#.....................#
#.....................#
#.....................#
#.....................#
#..PP.............PP..#
#..PP.............PP..#
#.....................#
#..........B..........#
#######################` };

function parse(tpl, mirror) {
  let rows = tpl.map.split('\n').filter(r => r.length);
  const w = Math.max(...rows.map(r => r.length));
  rows = rows.map(r => r.padEnd(w, ' '));
  if (mirror) rows = rows.map(r => r.split('').reverse().join(''));
  const h = rows.length;
  const tiles = new Uint8Array(w * h);
  const room = { name: tpl.name, w, h, tiles, spawns: [], traps: [], crates: [], pillars: [], entry: null, exit: null };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      let t = T.FLOOR;
      if (ch === ' ') t = T.VOID;
      else if (ch === '#') t = T.WALL;
      else if (ch === 'P') { t = T.PILLAR; room.pillars.push([i, j]); }
      else if (ch === 'c') { t = T.CRATE; room.crates.push([i, j]); }
      else if (ch === '^') { t = T.TRAP; room.traps.push([i, j]); }
      else if (ch === 's') room.spawns.push([i, j]);
      else if (ch === 'E') room.exit = [i, j];
      else if (ch === 'B') room.entry = [i, j];
      tiles[j * w + i] = t;
    }
  }
  return room;
}

export function makeRoom(rng, floor, recent) {
  if (floor % 10 === 0) return parse(BOSS_ROOM, false);
  if (floor === 1) return parse(TEMPLATES[0], rng.chance(0.5));
  const pool = TEMPLATES.filter(t => t.minFloor <= floor && !recent.includes(t.name));
  const tpl = rng.pick(pool.length ? pool : TEMPLATES);
  recent.push(tpl.name);
  if (recent.length > 3) recent.shift();
  return parse(tpl, rng.chance(0.5));
}

export function menuRoom() { return parse(TEMPLATES[2], false); }

// ---------- grid helpers ----------
export function tileAt(room, i, j) {
  if (i < 0 || j < 0 || i >= room.w || j >= room.h) return T.VOID;
  return room.tiles[j * room.w + i];
}
export const isSolidTile = t => t === T.WALL || t === T.PILLAR || t === T.CRATE || t === T.VOID;
export const toWorld = (room, i, j) => [(i - room.w / 2 + 0.5) * TILE, (j - room.h / 2 + 0.5) * TILE];
export const toTile = (room, x, z) => [Math.floor(x / TILE + room.w / 2), Math.floor(z / TILE + room.h / 2)];
export function solidAt(room, x, z) { const [i, j] = toTile(room, x, z); return isSolidTile(tileAt(room, i, j)); }

// Push a circle out of solid tiles. Returns {hitX, hitZ} flags for bounce logic.
export function collideCircle(room, p, r) {
  const res = { hitX: false, hitZ: false, hit: false };
  const [ci, cj] = toTile(room, p.x, p.z);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (!isSolidTile(tileAt(room, i, j))) continue;
        const [cx, cz] = toWorld(room, i, j), h = TILE / 2;
        const nx = Math.max(cx - h, Math.min(p.x, cx + h)), nz = Math.max(cz - h, Math.min(p.z, cz + h));
        const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        res.hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          p.x += dx / d * push; p.z += dz / d * push;
          if (Math.abs(dx) > Math.abs(dz)) res.hitX = true; else res.hitZ = true;
        } else {
          // centre inside the tile: push out along the shallowest axis
          const ox = (p.x - cx), oz = (p.z - cz);
          if (Math.abs(ox) > Math.abs(oz)) { p.x = cx + Math.sign(ox || 1) * (h + r); res.hitX = true; }
          else { p.z = cz + Math.sign(oz || 1) * (h + r); res.hitZ = true; }
        }
      }
    }
  }
  return res;
}

// Grid DDA line of sight.
export function lineOfSight(room, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz);
  const steps = Math.ceil(d / (TILE * 0.35));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (solidAt(room, ax + dx * t, az + dz * t)) return false;
  }
  return true;
}

// BFS flow field towards a target tile; enemies descend it when they lack line of sight.
export class FlowField {
  constructor(room) {
    this.room = room;
    this.dist = new Int16Array(room.w * room.h);
    this.queue = new Int32Array(room.w * room.h);
    this.ti = -1; this.tj = -1;
  }
  update(i, j) {
    if (i === this.ti && j === this.tj) return;
    this.ti = i; this.tj = j;
    const { w, h, tiles } = this.room, dist = this.dist, q = this.queue;
    dist.fill(-1);
    if (i < 0 || j < 0 || i >= w || j >= h) return;
    let head = 0, tail = 0;
    dist[j * w + i] = 0; q[tail++] = j * w + i;
    while (head < tail) {
      const idx = q[head++], ci = idx % w, cj = (idx - ci) / w, d = dist[idx] + 1;
      for (let k = 0; k < 4; k++) {
        const ni = ci + (k === 0 ? 1 : k === 1 ? -1 : 0), nj = cj + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const nidx = nj * w + ni;
        if (dist[nidx] !== -1 || isSolidTile(tiles[nidx])) continue;
        dist[nidx] = d; q[tail++] = nidx;
      }
    }
  }
  // Direction (unit) from world point toward lower-distance neighbour; null if unknown.
  dir(x, z) {
    const room = this.room, [i, j] = toTile(room, x, z), w = room.w;
    if (i < 0 || j < 0 || i >= w || j >= room.h) return null;
    const here = this.dist[j * w + i];
    let best = here < 0 ? 1e9 : here, bi = -1, bj = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= room.h) continue;
      const d = this.dist[nj * w + ni];
      if (d < 0) continue;
      // no corner cutting
      if (di && dj && (this.dist[j * w + ni] < 0 || this.dist[nj * w + i] < 0)) continue;
      if (d < best) { best = d; bi = ni; bj = nj; }
    }
    if (bi < 0) return null;
    const [tx, tz] = toWorld(room, bi, bj), dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }
}

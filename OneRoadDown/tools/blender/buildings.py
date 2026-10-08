"""Alpine buildings and roadside structures for ONE ROAD DOWN.

    python tools/blender/buildings.py OneRoadDown/assets/models

Produces buildings.glb: chalet0..2, barn0, chapel0, shack0, gasstation0,
busstop0, pole0, fence0, logpile0. Origin at the centre of the footprint on
the ground; the building's front (door, balcony) faces +Y in Blender, which is
-Z... the game rotates each instance to face the road using `front` = +X.
All faces use world-scaled box UVs on tileable procedural textures.
"""
import math
import os
import sys
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import value_noise, make_image, stroke, ellipse, material, MeshBuilder, export_glb

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)


# ================================================================== textures
def tex_plaster(name, base):
    S = 512
    r = np.random.default_rng(1)
    n = value_noise(S, 8, r, 5); d = value_noise(S, 3, r, 3); g = value_noise(S, 64, r, 2)
    c = np.zeros((S, S, 4), np.float32)
    stain = np.clip((d - 0.6) * 2.5, 0, 1) * np.linspace(0.2, 1, S)[:, None]
    for i in range(3):
        c[..., i] = base[i] * (0.9 + 0.12 * n + 0.06 * g) * (1 - 0.25 * stain)
    c[..., 3] = 1
    return make_image(name, c)


def tex_boards(name, base, vertical=True, weather=0.3):
    S = 512
    r = np.random.default_rng(hash(name) % 2 ** 32)
    c = np.zeros((S, S, 4), np.float32)
    n = value_noise(S, 6, r, 4)
    boards = 8
    bw = S // boards
    grain_noise = value_noise(S, 4, r, 3)
    for b in range(boards):
        tone = r.uniform(0.82, 1.1)
        x0 = b * bw
        sl = (slice(None), slice(x0, x0 + bw)) if vertical else (slice(x0, x0 + bw), slice(None))
        yy, xx = np.mgrid[0:S, 0:bw] if vertical else np.mgrid[0:bw, 0:S]
        along = yy if vertical else xx
        across = xx if vertical else yy
        grain = np.sin(across * 0.9 + (grain_noise[sl] * 14) + along * 0.01) * 0.5 + 0.5
        for i in range(3):
            c[sl][..., i] = base[i] * tone * (0.82 + 0.18 * grain) * (0.85 + 0.25 * n[sl])
        gap = (across < 2) | (across > bw - 2)
        for i in range(3):
            c[sl][..., i] = np.where(gap, c[sl][..., i] * 0.35, c[sl][..., i])
    # sun bleaching at the top and weathering streaks
    streak = value_noise(S, 16, r, 2)
    bleach = (np.linspace(1, 0, S)[:, None] * weather) * (0.6 + 0.4 * streak)
    for i in range(3):
        c[..., i] = c[..., i] * (1 - bleach) + 0.55 * bleach
    c[..., 3] = 1
    return make_image(name, c)


def tex_stone(name, base):
    S = 512
    r = np.random.default_rng(hash(name) % 2 ** 32)
    c = np.zeros((S, S, 4), np.float32)
    mortar = np.array([0.55, 0.53, 0.5])
    c[..., :3] = mortar * 0.8
    n = value_noise(S, 16, r, 3)
    y = 0
    while y < S:
        h = int(r.uniform(40, 70))
        x = -int(r.uniform(0, 60))
        while x < S:
            w = int(r.uniform(60, 120))
            tone = r.uniform(0.75, 1.15)
            col = np.array(base) * tone + r.normal(0, 0.03, 3)
            yy, xx = np.mgrid[0:S, 0:S]
            cx, cy = x + w / 2, y + h / 2
            d = np.maximum(np.abs(xx - cx) / (w / 2 - 3), np.abs(yy - cy) / (h / 2 - 3))
            d = d + (n - 0.5) * 0.25
            m = d < 1
            shade = np.clip(1.15 - d * 0.35, 0.6, 1.2)
            for i in range(3):
                c[..., i] = np.where(m, col[i] * shade * (0.85 + 0.25 * n), c[..., i])
            x += w
        y += h
    c[..., 3] = 1
    return make_image(name, c)


def tex_shingles(name, base):
    S = 512
    r = np.random.default_rng(hash(name) % 2 ** 32)
    c = np.zeros((S, S, 4), np.float32)
    n = value_noise(S, 8, r, 4)
    rows = 16
    rh = S // rows
    for row in range(rows):
        off = (row % 2) * 16
        for col in range(-1, S // 32 + 1):
            tone = r.uniform(0.75, 1.15)
            x0 = col * 32 + off
            for yy in range(row * rh, (row + 1) * rh):
                t = (yy - row * rh) / rh
                xs = slice(max(0, x0 + 1), max(0, min(S, x0 + 31)))
                for i in range(3):
                    c[yy, xs, i] = base[i] * tone * (0.65 + 0.45 * t) * (0.85 + 0.3 * n[yy, xs])
    c[..., 3] = 1
    return make_image(name, c)


def tex_metal_roof(name):
    S = 256
    r = np.random.default_rng(5)
    n = value_noise(S, 6, r, 4)
    rust = value_noise(S, 4, r, 4)
    c = np.zeros((S, S, 4), np.float32)
    rib = (np.sin(np.arange(S) / S * math.pi * 2 * 10) * 0.5 + 0.5)[None, :]
    base = np.array([0.5, 0.52, 0.53]) * (0.7 + 0.3 * rib) * (0.9 + 0.2 * n)[..., None] if False else None
    for i, v in enumerate((0.5, 0.52, 0.53)):
        c[..., i] = v * (0.7 + 0.3 * rib) * (0.9 + 0.2 * n)
    rm = np.clip((rust - 0.52) * 4, 0, 1)
    for i, v in enumerate((0.42, 0.2, 0.08)):
        c[..., i] = c[..., i] * (1 - rm) + v * rm * (0.8 + 0.3 * n)
    c[..., 3] = 1
    return make_image(name, c)


def tex_window(name, frame=(0.92, 0.9, 0.85), lit=False):
    S = 256
    c = np.zeros((S, S, 4), np.float32)
    c[..., :3] = frame
    c[..., 3] = 1
    r = np.random.default_rng(3)
    glass_top = np.array([0.32, 0.4, 0.46]) if not lit else np.array([0.95, 0.78, 0.45])
    glass_bot = np.array([0.12, 0.15, 0.17]) if not lit else np.array([0.7, 0.5, 0.25])
    for (x0, y0, x1, y1) in ((18, 18, 124, 124), (132, 18, 238, 124), (18, 132, 124, 238), (132, 132, 238, 238)):
        for y in range(y0, y1):
            t = (y - y0) / (y1 - y0)
            c[y, x0:x1, :3] = glass_top * (1 - t) + glass_bot * t
        # diagonal sky reflection
        for k in range(x1 - x0):
            yy = y0 + int(k * 0.8) + 10
            if y0 <= yy < y1 - 6:
                c[yy:yy + 6, x0 + k, :3] = np.minimum(1, c[yy:yy + 6, x0 + k, :3] + 0.16)
        # curtains
        if not lit and r.random() < 0.6:
            c[y0:y1, x0:x0 + 18, :3] = (0.82, 0.78, 0.7)
    return make_image(name, c)


def tex_door(name, base):
    S = 256
    c = np.zeros((S, S, 4), np.float32)
    c[..., :3] = np.array(base) * 0.8
    c[..., 3] = 1
    for (x0, y0, x1, y1) in ((24, 20, 116, 120), (140, 20, 232, 120), (24, 140, 116, 236), (140, 140, 232, 236)):
        c[y0:y1, x0:x1, :3] = np.array(base) * 1.05
        c[y0:y0 + 4, x0:x1, :3] = np.array(base) * 0.5
        c[y0:y1, x0:x0 + 4, :3] = np.array(base) * 0.5
    c[118:138, 200:214, :3] = (0.75, 0.62, 0.3)
    return make_image(name, c)


def tex_shutter(name, base):
    S = 128
    c = np.zeros((S, S, 4), np.float32)
    c[..., 3] = 1
    for y in range(S):
        t = (y % 12) / 12
        c[y, :, :3] = np.array(base) * (0.6 + 0.5 * t)
    c[:, :6, :3] *= 0.5; c[:, -6:, :3] *= 0.5
    return make_image(name, c)


def tex_railing(name, base):
    S = 256
    c = np.zeros((S, S, 4), np.float32)
    c[..., :3] = base
    for x in range(S):
        k = x % 32
        if 6 < k < 26:
            c[30:226, x, 3] = 1
            # cut-out heart / diamond shape typical of alpine balconies
    yy, xx = np.mgrid[0:S, 0:S]
    for cx in range(16, S, 32):
        d = np.abs(xx - cx) / 6 + np.abs(yy - 128) / 14
        c[..., 3] = np.where(d < 1, 0, c[..., 3])
    c[0:30, :, 3] = 1; c[226:, :, 3] = 1
    c[0:30, :, :3] = np.array(base) * 0.85
    return make_image(name, c)


def tex_flowers(name):
    S = 128
    c = np.zeros((S, S, 4), np.float32)
    r = np.random.default_rng(9)
    for i in range(120):
        x, y = r.uniform(4, S - 4), r.uniform(10, S - 10)
        ellipse(c, x, y, 5, 4, r.uniform(0, 3), np.array([0.22, 0.38, 0.12]))
    for i in range(50):
        x, y = r.uniform(4, S - 4), r.uniform(4, S * 0.6)
        ellipse(c, x, y, 4.5, 4.5, 0, np.array([0.85, 0.12, 0.1]) if i % 4 else np.array([0.95, 0.85, 0.85]))
    return make_image(name, c)


def tex_concrete(name, base):
    S = 256
    r = np.random.default_rng(hash(name) % 2 ** 32)
    n = value_noise(S, 6, r, 5); s = value_noise(S, 3, r, 3)
    c = np.zeros((S, S, 4), np.float32)
    for i in range(3):
        c[..., i] = base[i] * (0.85 + 0.2 * n) * (1 - np.clip((s - 0.62) * 2, 0, 0.5))
    c[..., 3] = 1
    return make_image(name, c)


def tex_painted_metal(name, base):
    S = 256
    r = np.random.default_rng(hash(name) % 2 ** 32)
    n = value_noise(S, 8, r, 4); rust = value_noise(S, 5, r, 4)
    c = np.zeros((S, S, 4), np.float32)
    rm = np.clip((rust - 0.55) * 3, 0, 1)
    for i, v in enumerate((0.4, 0.2, 0.08)):
        c[..., i] = base[i] * (0.85 + 0.2 * n) * (1 - rm) + v * rm
    c[..., 3] = 1
    return make_image(name, c)


TX = {
    'plaster': tex_plaster('plaster', (0.86, 0.83, 0.76)),
    'plaster_ochre': tex_plaster('plaster_ochre', (0.84, 0.7, 0.48)),
    'wood': tex_boards('wood', (0.42, 0.28, 0.17)),
    'wood_dark': tex_boards('wood_dark', (0.25, 0.16, 0.1), weather=0.45),
    'wood_grey': tex_boards('wood_grey', (0.44, 0.42, 0.38), weather=0.2),
    'wood_h': tex_boards('wood_h', (0.38, 0.25, 0.15), vertical=False),
    'stone': tex_stone('stone', (0.56, 0.54, 0.5)),
    'shingle_wood': tex_shingles('shingle_wood', (0.36, 0.25, 0.18)),
    'shingle_slate': tex_shingles('shingle_slate', (0.3, 0.31, 0.33)),
    'metal_roof': tex_metal_roof('metal_roof'),
    'window': tex_window('window'),
    'window_lit': tex_window('window_lit', lit=True),
    'window_dark': tex_window('window_dark', frame=(0.22, 0.16, 0.12)),
    'door': tex_door('door', (0.36, 0.22, 0.13)),
    'shutter_green': tex_shutter('shutter_green', (0.18, 0.33, 0.2)),
    'shutter_red': tex_shutter('shutter_red', (0.5, 0.14, 0.1)),
    'railing': tex_railing('railing', (0.4, 0.26, 0.15)),
    'flowers': tex_flowers('flowers'),
    'concrete': tex_concrete('concrete', (0.62, 0.61, 0.58)),
    'painted_orange': tex_painted_metal('painted_orange', (0.82, 0.4, 0.12)),
    'painted_white': tex_painted_metal('painted_white', (0.85, 0.85, 0.82)),
}
MAT = {k: material('b_' + k, v, rough=0.85 if 'window' not in k else 0.15, alpha_clip=k in ('railing', 'flowers'), double=True)
       for k, v in TX.items()}
MAT['metal'] = material('b_metal', None, (0.3, 0.31, 0.32, 1), 0.45, 0.8)
MAT['dark'] = material('b_dark', None, (0.06, 0.06, 0.06, 1), 0.9)
MAT['white'] = material('b_white', None, (0.85, 0.85, 0.82, 1), 0.6)
MAT['glass'] = material('b_glass', TX['window'], rough=0.1)


# ================================================================== geometry helpers
def box(mb, c, size, mat, tile=1.6, faces='all', rot=0.0, uvrot=False):
    """Axis-aligned (optionally Z-rotated) box with world-scaled UVs."""
    cx, cy, cz = c
    sx, sy, sz = (s / 2 for s in size)
    ca, sa = math.cos(rot), math.sin(rot)
    P = lambda x, y, z: (cx + x * ca - y * sa, cy + x * sa + y * ca, cz + z)
    F = {
        '+x': [(sx, -sy, -sz), (sx, sy, -sz), (sx, sy, sz), (sx, -sy, sz)],
        '-x': [(-sx, sy, -sz), (-sx, -sy, -sz), (-sx, -sy, sz), (-sx, sy, sz)],
        '+y': [(sx, sy, -sz), (-sx, sy, -sz), (-sx, sy, sz), (sx, sy, sz)],
        '-y': [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, -sy, sz), (-sx, -sy, sz)],
        '+z': [(-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)],
        '-z': [(-sx, sy, -sz), (sx, sy, -sz), (sx, -sy, -sz), (-sx, -sy, -sz)],
    }
    for k, quad in F.items():
        if faces != 'all' and k not in faces:
            continue
        pts = [P(*q) for q in quad]
        if k in ('+x', '-x'):
            uv = [((q[1] + cy) / tile, (q[2] + cz) / tile) for q in quad]
        elif k in ('+y', '-y'):
            uv = [((q[0] + cx) / tile, (q[2] + cz) / tile) for q in quad]
        else:
            uv = [((q[0] + cx) / tile, (q[1] + cy) / tile) for q in quad]
        if uvrot:
            uv = [(v, u) for (u, v) in uv]
        mb.quad(*pts, uv, mat)


def plane(mb, pts, mat, uv=((0, 0), (1, 0), (1, 1), (0, 1))):
    mb.quad(*pts, list(uv), mat)


def gable_roof(mb, w, d, z0, pitch, overhang, thick, mat_roof, mat_edge, ridge_axis='y'):
    """Two sloped slabs. Ridge runs along Y (length d)."""
    hw = w / 2 + overhang
    rise = (w / 2) * math.tan(pitch)
    hd = d / 2 + overhang
    top = z0 + rise + overhang * math.tan(pitch) * 0.0
    slope_len = math.hypot(hw, rise + overhang * math.tan(pitch))
    for sgn in (1, -1):
        e = (sgn * hw, z0 - overhang * math.tan(pitch))
        rdg = (0, top)
        # upper surface
        pts = [(e[0], -hd, e[1]), (e[0], hd, e[1]), (0, hd, rdg[1]), (0, -hd, rdg[1])]
        if sgn < 0:
            pts = [pts[1], pts[0], pts[3], pts[2]]
        uv = [(0, 0), (d / 2.0, 0), (d / 2.0, slope_len / 2.0), (0, slope_len / 2.0)]
        plane(mb, pts, mat_roof, uv)
        # underside
        lo = [(p[0], p[1], p[2] - thick) for p in pts]
        plane(mb, [lo[1], lo[0], lo[3], lo[2]], mat_edge, uv)
        # eave edge board
        a, b = pts[0], pts[1]
        plane(mb, [(a[0], a[1], a[2] - thick), (b[0], b[1], b[2] - thick), b, a] if sgn > 0 else [(b[0], b[1], b[2] - thick), (a[0], a[1], a[2] - thick), a, b], mat_edge, ((0, 0), (d, 0), (d, 0.15), (0, 0.15)))
    # gable edge boards (barge boards) front/back
    for y in (-hd, hd):
        for sgn in (1, -1):
            e = (sgn * hw, z0 - overhang * math.tan(pitch))
            pts = [(e[0], y, e[1] - thick), (0, y, top - thick), (0, y, top), (e[0], y, e[1])]
            if (y > 0) == (sgn > 0):
                pts = [pts[1], pts[0], pts[3], pts[2]]
            plane(mb, pts, mat_edge, ((0, 0), (1, 0), (1, 0.1), (0, 0.1)))
    return top


def gable_wall(mb, w, y, z0, pitch, mat, facing):
    rise = (w / 2) * math.tan(pitch)
    # triangle as a degenerate quad
    pts = [(-w / 2, y, z0), (w / 2, y, z0), (0, y, z0 + rise), (0, y, z0 + rise)]
    if facing < 0:
        pts = [pts[1], pts[0], pts[2], pts[3]]
    uv = [(p[0] / 1.6, (p[2]) / 1.6) for p in pts]
    mb.quad(*pts, uv, mat)


def window(mb, x, y, z, w, h, facing_axis, sgn, lit=False, shutters=None, flowerbox=True, depth=0.12):
    """Window set into a wall at the given wall plane. facing_axis 'x' or 'y'."""
    glass = MAT['window_lit'] if lit else MAT['window']
    def P(u, v, n):  # u along wall, v up, n out of wall
        if facing_axis == 'x':
            return (x + n * sgn, y + u * (-sgn), z + v)
        return (x + u * sgn, y + n * sgn, z + v)
    # recessed glass
    plane(mb, [P(-w / 2, 0, -depth), P(w / 2, 0, -depth), P(w / 2, h, -depth), P(-w / 2, h, -depth)], glass)
    # reveal
    for (a, b) in (((-w / 2, 0), (-w / 2, h)), ((w / 2, h), (w / 2, 0)), ((-w / 2, h), (w / 2, h)), ((w / 2, 0), (-w / 2, 0))):
        plane(mb, [P(a[0], a[1], 0.01), P(b[0], b[1], 0.01), P(b[0], b[1], -depth), P(a[0], a[1], -depth)], MAT['white'])
    # frame trim
    t = 0.07
    for (u0, v0, u1, v1) in ((-w / 2 - t, -t, w / 2 + t, 0), (-w / 2 - t, h, w / 2 + t, h + t), (-w / 2 - t, 0, -w / 2, h), (w / 2, 0, w / 2 + t, h)):
        plane(mb, [P(u0, v0, 0.03), P(u1, v0, 0.03), P(u1, v1, 0.03), P(u0, v1, 0.03)], MAT['white'])
    if shutters:
        for side in (-1, 1):
            u0 = side * (w / 2 + 0.04) if side > 0 else -(w / 2 + 0.04) - w * 0.5
            plane(mb, [P(u0, 0, 0.05), P(u0 + w * 0.5, 0, 0.05), P(u0 + w * 0.5, h, 0.05), P(u0, h, 0.05)], MAT[shutters])
    if flowerbox:
        bw = w + 0.2
        def B(u, v, n):
            return P(u, v, n)
        pts = lambda n, v0, v1: [B(-bw / 2, v0, n), B(bw / 2, v0, n), B(bw / 2, v1, n), B(-bw / 2, v1, n)]
        plane(mb, pts(0.32, -0.28, -0.05), MAT['wood_dark'])
        plane(mb, [B(-bw / 2, -0.05, 0.32), B(bw / 2, -0.05, 0.32), B(bw / 2, -0.05, 0.03), B(-bw / 2, -0.05, 0.03)], MAT['wood_dark'])
        plane(mb, [B(-bw / 2, -0.12, 0.3), B(bw / 2, -0.12, 0.3), B(bw / 2, 0.32, 0.3), B(-bw / 2, 0.32, 0.3)], MAT['flowers'])
        plane(mb, [B(-bw / 2, -0.12, 0.16), B(bw / 2, -0.12, 0.16), B(bw / 2, 0.36, 0.16), B(-bw / 2, 0.36, 0.16)], MAT['flowers'])


# ================================================================== buildings
def chalet(name, seed, w, d, plaster='plaster', roof='shingle_wood', shutters='shutter_green', floors=2):
    r = np.random.default_rng(seed)
    mb = MeshBuilder()
    h1 = 2.7          # stone / plaster ground floor
    h2 = 2.6          # timber upper floor
    zs = 0.0
    # plinth stones
    box(mb, (0, 0, 0.25), (w + 0.3, d + 0.3, 0.9), MAT['stone'], 1.4)
    box(mb, (0, 0, 0.4 + h1 / 2), (w, d, h1), MAT[plaster], 2.2, faces=('+x', '-x', '+y', '-y'))
    z_up = 0.4 + h1
    if floors >= 2:
        box(mb, (0, 0, z_up + h2 / 2), (w + 0.12, d + 0.12, h2), MAT['wood'], 2.0, faces=('+x', '-x', '+y', '-y'))
        z_roof = z_up + h2
    else:
        z_roof = z_up
    # floor beam ring
    box(mb, (0, 0, z_up), (w + 0.3, d + 0.3, 0.22), MAT['wood_dark'], 1.0, faces=('+x', '-x', '+y', '-y', '-z'))
    pitch = math.radians(r.uniform(24, 30))
    gable_wall(mb, w + 0.12, d / 2 + 0.06, z_roof, pitch, MAT['wood'], 1)
    gable_wall(mb, w + 0.12, -d / 2 - 0.06, z_roof, pitch, MAT['wood'], -1)
    top = gable_roof(mb, w + 0.12, d + 0.12, z_roof, pitch, 1.0, 0.18, MAT[roof], MAT['wood_dark'])
    # windows: ground floor on the +x side (road side), +y gable, upper floor both
    nwin = max(2, int(d / 2.4))
    for i in range(nwin):
        yy = -d / 2 + (i + 0.5) * d / nwin
        if abs(yy) < 0.7 and i == nwin // 2:
            continue
        window(mb, w / 2, yy, 1.25, 0.95, 1.2, 'x', 1, lit=r.random() < 0.25, shutters=shutters)
        window(mb, -w / 2, yy, 1.25, 0.95, 1.2, 'x', -1, shutters=shutters, flowerbox=False)
        if floors >= 2:
            window(mb, w / 2 + 0.06, yy, z_up + 0.75, 0.9, 1.1, 'x', 1, lit=r.random() < 0.2, shutters=shutters)
    for i in (-1, 1):
        window(mb, i * w * 0.22, d / 2, 1.25, 0.9, 1.15, 'y', 1, shutters=shutters)
        if floors >= 2:
            window(mb, i * w * 0.2, d / 2 + 0.06, z_up + 0.75, 0.85, 1.05, 'y', 1, shutters=shutters)
    # door on the road side with a small porch roof
    plane(mb, [(w / 2 + 0.01, 0.55, 0.4), (w / 2 + 0.01, -0.55, 0.4), (w / 2 + 0.01, -0.55, 2.5), (w / 2 + 0.01, 0.55, 2.5)], MAT['door'])
    box(mb, (w / 2 + 0.55, 0, 2.75), (1.2, 1.8, 0.1), MAT['wood_dark'], 1.0)
    for yy in (-0.8, 0.8):
        box(mb, (w / 2 + 1.05, yy, 1.55), (0.12, 0.12, 2.3), MAT['wood_dark'], 1.0)
    box(mb, (w / 2 + 0.5, 0, 0.42), (1.0, 1.6, 0.16), MAT['stone'], 1.0)
    # balcony along the road side of the upper floor
    if floors >= 2:
        bz = z_up + 0.05
        box(mb, (w / 2 + 0.75, 0, bz), (1.5, d * 0.8, 0.16), MAT['wood_dark'], 1.0)
        rh = 1.0
        L = d * 0.8
        plane(mb, [(w / 2 + 1.48, L / 2, bz + 0.08), (w / 2 + 1.48, -L / 2, bz + 0.08), (w / 2 + 1.48, -L / 2, bz + rh), (w / 2 + 1.48, L / 2, bz + rh)], MAT['railing'], ((0, 0), (L / 1.3, 0), (L / 1.3, 1), (0, 1)))
        for yy in (L / 2, -L / 2):
            plane(mb, [(w / 2 + 0.06, yy, bz + 0.08), (w / 2 + 1.48, yy, bz + 0.08), (w / 2 + 1.48, yy, bz + rh), (w / 2 + 0.06, yy, bz + rh)], MAT['railing'], ((0, 0), (1.1, 0), (1.1, 1), (0, 1)))
        box(mb, (w / 2 + 1.48, 0, bz + rh + 0.04), (0.12, L + 0.1, 0.08), MAT['wood_dark'], 1.0)
        for yy in np.linspace(-L / 2, L / 2, 4):
            box(mb, (w / 2 + 1.4, yy, bz - 0.9), (0.14, 0.14, 1.8), MAT['wood_dark'], 1.0)
        # brackets under the balcony
    # chimney
    cx, cy = -w * 0.18, -d * 0.22
    ch_z = z_roof + (w / 2 - abs(cx)) * math.tan(pitch)
    box(mb, (cx, cy, ch_z + 0.55), (0.65, 0.65, 2.2), MAT['stone'], 1.0)
    box(mb, (cx, cy, ch_z + 1.7), (0.85, 0.85, 0.1), MAT['concrete'], 1.0)
    # wood pile against the back wall
    if r.random() < 0.7:
        box(mb, (-w / 2 - 0.35, d * 0.15, 0.7), (0.6, 2.4, 1.4), MAT['wood_h'], 0.6)
        box(mb, (-w / 2 - 0.42, d * 0.15, 1.5), (0.8, 2.6, 0.08), MAT['metal_roof'], 1.0)
    # bench by the door
    box(mb, (w / 2 + 0.3, d * 0.3, 0.85), (0.4, 1.4, 0.08), MAT['wood'], 1.0)
    for yy in (-0.6, 0.6):
        box(mb, (w / 2 + 0.3, d * 0.3 + yy, 0.62), (0.35, 0.08, 0.45), MAT['wood_dark'], 1.0)
    return mb.build(name, smooth=False)


def barn(name, seed):
    r = np.random.default_rng(seed)
    mb = MeshBuilder()
    w, d = 8.5, 13
    box(mb, (0, 0, 0.6), (w + 0.2, d + 0.2, 1.4), MAT['stone'], 1.4)
    box(mb, (0, 0, 1.3 + 2.2), (w, d, 4.4), MAT['wood_dark'], 2.4, faces=('+x', '-x', '+y', '-y'))
    pitch = math.radians(32)
    gable_wall(mb, w, d / 2, 5.5, pitch, MAT['wood_dark'], 1)
    gable_wall(mb, w, -d / 2, 5.5, pitch, MAT['wood_dark'], -1)
    gable_roof(mb, w, d, 5.5, pitch, 0.8, 0.2, MAT['shingle_wood'], MAT['wood_dark'])
    # big doors on the road side
    plane(mb, [(w / 2 + 0.02, 1.8, 1.3), (w / 2 + 0.02, -1.8, 1.3), (w / 2 + 0.02, -1.8, 4.6), (w / 2 + 0.02, 1.8, 4.6)], MAT['wood_h'], ((0, 0), (2.4, 0), (2.4, 2), (0, 2)))
    for yy in (-1.8, 0, 1.8):
        box(mb, (w / 2 + 0.06, yy, 2.95), (0.1, 0.16, 3.3), MAT['wood'], 1.0)
    box(mb, (w / 2 + 0.06, 0, 2.95), (0.08, 3.6, 0.16), MAT['wood'], 1.0)
    # ramp
    box(mb, (w / 2 + 1.4, 0, 0.6), (2.8, 3.6, 0.12), MAT['wood_grey'], 1.2, rot=0)
    # hay loft hatch
    plane(mb, [(w / 2 + 0.02, 0.8, 5.0), (w / 2 + 0.02, -0.8, 5.0), (w / 2 + 0.02, -0.8, 6.2), (w / 2 + 0.02, 0.8, 6.2)], MAT['wood'])
    window(mb, w / 2, -4.5, 2.2, 0.8, 0.8, 'x', 1, shutters=None, flowerbox=False)
    window(mb, w / 2, 4.5, 2.2, 0.8, 0.8, 'x', 1, shutters=None, flowerbox=False)
    return mb.build(name, smooth=False)


def chapel(name):
    mb = MeshBuilder()
    w, d = 6, 10
    box(mb, (0, 0, 0.3), (w + 0.3, d + 0.3, 0.6), MAT['stone'], 1.2)
    box(mb, (0, 0, 0.6 + 2.6), (w, d, 5.2), MAT['plaster'], 2.0, faces=('+x', '-x', '+y', '-y'))
    pitch = math.radians(40)
    gable_wall(mb, w, d / 2, 5.8, pitch, MAT['plaster'], 1)
    gable_wall(mb, w, -d / 2, 5.8, pitch, MAT['plaster'], -1)
    gable_roof(mb, w, d, 5.8, pitch, 0.5, 0.18, MAT['shingle_slate'], MAT['wood_dark'])
    # tower at the back
    tz = 0.6
    box(mb, (0, -d / 2 - 1.3, tz + 5), (2.6, 2.6, 10), MAT['plaster'], 2.0)
    box(mb, (0, -d / 2 - 1.3, tz + 10.05), (2.8, 2.8, 0.1), MAT['wood_dark'], 1.0)
    # belfry openings
    for (ax, s) in (('x', 1), ('x', -1), ('y', 1), ('y', -1)):
        if ax == 'x':
            plane(mb, [(s * 1.31, -d / 2 - 1.3 + 0.5 * s, 8.2), (s * 1.31, -d / 2 - 1.3 - 0.5 * s, 8.2), (s * 1.31, -d / 2 - 1.3 - 0.5 * s, 9.6), (s * 1.31, -d / 2 - 1.3 + 0.5 * s, 9.6)], MAT['dark'])
        else:
            yy = -d / 2 - 1.3 + s * 1.31
            plane(mb, [(-0.5 * s, yy, 8.2), (0.5 * s, yy, 8.2), (0.5 * s, yy, 9.6), (-0.5 * s, yy, 9.6)], MAT['dark'])
    # spire (4-sided pyramid as triangles)
    apex = (0, -d / 2 - 1.3, tz + 15)
    base = [(-1.4, -d / 2 - 2.7), (1.4, -d / 2 - 2.7), (1.4, -d / 2 + 0.1), (-1.4, -d / 2 + 0.1)]
    for i in range(4):
        a, b = base[i], base[(i + 1) % 4]
        mb.quad((a[0], a[1], tz + 10.1), (b[0], b[1], tz + 10.1), apex, apex, [(0, 0), (1.5, 0), (0.75, 3), (0.75, 3)], MAT['shingle_slate'])
    # arched-ish windows (tall)
    for yy in (-2.5, 0, 2.5):
        window(mb, w / 2, yy, 1.8, 0.8, 2.0, 'x', 1, shutters=None, flowerbox=False)
        window(mb, -w / 2, yy, 1.8, 0.8, 2.0, 'x', -1, shutters=None, flowerbox=False)
    plane(mb, [(-0.7, d / 2 + 0.01, 0.6), (0.7, d / 2 + 0.01, 0.6), (0.7, d / 2 + 0.01, 3.2), (-0.7, d / 2 + 0.01, 3.2)], MAT['door'])
    return mb.build(name, smooth=False)


def shack(name, seed):
    r = np.random.default_rng(seed)
    mb = MeshBuilder()
    w, d = 3.6, 4.8
    box(mb, (0, 0, 1.25), (w, d, 2.5), MAT['wood_grey'], 1.8, faces=('+x', '-x', '+y', '-y'))
    # lean-to metal roof, slightly sagging
    plane(mb, [(-w / 2 - 0.4, -d / 2 - 0.4, 2.45), (w / 2 + 0.4, -d / 2 - 0.4, 2.95), (w / 2 + 0.4, d / 2 + 0.4, 2.95), (-w / 2 - 0.4, d / 2 + 0.4, 2.45)], MAT['metal_roof'], ((0, 0), (2, 0), (2, 2.5), (0, 2.5)))
    plane(mb, [(-w / 2 - 0.4, d / 2 + 0.4, 2.41), (w / 2 + 0.4, d / 2 + 0.4, 2.91), (w / 2 + 0.4, -d / 2 - 0.4, 2.91), (-w / 2 - 0.4, -d / 2 - 0.4, 2.41)], MAT['metal_roof'])
    plane(mb, [(w / 2 + 0.01, 0.5, 0), (w / 2 + 0.01, -0.5, 0), (w / 2 + 0.01, -0.5, 2.0), (w / 2 + 0.01, 0.5, 2.0)], MAT['dark'])
    window(mb, w / 2, 1.5, 1.1, 0.7, 0.6, 'x', 1, flowerbox=False)
    # junk outside: barrels and planks
    for k in range(3):
        box(mb, (w / 2 + 0.8 + r.uniform(0, 1), r.uniform(-2, 2), 0.45), (0.55, 0.55, 0.9), MAT['painted_orange'] if k % 2 else MAT['metal'], 0.8)
    for k in range(4):
        box(mb, (-w / 2 - 0.4, r.uniform(-2, 2), 0.9), (0.06, 0.25, 1.9), MAT['wood_grey'], 0.8, rot=r.uniform(-0.3, 0.3))
    return mb.build(name, smooth=False)


def gas_station(name):
    mb = MeshBuilder()
    # shop building
    box(mb, (-5, 0, 1.6), (5.5, 7.5, 3.2), MAT['plaster_ochre'], 2.2, faces=('+x', '-x', '+y', '-y'))
    box(mb, (-5, 0, 3.3), (6.0, 8.0, 0.25), MAT['concrete'], 1.5)
    plane(mb, [(-2.24, 2.8, 0.5), (-2.24, -1.5, 0.5), (-2.24, -1.5, 2.6), (-2.24, 2.8, 2.6)], MAT['window_dark'], ((0, 0), (3, 0), (3, 1), (0, 1)))
    plane(mb, [(-2.24, -2.0, 0), (-2.24, -3.2, 0), (-2.24, -3.2, 2.3), (-2.24, -2.0, 2.3)], MAT['door'])
    # forecourt slab
    box(mb, (2, 0, 0.06), (11, 11, 0.12), MAT['concrete'], 2.0, faces=('+z',))
    # canopy on four columns, one corner sagging
    for (x, y) in ((0, -3.5), (0, 3.5), (5, -3.5), (5, 3.5)):
        box(mb, (x, y, 2.2), (0.3, 0.3, 4.4 if x == 0 else 3.9), MAT['painted_white'], 1.0)
    box(mb, (2.5, 0, 4.4), (6.6, 8.6, 0.45), MAT['painted_white'], 2.0)
    box(mb, (2.5, 0, 4.15), (6.65, 8.65, 0.12), MAT['painted_orange'], 2.0, faces=('+x', '-x', '+y', '-y'))
    # pumps
    for y in (-1.5, 1.5):
        box(mb, (2.5, y, 0.14 + 0.15), (1.6, 0.8, 0.3), MAT['concrete'], 1.0)
        box(mb, (2.5, y, 0.3 + 0.8), (0.55, 0.9, 1.6), MAT['painted_orange'], 1.0)
        box(mb, (2.5, y, 1.75), (0.6, 0.95, 0.25), MAT['painted_white'], 1.0)
        plane(mb, [(2.79, y + 0.3, 1.1), (2.79, y - 0.3, 1.1), (2.79, y - 0.3, 1.5), (2.79, y + 0.3, 1.5)], MAT['dark'])
    # tall sign
    box(mb, (6.5, 4.8, 3), (0.25, 0.25, 6), MAT['metal'], 1.0)
    box(mb, (6.5, 4.8, 6.4), (0.3, 2.2, 1.6), MAT['painted_orange'], 1.0)
    return mb.build(name, smooth=False)


def bus_stop(name):
    mb = MeshBuilder()
    box(mb, (0, 0, 0.08), (1.8, 3.4, 0.16), MAT['concrete'], 1.0)
    box(mb, (-0.8, 0, 1.25), (0.12, 3.2, 2.2), MAT['wood'], 1.0)
    for y in (-1.55, 1.55):
        box(mb, (0, y, 1.25), (1.6, 0.1, 2.2), MAT['wood'], 1.0)
    plane(mb, [(0.9, -1.8, 2.4), (0.9, 1.8, 2.4), (-1.0, 1.8, 2.6), (-1.0, -1.8, 2.6)], MAT['metal_roof'])
    plane(mb, [(-1.0, -1.8, 2.56), (-1.0, 1.8, 2.56), (0.9, 1.8, 2.36), (0.9, -1.8, 2.36)], MAT['metal_roof'])
    box(mb, (-0.5, 0, 0.55), (0.4, 2.6, 0.08), MAT['wood_dark'], 1.0)
    return mb.build(name, smooth=False)


def utility_pole(name):
    mb = MeshBuilder()
    from common import tube
    tube(mb, [(0, 0, 0), (0, 0, 8.2)], [0.16, 0.11], 8, MAT['wood_dark'], (1, 0.6))
    box(mb, (0, 0, 7.6), (0.14, 2.0, 0.14), MAT['wood_dark'], 1.0)
    for y in (-0.8, 0, 0.8):
        tube(mb, [(0, y, 7.67), (0, y, 7.9)], [0.04, 0.035], 6, MAT['white'], (1, 1))
    tube(mb, [(0, 0.6, 6.6), (0, 0, 7.4)], [0.03, 0.03], 4, MAT['wood_dark'], (1, 1))
    return mb.build(name)


def fence(name):
    mb = MeshBuilder()
    for x in (-1.25, 1.25):
        box(mb, (x, 0, 0.6), (0.12, 0.12, 1.2), MAT['wood_grey'], 1.0)
    for z in (0.45, 0.95):
        box(mb, (0, 0, z), (2.6, 0.05, 0.14), MAT['wood_grey'], 1.0, uvrot=True)
    for x in np.linspace(-1.1, 1.1, 2):
        pass
    return mb.build(name, smooth=False)


def log_pile(name):
    mb = MeshBuilder()
    from common import tube
    for row in range(3):
        for k in range(4 - row):
            y = (k - (3 - row) / 2) * 0.48
            z = 0.24 + row * 0.42
            tube(mb, [(-2.4, y, z), (2.4, y, z)], [0.24, 0.23], 9, MAT['wood_dark'], (1, 0.5))
    return mb.build(name)


objs = [
    chalet('chalet0', 1, 7.5, 9.5),
    chalet('chalet1', 2, 6.5, 8.0, 'plaster_ochre', 'shingle_slate', 'shutter_red'),
    chalet('chalet2', 3, 8.5, 11, 'plaster', 'shingle_slate', 'shutter_green'),
    chalet('chalet3', 4, 6.0, 7.0, 'plaster', 'metal_roof', None, floors=1),
    barn('barn0', 5), chapel('chapel0'), shack('shack0', 6), gas_station('gasstation0'),
    bus_stop('busstop0'), utility_pole('pole0'), fence('fence0'), log_pile('logpile0'),
]
export_glb(os.path.join(OUT, 'buildings.glb'), objs)
for o in objs:
    print(f'  {o.name:14s} {sum(len(p.vertices) - 2 for p in o.data.polygons):6d} tris')

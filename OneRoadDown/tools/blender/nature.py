"""Trees (pine, spruce, birch, oak, dead), bushes, grass, ferns and rocks for ONE ROAD DOWN.

    python tools/blender/nature.py OneRoadDown/assets/models

Produces nature.glb. Each asset is a separate named object at the origin
(<kind><variant>_lod0 / _lod1). Foliage uses alpha-clipped cards with custom
"canopy" normals so the crowns shade like volumes instead of flat planes.
"""
import math
import os
import sys
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import (reset_scene, value_noise, make_image, stroke, ellipse, material,
                    MeshBuilder, tube, export_glb)

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1931)


# ================================================================== textures
def tex_needles(name, kind):
    S = 512
    c = np.zeros((S, S, 4), np.float32)
    r = np.random.default_rng(hash(name) % 2 ** 32)
    dark = np.array([0.13, 0.24, 0.13]) if kind == 'spruce' else np.array([0.2, 0.3, 0.13])
    light = np.array([0.3, 0.44, 0.22]) if kind == 'spruce' else np.array([0.42, 0.52, 0.24])
    if kind == 'cypress':
        dark, light, kind = np.array([0.09, 0.19, 0.1]), np.array([0.22, 0.34, 0.16]), 'spruce'
    stem = np.array([0.24, 0.16, 0.1])
    # side twigs first, then the main stem, then needles over everything
    twigs = []
    for y in np.linspace(480, 30, 13 if kind == 'spruce' else 9):
        for side in (-1, 1):
            ang = math.radians(r.uniform(40, 62))
            ln = (S * 0.42) * (0.55 + 0.45 * (y / S)) * r.uniform(0.8, 1.05)
            x1 = S / 2 + side * math.sin(ang) * ln
            y1 = y - math.cos(ang) * ln
            twigs.append((S / 2, y, x1, y1))
            stroke(c, S / 2, y, x1, y1, 2.2, stem)
    stroke(c, S / 2, S - 4, S / 2, 8, 4.0, stem)
    segs = twigs + [(S / 2, S - 4, S / 2, 8)]
    for (x0, y0, x1, y1) in segs:
        L = math.hypot(x1 - x0, y1 - y0)
        n = int(L / (1.4 if kind == 'spruce' else 1.7))
        dx, dy = (x1 - x0) / L, (y1 - y0) / L
        for i in range(n):
            t = i / max(1, n - 1)
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for side in (-1, 1):
                a = math.radians(r.uniform(25, 70)) * side
                ca, sa = math.cos(a), math.sin(a)
                nx, ny = dx * ca - dy * sa, dx * sa + dy * ca
                ln = (r.uniform(18, 30) if kind == 'spruce' else r.uniform(30, 50)) * (1 - 0.3 * t)
                col = dark + (light - dark) * r.uniform(0.0, 1.0) * (0.6 + 0.4 * t)
                stroke(c, px, py, px + nx * ln, py + ny * ln, 2.6 if kind == 'spruce' else 2.5, col)
    return make_image(name, c)


def tex_leaves(name, base, var, twig=(0.3, 0.24, 0.17), count=420):
    S = 512
    c = np.zeros((S, S, 4), np.float32)
    r = np.random.default_rng(hash(name) % 2 ** 32)
    cx, cy = S / 2, S / 2
    # twigs radiating from the bottom centre
    tips = []
    for k in range(7):
        a = math.radians(-90 + r.uniform(-70, 70))
        ln = r.uniform(170, 240)
        x1, y1 = cx + math.cos(a) * ln, S - 30 + math.sin(a) * ln
        stroke(c, cx, S - 30, x1, y1, 3, twig)
        tips.append((cx, S - 30, x1, y1))
    for i in range(count):
        x0, y0, x1, y1 = tips[i % len(tips)]
        t = r.uniform(0.25, 1.05)
        px = x0 + (x1 - x0) * t + r.normal(0, 22)
        py = y0 + (y1 - y0) * t + r.normal(0, 22)
        d = math.hypot(px - cx, py - cy)
        if d > S * 0.46:
            continue
        col = np.array(base) + (np.array(var) - np.array(base)) * r.uniform(0, 1)
        col = col * (0.75 + 0.35 * (1 - d / (S * 0.46)))
        ellipse(c, px, py, r.uniform(13, 21), r.uniform(7, 11), r.uniform(0, math.pi), col)
    return make_image(name, c)


def tex_blossom(name, base, var, twig=(0.22, 0.15, 0.13), count=260):
    S = 512
    c = np.zeros((S, S, 4), np.float32)
    r = np.random.default_rng(hash(name) % 2 ** 32)
    cx = S / 2
    tips = []
    for k in range(7):
        a = math.radians(-90 + r.uniform(-75, 75))
        ln = r.uniform(170, 240)
        x1, y1 = cx + math.cos(a) * ln, S - 30 + math.sin(a) * ln
        stroke(c, cx, S - 30, x1, y1, 3.2, twig)
        tips.append((cx, S - 30, x1, y1))
    for i in range(count):
        x0, y0, x1, y1 = tips[i % len(tips)]
        t = r.uniform(0.2, 1.05)
        bx = x0 + (x1 - x0) * t + r.normal(0, 26)
        by = y0 + (y1 - y0) * t + r.normal(0, 26)
        if math.hypot(bx - cx, by - S / 2) > S * 0.46:
            continue
        # one bloom: five petals around a darker centre
        col = np.array(base) + (np.array(var) - np.array(base)) * r.uniform(0, 1)
        rot = r.uniform(0, 2 * math.pi)
        rad = r.uniform(7, 11)
        for k in range(5):
            a = rot + k * 2 * math.pi / 5
            ellipse(c, bx + math.cos(a) * rad * 0.8, by + math.sin(a) * rad * 0.8, rad * 0.75, rad * 0.5, a, col * r.uniform(0.92, 1.05))
        ellipse(c, bx, by, rad * 0.32, rad * 0.32, 0, np.array(base) * 0.72)
    # a few young leaves
    for i in range(70):
        x0, y0, x1, y1 = tips[i % len(tips)]
        t = r.uniform(0.3, 1.0)
        ellipse(c, x0 + (x1 - x0) * t + r.normal(0, 20), y0 + (y1 - y0) * t + r.normal(0, 20), 10, 5, r.uniform(0, math.pi), np.array((0.42, 0.5, 0.2)))
    return make_image(name, c)


def tex_bark(name, base, groove, birch=False):
    S = 256
    r = np.random.default_rng(hash(name) % 2 ** 32)
    n = value_noise(S, 4, r, 5)
    v = value_noise(S, 16, r, 3)
    col = np.zeros((S, S, 4), np.float32)
    if birch:
        marks = (value_noise(S, 6, r, 3) > 0.62).astype(np.float32)
        bands = (np.sin(np.linspace(0, 40, S))[:, None] * 0.5 + 0.5) * (v > 0.55)
        k = np.clip(marks * 0.8 + bands * 0.6, 0, 1)
        for i in range(3):
            col[..., i] = base[i] * (0.85 + 0.15 * n) * (1 - k) + 0.07 * k
    else:
        # vertical plates: stretch noise along the trunk direction (image rows = height)
        plates = value_noise(S, 6, r, 4)
        plates = np.repeat(plates[::4, :], 4, axis=0)[:S]
        cracks = np.clip((np.abs(plates - 0.5) < 0.06) * 1.0 + (v > 0.7) * 0.4, 0, 1)
        for i in range(3):
            col[..., i] = base[i] * (0.75 + 0.45 * n) * (1 - cracks * 0.7) + groove[i] * cracks * 0.7
    col[..., 3] = 1
    return make_image(name, col)


def tex_grass(name, flowers=False):
    S = 256
    c = np.zeros((S, S, 4), np.float32)
    r = np.random.default_rng(hash(name) % 2 ** 32)
    for i in range(90):
        x = r.uniform(10, S - 10)
        h = r.uniform(0.45, 0.98) * S
        lean = r.normal(0, 26)
        col = np.array([0.34, 0.46, 0.16]) * r.uniform(0.75, 1.2) + np.array([0.1, 0.06, 0.0]) * r.uniform(0, 1)
        stroke(c, x, S - 1, x + lean, S - h, 4.2, col)
    if flowers:
        for i in range(10):
            x, y = r.uniform(30, S - 30), r.uniform(S * 0.1, S * 0.45)
            fc = [(0.92, 0.88, 0.8), (0.85, 0.72, 0.2), (0.62, 0.45, 0.78)][i % 3]
            ellipse(c, x, y, 6, 6, 0, np.array(fc))
    return make_image(name, c)


def tex_fern(name):
    S = 256
    c = np.zeros((S, S, 4), np.float32)
    r = np.random.default_rng(11)
    stroke(c, S / 2, S - 2, S / 2, 6, 2.4, (0.2, 0.26, 0.1))
    for y in np.arange(S - 14, 12, -9):
        t = 1 - y / S
        ln = (S * 0.42) * math.sin(min(1, (1 - t) * 1.25) * math.pi * 0.95) + 6
        for side in (-1, 1):
            col = np.array([0.3, 0.45, 0.16]) * r.uniform(0.8, 1.2)
            stroke(c, S / 2, y, S / 2 + side * ln, y - ln * 0.35, 4.4, col)
    return make_image(name, c)


def tex_rock(name, tint):
    S = 512
    r = np.random.default_rng(hash(name) % 2 ** 32)
    a = value_noise(S, 4, r, 6, 0.55)
    b = value_noise(S, 24, r, 3)
    lich = value_noise(S, 8, r, 4)
    col = np.zeros((S, S, 4), np.float32)
    ridge = 1 - np.abs(b - 0.5) * 2
    v = 0.55 + (a - 0.5) * 0.7 - ridge ** 6 * 0.35
    for i in range(3):
        col[..., i] = tint[i] * v
    lm = np.clip((lich - 0.62) * 6, 0, 1)
    col[..., 0] = col[..., 0] * (1 - lm) + 0.46 * lm
    col[..., 1] = col[..., 1] * (1 - lm) + 0.5 * lm
    col[..., 2] = col[..., 2] * (1 - lm) + 0.32 * lm
    col[..., 3] = 1
    return make_image(name, col)


T = {}
T['needles_pine'] = tex_needles('needles_pine', 'pine')
T['needles_spruce'] = tex_needles('needles_spruce', 'spruce')
T['leaves_oak'] = tex_leaves('leaves_oak', (0.2, 0.33, 0.1), (0.42, 0.55, 0.2))
T['leaves_autumn'] = tex_leaves('leaves_autumn', (0.62, 0.26, 0.07), (0.9, 0.62, 0.18))
T['leaves_birch'] = tex_leaves('leaves_birch', (0.33, 0.47, 0.15), (0.6, 0.68, 0.26), count=460)
T['leaves_dry'] = tex_leaves('leaves_dry', (0.48, 0.44, 0.2), (0.66, 0.6, 0.32))
T['leaves_cherry'] = tex_blossom('leaves_cherry', (0.96, 0.66, 0.76), (1.0, 0.86, 0.9))
T['leaves_maple'] = tex_leaves('leaves_maple', (0.62, 0.07, 0.04), (0.95, 0.36, 0.07), count=470)
T['needles_cypress'] = tex_needles('needles_cypress', 'cypress')
T['bark_cherry'] = tex_bark('bark_cherry', (0.3, 0.2, 0.18), (0.07, 0.05, 0.05))
T['bark_pine'] = tex_bark('bark_pine', (0.33, 0.25, 0.19), (0.09, 0.07, 0.05))
T['bark_oak'] = tex_bark('bark_oak', (0.36, 0.32, 0.27), (0.08, 0.07, 0.06))
T['bark_birch'] = tex_bark('bark_birch', (0.86, 0.85, 0.8), (0, 0, 0), birch=True)
T['grass'] = tex_grass('grass')
T['grass_flowers'] = tex_grass('grass_flowers', True)
T['fern'] = tex_fern('fern')
T['rock'] = tex_rock('rock', (0.62, 0.6, 0.56))

M = {
    'needles_pine': material('needles_pine', T['needles_pine'], rough=0.85, alpha_clip=True, double=True),
    'needles_spruce': material('needles_spruce', T['needles_spruce'], rough=0.85, alpha_clip=True, double=True),
    'leaves_oak': material('leaves_oak', T['leaves_oak'], rough=0.8, alpha_clip=True, double=True),
    'leaves_autumn': material('leaves_autumn', T['leaves_autumn'], rough=0.8, alpha_clip=True, double=True),
    'leaves_birch': material('leaves_birch', T['leaves_birch'], rough=0.8, alpha_clip=True, double=True),
    'leaves_dry': material('leaves_dry', T['leaves_dry'], rough=0.85, alpha_clip=True, double=True),
    'leaves_cherry': material('leaves_cherry', T['leaves_cherry'], rough=0.75, alpha_clip=True, double=True),
    'leaves_maple': material('leaves_maple', T['leaves_maple'], rough=0.8, alpha_clip=True, double=True),
    'needles_cypress': material('needles_cypress', T['needles_cypress'], rough=0.85, alpha_clip=True, double=True),
    'bark_cherry': material('bark_cherry', T['bark_cherry'], rough=0.9),
    'bark_pine': material('bark_pine', T['bark_pine'], rough=0.95),
    'bark_oak': material('bark_oak', T['bark_oak'], rough=0.95),
    'bark_birch': material('bark_birch', T['bark_birch'], rough=0.8),
    'grass': material('grass_card', T['grass'], rough=0.9, alpha_clip=True, double=True),
    'grass_flowers': material('grass_flowers_card', T['grass_flowers'], rough=0.9, alpha_clip=True, double=True),
    'fern': material('fern_card', T['fern'], rough=0.9, alpha_clip=True, double=True),
    'rock': material('rock', T['rock'], rough=0.92),
}


# ================================================================== helpers
def norm(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) + 1e-9)


def card(mb, a, b, wvec, mat, v0=0.0, v1=1.0, centre=None, up_bias=0.35):
    """Quad from point a to b with half-width vector wvec; canopy normals from centre."""
    a, b, wvec = np.asarray(a, float), np.asarray(b, float), np.asarray(wvec, float)
    pts = [a - wvec, a + wvec, b + wvec, b - wvec]
    uv = [(0, v0), (1, v0), (1, v1), (0, v1)]
    if centre is not None:
        ns = [tuple(norm(norm(p - centre) + np.array([0, 0, up_bias]))) for p in pts]
    else:
        ns = None
    mb.quad(*pts, uv, mat, ns)


# ================================================================== conifers
def conifer(kind, seed, lod):
    r = np.random.default_rng(seed)
    spruce = kind == 'spruce'
    H = r.uniform(13, 18) if spruce else r.uniform(11, 16)
    mb = MeshBuilder()
    bark = M['bark_pine']
    needles = M['needles_spruce' if spruce else 'needles_pine']
    r0 = r.uniform(0.24, 0.34)
    # trunk with root flare and slight lean
    lean = np.array([r.normal(0, 0.012), r.normal(0, 0.012), 0])
    pts, rad = [], []
    steps = 7 if lod == 0 else 5
    for i in range(steps + 1):
        t = i / steps
        z = H * t
        pts.append(np.array([0, 0, z]) + lean * z * z * 0.05)
        rad.append(r0 * (1 - t) ** 0.9 * (1 + 0.6 * max(0, 0.06 - t) / 0.06) + 0.02)
    tube(mb, pts, rad, 8 if lod == 0 else 5, bark, (1.0, 0.5), noise=0.06, rng=r)
    centre_z = H * (0.45 if spruce else 0.72)
    start = H * (0.12 if spruce else 0.45)
    step = (0.55 if spruce else 0.6) * (1 if lod == 0 else 2.2)
    whorl = 0
    for h in np.arange(start, H - 0.5, step):
        t = (h - start) / (H - start)
        nb = (r.integers(5, 7) if spruce else r.integers(5, 8)) if lod == 0 else r.integers(4, 6)
        L = (2.7 if spruce else 3.3) * (1 - t) ** 0.85 + 0.45
        if not spruce and t < 0.15:
            L *= 0.8
        base_a = r.uniform(0, 2 * math.pi)
        for k in range(nb):
            az = base_a + 2 * math.pi * k / nb + r.normal(0, 0.25)
            el = (-0.42 + t * 0.75) if spruce else (-0.05 + t * 0.55)
            el += r.normal(0, 0.08)
            d = norm([math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)])
            root = pts[0] + np.array([0, 0, h]) + lean * h * h * 0.05
            droop = (0.28 if spruce else 0.12) * L
            p1 = root + d * L * 0.5 - np.array([0, 0, droop * 0.25])
            p2 = root + d * L - np.array([0, 0, droop])
            if lod == 0 and k % 2 == 0 and t < 0.55:
                # mostly hidden by the needle cards: keep the branch cheap
                tube(mb, [root, p1, p2], [0.045 * L / 2 + 0.015, 0.025 * L / 2 + 0.01, 0.008], 3, bark, (0.5, 0.5))
            # needle cards along the branch: one flat-ish, one tilted
            side = norm(np.cross(d, [0, 0, 1]))
            W = ((0.38 if spruce else 0.5) * L + 0.28) * 1.15 * (1.55 if lod == 1 else 1)
            segs = [(root, p1, 0.0, 0.5), (p1, p2, 0.5, 1.0)] if lod == 0 else [(root, p2, 0.0, 1.0)]
            centre = np.array([0, 0, centre_z])
            for (a, b, v0, v1) in segs:
                ww = W * (1 - 0.35 * v0)
                up = norm(np.cross(side, b - a))
                tilt = math.radians(r.uniform(55, 75))
                w1 = side * ww * 0.5
                w2 = (side * math.cos(tilt) + up * math.sin(tilt)) * ww * 0.42
                card(mb, a, b, w1, needles, v0, v1, centre)
                card(mb, a, b, w2, needles, v0, v1, centre)
                # a near-vertical card so the branch still reads from road level (no see-through sticks)
                w3 = (side * math.cos(tilt + 0.9) + up * math.sin(tilt + 0.9)) * ww * 0.4
                card(mb, a, b, w3, needles, v0, v1, centre)
        whorl += 1
    # leader
    top = pts[-1]
    for k in range(2 if lod == 0 else 1):
        ang = k * math.pi / 2
        w = np.array([math.cos(ang), math.sin(ang), 0]) * 0.4
        card(mb, top - np.array([0, 0, 1.4]), top + np.array([0, 0, 0.5]), w, needles, 0.0, 1.0, np.array([0, 0, centre_z]))
    ob = mb.build(f'{kind}{seed % 10}_lod{lod}')
    return ob


def cypress(seed, lod):
    """Italian cypress: a tall dark spindle of short upturned sprays."""
    r = np.random.default_rng(seed)
    H = r.uniform(9, 13)
    mb = MeshBuilder()
    bark, needles = M['bark_pine'], M['needles_cypress']
    tube(mb, [np.array([0, 0, 0]), np.array([0, 0, H * 0.5]), np.array([0, 0, H])], [0.22, 0.14, 0.03], 6 if lod == 0 else 4, bark, (1, 0.4))
    R = r.uniform(0.95, 1.25)
    step = 0.42 if lod == 0 else 1.0
    centre = np.array([0, 0, H * 0.45])
    for h in np.arange(0.6, H - 0.2, step):
        t = h / H
        rad = R * math.sin(math.pi * min(1, t ** 0.85 + 0.04)) ** 0.8 + 0.12
        n = (6 if lod == 0 else 4)
        a0 = r.uniform(0, 2 * math.pi)
        for k in range(n):
            az = a0 + 2 * math.pi * k / n
            d = np.array([math.cos(az), math.sin(az), 0])
            a = np.array([0, 0, h]) + d * rad * 0.15
            b = np.array([0, 0, h + 1.5 * (1 if lod == 0 else 1.6)]) + d * rad
            w = norm(np.cross(d, [0, 0, 1])) * (0.55 + rad * 0.4)
            card(mb, a, b, w, needles, 0, 1, centre, up_bias=0.2)
    top = np.array([0, 0, H])
    card(mb, top - np.array([0, 0, 1.6]), top + np.array([0, 0, 0.4]), np.array([0.3, 0, 0]), needles, 0, 1, centre)
    card(mb, top - np.array([0, 0, 1.6]), top + np.array([0, 0, 0.4]), np.array([0, 0.3, 0]), needles, 0, 1, centre)
    return mb.build(f'cypress{seed % 10}_lod{lod}')


# ================================================================== broadleaf
def broadleaf(kind, seed, lod, leaves_key):
    r = np.random.default_rng(seed)
    birch = kind == 'birch'
    cherry = kind == 'cherry'
    mb = MeshBuilder()
    bark = M['bark_birch'] if birch else M['bark_cherry'] if cherry else M['bark_oak']
    leaves = M.get(leaves_key)
    H0 = r.uniform(4.5, 6.5) if birch else r.uniform(1.7, 2.3) if cherry else r.uniform(2.4, 3.4)
    r0 = r.uniform(0.14, 0.2) if birch else r.uniform(0.32, 0.45)
    sides = 7 if lod == 0 else 5
    trunk = [np.array([0, 0, 0]), np.array([r.normal(0, 0.1), r.normal(0, 0.1), H0 * 0.5]), np.array([r.normal(0, 0.2), r.normal(0, 0.2), H0])]
    tube(mb, trunk, [r0 * 1.25, r0, r0 * 0.8], sides, bark, (1, 0.4), noise=0.05, rng=r)
    tips = []
    limbs = r.integers(3, 5) if birch else r.integers(4, 6)
    for k in range(limbs):
        az = 2 * math.pi * k / limbs + r.normal(0, 0.3)
        el = math.radians(r.uniform(55, 72) if birch else r.uniform(18, 34) if cherry else r.uniform(25, 48))
        d = norm([math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)])
        L = r.uniform(3.5, 5.5) if birch else r.uniform(4.2, 5.6) if cherry else r.uniform(3.2, 4.6)
        a = trunk[-1]
        b = a + d * L * 0.55 + np.array([0, 0, 0.3])
        c = a + d * L + np.array([0, 0, 0.5 if birch else -0.1])
        tube(mb, [a, b, c], [r0 * 0.7, r0 * 0.42, r0 * 0.15], max(4, sides - 2), bark, (0.6, 0.4))
        for j in range(r.integers(2, 4)):
            az2 = az + r.normal(0, 0.8)
            el2 = el + r.normal(0.1, 0.3)
            d2 = norm([math.cos(az2) * math.cos(el2), math.sin(az2) * math.cos(el2), math.sin(el2)])
            s = b + (c - b) * r.uniform(0, 1)
            e = s + d2 * r.uniform(1.4, 2.4)
            if lod == 0:
                tube(mb, [s, e], [r0 * 0.18, 0.02], 4, bark, (0.4, 0.4))
            tips.append(e)
        tips.append(c)
    if not leaves_key.startswith('none'):
        centre = np.mean(np.array(tips), axis=0) - np.array([0, 0, 0.6])
        spread = np.max(np.linalg.norm(np.array(tips)[:, :2] - centre[:2], axis=1)) + 0.6
        for k in range((48 if cherry else 34) if lod == 0 else (16 if cherry else 12)):
            u, v = r.uniform(0, 2 * math.pi), r.uniform(-0.35, 1.0)
            p = centre + np.array([math.cos(u) * math.sqrt(1 - v * v) * spread, math.sin(u) * math.sqrt(1 - v * v) * spread, v * spread * (1.25 if birch else 0.5 if cherry else 0.8)]) * r.uniform(0.6, 1.0)
            size = (r.uniform(1.6, 2.4) if not birch else r.uniform(1.3, 1.9)) * (1.7 if lod == 1 else 1)
            out = norm(p - centre)
            oh = norm([out[0] + 1e-3, out[1], 0])
            for w in (norm(np.cross(oh, [0, 0, 1])), oh):
                card(mb, p - np.array([0, 0, size * 0.55]), p + np.array([0, 0, size * 0.45]), w * size * 0.5, leaves, 0, 1, centre, up_bias=0.5)
        n_per = 3 if lod == 0 else 1
        for tip in tips:
            for k in range(n_per):
                p = tip + r.normal(0, 0.55, 3) * np.array([1, 1, 0.6])
                size = r.uniform(1.5, 2.3) if not birch else r.uniform(1.2, 1.8)
                if lod == 1:
                    size *= 1.6
                out = norm(p - centre)
                oh = norm([out[0] + 1e-3, out[1], 0])
                for w in (norm(np.cross(oh, [0, 0, 1])), oh):
                    card(mb, p - np.array([0, 0, size * 0.55]), p + np.array([0, 0, size * 0.45]), w * size * 0.5, leaves, 0, 1, centre, up_bias=0.5)
    name = f'{kind}{seed % 10}' + ('' if leaves_key in ('leaves_oak', 'leaves_birch', 'leaves_cherry') else '_' + leaves_key.split('_')[-1])
    return mb.build(f'{name}_lod{lod}')


def bush(seed, leaves_key):
    r = np.random.default_rng(seed)
    mb = MeshBuilder()
    leaves = M.get(leaves_key)
    centre = np.array([0, 0, 0.2])
    for k in range(9):
        az = r.uniform(0, 2 * math.pi)
        p = np.array([math.cos(az) * r.uniform(0.2, 0.7), math.sin(az) * r.uniform(0.2, 0.7), r.uniform(0.3, 0.7)])
        size = r.uniform(0.9, 1.3)
        oh = norm([p[0] + 1e-3, p[1], 0])
        for w in (norm(np.cross(oh, [0, 0, 1])), oh):
            card(mb, p - np.array([0, 0, size * 0.5]), p + np.array([0, 0, size * 0.5]), w * size * 0.5, leaves, 0, 1, centre, up_bias=0.6)
    return mb.build(f'bush{seed % 10}_{leaves_key.split("_")[-1]}')


def grass_tuft(name, mat, h=0.55, w=0.75, n=3):
    mb = MeshBuilder()
    for k in range(n):
        a = math.pi * k / n
        d = np.array([math.cos(a), math.sin(a), 0]) * w * 0.5
        up = (0, 0, 1)
        mb.quad(-d, d, d + np.array([0, 0, h]), -d + np.array([0, 0, h]), [(0, 0), (1, 0), (1, 1), (0, 1)], mat, [up, up, (0, 0.3, 0.95), (0, 0.3, 0.95)])
    return mb.build(name)


def fern(name):
    mb = MeshBuilder()
    m = M['fern']
    for k in range(7):
        a = 2 * math.pi * k / 7
        d = np.array([math.cos(a), math.sin(a), 0])
        side = np.array([-d[1], d[0], 0]) * 0.32
        a0 = np.array([0, 0, 0.05])
        b0 = d * 0.95 + np.array([0, 0, 0.42])
        up = (0, 0, 1)
        mb.quad(a0 - side * 0.3, a0 + side * 0.3, b0 + side, b0 - side, [(0.3, 0), (0.7, 0), (1, 1), (0, 1)], m, [up, up, up, up])
    return mb.build(name)


# ================================================================== rocks
def rock(seed, stretch=(1, 1, 0.6), name=None, faces=700):
    r = np.random.default_rng(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1)
    ob = bpy.context.active_object
    ob.name = name or f'rock{seed % 10}'
    ob.scale = stretch
    for (ttype, size, strength) in (('VORONOI', 0.9, 0.45), ('CLOUDS', 0.4, 0.18), ('CLOUDS', 1.4, 0.3)):
        tex = bpy.data.textures.new(f'{ob.name}_{ttype}{size}', ttype)
        if ttype == 'VORONOI':
            tex.distance_metric = 'DISTANCE'
        else:
            tex.noise_scale = size
        mod = ob.modifiers.new('disp', 'DISPLACE')
        mod.texture = tex
        mod.strength = strength
        mod.texture_coords = 'OBJECT'
        tex_obj = bpy.data.objects.new(f'{ob.name}_c', None)
        bpy.context.scene.collection.objects.link(tex_obj)
        tex_obj.location = (r.uniform(-50, 50), r.uniform(-50, 50), r.uniform(-50, 50))
        mod.texture_coords_object = tex_obj
    dec = ob.modifiers.new('dec', 'DECIMATE')
    dec.ratio = faces / 20480 * 3.5
    bpy.ops.object.convert(target='MESH')
    # flatten the base so rocks sit in the ground
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    floor = min(zs) + (max(zs) - min(zs)) * 0.18
    for v in me.vertices:
        if v.co.z < floor:
            v.co.z = floor + (v.co.z - floor) * 0.15
        v.co.z -= floor
    bpy.ops.object.shade_flat()
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    me.materials.append(M['rock'])
    return ob


# ================================================================== build
objects = []
for i in range(3):
    for lod in (0, 1):
        objects.append(conifer('pine', 100 + i, lod))
        objects.append(conifer('spruce', 200 + i, lod))
for i in range(2):
    for lod in (0, 1):
        objects.append(broadleaf('oak', 300 + i, lod, 'leaves_oak'))
        objects.append(broadleaf('oak', 300 + i, lod, 'leaves_autumn'))
        objects.append(broadleaf('oak', 300 + i, lod, 'leaves_dry'))
        objects.append(broadleaf('birch', 400 + i, lod, 'leaves_birch'))
        objects.append(broadleaf('birch', 400 + i, lod, 'leaves_autumn'))
for i in range(3):
    for lod in (0, 1):
        objects.append(broadleaf('cherry', 800 + i, lod, 'leaves_cherry'))
for i in range(2):
    for lod in (0, 1):
        objects.append(broadleaf('maple', 820 + i, lod, 'leaves_maple'))
        objects.append(cypress(840 + i, lod))
for i in range(2):
    objects.append(broadleaf('dead', 500 + i, 0, 'none'))
for i in range(2):
    objects.append(bush(600 + i, 'leaves_oak'))
    objects.append(bush(610 + i, 'leaves_autumn'))
    objects.append(bush(620 + i, 'leaves_dry'))
objects.append(grass_tuft('grass0', M['grass']))
objects.append(grass_tuft('grass1', M['grass_flowers'], 0.5, 0.8))
objects.append(grass_tuft('grass2', M['grass'], 0.8, 0.6, 4))
objects.append(fern('fern0'))
for i in range(6):
    objects.append(rock(700 + i, (1 + (i % 3) * 0.3, 0.9 + (i % 2) * 0.3, 0.55 + (i % 4) * 0.12)))
objects.append(rock(790, (2.4, 1.0, 1.3), 'cliffrock0', 1100))
objects.append(rock(791, (1.6, 1.6, 2.2), 'cliffrock1', 1100))

# spread them out (export keeps local origins; the game resets positions)
export_glb(os.path.join(OUT, 'nature.glb'), objects)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects)
print('exported', len(objects), 'objects', tris, 'triangles')
for o in objects:
    print(f'  {o.name:24s} {sum(len(p.vertices) - 2 for p in o.data.polygons):6d} tris')

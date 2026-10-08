"""Tileable ground and road textures (albedo + normal maps) for ONE ROAD DOWN.

    python tools/blender/textures.py OneRoadDown/assets/textures

Writes JPEG albedo (<name>.jpg) and normal maps (<name>_n.jpg), 1024x1024.
"""
import math
import os
import sys
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import value_noise

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/textures'
os.makedirs(OUT, exist_ok=True)
S = 1024


def save(name, rgb, quality=88):
    img = bpy.data.images.new(name, S, S, alpha=False)
    rgba = np.ones((S, S, 4), np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(np.flipud(rgba).ravel())
    img.filepath_raw = os.path.join(OUT, name + '.jpg')
    img.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = quality
    img.save()


def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-gx, gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def blobs(rng, count, rmin, rmax, aspect=0.7):
    """Height field of rounded stones (tileable via wrap)."""
    h = np.zeros((S, S), np.float32)
    ids = np.zeros((S, S), np.float32)
    for k in range(count):
        cx, cy = rng.uniform(0, S), rng.uniform(0, S)
        rx = rng.uniform(rmin, rmax); ry = rx * rng.uniform(aspect, 1.0)
        a = rng.uniform(0, math.pi)
        R = int(rx + 2)
        ys = (np.arange(int(cy) - R, int(cy) + R)) % S
        xs = (np.arange(int(cx) - R, int(cx) + R)) % S
        yy, xx = np.meshgrid(np.arange(-R, R) + (int(cy) - cy), np.arange(-R, R) + (int(cx) - cx), indexing='ij')
        u = (xx * math.cos(a) + yy * math.sin(a)) / rx
        v = (-xx * math.sin(a) + yy * math.cos(a)) / ry
        d = u * u + v * v
        dome = np.sqrt(np.clip(1 - d, 0, 1))
        sub = h[np.ix_(ys, xs)]
        m = dome > sub
        sub = np.where(m, dome, sub)
        h[np.ix_(ys, xs)] = sub
        idsub = ids[np.ix_(ys, xs)]
        ids[np.ix_(ys, xs)] = np.where(m, rng.uniform(0.6, 1.2), idsub)
    return h, ids


def streaks(rng, count, length, width, angle_jitter=math.pi):
    """Height field of thin strokes (grass blades, pine needles, twigs)."""
    h = np.zeros((S, S), np.float32)
    for k in range(count):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        a = rng.uniform(-angle_jitter, angle_jitter) - math.pi / 2
        L = rng.uniform(length * 0.5, length)
        n = int(L)
        for t in range(n):
            px = int(x + math.cos(a) * t) % S
            py = int(y + math.sin(a) * t) % S
            val = 1 - t / (n + 1) * 0.5
            for wx in range(-width // 2, width // 2 + 1):
                h[py, (px + wx) % S] = max(h[py, (px + wx) % S], val)
    return h


rng = np.random.default_rng(77)

# ---------------------------------------------------------------- grass meadow
base = value_noise(S, 8, rng, 5)
blades = streaks(rng, 9000, 26, 1, 0.5)
clover = value_noise(S, 24, rng, 3)
dirt = np.clip((value_noise(S, 6, rng, 4) - 0.62) * 4, 0, 1)
h = blades * 0.7 + base * 0.3
col = np.zeros((S, S, 3), np.float32)
g1, g2 = np.array([0.24, 0.32, 0.12]), np.array([0.42, 0.5, 0.2])
t = np.clip(blades * 0.8 + base * 0.4 + clover * 0.2 - 0.2, 0, 1)[..., None]
col = g1 * (1 - t) + g2 * t
col = col * (1 - dirt[..., None] * 0.7) + np.array([0.36, 0.28, 0.18]) * dirt[..., None] * 0.7
save('grass', col)
save('grass_n', normal_from_height(h, 3.0))

# ---------------------------------------------------------------- forest floor
needles = streaks(rng, 14000, 18, 1)
twigs = streaks(rng, 260, 70, 2)
moss = np.clip((value_noise(S, 10, rng, 4) - 0.55) * 3, 0, 1)
soil = value_noise(S, 12, rng, 4)
h = needles * 0.5 + twigs * 0.8 + soil * 0.3
col = np.array([0.22, 0.15, 0.09]) * (0.7 + 0.5 * soil)[..., None]
col = col * (1 - needles[..., None] * 0.6) + np.array([0.48, 0.32, 0.18]) * needles[..., None] * 0.6
col = col * (1 - twigs[..., None] * 0.7) + np.array([0.3, 0.22, 0.15]) * twigs[..., None] * 0.7
col = col * (1 - moss[..., None] * 0.65) + np.array([0.24, 0.32, 0.12]) * moss[..., None] * 0.65
save('forest', col)
save('forest_n', normal_from_height(h, 2.5))

# ---------------------------------------------------------------- dirt
pebbles, pid = blobs(rng, 900, 3, 9)
cr = value_noise(S, 20, rng, 3)
cracks = np.clip(1 - np.abs(cr - 0.5) * 30, 0, 1)
soil = value_noise(S, 6, rng, 5)
h = soil * 0.5 + pebbles * 0.5 - cracks * 0.3
col = np.array([0.42, 0.33, 0.23]) * (0.75 + 0.4 * soil)[..., None]
col = col * (1 - cracks[..., None] * 0.5)
col = np.where(pebbles[..., None] > 0.05, np.array([0.55, 0.5, 0.44]) * pid[..., None] * (0.7 + 0.3 * pebbles[..., None]), col)
save('dirt', col)
save('dirt_n', normal_from_height(h, 4.0))

# ---------------------------------------------------------------- gravel
stones, sid = blobs(rng, 5200, 4, 11, 0.6)
fine = value_noise(S, 64, rng, 2)
h = stones * 0.8 + fine * 0.2
tone = np.stack([sid * 0.56, sid * 0.53, sid * 0.48], -1)
col = np.where(stones[..., None] > 0.02, tone * (0.6 + 0.45 * stones[..., None]), np.array([0.3, 0.27, 0.23]) * (0.8 + 0.3 * fine[..., None]))
save('gravel', col)
save('gravel_n', normal_from_height(h, 5.0))

# ---------------------------------------------------------------- rock (cliff faces)
strata = np.sin((np.arange(S)[:, None] / S) * math.pi * 2 * 9 + value_noise(S, 4, rng, 4) * 9) * 0.5 + 0.5
big = value_noise(S, 4, rng, 6, 0.55)
crack_n = value_noise(S, 10, rng, 4)
cracks = np.clip(1 - np.abs(crack_n - 0.5) * 22, 0, 1)
lichen = np.clip((value_noise(S, 16, rng, 3) - 0.66) * 5, 0, 1)
h = big * 0.6 + strata * 0.25 - cracks * 0.4
col = np.array([0.5, 0.48, 0.45]) * (0.6 + 0.55 * big + 0.12 * strata)[..., None]
col = col * (1 - cracks[..., None] * 0.6)
col = col * (1 - lichen[..., None] * 0.6) + np.array([0.52, 0.55, 0.36]) * lichen[..., None] * 0.6
save('rock', col)
save('rock_n', normal_from_height(h, 6.0))

# ---------------------------------------------------------------- snow
ripple = np.sin((np.arange(S)[None, :] / S) * math.pi * 2 * 6 + value_noise(S, 4, rng, 4) * 7) * 0.5 + 0.5
soft = value_noise(S, 6, rng, 5)
sparkle = (rng.random((S, S)) > 0.995).astype(np.float32)
h = ripple * 0.3 + soft * 0.7
col = np.array([0.86, 0.89, 0.93]) * (0.9 + 0.12 * soft)[..., None] - (1 - ripple[..., None]) * 0.04
col = col + sparkle[..., None] * 0.1
col[..., 2] += 0.02
save('snow', col)
save('snow_n', normal_from_height(h, 1.5))

# ---------------------------------------------------------------- sand (canyon)
dunes = value_noise(S, 6, rng, 5)
grains = rng.random((S, S)).astype(np.float32)
h = dunes * 0.8 + grains * 0.05
col = np.array([0.66, 0.5, 0.34]) * (0.8 + 0.3 * dunes)[..., None] + (grains[..., None] - 0.5) * 0.06
save('sand', col)
save('sand_n', normal_from_height(h, 2.0))
print('textures written to', OUT)

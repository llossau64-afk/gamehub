"""Shared helpers for Barbershop Simulator procedural asset generation."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BS = os.path.join(ROOT, "Assets", "BarberSimulator")
TEX = os.path.join(BS, "Art", "Textures")
SPR = os.path.join(BS, "UI", "Sprites")
FONTS = os.path.join(BS, "UI", "Fonts")
AUD = os.path.join(BS, "Audio")


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def c(r, g, b):
    return np.array([r, g, b], dtype=np.float32) / 255.0


def pnoise(h, w, sy, sx=None, seed=0):
    """Periodic (tileable) gaussian-filtered noise, normalised to std 1. sigma in pixels."""
    if sx is None:
        sx = sy
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((h, w)).astype(np.float32)
    F = np.fft.rfft2(white)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    F *= np.exp(-2 * np.pi ** 2 * ((sy * fy) ** 2 + (sx * fx) ** 2))
    n = np.fft.irfft2(F, s=(h, w)).astype(np.float32)
    n -= n.mean()
    n /= (n.std() + 1e-8)
    return n


def fbm(h, w, base, octaves=5, seed=0, aniso=1.0, gain=0.55):
    """Sum of periodic noise octaves; aniso>1 stretches along x."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    s = base
    for i in range(octaves):
        out += amp * pnoise(h, w, max(s, 0.6), max(s * aniso, 0.6), seed + i * 17)
        tot += amp
        amp *= gain
        s /= 2
    return out / tot


def n01(n):
    """Map std-1 noise to roughly 0..1."""
    return np.clip(n * 0.25 + 0.5, 0, 1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def blur_wrap(a, sigma):
    h, w = a.shape[:2]
    if a.ndim == 3:
        return np.stack([blur_wrap(a[..., i], sigma) for i in range(a.shape[2])], -1)
    F = np.fft.rfft2(a)
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    F *= np.exp(-2 * np.pi ** 2 * (sigma ** 2) * (fy ** 2 + fx ** 2))
    return np.fft.irfft2(F, s=(h, w)).astype(np.float32)


def wrap_lines(size, segs, width, blur=0.0):
    """Draw line segments [(x0,y0,x1,y1,value)] onto a wrapped float mask."""
    scale = 2
    im = Image.new("F", (size * scale, size * scale), 0.0)
    d = ImageDraw.Draw(im)
    for (x0, y0, x1, y1, v) in segs:
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d.line([((x0 + ox) * scale, (y0 + oy) * scale), ((x1 + ox) * scale, (y1 + oy) * scale)],
                       fill=float(v), width=max(1, int(width * scale)))
    im = im.resize((size, size), Image.LANCZOS)
    a = np.asarray(im, np.float32)
    if blur > 0:
        a = blur_wrap(a, blur)
    return a


def normal_from_height(hm, strength=2.0):
    """Tangent space, OpenGL (green up). hm float 2D, wraps."""
    dx = (np.roll(hm, -1, 1) - np.roll(hm, 1, 1)) * 0.5
    drow = (np.roll(hm, -1, 0) - np.roll(hm, 1, 0)) * 0.5
    nx = -dx * strength
    ny = drow * strength  # image rows go down, green is up
    nz = np.ones_like(nx)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return n * 0.5 + 0.5


def save_rgb(arr, name, folder=TEX):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGB").save(os.path.join(folder, name), optimize=True)
    print("wrote", name, a.shape)


def save_rgba(arr, name, folder=TEX):
    a = np.clip(arr, 0, 1)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(folder, name), optimize=True)
    print("wrote", name, a.shape)


def save_pil(im, name, folder=TEX):
    im.save(os.path.join(folder, name), optimize=True)
    print("wrote", name, im.size, im.mode)


def grid(size):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    return yy, xx

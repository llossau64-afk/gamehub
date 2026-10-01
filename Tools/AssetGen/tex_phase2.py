"""Phase 2 textures: price_board.png (felt letter-board) and hair_clippings.png (floor decal)."""
import math
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from scipy.ndimage import gaussian_filter


def price_board():
    W, H = 512, 768
    rng = np.random.default_rng(21)
    # Black felt: fine grain + low-frequency mottling.
    grain = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.8)
    fibre = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (0.6, 2.5))
    blot = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 40)
    blot /= blot.std() + 1e-6
    base = 0.075 + 0.02 * grain + 0.015 * fibre + 0.012 * blot
    felt = np.clip(np.stack([base, base * 0.98, base * 0.95], -1), 0, 1)

    # Text layer (supersampled mask).
    S = 2
    mask = Image.new("L", (W * S, H * S), 0)
    d = ImageDraw.Draw(mask)

    def centered(text, y, size, fname, spacing=0):
        f = font(fname, size * S)
        wd = d.textlength(text, font=f) + spacing * S * (len(text) - 1)
        x = (W * S - wd) / 2
        for ch in text:
            d.text((x, y * S), ch, font=f, fill=255)
            x += d.textlength(ch, font=f) + spacing * S

    centered("PRICES", 70, 76, "Inter-SemiBold.ttf", spacing=10)
    d.rectangle([90 * S, 168 * S, (W - 90) * S, 171 * S], fill=255)
    d.rectangle([90 * S, 177 * S, (W - 90) * S, 178 * S], fill=255)
    lines = [("BUZZ CUT", "$18"), ("SHORT TRIM", "$22"), ("BASIC TAPER", "$24"), ("LOW FADE", "$28"), ("MID FADE", "$30")]
    f = font("Inter-Medium.ttf", 33 * S)
    y = 230
    for name, price in lines:
        d.text((62 * S, y * S), name, font=f, fill=255)
        pw = d.textlength(price, font=f)
        d.text(((W - 62) * S - pw, y * S), price, font=f, fill=255)
        # dotted leader
        nw = d.textlength(name, font=f) / S
        for x in range(int(62 + nw + 14), int(W - 62 - pw / S - 14), 9):
            d.ellipse([x * S, (y + 40) * S, (x + 3) * S, (y + 43) * S], fill=150)
        y += 88
    centered("NO CHECKS  -  CASH ONLY", 690, 18, "Inter-Regular.ttf", spacing=3)
    mask = mask.resize((W, H), Image.LANCZOS)
    m = np.asarray(mask, np.float32) / 255.0
    # Chalky / worn: erode text with noise, soften slightly.
    wear = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 1.2)
    wear2 = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 12)
    m = np.clip(m * (0.88 + 0.25 * wear + 0.2 * wear2 / (wear2.std() + 1e-6) * 0.5), 0, 1)
    m = gaussian_filter(m, 0.5)
    ink = np.array([0.90, 0.88, 0.80], np.float32)
    img = felt * (1 - m[..., None] * 0.92) + ink * m[..., None] * 0.92

    # Wood frame drawn into the edge.
    fw = 26
    yy, xx = np.mgrid[0:H, 0:W]
    dist = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
    frame = dist < fw
    gr = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), (0.8, 14))
    gr /= gr.std() + 1e-6
    wood = np.stack([0.20 + 0.03 * gr, 0.115 + 0.022 * gr, 0.06 + 0.014 * gr], -1)
    # bevel: bright outer edge, dark inner edge
    bev = np.where(dist < 3, 0.06, 0.0) - np.where((dist > fw - 5) & (dist < fw), 0.07, 0.0)
    wood = np.clip(wood + bev[..., None], 0, 1)
    img = np.where(frame[..., None], wood, img)
    # inner shadow on felt
    sh = np.clip(1 - (dist - fw) / 18.0, 0, 1) * (dist >= fw)
    img *= (1 - 0.45 * sh)[..., None]
    # Aging: vignette-ish dust, scuffs
    dust = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 6)
    dust = np.clip(dust / (dust.std() + 1e-6) - 1.5, 0, 2) * 0.03
    img = np.clip(img + dust[..., None] * np.array([1, 0.97, 0.9]), 0, 1)
    out = (img * 255).astype(np.uint8)
    Image.fromarray(out, "RGB").save(os.path.join(TEX, "price_board.png"))


def hair_clippings():
    N, S = 512, 2
    rng = np.random.default_rng(77)
    img = Image.new("RGBA", (N * S, N * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = N / 2
    # Irregular blob radius as function of angle.
    ph = rng.uniform(0, 6.28, 4)
    am = [0.10, 0.07, 0.05, 0.03]

    def blob_r(a):
        return 1.0 + sum(am[k] * math.sin((k + 2) * a + ph[k]) for k in range(4))

    R = N * 0.44
    count = 5200
    placed = 0
    while placed < count:
        x = rng.uniform(8, N - 8)
        y = rng.uniform(8, N - 8)
        dx, dy = x - cx, y - cy
        r = math.hypot(dx, dy)
        rr = r / (R * blob_r(math.atan2(dy, dx)))
        # density: dense core, soft falloff; sparse outliers beyond
        p = math.exp(-(rr ** 2) * 2.2)
        if rng.random() > p:
            continue
        placed += 1
        L = rng.uniform(2, 12)
        a = rng.uniform(0, math.pi)
        curl = rng.uniform(-0.9, 0.9)
        pts = []
        n = max(3, int(L / 2) + 2)
        for i in range(n):
            t = i / (n - 1)
            ang = a + curl * (t - 0.5)
            ox = math.cos(a) * (t - 0.5) * L
            oy = math.sin(a) * (t - 0.5) * L
            # perpendicular bow
            bow = math.sin(t * math.pi) * curl * L * 0.18
            ox += -math.sin(a) * bow
            oy += math.cos(a) * bow
            pts.append(((x + ox) * S, (y + oy) * S))
        shade = rng.choice([0, 1, 2], p=[0.45, 0.4, 0.15])
        col = [(14, 10, 8), (36, 22, 14), (62, 40, 24)][shade]
        alpha = int(rng.uniform(170, 255) * (0.55 + 0.45 * min(1.0, p * 1.6)))
        wd = 1 if rng.random() < 0.55 else 2
        d.line(pts, fill=col + (alpha,), width=wd * S, joint="curve")
    img = img.resize((N, N), Image.LANCZOS)
    a = np.asarray(img).copy()
    # Hard fade at the quad edge so the decal never shows a seam.
    yy, xx = np.mgrid[0:N, 0:N]
    rad = np.hypot(xx - cx, yy - cy) / (N * 0.5)
    fade = np.clip((1.0 - rad) / 0.12, 0, 1)
    a[..., 3] = (a[..., 3] * fade).astype(np.uint8)
    Image.fromarray(a, "RGBA").save(os.path.join(TEX, "hair_clippings.png"))


if __name__ == "__main__":
    os.makedirs(TEX, exist_ok=True)
    price_board()
    hair_clippings()
    print("tex_phase2 done")

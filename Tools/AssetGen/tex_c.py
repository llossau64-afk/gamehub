"""Printed / non-tiling textures: magazines, poster, decals, signs, overlays."""
import math
from common import *
from scipy.ndimage import gaussian_filter

SERIF = "DMSerifDisplay-Regular.ttf"


def paper_age(img, seed, strength=1.0, edge=True):
    """Apply paper grain, stains, edge darkening to an RGB PIL image."""
    a = np.asarray(img.convert("RGB"), np.float32) / 255.0
    h, w = a.shape[:2]
    rng = np.random.default_rng(seed)
    g = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), 0.7)
    low = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), 30)
    low /= low.std()
    mid = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), 8)
    mid /= mid.std()
    a = a * (1 + 0.025 * strength * g[..., None] + 0.035 * strength * low[..., None])
    st = smooth(0.9, 1.8, low + 0.4 * mid)
    a = mix(a, a * np.array([0.82, 0.72, 0.52]), st * 0.5 * strength)
    if edge:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy])
        e = smooth(26, 0, d) * (0.5 + 0.5 * n01(mid * 1.5))
        a = mix(a, a * np.array([0.62, 0.5, 0.34]), e * 0.75 * strength)
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def fit_font(name, text, maxw, start):
    s = start
    while s > 6:
        f = font(name, s)
        b = f.getbbox(text)
        if b[2] - b[0] <= maxw:
            return f
        s -= 2
    return font(name, 6)


def centered(d, cx, y, text, f, fill, anchor="ma"):
    d.text((cx, y), text, font=f, fill=fill, anchor=anchor)


def magazines():
    S = 512
    cov = Image.new("RGB", (S, S), (230, 220, 195))
    d = ImageDraw.Draw(cov)
    W = 256
    specs = [
        ("GROOM", (176, 52, 40), (236, 222, 190), (28, 24, 22), "the gentleman's quarterly"),
        ("STYLE", (36, 88, 98), (240, 214, 150), (24, 30, 32), "fashion & fancy"),
        ("MOTOR", (222, 176, 60), (36, 34, 38), (150, 40, 34), "chrome & horsepower"),
        ("SPORT", (46, 84, 60), (238, 226, 196), (200, 70, 46), "the weekly game"),
    ]
    for i, (title, bg, fg, ac, sub) in enumerate(specs):
        ox, oy = (i % 2) * W, (i // 2) * W
        # supersampled cover
        k = 2
        cv = Image.new("RGB", (W * k, W * k), bg)
        cd = ImageDraw.Draw(cv)
        # masthead band + title
        f = fit_font(SERIF, title, int(W * k * 0.86), 110 * k)
        cd.text((W * k // 2, 14 * k), title, font=f, fill=fg, anchor="ma")
        cd.line([(14 * k, 14 * k + 74 * k), (W * k - 14 * k, 14 * k + 74 * k)], fill=fg, width=k)
        cd.text((W * k // 2, 14 * k + 78 * k), sub.upper(), font=font("Inter-Medium.ttf", 8 * k), fill=fg, anchor="ma")
        # central illustration
        cx, cy = W * k // 2, int(W * k * (0.72 if title == 'STYLE' else 0.66))
        if title == "GROOM":
            cd.ellipse([cx - 52 * k, cy - 52 * k, cx + 52 * k, cy + 52 * k], fill=fg)
            cd.ellipse([cx - 30 * k, cy - 30 * k, cx + 30 * k, cy + 38 * k], fill=(70, 50, 42))
            cd.pieslice([cx - 34 * k, cy - 40 * k, cx + 34 * k, cy + 6 * k], 180, 360, fill=ac)
            cd.rectangle([cx - 44 * k, cy + 52 * k, cx + 44 * k, cy + 62 * k], fill=ac)
        elif title == "STYLE":
            cd.polygon([(cx - 36 * k, cy + 56 * k), (cx - 18 * k, cy - 14 * k), (cx + 18 * k, cy - 14 * k), (cx + 36 * k, cy + 56 * k)], fill=fg)
            cd.ellipse([cx - 15 * k, cy - 46 * k, cx + 15 * k, cy - 12 * k], fill=(60, 44, 38))
            cd.pieslice([cx - 18 * k, cy - 52 * k, cx + 18 * k, cy - 20 * k], 180, 360, fill=(30, 24, 22))
            cd.rectangle([cx - 80 * k, cy + 56 * k, cx + 80 * k, cy + 60 * k], fill=fg)
        elif title == "MOTOR":
            cd.rounded_rectangle([cx - 78 * k, cy - 6 * k, cx + 78 * k, cy + 34 * k], 12 * k, fill=ac)
            cd.polygon([(cx - 44 * k, cy - 6 * k), (cx - 26 * k, cy - 34 * k), (cx + 30 * k, cy - 34 * k), (cx + 52 * k, cy - 6 * k)], fill=ac)
            for sx in (-46, 46):
                cd.ellipse([cx + (sx - 16) * k, cy + 20 * k, cx + (sx + 16) * k, cy + 52 * k], fill=fg)
                cd.ellipse([cx + (sx - 7) * k, cy + 29 * k, cx + (sx + 7) * k, cy + 43 * k], fill=bg)
            for r in range(3):
                cd.line([(14 * k, cy + (62 + r * 6) * k), (W * k - 14 * k, cy + (62 + r * 6) * k)], fill=fg, width=k)
        else:
            cd.ellipse([cx - 56 * k, cy - 56 * k, cx + 56 * k, cy + 56 * k], outline=fg, width=4 * k)
            cd.arc([cx - 56 * k, cy - 56 * k, cx + 56 * k, cy + 56 * k], 40, 140, fill=ac, width=4 * k)
            cd.arc([cx - 56 * k, cy - 56 * k, cx + 56 * k, cy + 56 * k], 220, 320, fill=ac, width=4 * k)
            cd.line([(cx, cy - 56 * k), (cx, cy + 56 * k)], fill=fg, width=3 * k)
            cd.ellipse([cx - 14 * k, cy - 14 * k, cx + 14 * k, cy + 14 * k], outline=fg, width=3 * k)
        # corner badge and footer
        cd.ellipse([W * k - 62 * k, 108 * k, W * k - 14 * k, 156 * k], fill=ac)
        cd.text((W * k - 38 * k, 132 * k), "10¢", font=font(SERIF, 18 * k), fill=(245, 235, 210), anchor="mm")
        cd.rectangle([0, W * k - 22 * k, W * k, W * k], fill=ac)
        cd.text((12 * k, W * k - 11 * k), "VOL. %d  ·  NO. %d" % (3 + i * 2, 11 + i * 7), font=font("Inter-SemiBold.ttf", 8 * k), fill=(245, 235, 210), anchor="lm")
        cv = cv.resize((W, W), Image.LANCZOS)
        # printing: halftone-ish grain + fade
        cov.paste(cv, (ox, oy))
        # border gutter lines
    out = paper_age(cov, 201, 0.9, edge=False)
    d = ImageDraw.Draw(out)
    # per cover subtle edge wear
    a = np.asarray(out, np.float32) / 255
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    lx, ly = xx % W, yy % W
    dd = np.minimum.reduce([lx, W - 1 - lx, ly, W - 1 - ly])
    nz = gaussian_filter(np.random.default_rng(202).standard_normal((S, S)).astype(np.float32), 3)
    nz /= nz.std()
    e = smooth(9, 0, dd + nz * 1.5)
    a = mix(a, a * 0.6 + np.array([0.18, 0.15, 0.1]) * 0.4, e * 0.7)
    # cover crease
    cr = np.exp(-((lx - 6) ** 2) / 6.0) * 0.12
    a = a * (1 - cr[..., None])
    save_pil(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)), "magazines_atlas.png")


def head(d, cx, cy, k, hair_fn, skin=(112, 86, 68), hair=(30, 22, 18)):
    # shoulders / neck
    d.polygon([(cx - 50 * k, cy + 84 * k), (cx - 42 * k, cy + 66 * k), (cx - 16 * k, cy + 54 * k), (cx + 16 * k, cy + 54 * k), (cx + 42 * k, cy + 66 * k), (cx + 50 * k, cy + 84 * k)], fill=(52, 42, 36))
    d.rectangle([cx - 13 * k, cy + 28 * k, cx + 13 * k, cy + 64 * k], fill=skin)
    # ears
    d.ellipse([cx - 40 * k, cy - 6 * k, cx - 28 * k, cy + 14 * k], fill=skin)
    d.ellipse([cx + 28 * k, cy - 6 * k, cx + 40 * k, cy + 14 * k], fill=skin)
    d.ellipse([cx - 34 * k, cy - 42 * k, cx + 34 * k, cy + 46 * k], fill=skin)
    hair_fn(d, cx, cy, k, hair)


def poster():
    W, H = 512, 768
    k = 3
    im = Image.new("RGB", (W * k, H * k), (232, 219, 188))
    d = ImageDraw.Draw(im)
    d.rectangle([14 * k, 14 * k, (W - 14) * k, (H - 14) * k], outline=(110, 40, 32), width=3 * k)
    d.rectangle([22 * k, 22 * k, (W - 22) * k, (H - 22) * k], outline=(110, 40, 32), width=k)
    t = "CLASSIC CUTS"
    f = fit_font(SERIF, t, int(W * k * 0.78), 70 * k)
    d.text((W * k // 2, 40 * k), t, font=f, fill=(112, 38, 30), anchor="ma")
    d.line([(60 * k, 112 * k), ((W - 60) * k, 112 * k)], fill=(112, 38, 30), width=2 * k)
    d.text((W * k // 2, 118 * k), "A GUIDE TO THE GENTLEMAN'S HAIRCUT", font=font("Inter-SemiBold.ttf", 10 * k), fill=(90, 60, 48), anchor="ma")

    def crew(d, cx, cy, k, h):
        d.chord([cx - 36 * k, cy - 52 * k, cx + 36 * k, cy + 20 * k], 180, 360, fill=h)
        d.rectangle([cx - 36 * k, cy - 18 * k, cx + 36 * k, cy - 14 * k], fill=h)
        d.polygon([(cx - 35 * k, cy - 18 * k), (cx - 33 * k, cy + 2 * k), (cx - 30 * k, cy - 18 * k)], fill=h)
        d.polygon([(cx + 35 * k, cy - 18 * k), (cx + 33 * k, cy + 2 * k), (cx + 30 * k, cy - 18 * k)], fill=h)

    def pomp(d, cx, cy, k, h):
        d.chord([cx - 38 * k, cy - 54 * k, cx + 38 * k, cy + 18 * k], 180, 360, fill=h)
        d.ellipse([cx - 44 * k, cy - 78 * k, cx + 34 * k, cy - 28 * k], fill=h)
        d.polygon([(cx - 36 * k, cy - 24 * k), (cx - 36 * k, cy + 4 * k), (cx - 30 * k, cy - 22 * k)], fill=h)
        d.polygon([(cx + 36 * k, cy - 24 * k), (cx + 36 * k, cy + 4 * k), (cx + 30 * k, cy - 22 * k)], fill=h)
        d.rectangle([cx - 37 * k, cy - 30 * k, cx + 37 * k, cy - 22 * k], fill=h)

    def side(d, cx, cy, k, h):
        d.chord([cx - 38 * k, cy - 56 * k, cx + 38 * k, cy + 20 * k], 180, 360, fill=h)
        d.polygon([(cx - 38 * k, cy - 20 * k), (cx - 38 * k, cy + 6 * k), (cx - 32 * k, cy - 20 * k)], fill=h)
        d.polygon([(cx + 38 * k, cy - 20 * k), (cx + 38 * k, cy + 6 * k), (cx + 30 * k, cy - 20 * k)], fill=h)
        d.rectangle([cx - 37 * k, cy - 24 * k, cx + 37 * k, cy - 18 * k], fill=h)
        d.ellipse([cx - 42 * k, cy - 58 * k, cx + 6 * k, cy - 22 * k], fill=h)
        d.line([(cx - 14 * k, cy - 54 * k), (cx - 8 * k, cy - 30 * k)], fill=(112, 86, 68), width=2 * k)

    def fade(d, cx, cy, k, h):
        d.chord([cx - 31 * k, cy - 56 * k, cx + 31 * k, cy - 8 * k], 180, 360, fill=h)
        d.rectangle([cx - 28 * k, cy - 34 * k, cx + 28 * k, cy - 28 * k], fill=h)
        for i, a in enumerate((130, 100, 70)):
            y0 = cy - 28 * k + i * 8 * k
            col = tuple(int(h[j] * (a / 255) + (112, 86, 68)[j] * (1 - a / 255)) for j in range(3))
            d.rectangle([cx - 33 * k, y0, cx - 28 * k, y0 + 8 * k], fill=col)
            d.rectangle([cx + 28 * k, y0, cx + 33 * k, y0 + 8 * k], fill=col)

    def flat(d, cx, cy, k, h):
        d.rectangle([cx - 30 * k, cy - 66 * k, cx + 30 * k, cy - 22 * k], fill=h)
        d.chord([cx - 34 * k, cy - 54 * k, cx + 34 * k, cy - 10 * k], 180, 360, fill=h)
        d.polygon([(cx - 34 * k, cy - 30 * k), (cx - 34 * k, cy + 2 * k), (cx - 28 * k, cy - 30 * k)], fill=h)
        d.polygon([(cx + 34 * k, cy - 30 * k), (cx + 34 * k, cy + 2 * k), (cx + 28 * k, cy - 30 * k)], fill=h)

    def slick(d, cx, cy, k, h):
        d.chord([cx - 38 * k, cy - 56 * k, cx + 38 * k, cy + 4 * k], 180, 360, fill=h)
        d.polygon([(cx - 38 * k, cy - 26 * k), (cx - 40 * k, cy - 4 * k), (cx - 30 * k, cy - 22 * k)], fill=h)
        d.polygon([(cx + 38 * k, cy - 26 * k), (cx + 40 * k, cy - 4 * k), (cx + 30 * k, cy - 22 * k)], fill=h)
        d.polygon([(cx - 38 * k, cy - 26 * k), (cx - 44 * k, cy - 10 * k), (cx - 36 * k, cy - 4 * k)], fill=h)
        for i in range(5):
            d.arc([cx - 34 * k + i * 4 * k, cy - 54 * k, cx + 34 * k, cy - 8 * k + i * 2 * k], 215 + i * 4, 300, fill=(120, 100, 90), width=k)

    styles = [("Crew", crew), ("Pompadour", pomp), ("Side Part", side), ("Fade", fade), ("Flat Top", flat), ("Slick Back", slick)]
    cols, rows = 2, 3
    cw = (W - 80) // cols
    top = 165
    ch = (H - top - 40) // rows
    for i, (name, fn) in enumerate(styles):
        c0, r0 = i % cols, i // cols
        ccx = 40 + cw * c0 + cw // 2
        ccy = top + ch * r0 + 70
        d.rounded_rectangle([(40 + cw * c0 + 10) * k, (top + ch * r0 + 4) * k, (40 + cw * (c0 + 1) - 10) * k, (top + ch * (r0 + 1) - 8) * k], 10 * k, outline=(140, 100, 80), width=k)
        head(d, ccx * k, ccy * k, k, fn)
        d.text((ccx * k, (top + ch * r0 + ch - 36) * k), name.upper(), font=font(SERIF, 17 * k), fill=(112, 38, 30), anchor="ma")
    im = im.resize((W, H), Image.LANCZOS)
    out = paper_age(im, 211, 0.6)
    # fold lines
    a = np.asarray(out, np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for fx in (W / 2,):
        f = np.exp(-((xx - fx) ** 2) / 2.5) * 0.1
        a = a * (1 - f[..., None]) + 0.05 * np.exp(-((xx - fx - 3) ** 2) / 3)[..., None]
    f = np.exp(-((yy - H / 3) ** 2) / 2.5) * 0.08
    a = a * (1 - f[..., None])
    save_pil(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)), "poster_hairstyles.png")


def gold_gradient(w, h, y0, y1):
    ys = np.linspace(0, 1, h)[:, None]
    t = np.clip((ys * h - y0) / max(1, (y1 - y0)), 0, 1)
    top, mid, bot = c(246, 218, 130), c(212, 164, 70), c(150, 100, 38)
    col = np.where(t[..., None] < 0.5, mix(top, mid, t * 2), mix(mid, bot, (t - 0.5) * 2))
    return np.broadcast_to(col, (h, w, 3)).astype(np.float32)


def window_decal():
    W, H = 1024, 512
    k = 2
    mask = Image.new("L", (W * k, H * k), 0)
    md = ImageDraw.Draw(mask)
    text = "BARBER SHOP"
    f = font(SERIF, 150 * k)
    # arched placement
    chars = list(text)
    widths = [f.getlength(ch) for ch in chars]
    total = sum(widths) + 4 * k * (len(chars) - 1)
    R = 900 * k
    cx, cy = W * k / 2, 60 * k + R + 100 * k
    ang_total = total / R
    a = -ang_total / 2
    for ch, wd in zip(chars, widths):
        a_c = a + wd / R / 2
        a += (wd + 4 * k) / R
        if ch == " ":
            continue
        tile = Image.new("L", (int(wd) + 80 * k, 260 * k), 0)
        ImageDraw.Draw(tile).text((tile.size[0] // 2, tile.size[1] // 2), ch, font=f, fill=255, anchor="mm")
        rot = tile.rotate(-math.degrees(a_c), resample=Image.BICUBIC, expand=True)
        px = cx + math.sin(a_c) * (R - 20 * k) - rot.size[0] / 2
        py = cy - math.cos(a_c) * (R - 20 * k) - rot.size[1] / 2 + 0
        mask.paste(255, (int(px), int(py)), rot)
    # ornamental rules and small caps line
    sub = "EST. 1962 · HAIRCUTS · SHAVES"
    fs = font("Inter-SemiBold.ttf", 34 * k)
    sw = sum(fs.getlength(ch) + 5 * k for ch in sub)
    x = (W * k - sw) / 2
    ys = 345 * k
    for ch in sub:
        md.text((x, ys), ch, font=fs, fill=255, anchor="ls")
        x += fs.getlength(ch) + 5 * k
    # flourish lines w/ diamonds
    yl = 395 * k
    for (xa, xb) in ((120, 440), (584, 904)):
        md.line([(xa * k, yl), (xb * k, yl)], fill=255, width=3 * k)
        md.line([(xa * k, yl + 9 * k), (xb * k, yl + 9 * k)], fill=255, width=k)
    for dx in (-18, 0, 18):
        s = 8 if dx == 0 else 5
        md.polygon([(W * k / 2 + dx * k, yl + 4 * k - s * k), (W * k / 2 + dx * k + s * k, yl + 4 * k), (W * k / 2 + dx * k, yl + 4 * k + s * k), (W * k / 2 + dx * k - s * k, yl + 4 * k)], fill=255)
    md.line([(120 * k, 120 * k), (120 * k, 120 * k)], fill=0)
    mask = mask.resize((W, H), Image.LANCZOS)
    m = np.asarray(mask, np.float32) / 255
    # outline: dilate
    from scipy.ndimage import maximum_filter
    outer = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7)), np.float32) / 255
    outer = gaussian_filter(outer, 0.8)
    shadow = gaussian_filter(np.roll(np.roll(outer, 5, 0), 4, 1), 2.5)
    gold = gold_gradient(W, H, 150, 360)
    # subtle highlight diagonal sheen and speckle wear
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sheen = 0.5 + 0.5 * np.sin((xx + yy * 0.6) / 120)
    gold = gold * (0.93 + 0.1 * sheen[..., None])
    rng = np.random.default_rng(221)
    spk = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.8)
    spk /= spk.std()
    gold = gold * (1 + 0.06 * spk[..., None])
    wear = smooth(2.3, 3.0, spk + 0.0)
    ma = m * (1 - 0.35 * wear)
    # bevel highlight
    hi = np.clip(m - np.roll(np.roll(m, 2, 0), 2, 1), 0, 1)
    gold = gold + 0.25 * hi[..., None]
    dark = c(36, 22, 10)
    rgb = np.zeros((H, W, 3), np.float32)
    alpha = np.clip(outer * 0.95, 0, 1)
    # composite: shadow (black) -> outline (dark) -> gold
    a_sh = np.clip(shadow * 0.45, 0, 1)
    out_rgb = np.zeros((H, W, 3), np.float32)
    out_a = a_sh.copy()
    # outline layer over shadow
    out_rgb = out_rgb * (1 - alpha[..., None]) + dark * alpha[..., None]
    out_a = alpha + out_a * (1 - alpha)
    out_rgb = out_rgb * (1 - ma[..., None]) + gold * ma[..., None]
    out_a = ma + out_a * (1 - ma)
    save_rgba(np.dstack([out_rgb, out_a]), "window_decal.png")


def sign_board():
    W, H = 1024, 256
    rng = np.random.default_rng(231)
    S = 1024
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    n = lambda sy, sx, sd: gaussian_filter(np.random.default_rng(sd).standard_normal((H, W)).astype(np.float32), (sy, sx), mode="reflect")
    def nn(sy, sx, sd):
        a = n(sy, sx, sd)
        return a / a.std()
    grain = nn(0.8, 30, 1) * 0.6 + nn(2.5, 90, 2) * 0.4
    base = np.tile(c(34, 74, 54), (H, W, 1))
    col = base * (1 + 0.07 * grain[..., None] + 0.03 * nn(0.7, 0.7, 3)[..., None])
    col = col * (1 + 0.04 * nn(30, 30, 4)[..., None])
    # plank seams
    for y in (86, 172):
        col[y - 1:y + 1] *= 0.5
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))
    k = 2
    big = img.resize((W * k, H * k), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    cream, gold = (238, 224, 184), (214, 172, 84)
    d.rounded_rectangle([14 * k, 14 * k, (W - 14) * k, (H - 14) * k], 10 * k, outline=gold, width=4 * k)
    d.rounded_rectangle([26 * k, 26 * k, (W - 26) * k, (H - 26) * k], 6 * k, outline=cream, width=2 * k)
    t = "BARBERSHOP"
    f = fit_font(SERIF, t, int(W * k * 0.8), 170 * k)
    # letter spaced
    sp = 10 * k
    wd = [f.getlength(ch) for ch in t]
    tot = sum(wd) + sp * (len(t) - 1)
    x = (W * k - tot) / 2
    # shadow first
    for ch, w_ in zip(t, wd):
        d.text((x + 4 * k, H * k / 2 + 5 * k), ch, font=f, fill=(12, 30, 22), anchor="lm")
        x += w_ + sp
    x = (W * k - tot) / 2
    for ch, w_ in zip(t, wd):
        d.text((x, H * k / 2), ch, font=f, fill=cream, anchor="lm", stroke_width=0)
        x += w_ + sp
    for sx in (60, W - 60):
        d.polygon([(sx * k, 128 * k - 10 * k), (sx * k + 10 * k, 128 * k), (sx * k, 128 * k + 10 * k), (sx * k - 10 * k, 128 * k)], fill=gold)
    img = big.resize((W, H), Image.LANCZOS)
    a = np.asarray(img, np.float32) / 255
    # paint wear: chips exposing lighter wood, fading, scuffs
    chip = smooth(1.6, 2.4, nn(1.6, 1.6, 5) + 0.6 * nn(5, 5, 6)) * 1.0
    chip = chip * smooth(0.0, 1.0, nn(25, 25, 7) + 0.8)
    a = mix(a, c(150, 118, 78) * (1 + 0.1 * grain[..., None]), chip * 0.8)
    fade = smooth(0.8, 2.0, nn(40, 40, 8))
    a = mix(a, a * 0.8 + 0.08, fade * 0.35)
    # vertical rain streaks
    st = smooth(0.8, 2.2, nn(40, 1.5, 9))
    a = mix(a, a * 0.7, st * 0.3)
    # dirt at bottom + edges
    e = smooth(30, 0, np.minimum.reduce([xx, W - 1 - xx, yy, H - 1 - yy]))
    a = a * (1 - 0.25 * e[..., None])
    save_pil(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)), "sign_board.png")


def mirror_dirt():
    S = 512
    rng = np.random.default_rng(241)
    def nn(s, sd):
        a = gaussian_filter(np.random.default_rng(sd).standard_normal((S, S)).astype(np.float32), s, mode="wrap")
        return a / a.std()
    sm = smooth(1.0, 2.2, nn(18, 1) * 0.6 + nn(6, 2) * 0.5)
    wipe = 0.5 + 0.5 * np.sin((np.arange(S)[None, :] * 0.5 + nn(30, 3) * 8) * 0.2)
    swipe = smooth(1.2, 2.4, nn(12, 4) * 0.7 + nn(3, 5) * 0.4) * (0.6 + 0.4 * wipe)
    specks = smooth(2.4, 3.2, nn(0.9, 6))
    specks2 = smooth(2.6, 3.4, nn(1.6, 7))
    # fingerprint-like smudge blobs
    fp = np.zeros((S, S), np.float32)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    for _ in range(9):
        cx, cy = rng.uniform(0, S, 2)
        rr = np.sqrt((xx - cx) ** 2 * 1.0 + (yy - cy) ** 2 * 1.5)
        fp += (0.5 + 0.5 * np.sin(rr * 0.9)) * np.exp(-(rr ** 2) / (2 * 14 ** 2)) * rng.uniform(0.4, 1)
    a = 0.07 * sm + 0.10 * swipe + 0.30 * specks + 0.25 * specks2 + 0.10 * fp
    a = np.clip(a, 0, 0.45)
    rgb = np.broadcast_to(c(235, 232, 220), (S, S, 3))
    save_rgba(np.dstack([rgb, a]), "mirror_dirt.png")


def street_silhouettes():
    W, H = 1024, 512
    rng = np.random.default_rng(251)
    k = 2
    layer = Image.new("RGBA", (W * k, H * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # far row (lighter, lower contrast) then near row
    def row(base_y, hmin, hmax, col, wmin, wmax, lit_p, seed):
        r = np.random.default_rng(seed)
        x = -20
        while x < W + 20:
            w = int(r.integers(wmin, wmax))
            h = int(r.integers(hmin, hmax))
            d.rectangle([x * k, (base_y - h) * k, (x + w) * k, H * k], fill=col)
            if r.random() < 0.3:
                d.rectangle([(x + 4) * k, (base_y - h - 12) * k, (x + w - 4) * k, (base_y - h) * k], fill=col)
            # windows
            wx = 10
            while wx < w - 14:
                wy = 14
                while wy < h - 20:
                    if r.random() < lit_p:
                        shade = r.uniform(0.6, 1.0)
                        wc = (int(255 * shade), int(196 * shade), int(112 * shade), int(r.integers(150, 230)))
                        d.rectangle([(x + wx) * k, (base_y - h + wy) * k, (x + wx + 9) * k, (base_y - h + wy + 14) * k], fill=wc)
                    else:
                        d.rectangle([(x + wx) * k, (base_y - h + wy) * k, (x + wx + 9) * k, (base_y - h + wy + 14) * k], fill=(col[0] + 10, col[1] + 12, col[2] + 16, 255))
                    wy += 30
                wx += 22
            x += w + int(r.integers(0, 6))
    row(420, 150, 330, (58, 60, 72, 190), 90, 170, 0.08, 1)
    row(470, 100, 260, (42, 42, 54, 235), 80, 150, 0.2, 2)
    layer = layer.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.4))
    a = np.asarray(layer, np.float32) / 255
    # low contrast: scale alpha, and fade top edges slightly
    a[..., 3] *= 0.85
    save_rgba(a, "street_silhouettes.png")


def person_silhouette():
    W, H = 256, 512
    k = 4
    im = Image.new("L", (W * k, H * k), 0)
    d = ImageDraw.Draw(im)
    def cap(p0, p1, r):
        d.line([(p0[0] * k, p0[1] * k), (p1[0] * k, p1[1] * k)], fill=255, width=int(2 * r * k))
        for p in (p0, p1):
            d.ellipse([(p[0] - r) * k, (p[1] - r) * k, (p[0] + r) * k, (p[1] + r) * k], fill=255)
    cx = 128
    d.ellipse([(cx - 24) * k, 28 * k, (cx + 24) * k, 82 * k], fill=255)       # head
    cap((cx, 78), (cx, 98), 12)                                                 # neck
    d.polygon([((cx - 46) * k, 112 * k), ((cx + 46) * k, 112 * k), ((cx + 40) * k, 250 * k), ((cx - 40) * k, 250 * k)], fill=255)  # coat
    d.ellipse([(cx - 52) * k, 100 * k, (cx + 52) * k, 140 * k], fill=255)       # shoulders
    cap((cx - 48, 124), (cx - 62, 220), 12)                                     # back arm
    cap((cx + 48, 124), (cx + 66, 214), 12)                                     # front arm
    cap((cx - 14, 250), (cx - 62, 395), 17)                                     # back leg thigh
    cap((cx - 62, 395), (cx - 84, 470), 12)
    cap((cx + 14, 250), (cx + 34, 380), 17)                                     # front leg
    cap((cx + 34, 380), (cx + 40, 470), 12)
    d.ellipse([(cx - 104) * k, 462 * k, (cx - 62) * k, 484 * k], fill=255)       # feet
    d.ellipse([(cx + 24) * k, 462 * k, (cx + 68) * k, 484 * k], fill=255)
    im = im.resize((W, H), Image.LANCZOS)
    m = gaussian_filter(np.asarray(im, np.float32) / 255, 4.5)
    # soft vertical fade at feet, slight rim of warm light
    a = m * 0.9
    rgb = np.zeros((H, W, 3), np.float32)
    rgb[:] = c(22, 20, 24)
    rim = np.clip(gaussian_filter(m, 1.2) - gaussian_filter(m, 7), 0, 1)
    rgb = rgb + c(50, 38, 28) * rim[..., None] * 1.2
    save_rgba(np.dstack([rgb, a]), "person_silhouette.png")


def locked_door_sign():
    W, H = 512, 256
    k = 3
    paper = Image.new("RGB", (W * k, H * k), (240, 236, 222))
    d = ImageDraw.Draw(paper)
    rng = np.random.default_rng(261)
    lines = ["UNDER RENOVATION —", "KEEP OUT"]
    f_sizes = [34 * k, 70 * k]
    inkc = (24, 24, 34)
    layer = Image.new("RGBA", paper.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ys = [68 * k, 150 * k]
    for line, fs_, y in zip(lines, f_sizes, ys):
        f = font("Inter-SemiBold.ttf", fs_)
        widths = [f.getlength(ch) for ch in line]
        sp = 1.0 * k
        tot = sum(widths) + sp * (len(line) - 1)
        x = (W * k - tot) / 2 + rng.normal(0, 3 * k)
        base = y + rng.normal(0, 2 * k)
        for ch, w_ in zip(line, widths):
            if ch != " ":
                ld.text((x + rng.normal(0, 1.2 * k), base + rng.normal(0, 2.2 * k) ), ch, font=f, fill=inkc + (255,), anchor="lm", stroke_width=int(2.2 * k))
            x += w_ + sp + rng.normal(0, 1.0 * k)
    # underline marker swipe
    ld.line([(60 * k, 214 * k), (W * k - 56 * k, 208 * k)], fill=inkc + (230,), width=int(4 * k))
    layer = layer.rotate(-2.5, resample=Image.BICUBIC, center=(W * k / 2, H * k / 2))
    paper = paper.convert("RGBA")
    paper.alpha_composite(layer)
    img = paper.resize((W, H), Image.LANCZOS).convert("RGB")
    out = paper_age(img, 262, 1.0)
    a = np.asarray(out, np.float32) / 255
    # tape strips
    tape = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    td = ImageDraw.Draw(tape)
    for (cx, cy, ang) in ((30, 22, -35), (W - 30, 20, 38)):
        t = Image.new("RGBA", (130 * 2, 34 * 2), (222, 208, 150, 150))
        tdd = ImageDraw.Draw(t)
        for i in range(0, 130 * 2, 6):
            tdd.line([(i, 0), (i - 3, 34 * 2)], fill=(255, 250, 220, 30))
        for j in range(0, 130 * 2, 10):
            tdd.polygon([(j, 0), (j + 5, 4), (j + 10, 0)], fill=(0, 0, 0, 0))
            tdd.polygon([(j, 34 * 2), (j + 5, 34 * 2 - 4), (j + 10, 34 * 2)], fill=(0, 0, 0, 0))
        t = t.rotate(ang, expand=True, resample=Image.BICUBIC)
        tape.alpha_composite(t, (int(cx * 2 - t.size[0] / 2), int(cy * 2 - t.size[1] / 2)))
    tape = tape.resize((W, H), Image.LANCZOS)
    ta = np.asarray(tape, np.float32) / 255
    a = a * (1 - ta[..., 3:4]) + ta[..., :3] * ta[..., 3:4]
    save_pil(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)), "locked_door_sign.png")


if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or ["magazines", "poster", "window_decal", "sign_board", "mirror_dirt", "street_silhouettes", "person_silhouette", "locked_door_sign"]
    for n in names:
        globals()[n]()

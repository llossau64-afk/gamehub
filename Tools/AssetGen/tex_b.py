"""Concrete, asphalt, leather, metal, cardboard, ceiling tiles, fabric."""
from common import *
from scipy.spatial import cKDTree


def concrete(S=1024):
    rng = np.random.default_rng(111)
    col = np.tile(c(152, 149, 142), (S, S, 1))
    m = fbm(S, S, 50, 5, seed=112)
    col = col * (1 + 0.07 * m[..., None])
    col = col * (1 + 0.035 * pnoise(S, S, 0.8, seed=113)[..., None])
    # trowel / sweep marks (broom finish)
    br = pnoise(S, S, 0.8, 10, seed=114)
    col = col * (1 + 0.012 * br[..., None])
    # stains
    st = fbm(S, S, 70, 4, seed=115)
    col = mix(col, c(98, 92, 82), smooth(0.7, 1.5, st) * 0.45)
    oil = fbm(S, S, 30, 4, seed=116)
    col = mix(col, c(70, 66, 62), smooth(1.2, 1.9, oil) * 0.5)
    mo = fbm(S, S, 40, 4, seed=117)
    col = mix(col, c(120, 128, 100), smooth(1.0, 1.8, mo) * 0.12)
    # pits and aggregate
    pits = smooth(0.9, 0.99, n01(pnoise(S, S, 1.0, seed=118)))
    col = col * (1 - 0.3 * pits[..., None])
    ag = smooth(0.93, 0.99, n01(pnoise(S, S, 1.5, seed=119)))
    col = mix(col, c(190, 184, 170), ag * 0.4)
    # slab joints: two slabs of 512 -> lines at x=0,512 and y=0,512; wobble slightly
    yy, xx = grid(S)
    wob = pnoise(S, S, 25, seed=120) * 0.8
    dj = np.minimum.reduce([np.abs(((xx + wob) % 512 + 0) ), np.abs(512 - ((xx + wob) % 512))]) 
    dj = np.minimum(((xx + wob) % 512), 512 - ((xx + wob) % 512))
    dk = np.minimum(((yy + wob) % 512), 512 - ((yy + wob) % 512))
    dmin = np.minimum(dj, dk)
    joint = smooth(2.2, 0.4, dmin)
    dirt = smooth(10, 0, dmin) * n01(fbm(S, S, 8, 3, seed=121))
    col = mix(col, c(88, 80, 68), dirt * 0.5)
    col = mix(col, c(36, 33, 30), joint * 0.9)
    # slab edge lip highlight
    lip = smooth(5, 2.5, dmin) * smooth(1.0, 2.5, dmin)
    col = col * (1 + 0.06 * lip[..., None])
    # slab tonal difference
    sid = (np.floor(xx / 512) + 2 * np.floor(yy / 512)).astype(int)
    tone = np.array([0.0, 0.04, -0.03, 0.02], np.float32)[sid]
    col = col * (1 + tone[..., None])
    # hairline cracks (random walk) and gum spots
    segs = []
    for _ in range(4):
        x, y = rng.uniform(0, S, 2)
        a = rng.uniform(0, 6.28)
        for k in range(rng.integers(20, 45)):
            a += rng.normal(0, 0.4)
            L = rng.uniform(8, 20)
            nx, ny = x + np.cos(a) * L, y + np.sin(a) * L
            segs.append((x, y, nx, ny, 1.0))
            x, y = nx, ny
    cr = np.clip(wrap_lines(S, segs, 1.1, 0.4), 0, 1)
    col = mix(col, c(50, 47, 44), cr * 0.65)
    gum = np.zeros((S, S), np.float32)
    for _ in range(40):
        gx, gy = rng.uniform(0, S, 2)
        r = rng.uniform(2, 4.5)
        gum += np.exp(-(((xx - gx + S / 2) % S - S / 2) ** 2 + ((yy - gy + S / 2) % S - S / 2) ** 2) / (2 * r * r)) > 0.5
    col = mix(col, c(95, 90, 84), np.clip(gum, 0, 1)[..., None] * 0.55)
    save_rgb(col, "concrete_albedo.png")


def asphalt(S=512):
    col = np.tile(c(58, 58, 60), (S, S, 1))
    col = col * (1 + 0.12 * fbm(S, S, 25, 4, seed=131)[..., None])
    fine = pnoise(S, S, 0.7, seed=132)
    col = col * (1 + 0.14 * fine[..., None])
    stones = smooth(0.88, 0.97, n01(pnoise(S, S, 1.1, seed=133)))
    tint = n01(pnoise(S, S, 3, seed=134))
    stc = mix(c(120, 118, 114), c(140, 128, 118), tint)
    col = mix(col, stc, stones * 0.7)
    dark = smooth(0.85, 0.98, n01(pnoise(S, S, 1.0, seed=135)))
    col = col * (1 - 0.4 * dark[..., None])
    oil = fbm(S, S, 30, 3, seed=136)
    col = mix(col, c(30, 30, 33), smooth(1.0, 1.8, oil) * 0.5)
    # worn lighter patch
    wn = fbm(S, S, 80, 2, seed=137)
    col = col * (1 + 0.05 * wn[..., None])
    # tar crack
    rng = np.random.default_rng(138)
    segs = []
    x, y = 0.0, rng.uniform(100, 400)
    a = 0.1
    while x < S:
        a += rng.normal(0, 0.35)
        a = np.clip(a, -0.9, 0.9)
        L = rng.uniform(8, 18)
        segs.append((x, y, x + np.cos(a) * L, y + np.sin(a) * L, 1.0))
        x, y = x + np.cos(a) * L, y + np.sin(a) * L
    # force wrap continuity in y by modular drawing (wrap_lines handles offsets); x end mismatch minor so fade
    cr = np.clip(wrap_lines(S, segs, 1.5, 0.5), 0, 1)
    yy, xx = grid(S)
    cr *= 0.0 + (smooth(0, 60, xx) * smooth(S, S - 60, xx))
    col = mix(col, c(18, 18, 20), cr * 0.8)
    save_rgb(col, "asphalt_albedo.png")


def _voronoi_periodic(S, n, seed):
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0, S, (n, 2))
    yy, xx = grid(S)
    tree = cKDTree(pts, boxsize=S)
    q = np.stack([xx.ravel(), yy.ravel()], 1)
    d, idx = tree.query(q, k=2)
    return d[:, 0].reshape(S, S), d[:, 1].reshape(S, S), idx[:, 0].reshape(S, S)


def leather(S=512):
    f1, f2, idx = _voronoi_periodic(S, 9000, 141)
    e = f2 - f1  # cell border distance-ish
    ridge = smooth(0.0, 2.2, e)  # 0 at creases
    rng = np.random.default_rng(142)
    cellv = rng.normal(0, 1, 9000).astype(np.float32)[idx]
    base = c(104, 28, 33)
    dark = c(60, 14, 20)
    col = mix(dark, base, ridge * 0.45 + 0.55)
    col = col * (1 + 0.04 * cellv[..., None])
    # low-freq sheen and mottling
    m = fbm(S, S, 40, 4, seed=143)
    col = col * (1 + 0.1 * m[..., None])
    fine = pnoise(S, S, 0.7, seed=144)
    col = col * (1 + 0.03 * fine[..., None])
    # wear: worn lighter, desaturated patches (cracking at high points)
    wear = smooth(0.6, 0.95, n01(fbm(S, S, 60, 3, seed=145)))
    col = mix(col, c(135, 70, 62), wear[..., None] * 0.3 * (0.4 + 0.6 * ridge[..., None]))
    # scuffs
    rng = np.random.default_rng(146)
    segs = []
    for _ in range(70):
        x, y = rng.uniform(0, S, 2)
        a = rng.uniform(0, 6.28)
        L = rng.uniform(8, 40)
        segs.append((x, y, x + np.cos(a) * L, y + np.sin(a) * L, rng.uniform(0.4, 1)))
    sc = np.clip(wrap_lines(S, segs, 1.2, 0.6), 0, 1)
    col = mix(col, c(160, 100, 90), sc * 0.25)
    # creases (larger folds)
    cz = fbm(S, S, 24, 3, seed=147, aniso=3.0)
    crease = np.exp(-(cz ** 2) / 0.012)
    col = col * (1 - 0.18 * crease[..., None])
    save_rgb(col, "leather_albedo.png")
    h = ridge * 0.9 + 0.1 * fine - 0.4 * crease + 0.05 * m
    save_rgb(normal_from_height(h, 3.5), "leather_normal.png")


def metal(S=512):
    base = 0.72 + 0.04 * pnoise(S, S, 0.8, 90, seed=151)
    br = pnoise(S, S, 0.6, 30, seed=152)
    br2 = pnoise(S, S, 1.5, 120, seed=153)
    v = base + 0.05 * br + 0.04 * br2
    # reflection bands (horizontal, tileable)
    yy, xx = grid(S)
    bands = 0.04 * np.sin(2 * np.pi * yy / S * 2 + 1.0) + 0.03 * np.sin(2 * np.pi * yy / S * 5 + pnoise(S, S, 60, 400, seed=154))
    v = v + bands + 0.03 * fbm(S, S, 60, 3, seed=155)
    col = np.stack([v * 0.97, v * 0.985, v * 1.02], -1)
    rng = np.random.default_rng(156)
    segs = []
    for _ in range(90):
        x, y = rng.uniform(0, S, 2)
        L = rng.uniform(30, 160)
        a = rng.normal(0, 0.03)
        segs.append((x, y, x + np.cos(a) * L, y + np.sin(a) * L, rng.uniform(0.3, 1)))
    sc = np.clip(wrap_lines(S, segs, 0.8, 0.3), 0, 1)
    col = mix(col, c(235, 238, 242), sc * 0.3)
    sp = smooth(0.9, 0.99, n01(pnoise(S, S, 1.8, seed=157)))
    col = mix(col, c(120, 112, 100), sp * 0.12)
    save_rgb(col, "metal_brushed_albedo.png")


def cardboard(S=512):
    col = np.tile(c(176, 140, 96), (S, S, 1))
    yy, xx = grid(S)
    m = fbm(S, S, 30, 4, seed=161)
    col = col * (1 + 0.08 * m[..., None])
    fib = pnoise(S, S, 0.6, 5, seed=162) + 0.7 * pnoise(S, S, 5, 0.7, seed=163)
    col = col * (1 + 0.04 * fib[..., None])
    # faint corrugation lines
    corr = 0.5 + 0.5 * np.sin(2 * np.pi * xx / S * 40 + pnoise(S, S, 30, seed=164) * 0.6)
    col = col * (1 - 0.05 * corr[..., None])
    sp = smooth(0.85, 0.98, n01(pnoise(S, S, 1.0, seed=165)))
    col = mix(col, c(110, 80, 50), sp * 0.5)
    st = smooth(0.7, 1.4, fbm(S, S, 60, 3, seed=166))
    col = mix(col, c(130, 100, 64), st * 0.3)
    # tape strip (runs horizontally, wraps in x)
    y0, y1 = 200, 262
    wob = pnoise(S, S, 20, seed=167)
    top = y0 + wob[:, 0][0] * 0  # straight edges with tiny wobble
    ym = (yy - (y0 + 2 * wob)) / (y1 - y0)
    inside = smooth(0, 0.01, ym) * smooth(1.0, 0.99, ym)
    tape = c(184, 152, 106)
    wr = pnoise(S, S, 3, 25, seed=168)
    tcol = tape * (1 + 0.05 * wr[..., None] + 0.03 * pnoise(S, S, 0.8, seed=169)[..., None])
    # glossy highlight along tape and dark edge lines
    hl = np.exp(-((ym - 0.3) ** 2) / 0.01) * 0.12
    tcol = tcol + hl[..., None]
    edge = np.exp(-(ym ** 2) / 0.0004) + np.exp(-((ym - 1) ** 2) / 0.0004)
    tcol = tcol * (1 - 0.18 * np.clip(edge, 0, 1)[..., None])
    # under-tape slightly visible texture
    col = mix(col, tcol * 0.85 + col * 0.15, inside * 0.85)
    save_rgb(col, "cardboard_albedo.png")


def ceiling_tiles(S=1024):
    T = 512
    yy, xx = grid(S)
    lx, ly = xx % T, yy % T
    u, v = lx / T, ly / T
    d_edge = np.minimum.reduce([u, 1 - u, v, 1 - v])
    # embossed height pattern
    h = np.zeros((S, S), np.float32)
    # outer flat border then raised bead, then field with stamped circles
    h += 0.3 * np.exp(-((d_edge - 0.045) ** 2) / (2 * 0.008 ** 2))
    h += 0.2 * np.exp(-((d_edge - 0.095) ** 2) / (2 * 0.005 ** 2))
    # field pattern: grid of circles and diamonds
    g = 7
    fu, fv = (u * g) % 1.0 - 0.5, (v * g) % 1.0 - 0.5
    r = np.sqrt(fu ** 2 + fv ** 2)
    field = smooth(0.02, 0.0, 0.0 + r - 0.3) * 0  # placeholder
    ring = np.exp(-((r - 0.3) ** 2) / (2 * 0.035 ** 2))
    dot = np.exp(-(r ** 2) / (2 * 0.07 ** 2))
    dia = np.exp(-((np.abs(fu) + np.abs(fv) - 0.5) ** 2) / (2 * 0.03 ** 2)) * 0.6
    inner = smooth(0.13, 0.17, d_edge)
    h += (0.18 * ring + 0.25 * dot + 0.1 * dia) * inner
    h = blur_wrap(h, 1.0)
    # lighting from top-left on the height map
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    shade = -(dx + dy) * 22
    col = np.tile(c(214, 206, 188), (S, S, 1))
    col = col * (1 + shade[..., None] * 0.55)
    col = col * (1 + 0.04 * h[..., None] * 3)
    # joint seams between tiles
    seam = smooth(0.012, 0.0, d_edge)
    col = mix(col, c(120, 112, 98), seam * 0.75)
    # stains, rust drips, grime
    s = fbm(S, S, 70, 4, seed=171)
    col = mix(col, c(176, 150, 100), smooth(0.7, 1.5, s) * 0.5)
    ring_s = np.exp(-((s - 1.1) ** 2) / 0.015)
    col = mix(col, c(140, 110, 64), ring_s * 0.2)
    gr = smooth(0.12, 0.0, d_edge) * n01(fbm(S, S, 10, 3, seed=172))
    col = mix(col, c(130, 118, 96), gr * 0.35)
    col = col * (1 + 0.03 * pnoise(S, S, 0.7, seed=173)[..., None])
    col = col * (1 + 0.04 * fbm(S, S, 30, 4, seed=174)[..., None])
    # paint chips / age specks
    sp = smooth(0.93, 0.99, n01(pnoise(S, S, 1.3, seed=175)))
    col = mix(col, c(110, 96, 74), sp * 0.5)
    save_rgb(col, "ceiling_tiles_albedo.png")


def fabric(S=512):
    yy, xx = grid(S)
    P = 8
    ti, tj = (xx // P).astype(int), (yy // P).astype(int)
    u, v = (xx % P) / P, (yy % P) / P
    warp_on_top = ((ti + tj) % 2 == 0)
    # shading across a thread
    wshade = np.sin(np.pi * u)  # vertical thread (warp): varies across x
    fshade = np.sin(np.pi * v)  # horizontal thread (weft)
    sh = np.where(warp_on_top, 0.7 + 0.3 * wshade, 0.7 + 0.3 * fshade)
    # thread-lengthwise subtle shading (ends dip under)
    along = np.where(warp_on_top, np.sin(np.pi * v) ** 0.5, np.sin(np.pi * u) ** 0.5)
    sh = sh * (0.75 + 0.25 * along)
    # per thread tint
    rng = np.random.default_rng(181)
    wt = rng.normal(0, 1, S // P)
    ft = rng.normal(0, 1, S // P)
    tint = np.where(warp_on_top, wt[ti % (S // P)], ft[tj % (S // P)])
    base = c(176, 166, 148)
    col = base * (sh * (1 + 0.04 * tint))[..., None]
    col = col * np.array([1.0, 1.0, 0.97], np.float32)
    fib = pnoise(S, S, 0.6, seed=182)
    col = col * (1 + 0.05 * fib[..., None])
    col = col * (1 + 0.06 * fbm(S, S, 40, 4, seed=183)[..., None])
    wn = smooth(0.6, 0.95, n01(fbm(S, S, 60, 3, seed=184)))
    col = mix(col, c(120, 105, 85), wn * 0.18)
    save_rgb(col, "fabric_albedo.png")


if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or ["concrete", "asphalt", "leather", "metal", "cardboard", "ceiling_tiles", "fabric"]
    for n in names:
        globals()[n]()

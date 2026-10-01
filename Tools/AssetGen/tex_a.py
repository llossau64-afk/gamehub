"""Floor, wood, plaster, wallpaper, brick textures."""
from common import *


def floor_checker(S=1024):
    rng = np.random.default_rng(11)
    T = S // 8
    yy, xx = grid(S)
    ti, tj = (xx // T).astype(int), (yy // T).astype(int)
    par = (ti + tj) % 2
    lx, ly = xx % T, yy % T
    d = np.minimum.reduce([lx + 0.5, T - lx - 0.5, ly + 0.5, T - ly - 0.5])
    cream, black = c(226, 213, 184), c(34, 31, 30)
    base = np.where(par[..., None] == 0, cream, black).astype(np.float32)
    # per tile tint
    tint = rng.normal(0, 1, (8, 8, 3)).astype(np.float32)
    lum = rng.normal(0, 1, (8, 8, 1)).astype(np.float32)
    tt = (tint * 0.012 + lum * 0.035)
    tt = np.repeat(np.repeat(tt, T, 0), T, 1)
    col = base * (1 + tt * np.where(par[..., None] == 0, 1.0, 1.6))
    # per tile gentle gradient (sheen / uneven wear)
    gx = np.repeat(np.repeat(rng.normal(0, 1, (8, 8)), T, 0), T, 1)
    col *= (1 + (0.04 * gx * (lx / T - 0.5))[..., None])
    mott = fbm(S, S, 40, 5, seed=3)
    fine = pnoise(S, S, 0.8, seed=4)
    col *= (1 + 0.05 * mott[..., None] + 0.018 * fine[..., None])
    # big traffic wear: lighter dull zones
    wear = n01(fbm(S, S, 120, 3, seed=7))
    col = np.where(par[..., None] == 0, col * (1 - 0.06 * wear[..., None]), mix(col, c(70, 64, 60), 0.35 * smooth(0.55, 0.9, wear)))
    # dirt near grout
    dn = n01(fbm(S, S, 6, 4, seed=9))
    dirt = np.exp(-d / 9.0) * (0.25 + 1.0 * dn)
    dirt = np.clip(dirt, 0, 1)
    col = np.where(par[..., None] == 0, mix(col, c(95, 78, 55), dirt * 0.55), mix(col, c(80, 72, 62), dirt * 0.30))
    # worn / chipped edges
    chip = smooth(0.62, 0.85, n01(pnoise(S, S, 2.0, seed=12))) * smooth(6, 0.5, d)
    col = np.where(par[..., None] == 0, mix(col, c(150, 130, 100), chip[..., None] * 0.6), mix(col, c(120, 112, 100), chip[..., None] * 0.55))
    # scuffs
    segs = []
    for _ in range(420):
        x, y = rng.uniform(0, S, 2)
        a = rng.normal(0.5, 0.7)
        L = rng.uniform(6, 34)
        segs.append((x, y, x + np.cos(a) * L, y + np.sin(a) * L, rng.uniform(0.3, 1)))
    sc = wrap_lines(S, segs, 1.2, 0.5)
    sc = np.clip(sc, 0, 1) * smooth(0.0, 0.5, n01(pnoise(S, S, 5, seed=15)) + 0.2)
    col = np.where(par[..., None] == 0, mix(col, c(140, 122, 100), sc * 0.35), mix(col, c(120, 115, 108), sc * 0.40))
    # thin scratches
    segs = []
    for _ in range(160):
        x, y = rng.uniform(0, S, 2)
        a = rng.uniform(0, np.pi)
        L = rng.uniform(20, 90)
        segs.append((x, y, x + np.cos(a) * L, y + np.sin(a) * L, rng.uniform(0.4, 1)))
    scr = wrap_lines(S, segs, 0.8, 0.3)
    col = np.where(par[..., None] == 0, mix(col, c(150, 140, 120), scr * 0.25), mix(col, c(150, 148, 145), scr * 0.30))
    # grout
    g = smooth(1.8, 0.4, d)
    gcol = c(46, 40, 34) * (1 + 0.15 * fine[..., None]) * (0.85 + 0.3 * dn[..., None])
    col = mix(col, gcol, g * 0.92)
    # slight overall warm grade
    col = col * np.array([1.02, 1.0, 0.95], np.float32)
    save_rgb(col, "floor_checker_albedo.png")
    # height
    h = np.where(par == 0, 0.0, 0.0).astype(np.float32) + 0.0
    h = 1.0 - g * 1.0
    h += 0.04 * smooth(4, 1.5, d) * 0  # edge bevel handled below
    h -= 0.12 * (1 - smooth(0.5, 4.0, d)) * (1 - g)  # softly rounded edges
    h += 0.025 * fine - 0.06 * sc - 0.08 * scr + 0.03 * mott
    save_rgb(normal_from_height(h, 5.0), "floor_checker_normal.png")


def _planks(S, n_planks, horizontal, seed, base_a, base_b, seam_col, joint_len, wear_amt, ring_freq, grain_contrast):
    """Returns albedo, height. Grain runs along x if horizontal else y (we build in x then transpose)."""
    rng = np.random.default_rng(seed)
    yy, xx = grid(S)
    P = S // n_planks
    pid = (yy // P).astype(int)
    ly = yy % P
    d_seam = np.minimum(ly + 0.5, P - ly - 0.5)
    # per-plank offsets
    off = rng.uniform(0, S, n_planks)
    shade = rng.normal(0, 1, n_planks)
    # butt joints along x: each plank has 1-2 joints
    joint_x = [np.sort(rng.uniform(0, S, 2 if joint_len > 0 else 1)) for _ in range(n_planks)]
    seg = np.zeros((S, S), np.float32)  # segment id for per-board variation
    jd = np.full((S, S), 999.0, np.float32)
    segshade = np.zeros((S, S), np.float32)
    for p in range(n_planks):
        rows = slice(p * P, (p + 1) * P)
        jx = joint_x[p]
        for k, j in enumerate(jx):
            dd = np.abs(((xx[rows] - j + S / 2) % S) - S / 2)
            jd[rows] = np.minimum(jd[rows], dd)
        # segment shade by region between joints
        cuts = np.concatenate([jx, [jx[0] + S]])
        xs = xx[rows]
        xs2 = (xs - jx[0]) % S
        sid = np.zeros_like(xs2, dtype=int)
        for k in range(1, len(jx)):
            sid += (xs2 >= (jx[k] - jx[0]) % S)
        vals = rng.normal(0, 1, len(jx))
        segshade[rows] = vals[sid]
        off[p] += 137 * 0
    warp = fbm(S, S, 60, 3, seed=seed + 1) * 7
    warp2 = fbm(S, S, 14, 3, seed=seed + 2, aniso=4) * 1.5
    # grain: lines along x, plus rings
    yoff = (yy + warp + warp2 + np.take(off, pid) * 0.37)
    rings = 0.5 + 0.5 * np.sin(yoff * ring_freq + fbm(S, S, 25, 3, seed=seed + 3, aniso=6) * 1.6)
    streak = n01(0.6 * pnoise(S, S, 1.0, 40, seed + 4) + 0.4 * pnoise(S, S, 2.5, 90, seed + 14))
    fine = n01(pnoise(S, S, 0.7, 12, seed + 5))
    pores = smooth(0.78, 0.92, n01(pnoise(S, S, 0.9, 7, seed + 6)))
    t = 0.25 * rings + 0.5 * streak + 0.25 * fine
    t = np.clip((t - 0.5) * grain_contrast + 0.5, 0, 1)
    col = mix(base_a, base_b, t)
    pl = np.take(shade, pid) * 0.05 + segshade * 0.045
    col = col * (1 + pl[..., None])
    col *= (1 - 0.35 * pores[..., None] * 0.5)
    # seams
    sm = smooth(1.6, 0.3, d_seam)
    jm = smooth(1.4, 0.2, jd) * (joint_len > 0)
    seam = np.maximum(sm, jm)
    # grime in seams
    gr = smooth(6, 0, d_seam) * n01(fbm(S, S, 8, 3, seed + 8))
    col = mix(col, seam_col * 1.5, gr * 0.35)
    # wear patches
    wn = smooth(0.55, 0.9, n01(fbm(S, S, 100, 3, seed + 9)))
    col = mix(col, col * 1.12 + 0.02, wn * wear_amt)
    st = smooth(0.7, 0.95, n01(fbm(S, S, 70, 3, seed + 10)))
    col = mix(col, col * 0.8, st * 0.25)
    col = mix(col, seam_col, seam * 0.95)
    h = 1 - seam * 1.0 + 0.08 * streak + 0.1 * rings - 0.15 * pores
    return col, h


def wood_dark(S=1024):
    col, h = _planks(S, 4, True, 21, c(52, 31, 20), c(104, 66, 42), c(14, 9, 6), 1, 0.25, 0.8, 1.5)
    # vertical polish: subtle sheen band
    sheen = n01(fbm(S, S, 80, 2, seed=29, aniso=3))
    col = col * (0.94 + 0.12 * sheen[..., None])
    save_rgb(col, "wood_dark_albedo.png")
    save_rgb(normal_from_height(h, 3.0), "wood_dark_normal.png")


def wood_floor(S=1024):
    col, h = _planks(S, 8, True, 41, c(112, 78, 46), c(170, 124, 76), c(30, 20, 12), 1, 0.5, 0.6, 1.3)
    # transposed so grain runs vertically? keep horizontal boards (runs along x) for simple tiling
    # dirt
    dn = n01(fbm(S, S, 30, 4, seed=47))
    col = mix(col, c(60, 44, 28), smooth(0.6, 0.95, dn) * 0.15)
    save_rgb(col * np.array([1.0, 0.98, 0.94], np.float32), "wood_floor_albedo.png")


def plaster(S=1024):
    col = np.tile(c(218, 203, 172), (S, S, 1))
    m = fbm(S, S, 60, 5, seed=61)
    col = col * (1 + 0.035 * m[..., None])
    trowel = fbm(S, S, 18, 3, seed=62, aniso=2.5)
    col = col * (1 + 0.02 * trowel[..., None])
    # water stains: rings
    s = fbm(S, S, 90, 4, seed=63)
    st = smooth(0.7, 1.4, s)
    rim = smooth(0.0, 0.25, 1 - np.abs(s - 0.75) / 0.15) * 0.0
    ring = np.exp(-((s - 0.95) ** 2) / 0.012) * (s > 0.5)
    col = mix(col, c(168, 140, 94), st * 0.38)
    col = mix(col, c(130, 102, 62), ring * 0.28)
    # vertical grime streaks
    stk = n01(pnoise(S, S, 40, 2.5, 64) * 0.6 + pnoise(S, S, 12, 1.5, 65) * 0.4)
    col = mix(col, c(120, 105, 85), smooth(0.62, 1.0, stk) * 0.10)
    # large soft gradient darkening
    g = n01(fbm(S, S, 200, 2, seed=66))
    col = col * (0.93 + 0.1 * g[..., None])
    # fine grain & pits
    f = pnoise(S, S, 0.7, seed=67)
    col = col * (1 + 0.025 * f[..., None])
    pits = smooth(0.9, 0.99, n01(pnoise(S, S, 1.2, seed=68)))
    col = mix(col, col * 0.7, pits * 0.5)
    # fine cracks
    rng = np.random.default_rng(69)
    segs = []
    for _ in range(5):
        x, y = rng.uniform(0, S, 2)
        for k in range(rng.integers(8, 18)):
            a = rng.normal(1.1, 0.5)
            L = rng.uniform(10, 30)
            nx, ny = x + np.cos(a) * L, y + np.sin(a) * L
            segs.append((x, y, nx, ny, 1.0))
            x, y = nx, ny
    cr = wrap_lines(S, segs, 1.0, 0.4)
    col = mix(col, c(90, 78, 60), np.clip(cr, 0, 1) * 0.45)
    save_rgb(col * np.array([1.0, 0.99, 0.96], np.float32), "plaster_wall_albedo.png")


def wallpaper(S=1024):
    yy, xx = grid(S)
    P = S // 16  # stripe period 64
    u = (xx % P) / P
    v = yy
    base = c(128, 144, 116)
    light = c(156, 170, 136)
    # wide stripe with a damask diamond motif, narrow rule lines
    rule = np.exp(-((u - 0.5) ** 2) / (2 * 0.012 ** 2))
    rule2 = np.exp(-((u - 0.07) ** 2) / (2 * 0.008 ** 2)) + np.exp(-((u - 0.93) ** 2) / (2 * 0.008 ** 2))
    # diamond chain along stripe
    pv = 128.0
    vy = ((yy % pv) / pv - 0.5) * 2
    ux = (u - 0.5) * 2
    dia = 1 - (np.abs(ux * 2.6) + np.abs(vy * 1.0))
    motif = smooth(0.0, 0.12, dia) * (1 - smooth(0.3, 0.45, dia))
    dot = smooth(0.25, 0.1, np.sqrt((ux * 2.6) ** 2 + (np.abs(vy) - 1.0) ** 2) * 1.0)
    inner = smooth(0.35, 0.28, np.sqrt((ux * 3.2) ** 2 + (vy * 1.1) ** 2))
    pat = np.clip(motif * 0.9 + dot * 0.7 + inner * 0.9, 0, 1)
    alt = ((xx // P) % 2)
    col = mix(base, light, 0.8 * (1 - alt) * 0 + 0.0) if False else mix(base, light, 0.7 * (u > 0.14) * (u < 0.86))
    col = mix(col, c(190, 205, 165), np.clip(rule, 0, 1) * 0.7)
    col = mix(col, c(120, 140, 105), np.clip(rule2, 0, 1) * 0.5)
    col = mix(col, c(100, 118, 92), pat * 0.7)
    # paper fibre & fading
    f = pnoise(S, S, 0.7, seed=81)
    fiber = pnoise(S, S, 0.6, 3.0, seed=82)
    col = col * (1 + 0.025 * f[..., None] + 0.02 * fiber[..., None])
    fade = n01(fbm(S, S, 80, 4, seed=83))
    col = mix(col, c(172, 170, 140), smooth(0.5, 0.95, fade) * 0.4)
    # yellowing
    yel = n01(fbm(S, S, 140, 3, seed=84))
    col = col * np.array([1.0, 0.97, 0.86], np.float32) * (0.95 + 0.08 * yel[..., None])
    # water stains and grime streaks
    s = fbm(S, S, 80, 4, seed=85)
    col = mix(col, c(150, 125, 70), smooth(0.9, 1.5, s) * 0.35)
    stk = n01(pnoise(S, S, 30, 1.8, 86))
    col = mix(col, c(95, 90, 70), smooth(0.6, 0.95, stk) * 0.2)
    save_rgb(col, "wallpaper_albedo.png")


def brick(S=1024):
    rng = np.random.default_rng(91)
    rows, per = 16, 8
    bh, bw = S // rows, S // per
    yy, xx = grid(S)
    # warp coordinates a bit for hand-laid feel
    wx = xx + pnoise(S, S, 20, seed=92) * 1.2
    wy = yy + pnoise(S, S, 20, seed=93) * 1.0
    r = (wy // bh).astype(int) % rows
    off = (r % 2) * (bw / 2)
    cx = (wx + off) % S
    ci = (cx // bw).astype(int) % per
    lx, ly = cx % bw, wy % bh
    mortar_h, mortar_v = 7.0, 7.0
    dx = np.minimum(lx, bw - lx)
    dy = np.minimum(ly, bh - ly)
    # inside brick distance (negative into brick)
    d = np.minimum(dx - mortar_v / 2, dy - mortar_h / 2)
    brick_mask = smooth(-0.5, 1.5, d)
    cid = r * per + ci
    tint = rng.normal(0, 1, (rows * per, 3)).astype(np.float32)
    lumv = rng.normal(0, 1, rows * per).astype(np.float32)
    burnt = rng.random(rows * per) < 0.12
    base = c(104, 46, 38)
    dark = c(58, 30, 27)
    bc = base[None, :] * (1 + tint * 0.04 + lumv[:, None] * 0.12)
    bc = np.where(burnt[:, None], dark[None, :] * (1 + lumv[:, None] * 0.1), bc)
    col = bc[cid]
    tex = fbm(S, S, 6, 4, seed=94)
    tex2 = pnoise(S, S, 0.8, seed=95)
    col = col * (1 + 0.1 * tex[..., None] + 0.04 * tex2[..., None])
    # sooty variation / efflorescence
    soot = n01(fbm(S, S, 90, 4, seed=96))
    col = mix(col, col * 0.5, smooth(0.5, 0.95, soot) * 0.6)
    ef = smooth(0.75, 0.95, n01(fbm(S, S, 25, 4, seed=97)))
    col = mix(col, c(175, 160, 140), ef * 0.12)
    # pits
    pits = smooth(0.92, 0.99, n01(pnoise(S, S, 1.3, seed=98)))
    col = col * (1 - 0.35 * pits[..., None])
    # mortar
    mcol = c(122, 114, 100) * (1 + 0.12 * pnoise(S, S, 0.8, seed=99)[..., None] + 0.08 * fbm(S, S, 10, 3, seed=100)[..., None])
    mcol = mix(mcol, c(80, 72, 62), smooth(0.5, 0.95, soot) * 0.5)
    # ambient occlusion at brick edges inside mortar
    ao = smooth(5.0, 0.0, -d) * (1 - brick_mask)
    mcol = mcol * (1 - 0.35 * ao[..., None])
    col = mix(mcol, col, brick_mask)
    # edge darkening on bricks
    col = col * (1 - 0.15 * smooth(3, 0, d)[..., None] * brick_mask[..., None])
    # chipped corners
    save_rgb(col, "brick_albedo.png")
    h = brick_mask * 0.7 + 0.1 * tex + 0.03 * tex2 - 0.1 * pits
    h = h + 0.15 * smooth(0, 4, d) * brick_mask
    save_rgb(normal_from_height(h, 7.0), "brick_normal.png")


if __name__ == "__main__":
    import sys
    names = sys.argv[1:] or ["floor_checker", "wood_dark", "wood_floor", "plaster", "wallpaper", "brick"]
    for n in names:
        globals()[n]()

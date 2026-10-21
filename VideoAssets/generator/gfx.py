"""Drawing helpers: easing, sticker-style shapes with outline + hard shadow (keys cleanly on chroma)."""
import math
import cairo
import numpy as np

# Palette. No greens/blues on green screen, no blues on blue screen.
DARK = (0.09, 0.09, 0.15)
WHITE = (1, 1, 1)
OFFWHITE = (0.96, 0.96, 0.98)
GREY = (0.62, 0.64, 0.7)
LIGHTGREY = (0.85, 0.86, 0.9)
YELLOW = (1.0, 0.83, 0.12)
ORANGE = (1.0, 0.52, 0.08)
RED = (0.98, 0.18, 0.22)
DARKRED = (0.65, 0.06, 0.1)
PINK = (1.0, 0.32, 0.62)
PURPLE = (0.58, 0.32, 0.98)
BLUE = (0.18, 0.48, 1.0)
CYAN = (0.1, 0.85, 1.0)
GREEN = (0.13, 0.8, 0.32)
DARKGREEN = (0.05, 0.5, 0.18)
GOLD = (1.0, 0.78, 0.1)
GOLD_D = (0.86, 0.52, 0.02)
GOLD_L = (1.0, 0.92, 0.45)
BROWN = (0.78, 0.55, 0.28)
BG = {"green": (0, 1, 0), "blue": (0, 0, 1)}

FONT = "Inter Black"
OUT_W = 13  # default outline width
SHADOW = (9, 11)


# ------------------------------------------------------------------ easing

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, t0, dur):
    return clamp((t - t0) / dur) if dur > 0 else float(t >= t0)


def lerp(a, b, k):
    return a + (b - a) * k


def ease_out_cubic(k):
    return 1 - (1 - k) ** 3


def ease_in_cubic(k):
    return k ** 3


def ease_in_out(k):
    return 4 * k ** 3 if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2


def ease_out_back(k, s=1.9):
    k -= 1
    return k * k * ((s + 1) * k + s) + 1


def ease_in_back(k, s=1.7):
    return k * k * ((s + 1) * k - s)


def ease_out_elastic(k):
    if k <= 0 or k >= 1:
        return float(k >= 1)
    return 2 ** (-10 * k) * math.sin((k * 10 - 0.75) * (2 * math.pi) / 3) + 1


def pop_in(t, t0=0.0, dur=0.4, s=1.9):
    return ease_out_back(prog(t, t0, dur), s) if t >= t0 else 0.0


def pop_out(t, t0, dur=0.3):
    if t < t0:
        return 1.0
    return max(0.0, 1 - ease_in_back(prog(t, t0, dur)))


def pop_life(t, dur, t_in=0.0, d_in=0.4, d_out=0.3):
    """Scale for an element that pops in at t_in and pops out at the end of the clip."""
    return pop_in(t, t_in, d_in) * pop_out(t, dur - d_out - 0.05, d_out)


def wobble(t, amp=0.06, freq=1.6, phase=0.0):
    return 1 + amp * math.sin(2 * math.pi * freq * t + phase)


def mix(c1, c2, k):
    return tuple(lerp(a, b, k) for a, b in zip(c1, c2))


def shade(c, k):
    """k<0 darker, k>0 lighter."""
    return mix(c, (0, 0, 0), -k) if k < 0 else mix(c, (1, 1, 1), k)


# -------------------------------------------------------------- primitives

class Xf:
    """with Xf(c, x, y, s, rot): draw centred at origin."""

    def __init__(self, c, x=0, y=0, s=1.0, rot=0.0, sx=None, sy=None):
        self.c, self.a = c, (x, y, s, rot, sx, sy)

    def __enter__(self):
        x, y, s, rot, sx, sy = self.a
        self.c.save()
        self.c.translate(x, y)
        self.c.rotate(rot)
        ax = s * (sx if sx is not None else 1)
        ay = s * (sy if sy is not None else 1)
        self.c.scale(ax if abs(ax) > 1e-4 else 1e-4, ay if abs(ay) > 1e-4 else 1e-4)
        return self.c

    def __exit__(self, *e):
        self.c.restore()


def sticker(c, path, fill, lw=OUT_W, shadow=SHADOW, outline=DARK):
    """Fill `path` (callable drawing a path) with outline and a hard drop shadow."""
    if shadow:
        c.save()
        c.translate(*shadow)
        path(c)
        c.set_source_rgb(*outline)
        c.fill_preserve()
        c.set_line_width(lw)
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        c.stroke()
        c.restore()
    path(c)
    c.set_source_rgb(*fill)
    c.fill_preserve()
    if lw:
        c.set_source_rgb(*outline)
        c.set_line_width(lw)
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        c.stroke()
    else:
        c.new_path()


def fill(c, path, color):
    path(c)
    c.set_source_rgb(*color)
    c.fill()


def stroke(c, path, color, lw, cap=cairo.LINE_CAP_ROUND):
    path(c)
    c.set_source_rgb(*color)
    c.set_line_width(lw)
    c.set_line_cap(cap)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    c.stroke()


def rrect(x, y, w, h, r):
    def p(c):
        c.new_sub_path()
        c.arc(x + w - r, y + r, r, -math.pi / 2, 0)
        c.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
        c.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
        c.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
        c.close_path()
    return p


def circle(x, y, r):
    def p(c):
        c.new_sub_path()
        c.arc(x, y, r, 0, 2 * math.pi)
        c.close_path()
    return p


def ellipse(x, y, rx, ry):
    def p(c):
        c.save()
        c.translate(x, y)
        c.scale(rx, ry)
        c.new_sub_path()
        c.arc(0, 0, 1, 0, 2 * math.pi)
        c.close_path()
        c.restore()
    return p


def poly(pts, closed=True):
    def p(c):
        c.move_to(*pts[0])
        for q in pts[1:]:
            c.line_to(*q)
        if closed:
            c.close_path()
    return p


def ring(c, x, y, r, color, lw):
    stroke(c, circle(x, y, r), color, lw)


def arrow_pts(length=420, shaft=110, head=230, head_len=190):
    """Arrow pointing +x, centred on origin."""
    x0, x1 = -length / 2, length / 2
    xh = x1 - head_len
    return [(x0, -shaft / 2), (xh, -shaft / 2), (xh, -head / 2), (x1, 0), (xh, head / 2), (xh, shaft / 2), (x0, shaft / 2)]


def star_pts(n, r_out, r_in, rot=-math.pi / 2, jitter=0.0, seed=0):
    r = np.random.default_rng(seed)
    pts = []
    for i in range(n * 2):
        rr = r_out if i % 2 == 0 else r_in
        if jitter:
            rr *= 1 + r.uniform(-jitter, jitter)
        a = rot + i * math.pi / n
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


def heart(s=1.0):
    def p(c):
        c.move_to(0, 0.35 * s)
        c.curve_to(-0.15 * s, 0.22 * s, -0.55 * s, -0.02 * s, -0.5 * s, -0.28 * s)
        c.curve_to(-0.45 * s, -0.55 * s, -0.08 * s, -0.6 * s, 0, -0.3 * s)
        c.curve_to(0.08 * s, -0.6 * s, 0.45 * s, -0.55 * s, 0.5 * s, -0.28 * s)
        c.curve_to(0.55 * s, -0.02 * s, 0.15 * s, 0.22 * s, 0, 0.35 * s)
        c.close_path()
    return p


def polyline_partial(pts, k):
    """First fraction k (0..1) of a polyline by arc length."""
    pts = np.asarray(pts, float)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    total = seg.sum()
    target = total * clamp(k)
    out = [tuple(pts[0])]
    acc = 0.0
    for i, L in enumerate(seg):
        if acc + L >= target:
            f = (target - acc) / L if L else 0
            out.append(tuple(pts[i] + (pts[i + 1] - pts[i]) * f))
            return out
        out.append(tuple(pts[i + 1]))
        acc += L
    return out


def bezier_pts(p0, p1, p2, p3, n=80):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.asarray, (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def marker(c, pts, color, lw=26, under=WHITE, under_extra=14):
    """Hand-drawn marker stroke with a contrasting underlay so it reads on any footage."""
    if len(pts) < 2:
        return
    if under:
        stroke(c, poly(pts, False), under, lw + under_extra)
    stroke(c, poly(pts, False), color, lw)


# --------------------------------------------------------------------- text

def text_path(c, s, size, x=0, y=0, anchor="c"):
    c.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    c.set_font_size(size)
    e = c.text_extents(s)
    if anchor == "c":
        tx = x - e.x_bearing - e.width / 2
    elif anchor == "l":
        tx = x - e.x_bearing
    else:
        tx = x - e.x_bearing - e.width
    ty = y - e.y_bearing - e.height / 2

    def p(cc):
        cc.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cc.set_font_size(size)
        cc.move_to(tx, ty)
        cc.text_path(s)
    return p, e


def text_sticker(c, s, size, color=WHITE, x=0, y=0, outline=DARK, lw=None, shadow=True, anchor="c"):
    lw = lw if lw is not None else max(6, size * 0.12)
    p, e = text_path(c, s, size, x, y, anchor)
    if shadow:
        c.save()
        c.translate(size * 0.05, size * 0.07)
        p(c)
        c.set_source_rgb(*outline)
        c.set_line_width(lw * 2)
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        c.stroke_preserve()
        c.fill()
        c.restore()
    p(c)
    c.set_source_rgb(*outline)
    c.set_line_width(lw * 2)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    c.stroke()
    p(c)
    c.set_source_rgb(*color)
    c.fill()
    return e


def text_plain(c, s, size, color, x=0, y=0, anchor="c"):
    p, e = text_path(c, s, size, x, y, anchor)
    p(c)
    c.set_source_rgb(*color)
    c.fill()
    return e


# ------------------------------------------------------------------ objects

def burst(c, r_out, r_in, n=14, color=YELLOW, rot=0.0, seed=1, jitter=0.15, lw=OUT_W):
    sticker(c, poly(star_pts(n, r_out, r_in, rot, jitter, seed)), color, lw)


def rays(c, n, r0, r1, color, width, rot=0.0):
    for i in range(n):
        a = rot + i * 2 * math.pi / n
        stroke(c, poly([(r0 * math.cos(a), r0 * math.sin(a)), (r1 * math.cos(a), r1 * math.sin(a))], False), color, width)


def burst_lines(c, k, n=10, r0=180, r1=330, color=WHITE, width=16, rot=0.0, outline=DARK):
    """Comic 'impact' lines flying outward; k = 0..1 progress."""
    if k <= 0 or k >= 1:
        return
    a0 = lerp(r0, r1, ease_out_cubic(k))
    a1 = lerp(r0, r1, ease_out_cubic(clamp(k * 1.6)))
    if a1 - a0 < 2:
        return
    for i in range(n):
        a = rot + i * 2 * math.pi / n
        seg = [(a0 * math.cos(a), a0 * math.sin(a)), (a1 * math.cos(a), a1 * math.sin(a))]
        if outline:
            stroke(c, poly(seg, False), outline, width + 10)
        stroke(c, poly(seg, False), color, width)


def cursor(c, x, y, s=1.0, press=0.0):
    pts = [(0, 0), (0, 36), (8.5, 28), (14.5, 41), (20, 38.5), (14, 26), (25.5, 25.5)]
    with Xf(c, x, y, s * 8.0 * (1 - 0.12 * press)):
        sticker(c, poly(pts), WHITE, lw=2.6, shadow=(1.6, 2))


def touch_dot(c, x, y, s=1.0, press=0.0, color=WHITE):
    with Xf(c, x, y, 1.7 * s * (1 - 0.15 * press)):
        sticker(c, circle(0, 0, 62), color, lw=10, shadow=(6, 8))
        fill(c, circle(0, 0, 34), LIGHTGREY)


def ripple(c, x, y, k, r0=60, r1=220, color=WHITE, lw0=22):
    if 0 < k < 1:
        r = lerp(r0, r1, ease_out_cubic(k))
        lw = lw0 * (1 - k)
        if lw > 1:
            ring(c, x, y, r, DARK, lw + 8)
            ring(c, x, y, r, color, lw)


def document(c, w=300, h=380, color=WHITE, lines=True, accent=PURPLE):
    fold = 70

    def p(cc):
        cc.move_to(-w / 2, -h / 2)
        cc.line_to(w / 2 - fold, -h / 2)
        cc.line_to(w / 2, -h / 2 + fold)
        cc.line_to(w / 2, h / 2)
        cc.line_to(-w / 2, h / 2)
        cc.close_path()
    sticker(c, p, color)
    sticker(c, poly([(w / 2 - fold, -h / 2), (w / 2 - fold, -h / 2 + fold), (w / 2, -h / 2 + fold)]), LIGHTGREY, lw=9, shadow=None)
    if lines:
        fill(c, rrect(-w / 2 + 40, -h / 2 + 50, 120, 70, 10), accent)
        for i in range(5):
            ww = (w - 80) * (0.95 if i % 3 else 0.7)
            fill(c, rrect(-w / 2 + 40, -h / 2 + 150 + i * 42, ww, 18, 9), GREY)


def folder_back(c, w=560, h=400, color=ORANGE):
    tab = rrect(-w / 2, -h / 2 - 50, w * 0.42, 110, 22)
    sticker(c, lambda cc: (tab(cc), rrect(-w / 2, -h / 2, w, h, 28)(cc)), shade(color, -0.12))


def folder_front(c, w=560, h=400, color=ORANGE, open_k=0.0):
    """Front flap hinged at the bottom; open_k 0 closed .. 1 fully tilted forward."""
    sy = 1 - 0.55 * open_k
    skew = 0.35 * open_k
    c.save()
    c.translate(0, h / 2)
    c.transform(cairo.Matrix(1, 0, -skew * 0.0, sy, 0, 0))
    top = -h * 0.86
    pts = [(-w / 2 - 30 * open_k, top), (w / 2 + 30 * open_k, top), (w / 2, 0), (-w / 2, 0)]
    sticker(c, poly(pts), color, shadow=None)
    c.restore()


def window(c, w=760, h=540, title=DARK, k_content=1.0):
    sticker(c, rrect(-w / 2, -h / 2, w, h, 34), WHITE)
    c.save()
    rrect(-w / 2, -h / 2, w, h, 34)(c)
    c.clip()
    fill(c, rrect(-w / 2 - 5, -h / 2 - 5, w + 10, 95, 0), title)
    c.restore()
    for i, col in enumerate((RED, YELLOW, ORANGE)):
        fill(c, circle(-w / 2 + 52 + i * 52, -h / 2 + 45, 15), col)
    if k_content > 0:
        n = int(1 + 5 * k_content)
        fill(c, rrect(-w / 2 + 45, -h / 2 + 135, 230 * min(1, k_content * 2), 180, 18), PURPLE)
        for i in range(min(n, 5)):
            fill(c, rrect(-w / 2 + 310, -h / 2 + 140 + i * 40, (w - 360) * (0.9 if i % 2 else 0.65), 20, 10), LIGHTGREY)
        fill(c, rrect(-w / 2 + 45, h / 2 - 130, w - 90, 22, 11), LIGHTGREY)
        fill(c, rrect(-w / 2 + 45, h / 2 - 85, (w - 90) * 0.6, 22, 11), LIGHTGREY)


def bell_icon(c, s=1.0, color=YELLOW):
    def body(cc):
        cc.move_to(-150, 110)
        cc.curve_to(-110, 70, -120, 20, -115, -30)
        cc.curve_to(-110, -120, -60, -160, 0, -160)
        cc.curve_to(60, -160, 110, -120, 115, -30)
        cc.curve_to(120, 20, 110, 70, 150, 110)
        cc.close_path()
    with Xf(c, 0, 0, s):
        sticker(c, circle(0, 140, 40), color)
        sticker(c, circle(0, -170, 26), color)
        sticker(c, body, color)
        sticker(c, rrect(-165, 98, 330, 40, 20), shade(color, -0.15), shadow=None)


def coin(c, r=170, spin=1.0, symbol="€"):
    """spin = horizontal scale (cos of rotation); sign selects face."""
    sx = max(abs(spin), 0.06)
    c.save()
    c.scale(sx, 1)
    sticker(c, circle(0, 0, r), GOLD_D, lw=OUT_W / sx if sx > 0.2 else OUT_W)
    fill(c, circle(0, 0, r * 0.82), GOLD)
    stroke(c, circle(0, 0, r * 0.82), GOLD_D, 10)
    fill(c, ellipse(-r * 0.32, -r * 0.38, r * 0.18, r * 0.1), GOLD_L)
    text_plain(c, symbol, r * 1.0, GOLD_D, 6, 6)
    text_plain(c, symbol, r * 1.0, GOLD_L, 0, 0)
    c.restore()


def banknote(c, w=380, h=190, symbol="€", value="100"):
    col = (0.36, 0.78, 0.42)
    sticker(c, rrect(-w / 2, -h / 2, w, h, 16), col, lw=10, shadow=(6, 8))
    stroke(c, rrect(-w / 2 + 18, -h / 2 + 18, w - 36, h - 36, 10), shade(col, -0.35), 6)
    fill(c, ellipse(0, 0, h * 0.36, h * 0.36), shade(col, 0.35))
    text_plain(c, symbol, h * 0.5, shade(col, -0.5), 0, 0)
    text_plain(c, value, h * 0.2, shade(col, -0.45), -w / 2 + 70, -h / 2 + 48)
    text_plain(c, value, h * 0.2, shade(col, -0.45), w / 2 - 70, h / 2 - 48)


def magnifier(c, sign="+"):
    with Xf(c, 120, 120, 1, math.pi / 4):
        sticker(c, rrect(40, -45, 260, 90, 45), DARK, lw=0)
        sticker(c, rrect(55, -32, 230, 64, 32), PURPLE)
    sticker(c, circle(0, 0, 200), DARK)
    fill(c, circle(0, 0, 160), OFFWHITE)
    fill(c, ellipse(-60, -70, 50, 28), WHITE)
    stroke(c, poly([(-80, 0), (80, 0)], False), DARK, 42)
    if sign == "+":
        stroke(c, poly([(0, -80), (0, 80)], False), DARK, 42)


def lamp(c, color, on=1.0, r=300, t=0.0, rays_on=True):
    lit = mix(shade(color, -0.65), color, on)
    if rays_on and on > 0.05:
        n = 16
        ln = lerp(r * 1.08, r * 1.5, on) * (1 + 0.05 * math.sin(t * 12))
        for i in range(n):
            a = t * 0.6 + i * 2 * math.pi / n
            p0 = (r * 1.06 * math.cos(a), r * 1.06 * math.sin(a))
            p1 = (ln * math.cos(a), ln * math.sin(a))
            stroke(c, poly([p0, p1], False), DARK, 46)
            stroke(c, poly([p0, p1], False), shade(color, 0.35), 26)
    sticker(c, circle(0, 0, r), DARK)
    fill(c, circle(0, 0, r * 0.84), lit)
    if on > 0.05:
        fill(c, circle(0, 0, r * 0.62), mix(lit, shade(color, 0.3), on))
        fill(c, circle(0, 0, r * 0.38), mix(lit, shade(color, 0.6), on))
    fill(c, ellipse(-r * 0.36, -r * 0.4, r * 0.2, r * 0.11), mix(shade(lit, 0.3), WHITE, on))


def checkmark_pts(s=1.0):
    return [(-0.42 * s, 0.02 * s), (-0.12 * s, 0.3 * s), (0.45 * s, -0.3 * s)]


def confetti_piece(c, x, y, rot, flip, color, w=26, h=14):
    with Xf(c, x, y, 1, rot, sx=max(abs(flip), 0.15)):
        fill(c, rrect(-w / 2, -h / 2, w, h, 3), color)

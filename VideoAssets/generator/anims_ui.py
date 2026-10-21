"""Arrows, markers, touch/cursor gestures, files, windows, UI icons."""
import math
import numpy as np
from gfx import *  # noqa: F401,F403

ANIMS = {}
SQ = (1080, 1080)
VERT = (1080, 1920)


def anim(name, cat, label, dur, sfx=(), bg="green", size=SQ, poster=0.5):
    """sfx: list of (sound_name, time[, gain])."""
    def deco(fn):
        ANIMS[name] = dict(cat=cat, label=label, dur=dur, sfx=list(sfx), bg=bg, size=size, poster=poster, fn=fn)
        return fn
    return deco


# --------------------------------------------------------------------- Pfeile

def _arrow_anim(direction, sound):
    ang = {"rechts": 0, "unten": math.pi / 2, "links": math.pi, "oben": -math.pi / 2}[direction]
    dur = 2.6

    def fn(c, t, W, H):
        ux, uy = math.cos(ang), math.sin(ang)
        k_in = ease_out_back(prog(t, 0.0, 0.45), 1.4)
        k_out = ease_in_back(prog(t, dur - 0.45, 0.4), 1.5)
        off = (1 - k_in) * -900 + k_out * 1000
        bob = 40 * math.sin(2 * math.pi * 1.8 * max(0, t - 0.45)) * (t > 0.45) * (1 - prog(t, dur - 0.5, 0.1))
        d = off + bob
        squash = 1 + 0.1 * math.sin(2 * math.pi * 1.8 * max(0, t - 0.45))
        with Xf(c, W / 2 + ux * d, H / 2 + uy * d, 1.25, ang, sx=squash, sy=1 / squash):
            sticker(c, poly(arrow_pts(460, 120, 270, 210)), YELLOW)
            stroke(c, poly([(-200, -30), (20, -30)], False), shade(YELLOW, 0.55), 14)
        # speed streaks during entry
        ke = prog(t, 0.0, 0.45)
        if 0.05 < ke < 1:
            for i, o in enumerate((-110, 0, 110)):
                L = 260 * (1 - ke)
                base = d - 300 - 60 * i
                px, py = -uy * o, ux * o
                seg = [(W / 2 + ux * base + px, H / 2 + uy * base + py), (W / 2 + ux * (base - L) + px, H / 2 + uy * (base - L) + py)]
                stroke(c, poly(seg, False), DARK, 30)
                stroke(c, poly(seg, False), WHITE, 16)
    return fn, dur


for _d, _s in (("rechts", "swoosh_rechts"), ("links", "swoosh_links"), ("oben", "swoosh_hoch"), ("unten", "swoosh_runter")):
    _fn, _dur = _arrow_anim(_d, _s)
    anim(f"pfeil_{_d}", "Pfeile & Markierungen", f"Pfeil nach {_d}", _dur,
         sfx=[(_s, 0.0), ("pop", 0.38, 0.6)], poster=0.8)(_fn)


@anim("pfeil_gezeichnet", "Pfeile & Markierungen", "Pfeil von Hand gezeichnet", 2.5, sfx=[("wischen", 0.05), ("wischen", 0.75, 0.6), ("pop", 0.95, 0.5)], poster=0.9)
def _(c, t, W, H):
    pts = bezier_pts((220, 860), (220, 450), (520, 330), (800, 330))
    k = ease_in_out(prog(t, 0.05, 0.7))
    s = pop_out(t, 2.1, 0.3)
    with Xf(c, W / 2, H / 2, s):
        c.translate(-W / 2, -H / 2)
        marker(c, polyline_partial(pts, k), RED, 34)
        kh = ease_out_back(prog(t, 0.75, 0.25))
        if kh > 0:
            tip = np.array((800, 330))
            for dx, dy in ((-130, -95), (-130, 95)):
                p1 = tip + np.array((dx, dy)) * kh
                marker(c, [tuple(p1), tuple(tip)], RED, 34)


@anim("kreis_markieren", "Pfeile & Markierungen", "Kreis markieren (Marker)", 2.5, sfx=[("wischen", 0.05), ("wischen", 0.4, 0.6)], poster=0.95)
def _(c, t, W, H):
    k = ease_in_out(prog(t, 0.05, 0.8))
    a = np.linspace(0, 2 * math.pi * 1.12, 200)
    rx = 380 + 14 * np.sin(a * 3)
    ry = 260 + 10 * np.cos(a * 2)
    grow = 1 + 0.06 * a / a[-1]
    pts = np.stack([W / 2 + rx * grow * np.cos(a - 2.3), H / 2 + ry * grow * np.sin(a - 2.3)], 1)
    s = pop_out(t, 2.1, 0.3)
    with Xf(c, W / 2, H / 2, s, -0.08):
        c.translate(-W / 2, -H / 2)
        marker(c, polyline_partial(pts, k), RED, 30)


@anim("unterstreichen", "Pfeile & Markierungen", "Unterstreichen (Marker)", 2.2, sfx=[("wischen", 0.05)], poster=0.9)
def _(c, t, W, H):
    x = np.linspace(170, 910, 120)
    y = H / 2 + 12 * np.sin((x - 170) / 60) + (x - 170) * -0.04
    k = ease_out_cubic(prog(t, 0.05, 0.45))
    s = pop_out(t, 1.8, 0.3)
    with Xf(c, W / 2, H / 2, s):
        c.translate(-W / 2, -H / 2)
        marker(c, polyline_partial(list(zip(x, y)), k), YELLOW, 40, DARK, 16)
        x2 = np.linspace(260, 830, 80)
        y2 = H / 2 + 70 + 8 * np.sin(x2 / 50)
        marker(c, polyline_partial(list(zip(x2, y2)), ease_out_cubic(prog(t, 0.4, 0.4))), YELLOW, 40, DARK, 16)


def _chevrons(vertical):
    def fn(c, t, W, H):
        s = pop_life(t, 3.0, 0, 0.35)
        with Xf(c, W / 2, H / 2, s, -math.pi / 2 if vertical else 0):
            for i in range(3):
                phase = (t * 1.6 - i * 0.22) % 1.0
                lit = clamp(1 - abs(phase - 0.2) * 4)
                x = -170 + i * 170 + 25 * lit
                pts = [(x - 70, -150), (x + 70, 0), (x - 70, 150)]
                stroke(c, poly(pts, False), DARK, 92)
                stroke(c, poly(pts, False), mix(WHITE, YELLOW, lit), 64)
    return fn


anim("chevrons_hoch", "Pfeile & Markierungen", "Swipe-Up Chevrons", 3.0, sfx=[("swoosh_hoch", 0.1, 0.6), ("swoosh_hoch", 1.1, 0.5), ("swoosh_hoch", 2.1, 0.4)], poster=0.4)(_chevrons(True))
anim("chevrons_rechts", "Pfeile & Markierungen", "Chevrons nach rechts", 3.0, sfx=[("swoosh_rechts", 0.1, 0.6), ("swoosh_rechts", 1.1, 0.5), ("swoosh_rechts", 2.1, 0.4)], poster=0.4)(_chevrons(False))


# ------------------------------------------------------------ Klicks & Gesten

@anim("maus_klick", "Klicks & Gesten", "Mauszeiger klickt", 2.4, sfx=[("klick_maus", 0.85)], poster=0.4)
def _(c, t, W, H):
    k = ease_out_cubic(prog(t, 0.0, 0.7))
    ko = ease_in_cubic(prog(t, 1.9, 0.45))
    x = lerp(W + 150, W / 2, k) + ko * 700
    y = lerp(H + 150, H / 2, k) + ko * 700
    press = clamp(1 - abs(t - 0.88) / 0.1)
    for i in range(2):
        ripple(c, W / 2, H / 2, prog(t, 0.85 + i * 0.12, 0.55), 40, 330, YELLOW, 30)
    c.save()
    c.translate(W / 2, H / 2)
    burst_lines(c, prog(t, 0.85, 0.4), 8, 150, 380, YELLOW, 20, rot=0.4)
    c.restore()
    cursor(c, x, y, 1.0, press)


@anim("tippen", "Klicks & Gesten", "Finger tippt (Touch)", 1.8, sfx=[("tap_pop", 0.45)], poster=0.3)
def _(c, t, W, H):
    s = pop_in(t, 0.05, 0.3) * pop_out(t, 1.35, 0.3)
    press = clamp(1 - abs(t - 0.48) / 0.12)
    ripple(c, W / 2, H / 2, prog(t, 0.45, 0.6), 100, 420, lw0=30)
    ripple(c, W / 2, H / 2, prog(t, 0.58, 0.6), 100, 420, lw0=30)
    if s > 0:
        touch_dot(c, W / 2, H / 2, s, press)


@anim("doppelt_tippen", "Klicks & Gesten", "Doppelt tippen", 2.0, sfx=[("tap_pop", 0.45), ("tap_pop", 0.72)], poster=0.4)
def _(c, t, W, H):
    s = pop_in(t, 0.05, 0.3) * pop_out(t, 1.55, 0.3)
    press = max(clamp(1 - abs(t - 0.48) / 0.1), clamp(1 - abs(t - 0.75) / 0.1))
    ripple(c, W / 2, H / 2, prog(t, 0.45, 0.6), 100, 360, lw0=30)
    ripple(c, W / 2, H / 2, prog(t, 0.72, 0.6), 100, 440, lw0=30)
    if s > 0:
        touch_dot(c, W / 2, H / 2, s, press)
    kh = pop_in(t, 0.8, 0.35) * pop_out(t, 1.5, 0.3)
    if kh > 0:
        with Xf(c, W / 2 + 230, H / 2 - 230, kh * 340, 0.2):
            sticker(c, heart(1.0), RED, lw=0.05, shadow=(0.03, 0.04))


@anim("lange_druecken", "Klicks & Gesten", "Lange drücken", 2.4, sfx=[("button_press", 0.3), ("erfolg_beep", 1.6)], poster=0.55)
def _(c, t, W, H):
    s = pop_in(t, 0.0, 0.3) * pop_out(t, 2.0, 0.3)
    k = ease_in_out(prog(t, 0.35, 1.25))
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2, s):
        stroke(c, circle(0, 0, 190), DARK, 56)
        if k > 0:
            def arc(cc):
                cc.arc(0, 0, 190, -math.pi / 2, -math.pi / 2 + 2 * math.pi * k)
            stroke(c, arc, YELLOW, 36)
        burst_lines(c, prog(t, 1.6, 0.4), 10, 250, 420, YELLOW, 20)
    touch_dot(c, W / 2, H / 2, s, 1.0 if 0.3 < t < 1.6 else 0.0)


def _swipe(direction, sound):
    ang = {"rechts": 0, "unten": math.pi / 2, "links": math.pi, "oben": -math.pi / 2}[direction]

    def fn(c, t, W, H):
        ux, uy = round(math.cos(ang)), round(math.sin(ang))
        k = ease_in_out(prog(t, 0.35, 0.6))
        s = pop_in(t, 0.0, 0.3) * pop_out(t, 1.55, 0.3)
        x = W / 2 + ux * lerp(-280, 280, k)
        y = H / 2 + uy * lerp(-280, 280, k)
        # hint arrow
        ha = pop_in(t, 0.0, 0.35) * pop_out(t, 1.5, 0.3)
        with Xf(c, W / 2 + (0 if ux else 330), H / 2 + (0 if uy else 330), ha * 0.6, ang):
            sticker(c, poly(arrow_pts(460, 110, 250, 190)), YELLOW)
        # trail
        if 0 < k:
            n = 14
            for i in range(n):
                kk = clamp(k - i * 0.035)
                if kk <= 0:
                    break
                tx = W / 2 + ux * lerp(-280, 280, kk)
                ty = H / 2 + uy * lerp(-280, 280, kk)
                r = 90 * (1 - i / n)
                fill(c, circle(tx, ty, r + 8), DARK)
            for i in range(n):
                kk = clamp(k - i * 0.035)
                if kk <= 0:
                    break
                tx = W / 2 + ux * lerp(-280, 280, kk)
                ty = H / 2 + uy * lerp(-280, 280, kk)
                fill(c, circle(tx, ty, 90 * (1 - i / n)), WHITE)
        if s > 0:
            touch_dot(c, x, y, s, 1.0 if 0.3 < t < 1.0 else 0)
    return fn


for _d, _s in (("links", "swoosh_links"), ("rechts", "swoosh_rechts"), ("oben", "swoosh_hoch"), ("unten", "swoosh_runter")):
    anim(f"wischen_{_d}", "Klicks & Gesten", f"Wischen nach {_d}", 2.0, sfx=[(_s, 0.3)], poster=0.4)(_swipe(_d, _s))


def _pinch(apart):
    def fn(c, t, W, H):
        k = ease_in_out(prog(t, 0.4, 0.8))
        if not apart:
            k = 1 - k
        s = pop_in(t, 0.0, 0.3) * pop_out(t, 1.9, 0.3)
        dist = lerp(140, 330, k)
        a = -math.pi / 4
        for sign in (-1, 1):
            ax, ay = W / 2 + sign * math.cos(a) * (dist + 190), H / 2 + sign * math.sin(a) * (dist + 190)
            ka = pop_in(t, 0.1, 0.3) * pop_out(t, 1.85, 0.3)
            with Xf(c, ax, ay, ka * 0.32, a + (0 if sign > 0 else math.pi) + (0 if apart else math.pi)):
                sticker(c, poly(arrow_pts(420, 110, 250, 190)), YELLOW, lw=30, shadow=(20, 24))
        for sign in (-1, 1):
            if s > 0:
                touch_dot(c, W / 2 + sign * math.cos(a) * dist, H / 2 + sign * math.sin(a) * dist, s * 0.9, 1)
    return fn


anim("pinch_reinzoomen", "Klicks & Gesten", "Pinch: reinzoomen", 2.4, sfx=[("zoom_rein", 0.35)], poster=0.6)(_pinch(True))
anim("pinch_rauszoomen", "Klicks & Gesten", "Pinch: rauszoomen", 2.4, sfx=[("zoom_raus", 0.35)], poster=0.6)(_pinch(False))


# ------------------------------------------------------- Dateien & Fenster

@anim("ordner_oeffnen", "Dateien & Fenster", "Ordner öffnen", 2.8, sfx=[("pop", 0.0), ("ui_oeffnen", 0.55), ("papier_rascheln", 0.75)], poster=0.55)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.4) * pop_out(t, 2.4, 0.3)
    ko = ease_out_back(prog(t, 0.55, 0.4), 1.4)
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2 + 80, s):
        folder_back(c)
        for i, (dx, rot, col) in enumerate(((-120, -0.25, PURPLE), (0, 0.0, PINK), (120, 0.25, ORANGE))):
            kd = ease_out_back(prog(t, 0.7 + i * 0.1, 0.45), 1.6)
            with Xf(c, dx * kd, -60 - 260 * kd, 0.62, rot * kd):
                document(c, accent=col)
        folder_front(c, open_k=ko)


@anim("ordner_schliessen", "Dateien & Fenster", "Ordner schließen", 2.6, sfx=[("papier_rascheln", 0.2), ("ui_schliessen", 1.0), ("tap_pop", 1.15)], poster=0.15)
def _(c, t, W, H):
    s = pop_out(t, 2.1, 0.35)
    kc = ease_out_back(prog(t, 1.0, 0.3), 1.2)
    with Xf(c, W / 2, H / 2 + 80, s):
        folder_back(c)
        for i, (dx, rot, col) in enumerate(((-120, -0.25, PURPLE), (0, 0.0, PINK), (120, 0.25, ORANGE))):
            kd = 1 - ease_in_back(prog(t, 0.2 + i * 0.12, 0.45), 1.2)
            if kd > -0.05:
                with Xf(c, dx * kd, -60 - 260 * max(kd, 0), 0.62, rot * kd):
                    document(c, accent=col)
        folder_front(c, open_k=1 - kc)


@anim("datei_fliegt_rein", "Dateien & Fenster", "Datei fliegt rein", 2.4, sfx=[("swoosh_rechts", 0.0), ("tap_pop", 0.45)], poster=0.5)
def _(c, t, W, H):
    k = ease_out_back(prog(t, 0.0, 0.55), 1.3)
    ko = ease_in_back(prog(t, 1.9, 0.4))
    x = lerp(-300, W / 2, k) + ko * 1100
    rot = lerp(-1.2, 0, k) + ko * 0.8 + 0.04 * math.sin(t * 5)
    with Xf(c, x, H / 2 + 10 * math.sin(t * 3), 1.4, rot):
        document(c)


@anim("datei_loeschen", "Dateien & Fenster", "Datei in den Papierkorb", 3.0, sfx=[("papier_zerknuellen", 0.45), ("swoosh_runter", 1.3, 0.6)], poster=0.3)
def _(c, t, W, H):
    s_bin = pop_in(t, 0.0, 0.4) * pop_out(t, 2.55, 0.3)
    lid = ease_out_back(prog(t, 1.0, 0.25)) * (1 - ease_out_cubic(prog(t, 1.75, 0.2)))
    lid_bounce = 0.08 * math.sin(max(0, t - 1.95) * 30) * math.exp(-max(0, t - 1.95) * 6) * (t > 1.95)
    bx, by = W / 2 + 180, H / 2 + 230
    # crumple doc
    kcr = ease_in_out(prog(t, 0.4, 0.6))
    kfly = prog(t, 1.25, 0.55)
    if kfly < 1:
        sx, sy = W / 2 - 200, H / 2 - 150
        fx = lerp(sx, bx, kfly)
        fy = lerp(sy, by - 230, kfly) - 260 * math.sin(math.pi * kfly)
        with Xf(c, fx, fy, pop_in(t, 0.0, 0.35) * lerp(1.0, 0.75, kcr), kfly * 6):
            if kcr < 0.75:
                with Xf(c, 0, 0, 1 - kcr * 0.8, kcr * 1.5):
                    document(c)
            else:
                sticker(c, poly(star_pts(9, 110, 80, 0, 0.25, 3)), WHITE)
                stroke(c, poly([(-50, -20), (10, 15), (40, -30)], False), GREY, 8)
    if s_bin > 0:
        with Xf(c, bx, by, s_bin):
            sticker(c, poly([(-150, -120), (150, -120), (120, 190), (-120, 190)]), GREY)
            for xx in (-60, 0, 60):
                stroke(c, poly([(xx, -80), (xx * 0.85, 150)], False), shade(GREY, -0.3), 14)
            with Xf(c, -170, -130, 1, -lid * 1.1 + lid_bounce):
                sticker(c, rrect(0, -40, 340, 45, 18), shade(GREY, 0.2))
                sticker(c, rrect(130, -75, 80, 40, 14), shade(GREY, 0.2), shadow=None)


@anim("fenster_oeffnen", "Dateien & Fenster", "Fenster öffnen", 2.2, sfx=[("ui_oeffnen", 0.0), ("pop", 0.25, 0.4)], poster=0.7)
def _(c, t, W, H):
    k = ease_out_back(prog(t, 0.0, 0.5), 1.5)
    with Xf(c, W / 2, H / 2, max(k, 0.001)):
        window(c, k_content=ease_out_cubic(prog(t, 0.35, 0.6)))


@anim("fenster_schliessen", "Dateien & Fenster", "Fenster schließen (X klicken)", 2.4, sfx=[("klick_maus", 0.9), ("ui_schliessen", 1.0)], poster=0.3)
def _(c, t, W, H):
    k = 1 - ease_in_back(prog(t, 1.0, 0.45), 1.6)
    if k > 0:
        with Xf(c, W / 2, H / 2, k):
            window(c)
    cx, cy = W / 2 - 380 + 52, H / 2 - 270 + 45
    km = ease_out_cubic(prog(t, 0.1, 0.7))
    ko = ease_in_cubic(prog(t, 1.6, 0.5))
    cursor(c, lerp(W + 100, cx, km) + ko * 900, lerp(H - 100, cy, km) + ko * 400, 0.9, clamp(1 - abs(t - 0.92) / 0.1))
    with Xf(c, cx, cy, 1):
        burst_lines(c, prog(t, 0.9, 0.35), 8, 40, 130, YELLOW, 10)


def _transfer(up):
    def fn(c, t, W, H):
        s = pop_in(t, 0, 0.4) * pop_out(t, 2.75, 0.3)
        if s <= 0:
            return
        kprog = ease_in_out(prog(t, 0.4, 1.7))
        done = t > 2.15
        with Xf(c, W / 2, H / 2, s):
            # tray
            stroke(c, poly([(-260, 80), (-260, 230), (260, 230), (260, 80)], False), DARK, 70)
            stroke(c, poly([(-260, 80), (-260, 230), (260, 230), (260, 80)], False), WHITE, 44)
            if not done:
                cyc = (t * 1.4) % 1.0
                dy = (lerp(-260, 40, ease_in_cubic(cyc)) if not up else lerp(40, -260, ease_out_cubic(cyc)))
                with Xf(c, 0, dy - 40, 0.8, math.pi / 2 if not up else -math.pi / 2):
                    sticker(c, poly(arrow_pts(380, 120, 270, 190)), PURPLE if not up else PINK)
            else:
                kc = ease_out_back(prog(t, 2.15, 0.35))
                with Xf(c, 0, -70, kc):
                    sticker(c, circle(0, 0, 160), YELLOW)
                    stroke(c, poly(checkmark_pts(230), False), DARK, 44)
            # progress bar
            fill(c, rrect(-300, 320, 600, 60, 30), DARK)
            fill(c, rrect(-288, 332, max(36, 576 * kprog), 36, 18), YELLOW)
            text_sticker(c, f"{int(kprog * 100)}%", 100, WHITE, 0, 470)
    return fn


anim("download", "Dateien & Fenster", "Download mit Fortschritt", 3.2, sfx=[("swoosh_runter", 0.3, 0.5), ("swoosh_runter", 1.0, 0.4), ("erfolg_beep", 2.15)], poster=0.45)(_transfer(False))
anim("upload", "Dateien & Fenster", "Upload mit Fortschritt", 3.2, sfx=[("swoosh_hoch", 0.3, 0.5), ("swoosh_hoch", 1.0, 0.4), ("erfolg_beep", 2.15)], poster=0.45)(_transfer(True))


@anim("ladekreis", "Dateien & Fenster", "Lade-Kreis (Loop)", 3.0, poster=0.3)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.3) * pop_out(t, 2.6, 0.3)
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2, s):
        stroke(c, circle(0, 0, 200), DARK, 76)
        stroke(c, circle(0, 0, 200), LIGHTGREY, 48)
        a0 = t * 2 * math.pi * 1.1
        span = 1.2 + 0.9 * math.sin(t * 4)

        def arc(cc):
            cc.arc(0, 0, 200, a0, a0 + span + 0.6)
        stroke(c, arc, PURPLE, 48)
        for i in range(3):
            yy = 0
            bounce = abs(math.sin(t * 6 - i * 0.6)) * 30
            fill(c, circle(-60 + i * 60, yy - bounce, 22), DARK)


@anim("ladebalken", "Dateien & Fenster", "Ladebalken 0-100%", 3.0, sfx=[("erfolg_beep", 2.2)], poster=0.55)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.35) * pop_out(t, 2.6, 0.3)
    k = ease_in_out(prog(t, 0.3, 1.9))
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2, s):
        sticker(c, rrect(-420, -70, 840, 140, 70), DARK)
        if k > 0:
            fill(c, rrect(-400, -50, max(100, 800 * k), 100, 50), YELLOW)
            c.save()
            rrect(-400, -50, max(100, 800 * k), 100, 50)(c)
            c.clip()
            for i in range(-2, 14):
                x = i * 80 + (t * 160) % 80 - 400
                fill(c, poly([(x, -50), (x + 40, -50), (x - 10, 50), (x - 50, 50)]), shade(YELLOW, 0.4))
            c.restore()
        txt = "FERTIG!" if t > 2.2 else f"{int(k * 100)}%"
        ks = pop_in(t, 2.2, 0.3) if t > 2.2 else 1
        with Xf(c, 0, -190, ks):
            text_sticker(c, txt, 120, WHITE)


@anim("haken_erfolg", "Dateien & Fenster", "Haken / Erfolg", 2.2, bg="blue", sfx=[("erfolg_beep", 0.2)], poster=0.6)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.4) * pop_out(t, 1.8, 0.3)
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2, s):
        burst_lines(c, prog(t, 0.25, 0.5), 12, 260, 450, YELLOW, 18)
        sticker(c, circle(0, 0, 250), GREEN)
        marker(c, polyline_partial(checkmark_pts(380), ease_out_cubic(prog(t, 0.2, 0.35))), WHITE, 66, DARK, 20)


@anim("kreuz_fehler", "Dateien & Fenster", "X / Fehler", 2.2, sfx=[("fehler_beep", 0.2)], poster=0.6)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.4) * pop_out(t, 1.8, 0.3)
    shake = 22 * math.sin(t * 60) * math.exp(-max(0, t - 0.4) * 5) * (t > 0.35)
    if s <= 0:
        return
    with Xf(c, W / 2 + shake, H / 2, s):
        sticker(c, circle(0, 0, 250), RED)
        k1 = ease_out_cubic(prog(t, 0.15, 0.2))
        k2 = ease_out_cubic(prog(t, 0.3, 0.2))
        marker(c, polyline_partial([(-110, -110), (110, 110)], k1), WHITE, 66, DARK, 20)
        marker(c, polyline_partial([(110, -110), (-110, 110)], k2), WHITE, 66, DARK, 20)


# ------------------------------------------------------------ Social & UI

@anim("benachrichtigung_banner", "Social & UI", "Push-Benachrichtigung (oben)", 3.0, size=VERT, sfx=[("benachrichtigung_chime", 0.15)], poster=0.4)
def _(c, t, W, H):
    k = ease_out_back(prog(t, 0.05, 0.5), 1.3) - ease_in_back(prog(t, 2.5, 0.4))
    y = lerp(-260, 170, k)
    with Xf(c, W / 2, y, 1):
        sticker(c, rrect(-480, -110, 960, 220, 46), OFFWHITE)
        sticker(c, rrect(-440, -70, 140, 140, 32), PINK, lw=8, shadow=None)
        with Xf(c, -370, 0, 0.38):
            bell_icon(c, 1, WHITE)
        fill(c, rrect(-270, -55, 300, 34, 17), DARK)
        fill(c, rrect(-270, 5, 620, 26, 13), GREY)
        fill(c, rrect(-270, 45, 450, 26, 13), GREY)
        text_plain(c, "jetzt", 34, GREY, 420, -38, "r")


@anim("chat_nachricht", "Social & UI", "Chat-Nachricht (tippt...)", 3.0, sfx=[("pop", 0.0, 0.6), ("nachricht_empfangen", 1.3)], poster=0.7)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.35) * pop_out(t, 2.6, 0.3)
    typing = t < 1.3
    if s <= 0:
        return
    wbub = 260 if typing else lerp(260, 700, ease_out_back(prog(t, 1.3, 0.35), 1.2))
    hb = 170 if typing else lerp(170, 260, ease_out_back(prog(t, 1.3, 0.35), 1.2))
    with Xf(c, W / 2 - 350 + wbub / 2, H / 2, s):
        def bub(cc):
            rrect(-wbub / 2, -hb / 2, wbub, hb, 60)(cc)
            cc.move_to(-wbub / 2 + 20, hb / 2 - 50)
            cc.line_to(-wbub / 2 - 40, hb / 2 + 25)
            cc.line_to(-wbub / 2 + 70, hb / 2 - 10)
            cc.close_path()
        sticker(c, bub, WHITE)
        fill(c, rrect(-wbub / 2 + 3, -hb / 2 + 3, wbub - 6, hb - 6, 57), WHITE)
        if typing:
            for i in range(3):
                b = max(0, math.sin(t * 9 - i * 0.9)) * 24
                fill(c, circle(-70 + i * 70, -b, 24), GREY)
        else:
            kc = ease_out_cubic(prog(t, 1.4, 0.35))
            fill(c, rrect(-wbub / 2 + 50, -60, (wbub - 100) * kc, 36, 18), DARK)
            fill(c, rrect(-wbub / 2 + 50, 10, (wbub - 220) * kc, 36, 18), GREY)


@anim("glocke_klingelt", "Social & UI", "Glocke klingelt + Badge", 2.6, sfx=[("benachrichtigung_ding", 0.35), ("pop", 0.9, 0.6)], poster=0.45)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.35) * pop_out(t, 2.2, 0.3)
    swing = 0.45 * math.sin(max(0, t - 0.3) * 22) * math.exp(-max(0, t - 0.3) * 2.5) * (t > 0.3)
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2 - 30, s * 1.5):
        with Xf(c, 0, -170, 1, swing):
            c.translate(0, 170)
            bell_icon(c)
        kb = pop_in(t, 0.9, 0.35, 2.5)
        if kb > 0:
            with Xf(c, 140, -140, kb):
                sticker(c, circle(0, 0, 75), RED)
                text_plain(c, "1", 95, WHITE, 0, 0)
        for side in (-1, 1):
            k = prog(t, 0.35, 0.5)
            if 0 < k < 1:
                for j in range(2):
                    a0 = (-0.5 if side > 0 else math.pi + 0.5) + side * 0.0
                    r = 230 + j * 60 + 40 * k

                    def arc(cc, r=r, side=side):
                        if side > 0:
                            cc.arc(0, 0, r, -0.9, -0.2)
                        else:
                            cc.arc(0, 0, r, math.pi + 0.2, math.pi + 0.9)
                    stroke(c, arc, DARK, 22 * (1 - k) + 8)


@anim("abonnieren_button", "Social & UI", "Abonnieren-Button + Glocke", 3.6, sfx=[("pop", 0.0, 0.6), ("klick_maus", 1.1), ("pop", 1.15, 0.6), ("klick_maus", 2.0), ("benachrichtigung_ding", 2.05)], poster=0.4)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.4) * pop_out(t, 3.2, 0.3)
    subbed = t > 1.12
    press = clamp(1 - abs(t - 1.12) / 0.12)
    if s > 0:
        with Xf(c, W / 2 - 80, H / 2, s * (1 - 0.08 * press)):
            col = GREY if subbed else RED
            sticker(c, rrect(-330, -85, 660, 170, 85), col)
            text_plain(c, "ABONNIERT" if subbed else "ABONNIEREN", 74, WHITE, 0, 0)
        kb = pop_in(t, 1.25, 0.35)
        if kb > 0:
            swing = 0.4 * math.sin(max(0, t - 2.0) * 22) * math.exp(-max(0, t - 2.0) * 2.5) * (t > 2.0)
            with Xf(c, W / 2 + 360, H / 2, s * kb * 0.45, swing):
                bell_icon(c, 1, YELLOW if t > 2.0 else WHITE)
    # cursor path: to button (1.1) then to bell (2.0)
    if t < 1.12:
        k = ease_out_cubic(prog(t, 0.35, 0.7))
        x, y = lerp(W + 100, W / 2 - 30, k), lerp(H + 100, H / 2 + 20, k)
    else:
        k = ease_in_out(prog(t, 1.4, 0.55))
        ko = ease_in_cubic(prog(t, 2.6, 0.5))
        x, y = lerp(W / 2 - 30, W / 2 + 370, k) + ko * 600, lerp(H / 2 + 20, H / 2 + 20, k) + ko * 600
    cursor(c, x, y, 0.9, max(press, clamp(1 - abs(t - 2.0) / 0.1)))


@anim("like_herz", "Social & UI", "Herz / Like Pop", 2.0, sfx=[("like_herz_pop", 0.05)], poster=0.4)
def _(c, t, W, H):
    s = pop_in(t, 0.05, 0.45, 2.6) * pop_out(t, 1.6, 0.3)
    k = prog(t, 0.1, 0.6)
    c.save()
    c.translate(W / 2, H / 2)
    if 0 < k < 1:
        for i in range(10):
            a = i * 2 * math.pi / 10 + 0.3
            r = lerp(200, 420, ease_out_cubic(k))
            sz = 40 * (1 - k)
            col = (PINK, YELLOW, RED, PURPLE, ORANGE)[i % 5]
            sticker(c, circle(r * math.cos(a), r * math.sin(a), sz), col, lw=6, shadow=None)
    c.restore()
    if s > 0:
        with Xf(c, W / 2, H / 2 + 20, s * 620 * wobble(t, 0.04, 2.0)):
            sticker(c, heart(1.0), RED, lw=0.02, shadow=(0.012, 0.016))
            fill(c, ellipse(-0.25, -0.22, 0.08, 0.05), shade(RED, 0.5))


def _lupe(sign, sound):
    def fn(c, t, W, H):
        s = pop_in(t, 0, 0.45) * pop_out(t, 2.1, 0.3)
        pulse = 1 + 0.12 * math.sin(max(0, t - 0.45) * 7) * (t > 0.45) * (1 if sign == "+" else -1)
        if s > 0:
            with Xf(c, W / 2 - 40, H / 2 - 40, s * pulse * 1.15, 0.05 * math.sin(t * 3)):
                magnifier(c, sign)
    return fn


anim("lupe_reinzoomen", "Zoom & Übergänge", "Lupe + (reinzoomen)", 2.5, sfx=[("pop", 0.0, 0.6), ("zoom_rein", 0.3)], poster=0.4)(_lupe("+", "zoom_rein"))
anim("lupe_rauszoomen", "Zoom & Übergänge", "Lupe − (rauszoomen)", 2.5, sfx=[("pop", 0.0, 0.6), ("zoom_raus", 0.3)], poster=0.4)(_lupe("-", "zoom_raus"))

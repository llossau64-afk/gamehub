"""Transitions, money, game show, effects and comic text pops."""
import math
import numpy as np
from gfx import *  # noqa: F401,F403
from anims_ui import anim, SQ, VERT

TR = "Zoom & Übergänge"
MONEY = "Geld"
QUIZ = "Quiz & Gameshow"
FX = "Effekte & Text"


# ------------------------------------------------------------- Übergänge

@anim("speed_lines", TR, "Speed Lines (Anime, Loop)", 2.0, size=VERT, sfx=[("whoosh_langsam", 0.0, 0.7)], poster=0.5)
def _(c, t, W, H):
    frame_seed = int(t * 15)
    r = np.random.default_rng(frame_seed)
    cx, cy = W / 2, H / 2
    R = math.hypot(W, H) / 2 + 50
    amt = clamp(t / 0.15) * clamp((2.0 - t) / 0.15)
    for i in range(int(70 * amt)):
        a = r.uniform(0, 2 * math.pi)
        r_in = r.uniform(0.42, 0.75) * min(W, H) * 0.9
        wdt = r.uniform(0.008, 0.03)
        pts = [(cx + R * math.cos(a - wdt), cy + R * math.sin(a - wdt)), (cx + r_in * math.cos(a), cy + r_in * math.sin(a)),
               (cx + R * math.cos(a + wdt), cy + R * math.sin(a + wdt))]
        fill(c, poly(pts), WHITE if i % 4 else DARK)


def _rings(inward):
    def fn(c, t, W, H):
        cx, cy = W / 2, H / 2
        R = math.hypot(W, H) / 2 + 40
        cols = [YELLOW, DARK, WHITE, PINK, DARK, ORANGE]
        k = prog(t, 0.0, 1.0)
        # expanding disks covering the frame, then a hole opens
        cover = []
        for i, col in enumerate(cols):
            kk = ease_in_out(clamp(k * 1.6 - i * 0.1))
            cover.append((col, kk))
        for col, kk in cover:
            if kk <= 0:
                continue
            r = R * kk
            if inward:
                def p(cc, r=r):
                    cc.rectangle(0, 0, W, H)
                    cc.new_sub_path()
                    cc.arc(cx, cy, max(R - r, 0.1), 0, 2 * math.pi)
                c.set_fill_rule(1)
                p(c)
                c.set_source_rgb(*col)
                c.fill()
                c.set_fill_rule(0)
            else:
                fill(c, circle(cx, cy, r), col)
        # reveal
        kr = ease_in_out(prog(t, 0.65, 0.45))
        if kr > 0:
            c.save()
            c.set_source_rgb(0, 1, 0)
            if inward:
                c.set_fill_rule(1)
                c.rectangle(0, 0, W, H)
                c.new_sub_path()
                c.arc(cx, cy, max(R * (1 - kr), 0.1), 0, 2 * math.pi)
                c.fill()
            else:
                circle(cx, cy, R * kr)(c)
                c.fill()
            c.restore()
    return fn


anim("zoom_rein_uebergang", TR, "Zoom-Rein Übergang (Ringe)", 1.2, size=VERT, sfx=[("zoom_rein", 0.0)], poster=0.45)(_rings(False))
anim("zoom_raus_uebergang", TR, "Zoom-Raus Übergang (Ringe)", 1.2, size=VERT, sfx=[("zoom_raus", 0.0)], poster=0.45)(_rings(True))


def _wipe(direction):
    def fn(c, t, W, H):
        cols = [YELLOW, PINK, DARK]
        horiz = direction in ("links", "rechts")
        L = W if horiz else H
        for i, col in enumerate(cols):
            k = ease_in_out(prog(t, i * 0.08, 0.95))
            # band travels from -L to +L (covers whole frame in the middle)
            pos = lerp(-0.8 * L - 240, 1.8 * L + 240, k)
            if direction == "rechts":
                pts = _band(pos, L, W, H, True, False)
            elif direction == "links":
                pts = _band(pos, L, W, H, True, True)
            elif direction == "unten":
                pts = _band(pos, L, W, H, False, False)
            else:
                pts = _band(pos, L, W, H, False, True)
            sticker(c, poly(pts), col, lw=0, shadow=None)
    return fn


def _band(pos, L, W, H, horiz, reverse):
    """A slanted band of width ~1.4*L centred at pos along the travel axis."""
    half = L * 0.75
    sl = 220
    a, b = pos - half, pos + half
    if horiz:
        if reverse:
            a, b = W - b, W - a
        return [(a, 0), (b + sl, 0), (b, H), (a - sl, H)]
    if reverse:
        a, b = H - b, H - a
    return [(0, a), (W, a - sl), (W, b), (0, b + sl)]


for _d, _s in (("links", "swoosh_links"), ("rechts", "swoosh_rechts"), ("oben", "swoosh_hoch"), ("unten", "swoosh_runter")):
    anim(f"wipe_{_d}", TR, f"Wipe-Übergang nach {_d}", 1.1, size=VERT, sfx=[(_s, 0.0), ("whoosh_schnell", 0.15, 0.5)], poster=0.4)(_wipe(_d))


@anim("kreis_wipe", TR, "Kreis-Übergang", 1.2, size=VERT, sfx=[("whoosh_schnell", 0.0), ("pop", 0.5, 0.5)], poster=0.4)
def _(c, t, W, H):
    cx, cy = W / 2, H / 2
    R = math.hypot(W, H) / 2 + 20
    k1 = ease_in_cubic(prog(t, 0.0, 0.5))
    k2 = ease_out_cubic(prog(t, 0.55, 0.55))
    if t < 0.55:
        sticker(c, circle(cx, cy, R * k1 + 1), DARK, lw=0, shadow=None)
        if k1 > 0.1:
            stroke(c, circle(cx, cy, R * k1), YELLOW, 40)
    else:
        c.set_fill_rule(1)
        c.rectangle(0, 0, W, H)
        c.new_sub_path()
        c.arc(cx, cy, max(R * k2, 0.1), 0, 2 * math.pi)
        c.set_source_rgb(*DARK)
        c.fill()
        c.set_fill_rule(0)
        if 0 < k2 < 1:
            stroke(c, circle(cx, cy, R * k2), YELLOW, 40)


@anim("glitch_overlay", TR, "Glitch-Überblendung", 1.0, size=VERT, sfx=[("glitch", 0.0)], poster=0.4)
def _(c, t, W, H):
    r = np.random.default_rng(int(t * 30) + 11)
    if r.random() < 0.15:
        return
    for _ in range(int(r.integers(6, 18))):
        y = r.uniform(0, H)
        h = r.uniform(8, 160)
        x = r.uniform(-200, W)
        w = r.uniform(120, W)
        col = [PINK, CYAN, WHITE, DARK, YELLOW, PURPLE][int(r.integers(6))]
        fill(c, rrect(x, y, w, h, 0), col)
    for _ in range(int(r.integers(0, 4))):
        y = r.uniform(0, H)
        fill(c, rrect(0, y, W, r.uniform(2, 10), 0), WHITE)


@anim("bauchbinde", TR, "Bauchbinde / Lower Third (leer)", 4.0, size=VERT, sfx=[("swoosh_rechts", 0.0), ("swoosh_links", 3.4, 0.7)], poster=0.4)
def _(c, t, W, H):
    y = H * 0.72
    k1 = ease_out_cubic(prog(t, 0.0, 0.45))
    k2 = ease_out_cubic(prog(t, 0.15, 0.45))
    o1 = ease_in_cubic(prog(t, 3.4, 0.4))
    o2 = ease_in_cubic(prog(t, 3.3, 0.4))
    w1 = 860 * (k1 - o1)
    w2 = 600 * (k2 - o2)
    if w1 > 1:
        sticker(c, rrect(60, y, w1, 150, 18), WHITE, lw=10)
        fill(c, rrect(60, y, min(w1, 26), 150, 0), PINK)
    if w2 > 1:
        sticker(c, rrect(60, y + 175, w2, 80, 14), DARK, lw=0, shadow=(8, 10))
        fill(c, rrect(60, y + 175, min(w2, 26), 80, 0), YELLOW)


# --------------------------------------------------------------------- Geld

@anim("geld_regen", MONEY, "Geld-Regen (Scheine)", 3.5, bg="blue", sfx=[("geld_kommt", 0.0), ("geld_zaehlen", 0.3, 0.6)], poster=0.45)
def _(c, t, W, H):
    r = np.random.default_rng(42)
    for i in range(26):
        x0 = r.uniform(80, W - 80)
        delay = r.uniform(0, 1.8)
        speed = r.uniform(380, 620)
        spin = r.uniform(-2, 2)
        flip_f = r.uniform(1.5, 3.5)
        sc = r.uniform(0.5, 0.8)
        tt = t - delay
        if tt < 0:
            continue
        y = -150 + speed * tt
        if y > H + 200:
            continue
        x = x0 + 70 * math.sin(tt * 2.5 + i)
        with Xf(c, x, y, sc, spin * tt + math.sin(tt * 3) * 0.4, sy=math.cos(tt * flip_f * 2) * 0.8 + 0.2 * np.sign(math.cos(tt * flip_f * 2) + 1e-9)):
            banknote(c)


@anim("muenze_pop", MONEY, "Münze ploppt + dreht", 2.4, sfx=[("muenze", 0.1), ("magie_glitzer", 0.3, 0.4)], poster=0.15)
def _(c, t, W, H):
    s = pop_in(t, 0.05, 0.45, 2.4) * pop_out(t, 2.0, 0.3)
    spin = math.cos(max(0, t - 0.4) * 5)
    if s <= 0:
        return
    c.save()
    c.translate(W / 2, H / 2)
    for i in range(4):
        k = (t * 0.8 + i * 0.25) % 1
        a = i * 1.7 + 0.5
        rr = 300
        sz = math.sin(k * math.pi) * 60 * s
        if sz > 2:
            with Xf(c, rr * math.cos(a), rr * math.sin(a), sz / 60, t):
                sticker(c, poly(star_pts(4, 60, 18)), WHITE, lw=6, shadow=None)
    c.restore()
    with Xf(c, W / 2, H / 2 - 30 * abs(math.sin(t * 3)), s * 1.6):
        coin(c, 170, spin)


@anim("muenzen_regen", MONEY, "Münzen-Regen", 3.4, sfx=[("muenzen_regen", 0.1)], poster=0.4)
def _(c, t, W, H):
    r = np.random.default_rng(7)
    for i in range(34):
        x = r.uniform(60, W - 60)
        delay = r.uniform(0, 1.7)
        g = 2200
        tt = t - delay
        if tt < 0:
            continue
        y = -100 + 0.5 * g * tt * tt * 0.6 + 200 * tt
        if y > H + 150:
            continue
        with Xf(c, x, y, r.uniform(0.35, 0.55)):
            coin(c, 140, math.cos(tt * r.uniform(5, 10) + i))


@anim("geld_explosion", MONEY, "Geld-Explosion", 2.8, bg="blue", sfx=[("impact_boom", 0.0, 0.7), ("kasse_kaching", 0.05)], poster=0.3)
def _(c, t, W, H):
    r = np.random.default_rng(3)
    k = prog(t, 0.0, 2.6)
    for i in range(22):
        a = r.uniform(0, 2 * math.pi)
        v = r.uniform(500, 1100)
        tt = t
        x = W / 2 + math.cos(a) * v * tt * (1 - 0.25 * tt)
        y = H / 2 + math.sin(a) * v * tt * (1 - 0.25 * tt) + 300 * tt * tt
        with Xf(c, x, y, lerp(0.2, r.uniform(0.55, 0.8), ease_out_cubic(clamp(t * 3))), a + tt * r.uniform(-6, 6), sy=math.cos(tt * 7 + i)):
            if i % 3 == 0:
                coin(c, 120, 1)
            else:
                banknote(c)
    if t < 0.35:
        with Xf(c, W / 2, H / 2, ease_out_back(prog(t, 0, 0.15)) * (1 - prog(t, 0.2, 0.15))):
            burst(c, 360, 200, 12, YELLOW)


@anim("plus_geld", MONEY, "+100 € ploppt hoch", 2.4, sfx=[("geld_plopp", 0.05)], poster=0.35)
def _(c, t, W, H):
    s = pop_in(t, 0.05, 0.45, 2.4) * pop_out(t, 2.0, 0.3)
    y = H / 2 + 60 - 120 * ease_out_cubic(prog(t, 0.05, 1.8))
    if s <= 0:
        return
    with Xf(c, W / 2, y, s, -0.06):
        text_sticker(c, "+100 €", 210, YELLOW, 90, 0)
        with Xf(c, -390, -10, 0.5):
            coin(c, 170, math.cos(t * 6))


def _counter(symbol, euro):
    target = 10000

    def fmt(v):
        s = f"{v:,}"
        return (s.replace(",", ".") + " €") if euro else ("$" + s)

    def fn(c, t, W, H):
        s = pop_in(t, 0.0, 0.35) * pop_out(t, 3.6, 0.3)
        k = ease_out_cubic(prog(t, 0.25, 2.3))
        v = int(round(target * k / (1 if k >= 1 else 10)) * (1 if k >= 1 else 10))
        done = t > 2.55
        if s <= 0:
            return
        r = np.random.default_rng(1)
        for i in range(8):
            ph = (t * 1.3 + i / 8) % 1
            if t > 2.6:
                break
            x = W / 2 + r.uniform(-380, 380)
            y = H / 2 + 330 - ph * 160
            sc = math.sin(ph * math.pi) * 0.4
            if sc > 0.02:
                with Xf(c, x, y, sc):
                    coin(c, 140, math.cos(t * 8 + i), symbol)
        pulse = 1 + 0.03 * math.sin(t * 40) * (not done) + 0.15 * math.exp(-max(0, t - 2.55) * 6) * done
        with Xf(c, W / 2, H / 2, s * pulse):
            if done:
                burst(c, 450, 330, 16, ORANGE, t * 0.3, seed=5)
            text_sticker(c, fmt(v), 165 if euro else 175, YELLOW if done else WHITE, 0, 0)
    return fn


anim("geldzaehler_euro", MONEY, "Geldzähler 0 → 10.000 €", 4.0, sfx=[("geld_zaehlen", 0.25, 0.8), ("kasse_kaching", 2.5)], poster=0.75)(_counter("€", True))
anim("geldzaehler_dollar", MONEY, "Geldzähler $0 → $10,000", 4.0, sfx=[("geld_zaehlen", 0.25, 0.8), ("kasse_kaching", 2.5)], poster=0.75)(_counter("$", False))


@anim("geldsack", MONEY, "Geldsack ploppt", 2.6, sfx=[("schlag_punch", 0.0, 0.6), ("kasse_kaching", 0.2)], poster=0.4)
def _(c, t, W, H):
    s = pop_in(t, 0.0, 0.5, 2.2) * pop_out(t, 2.2, 0.3)
    if s <= 0:
        return
    sq = 1 + 0.06 * math.sin(t * 10) * math.exp(-t * 1.5)
    with Xf(c, W / 2, H / 2 + 60, s * 1.2, 0.05 * math.sin(t * 4), sx=sq, sy=1 / sq):
        def body(cc):
            cc.move_to(-90, -190)
            cc.curve_to(-330, -60, -330, 260, 0, 260)
            cc.curve_to(330, 260, 330, -60, 90, -190)
            cc.close_path()
        sticker(c, body, BROWN)
        sticker(c, poly([(-90, -195), (-150, -300), (-40, -255), (0, -320), (40, -255), (150, -300), (90, -195)]), BROWN)
        sticker(c, rrect(-110, -215, 220, 50, 25), shade(BROWN, -0.3))
        fill(c, ellipse(-130, -40, 40, 70), shade(BROWN, 0.25))
        text_sticker(c, "€", 260, GOLD, 0, 60)
    for i in range(3):
        k = (t * 1.2 + i * 0.33) % 1
        a = -2.2 + i * 0.9
        with Xf(c, W / 2 + 360 * math.cos(a), H / 2 + 330 * math.sin(a), math.sin(k * math.pi) * s, t * 2):
            sticker(c, poly(star_pts(4, 60, 18)), WHITE, lw=6, shadow=None)


# --------------------------------------------------------------- Gameshow

@anim("rotes_licht", QUIZ, "Rotes Licht", 2.5, sfx=[("lichtschalter_brumm", 0.1), ("fehler_beep", 0.15, 0.6)], poster=0.6)
def _(c, t, W, H):
    on = clamp((t - 0.1) / 0.05) * (0.85 + 0.15 * math.sin(t * 9))
    s = pop_in(t, 0, 0.3) * pop_out(t, 2.15, 0.3)
    if s > 0:
        with Xf(c, W / 2, H / 2, s * 1.0):
            lamp(c, RED, on, 300, t)


@anim("gruenes_licht", QUIZ, "Grünes Licht", 2.5, bg="blue", sfx=[("lichtschalter_brumm", 0.1), ("erfolg_beep", 0.15)], poster=0.6)
def _(c, t, W, H):
    on = clamp((t - 0.1) / 0.05) * (0.85 + 0.15 * math.sin(t * 9))
    s = pop_in(t, 0, 0.3) * pop_out(t, 2.15, 0.3)
    if s > 0:
        with Xf(c, W / 2, H / 2, s):
            lamp(c, GREEN, on, 300, t)


def _traffic(red_first):
    def fn(c, t, W, H):
        s = pop_in(t, 0, 0.35) * pop_out(t, 3.1, 0.3)
        sw = 1.4
        if s <= 0:
            return
        with Xf(c, W / 2, H / 2, s * 0.95):
            sticker(c, rrect(-190, -480, 380, 960, 80), DARK)
            stroke(c, poly([(0, 480), (0, 560)], False), DARK, 60)
            first, second = (RED, GREEN) if red_first else (GREEN, RED)
            states = {RED: 0, YELLOW: 0, GREEN: 0}
            if t < sw - 0.35:
                states[first] = 1
            elif t < sw:
                states[YELLOW] = 1
                states[first] = 1 if red_first else 0
            else:
                states[second] = 1
            for i, col in enumerate((RED, YELLOW, GREEN)):
                with Xf(c, 0, -300 + i * 300, 0.42):
                    lamp(c, col, states[col] * (0.9 + 0.1 * math.sin(t * 9)), 300, t, rays_on=False)
    return fn


anim("ampel_rot_zu_gruen", QUIZ, "Ampel: Rot → Grün", 3.5, bg="blue",
     sfx=[("lichtschalter_brumm", 0.05, 0.6), ("schalter_an", 1.05), ("erfolg_beep", 1.4)], poster=0.15)(_traffic(True))
anim("ampel_gruen_zu_rot", QUIZ, "Ampel: Grün → Rot", 3.5, bg="blue",
     sfx=[("lichtschalter_brumm", 0.05, 0.6), ("schalter_an", 1.05), ("buzzer_falsch", 1.4, 0.7)], poster=0.15)(_traffic(False))


@anim("richtig_gross", QUIZ, "RICHTIG! (Haken + Text)", 2.6, bg="blue", sfx=[("richtige_antwort", 0.05)], poster=0.55)
def _(c, t, W, H):
    s = pop_in(t, 0.0, 0.45) * pop_out(t, 2.2, 0.3)
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2 - 110, s):
        burst(c, 360, 280, 18, YELLOW, t * 0.4, seed=2)
        sticker(c, circle(0, 0, 230), GREEN)
        marker(c, polyline_partial(checkmark_pts(340), ease_out_cubic(prog(t, 0.15, 0.3))), WHITE, 60, DARK, 18)
    kt = pop_in(t, 0.3, 0.4) * pop_out(t, 2.2, 0.3)
    if kt > 0:
        with Xf(c, W / 2, H / 2 + 300, kt, -0.04):
            text_sticker(c, "RICHTIG!", 170, WHITE)


@anim("falsch_gross", QUIZ, "FALSCH! (X + Shake)", 2.6, sfx=[("buzzer_falsch", 0.05)], poster=0.55)
def _(c, t, W, H):
    s = pop_in(t, 0.0, 0.4) * pop_out(t, 2.2, 0.3)
    shake = 30 * math.sin(t * 70) * math.exp(-max(0, t - 0.3) * 4) * (t > 0.2)
    if s <= 0:
        return
    with Xf(c, W / 2 + shake, H / 2 - 110, s):
        sticker(c, circle(0, 0, 230), RED)
        marker(c, [(-95, -95), (95, 95)], WHITE, 60, DARK, 18)
        marker(c, [(95, -95), (-95, 95)], WHITE, 60, DARK, 18)
    kt = pop_in(t, 0.25, 0.4) * pop_out(t, 2.2, 0.3)
    if kt > 0:
        with Xf(c, W / 2 - shake, H / 2 + 300, kt, 0.04):
            text_sticker(c, "FALSCH!", 170, RED, outline=DARK)


@anim("countdown_3_2_1", QUIZ, "Countdown 3-2-1-LOS!", 4.0, sfx=[("countdown_3_2_1_los", 0.0)], poster=0.1)
def _(c, t, W, H):
    i = int(t)
    ft = t - i
    with Xf(c, W / 2, H / 2, 1):
        if i < 3:
            stroke(c, circle(0, 0, 330), DARK, 64)
            stroke(c, circle(0, 0, 330), LIGHTGREY, 40)

            def arc(cc):
                cc.arc(0, 0, 330, -math.pi / 2, -math.pi / 2 + 2 * math.pi * (1 - ft))
            stroke(c, arc, [RED, ORANGE, YELLOW][i], 40)
            with Xf(c, 0, 0, ease_out_back(clamp(ft / 0.3), 2.5) * (1 - 0.15 * ft)):
                text_sticker(c, str(3 - i), 420, WHITE)
        else:
            k = pop_in(t, 3.0, 0.35, 2.5) * pop_out(t, 3.7, 0.25)
            with Xf(c, 0, 0, k, -0.08):
                burst(c, 480, 330, 14, YELLOW, seed=4)
                text_sticker(c, "LOS!", 260, WHITE)


@anim("timer_10_sekunden", QUIZ, "Timer 10 Sekunden", 11.0, sfx=[("countdown_tick", 0.0, 0.8), ("countdown_tick", 5.0, 0.8), ("timer_alarm", 10.0)], poster=0.35)
def _(c, t, W, H):
    left = max(0.0, 10 - t)
    s = pop_in(t, 0, 0.3) * pop_out(t, 10.65, 0.3)
    urgent = left < 3.0 and left > 0
    sc = s * (1 + 0.06 * math.sin(t * 2 * math.pi * 2) * urgent)
    shake = 10 * math.sin(t * 60) if left == 0 and t < 10.6 else 0
    if s <= 0:
        return
    with Xf(c, W / 2 + shake, H / 2, sc):
        sticker(c, circle(0, 0, 360), WHITE)
        k = left / 10

        def wedge(cc):
            cc.move_to(0, 0)
            cc.arc(0, 0, 310, -math.pi / 2, -math.pi / 2 + 2 * math.pi * k)
            cc.close_path()
        if k > 0:
            fill(c, wedge, RED if urgent else PURPLE)
        fill(c, circle(0, 0, 200), WHITE)
        text_plain(c, str(int(math.ceil(left))), 230, RED if left < 3.01 else DARK, 0, 0)
        sticker(c, rrect(-50, -440, 100, 70, 16), DARK, shadow=None)


@anim("fragezeichen", QUIZ, "Fragezeichen ?", 2.4, sfx=[("boing", 0.05)], poster=0.4)
def _(c, t, W, H):
    s = pop_in(t, 0.0, 0.5, 2.4) * pop_out(t, 2.0, 0.3)
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2, s, 0.15 * math.sin(t * 6) * math.exp(-t * 0.8)):
        burst(c, 400, 300, 14, PURPLE, t * 0.3, seed=8)
        text_sticker(c, "?", 560, YELLOW, 0, 0)


@anim("ausrufezeichen", QUIZ, "Ausrufezeichen !", 2.4, sfx=[("vine_boom", 0.0)], poster=0.4)
def _(c, t, W, H):
    s = pop_in(t, 0.0, 0.35, 2.6) * pop_out(t, 2.0, 0.3)
    shake = 14 * math.sin(t * 50) * math.exp(-t * 4)
    if s <= 0:
        return
    with Xf(c, W / 2 + shake, H / 2, s):
        burst(c, 420, 280, 12, YELLOW, seed=9)
        text_sticker(c, "!", 560, RED, 0, 0)


@anim("buzzer_knopf", QUIZ, "Buzzer-Knopf gedrückt", 2.6, sfx=[("buzzer_gameshow", 0.75)], poster=0.32)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.4) * pop_out(t, 2.2, 0.3)
    press = clamp(1 - abs(t - 0.8) / 0.18) if t < 1.0 else 0
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2 + 120, s):
        if t > 0.75:
            k = prog(t, 0.75, 0.6)
            burst_lines(c, k, 12, 360, 560, YELLOW, 22)
        sticker(c, ellipse(0, 90, 380, 150), DARK)
        sticker(c, rrect(-380, -10, 760, 100, 0), DARK, shadow=None)
        fill(c, ellipse(0, -10, 380, 150), shade(DARK, 0.25))
        top = -10 - 110 * (1 - press)
        fill(c, rrect(-280, top, 560, -10 - top + 1, 0), DARKRED)
        fill(c, ellipse(0, -10, 280, 105), DARKRED)
        sticker(c, ellipse(0, top, 280, 105), RED, lw=10, shadow=None)
        fill(c, ellipse(-90, top - 35, 80, 25), shade(RED, 0.45))
    # hand/cursor
    k = ease_out_cubic(prog(t, 0.1, 0.6))
    ko = ease_in_cubic(prog(t, 1.4, 0.5))
    cursor(c, W / 2 + 30, lerp(-200, H / 2 + 120 - 110 * (1 - press) - 40, k) - ko * 900, 1.1, press)


# --------------------------------------------------------------- Effekte

@anim("konfetti", FX, "Konfetti-Kanonen", 3.5, size=VERT, sfx=[("pop", 0.0), ("pop", 0.05), ("jubel_cheer", 0.05)], poster=0.3)
def _(c, t, W, H):
    r = np.random.default_rng(12)
    cols = [YELLOW, PINK, RED, PURPLE, ORANGE, WHITE, CYAN]
    for side in (-1, 1):
        for i in range(90):
            delay = r.uniform(0, 0.15)
            tt = t - delay
            ang = math.radians(r.uniform(55, 85))
            v = r.uniform(1500, 2600)
            drag = 1.6
            vx = side * -1 * math.cos(ang) * v
            vy = -math.sin(ang) * v
            col = cols[int(r.integers(len(cols)))]
            sp = r.uniform(4, 12)
            fl = r.uniform(5, 14)
            if tt < 0:
                continue
            e = (1 - math.exp(-drag * tt)) / drag
            x = (W if side > 0 else 0) + vx * e + 40 * math.sin(tt * 3 + i)
            y = H + 40 + vy * e + 380 * tt * tt
            if y > H + 80:
                continue
            confetti_piece(c, x, y, sp * tt + i, math.cos(fl * tt), col, 54, 28)


@anim("glitzer", FX, "Glitzer / Sparkles", 2.8, sfx=[("magie_glitzer", 0.0)], poster=0.4)
def _(c, t, W, H):
    r = np.random.default_rng(5)
    for i in range(16):
        x, y = r.uniform(120, W - 120), r.uniform(120, H - 120)
        t0 = r.uniform(0, 2.0)
        life = r.uniform(0.5, 0.9)
        k = prog(t, t0, life)
        if 0 < k < 1:
            sz = math.sin(k * math.pi) * r.uniform(1.0, 2.0)
            with Xf(c, x, y, sz, k * 1.5):
                sticker(c, poly(star_pts(4, 90, 22)), [WHITE, YELLOW, GOLD_L][i % 3], lw=8, shadow=None)


@anim("blitz", FX, "Blitz-Einschlag", 2.4, sfx=[("donner_blitz", 0.1)], poster=0.1)
def _(c, t, W, H):
    vis = (0.1 < t < 0.2) or (0.26 < t < 0.4) or (0.48 < t < 1.6)
    if not vis:
        return
    r = np.random.default_rng(int(t * 20) if t < 0.5 else 99)
    pts = [(W / 2 + 120, -20)]
    y = -20
    x = W / 2 + 120
    while y < H - 160:
        y += r.uniform(90, 150)
        x += r.uniform(-120, 90)
        pts.append((x, y))
    stroke(c, poly(pts, False), DARK, 70)
    stroke(c, poly(pts, False), YELLOW, 46)
    stroke(c, poly(pts, False), WHITE, 16)
    kb = prog(t, 0.48, 0.5)
    with Xf(c, pts[-1][0], pts[-1][1], 1):
        burst_lines(c, kb, 10, 60, 260, YELLOW, 18)


@anim("explosion_boom", FX, "Comic-Explosion BOOM!", 2.4, sfx=[("explosion", 0.0)], poster=0.3)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.35, 2.2) * pop_out(t, 2.0, 0.3)
    shake = 18 * math.sin(t * 55) * math.exp(-t * 3)
    if s <= 0:
        return
    with Xf(c, W / 2 + shake, H / 2, s):
        burst(c, 500, 330, 13, RED, t * 0.2, seed=21, jitter=0.25)
        burst(c, 400, 260, 11, ORANGE, -t * 0.25, seed=22, jitter=0.25)
        burst(c, 290, 190, 10, YELLOW, t * 0.3, seed=23, jitter=0.2)
        with Xf(c, 0, 0, 1, -0.08):
            text_sticker(c, "BOOM!", 190, WHITE)


@anim("geschenk_oeffnen", FX, "Geschenk öffnen", 3.2, sfx=[("pop", 0.0), ("boing", 0.4, 0.5), ("pop", 1.25), ("tada_fanfare", 1.25)], poster=0.6)
def _(c, t, W, H):
    s = pop_in(t, 0, 0.4) * pop_out(t, 2.8, 0.3)
    shake = 0.12 * math.sin(t * 40) * (0.4 < t < 1.2)
    lid = ease_out_cubic(prog(t, 1.25, 0.7))
    if s <= 0:
        return
    with Xf(c, W / 2, H / 2 + 140, s, shake):
        # burst out of the box
        if t > 1.25:
            k = prog(t, 1.25, 1.3)
            r = np.random.default_rng(4)
            for i in range(22):
                a = r.uniform(-math.pi * 0.9, -math.pi * 0.1)
                v = r.uniform(450, 800)
                x = math.cos(a) * v * k
                y = -150 + math.sin(a) * v * k + 500 * k * k
                if i % 3 == 0:
                    with Xf(c, x, y, 1 - k * 0.5, k * 5):
                        sticker(c, poly(star_pts(5, 50, 22)), YELLOW, lw=6, shadow=None)
                else:
                    confetti_piece(c, x, y, k * 8 + i, math.cos(k * 20 + i), [PINK, PURPLE, ORANGE, WHITE][i % 4], 30, 16)
        sticker(c, rrect(-250, -150, 500, 360, 20), RED)
        fill(c, rrect(-40, -150, 80, 360, 0), YELLOW)
        stroke(c, rrect(-250, -150, 500, 360, 20), DARK, OUT_W)
        with Xf(c, lid * 380, -170 - lid * 380, 1, lid * 1.8):
            sticker(c, rrect(-280, -60, 560, 100, 20), shade(RED, 0.12))
            fill(c, rrect(-40, -60, 80, 100, 0), YELLOW)
            stroke(c, rrect(-280, -60, 560, 100, 20), DARK, OUT_W)
            sticker(c, ellipse(-70, -105, 75, 45), YELLOW, lw=10, shadow=None)
            sticker(c, ellipse(70, -105, 75, 45), YELLOW, lw=10, shadow=None)
            sticker(c, circle(0, -80, 32), shade(YELLOW, -0.1), lw=10, shadow=None)


TEXT_POPS = [
    ("wow", "WOW!", YELLOW, PURPLE, "magie_glitzer"),
    ("omg", "OMG!", WHITE, RED, "vine_boom"),
    ("fail", "FAIL", RED, YELLOW, "trauriges_horn"),
    ("krass", "KRASS!", YELLOW, RED, "impact_boom"),
    ("was", "WAS?!", WHITE, PURPLE, "vinyl_scratch"),
    ("nein", "NEIN!", WHITE, RED, "buzzer_falsch"),
    ("lol", "LOL", YELLOW, PINK, "boing"),
    ("hammer", "HAMMER!", WHITE, ORANGE, "schlag_punch"),
    ("neu", "NEU!", WHITE, PINK, "pop"),
    ("geheim", "GEHEIM", WHITE, DARK, "spannung_dun_dun"),
]


def _textpop(word, fg, bgc, seed):
    def fn(c, t, W, H):
        s = pop_in(t, 0.0, 0.4, 2.4) * pop_out(t, 2.0, 0.3)
        if s <= 0:
            return
        with Xf(c, W / 2, H / 2, s * wobble(t, 0.03, 1.5), -0.07 + 0.03 * math.sin(t * 3)):
            burst(c, 470, 330, 16, bgc, t * 0.15, seed=seed, jitter=0.2)
            _, e = text_path(c, word, 100)
            size = min(240, 100 * 640 / e.width)
            text_sticker(c, word, size, fg)
            burst_lines(c, prog(t, 0.05, 0.5), 12, 460, 560, WHITE, 16)
    return fn


for _i, (_n, _w, _fg, _bg, _snd) in enumerate(TEXT_POPS):
    anim(f"text_{_n}", FX, f"Text-Pop „{_w}“", 2.4, sfx=[(_snd, 0.0)], poster=0.35)(_textpop(_w, _fg, _bg, 30 + _i))

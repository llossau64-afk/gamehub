"""All sound effects. Each entry: name -> (category, German label, builder)."""
import numpy as np
from audio import *  # noqa: F401,F403

SOUNDS = {}


def sfx(name, cat, label):
    def deco(fn):
        SOUNDS[name] = (cat, label, fn)
        return fn
    return deco


# ---------------------------------------------------------------- Klicks & UI

def _click(seed, bright=4000, tone=2800, amp=1.0):
    d = 0.03
    n = bp(noise(d, seed), bright * 0.5, bright * 1.8) * expenv(d, 0.0025, 0.0002)
    s = osc(tone, d) * expenv(d, 0.004, 0.0002)
    return (n + 0.4 * s) * amp


@sfx("klick_maus", "Klicks & UI", "Mausklick")
def _():
    x = seq([(0, _click(1, 4200, 3100)), (0.075, _click(2, 3600, 2600, 0.55))])
    return finish(x, rev=dict(size=0.25, mix=0.08))


@sfx("klick_doppel", "Klicks & UI", "Doppelklick")
def _():
    x = seq([(0, _click(1)), (0.06, _click(2, amp=0.5)), (0.14, _click(3)), (0.2, _click(4, amp=0.5))])
    return finish(x, rev=dict(size=0.25, mix=0.08))


@sfx("klick_soft", "Klicks & UI", "Weicher Klick")
def _():
    d = 0.08
    x = osc(sweep(1400, 700, d), kind="sine") * expenv(d, 0.012, 0.0005)
    x += 0.3 * lp(noise(d, 5), 3000) * expenv(d, 0.004, 0.0002)
    return finish(x)


@sfx("tap_pop", "Klicks & UI", "Tap / Pop")
def _():
    d = 0.12
    x = osc(sweep(950, 280, d, "fast"), kind="sine") * expenv(d, 0.03, 0.001)
    return finish(x, rev=dict(size=0.3, mix=0.1))


@sfx("button_press", "Klicks & UI", "Button drücken")
def _():
    d = 0.1
    a = osc(sweep(600, 450, d), kind="tri") * expenv(d, 0.03, 0.001)
    b = _click(9, 3000, 1800, 0.6)
    return finish(seq([(0, b), (0.005, a)]))


@sfx("schalter_an", "Klicks & UI", "Schalter AN")
def _():
    d = 0.14
    t1 = osc(note("E5"), d, "sine") * expenv(d, 0.04)
    t2 = osc(note("B5"), d, "sine") * expenv(d, 0.06)
    return finish(seq([(0, _click(11)), (0.01, t1 * 0.6), (0.06, t2 * 0.7)]), rev=dict(size=0.4, mix=0.12))


@sfx("schalter_aus", "Klicks & UI", "Schalter AUS")
def _():
    d = 0.14
    t1 = osc(note("B5"), d, "sine") * expenv(d, 0.04)
    t2 = osc(note("E5"), d, "sine") * expenv(d, 0.06)
    return finish(seq([(0, _click(12)), (0.01, t1 * 0.6), (0.06, t2 * 0.7)]), rev=dict(size=0.4, mix=0.12))


@sfx("tastatur_tippen", "Klicks & UI", "Tastatur tippen")
def _():
    r = rng(21)
    parts = []
    t = 0.0
    while t < 1.8:
        amp = r.uniform(0.5, 1.0)
        parts.append((t, _click(int(r.integers(1e6)), r.uniform(2500, 5000), r.uniform(1500, 2500), amp)))
        parts.append((t + 0.07, _click(int(r.integers(1e6)), 2500, 1200, amp * 0.3)))
        t += r.choice([0.08, 0.1, 0.12, 0.16, 0.3], p=[0.3, 0.3, 0.2, 0.15, 0.05])
    # space bar thunk at the end
    parts.append((t + 0.1, lp(_click(99, 1500, 600, 1.4), 2500)))
    return finish(seq(parts), rev=dict(size=0.3, mix=0.1))


@sfx("enter_taste", "Klicks & UI", "Enter-Taste")
def _():
    d = 0.18
    thunk = lp(noise(d, 31), 1800) * expenv(d, 0.02, 0.0005) + osc(sweep(220, 140, d), kind="sine") * expenv(d, 0.04)
    return finish(seq([(0, _click(30, 3000, 1600)), (0.004, thunk * 0.8)]), rev=dict(size=0.3, mix=0.1))


@sfx("scrollen", "Klicks & UI", "Mausrad scrollen")
def _():
    parts = [(i * 0.045 + 0.003 * np.sin(i), _click(40 + i, 5000, 3500, 0.5 + 0.5 * (i % 3 == 0))) for i in range(18)]
    return finish(seq(parts))


@sfx("kamera_ausloeser", "Klicks & UI", "Kamera-Auslöser")
def _():
    d = 0.06
    c1 = bp(noise(d, 50), 1500, 9000) * expenv(d, 0.008, 0.0003)
    c2 = bp(noise(d, 51), 800, 6000) * expenv(d, 0.012, 0.0003)
    whr = bp(noise(0.09, 52), 2000, 6000) * hump(0.09, 0.3)
    return finish(seq([(0, c1), (0.02, whr * 0.25), (0.11, c2 * 0.8)]), rev=dict(size=0.35, mix=0.12))


@sfx("ui_oeffnen", "Klicks & UI", "UI öffnen (Blip hoch)")
def _():
    d = 0.22
    x = osc(sweep(500, 1400, d), kind="sine") * adsr(d, 0.005, 0.05, 0.6, 0.12)
    x += 0.3 * osc(sweep(1000, 2800, d), kind="sine") * adsr(d, 0.005, 0.05, 0.4, 0.12)
    return finish(x, rev=dict(size=0.5, mix=0.15))


@sfx("ui_schliessen", "Klicks & UI", "UI schließen (Blip runter)")
def _():
    d = 0.22
    x = osc(sweep(1300, 450, d), kind="sine") * adsr(d, 0.005, 0.05, 0.6, 0.12)
    x += 0.3 * osc(sweep(2600, 900, d), kind="sine") * adsr(d, 0.005, 0.05, 0.4, 0.12)
    return finish(x, rev=dict(size=0.5, mix=0.15))


@sfx("benachrichtigung_ding", "Klicks & UI", "Benachrichtigung Ding")
def _():
    return finish(bell(note("A6"), 1.6, tau=0.45, index=1.2, ratio=2.0, bright=0.15), rev=dict(size=1.0, mix=0.2))


@sfx("benachrichtigung_chime", "Klicks & UI", "Benachrichtigung Chime")
def _():
    a = bell(note("E6"), 1.4, 0.4, 1.0, 2.0, 0.1)
    b = bell(note("B6"), 1.8, 0.55, 1.0, 2.0, 0.1)
    return finish(seq([(0, a * 0.8), (0.12, b)]), rev=dict(size=1.2, mix=0.22))


@sfx("nachricht_gesendet", "Klicks & UI", "Nachricht gesendet (Swoop)")
def _():
    d = 0.35
    x = bp(noise(d, 60), 1500, 7000) * hump(d, 0.6, 1.5) * 0.4
    x += osc(sweep(400, 1600, d), kind="sine") * hump(d, 0.7, 1.2) * 0.5
    return finish(x, rev=dict(size=0.5, mix=0.15))


@sfx("nachricht_empfangen", "Klicks & UI", "Nachricht empfangen")
def _():
    def pop(f):
        d = 0.12
        return osc(sweep(f * 0.6, f, d, "fast"), kind="sine") * expenv(d, 0.04, 0.001)
    return finish(seq([(0, pop(880)), (0.1, pop(1320))]), rev=dict(size=0.6, mix=0.18))


@sfx("handy_vibration", "Klicks & UI", "Handy vibriert")
def _():
    def buzz(d):
        t = T(d)
        x = osc(160 + 8 * np.sin(2 * np.pi * 7 * t), kind="square") * 0.5 + osc(80, d, "sine")
        return lp(x, 900) * adsr(d, 0.02, 0.05, 0.9, 0.04) * (0.8 + 0.2 * np.sin(2 * np.pi * 31 * t))
    return finish(seq([(0, buzz(0.4)), (0.55, buzz(0.4)), (1.4, buzz(0.4)), (1.95, buzz(0.4))]))


@sfx("fehler_beep", "Klicks & UI", "Fehler-Beep")
def _():
    d = 0.14
    b = lp(osc(note("A3"), d, "square"), 2500) * adsr(d, 0.003, 0.02, 0.8, 0.03)
    return finish(seq([(0, b), (0.17, b)]))


@sfx("erfolg_beep", "Klicks & UI", "Erfolg-Beep")
def _():
    d1, d2 = 0.1, 0.3
    a = osc(note("C6"), d1, "tri") * adsr(d1, 0.003, 0.02, 0.8, 0.03)
    b = osc(note("G6"), d2, "tri") * expenv(d2, 0.12)
    return finish(seq([(0, a), (0.09, b)]), rev=dict(size=0.6, mix=0.15))


@sfx("like_herz_pop", "Klicks & UI", "Like / Herz Pop")
def _():
    d = 0.15
    p = osc(sweep(300, 1100, d, "fast"), kind="sine") * expenv(d, 0.05, 0.001)
    sp = [(0.05 + i * 0.04, bell(f, 0.6, 0.15, 0.6, 2.0, 0.1) * 0.25) for i, f in enumerate([2093, 2637, 3136])]
    return finish(seq([(0, p)] + sp), rev=dict(size=0.6, mix=0.2))


# ------------------------------------------------------------- Übergänge

def _whoosh(d, f0, f1, seed, peak=0.5, q=1.2, pan=(0, 0), tone=False):
    n = noise(d, seed)
    cut = sweep(f0, f1, d)
    x = svf(n, cut, q=q, mode="bp") * hump(d, peak, 1.6)
    x += 0.35 * svf(noise(d, seed + 1), cut * 0.5, q=0.6, mode="bp") * hump(d, peak, 2.0)
    if tone:
        x += 0.12 * osc(cut * 0.25, kind="sine") * hump(d, peak, 2)
    return stereo(x, np.linspace(pan[0], pan[1], len(x)))


@sfx("whoosh_schnell", "Übergänge", "Whoosh schnell")
def _():
    return finish(_whoosh(0.35, 400, 4000, 70, 0.55, pan=(-0.6, 0.6)), rev=dict(size=0.5, mix=0.12))


@sfx("whoosh_langsam", "Übergänge", "Whoosh langsam")
def _():
    return finish(_whoosh(1.2, 250, 3000, 71, 0.6, q=1.5, pan=(-0.4, 0.4)), rev=dict(size=0.8, mix=0.15))


@sfx("swoosh_links", "Übergänge", "Swoosh nach links")
def _():
    return finish(_whoosh(0.45, 600, 3500, 72, 0.5, pan=(0.9, -0.9)))


@sfx("swoosh_rechts", "Übergänge", "Swoosh nach rechts")
def _():
    return finish(_whoosh(0.45, 600, 3500, 73, 0.5, pan=(-0.9, 0.9)))


@sfx("swoosh_hoch", "Übergänge", "Swoosh hoch")
def _():
    return finish(_whoosh(0.5, 300, 6000, 74, 0.75, q=2.0, tone=True), rev=dict(size=0.5, mix=0.12))


@sfx("swoosh_runter", "Übergänge", "Swoosh runter")
def _():
    return finish(_whoosh(0.5, 5000, 250, 75, 0.3, q=2.0, tone=True), rev=dict(size=0.5, mix=0.12))


@sfx("wischen", "Übergänge", "Wischer / Swipe")
def _():
    d = 0.25
    x = bp(noise(d, 76), 1500, 8000) * hump(d, 0.35, 1.3)
    return finish(stereo(x, np.linspace(-0.5, 0.5, len(x))))


@sfx("zoom_rein", "Übergänge", "Reinzoomen")
def _():
    d = 0.7
    w = _whoosh(d, 200, 5000, 77, 0.85, q=2.5, tone=True)
    tone = osc(sweep(120, 900, d), kind="saw")
    tone = lp(tone, 2500) * hump(d, 0.9, 2) * 0.25
    return finish(w + stereo(tone), rev=dict(size=0.4, mix=0.12))


@sfx("zoom_raus", "Übergänge", "Rauszoomen")
def _():
    d = 0.7
    w = _whoosh(d, 5000, 200, 78, 0.15, q=2.5, tone=True)
    tone = osc(sweep(900, 120, d), kind="saw")
    tone = lp(tone, 2500) * hump(d, 0.1, 2) * 0.25
    return finish(w + stereo(tone), rev=dict(size=0.4, mix=0.12))


@sfx("riser_kurz", "Übergänge", "Riser kurz (Spannung)")
def _():
    d = 1.5
    t = T(d)
    n = svf(noise(d, 80), sweep(300, 9000, d), q=1.5, mode="bp")
    f = sweep(110, 880, d)
    tone = sum(osc(f * m, kind="saw") for m in (1, 1.5, 2.003)) / 3
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(sweep(4, 24, d)) / SR)
    tone = lp(tone, 4000) * trem
    env = (t / d) ** 2
    return finish((n * 0.7 + tone * 0.35) * env, rev=dict(size=1.0, mix=0.2))


@sfx("riser_lang", "Übergänge", "Riser lang (Spannung)")
def _():
    d = 4.0
    t = T(d)
    n = svf(noise(d, 81), sweep(200, 10000, d), q=1.8, mode="bp")
    f = sweep(55, 440, d)
    tone = sum(osc(f * m, kind="saw") for m in (1, 1.5, 2.006, 3.0)) / 4
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(sweep(2, 28, d)) / SR)
    tone = svf(tone, sweep(300, 6000, d), q=0.8, mode="lp") * trem
    env = (t / d) ** 2.2
    return finish((n * 0.6 + tone * 0.5) * env, rev=dict(size=1.6, mix=0.25))


@sfx("downer", "Übergänge", "Downer / Abfall")
def _():
    d = 1.6
    f = sweep(600, 40, d)
    x = osc(f, kind="saw") * 0.5 + osc(f, kind="sine")
    x = lp(x, 1500) * expenv(d, 0.7, 0.005)
    n = svf(noise(d, 82), sweep(6000, 200, d), q=1.2, mode="bp") * expenv(d, 0.5)
    return finish(drive(x + n * 0.5, 1.5), rev=dict(size=1.2, mix=0.2))


@sfx("impact_boom", "Übergänge", "Impact / Boom")
def _():
    d = 2.5
    k = kick(d, 180, 38, 0.6) * 1.2
    n = lp(noise(d, 83), 1200) * expenv(d, 0.15, 0.0005)
    c = hp(noise(d, 84), 3000) * expenv(d, 0.05, 0.0005) * 0.3
    return finish(drive(k + n * 0.7 + c, 2.0), rev=dict(size=2.0, mix=0.3, damp=3000))


@sfx("bass_drop", "Übergänge", "Bass Drop")
def _():
    d = 2.2
    t = T(d)
    f = 30 + 170 * np.exp(-t / 0.35)
    x = osc(f, kind="sine") + 0.3 * osc(f * 2, kind="tri")
    x *= adsr(d, 0.005, 0.3, 0.7, 0.8)
    return finish(drive(x, 2.5) + 0.0, rev=dict(size=1.0, mix=0.12, damp=2000))


@sfx("vine_boom", "Übergänge", "Deep Boom (Meme)")
def _():
    d = 2.0
    t = T(d)
    f = 48 + 90 * np.exp(-t / 0.08)
    x = osc(f, kind="sine") + 0.4 * osc(f * 2.01, kind="sine") * np.exp(-t / 0.3)
    x *= expenv(d, 0.55, 0.001)
    x += lp(noise(d, 85), 600) * expenv(d, 0.08) * 0.6
    return finish(drive(x, 3.0), rev=dict(size=2.2, mix=0.35, damp=1800))


@sfx("glitch", "Übergänge", "Glitch")
def _():
    r = rng(86)
    parts = []
    t = 0.0
    while t < 0.9:
        d = r.uniform(0.02, 0.08)
        kind = r.choice(["sq", "noise", "saw"])
        if kind == "sq":
            s = osc(r.uniform(80, 2000), d, "square")
        elif kind == "saw":
            s = osc(sweep(r.uniform(100, 3000), r.uniform(100, 3000), d), kind="saw")
        else:
            s = hp(noise(d, int(r.integers(1e6))), 2000)
        s = crush(s, int(r.integers(3, 7)), int(r.integers(2, 12))) * r.uniform(0.4, 1)
        parts.append((t, s))
        t += d + r.choice([0, 0, 0.02, 0.05])
    return finish(seq(parts))


@sfx("tape_stop", "Übergänge", "Tape Stop / Rewind")
def _():
    d = 1.0
    t = T(d)
    rate = np.clip(1 - t / d, 0, 1) ** 1.5
    base = 110
    f = base * rate + 1
    x = sum(osc(f * m, kind="saw") / (i + 1) for i, m in enumerate((1, 1.5, 2, 3)))
    x = lp(x, 3000) * np.clip(rate * 1.4, 0, 1)
    return finish(x)


@sfx("vinyl_scratch", "Übergänge", "Platten-Scratch")
def _():
    d = 0.6
    t = T(d)
    speed = np.sin(2 * np.pi * 2.6 * t) * np.exp(-t / 0.4)
    f = 300 + 1600 * np.abs(speed)
    x = osc(f, kind="saw") * 0.4 + svf(noise(d, 87), f * 2, q=3, mode="bp") * 1.2
    x *= np.abs(speed) ** 0.7
    return finish(x)


@sfx("swish_impact", "Übergänge", "Swish + Einschlag")
def _():
    w = _whoosh(0.5, 300, 5000, 88, 0.95, q=2, tone=True)
    k = stereo(drive(kick(1.5, 200, 40, 0.35) + lp(noise(1.5, 89), 2000) * expenv(1.5, 0.08), 2))
    return finish(seq([(0, w), (0.48, k)]), rev=dict(size=1.2, mix=0.2))


# ---------------------------------------------------------------- Geld

def _coin_ting(f, seed, tau=0.35):
    d = tau * 4
    t = T(d)
    r = rng(seed)
    x = np.zeros(len(t))
    for ratio, a in ((1, 1), (2.32, 0.6), (4.25, 0.4), (6.63, 0.25)):
        x += a * np.sin(2 * np.pi * f * ratio * t + r.uniform(0, 6)) * np.exp(-t / (tau / ratio ** 0.5))
    return x * np.clip(t / 0.0005, 0, 1)


@sfx("kasse_kaching", "Geld", "Kasse Ka-Ching")
def _():
    drawer = lp(noise(0.3, 90), 2500) * expenv(0.3, 0.05, 0.001)
    rattle = sum(_coin_ting(2600 + 400 * i, 91 + i, 0.08) * 0.15 for i in range(5))
    bell1 = bell(note("E7"), 2.0, 0.6, 1.5, 3.0, 0.4)
    bell2 = bell(note("G#7"), 2.0, 0.6, 1.5, 3.0, 0.4)
    x = seq([(0, _click(92, 3000, 1500)), (0.06, drawer * 0.7), (0.08, rattle),
             (0.12, bell1 * 0.6), (0.2, bell2 * 0.7)])
    return finish(x, rev=dict(size=1.0, mix=0.2))


@sfx("muenze", "Geld", "Münze (Retro)")
def _():
    a = lp(osc(note("B5"), 0.08, "square"), 6000)
    b = lp(osc(note("E6"), 0.6, "square"), 6000) * expenv(0.6, 0.18)
    return finish(seq([(0, a * 0.7), (0.075, b * 0.7)]), rev=dict(size=0.5, mix=0.1))


@sfx("muenze_echt", "Geld", "Münze klimpern")
def _():
    hits = [(0, 1.0), (0.11, 0.6), (0.19, 0.4), (0.25, 0.3), (0.29, 0.2), (0.32, 0.15)]
    parts = [(t, _coin_ting(3200 + 120 * i, 100 + i, 0.25) * a) for i, (t, a) in enumerate(hits)]
    return finish(seq(parts), rev=dict(size=0.6, mix=0.15))


@sfx("muenzen_regen", "Geld", "Münzen-Regen")
def _():
    r = rng(110)
    parts = []
    for i in range(70):
        t = r.uniform(0, 1.6) ** 1.3
        parts.append((t, _coin_ting(r.uniform(2500, 5200), 200 + i, r.uniform(0.08, 0.3)) * r.uniform(0.2, 0.8)))
    x = seq(parts)
    return finish(stereo(x, np.sin(np.arange(len(x)) / 3000) * 0.4), rev=dict(size=0.8, mix=0.2))


@sfx("geld_zaehlen", "Geld", "Geldscheine zählen")
def _():
    r = rng(120)
    parts = []
    for i in range(26):
        d = 0.05
        s = bp(noise(d, 300 + i), 1200, 6000) * expenv(d, 0.012, 0.002)
        s += bp(noise(d, 400 + i), 300, 1500) * expenv(d, 0.006) * 0.5
        parts.append((i * 0.062 + r.uniform(-0.005, 0.005), s * r.uniform(0.6, 1)))
    return finish(seq(parts), rev=dict(size=0.3, mix=0.08))


@sfx("jackpot", "Geld", "Jackpot / Slot")
def _():
    notes = ["C6", "E6", "G6", "C7"] * 4
    parts = [(i * 0.055, lp(osc(note(n), 0.07, "square"), 7000) * expenv(0.07, 0.04) * 0.5) for i, n in enumerate(notes)]
    end = len(notes) * 0.055
    for i, n in enumerate(["C7", "E7", "G7"]):
        parts.append((end + i * 0.02, bell(note(n), 2.0, 0.6, 1.2, 2.0, 0.2) * 0.5))
    for i in range(30):
        r = rng(500 + i)
        parts.append((end + r.uniform(0, 1.2), _coin_ting(r.uniform(2800, 5000), 600 + i, 0.15) * 0.3))
    return finish(seq(parts), rev=dict(size=1.0, mix=0.2))


@sfx("geld_plopp", "Geld", "Geld ploppt rein")
def _():
    d = 0.14
    pop = osc(sweep(250, 1000, d, "fast"), kind="sine") * expenv(d, 0.05, 0.001)
    return finish(seq([(0, pop), (0.05, _coin_ting(3800, 700, 0.3) * 0.5), (0.1, bell(note("E7"), 1.0, 0.3, 1, 3, 0.3) * 0.35)]),
                  rev=dict(size=0.7, mix=0.18))


@sfx("geld_kommt", "Geld", "Geld kommt rein (Cha-Ching + Glitzer)")
def _():
    sw = _whoosh(0.4, 400, 5000, 710, 0.9, q=2)
    bells = [(0.4 + i * 0.07, bell(note(n), 1.5, 0.5, 1.4, 3.0, 0.3) * 0.5) for i, n in enumerate(["E6", "B6", "E7"])]
    sparks = [(0.5 + i * 0.05, bell(f, 0.5, 0.12, 0.5, 2, 0.1) * 0.2) for i, f in enumerate([3520, 4186, 4699, 5274, 5920])]
    x = seq([(0, sw[:, 0])] + bells + sparks)
    return finish(x, rev=dict(size=1.2, mix=0.25))


# -------------------------------------------------------------- Quiz & Gameshow

@sfx("richtige_antwort", "Quiz & Gameshow", "Richtige Antwort")
def _():
    parts = []
    for i, n in enumerate(["C5", "E5", "G5", "C6"]):
        d = 0.5 if i == 3 else 0.12
        s = osc(note(n), d, "tri") + 0.3 * osc(note(n) * 2, d, "sine")
        s *= expenv(d, 0.25 if i == 3 else 0.08, 0.003)
        parts.append((i * 0.08, s * 0.7))
    parts.append((0.24, bell(note("C7"), 1.2, 0.4, 0.8, 2.0, 0.1) * 0.3))
    return finish(seq(parts), rev=dict(size=0.9, mix=0.2))


@sfx("richtig_ding_ding", "Quiz & Gameshow", "Richtig Ding-Ding")
def _():
    a = bell(note("E6"), 1.2, 0.5, 1.2, 2.0, 0.15)
    b = bell(note("G#6"), 1.6, 0.6, 1.2, 2.0, 0.15)
    return finish(seq([(0, a), (0.18, b)]), rev=dict(size=1.0, mix=0.2))


@sfx("falsche_antwort", "Quiz & Gameshow", "Falsche Antwort")
def _():
    def tone(f, d):
        x = osc(f, d, "saw") + osc(f * 1.01, d, "square") * 0.6
        return lp(x, 1600) * adsr(d, 0.01, 0.05, 0.8, 0.08)
    return finish(seq([(0, tone(note("D#3"), 0.22)), (0.25, tone(note("A2"), 0.6))]), rev=dict(size=0.6, mix=0.12))


@sfx("buzzer_falsch", "Quiz & Gameshow", "Buzzer (falsch, laut)")
def _():
    d = 0.9
    x = osc(110, d, "saw") + osc(116.5, d, "saw") + osc(55, d, "square") * 0.6
    x = drive(lp(x, 2200), 3) * adsr(d, 0.005, 0.05, 0.9, 0.06)
    return finish(x)


@sfx("buzzer_gameshow", "Quiz & Gameshow", "Gameshow Buzzer (Einloggen)")
def _():
    d = 0.6
    x = osc(note("A4"), d, "square") + osc(note("E5") * 1.002, d, "square") * 0.7
    x = lp(x, 4500) * adsr(d, 0.003, 0.05, 0.85, 0.05)
    return finish(x, rev=dict(size=0.5, mix=0.1))


@sfx("ding_ding_ding", "Quiz & Gameshow", "Ding Ding Ding (Gewinner)")
def _():
    parts = [(i * 0.28, bell(note("A5"), 2.0, 0.7, 2.0, 3.5, 0.3)) for i in range(3)]
    return finish(seq(parts), rev=dict(size=1.2, mix=0.2))


@sfx("countdown_tick", "Quiz & Gameshow", "Uhr tickt (5 Sek)")
def _():
    def tick(f, seed):
        d = 0.05
        return (osc(f, d, "sine") * expenv(d, 0.008, 0.0003) + bp(noise(d, seed), 2000, 8000) * expenv(d, 0.002, 0.0002) * 0.6)
    parts = [(i * 0.5, tick(2400 if i % 2 == 0 else 2000, 900 + i)) for i in range(10)]
    return finish(seq(parts), rev=dict(size=0.4, mix=0.15))


@sfx("countdown_3_2_1_los", "Quiz & Gameshow", "Countdown 3-2-1-LOS")
def _():
    beep = osc(880, 0.16, "sine") * adsr(0.16, 0.003, 0.02, 0.9, 0.04)
    go = (osc(1760, 0.7, "sine") + 0.3 * osc(3520, 0.7, "sine")) * adsr(0.7, 0.003, 0.05, 0.8, 0.3)
    return finish(seq([(0, beep), (1, beep), (2, beep), (3, go)]), rev=dict(size=0.5, mix=0.12))


@sfx("timer_alarm", "Quiz & Gameshow", "Zeit abgelaufen (Alarm)")
def _():
    parts = []
    for i in range(8):
        d = 0.09
        s = lp(osc(2000, d, "square"), 6000) * adsr(d, 0.002, 0.01, 0.9, 0.01) * 0.6
        parts.append((i * 0.13 + (i // 4) * 0.25, s))
    return finish(seq(parts))


@sfx("trommelwirbel", "Quiz & Gameshow", "Trommelwirbel + Becken")
def _():
    parts = []
    d = 2.2
    t = 0.0
    i = 0
    while t < d:
        amp = 0.25 + 0.75 * (t / d) ** 2
        parts.append((t, snare(0.15, 1000 + i, 210) * amp))
        t += 0.032 + 0.006 * ((i % 2) * 2 - 1) * 0.5
        i += 1
    parts.append((d, crash(3.0, 77) * 1.2))
    parts.append((d, kick(0.8, 140, 45, 0.3) * 1.5))
    return finish(seq(parts), rev=dict(size=1.2, mix=0.18))


@sfx("tada_fanfare", "Quiz & Gameshow", "Ta-Da Fanfare")
def _():
    parts = [(0, brass(note("C4"), 0.13) * 0.6), (0.13, brass(note("C4"), 0.13) * 0.6)]
    chord = sum(brass(note(n), 1.6, bright=4500) for n in ("C4", "E4", "G4", "C5")) * 0.35
    parts.append((0.26, chord))
    parts.append((0.26, crash(2.0, 5) * 0.25))
    return finish(seq(parts), rev=dict(size=1.4, mix=0.22))


@sfx("level_up", "Quiz & Gameshow", "Level Up")
def _():
    ns = ["C5", "E5", "G5", "C6", "E6", "G6", "C7"]
    parts = [(i * 0.06, lp(osc(note(n), 0.1, "pulse25"), 8000) * expenv(0.1, 0.07) * 0.6) for i, n in enumerate(ns)]
    fin = lp(osc(note("C7"), 0.6, "square") + osc(note("G6"), 0.6, "square"), 7000) * expenv(0.6, 0.25) * 0.35
    parts.append((len(ns) * 0.06, fin))
    return finish(seq(parts), rev=dict(size=0.6, mix=0.15))


@sfx("game_over", "Quiz & Gameshow", "Game Over")
def _():
    ns = [("G4", 0.18), ("F#4", 0.18), ("F4", 0.18), ("E4", 0.9)]
    parts = []
    t = 0
    for n, d in ns:
        f = note(n)
        tt = T(d)
        vib = f * (1 + 0.01 * np.sin(2 * np.pi * 6 * tt) * (d > 0.5))
        parts.append((t, lp(osc(vib, kind="square"), 3000) * adsr(d, 0.005, 0.05, 0.7, 0.1) * 0.6))
        t += d + 0.04
    return finish(seq(parts), rev=dict(size=0.7, mix=0.15))


@sfx("power_up", "Quiz & Gameshow", "Power Up")
def _():
    d = 0.8
    t = T(d)
    steps = np.floor(t * 30) / 30
    f = 200 * 2 ** (steps * 4) * (1 + 0.03 * np.sin(2 * np.pi * 25 * t))
    x = lp(osc(f, kind="square"), 7000) * adsr(d, 0.005, 0.1, 0.8, 0.15) * 0.5
    return finish(x, rev=dict(size=0.6, mix=0.15))


@sfx("trauriges_horn", "Quiz & Gameshow", "Trauriges Horn (Wah Wah Wah)")
def _():
    ns = [("D4", 0.45), ("C#4", 0.45), ("C4", 0.45), ("B3", 1.5)]
    parts = []
    t = 0
    for i, (n, d) in enumerate(ns):
        tt = T(d)
        f = note(n) * (1 - 0.04 * np.exp(-tt / 0.05))
        if i == 3:
            f = f * (1 + 0.025 * np.sin(2 * np.pi * 5.5 * tt) * np.clip(tt / 0.3, 0, 1))
        x = osc(f, kind="saw") + 0.4 * osc(f * 1.004, kind="saw")
        cut = 300 + 1600 * adsr(d, 0.08, 0.2, 0.4, 0.2) * (1 + 0.5 * np.sin(2 * np.pi * 5.5 * tt) * (i == 3))
        parts.append((t, svf(x, cut, q=2.5, mode="lp") * adsr(d, 0.05, 0.1, 0.8, 0.2)))
        t += d + 0.05
    return finish(seq(parts), rev=dict(size=1.0, mix=0.18))


@sfx("spannung_dun_dun", "Quiz & Gameshow", "Spannung (Dun Dun Duuun)")
def _():
    def hit(ns, d):
        x = sum(brass(note(n), d, vib=4, bright=2200) for n in ns)
        x += kick(d, 120, 40, 0.5) * 2
        return x
    x = seq([(0, hit(["D2", "D3", "A3", "F3"], 0.35)), (0.45, hit(["D2", "D3", "A3", "F3"], 0.35)),
             (0.95, hit(["C#2", "C#3", "G3", "E3"], 2.2))])
    return finish(drive(x * 0.4, 1.5), rev=dict(size=2.0, mix=0.3, damp=3500))


@sfx("applaus", "Quiz & Gameshow", "Applaus")
def _():
    r = rng(1300)
    d = 4.0
    parts = []
    for p in range(28):
        t = r.uniform(0, 0.4)
        rate = r.uniform(3.5, 6)
        while t < d - 0.3:
            amp = hump(d, 0.3, 0.6)[n_of(min(t, d - 0.01))]
            parts.append((t, clap(int(r.integers(1e6))) * r.uniform(0.3, 1) * amp))
            t += 1 / rate + r.uniform(-0.02, 0.02)
    x = seq(parts)
    return finish(stereo(x, np.sin(np.arange(len(x)) / 7000) * 0.3), rev=dict(size=1.5, mix=0.3))


@sfx("jubel_cheer", "Quiz & Gameshow", "Kurzer Jubel (Party-Tröte + Applaus)")
def _():
    d = 0.9
    t = T(d)
    f = note("A4") * (1 + 0.1 * np.clip(t / 0.1, 0, 1))
    horn = svf(osc(f, kind="saw") + osc(f * 1.5, kind="saw") * 0.5, 2500, q=1.5, mode="lp")
    horn *= adsr(d, 0.03, 0.05, 0.9, 0.15) * (1 + 0.15 * np.sin(2 * np.pi * 12 * t))
    pops = [(0.2 + i * 0.12, clap(1500 + i) * 0.7) for i in range(10)]
    return finish(seq([(0, horn * 0.5)] + pops), rev=dict(size=1.0, mix=0.2))


# --------------------------------------------------------------- Comedy & Meme

@sfx("boing", "Comedy & Meme", "Boing")
def _():
    d = 0.9
    t = T(d)
    f = 180 * (1 + 0.6 * t) * (1 + 0.35 * np.sin(2 * np.pi * 14 * t) * np.exp(-t / 0.35))
    x = osc(f, kind="sine") + 0.3 * osc(f * 2, kind="sine")
    return finish(x * expenv(d, 0.35, 0.003), rev=dict(size=0.4, mix=0.1))


@sfx("pop", "Comedy & Meme", "Pop")
def _():
    d = 0.09
    x = osc(sweep(300, 1600, d, "fast"), kind="sine") * expenv(d, 0.025, 0.0005)
    return finish(x + 0.2 * bp(noise(d, 1400), 1000, 4000) * expenv(d, 0.004))


@sfx("blasen_pops", "Comedy & Meme", "Blasen ploppen")
def _():
    r = rng(1410)
    parts = []
    for i in range(9):
        d = 0.07
        f = r.uniform(500, 1400)
        parts.append((i * r.uniform(0.07, 0.14) + 0.0, osc(sweep(f * 0.4, f, d, "fast"), kind="sine") * expenv(d, 0.02, 0.0005) * r.uniform(0.5, 1)))
    return finish(seq(parts), rev=dict(size=0.4, mix=0.15))


@sfx("pfeife_hoch", "Comedy & Meme", "Lotuspfeife hoch")
def _():
    d = 0.8
    t = T(d)
    f = sweep(500, 2200, d) * (1 + 0.015 * np.sin(2 * np.pi * 6 * t))
    x = osc(f, kind="sine") + 0.15 * bp(noise(d, 1420), 1500, 5000)
    return finish(x * adsr(d, 0.03, 0.1, 0.9, 0.08), rev=dict(size=0.4, mix=0.12))


@sfx("pfeife_runter", "Comedy & Meme", "Lotuspfeife runter")
def _():
    d = 0.8
    t = T(d)
    f = sweep(2200, 450, d) * (1 + 0.015 * np.sin(2 * np.pi * 6 * t))
    x = osc(f, kind="sine") + 0.15 * bp(noise(d, 1421), 1500, 5000)
    return finish(x * adsr(d, 0.03, 0.1, 0.9, 0.08), rev=dict(size=0.4, mix=0.12))


@sfx("bombe_faellt", "Comedy & Meme", "Bombe fällt + Explosion")
def _():
    d = 1.6
    t = T(d)
    f = sweep(2400, 500, d) * (1 + 0.006 * np.sin(2 * np.pi * 5 * t))
    whistle = osc(f, kind="sine") * adsr(d, 0.2, 0.1, 1, 0.02) * 0.5
    ex = _explosion(1500)
    return finish(seq([(0, stereo(whistle)), (d, ex)]), rev=dict(size=1.5, mix=0.2))


def _explosion(seed, d=3.0):
    t = T(d)
    n = svf(noise(d, seed), 150 + 4000 * np.exp(-t / 0.15), q=0.7, mode="lp")
    boom = kick(d, 120, 30, 0.8) * 1.4
    crackle = np.zeros(len(t))
    r = rng(seed + 1)
    idx = r.integers(0, int(len(t) * 0.7), 160)
    crackle[idx] = r.uniform(-1, 1, len(idx))
    crackle = bp(crackle, 1000, 6000) * np.exp(-t / 0.7) * 6
    x = drive(n * expenv(d, 0.9, 0.002) * 1.4 + boom + crackle, 2.0)
    return stereo(x)


@sfx("explosion", "Comedy & Meme", "Explosion")
def _():
    return finish(_explosion(1510), rev=dict(size=2.0, mix=0.25, damp=3000))


@sfx("schlag_punch", "Comedy & Meme", "Schlag / Punch")
def _():
    d = 0.4
    body = kick(d, 220, 60, 0.08) * 1.2
    crack = bp(noise(d, 1520), 800, 5000) * expenv(d, 0.02, 0.0003)
    return finish(drive(body + crack, 2.5), rev=dict(size=0.5, mix=0.12))


@sfx("grillen_stille", "Comedy & Meme", "Grillen (peinliche Stille)")
def _():
    d = 4.0
    parts = []
    for k, (start, f) in enumerate([(0.2, 4400), (0.55, 4700), (1.6, 4400), (2.1, 4700), (3.0, 4400)]):
        for p in range(3):
            dd = 0.04
            tt = T(dd)
            s = osc(f, dd, "sine") * np.sin(np.pi * tt / dd) * (0.6 + 0.4 * np.sin(2 * np.pi * 300 * tt))
            parts.append((start + p * 0.065, s * 0.5))
    amb = lp(noise(d, 1530), 800) * 0.04
    return finish(seq(parts + [(0, amb)]), 0.6, rev=dict(size=1.5, mix=0.3))


@sfx("herzschlag", "Comedy & Meme", "Herzschlag")
def _():
    beat = lambda a: lp(kick(0.3, 90, 40, 0.09), 400) * a
    parts = []
    for i in range(4):
        parts += [(i * 0.85, beat(1.0)), (i * 0.85 + 0.22, beat(0.7))]
    return finish(seq(parts), rev=dict(size=0.6, mix=0.1))


@sfx("sirene", "Comedy & Meme", "Sirene / Alarm")
def _():
    d = 3.0
    t = T(d)
    f = 700 + 400 * np.sin(2 * np.pi * 0.66 * t - np.pi / 2)
    x = osc(f, kind="tri") + 0.3 * osc(f * 2, kind="sine")
    return finish(x * adsr(d, 0.05, 0.1, 1, 0.2), rev=dict(size=1.2, mix=0.25))


@sfx("zensur_piep", "Comedy & Meme", "Zensur-Piep")
def _():
    d = 0.7
    return finish(osc(1000, d, "sine") * adsr(d, 0.005, 0.01, 1, 0.01), 0.7)


@sfx("magie_glitzer", "Comedy & Meme", "Magie / Glitzer")
def _():
    r = rng(1550)
    parts = []
    for i in range(22):
        f = 1800 * 2 ** (i / 9 + r.uniform(-0.05, 0.05))
        parts.append((i * 0.045, bell(f, 0.9, 0.25, 0.6, 2.0, 0.1) * r.uniform(0.3, 0.7)))
    shimmer = bp(noise(1.4, 1551), 6000, 14000) * hump(1.4, 0.4) * 0.08
    x = seq(parts + [(0, shimmer)])
    return finish(stereo(x, np.sin(np.arange(len(x)) / 2500) * 0.6), rev=dict(size=1.5, mix=0.3))


@sfx("laser", "Comedy & Meme", "Laser")
def _():
    def zap():
        d = 0.25
        return lp(osc(sweep(2800, 180, d), kind="square"), 7000) * expenv(d, 0.1, 0.002) * 0.5
    return finish(seq([(0, zap()), (0.18, zap())]), rev=dict(size=0.6, mix=0.15))


@sfx("donner_blitz", "Comedy & Meme", "Blitz + Donner")
def _():
    d = 3.5
    t = T(d)
    crackle = hp(noise(0.25, 1560), 2000) * expenv(0.25, 0.05, 0.0005)
    rumble = lp(noise(d, 1561), 250, 4) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 1.3 * t))) * expenv(d, 1.4, 0.05) * 6
    x = seq([(0, crackle), (0.05, rumble)])
    return finish(drive(x, 1.5), rev=dict(size=2.0, mix=0.3, damp=2000))


@sfx("lufthorn", "Comedy & Meme", "Air Horn")
def _():
    def blast(d):
        t = T(d)
        f = 370 * (1 - 0.05 * np.exp(-t / 0.03))
        x = osc(f, kind="saw") + osc(f * 1.005, kind="saw") + osc(f * 1.26, kind="saw") * 0.8 + osc(f * 0.5, kind="saw") * 0.5
        x = bp(x, 300, 3500)
        return drive(x, 2.5) * adsr(d, 0.01, 0.05, 0.9, 0.05)
    return finish(seq([(0, blast(0.22)), (0.28, blast(0.22)), (0.56, blast(0.22)), (0.84, blast(1.0))]), rev=dict(size=0.8, mix=0.15))


@sfx("sprung_jump", "Comedy & Meme", "Sprung / Jump")
def _():
    d = 0.25
    return finish(lp(osc(sweep(250, 900, d), kind="square"), 6000) * expenv(d, 0.12, 0.002) * 0.6)


@sfx("papier_rascheln", "Comedy & Meme", "Papier / Datei-Swish")
def _():
    d = 0.4
    x = bp(noise(d, 1570), 2500, 9000) * hump(d, 0.4, 1.2) * (0.6 + 0.4 * np.abs(np.sin(np.arange(n_of(d)) / 300)))
    return finish(x, rev=dict(size=0.3, mix=0.08))


@sfx("papier_zerknuellen", "Comedy & Meme", "Papier zerknüllen / Papierkorb")
def _():
    r = rng(1580)
    parts = []
    for i in range(45):
        d = r.uniform(0.01, 0.04)
        parts.append((r.uniform(0, 0.8), bp(noise(d, 1600 + i), 1500, 9000) * expenv(d, d / 3, 0.0005) * r.uniform(0.2, 1)))
    thud = lp(noise(0.2, 1650), 600) * expenv(0.2, 0.04) * 1.5
    return finish(seq(parts + [(0.95, thud)]), rev=dict(size=0.4, mix=0.1))


@sfx("lichtschalter_brumm", "Comedy & Meme", "Licht an (Schalter + Brummen)")
def _():
    d = 1.2
    t = T(d)
    hum = (osc(100, d, "saw") * 0.3 + osc(50, d, "sine")) * adsr(d, 0.05, 0.1, 0.6, 0.4)
    hum = lp(hum, 1200) * (1 + 0.3 * np.sin(2 * np.pi * 3 * t))
    snap = _click(1590, 2500, 1200, 1.5)
    return finish(seq([(0, snap), (0.01, hum * 0.5)]), rev=dict(size=0.5, mix=0.15))


@sfx("ding_glas", "Comedy & Meme", "Glas-Ding (Idee!)")
def _():
    return finish(seq([(0, bell(note("C7"), 2.5, 0.9, 0.5, 1.0, 0.25)), (0, 0.4 * bell(note("C7") * 2.4, 1.5, 0.4, 0.3, 1.0, 0))]), rev=dict(size=1.2, mix=0.2))


def build(name):
    return SOUNDS[name][2]()

"""Phase 2 synthesised audio: barber tools, cloth/chair, register, reviews. 16-bit PCM mono 22050 Hz.
Extends audio.py helpers. Loops are built from exactly periodic components (integer cycles per loop)
and circularly-filtered noise so they are seamless without needing a crossfade."""
import numpy as np
from scipy import signal
from audio import (SR, t_, lp, hp, bp, expenv, place, fade_edges, peak_norm, reverb, write)


def R(seed):
    return np.random.default_rng(seed)


def circ(fn, x):
    """Apply a causal filter circularly (tile x3, keep the middle) so loops stay seamless."""
    n = len(x)
    return fn(np.tile(x, 3))[n:2 * n]


def pnoise(n, seed):
    return R(seed).standard_normal(n)


def noise(dur, seed):
    return R(seed).standard_normal(int(dur * SR))


def tone_env(n, a, d):
    """attack a sec, exponential decay tau d."""
    return expenv(n, d, a)


def sine_sweep(f, amp=None):
    ph = 2 * np.pi * np.cumsum(f) / SR
    return ph


def harmonic_stack(ph, amps):
    return sum(a * np.sin((k + 1) * ph + 0.7 * k) for k, a in enumerate(amps))


def click(dur=0.012, seed=1, lo=900, hi=3500, tau=0.002):
    n = int(dur * SR)
    return bp(noise(dur, seed), lo, hi, 1) * expenv(n, tau, 0.0003)


def hum_amps(n_h, slope, odd=1.0):
    return [(1.0 / (k + 1) ** slope) * (odd if (k + 1) % 2 == 1 else 1.0) for k in range(n_h)]


# ---------------------------------------------------------------- clipper
def clipper_loop_sig(dur, f0, n_h, slope, seed, rattle=0.25, lpf=2600):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * f0 * t
    # tiny, periodic pitch wobble (integer Hz) for a motor-like feel
    ph = ph + 0.012 * np.sin(2 * np.pi * 3 * t) + 0.008 * np.sin(2 * np.pi * 7 * t)
    body = harmonic_stack(ph, hum_amps(n_h, slope, 1.0))
    body *= 1 + 0.10 * np.sin(2 * np.pi * 2 * t + 1.0)
    # blade rattle: band noise amplitude-pulsed at 2*f0 (periodic)
    rn = circ(lambda x: bp(x, 1200, 3800, 1), pnoise(n, seed))
    rn *= 0.5 + 0.5 * np.cos(2 * np.pi * (f0 / 2) * t) ** 2
    x = body / np.max(np.abs(body)) + rattle * rn / np.std(rn) * 0.25
    x = circ(lambda y: lp(y, lpf, 2), x)
    x = circ(lambda y: hp(y, 60, 1), x)
    return x


def clipper():
    x = clipper_loop_sig(2.0, 120, 16, 1.35, 11, lpf=1800)
    write(x, "SFX", "clipper_loop.wav", rms_db=-20)
    # cutting texture: crackle of sparse tiny clicks + brushed noise, periodic
    n = int(1.5 * SR)
    r = R(21)
    cr = np.zeros(n)
    for p in r.integers(0, n, 180):
        cr[p] += r.uniform(0.5, 1.0) * r.choice([-1, 1])
    cr = circ(lambda y: bp(y, 2200, 6500, 2), cr)
    cr = circ(lambda y: lp(y, 5800, 2), cr)
    sh = circ(lambda y: bp(y, 1800, 5000, 1), pnoise(n, 22))
    t = np.arange(n) / SR
    sh *= 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t) ** 2 * 0.8
    x = cr / (np.std(cr) + 1e-9) * 0.7 + sh / np.std(sh) * 0.6
    write(x, "SFX", "clipper_cutting_loop.wav", rms_db=-24)
    # start
    d = 0.3
    n = int(d * SR)
    t = np.arange(n) / SR
    prog = np.clip((t - 0.02) / 0.26, 0, 1)
    f = 30 + 90 * (1 - (1 - prog) ** 2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    m = harmonic_stack(ph, hum_amps(14, 1.15)) * (prog ** 1.2 * (t > 0.02))
    m = m / 2.6 + 0.07 * lp(noise(d, 31), 3000, 1) * prog
    y = lp(m, 2600, 2)
    y = y * np.minimum(1, t / 0.05 + 0.15)
    x = np.zeros(n)
    place(x, click(0.012, 32) * 0.9, 0.0)
    place(x, hp(y, 60, 1), 0.0, 1.0)
    x = fade_edges(x, 3)
    # settle: match the loop level (loop rms -20 dB)
    write(x, "SFX", "clipper_start.wav", peak_db=-8.0)
    # stop
    d = 0.35
    n = int(d * SR)
    t = np.arange(n) / SR
    prog = np.clip(t / 0.3, 0, 1)
    f = 120 * (1 - prog) ** 0.8 + 25
    ph = 2 * np.pi * np.cumsum(f) / SR
    m = harmonic_stack(ph, hum_amps(14, 1.15)) / 2.6
    m *= np.exp(-(t / 0.2) ** 1.6) 
    m += 0.05 * lp(noise(d, 33), 2500, 1) * np.exp(-t / 0.08)
    y = hp(lp(m, 2600, 2), 60, 1)
    x = y.copy()
    place(x, click(0.012, 34) * 0.7, 0.30)
    x = fade_edges(x, 3)
    write(x, "SFX", "clipper_stop.wav", peak_db=-8.0)


def trimmer():
    x = clipper_loop_sig(1.5, 200, 12, 1.4, 41, rattle=0.18, lpf=2400)
    t = np.arange(len(x)) / SR
    x = x * (1 + 0.06 * np.sin(2 * np.pi * 4 * t))
    write(x, "SFX", "trimmer_loop.wav", rms_db=-22)


# ---------------------------------------------------------------- hand tools
def scissors():
    for i in range(4):
        r = R(50 + i)
        d = 0.12
        n = int(d * SR)
        x = np.zeros(n)
        # blade slide: short filtered noise sweep
        slide = bp(noise(d, 60 + i), 2500 + 300 * i, 7000, 1) * expenv(n, 0.02, 0.004)
        place(x, slide[:int(0.05 * SR)], 0.0, 0.35)
        # metallic ring: inharmonic partials
        base = r.uniform(2600, 3400)
        tt = np.arange(n) / SR
        ring = sum(a * np.sin(2 * np.pi * base * m * tt + r.uniform(0, 6)) * np.exp(-tt / s)
                   for m, a, s in [(1, 1, 0.012), (1.52, 0.6, 0.009), (2.31, 0.4, 0.006), (3.1, 0.2, 0.004)])
        c1 = click(0.01, 70 + i, 2000, 7000, 0.0015)
        place(x, ring * 0.35, 0.045 + r.uniform(0, 0.006))
        place(x, c1, 0.045 + r.uniform(0, 0.006), 1.2)
        place(x, click(0.006, 80 + i, 3000, 8000, 0.001), 0.012 + 0.002 * i, 0.25)
        x = lp(x, 8000, 2)
        write(fade_edges(x, 2), "SFX", "scissor_snip_%02d.wav" % (i + 1), -3.0)


def comb():
    for i in (1, 2):
        d = 0.35
        n = int(d * SR)
        t = np.arange(n) / SR
        r = R(90 + i)
        base = bp(noise(d, 95 + i), 1500, 5000, 1)
        # comb teeth: rapid little ticks in a train
        tr = np.zeros(n)
        for k in range(int(0.30 * SR / 90)):
            p = int(0.02 * SR + k * 90 * (1 + r.uniform(-0.1, 0.1)))
            if p < n:
                tr[p] = r.uniform(0.4, 1) * r.choice([-1, 1])
        tr = bp(tr, 2500, 6500, 1)
        env = np.sin(np.pi * np.clip((t - 0.01) / 0.32, 0, 1)) ** 1.5
        x = (0.5 * base / np.std(base) + 0.5 * tr / (np.std(tr) + 1e-9)) * env
        x = lp(x, 5500, 2) 
        write(fade_edges(x, 4), "SFX", "comb_%02d.wav" % i, -9.0 - 0.5 * i)


# ---------------------------------------------------------------- chair / cloth
def chair_creak():
    d = 0.6
    n = int(d * SR)
    t = np.arange(n) / SR
    r = R(110)
    # leather creak: pulse train with wobbling rate, formant filtered
    f = 70 + 25 * np.sin(2 * np.pi * 3.2 * t) + 40 * t
    ph = np.cumsum(f) / SR
    saw = 2 * (ph % 1) - 1
    cr = bp(saw + 0.3 * noise(d, 111), 350, 1100, 2)
    cr = cr * (np.clip(t / 0.08, 0, 1) * np.exp(-((t - 0.25) / 0.2) ** 2))
    # hydraulic squeak: soft rising sine w/ light harmonic
    fs = 1500 + 600 * np.clip((t - 0.3) / 0.25, 0, 1) ** 1.5
    sq = np.sin(2 * np.pi * np.cumsum(fs) / SR) + 0.15 * np.sin(4 * np.pi * np.cumsum(fs) / SR)
    sq *= np.exp(-((t - 0.45) / 0.07) ** 2) * 0.12
    x = cr / np.max(np.abs(cr)) + sq
    x = lp(x, 3500, 2)
    write(fade_edges(x, 8), "SFX", "chair_creak.wav", -14.0)


def rustle(d, seed, dens, lo=600, hi=4500):
    n = int(d * SR)
    r = R(seed)
    nz = bp(noise(d, seed), lo, hi, 1)
    t = np.arange(n) / SR
    # irregular amplitude (many small grains)
    g = np.zeros(n)
    for p in r.integers(0, n, int(dens * d)):
        L = int(r.uniform(0.01, 0.04) * SR)
        g[p:p + L] += r.uniform(0.3, 1) * np.hanning(min(L, n - p) if p + L > n else L)[:len(g[p:p + L])]
    g = lp(g, 120, 1) * 6 + 0.2
    return nz * np.clip(g, 0, None)


def cloth():
    # sit
    d = 0.5
    n = int(d * SR)
    t = np.arange(n) / SR
    rs = rustle(d, 120, 90) * np.clip(t / 0.05, 0, 1) * np.exp(-t / 0.2)
    rs = rs / (np.max(np.abs(rs)) + 1e-9)
    thud_f = 95 * np.exp(-t / 0.05) + 55
    thud = np.sin(2 * np.pi * np.cumsum(thud_f) / SR) * expenv(n, 0.07, 0.006)
    x = np.zeros(n)
    place(x, rs, 0.0, 0.7)
    place(x, thud, 0.19, 0.9)
    place(x, lp(rustle(0.2, 121, 60), 2500, 1) / 3, 0.2, 0.3)
    write(fade_edges(lp(x, 4500, 2), 6), "SFX", "cloth_sit.wav", -6.0)
    # stand
    d = 0.45
    n = int(d * SR)
    t = np.arange(n) / SR
    rs = rustle(d, 125, 80) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.8
    rs = lp(rs, 4000, 1)
    sc = lp(noise(d, 126), 300, 1) * expenv(n, 0.1, 0.03) * 0.4
    x = rs / (np.max(np.abs(rs)) + 1e-9) + sc / (np.max(np.abs(sc)) + 1e-9) * 0.2
    write(fade_edges(x, 8), "SFX", "cloth_stand.wav", -7.0)


def cape_snap():
    d = 0.4
    n = int(d * SR)
    t = np.arange(n) / SR
    # whoosh building then a soft fabric "fwap"
    wh = bp(noise(d, 130), 300, 2500, 1) * (np.sin(np.pi * np.clip(t / 0.22, 0, 1)) ** 2)
    snap_t = 0.2
    sn = bp(noise(d, 131), 500, 3500, 1) * expenv(n, 0.04, 0.001)
    body = np.sin(2 * np.pi * 140 * t) * expenv(n, 0.05, 0.001)
    x = np.zeros(n)
    place(x, wh / np.std(wh), 0.0, 0.25)
    place(x, sn / np.std(sn), snap_t, 1.0)
    place(x, body, snap_t, 0.8)
    place(x, lp(noise(0.15, 132), 1800, 1) * expenv(int(0.15 * SR), 0.05, 0.01) / 3, snap_t + 0.03, 0.4)
    x = lp(x, 4500, 2)
    write(fade_edges(x, 5), "SFX", "cape_snap.wav", -5.0)


# ---------------------------------------------------------------- register / coins
def bell(f, d, tau, n_total=None):
    n = int(d * SR)
    t = np.arange(n) / SR
    parts = [(1, 1.0, tau), (2.76, 0.25, tau * 0.5), (5.4, 0.08, tau * 0.25)]
    return sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / s) for m, a, s in parts) * np.minimum(1, t / 0.002)


def cash_register():
    d = 1.0
    x = np.zeros(int(d * SR))
    # key clunk
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    clunk = (np.sin(2 * np.pi * 180 * np.exp(-t / 0.05) * t * 0 + 2 * np.pi * 0) +
             np.sin(2 * np.pi * np.cumsum(140 * np.exp(-t / 0.03) + 80) / SR)) * expenv(n, 0.025, 0.001)
    clunk += 0.5 * bp(noise(0.08, 140), 600, 3000, 1) * expenv(n, 0.008, 0.0005)
    place(x, lp(clunk, 3500, 1), 0.0, 0.9)
    # mechanism ratchet
    for k in range(5):
        place(x, click(0.008, 141 + k, 1500, 5000, 0.0015), 0.10 + k * 0.022, 0.25)
    # drawer slide: rumble + rolling noise, then stop knock
    ds = int(0.28 * SR)
    td = np.arange(ds) / SR
    sl = bp(noise(0.28, 150), 250, 1800, 1) * np.sin(np.pi * np.clip(td / 0.28, 0, 1)) ** 0.7
    sl += 0.6 * lp(noise(0.28, 151), 200, 1) * np.sin(np.pi * td / 0.28)
    place(x, sl / np.std(sl) * 0.25, 0.20)
    kn = int(0.06 * SR)
    knock = (np.sin(2 * np.pi * 110 * np.arange(kn) / SR) + 0.6 * bp(noise(0.06, 152), 400, 2500, 1)) * expenv(kn, 0.02, 0.001)
    place(x, knock, 0.46, 0.8)
    # bell ding
    place(x, bell(2350, 0.55, 0.16), 0.40, 0.55)
    x = lp(x, 7000, 2)
    x = reverb(x, 0.25, 0.1, seed=153)
    write(fade_edges(x, 5, True), "SFX", "cash_register.wav", -4.0)


def coins():
    d = 0.5
    x = np.zeros(int(d * SR))
    r = R(160)
    times = [0.0, 0.07, 0.15, 0.2, 0.31, 0.38]
    for k, tm in enumerate(times):
        f = r.uniform(2600, 4200)
        n = int(0.14 * SR)
        t = np.arange(n) / SR
        c = sum(a * np.sin(2 * np.pi * f * m * t + r.uniform(0, 6)) * np.exp(-t / s)
                for m, a, s in [(1, 1, 0.045), (1.47, 0.5, 0.03), (2.2, 0.3, 0.02), (3.3, 0.12, 0.01)])
        c[:int(0.006*SR)] += click(0.006, 161 + k, 2500, 8000, 0.001) * 1.0
        place(x, c, tm, (0.9 - 0.08 * k) * r.uniform(0.7, 1))
    x = lp(x, 8000, 2)
    x = reverb(x, 0.2, 0.08, seed=170)
    write(fade_edges(x, 5), "SFX", "coins.wav", -5.0)


# ---------------------------------------------------------------- reviews
def soft_note(f, d, tau=0.25, vib=0.0):
    n = int(d * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (tau * 0.5)) \
        + 0.08 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / (tau * 0.3))
    return x * np.minimum(1, t / 0.012) * np.exp(-t / tau)


def reviews():
    x = np.zeros(int(1.0 * SR))
    for f, at, g in [(523.25, 0.0, 0.8), (659.25, 0.16, 0.85), (783.99, 0.32, 1.0)]:
        place(x, soft_note(f, 0.7, 0.22), at, g)
    x = reverb(lp(x, 4500, 2), 0.5, 0.2, seed=180)
    write(fade_edges(x, 10), "SFX", "review_good.wav", -9.0)
    x = np.zeros(int(0.8 * SR))
    for f, at, g in [(293.66, 0.0, 0.9), (220.0, 0.24, 1.0)]:
        place(x, soft_note(f, 0.55, 0.2), at, g)
    x = reverb(lp(x, 2500, 2), 0.4, 0.15, seed=181)
    write(fade_edges(x, 10), "SFX", "review_bad.wav", -9.0)


def hair_fall():
    d = 0.3
    n = int(d * SR)
    t = np.arange(n) / SR
    x = bp(noise(d, 190), 2500, 7000, 1) * np.sin(np.pi * t / d) ** 2
    x += 0.5 * bp(noise(d, 191), 800, 2500, 1) * np.sin(np.pi * t / d) ** 2
    x = lp(x, 6000, 2)
    write(fade_edges(x, 20), "SFX", "hair_fall.wav", -18.0)


def ui_tool_select():
    d = 0.08
    n = int(d * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(520 + 180 * np.exp(-t / 0.01)) / SR) * expenv(n, 0.012, 0.0008)
    tick = bp(noise(d, 200), 1800, 5500, 1) * expenv(n, 0.002, 0.0003)
    x = lp(body + 0.5 * tick, 5500, 1)
    write(fade_edges(x, 2), "UI", "ui_tool_select.wav", -10.0)


def main():
    clipper()
    trimmer()
    scissors()
    comb()
    chair_creak()
    cloth()
    cape_snap()
    cash_register()
    coins()
    reviews()
    hair_fall()
    ui_tool_select()


if __name__ == "__main__":
    main()

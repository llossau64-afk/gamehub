"""Synthesised audio: UI, SFX, ambience, music. 16-bit PCM mono 22050 Hz."""
import os
import numpy as np
from scipy import signal
from scipy.io import wavfile
from common import AUD

SR = 22050
RNG = np.random.default_rng(2024)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def sos_filter(x, kind, cutoff, order=2):
    nyq = SR / 2
    if isinstance(cutoff, (list, tuple)):
        cutoff = [min(c / nyq, 0.99) for c in cutoff]
    else:
        cutoff = min(cutoff / nyq, 0.99)
    sos = signal.butter(order, cutoff, btype=kind, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, o=2): return sos_filter(x, "low", f, o)
def hp(x, f, o=2): return sos_filter(x, "high", f, o)
def bp(x, lo, hi, o=2): return sos_filter(x, "band", [lo, hi], o)


def noise(dur, rng=None):
    r = rng or RNG
    return r.standard_normal(int(dur * SR))


def expenv(n, tau, attack=0.002):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = int(attack * SR)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e


def place(buf, x, at, gain=1.0):
    i = int(at * SR)
    if i < 0:
        x = x[-i:]
        i = 0
    if i >= len(buf):
        return
    n = min(len(x), len(buf) - i)
    buf[i:i + n] += x[:n] * gain


def peak_norm(x, db):
    p = np.max(np.abs(x)) + 1e-9
    return x * (10 ** (db / 20) / p)


def fade_edges(x, ms=3, out=True):
    n = int(ms * SR / 1000)
    x = x.copy()
    x[:n] *= np.linspace(0, 1, n)
    if out:
        x[-n:] *= np.linspace(1, 0, n)
    return x


def reverb(x, rt=0.5, wet=0.2, seed=5, pre=0.012):
    r = np.random.default_rng(seed)
    n = int(rt * SR * 1.5)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR / (rt / 6.9))
    ir = lp(ir, 5000, 1)
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    wetsig = signal.fftconvolve(x, ir)[: len(x)]
    return x * (1 - wet * 0.5) + wetsig * wet


def write(x, folder, name, peak_db=-3.0, rms_db=None):
    x = np.nan_to_num(x)
    if rms_db is not None:
        x = x * (10 ** (rms_db / 20) / (np.sqrt(np.mean(x ** 2)) + 1e-9))
        pk = np.max(np.abs(x))
        if pk > 0.89:
            x = x * (0.89 / pk)
    else:
        x = peak_norm(x, peak_db)
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    path = os.path.join(AUD, folder, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wavfile.write(path, SR, pcm)
    f = pcm.astype(np.float32) / 32768
    print("%-26s %5.2fs peak %6.1f dBFS rms %6.1f dBFS %d bytes" % (
        folder + "/" + name, len(pcm) / SR, 20 * np.log10(np.max(np.abs(f)) + 1e-9),
        20 * np.log10(np.sqrt(np.mean(f ** 2)) + 1e-9), os.path.getsize(path)))


def loopify(x, n, xf):
    """x has length n+xf; crossfade tail into head for a seamless loop of length n."""
    out = x[:n].copy()
    fi = np.sin(np.linspace(0, np.pi / 2, xf)) ** 1
    fo = np.cos(np.linspace(0, np.pi / 2, xf))
    out[:xf] = out[:xf] * fi + x[n:n + xf] * fo
    return out


# ------------------------------------------------------------------ UI
def ui():
    # hover
    n = int(0.04 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 2200 * t) * expenv(n, 0.008) + 0.5 * bp(noise(0.04), 2500, 6000) * expenv(n, 0.006)
    write(fade_edges(x), "UI", "ui_hover.wav", -16)
    # click (soft wooden)
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    f = 380 + 420 * np.exp(-t / 0.012)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * expenv(n, 0.022)
    tick = bp(noise(0.08), 1200, 4500) * expenv(n, 0.003)
    x = body + 0.45 * tick
    write(fade_edges(lp(x, 6000, 1)), "UI", "ui_click.wav", -9)
    # back
    f = 230 + 240 * np.exp(-t / 0.014)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * expenv(n, 0.028)
    tick = bp(noise(0.08, np.random.default_rng(3)), 700, 2500) * expenv(n, 0.003)
    write(fade_edges(lp(body + 0.35 * tick, 4000, 1)), "UI", "ui_back.wav", -12)
    # whoosh
    d = 0.7
    t = t_(d)
    nz = noise(d, np.random.default_rng(4))
    x = np.zeros_like(t)
    for lo, hi, c, w, g in ((300, 900, 0.30, 0.13, 1.0), (700, 2200, 0.36, 0.12, 0.8), (1800, 5000, 0.42, 0.10, 0.5)):
        e = np.exp(-((t - c) ** 2) / (2 * w ** 2))
        x += bp(nz, lo, hi) * e * g
    x *= smooth_fade(len(x), 0.04, 0.12)
    write(x, "UI", "ui_whoosh.wav", -10)
    # toast: two mellow notes
    d = 0.75
    buf = np.zeros(int(d * SR))
    for f0, at in ((659.25, 0.0), (880.0, 0.14)):
        n = int(0.6 * SR)
        t = np.arange(n) / SR
        n_ = (np.sin(2 * np.pi * f0 * t) + 0.25 * np.sin(2 * np.pi * 2 * f0 * t) * np.exp(-t / 0.08) + 0.08 * np.sin(2 * np.pi * 3 * f0 * t) * np.exp(-t / 0.05)) * expenv(n, 0.16, 0.004)
        place(buf, n_, at)
    buf = reverb(buf, 0.35, 0.15)
    write(fade_edges(buf, 8), "UI", "ui_toast.wav", -14)


def smooth_fade(n, a, b):
    e = np.ones(n)
    ia, ib = int(a * SR), int(b * SR)
    e[:ia] = np.sin(np.linspace(0, np.pi / 2, ia)) ** 2
    e[-ib:] = np.cos(np.linspace(0, np.pi / 2, ib)) ** 2
    return e


# ------------------------------------------------------------------ SFX
def metal_hit(buf, at, freqs, taus, gains, amp=1.0, dur=0.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f, tau, g in zip(freqs, taus, gains):
        x += g * np.sin(2 * np.pi * f * t + RNG.uniform(0, 6.28)) * np.exp(-t / tau)
    x *= np.minimum(1, t / 0.0005)
    x += 0.4 * bp(noise(dur), 3000, 9000, 1) * expenv(n, 0.002)
    place(buf, x, at, amp)


def bell_jingle(dur, strikes, amp=1.0, seed=8):
    r = np.random.default_rng(seed)
    buf = np.zeros(int(dur * SR))
    base = [2349.3, 3136.0, 4186.0, 5274.0, 6310.0]
    for at, a in strikes:
        det = r.uniform(0.985, 1.015)
        metal_hit(buf, at, [b * det for b in base], [0.35, 0.28, 0.18, 0.12, 0.07], [1, 0.8, 0.55, 0.35, 0.2], a * amp, min(dur - at, 0.9))
    return buf


def sfx():
    r = np.random.default_rng(7)
    # door unlock 0.8s
    buf = np.zeros(int(0.85 * SR))
    for at in (0.02, 0.07, 0.12, 0.17):  # key insertion rattle
        metal_hit(buf, at, [3400, 5100], [0.012, 0.01], [1, 0.6], 0.12, 0.05)
    for at in (0.3, 0.33, 0.37, 0.41):   # key turning, tumblers
        metal_hit(buf, at, [2600 + r.uniform(-200, 200), 4100, 5700], [0.02, 0.015, 0.01], [1, 0.7, 0.4], 0.28, 0.08)
    # latch clunk
    n = int(0.25 * SR); t = np.arange(n) / SR
    clunk = (np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.04) + 0.5 * bp(noise(0.25, r), 800, 3500) * expenv(n, 0.006))
    place(buf, clunk, 0.52, 0.9)
    metal_hit(buf, 0.52, [2100, 3300, 4900], [0.04, 0.03, 0.02], [1, 0.6, 0.4], 0.35, 0.2)
    metal_hit(buf, 0.68, [1700, 2900], [0.025, 0.02], [1, 0.5], 0.22, 0.1)
    write(fade_edges(reverb(buf, 0.25, 0.1)), "SFX", "door_unlock.wav", -3)

    # door open 1.5s
    d = 1.5
    n = int(d * SR); t = np.arange(n) / SR
    cs = 0.12; ce = 1.05
    seg = (t > cs) & (t < ce)
    u = np.clip((t - cs) / (ce - cs), 0, 1)
    f0 = 150 + 110 * np.sin(u * np.pi * 0.9) + 25 * np.sin(2 * np.pi * 5.5 * t)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    saw = signal.sawtooth(ph) * 0.6 + signal.square(ph, 0.3) * 0.4
    # formant-ish resonances give the creak voice
    cr = bp(saw, 500, 900, 2) * 1.2 + bp(saw, 1400, 2200, 2) * 0.7 + bp(saw, 2800, 3600, 2) * 0.25
    stick = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 17 * t * (1 + 0.3 * u))) * 0.5 + 0.25 * lp(noise(d, r), 60, 1) * 4
    cenv = np.sin(np.pi * u) ** 0.8 * seg
    creak = cr * stick * cenv
    creak = peak_norm(creak, -9)
    # latch click at start
    buf = creak.copy()
    metal_hit(buf, 0.04, [2000, 3200], [0.02, 0.015], [1, 0.6], 0.3, 0.1)
    jingle = bell_jingle(d, [(0.1, 0.7), (0.19, 0.5), (0.31, 0.45), (0.5, 0.25), (0.62, 0.15)], 0.25)
    buf = buf + jingle
    write(fade_edges(reverb(buf, 0.3, 0.08), 6), "SFX", "door_open.wav", -3)

    # door close 1.0s
    d = 1.0
    buf = np.zeros(int(d * SR))
    n = int(0.3 * SR); t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * (80 + 60 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.06) + 0.8 * lp(noise(0.3, r), 700) * expenv(n, 0.03) + 0.25 * bp(noise(0.3, r), 1200, 3500) * expenv(n, 0.008)
    place(buf, thud, 0.05, 0.9)
    metal_hit(buf, 0.06, [2200, 3400], [0.02, 0.015], [1, 0.6], 0.2, 0.1)
    buf += bell_jingle(d, [(0.07, 0.6), (0.14, 0.4), (0.26, 0.3), (0.4, 0.15)], 0.22, 11)
    write(fade_edges(reverb(buf, 0.3, 0.08), 6), "SFX", "door_close.wav", -3)

    # footsteps
    for i in range(4):
        rr = np.random.default_rng(100 + i)
        n = int(0.12 * SR); t = np.arange(n) / SR
        fth = rr.uniform(95, 135)
        thump = np.sin(2 * np.pi * (fth + 70 * np.exp(-t / 0.012)) * t) * np.exp(-t / rr.uniform(0.018, 0.028))
        heel = bp(noise(0.12, rr), rr.uniform(1500, 2400), rr.uniform(3500, 5000)) * expenv(n, rr.uniform(0.004, 0.007), 0.0005)
        scuff = bp(noise(0.12, rr), 600, 2200) * np.exp(-((t - rr.uniform(0.04, 0.06)) ** 2) / (2 * 0.012 ** 2)) * 0.25
        x = thump + 0.55 * heel + scuff
        write(fade_edges(lp(x, 7000, 1), 2), "SFX", "footstep_%02d.wav" % (i + 1), -8)

    # trash pickup 0.4s
    rr = np.random.default_rng(31)
    n = int(0.4 * SR)
    imp = np.zeros(n)
    for _ in range(70):
        p = int(abs(rr.beta(1.2, 1.8)) * (n - 400))
        imp[p] += rr.uniform(0.2, 1) * rr.choice([-1, 1])
    k = bp(noise(0.02, rr), 2500, 9000, 1)
    cr = signal.fftconvolve(imp, k)[:n]
    cr += 0.35 * bp(noise(0.4, rr), 1500, 6000) * np.exp(-((np.arange(n) / SR - 0.12) ** 2) / (2 * 0.07 ** 2))
    cr *= smooth_fade(n, 0.01, 0.12)
    write(cr, "SFX", "trash_pickup.wav", -4)

    # objective complete: 3 notes rising, vibraphone/rhodes
    d = 1.4
    buf = np.zeros(int(d * SR))
    for f0, at, a in ((523.25, 0.0, 0.8), (659.25, 0.17, 0.85), (783.99, 0.34, 1.0)):
        buf_n = epiano(f0, 1.1, 1.0)
        place(buf, buf_n, at, a)
        place(buf, epiano(f0 * 0.5, 1.0, 0.4) * 0.5, at, a * 0.4)
    # final bright octave sparkle
    place(buf, epiano(1046.5, 0.8, 0.6) * 0.3, 0.34, 1)
    buf = reverb(buf, 0.6, 0.22)
    write(fade_edges(buf, 5), "SFX", "objective_complete.wav", -3)

    # inspect tools 0.5s
    buf = np.zeros(int(0.55 * SR))
    metal_hit(buf, 0.01, [2300, 3650, 5200, 7100], [0.09, 0.07, 0.05, 0.03], [1, 0.8, 0.6, 0.35], 1.0, 0.4)
    metal_hit(buf, 0.17, [1900, 3100, 4400], [0.06, 0.04, 0.03], [1, 0.7, 0.4], 0.55, 0.3)
    sc = bp(noise(0.12, r), 3000, 8000) * np.sin(np.linspace(0, np.pi, int(0.12 * SR))) ** 2 * 0.15
    place(buf, sc, 0.32)
    write(fade_edges(lp(buf, 9500, 1), 3), "SFX", "inspect_tools.wav", -3)

    # clipper buzz: loopable (integer cycles in 1 s)
    d = 1.0
    t = t_(d)
    x = np.zeros_like(t)
    for h, g in ((1, 1.0), (2, 0.6), (3, 0.55), (4, 0.3), (5, 0.35), (6, 0.2), (8, 0.12), (10, 0.08)):
        x += g * np.sin(2 * np.pi * 100 * h * t + h * 0.7)
    x *= 1 + 0.35 * np.sin(2 * np.pi * 50 * t)             # blade reciprocation
    x = np.tanh(1.6 * x)
    ext = noise(1.3, np.random.default_rng(55))
    nz = bp(ext, 2500, 6500) * 0.5
    nz = loopify(nz, SR, int(0.2 * SR)) if len(nz) >= SR + int(0.2 * SR) else nz[:SR]
    x = x * 0.7 + nz * 0.25 * (1 + 0.5 * np.sin(2 * np.pi * 50 * t))
    x = lp(np.tile(x, 3), 8000, 1)[SR:2 * SR]
    # slight wobble in level that still loops
    x *= 1 + 0.04 * np.sin(2 * np.pi * 3 * t)
    write(x, "SFX", "clipper_buzz.wav", -6)


def epiano(f, dur, vel=1.0, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = (1.1 * bright * vel) * np.exp(-t / 0.35) + 0.15
    mod = np.sin(2 * np.pi * f * t) * idx
    car = np.sin(2 * np.pi * f * t + mod)
    tine = 0.06 * vel * bright * np.sin(2 * np.pi * f * 7 * t) * np.exp(-t / 0.05)
    env = np.exp(-t / (0.9 if f < 400 else 0.6)) * np.minimum(1, t / 0.004)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.6 * t)
    x = (car + tine) * env * trem * vel
    rel = int(0.05 * SR)
    x[-rel:] *= np.linspace(1, 0, rel)
    return x


# ------------------------------------------------------------------ Ambience
def ambience():
    N = 30 * SR
    XF = 2 * SR
    t = np.arange(N) / SR
    r = np.random.default_rng(900)
    # shop
    ext = N + XF
    room = lp(r.standard_normal(ext), 220, 2) * 1.0
    room += 0.5 * bp(r.standard_normal(ext), 300, 900, 1) * (0.3 + 0.2 * lp(r.standard_normal(ext), 0.5, 1) * 30)
    room += 0.25 * hp(lp(r.standard_normal(ext), 3000, 1), 1500, 1) * 0.5
    x = loopify(room, N, XF)
    x = x / x.std() * 0.1
    hum = sum(g * np.sin(2 * np.pi * 60 * k * t + k) for k, g in ((1, 1), (2, 0.5), (3, 0.25)))
    x += 0.012 * hum
    # ceiling fan: slow periodic whoosh (50 rotations in 30 s)
    fan_n = loopify(bp(r.standard_normal(ext), 250, 1100, 1), N, XF)
    fan_n /= fan_n.std()
    blade = 0.5 + 0.5 * np.cos(2 * np.pi * 50 / 30 * t)
    x += 0.020 * fan_n * (blade ** 2)
    x += 0.004 * np.sin(2 * np.pi * 9 * t)  # low motor thrum
    # clock tick every second (tick/tock alternate)
    for s in range(30):
        at = s + 0.37
        n = int(0.03 * SR); tt = np.arange(n) / SR
        f1 = 3100 if s % 2 == 0 else 2500
        tick = (np.sin(2 * np.pi * f1 * tt) * np.exp(-tt / 0.004) + 0.7 * bp(r.standard_normal(n), 1500, 5500) * np.exp(-tt / 0.003))
        tick += 0.4 * np.sin(2 * np.pi * 900 * tt) * np.exp(-tt / 0.012)
        i = int(at * SR)
        x[i:i + n] += 0.045 * tick
    write(x, "Ambience", "shop_ambience.wav", rms_db=-18)

    # street (muffled)
    r = np.random.default_rng(901)
    tr = lp(r.standard_normal(ext), 140, 2)
    tr = tr / tr.std() * 0.7
    tr2 = lp(r.standard_normal(ext), 450, 2) * (0.5 + 0.5 * lp(r.standard_normal(ext), 0.3, 1) / 0.0 if False else 1)
    tr2 = tr2 / tr2.std() * 0.25
    base = loopify(tr + tr2, N, XF)
    # slow breathing of traffic density
    base *= 0.8 + 0.2 * np.sin(2 * np.pi * 2 / 30 * t + 1.0)
    wind = loopify(bp(r.standard_normal(ext), 250, 700, 1), N, XF)
    wind = wind / wind.std()
    wmod = 0.5 + 0.5 * np.sin(2 * np.pi * 3 / 30 * t) * np.sin(2 * np.pi * 5 / 30 * t + 2)
    x = base * 0.5 + wind * 0.12 * (0.3 + wmod)
    # car passes
    for at, dur, dirn, g in ((4.0, 5.0, 1, 1.0), (13.0, 4.0, -1, 0.7), (21.0, 5.5, 1, 0.85)):
        n = int(dur * SR); tt = np.arange(n) / SR
        u = tt / dur
        env = np.sin(np.pi * u) ** 2.2
        nz = r.standard_normal(n)
        # swept lowpass emulating doppler / distance: use bandpassed noise blocks
        out = np.zeros(n)
        blocks = 12
        for b in range(blocks):
            a, bnd = int(b * n / blocks), int((b + 1) * n / blocks)
            cf = 260 + 380 * np.sin(np.pi * (b + 0.5) / blocks)
            seg = bp(nz, cf * 0.6, cf * 1.8, 1)[a:bnd]
            out[a:bnd] = seg
        engine = np.sin(2 * np.pi * np.cumsum(70 + 18 * (1 - 2 * u) * dirn) / SR) * 0.5
        veh = (out / out.std() * 0.6 + engine) * env * g
        i = int(at * SR)
        x[i:i + n] += 0.35 * veh
    x = lp(x, 1800, 2)
    write(x, "Ambience", "street_ambience.wav", rms_db=-18)


# ------------------------------------------------------------------ Music
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)


def music():
    BPM = 75
    beat = 60 / BPM
    bar = 4 * beat
    BARS = 20
    N = int(round(BARS * bar * SR))
    TAIL = 4 * SR
    buf = np.zeros(N + TAIL)
    rr = np.random.default_rng(1962)
    # chords (rootless voicings) & bass roots
    chords = [
        ([53, 57, 60, 64], 38, 45),   # Dm9  F A C E   | bass D2 -> A2
        ([53, 59, 64, 69], 43, 38),   # G13  F B E A   | G2 -> D2
        ([52, 55, 59, 62], 36, 43),   # Cmaj9 E G B D  | C2 -> G2
        ([55, 61, 64, 70], 33, 40),   # A7b9 G C# E Bb | A1 -> E2
    ]
    # melodic pools (chord tones/colour) per chord
    mel_pool = [[69, 72, 74, 76, 77], [71, 74, 76, 77, 81], [71, 72, 74, 76, 79], [70, 72, 73, 76, 79]]
    next_root = [43, 36, 33, 38]
    sw = 0.16 * beat / 2  # swing push of off-beat eighths (~ 58% feel)

    def tm(b, off=0.0):  # beat -> seconds, with swing for off-beats and human jitter
        frac = b % 1.0
        s = b * beat
        if abs(frac - 0.5) < 1e-6:
            s += sw
        return max(s + rr.normal(0, 0.006) + off, 0.004)

    for bi in range(BARS):
        ch = bi % 4
        notes, root, fifth = chords[ch]
        t0 = bi * bar
        # --- electric piano comping
        for beats, vel, dur in ((0.0, 1.0, 2.4), (1.5, 0.55, 0.9), (2.5, 0.7, 1.4)):
            if bi % 8 == 7 and beats == 2.5:
                continue
            at = t0 + tm(beats)
            for k, m in enumerate(notes):
                v = vel * rr.uniform(0.9, 1.05)
                place(buf, epiano(midi(m), dur + 1.0, v, 0.9) * 0.085, at + k * 0.012)
        # --- melody every other bar group (sparse) with softer, rounder tone
        if bi % 4 != 0 or bi >= 4:
            pool = mel_pool[ch]
            pos = [0.5, 1.0, 2.0, 3.0, 3.5]
            for pb in pos:
                if rr.random() < 0.45:
                    m = int(rr.choice(pool))
                    at = t0 + tm(pb)
                    place(buf, epiano(midi(m), 1.6, 0.6, 0.55) * 0.07, at)
        # --- bass: sine + a touch of harmonic, round pluck
        def bass(m, at, dur, g):
            f = midi(m)
            n = int(dur * SR); tt = np.arange(n) / SR
            x = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt / 0.15) + 0.12 * np.sin(2 * np.pi * 3 * f * tt) * np.exp(-tt / 0.06))
            x *= np.exp(-tt / (dur * 0.55)) * np.minimum(1, tt / 0.006)
            x[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
            place(buf, x, at, g)
        bass(root, t0 + tm(0), beat * 1.6, 0.34)
        bass(fifth, t0 + tm(2.5), beat * 1.0, 0.26)
        nr = next_root[ch]
        bass(nr + (1 if nr < root else -1) * 1 if False else nr - 1 if nr > 40 else nr + 1, t0 + tm(3.5), beat * 0.45, 0.2)
        # --- soft kick on 1 and 3
        for kb, kg in ((0.0, 0.5), (2.0, 0.3)):
            n = int(0.14 * SR); tt = np.arange(n) / SR
            kick = np.sin(2 * np.pi * (48 + 55 * np.exp(-tt / 0.02)) * tt) * np.exp(-tt / 0.05)
            place(buf, kick, t0 + tm(kb), kg * 0.45)
        # --- brushed hi-hat (eighths) and brush swish on 2 & 4
        for e in range(8):
            b = e * 0.5
            n = int(0.05 * SR)
            hh = hp(rr.standard_normal(n), 5500, 1) * expenv(n, 0.012 if e % 2 == 0 else 0.008, 0.001)
            vel = (0.5 if e % 2 == 0 else 0.3) * (1.0 if e in (2, 6) else 0.8) * rr.uniform(0.8, 1.1)
            place(buf, hh, t0 + tm(b), vel * 0.07)
        for sb in (1.0, 3.0):
            n = int(0.22 * SR); tt = np.arange(n) / SR
            sn = bp(rr.standard_normal(n), 1800, 6500, 1) * (np.minimum(1, tt / 0.03) * np.exp(-tt / 0.07))
            place(buf, sn, t0 + tm(sb), 0.07)
    # vinyl-ish soft crackle
    crk = np.zeros(N + TAIL)
    for p in rr.integers(0, N, int(N / SR * 3)):
        crk[p] = rr.uniform(0.2, 1) * rr.choice([-1, 1])
    buf += 0.004 * lp(crk, 4000, 1)
    buf += 0.0015 * lp(rr.standard_normal(N + TAIL), 3000, 1)
    # warmth: gentle tape lowpass + tanh saturation
    buf = lp(buf, 5200, 2)
    buf = np.tanh(buf * 2.2) / 2.2
    buf = reverb(buf, 0.9, 0.18, seed=17)
    buf = hp(buf, 35, 2)
    # fold tail onto the start for a seamless loop
    out = buf[:N].copy()
    out[:TAIL] += buf[N:N + TAIL]
    write(out, "Music", "menu_music.wav", -3.0)


if __name__ == "__main__":
    import sys
    which = sys.argv[1:] or ["ui", "sfx", "ambience", "music"]
    for w in which:
        globals()[w]()

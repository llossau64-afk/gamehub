"""Small synthesis toolkit used to build every sound effect procedurally."""
import numpy as np
from scipy import signal

SR = 44100
_rng = np.random.default_rng(7)


def rng(seed):
    return np.random.default_rng(seed)


def n_of(d):
    return max(1, int(round(d * SR)))


def T(d):
    return np.arange(n_of(d)) / SR


def silence(d):
    return np.zeros(n_of(d))


def _freq_array(freq, d):
    if np.isscalar(freq):
        return np.full(n_of(d), float(freq))
    return np.asarray(freq, dtype=float)


def osc(freq, d=None, kind="sine", phase=0.0):
    """Oscillator; freq may be a scalar or a per-sample array. Saw/square are 4x oversampled."""
    f = _freq_array(freq, d)
    if kind in ("sine", "tri"):
        ph = 2 * np.pi * np.cumsum(f) / SR + phase
        if kind == "sine":
            return np.sin(ph)
        return 2 / np.pi * np.arcsin(np.sin(ph))
    f4 = np.repeat(f, 4)
    ph = np.cumsum(f4) / (SR * 4) + phase / (2 * np.pi)
    if kind == "saw":
        x = 2 * (ph % 1.0) - 1
    elif kind == "square":
        x = np.where((ph % 1.0) < 0.5, 1.0, -1.0)
    elif kind == "pulse25":
        x = np.where((ph % 1.0) < 0.25, 1.0, -1.0)
    else:
        raise ValueError(kind)
    return signal.resample_poly(x, 1, 4)[: len(f)]


def noise(d, seed=None):
    r = _rng if seed is None else rng(seed)
    return r.uniform(-1, 1, n_of(d))


def sweep(f0, f1, d, curve="exp"):
    t = np.linspace(0, 1, n_of(d))
    if curve == "exp":
        return f0 * (f1 / f0) ** t
    if curve == "lin":
        return f0 + (f1 - f0) * t
    if curve == "fast":  # quick start then settle
        return f1 + (f0 - f1) * np.exp(-t * 6)
    raise ValueError(curve)


def expenv(d, tau, attack=0.002):
    t = T(d)
    e = np.exp(-t / tau)
    if attack > 0:
        e *= np.clip(t / attack, 0, 1)
    return e


def adsr(d, a=0.01, dcy=0.1, s=0.7, r=0.1):
    n = n_of(d)
    t = T(d)
    e = np.empty(n)
    rel_start = max(d - r, a + dcy)
    e = np.where(t < a, t / max(a, 1e-6), 0)
    m = (t >= a) & (t < a + dcy)
    e = np.where(m, 1 - (1 - s) * (t - a) / max(dcy, 1e-6), e)
    e = np.where((t >= a + dcy) & (t < rel_start), s, e)
    e = np.where(t >= rel_start, s * np.clip(1 - (t - rel_start) / max(r, 1e-6), 0, 1), e)
    return e


def hump(d, peak=0.5, power=2.0):
    """Smooth swell up then down, peak at fraction `peak`."""
    t = np.linspace(0, 1, n_of(d))
    up = np.clip(t / peak, 0, 1)
    dn = np.clip((1 - t) / (1 - peak), 0, 1)
    return np.where(t < peak, up ** power, dn ** power)


def _sos(kind, f, order=2):
    if kind == "bp":
        lo, hi = f
        hi = min(hi, SR / 2 * 0.95)
        return signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.butter(order, min(f, SR / 2 * 0.95), btype=kind, fs=SR, output="sos")


def lp(x, f, order=2):
    return signal.sosfilt(_sos("low", f, order), x)


def hp(x, f, order=2):
    return signal.sosfilt(_sos("high", f, order), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("bp", (lo, hi), order), x)


def svf(x, cutoff, q=0.7, mode="bp"):
    """Time-varying state variable filter (TPT form). cutoff scalar or per-sample array."""
    x = np.asarray(x, float)
    c = _freq_array(cutoff, len(x) / SR) if not np.isscalar(cutoff) else np.full(len(x), float(cutoff))
    c = np.clip(c, 20, SR * 0.45)
    g = np.tan(np.pi * c / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    ic1 = ic2 = 0.0
    out = np.empty_like(x)
    xs = x.tolist()
    gs = g.tolist()
    a1s = a1.tolist()
    o = [0.0] * len(xs)
    for i in range(len(xs)):
        gi = gs[i]
        v3 = xs[i] - ic2
        v1 = a1s[i] * ic1 + gi * a1s[i] * v3
        v2 = ic2 + gi * v1
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        if mode == "lp":
            o[i] = v2
        elif mode == "bp":
            o[i] = v1
        else:
            o[i] = xs[i] - k * v1 - v2
    out[:] = o
    return out


def drive(x, amt=2.0):
    return np.tanh(x * amt) / np.tanh(amt)


def crush(x, bits=6, hold=4):
    y = np.repeat(x[::hold], hold)[: len(x)]
    q = 2 ** bits
    return np.round(y * q) / q


def norm(x, peak=0.89):
    m = np.max(np.abs(x))
    return x if m == 0 else x * (peak / m)


def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    a, b = n_of(fin), n_of(fout)
    if x.ndim == 1:
        x[:a] *= np.linspace(0, 1, a)
        x[-b:] *= np.linspace(1, 0, b)
    else:
        x[:a] *= np.linspace(0, 1, a)[:, None]
        x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


def place(dst, src, at):
    """Mix src into dst starting at `at` seconds, growing dst as needed."""
    i = n_of(at) if at > 0 else 0
    end = i + len(src)
    if end > len(dst):
        pad = np.zeros((end - len(dst),) + dst.shape[1:])
        dst = np.concatenate([dst, pad])
    dst[i:end] += src
    return dst


def seq(parts):
    """parts: list of (time, signal)."""
    st = any(s.ndim == 2 for _, s in parts)
    parts = [(at, stereo(s) if st and s.ndim == 1 else s) for at, s in parts]
    out = np.zeros((1, 2)) if st else np.zeros(1)
    for at, s in parts:
        out = place(out, s, at)
    return out


def stereo(x, pan=0.0):
    """pan -1..1, scalar or per-sample array."""
    th = (np.asarray(pan) + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)], axis=1) * np.sqrt(2)


def reverb(x, size=1.2, mix=0.25, damp=5000, seed=3):
    """Convolution reverb with a synthetic stereo tail. x mono or stereo."""
    if x.ndim == 1:
        x = stereo(x)
    n = n_of(size)
    t = np.arange(n) / SR
    r = rng(seed)
    irs = []
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-t * 6.9 / size)
        ir = lp(ir, damp)
        ir[: n_of(0.012)] *= np.linspace(0, 1, n_of(0.012))
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    wet = np.stack([np.pad(signal.fftconvolve(x[:, c], irs[c]), (0, 1))[: len(x) + n] for c in range(2)], axis=1)
    dry = np.vstack([x, np.zeros((n, 2))])
    return dry * (1 - mix) + wet * mix * 1.4


def trim_tail(x, thresh=1e-4):
    a = np.abs(x) if x.ndim == 1 else np.max(np.abs(x), axis=1)
    idx = np.where(a > thresh * max(a.max(), 1e-9))[0]
    return x[: idx[-1] + 1] if len(idx) else x


def finish(x, peak=0.89, rev=None):
    if rev:
        x = reverb(x, **rev)
    if x.ndim == 1:
        x = stereo(x)
    x = trim_tail(x)
    x = signal.sosfilt(_sos("high", 25), x, axis=0)
    x = fade(x, 0.0005, 0.02)
    return loudness(x, peak)


def loudness(x, peak=0.89, target_db=-13.0):
    """Even out perceived level: match active RMS to a target, then soft-limit the peaks."""
    mono = np.mean(x, axis=1)
    w = n_of(0.05)
    frames = len(mono) // w
    if frames >= 1:
        rms = np.sqrt(np.mean(mono[: frames * w].reshape(frames, w) ** 2, axis=1))
        active = np.percentile(rms, 90) if frames > 3 else rms.max()
    else:
        active = np.sqrt(np.mean(mono ** 2))
    pk = np.max(np.abs(x))
    gain = min(10 ** (target_db / 20) / max(active, 1e-9), 1.8 * peak / pk)
    y = x * gain
    knee = 0.8 * peak
    a = np.abs(y)
    over = a > knee
    y[over] = np.sign(y[over]) * (knee + (peak - knee) * np.tanh((a[over] - knee) / (peak - knee)))
    return y


def note(name):
    """'A4' -> Hz. Supports sharps (#) and flats (b)."""
    names = {"C": -9, "D": -7, "E": -5, "F": -4, "G": -2, "A": 0, "B": 2}
    s = name[0]
    acc = 0
    rest = name[1:]
    if rest and rest[0] in "#b":
        acc = 1 if rest[0] == "#" else -1
        rest = rest[1:]
    octv = int(rest)
    semis = names[s] + acc + (octv - 4) * 12
    return 440.0 * 2 ** (semis / 12)


def bell(freq, d=1.5, tau=0.5, index=2.5, ratio=3.5, bright=0.3):
    t = T(d)
    mod = index * np.exp(-t / (tau * 0.35)) * np.sin(2 * np.pi * freq * ratio * t)
    x = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / tau)
    x += bright * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / (tau * 0.3))
    x += 0.4 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t / (tau * 0.6))
    return x * np.clip(t / 0.001, 0, 1)


def pluck_tone(freq, d, kind="square", tau=0.12):
    return osc(freq, d, kind) * expenv(d, tau)


def brass(freq, d, vib=5.0, bright=3500):
    t = T(d)
    f = freq * (1 + 0.006 * np.sin(2 * np.pi * vib * t) * np.clip(t / 0.3, 0, 1))
    f = f * (1 - 0.03 * np.exp(-t / 0.03))
    x = osc(f, kind="saw") + 0.5 * osc(f * 1.003, kind="saw")
    env = adsr(d, 0.03, 0.15, 0.75, 0.12)
    cut = 250 + bright * adsr(d, 0.04, 0.25, 0.55, 0.12)
    return svf(x, cut, q=0.9, mode="lp") * env


def kick(d=0.5, f0=160, f1=45, tau=0.25):
    t = T(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.04)
    return osc(f, kind="sine") * expenv(d, tau, 0.001)


def snare(d=0.25, seed=None, tone=190):
    n = bp(noise(d, seed), 1200, 9000) * expenv(d, 0.07, 0.0005)
    s = osc(tone, d) * expenv(d, 0.04, 0.0005)
    return n * 0.8 + s * 0.5


def crash(d=2.5, seed=None):
    n = hp(noise(d, seed), 4500, 2) * expenv(d, 0.8, 0.001)
    return n + 0.3 * bp(noise(d, seed), 3000, 7000) * expenv(d, 0.2, 0.001)


def clap(seed=None):
    d = 0.25
    base = bp(noise(d, seed), 900, 2800, 2)
    e = np.zeros(n_of(d))
    for k, off in enumerate((0, 0.009, 0.018)):
        i = n_of(off)
        e[i:] += np.exp(-np.arange(len(e) - i) / SR / 0.004) * (0.7 if k < 2 else 1)
    i = n_of(0.022)
    e[i:] += 0.6 * np.exp(-np.arange(len(e) - i) / SR / 0.06)
    return base * e

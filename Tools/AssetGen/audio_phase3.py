"""Phase 3 SFX: shop door bell and a key ring jingle (fully synthesised)."""
import numpy as np
from audio import SR, t_, hp, expenv, reverb, write


def bell_strike(f0, dur, seed):
    # Small brass shop bell: inharmonic partials with fast-decaying highs and a slight wobble.
    t = t_(dur)
    partials = [(1.0, 1.0, 1.4), (2.76, 0.55, 0.7), (5.40, 0.28, 0.35), (8.93, 0.14, 0.18), (13.34, 0.06, 0.1)]
    x = np.zeros_like(t)
    rng = np.random.default_rng(seed)
    for ratio, amp, tau in partials:
        f = f0 * ratio * (1 + rng.uniform(-0.002, 0.002))
        wobble = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
        x += amp * np.sin(2 * np.pi * f * t * wobble + rng.uniform(0, 6.28)) * expenv(len(t), tau, 0.001)
    return x


def door_bell():
    dur = 2.4
    x = np.zeros(int(dur * SR))
    # The clapper hits two or three times as the bell swings on its spring.
    for at, gain, seed in ((0.0, 1.0, 1), (0.16, 0.6, 2), (0.34, 0.32, 3)):
        s = bell_strike(1720, dur - at, seed) * gain
        i = int(at * SR)
        x[i:i + len(s)] += s[: len(x) - i]
    x = reverb(hp(x, 300, 2), rt=0.6, wet=0.18)
    write(x, "SFX", "door_bell.wav", peak_db=-6.0)


def keys_jingle():
    dur = 1.3
    x = np.zeros(int(dur * SR))
    rng = np.random.default_rng(7)
    # Many tiny metal ticks clustered in two shakes.
    for k in range(34):
        at = rng.choice([rng.uniform(0.02, 0.35), rng.uniform(0.45, 0.8)])
        f = rng.uniform(3200, 7800)
        n = int(rng.uniform(0.03, 0.09) * SR)
        tt = np.arange(n) / SR
        tick = np.sin(2 * np.pi * f * tt) * expenv(n, rng.uniform(0.008, 0.025), 0.0005) * rng.uniform(0.3, 1.0)
        i = int(at * SR)
        x[i:i + n] += tick[: len(x) - i]
    x = reverb(hp(x, 1500, 2), rt=0.3, wet=0.12)
    write(x, "SFX", "keys_jingle.wav", peak_db=-9.0)


if __name__ == "__main__":
    door_bell()
    keys_jingle()

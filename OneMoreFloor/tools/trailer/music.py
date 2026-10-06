# Trailer score, synthesized: 120 bpm, D minor, cuts land on the beat.
import numpy as np, wave
SR = 44100; DUR = 41.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def fftfilt(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** 4)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)
    return np.fft.irfft(X * g, len(x))
def env(n, a=0.005, d=0.2, s=0.0, r=0.05, hold=None):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4))
    if hold is None: e *= np.exp(-np.maximum(0, t - a) / max(d, 1e-4)) * (1 - s) + s
    else: e *= np.where(t < hold, 1, np.exp(-(t - hold) / max(r, 1e-4)))
    return e
def add(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR); n = min(len(sig), N - i)
    if n <= 0: return
    L[i:i + n] += sig[:n] * gain * (1 - max(0, pan)); R[i:i + n] += sig[:n] * gain * (1 + min(0, pan))
def saw(f, n, det=0.0):
    t = np.arange(n) / SR; out = 0
    for d in ([-det, 0, det] if det else [0]):
        ph = (t * f * (1 + d)) % 1; out = out + (2 * ph - 1)
    return out / (3 if det else 1)
def sine(f, n, fend=None):
    t = np.arange(n) / SR
    if fend: fr = f * (fend / f) ** (t / (n / SR)); ph = 2 * np.pi * np.cumsum(fr) / SR
    else: ph = 2 * np.pi * f * t
    return np.sin(ph)
def noise(n): return rng.standard_normal(n)

B = 0.5  # one beat
# ---- instruments
def kick(t, g=1.0):
    n = int(0.45 * SR); s = sine(150, n, 42) * env(n, 0.001, 0.22) + sine(55, n) * env(n, 0.002, 0.3) * 0.6
    s[:200] += noise(200) * 0.3
    add(s, t, 0.9 * g)
def snare(t, g=1.0):
    n = int(0.3 * SR); s = fftfilt(noise(n), 1200, 7000) * env(n, 0.001, 0.09) * 0.8 + sine(190, n, 160) * env(n, 0.001, 0.07) * 0.6
    add(s, t, 0.5 * g)
def hat(t, g=1.0, open_=False):
    n = int((0.25 if open_ else 0.06) * SR); s = fftfilt(noise(n), 7000) * env(n, 0.001, 0.08 if open_ else 0.02)
    add(s, t, 0.18 * g, pan=0.3)
def tom(t, m, g=1.0):
    n = int(0.5 * SR); s = sine(hz(m), n, hz(m) * 0.7) * env(n, 0.002, 0.25)
    add(s, t, 0.6 * g)
def boom(t, g=1.0):  # trailer hit: sub drop + crash + reverse-ish air
    n = int(2.6 * SR); s = sine(80, n, 28) * env(n, 0.002, 0.9) * 1.1
    s += fftfilt(noise(n), 300, 9000) * env(n, 0.001, 0.6) * 0.45
    s += fftfilt(noise(n), 40, 400) * env(n, 0.002, 0.35) * 0.6
    add(s, t, 0.9 * g)
def riser(t0, t1, g=1.0):
    n = int((t1 - t0) * SR); x = np.linspace(0, 1, n)
    s = fftfilt(noise(n), 800, 9000) * x ** 2.5 * 0.35 + sine(200, n, 1600) * x ** 3 * 0.15
    add(s, t0, g)
def pad(t, dur, notes, g=0.12, bright=1500):
    n = int(dur * SR); s = sum(saw(hz(m), n, 0.006) for m in notes) / len(notes)
    s = fftfilt(s, 60, bright) * env(n, 0.4, hold=dur - 0.5, r=0.4)
    add(s, t, g, pan=-0.2); add(s, t + 0.012, g * 0.8, pan=0.3)
def bass(t, m, dur=0.24, g=0.32):
    n = int(dur * SR); s = fftfilt(saw(hz(m), n) + 0.6 * sine(hz(m - 12), n), None, 600) * env(n, 0.004, hold=dur * 0.7, r=0.05)
    add(s, t, g)
def pluck(t, m, g=0.12, pan=0.0):
    n = int(0.5 * SR); s = fftfilt(saw(hz(m), n, 0.003), None, 3500) * env(n, 0.002, 0.16)
    add(s, t, g, pan)
def bell(t, m, g=0.12, pan=0.0):
    n = int(1.6 * SR); s = (sine(hz(m), n) + 0.4 * sine(hz(m) * 2.76, n) * env(n, 0.001, 0.25)) * env(n, 0.002, 0.6)
    add(s, t, g, pan)
def brass(t, dur, notes, g=0.16):
    n = int(dur * SR); s = sum(saw(hz(m), n, 0.004) for m in notes) / len(notes)
    s = fftfilt(s, 80, 2200) * env(n, 0.03, hold=dur * 0.85, r=0.08)
    add(s, t, g)

D2, F2, A2, C3, D3 = 38, 41, 45, 48, 50
# ---- 0-6: cold open + Argus
pad(0.0, 6.2, [D2, A2, D3], g=0.10, bright=500)
for k in range(12): kick(k * B, 0.35 if k % 2 == 0 else 0.22)  # heartbeat
pad(3.0, 3.2, [D3, F2 + 12, A2 + 12], g=0.08, bright=1100)
for k, m in enumerate([62, 65, 69, 74, 72, 69]): bell(3.0 + k * 0.5, m, 0.08, pan=0.2 * (-1) ** k)
riser(4.5, 6.0, 1.0)
# ---- 6: drop into the climb (6 - 19.5)
boom(6.0, 1.1)
seq = [D2, D2, F2, D2, C3 - 12, D2, A2 - 12, C3 - 12]
for k in range(int((19.5 - 6) / (B / 2))):
    t = 6 + k * B / 2
    bass(t, seq[k % 8] + (0 if t < 13.5 else 0))
    hat(t, 0.8 if k % 2 else 1.1)
    if k % 2 == 0: kick(t)
    if k % 4 == 2: snare(t)
for bar in range(int((19.5 - 6) / 2)):
    t = 6 + bar * 2; ch = [[D3, F2 + 12, A2 + 12], [D3 - 2, F2 + 12, A2 + 10], [C3, F2 + 12, A2 + 12], [C3, E := 52, A2 + 12]][bar % 4]
    brass(t, 1.9, ch, 0.10)
for k in range(int((19.5 - 13.5) / (B / 4))):  # power section: fast arpeggio
    t = 13.5 + k * B / 4
    pluck(t, [74, 77, 81, 86, 81, 77][k % 6], 0.07, pan=0.4 * (-1) ** k)
riser(18.5, 19.5, 0.9)
# ---- 19.5 - 24: guardian, half-time heavy
boom(19.5, 1.0)
for k in range(9):
    t = 19.5 + k * B
    if k % 2 == 0: kick(t, 1.2)
    if k % 4 == 2: snare(t, 1.3)
    tom(t + 0.25, [43, 41, 38, 36][k % 4], 0.6)
brass(19.5, 2.0, [D2 + 12, F2 + 12, A2 + 12], 0.16); brass(21.5, 2.0, [46, 50, 53], 0.16)
for k in range(9): bass(19.5 + k * B, [D2, D2, 34, 34, 36, 36, D2, D2, D2][k], 0.45, 0.36)
riser(23.0, 24.0, 0.8)
# ---- 24 - 30: the chest (tension, then reward)
pad(24.0, 3.8, [D3, A2 + 12, 57], g=0.08, bright=900)
for k in range(15): bell(24.0 + k * 0.25, [74, 81, 79, 77][k % 4], 0.05, pan=0.3 * (-1) ** k)
riser(26.3, 27.73, 1.2)
for k in range(6): snare(26.6 + k * (1.1 / 6) * (1 - k * 0.08), 0.35 + k * 0.08)
boom(27.73, 1.0)
pad(27.73, 2.4, [D3, 54, 57, 62], g=0.12, bright=3000)  # D major: the reward
for k, m in enumerate([74, 78, 81, 86, 90]): bell(27.8 + k * 0.08, m, 0.07, pan=0.3 * (-1) ** k)
riser(29.0, 30.0, 0.8)
# ---- 30 - 37: Argus
boom(30.0, 0.8)
pad(30.0, 7.0, [D2 + 12, F2 + 12, A2 + 12, D3 + 12], g=0.10, bright=1400)
boom(31.6, 1.2)  # landing
for k in range(int((37 - 31.5) / (B / 2))):
    t = 31.5 + k * B / 2
    bass(t, [D2, D2, D2, F2, D2, D2, C3 - 12, 34][k % 8], 0.22, 0.36)
    if k % 2 == 0: kick(t, 1.1)
    if k % 4 == 2: snare(t, 1.2)
    hat(t, 1.0)
    if k % 8 == 7: tom(t, 45, 0.6)
brass(31.5, 1.9, [D3, 53, 57], 0.15); brass(33.5, 1.9, [46, 50, 53], 0.15); brass(35.5, 1.4, [48, 52, 55], 0.17)
riser(36.0, 37.0, 1.1)
# ---- 37 - 41: title
boom(37.0, 1.3)
pad(37.0, 4.0, [D2 + 12, A2 + 12, D3 + 12, 65, 69], g=0.14, bright=2600)
for k, m in enumerate([62, 69, 74, 77, 81]): bell(37.05 + k * 0.12, m, 0.08)

# ---- room reverb (FFT convolution), master, fade
ir_n = int(1.8 * SR); ir = noise(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.45); ir = fftfilt(ir, 200, 6000); ir /= np.abs(ir).sum() ** 0.5 * 30
def conv(x):
    n = len(x) + ir_n; F = np.fft.rfft(x, n) * np.fft.rfft(ir, n); return np.fft.irfft(F, n)[:len(x)]
L2 = L + conv(L) * 0.9; R2 = R + conv(R) * 0.9
mix = np.stack([L2, R2], 1)
fade = np.ones(N); fi = int(0.4 * SR); fade[:fi] = np.linspace(0, 1, fi); fo = int(1.5 * SR); fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix /= np.abs(mix).max() / 0.92
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', DUR)

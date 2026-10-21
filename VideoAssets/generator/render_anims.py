"""Render every animation to an MP4 (chroma background + matching sound) and a JPG poster."""
import os, subprocess, sys, time
from multiprocessing import Pool
import cairo
import numpy as np
from PIL import Image
from scipy.io import wavfile
from audio import SR, n_of
from gfx import BG
from anims_ui import ANIMS
import anims_fx  # noqa: F401  (registers into ANIMS)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "generator", ".cache")
OUT = os.path.join(ROOT, "animationen")
PREV = os.path.join(ROOT, "vorschau")
FPS = 30

CAT_DIR = {"Pfeile & Markierungen": "01_pfeile_markierungen", "Klicks & Gesten": "02_klicks_gesten",
           "Dateien & Fenster": "03_dateien_fenster", "Social & UI": "04_social_ui",
           "Zoom & Übergänge": "05_zoom_uebergaenge", "Geld": "06_geld", "Quiz & Gameshow": "07_quiz_gameshow",
           "Effekte & Text": "08_effekte_text"}


def out_name(name, a):
    return f"{name}_{'greenscreen' if a['bg'] == 'green' else 'bluescreen'}"


def frame(a, t):
    W, H = a["size"]
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    c = cairo.Context(s)
    c.set_source_rgb(*BG[a["bg"]])
    c.paint()
    a["fn"](c, t, W, H)
    s.flush()
    return s


def audio_track(a):
    n = n_of(a["dur"])
    mixbuf = np.zeros((n, 2), np.float32)
    for item in a["sfx"]:
        snd, at = item[0], item[1]
        gain = item[2] if len(item) > 2 else 1.0
        x = np.load(os.path.join(CACHE, snd + ".npy")) * gain
        i = n_of(at)
        if i >= n:
            continue
        m = min(len(x), n - i)
        mixbuf[i:i + m] += x[:m]
    f = n_of(0.15)
    mixbuf[-f:] *= np.linspace(1, 0, f)[:, None]
    pk = np.abs(mixbuf).max()
    if pk > 0.95:
        mixbuf *= 0.95 / pk
    return mixbuf


def render(name):
    t0 = time.time()
    a = ANIMS[name]
    W, H = a["size"]
    d = os.path.join(OUT, CAT_DIR[a["cat"]])
    os.makedirs(d, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    wav = os.path.join(CACHE, f"_a_{name}.wav")
    wavfile.write(wav, SR, audio_track(a))
    mp4 = os.path.join(d, out_name(name, a) + ".mp4")
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}",
                          "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "19",
                          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4],
                         stdin=subprocess.PIPE)
    nf = int(round(a["dur"] * FPS))
    pf = int(a["poster"] * nf)
    for i in range(nf):
        s = frame(a, i / FPS)
        p.stdin.write(bytes(s.get_data()))
        if i == pf:
            img = Image.frombuffer("RGBA", (W, H), bytes(s.get_data()), "raw", "BGRA", 0, 1).convert("RGB")
            img.thumbnail((360, 640))
            img.save(os.path.join(PREV, out_name(name, a) + ".jpg"), quality=82)
    p.stdin.close()
    p.wait()
    os.remove(wav)
    return name, time.time() - t0


if __name__ == "__main__":
    names = sys.argv[1:] or list(ANIMS)
    with Pool(4) as pool:
        for name, el in pool.imap_unordered(render, names):
            print(f"{name:28s} {el:5.1f}s", flush=True)
    print(len(names), "animations")

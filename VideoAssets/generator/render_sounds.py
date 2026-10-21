"""Render every sound effect to MP3 (and a float cache used by the animations)."""
import os, subprocess, sys, time
from multiprocessing import Pool
import numpy as np
from scipy.io import wavfile
from audio import SR
from sounds import SOUNDS, build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "generator", ".cache")
OUT = os.path.join(ROOT, "sounds")

CAT_DIR = {"Klicks & UI": "01_klicks_ui", "Übergänge": "02_uebergaenge", "Geld": "03_geld",
           "Quiz & Gameshow": "04_quiz_gameshow", "Comedy & Meme": "05_comedy_meme"}


def render(name):
    t = time.time()
    x = build(name).astype(np.float32)
    os.makedirs(CACHE, exist_ok=True)
    np.save(os.path.join(CACHE, name + ".npy"), x)
    d = os.path.join(OUT, CAT_DIR[SOUNDS[name][0]])
    os.makedirs(d, exist_ok=True)
    wav = os.path.join(CACHE, name + ".wav")
    wavfile.write(wav, SR, x)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame", "-b:a", "192k",
                    os.path.join(d, name + ".mp3")], check=True)
    os.remove(wav)
    return name, len(x) / SR, time.time() - t


if __name__ == "__main__":
    names = sys.argv[1:] or list(SOUNDS)
    with Pool(4) as p:
        for name, dur, el in p.imap_unordered(render, names):
            print(f"{name:28s} {dur:5.2f}s  ({el:.1f}s)")
    print(len(names), "sounds")

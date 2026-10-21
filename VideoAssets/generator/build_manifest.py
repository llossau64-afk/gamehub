"""Write assets.json (used by the gallery page) and README tables."""
import json, os, sys
import numpy as np
from sounds import SOUNDS
from render_sounds import CAT_DIR as SCAT
from render_anims import ANIMS, CAT_DIR as ACAT, out_name

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
items = []
for name, a in ANIMS.items():
    f = out_name(name, a)
    items.append(dict(kind="anim", id=name, label=a["label"], cat=a["cat"], dur=round(a["dur"], 2), bg=a["bg"],
                      w=a["size"][0], h=a["size"][1], file=f"animationen/{ACAT[a['cat']]}/{f}.mp4", poster=f"vorschau/{f}.jpg",
                      sfx=sorted({s[0] for s in a["sfx"]})))
for name, (cat, label, _) in SOUNDS.items():
    x = np.load(os.path.join(ROOT, "generator", ".cache", name + ".npy"))
    m = np.abs(x).max(axis=1)
    bins = np.array_split(m, 48)
    peaks = [round(float(b.max()), 2) for b in bins]
    items.append(dict(kind="sound", id=name, label=label, cat=cat, dur=round(len(x) / 44100, 2),
                      file=f"sounds/{SCAT[cat]}/{name}.mp3", peaks=peaks))
json.dump(items, open(sys.argv[1], "w"), ensure_ascii=False, separators=(",", ":"))
print(len(items), "items")

"""Debug contact sheet: several frames per animation."""
import sys, cairo
from PIL import Image
from render_anims import ANIMS, frame
names = sys.argv[2:] or list(ANIMS)
cols = 5
rows = []
for n in names:
    a = ANIMS[n]
    ims = []
    for k in (0.12, 0.3, 0.5, 0.75, 0.92):
        s = frame(a, k * a["dur"])
        W, H = a["size"]
        im = Image.frombuffer("RGBA", (W, H), bytes(s.get_data()), "raw", "BGRA", 0, 1).convert("RGB")
        im.thumbnail((200, 200))
        ims.append(im)
    rows.append(ims)
sheet = Image.new("RGB", (cols * 205, len(rows) * 205), "white")
for r, ims in enumerate(rows):
    for ci, im in enumerate(ims):
        sheet.paste(im, (ci * 205, r * 205))
sheet.save(sys.argv[1])

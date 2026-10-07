#!/usr/bin/env python3
"""App icon: a brass medal with a barber pole on dark leather. Writes PNG sizes and an .icns."""
import io, struct, sys
from PIL import Image, ImageDraw, ImageFilter

def draw(S=1024):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad, r = int(S * 0.09), int(S * 0.2)
    # dark rounded tile with a soft drop shadow
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([pad, pad + S * 0.02, S - pad, S - pad + S * 0.02], r, fill=(0, 0, 0, 140))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S * 0.02)))
    d.rounded_rectangle([pad, pad, S - pad, S - pad], r, fill=(43, 33, 27, 255))
    d.rounded_rectangle([pad + S * 0.03, pad + S * 0.03, S - pad - S * 0.03, S - pad - S * 0.03], int(r * 0.8), outline=(209, 169, 86, 255), width=int(S * 0.012))
    # barber pole
    cx, top, bot, w = S // 2, int(S * 0.24), int(S * 0.76), int(S * 0.15)
    pole = Image.new('RGBA', (w, bot - top), (239, 228, 207, 255))
    pd = ImageDraw.Draw(pole)
    step = int(S * 0.09)
    for i in range(-6, 12):
        y = i * step
        col = (122, 42, 38, 255) if i % 2 == 0 else (36, 52, 77, 255)
        pd.polygon([(0, y), (w, y - w * 0.8), (w, y - w * 0.8 + step * 0.45), (0, y + step * 0.45)], fill=col)
    shade = Image.new('L', (w, 1))
    for x in range(w):
        t = x / (w - 1)
        shade.putpixel((x, 0), int(255 * (0.55 + 0.45 * (1 - abs(t - 0.38) * 1.6))))
    pole = Image.composite(pole, Image.new('RGBA', pole.size, (0, 0, 0, 255)), shade.resize(pole.size))
    mask = Image.new('L', pole.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, bot - top - 1], int(w * 0.18), fill=255)
    im.paste(pole, (cx - w // 2, top), mask)
    # brass caps
    for y in (top - int(S * 0.04), bot - int(S * 0.02)):
        d.rounded_rectangle([cx - w * 0.75, y, cx + w * 0.75, y + S * 0.06], int(S * 0.02), fill=(181, 138, 60, 255), outline=(90, 62, 20, 255), width=int(S * 0.008))
    d.ellipse([cx - S * 0.045, top - S * 0.11, cx + S * 0.045, top - S * 0.02], fill=(209, 169, 86, 255), outline=(90, 62, 20, 255), width=int(S * 0.008))
    return im

def main(out_prefix):
    big = draw(1024)
    entries = []
    for typ, size in ((b'ic10', 1024), (b'ic09', 512), (b'ic08', 256), (b'ic07', 128), (b'ic14', 512), (b'ic13', 256), (b'ic12', 64), (b'ic11', 32)):
        b = io.BytesIO()
        big.resize((size, size), Image.LANCZOS).save(b, 'PNG')
        data = b.getvalue()
        entries.append(typ + struct.pack('>I', len(data) + 8) + data)
    body = b''.join(entries)
    open(out_prefix + '.icns', 'wb').write(b'icns' + struct.pack('>I', len(body) + 8) + body)
    big.save(out_prefix + '.png')

if __name__ == '__main__':
    main(sys.argv[1])

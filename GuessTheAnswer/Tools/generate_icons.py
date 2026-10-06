#!/usr/bin/env python3
"""Renders the game's UI icons from Google's Material Symbols Rounded font (Apache License 2.0).

Usage:
  python3 Tools/generate_icons.py <MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf> <codepoints file>

The font and its codepoints file are in https://github.com/google/material-design-icons (variablefont/).
Writes white 128x128 PNGs to Assets/GuessTheAnswer/Resources/GTA/Icons. Add a name to ICONS to add an icon.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ICONS = [
    "add", "arrow_back", "backspace", "bolt", "casino", "check", "close", "content_copy", "contrast", "crown",
    "edit", "front_hand", "groups", "help", "how_to_vote", "local_fire_department", "location_city", "lock",
    "login", "logout", "menu", "more_time", "movie", "nutrition", "person", "play_arrow", "public", "refresh",
    "screen_rotation", "search", "sentiment_very_satisfied", "settings", "smart_toy", "sports_soccer", "star",
    "swap_horiz", "volume_off", "volume_up",
]
SIZE = 128
SUPERSAMPLE = 4
OUT = os.path.join(os.path.dirname(__file__), "..", "Assets", "GuessTheAnswer", "Resources", "GTA", "Icons")


def main():
    font_path, codepoints_path = sys.argv[1], sys.argv[2]
    codepoints = {}
    with open(codepoints_path, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) == 2:
                codepoints[parts[0]] = int(parts[1], 16)

    big = SIZE * SUPERSAMPLE
    font = ImageFont.truetype(font_path, int(big * 0.84))
    try:
        # Axes: FILL, GRAD, opsz, wght — filled, bold icons read best at small sizes.
        font.set_variation_by_axes([1, 0, 48, 600])
    except Exception as e:  # older Pillow without variation support
        print("warning: could not set font variations:", e)

    os.makedirs(OUT, exist_ok=True)
    for name in ICONS:
        if name not in codepoints:
            sys.exit("unknown icon: " + name)
        glyph = chr(codepoints[name])
        img = Image.new("L", (big, big), 0)
        draw = ImageDraw.Draw(img)
        left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
        x = (big - (right - left)) / 2 - left
        y = (big - (bottom - top)) / 2 - top
        draw.text((x, y), glyph, font=font, fill=255)
        alpha = img.resize((SIZE, SIZE), Image.LANCZOS)
        rgba = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
        rgba.putalpha(alpha)
        rgba.save(os.path.join(OUT, name + ".png"), optimize=True)
    print("wrote", len(ICONS), "icons to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()

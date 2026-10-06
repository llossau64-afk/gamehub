#!/usr/bin/env python3
"""Builds the single-file browser version (Web/guess-the-answer.html) from Web/template.html.

Embeds the question packs from Assets/GuessTheAnswer/Resources/GTA/Data and the UI icons as SVG paths
extracted from Material Symbols Rounded (Apache 2.0).
Usage: python3 Tools/build_web.py <MaterialSymbolsRounded[...].ttf> <codepoints>
"""
import json, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = os.path.join(os.path.dirname(__file__), "..")
DATA = os.path.join(ROOT, "Assets", "GuessTheAnswer", "Resources", "GTA", "Data")
ICONS = ["add", "arrow_back", "backspace", "bolt", "check", "close", "content_copy", "contrast", "crown", "front_hand",
         "groups", "how_to_vote", "local_fire_department", "location_city", "lock", "login", "logout", "menu", "more_time",
         "movie", "nutrition", "person", "play_arrow", "public", "refresh", "search", "sentiment_very_satisfied", "settings",
         "smart_toy", "sports_soccer", "star", "swap_horiz", "volume_off", "volume_up", "casino", "help"]

def icons(font_path, cp_path):
    cps = {}
    for line in open(cp_path, encoding="utf-8"):
        p = line.split()
        if len(p) == 2: cps[p[0]] = int(p[1], 16)
    font = instantiateVariableFont(TTFont(font_path), {"FILL": 1, "GRAD": 0, "opsz": 24, "wght": 600})
    cmap = font.getBestCmap(); gs = font.getGlyphSet()
    out = {}
    for n in ICONS:
        pen = SVGPathPen(gs)
        gs[cmap[cps[n]]].draw(pen)
        out[n] = pen.getCommands()
    return out

def questions():
    cat = json.load(open(os.path.join(DATA, "categories.json"), encoding="utf-8"))["categories"]
    qs = []
    lv = {"easy": 0, "normal": 1, "hard": 2, "expert": 2}
    for c in cat:
        if not c.get("pack"): continue
        pack = json.load(open(os.path.join(DATA, c["pack"] + ".json"), encoding="utf-8"))
        for q in pack["questions"]:
            qs.append([q["id"], c["id"], lv.get(q.get("difficulty", "normal"), 1), q["questionText"], q["answers"],
                       q["correctAnswerIndex"], 1 if q.get("keepOrder") else 0, q.get("optionalExplanation") or ""])
    cats = [{"id": c["id"], "name": c["name"], "icon": c["icon"], "color": c["color"], "classic": c.get("includeInClassic", True)} for c in cat]
    return cats, qs

def main():
    ic = icons(sys.argv[1], sys.argv[2])
    cats, qs = questions()
    tpl = open(os.path.join(ROOT, "Web", "template.html"), encoding="utf-8").read()
    data = "const CATS=" + json.dumps(cats, ensure_ascii=False, separators=(",", ":")) + ";\nconst QS=" + \
        json.dumps(qs, ensure_ascii=False, separators=(",", ":")) + ";\nconst ICONS=" + json.dumps(ic, separators=(",", ":")) + ";"
    out = tpl.replace("/*@@DATA@@*/", data)
    path = os.path.join(ROOT, "Web", "guess-the-answer.html")
    open(path, "w", encoding="utf-8").write(out)
    print("wrote", path, len(out) // 1024, "KB,", len(qs), "questions,", len(ic), "icons")

if __name__ == "__main__":
    main()

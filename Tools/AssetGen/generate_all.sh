#!/bin/sh
# Regenerates all procedural art/audio. Requires: numpy pillow scipy. Fonts must already be in Assets/BarberSimulator/UI/Fonts.
cd "$(dirname "$0")" && python3 tex_a.py && python3 tex_b.py && python3 tex_c.py && python3 sprites.py && python3 audio.py && python3 audio_phase2.py && python3 tex_phase2.py
# Characters (Blender as a Python module: `pip install bpy==4.5.9`, Python 3.11). Skipped when bpy is missing.
python3 -c "import bpy" 2>/dev/null && python3 blender/characters.py || echo "bpy not installed: skipped Blender characters"

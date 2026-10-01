#!/bin/sh
# Regenerates all procedural art/audio. Requires: numpy pillow scipy. Fonts must already be in Assets/BarberSimulator/UI/Fonts.
cd "$(dirname "$0")" && python3 tex_a.py && python3 tex_b.py && python3 tex_c.py && python3 sprites.py && python3 audio.py && python3 audio_phase2.py && python3 tex_phase2.py

# Trailer

`rec.js` records the trailer frame by frame: it fakes the browser clock, steps the game at 30 fps,
drives a bot through hand-picked floors and saves a JPEG per frame. `music.py` synthesizes the score
(120 bpm, cuts on the beat). Then:

```bash
cd OneMoreFloor && python3 -m http.server 8123 &
cd tools/trailer
W=1920 H=1080 NODE_PATH=<playwright> node rec.js      # frames/00000.jpg ...
python3 music.py                                       # music.wav
ffmpeg -framerate 30 -i frames/%05d.jpg -i music.wav -c:v libx264 -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -shortest -movflags +faststart trailer.mp4
```

With a software renderer the chest scene is slow at 1080p; record it with `W=960 H=540 ONLY=chest
FRAME0=720 OUTDIR=chestframes` and upscale those frames.

# Video-Backends (VELQIN Motion)

Adapter-Schnittstelle: `backend/services/video_studio.py`

```python
class MyAdapter:
    id = "my-backend"
    max_segment_seconds = 5.0
    async def check(self) -> dict: ...          # Modelle/Abhängigkeiten prüfen, sonst ValueError mit Klartext
    async def segment(self, ctx, files, *, prompt, negative, width, height, fps, frames, steps, seed,
                      start_png, out_path, seg_index, seg_total) -> None: ...   # ein Segment als Videodatei schreiben
VIDEO_ADAPTERS["my-backend"] = MyAdapter()
```
Zusätzlich ein `Preset` mit `kind="video"` in `backend/services/workflows.py` eintragen, damit die UI es anzeigt.

| Backend | Status | Bemerkung |
|---|---|---|
| **Wan 2.2 TI2V 5B (ComfyUI)** | integriert, auf GPU ungetestet | offizielle ComfyUI-Unterstützung, Text+Bild→Video, 24 fps, läuft laut ComfyUI auf 8 GB mit Offloading |
| FramePack (lllyasviel) | nicht integriert | eigene Gradio-App ohne stabile API; Next-Frame-Prediction ermöglicht lange Clips auf 6 GB. Integration über ComfyUI-FramePackWrapper denkbar |
| Wan 2.2 5B GGUF (Community) | vorbereitet über ComfyUI-GGUF | spart RAM/VRAM; Workflow müsste `UnetLoaderGGUF` nutzen |

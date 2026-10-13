"""VELQIN Motion — video job handler.

Backend adapters are pluggable (`VIDEO_ADAPTERS`). The bundled adapter drives Wan 2.2 TI2V 5B through
ComfyUI. Clips longer than one model window (~5 s) are produced segment by segment: each new segment
starts from the last frame of the previous one (image-to-video) and FFmpeg joins them. Expect some
drift in style/identity and occasional motion jumps at the seams — this is a known limitation."""
from __future__ import annotations

import logging
import math
import random
import shutil
from pathlib import Path

from PIL import Image, ImageOps

from core.config import settings
from database.db import SessionLocal
from jobs.queue import JobContext
from security.files import resolve_storage_path
from services import comfyui, ffmpeg, media, workflows

log = logging.getLogger("velqin.video")


def _cover(img: Image.Image, w: int, h: int) -> Image.Image:
    return ImageOps.fit(ImageOps.exif_transpose(img).convert("RGB"), (w, h), Image.LANCZOS)


def _png_bytes(img: Image.Image) -> bytes:
    import io

    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


class WanComfyAdapter:
    """Wan 2.2 TI2V 5B via ComfyUI."""

    id = "wan22-5b"
    max_segment_seconds = 5.0

    async def check(self) -> dict[str, str]:
        info = await comfyui.object_info(force=True)
        ok, missing, files = workflows.check_preset(workflows.ALL_PRESETS[self.id], info)
        if not ok:
            raise ValueError("Missing for VELQIN Motion: " + ", ".join(missing))
        return files

    async def segment(self, ctx: JobContext, files: dict, *, prompt: str, negative: str, width: int, height: int,
                      fps: int, frames: int, steps: int, seed: int, start_png: bytes | None, out_path: Path,
                      seg_index: int, seg_total: int) -> None:
        start_name = None
        if start_png:
            start_name = await comfyui.upload_image(start_png, f"velqin_{ctx.job.id}_s{seg_index}.png")
        graph = workflows.build_wan_video(files, prompt=prompt, negative=negative, width=width, height=height,
                                          frames=frames, fps=fps, steps=steps, seed=seed, start_image=start_name)

        async def on_progress(node_frac: float, sampler_frac: float | None, label: str):
            frac = 0.1 + 0.8 * sampler_frac if sampler_frac is not None else min(node_frac, 0.95)
            prefix = f"Segment {seg_index + 1}/{seg_total} · " if seg_total > 1 else ""
            await ctx.progress((seg_index + frac) / seg_total * 0.97, prefix + label)

        result = await comfyui.run_workflow(graph.nodes, on_progress=on_progress, on_preview=ctx.set_preview,
                                            should_cancel=ctx.should_cancel, node_labels=graph.labels)
        vids = [o for o in result.outputs if o["filename"].lower().endswith((".mp4", ".webm", ".mov", ".mkv", ".gif", ".webp"))]
        if not vids:
            raise comfyui.ComfyError("ComfyUI finished without producing a video.")
        o = vids[0]
        out_path.write_bytes(await comfyui.fetch_output(o["filename"], o.get("subfolder", ""), o["type"]))


VIDEO_ADAPTERS = {"wan22-5b": WanComfyAdapter()}


async def run_video_job(ctx: JobContext) -> dict:
    job = ctx.job
    p = job.params
    if not ffmpeg.available():
        raise ValueError("FFmpeg is not installed on the server (needed for MP4 export).")
    adapter = VIDEO_ADAPTERS[p.get("preset", "wan22-5b")]
    await ctx.progress(0.005, "Checking models", force=True)
    files = await adapter.check()

    quality = p.get("quality", "fast")
    fps = int(p.get("fps", 24))
    width, height = workflows.VIDEO_SIZES[quality][p.get("aspect", "16:9")]
    steps = workflows.VIDEO_STEPS[quality]
    frames = workflows.wan_frames(adapter.max_segment_seconds, fps)
    seg_seconds = (frames - 1) / fps
    duration = float(p.get("duration", 5))
    segments = max(1, math.ceil(duration / seg_seconds - 0.05))
    seed = int(p["seed"]) if p.get("seed") not in (None, "", -1) else random.randint(0, 2**48)

    work = settings.tmp_dir / f"job_{job.id}"
    work.mkdir(parents=True, exist_ok=True)
    try:
        start_png: bytes | None = None
        source_video: Path | None = None
        if p["mode"] == "i2v":
            start_png = _png_bytes(_cover(Image.open(resolve_storage_path(p["_input_path"])), width, height))
        elif p["mode"] == "extend":
            source_video = resolve_storage_path(p["_source_video_path"])
            info = await ffmpeg.probe(source_video)
            # keep the source's resolution (rounded to the model's 32-px grid) for a seamless join
            width = max(256, int(info["width"]) // 32 * 32)
            height = max(256, int(info["height"]) // 32 * 32)
            lf = work / "source_last.png"
            await ffmpeg.last_frame(source_video, lf)
            start_png = _png_bytes(_cover(Image.open(lf), width, height))

        prompt = p["prompt"].strip()
        seg_paths: list[Path] = []
        for i in range(segments):
            out = work / f"seg_{i:02d}.mp4"
            await adapter.segment(ctx, files, prompt=prompt, negative=p.get("negative", ""), width=width,
                                  height=height, fps=fps, frames=frames, steps=steps, seed=seed + i,
                                  start_png=start_png, out_path=out, seg_index=i, seg_total=segments)
            seg_paths.append(out)
            if i < segments - 1:
                lf = work / f"seg_{i:02d}_last.png"
                await ffmpeg.last_frame(out, lf)
                start_png = _png_bytes(_cover(Image.open(lf), width, height))

        await ctx.progress(0.975, "Exporting MP4", force=True)
        parts = ([source_video] if source_video else []) + seg_paths
        if len(parts) > 1:
            final = work / "final.mp4"
            await ffmpeg.concat(parts, final, fps, width, height)
        else:
            final = seg_paths[0]
        async with SessionLocal() as db:
            item = await media.save_video(db, job, final, prompt, {
                "preset": adapter.id, "mode": p["mode"], "seed": seed, "aspect": p.get("aspect"), "quality": quality,
                "fps": fps, "segments": segments, "requested_seconds": duration, "width": width, "height": height,
                "steps": steps,
            })
        return {"media_ids": [item.id], "seed": seed, "segments": segments}
    finally:
        shutil.rmtree(work, ignore_errors=True)

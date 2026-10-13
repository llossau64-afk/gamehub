"""VELQIN Image Studio job handler (ComfyUI)."""
from __future__ import annotations

import io
import logging
import random

from PIL import Image, ImageOps

from database.db import SessionLocal
from jobs.queue import JobContext
from security.files import resolve_storage_path
from services import comfyui, media, workflows
from security.moderation import safety_negative

log = logging.getLogger("velqin.image")


def _fit_1mp(w: int, h: int, target: int = 1024 * 1024, mult: int = 64) -> tuple[int, int]:
    scale = (target / (w * h)) ** 0.5
    nw = max(mult, int(round(w * scale / mult)) * mult)
    nh = max(mult, int(round(h * scale / mult)) * mult)
    return nw, nh


def _png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def prepare_inputs(params: dict) -> tuple[bytes | None, bytes | None, int, int]:
    """Load & preprocess the source image (and mask). Returns (image_png, mask_png, width, height)."""
    mode = params["mode"]
    if mode == "t2i":
        w, h = workflows.IMAGE_SIZES.get(params.get("aspect", "1:1"), (1024, 1024))
        return None, None, w, h
    src = Image.open(resolve_storage_path(params["_input_path"]))
    src = ImageOps.exif_transpose(src).convert("RGB")
    if mode == "upscale":
        src.thumbnail((2048, 2048))
        return _png(src), None, src.width * 2, src.height * 2

    if mode == "outpaint":
        ext = params.get("outpaint") or {}
        base = max(src.width, src.height)
        amount = {k: int(base * float(ext.get(k, 0))) for k in ("left", "right", "top", "bottom")}
        canvas_w = src.width + amount["left"] + amount["right"]
        canvas_h = src.height + amount["top"] + amount["bottom"]
        avg = src.resize((1, 1)).getpixel((0, 0))
        canvas = Image.new("RGB", (canvas_w, canvas_h), avg)
        canvas.paste(src, (amount["left"], amount["top"]))
        mask = Image.new("L", (canvas_w, canvas_h), 255)
        overlap = 16
        inner = (amount["left"] + (overlap if amount["left"] else 0), amount["top"] + (overlap if amount["top"] else 0),
                 amount["left"] + src.width - (overlap if amount["right"] else 0),
                 amount["top"] + src.height - (overlap if amount["bottom"] else 0))
        mask.paste(0, inner)
        src = canvas
    else:
        mask = None
        if mode == "inpaint":
            mask = Image.open(resolve_storage_path(params["_mask_path"])).convert("L")

    w, h = _fit_1mp(src.width, src.height)
    img = src.resize((w, h), Image.LANCZOS)
    mask_png = None
    if mask is not None:
        m = mask.resize((w, h), Image.NEAREST).point(lambda v: 255 if v > 127 else 0)
        mask_png = _png(Image.merge("RGB", (m, m, m)))
    return _png(img), mask_png, w, h


async def run_image_job(ctx: JobContext) -> dict:
    job = ctx.job
    p = job.params
    preset_id = "upscale" if p["mode"] == "upscale" else p["preset"]
    preset = workflows.ALL_PRESETS[preset_id]
    await ctx.progress(0.01, "Checking models", force=True)
    info = await comfyui.object_info(force=True)
    ok, missing, files = workflows.check_preset(preset, info)
    if not ok:
        raise ValueError("Missing for this model: " + ", ".join(missing))
    has_8step = "sdxl_lightning_8step_lora.safetensors" in comfyui.input_options(info, "LoraLoaderModelOnly", "lora_name")

    image_png, mask_png, width, height = prepare_inputs(p)
    input_name = mask_name = None
    if image_png:
        input_name = await comfyui.upload_image(image_png, f"velqin_{job.id}_in.png")
    if mask_png:
        mask_name = await comfyui.upload_image(mask_png, f"velqin_{job.id}_mask.png")

    style_pos, style_neg = workflows.STYLE_PRESETS.get(p.get("style", "none"), ("", ""))
    prompt = p.get("prompt", "").strip()
    if style_pos:
        prompt = f"{prompt}, {style_pos}" if prompt else style_pos
    negative = ", ".join(x for x in (p.get("negative", "").strip(), style_neg, safety_negative()) if x)

    count = 1 if p["mode"] == "upscale" else int(p.get("count", 1))
    base_seed = int(p["seed"]) if p.get("seed") not in (None, "", -1) else random.randint(0, 2**48)
    media_ids: list[str] = []
    for i in range(count):
        seed = base_seed + i
        if p["mode"] == "upscale":
            graph = workflows.build_upscale(files, input_name)
        else:
            graph = workflows.build_image(
                preset_id, files, mode=p["mode"], prompt=prompt, negative=negative, width=width, height=height,
                seed=seed, quality=p.get("quality", "fast"), input_image=input_name, mask_image=mask_name,
                denoise=float(p.get("strength", 0.65)) if p["mode"] in ("i2i", "inpaint") else 1.0, has_8step=has_8step,
            )

        async def on_progress(node_frac: float, sampler_frac: float | None, label: str, i=i):
            frac = 0.08 + 0.84 * sampler_frac if sampler_frac is not None else node_frac
            await ctx.progress((i + frac) / count, f"Image {i + 1}/{count} · {label}" if count > 1 else label)

        result = await comfyui.run_workflow(graph.nodes, on_progress=on_progress, on_preview=ctx.set_preview,
                                            should_cancel=ctx.should_cancel, node_labels=graph.labels)
        images = [o for o in result.outputs if o["filename"].lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
        if not images:
            raise comfyui.ComfyError("ComfyUI finished without producing an image.")
        for o in images:
            data = await comfyui.fetch_output(o["filename"], o.get("subfolder", ""), o["type"])
            async with SessionLocal() as db:
                item = await media.save_image(db, job, data, p.get("prompt", ""), {
                    "preset": preset_id, "mode": p["mode"], "seed": seed, "aspect": p.get("aspect"),
                    "quality": p.get("quality"), "style": p.get("style"), "width": width, "height": height,
                })
                media_ids.append(item.id)
        await ctx.progress((i + 1) / count, f"Saved image {i + 1}/{count}", force=True)
    return {"media_ids": media_ids, "seed": base_seed}

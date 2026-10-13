"""Image Studio and VELQIN Motion endpoints: preset availability and job submission."""
from __future__ import annotations

import base64
import binascii
import io
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user
from database.db import get_db
from jobs.queue import job_public, queue
from models import Attachment, Job, MediaItem, Project, User
from security.files import to_relative, user_dir
from security.moderation import check_prompt
from services import comfyui, ffmpeg, plans, system_settings, workflows

router = APIRouter(prefix="/api/studio", tags=["studio"])


class ImageJobIn(BaseModel):
    preset: str = Field(default="sdxl", max_length=40)
    mode: Literal["t2i", "i2i", "inpaint", "outpaint", "upscale"] = "t2i"
    prompt: str = Field(default="", max_length=2000)
    negative: str = Field(default="", max_length=1000)
    style: str = Field(default="none", max_length=40)
    aspect: str = Field(default="1:1", max_length=8)
    quality: Literal["fast", "balanced", "quality"] = "fast"
    count: int = Field(default=1, ge=1, le=4)
    seed: int | None = Field(default=None, ge=0, le=2**53)
    strength: float = Field(default=0.65, ge=0.05, le=1.0)
    input_file_id: str | None = None
    input_media_id: str | None = None
    mask_png: str | None = Field(default=None, max_length=15_000_000)  # data URL / base64 PNG, white = change
    outpaint: dict | None = None
    project_id: str | None = None


class VideoJobIn(BaseModel):
    preset: str = Field(default="wan22-5b", max_length=40)
    mode: Literal["t2v", "i2v", "extend"] = "t2v"
    prompt: str = Field(min_length=1, max_length=2000)
    negative: str = Field(default="", max_length=1000)
    duration: Literal[5, 10, 15, 30] = 5
    aspect: Literal["16:9", "9:16", "1:1"] = "16:9"
    quality: Literal["fast", "balanced", "quality"] = "fast"
    fps: Literal[16, 24] = 24
    seed: int | None = Field(default=None, ge=0, le=2**53)
    input_file_id: str | None = None
    input_media_id: str | None = None
    source_video_id: str | None = None
    project_id: str | None = None


async def _comfy_info() -> dict | None:
    try:
        return await comfyui.object_info()
    except comfyui.ComfyError:
        return None


@router.get("/presets")
async def presets(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    info = await _comfy_info()
    # measured durations of recent jobs → honest time estimates
    rows = (await db.execute(select(Job).where(Job.status == "done").order_by(Job.finished_at.desc()).limit(200))).scalars().all()
    timings: dict[str, list[float]] = {}
    for j in rows:
        if j.started_at and j.finished_at:
            p = j.params or {}
            key = f"{j.kind}:{p.get('mode')}:{p.get('quality')}:{p.get('aspect')}"
            per = (j.finished_at - j.started_at).total_seconds() / max(1, int(p.get("count", 1)) if j.kind == "image" else
                                                                         int((j.result or {}).get("segments", 1)))
            timings.setdefault(key, []).append(per)
    return {
        "comfyui_online": info is not None,
        "ffmpeg": ffmpeg.available(),
        "presets": workflows.availability(info),
        "styles": list(workflows.STYLE_PRESETS.keys()),
        "image_sizes": workflows.IMAGE_SIZES,
        "video_sizes": workflows.VIDEO_SIZES,
        "timings": {k: round(sum(v[:10]) / len(v[:10])) for k, v in timings.items()},
        "max_video_seconds": system_settings.get("max_video_seconds"),
        "features": plans.features_for(user),
    }


async def _resolve_source(db: AsyncSession, user: User, file_id: str | None, media_id: str | None,
                          want: str = "image") -> str:
    if file_id:
        a = await db.get(Attachment, file_id)
        if a is None or a.user_id != user.id or a.kind != "image":
            raise HTTPException(404, "Source image not found.")
        return a.storage_path
    if media_id:
        m = await db.get(MediaItem, media_id)
        if m is None or m.user_id != user.id or m.kind != want:
            raise HTTPException(404, f"Source {want} not found.")
        return m.storage_path
    raise HTTPException(422, f"This mode needs a source {want}.")


async def _check_quota_and_project(db: AsyncSession, user: User, project_id: str | None) -> None:
    if await queue.queued_count(db, user.id) >= int(system_settings.get("max_queued_jobs_per_user")):
        raise HTTPException(429, "You already have the maximum number of jobs in the queue. Wait for them to finish.")
    if project_id:
        p = await db.get(Project, project_id)
        if p is None or p.user_id != user.id:
            raise HTTPException(404, "Project not found.")


@router.post("/image")
async def submit_image(body: ImageJobIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    feature = "image_generate" if body.mode == "t2i" else "image_edit"
    if not plans.has_feature(user, feature):
        raise HTTPException(403, "Image editing is part of VELQIN Creator. Ask the owner for access."
                            if feature == "image_edit" else "Image generation is not enabled for your account.")
    if body.mode not in ("upscale",) and not body.prompt.strip() and body.mode == "t2i":
        raise HTTPException(422, "Please describe the image you want.")
    if body.mode != "upscale":
        preset = workflows.ALL_PRESETS.get(body.preset)
        if preset is None or preset.kind != "image" or body.mode not in preset.modes:
            raise HTTPException(422, "This model doesn't support that mode.")
    if body.aspect not in workflows.IMAGE_SIZES:
        raise HTTPException(422, "Unsupported aspect ratio.")
    if body.style not in workflows.STYLE_PRESETS:
        raise HTTPException(422, "Unknown style.")
    if reason := check_prompt(f"{body.prompt} {body.negative}" if body.mode != "upscale" else ""):
        raise HTTPException(400, reason)
    await _check_quota_and_project(db, user, body.project_id)

    params = body.model_dump(exclude={"mask_png", "project_id"})
    if not plans.has_feature(user, "advanced_settings"):
        params["seed"] = None
        params["quality"] = "fast" if body.quality == "quality" else body.quality
    if body.mode != "t2i":
        params["_input_path"] = await _resolve_source(db, user, body.input_file_id, body.input_media_id)
    if body.mode == "inpaint":
        if not body.mask_png:
            raise HTTPException(422, "Paint the area you want to change first.")
        raw = body.mask_png.split(",", 1)[-1]
        try:
            data = base64.b64decode(raw, validate=True)
            mask = Image.open(io.BytesIO(data))
            mask.load()
        except (binascii.Error, ValueError, OSError) as e:
            raise HTTPException(422, "Invalid mask image.") from e
        if mask.getextrema() == ((0, 0),) or (mask.convert("L").getextrema()[1] < 128):
            raise HTTPException(422, "The mask is empty — paint over the area to change.")
        path = user_dir(user.id, "tmp") / f"mask_{secrets.token_hex(6)}.png"
        mask.convert("L").save(path, "PNG")
        params["_mask_path"] = to_relative(path)
    if body.mode == "outpaint":
        ext = body.outpaint or {}
        clean = {k: min(1.0, max(0.0, float(ext.get(k, 0) or 0))) for k in ("left", "right", "top", "bottom")}
        if not any(clean.values()):
            raise HTTPException(422, "Choose at least one direction to extend.")
        params["outpaint"] = clean
    kind = "image"
    job = await queue.submit(db, user.id, kind, params, project_id=body.project_id)
    positions = await queue.positions(db)
    return {"job": job_public(job, positions.get(job.id))}


@router.post("/video")
async def submit_video(body: VideoJobIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not plans.has_feature(user, "video"):
        raise HTTPException(403, "VELQIN Motion is part of VELQIN Creator. Ask the owner for access.")
    if body.duration > 5 and not plans.has_feature(user, "long_video"):
        raise HTTPException(403, "Videos longer than 5 s (segment extension) are part of VELQIN Studio.")
    if body.duration > int(system_settings.get("max_video_seconds")):
        raise HTTPException(422, "This duration is disabled by the owner.")
    if body.preset not in workflows.ALL_PRESETS or workflows.ALL_PRESETS[body.preset].kind != "video":
        raise HTTPException(422, "Unknown video model.")
    if reason := check_prompt(f"{body.prompt} {body.negative}"):
        raise HTTPException(400, reason)
    await _check_quota_and_project(db, user, body.project_id)
    params = body.model_dump(exclude={"project_id"})
    if not plans.has_feature(user, "advanced_settings"):
        params["seed"] = None
    if body.mode == "i2v":
        params["_input_path"] = await _resolve_source(db, user, body.input_file_id, body.input_media_id)
    if body.mode == "extend":
        params["_source_video_path"] = await _resolve_source(db, user, None, body.source_video_id, want="video")
    job = await queue.submit(db, user.id, "video", params, project_id=body.project_id)
    positions = await queue.positions(db)
    return {"job": job_public(job, positions.get(job.id))}

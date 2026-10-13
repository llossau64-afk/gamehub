"""Saving generated media into the per-user library."""
from __future__ import annotations

import io
import secrets
from pathlib import Path

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from models import Job, MediaItem
from security.files import to_relative, user_dir
from services import ffmpeg


def media_public(m: MediaItem) -> dict:
    return {"id": m.id, "kind": m.kind, "mime": m.mime, "width": m.width, "height": m.height,
            "duration": m.duration, "prompt": m.prompt, "params": m.params or {}, "favorite": m.favorite,
            "project_id": m.project_id, "job_id": m.job_id, "has_thumb": bool(m.thumb_path),
            "created_at": m.created_at.isoformat() + "Z"}


async def save_image(db: AsyncSession, job: Job, data: bytes, prompt: str, params: dict) -> MediaItem:
    d = user_dir(job.user_id, "media")
    name = secrets.token_hex(8)
    img = Image.open(io.BytesIO(data))
    img.load()
    path = d / f"{name}.png"
    path.write_bytes(data)
    thumb = img.convert("RGB")
    thumb.thumbnail((512, 512))
    tpath = d / f"{name}_thumb.webp"
    thumb.save(tpath, "WEBP", quality=82)
    item = MediaItem(user_id=job.user_id, project_id=job.project_id, job_id=job.id, kind="image",
                     storage_path=to_relative(path), thumb_path=to_relative(tpath), mime="image/png",
                     width=img.width, height=img.height, prompt=prompt, params=params)
    db.add(item)
    await db.commit()
    return item


async def save_video(db: AsyncSession, job: Job, src: Path, prompt: str, params: dict) -> MediaItem:
    d = user_dir(job.user_id, "media")
    name = secrets.token_hex(8)
    path = d / f"{name}.mp4"
    await ffmpeg.to_mp4(src, path)
    tpath = d / f"{name}_thumb.jpg"
    try:
        await ffmpeg.thumbnail(path, tpath)
    except RuntimeError:
        tpath = None
    info = await ffmpeg.probe(path)
    item = MediaItem(user_id=job.user_id, project_id=job.project_id, job_id=job.id, kind="video",
                     storage_path=to_relative(path), thumb_path=to_relative(tpath) if tpath else None,
                     mime="video/mp4", width=info["width"], height=info["height"], duration=round(info["duration"], 2),
                     prompt=prompt, params={**params, "fps_actual": info["fps"]})
    db.add(item)
    await db.commit()
    return item

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user
from database.db import get_db
from models import MediaItem, Project, User
from security.files import resolve_storage_path
from services.media import media_public

router = APIRouter(prefix="/api/media", tags=["media"])


class MediaPatch(BaseModel):
    favorite: bool | None = None
    project_id: str | None = Field(default=None, max_length=32)
    clear_project: bool = False


async def _own(db: AsyncSession, mid: str, user: User) -> MediaItem:
    m = await db.get(MediaItem, mid)
    if m is None or m.user_id != user.id:
        raise HTTPException(404, "Not found.")
    return m


@router.get("")
async def list_media(kind: str | None = Query(default=None, pattern="^(image|video)$"), project_id: str | None = None,
                     favorites: bool = False, q: str = Query(default="", max_length=200),
                     before: str | None = None, limit: int = Query(default=60, le=200),
                     user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(MediaItem).where(MediaItem.user_id == user.id)
    if kind:
        stmt = stmt.where(MediaItem.kind == kind)
    if project_id:
        stmt = stmt.where(MediaItem.project_id == project_id)
    if favorites:
        stmt = stmt.where(MediaItem.favorite.is_(True))
    if q.strip():
        stmt = stmt.where(MediaItem.prompt.ilike(f"%{q.strip()}%"))
    if before:
        ref = await db.get(MediaItem, before)
        if ref:
            stmt = stmt.where(MediaItem.created_at < ref.created_at)
    rows = (await db.execute(stmt.order_by(MediaItem.created_at.desc()).limit(limit))).scalars().all()
    return {"items": [media_public(m) for m in rows]}


@router.get("/{mid}")
async def get_media(mid: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return {"item": media_public(await _own(db, mid, user))}


@router.get("/{mid}/file")
async def media_file(mid: str, download: bool = False, user: User = Depends(current_user),
                     db: AsyncSession = Depends(get_db)):
    m = await _own(db, mid, user)
    path = resolve_storage_path(m.storage_path)
    if not path.exists():
        raise HTTPException(404, "File missing.")
    ext = ".mp4" if m.kind == "video" else ".png"
    name = f"velqin-{m.kind}-{m.id}{ext}"
    return FileResponse(path, media_type=m.mime, filename=name,
                        content_disposition_type="attachment" if download else "inline",
                        headers={"Cache-Control": "private, max-age=86400"})


@router.get("/{mid}/thumb")
async def media_thumb(mid: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    m = await _own(db, mid, user)
    if not m.thumb_path:
        raise HTTPException(404, "No thumbnail.")
    path = resolve_storage_path(m.thumb_path)
    mime = "image/webp" if path.suffix == ".webp" else "image/jpeg"
    return FileResponse(path, media_type=mime, headers={"Cache-Control": "private, max-age=86400"})


@router.patch("/{mid}")
async def update_media(mid: str, body: MediaPatch, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    m = await _own(db, mid, user)
    if body.favorite is not None:
        m.favorite = body.favorite
    if body.clear_project:
        m.project_id = None
    elif body.project_id:
        p = await db.get(Project, body.project_id)
        if p is None or p.user_id != user.id:
            raise HTTPException(404, "Project not found.")
        m.project_id = body.project_id
    await db.commit()
    return {"item": media_public(m)}


@router.delete("/{mid}")
async def delete_media(mid: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    m = await _own(db, mid, user)
    for rel in (m.storage_path, m.thumb_path):
        if rel:
            try:
                resolve_storage_path(rel).unlink(missing_ok=True)
            except PermissionError:
                pass
    await db.delete(m)
    await db.commit()
    return {"ok": True}

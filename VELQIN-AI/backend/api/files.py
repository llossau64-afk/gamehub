from __future__ import annotations

import asyncio
import logging
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user, require_feature
from database.db import get_db
from models import Attachment, Project, User
from security.files import resolve_storage_path, sanitize_filename, sniff_type, to_relative, user_dir
from services import rag, system_settings
from services.documents import extract_text

log = logging.getLogger("velqin.files")
router = APIRouter(prefix="/api/files", tags=["files"])

Image.MAX_IMAGE_PIXELS = 60_000_000  # decompression-bomb guard


def attachment_public(a: Attachment) -> dict:
    return {"id": a.id, "filename": a.filename, "kind": a.kind, "mime": a.mime, "size": a.size,
            "project_id": a.project_id, "text_chars": a.text_chars, "indexed": a.indexed,
            "created_at": a.created_at.isoformat() + "Z"}


@router.post("")
async def upload_file(file: UploadFile = File(...), project_id: str | None = Form(default=None),
                      user: User = Depends(require_feature("files")), db: AsyncSession = Depends(get_db)):
    if project_id:
        p = await db.get(Project, project_id)
        if p is None or p.user_id != user.id:
            raise HTTPException(404, "Project not found.")
    limit = int(system_settings.get("max_upload_mb")) * 2**20
    filename = sanitize_filename(file.filename or "file")
    head = await file.read(4096)
    detected = sniff_type(head, filename)
    if detected is None:
        raise HTTPException(415, "Unsupported or mismatching file type. Allowed: PDF, DOCX, TXT, MD, CSV, code files, PNG, JPG, WEBP.")
    type_key, kind, mime = detected

    dest_dir = user_dir(user.id, "uploads")
    stored = dest_dir / f"{secrets.token_hex(8)}{Path(filename).suffix.lower()}"
    size = len(head)
    try:
        with stored.open("wb") as fh:
            fh.write(head)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"File is larger than {limit // 2**20} MB.")
                fh.write(chunk)
    except HTTPException:
        stored.unlink(missing_ok=True)
        raise

    att = Attachment(user_id=user.id, project_id=project_id, filename=filename, kind=kind, mime=mime, size=size,
                     storage_path=to_relative(stored))
    if kind == "image":
        try:
            with Image.open(stored) as img:
                img.verify()
            with Image.open(stored) as img:
                img.load()
                w, h = img.size
                # Re-encode very large images so the vision model gets a sane size (and EXIF/GPS is stripped).
                if max(w, h) > 2048 or type_key == "jpg":
                    img = img.convert("RGB" if type_key == "jpg" else "RGBA")
                    img.thumbnail((2048, 2048))
                    fmt = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP"}[type_key]
                    img.save(stored, fmt, quality=92)
                    att.size = stored.stat().st_size
        except Exception as e:  # noqa: BLE001
            stored.unlink(missing_ok=True)
            raise HTTPException(415, "The image could not be read.") from e
        db.add(att)
        await db.commit()
        return {"file": attachment_public(att)}

    try:
        text = await asyncio.to_thread(extract_text, stored, type_key)
    except ValueError as e:
        stored.unlink(missing_ok=True)
        raise HTTPException(422, str(e)) from e
    text_file = stored.with_suffix(stored.suffix + ".txt")
    text_file.write_text(text, encoding="utf-8")
    att.text_path = to_relative(text_file)
    att.text_chars = len(text)
    db.add(att)
    await db.commit()
    try:
        await rag.index_attachment(db, att, text)
    except Exception as e:  # noqa: BLE001 — indexing is best effort
        log.warning("Indexing failed: %s", type(e).__name__)
    return {"file": attachment_public(att)}


@router.get("")
async def list_files(project_id: str | None = None, q: str = Query(default="", max_length=200),
                     user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Attachment).where(Attachment.user_id == user.id)
    if project_id:
        stmt = stmt.where(Attachment.project_id == project_id)
    if q.strip():
        stmt = stmt.where(Attachment.filename.ilike(f"%{q.strip()}%"))
    rows = (await db.execute(stmt.order_by(Attachment.created_at.desc()).limit(500))).scalars().all()
    return {"files": [attachment_public(a) for a in rows]}


async def _own(db: AsyncSession, file_id: str, user: User) -> Attachment:
    a = await db.get(Attachment, file_id)
    if a is None or a.user_id != user.id:
        raise HTTPException(404, "File not found.")
    return a


@router.get("/{file_id}/content")
async def file_content(file_id: str, download: bool = False, user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    a = await _own(db, file_id, user)
    path = resolve_storage_path(a.storage_path)
    if not path.exists():
        raise HTTPException(404, "File missing on disk.")
    # Only images are shown inline; documents are always downloaded (never rendered as HTML).
    inline = a.kind == "image" and not download
    return FileResponse(path, media_type=a.mime if inline else "application/octet-stream", filename=a.filename,
                        content_disposition_type="inline" if inline else "attachment",
                        headers={"Cache-Control": "private, max-age=3600"})


@router.patch("/{file_id}")
async def move_file(file_id: str, body: dict, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    a = await _own(db, file_id, user)
    pid = body.get("project_id")
    if pid:
        p = await db.get(Project, pid)
        if p is None or p.user_id != user.id:
            raise HTTPException(404, "Project not found.")
    a.project_id = pid or None
    from sqlalchemy import update
    from models import DocumentChunk

    await db.execute(update(DocumentChunk).where(DocumentChunk.attachment_id == a.id).values(project_id=a.project_id))
    await db.commit()
    return {"file": attachment_public(a)}


@router.delete("/{file_id}")
async def delete_file(file_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    a = await _own(db, file_id, user)
    for rel in (a.storage_path, a.text_path):
        if rel:
            try:
                resolve_storage_path(rel).unlink(missing_ok=True)
            except PermissionError:
                pass
    await db.delete(a)
    await db.commit()
    return {"ok": True}

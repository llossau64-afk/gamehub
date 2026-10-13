from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user, require_feature
from database.db import get_db
from models import Attachment, Chat, MediaItem, Project, User

router = APIRouter(prefix="/api/projects", tags=["projects"])
COLORS = r"^(violet|blue|silver|emerald|amber|rose|cyan)$"


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=4000)
    instructions: str = Field(default="", max_length=8000)
    color: str = Field(default="violet", pattern=COLORS)


class ProjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    instructions: str | None = Field(default=None, max_length=8000)
    color: str | None = Field(default=None, pattern=COLORS)


def project_public(p: Project, counts: dict | None = None) -> dict:
    return {"id": p.id, "name": p.name, "description": p.description, "instructions": p.instructions,
            "color": p.color, "created_at": p.created_at.isoformat() + "Z", "updated_at": p.updated_at.isoformat() + "Z",
            **({"counts": counts} if counts is not None else {})}


async def _counts(db: AsyncSession, pid: str) -> dict:
    c = (await db.execute(select(func.count(Chat.id)).where(Chat.project_id == pid))).scalar_one()
    f = (await db.execute(select(func.count(Attachment.id)).where(Attachment.project_id == pid))).scalar_one()
    i = (await db.execute(select(func.count(MediaItem.id)).where(MediaItem.project_id == pid, MediaItem.kind == "image"))).scalar_one()
    v = (await db.execute(select(func.count(MediaItem.id)).where(MediaItem.project_id == pid, MediaItem.kind == "video"))).scalar_one()
    return {"chats": c, "files": f, "images": i, "videos": v}


async def _own(db: AsyncSession, pid: str, user: User) -> Project:
    p = await db.get(Project, pid)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "Project not found.")
    return p


@router.get("")
async def list_projects(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc()))).scalars().all()
    return {"projects": [project_public(p, await _counts(db, p.id)) for p in rows]}


@router.post("")
async def create_project(body: ProjectIn, user: User = Depends(require_feature("projects")), db: AsyncSession = Depends(get_db)):
    p = Project(user_id=user.id, **body.model_dump())
    db.add(p)
    await db.commit()
    return {"project": project_public(p, {"chats": 0, "files": 0, "images": 0, "videos": 0})}


@router.get("/{pid}")
async def get_project(pid: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    p = await _own(db, pid, user)
    return {"project": project_public(p, await _counts(db, p.id))}


@router.patch("/{pid}")
async def update_project(pid: str, body: ProjectPatch, user: User = Depends(require_feature("projects")),
                         db: AsyncSession = Depends(get_db)):
    p = await _own(db, pid, user)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    await db.commit()
    return {"project": project_public(p, await _counts(db, p.id))}


@router.delete("/{pid}")
async def delete_project(pid: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Deletes the project only. Its chats, files and media stay in the library (unassigned)."""
    p = await _own(db, pid, user)
    from sqlalchemy import update
    from models import DocumentChunk

    await db.execute(update(DocumentChunk).where(DocumentChunk.project_id == p.id).values(project_id=None))
    await db.delete(p)
    await db.commit()
    return {"ok": True}

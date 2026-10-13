"""VELQIN Search: one search box across chats, messages, files and the media gallery (own data only)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user
from database.db import get_db
from models import Attachment, Chat, MediaItem, Message, Project, User

router = APIRouter(prefix="/api/search", tags=["search"])


def _snippet(text: str, q: str, width: int = 140) -> str:
    i = text.lower().find(q.lower())
    if i < 0:
        return text[:width]
    start = max(0, i - width // 3)
    return ("…" if start else "") + text[start:start + width] + ("…" if start + width < len(text) else "")


@router.get("")
async def global_search(q: str = Query(min_length=1, max_length=200), user: User = Depends(current_user),
                        db: AsyncSession = Depends(get_db)):
    like = f"%{q.strip()}%"
    chats = (await db.execute(select(Chat).where(Chat.user_id == user.id, Chat.title.ilike(like))
                              .order_by(Chat.updated_at.desc()).limit(20))).scalars().all()
    msg_rows = (await db.execute(
        select(Message, Chat.title).join(Chat, Chat.id == Message.chat_id)
        .where(Chat.user_id == user.id, Message.content.ilike(like)).order_by(Message.created_at.desc()).limit(30)
    )).all()
    files = (await db.execute(select(Attachment).where(Attachment.user_id == user.id, Attachment.filename.ilike(like))
                              .limit(20))).scalars().all()
    media = (await db.execute(select(MediaItem).where(MediaItem.user_id == user.id, MediaItem.prompt.ilike(like))
                              .order_by(MediaItem.created_at.desc()).limit(24))).scalars().all()
    projects = (await db.execute(select(Project).where(Project.user_id == user.id,
                                                       or_(Project.name.ilike(like), Project.description.ilike(like)))
                                 .limit(10))).scalars().all()
    return {
        "chats": [{"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat() + "Z"} for c in chats],
        "messages": [{"id": m.id, "chat_id": m.chat_id, "chat_title": title, "role": m.role,
                      "snippet": _snippet(m.content, q)} for m, title in msg_rows],
        "files": [{"id": a.id, "filename": a.filename, "kind": a.kind} for a in files],
        "media": [{"id": m.id, "kind": m.kind, "prompt": m.prompt[:160]} for m in media],
        "projects": [{"id": p.id, "name": p.name} for p in projects],
    }

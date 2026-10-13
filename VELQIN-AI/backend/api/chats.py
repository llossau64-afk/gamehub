from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.sse import sse_event, sse_response
from auth.deps import current_user
from core.time import utcnow
from database.db import get_db
from models import Attachment, Chat, Memory, Message, Project, User
from services import plans
from services.chat_engine import manager, serialize_message

router = APIRouter(prefix="/api", tags=["chats"])


class ChatCreate(BaseModel):
    title: str = Field(default="New chat", max_length=200)
    model: str = Field(default="auto", max_length=64)
    project_id: str | None = None


class ChatUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    model: str | None = Field(default=None, max_length=64)
    pinned: bool | None = None
    project_id: str | None = Field(default=None, max_length=32)
    clear_project: bool = False


class SendIn(BaseModel):
    content: str = Field(default="", max_length=60_000)
    model: str | None = Field(default=None, max_length=64)
    attachment_ids: list[str] = Field(default_factory=list, max_length=10)
    web_search: bool = False
    think: bool = False
    mode: Literal["send", "edit", "regenerate"] = "send"
    message_id: str | None = None  # for edit: the user message to edit


def chat_public(c: Chat) -> dict:
    return {"id": c.id, "title": c.title, "model": c.model, "pinned": c.pinned, "project_id": c.project_id,
            "created_at": c.created_at.isoformat() + "Z", "updated_at": c.updated_at.isoformat() + "Z"}


async def _own_chat(db: AsyncSession, chat_id: str, user: User) -> Chat:
    chat = await db.get(Chat, chat_id)
    if chat is None or chat.user_id != user.id:
        raise HTTPException(404, "Chat not found.")
    return chat


async def _own_project(db: AsyncSession, project_id: str, user: User) -> Project:
    p = await db.get(Project, project_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "Project not found.")
    return p


@router.get("/chats")
async def list_chats(q: str = Query(default="", max_length=200), project_id: str | None = None,
                     limit: int = Query(default=200, le=500), user: User = Depends(current_user),
                     db: AsyncSession = Depends(get_db)):
    stmt = select(Chat).where(Chat.user_id == user.id)
    if project_id:
        stmt = stmt.where(Chat.project_id == project_id)
    if q.strip():
        like = f"%{q.strip()}%"
        sub = select(Message.chat_id).where(Message.content.ilike(like))
        stmt = stmt.where(or_(Chat.title.ilike(like), Chat.id.in_(sub)))
    stmt = stmt.order_by(Chat.pinned.desc(), Chat.updated_at.desc()).limit(limit)
    chats = (await db.execute(stmt)).scalars().all()
    return {"chats": [chat_public(c) for c in chats]}


@router.post("/chats")
async def create_chat(body: ChatCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.project_id:
        await _own_project(db, body.project_id, user)
    chat = Chat(user_id=user.id, title=body.title.strip() or "New chat", model=body.model, project_id=body.project_id)
    db.add(chat)
    await db.commit()
    return {"chat": chat_public(chat)}


@router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    chat = await _own_chat(db, chat_id, user)
    msgs = (await db.execute(select(Message).where(Message.chat_id == chat.id).order_by(Message.seq))).scalars().all()
    att_ids = {a for m in msgs for a in (m.attachment_ids or [])}
    atts = {}
    if att_ids:
        for a in (await db.execute(select(Attachment).where(Attachment.id.in_(att_ids), Attachment.user_id == user.id))).scalars():
            atts[a.id] = {"id": a.id, "filename": a.filename, "kind": a.kind, "size": a.size, "mime": a.mime}
    out = []
    for m in msgs:
        d = serialize_message(m)
        d["attachments"] = [atts[a] for a in (m.attachment_ids or []) if a in atts]
        gen = manager.get(m.id)
        d["live"] = bool(gen and not gen.done)
        out.append(d)
    return {"chat": chat_public(chat), "messages": out}


@router.patch("/chats/{chat_id}")
async def update_chat(chat_id: str, body: ChatUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    chat = await _own_chat(db, chat_id, user)
    if body.title is not None:
        chat.title = body.title.strip()
        chat.title_generated = True
    if body.model is not None:
        chat.model = body.model
    if body.pinned is not None:
        chat.pinned = body.pinned
    if body.clear_project:
        chat.project_id = None
    elif body.project_id:
        await _own_project(db, body.project_id, user)
        chat.project_id = body.project_id
    await db.commit()
    return {"chat": chat_public(chat)}


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    chat = await _own_chat(db, chat_id, user)
    for gen in list(manager.active.values()):
        if gen.chat_id == chat.id:
            gen.stop_requested = True
    await db.execute(delete(Message).where(Message.chat_id == chat.id))
    await db.delete(chat)
    await db.commit()
    return {"ok": True}


@router.post("/chats/{chat_id}/messages")
async def send_message(chat_id: str, body: SendIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not plans.has_feature(user, "chat"):
        raise HTTPException(403, "Chat is not enabled for your account.")
    chat = await _own_chat(db, chat_id, user)
    if any(g.chat_id == chat.id and not g.done for g in manager.active.values()):
        raise HTTPException(409, "An answer is still being generated in this chat. Stop it first.")
    if body.web_search and not plans.has_feature(user, "web_search"):
        raise HTTPException(403, "Web search is not enabled for your account.")

    msgs = (await db.execute(select(Message).where(Message.chat_id == chat.id).order_by(Message.seq))).scalars().all()
    next_seq = (msgs[-1].seq + 1) if msgs else 0
    user_msg: Message | None = None

    if body.mode == "send":
        content = body.content.strip()
        if not content and not body.attachment_ids:
            raise HTTPException(422, "Message is empty.")
        if body.attachment_ids:
            if not plans.has_feature(user, "files"):
                raise HTTPException(403, "File analysis is not enabled for your account.")
            owned = (await db.execute(select(func.count(Attachment.id)).where(
                Attachment.id.in_(body.attachment_ids), Attachment.user_id == user.id))).scalar_one()
            if owned != len(set(body.attachment_ids)):
                raise HTTPException(404, "Attachment not found.")
        user_msg = Message(chat_id=chat.id, seq=next_seq, role="user",
                           content=content or "(see attached files)", attachment_ids=list(dict.fromkeys(body.attachment_ids)))
        db.add(user_msg)
        next_seq += 1
    elif body.mode == "edit":
        target = next((m for m in msgs if m.id == body.message_id and m.role == "user"), None)
        if target is None:
            raise HTTPException(404, "Message not found.")
        if not body.content.strip():
            raise HTTPException(422, "Message is empty.")
        target.content = body.content.strip()
        await db.execute(delete(Message).where(Message.chat_id == chat.id, Message.seq > target.seq))
        user_msg = target
        next_seq = target.seq + 1
    else:  # regenerate
        last_user = next((m for m in reversed(msgs) if m.role == "user"), None)
        if last_user is None:
            raise HTTPException(422, "Nothing to regenerate.")
        await db.execute(delete(Message).where(Message.chat_id == chat.id, Message.seq > last_user.seq))
        user_msg = last_user
        next_seq = last_user.seq + 1

    if body.model:
        chat.model = body.model
    assistant = Message(chat_id=chat.id, seq=next_seq, role="assistant", content="", status="streaming",
                        meta={"web_search": body.web_search})
    db.add(assistant)
    chat.updated_at = utcnow()
    await db.commit()

    gen = manager.start(chat.id, user.id, assistant.id,
                        {"model": body.model or chat.model, "web_search": body.web_search, "think": body.think})

    start_payload = {"type": "start", "user_message": serialize_message(user_msg),
                     "assistant_message": serialize_message(assistant), "chat": chat_public(chat)}

    async def stream():
        yield sse_event(start_payload, 0)
        async for item in gen.subscribe(0):
            if item is None:
                yield ": keep-alive\n\n"
                continue
            idx, ev = item
            yield sse_event(ev, idx)

    return sse_response(stream())


@router.get("/generations/{message_id}/stream")
async def resume_stream(message_id: str, request: Request, offset: int = Query(default=0, ge=0),
                        user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Re-attach to a running generation (e.g. after a network drop). `offset` = number of events already seen."""
    last_id = request.headers.get("last-event-id")
    if last_id and last_id.isdigit():
        offset = max(offset, int(last_id))
    gen = manager.get(message_id)
    msg = await db.get(Message, message_id)
    if msg is None:
        raise HTTPException(404, "Message not found.")
    chat = await db.get(Chat, msg.chat_id)
    if chat is None or chat.user_id != user.id:
        raise HTTPException(404, "Message not found.")

    async def stream():
        if gen is None or gen.user_id != user.id:
            # generation already finished and was cleaned up (or the server restarted): send final state
            yield sse_event({"type": "done", "status": msg.status, "message": serialize_message(msg)})
            return
        async for item in gen.subscribe(offset):
            if item is None:
                yield ": keep-alive\n\n"
                continue
            idx, ev = item
            yield sse_event(ev, idx)

    return sse_response(stream())


@router.post("/generations/{message_id}/stop")
async def stop_generation(message_id: str, user: User = Depends(current_user)):
    gen = manager.get(message_id)
    if gen is None or gen.user_id != user.id:
        return {"stopped": False}
    return {"stopped": manager.stop(message_id)}


@router.post("/messages/{message_id}/remember")
async def remember_message(message_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    chat = await db.get(Chat, msg.chat_id) if msg else None
    if msg is None or chat is None or chat.user_id != user.id:
        raise HTTPException(404, "Message not found.")
    db.add(Memory(user_id=user.id, content=msg.content.strip()[:500]))
    if not user.memory_enabled:
        user.memory_enabled = True
    await db.commit()
    return {"ok": True}

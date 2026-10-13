"""All database tables. IDs are random URL-safe strings so they can't be guessed or enumerated."""
from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.time import utcnow
from database.db import Base


def new_id() -> str:
    return secrets.token_urlsafe(12)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="user")  # owner | admin | user
    plan: Mapped[str] = mapped_column(String(16), default="free")  # free | creator | studio | owner
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    avatar_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    memory_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Invite(Base):
    __tablename__ = "invites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    code_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    code_hint: Mapped[str] = mapped_column(String(16), default="")
    note: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(16), default="user")
    plan: Mapped[str] = mapped_column(String(16), default="free")
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    uses: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="violet")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Chat(Base):
    __tablename__ = "chats"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    title_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(String(64), default="auto")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    messages: Mapped[list[Message]] = relationship(
        back_populates="chat", cascade="all, delete-orphan", order_by="Message.seq", passive_deletes=True
    )


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    chat_id: Mapped[str] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    thinking: Mapped[str] = mapped_column(Text, default="")
    # streaming | complete | stopped | error | interrupted
    status: Mapped[str] = mapped_column(String(16), default="complete")
    model_profile: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_tag: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # sources: [{"index", "title", "url", "published", "kind": "web"|"file"}], knowledge: ["model","web","file"]
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    chat: Mapped[Chat] = relationship(back_populates="messages")

    __table_args__ = (Index("ix_messages_chat_seq", "chat_id", "seq"),)


class Attachment(Base):
    """An uploaded file (document or image)."""

    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(16))  # document | image
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str] = mapped_column(String(255))  # relative to data_dir
    text_chars: Mapped[int] = mapped_column(Integer, default=0)
    text_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    indexed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attachment_id: Mapped[str] = mapped_column(ForeignKey("attachments.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    project_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    embed_model: Mapped[str | None] = mapped_column(String(128), nullable=True)


class Memory(Base):
    __tablename__ = "memories"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AIModelProfile(Base):
    """A VELQIN model profile (e.g. "VELQIN Swift") mapped to a local Ollama model tag."""

    __tablename__ = "ai_models"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    tagline: Mapped[str] = mapped_column(String(200), default="")
    ollama_tag: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(16), default="chat")  # chat | vision | code | embed
    vision: Mapped[bool] = mapped_column(Boolean, default=False)
    thinking: Mapped[bool] = mapped_column(Boolean, default=False)
    context_length: Mapped[int] = mapped_column(Integer, default=8192)
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    min_plan: Mapped[str] = mapped_column(String(16), default="free")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    sort: Mapped[int] = mapped_column(Integer, default=100)
    size_hint_gb: Mapped[float] = mapped_column(Float, default=0)
    license: Mapped[str] = mapped_column(String(80), default="")


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    kind: Mapped[str] = mapped_column(String(16))  # image | video
    # queued | running | done | failed | cancelled
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    priority: Mapped[int] = mapped_column(Integer, default=50)  # lower = earlier
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    step: Mapped[str] = mapped_column(String(200), default="")
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    retry_of: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class MediaItem(Base):
    __tablename__ = "media"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    job_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    kind: Mapped[str] = mapped_column(String(16))  # image | video
    storage_path: Mapped[str] = mapped_column(String(255))
    thumb_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime: Mapped[str] = mapped_column(String(64))
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    duration: Mapped[float] = mapped_column(Float, default=0)
    prompt: Mapped[str] = mapped_column(Text, default="")
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)

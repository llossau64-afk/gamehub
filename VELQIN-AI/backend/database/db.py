"""Async SQLAlchemy engine/session handling (SQLite by default, PostgreSQL via VELQIN_DATABASE_URL)."""
from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    is_sqlite = url.startswith("sqlite")
    eng = create_async_engine(
        url,
        echo=False,
        connect_args={"timeout": 30} if is_sqlite else {},
        pool_pre_ping=not is_sqlite,
    )
    if is_sqlite:

        @event.listens_for(eng.sync_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.close()

    return eng


engine = _make_engine(settings.db_url)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    import models  # noqa: F401  (registers all tables)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

"""Runtime system settings editable by the owner in the admin dashboard (stored in the DB)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Setting

DEFAULTS: dict[str, Any] = {
    "plans_enabled": True,             # False => every user gets full creative access (no tiers)
    "public_registration": False,      # registration without invite code
    "default_plan": "free",            # plan for users registering without invite (if public)
    "max_queued_jobs_per_user": 4,
    "image_job_timeout_s": 900,
    "video_job_timeout_s": 7200,
    "max_upload_mb": 25,
    "chat_during_gpu_job": "cpu",      # "cpu" = answer on CPU while the GPU is busy | "wait"
    "allow_nsfw_generation": False,
    "web_search_enabled": True,
    "web_fetch_pages": 4,
    "default_model": "auto",
    "max_video_seconds": 30,
}

_cache: dict[str, Any] = {}


async def load_settings(db: AsyncSession) -> dict[str, Any]:
    rows = (await db.execute(select(Setting))).scalars().all()
    values = dict(DEFAULTS)
    for r in rows:
        if r.key in DEFAULTS:
            values[r.key] = r.value
    _cache.clear()
    _cache.update(values)
    return values


def get(key: str) -> Any:
    return _cache.get(key, DEFAULTS.get(key))


def all_settings() -> dict[str, Any]:
    return dict(_cache or DEFAULTS)


async def update_settings(db: AsyncSession, changes: dict[str, Any]) -> dict[str, Any]:
    for key, value in changes.items():
        if key not in DEFAULTS:
            raise KeyError(key)
        expected = type(DEFAULTS[key])
        if expected is bool and not isinstance(value, bool):
            raise ValueError(f"{key} must be a boolean")
        if expected is int and (not isinstance(value, int) or isinstance(value, bool)):
            raise ValueError(f"{key} must be an integer")
        if expected is str and not isinstance(value, str):
            raise ValueError(f"{key} must be a string")
        row = await db.get(Setting, key)
        if row is None:
            db.add(Setting(key=key, value=value))
        else:
            row.value = value
    await db.commit()
    return await load_settings(db)

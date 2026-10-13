from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user, require_admin
from database.db import get_db
from gpu_manager.manager import gpu
from models import AIModelProfile, User
from services import model_registry, ollama, plans
from services.model_pulls import pulls

router = APIRouter(prefix="/api/models", tags=["models"])
TAG_RE = r"^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}(:[a-zA-Z0-9._\-]{1,60})?$"


class PullIn(BaseModel):
    tag: str = Field(pattern=TAG_RE)


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    tagline: str | None = Field(default=None, max_length=200)
    ollama_tag: str | None = Field(default=None, pattern=TAG_RE)
    role: str | None = Field(default=None, pattern=r"^(chat|vision|code|embed)$")
    vision: bool | None = None
    thinking: bool | None = None
    context_length: int | None = Field(default=None, ge=1024, le=131072)
    temperature: float | None = Field(default=None, ge=0, le=2)
    min_plan: str | None = Field(default=None, pattern=r"^(free|creator|studio|owner)$")
    enabled: bool | None = None
    sort: int | None = Field(default=None, ge=0, le=1000)


class ProfileCreate(ProfileIn):
    id: str = Field(pattern=r"^[a-z0-9\-]{2,40}$")
    name: str = Field(max_length=80)
    ollama_tag: str = Field(pattern=TAG_RE)


@router.get("")
async def list_models(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    profiles = await model_registry.profiles_with_status(db, user)
    online = profiles[0]["runtime_online"] if profiles else (await ollama.version()) is not None
    chat_profiles = [p for p in profiles if p["role"] != "embed"]
    return {"runtime_online": online, "profiles": chat_profiles, "auto": {
        "id": "auto", "name": "VELQIN Auto", "tagline": "Picks the best installed model for each request."}}


@router.get("/library")
async def library(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    online, installed = await model_registry.installed_tags(force=True)
    running = await ollama.list_running() if online else []
    profiles = await model_registry.profiles_with_status(db, None, include_disabled=True)
    stats = gpu.system_stats()
    vram = stats["gpus"][0]["vram_total_mb"] / 1024 if stats["gpus"] else None
    catalog = []
    for c in model_registry.CATALOG:
        catalog.append({**c, "installed": model_registry._norm(c["tag"]) in installed,
                        "recommended": c["fits_8gb"] if vram is None else c["vram_gb"] <= vram})
    return {
        "runtime_online": online,
        "version": await ollama.version() if online else None,
        "installed": [{"name": m["name"], "size": m.get("size"), "modified_at": m.get("modified_at"),
                       "details": m.get("details", {})} for m in installed.values()],
        "running": [{"name": m.get("name"), "size_vram": m.get("size_vram"), "expires_at": m.get("expires_at")}
                    for m in running],
        "profiles": profiles,
        "catalog": catalog,
        "pulls": pulls.list(),
        "hardware": {"vram_gb": round(vram, 1) if vram else None, "ram_gb": round(stats["ram_total_mb"] / 1024, 1),
                     "gpu": stats["gpus"][0]["name"] if stats["gpus"] else None},
        "plans": plans.PLAN_ORDER,
    }


@router.post("/pull")
async def pull_model(body: PullIn, user: User = Depends(require_admin)):
    if (await ollama.version()) is None:
        raise HTTPException(503, "Ollama is not running.")
    return {"pull": pulls.start(body.tag)}


@router.get("/pulls")
async def pull_status(user: User = Depends(require_admin)):
    return {"pulls": pulls.list()}


@router.delete("/installed/{tag:path}")
async def delete_installed(tag: str, user: User = Depends(require_admin)):
    if not re.fullmatch(TAG_RE, tag):
        raise HTTPException(422, "Invalid model tag.")
    try:
        await ollama.delete(tag)
    except ollama.OllamaError as e:
        raise HTTPException(502, str(e)) from e
    model_registry.invalidate_cache()
    return {"ok": True}


@router.post("/unload")
async def unload_models(user: User = Depends(require_admin)):
    return {"unloaded": await ollama.unload_all()}


@router.patch("/profiles/{profile_id}")
async def update_profile(profile_id: str, body: ProfileIn, user: User = Depends(require_admin),
                         db: AsyncSession = Depends(get_db)):
    p = await db.get(AIModelProfile, profile_id)
    if p is None:
        raise HTTPException(404, "Profile not found.")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    await db.commit()
    model_registry.invalidate_cache()
    return {"ok": True}


@router.post("/profiles")
async def create_profile(body: ProfileCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if body.id == "auto" or await db.get(AIModelProfile, body.id):
        raise HTTPException(409, "A profile with this id exists.")
    data = body.model_dump(exclude_none=True)
    db.add(AIModelProfile(builtin=False, **data))
    await db.commit()
    return {"ok": True}


@router.delete("/profiles/{profile_id}")
async def delete_profile(profile_id: str, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    p = await db.get(AIModelProfile, profile_id)
    if p is None:
        raise HTTPException(404, "Profile not found.")
    if p.builtin:
        raise HTTPException(400, "Built-in profiles can be disabled but not deleted.")
    await db.delete(p)
    await db.commit()
    return {"ok": True}

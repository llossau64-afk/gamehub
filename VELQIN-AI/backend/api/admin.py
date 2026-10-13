"""Owner/admin dashboard API. Never exposes chat contents, prompts or files of other users."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import require_admin, require_owner
from auth.passwords import hash_password, validate_password
from auth.sessions import destroy_all_sessions
from auth.tokens import hash_token, new_token
from core.logging import memory_errors
from core.time import utcnow
from database.db import get_db
from gpu_manager.manager import gpu
from jobs.queue import job_public, queue
from models import Attachment, Chat, Invite, Job, MediaItem, Message, User, UserSession
from services import backup, health, model_registry, plans, system_settings
from services.chat_engine import manager as chat_manager

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern=r"^(admin|user)$")
    plan: str | None = Field(default=None, pattern=r"^(free|creator|studio)$")
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=256)


class InviteIn(BaseModel):
    note: str = Field(default="", max_length=120)
    role: str = Field(default="user", pattern=r"^(admin|user)$")
    plan: str = Field(default="free", pattern=r"^(free|creator|studio)$")
    max_uses: int = Field(default=1, ge=1, le=50)
    expires_days: int | None = Field(default=14, ge=1, le=365)


class BackupIn(BaseModel):
    include_files: bool = False


@router.get("/overview")
async def overview(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now = utcnow()
    users_total = (await db.execute(select(func.count(User.id)))).scalar_one()
    active_15 = (await db.execute(select(func.count(User.id)).where(User.last_seen_at > now - timedelta(minutes=15)))).scalar_one()
    active_24h = (await db.execute(select(func.count(User.id)).where(User.last_seen_at > now - timedelta(hours=24)))).scalar_one()
    queued = (await db.execute(select(func.count(Job.id)).where(Job.status == "queued"))).scalar_one()
    running = (await db.execute(select(Job).where(Job.status == "running"))).scalars().all()
    failed_24h = (await db.execute(select(func.count(Job.id)).where(Job.status == "failed",
                                                                    Job.finished_at > now - timedelta(hours=24)))).scalar_one()
    chats = (await db.execute(select(func.count(Chat.id)))).scalar_one()
    messages = (await db.execute(select(func.count(Message.id)))).scalar_one()
    images = (await db.execute(select(func.count(MediaItem.id)).where(MediaItem.kind == "image"))).scalar_one()
    videos = (await db.execute(select(func.count(MediaItem.id)).where(MediaItem.kind == "video"))).scalar_one()
    files = (await db.execute(select(func.count(Attachment.id)))).scalar_one()
    online, installed = await model_registry.installed_tags(force=True)
    st = health.state if health.state["checked_at"] else await health.check_all()
    return {
        "users": {"total": users_total, "active_15min": active_15, "active_24h": active_24h},
        "jobs": {"queued": queued, "running": [job_public(j) | {"params": {"mode": (j.params or {}).get("mode")}}
                                               for j in running], "failed_24h": failed_24h},
        "chat": {"live_generations": chat_manager.running_count(), "chats": chats, "messages": messages},
        "library": {"images": images, "videos": videos, "files": files},
        "models": {"runtime_online": online, "installed": len(installed)},
        "services": st["services"],
        "system": gpu.system_stats(),
    }


@router.get("/stats")
async def live_stats(admin: User = Depends(require_admin)):
    return gpu.system_stats()


@router.get("/users")
async def list_users(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User).order_by(User.created_at))).scalars().all()
    out = []
    for u in rows:
        n_chats = (await db.execute(select(func.count(Chat.id)).where(Chat.user_id == u.id))).scalar_one()
        n_media = (await db.execute(select(func.count(MediaItem.id)).where(MediaItem.user_id == u.id))).scalar_one()
        sessions = (await db.execute(select(func.count(UserSession.id)).where(UserSession.user_id == u.id))).scalar_one()
        out.append({"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role, "plan": u.plan,
                    "effective_plan": plans.effective_plan(u), "is_active": u.is_active, "has_avatar": bool(u.avatar_path),
                    "created_at": u.created_at.isoformat() + "Z",
                    "last_seen_at": u.last_seen_at.isoformat() + "Z" if u.last_seen_at else None,
                    "counts": {"chats": n_chats, "media": n_media, "sessions": sessions}})
    return {"users": out}


@router.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserPatch, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "User not found.")
    if u.role == "owner":
        raise HTTPException(400, "The owner account can't be changed here.")
    if body.role is not None and admin.role != "owner":
        raise HTTPException(403, "Only the owner can change roles.")
    if body.role is not None:
        u.role = body.role
    if body.plan is not None:
        u.plan = body.plan
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            await destroy_all_sessions(db, u.id)
    if body.new_password:
        if err := validate_password(body.new_password):
            raise HTTPException(422, err)
        u.password_hash = hash_password(body.new_password)
        await destroy_all_sessions(db, u.id)
    await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    import shutil

    from core.config import settings

    u = await db.get(User, user_id)
    if u is None or u.role == "owner":
        raise HTTPException(400, "This user can't be deleted.")
    await db.delete(u)
    await db.commit()
    shutil.rmtree(settings.uploads_dir / user_id, ignore_errors=True)
    return {"ok": True}


@router.get("/invites")
async def list_invites(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Invite).order_by(Invite.created_at.desc()))).scalars().all()
    now = utcnow()
    return {"invites": [{"id": i.id, "hint": i.code_hint, "note": i.note, "role": i.role, "plan": i.plan,
                         "max_uses": i.max_uses, "uses": i.uses, "revoked": i.revoked,
                         "expired": bool(i.expires_at and i.expires_at < now),
                         "expires_at": i.expires_at.isoformat() + "Z" if i.expires_at else None,
                         "created_at": i.created_at.isoformat() + "Z"} for i in rows]}


@router.post("/invites")
async def create_invite(body: InviteIn, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if body.role == "admin" and admin.role != "owner":
        raise HTTPException(403, "Only the owner can invite admins.")
    raw = new_token(9).upper().replace("_", "X").replace("-", "Y")
    code = f"VQ-{raw[:4]}-{raw[4:8]}-{raw[8:12]}"
    inv = Invite(code_hash=hash_token(code), code_hint=code[-4:], note=body.note, role=body.role, plan=body.plan,
                 max_uses=body.max_uses, created_by=admin.id,
                 expires_at=utcnow() + timedelta(days=body.expires_days) if body.expires_days else None)
    db.add(inv)
    await db.commit()
    # The plain code is shown exactly once.
    return {"code": code, "id": inv.id}


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    inv = await db.get(Invite, invite_id)
    if inv is None:
        raise HTTPException(404, "Invite not found.")
    inv.revoked = True
    await db.commit()
    return {"ok": True}


@router.get("/jobs")
async def all_jobs(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Job, User.username).join(User, User.id == Job.user_id)
                             .order_by(Job.created_at.desc()).limit(100))).all()
    positions = await queue.positions(db)
    out = []
    for j, username in rows:
        d = job_public(j, positions.get(j.id))
        # privacy: admins see technical job data, never the prompt
        d["params"] = {k: v for k, v in d["params"].items() if k not in ("prompt", "negative")}
        d["result"] = {k: v for k, v in d["result"].items() if k != "media_ids"}
        d["username"] = username
        out.append(d)
    return {"jobs": out}


@router.post("/jobs/{job_id}/cancel")
async def admin_cancel(job_id: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    j = await db.get(Job, job_id)
    if j is None:
        raise HTTPException(404, "Job not found.")
    await queue.cancel(db, j)
    return {"ok": True}


@router.get("/settings")
async def get_settings(admin: User = Depends(require_admin)):
    return {"settings": system_settings.all_settings(), "defaults": system_settings.DEFAULTS}


@router.patch("/settings")
async def patch_settings(body: dict, owner: User = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    try:
        values = await system_settings.update_settings(db, body)
    except KeyError as e:
        raise HTTPException(422, f"Unknown setting {e}") from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return {"settings": values}


@router.get("/logs")
async def logs(admin: User = Depends(require_admin)):
    return {"entries": list(reversed(memory_errors.records))[:200]}


@router.get("/backups")
async def backups(owner: User = Depends(require_owner)):
    return {"backups": backup.list_backups()}


@router.post("/backups")
async def make_backup(body: BackupIn, owner: User = Depends(require_owner)):
    path = await backup.create_backup(body.include_files)
    return {"name": path.name, "size": path.stat().st_size}


@router.get("/backups/{name}")
async def download_backup(name: str, owner: User = Depends(require_owner)):
    p = backup.backup_path(name)
    if p is None:
        raise HTTPException(404, "Backup not found.")
    return FileResponse(p, media_type="application/zip", filename=name)


@router.delete("/backups/{name}")
async def delete_backup(name: str, owner: User = Depends(require_owner)):
    p = backup.backup_path(name)
    if p is None:
        raise HTTPException(404, "Backup not found.")
    p.unlink()
    return {"ok": True}

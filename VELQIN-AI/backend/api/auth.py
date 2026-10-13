from __future__ import annotations

import io
import logging
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.schemas import DeleteDataIn, LoginIn, PasswordIn, ProfileIn, RegisterIn
from auth.deps import current_session, current_user
from auth.passwords import hash_password, needs_rehash, validate_password, verify_password
from auth.ratelimit import RateLimiter
from auth.sessions import COOKIE_NAME, client_ip, create_session, destroy_all_sessions, destroy_session
from auth.tokens import hash_token
from core.config import settings
from core.time import utcnow
from database.db import get_db
from models import Chat, Invite, Job, MediaItem, Memory, Project, User, UserSession, Attachment
from security.files import resolve_storage_path, to_relative, user_dir
from services import plans, system_settings

log = logging.getLogger("velqin.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

login_limiter = RateLimiter(limit=settings.login_attempts_per_15min, window_s=15 * 60)
register_limiter = RateLimiter(limit=10, window_s=60 * 60)

_DUMMY_HASH = hash_password("velqin-timing-equalizer")


def user_public(u: User) -> dict:
    return {
        "id": u.id, "username": u.username, "display_name": u.display_name or u.username, "role": u.role,
        "plan": u.plan, "effective_plan": plans.effective_plan(u), "features": plans.features_for(u),
        "has_avatar": bool(u.avatar_path), "memory_enabled": u.memory_enabled, "prefs": u.prefs or {},
        "created_at": u.created_at.isoformat() + "Z",
    }


@router.get("/status")
async def auth_status(db: AsyncSession = Depends(get_db)):
    users = (await db.execute(select(func.count(User.id)))).scalar_one()
    return {
        "needs_setup": users == 0,
        "public_registration": bool(system_settings.get("public_registration")),
    }


@router.post("/setup")
async def setup_owner(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Creates the owner account. Only possible while no user exists."""
    if (await db.execute(select(func.count(User.id)))).scalar_one() > 0:
        raise HTTPException(409, "VELQIN is already set up.")
    if err := validate_password(body.password):
        raise HTTPException(422, err)
    user = User(username=body.username, display_name=body.display_name or body.username,
                password_hash=hash_password(body.password), role="owner", plan="owner")
    db.add(user)
    await db.commit()
    log.info("Owner account created")
    await create_session(db, user, request, response)
    return {"user": user_public(user)}


@router.post("/register")
async def register(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    ip = client_ip(request)
    if register_limiter.is_limited(ip):
        raise HTTPException(429, "Too many registration attempts. Try again later.")
    register_limiter.hit(ip)
    if (await db.execute(select(func.count(User.id)))).scalar_one() == 0:
        raise HTTPException(409, "Please complete the initial setup first.")
    if err := validate_password(body.password):
        raise HTTPException(422, err)

    invite: Invite | None = None
    role, plan = "user", system_settings.get("default_plan")
    code = body.invite_code.strip()
    if code:
        invite = (await db.execute(select(Invite).where(Invite.code_hash == hash_token(code.upper())))).scalar_one_or_none()
        if (invite is None or invite.revoked or invite.uses >= invite.max_uses
                or (invite.expires_at and invite.expires_at < utcnow())):
            raise HTTPException(403, "This invite code is invalid or expired.")
        role, plan = invite.role, invite.plan
    elif not system_settings.get("public_registration"):
        raise HTTPException(403, "Registration requires an invite code.")

    exists = (await db.execute(select(User).where(func.lower(User.username) == body.username.lower()))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "This username is taken.")
    if role == "owner":
        role = "admin"
    user = User(username=body.username, display_name=body.display_name or body.username,
                password_hash=hash_password(body.password), role=role, plan=plan if plan in plans.PLANS else "free")
    db.add(user)
    if invite:
        invite.uses += 1
    await db.commit()
    log.info("New user registered (invite=%s)", bool(invite))
    await create_session(db, user, request, response)
    return {"user": user_public(user)}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    ip = client_ip(request)
    key_ip, key_user = f"ip:{ip}", f"user:{body.username.lower()}"
    if login_limiter.is_limited(key_ip) or login_limiter.is_limited(key_user):
        retry = max(login_limiter.retry_after(key_ip), login_limiter.retry_after(key_user))
        raise HTTPException(429, f"Too many login attempts. Try again in {max(1, retry // 60)} minute(s).",
                            headers={"Retry-After": str(retry)})
    user = (await db.execute(select(User).where(func.lower(User.username) == body.username.lower()))).scalar_one_or_none()
    ok = verify_password(user.password_hash if user else _DUMMY_HASH, body.password)
    if not user or not ok or not user.is_active:
        login_limiter.hit(key_ip)
        login_limiter.hit(key_user)
        if user and ok and not user.is_active:
            raise HTTPException(403, "This account is disabled. Contact the owner.")
        raise HTTPException(401, "Wrong username or password.")
    login_limiter.reset(key_user)
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    await create_session(db, user, request, response)
    return {"user": user_public(user)}


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    await destroy_session(db, request.cookies.get(COOKIE_NAME), response)
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {"user": user_public(user)}


@router.patch("/me")
async def update_me(body: ProfileIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.memory_enabled is not None:
        user.memory_enabled = body.memory_enabled
    if body.prefs is not None:
        user.prefs = {**(user.prefs or {}), **body.prefs}
    await db.commit()
    return {"user": user_public(user)}


@router.post("/password")
async def change_password(body: PasswordIn, sess=Depends(current_session), db: AsyncSession = Depends(get_db)):
    user, session = sess
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(403, "The current password is wrong.")
    if err := validate_password(body.new_password):
        raise HTTPException(422, err)
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    await destroy_all_sessions(db, user.id, except_id=session.id)
    return {"ok": True}


@router.get("/sessions")
async def list_sessions(sess=Depends(current_session), db: AsyncSession = Depends(get_db)):
    user, session = sess
    rows = (await db.execute(select(UserSession).where(UserSession.user_id == user.id)
                             .order_by(UserSession.last_used_at.desc()))).scalars().all()
    return {"sessions": [{"id": r.id, "user_agent": r.user_agent, "ip": r.ip, "current": r.id == session.id,
                          "last_used_at": r.last_used_at.isoformat() + "Z", "created_at": r.created_at.isoformat() + "Z"}
                         for r in rows]}


@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, sess=Depends(current_session), db: AsyncSession = Depends(get_db)):
    user, _ = sess
    await db.execute(delete(UserSession).where(UserSession.id == session_id, UserSession.user_id == user.id))
    await db.commit()
    return {"ok": True}


@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    data = await file.read(5 * 2**20 + 1)
    if len(data) > 5 * 2**20:
        raise HTTPException(413, "Avatar must be smaller than 5 MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(415, "Please upload a PNG, JPG or WEBP image.") from e
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2)).resize((256, 256))
    path = user_dir(user.id) / "avatar.webp"
    img.save(path, "WEBP", quality=88)
    user.avatar_path = to_relative(path)
    await db.commit()
    return {"user": user_public(user)}


@router.get("/avatar/{user_id}")
async def get_avatar(user_id: str, _: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, user_id)
    if not u or not u.avatar_path:
        raise HTTPException(404, "No avatar")
    return FileResponse(resolve_storage_path(u.avatar_path), media_type="image/webp",
                        headers={"Cache-Control": "private, max-age=300"})


@router.post("/delete-data")
async def delete_my_data(body: DeleteDataIn, request: Request, response: Response,
                         user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Deletes all personal data (chats, files, media, projects, memories); optionally the account."""
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(403, "Wrong password.")
    if body.delete_account and user.role == "owner":
        raise HTTPException(400, "The owner account can't delete itself. Transfer ownership first.")
    for model in (Chat, Attachment, MediaItem, Project, Memory, Job):
        await db.execute(delete(model).where(model.user_id == user.id))
    await db.commit()
    shutil.rmtree(settings.uploads_dir / user.id, ignore_errors=True)
    user.avatar_path = None
    if body.delete_account:
        await db.delete(user)
        await db.commit()
        response.delete_cookie(COOKIE_NAME, path="/")
        log.info("User deleted their account")
        return {"ok": True, "account_deleted": True}
    await db.commit()
    log.info("User deleted their personal data")
    return {"ok": True, "account_deleted": False}

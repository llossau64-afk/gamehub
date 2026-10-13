from __future__ import annotations

from datetime import timedelta

from fastapi import Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.tokens import hash_token, new_token
from core.config import settings
from core.time import utcnow
from models import User, UserSession

COOKIE_NAME = "velqin_session"


def client_ip(request: Request) -> str:
    if settings.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def is_https(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if settings.trust_proxy_headers and request.headers.get("x-forwarded-proto", "").lower() == "https":
        return True
    return False


def _cookie_secure(request: Request) -> bool:
    mode = settings.cookie_secure.lower()
    if mode in ("true", "1", "yes"):
        return True
    if mode in ("false", "0", "no"):
        return False
    return is_https(request)


async def create_session(db: AsyncSession, user: User, request: Request, response: Response) -> None:
    token = new_token()
    now = utcnow()
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(token),
            user_agent=(request.headers.get("user-agent") or "")[:255],
            ip=client_ip(request)[:64],
            created_at=now,
            last_used_at=now,
            expires_at=now + timedelta(days=settings.session_days),
        )
    )
    user.last_seen_at = now
    await db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=_cookie_secure(request),
        samesite="lax",
        path="/",
    )


async def resolve_session(db: AsyncSession, token: str | None) -> tuple[User, UserSession] | None:
    if not token or len(token) > 200:
        return None
    row = (
        await db.execute(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    ).scalar_one_or_none()
    if row is None:
        return None
    now = utcnow()
    if row.expires_at < now:
        await db.delete(row)
        await db.commit()
        return None
    user = await db.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    # Throttle writes: update "last used" at most once per minute.
    if (now - row.last_used_at).total_seconds() > 60:
        row.last_used_at = now
        user.last_seen_at = now
        await db.commit()
    return user, row


async def destroy_session(db: AsyncSession, token: str | None, response: Response) -> None:
    if token:
        await db.execute(delete(UserSession).where(UserSession.token_hash == hash_token(token)))
        await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


async def destroy_all_sessions(db: AsyncSession, user_id: str, except_id: str | None = None) -> None:
    stmt = delete(UserSession).where(UserSession.user_id == user_id)
    if except_id:
        stmt = stmt.where(UserSession.id != except_id)
    await db.execute(stmt)
    await db.commit()

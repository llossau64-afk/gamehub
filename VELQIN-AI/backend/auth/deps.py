"""FastAPI dependencies for authentication and authorization."""
from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.sessions import COOKIE_NAME, resolve_session
from database.db import get_db
from models import User, UserSession
from services import plans


async def current_session(request: Request, db: AsyncSession = Depends(get_db)) -> tuple[User, UserSession]:
    resolved = await resolve_session(db, request.cookies.get(COOKIE_NAME))
    if resolved is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in.")
    request.state.user_id = resolved[0].id
    return resolved


async def current_user(sess: tuple[User, UserSession] = Depends(current_session)) -> User:
    return sess[0]


async def require_admin(user: User = Depends(current_user)) -> User:
    if user.role not in ("owner", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator rights required.")
    return user


async def require_owner(user: User = Depends(current_user)) -> User:
    if user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can do this.")
    return user


def require_feature(feature: str) -> Callable:
    async def _dep(user: User = Depends(current_user)) -> User:
        if not plans.has_feature(user, feature):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Your access group does not include this feature ({feature}). Ask the owner to change your plan.",
            )
        return user

    return _dep

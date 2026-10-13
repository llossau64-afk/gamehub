from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.deps import current_user
from database.db import get_db
from models import Memory, User

router = APIRouter(prefix="/api/memory", tags=["memory"])


class MemoryIn(BaseModel):
    content: str = Field(min_length=1, max_length=500)


@router.get("")
async def list_memory(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Memory).where(Memory.user_id == user.id).order_by(Memory.created_at.desc()))).scalars().all()
    return {"enabled": user.memory_enabled,
            "memories": [{"id": m.id, "content": m.content, "created_at": m.created_at.isoformat() + "Z"} for m in rows]}


@router.post("")
async def add_memory(body: MemoryIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    count = len((await db.execute(select(Memory.id).where(Memory.user_id == user.id))).all())
    if count >= 200:
        raise HTTPException(400, "Memory is full (200 entries). Delete some first.")
    m = Memory(user_id=user.id, content=body.content.strip())
    db.add(m)
    await db.commit()
    return {"memory": {"id": m.id, "content": m.content, "created_at": m.created_at.isoformat() + "Z"}}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Memory).where(Memory.id == memory_id, Memory.user_id == user.id))
    await db.commit()
    return {"ok": True}


@router.delete("")
async def clear_memory(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Memory).where(Memory.user_id == user.id))
    await db.commit()
    return {"ok": True}

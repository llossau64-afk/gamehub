from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.sse import sse_event, sse_response
from auth.deps import current_user
from database.db import get_db
from jobs.events import job_events
from jobs.queue import job_public, queue
from models import Job, User
from security.moderation import check_prompt

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


async def _own(db: AsyncSession, job_id: str, user: User) -> Job:
    j = await db.get(Job, job_id)
    if j is None or j.user_id != user.id:
        raise HTTPException(404, "Job not found.")
    return j


@router.get("")
async def list_jobs(kind: str | None = None, active: bool = False, limit: int = Query(default=50, le=200),
                    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(Job).where(Job.user_id == user.id)
    if kind:
        stmt = stmt.where(Job.kind == kind)
    if active:
        stmt = stmt.where(Job.status.in_(("queued", "running")))
    rows = (await db.execute(stmt.order_by(Job.created_at.desc()).limit(limit))).scalars().all()
    positions = await queue.positions(db)
    total_queued = len(positions)
    return {"jobs": [job_public(j, positions.get(j.id)) for j in rows], "queue_length": total_queued,
            "gpu_busy": bool(queue.running)}


@router.get("/events")
async def job_stream(request: Request, user: User = Depends(current_user)):
    q = job_events.subscribe(user.id)

    async def stream():
        try:
            yield sse_event({"type": "hello"})
            while True:
                if await request.is_disconnected():
                    break
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield sse_event(ev)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            job_events.unsubscribe(user.id, q)

    return sse_response(stream())


@router.get("/{job_id}")
async def get_job(job_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    j = await _own(db, job_id, user)
    return {"job": job_public(j, (await queue.positions(db)).get(j.id))}


@router.get("/{job_id}/preview")
async def job_preview(job_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await _own(db, job_id, user)
    ctx = queue.running.get(job_id)
    if ctx is None or not ctx.preview:
        raise HTTPException(404, "No preview available.")
    mime = "image/png" if ctx.preview[:4] == b"\x89PNG" else "image/jpeg"
    return Response(ctx.preview, media_type=mime, headers={"Cache-Control": "no-store"})


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    j = await _own(db, job_id, user)
    if j.status not in ("queued", "running"):
        return {"job": job_public(j)}
    await queue.cancel(db, j)
    return {"job": job_public(j)}


@router.post("/{job_id}/retry")
async def retry_job(job_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    j = await _own(db, job_id, user)
    if j.status not in ("failed", "cancelled", "done"):
        raise HTTPException(409, "Only finished, failed or cancelled jobs can be retried.")
    if reason := check_prompt(str((j.params or {}).get("prompt", ""))):
        raise HTTPException(400, reason)
    new = await queue.submit(db, user.id, j.kind, dict(j.params or {}), project_id=j.project_id, retry_of=j.id)
    return {"job": job_public(new, (await queue.positions(db)).get(new.id))}


@router.delete("/{job_id}")
async def delete_job(job_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    j = await _own(db, job_id, user)
    if j.status in ("queued", "running"):
        raise HTTPException(409, "Cancel the job first.")
    await db.delete(j)
    await db.commit()
    return {"ok": True}

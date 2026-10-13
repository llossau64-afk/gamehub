"""Persistent, fair GPU job queue.

* Jobs are stored in the database — a restart re-queues interrupted jobs instead of dropping them.
* One GPU worker: a single image/video job runs at a time (8 GB VRAM can't do more reliably).
* Scheduling: lower priority value first (images before long videos), then round-robin between users
  (the user who was served least recently goes first), then FIFO.
* Timeouts, cancellation, and one automatic retry after a GPU out-of-memory error.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.time import utcnow
from database.db import SessionLocal
from gpu_manager.manager import gpu
from jobs.events import job_events
from models import Job
from services import comfyui, system_settings

log = logging.getLogger("velqin.jobs")

PRIORITY = {"image": 10, "upscale": 10, "video": 50}


class JobContext:
    def __init__(self, queue: "JobQueue", job: Job) -> None:
        self.queue = queue
        self.job = job
        self.cancelled = False
        self.preview: bytes | None = None
        self._last_write = 0.0

    async def progress(self, value: float, step: str, force: bool = False) -> None:
        value = max(0.0, min(1.0, value))
        self.job.progress = value
        self.job.step = step[:200]
        job_events.publish(self.job.user_id, {"type": "job", "job": job_public(self.job)})
        now = time.monotonic()
        if force or now - self._last_write > 2.0:
            self._last_write = now
            async with SessionLocal() as db:
                await db.execute(update(Job).where(Job.id == self.job.id).values(progress=value, step=self.job.step))
                await db.commit()

    async def set_preview(self, data: bytes) -> None:
        self.preview = data
        job_events.publish(self.job.user_id, {"type": "preview", "job_id": self.job.id, "t": time.time()})

    def should_cancel(self) -> bool:
        return self.cancelled


Handler = Callable[[JobContext], Awaitable[dict]]


def job_public(j: Job, position: int | None = None) -> dict:
    return {
        "id": j.id, "kind": j.kind, "status": j.status, "progress": round(j.progress or 0, 4), "step": j.step,
        "params": {k: v for k, v in (j.params or {}).items() if not k.startswith("_")},
        "result": j.result or {}, "error": j.error, "attempts": j.attempts, "retry_of": j.retry_of,
        "position": position, "project_id": j.project_id,
        "created_at": j.created_at.isoformat() + "Z" if j.created_at else None,
        "started_at": j.started_at.isoformat() + "Z" if j.started_at else None,
        "finished_at": j.finished_at.isoformat() + "Z" if j.finished_at else None,
    }


class JobQueue:
    def __init__(self) -> None:
        self.handlers: dict[str, Handler] = {}
        self._wake = asyncio.Event()
        self._task: asyncio.Task | None = None
        self.running: dict[str, JobContext] = {}
        self._last_served: dict[str, float] = {}
        self._stopping = False

    def register(self, kind: str, handler: Handler) -> None:
        self.handlers[kind] = handler

    async def start(self) -> None:
        async with SessionLocal() as db:
            # Recover jobs interrupted by a restart — re-queue them (once), never silently drop them.
            rows = (await db.execute(select(Job).where(Job.status == "running"))).scalars().all()
            for j in rows:
                if j.attempts < 2:
                    j.status, j.step, j.progress = "queued", "Re-queued after server restart", 0.0
                else:
                    j.status, j.error, j.finished_at = "failed", "Interrupted by a server restart.", utcnow()
            await db.commit()
        self._task = asyncio.create_task(self._worker(), name="gpu-worker")

    async def stop(self) -> None:
        self._stopping = True
        for ctx in self.running.values():
            ctx.cancelled = True
        self._wake.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    def wake(self) -> None:
        self._wake.set()

    async def submit(self, db: AsyncSession, user_id: str, kind: str, params: dict, project_id: str | None = None,
                     retry_of: str | None = None) -> Job:
        job = Job(user_id=user_id, kind=kind, params=params, priority=PRIORITY.get(kind, 50),
                  project_id=project_id, retry_of=retry_of, step="Waiting in queue")
        db.add(job)
        await db.commit()
        job_events.publish(user_id, {"type": "job", "job": job_public(job)})
        self.wake()
        return job

    async def queued_count(self, db: AsyncSession, user_id: str) -> int:
        return len((await db.execute(select(Job.id).where(Job.user_id == user_id, Job.status.in_(("queued", "running"))))).all())

    async def positions(self, db: AsyncSession) -> dict[str, int]:
        """Estimated queue position for every queued job (1 = next)."""
        queued = (await db.execute(select(Job).where(Job.status == "queued"))).scalars().all()
        order = self._order(list(queued))
        return {j.id: i + 1 for i, j in enumerate(order)}

    def _order(self, queued: list[Job]) -> list[Job]:
        # simulate the fair scheduler to compute an ordering
        served = dict(self._last_served)
        remaining = sorted(queued, key=lambda j: j.created_at)
        out: list[Job] = []
        t = time.time()
        while remaining:
            best = min(remaining, key=lambda j: (j.priority, served.get(j.user_id, 0.0), j.created_at))
            out.append(best)
            remaining.remove(best)
            t += 1
            served[best.user_id] = t
        return out

    async def cancel(self, db: AsyncSession, job: Job) -> None:
        if job.status == "queued":
            job.status, job.finished_at, job.step = "cancelled", utcnow(), "Cancelled"
            await db.commit()
            job_events.publish(job.user_id, {"type": "job", "job": job_public(job)})
        elif job.status == "running":
            ctx = self.running.get(job.id)
            if ctx:
                ctx.cancelled = True
                await comfyui.interrupt()

    async def _next_job(self) -> Job | None:
        async with SessionLocal() as db:
            queued = (await db.execute(select(Job).where(Job.status == "queued"))).scalars().all()
            if not queued:
                return None
            job = self._order(list(queued))[0]
            job.status, job.started_at, job.step, job.progress = "running", utcnow(), "Starting", 0.0
            job.attempts += 1
            await db.commit()
            return job

    async def _worker(self) -> None:
        while not self._stopping:
            try:
                job = await self._next_job()
            except Exception:  # noqa: BLE001
                log.exception("Queue error")
                job = None
            if job is None:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
                continue
            self._last_served[job.user_id] = time.time()
            await self._execute(job)

    async def _execute(self, job: Job) -> None:
        ctx = JobContext(self, job)
        self.running[job.id] = ctx
        handler = self.handlers.get(job.kind)
        timeout = system_settings.get("video_job_timeout_s" if job.kind == "video" else "image_job_timeout_s")
        status, error, result = "done", None, {}
        job_events.publish(job.user_id, {"type": "job", "job": job_public(job)})
        try:
            if handler is None:
                raise RuntimeError(f"No handler for job kind {job.kind}")
            async with gpu.heavy(job.id, job.kind):
                result = await asyncio.wait_for(handler(ctx), timeout=timeout)
        except asyncio.CancelledError:
            if self._stopping:
                status, error = "queued", None  # server shutdown — job is re-queued on next start
            else:
                status, error = "cancelled", None
        except asyncio.TimeoutError:
            await comfyui.interrupt()
            status, error = "failed", f"Timed out after {timeout // 60} minutes."
        except comfyui.ComfyOOM:
            gpu.note_oom()
            await comfyui.free_memory(unload_models=True)
            if job.attempts < 2 and not ctx.cancelled:
                status, error = "queued", None
                job.step = "Out of GPU memory — VRAM freed, retrying automatically"
                log.warning("Job %s ran out of VRAM; retrying once", job.id)
            else:
                status, error = "failed", ("The GPU ran out of memory. Try a smaller format, the fast quality mode "
                                           "or a shorter video.")
        except comfyui.ComfyUnavailable as e:
            status, error = "failed", str(e)
        except comfyui.ComfyError as e:
            status, error = "failed", str(e)
        except ValueError as e:
            status, error = "failed", str(e)
        except Exception as e:  # noqa: BLE001
            log.exception("Job %s crashed", job.id)
            status, error = "failed", f"Unexpected error: {type(e).__name__}"
        finally:
            self.running.pop(job.id, None)
        if ctx.cancelled and status not in ("done",):
            status, error = "cancelled", None

        async with SessionLocal() as db:
            row = await db.get(Job, job.id)
            if row is not None:
                row.status = status
                row.error = error
                row.result = result or row.result or {}
                if status == "done":
                    row.progress, row.step = 1.0, "Finished"
                elif status == "queued":
                    row.step = job.step if job.step.startswith("Out of GPU") else "Re-queued"
                    row.progress = 0.0
                elif status == "cancelled":
                    row.step = "Cancelled"
                else:
                    row.step = "Failed"
                if status != "queued":
                    row.finished_at = utcnow()
                await db.commit()
                job_events.publish(row.user_id, {"type": "job", "job": job_public(row)})
        if status == "queued":
            self.wake()


queue = JobQueue()

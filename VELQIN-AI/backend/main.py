"""VELQIN AI — FastAPI application entry point.

Run (from the backend folder):  python -m uvicorn main:app --host 0.0.0.0 --port 8080
Or simply use start-velqin.bat / scripts/start-velqin.sh in the project root.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select, update

from core.config import settings
from core.logging import setup_logging

setup_logging()
log = logging.getLogger("velqin")

from api import admin, ai_models, auth as auth_api, chats, files, jobs, media, memory, projects, search, studio, system, voice  # noqa: E402
from auth.passwords import hash_password  # noqa: E402
from database.db import SessionLocal, init_db  # noqa: E402
from jobs.queue import queue  # noqa: E402
from models import Message, User  # noqa: E402
from security.middleware import CSRFMiddleware, SecurityHeadersMiddleware  # noqa: E402
from services import health, model_registry, system_settings  # noqa: E402
from services.chat_engine import manager as chat_manager  # noqa: E402
from services.image_studio import run_image_job  # noqa: E402
from services.video_studio import run_video_job  # noqa: E402

VERSION = "1.0.0"


async def _bootstrap() -> None:
    await init_db()
    async with SessionLocal() as db:
        await system_settings.load_settings(db)
        await model_registry.seed_profiles(db)
        # Answers that were streaming when the server stopped keep their partial text.
        await db.execute(update(Message).where(Message.status == "streaming").values(status="interrupted"))
        await db.commit()
        if settings.owner_username and settings.owner_password:
            exists = (await db.execute(select(User).where(User.role == "owner"))).scalar_one_or_none()
            if exists is None:
                db.add(User(username=settings.owner_username, display_name=settings.owner_username,
                            password_hash=hash_password(settings.owner_password), role="owner", plan="owner"))
                await db.commit()
                log.info("Owner account created from environment variables")


async def _maintenance() -> None:
    while True:
        await asyncio.sleep(60)
        chat_manager.cleanup()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _bootstrap()
    queue.register("image", run_image_job)
    queue.register("video", run_video_job)
    await queue.start()
    tasks = [asyncio.create_task(health.loop(), name="health"), asyncio.create_task(_maintenance(), name="maintenance")]
    log.info("VELQIN AI %s started — data dir: %s", VERSION, settings.data_dir)
    yield
    for t in tasks:
        t.cancel()
    await chat_manager.shutdown()
    await queue.stop()


app = FastAPI(title="VELQIN AI", version=VERSION, lifespan=lifespan,
              docs_url="/api/docs" if settings.is_dev else None, redoc_url=None,
              openapi_url="/api/openapi.json" if settings.is_dev else None)

app.add_middleware(CSRFMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
if settings.is_dev:
    app.add_middleware(CORSMiddleware, allow_origins=settings.dev_origins.split(","), allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

for r in (system.router, auth_api.router, chats.router, ai_models.router, files.router, projects.router,
          memory.router, search.router, studio.router, jobs.router, media.router, admin.router, voice.router):
    app.include_router(r)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = [f"{'.'.join(str(p) for p in e.get('loc', [])[1:])}: {e.get('msg')}" for e in exc.errors()[:5]]
    return JSONResponse({"detail": "Invalid input — " + "; ".join(errors)}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Internal server error. Details are in the server log."}, status_code=500)


# ---- frontend (static export of the Next.js app) ------------------------------------------
DIST = Path(settings.frontend_dist)


@app.get("/{full_path:path}", include_in_schema=False)
async def frontend(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(404, "Not found")
    if not DIST.exists():
        return JSONResponse({"detail": "Frontend not built. Run scripts/build-frontend or start-velqin.bat."}, status_code=503)
    base = DIST.resolve()
    candidates = [full_path, f"{full_path}/index.html", f"{full_path}.html"] if full_path else ["index.html"]
    for c in candidates:
        p = (base / c).resolve()
        if p.is_file() and p.is_relative_to(base):
            headers = {}
            if "/_next/static/" in f"/{c}":
                headers["Cache-Control"] = "public, max-age=31536000, immutable"
            elif p.name in ("sw.js",) or p.suffix == ".html":
                headers["Cache-Control"] = "no-cache"
            return FileResponse(p, headers=headers)
    not_found = base / "404.html"
    if not_found.exists():
        return FileResponse(not_found, status_code=404)
    raise HTTPException(404, "Not found")

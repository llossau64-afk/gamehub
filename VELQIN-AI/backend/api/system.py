from __future__ import annotations

import time

from fastapi import APIRouter, Depends

from auth.deps import current_user
from gpu_manager.manager import gpu
from models import User
from services import health, plans

router = APIRouter(prefix="/api", tags=["system"])
STARTED = time.time()


@router.get("/health")
async def public_health():
    """Unauthenticated liveness probe — reveals nothing but 'ok'."""
    return {"status": "ok"}


@router.get("/system/status")
async def status(user: User = Depends(current_user)):
    st = health.state if health.state["checked_at"] else await health.check_all()
    stats = gpu.system_stats()
    return {
        "services": {k: {"online": v["online"], "purpose": v["purpose"]} for k, v in st["services"].items()},
        "gpu_busy": stats["gpu_busy"],
        "gpu_job_kind": (stats["gpu_lease"] or {}).get("kind"),
        "uptime_s": int(time.time() - STARTED),
    }


@router.get("/plans")
async def list_plans(user: User = Depends(current_user)):
    from services import system_settings

    return {"enabled": bool(system_settings.get("plans_enabled")), "current": plans.effective_plan(user),
            "plans": [{"id": k, **v} for k, v in plans.PLANS.items()]}

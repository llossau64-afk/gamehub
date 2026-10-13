"""Periodic health checks of all local services (cached, so pages load fast)."""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import time

from services import comfyui, ffmpeg, ollama, web_search

log = logging.getLogger("velqin.health")

state: dict = {"checked_at": 0.0, "services": {}}


async def check_all() -> dict:
    ov, cs, sx = await asyncio.gather(ollama.version(), comfyui.system_stats(), web_search.searxng_available())
    services = {
        "ollama": {"online": ov is not None, "version": ov, "purpose": "Chat models"},
        "comfyui": {"online": cs is not None,
                    "version": (cs or {}).get("system", {}).get("comfyui_version"),
                    "devices": [d.get("name") for d in (cs or {}).get("devices", [])],
                    "purpose": "Image & video generation"},
        "searxng": {"online": sx, "purpose": "Web search"},
        "ffmpeg": {"online": ffmpeg.available(), "purpose": "Video export"},
        "whisper": {"online": importlib.util.find_spec("faster_whisper") is not None, "purpose": "Voice input (optional)"},
    }
    prev = state.get("services", {})
    for name, s in services.items():
        if prev.get(name, {}).get("online") and not s["online"]:
            log.warning("Service went offline: %s", name)
        elif prev and not prev.get(name, {}).get("online") and s["online"]:
            log.info("Service is back online: %s", name)
    state.update(checked_at=time.time(), services=services)
    return state


async def loop() -> None:
    while True:
        try:
            await check_all()
        except Exception:  # noqa: BLE001
            log.exception("Health check failed")
        await asyncio.sleep(30)

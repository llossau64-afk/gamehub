"""Background downloads of Ollama models with progress tracking."""
from __future__ import annotations

import asyncio
import logging
import time

from services import model_registry, ollama

log = logging.getLogger("velqin.models")


class PullManager:
    def __init__(self) -> None:
        self.pulls: dict[str, dict] = {}

    def start(self, tag: str) -> dict:
        cur = self.pulls.get(tag)
        if cur and cur["state"] == "running":
            return cur
        state = {"tag": tag, "state": "running", "status": "starting", "completed": 0, "total": 0,
                 "percent": 0.0, "error": None, "started": time.time(), "finished": None}
        self.pulls[tag] = state
        asyncio.create_task(self._run(tag, state), name=f"pull-{tag}")
        return state

    async def _run(self, tag: str, state: dict) -> None:
        try:
            async for ev in ollama.pull(tag):
                state["status"] = ev.get("status", state["status"])
                if ev.get("total"):
                    state["total"] = ev["total"]
                    state["completed"] = ev.get("completed", 0)
                    state["percent"] = round(100 * state["completed"] / max(1, state["total"]), 1)
                if ev.get("status") == "success":
                    state["percent"] = 100.0
            state["state"] = "done"
            log.info("Model downloaded: %s", tag)
        except ollama.OllamaError as e:
            state["state"] = "error"
            state["error"] = str(e)
            log.warning("Model download failed (%s): %s", tag, e)
        except Exception as e:  # noqa: BLE001
            state["state"] = "error"
            state["error"] = "Unexpected error while downloading."
            log.exception("Model download crashed (%s): %s", tag, e)
        finally:
            state["finished"] = time.time()
            model_registry.invalidate_cache()

    def list(self) -> list[dict]:
        now = time.time()
        for tag, st in list(self.pulls.items()):
            if st["finished"] and now - st["finished"] > 3600:
                self.pulls.pop(tag, None)
        return list(self.pulls.values())


pulls = PullManager()

"""Per-user broadcast of job updates (consumed by the /api/jobs/events SSE endpoint)."""
from __future__ import annotations

import asyncio
from collections import defaultdict


class JobEvents:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._admin: set[asyncio.Queue] = set()

    def subscribe(self, user_id: str, admin: bool = False) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        (self._admin if admin else self._subs[user_id]).add(q)
        return q

    def unsubscribe(self, user_id: str, q: asyncio.Queue) -> None:
        self._subs[user_id].discard(q)
        self._admin.discard(q)

    def publish(self, user_id: str, event: dict) -> None:
        for q in list(self._subs.get(user_id, ())) + list(self._admin):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


job_events = JobEvents()

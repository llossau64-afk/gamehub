"""Small in-memory sliding-window rate limiter (single-process server)."""
from __future__ import annotations

import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_s: float) -> None:
        self.limit = limit
        self.window = window_s
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        return q

    def is_limited(self, key: str) -> bool:
        return len(self._prune(key, time.monotonic())) >= self.limit

    def hit(self, key: str) -> None:
        now = time.monotonic()
        self._prune(key, now).append(now)

    def retry_after(self, key: str) -> int:
        q = self._prune(key, time.monotonic())
        if not q:
            return 0
        return max(1, int(self.window - (time.monotonic() - q[0])))

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

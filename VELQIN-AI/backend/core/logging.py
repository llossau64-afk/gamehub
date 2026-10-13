"""Logging setup. Never log chat contents, prompts or file contents — only metadata."""
from __future__ import annotations

import logging
import logging.handlers
import sys

from core.config import settings


class _MemoryErrorHandler(logging.Handler):
    """Keeps the most recent warnings/errors in memory for the admin dashboard."""

    def __init__(self, capacity: int = 300) -> None:
        super().__init__(level=logging.WARNING)
        self.capacity = capacity
        self.records: list[dict] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.records.append(
                {
                    "time": record.created,
                    "level": record.levelname,
                    "logger": record.name,
                    "message": self.format(record)[:2000],
                }
            )
            if len(self.records) > self.capacity:
                del self.records[: len(self.records) - self.capacity]
        except Exception:  # pragma: no cover - logging must never raise
            pass


memory_errors = _MemoryErrorHandler()


def setup_logging() -> None:
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())
    for h in list(root.handlers):
        root.removeHandler(h)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root.addHandler(console)

    file_handler = logging.handlers.RotatingFileHandler(
        settings.logs_dir / "velqin.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    memory_errors.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(memory_errors)

    # Access logs contain URLs only (no bodies). Keep them quieter.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

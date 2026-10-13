"""Backups: consistent SQLite snapshot (+ optionally all user files) into a zip archive.
Restore with scripts/restore-backup.py while the server is stopped."""
from __future__ import annotations

import asyncio
import json
import sqlite3
import time
import zipfile
from datetime import datetime
from pathlib import Path

from core.config import settings


def _db_file() -> Path | None:
    url = settings.db_url
    if not url.startswith("sqlite"):
        return None
    return Path(url.split("///", 1)[1])


def _create(include_files: bool) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out = settings.backups_dir / f"velqin-backup-{stamp}{'-full' if include_files else ''}.zip"
    tmp_db = settings.tmp_dir / f"backup-{stamp}.db"
    db_file = _db_file()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        if db_file and db_file.exists():
            src = sqlite3.connect(str(db_file))
            dst = sqlite3.connect(str(tmp_db))
            with dst:
                src.backup(dst)
            src.close()
            dst.close()
            z.write(tmp_db, "velqin.db")
            tmp_db.unlink(missing_ok=True)
        if include_files and settings.uploads_dir.exists():
            for f in settings.uploads_dir.rglob("*"):
                if f.is_file() and "tmp" not in f.relative_to(settings.uploads_dir).parts:
                    z.write(f, f"users/{f.relative_to(settings.uploads_dir).as_posix()}")
        z.writestr("manifest.json", json.dumps({"created": time.time(), "include_files": include_files,
                                                "format": 1, "app": "VELQIN AI"}))
    return out


async def create_backup(include_files: bool) -> Path:
    return await asyncio.to_thread(_create, include_files)


def list_backups() -> list[dict]:
    out = []
    for f in sorted(settings.backups_dir.glob("velqin-backup-*.zip"), reverse=True):
        st = f.stat()
        out.append({"name": f.name, "size": st.st_size, "created": st.st_mtime})
    return out


def backup_path(name: str) -> Path | None:
    if "/" in name or "\\" in name or not name.startswith("velqin-backup-") or not name.endswith(".zip"):
        return None
    p = settings.backups_dir / name
    return p if p.exists() else None

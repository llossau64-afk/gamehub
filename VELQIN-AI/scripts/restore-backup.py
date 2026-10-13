#!/usr/bin/env python3
"""Restore a VELQIN backup. STOP VELQIN FIRST (close start-velqin.bat).

  python scripts/restore-backup.py storage/backups/velqin-backup-20261013-120000.zip
The current database is kept as velqin.db.before-restore-<time>.
"""
import shutil
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from core.config import settings  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    archive = Path(sys.argv[1])
    if not archive.exists():
        print(f"Not found: {archive}")
        return 1
    data = settings.data_dir
    db = data / "velqin.db"
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if "velqin.db" not in names:
            print("This is not a VELQIN backup (velqin.db missing).")
            return 1
        if input(f"Restore {archive.name} into {data}? Type YES: ").strip() != "YES":
            return 1
        if db.exists():
            shutil.copy2(db, db.with_name(f"velqin.db.before-restore-{time.strftime('%Y%m%d-%H%M%S')}"))
        for suffix in ("-wal", "-shm"):
            Path(str(db) + suffix).unlink(missing_ok=True)
        z.extract("velqin.db", data)
        restored_files = 0
        for n in names:
            if n.startswith("users/") and not n.endswith("/"):
                target = (data / n).resolve()
                if not target.is_relative_to(data.resolve()):
                    continue  # never write outside the data dir
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(n) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                restored_files += 1
    print(f"Restored database{f' and {restored_files} files' if restored_files else ''}. Start VELQIN again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

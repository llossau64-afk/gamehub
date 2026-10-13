#!/usr/bin/env python3
"""Download ComfyUI model files for VELQIN (resumable).

Usage:
  python scripts/download_models.py --comfyui ai/comfyui/ComfyUI image upscale
  python scripts/download_models.py --comfyui ai/comfyui/ComfyUI video
  python scripts/download_models.py --list
Groups: image (SDXL + Lightning), flux (FLUX.1-schnell GGUF), upscale (Real-ESRGAN), video (Wan 2.2 5B)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "ai" / "comfyui" / "models.json"


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def download(url: str, dest: Path) -> None:
    part = dest.with_suffix(dest.suffix + ".part")
    have = part.stat().st_size if part.exists() else 0
    req = urllib.request.Request(url, headers={"User-Agent": "VELQIN-model-downloader/1.0"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req, timeout=60) as resp:
        status = resp.status
        total = int(resp.headers.get("Content-Length", 0)) + (have if status == 206 else 0)
        if status == 200 and have:
            have = 0  # server ignored the range: restart
        mode = "ab" if have else "wb"
        start = time.time()
        done = have
        with part.open(mode) as fh:
            while chunk := resp.read(1024 * 1024):
                fh.write(chunk)
                done += len(chunk)
                speed = (done - have) / max(1e-3, time.time() - start)
                pct = f"{100 * done / total:5.1f}%" if total else ""
                print(f"\r    {pct} {human(done)} / {human(total)}  {human(speed)}/s   ", end="", flush=True)
    print()
    part.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("groups", nargs="*", help="image flux upscale video")
    ap.add_argument("--comfyui", default=str(ROOT / "ai" / "comfyui" / "ComfyUI"), help="ComfyUI folder")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))["groups"]
    if args.list or not args.groups:
        for name, g in manifest.items():
            size = sum(f["size_gb"] for f in g["files"])
            print(f"  {name:8s} ~{size:5.1f} GB  {g['description']}")
        return 0
    comfy = Path(args.comfyui)
    if not (comfy / "main.py").exists():
        print(f"ComfyUI not found at {comfy}. Run scripts/install-comfyui first or pass --comfyui.")
        return 1
    needed = sum(f["size_gb"] for g in args.groups for f in manifest[g]["files"])
    free = shutil.disk_usage(comfy).free / 2**30
    print(f"Download size up to ~{needed:.1f} GB, free disk space {free:.1f} GB")
    if free < needed + 2:
        print("Not enough disk space.")
        return 1
    failed = 0
    for g in args.groups:
        if g not in manifest:
            print(f"Unknown group {g}")
            return 1
        print(f"== {g}: {manifest[g]['description']}")
        for f in manifest[g]["files"]:
            dest = comfy / "models" / f["folder"] / f["name"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and dest.stat().st_size > 1024:
                print(f"  ✓ {f['name']} (already present)")
                continue
            print(f"  ↓ {f['name']} → models/{f['folder']}  (~{f['size_gb']} GB, {f['license']})")
            for attempt in range(1, 6):
                try:
                    download(f["url"], dest)
                    break
                except Exception as e:  # noqa: BLE001
                    print(f"\n    attempt {attempt} failed: {e}")
                    if "401" in str(e) or "403" in str(e):
                        print("    This file may require accepting the license on huggingface.co (log in, open the URL once).")
                        break
                    time.sleep(3 * attempt)
            if not dest.exists():
                failed += 1
    print("Done." if not failed else f"{failed} file(s) failed — run the command again to resume.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

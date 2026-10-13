"""FFmpeg helpers: probing, thumbnails, last-frame extraction, segment concatenation."""
from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path

from core.config import settings


def available() -> bool:
    return shutil.which(settings.ffmpeg_path) is not None and shutil.which(settings.ffprobe_path) is not None


async def _run(*args: str, timeout: float = 600) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("ffmpeg timed out") from None
    return proc.returncode or 0, (out or b"").decode(errors="replace") + (err or b"").decode(errors="replace")


async def probe(path: Path) -> dict:
    code, out = await _run(settings.ffprobe_path, "-v", "error", "-print_format", "json", "-show_format",
                           "-show_streams", str(path), timeout=60)
    if code != 0:
        raise RuntimeError("ffprobe failed")
    data = json.loads(out[out.find("{"):])
    v = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    fps = 0.0
    if v.get("avg_frame_rate") and "/" in v["avg_frame_rate"]:
        a, b = v["avg_frame_rate"].split("/")
        fps = float(a) / float(b) if float(b) else 0.0
    return {"width": int(v.get("width", 0)), "height": int(v.get("height", 0)),
            "duration": float(data.get("format", {}).get("duration", 0) or 0), "fps": round(fps, 2),
            "codec": v.get("codec_name")}


async def to_mp4(src: Path, dst: Path) -> None:
    """Normalize any video to H.264/yuv420p MP4 with faststart (plays on iPhone/Android/desktop)."""
    code, out = await _run(settings.ffmpeg_path, "-y", "-i", str(src), "-c:v", "libx264", "-pix_fmt", "yuv420p",
                           "-crf", "18", "-preset", "medium", "-movflags", "+faststart", "-an", str(dst))
    if code != 0:
        raise RuntimeError("Video encoding failed: " + out[-300:])


async def thumbnail(src: Path, dst: Path) -> None:
    code, out = await _run(settings.ffmpeg_path, "-y", "-i", str(src), "-vf", "thumbnail,scale=512:-2",
                           "-frames:v", "1", str(dst), timeout=120)
    if code != 0:
        raise RuntimeError("Thumbnail failed")


async def last_frame(src: Path, dst: Path) -> None:
    code, out = await _run(settings.ffmpeg_path, "-y", "-sseof", "-0.5", "-i", str(src), "-update", "1",
                           "-q:v", "1", str(dst), timeout=120)
    if code != 0 or not dst.exists():
        raise RuntimeError("Could not extract the last frame")


async def concat(segments: list[Path], dst: Path, fps: int, width: int, height: int) -> None:
    """Concatenate segments. Every segment after the first starts with the previous segment's last
    frame (it was used as the start image), so that duplicate frame is dropped."""
    args: list[str] = [settings.ffmpeg_path, "-y"]
    for s in segments:
        args += ["-i", str(s)]
    filters = []
    for i in range(len(segments)):
        trim = "trim=start_frame=1," if i > 0 else ""
        filters.append(f"[{i}:v]{trim}setpts=PTS-STARTPTS,fps={fps},scale={width}:{height}:flags=lanczos,"
                       f"setsar=1,format=yuv420p[v{i}]")
    filters.append("".join(f"[v{i}]" for i in range(len(segments))) + f"concat=n={len(segments)}:v=1:a=0[out]")
    args += ["-filter_complex", ";".join(filters), "-map", "[out]", "-c:v", "libx264", "-crf", "18",
             "-preset", "medium", "-movflags", "+faststart", str(dst)]
    code, out = await _run(*args, timeout=1800)
    if code != 0:
        raise RuntimeError("Joining video segments failed: " + out[-300:])

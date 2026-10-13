#!/usr/bin/env python3
"""VELQIN real-hardware self test. Proves that REAL local AI runs on this PC.

  .venv\\Scripts\\python.exe scripts\\selftest.py            (Windows)
  .venv/bin/python scripts/selftest.py --image --video      (Linux/WSL)

Checks: GPU, Ollama (real chat + tokens/s), embeddings, SearXNG, ComfyUI + model files,
and optionally generates a real image (--image) and a real short video clip (--video).
Results (image/video files + report) go to storage/selftest/.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from core.config import settings  # noqa: E402
from gpu_manager.manager import gpu  # noqa: E402
from services import comfyui, ffmpeg, ollama, web_search, workflows  # noqa: E402

OUT = settings.data_dir / "selftest"
report: list[tuple[str, str, str]] = []


def res(name: str, status: str, detail: str = "") -> None:
    report.append((name, status, detail))
    color = {"PASS": "\033[32m", "FAIL": "\033[31m", "SKIP": "\033[33m"}.get(status, "")
    print(f"  {color}{status}\033[0m  {name}" + (f" — {detail}" if detail else ""), flush=True)


async def check_gpu() -> None:
    gpus = gpu.gpu_stats()
    if gpus:
        g = gpus[0]
        res("NVIDIA GPU", "PASS", f"{g['name']}, {g['vram_total_mb'] / 1024:.1f} GB VRAM, {g['vram_used_mb']} MB used")
    else:
        res("NVIDIA GPU", "FAIL", "no GPU found via NVML/nvidia-smi — AI will run on the CPU")


async def check_ollama() -> str | None:
    v = await ollama.version()
    if not v:
        res("Ollama runtime", "FAIL", f"not reachable at {settings.ollama_url}")
        return None
    res("Ollama runtime", "PASS", f"version {v}")
    models = [m["name"] for m in await ollama.list_installed()]
    chat_models = [m for m in models if "embed" not in m]
    if not chat_models:
        res("Chat model", "FAIL", "no model installed — run: ollama pull qwen3:4b")
        return None
    model = next((m for m in chat_models if m.startswith("qwen3:4b")), chat_models[0])
    t0 = time.time()
    text, stats = "", {}
    think = False if model.startswith("qwen3") else None
    async for chunk in ollama.chat_stream(model, [{"role": "user", "content": "Reply with one short sentence: what is 17 * 23?"}],
                                          options={"num_ctx": 4096}, think=think):
        text += chunk.get("message", {}).get("content", "")
        if chunk.get("done"):
            stats = chunk
    dt = time.time() - t0
    tps = stats.get("eval_count", 0) / max(1e-9, stats.get("eval_duration", 1) / 1e9)
    res("Real chat inference", "PASS", f"{model}: “{text.strip()[:120]}” · {tps:.1f} tok/s · {dt:.1f}s total"
        + ("" if "391" in text else " (answer did not contain 391 — model quality, not a system error)"))
    running = await ollama.list_running()
    for r in running:
        vram = r.get("size_vram", 0) / 2**30
        res("Model placement", "PASS" if vram > 0 else "FAIL", f"{r.get('name')}: {vram:.1f} GB in VRAM" + ("" if vram > 0 else " — running on CPU!"))
    embeds = [m for m in models if "embed" in m]
    if embeds:
        vec = await ollama.embed(embeds[0], ["VELQIN self test"])
        res("Embeddings", "PASS", f"{embeds[0]}: dimension {len(vec[0])}")
    else:
        res("Embeddings", "SKIP", "no embedding model (ollama pull nomic-embed-text) — projects use keyword search")
    return model


async def check_search() -> None:
    if not await web_search.searxng_available():
        res("SearXNG web search", "SKIP", f"not reachable at {settings.searxng_url} (docker compose up -d searxng)")
        return
    try:
        sources = await web_search.search("Bundesliga Ergebnisse heute")
        await web_search.enrich(sources, pages=2)
        fetched = sum(1 for s in sources if s.fetched)
        res("SearXNG web search", "PASS" if sources else "FAIL", f"{len(sources)} results, {fetched} pages read, e.g. {sources[0].url if sources else '-'}")
    except web_search.SearchUnavailable as e:
        res("SearXNG web search", "FAIL", str(e))


async def check_comfy() -> dict | None:
    stats = await comfyui.system_stats()
    if not stats:
        res("ComfyUI", "SKIP", f"not reachable at {settings.comfyui_url} (scripts\\start-comfyui.bat)")
        return None
    dev = ", ".join(d.get("name", "?") for d in stats.get("devices", []))
    res("ComfyUI", "PASS", f"version {stats.get('system', {}).get('comfyui_version', '?')} · {dev}")
    info = await comfyui.object_info(force=True)
    for p in workflows.availability(info):
        res(f"Preset {p['id']}", "PASS" if p["available"] else "SKIP", p["name"] if p["available"] else "missing: " + ", ".join(p["missing"]))
    return info


async def gen_image(info: dict) -> None:
    preset = workflows.ALL_PRESETS["sdxl"]
    ok, missing, files = workflows.check_preset(preset, info)
    if not ok:
        res("Real image generation", "SKIP", "SDXL files missing: " + ", ".join(missing))
        return
    await ollama.unload_all()
    g = workflows.build_image("sdxl", files, mode="t2i", prompt="a futuristic silver sports car in a rainy neon city at night, cinematic",
                              negative="", width=1024, height=1024, seed=random.randint(0, 2**32), quality="fast")
    t0 = time.time()

    async def prog(node_frac, sampler_frac, label):
        print(f"\r    {label:40s}", end="", flush=True)

    r = await comfyui.run_workflow(g.nodes, on_progress=prog, node_labels=g.labels)
    print()
    o = next(o for o in r.outputs if o["filename"].endswith(".png"))
    data = await comfyui.fetch_output(o["filename"], o.get("subfolder", ""), o["type"])
    path = OUT / "selftest-image.png"
    path.write_bytes(data)
    res("Real image generation", "PASS", f"1024×1024 SDXL-Lightning in {time.time() - t0:.1f}s → {path}")


async def gen_video(info: dict) -> None:
    preset = workflows.ALL_PRESETS["wan22-5b"]
    ok, missing, files = workflows.check_preset(preset, info)
    if not ok:
        res("Real video generation", "SKIP", "Wan 2.2 files missing: " + ", ".join(missing))
        return
    await ollama.unload_all()
    # short, small clip to keep the test fast: 33 frames (~1.4 s) at 832x480, 12 steps
    g = workflows.build_wan_video(files, prompt="a futuristic car driving through a rainy neon city at night, tracking shot",
                                  negative="", width=832, height=480, frames=33, fps=24, steps=12, seed=random.randint(0, 2**32))
    t0 = time.time()

    async def prog(node_frac, sampler_frac, label):
        print(f"\r    {label:40s} {time.time() - t0:6.0f}s", end="", flush=True)

    r = await comfyui.run_workflow(g.nodes, on_progress=prog, node_labels=g.labels)
    print()
    o = r.outputs[0]
    raw = OUT / f"selftest-video-raw{Path(o['filename']).suffix}"
    raw.write_bytes(await comfyui.fetch_output(o["filename"], o.get("subfolder", ""), o["type"]))
    mp4 = OUT / "selftest-video.mp4"
    if ffmpeg.available():
        await ffmpeg.to_mp4(raw, mp4)
        info_v = await ffmpeg.probe(mp4)
        res("Real video generation", "PASS", f"{info_v['width']}×{info_v['height']}, {info_v['duration']:.1f}s @ {info_v['fps']} fps in {time.time() - t0:.0f}s → {mp4}")
    else:
        res("Real video generation", "PASS", f"generated in {time.time() - t0:.0f}s → {raw} (install FFmpeg for MP4 export)")
    await comfyui.free_memory(True)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", action="store_true", help="generate a real test image (SDXL)")
    ap.add_argument("--video", action="store_true", help="generate a real short test video (Wan 2.2 5B, takes minutes)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    print("\n  VELQIN self test\n")
    await check_gpu()
    try:
        await check_ollama()
    except ollama.OllamaError as e:
        res("Real chat inference", "FAIL", str(e))
    await check_search()
    res("FFmpeg", "PASS" if ffmpeg.available() else "FAIL", "found" if ffmpeg.available() else "install FFmpeg for video export")
    info = await check_comfy()
    if info and args.image:
        try:
            await gen_image(info)
        except comfyui.ComfyError as e:
            res("Real image generation", "FAIL", str(e))
    if info and args.video:
        try:
            await gen_video(info)
        except comfyui.ComfyError as e:
            res("Real video generation", "FAIL", str(e))
    (OUT / "report.json").write_text(json.dumps([{"check": a, "status": b, "detail": c} for a, b, c in report], indent=2, ensure_ascii=False), encoding="utf-8")
    fails = sum(1 for r in report if r[1] == "FAIL")
    print(f"\n  {len(report)} checks · {fails} failed · report: {OUT / 'report.json'}\n")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

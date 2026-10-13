"""Async client for a local ComfyUI server (image & video generation backend).

API used: POST /prompt, GET /history/{id}, GET /view, POST /upload/image, GET /object_info,
POST /interrupt, POST /queue (delete), POST /free, GET /system_stats and the /ws progress websocket.
"""
from __future__ import annotations

import asyncio
import json
import logging
import struct
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import websockets

from core.config import settings

log = logging.getLogger("velqin.comfyui")


class ComfyError(Exception):
    pass


class ComfyUnavailable(ComfyError):
    pass


class ComfyOOM(ComfyError):
    pass


OOM_MARKERS = ("out of memory", "outofmemoryerror", "allocation on device", "cuda error: out of memory")


def _is_oom(text: str) -> bool:
    t = text.lower()
    return any(m in t for m in OOM_MARKERS)


def _client(timeout: float = 30.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=settings.comfyui_url, timeout=httpx.Timeout(timeout, connect=5.0))


async def system_stats() -> dict | None:
    try:
        async with _client(4.0) as c:
            r = await c.get("/system_stats")
            r.raise_for_status()
            return r.json()
    except (httpx.HTTPError, ValueError):
        return None


_object_info: dict = {"t": 0.0, "data": None}


async def object_info(force: bool = False) -> dict:
    if not force and _object_info["data"] is not None and time.monotonic() - _object_info["t"] < 60:
        return _object_info["data"]
    try:
        async with _client(30.0) as c:
            r = await c.get("/object_info")
            r.raise_for_status()
            data = r.json()
    except httpx.ConnectError as e:
        raise ComfyUnavailable("ComfyUI is not running.") from e
    except (httpx.HTTPError, ValueError) as e:
        raise ComfyError(f"ComfyUI error: {e}") from e
    _object_info.update(t=time.monotonic(), data=data)
    return data


def input_options(info: dict, node: str, input_name: str) -> list[str]:
    """List of allowed values for a combo input (e.g. checkpoint names)."""
    spec = info.get(node, {}).get("input", {})
    for group in ("required", "optional"):
        val = spec.get(group, {}).get(input_name)
        if val:
            first = val[0]
            if isinstance(first, list):
                return [str(x) for x in first]
            if isinstance(first, str) and first == "COMBO" and len(val) > 1 and isinstance(val[1], dict):
                return [str(x) for x in val[1].get("options", [])]
    return []


async def upload_image(data: bytes, filename: str) -> str:
    files = {"image": (filename, data, "image/png")}
    try:
        async with _client(60.0) as c:
            r = await c.post("/upload/image", files=files, data={"overwrite": "true", "type": "input"})
            r.raise_for_status()
            res = r.json()
    except httpx.HTTPError as e:
        raise ComfyError(f"Image upload to ComfyUI failed: {e}") from e
    name = res["name"]
    return f"{res['subfolder']}/{name}" if res.get("subfolder") else name


async def interrupt() -> None:
    try:
        async with _client(10.0) as c:
            await c.post("/interrupt", json={})
    except httpx.HTTPError:
        pass


async def delete_from_queue(prompt_id: str) -> None:
    try:
        async with _client(10.0) as c:
            await c.post("/queue", json={"delete": [prompt_id]})
    except httpx.HTTPError:
        pass


async def free_memory(unload_models: bool = True) -> None:
    try:
        async with _client(30.0) as c:
            await c.post("/free", json={"unload_models": unload_models, "free_memory": True})
    except httpx.HTTPError:
        pass


async def fetch_output(filename: str, subfolder: str, ftype: str) -> bytes:
    q = urlencode({"filename": filename, "subfolder": subfolder, "type": ftype})
    async with _client(300.0) as c:
        r = await c.get(f"/view?{q}")
        r.raise_for_status()
        return r.content


@dataclass
class RunResult:
    prompt_id: str
    outputs: list[dict]  # [{"filename", "subfolder", "type", "node", "kind"}]


# on_progress(node_fraction, sampler_fraction_or_None, label)
ProgressCb = Callable[[float, float | None, str], Awaitable[None]]
PreviewCb = Callable[[bytes], Awaitable[None]]


async def run_workflow(
    workflow: dict,
    *,
    on_progress: ProgressCb | None = None,
    on_preview: PreviewCb | None = None,
    should_cancel: Callable[[], bool] | None = None,
    node_labels: dict[str, str] | None = None,
) -> RunResult:
    """Queue a workflow and follow it over the websocket until it finishes."""
    client_id = uuid.uuid4().hex
    ws_url = settings.comfyui_url.replace("http://", "ws://").replace("https://", "wss://") + f"/ws?clientId={client_id}"
    node_labels = node_labels or {}
    try:
        ws = await websockets.connect(ws_url, max_size=None, open_timeout=10, ping_interval=20, ping_timeout=60)
    except (OSError, websockets.exceptions.WebSocketException) as e:
        raise ComfyUnavailable("ComfyUI is not reachable. Start it on the server (scripts/start-comfyui).") from e

    try:
        async with _client(60.0) as c:
            r = await c.post("/prompt", json={"prompt": workflow, "client_id": client_id})
        if r.status_code >= 400:
            try:
                err = r.json()
            except ValueError:
                err = {"error": r.text[:500]}
            raise ComfyError(_format_validation_error(err))
        prompt_id = r.json()["prompt_id"]

        nodes_total = max(1, len(workflow))
        nodes_done: set[str] = set()
        current_node: str | None = None
        last_progress = 0.0
        while True:
            if should_cancel and should_cancel():
                await delete_from_queue(prompt_id)
                await interrupt()
                raise asyncio.CancelledError()
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                continue
            if isinstance(raw, bytes):
                if on_preview:
                    img = _parse_preview(raw)
                    if img:
                        await on_preview(img)
                continue
            msg = json.loads(raw)
            mtype, data = msg.get("type"), msg.get("data", {})
            if data.get("prompt_id") not in (None, prompt_id):
                continue
            if mtype == "execution_cached":
                nodes_done.update(str(n) for n in data.get("nodes", []))
            elif mtype == "executing":
                node = data.get("node")
                if current_node:
                    nodes_done.add(current_node)
                if node is None and data.get("prompt_id") == prompt_id:
                    break  # finished
                current_node = str(node) if node is not None else None
                if on_progress and current_node:
                    label = node_labels.get(current_node, workflow.get(current_node, {}).get("class_type", "Working"))
                    last_progress = max(last_progress, len(nodes_done) / nodes_total * 0.9)
                    await on_progress(last_progress, None, label)
            elif mtype == "progress":
                value, maximum = data.get("value", 0), max(1, data.get("max", 1))
                node = str(data.get("node") or current_node or "")
                label = node_labels.get(node, "Sampling")
                if on_progress:
                    await on_progress(last_progress, value / maximum, f"{label} · step {value}/{maximum}")
            elif mtype == "execution_success":
                break
            elif mtype == "execution_error":
                text = f"{data.get('exception_type', '')}: {data.get('exception_message', '')}"
                if _is_oom(text):
                    raise ComfyOOM("The GPU ran out of memory.")
                raise ComfyError(f"Generation failed in {data.get('node_type', 'a node')}: {data.get('exception_message', 'unknown error')[:400]}")
            elif mtype == "execution_interrupted":
                raise asyncio.CancelledError()
    finally:
        await ws.close()

    async with _client(60.0) as c:
        r = await c.get(f"/history/{prompt_id}")
        r.raise_for_status()
        hist = r.json().get(prompt_id, {})
    outputs: list[dict] = []
    for node_id, out in (hist.get("outputs") or {}).items():
        for key, items in out.items():
            if not isinstance(items, list):
                continue
            for it in items:
                if isinstance(it, dict) and it.get("filename") and it.get("type") == "output":
                    outputs.append({**it, "node": node_id, "key": key})
    status = hist.get("status", {})
    if status.get("status_str") == "error" and not outputs:
        msgs = json.dumps(status.get("messages", []))[:600]
        if _is_oom(msgs):
            raise ComfyOOM("The GPU ran out of memory.")
        raise ComfyError("ComfyUI reported an error without output.")
    return RunResult(prompt_id=prompt_id, outputs=outputs)


def _parse_preview(raw: bytes) -> bytes | None:
    if len(raw) < 8:
        return None
    event = struct.unpack(">I", raw[:4])[0]
    if event == 1:  # PREVIEW_IMAGE: [event][image type][bytes]
        return raw[8:]
    if event == 4:  # PREVIEW_IMAGE_WITH_METADATA: [event][metadata len][json][bytes]
        mlen = struct.unpack(">I", raw[4:8])[0]
        return raw[8 + mlen:]
    return None


def _format_validation_error(err: dict) -> str:
    base = err.get("error")
    if isinstance(base, dict):
        base = base.get("message") or base.get("type")
    parts = [str(base or "ComfyUI rejected the workflow.")]
    for node_id, ne in (err.get("node_errors") or {}).items():
        for e in ne.get("errors", [])[:2]:
            parts.append(f"{ne.get('class_type', node_id)}: {e.get('message')} {e.get('details', '')}".strip())
    text = " | ".join(parts)[:700]
    if "not in list" in text or "value_not_in_list" in text:
        text += " — a required model file is probably missing (see docs/IMAGE_VIDEO_SETUP.md)."
    return text

"""Thin async client for the local Ollama runtime (https://github.com/ollama/ollama/blob/main/docs/api.md)."""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

from core.config import settings

log = logging.getLogger("velqin.ollama")


class OllamaError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class OllamaUnavailable(OllamaError):
    pass


def _client(timeout: float | None = 10.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=settings.ollama_url, timeout=httpx.Timeout(timeout, connect=5.0))


async def version() -> str | None:
    try:
        async with _client(3.0) as c:
            r = await c.get("/api/version")
            r.raise_for_status()
            return r.json().get("version")
    except (httpx.HTTPError, ValueError):
        return None


async def list_installed() -> list[dict]:
    try:
        async with _client() as c:
            r = await c.get("/api/tags")
            r.raise_for_status()
            return r.json().get("models", [])
    except httpx.ConnectError as e:
        raise OllamaUnavailable("Ollama is not running.") from e
    except httpx.HTTPError as e:
        raise OllamaError(f"Ollama error: {e}") from e


async def list_running() -> list[dict]:
    try:
        async with _client() as c:
            r = await c.get("/api/ps")
            r.raise_for_status()
            return r.json().get("models", [])
    except httpx.HTTPError:
        return []


async def show(model: str) -> dict | None:
    try:
        async with _client() as c:
            r = await c.post("/api/show", json={"model": model})
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError:
        return None


async def unload(model: str) -> None:
    """Ask Ollama to free a model from (V)RAM immediately."""
    try:
        async with _client(30.0) as c:
            await c.post("/api/generate", json={"model": model, "keep_alive": 0})
    except httpx.HTTPError as e:
        log.warning("Could not unload %s: %s", model, e)


async def unload_all() -> list[str]:
    names = [m.get("name") or m.get("model") for m in await list_running()]
    for n in names:
        if n:
            await unload(n)
    return [n for n in names if n]


async def delete(model: str) -> None:
    async with _client(60.0) as c:
        r = await c.request("DELETE", "/api/delete", json={"model": model})
        if r.status_code not in (200, 404):
            raise OllamaError(f"Delete failed: HTTP {r.status_code}")


async def pull(model: str) -> AsyncIterator[dict]:
    """Stream pull progress events: {"status", "digest", "total", "completed"}."""
    async with httpx.AsyncClient(base_url=settings.ollama_url, timeout=httpx.Timeout(None, connect=5.0)) as c:
        try:
            async with c.stream("POST", "/api/pull", json={"model": model, "stream": True}) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode(errors="replace")
                    raise OllamaError(_extract_error(body) or f"HTTP {r.status_code}", r.status_code)
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    if "error" in data:
                        raise OllamaError(data["error"])
                    yield data
        except httpx.ConnectError as e:
            raise OllamaUnavailable("Ollama is not running.") from e


def _extract_error(body: str) -> str | None:
    try:
        return json.loads(body).get("error")
    except (ValueError, AttributeError):
        return body[:300] or None


async def chat_stream(
    model: str,
    messages: list[dict[str, Any]],
    *,
    options: dict[str, Any] | None = None,
    think: bool | None = None,
    keep_alive: str | int | None = None,
) -> AsyncIterator[dict]:
    """Stream chat chunks. Each yielded dict is a raw Ollama chunk:
    {"message": {"role", "content", "thinking"?}, "done": bool, ...stats}"""
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
    if options:
        payload["options"] = options
    if think is not None:
        payload["think"] = think
    if keep_alive is not None:
        payload["keep_alive"] = keep_alive
    async with httpx.AsyncClient(
        base_url=settings.ollama_url, timeout=httpx.Timeout(connect=5.0, read=600.0, write=60.0, pool=10.0)
    ) as c:
        try:
            async with c.stream("POST", "/api/chat", json=payload) as r:
                if r.status_code >= 400:
                    body = (await r.aread()).decode(errors="replace")
                    msg = _extract_error(body) or f"HTTP {r.status_code}"
                    if r.status_code == 404:
                        msg = f"Model '{model}' is not installed. Download it in the model library."
                    raise OllamaError(msg, r.status_code)
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    if "error" in data:
                        raise OllamaError(data["error"])
                    yield data
        except httpx.ConnectError as e:
            raise OllamaUnavailable(
                "The local AI runtime (Ollama) is not reachable. Start it on the server and try again."
            ) from e
        except httpx.ReadTimeout as e:
            raise OllamaError("The model took too long to respond.") from e


async def chat_once(model: str, messages: list[dict], *, options: dict | None = None,
                    think: bool | None = None, timeout: float = 120.0) -> str:
    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": False}
    if options:
        payload["options"] = options
    if think is not None:
        payload["think"] = think
    try:
        async with _client(timeout) as c:
            r = await c.post("/api/chat", json=payload)
            if r.status_code >= 400:
                raise OllamaError(_extract_error(r.text) or f"HTTP {r.status_code}", r.status_code)
            return r.json().get("message", {}).get("content", "")
    except httpx.ConnectError as e:
        raise OllamaUnavailable("Ollama is not running.") from e
    except httpx.HTTPError as e:
        raise OllamaError(str(e)) from e


async def embed(model: str, inputs: list[str]) -> list[list[float]]:
    try:
        async with _client(120.0) as c:
            r = await c.post("/api/embed", json={"model": model, "input": inputs})
            if r.status_code >= 400:
                raise OllamaError(_extract_error(r.text) or f"HTTP {r.status_code}", r.status_code)
            return r.json().get("embeddings", [])
    except httpx.ConnectError as e:
        raise OllamaUnavailable("Ollama is not running.") from e
    except httpx.HTTPError as e:
        raise OllamaError(str(e)) from e

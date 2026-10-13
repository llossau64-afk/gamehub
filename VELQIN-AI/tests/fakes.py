"""Protocol test doubles for Ollama and SearXNG.

USED ONLY BY THE AUTOMATED TESTS. They speak the same HTTP/NDJSON protocol as the real services so the
VELQIN backend can be tested without a GPU. They are never used by the application itself — real
inference always goes to the real Ollama / ComfyUI on your PC (see scripts/selftest.py)."""
from __future__ import annotations

import asyncio
import hashlib
import json
import socket
import threading
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

INSTALLED = ["qwen3:4b", "qwen2.5-coder:7b", "nomic-embed-text:latest"]
STATE = {"delay": 0.0, "requests": [], "loaded": set()}


def make_ollama() -> FastAPI:
    app = FastAPI()

    @app.get("/api/version")
    async def version():
        return {"version": "0.0.0-test"}

    @app.get("/api/tags")
    async def tags():
        return {"models": [{"name": n, "model": n, "size": 1000 * (i + 1), "modified_at": "2025-01-01T00:00:00Z",
                            "details": {"parameter_size": "4B", "quantization_level": "Q4_K_M"}}
                           for i, n in enumerate(INSTALLED)]}

    @app.get("/api/ps")
    async def ps():
        return {"models": [{"name": n, "model": n, "size_vram": 1} for n in STATE["loaded"]]}

    @app.post("/api/generate")
    async def generate(req: Request):
        body = await req.json()
        if body.get("keep_alive") == 0:
            STATE["loaded"].discard(body["model"])
        return {"done": True}

    @app.post("/api/chat")
    async def chat(req: Request):
        body = await req.json()
        STATE["requests"].append(body)
        model = body["model"]
        if model not in INSTALLED:
            return JSONResponse({"error": f"model '{model}' not found"}, status_code=404)
        STATE["loaded"].add(model)
        last = next(m for m in reversed(body["messages"]) if m["role"] == "user")
        sys_prompt = body["messages"][0]["content"] if body["messages"][0]["role"] == "system" else ""
        if not body.get("stream", True):
            return {"message": {"role": "assistant", "content": "Test Title"}, "done": True}
        words = f"Echo from {model}: {last['content']}".split(" ")
        if "<web_results>" in sys_prompt:
            words += ["[1]"]

        async def gen():
            if body.get("think"):
                yield json.dumps({"message": {"role": "assistant", "content": "", "thinking": "hmm "}, "done": False}) + "\n"
            for w in words:
                await asyncio.sleep(STATE["delay"])
                yield json.dumps({"message": {"role": "assistant", "content": w + " "}, "done": False}) + "\n"
            yield json.dumps({"message": {"role": "assistant", "content": ""}, "done": True, "eval_count": len(words),
                              "eval_duration": 1_000_000_000, "prompt_eval_count": 10}) + "\n"

        return StreamingResponse(gen(), media_type="application/x-ndjson")

    @app.post("/api/embed")
    async def embed(req: Request):
        body = await req.json()
        inputs = body["input"] if isinstance(body["input"], list) else [body["input"]]
        vecs = []
        for t in inputs:
            h = hashlib.sha256(t.lower().encode()).digest()
            vecs.append([b / 255 for b in h[:16]])
        return {"embeddings": vecs}

    @app.post("/api/pull")
    async def pull(req: Request):
        body = await req.json()

        async def gen():
            for done in (0, 50, 100):
                yield json.dumps({"status": "downloading", "total": 100, "completed": done}) + "\n"
            INSTALLED.append(body["model"])
            yield json.dumps({"status": "success"}) + "\n"

        return StreamingResponse(gen(), media_type="application/x-ndjson")

    @app.delete("/api/delete")
    async def delete(req: Request):
        body = await req.json()
        if body["model"] in INSTALLED:
            INSTALLED.remove(body["model"])
        return {}

    return app


def make_searxng() -> FastAPI:
    app = FastAPI()

    @app.get("/healthz")
    async def health():
        return "OK"

    @app.get("/search")
    async def search(q: str, format: str = "html", categories: str = "general"):
        return {"results": [
            {"url": "http://127.0.0.1:9/internal-should-be-blocked", "title": "Bundesliga: Spieltag Ergebnisse",
             "content": "Bayern München gewann 3:1 gegen Dortmund.", "publishedDate": "2026-10-12T18:00:00Z",
             "engine": "test"},
            {"url": "https://example.invalid/news", "title": "Second source", "content": "Weitere Meldung.",
             "engine": "test"},
        ]}

    return app


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class ServerThread(threading.Thread):
    def __init__(self, app: FastAPI, port: int) -> None:
        super().__init__(daemon=True)
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))

    def run(self) -> None:
        self.server.run()

    def wait_ready(self) -> None:
        for _ in range(100):
            if self.server.started:
                return
            time.sleep(0.05)
        raise RuntimeError("fake server did not start")

"""ComfyUI *protocol* test double (HTTP + WebSocket) — TESTS ONLY, no AI.

It validates submitted graphs against a small /object_info, streams the same websocket messages as ComfyUI
(executing / progress / binary previews / execution_success) and writes placeholder outputs: a solid-colour
PNG for SaveImage and an FFmpeg test-pattern MP4 for SaveVideo, sized from the graph's latent node. This lets
the tests exercise VELQIN's job queue, progress, media library and FFmpeg segment pipeline end to end."""
from __future__ import annotations

import asyncio
import io
import struct
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from PIL import Image

FILES = {
    "CheckpointLoaderSimple": {"ckpt_name": ["sd_xl_base_1.0.safetensors"]},
    "LoraLoaderModelOnly": {"lora_name": ["sdxl_lightning_4step_lora.safetensors"]},
    "UpscaleModelLoader": {"model_name": ["RealESRGAN_x4plus.pth"]},
    "UNETLoader": {"unet_name": ["wan2.2_ti2v_5B_fp16.safetensors"]},
    "CLIPLoader": {"clip_name": ["umt5_xxl_fp8_e4m3fn_scaled.safetensors"]},
    "VAELoader": {"vae_name": ["wan2.2_vae.safetensors"]},
}
NODES = ["CLIPTextEncode", "EmptyLatentImage", "EmptySD3LatentImage", "KSampler", "VAEDecode", "VAEEncode", "SaveImage",
         "LoadImage", "LoadImageMask", "VAEEncodeForInpaint", "SetLatentNoiseMask", "ImageUpscaleWithModel", "ImageScaleBy",
         "ModelSamplingSD3", "Wan22ImageToVideoLatent", "CreateVideo", "SaveVideo", *FILES]

STATE: dict = {"step_delay": 0.0, "fail_oom_once": False, "prompts": [], "interrupted": False}


def object_info() -> dict:
    info = {}
    for n in NODES:
        req = {}
        for inp, opts in FILES.get(n, {}).items():
            # mix old ([list]) and new (["COMBO", {options}]) formats like real ComfyUI versions do
            req[inp] = [opts] if n != "VAELoader" else ["COMBO", {"options": opts}]
        info[n] = {"input": {"required": req}}
    return info


def make_app() -> FastAPI:
    app = FastAPI()
    sockets: dict[str, WebSocket] = {}
    out_dir = Path(tempfile.mkdtemp(prefix="fake-comfy-"))
    history: dict[str, dict] = {}
    uploads: dict[str, bytes] = {}

    @app.get("/system_stats")
    async def stats():
        return {"system": {"comfyui_version": "0.0-test"}, "devices": [{"name": "fake-device"}]}

    @app.get("/object_info")
    async def oi():
        return object_info()

    @app.post("/upload/image")
    async def upload(image: UploadFile = File(...), overwrite: str = Form("true"), type: str = Form("input")):
        uploads[image.filename] = await image.read()
        return {"name": image.filename, "subfolder": "", "type": "input"}

    @app.post("/interrupt")
    async def interrupt():
        STATE["interrupted"] = True
        return {}

    @app.post("/queue")
    async def queue():
        return {}

    @app.post("/free")
    async def free():
        return {}

    @app.websocket("/ws")
    async def ws(websocket: WebSocket, clientId: str):
        await websocket.accept()
        sockets[clientId] = websocket
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            sockets.pop(clientId, None)

    @app.get("/history/{pid}")
    async def hist(pid: str):
        return {pid: history[pid]} if pid in history else {}

    @app.get("/view")
    async def view(filename: str, subfolder: str = "", type: str = "output"):
        return Response((out_dir / filename).read_bytes())

    @app.post("/prompt")
    async def prompt(req: Request):
        body = await req.json()
        graph, client = body["prompt"], body["client_id"]
        errors = {nid: {"class_type": n["class_type"], "errors": [{"message": "node not found"}]}
                  for nid, n in graph.items() if n["class_type"] not in NODES}
        for nid, n in graph.items():
            for inp, opts in FILES.get(n["class_type"], {}).items():
                if n["inputs"].get(inp) not in opts:
                    errors[nid] = {"class_type": n["class_type"], "errors": [{"message": "Value not in list", "details": inp}]}
            if n["class_type"] in ("LoadImage", "LoadImageMask") and n["inputs"]["image"] not in uploads:
                errors[nid] = {"class_type": n["class_type"], "errors": [{"message": "Invalid image file"}]}
        if errors:
            return JSONResponse({"error": {"message": "Prompt outputs failed validation"}, "node_errors": errors}, status_code=400)
        pid = uuid.uuid4().hex
        STATE["prompts"].append(graph)
        asyncio.create_task(run(pid, graph, client))
        return {"prompt_id": pid, "number": len(STATE["prompts"]), "node_errors": {}}

    async def send(client: str, msg: dict | bytes):
        ws = sockets.get(client)
        if ws is None:
            return
        if isinstance(msg, bytes):
            await ws.send_bytes(msg)
        else:
            await ws.send_json(msg)

    async def run(pid: str, graph: dict, client: str):
        await asyncio.sleep(0.05)
        STATE["interrupted"] = False
        await send(client, {"type": "execution_start", "data": {"prompt_id": pid}})
        outputs: dict = {}
        latent = next((n["inputs"] for n in graph.values() if n["class_type"] in ("EmptyLatentImage", "EmptySD3LatentImage", "Wan22ImageToVideoLatent")), None)
        for nid, node in graph.items():
            await send(client, {"type": "executing", "data": {"node": nid, "prompt_id": pid}})
            if node["class_type"] == "KSampler":
                steps = node["inputs"]["steps"]
                for i in range(1, steps + 1):
                    if STATE["interrupted"]:
                        await send(client, {"type": "execution_interrupted", "data": {"prompt_id": pid}})
                        return
                    await asyncio.sleep(STATE["step_delay"])
                    await send(client, {"type": "progress", "data": {"value": i, "max": steps, "prompt_id": pid, "node": nid}})
                    buf = io.BytesIO()
                    Image.new("RGB", (64, 64), (40, 40, 90)).save(buf, "JPEG")
                    await send(client, struct.pack(">II", 1, 1) + buf.getvalue())
                if STATE["fail_oom_once"]:
                    STATE["fail_oom_once"] = False
                    await send(client, {"type": "execution_error", "data": {"prompt_id": pid, "node_type": "KSampler",
                                        "exception_type": "torch.OutOfMemoryError", "exception_message": "CUDA out of memory. Tried to allocate 2.00 GiB"}})
                    return
            if node["class_type"] == "SaveImage":
                w, h = (latent["width"], latent["height"]) if latent else (512, 512)
                if not latent:  # img2img/upscale: size of the uploaded input (x2 for upscale graphs)
                    load = next(n for n in graph.values() if n["class_type"] == "LoadImage")
                    with Image.open(io.BytesIO(uploads[load["inputs"]["image"]])) as im:
                        w, h = im.size
                    if any(n["class_type"] == "ImageUpscaleWithModel" for n in graph.values()):
                        w, h = w * 2, h * 2
                name = f"img_{pid}.png"
                Image.new("RGB", (w, h), (120, 100, 240)).save(out_dir / name)
                outputs[nid] = {"images": [{"filename": name, "subfolder": "velqin", "type": "output"}]}
            if node["class_type"] == "SaveVideo":
                fps = next(n["inputs"]["fps"] for n in graph.values() if n["class_type"] == "CreateVideo")
                frames = latent["length"]
                name = f"vid_{pid}.mp4"
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                                f"testsrc=size={latent['width']}x{latent['height']}:rate={fps}", "-frames:v", str(frames),
                                "-pix_fmt", "yuv420p", str(out_dir / name)], check=True)
                outputs[nid] = {"images": [{"filename": name, "subfolder": "velqin", "type": "output"}], "animated": [True]}
            await send(client, {"type": "executed", "data": {"node": nid, "prompt_id": pid, "output": outputs.get(nid)}})
        history[pid] = {"outputs": outputs, "status": {"status_str": "success", "completed": True}}
        await send(client, {"type": "execution_success", "data": {"prompt_id": pid}})
        await send(client, {"type": "executing", "data": {"node": None, "prompt_id": pid}})

    return app

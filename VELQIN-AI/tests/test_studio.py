"""End-to-end tests of the Image Studio / VELQIN Motion pipeline against the ComfyUI protocol double.
Real files are produced (PNG via Pillow, MP4 via FFmpeg) — the AI part is the only thing that is simulated."""
import base64
import io
import shutil
import time

import pytest
from PIL import Image

from conftest import COMFY_URL
from helpers import H, ensure_owner


@pytest.fixture()
def comfy(client):
    from core.config import settings
    from services import comfyui

    old = settings.comfyui_url
    settings.comfyui_url = COMFY_URL
    comfyui._object_info["data"] = None
    yield
    settings.comfyui_url = old
    comfyui._object_info["data"] = None


def wait_job(client, jid, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/jobs/{jid}").json()["job"]
        if j["status"] in ("done", "failed", "cancelled"):
            return j
        time.sleep(0.1)
    raise AssertionError(f"job {jid} did not finish: {j}")


def png_bytes(w, h, color="red"):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


def test_presets_detected(client, comfy):
    ensure_owner(client)
    p = client.get("/api/studio/presets").json()
    avail = {x["id"]: x["available"] for x in p["presets"]}
    assert p["comfyui_online"] is True
    assert avail == {"sdxl": True, "flux-schnell": False, "upscale": True, "wan22-5b": True}


def test_text_to_image_job_creates_media(client, comfy):
    ensure_owner(client)
    r = client.post("/api/studio/image", json={"prompt": "a silver car", "aspect": "16:9", "count": 2, "seed": 7}, headers=H)
    assert r.status_code == 200, r.text
    j = wait_job(client, r.json()["job"]["id"])
    assert j["status"] == "done", j
    assert len(j["result"]["media_ids"]) == 2 and j["result"]["seed"] == 7
    mid = j["result"]["media_ids"][0]
    img = Image.open(io.BytesIO(client.get(f"/api/media/{mid}/file").content))
    assert img.size == (1344, 768)
    assert client.get(f"/api/media/{mid}/thumb").status_code == 200
    item = client.get(f"/api/media/{mid}").json()["item"]
    assert item["params"]["seed"] == 7 and item["prompt"] == "a silver car"
    from fake_comfy import STATE

    ks = next(n for n in STATE["prompts"][-1].values() if n["class_type"] == "KSampler")["inputs"]
    assert ks["seed"] == 8 and ks["steps"] == 4  # second image = seed+1, Lightning 4 steps


def test_inpaint_and_upscale_jobs(client, comfy):
    ensure_owner(client)
    src = client.post("/api/files", files={"file": ("src.png", png_bytes(800, 600), "image/png")}, headers=H).json()["file"]
    mask = Image.new("L", (800, 600), 0)
    mask.paste(255, (100, 100, 400, 400))
    buf = io.BytesIO()
    mask.save(buf, "PNG")
    r = client.post("/api/studio/image", json={"mode": "inpaint", "prompt": "a lake", "input_file_id": src["id"], "strength": 1.0,
                                               "mask_png": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}, headers=H)
    assert r.status_code == 200, r.text
    j = wait_job(client, r.json()["job"]["id"])
    assert j["status"] == "done", j
    from fake_comfy import STATE

    assert any(n["class_type"] == "VAEEncodeForInpaint" for n in STATE["prompts"][-1].values())
    r = client.post("/api/studio/image", json={"mode": "upscale", "input_media_id": j["result"]["media_ids"][0]}, headers=H)
    j = wait_job(client, r.json()["job"]["id"])
    assert j["status"] == "done", j
    up = Image.open(io.BytesIO(client.get(f"/api/media/{j['result']['media_ids'][0]}/file").content))
    assert up.size[0] > 1000  # upscaled
    # empty mask is rejected
    empty = io.BytesIO()
    Image.new("L", (64, 64), 0).save(empty, "PNG")
    r = client.post("/api/studio/image", json={"mode": "inpaint", "prompt": "x", "input_file_id": src["id"],
                                               "mask_png": base64.b64encode(empty.getvalue()).decode()}, headers=H)
    assert r.status_code == 422


def test_oom_is_retried_once(client, comfy):
    from fake_comfy import STATE

    ensure_owner(client)
    STATE["fail_oom_once"] = True
    r = client.post("/api/studio/image", json={"prompt": "oom test"}, headers=H)
    j = wait_job(client, r.json()["job"]["id"])
    assert j["status"] == "done" and j["attempts"] == 2


def test_cancel_running_job(client, comfy):
    from fake_comfy import STATE

    ensure_owner(client)
    STATE["step_delay"] = 0.3
    try:
        r = client.post("/api/studio/image", json={"prompt": "slow", "quality": "quality"}, headers=H)
        jid = r.json()["job"]["id"]
        for _ in range(100):
            if client.get(f"/api/jobs/{jid}").json()["job"]["status"] == "running":
                break
            time.sleep(0.05)
        time.sleep(0.5)
        client.post(f"/api/jobs/{jid}/cancel", headers=H)
        j = wait_job(client, jid)
    finally:
        STATE["step_delay"] = 0.0
    assert j["status"] == "cancelled"


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_video_segments_and_extend(client, comfy):
    ensure_owner(client)
    r = client.post("/api/studio/video", json={"prompt": "a car in the rain", "duration": 10, "aspect": "9:16", "fps": 16}, headers=H)
    assert r.status_code == 200, r.text
    j = wait_job(client, r.json()["job"]["id"], timeout=120)
    assert j["status"] == "done", j
    assert j["result"]["segments"] == 2
    item = client.get(f"/api/media/{j['result']['media_ids'][0]}").json()["item"]
    # 2 segments x 81 frames @16 fps, the duplicated seam frame removed -> 161 frames ~ 10.06 s
    assert item["mime"] == "video/mp4" and (item["width"], item["height"]) == (480, 832)
    assert 9.8 <= item["duration"] <= 10.2, item
    from fake_comfy import STATE

    lat = next(n for n in STATE["prompts"][-1].values() if n["class_type"] == "Wan22ImageToVideoLatent")["inputs"]
    assert "start_image" in lat  # second segment continues from the last frame
    vid = client.get(f"/api/media/{item['id']}/file")
    assert vid.status_code == 200 and vid.content[4:8] == b"ftyp"
    # extend by 5 s
    r = client.post("/api/studio/video", json={"mode": "extend", "prompt": "continue", "source_video_id": item["id"], "fps": 16}, headers=H)
    j2 = wait_job(client, r.json()["job"]["id"], timeout=120)
    assert j2["status"] == "done", j2
    ext = client.get(f"/api/media/{j2['result']['media_ids'][0]}").json()["item"]
    assert 14.7 <= ext["duration"] <= 15.3, ext

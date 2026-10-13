#!/usr/bin/env python3
"""Export the ComfyUI workflows VELQIN generates (API format) into ai/workflows/ for inspection or for
loading into ComfyUI ("Load" → API JSON). VELQIN builds them in code (backend/services/workflows.py)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from services import workflows as w  # noqa: E402

F = {
    "CheckpointLoaderSimple.ckpt_name": "sd_xl_base_1.0.safetensors",
    "LoraLoaderModelOnly.lora_name": "sdxl_lightning_4step_lora.safetensors",
    "UnetLoaderGGUF.unet_name": "flux1-schnell-Q4_K_S.gguf",
    "DualCLIPLoader.clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
    "DualCLIPLoader.clip_name2": "clip_l.safetensors",
    "VAELoader.vae_name": "ae.safetensors",
    "UpscaleModelLoader.model_name": "RealESRGAN_x4plus.pth",
    "UNETLoader.unet_name": "wan2.2_ti2v_5B_fp16.safetensors",
    "CLIPLoader.clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
}
P = "a futuristic car in a rainy neon city at night, cinematic"
out = ROOT / "ai" / "workflows"
out.mkdir(parents=True, exist_ok=True)
items = {
    "sdxl_lightning_t2i": w.build_image("sdxl", F, mode="t2i", prompt=P, negative="", width=1344, height=768, seed=42, quality="fast"),
    "sdxl_quality_t2i": w.build_image("sdxl", F, mode="t2i", prompt=P, negative="blurry", width=1024, height=1024, seed=42, quality="quality"),
    "sdxl_i2i": w.build_image("sdxl", F, mode="i2i", prompt=P, negative="", width=1024, height=1024, seed=42, quality="fast", input_image="input.png", denoise=0.6),
    "sdxl_inpaint": w.build_image("sdxl", F, mode="inpaint", prompt=P, negative="", width=1024, height=1024, seed=42, quality="fast", input_image="input.png", mask_image="mask.png"),
    "flux_schnell_gguf_t2i": w.build_image("flux-schnell", {**F, "VAELoader.vae_name": "ae.safetensors"}, mode="t2i", prompt=P, negative="", width=1024, height=1024, seed=42, quality="fast"),
    "upscale_realesrgan_x2": w.build_upscale(F, "input.png"),
    "wan22_5b_t2v": w.build_wan_video({**F, "VAELoader.vae_name": "wan2.2_vae.safetensors"}, prompt=P, negative="", width=832, height=480, frames=121, fps=24, steps=12, seed=42),
    "wan22_5b_i2v": w.build_wan_video({**F, "VAELoader.vae_name": "wan2.2_vae.safetensors"}, prompt=P, negative="", width=832, height=480, frames=121, fps=24, steps=12, seed=42, start_image="start.png"),
}
for name, g in items.items():
    (out / f"{name}.json").write_text(json.dumps(g.nodes, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", f"ai/workflows/{name}.json")

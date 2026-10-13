"""Structural checks of the generated ComfyUI workflows (node links, required inputs)."""
from services import workflows


def _check_links(nodes: dict):
    for nid, node in nodes.items():
        for v in node["inputs"].values():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                assert v[0] in nodes, f"node {nid} links to missing node {v[0]}"


FILES = {
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


def test_image_graphs():
    for preset in ("sdxl", "flux-schnell"):
        for mode in workflows.ALL_PRESETS[preset].modes:
            files = dict(FILES)
            if preset == "flux-schnell":
                files["VAELoader.vae_name"] = "ae.safetensors"
            g = workflows.build_image(preset, files, mode=mode, prompt="p", negative="n", width=1024, height=1024,
                                      seed=1, quality="fast", input_image="in.png", mask_image="m.png", denoise=0.6)
            _check_links(g.nodes)
            types = [n["class_type"] for n in g.nodes.values()]
            assert "KSampler" in types and "SaveImage" in types
    g = workflows.build_image("sdxl", FILES, mode="t2i", prompt="p", negative="n", width=1024, height=1024, seed=1,
                              quality="fast")
    ks = next(n for n in g.nodes.values() if n["class_type"] == "KSampler")["inputs"]
    assert ks["steps"] == 4 and ks["cfg"] == 1.0 and ks["scheduler"] == "sgm_uniform"
    _check_links(workflows.build_upscale(FILES, "in.png").nodes)


def test_video_graph():
    g = workflows.build_wan_video(FILES, prompt="car", negative="", width=832, height=480, frames=121, fps=24, steps=12,
                                  seed=5, start_image="start.png")
    _check_links(g.nodes)
    lat = next(n for n in g.nodes.values() if n["class_type"] == "Wan22ImageToVideoLatent")["inputs"]
    assert lat["length"] == 121 and "start_image" in lat and lat["width"] % 32 == 0
    assert workflows.wan_frames(5, 24) == 121 and workflows.wan_frames(5, 16) == 81 and workflows.wan_frames(30, 24) == 121


def test_preset_availability_check():
    info = {"CheckpointLoaderSimple": {"input": {"required": {"ckpt_name": [["SDXL/sd_xl_base_1.0.safetensors"]]}}},
            "LoraLoaderModelOnly": {"input": {"required": {"lora_name": [[]]}}}}
    ok, missing, chosen = workflows.check_preset(workflows.ALL_PRESETS["sdxl"], info)
    assert not ok and missing == ["SDXL-Lightning 4-step LoRA"]
    assert chosen["CheckpointLoaderSimple.ckpt_name"] == "SDXL/sd_xl_base_1.0.safetensors"
    # new-style COMBO spec
    info["LoraLoaderModelOnly"] = {"input": {"required": {"lora_name": ["COMBO", {"options": ["sdxl_lightning_4step_lora.safetensors"]}]}}}
    ok, missing, _ = workflows.check_preset(workflows.ALL_PRESETS["sdxl"], info)
    assert ok


def test_moderation():
    from security.moderation import check_prompt

    assert check_prompt("a cinematic shot of a futuristic car in the rain") is None
    assert check_prompt("nude child") is not None
    assert check_prompt("sexy woman") is not None  # NSFW disabled by default
    assert check_prompt("a kind old man feeding pigeons") is None

"""ComfyUI workflow builders (API format) and model presets for image & video generation.

Every preset lists the node classes and model files it needs. `availability()` checks them against
the running ComfyUI (/object_info), so the UI only offers what is actually installed."""
from __future__ import annotations

from dataclasses import dataclass, field

# ------------------------------------------------------------------------------------------
# aspect ratios

IMAGE_SIZES = {  # ~1 megapixel buckets for SDXL / FLUX
    "1:1": (1024, 1024), "16:9": (1344, 768), "9:16": (768, 1344), "4:3": (1152, 896),
    "3:4": (896, 1152), "3:2": (1216, 832), "2:3": (832, 1216),
}

# Wan 2.2 TI2V 5B — dimensions must be multiples of 32. Native: 1280x704 @ 24 fps.
VIDEO_SIZES = {
    "fast": {"16:9": (832, 480), "9:16": (480, 832), "1:1": (512, 512)},
    "balanced": {"16:9": (960, 544), "9:16": (544, 960), "1:1": (640, 640)},
    "quality": {"16:9": (1280, 704), "9:16": (704, 1280), "1:1": (704, 704)},
}
VIDEO_STEPS = {"fast": 12, "balanced": 20, "quality": 30}

STYLE_PRESETS = {
    "none": ("", ""),
    "photo": ("photorealistic, natural lighting, 35mm photograph, sharp focus, high detail", "cartoon, illustration, painting, cgi"),
    "cinematic": ("cinematic film still, dramatic lighting, shallow depth of field, anamorphic, color graded", "flat lighting, amateur"),
    "anime": ("anime illustration, clean line art, vibrant cel shading, detailed background", "photo, realistic, 3d render"),
    "digital-art": ("digital painting, concept art, highly detailed, artstation quality", "photo, blurry"),
    "3d": ("3d render, octane render, soft global illumination, studio lighting, high detail", "photo, sketch, flat"),
    "watercolor": ("watercolor painting, soft washes, paper texture, delicate brush strokes", "photo, 3d, harsh lines"),
    "pixel-art": ("pixel art, 16-bit, crisp pixels, limited palette", "blurry, smooth gradients, photo"),
    "minimal": ("minimalist, clean composition, negative space, soft pastel colors", "cluttered, busy"),
}

WAN_NEGATIVE = ("色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，"
                "残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，"
                "三条腿，背景人很多，倒着走")


class Graph:
    """Tiny helper to build ComfyUI API-format graphs."""

    def __init__(self) -> None:
        self.nodes: dict[str, dict] = {}
        self.labels: dict[str, str] = {}
        self._n = 0

    def add(self, class_type: str, label: str | None = None, **inputs) -> str:
        self._n += 1
        nid = str(self._n)
        self.nodes[nid] = {"class_type": class_type, "inputs": inputs}
        if label:
            self.labels[nid] = label
        return nid

    @staticmethod
    def out(node_id: str, index: int = 0) -> list:
        return [node_id, index]


# ------------------------------------------------------------------------------------------
# presets


@dataclass
class Requirement:
    node: str            # node class that must exist
    input: str | None = None   # combo input that must contain one of `files`
    files: tuple[str, ...] = ()
    label: str = ""


@dataclass
class Preset:
    id: str
    name: str
    kind: str  # image | video
    description: str
    license: str
    requirements: list[Requirement] = field(default_factory=list)
    modes: tuple[str, ...] = ()


IMAGE_PRESETS: list[Preset] = [
    Preset(
        id="sdxl", name="VELQIN Image (SDXL + Lightning)", kind="image",
        description="Fast, high-quality 1-megapixel images. Lightning: 4 steps (~3–6 s on an RTX 4060). "
                    "Quality mode: 25 regular steps with negative prompt.",
        license="CreativeML Open RAIL++-M (SDXL), OpenRAIL++ (Lightning)",
        requirements=[
            Requirement("CheckpointLoaderSimple", "ckpt_name", ("sd_xl_base_1.0.safetensors",), "SDXL base checkpoint"),
            Requirement("LoraLoaderModelOnly", "lora_name", ("sdxl_lightning_4step_lora.safetensors",), "SDXL-Lightning 4-step LoRA"),
        ],
        modes=("t2i", "i2i", "inpaint", "outpaint"),
    ),
    Preset(
        id="flux-schnell", name="VELQIN Image Pro (FLUX.1-schnell GGUF)", kind="image",
        description="Excellent prompt following and text rendering. 4 steps, quantized (Q4) to fit 8 GB VRAM. "
                    "Slower than SDXL (~20–40 s).",
        license="Apache-2.0",
        requirements=[
            Requirement("UnetLoaderGGUF", "unet_name", ("flux1-schnell-Q4_K_S.gguf", "flux1-schnell-Q4_0.gguf", "flux1-schnell-Q5_K_S.gguf"),
                        "FLUX.1-schnell GGUF + ComfyUI-GGUF custom node"),
            Requirement("DualCLIPLoader", "clip_name1", ("t5xxl_fp8_e4m3fn.safetensors", "t5xxl_fp8_e4m3fn_scaled.safetensors"), "T5-XXL fp8 text encoder"),
            Requirement("DualCLIPLoader", "clip_name2", ("clip_l.safetensors",), "CLIP-L text encoder"),
            Requirement("VAELoader", "vae_name", ("ae.safetensors",), "FLUX VAE (ae.safetensors)"),
        ],
        modes=("t2i", "i2i"),
    ),
]

UPSCALE_PRESET = Preset(
    id="upscale", name="AI Upscale ×2 (Real-ESRGAN)", kind="image",
    description="Doubles the resolution with Real-ESRGAN x4plus (then scaled to ×2).",
    license="BSD-3-Clause",
    requirements=[Requirement("UpscaleModelLoader", "model_name", ("RealESRGAN_x4plus.pth", "4x-UltraSharp.pth"), "Real-ESRGAN x4plus")],
    modes=("upscale",),
)

VIDEO_PRESETS: list[Preset] = [
    Preset(
        id="wan22-5b", name="VELQIN Motion (Wan 2.2 TI2V 5B)", kind="video",
        description="Text-to-video and image-to-video, 24 fps, ~5 s per segment. Runs on 8 GB VRAM via ComfyUI "
                    "offloading — expect several minutes per clip on an RTX 4060.",
        license="Apache-2.0",
        requirements=[
            Requirement("Wan22ImageToVideoLatent", label="ComfyUI with Wan 2.2 support (update ComfyUI)"),
            Requirement("CreateVideo", label="ComfyUI video nodes (update ComfyUI)"),
            Requirement("UNETLoader", "unet_name", ("wan2.2_ti2v_5B_fp16.safetensors",), "Wan 2.2 TI2V 5B diffusion model"),
            Requirement("CLIPLoader", "clip_name", ("umt5_xxl_fp8_e4m3fn_scaled.safetensors",), "UMT5-XXL fp8 text encoder"),
            Requirement("VAELoader", "vae_name", ("wan2.2_vae.safetensors",), "Wan 2.2 VAE"),
        ],
        modes=("t2v", "i2v", "extend"),
    ),
]

ALL_PRESETS = {p.id: p for p in [*IMAGE_PRESETS, UPSCALE_PRESET, *VIDEO_PRESETS]}


def _options(info: dict, node: str, input_name: str) -> list[str]:
    from services.comfyui import input_options

    return input_options(info, node, input_name)


def check_preset(preset: Preset, info: dict) -> tuple[bool, list[str], dict[str, str]]:
    """Return (available, missing_labels, chosen_files {input_name: file})."""
    missing: list[str] = []
    chosen: dict[str, str] = {}
    for req in preset.requirements:
        if req.node not in info:
            missing.append(req.label or req.node)
            continue
        if req.input:
            opts = _options(info, req.node, req.input)
            hit = next((f for f in req.files if f in opts), None)
            if hit is None:
                # accept files placed in sub-folders, e.g. "SDXL/sd_xl_base_1.0.safetensors"
                hit = next((o for o in opts for f in req.files if o.replace("\\", "/").split("/")[-1] == f), None)
            if hit is None:
                missing.append(req.label or req.files[0])
            else:
                chosen[f"{req.node}.{req.input}"] = hit
    return (not missing), missing, chosen


def availability(info: dict | None) -> list[dict]:
    out = []
    for p in ALL_PRESETS.values():
        if info is None:
            ok, missing, _ = False, ["ComfyUI is not running"], {}
        else:
            ok, missing, _ = check_preset(p, info)
        extra = {}
        if p.id == "sdxl" and info is not None:
            extra["has_8step"] = "sdxl_lightning_8step_lora.safetensors" in _options(info, "LoraLoaderModelOnly", "lora_name")
        out.append({"id": p.id, "name": p.name, "kind": p.kind, "description": p.description, "license": p.license,
                    "modes": list(p.modes), "available": ok, "missing": missing, **extra})
    return out


# ------------------------------------------------------------------------------------------
# image graphs


def build_image(preset_id: str, files: dict[str, str], *, mode: str, prompt: str, negative: str, width: int,
                height: int, seed: int, quality: str, input_image: str | None = None, mask_image: str | None = None,
                denoise: float = 1.0, has_8step: bool = False) -> Graph:
    g = Graph()
    if preset_id == "sdxl":
        ckpt = g.add("CheckpointLoaderSimple", "Loading SDXL", ckpt_name=files["CheckpointLoaderSimple.ckpt_name"])
        model = g.out(ckpt, 0)
        clip, vae = g.out(ckpt, 1), g.out(ckpt, 2)
        if quality == "quality":
            steps, cfg, sampler, scheduler = 25, 6.5, "dpmpp_2m", "karras"
        else:
            lora_file = files["LoraLoaderModelOnly.lora_name"]
            steps = 4
            if quality == "balanced" and has_8step:
                lora_file = lora_file.replace("4step", "8step")
                steps = 8
            lora = g.add("LoraLoaderModelOnly", "Loading Lightning LoRA", model=model, lora_name=lora_file, strength_model=1.0)
            model = g.out(lora, 0)
            cfg, sampler, scheduler = 1.0, "euler", "sgm_uniform"
        pos = g.add("CLIPTextEncode", "Encoding prompt", text=prompt, clip=clip)
        neg = g.add("CLIPTextEncode", "Encoding prompt", text=negative, clip=clip)
    elif preset_id == "flux-schnell":
        unet = g.add("UnetLoaderGGUF", "Loading FLUX", unet_name=files["UnetLoaderGGUF.unet_name"])
        dclip = g.add("DualCLIPLoader", "Loading text encoders", clip_name1=files["DualCLIPLoader.clip_name1"],
                      clip_name2=files["DualCLIPLoader.clip_name2"], type="flux")
        vae_n = g.add("VAELoader", "Loading VAE", vae_name=files["VAELoader.vae_name"])
        model, clip, vae = g.out(unet), g.out(dclip), g.out(vae_n)
        pos = g.add("CLIPTextEncode", "Encoding prompt", text=prompt, clip=clip)
        neg = g.add("CLIPTextEncode", "Encoding prompt", text="", clip=clip)  # ignored at cfg 1
        steps, cfg, sampler, scheduler = (4 if quality != "quality" else 6), 1.0, "euler", "simple"
    else:
        raise ValueError(f"Unknown image preset {preset_id}")

    if mode == "t2i":
        latent_node = (g.add("EmptySD3LatentImage" if preset_id == "flux-schnell" else "EmptyLatentImage",
                             width=width, height=height, batch_size=1))
        latent = g.out(latent_node)
        denoise = 1.0
    else:
        if not input_image:
            raise ValueError("This mode needs an input image")
        img = g.add("LoadImage", "Loading image", image=input_image)
        if mode in ("inpaint", "outpaint"):
            if not mask_image:
                raise ValueError("Inpainting needs a mask")
            mask = g.add("LoadImageMask", "Loading mask", image=mask_image, channel="red")
            if denoise >= 0.99:
                enc = g.add("VAEEncodeForInpaint", "Preparing inpaint", pixels=g.out(img), vae=vae, mask=g.out(mask), grow_mask_by=8)
                latent = g.out(enc)
                denoise = 1.0
            else:
                enc = g.add("VAEEncode", "Encoding image", pixels=g.out(img), vae=vae)
                nm = g.add("SetLatentNoiseMask", "Applying mask", samples=g.out(enc), mask=g.out(mask))
                latent = g.out(nm)
        else:  # i2i
            enc = g.add("VAEEncode", "Encoding image", pixels=g.out(img), vae=vae)
            latent = g.out(enc)
    ks = g.add("KSampler", "Generating", model=model, seed=seed, steps=steps, cfg=cfg, sampler_name=sampler,
               scheduler=scheduler, positive=g.out(pos), negative=g.out(neg), latent_image=latent, denoise=round(denoise, 3))
    dec = g.add("VAEDecode", "Decoding", samples=g.out(ks), vae=vae)
    g.add("SaveImage", "Saving", images=g.out(dec), filename_prefix="velqin/img")
    return g


def build_upscale(files: dict[str, str], input_image: str) -> Graph:
    g = Graph()
    m = g.add("UpscaleModelLoader", "Loading upscaler", model_name=files["UpscaleModelLoader.model_name"])
    img = g.add("LoadImage", "Loading image", image=input_image)
    up = g.add("ImageUpscaleWithModel", "Upscaling", upscale_model=g.out(m), image=g.out(img))
    down = g.add("ImageScaleBy", "Resizing", image=g.out(up), upscale_method="lanczos", scale_by=0.5)
    g.add("SaveImage", "Saving", images=g.out(down), filename_prefix="velqin/upscale")
    return g


# ------------------------------------------------------------------------------------------
# video graph


def build_wan_video(files: dict[str, str], *, prompt: str, negative: str, width: int, height: int, frames: int,
                    fps: int, steps: int, seed: int, start_image: str | None = None) -> Graph:
    g = Graph()
    unet = g.add("UNETLoader", "Loading Wan 2.2", unet_name=files["UNETLoader.unet_name"], weight_dtype="default")
    clip = g.add("CLIPLoader", "Loading text encoder", clip_name=files["CLIPLoader.clip_name"], type="wan", device="default")
    vae = g.add("VAELoader", "Loading VAE", vae_name=files["VAELoader.vae_name"])
    ms = g.add("ModelSamplingSD3", "Preparing model", model=g.out(unet), shift=8.0)
    pos = g.add("CLIPTextEncode", "Encoding prompt", text=prompt, clip=g.out(clip))
    neg = g.add("CLIPTextEncode", "Encoding prompt", text=negative or WAN_NEGATIVE, clip=g.out(clip))
    lat_inputs = dict(vae=g.out(vae), width=width, height=height, length=frames, batch_size=1)
    if start_image:
        img = g.add("LoadImage", "Loading start image", image=start_image)
        lat_inputs["start_image"] = g.out(img)
    lat = g.add("Wan22ImageToVideoLatent", "Preparing latent", **lat_inputs)
    ks = g.add("KSampler", "Generating frames", model=g.out(ms), seed=seed, steps=steps, cfg=5.0, sampler_name="uni_pc",
               scheduler="simple", positive=g.out(pos), negative=g.out(neg), latent_image=g.out(lat), denoise=1.0)
    dec = g.add("VAEDecode", "Decoding frames", samples=g.out(ks), vae=g.out(vae))
    vid = g.add("CreateVideo", "Encoding video", images=g.out(dec), fps=float(fps))
    g.add("SaveVideo", "Saving video", video=g.out(vid), filename_prefix="velqin/video", format="auto", codec="auto")
    return g


def wan_frames(seconds: float, fps: int) -> int:
    """Wan needs 4k+1 frames. Clamp to the model's 121-frame (5 s @ 24 fps) training window."""
    n = int(round(seconds * fps))
    n = max(17, min(121, n))
    return min(121, round((n - 1) / 4) * 4 + 1)

# Image Studio & VELQIN Motion einrichten

VELQIN steuert **ComfyUI** über dessen lokale API (`127.0.0.1:8188`, nie öffentlich). Die Workflows baut VELQIN
selbst (`backend/services/workflows.py`); die exportierten JSON-Dateien liegen zur Ansicht in `ai/workflows/`.
VELQIN zeigt in der Oberfläche nur Modelle an, deren Dateien ComfyUI tatsächlich meldet (`/object_info`).

## Installation

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-comfyui.ps1
```
Installiert ComfyUI nach `ai\comfyui\ComfyUI` (eigene venv, PyTorch CUDA 12.8, Custom Node ComfyUI-GGUF).
Modelle (fortsetzbare Downloads, Quelle `ai/comfyui/models.json`):

```powershell
.venv\Scripts\python.exe scripts\download_models.py --list
.venv\Scripts\python.exe scripts\download_models.py image upscale     # SDXL + Lightning + Real-ESRGAN (~8 GB)
.venv\Scripts\python.exe scripts\download_models.py video             # Wan 2.2 TI2V 5B (~18 GB)
.venv\Scripts\python.exe scripts\download_models.py flux              # FLUX.1-schnell Q4 GGUF (~12 GB)
```
Eigene ComfyUI-Installation? `VELQIN_COMFYUI_URL` in `.env` setzen und mit `--comfyui <Pfad>` herunterladen.

## Bildmodelle (RTX 4060, 8 GB)

| Preset | Dateien | Einstellungen | Erwartung |
|---|---|---|---|
| **VELQIN Image (SDXL + Lightning)** | `sd_xl_base_1.0.safetensors` (checkpoints), `sdxl_lightning_4step_lora.safetensors` (loras), optional 8-Step-LoRA | Fast: 4 Schritte, CFG 1, euler/sgm_uniform · Balanced: 8 Schritte · Quality: 25 Schritte dpmpp_2m karras, CFG 6,5 | ca. 1 MP; schnell |
| **VELQIN Image Pro (FLUX.1-schnell)** | `flux1-schnell-Q4_K_S.gguf` (unet), `t5xxl_fp8_e4m3fn` + `clip_l` (text_encoders), `ae.safetensors` (vae) | 4 Schritte, CFG 1 | bessere Prompt-Treue & Text, langsamer; T5 belegt ~5 GB RAM |
| **Upscale** | `RealESRGAN_x4plus.pth` (upscale_models) | ×4 → auf ×2 skaliert | |

Formate: 1:1 (1024²), 16:9 (1344×768), 9:16, 4:3 (1152×896), 3:4, 3:2 (1216×832), 2:3.
Hinweis: Bei CFG 1 (Lightning/FLUX) hat der Negativ-Prompt keine Wirkung — deshalb ist er nur im Quality-Modus sichtbar.

Bearbeitungsmodi: **Remix** (img2img mit Stärke), **Inpaint** (Bereich mit dem Pinsel markieren — z. B. Hintergrund
ersetzen), **Extend** (Outpainting nach links/rechts/oben/unten), **Upscale**. Inpaint/Outpaint nutzen das normale
SDXL-Modell mit `VAEEncodeForInpaint` — ein dediziertes Inpainting-Modell wäre an Kanten sauberer (später ergänzbar).

## Video: Wan 2.2 TI2V 5B

Dateien: `wan2.2_ti2v_5B_fp16.safetensors` (diffusion_models), `umt5_xxl_fp8_e4m3fn_scaled.safetensors`
(text_encoders), `wan2.2_vae.safetensors` (vae). Der Workflow entspricht der offiziellen ComfyUI-Vorlage
`video_wan2_2_5B_ti2v` (UNETLoader → ModelSamplingSD3 shift 8 → KSampler uni_pc/simple, CFG 5 →
Wan22ImageToVideoLatent → VAEDecode → CreateVideo → SaveVideo).

| Qualität | Auflösung 16:9 | Schritte |
|---|---|---|
| Fast | 832×480 | 12 |
| Balanced | 960×544 | 20 |
| Quality | 1280×704 (nativ) | 30 |

* Ein Segment = 121 Frames bei 24 fps (≈ 5 s) bzw. 81 Frames bei 16 fps.
* **10/15/30 s** entstehen segmentweise: Jedes neue Segment startet mit dem letzten Frame des vorherigen
  (Bild→Video), FFmpeg fügt sie zusammen (doppelter Frame wird entfernt). **Grenzen:** Stil/Identität können
  driften, an den Übergängen sind kleine Bewegungssprünge möglich, Kamerabewegungen setzen nicht exakt fort.
* **Extend Video**: wie oben, ausgehend von einem Video aus deiner Bibliothek.
* **Rechenzeit:** auf einer RTX 4060 mehrere Minuten pro Segment (Fast), deutlich mehr in Quality.
  VELQIN misst die echten Zeiten und zeigt danach realistische Schätzungen.
* **RAM:** das fp16-Modell (10 GB) wird teilweise in den Arbeitsspeicher ausgelagert. Bei 16 GB RAM eine
  große Auslagerungsdatei (≥ 32 GB) einrichten. Alternativ ein GGUF-Q4/Q5-Modell von Wan 2.2 5B verwenden
  (Community-Quantisierung, ComfyUI-GGUF) — dafür müsste der Workflow auf `UnetLoaderGGUF` umgestellt werden.

**FramePack** ist als Video-Backend geprüft, aber nicht eingebaut: es läuft als eigene Gradio-App ohne
stabile API; die Integration über einen ComfyUI-Wrapper ist möglich. Die Adapter-Schnittstelle
(`backend/services/video_studio.py → VIDEO_ADAPTERS`) ist dafür vorbereitet. Siehe `ai/video/README.md`.

## GPU-Koordination

* Es läuft immer nur **ein** Bild-/Videojob gleichzeitig (8 GB VRAM). Weitere Jobs warten in einer fairen Warteschlange
  (Bilder vor langen Videos, abwechselnd zwischen Nutzern; max. Jobs pro Nutzer einstellbar).
* Vor jedem Job entlädt VELQIN die Chatmodelle aus dem VRAM. Chats während eines Jobs laufen auf der **CPU**
  (Admin → System → `chat_during_gpu_job = wait` lässt sie stattdessen warten). Bei Videojobs wird das kleinste Chatmodell genutzt.
* Nach einem Videojob wird ComfyUI angewiesen, den VRAM freizugeben. Nach Bildjobs bleibt SDXL für schnelle
  Folgebilder geladen, bis jemand chattet.
* „Out of memory“: VRAM wird freigegeben und der Job **einmal automatisch** wiederholt.
* Neustart während eines Jobs: der Job wird wieder eingereiht (nicht verworfen).

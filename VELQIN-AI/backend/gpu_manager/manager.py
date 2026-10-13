"""Central GPU resource manager.

The RTX 4060 has 8 GB VRAM, which is not enough to keep a chat model, an image model and a
video model resident at the same time. The manager therefore:

* runs at most ONE ComfyUI generation (image or video) at a time (exclusive "heavy" lease),
* unloads Ollama models before a heavy job starts and asks ComfyUI to free VRAM afterwards,
* tells the chat engine to answer on the CPU (or wait) while the GPU is busy,
* exposes live GPU/VRAM/RAM/CPU statistics (NVML → nvidia-smi → none).
"""
from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass

import psutil

log = logging.getLogger("velqin.gpu")

try:  # NVIDIA Management Library (nvidia-ml-py). Optional.
    import pynvml  # type: ignore

    pynvml.nvmlInit()
    _NVML = True
except Exception:  # noqa: BLE001 - any failure means "no NVML"
    _NVML = False


@dataclass
class HeavyLease:
    job_id: str
    kind: str
    started: float


class GPUManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self.lease: HeavyLease | None = None
        self.last_oom_at: float | None = None
        # True while ComfyUI may still keep image models cached in VRAM after a job.
        self.comfy_holds_vram = False

    # ---- coordination -------------------------------------------------
    @property
    def busy(self) -> bool:
        return self.lease is not None

    @asynccontextmanager
    async def heavy(self, job_id: str, kind: str):
        """Exclusive GPU lease for an image/video job."""
        async with self._lock:
            from services import comfyui, ollama  # local import avoids cycles

            unloaded = await ollama.unload_all()
            if unloaded:
                log.info("Unloaded chat models before %s job: %s", kind, ", ".join(unloaded))
            self.lease = HeavyLease(job_id, kind, time.monotonic())
            try:
                yield
            finally:
                self.lease = None
                if kind == "video":
                    # Video models are huge — always release VRAM so chat gets the GPU back.
                    await comfyui.free_memory(unload_models=True)
                    self.comfy_holds_vram = False
                else:
                    # Keep the image model cached for fast follow-up generations; chat reclaims it on demand.
                    self.comfy_holds_vram = True

    async def reclaim_for_chat(self) -> None:
        """Interactive chat has priority: release ComfyUI's cached models if no job is running."""
        if self.comfy_holds_vram and not self.busy:
            from services import comfyui

            await comfyui.free_memory(unload_models=True)
            self.comfy_holds_vram = False

    def note_oom(self) -> None:
        self.last_oom_at = time.time()

    # ---- statistics -----------------------------------------------------
    def gpu_stats(self) -> list[dict]:
        if _NVML:
            try:
                out = []
                for i in range(pynvml.nvmlDeviceGetCount()):
                    h = pynvml.nvmlDeviceGetHandleByIndex(i)
                    name = pynvml.nvmlDeviceGetName(h)
                    if isinstance(name, bytes):
                        name = name.decode()
                    mem = pynvml.nvmlDeviceGetMemoryInfo(h)
                    util = pynvml.nvmlDeviceGetUtilizationRates(h)
                    try:
                        temp = pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU)
                    except Exception:  # noqa: BLE001
                        temp = None
                    out.append({
                        "index": i, "name": name, "util_percent": util.gpu,
                        "vram_used_mb": int(mem.used / 2**20), "vram_total_mb": int(mem.total / 2**20),
                        "temperature_c": temp,
                    })
                return out
            except Exception as e:  # noqa: BLE001
                log.debug("NVML query failed: %s", e)
        if shutil.which("nvidia-smi"):
            try:
                res = subprocess.run(
                    ["nvidia-smi", "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                     "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=5,
                )
                out = []
                for line in res.stdout.strip().splitlines():
                    idx, name, util, used, total, temp = [x.strip() for x in line.split(",")]
                    out.append({"index": int(idx), "name": name, "util_percent": int(float(util)),
                                "vram_used_mb": int(float(used)), "vram_total_mb": int(float(total)),
                                "temperature_c": int(float(temp)) if temp not in ("", "[N/A]") else None})
                return out
            except Exception as e:  # noqa: BLE001
                log.debug("nvidia-smi failed: %s", e)
        return []

    def system_stats(self) -> dict:
        vm = psutil.virtual_memory()
        from core.config import settings

        disk = psutil.disk_usage(str(settings.data_dir))
        return {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "cpu_count": psutil.cpu_count(),
            "ram_used_mb": int((vm.total - vm.available) / 2**20),
            "ram_total_mb": int(vm.total / 2**20),
            "disk_used_gb": round(disk.used / 2**30, 1),
            "disk_total_gb": round(disk.total / 2**30, 1),
            "disk_free_gb": round(disk.free / 2**30, 1),
            "gpus": self.gpu_stats(),
            "gpu_busy": self.busy,
            "gpu_lease": {"job_id": self.lease.job_id, "kind": self.lease.kind,
                          "seconds": int(time.monotonic() - self.lease.started)} if self.lease else None,
            "last_oom_at": self.last_oom_at,
        }


gpu = GPUManager()

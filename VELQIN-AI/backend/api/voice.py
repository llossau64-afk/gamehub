"""VELQIN Voice: local speech-to-text with faster-whisper (optional dependency)."""
from __future__ import annotations

import asyncio
import importlib.util
import logging
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth.deps import require_feature
from core.config import settings
from models import User

log = logging.getLogger("velqin.voice")
router = APIRouter(prefix="/api/voice", tags=["voice"])

_model = None
_lock = asyncio.Lock()


def available() -> bool:
    return importlib.util.find_spec("faster_whisper") is not None


async def _get_model():
    global _model
    async with _lock:
        if _model is None:
            from faster_whisper import WhisperModel  # type: ignore

            compute = "int8" if settings.whisper_device == "cpu" else "float16"
            _model = await asyncio.to_thread(WhisperModel, settings.whisper_model, device=settings.whisper_device,
                                             compute_type=compute)
        return _model


@router.get("/status")
async def voice_status(user: User = Depends(require_feature("voice"))):
    return {"stt": available(), "model": settings.whisper_model if available() else None}


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user: User = Depends(require_feature("voice"))):
    if not available():
        raise HTTPException(503, "Voice input is not installed on the server (pip install faster-whisper).")
    data = await file.read(25 * 2**20 + 1)
    if len(data) > 25 * 2**20:
        raise HTTPException(413, "Recording too long.")
    if len(data) < 500:
        raise HTTPException(422, "Recording is empty.")
    path = settings.tmp_dir / f"voice_{secrets.token_hex(6)}"
    path.write_bytes(data)
    try:
        model = await _get_model()

        def _run():
            segments, info = model.transcribe(str(path), vad_filter=True, beam_size=1)
            return " ".join(s.text.strip() for s in segments).strip(), info.language

        text, lang = await asyncio.to_thread(_run)
    except Exception as e:  # noqa: BLE001
        log.warning("Transcription failed: %s", type(e).__name__)
        raise HTTPException(422, "The recording could not be transcribed.") from e
    finally:
        path.unlink(missing_ok=True)
    return {"text": text, "language": lang}

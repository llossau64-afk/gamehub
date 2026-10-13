"""VELQIN model profiles, installation status and the VELQIN Auto router."""
from __future__ import annotations

import re
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AIModelProfile
from services import ollama, plans

# Defaults chosen for an RTX 4060 (8 GB VRAM) / 16 GB RAM. All Apache-2.0 licensed.
# Tags can be changed by the owner in the model library at any time.
DEFAULT_PROFILES: list[dict] = [
    dict(id="swift", name="VELQIN Swift", tagline="Fast everyday answers, short questions and summaries.",
         ollama_tag="qwen3:4b", role="chat", thinking=True, context_length=8192, temperature=0.7,
         min_plan="free", sort=10, size_hint_gb=2.6, license="Apache-2.0"),
    dict(id="core", name="VELQIN Core", tagline="Detailed answers, writing and complex tasks.",
         ollama_tag="qwen3:8b", role="chat", thinking=True, context_length=8192, temperature=0.7,
         min_plan="free", sort=20, size_hint_gb=5.2, license="Apache-2.0"),
    dict(id="vision", name="VELQIN Vision", tagline="Understands images, screenshots and scanned documents.",
         ollama_tag="qwen3-vl:4b", role="vision", vision=True, thinking=False, context_length=8192,
         temperature=0.6, min_plan="creator", sort=30, size_hint_gb=3.3, license="Apache-2.0"),
    dict(id="code", name="VELQIN Code", tagline="Programming, debugging and code explanations.",
         ollama_tag="qwen2.5-coder:7b", role="code", thinking=False, context_length=8192,
         temperature=0.3, min_plan="creator", sort=40, size_hint_gb=4.7, license="Apache-2.0"),
    dict(id="embed", name="VELQIN Embeddings", tagline="Local embeddings for project & file search (RAG).",
         ollama_tag="nomic-embed-text", role="embed", thinking=False, context_length=2048,
         temperature=0.0, min_plan="free", sort=90, size_hint_gb=0.3, license="Apache-2.0"),
]

# Extra suggestions shown in the model library ("Recommended for your hardware").
CATALOG: list[dict] = [
    {"tag": "qwen3:4b", "size_gb": 2.6, "vram_gb": 4, "use": "Fast chat (VELQIN Swift)", "license": "Apache-2.0", "fits_8gb": True},
    {"tag": "qwen3:8b", "size_gb": 5.2, "vram_gb": 6.5, "use": "Detailed chat (VELQIN Core)", "license": "Apache-2.0", "fits_8gb": True},
    {"tag": "qwen3-vl:4b", "size_gb": 3.3, "vram_gb": 5, "use": "Vision (VELQIN Vision)", "license": "Apache-2.0", "fits_8gb": True},
    {"tag": "qwen3-vl:2b", "size_gb": 1.9, "vram_gb": 3, "use": "Lighter vision model", "license": "Apache-2.0", "fits_8gb": True},
    {"tag": "qwen2.5-coder:7b", "size_gb": 4.7, "vram_gb": 6, "use": "Coding (VELQIN Code)", "license": "Apache-2.0", "fits_8gb": True},
    {"tag": "qwen2.5-coder:3b", "size_gb": 1.9, "vram_gb": 3, "use": "Lighter coding model", "license": "Qwen Research (non-commercial)", "fits_8gb": True},
    {"tag": "nomic-embed-text", "size_gb": 0.27, "vram_gb": 0.5, "use": "Embeddings for projects/RAG", "license": "Apache-2.0", "fits_8gb": True},
    {"tag": "gemma3:4b", "size_gb": 3.3, "vram_gb": 5, "use": "Alternative chat + vision", "license": "Gemma Terms of Use", "fits_8gb": True},
    {"tag": "llama3.2:3b", "size_gb": 2.0, "vram_gb": 3, "use": "Small alternative chat model", "license": "Llama 3.2 Community License", "fits_8gb": True},
    {"tag": "qwen3:14b", "size_gb": 9.3, "vram_gb": 11, "use": "Larger chat (partly on CPU, slow)", "license": "Apache-2.0", "fits_8gb": False},
]

_status_cache: dict = {"t": 0.0, "installed": None, "online": False}


async def seed_profiles(db: AsyncSession) -> None:
    existing = {p.id for p in (await db.execute(select(AIModelProfile))).scalars()}
    for d in DEFAULT_PROFILES:
        if d["id"] not in existing:
            db.add(AIModelProfile(builtin=True, **d))
    await db.commit()


def _norm(tag: str) -> str:
    return tag if ":" in tag else f"{tag}:latest"


async def installed_tags(force: bool = False) -> tuple[bool, dict[str, dict]]:
    """Return (ollama_online, {normalized_tag: info}). Cached for a few seconds."""
    now = time.monotonic()
    if not force and _status_cache["installed"] is not None and now - _status_cache["t"] < 5:
        return _status_cache["online"], _status_cache["installed"]
    try:
        models = await ollama.list_installed()
        installed = {_norm(m["name"]): m for m in models}
        online = True
    except ollama.OllamaError:
        installed, online = {}, False
    _status_cache.update(t=now, installed=installed, online=online)
    return online, installed


def invalidate_cache() -> None:
    _status_cache["installed"] = None


async def profiles_with_status(db: AsyncSession, user=None, include_disabled: bool = False) -> list[dict]:
    online, installed = await installed_tags()
    running = {_norm(m.get("name", "")) for m in (await ollama.list_running() if online else [])}
    rows = (await db.execute(select(AIModelProfile).order_by(AIModelProfile.sort))).scalars().all()
    out = []
    for p in rows:
        if not p.enabled and not include_disabled:
            continue
        tag = _norm(p.ollama_tag)
        info = installed.get(tag)
        allowed = True if user is None else plans.can_use_plan_level(user, p.min_plan)
        out.append({
            "id": p.id, "name": p.name, "tagline": p.tagline, "ollama_tag": p.ollama_tag, "role": p.role,
            "vision": p.vision, "thinking": p.thinking, "context_length": p.context_length,
            "temperature": p.temperature, "min_plan": p.min_plan, "enabled": p.enabled, "builtin": p.builtin,
            "size_hint_gb": p.size_hint_gb, "license": p.license,
            "installed": info is not None,
            "size_bytes": info.get("size") if info else None,
            "loaded": tag in running,
            "allowed": allowed,
            "runtime_online": online,
        })
    return out


_CODE_HINTS = re.compile(
    r"```|\b(def |class |function\b|const |let |import |#include|public static|console\.log|traceback|stack ?trace|"
    r"exception|syntax ?error|compile|debug|bug|refactor|regex|sql|python|javascript|typescript|java\b|c\+\+|c#|rust|golang|"
    r"html|css|react|api|endpoint|json|bash|powershell|programm|skript|script|code|fehlermeldung|unity|godot)",
    re.IGNORECASE,
)
_COMPLEX_HINTS = re.compile(
    r"\b(explain in detail|in detail|step by step|essay|analy[sz]e|compare|pros and cons|strategy|plan|write a|story|"
    r"report|ausführlich|erkläre|erklär|vergleiche|analysiere|schreibe|aufsatz|geschichte|bericht|strategie|warum|why)\b",
    re.IGNORECASE,
)


def classify_request(text: str, has_images: bool) -> str:
    """Pick the ideal profile role for a request: vision | code | core | swift."""
    if has_images:
        return "vision"
    if _CODE_HINTS.search(text):
        return "code"
    if len(text) > 350 or _COMPLEX_HINTS.search(text):
        return "core"
    return "swift"


AUTO_PREFERENCE = {
    "vision": ["vision"],
    "code": ["code", "core", "swift"],
    "core": ["core", "swift"],
    "swift": ["swift", "core"],
}


async def resolve_profile(
    db: AsyncSession, user, requested: str, text: str, has_images: bool
) -> tuple[AIModelProfile | None, str | None, str]:
    """Resolve the profile to use. Returns (profile, notice, routed_reason)."""
    online, installed = await installed_tags()
    rows = (await db.execute(select(AIModelProfile).where(AIModelProfile.enabled.is_(True)))).scalars().all()
    usable = {
        p.id: p for p in rows
        if p.role != "embed" and _norm(p.ollama_tag) in installed and plans.can_use_plan_level(user, p.min_plan)
    }
    if not online:
        return None, "The local AI runtime (Ollama) is offline.", ""

    if requested and requested != "auto":
        prof = usable.get(requested)
        if prof is None:
            all_p = next((p for p in rows if p.id == requested), None)
            if all_p is None:
                return None, "This model does not exist or is disabled.", ""
            if not plans.can_use_plan_level(user, all_p.min_plan):
                return None, f"{all_p.name} is not included in your access group.", ""
            return None, f"{all_p.name} is not installed yet ({all_p.ollama_tag}). Download it in the model library.", ""
        if has_images and not prof.vision:
            vis = next((p for p in usable.values() if p.vision), None)
            if vis:
                return vis, f"{prof.name} can't see images — switched to {vis.name} for this message.", "images"
            return None, "Images were attached but no vision model is installed (e.g. qwen3-vl:4b).", ""
        return prof, None, "manual"

    role = classify_request(text, has_images)
    ordered = sorted(usable.values(), key=lambda p: p.sort)
    for wanted in AUTO_PREFERENCE[role]:
        for p in ordered:
            if p.id == wanted or (p.role == wanted and wanted in ("vision", "code")):
                return p, None, role
    if has_images:
        vis = next((p for p in ordered if p.vision), None)
        if vis:
            return vis, None, "vision"
        return None, "Images were attached but no vision model is installed (e.g. qwen3-vl:4b).", ""
    if ordered:
        return ordered[0], None, role
    return None, "No chat model is installed yet. Open the model library and download VELQIN Swift (qwen3:4b).", ""


async def embed_profile(db: AsyncSession) -> AIModelProfile | None:
    online, installed = await installed_tags()
    if not online:
        return None
    rows = (await db.execute(select(AIModelProfile).where(AIModelProfile.role == "embed",
                                                           AIModelProfile.enabled.is_(True)))).scalars().all()
    for p in rows:
        if _norm(p.ollama_tag) in installed:
            return p
    return None


async def smallest_installed_chat(db: AsyncSession) -> AIModelProfile | None:
    online, installed = await installed_tags()
    rows = (await db.execute(select(AIModelProfile).where(AIModelProfile.enabled.is_(True)))).scalars().all()
    cands = [p for p in rows if p.role in ("chat", "code") and _norm(p.ollama_tag) in installed]
    if not cands:
        return None
    return min(cands, key=lambda p: installed[_norm(p.ollama_tag)].get("size", 1e18))

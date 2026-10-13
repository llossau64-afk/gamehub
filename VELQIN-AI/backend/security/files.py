"""Safe file handling: type detection by magic bytes, path confinement, filename sanitizing."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from core.config import settings

# kind, canonical mime, allowed extensions
ALLOWED_TYPES: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "pdf": ("document", "application/pdf", (".pdf",)),
    "docx": ("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", (".docx",)),
    "txt": ("document", "text/plain", (".txt", ".log")),
    "md": ("document", "text/markdown", (".md", ".markdown")),
    "csv": ("document", "text/csv", (".csv",)),
    "code": ("document", "text/plain", (".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".html", ".css",
                                         ".java", ".c", ".cpp", ".h", ".cs", ".go", ".rs", ".rb", ".php",
                                         ".sh", ".bat", ".ps1", ".yaml", ".yml", ".toml", ".xml", ".sql", ".lua", ".gd")),
    "png": ("image", "image/png", (".png",)),
    "jpg": ("image", "image/jpeg", (".jpg", ".jpeg")),
    "webp": ("image", "image/webp", (".webp",)),
}


def sniff_type(head: bytes, filename: str) -> tuple[str, str, str] | None:
    """Return (type_key, kind, mime) if the content matches an allowed type, else None."""
    ext = Path(filename).suffix.lower()
    if head.startswith(b"%PDF-"):
        return ("pdf", *ALLOWED_TYPES["pdf"][:2]) if ext == ".pdf" else None
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ("png", *ALLOWED_TYPES["png"][:2]) if ext == ".png" else None
    if head.startswith(b"\xff\xd8\xff"):
        return ("jpg", *ALLOWED_TYPES["jpg"][:2]) if ext in (".jpg", ".jpeg") else None
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ("webp", *ALLOWED_TYPES["webp"][:2]) if ext == ".webp" else None
    if head.startswith(b"PK\x03\x04"):
        return ("docx", *ALLOWED_TYPES["docx"][:2]) if ext == ".docx" else None
    # Plain text types: must decode as UTF-8 (or UTF-16 BOM) and contain no NUL bytes.
    if b"\x00" in head and not head.startswith((b"\xff\xfe", b"\xfe\xff")):
        return None
    try:
        head.decode("utf-8")
    except UnicodeDecodeError as e:
        # The sample may cut a multi-byte char at the end; accept if the error is only at the tail.
        if e.start < len(head) - 4 and not head.startswith((b"\xff\xfe", b"\xfe\xff")):
            return None
    for key in ("txt", "md", "csv", "code"):
        kind, mime, exts = ALLOWED_TYPES[key]
        if ext in exts:
            return key, kind, mime
    return None


def sanitize_filename(name: str) -> str:
    name = unicodedata.normalize("NFKC", name or "file")
    name = name.replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^\w.\- ()\[\]]+", "_", name).strip(" .")
    return (name or "file")[:200]


def user_dir(user_id: str, *parts: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_\-]{1,32}", user_id):
        raise ValueError("invalid user id")
    p = settings.uploads_dir / user_id
    for part in parts:
        p = p / part
    p.mkdir(parents=True, exist_ok=True)
    return p


def resolve_storage_path(relative: str) -> Path:
    """Resolve a stored relative path and make sure it stays inside the data directory."""
    base = settings.data_dir.resolve()
    target = (base / relative).resolve()
    if not target.is_relative_to(base):
        raise PermissionError("Path escapes storage directory")
    return target


def to_relative(path: Path) -> str:
    return path.resolve().relative_to(settings.data_dir.resolve()).as_posix()

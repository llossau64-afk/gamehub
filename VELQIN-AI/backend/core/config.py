"""Central configuration. Values come from environment variables or the project-level .env file."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env",),
        env_prefix="VELQIN_",
        extra="ignore",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8080
    environment: str = "production"  # "production" | "development" | "test"
    # Comma separated list of origins allowed for the Next.js dev server (development only).
    dev_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # "auto" = Secure cookie when the request arrived over HTTPS (directly or via a trusted proxy).
    cookie_secure: str = "auto"
    # Set to true only when running behind a reverse proxy you control (Caddy, Tailscale Serve).
    trust_proxy_headers: bool = False
    session_days: int = 30
    # Extra origins allowed for state-changing requests (e.g. https://my-pc.tailnet.ts.net behind a proxy
    # that rewrites the Host header). Comma separated.
    allowed_origins: str = ""

    # Storage
    data_dir: Path = PROJECT_ROOT / "storage"
    database_url: str = ""  # default: sqlite file inside data_dir
    frontend_dist: Path = PROJECT_ROOT / "frontend" / "out"

    # Local AI services (keep them bound to 127.0.0.1 — never expose them publicly)
    ollama_url: str = "http://127.0.0.1:11434"
    comfyui_url: str = "http://127.0.0.1:8188"
    searxng_url: str = "http://127.0.0.1:8888"
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"

    # Limits
    max_upload_mb: int = 25
    login_attempts_per_15min: int = 10

    # Bootstrap owner account (optional; alternatively use the /setup page on first start)
    owner_username: str = ""
    owner_password: str = ""

    # Voice (optional faster-whisper)
    whisper_model: str = "small"
    whisper_device: str = "cpu"

    log_level: str = "INFO"

    secret_pepper: str = Field(default="", description="Optional extra secret mixed into token hashes.")

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{(self.data_dir / 'velqin.db').as_posix()}"

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "users"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.uploads_dir, self.logs_dir, self.backups_dir, self.tmp_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir = Path(s.data_dir).resolve()
    s.ensure_dirs()
    return s


settings = get_settings()

"""Start the VELQIN server with the host/port from .env (used by start-velqin.bat / start-velqin.sh)."""
import uvicorn

from core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        proxy_headers=settings.trust_proxy_headers,
        forwarded_allow_ips="*" if settings.trust_proxy_headers else "127.0.0.1",
        timeout_keep_alive=30,
        log_level=settings.log_level.lower(),
    )

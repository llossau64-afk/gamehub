"""Security middlewares: CSRF protection for state-changing API calls and strict response headers."""
from __future__ import annotations

from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.config import settings

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-velqin-request"

CSP = (
    "default-src 'self'; "
    "img-src 'self' data: blob:; "
    "media-src 'self' blob:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-inline'; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "worker-src 'self'; "
    "manifest-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)


class CSRFMiddleware(BaseHTTPMiddleware):
    """Every unsafe /api request must carry the custom header (forces a CORS preflight for
    cross-site attackers, which we never approve) and, if an Origin is sent, it must match the host."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api/") and request.method not in SAFE_METHODS:
            if request.headers.get(CSRF_HEADER) != "1":
                return JSONResponse({"detail": "Missing CSRF header."}, status_code=403)
            origin = request.headers.get("origin")
            if origin and origin != "null":
                origin_host = urlparse(origin).netloc
                host = request.headers.get("host", "")
                fwd_host = request.headers.get("x-forwarded-host", "") if settings.trust_proxy_headers else ""
                allowed_dev = settings.is_dev and origin in settings.dev_origins.split(",")
                if origin_host not in (host, fwd_host) and not allowed_dev:
                    return JSONResponse({"detail": "Cross-origin request blocked."}, status_code=403)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("Referrer-Policy", "same-origin")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
        if not request.url.path.startswith("/api/"):
            h.setdefault("Content-Security-Policy", CSP)
        else:
            h.setdefault("Cache-Control", "no-store")
        return response

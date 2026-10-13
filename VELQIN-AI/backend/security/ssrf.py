"""Safe outbound HTTP fetching for web search: blocks internal networks (SSRF), limits size,
re-validates every redirect and only accepts text/html-like content."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

MAX_BYTES = 2_000_000
MAX_REDIRECTS = 4
USER_AGENT = "Mozilla/5.0 (compatible; VELQIN-AI/1.0; private research assistant)"


class BlockedURL(Exception):
    pass


def _ip_is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return not (
        addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast
        or addr.is_reserved or addr.is_unspecified or (hasattr(addr, "is_site_local") and addr.is_site_local)
        or ip.startswith("100.64.") or addr in ipaddress.ip_network("100.64.0.0/10")
    )


async def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise BlockedURL("Only http(s) URLs are allowed")
    if not parsed.hostname:
        raise BlockedURL("URL has no host")
    if parsed.username or parsed.password:
        raise BlockedURL("Credentials in URLs are not allowed")
    if parsed.port not in (None, 80, 443, 8080, 8443):
        raise BlockedURL("Unusual port blocked")
    host = parsed.hostname
    if host.lower() in ("localhost",) or host.lower().endswith((".local", ".internal", ".lan", ".home")):
        raise BlockedURL("Internal host blocked")
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80),
                                       type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise BlockedURL(f"DNS lookup failed: {e}") from e
    for info in infos:
        if not _ip_is_public(info[4][0]):
            raise BlockedURL("URL resolves to a non-public address")
    return url


async def safe_fetch(url: str, timeout: float = 10.0) -> tuple[str, str, str]:
    """Fetch a public web page. Returns (final_url, content_type, text)."""
    current = url
    async with httpx.AsyncClient(
        follow_redirects=False, timeout=timeout, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain;q=0.9,*/*;q=0.5"}
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            await validate_url(current)
            async with client.stream("GET", current) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    loc = resp.headers.get("location")
                    if not loc:
                        raise BlockedURL("Redirect without location")
                    current = urljoin(current, loc)
                    continue
                if resp.status_code >= 400:
                    raise BlockedURL(f"HTTP {resp.status_code}")
                ctype = resp.headers.get("content-type", "").lower()
                if not any(t in ctype for t in ("text/html", "text/plain", "application/xhtml", "application/xml", "text/xml")):
                    raise BlockedURL(f"Unsupported content type {ctype or 'unknown'}")
                chunks: list[bytes] = []
                size = 0
                async for chunk in resp.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        break
                    chunks.append(chunk)
                raw = b"".join(chunks)
                encoding = resp.charset_encoding or "utf-8"
                try:
                    text = raw.decode(encoding, errors="replace")
                except LookupError:
                    text = raw.decode("utf-8", errors="replace")
                return current, ctype, text
    raise BlockedURL("Too many redirects")

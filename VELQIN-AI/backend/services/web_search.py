"""Real web research via a self-hosted SearXNG instance + safe page fetching and text extraction."""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from core.config import settings
from security.ssrf import BlockedURL, safe_fetch

log = logging.getLogger("velqin.search")

_TIME_WORDS = re.compile(
    r"\b(today|tonight|yesterday|latest|current|currently|now|this week|news|live|score|result|"
    r"heute|gestern|aktuell|aktuelle|neueste|jetzt|diese woche|nachrichten|ergebnis|ergebnisse|spieltag|stand)\b",
    re.IGNORECASE,
)


class SearchUnavailable(Exception):
    pass


@dataclass
class Source:
    index: int
    title: str
    url: str
    snippet: str
    published: str | None = None
    engine: str | None = None
    content: str = ""
    fetched: bool = False
    extra: dict = field(default_factory=dict)

    def public(self) -> dict:
        return {"index": self.index, "title": self.title, "url": self.url, "domain": urlparse(self.url).netloc,
                "published": self.published, "snippet": self.snippet[:300], "fetched": self.fetched, "kind": "web"}


def is_time_sensitive(text: str) -> bool:
    return bool(_TIME_WORDS.search(text))


async def searxng_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{settings.searxng_url}/healthz")
            if r.status_code == 200:
                return True
            r = await c.get(f"{settings.searxng_url}/")
            return r.status_code < 500
    except httpx.HTTPError:
        return False


async def _searx(query: str, *, categories: str = "general", time_range: str | None = None,
                 language: str = "auto") -> list[dict]:
    params = {"q": query, "format": "json", "categories": categories, "language": language, "safesearch": 1}
    if time_range:
        params["time_range"] = time_range
    try:
        async with httpx.AsyncClient(timeout=12.0) as c:
            r = await c.get(f"{settings.searxng_url}/search", params=params)
    except httpx.HTTPError as e:
        raise SearchUnavailable("The search service (SearXNG) is not reachable.") from e
    if r.status_code == 403:
        raise SearchUnavailable("SearXNG refuses JSON output — enable the 'json' format in its settings.yml.")
    if r.status_code >= 400:
        raise SearchUnavailable(f"SearXNG returned HTTP {r.status_code}.")
    try:
        return r.json().get("results", [])
    except ValueError as e:
        raise SearchUnavailable("SearXNG returned an invalid response.") from e


def _clean_query(text: str) -> str:
    q = re.sub(r"\s+", " ", text).strip()
    q = re.sub(r"^(bitte |please |can you |kannst du |could you )", "", q, flags=re.IGNORECASE)
    return q[:300]


async def search(text: str, max_results: int = 8) -> list[Source]:
    query = _clean_query(text)
    tasks = [_searx(query)]
    if is_time_sensitive(text):
        tasks.append(_searx(query, categories="news", time_range="week"))
    results_lists = await asyncio.gather(*tasks, return_exceptions=True)
    errors = [r for r in results_lists if isinstance(r, Exception)]
    if len(errors) == len(results_lists):
        raise errors[0] if isinstance(errors[0], SearchUnavailable) else SearchUnavailable(str(errors[0]))
    merged: list[dict] = []
    seen: set[str] = set()
    # interleave news first for time-sensitive questions
    lists = [r for r in results_lists if not isinstance(r, Exception)]
    if len(lists) == 2:
        lists = [lists[1], lists[0]]
    for i in range(max(len(x) for x in lists) if lists else 0):
        for lst in lists:
            if i < len(lst):
                res = lst[i]
                url = res.get("url") or ""
                key = url.split("#")[0].rstrip("/")
                if not url.startswith(("http://", "https://")) or key in seen:
                    continue
                seen.add(key)
                merged.append(res)
    sources = []
    for i, res in enumerate(merged[:max_results]):
        sources.append(Source(
            index=i + 1, title=(res.get("title") or res.get("url"))[:200], url=res["url"],
            snippet=(res.get("content") or "")[:600], published=_norm_date(res.get("publishedDate")),
            engine=res.get("engine"),
        ))
    return sources


def _norm_date(value) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return str(value)[:25]


def extract_main_text(html: str, max_chars: int = 4000) -> tuple[str, str | None]:
    """Return (readable text, published date if found)."""
    soup = BeautifulSoup(html, "lxml")
    published = None
    for attr, name in (("property", "article:published_time"), ("name", "date"), ("name", "pubdate"),
                       ("itemprop", "datePublished"), ("name", "publish-date"), ("property", "og:updated_time")):
        tag = soup.find("meta", attrs={attr: name})
        if tag and tag.get("content"):
            published = _norm_date(tag["content"])
            break
    if not published:
        t = soup.find("time", attrs={"datetime": True})
        if t:
            published = _norm_date(t["datetime"])
    for tag in soup(["script", "style", "noscript", "svg", "nav", "footer", "header", "aside", "form", "iframe", "button"]):
        tag.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    blocks = []
    for el in root.find_all(["h1", "h2", "h3", "p", "li", "td", "th", "blockquote", "pre"]):
        txt = el.get_text(" ", strip=True)
        if len(txt) >= 25 or el.name in ("h1", "h2", "h3", "td", "th"):
            blocks.append(txt)
    text = "\n".join(blocks) if blocks else root.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:max_chars], published


async def enrich(sources: list[Source], pages: int = 4, per_page_chars: int = 3500) -> None:
    """Fetch and extract the top pages in parallel (SSRF-safe). Failures keep the search snippet."""

    async def _one(src: Source) -> None:
        try:
            final_url, ctype, body = await asyncio.wait_for(safe_fetch(src.url), timeout=12)
            if "html" in ctype or "xml" in ctype:
                text, published = extract_main_text(body, per_page_chars)
            else:
                text, published = body[:per_page_chars], None
            if len(text) > 200:
                src.content = text
                src.fetched = True
            if published and not src.published:
                src.published = published
        except (BlockedURL, asyncio.TimeoutError, httpx.HTTPError) as e:
            log.info("Page fetch skipped for %s: %s", urlparse(src.url).netloc, type(e).__name__)
        except Exception as e:  # noqa: BLE001 — never let a hostile page break the chat
            log.info("Page parse failed for %s: %s", urlparse(src.url).netloc, type(e).__name__)

    await asyncio.gather(*[_one(s) for s in sources[:pages]])


def build_context(sources: list[Source]) -> str:
    parts = []
    for s in sources:
        body = s.content if s.fetched else s.snippet
        if not body:
            continue
        date = f" | published: {s.published}" if s.published else ""
        parts.append(f"[{s.index}] {s.title}\nURL: {s.url}{date}\n{body}")
    return "\n\n---\n\n".join(parts)

"""Local retrieval (RAG): chunks + Ollama embeddings stored in the DB, cosine similarity in NumPy.
Falls back to keyword scoring when no embedding model is installed."""
from __future__ import annotations

import logging
import math
import re
from collections import Counter

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Attachment, DocumentChunk
from services import model_registry, ollama
from services.documents import chunk_text

log = logging.getLogger("velqin.rag")


async def index_attachment(db: AsyncSession, att: Attachment, text: str) -> None:
    await db.execute(delete(DocumentChunk).where(DocumentChunk.attachment_id == att.id))
    chunks = chunk_text(text)
    if not chunks:
        att.indexed = True
        await db.commit()
        return
    vectors: list[list[float]] | None = None
    prof = await model_registry.embed_profile(db)
    if prof is not None:
        try:
            vectors = []
            for i in range(0, len(chunks), 32):
                vectors.extend(await ollama.embed(prof.ollama_tag, chunks[i:i + 32]))
        except ollama.OllamaError as e:
            log.warning("Embedding failed, using keyword search for this file: %s", e)
            vectors = None
    for i, c in enumerate(chunks):
        emb = None
        if vectors and i < len(vectors):
            emb = np.asarray(vectors[i], dtype=np.float32).tobytes()
        db.add(DocumentChunk(attachment_id=att.id, user_id=att.user_id, project_id=att.project_id, position=i,
                             text=c, embedding=emb, embed_model=prof.ollama_tag if emb else None))
    att.indexed = True
    await db.commit()


_WORD = re.compile(r"\w{2,}", re.UNICODE)


def _keyword_scores(query: str, texts: list[str]) -> list[float]:
    q = Counter(w.lower() for w in _WORD.findall(query))
    if not q:
        return [0.0] * len(texts)
    n = len(texts)
    df: Counter = Counter()
    toks = []
    for t in texts:
        words = Counter(w.lower() for w in _WORD.findall(t))
        toks.append(words)
        for w in q:
            if w in words:
                df[w] += 1
    scores = []
    for words in toks:
        length = sum(words.values()) or 1
        s = 0.0
        for w in q:
            if words.get(w):
                idf = math.log(1 + n / (1 + df[w]))
                s += (words[w] / length) ** 0.5 * idf
        scores.append(s)
    return scores


async def retrieve(db: AsyncSession, user_id: str, query: str, *, project_id: str | None = None,
                   attachment_ids: list[str] | None = None, k: int = 6) -> list[tuple[DocumentChunk, float]]:
    stmt = select(DocumentChunk).where(DocumentChunk.user_id == user_id)
    if attachment_ids is not None and project_id is not None:
        stmt = stmt.where((DocumentChunk.project_id == project_id) | (DocumentChunk.attachment_id.in_(attachment_ids)))
    elif attachment_ids is not None:
        stmt = stmt.where(DocumentChunk.attachment_id.in_(attachment_ids))
    elif project_id is not None:
        stmt = stmt.where(DocumentChunk.project_id == project_id)
    else:
        return []
    chunks = (await db.execute(stmt)).scalars().all()
    if not chunks:
        return []

    prof = await model_registry.embed_profile(db)
    with_emb = [c for c in chunks if c.embedding is not None and prof and c.embed_model == prof.ollama_tag]
    scored: list[tuple[DocumentChunk, float]] = []
    if prof and with_emb:
        try:
            qv = np.asarray((await ollama.embed(prof.ollama_tag, [query]))[0], dtype=np.float32)
            mat = np.stack([np.frombuffer(c.embedding, dtype=np.float32) for c in with_emb])
            sims = mat @ qv / (np.linalg.norm(mat, axis=1) * (np.linalg.norm(qv) or 1.0) + 1e-9)
            scored = list(zip(with_emb, sims.tolist()))
        except (ollama.OllamaError, ValueError, IndexError) as e:
            log.warning("Embedding retrieval failed, using keywords: %s", e)
            scored = []
    rest = [c for c in chunks if c not in with_emb] if scored else chunks
    if rest:
        kw = _keyword_scores(query, [c.text for c in rest])
        top = max(kw) or 1.0
        # map keyword scores into a comparable 0..0.6 range
        scored += [(c, 0.6 * s / top) for c, s in zip(rest, kw)]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:k]

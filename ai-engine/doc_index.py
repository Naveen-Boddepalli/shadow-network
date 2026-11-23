# Per-document retrieval index: section-aware chunks plus one int8-model vector
# per chunk, built once and reused by every summary and question.
#
# Keyed by IPFS CID. A CID names exact content, so an index can never go stale
# and two notes that share a file share one index. Stored in MongoDB (Render's
# free tier has an ephemeral disk) with an in-process LRU in front, so a warm
# question costs one query embedding and one LLM call: no IPFS fetch, no PDF
# parsing, no re-embedding.

import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np
from bson.binary import Binary
from pymongo.errors import DocumentTooLarge, PyMongoError

import embeddings
from extractor import chunk_document, chunk_search_text
from retrieval import Bm25

# Bump when chunking or the embedding model changes so old indexes are rebuilt.
INDEX_VERSION = 1
COLLECTION = "doc_chunks"
# Bounds work and the MongoDB document (16 MB) for very large files: ~300k characters.
MAX_CHUNKS = 300
LRU_SIZE = 24


@dataclass
class DocIndex:
    cid: str
    chunks: list[dict]          # [{section, text}]
    vectors: np.ndarray         # (n, 384) float32 unit vectors
    word_count: int
    truncated: bool = False
    _bm25: Bm25 | None = field(default=None, repr=False)

    @property
    def bm25(self) -> Bm25:
        if self._bm25 is None:
            self._bm25 = Bm25([chunk_search_text(c) for c in self.chunks])
        return self._bm25


_cache: "OrderedDict[str, DocIndex]" = OrderedDict()
_cache_lock = threading.Lock()
_build_locks: dict[str, threading.Lock] = {}


def _remember(index: DocIndex) -> DocIndex:
    with _cache_lock:
        _cache[index.cid] = index
        _cache.move_to_end(index.cid)
        while len(_cache) > LRU_SIZE:
            _cache.popitem(last=False)
    return index


def _collection():
    col = embeddings.get_db()[COLLECTION]
    return col


def build(cid: str, text: str) -> DocIndex:
    """Chunk and embed extracted text. CPU-bound; call from a worker thread."""
    started = time.perf_counter()
    chunks = chunk_document(text) or [{"section": "", "text": text.strip()[:2000]}]
    truncated = len(chunks) > MAX_CHUNKS
    chunks = chunks[:MAX_CHUNKS]
    vectors = embeddings.embed_texts([chunk_search_text(c) for c in chunks])
    print(f"Indexed {cid}: {len(chunks)} chunks in {time.perf_counter() - started:.1f}s")
    return DocIndex(cid=cid, chunks=chunks, vectors=vectors, word_count=len(text.split()), truncated=truncated)


def _save(index: DocIndex) -> None:
    """Persist an index; a database problem only costs a rebuild later."""
    try:
        _collection().replace_one(
            {"_id": index.cid},
            {
                "_id":        index.cid,
                "version":    INDEX_VERSION,
                "model":      embeddings.MODEL_REPO,
                "dims":       embeddings.EMBEDDING_DIM,
                "chunks":     index.chunks,
                # 4 bytes a dimension instead of ~20 as a BSON double array.
                "vectors":    Binary(index.vectors.astype(np.float32).tobytes()),
                "word_count": index.word_count,
                "truncated":  index.truncated,
                "built_at":   datetime.now(timezone.utc),
            },
            upsert=True,
        )
    except (embeddings.VectorStoreError, PyMongoError, DocumentTooLarge) as e:
        print(f"Index for {index.cid} not persisted: {e}")


def _load(cid: str) -> DocIndex | None:
    try:
        doc = _collection().find_one({"_id": cid})
    except (embeddings.VectorStoreError, PyMongoError):
        return None
    if not doc or doc.get("version") != INDEX_VERSION or doc.get("model") != embeddings.MODEL_REPO:
        return None
    vectors = np.frombuffer(doc["vectors"], dtype=np.float32).reshape(-1, doc["dims"])
    return DocIndex(
        cid=cid,
        chunks=doc["chunks"],
        vectors=vectors,
        word_count=doc.get("word_count", 0),
        truncated=doc.get("truncated", False),
    )


def get_cached(cid: str) -> DocIndex | None:
    """From memory or MongoDB, without building. Blocking; call from a worker thread."""
    with _cache_lock:
        index = _cache.get(cid)
        if index is not None:
            _cache.move_to_end(cid)
            return index
    index = _load(cid)
    return _remember(index) if index is not None else None


def get_or_build(cid: str, load_text) -> DocIndex:
    """
    The index for a CID, building it with `load_text()` (which returns the
    document's extracted text) only if it is not cached anywhere. Concurrent
    requests for the same new document build it once.
    """
    index = get_cached(cid)
    if index is not None:
        return index
    with _cache_lock:
        lock = _build_locks.setdefault(cid, threading.Lock())
    with lock:
        index = get_cached(cid)
        if index is None:
            index = build(cid, load_text())
            _save(index)
            _remember(index)
    with _cache_lock:
        _build_locks.pop(cid, None)
    return index


def remove(cid: str) -> bool:
    with _cache_lock:
        _cache.pop(cid, None)
    try:
        return _collection().delete_one({"_id": cid}).deleted_count > 0
    except (embeddings.VectorStoreError, PyMongoError):
        return False

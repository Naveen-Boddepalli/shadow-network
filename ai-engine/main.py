# FastAPI AI engine: retrieval-augmented summaries and Q&A, plus semantic search,
# for documents stored on IPFS.
#
#   extract text -> section-aware chunks -> int8 MiniLM vectors   (once per CID, cached)
#   question -> BM25 + vector search, rank-fused -> top chunks -> LLM with citations
#
# LLM calls go through a three-slot fallback chain of OpenAI-compatible APIs
# configured with API keys (see llm.py).
# Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

import os
import secrets

# Load .env before importing modules that read configuration at import time.
from dotenv import load_dotenv

load_dotenv()

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

import doc_index
import embeddings
import llm
import qa
import summarizer
from extractor import extract_text

IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "https://gateway.pinata.cloud").rstrip("/")

# Optional shared secret. When set, every endpoint except / and /health requires
# an X-Internal-Key header with this value (the Node backend sends it).
AI_ENGINE_KEY = os.getenv("AI_ENGINE_KEY", "")

# Below this there is nothing to summarize or search; fail clearly instead of asking the LLM.
MIN_WORDS = 30


def require_internal_key(x_internal_key: str | None = Header(default=None)):
    if AI_ENGINE_KEY and not secrets.compare_digest(x_internal_key or "", AI_ENGINE_KEY):
        raise HTTPException(401, "Invalid or missing X-Internal-Key")


app = FastAPI(
    title="Shadow Network AI Engine",
    version="3.0.0",
    description="RAG summaries, Q&A and semantic search for IPFS documents",
)

protected = [Depends(require_internal_key)]


# ── Request/response models ────────────────────────────────────

class SummarizeRequest(BaseModel):
    cid: str
    mime_type: str = "application/pdf"
    title: str | None = Field(default=None, max_length=300)


class SummarizeResponse(BaseModel):
    cid: str
    summary: str
    word_count_original: int
    word_count_summary: int
    chunks_processed: int


class AskRequest(BaseModel):
    cid: str
    question: str = Field(..., min_length=5, max_length=500)
    mime_type: str = "application/pdf"
    title: str | None = Field(default=None, max_length=300)


class Source(BaseModel):
    n: int
    section: str
    excerpt: str


class AskResponse(BaseModel):
    cid: str
    question: str
    answer: str
    confidence: float
    confident: bool
    chunks_searched: int
    sources: list[Source] = []


class EmbedRequest(BaseModel):
    cid: str
    note_id: str = Field(..., description="MongoDB _id of the Note")
    mime_type: str = "application/pdf"


class EmbedResponse(BaseModel):
    note_id: str
    indexed: bool
    reason: str | None = None
    chunks: int = 0


class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    k: int = Field(default=10, ge=1, le=50)


class SearchHit(BaseModel):
    note_id: str
    score: float
    rank: int


class SemanticSearchResponse(BaseModel):
    query: str
    results: list[SearchHit]
    total_indexed: int


class RemoveEmbeddingRequest(BaseModel):
    note_id: str


class ReindexDocument(BaseModel):
    note_id: str
    text: str = Field(..., min_length=1)


class ReindexRequest(BaseModel):
    notes: list[ReindexDocument] = Field(default_factory=list)


# ── Helpers ────────────────────────────────────────────────────

async def fetch_file_from_ipfs(cid: str) -> bytes:
    url = f"{IPFS_GATEWAY}/ipfs/{cid}"
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url)
    except httpx.TimeoutException:
        raise HTTPException(504, f"IPFS gateway timed out fetching {cid}")
    except httpx.RequestError as e:
        raise HTTPException(503, f"IPFS gateway unreachable ({IPFS_GATEWAY}): {type(e).__name__}")

    if r.status_code == 404:
        raise HTTPException(404, f"File not found on IPFS: {cid}")
    if r.status_code >= 400:
        raise HTTPException(502, f"IPFS gateway returned HTTP {r.status_code} for {cid}")
    return r.content


async def get_text_from_cid(cid: str, mime_type: str) -> str:
    file_bytes = await fetch_file_from_ipfs(cid)
    try:
        return await run_in_threadpool(extract_text, file_bytes, mime_type)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        # pdfplumber/python-docx raise a variety of parser errors on corrupt files
        raise HTTPException(422, f"Text extraction failed ({type(e).__name__}): {e}")


async def get_index(cid: str, mime_type: str) -> doc_index.DocIndex:
    """The CID's retrieval index: from memory, then MongoDB, else fetched, extracted and built."""
    index = await run_in_threadpool(doc_index.get_cached, cid)
    if index is None:
        text = await get_text_from_cid(cid, mime_type)
        words = len(text.split())
        if words < MIN_WORDS:
            # e.g. a browser "print to PDF" of a slide deck: only the page header is text.
            raise HTTPException(
                422,
                f"This document has almost no readable text ({words} words). It may be scanned "
                "images or a printed web page; upload a text-based PDF, DOCX or TXT.",
            )
        index = await run_in_threadpool(doc_index.get_or_build, cid, lambda: text)
    return index


async def run_llm_op(fn, *args, **kwargs):
    """Run a blocking LLM call off the event loop, mapping provider failures to HTTP errors."""
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except llm.AllSlotsFailedError as e:
        if not llm.configured_slots():
            raise HTTPException(503, "No LLM is configured for the AI engine. Set LLM_1_BASE_URL, LLM_1_MODEL and LLM_1_API_KEY.")
        if e.rate_limited:
            raise HTTPException(429, "The AI provider's rate limit was reached. Wait a minute and try again.")
        raise HTTPException(503, "The AI provider is unavailable right now. Please try again in a minute.")


async def run_vector_op(fn, *args, **kwargs):
    """Run a blocking embeddings/MongoDB call off the event loop."""
    try:
        return await run_in_threadpool(fn, *args, **kwargs)
    except embeddings.VectorStoreError as e:
        raise HTTPException(503, str(e))


# ── Routes ─────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "Shadow Network AI Engine",
        "version": app.version,
        "endpoints": {
            "health":           "GET  /health",
            "summarize":        "POST /summarize",
            "ask":              "POST /ask",
            "embed":            "POST /embed",
            "semantic_search":  "POST /semantic-search",
            "remove_embedding": "POST /remove-embedding",
            "reindex":          "POST /reindex",
        },
    }


@app.get("/health")
async def health():
    try:
        stats = await run_in_threadpool(embeddings.get_index_stats)
        mongo_status = "connected"
    except Exception as e:
        stats = {"error": str(e)}
        mongo_status = "error"

    return {
        "status": "ok" if mongo_status == "connected" else "degraded",
        # The embedding model loads lazily on first use, so "not_loaded" is normal after a restart.
        "models": {
            "embeddings": "loaded" if embeddings.is_loaded() else "not_loaded",
            # Slot names and models only, never keys.
            "llm": [f"{s.name}: {s.model}" for s in llm.configured_slots()],
        },
        "mongodb": mongo_status,
        "vector_search": stats,
        "ipfs_gateway": IPFS_GATEWAY,
    }


@app.post("/summarize", response_model=SummarizeResponse, dependencies=protected)
async def summarize_document(req: SummarizeRequest):
    index = await get_index(req.cid, req.mime_type)
    result = await run_llm_op(summarizer.summarize, index, req.title)
    return SummarizeResponse(cid=req.cid, **result)


@app.post("/ask", response_model=AskResponse, dependencies=protected)
async def ask_question(req: AskRequest):
    index = await get_index(req.cid, req.mime_type)
    result = await run_llm_op(qa.answer_question, req.question, index, req.title)
    return AskResponse(cid=req.cid, question=req.question, **result)


@app.post("/embed", response_model=EmbedResponse, dependencies=protected)
async def embed_document(req: EmbedRequest):
    """Build (or reuse) the document's retrieval index and store its note-level vector."""
    index = await get_index(req.cid, req.mime_type)
    preview = index.chunks[0]["text"] if index.chunks else ""
    result = await run_vector_op(
        embeddings.upsert_document_vector,
        req.note_id,
        embeddings.document_vector(index.vectors),
        cid=req.cid,
        preview=preview,
    )
    return EmbedResponse(chunks=len(index.chunks), **result)


@app.post("/semantic-search", response_model=SemanticSearchResponse, dependencies=protected)
async def semantic_search(req: SemanticSearchRequest):
    results = await run_vector_op(embeddings.semantic_search, query=req.query, k=req.k)
    stats = await run_vector_op(embeddings.get_index_stats)
    return SemanticSearchResponse(query=req.query, results=results, total_indexed=stats["total_vectors"])


@app.post("/remove-embedding", dependencies=protected)
async def remove_embedding(req: RemoveEmbeddingRequest):
    result = await run_vector_op(embeddings.remove_document, req.note_id)
    # Drop the chunk index too, unless another note still uses the same file.
    cid = result.pop("cid", None)
    if cid and not await run_vector_op(embeddings.cid_in_use, cid):
        await run_in_threadpool(doc_index.remove, cid)
    return {"success": True, **result}


@app.post("/reindex", dependencies=protected)
async def reindex(req: ReindexRequest):
    """Re-embed already-extracted text: { "notes": [{ "note_id": "...", "text": "..." }] }."""
    if not req.notes:
        return {"success": True, "reindexed": 0, "errors": []}
    result = await run_vector_op(embeddings.reindex_documents, [n.model_dump() for n in req.notes])
    return {"success": True, **result}

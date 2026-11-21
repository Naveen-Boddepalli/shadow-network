# FastAPI AI engine: text extraction, summarization, extractive Q&A and
# semantic search for documents stored on IPFS.
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

import embeddings
import qa
import summarizer
from extractor import extract_text

IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "https://gateway.pinata.cloud").rstrip("/")

# Optional shared secret. When set, every endpoint except / and /health requires
# an X-Internal-Key header with this value (the Node backend sends it).
AI_ENGINE_KEY = os.getenv("AI_ENGINE_KEY", "")


def require_internal_key(x_internal_key: str | None = Header(default=None)):
    if AI_ENGINE_KEY and not secrets.compare_digest(x_internal_key or "", AI_ENGINE_KEY):
        raise HTTPException(401, "Invalid or missing X-Internal-Key")


app = FastAPI(
    title="Shadow Network AI Engine",
    version="2.0.0",
    description="Summarization, Q&A and semantic search for IPFS documents",
)

protected = [Depends(require_internal_key)]


# ── Request/response models ────────────────────────────────────

class SummarizeRequest(BaseModel):
    cid: str
    mime_type: str = "application/pdf"


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


class AskResponse(BaseModel):
    cid: str
    question: str
    answer: str
    confidence: float
    confident: bool
    chunks_searched: int


class EmbedRequest(BaseModel):
    cid: str
    note_id: str = Field(..., description="MongoDB _id of the Note")
    mime_type: str = "application/pdf"


class EmbedResponse(BaseModel):
    note_id: str
    indexed: bool
    reason: str | None = None


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
        # Models load lazily on first use, so "not_loaded" is normal after a restart.
        "models": {
            "summarizer": "loaded" if summarizer.is_loaded() else "not_loaded",
            "qa":         "loaded" if qa.is_loaded() else "not_loaded",
            "embeddings": "loaded" if embeddings.is_loaded() else "not_loaded",
        },
        "mongodb": mongo_status,
        "vector_search": stats,
        "ipfs_gateway": IPFS_GATEWAY,
    }


@app.post("/summarize", response_model=SummarizeResponse, dependencies=protected)
async def summarize_document(req: SummarizeRequest):
    text = await get_text_from_cid(req.cid, req.mime_type)
    result = await run_in_threadpool(summarizer.summarize, text)
    return SummarizeResponse(cid=req.cid, **result)


@app.post("/ask", response_model=AskResponse, dependencies=protected)
async def ask_question(req: AskRequest):
    text = await get_text_from_cid(req.cid, req.mime_type)
    result = await run_in_threadpool(qa.answer_question, req.question, text)
    return AskResponse(cid=req.cid, question=req.question, **result)


@app.post("/embed", response_model=EmbedResponse, dependencies=protected)
async def embed_document(req: EmbedRequest):
    text = await get_text_from_cid(req.cid, req.mime_type)
    result = await run_vector_op(embeddings.add_document, note_id=req.note_id, text=text)
    return EmbedResponse(**result)


@app.post("/semantic-search", response_model=SemanticSearchResponse, dependencies=protected)
async def semantic_search(req: SemanticSearchRequest):
    results = await run_vector_op(embeddings.semantic_search, query=req.query, k=req.k)
    stats = await run_vector_op(embeddings.get_index_stats)
    return SemanticSearchResponse(query=req.query, results=results, total_indexed=stats["total_vectors"])


@app.post("/remove-embedding", dependencies=protected)
async def remove_embedding(req: RemoveEmbeddingRequest):
    result = await run_vector_op(embeddings.remove_document, req.note_id)
    return {"success": True, **result}


@app.post("/reindex", dependencies=protected)
async def reindex(req: ReindexRequest):
    """Re-embed already-extracted text: { "notes": [{ "note_id": "...", "text": "..." }] }."""
    if not req.notes:
        return {"success": True, "reindexed": 0, "errors": []}
    result = await run_vector_op(embeddings.reindex_documents, [n.model_dump() for n in req.notes])
    return {"success": True, **result}

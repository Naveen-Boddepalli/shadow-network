# ai-engine/main.py  —  Phase 1 + 2 + 3 + 4
# FastAPI AI Engine for The Shadow Network.
# Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

import os
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from extractor import extract_text
from summarizer import summarize, _summarizer as _sum_ref
from qa import answer_question, _qa_pipeline as _qa_ref
from embeddings import (
    add_document,
    semantic_search,
    remove_document,
    get_index_stats,
    embed_text,
    rebuild_index_from_mongo,
)

load_dotenv()

app = FastAPI(
    title="Shadow Network AI Engine",
    version="2.0.0",
    description="Summarization, Q&A, and semantic search for IPFS academic documents",
)

# FIX: Allow all origins — AI engine is called server-to-server from Node backend,
# not directly from the browser. Restricting to localhost was blocking Render backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# FIX: Use Pinata gateway (production) with fallback to local Kubo (dev only).
# Previously defaulted to 127.0.0.1:8080 which doesn't exist on Render.
IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "https://gateway.pinata.cloud")


# ── Pydantic request/response models ───────────────────────────

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
    question: str = Field(..., min_length=5)
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
    query: str = Field(..., min_length=2)
    k: int = Field(default=10, ge=1, le=50)

class SemanticSearchResponse(BaseModel):
    query: str
    results: list[dict]   # [{ note_id, score, rank }]
    total_indexed: int

class RemoveEmbeddingRequest(BaseModel):
    note_id: str


# ── Helpers ────────────────────────────────────────────────────

async def fetch_file_from_ipfs(cid: str) -> bytes:
    """Fetch raw file bytes from the configured IPFS/Pinata gateway."""
    url = f"{IPFS_GATEWAY}/ipfs/{cid}"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.content
    except httpx.ConnectError:
        raise HTTPException(503, f"IPFS gateway unreachable: {IPFS_GATEWAY}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(404, f"File not found on IPFS ({cid}): {e}")


async def get_text_from_cid(cid: str, mime_type: str) -> str:
    """Fetch file from IPFS and extract its plain text."""
    file_bytes = await fetch_file_from_ipfs(cid)
    try:
        return extract_text(file_bytes, mime_type)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        # pdfplumber can throw PDFSyntaxError, struct.error, etc.
        raise HTTPException(422, f"Text extraction failed ({type(e).__name__}): {e}")


# ── Routes ─────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "Shadow Network AI Engine",
        "version": "2.0.0",
        "endpoints": {
            "health":           "GET  /health",
            "summarize":        "POST /summarize",
            "ask":              "POST /ask",
            "embed":            "POST /embed",
            "semantic_search":  "POST /semantic-search",
            "remove_embedding": "POST /remove-embedding",
        },
    }


@app.get("/health")
def health():
    """Returns status of all AI models and the MongoDB vector index."""
    import importlib
    sum_mod = importlib.import_module("summarizer")
    qa_mod  = importlib.import_module("qa")

    # Try to get real stats — this also validates MongoDB connectivity
    try:
        stats = get_index_stats()
        mongo_status = "connected"
    except Exception as e:
        stats = {"error": str(e)}
        mongo_status = "error"

    return {
        "status": "ok" if mongo_status == "connected" else "degraded",
        "models": {
            "summarizer":  "loaded" if sum_mod._summarizer is not None else "not_loaded",
            "qa":          "loaded" if qa_mod._qa_pipeline is not None else "not_loaded",
            "embeddings":  "loaded",
        },
        "mongodb": mongo_status,
        "vector_search": stats,
        "ipfs_gateway": IPFS_GATEWAY,
    }


# ── Phase 3: Summarize ──────────────────────────────────────────

@app.post("/summarize", response_model=SummarizeResponse)
async def summarize_document(req: SummarizeRequest):
    text = await get_text_from_cid(req.cid, req.mime_type)
    result = summarize(text)
    return SummarizeResponse(cid=req.cid, **result)


# ── Phase 3: Q&A ───────────────────────────────────────────────

@app.post("/ask", response_model=AskResponse)
async def ask_question(req: AskRequest):
    text = await get_text_from_cid(req.cid, req.mime_type)
    result = answer_question(req.question, text)
    return AskResponse(cid=req.cid, question=req.question, **result)


# ── Phase 4: Embed ─────────────────────────────────────────────

@app.post("/embed", response_model=EmbedResponse)
async def embed_document(req: EmbedRequest):
    try:
        # Step 1: Fetch text from IPFS and extract
        text = await get_text_from_cid(req.cid, req.mime_type)
        # Step 2: Embed + upsert into MongoDB
        result = add_document(note_id=req.note_id, text=text)
        return EmbedResponse(**result)
    except HTTPException:
        raise  # re-raise 404/422/503 from helpers as-is
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embed pipeline failed ({type(e).__name__}): {e}")


# ── Phase 4: Semantic search ────────────────────────────────────

@app.post("/semantic-search", response_model=SemanticSearchResponse)
async def semantic_search_endpoint(req: SemanticSearchRequest):
    results = semantic_search(query=req.query, k=req.k)
    stats   = get_index_stats()
    return SemanticSearchResponse(
        query=req.query,
        results=results,
        total_indexed=stats["total_vectors"],
    )


# ── Phase 4: Remove embedding ───────────────────────────────────

@app.post("/remove-embedding")
async def remove_embedding(req: RemoveEmbeddingRequest):
    result = remove_document(req.note_id)
    return {"success": True, **result}


# ── Phase 4: Rebuild index ──────────────────────────────────────

class RebuildRequest(BaseModel):
    notes: list[dict]  # [{ "note_id": str, "text": str }, ...]

@app.post("/rebuild-index")
async def rebuild_index(req: RebuildRequest | None = None):
    """
    Re-embed a list of { note_id, text } documents and upsert them into Atlas.
    Called after a schema migration or to back-fill missing embeddings.
    If no body is provided, returns current index stats.
    """
    if req is None or not req.notes:
        stats = get_index_stats()
        return {
            "message": "POST with body { \"notes\": [{ \"note_id\": \"...\", \"text\": \"...\" }] } to re-index.",
            "current_stats": stats,
        }

    result = rebuild_index_from_mongo(req.notes)
    return {"success": True, **result}
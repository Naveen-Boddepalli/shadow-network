# Embeddings for retrieval and semantic search.
#
# Runs all-MiniLM-L6-v2 as an 8-bit quantized ONNX model (the same model and
# quantization Tessera uses) on onnxruntime: ~23 MB on disk and ~100 MB of RAM,
# with no PyTorch. Vectors are 384-dim and unit length, so they are compatible
# with the vectors earlier versions stored and with the existing Atlas index.
#
# Two uses:
#   - chunk vectors, stored per document by doc_index.py for RAG retrieval;
#   - one document vector per note (the mean of its chunk vectors) in the
#     `embeddings` collection, searched across notes with Atlas $vectorSearch.
#
# One-time Atlas setup: on the `embeddings` collection, create an Atlas Vector
# Search index named "vector_index":
#   { "fields": [{ "type": "vector", "path": "embedding",
#                  "numDimensions": 384, "similarity": "cosine" }] }

import os
import threading
from pathlib import Path

import httpx
import numpy as np
from pymongo import MongoClient
from pymongo.errors import OperationFailure, PyMongoError

MODEL_REPO    = os.getenv("EMBEDDING_ONNX_MODEL", "Xenova/all-MiniLM-L6-v2")
MODEL_FILES   = {"model.onnx": "onnx/model_quantized.onnx", "tokenizer.json": "tokenizer.json"}
MODEL_DIR     = Path(os.getenv("MODEL_CACHE_DIR", Path(__file__).parent / ".model-cache")) / MODEL_REPO.replace("/", "--")
EMBEDDING_DIM = 384  # must match the Atlas index
MAX_TOKENS    = 256  # MiniLM was trained on 256 word pieces; it ignores the rest anyway
BATCH_SIZE    = 16   # small batches keep memory flat on large documents

MONGO_URI     = os.getenv("MONGO_URI", "")
DB_NAME       = os.getenv("MONGO_DB_NAME", "shadow-network")
COLLECTION    = "embeddings"
VECTOR_INDEX  = "vector_index"

_model = None
_model_lock = threading.Lock()
_db = None


class VectorStoreError(RuntimeError):
    """MongoDB is misconfigured or unreachable."""


# ── Model ──────────────────────────────────────────────────────

def ensure_model_files() -> Path:
    """Download the model once into MODEL_DIR. Render runs this at build time."""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for local, remote in MODEL_FILES.items():
        target = MODEL_DIR / local
        if target.exists() and target.stat().st_size > 0:
            continue
        url = f"https://huggingface.co/{MODEL_REPO}/resolve/main/{remote}"
        print(f"Downloading {url}")
        tmp = target.with_suffix(".part")
        with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for block in r.iter_bytes():
                    f.write(block)
        tmp.replace(target)
    return MODEL_DIR


class _OnnxMiniLM:
    def __init__(self, model_dir: Path):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        options = ort.SessionOptions()
        # Render's free instance has a fraction of one CPU; extra threads only contend.
        options.intra_op_num_threads = int(os.getenv("ONNX_THREADS", "1"))
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model_dir / "model.onnx"), options, providers=["CPUExecutionProvider"])
        self.input_names = {i.name for i in self.session.get_inputs()}

        self.tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=MAX_TOKENS)
        self.tokenizer.enable_padding()

    def encode(self, texts: list[str]) -> np.ndarray:
        out = []
        for start in range(0, len(texts), BATCH_SIZE):
            encodings = self.tokenizer.encode_batch(texts[start:start + BATCH_SIZE])
            ids = np.array([e.ids for e in encodings], dtype=np.int64)
            mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
            feeds = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self.input_names:
                feeds["token_type_ids"] = np.zeros_like(ids)
            hidden = self.session.run(None, feeds)[0]  # (batch, tokens, 384)
            # Mean pooling over real tokens, then L2 normalisation (as sentence-transformers does).
            weights = mask[:, :, None].astype(np.float32)
            pooled = (hidden * weights).sum(axis=1) / np.clip(weights.sum(axis=1), 1e-9, None)
            out.append(pooled)
        vectors = np.vstack(out) if out else np.zeros((0, EMBEDDING_DIM), dtype=np.float32)
        return _normalize_rows(vectors)


def is_loaded() -> bool:
    return _model is not None


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                print(f"Loading embedding model {MODEL_REPO} (ONNX, int8)...")
                _model = _OnnxMiniLM(ensure_model_files())
                print("Embedding model loaded")
    return _model


def _normalize_rows(vectors: np.ndarray) -> np.ndarray:
    vectors = np.atleast_2d(vectors).astype(np.float32)
    return vectors / np.clip(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12, None)


def embed_texts(texts: list[str]) -> np.ndarray:
    """(n, 384) unit vectors."""
    if not texts:
        return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)
    return _get_model().encode(texts)


def embed_text(text: str) -> np.ndarray:
    """One unit vector for a short text (e.g. a query)."""
    return embed_texts([text])[0]


def document_vector(chunk_vectors: np.ndarray) -> np.ndarray:
    """A whole document as the normalised mean of its chunk vectors."""
    if len(chunk_vectors) == 0:
        return np.zeros(EMBEDDING_DIM, dtype=np.float32)
    return _normalize_rows(chunk_vectors.mean(axis=0))[0]


# ── MongoDB ────────────────────────────────────────────────────

def get_db():
    """The engine's database, connected once. Raises VectorStoreError if unavailable."""
    global _db
    if _db is not None:
        return _db
    if not MONGO_URI:
        raise VectorStoreError("MONGO_URI is not set for the AI engine")
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        db = client[DB_NAME]
        db[COLLECTION].create_index("note_id", unique=True)
    except PyMongoError as e:
        raise VectorStoreError(f"Cannot connect to MongoDB: {e}") from e
    print(f"Connected to MongoDB ({DB_NAME})")
    _db = db
    return _db


def _get_collection():
    return get_db()[COLLECTION]


def upsert_document_vector(note_id: str, vector: np.ndarray, *, cid: str | None, preview: str) -> dict:
    """Store a note's document vector. Safe to call repeatedly."""
    fields = {"note_id": note_id, "embedding": vector.tolist(), "text_preview": preview[:200]}
    if cid:
        fields["cid"] = cid
    result = _get_collection().update_one({"note_id": note_id}, {"$set": fields}, upsert=True)
    return {
        "indexed": True,
        "note_id": note_id,
        "reason":  None if result.upserted_id is not None else "updated_existing",
    }


def add_document(note_id: str, text: str) -> dict:
    """Embed raw text as a note's document vector (used by /reindex)."""
    from extractor import chunk_document, chunk_search_text

    chunks = chunk_document(text) or [{"section": "", "text": text}]
    vectors = embed_texts([chunk_search_text(c) for c in chunks])
    return upsert_document_vector(note_id, document_vector(vectors), cid=None, preview=text)


def semantic_search(query: str, k: int = 10) -> list[dict]:
    """Return up to k [{note_id, score, rank}] ordered by similarity to the query."""
    col = _get_collection()
    k = max(1, min(k, 50))
    query_vector = embed_text(query)

    pipeline = [
        {
            "$vectorSearch": {
                "index":         VECTOR_INDEX,
                "path":          "embedding",
                "queryVector":   query_vector.tolist(),
                "numCandidates": max(k * 10, 100),
                "limit":         k,
            }
        },
        {"$project": {"_id": 0, "note_id": 1, "score": {"$meta": "vectorSearchScore"}}},
    ]

    try:
        docs = list(col.aggregate(pipeline))
    except OperationFailure as e:
        raise VectorStoreError(
            f"Atlas $vectorSearch failed ({e.details.get('errmsg', e) if e.details else e}). "
            f"Check that a Vector Search index named '{VECTOR_INDEX}' exists on "
            f"{DB_NAME}.{COLLECTION} (path 'embedding', {EMBEDDING_DIM} dimensions, cosine). "
            "$vectorSearch is only available on MongoDB Atlas."
        ) from e

    return [
        {"note_id": doc["note_id"], "score": round(float(doc["score"]), 4), "rank": rank}
        for rank, doc in enumerate(docs, start=1)
    ]


def remove_document(note_id: str) -> dict:
    """Delete a note's vector; returns the cid it was stored with (if any)."""
    doc = _get_collection().find_one_and_delete({"note_id": note_id}, projection={"cid": 1})
    return {"removed": doc is not None, "cid": (doc or {}).get("cid")}


def cid_in_use(cid: str) -> bool:
    return _get_collection().count_documents({"cid": cid}, limit=1) > 0


def get_index_stats() -> dict:
    col = _get_collection()
    return {
        "total_vectors": col.estimated_document_count(),
        "embedding_dim": EMBEDDING_DIM,
        "model":         MODEL_REPO,
        "collection":    f"{DB_NAME}.{COLLECTION}",
        "index_name":    VECTOR_INDEX,
    }


def reindex_documents(note_docs: list[dict]) -> dict:
    """Re-embed a list of {note_id, text}; failures are collected, not raised."""
    reindexed, errors = 0, []
    for doc in note_docs:
        try:
            add_document(doc["note_id"], doc["text"])
            reindexed += 1
        except Exception as e:
            errors.append({"note_id": doc.get("note_id"), "error": str(e)})
    return {"reindexed": reindexed, "errors": errors}

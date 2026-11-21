# Document embeddings for semantic search, stored in MongoDB Atlas and queried
# with $vectorSearch.
#
# Vectors live in MongoDB rather than a local FAISS file because Render's free
# tier has an ephemeral filesystem that is wiped on every restart.
#
# One-time Atlas setup: on the `embeddings` collection, create an Atlas Vector
# Search index named "vector_index":
#   { "fields": [{ "type": "vector", "path": "embedding",
#                  "numDimensions": 384, "similarity": "cosine" }] }

import os

import numpy as np
from pymongo import MongoClient
from pymongo.errors import OperationFailure, PyMongoError

from extractor import chunk_text

MODEL_NAME    = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output size; must match the Atlas index
MONGO_URI     = os.getenv("MONGO_URI", "")
DB_NAME       = os.getenv("MONGO_DB_NAME", "shadow-network")
COLLECTION    = "embeddings"
VECTOR_INDEX  = "vector_index"

# The model only sees its first 256 tokens of any input, so long documents are
# embedded chunk by chunk and the chunk vectors averaged. Capped to bound CPU time.
MAX_CHUNKS = 20

_model = None
_collection = None


class VectorStoreError(RuntimeError):
    """MongoDB is misconfigured or unreachable."""


def is_loaded() -> bool:
    return _model is not None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer

        print(f"Loading embedding model {MODEL_NAME}...")
        _model = SentenceTransformer(MODEL_NAME)
        print("Embedding model loaded")
    return _model


def _get_collection():
    global _collection
    if _collection is not None:
        return _collection

    if not MONGO_URI:
        raise VectorStoreError("MONGO_URI is not set for the AI engine")

    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        col = client[DB_NAME][COLLECTION]
        col.create_index("note_id", unique=True)
    except PyMongoError as e:
        raise VectorStoreError(f"Cannot connect to MongoDB: {e}") from e

    print(f"Connected to MongoDB ({DB_NAME}.{COLLECTION})")
    _collection = col
    return _collection


def _normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return (v / norm if norm > 0 else v).astype(np.float32)


def embed_text(text: str) -> np.ndarray:
    """Return an L2-normalised 384-dim vector for a short text (e.g. a query)."""
    vector = _get_model().encode(text, convert_to_numpy=True, show_progress_bar=False)
    return _normalize(vector)


def embed_document(text: str) -> np.ndarray:
    """Embed a whole document as the mean of its chunk embeddings."""
    chunks = chunk_text(text, max_chars=1000)[:MAX_CHUNKS] or [text]
    vectors = _get_model().encode(chunks, convert_to_numpy=True, show_progress_bar=False)
    vectors = np.atleast_2d(vectors)
    vectors = vectors / np.clip(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12, None)
    return _normalize(vectors.mean(axis=0))


def add_document(note_id: str, text: str) -> dict:
    """Embed a document and upsert it by note_id. Safe to call repeatedly."""
    col = _get_collection()
    vector = embed_document(text)

    result = col.update_one(
        {"note_id": note_id},
        {"$set": {
            "note_id":      note_id,
            "embedding":    vector.tolist(),
            "text_preview": text[:200],  # for eyeballing in the Atlas UI
        }},
        upsert=True,
    )
    return {
        "indexed": True,
        "note_id": note_id,
        "reason":  None if result.upserted_id is not None else "updated_existing",
    }


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
    result = _get_collection().delete_one({"note_id": note_id})
    return {"removed": result.deleted_count > 0}


def get_index_stats() -> dict:
    col = _get_collection()
    return {
        "total_vectors": col.estimated_document_count(),
        "embedding_dim": EMBEDDING_DIM,
        "model":         MODEL_NAME,
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

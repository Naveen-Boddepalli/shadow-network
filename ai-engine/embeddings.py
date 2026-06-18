# ai-engine/embeddings.py
# Manages vector embeddings for semantic search using MongoDB Atlas Vector Search.
#
# Why MongoDB instead of FAISS files?
#   Render free tier has an ephemeral filesystem — local files (embeddings.faiss,
#   id_map.json) are wiped on every service restart (~15 min inactivity).
#   MongoDB Atlas M0 (free) provides persistent vector storage with built-in
#   approximate nearest-neighbour search via the $vectorSearch aggregation stage.
#
# How it works:
#   1. A document's text is converted into a 384-dim vector using sentence-transformers.
#   2. The vector + note_id are upserted into the MongoDB `embeddings` collection.
#   3. Semantic search runs a $vectorSearch aggregation pipeline on Atlas.
#
# Required Atlas setup (one-time, in Atlas UI):
#   Database: shadow-network  Collection: embeddings
#   Create an "Atlas Vector Search" index named "vector_index":
#   {
#     "fields": [{
#       "type": "vector",
#       "path": "embedding",
#       "numDimensions": 384,
#       "similarity": "cosine"
#     }]
#   }

import os
import numpy as np
from sentence_transformers import SentenceTransformer
from pymongo import MongoClient, UpdateOne
from pymongo.errors import OperationFailure

# ── Config ─────────────────────────────────────────────────────
MODEL_NAME    = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_DIM = 384          # all-MiniLM-L6-v2 always outputs 384-dim vectors
MONGO_URI     = os.getenv("MONGO_URI", "")
DB_NAME       = os.getenv("MONGO_DB_NAME", "shadow-network")
COLLECTION    = "embeddings"
VECTOR_INDEX  = "vector_index"

# ── Module-level state ─────────────────────────────────────────
_model: SentenceTransformer | None = None
_mongo_collection = None   # pymongo Collection


# ── Initialisation ─────────────────────────────────────────────

def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"⏳ Loading embedding model: {MODEL_NAME}...")
        _model = SentenceTransformer(MODEL_NAME)
        print("✅ Embedding model loaded")
    return _model


def _get_collection():
    """
    Returns the MongoDB embeddings collection, creating the client once.
    Also ensures a unique index on note_id to prevent duplicates.
    """
    global _mongo_collection

    if _mongo_collection is not None:
        return _mongo_collection

    if not MONGO_URI:
        raise RuntimeError(
            "MONGO_URI environment variable is not set. "
            "Add it to your Render service environment variables."
        )

    print("🔌 Connecting to MongoDB Atlas...")
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    col = db[COLLECTION]

    # Ensure unique index on note_id (idempotent — no-op if already exists)
    col.create_index("note_id", unique=True, background=True)

    # Smoke-test the connection
    client.admin.command("ping")
    print(f"✅ Connected to MongoDB Atlas — db={DB_NAME}, collection={COLLECTION}")

    _mongo_collection = col
    return _mongo_collection


# ── Public API ─────────────────────────────────────────────────

def embed_text(text: str) -> np.ndarray:
    """
    Convert a text string into a normalised 384-dim vector.
    L2-normalisation makes cosine similarity equivalent to dot product,
    which is what Atlas Vector Search uses with similarity="cosine".

    Returns: shape (384,) float32 numpy array
    """
    model = _get_model()
    vector = model.encode(text, convert_to_numpy=True, show_progress_bar=False)
    vector = vector / np.linalg.norm(vector)
    return vector.astype(np.float32)


def add_document(note_id: str, text: str) -> dict:
    """
    Embed a document's text and upsert it into the MongoDB embeddings collection.

    Called after a successful file upload so the document becomes
    semantically searchable immediately.

    Args:
        note_id: MongoDB _id string for the Note
        text:    Plain text content of the document

    Returns:
        { "indexed": True/False, "note_id": str, "reason": str | None }
    """
    col = _get_collection()

    # Generate embedding
    vector = embed_text(text)

    # Upsert by note_id — safe to call multiple times
    result = col.update_one(
        {"note_id": note_id},
        {"$set": {
            "note_id":      note_id,
            "embedding":    vector.tolist(),   # MongoDB stores as array of floats
            "text_preview": text[:200],        # handy for debugging in Atlas UI
        }},
        upsert=True,
    )

    was_new = result.upserted_id is not None
    return {
        "indexed":  True,
        "note_id":  note_id,
        "reason":   None if was_new else "updated_existing",
    }


def semantic_search(query: str, k: int = 10) -> list[dict]:
    """
    Find the k most semantically similar documents to the query using
    MongoDB Atlas $vectorSearch aggregation pipeline.

    Args:
        query: Natural language search string
        k:     Number of results to return (default 10, max 50)

    Returns:
        List of { "note_id": str, "score": float, "rank": int }
        sorted by score descending (most relevant first).
    """
    col = _get_collection()
    k = min(k, 50)

    query_vector = embed_text(query)

    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index":         VECTOR_INDEX,
                    "path":          "embedding",
                    "queryVector":   query_vector.tolist(),
                    "numCandidates": k * 10,   # Wider candidate pool → better recall
                    "limit":         k,
                }
            },
            {
                "$project": {
                    "_id":   0,
                    "note_id": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

        docs = list(col.aggregate(pipeline))

    except OperationFailure as e:
        # Friendly error if the Atlas vector index hasn't been created yet
        if "index" in str(e).lower() or "vectorSearch" in str(e):
            raise RuntimeError(
                "Atlas Vector Search index 'vector_index' not found. "
                "Please create it in the Atlas UI: "
                "Database → shadow-network → embeddings collection → "
                "Search Indexes → Create Index (Vector Search) → "
                "name it 'vector_index', path='embedding', numDimensions=384, similarity='cosine'."
            ) from e
        raise

    results = [
        {
            "note_id": doc["note_id"],
            "score":   round(float(doc["score"]), 4),
            "rank":    rank + 1,
        }
        for rank, doc in enumerate(docs)
    ]
    return results


def remove_document(note_id: str) -> dict:
    """
    Permanently remove a document's embedding from MongoDB.

    Unlike FAISS, MongoDB supports true deletion — no rebuild needed.

    Returns: { "removed": bool }
    """
    col = _get_collection()
    result = col.delete_one({"note_id": note_id})

    if result.deleted_count == 0:
        return {"removed": False, "reason": "not_found"}
    return {"removed": True}


def get_index_stats() -> dict:
    """Return stats about the current embeddings collection. Used in /health."""
    col = _get_collection()
    total = col.count_documents({})
    return {
        "total_vectors":  total,
        "embedding_dim":  EMBEDDING_DIM,
        "model":          MODEL_NAME,
        "storage":        "MongoDB Atlas Vector Search",
        "collection":     f"{DB_NAME}.{COLLECTION}",
        "index_name":     VECTOR_INDEX,
    }


def rebuild_index_from_mongo(note_docs: list[dict]) -> dict:
    """
    Re-embed and re-upsert a list of { note_id, text } dicts.
    Used by the /rebuild-index endpoint to re-index all notes from MongoDB.

    Args:
        note_docs: list of { "note_id": str, "text": str }

    Returns:
        { "reindexed": int, "errors": list }
    """
    reindexed = 0
    errors = []

    for doc in note_docs:
        try:
            add_document(doc["note_id"], doc["text"])
            reindexed += 1
        except Exception as e:
            errors.append({"note_id": doc.get("note_id"), "error": str(e)})

    return {"reindexed": reindexed, "errors": errors}

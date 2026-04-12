# ai-engine/embeddings.py
# Manages vector embeddings for semantic search.
#
# How it works:
#   1. A document's text is converted into a 384-dimensional vector (embedding)
#      using a sentence-transformer model. Similar texts produce similar vectors.
#   2. Embeddings are stored in a FAISS index — an ultra-fast nearest-neighbour
#      search structure that can find the closest vectors in milliseconds.
#   3. We also maintain an ID map: FAISS internal index → MongoDB note_id
#      so we can return actual Note records for search results.
#
# Files on disk (in ai-engine/data/):
#   embeddings.faiss   — the FAISS index (binary)
#   id_map.json        — { "0": "mongo_note_id_1", "1": "mongo_note_id_2", ... }

import os
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

# ── Config ─────────────────────────────────────────────────────
MODEL_NAME   = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_DIM = 384          # all-MiniLM-L6-v2 always outputs 384-dim vectors
DATA_DIR     = os.path.join(os.path.dirname(__file__), "data")
INDEX_PATH   = os.path.join(DATA_DIR, "embeddings.faiss")
ID_MAP_PATH  = os.path.join(DATA_DIR, "id_map.json")

# ── Module-level state ─────────────────────────────────────────
# Lazy-loaded model and index — initialised on first use, reused forever.
_model: SentenceTransformer | None = None
_index: faiss.IndexFlatIP | None   = None   # Inner-product index (cosine after normalise)
_id_map: dict[int, str]            = {}      # { faiss_position → mongo_note_id }


# ── Initialisation ─────────────────────────────────────────────

def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"⏳ Loading embedding model: {MODEL_NAME}...")
        _model = SentenceTransformer(MODEL_NAME)
        print("✅ Embedding model loaded")
    return _model


def _get_index() -> faiss.IndexFlatIP:
    """
    Returns the FAISS index, loading from disk if it exists,
    or creating a fresh one if not.
    """
    global _index, _id_map

    if _index is not None:
        return _index

    os.makedirs(DATA_DIR, exist_ok=True)

    if os.path.exists(INDEX_PATH) and os.path.exists(ID_MAP_PATH):
        # Load existing index from disk
        print("📂 Loading FAISS index from disk...")
        _index = faiss.read_index(INDEX_PATH)
        with open(ID_MAP_PATH, "r") as f:
            raw = json.load(f)
            _id_map = {int(k): v for k, v in raw.items()}  # JSON keys are strings → int
        print(f"✅ FAISS index loaded: {_index.ntotal} vectors")
    else:
        # First run — create empty index
        print("🆕 Creating new FAISS index...")
        _index = faiss.IndexFlatIP(EMBEDDING_DIM)  # Inner-product = cosine after L2-normalise
        _id_map = {}
        print("✅ Empty FAISS index created")

    return _index


def _save_index():
    """Persist FAISS index and ID map to disk after every write."""
    os.makedirs(DATA_DIR, exist_ok=True)
    faiss.write_index(_index, INDEX_PATH)
    with open(ID_MAP_PATH, "w") as f:
        json.dump({str(k): v for k, v in _id_map.items()}, f, indent=2)


# ── Public API ─────────────────────────────────────────────────

def embed_text(text: str) -> np.ndarray:
    """
    Convert a text string into a normalised 384-dim vector.
    Normalisation is required for cosine similarity via IndexFlatIP.

    Returns: shape (384,) float32 numpy array
    """
    model = _get_model()
    # encode() returns shape (384,) for a single string
    vector = model.encode(text, convert_to_numpy=True, show_progress_bar=False)
    # L2-normalise so inner product == cosine similarity
    vector = vector / np.linalg.norm(vector)
    return vector.astype(np.float32)


def add_document(note_id: str, text: str) -> dict:
    """
    Embed a document's text and add it to the FAISS index.

    Called after a successful file upload so the document becomes
    semantically searchable immediately (async fire-and-forget from Node.js).

    Args:
        note_id: MongoDB _id string for the Note
        text:    Plain text content of the document

    Returns:
        { "indexed": True, "faiss_position": int, "note_id": str }
    """
    index = _get_index()

    # Check if this note_id is already indexed (avoid duplicates)
    if note_id in _id_map.values():
        existing_pos = next(pos for pos, nid in _id_map.items() if nid == note_id)
        return {"indexed": False, "reason": "already_indexed", "faiss_position": existing_pos, "note_id": note_id}

    # Generate embedding
    vector = embed_text(text)

    # FAISS add expects shape (1, dim)
    index.add(np.expand_dims(vector, axis=0))

    # Record the position (index.ntotal - 1 is the position we just added)
    position = index.ntotal - 1
    _id_map[position] = note_id

    # Persist immediately so index survives restarts
    _save_index()

    return {"indexed": True, "faiss_position": position, "note_id": note_id}


def semantic_search(query: str, k: int = 10) -> list[dict]:
    """
    Find the k most semantically similar documents to the query.

    Args:
        query: Natural language search string
        k:     Number of results to return (default 10, max 50)

    Returns:
        List of { "note_id": str, "score": float, "rank": int }
        sorted by score descending (most relevant first).
        score is cosine similarity in [0, 1].
    """
    index = _get_index()

    if index.ntotal == 0:
        return []   # No documents indexed yet

    k = min(k, index.ntotal, 50)  # Can't return more than what's indexed

    # Embed the query the same way we embedded documents
    query_vector = embed_text(query)

    # FAISS search expects shape (1, dim); returns distances and positions
    distances, positions = index.search(np.expand_dims(query_vector, axis=0), k)

    results = []
    for rank, (pos, score) in enumerate(zip(positions[0], distances[0])):
        if pos == -1:
            continue  # FAISS returns -1 for unfilled slots
        note_id = _id_map.get(int(pos))
        if note_id:
            results.append({
                "note_id": note_id,
                "score":   round(float(score), 4),  # Cosine similarity 0.0–1.0
                "rank":    rank + 1,
            })

    return results


def remove_document(note_id: str) -> dict:
    """
    Remove a document from the ID map so it won't appear in search results.

    Note: FAISS IndexFlatIP doesn't support true deletion — we remove it from
    the ID map so it's filtered out of results. A full rebuild is needed for
    true removal (acceptable for MVP; add rebuild endpoint later if needed).

    Returns: { "removed": bool }
    """
    global _id_map
    positions_to_remove = [pos for pos, nid in _id_map.items() if nid == note_id]

    if not positions_to_remove:
        return {"removed": False, "reason": "not_found"}

    for pos in positions_to_remove:
        del _id_map[pos]

    _save_index()
    return {"removed": True, "positions_cleared": positions_to_remove}


def get_index_stats() -> dict:
    """Return stats about the current FAISS index. Used in /health."""
    index = _get_index()
    return {
        "total_vectors": index.ntotal,
        "embedding_dim":  EMBEDDING_DIM,
        "model":          MODEL_NAME,
        "index_file":     INDEX_PATH if os.path.exists(INDEX_PATH) else "not_saved_yet",
    }

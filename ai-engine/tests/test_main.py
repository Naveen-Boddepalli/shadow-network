import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MONGO_URI"] = ""
os.environ["AI_ENGINE_KEY"] = "test-key"

from fastapi.testclient import TestClient  # noqa: E402

import embeddings  # noqa: E402
import main  # noqa: E402
import qa  # noqa: E402
from extractor import chunk_text, extract_text  # noqa: E402

client = TestClient(main.app)
AUTH = {"X-Internal-Key": "test-key"}


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "Shadow Network AI Engine"


def test_health_is_public_and_degraded_without_mongo():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "degraded"
    assert body["models"] == {"summarizer": "not_loaded", "qa": "not_loaded", "embeddings": "not_loaded"}


def test_protected_endpoints_require_key():
    r = client.post("/semantic-search", json={"query": "laws of motion"})
    assert r.status_code == 401


def test_vector_store_errors_become_503():
    r = client.post("/semantic-search", json={"query": "laws of motion"}, headers=AUTH)
    assert r.status_code == 503
    assert "MONGO_URI" in r.json()["detail"]


def test_unsupported_type_is_422(monkeypatch):
    async def fake_fetch(cid):
        return b"\x89PNG..."
    monkeypatch.setattr(main, "fetch_file_from_ipfs", fake_fetch)
    r = client.post("/summarize", json={"cid": "Qm123", "mime_type": "image/png"}, headers=AUTH)
    assert r.status_code == 422


def test_extract_txt_and_legacy_doc():
    assert extract_text("héllo".encode(), "text/plain") == "héllo"
    with pytest.raises(ValueError, match=".docx"):
        extract_text(b"\xd0\xcf", "application/msword")


def test_chunk_text_respects_limit_and_splits_long_lines():
    text = "\n".join(["word " * 100] * 20) + "\n" + "x" * 5000
    chunks = chunk_text(text, max_chars=1000)
    assert chunks
    assert all(len(c) <= 1000 + 2 for c in chunks)  # +newline joins


def test_qa_prefers_real_answer_over_no_answer(monkeypatch):
    calls = iter([
        {"answer": "", "score": 0.95},          # chunk 1: "no answer", high score
        {"answer": "Isaac Newton", "score": 0.4},  # chunk 2: real answer
    ])
    monkeypatch.setattr(qa, "get_qa_pipeline", lambda: lambda **kw: next(calls))
    monkeypatch.setattr(qa, "chunk_text", lambda text, max_chars: ["a", "b"])
    result = qa.answer_question("Who wrote Principia?", "...")
    assert result["answer"] == "Isaac Newton"
    assert result["chunks_searched"] == 2


def test_embed_document_averages_normalised_chunks(monkeypatch):
    import numpy as np

    class FakeModel:
        def encode(self, texts, **kw):
            return np.array([[3.0, 4.0], [0.0, 2.0]])[: len(texts)]

    monkeypatch.setattr(embeddings, "_get_model", lambda: FakeModel())
    v = embeddings.embed_document("one\n" * 5 + "two " * 400)
    assert abs(np.linalg.norm(v) - 1.0) < 1e-6

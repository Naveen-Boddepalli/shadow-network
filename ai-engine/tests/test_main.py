import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["MONGO_URI"] = ""
os.environ["AI_ENGINE_KEY"] = "test-key"
# Empty rather than unset: main.py calls load_dotenv(), which never overrides an
# existing variable, so a developer's real ai-engine/.env can't leak into tests.
os.environ["IPFS_GATEWAY"] = "http://ipfs.invalid"
for n in (1, 2, 3):
    for part in ("BASE_URL", "MODEL", "API_KEY"):
        os.environ[f"LLM_{n}_{part}"] = ""

from fastapi.testclient import TestClient  # noqa: E402

import doc_index  # noqa: E402
import embeddings  # noqa: E402
import llm  # noqa: E402
import main  # noqa: E402
import qa  # noqa: E402
import retrieval  # noqa: E402
import summarizer  # noqa: E402
from extractor import chunk_document, extract_text  # noqa: E402

client = TestClient(main.app)
AUTH = {"X-Internal-Key": "test-key"}

DOC = """Laws of Motion

1 Newton's First Law
An object stays at rest or in uniform motion unless acted on by a net external force.
This property is called inertia.

2 Newton's Second Law
The net force on an object equals its mass times its acceleration, F = ma.

3 Friction
Friction opposes relative motion between surfaces in contact. Kinetic friction is
usually smaller than static friction.
"""


class FakeModel:
    """Bag-of-words vectors: deterministic, and similar texts get similar vectors."""

    VOCAB = ["inertia", "rest", "force", "mass", "acceleration", "friction", "surfaces", "motion"]

    def encode(self, texts):
        rows = []
        for text in texts:
            lower = text.lower()
            v = np.array([lower.count(w) for w in self.VOCAB] + [0.01] * 376, dtype=np.float32)
            rows.append(v)
        return embeddings._normalize_rows(np.array(rows))


@pytest.fixture(autouse=True)
def fake_model(monkeypatch):
    monkeypatch.setattr(embeddings, "_get_model", lambda: FakeModel())
    doc_index._cache.clear()
    yield


@pytest.fixture
def fake_ipfs(monkeypatch):
    calls = []

    async def fetch(cid):
        calls.append(cid)
        return DOC.encode()

    monkeypatch.setattr(main, "fetch_file_from_ipfs", fetch)
    return calls


class FakeLlm(list):
    """Records each call's messages; `reply` is what the model says."""

    reply = "F = ma: force equals mass times acceleration [2]."


@pytest.fixture
def fake_llm(monkeypatch):
    seen = FakeLlm()

    def complete(messages, **kwargs):
        seen.append(messages)
        return {"text": seen.reply, "slot": "LLM_1", "model": "fake"}

    monkeypatch.setattr(llm, "complete", complete)
    return seen


# ── API ────────────────────────────────────────────────────────

def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"] == "Shadow Network AI Engine"


def test_health_is_public_and_degraded_without_mongo():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "degraded"
    assert body["models"] == {"embeddings": "not_loaded", "llm": []}


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


def test_ask_answers_from_retrieved_chunks_with_sources(fake_ipfs, fake_llm):
    r = client.post(
        "/ask",
        json={"cid": "QmDoc", "question": "What is the formula for force?", "mime_type": "text/plain"},
        headers=AUTH,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["confident"] is True
    assert body["answer"].startswith("F = ma")
    assert body["sources"] and "Second Law" in body["sources"][0]["section"]
    prompt = fake_llm[0][0]["content"]
    assert "F = ma" in prompt and "[1] Section:" in prompt


def test_index_is_built_once_per_cid(fake_ipfs, fake_llm):
    for question in ("What is inertia exactly?", "What does friction oppose?"):
        r = client.post("/ask", json={"cid": "QmDoc", "question": question, "mime_type": "text/plain"}, headers=AUTH)
        assert r.status_code == 200
    assert fake_ipfs == ["QmDoc"]  # the second question never touched IPFS


def test_no_answer_marker_is_not_confident(fake_ipfs, fake_llm):
    fake_llm.reply = "[NO_ANSWER] The document covers Newton's laws and friction."
    r = client.post(
        "/ask",
        json={"cid": "QmDoc", "question": "Who won the 1998 world cup?", "mime_type": "text/plain"},
        headers=AUTH,
    )
    body = r.json()
    assert body["confident"] is False
    assert body["answer"].startswith("I couldn't find")
    assert "[NO_ANSWER]" not in body["answer"]
    assert body["sources"] == []


def test_summarize_sends_whole_short_document(fake_ipfs, fake_llm):
    fake_llm.reply = "- Newton's laws\n- Friction"
    r = client.post("/summarize", json={"cid": "QmDoc", "mime_type": "text/plain", "title": "Physics"}, headers=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"] == "- Newton's laws\n- Friction"
    user_message = fake_llm[0][1]["content"]
    assert user_message.startswith("Document: Physics")
    assert "representative excerpts" not in user_message
    assert "Kinetic friction" in user_message


def test_missing_llm_config_is_503(fake_ipfs):
    r = client.post("/summarize", json={"cid": "QmDoc", "mime_type": "text/plain"}, headers=AUTH)
    assert r.status_code == 503
    assert "LLM_1_API_KEY" in r.json()["detail"]


def test_rate_limited_llm_is_429(fake_ipfs, monkeypatch):
    def complete(messages, **kwargs):
        raise llm.AllSlotsFailedError(["LLM_1 429 rate limit"])
    monkeypatch.setattr(llm, "complete", complete)
    monkeypatch.setattr(llm, "configured_slots", lambda slots=None: [object()])
    r = client.post("/summarize", json={"cid": "QmDoc", "mime_type": "text/plain"}, headers=AUTH)
    assert r.status_code == 429


# ── Extraction and chunking ────────────────────────────────────

def test_extract_txt_and_legacy_doc():
    assert extract_text("héllo".encode(), "text/plain") == "héllo"
    with pytest.raises(ValueError, match=".docx"):
        extract_text(b"\xd0\xcf", "application/msword")


def test_chunks_follow_headings_and_carry_breadcrumbs():
    chunks = chunk_document(DOC)
    sections = [c["section"] for c in chunks]
    assert "1 Newton's First Law" in sections
    assert "3 Friction" in sections
    assert all("Friction opposes" not in c["text"] for c in chunks if c["section"] != "3 Friction")


def test_nested_headings_keep_parent_in_breadcrumb():
    chunks = chunk_document("## Kinematics\nintro text\n### Velocity\nv = dx/dt")
    assert chunks[-1]["section"] == "Kinematics › Velocity"


def test_chunks_respect_hard_limit():
    text = "\n".join(["word " * 100] * 20) + "\n" + "x" * 5000 + "\n\n" + ("A sentence here. " * 300)
    chunks = chunk_document(text)
    assert chunks
    assert all(len(c["text"]) <= 1600 for c in chunks)


# ── Retrieval ──────────────────────────────────────────────────

def test_bm25_finds_exact_terms():
    bm25 = retrieval.Bm25(["photosynthesis in plants", "the krebs cycle", "plants need water"])
    scores = bm25.scores("explain the Krebs cycle")
    assert scores.index(max(scores)) == 1


def test_fusion_rewards_agreement():
    fused = dict(retrieval.fuse([[0, 1, 2], [2, 0, 1]]))
    assert max(fused, key=fused.get) == 0


def test_search_returns_document_order_and_falls_back_to_keywords():
    bm25 = retrieval.Bm25(["alpha", "beta gamma", "gamma delta"])
    positions, best = retrieval.search(bm25=bm25, vectors=None, query_vector=None, query="gamma")
    assert positions == [1, 2]
    assert best == 0.0


def test_mmr_selection_keeps_opening_chunk_and_budget():
    rng = np.random.default_rng(0)
    vectors = embeddings._normalize_rows(rng.normal(size=(40, 384)))
    lengths = [1000] * 40
    chosen = retrieval.select_representative(vectors, lengths, max_chars=10_000)
    assert chosen[0] == 0
    assert chosen == sorted(chosen)
    assert sum(lengths[i] for i in chosen) <= 10_000


def test_cited_numbers():
    assert retrieval.cited_numbers("A [2] and B [1][2], c [12]") == [2, 1, 12]


# ── Embeddings and LLM chain ───────────────────────────────────

def test_document_vector_is_unit_length():
    vectors = embeddings._normalize_rows(np.array([[3.0, 4.0] + [0] * 382, [0.0, 2.0] + [0] * 382]))
    v = embeddings.document_vector(vectors)
    assert abs(np.linalg.norm(v) - 1.0) < 1e-6


def test_llm_falls_back_to_next_slot(monkeypatch):
    class Resp:
        def __init__(self, status, payload):
            self.status_code, self._payload, self.text = status, payload, str(payload)

        def json(self):
            return self._payload

    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs["json"]["model"]))
        if len(calls) == 1:
            return Resp(429, {"error": "rate limited"})
        return Resp(200, {"choices": [{"message": {"content": "hello"}}]})

    monkeypatch.setattr(llm.httpx, "post", post)
    slots = [
        llm.Slot("LLM_1", "https://a.example/v1", "m1", "k1"),
        llm.Slot("LLM_2", "https://b.example/v1", "m2", "none"),  # off
        llm.Slot("LLM_3", "https://c.example/v1", "m3", "k3"),
    ]
    result = llm.complete([{"role": "user", "content": "hi"}], slots=slots)
    assert result == {"text": "hello", "slot": "LLM_3", "model": "m3"}
    assert calls == [("https://a.example/v1/chat/completions", "m1"), ("https://c.example/v1/chat/completions", "m3")]


def test_llm_reports_rate_limits(monkeypatch):
    class Resp:
        status_code, text = 429, "slow down"

    monkeypatch.setattr(llm.httpx, "post", lambda url, **kw: Resp())
    with pytest.raises(llm.AllSlotsFailedError) as err:
        llm.complete([], slots=[llm.Slot("LLM_1", "https://a.example/v1", "m", "k")])
    assert err.value.rate_limited


def test_near_empty_document_is_422_without_llm_call(monkeypatch, fake_llm):
    async def fetch(cid):
        return b"10/04/2026, 17:09 Slides - Google Slides https://docs.google.com/x 1/1"
    monkeypatch.setattr(main, "fetch_file_from_ipfs", fetch)
    r = client.post("/summarize", json={"cid": "QmEmpty", "mime_type": "text/plain"}, headers=AUTH)
    assert r.status_code == 422
    assert "almost no readable text" in r.json()["detail"]
    assert fake_llm == []


def test_plain_text_strips_markdown():
    raw = "## Answer\n- **Cortex-A** – rich OS [1]\n* __Cortex-M__ – MCUs\n2 ** 3 stays"
    assert llm.plain_text(raw) == "Answer\n- Cortex-A – rich OS [1]\n- Cortex-M – MCUs\n2 ** 3 stays"

# ai-engine/qa.py
# Answers questions about a document using deepset/roberta-base-squad2.
# This is EXTRACTIVE Q&A: the model finds the answer span within the text.
# It does NOT hallucinate — if the answer isn't in the doc, it says so.

import os
from transformers import pipeline
from extractor import chunk_text

# ── Model config ───────────────────────────────────────────────
MODEL_NAME = os.getenv("QA_MODEL", "deepset/roberta-base-squad2")

# Confidence threshold — answers below this score are flagged as uncertain
CONFIDENCE_THRESHOLD = 0.15

# ── Lazy load ──────────────────────────────────────────────────
_qa_pipeline = None


def get_qa_pipeline():
    """Returns the QA pipeline, loading it on first call."""
    global _qa_pipeline
    if _qa_pipeline is None:
        print(f"⏳ Loading Q&A model: {MODEL_NAME}...")
        _qa_pipeline = pipeline(
            "question-answering",
            model=MODEL_NAME,
            device=0 if _cuda_available() else -1,
        )
        print("✅ Q&A model loaded")
    return _qa_pipeline


def answer_question(question: str, context_text: str) -> dict:
    """
    Answer a question given the document text as context.

    Strategy for long documents:
    - Split text into overlapping chunks
    - Run Q&A on each chunk
    - Return the answer with the highest confidence score

    Returns:
        {
            "answer": str,
            "confidence": float,       # 0.0 to 1.0
            "confident": bool,         # True if above threshold
            "context_snippet": str,    # Surrounding text where answer was found
            "chunks_searched": int
        }
    """
    qa = get_qa_pipeline()

    # ── Short context: single pass ─────────────────────────────
    if len(context_text) <= 3000:
        return _run_qa(qa, question, context_text, chunks_searched=1)

    # ── Long context: search all chunks, pick best answer ──────
    chunks = chunk_text(context_text, max_chars=3000)
    best_result = None

    for chunk in chunks:
        result = _run_qa_raw(qa, question, chunk)
        if best_result is None or result["score"] > best_result["score"]:
            best_result = result

    return _format_result(best_result, chunks_searched=len(chunks))


def _run_qa(qa, question: str, context: str, chunks_searched: int) -> dict:
    """Run QA on a single context and return formatted result."""
    raw = _run_qa_raw(qa, question, context)
    result = _format_result(raw, chunks_searched=chunks_searched)
    return result


def _run_qa_raw(qa, question: str, context: str) -> dict:
    """Run the pipeline and return raw output dict."""
    return qa(
        question=question,
        context=context,
        max_answer_len=150,    # Max chars in the extracted answer span
        handle_impossible_answer=True,  # Returns "" if no answer found
    )


def _format_result(raw: dict, chunks_searched: int) -> dict:
    """
    Convert raw pipeline output into a clean API response.
    Handles the case where the model found no answer (empty string).
    """
    answer = raw.get("answer", "").strip()
    score = float(raw.get("score", 0.0))

    # Model signals "no answer" by returning empty string or very low score
    if not answer or score < 0.01:
        return {
            "answer": "I couldn't find a specific answer to that question in this document.",
            "confidence": 0.0,
            "confident": False,
            "context_snippet": "",
            "chunks_searched": chunks_searched,
        }

    # Extract a snippet of surrounding context (±200 chars around answer)
    context_snippet = raw.get("context_snippet", "")

    return {
        "answer": answer,
        "confidence": round(score, 4),
        "confident": score >= CONFIDENCE_THRESHOLD,
        "context_snippet": context_snippet,
        "chunks_searched": chunks_searched,
    }


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False

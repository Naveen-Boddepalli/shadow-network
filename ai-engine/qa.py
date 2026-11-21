# Extractive question answering: the model selects a span of the document as the
# answer rather than generating text, so it can only "say" what the document says.

import os

from extractor import chunk_text

MODEL_NAME = os.getenv("QA_MODEL", "deepset/minilm-uncased-squad2")

# Answers scoring below this are returned but flagged as low confidence.
CONFIDENCE_THRESHOLD = 0.15
CHUNK_CHARS = 3000

NO_ANSWER = "I couldn't find an answer to that question in this document."

_qa_pipeline = None


def is_loaded() -> bool:
    return _qa_pipeline is not None


def get_qa_pipeline():
    global _qa_pipeline
    if _qa_pipeline is None:
        import torch
        from transformers import pipeline

        print(f"Loading Q&A model {MODEL_NAME}...")
        _qa_pipeline = pipeline(
            "question-answering",
            model=MODEL_NAME,
            device=0 if torch.cuda.is_available() else -1,
        )
        print("Q&A model loaded")
    return _qa_pipeline


def answer_question(question: str, context_text: str) -> dict:
    """
    Run the model over each chunk of the document and keep the best non-empty answer.

    Returns: { answer, confidence (0–1), confident, chunks_searched }
    """
    qa = get_qa_pipeline()
    chunks = chunk_text(context_text, max_chars=CHUNK_CHARS) or [context_text]

    best = None
    for chunk in chunks:
        result = qa(
            question=question,
            context=chunk,
            max_answer_len=50,              # in tokens
            handle_impossible_answer=True,  # empty answer when the chunk has none
        )
        # An empty "no answer" in one chunk must not beat a real answer in another.
        if not result.get("answer", "").strip():
            continue
        if best is None or result["score"] > best["score"]:
            best = result

    if best is None or best["score"] < 0.01:
        return {"answer": NO_ANSWER, "confidence": 0.0, "confident": False, "chunks_searched": len(chunks)}

    score = float(best["score"])
    return {
        "answer": best["answer"].strip(),
        "confidence": round(score, 4),
        "confident": score >= CONFIDENCE_THRESHOLD,
        "chunks_searched": len(chunks),
    }

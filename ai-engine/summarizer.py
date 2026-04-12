# ai-engine/summarizer.py
# Summarizes text using facebook/bart-large-cnn (free, runs locally).
# Model is downloaded once from HuggingFace and cached on disk.

import os
from transformers import pipeline
from extractor import chunk_text

# ── Model config ───────────────────────────────────────────────
MODEL_NAME = os.getenv("SUMMARIZATION_MODEL", "facebook/bart-large-cnn")
MAX_OUTPUT = int(os.getenv("SUMMARY_MAX_LENGTH", 200))
MIN_OUTPUT = int(os.getenv("SUMMARY_MIN_LENGTH", 50))

# ── Lazy load — model loads once, reused for all requests ──────
# Loading a transformer model takes ~5 seconds, so we do it once at startup.
_summarizer = None


def get_summarizer():
    """
    Returns the summarization pipeline, loading it on first call.
    Uses lazy initialization so server starts fast.
    """
    global _summarizer
    if _summarizer is None:
        print(f"⏳ Loading summarization model: {MODEL_NAME} (first load may take a minute)...")
        _summarizer = pipeline(
            "summarization",
            model=MODEL_NAME,
            # Use GPU if available, otherwise CPU
            device=0 if _cuda_available() else -1,
        )
        print("✅ Summarization model loaded")
    return _summarizer


def summarize(text: str) -> dict:
    """
    Summarizes the given text.

    For short texts (< 1000 chars): summarize directly.
    For long texts: chunk → summarize each chunk → combine → summarize again.

    Returns:
        {
            "summary": str,
            "word_count_original": int,
            "word_count_summary": int,
            "chunks_processed": int
        }
    """
    summarizer = get_summarizer()
    original_word_count = len(text.split())

    # ── Short text: direct summarization ──────────────────────
    if len(text) <= 3000:
        result = _summarize_chunk(summarizer, text)
        return {
            "summary": result,
            "word_count_original": original_word_count,
            "word_count_summary": len(result.split()),
            "chunks_processed": 1,
        }

    # ── Long text: map-reduce summarization ───────────────────
    # Step 1: Split into chunks
    chunks = chunk_text(text, max_chars=3000)

    # Step 2: Summarize each chunk individually
    chunk_summaries = []
    for i, chunk in enumerate(chunks):
        print(f"  Summarizing chunk {i+1}/{len(chunks)}...")
        chunk_summary = _summarize_chunk(summarizer, chunk)
        chunk_summaries.append(chunk_summary)

    # Step 3: Combine all chunk summaries into one text
    combined = " ".join(chunk_summaries)

    # Step 4: Final summarization of the combined summaries
    if len(combined) > 3000:
        # Still too long — do one more pass
        final_summary = _summarize_chunk(summarizer, combined[:3000])
    else:
        final_summary = _summarize_chunk(summarizer, combined)

    return {
        "summary": final_summary,
        "word_count_original": original_word_count,
        "word_count_summary": len(final_summary.split()),
        "chunks_processed": len(chunks),
    }


def _summarize_chunk(summarizer, text: str) -> str:
    """
    Summarize a single chunk of text.
    Handles edge case where text is already shorter than min_length.
    """
    word_count = len(text.split())

    # If the text is already very short, don't try to summarize
    if word_count < 30:
        return text

    # Adjust min/max dynamically to avoid model errors
    max_len = min(MAX_OUTPUT, max(30, word_count // 2))
    min_len = min(MIN_OUTPUT, max_len - 10)

    result = summarizer(
        text,
        max_length=max_len,
        min_length=min_len,
        do_sample=False,        # Deterministic output
        truncation=True,        # Truncate input if over model's token limit
    )
    return result[0]["summary_text"]


def _cuda_available() -> bool:
    """Check if a CUDA GPU is available for faster inference."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False

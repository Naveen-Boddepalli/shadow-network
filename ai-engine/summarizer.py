# Abstractive summarization with a distilled BART model (CNN/DailyMail fine-tune).
# The model is downloaded from Hugging Face on first use and cached on disk.

import os

from extractor import chunk_text

MODEL_NAME = os.getenv("SUMMARIZATION_MODEL", "sshleifer/distilbart-cnn-6-6")
MAX_OUTPUT = int(os.getenv("SUMMARY_MAX_LENGTH", 200))  # tokens
MIN_OUTPUT = int(os.getenv("SUMMARY_MIN_LENGTH", 50))   # tokens

# ~3000 characters stays under BART's 1024-token input limit for typical English.
CHUNK_CHARS = 3000
# Bound the work for very long documents; later chunks are skipped.
MAX_CHUNKS = 30

_summarizer = None


def is_loaded() -> bool:
    return _summarizer is not None


def get_summarizer():
    global _summarizer
    if _summarizer is None:
        import torch
        from transformers import pipeline

        print(f"Loading summarization model {MODEL_NAME} (the first download can take a while)...")
        _summarizer = pipeline(
            "summarization",
            model=MODEL_NAME,
            device=0 if torch.cuda.is_available() else -1,
        )
        print("Summarization model loaded")
    return _summarizer


def summarize(text: str) -> dict:
    """
    Short texts are summarized directly. Long texts are map-reduced: each chunk is
    summarized, then the joined chunk summaries are summarized again until the
    result fits in one chunk.

    Returns: { summary, word_count_original, word_count_summary, chunks_processed }
    """
    model = get_summarizer()
    original_word_count = len(text.split())

    chunks = chunk_text(text, max_chars=CHUNK_CHARS, overlap_paragraphs=0)[:MAX_CHUNKS] or [text]
    chunks_processed = len(chunks)

    while len(chunks) > 1:
        combined = " ".join(_summarize_chunk(model, c) for c in chunks)
        next_chunks = chunk_text(combined, max_chars=CHUNK_CHARS, overlap_paragraphs=0) or [combined]
        if len(next_chunks) >= len(chunks):
            # Not shrinking (e.g. chunks too short to summarize); stop instead of looping.
            next_chunks = [combined[:CHUNK_CHARS]]
        chunks = next_chunks
    summary = _summarize_chunk(model, chunks[0])

    return {
        "summary": summary,
        "word_count_original": original_word_count,
        "word_count_summary": len(summary.split()),
        "chunks_processed": chunks_processed,
    }


def _summarize_chunk(model, text: str) -> str:
    word_count = len(text.split())
    if word_count < 30:
        return text.strip()  # already shorter than any useful summary

    # Keep the requested lengths sensible for short inputs.
    max_len = min(MAX_OUTPUT, max(30, word_count // 2))
    min_len = max(5, min(MIN_OUTPUT, max_len - 10))

    result = model(
        text,
        max_length=max_len,
        min_length=min_len,
        do_sample=False,
        truncation=True,
    )
    return result[0]["summary_text"].strip()

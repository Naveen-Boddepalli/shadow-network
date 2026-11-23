# Document summaries with one LLM call.
#
# Short documents go to the model whole. Long ones are not map-reduced (one call
# per chunk would burn free-tier rate limits and take minutes); instead the
# chunks that best cover the document are picked with MMR over the chunk vectors
# the retrieval index already holds, up to a fixed input budget, and sent in
# document order. The backend caches each summary on the note, so this runs once
# per document.

import os

import llm
from doc_index import DocIndex
from retrieval import select_representative

# ~6k tokens of input: fits comfortably in free-tier tokens-per-minute limits.
INPUT_BUDGET_CHARS = int(os.getenv("SUMMARY_INPUT_CHARS", 24_000))
SUMMARY_WORDS = int(os.getenv("SUMMARY_WORDS", 250))

SYSTEM_PROMPT = (
    "You summarize study documents (lecture notes, papers, textbook chapters) for students. "
    "Write a faithful summary using only the text provided: never add facts, figures or claims "
    "that are not in it. Start with one or two sentences on what the document is about, then "
    "cover the key ideas, definitions, results and conclusions as short bullet points. "
    f"Keep it under {SUMMARY_WORDS} words. Plain text with '-' bullets only: no headings, no tables."
)


def summarize(index: DocIndex, title: str | None = None) -> dict:
    """Returns { summary, word_count_original, word_count_summary, chunks_processed }."""
    lengths = [len(c["text"]) + len(c["section"]) + 2 for c in index.chunks]
    if sum(lengths) <= INPUT_BUDGET_CHARS:
        positions = list(range(len(index.chunks)))
        partial = index.truncated
    else:
        positions = select_representative(index.vectors, lengths, INPUT_BUDGET_CHARS)
        partial = True

    parts, last_section = [], None
    for i in positions:
        chunk = index.chunks[i]
        if chunk["section"] and chunk["section"] != last_section:
            parts.append(f"## {chunk['section']}")
            last_section = chunk["section"]
        parts.append(chunk["text"])
    body = "\n\n".join(parts)

    note = (
        "These are representative excerpts from a longer document, in their original order; "
        "summarize the document as a whole from them.\n\n"
        if partial else ""
    )
    heading = f"Document: {title}\n\n" if title else ""
    result = llm.complete(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{heading}{note}{body}"},
        ],
        max_tokens=900,
        temperature=0.2,
        timeout=60.0,
    )
    summary = result["text"].strip()
    return {
        "summary": summary,
        "word_count_original": index.word_count,
        "word_count_summary": len(summary.split()),
        "chunks_processed": len(positions),
    }

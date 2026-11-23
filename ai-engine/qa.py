# Retrieval-augmented question answering over one document.
#
# Hybrid search (BM25 + embeddings, fused by rank) picks the few chunks that
# matter, and the LLM answers from those numbered excerpts only, citing them as
# [1], [2]. A question therefore costs one small embedding and one LLM call with
# ~2k tokens of context, however long the document is.

import re

import embeddings
import llm
import retrieval
from doc_index import DocIndex

TOP_K = 6
MAX_CONTEXT_CHARS = 9_000
NO_ANSWER_MARK = "[NO_ANSWER]"
NO_ANSWER = "I couldn't find an answer to that question in this document."


def build_messages(question: str, excerpts: list[dict], title: str | None) -> list[dict]:
    context = "\n\n---\n\n".join(
        f"[{e['n']}] Section: {e['section'] or '(untitled)'}\n{e['text']}" for e in excerpts
    )
    doc = f'the document "{title}"' if title else "this document"
    return [
        {
            "role": "system",
            "content": (
                f"You are a study assistant answering questions about {doc} for a student.\n\n"
                "Rules:\n"
                "- Answer only from the numbered excerpts below. Cite the excerpts you used inline "
                "as [1], [2] etc.\n"
                "- Never invent facts, figures, formulas or quotes that are not in the excerpts. You may "
                "explain a concept the excerpts mention in simpler words.\n"
                f"- If the excerpts do not contain the answer, reply with {NO_ANSWER_MARK} followed by one "
                "sentence on what the document does cover that is closest, if anything.\n"
                "- Be concise: a short paragraph or a few '-' bullets, under 150 words unless the question "
                "asks for detail. Plain text only: no headings, no tables.\n\n"
                f"Excerpts:\n\n{context or '(none matched this question)'}"
            ),
        },
        {"role": "user", "content": question},
    ]


def answer_question(question: str, index: DocIndex, title: str | None = None) -> dict:
    """Returns { answer, confidence, confident, chunks_searched, sources }."""
    query_vector = embeddings.embed_text(question)
    positions, best_similarity = retrieval.search(
        bm25=index.bm25,
        vectors=index.vectors,
        query_vector=query_vector,
        query=question,
        limit=TOP_K,
    )

    excerpts, used = [], 0
    for i in positions:
        chunk = index.chunks[i]
        if used + len(chunk["text"]) > MAX_CONTEXT_CHARS and excerpts:
            break
        used += len(chunk["text"])
        excerpts.append({"n": len(excerpts) + 1, "section": chunk["section"], "text": chunk["text"]})

    if not excerpts:
        return {
            "answer": NO_ANSWER, "confidence": 0.0, "confident": False,
            "chunks_searched": len(index.chunks), "sources": [],
        }

    text = llm.plain_text(
        llm.complete(build_messages(question, excerpts, title), max_tokens=700, temperature=0.1)["text"]
    )

    found = NO_ANSWER_MARK not in text
    answer = text.replace(NO_ANSWER_MARK, "").strip()
    if not found:
        answer = f"{NO_ANSWER} {answer}".strip() if answer else NO_ANSWER

    cited = [n for n in retrieval.cited_numbers(answer) if 1 <= n <= len(excerpts)]
    sources = [
        {"n": e["n"], "section": e["section"], "excerpt": re.sub(r"\s+", " ", e["text"])[:240]}
        for e in excerpts
        if e["n"] in cited
    ] if found else []

    return {
        "answer": answer,
        # Best cosine similarity between the question and a retrieved chunk: a rough
        # signal of how well the document covers the question, not a probability.
        "confidence": round(best_similarity, 4),
        "confident": found,
        "chunks_searched": len(index.chunks),
        "sources": sources,
    }

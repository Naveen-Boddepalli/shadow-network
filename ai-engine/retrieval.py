# Hybrid retrieval over one document's chunks: BM25 keyword scores and embedding
# similarity, merged with reciprocal rank fusion (ported from Tessera).
#
# Keywords catch exact terms the embedding model has never seen (a formula name,
# "CRISPR-Cas9", a section number); embeddings catch paraphrases ("why does the
# ball slow down" -> a section on friction).
#
# Pure functions only (no model, no database) so they are unit tested directly.

import math
import re

import numpy as np

STOPWORDS = set(
    (
        "a an and are as at be but by can do does for from has have how i in is it its me of on or "
        "so than that the their them there these this to was were what when where which who why will "
        "with would you your about explain tell document notes mean means please give"
    ).split()
)

_TOKEN = re.compile(r"[a-z0-9%][a-z0-9%./+-]*")


def tokenize(text: str) -> list[str]:
    tokens = (t.rstrip(".,/+-") for t in _TOKEN.findall(text.lower()))
    return [t for t in tokens if len(t) > 1 and t not in STOPWORDS]


class Bm25:
    def __init__(self, texts: list[str], k1: float = 1.2, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs = []
        for text in texts:
            counts: dict[str, int] = {}
            for token in tokenize(text):
                counts[token] = counts.get(token, 0) + 1
            self.docs.append(counts)
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg_length = sum(self.lengths) / max(len(self.lengths), 1) or 1.0
        self.df: dict[str, int] = {}
        for doc in self.docs:
            for token in doc:
                self.df[token] = self.df.get(token, 0) + 1

    def scores(self, query: str) -> list[float]:
        terms = set(tokenize(query))
        total = len(self.docs)
        out = []
        for doc, length in zip(self.docs, self.lengths):
            score = 0.0
            for term in terms:
                tf = doc.get(term)
                if not tf:
                    continue
                df = self.df[term]
                idf = math.log(1 + (total - df + 0.5) / (df + 0.5))
                score += idf * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * length / self.avg_length))
            out.append(score)
        return out


def _ranking(scores, floor: float) -> list[int]:
    """Positions best-first, dropping anything at or below the floor."""
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    return [i for i in order if scores[i] > floor]


def fuse(rankings: list[list[int]], k: int = 60) -> list[tuple[int, float]]:
    """
    Reciprocal rank fusion: each list contributes 1/(k + rank). Robust to the two
    scores living on completely different scales, unlike a weighted sum.
    """
    fused: dict[int, float] = {}
    for ranking in rankings:
        for rank, position in enumerate(ranking):
            fused[position] = fused.get(position, 0.0) + 1.0 / (k + rank + 1)
    return sorted(fused.items(), key=lambda item: item[1], reverse=True)


# Below ~0.2 MiniLM cosine similarity is noise; leave those chunks to BM25.
COSINE_FLOOR = 0.2


def search(
    *,
    bm25: Bm25,
    vectors: np.ndarray | None,
    query_vector: np.ndarray | None,
    query: str,
    limit: int = 6,
) -> tuple[list[int], float]:
    """
    Best chunk positions for the query, in document order, plus the best cosine
    similarity among them (0 when only keywords matched).
    """
    lists = [_ranking(bm25.scores(query), 0.0)]
    cosine = None
    if vectors is not None and query_vector is not None and len(vectors):
        cosine = vectors @ query_vector  # unit vectors: dot product == cosine
        lists.append(_ranking(cosine, COSINE_FLOOR))

    top = [position for position, _ in fuse(lists)[:limit]]
    best = max((float(cosine[i]) for i in top), default=0.0) if cosine is not None else 0.0
    # Document order reads better than score order once the model has them all.
    return sorted(top), max(best, 0.0)


def select_representative(vectors: np.ndarray, budget: list[int], max_chars: int, lam: float = 0.7) -> list[int]:
    """
    Pick chunks that cover a long document within a character budget, for a
    one-call summary instead of map-reduce. Maximal marginal relevance against the
    document centroid: each pick is central to the document (relevance) but unlike
    what is already picked (diversity). The opening chunk is always kept, since
    introductions state what a document is about. Returns positions in document order.

    `budget` holds each chunk's length in characters.
    """
    n = len(budget)
    if n == 0:
        return []
    centroid = vectors.mean(axis=0)
    centroid /= max(np.linalg.norm(centroid), 1e-12)
    relevance = vectors @ centroid

    chosen = [0]
    used = budget[0]
    max_sim = vectors @ vectors[0]  # each chunk's similarity to its closest chosen chunk
    candidates = set(range(1, n))
    while candidates:
        best = max(candidates, key=lambda i: lam * relevance[i] - (1 - lam) * max_sim[i])
        candidates.discard(best)
        if used + budget[best] > max_chars:
            continue  # too long for what's left; a shorter one may still fit
        chosen.append(best)
        used += budget[best]
        max_sim = np.maximum(max_sim, vectors @ vectors[best])
    return sorted(chosen)


_CITATION = re.compile(r"\[(\d{1,2})\]")


def cited_numbers(answer: str) -> list[int]:
    """Excerpt numbers cited in an answer as [1], [2], in first-cited order."""
    seen: list[int] = []
    for match in _CITATION.finditer(answer):
        n = int(match.group(1))
        if n not in seen:
            seen.append(n)
    return seen

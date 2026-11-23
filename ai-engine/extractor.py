# Plain-text extraction from uploaded documents, plus section-aware chunking for retrieval.

import io
import re

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def extract_text(file_bytes: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        return _extract_pdf(file_bytes)
    if mime_type == DOCX:
        return _extract_docx(file_bytes)
    if mime_type == "application/msword":
        raise ValueError("Legacy .doc files can't be read. Save the file as .docx or PDF and re-upload.")
    if mime_type == "text/plain":
        return _extract_txt(file_bytes)
    raise ValueError(f"Text can't be extracted from {mime_type} files")


def _extract_pdf(file_bytes: bytes) -> str:
    import pdfplumber

    parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text and text.strip():
                parts.append(text)
    full_text = "\n\n".join(parts)
    if not full_text.strip():
        raise ValueError("No text found in PDF. It may be a scanned image.")
    return full_text


def _extract_docx(file_bytes: bytes) -> str:
    import docx

    doc = docx.Document(io.BytesIO(file_bytes))
    parts = []
    for p in doc.paragraphs:
        if not p.text.strip():
            continue
        # Keep Word's heading styles as markdown markers so chunks know their section.
        style = (p.style.name or "") if p.style is not None else ""
        level = re.match(r"Heading (\d)", style)
        parts.append(f"{'#' * (int(level.group(1)) + 1)} {p.text.strip()}" if level else p.text)
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
            if row_text:
                parts.append(row_text)
    full_text = "\n".join(parts)
    if not full_text.strip():
        raise ValueError("No text found in DOCX file.")
    return full_text


def _extract_txt(file_bytes: bytes) -> str:
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")
    if not text.strip():
        raise ValueError("The text file is empty.")
    return text




# ── Chunking ───────────────────────────────────────────────────
#
# Chunks never cross a heading, so each belongs to one section, and each carries
# that section's breadcrumb so it still makes sense when read on its own (by the
# embedding model, by BM25 and by the LLM).

# Soft and hard limits on a chunk, in characters. ~1000 characters is about the
# 256 word-piece window MiniLM actually reads, so nothing past it is wasted.
TARGET_CHARS = 1000
MAX_CHARS = 1600

_NUMBERED = re.compile(r"^((?:\d{1,2}\.){0,3}\d{1,2})\.?\s+[A-Za-z]")
_KEYWORD = re.compile(r"^(chapter|unit|module|lecture|lesson|part|section|appendix)\s+[\dIVXLA-Z]+\b", re.I)
_MARKDOWN = re.compile(r"^(#{1,6})\s+(.+)$")


def _heading_level(line: str) -> int | None:
    """Heading level (1 = top) for lines that look like headings in extracted text, else None."""
    md = _MARKDOWN.match(line)
    if md:
        return len(md.group(1))
    if len(line) > 80 or not re.search(r"[A-Za-z]{2}", line) or line.endswith((".", ",", ";")):
        return None
    if _KEYWORD.match(line):
        return 1
    numbered = _NUMBERED.match(line)
    if numbered and len(line.split()) <= 12:
        return numbered.group(1).count(".") + 1
    letters = [c for c in line if c.isalpha()]
    if len(letters) >= 4 and all(c.isupper() for c in letters) and len(line.split()) <= 10:
        return 2
    return None


def _split_oversized(block: str) -> list[str]:
    """Break a block over MAX_CHARS on lines, then sentences, then brute force."""
    if len(block) <= MAX_CHARS:
        return [block]
    lines = block.split("\n")
    units = lines if len(lines) > 1 else re.split(r"(?<=[.!?])\s+", block)
    units = [u[i:i + MAX_CHARS] for u in units for i in range(0, len(u), MAX_CHARS)]
    joiner = "\n" if len(lines) > 1 else " "

    parts, current, size = [], [], 0
    for unit in units:
        if current and size + len(unit) > TARGET_CHARS:
            parts.append(joiner.join(current))
            current, size = [], 0
        current.append(unit)
        size += len(unit) + 1
    if current:
        parts.append(joiner.join(current))
    return parts


def chunk_document(text: str) -> list[dict]:
    """
    Split extracted text into [{section, text}] chunks of ~TARGET_CHARS that never
    cross a heading. `section` is a breadcrumb like "2 Kinematics › 2.1 Velocity".
    """
    sections = [{"crumb": "", "lines": []}]
    trail: list[tuple[int, str]] = []  # open headings as (level, text)

    for raw in text.split("\n"):
        line = raw.strip()
        level = _heading_level(line) if line else None
        if level is None:
            sections[-1]["lines"].append(line)
            continue
        title = _MARKDOWN.sub(r"\2", line).strip()
        trail = [(lv, t) for lv, t in trail if lv < level] + [(level, title)]
        sections.append({"crumb": " › ".join(t for _, t in trail[-2:]), "lines": []})

    chunks = []
    for section in sections:
        # Blank lines separate blocks; PDF pages are joined with one, too.
        blocks, current = [], []
        for line in section["lines"] + [""]:
            if line:
                current.append(line)
            elif current:
                blocks.append("\n".join(current))
                current = []

        packed, size = [], 0
        for block in (part for b in blocks for part in _split_oversized(b)):
            if packed and size + len(block) > TARGET_CHARS:
                chunks.append({"section": section["crumb"], "text": "\n".join(packed)})
                packed, size = [], 0
            packed.append(block)
            size += len(block) + 1
        if packed:
            chunks.append({"section": section["crumb"], "text": "\n".join(packed)})
    return chunks


def chunk_search_text(chunk: dict) -> str:
    """What gets embedded and keyword-indexed: breadcrumb first."""
    return f"{chunk['section']}\n{chunk['text']}" if chunk["section"] else chunk["text"]

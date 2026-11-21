# Plain-text extraction from uploaded documents, plus chunking for the models.

import io

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
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
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


def _split_long(paragraph: str, max_chars: int) -> list[str]:
    """Split an over-long paragraph at whitespace so no piece exceeds max_chars."""
    pieces, current = [], ""
    for word in paragraph.split():
        while len(word) > max_chars:  # pathological unbroken token
            if current:
                pieces.append(current)
                current = ""
            pieces.append(word[:max_chars])
            word = word[max_chars:]
        if current and len(current) + 1 + len(word) > max_chars:
            pieces.append(current)
            current = word
        else:
            current = f"{current} {word}" if current else word
    if current:
        pieces.append(current)
    return pieces


def chunk_text(text: str, max_chars: int = 3000, overlap_paragraphs: int = 2) -> list[str]:
    """
    Group lines into chunks of at most ~max_chars, carrying the last few lines of
    each chunk into the next so answers spanning a boundary aren't lost.
    """
    paragraphs = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        paragraphs.extend(_split_long(line, max_chars) if len(line) > max_chars else [line])

    chunks, current, current_len = [], [], 0
    for para in paragraphs:
        if current and current_len + len(para) > max_chars:
            chunks.append("\n".join(current))
            current = current[-overlap_paragraphs:] if overlap_paragraphs else []
            current_len = sum(len(p) for p in current)
            # Drop overlap that would push the new chunk over the limit
            while current and current_len + len(para) > max_chars:
                current_len -= len(current.pop(0))
        current.append(para)
        current_len += len(para)
    if current:
        chunks.append("\n".join(current))
    return chunks

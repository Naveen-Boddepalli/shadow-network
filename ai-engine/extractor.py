# ai-engine/extractor.py
import io
import pdfplumber
import docx

def extract_text(file_bytes: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        return _extract_pdf(file_bytes)
    elif mime_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ):
        return _extract_docx(file_bytes)
    elif mime_type == "text/plain":
        return _extract_txt(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {mime_type}")

def _extract_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text and text.strip():
                text_parts.append(f"[Page {i+1}]\n{text}")
    full_text = "\n\n".join(text_parts)
    if not full_text.strip():
        raise ValueError("No text found in PDF. It may be a scanned image.")
    return full_text

def _extract_docx(file_bytes: bytes) -> str:
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
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return file_bytes.decode("latin-1")

def chunk_text(text: str, max_chars: int = 3000) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks, current_chunk, current_len = [], [], 0
    for para in paragraphs:
        if current_len + len(para) > max_chars and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = current_chunk[-2:]
            current_len = sum(len(p) for p in current_chunk)
        current_chunk.append(para)
        current_len += len(para)
    if current_chunk:
        chunks.append("\n".join(current_chunk))
    return chunks

import io
import logging
import mimetypes
import os
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

TEXT_EXTENSIONS = {
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".xml",
    ".yaml", ".yml", ".html", ".htm", ".css", ".sql", ".env", ".log",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".c", ".cpp", ".h", ".hpp",
    ".cs", ".java", ".go", ".rs", ".php", ".rb", ".sh", ".bash", ".bat", ".ps1",
}

PDF_EXTENSIONS = {".pdf"}
DOCX_EXTENSIONS = {".docx"}

MEDIA_EXTENSIONS = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".qt": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
}

MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


def extract_pdf_text(file_bytes: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                pages_text.append(f"--- Page {idx + 1} ---\n{text.strip()}")
        extracted = "\n\n".join(pages_text).strip()
        return extracted if extracted else "[Note: PDF contains no extractable text or consists purely of scanned images.]"
    except Exception as e:
        logger.error("Failed to parse PDF: %s", e)
        return f"[Error extracting PDF text: {str(e)}]"


def extract_docx_text(file_bytes: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            paragraphs = []
            for p in tree.iter():
                if p.tag.endswith("}p"):
                    p_texts = [elem.text for elem in p.iter() if elem.tag.endswith("}t") and elem.text]
                    line = "".join(p_texts).strip()
                    if line:
                        paragraphs.append(line)
            extracted = "\n\n".join(paragraphs).strip()
            return extracted if extracted else "[Note: Document contains no extractable text.]"
    except Exception as e:
        logger.error("Failed to parse DOCX: %s", e)
        return f"[Error extracting DOCX text: {str(e)}]"


def parse_uploaded_file(filename: str, file_bytes: bytes) -> Dict[str, Any]:
    """
    Parses an uploaded file based on its extension.
    Returns:
      {
         "type": "text" | "pdf" | "docx" | "media" | "unsupported",
         "filename": str,
         "mime_type": str,
         "text_content": Optional[str],
         "media_payload": Optional[dict],
         "error": Optional[str]
      }
    """
    if len(file_bytes) > MAX_FILE_SIZE:
        return {
            "type": "unsupported",
            "filename": filename,
            "mime_type": "application/octet-stream",
            "text_content": None,
            "media_payload": None,
            "error": "File size exceeds the 25MB maximum limit.",
        }

    _, ext = os.path.splitext(filename.lower())

    # 1. Plain text / Code / Data files
    if ext in TEXT_EXTENSIONS:
        try:
            try:
                decoded = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                decoded = file_bytes.decode("latin-1")
            return {
                "type": "text",
                "filename": filename,
                "mime_type": mimetypes.guess_type(filename)[0] or "text/plain",
                "text_content": decoded,
                "media_payload": None,
                "error": None,
            }
        except Exception as e:
            return {
                "type": "unsupported",
                "filename": filename,
                "mime_type": "text/plain",
                "text_content": None,
                "media_payload": None,
                "error": f"Failed to read text file: {str(e)}",
            }

    # 2. PDF Documents
    if ext in PDF_EXTENSIONS:
        text = extract_pdf_text(file_bytes)
        return {
            "type": "pdf",
            "filename": filename,
            "mime_type": "application/pdf",
            "text_content": text,
            "media_payload": None,
            "error": None,
        }

    # 3. Microsoft Word (.docx)
    if ext in DOCX_EXTENSIONS:
        text = extract_docx_text(file_bytes)
        return {
            "type": "docx",
            "filename": filename,
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text_content": text,
            "media_payload": None,
            "error": None,
        }

    # 4. Images & Videos
    if ext in MEDIA_EXTENSIONS:
        mime = MEDIA_EXTENSIONS[ext]
        return {
            "type": "media",
            "filename": filename,
            "mime_type": mime,
            "text_content": None,
            "media_payload": {
                "filename": filename,
                "mime_type": mime,
                "data": file_bytes,
            },
            "error": None,
        }

    return {
        "type": "unsupported",
        "filename": filename,
        "mime_type": mimetypes.guess_type(filename)[0] or "application/octet-stream",
        "text_content": None,
        "media_payload": None,
        "error": f"Unsupported file type '{ext}'. Supported formats include Documents (.pdf, .docx, .txt, .md, .csv, code), Images (.png, .jpg, .webp, .gif), and Videos (.mp4, .mov, .webm).",
    }

import asyncio
import base64
import io
import logging
import re
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)


# Known Whisper silence / low-noise hallucinations to discard
WHISPER_HALLUCINATIONS = {
    "thank you", "thank you.", "thank you very much.", "thank you very much",
    "thanks for watching.", "thanks for watching!", "thanks for watching",
    "you", "mbc", "subtitles by", "[blank_audio]", "bye", "bye.", "goodbye",
    "goodbye.", "good bye.", "see you next time.", "please subscribe",
    "subscribe", "amara.org", "translated by", "i'm sorry.", "so", "the end.",
    "...", ".", "..", "listening...", "thank you for watching", "thank you for watching.",
    "thank you!", "thanks.", "watching", "shh", "silence",
}


def clean_markdown_for_tts(text: str, max_chars: int = 320) -> str:
    """
    Strips code blocks, Markdown links, headers, asterisks, tables,
    and HTML tags so Text-To-Speech reads smooth, natural language.
    Keeps spoken summary concise (1-3 sentences) so Edge-TTS generates
    audio instantly in-memory without latency.
    """
    if not text:
        return ""

    # Remove code blocks entirely (including calendar-card, email-draft, json, illustration-card, etc.)
    clean = re.sub(r"```[\s\S]*?```", "", text)
    # Remove raw JSON objects or structures
    clean = re.sub(r"\{[\s\S]*?\}", "", clean)
    # Remove inline code
    clean = re.sub(r"`([^`]+)`", r"\1", clean)
    # Convert markdown links [text](url) -> text
    clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", clean)
    # Remove URLs
    clean = re.sub(r"https?://\S+", "", clean)
    # Remove images ![alt](url)
    clean = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", "", clean)
    # Remove headers (### Header)
    clean = re.sub(r"#{1,6}\s*", "", clean)
    # Remove bold/italic markers
    clean = re.sub(r"[*_~]{1,3}([^*_~]+)[*_~]{1,3}", r"\1", clean)
    clean = re.sub(r"[*_~]", "", clean)
    # Remove HTML tags
    clean = re.sub(r"<[^>]+>", "", clean)
    # Remove markdown blockquotes
    clean = re.sub(r"^\s*>\s*", "", clean, flags=re.MULTILINE)
    # Remove bullet markers
    clean = re.sub(r"^\s*[-*+•]\s+", "", clean, flags=re.MULTILINE)
    # Remove table formatting
    clean = re.sub(r"\|", " ", clean)
    clean = re.sub(r"-{3,}", " ", clean)
    # Remove emojis that sound awkward when spoken
    clean = re.sub(r"[\U00010000-\U0010ffff]", "", clean)
    # Normalize excessive whitespace
    clean = re.sub(r"\s+", " ", clean).strip()

    if not clean:
        return ""

    # For ultra-fast conversational voice response, extract first 2-3 sentences
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    spoken = ""
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(spoken) + len(s) + 1 <= max_chars or not spoken:
            spoken = f"{spoken} {s}".strip() if spoken else s
        else:
            break

    if not spoken:
        spoken = clean[:max_chars].strip()

    return spoken


async def transcribe_audio(audio_bytes: bytes, filename: str = "recording.webm") -> str:
    """
    Transcribes audio bytes using Groq Whisper (whisper-large-v3-turbo / whisper-large-v3)
    with explicit language='en' and temperature=0.0 for maximum accuracy and speed.
    Filters out Whisper silence hallucinations.
    """
    settings = get_settings()
    if not settings.GROQ_API_KEY:
        logger.warning("GROQ_API_KEY is not set for Whisper transcription.")
        return ""

    if not audio_bytes or len(audio_bytes) < 500:
        return ""

    try:
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        bio = io.BytesIO(audio_bytes)
        bio.name = filename or "recording.webm"

        raw = ""
        # 1. Primary: whisper-large-v3-turbo (fastest, optimized latency)
        try:
            transcription = client.audio.transcriptions.create(
                file=(bio.name, bio),
                model="whisper-large-v3-turbo",
                language="en",
                temperature=0.0,
                response_format="text",
            )
            raw = str(transcription).strip()
            logger.info("whisper-large-v3-turbo transcript: '%s'", raw)
        except Exception as turbo_err:
            logger.warning("whisper-large-v3-turbo failed (%s); falling back to whisper-large-v3", turbo_err)
            bio.seek(0)
            transcription = client.audio.transcriptions.create(
                file=(bio.name, bio),
                model="whisper-large-v3",
                language="en",
                temperature=0.0,
                response_format="text",
            )
            raw = str(transcription).strip()
            logger.info("whisper-large-v3 transcript: '%s'", raw)

        clean_transcript = raw.strip()

        # Check for empty or single/double punctuation
        alphanumeric = re.sub(r"[\W_]+", "", clean_transcript)
        if len(alphanumeric) < 2:
            logger.info("Filtered silence/punctuation-only transcript: '%s'", clean_transcript)
            return ""

        # Check for known Whisper hallucinations on silence / low room noise
        lower_clean = clean_transcript.lower().strip()
        if lower_clean in WHISPER_HALLUCINATIONS or any(h == lower_clean for h in WHISPER_HALLUCINATIONS):
            logger.info("Filtered Whisper hallucination: '%s'", clean_transcript)
            return ""

        return clean_transcript
    except Exception as e:
        logger.error("Groq Whisper transcription failed: %s", e)
        return ""


async def text_to_speech_base64(text: str, voice: str = "en-US-AriaNeural") -> str:
    """
    Synthesizes speech using edge-tts and returns a Base64 Data URL (data:audio/mp3;base64,...).
    """
    clean_text = clean_markdown_for_tts(text)
    if not clean_text:
        return ""

    try:
        import edge_tts

        communicate = edge_tts.Communicate(text=clean_text, voice=voice)
        audio_stream = io.BytesIO()

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_stream.write(chunk["data"])

        audio_bytes = audio_stream.getvalue()
        if not audio_bytes:
            return ""

        b64_audio = base64.b64encode(audio_bytes).decode("utf-8")
        return f"data:audio/mp3;base64,{b64_audio}"
    except Exception as e:
        logger.error("Edge-TTS synthesis failed: %s", e)
        return ""

import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) OkinAI/1.0 (contact@okin.ai)"


def get_wikipedia_image(query: str) -> Optional[Dict[str, str]]:
    """
    Finds real-world photographs or encyclopedic scientific diagrams via Wikipedia PageImages API.
    100% Free & Open-Source.
    """
    clean_query = query.strip()
    if not clean_query:
        return None

    try:
        encoded_q = urllib.parse.quote(clean_query)
        url = (
            f"https://en.wikipedia.org/w/api.php?action=query&generator=search"
            f"&gsrsearch={encoded_q}&gsrlimit=1&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=1&format=json&pithumbsize=960"
        )
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            pages = data.get("query", {}).get("pages", {})
            for page in pages.values():
                thumb = page.get("thumbnail", {}).get("source")
                title = page.get("title", clean_query)
                extract = page.get("extract", "")
                if thumb and thumb.startswith("http"):
                    return {
                        "url": thumb,
                        "title": title,
                        "source": "Wikipedia Commons",
                        "caption": extract or f"Visual reference diagram of {title}.",
                    }
    except Exception as e:
        logger.debug("Wikipedia image search skipped: %s", e)

    return None


def get_pollinations_ai_image(prompt: str) -> str:
    """
    Generates a high-quality AI visual illustration on-demand via Pollinations.ai.
    100% Free, zero-key, open-source AI image service.
    """
    clean_prompt = re.sub(r"[^\w\s,-]", "", prompt).strip()[:180]
    enhanced_prompt = f"detailed digital educational illustration of {clean_prompt}, clean lighting, high resolution, infographics"
    encoded_p = urllib.parse.quote(enhanced_prompt)
    return f"https://image.pollinations.ai/prompt/{encoded_p}?width=800&height=480&nologo=true"


def get_illustration_for_query(query: str) -> Optional[Dict[str, str]]:
    """
    Intelligently retrieves or generates a visual illustration:
    1. Checks for real-world photograph/diagram on Wikipedia Commons.
    2. If not found or conceptual topic, generates an AI illustration via Pollinations.ai.
    """
    clean = query.strip()
    if not clean or len(clean) < 3:
        return None

    # Try Wikipedia Commons first
    wiki_img = get_wikipedia_image(clean)
    if wiki_img:
        return wiki_img

    # Fallback to Pollinations AI illustration
    ai_url = get_pollinations_ai_image(clean)
    return {
        "url": ai_url,
        "title": clean.title(),
        "source": "AI Visual Illustration",
        "caption": f"Detailed visual explanation and illustration of {clean.title()}.",
    }

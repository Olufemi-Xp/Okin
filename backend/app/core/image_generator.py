import asyncio
import base64
import json
import logging
import os
import random
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Optional, Tuple
from app.config import get_settings
from app.core.llm_router import invoke_with_fallback

logger = logging.getLogger(__name__)


class VisualSafetyError(ValueError):
    """Raised when a prompt violates content/safety guidelines."""


class VisualRateLimitError(RuntimeError):
    """Raised when the upstream image provider rate-limits requests."""


class VisualTimeoutError(TimeoutError):
    """Raised when the upstream image provider times out."""


ASPECT_RATIOS: Dict[str, Tuple[int, int]] = {
    "1:1": (1024, 1024),
    "16:9": (1280, 720),
    "9:16": (720, 1280),
    "4:3": (1024, 768),
}

STYLE_PROMPTS: Dict[str, str] = {
    "photorealistic": "cinematic photography, 8k resolution, photorealistic, natural volumetric lighting, shot on 35mm lens, f/1.8, hyperdetailed texture",
    "digital_illustration": "custom digital illustration, vibrant color palette, detailed brushwork, dramatic lighting, sharp focus, editorial artwork",
    "concept_art": "detailed visual reference sheet, concept art illustration, studio key art, crisp lighting, rich atmospheric depth, design accuracy, trending on ArtStation, 8k",
    "minimalist_vector": "clean flat vector graphic, minimalist illustration, crisp geometric lines, modern graphic design, balanced composition",
    "3d_render": "octane 3D render, raytraced reflections, Unreal Engine 5, volumetric studio lighting, physically based shaders, 3D masterpiece",
    "sketch_line_art": "detailed graphite pencil sketch, architectural ink line art, crosshatching, hand-drawn illustration",
}

_SAFETY_BLOCK_PATTERNS = [
    r"\b(csam|child\s*porn|underage\s*nude)\b",
    r"\b(explicit\s*gore|dismemberment|snuff)\b",
    r"\b(how\s+to\s+make\s+a\s+bomb|terrorist\s+attack\s+blueprint)\b",
]


def check_prompt_safety(prompt: str) -> None:
    """Rejects clearly unsafe visual prompts before hitting external APIs."""
    lower = prompt.lower()
    for pattern in _SAFETY_BLOCK_PATTERNS:
        if re.search(pattern, lower):
            raise VisualSafetyError(
                "This request cannot be generated because it violates visual safety guidelines. "
                "Please modify your prompt and try a different description."
            )


def get_generated_images_dir() -> str:
    settings = get_settings()
    directory = os.path.join(settings.DATA_DIR, "generated_images")
    os.makedirs(directory, exist_ok=True)
    return directory


def enhance_visual_prompt(user_prompt: str, style_key: str = "photorealistic") -> str:
    """
    Expands a simple user prompt into an evocative, highly detailed visual prompt
    incorporating lighting, materials, composition, and artistic aesthetic.
    """
    clean = user_prompt.strip()
    if not clean:
        return "A beautiful, ethereal visual masterpiece, 8k resolution, cinematic lighting"

    style_hint = STYLE_PROMPTS.get(style_key, STYLE_PROMPTS["photorealistic"])

    system_prompt = (
        "You are an expert AI art prompt engineer specializing in Midjourney, Flux, and DALL-E 3 prompts. "
        "Your task is to expand the user's short image idea into an evocative, descriptive visual prompt. "
        "Guidelines:\n"
        "1. Describe subject details, environment/setting, lighting, color palette, camera angle, and artistic atmosphere.\n"
        f"2. Align with the visual style: '{style_key}'.\n"
        "3. Output ONLY the expanded prompt text in 2-3 vivid sentences. Do not include markdown, prefixes, quotes, or commentary."
    )

    try:
        messages = [{"role": "user", "content": f"Create an expanded image prompt for: {clean}"}]
        enhanced, _ = invoke_with_fallback(
            messages=messages,
            system_prompt=system_prompt,
            temperature=0.7,
        )
        enhanced_clean = enhanced.strip().strip('"\'')
        if enhanced_clean and len(enhanced_clean) > 10:
            return f"{enhanced_clean}, {style_hint}"
    except Exception as e:
        logger.warning("Prompt enhancement fallback to original: %s", e)

    return f"{clean}, {style_hint}"


def _generate_with_openai(api_key: str, prompt: str, aspect_ratio: str) -> bytes:
    """Calls OpenAI Images API (DALL-E 3) and returns decoded image bytes."""
    size_map = {
        "1:1": "1024x1024",
        "16:9": "1792x1024",
        "9:16": "1024x1792",
        "4:3": "1024x1024",
    }
    payload = json.dumps({
        "model": "dall-e-3",
        "prompt": prompt[:3800],
        "n": 1,
        "size": size_map.get(aspect_ratio, "1024x1024"),
        "response_format": "b64_json",
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            b64 = data["data"][0]["b64_json"]
            return base64.b64decode(b64)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code == 429:
            raise VisualRateLimitError("Rate limit reached on OpenAI image generation. Please wait a moment and try again.")
        if e.code == 400 and ("content_policy" in body.lower() or "safety" in body.lower()):
            raise VisualSafetyError("OpenAI's safety filter declined this prompt. Please try rephrasing your description.")
        raise RuntimeError(f"OpenAI image error ({e.code}): {body[:200]}")
    except (socket.timeout, TimeoutError):
        raise VisualTimeoutError("Image generation timed out while waiting for OpenAI. Please try again.")


def _generate_with_fal(api_key: str, prompt: str, aspect_ratio: str) -> bytes:
    """Calls Fal.ai Flux Schnell API and downloads the resulting image bytes."""
    size_map = {
        "1:1": "square_hd",
        "16:9": "landscape_16_9",
        "9:16": "portrait_16_9",
        "4:3": "landscape_4_3",
    }
    payload = json.dumps({
        "prompt": prompt[:2000],
        "image_size": size_map.get(aspect_ratio, "square_hd"),
        "num_images": 1,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://fal.run/fal-ai/flux/schnell",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Key {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            image_url = data["images"][0]["url"]
        img_req = urllib.request.Request(image_url, headers={"User-Agent": "SuzzyAI/1.0"})
        with urllib.request.urlopen(img_req, timeout=30) as img_resp:
            return img_resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        if e.code == 429:
            raise VisualRateLimitError("Rate limit reached on Fal.ai image generation. Please wait a moment and try again.")
        if e.code == 422 or "nsfw" in body.lower() or "safety" in body.lower():
            raise VisualSafetyError("Safety filter declined this prompt. Please revise your visual description.")
        raise RuntimeError(f"Fal.ai image error ({e.code}): {body[:200]}")
    except (socket.timeout, TimeoutError):
        raise VisualTimeoutError("Image generation timed out while waiting for Fal.ai. Please try again.")


def _generate_with_pollinations(final_prompt: str, width: int, height: int) -> bytes:
    """Calls zero-key Pollinations image generation with random seed and retry fallback."""
    clean_p = re.sub(r"[^\w\s,.-]", "", final_prompt).strip()[:400]
    enc_prompt = urllib.parse.quote(clean_p)
    seed = random.randint(1, 9999999)

    pollinations_url = (
        f"https://image.pollinations.ai/prompt/{enc_prompt}"
        f"?width={width}&height={height}&seed={seed}&nologo=true"
    )
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    }

    try:
        req = urllib.request.Request(pollinations_url, headers=headers)
        with urllib.request.urlopen(req, timeout=35) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise VisualRateLimitError("Visual generation service is busy right now (rate limit). Please wait a few seconds and retry.")
        logger.warning("Primary Pollinations URL returned %s; trying fallback URL...", e)
    except (socket.timeout, TimeoutError):
        logger.warning("Primary Pollinations request timed out; trying fallback URL...")
    except Exception as fetch_err:
        logger.warning("Primary Pollinations error (%s); retrying fallback URL...", fetch_err)

    fallback_url = f"https://image.pollinations.ai/prompt/{enc_prompt}?seed={seed}&nologo=true"
    try:
        req = urllib.request.Request(fallback_url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise VisualRateLimitError("Visual generation rate limit reached. Please retry in a few seconds.")
        raise RuntimeError(f"Image generation service returned HTTP {e.code}.")
    except (socket.timeout, TimeoutError):
        raise VisualTimeoutError("The visual generation service took too long to respond. Please try again.")


async def generate_image_asset(
    prompt: str,
    style: str = "photorealistic",
    aspect_ratio: str = "1:1",
    enhance: bool = True,
) -> Dict[str, Any]:
    """
    Generates a high-resolution image asset, saves it persistently to disk,
    and returns its structured metadata.
    """
    raw_prompt = prompt.strip()
    if not raw_prompt:
        raise ValueError("Image prompt cannot be empty.")

    check_prompt_safety(raw_prompt)

    # 1. Normalize aspect ratio & style
    style_key = style.lower().replace(" ", "_").replace("-", "_")
    if style_key not in STYLE_PROMPTS:
        style_key = "photorealistic"

    width, height = ASPECT_RATIOS.get(aspect_ratio, ASPECT_RATIOS["1:1"])

    # 2. Enhance prompt if requested
    if enhance:
        final_prompt = enhance_visual_prompt(raw_prompt, style_key)
    else:
        style_suffix = STYLE_PROMPTS.get(style_key, "")
        final_prompt = f"{raw_prompt}, {style_suffix}".strip(", ")

    logger.info("Generating image: prompt='%s', style=%s, res=%dx%d", raw_prompt, style_key, width, height)

    # 3. Select provider and fetch image bytes
    settings = get_settings()
    provider_pref = (settings.IMAGE_GEN_PROVIDER or "auto").lower().strip()
    openai_key = settings.OPENAI_API_KEY or (settings.IMAGE_GEN_API_KEY if (settings.IMAGE_GEN_API_KEY or "").startswith("sk-") and provider_pref != "fal" else "")
    fal_key = settings.FAL_KEY or (settings.IMAGE_GEN_API_KEY if provider_pref == "fal" else "")

    image_id = str(uuid.uuid4())
    filename = f"{image_id}.jpg"
    dest_dir = get_generated_images_dir()
    file_path = os.path.join(dest_dir, filename)

    image_bytes: Optional[bytes] = None
    provider_used = "pollinations"

    if provider_pref in ("auto", "openai") and openai_key:
        try:
            image_bytes = await asyncio.to_thread(_generate_with_openai, openai_key, final_prompt, aspect_ratio)
            provider_used = "openai-dalle3"
        except (VisualSafetyError, VisualRateLimitError):
            raise
        except Exception as err:
            logger.warning("OpenAI generation failed (%s); falling back...", err)

    if image_bytes is None and provider_pref in ("auto", "fal") and fal_key:
        try:
            image_bytes = await asyncio.to_thread(_generate_with_fal, fal_key, final_prompt, aspect_ratio)
            provider_used = "fal-flux"
        except (VisualSafetyError, VisualRateLimitError):
            raise
        except Exception as err:
            logger.warning("Fal.ai generation failed (%s); falling back...", err)

    if image_bytes is None:
        image_bytes = await asyncio.to_thread(_generate_with_pollinations, final_prompt, width, height)
        provider_used = "pollinations-flux"

    if not image_bytes or len(image_bytes) < 1000:
        raise RuntimeError("Received invalid or corrupted image data from the generator.")

    # 4. Save persistently to disk
    with open(file_path, "wb") as f:
        f.write(image_bytes)

    logger.info("Saved generated image via %s: %s (%d bytes)", provider_used, file_path, len(image_bytes))

    return {
        "image_id": image_id,
        "filename": filename,
        "url": f"/static/generated/{filename}",
        "prompt": raw_prompt,
        "enhanced_prompt": final_prompt,
        "style": style_key,
        "aspect_ratio": aspect_ratio,
        "width": width,
        "height": height,
        "provider": provider_used,
        "file_size": len(image_bytes),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

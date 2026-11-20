import base64
import logging
from typing import Any, Dict, List, Optional, Tuple, Union
from app.config import get_settings

logger = logging.getLogger(__name__)


def format_messages_for_gemini(messages: List[Dict[str, Any]], system_prompt: Optional[str] = None) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    Convert chat messages to Gemini's history format.
    Gemini expects role: 'user' or 'model'.
    """
    gemini_history = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        gemini_role = "model" if role in ("assistant", "model") else "user"
        gemini_history.append({"role": gemini_role, "parts": [content]})
    return system_prompt, gemini_history


def format_messages_for_groq(messages: List[Dict[str, Any]], system_prompt: Optional[str] = None) -> List[Dict[str, str]]:
    """
    Format standard message list for Groq API.
    """
    groq_msgs: List[Dict[str, str]] = []
    if system_prompt:
        groq_msgs.append({"role": "system", "content": system_prompt})

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("model", "assistant"):
            clean_role = "assistant"
        elif role == "system":
            clean_role = "system"
        else:
            clean_role = "user"
        groq_msgs.append({"role": clean_role, "content": str(content)})
    return groq_msgs


class LLMRouter:
    def _call_gemini(
        self,
        messages: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        media_payload: Optional[Dict[str, Any]] = None,
        temperature: float = 0.7,
    ) -> Tuple[str, str]:
        settings = get_settings()
        if not settings.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY is not set.")

        import google.generativeai as genai

        genai.configure(api_key=settings.GOOGLE_API_KEY, transport="rest")

        candidate_models = [
            "gemini-3.1-flash-lite",
            "gemini-flash-lite-latest",
            "gemini-3.8-flash",
            "gemini-3.5-flash",
        ]
        system_instruction = system_prompt if system_prompt else None

        generation_config = genai.types.GenerationConfig(
            temperature=temperature,
            max_output_tokens=3072,
        )

        contents: List[Any] = []
        for msg in messages[:-1]:
            role = "model" if msg.get("role") in ("assistant", "model") else "user"
            contents.append({"role": role, "parts": [msg.get("content", "")]})

        last_msg = messages[-1] if messages else {"role": "user", "content": ""}
        last_parts: List[Any] = [last_msg.get("content", "")]

        if media_payload:
            mime_type = media_payload.get("mime_type", "image/png")
            data_bytes = media_payload.get("data")
            if isinstance(data_bytes, str):
                data_bytes = base64.b64decode(data_bytes)
            if data_bytes:
                last_parts.append({"mime_type": mime_type, "data": data_bytes})

        timeout = 20.0 if media_payload else 8.0

        last_err = None
        for model_name in candidate_models:
            try:
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_instruction,
                    generation_config=generation_config,
                )
                if contents:
                    chat = model.start_chat(history=contents)
                    response = chat.send_message(last_parts, request_options={"timeout": timeout})
                else:
                    response = model.generate_content(last_parts, request_options={"timeout": timeout})

                if response.text:
                    return response.text.strip(), model_name
            except Exception as e:
                last_err = e
                logger.warning("Gemini model '%s' failed or timed out: %s", model_name, e)
                continue

        raise last_err or RuntimeError("Gemini candidates failed.")

    def _call_groq(
        self,
        messages: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
    ) -> Tuple[str, str]:
        settings = get_settings()
        if not settings.GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is not set.")

        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY, timeout=10.0)
        formatted = format_messages_for_groq(messages, system_prompt)

        candidate_models = [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
        ]

        last_err = None
        for model_name in candidate_models:
            try:
                response = client.chat.completions.create(
                    model=model_name,
                    messages=formatted,
                    temperature=temperature,
                    max_tokens=3072,
                )
                if response.choices and len(response.choices) > 0:
                    content = response.choices[0].message.content or ""
                    return content.strip(), model_name
            except Exception as e:
                last_err = e
                logger.warning("Groq model '%s' failed: %s. Trying next...", model_name, e)
                continue

        raise last_err or RuntimeError("All Groq candidate models failed.")

    def invoke_with_fallback(
        self,
        messages: List[Dict[str, Any]],
        system_prompt: Optional[str] = None,
        media_payload: Optional[Dict[str, Any]] = None,
        temperature: float = 0.7,
    ) -> Tuple[str, str]:
        """
        Smart dual-provider router:
        - For vision / media analysis: routes to Gemini first with fallback to Groq.
        - For text-only chats & agent loops: routes to lightning-fast Groq (0.3s-0.6s) first with fallback to Gemini.
        Returns: (response_text, model_identifier)
        """
        # If media payload is attached, Gemini vision must be attempted first
        if media_payload:
            try:
                logger.info("Attempting multimodal vision LLM: Gemini...")
                reply, model_used = self._call_gemini(
                    messages=messages,
                    system_prompt=system_prompt,
                    media_payload=media_payload,
                    temperature=temperature,
                )
                return reply, model_used
            except Exception as gemini_err:
                logger.warning("Gemini multimodal failed (%s). Falling back to Groq...", gemini_err)

            # Fallback to Groq describing attachment
            try:
                fallback_system_prompt = system_prompt or ""
                media_info = f"\n[Note: User attached media file '{media_payload.get('filename', 'attachment')}']"
                fallback_system_prompt += media_info
                return self._call_groq(messages=messages, system_prompt=fallback_system_prompt, temperature=temperature)
            except Exception as groq_err:
                logger.error("Groq fallback also failed (%s).", groq_err)

        # For standard text queries (fastest response time < 1s)
        try:
            return self._call_groq(messages=messages, system_prompt=system_prompt, temperature=temperature)
        except Exception as groq_err:
            logger.warning("Groq primary attempt failed (%s). Falling back to Gemini...", groq_err)

        # Fallback to Gemini
        try:
            return self._call_gemini(messages=messages, system_prompt=system_prompt, temperature=temperature)
        except Exception as gemini_err:
            logger.error("Gemini fallback also failed (%s).", gemini_err)

        return (
            "I apologize, but I am currently unable to reach my AI brain providers (Groq and Gemini). "
            "Please check that your `GROQ_API_KEY` or `GOOGLE_API_KEY` are configured properly in `backend/.env`.",
            "emergency-fallback",
        )


router_instance = LLMRouter()


def invoke_with_fallback(
    messages: List[Dict[str, Any]],
    system_prompt: Optional[str] = None,
    media_payload: Optional[Dict[str, Any]] = None,
    temperature: float = 0.7,
) -> Tuple[str, str]:
    return router_instance.invoke_with_fallback(
        messages=messages,
        system_prompt=system_prompt,
        media_payload=media_payload,
        temperature=temperature,
    )

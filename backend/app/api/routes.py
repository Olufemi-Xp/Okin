import json
import logging
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, Response, UploadFile, File, Form, status
from pydantic import BaseModel
from app.agents.supervisor import run_agent_pipeline
from app.config import get_settings
from app.core.media_parser import parse_uploaded_file
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.core.voice import text_to_speech_base64, transcribe_audio
from app.db.chroma_client import get_memory_manager
from app.db.sqlite_client import (
    add_message,
    create_thread,
    create_user,
    delete_thread,
    get_messages,
    get_thread,
    get_threads,
    get_user_by_email,
    get_user_by_id,
    update_thread_title,
    update_user_profile_db,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# --- Authentication Dependency & Session Extraction ---

def verify_access_pin(request: Request) -> None:
    settings = get_settings()
    if settings.APP_ACCESS_PIN:
        client_pin = request.headers.get("X-Access-PIN")
        if client_pin != settings.APP_ACCESS_PIN:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing access PIN. Please enter the valid APP_ACCESS_PIN.",
            )


def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """Extract authenticated user profile from Authorization: Bearer <jwt>."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user = get_user_by_id(payload["sub"])
    if not user:
        return None
    user_data = dict(user)
    user_data.pop("password_hash", None)
    return user_data


def get_current_user_required(request: Request) -> Dict[str, Any]:
    """Require a verified JWT token; raises HTTP 401 if missing or invalid."""
    user = get_current_user_optional(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in to your Okin account.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def extract_session_id(request: Request) -> str:
    """
    Extracts an isolated session identifier.
    If authenticated via JWT, strictly partitions the session by the unique user ID (e.g. user_usr_123).
    This guarantees that every user has an isolated session, chat history, organizer, and memory.
    """
    user = get_current_user_optional(request)
    raw_session = request.headers.get("X-Session-ID", "").strip()

    if user:
        user_prefix = f"user_{user['id']}"
        if raw_session and raw_session not in ("current", "default-session", "ssr-session"):
            return f"{user_prefix}_{raw_session}"
        return user_prefix

    if not raw_session or raw_session in ("current", "default-session", "ssr-session"):
        return "guest-session"
    return f"guest_{raw_session}"


# --- Request / Response Models ---

class SignUpRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class SignInRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    dob: Optional[str] = None
    plan: Optional[str] = None


# --- Request / Response Models ---

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "en-US-AriaNeural"


class GenerateImageRequest(BaseModel):
    prompt: str
    style: Optional[str] = "photorealistic"
    aspect_ratio: Optional[str] = "1:1"
    enhance_prompt: Optional[bool] = True
    thread_id: Optional[str] = None


# --- API Endpoints ---

@router.get("/health")
async def health_check():
    settings = get_settings()
    return {
        "status": "ok",
        "app": "Okin AI",
        "version": "1.0",
        "has_google_key": bool(settings.GOOGLE_API_KEY),
        "has_groq_key": bool(settings.GROQ_API_KEY),
        "pin_protected": bool(settings.APP_ACCESS_PIN),
    }


# --- JWT Authentication Endpoints ---

@router.post("/auth/signup")
async def signup_endpoint(data: SignUpRequest):
    """Register a new user account with isolated profile and issue JWT."""
    clean_email = data.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

    existing = get_user_by_email(clean_email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists. Please sign in instead.",
        )

    pw_hash = hash_password(data.password)
    user = create_user(
        email=clean_email,
        password_hash=pw_hash,
        name=data.name or clean_email.split("@")[0].replace(".", " ").title(),
        provider="email",
    )
    user.pop("password_hash", None)
    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return {"token": token, "user": user}


@router.post("/auth/signin")
async def signin_endpoint(data: SignInRequest):
    """Authenticate with email and password, returning user profile and signed JWT."""
    clean_email = data.email.strip().lower()
    user = get_user_by_email(clean_email)
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user.pop("password_hash", None)
    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return {"token": token, "user": user}


@router.post("/auth/google")
async def google_auth_endpoint(data: GoogleAuthRequest):
    """Authenticate with Google OAuth, finding or provisioning an isolated user profile."""
    clean_email = data.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Invalid email address.")

    user = get_user_by_email(clean_email)
    if not user:
        user = create_user(
            email=clean_email,
            password_hash=None,
            name=data.name or clean_email.split("@")[0].replace(".", " ").title(),
            provider="google",
            avatar_url=data.avatar_url or "",
            plan="free",
        )
    else:
        user.pop("password_hash", None)

    token = create_access_token({"sub": user["id"], "email": user["email"]})
    return {"token": token, "user": user}


@router.get("/auth/me")
async def get_me_endpoint(request: Request):
    """Retrieve the authenticated user's profile from JWT token."""
    user = get_current_user_required(request)
    return {"user": user}


@router.put("/auth/profile")
async def update_profile_endpoint(request: Request, data: UpdateProfileRequest):
    """Update profile attributes for the authenticated user."""
    user = get_current_user_required(request)
    updates = {k: v for k, v in data.dict().items() if v is not None}
    updated = update_user_profile_db(user["id"], updates)
    if not updated:
        raise HTTPException(status_code=400, detail="Failed to update profile.")
    updated.pop("password_hash", None)
    return {"user": updated}


@router.post("/chat")
async def chat_endpoint(request: Request, background_tasks: BackgroundTasks):
    """
    Unified chat endpoint accepting either JSON or multipart/form-data.
    Handles text, attached files, and the /forget command.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)

    content_type = request.headers.get("content-type", "")

    message_text = ""
    thread_id = None
    file_info = None
    voice_mode = False
    user_location = None

    # Check for geolocation in headers
    lat_hdr = request.headers.get("x-user-latitude")
    lon_hdr = request.headers.get("x-user-longitude")
    city_hdr = request.headers.get("x-user-city")
    if lat_hdr and lon_hdr:
        try:
            user_location = {
                "latitude": float(lat_hdr),
                "longitude": float(lon_hdr),
                "city": city_hdr or "",
            }
        except Exception:
            pass

    if "multipart/form-data" in content_type:
        form = await request.form()
        message_text = str(form.get("message", "")).strip()
        thread_id = form.get("thread_id")
        voice_mode = str(form.get("voice_mode", "false")).lower() in ("true", "1")
        uploaded_file = form.get("file")

        if uploaded_file and hasattr(uploaded_file, "read"):
            filename = getattr(uploaded_file, "filename", "uploaded_file")
            file_bytes = await uploaded_file.read()
            file_info = parse_uploaded_file(filename, file_bytes)
            if file_info.get("error"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=file_info["error"],
                )
    else:
        # JSON body
        try:
            body = await request.json()
            message_text = str(body.get("message", "")).strip()
            thread_id = body.get("thread_id")
            voice_mode = bool(body.get("voice_mode", False))
            if not user_location and body.get("user_location"):
                user_location = body.get("user_location")
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request body")

    if not message_text and not file_info:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message or file attachment required.")

    # Check for /forget command to wipe memory
    if message_text.lower().strip() == "/forget":
        get_memory_manager().delete_memory(session_id)
        return {
            "response": "Memory cleared. I have forgotten all learned facts from past sessions. What would you like to discuss next?",
            "thread_id": thread_id,
            "agent_used": "MemoryManager",
            "model_used": "system",
        }

    # Ensure thread exists or create new one
    active_thread = None
    if thread_id:
        active_thread = get_thread(session_id, str(thread_id))

    if not active_thread:
        # Create new thread with auto-generated title
        clean_title = (message_text[:40] or (file_info["filename"] if file_info else "New Chat"))
        new_thread = create_thread(session_id=session_id, title=clean_title)
        thread_id = new_thread["id"]

    # Retrieve short-term history for context
    past_messages = get_messages(session_id, thread_id)
    history: List[Dict[str, str]] = []
    for msg in past_messages[-10:]:  # Last 10 turns
        role = "assistant" if msg["role"] == "assistant" else "user"
        history.append({"role": role, "content": msg["content"]})

    # Save user message to database
    user_modality = "file" if file_info else "text"
    user_display = message_text
    if file_info and not message_text:
        user_display = f"[Attached: {file_info['filename']}]"

    add_message(
        thread_id=thread_id,
        session_id=session_id,
        role="user",
        content=user_display,
        modality=user_modality,
    )

    # Run LangGraph multi-agent pipeline
    query_to_run = message_text or (f"Analyze {file_info['filename']}" if file_info else "")
    if voice_mode and message_text:
        query_to_run = f"[Real-time voice conversation mode. Reply naturally, warmly, and concisely in 1-3 spoken sentences. Avoid markdown, asterisks, bullet points, or code.] {message_text}"

    pipeline_result = await run_agent_pipeline(
        session_id=session_id,
        thread_id=thread_id,
        user_query=query_to_run,
        history=history,
        file_info=file_info,
        user_location=user_location,
        voice_mode=voice_mode,
        background_tasks=background_tasks,
    )

    assistant_response = pipeline_result.get("final_response", "")
    agent_used = pipeline_result.get("agent_used", "GeneralResponder")
    model_used = pipeline_result.get("model_used", "gemini-flash-lite-latest")

    audio_base64 = None
    if voice_mode and assistant_response:
        try:
            audio_base64 = await text_to_speech_base64(assistant_response)
        except Exception as e:
            logger.warning("Voice mode TTS generation failed: %s", e)

    # Save assistant message to database
    add_message(
        thread_id=thread_id,
        session_id=session_id,
        role="assistant",
        content=assistant_response,
        modality="voice" if voice_mode else "text",
        agent_used=agent_used,
        audio_url=audio_base64 if (audio_base64 and len(audio_base64) < 500000) else None,
    )

    return {
        "response": assistant_response,
        "thread_id": thread_id,
        "agent_used": agent_used,
        "model_used": model_used,
        "audio_base64": audio_base64,
        "code_execution": pipeline_result.get("code_execution"),
    }


@router.post("/transcribe")
async def transcribe_endpoint(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Pure audio transcription endpoint using Groq Whisper.
    Returns transcript text directly for input field dictation.
    """
    verify_access_pin(request)
    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) < 50:
        return {"transcript": ""}

    filename = getattr(file, "filename", "recording.webm") or "recording.webm"
    transcript = await transcribe_audio(audio_bytes, filename=filename)
    return {"transcript": transcript or ""}


@router.post("/voice")
async def voice_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    thread_id: Optional[str] = Form(None),
    fallback_transcript: Optional[str] = Form(None),
    user_location: Optional[str] = Form(None),
):
    """
    Low-latency Voice interaction endpoint:
    1. Audio validation gate (minimum 3KB & anti-hallucination filter)
    2. Transcribes audio via Groq Whisper with whisper-large-v3-turbo (language='en', temp=0.0)
    3. Runs LangGraph supervisor pipeline with voice_mode=True (skips slow loops & memory blocking)
    4. Fast in-memory Edge-TTS synthesis
    5. Asynchronous persistence via BackgroundTasks
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)

    audio_bytes = await file.read()

    # Minimum Audio Gate: Reject audio under 3KB if no browser speech transcript was captured
    if (not audio_bytes or len(audio_bytes) < 3000) and not (fallback_transcript and fallback_transcript.strip()):
        logger.info("Audio under 3KB threshold (%d bytes). Returning no_speech.", len(audio_bytes or b""))
        return {
            "status": "no_speech",
            "transcript": "",
            "response": "",
            "audio_base64": None,
            "thread_id": thread_id or "",
            "agent_used": "VoiceAssistant",
            "model_used": "whisper-large-v3-turbo",
        }

    logger.info("Received /voice audio: %d bytes, filename: %s", len(audio_bytes or b""), file.filename)

    # 1. Transcribe with Groq Whisper
    transcript = ""
    if audio_bytes and len(audio_bytes) >= 3000:
        transcript = await transcribe_audio(audio_bytes, filename=file.filename or "recording.webm")

    # Fallback to browser Web Speech API transcript if Whisper found nothing
    if (not transcript or not transcript.strip()) and fallback_transcript and fallback_transcript.strip():
        logger.info("Using browser fallback_transcript: '%s'", fallback_transcript.strip())
        transcript = fallback_transcript.strip()

    # If silence or hallucination occurred, return clean no_speech without speaking an error prompt
    if not transcript or not transcript.strip():
        logger.info("No speech detected or hallucination discarded. Returning no_speech status.")
        return {
            "status": "no_speech",
            "transcript": "",
            "response": "",
            "audio_base64": None,
            "thread_id": thread_id or "",
            "agent_used": "VoiceAssistant",
            "model_used": "whisper-large-v3-turbo",
        }

    # Parse geolocation if provided
    parsed_location = None
    if user_location:
        try:
            import json
            parsed_location = json.loads(user_location)
        except Exception:
            pass

    # Ensure thread exists
    active_thread = None
    if thread_id:
        active_thread = get_thread(session_id, str(thread_id))
    if not active_thread:
        new_thread = create_thread(session_id=session_id, title=transcript[:40])
        thread_id = new_thread["id"]

    # Retrieve short-term history
    past_messages = get_messages(session_id, thread_id)
    history: List[Dict[str, str]] = []
    for msg in past_messages[-8:]:
        role = "assistant" if msg["role"] == "assistant" else "user"
        history.append({"role": role, "content": msg["content"]})

    # Save user voice message immediately
    add_message(
        thread_id=thread_id,
        session_id=session_id,
        role="user",
        content=transcript,
        modality="voice",
    )

    # 2. Run LangGraph pipeline with voice_mode=True and BackgroundTasks
    pipeline_result = await run_agent_pipeline(
        session_id=session_id,
        thread_id=thread_id,
        user_query=transcript,
        history=history,
        voice_mode=True,
        background_tasks=background_tasks,
        user_location=parsed_location,
    )

    assistant_reply = pipeline_result.get("final_response", "")
    agent_used = pipeline_result.get("agent_used", "VoiceAssistant")
    model_used = pipeline_result.get("model_used", "openai/gpt-oss-120b")

    # 3. Fast in-memory Edge-TTS audio synthesis
    audio_base64 = await text_to_speech_base64(assistant_reply)

    # Save assistant message in background to avoid blocking the HTTP response
    background_tasks.add_task(
        add_message,
        thread_id=thread_id,
        session_id=session_id,
        role="assistant",
        content=assistant_reply,
        modality="voice",
        agent_used=agent_used,
        audio_url=audio_base64 if (audio_base64 and len(audio_base64) < 500000) else None,
    )

    return {
        "status": "success",
        "transcript": transcript,
        "response": assistant_reply,
        "audio_base64": audio_base64,
        "thread_id": thread_id,
        "agent_used": agent_used,
        "model_used": model_used,
    }


@router.post("/tts")
async def tts_endpoint(request: Request, body: TTSRequest):
    """
    On-demand Text-to-Speech synthesis for any text message.
    """
    verify_access_pin(request)
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required for TTS synthesis.")

    audio_base64 = await text_to_speech_base64(body.text, voice=body.voice or "en-US-AriaNeural")
    return {"audio_base64": audio_base64}


@router.post("/generate-visual")
@router.post("/generate-image")
async def generate_image_endpoint(
    request: Request,
    body: GenerateImageRequest,
    background_tasks: BackgroundTasks,
):
    """
    Dedicated AI visual and image generation endpoint:
    Accepts { prompt, style, aspect_ratio, enhance_prompt, thread_id }.
    Refines prompt, generates high-res visual, stores locally, and persists to thread history.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)

    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Please describe the visual you want Okin to create.")

    from app.core.image_generator import (
        VisualRateLimitError,
        VisualSafetyError,
        VisualTimeoutError,
        generate_image_asset,
    )

    try:
        image_asset = await generate_image_asset(
            prompt=prompt,
            style=body.style or "photorealistic",
            aspect_ratio=body.aspect_ratio or "1:1",
            enhance=body.enhance_prompt if body.enhance_prompt is not None else True,
        )
    except VisualSafetyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except VisualRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except VisualTimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Image generation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Could not generate visual right now: {str(e)}")

    active_thread = None
    if body.thread_id:
        active_thread = get_thread(session_id, str(body.thread_id))
    if not active_thread:
        new_thread = create_thread(session_id=session_id, title=prompt[:36])
        thread_id = new_thread["id"]
    else:
        thread_id = active_thread["id"]

    # Persist user message
    add_message(
        thread_id=thread_id,
        session_id=session_id,
        role="user",
        content=f"/imagine {prompt} (style: {body.style or 'photorealistic'}, aspect: {body.aspect_ratio or '1:1'})",
        modality="text",
    )

    # Persist assistant image card message
    card_data = {
        "kind": "image-generation",
        "image_id": image_asset["image_id"],
        "url": image_asset["url"],
        "prompt": image_asset["prompt"],
        "enhanced_prompt": image_asset["enhanced_prompt"],
        "style": image_asset["style"],
        "aspect_ratio": image_asset["aspect_ratio"],
        "width": image_asset["width"],
        "height": image_asset["height"],
        "provider": image_asset.get("provider", "flux"),
        "created_at": image_asset["created_at"],
    }
    assistant_content = f"Here is your **{image_asset['style'].replace('_', ' ').title()}** visual for *\"{prompt}\"* ({image_asset['aspect_ratio']}):\n\n```image-generation-card\n{json.dumps(card_data)}\n```"

    background_tasks.add_task(
        add_message,
        thread_id=thread_id,
        session_id=session_id,
        role="assistant",
        content=assistant_content,
        modality="text",
        agent_used="ImageGeneratorWorker",
    )

    return {
        "status": "success",
        "image": image_asset,
        "thread_id": thread_id,
    }


@router.get("/threads")
async def list_threads(request: Request):
    """
    Lists past chat threads scoped to current session_id.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    threads = get_threads(session_id)
    return {"threads": threads}


@router.get("/threads/{thread_id}")
async def get_thread_detail(request: Request, thread_id: str):
    """
    Returns thread details and all conversation messages.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    thread = get_thread(session_id, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    messages = get_messages(session_id, thread_id)
    return {"thread": thread, "messages": messages}


@router.delete("/threads/{thread_id}")
async def remove_thread(request: Request, thread_id: str):
    """
    Deletes a conversation thread and its messages.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    success = delete_thread(session_id, thread_id)
    if not success:
        raise HTTPException(status_code=404, detail="Thread not found or already deleted")
    return {"success": True, "thread_id": thread_id}


@router.delete("/memory")
async def clear_memory_endpoint(request: Request):
    """
    Wipes all remembered facts in ChromaDB for current session.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    get_memory_manager().delete_memory(session_id)
    return {"success": True, "message": "Cross-session memory cleared."}


# ---------------------------------------------------------------------------
# Gmail API OAuth & Email Management Endpoints
# ---------------------------------------------------------------------------

@router.get("/gmail/status")
async def gmail_status(request: Request):
    """
    Returns current Gmail connection and credentials status.
    """
    verify_access_pin(request)
    from app.core.gmail_service import (
        is_gmail_configured,
        is_gmail_authenticated,
        get_user_email,
    )
    configured = is_gmail_configured()
    authenticated = is_gmail_authenticated()
    email_address = get_user_email() if authenticated else None
    return {
        "configured": configured,
        "authenticated": authenticated,
        "email": email_address,
    }


@router.post("/gmail/upload-credentials")
async def gmail_upload_credentials(
    request: Request,
    file: UploadFile = File(...),
):
    """
    Uploads Google OAuth credentials.json from Google Cloud Console.
    """
    verify_access_pin(request)
    from app.core.gmail_service import save_credentials_file

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty credentials file submitted.")

    try:
        save_credentials_file(file_bytes)
        return {"success": True, "message": "credentials.json saved successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/gmail/auth-url")
async def gmail_auth_url(request: Request, redirect_uri: Optional[str] = None):
    """
    Generates the Google OAuth consent URL for user login.
    """
    verify_access_pin(request)
    from app.core.gmail_service import get_auth_flow_url
    from app.config import get_settings

    target_redirect = redirect_uri or f"{get_settings().FRONTEND_URL}/gmail-callback"
    try:
        url = get_auth_flow_url(target_redirect)
        return {"auth_url": url, "redirect_uri": target_redirect}
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail="credentials.json is missing. Please upload it first.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate Google auth URL: {e}")


@router.post("/gmail/exchange-code")
async def gmail_exchange_code(request: Request):
    """
    Exchanges authorization code from Google OAuth redirect for access tokens.
    """
    verify_access_pin(request)
    from app.core.gmail_service import save_token_from_code
    from app.config import get_settings

    body = await request.json()
    code = body.get("code")
    redirect_uri = body.get("redirect_uri") or f"{get_settings().FRONTEND_URL}/gmail-callback"
    code_verifier = body.get("code_verifier")

    if not code:
        raise HTTPException(status_code=400, detail="Authorization code is required.")

    try:
        user_email = save_token_from_code(code.strip(), redirect_uri.strip(), code_verifier=code_verifier)
        return {"success": True, "email": user_email}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to exchange OAuth code: {e}")


@router.post("/gmail/disconnect")
async def gmail_disconnect(request: Request):
    """
    Disconnects currently linked Gmail account by removing token.
    """
    verify_access_pin(request)
    from app.core.gmail_service import disconnect_gmail
    success = disconnect_gmail()
    return {"success": success}


@router.post("/gmail/send-draft")
async def gmail_send_draft(request: Request):
    """
    Sends an approved email draft or direct email message.
    """
    verify_access_pin(request)
    from app.core.gmail_service import send_email_message

    body = await request.json()
    to = body.get("to")
    subject = body.get("subject", "(No Subject)")
    email_body = body.get("body", "")
    draft_id = body.get("draft_id")
    thread_id = body.get("thread_id")

    if not to or not email_body:
        raise HTTPException(status_code=400, detail="'to' recipient and email 'body' are required.")

    try:
        res = send_email_message(to=to, subject=subject, body=email_body, thread_id=thread_id, draft_id=draft_id)
        return {"success": True, "details": res}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")


# ---------------------------------------------------------------------------
# Calendar, Reminders & To-Do Organizer Endpoints
# ---------------------------------------------------------------------------

@router.get("/organizer")
async def get_organizer_data(request: Request):
    """
    Returns scheduled calendar events and tasks/reminders for the current session.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    from app.db.sqlite_client import get_calendar_events, get_tasks_and_reminders
    return {
        "events": get_calendar_events(session_id),
        "tasks": get_tasks_and_reminders(session_id, include_completed=True),
    }


@router.post("/organizer/events")
async def add_organizer_event(request: Request):
    """
    Creates a new calendar event.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    from app.db.sqlite_client import create_calendar_event

    body = await request.json()
    title = str(body.get("title", "")).strip()
    start_time = str(body.get("start_time", "")).strip()
    if not title or not start_time:
        raise HTTPException(status_code=400, detail="Event title and start_time are required.")

    ev = create_calendar_event(
        session_id=session_id,
        title=title,
        start_time=start_time,
        end_time=body.get("end_time"),
        description=body.get("description", ""),
        location=body.get("location", ""),
    )
    return {"success": True, "event": ev}


@router.delete("/organizer/events/{event_id}")
async def remove_organizer_event(request: Request, event_id: str):
    """
    Deletes a calendar event by ID.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    from app.db.sqlite_client import delete_calendar_event
    deleted = delete_calendar_event(session_id, event_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Event not found.")
    return {"success": True}


@router.post("/organizer/tasks")
async def add_organizer_task(request: Request):
    """
    Creates a new to-do item or timed reminder.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    from app.db.sqlite_client import create_task_or_reminder

    body = await request.json()
    title = str(body.get("title", "")).strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required.")

    task = create_task_or_reminder(
        session_id=session_id,
        title=title,
        due_time=body.get("due_time"),
        priority=body.get("priority", "medium"),
        is_reminder=bool(body.get("is_reminder", False) or body.get("due_time")),
    )
    return {"success": True, "task": task}


@router.patch("/organizer/tasks/{task_id}")
async def toggle_organizer_task(request: Request, task_id: str):
    """
    Marks a task or reminder as completed or active.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    from app.db.sqlite_client import toggle_task_completion

    body = await request.json()
    completed = bool(body.get("completed", True))
    updated = toggle_task_completion(session_id, task_id, completed)
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"success": True, "completed": completed}


@router.delete("/organizer/tasks/{task_id}")
async def remove_organizer_task(request: Request, task_id: str):
    """
    Deletes a task or reminder by ID.
    """
    verify_access_pin(request)
    session_id = extract_session_id(request)
    from app.db.sqlite_client import delete_task
    deleted = delete_task(session_id, task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"success": True}

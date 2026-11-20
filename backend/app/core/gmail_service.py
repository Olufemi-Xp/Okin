import base64
import email
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.config import get_settings

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]


def get_credentials_path() -> Path:
    settings = get_settings()
    data_dir = Path(settings.DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)
    
    # Check data_dir first, then backend/data, then backend root, then repo root
    cand1 = data_dir / "credentials.json"
    if cand1.exists():
        return cand1
    cand2 = Path("backend/data/credentials.json")
    if cand2.exists():
        return cand2
    cand3 = Path("backend/credentials.json")
    if cand3.exists():
        return cand3
    cand4 = Path("credentials.json")
    if cand4.exists():
        return cand4
    return cand1


def get_token_path() -> Path:
    settings = get_settings()
    data_dir = Path(settings.DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)
    cand = data_dir / "gmail_token.json"
    if cand.exists():
        return cand
    cand2 = Path("backend/data/gmail_token.json")
    if cand2.exists():
        return cand2
    return cand


def get_pkce_path() -> Path:
    settings = get_settings()
    data_dir = Path(settings.DATA_DIR)
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "gmail_pkce.json"


def is_gmail_configured() -> bool:
    """Checks if client credentials.json is present on disk."""
    return get_credentials_path().exists()


def is_gmail_authenticated() -> bool:
    """Checks if user has authorized and a valid token is available."""
    token_file = get_token_path()
    if not token_file.exists():
        return False
    try:
        creds = Credentials.from_authorized_user_file(str(token_file))
        if creds and creds.valid:
            return True
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(token_file, "w", encoding="utf-8") as token:
                token.write(creds.to_json())
            return True
    except Exception as e:
        logger.warning("Error checking Gmail credentials validity: %s", e)
    return False


def save_credentials_file(file_bytes: bytes) -> bool:
    """Saves uploaded credentials.json file into data directory."""
    path = get_credentials_path()
    try:
        # Validate that it's valid JSON containing 'web' or 'installed'
        data = json.loads(file_bytes.decode("utf-8"))
        if "installed" not in data and "web" not in data:
            raise ValueError("Invalid credentials.json format: Missing 'installed' or 'web' client definition.")
        
        with open(path, "wb") as f:
            f.write(file_bytes)
        logger.info("Saved Google OAuth credentials to: %s", path)
        return True
    except Exception as e:
        logger.error("Failed to save credentials.json: %s", e)
        raise e


def get_auth_flow_url(redirect_uri: str) -> str:
    """Generates the Google OAuth consent URL for user login."""
    creds_path = get_credentials_path()
    if not creds_path.exists():
        raise FileNotFoundError("credentials.json not found. Please upload it first.")

    flow = Flow.from_client_secrets_file(
        str(creds_path),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        autogenerate_code_verifier=False,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def save_token_from_code(code: str, redirect_uri: str, code_verifier: Optional[str] = None) -> str:
    """Exchanges authorization code for tokens and saves to disk."""
    creds_path = get_credentials_path()
    flow = Flow.from_client_secrets_file(
        str(creds_path),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        autogenerate_code_verifier=False,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    token_path = get_token_path()
    with open(token_path, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
    logger.info("Successfully saved Gmail token to: %s", token_path)

    # Return user email
    return get_user_email() or "Connected"


def disconnect_gmail() -> bool:
    """Deletes token file to disconnect Gmail account."""
    token_path = get_token_path()
    if token_path.exists():
        try:
            token_path.unlink()
            return True
        except Exception as e:
            logger.error("Error removing token: %s", e)
    return False


def get_gmail_service():
    """Returns an authenticated Gmail API client."""
    token_path = get_token_path()
    if not token_path.exists():
        raise PermissionError("Gmail account is not connected. Please authorize first.")

    creds = Credentials.from_authorized_user_file(str(token_path))
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())
        else:
            raise PermissionError("Gmail credentials expired. Please reconnect your account.")

    return build("gmail", "v1", credentials=creds)


def get_user_email() -> Optional[str]:
    """Retrieves authenticated user's email address."""
    try:
        service = get_gmail_service()
        profile = service.users().getProfile(userId="me").execute()
        return profile.get("emailAddress")
    except Exception as e:
        logger.debug("Could not fetch user profile: %s", e)
        return None


def extract_body_from_payload(payload: Dict[str, Any]) -> str:
    """Recursively decodes email body from Gmail payload parts."""
    body_text = ""
    if "parts" in payload:
        for part in payload["parts"]:
            mime_type = part.get("mimeType", "")
            if mime_type == "text/plain" and "data" in part.get("body", {}):
                data = part["body"]["data"]
                return base64.urlsafe_b64decode(data.encode("ASCII")).decode("utf-8", errors="ignore")
            elif "parts" in part:
                nested = extract_body_from_payload(part)
                if nested:
                    return nested
    if "body" in payload and "data" in payload["body"]:
        data = payload["body"]["data"]
        return base64.urlsafe_b64decode(data.encode("ASCII")).decode("utf-8", errors="ignore")
    return body_text


def list_inbox_messages(query: str = "label:INBOX", max_results: int = 5) -> List[Dict[str, Any]]:
    """
    Lists recent emails matching query with sender, subject, date, snippet, and body snippet.
    """
    service = get_gmail_service()
    results = service.users().messages().list(
        userId="me",
        q=query,
        maxResults=max_results,
    ).execute()

    messages = results.get("messages", [])
    email_list = []

    for msg_meta in messages:
        msg_id = msg_meta["id"]
        try:
            msg = service.users().messages().get(
                userId="me",
                id=msg_id,
                format="full",
            ).execute()

            headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
            subject = headers.get("subject", "(No Subject)")
            sender = headers.get("from", "Unknown Sender")
            date_str = headers.get("date", "")
            snippet = msg.get("snippet", "")
            thread_id = msg.get("threadId", "")

            body = extract_body_from_payload(msg.get("payload", {}))
            clean_body = body.strip() if body else snippet

            # Limit body length for LLM context
            if len(clean_body) > 1500:
                clean_body = clean_body[:1497] + "..."

            email_list.append({
                "id": msg_id,
                "thread_id": thread_id,
                "subject": subject,
                "from": sender,
                "date": date_str,
                "snippet": snippet,
                "body": clean_body,
            })
        except Exception as e:
            logger.warning("Error fetching email %s: %s", msg_id, e)

    return email_list


def create_email_draft(to: str, subject: str, body: str, thread_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Creates a draft in the user's Gmail mailbox.
    """
    service = get_gmail_service()

    mime_msg = MIMEText(body, "plain", "utf-8")
    mime_msg["to"] = to
    mime_msg["subject"] = subject

    raw_message = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")
    draft_body: Dict[str, Any] = {
        "message": {
            "raw": raw_message,
        }
    }
    if thread_id:
        draft_body["message"]["threadId"] = thread_id

    created_draft = service.users().drafts().create(
        userId="me",
        body=draft_body,
    ).execute()

    return {
        "draft_id": created_draft.get("id"),
        "message_id": created_draft.get("message", {}).get("id"),
        "thread_id": created_draft.get("message", {}).get("threadId") or thread_id,
        "to": to,
        "subject": subject,
        "body": body,
        "status": "drafted",
    }


def send_email_message(to: str, subject: str, body: str, thread_id: Optional[str] = None, draft_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Sends an email directly, or sends an existing draft.
    """
    service = get_gmail_service()

    if draft_id:
        # Send existing draft
        sent = service.users().drafts().send(
            userId="me",
            body={"id": draft_id},
        ).execute()
        return {
            "id": sent.get("id"),
            "thread_id": sent.get("threadId"),
            "to": to,
            "subject": subject,
            "status": "sent",
        }

    # Send new message
    mime_msg = MIMEText(body, "plain", "utf-8")
    mime_msg["to"] = to
    mime_msg["subject"] = subject

    raw_message = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode("utf-8")
    send_body: Dict[str, Any] = {"raw": raw_message}
    if thread_id:
        send_body["threadId"] = thread_id

    sent = service.users().messages().send(
        userId="me",
        body=send_body,
    ).execute()

    return {
        "id": sent.get("id"),
        "thread_id": sent.get("threadId"),
        "to": to,
        "subject": subject,
        "status": "sent",
    }


def get_calendar_service():
    """Returns an authenticated Google Calendar API client if authorized."""
    token_path = get_token_path()
    if not token_path.exists():
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(token_path))
        granted_scopes = set(creds.scopes or [])
        if not any("calendar" in s for s in granted_scopes):
            logger.debug("Google Calendar scopes not yet granted in token.")
            return None
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(token_path, "w", encoding="utf-8") as f:
                f.write(creds.to_json())
        return build("calendar", "v3", credentials=creds)
    except Exception as e:
        logger.warning("Could not build Google Calendar service: %s", e)
        return None


def create_google_calendar_event(
    title: str,
    start_time_iso: str,
    end_time_iso: Optional[str] = None,
    location: str = "",
    description: str = "Scheduled with Okin AI",
) -> Optional[Dict[str, Any]]:
    """
    Creates an event directly on the user's primary Google Calendar with
    native popup & notification reminders.
    """
    service = get_calendar_service()
    if not service:
        return None

    try:
        # Normalize start datetime
        start_clean = start_time_iso.replace("Z", "+00:00")
        try:
            start_dt = datetime.fromisoformat(start_clean)
        except Exception:
            start_dt = datetime.now()

        if end_time_iso:
            try:
                end_dt = datetime.fromisoformat(end_time_iso.replace("Z", "+00:00"))
            except Exception:
                end_dt = start_dt + timedelta(hours=1)
        else:
            end_dt = start_dt + timedelta(hours=1)

        event_body = {
            "summary": title,
            "location": location,
            "description": description,
            "start": {
                "dateTime": start_dt.isoformat(),
            },
            "end": {
                "dateTime": end_dt.isoformat(),
            },
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": 10},
                    {"method": "popup", "minutes": 0},
                ],
            },
        }

        created = service.events().insert(calendarId="primary", body=event_body).execute()
        logger.info("Successfully created Google Calendar event: %s (id: %s)", title, created.get("id"))
        return created
    except Exception as e:
        logger.warning("Failed to create Google Calendar event: %s", e)
        return None

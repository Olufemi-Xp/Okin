import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from app.config import get_settings

logger = logging.getLogger(__name__)

# Try to import PyJWT; fallback to standard library RFC 7519 implementation
try:
    import jwt as pyjwt
    HAS_PYJWT = True
except ImportError:
    HAS_PYJWT = False


# --- Password Hashing (PBKDF2-HMAC-SHA256) ---

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a unique random salt."""
    salt = secrets.token_bytes(16)
    iterations = 200_000
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"{salt.hex()}${derived.hex()}"


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify password against salt$hash using constant-time comparison."""
    if not hashed_password or "$" not in hashed_password:
        return False
    try:
        salt_hex, hash_hex = hashed_password.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        iterations = 200_000
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(derived.hex(), hash_hex)
    except Exception as e:
        logger.error("Error verifying password hash: %s", e)
        return False


# --- Standard Library JWT Helpers (Fallback / Zero Dependency) ---

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * ((4 - (len(s) % 4)) % 4)
    return base64.urlsafe_b64decode(s + padding)


def _stdlib_create_jwt(payload: Dict[str, Any], secret: str, expires_delta: Optional[timedelta] = None) -> str:
    settings = get_settings()
    p = payload.copy()
    now_ts = int(time.time())
    if expires_delta:
        exp_ts = int(now_ts + expires_delta.total_seconds())
    else:
        exp_ts = int(now_ts + (settings.JWT_EXPIRATION_DAYS * 86400))
    p["iat"] = now_ts
    p["exp"] = exp_ts

    header = {"alg": "HS256", "typ": "JWT"}
    h_str = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_str = _b64url_encode(json.dumps(p, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_str}.{p_str}".encode("utf-8")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_str = _b64url_encode(sig)
    return f"{h_str}.{p_str}.{sig_str}"


def _stdlib_decode_jwt(token: str, secret: str) -> Optional[Dict[str, Any]]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h_str, p_str, sig_str = parts
        signing_input = f"{h_str}.{p_str}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_str)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(p_str).decode("utf-8"))
        if "exp" in payload and payload["exp"] < int(time.time()):
            return None
        return payload
    except Exception as e:
        logger.warning("JWT decode error: %s", e)
        return None


# --- Unified JWT API ---

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    settings = get_settings()
    secret = settings.JWT_SECRET
    if HAS_PYJWT:
        to_encode = data.copy()
        now = datetime.now(timezone.utc)
        if expires_delta:
            expire = now + expires_delta
        else:
            expire = now + timedelta(days=settings.JWT_EXPIRATION_DAYS)
        to_encode.update({"exp": expire, "iat": now})
        return pyjwt.encode(to_encode, secret, algorithm=settings.JWT_ALGORITHM)
    return _stdlib_create_jwt(data, secret, expires_delta)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify a signed JWT access token."""
    if not token or not token.strip():
        return None
    settings = get_settings()
    secret = settings.JWT_SECRET
    clean_token = token.strip()
    if HAS_PYJWT:
        try:
            payload = pyjwt.decode(clean_token, secret, algorithms=[settings.JWT_ALGORITHM])
            return payload
        except Exception:
            # Fall back to stdlib decode
            return _stdlib_decode_jwt(clean_token, secret)
    return _stdlib_decode_jwt(clean_token, secret)


# --- Google ID Token Verification ---

def verify_google_credential(credential: str) -> Dict[str, Any]:
    """
    Cryptographically verifies a Google ID token from Google Identity Services.
    Validates signature directly against Google's public keys, checks issuer,
    and returns verified claims (sub, email, name, picture).
    """
    if not credential or not credential.strip():
        raise ValueError("Google credential token is missing.")

    settings = get_settings()
    client_id = settings.GOOGLE_CLIENT_ID or None

    # Method 1: Use google-auth library
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        request = google_requests.Request()
        id_info = id_token.verify_oauth2_token(credential.strip(), request, audience=client_id)

        iss = id_info.get("iss", "")
        if iss not in ("accounts.google.com", "https://accounts.google.com"):
            raise ValueError(f"Unrecognized Google token issuer: {iss}")

        email = id_info.get("email")
        if not email:
            raise ValueError("No email returned in Google token.")

        if not id_info.get("email_verified"):
            raise ValueError("Google email is not verified.")

        return {
            "google_id": id_info.get("sub"),
            "email": email.strip().lower(),
            "name": id_info.get("name") or email.split("@")[0].title(),
            "picture": id_info.get("picture", ""),
        }
    except Exception as e:
        logger.warning("google.oauth2.id_token verification notice: %s. Trying direct Google tokeninfo endpoint...", e)

    # Method 2: Direct call to Google's tokeninfo API
    try:
        import requests as py_requests

        resp = py_requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": credential.strip()},
            timeout=10,
        )
        if resp.status_code != 200:
            raise ValueError(f"Google token verification failed with status {resp.status_code}")

        data = resp.json()
        iss = data.get("iss", "")
        if iss not in ("accounts.google.com", "https://accounts.google.com"):
            raise ValueError(f"Unrecognized Google token issuer: {iss}")

        if client_id and data.get("aud") != client_id:
            raise ValueError("Audience mismatch in Google token.")

        if str(data.get("email_verified", "")).lower() != "true":
            raise ValueError("Google email is not verified.")

        email = data.get("email")
        if not email:
            raise ValueError("No email found in Google token.")

        return {
            "google_id": data.get("sub"),
            "email": email.strip().lower(),
            "name": data.get("name") or email.split("@")[0].title(),
            "picture": data.get("picture", ""),
        }
    except Exception as e:
        logger.error("Failed to verify Google token: %s", e)
        raise ValueError(f"Invalid Google ID token: {e}")

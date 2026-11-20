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

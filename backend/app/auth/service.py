from datetime import datetime, timedelta, timezone
import secrets

import jwt

from app.auth.password import verify_password
from app.config import get_settings
from app.db.postgres import get_connection


class AuthServiceUnavailable(Exception):
    """Raised when the database or JWT configuration is unavailable."""


class AccountNotActive(Exception):
    """Raised when the user exists and password is correct, but account is not active."""


def authenticate_user(email: str, password: str) -> str | None:
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, password_hash, status
                    FROM public.users
                    WHERE email = %s
                    """,
                    (email,),
                )
                user = cursor.fetchone()
    except Exception as exc:
        raise AuthServiceUnavailable from exc

    if not user:
        return None

    try:
        is_valid = verify_password(password, user[1])
    except Exception:
        return None

    if not is_valid:
        return None

    status_val = user[2] if len(user) > 2 else "ACTIVE"
    if (status_val or "").upper() != "ACTIVE":
        raise AccountNotActive

    return str(user[0])



def create_access_token(subject: str) -> str:
    settings = get_settings()
    if not settings.JWT_SECRET_KEY:
        raise AuthServiceUnavailable

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    try:
        return jwt.encode(
            {"sub": subject, "exp": expires_at},
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )
    except (jwt.PyJWTError, ValueError, TypeError):
        raise AuthServiceUnavailable from None


def create_verification_token(email: str, expires_in_hours: int = 24) -> str:
    """Create a signed JWT token for email verification valid for 24 hours."""
    settings = get_settings()
    if not settings.JWT_SECRET_KEY:
        raise AuthServiceUnavailable

    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
    try:
        return jwt.encode(
            {
                "sub": email,
                "type": "email_verification",
                "exp": expires_at,
            },
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )
    except (jwt.PyJWTError, ValueError, TypeError):
        raise AuthServiceUnavailable from None


def verify_email_token(token: str) -> str | None:
    """Verify an email verification token and return the email if valid, or None."""
    settings = get_settings()
    if not settings.JWT_SECRET_KEY:
        raise AuthServiceUnavailable

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("type") != "email_verification":
            return None
        return payload.get("sub")
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


def verify_google_token(id_token_str: str) -> dict | None:
    """Verify a Google ID token and return user profile information if valid."""
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    settings = get_settings()
    try:
        request = google_requests.Request()
        audience = settings.GOOGLE_CLIENT_ID if settings.GOOGLE_CLIENT_ID else None
        idinfo = google_id_token.verify_oauth2_token(
            id_token_str,
            request,
            audience=audience,
        )
        if idinfo.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
            return None
        email = idinfo.get("email")
        if not email:
            return None
        return {
            "email": email,
            "full_name": idinfo.get("name") or email.split("@")[0],
            "google_id": idinfo.get("sub"),
            "picture": idinfo.get("picture"),
        }
    except Exception:
        return None


def generate_otp_code() -> str:
    """Generate a random 6-digit numeric OTP code."""
    return "".join(secrets.choice("0123456789") for _ in range(6))


def create_otp_session_token(email: str, user_id: str) -> str:
    """Create a temporary 10-minute JWT token for verifying 2FA OTP."""
    settings = get_settings()
    if not settings.JWT_SECRET_KEY:
        raise AuthServiceUnavailable("JWT secret key is not configured.")

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "sub": str(user_id),
        "email": email.strip().lower(),
        "scope": "otp_pending",
        "exp": expires_at,
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_otp_session_token(token: str) -> dict | None:
    """Verify an OTP session token and extract user details if valid."""
    settings = get_settings()
    if not settings.JWT_SECRET_KEY:
        raise AuthServiceUnavailable("JWT secret key is not configured.")

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        if payload.get("scope") != "otp_pending":
            return None
        return {
            "user_id": str(payload.get("sub")),
            "email": payload.get("email"),
        }
    except (jwt.PyJWTError, ValueError, TypeError):
        return None

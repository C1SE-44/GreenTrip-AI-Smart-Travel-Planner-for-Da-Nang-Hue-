from urllib.parse import quote, urljoin

import requests

from app.config import get_settings


class AvatarStorageError(Exception):
    """Base class for safe, user-facing avatar storage failures."""

    status_code = 503
    public_detail = "Avatar storage is not configured or is unavailable."


class AvatarStorageUnavailable(AvatarStorageError):
    """Raised when Supabase Storage is unavailable or not configured."""


class AvatarStorageForbidden(AvatarStorageError):
    """Raised when the configured server key cannot access the avatar bucket."""

    status_code = 403
    public_detail = "Avatar storage denied access. Check the backend key and bucket configuration."


class AvatarStoragePayloadTooLarge(AvatarStorageError):
    """Raised when Supabase rejects an avatar because it exceeds its upload limit."""

    status_code = 413
    public_detail = "Avatar image exceeds the storage upload limit."


def _configuration() -> tuple[str, str, str]:
    settings = get_settings()
    base_url = settings.SUPABASE_URL.strip().rstrip("/")
    # Prefer the current server-only key when both formats are configured.
    api_key = settings.SUPABASE_SECRET_KEY.strip() or settings.SUPABASE_SERVICE_ROLE_KEY.strip()
    bucket = settings.SUPABASE_AVATAR_BUCKET.strip()
    if not base_url or not api_key or not bucket:
        raise AvatarStorageUnavailable
    return base_url, api_key, bucket


def _headers(api_key: str) -> dict[str, str]:
    headers = {"apikey": api_key}
    # New sb_secret_* keys are API keys, not JWTs, and must not be sent as Bearer tokens.
    if not api_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _raise_storage_error(error: requests.RequestException) -> None:
    response = error.response
    status_code = response.status_code if response is not None else None
    if status_code == 403:
        raise AvatarStorageForbidden from error
    if status_code == 413:
        raise AvatarStoragePayloadTooLarge from error
    # A 401 from Storage means the backend credential was rejected; it is not the
    # user's GreenTrip JWT, so report a service configuration failure (503).
    raise AvatarStorageUnavailable from error


def _encoded_bucket(bucket: str) -> str:
    return quote(bucket, safe="")


def _encoded_path(path: str) -> str:
    segments = path.split("/")
    if not path or any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("Invalid storage object path.")
    return quote(path, safe="/")


def upload_avatar(path: str, content: bytes, content_type: str) -> None:
    base_url, api_key, bucket = _configuration()
    url = (
        f"{base_url}/storage/v1/object/"
        f"{_encoded_bucket(bucket)}/{_encoded_path(path)}"
    )
    headers = _headers(api_key)
    headers.update({"Content-Type": content_type, "x-upsert": "false"})
    try:
        response = requests.post(url, headers=headers, data=content, timeout=15)
        response.raise_for_status()
    except requests.RequestException as error:
        _raise_storage_error(error)


def get_signed_avatar_url(path: str) -> str:
    base_url, api_key, bucket = _configuration()
    url = (
        f"{base_url}/storage/v1/object/sign/"
        f"{_encoded_bucket(bucket)}/{_encoded_path(path)}"
    )
    try:
        response = requests.post(
            url,
            headers={**_headers(api_key), "Content-Type": "application/json"},
            json={"expiresIn": 3600},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        signed_path = payload.get("signedURL") if isinstance(payload, dict) else None
        if not isinstance(signed_path, str) or not signed_path:
            raise AvatarStorageUnavailable
        if signed_path.startswith(("http://", "https://")):
            return signed_path
        return urljoin(f"{base_url}/storage/v1/", signed_path.lstrip("/"))
    except requests.RequestException as error:
        _raise_storage_error(error)
    except (ValueError, TypeError) as error:
        raise AvatarStorageUnavailable from error


def delete_avatar(path: str) -> None:
    base_url, api_key, bucket = _configuration()
    url = f"{base_url}/storage/v1/object/{_encoded_bucket(bucket)}"
    try:
        response = requests.delete(
            url,
            headers={**_headers(api_key), "Content-Type": "application/json"},
            json={"prefixes": [path]},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as error:
        _raise_storage_error(error)

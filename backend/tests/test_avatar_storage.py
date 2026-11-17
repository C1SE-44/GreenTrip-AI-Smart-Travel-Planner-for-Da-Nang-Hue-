import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import requests

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.auth import avatar_storage


def test_new_secret_key_is_only_sent_as_apikey() -> None:
    assert avatar_storage._headers("sb_secret_test-key") == {"apikey": "sb_secret_test-key"}


def test_legacy_service_role_key_is_sent_as_apikey_and_bearer() -> None:
    assert avatar_storage._headers("legacy-service-role-jwt") == {
        "apikey": "legacy-service-role-jwt",
        "Authorization": "Bearer legacy-service-role-jwt",
    }


def test_configuration_prefers_new_secret_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        avatar_storage,
        "get_settings",
        lambda: SimpleNamespace(
            SUPABASE_URL=" https://project.supabase.co/ ",
            SUPABASE_SECRET_KEY=" sb_secret_current ",
            SUPABASE_SERVICE_ROLE_KEY="legacy-key",
            SUPABASE_AVATAR_BUCKET=" user-avatars ",
        ),
    )

    assert avatar_storage._configuration() == (
        "https://project.supabase.co",
        "sb_secret_current",
        "user-avatars",
    )


@pytest.mark.parametrize(
    ("storage_status", "expected_error"),
    [
        (401, avatar_storage.AvatarStorageUnavailable),
        (403, avatar_storage.AvatarStorageForbidden),
        (413, avatar_storage.AvatarStoragePayloadTooLarge),
        (503, avatar_storage.AvatarStorageUnavailable),
    ],
)
def test_storage_http_errors_are_safely_classified(
    monkeypatch: pytest.MonkeyPatch,
    storage_status: int,
    expected_error: type[Exception],
) -> None:
    error = requests.HTTPError("upstream response details must not be surfaced")
    error.response = Mock(status_code=storage_status)
    response = Mock()
    response.raise_for_status.side_effect = error
    monkeypatch.setattr(avatar_storage, "_configuration", lambda: ("https://project.invalid", "key", "bucket"))
    monkeypatch.setattr(avatar_storage.requests, "post", Mock(return_value=response))

    with pytest.raises(expected_error) as raised:
        avatar_storage.upload_avatar("user-a/avatar.jpg", b"image", "image/jpeg")

    assert "upstream response details" not in str(raised.value)

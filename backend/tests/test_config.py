import pytest

from app.config import Settings


SUPABASE_KEY_NAMES = (
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_ANON_KEY",
)


@pytest.mark.parametrize(
    "key_name",
    SUPABASE_KEY_NAMES,
)
def test_settings_load_supabase_environment(monkeypatch: pytest.MonkeyPatch, key_name: str) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    for supported_key in SUPABASE_KEY_NAMES:
        monkeypatch.delenv(supported_key, raising=False)
    monkeypatch.setenv(key_name, "test-key")

    settings = Settings(_env_file=None)

    assert getattr(settings, key_name) == "test-key"
    assert settings.supabase_configured


def test_supabase_configured_requires_url_and_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    for supported_key in SUPABASE_KEY_NAMES:
        monkeypatch.delenv(supported_key, raising=False)

    assert not Settings(_env_file=None).supabase_configured

    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-key")
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    assert not Settings(_env_file=None).supabase_configured

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
_DEV_JWT_SECRET = "greentrip-dev-secret-jwt-key-2026-very-secure"
_INSECURE_JWT_DEFAULTS = frozenset({_DEV_JWT_SECRET, "change-me", ""})
_DEPLOYED_ENVS = frozenset({"production", "prod", "staging"})


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_DIR / ".env"), ".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    RATE_LIMIT_ENABLED: bool = True
    DATABASE_URL: str = ""
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_AVATAR_BUCKET: str = "user-avatars"
    NEO4J_URI: str = ""
    NEO4J_USERNAME: str = ""
    NEO4J_PASSWORD: str = ""
    NEO4J_DATABASE: str = "neo4j"
    JWT_SECRET_KEY: str = _DEV_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, gt=0)
    FRONTEND_URL: str = "http://localhost:5173"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@greentrip.vn"
    SMTP_FROM_NAME: str = "GreenTrip AI"
    GOOGLE_CLIENT_ID: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        normalized_env = self.APP_ENV.strip().lower() or "development"
        self.APP_ENV = normalized_env
        if normalized_env in _DEPLOYED_ENVS:
            secret = self.JWT_SECRET_KEY.strip()
            if secret in _INSECURE_JWT_DEFAULTS or len(secret) < 32:
                raise ValueError(
                    "JWT_SECRET_KEY must be set to a strong secret (>= 32 chars) when APP_ENV is staging or production."
                )
        return self

    @property
    def gemini_configured(self) -> bool:
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    @property
    def smtp_configured(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER and self.SMTP_PASSWORD)

    @property
    def neo4j_configured(self) -> bool:
        return bool(self.NEO4J_URI and self.NEO4J_USERNAME and self.NEO4J_PASSWORD)

    @property
    def supabase_configured(self) -> bool:
        return bool(
            self.SUPABASE_URL
            and (
                self.SUPABASE_PUBLISHABLE_KEY
                or self.SUPABASE_SECRET_KEY
                or self.SUPABASE_SERVICE_ROLE_KEY
                or self.SUPABASE_ANON_KEY
            )
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

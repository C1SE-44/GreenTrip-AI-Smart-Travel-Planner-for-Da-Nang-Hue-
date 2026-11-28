from functools import lru_cache
from pathlib import Path
import re

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
_DEV_JWT_SECRET = "greentrip-dev-secret-jwt-key-2026-very-secure"
_INSECURE_JWT_DEFAULTS = frozenset({_DEV_JWT_SECRET, "change-me", ""})
_DEPLOYED_ENVS = frozenset({"production", "prod", "staging"})
_SUPABASE_DB_HOST_RE = re.compile(r"^(https?://)db\.([a-z0-9-]+\.supabase\.co)", re.IGNORECASE)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_DIR / ".env"), ".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    RATE_LIMIT_ENABLED: bool = True
    DATABASE_URL: str = ""
    SQLITE_FALLBACK_ENABLED: bool = False
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
    GOOGLE_PLACES_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    REDIS_URL: str = ""
    POI_CACHE_TTL_SECONDS: int = Field(default=300, ge=10, le=3600)

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.SUPABASE_URL:
            self.SUPABASE_URL = _SUPABASE_DB_HOST_RE.sub(r"\1\2", self.SUPABASE_URL.strip()).rstrip("/")
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

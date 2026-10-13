from psycopg import Connection, connect

from app.config import get_settings


def get_connection() -> Connection:
    settings = get_settings()

    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured.")

    return connect(
        settings.DATABASE_URL,
        connect_timeout=10,
    )
"""Explicit development-only command for sample itinerary data."""

from app.config import get_settings
from app.itineraries.repository import seed_sample_itineraries


def main() -> None:
    settings = get_settings()
    if str(settings.APP_ENV).strip().lower() != "development":
        raise RuntimeError("Sample itinerary seeding is available only in development.")
    if settings.DATABASE_URL:
        raise RuntimeError("Sample itinerary seeding refuses a configured PostgreSQL database.")
    if not settings.SQLITE_FALLBACK_ENABLED:
        raise RuntimeError("Set SQLITE_FALLBACK_ENABLED=true to explicitly enable local SQLite.")
    seed_sample_itineraries()


if __name__ == "__main__":
    main()

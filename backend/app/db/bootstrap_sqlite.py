"""Explicit bootstrap command for the local development SQLite database."""

import argparse

from app.config import get_settings
from app.assistant import store, workspaces
from app.db import postgres
from app.trips.itinerary_repository import _ensure_local_tables


def bootstrap_local_sqlite(*, import_pois: bool = False) -> None:
    settings = get_settings()
    if str(settings.APP_ENV).strip().lower() != "development":
        raise RuntimeError("Local SQLite bootstrap is available only in development.")
    if not settings.SQLITE_FALLBACK_ENABLED:
        raise RuntimeError("Set SQLITE_FALLBACK_ENABLED=true to explicitly enable local SQLite.")
    if settings.DATABASE_URL:
        raise RuntimeError("Local SQLite bootstrap refuses a configured PostgreSQL database.")

    connection = postgres._open_sqlite(postgres._resolve_sqlite_path(settings))
    try:
        postgres._ensure_sqlite_tables(connection._conn)
        with connection.cursor() as cursor:
            _ensure_local_tables(connection, cursor)
        postgres._bootstrap_sqlite_reference_data(connection._conn, import_pois=import_pois)
        connection.commit()
    finally:
        connection.close()
    store.initialize_store()
    workspaces.initialize_store()


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the explicitly configured local SQLite database.")
    parser.add_argument(
        "--import-pois",
        action="store_true",
        help="Import POIs from the bundled CSV as part of this explicit bootstrap.",
    )
    args = parser.parse_args()
    bootstrap_local_sqlite(import_pois=args.import_pois)


if __name__ == "__main__":
    main()

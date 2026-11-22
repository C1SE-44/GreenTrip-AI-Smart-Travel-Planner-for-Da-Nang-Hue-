"""Tests for Migration 018 (3NF constraints, FKs, pg_trgm/composite indexes) and itinerary FK population."""
from pathlib import Path
import sys
import uuid

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.config import get_settings  # noqa: E402
from app.db.postgres import get_connection  # noqa: E402
from app.trips.itinerary_repository import save_itinerary  # noqa: E402
from app.trips.schemas import ItineraryDay, ItineraryStop, TripItinerarySyncRequest  # noqa: E402


def test_migration_018_defines_expected_3nf_constraints_and_indexes() -> None:
    sql_path = BACKEND_ROOT / "migrations" / "018_db_3nf_fk_indexes_and_audit.sql"
    sql = sql_path.read_text(encoding="utf-8")

    expected_tokens = [
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "idx_pois_name_trgm",
        "idx_pois_address_trgm",
        "idx_pois_city_category_active",
        "chk_pois_green_score",
        "chk_pois_estimated_cost",
        "chk_pois_satisfaction_score",
        "chk_pois_visit_minutes",
        "chk_users_role",
        "chk_users_status",
        "fk_itineraries_owner_user",
        "fk_itinerary_stops_poi_uuid",
        "admin_audit_logs",
    ]
    for token in expected_tokens:
        assert token in sql, f"Migration 018 missing required element: {token}"


def test_save_itinerary_populates_strict_fk_columns_and_allows_guest_stops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", " ")
    get_settings.cache_clear()

    user_uuid = str(uuid.uuid4())
    poi_uuid = str(uuid.uuid4())
    trip_id = f"trip-3nf-{uuid.uuid4().hex[:8]}"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO public.users (user_id, full_name, email, role, status) VALUES (%s, %s, %s, 'USER', 'ACTIVE')",
                (user_uuid, "3NF Tester", f"3nf-{uuid.uuid4().hex[:8]}@example.com"),
            )
            cur.execute(
                "INSERT INTO public.pois (poi_id, name, is_active) VALUES (%s, %s, 1)",
                (poi_uuid, "POI Test 3NF"),
            )
        conn.commit()

    payload = TripItinerarySyncRequest(
        trip_id=trip_id,
        title="Hành trình Test 3NF",
        destination="Đà Nẵng",
        days_count=1,
        days=[
            ItineraryDay(
                day_id=f"{trip_id}-d1",
                day_number=1,
                title="Ngày 1",
                stops=[
                    ItineraryStop(
                        stop_id=f"{trip_id}-s1",
                        poi_id=poi_uuid,
                        title="POI Test 3NF",
                        stop_type="poi",
                        source="idea",
                        sequence=0,
                        duration_minutes=60,
                    ),
                    ItineraryStop(
                        stop_id=f"{trip_id}-s2",
                        poi_id="custom-lunch-break",
                        title="Nghỉ trưa tự chọn",
                        stop_type="rest",
                        source="manual",
                        sequence=1,
                        duration_minutes=60,
                    ),
                ],
            )
        ],
    )

    save_itinerary(payload, user_id=user_uuid)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT owner_user_id FROM public.itineraries WHERE trip_id = %s", (trip_id,))
            assert cur.fetchone() == (user_uuid,)

            cur.execute(
                "SELECT poi_uuid FROM public.itinerary_stops WHERE stop_id IN (%s, %s) ORDER BY sequence",
                (f"{trip_id}-s1", f"{trip_id}-s2"),
            )
            assert cur.fetchall() == [(poi_uuid,), (None,)]

            # Cleanup test records from SQLite
            cur.execute("DELETE FROM public.itineraries WHERE trip_id = %s", (trip_id,))
            cur.execute("DELETE FROM public.pois WHERE poi_id = %s", (poi_uuid,))
            cur.execute("DELETE FROM public.users WHERE user_id = %s", (user_uuid,))
        conn.commit()

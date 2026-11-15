from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.db.postgres import SQLiteConnectionWrapper, get_connection
from app.trips.schemas import (
    ItineraryDay,
    ItineraryStop,
    MyTripSummaryResponse,
    TripItineraryResponse,
    TripItinerarySyncRequest,
)


def _ensure_local_tables(connection: Any, cursor: Any) -> None:
    # PostgreSQL schema is managed by backend/migrations; only bootstrap the SQLite fallback.
    if not isinstance(connection, SQLiteConnectionWrapper):
        return
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS public.itineraries (
            trip_id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT NOT NULL,
            destination TEXT NOT NULL,
            start_date DATE,
            days_count INTEGER NOT NULL CHECK (days_count BETWEEN 1 AND 31),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS public.itinerary_days (
            day_id TEXT PRIMARY KEY,
            trip_id TEXT NOT NULL REFERENCES public.itineraries(trip_id) ON DELETE CASCADE,
            day_number INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 31),
            date DATE,
            title TEXT NOT NULL DEFAULT '',
            UNIQUE (trip_id, day_number)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS public.itinerary_stops (
            stop_id TEXT PRIMARY KEY,
            day_id TEXT NOT NULL REFERENCES public.itinerary_days(day_id) ON DELETE CASCADE,
            poi_id TEXT,
            title TEXT NOT NULL,
            city TEXT,
            address TEXT,
            category TEXT,
            stop_type TEXT NOT NULL DEFAULT 'poi' CHECK (stop_type IN ('poi', 'rest', 'custom')),
            source TEXT NOT NULL DEFAULT 'idea' CHECK (source IN ('idea', 'manual', 'assistant')),
            sequence INTEGER NOT NULL CHECK (sequence >= 0),
            duration_minutes INTEGER CHECK (duration_minutes BETWEEN 1 AND 1440),
            start_time TEXT,
            end_time TEXT,
            comment TEXT,
            latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
            longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
            UNIQUE (day_id, sequence)
        )
        """
    )
    cursor.execute("PRAGMA table_info(itinerary_stops)")
    stop_columns = {row[1] for row in cursor.fetchall()}
    for col, col_type in [
        ("stop_id", "TEXT"),
        ("day_id", "TEXT"),
        ("title", "TEXT DEFAULT ''"),
        ("city", "TEXT"),
        ("address", "TEXT"),
        ("category", "TEXT"),
        ("stop_type", "TEXT DEFAULT 'poi'"),
        ("source", "TEXT DEFAULT 'idea'"),
        ("sequence", "INTEGER DEFAULT 0"),
        ("duration_minutes", "INTEGER"),
        ("start_time", "TEXT"),
        ("end_time", "TEXT"),
        ("comment", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
    ]:
        if col not in stop_columns:
            cursor.execute(f"ALTER TABLE itinerary_stops ADD COLUMN {col} {col_type}")
    if "itinerary_stop_id" in stop_columns:
        cursor.execute("UPDATE itinerary_stops SET stop_id = itinerary_stop_id WHERE stop_id IS NULL")
    if "itinerary_day_id" in stop_columns:
        cursor.execute("UPDATE itinerary_stops SET day_id = itinerary_day_id WHERE day_id IS NULL")
    if "sequence_no" in stop_columns:
        cursor.execute("UPDATE itinerary_stops SET sequence = sequence_no WHERE sequence IS NULL OR sequence = 0")
    if "notes" in stop_columns:
        cursor.execute("UPDATE itinerary_stops SET comment = notes WHERE comment IS NULL")

    cursor.execute("PRAGMA table_info(itineraries)")
    itin_columns = {row[1] for row in cursor.fetchall()}
    if "trip_id" not in itin_columns:
        cursor.execute("ALTER TABLE itineraries ADD COLUMN trip_id TEXT")
    if "itinerary_id" not in itin_columns:
        cursor.execute("ALTER TABLE itineraries ADD COLUMN itinerary_id TEXT")
    if "total_days" not in itin_columns:
        cursor.execute("ALTER TABLE itineraries ADD COLUMN total_days INTEGER")
    if "start_date" not in itin_columns:
        cursor.execute("ALTER TABLE itineraries ADD COLUMN start_date DATE")
    if "days_count" not in itin_columns:
        cursor.execute("ALTER TABLE itineraries ADD COLUMN days_count INTEGER")
    if "itinerary_id" in itin_columns:
        cursor.execute("UPDATE itineraries SET trip_id = itinerary_id WHERE trip_id IS NULL")
        if "total_days" in itin_columns:
            cursor.execute("UPDATE itineraries SET days_count = total_days WHERE days_count IS NULL")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_itineraries_trip_id ON itineraries(trip_id)")

    cursor.execute("PRAGMA table_info(itinerary_days)")
    day_columns = {row[1] for row in cursor.fetchall()}
    if "day_id" not in day_columns:
        cursor.execute("ALTER TABLE itinerary_days ADD COLUMN day_id TEXT")
    if "itinerary_day_id" not in day_columns:
        cursor.execute("ALTER TABLE itinerary_days ADD COLUMN itinerary_day_id TEXT")
    if "trip_id" not in day_columns:
        cursor.execute("ALTER TABLE itinerary_days ADD COLUMN trip_id TEXT")
    if "itinerary_id" not in day_columns:
        cursor.execute("ALTER TABLE itinerary_days ADD COLUMN itinerary_id TEXT")
    if "date" not in day_columns:
        cursor.execute("ALTER TABLE itinerary_days ADD COLUMN date DATE")
    if "title" not in day_columns:
        cursor.execute("ALTER TABLE itinerary_days ADD COLUMN title TEXT DEFAULT ''")
    if "itinerary_day_id" in day_columns:
        cursor.execute("UPDATE itinerary_days SET day_id = itinerary_day_id WHERE day_id IS NULL")
    if "itinerary_id" in day_columns:
        cursor.execute("UPDATE itinerary_days SET trip_id = itinerary_id WHERE trip_id IS NULL")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_days_day_id ON itinerary_days(day_id)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_days_trip_day ON itinerary_days(trip_id, day_number)")

    cursor.execute("PRAGMA table_info(itinerary_stops)")
    stop_columns = {row[1] for row in cursor.fetchall()}
    for col, col_type in [
        ("stop_id", "TEXT"),
        ("day_id", "TEXT"),
        ("itinerary_stop_id", "TEXT"),
        ("itinerary_day_id", "TEXT"),
        ("sequence_no", "INTEGER DEFAULT 0"),
        ("title", "TEXT DEFAULT ''"),
        ("city", "TEXT"),
        ("address", "TEXT"),
        ("category", "TEXT"),
        ("stop_type", "TEXT DEFAULT 'poi'"),
        ("source", "TEXT DEFAULT 'idea'"),
        ("sequence", "INTEGER DEFAULT 0"),
        ("duration_minutes", "INTEGER"),
        ("start_time", "TEXT"),
        ("end_time", "TEXT"),
        ("comment", "TEXT"),
        ("latitude", "REAL"),
        ("longitude", "REAL"),
    ]:
        if col not in stop_columns:
            cursor.execute(f"ALTER TABLE itinerary_stops ADD COLUMN {col} {col_type}")

    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_stops_stop_id ON itinerary_stops(stop_id)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_itinerary_stops_day_seq ON itinerary_stops(day_id, sequence)")


def save_itinerary(payload: TripItinerarySyncRequest, user_id: str | None) -> TripItineraryResponse:
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute("SELECT user_id FROM public.itineraries WHERE trip_id = %s", (payload.trip_id,))
                existing = cursor.fetchone()
                owner_id = existing[0] if existing else None
                if owner_id and owner_id != user_id:
                    raise HTTPException(status_code=404, detail="Không tìm thấy lịch trình.")

                cursor.execute(
                    """
                    INSERT INTO public.itineraries (trip_id, user_id, title, destination, start_date, days_count, updated_at, itinerary_id, total_days)
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s, %s)
                    ON CONFLICT (trip_id) DO UPDATE SET
                        user_id = COALESCE(EXCLUDED.user_id, itineraries.user_id),
                        title = EXCLUDED.title,
                        destination = EXCLUDED.destination,
                        start_date = EXCLUDED.start_date,
                        days_count = EXCLUDED.days_count,
                        itinerary_id = EXCLUDED.trip_id,
                        total_days = EXCLUDED.days_count,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (payload.trip_id, user_id, payload.title, payload.destination, payload.start_date, payload.days_count, payload.trip_id, payload.days_count),
                )
                cursor.execute(
                    "DELETE FROM public.itinerary_stops WHERE day_id IN (SELECT day_id FROM public.itinerary_days WHERE trip_id = %s)",
                    (payload.trip_id,),
                )
                cursor.execute("DELETE FROM public.itinerary_days WHERE trip_id = %s", (payload.trip_id,))
                for day in payload.days:
                    cursor.execute(
                        "INSERT INTO public.itinerary_days (day_id, trip_id, day_number, date, title, itinerary_id, itinerary_day_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (day.day_id, payload.trip_id, day.day_number, day.date, day.title, payload.trip_id, day.day_id),
                    )
                    for stop in day.stops:
                        cursor.execute(
                            """
                            INSERT INTO public.itinerary_stops (
                                stop_id, day_id, poi_id, title, city, address, category, stop_type, source,
                                sequence, duration_minutes, start_time, end_time, comment, latitude, longitude,
                                itinerary_stop_id, itinerary_day_id, sequence_no
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                stop.stop_id, day.day_id, stop.poi_id, stop.title, stop.city, stop.address, stop.category,
                                stop.stop_type, stop.source, stop.sequence, stop.duration_minutes,
                                stop.start_time, stop.end_time, stop.comment, stop.latitude, stop.longitude,
                                stop.stop_id, day.day_id, stop.sequence,
                            ),
                        )
                connection.commit()
                cursor.execute("SELECT updated_at FROM public.itineraries WHERE trip_id = %s", (payload.trip_id,))
                row = cursor.fetchone()
                return TripItineraryResponse(**payload.model_dump(), updated_at=row[0] if row else datetime.utcnow())
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa thể lưu lịch trình vào cơ sở dữ liệu.") from error


def get_itinerary(trip_id: str, user_id: str | None) -> TripItineraryResponse | None:
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute(
                    "SELECT trip_id, user_id, title, destination, start_date, days_count, updated_at FROM public.itineraries WHERE trip_id = %s",
                    (trip_id,),
                )
                trip = cursor.fetchone()
                if not trip or (trip[1] and trip[1] != user_id):
                    return None
                cursor.execute(
                    "SELECT day_id, day_number, date, title FROM public.itinerary_days WHERE trip_id = %s ORDER BY day_number",
                    (trip_id,),
                )
                day_rows = cursor.fetchall()
                days: list[ItineraryDay] = []
                for day_row in day_rows:
                    cursor.execute(
                        """
                        SELECT stop_id, poi_id, title, city, address, category, stop_type, source, sequence,
                               duration_minutes, start_time, end_time, comment, latitude, longitude
                        FROM public.itinerary_stops WHERE day_id = %s ORDER BY sequence
                        """,
                        (day_row[0],),
                    )
                    stops = [ItineraryStop(
                        stop_id=row[0], poi_id=row[1], title=row[2], city=row[3], address=row[4], category=row[5],
                        stop_type=row[6], source=row[7], sequence=row[8], duration_minutes=row[9],
                        start_time=row[10], end_time=row[11], comment=row[12], latitude=row[13], longitude=row[14],
                    ) for row in cursor.fetchall()]
                    day_date = day_row[2].isoformat() if hasattr(day_row[2], "isoformat") else day_row[2]
                    days.append(ItineraryDay(day_id=day_row[0], day_number=day_row[1], date=day_date, title=day_row[3], stops=stops))
                return TripItineraryResponse(
                    trip_id=trip[0], title=trip[2], destination=trip[3],
                    start_date=trip[4].isoformat() if hasattr(trip[4], "isoformat") else trip[4],
                    days_count=trip[5], days=days, updated_at=trip[6],
                )
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa thể tải lịch trình từ cơ sở dữ liệu.") from error


def list_user_itineraries(user_id: str) -> list[MyTripSummaryResponse]:
    """Retrieve all saved itineraries for a specific authenticated user ordered by updated_at desc."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute(
                    """
                    SELECT
                        i.trip_id,
                        i.title,
                        i.destination,
                        i.start_date,
                        i.days_count,
                        i.updated_at,
                        (
                            SELECT COUNT(*)
                            FROM public.itinerary_stops s
                            JOIN public.itinerary_days d ON s.day_id = d.day_id
                            WHERE d.trip_id = i.trip_id
                        ) as total_stops
                    FROM public.itineraries i
                    WHERE i.user_id = %s
                    ORDER BY i.updated_at DESC
                    """,
                    (user_id,),
                )
                rows = cursor.fetchall()
                results: list[MyTripSummaryResponse] = []
                for row in rows:
                    start_date_val = row[3].isoformat() if hasattr(row[3], "isoformat") else row[3]
                    updated_at_val = row[5].isoformat() if hasattr(row[5], "isoformat") else row[5]
                    results.append(
                        MyTripSummaryResponse(
                            trip_id=row[0],
                            title=row[1],
                            destination=row[2] or "Đà Nẵng & Huế",
                            start_date=start_date_val,
                            days_count=row[4] or 1,
                            total_stops=row[6] or 0,
                            updated_at=updated_at_val,
                        )
                    )
                return results
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa thể tải danh sách chuyến đi từ cơ sở dữ liệu.") from error


def get_itinerary_with_ownership(trip_id: str, user_id: str) -> TripItineraryResponse:
    """Retrieve itinerary details while strictly enforcing owner permissions."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute(
                    "SELECT trip_id, user_id, title, destination, start_date, days_count, updated_at FROM public.itineraries WHERE trip_id = %s",
                    (trip_id,),
                )
                trip = cursor.fetchone()
                if not trip:
                    raise HTTPException(status_code=404, detail="Không tìm thấy chuyến đi.")
                owner_id = trip[1]
                if owner_id and owner_id != user_id:
                    raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập chuyến đi này.")

                cursor.execute(
                    "SELECT day_id, day_number, date, title FROM public.itinerary_days WHERE trip_id = %s ORDER BY day_number",
                    (trip_id,),
                )
                day_rows = cursor.fetchall()
                days: list[ItineraryDay] = []
                for day_row in day_rows:
                    cursor.execute(
                        """
                        SELECT stop_id, poi_id, title, city, address, category, stop_type, source, sequence,
                               duration_minutes, start_time, end_time, comment, latitude, longitude
                        FROM public.itinerary_stops WHERE day_id = %s ORDER BY sequence
                        """,
                        (day_row[0],),
                    )
                    stops = [ItineraryStop(
                        stop_id=row[0], poi_id=row[1], title=row[2], city=row[3], address=row[4], category=row[5],
                        stop_type=row[6], source=row[7], sequence=row[8], duration_minutes=row[9],
                        start_time=row[10], end_time=row[11], comment=row[12], latitude=row[13], longitude=row[14],
                    ) for row in cursor.fetchall()]
                    day_date = day_row[2].isoformat() if hasattr(day_row[2], "isoformat") else day_row[2]
                    days.append(ItineraryDay(day_id=day_row[0], day_number=day_row[1], date=day_date, title=day_row[3], stops=stops))

                return TripItineraryResponse(
                    trip_id=trip[0], title=trip[2], destination=trip[3],
                    start_date=trip[4].isoformat() if hasattr(trip[4], "isoformat") else trip[4],
                    days_count=trip[5], days=days, updated_at=trip[6],
                )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa thể tải chi tiết lịch trình từ cơ sở dữ liệu.") from error


def update_itinerary_metadata(
    trip_id: str,
    user_id: str,
    title: str | None = None,
    start_date: str | None = None,
    destination: str | None = None,
) -> TripItineraryResponse:
    """Update high-level metadata (title, start_date, destination) for a user's trip."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute(
                    "SELECT trip_id, user_id FROM public.itineraries WHERE trip_id = %s",
                    (trip_id,),
                )
                trip = cursor.fetchone()
                if not trip:
                    raise HTTPException(status_code=404, detail="Không tìm thấy chuyến đi cần cập nhật.")
                owner_id = trip[1]
                if owner_id and owner_id != user_id:
                    raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa chuyến đi này.")

                updates = []
                params = []
                if title is not None:
                    updates.append("title = %s")
                    params.append(title)
                if start_date is not None:
                    updates.append("start_date = %s")
                    params.append(start_date)
                if destination is not None:
                    updates.append("destination = %s")
                    params.append(destination)

                if updates:
                    updates.append("updated_at = CURRENT_TIMESTAMP")
                    params.append(trip_id)
                    query = f"UPDATE public.itineraries SET {', '.join(updates)} WHERE trip_id = %s"
                    cursor.execute(query, tuple(params))
                    connection.commit()

        return get_itinerary_with_ownership(trip_id, user_id)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa thể cập nhật chuyến đi trong cơ sở dữ liệu.") from error


def delete_user_itinerary(trip_id: str, user_id: str) -> bool:
    """Permanently delete a trip and all its days and stops with ownership validation."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                _ensure_local_tables(connection, cursor)
                cursor.execute(
                    "SELECT trip_id, user_id FROM public.itineraries WHERE trip_id = %s",
                    (trip_id,),
                )
                trip = cursor.fetchone()
                if not trip:
                    raise HTTPException(status_code=404, detail="Không tìm thấy chuyến đi cần xóa.")
                owner_id = trip[1]
                if owner_id and owner_id != user_id:
                    raise HTTPException(status_code=403, detail="Bạn không có quyền xóa chuyến đi này.")

                cursor.execute(
                    "DELETE FROM public.itinerary_stops WHERE day_id IN (SELECT day_id FROM public.itinerary_days WHERE trip_id = %s)",
                    (trip_id,),
                )
                cursor.execute("DELETE FROM public.itinerary_days WHERE trip_id = %s", (trip_id,))
                cursor.execute("DELETE FROM public.itineraries WHERE trip_id = %s", (trip_id,))
                connection.commit()
                return True
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Chưa thể xóa chuyến đi khỏi cơ sở dữ liệu.") from error

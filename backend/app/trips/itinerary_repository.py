from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from app.db.postgres import SQLiteConnectionWrapper, get_connection
from app.trips.schemas import ItineraryDay, ItineraryStop, TripItineraryResponse, TripItinerarySyncRequest


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
    cursor.execute("PRAGMA table_info(public.itinerary_stops)")
    stop_columns = {row[1] for row in cursor.fetchall()}
    if "address" not in stop_columns:
        cursor.execute("ALTER TABLE public.itinerary_stops ADD COLUMN address TEXT")


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
                    INSERT INTO public.itineraries (trip_id, user_id, title, destination, start_date, days_count, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (trip_id) DO UPDATE SET
                        user_id = COALESCE(itineraries.user_id, EXCLUDED.user_id),
                        title = EXCLUDED.title,
                        destination = EXCLUDED.destination,
                        start_date = EXCLUDED.start_date,
                        days_count = EXCLUDED.days_count,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (payload.trip_id, user_id, payload.title, payload.destination, payload.start_date, payload.days_count),
                )
                cursor.execute(
                    "DELETE FROM public.itinerary_stops WHERE day_id IN (SELECT day_id FROM public.itinerary_days WHERE trip_id = %s)",
                    (payload.trip_id,),
                )
                cursor.execute("DELETE FROM public.itinerary_days WHERE trip_id = %s", (payload.trip_id,))
                for day in payload.days:
                    cursor.execute(
                        "INSERT INTO public.itinerary_days (day_id, trip_id, day_number, date, title) VALUES (%s, %s, %s, %s, %s)",
                        (day.day_id, payload.trip_id, day.day_number, day.date, day.title),
                    )
                    for stop in day.stops:
                        cursor.execute(
                            """
                            INSERT INTO public.itinerary_stops (
                                stop_id, day_id, poi_id, title, city, address, category, stop_type, source,
                                sequence, duration_minutes, start_time, end_time, comment, latitude, longitude
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                stop.stop_id, day.day_id, stop.poi_id, stop.title, stop.city, stop.address, stop.category,
                                stop.stop_type, stop.source, stop.sequence, stop.duration_minutes,
                                stop.start_time, stop.end_time, stop.comment, stop.latitude, stop.longitude,
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

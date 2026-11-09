import csv
import logging
from pathlib import Path
from typing import Any

from app.db.postgres import get_connection

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_CSV_PATH = _PROJECT_ROOT / "data" / "processed" / "pois.csv"

_CACHED_CSV_POIS: dict[str, dict[str, Any]] | None = None


def _load_csv_poi_lookup() -> dict[str, dict[str, Any]]:
    global _CACHED_CSV_POIS
    if _CACHED_CSV_POIS is not None:
        return _CACHED_CSV_POIS

    lookup: dict[str, dict[str, Any]] = {}
    if not _CSV_PATH.exists():
        logger.warning("POIs CSV not found at %s", _CSV_PATH)
        return lookup

    try:
        with open(_CSV_PATH, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                osm_id = (row.get("osm_id") or "").strip()
                name = (row.get("name") or "").strip()
                lat_raw = row.get("latitude")
                lng_raw = row.get("longitude")

                try:
                    lat = float(lat_raw) if lat_raw else None
                except (ValueError, TypeError):
                    lat = None

                try:
                    lng = float(lng_raw) if lng_raw else None
                except (ValueError, TypeError):
                    lng = None

                poi_data = {
                    "poi_id": osm_id,
                    "name": name,
                    "latitude": lat,
                    "longitude": lng,
                    "city": row.get("city_name") or "",
                    "category": row.get("category_name") or "",
                }

                if osm_id:
                    lookup[osm_id] = poi_data
                if name:
                    lookup[name.lower()] = poi_data

        _CACHED_CSV_POIS = lookup
    except Exception as exc:
        logger.error("Error reading POIs CSV: %s", exc)

    return _CACHED_CSV_POIS or {}


def ensure_itinerary_tables():
    """Ensure itineraries, itinerary_days, and itinerary_stops tables exist in database."""
    create_tables_sql = """
    CREATE TABLE IF NOT EXISTS itineraries (
        itinerary_id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT NOT NULL,
        destination TEXT DEFAULT 'Đà Nẵng & Huế',
        total_days INTEGER NOT NULL DEFAULT 1,
        total_cost REAL DEFAULT 0,
        total_carbon_co2e REAL DEFAULT 0,
        status TEXT DEFAULT 'DRAFT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS itinerary_days (
        itinerary_day_id TEXT PRIMARY KEY,
        itinerary_id TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        theme TEXT,
        focus_city TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (itinerary_id, day_number)
    );

    CREATE TABLE IF NOT EXISTS itinerary_stops (
        itinerary_stop_id TEXT PRIMARY KEY,
        itinerary_day_id TEXT NOT NULL,
        poi_id TEXT NOT NULL,
        sequence_no INTEGER NOT NULL,
        time_slot TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (itinerary_day_id, sequence_no)
    );
    """
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            for statement in create_tables_sql.strip().split(";"):
                stmt = statement.strip()
                if stmt:
                    cursor.execute(stmt)

            # If connecting to PostgreSQL with legacy schema (trip_id, days_count, etc.), align columns:
            try:
                cursor.execute("ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS itinerary_id VARCHAR(64)")
                cursor.execute("ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS total_days SMALLINT DEFAULT 1")
                cursor.execute("ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT'")
                cursor.execute("UPDATE itineraries SET itinerary_id = trip_id WHERE itinerary_id IS NULL AND trip_id IS NOT NULL")
                cursor.execute("UPDATE itineraries SET total_days = days_count WHERE (total_days IS NULL OR total_days = 1) AND days_count IS NOT NULL")
                cursor.execute("ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS itinerary_id VARCHAR(64)")
                cursor.execute("ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS itinerary_day_id VARCHAR(64)")
                cursor.execute("ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS theme VARCHAR(255)")
                cursor.execute("ALTER TABLE itinerary_days ADD COLUMN IF NOT EXISTS focus_city VARCHAR(100)")
                cursor.execute("UPDATE itinerary_days SET itinerary_id = trip_id WHERE itinerary_id IS NULL AND trip_id IS NOT NULL")
                cursor.execute("UPDATE itinerary_days SET itinerary_day_id = day_id WHERE itinerary_day_id IS NULL AND day_id IS NOT NULL")
                cursor.execute("ALTER TABLE itinerary_stops ADD COLUMN IF NOT EXISTS itinerary_stop_id VARCHAR(64)")
                cursor.execute("ALTER TABLE itinerary_stops ADD COLUMN IF NOT EXISTS itinerary_day_id VARCHAR(64)")
                cursor.execute("ALTER TABLE itinerary_stops ADD COLUMN IF NOT EXISTS sequence_no SMALLINT")
                cursor.execute("ALTER TABLE itinerary_stops ADD COLUMN IF NOT EXISTS time_slot VARCHAR(50)")
                cursor.execute("ALTER TABLE itinerary_stops ADD COLUMN IF NOT EXISTS notes TEXT")
                cursor.execute("UPDATE itinerary_stops SET itinerary_stop_id = stop_id WHERE itinerary_stop_id IS NULL AND stop_id IS NOT NULL")
                cursor.execute("UPDATE itinerary_stops SET itinerary_day_id = day_id WHERE itinerary_day_id IS NULL AND day_id IS NOT NULL")
                cursor.execute("UPDATE itinerary_stops SET sequence_no = sequence WHERE sequence_no IS NULL AND sequence IS NOT NULL")
            except Exception:
                pass

            conn.commit()
    except Exception as exc:
        logger.warning("Could not execute ensure_itinerary_tables (database may already have them): %s", exc)


def _is_postgres_conn(conn) -> bool:
    name = conn.__class__.__name__.lower()
    module = conn.__class__.__module__.lower()
    if "sqlite" in name or "sqlite" in module:
        return False
    return True


def _insert_itinerary(cursor, conn, itinerary_id: str, title: str, destination: str, total_days: int, status: str = "PUBLISHED") -> None:
    if _is_postgres_conn(conn):
        cursor.execute(
            """
            INSERT INTO itineraries (itinerary_id, trip_id, user_id, title, destination, total_days, days_count, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (itinerary_id, itinerary_id, "demo-user", title, destination, total_days, total_days, status),
        )
    else:
        cursor.execute(
            """
            INSERT INTO itineraries (itinerary_id, user_id, title, destination, total_days, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (itinerary_id, "demo-user", title, destination, total_days, status),
        )


def _insert_itinerary_day(cursor, conn, itinerary_day_id: str, itinerary_id: str, day_number: int, theme: str = "", focus_city: str = "") -> None:
    if _is_postgres_conn(conn):
        cursor.execute(
            """
            INSERT INTO itinerary_days (itinerary_day_id, day_id, itinerary_id, trip_id, day_number, theme, focus_city)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (itinerary_day_id, itinerary_day_id, itinerary_id, itinerary_id, day_number, theme, focus_city),
        )
    else:
        cursor.execute(
            """
            INSERT INTO itinerary_days (itinerary_day_id, itinerary_id, day_number, theme, focus_city)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (itinerary_day_id, itinerary_id, day_number, theme, focus_city),
        )


def _insert_itinerary_stop(cursor, conn, itinerary_stop_id: str, itinerary_day_id: str, poi_id: str, sequence_no: int, time_slot: str = "", notes: str = "") -> None:
    stop_title = notes or poi_id
    if _is_postgres_conn(conn):
        cursor.execute(
            """
            INSERT INTO itinerary_stops (itinerary_stop_id, stop_id, itinerary_day_id, day_id, poi_id, title, sequence_no, sequence, time_slot, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (itinerary_stop_id, itinerary_stop_id, itinerary_day_id, itinerary_day_id, poi_id, stop_title, sequence_no, sequence_no, time_slot, notes),
        )
    else:
        cursor.execute(
            """
            INSERT INTO itinerary_stops (itinerary_stop_id, itinerary_day_id, poi_id, sequence_no, time_slot, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (itinerary_stop_id, itinerary_day_id, poi_id, sequence_no, time_slot, notes),
        )


def _check_itinerary_exists(cursor, conn, itin_id: str) -> bool:
    if _is_postgres_conn(conn):
        cursor.execute("SELECT itinerary_id FROM itineraries WHERE itinerary_id = %s OR trip_id = %s", (itin_id, itin_id))
    else:
        cursor.execute("SELECT itinerary_id FROM itineraries WHERE itinerary_id = %s", (itin_id,))
    return cursor.fetchone() is not None


# Seed initial demo / sample itineraries if not present
def seed_sample_itineraries():
    ensure_itinerary_tables()
    sample_id = "sample-danang-hue-3d"

    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if not _check_itinerary_exists(cursor, conn, sample_id):
                # Insert sample itinerary (3 days)
                _insert_itinerary(cursor, conn, sample_id, "Hành trình Xanh Đà Nẵng - Huế 3 Ngày", "Đà Nẵng & Huế", 3, "PUBLISHED")

                # Day 1: Da Nang (3 stops)
                day1_id = f"{sample_id}-day-1"
                _insert_itinerary_day(cursor, conn, day1_id, sample_id, 1, "Biểu tượng & Ẩm thực sông Hàn", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{day1_id}-s1", day1_id, "poi_cau_rong", 1, "08:30", "Ngắm Cầu Rồng")
                _insert_itinerary_stop(cursor, conn, f"{day1_id}-s2", day1_id, "poi_cho_han", 2, "11:00", "Khám phá ẩm thực Chợ Hàn")
                _insert_itinerary_stop(cursor, conn, f"{day1_id}-s3", day1_id, "poi_linh_ung", 3, "14:30", "Bán đảo Sơn Trà & Chùa Linh Ứng")

                # Day 2: Hue (2 stops)
                day2_id = f"{sample_id}-day-2"
                _insert_itinerary_day(cursor, conn, day2_id, sample_id, 2, "Di sản ngàn năm Cố đô Huế", "Huế")
                _insert_itinerary_stop(cursor, conn, f"{day2_id}-s1", day2_id, "poi_dai_noi", 1, "08:00", "Đại Nội Huế")
                _insert_itinerary_stop(cursor, conn, f"{day2_id}-s2", day2_id, "poi_thien_mu", 2, "11:00", "Chùa Thiên Mụ")

                # Day 3: Single stop (1 stop test case)
                day3_id = f"{sample_id}-day-3"
                _insert_itinerary_day(cursor, conn, day3_id, sample_id, 3, "Nghỉ dưỡng biển Mỹ Khê", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{day3_id}-s1", day3_id, "poi_my_khe", 1, "09:00", "Tắm biển Mỹ Khê")

            # Itinerary with empty day (0 stops test case)
            empty_id = "sample-empty-day-itin"
            if not _check_itinerary_exists(cursor, conn, empty_id):
                _insert_itinerary(cursor, conn, empty_id, "Hành trình thử nghiệm ngày trống", "Đà Nẵng", 1, "DRAFT")
                _insert_itinerary_day(cursor, conn, f"{empty_id}-day-1", empty_id, 1, "Ngày tự do", "Đà Nẵng")

            # ─── Multi-day Itinerary: 1 Day ───
            itin_1d = "sample-danang-1d"
            if not _check_itinerary_exists(cursor, conn, itin_1d):
                _insert_itinerary(cursor, conn, itin_1d, "Khám phá Đà Nẵng 1 Ngày", "Đà Nẵng", 1, "PUBLISHED")
                _insert_itinerary_day(cursor, conn, f"{itin_1d}-day-1", itin_1d, 1, "Dạo quanh thành phố", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{itin_1d}-d1-s1", f"{itin_1d}-day-1", "poi_cau_rong", 1, "09:00", "Cầu Rồng")
                _insert_itinerary_stop(cursor, conn, f"{itin_1d}-d1-s2", f"{itin_1d}-day-1", "poi_my_khe", 2, "15:00", "Biển Mỹ Khê")

            # ─── Multi-day Itinerary: 2 Days ───
            itin_2d = "sample-danang-2d"
            if not _check_itinerary_exists(cursor, conn, itin_2d):
                _insert_itinerary(cursor, conn, itin_2d, "Hành trình Đà Nẵng 2 Ngày", "Đà Nẵng", 2, "PUBLISHED")
                _insert_itinerary_day(cursor, conn, f"{itin_2d}-day-1", itin_2d, 1, "Sông Hàn & Phố xá", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{itin_2d}-d1-s1", f"{itin_2d}-day-1", "poi_cau_rong", 1, "08:30", "Cầu Rồng")
                _insert_itinerary_stop(cursor, conn, f"{itin_2d}-d1-s2", f"{itin_2d}-day-1", "poi_cho_han", 2, "11:00", "Chợ Hàn")
                _insert_itinerary_day(cursor, conn, f"{itin_2d}-day-2", itin_2d, 2, "Biển xanh non nước", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{itin_2d}-d2-s1", f"{itin_2d}-day-2", "poi_ngu_hanh_son", 1, "08:30", "Ngũ Hành Sơn")
                _insert_itinerary_stop(cursor, conn, f"{itin_2d}-d2-s2", f"{itin_2d}-day-2", "poi_my_khe", 2, "15:00", "Mỹ Khê")

            # ─── Multi-day Itinerary: 5 Days ───
            itin_5d = "sample-danang-hue-5d"
            if not _check_itinerary_exists(cursor, conn, itin_5d):
                _insert_itinerary(cursor, conn, itin_5d, "Đà Nẵng - Huế Trọn Vẹn 5 Ngày", "Đà Nẵng & Huế", 5, "PUBLISHED")
                # Day 1: 3 stops
                _insert_itinerary_day(cursor, conn, f"{itin_5d}-d1", itin_5d, 1, "Khám phá Sơn Trà", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d1-s1", f"{itin_5d}-d1", "poi_cau_rong", 1, "08:30", "Cầu Rồng")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d1-s2", f"{itin_5d}-d1", "poi_cho_han", 2, "11:00", "Chợ Hàn")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d1-s3", f"{itin_5d}-d1", "poi_linh_ung", 3, "15:00", "Chùa Linh Ứng")
                # Day 2: 2 stops
                _insert_itinerary_day(cursor, conn, f"{itin_5d}-d2", itin_5d, 2, "Danh thắng non nước", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d2-s1", f"{itin_5d}-d2", "poi_ngu_hanh_son", 1, "09:00", "Ngũ Hành Sơn")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d2-s2", f"{itin_5d}-d2", "poi_my_khe", 2, "15:30", "Biển Mỹ Khê")
                # Day 3: 1 stop
                _insert_itinerary_day(cursor, conn, f"{itin_5d}-d3", itin_5d, 3, "Đỉnh Bà Nà sương mù", "Đà Nẵng")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d3-s1", f"{itin_5d}-d3", "poi_ba_na", 1, "08:00", "Bà Nà Hills")
                # Day 4: 3 stops
                _insert_itinerary_day(cursor, conn, f"{itin_5d}-d4", itin_5d, 4, "Cố đô trầm mặc", "Huế")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d4-s1", f"{itin_5d}-d4", "poi_dai_noi", 1, "08:00", "Đại Nội Huế")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d4-s2", f"{itin_5d}-d4", "poi_thien_mu", 2, "11:00", "Chùa Thiên Mụ")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d4-s3", f"{itin_5d}-d4", "poi_dong_ba", 3, "15:00", "Chợ Đông Ba")
                # Day 5: 2 stops
                _insert_itinerary_day(cursor, conn, f"{itin_5d}-d5", itin_5d, 5, "Lăng tẩm hoàng gia", "Huế")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d5-s1", f"{itin_5d}-d5", "poi_khai_dinh", 1, "09:00", "Lăng Khải Định")
                _insert_itinerary_stop(cursor, conn, f"{itin_5d}-d5-s2", f"{itin_5d}-d5", "poi_tu_duc", 2, "14:00", "Lăng Tự Đức")

            # ─── Multi-day Itinerary: 7 Days (N-day test case) ───
            itin_7d = "sample-central-vietnam-7d"
            if not _check_itinerary_exists(cursor, conn, itin_7d):
                _insert_itinerary(cursor, conn, itin_7d, "Miền Trung Huyền Diệu 7 Ngày", "Đà Nẵng & Huế", 7, "PUBLISHED")
                for d_num in range(1, 8):
                    _insert_itinerary_day(cursor, conn, f"{itin_7d}-d{d_num}", itin_7d, d_num, f"Hành trình Ngày {d_num}", "Đà Nẵng" if d_num <= 3 else "Huế")
                    _insert_itinerary_stop(cursor, conn, f"{itin_7d}-d{d_num}-s1", f"{itin_7d}-d{d_num}", "poi_cau_rong" if d_num % 2 == 1 else "poi_dai_noi", 1, "09:00", f"Điểm 1 Ngày {d_num}")
                    _insert_itinerary_stop(cursor, conn, f"{itin_7d}-d{d_num}-s2", f"{itin_7d}-d{d_num}", "poi_my_khe" if d_num % 2 == 1 else "poi_thien_mu", 2, "14:00", f"Điểm 2 Ngày {d_num}")
            if not cursor.fetchone():
                _insert_itinerary(cursor, conn, itin_7d, "Miền Trung Huyền Diệu 7 Ngày", "Đà Nẵng & Huế", 7, "PUBLISHED")
                for d_num in range(1, 8):
                    _insert_itinerary_day(cursor, conn, f"{itin_7d}-d{d_num}", itin_7d, d_num, f"Hành trình Ngày {d_num}", "Đà Nẵng" if d_num <= 3 else "Huế")
                    _insert_itinerary_stop(cursor, conn, f"{itin_7d}-d{d_num}-s1", f"{itin_7d}-d{d_num}", "poi_cau_rong" if d_num % 2 == 1 else "poi_dai_noi", 1, "09:00", f"Điểm 1 Ngày {d_num}")
                    _insert_itinerary_stop(cursor, conn, f"{itin_7d}-d{d_num}-s2", f"{itin_7d}-d{d_num}", "poi_my_khe" if d_num % 2 == 1 else "poi_thien_mu", 2, "14:00", f"Điểm 2 Ngày {d_num}")

            conn.commit()
    except Exception as exc:
        logger.warning("Could not seed sample itineraries: %s", exc)


# Well-known fallback coordinates for standard named landmarks
LANDMARK_COORDINATES: dict[str, dict[str, Any]] = {
    "poi_cau_rong": {"name": "Cầu Rồng Đà Nẵng", "latitude": 16.0611, "longitude": 108.2270},
    "poi_cho_han": {"name": "Chợ Hàn Đà Nẵng", "latitude": 16.0678, "longitude": 108.2208},
    "poi_linh_ung": {"name": "Chùa Linh Ứng Bãi Bụt", "latitude": 16.1005, "longitude": 108.2778},
    "poi_dai_noi": {"name": "Đại Nội Huế (Hoàng Thành)", "latitude": 16.4699, "longitude": 107.5779},
    "poi_thien_mu": {"name": "Chùa Thiên Mụ Huế", "latitude": 16.4533, "longitude": 107.5451},
    "poi_khai_dinh": {"name": "Lăng Khải Định (Ứng Lăng)", "latitude": 16.3989, "longitude": 107.5904},
    "poi_my_khe": {"name": "Bãi biển Mỹ Khê", "latitude": 16.0592, "longitude": 108.2435},
    "poi_ngu_hanh_son": {"name": "Danh thắng Ngũ Hành Sơn", "latitude": 16.0044, "longitude": 108.2635},
    "poi_ba_na": {"name": "Khu du lịch Bà Nà Hills", "latitude": 15.9988, "longitude": 107.9960},
    "poi_dong_ba": {"name": "Chợ Đông Ba Huế", "latitude": 16.4719, "longitude": 107.5878},
    "poi_tu_duc": {"name": "Lăng Tự Đức (Khiêm Lăng)", "latitude": 16.4331, "longitude": 107.5658},
}


def get_poi_by_id(poi_id: str) -> dict[str, Any] | None:
    """Retrieve POI name, latitude, and longitude by POI ID or name."""
    clean_id = str(poi_id).strip()

    # 1. Check landmark coordinates cache
    if clean_id in LANDMARK_COORDINATES:
        return {
            "poi_id": clean_id,
            "name": LANDMARK_COORDINATES[clean_id]["name"],
            "latitude": LANDMARK_COORDINATES[clean_id]["latitude"],
            "longitude": LANDMARK_COORDINATES[clean_id]["longitude"],
        }

    # 2. Try querying the database pois table
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Try by id or osm_id
            cursor.execute(
                """
                SELECT name, latitude, longitude
                FROM pois
                WHERE id = %s OR poi_id = %s OR osm_id = %s
                LIMIT 1
                """,
                (clean_id, clean_id, clean_id),
            )
            row = cursor.fetchone()
            if row and row[0]:
                lat = float(row[1]) if row[1] is not None else None
                lng = float(row[2]) if row[2] is not None else None
                return {
                    "poi_id": clean_id,
                    "name": row[0],
                    "latitude": lat,
                    "longitude": lng,
                }
    except Exception:
        # Table might not exist or columns might vary, fallback to CSV
        pass

    # 3. Fallback to CSV cache
    csv_lookup = _load_csv_poi_lookup()
    if clean_id in csv_lookup:
        return csv_lookup[clean_id]
    if clean_id.lower() in csv_lookup:
        return csv_lookup[clean_id.lower()]

    return None


def get_itinerary(itinerary_id: str) -> dict[str, Any] | None:
    """Retrieve itinerary record by itinerary_id."""
    ensure_itinerary_tables()
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if _is_postgres_conn(conn):
                cursor.execute(
                    """
                    SELECT COALESCE(itinerary_id, trip_id), title, destination, COALESCE(total_days, days_count, 1), status
                    FROM itineraries
                    WHERE itinerary_id = %s OR trip_id = %s
                    LIMIT 1
                    """,
                    (str(itinerary_id), str(itinerary_id)),
                )
            else:
                cursor.execute(
                    """
                    SELECT itinerary_id, title, destination, total_days, status
                    FROM itineraries
                    WHERE itinerary_id = ?
                    LIMIT 1
                    """,
                    (str(itinerary_id),),
                )
            row = cursor.fetchone()
            if row:
                return {
                    "itinerary_id": str(row[0]),
                    "title": row[1],
                    "destination": row[2],
                    "total_days": int(row[3] or 1),
                    "status": row[4],
                }
    except Exception as exc:
        logger.error("Error fetching itinerary %s: %s", itinerary_id, exc)

    # Nếu là chuyến đi người dùng tạo động (trip_...) hoặc chưa có trong CSDL, tự động khởi tạo lịch trình mẫu
    if str(itinerary_id).startswith("trip_") or str(itinerary_id).startswith("trip-"):
        return ensure_user_trip_itinerary(str(itinerary_id), max_days=4)

    return None


def get_itinerary_day(itinerary_id: str, day_number: int) -> dict[str, Any] | None:
    """Retrieve day record for an itinerary."""
    ensure_itinerary_tables()
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if _is_postgres_conn(conn):
                cursor.execute(
                    """
                    SELECT COALESCE(itinerary_day_id, day_id), COALESCE(itinerary_id, trip_id), day_number, theme, focus_city
                    FROM itinerary_days
                    WHERE (itinerary_id = %s OR trip_id = %s) AND day_number = %s
                    LIMIT 1
                    """,
                    (str(itinerary_id), str(itinerary_id), int(day_number)),
                )
            else:
                cursor.execute(
                    """
                    SELECT itinerary_day_id, itinerary_id, day_number, theme, focus_city
                    FROM itinerary_days
                    WHERE itinerary_id = ? AND day_number = ?
                    LIMIT 1
                    """,
                    (str(itinerary_id), int(day_number)),
                )
            row = cursor.fetchone()
            if row:
                return {
                    "itinerary_day_id": str(row[0]),
                    "itinerary_id": str(row[1]),
                    "day_number": int(row[2]),
                    "theme": row[3],
                    "focus_city": row[4],
                }
    except Exception as exc:
        logger.error("Error fetching day %s for itinerary %s: %s", day_number, itinerary_id, exc)

    # Nếu là trip_... tự động khởi tạo nếu chưa có
    if str(itinerary_id).startswith("trip_") or str(itinerary_id).startswith("trip-"):
        ensure_user_trip_itinerary(str(itinerary_id), max_days=max(day_number, 4))
        return get_itinerary_day(itinerary_id, day_number)

    return None


def get_itinerary_day_stops(itinerary_day_id: str) -> list[dict[str, Any]]:
    """Retrieve stops assigned to an itinerary day, ordered by sequence_no."""
    ensure_itinerary_tables()
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            if _is_postgres_conn(conn):
                cursor.execute(
                    """
                    SELECT COALESCE(itinerary_stop_id, stop_id), poi_id, COALESCE(sequence_no, sequence, 1), time_slot
                    FROM itinerary_stops
                    WHERE itinerary_day_id = %s OR day_id = %s
                    ORDER BY COALESCE(sequence_no, sequence, 1) ASC
                    """,
                    (str(itinerary_day_id), str(itinerary_day_id)),
                )
            else:
                cursor.execute(
                    """
                    SELECT itinerary_stop_id, poi_id, sequence_no, time_slot
                    FROM itinerary_stops
                    WHERE itinerary_day_id = ?
                    ORDER BY sequence_no ASC
                    """,
                    (str(itinerary_day_id),),
                )
            rows = cursor.fetchall()
            return [
                {
                    "itinerary_stop_id": str(r[0]),
                    "poi_id": str(r[1]),
                    "sequence_no": int(r[2]),
                    "time_slot": r[3],
                }
                for r in rows
            ]
    except Exception as exc:
        logger.error("Error fetching stops for day %s: %s", itinerary_day_id, exc)
        return []


def ensure_user_trip_itinerary(trip_id: str, max_days: int = 4) -> dict[str, Any]:
    """Tự động khởi tạo dữ liệu lộ trình các ngày cho chuyến đi do người dùng tạo."""
    ensure_itinerary_tables()
    safe_days = max(1, min(max_days, 10))

    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Kiểm tra xem đã có chưa
            if _is_postgres_conn(conn):
                cursor.execute("SELECT itinerary_id, title, destination, total_days, status FROM itineraries WHERE itinerary_id = %s OR trip_id = %s", (trip_id, trip_id))
            else:
                cursor.execute("SELECT itinerary_id, title, destination, total_days, status FROM itineraries WHERE itinerary_id = ?", (trip_id,))
            row = cursor.fetchone()
            if row:
                return {
                    "itinerary_id": str(row[0]),
                    "title": row[1] or "Chuyến đi Đà Nẵng & Huế",
                    "destination": row[2] or "Đà Nẵng & Huế",
                    "total_days": int(row[3] or safe_days),
                    "status": row[4] or "DRAFT",
                }

            # Tạo mới
            _insert_itinerary(cursor, conn, trip_id, "Chuyến đi Đà Nẵng & Huế", "Đà Nẵng & Huế", safe_days, "DRAFT")

            # Khởi tạo stops theo ngày
            day_templates = [
                # Day 1: Biểu tượng Đà Nẵng
                {"theme": "Biểu tượng & Ẩm thực sông Hàn", "city": "Đà Nẵng", "stops": [("poi_cau_rong", "08:30", "Ngắm Cầu Rồng"), ("poi_cho_han", "11:00", "Ẩm thực Chợ Hàn"), ("poi_linh_ung", "14:30", "Chùa Linh Ứng Bãi Bụt")]},
                # Day 2: Danh thắng & Biển
                {"theme": "Danh thắng non nước & Biển xanh", "city": "Đà Nẵng", "stops": [("poi_ngu_hanh_son", "09:00", "Ngũ Hành Sơn"), ("poi_my_khe", "15:00", "Biển Mỹ Khê")]},
                # Day 3: Đỉnh Bà Nà
                {"theme": "Đỉnh Bà Nà sương mù", "city": "Đà Nẵng", "stops": [("poi_ba_na", "08:30", "Bà Nà Hills & Cầu Vàng")]},
                # Day 4: Cố đô Huế
                {"theme": "Cố đô trầm mặc", "city": "Huế", "stops": [("poi_dai_noi", "08:30", "Đại Nội Huế"), ("poi_thien_mu", "11:30", "Chùa Thiên Mụ"), ("poi_dong_ba", "15:00", "Chợ Đông Ba")]},
                # Day 5: Lăng tẩm hoàng gia
                {"theme": "Lăng tẩm hoàng gia", "city": "Huế", "stops": [("poi_khai_dinh", "09:00", "Lăng Khải Định"), ("poi_tu_duc", "14:00", "Lăng Tự Đức")]},
            ]

            for d_num in range(1, safe_days + 1):
                t_idx = (d_num - 1) % len(day_templates)
                template = day_templates[t_idx]
                day_id = f"{trip_id}-d{d_num}"
                _insert_itinerary_day(cursor, conn, day_id, trip_id, d_num, f"{template['theme']} (Ngày {d_num})", template["city"])
                for s_idx, (p_id, t_slot, note) in enumerate(template["stops"], start=1):
                    _insert_itinerary_stop(cursor, conn, f"{day_id}-s{s_idx}", day_id, p_id, s_idx, t_slot, note)

            conn.commit()
            return {
                "itinerary_id": trip_id,
                "title": "Chuyến đi Đà Nẵng & Huế",
                "destination": "Đà Nẵng & Huế",
                "total_days": safe_days,
                "status": "DRAFT",
            }
    except Exception as exc:
        logger.error("Error creating user trip itinerary %s: %s", trip_id, exc)
        return {
            "itinerary_id": trip_id,
            "title": "Chuyến đi Đà Nẵng & Huế",
            "destination": "Đà Nẵng & Huế",
            "total_days": safe_days,
            "status": "DRAFT",
        }

import logging
import os
import re
import sqlite3
from pathlib import Path
from typing import Any

from psycopg import Connection, connect
from psycopg.errors import UniqueViolation

from app.config import get_settings

logger = logging.getLogger(__name__)

# Đường dẫn tệp SQLite cục bộ khi không có PostgreSQL / Docker
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_SQLITE_DB_PATH = _PROJECT_ROOT / "data" / "greentrip_local.db"


def _sqlite_custom_like(pattern: Any, string: Any) -> bool:
    if string is None or pattern is None:
        return False
    parts = []
    for segment in str(pattern).split("%"):
        subparts = [re.escape(s) for s in segment.split("_")]
        parts.append(".".join(subparts))
    regex_str = ".*".join(parts)
    try:
        return bool(re.search(f"^{regex_str}$", str(string), re.IGNORECASE | re.DOTALL))
    except Exception:
        return False


class SQLiteCursorWrapper:
    """Adapter bọc cursor của SQLite để tương thích hoàn toàn với các truy vấn psycopg."""

    def __init__(self, cursor: sqlite3.Cursor):
        self._cursor = cursor

    def execute(self, query: str, params: Any = None) -> "SQLiteCursorWrapper":
        # 1. Bỏ tiền tố schema public.
        clean_query = re.sub(r"\bpublic\.", "", query, flags=re.IGNORECASE)
        # 1b. Bỏ typecast postgres như ::text, ::jsonb, ::geometry
        clean_query = re.sub(r"::\w+", "", clean_query)
        # 1c. Chuyển đổi ILIKE của PostgreSQL sang LIKE của SQLite
        clean_query = re.sub(r"\bILIKE\b", "LIKE", clean_query, flags=re.IGNORECASE)
        # 1d. Chuyển đổi (SELECT ... LIMIT N) UNION ALL sang SELECT * FROM (SELECT ... LIMIT N) cho SQLite
        clean_query = re.sub(r"\(\s*(SELECT[\s\S]*?LIMIT\s+\d+)\s*\)", r"SELECT * FROM (\1)", clean_query, flags=re.IGNORECASE)
        # 1e. Chuyển đổi jsonb extraction ->> sang json_extract cho SQLite
        clean_query = re.sub(r"(\w+)\.ai_metadata->>'(\w+)'", r"json_extract(\1.ai_metadata, '$.\2')", clean_query)
        # 1f. Chuẩn hóa giá trị boolean nếu có
        clean_query = clean_query.replace("TRUE", "1").replace("FALSE", "0")
        # 1g. SQLite không hỗ trợ IF NOT EXISTS trong ALTER TABLE ADD COLUMN
        clean_query = re.sub(r"\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b", "ADD COLUMN", clean_query, flags=re.IGNORECASE)

        # 2. Xử lý tham số %s và = ANY(%s)
        if params is not None:
            param_list = list(params) if isinstance(params, (list, tuple)) else [params]
            if "%s" in clean_query or "= ANY(" in clean_query or "= any(" in clean_query:
                new_params = []
                param_idx = 0
                # Lưu ý: Không dùng re.IGNORECASE cho placeholder %s để tránh match nhầm %S (ví dụ trong %%Sông Hàn%%)
                pattern = re.compile(r"(\=\s*ANY\s*\(\s*%s\s*\)|\=\s*any\s*\(\s*%s\s*\)|(?<!%)%s(?![a-zA-Z0-9_]))")

                def replacer(match: re.Match) -> str:
                    nonlocal param_idx
                    token = match.group(0)
                    val = param_list[param_idx] if param_idx < len(param_list) else None
                    param_idx += 1
                    if "ANY" in token.upper():
                        if isinstance(val, (list, tuple)) and len(val) > 0:
                            placeholders = ", ".join(["?"] * len(val))
                            new_params.extend(val)
                            return f"IN ({placeholders})"
                        else:
                            return "IN (NULL)"
                    else:
                        new_params.append(val)
                        return "?"

                clean_query = pattern.sub(replacer, clean_query)
                params_to_pass = tuple(new_params)
            else:
                # Nếu query đã dùng sẵn cú pháp ? của sqlite hoặc không chứa %s
                params_to_pass = tuple(param_list)
        else:
            clean_query = clean_query.replace("%s", "?")
            params_to_pass = None

        # 3. Chuyển đổi %% của psycopg sang % cho sqlite (thực hiện sau khi đã bind placeholder %s)
        clean_query = clean_query.replace("%%", "%")

        try:
            if params_to_pass is not None:
                self._cursor.execute(clean_query, params_to_pass)
            else:
                self._cursor.execute(clean_query)
        except sqlite3.IntegrityError as err:
            err_str = str(err).upper()
            if "UNIQUE" in err_str:
                raise UniqueViolation(str(err)) from err
            raise
        except sqlite3.OperationalError as err:
            err_str = str(err).lower()
            if "duplicate column name" in err_str:
                return self
            raise
        except Exception:
            raise
        return self

    def fetchone(self) -> Any:
        return self._cursor.fetchone()

    def fetchall(self) -> list[Any]:
        return self._cursor.fetchall()

    def fetchmany(self, size: int = 1) -> list[Any]:
        return self._cursor.fetchmany(size)

    def close(self):
        self._cursor.close()

    def __iter__(self):
        return iter(self._cursor)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._cursor.close()


class SQLiteConnectionWrapper:
    """Adapter bọc Connection của SQLite để hoạt động như psycopg Connection."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def cursor(self) -> SQLiteCursorWrapper:
        return SQLiteCursorWrapper(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self._conn.rollback()
        self._conn.close()


def _ensure_sqlite_tables(conn: sqlite3.Connection):
    """Tự động khởi tạo bảng users, email_otps, cities, poi_categories, pois nếu chưa có trong CSDL cục bộ."""
    conn.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT,
        role TEXT DEFAULT 'USER',
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS email_otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp_code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS cities (
        city_id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    );
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS poi_categories (
        category_id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    );
    """)
    conn.execute("""
    CREATE TABLE IF NOT EXISTS pois (
        poi_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category_id TEXT,
        city_id TEXT,
        sub_category TEXT,
        image_url TEXT,
        gallery_urls TEXT,
        green_score REAL DEFAULT 85,
        satisfaction_score REAL DEFAULT 4.8,
        popularity_score REAL DEFAULT 90,
        address TEXT,
        description TEXT,
        estimated_cost REAL,
        ai_metadata TEXT,
        is_active INTEGER DEFAULT 1,
        cuisine TEXT,
        indoor_outdoor TEXT,
        latitude REAL,
        longitude REAL
    );
    """)

    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM cities")
    if cur.fetchone()[0] == 0:
        cur.executemany("INSERT INTO cities (city_id, name) VALUES (?, ?)", [
            ("887a5372-9e6f-48a7-bf50-1e6ef9f2ebce", "Da Nang"),
            ("8b55ab4c-ba9b-4d33-b1ce-d15fb33f7f22", "Hue"),
        ])

    cur.execute("SELECT count(*) FROM poi_categories")
    if cur.fetchone()[0] == 0:
        cur.executemany("INSERT INTO poi_categories (category_id, name) VALUES (?, ?)", [
            ("addc2e2e-69b6-4811-984d-8f88b50cd333", "Ẩm thực và quán ăn"),
            ("dcc56ade-20c6-4128-a598-3d15ffe157d7", "Quán cafe giải khát"),
            ("54da4319-c68b-4e42-a488-8ccdfba2b71c", "Di tích lịch sử và văn hóa"),
            ("5615f7b6-ec5a-4cc5-9171-af200a866b96", "Cảnh quan và thiên nhiên"),
            ("6131c4fb-b007-4669-98f2-9b00e32e44d9", "Tâm linh & Tôn giáo"),
        ])

    cur.execute("SELECT count(*) FROM pois")
    if cur.fetchone()[0] == 0:
        csv_path = _PROJECT_ROOT / "data" / "processed" / "all_pois_cleaned.csv"
        if csv_path.exists():
            import csv
            import json
            try:
                with open(csv_path, mode="r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        pid = r.get("\ufeffpoi_id") or r.get("poi_id")
                        if not pid:
                            continue
                        name = r.get("name", "")
                        city_raw = r.get("city", "").lower()
                        city_id = "8b55ab4c-ba9b-4d33-b1ce-d15fb33f7f22" if ("hue" in city_raw or "huế" in city_raw) else "887a5372-9e6f-48a7-bf50-1e6ef9f2ebce"

                        cat_raw = r.get("category", "").lower()
                        if "cà phê" in cat_raw or "cafe" in cat_raw:
                            cat_id = "dcc56ade-20c6-4128-a598-3d15ffe157d7"
                        elif "di tích" in cat_raw or "văn hóa" in cat_raw or "lịch sử" in cat_raw:
                            cat_id = "54da4319-c68b-4e42-a488-8ccdfba2b71c"
                        elif "tâm linh" in cat_raw or "chùa" in cat_raw:
                            cat_id = "6131c4fb-b007-4669-98f2-9b00e32e44d9"
                        elif "cảnh quan" in cat_raw or "thiên nhiên" in cat_raw or "sinh thái" in cat_raw:
                            cat_id = "5615f7b6-ec5a-4cc5-9171-af200a866b96"
                        else:
                            cat_id = "addc2e2e-69b6-4811-984d-8f88b50cd333"

                        sub_cat = r.get("sub_category", "")
                        try:
                            gs = float(r.get("green_score", 0.85))
                            if gs <= 1.0:
                                gs = gs * 100
                        except (ValueError, TypeError):
                            gs = 85.0

                        try:
                            sat = float(r.get("satisfaction_score", 4.8))
                        except (ValueError, TypeError):
                            sat = 4.8

                        try:
                            cost = float(r.get("estimated_cost", 0))
                        except (ValueError, TypeError):
                            cost = 50000.0

                        cuisine = None
                        if "chay" in name.lower() or "vegan" in name.lower() or sub_cat == "vegetarian":
                            cuisine = "plant_based_vegan"

                        indoor = "indoor" if sub_cat in [
                            "museum", "museums_galleries", "indoor_attraction", "coffee", "vegetarian", "specialty_restaurant"
                        ] else "outdoor"

                        ai_meta = json.dumps({
                            "price_range_display": r.get("price_range_display", "35.000 – 120.000 ₫/người"),
                            "rainy_day_friendly": "true" if indoor == "indoor" else "false",
                        })

                        cur.execute("""
                            INSERT OR REPLACE INTO pois (
                                poi_id, name, category_id, city_id, sub_category,
                                image_url, green_score, satisfaction_score, popularity_score,
                                address, description, estimated_cost, ai_metadata,
                                is_active, cuisine, indoor_outdoor, latitude, longitude
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            pid, name, cat_id, city_id, sub_cat,
                            r.get("image_url", ""), gs, sat, 95.0,
                            r.get("address", ""), r.get("description", ""), cost, ai_meta,
                            1, cuisine, indoor, float(r.get("latitude") or 0), float(r.get("longitude") or 0)
                        ))
            except Exception as e:
                logger.warning("Không thể nạp POIs vào CSDL SQLite: %s", e)

    conn.commit()


_POSTGRES_AVAILABLE: bool = True


def get_connection() -> Any:
    """
    Kết nối đến CSDL PostgreSQL nếu được cấu hình DATABASE_URL và khả dụng.
    Nếu không có PostgreSQL (hoặc người dùng không bật Docker),
    hệ thống tự động sử dụng CSDL SQLite cục bộ giúp tính năng Đăng nhập/Đăng ký hoạt động mượt mà.
    """
    global _POSTGRES_AVAILABLE
    settings = get_settings()

    if settings.DATABASE_URL and _POSTGRES_AVAILABLE:
        try:
            return connect(
                settings.DATABASE_URL,
                connect_timeout=3,
            )
        except Exception as e:
            _POSTGRES_AVAILABLE = False
            logger.warning(
                "Không thể kết nối đến PostgreSQL từ DATABASE_URL (%s). Tự động chuyển sang CSDL SQLite cục bộ.",
                e,
            )

    # Chế độ CSDL cục bộ (Không phụ thuộc Docker/Postgres ngoài)
    _SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    sqlite_conn = sqlite3.connect(
        str(_SQLITE_DB_PATH),
        check_same_thread=False,
    )
    sqlite_conn.create_function("like", 2, _sqlite_custom_like)
    _ensure_sqlite_tables(sqlite_conn)
    return SQLiteConnectionWrapper(sqlite_conn)

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


class SQLiteCursorWrapper:
    """Adapter bọc cursor của SQLite để tương thích hoàn toàn với các truy vấn psycopg."""

    def __init__(self, cursor: sqlite3.Cursor):
        self._cursor = cursor

    def execute(self, query: str, params: Any = None) -> "SQLiteCursorWrapper":
        # 1. Bỏ tiền tố schema public.
        clean_query = re.sub(r"\bpublic\.", "", query, flags=re.IGNORECASE)
        # 1b. Bỏ typecast postgres như ::text, ::jsonb, ::geometry
        clean_query = re.sub(r"::\w+", "", clean_query)
        # 2. Chuyển đổi tham số %s của postgres sang ? của sqlite
        clean_query = clean_query.replace("%s", "?")
        # 3. Chuẩn hóa giá trị boolean nếu có
        clean_query = clean_query.replace("TRUE", "1").replace("FALSE", "0")

        try:
            if params is not None:
                if isinstance(params, (list, tuple)):
                    # Flatten params if necessary
                    self._cursor.execute(clean_query, tuple(params))
                else:
                    self._cursor.execute(clean_query, (params,))
            else:
                self._cursor.execute(clean_query)
        except sqlite3.IntegrityError as err:
            err_str = str(err).upper()
            if "UNIQUE" in err_str:
                raise UniqueViolation(str(err)) from err
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
    """Tự động khởi tạo bảng users và email_otps nếu chưa có trong CSDL cục bộ."""
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
    conn.commit()


def get_connection() -> Any:
    """
    Kết nối đến CSDL PostgreSQL nếu được cấu hình DATABASE_URL và khả dụng.
    Nếu không có PostgreSQL (hoặc người dùng không bật Docker),
    hệ thống tự động sử dụng CSDL SQLite cục bộ giúp tính năng Đăng nhập/Đăng ký hoạt động mượt mà.
    """
    settings = get_settings()

    if settings.DATABASE_URL:
        try:
            return connect(
                settings.DATABASE_URL,
                connect_timeout=3,
            )
        except Exception as e:
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
    _ensure_sqlite_tables(sqlite_conn)
    return SQLiteConnectionWrapper(sqlite_conn)

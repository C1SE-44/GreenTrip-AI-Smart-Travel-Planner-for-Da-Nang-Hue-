from __future__ import annotations

import json
from typing import Any, Literal
import uuid

from app.admin.schemas import AdminAuditLogItem, AdminOverviewResponse, AdminPoiItem
from app.db.postgres import get_connection


def _parse_changes_json(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            loaded = json.loads(raw)
            return loaded if isinstance(loaded, dict) else {}
        except Exception:
            return {}
    return {}


def _format_timestamp(raw: Any) -> str:
    if hasattr(raw, "isoformat"):
        return str(raw.isoformat())
    return str(raw or "")


def _normalize_city_display(raw_city: str | None) -> str:
    lowered = (raw_city or "").strip().lower()
    if "hue" in lowered or "huế" in lowered:
        return "Huế"
    if "da nang" in lowered or "đà nẵng" in lowered or "danang" in lowered:
        return "Đà Nẵng"
    return raw_city or "Đà Nẵng"


def fetch_admin_overview() -> AdminOverviewResponse:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    COUNT(*),
                    SUM(CASE WHEN is_active IS NULL OR is_active = TRUE THEN 1 ELSE 0 END),
                    SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END)
                FROM public.pois
                """
            )
            poi_counts = cursor.fetchone() or (0, 0, 0)

            cursor.execute(
                """
                SELECT
                    COUNT(*),
                    SUM(CASE WHEN UPPER(role) = 'ADMIN' THEN 1 ELSE 0 END)
                FROM public.users
                """
            )
            user_counts = cursor.fetchone() or (0, 0)

            total_itineraries = 0
            try:
                cursor.execute("SELECT COUNT(*) FROM public.itineraries")
                row = cursor.fetchone()
                total_itineraries = int(row[0] or 0) if row else 0
            except Exception:
                # SQLite offline environment may not have bootstrapped itineraries yet
                total_itineraries = 0

            audit_logs: list[AdminAuditLogItem] = []
            cursor.execute(
                """
                SELECT
                    l.audit_id::text,
                    l.admin_user_id::text,
                    u.email,
                    l.action,
                    l.target_table,
                    l.target_id,
                    l.changes_json,
                    l.created_at
                FROM public.admin_audit_logs l
                LEFT JOIN public.users u ON u.user_id = l.admin_user_id
                ORDER BY l.created_at DESC
                LIMIT 10
                """
            )
            for r in cursor.fetchall():
                audit_logs.append(
                    AdminAuditLogItem(
                        audit_id=str(r[0]),
                        admin_user_id=str(r[1]),
                        admin_email=str(r[2]) if r[2] else None,
                        action=str(r[3]),
                        target_table=str(r[4]),
                        target_id=str(r[5]),
                        changes_json=_parse_changes_json(r[6]),
                        created_at=_format_timestamp(r[7]),
                    )
                )

    return AdminOverviewResponse(
        total_pois=int(poi_counts[0] or 0),
        active_pois=int(poi_counts[1] or 0),
        inactive_pois=int(poi_counts[2] or 0),
        total_users=int(user_counts[0] or 0),
        admin_users=int(user_counts[1] or 0),
        total_itineraries=total_itineraries,
        recent_audit_logs=audit_logs,
    )


def list_admin_pois(
    *,
    q: str | None = None,
    city: str | None = None,
    status_filter: Literal["all", "active", "inactive"] = "all",
    page: int = 1,
    limit: int = 15,
) -> tuple[list[AdminPoiItem], int]:
    where_clauses: list[str] = []
    params: list[Any] = []

    if q and q.strip():
        like = f"%{q.strip()}%"
        where_clauses.append("(p.name ILIKE %s OR COALESCE(p.address, '') ILIKE %s)")
        params.extend([like, like])

    if city and city.strip() and city.strip().casefold() != "all":
        city_lower = city.strip().casefold()
        if "hue" in city_lower or "huế" in city_lower:
            where_clauses.append("(ci.name ILIKE %s OR ci.name ILIKE %s)")
            params.extend(["%Hue%", "%Huế%"])
        elif "da nang" in city_lower or "đà nẵng" in city_lower:
            where_clauses.append("(ci.name ILIKE %s OR ci.name ILIKE %s)")
            params.extend(["%Da Nang%", "%Đà Nẵng%"])

    if status_filter == "active":
        where_clauses.append("(p.is_active IS NULL OR p.is_active = TRUE)")
    elif status_filter == "inactive":
        where_clauses.append("p.is_active = FALSE")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    offset = (page - 1) * limit

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT COUNT(*)
                FROM public.pois p
                LEFT JOIN public.cities ci ON ci.city_id = p.city_id
                {where_sql}
                """,
                tuple(params),
            )
            total = int((cursor.fetchone() or (0,))[0] or 0)

            cursor.execute(
                f"""
                SELECT
                    p.poi_id::text,
                    p.name,
                    COALESCE(ci.name, 'Da Nang'),
                    COALESCE(c.name, 'Khác'),
                    p.address,
                    p.estimated_cost::float,
                    p.green_score,
                    COALESCE(p.is_active, TRUE),
                    p.image_url
                FROM public.pois p
                LEFT JOIN public.cities ci ON ci.city_id = p.city_id
                LEFT JOIN public.poi_categories c ON c.category_id = p.category_id
                {where_sql}
                ORDER BY p.name ASC, p.poi_id ASC
                LIMIT %s OFFSET %s
                """,
                tuple(params + [limit, offset]),
            )
            rows = cursor.fetchall()

    items = [
        AdminPoiItem(
            poi_id=str(row[0]),
            name=str(row[1]),
            city=_normalize_city_display(row[2]),
            category=str(row[3]),
            address=str(row[4]) if row[4] is not None else None,
            estimated_cost=float(row[5]) if row[5] is not None else None,
            green_score=float(row[6]) if row[6] is not None else None,
            is_active=bool(row[7]) if row[7] is not None else True,
            image_url=str(row[8]) if row[8] else None,
        )
        for row in rows
    ]
    return items, total


def update_poi_with_audit(
    *,
    poi_id: str,
    admin_user_id: str,
    updates: dict[str, Any],
) -> tuple[AdminPoiItem, str] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    p.poi_id::text,
                    p.name,
                    COALESCE(ci.name, 'Da Nang'),
                    COALESCE(c.name, 'Khác'),
                    p.address,
                    p.estimated_cost::float,
                    p.green_score,
                    COALESCE(p.is_active, TRUE),
                    p.image_url
                FROM public.pois p
                LEFT JOIN public.cities ci ON ci.city_id = p.city_id
                LEFT JOIN public.poi_categories c ON c.category_id = p.category_id
                WHERE p.poi_id = %s
                """,
                (poi_id,),
            )
            before = cursor.fetchone()
            if not before:
                return None

            set_clauses: list[str] = []
            set_params: list[Any] = []
            diff_changes: dict[str, dict[str, Any]] = {}

            if "is_active" in updates and updates["is_active"] is not None:
                new_active = bool(updates["is_active"])
                old_active = bool(before[7]) if before[7] is not None else True
                set_clauses.append("is_active = %s")
                set_params.append(new_active)
                diff_changes["is_active"] = {"before": old_active, "after": new_active}

            if "estimated_cost" in updates and updates["estimated_cost"] is not None:
                new_cost = float(updates["estimated_cost"])
                old_cost = float(before[5]) if before[5] is not None else None
                set_clauses.append("estimated_cost = %s")
                set_params.append(new_cost)
                diff_changes["estimated_cost"] = {"before": old_cost, "after": new_cost}

            if "green_score" in updates and updates["green_score"] is not None:
                new_green = float(updates["green_score"])
                old_green = float(before[6]) if before[6] is not None else None
                set_clauses.append("green_score = %s")
                set_params.append(new_green)
                diff_changes["green_score"] = {"before": old_green, "after": new_green}

            if not set_clauses:
                return None

            cursor.execute(
                f"UPDATE public.pois SET {', '.join(set_clauses)} WHERE poi_id = %s",
                tuple(set_params + [poi_id]),
            )

            audit_id = str(uuid.uuid4())
            cursor.execute(
                """
                INSERT INTO public.admin_audit_logs (
                    audit_id, admin_user_id, action, target_table, target_id, changes_json
                ) VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    audit_id,
                    admin_user_id,
                    "UPDATE_POI",
                    "pois",
                    poi_id,
                    json.dumps(diff_changes, ensure_ascii=False),
                ),
            )
            connection.commit()

            cursor.execute(
                """
                SELECT
                    p.poi_id::text,
                    p.name,
                    COALESCE(ci.name, 'Da Nang'),
                    COALESCE(c.name, 'Khác'),
                    p.address,
                    p.estimated_cost::float,
                    p.green_score,
                    COALESCE(p.is_active, TRUE),
                    p.image_url
                FROM public.pois p
                LEFT JOIN public.cities ci ON ci.city_id = p.city_id
                LEFT JOIN public.poi_categories c ON c.category_id = p.category_id
                WHERE p.poi_id = %s
                """,
                (poi_id,),
            )
            after = cursor.fetchone() or before

    poi_item = AdminPoiItem(
        poi_id=str(after[0]),
        name=str(after[1]),
        city=_normalize_city_display(after[2]),
        category=str(after[3]),
        address=str(after[4]) if after[4] is not None else None,
        estimated_cost=float(after[5]) if after[5] is not None else None,
        green_score=float(after[6]) if after[6] is not None else None,
        is_active=bool(after[7]) if after[7] is not None else True,
        image_url=str(after[8]) if after[8] else None,
    )
    return poi_item, audit_id

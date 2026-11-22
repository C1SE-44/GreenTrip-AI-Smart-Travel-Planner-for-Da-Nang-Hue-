from math import ceil
from typing import Literal

from app.admin.repository import (
    fetch_admin_overview,
    list_admin_pois,
    update_poi_with_audit,
)
from app.admin.schemas import (
    AdminOverviewResponse,
    AdminPoiListResponse,
    AdminPoiPatchRequest,
    AdminPoiPatchResponse,
)
from app.cache import poi_cache


class AdminServiceUnavailable(Exception):
    """Raised when the database cannot serve admin queries."""


def get_admin_overview() -> AdminOverviewResponse:
    try:
        return fetch_admin_overview()
    except Exception as exc:
        raise AdminServiceUnavailable from exc


def get_admin_pois(
    *,
    q: str | None = None,
    city: str | None = None,
    status_filter: Literal["all", "active", "inactive"] = "all",
    page: int = 1,
    limit: int = 15,
) -> AdminPoiListResponse:
    try:
        items, total = list_admin_pois(
            q=q,
            city=city,
            status_filter=status_filter,
            page=page,
            limit=limit,
        )
    except Exception as exc:
        raise AdminServiceUnavailable from exc

    total_pages = ceil(total / limit) if total else 0
    return AdminPoiListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


def patch_admin_poi(
    *,
    poi_id: str,
    admin_user_id: str,
    payload: AdminPoiPatchRequest,
) -> AdminPoiPatchResponse | None:
    updates = payload.model_dump(exclude_none=True)
    try:
        result = update_poi_with_audit(
            poi_id=poi_id,
            admin_user_id=admin_user_id,
            updates=updates,
        )
    except Exception as exc:
        raise AdminServiceUnavailable from exc

    if result is None:
        return None
    poi, audit_id = result
    poi_cache.invalidate_pois()
    return AdminPoiPatchResponse(
        poi=poi,
        audit_id=audit_id,
        message=f"Đã cập nhật địa điểm '{poi.name}' và ghi nhật ký kiểm toán.",
    )

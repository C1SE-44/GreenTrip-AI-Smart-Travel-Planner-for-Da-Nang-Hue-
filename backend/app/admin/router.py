from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.admin.schemas import (
    AdminOverviewResponse,
    AdminPoiListResponse,
    AdminPoiPatchRequest,
    AdminPoiPatchResponse,
)
from app.admin.service import (
    AdminServiceUnavailable,
    get_admin_overview,
    get_admin_pois,
    patch_admin_poi,
)
from app.auth.dependencies import AuthenticatedUser, require_admin

router = APIRouter(prefix="/admin", tags=["Admin RBAC"])


@router.get(
    "/overview",
    response_model=AdminOverviewResponse,
    summary="Admin KPI overview & recent audit logs",
)
def read_admin_overview(
    _admin: AuthenticatedUser = Depends(require_admin),
) -> AdminOverviewResponse:
    try:
        return get_admin_overview()
    except AdminServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể tải thống kê quản trị lúc này.",
        ) from exc


@router.get(
    "/pois",
    response_model=AdminPoiListResponse,
    summary="List and filter POIs for admin moderation",
)
def read_admin_pois(
    q: str | None = Query(default=None, max_length=120),
    city: str | None = Query(default=None, max_length=40),
    status_filter: Literal["all", "active", "inactive"] = Query(default="all"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=15, ge=1, le=100),
    _admin: AuthenticatedUser = Depends(require_admin),
) -> AdminPoiListResponse:
    try:
        return get_admin_pois(
            q=q,
            city=city,
            status_filter=status_filter,
            page=page,
            limit=limit,
        )
    except AdminServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể tải danh sách địa điểm quản trị.",
        ) from exc


@router.patch(
    "/pois/{poi_id}",
    response_model=AdminPoiPatchResponse,
    summary="Update POI active state, estimated cost, or green score with audit log",
)
def update_admin_poi(
    poi_id: str,
    payload: AdminPoiPatchRequest,
    admin: AuthenticatedUser = Depends(require_admin),
) -> AdminPoiPatchResponse:
    try:
        result = patch_admin_poi(
            poi_id=poi_id,
            admin_user_id=admin.user_id,
            payload=payload,
        )
    except AdminServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể cập nhật địa điểm lúc này.",
        ) from exc

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy địa điểm cần cập nhật.",
        )
    return result

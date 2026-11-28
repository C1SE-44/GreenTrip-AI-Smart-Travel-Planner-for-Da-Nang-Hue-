from typing import Literal
from fastapi import APIRouter, HTTPException, Path, Query, status
from pydantic import BaseModel

from app.itineraries.schemas import (
    ComputeRouteRequest,
    DayRouteResponse,
    RouteStop,
    UpdateSegmentTransportRequest,
)
from app.itineraries.service import (
    DayNotFoundError,
    InvalidPoiCoordinatesError,
    ItineraryNotFoundError,
    build_day_segments,
    get_itinerary_day_route,
)

router = APIRouter(tags=["Itineraries"])


@router.get(
    "/{itinerary_id}/days/{day_number}/route",
    response_model=DayRouteResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy hình học tuyến đường, các điểm dừng và đề xuất phương tiện cho từng chặng",
    description=(
        "Trả về hình học tuyến đường GeoJSON (LineString [longitude, latitude]) cùng danh sách "
        "các điểm dừng, các chặng di chuyển (segments), so sánh đa tiêu chí các phương tiện (thời gian, chi phí, phát thải CO2, tính khả thi) và tổng chi phí / carbon cả ngày."
    ),
    responses={
        200: {
            "description": "Lấy tuyến đường thành công",
            "model": DayRouteResponse,
        },
        404: {
            "description": "Không tìm thấy lịch trình hoặc ngày yêu cầu",
            "content": {
                "application/json": {
                    "example": {"detail": "Itinerary '123' not found"}
                }
            },
        },
        422: {
            "description": "Dữ liệu không hợp lệ (số ngày <= 0 hoặc POI thiếu tọa độ)",
            "content": {
                "application/json": {
                    "example": {"detail": "POI 'Destination A' (poi_001) is missing latitude/longitude coordinates"}
                }
            },
        },
        500: {
            "description": "Lỗi máy chủ nội bộ hoặc lỗi truy vấn CSDL",
            "content": {
                "application/json": {
                    "example": {"detail": "Internal server error calculating route geometry"}
                }
            },
        },
    },
)
def get_day_route(
    itinerary_id: str = Path(..., description="Mã định danh lịch trình chuyến đi (ví dụ: 'sample-danang-hue-3d')"),
    day_number: int = Path(..., ge=1, description="Ngày thứ N trong lịch trình (bắt đầu từ 1)"),
    profile: Literal["balanced", "eco_priority", "budget_constrained", "fastest"] = Query(
        default="balanced", description="Hồ sơ trọng số ưu tiên: balanced, eco_priority, budget_constrained, fastest"
    ),
) -> DayRouteResponse:
    if day_number < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="day_number must be greater than or equal to 1",
        )

    profile_str = str(getattr(profile, "default", profile)) if not isinstance(profile, str) else profile
    if profile_str not in ("balanced", "eco_priority", "budget_constrained", "fastest"):
        profile_str = "balanced"

    try:
        return get_itinerary_day_route(
            itinerary_id=itinerary_id,
            day_number=day_number,
            profile=profile_str,
        )
    except ItineraryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except DayNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except InvalidPoiCoordinatesError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error calculating route geometry",
        ) from exc


@router.post(
    "/{itinerary_id}/days/{day_number}/segment-transport",
    response_model=DayRouteResponse,
    status_code=status.HTTP_200_OK,
    summary="Đổi phương tiện di chuyển cho một chặng cụ thể và tính toán lại tổng ngày",
)
def update_segment_transport(
    itinerary_id: str = Path(..., description="Mã định danh lịch trình"),
    day_number: int = Path(..., ge=1, description="Ngày thứ N"),
    payload: UpdateSegmentTransportRequest = ...,
) -> DayRouteResponse:
    try:
        from app.itineraries import repository
        # Persist segment transport mode in database
        repository.save_itinerary_day_custom_segment_modes(
            itinerary_id=itinerary_id,
            day_number=day_number,
            custom_modes={payload.segment_index: payload.selected_mode},
        )

        return get_itinerary_day_route(
            itinerary_id=itinerary_id,
            day_number=day_number,
            profile=payload.priority_profile,
            custom_modes={payload.segment_index: payload.selected_mode},
        )
    except (ItineraryNotFoundError, DayNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating segment transport: {exc}",
        ) from exc



@router.post(
    "/compute",
    response_model=DayRouteResponse,
    status_code=status.HTTP_200_OK,
    summary="Tính toán hình học tuyến đường và phân tích phương tiện theo danh sách điểm dừng bất kỳ",
)
def compute_route(payload: ComputeRouteRequest) -> DayRouteResponse:
    import json
    from app.itineraries import repository, routing_service

    merged_custom_modes: dict[int, str] = {}
    if payload.itinerary_id and payload.day_number:
        day = repository.get_itinerary_day(payload.itinerary_id, payload.day_number)
        db_custom_raw = day.get("custom_segment_modes") if day else None
        if db_custom_raw:
            try:
                parsed = json.loads(db_custom_raw)
                if isinstance(parsed, dict):
                    merged_custom_modes = {int(k): str(v) for k, v in parsed.items() if str(k).isdigit()}
            except Exception:
                merged_custom_modes = {}

    route_res = routing_service.compute_route_geometry(
        payload.stops, return_legs=True
    )
    if len(route_res) == 6:
        route_geom, distance_m, duration_s, is_fallback, provider, legs = route_res
    else:
        route_geom, distance_m, duration_s, is_fallback, provider = route_res
        legs = []

    segments, day_cost, day_carbon = build_day_segments(
        payload.stops,
        profile=payload.priority_profile,
        custom_modes=merged_custom_modes or None,
        legs=legs,
    )
    total_trip_duration_s = sum(seg.duration_seconds for seg in segments) if segments else duration_s

    return DayRouteResponse(
        itinerary_id=payload.itinerary_id or "dynamic",
        day_number=payload.day_number or 1,
        total_days=1,
        total_stops=len(payload.stops),
        stops=payload.stops,
        route=route_geom,
        distance_meters=distance_m,
        duration_seconds=duration_s,
        total_trip_duration_seconds=round(total_trip_duration_s, 1),
        is_fallback=is_fallback,
        routing_provider=provider,
        segments=segments,
        day_total_cost_vnd=day_cost,
        day_total_carbon_kg=day_carbon,
        priority_profile=payload.priority_profile,
    )


from fastapi import APIRouter, HTTPException, Path, status

from app.itineraries.schemas import DayRouteResponse
from app.itineraries.service import (
    DayNotFoundError,
    InvalidPoiCoordinatesError,
    ItineraryNotFoundError,
    get_itinerary_day_route,
)

router = APIRouter(tags=["Itineraries"])


@router.get(
    "/{itinerary_id}/days/{day_number}/route",
    response_model=DayRouteResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy hình học tuyến đường và các điểm dừng theo thứ tự trong ngày",
    description=(
        "Trả về hình học tuyến đường GeoJSON (LineString [longitude, latitude]) cùng danh sách "
        "các điểm dừng được sắp xếp chính xác theo thứ tự ghé thăm, tổng quãng đường và thời gian di chuyển ước tính."
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
) -> DayRouteResponse:
    if day_number < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="day_number must be greater than or equal to 1",
        )
    try:
        return get_itinerary_day_route(itinerary_id=itinerary_id, day_number=day_number)
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

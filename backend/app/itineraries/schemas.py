from typing import Literal
from pydantic import BaseModel, Field


class RouteStop(BaseModel):
    """An individual ordered stop on the day's itinerary."""

    order: int = Field(..., ge=1, description="Thứ tự ghé thăm trong ngày (bắt đầu từ 1)")
    poi_id: str = Field(..., description="Mã định danh địa điểm (POI ID)")
    name: str = Field(..., description="Tên địa điểm")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Vĩ độ (WGS84)")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Kinh độ (WGS84)")


class RouteGeometry(BaseModel):
    """GeoJSON-compliant LineString geometry."""

    type: Literal["LineString"] = Field(default="LineString", description="Loại hình học GeoJSON")
    coordinates: list[list[float]] = Field(
        default_factory=list,
        description="Mảng tọa độ GeoJSON dạng [[longitude, latitude], ...] theo đúng thứ tự",
    )


class DayRouteResponse(BaseModel):
    """Phản hồi tuyến đường chi tiết và các điểm dừng trong ngày."""

    itinerary_id: str = Field(..., description="Mã lịch trình chuyến đi")
    day_number: int = Field(..., ge=1, description="Ngày thứ N trong lịch trình")
    total_days: int | None = Field(default=None, description="Tổng số ngày trong toàn bộ lịch trình chuyến đi")
    total_stops: int = Field(..., ge=0, description="Tổng số điểm dừng trong ngày")
    stops: list[RouteStop] = Field(default_factory=list, description="Danh sách điểm dừng theo đúng thứ tự ghé thăm")
    route: RouteGeometry = Field(..., description="Hình học tuyến đường GeoJSON nối các điểm dừng")
    distance_meters: float = Field(..., ge=0.0, description="Tổng quãng đường di chuyển ước tính (mét)")
    duration_seconds: float = Field(..., ge=0.0, description="Tổng thời gian di chuyển ước tính (giây)")
    is_fallback: bool = Field(default=False, description="Cờ xác định nếu tuyến đường dùng hình học fallback thay vì OSRM thực tế")
    routing_provider: str = Field(default="osrm", description="Nguồn dữ liệu tính toán định tuyến (osrm hoặc fallback)")

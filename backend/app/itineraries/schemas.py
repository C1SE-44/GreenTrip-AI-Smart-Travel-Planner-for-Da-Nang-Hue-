from typing import Literal
from pydantic import BaseModel, Field

from app.itineraries.transport_service import TransportOptionEvaluation as TransportModeOption


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



class RouteSegment(BaseModel):
    """Thông tin di chuyển và so sánh phương tiện giữa 2 điểm dừng liên tiếp."""

    segment_index: int = Field(..., description="Chỉ số chặng bắt đầu từ 0 (giữa stop i và stop i+1)")
    from_stop: RouteStop = Field(..., description="Điểm xuất phát của chặng")
    to_stop: RouteStop = Field(..., description="Điểm đến của chặng")
    distance_meters: float = Field(..., description="Quãng đường chặng (mét)")
    duration_seconds: float = Field(..., description="Tổng thời gian di chuyển dự kiến gồm chuyển tiếp/chờ (giây)")
    transit_duration_seconds: float = Field(default=0.0, description="Thời gian lăn bánh thực tế trên đường (giây)")
    transfer_duration_seconds: float = Field(default=0.0, description="Thời gian chờ đón, gửi xe hoặc chuyển tiếp (giây)")
    is_intercity: bool = Field(default=False, description="Đánh dấu chặng liên tỉnh Đà Nẵng - Huế")
    recommended_mode: str = Field(..., description="Phương tiện được hệ thống khuyên dùng nhất")
    selected_mode: str = Field(..., description="Phương tiện hiện tại đang được áp dụng")
    options: list[TransportModeOption] = Field(default_factory=list, description="Danh sách các phương tiện được đánh giá và so sánh")


class DayRouteResponse(BaseModel):
    """Phản hồi tuyến đường chi tiết và các điểm dừng trong ngày."""

    itinerary_id: str = Field(..., description="Mã lịch trình chuyến đi")
    day_number: int = Field(..., ge=1, description="Ngày thứ N trong lịch trình")
    total_days: int | None = Field(default=None, description="Tổng số ngày trong toàn bộ lịch trình chuyến đi")
    total_stops: int = Field(..., ge=0, description="Tổng số điểm dừng trong ngày")
    stops: list[RouteStop] = Field(default_factory=list, description="Danh sách điểm dừng theo đúng thứ tự ghé thăm")
    route: RouteGeometry = Field(..., description="Hình học tuyến đường GeoJSON nối các điểm dừng")
    distance_meters: float = Field(..., ge=0.0, description="Tổng quãng đường di chuyển ước tính (mét)")
    duration_seconds: float = Field(..., ge=0.0, description="Tổng thời gian di chuyển lăn bánh thuần túy OSRM/fallback (giây)")
    total_trip_duration_seconds: float = Field(default=0.0, description="Tổng thời gian bao gồm thời gian chờ, gửi xe và chuyển tiếp (giây)")
    is_fallback: bool = Field(default=False, description="Cờ xác định nếu tuyến đường dùng hình học fallback thay vì OSRM thực tế")
    routing_provider: str = Field(default="osrm", description="Nguồn dữ liệu tính toán định tuyến (osrm hoặc fallback)")
    segments: list[RouteSegment] = Field(
        default_factory=list,
        description="Chi tiết các chặng di chuyển và đề xuất phương tiện giữa các điểm dừng",
    )
    day_total_cost_vnd: float = Field(default=0.0, description="Tổng chi phí di chuyển ước tính trong ngày (VND)")
    day_total_carbon_kg: float = Field(default=0.0, description="Tổng lượng phát thải CO2e ước tính trong ngày (kg)")
    priority_profile: str = Field(default="balanced", description="Hồ sơ ưu tiên được áp dụng (balanced, eco_priority, budget_constrained, fastest)")


class UpdateSegmentTransportRequest(BaseModel):
    """Yêu cầu đổi phương tiện di chuyển cho một chặng cụ thể."""

    segment_index: int = Field(..., ge=0, description="Chỉ số chặng cần thay đổi (0-indexed)")
    selected_mode: str = Field(..., description="Mã phương tiện mới muốn áp dụng")
    priority_profile: Literal["balanced", "eco_priority", "budget_constrained", "fastest"] = Field(
        default="balanced", description="Hồ sơ ưu tiên đánh giá"
    )


class ComputeRouteRequest(BaseModel):
    """Yêu cầu tính toán hình học tuyến đường theo danh sách điểm dừng."""

    stops: list[RouteStop] = Field(..., description="Danh sách các điểm dừng")
    priority_profile: Literal["balanced", "eco_priority", "budget_constrained", "fastest"] = Field(
        default="balanced", description="Hồ sơ ưu tiên đánh giá"
    )
    itinerary_id: str | None = Field(default=None, description="Mã lịch trình để đồng bộ tùy chọn phương tiện đã lưu (nếu có)")
    day_number: int | None = Field(default=None, ge=1, description="Số ngày tương ứng để khôi phục custom_segment_modes")



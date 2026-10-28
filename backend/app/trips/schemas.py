from datetime import date, datetime, timedelta
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field, field_validator, model_validator


class DestinationType(str, Enum):
    DA_NANG = "Đà Nẵng"
    HUE = "Huế"
    BOTH = "Đà Nẵng & Huế"


class BudgetTier(str, Enum):
    BUDGET = "budget"        # Tiết kiệm (< 700.000 VNĐ / người / ngày)
    STANDARD = "standard"    # Hợp lý (700.000 - 2.500.000 VNĐ / người / ngày)
    LUXURY = "luxury"        # Cao cấp (>= 2.500.000 VNĐ / người / ngày)


ALLOWED_PREFERENCES = {
    "culture",        # Văn hóa & Di sản
    "food",           # Ẩm thực miền Trung
    "nature",         # Thiên nhiên & Sinh thái
    "eco",            # Du lịch xanh & Bền vững
    "beach",          # Biển & Nghỉ dưỡng
    "adventure",      # Khám phá & Trải nghiệm
    "checkin",        # Nhiếp ảnh & Check-in
    "relaxation",     # Thư giãn & Nghỉ dưỡng
    "family",         # Phù hợp gia đình
    "nightlife",      # Hoạt động về đêm
}


def normalize_destination(val: str) -> str:
    cleaned = val.strip().lower()
    # Da Nang variants
    if cleaned in ["đà nẵng", "da nang", "danang", "da_nang", "dn"]:
        return DestinationType.DA_NANG.value
    # Hue variants
    if cleaned in ["huế", "hue", "thừa thiên huế", "thua thien hue"]:
        return DestinationType.HUE.value
    # Both variants
    if (
        "đà nẵng" in cleaned and "huế" in cleaned
        or "da nang" in cleaned and "hue" in cleaned
        or cleaned in ["both", "cả hai", "ca hai", "đà nẵng & huế", "da nang & hue", "da_nang_hue"]
    ):
        return DestinationType.BOTH.value
    
    raise ValueError("Điểm đến chỉ hỗ trợ: 'Đà Nẵng', 'Huế', hoặc 'Đà Nẵng & Huế'.")


class TripParametersRequest(BaseModel):
    destination: str = Field(
        ...,
        description="Điểm đến: 'Đà Nẵng', 'Huế', hoặc 'Đà Nẵng & Huế'",
        examples=["Đà Nẵng", "Huế", "Đà Nẵng & Huế"]
    )
    days: int = Field(
        ...,
        ge=1,
        le=14,
        description="Số ngày của chuyến đi (1 - 14 ngày)",
        examples=[3]
    )
    total_budget: float = Field(
        ...,
        gt=0,
        le=1_000_000_000,
        description="Tổng ngân sách chuyến đi tính bằng VNĐ",
        examples=[5000000.0]
    )
    num_people: int = Field(
        default=1,
        ge=1,
        le=20,
        description="Số lượng du khách (1 - 20 người)",
        examples=[2]
    )
    start_date: str | None = Field(
        default=None,
        description="Ngày bắt đầu hành trình (định dạng YYYY-MM-DD)",
        examples=["2026-11-01"]
    )
    preferences: list[str] = Field(
        default_factory=list,
        description="Danh sách sở thích du lịch (culture, food, nature, eco, beach, etc.)",
        examples=[["culture", "food", "eco"]]
    )

    @field_validator("destination")
    @classmethod
    def validate_destination(cls, val: str) -> str:
        if not val or not val.strip():
            raise ValueError("Điểm đến không được để trống.")
        return normalize_destination(val)

    @field_validator("days")
    @classmethod
    def validate_days(cls, val: int) -> int:
        if val < 1:
            raise ValueError("Số ngày chuyến đi tối thiểu là 1 ngày.")
        if val > 14:
            raise ValueError("Số ngày chuyến đi tối đa là 14 ngày cho hành trình Đà Nẵng - Huế.")
        return val

    @field_validator("num_people")
    @classmethod
    def validate_num_people(cls, val: int) -> int:
        if val < 1:
            raise ValueError("Số lượng người đi tối thiểu là 1 người.")
        if val > 20:
            raise ValueError("Số lượng người đi theo nhóm tối đa là 20 người.")
        return val

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, val: str | None) -> str | None:
        if not val:
            return None
        try:
            parsed = datetime.strptime(val.strip(), "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Định dạng ngày bắt đầu không hợp lệ. Vui lòng dùng YYYY-MM-DD.")
        
        today = date.today()
        if parsed < today:
            raise ValueError("Ngày bắt đầu không được ở trong quá khứ.")
        return val.strip()

    @field_validator("preferences")
    @classmethod
    def validate_preferences(cls, val: list[str]) -> list[str]:
        cleaned: list[str] = []
        for item in val:
            norm = item.strip().lower()
            if norm and norm not in cleaned:
                cleaned.append(norm)
        return cleaned

    @model_validator(mode="after")
    def validate_business_rules(self) -> "TripParametersRequest":
        # Business rule 1: Minimum budget per person per day
        # In Da Nang / Hue, basic daily budget requires at least 200,000 VND / person / day
        min_budget_required = 200_000.0 * self.days * self.num_people
        if self.total_budget < min_budget_required:
            formatted_min = f"{int(min_budget_required):,}".replace(",", ".")
            raise ValueError(
                f"Ngân sách không đủ cho chuyến đi {self.days} ngày ({self.num_people} người). "
                f"Mức chi tiêu tối thiểu ước tính là {formatted_min} VNĐ (tối thiểu 200.000 VNĐ/người/ngày)."
            )

        # Business rule 2: Multi-city itinerary duration check
        if self.destination == DestinationType.BOTH.value and self.days < 2:
            raise ValueError(
                "Hành trình kết hợp cả Đà Nẵng & Huế cần tối thiểu 2 ngày để đảm bảo thời gian di chuyển và trải nghiệm."
            )

        return self


class CostBreakdown(BaseModel):
    accommodation: float = Field(..., description="Chi phí lưu trú (khách sạn, homestay)")
    food_and_beverage: float = Field(..., description="Chi phí ẩm thực, ăn uống")
    transportation: float = Field(..., description="Chi phí di chuyển nội thành & trung chuyển")
    activities_and_tickets: float = Field(..., description="Vé tham quan, hoạt động vui chơi")
    percentage_breakdown: dict[str, int] = Field(
        default_factory=dict,
        description="Tỷ lệ % phân bổ thực tế dựa theo sở thích & phân khúc ngân sách"
    )


class MatchedPOI(BaseModel):
    name: str = Field(..., description="Tên địa điểm thực tế từ cơ sở dữ liệu")
    category: str = Field(..., description="Danh mục (Ẩm thực, Di tích, Thiên nhiên, Quán cafe)")
    city: str = Field(..., description="Thành phố (Đà Nẵng / Huế)")
    address: str = Field(default="", description="Địa chỉ")
    description: str = Field(default="", description="Mô tả tóm tắt đặc trưng")
    highlight_tag: str = Field(default="Địa điểm nổi bật", description="Huy hiệu đặc trưng")
    estimated_price_range: str = Field(..., description="Mức chi phí ước tính tham khảo")
    eco_features: list[str] = Field(default_factory=list, description="Tiêu chí du lịch xanh")
    green_score: float | None = Field(default=None, description="Điểm Green Score (0.0 - 1.0)")
    best_time: list[str] | str | None = Field(default=None, description="Thời điểm lý tưởng")
    image_url: str | None = Field(default=None, description="Ảnh đại diện địa điểm")


class DailyItineraryOutline(BaseModel):
    day: int = Field(..., description="Ngày thứ N trong lịch trình")
    theme: str = Field(..., description="Chủ đề hoạt động trong ngày")
    focus_city: str = Field(..., description="Trọng tâm tại thành phố")
    suggested_activities: list[str] = Field(
        default_factory=list,
        description="Các hoạt động tiêu biểu đề xuất cho ngày này"
    )


class ValidatedTripData(BaseModel):
    destination: str
    days: int
    num_people: int
    total_budget: float
    daily_budget_per_person: float
    budget_tier: BudgetTier
    pacing_level: str
    pacing_label: str
    pacing_desc: str
    is_budget_sufficient: bool
    min_recommended_budget: float
    budget_warning: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    preferences: list[str]
    cost_breakdown: CostBreakdown
    recommendations: list[str]
    matched_pois: list[MatchedPOI] = Field(
        default_factory=list,
        description="Danh sách địa điểm thực tế từ Database khớp với ngân sách và sở thích"
    )
    itinerary_outline: list[DailyItineraryOutline] = Field(
        default_factory=list,
        description="Lộ trình phân bổ theo từng ngày thực tế"
    )


class TripParametersResponse(BaseModel):
    valid: bool = True
    message: str = "Thông số chuyến đi hợp lệ và sẵn sàng để tạo lịch trình."
    data: ValidatedTripData

from datetime import date, datetime, timedelta
from enum import Enum
from typing import Any, Literal
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
    total_budget: float | None = Field(
        default=None,
        gt=0,
        le=1_000_000_000,
        description="Tổng ngân sách chuyến đi tính bằng VNĐ (tùy chọn nếu chọn budget_tier)",
        examples=[5000000.0]
    )
    budget_tier: BudgetTier | None = Field(
        default=None,
        description="Mức chi tiêu mong muốn (budget: tiết kiệm, standard: tiêu chuẩn, luxury: cao cấp)",
        examples=[BudgetTier.STANDARD]
    )
    dining_tier: BudgetTier | None = Field(
        default=None,
        description="Mức chi tiêu ẩm thực riêng (budget, standard, luxury)",
        examples=[BudgetTier.STANDARD]
    )
    lodging_tier: BudgetTier | None = Field(
        default=None,
        description="Mức chi tiêu lưu trú riêng (budget, standard, luxury)",
        examples=[BudgetTier.STANDARD]
    )
    activities_tier: BudgetTier | None = Field(
        default=None,
        description="Mức chi tiêu hoạt động trải nghiệm riêng (budget, standard, luxury)",
        examples=[BudgetTier.STANDARD]
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
        if self.total_budget is not None:
            min_budget_required = 200_000.0 * self.days * self.num_people
            if self.total_budget < min_budget_required:
                formatted_min = f"{int(min_budget_required):,}".replace(",", ".")
                raise ValueError(
                    f"Ngân sách không đủ cho chuyến đi {self.days} ngày ({self.num_people} người). "
                    f"Mức chi tiêu tối thiểu ước tính là {formatted_min} VNĐ (tối thiểu 200.000 VNĐ/người/ngày)."
                )
        else:
            tier = self.budget_tier or BudgetTier.STANDARD
            self.budget_tier = tier
            if tier == BudgetTier.BUDGET:
                daily_estimate = 500_000.0
            elif tier == BudgetTier.LUXURY:
                daily_estimate = 3_000_000.0
            else:
                daily_estimate = 1_200_000.0
            self.total_budget = daily_estimate * self.days * self.num_people

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


class RestPeriod(BaseModel):
    time_range: str = Field(..., description="Khung giờ nghỉ gợi ý, ví dụ 12:00–14:00")
    activity: str = Field(..., description="Hoạt động nghỉ ngơi hoặc phục hồi sức khỏe")
    duration_minutes: int = Field(..., ge=10, description="Thời lượng nghỉ gợi ý tính bằng phút")


class DailyItineraryOutline(BaseModel):
    day: int = Field(..., description="Ngày thứ N trong lịch trình")
    theme: str = Field(..., description="Chủ đề hoạt động trong ngày")
    focus_city: str = Field(..., description="Trọng tâm tại thành phố")
    suggested_activities: list[str] = Field(
        default_factory=list,
        description="Các hoạt động tiêu biểu đề xuất cho ngày này"
    )
    rest_periods: list[RestPeriod] = Field(
        default_factory=list,
        description="Các khoảng nghỉ gợi ý để tránh lịch trình quá dày"
    )
    assistant_tip: str = Field(
        default="",
        description="Lời khuyên cá nhân hóa giúp du khách cân bằng khám phá và nghỉ ngơi"
    )


class ItineraryStop(BaseModel):
    stop_id: str = Field(min_length=1, max_length=100)
    poi_id: str | None = Field(default=None, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    city: str | None = None
    address: str | None = Field(default=None, max_length=500)
    category: str | None = None
    stop_type: Literal["poi", "rest", "custom"] = "poi"
    source: Literal["idea", "manual", "assistant"] = "idea"
    sequence: int = Field(ge=0)
    duration_minutes: int | None = Field(default=None, gt=0, le=1440)
    start_time: str | None = None
    end_time: str | None = None
    comment: str | None = Field(default=None, max_length=2000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            parsed = datetime.strptime(value, "%H:%M")
        except ValueError as error:
            raise ValueError("Giờ cần có định dạng HH:MM.") from error
        if parsed.strftime("%H:%M") != value:
            raise ValueError("Giờ cần có định dạng HH:MM.")
        return value

    @model_validator(mode="after")
    def validate_time_order(self) -> "ItineraryStop":
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("Giờ kết thúc phải sau giờ bắt đầu.")
        return self


class ItineraryDay(BaseModel):
    day_id: str = Field(min_length=1, max_length=100)
    day_number: int = Field(ge=1, le=31)
    date: str | None = None
    title: str = Field(default="", max_length=200)
    stops: list[ItineraryStop] = Field(default_factory=list)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("Ngày trong lịch trình cần có định dạng YYYY-MM-DD.") from error
        if parsed.isoformat() != value:
            raise ValueError("Ngày trong lịch trình cần có định dạng YYYY-MM-DD.")
        return value


class TripItinerarySyncRequest(BaseModel):
    trip_id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    destination: str = Field(min_length=1, max_length=200)
    start_date: str | None = None
    days_count: int = Field(ge=1, le=31)
    days: list[ItineraryDay] = Field(max_length=31)

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("Ngày bắt đầu cần có định dạng YYYY-MM-DD.") from error
        if parsed.isoformat() != value:
            raise ValueError("Ngày bắt đầu cần có định dạng YYYY-MM-DD.")
        return value

    @model_validator(mode="after")
    def validate_days(self) -> "TripItinerarySyncRequest":
        numbers = [day.day_number for day in self.days]
        if len(numbers) != self.days_count or len(set(numbers)) != self.days_count:
            raise ValueError("Lịch trình phải có đúng một bản ghi cho mỗi ngày của chuyến đi.")
        if set(numbers) != set(range(1, self.days_count + 1)):
            raise ValueError("Số thứ tự ngày phải liên tục từ ngày 1.")
        day_ids = [day.day_id for day in self.days]
        if len(day_ids) != len(set(day_ids)):
            raise ValueError("Mã ngày trong lịch trình không được trùng nhau.")
        stop_ids = [stop.stop_id for day in self.days for stop in day.stops]
        if len(stop_ids) != len(set(stop_ids)):
            raise ValueError("Mã hoạt động trong lịch trình không được trùng nhau.")
        for day in self.days:
            sequences = [stop.sequence for stop in day.stops]
            if sorted(sequences) != list(range(len(day.stops))):
                raise ValueError("Thứ tự hoạt động trong mỗi ngày phải liên tục từ 0.")
            timed_stops = sorted(
                (stop for stop in day.stops if stop.start_time and stop.end_time),
                key=lambda stop: stop.start_time or "",
            )
            for previous, current in zip(timed_stops, timed_stops[1:]):
                if current.start_time and previous.end_time and current.start_time < previous.end_time:
                    raise ValueError(
                        f"Ngày {day.day_number} có khung giờ bị trùng giữa "
                        f"'{previous.title}' và '{current.title}'."
                    )
        return self


class TripItineraryResponse(TripItinerarySyncRequest):
    updated_at: datetime | None = None


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


# ============================================================================
# PB14: In-Planner AI Travel Copilot Schemas
# ============================================================================

class TripContextPayload(BaseModel):
    destination: str = Field(default="Đà Nẵng", description="Thành phố mục tiêu: 'Đà Nẵng' hoặc 'Huế'")
    days_count: int = Field(default=3, ge=1, le=14, description="Tổng số ngày chuyến đi")
    current_day: int = Field(default=1, ge=1, description="Ngày đang xem trong lịch trình")
    current_slot: str | None = Field(default="lunch", description="Khung giờ: morning, lunch, afternoon, dinner")
    current_stop_name: str | None = Field(default=None, description="Tên điểm dừng hiện tại cần đổi")
    current_stop_id: str | None = Field(default=None, description="ID của điểm dừng hiện tại")
    saved_ideas: list[str] = Field(default_factory=list, description="Danh sách địa điểm người dùng đã lưu vào Ý tưởng")


class CopilotChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000, description="Nội dung người dùng gửi cho Copilot")
    trip_context: TripContextPayload = Field(
        default_factory=TripContextPayload,
        description="Ngữ cảnh chuyến đi hiện tại (thành phố, ngày, điểm dừng)"
    )


class CopilotSuggestedPoiItem(BaseModel):
    id: str
    name: str
    category: str
    sub_category: str | None = None
    image_url: str
    green_score: int
    rating: float
    address: str
    swap_reason: str
    distance_info: str | None = None
    estimated_cost: float | None = None
    price_range_display: str | None = None
    budget_delta: str | None = None
    carbon_saved: str | None = None
    gallery_urls: list[str] | None = None


class CopilotChatResponse(BaseModel):
    reply_text: str
    intent: str  # 'swap_meal_vegetarian', 'rainy_day_alternatives', 'night_eco_activities', 'late_schedule_adjust', 'general_chat'
    target_slot: str | None = None
    suggested_pois: list[CopilotSuggestedPoiItem] = []
    action_type: str = "none"  # 'replace_stop', 'add_stop', 'none'
    next_suggested_prompts: list[str] = []
    avoid_notice: str | None = None
    green_impact_summary: str | None = None
    budget_impact_summary: str | None = None

from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class Context(BaseModel):
    destination: str = Field(default="", max_length=100)
    days_count: int = Field(default=2, ge=1, le=31)
    start_date: str | None = None
    end_date: str | None = None
    date_mode: Literal["dates", "flex"] = "dates"
    title: str = Field(default="Chuyến đi của tôi", max_length=200)
    people_count: int = Field(default=1, ge=1, le=20)
    adult_count: int | None = Field(default=None, ge=0, le=20)
    child_count: int | None = Field(default=None, ge=0, le=20)
    infant_count: int | None = Field(default=None, ge=0, le=20)
    pet_count: int = Field(default=0, ge=0, le=20)
    activity_start_time: str | None = None
    activity_end_time: str | None = None
    budget: float | None = Field(default=None, ge=0, le=1_000_000_000)
    preferences: list[str] = Field(default_factory=list, max_length=20)
    idea_ids: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("start_date")
    @classmethod
    def valid_start_date(cls, value):
        return date.fromisoformat(value).isoformat() if value else None

    @field_validator("end_date")
    @classmethod
    def valid_end_date(cls, value):
        return date.fromisoformat(value).isoformat() if value else None

    @field_validator("activity_start_time", "activity_end_time")
    @classmethod
    def valid_activity_time(cls, value):
        if value is None:
            return value
        parsed = datetime.strptime(value, "%H:%M")
        if parsed.strftime("%H:%M") != value:
            raise ValueError("Giờ cần có định dạng HH:MM.")
        return value

    @model_validator(mode="after")
    def consistent_trip_dates(self):
        if self.date_mode == "flex":
            self.start_date = None
            self.end_date = None
        elif self.end_date:
            if not self.start_date or self.end_date < self.start_date:
                raise ValueError("Ngày kết thúc cần bằng hoặc sau ngày khởi hành.")
            expected_days = (date.fromisoformat(self.end_date) - date.fromisoformat(self.start_date)).days + 1
            if expected_days != self.days_count:
                raise ValueError("Số ngày chuyến đi không khớp khoảng ngày đã chọn.")
        if self.activity_start_time and self.activity_end_time:
            start = datetime.strptime(self.activity_start_time, "%H:%M")
            end = datetime.strptime(self.activity_end_time, "%H:%M")
            if end <= start:
                raise ValueError("Giờ kết thúc tham quan cần sau giờ bắt đầu.")
        return self


class ChatRequest(BaseModel):
    conversation_id: int = Field(default=1, ge=1, le=3)
    message: str = Field(min_length=1, max_length=1000)
    mode: Literal["discover", "planner"] = "discover"
    trip_id: str | None = Field(default=None, max_length=100)
    context: Context = Field(default_factory=Context)
    selected_poi_id: str | None = Field(default=None, max_length=100)


class ApplyRequest(BaseModel):
    conversation_id: int = Field(default=1, ge=1, le=3)
    mode: Literal["discover", "planner"] = "planner"
    trip_id: str = Field(min_length=1, max_length=100)
    draft_id: str = Field(min_length=1, max_length=100)
    alternative_id: str | None = Field(default=None, max_length=100)


class InTripPreviewRequest(BaseModel):
    trip_id: str = Field(min_length=1, max_length=100)
    action: Literal["stay_longer", "end_day_early", "postpone"]
    day_number: int = Field(ge=1, le=31)
    stop_id: str | None = Field(default=None, min_length=1, max_length=100)
    extra_minutes: int | None = Field(default=None, ge=15, le=360)

    @model_validator(mode="after")
    def valid_action_fields(self):
        if self.action in {"stay_longer", "postpone"} and not self.stop_id:
            raise ValueError("A stop is required for this in-trip action.")
        if self.action == "stay_longer" and self.extra_minutes is None:
            raise ValueError("Additional minutes are required to extend a visit.")
        if self.action != "stay_longer" and self.extra_minutes is not None:
            raise ValueError("Additional minutes only apply to a longer visit.")
        return self


class InTripReconcileRequest(BaseModel):
    trip_id: str = Field(min_length=1, max_length=100)

from datetime import date
from typing import Literal
from pydantic import BaseModel, Field, field_validator


class Context(BaseModel):
    destination: str = Field(default="", max_length=100)
    days_count: int = Field(default=2, ge=1, le=31)
    start_date: str | None = None
    title: str = Field(default="Chuyến đi của tôi", max_length=200)
    people_count: int = Field(default=1, ge=1, le=20)
    budget: float | None = Field(default=None, ge=0, le=1_000_000_000)
    preferences: list[str] = Field(default_factory=list, max_length=20)
    idea_ids: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("start_date")
    @classmethod
    def valid_start_date(cls, value):
        return date.fromisoformat(value).isoformat() if value else None


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

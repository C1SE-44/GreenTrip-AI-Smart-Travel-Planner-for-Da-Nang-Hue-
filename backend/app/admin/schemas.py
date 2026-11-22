from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AdminAuditLogItem(BaseModel):
    audit_id: str
    admin_user_id: str
    admin_email: str | None = None
    action: str
    target_table: str
    target_id: str
    changes_json: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class AdminOverviewResponse(BaseModel):
    total_pois: int
    active_pois: int
    inactive_pois: int
    total_users: int
    admin_users: int
    total_itineraries: int
    recent_audit_logs: list[AdminAuditLogItem] = Field(default_factory=list)


class AdminPoiItem(BaseModel):
    poi_id: str
    name: str
    city: str
    category: str
    address: str | None = None
    estimated_cost: float | None = None
    green_score: float | None = None
    is_active: bool
    image_url: str | None = None


class AdminPoiListResponse(BaseModel):
    items: list[AdminPoiItem] = Field(default_factory=list)
    total: int
    page: int
    limit: int
    total_pages: int


class AdminPoiPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None
    estimated_cost: float | None = Field(default=None, ge=0)
    green_score: float | None = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_non_empty_patch(self) -> "AdminPoiPatchRequest":
        if self.is_active is None and self.estimated_cost is None and self.green_score is None:
            raise ValueError("Cần cung cấp ít nhất một trường để cập nhật (is_active, estimated_cost hoặc green_score).")
        return self


class AdminPoiPatchResponse(BaseModel):
    poi: AdminPoiItem
    audit_id: str
    message: str

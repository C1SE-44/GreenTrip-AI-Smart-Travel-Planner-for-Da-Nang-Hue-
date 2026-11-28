from pydantic import BaseModel, ConfigDict, Field, field_validator


class EnvironmentalReviewWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trip_id: str = Field(min_length=1, max_length=100)
    stop_id: str = Field(min_length=1, max_length=100)
    cleanliness_waste: int | None = Field(default=None, ge=1, le=5, strict=True)
    single_use_plastic: int | None = Field(default=None, ge=1, le=5, strict=True)
    ecosystem_protection: int | None = Field(default=None, ge=1, le=5, strict=True)
    responsible_management: int | None = Field(default=None, ge=1, le=5, strict=True)
    comment: str | None = Field(default=None, max_length=500)
    expected_version: int | None = Field(default=None, ge=1)

    @field_validator("comment", mode="before")
    @classmethod
    def normalize_comment(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("Comment must be text.")
        cleaned = " ".join(value.split())
        return cleaned or None

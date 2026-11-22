from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^\+?[0-9]{9,15}$")
UserRole = Literal["USER", "ADMIN"]


class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name cannot be empty.")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format.")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if not PHONE_REGEX.match(v):
            raise ValueError("Invalid phone number format.")
        return v


class UserResponse(BaseModel):
    user_id: str
    full_name: str
    email: str
    phone: str | None = None
    role: str
    status: str
    created_at: datetime
    updated_at: datetime
    avatar_url: str | None = None
    has_password: bool | None = None


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("full_name", mode="before")
    @classmethod
    def validate_profile_full_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Full name cannot be empty.")
        if not isinstance(value, str):
            return value
        value = value.strip()
        if not value:
            raise ValueError("Full name cannot be empty.")
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_profile_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        value = value.strip()
        if not value:
            return None
        if len(value) > 20 or not PHONE_REGEX.fullmatch(value):
            raise ValueError("Invalid phone number format.")
        return value


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password", "confirm_password")
    @classmethod
    def validate_password_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be empty.")
        return value

    @field_validator("confirm_password")
    @classmethod
    def validate_password_confirmation(cls, value: str, info: ValidationInfo) -> str:
        new_password = info.data.get("new_password")
        if new_password is not None and value != new_password:
            raise ValueError("New password and confirmation do not match.")
        return value


class CheckEmailRequest(BaseModel):
    email: str = Field(..., max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format.")
        return v


class CheckEmailResponse(BaseModel):
    exists: bool
    email: str
    status: str | None = None


class SignupResponse(BaseModel):
    message: str
    user: UserResponse
    require_otp: bool = False
    otp_session_token: str | None = None
    access_token: str | None = None
    token_type: Literal["bearer"] = "bearer"


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format.")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=1)


class VerifyEmailResponse(BaseModel):
    message: str
    email: str


class ResendVerificationRequest(BaseModel):
    email: str = Field(..., max_length=255)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format.")
        return v


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., min_length=1, description="Google OAuth ID Token / Credential")


class GoogleLoginResponse(BaseModel):
    require_otp: bool = False
    email: str
    otp_session_token: str | None = None
    access_token: str | None = None
    token_type: Literal["bearer"] = "bearer"
    user: UserResponse | None = None
    message: str = "Đăng nhập Google thành công."


class VerifyOtpRequest(BaseModel):
    email: str = Field(..., max_length=255)
    otp_code: str = Field(..., min_length=6, max_length=6)
    otp_session_token: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format.")
        return v

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, v: str) -> str:
        v = v.strip()
        if not v.isdigit() or len(v) != 6:
            raise ValueError("Mã OTP phải bao gồm đúng 6 chữ số.")
        return v


class ResendOtpRequest(BaseModel):
    email: str = Field(..., max_length=255)
    otp_session_token: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_REGEX.match(v):
            raise ValueError("Invalid email format.")
        return v


class ResendOtpResponse(BaseModel):
    message: str
    email: str


from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
PHONE_REGEX = re.compile(r"^\+?[0-9]{9,15}$")


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


class SignupResponse(BaseModel):
    message: str
    user: UserResponse


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
    require_otp: bool = True
    email: str
    otp_session_token: str
    message: str = "Mã xác thực OTP đã được gửi tới email của bạn."


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


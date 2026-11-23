from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from psycopg.errors import UniqueViolation

from app.auth.email import send_otp_email, send_verification_email
from app.auth.avatar_storage import AvatarStorageError, delete_avatar, get_signed_avatar_url, upload_avatar
from app.auth.dependencies import get_current_user_id
from app.auth.password import hash_password, verify_password
from app.auth.schemas import (
    CheckEmailRequest,
    CheckEmailResponse,
    ChangePasswordRequest,
    GoogleLoginRequest,
    GoogleLoginResponse,
    LoginRequest,
    ProfileUpdateRequest,
    ResendOtpRequest,
    ResendOtpResponse,
    ResendVerificationRequest,
    SignupRequest,
    SignupResponse,
    TokenResponse,
    UserResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
    VerifyOtpRequest,
)
from app.auth.service import (
    AccountNotActive,
    AuthServiceUnavailable,
    authenticate_user,
    create_access_token,
    create_otp_session_token,
    create_verification_token,
    decode_access_token,
    generate_otp_code,
    verify_email_token,
    verify_google_token,
    verify_otp_session_token,
)
from app.db.postgres import get_connection


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


def _profile_response(
    user: tuple,
    avatar_path: str | None = None,
    avatar_url: str | None = None,
) -> UserResponse:
    if avatar_path and avatar_url is None:
        try:
            avatar_url = get_signed_avatar_url(avatar_path)
        except (AvatarStorageError, ValueError):
            # Profile data remains available if Storage has not been configured.
            avatar_url = None
    password_hash = user[8] if len(user) > 8 else None
    return UserResponse(
        user_id=str(user[0]),
        full_name=user[1],
        email=user[2],
        phone=user[3],
        role=user[4],
        status=user[5],
        created_at=user[6],
        updated_at=user[7],
        avatar_url=avatar_url,
        has_password=bool(password_hash),
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(authorization: str | None = Header(default=None)) -> UserResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu tiêu đề Authorization với mã Bearer token.",
        )
    token = authorization.split("Bearer ", 1)[1].strip()
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, full_name, email, phone, role, status, created_at, updated_at,
                           password_hash
                    FROM public.users
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                user = cursor.fetchone()
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Không tìm thấy thông tin người dùng.",
                    )

                avatar_path = None
                try:
                    cursor.execute(
                        "SELECT avatar_path FROM public.users WHERE user_id = %s",
                        (user_id,),
                    )
                    avatar_row = cursor.fetchone()
                    avatar_path = avatar_row[0] if avatar_row and len(avatar_row) == 1 else None
                except Exception:
                    # Migration 014 may be pending; preserve the existing /me contract.
                    connection.rollback()
                return _profile_response(user, avatar_path)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tải thông tin tài khoản lúc này.",
        ) from error


@router.patch("/me", response_model=UserResponse)
def update_current_user_profile(
    request: ProfileUpdateRequest,
    user_id: str = Depends(get_current_user_id),
) -> UserResponse:
    updates = request.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Provide at least one profile field to update.")

    set_clause = ", ".join(f"{field} = %s" for field in updates)
    values = list(updates.values()) + [user_id]
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE public.users
                    SET {set_clause}, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    RETURNING user_id, full_name, email, phone, role, status,
                              created_at, updated_at, password_hash
                    """,
                    tuple(values),
                )
                user = cursor.fetchone()
                if not user:
                    raise HTTPException(status_code=404, detail="User profile not found.")
                connection.commit()
                avatar_path = None
                try:
                    cursor.execute(
                        "SELECT avatar_path FROM public.users WHERE user_id = %s",
                        (user_id,),
                    )
                    avatar_row = cursor.fetchone()
                    avatar_path = avatar_row[0] if avatar_row and len(avatar_row) == 1 else None
                except Exception:
                    connection.rollback()
                return _profile_response(user, avatar_path)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail="Unable to update profile right now.") from error


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_current_user_password(
    request: ChangePasswordRequest,
    user_id: str = Depends(get_current_user_id),
) -> None:
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT password_hash FROM public.users WHERE user_id = %s",
                    (user_id,),
                )
                user = cursor.fetchone()
                if not user:
                    raise HTTPException(status_code=404, detail="User account not found.")
                current_hash = user[0]
                if not current_hash:
                    raise HTTPException(
                        status_code=409,
                        detail="This account uses Google sign-in and has no local password.",
                    )
                try:
                    password_matches = verify_password(request.current_password, current_hash)
                except Exception:
                    password_matches = False
                if not password_matches:
                    raise HTTPException(status_code=400, detail="Current password is incorrect.")

                cursor.execute(
                    """
                    UPDATE public.users
                    SET password_hash = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (hash_password(request.new_password), user_id),
                )
                connection.commit()
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail="Unable to change password right now.") from error


AVATAR_MAX_BYTES = 5 * 1024 * 1024
AVATAR_TYPES = {
    "image/jpeg": ("jpg", lambda content: content.startswith(b"\xff\xd8\xff")),
    "image/png": ("png", lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (
        "webp",
        lambda content: len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP",
    ),
}


@router.put("/me/avatar", response_model=UserResponse)
async def update_current_user_avatar(
    request: Request,
    user_id: str = Depends(get_current_user_id),
) -> UserResponse:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    image_type = AVATAR_TYPES.get(content_type)
    if image_type is None:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, or WebP image.")

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Avatar image must be 5 MB or smaller.")

    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > AVATAR_MAX_BYTES:
            raise HTTPException(status_code=413, detail="Avatar image must be 5 MB or smaller.")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content or not image_type[1](content):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image of the selected type.")

    object_path = f"{user_id}/{uuid4().hex}.{image_type[0]}"
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                try:
                    cursor.execute(
                        "SELECT avatar_path FROM public.users WHERE user_id = %s",
                        (user_id,),
                    )
                    existing = cursor.fetchone()
                except Exception as error:
                    connection.rollback()
                    raise HTTPException(
                        status_code=503,
                        detail="Avatar support is not ready. Apply migration 014 first.",
                    ) from error
                if not existing:
                    raise HTTPException(status_code=404, detail="User account not found.")
                old_path = existing[0]

                try:
                    upload_avatar(object_path, content, content_type)
                except AvatarStorageError as error:
                    raise HTTPException(
                        status_code=error.status_code,
                        detail=error.public_detail,
                    ) from error
                try:
                    avatar_url = get_signed_avatar_url(object_path)
                except (AvatarStorageError, ValueError) as error:
                    try:
                        delete_avatar(object_path)
                    except (AvatarStorageError, ValueError):
                        pass
                    if isinstance(error, AvatarStorageError):
                        raise HTTPException(
                            status_code=error.status_code,
                            detail=error.public_detail,
                        ) from error
                    raise HTTPException(
                        status_code=503,
                        detail="Avatar storage cannot create a private display URL.",
                    ) from error

                try:
                    cursor.execute(
                        """
                        UPDATE public.users
                        SET avatar_path = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE user_id = %s
                        RETURNING user_id, full_name, email, phone, role, status,
                                  created_at, updated_at, password_hash
                        """,
                        (object_path, user_id),
                    )
                    user = cursor.fetchone()
                    if not user:
                        raise HTTPException(status_code=404, detail="User account not found.")
                    connection.commit()
                except Exception:
                    connection.rollback()
                    try:
                        delete_avatar(object_path)
                    except (AvatarStorageError, ValueError):
                        pass
                    raise

        if old_path:
            try:
                delete_avatar(old_path)
            except (AvatarStorageError, ValueError):
                pass
        return _profile_response(user, object_path, avatar_url)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail="Unable to update avatar right now.") from error


@router.post("/check-email", response_model=CheckEmailResponse)
def check_email(request: CheckEmailRequest) -> CheckEmailResponse:
    email = request.email.strip().lower()
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT status
                    FROM public.users
                    WHERE LOWER(email) = %s
                    """,
                    (email,),
                )
                user = cursor.fetchone()
                if user:
                    return CheckEmailResponse(exists=True, email=email, status=user[0])
                return CheckEmailResponse(exists=False, email=email, status=None)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể kiểm tra email lúc này.",
        ) from error


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest) -> TokenResponse:
    try:
        user_id = authenticate_user(request.email, request.password)
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        access_token = create_access_token(user_id)
    except AccountNotActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email của bạn để kích hoạt tài khoản.",
        )
    except AuthServiceUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from None

    return TokenResponse(access_token=access_token)



def _as_utc_datetime(value: datetime | str) -> datetime:
    """Coerce SQLite ISO strings and naive datetimes to timezone-aware UTC."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.post(
    "/signup",
    status_code=status.HTTP_201_CREATED,
    response_model=SignupResponse,
)
def signup(request: SignupRequest) -> dict:
    email = request.email.strip().lower()
    password_hash = hash_password(request.password)

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, status
                    FROM public.users
                    WHERE LOWER(email) = %s
                    """,
                    (email,),
                )

                existing_user = cursor.fetchone()

                if existing_user:
                    # ponytail: never overwrite/auto-activate INACTIVE accounts during signup
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Email is already registered.",
                    )

                try:
                    cursor.execute(
                        """
                        INSERT INTO public.users (
                            full_name,
                            email,
                            phone,
                            password_hash,
                            status
                        )
                        VALUES (%s, %s, %s, %s, 'ACTIVE')
                        RETURNING
                            user_id,
                            full_name,
                            email,
                            phone,
                            role,
                            status,
                            created_at,
                            updated_at
                        """,
                        (
                            request.full_name,
                            email,
                            request.phone,
                            password_hash,
                        ),
                    )

                    user = cursor.fetchone()
                    connection.commit()

                    access_token = create_access_token(str(user[0]))
                    # Dispatch verification email (for notification & verification)
                    try:
                        token = create_verification_token(email)
                        send_verification_email(email, request.full_name, token)
                    except Exception:
                        pass

                    return {
                        "message": "User registered successfully.",
                        "user": {
                            "user_id": str(user[0]),
                            "full_name": user[1],
                            "email": user[2],
                            "phone": user[3],
                            "role": user[4],
                            "status": user[5],
                            "created_at": user[6],
                            "updated_at": user[7],
                        },
                        "require_otp": False,
                        "access_token": access_token,
                        "token_type": "bearer",
                    }
                except UniqueViolation:
                    connection.rollback()
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Email is already registered.",
                    )

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create user.",
        ) from error


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(request: VerifyEmailRequest) -> VerifyEmailResponse:
    try:
        email = verify_email_token(request.token)
    except AuthServiceUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ xác thực tạm thời không khả dụng.",
        ) from None

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Liên kết xác nhận không hợp lệ hoặc đã hết hạn.",
        )

    normalized_email = email.strip().lower()
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, status
                    FROM public.users
                    WHERE LOWER(email) = %s
                    """,
                    (normalized_email,),
                )
                user = cursor.fetchone()

                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Không tìm thấy tài khoản với email này.",
                    )

                user_id, current_status = user[0], user[1]
                if current_status == "ACTIVE":
                    return VerifyEmailResponse(
                        message="Tài khoản của bạn đã được kích hoạt trước đó.",
                        email=email,
                    )

                cursor.execute(
                    """
                    UPDATE public.users
                    SET status = 'ACTIVE',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                connection.commit()

                return VerifyEmailResponse(
                    message="Kích hoạt tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.",
                    email=email,
                )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xác thực tài khoản lúc này.",
        ) from error


@router.post("/resend-verification", response_model=VerifyEmailResponse)
def resend_verification(request: ResendVerificationRequest) -> VerifyEmailResponse:
    email = request.email.strip().lower()
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, full_name, status
                    FROM public.users
                    WHERE LOWER(email) = %s
                    """,
                    (email,),
                )
                user = cursor.fetchone()

                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Không tìm thấy tài khoản với email này.",
                    )

                user_id, full_name, current_status = user[0], user[1], user[2]
                if current_status == "ACTIVE":
                    return VerifyEmailResponse(
                        message="Tài khoản của bạn đã được kích hoạt trước đó.",
                        email=request.email,
                    )

                token = create_verification_token(request.email)
                send_verification_email(request.email, full_name, token)

                return VerifyEmailResponse(
                    message="Email xác nhận mới đã được gửi tới hộp thư của bạn.",
                    email=request.email,
                )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể gửi lại email xác nhận.",
        ) from error


@router.post("/google", response_model=GoogleLoginResponse)
def google_login(request: GoogleLoginRequest) -> GoogleLoginResponse:
    try:
        google_user = verify_google_token(request.credential)
    except AuthServiceUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if not google_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google ID token không hợp lệ hoặc đã hết hạn.",
        )

    email = google_user["email"].strip().lower()
    full_name = google_user["full_name"]

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, full_name, email, phone, role, status, created_at, updated_at
                    FROM public.users
                    WHERE LOWER(email) = %s
                    """,
                    (email,),
                )
                user = cursor.fetchone()

                if user:
                    user_id = user[0]
                    if user[5] != "ACTIVE":
                        cursor.execute(
                            """
                            UPDATE public.users
                            SET status = 'ACTIVE',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE user_id = %s
                            RETURNING user_id, full_name, email, phone, role, status, created_at, updated_at
                            """,
                            (user_id,),
                        )
                        user = cursor.fetchone()
                        connection.commit()
                else:
                    cursor.execute(
                        """
                        INSERT INTO public.users (
                            full_name,
                            email,
                            role,
                            status
                        )
                        VALUES (%s, %s, 'USER', 'ACTIVE')
                        RETURNING user_id, full_name, email, phone, role, status, created_at, updated_at
                        """,
                        (full_name, email),
                    )
                    user = cursor.fetchone()
                    connection.commit()
                    user_id = user[0]

        user_id = str(user[0])
        now = datetime.now(timezone.utc)
        full_name_val = user[1] if len(user) > 1 else full_name
        email_val = user[2] if len(user) > 2 else email
        phone_val = user[3] if len(user) > 3 else None
        role_val = user[4] if len(user) > 4 else "USER"
        status_val = user[5] if len(user) > 5 else "ACTIVE"
        created_at_val = user[6] if len(user) > 6 else now
        updated_at_val = user[7] if len(user) > 7 else now

        access_token = create_access_token(user_id)
        user_resp = UserResponse(
            user_id=user_id,
            full_name=full_name_val,
            email=email_val,
            phone=phone_val,
            role=role_val,
            status=status_val,
            created_at=created_at_val,
            updated_at=updated_at_val,
        )

        return GoogleLoginResponse(
            require_otp=False,
            email=email,
            access_token=access_token,
            token_type="bearer",
            user=user_resp,
            message="Đăng nhập Google thành công.",
        )

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xử lý đăng nhập Google lúc này.",
        ) from error


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(request: VerifyOtpRequest) -> TokenResponse:
    session = verify_otp_session_token(request.otp_session_token)
    if not session or session["email"].lower() != request.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, otp_code, attempts, expires_at, is_used
                    FROM public.email_otps
                    WHERE email = %s AND purpose IN ('GOOGLE_2FA', 'SIGNUP_OTP') AND is_used = FALSE
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (request.email.lower(),),
                )
                otp_record = cursor.fetchone()
                if not otp_record:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Không tìm thấy mã OTP hợp lệ hoặc mã đã được sử dụng. Vui lòng yêu cầu mã mới.",
                    )

                otp_id, expected_code, attempts, expires_at, is_used = otp_record

                if attempts >= 5:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Mã OTP đã bị khóa do nhập sai quá 5 lần. Vui lòng bấm gửi lại mã mới.",
                    )

                now = datetime.now(timezone.utc)
                if _as_utc_datetime(expires_at) < now:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Mã OTP đã hết hạn. Vui lòng bấm gửi lại mã mới.",
                    )

                if expected_code != request.otp_code:
                    cursor.execute(
                        """
                        UPDATE public.email_otps
                        SET attempts = attempts + 1
                        WHERE id = %s
                        """,
                        (otp_id,),
                    )
                    connection.commit()
                    remaining = 4 - attempts
                    detail_msg = (
                        f"Mã OTP không chính xác. Bạn còn {remaining} lần thử."
                        if remaining > 0
                        else "Mã OTP không chính xác. Bạn đã hết số lần thử, vui lòng gửi lại mã mới."
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=detail_msg,
                    )

                # Correct OTP: Mark as used and activate user
                cursor.execute(
                    """
                    UPDATE public.email_otps
                    SET is_used = TRUE
                    WHERE id = %s
                    """,
                    (otp_id,),
                )
                cursor.execute(
                    """
                    UPDATE public.users
                    SET status = 'ACTIVE',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = %s
                    """,
                    (session["user_id"],),
                )
                connection.commit()

        access_token = create_access_token(session["user_id"])
        return TokenResponse(access_token=access_token)

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xác thực mã OTP lúc này.",
        ) from error


@router.post("/resend-otp", response_model=ResendOtpResponse)
def resend_otp(request: ResendOtpRequest) -> ResendOtpResponse:
    session = verify_otp_session_token(request.otp_session_token)
    if not session or session["email"].lower() != request.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phiên xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT created_at, purpose
                    FROM public.email_otps
                    WHERE email = %s AND purpose IN ('GOOGLE_2FA', 'SIGNUP_OTP')
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (request.email.lower(),),
                )
                last_otp = cursor.fetchone()
                last_purpose = 'SIGNUP_OTP'
                if last_otp:
                    last_created = last_otp[0]
                    if len(last_otp) > 1 and last_otp[1]:
                        last_purpose = last_otp[1]
                    diff_sec = (datetime.now(timezone.utc) - _as_utc_datetime(last_created)).total_seconds()
                    if diff_sec < 60:
                        wait_time = int(60 - diff_sec)
                        raise HTTPException(
                            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                            detail=f"Vui lòng đợi thêm {wait_time} giây trước khi yêu cầu gửi lại mã OTP.",
                        )

                cursor.execute(
                    """
                    SELECT full_name
                    FROM public.users
                    WHERE email = %s
                    """,
                    (request.email.lower(),),
                )
                user_row = cursor.fetchone()
                full_name = user_row[0] if user_row else request.email.split("@")[0]

                otp_code = generate_otp_code()
                expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
                cursor.execute(
                    """
                    INSERT INTO public.email_otps (
                        email,
                        otp_code,
                        purpose,
                        expires_at
                    )
                    VALUES (%s, %s, %s, %s)
                    """,
                    (request.email.strip().lower(), otp_code, last_purpose, expires_at),
                )
                connection.commit()

        try:
            send_otp_email(request.email.lower(), full_name, otp_code)
        except Exception:
            pass

        return ResendOtpResponse(
            message="Mã OTP mới gồm 6 chữ số đã được gửi tới email của bạn.",
            email=request.email,
        )

    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể gửi lại mã OTP lúc này.",
        ) from error




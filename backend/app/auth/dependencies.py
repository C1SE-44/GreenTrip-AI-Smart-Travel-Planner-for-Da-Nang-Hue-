from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status

from app.auth.schemas import UserRole
from app.auth.service import AuthServiceUnavailable, decode_access_token
from app.db.postgres import get_connection


@dataclass(frozen=True)
class AuthenticatedUser:
    """Verified user principal loaded fresh from the database on each protected request."""

    user_id: str
    email: str
    full_name: str
    role: UserRole
    status: str


def _normalize_role(raw_role: object) -> UserRole:
    return "ADMIN" if isinstance(raw_role, str) and raw_role.strip().upper() == "ADMIN" else "USER"


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Return the verified account ID from GreenTrip's existing Bearer JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu tiêu đề Authorization với mã Bearer token.",
        )

    try:
        user_id = decode_access_token(authorization.split("Bearer ", 1)[1].strip())
    except AuthServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dịch vụ xác thực tạm thời không khả dụng.",
        ) from exc

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        )
    return user_id


def get_current_user(user_id: str = Depends(get_current_user_id)) -> AuthenticatedUser:
    """Load the authenticated user's authoritative role and active status directly from DB."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, email, full_name, role, status
                    FROM public.users
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                row = cursor.fetchone()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể xác minh quyền tài khoản lúc này.",
        ) from exc

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản không tồn tại hoặc phiên đăng nhập đã thu hồi.",
        )

    status_val = str(row[4] or "").strip().upper()
    if status_val != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản hiện không ở trạng thái hoạt động.",
        )

    return AuthenticatedUser(
        user_id=str(row[0]),
        email=str(row[1]),
        full_name=str(row[2] or ""),
        role=_normalize_role(row[3]),
        status=status_val,
    )


def require_roles(*allowed_roles: UserRole) -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    """Dependency factory enforcing RBAC role authorization with HTTP 403 Forbidden."""
    allowed_set = frozenset(allowed_roles)

    def _check_role(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if current_user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền quản trị viên để truy cập khu vực này.",
            )
        return current_user

    return _check_role


require_admin = require_roles("ADMIN")

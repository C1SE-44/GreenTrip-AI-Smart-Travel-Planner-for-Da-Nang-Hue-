from fastapi import Header, HTTPException, status

from app.auth.service import decode_access_token


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """Return the verified account ID from GreenTrip's existing Bearer JWT."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Yêu cầu tiêu đề Authorization với mã Bearer token.",
        )

    user_id = decode_access_token(authorization.split("Bearer ", 1)[1].strip())
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        )
    return user_id

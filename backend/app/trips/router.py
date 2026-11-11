from collections.abc import Generator
from fastapi import APIRouter, Depends, Header, HTTPException, status
from psycopg import Connection

from app.auth.service import decode_access_token
from app.db.postgres import get_connection
from app.trips.itinerary_repository import get_itinerary, save_itinerary
from app.trips.schemas import (
    CopilotChatRequest,
    CopilotChatResponse,
    TripItineraryResponse,
    TripItinerarySyncRequest,
    TripParametersRequest,
    TripParametersResponse,
)
from app.trips.service import (
    process_copilot_chat,
    validate_and_process_trip_parameters,
)

router = APIRouter(prefix="/trips", tags=["Trip Planner"])


def _optional_user_id(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ.")
    user_id = decode_access_token(authorization.split("Bearer ", 1)[1].strip())
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đăng nhập không hợp lệ.")
    return user_id


def get_trips_connection() -> Generator[Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
    finally:
        if hasattr(conn, "close"):
            conn.close()


@router.get("/{trip_id}/itinerary", response_model=TripItineraryResponse)
def read_trip_itinerary(
    trip_id: str,
    authorization: str | None = Header(default=None),
) -> TripItineraryResponse:
    itinerary = get_itinerary(trip_id, _optional_user_id(authorization))
    if itinerary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chưa có lịch trình được lưu.")
    return itinerary


@router.put("/{trip_id}/itinerary", response_model=TripItineraryResponse)
def write_trip_itinerary(
    trip_id: str,
    payload: TripItinerarySyncRequest,
    authorization: str | None = Header(default=None),
) -> TripItineraryResponse:
    if trip_id != payload.trip_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mã chuyến đi không khớp.")
    return save_itinerary(payload, _optional_user_id(authorization))


@router.post(
    "/validate-parameters",
    response_model=TripParametersResponse,
    status_code=status.HTTP_200_OK,
    summary="Xác thực thông số chuyến đi (Destination, Days, Budget, Travelers)",
    description="Kiểm tra tính hợp lệ và khả thi của các thông số hành trình du lịch Đà Nẵng - Huế trước khi tạo lịch trình.",
)
def validate_trip_parameters(payload: TripParametersRequest) -> TripParametersResponse:
    validated_data = validate_and_process_trip_parameters(payload)
    return TripParametersResponse(
        valid=True,
        message="Thông số chuyến đi hợp lệ và sẵn sàng để tạo lịch trình.",
        data=validated_data,
    )


@router.post(
    "/copilot/chat",
    response_model=CopilotChatResponse,
    status_code=status.HTTP_200_OK,
    summary="In-Planner AI Travel Copilot Chat (PB14)",
    description="Trợ lý du lịch AI nhận ngữ cảnh chuyến đi hiện tại để tư vấn và xử lý đổi quán chay, gợi ý tránh mưa.",
)
def copilot_chat(
    payload: CopilotChatRequest,
    connection: Connection = Depends(get_trips_connection),
) -> CopilotChatResponse:
    try:
        return process_copilot_chat(payload, connection)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi xử lý yêu cầu Copilot: {str(exc)}",
        ) from exc

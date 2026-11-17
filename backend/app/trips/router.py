from collections.abc import Generator
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection
from app.db.postgres import get_connection
from app.trips.schemas import CopilotChatRequest, CopilotChatResponse
from app.auth.dependencies import get_current_user_id
from app.trips.itinerary_repository import get_itinerary, save_itinerary
from app.trips.schedule_validation import validate_schedule_changes
from app.trips.schemas import TripItineraryResponse, TripItinerarySyncRequest, TripParametersRequest, TripParametersResponse
from app.trips.service import process_copilot_chat, validate_and_process_trip_parameters

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trips", tags=["Trip Planner"])


@router.get("/{trip_id}/itinerary", response_model=TripItineraryResponse)
def read_trip_itinerary(
    trip_id: str,
    user_id: str = Depends(get_current_user_id),
) -> TripItineraryResponse:
    itinerary = get_itinerary(trip_id, user_id)
    if itinerary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chưa có lịch trình được lưu.")
    return itinerary


@router.put("/{trip_id}/itinerary", response_model=TripItineraryResponse)
def write_trip_itinerary(
    trip_id: str,
    payload: TripItinerarySyncRequest,
    user_id: str = Depends(get_current_user_id),
) -> TripItineraryResponse:
    if trip_id != payload.trip_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mã chuyến đi không khớp.")
    previous = get_itinerary(trip_id, user_id)
    validate_schedule_changes(payload, previous)
    return save_itinerary(payload, user_id)


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


def get_trips_connection() -> Generator[Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
    finally:
        if hasattr(conn, "close"):
            conn.close()


@router.post(
    "/copilot/chat",
    response_model=CopilotChatResponse,
    status_code=status.HTTP_200_OK,
    summary="In-Planner AI Travel Copilot Chat (PB14)",
    description="Trợ lý du lịch AI nhận ngữ cảnh chuyến đi hiện tại để tư vấn và xử lý đổi quán chay, gợi ý tránh mưa.",
)
def copilot_chat(
    payload: CopilotChatRequest,
    _user_id: str = Depends(get_current_user_id),
    connection: Connection = Depends(get_trips_connection),
) -> CopilotChatResponse:
    try:
        return process_copilot_chat(payload, connection)
    except Exception as exc:
        logger.exception("Failed to process Copilot chat request")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xử lý yêu cầu Copilot lúc này.",
        ) from exc

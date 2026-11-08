from collections.abc import Generator
from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from app.db.postgres import get_connection
from app.trips.schemas import (
    CopilotChatRequest,
    CopilotChatResponse,
    TripParametersRequest,
    TripParametersResponse,
)
from app.trips.service import (
    process_copilot_chat,
    validate_and_process_trip_parameters,
)

router = APIRouter(prefix="/trips", tags=["Trip Planner"])


def get_trips_connection() -> Generator[Connection, None, None]:
    conn = get_connection()
    try:
        yield conn
    finally:
        if hasattr(conn, "close"):
            conn.close()


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

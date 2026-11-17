from collections.abc import Generator
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from psycopg import Connection

from app.auth.dependencies import get_current_user_id
from app.auth.service import decode_access_token
from app.db.postgres import get_connection
from app.trips.chat_history_repository import (
    append_chat_messages,
    clear_conversation_history,
    load_conversation_history,
    mark_proposal_applied,
    mark_proposal_dismissed,
    verify_trip_access,
)
from app.trips.itinerary_repository import get_itinerary, save_itinerary
from app.trips.schemas import (
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotHistoryResponse,
    TripItineraryResponse,
    TripItinerarySyncRequest,
    TripParametersRequest,
    TripParametersResponse,
)
from app.trips.service import (
    process_copilot_chat,
    validate_and_process_trip_parameters,
)

logger = logging.getLogger(__name__)
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
    description="Trợ lý du lịch AI yêu cầu đăng nhập, kiểm tra quyền sở hữu chuyến đi, lưu lịch sử hội thoại và tư vấn lịch trình.",
)
def copilot_chat(
    payload: CopilotChatRequest,
    current_user_id: str = Depends(get_current_user_id),
    connection: Connection = Depends(get_trips_connection),
) -> CopilotChatResponse:
    trip_id = payload.trip_context.trip_id
    saved_itinerary = verify_trip_access(trip_id, current_user_id)

    if saved_itinerary:
        if not payload.trip_context.current_itinerary_state:
            payload.trip_context.current_itinerary_state = saved_itinerary.get("days") or []
        if (
            "destination" not in payload.trip_context.model_fields_set
            and saved_itinerary.get("destination")
        ):
            payload.trip_context.destination = str(saved_itinerary["destination"])
        if (
            "days_count" not in payload.trip_context.model_fields_set
            and saved_itinerary.get("days_count")
        ):
            payload.trip_context.days_count = int(saved_itinerary["days_count"])
        if not payload.trip_context.start_date and saved_itinerary.get("start_date"):
            payload.trip_context.start_date = str(saved_itinerary["start_date"])

    persisted = load_conversation_history(current_user_id, trip_id, limit=20)
    if not payload.trip_context.conversation_history and persisted["messages"]:
        payload.trip_context.conversation_history = [
            {"role": m["sender"], "content": m["content"]}
            for m in persisted["messages"][-8:]
        ]
    if persisted["trip_memory"]:
        merged_mem = dict(persisted["trip_memory"])
        merged_mem.update(payload.trip_context.trip_memory or {})
        payload.trip_context.trip_memory = merged_mem
    if persisted["active_constraints"]:
        payload.trip_context.active_constraints = list(
            dict.fromkeys([*persisted["active_constraints"], *(payload.trip_context.active_constraints or [])])
        )

    try:
        response = process_copilot_chat(payload, connection)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to process Copilot chat request")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể xử lý yêu cầu Copilot lúc này.",
        ) from exc

    assistant_meta = {
        "intent": response.intent,
        "intent_category": response.intent_category,
        "action_type": response.action_type,
        "target_slot": response.target_slot,
        "requires_confirmation": response.requires_confirmation,
        "suggested_pois": [p.model_dump() for p in (response.suggested_pois or [])],
        "proposed_itinerary_state": response.updated_itinerary_state,
        "proposed_days_count": response.updated_days_count,
        "proposed_destination": response.updated_destination,
        "mutation_summary": response.mutation_summary,
        "budget_status": response.budget_status,
        "route_metrics": response.route_metrics,
        "fatigue_metrics": response.fatigue_metrics,
        "avoid_notice": response.avoid_notice,
        "green_impact_summary": response.green_impact_summary,
        "budget_impact_summary": response.budget_impact_summary,
        "next_suggested_prompts": response.next_suggested_prompts,
        "reasoning_trace": response.reasoning_trace,
        "fact_check_warning": response.fact_check_warning,
        "applied": False,
    }
    inserted_ids = append_chat_messages(
        user_id=current_user_id,
        trip_id=trip_id,
        title=payload.trip_context.destination or "Trò chuyện GreenTrip",
        trip_memory=response.trip_memory,
        active_constraints=response.detected_constraints,
        messages=[
            {"sender": "user", "content": payload.message, "metadata": {}},
            {"sender": "assistant", "content": response.reply_text, "metadata": assistant_meta},
        ],
    )
    if len(inserted_ids) >= 2:
        response.message_id = inserted_ids[1]

    return response


@router.get(
    "/copilot/history",
    response_model=CopilotHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Lấy lịch sử hội thoại Copilot theo tài khoản và chuyến đi",
)
def get_copilot_history(
    trip_id: str = Query(default="ideation", max_length=100),
    current_user_id: str = Depends(get_current_user_id),
) -> CopilotHistoryResponse:
    verify_trip_access(trip_id, current_user_id)
    data = load_conversation_history(current_user_id, trip_id, strict=True)
    return CopilotHistoryResponse(**data)


@router.delete(
    "/copilot/history",
    status_code=status.HTTP_200_OK,
    summary="Xóa lịch sử hội thoại Copilot cho chuyến đi",
)
def delete_copilot_history(
    trip_id: str = Query(default="ideation", max_length=100),
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    verify_trip_access(trip_id, current_user_id)
    clear_conversation_history(current_user_id, trip_id)
    return {"success": True, "trip_id": trip_id}


@router.post(
    "/copilot/history/{message_id}/applied",
    status_code=status.HTTP_200_OK,
    summary="Đánh dấu đề xuất chỉnh sửa lịch trình đã được người dùng xác nhận áp dụng",
)
def mark_copilot_proposal_applied(
    message_id: str,
    trip_id: str = Query(default="ideation", max_length=100),
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    verify_trip_access(trip_id, current_user_id)
    outcome = mark_proposal_applied(current_user_id, trip_id, message_id)
    if outcome == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đề xuất lịch trình cần xác nhận.",
        )
    if outcome == "already_applied":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đề xuất lịch trình này đã được áp dụng trước đó.",
        )
    if outcome == "stale_or_dismissed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đề xuất lịch trình này đã bị bỏ qua hoặc đã có đề xuất mới thay thế.",
        )
    return {"success": True, "message_id": message_id}


@router.post(
    "/copilot/history/{message_id}/dismissed",
    status_code=status.HTTP_200_OK,
    summary="Đánh dấu đề xuất chỉnh sửa lịch trình đã bị người dùng bỏ qua",
)
def mark_copilot_proposal_dismissed(
    message_id: str,
    trip_id: str = Query(default="ideation", max_length=100),
    current_user_id: str = Depends(get_current_user_id),
) -> dict[str, Any]:
    verify_trip_access(trip_id, current_user_id)
    outcome = mark_proposal_dismissed(current_user_id, trip_id, message_id)
    if outcome == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đề xuất lịch trình.",
        )
    if outcome == "already_applied":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Đề xuất lịch trình này đã được áp dụng.",
        )
    return {"success": True, "message_id": message_id}

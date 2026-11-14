from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth.dependencies import get_current_user_id
from app.trips.itinerary_repository import (
    delete_user_itinerary,
    get_itinerary_with_ownership,
    list_user_itineraries,
    save_itinerary,
    update_itinerary_metadata,
)
from app.trips.pdf_service import generate_itinerary_pdf, sanitize_pdf_filename
from app.trips.schemas import (
    DeleteTripResponse,
    MyTripSummaryResponse,
    TripItineraryResponse,
    TripItinerarySyncRequest,
    UpdateTripRequest,
)

router = APIRouter(tags=["My Trips"])


@router.post(
    "",
    response_model=TripItineraryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Lưu chuyến đi vào tài khoản của tôi",
    description="Lưu hoặc cập nhật một hành trình du lịch từ Trip Planner vào tài khoản của người dùng đang đăng nhập.",
)
def save_my_trip(
    payload: TripItinerarySyncRequest,
    current_user_id: str = Depends(get_current_user_id),
) -> TripItineraryResponse:
    return save_itinerary(payload, user_id=current_user_id)


@router.get(
    "",
    response_model=list[MyTripSummaryResponse],
    status_code=status.HTTP_200_OK,
    summary="Lấy danh sách chuyến đi của tôi",
    description="Trả về toàn bộ danh sách các chuyến đi do người dùng đang đăng nhập tạo, sắp xếp theo thời gian cập nhật mới nhất.",
)
def get_my_trips(
    current_user_id: str = Depends(get_current_user_id),
) -> list[MyTripSummaryResponse]:
    return list_user_itineraries(user_id=current_user_id)


@router.get(
    "/{trip_id}",
    response_model=TripItineraryResponse,
    status_code=status.HTTP_200_OK,
    summary="Xem chi tiết chuyến đi của tôi",
    description="Lấy thông tin chi tiết đầy đủ của chuyến đi bao gồm danh sách các ngày và điểm dừng theo đúng thứ tự ghé thăm.",
)
def get_my_trip_details(
    trip_id: str,
    current_user_id: str = Depends(get_current_user_id),
) -> TripItineraryResponse:
    return get_itinerary_with_ownership(trip_id=trip_id, user_id=current_user_id)


@router.patch(
    "/{trip_id}",
    response_model=TripItineraryResponse,
    status_code=status.HTTP_200_OK,
    summary="Cập nhật thông tin cơ bản của chuyến đi",
    description="Cho phép chỉnh sửa tiêu đề, ngày khởi hành hoặc điểm đến của chuyến đi mà không làm xáo trộn cấu trúc các điểm dừng.",
)
def update_my_trip(
    trip_id: str,
    payload: UpdateTripRequest,
    current_user_id: str = Depends(get_current_user_id),
) -> TripItineraryResponse:
    return update_itinerary_metadata(
        trip_id=trip_id,
        user_id=current_user_id,
        title=payload.title,
        start_date=payload.start_date,
        destination=payload.destination,
    )


@router.delete(
    "/{trip_id}",
    response_model=DeleteTripResponse,
    status_code=status.HTTP_200_OK,
    summary="Xóa chuyến đi của tôi",
    description="Xóa vĩnh viễn chuyến đi cùng toàn bộ các ngày và điểm dừng thuộc chuyến đi sau khi đã kiểm tra quyền sở hữu.",
)
def delete_my_trip(
    trip_id: str,
    current_user_id: str = Depends(get_current_user_id),
) -> DeleteTripResponse:
    delete_user_itinerary(trip_id=trip_id, user_id=current_user_id)
    return DeleteTripResponse(
        success=True,
        message="Đã xóa chuyến đi thành công.",
        trip_id=trip_id,
    )


@router.get(
    "/{trip_id}/export",
    status_code=status.HTTP_200_OK,
    summary="Xuất lịch trình chuyến đi thành file PDF",
    description="Tạo và tải về file PDF chứa lịch trình du lịch xanh hoàn chỉnh, hỗ trợ tiếng Việt có dấu và phân chia theo từng ngày.",
)
def export_my_trip_pdf(
    trip_id: str,
    current_user_id: str = Depends(get_current_user_id),
) -> Response:
    itinerary = get_itinerary_with_ownership(trip_id=trip_id, user_id=current_user_id)
    pdf_bytes = generate_itinerary_pdf(itinerary)
    _, disposition_header = sanitize_pdf_filename(itinerary.title)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": disposition_header,
            "Content-Length": str(len(pdf_bytes)),
        },
    )

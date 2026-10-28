from fastapi import APIRouter, status
from app.trips.schemas import TripParametersRequest, TripParametersResponse
from app.trips.service import validate_and_process_trip_parameters

router = APIRouter(prefix="/trips", tags=["Trip Planner"])


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

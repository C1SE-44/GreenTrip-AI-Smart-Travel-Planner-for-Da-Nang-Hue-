from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user_id
from app.transport.schemas import TransportPreviewRequest, TransportPreviewResponse
from app.transport.service import build_transport_preview

router = APIRouter(prefix="/transport", tags=["Transport"])


@router.post("/preview", response_model=TransportPreviewResponse)
def preview_transport(
    payload: TransportPreviewRequest,
    _user_id: str = Depends(get_current_user_id),
) -> TransportPreviewResponse:
    """Calculate current road-route legs for one itinerary alternative without applying changes."""
    return build_transport_preview(payload)

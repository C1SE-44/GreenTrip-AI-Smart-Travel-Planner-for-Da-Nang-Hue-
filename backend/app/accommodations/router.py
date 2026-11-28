"""Authenticated, read-only endpoints for stay recommendations."""

from __future__ import annotations

import logging
from collections.abc import Generator

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

from app.accommodations.repository import PoiCatalogueAccommodationProvider
from app.accommodations.schemas import (
    AccommodationRecommendationRequest,
    AccommodationRecommendationResponse,
)
from app.accommodations.service import recommend_accommodations
from app.auth.dependencies import get_current_user_id
from app.db.postgres import get_connection

logger = logging.getLogger(__name__)
router = APIRouter()


def get_accommodation_connection() -> Generator[Connection | None, None, None]:
    try:
        connection = get_connection()
    except Exception:
        logger.exception("Could not open the accommodation catalogue connection.")
        yield None
        return
    try:
        yield connection
    finally:
        connection.close()


@router.post(
    "/recommendations",
    response_model=AccommodationRecommendationResponse,
    summary="Rank active stay records against a selected itinerary alternative",
)
def recommend_stays(
    request: AccommodationRecommendationRequest,
    _user_id: str = Depends(get_current_user_id),
    connection: Connection | None = Depends(get_accommodation_connection),
) -> AccommodationRecommendationResponse:
    try:
        provider = PoiCatalogueAccommodationProvider(connection)
        return recommend_accommodations(request, provider)
    except RuntimeError as error:
        logger.warning("Accommodation recommendation unavailable: %s", error)
        raise HTTPException(
            status_code=503,
            detail="Chưa thể đọc dữ liệu lưu trú lúc này. Itinerary của bạn vẫn được giữ nguyên.",
        ) from error
    except Exception as error:
        logger.exception("Failed to rank accommodation recommendations.")
        raise HTTPException(
            status_code=500,
            detail="Không thể tạo gợi ý lưu trú lúc này. Itinerary của bạn vẫn được giữ nguyên.",
        ) from error


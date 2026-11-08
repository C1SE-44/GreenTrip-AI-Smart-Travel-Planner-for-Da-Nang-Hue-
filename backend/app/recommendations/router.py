"""FastAPI routes for content-based POI recommendations."""

from __future__ import annotations

import logging
from collections.abc import Generator

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import Connection

from app.db.postgres import get_connection
from app.recommendations.schemas import RecommendationRequest, RecommendationResponse
from app.recommendations.service import get_poi_recommendations


logger = logging.getLogger(__name__)

router = APIRouter()


def get_recommendation_connection() -> Generator[Connection | None, None, None]:
    """Provide and close a PostgreSQL connection for one request.

    If configuration or connection setup is unavailable, yield ``None`` so
    the repository can raise an explicit database-availability error.
    """
    try:
        connection = get_connection()
    except Exception:
        logger.exception("Could not open the recommendation database connection.")
        yield None
        return

    try:
        yield connection
    finally:
        connection.close()


@router.post(
    "/poi",
    response_model=RecommendationResponse,
    status_code=status.HTTP_200_OK,
    summary="Recommend POIs based on user interests",
)
def recommend_pois(
    request: RecommendationRequest,
    connection: Connection | None = Depends(get_recommendation_connection),
) -> RecommendationResponse:
    """Return personalized, budget-filtered POI recommendations."""
    try:
        return get_poi_recommendations(request, connection)
    except Exception as exc:
        logger.exception("Failed to rank POI recommendations.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to generate POI recommendations.",
        ) from exc

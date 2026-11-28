from fastapi import APIRouter, Depends, Path

from app.auth.dependencies import get_current_user_id
from app.community_green.schemas import EnvironmentalReviewWrite
from app.community_green import service


router = APIRouter(prefix="/pois", tags=["Community Green Rating"])


@router.get("/{poi_id}/community-green-rating")
def get_community_rating(poi_id: str = Path(min_length=1, max_length=200)):
    return service.community_rating(poi_id)


@router.get("/{poi_id}/community-green-review")
def get_own_review(
    poi_id: str = Path(min_length=1, max_length=200),
    user_id: str = Depends(get_current_user_id),
):
    return service.own_review(poi_id, user_id)


@router.put("/{poi_id}/community-green-review")
def put_own_review(
    payload: EnvironmentalReviewWrite,
    poi_id: str = Path(min_length=1, max_length=200),
    user_id: str = Depends(get_current_user_id),
):
    return service.submit_review(poi_id, user_id, payload)

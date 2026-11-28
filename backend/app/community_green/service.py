from fastapi import HTTPException

from app.assistant import workspaces
from app.community_green import repository
from app.community_green.schemas import EnvironmentalReviewWrite
from app.pois.service import POIServiceUnavailable, get_poi_identity_status
from app.trips.itinerary_repository import get_itinerary_with_ownership


def active_poi(poi_id):
    try:
        poi = get_poi_identity_status(poi_id)
    except POIServiceUnavailable as error:
        raise HTTPException(503, "POI catalogue is temporarily unavailable.") from error
    if poi is None:
        raise HTTPException(404, "POI not found.")
    if poi.get("is_active") is False or str(poi.get("status") or "").upper() in {
        "INACTIVE", "CLOSED", "CLOSED_PERMANENTLY", "DELETED", "ARCHIVED",
        "DISABLED", "UNPUBLISHED", "DRAFT", "PENDING", "SUSPENDED", "REMOVED",
    }:
        raise HTTPException(404, "POI is not active.")
    return poi


def _require_self_reported_visit(poi_id, trip_id, stop_id, user_id):
    if trip_id.startswith("sample-"):
        raise HTTPException(403, "Sample trips cannot be used as visit references.")
    if workspaces.has_pending_in_trip_apply(trip_id, user_id):
        raise HTTPException(409, "Trip progress is being reconciled. Retry after it is complete.")
    workspace = workspaces.load_if_registered(trip_id, user_id)
    if not workspace:
        raise HTTPException(404, "A saved Trip Workspace is required to reference this visit.")
    visited = any(
        item.get("stopId") == stop_id
        and str(item.get("poiId") or "") == poi_id
        and item.get("status") == "VISITED"
        for item in (workspace.get("actualProgress") or {}).get("stops", [])
    )
    if not visited:
        raise HTTPException(403, "Mark this POI as visited in your trip before reviewing it.")
    itinerary = get_itinerary_with_ownership(trip_id, user_id)
    stop_exists = any(
        stop.stop_id == stop_id and str(stop.poi_id or "") == poi_id
        for day in itinerary.days
        for stop in day.stops
    )
    if not stop_exists:
        raise HTTPException(403, "The visit reference is not part of this trip's saved itinerary.")


def community_rating(poi_id):
    active_poi(poi_id)
    return repository.get_aggregate(poi_id)


def own_review(poi_id, user_id):
    active_poi(poi_id)
    return {"review": repository.get_own_review(poi_id, user_id)}


def submit_review(poi_id, user_id, payload: EnvironmentalReviewWrite):
    active_poi(poi_id)
    _require_self_reported_visit(poi_id, payload.trip_id, payload.stop_id, user_id)
    review = repository.save_review(poi_id, user_id, payload.stop_id, payload)
    return {"review": review, "aggregate": repository.get_aggregate(poi_id)}

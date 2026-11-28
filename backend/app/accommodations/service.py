"""Explainable accommodation ranking over itinerary city groups."""

from __future__ import annotations

from datetime import date
import hashlib
import json
import math
import unicodedata
from typing import Any

from app.accommodations.schemas import (
    AccommodationGroupRecommendations,
    AccommodationRecommendation,
    AccommodationRecommendationRequest,
    AccommodationRecommendationResponse,
    StayCandidate,
)
from app.accommodations.repository import AccommodationProvider


def _fold(value: Any) -> str:
    raw = unicodedata.normalize("NFKD", str(value or ""))
    return " ".join(
        "".join(char for char in raw if not unicodedata.combining(char))
        .casefold()
        .replace("đ", "d")
        .replace("_", " ")
        .replace("-", " ")
        .split()
    )


def _city_key(value: Any) -> str:
    folded = _fold(value)
    if folded in {"hue", "thua thien hue", "thanh pho hue", "hue city"}:
        return "hue"
    if folded in {"da nang", "danang", "thanh pho da nang", "da nang city"}:
        return "da nang"
    return folded


def _valid_coordinate(lat: Any, lng: Any) -> tuple[float, float] | None:
    try:
        latitude, longitude = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        return None
    return latitude, longitude


def _distance_km(left: tuple[float, float], right: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, left)
    lat2, lon2 = map(math.radians, right)
    d_lat, d_lon = lat2 - lat1, lon2 - lon1
    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def itinerary_signature(request: AccommodationRecommendationRequest) -> str:
    days = [
        {
            "day_number": day.day_number,
            "date": day.date,
            "stops": [
                {
                    "poi_id": stop.poi_id,
                    "city": stop.city,
                    "latitude": stop.latitude,
                    "longitude": stop.longitude,
                    "start_time": stop.start_time,
                    "end_time": stop.end_time,
                }
                for stop in day.stops if stop.poi_id
            ],
        }
        for day in sorted(request.itinerary.days, key=lambda item: item.day_number)
    ]
    raw = json.dumps(days, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _city_groups(request: AccommodationRecommendationRequest) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for day in sorted(request.itinerary.days, key=lambda item: item.day_number):
        day_cities: dict[str, dict[str, Any]] = {}
        for stop in day.stops:
            if not stop.poi_id or not stop.city or not stop.city.strip():
                continue
            key = _city_key(stop.city)
            entry = day_cities.setdefault(key, {"city": stop.city.strip(), "pois": []})
            if not any(existing["poi_id"] == stop.poi_id for existing in entry["pois"]):
                entry["pois"].append({
                    "poi_id": stop.poi_id,
                    "coordinate": _valid_coordinate(stop.latitude, stop.longitude),
                })
        for key, entry in day_cities.items():
            if groups and groups[-1]["key"] == key and day.day_number <= groups[-1]["day_numbers"][-1] + 1:
                group = groups[-1]
                if day.day_number not in group["day_numbers"]:
                    group["day_numbers"].append(day.day_number)
                known = {poi["poi_id"] for poi in group["pois"]}
                group["pois"].extend(poi for poi in entry["pois"] if poi["poi_id"] not in known)
            else:
                groups.append({
                    "key": key,
                    "city": entry["city"],
                    "day_numbers": [day.day_number],
                    "pois": entry["pois"],
                })

    if not groups and len(request.trip.destination.split("&")) == 1:
        # A single city destination can still identify the city when a manual itinerary
        # has no POI stops. It does not invent a neighborhood or a hotel.
        return []
    return groups


def _night_count(request: AccommodationRecommendationRequest, group: dict[str, Any]) -> tuple[int, str]:
    trip = request.trip
    status = "ESTIMATED"
    total_nights = max(0, trip.days_count - 1)
    if trip.date_mode == "dates" and trip.start_date and trip.end_date:
        total_nights = max(0, (date.fromisoformat(trip.end_date) - date.fromisoformat(trip.start_date)).days)
        status = "DATE_RANGE"
    if not group["day_numbers"]:
        return 0, "UNKNOWN"
    final_day = max(trip.days_count, max(group["day_numbers"]))
    nights = sum(1 for day_number in group["day_numbers"] if day_number < final_day)
    return min(nights, total_nights), status


def _trip_nights(request: AccommodationRecommendationRequest) -> int:
    if request.trip.date_mode == "dates" and request.trip.start_date and request.trip.end_date:
        return max(0, (date.fromisoformat(request.trip.end_date) - date.fromisoformat(request.trip.start_date)).days)
    return max(0, request.trip.days_count - 1)


def _group_id(group: dict[str, Any], index: int) -> str:
    return f"{group['key'].replace(' ', '-')}-{group['day_numbers'][0]}-{group['day_numbers'][-1]}-{index}"


def _tier_score(preference: str, raw_tier: Any) -> float | None:
    if preference == "any":
        return None
    tier = _fold(raw_tier)
    tier = {
        "$": "budget", "$$": "standard", "$$$": "luxury",
        "economy": "budget", "midrange": "standard", "mid range": "standard",
    }.get(tier, tier)
    if tier not in {"budget", "standard", "luxury"}:
        return None
    if tier == preference:
        return 100.0
    return 60.0 if {tier, preference} == {"budget", "standard"} or {tier, preference} == {"standard", "luxury"} else 25.0


def _rank_candidate(
    candidate: dict[str, Any],
    group: dict[str, Any],
    request: AccommodationRecommendationRequest,
    nights: int,
    room_count: int | None,
) -> AccommodationRecommendation:
    stay = StayCandidate.model_validate(candidate)
    poi_coordinates = [poi["coordinate"] for poi in group["pois"] if poi["coordinate"]]
    stay_coordinate = _valid_coordinate(stay.latitude, stay.longitude)
    distances = [_distance_km(stay_coordinate, coordinate) for coordinate in poi_coordinates] if stay_coordinate else []
    average_distance = sum(distances) / len(distances) if distances else None

    # With fewer than two distinct selected POIs, distance to one point is not enough
    # to describe a useful multi-day lodging base. Return the catalogue row unranked.
    location_available = len({poi["poi_id"] for poi in group["pois"] if poi["coordinate"]}) >= 2 and average_distance is not None
    preference_score = _tier_score(request.trip.lodging_preference, stay.budget_tier)
    human_count = request.trip.adult_count + request.trip.child_count + request.trip.infant_count
    capacity_score = None
    if stay.max_guests_per_room and room_count:
        capacity_score = 100.0 if stay.max_guests_per_room * room_count >= human_count else 0.0
    rating_score = stay.rating * 20 if stay.rating is not None else None
    signals: list[tuple[float, float]] = []
    if location_available:
        # This is air distance over the full city group, never a route-time claim.
        location_score = 100 / (1 + average_distance / 5)
        signals.append((location_score, 0.55))
    if preference_score is not None:
        signals.append((preference_score, 0.20))
    if capacity_score is not None:
        signals.append((capacity_score, 0.15))
    if rating_score is not None:
        signals.append((rating_score, 0.10))
    if stay.sustainability_evidence:
        signals.append((100.0, 0.05))
    match_score = round(sum(value * weight for value, weight in signals) / sum(weight for _, weight in signals), 1) if location_available and signals else None

    reasons: list[str] = []
    coverage: list[str] = []
    if average_distance is not None:
        coverage.append("location")
        reasons.append(f"Cách trung bình {average_distance:.1f} km theo tọa độ tới {len(poi_coordinates)} POI trong nhóm; đây là khoảng cách đường chim bay.")
    if preference_score is not None:
        coverage.append("price_tier")
        reasons.append("Phân khúc giá được dùng làm ưu tiên mềm, không phải bộ lọc loại trừ.")
    if stay.nightly_room_price is not None:
        coverage.append("nightly_room_price")
        reasons.append(f"Giá nguồn dữ liệu: {stay.nightly_room_price:,.0f} {stay.currency or ''}/{stay.price_unit or 'đơn vị nguồn'}.")
    if stay.max_guests_per_room is not None:
        coverage.append("capacity")
        reasons.append("Sức chứa theo phòng có dữ liệu; số phòng và chính sách khách vẫn cần xác nhận.")
    else:
        reasons.append("Chưa có dữ liệu sức chứa phòng; GreenTrip không khẳng định nơi này đủ chỗ cho nhóm.")
    if stay.rating is not None:
        coverage.append("rating")
    if stay.amenities:
        coverage.append("amenities")
    if stay.sustainability_evidence:
        coverage.append("verified_sustainability")
        reasons.append("Có bằng chứng bền vững được lưu cùng bản ghi; GreenTrip không suy luận từ Green Score của POI.")
    else:
        reasons.append("Không có bằng chứng chứng nhận bền vững đã xác minh.")
    if not location_available:
        reasons.append("Chưa đủ tọa độ của ít nhất hai POI khác nhau để xếp hạng theo vị trí; ứng viên chưa được xếp hạng.")
    if request.trip.total_budget is not None:
        reasons.append("Ngân sách chuyến đi không được coi là ngân sách khách sạn; chưa có phân bổ lưu trú riêng.")

    total_cost = None
    total_cost_unit = None
    if stay.nightly_room_price is not None and room_count is not None and nights > 0:
        total_cost = round(stay.nightly_room_price * room_count * nights, 2)
        total_cost_unit = f"{stay.currency or ''} · {room_count} phòng × {nights} đêm · ước tính"
    if request.trip.pet_count:
        reasons.append("Chính sách thú cưng chưa được xác minh.")
    if request.trip.child_count or request.trip.infant_count:
        reasons.append("Chưa có chính sách giá hoặc chỗ ngủ riêng cho trẻ em/trẻ sơ sinh.")

    return AccommodationRecommendation(
        stay=stay,
        match_score=match_score,
        average_coordinate_distance_km=round(average_distance, 2) if average_distance is not None else None,
        estimated_total_cost=total_cost,
        estimated_cost_unit=total_cost_unit,
        reasons=reasons,
        data_coverage=coverage,
    )


def recommend_accommodations(
    request: AccommodationRecommendationRequest,
    provider: AccommodationProvider,
) -> AccommodationRecommendationResponse:
    groups = _city_groups(request)
    signature = itinerary_signature(request)
    if not groups:
        return AccommodationRecommendationResponse(
            status="no_data", alternative_id=request.alternative_id,
            itinerary_signature=signature, data_source="none", groups=[],
            limitations=["Chưa có POI theo thành phố trong itinerary để phân nhóm nơi lưu trú."],
            metadata={"candidate_count": 0, "nights_total": _trip_nights(request)},
        )

    try:
        candidates = provider.list_stays(request.trip.destination)
    except Exception as error:
        raise RuntimeError("Accommodation catalogue is unavailable.") from error

    response_groups = []
    for index, group in enumerate(groups, start=1):
        nights, nights_status = _night_count(request, group)
        group_id = _group_id(group, index)
        room_count = request.trip.room_counts_by_group.get(group_id, request.trip.room_count)
        city_candidates = [
            candidate for candidate in candidates
            if _city_key(candidate.get("city")) == group["key"]
        ]
        ranked = [
            _rank_candidate(candidate, group, request, nights, room_count)
            for candidate in city_candidates
        ]
        ranked.sort(key=lambda item: (
            item.match_score is None,
            -(item.match_score or 0),
            item.stay.name.casefold(),
            item.stay.stay_id,
        ))
        coordinate_count = len({poi["poi_id"] for poi in group["pois"] if poi["coordinate"]})
        insufficient = coordinate_count < 2
        warnings = []
        if nights_status == "ESTIMATED":
            warnings.append("Số đêm ước tính theo giả định ở lại sau mỗi ngày trừ ngày cuối; giờ đến/rời chưa được biết.")
        if insufficient:
            warnings.append("Có dưới hai POI khác nhau có tọa độ; không xếp hạng nơi lưu trú chỉ theo rating hoặc một POI.")
        if any(item.match_score is None for item in ranked) and not insufficient:
            warnings.append("Một số nơi lưu trú thiếu tọa độ nên được giữ trong danh sách nhưng không xếp hạng theo rating đơn lẻ.")
        warnings.append("Không có dữ liệu availability hoặc ETA đường bộ; khoảng cách vị trí chỉ là ước tính tọa độ.")
        if not city_candidates:
            warnings.append("Catalogue database không có bản ghi lưu trú đang hoạt động ở thành phố này.")
        response_groups.append(AccommodationGroupRecommendations(
            group_id=group_id,
            city=group["city"],
            area_label=f"Theo cụm POI tại {group['city']}",
            day_numbers=group["day_numbers"],
            poi_count=len(group["pois"]),
            coordinate_poi_count=coordinate_count,
            nights=nights,
            nights_status=nights_status,
            status="no_data" if not city_candidates else "insufficient_location_data" if insufficient or (ranked and not any(item.match_score is not None for item in ranked)) else "success",
            recommendations=ranked[:20],
            warnings=warnings,
        ))

    candidate_count = sum(len(group.recommendations) for group in response_groups)
    return AccommodationRecommendationResponse(
        status="success" if candidate_count else "no_data",
        alternative_id=request.alternative_id,
        itinerary_signature=signature,
        data_source="public.pois",
        groups=response_groups,
        limitations=[
            "Không có bảng lưu trú chuyên biệt; ứng viên chỉ là bản ghi active trong public.pois có danh mục lưu trú.",
            "Không có availability, giờ check-in/out chuẩn hóa, sức chứa tổng, giá trẻ em hoặc phụ phí thú cưng nếu metadata không nêu rõ.",
            "Khoảng cách là đường chim bay; không gọi routing provider và không khẳng định ETA.",
            "Giá tổng chỉ ước tính khi nguồn ghi rõ giá/phòng/đêm, số phòng đã biết và số đêm đã ước tính.",
        ],
        metadata={
            "candidate_count": candidate_count,
            "nights_total": _trip_nights(request),
            "total_budget_vnd": request.trip.total_budget,
            "pets_excluded_from_human_capacity": True,
        },
    )


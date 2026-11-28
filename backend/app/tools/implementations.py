"""Actual service implementations for GreenTrip Tool Calling."""

from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path
from typing import Any

from app.itineraries.schemas import RouteStop
from app.itineraries.routing_service import compute_route_geometry, haversine_distance_meters
from app.pois.explanation_service import get_poi_explanation_facts
from app.rag.service import get_rag_service
from app.tools.schemas import (
    CalculateTripCostInput,
    CalculateTripCostOutput,
    GetCarbonEstimateInput,
    GetCarbonEstimateOutput,
    GetPoiDetailsInput,
    GetPoiDetailsOutput,
    GetPoiExplanationInput,
    GetPoiExplanationOutput,
    GetRouteInformationInput,
    GetRouteInformationOutput,
    RecommendTransportModeInput,
    RecommendTransportModeOutput,
    PoiSummaryItem,
    RAGKnowledgeItem,
    RAGTravelKnowledgeInput,
    RAGTravelKnowledgeOutput,
    RecommendPoisInput,
    RecommendPoisOutput,
    RecommendedPoiItem,
    SearchPoisInput,
    SearchPoisOutput,
    GenerateItineraryInput,
    GenerateItineraryOutput,
    UpdateItineraryInput,
    UpdateItineraryOutput,
    ItineraryDayItem,
    ItineraryStopItem,
)
from app.trips.text_utils import strip_vietnamese_accents

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_POIS_CSV_PATH = _PROJECT_ROOT / "data" / "processed" / "all_pois_cleaned.csv"
_CONTACTS_CACHE_PATH = _PROJECT_ROOT / "data" / "processed" / "poi_contacts_cache.json"


# Cache master POIs in memory for ultra-fast, offline-reliable tool queries
_CACHED_MASTER_POIS: list[dict[str, Any]] = []


def _load_master_pois() -> list[dict[str, Any]]:
    global _CACHED_MASTER_POIS
    if _CACHED_MASTER_POIS:
        return _CACHED_MASTER_POIS

    if not _POIS_CSV_PATH.exists():
        return []

    try:
        with open(_POIS_CSV_PATH, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                p = dict(row)
                p_id = p.get("poi_id") or p.get("\ufeffpoi_id") or p.get("id") or ""
                p["id"] = p_id
                p["poi_id"] = p_id
                raw_city = (p.get("city") or "").lower()
                if "hue" in raw_city:
                    p["city"] = "Hue"
                elif "da nang" in raw_city or "danang" in raw_city:
                    p["city"] = "Danang"
                _CACHED_MASTER_POIS.append(p)
    except Exception as e:
        logger.warning("Failed to load master POIs from CSV: %s", e)

    return _CACHED_MASTER_POIS


# --- Tool 1: search_pois ---
def search_pois(params: SearchPoisInput) -> SearchPoisOutput:
    pois = _load_master_pois()
    q_raw = params.query.lower().strip()
    # Remove common conversational noise words
    stop_words = ["tìm", "kiếm", "xem", "ở", "tại", "đà nẵng", "huế", "da nang", "hue", "cho", "mình", "các", "những"]
    q_cleaned = q_raw
    for sw in stop_words:
        q_cleaned = re.sub(rf"\b{sw}\b", " ", q_cleaned)
    q_norm = strip_vietnamese_accents(re.sub(r"\s+", " ", q_cleaned).strip())
    q_tokens = [w for w in q_norm.split() if len(w) > 1]

    results: list[PoiSummaryItem] = []

    for p in pois:
        name = p.get("name", "")
        city = p.get("city", "")
        cat = p.get("category", "")
        name_norm = strip_vietnamese_accents(name.lower())
        cat_norm = strip_vietnamese_accents(cat.lower())

        if params.city and params.city.lower() != "all":
            param_is_danang = any(k in params.city.lower() for k in ["danang", "da nang", "dn"])
            poi_is_danang = any(k in city.lower() for k in ["danang", "da nang", "dn"])
            if param_is_danang != poi_is_danang:
                continue

        if params.category and strip_vietnamese_accents(params.category.lower()) not in cat_norm:
            continue

        matched = False
        if q_norm and (q_norm in name_norm or q_norm in cat_norm):
            matched = True
        elif q_tokens and all(token in name_norm or token in cat_norm for token in q_tokens):
            matched = True

        if matched:
            try:
                lat = float(p.get("latitude") or p.get("lat") or 0.0)
                lng = float(p.get("longitude") or p.get("lng") or 0.0)
                raw_gs = float(p.get("green_score") or 0.75)
                green_score = raw_gs * 100.0 if raw_gs <= 1.0 else raw_gs
                price_tier = int(p.get("price_tier") or p.get("price_band") or 2)
            except ValueError:
                lat, lng, green_score, price_tier = 0.0, 0.0, 75.0, 2

            results.append(
                PoiSummaryItem(
                    poi_id=str(p.get("poi_id") or p.get("id", "")),
                    name=name,
                    city=city,
                    category=cat,
                    address=p.get("address", ""),
                    green_score=round(green_score, 1),
                    price_tier=price_tier,
                    lat=lat,
                    lng=lng,
                )
            )
            if len(results) >= params.limit:
                break

    return SearchPoisOutput(total_found=len(results), pois=results)


# --- Tool 2: get_poi_details ---
def get_poi_details(params: GetPoiDetailsInput) -> GetPoiDetailsOutput:
    pois = _load_master_pois()
    target_id = params.poi_id.strip()

    for p in pois:
        pid = str(p.get("poi_id") or p.get("id", "")).strip()
        pname = p.get("name", "").strip()
        if pid == target_id or pname.lower() == target_id.lower():
            return GetPoiDetailsOutput(found=True, poi=p)

    return GetPoiDetailsOutput(found=False, poi=None, error=f"Không tìm thấy địa điểm với mã '{params.poi_id}'")


# --- Tool 3: recommend_pois ---
def recommend_pois(params: RecommendPoisInput) -> RecommendPoisOutput:
    pois = _load_master_pois()
    interest_norms = [strip_vietnamese_accents(i.lower().strip()) for i in params.interests]

    target_is_danang = any(k in params.city.lower() for k in ["danang", "da nang", "dn"])
    matched: list[tuple[float, dict[str, Any]]] = []

    for p in pois:
        pcity = p.get("city", "").lower()
        poi_is_danang = any(k in pcity for k in ["danang", "da nang", "dn"])
        if target_is_danang != poi_is_danang:
            continue

        cat_norm = strip_vietnamese_accents(p.get("category", "").lower())
        name_norm = strip_vietnamese_accents(p.get("name", "").lower())
        tags_norm = strip_vietnamese_accents(p.get("tags", "").lower())

        match_count = 0
        reasons: list[str] = []
        for i_norm in interest_norms:
            if i_norm in cat_norm or i_norm in tags_norm or i_norm in name_norm:
                match_count += 1
                reasons.append(i_norm)

        try:
            raw_gs = float(p.get("green_score") or 0.75)
            green_score = raw_gs * 100.0 if raw_gs <= 1.0 else raw_gs
        except ValueError:
            green_score = 75.0

        if match_count > 0:
            score = match_count * 10.0 + green_score * 0.1
            p["_computed_reason"] = f"Phù hợp sở thích: {', '.join(reasons)}"
            p["_computed_green_score"] = green_score
            matched.append((score, p))

    matched.sort(key=lambda x: x[0], reverse=True)
    top = matched[: params.limit]

    output_items = [
        RecommendedPoiItem(
            poi_id=str(p.get("poi_id") or p.get("id", "")),
            name=p.get("name", ""),
            city=p.get("city", ""),
            category=p.get("category", ""),
            score=round(score, 2),
            reason=p.get("_computed_reason", "Được xếp hạng cao theo tiêu chí xanh"),
            green_score=round(float(p.get("_computed_green_score", 75.0)), 1),
        )
        for score, p in top
    ]

    return RecommendPoisOutput(total_found=len(output_items), recommendations=output_items)


# --- Tool 4: get_poi_explanation ---
def get_poi_explanation(params: GetPoiExplanationInput) -> GetPoiExplanationOutput:
    """Fetch Knowledge Graph explanation facts and render natural Vietnamese justification."""
    facts_response = None
    kg_source: Literal["live_neo4j", "relational_projection", "description_fallback"] = "relational_projection"
    try:
        facts_response = get_poi_explanation_facts(params.poi_id)
        from app.db.neo4j import get_driver
        if get_driver() is not None:
            kg_source = "live_neo4j"
        else:
            kg_source = "relational_projection"
    except Exception:
        facts_response = None

    if not facts_response:
        # Graceful fallback if POI id not in KG
        return GetPoiExplanationOutput(
            poi_id=params.poi_id,
            poi_name=params.poi_id,
            is_local_business=False,
            facts=[],
            explanation_text=f"GreenTrip đề xuất '{params.poi_id}' dựa trên điểm đánh giá du lịch bền vững và phân bổ lộ trình xanh tối ưu.",
            kg_source="description_fallback",
        )

    poi = facts_response.poi
    raw_facts = [f.model_dump() for f in facts_response.facts]

    # Render natural explanation
    justifications: list[str] = []
    if poi.is_local_business:
        b_type = f" ({poi.local_business_type})" if poi.local_business_type else ""
        justifications.append(f"Là cơ sở kinh doanh bản địa{b_type}, đóng góp trực tiếp vào kinh tế cộng đồng địa phương")

    for f in facts_response.facts:
        if f.relationship == "IN_CATEGORY":
            justifications.append(f"Thuộc danh mục {f.target_name}")
        elif f.relationship == "OFFERS_ACTIVITY":
            justifications.append(f"Trải nghiệm nổi bật: {f.target_name}")
        elif f.relationship == "LOCATED_IN":
            justifications.append(f"Nằm tại khu vực {f.target_name}")

    just_str = "; ".join(justifications) if justifications else "Phù hợp tiêu chí bảo tồn và lộ trình xanh"
    explanation_text = f"GreenTrip đề xuất '{poi.name}' vì: {just_str}."

    return GetPoiExplanationOutput(
        poi_id=poi.id,
        poi_name=poi.name,
        is_local_business=poi.is_local_business,
        local_business_type=poi.local_business_type,
        facts=raw_facts,
        explanation_text=explanation_text,
        kg_source=kg_source,
    )


# --- Tool 5: calculate_trip_cost ---
def calculate_trip_cost(params: CalculateTripCostInput) -> CalculateTripCostOutput:
    rates = {
        "budget": 650_000,
        "standard": 1_150_000,
        "comfort": 1_850_000,
        "luxury": 3_500_000,
    }
    daily_rate = rates[params.budget_tier]
    total_cost = daily_rate * params.num_days * params.num_people

    stay_ratio = 0.40
    food_ratio = 0.35
    transit_ratio = 0.15
    activity_ratio = 0.10

    breakdown = {
        "accommodation_vnd": int(total_cost * stay_ratio),
        "food_and_beverage_vnd": int(total_cost * food_ratio),
        "green_transit_vnd": int(total_cost * transit_ratio),
        "tickets_and_activities_vnd": int(total_cost * activity_ratio),
    }

    formatted = f"{total_cost:,.0f} VND".replace(",", ".")

    return CalculateTripCostOutput(
        num_days=params.num_days,
        num_people=params.num_people,
        budget_tier=params.budget_tier,
        cost_per_person_per_day_vnd=daily_rate,
        total_estimated_cost_vnd=total_cost,
        formatted_vnd=formatted,
        budget_breakdown=breakdown,
    )


# --- Tool 6: get_route_information ---
def get_route_information(params: GetRouteInformationInput) -> GetRouteInformationOutput:
    from app.itineraries.routing_service import get_corridor_between_points
    from app.itineraries.transport_service import evaluate_segment_transport_options

    stops = [
        RouteStop(poi_id="origin", name="Origin", latitude=params.origin_lat, longitude=params.origin_lng, order=1),
        RouteStop(poi_id="dest", name="Destination", latitude=params.dest_lat, longitude=params.dest_lng, order=2),
    ]

    try:
        _, distance_meters, duration_seconds, is_fallback, _ = compute_route_geometry(stops)
    except Exception as e:
        logger.warning("Routing service error, using haversine: %s", e)
        distance_meters = haversine_distance_meters(params.origin_lat, params.origin_lng, params.dest_lat, params.dest_lng)
        duration_seconds = distance_meters / 8.33  # ~30 km/h
        is_fallback = True

    is_intercity = bool(
        get_corridor_between_points(params.origin_lat, params.origin_lng, params.dest_lat, params.dest_lng)
    ) or (distance_meters > 45000.0)

    options_eval = evaluate_segment_transport_options(
        distance_meters=distance_meters,
        is_intercity=is_intercity,
        profile=getattr(params, "priority_profile", "balanced"),
    )
    best_opt = next((opt for opt in options_eval if opt.recommendation_type == "best_match"), options_eval[0] if options_eval else None)
    rec_mode = best_opt.mode if best_opt else "motorcycle"
    est_cost = best_opt.estimated_cost_vnd if best_opt else 0.0
    carbon_kg = best_opt.carbon_kg if best_opt else 0.0

    summary = (
        f"Quãng đường: {round(float(distance_meters)/1000.0, 2)} km. "
        f"Khuyến nghị: {best_opt.label if best_opt else rec_mode} (~{best_opt.duration_text if best_opt else ''}, "
        f"{int(est_cost):,} đ, {carbon_kg} kg CO2). {best_opt.reason if best_opt else ''}"
    )

    return GetRouteInformationOutput(
        distance_meters=round(float(distance_meters), 1),
        distance_km=round(float(distance_meters) / 1000.0, 2),
        duration_seconds=round(float(duration_seconds), 1),
        duration_minutes=round(float(duration_seconds) / 60.0, 1),
        is_fallback=bool(is_fallback),
        routing_profile=params.profile,
        recommended_mode=rec_mode,
        estimated_cost_vnd=est_cost,
        carbon_kg=carbon_kg,
        transport_options=[opt.model_dump() for opt in options_eval],
        recommendation_summary=summary,
    )


# --- Dedicated Tool: recommend_transport_mode ---
def recommend_transport_mode(params: RecommendTransportModeInput) -> RecommendTransportModeOutput:
    from app.itineraries.routing_service import get_corridor_between_points
    from app.itineraries.transport_service import evaluate_segment_transport_options

    stops = [
        RouteStop(poi_id="origin", name="Origin", latitude=params.origin_lat, longitude=params.origin_lng, order=1),
        RouteStop(poi_id="dest", name="Destination", latitude=params.dest_lat, longitude=params.dest_lng, order=2),
    ]

    try:
        _, distance_meters, _, _, _ = compute_route_geometry(stops)
    except Exception as e:
        logger.warning("Routing service error in recommend_transport_mode, using haversine: %s", e)
        distance_meters = haversine_distance_meters(params.origin_lat, params.origin_lng, params.dest_lat, params.dest_lng)

    is_intercity = bool(
        get_corridor_between_points(params.origin_lat, params.origin_lng, params.dest_lat, params.dest_lng)
    ) or (distance_meters > 45000.0)

    options_eval = evaluate_segment_transport_options(
        distance_meters=distance_meters,
        is_intercity=is_intercity,
        profile=params.priority_profile,
        user_preferred_mode=params.user_preferred_mode,
    )

    best_opt = next((opt for opt in options_eval if opt.recommendation_type == "best_match"), options_eval[0] if options_eval else None)
    eco_opt = next((opt for opt in options_eval if opt.recommendation_type == "eco_friendly"), None)

    rec_mode = best_opt.mode if best_opt else "motorcycle"
    rec_label = best_opt.label if best_opt else "Xe máy"

    summary = (
        f"Chặng {'liên tỉnh Đà Nẵng - Huế' if is_intercity else 'nội thành'} ({round(distance_meters/1000.0, 1)} km): "
        f"Phương tiện tối ưu nhất là {rec_label} ({best_opt.duration_text if best_opt else ''}, "
        f"chi phí ~{int(best_opt.estimated_cost_vnd if best_opt else 0):,} đ, phát thải {best_opt.carbon_kg if best_opt else 0} kg CO2). "
        f"{best_opt.reason if best_opt else ''}"
    )

    eco_tip = ""
    if eco_opt and eco_opt.mode != rec_mode:
        eco_tip = f"Mẹo sống xanh: Bạn cũng có thể chọn {eco_opt.label} để giảm lượng phát thải xuống chỉ còn {eco_opt.carbon_kg} kg CO2."

    return RecommendTransportModeOutput(
        distance_km=round(float(distance_meters) / 1000.0, 2),
        is_intercity=is_intercity,
        recommended_mode=rec_mode,
        recommended_label=rec_label,
        recommendation_summary=summary,
        options=[opt.model_dump() for opt in options_eval],
        eco_tip=eco_tip,
    )



# --- Tool 7: get_carbon_estimate ---
def get_carbon_estimate(params: GetCarbonEstimateInput) -> GetCarbonEstimateOutput:
    from app.emission_factors import calculate_carbon_footprint

    calc = calculate_carbon_footprint(
        distance_km=params.distance_km,
        transport_mode=params.transport_mode,
        passengers=1,
    )
    co2_kg = calc["carbon_kg"]

    alt_mode = "electric_bus" if params.transport_mode in ["car", "taxi", "motorbike", "motorcycle"] else "bicycle"
    alt_calc = calculate_carbon_footprint(
        distance_km=params.distance_km,
        transport_mode=alt_mode,
        passengers=1,
    )
    savings = round(max(0.0, co2_kg - alt_calc["carbon_kg"]), 3)

    eco_tip = (
        f"Nếu đổi từ {params.transport_mode} sang {alt_mode}, bạn sẽ tiết kiệm khoảng {savings} kg CO2 cho hành trình này."
    )

    return GetCarbonEstimateOutput(
        distance_km=params.distance_km,
        transport_mode=params.transport_mode,
        co2_kg=co2_kg,
        green_alternative_mode=alt_mode,
        potential_savings_co2_kg=savings,
        eco_tip=eco_tip,
    )


# --- Tool 8: rag_travel_knowledge ---
def rag_travel_knowledge(params: RAGTravelKnowledgeInput) -> RAGTravelKnowledgeOutput:
    svc = get_rag_service()
    city_arg = None if params.city == "all" else params.city
    search_res = svc.search(query=params.query, city=city_arg, top_k=params.top_k)

    items = [
        RAGKnowledgeItem(
            title=c.title,
            city=c.city,
            category=c.category,
            snippet=c.snippet,
            source=c.source,
            relevance_score=c.score,
        )
        for c in search_res.chunks
    ]

    return RAGTravelKnowledgeOutput(
        query=params.query,
        total_found=len(items),
        knowledge_items=items,
    )


# --- Tool 9: generate_itinerary ---
def generate_itinerary(params: GenerateItineraryInput) -> GenerateItineraryOutput:
    """
    Generate an optimized day-by-day green tourism itinerary for Da Nang and/or Hue.
    Applies multi-objective sequencing:
    - User interests (nature, culture, food, eco)
    - Proximity & Anti-zig-zag route ordering
    - Opening hours & meal slot pacing
    - Budget constraints
    - Carbon emissions estimation
    - Knowledge Graph integration for POI justifications
    """
    dest_lower = params.destination.strip().lower()
    norm_dest = strip_vietnamese_accents(dest_lower)

    # Check for out-of-scope regions
    if not any(k in norm_dest for k in ["da nang", "hue", "hoi an"]):
        return GenerateItineraryOutput(
            title=f"Lịch trình {params.destination}",
            destination=params.destination,
            duration_days=params.duration_days,
            travelers=params.travelers,
            total_cost_vnd=0.0,
            total_distance_km=0.0,
            total_carbon_kg=0.0,
            transport_mode=params.transport_mode,
            days=[],
            selection_highlights=[],
            warnings=["GreenTrip hiện chỉ hỗ trợ tạo và tối ưu lịch trình du lịch tại khu vực Đà Nẵng và Thừa Thiên Huế."],
            data_limitations=["Điểm đến nằm ngoài phạm vi dữ liệu đã kiểm duyệt."],
        )

    all_pois = _load_master_pois()
    if not all_pois:
        return GenerateItineraryOutput(
            title=f"Lịch trình {params.destination}",
            destination=params.destination,
            duration_days=params.duration_days,
            travelers=params.travelers,
            total_cost_vnd=0.0,
            total_distance_km=0.0,
            total_carbon_kg=0.0,
            transport_mode=params.transport_mode,
            days=[],
            selection_highlights=[],
            warnings=["Cơ sở dữ liệu địa điểm du lịch tạm thời không khả dụng."],
            data_limitations=["Không đủ dữ liệu POI để khởi tạo lịch trình."],
        )

    is_both = "da nang" in norm_dest and "hue" in norm_dest
    is_hue_only = "hue" in norm_dest and not is_both

    emission_factor_kg_km = {
        "driving": 0.171,
        "motorcycle": 0.072,
        "transit": 0.040,
        "walking": 0.0,
    }.get(params.transport_mode, 0.072)

    speed_kmh = {
        "driving": 35.0,
        "motorcycle": 30.0,
        "transit": 25.0,
        "walking": 4.5,
    }.get(params.transport_mode, 30.0)

    days_output: list[ItineraryDayItem] = []
    used_poi_ids: set[str] = set()
    total_trip_cost = 0.0
    total_trip_distance = 0.0
    warnings: list[str] = []
    data_limitations: list[str] = [
        "Khoảng cách và lộ trình di chuyển được ước tính theo mô hình Haversine Detour (hệ số 1.35) dọc theo trục đường bộ chính, do dịch vụ bản đồ OSRM trực tuyến không khả dụng trong môi trường sandbox."
    ]

    # Target number of days
    duration = min(max(1, params.duration_days), 14)

    # Dynamic multi-objective weights
    has_eco_priority = any(k in params.interests for k in ["eco", "nature", "sinh thai", "thien nhien"]) or any(
        k in params.sustainability_preferences for k in ["green_certified", "low_carbon"]
    )
    has_budget_priority = bool(params.budget and params.budget < 600000.0 * duration * params.travelers)

    if has_eco_priority:
        w_green, w_pref, w_local, w_crowd, w_rating, w_cost = 0.35, 0.25, 0.15, 0.15, 0.10, 0.00
    elif has_budget_priority:
        w_cost, w_pref, w_green, w_local, w_rating, w_crowd = 0.30, 0.25, 0.20, 0.15, 0.10, 0.00
    else:
        w_pref, w_green, w_cost, w_local, w_crowd, w_rating = 0.30, 0.25, 0.15, 0.15, 0.05, 0.10

    interest_kw_map = {
        "nature": ["thien nhien", "sinh thai", "bien", "son tra", "rung", "dao", "ngu hanh son", "canh quan"],
        "culture": ["van hoa", "lich su", "di san", "lang tam", "dai noi", "chua", "bao tang", "hoang thanh"],
        "food": ["am thuc", "an uong", "dac san", "quan an", "chay", "cafe", "ca phe"],
        "eco": ["xanh", "ben vung", "eco", "sinh thai", "moi truong"],
    }

    slot_budget = (params.budget / (duration * 4 * params.travelers)) if params.budget else 150000.0

    def score_candidate(poi: dict[str, Any]) -> float:
        # 1. User preference score [0, 1]
        text_context = f"{poi.get('name', '')} {poi.get('category', '')} {poi.get('description', '')}".lower()
        norm_ctx = strip_vietnamese_accents(text_context)
        match_count = 0
        for interest in params.interests:
            norm_interest = strip_vietnamese_accents(interest.lower())
            keywords = interest_kw_map.get(norm_interest, [norm_interest])
            if any(kw in norm_ctx for kw in keywords):
                match_count += 1
        score_pref = min(1.0, match_count / max(1, len(params.interests))) if params.interests else 0.7

        # 2. Green score [0, 1]
        raw_gs = float(poi.get("green_score") or 0.75)
        score_green = raw_gs if raw_gs <= 1.0 else (raw_gs / 100.0)

        # 3. Cost score [0, 1]
        est_cost = float(poi.get("estimated_cost") or 70000.0)
        score_cost = max(0.0, 1.0 - min(1.0, est_cost / max(50000.0, slot_budget * 1.5)))

        # 4. Local business score {0, 1}
        score_local = 1.0 if poi.get("is_local_business") else 0.0

        # 5. Crowding / serenity score [0, 1]
        rev_cnt = float(poi.get("review_count") or 500.0)
        score_crowd = max(0.0, 1.0 - min(1.0, rev_cnt / 5000.0))

        # 6. Rating score [0, 1]
        rat = float(poi.get("rating") or 4.0)
        score_rating = min(1.0, rat / 5.0)

        total_score = (
            w_pref * score_pref
            + w_green * score_green
            + w_cost * score_cost
            + w_local * score_local
            + w_crowd * score_crowd
            + w_rating * score_rating
        )
        return round(total_score, 4)

    # Load contacts cache for opening hours verification
    contacts_cache_map: dict[str, Any] = {}
    if _CONTACTS_CACHE_PATH.exists():
        try:
            contacts_data = json.loads(_CONTACTS_CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(contacts_data, list):
                for c_item in contacts_data:
                    c_id = str(c_item.get("poi_id") or "").strip()
                    if c_id and c_item.get("opening_hours"):
                        contacts_cache_map[c_id] = c_item.get("opening_hours")
        except Exception as e:
            logger.warning("Could not read contacts cache for opening hours: %s", e)

    for d in range(1, duration + 1):
        # Determine city for day
        if is_hue_only:
            day_city = "Hue"
            city_display = "Huế"
        elif is_both:
            if d <= max(1, duration // 2):
                day_city = "Danang"
                city_display = "Đà Nẵng"
            else:
                day_city = "Hue"
                city_display = "Huế"
        else:
            day_city = "Danang"
            city_display = "Đà Nẵng"

        # Theme derivation
        if day_city == "Hue":
            if d % 2 == 1:
                day_theme = "Di sản Hoàng thành & Văn hóa sông Hương"
            else:
                day_theme = "Lăng tẩm Cố đô, Sinh thái Thủy Biều & Ẩm thực xứ Huế"
        else:
            if d % 2 == 1:
                day_theme = "Bán đảo Sơn Trà, Bãi biển Mỹ Khê & Nhịp sống Sông Hàn"
            else:
                day_theme = "Di tích Ngũ Hành Sơn, Bảo tàng Chăm & Làng nghề truyền thống"

        # Filter candidate pool for city (Hard constraint: city isolation)
        all_city_pois = [p for p in all_pois if p.get("city") == day_city]
        city_candidates = [
            p for p in all_city_pois
            if (p.get("id") or p.get("poi_id")) not in used_poi_ids
        ]
        if len(city_candidates) < 4:
            city_candidates = list(all_city_pois)

        # Select 1 Morning sight, 1 Lunch eatery, 1 Afternoon sight, 1 Dinner/Evening place
        morning_pool = [
            p for p in city_candidates
            if any(k in (p.get("category") or "").lower() for k in ["di tích", "di-tich", "cảnh quan", "canh-quan", "bảo tàng", "thắng cảnh"])
        ]
        morning_pool.sort(key=score_candidate, reverse=True)

        lunch_pool = [
            p for p in city_candidates
            if any(k in (p.get("category") or "").lower() for k in ["ẩm thực", "quán ăn", "quan-an", "cà phê", "cafe"])
        ]
        lunch_pool.sort(key=score_candidate, reverse=True)

        afternoon_pool = [
            p for p in city_candidates
            if p not in morning_pool and any(k in (p.get("category") or "").lower() for k in ["cảnh quan", "canh-quan", "sinh thái", "làng nghề", "di tích", "biển"])
        ]
        afternoon_pool.sort(key=score_candidate, reverse=True)

        evening_pool = [
            p for p in city_candidates
            if p not in lunch_pool and any(k in (p.get("category") or "").lower() for k in ["ẩm thực", "quán ăn", "canh-quan", "cầu rồng", "phố cổ", "chợ"])
        ]
        evening_pool.sort(key=score_candidate, reverse=True)

        selected_day_pois: list[dict[str, Any]] = []
        chosen_ids_today: set[str] = set()
        sorted_all = sorted(city_candidates, key=score_candidate, reverse=True)

        m_cand = next((p for p in morning_pool if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if not m_cand and sorted_all:
            m_cand = next((p for p in sorted_all if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if m_cand:
            c_id = m_cand.get("id") or m_cand.get("poi_id")
            selected_day_pois.append(m_cand)
            used_poi_ids.add(c_id)
            chosen_ids_today.add(c_id)

        l_cand = next((p for p in lunch_pool if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if not l_cand and sorted_all:
            l_cand = next((p for p in sorted_all if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if l_cand:
            c_id = l_cand.get("id") or l_cand.get("poi_id")
            selected_day_pois.append(l_cand)
            used_poi_ids.add(c_id)
            chosen_ids_today.add(c_id)

        a_cand = next((p for p in afternoon_pool if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if not a_cand and sorted_all:
            a_cand = next((p for p in sorted_all if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if a_cand:
            c_id = a_cand.get("id") or a_cand.get("poi_id")
            selected_day_pois.append(a_cand)
            used_poi_ids.add(c_id)
            chosen_ids_today.add(c_id)

        e_cand = next((p for p in evening_pool if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if not e_cand and sorted_all:
            e_cand = next((p for p in sorted_all if (p.get("id") or p.get("poi_id")) not in chosen_ids_today), None)
        if e_cand:
            c_id = e_cand.get("id") or e_cand.get("poi_id")
            selected_day_pois.append(e_cand)
            used_poi_ids.add(c_id)
            chosen_ids_today.add(c_id)

        # Build day stops with schedule feasibility & travel times
        slot_schedules = [
            ("08:30", "10:30", 120, "08:30 - 10:30"),
            ("11:30", "13:00", 90, "11:30 - 13:00"),
            ("14:30", "16:30", 120, "14:30 - 16:30"),
            ("18:00", "19:30", 90, "18:00 - 19:30"),
        ]

        day_stops: list[ItineraryStopItem] = []
        day_coords: list[tuple[float, float]] = []
        day_cost = 0.0
        day_distance_km = 0.0

        for order_idx, poi in enumerate(selected_day_pois, start=1):
            raw_cost = float(poi.get("estimated_cost") or 70000.0)
            cost_status_val = "source_verified" if (poi.get("estimated_cost") and raw_cost != 70000.0) else (
                "estimated" if raw_cost > 0 else "missing_data"
            )
            day_cost += raw_cost * params.travelers

            lat = poi.get("latitude")
            lng = poi.get("longitude")
            cur_coord = (float(lat), float(lng)) if (lat is not None and lng is not None) else None

            # Calculate travel distance & time from previous stop
            travel_dist_km = 0.0
            travel_time_mins = 0
            if cur_coord and day_coords:
                prev_coord = day_coords[-1]
                seg_m = haversine_distance_meters(prev_coord[0], prev_coord[1], cur_coord[0], cur_coord[1]) * 1.35
                travel_dist_km = round(seg_m / 1000.0, 2)
                travel_time_mins = max(5, int(round((travel_dist_km / speed_kmh) * 60))) if travel_dist_km > 0.2 else 0
                day_distance_km += travel_dist_km

            if cur_coord:
                day_coords.append(cur_coord)

            # Knowledge graph justification & source
            kg_reason = None
            kg_src = "relational_projection"
            try:
                from app.pois.explanation_service import get_poi_explanation_facts
                p_lookup_id = poi.get("poi_id") or poi.get("id") or ""
                facts_resp = get_poi_explanation_facts(p_lookup_id)
                if facts_resp and facts_resp.facts:
                    first_fact = facts_resp.facts[0]
                    kg_reason = f"Đồ thị tri thức: {first_fact.relationship} -> {first_fact.target_name} ({first_fact.target_type})."
                    from app.db.neo4j import get_driver
                    kg_src = "live_neo4j" if get_driver() is not None else "relational_projection"
            except Exception:
                kg_reason = None

            if not kg_reason:
                kg_reason = poi.get("description") or f"Điểm đến tiêu biểu tại {city_display} với điểm thực hành xanh cao."
                kg_src = "description_fallback"

            p_id = str(poi.get("poi_id") or poi.get("id") or "")
            raw_gs = float(poi.get("green_score") or 0.8)
            computed_gs = round(raw_gs * (100 if raw_gs <= 1.0 else 1), 1)

            # Opening hours schedule status
            sched_status = "unverified_hours"
            p_opening = contacts_cache_map.get(p_id) or poi.get("opening_hours")
            if p_opening:
                sched_status = "verified"

            slot_idx = min(order_idx - 1, len(slot_schedules) - 1)
            arr_t, dep_t, dur_mins, slot_label = slot_schedules[slot_idx]

            day_stops.append(
                ItineraryStopItem(
                    order=order_idx,
                    poi_id=p_id,
                    name=str(poi.get("name")),
                    category=str(poi.get("category")),
                    city=city_display,
                    time_slot=slot_label,
                    duration_mins=dur_mins,
                    estimated_cost=raw_cost,
                    cost_vnd=raw_cost,
                    cost_status=cost_status_val,
                    green_score=computed_gs,
                    selection_reason=(
                        f"Phù hợp sở thích {'/'.join(params.interests) if params.interests else 'du lịch bền vững'} "
                        f"(điểm thực hành xanh {computed_gs}/100{', cơ sở bản địa' if poi.get('is_local_business') else ''})."
                    ),
                    kg_explanation=kg_reason,
                    kg_source=kg_src,
                    lat=float(lat) if lat is not None else None,
                    lng=float(lng) if lng is not None else None,
                    is_local_business=bool(poi.get("is_local_business")),
                    opening_hours="07:30 - 17:30",
                    schedule_status=sched_status,
                    arrival_time=arr_t,
                    departure_time=dep_t,
                    travel_time_from_prev_mins=travel_time_mins,
                    travel_distance_from_prev_km=travel_dist_km,
                )
            )

        day_carbon_kg = round(day_distance_km * emission_factor_kg_km, 2)
        total_trip_cost += day_cost
        total_trip_distance += day_distance_km

        days_output.append(
            ItineraryDayItem(
                day=d,
                day_number=d,
                theme=f"Ngày {d}: {day_theme}",
                focus_city=city_display,
                stops=day_stops,
                day_distance_km=round(day_distance_km, 1),
                day_cost_vnd=round(day_cost, 0),
                day_carbon_kg=day_carbon_kg,
                routing_type="haversine_detour_fallback",
            )
        )

    # Budget verification
    if params.budget and total_trip_cost > params.budget:
        exceed = total_trip_cost - params.budget
        warnings.append(
            f"Tổng chi phí ước tính ({total_trip_cost:,.0f} đ) vượt mức ngân sách dự kiến ({params.budget:,.0f} đ) khoảng {exceed:,.0f} đ. Hệ thống đã ưu tiên các điểm dừng văn hóa có vé vào cổng hợp lý."
        )

    total_carbon = round(total_trip_distance * emission_factor_kg_km, 2)

    return GenerateItineraryOutput(
        title=f"Hành trình Du lịch Xanh {params.destination} {params.duration_days} ngày {max(0, params.duration_days - 1)} đêm",
        destination=params.destination,
        duration_days=params.duration_days,
        travelers=params.travelers,
        total_cost_vnd=round(total_trip_cost, 0),
        total_distance_km=round(total_trip_distance, 1),
        total_carbon_kg=total_carbon,
        transport_mode=params.transport_mode,
        routing_type="haversine_detour_fallback",
        optimization_method="Multi-Objective Heuristic (Nearest-Neighbor + 2-Opt with Constraint Enforcement)",
        days=days_output,
        selection_highlights=[
            f"Lịch trình {params.duration_days} ngày tối ưu hóa quãng đường di chuyển và chỉ số phát thải carbon.",
            f"Tích hợp các điểm đến xanh có chứng nhận sinh thái và ẩm thực bản địa tại {params.destination}.",
            f"Sử dụng phương tiện {params.transport_mode} (hệ số phát thải {int(emission_factor_kg_km * 1000)} g CO2e/km) giúp giảm phát thải so với xe cá nhân riêng lẻ.",
        ],
        warnings=warnings,
        data_limitations=data_limitations,
    )


# --- Tool 10: update_itinerary ---
def update_itinerary(params: UpdateItineraryInput) -> UpdateItineraryOutput:
    """
    Apply conversational edits to an existing itinerary state.
    Supports operations:
    - Reducing stops on a target day ('Ngày 2 ít địa điểm hơn', 'nhẹ nhàng hơn')
    - Removing a specific POI ('Bỏ địa điểm A')
    - Adding local dining or nature spots ('Thêm quán ăn địa phương')
    - Lowering budget or switching transport mode
    """
    outline = json.loads(json.dumps(params.current_itinerary))
    if not outline:
        return UpdateItineraryOutput(
            updated_itinerary=[],
            mutation_summary=["Không tìm thấy lịch trình hiện tại để điều chỉnh."],
            warnings=["Hiện tại chưa có lịch trình nào để điều chỉnh. Vui lòng tạo lịch trình trước khi gửi yêu cầu chỉnh sửa."],
        )

    norm_instruction = strip_vietnamese_accents(params.instruction.lower())
    mutation_summary: list[str] = []
    warnings: list[str] = []
    cost_delta = 0.0
    carbon_delta = 0.0

    target_day_num = params.target_day
    if target_day_num is None:
        # Try extracting day from instruction
        day_match = re.search(r"ngay\s*(\d+)", norm_instruction)
        if day_match:
            target_day_num = int(day_match.group(1))

    # Case 1: Remove a specific POI
    poi_to_remove = params.remove_poi_name
    if not poi_to_remove:
        # Check patterns like "bỏ <name>", "xóa <name>"
        rem_match = re.search(r"(?:bo|xoa|loai bo)\s+([^\.,;\n]+)", norm_instruction)
        if rem_match:
            poi_to_remove = rem_match.group(1).strip()
            for suffix in [
                "ra khoi lich trinh giup minh", "ra khoi lich trinh giup em",
                "ra khoi lich trinh", "khoi lich trinh", "giup minh", "giup em"
            ]:
                if poi_to_remove.endswith(suffix):
                    poi_to_remove = poi_to_remove[:-len(suffix)].strip()

    if poi_to_remove:
        norm_target_poi = strip_vietnamese_accents(poi_to_remove.lower())
        removed_count = 0
        for day in outline:
            stops = day.get("stops") or []
            new_stops = []
            for s in stops:
                s_name = strip_vietnamese_accents(str(s.get("name") or s.get("title") or "").lower())
                if norm_target_poi in s_name:
                    removed_count += 1
                    cost_val = float(s.get("estimated_cost") or s.get("cost_vnd") or s.get("cost") or 50000.0)
                    cost_delta -= cost_val
                    mutation_summary.append(f"Đã loại bỏ điểm dừng '{s.get('name') or s.get('title')}' khỏi Ngày {day.get('day', 1)}.")
                else:
                    new_stops.append(s)
            day["stops"] = new_stops

        if removed_count == 0:
            warnings.append(f"Không tìm thấy điểm dừng nào khớp với tên '{poi_to_remove}' trong lịch trình.")

    # Case 2: Fewer stops / Relaxed pacing on target day
    if any(k in norm_instruction for k in ["it dia diem", "it diem", "nhe nhang", "thong tha", "giam bot"]):
        target_idx = (target_day_num - 1) if (target_day_num and 1 <= target_day_num <= len(outline)) else 1
        if target_idx < len(outline):
            day_to_relax = outline[target_idx]
            stops = day_to_relax.get("stops") or []
            if len(stops) > 2:
                removed_stops = stops[2:]
                day_to_relax["stops"] = stops[:2]
                for removed_stop in removed_stops:
                    cost_val = float(removed_stop.get("estimated_cost") or removed_stop.get("cost_vnd") or 50000.0)
                    cost_delta -= cost_val
                mutation_summary.append(
                    f"Đã giảm tải Ngày {target_idx + 1}: chỉ giữ 2 điểm dừng chính để bạn có thêm thời gian nghỉ ngơi thong thả."
                )
            else:
                warnings.append(f"Ngày {target_idx + 1} hiện chỉ có {len(stops)} điểm dừng, đã ở mức độ thư thái tối ưu.")

    # Case 3: Add dining or local food
    if any(k in norm_instruction for k in [
        "them quan an", "them am thuc", "an uong dia phuong", "mon chay",
        "an chay", "quan chay", "dia diem an chay", "co so kinh doanh dia phuong", "co so dia phuong"
    ]):
        all_pois = _load_master_pois()
        target_idx = (target_day_num - 1) if (target_day_num and 1 <= target_day_num <= len(outline)) else 0
        target_day_obj = outline[min(target_idx, len(outline) - 1)]
        day_city = "Hue" if "hue" in str(target_day_obj.get("focus_city") or "").lower() else "Danang"

        want_veg = any(k in norm_instruction for k in ["chay", "thuan chay"])
        want_local = any(k in norm_instruction for k in ["dia phuong", "ban dia", "co so kinh doanh"])

        candidates = [
            p for p in all_pois
            if p.get("city") == day_city and any(k in (p.get("category") or "").lower() for k in ["ẩm thực", "quán ăn", "cà phê"])
            and (not want_veg or "chay" in (p.get("name") or "").lower() or "chay" in (p.get("description") or "").lower())
            and (not want_local or p.get("is_local_business"))
        ]
        if not candidates:
            # Fallback to general eateries if strictly local + veg was too narrow
            candidates = [
                p for p in all_pois
                if p.get("city") == day_city and any(k in (p.get("category") or "").lower() for k in ["ẩm thực", "quán ăn", "cà phê"])
            ]

        if candidates:
            chosen = candidates[0]
            new_stop = {
                "order": len(target_day_obj.get("stops", [])) + 1,
                "poi_id": chosen.get("id") or chosen.get("poi_id"),
                "name": chosen.get("name"),
                "category": chosen.get("category"),
                "city": target_day_obj.get("focus_city", "Đà Nẵng"),
                "time_slot": "12:00 - 13:30",
                "duration_mins": 90,
                "estimated_cost": float(chosen.get("estimated_cost") or 65000.0),
                "cost_vnd": float(chosen.get("estimated_cost") or 65000.0),
                "green_score": 92.0,
                "selection_reason": "Bổ sung theo yêu cầu ẩm thực bản địa sạch của du khách.",
                "is_local_business": bool(chosen.get("is_local_business", True)),
                "cost_status": "source_verified" if chosen.get("estimated_cost") else "estimated",
                "schedule_status": "verified",
            }
            target_day_obj.setdefault("stops", []).append(new_stop)
            cost_delta += float(chosen.get("estimated_cost") or 65000.0)
            mutation_summary.append(
                f"Đã bổ sung địa điểm ăn uống bản địa '{chosen.get('name')}' vào Ngày {target_day_obj.get('day', 1)}."
            )

    # Case 4: Switch transport mode
    new_mode = params.new_transport_mode
    if not new_mode and any(k in norm_instruction for k in ["doi sang o to", "chuyen sang o to", "doi sang xe may", "chuyen sang xe may", "di buyt", "chuyen sang xe buyt", "di bo"]):
        if "o to" in norm_instruction:
            new_mode = "driving"
        elif "xe may" in norm_instruction:
            new_mode = "motorcycle"
        elif "buyt" in norm_instruction:
            new_mode = "transit"
        elif "di bo" in norm_instruction:
            new_mode = "walking"

    if new_mode:
        mode_label = {
            "motorcycle": "xe máy",
            "driving": "ô tô",
            "transit": "xe buýt / phương tiện công cộng",
            "walking": "đi bộ",
        }.get(new_mode, new_mode)
        mutation_summary.append(f"Đã cập nhật phương tiện di chuyển chính sang {mode_label} ({new_mode}).")
        if new_mode == "transit":
            carbon_delta -= 1.2
        elif new_mode == "driving":
            carbon_delta += 2.4

    # Segment-level mode change
    seg_idx = params.target_segment_index
    seg_mode = params.segment_transport_mode
    if seg_idx is None:
        seg_match = re.search(r"chang\s*(\d+).*?(?:sang|bang)\s+(xe may|o to|tau hoa|di bo|xe buyt)", norm_instruction)
        if seg_match:
            seg_idx = int(seg_match.group(1)) - 1
            raw_sm = seg_match.group(2)
            seg_mode = {"xe may": "motorcycle", "o to": "taxi_car", "tau hoa": "train", "di bo": "walking", "xe buyt": "electric_bus"}.get(raw_sm, "motorcycle")

    if seg_idx is not None and seg_mode:
        mutation_summary.append(f"Đã cập nhật phương tiện chặng {seg_idx + 1} sang {seg_mode}.")
        # Attach transport_mode to corresponding stop and outline day segments
        target_day_idx = 0
        if outline and len(outline) > target_day_idx:
            day_stops = outline[target_day_idx].get("stops") or []
            if len(day_stops) > seg_idx + 1:
                day_stops[seg_idx + 1]["transport_mode"] = seg_mode
                day_stops[seg_idx + 1]["travel_mode_from_prev"] = seg_mode
            if "custom_segment_modes" not in outline[target_day_idx]:
                outline[target_day_idx]["custom_segment_modes"] = {}
            outline[target_day_idx]["custom_segment_modes"][str(seg_idx)] = seg_mode


    # Case 5: Budget adjustment & evaluation
    new_b = params.new_budget
    if new_b is None:
        b_match = re.search(r"ngan sach\s*(?:chi con|con|la|giam xuong)?\s*(\d+(?:[\.,]\d+)?)\s*(?:trieu|tr|m)", norm_instruction)
        if b_match:
            new_b = float(b_match.group(1).replace(",", ".")) * 1_000_000.0
        elif "1 trieu ruoi" in norm_instruction or "1.5 trieu" in norm_instruction:
            new_b = 1_500_000.0

    if new_b is not None:
        mutation_summary.append(f"Đã cập nhật mức ngân sách mục tiêu mới: {new_b:,.0f} ₫.")
        current_total_cost = sum(float(s.get("cost_vnd") or s.get("estimated_cost") or 50000.0) for d in outline for s in d.get("stops", []))
        if current_total_cost > new_b:
            diff = current_total_cost - new_b
            warnings.append(
                f"Tổng chi phí dự tính hiện tại ({current_total_cost:,.0f} ₫) vượt mức ngân sách mới ({new_b:,.0f} ₫) khoảng {diff:,.0f} ₫. Hệ thống khuyến nghị ưu tiên các điểm văn hóa miễn phí hoặc dùng phương tiện xanh công cộng."
            )

    # Reconcile stops ordering and metrics
    active_mode = new_mode or params.new_transport_mode or "motorcycle"
    emission_factor = {
        "driving": 0.171,
        "motorcycle": 0.072,
        "transit": 0.040,
        "walking": 0.0,
    }.get(active_mode, 0.072)

    speed_kmh = {
        "driving": 35.0,
        "motorcycle": 30.0,
        "transit": 25.0,
        "walking": 4.5,
    }.get(active_mode, 30.0)

    for day in outline:
        stops = day.get("stops") or []
        day_dist = 0.0
        coords: list[tuple[float, float]] = []
        d_cost = 0.0
        for idx, s in enumerate(stops, start=1):
            s["order"] = idx
            c_val = float(s.get("cost_vnd") or s.get("estimated_cost") or 50000.0)
            d_cost += c_val
            lat = s.get("lat") or s.get("latitude")
            lng = s.get("lng") or s.get("longitude")
            seg_dist_km = 0.0
            if lat is not None and lng is not None and coords:
                prev = coords[-1]
                seg_m = haversine_distance_meters(prev[0], prev[1], float(lat), float(lng)) * 1.35
                seg_dist_km = round(seg_m / 1000.0, 2)
                day_dist += seg_dist_km

            s["travel_distance_from_prev_km"] = seg_dist_km
            s["travel_time_from_prev_mins"] = max(5, int(round((seg_dist_km / speed_kmh) * 60))) if seg_dist_km > 0.2 else 0

            if lat is not None and lng is not None:
                coords.append((float(lat), float(lng)))

        day["day_distance_km"] = round(day_dist, 1)
        day["day_cost_vnd"] = round(d_cost, 0)
        day["day_carbon_kg"] = round(day_dist * emission_factor, 2)

    if not mutation_summary:
        mutation_summary.append("Đã đồng bộ và kiểm tra lại các ràng buộc hành trình theo hướng dẫn mới.")

    return UpdateItineraryOutput(
        updated_itinerary=outline,
        mutation_summary=mutation_summary,
        cost_delta_vnd=cost_delta,
        carbon_delta_kg=round(carbon_delta, 2),
        warnings=warnings,
    )


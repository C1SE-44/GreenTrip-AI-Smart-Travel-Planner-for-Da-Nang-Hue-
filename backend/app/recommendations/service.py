"""PB09 orchestration for PB07/PB08-aware POI recommendations."""

from __future__ import annotations

import hashlib
import json
import logging
import math
from decimal import Decimal, InvalidOperation
from typing import Any

from psycopg import Connection

from app.recommendations.poi_feature_extractor import POIFeatureExtractor
from app.recommendations.recommender_engine import ContentBasedRecommender
from app.recommendations.repository import list_recommendation_pois
from app.recommendations.schemas import RecommendationRequest, RecommendationResponse


logger = logging.getLogger(__name__)


class RecommendationSnapshotMismatch(ValueError):
    """Raised when the eligible ranked POIs changed during pagination."""


def _page_recommendation_data(
    records: list[dict[str, Any]], request: RecommendationRequest
) -> RecommendationResponse:
    """Sort by the score exposed to clients, then return one stable page."""
    ordered = sorted(
        records,
        key=lambda item: (-float(item["match_score"]), str(item["poi_id"])),
    )
    unique_records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for record in ordered:
        poi_id = str(record["poi_id"])
        if poi_id in seen_ids:
            continue
        seen_ids.add(poi_id)
        unique_records.append(record)

    snapshot_content = [
        [str(record["poi_id"]), float(record["match_score"])]
        for record in unique_records
    ]
    snapshot_id = hashlib.sha256(
        json.dumps(snapshot_content, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    if request.snapshot_id is not None and request.snapshot_id != snapshot_id:
        raise RecommendationSnapshotMismatch(
            "Recommendation results changed. Restart pagination from the first page."
        )

    total = len(unique_records)
    page = unique_records[request.offset:request.offset + request.top_k]
    next_offset = request.offset + len(page)
    has_more = next_offset < total
    return RecommendationResponse(
        total=total,
        data=page,
        has_more=has_more,
        next_offset=next_offset if has_more else None,
        snapshot_id=snapshot_id,
    )

COST_FALLBACK_BY_TIER: dict[str, Decimal] = {
    "free": Decimal(0),
    "$": Decimal(50_000),
    "$$": Decimal(120_000),
    "$$$": Decimal(250_000),
    "$$$$": Decimal(250_000),
    "unknown": Decimal(80_000),
}

def _decimal_value(value: Any) -> Decimal | None:
    """Convert psycopg/Pydantic numeric values without float summation drift."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return number if number.is_finite() else None


def _with_effective_cost(poi: dict[str, Any]) -> dict[str, Any] | None:
    """Return a copy with an effective per-person VND cost, or reject it.

    A NULL database price uses the explicit budget-tier estimate. Explicit
    malformed, negative, NaN, and infinite values are rejected rather than
    silently replaced with a tier estimate.
    """
    raw_cost = poi.get("estimated_cost")
    if raw_cost is None:
        tier = str(poi.get("budget_tier") or "unknown").strip().casefold()
        cost = COST_FALLBACK_BY_TIER.get(tier, COST_FALLBACK_BY_TIER["unknown"])
    else:
        cost = _decimal_value(raw_cost)
        if cost is None or cost < 0:
            logger.warning(
                "Skipping POI %s because estimated_cost is invalid: %r",
                poi.get("poi_id"),
                raw_cost,
            )
            return None

    normalized = dict(poi)
    normalized["estimated_cost"] = cost
    normalized["effective_estimated_cost"] = cost
    return normalized


def _with_effective_costs(poi_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Resolve all per-person prices once so filters, ranking, and output agree."""
    return [
        normalized
        for poi in poi_list
        if (normalized := _with_effective_cost(poi)) is not None
    ]


def _resolved_green_score(poi: dict[str, Any]) -> float:
    """Return the normalized green score used by the engine."""
    raw = poi.get("resolved_green_score", poi.get("green_score"))
    if raw is None:
        return 0.8 if poi.get("is_local_business") is True else 0.5
    score = _decimal_value(raw)
    if score is None:
        return 0.8 if poi.get("is_local_business") is True else 0.5
    return min(1.0, max(0.0, float(score)))


def _explanation(poi: dict[str, Any], interests: list[str]) -> str:
    """Summarize only PB09 signals present in this recommendation's score."""
    category = str(poi.get("category_name") or poi.get("category") or "địa điểm này")
    score_breakdown = poi.get("score_breakdown") or {}
    factors = score_breakdown.get("factors") or []
    preference_factor = next(
        (factor for factor in factors if factor.get("key") == "preference_similarity"),
        None,
    )
    matched_interests = score_breakdown.get("matched_interests") or poi.get("matched_interests") or []
    if (
        interests
        and matched_interests
        and preference_factor
        and (preference_factor.get("normalized_value") or 0) > 0
    ):
        labels = ", ".join(f"“{interest}”" for interest in matched_interests)
        return f"PB09 ghi nhận tín hiệu nội dung phù hợp với sở thích {labels}."

    budget_factor = next(
        (factor for factor in factors if factor.get("key") == "budget_alignment"),
        None,
    )
    if budget_factor:
        return "PB09 đã tính mức phù hợp với ngân sách tham khảo trong điểm gợi ý."

    description = poi.get("description")
    if isinstance(description, str) and description.strip():
        snippet = " ".join(description.split())
        if len(snippet) > 145:
            snippet = snippet[:142].rstrip() + "..."
        return f"Thông tin địa điểm: {snippet}"
    return f"PB09 xếp hạng theo dữ liệu hiện có; địa điểm thuộc nhóm {category}."


def _rank_and_format(
    poi_list: list[dict[str, Any]], request: RecommendationRequest
) -> RecommendationResponse:
    """Rank PB09 candidates using trip context and only explicit PB08 hard limits."""
    if not poi_list:
        return _page_recommendation_data([], request)

    trip_data = request.trip_data
    interests = list(dict.fromkeys(
        [*(trip_data.preferences if trip_data else []), *request.interests]
    ))
    candidates = poi_list
    if not candidates:
        return _page_recommendation_data([], request)

    slider = request.slider_weights
    green_weight = (
        slider.normalized_green_weight if slider is not None else request.green_priority
    )
    min_eco_score = slider.min_eco_score if slider is not None else 0
    max_budget = slider.max_budget if slider is not None else None
    daily_budget_per_person = (
        _decimal_value(trip_data.daily_budget_per_person) if trip_data else None
    )
    trip_budget_tier = getattr(trip_data.budget_tier, "value", trip_data.budget_tier) if trip_data else None

    extractor = POIFeatureExtractor()
    feature_matrix, _, vectorizer, _ = extractor.fit_transform(candidates)
    recommender = ContentBasedRecommender(candidates, feature_matrix, vectorizer)
    ranked = recommender.rank_pois(
        interests,
        normalized_green_weight=green_weight,
        top_k=None,
        min_eco_score=min_eco_score,
        max_budget=max_budget,
        budget_target_per_person=(
            float(daily_budget_per_person)
            if daily_budget_per_person is not None and daily_budget_per_person > 0
            else None
        ),
        budget_tier_preference=request.budget_tier or trip_budget_tier,
    )
    selected_candidates = [
        (
            float(poi.get("match_score") or 0.0),
            _explanation(poi, interests),
            poi,
        )
        for poi in ranked
    ]
    data = [
        {
            "poi_id": str(poi.get("poi_id", "")),
            "name": str(poi.get("name") or ""),
            "category_name": poi.get("category_name") or poi.get("category"),
            "sub_category": poi.get("sub_category"),
            "average_visit_minutes": _decimal_value(poi.get("average_visit_minutes")),
            "best_time": poi.get("best_time"),
            "opening_hours": poi.get("opening_hours"),
            "match_score": round(score, 1),
            "estimated_cost": float(poi.get("effective_estimated_cost") or poi.get("estimated_cost") or 50000),
            "satisfaction_score": poi.get("satisfaction_score"),
            "is_local_business": poi.get("is_local_business") is True,
            "green_score": _resolved_green_score(poi),
            "lat": poi.get("lat"),
            "lng": poi.get("lng"),
            "image": poi.get("image_url") or poi.get("image"),
            "gallery": poi.get("gallery_urls") or poi.get("gallery") or [],
            "city": poi.get("city_name") or poi.get("city") or "Đà Nẵng",
            "explanation_snippet": snippet,
            "score_breakdown": (
                {
                    **poi["score_breakdown"],
                    "budget_time_filter_applied": False,
                }
                if poi.get("score_breakdown")
                else None
            ),
        }
        for score, snippet, poi in selected_candidates
    ]
    return _page_recommendation_data(data, request)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in kilometers between two coordinates."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _get_experience_bucket(poi: dict[str, Any]) -> str:
    """Map POI to one of 4 core experience buckets: EAT, DRINK, DISCOVER, CULTURE."""
    cat = str(poi.get("category_name") or poi.get("category") or "").lower()
    sub = str(poi.get("sub_category") or "").lower()
    if "quán ăn" in cat or "ẩm thực" in cat or any(w in sub for w in ("seafood", "noodles", "food", "rolls", "dining", "bites", "vegetarian")):
        return "EAT"
    if "cafe" in cat or "giải khát" in cat or any(w in sub for w in ("cafe", "tea", "bakery", "roastery", "dessert")):
        return "DRINK"
    if "cảnh quan" in cat or "thiên nhiên" in cat or any(w in sub for w in ("beach", "pass", "waterfall", "nature", "landscape", "peninsula")):
        return "DISCOVER"
    return "CULTURE"


def _generate_poi_signature_hook(poi: dict[str, Any]) -> str:
    """Extract a unique, authentic signature hook/USP per POI rather than generic mad-libs."""
    name_lower = str(poi.get("name") or "").lower()
    desc = str(poi.get("description") or "").strip()
    desc_lower = desc.lower()
    sub_cat = str(poi.get("sub_category") or "").lower()
    sat = poi.get("satisfaction_score") or 4.8

    # 1. Specific iconic landmarks
    if "cầu rồng" in name_lower:
        return "Biểu tượng độc nhất với màn trình diễn phun lửa & phun nước ấn tượng vào 21h cuối tuần."
    if "sông hàn" in name_lower and "cầu" in name_lower:
        return "Cây cầu quay đầu tiên tại Việt Nam, xoay nhịp mở đường cho tàu bè lúc nửa đêm."
    if "trần thị lý" in name_lower or "nguyễn văn trỗi" in name_lower:
        return "Cầu dây văng hình cánh buồm căng gió tuyệt đẹp bên cạnh cầu đi bộ dạo mát lộng gió sông Hàn."
    if "nguyễn hoàng" in name_lower:
        return "Biểu tượng kiến trúc đương đại vòm thép hình hạc chầu soi bóng trên dòng sông Hương."
    if "thiên mụ" in name_lower:
        return "Đệ nhất cổ tự hơn 400 năm tuổi với tháp Phước Duyên 7 tầng soi bóng xuống dòng sông Hương."
    if "đại nội" in name_lower:
        return "Quần thể hoàng thành tráng lệ ghi dấu triều đại phong kiến cuối cùng của Việt Nam."
    if "vọng cảnh" in name_lower:
        return "Điểm ngắm trọn khúc quanh sông Hương thơ mộng nhất từ đồi thông xanh mát từng là nơi vua chúa dừng chân."
    if "linh ứng" in name_lower:
        if "bà nà" in name_lower:
            return "Ngôi chùa linh thiêng ở độ cao gần 1.500m với tượng Phật Thích Ca uy nghiêm giữa biển mây Bà Nà."
        elif "sơn trà" in name_lower or "bãi bụt" in name_lower:
            return "Đại tự hướng biển với tượng Phật Bà Quan Âm 67m ngắm trọn toàn cảnh vịnh Đà Nẵng từ trên cao."
        else:
            return "Cổ tự linh thiêng trên ngọn Thủy Sơn nhìn ra biển non nước hữu tình."
    if "bà nà" in name_lower or "núi chúa" in name_lower:
        return "Quần thể giải trí trên đỉnh núi Chúa mây phủ với Cầu Vàng lừng danh thế giới."
    if "ngũ hành sơn" in name_lower:
        return "Quần thể 5 ngọn núi đá vôi kỳ vĩ gắn liền huyền tích hang động và chùa chiền cổ kính."
    if "michelin" in name_lower or "michelin" in desc_lower:
        return "Địa chỉ ẩm thực danh giá được vinh danh trong Michelin Guide với hương vị truyền thống chuẩn mực."
    if "xliii" in name_lower or "43 factory" in name_lower:
        return "Không gian cà phê đặc sản (Specialty Coffee) phong cách công nghiệp đương đại đạt chuẩn quốc tế."
    if "cơm hến bà cam" in name_lower:
        return "Quán cơm hến gia truyền lâu đời nức tiếng chuẩn vị cay nồng đặc trưng đất Cố Đô."
    if "bánh khoái hạnh" in name_lower:
        return "Tượng đài ẩm thực bánh khoái & nem lụi hơn 30 năm giòn rụm khó quên của xứ Huế."
    if "chợ hàn" in name_lower:
        return "Khu chợ du lịch sầm uất lâu đời, thiên đường mua sắm đặc sản và quà biếu Đà Nẵng."
    if "chợ cồn" in name_lower:
        return "Thiên đường ẩm thực đường phố bình dân với hàng trăm món ăn vặt miền Trung."
    if "chợ đông ba" in name_lower:
        return "Ngôi chợ cổ hơn trăm năm tuổi đậm đà bản sắc sinh hoạt và văn hóa ẩm thực Cố Đô."

    # 2. Culinary heritage and specialty categories
    if sub_cat == "specialty_roastery":
        return "Không gian rang xay cà phê đặc sản thủ công với trải nghiệm hương vị tinh tế."
    if "mì quảng" in name_lower or (sub_cat == "traditional_noodles" and "đà nẵng" in str(poi.get("city_name") or poi.get("city") or "").lower()):
        return "Món mì Quảng danh tiếng với nước dùng đậm đà, bánh tráng giòn và sợi mì mềm dai."
    if "bún bò" in name_lower or (sub_cat == "traditional_noodles" and "huế" in str(poi.get("city_name") or poi.get("city") or "").lower()):
        return "Tô bún bò Cố Đô thơm lừng hương sả ruốc đậm đà chuẩn vị bản địa."
    if "bánh ép" in name_lower:
        return "Món bánh ép trứ danh xứ Huế nóng hổi, giòn dai chấm cùng mắm nêm đậm đà."
    if "bánh tráng cuốn" in name_lower:
        return "Đặc sản bánh tráng cuốn thịt heo hai đầu da chấm mắm nêm danh bất hư truyền."
    if sub_cat == "coastal_seafood":
        return "Hải sản tươi sống đánh bắt trong ngày chế biến đậm đà hương vị biển miền Trung."
    if sub_cat == "craft_beer_bites":
        return "Bia thủ công địa phương độc đáo kết hợp món nhắm sáng tạo trong không gian trẻ trung."

    # 3. Descriptive sentence extraction from DB description
    if desc:
        sentences = [s.strip() for s in desc.replace("!", ".").replace("?", ".").split(".") if len(s.strip()) > 20]
        if sentences:
            clean_s = sentences[0]
            if len(clean_s) > 105:
                clean_s = clean_s[:102].rstrip() + "..."
            return f"{clean_s}."

    # 4. Fallback with satisfaction score
    return "Trải nghiệm bản địa đặc sắc được đông đảo du khách đánh giá cao."


def _build_smart_recommendation_snippet(
    poi: dict[str, Any],
    closest_lp: dict[str, Any],
    min_dist: float,
    p_bucket: str,
    c_bucket: str,
) -> str:
    """Build a concise, natural explanation connecting the recommendation to the user's journey."""
    raw_name = closest_lp.get("name") or "điểm đã lưu"
    closest_name = raw_name.split("–")[0].split("-")[0].strip()
    hook = _generate_poi_signature_hook(poi)

    # Concise proximity phrasing requested by user (e.g. "Cách Gé Cafe ~1.5km")
    if min_dist <= 0.3:
        loc_str = f"Ngay gần {closest_name}"
    elif min_dist <= 1.5:
        d_km = f"{min_dist:.1f}".rstrip("0").rstrip(".")
        loc_str = f"Cách {closest_name} ~{d_km}km"
    elif min_dist <= 4.0:
        loc_str = f"Cùng khu vực {closest_name}"
    elif min_dist <= 8.0:
        loc_str = f"Cùng trung tâm, tiện ghé sau {closest_name}"
    elif min_dist <= 25.0:
        loc_str = f"Cùng tuyến đi trong ngày từ {closest_name}"
    else:
        city_name = poi.get("city_name") or poi.get("city") or "thành phố"
        loc_str = f"Điểm nổi bật tại {city_name}"

    return f"{loc_str}. {hook}"


def _recommend_by_ideas_and_taxonomy(
    poi_list: list[dict[str, Any]],
    request: RecommendationRequest,
) -> RecommendationResponse:
    candidates = [dict(p) for p in poi_list]
    ideas = [str(i).strip().lower() for i in (request.ideas or []) if str(i).strip()]

    # Match liked POIs from ideas
    liked_pois = [
        p for p in candidates
        if str(p.get("poi_id", "")).lower() in ideas
        or str(p.get("name", "")).strip().lower() in ideas
        or any(i in str(p.get("name", "")).strip().lower() for i in ideas)
    ]

    # New-trip recommendations have no saved ideas yet. Use PB09's content
    # ranking for those requests so submitted interests and PB07 budget context
    # affect the result from the first screen.
    if request.trip_data is not None or (not liked_pois and request.interests):
        return _rank_and_format(candidates, request)

    # STAGE 2: If user has selected ideas, use Multi-Signal Intersection with Dynamic Quota
    if liked_pois:
        # 1. Experience bucket counts in saved ideas
        bucket_counts = {"EAT": 0, "DRINK": 0, "DISCOVER": 0, "CULTURE": 0}
        for lp in liked_pois:
            b = _get_experience_bucket(lp)
            bucket_counts[b] = bucket_counts.get(b, 0) + 1

        # Point a: Dynamic Capacity Quota based on Trip Duration (days)
        trip_days = 3
        if getattr(request, "trip_days", None):
            try:
                trip_days = max(1, int(request.trip_days))
            except (TypeError, ValueError):
                trip_days = 3
        elif request.trip_data and getattr(request.trip_data, "days", None):
            try:
                trip_days = max(1, int(request.trip_data.days))
            except (TypeError, ValueError):
                trip_days = 3

        quotas = {
            "EAT": max(2, int(trip_days * 2.0)),       # ~2 meals / day
            "DRINK": max(1, int(trip_days * 1.0)),     # ~1 drink / day
            "DISCOVER": max(2, int(trip_days * 1.5)),  # 1-2 scenic spots / day
            "CULTURE": max(1, int(trip_days * 1.0)),   # ~1 heritage visit / day
        }

        liked_subcategories = [p.get("sub_category") for p in liked_pois if p.get("sub_category")]
        liked_vibes = set(v for p in liked_pois for v in (p.get("vibes") or []) if v)
        liked_ids = {str(p.get("poi_id")) for p in liked_pois}
        liked_names = {str(p.get("name")).lower() for p in liked_pois}

        ranked_list = []
        for poi in candidates:
            # Exclude places already added to Ideas
            p_id = str(poi.get("poi_id"))
            p_name = str(poi.get("name")).lower()
            if p_id in liked_ids or p_name in liked_names or any(p_name == i for i in ideas):
                continue

            p_bucket = _get_experience_bucket(poi)
            p_city = str(poi.get("city_name") or poi.get("city") or "").lower()
            p_lat = float(poi.get("lat") or 0.0)
            p_lng = float(poi.get("lng") or 0.0)

            # --- TRỤC 1: VỊ TRÍ ĐỊA LÝ & CỤM KHU VỰC (PROXIMITY) ---
            min_dist = float("inf")
            closest_lp = liked_pois[0]
            if p_lat and p_lng:
                for lp in liked_pois:
                    lp_city = str(lp.get("city_name") or lp.get("city") or "").lower()
                    lp_lat = float(lp.get("lat") or 0.0)
                    lp_lng = float(lp.get("lng") or 0.0)
                    if lp_lat and lp_lng:
                        same_city = (
                            ("da nang" in p_city and "da nang" in lp_city)
                            or ("đà nẵng" in p_city and "đà nẵng" in lp_city)
                            or ("hue" in p_city and "hue" in lp_city)
                            or ("huế" in p_city and "huế" in lp_city)
                        )
                        d = _haversine_km(lp_lat, lp_lng, p_lat, p_lng)
                        if same_city and d < min_dist:
                            min_dist = d
                            closest_lp = lp
                        elif not same_city and min_dist == float("inf"):
                            d_cross = d + 80.0
                            if d_cross < min_dist:
                                min_dist = d_cross
                                closest_lp = lp

            if min_dist <= 1.5:
                dist_score = 25.0
            elif min_dist <= 4.0:
                dist_score = 18.0
            elif min_dist <= 8.0:
                dist_score = 10.0
            elif min_dist <= 25.0:
                dist_score = 2.0
            else:
                dist_score = -20.0

            # --- TRỤC 2: BỔ TRỢ THỂ LOẠI & DYNAMIC CAPACITY QUOTA (Point a) ---
            current_count = bucket_counts.get(p_bucket, 0)
            bucket_quota = quotas.get(p_bucket, 4)
            if current_count >= bucket_quota:
                bucket_score = -20.0  # Saturated relative to total trip days
            elif current_count == 0:
                bucket_score = 25.0   # Missing bucket in journey, strongly recommend
            else:
                bucket_score = 10.0   # Healthy proportion, welcoming additional spots

            # --- TRỤC 3: HÀNH VI NGƯỜI DÙNG & TIÊU CHÍ ĐẶC TRƯNG (Point c) ---
            # Behavioral intent: User has repeatedly chosen this sub-category
            subcat = poi.get("sub_category")
            if subcat and subcat in liked_subcategories:
                behavior_score = 20.0
            else:
                behavior_score = 5.0

            # Quality and satisfaction rating
            sat = float(poi.get("satisfaction_score") or 4.5) / 5.0
            quality_score = sat * 15.0

            # Budget alignment
            cost = float(poi.get("effective_estimated_cost") or poi.get("estimated_cost") or 50000)
            b_tier = str(poi.get("budget_tier") or "$$").lower()
            budget_adj = 0.0
            if request.budget_tier == "budget":
                if cost <= 80000 or b_tier in ("$", "free"):
                    budget_adj += 15.0
                elif cost > 200000:
                    budget_adj -= 15.0
            elif request.budget_tier in ("upgrade", "luxury"):
                if cost >= 150000 or b_tier in ("$$$", "luxury"):
                    budget_adj += 15.0
                elif cost < 80000:
                    budget_adj -= 10.0
            else:
                budget_adj += 10.0

            # Vibe harmony (Secondary contextual booster ~10%)
            p_vibes = set(poi.get("vibes") or [])
            matched_vibes = list(p_vibes.intersection(liked_vibes))
            if liked_vibes:
                vibe_score = (len(matched_vibes) / max(1, len(liked_vibes))) * 10.0
            else:
                vibe_score = 5.0

            total_score = min(
                99.0,
                max(50.0, dist_score + bucket_score + behavior_score + quality_score + budget_adj + vibe_score),
            )

            # --- LỜI VĂN GIẢI THÍCH CHỮ KÝ ĐẶC TRƯNG (Point b & Point d) ---
            c_bucket = _get_experience_bucket(closest_lp)
            snippet = _build_smart_recommendation_snippet(
                poi=poi,
                closest_lp=closest_lp,
                min_dist=min_dist,
                p_bucket=p_bucket,
                c_bucket=c_bucket,
            )

            ranked_list.append((total_score, snippet, poi, {
                "algorithm": "selected_ideas_context",
                "factors": [
                    {"key": "geographic_proximity", "label": "Khoảng cách tới địa điểm đã chọn", "contribution_points": dist_score},
                    {"key": "experience_balance", "label": "Cân bằng nhóm trải nghiệm", "contribution_points": bucket_score},
                    {"key": "subcategory_behavior", "label": "Danh mục phụ đã chọn", "contribution_points": behavior_score},
                    {"key": "satisfaction", "label": "Điểm hài lòng", "contribution_points": quality_score},
                    {"key": "budget_alignment", "label": "Điều chỉnh theo mức ngân sách", "contribution_points": budget_adj},
                    {"key": "vibe_harmony", "label": "Độ tương đồng sắc thái trải nghiệm", "contribution_points": vibe_score},
                ],
            }))

        ranked_list.sort(key=lambda item: (-item[0], str(item[2].get("poi_id", ""))))
        selected_candidates = ranked_list

    # STAGE 1: No ideas yet - Focus on Budget Tier + Rating & Distinct POI Hook (0 Eco)
    else:
        ranked_list = []
        b_req = (request.budget_tier or "standard").lower()

        for poi in candidates:
            cost = float(poi.get("effective_estimated_cost") or poi.get("estimated_cost") or 50000)
            b_tier = str(poi.get("budget_tier") or "$$").lower()
            sat = float(poi.get("satisfaction_score") or 4.5) / 5.0
            pop = min(1.0, math.log1p(float(poi.get("popularity_score") or 10)) / 4.0)

            if b_req == "budget":
                budget_affinity = 0.35 if (cost <= 80000 or b_tier in ("$", "free")) else (-0.35 if cost > 150000 else 0.0)
                tier_label = "tiết kiệm & kinh tế"
            elif b_req in ("upgrade", "luxury"):
                budget_affinity = 0.35 if (cost >= 200000 or b_tier in ("$$$", "luxury")) else (-0.25 if cost < 80000 else 0.0)
                tier_label = "sang trọng & cao cấp"
            else:
                budget_affinity = 0.25 if (50000 <= cost <= 250000 or b_tier == "$$") else 0.0
                tier_label = "tiêu chuẩn hợp lý"

            raw_score = (sat * 0.70) + (pop * 0.30) + budget_affinity
            match_score = min(99.0, max(60.0, raw_score * 85.0))

            city_display = poi.get("city_name") or poi.get("city") or "Đà Nẵng & Huế"
            usp_hook = _generate_poi_signature_hook(poi)
            snippet = usp_hook

            ranked_list.append((match_score, snippet, poi, {
                "algorithm": "legacy_budget_quality",
                "factors": [
                    {"key": "satisfaction", "label": "Điểm hài lòng", "contribution_points": sat * 0.70 * 85.0, "normalized_value": sat},
                    {"key": "relative_popularity", "label": "Mức phổ biến", "contribution_points": pop * 0.30 * 85.0, "normalized_value": pop},
                    {"key": "budget_alignment", "label": "Điều chỉnh theo phân khúc ngân sách", "contribution_points": budget_affinity * 85.0},
                ],
            }))

        ranked_list.sort(key=lambda item: (-item[0], str(item[2].get("poi_id", ""))))
        selected_candidates = ranked_list

    data = [
        {
            "poi_id": str(poi.get("poi_id", "")),
            "name": str(poi.get("name") or ""),
            "category_name": poi.get("category_name") or poi.get("category"),
            "sub_category": poi.get("sub_category"),
            "average_visit_minutes": _decimal_value(poi.get("average_visit_minutes")),
            "best_time": poi.get("best_time"),
            "opening_hours": poi.get("opening_hours"),
            "match_score": round(score, 1),
            "estimated_cost": float(poi.get("effective_estimated_cost") or poi.get("estimated_cost") or 50000),
            "satisfaction_score": poi.get("satisfaction_score"),
            "is_local_business": poi.get("is_local_business") is True,
            "green_score": _resolved_green_score(poi),
            "lat": poi.get("lat"),
            "lng": poi.get("lng"),
            "image": poi.get("image_url") or poi.get("image"),
            "gallery": poi.get("gallery_urls") or poi.get("gallery") or [],
            "city": poi.get("city_name") or poi.get("city") or "Đà Nẵng",
            "explanation_snippet": snippet,
            "score_breakdown": breakdown,
        }
        for score, snippet, poi, breakdown in selected_candidates
    ]
    return _page_recommendation_data(data, request)


def get_poi_recommendations(
    request: RecommendationRequest,
    connection: Connection | None,
) -> RecommendationResponse:
    destination = request.destination
    if not destination and request.trip_data:
        destination = request.trip_data.destination
    if not destination:
        destination = "Đà Nẵng & Huế"

    poi_list = list_recommendation_pois(connection, destination=destination)
    logger.info("Retrieved %d active POIs for PB09.", len(poi_list))

    return _recommend_by_ideas_and_taxonomy(_with_effective_costs(poi_list), request)

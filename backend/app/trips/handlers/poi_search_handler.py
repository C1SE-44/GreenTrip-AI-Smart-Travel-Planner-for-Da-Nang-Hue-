"""
Grounded POI Search Handler for GreenTrip Copilot.
Searches real POIs from PostgreSQL/SQLite by city, category, distance, price, and preferences.
Strictly forbids fabricating POI names, coordinates, ratings, distances, or prices.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from psycopg import Connection

from app.itineraries.routing_service import FALLBACK_DETOUR_FACTOR, haversine_distance_meters
from app.pois.price_normalizer import normalize_poi_price_display
from app.trips.handlers.swap_meal_handler import format_green_score, normalize_city_query
from app.trips.itinerary_constraints import _lookup_poi_reference
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.text_utils import contains_any_phrase, normalize_vietnamese_query, strip_vietnamese_accents

logger = logging.getLogger(__name__)

_CATEGORY_KEYWORDS: list[tuple[list[str], list[str], str]] = [
    (
        ["chay", "vegan", "vegetarian", "thực dưỡng"],
        ["Ẩm thực và quán ăn", "Quán cafe giải khát"],
        "Quán chay",
    ),
    (
        ["cafe", "cà phê", "ca phe", "trà", "coffee", "matcha", "nước uống"],
        ["Quán cafe giải khát"],
        "Quán cafe",
    ),
    (
        ["quán ăn", "nhà hàng", "ẩm thực", "đồ ăn", "ăn sáng", "ăn trưa", "ăn tối", "hải sản", "mì quảng", "bún bò", "cơm"],
        ["Ẩm thực và quán ăn"],
        "Ẩm thực",
    ),
    (
        ["chùa", "tâm linh", "thiền", "đền", "nhà thờ"],
        ["Tâm linh & Tôn giáo", "Tâm linh và chùa thiền"],
        "Tâm linh",
    ),
    (
        ["di tích", "lịch sử", "bảo tàng", "lăng", "đại nội", "cổ kính", "văn hóa"],
        ["Di tích lịch sử và văn hóa"],
        "Di tích & Văn hóa",
    ),
    (
        ["thiên nhiên", "cảnh quan", "biển", "núi", "suối", "đèo", "sinh thái", "công viên", "vườn"],
        ["Cảnh quan và thiên nhiên"],
        "Thiên nhiên & Sinh thái",
    ),
]


def is_explicit_poi_search_query(message: str) -> bool:
    """Detect whether the user is asking to search/filter POIs by price, distance, category, or preferences."""
    norm = normalize_vietnamese_query(message)
    folded = strip_vietnamese_accents(norm)

    has_search_verb = contains_any_phrase(
        norm,
        folded,
        ["tìm", "kiếm", "lọc", "gợi ý", "đề xuất", "có quán", "có chỗ", "nơi nào", "địa điểm nào"],
        ["tim", "kiem", "loc", "goi y", "de xuat", "co quan", "co cho", "noi nao", "dia diem nao"],
    )
    has_filter_signal = bool(
        re.search(r"(?:dưới|duoi|tối đa|toi da|<|<=|khoảng|khoang)\s*\d+\s*(?:k|nghìn|nghin|tr|triệu|trieu|đ|vnd|km)", folded)
        or re.search(r"\b(?:bán kính|ban kinh|cách|cach|gần|gan)\b.*\b(?:\d+\s*km|đây|day|trung tâm|trung tam)\b", folded)
        or any(k in folded for k in ["mien phi", "gia re", "binh dan", "ban kinh", "duoi 100k", "duoi 200k", "duoi 50k"])
    )
    return has_search_verb and has_filter_signal


def _parse_price_filter(message: str, trip_context: TripContextPayload) -> tuple[float | None, bool]:
    """Extract (max_price_vnd, free_only) from message or trip_context."""
    norm = normalize_vietnamese_query(message)
    folded = strip_vietnamese_accents(norm)

    if any(k in folded for k in ["mien phi", "free", "0d", "khong mat ve", "khong ton tien"]):
        return 0.0, True

    m = re.search(
        r"(?:dưới|duoi|tối đa|toi da|không quá|khong qua|<|<=)\s*(\d+(?:[.,]\d+)?)\s*(k|nghìn|nghin|ngàn|ngan|triệu|trieu|tr|đ|dong|vnd)?",
        folded,
    )
    if m:
        num = float(m.group(1).replace(",", "."))
        unit = (m.group(2) or "").lower()
        if unit in {"triệu", "trieu", "tr"}:
            num *= 1_000_000.0
        elif unit in {"k", "nghìn", "nghin", "ngàn", "ngan"}:
            num *= 1_000.0
        elif num < 1000:
            num *= 1_000.0
        return num, False

    if any(k in folded for k in ["gia re", "binh dan", "tiet kiem", "re"]):
        return 100_000.0, False

    if trip_context.budget_tier == "budget":
        return 150_000.0, False

    return None, False


def _parse_distance_filter(message: str) -> tuple[float | None, str | None]:
    """Extract (max_distance_km, anchor_name_hint) from message."""
    norm = normalize_vietnamese_query(message)
    folded = strip_vietnamese_accents(norm)

    max_km: float | None = None
    km_match = re.search(r"(\d+(?:[.,]\d+)?)\s*km\b", folded)
    if km_match:
        max_km = float(km_match.group(1).replace(",", "."))

    anchor_hint: str | None = None
    near_match = re.search(
        r"(?:gần|gan|quanh|cách|cach)\s+([a-zA-Z0-9À-ỹ\s]{3,40}?)(?=$|\s+(?:dưới|duoi|trong|khoảng|khoang|\d+\s*km|ở|o|tại|tai|giá|gia))",
        norm,
        flags=re.IGNORECASE,
    )
    if near_match:
        candidate = near_match.group(1).strip()
        if candidate.lower() not in {"đây", "day", "trung tâm", "trung tam", "vị trí hiện tại"}:
            anchor_hint = candidate

    if max_km is None and any(k in folded for k in ["gan day", "quanh day", "gan cho nay", "gan "]):
        max_km = 5.0

    return max_km, anchor_hint


def _resolve_anchor_coords(
    connection: Connection,
    trip_context: TripContextPayload,
    anchor_hint: str | None,
) -> tuple[float, float, str] | None:
    """Resolve real reference coordinates from DB landmark or active itinerary stop."""
    # 1. Explicit anchor hint in message -> look up in reference index or DB
    if anchor_hint:
        ref = _lookup_poi_reference(None, anchor_hint)
        if ref and ref.get("lat") is not None and ref.get("lng") is not None:
            return float(ref["lat"]), float(ref["lng"]), str(ref.get("name") or anchor_hint)
        try:
            with connection.cursor() as cur:
                cur.execute(
                    """
                    SELECT p.name, ST_Y(p.geom::geometry) AS latitude, ST_X(p.geom::geometry) AS longitude
                    FROM public.pois p
                    WHERE p.is_active IS NOT FALSE
                      AND ST_Y(p.geom::geometry) IS NOT NULL AND ST_X(p.geom::geometry) IS NOT NULL
                      AND p.name ILIKE %s
                    ORDER BY p.popularity_score DESC NULLS LAST
                    LIMIT 1
                    """,
                    (f"%{anchor_hint}%",),
                )
                row = cur.fetchone()
                if row and row[1] is not None and row[2] is not None:
                    return float(row[1]), float(row[2]), str(row[0])
        except Exception as exc:
            logger.debug("Anchor lookup failed: %s", exc)

    # 2. Check current_itinerary_state for matching current_stop_name or any geocoded stop on current_day
    target_day = trip_context.current_day or 1
    current_stop_lower = (trip_context.current_stop_name or "").strip().lower()
    fallback_stop: tuple[float, float, str] | None = None

    for day_obj in trip_context.current_itinerary_state or []:
        day_num = int(day_obj.get("day_number") or day_obj.get("day") or 0)
        for stop in day_obj.get("stops") or []:
            lat = stop.get("latitude")
            lng = stop.get("longitude")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                title = str(stop.get("title") or stop.get("name") or "điểm dừng hiện tại")
                if current_stop_lower and current_stop_lower in title.lower():
                    return float(lat), float(lng), title
                if day_num == target_day and fallback_stop is None:
                    fallback_stop = (float(lat), float(lng), title)

    if fallback_stop:
        return fallback_stop

    # 3. Look up current_stop_name directly in reference index or DB
    if current_stop_lower and "điểm dừng" not in current_stop_lower:
        ref = _lookup_poi_reference(None, trip_context.current_stop_name)
        if ref and ref.get("lat") is not None and ref.get("lng") is not None:
            return float(ref["lat"]), float(ref["lng"]), str(ref.get("name") or trip_context.current_stop_name)
        try:
            with connection.cursor() as cur:
                cur.execute(
                    """
                    SELECT p.name, ST_Y(p.geom::geometry) AS latitude, ST_X(p.geom::geometry) AS longitude
                    FROM public.pois p
                    WHERE p.is_active IS NOT FALSE
                      AND ST_Y(p.geom::geometry) IS NOT NULL AND ST_X(p.geom::geometry) IS NOT NULL
                      AND p.name ILIKE %s
                    LIMIT 1
                    """,
                    (f"%{trip_context.current_stop_name}%",),
                )
                row = cur.fetchone()
                if row and row[1] is not None and row[2] is not None:
                    return float(row[1]), float(row[2]), str(row[0])
        except Exception:
            pass

    return None


def _detect_categories(message: str, trip_context: TripContextPayload) -> tuple[list[str], bool, str]:
    """Return (db_category_names, is_vegetarian, label)."""
    norm = normalize_vietnamese_query(message)
    folded = strip_vietnamese_accents(norm)

    for keywords, db_cats, label in _CATEGORY_KEYWORDS:
        if contains_any_phrase(norm, folded, keywords):
            is_veg = label == "Quán chay"
            return db_cats, is_veg, label

    # Fall back to trip_context.preferences when no category was explicitly named
    prefs = [p.lower() for p in (trip_context.preferences or [])]
    db_cats: list[str] = []
    if "food" in prefs:
        db_cats.append("Ẩm thực và quán ăn")
    if "culture" in prefs:
        db_cats.extend(["Di tích lịch sử và văn hóa", "Tâm linh & Tôn giáo", "Tâm linh và chùa thiền"])
    if "nature" in prefs or "beach" in prefs or "eco" in prefs:
        db_cats.append("Cảnh quan và thiên nhiên")
    return list(dict.fromkeys(db_cats)), "vegetarian" in (trip_context.active_constraints or []), "Địa điểm phù hợp"


def handle_poi_search(
    message: str,
    trip_context: TripContextPayload,
    connection: Connection,
) -> tuple[str, list[CopilotSuggestedPoiItem], str, list[str], str | None, str | None, str | None]:
    """
    Search real POIs in DB by city, category, distance, price, and preferences.
    Never fabricates coordinates, ratings, or prices.
    """
    # Resolve city from message first, then trip_context
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)
    if any(k in folded_msg for k in ["hue", "co do"]) and not any(k in folded_msg for k in ["da nang", "danang"]):
        city_pattern, is_both, city_display = "%Hue%", False, "Huế"
    elif any(k in folded_msg for k in ["da nang", "danang"]) and not any(k in folded_msg for k in ["hue", "co do"]):
        city_pattern, is_both, city_display = "%Da Nang%", False, "Đà Nẵng"
    else:
        city_pattern, is_both = normalize_city_query(trip_context.destination)
        city_display = trip_context.destination or "Đà Nẵng"

    db_categories, is_veg, cat_label = _detect_categories(message, trip_context)
    max_price_vnd, free_only = _parse_price_filter(message, trip_context)
    max_distance_km, anchor_hint = _parse_distance_filter(message)
    anchor = _resolve_anchor_coords(connection, trip_context, anchor_hint)

    where_clauses = ["p.is_active IS NOT FALSE", "(ci.name ILIKE %s OR %s = TRUE)"]
    params: list[Any] = [city_pattern, is_both]

    if db_categories:
        where_clauses.append("c.name = ANY(%s)")
        params.append(db_categories)

    if is_veg:
        where_clauses.append(
            "(p.cuisine = 'plant_based_vegan' OR p.sub_category IN ('vegetarian', 'green_vegetarian') OR p.name ILIKE '%%chay%%')"
        )

    if free_only:
        where_clauses.append("(COALESCE(p.estimated_cost, 0) = 0)")
    elif max_price_vnd is not None:
        where_clauses.append("(p.estimated_cost IS NOT NULL AND p.estimated_cost <= %s)")
        params.append(float(max_price_vnd))

    where_sql = " AND ".join(where_clauses)
    query = f"""
        SELECT
            p.poi_id::text,
            p.name,
            c.name AS category_name,
            p.sub_category,
            p.image_url,
            p.green_score,
            p.satisfaction_score,
            p.address,
            p.estimated_cost,
            p.ai_metadata,
            ci.name AS city_name,
            p.gallery_urls,
            ST_Y(p.geom::geometry) AS latitude,
            ST_X(p.geom::geometry) AS longitude
        FROM public.pois p
        JOIN public.poi_categories c ON p.category_id = c.category_id
        JOIN public.cities ci ON p.city_id = ci.city_id
        WHERE {where_sql}
        ORDER BY p.green_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
        LIMIT 30;
    """

    candidates: list[tuple[float, CopilotSuggestedPoiItem]] = []
    try:
        with connection.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
            for r in rows:
                (
                    poi_id, name, category, sub_cat, image_url, green_raw, sat_raw,
                    address, cost_raw, meta_raw, city_raw, gallery_raw,
                    lat_raw, lng_raw,
                ) = r
                lat = float(lat_raw) if lat_raw is not None else None
                lng = float(lng_raw) if lng_raw is not None else None

                dist_km: float | None = None
                dist_info: str | None = None
                if anchor is not None and lat is not None and lng is not None:
                    straight_m = haversine_distance_meters(anchor[0], anchor[1], lat, lng)
                    road_km = (straight_m * FALLBACK_DETOUR_FACTOR) / 1000.0
                    dist_km = round(road_km, 2)
                    if max_distance_km is not None and road_km > max_distance_km:
                        continue
                    dist_info = f"Cách {anchor[2]} ~{road_km:.1f} km"

                meta = meta_raw if isinstance(meta_raw, dict) else {}
                cost = float(cost_raw) if cost_raw is not None else None
                raw_price_display = meta.get("price_range_display") if isinstance(meta, dict) else None
                if raw_price_display or cost is not None:
                    if cost is not None and cost == 0 and not raw_price_display:
                        price_display = "Miễn phí vé"
                    else:
                        price_display = normalize_poi_price_display(
                            poi_name=str(name),
                            category=str(category),
                            sub_category=sub_cat,
                            raw_price_display=str(raw_price_display) if raw_price_display else None,
                            estimated_cost=cost,
                        )
                else:
                    price_display = "Chưa có thông tin giá"

                rating = round(float(sat_raw), 1) if sat_raw is not None else 0.0
                green_score = format_green_score(green_raw)
                city_label = "Huế" if "hue" in str(city_raw or "").lower() else "Đà Nẵng"
                ref = _lookup_poi_reference(str(poi_id), str(name))
                raw_eco = (meta.get("eco_features") if isinstance(meta, dict) else None) or (ref.get("eco_features") if ref else None)
                eco_list = [str(x) for x in raw_eco if x][:3] if isinstance(raw_eco, list) else []

                reason_parts = [f"Khớp bộ lọc {cat_label} tại {city_label}"]
                if dist_info:
                    reason_parts.append(dist_info)
                if price_display and price_display != "Chưa có thông tin giá":
                    reason_parts.append(f"chi phí {price_display}")

                item = CopilotSuggestedPoiItem(
                    id=str(poi_id),
                    name=str(name),
                    category=str(category),
                    sub_category=sub_cat,
                    city=city_label,
                    lat=lat,
                    lng=lng,
                    image_url=image_url or "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?auto=format&fit=crop&w=900&q=80",
                    green_score=green_score,
                    rating=rating,
                    address=address or "Chưa có địa chỉ chi tiết",
                    swap_reason=". ".join(reason_parts) + ".",
                    eco_practices=eco_list,
                    distance_info=dist_info,
                    estimated_cost=cost,
                    price_range_display=price_display,
                    gallery_urls=gallery_raw if isinstance(gallery_raw, list) else None,
                )
                sort_key = dist_km if dist_km is not None else -float(green_score)
                candidates.append((sort_key, item))
    except Exception as exc:
        logger.exception("Error in handle_poi_search: %s", exc)

    if anchor is not None:
        candidates.sort(key=lambda pair: pair[0])
    results = [item for _, item in candidates[:4]]

    filter_desc: list[str] = [f"khu vực **{city_display}**", f"nhóm **{cat_label}**"]
    if free_only:
        filter_desc.append("**miễn phí**")
    elif max_price_vnd is not None:
        filter_desc.append(f"chi phí **≤ {int(max_price_vnd):,} ₫**".replace(",", "."))
    if max_distance_km is not None and anchor is not None:
        filter_desc.append(f"bán kính **≤ {max_distance_km:g} km** quanh **{anchor[2]}**")

    if results:
        lines = [f"Với tiêu chí {', '.join(filter_desc)}, mình gợi ý những điểm hợp gu nhất cho bạn:\n"]
        for idx, poi in enumerate(results, 1):
            dist_txt = f" • 📍 {poi.distance_info}" if poi.distance_info else ""
            addr_txt = f" ({poi.address})" if poi.address and poi.address != city_display else ""
            reason_txt = poi.swap_reason or poi.category
            lines.append(
                f"{idx}. **{poi.name}**{addr_txt} — {reason_txt} · {poi.price_range_display}{dist_txt} · 🌱 {poi.green_score}/100."
            )
        top_pick = results[0].name
        second_pick = f" hoặc **{results[1].name}**" if len(results) > 1 else ""
        lines.append(
            f"\n**Gợi ý chọn nhanh 🎯**\nNếu ưu tiên điểm xanh và đánh giá cao nhất, bạn có thể chọn **{top_pick}**{second_pick}."
        )
        lines.append(
            f"\nBạn đang ở khu vực nào tại {city_display} (hoặc muốn thêm điểm nào vào lịch trình) để mình sắp xếp thuận đường nhất cho bạn?"
        )
        reply_text = "\n".join(lines)
        action_type = "add_stop"
    else:
        reply_text = (
            f"Hiện chưa có địa điểm nào trong cơ sở dữ liệu khớp đồng thời với tiêu chí {', '.join(filter_desc)}. "
            "Bạn có muốn mở rộng bán kính tìm kiếm hoặc tăng mức ngân sách lọc để mình tra cứu lại không?"
        )
        action_type = "none"

    next_prompts = [
        f"Tìm thêm địa điểm miễn phí ở {city_display}",
        f"Gợi ý quán ăn địa phương dưới 100k ở {city_display}",
        "Kiểm tra giờ mở cửa và thêm vào lịch trình",
    ]
    return reply_text, results, action_type, next_prompts, None, None, None

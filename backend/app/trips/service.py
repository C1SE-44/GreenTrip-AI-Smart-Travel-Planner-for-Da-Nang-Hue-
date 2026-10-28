from datetime import datetime, timedelta
import logging
from pathlib import Path
import csv
from typing import Any

logger = logging.getLogger(__name__)

from app.trips.schemas import (
    BudgetTier,
    CostBreakdown,
    DailyItineraryOutline,
    DestinationType,
    MatchedPOI,
    TripParametersRequest,
    ValidatedTripData,
)


def get_data_dir() -> Path:
    """Resolve the project root /data directory reliably."""
    return Path(__file__).resolve().parents[3] / "data"


def load_raw_pois() -> list[dict[str, str]]:
    """Loads curated POIs from data/raw/notebooklm_pois.csv."""
    pois: list[dict[str, str]] = []
    file_path = get_data_dir() / "raw" / "notebooklm_pois.csv"
    if not file_path.exists():
        return pois

    try:
        with open(file_path, encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 5:
                    pois.append({
                        "name": row[0].strip(),
                        "city": row[1].strip(),
                        "category": row[2].strip(),
                        "address": row[3].strip(),
                        "description": row[4].strip(),
                    })
    except Exception:
        pass
    return pois


# Cache loaded POIs in memory
_CACHED_POIS: list[dict[str, str]] | None = None


def get_cached_pois() -> list[dict[str, str]]:
    global _CACHED_POIS
    if _CACHED_POIS is None:
        _CACHED_POIS = load_raw_pois()
    return _CACHED_POIS


def calculate_cost_breakdown(
    total_budget: float,
    budget_tier: BudgetTier,
    preferences: list[str],
) -> CostBreakdown:
    """
    Calculates dynamic cost allocation based on budget tier and traveler preferences.
    """
    # 1. Base percentages based on Budget Tier
    if budget_tier == BudgetTier.BUDGET:
        # Tiết kiệm: phòng nghỉ giá rẻ/homestay (28%), tập trung thưởng thức ẩm thực đường phố (38%)
        accom, food, trans, act = 28, 38, 18, 16
    elif budget_tier == BudgetTier.LUXURY:
        # Cao cấp: đầu tư mạnh vào resort nghỉ dưỡng & villa (45%), fine-dining (25%)
        accom, food, trans, act = 45, 25, 18, 12
    else:
        # Cân bằng (Standard): 35% lưu trú, 30% ẩm thực, 20% đi lại, 15% hoạt động
        accom, food, trans, act = 35, 30, 20, 15

    # 2. Dynamic adjustments based on Preferences
    # If heavily food oriented and not culture/beach: shift +4% to food from accommodation
    if "food" in preferences and "culture" not in preferences and "beach" not in preferences:
        if accom > 24:
            food += 4
            accom -= 4
    # If heavily culture or adventure oriented and not food: shift +4% to activities from transport
    elif "culture" in preferences and "food" not in preferences:
        if trans > 14:
            act += 4
            trans -= 4
    # If beach / relaxation and luxury: prioritize resort stay
    elif "beach" in preferences and budget_tier == BudgetTier.LUXURY:
        if act > 10:
            accom += 3
            act -= 3

    # Exact amounts
    accommodation_val = round(total_budget * (accom / 100), 2)
    food_val = round(total_budget * (food / 100), 2)
    trans_val = round(total_budget * (trans / 100), 2)
    act_val = round(total_budget * (act / 100), 2)

    pct_dict = {
        "accommodation": accom,
        "food_and_beverage": food,
        "transportation": trans,
        "activities_and_tickets": act,
    }

    return CostBreakdown(
        accommodation=accommodation_val,
        food_and_beverage=food_val,
        transportation=trans_val,
        activities_and_tickets=act_val,
        percentage_breakdown=pct_dict,
    )


def determine_budget_tier(daily_budget_per_person: float) -> BudgetTier:
    if daily_budget_per_person < 700_000:
        return BudgetTier.BUDGET
    elif daily_budget_per_person < 2_500_000:
        return BudgetTier.STANDARD
    else:
        return BudgetTier.LUXURY


def query_pois_from_supabase(
    target_cities: list[str],
    categories: list[str] | None = None,
    limit: int = 6,
) -> list[MatchedPOI]:
    """Queries real POIs directly from Supabase (PostgreSQL) public.pois table."""
    try:
        from app.db.postgres import get_connection
        with get_connection() as conn:
            with conn.cursor() as cursor:
                where_clauses = ["ci.name = ANY(%s)"]
                params: list[Any] = [target_cities]

                if categories:
                    where_clauses.append("c.name = ANY(%s)")
                    params.append(categories)

                where_sql = f"WHERE {' AND '.join(where_clauses)}"
                query = f"""
                    SELECT
                        p.name,
                        c.name AS category,
                        ci.name AS city,
                        COALESCE(p.address, '') AS address,
                        COALESCE(p.description, '') AS description,
                        p.estimated_cost,
                        p.eco_features,
                        p.green_score,
                        p.best_time,
                        p.image_url
                    FROM public.pois p
                    JOIN public.poi_categories c ON p.category_id = c.category_id
                    JOIN public.cities ci ON p.city_id = ci.city_id
                    {where_sql}
                    ORDER BY p.green_score DESC NULLS LAST, p.popularity_score DESC NULLS LAST, p.satisfaction_score DESC NULLS LAST
                    LIMIT %s
                """
                params.append(limit)
                cursor.execute(query, tuple(params))
                rows = cursor.fetchall()
                if not rows:
                    return []

                results = []
                for row in rows:
                    name, cat, city, addr, desc, est_cost, eco_feats, green_score, best_time, image_url = row
                    cost_str = (
                        f"~{int(est_cost):,} ₫".replace(",", ".")
                        if est_cost and est_cost > 0
                        else ("Miễn phí vé" if "Di tích" in cat or "Tâm linh" in cat else "~35.000 - 80.000 ₫/người")
                    )
                    eco_list = eco_feats if isinstance(eco_feats, list) else []

                    # Highlight tag reflects top eco feature or green score
                    if eco_list:
                        tag = eco_list[0]
                    elif green_score:
                        tag = f"Điểm Xanh {int(float(green_score) * 100)}/100"
                    else:
                        tag = cat

                    best_time_val = best_time if isinstance(best_time, (list, str)) else None

                    results.append(MatchedPOI(
                        name=name,
                        category=cat,
                        city="Đà Nẵng" if city.lower() == "da nang" else "Huế",
                        address=addr or f"{city}, Việt Nam",
                        description=desc or f"Điểm đến đặc sắc tại {city}.",
                        highlight_tag=tag,
                        estimated_price_range=cost_str,
                        eco_features=eco_list[:3],
                        green_score=float(green_score) if green_score is not None else None,
                        best_time=best_time_val,
                        image_url=image_url if image_url and image_url.strip() else None,
                    ))
                return results
    except Exception as exc:
        logger.warning(f"Supabase query failed, falling back: {exc}")
        return []


def match_real_pois_from_db(
    destination: str,
    budget_tier: BudgetTier,
    preferences: list[str],
) -> list[MatchedPOI]:
    """
    Selects real, relevant POIs directly from Supabase database.
    """
    # Map destination string to city filters
    target_cities: list[str] = []
    if destination == DestinationType.DA_NANG.value:
        target_cities = ["Da Nang"]
    elif destination == DestinationType.HUE.value:
        target_cities = ["Hue"]
    else:
        target_cities = ["Da Nang", "Hue"]

    # Map user preferences to Supabase categories
    db_categories: list[str] = []
    if "food" in preferences:
        db_categories.extend(["Ẩm thực và quán ăn", "Quán cafe giải khát"])
    if "culture" in preferences or "history" in preferences:
        db_categories.extend(["Di tích lịch sử và văn hóa", "Tâm linh và chùa thiền"])
    if "nature" in preferences or "beach" in preferences:
        db_categories.extend(["Cảnh quan và thiên nhiên"])

    # 1. Query real POIs directly from Supabase PostgreSQL (339 enriched records)
    supabase_pois: list[MatchedPOI] = []
    if len(target_cities) == 2:
        pois_dn = query_pois_from_supabase(["Da Nang"], categories=db_categories if db_categories else None, limit=3)
        pois_hue = query_pois_from_supabase(["Hue"], categories=db_categories if db_categories else None, limit=3)
        supabase_pois = pois_dn + pois_hue
    else:
        supabase_pois = query_pois_from_supabase(target_cities, categories=db_categories if db_categories else None, limit=6)

    # If Supabase query succeeded with items, return them directly!
    if supabase_pois:
        return supabase_pois[:6]

    # Fallback to local dataset ONLY if Supabase connection is offline
    matched: list[MatchedPOI] = []
    all_pois = get_cached_pois()
    food_pois = [p for p in all_pois if p["city"] in target_cities and "Ẩm thực" in p["category"]]
    for fp in food_pois[:3]:
        matched.append(MatchedPOI(
            name=fp["name"],
            category="Ẩm thực địa phương",
            city="Đà Nẵng" if fp["city"] == "Da Nang" else "Huế",
            address=fp["address"],
            description=fp["description"],
            highlight_tag="Đặc sản nổi tiếng",
            estimated_price_range="~35.000 - 90.000 ₫/người",
        ))

    culture_pois = [p for p in all_pois if p["city"] in target_cities and ("Di tích" in p["category"] or "Tâm linh" in p["category"])]
    for cp in culture_pois[:3]:
        matched.append(MatchedPOI(
            name=cp["name"],
            category=cp["category"],
            city="Đà Nẵng" if cp["city"] == "Da Nang" else "Huế",
            address=cp["address"],
            description=cp["description"],
            highlight_tag="Di sản & Văn hóa",
            estimated_price_range="Vé tham quan: 40.000 - 150.000 ₫",
        ))

    return matched[:6]


def generate_daily_itinerary_outline(
    destination: str,
    days: int,
    preferences: list[str],
) -> list[DailyItineraryOutline]:
    """Generates day-by-day outline matching user's exact duration and destination."""
    outlines: list[DailyItineraryOutline] = []

    for d in range(1, days + 1):
        if d == 1:
            theme = "Khởi hành & Thưởng thức tinh hoa ẩm thực địa phương"
            city = "Đà Nẵng" if destination != DestinationType.HUE.value else "Huế"
            activities = [
                "Đón khách, check-in nhận phòng khách sạn / homestay nghỉ ngơi.",
                "Thưởng thức đặc sản mì Quảng / bún bò Huế tại quán ăn địa phương nổi tiếng.",
                "Dạo mát ven sông Hàn ngắm cầu Rồng hoặc ngắm hoàng hôn bên bờ sông Hương.",
            ]
        elif d == 2:
            theme = "Khám phá chiều sâu Di sản Văn hóa & Thắng cảnh lịch sử"
            city = "Đà Nẵng" if destination == DestinationType.DA_NANG.value else "Huế"
            activities = [
                "Buổi sáng: Tham quan Bảo tàng Điêu khắc Chăm hoặc Đại Nội Kinh thành Huế.",
                "Buổi trưa: Trải nghiệm ẩm thực cung đình hoặc cơm niêu đặc sản miền Trung.",
                "Buổi chiều: Ghé thăm chùa Linh Ứng Sơn Trà hoặc chùa Thiên Mụ thanh tịnh.",
            ]
        elif d == 3:
            if destination == DestinationType.BOTH.value:
                theme = "Chuyến tàu Di sản qua Đèo Hải Vân & Vịnh Lăng Cô"
                city = "Liên tỉnh Đà Nẵng - Huế"
                activities = [
                    "Trải nghiệm chuyến tàu hỏa di sản ngắm trọn cảnh sắc vịnh biển Lăng Cô.",
                    "Check-in tại thành phố thứ hai và thưởng thức ẩm thực đặc trưng.",
                    "Tham quan làng nghề nón lá Thủy Xuân hoặc làng chiếu truyền thống.",
                ]
            else:
                theme = "Hành trình Sinh thái, Biển xanh & Tái tạo năng lượng"
                city = "Đà Nẵng" if destination == DestinationType.DA_NANG.value else "Huế"
                activities = [
                    "Đón bình minh tại bãi biển Mỹ Khê hoặc dạo bộ đồi Vọng Cảnh.",
                    "Khám phá danh thắng Ngũ Hành Sơn hoặc hệ thống lăng tẩm Khải Định, Tự Đức.",
                    "Thư giãn với dịch vụ ngâm chân thảo mộc hoặc cafe muối truyền thống.",
                ]
        elif d == 4:
            theme = "Làng nghề thủ công truyền thống & Mua sắm đặc sản Xanh"
            city = destination
            activities = [
                "Ghé thăm chợ truyền thống (Chợ Cồn / Chợ Đông Ba) mua quà đặc sản đóng gói thân thiện.",
                "Trải nghiệm tự tay làm gốm hoặc làm nón lá cùng nghệ nhân bản địa.",
                "Bữa tối ấm cúng và tận hưởng không gian âm nhạc truyền thống.",
            ]
        else:
            theme = f"Ngày {d}: Trải nghiệm tự do & Hoạt động nghỉ dưỡng cá nhân"
            city = destination
            activities = [
                "Tự do khám phá các quán cafe kiến trúc xưa và check-in góc phố cổ.",
                "Tắm biển thư giãn, đạp xe dạo quanh các cung đường sinh thái ven biển.",
                "Thu xếp hành lý, check-out và di chuyển ra sân bay / ga tàu.",
            ]

        outlines.append(DailyItineraryOutline(
            day=d,
            theme=theme,
            focus_city=city,
            suggested_activities=activities,
        ))

    return outlines


def generate_smart_recommendations(
    destination: str,
    days: int,
    budget_tier: BudgetTier,
    preferences: list[str],
) -> list[str]:
    recs: list[str] = []

    # Destination-specific advice
    if destination == DestinationType.DA_NANG.value:
        recs.append("Đà Nẵng: Nên đón bình minh tại Bán đảo Sơn Trà & tắm biển Mỹ Khê; xem Cầu Rồng phun lửa vào cuối tuần.")
    elif destination == DestinationType.HUE.value:
        recs.append("Huế: Dành trọn buổi sáng khám phá Quần thể Di tích Cố đô và chiều tham quan Lăng Khải Định, chùa Thiên Mụ.")
    else:
        recs.append("Hành trình liên tỉnh: Trải nghiệm chuyến tàu hỏa ngắm cảnh qua đèo Hải Vân và vịnh Lăng Cô để có góc nhìn ngoạn mục.")

    # Duration pacing advice
    if days == 1:
        recs.append("Hành trình 1 ngày: Lịch trình sẽ cô đọng tại 2-3 điểm tiêu biểu nhất để tránh di chuyển gấp gáp.")
    elif days in [2, 3]:
        recs.append(f"Hành trình {days} ngày: Thời lượng lý tưởng để cân bằng giữa khám phá di sản và thư giãn.")
    else:
        recs.append(f"Hành trình {days} ngày: Rất thích hợp để kết hợp khám phá chiều sâu các làng nghề truyền thống và danh thắng sinh thái.")

    # Budget tier advice
    if budget_tier == BudgetTier.BUDGET:
        recs.append("Phong cách tiết kiệm: Gợi ý các quán ăn bình dân chuẩn vị địa phương và homestay sinh thái thân thiện.")
    elif budget_tier == BudgetTier.STANDARD:
        recs.append("Phong cách cân bằng: Kết hợp khách sạn tiện nghi 3-4 sao với các trải nghiệm ẩm thực đa dạng.")
    else:
        recs.append("Phong cách cao cấp: Đề xuất các resort nghỉ dưỡng cao cấp bên bờ biển và dịch vụ tour riêng trải nghiệm di sản.")

    # Preferences & Eco tip
    if "eco" in preferences or "nature" in preferences:
        recs.append("Du lịch Xanh: GreenTrip khuyến khích sử dụng xe điện hoặc xe đạp nội đô để giảm phát thải carbon.")
    if "food" in preferences:
        recs.append("Sở thích ẩm thực: Danh sách các quán bánh tráng cuốn thịt heo, mì Quảng và bún bò Huế truyền thống đã được ưu tiên.")

    return recs


def validate_and_process_trip_parameters(params: TripParametersRequest) -> ValidatedTripData:
    daily_budget = round(params.total_budget / (params.days * params.num_people), 2)
    budget_tier = determine_budget_tier(daily_budget)

    points_per_day = len(params.preferences) / params.days
    if points_per_day <= 3:
        pacing_level = "Relaxed"
        pacing_label = "🌿 Thong thả"
        pacing_desc = "Nhịp độ nghỉ dưỡng, phù hợp trải nghiệm sâu và thư giãn."
    elif points_per_day <= 5:
        pacing_level = "Balanced"
        pacing_label = "⚖️ Cân bằng"
        pacing_desc = "Số lượng điểm đến lý tưởng, hài hòa giữa khám phá và nghỉ ngơi."
    else:
        pacing_level = "Fast"
        pacing_label = "⚡ Dày đặc"
        pacing_desc = "Lịch trình di chuyển liên tục, phù hợp cho người thích check-in nhiều địa điểm."

    min_recommended_budget = params.days * params.num_people * 400_000
    is_budget_sufficient = params.total_budget >= min_recommended_budget
    budget_warning = None
    if not is_budget_sufficient:
        budget_warning = (
            f"💡 Mẹo từ GreenTrip: Ngân sách tối thiểu đề xuất cho {params.num_people} người "
            f"đi {params.days} ngày tại {params.destination} là khoảng "
            f"{min_recommended_budget:,.0f} VNĐ để có trải nghiệm cơ bản nhất."
        )
    cost_breakdown = calculate_cost_breakdown(
        total_budget=params.total_budget,
        budget_tier=budget_tier,
        preferences=params.preferences,
    )

    end_date_str: str | None = None
    if params.start_date:
        start_dt = datetime.strptime(params.start_date, "%Y-%m-%d").date()
        end_dt = start_dt + timedelta(days=params.days - 1)
        end_date_str = end_dt.strftime("%Y-%m-%d")

    recommendations = generate_smart_recommendations(
        destination=params.destination,
        days=params.days,
        budget_tier=budget_tier,
        preferences=params.preferences,
    )

    matched_pois = match_real_pois_from_db(
        destination=params.destination,
        budget_tier=budget_tier,
        preferences=params.preferences,
    )

    itinerary_outline = generate_daily_itinerary_outline(
        destination=params.destination,
        days=params.days,
        preferences=params.preferences,
    )

    return ValidatedTripData(
        destination=params.destination,
        days=params.days,
        num_people=params.num_people,
        total_budget=params.total_budget,
        daily_budget_per_person=daily_budget,
        budget_tier=budget_tier,
        pacing_level=pacing_level,
        pacing_label=pacing_label,
        pacing_desc=pacing_desc,
        is_budget_sufficient=is_budget_sufficient,
        min_recommended_budget=min_recommended_budget,
        budget_warning=budget_warning,
        start_date=params.start_date,
        end_date=end_date_str,
        preferences=params.preferences,
        cost_breakdown=cost_breakdown,
        recommendations=recommendations,
        matched_pois=matched_pois,
        itinerary_outline=itinerary_outline,
    )

"""Intent classification, Vietnamese slang/city resolution, and persistent constraint extraction."""
from __future__ import annotations

import re
from typing import Any

from app.trips.schemas import IntentCategoryType, TripContextPayload
from app.trips.text_utils import (
    contains_any_phrase,
    normalize_vietnamese_query,
    strip_vietnamese_accents,
)

def resolve_effective_city(message: str, fallback_dest: str | None = None) -> tuple[str, bool, str]:
    """
    Determine target city from the user's message FIRST, falling back to trip_context.destination
    only when the message does not specify a single city.
    Returns: (sql_city_pattern, is_both, display_city_name)
    """
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)

    da_nang_markers = [
        "đà nẵng", "da nang", "danang", "sơn trà", "mỹ khê", "hải châu",
        "cầu rồng", "ngũ hành sơn", "bà nà", "cầu vàng", "sông hàn", "chợ cồn", "chợ hàn",
    ]
    hue_markers = [
        "huế", "cố đô", "đại nội", "sông hương", "thiên mụ",
        "khải định", "tự đức", "minh mạng", "chợ đông ba", "lăng cô",
    ]

    msg_has_dn = contains_any_phrase(norm_msg, folded_msg, da_nang_markers)
    msg_has_hue = contains_any_phrase(norm_msg, folded_msg, hue_markers, ["hue", "co do"])

    if msg_has_dn and not msg_has_hue:
        return "%Da Nang%", False, "Đà Nẵng"
    if msg_has_hue and not msg_has_dn:
        return "%Hue%", False, "Huế"

    dest_lower = (fallback_dest or "Đà Nẵng").strip().lower()
    dest_folded = strip_vietnamese_accents(dest_lower)
    dest_has_dn = any(k in dest_lower or k in dest_folded for k in ["đà nẵng", "da nang", "danang", "dn"])
    dest_has_hue = any(k in dest_lower or k in dest_folded for k in ["huế", "hue"])

    if dest_has_dn and dest_has_hue:
        return "%", True, "Đà Nẵng & Huế"
    if dest_has_hue:
        return "%Hue%", False, "Huế"
    return "%Da Nang%", False, "Đà Nẵng"


# ============================================================================
# 2. PERSISTENT CONSTRAINTS EXTRACTION
# ============================================================================

CONSTRAINT_PATTERNS: dict[str, list[str]] = {
    "elderly_friendly": [
        "bố mẹ", "ba mẹ", "người lớn tuổi", "người già", "ông bà", "cao tuổi",
        "đau chân", "khó đi bộ", "ít leo trèo", "phụ huynh",
    ],
    "kid_friendly": [
        "trẻ nhỏ", "em bé", "trẻ em", "con nhỏ", "gia đình có bé",
    ],
    "rainy_season": [
        "tháng 10", "tháng 11", "tháng 12", "mùa mưa", "trời mưa", "phương án mưa",
        "trú mưa", "mưa to", "có mái che", "trong nhà",
    ],
    "quiet_vibe": [
        "yên tĩnh", "không ồn ào", "chill", "trong hẻm", "tách biệt", "ít người",
        "vắng vẻ", "làm việc", "đọc sách", "nhẹ nhàng",
    ],
    "vegetarian": [
        "ăn chay", "quán chay", "đồ chay", "thực dưỡng", "thuần chay", "thanh đạm", "vegan",
    ],
    "beach_lover": [
        "thích biển", "tắm biển", "gần biển", "view biển", "biển đẹp",
    ],
    "food_lover": [
        "đồ ăn ngon", "ẩm thực", "ăn ngon", "đặc sản", "tâm hồn ăn uống",
    ],
}


UNACCENTED_CONSTRAINT_PATTERNS: dict[str, list[str]] = {
    "elderly_friendly": [
        "bo me", "ba me", "nguoi lon tuoi", "nguoi gia", "ong ba", "cao tuoi",
        "dau chan", "kho di bo", "it leo treo", "phu huynh",
    ],
    "kid_friendly": [
        "tre nho", "em be", "tre em", "con nho", "gia dinh co be",
    ],
    "rainy_season": [
        "thang 10", "thang 11", "thang 12", "mua mua", "troi mua", "phuong an mua",
        "tru mua", "mua to", "co mai che", "trong nha",
    ],
    "quiet_vibe": [
        "yen tinh", "khong on ao", "chill", "trong hem", "tach biet", "it nguoi",
        "vang ve", "lam viec", "doc sach", "nhe nhang",
    ],
    "vegetarian": [
        "an chay", "quan chay", "do chay", "thuc duong", "thuan chay", "thanh dam", "vegan",
    ],
    "beach_lover": [
        "thich bien", "tam bien", "gan bien", "view bien", "bien dep",
    ],
    "food_lover": [
        "do an ngon", "am thuc", "an ngon", "dac san", "tam hon an uong",
    ],
}


def extract_persistent_constraints(
    message: str,
    trip_context: TripContextPayload,
) -> list[str]:
    """
    Merge existing active_constraints with constraints detected in conversation_history
    and the current message so constraints persist across turns.
    """
    combined_texts = [normalize_vietnamese_query(message)]
    if trip_context.companions:
        combined_texts.append(normalize_vietnamese_query(trip_context.companions))
    for hist in trip_context.conversation_history:
        if hist.get("role") == "user" and hist.get("content"):
            combined_texts.append(normalize_vietnamese_query(hist["content"]))

    full_corpus = " | ".join(combined_texts)
    folded_corpus = strip_vietnamese_accents(full_corpus)
    constraints: list[str] = list(dict.fromkeys(trip_context.active_constraints or []))

    for cname, keywords in CONSTRAINT_PATTERNS.items():
        if (
            contains_any_phrase(
                full_corpus,
                folded_corpus,
                keywords,
                UNACCENTED_CONSTRAINT_PATTERNS.get(cname),
            )
            and cname not in constraints
        ):
            constraints.append(cname)

    return constraints


# ============================================================================
# 3. ENTITY GROUNDING, GEOGRAPHY FACT-CHECKING & FEASIBILITY GUARDRAILS
# ============================================================================

LANDMARK_CITY_KB: dict[str, dict[str, str]] = {
    "cầu vàng": {
        "canonical_name": "Cầu Vàng (Sun World Bà Nà Hills)",
        "real_city": "Đà Nẵng",
        "location_detail": "khu du lịch Sun World Bà Nà Hills (xã Hòa Phú, huyện Hòa Vang, Đà Nẵng)",
        "duration_note": "cần tối thiểu 4–6 tiếng di chuyển cáp treo và tham quan",
    },
    "golden bridge": {
        "canonical_name": "Cầu Vàng (Sun World Bà Nà Hills)",
        "real_city": "Đà Nẵng",
        "location_detail": "khu du lịch Sun World Bà Nà Hills (Đà Nẵng)",
        "duration_note": "cần tối thiểu 4–6 tiếng tham quan",
    },
    "bà nà": {
        "canonical_name": "Bà Nà Hills",
        "real_city": "Đà Nẵng",
        "location_detail": "xã Hòa Phú, huyện Hòa Vang, phía tây Đà Nẵng",
        "duration_note": "ngốn ít nhất 5–6 tiếng (nửa ngày đến trọn ngày)",
    },
    "bán đảo sơn trà": {
        "canonical_name": "Bán đảo Sơn Trà",
        "real_city": "Đà Nẵng",
        "location_detail": "quận Sơn Trà, Đà Nẵng",
        "duration_note": "cần 2–3 tiếng dạo cung đường biển và viếng Chùa Linh Ứng",
    },
    "ngũ hành sơn": {
        "canonical_name": "Danh thắng Ngũ Hành Sơn",
        "real_city": "Đà Nẵng",
        "location_detail": "quận Ngũ Hành Sơn, Đà Nẵng",
        "duration_note": "cần 2–2.5 tiếng tham quan",
    },
    "mỹ khê": {
        "canonical_name": "Bãi biển Mỹ Khê",
        "real_city": "Đà Nẵng",
        "location_detail": "quận Sơn Trà / Ngũ Hành Sơn, Đà Nẵng",
        "duration_note": "nằm ngay trong phố biển Đà Nẵng",
    },
    "đại nội": {
        "canonical_name": "Đại Nội Huế (Hoàng Thành)",
        "real_city": "Huế",
        "location_detail": "bờ Bắc sông Hương, trung tâm TP. Huế",
        "duration_note": "cần 2.5–3.5 tiếng tham quan",
    },
    "lăng khải định": {
        "canonical_name": "Lăng Khải Định (Ứng Lăng)",
        "real_city": "Huế",
        "location_detail": "xã Thủy Bằng, TP. Huế",
        "duration_note": "có 127 bậc thang dốc cao",
    },
    "lăng tự đức": {
        "canonical_name": "Lăng Tự Đức (Khiêm Lăng)",
        "real_city": "Huế",
        "location_detail": "phường Thủy Xuân, TP. Huế",
        "duration_note": "khuôn viên đường phẳng quanh hồ Lưu Khiêm và đồi thông",
    },
    "chùa thiên mụ": {
        "canonical_name": "Chùa Thiên Mụ",
        "real_city": "Huế",
        "location_detail": "đồi Hà Khê, bờ Bắc sông Hương, TP. Huế",
        "duration_note": "cần 1–1.5 tiếng tham quan",
    },
}


def check_geography_and_feasibility(
    message: str,
    trip_context: TripContextPayload,
) -> dict[str, Any] | None:
    """
    Detect geographic misconceptions (e.g., 'Cầu Vàng ở Huế', 'Đại Nội ở Đà Nẵng')
    or impossible 1-day schedules (e.g., Bà Nà + Ngũ Hành Sơn + Hội An + Đại Nội in 1 day).
    """
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)

    # 1. Check Over-scheduling in 1 single day
    single_day_markers = ["trong 1 ngày", "cùng 1 ngày", "một ngày", "1 ngày đi hết", "sáng bà nà"]
    single_day_unaccented = ["trong 1 ngay", "cung 1 ngay", "mot ngay", "1 ngay di het", "sang ba na"]
    zones_mentioned = 0
    if contains_any_phrase(norm_msg, folded_msg, ["bà nà", "cầu vàng"], ["ba na", "cau vang"]):
        zones_mentioned += 1
    if contains_any_phrase(norm_msg, folded_msg, ["ngũ hành sơn", "sơn trà"], ["ngu hanh son", "son tra"]):
        zones_mentioned += 1
    if contains_any_phrase(norm_msg, folded_msg, ["hội an"], ["hoi an"]):
        zones_mentioned += 1
    if contains_any_phrase(
        norm_msg,
        folded_msg,
        ["đại nội", "huế", "lăng khải định", "lăng tự đức", "thiên mụ"],
        ["dai noi", "hue", "co do", "lang khai dinh", "lang tu duc", "thien mu"],
    ):
        zones_mentioned += 1

    has_all_day_slots = (
        contains_any_phrase(norm_msg, folded_msg, ["sáng"], ["sang"])
        and contains_any_phrase(norm_msg, folded_msg, ["trưa"], ["trua"])
        and contains_any_phrase(norm_msg, folded_msg, ["chiều"], ["chieu"])
    )
    if zones_mentioned >= 3 and (
        contains_any_phrase(norm_msg, folded_msg, single_day_markers, single_day_unaccented)
        or has_all_day_slots
    ):
        return {
            "type": "over_scheduling",
            "warning": (
                "Cảnh báo quá tải lịch trình: Bà Nà Hills cần ít nhất 5–6 tiếng di chuyển cáp treo, "
                "Hội An cách Bà Nà ~55km về phía Nam, còn Đại Nội Huế cách Hội An hơn 120km qua đèo Hải Vân."
            ),
        }

    # 2. Check Entity-City Mismatch ("Râu ông nọ cắm cằm bà kia")
    for lm_key, info in LANDMARK_CITY_KB.items():
        if contains_any_phrase(norm_msg, folded_msg, [lm_key], [strip_vietnamese_accents(lm_key)]):
            real_city = info["real_city"]
            wrong_city = "Huế" if real_city == "Đà Nẵng" else "Đà Nẵng"

            # Check if message associates landmark with the wrong city (and is not just comparing the two cities)
            has_danang = contains_any_phrase(norm_msg, folded_msg, ["đà nẵng"], ["da nang", "danang"])
            has_hue = contains_any_phrase(norm_msg, folded_msg, ["huế", "cố đô"], ["hue", "co do"])
            is_comparison = contains_any_phrase(norm_msg, folded_msg, ["hay"], ["hay"]) and has_danang and has_hue
            has_wrong_city = has_hue if wrong_city == "Huế" else has_danang
            if not is_comparison and has_wrong_city:
                # Find the best day in current_itinerary_state matching real_city
                suggested_day = _find_best_day_for_city(trip_context, real_city)
                return {
                    "type": "city_mismatch",
                    "landmark_key": lm_key,
                    "canonical_name": info["canonical_name"],
                    "real_city": real_city,
                    "claimed_city": wrong_city,
                    "location_detail": info["location_detail"],
                    "duration_note": info["duration_note"],
                    "suggested_day": suggested_day,
                    "warning": (
                        f"Đính chính địa lý: {info['canonical_name']} nằm tại {info['location_detail']} "
                        f"thuộc {real_city}, không phải ở {wrong_city} (hai khu vực cách nhau ~100km qua đèo Hải Vân)."
                    ),
                }

    return None


def _find_best_day_for_city(trip_context: TripContextPayload, target_city: str) -> int:
    """Find a suitable day number in the user's trip that focuses on target_city."""
    outline = trip_context.current_itinerary_state or []
    target_lower = target_city.lower()
    matching_days: list[int] = []
    for idx, day_obj in enumerate(outline):
        focus = str(day_obj.get("focus_city") or day_obj.get("title") or "").lower()
        day_num = int(day_obj.get("day") or day_obj.get("day_number") or (idx + 1))
        if target_lower in focus:
            matching_days.append(day_num)
    if matching_days:
        return matching_days[-1]
    if target_city == "Đà Nẵng":
        return min(trip_context.days_count or 4, 2)
    return trip_context.days_count or 4


# ============================================================================
# 4. OUT-OF-SCOPE GUARDRAIL (Rule 5)
# ============================================================================

OUT_OF_SCOPE_PLACES = [
    "hà nội", "ha noi", "sài gòn", "sai gon", "tp hcm", "tphcm", "hồ chí minh", "ho chi minh",
    "đà lạt", "da lat", "phú quốc", "phu quoc", "nha trang", "sapa", "sa pa",
    "hạ long", "ha long", "vũng tàu", "vung tau", "quy nhơn", "quy nhon",
    "cần thơ", "can tho", "hải phòng", "hai phong", "ninh bình", "ninh binh",
    "bắc kinh", "bac kinh", "tokyo", "seoul", "bangkok", "singapore", "paris",
]

OUT_OF_SCOPE_TOPICS = [
    "viết code", "viet code", "code python", "python", "javascript", "typescript",
    "react", "debug", "html", "css", "sql", "lập trình", "lap trinh",
    "thuật toán", "thuat toan", "crawl dữ liệu", "crawl du lieu",
    "giải phương trình", "giai phuong trinh", "giải toán", "giai toan",
    "chứng khoán", "chung khoan", "bitcoin", "crypto",
    "viết văn mẫu", "viet van mau", "dịch sang tiếng", "dich sang tieng",
]

_MATH_ARITHMETIC_RE = re.compile(r"\b\d+(?:[.,]\d+)?\s*[+*×÷/^=]\s*\d+")
_MATH_SUB_EVAL_RE = re.compile(
    r"\b\d+\s*[-+*×÷/]\s*\d+\s*(?:=|bằng\s+mấy|bang\s+may|bằng\s+bao\s+nhiêu|bang\s+bao\s+nhieu)"
)
_MATH_ALGEBRA_RE = re.compile(r"\b(?:tìm|tim)\s+[xyz]\b|\b\d*[xyz]\s*[+\-*/]\s*\d+\s*=")


def is_out_of_scope_query(message: str) -> tuple[bool, str | None]:
    """Return (is_out_of_scope, detected_topic_or_place)."""
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)
    has_central_vn = contains_any_phrase(
        norm_msg,
        folded_msg,
        ["đà nẵng", "huế", "hội an", "miền trung"],
        ["da nang", "danang", "hue", "hoi an", "mien trung"],
    )

    if re.search(r"(?:^|\s)c\+\+(?:\s|$|[?.,!])", folded_msg):
        return True, "c++"

    for topic in OUT_OF_SCOPE_TOPICS:
        folded_topic = strip_vietnamese_accents(topic)
        if re.search(rf"(?<!\w){re.escape(folded_topic)}(?!\w)", folded_msg):
            return True, topic

    if not has_central_vn and (
        _MATH_ARITHMETIC_RE.search(folded_msg)
        or _MATH_SUB_EVAL_RE.search(folded_msg)
        or _MATH_ALGEBRA_RE.search(folded_msg)
    ):
        return True, "toán học"

    if not has_central_vn:
        for place in OUT_OF_SCOPE_PLACES:
            folded_place = strip_vietnamese_accents(place)
            if re.search(rf"(?<!\w){re.escape(folded_place)}(?!\w)", folded_msg):
                return True, place.title()

    return False, None


# ============================================================================
# 5. INTENT ROUTING (4 Canonical Branches + Legacy Sub-Intent Mapping)
# ============================================================================

def classify_copilot_request(
    message: str,
    trip_context: TripContextPayload,
) -> tuple[IntentCategoryType, str, dict[str, Any] | None]:
    """
    Classify user message into:
    - intent_category: 'QA_AND_COMPARE' | 'POI_RECOMMENDATION' | 'ITINERARY_MUTATION' | 'OUT_OF_SCOPE'
    - sub_intent: backward-compatible intent string
    - fact_check: optional dict from check_geography_and_feasibility()
    """
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)

    # 1. Check OUT_OF_SCOPE first
    out_of_scope, oos_target = is_out_of_scope_query(message)
    if out_of_scope:
        return "OUT_OF_SCOPE", "out_of_scope", {"oos_target": oos_target}

    # 2. Check Geography & Feasibility Guardrails
    fact_check = check_geography_and_feasibility(message, trip_context)
    if fact_check:
        if fact_check["type"] == "city_mismatch":
            # If user asked to add/insert into schedule, classify as ITINERARY_MUTATION with fact check
            if contains_any_phrase(
                norm_msg,
                folded_msg,
                ["thêm", "chèn", "đưa", "xếp", "lịch", "ngày"],
                ["them vao", "chen", "dua vao", "xep", "lich", "ngay"],
            ):
                return "ITINERARY_MUTATION", "itinerary_mutation", fact_check
            return "QA_AND_COMPARE", "poi_advice", fact_check
        if fact_check["type"] == "over_scheduling":
            return "QA_AND_COMPARE", "qa_compare", fact_check

    # 3. Check City Comparison / Consultative Decision ("nên đi Đà Nẵng hay Huế?" or pre-trip "nên đi đâu mấy ngày?")
    has_danang = contains_any_phrase(norm_msg, folded_msg, ["đà nẵng"], ["da nang", "danang"])
    has_hue = contains_any_phrase(norm_msg, folded_msg, ["huế"], ["hue"])
    is_city_comparison = (
        bool(re.search(r"(?<!\w)(?:da nang|danang)\s+hay\s+hue(?!\w)", folded_msg))
        or bool(re.search(r"(?<!\w)hue\s+hay\s+(?:da nang|danang)(?!\w)", folded_msg))
        or (contains_any_phrase(norm_msg, folded_msg, ["so sánh"], ["so sanh"]) and has_danang and has_hue)
        or (
            getattr(trip_context, "mode", "trip") == "ideation"
            and contains_any_phrase(
                norm_msg,
                folded_msg,
                ["mấy ngày", "bao nhiêu ngày", "nên đi đâu", "đi bao lâu", "nên ở đâu"],
                ["may ngay", "bao nhieu ngay", "nen di dau", "di bao lau", "nen o dau"],
            )
            and not contains_any_phrase(
                norm_msg,
                folded_msg,
                ["thêm ", "bỏ ", "xóa ", "đổi lịch"],
                ["them vao", "bo bot", "xoa ", "doi lich"],
            )
        )
    )
    if is_city_comparison:
        return "QA_AND_COMPARE", "qa_compare", None

    # 4. Check Explicit Itinerary Mutation (add/remove/swap day/split nights)
    night_split_match = re.search(
        r"(\d+)\s*(?:dem|ngay)\s*(?:o\s*)?(?:da nang|danang).*?(\d+)\s*(?:dem|ngay)\s*(?:o\s*)?(?<!\w)hue(?!\w)",
        folded_msg,
    ) or re.search(
        r"(\d+)\s*(?:dem|ngay)\s*(?:o\s*)?(?<!\w)hue(?!\w).*?(\d+)\s*(?:dem|ngay)\s*(?:o\s*)?(?:da nang|danang)",
        folded_msg,
    )
    has_day_mutation_verb = contains_any_phrase(
        norm_msg,
        folded_msg,
        [
            "bỏ ", "xóa ", "loại bỏ", "đổi lịch", "chuyển lịch", "đảo ngày",
            "từ ngày", "sang ngày", "ra khỏi ngày", "khỏi ngày", "thêm vào ngày",
            "chèn vào ngày", "chia lại ngày", "chia ",
        ],
        [
            "bo bot", "bo qua", "xoa", "loai bo", "doi lich", "chuyen lich", "dao ngay",
            "tu ngay", "sang ngay", "ra khoi ngay", "khoi ngay", "them vao ngay",
            "chen vao ngay", "chia lai",
        ],
    ) and contains_any_phrase(
        norm_msg,
        folded_msg,
        ["ngày", "day", "đêm", "lịch", "hội an", "lăng", "bà nà", "sơn trà", "đại nội"],
        ["ngay", "day", "dem", "lich", "hoi an", "ba na", "son tra", "dai noi"],
    )

    transport_or_eco_hue_keywords = ["tàu hỏa", "tàu hoả", "đèo hải vân", "giao thông xanh", "thủy biều"]
    has_green_train_or_eco_hue = contains_any_phrase(
        norm_msg,
        folded_msg,
        transport_or_eco_hue_keywords,
        ["tau hoa", "deo hai van", "giao thong xanh", "thuy bieu"],
    ) and contains_any_phrase(
        norm_msg,
        folded_msg,
        ["cập nhật", "thay vì", "chặng di chuyển", "trải nghiệm", "lịch", "thêm"],
        ["cap nhat", "thay vi", "chang di chuyen", "trai nghiem", "lich", "them vao"],
    )

    if night_split_match or has_day_mutation_verb or has_green_train_or_eco_hue:
        return "ITINERARY_MUTATION", "itinerary_mutation", None

    # 5. Check Live Schedule / Meal Swap Mutations (compatible with existing tests)
    late_keywords = [
        "trễ giờ", "muộn giờ", "chậm giờ", "không kịp", "cháy giáo án",
        "lỡ giờ", "rút gọn", "tối ưu lại", "tối ưu chiều", "gọn hơn",
        "late", "running late", "delay", "chậm tiến độ", "bị trễ",
    ]
    late_unaccented = [
        "tre gio", "muon gio", "cham gio", "khong kip", "chay giao an",
        "lo gio", "rut gon", "toi uu lai", "toi uu chieu", "gon hon",
        "late", "running late", "delay", "cham tien do", "bi tre",
    ]
    if contains_any_phrase(norm_msg, folded_msg, late_keywords, late_unaccented):
        return "ITINERARY_MUTATION", "late_schedule_adjust", None

    veg_keywords = [
        "quán chay", "ăn chay", "cơm chay", "thực dưỡng", "vegan",
        "vegetarian", "đồ chay", "món chay", "thanh đạm", "thanh tịnh",
        "đổi quán chay", "đổi sang quán chay",
    ]
    veg_unaccented = [
        "quan chay", "an chay", "com chay", "thuc duong", "vegan",
        "vegetarian", "do chay", "mon chay", "thanh dam", "thanh tinh",
        "doi quan chay", "doi sang quan chay",
    ]
    if contains_any_phrase(norm_msg, folded_msg, veg_keywords, veg_unaccented):
        return "ITINERARY_MUTATION", "swap_meal_vegetarian", None

    # 6. Check Elderly / Family Trip Constraint Consultation (when not just asking for a single cafe/food)
    elderly_or_family_trip_query = contains_any_phrase(
        norm_msg,
        folded_msg,
        ["bố mẹ lớn tuổi", "người lớn tuổi", "ông bà", "người già", "đi cùng bố mẹ", "đi với bố mẹ"],
        ["bo me lon tuoi", "nguoi lon tuoi", "ong ba", "nguoi gia", "di cung bo me", "di voi bo me"],
    )
    if elderly_or_family_trip_query and not contains_any_phrase(
        norm_msg,
        folded_msg,
        ["quán cà phê", "quán ăn", "quán chay"],
        ["quan ca phe", "quan cafe", "quan an", "quan chay"],
    ):
        return "QA_AND_COMPARE", "travel_tips_budget", None

    # 7. Check Cafe & Chill Spaces (POI_RECOMMENDATION)
    cafe_keywords = [
        "quán cà phê", "cà phê", "uống trà", "trà quán", "teahouse",
        "specialty coffee", "cà phê muối", "uống nước", "chill", "sống ảo",
        "view biển", "view sông hàn", "ngắm hoàng hôn", "làm việc", "workspace",
    ]
    cafe_unaccented = [
        "quan ca phe", "quan cafe", "ca phe", "cafe", "coffee",
        "uong tra", "tra quan", "teahouse", "ca phe muoi", "uong nuoc",
        "chill", "song ao", "view bien", "view song han", "ngam hoang hon",
        "lam viec", "workspace",
    ]
    if contains_any_phrase(norm_msg, folded_msg, cafe_keywords, cafe_unaccented):
        return "POI_RECOMMENDATION", "cafe_culture", None

    # 8. Check Culinary & Local Dining (POI_RECOMMENDATION)
    culinary_keywords = [
        "quán ăn", "quán ngon", "ăn ngon", "đặc sản", "ăn gì", "món ngon",
        "quán nhậu", "hải sản", "bún chả cá", "mì quảng", "bánh tráng cuốn",
        "bánh xèo", "bò thui", "bún bò", "cơm hến", "bánh bèo", "bánh nậm",
        "bánh lọc", "bánh ép", "nem lụi", "ăn trưa", "ăn tối", "ăn sáng",
        "ẩm thực", "nhà hàng", "quán cơm", "điểm tâm", "món ăn", "chợ hải sản",
        "chè sầu", "ăn vặt", "ốc",
    ]
    culinary_unaccented = [
        "quan an", "quan ngon", "an ngon", "dac san", "an gi", "mon ngon",
        "quan nhau", "hai san", "bun cha ca", "mi quang", "banh trang cuon",
        "banh xeo", "bo thui", "be thui", "bun bo", "com hen", "banh beo",
        "banh nam", "banh loc", "banh ep", "nem lui", "an trua", "an toi",
        "an sang", "am thuc", "nha hang", "quan com", "diem tam", "mon an",
        "cho hai san", "che sau", "che hue", "an vat", "quan oc", "an oc", "oc hut",
    ]
    if contains_any_phrase(norm_msg, folded_msg, culinary_keywords, culinary_unaccented):
        return "POI_RECOMMENDATION", "culinary_guide", None

    # 8b. Check Weather / Climate Overview ("thời tiết tháng 11 thế nào / có hay mưa không?") before generic rain alternatives
    if contains_any_phrase(norm_msg, folded_msg, ["thời tiết"], ["thoi tiet"]) and not contains_any_phrase(
        norm_msg,
        folded_msg,
        ["đi đâu", "tránh mưa", "khỏi ướt", "trong nhà"],
        ["di dau", "tranh mua", "khoi uot", "trong nha"],
    ):
        return "QA_AND_COMPARE", "travel_tips_budget", None

    # 9. Check Rainy Day / Indoor Alternatives (POI_RECOMMENDATION)
    rain_keywords = [
        "mưa", "trời mưa", "mưa to", "mưa bão", "thời tiết xấu",
        "trong nhà", "có mái che", "ướt", "bảo tàng", "rain", "rainy",
    ]
    rain_unaccented = [
        "troi mua", "mua to", "mua bao", "mua lon", "mua rao", "mua dam",
        "thoi tiet xau", "trong nha", "co mai che", "tranh mua", "khoi uot",
        "bao tang", "rain", "rainy",
    ]
    if contains_any_phrase(norm_msg, folded_msg, rain_keywords, rain_unaccented):
        return "POI_RECOMMENDATION", "rainy_day_alternatives", None

    # 10. Check Landmark Feasibility / POI Advice (QA_AND_COMPARE)
    advice_keywords = [
        "có nên đi", "có nên ghé", "có nên tham quan", "có gì hay",
        "có đáng đi", "có nên đến", "tôi có nên đi", "có nên chọn",
        "đáng đi không", "có đẹp không", "chơi gì ở", "có gì đẹp",
        "thế nào", "review", "kinh nghiệm đi",
    ]
    advice_unaccented = [
        "co nen di", "co nen ghe", "co nen tham quan", "co gi hay",
        "co dang di", "co nen den", "toi co nen di", "co nen chon",
        "dang di khong", "co dep khong", "choi gi o", "co gi dep",
        "the nao", "review", "kinh nghiem di",
    ]
    landmark_names = [
        "sơn trà", "cầu rồng", "nam sơn", "linh ứng", "ngũ hành sơn",
        "bàn cờ", "bà nà", "đại nội", "thiên mụ", "khải định",
        "tự đức", "từ hiếu", "tam giang", "mỹ khê", "hải vân", "cầu vàng",
    ]
    landmark_unaccented = [
        "son tra", "cau rong", "chua nam son", "linh ung", "ngu hanh son",
        "dinh ban co", "ba na", "dai noi", "thien mu", "khai dinh",
        "lang tu duc", "chua tu hieu", "tam giang", "my khe", "hai van", "cau vang",
    ]
    if contains_any_phrase(norm_msg, folded_msg, advice_keywords, advice_unaccented):
        return "QA_AND_COMPARE", "poi_advice", None
    if contains_any_phrase(norm_msg, folded_msg, landmark_names, landmark_unaccented) and (
        "?" in norm_msg
        or contains_any_phrase(
            norm_msg,
            folded_msg,
            ["không", "sao", "nên", "thế nào", "gì"],
            ["khong", "sao", "nen", "the nao", "gi"],
        )
    ):
        return "QA_AND_COMPARE", "poi_advice", None

    # 11. Check Night Eco Activities (POI_RECOMMENDATION)
    night_keywords = [
        "buổi tối", "tối nay", "về đêm", "ban đêm", "đi chơi đêm",
        "hoạt động đêm", "trải nghiệm đêm", "ngắm cảnh đêm",
        "phun lửa", "sông hàn", "ca huế", "sông hương", "chợ đêm", "night",
    ]
    night_unaccented = [
        "buoi toi", "toi nay", "ve dem", "ban dem", "di choi dem",
        "hoat dong dem", "trai nghiem dem", "ngam canh dem",
        "phun lua", "song han", "ca hue", "song huong", "cho dem", "night",
    ]
    if contains_any_phrase(norm_msg, folded_msg, night_keywords, night_unaccented):
        return "POI_RECOMMENDATION", "night_eco_activities", None

    # 12. Check Travel Tips, Budget, Transport & Souvenirs (QA_AND_COMPARE)
    tips_keywords = [
        "chi phí", "ngân sách", "bao nhiêu tiền", "tiết kiệm", "kinh nghiệm",
        "thời tiết", "mùa nào", "chuẩn bị gì", "hành lý", "mua quà", "làm quà",
        "quà lưu niệm", "chợ hàn", "chợ cồn", "chợ đông ba", "phương tiện",
        "di chuyển", "xe buýt", "xe bus", "taxi điện", "thuê xe", "xe máy",
        "gia đình", "trẻ em", "em bé", "người già", "người lớn tuổi",
    ]
    tips_unaccented = [
        "chi phi", "ngan sach", "bao nhieu tien", "tiet kiem", "kinh nghiem",
        "thoi tiet", "mua nao", "chuan bi gi", "hanh ly", "mua qua", "lam qua",
        "qua luu niem", "cho han", "cho con", "cho dong ba", "phuong tien",
        "di chuyen", "xe buyt", "xe bus", "taxi dien", "thue xe", "xe may",
        "gia dinh", "tre em", "em be", "nguoi gia", "nguoi lon tuoi",
    ]
    if contains_any_phrase(norm_msg, folded_msg, tips_keywords, tips_unaccented):
        return "QA_AND_COMPARE", "travel_tips_budget", None

    return "QA_AND_COMPARE", "general_chat", None


def build_trip_memory_dict(constraints: list[str], trip_context: TripContextPayload) -> dict[str, str]:
    """Build structured human-readable session memory dictionary for removable UI badges."""
    memory: dict[str, str] = dict(trip_context.trip_memory or {})
    if "elderly_friendly" in constraints:
        memory["elderly_friendly"] = "👴 Đi cùng người lớn tuổi (Ưu tiên đường phẳng, ít bậc thang)"
    if "vegetarian" in constraints:
        memory["vegetarian"] = "🥗 Ưu tiên ẩm thực chay / thực dưỡng"
    if "rainy_season" in constraints:
        memory["rainy_season"] = "🌧️ Dự phòng phương án mưa / trong nhà"
    if "quiet_vibe" in constraints:
        memory["quiet_vibe"] = "🌿 Không gian yên tĩnh, tách biệt ồn ào"
    return memory

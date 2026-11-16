"""Shared POI price display unit normalization across Copilot, POI API, and DB cleanup."""
from __future__ import annotations

import re

_CAFE_CATEGORY_TOKENS = ("cafe", "cà phê", "giải khát", "coffee")

_ALWAYS_DRINK_OR_CHE_TOKENS = (
    " chè ",
    " sinh tố ",
    " nước ép ",
    " trà sữa ",
)

_NOODLE_KEYWORDS = (
    " bún ",
    " mì quảng",
    " phở ",
    " cao lầu",
    " bánh canh",
    " hủ tiếu",
)

_PORTION_KEYWORDS = (
    "bánh tráng cuốn",
    "bánh xèo",
    "bánh bèo",
    "bánh nậm",
    "bánh lọc",
    "bánh ép",
    "nem lụi",
    "cơm hến",
    "cơm gà",
    "cơm niêu",
    "tiệm cơm",
    "cơm chay",
    " healthy food",
    " vegan",
    " chay ",
    "thực dưỡng",
    "ăn vặt",
    " tré ",
    "chả bò",
    " ốc ",
)

_PER_PERSON_KEYWORDS = (
    "hải sản",
    "bé mặn",
    "năm đảnh",
    "nhà hàng",
    "bếp cuốn",
    "restaurant",
    "gogi",
    " lẩu",
    " nướng",
    "bò thui",
    "bê thui",
    "sushi",
    "steak",
)

_DRINK_KEYWORDS = (
    "cafe",
    "cà phê",
    "coffee",
    " trà sữa ",
    " trà chanh ",
    " trà đạo ",
    " quán trà ",
    " trà cung đình ",
    " thưởng trà ",
    " trà thảo mộc ",
    " tea ",
    "teahouse",
    "roastery",
    "sinh tố",
    "nước ép",
    " chè ",
)

_FREE_LANDMARK_KEYWORDS = (
    "linh ứng",
    "thiên mụ",
    "mỹ khê",
    "cầu rồng",
    "vọng cảnh",
    "phố cổ",
)


def normalize_poi_price_display(
    poi_name: str,
    category: str | None = None,
    sub_category: str | None = None,
    raw_price_display: str | None = None,
    estimated_cost: float | None = None,
) -> str:
    """
    Normalize price unit so noodle dishes use '/ tô', specialty rolls/plates use '/ phần',
    restaurants/seafood use '/ người', cafes/drinks/chè use '/ ly', and attractions use '/ vé'
    or 'Miễn phí tham quan'.
    """
    cleaned_name = re.sub(r"[^\w\sÀ-ỹ]", " ", (poi_name or "").lower())
    name_padded = f" {' '.join(cleaned_name.split())} "
    cat_lower = (category or "").lower()
    sub_lower = (sub_category or "").lower()
    raw = (raw_price_display or "").strip()

    if any(k in cat_lower for k in _CAFE_CATEGORY_TOKENS):
        unit = "ly"
        default_range = "35.000 – 65.000 ₫"
    elif any(k in name_padded for k in _ALWAYS_DRINK_OR_CHE_TOKENS):
        unit = "ly"
        default_range = "25.000 – 45.000 ₫"
    elif any(k in name_padded for k in _NOODLE_KEYWORDS):
        unit = "tô"
        default_range = "35.000 – 65.000 ₫"
    elif any(k in name_padded for k in _PORTION_KEYWORDS):
        unit = "phần"
        default_range = "40.000 – 85.000 ₫"
    elif any(k in name_padded for k in _PER_PERSON_KEYWORDS):
        unit = "người"
        default_range = "150.000 – 280.000 ₫"
    elif any(
        k in name_padded or k in cat_lower or k in sub_lower
        for k in _DRINK_KEYWORDS
    ):
        unit = "ly"
        default_range = "35.000 – 65.000 ₫"
    elif any(k in cat_lower for k in ("ẩm thực", "quán ăn", "nhà hàng", "food")):
        unit = "phần"
        default_range = "45.000 – 95.000 ₫"
    elif (not raw or "miễn phí" in raw.lower()) and any(k in name_padded for k in _FREE_LANDMARK_KEYWORDS):
        return "Miễn phí tham quan"
    else:
        unit = "vé"
        default_range = "50.000 – 150.000 ₫"

    if raw:
        if "miễn phí" in raw.lower():
            return "Miễn phí tham quan"
        cleaned_amount = re.sub(
            r"(?:\s*/\s*(?:ly|tô|phần|người|vé|món|suất|ấm|nồi))+\b.*$",
            "",
            raw,
            flags=re.IGNORECASE,
        ).strip()
        if cleaned_amount:
            return f"{cleaned_amount} / {unit}"

    if estimated_cost and estimated_cost > 0:
        cost_int = int(estimated_cost)
        if cost_int < 1000:
            cost_int *= 1000
        low = max(20000, int(round((cost_int * 0.8) / 5000.0) * 5000))
        high = int(round((cost_int * 1.2) / 5000.0) * 5000)
        return f"{low:,} – {high:,} ₫ / {unit}".replace(",", ".")

    return f"{default_range} / {unit}"

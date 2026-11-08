from enum import Enum
from typing import Annotated, Any

from fastapi import Query
from pydantic import BaseModel, ConfigDict

from app.pois.model import POI


class EcoPriorityEnum(str, Enum):
    ALL = "all"
    BASIC = "basic"
    BALANCED = "balanced"
    ECO = "eco"
    PURE = "pure"


class BudgetTierEnum(str, Enum):
    ALL = "all"
    FREE = "free"
    TIER_1 = "$"
    TIER_2 = "$$"
    TIER_3 = "$$$"
    TIER_4 = "$$$$"


ECO_SCORE_MAP: dict[EcoPriorityEnum, int] = {
    EcoPriorityEnum.ALL: 0,
    EcoPriorityEnum.BASIC: 30,
    EcoPriorityEnum.BALANCED: 55,
    EcoPriorityEnum.ECO: 75,
    EcoPriorityEnum.PURE: 90,
}

BUDGET_MAX_MAP: dict[BudgetTierEnum, float | None] = {
    BudgetTierEnum.ALL: None,
    BudgetTierEnum.FREE: 0.0,
    BudgetTierEnum.TIER_1: 100_000.0,
    BudgetTierEnum.TIER_2: 400_000.0,
    BudgetTierEnum.TIER_3: 1_000_000.0,
    BudgetTierEnum.TIER_4: None,
}

BUDGET_SCORE_CAP: float = 1_000_000.0
DEFAULT_MISSING_GREEN_SCORE: float = 0.5
DEFAULT_MISSING_BUDGET_SCORE: float = 0.5
ECO_CERTIFIED_MIN_SCORE: float = 75.0

BUDGET_TIER_SCORE_FALLBACK: dict[str, float] = {
    "free": 1.0,
    "$": 0.9,
    "$$": 0.65,
    "$$$": 0.3,
    "$$$$": 0.0,
}

BUDGET_TIER_ESTIMATED_COST_FALLBACK: dict[str, float] = {
    "free": 0.0,
    "$": 100_000.0,
    "$$": 400_000.0,
    "$$$": 1_000_000.0,
    "$$$$": 1_500_000.0,
}

GREEN_TRANSIT_KEYWORDS: tuple[str, ...] = (
    "transit",
    "bus",
    "bike",
    "bicycle",
    "walk",
    "walking",
    "pedestrian",
    "electric",
    "ev",
    "xe buýt",
    "xe đạp",
    "đi bộ",
    "xe điện",
    "giao thông xanh",
)


class ParsedSliderWeights(BaseModel):
    model_config = ConfigDict(frozen=True)

    green_weight_raw: float
    budget_weight_raw: float
    normalized_green_weight: float
    normalized_budget_weight: float
    min_eco_score: int
    max_budget: float | None = None
    eco_certified_only: bool = False
    green_transit_only: bool = False
    is_ranking_active: bool = False
    is_filtering_active: bool = False
    zero_weights_fallback: bool = False


def normalize_weights(green: float, budget: float) -> tuple[float, float]:
    total = green + budget
    if total <= 0.0:
        return 0.5, 0.5
    norm_green = round(green / total, 4)
    norm_budget = round(1.0 - norm_green, 4)
    return norm_green, norm_budget


def resolve_eco_score_100(green_score: float | None) -> float | None:
    """Quy đổi green_score (thang 0..1 hoặc 0..100) về thang 0..100."""
    if green_score is None:
        return None
    val = float(green_score)
    if val < 0.0:
        return 0.0
    if val <= 1.0:
        return min(100.0, val * 100.0)
    return min(100.0, val)


def compute_green_score_normalized(green_score: float | None) -> float:
    """Chuẩn hóa điểm xanh của POI về khoảng [0.0, 1.0]."""
    eco_100 = resolve_eco_score_100(green_score)
    if eco_100 is None:
        return DEFAULT_MISSING_GREEN_SCORE
    return round(eco_100 / 100.0, 6)


def compute_budget_score_normalized(
    estimated_cost: float | None,
    budget_tier: str | None = None,
) -> float:
    """
    Chuẩn hóa điểm phù hợp ngân sách về khoảng [0.0, 1.0]:
    S_b(p) = max(0, 1 - min(C_p, 1_000_000) / 1_000_000).
    Nếu estimated_cost là None, dùng budget_tier làm fallback; nếu thiếu cả hai, trả về 0.5.
    """
    if estimated_cost is not None:
        cost = max(0.0, float(estimated_cost))
        score = max(0.0, 1.0 - min(cost, BUDGET_SCORE_CAP) / BUDGET_SCORE_CAP)
        return round(score, 6)

    if budget_tier is not None:
        tier_key = budget_tier.strip().lower()
        if tier_key in BUDGET_TIER_SCORE_FALLBACK:
            return BUDGET_TIER_SCORE_FALLBACK[tier_key]

    return DEFAULT_MISSING_BUDGET_SCORE


def compute_poi_weighted_score(poi: POI, weights: ParsedSliderWeights) -> float:
    """
    Tính điểm đa mục tiêu:
    Score(p) = w_g * S_g(p) + w_b * S_b(p)
    """
    s_green = compute_green_score_normalized(poi.green_score)
    s_budget = compute_budget_score_normalized(poi.estimated_cost, poi.budget_tier)
    score = (
        weights.normalized_green_weight * s_green
        + weights.normalized_budget_weight * s_budget
    )
    return round(score, 6)


def is_poi_eco_certified(poi: POI) -> bool:
    """Kiểm tra POI đạt chuẩn Eco-Certified (điểm xanh >= 75 hoặc có eco_features)."""
    eco_100 = resolve_eco_score_100(poi.green_score)
    if eco_100 is not None and eco_100 >= ECO_CERTIFIED_MIN_SCORE:
        return True
    if poi.eco_features and len(poi.eco_features) > 0:
        return True
    return False


def is_poi_green_transit(poi: POI) -> bool:
    """Kiểm tra POI thuận tiện giao thông xanh từ eco_features hoặc ai_metadata."""
    if poi.eco_features:
        for feature in poi.eco_features:
            feat_lower = str(feature).lower()
            if any(kw in feat_lower for kw in GREEN_TRANSIT_KEYWORDS):
                return True

    metadata: dict[str, Any] = poi.ai_metadata or {}
    if metadata.get("green_transit") is True:
        return True
    carbon_score = metadata.get("carbon_footprint_score")
    if isinstance(carbon_score, (int, float)) and float(carbon_score) >= 75.0:
        return True

    return False


def matches_slider_filters(poi: POI, weights: ParsedSliderWeights) -> bool:
    """Kiểm tra các điều kiện lọc cứng của PB08 (độc lập với trọng số xếp hạng)."""
    if weights.min_eco_score > 0:
        eco_100 = resolve_eco_score_100(poi.green_score)
        if eco_100 is None or eco_100 < float(weights.min_eco_score):
            return False

    if weights.max_budget is not None:
        if poi.estimated_cost is not None:
            if float(poi.estimated_cost) > weights.max_budget:
                return False
        elif poi.budget_tier is not None:
            tier_key = poi.budget_tier.strip().lower()
            fallback_cost = BUDGET_TIER_ESTIMATED_COST_FALLBACK.get(tier_key)
            if fallback_cost is None or fallback_cost > weights.max_budget:
                return False
        else:
            return False

    if weights.eco_certified_only and not is_poi_eco_certified(poi):
        return False

    if weights.green_transit_only and not is_poi_green_transit(poi):
        return False

    return True


def parse_slider_weights(
    green_weight: Annotated[
        float | None,
        Query(
            ge=0.0,
            le=100.0,
            description="Trọng số ưu tiên du lịch xanh/bền vững (0.0 - 100.0)",
        ),
    ] = None,
    budget_weight: Annotated[
        float | None,
        Query(
            ge=0.0,
            le=100.0,
            description="Trọng số ưu tiên ngân sách/chi phí (0.0 - 100.0)",
        ),
    ] = None,
    eco_priority: Annotated[
        EcoPriorityEnum | None,
        Query(
            description="Mức phân đoạn du lịch sinh thái (all, basic, balanced, eco, pure)",
        ),
    ] = None,
    budget_tier: Annotated[
        BudgetTierEnum | None,
        Query(
            description="Phân khúc ngân sách (all, free, $, $$, $$$, $$$$)",
        ),
    ] = None,
    eco_certified_only: Annotated[
        bool,
        Query(
            description="Chỉ hiển thị địa điểm có chứng nhận sinh thái (Eco-Certified)",
        ),
    ] = False,
    green_transit_only: Annotated[
        bool,
        Query(
            description="Chỉ hiển thị địa điểm có phương tiện xanh kết nối (Green Transit)",
        ),
    ] = False,
) -> ParsedSliderWeights:
    # 1. Tách ngưỡng lọc cứng (min_eco_score chỉ đến từ eco_priority) khỏi trọng số xếp hạng (green_weight)
    min_eco = ECO_SCORE_MAP.get(eco_priority, 0) if eco_priority is not None else 0

    if green_weight is not None:
        raw_green = float(green_weight)
    elif eco_priority is not None:
        raw_green = float(min_eco) if min_eco > 0 else 50.0
    else:
        raw_green = 50.0

    # 2. Resolve raw budget weight & max_budget
    if budget_weight is not None:
        raw_budget = float(budget_weight)
    else:
        raw_budget = 50.0

    max_budget = BUDGET_MAX_MAP.get(budget_tier) if budget_tier is not None else None

    # 3. Calculate normalized weights (sum to 1.0) & detect 0/0 boundary fallback
    zero_weights_fallback = raw_green == 0.0 and raw_budget == 0.0
    norm_green, norm_budget = normalize_weights(raw_green, raw_budget)

    is_ranking_active = (
        green_weight is not None
        or budget_weight is not None
        or (eco_priority is not None and eco_priority != EcoPriorityEnum.ALL)
    )
    is_filtering_active = (
        min_eco > 0
        or max_budget is not None
        or eco_certified_only
        or green_transit_only
    )

    return ParsedSliderWeights(
        green_weight_raw=raw_green,
        budget_weight_raw=raw_budget,
        normalized_green_weight=norm_green,
        normalized_budget_weight=norm_budget,
        min_eco_score=min_eco,
        max_budget=max_budget,
        eco_certified_only=eco_certified_only,
        green_transit_only=green_transit_only,
        is_ranking_active=is_ranking_active,
        is_filtering_active=is_filtering_active,
        zero_weights_fallback=zero_weights_fallback,
    )


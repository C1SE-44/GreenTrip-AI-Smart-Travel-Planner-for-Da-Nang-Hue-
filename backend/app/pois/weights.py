from enum import Enum
from typing import Annotated

from fastapi import Query
from pydantic import BaseModel, ConfigDict


class EcoPriorityEnum(str, Enum):
    ALL = "all"
    BASIC = "basic"
    BALANCED = "balanced"
    ECO = "eco"
    PURE = "pure"


class BudgetTierEnum(str, Enum):
    ALL = "all"
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
    BudgetTierEnum.TIER_1: 100_000.0,
    BudgetTierEnum.TIER_2: 400_000.0,
    BudgetTierEnum.TIER_3: 1_000_000.0,
    BudgetTierEnum.TIER_4: None,
}


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


def normalize_weights(green: float, budget: float) -> tuple[float, float]:
    total = green + budget
    if total <= 0.0:
        return 0.5, 0.5
    norm_green = round(green / total, 4)
    norm_budget = round(1.0 - norm_green, 4)
    return norm_green, norm_budget


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
            description="Phân khúc ngân sách (all, $, $$, $$$, $$$$)",
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
    # 1. Resolve raw green weight & min_eco_score
    if green_weight is not None:
        raw_green = float(green_weight)
        min_eco = int(round(raw_green))
    elif eco_priority is not None:
        min_eco = ECO_SCORE_MAP.get(eco_priority, 0)
        raw_green = float(min_eco) if min_eco > 0 else 50.0
    else:
        raw_green = 50.0
        min_eco = 0

    # 2. Resolve raw budget weight & max_budget
    if budget_weight is not None:
        raw_budget = float(budget_weight)
    else:
        raw_budget = 50.0

    max_budget = BUDGET_MAX_MAP.get(budget_tier) if budget_tier is not None else None

    # 3. Calculate normalized weights (sum to 1.0)
    norm_green, norm_budget = normalize_weights(raw_green, raw_budget)

    return ParsedSliderWeights(
        green_weight_raw=raw_green,
        budget_weight_raw=raw_budget,
        normalized_green_weight=norm_green,
        normalized_budget_weight=norm_budget,
        min_eco_score=min_eco,
        max_budget=max_budget,
        eco_certified_only=eco_certified_only,
        green_transit_only=green_transit_only,
    )

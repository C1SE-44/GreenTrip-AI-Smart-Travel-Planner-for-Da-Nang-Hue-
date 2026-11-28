"""
GreenTrip Transport Mode Recommendation Service.

Evaluates multi-criteria transport options for itinerary legs (segments):
- Distance, Travel Time, Estimated Cost, Carbon Footprint (CO2e), Feasibility.
- Distinguishes intra-city routes (Đà Nẵng / Huế) from inter-city corridor (Đà Nẵng <-> Huế).
- Supports priority profiles: balanced, eco_priority, budget_constrained, fastest.
- Transparently flags estimated vs verified schedule data.
"""

from __future__ import annotations

import math
from typing import Any, Literal
from pydantic import BaseModel, Field

# Transport mode identifiers
TransportModeId = Literal[
    "walking",
    "bicycle",
    "motorcycle",
    "electric_bus",
    "public_bus",
    "taxi_car",
    "train",
    "tourist_coach",
    "private_car",
]

PriorityProfile = Literal["balanced", "eco_priority", "budget_constrained", "fastest"]

# ------------------------------------------------------------------------------
# Baseline Parameters & Heuristics (Documented & Traceable)
# ------------------------------------------------------------------------------

from app.emission_factors import (
    EMISSION_FACTORS_CONFIG,
    get_emission_factor_g_pkm,
    calculate_carbon_footprint,
)

# Emission factors in grams CO2e per passenger-kilometer (g/p-km)
# Derived from unified emission factors config (Single Source of Truth)
EMISSION_FACTORS_G_PER_PKM: dict[str, float] = {
    mode: cfg["factor_g_pkm"] for mode, cfg in EMISSION_FACTORS_CONFIG.items()
}

# Speeds in meters per second (m/s) & kilometers per hour (km/h)
# Formatted with boarding/waiting overhead buffers in seconds.
TRANSPORT_DYNAMICS: dict[str, dict[str, Any]] = {
    "walking": {
        "speed_mps": 1.25,        # 4.5 km/h
        "fixed_buffer_sec": 0,
        "label": "Đi bộ",
        "icon": "Footprints",
    },
    "bicycle": {
        "speed_mps": 3.89,        # 14.0 km/h
        "fixed_buffer_sec": 60,   # 1 min unlocking/parking
        "label": "Xe đạp",
        "icon": "Bike",
    },
    "motorcycle": {
        "speed_mps_urban": 7.78,    # 28 km/h urban traffic
        "speed_mps_intercity": 11.67,  # 42 km/h via Hải Vân Pass / QL1A
        "fixed_buffer_sec": 120,    # 2 mins parking / gear
        "label": "Xe máy",
        "icon": "Bike",
    },
    "electric_bus": {
        "speed_mps": 5.56,        # 20.0 km/h commercial speed
        "fixed_buffer_sec": 480,  # 8 mins avg waiting & stop dwell time
        "label": "Xe buýt điện",
        "icon": "Bus",
    },
    "public_bus": {
        "speed_mps": 5.0,         # 18.0 km/h
        "fixed_buffer_sec": 600,  # 10 mins waiting
        "label": "Xe buýt công cộng",
        "icon": "Bus",
    },
    "taxi_car": {
        "speed_mps_urban": 8.33,    # 30 km/h urban
        "speed_mps_intercity": 15.28,  # 55 km/h via Hải Vân Tunnel
        "fixed_buffer_sec": 300,    # 5 mins calling & pickup
        "label": "Taxi / Ô tô công nghệ",
        "icon": "Car",
    },
    "train": {
        "speed_mps": 10.56,       # ~38 km/h scenic train ĐN-Huế (103 km in ~2h40m)
        "fixed_buffer_sec": 1500, # 25 mins station check-in & boarding
        "label": "Tàu hỏa (Đà Nẵng - Huế)",
        "icon": "Train",
    },
    "tourist_coach": {
        "speed_mps": 13.89,       # ~50 km/h highway / tunnel
        "fixed_buffer_sec": 900,  # 15 mins pickup & boarding
        "label": "Xe khách / Limousine",
        "icon": "Bus",
    },
    "private_car": {
        "speed_mps_urban": 8.33,
        "speed_mps_intercity": 15.28,
        "fixed_buffer_sec": 180,
        "label": "Ô tô riêng / Thuê xe",
        "icon": "Car",
    },
}

# Cost Models (VND)
# Estimated based on Da Nang / Hue market surveys (2024).
def compute_estimated_cost_vnd(mode: str, distance_meters: float, is_intercity: bool) -> float:
    if not isinstance(distance_meters, (int, float)) or not math.isfinite(distance_meters) or distance_meters < 0:
        distance_meters = 0.0
    dist_km = distance_meters / 1000.0
    if mode == "walking":
        return 0.0
    if mode == "bicycle":
        # Rental option amortized per short trip or 0 for own bike
        return 0.0
    if mode == "electric_bus":
        # Flat fare intra-city Da Nang / Hue public bus
        return 8000.0
    if mode == "public_bus":
        return 8000.0 if not is_intercity else 35000.0
    if mode == "motorcycle":
        # Fuel cost: ~2.2 liters/100km @ 24,000 VND/L -> ~528 VND/km + depreciation -> ~700 VND/km
        # Minimum baseline 5,000 VND
        return max(5000.0, round(dist_km * 700.0, -2))
    if mode == "taxi_car":
        if is_intercity:
            # Fixed tour / taxi package ĐN <-> Huế (~950,000 VND full car, per person ~280,000 VND)
            return 280000.0
        # Urban taxi: 11,000 opening + 14,500/km for next kms
        if dist_km <= 1.0:
            return 11000.0
        return round(11000.0 + (dist_km - 1.0) * 14500.0, -2)
    if mode == "private_car":
        if is_intercity:
            # Gas + highway/tunnel tolls (Hai Van tunnel toll ~110,000 VND) divided by 2 pax
            return max(150000.0, round(dist_km * 1800.0 + 55000.0, -2))
        return max(15000.0, round(dist_km * 2200.0, -2))
    if mode == "train":
        # Ga Đà Nẵng -> Ga Huế soft seat ticket baseline
        return 95000.0
    if mode == "tourist_coach":
        # Limousine / quality coach Da Nang <-> Hue
        return 140000.0
    return 0.0


# Feasibility Rules (Boundary constraints)
def check_feasibility(mode: str, distance_meters: float, is_intercity: bool) -> tuple[bool, str]:
    if not isinstance(distance_meters, (int, float)) or not math.isfinite(distance_meters) or distance_meters < 0:
        distance_meters = 0.0
    dist_km = distance_meters / 1000.0


    if mode == "walking":
        if is_intercity:
            return False, "Không khả thi cho chặng liên tỉnh Đà Nẵng - Huế (> 40km)."
        if dist_km > 3.5:
            return False, f"Khoảng cách {dist_km:.1f} km vượt quá ngưỡng đi bộ hợp lý (tối đa 3.5 km)."
        if dist_km > 2.5:
            return True, f"Khoảng cách {dist_km:.1f} km hơi dài để đi bộ liên tục; phù hợp cho người quen vận động."
        return True, "Phù hợp để dạo bộ, ngắm cảnh phố phường."

    if mode == "bicycle":
        if is_intercity:
            return False, "Không khuyến nghị xe đạp thường qua đèo Hải Vân liên tỉnh."
        if dist_km > 10.0:
            return False, f"Khoảng cách {dist_km:.1f} km quá xa cho xe đạp đô thị."
        return True, "Rất tốt cho sức khỏe và không phát thải."

    if mode == "electric_bus" or mode == "public_bus":
        if is_intercity:
            if mode == "electric_bus":
                return False, "Tuyến buýt điện hiện tại chỉ hoạt động nội thành Đà Nẵng/Huế, chưa có tuyến liên tỉnh."
            return True, "Tuyến xe buýt liên tỉnh QL1A."
        if dist_km < 1.0:
            return False, "Khoảng cách dưới 1 km nên ưu tiên đi bộ thay vì chờ buýt."
        return True, "Phương tiện công cộng xanh, chi phí tiết kiệm."

    if mode == "motorcycle":
        if is_intercity and dist_km > 130.0:
            return False, "Khoảng cách quá lớn cho chuyến phượt xe máy an toàn trong ngày."
        return True, "Linh hoạt di chuyển và chủ động thời gian."

    if mode == "taxi_car" or mode == "private_car":
        if dist_km < 0.4:
            return False, "Khoảng cách quá ngắn (< 400m), không cần thiết dùng ô tô."
        return True, "Tiện nghi, có điều hòa và phù hợp mang nhiều hành lý."

    if mode == "train":
        if not is_intercity:
            return False, "Tàu hỏa chỉ khai thác cho chặng kết nối liên tỉnh Đà Nẵng - Huế."
        return True, "Trải nghiệm ngắm vịnh Lăng Cô và đèo Hải Vân tuyệt đẹp, an toàn cao."

    if mode == "tourist_coach":
        if not is_intercity:
            return False, "Xe khách chất lượng cao chỉ phục vụ tuyến liên tỉnh Đà Nẵng - Huế."
        return True, "Xe chạy êm qua hầm Hải Vân, đón trả linh hoạt."

    return True, "Khả thi."


# ------------------------------------------------------------------------------
# Multi-Criteria Scoring Function (Weighted Sum Model)
# ------------------------------------------------------------------------------

WEIGHTS_BY_PROFILE: dict[PriorityProfile, dict[str, float]] = {
    "balanced": {
        "w_time": 0.35,
        "w_cost": 0.25,
        "w_carbon": 0.25,
        "w_feasibility": 0.15,
    },
    "eco_priority": {
        "w_time": 0.20,
        "w_cost": 0.15,
        "w_carbon": 0.50,
        "w_feasibility": 0.15,
    },
    "budget_constrained": {
        "w_time": 0.20,
        "w_cost": 0.55,
        "w_carbon": 0.10,
        "w_feasibility": 0.15,
    },
    "fastest": {
        "w_time": 0.60,
        "w_cost": 0.15,
        "w_carbon": 0.10,
        "w_feasibility": 0.15,
    },
}


class TransportOptionEvaluation(BaseModel):
    mode: str
    label: str
    icon: str
    duration_seconds: int
    duration_text: str
    transit_duration_seconds: int = 0
    transfer_duration_seconds: int = 0
    distance_meters: float
    estimated_cost_vnd: float
    carbon_g: float
    carbon_kg: float
    score: float
    is_feasible: bool
    feasibility_note: str
    recommendation_type: str = "alternative"  # "best_match" | "cost_saving" | "eco_friendly" | "alternative"
    reason: str
    is_verified_schedule: bool = False
    is_estimated_cost: bool = True
    fare_tier_note: str = "Giá vé tham khảo tiêu chuẩn"
    data_source: str = "Heuristic Model & City Standard Baselines"


def evaluate_segment_transport_options(
    distance_meters: float,
    is_intercity: bool,
    profile: PriorityProfile = "balanced",
    user_preferred_mode: str | None = None,
) -> list[TransportOptionEvaluation]:
    """
    Evaluates all potential transport options for a segment and returns scored options.
    """
    if not isinstance(distance_meters, (int, float)) or not math.isfinite(distance_meters) or distance_meters < 0:
        distance_meters = 0.0

    weights = WEIGHTS_BY_PROFILE.get(profile, WEIGHTS_BY_PROFILE["balanced"])
    dist_km = distance_meters / 1000.0

    # Select candidate modes based on inter-city vs intra-city
    if is_intercity:
        candidates = ["train", "tourist_coach", "taxi_car", "private_car", "motorcycle"]
    else:
        candidates = ["walking", "bicycle", "electric_bus", "motorcycle", "taxi_car"]

    raw_evaluations: list[dict[str, Any]] = []

    for mode in candidates:
        feasible, note = check_feasibility(mode, distance_meters, is_intercity)
        dyn = TRANSPORT_DYNAMICS.get(mode, TRANSPORT_DYNAMICS["motorcycle"])

        # Calculate duration
        if mode == "motorcycle":
            speed = dyn["speed_mps_intercity"] if is_intercity else dyn["speed_mps_urban"]
        elif mode in ("taxi_car", "private_car"):
            speed = dyn["speed_mps_intercity"] if is_intercity else dyn["speed_mps_urban"]
        else:
            speed = dyn.get("speed_mps", 8.0)

        safe_speed = max(0.5, speed if (isinstance(speed, (int, float)) and math.isfinite(speed)) else 8.0)
        pure_transit_sec = max(0, int(distance_meters / safe_speed))
        buffer_sec = int(dyn.get("fixed_buffer_sec", 0))
        duration_sec = pure_transit_sec + buffer_sec
        cost_vnd = max(0.0, compute_estimated_cost_vnd(mode, distance_meters, is_intercity))
        carbon_factor = EMISSION_FACTORS_G_PER_PKM.get(mode, 72.0)
        carbon_g = max(0.0, round(dist_km * carbon_factor, 1))

        raw_evaluations.append({
            "mode": mode,
            "label": dyn["label"],
            "icon": dyn["icon"],
            "duration_seconds": duration_sec,
            "transit_duration_seconds": pure_transit_sec,
            "transfer_duration_seconds": buffer_sec,
            "distance_meters": distance_meters,
            "estimated_cost_vnd": cost_vnd,
            "carbon_g": carbon_g,
            "carbon_kg": round(carbon_g / 1000.0, 3),
            "is_feasible": feasible,
            "feasibility_note": note,
            "is_verified_schedule": mode == "train",  # Vietnam Railways has fixed schedule
            "data_source": "Đường sắt VN / OSRM / Sở GTVT" if mode == "train" else "GreenTrip Urban Heuristics",
        })

    # Find min/max among feasible candidates for min-max normalization
    feasible_items = [item for item in raw_evaluations if item["is_feasible"]]
    if not feasible_items:
        # Fallback: relax feasibility so we don't crash
        feasible_items = raw_evaluations

    min_time = min(item["duration_seconds"] for item in feasible_items)
    max_time = max(item["duration_seconds"] for item in feasible_items) or min_time + 1

    min_cost = min(item["estimated_cost_vnd"] for item in feasible_items)
    max_cost = max(item["estimated_cost_vnd"] for item in feasible_items) or min_cost + 1

    min_carb = min(item["carbon_g"] for item in feasible_items)
    max_carb = max(item["carbon_g"] for item in feasible_items) or min_carb + 1

    results: list[TransportOptionEvaluation] = []

    for item in raw_evaluations:
        if not item["is_feasible"]:
            score = 10.0  # heavily penalized
        else:
            # Lower time is better (invert normalize)
            norm_time = 1.0 - (item["duration_seconds"] - min_time) / (max_time - min_time if max_time > min_time else 1.0)
            # Lower cost is better
            norm_cost = 1.0 - (item["estimated_cost_vnd"] - min_cost) / (max_cost - min_cost if max_cost > min_cost else 1.0)
            # Lower carbon is better
            norm_carb = 1.0 - (item["carbon_g"] - min_carb) / (max_carb - min_carb if max_carb > min_carb else 1.0)
            norm_feas = 1.0

            # BUG-07: Smooth linear decay for walking between 2.5 km and 3.5 km
            if item["mode"] == "walking" and dist_km > 2.5:
                # decay factor from 1.0 at 2.5km down to 0.4 at 3.5km
                decay = max(0.4, 1.0 - (dist_km - 2.5) * 0.6)
                norm_feas *= decay

            # Bonus if matches user preferred mode
            user_pref_bonus = 0.1 if user_preferred_mode and item["mode"] == user_preferred_mode else 0.0

            raw_score = (
                weights["w_time"] * norm_time
                + weights["w_cost"] * norm_cost
                + weights["w_carbon"] * norm_carb
                + weights["w_feasibility"] * norm_feas
                + user_pref_bonus
            )
            score = round(raw_score * 100.0, 1)

        mins = item["duration_seconds"] // 60
        if mins < 60:
            duration_text = f"{mins} phút"
        else:
            hours = mins // 60
            rem = mins % 60
            duration_text = f"{hours}h {rem}p" if rem > 0 else f"{hours} giờ"

        # Generate human-readable reason
        mode = item["mode"]
        if mode == "walking":
            reason = "Cự ly gần, lý tưởng đi bộ ngắm phố và không phát thải CO2."
        elif mode == "bicycle":
            reason = "Phương tiện xanh, năng động và linh hoạt cho cự ly ngắn."
        elif mode == "electric_bus":
            reason = "Buýt điện êm ái, thân thiện môi trường, chi phí siêu tiết kiệm (8k/lượt)."
        elif mode == "motorcycle":
            reason = "Nhanh chóng, cơ động cao, phù hợp lịch trình nhiều điểm dừng."
        elif mode == "train":
            reason = "Chặng đường sắt di sản Đà Nẵng - Huế tuyệt đẹp qua đèo Hải Vân & Lăng Cô."
        elif mode == "tourist_coach":
            reason = "Xe khách cao cấp qua hầm Hải Vân, nhanh và tiết kiệm."
        elif mode in ("taxi_car", "private_car"):
            reason = "Tiện nghi, thoải mái, có điều hòa và phù hợp nhóm đông / hành lý."
        else:
            reason = item["feasibility_note"]

        results.append(TransportOptionEvaluation(
            mode=item["mode"],
            label=item["label"],
            icon=item["icon"],
            duration_seconds=item["duration_seconds"],
            duration_text=duration_text,
            transit_duration_seconds=item.get("transit_duration_seconds", item["duration_seconds"]),
            transfer_duration_seconds=item.get("transfer_duration_seconds", 0),
            distance_meters=item["distance_meters"],
            estimated_cost_vnd=item["estimated_cost_vnd"],
            carbon_g=item["carbon_g"],
            carbon_kg=item["carbon_kg"],
            score=score,
            is_feasible=item["is_feasible"],
            feasibility_note=item["feasibility_note"],
            reason=reason,
            is_verified_schedule=item["is_verified_schedule"],
            is_estimated_cost=True,
            fare_tier_note="Giá vé tham khảo tiêu chuẩn" if item["estimated_cost_vnd"] > 0 else "Miễn phí",
            data_source=item["data_source"],
        ))

    # Tag recommendation types
    # 1. Best match: highest score among feasible
    feasible_results = [r for r in results if r.is_feasible]
    if feasible_results:
        best_match = max(feasible_results, key=lambda x: x.score)
        best_match.recommendation_type = "best_match"

        # 2. Eco friendly: min carbon among feasible
        eco_friendly = min(feasible_results, key=lambda x: (x.carbon_g, -x.score))
        if eco_friendly.mode != best_match.mode:
            eco_friendly.recommendation_type = "eco_friendly"

        # 3. Cost saving: min cost among feasible
        cost_saving = min(feasible_results, key=lambda x: (x.estimated_cost_vnd, -x.score))
        if cost_saving.mode != best_match.mode and cost_saving.mode != eco_friendly.mode:
            cost_saving.recommendation_type = "cost_saving"

    # Sort: feasible first, then descending score
    results.sort(key=lambda x: (x.is_feasible, x.score), reverse=True)
    return results

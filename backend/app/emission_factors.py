"""Unified Carbon Emission Factors Configuration for GreenTrip.

Single Source of Truth for all carbon emissions across:
- Routing Engine
- Transport Mode Recommendation
- Itinerary Constraints & Optimizer
- Chatbot Tool Calling (get_carbon_estimate, get_route_information)
- Frontend API synchronization

Reference:
UK DEFRA 2023 transport emissions factors, adapted for Central Vietnam (Da Nang - Thua Thien Hue)
fleet characteristics (gasoline scooters 110-150cc, VinBus/Danabus transit, Vietnam Railways soft seat).
"""

from typing import Any, Dict, Literal

EmissionUnit = Literal[
    "g_co2e_per_passenger_km",
    "g_co2e_per_vehicle_km",
    "kg_co2e_per_passenger_km",
    "kg_co2e_per_vehicle_km",
]

# Baseline emissions in grams CO2e per passenger-kilometer (g/p-km)
# Basis: Per passenger-km.
EMISSION_FACTORS_CONFIG: Dict[str, Dict[str, Any]] = {
    "walking": {
        "mode": "walking",
        "factor_g_pkm": 0.0,
        "factor_kg_pkm": 0.0,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 1.0,
        "status": "verified_zero_emission",
        "source": "DEFRA 2023 / IPCC Tier 1 (Active Travel)",
        "label_vi": "Đi bộ",
    },
    "bicycle": {
        "mode": "bicycle",
        "factor_g_pkm": 0.0,
        "factor_kg_pkm": 0.0,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 1.0,
        "status": "verified_zero_emission",
        "source": "DEFRA 2023 / IPCC Tier 1 (Active Travel)",
        "label_vi": "Xe đạp",
    },
    "electric_bus": {
        "mode": "electric_bus",
        "factor_g_pkm": 25.0,
        "factor_kg_pkm": 0.025,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 20.0,
        "status": "estimated_vietnam_grid",
        "source": "VinBus Da Nang EV fleet with Vietnam grid emission factor 0.72 kgCO2/kWh",
        "label_vi": "Xe buýt điện",
    },
    "public_bus": {
        "mode": "public_bus",
        "factor_g_pkm": 42.0,
        "factor_kg_pkm": 0.042,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 15.0,
        "status": "estimated",
        "source": "Danabus urban diesel bus network average",
        "label_vi": "Xe buýt công cộng",
    },
    "train": {
        "mode": "train",
        "factor_g_pkm": 35.0,
        "factor_kg_pkm": 0.035,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 0.65,
        "status": "estimated_railway",
        "source": "Vietnam Railways (DSVN) SE/HD diesel-electric Da Nang - Hue line",
        "label_vi": "Tàu hỏa",
    },
    "tourist_coach": {
        "mode": "tourist_coach",
        "factor_g_pkm": 45.0,
        "factor_kg_pkm": 0.045,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 25.0,
        "status": "estimated",
        "source": "Intercity limousine / coach transport across Hai Van pass",
        "label_vi": "Xe khách / Limousine",
    },
    "motorcycle": {
        "mode": "motorcycle",
        "factor_g_pkm": 72.0,
        "factor_kg_pkm": 0.072,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 1.0,
        "status": "verified_vietnam_baseline",
        "source": "UK DEFRA 2023 Scooter 125cc adapted to Vietnam national fleet (72 g CO2e/km)",
        "label_vi": "Xe máy",
    },
    "taxi_car": {
        "mode": "taxi_car",
        "factor_g_pkm": 171.0,
        "factor_kg_pkm": 0.171,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 1.0,
        "status": "verified_fleet_average",
        "source": "Standard 4-seat gasoline taxi, solo traveler baseline (171 g CO2e/p-km)",
        "label_vi": "Taxi",
    },
    "private_car": {
        "mode": "private_car",
        "factor_g_pkm": 114.0,
        "factor_kg_pkm": 0.114,
        "unit": "g_co2e_per_passenger_km",
        "basis": "passenger_km",
        "occupancy_assumption": 1.5,
        "status": "estimated_carpooling",
        "source": "Passenger car with 1.5 average occupancy (171 g/km / 1.5 = 114 g/p-km)",
        "label_vi": "Ô tô cá nhân",
    },
}

# Aliases for cross-module compatibility (e.g. 'car' -> 'taxi_car', 'transit' -> 'public_bus', 'motorbike' -> 'motorcycle')
MODE_ALIAS_MAP: Dict[str, str] = {
    "car": "taxi_car",
    "driving": "taxi_car",
    "taxi": "taxi_car",
    "motorbike": "motorcycle",
    "moto": "motorcycle",
    "bus": "public_bus",
    "transit": "public_bus",
    "walk": "walking",
    "bike": "bicycle",
}


def normalize_mode_key(mode: str) -> str:
    """Resolve alias to standard transport mode key."""
    cleaned = (mode or "").strip().lower()
    return MODE_ALIAS_MAP.get(cleaned, cleaned)


def get_emission_factor_g_pkm(mode: str) -> float:
    """Get emission factor in grams CO2e per passenger-kilometer (g/p-km)."""
    std_mode = normalize_mode_key(mode)
    cfg = EMISSION_FACTORS_CONFIG.get(std_mode)
    if cfg:
        return float(cfg["factor_g_pkm"])
    return 72.0  # default to motorcycle baseline if unknown


def get_emission_factor_kg_pkm(mode: str) -> float:
    """Get emission factor in kilograms CO2e per passenger-kilometer (kg/p-km)."""
    return round(get_emission_factor_g_pkm(mode) / 1000.0, 4)


def calculate_carbon_footprint(
    distance_km: float,
    transport_mode: str,
    passengers: int = 1,
) -> Dict[str, Any]:
    """
    Unified carbon calculation helper for all backend modules.
    """
    std_mode = normalize_mode_key(transport_mode)
    factor_g = get_emission_factor_g_pkm(std_mode)
    safe_dist = max(0.0, float(distance_km))
    safe_passengers = max(1, int(passengers))

    carbon_g_per_person = safe_dist * factor_g
    total_carbon_g = carbon_g_per_person * safe_passengers
    total_carbon_kg = round(total_carbon_g / 1000.0, 3)

    # Solo car baseline for calculating savings
    car_factor_g = get_emission_factor_g_pkm("taxi_car")
    baseline_car_g = safe_dist * car_factor_g * safe_passengers
    baseline_car_kg = round(baseline_car_g / 1000.0, 3)
    saved_kg = round(max(0.0, baseline_car_kg - total_carbon_kg), 3)

    cfg = EMISSION_FACTORS_CONFIG.get(std_mode, {})

    return {
        "transport_mode": std_mode,
        "distance_km": safe_dist,
        "passengers": safe_passengers,
        "factor_g_pkm": factor_g,
        "factor_kg_pkm": round(factor_g / 1000.0, 4),
        "carbon_g": round(total_carbon_g, 1),
        "carbon_kg": total_carbon_kg,
        "baseline_car_kg": baseline_car_kg,
        "saved_co2_kg": saved_kg,
        "status": cfg.get("status", "estimated"),
        "source": cfg.get("source", "Standard baseline"),
    }

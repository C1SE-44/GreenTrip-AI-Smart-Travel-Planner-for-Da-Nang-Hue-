"""Standalone unit & regression tests for #PB27 (Transport Mode Recommendation & Routing)."""

from app.emission_factors import (
    calculate_carbon_footprint,
    get_emission_factor_g_pkm,
    normalize_mode_key,
)
from app.itineraries.service import RouteStop, build_day_segments
from app.itineraries.transport_service import evaluate_segment_transport_options


def test_emission_factors_single_source_of_truth() -> None:
    assert normalize_mode_key("car") == "taxi_car"
    assert normalize_mode_key("driving") == "taxi_car"
    assert normalize_mode_key("transit") == "public_bus"
    assert get_emission_factor_g_pkm("car") == 171.0
    assert get_emission_factor_g_pkm("motorcycle") == 72.0
    assert get_emission_factor_g_pkm("public_bus") == 42.0
    assert get_emission_factor_g_pkm("walking") == 0.0
    assert get_emission_factor_g_pkm("bicycle") == 0.0

    result = calculate_carbon_footprint(20.0, "car")
    assert result["carbon_kg"] == 3.42
    assert result["carbon_g"] == 3420.0


def test_evaluate_segment_transport_options_urban_and_intercity() -> None:
    # Short urban segment (~1.2 km): walking and bicycle should be feasible
    short_opts = evaluate_segment_transport_options(1200.0, is_intercity=False, profile="eco_priority")
    short_modes = {o.mode: o for o in short_opts}
    assert short_modes["walking"].is_feasible is True
    assert short_modes["bicycle"].is_feasible is True
    assert short_modes["walking"].carbon_kg == 0.0

    # Long urban segment (~8.5 km): walking should not be feasible, motorcycle/bus feasible
    medium_opts = evaluate_segment_transport_options(8500.0, is_intercity=False, profile="balanced")
    medium_modes = {o.mode: o for o in medium_opts}
    assert medium_modes["walking"].is_feasible is False
    assert medium_modes["motorcycle"].is_feasible is True

    # Intercity Da Nang <-> Hue (~110 km): train and tourist_coach offered, walking not offered
    intercity_opts = evaluate_segment_transport_options(110_000.0, is_intercity=True, profile="eco_priority")
    intercity_modes = {o.mode: o for o in intercity_opts}
    assert "train" in intercity_modes
    assert "tourist_coach" in intercity_modes
    assert "walking" not in intercity_modes
    assert intercity_modes["train"].is_feasible is True
    assert intercity_modes["train"].is_verified_schedule is True


def test_build_day_segments_intercity_and_totals_consistency() -> None:
    stops = [
        RouteStop(order=1, poi_id="dn-1", name="Cầu Rồng", latitude=16.0611, longitude=108.2275, city="Da Nang"),
        RouteStop(order=2, poi_id="dn-2", name="Chợ Hàn", latitude=16.0680, longitude=108.2240, city="Da Nang"),
        RouteStop(order=3, poi_id="hue-1", name="Đại Nội Huế", latitude=16.4698, longitude=107.5786, city="Hue"),
    ]
    segments, total_cost, total_carbon = build_day_segments(
        stops, profile="balanced", custom_modes={1: "train"}
    )
    assert len(segments) == 2
    assert total_cost > 0
    assert total_carbon > 0

    # Leg 0: intra-city Da Nang
    assert segments[0].is_intercity is False
    # Leg 1: Da Nang -> Hue intercity corridor, overridden to train
    assert segments[1].is_intercity is True
    assert segments[1].selected_mode == "train"
    assert segments[1].duration_seconds == (
        segments[1].transit_duration_seconds + segments[1].transfer_duration_seconds
    )

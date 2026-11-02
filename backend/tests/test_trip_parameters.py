from datetime import date, timedelta
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_validate_parameters_success_da_nang() -> None:
    payload = {
        "destination": "Đà Nẵng",
        "days": 3,
        "total_budget": 6000000.0,
        "num_people": 2,
        "preferences": ["beach", "food"],
    }
    response = client.post("/trips/validate-parameters", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is True
    trip_data = data["data"]
    assert trip_data["destination"] == "Đà Nẵng"
    assert trip_data["days"] == 3
    assert trip_data["num_people"] == 2
    assert trip_data["total_budget"] == 6000000.0
    assert trip_data["daily_budget_per_person"] == 1000000.0  # 6M / (3 * 2) = 1M
    assert trip_data["budget_tier"] == "standard"
    assert "beach" in trip_data["preferences"]
    assert "food" in trip_data["preferences"]

    # Verify cost breakdown (35% accommodation, 30% food, 20% transport, 15% activities)
    cb = trip_data["cost_breakdown"]
    assert cb["accommodation"] == 2100000.0
    assert cb["food_and_beverage"] == 1800000.0
    assert cb["transportation"] == 1200000.0
    assert cb["activities_and_tickets"] == 900000.0

    # Verify recommendations
    assert len(trip_data["recommendations"]) > 0


def test_validate_parameters_success_hue() -> None:
    payload = {
        "destination": "Huế",
        "days": 2,
        "total_budget": 1200000.0,
        "num_people": 1,
        "preferences": ["culture"],
    }
    response = client.post("/trips/validate-parameters", json=payload)
    assert response.status_code == 200
    data = response.json()

    trip_data = data["data"]
    assert trip_data["destination"] == "Huế"
    assert trip_data["days"] == 2
    assert trip_data["daily_budget_per_person"] == 600000.0
    assert trip_data["budget_tier"] == "budget"
    assert any("Huế" in rec for rec in trip_data["recommendations"])


def test_validate_parameters_destination_normalization() -> None:
    # Test normalization of "danang", "hue", and "da nang & hue"
    for dest_input, expected in [
        ("danang", "Đà Nẵng"),
        ("da nang", "Đà Nẵng"),
        ("hue", "Huế"),
        ("thừa thiên huế", "Huế"),
        ("da nang & hue", "Đà Nẵng & Huế"),
        ("cả hai", "Đà Nẵng & Huế"),
    ]:
        res = client.post(
            "/trips/validate-parameters",
            json={
                "destination": dest_input,
                "days": 3,
                "total_budget": 3000000.0,
                "num_people": 1,
            },
        )
        assert res.status_code == 200
        assert res.json()["data"]["destination"] == expected


def test_validate_parameters_with_future_start_date() -> None:
    tomorrow = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    expected_end = (date.today() + timedelta(days=3)).strftime("%Y-%m-%d")

    payload = {
        "destination": "Đà Nẵng",
        "days": 3,
        "total_budget": 3000000.0,
        "num_people": 1,
        "start_date": tomorrow,
    }
    response = client.post("/trips/validate-parameters", json=payload)
    assert response.status_code == 200
    trip_data = response.json()["data"]
    assert trip_data["start_date"] == tomorrow
    assert trip_data["end_date"] == expected_end


def test_validate_parameters_budget_tiers() -> None:
    # 1. Budget (< 700k/person/day): 500k/day
    res_budget = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 1, "total_budget": 500000.0, "num_people": 1},
    )
    assert res_budget.status_code == 200
    assert res_budget.json()["data"]["budget_tier"] == "budget"

    # 2. Standard (700k - 2.5M/person/day): 1.5M/day
    res_standard = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 1, "total_budget": 1500000.0, "num_people": 1},
    )
    assert res_standard.status_code == 200
    assert res_standard.json()["data"]["budget_tier"] == "standard"

    # 3. Luxury (>= 2.5M/person/day): 3M/day
    res_luxury = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 1, "total_budget": 3000000.0, "num_people": 1},
    )
    assert res_luxury.status_code == 200
    assert res_luxury.json()["data"]["budget_tier"] == "luxury"


def test_validate_parameters_invalid_days_zero_or_negative() -> None:
    # Days = 0
    res = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 0, "total_budget": 2000000.0},
    )
    assert res.status_code == 422

    # Days = -3
    res_neg = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": -3, "total_budget": 2000000.0},
    )
    assert res_neg.status_code == 422


def test_validate_parameters_invalid_days_exceed_max() -> None:
    # Max allowed is 14 days
    res = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 15, "total_budget": 10000000.0},
    )
    assert res.status_code == 422


def test_validate_parameters_invalid_budget_zero_or_negative() -> None:
    res = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 3, "total_budget": 0},
    )
    assert res.status_code == 422

    res_neg = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 3, "total_budget": -50000.0},
    )
    assert res_neg.status_code == 422


def test_validate_parameters_insufficient_budget_for_duration() -> None:
    # Minimum required is 200,000 VND / person / day
    # For 3 days and 2 people -> minimum is 1,200,000 VND
    # Sending 500,000 VND should fail validation
    res = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Đà Nẵng",
            "days": 3,
            "total_budget": 500000.0,
            "num_people": 2,
        },
    )
    assert res.status_code == 422
    data = res.json()
    error_msg = str(data["detail"])
    assert "Ngân sách không đủ" in error_msg


def test_validate_parameters_both_cities_requires_min_2_days() -> None:
    # Combined Da Nang - Hue trip with only 1 day is not feasible
    res = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Đà Nẵng & Huế",
            "days": 1,
            "total_budget": 1000000.0,
            "num_people": 1,
        },
    )
    assert res.status_code == 422
    error_msg = str(res.json()["detail"])
    assert "tối thiểu 2 ngày" in error_msg


def test_validate_parameters_invalid_destination() -> None:
    res = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Tokyo",
            "days": 3,
            "total_budget": 5000000.0,
        },
    )
    assert res.status_code == 422
    error_msg = str(res.json()["detail"])
    assert "Điểm đến chỉ hỗ trợ" in error_msg


def test_validate_parameters_invalid_num_people() -> None:
    # 0 people
    res_zero = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 3, "total_budget": 2000000.0, "num_people": 0},
    )
    assert res_zero.status_code == 422

    # > 20 people
    res_over = client.post(
        "/trips/validate-parameters",
        json={"destination": "Đà Nẵng", "days": 3, "total_budget": 20000000.0, "num_people": 25},
    )
    assert res_over.status_code == 422


def test_validate_parameters_start_date_in_past() -> None:
    yesterday = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    res = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Đà Nẵng",
            "days": 3,
            "total_budget": 3000000.0,
            "start_date": yesterday,
        },
    )
    assert res.status_code == 422
    error_msg = str(res.json()["detail"])
    assert "không được ở trong quá khứ" in error_msg


def test_validate_parameters_matched_pois_from_database() -> None:
    res = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Đà Nẵng",
            "days": 3,
            "total_budget": 6000000.0,
            "num_people": 2,
            "preferences": ["food", "culture"],
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    matched = data["matched_pois"]
    assert len(matched) > 0

    first = matched[0]
    assert "name" in first
    assert "category" in first
    assert "city" in first
    assert "estimated_price_range" in first
    assert "highlight_tag" in first

    # Check itinerary outline
    outline = data["itinerary_outline"]
    assert len(outline) == 3
    assert outline[0]["day"] == 1
    assert len(outline[0]["suggested_activities"]) > 0


def test_validate_parameters_dynamic_percentage_breakdown() -> None:
    # 1. Budget tier with food preference
    res_budget = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Huế",
            "days": 2,
            "total_budget": 1000000.0,
            "num_people": 1,
            "preferences": ["food"],
        },
    )
    assert res_budget.status_code == 200
    pct_budget = res_budget.json()["data"]["cost_breakdown"]["percentage_breakdown"]
    # Food is prioritized in budget tier
    assert pct_budget["food_and_beverage"] >= 38

    # 2. Luxury tier
    res_lux = client.post(
        "/trips/validate-parameters",
        json={
            "destination": "Đà Nẵng",
            "days": 3,
            "total_budget": 20000000.0,
            "num_people": 2,
            "preferences": ["beach"],
        },
    )
    assert res_lux.status_code == 200
    pct_lux = res_lux.json()["data"]["cost_breakdown"]["percentage_breakdown"]
    # Accommodation is prioritized in luxury tier
    assert pct_lux["accommodation"] >= 45

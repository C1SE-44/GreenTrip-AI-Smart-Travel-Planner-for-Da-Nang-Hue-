"""Tests for curated 160 stays pipeline, insert-only importer, and backend stay support."""

from __future__ import annotations

import csv
import json
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.main  # noqa: F401
from app.pois.price_normalizer import normalize_poi_price_display
from app.pois.repository import CATEGORY_ALIAS_MAP
from app.trips import itinerary_constraints
from scripts.curate_top_stays import (
    STAY_CATEGORY_NAME,
    UNIFIED_CSV_HEADERS,
    select_curated_stays,
)
from scripts.import_curated_stays import load_curated_stays_csv, parse_curated_stay_row


def _make_stay_row(
    *,
    city_code: str = "DANANG",
    sub_category: str = "homestay",
    budget_tier: str = "$$",
    name: str = "Green Eco Homestay",
    green_score: float = 0.85,
    sat_score: float = 4.7,
    review_count: int = 120,
    estimated_cost: str = "850000",
    poi_id: str | None = None,
) -> dict[str, str]:
    pid = poi_id or str(uuid.uuid4())
    return {
        "poi_id": pid,
        "city_code": city_code,
        "city_name": "Da Nang" if city_code == "DANANG" else "Hue",
        "category": STAY_CATEGORY_NAME,
        "sub_category": sub_category,
        "cuisine": "",
        "name": name,
        "description": "Cơ sở lưu trú thân thiện môi trường.",
        "address": "10 Võ Nguyên Giáp, Đà Nẵng",
        "latitude": "16.0544",
        "longitude": "108.2428",
        "phone_number": "",
        "website_url": "",
        "email": "",
        "social_links": "{}",
        "opening_hours": "{}",
        "image_url": f"https://example.com/{pid}.jpg",
        "gallery_urls": json.dumps([f"https://example.com/{pid}.jpg"]),
        "estimated_cost": estimated_cost,
        "budget_tier": budget_tier,
        "average_visit_minutes": "720",
        "satisfaction_score": str(sat_score),
        "popularity_score": "0.80",
        "green_score": str(green_score),
        "is_local_business": "true",
        "local_business_type": "eco_accommodation",
        "vibes": "[]",
        "best_time": "[]",
        "eco_features": '["Tiết kiệm năng lượng"]',
        "status": "ACTIVE",
        "is_active": "true",
        "ai_metadata": json.dumps(
            {
                "verification_status": "VERIFIED_ACTIVE",
                "review_count": review_count,
                "price_range_display": "850.000 ₫",
            },
            ensure_ascii=False,
        ),
    }


def test_select_curated_stays_balances_budget_tiers_and_backfills() -> None:
    rows: list[dict[str, str]] = []
    tiers = ["$", "$$", "$$$"]
    # Build 6 DANANG homestays (across 3 tiers) + 4 resorts for backfill when quota=8
    for i in range(6):
        rows.append(
            _make_stay_row(
                city_code="DANANG",
                sub_category="homestay",
                budget_tier=tiers[i % 3],
                name=f"DN Homestay {i}",
                green_score=0.90 - i * 0.01,
            )
        )
    for i in range(4):
        rows.append(
            _make_stay_row(
                city_code="DANANG",
                sub_category="resort",
                budget_tier=tiers[i % 3],
                name=f"DN Resort {i}",
            )
        )
    for i in range(4):
        rows.append(
            _make_stay_row(
                city_code="HUE",
                sub_category="homestay",
                budget_tier=tiers[i % 3],
                name=f"Hue Homestay {i}",
            )
        )

    quotas = {
        "DANANG": {"homestay": 8, "resort": 0},
        "HUE": {"homestay": 4, "resort": 0},
    }
    selected, report = select_curated_stays(rows, city_quotas=quotas, verify_images=False)
    assert len(selected) == 12
    assert report["by_city"] == {"DANANG": 8, "HUE": 4}
    assert "DANANG" in report["backfill_notes"]
    assert all(
        json.loads(r["ai_metadata"])["price_range_display"].endswith("/ đêm")
        for r in selected
    )
    dn_tiers = {r["budget_tier"] for r in selected if r["city_code"] == "DANANG"}
    assert dn_tiers == {"$", "$$", "$$$"}


def test_curated_stays_160_csv_integrity() -> None:
    csv_path = PROJECT_ROOT / "data" / "processed" / "curated_stays_160.csv"
    assert csv_path.exists(), f"Missing curated stays CSV: {csv_path}"

    rows = load_curated_stays_csv(csv_path)
    assert len(rows) == 160
    assert len({r.poi_id for r in rows}) == 160
    assert sum(1 for r in rows if r.city_code == "DANANG") == 80
    assert sum(1 for r in rows if r.city_code == "HUE") == 80

    for row in rows:
        assert row.category == STAY_CATEGORY_NAME
        assert 0.0 <= row.green_score <= 1.0
        assert row.satisfaction_score is not None and 0.0 <= row.satisfaction_score <= 5.0
        assert 1 <= row.average_visit_minutes <= 1440
        assert row.estimated_cost is None or row.estimated_cost >= 0.0
        price_disp = str(row.ai_metadata.get("price_range_display") or "")
        assert price_disp.endswith("/ đêm"), f"Unexpected price unit for {row.name}: {price_disp!r}"

    with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == UNIFIED_CSV_HEADERS


def test_importer_rejects_non_stay_and_migration_018_violations() -> None:
    bad_cat = _make_stay_row()
    bad_cat["category"] = "Ẩm thực và quán ăn"
    with pytest.raises(ValueError, match="expected category"):
        parse_curated_stay_row(bad_cat, 2)

    bad_green = _make_stay_row(green_score=1.2)
    with pytest.raises(ValueError, match="green_score"):
        parse_curated_stay_row(bad_green, 3)

    bad_cost = _make_stay_row(estimated_cost="-50000")
    with pytest.raises(ValueError, match="estimated_cost"):
        parse_curated_stay_row(bad_cost, 4)

    bad_minutes = _make_stay_row()
    bad_minutes["average_visit_minutes"] = "2000"
    with pytest.raises(ValueError, match="average_visit_minutes"):
        parse_curated_stay_row(bad_minutes, 5)


def test_backend_stay_aliases_price_normalizer_and_itinerary_exclusion(monkeypatch: pytest.MonkeyPatch) -> None:
    assert CATEGORY_ALIAS_MAP["luu-tru"] == ["Lưu trú và nghỉ dưỡng"]
    assert CATEGORY_ALIAS_MAP["lưu trú"] == ["Lưu trú và nghỉ dưỡng"]

    # Even if stay name contains cafe/seafood keywords, stay category enforces '/ đêm'
    assert (
        normalize_poi_price_display(
            poi_name="Cafe Boutique Homestay Đà Nẵng",
            category="Lưu trú và nghỉ dưỡng",
            sub_category="homestay",
            raw_price_display="750.000 ₫",
            estimated_cost=750000,
        )
        == "750.000 ₫ / đêm"
    )
    assert (
        normalize_poi_price_display(
            poi_name="Sea Food Resort Hue",
            category="Lưu trú và nghỉ dưỡng",
            sub_category="resort",
            raw_price_display=None,
            estimated_cost=1200000,
        ).endswith("/ đêm")
    )

    assert itinerary_constraints._is_stay_category("Lưu trú và nghỉ dưỡng") is True
    assert itinerary_constraints._is_stay_category("Di tích lịch sử và văn hóa") is False

    fake_recs = [
        {
            "poi_id": "stay-1",
            "name": "Budget Stay Hue",
            "category": "Lưu trú và nghỉ dưỡng",
            "sub_category": "homestay",
            "city_code": "HUE",
            "estimated_cost": 10000,
            "green_score": 95,
            "address": "Hue",
        },
        {
            "poi_id": "sight-1",
            "name": "Chùa Thiên Mụ",
            "category": "Tâm linh và chùa thiền",
            "sub_category": "historic_zen_temples",
            "city_code": "HUE",
            "estimated_cost": 0,
            "green_score": 92,
            "address": "Huế",
        },
    ]
    monkeypatch.setattr(
        itinerary_constraints,
        "_load_poi_reference_index",
        lambda: ({}, {}, fake_recs),
    )
    candidate = itinerary_constraints._find_cheaper_poi_candidate(
        stop={"name": "Đại Nội Huế", "category": "di-tich", "address": "Huế"},
        city_display="Huế",
        max_unit_cost=50000,
        existing_names=set(),
        constraints=[],
        connection=None,
    )
    assert candidate is not None
    assert candidate["poi_id"] == "sight-1"

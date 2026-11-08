"""Unit tests for Taxonomy V2 POI classification logic."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.classify_poi_taxonomy import classify_poi


def test_classify_vegetarian_food():
    res = classify_poi(
        name="An Nhiên Garden Vegetarian Restaurant & Cafe",
        category_name="Ẩm thực và quán ăn",
    )
    assert res["sub_category"] == "green_vegetarian"
    assert res["cuisine"] == "plant_based_vegan"
    assert res["budget_tier"] == "$$"
    assert "Thuần chay" in res["eco_features"]
    assert res["ai_metadata"]["carbon_footprint_score"] == 10
    assert res["ai_metadata"]["rainy_day_friendly"] is True


def test_classify_western_pizza():
    res = classify_poi(
        name="Pizza 4P's Hoàng Văn Thụ Đà Nẵng",
        category_name="Ẩm thực và quán ăn",
    )
    assert res["sub_category"] == "western_international"
    assert res["cuisine"] == "italian_pizza"
    assert res["budget_tier"] == "$$$"
    assert res["ai_metadata"]["rainy_day_friendly"] is True


def test_classify_traditional_noodles():
    res = classify_poi(
        name="Bún Bò Huế Mệ Kéo",
        category_name="Ẩm thực và quán ăn",
    )
    assert res["sub_category"] == "traditional_noodles"
    assert res["cuisine"] == "vietnamese_local"
    assert res["budget_tier"] == "$"


def test_classify_coastal_seafood():
    res = classify_poi(
        name="Hải Sản Bé Mặn (Đạt chuẩn MICHELIN Selected)",
        category_name="Ẩm thực và quán ăn",
    )
    assert res["sub_category"] == "coastal_seafood"
    assert res["cuisine"] == "vietnamese_local"
    assert "Gió biển" in res["vibes"]


def test_classify_workspace_cafe():
    res = classify_poi(
        name="5AM Coffee – Workspace 24/7",
        category_name="Quán cafe giải khát",
    )
    assert res["sub_category"] == "workspace_study_cafe"
    assert res["cuisine"] is None
    assert "digital_nomad" in res["ai_metadata"]["dna_tags"]


def test_classify_beach_coastline():
    res = classify_poi(
        name="Bãi Biển Mỹ Khê",
        category_name="Cảnh quan và thiên nhiên",
    )
    assert res["sub_category"] == "beach_coastline"
    assert res["budget_tier"] == "free"
    assert res["ai_metadata"]["rainy_day_friendly"] is False


def test_classify_imperial_citadel():
    res = classify_poi(
        name="Đại Nội Huế – Hoàng Thành & Tử Cấm Thành (Di Sản Văn Hóa Thế Giới UNESCO)",
        category_name="Di tích lịch sử và văn hóa",
    )
    assert res["sub_category"] == "imperial_citadel"
    assert res["budget_tier"] == "$$"
    assert res["ai_metadata"]["heritage_impact_score"] == 100


def test_classify_historic_zen_temple():
    res = classify_poi(
        name="Chùa Thiên Mụ (Linh Mụ Tự – 'Đệ Nhất Cổ Tự' Biểu Tượng Của Cố Đô Huế)",
        category_name="Tâm linh và chùa thiền",
    )
    assert res["sub_category"] == "historic_zen_temples"
    assert res["budget_tier"] == "free"
    assert res["ai_metadata"]["noise_pace"] == "peaceful_zen"

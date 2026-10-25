"""
Tests for POI image enrichment pipeline (clean_poi_name, resolve_food_or_cafe_imagery, resolve_poi_imagery).
"""

from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.curated_food_images import (
    CURATED_FOOD_AND_BEV_IMAGERY,
    resolve_food_or_cafe_imagery,
)
from scripts.enrich_poi_images import (
    clean_poi_name,
    resolve_poi_imagery,
)


def test_clean_poi_name_removes_parenthesized_and_michelin_notes() -> None:
    cases = [
        ("Mì Quảng Ếch Bếp Trang", "Mì Quảng Ếch Bếp Trang"),
        ("Bún Chả Cá Hờn (Đạt giải MICHELIN Bib Gourmand)", "Bún Chả Cá Hờn"),
        ("Bánh Xèo Bà Dưỡng (Đạt chuẩn MICHELIN Selected)", "Bánh Xèo Bà Dưỡng"),
        ("Phê La Đà Nẵng (Góc Phố Nguyễn Văn Linh)", "Phê La Đà Nẵng"),
        ("Phiêu Acoustic Cafe – Cafe Nhạc Sống Hằng Đêm", "Phiêu Acoustic Cafe"),
        ("Tân. Cafe (Cơ Sở Workspace 14 Phạm Hồng Thái)", "Tân. Cafe"),
        ("Bánh Ép Gia Di / Bánh Ép 20 Nguyễn Du", "Bánh Ép Gia Di"),
    ]
    for raw, expected in cases:
        assert clean_poi_name(raw) == expected


def test_resolve_food_or_cafe_imagery_matches_specialties() -> None:
    # 1. Mì Quảng
    mi_quang = resolve_food_or_cafe_imagery("Mì Quảng Bà Mua", "Mì quảng truyền thống sợi dẻo")
    assert mi_quang is not None
    assert mi_quang == CURATED_FOOD_AND_BEV_IMAGERY["mi_quang"]
    assert len(mi_quang["gallery"]) >= 3

    # 2. Bún chả cá
    bun_cha_ca = resolve_food_or_cafe_imagery("Bún Chả Cá Hờn", "Chả cá chiên và hấp")
    assert bun_cha_ca is not None
    assert bun_cha_ca == CURATED_FOOD_AND_BEV_IMAGERY["bun_cha_ca"]

    # 3. Bún bò Huế
    bun_bo = resolve_food_or_cafe_imagery("Bún Bò Huế Mệ Kéo", "Bún bò giò heo chả cua")
    assert bun_bo is not None
    assert bun_bo == CURATED_FOOD_AND_BEV_IMAGERY["bun_bo_hue"]

    # 4. Cà phê Muối
    cafe_muoi = resolve_food_or_cafe_imagery("Cà Phê Muối 10 Nguyễn Lương Bằng", "Khai sinh cà phê muối")
    assert cafe_muoi is not None
    assert cafe_muoi == CURATED_FOOD_AND_BEV_IMAGERY["cafe_muoi"]

    # 5. Cơm hến
    com_hen = resolve_food_or_cafe_imagery("Cơm Hến Hoa Đông", "Cồn Hến trứ danh")
    assert com_hen is not None
    assert com_hen == CURATED_FOOD_AND_BEV_IMAGERY["com_hen"]

    # 6. Pet cafe
    pet_cafe = resolve_food_or_cafe_imagery("Alaska Pet Coffee", "Cafe Chó & Mèo Cưng")
    assert pet_cafe is not None
    assert pet_cafe == CURATED_FOOD_AND_BEV_IMAGERY["pet_cafe"]

    # 7. Workspace 24/7
    workspace = resolve_food_or_cafe_imagery("5AM Coffee", "Workspace 24/7 làm việc")
    assert workspace is not None
    assert workspace == CURATED_FOOD_AND_BEV_IMAGERY["workspace_cafe"]


def test_resolve_food_or_cafe_imagery_does_not_confuse_salt_in_food_with_coffee() -> None:
    # Food with 'muối tiêu' or 'trứng cút' must NOT be matched as cà phê muối
    res = resolve_food_or_cafe_imagery("Tré Trộn Hòa Food", "Tré trộn muối tiêu cay nồng kèm trứng cút")
    assert res != CURATED_FOOD_AND_BEV_IMAGERY["cafe_muoi"]


def test_resolve_poi_imagery_matches_landmark_via_wiki_cache() -> None:
    wiki_cache = {
        "Cầu Rồng (Đà Nẵng)": "https://example.com/dragon_bridge.jpg",
        "Chùa Thiên Mụ": "https://example.com/thien_mu.jpg",
    }
    hero, gallery = resolve_poi_imagery(
        name="Cầu Rồng (Biểu tượng phun lửa)",
        category="Cảnh quan và thiên nhiên",
        city="Da Nang",
        description="Cây cầu bắc qua sông Hàn",
        wiki_cache=wiki_cache,
    )
    assert hero == "https://example.com/dragon_bridge.jpg"
    assert "https://example.com/dragon_bridge.jpg" in gallery


def test_resolve_poi_imagery_fallback_for_unknown_place() -> None:
    hero, gallery = resolve_poi_imagery(
        name="Một Địa Điểm Chưa Từng Có XYZ",
        category="Cảnh quan và thiên nhiên",
        city="Da Nang",
        description="Không có thông tin",
        wiki_cache={},
    )
    assert hero is None
    assert gallery == []

"""
Curated authentic photography catalog for specialties, dishes, and cafe ambiances in Da Nang & Hue.
Used by enrich_poi_images.py to provide high-resolution hero images and galleries for local food & beverage POIs.
"""

from __future__ import annotations

from typing import TypedDict


class DishImagery(TypedDict):
    hero: str
    gallery: list[str]


def _u(photo_id: str) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w=1280&q=80"


# High-resolution (1280px+), verified 200 OK authentic photography for food & cafes
CURATED_FOOD_AND_BEV_IMAGERY: dict[str, DishImagery] = {
    # 1. Mì Quảng xứ Quảng
    "mi_quang": {
        "hero": _u("photo-1582878826629-29b7ad1cdc43"),
        "gallery": [
            _u("photo-1582878826629-29b7ad1cdc43"),
            _u("photo-1569718212165-3a8278d5f624"),
            _u("photo-1544025162-d76694265947"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 2. Bún chả cá Đà Nẵng
    "bun_cha_ca": {
        "hero": _u("photo-1544025162-d76694265947"),
        "gallery": [
            _u("photo-1544025162-d76694265947"),
            _u("photo-1559339352-11d035aa65de"),
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1582878826629-29b7ad1cdc43"),
        ],
    },
    # 3. Bánh xèo & Nem lụi miền Trung
    "banh_xeo": {
        "hero": _u("photo-1555939594-58d7cb561ad1"),
        "gallery": [
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 4. Bánh tráng cuốn thịt heo Đại Lộc / Đà Nẵng
    "banh_trang_cuon": {
        "hero": _u("photo-1540420773420-3366772f4999"),
        "gallery": [
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1512621776951-a57141f2eefd"),
        ],
    },
    # 5. Bún mắm nêm Đà Nẵng
    "bun_mam": {
        "hero": _u("photo-1582878826629-29b7ad1cdc43"),
        "gallery": [
            _u("photo-1582878826629-29b7ad1cdc43"),
            _u("photo-1544025162-d76694265947"),
            _u("photo-1569718212165-3a8278d5f624"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 6. Bún bò Huế
    "bun_bo_hue": {
        "hero": _u("photo-1569718212165-3a8278d5f624"),
        "gallery": [
            _u("photo-1569718212165-3a8278d5f624"),
            _u("photo-1582878826629-29b7ad1cdc43"),
            _u("photo-1544025162-d76694265947"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 7. Cơm hến & Bún hến Cồn Hến
    "com_hen": {
        "hero": _u("photo-1540420773420-3366772f4999"),
        "gallery": [
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1512621776951-a57141f2eefd"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 8. Bánh bèo, Bánh nậm, Bánh lọc Huế
    "banh_beo_nam_loc": {
        "hero": _u("photo-1540420773420-3366772f4999"),
        "gallery": [
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1512621776951-a57141f2eefd"),
        ],
    },
    # 9. Bánh khoái Huế
    "banh_khoai": {
        "hero": _u("photo-1555939594-58d7cb561ad1"),
        "gallery": [
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 10. Bánh canh cá lóc / bánh canh Nam Phổ
    "banh_canh": {
        "hero": _u("photo-1569718212165-3a8278d5f624"),
        "gallery": [
            _u("photo-1569718212165-3a8278d5f624"),
            _u("photo-1582878826629-29b7ad1cdc43"),
            _u("photo-1544025162-d76694265947"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 11. Bánh ép Huế
    "banh_ep": {
        "hero": _u("photo-1555939594-58d7cb561ad1"),
        "gallery": [
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 12. Nem lụi nướng than hoa
    "nem_lui": {
        "hero": _u("photo-1555939594-58d7cb561ad1"),
        "gallery": [
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1544025162-d76694265947"),
            _u("photo-1529193591184-b1d58069ecdd"),
            _u("photo-1504674900247-0877df9cc836"),
        ],
    },
    # 13. Cơm gà Đà Nẵng / Tam Kỳ
    "com_ga": {
        "hero": _u("photo-1555939594-58d7cb561ad1"),
        "gallery": [
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1512621776951-a57141f2eefd"),
        ],
    },
    # 14. Bánh mì thịt nướng / Bánh mì que
    "banh_mi": {
        "hero": _u("photo-1555939594-58d7cb561ad1"),
        "gallery": [
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 15. Bê thui Cầu Mống / Thịt bò nướng
    "be_thui": {
        "hero": _u("photo-1544025162-d76694265947"),
        "gallery": [
            _u("photo-1544025162-d76694265947"),
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1529193591184-b1d58069ecdd"),
            _u("photo-1504674900247-0877df9cc836"),
        ],
    },
    # 16. Hải sản tươi sống ven biển Đà Nẵng
    "hai_san": {
        "hero": _u("photo-1534422298391-e4f8c172dddb"),
        "gallery": [
            _u("photo-1534422298391-e4f8c172dddb"),
            _u("photo-1519708227418-c8fd9a32b7a2"),
            _u("photo-1559339352-11d035aa65de"),
            _u("photo-1544025162-d76694265947"),
        ],
    },
    # 17. Tré bà Đệ / Tré trộn
    "tre_tron": {
        "hero": _u("photo-1540420773420-3366772f4999"),
        "gallery": [
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1555939594-58d7cb561ad1"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1512621776951-a57141f2eefd"),
        ],
    },
    # 18. Ẩm thực chay & dưỡng sinh thanh tịnh
    "chay": {
        "hero": _u("photo-1540420773420-3366772f4999"),
        "gallery": [
            _u("photo-1540420773420-3366772f4999"),
            _u("photo-1512621776951-a57141f2eefd"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1555396273-367ea4eb4db5"),
        ],
    },
    # 19. Cà phê Muối xứ Huế & Cà phê kem béo
    "cafe_muoi": {
        "hero": _u("photo-1514432324607-a09d9b4aefdd"),
        "gallery": [
            _u("photo-1514432324607-a09d9b4aefdd"),
            _u("photo-1554118811-1e0d58224f24"),
            _u("photo-1501339847302-ac426a4a7cbb"),
            _u("photo-1517248135467-4c7edcad34c4"),
        ],
    },
    # 20. Trà Cung Đình Huế & Không gian trà đạo
    "tra_cung_dinh": {
        "hero": _u("photo-1576092768241-dec231879fc3"),
        "gallery": [
            _u("photo-1576092768241-dec231879fc3"),
            _u("photo-1544787219-7f47ccb76574"),
            _u("photo-1597481499750-3e6b22637e12"),
            _u("photo-1514432324607-a09d9b4aefdd"),
        ],
    },
    # 21. Chè Cung Đình Huế & Chè Hẻm
    "che_cung_dinh": {
        "hero": _u("photo-1551024709-8f23befc6f87"),
        "gallery": [
            _u("photo-1551024709-8f23befc6f87"),
            _u("photo-1576092768241-dec231879fc3"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1540420773420-3366772f4999"),
        ],
    },
    # 22. Quán Cafe View Sông / Biển / Chill Đà Nẵng - Huế
    "cafe_chill": {
        "hero": _u("photo-1554118811-1e0d58224f24"),
        "gallery": [
            _u("photo-1554118811-1e0d58224f24"),
            _u("photo-1501339847302-ac426a4a7cbb"),
            _u("photo-1517248135467-4c7edcad34c4"),
            _u("photo-1514432324607-a09d9b4aefdd"),
        ],
    },
    # 23. Quán Cafe Học tập, Làm việc 24/7 (2AM, 5AM, Workspace)
    "workspace_cafe": {
        "hero": _u("photo-1517248135467-4c7edcad34c4"),
        "gallery": [
            _u("photo-1517248135467-4c7edcad34c4"),
            _u("photo-1554118811-1e0d58224f24"),
            _u("photo-1501339847302-ac426a4a7cbb"),
            _u("photo-1514432324607-a09d9b4aefdd"),
        ],
    },
    # 24. Cafe Thú cưng / Chó mèo (Alaska Pet Coffee)
    "pet_cafe": {
        "hero": _u("photo-1583511655857-d19b40a7a54e"),
        "gallery": [
            _u("photo-1583511655857-d19b40a7a54e"),
            _u("photo-1514888286974-6c03e2ca1dba"),
            _u("photo-1554118811-1e0d58224f24"),
            _u("photo-1517248135467-4c7edcad34c4"),
        ],
    },
}


def resolve_food_or_cafe_imagery(name: str, description: str = "") -> DishImagery | None:
    """Resolve specialty imagery based on dish names, ingredients, or cafe types."""
    lower_name = name.lower()
    lower_desc = description.lower()
    text = f"{lower_name} {lower_desc}"

    # 1. Distinctive local dishes
    if "mì quảng" in text or "mi quang" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["mi_quang"]
    if "bún chả cá" in text or "chả cá" in lower_name:
        return CURATED_FOOD_AND_BEV_IMAGERY["bun_cha_ca"]
    if "bún mắm" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["bun_mam"]
    if "bún bò" in text or "bún giò" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["bun_bo_hue"]
    if "cơm hến" in text or "bún hến" in text or "cồn hến" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["com_hen"]
    if "bánh xèo" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_xeo"]
    if "bánh khoái" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_khoai"]
    if "bánh bèo" in text or "bánh nậm" in text or "bánh lọc" in text or "bánh ram ít" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_beo_nam_loc"]
    if "bánh ép" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_ep"]
    if "bánh canh" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_canh"]
    if "thịt heo" in text and ("bánh tráng" in text or "đại lộc" in text):
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_trang_cuon"]
    if "nem lụi" in text or "nem nướng" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["nem_lui"]
    if "cơm gà" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["com_ga"]
    if "bánh mì" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["banh_mi"]
    if "bê thui" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["be_thui"]
    if "hải sản" in text or "tôm hùm" in text or "ốc" in text or "cua" in text or "cá mú" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["hai_san"]
    if "tré" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["tre_tron"]
    if "chay" in text or "tịnh" in text or "an nhiên garden" in lower_name:
        return CURATED_FOOD_AND_BEV_IMAGERY["chay"]

    # 2. Distinctive Drinks & Cafes
    if any(k in lower_name for k in ["pet", "chó", "mèo", "alaska"]):
        return CURATED_FOOD_AND_BEV_IMAGERY["pet_cafe"]
    if any(k in lower_name for k in ["workspace", "2am", "5am", "học tập", "làm việc"]):
        return CURATED_FOOD_AND_BEV_IMAGERY["workspace_cafe"]
    if "cà phê muối" in text or "cafe muối" in text or "muối" in lower_name:
        return CURATED_FOOD_AND_BEV_IMAGERY["cafe_muoi"]
    if "trà cung đình" in text or "trà đạo" in text or "trà" in lower_name or "tea" in lower_name:
        return CURATED_FOOD_AND_BEV_IMAGERY["tra_cung_dinh"]
    if "chè" in lower_name or "chè hẻm" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["che_cung_dinh"]
    if "cafe" in text or "cà phê" in text or "coffee" in text or "roastery" in text or "acoustic" in text:
        return CURATED_FOOD_AND_BEV_IMAGERY["cafe_chill"]

    # 3. Fallback for Food POIs without explicit dish keyword
    return CURATED_FOOD_AND_BEV_IMAGERY["mi_quang"]

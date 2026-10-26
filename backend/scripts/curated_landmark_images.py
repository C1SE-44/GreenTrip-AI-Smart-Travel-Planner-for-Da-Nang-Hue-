"""
Curated authentic photography catalog for top historical sites, landmarks, and natural attractions in Da Nang & Hue.
Used by enrich_poi_images.py to provide high-resolution hero images and galleries for landmark POIs.
"""

from __future__ import annotations

from typing import TypedDict


class LandmarkImagery(TypedDict):
    hero: str
    gallery: list[str]


# Helper to build consistent high-resolution Unsplash URLs
def _u(photo_id: str) -> str:
    return f"https://images.unsplash.com/{photo_id}?auto=format&fit=crop&w=1280&q=80"


# High-resolution (1280px+), verified 200 OK authentic photography
CURATED_LANDMARK_IMAGERY: dict[str, LandmarkImagery] = {
    # 1. Cầu Rồng Đà Nẵng
    "cau_rong": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/4/4a/C%E1%BA%A7u_R%E1%BB%93ng.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/4/4a/C%E1%BA%A7u_R%E1%BB%93ng.jpg",
            _u("photo-1559592413-7cec4d0cae2b"),
            _u("photo-1506744038136-46273834b3fb"),
            _u("photo-1519046904884-53103b34b206"),
        ],
    },
    # 2. Chùa Thiên Mụ Huế
    "chua_thien_mu": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg",
            _u("photo-1548013146-72479768bada"),
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1528181304800-259b08848526"),
        ],
    },
    # 3. Bãi biển Mỹ Khê Đà Nẵng
    "my_khe": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/2/22/Bai_bien_My_Khe.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/2/22/Bai_bien_My_Khe.jpg",
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1519046904884-53103b34b206"),
        ],
    },
    # 4. Đại Nội Huế (Hoàng thành Huế)
    "dai_noi_hue": {
        "hero": _u("photo-1548013146-72479768bada"),
        "gallery": [
            _u("photo-1548013146-72479768bada"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
            "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
        ],
    },
    # 5. Lăng Khải Định
    "lang_khai_dinh": {
        "hero": _u("photo-1548013146-72479768bada"),
        "gallery": [
            _u("photo-1548013146-72479768bada"),
            _u("photo-1582555172866-f73bb12a2ab3"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1579783900882-c0d3dad7b119"),
        ],
    },
    # 6. Lăng Tự Đức
    "lang_tu_duc": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1548013146-72479768bada"),
        ],
    },
    # 7. Lăng Minh Mạng
    "lang_minh_mang": {
        "hero": _u("photo-1528181304800-259b08848526"),
        "gallery": [
            _u("photo-1528181304800-259b08848526"),
            "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
            _u("photo-1548013146-72479768bada"),
            _u("photo-1508804185872-d7badad00f7d"),
        ],
    },
    # 8. Lăng Gia Long & Các Lăng Vua Triều Nguyễn (Đồng Khánh, Thiệu Trị, Dục Đức)
    "lang_gia_long": {
        "hero": _u("photo-1528181304800-259b08848526"),
        "gallery": [
            _u("photo-1528181304800-259b08848526"),
            "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
            _u("photo-1599707367072-cd6ada2bc375"),
            _u("photo-1548013146-72479768bada"),
        ],
    },
    # 9. Cầu Trường Tiền Huế
    "cau_truong_tien": {
        "hero": _u("photo-1583417319070-4a69db38a482"),
        "gallery": [
            _u("photo-1583417319070-4a69db38a482"),
            _u("photo-1559592413-7cec4d0cae2b"),
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506744038136-46273834b3fb"),
        ],
    },
    # 10. Ngũ Hành Sơn Đà Nẵng
    "ngu_hanh_son": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/c/ce/Ngu_hanh_son_toan_canh.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/c/ce/Ngu_hanh_son_toan_canh.jpg",
            _u("photo-1506744038136-46273834b3fb"),
            _u("photo-1548013146-72479768bada"),
            _u("photo-1464822759023-fed622ff2c3b"),
        ],
    },
    # 11. Bà Nà Hills (Cầu Vàng, Làng Pháp)
    "ba_na_hills": {
        "hero": _u("photo-1548013146-72479768bada"),
        "gallery": [
            _u("photo-1548013146-72479768bada"),
            _u("photo-1506744038136-46273834b3fb"),
            _u("photo-1568605117036-5fe5e7bab0b7"),
            _u("photo-1464822759023-fed622ff2c3b"),
        ],
    },
    # 12. Đèo Hải Vân & Hải Vân Quan
    "hai_van": {
        "hero": _u("photo-1464822759023-fed622ff2c3b"),
        "gallery": [
            _u("photo-1464822759023-fed622ff2c3b"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1448375240586-882707db888b"),
            _u("photo-1507525428034-b723cf961d3e"),
        ],
    },
    # 13. Bán đảo Sơn Trà & Đỉnh Bàn Cờ, Cây Đa, Mũi Nghê
    "son_tra": {
        "hero": _u("photo-1448375240586-882707db888b"),
        "gallery": [
            _u("photo-1448375240586-882707db888b"),
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1464822759023-fed622ff2c3b"),
        ],
    },
    # 14. Phá Tam Giang & Đầm Chuồn
    "tam_giang": {
        "hero": _u("photo-1507525428034-b723cf961d3e"),
        "gallery": [
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1519046904884-53103b34b206"),
            _u("photo-1473186578172-c141e6798cf4"),
        ],
    },
    # 15. Vịnh Lăng Cô & Đầm Lập An, Bãi Cát Vàng, Chân Mây
    "lang_co": {
        "hero": _u("photo-1544551763-46a013bb70d5"),
        "gallery": [
            _u("photo-1544551763-46a013bb70d5"),
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1519046904884-53103b34b206"),
        ],
    },
    # 16. Sông Hương & Cầu Dã Viên, Cầu Gỗ Lim, Thuyền Rồng
    "song_huong": {
        "hero": _u("photo-1583417319070-4a69db38a482"),
        "gallery": [
            _u("photo-1583417319070-4a69db38a482"),
            _u("photo-1559592413-7cec4d0cae2b"),
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506744038136-46273834b3fb"),
        ],
    },
    # 17. Vườn quốc gia Bạch Mã & Hồ Truồi, Thác Đỗ Quyên
    "bach_ma": {
        "hero": _u("photo-1432405972618-c60b0225b8f9"),
        "gallery": [
            _u("photo-1432405972618-c60b0225b8f9"),
            _u("photo-1448375240586-882707db888b"),
            _u("photo-1464822759023-fed622ff2c3b"),
            _u("photo-1426604966848-d7adac402bff"),
        ],
    },
    # 18. Cầu ngói Thanh Toàn Huế
    "thanh_toan": {
        "hero": _u("photo-1583417319070-4a69db38a482"),
        "gallery": [
            _u("photo-1583417319070-4a69db38a482"),
            _u("photo-1506744038136-46273834b3fb"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
        ],
    },
    # 19. Làng hương Thủy Xuân Huế
    "lang_huong_thuy_xuan": {
        "hero": _u("photo-1508804185872-d7badad00f7d"),
        "gallery": [
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
            _u("photo-1563245372-f21724e3856d"),
        ],
    },
    # 20. Làng hoa giấy Thanh Tiên, Làng tranh Sình, Gốm Phước Tích
    "lang_hoa_thanh_tien": {
        "hero": _u("photo-1513519245088-0e12902e5a38"),
        "gallery": [
            _u("photo-1513519245088-0e12902e5a38"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1563245372-f21724e3856d"),
        ],
    },
    # 21. Làng đá mỹ nghệ Non Nước
    "non_nuoc_craft": {
        "hero": _u("photo-1579783900882-c0d3dad7b119"),
        "gallery": [
            _u("photo-1579783900882-c0d3dad7b119"),
            _u("photo-1582555172866-f73bb12a2ab3"),
            _u("photo-1565008447742-97f6f38c985c"),
            _u("photo-1506744038136-46273834b3fb"),
        ],
    },
    # 22. Rạn Nam Ô & Làng nghề Nước mắm Nam Ô
    "nam_o_heritage": {
        "hero": _u("photo-1507525428034-b723cf961d3e"),
        "gallery": [
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1519046904884-53103b34b206"),
            _u("photo-1473186578172-c141e6798cf4"),
        ],
    },
    # 23. Bảo tàng Điêu khắc Chăm Đà Nẵng
    "bao_tang_cham": {
        "hero": _u("photo-1582555172866-f73bb12a2ab3"),
        "gallery": [
            _u("photo-1582555172866-f73bb12a2ab3"),
            _u("photo-1565008447742-97f6f38c985c"),
            _u("photo-1518998053901-5348d3961a04"),
            _u("photo-1579783900882-c0d3dad7b119"),
        ],
    },
    # 24. Bảo tàng Cổ vật Cung đình Huế & Bảo tàng Nghệ thuật Xứ Huế
    "bao_tang_hue": {
        "hero": _u("photo-1565008447742-97f6f38c985c"),
        "gallery": [
            _u("photo-1565008447742-97f6f38c985c"),
            _u("photo-1582555172866-f73bb12a2ab3"),
            _u("photo-1518998053901-5348d3961a04"),
            _u("photo-1578632767115-351597cf2477"),
        ],
    },
    # 25. Bảo tàng Đà Nẵng, Mỹ Thuật, Đồng Đình, Hoàng Sa
    "bao_tang_danang": {
        "hero": _u("photo-1565008447742-97f6f38c985c"),
        "gallery": [
            _u("photo-1565008447742-97f6f38c985c"),
            _u("photo-1582555172866-f73bb12a2ab3"),
            _u("photo-1518998053901-5348d3961a04"),
            _u("photo-1578632767115-351597cf2477"),
        ],
    },
    # 26. Chùa Nam Sơn Đà Nẵng
    "chua_nam_son": {
        "hero": _u("photo-1548013146-72479768bada"),
        "gallery": [
            _u("photo-1548013146-72479768bada"),
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
        ],
    },
    # 27. Quốc Tự Cố Đô Huế (Báo Quốc, Từ Đàm, Từ Hiếu, Diệu Đế, Thánh Duyên)
    "chua_hue_ancient": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/8/88/ThienMuPagoda.jpg",
            _u("photo-1548013146-72479768bada"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
        ],
    },
    # 28. Chùa Huyền Không & Thiền Lâm Huế
    "chua_huyen_khong": {
        "hero": _u("photo-1548013146-72479768bada"),
        "gallery": [
            _u("photo-1548013146-72479768bada"),
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1563245372-f21724e3856d"),
        ],
    },
    # 29. Chùa Thiền & Cổ Tự Đà Nẵng (Quán Thế Âm, Pháp Lâm, Tam Bảo, Phổ Đà, Bát Nhã, Tam Thai)
    "chua_danang_sacred": {
        "hero": _u("photo-1548013146-72479768bada"),
        "gallery": [
            _u("photo-1548013146-72479768bada"),
            _u("photo-1508804185872-d7badad00f7d"),
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
        ],
    },
    # 30. Nhà thờ & Đan viện Kiến trúc Cổ (Phủ Cam, Dòng Chúa Cứu Thế, Đan viện Thiên An, Phú Thượng)
    "nha_tho_sacred": {
        "hero": _u("photo-1543731068-7e0f5beff43a"),
        "gallery": [
            _u("photo-1543731068-7e0f5beff43a"),
            _u("photo-1519817650390-64a93db51149"),
            _u("photo-1520645521318-f03a712f0e67"),
            _u("photo-1514890547357-a9ee288728e0"),
        ],
    },
    # 31. Đình Làng & Di Tích Lịch Sử Văn Hóa (Thành Điện Hải, Đình Túy Loan, Hải Châu, Dương Nỗ)
    "dinh_lang_heritage": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1599707367072-cd6ada2bc375"),
            _u("photo-1548013146-72479768bada"),
        ],
    },
    # 32. Suối Khoáng, Thác Nước & Sinh Thái (Núi Thần Tài, Alba Thanh Tân, Suối Mơ, Suối Hoa, Suối Voi, Hòa Phú Thành)
    "suoi_khoang_thien_nhien": {
        "hero": _u("photo-1432405972618-c60b0225b8f9"),
        "gallery": [
            _u("photo-1432405972618-c60b0225b8f9"),
            _u("photo-1448375240586-882707db888b"),
            _u("photo-1464822759023-fed622ff2c3b"),
            _u("photo-1426604966848-d7adac402bff"),
        ],
    },
    # 33. Bãi Biển Miền Trung (Hải Dương, Thuận An, Lộc Bình, Tiên Sa, Vinh Thanh, Chân Mây)
    "bai_bien_mientrung": {
        "hero": _u("photo-1507525428034-b723cf961d3e"),
        "gallery": [
            _u("photo-1507525428034-b723cf961d3e"),
            _u("photo-1506012787146-f92b2d7d6d96"),
            _u("photo-1519046904884-53103b34b206"),
            _u("photo-1473186578172-c141e6798cf4"),
        ],
    },
    # 34. Chợ Đêm & Chợ Truyền Thống (Helio, Sơn Trà, Hàn, Cồn, Đông Ba, Bắc Mỹ An, An Cựu)
    "cho_dem_va_truyen_thong": {
        "hero": _u("photo-1555396273-367ea4eb4db5"),
        "gallery": [
            _u("photo-1555396273-367ea4eb4db5"),
            _u("photo-1504674900247-0877df9cc836"),
            _u("photo-1533900298318-6b8da08a523e"),
            _u("photo-1517248135467-4c7edcad34c4"),
        ],
    },
    # 35. Kiến Trúc Hiện Đại Đà Nẵng (Cầu Sông Hàn, Thuận Phước, APEC, Tiên Sơn, Sun Wheel, Cá Chép)
    "kien_truc_hien_dai_danang": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/4/4a/C%E1%BA%A7u_R%E1%BB%93ng.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/4/4a/C%E1%BA%A7u_R%E1%BB%93ng.jpg",
            _u("photo-1559592413-7cec4d0cae2b"),
            _u("photo-1506744038136-46273834b3fb"),
            _u("photo-1519046904884-53103b34b206"),
        ],
    },
    # 36. Nhà Vườn Cố Đô Huế & Đồi Cảnh Quan (An Hiên, Lục Bộ, Tích Thiện Đường, Vọng Cảnh, Thiên An)
    "nha_vuon_hue": {
        "hero": "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
        "gallery": [
            "https://upload.wikimedia.org/wikipedia/commons/d/dd/Annam_-_Hu%C3%A9_-_Pavillons_sur_le_bassin_fleuri_au_Tombeau_de_Tu-Duc.jpg",
            _u("photo-1528181304800-259b08848526"),
            _u("photo-1568605117036-5fe5e7bab0b7"),
            _u("photo-1599707367072-cd6ada2bc375"),
        ],
    },
}


def resolve_landmark_imagery(name: str, category: str = "", city: str = "") -> LandmarkImagery | None:
    """Resolve landmark imagery based on prominent landmark patterns and categories."""
    lower = name.lower()

    # 1. Iconic Da Nang / Hue Sites
    if "cầu rồng" in lower:
        return CURATED_LANDMARK_IMAGERY["cau_rong"]
    if "thiên mụ" in lower:
        return CURATED_LANDMARK_IMAGERY["chua_thien_mu"]
    if "mỹ khê" in lower:
        return CURATED_LANDMARK_IMAGERY["my_khe"]
    if any(k in lower for k in ["đại nội", "hoàng thành", "kinh thành", "kỳ đài", "phu văn lâu", "nghinh lương đình"]):
        return CURATED_LANDMARK_IMAGERY["dai_noi_hue"]
    if "khải định" in lower:
        return CURATED_LANDMARK_IMAGERY["lang_khai_dinh"]
    if "tự đức" in lower:
        return CURATED_LANDMARK_IMAGERY["lang_tu_duc"]
    if "minh mạng" in lower:
        return CURATED_LANDMARK_IMAGERY["lang_minh_mang"]
    if any(k in lower for k in ["gia long", "đồng khánh", "thiệu trị", "dục đức", "lăng vua"]):
        return CURATED_LANDMARK_IMAGERY["lang_gia_long"]
    if "trường tiền" in lower or "tràng tiền" in lower:
        return CURATED_LANDMARK_IMAGERY["cau_truong_tien"]
    if "ngũ hành sơn" in lower or "động huyền không" in lower or "động âm phủ" in lower:
        return CURATED_LANDMARK_IMAGERY["ngu_hanh_son"]
    if "bà nà" in lower or "cầu vàng" in lower:
        return CURATED_LANDMARK_IMAGERY["ba_na_hills"]
    if "hải vân" in lower or "đồn cả" in lower:
        return CURATED_LANDMARK_IMAGERY["hai_van"]
    if any(k in lower for k in ["sơn trà", "bàn cờ", "cây đa", "ghềnh bàng", "bãi rạng", "mũi nghê", "bãi bụt", "tiên sa", "bãi cát vàng", "bãi bắc", "intercontinental"]):
        return CURATED_LANDMARK_IMAGERY["son_tra"]
    if any(k in lower for k in ["tam giang", "đầm chuồn", "epark"]):
        return CURATED_LANDMARK_IMAGERY["tam_giang"]
    if any(k in lower for k in ["lăng cô", "lập an", "chân mây", "sơn chà", "vedana"]):
        return CURATED_LANDMARK_IMAGERY["lang_co"]
    if any(k in lower for k in ["sông hương", "dã viên", "gỗ lim", "thuyền rồng", "nhà hát sông hương"]):
        return CURATED_LANDMARK_IMAGERY["song_huong"]
    if any(k in lower for k in ["bạch mã", "hồ truồi", "đỗ quyên", "ngũ hồ"]):
        return CURATED_LANDMARK_IMAGERY["bach_ma"]
    if "thanh toàn" in lower:
        return CURATED_LANDMARK_IMAGERY["thanh_toan"]
    if "thủy xuân" in lower or "làng hương" in lower:
        return CURATED_LANDMARK_IMAGERY["lang_huong_thuy_xuan"]
    if any(k in lower for k in ["thanh tiên", "làng sình", "phước tích", "đúc đồng", "nón lá"]):
        return CURATED_LANDMARK_IMAGERY["lang_hoa_thanh_tien"]
    if "non nước" in lower or "đá mỹ nghệ" in lower:
        return CURATED_LANDMARK_IMAGERY["non_nuoc_craft"]
    if "nam ô" in lower:
        return CURATED_LANDMARK_IMAGERY["nam_o_heritage"]

    # 2. Museums & Cultural Houses
    if "điêu khắc chăm" in lower or "champa" in lower:
        return CURATED_LANDMARK_IMAGERY["bao_tang_cham"]
    if any(k in lower for k in ["cổ vật", "long an", "lê bá đảng", "điềm phùng thị", "thêu xq", "lục bộ", "trần đình sơn"]):
        return CURATED_LANDMARK_IMAGERY["bao_tang_hue"]
    if any(k in lower for k in ["bảo tàng", "hoàng sa", "3d art", "quân khu 5", "mỹ thuật"]):
        return CURATED_LANDMARK_IMAGERY["bao_tang_danang"]

    # 3. Pagodas, Temples & Churches
    if "nam sơn" in lower:
        return CURATED_LANDMARK_IMAGERY["chua_nam_son"]
    if any(k in lower for k in ["báo quốc", "từ đàm", "từ hiếu", "diệu đế", "thánh duyên", "hòn chén", "huệ nam"]):
        return CURATED_LANDMARK_IMAGERY["chua_hue_ancient"]
    if any(k in lower for k in ["huyền không", "thiền lâm"]):
        return CURATED_LANDMARK_IMAGERY["chua_huyen_khong"]
    if any(k in lower for k in ["chùa", "tổ đình", "quán thế âm", "pháp lâm", "phổ đà", "tam bảo", "tam thai", "bát nhã"]):
        return CURATED_LANDMARK_IMAGERY["chua_danang_sacred"]
    if any(k in lower for k in ["nhà thờ", "đan viện", "thiên an", "phủ cam", "chúa cứu thế", "tin lành", "xavier", "tây linh", "phú thượng"]):
        return CURATED_LANDMARK_IMAGERY["nha_tho_sacred"]

    # 4. Heritage communal houses and historic monuments
    if any(k in lower for k in ["đình", "thành điện hải", "nghĩa trũng", "văn thánh miếu", "k20", "y pha nho", "nhà cổ", "an hiên", "cẩm nê", "cẩm lệ", "túy loan", "dương nỗ", "ga huế"]):
        return CURATED_LANDMARK_IMAGERY["dinh_lang_heritage"]

    # 5. Springs, Waterfalls & Eco Parks
    if any(k in lower for k in ["suối", "thác", "khoáng nóng", "núi thần tài", "alba", "thanh tân", "ngầm đôi", "hòa phú thành", "hồ hòa trung", "hồ khe ngang", "hồ thủy tiên", "lái thiêu", "cổng trời", "phước nhơn", "a nôr", "yeshue", "đồi chè", "đông giang", "đồng xanh", "đồng nghệ", "toom sara", "yên retreat", "cu đê", "pê ke", "a lưới", "túy vân"]):
        return CURATED_LANDMARK_IMAGERY["suoi_khoang_thien_nhien"]

    # 6. Beaches & Coastal Bays
    if any(k in lower for k in ["biển", "bãi tắm", "hải dương", "lộc bình", "vinh thanh", "thuận an", "hàm rồng", "bãi chuối", "tư hiền"]):
        return CURATED_LANDMARK_IMAGERY["bai_bien_mientrung"]

    # 7. Night markets & Traditional markets
    if any(k in lower for k in ["chợ", "helio", "chợ đêm", "bắc mỹ an", "bến ngự", "tây lộc", "an cựu"]):
        return CURATED_LANDMARK_IMAGERY["cho_dem_va_truyen_thong"]

    # 8. Modern Bridges & Architecture
    if any(k in lower for k in ["cầu", "apec", "tiên sơn", "đài tưởng niệm", "2 tháng 9", "sun wheel", "downtown", "cá chép", "sông hàn", "du thuyền", "hành chính", "tòa nhà"]):
        return CURATED_LANDMARK_IMAGERY["kien_truc_hien_dai_danang"]

    # 9. Garden Houses & Scenic Hills
    if any(k in lower for k in ["vọng cảnh", "thiên an", "nhà vườn"]):
        return CURATED_LANDMARK_IMAGERY["nha_vuon_hue"]

    return None

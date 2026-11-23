"""Knowledge Graph explanation builder, coordinate resolution, and 3-layer POI formatting."""
from __future__ import annotations

from app.pois.price_normalizer import normalize_poi_price_display
from app.trips.schemas import CopilotSuggestedPoiItem

DEFAULT_POI_COORDS_KB: list[tuple[str, float, float]] = [
    ("cầu vàng", 15.9951, 107.9962),
    ("bà nà", 15.9977, 107.9881),
    ("sơn trà", 16.1060, 108.2615),
    ("linh ứng", 16.0996, 108.2775),
    ("ngũ hành sơn", 16.0038, 108.2631),
    ("mỹ khê", 16.0598, 108.2464),
    ("cầu rồng", 16.0611, 108.2275),
    ("điêu khắc chăm", 16.0604, 108.2233),
    ("chợ cồn", 16.0681, 108.2143),
    ("chợ hàn", 16.0684, 108.2244),
    ("local beans", 16.0668, 108.2212),
    ("nia", 16.0582, 108.2195),
    ("àla", 16.0725, 108.2218),
    ("rêu", 16.0635, 108.2155),
    ("43 factory", 16.0462, 108.2428),
    ("bà mua", 16.0628, 108.2215),
    ("bún chả cá", 16.0672, 108.2201),
    ("bánh tráng cuốn", 16.0551, 108.2210),
    ("bé mặn", 16.0715, 108.2468),
    ("năm đảnh", 16.0925, 108.2485),
    ("an nhiên", 16.0702, 108.2192),
    ("roots", 16.0510, 108.2442),
    ("đại nội", 16.4698, 107.5784),
    ("hoàng thành", 16.4698, 107.5784),
    ("cổ vật cung đình", 16.4712, 107.5831),
    ("thiên mụ", 16.4533, 107.5450),
    ("tự đức", 16.4331, 107.5658),
    ("khải định", 16.3991, 107.5903),
    ("vọng cảnh", 16.4285, 107.5542),
    ("cà phê muối", 16.4691, 107.5818),
    ("mệ kéo", 16.4728, 107.5882),
    ("hoa đông", 16.4785, 107.5961),
    ("bà đỏ", 16.4655, 107.5952),
    ("sân mây", 16.4612, 107.5835),
    ("hội an", 15.8794, 108.3350),
    ("rừng dừa", 15.8752, 108.3885),
    ("đèo hải vân", 16.2008, 108.1319),
    ("tàu hỏa", 16.2008, 108.1319),
    ("thủy biều", 16.4395, 107.5378),
    ("đầm chuồn", 16.4182, 107.6695),
    ("rú chá", 16.5392, 107.6328),
]


def resolve_poi_coordinates(
    poi_name: str,
    city: str,
    lat: float | None = None,
    lng: float | None = None,
    idx_offset: int = 0,
) -> tuple[float, float]:
    """Ensure every suggested POI has realistic geographic coordinates for PoiMap."""
    if lat is not None and lng is not None and lat != 0 and lng != 0:
        return float(lat), float(lng)
    name_lower = (poi_name or "").lower()
    for key, k_lat, k_lng in DEFAULT_POI_COORDS_KB:
        if key in name_lower:
            return k_lat, k_lng
    jitter = (idx_offset % 5) * 0.0032
    if "huế" in (city or "").lower() or "hue" in (city or "").lower():
        return round(16.4637 + jitter, 5), round(107.5909 + jitter, 5)
    if "hội an" in (city or "").lower():
        return round(15.8801 + jitter, 5), round(108.3380 + jitter, 5)
    return round(16.0615 + jitter, 5), round(108.2235 + jitter, 5)


def build_kg_explanation_for_poi(
    poi_name: str,
    category: str,
    sub_category: str | None,
    city: str,
    constraints: list[str],
    query_vibe: str = "",
) -> tuple[str, list[str]]:
    """
    Construct Knowledge Graph reasoning (kg_explanation) and eco_practices
    connecting POI attributes -> User Constraints / Query Intent -> Green Score.
    """
    name_lower = poi_name.lower()
    cat_lower = (category or "").lower()
    sub_lower = (sub_category or "").lower()

    reasons: list[str] = []
    eco_practices: list[str] = []

    # 1. Specific iconic POI knowledge graph facts
    if "tự đức" in name_lower:
        reasons.append(
            "Khuôn viên đường dạo bộ bằng phẳng quanh hồ Lưu Khiêm và đồi thông cổ thụ, không phải leo bậc cao nên cực kỳ êm chân"
        )
        eco_practices.append("Quần thể kiến trúc sinh thái vườn – hồ điều hòa vi khí hậu tự nhiên")
    elif "khải định" in name_lower:
        reasons.append(
            "Tuyệt tác kiến trúc giao thoa Á – Âu khảm sành sứ tinh xảo trên triền núi Châu Chữ (lưu ý có 127 bậc thang)"
        )
        eco_practices.append("Di sản văn hóa UNESCO được bảo tồn cảnh quan đồi thông bao quanh")
    elif "đại nội" in name_lower or "hoàng thành" in name_lower:
        reasons.append(
            "Trung tâm di sản triều Nguyễn rộng lớn, có hệ thống xe điện nội khu đưa đón thuận tiện không lo mỏi chân"
        )
        eco_practices.append("Sử dụng xe điện nội khu 0 phát thải và không gian cây xanh cổ thụ")
    elif "cổ vật cung đình" in name_lower or "bảo tàng" in name_lower:
        reasons.append(
            "Không gian trưng bày trong nhà có mái che kiên cố, ghế nghỉ chân mát mẻ, lý tưởng cho ngày mưa hoặc đi cùng gia đình"
        )
        eco_practices.append("Công trình kiến trúc di sản thông gió tự nhiên, du lịch văn hóa bền vững")
    elif "sơn trà" in name_lower or "linh ứng" in name_lower:
        if "elderly_friendly" in constraints:
            reasons.append(
                "Phù hợp đi ô tô/taxi điện ngắm cảnh cung đường biển và dạo sân Chùa Linh Ứng bằng phẳng (thay vì leo Đỉnh Bàn Cờ dốc cao)"
            )
        else:
            reasons.append(
                "Lá phổi xanh của Đà Nẵng với tầm nhìn bao trọn vịnh biển và cơ hội ngắm Voọc chà vá chân nâu quý hiếm"
            )
        eco_practices.append("Khu bảo tồn sinh quyển; cam kết không xả rác nhựa và không cho động vật hoang dã ăn")
    elif "ngũ hành sơn" in name_lower:
        reasons.append(
            "Có hệ thống thang máy kính lên thẳng Chùa Tam Thai, giúp tiết kiệm sức lực mà vẫn ngắm trọn non nước"
        )
        eco_practices.append("Danh thắng đá cẩm thạch tự nhiên kết hợp làng nghề truyền thống")
    elif "mỹ khê" in name_lower:
        reasons.append(
            "Bãi biển cát trắng mịn nằm ngay trong phố Đà Nẵng, sóng êm và rất tiện kết hợp ăn hải sản ven biển"
        )
        eco_practices.append("Bãi biển đạt chuẩn xanh, khuyến khích tản bộ và không dùng túi nilon")
    elif "local beans" in name_lower or "nia" in name_lower or "àla" in name_lower or "rêu" in name_lower or "trình" in name_lower:
        reasons.append(
            f"Không gian cafe ẩn mình yên tĩnh tại {city}, nhiều mảng xanh và tách biệt tiếng ồn xe cộ đúng chất 'chill' bạn tìm"
        )
        eco_practices.append("Tận dụng ánh sáng tự nhiên, ưu tiên ly thủy tinh và hạt cà phê rang mộc bản địa")
    elif "43 factory" in name_lower or "xliii" in name_lower or "brewman" in name_lower:
        reasons.append(
            f"Không gian kiến trúc mở ngập ánh sáng và mặt nước tại {city}, chuyên dòng Specialty Coffee yên tĩnh"
        )
        eco_practices.append("Sử dụng hạt cà phê Fair Trade minh bạch nguồn gốc và hạn chế rác thải nhựa")
    elif "cà phê muối" in name_lower or ("muối" in name_lower and not any(w in name_lower for w in ("biển", "seafood", "hải sản"))):
        reasons.append(
            "Quán khai sinh món Cà phê muối trứ danh xứ Huế — lớp kem muối béo mặn hòa quyện cà phê phin truyền thống trong sân vườn thoáng mát"
        )
        eco_practices.append("Phục vụ bằng ly thủy tinh tái sử dụng, hạt cà phê rang mộc miền Trung")
    elif "cafe" in cat_lower or "cà phê" in cat_lower or "cafe" in sub_lower:
        if "quiet_vibe" in constraints or "quiet" in query_vibe:
            reasons.append(
                f"Góc thưởng thức cà phê thư thái, không gian thoáng đãng ít ồn ào tại {city}"
            )
        else:
            reasons.append(
                f"Điểm dừng chân thưởng thức cà phê bản địa đặc sắc tại {city}"
            )
        eco_practices.append("Không gian nhiều cây xanh, hạn chế ống hút nhựa dùng một lần")
    elif "chay" in name_lower or "an nhiên" in name_lower or "sân mây" in name_lower or "roots" in name_lower or "bồ đề" in name_lower:
        reasons.append(
            f"Thực đơn chay thực dưỡng thanh đạm tại {city}, chế biến từ rau củ hữu cơ tươi mới trong ngày"
        )
        eco_practices.append("Bữa ăn thuần thực vật giúp giảm ~60% lượng phát thải carbon so với bữa ăn thịt đỏ")
    elif "mì quảng" in name_lower or "bà mua" in name_lower or "bếp trang" in name_lower:
        reasons.append(
            "Nước nhân đậm đà nấu từ tôm thịt & dầu phụng nguyên chất xứ Quảng, ăn kèm rau sống Trà Quế tươi sạch"
        )
        eco_practices.append("Sử dụng rau sống hữu cơ địa phương và bánh tráng nướng thủ công")
    elif "bún chả cá" in name_lower or "hờn" in name_lower or "bà lữ" in name_lower:
        reasons.append(
            "Chả cá thu tươi quết tay truyền thống Đà Nẵng, nước dùng hầm từ xương cá và bí đỏ thanh ngọt tự nhiên"
        )
        eco_practices.append("Nguồn cá đánh bắt gần bờ trong ngày, không dùng phụ gia bảo quản")
    elif "bánh tráng cuốn" in name_lower or "mậu" in name_lower or "trần" in name_lower:
        reasons.append(
            "Thịt heo hai đầu da luộc vừa tới cuốn cùng bánh tráng Đại Lộc và hơn 10 loại rau vườn địa phương"
        )
        eco_practices.append("Chuỗi cung ứng rau sạch vùng ven Đà Nẵng – Quảng Nam (Food Miles thấp)")
    elif "hải sản" in name_lower or "seafood" in name_lower or "muối biển" in name_lower or "bé mặn" in name_lower or "năm đảnh" in name_lower:
        reasons.append(
            "Hải sản đánh bắt trong ngày từ vùng biển Sơn Trà – Mỹ Khê, chế biến tươi tại chỗ và niêm yết giá rõ ràng"
        )
        eco_practices.append("Cam kết hải sản đánh bắt bền vững theo mùa, không khai thác loài quý hiếm")
    elif "bún bò" in name_lower or "mệ kéo" in name_lower or "bà tuyết" in name_lower:
        reasons.append(
            "Nước lèo ninh xương bò cùng sả cây và mắm ruốc Huế truyền thống, hương vị đậm đà chuẩn Cố đô"
        )
        eco_practices.append("Quán gia truyền địa phương sử dụng nguyên liệu tươi trong ngày")
    elif "cơm hến" in name_lower or "hoa đông" in name_lower:
        reasons.append(
            "Đặc sản dân dã Cồn Hến với hến sông Hương xào măng khô, tóp mỡ giòn và rau thơm vườn nhà"
        )
        eco_practices.append("Ẩm thực bản địa gắn liền sinh kế làng nghề truyền thống Cồn Hến")
    elif any(k in name_lower for k in ["bánh bèo", "bánh nậm", "bánh lọc", "bà đỏ", "hàng me"]):
        reasons.append(
            "Bộ tứ bánh truyền thống Huế gói lá chuối/lá dong tự nhiên, bột gạo xay mịn chấm nước mắm tôm chấy"
        )
        eco_practices.append("Gói bánh bằng lá chuối phân hủy sinh học 100%, thay thế hoàn toàn màng bọc nhựa")
    elif "thiên mụ" in name_lower or "vọng cảnh" in name_lower:
        reasons.append(
            "Tọa độ ngắm hoàng hôn sông Hương thơ mộng bậc nhất xứ Huế, không gian đồi thông thoáng đãng yên bình"
        )
        eco_practices.append("Cảnh quan di sản ven sông Hương được bảo tồn nguyên trạng")
    elif "thủy biều" in name_lower:
        reasons.append(
            "Làng cổ sinh thái ven sông Hương nổi tiếng với vườn bưởi Thanh Trà trăm tuổi, đường làng bằng phẳng rợp bóng cây và trải nghiệm ngâm chân thảo mộc cung đình"
        )
        eco_practices.append("Du lịch sinh thái cộng đồng 0 phát thải, bảo tồn nhà rường cổ và vườn bưởi hữu cơ")
    elif "tàu hỏa" in name_lower or "đèo hải vân" in name_lower:
        reasons.append(
            "Tuyến đường sắt Kết nối Di sản Miền Trung uốn lượn qua Đèo Hải Vân và vịnh Lăng Cô — êm ái cho người lớn tuổi và giảm ~75% phát thải CO₂ so với xe ô tô cá nhân"
        )
        eco_practices.append("Giao thông đường sắt xanh giảm ~75% khí thải CO₂/hành khách so với ô tô riêng")
    elif "ẩm thực" in cat_lower or "quán ăn" in cat_lower:
        reasons.append(
            f"Địa chỉ ẩm thực bản địa nổi tiếng tại {city}, hương vị truyền thống chuẩn gốc và giá niêm yết minh bạch"
        )
        eco_practices.append("Ưu tiên chuỗi cung ứng nông sản & nguyên liệu tươi sống tại địa phương (Food Miles thấp)")
    else:
        reasons.append(
            f"Điểm trải nghiệm văn hóa – sinh thái tiêu biểu tại {city}, kết nối thuận tiện trong cụm lịch trình"
        )
        eco_practices.append("Khuyến khích di chuyển xanh bằng xe điện hoặc tản bộ gom cụm")

    # 2. Append constraint-specific tailoring if not already mentioned
    if "elderly_friendly" in constraints and not any("bằng phẳng" in r or "thang máy" in r or "xe điện" in r or "ô tô" in r for r in reasons):
        reasons.append("không gian tiếp cận thuận lợi, có chỗ ngồi nghỉ thoải mái cho người lớn tuổi")
    if "rainy_season" in constraints and ("bảo tàng" in name_lower or "cafe" in cat_lower or "ẩm thực" in cat_lower):
        reasons.append("không gian trong nhà có mái che an toàn khi thời tiết tháng 10–12 có mưa")

    return "; ".join(reasons), eco_practices


def enrich_pois_with_kg_and_filter_city(
    pois: list[CopilotSuggestedPoiItem],
    target_city_display: str,
    is_both_cities: bool,
    constraints: list[str],
    query_vibe: str = "",
) -> list[CopilotSuggestedPoiItem]:
    """
    Strictly filter POIs so no Hue POI leaks into a Da Nang query (and vice versa),
    normalize price units, populate coordinates, and attach 3-layer Knowledge Graph explanations.
    """
    filtered: list[CopilotSuggestedPoiItem] = []
    target_lower = target_city_display.lower()

    for idx, p in enumerate(pois):
        addr_lower = (p.address or "").lower()
        name_lower = (p.name or "").lower()
        poi_city = p.city or ""

        if not poi_city:
            if "huế" in addr_lower or "hue" in addr_lower or "huế" in name_lower:
                poi_city = "Huế"
            elif "đà nẵng" in addr_lower or "da nang" in addr_lower or "hải châu" in addr_lower or "sơn trà" in addr_lower or "ngũ hành sơn" in addr_lower:
                poi_city = "Đà Nẵng"
            else:
                poi_city = "Huế" if "huế" in target_lower and not is_both_cities else "Đà Nẵng"

        # Strict city isolation when user asked for a specific single city
        if not is_both_cities:
            if "đà nẵng" in target_lower and ("huế" in poi_city.lower() or "huế" in name_lower or "hue" in name_lower):
                continue
            if "huế" in target_lower and ("đà nẵng" in poi_city.lower() or "da nang" in name_lower or "sơn trà" in name_lower):
                continue

        kg_exp, eco_list = build_kg_explanation_for_poi(
            poi_name=p.name,
            category=p.category,
            sub_category=p.sub_category,
            city=poi_city,
            constraints=constraints,
            query_vibe=query_vibe,
        )
        if p.swap_reason and "Ý tưởng" in p.swap_reason:
            kg_exp = f"Địa điểm nằm trong danh sách Ý tưởng bạn đã lưu; {kg_exp}"
        p.city = poi_city
        p.kg_explanation = kg_exp
        p.eco_practices = eco_list
        p.price_range_display = normalize_poi_price_display(
            poi_name=p.name,
            category=p.category,
            sub_category=p.sub_category,
            raw_price_display=p.price_range_display,
            estimated_cost=p.estimated_cost,
        )
        lat_val, lng_val = resolve_poi_coordinates(p.name, poi_city, p.lat, p.lng, idx)
        p.lat = lat_val
        p.lng = lng_val
        p.swap_reason = f"{kg_exp} • 🌱 Green Score {p.green_score}/100 ({eco_list[0] if eco_list else 'Chuẩn xanh'})"
        filtered.append(p)

    return filtered


def format_three_layer_poi_bullet(poi: CopilotSuggestedPoiItem) -> str:
    """
    Format a single POI according to Rule 4 (3-Layer Formula):
    - **[Tên địa điểm]** *(Lý do khớp trực tiếp với nhu cầu người dùng từ kg_explanation)* — 🌱 *Green Score X/100: [Điểm cộng bền vững / Mẹo di chuyển xanh]*.
    """
    kg_reason = poi.kg_explanation or poi.swap_reason
    eco_note = poi.eco_practices[0] if poi.eco_practices else (poi.carbon_saved or "Thực hành du lịch bền vững")
    score_10 = round(poi.green_score / 10.0, 1)
    return (
        f"- **{poi.name}** ({poi.address}) — *({kg_reason})* "
        f"+ 🌱 *Green Score {score_10}/10 ({poi.green_score}/100): {eco_note}*."
    )


def ensure_closing_ab_hook(reply_text: str, default_hook: str) -> str:
    """Ensure 100% of responses end with a concrete A/B conversational hook (Rule 6)."""
    stripped = reply_text.strip()
    if stripped.endswith("?") and (" hay " in stripped[-220:].lower() or "phương án" in stripped[-220:].lower()):
        return stripped
    return f"{stripped}\n\n{default_hook}"

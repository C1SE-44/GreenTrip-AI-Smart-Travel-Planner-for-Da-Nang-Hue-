"""Knowledge Graph explanation builder, coordinate resolution, and 3-layer POI formatting."""
from __future__ import annotations

import re

from app.pois.price_normalizer import normalize_poi_price_display
from app.trips.schemas import CopilotSuggestedPoiItem
from app.trips.text_utils import strip_vietnamese_accents

DEFAULT_POI_COORDS_KB: list[tuple[str, float, float]] = [
    ("linh ứng bà nà", 15.9989, 107.9946),
    ("linh ứng non nước", 16.0076, 108.2674),
    ("linh ứng ngũ hành sơn", 16.0076, 108.2674),
    ("linh ứng bãi bụt", 16.1046, 108.2789),
    ("linh ứng sơn trà", 16.1046, 108.2789),
    ("cầu vàng", 15.9951, 107.9962),
    ("linh ứng bà nà", 15.9977, 107.9881),
    ("linh ứng non nước", 16.0038, 108.2631),
    ("linh ứng ngũ hành sơn", 16.0038, 108.2631),
    ("bà nà", 15.9977, 107.9881),
    ("sơn trà", 16.1060, 108.2615),
    ("linh ứng", 16.1046, 108.2789),
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
    elif any(k in cat_lower for k in ("lưu trú", "luu-tru", "nghỉ dưỡng", "stay")) or sub_lower in ("eco_lodge", "homestay", "resort", "villa"):
        reasons.append(
            f"Cơ sở lưu trú sinh thái tại {city} ưu tiên kiến trúc hài hòa thiên nhiên và không gian yên tĩnh"
        )
        eco_practices.append("Giảm rác thải nhựa dùng một lần, tiết kiệm điện nước và sử dụng vật liệu bản địa")
    elif "phố đi bộ" in name_lower or sub_lower == "walking_street":
        reasons.append(
            f"Tuyến phố đi bộ văn hóa sôi động tại {city}, an toàn không khói xe cơ giới vào khung giờ tối"
        )
        eco_practices.append("Không gian tản bộ 100% không xe cơ giới, giảm tiếng ồn và khí thải đô thị")
    elif "chợ " in f" {name_lower} " or sub_lower == "market":
        reasons.append(
            f"Khu chợ truyền thống lâu đời tại {city}, nơi trải nghiệm nhịp sống và đặc sản địa phương chân thực"
        )
        eco_practices.append("Ủng hộ trực tiếp tiểu thương bản địa và nông sản mùa vụ (chuỗi cung ứng ngắn)")
    elif "làng" in name_lower or "craft" in sub_lower:
        reasons.append(
            f"Làng nghề thủ công truyền thống tại {city}, giữ gìn kỹ nghệ lâu đời và nhịp sống yên bình"
        )
        eco_practices.append("Bảo tồn nghề thủ công truyền thống, tạo sinh kế bền vững cho cộng đồng địa phương")
    elif "chùa" in name_lower or "tâm linh" in cat_lower or "nhà thờ" in name_lower:
        reasons.append(
            f"Không gian văn hóa tâm linh thanh tịnh tại {city} với kiến trúc cổ kính và khuôn viên nhiều cây xanh"
        )
        eco_practices.append("Khuôn viên rợp bóng cây cổ thụ, giữ gìn tĩnh lặng và không đốt vàng mã tràn lan")
    elif "ẩm thực" in cat_lower or "quán ăn" in cat_lower:
        reasons.append(
            f"Địa chỉ ẩm thực bản địa nổi tiếng tại {city}, hương vị truyền thống chuẩn gốc và giá niêm yết minh bạch"
        )
        eco_practices.append("Ưu tiên chuỗi cung ứng nông sản & nguyên liệu tươi sống tại địa phương (Food Miles thấp)")
    elif "di tích" in cat_lower:
        reasons.append(
            f"Điểm di sản lịch sử – kiến trúc đặc trưng tại {city}, thuận tiện kết hợp tìm hiểu văn hóa bản địa"
        )
        eco_practices.append("Bảo tồn kiến trúc di sản nguyên bản và cảnh quan sinh thái truyền thống")
    else:
        reasons.append(
            f"Điểm trải nghiệm văn hóa – bản địa tiêu biểu tại {city}, kết nối thuận tiện trong cụm lịch trình"
        )
        eco_practices.append(
            f"Điểm cộng đồng/bản địa tại {city} chú trọng bảo tồn cảnh quan và giảm rác thải nhựa một lần"
        )

    # 2. Append constraint-specific tailoring if not already mentioned
    if "elderly_friendly" in constraints and not any("bằng phẳng" in r or "thang máy" in r or "xe điện" in r or "ô tô" in r for r in reasons):
        reasons.append("không gian tiếp cận thuận lợi, có chỗ ngồi nghỉ thoải mái cho người lớn tuổi")
    if "rainy_season" in constraints and ("bảo tàng" in name_lower or "cafe" in cat_lower or "ẩm thực" in cat_lower):
        reasons.append("không gian trong nhà có mái che an toàn khi thời tiết tháng 10–12 có mưa")

    return "; ".join(reasons), eco_practices


_DANANG_HOIAN_MARKERS = (
    "da nang",
    "danang",
    "hoi an",
    "quang nam",
    "son tra",
    "ngu hanh son",
    "hai chau",
    "thanh khe",
    "cam le",
    "lien chieu",
    "hoa vang",
    "ba na",
    "my khe",
    "cau rong",
    "cu lao cham",
    "nui than tai",
    "vinpearl nam hoi an",
    "vinwonders nam hoi an",
    "rung dua bay mau",
    "bai but",
)

_HUE_MARKERS = (
    "hue",
    "thua thien",
    "dai noi",
    "hoang thanh",
    "thien mu",
    "khai dinh",
    "tu duc",
    "minh mang",
    "song huong",
    "dong ba",
    "thuy xuan",
    "thuy bieu",
    "kim long",
    "phu vang",
    "huong thuy",
    "huong tra",
    "lang co",
    "pha tam giang",
    "dam chuon",
    "ru cha",
)


def is_poi_allowed_in_city(
    poi_name: str | None,
    poi_city: str | None,
    poi_address: str | None,
    target_city_display: str,
    is_both_cities: bool,
    allow_hoi_an: bool = True,
) -> bool:
    """Hard geographic filter ensuring Hue context never pins Da Nang/Hoi An POIs and vice versa."""
    if is_both_cities:
        return True
    target_folded = strip_vietnamese_accents((target_city_display or "").lower())
    if "da nang" in target_folded and "hue" in target_folded:
        return True

    city_folded = f" {strip_vietnamese_accents((poi_city or '').lower())} "
    raw_combined = f"{poi_name or ''} {poi_city or ''} {poi_address or ''}"
    combined_folded = f" {strip_vietnamese_accents(raw_combined).lower()} "

    if "hue" in target_folded:
        if any(m in city_folded for m in ("da nang", "danang", "hoi an", "quang nam")):
            return False
        if any(m in combined_folded for m in _DANANG_HOIAN_MARKERS) and "hue" not in city_folded:
            return False
        return True

    if "da nang" in target_folded:
        if " hue " in city_folded or "thua thien" in city_folded:
            return False
        if any(m in combined_folded for m in _HUE_MARKERS) and "da nang" not in city_folded:
            return False
        if not allow_hoi_an and ("hoi an" in city_folded or "quang nam" in city_folded):
            return False
        return True

    return True


def score_homonym_disambiguation(
    poi_name: str | None,
    poi_address: str | None,
    query_context: str | None,
) -> float:
    """Disambiguate same-name POIs (e.g. Chùa Linh Ứng Sơn Trà/Bãi Bụt vs Bà Nà vs Ngũ Hành Sơn)."""
    cand = strip_vietnamese_accents(f"{poi_name or ''} {poi_address or ''}").lower()
    ctx = strip_vietnamese_accents(query_context or "").lower()

    if "linh ung" in cand:
        wants_ba_na = "ba na" in ctx or "chua nui" in ctx
        wants_nhs = "ngu hanh son" in ctx or "non nuoc" in ctx
        if wants_ba_na:
            return 45.0 if "ba na" in cand else -35.0
        if wants_nhs:
            return 45.0 if ("ngu hanh son" in cand or "non nuoc" in cand) else -35.0
        # Default bare 'Chùa Linh Ứng' or 'Chùa Linh Ứng Sơn Trà' -> Bãi Bụt / Sơn Trà
        if "bai but" in cand or "son tra" in cand or "hoang sa" in cand or "tho quang" in cand:
            return 40.0
        if "ba na" in cand:
            return -45.0
        if "non nuoc" in cand or "ngu hanh son" in cand:
            return -25.0

    return 0.0


_DANANG_ENTITY_MARKERS = (
    "đà nẵng", "da nang", "danang", "sơn trà", "mỹ khê", "hải châu", "ngũ hành sơn",
    "bà nà", "cầu rồng", "cầu vàng", "chợ cồn", "chợ hàn", "linh ứng", "bãi bụt", "bãi rạng",
    "hội an", "hoi an", "cẩm thanh", "trà quế", "sông hàn",
)
_HUE_ENTITY_MARKERS = (
    "huế", "hue", "đại nội", "hoàng thành", "thiên mụ", "tự đức", "khải định",
    "minh mạng", "chợ đông ba", "sông hương", "thủy biều", "rú chá", "đầm chuồn",
    "vọng cảnh", "thủy xuân", "tam giang", "cồn hến",
)


def recommend_transport_for_leg(
    distance_km: float,
    num_people: int = 2,
    constraints: list[str] | None = None,
    is_intercity: bool = False,
) -> str:
    """Recommend practical, green transport based on real distance and group size."""
    active = set(constraints or [])
    has_family = "elderly_friendly" in active or "kid_friendly" in active or num_people >= 4
    if is_intercity or distance_km >= 45.0:
        return "Tàu hỏa Di sản Đà Nẵng – Huế (giảm ~75% CO₂ so với ô tô riêng, êm ái cho nhóm/gia đình)"
    if distance_km <= 1.5 and "elderly_friendly" not in active:
        return "Đi bộ gom cụm trong khu vực (0 g CO₂, thuận tiện khám phá phố và hẻm)"
    if has_family:
        return (
            f"Taxi điện Xanh SM hoặc ô tô điện đi chung cho nhóm {max(2, num_people)} người "
            "(êm ái, chia chi phí hợp lý và không phát thải trực tiếp)"
        )
    if distance_km <= 5.0:
        return "Xe buýt công cộng hoặc xe đạp/taxi điện ngắn chặng tùy thời tiết"
    return "Xe buýt công cộng tuyến nội đô hoặc taxi điện Xanh SM cho chặng dài"


def estimate_trip_budget_summary(
    days_count: int,
    num_people: int = 2,
    budget_tier: Any = None,
    total_budget: float | None = None,
) -> dict[str, Any]:
    """Calculate transparent per-person and total-group budget ranges based on trip context."""
    days = max(1, int(days_count or 3))
    people = max(1, int(num_people or 1))
    tier_raw = getattr(budget_tier, "value", budget_tier)
    tier = str(tier_raw or "standard").lower()

    tier_specs = {
        "budget": ("$ Tiết kiệm", 550_000, 750_000, "homestay xanh/nhà nghỉ cộng đồng, quán ăn bản địa, xe buýt/đi bộ"),
        "standard": ("$$ Tiêu chuẩn", 1_100_000, 1_550_000, "khách sạn/eco-lodge 3–4 sao, ẩm thực địa phương + vé tham quan, taxi điện chia nhóm"),
        "luxury": ("$$$ Cao cấp", 2_400_000, 3_500_000, "eco-resort/boutique 4–5 sao, trải nghiệm riêng tư và xe điện đưa đón"),
    }
    tier_label, pp_min, pp_max, scope_desc = tier_specs.get(tier, tier_specs["standard"])
    group_min = pp_min * days * people
    group_max = pp_max * days * people

    def _fmt(v: float) -> str:
        return f"{int(round(v)):,} ₫".replace(",", ".")

    cap_note = ""
    if total_budget and total_budget > 0:
        cap_note = f" (ngân sách bạn đặt: **{_fmt(total_budget)}** cho cả đoàn)"

    summary_text = (
        f"Ước tính hạng **{tier_label}** cho **{people} người × {days} ngày**: "
        f"**{_fmt(group_min)} – {_fmt(group_max)}** cả đoàn "
        f"(khoảng **{_fmt(pp_min)} – {_fmt(pp_max)}/người/ngày**){cap_note} — "
        f"*đã tính gồm lưu trú ({scope_desc}), ăn uống, vé tham quan và đi lại nội tỉnh*."
    )
    return {
        "tier": tier,
        "tier_label": tier_label,
        "days": days,
        "num_people": people,
        "per_person_day_min": pp_min,
        "per_person_day_max": pp_max,
        "group_total_min": group_min,
        "group_total_max": group_max,
        "summary_text": summary_text,
    }


def enrich_pois_with_kg_and_filter_city(
    pois: list[CopilotSuggestedPoiItem],
    target_city_display: str,
    is_both_cities: bool,
    constraints: list[str],
    query_vibe: str = "",
) -> list[CopilotSuggestedPoiItem]:
    """
    Strictly filter POIs so no Hue POI leaks into a Da Nang query (and no Da Nang/Hoi An POI leaks into Hue),
    normalize price units, populate coordinates, and attach 3-layer Knowledge Graph explanations.
    """
    filtered: list[CopilotSuggestedPoiItem] = []
    target_lower = target_city_display.lower()

    for idx, p in enumerate(pois):
        addr_folded = strip_vietnamese_accents((p.address or "").lower())
        name_folded = strip_vietnamese_accents((p.name or "").lower())
        addr_lower = (p.address or "").lower()
        name_lower = (p.name or "").lower()
        probe = f"{name_lower} {addr_lower} {(p.city or '').lower()}"
        poi_city = (p.city or "").strip()

        is_hue_entity = any(tok in probe for tok in _HUE_ENTITY_MARKERS)
        is_dn_or_ha_entity = any(tok in probe for tok in _DANANG_ENTITY_MARKERS)

        if not poi_city:
            if is_hue_entity and not is_dn_or_ha_entity:
                poi_city = "Huế"
            elif any(m in addr_folded or m in name_folded for m in ("hoi an", "quang nam")):
                poi_city = "Hội An"
            elif is_dn_or_ha_entity and not is_hue_entity:
                poi_city = "Đà Nẵng"
            else:
                poi_city = "Huế" if "huế" in target_lower and not is_both_cities else "Đà Nẵng"

        if not is_poi_allowed_in_city(
            poi_name=p.name,
            poi_city=poi_city,
            poi_address=p.address,
            target_city_display=target_city_display,
            is_both_cities=is_both_cities,
            allow_hoi_an="hội an" in target_lower or is_both_cities,
        ):
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
    - **[Tên địa điểm]** *(Lý do khớp trực tiếp với nhu cầu người dùng từ kg_explanation)* — 🌱 *Green Score X/100: [Điểm cộng bền vững cụ thể]*.
    """
    kg_reason = poi.kg_explanation or poi.swap_reason
    eco_note = poi.eco_practices[0] if poi.eco_practices else (poi.carbon_saved or "Bảo tồn cảnh quan và văn hóa bản địa")
    score_10 = round(poi.green_score / 10.0, 1)
    return (
        f"- **{poi.name}** ({poi.address}) — *({kg_reason})* "
        f"+ 🌱 *Green Score {score_10}/10 ({poi.green_score}/100): {eco_note}*."
    )


_AB_CHOICE_TAIL_RE = re.compile(
    r"(?:\n\s*)+[^\n]*(?:\*\*A\s*[—–-]|phương án\s*\*\*?A\b|\bA\s*—[^\n]+\bhay\s+\*\*?B\b).*$",
    re.IGNORECASE | re.DOTALL,
)


def ensure_closing_ab_hook(reply_text: str, default_hook: str) -> str:
    """Ensure responses end with a SINGLE concise 1-line CTA question (never 'A hay B' options)."""
    stripped = (reply_text or "").strip()
    if not stripped:
        return default_hook

    # Strip verbose 'A — ... hay B — ...' trailing paragraphs if LLM generated them
    cleaned = _AB_CHOICE_TAIL_RE.sub("", stripped).strip()
    if not cleaned:
        return default_hook

    last_line = cleaned.splitlines()[-1].strip()
    if last_line.endswith("?") and len(last_line) <= 180 and " hay **" not in last_line.lower():
        return cleaned

    return f"{cleaned}\n\n{default_hook}"

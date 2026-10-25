"""Classification script for GreenTrip POIs according to Taxonomy V2 Specification.

Enriches each POI with:
- sub_category (one of 31 sub-categories across 5 core categories)
- cuisine (for food category: vietnamese_local, italian_pizza, japanese_sushi, etc.)
- budget_tier ('$', '$$', '$$$', 'free')
- vibes (array of Vietnamese vibe labels)
- best_time (array of ['morning', 'afternoon', 'evening', 'night'])
- eco_features (array of eco-friendly and sustainability tags)
- ai_metadata (JSONB with dna_tags, target_crowd, noise_pace, rainy_day_friendly, carbon_footprint_score, heritage_impact_score)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR / "backend") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "backend"))

try:
    from app.config import get_settings
    import psycopg
except ImportError:
    get_settings = None
    psycopg = None


def normalize_text(text: str) -> str:
    """Normalize text for lowercase searching."""
    if not text:
        return ""
    return text.lower()


def classify_poi(name: str, category_name: str, address: str = "", description: str = "") -> dict[str, Any]:
    """Classify a POI based on its name, category, and context into Taxonomy V2."""
    n_lower = normalize_text(name)
    d_lower = normalize_text(description)
    # Exclude address from generic word matching to avoid false positives (e.g., Son Tra -> tea, My Khe -> American)
    combined = f"{n_lower} {d_lower}"

    # Determine core category key
    cat_lower = category_name.lower()
    cat_key = "food"
    if "cafe" in cat_lower or "giải khát" in cat_lower:
        cat_key = "cafe"
    elif "thiên nhiên" in cat_lower or "cảnh quan" in cat_lower:
        cat_key = "nature"
    elif "văn hóa" in cat_lower or "di tích" in cat_lower:
        cat_key = "culture"
    elif "tâm linh" in cat_lower or "chùa" in cat_lower:
        cat_key = "spiritual"

    # Default results
    sub_cat = ""
    cuisine: str | None = None
    budget_tier = "$$"
    vibes: list[str] = []
    best_time: list[str] = ["morning", "afternoon"]
    eco_features: list[str] = []
    dna_tags: list[str] = []
    target_crowd: list[str] = ["solo", "couples", "family", "friends"]
    noise_pace = "chill_slow"
    rainy_day_friendly = True
    carbon_score = 30
    heritage_score = 50

    # -------------------------------------------------------------
    # 1. FOOD CATEGORY (88 POIs)
    # -------------------------------------------------------------
    if cat_key == "food":
        # Check Vegetarian (chay, vegan, plant-based)
        if any(w in n_lower for w in ["chay", "vegan", "vegetarian", "plant-based", "kurumi", "an nhiên", "sala cafe & healthy"]):
            sub_cat = "green_vegetarian"
            cuisine = "plant_based_vegan"
            budget_tier = "$" if any(w in n_lower for w in ["bình dân", "thanh liễu"]) else "$$"
            vibes = ["Yên bình", "Thanh tịnh", "Ấm cúng"]
            best_time = ["morning", "afternoon", "evening"]
            eco_features = ["Thuần chay", "Organic", "Zero waste", "Đi bộ/xe đạp"]
            dna_tags = ["plant_based", "buddhist_vegan", "organic_farm", "zen_quiet", "low_carbon", "detox"]
            target_crowd = ["solo", "couples", "family"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 10
            heritage_score = 80

        # Check Western / International (Pizza, Steakhouse, French Bistro)
        elif any(w in n_lower for w in ["pizza", "steakhouse", "burger", "pasta", "la maison 1888", "le parfum", "carambole", "little italy", "olivia"]):
            sub_cat = "western_international"
            cuisine = "italian_pizza" if any(w in n_lower for w in ["pizza", "italy", "pasta"]) else "western_steak_burger"
            budget_tier = "$$$" if any(w in n_lower for w in ["la maison", "parfum", "carambole", "olivia", "steakhouse", "4p"]) else "$$"
            vibes = ["Hiện đại", "Lãng mạn", "Hẹn hò"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Farm to table", "Zero waste concept"]
            dna_tags = ["wood_fired_pizza", "craft_burger", "wine_pairing", "expat_area", "zero_waste_farming"]
            target_crowd = ["couples", "friends", "nomad"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 45
            heritage_score = 40

        # Check Asian Specialties (Sushi, Korean BBQ, Thai)
        elif any(w in n_lower for w in ["sushi", "japanese", "korean", "meat house", "kicochi", "bbq", "thịt nướng hàn", "thai", "thái"]):
            sub_cat = "asian_specialties"
            if any(w in n_lower for w in ["sushi", "japanese"]):
                cuisine = "japanese_sushi"
            elif any(w in n_lower for w in ["korean", "meat house", "kicochi", "bbq", "hàn"]):
                cuisine = "korean_bbq"
            else:
                cuisine = "thai_spicy"
            budget_tier = "$$$" if any(w in n_lower for w in ["golden meat", "sushi"]) else "$$"
            vibes = ["Hiện đại", "Náo nhiệt", "Ấm cúng"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Nguyên liệu tươi sạch"]
            dna_tags = ["fresh_sashimi", "korean_table_bbq", "dimsum_baskets", "clean_flavor", "youth_favorite"]
            target_crowd = ["friends", "family", "couples"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = True
            carbon_score = 40
            heritage_score = 45

        # Check Coastal Seafood & Local Snails
        elif any(w in n_lower for w in ["hải sản", "seafood", "bé mặn", "mộc quán", "năm đảnh", "thời cổ", "tới bến", "bà rô", "lão đại", "bến tàu", "ốc ", "ốc đĩa", "đầm chuồn hội quán", "cồn tộc"]):
            sub_cat = "coastal_seafood"
            cuisine = "vietnamese_local"
            budget_tier = "$$$" if any(w in n_lower for w in ["mỹ hạnh", "ngọc hương", "đại dương"]) else "$$"
            vibes = ["Gió biển", "Náo nhiệt", "Ngoài trời"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Hải sản đánh bắt tự nhiên"]
            dna_tags = ["live_tank", "ocean_view", "noisy_vibrant", "late_night", "fresh_catch"]
            target_crowd = ["friends", "family"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = True
            carbon_score = 45
            heritage_score = 60

        # Check Heritage Fine Dining / Cung đình / Cơm niêu / Bê thui
        elif any(w in n_lower for w in ["cung đình", "chạn", "không gian xưa", "quê xưa", "madam thu", "tài phú", "ẩm thực trần", "đặc sản trần", "bê thui", "cưỡi ngựa xem hoa"]):
            sub_cat = "heritage_fine_dining"
            cuisine = "vietnamese_local"
            budget_tier = "$$$" if any(w in n_lower for w in ["cung đình", "không gian xưa"]) else "$$"
            vibes = ["Trang trọng", "Hoài niệm", "Ấm cúng"]
            best_time = ["afternoon", "evening"]
            eco_features = ["Kiến trúc truyền thống", "Nguyên liệu địa phương"]
            dna_tags = ["fine_dining", "royal_presentation", "family_gathering", "ac_comfort", "cultural_architecture"]
            target_crowd = ["family", "couples"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 40
            heritage_score = 90

        # Check Traditional Noodles (Bún bò, Mì Quảng, Bún chả cá, Cơm hến)
        elif any(w in n_lower for w in ["bún bò", "mì quảng", "bún chả cá", "bún mắm", "bún thịt nướng", "cơm hến", "bánh canh"]):
            sub_cat = "traditional_noodles"
            cuisine = "vietnamese_local"
            budget_tier = "$"
            vibes = ["Bản địa", "Bình dân", "Ấm cúng"]
            best_time = ["morning", "evening"]
            eco_features = ["Đi bộ/xe đạp", "Nguyên liệu địa phương"]
            dna_tags = ["rich_broth", "signature_local", "spicy_hue", "quick_dining", "heritage_recipe"]
            target_crowd = ["solo", "couples", "family", "friends"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = True
            carbon_score = 35
            heritage_score = 85

        # Default Food -> street_bites_rolls (Bánh bèo, bánh ép, bánh tráng kẹp, tré, chè, ăn vặt...)
        else:
            sub_cat = "street_bites_rolls"
            cuisine = "vietnamese_local"
            budget_tier = "$"
            vibes = ["Vỉa hè", "Náo nhiệt", "Ăn vặt"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Đi bộ/xe đạp", "Ẩm thực đường phố"]
            dna_tags = ["finger_food", "mam_nem_dna", "crispy", "cheap_eats", "sharing_portion", "afternoon_snack"]
            target_crowd = ["friends", "couples", "family"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = True
            carbon_score = 30
            heritage_score = 75

    # -------------------------------------------------------------
    # 2. CAFE CATEGORY (71 POIs)
    # -------------------------------------------------------------
    elif cat_key == "cafe":
        # Check Herbal & Royal Tea (Trà Cung Đình, Trà Thảo Mộc, Vỹ Dạ Xưa)
        if any(w in n_lower for w in ["trà cung đình", "trà thảo mộc", "vỹ dạ xưa", "trà quán", "hoa cúc trắng"]):
            sub_cat = "royal_herbal_tea"
            budget_tier = "$$"
            vibes = ["Thanh tịnh", "Yên bình", "Hoài niệm", "Thư giãn"]
            best_time = ["morning", "afternoon", "evening"]
            eco_features = ["Thảo dược hữu cơ bản địa", "Trà dưỡng sinh", "Đi bộ/xe đạp"]
            dna_tags = ["herbal_wellness", "tea_ceremony", "zen_mind", "stress_relief"]
            target_crowd = ["solo", "couples", "family"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 10
            heritage_score = 90

        # Check Nightlife / Bars / Pubs / Rooftops / Acoustic
        elif any(w in n_lower for w in ["bar", "lounge", "rooftop", "acoustic", "gác trịnh", "trịnh cafe"]):
            sub_cat = "nightlife_bars_pubs"
            budget_tier = "$$$"
            vibes = ["Náo nhiệt", "Hiện đại", "Về đêm", "Gió biển"]
            best_time = ["evening", "night"]
            eco_features = ["Bia thủ công địa phương"]
            dna_tags = ["craft_beer", "live_music", "cocktail_mixology", "nightlife"]
            target_crowd = ["friends", "couples"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = True
            carbon_score = 35
            heritage_score = 40

        # Check Dessert & Bakery & Smoothies & Trà Sữa
        elif any(w in n_lower for w in ["kem bơ", "sinh tố", "nước ép", "trà sữa", "gong cha", "phúc long", "ông chè", "bông food"]):
            sub_cat = "desserts_bakery"
            budget_tier = "$"
            vibes = ["Ngọt ngào", "Bình dân", "Ấm cúng"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Món truyền thống", "Đi bộ/xe đạp"]
            dna_tags = ["sweet_tooth", "hue_royal_sweet_soup", "after_dinner_treat"]
            target_crowd = ["family", "couples", "friends"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 15
            heritage_score = 80

        # Check Workspace & Study & Pet Cafe & Boardgame
        elif any(w in n_lower for w in ["2am", "5am", "workspace", "xuyên đêm", "24/7", "làm việc", "local beans", "books", "nhà sách", "pet", "chó & mèo", "cún & mèo", "mèo", "boardgame", "board game"]):
            sub_cat = "workspace_study_cafe"
            budget_tier = "$$"
            vibes = ["Yên tĩnh", "Hiện đại", "Tập trung"]
            best_time = ["morning", "afternoon", "night"]
            eco_features = ["Tiết kiệm năng lượng"]
            dna_tags = ["digital_nomad", "laptop_friendly", "ergonomic_chair", "deep_work"]
            target_crowd = ["nomad", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 20
            heritage_score = 30

        # Check Specialty Roastery
        elif any(w in n_lower for w in ["specialty", "roastery", "43 factory", "xliii", "phinholic", "espresso", "cà phê máy", "pour-over"]):
            sub_cat = "specialty_roastery"
            budget_tier = "$$$"
            vibes = ["Tối giản", "Hiện đại", "Tinh tế"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Hạt cà phê đạo đức Fairtrade", "Zero waste", "Không ống hút nhựa"]
            dna_tags = ["single_origin", "cold_brew", "v60", "artisan_barista"]
            target_crowd = ["nomad", "couples", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 15
            heritage_score = 40

        # Check Retro Street Cafe & Salted Coffee
        elif any(w in n_lower for w in ["long", "cà phê muối", "muối", "1976", "hồi đó", "nối cafe", "sầu đông", "bao cấp", "tân. original", "phấn"]):
            sub_cat = "retro_street_cafe"
            budget_tier = "$"
            vibes = ["Hoài niệm", "Mộc mạc", "Bình dân", "Vỉa hè"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Đi bộ/xe đạp", "Không gian mở tự nhiên"]
            dna_tags = ["phin_coffee", "salted_coffee", "street_life", "morning_ritual"]
            target_crowd = ["solo", "friends"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = False
            carbon_score = 15
            heritage_score = 85

        # Default Cafe -> scenic_view_cafe (Sơn Trà Marina, Bạch Đằng, Sông Hàn, Katinat, sân vườn...)
        else:
            sub_cat = "scenic_view_cafe"
            budget_tier = "$$"
            vibes = ["Sống ảo", "Lãng mạn", "Ngoài trời", "Hiện đại"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Gió trời tự nhiên", "Cảnh quan xanh"]
            dna_tags = ["instagrammable", "river_breeze", "golden_hour", "sunset_view"]
            target_crowd = ["couples", "friends", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 25
            heritage_score = 50

    # -------------------------------------------------------------
    # 3. NATURE CATEGORY (70 POIs)
    # -------------------------------------------------------------
    elif cat_key == "nature":
        # Check Waterfalls & Hotsprings & Streams
        if any(w in n_lower for w in ["thần tài", "alba", "thanh tân", "suối", "thác", "ngầm đôi", "hòa phú thành", "yeshue", "khe răm"]):
            sub_cat = "waterfalls_hotsprings"
            budget_tier = "$$$" if any(w in n_lower for w in ["thần tài", "alba"]) else "$$"
            vibes = ["Thư giãn", "Hồi phục", "Tự nhiên", "Vui vẻ"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Khoáng nóng Onsen thiên nhiên", "Tắm suối sinh thái", "Du lịch hồi phục sức khỏe Eco-wellness"]
            dna_tags = ["hot_mineral_springs", "eco_wellness", "natural_stream", "waterfall_adventure"]
            target_crowd = ["family", "couples", "friends"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 20
            heritage_score = 40

        # Check Beach & Coastline
        elif any(w in n_lower for w in ["bãi biển", "bãi tắm", "bãi rạng", "bãi bụt", "bãi chuối", "ghềnh bàng", "ghềnh đá", "rạn nam ô", "lăng cô", "đảo sơn chà"]):
            sub_cat = "beach_coastline"
            budget_tier = "free"
            vibes = ["Ngoài trời", "Biển xanh", "Thư giãn", "Tự nhiên"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Tắm biển tự nhiên", "Bảo tồn bờ biển", "Đi bộ bãi cát"]
            dna_tags = ["swimming", "fine_sand", "water_sports", "family_friendly"]
            target_crowd = ["family", "friends", "couples", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = False
            carbon_score = 5
            heritage_score = 30

        # Check Wetland / Lagoon / Mangroves / Rivers
        elif any(w in n_lower for w in ["đầm", "phá tam giang", "rú chá", "epark", "sông hàn", "sông hương", "sông cu đê", "vedana lagoon"]):
            sub_cat = "wetland_lagoon_rivers"
            budget_tier = "free"
            vibes = ["Mênh mang", "Hoàng hôn", "Yên bình", "Sống ảo"]
            best_time = ["afternoon", "evening"]
            eco_features = ["Hệ sinh thái đất ngập nước", "Đi thuyền chèo SUP thân thiện môi trường", "Bảo tồn rừng ngập mặn"]
            dna_tags = ["brackish_lagoon", "sunset_spot", "fisherman_culture", "sup_paddling"]
            target_crowd = ["couples", "friends", "solo"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = False
            carbon_score = 10
            heritage_score = 70

        # Check Pine Hills & Lakes & Green Parks
        elif any(w in n_lower for w in ["đồi", "hồ ", "núi ngự bình", "núi túy vân", "toom sara", "yên retreat", "lái thiêu"]):
            sub_cat = "pine_hills_parks"
            budget_tier = "free"
            vibes = ["Yên bình", "Thơ mộng", "Ngoài trời", "Trong lành"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Công viên cây xanh", "Đi bộ/xe đạp", "Không rác thải nhựa"]
            dna_tags = ["pine_trees", "romantic_viewpoint", "peaceful_breeze", "picnic_mat"]
            target_crowd = ["couples", "family", "solo"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = False
            carbon_score = 5
            heritage_score = 60

        # Default Nature -> mountain_pass_peninsula (Đèo Hải Vân, Bán đảo Sơn Trà, Đỉnh Bàn Cờ, Bạch Mã, Bà Nà Hills...)
        else:
            sub_cat = "mountain_pass_peninsula"
            budget_tier = "$$$" if "bà nà hills" in n_lower else "free"
            vibes = ["Hùng vĩ", "Ngoài trời", "Khám phá", "Tự nhiên"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Khu bảo tồn thiên nhiên", "Đi bộ đường mòn / trekking", "Bảo vệ linh trưởng voọc"]
            dna_tags = ["winding_road", "panoramic_ocean_view", "wildlife_vooc", "cloud_hunting"]
            target_crowd = ["friends", "couples", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = False
            carbon_score = 10
            heritage_score = 50

    # -------------------------------------------------------------
    # 4. CULTURE CATEGORY (70 POIs)
    # -------------------------------------------------------------
    elif cat_key == "culture":
        # Check Museums & Galleries
        if any(w in n_lower for w in ["bảo tàng", "nhà trưng bày"]):
            sub_cat = "museums_galleries"
            budget_tier = "$"
            vibes = ["Học hỏi", "Yên tĩnh", "Nghệ thuật", "Trang nghiêm"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Bảo tồn hiện vật di sản", "Đi bộ trong nhà"]
            dna_tags = ["champa_sculptures", "ancient_artifacts", "indoor_rain_friendly", "curated_art"]
            target_crowd = ["solo", "couples", "family"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 10
            heritage_score = 90

        # Check Traditional Craft Villages
        elif n_lower.startswith("làng "):
            sub_cat = "craft_villages"
            budget_tier = "free"
            vibes = ["Truyền thống", "Sặc sỡ", "Trải nghiệm", "Bản địa"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Thủ công mỹ nghệ bản địa", "Kinh tế cộng đồng bền vững", "Vật liệu tự nhiên"]
            dna_tags = ["artisan_craft", "incense_sticks", "sustainable_community", "handmade_souvenir"]
            target_crowd = ["couples", "friends", "family"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 10
            heritage_score = 95

        # Check Historic Markets
        elif n_lower.startswith("chợ "):
            sub_cat = "historic_markets"
            budget_tier = "$"
            vibes = ["Náo nhiệt", "Bản địa", "Ăn vặt", "Đông đúc"]
            best_time = ["morning", "afternoon", "evening"]
            eco_features = ["Giao thương nông sản địa phương", "Hạn chế túi nilon", "Đi bộ mua sắm"]
            dna_tags = ["local_trade", "cultural_melting_pot", "souvenir_bargaining", "bustling_sensory"]
            target_crowd = ["friends", "family", "solo"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = True
            carbon_score = 25
            heritage_score = 85

        # Check Royal Mausoleums
        elif any(w in n_lower for w in ["lăng vua", "thiên thọ lăng", "khải định", "minh mạng", "tự đức"]):
            sub_cat = "royal_mausoleums"
            budget_tier = "$$"
            vibes = ["Cổ kính", "Trầm mặc", "Nghệ thuật", "Phong thủy"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Kiến trúc hòa hợp thiên nhiên", "Di sản UNESCO"]
            dna_tags = ["royal_tomb", "mosaic_art", "feng_shui", "vietnamese_costume"]
            target_crowd = ["couples", "family", "solo"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 10
            heritage_score = 95

        # Check Imperial Citadel & Palaces
        elif any(w in n_lower for w in ["đại nội", "kỳ đài", "phu văn lâu", "nghinh lương đình", "lục bộ", "phố đêm hoàng thành"]):
            sub_cat = "imperial_citadel"
            budget_tier = "$$"
            vibes = ["Cung đình", "Uy nghiêm", "Di sản", "Lịch sử"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Di sản Thế giới UNESCO", "Đi bộ tham quan di sản", "Bảo tồn văn hóa"]
            dna_tags = ["unesco_world_heritage", "oriental_palace", "dynasty_history", "educational_tour"]
            target_crowd = ["family", "couples", "solo"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 15
            heritage_score = 100

        # Check Performing Arts & Heritage
        elif any(w in n_lower for w in ["nhà hát", "biểu diễn", "nhã nhạc", "sân khấu"]):
            sub_cat = "performing_arts_heritage"
            budget_tier = "$$"
            vibes = ["Thưởng thức", "Nghệ thuật", "Lãng mạn", "Văn hóa"]
            best_time = ["evening", "night"]
            eco_features = ["Bảo tồn di sản phi vật thể nhân loại UNESCO"]
            dna_tags = ["unesco_intangible_heritage", "court_music", "traditional_instruments", "dragon_boat"]
            target_crowd = ["couples", "family", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = True
            carbon_score = 20
            heritage_score = 100

        # Default Culture -> iconic_urban_landmarks (Cầu Rồng, Cầu Tràng Tiền, Ga Huế, Công viên APEC, Di tích lịch sử...)
        else:
            sub_cat = "iconic_urban_landmarks"
            budget_tier = "free"
            vibes = ["Biểu tượng", "Sống ảo", "Hiện đại", "Về đêm"]
            best_time = ["afternoon", "evening", "night"]
            eco_features = ["Đi bộ ngắm cảnh thành phố", "Giao thông công cộng tiện lợi"]
            dna_tags = ["city_landmark", "fire_breathing_show", "night_lights", "architectural_feat"]
            target_crowd = ["friends", "couples", "family"]
            noise_pace = "bustling_vibrant"
            rainy_day_friendly = False
            carbon_score = 15
            heritage_score = 80

    # -------------------------------------------------------------
    # 5. SPIRITUAL CATEGORY (40 POIs)
    # -------------------------------------------------------------
    elif cat_key == "spiritual":
        # Check Gothic Cathedrals & Churches
        if any(w in n_lower for w in ["nhà thờ", "nhà nguyện", "đan viện"]):
            sub_cat = "cathedrals_heritage_churches"
            budget_tier = "free"
            vibes = ["Kiến trúc Châu Âu", "Tôn nghiêm", "Cổ kính", "Check-in"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Bảo tồn kiến trúc di sản thời Pháp", "Đi bộ trong phố"]
            dna_tags = ["gothic_cathedral", "stained_glass", "french_architecture", "pink_church"]
            target_crowd = ["couples", "solo", "family"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 10
            heritage_score = 85

        # Check Forest Hermitages & Deep Monasteries
        elif any(w in n_lower for w in ["huyền không sơn thượng", "trúc lâm bạch mã"]):
            sub_cat = "forest_hermitage_monasteries"
            budget_tier = "free"
            vibes = ["U tịch", "Rừng thiền", "Thoát tục", "Tuyệt đối yên tĩnh"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Rừng nguyên sinh bao bọc", "Thuần khiết sinh thái", "Digital detox không sóng thiết bị"]
            dna_tags = ["forest_monastery", "theravada", "lake_reflection", "deep_silence", "digital_detox"]
            target_crowd = ["solo", "couples"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = False
            carbon_score = 5
            heritage_score = 90

        # Check Grand Mountain & Ocean Facing Temples
        elif any(w in n_lower for w in ["linh ứng bãi bụt", "linh ứng bà nà", "linh ứng non nước", "quán thế âm", "tam thai"]):
            sub_cat = "grand_mountain_ocean_temples"
            budget_tier = "free"
            vibes = ["Kỳ vĩ", "Gió biển", "Trang nghiêm", "Toàn cảnh"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Không gian thiên nhiên mở", "Bảo tồn địa chất danh thắng Non Nước"]
            dna_tags = ["giant_buddha", "ocean_facing", "limestone_cave", "spiritual_energy"]
            target_crowd = ["family", "couples", "friends", "solo"]
            noise_pace = "chill_slow"
            rainy_day_friendly = False
            carbon_score = 10
            heritage_score = 90

        # Default Spiritual -> historic_zen_temples (Thiên Mụ, Từ Hiếu, Báo Quốc, Nam Sơn, Đình Làng...)
        else:
            sub_cat = "historic_zen_temples"
            budget_tier = "free"
            vibes = ["Cổ kính", "Thanh tịnh", "Trầm tư", "Lịch sử"]
            best_time = ["morning", "afternoon"]
            eco_features = ["Cây xanh cổ thụ thanh tịnh", "Không gian tâm linh không khói thuốc", "Ăn chay thanh tịnh"]
            dna_tags = ["zen_buddhism", "mindfulness", "temple_bell", "thich_nhat_hanh_root"]
            target_crowd = ["solo", "couples", "family"]
            noise_pace = "peaceful_zen"
            rainy_day_friendly = True
            carbon_score = 5
            heritage_score = 95

    return {
        "sub_category": sub_cat,
        "cuisine": cuisine,
        "budget_tier": budget_tier,
        "vibes": vibes,
        "best_time": best_time,
        "eco_features": eco_features,
        "ai_metadata": {
            "dna_tags": dna_tags,
            "target_crowd": target_crowd,
            "noise_pace": noise_pace,
            "rainy_day_friendly": rainy_day_friendly,
            "carbon_footprint_score": carbon_score,
            "heritage_impact_score": heritage_score,
        },
    }


def run_classification(live_commit: bool = False) -> None:
    """Fetch POIs from database, run classification, and optionally commit to Supabase."""
    if live_commit and (not get_settings or not psycopg):
        raise RuntimeError("Missing required dependencies for database commit")

    settings = get_settings()
    conn = psycopg.connect(settings.DATABASE_URL)

    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                p.poi_id::text,
                p.name,
                c.name AS category_name,
                ci.name AS city_name,
                p.address,
                p.description
            FROM public.pois p
            JOIN public.poi_categories c ON p.category_id = c.category_id
            JOIN public.cities ci ON p.city_id = ci.city_id
            ORDER BY c.name ASC, p.name ASC
        """)
        rows = cur.fetchall()

    print(f"Loaded {len(rows)} POIs from database.")
    sub_cat_counter = Counter()
    cuisine_counter = Counter()
    budget_counter = Counter()
    updates = []

    for r in rows:
        poi_id, name, cat_name, city_name, address, desc = r
        res = classify_poi(name=name, category_name=cat_name, address=address or "", description=desc or "")
        sub_cat_counter[f"{cat_name} -> {res['sub_category']}"] += 1
        budget_counter[res["budget_tier"]] += 1
        if res["cuisine"]:
            cuisine_counter[res["cuisine"]] += 1
        updates.append((poi_id, name, res))

    print("\n=== Sub-category Distribution by Category ===")
    for sc, cnt in sub_cat_counter.most_common():
        print(f"  {sc:<65}: {cnt} POIs")

    print("\n=== Cuisine Distribution (Food) ===")
    for c, cnt in cuisine_counter.most_common():
        print(f"  {c:<24}: {cnt} POIs")

    print("\n=== Budget Tier Distribution ===")
    for b, cnt in budget_counter.most_common():
        print(f"  {b:<10}: {cnt} POIs")

    # Sample output
    print("\n=== Sample Classifications (First 10) ===")
    for poi_id, name, res in updates[:10]:
        print(f"- {name}")
        print(f"  sub_category: {res['sub_category']} | cuisine: {res['cuisine']} | budget: {res['budget_tier']}")
        print(f"  vibes: {res['vibes']} | rainy_friendly: {res['ai_metadata']['rainy_day_friendly']}")

    if live_commit:
        print(f"\n[LIVE COMMIT] Updating {len(updates)} POIs in Supabase...")
        with conn.cursor() as cur:
            for poi_id, name, res in updates:
                cur.execute("""
                    UPDATE public.pois
                    SET
                        sub_category = %s,
                        cuisine = %s,
                        budget_tier = %s,
                        vibes = %s,
                        best_time = %s,
                        eco_features = %s,
                        ai_metadata = %s
                    WHERE poi_id = %s
                """, (
                    res["sub_category"],
                    res["cuisine"],
                    res["budget_tier"],
                    res["vibes"],
                    res["best_time"],
                    res["eco_features"],
                    json.dumps(res["ai_metadata"], ensure_ascii=False),
                    poi_id,
                ))
            conn.commit()
        print("[SUCCESS] All 339 POIs updated successfully in Supabase.")
    else:
        print("\n[DRY RUN] Run with --live-commit to persist changes to Supabase.")

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Classify POIs according to Taxonomy V2")
    parser.add_argument("--live-commit", action="store_true", help="Commit classifications to database")
    args = parser.parse_args()

    sys.stdout.reconfigure(encoding="utf-8")
    run_classification(live_commit=args.live_commit)

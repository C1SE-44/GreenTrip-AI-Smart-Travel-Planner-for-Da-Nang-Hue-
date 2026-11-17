"""Bounded, database-grounded search. Hard constraints precede recommendation ranking."""

import math
import re
from difflib import SequenceMatcher
from dataclasses import asdict
from app.pois.repository import list_pois
from app.trips.text_utils import normalize_vietnamese_query, strip_vietnamese_accents


def fold(text):
    return strip_vietnamese_accents(normalize_vietnamese_query(str(text or "")))


def explicit_city(message):
    """Only constrain clear geographic mentions; leave other semantics to the model."""
    text = fold(message)
    mentions = []
    for match in re.finditer(r"\b(hue|da nang|danang)\b", text):
        prefix = text[: match.start()]
        if re.search(
            r"(?:khong(?: phai)?|chu khong|thay vi|loai|bo|dung)(?: (?:tim|o|tai|gan|gioi han|sang))*\s*$",
            prefix,
        ):
            continue
        mentions.append(("Huế" if match[1] == "hue" else "Đà Nẵng", prefix))
    if not mentions:
        return None
    changes = [
        city
        for city, prefix in mentions
        if re.search(r"(?:chuyen|doi)(?: sang| den| toi| o| tim)*\s*$", prefix)
    ]
    if changes:
        return changes[-1]
    cities = {city for city, _ in mentions}
    return next(iter(cities)) if len(cities) == 1 else "Đà Nẵng & Huế"


def catalogue(city=None, ids=None):
    # Server-side pages; the browser only receives the selected cards, never the catalogue.
    result = []
    while True:
        items, total = list_pois(
            limit=200, offset=len(result), city=city, ids=ids, view="full"
        )
        result.extend(asdict(p) for p in items)
        if not items or len(result) >= total:
            return result


def food_fold(value):
    # Both spellings occur in verified menus; match whole words, not substrings.
    return re.sub(r'\bmy\b', 'mi', fold(value))


def dish_evidence(point, dish):
    needle = food_fold(dish)
    pattern = r'(?<!\w)' + re.escape(needle) + r'(?!\w)'
    description = str(point.get('description') or '')
    if re.search(r'(?:khong (?:co|ban|phuc vu)|ngung ban|chua xac nhan)\s+' + pattern, food_fold(description)):
        return None
    metadata = point.get('ai_metadata') or {}
    for source, menu in [('menu', point.get('menu')), ('menu_items', point.get('menu_items')), ('ai_metadata.menu_items', metadata.get('menu_items'))]:
        entries = menu if isinstance(menu, list) else [menu] if menu else []
        for item in entries:
            label = item.get('name', '') if isinstance(item, dict) else str(item)
            if re.search(pattern, food_fold(label)) and not re.search(r'\b(?:khong ban|ngung ban)\b',food_fold(label)):
                return {'source': source, 'text': label}
    # A descriptive mention (e.g. near another noodle shop) is not menu evidence.
    for sentence in re.split(r'[.!?\n|]', description):
        folded = food_fold(sentence)
        if re.search(pattern, folded) and re.search(r'\b(?:phuc vu|co ban|chuyen ban|thuc don|menu|mon dac trung|noi tieng (?:nhat )?voi mon)\b', folded):
            if not re.search(r'\b(?:khong|chua|gan quan|ben canh)\b', folded):
                return {'source': 'description.serving_statement', 'text': sentence.strip()}
    return None


def distance(a, b):
    if any(p.get("latitude") is None or p.get("longitude") is None for p in (a, b)):
        return None
    lat1, lat2 = math.radians(float(a["latitude"])), math.radians(float(b["latitude"]))
    dlat = lat2 - lat1
    dlon = math.radians(float(b["longitude"]) - float(a["longitude"]))
    return (
        6371
        * 2
        * math.asin(
            min(
                1,
                math.sqrt(
                    math.sin(dlat / 2) ** 2
                    + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
                ),
            )
        )
    )


ALIASES = {
    "cafe": ["ca phe", "coffee", "cafe", "cà phê"],
    "museum": ["bao tang"],
    "church": ["nha tho", "thanh duong"],
    "temple": ["chua", "thien vien"],
    "spiritual": ["di le", "tam linh"],
    "nature": ["thien nhien", "sinh thai", "canh quan"],
    "food": ["quan an", "am thuc", "an trua", "an toi"],
}


def criteria(message, previous=None, destination=""):
    text = fold(message)
    result = dict(previous or {})
    # A single explicitly requested city always wins over the current trip.
    hue = bool(re.search(r"\bhue\b", text))
    dn = bool(re.search(r"\b(da nang|danang)\b", text))
    if hue != dn:
        result["city"] = "Huế" if hue else "Đà Nẵng"
    elif hue and dn:
        result["city"] = "Đà Nẵng & Huế"
    elif not result.get("city"):
        result["city"] = destination
    # A nearby landmark is a reference, not a replacement for the requested POI type.
    category_text = re.split(r"\b(?:gan|quanh)\b", text, maxsplit=1)[0]
    category = next(
        (
            key
            for key, words in ALIASES.items()
            if any(word in category_text for word in words)
        ),
        None,
    )
    if category:
        result["category"] = category
    match = re.search(
        r"(?:duoi|toi da|khong qua)\s*(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu|tr|dong|d)?\b",
        text,
    )
    if match:
        factor = (
            1_000_000
            if match[2] in ("trieu", "tr")
            else 1000 if match[2] in ("k", "nghin", "ngan") else 1
        )
        result["max_price"] = float(match[1].replace(",", ".")) * factor
        result["price_unit"] = (
            "person" if re.search(r"(?:/|moi)\s*nguoi\b", text) else "item"
        )
    if "mien phi" in text:
        result["max_price"] = 0
        result["price_unit"] = "item"
    for tier in ("$$$$", "$$$", "$$", "$"):
        if tier in message:
            result["tier"] = tier
            break
    radius = re.search(r"(\d+(?:[.,]\d+)?)\s*(km|cay|cay so)\b", text)
    if radius:
        result["radius_km"] = min(50, float(radius[1].replace(",", ".")))
        result["strict_radius"] = bool(re.search(r"\b(chi|toi da|dung)\b", text))
    if any(s in text for s in ("gan day", "gan hon", "gan ", "quanh ")):
        result.setdefault("radius_km", 1)
    result["quiet"] = (
        "yen tinh" in text or "khong on ao" in text or result.get("quiet", False)
    )
    result["green"] = (
        "diem xanh" in text or "gan gui" in text or result.get("green", False)
    )
    result["query"] = text
    return result


def upper_price(p, unit="item"):
    meta = p.get("ai_metadata") or {}
    raw = str(meta.get("price_range_display") or "")
    text = fold(raw)
    if (
        unit == "person"
        and "mien phi" not in text
        and not re.search(r"(?:/|moi)\s*nguoi\b", text)
    ):
        return None
    if any(x in text for x in ("tuy", "tu ", "tren ", "theo thoi")):
        return None
    if "mien phi" in text:
        # Conflicting source fields do not establish a free ticket.
        return (
            0
            if p.get("estimated_cost") == 0 and not re.search(r"[1-9]", text)
            else None
        )
    numbers = re.findall(r"\d[\d.,]*", raw)
    if numbers:
        values = []
        for num in numbers:
            clean = num.rstrip(".,")
            try:
                abbreviated = bool(re.search(r"\d\s*(k|nghin|ngan|trieu)\b", text))
                value = (
                    float(clean.replace(",", "."))
                    if abbreviated and re.fullmatch(r"\d+[.,]\d{1,2}", clean)
                    else float(clean.replace(".", "").replace(",", ""))
                )
            except ValueError:
                continue
            if "trieu" in text and value < 1000:
                value *= 1_000_000
            elif re.search(r"\d\s*(k|nghin|ngan)\b", text) and value < 1000:
                value *= 1000
            values.append(value)
        if values:
            return max(values)
    # A bare estimated_cost is not an upper bound and has no verified unit.
    return None


def category_match(p, key):
    if not key:
        return True
    name = fold(p.get("name"))
    cat = fold(p.get("category"))
    sub = fold(p.get("sub_category"))
    if key == "cafe":
        facts = name + " " + sub + " " + fold(p.get("description"))
        if any(token in sub for token in ("craft_beer", "beer", "brewery", "pub", "cocktail")) or re.search(r"\b(?:beer|brewery|brewing|pub|cocktail|bar|bia thu cong|nha nau bia)\b", facts):
            return False
        return any(
            k in name + " " + cat + " " + sub
            for k in ("cafe", "ca phe", "coffee", "specialty_roastery", "coffee_shop")
        )
    if key == "museum":
        return "bao tang" in name + " " + sub
    if key == "church":
        return "nha tho" in name or "thanh duong" in name
    if key == "temple":
        # Accent folding alone confuses "chưa" (not yet) with "chùa" (temple).
        raw_name = str(p.get("name") or "").lower()
        return bool(
            re.search(r"\bchùa\b", raw_name)
            or "thien vien" in name
            or re.match(r"^chua\b", name)
        )
    if key == "spiritual":
        return any(
            k in cat + " " + name
            for k in ("tam linh", "chua", "nha tho", "thanh duong")
        )
    if key == "nature":
        return any(
            k in cat + " " + sub
            for k in ("thien nhien", "canh quan", "sinh thai", "beach")
        )
    if key == "food":
        return "am thuc" in cat or "quan an" in cat
    return False


def rating_evidence(point):
    metadata = point.get("ai_metadata") or {}
    try:
        score = float(point.get("satisfaction_score") or 0)
        count = int(point.get("review_count") or metadata.get("review_count") or 0)
        return (score, count) if 0 < score <= 5 and count > 0 else (0, 0)
    except (TypeError, ValueError):
        return (0, 0)


def rank(items, preferences):
    if not items:
        return []
    # Reuse PB09's existing semantic/quality/green ranker after hard filtering.
    from app.recommendations.poi_feature_extractor import POIFeatureExtractor
    from app.recommendations.recommender_engine import ContentBasedRecommender

    source = []
    for p in items:
        row = {**p, "poi_id": p["id"]}
        score = float(p.get("green_score") or 0)
        row["green_score"] = score / 100 if score > 1 else score
        source.append(row)
    matrix, _, vectorizer, _ = POIFeatureExtractor().fit_transform(source)
    ranked = ContentBasedRecommender(source, matrix, vectorizer).rank_pois(
        user_interests=preferences or ["thiên nhiên văn hóa địa phương"],
        normalized_green_weight=0.5,
        top_k=len(items),
    )
    by_id = {str(p["id"]): p for p in items}
    return [by_id[str(p["poi_id"])] for p in ranked]


def search(filters, preferences, anchor_id=None, candidate_ids=None):
    city = filters.get("city")
    items = catalogue(city if city in ("Huế", "Đà Nẵng") else None, ids=candidate_ids)
    # Resolve a named anchor across real POIs, not coordinates supplied by a model.
    query = (
        fold(filters.get("anchor_name", ""))
        if filters.get("_structured")
        else filters.get("query", "")
    )
    anchor = None
    for p in sorted(items, key=lambda p: len(p["name"]), reverse=True):
        name = fold(p["name"])
        if len(name) > 4 and name in query:
            anchor = p
            break
    if not anchor and anchor_id:
        anchor = next((p for p in items if str(p["id"]) == anchor_id), None)
        if not anchor and candidate_ids is not None:
            anchor = next(iter(catalogue(ids=[anchor_id])), None)
    if not anchor:
        # Match a small typo in the named landmark, without inventing a new entity.
        near = re.search(
            r"(?:gan|quanh)\s+(.+?)(?=\s+(?:chi|trong|duoi|toi da|yen tinh)\b|$)", query
        )
        if near:
            phrase = near[1].strip()
            candidates = []
            for p in items:
                name = fold(p["name"])
                score = SequenceMatcher(None, name, phrase).ratio()
                candidates.append((score, p))
            candidates.sort(key=lambda item: item[0], reverse=True)
            if (
                candidates
                and candidates[0][0] >= 0.86
                and (
                    len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= 0.08
                )
            ):
                anchor = candidates[0][1]
    result = []
    unknown = []
    omitted = set(filters.get("omit_ids", []))
    for p in items:
        if city in ("Huế", "Đà Nẵng"):
            if fold(p.get("city")).replace(" ", "") != fold(city).replace(" ", ""):
                continue
            if "giap ranh" in fold(p.get("address")):
                continue
        if filters.get("dish"):
            evidence = dish_evidence(p, filters['dish'])
            if not evidence:
                continue
            p = dict(p, _dish_evidence=evidence)
        if str(p["id"]) in omitted:
            continue
        if any(
            category_match(p, category)
            for category in filters.get("excluded_category", [])
        ):
            continue
        if any(
            fold(p.get("city")).replace(" ", "") == fold(city).replace(" ", "")
            for city in filters.get("excluded_city", [])
        ):
            continue
        if not category_match(p, filters.get("category")):
            continue
        if filters.get("tier") and p.get("budget_tier") != filters["tier"]:
            continue
        if filters.get("local") and p.get("is_local_business") is not True:
            continue
        metadata = p.get("ai_metadata") or {}
        tags = fold(
            str(p.get("vibes") or [])
            + " "
            + str(metadata.get("dna_tags") or [])
            + " "
            + str(p.get("description") or "")
        )
        if filters.get("quiet") and not any(
            x in tags for x in ("yen tinh", "peaceful", "quiet", "chill", "tranquil")
        ):
            continue
        if filters.get("green") and not any(
            x in fold(p.get("category")) + " " + tags
            for x in ("thien nhien", "van hoa", "di bo", "local", "ban dia", "vuon")
        ):
            continue
        if filters.get("radius_km"):
            if not anchor:
                continue
            km = distance(anchor, p)
            if (
                km is None
                or km > filters["radius_km"]
                or str(p["id"]) == str(anchor["id"])
            ):
                continue
            p = {**p, "distance_km": round(km, 2)}
        if filters.get("max_price") is not None:
            price = upper_price(p, filters.get("price_unit", "item"))
            if price is None:
                unknown.append(p)
                continue
            if price > filters["max_price"]:
                continue
        result.append(p)
    if not filters.get("category") and not filters.get("radius_km"):
        # A named place query resolves the entity rather than spilling unrelated cards.
        matches = [
            p for p in result if len(fold(p["name"])) > 3 and fold(p["name"]) in query
        ]
        if matches:
            result = matches
    ranked = rank(result, preferences)
    soft = filters.get("preferences", {})
    if filters.get("high_rating"):
        ranked.sort(key=rating_evidence, reverse=True)
    if soft:
        ranked.sort(key=lambda p: preference_score(p, soft), reverse=True)
    if filters.get("must_try") or soft.get("must_try"):
        ranked.sort(key=rating_evidence, reverse=True)
    return ranked, unknown[:4], anchor


def evidence(point):
    """Explicit stored attributes, not a guessed noise level from marketing copy."""
    tags = fold(
        str(point.get("vibes") or [])
        + " "
        + str((point.get("ai_metadata") or {}).get("dna_tags") or [])
    )
    return {
        "quiet": any(
            tag in tags for tag in ("quiet", "peaceful", "tranquil", "yen tinh")
        ),
        "local": point.get("is_local_business") is True,
        "conversation": any(
            tag in tags
            for tag in (
                "group_friendly",
                "spacious",
                "social",
                "nhom ban",
                "rong rai",
                "garden",
                "outdoor",
            )
        ),
    }


def preference_score(point, preferences):
    facts = evidence(point)
    return (
        int(bool(preferences.get("quiet") and facts["quiet"]))
        + int(bool(preferences.get("local") and facts["local"]))
        + int(
            bool(
                preferences.get("ambience") == "conversation" and facts["conversation"]
            )
        )
        + int(bool(preferences.get("ambience") == "quiet" and facts["quiet"]))
        + (float(point.get("green_score") or 0) if preferences.get("green") else 0)
    )


def reason_for(point, filters):
    facts = evidence(point)
    soft = filters.get("preferences", {})
    reasons = []
    if filters.get("quiet") or soft.get("quiet") or soft.get("ambience") == "quiet":
        reasons.append(
            "có thuộc tính yên tĩnh" if facts["quiet"] else "chưa rõ độ yên tĩnh"
        )
    if soft.get("local") or filters.get("local"):
        reasons.append(
            "được gắn nhãn địa phương" if facts["local"] else "chưa có nhãn địa phương"
        )
    if soft.get("ambience") == "conversation":
        reasons.append(
            "có thuộc tính phù hợp nhóm"
            if facts["conversation"]
            else "chưa rõ điều kiện trò chuyện"
        )
    if point.get("distance_km") is not None:
        reasons.append(f"{point['distance_km']:g} km đường thẳng tới mốc")
    if filters.get("dish") and point.get("_dish_evidence"):
        proof = point["_dish_evidence"]
        reasons.append(("Thực đơn ghi: " if proof["source"] != "description.serving_statement" else "Dữ liệu ghi rõ phục vụ: ") + proof["text"][:140])
    label = (point.get("ai_metadata") or {}).get("price_range_display")
    description = re.sub(r"\s+", " ", str(point.get("description") or "")).strip()
    if description and not reasons:
        reasons.append(description[:160])
    if filters.get("green"):
        if point.get("is_local_business") is True:
            reasons.append("dữ liệu gắn nhãn cơ sở kinh doanh địa phương")
        elif category_match(point,"nature"):
            reasons.append("thuộc nhóm trải nghiệm gần thiên nhiên")
        elif "van hoa" in fold(point.get("category")):
            reasons.append("thuộc nhóm trải nghiệm văn hóa")
    if label and filters.get("max_price") is not None:
        reasons.append(str(label)[:65])
    if not reasons:
        reasons = [str(point.get("category") or "Địa điểm trong dữ liệu GreenTrip")]
    if filters.get("high_rating"):
        score, count = rating_evidence(point)
        reasons.append(f"dữ liệu ghi {score:g}/5 với {count} lượt đánh giá" if count else "chưa đủ dữ liệu điểm và số lượt đánh giá để xác nhận đánh giá cao")
    return "; ".join(reason.rstrip(". ") for reason in reasons) + "."


def select_results(points, filters):
    count = filters.get("result_count", 5)
    mix = filters.get("mix")
    if not mix:
        return points[:count]
    selected = []
    named = [key for key in mix if key != "other"]
    for category in named:
        selected.extend(
            [p for p in points if p not in selected and category_match(p, category)][
                : mix[category]
            ]
        )
    remaining = [
        p
        for p in points
        if p not in selected and not any(category_match(p, key) for key in named)
    ]
    wanted = mix.get("other", max(0, count - sum(mix.values())))
    diverse, seen = [], set()
    for point in remaining:
        if point.get("category") not in seen:
            diverse.append(point)
            seen.add(point.get("category"))
    diverse.extend(p for p in remaining if p not in diverse)
    return (selected + diverse[:wanted])[:count]


def card(p):
    metadata = p.get("ai_metadata") or {}
    description = re.sub(r"\s+", " ", p.get("description") or "").strip()
    return {
        key: p.get(key)
        for key in (
            "id",
            "name",
            "city",
            "category",
            "image_url",
            "latitude",
            "longitude",
            "estimated_cost",
            "budget_tier",
            "distance_km",
        )
    } | {
        **({"dish_evidence": p["_dish_evidence"]} if p.get("_dish_evidence") else {}),
        "city": (
            "Huế"
            if fold(p.get("city")) == "hue"
            else (
                "Đà Nẵng"
                if fold(p.get("city")).replace(" ", "") == "danang"
                else p.get("city")
            )
        ),
        "description": (
            (description[:115].rsplit(" ", 1)[0] + "…")
            if len(description) > 115
            else description
        ),
        "price_label": metadata.get("price_range_display")
        or "Chưa xác định khoảng giá",
        "duration_minutes": p.get("average_visit_minutes"),
        "evidence": evidence(p),
    }

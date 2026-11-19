"""Collect raw accommodation listings and photo URLs from Google Maps.

The scraper uses the visible Google Maps search results and place panels. It
does not write to the application database. Results are saved as a JSON array;
a companion progress file lets an interrupted crawl resume without repeating
completed area/category searches.

Example:
    python backend/scripts/crawl_stays.py --limit-areas 2 --categories "khách sạn" homestay
    python backend/scripts/crawl_stays.py
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urljoin, urlsplit

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = BACKEND_DIR / "raw_gmaps_stays_full.json"

# Keep this list aligned with the 2025 administrative-area list provided for
# Da Nang and Hue. The source IDs are retained in every output record.
AREA_CSV = """
1,Đà Nẵng,Phường,Hải Châu
2,Đà Nẵng,Phường,Hòa Cường
3,Đà Nẵng,Phường,Thanh Khê
4,Đà Nẵng,Phường,An Khê
5,Đà Nẵng,Phường,An Hải
6,Đà Nẵng,Phường,Sơn Trà
7,Đà Nẵng,Phường,Ngũ Hành Sơn
8,Đà Nẵng,Phường,Hòa Khánh
9,Đà Nẵng,Phường,Hải Vân
10,Đà Nẵng,Phường,Liên Chiểu
11,Đà Nẵng,Phường,Cẩm Lệ
12,Đà Nẵng,Phường,Hòa Xuân
13,Đà Nẵng,Phường,Tam Kỳ
14,Đà Nẵng,Phường,Quảng Phú
15,Đà Nẵng,Phường,Hương Trà
16,Đà Nẵng,Phường,Bàn Thạch
17,Đà Nẵng,Phường,Điện Bàn
18,Đà Nẵng,Phường,Điện Bàn Đông
19,Đà Nẵng,Phường,An Thắng
20,Đà Nẵng,Phường,Điện Bàn Bắc
21,Đà Nẵng,Phường,Hội An
22,Đà Nẵng,Phường,Hội An Đông
23,Đà Nẵng,Phường,Hội An Tây
24,Đà Nẵng,Xã,Hòa Vang
25,Đà Nẵng,Xã,Hòa Tiến
26,Đà Nẵng,Xã,Bà Nà
27,Đà Nẵng,Xã,Núi Thành
28,Đà Nẵng,Xã,Tam Mỹ
29,Đà Nẵng,Xã,Tam Anh
30,Đà Nẵng,Xã,Đức Phú
31,Đà Nẵng,Xã,Tam Xuân
32,Đà Nẵng,Xã,Tây Hồ
33,Đà Nẵng,Xã,Chiên Đàn
34,Đà Nẵng,Xã,Phú Ninh
35,Đà Nẵng,Xã,Lãnh Ngọc
36,Đà Nẵng,Xã,Tiên Phước
37,Đà Nẵng,Xã,Thạnh Bình
38,Đà Nẵng,Xã,Sơn Cẩm Hà
39,Đà Nẵng,Xã,Trà Liên
40,Đà Nẵng,Xã,Trà Giáp
41,Đà Nẵng,Xã,Trà Tân
42,Đà Nẵng,Xã,Trà Đốc
43,Đà Nẵng,Xã,Trà My
44,Đà Nẵng,Xã,Nam Trà My
45,Đà Nẵng,Xã,Trà Tập
46,Đà Nẵng,Xã,Trà Vân
47,Đà Nẵng,Xã,Trà Linh
48,Đà Nẵng,Xã,Trà Leng
49,Đà Nẵng,Xã,Thăng Bình
50,Đà Nẵng,Xã,Thăng An
51,Đà Nẵng,Xã,Thăng Trường
52,Đà Nẵng,Xã,Thăng Điền
53,Đà Nẵng,Xã,Thăng Phú
54,Đà Nẵng,Xã,Đồng Dương
55,Đà Nẵng,Xã,Quế Sơn Trung
56,Đà Nẵng,Xã,Quế Sơn
57,Đà Nẵng,Xã,Xuân Phú
58,Đà Nẵng,Xã,Nông Sơn
59,Đà Nẵng,Xã,Quế Phước
60,Đà Nẵng,Xã,Duy Nghĩa
61,Đà Nẵng,Xã,Nam Phước
62,Đà Nẵng,Xã,Duy Xuyên
63,Đà Nẵng,Xã,Thu Bồn
64,Đà Nẵng,Xã,Điện Bàn Tây
65,Đà Nẵng,Xã,Gò Nổi
66,Đà Nẵng,Xã,Đại Lộc
67,Đà Nẵng,Xã,Hà Nha
68,Đà Nẵng,Xã,Thượng Đức
69,Đà Nẵng,Xã,Vu Gia
70,Đà Nẵng,Xã,Phú Thuận
71,Đà Nẵng,Xã,Thạnh Mỹ
72,Đà Nẵng,Xã,Bến Giằng
73,Đà Nẵng,Xã,Nam Giang
74,Đà Nẵng,Xã,Đắc Pring
75,Đà Nẵng,Xã,La Dêê
76,Đà Nẵng,Xã,La Êê
77,Đà Nẵng,Xã,Sông Vàng
78,Đà Nẵng,Xã,Sông Kôn
79,Đà Nẵng,Xã,Đông Giang
80,Đà Nẵng,Xã,Bến Hiên
81,Đà Nẵng,Xã,Avương
82,Đà Nẵng,Xã,Tây Giang
83,Đà Nẵng,Xã,Hùng Sơn
84,Đà Nẵng,Xã,Hiệp Đức
85,Đà Nẵng,Xã,Việt An
86,Đà Nẵng,Xã,Phước Trà
87,Đà Nẵng,Xã,Khâm Đức
88,Đà Nẵng,Xã,Phước Năng
89,Đà Nẵng,Xã,Phước Chánh
90,Đà Nẵng,Xã,Phước Thành
91,Đà Nẵng,Xã,Phước Hiệp
92,Đà Nẵng,Xã,Tam Hải
93,Đà Nẵng,Xã,Tân Hiệp
94,Đà Nẵng,Đặc khu,Hoàng Sa
95,Huế,Phường,Phong Điền
96,Huế,Phường,Phong Thái
97,Huế,Phường,Phong Dinh
98,Huế,Phường,Phong Phú
99,Huế,Phường,Phong Quảng
100,Huế,Phường,Hương Trà
101,Huế,Phường,Kim Trà
102,Huế,Phường,Kim Long
103,Huế,Phường,Hương An
104,Huế,Phường,Phú Xuân
105,Huế,Phường,Thuận An
106,Huế,Phường,Hóa Châu
107,Huế,Phường,Mỹ Thượng
108,Huế,Phường,Vỹ Dạ
109,Huế,Phường,Thuận Hóa
110,Huế,Phường,An Cựu
111,Huế,Phường,Thủy Xuân
112,Huế,Phường,Thanh Thủy
113,Huế,Phường,Hương Thủy
114,Huế,Phường,Phú Bài
115,Huế,Phường,Dương Nỗ
116,Huế,Xã,Đan Điền
117,Huế,Xã,Quảng Điền
118,Huế,Xã,Bình Điền
119,Huế,Xã,Phú Vinh
120,Huế,Xã,Phú Hồ
121,Huế,Xã,Phú Vang
122,Huế,Xã,Vinh Lộc
123,Huế,Xã,Hưng Lộc
124,Huế,Xã,Lộc An
125,Huế,Xã,Phú Lộc
126,Huế,Xã,Chân Mây - Lăng Cô
127,Huế,Xã,Long Quảng
128,Huế,Xã,Nam Đông
129,Huế,Xã,Khe Tre
130,Huế,Xã,A Lưới 1
131,Huế,Xã,A Lưới 2
132,Huế,Xã,A Lưới 3
133,Huế,Xã,A Lưới 4
134,Huế,Xã,A Lưới 5
"""

AREAS = [
    {
        "area_id": int(row[0]),
        "city": row[1],
        "administrative_type": row[2],
        "locality": row[3],
    }
    for row in csv.reader(AREA_CSV.strip().splitlines())
    if row
]

# Areas with documented visitor attractions, community tourism, or major lodging hubs.
# Keep these IDs aligned with AREA_CSV; the full 134-area list remains available via --all-areas.
TOURISM_AREA_IDS = frozenset(
    {
        1, 2, 5, 6, 7, 9, 12, 14, 15, 16, 17, 18, 21, 22, 23, 24, 26, 31, 34,
        37, 41, 43, 45, 47, 50, 56, 61, 63, 65, 72, 78, 79, 80, 81, 82, 83, 92, 93,
        95, 102, 104, 105, 108, 109, 110, 111, 113, 114, 115, 117, 121, 122, 125,
        126, 128, 129, 130,
    }
)

CATEGORIES = ("khách sạn", "homestay", "nhà nghỉ", "resort", "căn hộ dịch vụ")
CARD_SELECTOR = 'div[role="feed"] div.Nv2PK'
PHOTO_MARKERS = (
    "googleusercontent.com/p/",
    "googleusercontent.com/places/",
    "googleusercontent.com/gps-cs/",
    "googleusercontent.com/gps-cs-s/",
    "googleusercontent.com/gps-proxy/",
    "googleusercontent.com/grass-cs/",
    "googleusercontent.com/grass-proxy/",
    "ggpht.com/",
)
GALLERY_SCAN_VERSION = 2

_PUA_RE = re.compile(r"[\ue000-\uf8ff]")
_NON_CATEGORY_LABELS = frozenset(
    {
        "tong quan", "overview", "gia", "prices", "bai danh gia", "reviews",
        "gioi thieu", "about", "bi dong vinh vien", "dong cua vinh vien",
        "tam thoi dong cua", "dong cua tam thoi", "permanently closed",
        "temporarily closed", "wi fi mien phi", "free wi fi",
    }
)
_NON_TARGET_PROVINCES = (
    "quang ngai", "quang tri", "ho chi minh", "ha noi", "binh dinh", "phu yen",
    "khanh hoa", "lam dong", "dak lak", "kon tum", "gia lai", "quang binh",
    "ha tinh", "nghe an", "thanh hoa", "dong nai", "binh duong", "can tho",
    "hai phong", "vung tau", "ninh thuan", "binh thuan",
)
_HUE_CITY_TOKENS = ("thua thien hue", "thanh pho hue", "tp hue")
_DANANG_CITY_TOKENS = ("da nang", "quang nam")
_HUE_HINTS = (
    "lang co", "chan may", "phu loc", "phong dien", "huong thuy", "a luoi",
    "phu vang", "quang dien", "thuan an", "vy da", "kim long", "phu bai",
    "khe tre", "nam dong",
)
_DANANG_HINTS = (
    "hoi an", "tam ky", "dien ban", "nui thanh", "duy xuyen", "thang binh",
    "que son", "dai loc", "son tra", "ngu hanh son", "hai chau", "thanh khe",
    "lien chieu", "cam le", "hoa vang", "hoa xuan", "hoa cuong", "hai van",
    "ba na", "cu lao cham", "tan hiep", "hoa khanh",
)
_CLOSED_PHRASES = (
    "dong cua vinh vien", "bi dong vinh vien", "tam thoi dong cua",
    "dong cua tam thoi", "permanently closed", "temporarily closed",
)
_NON_STAY_CATEGORIES = frozenset(
    {
        "trung tam cong dong", "diem thu hut khach du lich", "cong ty kinh doanh bat dong san",
        "cho", "du an nha", "trung tam van hoa", "hiep hoi nha o",
        "van phong chinh quyen dia phuong", "spa", "trung tam y te",
        "nha hang viet nam", "cong vien", "dai ly du lich", "san choi", "nha hang",
        "nha to chuc buoi tiec", "vuon", "quan bar", "nha dieu hanh du lich",
        "den tho hindu", "quan ca phe", "spa mat xa", "dai ly cho thue bat dong san",
        "phong tap duot", "van phong cong ty", "cua hang ban buon", "co so luu tru",
        "dich vu du lich", "trang trai", "chuyen gia tri lieu van dong",
        "dai ly giao dich bat dong san", "phong quy hoach do thi", "khu thuong mai",
        "diem moc lich su", "cua hang luu niem", "nha hang mon nuong", "le hoi",
        "phong kham nha khoa", "cang container", "bai bien cong cong",
        "cau lac bo the thao", "thang canh", "san gon", "cong ty xay dung nha o",
        "cong ty xay dung", "nha thiet ke noi that", "nha hang chuyen phuc vu bua sang",
        "nha hang tiec dung", "so du lich thanh pho", "khu vuc nuong", "quan bia",
        "cua hang tap pham", "nha hang cape verde", "hieu giat la",
        "cong ty tu van bat dong san", "cong ty dau tu bat dong san",
        "khu to hop cong quan", "dai ly cho thue van phong",
        "cua hang ban do dien tu", "cua hang do cu", "trung tam tam linh",
        "cua hang noi that", "phong tap the duc",
    }
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    cleaned = _PUA_RE.sub(" ", str(value))
    return re.sub(r"[ \t\r\f\v]+", " ", cleaned).strip()


def _clean_multiline(value: Any) -> str:
    if value is None:
        return ""
    cleaned = _PUA_RE.sub("", str(value))
    lines = [re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in cleaned.splitlines()]
    return "\n".join(line for line in lines if line)


def _place_id_from_url(url: str) -> str | None:
    decoded = unquote(url)
    match = re.search(r"!1s([^!/?&]+)", decoded)
    if match:
        return match.group(1)
    match = re.search(r"(?:query_place_id|place_id)=([^&]+)", decoded)
    return unquote(match.group(1)) if match else None


def _coordinates_from_url(url: str) -> tuple[float | None, float | None]:
    match = re.search(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", unquote(url))
    if not match:
        return None, None
    try:
        return float(match.group(1)), float(match.group(2))
    except ValueError:
        return None, None


def _photo_url(source: str) -> str | None:
    source = _clean_text(source)
    if not source or not source.startswith(("https://", "http://")):
        return None
    if not any(marker in source for marker in PHOTO_MARKERS):
        return None

    # Google photo URLs commonly carry a small thumbnail size after '='. Keep
    # the stable photo token and request the same high-resolution size used by
    # the existing photo-enrichment scripts in this repository.
    base = source.split("=", 1)[0]
    return f"{base}=w1200-h800-k-no"


def _unique(values: list[Any]) -> list[Any]:
    output: list[Any] = []
    seen: set[str] = set()
    for value in values:
        if value in (None, "", [], {}):
            continue
        marker = json.dumps(value, ensure_ascii=False, sort_keys=True) if isinstance(value, (dict, list)) else str(value)
        if marker not in seen:
            seen.add(marker)
            output.append(value)
    return output


def _record_key(record: dict[str, Any]) -> str:
    place_id = record.get("place_id") or _place_id_from_url(record.get("google_maps_url") or "")
    if place_id:
        return f"place:{place_id}"

    maps_url = record.get("google_maps_url")
    if maps_url:
        parts = urlsplit(maps_url)
        stable_url = f"{parts.netloc}{parts.path}".rstrip("/").casefold()
        if stable_url:
            return f"url:{stable_url}"

    name = _normalize_text(str(record.get("place_name") or ""))
    area_id = record.get("area_id")
    if name and area_id:
        return f"area:{area_id}:name:{name}"

    query = _normalize_text(str(record.get("search_query") or ""))
    return f"legacy:{name}:{query}"


def _extract_review_count(texts: list[str]) -> str | None:
    for text in texts:
        if not text:
            continue
        match = re.search(
            r"([\d.,]+\s*[kKmM]?)\s*(?:bài\s+)?(?:đánh giá|reviews?|review)\b",
            text,
            re.IGNORECASE,
        )
        if match:
            return _clean_text(match.group(1))
    for text in texts:
        if not text:
            continue
        match = re.search(r"\(\s*([\d.,]+\s*[kKmM]?)\s*\)", text)
        if match:
            return _clean_text(match.group(1))
    return None


def _extract_category_from_panel(panel_text: str) -> str | None:
    if not panel_text:
        return None
    normalized_panel = unicodedata.normalize("NFC", panel_text)
    match = re.search(r"\(\s*[\d.,]+\s*[kKmM]?\s*\)\s*(?:·\s*|\n)([^\n]{2,60})", normalized_panel)
    if match:
        candidate = _clean_text(match.group(1).split("·", 1)[0])
        normalized = _normalize_text(candidate)
        if (
            candidate
            and normalized not in _NON_CATEGORY_LABELS
            and not normalized.startswith(("bua sang", "do xe", "wi fi", "cach "))
        ):
            return candidate
    if re.search(r"(?:^|\n)Nhà ở(?:\n|$)", normalized_panel):
        return "Nhà ở"
    return None


def _extract_price_from_panel(panel_text: str) -> str | None:
    if not panel_text:
        return None
    match = re.search(r"([\d.,]+\s*(?:₫|VNĐ|VND))", panel_text)
    return _clean_text(match.group(1)) if match else None


def _extract_rating(texts: list[str]) -> str | None:
    for text in texts:
        normalized = _normalize_text(text)
        if "star" not in normalized and "sao" not in normalized:
            continue
        match = re.search(r"(?<!\d)([0-5](?:[.,]\d{1,2})?)(?!\d)", text)
        if match:
            return match.group(1)
    return None


def _infer_city_from_record(record: dict[str, Any]) -> str | None:
    raw_addr = str(record.get("raw_address") or "")
    addr = f" {_normalize_text(raw_addr)} "
    if addr.strip():
        if any(tok in addr for tok in _DANANG_CITY_TOKENS):
            return "Đà Nẵng"
        if any(tok in addr for tok in _HUE_CITY_TOKENS) or re.search(r"\bhue\b", addr):
            return "Huế"
        if any(hint in addr for hint in _HUE_HINTS):
            return "Huế"
        if any(hint in addr for hint in _DANANG_HINTS):
            return "Đà Nẵng"
    lat = record.get("latitude")
    lon = record.get("longitude")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        if 15.5 <= lat <= 17.2 and 111.0 <= lon <= 113.0:
            return "Đà Nẵng"
        return "Huế" if lat >= 16.18 else "Đà Nẵng"
    return record.get("city")


def _is_in_target_region(record: dict[str, Any]) -> bool:
    raw_addr = str(record.get("raw_address") or "").strip()
    if raw_addr:
        parts = [_normalize_text(part) for part in raw_addr.split(",") if _normalize_text(part)]
        if parts and parts[-1] in ("viet nam", "vietnam"):
            parts = parts[:-1]
        trailing = " ".join(parts[-2:]) if parts else ""
        # Strip trailing postal codes (e.g. "quang ngai 53319" -> "quang ngai")
        trailing_tokens = [tok for tok in trailing.split() if not tok.isdigit()]
        trailing_clean = " ".join(trailing_tokens)
        has_target_city = any(
            tok in trailing_clean for tok in _DANANG_CITY_TOKENS
        ) or bool(re.search(r"\bhue\b", trailing_clean))
        if not has_target_city and parts:
            last_seg = " ".join(tok for tok in parts[-1].split() if not tok.isdigit())
            if any(prov in last_seg for prov in _NON_TARGET_PROVINCES):
                return False
    lat = record.get("latitude")
    lon = record.get("longitude")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        in_mainland = 14.9 <= lat <= 16.85 and 107.0 <= lon <= 108.85
        in_hoang_sa = 15.5 <= lat <= 17.2 and 111.0 <= lon <= 113.0
        if not (in_mainland or in_hoang_sa):
            return False
    return True


def _is_valid_stay_record(record: dict[str, Any]) -> bool:
    if not _is_in_target_region(record):
        return False
    panel = _normalize_text(str(record.get("raw_place_panel_text") or ""))
    if panel and any(phrase in panel for phrase in _CLOSED_PHRASES):
        return False
    cat = _normalize_text(str(record.get("raw_category") or ""))
    if cat and cat in _NON_STAY_CATEGORIES:
        return False
    return True


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def build_queries(
    areas: list[dict[str, Any]] | None = None,
    categories: tuple[str, ...] | list[str] = CATEGORIES,
) -> list[dict[str, Any]]:
    """Build stable, resumable Google Maps searches for every chosen area."""
    query_jobs: list[dict[str, Any]] = []
    for area in AREAS if areas is None else areas:
        for category in categories:
            locality = f"{area['administrative_type']} {area['locality']}"
            query = f"{category} {locality}, {area['city']}"
            query_jobs.append(
                {
                    "query_id": f"{area['area_id']}:{_normalize_text(category).replace(' ', '-')}",
                    "query": query,
                    "category": category,
                    **area,
                }
            )
    return query_jobs


def select_area_scope(
    area_ids: list[int] | None = None,
    all_areas: bool = False,
) -> list[dict[str, Any]]:
    """Choose explicit areas, all 134 areas, or the default tourism-focused shortlist."""
    if area_ids:
        requested = set(area_ids)
        selected = [area for area in AREAS if area["area_id"] in requested]
        missing = requested - {area["area_id"] for area in selected}
        if missing:
            raise SystemExit(
                f"Mã khu vực không có trong danh sách: {', '.join(map(str, sorted(missing)))}"
            )
        return selected
    if all_areas:
        return list(AREAS)
    return [area for area in AREAS if area["area_id"] in TOURISM_AREA_IDS]


def select_area_batch(
    areas: list[dict[str, Any]],
    categories: tuple[str, ...] | list[str],
    completed_query_ids: set[str],
    max_areas_per_run: int | None = None,
    force: bool = False,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Select the next ordered group of areas with unfinished searches."""
    jobs = build_queries(areas, categories)
    if max_areas_per_run is None:
        return areas, jobs

    pending_area_ids: list[int] = []
    for job in jobs:
        if (force or job["query_id"] not in completed_query_ids) and job["area_id"] not in pending_area_ids:
            pending_area_ids.append(job["area_id"])
        if len(pending_area_ids) >= max_areas_per_run:
            break

    selected_ids = set(pending_area_ids)
    selected_areas = [area for area in areas if area["area_id"] in selected_ids]
    return selected_areas, build_queries(selected_areas, categories)


def query_needs_gallery_refresh(job: dict[str, Any], records: list[dict[str, Any]]) -> bool:
    """Find completed searches whose saved places have not been gallery-scanned."""
    for record in records:
        matched_queries = set(record.get("matched_queries") or [])
        if record.get("search_query"):
            matched_queries.add(record["search_query"])
        if job["query"] not in matched_queries:
            continue
        if record.get("gallery_scan_version") not in (1, GALLERY_SCAN_VERSION):
            return True
        if (
            record.get("gallery_scan_complete") is not True
            and record.get("gallery_scan_status") != "gallery_not_detected"
        ):
            return True
    return False


def _clean_record_fields(record: dict[str, Any]) -> None:
    """Strip Maps PUA icon glyphs and backfill missing fields from raw_place_panel_text."""
    for field in ("place_name", "raw_address", "raw_phone", "raw_category", "raw_rating", "raw_price"):
        if isinstance(record.get(field), str):
            record[field] = _clean_text(record[field]) or None

    for field in ("raw_details", "raw_place_panel_text", "raw_card_text"):
        if isinstance(record.get(field), str):
            record[field] = _clean_multiline(record[field]) or None

    panel_text = record.get("raw_place_panel_text") or ""
    if panel_text:
        if not record.get("raw_review_count"):
            record["raw_review_count"] = _extract_review_count([panel_text])
        if not record.get("raw_category"):
            record["raw_category"] = _extract_category_from_panel(panel_text)
        if not record.get("raw_price"):
            record["raw_price"] = _extract_price_from_panel(panel_text)

    inferred_city = _infer_city_from_record(record)
    if inferred_city:
        record["city"] = inferred_city
        matched_areas = record.get("matched_areas") or []
        matching_area = next(
            (area for area in matched_areas if isinstance(area, dict) and area.get("city") == inferred_city),
            None,
        )
        if matching_area:
            for field in ("area_id", "city", "administrative_type", "locality"):
                if matching_area.get(field) is not None:
                    record[field] = matching_area[field]


def _record_richness_score(record: dict[str, Any]) -> tuple[int, int, int, int]:
    return (
        1 if record.get("image_url") else 0,
        len(record.get("gallery_urls") or []),
        sum(
            1
            for field in ("raw_address", "raw_phone", "raw_category", "raw_rating", "raw_review_count", "raw_price")
            if record.get(field)
        ),
        1 if record.get("raw_place_panel_text") else 0,
    )


class RawStayStore:
    """JSON-array output plus a separate, atomically written resume file."""

    def __init__(self, output_path: Path):
        self.output_path = output_path
        self.progress_path = output_path.with_suffix(output_path.suffix + ".progress.json")
        self.records: list[dict[str, Any]] = []
        self._index: dict[str, int] = {}
        self.completed_query_ids: set[str] = set()
        self.failed_queries: dict[str, dict[str, str]] = {}
        self._output_missing_or_empty = not self.output_path.exists()
        self._load()

    def _rebuild_index(self) -> None:
        self._index = {}
        for idx, row in enumerate(self.records):
            key = _record_key(row)
            self._index.setdefault(key, idx)
            for merged_pid in row.get("merged_place_ids") or []:
                if merged_pid:
                    self._index.setdefault(f"place:{merged_pid}", idx)

    def _load(self) -> None:
        if self.output_path.exists():
            with self.output_path.open("r", encoding="utf-8") as source:
                output_text = source.read()
            if not output_text.strip():
                self._output_missing_or_empty = True
                print(f"⚠️ File JSON đầu ra đang rỗng, sẽ bắt đầu dữ liệu mới: {self.output_path}")
                loaded = []
            else:
                try:
                    loaded = json.loads(output_text)
                except json.JSONDecodeError as exc:
                    raise SystemExit(
                        f"File đầu ra không phải JSON hợp lệ ({self.output_path}, "
                        f"dòng {exc.lineno}, cột {exc.colno}); file được giữ nguyên. "
                        "Hãy sửa JSON hoặc chọn file khác bằng --output."
                    ) from exc
            if not isinstance(loaded, list):
                raise SystemExit(
                    f"File đầu ra phải chứa một JSON array: {self.output_path}. "
                    "Hãy chọn file khác bằng --output nếu đây là dữ liệu khác."
                )
            for row in loaded:
                if isinstance(row, dict):
                    self.records.append(row)
            self._rebuild_index()

        if self.progress_path.exists():
            try:
                with self.progress_path.open("r", encoding="utf-8") as source:
                    progress_text = source.read()
                if not progress_text.strip():
                    raise ValueError("file tiến độ rỗng")
                progress = json.loads(progress_text)
                if not isinstance(progress, dict):
                    raise ValueError("cấu trúc file tiến độ không hợp lệ")
                completed = progress.get("completed_query_ids") or []
                failed = progress.get("failed_queries") or {}
                if not isinstance(completed, list) or not isinstance(failed, dict):
                    raise ValueError("cấu trúc file tiến độ không hợp lệ")
                if self._output_missing_or_empty:
                    if completed:
                        print(
                            "⚠️ Bỏ checkpoint hoàn tất vì file dữ liệu bị thiếu/rỗng; "
                            "các truy vấn sẽ được cào lại."
                        )
                else:
                    self.completed_query_ids = {str(query_id) for query_id in completed}
                self.failed_queries = failed
            except (OSError, json.JSONDecodeError, AttributeError, TypeError, ValueError) as exc:
                print(f"⚠️ Không đọc được file tiến độ {self.progress_path}: {exc}")

    def get(self, key: str) -> dict[str, Any] | None:
        index = self._index.get(key)
        return self.records[index] if index is not None else None

    def merge(self, incoming: dict[str, Any]) -> str:
        _clean_record_fields(incoming)
        key = _record_key(incoming)
        index = self._index.get(key)
        if index is None:
            self._index[key] = len(self.records)
            self.records.append(dict(incoming))
            return key

        current = self.records[index]
        list_fields = (
            "gallery_urls",
            "image_urls",
            "search_queries",
            "matched_queries",
            "matched_areas",
            "raw_card_labels",
            "merged_place_ids",
        )
        for field in list_fields:
            if field in incoming:
                current[field] = _unique([*(current.get(field) or []), *(incoming.get(field) or [])])

        area_fields = {"area_id", "city", "administrative_type", "locality", "search_query", "category_query"}
        inferred_city = _infer_city_from_record({**current, **incoming})
        allow_area_overwrite = bool(
            inferred_city and current.get("city") != inferred_city and incoming.get("city") == inferred_city
        )

        for field, value in incoming.items():
            if field in list_fields or value in (None, "", [], {}):
                continue
            if field in area_fields and current.get(field) not in (None, "") and not allow_area_overwrite:
                continue
            current[field] = value

        if incoming.get("detail_scraped_at") and not incoming.get("detail_error"):
            current.pop("detail_error", None)

        _clean_record_fields(current)
        current["image_url"] = current.get("image_url") or next(iter(current.get("gallery_urls") or []), None)
        return key

    def cleanup_and_deduplicate(self) -> dict[str, int]:
        """Normalize fields, drop invalid/out-of-region stays, and merge close same-name duplicates."""
        stats = {
            "initial": len(self.records),
            "dropped_out_of_region": 0,
            "dropped_invalid_stay": 0,
            "merged_duplicates": 0,
        }
        valid_records: list[dict[str, Any]] = []
        for row in self.records:
            _clean_record_fields(row)
            if not _is_in_target_region(row):
                stats["dropped_out_of_region"] += 1
                continue
            if not _is_valid_stay_record(row):
                stats["dropped_invalid_stay"] += 1
                continue
            valid_records.append(row)

        by_name: dict[str, list[dict[str, Any]]] = {}
        deduped: list[dict[str, Any]] = []
        for row in valid_records:
            norm_name = _normalize_text(str(row.get("place_name") or ""))
            if not norm_name:
                deduped.append(row)
                continue
            lat, lon = row.get("latitude"), row.get("longitude")
            matched_group: dict[str, Any] | None = None
            for existing in by_name.get(norm_name, []):
                elat, elon = existing.get("latitude"), existing.get("longitude")
                if all(isinstance(v, (int, float)) for v in (lat, lon, elat, elon)):
                    if _haversine_meters(lat, lon, elat, elon) <= 150.0:
                        matched_group = existing
                        break
            if matched_group is None:
                by_name.setdefault(norm_name, []).append(row)
                deduped.append(row)
                continue

            stats["merged_duplicates"] += 1
            winner, loser = (
                (row, matched_group)
                if _record_richness_score(row) > _record_richness_score(matched_group)
                else (matched_group, row)
            )
            if winner is row:
                idx = deduped.index(matched_group)
                deduped[idx] = row
                group_list = by_name[norm_name]
                group_list[group_list.index(matched_group)] = row

            for list_field in (
                "gallery_urls", "image_urls", "search_queries", "matched_queries",
                "matched_areas", "raw_card_labels", "merged_place_ids",
            ):
                winner[list_field] = _unique([*(winner.get(list_field) or []), *(loser.get(list_field) or [])])
            if loser.get("place_id") and loser.get("place_id") != winner.get("place_id"):
                winner["merged_place_ids"] = _unique([*(winner.get("merged_place_ids") or []), loser["place_id"]])
            for field in ("raw_address", "raw_phone", "raw_website_url", "raw_category", "raw_rating", "raw_review_count", "raw_price"):
                if not winner.get(field) and loser.get(field):
                    winner[field] = loser[field]
            winner["image_url"] = winner.get("image_url") or next(iter(winner.get("gallery_urls") or []), None)

        self.records = deduped
        self._rebuild_index()
        stats["final"] = len(self.records)
        return stats

    def mark_completed(self, query_id: str) -> None:
        self.completed_query_ids.add(query_id)
        self.failed_queries.pop(query_id, None)

    def mark_failed(self, query_id: str, query: str, error: str) -> None:
        self.failed_queries[query_id] = {
            "query": query,
            "error": error[:1000],
            "failed_at": _utc_now(),
        }

    @staticmethod
    def _atomic_json_write(path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_name: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                newline="\n",
                dir=path.parent,
                suffix=".tmp",
                delete=False,
            ) as temp_file:
                temp_name = temp_file.name
                json.dump(data, temp_file, ensure_ascii=False, indent=2)
                temp_file.write("\n")
            for attempt in range(12):
                try:
                    os.replace(temp_name, path)
                    break
                except PermissionError:
                    if attempt == 11:
                        raise
                    time.sleep(0.15)
        finally:
            if temp_name and os.path.exists(temp_name):
                os.unlink(temp_name)

    def save(self) -> None:
        self._atomic_json_write(self.output_path, self.records)
        self._atomic_json_write(
            self.progress_path,
            {
                "updated_at": _utc_now(),
                "completed_query_ids": sorted(self.completed_query_ids),
                "failed_queries": self.failed_queries,
                "record_count": len(self.records),
            },
        )


def _extract_result_cards(page: Any) -> list[dict[str, Any]]:
    cards = page.eval_on_selector_all(
        CARD_SELECTOR,
        """elements => elements.map(card => {
            const first = selector => card.querySelector(selector);
            const link = first("a[href*='/maps/place/']") || first("a.hfpxzc");
            const title = first(".qBF1Pd") || link;
            const rating = first(".MW4etd");
            const labels = Array.from(card.querySelectorAll("[aria-label]"))
                .map(el => el.getAttribute("aria-label"))
                .filter(Boolean);
            const photos = Array.from(card.querySelectorAll("img"))
                .map(img => img.currentSrc || img.src || img.getAttribute("srcset") || "")
                .filter(Boolean);
            return {
                name: title ? (title.innerText || title.textContent || "").trim() : "",
                href: link ? link.href : "",
                rating: rating ? (rating.innerText || rating.textContent || "").trim() : "",
                labels,
                photos,
                card_text: (card.innerText || card.textContent || "").trim()
            };
        })""",
    )
    return [row for row in cards if row.get("name") or row.get("href")]


def _collect_visible_photos(page: Any) -> list[str]:
    try:
        sources = page.evaluate("""() => {
            const imageSources = Array.from(document.querySelectorAll("img"))
                .flatMap(img => [img.currentSrc, img.src, img.getAttribute("srcset")])
                .filter(Boolean);
            const photoBackgrounds = Array.from(
                document.querySelectorAll(
                    '[data-photo-index], [data-photo-index] [style*="background-image"], [data-photo-index] [role="img"]'
                )
            )
                .map(el => el.style?.backgroundImage || getComputedStyle(el).backgroundImage)
                .flatMap(value => Array.from(value.matchAll(/url\\([\"']?(.*?)[\"']?\\)/g), match => match[1]))
                .filter(Boolean);
            return [...imageSources, ...photoBackgrounds];
        }""")
    except Exception:
        return []

    photos: list[str] = []
    for raw in sources:
        # srcset has descriptors after each URL; retain all candidate URLs.
        for candidate in str(raw).split(","):
            source = candidate.strip().split(" ", 1)[0]
            normalized = _photo_url(source)
            if normalized:
                photos.append(normalized)
    return _unique(photos)


def _advance_photo_gallery(page: Any) -> dict[str, Any]:
    """Scroll the Maps photo gallery and click its next-photo control if present."""
    return page.evaluate("""() => {
        const photoItems = Array.from(document.querySelectorAll("[data-photo-index]"));
        const anchor = photoItems.find(el => el.getAttribute("data-photo-index") === "0") || photoItems[0];
        const isScrollable = el => {
            const style = getComputedStyle(el);
            return (el.scrollHeight > el.clientHeight + 40 && /(auto|scroll)/.test(style.overflowY)) ||
                   (el.scrollWidth > el.clientWidth + 40 && /(auto|scroll)/.test(style.overflowX));
        };

        let scroller = null;
        for (let el = anchor; el && el !== document.body; el = el.parentElement) {
            if (isScrollable(el)) { scroller = el; break; }
        }
        if (!scroller && photoItems.length) {
            scroller = Array.from(document.querySelectorAll("div,[role='dialog']"))
                .filter(el => el.querySelector("[data-photo-index]") && isScrollable(el))
                .sort((a, b) => (a.scrollHeight + a.scrollWidth) - (b.scrollHeight + b.scrollWidth))[0] || null;
        }

        let moved = false;
        let atEnd = true;
        if (scroller) {
            const beforeTop = scroller.scrollTop;
            const beforeLeft = scroller.scrollLeft;
            const canScrollY = scroller.scrollHeight > scroller.clientHeight + 40;
            const canScrollX = scroller.scrollWidth > scroller.clientWidth + 40;
            if (canScrollY) scroller.scrollTop = Math.min(beforeTop + Math.max(250, scroller.clientHeight * 0.8), scroller.scrollHeight);
            if (canScrollX) scroller.scrollLeft = Math.min(beforeLeft + Math.max(250, scroller.clientWidth * 0.8), scroller.scrollWidth);
            moved = scroller.scrollTop !== beforeTop || scroller.scrollLeft !== beforeLeft;
            atEnd = (!canScrollY || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 8) &&
                    (!canScrollX || scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8);
        }

        const nextPattern = /((next|ti[eế]p|k[eế]|sau).*(photo|image|ảnh))|((photo|image|ảnh).*(next|ti[eế]p|k[eế]|sau))/i;
        const buttons = Array.from(document.querySelectorAll("button,[role='button']"));
        const nextButton = buttons.find(button => {
            const rect = button.getBoundingClientRect();
            const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.innerText]
                .filter(Boolean).join(" ").trim();
            return rect.width > 0 && rect.height > 0 && !button.disabled &&
                   button.getAttribute("aria-disabled") !== "true" && nextPattern.test(label);
        });
        if (nextButton) nextButton.click();

        return {
            moved,
            clicked_next: Boolean(nextButton),
            at_end: atEnd,
            gallery_detected: Boolean(photoItems.length || document.querySelector("[role='dialog']") || nextButton)
        };
    }""")


def _collect_all_gallery_photos(
    page: Any,
    max_scrolls: int,
    scroll_delay_ms: int,
    on_checkpoint: Any | None = None,
) -> tuple[list[str], bool, str]:
    photos = _collect_visible_photos(page)
    last_checkpoint_count = len(photos)
    stalled_rounds = 0
    gallery_detected = False

    for step in range(1, max_scrolls + 1):
        try:
            action = _advance_photo_gallery(page)
        except Exception as exc:
            return photos, False, f"gallery_control_error: {exc}"
        gallery_detected = gallery_detected or bool(action.get("gallery_detected"))
        page.wait_for_timeout(scroll_delay_ms)

        updated = _unique([*photos, *_collect_visible_photos(page)])
        added_count = len(updated) - len(photos)
        photos = updated
        if added_count:
            stalled_rounds = 0
        else:
            stalled_rounds += 1

        if on_checkpoint and len(photos) - last_checkpoint_count >= 5:
            on_checkpoint(photos)
            last_checkpoint_count = len(photos)

        if step == 1 or step % 10 == 0:
            print(f"    Đang duyệt thư viện ảnh: {len(photos)} URL, lượt {step}/{max_scrolls}.", flush=True)

        if stalled_rounds >= 6 and (action.get("at_end") or not action.get("moved")):
            if on_checkpoint and len(photos) > last_checkpoint_count:
                on_checkpoint(photos)
            if not gallery_detected:
                return photos, False, "gallery_not_detected"
            return photos, True, "no_new_photos_loaded"

    if on_checkpoint and len(photos) > last_checkpoint_count:
        on_checkpoint(photos)
    return photos, False, "max_gallery_scrolls_reached"


def _card_record(card: dict[str, Any], job: dict[str, Any], search_url: str) -> dict[str, Any]:
    href = card.get("href") or ""
    maps_url = urljoin(search_url, href) if href else None
    photos = _unique([photo for raw in card.get("photos") or [] if (photo := _photo_url(raw))])
    labels = [str(label).strip() for label in card.get("labels") or [] if str(label).strip()]
    raw_card_text = str(card.get("card_text") or "").strip()
    if raw_card_text:
        labels.append(raw_card_text)

    rating = _clean_text(card.get("rating")) or _extract_rating(labels)
    place_id = _place_id_from_url(maps_url or "")
    latitude, longitude = _coordinates_from_url(maps_url or "")

    area = {
        "area_id": job["area_id"],
        "city": job["city"],
        "administrative_type": job["administrative_type"],
        "locality": job["locality"],
    }
    return {
        **area,
        "place_id": place_id,
        "place_name": _clean_text(card.get("name")) or None,
        "raw_rating": rating,
        "raw_review_count": _extract_review_count(labels),
        "raw_category": None,
        "raw_address": None,
        "raw_phone": None,
        "raw_website_url": None,
        "raw_price": None,
        "raw_details": raw_card_text or None,
        "raw_card_text": raw_card_text or None,
        "raw_card_labels": labels,
        "search_query": job["query"],
        "search_queries": [job["query"]],
        "category_query": job["category"],
        "matched_queries": [job["query"]],
        "matched_areas": [area],
        "google_maps_url": maps_url,
        "latitude": latitude,
        "longitude": longitude,
        "image_url": photos[0] if photos else None,
        "gallery_urls": photos,
        "image_urls": photos,
        "raw_place_panel_text": None,
        "detail_scraped_at": None,
        "scraped_at": _utc_now(),
    }


def _scroll_results(page: Any, max_scrolls: int, max_results: int, scroll_delay_ms: int) -> None:
    page.wait_for_selector('div[role="feed"]', timeout=12000)
    feed = page.locator('div[role="feed"]').first
    stable_rounds = 0
    previous_count = 0

    for scroll_number in range(1, max_scrolls + 1):
        count = page.locator(CARD_SELECTOR).count()
        if max_results > 0 and count >= max_results:
            return
        if count <= previous_count:
            stable_rounds += 1
        else:
            stable_rounds = 0
        if stable_rounds >= 3:
            return
        previous_count = count
        if scroll_number == 1 or scroll_number % 5 == 0:
            print(f"  Đang cuộn kết quả ({scroll_number}/{max_scrolls}, đang thấy {count} thẻ)...", flush=True)
        try:
            feed.evaluate("element => { element.scrollTop = element.scrollHeight; }")
        except Exception:
            page.evaluate(
                """() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollTop = feed.scrollHeight;
                }"""
            )
        page.wait_for_timeout(scroll_delay_ms)


def _read_panel_value(page: Any, selectors: tuple[str, ...], attribute: str | None = None) -> str | None:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            value = locator.get_attribute(attribute, timeout=700) if attribute else locator.inner_text(timeout=700)
            value = _clean_text(value)
            if value:
                return value
        except Exception:
            continue
    return None


def _scrape_place_details(
    page: Any,
    record: dict[str, Any],
    max_gallery_scrolls: int = 200,
    gallery_scroll_delay_ms: int = 350,
    on_gallery_checkpoint: Any | None = None,
) -> dict[str, Any]:
    maps_url = record.get("google_maps_url")
    if not maps_url:
        return {}

    page.goto(maps_url, wait_until="domcontentloaded", timeout=45000)
    try:
        page.wait_for_selector("h1", timeout=12000)
    except Exception:
        page.wait_for_timeout(1800)
    page.wait_for_timeout(900)

    panel_text = ""
    try:
        panel_text = _clean_multiline(page.locator('div[role="main"]').first.inner_text(timeout=2500))[:8000]
    except Exception:
        pass

    name = _read_panel_value(page, ("h1.DUwDvf", 'div[role="main"] h1', "h1"))
    address = _read_panel_value(
        page,
        ('button[data-item-id="address"]', 'button[aria-label^="Địa chỉ:"]', 'button[aria-label^="Address:"]'),
    )
    phone = _read_panel_value(
        page,
        ('button[data-item-id^="phone:"]', 'button[aria-label^="Điện thoại:"]', 'button[aria-label^="Phone:"]'),
    )
    website = _read_panel_value(
        page,
        ('a[data-item-id="authority"]', 'a[aria-label^="Trang web:"]', 'a[aria-label^="Website:"]'),
        attribute="href",
    )
    category = _read_panel_value(
        page,
        ('button[jsaction*="pane.rating.category"]', 'button.DkEaL', 'button[jsaction*="category"]'),
    ) or _extract_category_from_panel(panel_text)
    rating = _read_panel_value(
        page,
        ('div.F7nice span[aria-hidden="true"]', 'span[aria-label*="sao"]', 'span[aria-label*="star"]'),
    )
    review_label = _read_panel_value(
        page,
        (
            'div.F7nice span[aria-label*="đánh giá"]',
            'div.F7nice span[aria-label*="review"]',
            'button[jsaction*="pane.rating.moreReviews"]',
            'button[aria-label*="đánh giá"]',
            'button[aria-label*="reviews"]',
        ),
        attribute="aria-label",
    ) or _read_panel_value(page, ("div.F7nice",))
    price = _read_panel_value(page, (".fontTitleLarge.FhDxwe", "div.dkgw2 span")) or _extract_price_from_panel(panel_text)

    # The place header image button opens the photo viewer, where Maps usually
    # renders more genuine user photos than the small search-result card.
    for selector in (
        'button[jsaction*="heroHeaderImage"]',
        'button[aria-label^="Ảnh của "]',
        'button[aria-label^="Photo of "]',
        'button:has-text("Xem ảnh")',
    ):
        try:
            button = page.locator(selector).first
            if button.count() and button.is_visible():
                button.click(timeout=1200)
                page.wait_for_timeout(1200)
                break
        except Exception:
            continue

    photos, gallery_complete, gallery_status = _collect_all_gallery_photos(
        page,
        max_scrolls=max_gallery_scrolls,
        scroll_delay_ms=gallery_scroll_delay_ms,
        on_checkpoint=on_gallery_checkpoint,
    )
    latitude, longitude = _coordinates_from_url(page.url)
    panel_labels = [label for label in (review_label, panel_text) if label]

    detail = {
        "raw_place_panel_text": panel_text or None,
        "raw_address": address,
        "raw_phone": phone,
        "raw_website_url": website,
        "raw_category": category,
        "raw_price": price or record.get("raw_price"),
        "raw_rating": rating or record.get("raw_rating"),
        "raw_review_count": _extract_review_count(panel_labels) or record.get("raw_review_count"),
        "raw_details": panel_text or record.get("raw_details"),
        "place_name": name or record.get("place_name"),
        "latitude": latitude if latitude is not None else record.get("latitude"),
        "longitude": longitude if longitude is not None else record.get("longitude"),
        "detail_scraped_at": _utc_now(),
        "gallery_scraped_at": _utc_now(),
        "gallery_scan_version": GALLERY_SCAN_VERSION,
        "gallery_scan_complete": gallery_complete,
        "gallery_scan_status": gallery_status,
        "gallery_photo_count": len(photos),
    }
    if photos:
        detail["gallery_urls"] = photos
        detail["image_urls"] = photos
        detail["image_url"] = photos[0]
    return detail


def _search_url(query: str) -> str:
    from urllib.parse import quote

    return f"https://www.google.com/maps/search/{quote(query, safe='')}"


def _record_needs_refresh(record: dict[str, Any]) -> bool:
    if record.get("gallery_scan_version") == GALLERY_SCAN_VERSION:
        return False
    return bool(
        not record.get("image_url")
        or record.get("detail_error")
        or record.get("gallery_scan_complete") is not True
    )


def _refresh_incomplete_records(
    context: Any,
    store: RawStayStore,
    args: argparse.Namespace,
) -> tuple[int, bool]:
    targets = [row for row in list(store.records) if _record_needs_refresh(row)]
    if args.limit_refresh is not None:
        targets = targets[: args.limit_refresh]
    if not targets:
        print("Không có bản ghi nào cần cào bổ sung chi tiết/ảnh.", flush=True)
        return 0, False

    print(f"\nĐang cập nhật chi tiết/ảnh cho {len(targets)} bản ghi chưa đủ...", flush=True)
    detail_page = context.new_page()
    failures = 0
    interrupted = False
    try:
        for idx, existing in enumerate(targets, start=1):
            record = dict(existing)
            print(
                f"  [Bổ sung {idx}/{len(targets)}] "
                f"{record.get('place_name') or record.get('google_maps_url')}",
                flush=True,
            )
            try:
                def save_gallery_checkpoint(photo_urls: list[str]) -> None:
                    record["gallery_urls"] = _unique([*(record.get("gallery_urls") or []), *photo_urls])
                    record["image_urls"] = list(record["gallery_urls"])
                    record["image_url"] = record["gallery_urls"][0] if record["gallery_urls"] else None
                    record["gallery_photo_count"] = len(record["gallery_urls"])
                    store.merge(record)

                detail = _scrape_place_details(
                    detail_page,
                    record,
                    max_gallery_scrolls=args.max_gallery_scrolls,
                    gallery_scroll_delay_ms=args.gallery_scroll_delay_ms,
                    on_gallery_checkpoint=save_gallery_checkpoint,
                )
                record.update(detail)
                record.pop("detail_error", None)
                store.merge(record)
            except Exception as exc:
                failures += 1
                record["detail_error"] = str(exc)[:500]
                store.merge(record)
                print(f"  ⚠ Lỗi cập nhật: {record.get('place_name')}: {exc}", flush=True)
                if "crash" in str(exc).lower() or "closed" in str(exc).lower():
                    try:
                        detail_page.close()
                    except Exception:
                        pass
                    detail_page = context.new_page()

            if idx % args.checkpoint_every == 0:
                store.save()
            if args.detail_delay:
                time.sleep(args.detail_delay)
    except KeyboardInterrupt:
        interrupted = True
        print("\n⏸ Đã nhận Ctrl+C khi bổ sung; đang lưu checkpoint...", flush=True)
    finally:
        try:
            detail_page.close()
        except Exception:
            pass
    store.save()
    return failures, interrupted


def run_crawl(args: argparse.Namespace) -> int:
    output_path = Path(args.output).expanduser().resolve()
    store = RawStayStore(output_path)

    if args.cleanup_only or args.refresh_incomplete:
        stats = store.cleanup_and_deduplicate()
        store.save()
        print(
            f"Đã làm sạch dữ liệu hiện có: {stats['initial']} -> {stats['final']} bản ghi "
            f"(loại ngoài vùng: {stats['dropped_out_of_region']}, "
            f"loại phi lưu trú/đóng cửa: {stats['dropped_invalid_stay']}, "
            f"gộp trùng: {stats['merged_duplicates']}).",
            flush=True,
        )
        if args.cleanup_only:
            return 0

    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "Thiếu Playwright. Hãy cài trong môi trường backend bằng: "
            "pip install playwright && playwright install chromium"
        ) from exc

    selected_areas = select_area_scope(args.area_ids, args.all_areas)
    if not args.area_ids and args.limit_areas:
        selected_areas = selected_areas[: args.limit_areas]

    if args.area_ids:
        scope_label = "mã khu vực chỉ định"
    elif args.all_areas:
        scope_label = "toàn bộ 134 khu vực"
    else:
        scope_label = f"danh sách ưu tiên du lịch ({len(TOURISM_AREA_IDS)} khu vực)"

    completed_query_ids = set(store.completed_query_ids)
    if not completed_query_ids and store.records and not args.force:
        seen_queries = {
            q
            for r in store.records
            for q in [*(r.get("matched_queries") or []), r.get("search_query")]
            if q
        }
        for job in build_queries(selected_areas, args.categories):
            if job["query"] in seen_queries:
                completed_query_ids.add(job["query_id"])
                store.completed_query_ids.add(job["query_id"])

    if not args.force and not args.skip_details and not args.refresh_incomplete:
        for job in build_queries(selected_areas, args.categories):
            if job["query_id"] in completed_query_ids and query_needs_gallery_refresh(job, store.records):
                completed_query_ids.discard(job["query_id"])

    selected_areas, jobs = select_area_batch(
        selected_areas,
        args.categories,
        completed_query_ids,
        max_areas_per_run=args.max_areas_per_run,
        force=args.force,
    )

    pending_jobs = (
        []
        if args.refresh_only
        else [job for job in jobs if args.force or job["query_id"] not in completed_query_ids]
    )

    print(f"Phạm vi: {scope_label}", flush=True)
    print(f"Khu vực lượt này: {len(selected_areas)} | Nhóm tìm kiếm: {len(args.categories)} | Truy vấn: {len(jobs)}", flush=True)
    print(f"Còn phải chạy: {len(pending_jobs)} | Bản ghi đã có: {len(store.records)}", flush=True)
    print(f"JSON: {output_path}", flush=True)
    print(f"Tiến độ: {store.progress_path}", flush=True)
    if not pending_jobs and not args.refresh_incomplete:
        print("Tất cả truy vấn đã hoàn thành. Dùng --force nếu muốn cào lại.", flush=True)
        return 0

    failures = 0
    interrupted = False
    with sync_playwright() as playwright:
        launch_args = ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        try:
            browser = playwright.chromium.launch(headless=args.headless, args=launch_args)
        except Exception:
            browser = playwright.chromium.launch(channel="chrome", headless=args.headless, args=launch_args)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1365, "height": 900},
            locale="vi-VN",
        )
        try:
            if args.refresh_incomplete:
                refresh_failures, interrupted = _refresh_incomplete_records(context, store, args)
                failures += refresh_failures

            if not interrupted and pending_jobs:
                search_page = context.new_page()
                detail_page = context.new_page() if not args.skip_details else None
                try:
                    for job_number, job in enumerate(pending_jobs, start=1):
                        print(
                            f"\n[{job_number}/{len(pending_jobs)}] "
                            f"{job['administrative_type']} {job['locality']}, {job['city']} "
                            f"— {job['category']}",
                            flush=True,
                        )
                        search_url = _search_url(job["query"])
                        try:
                            print(f"  Đang mở tìm kiếm Maps: {job['query']}", flush=True)
                            search_page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
                            search_page.wait_for_timeout(args.initial_wait_ms)
                            try:
                                _scroll_results(
                                    search_page,
                                    max_scrolls=args.max_scrolls,
                                    max_results=args.max_results_per_query,
                                    scroll_delay_ms=args.scroll_delay_ms,
                                )
                                cards = _extract_result_cards(search_page)
                            except Exception as feed_error:
                                cards = []
                                try:
                                    name = search_page.locator("h1").first.inner_text(timeout=1200).strip()
                                except Exception:
                                    name = ""
                                if name and "/maps/place/" in search_page.url:
                                    cards = [
                                        {
                                            "name": name,
                                            "href": search_page.url,
                                            "rating": "",
                                            "labels": [],
                                            "photos": _collect_visible_photos(search_page),
                                            "card_text": name,
                                        }
                                    ]
                                if not cards:
                                    raise RuntimeError(
                                        "Google Maps không hiển thị danh sách kết quả hoặc hồ sơ địa điểm"
                                    ) from feed_error

                            if args.max_results_per_query > 0:
                                cards = cards[: args.max_results_per_query]
                            print(f"  Tìm thấy {len(cards)} thẻ kết quả.", flush=True)

                            for card_number, card in enumerate(cards, start=1):
                                record = _card_record(card, job, search_url)
                                if not record.get("place_name") and not record.get("google_maps_url"):
                                    continue
                                if not _is_valid_stay_record(record):
                                    continue
                                key = _record_key(record)
                                existing = store.get(key)
                                gallery_scan_finished = bool(
                                    existing
                                    and existing.get("detail_scraped_at")
                                    and existing.get("gallery_scan_version") in (1, GALLERY_SCAN_VERSION)
                                    and existing.get("image_url")
                                    and (
                                        existing.get("gallery_scan_complete") is True
                                        or existing.get("gallery_scan_status") == "gallery_not_detected"
                                    )
                                )
                                if detail_page and not gallery_scan_finished:
                                    try:
                                        print(
                                            f"  Chi tiết [{card_number}/{len(cards)}]: "
                                            f"{record.get('place_name') or record.get('google_maps_url')}",
                                            flush=True,
                                        )

                                        def save_gallery_checkpoint(photo_urls: list[str]) -> None:
                                            record["gallery_urls"] = _unique([*(record.get("gallery_urls") or []), *photo_urls])
                                            record["image_urls"] = list(record["gallery_urls"])
                                            record["image_url"] = record["gallery_urls"][0] if record["gallery_urls"] else None
                                            record["gallery_photo_count"] = len(record["gallery_urls"])
                                            if _is_valid_stay_record(record):
                                                store.merge(record)

                                        detail = _scrape_place_details(
                                            detail_page,
                                            record,
                                            max_gallery_scrolls=args.max_gallery_scrolls,
                                            gallery_scroll_delay_ms=args.gallery_scroll_delay_ms,
                                            on_gallery_checkpoint=save_gallery_checkpoint,
                                        )
                                        record.update(detail)
                                        if not detail.get("gallery_scan_complete"):
                                            print(
                                                f"  ⚠ Thư viện ảnh chưa xác nhận hết: "
                                                f"{detail.get('gallery_scan_status')} "
                                                f"({detail.get('gallery_photo_count', 0)} URL).",
                                                flush=True,
                                            )
                                        if args.detail_delay:
                                            time.sleep(args.detail_delay)
                                    except Exception as exc:
                                        record["detail_error"] = str(exc)[:500]
                                        print(
                                            f"  ⚠ Không lấy được chi tiết: {record.get('place_name')}: {exc}",
                                            flush=True,
                                        )
                                        if "crash" in str(exc).lower() or "closed" in str(exc).lower():
                                            try:
                                                detail_page.close()
                                            except Exception:
                                                pass
                                            detail_page = context.new_page()

                                if _is_valid_stay_record(record):
                                    store.merge(record)
                                if card_number % args.checkpoint_every == 0:
                                    store.save()
                                    print(
                                        f"  Đã checkpoint {card_number}/{len(cards)} thẻ; "
                                        f"{len(store.records)} bản ghi trong JSON.",
                                        flush=True,
                                    )

                            store.mark_completed(job["query_id"])
                            store.save()
                            print(f"  Đã lưu {len(store.records)} bản ghi; truy vấn hoàn tất.", flush=True)
                        except Exception as exc:
                            failures += 1
                            store.mark_failed(job["query_id"], job["query"], str(exc))
                            store.save()
                            print(f"❌ Lỗi truy vấn, sẽ được thử lại khi chạy tiếp: {exc}", flush=True)

                        if args.query_delay:
                            time.sleep(args.query_delay)
                except KeyboardInterrupt:
                    interrupted = True
                    print("\n⏸ Đã nhận Ctrl+C; đang lưu dữ liệu đã cào để có thể chạy tiếp...", flush=True)
                    store.save()
        finally:
            context.close()
            browser.close()

    store.cleanup_and_deduplicate()
    store.save()
    print(
        f"\nXong lượt này: {len(store.records)} bản ghi, "
        f"{len(store.completed_query_ids)} truy vấn hoàn tất, "
        f"{len(store.failed_queries)} truy vấn lỗi còn lại.",
        flush=True,
    )
    if interrupted:
        return 130
    return 1 if failures else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crawl dữ liệu lưu trú và URL ảnh Google Maps cho các khu vực Huế, Đà Nẵng."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"File JSON đầu ra (mặc định: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--categories",
        nargs="+",
        choices=CATEGORIES,
        default=list(CATEGORIES),
        help="Nhóm lưu trú cần tìm; mặc định chạy đủ các nhóm.",
    )
    parser.add_argument("--area-ids", nargs="+", type=int, help="Chỉ chạy các mã khu vực được chỉ định.")
    parser.add_argument(
        "--all-areas",
        action="store_true",
        help="Cào đủ 134 khu vực thay vì danh sách ưu tiên du lịch mặc định.",
    )
    parser.add_argument("--limit-areas", type=int, help="Chạy thử N khu vực đầu danh sách.")
    parser.add_argument(
        "--max-areas-per-run",
        type=int,
        help="Giới hạn số khu vực chưa hoàn tất mỗi lần chạy; chạy lại cùng lệnh để lấy nhóm tiếp theo.",
    )
    parser.add_argument(
        "--max-results-per-query",
        type=int,
        default=60,
        help="Số thẻ tối đa mỗi truy vấn; đặt 0 để không giới hạn (mặc định: 60).",
    )
    parser.add_argument("--max-scrolls", type=int, default=30, help="Số lần cuộn tối đa mỗi truy vấn.")
    parser.add_argument("--initial-wait-ms", type=int, default=3500, help="Thời gian chờ Maps tải kết quả.")
    parser.add_argument("--scroll-delay-ms", type=int, default=1200, help="Thời gian chờ sau mỗi lần cuộn.")
    parser.add_argument("--query-delay", type=float, default=1.0, help="Nghỉ giữa các truy vấn (giây).")
    parser.add_argument("--detail-delay", type=float, default=0.35, help="Nghỉ giữa các trang chi tiết (giây).")
    parser.add_argument(
        "--max-gallery-scrolls",
        type=int,
        default=200,
        help="Số lần cuộn tối đa thư viện ảnh của mỗi địa điểm (mặc định: 200).",
    )
    parser.add_argument(
        "--gallery-scroll-delay-ms",
        type=int,
        default=350,
        help="Thời gian chờ để ảnh tải sau mỗi lần cuộn thư viện (mặc định: 350 ms).",
    )
    parser.add_argument(
        "--checkpoint-every",
        type=int,
        default=5,
        help="Lưu JSON sau mỗi N kết quả để giảm mất dữ liệu khi dừng (mặc định: 5).",
    )
    parser.add_argument("--skip-details", action="store_true", help="Chỉ lấy thẻ kết quả và ảnh đang hiển thị.")
    parser.add_argument("--headless", action="store_true", help="Chạy Chromium ẩn; mặc định mở cửa sổ trình duyệt.")
    parser.add_argument("--force", action="store_true", help="Chạy lại cả truy vấn đã hoàn tất, vẫn gộp chống trùng.")
    parser.add_argument(
        "--cleanup-only",
        action="store_true",
        help="Chỉ làm sạch, khôi phục trường từ panel_text và gộp trùng dữ liệu hiện có.",
    )
    parser.add_argument(
        "--refresh-incomplete",
        action="store_true",
        help="Cào lại chi tiết/ảnh cho các bản ghi chưa đủ ảnh hoặc từng lỗi.",
    )
    parser.add_argument(
        "--refresh-only",
        action="store_true",
        help="Chỉ chạy bước bổ sung các bản ghi thiếu ảnh/lỗi, bỏ qua cào truy vấn khu vực mới.",
    )
    parser.add_argument("--limit-refresh", type=int, help="Giới hạn số bản ghi bổ sung khi dùng --refresh-incomplete.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.refresh_only:
        args.refresh_incomplete = True
    if args.all_areas and args.area_ids:
        raise SystemExit("Không dùng đồng thời --all-areas và --area-ids")
    if args.limit_areas is not None and args.limit_areas < 1:
        raise SystemExit("--limit-areas phải lớn hơn 0")
    if args.max_areas_per_run is not None and args.max_areas_per_run < 1:
        raise SystemExit("--max-areas-per-run phải lớn hơn 0")
    if args.limit_refresh is not None and args.limit_refresh < 1:
        raise SystemExit("--limit-refresh phải lớn hơn 0")
    if args.max_results_per_query < 0 or args.max_scrolls < 1:
        raise SystemExit("Giới hạn kết quả/cuộn không hợp lệ")
    if args.max_gallery_scrolls < 1 or args.gallery_scroll_delay_ms < 0:
        raise SystemExit("Giới hạn/thời gian cuộn thư viện ảnh không hợp lệ")
    if args.checkpoint_every < 1:
        raise SystemExit("--checkpoint-every phải lớn hơn 0")
    if args.initial_wait_ms < 0 or args.scroll_delay_ms < 0 or args.query_delay < 0 or args.detail_delay < 0:
        raise SystemExit("Các thời gian chờ không được âm")
    raise SystemExit(run_crawl(args))


if __name__ == "__main__":
    main()

"""
Quantitative constraint solver and verifier for Backend Copilot (AI 6-Layer Architecture - Part 2).

Enforces deterministic checks when Copilot suggests POIs or mutates/generates itineraries:
1. Budget constraint: C_total <= B_max with automatic cost-aware substitution or warning.
2. Opening-hours verification against DB / poi_contacts_cache.json (weekday, split shifts, closed days).
3. Anti-zig-zag route ordering (Nearest-Neighbor + 2-opt, preserving rest windows) & CO2 estimation.
"""
from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from functools import lru_cache
import json
import logging
from pathlib import Path
import re
from typing import Any, Callable

from psycopg import Connection

from app.itineraries.routing_service import FALLBACK_DETOUR_FACTOR, haversine_distance_meters
from app.trips.handlers.rainy_day_handler import INDOOR_SUB_CATEGORIES, OUTDOOR_EXCLUSIONS
from app.trips.schemas import CopilotChatResponse, CopilotSuggestedPoiItem, TripContextPayload
from app.trips.text_utils import normalize_vietnamese_query, strip_vietnamese_accents

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_POIS_CSV_PATH = _PROJECT_ROOT / "data" / "processed" / "all_pois_cleaned.csv"
_CONTACTS_CACHE_PATH = _PROJECT_ROOT / "data" / "processed" / "poi_contacts_cache.json"

from app.emission_factors import (
    EMISSION_FACTORS_CONFIG,
    get_emission_factor_g_pkm,
    calculate_carbon_footprint,
)

# Urban Vietnam passenger-km emissions baseline (g CO2e/km), derived from unified config
TRANSPORT_EMISSION_FACTORS_G_PER_KM: dict[str, int] = {
    "driving": int(get_emission_factor_g_pkm("taxi_car")),
    "motorcycle": int(get_emission_factor_g_pkm("motorcycle")),
    "transit": int(get_emission_factor_g_pkm("public_bus")),
    "walking": int(get_emission_factor_g_pkm("walking")),
}

TRANSPORT_LABELS_VI: dict[str, str] = {
    "driving": "Ô tô",
    "motorcycle": "Xe máy",
    "transit": "Buýt xanh",
    "walking": "Đi bộ",
}

TIER_DAILY_BUDGET_VND: dict[str, float] = {
    "budget": 500_000.0,
    "standard": 1_200_000.0,
    "luxury": 3_000_000.0,
}

SLOT_DEFAULT_WINDOWS: dict[str, tuple[str, str]] = {
    "morning": ("08:30", "11:00"),
    "lunch": ("11:30", "13:00"),
    "afternoon": ("14:30", "17:00"),
    "dinner": ("18:30", "20:30"),
}

# Python datetime.weekday(): 0=Monday .. 6=Sunday
_WEEKDAY_META: list[tuple[int, str, list[str], str]] = [
    (0, "Thứ Hai", [r"^thứ\s*(?:hai|2)(?=$|[\s:,.-])", r"^t2(?=$|[\s:,.-])", r"^monday\b"], r"thứ\s*(?:hai|2)(?=$|[\s:,.-])"),
    (1, "Thứ Ba", [r"^thứ\s*(?:ba|3)(?=$|[\s:,.-])", r"^t3(?=$|[\s:,.-])", r"^tuesday\b"], r"thứ\s*(?:ba|3)(?=$|[\s:,.-])"),
    (2, "Thứ Tư", [r"^thứ\s*(?:tư|tu|4)(?=$|[\s:,.-])", r"^t4(?=$|[\s:,.-])", r"^wednesday\b"], r"thứ\s*(?:tư|tu|4)(?=$|[\s:,.-])"),
    (3, "Thứ Năm", [r"^thứ\s*(?:năm|nam|5)(?=$|[\s:,.-])", r"^t5(?=$|[\s:,.-])", r"^thursday\b"], r"thứ\s*(?:năm|nam|5)(?=$|[\s:,.-])"),
    (4, "Thứ Sáu", [r"^thứ\s*(?:sáu|sau|6)(?=$|[\s:,.-])", r"^t6(?=$|[\s:,.-])", r"^friday\b"], r"thứ\s*(?:sáu|sau|6)(?=$|[\s:,.-])"),
    (5, "Thứ Bảy", [r"^thứ\s*(?:bảy|bay|7)(?=$|[\s:,.-])", r"^t7(?=$|[\s:,.-])", r"^saturday\b"], r"thứ\s*(?:bảy|bay|7)(?=$|[\s:,.-])"),
    (6, "Chủ Nhật", [r"^chủ\s*nhật(?=$|[\s:,.-])", r"^cn(?=$|[\s:,.-])", r"^sunday\b"], r"(?:chủ\s*nhật|\bcn)(?=$|[\s:,.-])"),
]


def _normalize_city_code(city: str | None) -> str:
    folded = strip_vietnamese_accents((city or "").strip().lower())
    if "hue" in folded:
        return "HUE"
    if "hoi an" in folded:
        return "HOI_AN"
    return "DANANG"


def _is_food_category(category: str | None) -> bool:
    low = (category or "").lower()
    return any(k in low for k in ("ẩm thực", "quán ăn", "quan-an", "cafe", "cà phê", "chay"))


def _is_stay_category(category: str | None) -> bool:
    low = (category or "").lower()
    return any(
        k in low
        for k in (
            "lưu trú",
            "luu-tru",
            "luu tru",
            "nghỉ dưỡng",
            "accommodation",
            "stay",
            "homestay",
            "resort",
            "hotel",
        )
    )


def _format_vnd(amount: float) -> str:
    return f"{int(round(max(0.0, amount))):,} ₫".replace(",", ".")


def parse_vnd_amount(raw: Any) -> float:
    """Parse numeric or Vietnamese currency string ('150.000 đ', '110.000 – 180.000 ₫') to VND float."""
    if raw is None or isinstance(raw, bool):
        return 0.0
    if isinstance(raw, (int, float)):
        val = float(raw)
        return max(0.0, val) if val == val else 0.0

    text = str(raw).strip().lower()
    if not text or any(k in text for k in ("miễn phí", "free", "0 đ", "0đ", "theo vé niêm yết")):
        return 0.0

    multiplier = 1.0
    if "triệu" in text:
        multiplier = 1_000_000.0
    elif re.search(r"\d\s*k\b", text):
        multiplier = 1_000.0

    grouped = re.findall(r"\d{1,3}(?:[.,]\d{3})+", text)
    if grouped:
        nums = [float(g.replace(".", "").replace(",", "")) for g in grouped]
        return sum(nums) / len(nums)

    plain = re.findall(r"\d+(?:[.,]\d+)?", text)
    if not plain:
        return 0.0
    nums = [float(p.replace(",", ".")) * multiplier for p in plain[:2]]
    return sum(nums) / len(nums)


@lru_cache(maxsize=1)
def _load_poi_reference_index() -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], list[dict[str, Any]]]:
    """Load processed POI coordinates, costs, and opening_hours once per process."""
    by_id: dict[str, dict[str, Any]] = {}
    by_name: dict[str, dict[str, Any]] = {}
    all_records: list[dict[str, Any]] = []

    hours_by_id: dict[str, dict[str, Any]] = {}
    hours_by_name: dict[str, dict[str, Any]] = {}
    if _CONTACTS_CACHE_PATH.exists():
        try:
            raw_contacts = json.loads(_CONTACTS_CACHE_PATH.read_text(encoding="utf-8"))
            if isinstance(raw_contacts, list):
                for item in raw_contacts:
                    if not isinstance(item, dict):
                        continue
                    oh = item.get("opening_hours")
                    if not isinstance(oh, dict):
                        continue
                    pid = str(item.get("poi_id") or "").strip()
                    pname = normalize_vietnamese_query(str(item.get("name") or ""))
                    if pid:
                        hours_by_id[pid] = oh
                    if pname:
                        hours_by_name[pname] = oh
        except Exception as exc:
            logger.warning("Failed to load poi_contacts_cache.json: %s", exc)

    if _POIS_CSV_PATH.exists():
        try:
            with open(_POIS_CSV_PATH, mode="r", encoding="utf-8") as f:
                for row in csv.DictReader(f):
                    pid = (row.get("\ufeffpoi_id") or row.get("poi_id") or "").strip()
                    name = (row.get("name") or "").strip()
                    if not pid or not name:
                        continue
                    try:
                        lat = float(row.get("latitude") or 0) or None
                        lng = float(row.get("longitude") or 0) or None
                    except (TypeError, ValueError):
                        lat, lng = None, None
                    try:
                        cost = float(row.get("estimated_cost") or 0)
                    except (TypeError, ValueError):
                        cost = 0.0
                    try:
                        raw_gs = float(row.get("green_score") or 0.85)
                        gs = int(round(raw_gs * 100)) if raw_gs <= 1.0 else int(round(raw_gs))
                    except (TypeError, ValueError):
                        gs = 85

                    norm_name = normalize_vietnamese_query(name)
                    rec = {
                        "poi_id": pid,
                        "name": name,
                        "city": "Huế" if "hue" in (row.get("city") or "").lower() else "Đà Nẵng",
                        "city_code": _normalize_city_code(row.get("city")),
                        "category": row.get("category") or "",
                        "sub_category": row.get("sub_category") or "",
                        "address": row.get("address") or "",
                        "image_url": row.get("image_url") or "",
                        "lat": lat,
                        "lng": lng,
                        "estimated_cost": cost,
                        "green_score": gs,
                        "opening_hours": hours_by_id.get(pid) or hours_by_name.get(norm_name),
                    }
                    by_id[pid] = rec
                    by_name[norm_name] = rec
                    all_records.append(rec)
        except Exception as exc:
            logger.warning("Failed to load all_pois_cleaned.csv: %s", exc)

    # Include any contacts entries not present in CSV
    for pname, oh in hours_by_name.items():
        if pname not in by_name:
            by_name[pname] = {"name": pname, "opening_hours": oh}

    return by_id, by_name, all_records


def _lookup_poi_reference(
    poi_id: str | None = None,
    name: str | None = None,
) -> dict[str, Any] | None:
    by_id, by_name, _ = _load_poi_reference_index()
    if poi_id and str(poi_id) in by_id:
        return by_id[str(poi_id)]
    if name:
        norm = normalize_vietnamese_query(name)
        if norm in by_name:
            return by_name[norm]
        folded = strip_vietnamese_accents(norm)
        for ref_name, rec in by_name.items():
            if len(norm) >= 6 and (norm in ref_name or ref_name in norm):
                return rec
            ref_folded = strip_vietnamese_accents(ref_name)
            if len(folded) >= 6 and (folded in ref_folded or ref_folded in folded):
                return rec
    return None


def _minutes_from_hhmm(hhmm: str | None) -> int | None:
    if not hhmm:
        return None
    m = re.match(r"^(\d{1,2})[:h](\d{2})$", hhmm.strip())
    if not m:
        return None
    hh, mm = int(m.group(1)), int(m.group(2))
    if hh > 23 or mm >= 60:
        return None
    return hh * 60 + mm


def _hhmm_from_minutes(total_mins: int) -> str:
    clamped = max(0, int(round(total_mins))) % 1440
    return f"{clamped // 60:02d}:{clamped % 60:02d}"


def _extract_time_window_from_stop(stop: dict[str, Any], fallback_slot: str | None = None) -> tuple[int, int] | None:
    start_s = _minutes_from_hhmm(stop.get("start_time"))
    end_s = _minutes_from_hhmm(stop.get("end_time"))
    if start_s is not None:
        dur = int(stop.get("duration_minutes") or stop.get("duration_mins") or 90)
        end_val = end_s if end_s is not None else start_s + dur
        if end_val <= start_s:
            end_val += 1440
        return start_s, end_val

    ts = str(stop.get("timeSlot") or "")
    m = re.search(r"(\d{1,2}[:h]\d{2})\s*[–—-]\s*(\d{1,2}[:h]\d{2})", ts)
    if m:
        s = _minutes_from_hhmm(m.group(1))
        e = _minutes_from_hhmm(m.group(2))
        if s is not None and e is not None:
            if e <= s:
                e += 1440
            return s, e

    if fallback_slot and fallback_slot in SLOT_DEFAULT_WINDOWS:
        s_str, e_str = SLOT_DEFAULT_WINDOWS[fallback_slot]
        s = _minutes_from_hhmm(s_str)
        e = _minutes_from_hhmm(e_str)
        if s is not None and e is not None:
            return s, e
    return None


def _resolve_day_date_str(day_obj: dict[str, Any], day_number: int, start_date_str: str | None) -> str | None:
    raw_date = day_obj.get("date")
    if isinstance(raw_date, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", raw_date.strip()):
        return raw_date.strip()
    if start_date_str and re.match(r"^\d{4}-\d{2}-\d{2}$", start_date_str.strip()):
        try:
            dt = datetime.strptime(start_date_str.strip(), "%Y-%m-%d").date()
            return (dt + timedelta(days=max(0, day_number - 1))).isoformat()
        except ValueError:
            return None
    return None


def _parse_time_windows_from_text(text: str) -> list[tuple[int, int]]:
    windows: list[tuple[int, int]] = []
    for m in re.finditer(r"(\d{1,2})[:h](\d{2})\s*[–—-]\s*(\d{1,2})[:h](\d{2})", text):
        sh, sm, eh, em = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
        if sh > 24 or sm >= 60 or eh > 24 or em >= 60:
            continue
        start = sh * 60 + sm
        end = eh * 60 + em
        if end <= start:
            end += 1440
        windows.append((start, end))
    return windows


def _extract_allowed_weekdays_from_status(text: str) -> set[int] | None:
    if not re.search(r"(?:thứ|chủ\s*nhật)", text, flags=re.IGNORECASE):
        return None
    days: set[int] = set()
    for py_day, _, _, inline_pat in _WEEKDAY_META:
        if re.search(inline_pat, text, flags=re.IGNORECASE):
            days.add(py_day)
    list_match = re.search(r"thứ\s*([2-7](?:\s*,\s*[2-7])+)", text, flags=re.IGNORECASE)
    if list_match:
        for tok in list_match.group(1).split(","):
            n = int(tok.strip())
            if 2 <= n <= 7:
                days.add(n - 2)
    return days or None


def check_opening_hours(
    opening_hours: dict[str, Any] | None,
    visit_window: tuple[int, int] | None,
    day_date_str: str | None = None,
) -> dict[str, str | None]:
    """
    Validate a visit window + calendar date against POI opening_hours JSON.
    Returns: {"status": "ok"|"closed"|"outside_hours"|"unknown", "warning": str|None, "open_range_label": str|None}
    """
    if not isinstance(opening_hours, dict) or not opening_hours:
        return {"status": "unknown", "warning": None, "open_range_label": None}

    if opening_hours.get("is_temporarily_closed"):
        return {
            "status": "closed",
            "warning": "Địa điểm hiện đang tạm đóng cửa theo dữ liệu cập nhật.",
            "open_range_label": "Tạm đóng cửa",
        }

    py_weekday: int | None = None
    if day_date_str and re.match(r"^\d{4}-\d{2}-\d{2}$", day_date_str):
        try:
            py_weekday = date.fromisoformat(day_date_str).weekday()
        except ValueError:
            py_weekday = None

    weekday_lines = [str(l).strip() for l in (opening_hours.get("weekday_text") or []) if str(l).strip()]
    target_rule_text = ""
    target_day_label = ""

    if weekday_lines and py_weekday is not None:
        day_meta = next((w for w in _WEEKDAY_META if w[0] == py_weekday), None)
        if day_meta:
            _, label, prefix_pats, _ = day_meta
            for line in weekday_lines:
                if any(re.search(pat, line, flags=re.IGNORECASE) for pat in prefix_pats):
                    target_rule_text = re.sub(r"^[^:]+:\s*", "", line).strip()
                    target_day_label = label
                    break

    status_text = str(opening_hours.get("status_text") or "").strip()
    has_schedule_in_status = bool(
        re.search(r"\d{1,2}[:h]\d{2}", status_text)
        or re.search(r"đóng cửa|cả ngày|24/24|24/7", status_text, flags=re.IGNORECASE)
    )
    if not target_rule_text:
        if has_schedule_in_status:
            target_rule_text = status_text
        elif weekday_lines:
            target_rule_text = re.sub(r"^[^:]+:\s*", "", weekday_lines[0]).strip()

    if not target_rule_text:
        return {"status": "unknown", "warning": None, "open_range_label": None}

    if re.search(r"cả ngày|24/24|24/7|24\s*giờ|lễ tân 24", target_rule_text, flags=re.IGNORECASE) and not re.search(
        r"đóng cửa", target_rule_text, flags=re.IGNORECASE
    ):
        return {"status": "ok", "warning": None, "open_range_label": "Mở cửa cả ngày"}

    windows = _parse_time_windows_from_text(target_rule_text)
    if re.search(r"đóng\s*cửa", target_rule_text, flags=re.IGNORECASE) and not windows:
        day_info = f" vào {target_day_label}" if target_day_label else ""
        return {
            "status": "closed",
            "warning": f"Địa điểm đóng cửa{day_info}. Nên chuyển sang ngày hoặc điểm khác.",
            "open_range_label": f"Đóng cửa{day_info}",
        }

    allowed_weekdays = _extract_allowed_weekdays_from_status(target_rule_text)
    if allowed_weekdays and py_weekday is not None and py_weekday not in allowed_weekdays:
        day_label = next((w[1] for w in _WEEKDAY_META if w[0] == py_weekday), "ngày đã chọn")
        return {
            "status": "closed",
            "warning": f"Hoạt động này không mở vào {day_label} ({target_rule_text}).",
            "open_range_label": target_rule_text,
        }

    if not windows:
        return {"status": "unknown", "warning": None, "open_range_label": target_rule_text}

    open_range_label = ", ".join(
        f"{_hhmm_from_minutes(s)}–{_hhmm_from_minutes(0 if e == 1440 else e)}" for s, e in windows
    )
    if visit_window is None:
        return {"status": "ok", "warning": None, "open_range_label": open_range_label}

    v_start, v_end = visit_window
    fits = any(
        (v_start >= ws and v_end <= we)
        or (we > 1440 and v_start + 1440 >= ws and v_end + 1440 <= we)
        for ws, we in windows
    )
    if not fits:
        return {
            "status": "outside_hours",
            "warning": (
                f"Khung {_hhmm_from_minutes(v_start)}–{_hhmm_from_minutes(v_end)} "
                f"nằm ngoài giờ mở cửa ({open_range_label})."
            ),
            "open_range_label": open_range_label,
        }
    return {"status": "ok", "warning": None, "open_range_label": open_range_label}


def _fetch_db_opening_hours(connection: Connection | None, poi_id: str | None, name: str | None) -> dict[str, Any] | None:
    if connection is None or (not poi_id and not name):
        return None
    try:
        with connection.cursor() as cur:
            if poi_id:
                cur.execute("SELECT opening_hours FROM public.pois WHERE poi_id::text = %s LIMIT 1;", (str(poi_id),))
            else:
                cur.execute("SELECT opening_hours FROM public.pois WHERE name ILIKE %s LIMIT 1;", (f"%{name}%",))
            row = cur.fetchone()
            if row and row[0]:
                raw = row[0]
                if isinstance(raw, str):
                    parsed = json.loads(raw)
                    return parsed if isinstance(parsed, dict) else None
                if isinstance(raw, dict):
                    return raw
    except Exception:
        return None
    return None


def _resolve_stop_coords(
    stop: dict[str, Any],
    fallback_city: str,
    idx: int,
    coords_resolver: Callable[[str, str, float | None, float | None, int], tuple[float, float]] | None = None,
) -> tuple[float, float] | None:
    lat = stop.get("latitude")
    lng = stop.get("longitude")
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and (lat != 0 or lng != 0):
        return float(lat), float(lng)

    ref = _lookup_poi_reference(stop.get("poi_id"), stop.get("title") or stop.get("name"))
    if ref and ref.get("lat") and ref.get("lng"):
        return float(ref["lat"]), float(ref["lng"])

    if coords_resolver is not None:
        return coords_resolver(
            str(stop.get("title") or stop.get("name") or ""),
            str(stop.get("city") or fallback_city),
            None,
            None,
            idx,
        )
    return None


def _path_distance_km(coords: list[tuple[float, float] | None]) -> float:
    valid = [c for c in coords if c is not None]
    total_m = 0.0
    for i in range(1, len(valid)):
        seg_m = haversine_distance_meters(valid[i - 1][0], valid[i - 1][1], valid[i][0], valid[i][1])
        total_m += seg_m * FALLBACK_DETOUR_FACTOR
    return round(total_m / 1000.0, 2)


def _nearest_neighbor_and_2opt(items: list[tuple[dict[str, Any], tuple[float, float]]]) -> list[dict[str, Any]]:
    """Order stops using Nearest-Neighbor from start followed by 2-opt swap improvement."""
    n = len(items)
    if n <= 2:
        return [it[0] for it in items]

    def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
        return haversine_distance_meters(a[0], a[1], b[0], b[1])

    remaining = list(range(1, n))
    order = [0]
    while remaining:
        last = order[-1]
        best_idx = min(remaining, key=lambda cand: dist_m(items[last][1], items[cand][1]))
        order.append(best_idx)
        remaining.remove(best_idx)

    improved = True
    passes = 0
    while improved and passes < 32:
        improved = False
        passes += 1
        for i in range(1, len(order) - 1):
            for j in range(i + 1, len(order)):
                a, b = order[i - 1], order[i]
                c = order[j]
                d = order[j + 1] if j + 1 < len(order) else None
                before = dist_m(items[a][1], items[b][1]) + (dist_m(items[c][1], items[d][1]) if d is not None else 0.0)
                after = dist_m(items[a][1], items[c][1]) + (dist_m(items[b][1], items[d][1]) if d is not None else 0.0)
                if after + 5.0 < before:
                    order[i : j + 1] = reversed(order[i : j + 1])
                    improved = True

    return [items[idx][0] for idx in order]


def _sync_stop_times_after_reorder(
    reordered_places: list[dict[str, Any]],
    rest_stops: list[dict[str, Any]],
    original_places: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    orig_windows = [_extract_time_window_from_stop(s) for s in original_places]
    valid_starts = [w[0] for w in orig_windows if w is not None]
    if valid_starts:
        cursor = min(valid_starts)
        rest_windows = sorted(
            [w for w in (_extract_time_window_from_stop(r) for r in rest_stops) if w is not None],
            key=lambda w: w[0],
        )
        for idx, stop in enumerate(reordered_places):
            w = _extract_time_window_from_stop(stop)
            if w is None and "timeSlot" not in stop and "start_time" not in stop:
                continue
            dur = int(stop.get("duration_minutes") or stop.get("duration_mins") or (w[1] - w[0] if w else 90))
            dur = max(30, min(dur, 480))
            for rs, re_m in rest_windows:
                if cursor < re_m and cursor + dur > rs:
                    cursor = re_m + 10
            if cursor >= 22 * 60 or cursor + 15 > 23 * 60:
                if "start_time" in stop or "end_time" in stop:
                    stop["start_time"] = None
                    stop["end_time"] = None
                stop.pop("timeSlot", None)
                continue
            c_start = cursor
            c_end = min(c_start + dur, 23 * 60)
            cursor = c_end + 15
            s_str = _hhmm_from_minutes(c_start)
            e_str = _hhmm_from_minutes(max(c_start + 15, c_end))
            if "start_time" in stop or "end_time" in stop:
                stop["start_time"] = s_str
                stop["end_time"] = e_str
            if "timeSlot" in stop or ("start_time" not in stop and idx < len(orig_windows)):
                stop["timeSlot"] = f"{s_str} - {e_str}"

    merged = list(reordered_places)
    for rest in rest_stops:
        rw = _extract_time_window_from_stop(rest)
        if rw is None:
            merged.append(rest)
            continue
        ins_idx = len(merged)
        for idx, st in enumerate(merged):
            sw = _extract_time_window_from_stop(st)
            if sw is not None and sw[0] >= rw[0]:
                ins_idx = idx
                break
        merged.insert(ins_idx, rest)

    for seq_idx, stop in enumerate(merged):
        stop["sequence"] = seq_idx
    return merged


def optimize_outline_routes_and_co2(
    outline: list[dict[str, Any]],
    trip_context: TripContextPayload,
    coords_resolver: Callable[[str, str, float | None, float | None, int], tuple[float, float]] | None = None,
) -> dict[str, Any]:
    """Apply Nearest-Neighbor + 2-opt anti-zig-zag ordering per day and compute CO2 footprint."""
    mode = trip_context.transport_mode or "motorcycle"
    factor = TRANSPORT_EMISSION_FACTORS_G_PER_KM.get(mode, TRANSPORT_EMISSION_FACTORS_G_PER_KM["motorcycle"])

    total_before_km = 0.0
    total_after_km = 0.0
    reordered_days: list[int] = []

    for day_idx, day_obj in enumerate(outline):
        stops = list(day_obj.get("stops") or [])
        fallback_city = str(day_obj.get("focus_city") or trip_context.destination or "Đà Nẵng")
        day_num = int(day_obj.get("day_number") or day_obj.get("day") or (day_idx + 1))

        rest_stops = [s for s in stops if s.get("stop_type") == "rest"]
        places = [s for s in stops if s.get("stop_type") != "rest"]

        coord_pairs: list[tuple[dict[str, Any], tuple[float, float]]] = []
        raw_coords: list[tuple[float, float] | None] = []
        for s_idx, s in enumerate(places):
            c = _resolve_stop_coords(s, fallback_city, s_idx, coords_resolver)
            raw_coords.append(c)
            if c is not None:
                s["latitude"] = round(c[0], 6)
                s["longitude"] = round(c[1], 6)
                coord_pairs.append((s, c))

        before_km = _path_distance_km(raw_coords)
        after_km = before_km

        if len(coord_pairs) >= 3:
            opt_with_coords = _nearest_neighbor_and_2opt(coord_pairs)
            opt_coords = [_resolve_stop_coords(s, fallback_city, i, coords_resolver) for i, s in enumerate(opt_with_coords)]
            candidate_after_km = _path_distance_km(opt_coords)
            if before_km - candidate_after_km >= 0.05:
                no_coord_places = [s for s in places if _resolve_stop_coords(s, fallback_city, 0, coords_resolver) is None]
                reordered_places = opt_with_coords + no_coord_places
                day_obj["stops"] = _sync_stop_times_after_reorder(reordered_places, rest_stops, places)
                after_km = candidate_after_km
                reordered_days.append(day_num)

        total_before_km += before_km
        total_after_km += after_km

    total_before_km = round(total_before_km, 2)
    total_after_km = round(total_after_km, 2)
    saved_km = round(max(0.0, total_before_km - total_after_km), 2)

    co2_grams = round(total_after_km * factor)
    baseline_car_grams = round(total_after_km * TRANSPORT_EMISSION_FACTORS_G_PER_KM["driving"])
    saved_vs_car_grams = max(0, baseline_car_grams - co2_grams)
    saved_route_grams = round(saved_km * factor)
    saved_vs_car_percent = round((saved_vs_car_grams / baseline_car_grams) * 100) if baseline_car_grams > 0 else 0

    return {
        "transport_mode": mode,
        "transport_label": TRANSPORT_LABELS_VI.get(mode, "Xe máy"),
        "before_km": total_before_km,
        "after_km": total_after_km,
        "saved_km": saved_km,
        "reordered_days": reordered_days,
        "co2_grams": co2_grams,
        "baseline_car_grams": baseline_car_grams,
        "saved_vs_car_grams": saved_vs_car_grams,
        "saved_vs_car_percent": saved_vs_car_percent,
        "saved_route_grams": saved_route_grams,
    }


def resolve_max_budget(trip_context: TripContextPayload) -> float | None:
    if trip_context.total_budget is not None and trip_context.total_budget > 0:
        return float(trip_context.total_budget)
    if trip_context.budget_tier is not None:
        tier_val = trip_context.budget_tier.value if hasattr(trip_context.budget_tier, "value") else str(trip_context.budget_tier)
        daily = TIER_DAILY_BUDGET_VND.get(tier_val)
        if daily:
            return daily * max(1, trip_context.days_count) * max(1, trip_context.num_people)
    return None


def _get_stop_unit_cost(stop: dict[str, Any]) -> float:
    for key in ("estimated_cost", "estimatedCost"):
        if stop.get(key) is not None:
            parsed = parse_vnd_amount(stop.get(key))
            if parsed > 0 or str(stop.get(key)).strip().lower() in {"0", "miễn phí", "free"}:
                return parsed
    ref = _lookup_poi_reference(stop.get("poi_id"), stop.get("title") or stop.get("name"))
    if ref and ref.get("estimated_cost"):
        return float(ref["estimated_cost"])
    return 0.0


def _find_cheaper_poi_candidate(
    stop: dict[str, Any],
    city_display: str,
    max_unit_cost: float,
    existing_names: set[str],
    constraints: list[str],
    connection: Connection | None,
) -> dict[str, Any] | None:
    target_city_code = _normalize_city_code(city_display)
    want_food = _is_food_category(str(stop.get("category") or ""))
    want_veg = "vegetarian" in constraints
    stop_addr = str(stop.get("address") or "").lower()
    is_remote_stop = any(k in f"{stop.get('title', '')} {stop.get('name', '')} {stop_addr}".lower() for k in ("bà nà", "ba na", "hòa vang", "hòa ninh"))
    remote_sql = "" if is_remote_stop else "AND p.address NOT ILIKE '%%Bà Nà%%' AND p.address NOT ILIKE '%%Hòa Ninh%%' AND p.address NOT ILIKE '%%Hòa Vang%%'"

    # 1. Try DB query when connection is available
    if connection is not None:
        try:
            city_pat = "%Hue%" if target_city_code == "HUE" else "%Da Nang%"
            cat_pat = "%ẩm thực%" if want_food else "%di tích%"
            veg_clause = (
                "AND (p.cuisine = 'plant_based_vegan' OR p.sub_category IN ('vegetarian', 'green_vegetarian') OR p.name ILIKE '%%chay%%' OR p.name ILIKE '%%vegan%%' OR p.name ILIKE '%%vegetarian%%')"
                if want_food and want_veg
                else ""
            )
            with connection.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT p.poi_id::text, p.name, c.name, p.sub_category, p.estimated_cost, p.green_score, p.address, p.image_url
                    FROM public.pois p
                    JOIN public.poi_categories c ON p.category_id = c.category_id
                    JOIN public.cities ci ON p.city_id = ci.city_id
                    WHERE p.is_active IS NOT FALSE
                      AND ci.name ILIKE %s
                      AND c.name NOT ILIKE '%%lưu trú%%'
                      AND c.name NOT ILIKE '%%nghỉ dưỡng%%'
                      AND (c.name ILIKE %s OR %s = FALSE)
                      AND p.estimated_cost IS NOT NULL
                      AND p.estimated_cost < %s
                      {remote_sql}
                      {veg_clause}
                    ORDER BY p.estimated_cost ASC, p.green_score DESC NULLS LAST
                    LIMIT 8;
                    """,
                    (city_pat, cat_pat, want_food, max_unit_cost),
                )
                for r in cur.fetchall():
                    cand_name = str(r[1] or "")
                    if cand_name.lower() in existing_names:
                        continue
                    if "elderly_friendly" in constraints and "khải định" in cand_name.lower():
                        continue
                    ref = _lookup_poi_reference(r[0], cand_name)
                    return {
                        "poi_id": r[0],
                        "name": cand_name,
                        "category": r[2],
                        "sub_category": r[3],
                        "estimated_cost": float(r[4] or 0),
                        "green_score": int(round(float(r[5]) * 100)) if r[5] and float(r[5]) <= 1.0 else int(round(float(r[5] or 85))),
                        "address": r[6] or "",
                        "image_url": r[7] or "",
                        "lat": ref.get("lat") if ref else None,
                        "lng": ref.get("lng") if ref else None,
                    }
        except Exception:
            pass

    # 2. Fallback to processed POI index
    _, _, all_recs = _load_poi_reference_index()
    candidates = []
    for rec in all_recs:
        if rec.get("city_code") != target_city_code:
            continue
        if rec["name"].lower() in existing_names:
            continue
        if _is_stay_category(rec.get("category")):
            continue
        if _is_food_category(rec.get("category")) != want_food:
            continue
        if want_food and want_veg and not (
            any(tok in rec["name"].lower() for tok in ("chay", "vegan", "vegetarian", "thực dưỡng"))
            or rec.get("sub_category") in ("vegetarian", "green_vegetarian")
        ):
            continue
        if not is_remote_stop and any(k in f"{rec.get('name', '')} {rec.get('address', '')}".lower() for k in ("bà nà", "hòa ninh", "hòa vang")):
            continue
        if "elderly_friendly" in constraints and "khải định" in rec["name"].lower():
            continue
        cost = float(rec.get("estimated_cost") or 0)
        if cost < max_unit_cost:
            candidates.append(rec)

    if not candidates:
        return None
    candidates.sort(key=lambda r: (float(r.get("estimated_cost") or 0), -int(r.get("green_score") or 85)))
    return candidates[0]


def enforce_budget_constraint(
    outline: list[dict[str, Any]],
    trip_context: TripContextPayload,
    connection: Connection | None = None,
    constraints: list[str] | None = None,
    protected_keywords: list[str] | None = None,
) -> dict[str, Any]:
    """
    Evaluate C_total <= B_max across all stops (* num_people).
    If C_total > B_max, greedily swap highest-cost non-protected stops for cheaper local POIs.
    """
    num_people = max(1, trip_context.num_people or 1)
    max_budget = resolve_max_budget(trip_context)
    protected = [k.lower() for k in (protected_keywords or []) if k]

    def calc_total() -> float:
        total = 0.0
        for d in outline:
            for st in d.get("stops") or []:
                if st.get("stop_type") == "rest":
                    continue
                unit = _get_stop_unit_cost(st)
                st["estimated_cost"] = unit
                total += unit * num_people
        return round(total, 2)

    total_cost = calc_total()
    adjusted_notes: list[str] = []

    if max_budget is not None and total_cost > max_budget:
        existing_names = {
            str(st.get("title") or st.get("name") or "").lower()
            for d in outline
            for st in (d.get("stops") or [])
        }
        # Rank replaceable stops by descending unit cost
        slots: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
        for d in outline:
            for st in d.get("stops") or []:
                if st.get("stop_type") == "rest":
                    continue
                title = str(st.get("title") or st.get("name") or "")
                low_title = title.lower()
                if "tàu hỏa" in low_title or "train" in str(st.get("poi_id") or "").lower():
                    continue
                if any(pk in low_title for pk in protected):
                    continue
                unit = _get_stop_unit_cost(st)
                if unit > 0:
                    slots.append((unit, d, st))

        slots.sort(key=lambda item: item[0], reverse=True)
        for unit, day_obj, st in slots:
            if total_cost <= max_budget:
                break
            city_disp = str(st.get("city") or day_obj.get("focus_city") or trip_context.destination or "Đà Nẵng")
            cand = _find_cheaper_poi_candidate(
                stop=st,
                city_display=city_disp,
                max_unit_cost=unit,
                existing_names=existing_names,
                constraints=constraints or [],
                connection=connection,
            )
            if not cand:
                continue
            old_name = str(st.get("title") or st.get("name") or "Điểm dừng")
            new_cost = float(cand.get("estimated_cost") or 0)
            if new_cost >= unit:
                continue
            existing_names.add(cand["name"].lower())
            st["poi_id"] = cand["poi_id"]
            st["title"] = cand["name"]
            st["name"] = cand["name"]
            st["category"] = cand.get("category") or st.get("category")
            st["address"] = cand.get("address") or st.get("address")
            st["estimated_cost"] = new_cost
            st["estimatedCost"] = _format_vnd(new_cost) if new_cost > 0 else "Miễn phí"
            st["green_score"] = cand.get("green_score") or st.get("green_score") or 85
            if cand.get("lat") and cand.get("lng"):
                st["latitude"] = cand["lat"]
                st["longitude"] = cand["lng"]
            st["note"] = f"Tối ưu ngân sách thay cho {old_name} ({_format_vnd(unit)} → {_format_vnd(new_cost)}/người)"
            adjusted_notes.append(
                f"Đổi **{old_name}** ({_format_vnd(unit)}/người) → **{cand['name']}** ({_format_vnd(new_cost)}/người)"
            )
            total_cost = calc_total()

    within_budget = True if max_budget is None else total_cost <= max_budget
    over_amount = 0.0 if (max_budget is None or within_budget) else round(total_cost - max_budget, 2)

    return {
        "max_budget": max_budget,
        "total_estimated_cost": total_cost,
        "within_budget": within_budget,
        "over_budget_amount": over_amount,
        "num_people": num_people,
        "adjusted_stops": adjusted_notes,
    }


_INDOOR_SUB_SET = {s.lower() for s in INDOOR_SUB_CATEGORIES}
_OUTDOOR_SUB_SET = {s.lower() for s in OUTDOOR_EXCLUSIONS}
_OUTDOOR_TITLE_KEYWORDS = (
    "bãi biển",
    "bán đảo",
    "ngũ hành sơn",
    "công viên",
    "cầu rồng",
    "cầu vàng",
    "bà nà",
    "đồi ",
    "thác ",
    "suối ",
    "vịnh ",
    "đèo ",
    "biển ",
)


def _stop_duration_minutes(stop: dict[str, Any]) -> int:
    for key in ("duration_minutes", "duration_mins"):
        raw = stop.get(key)
        if isinstance(raw, (int, float)) and not isinstance(raw, bool) and raw > 0:
            return int(round(float(raw)))
    win = _extract_time_window_from_stop(stop)
    if win is not None and win[1] > win[0]:
        return int(win[1] - win[0])
    return 90


def _is_stop_outdoor(stop: dict[str, Any]) -> bool:
    if stop.get("stop_type") == "rest":
        return False
    io_flag = str(stop.get("indoor_outdoor") or "").strip().lower()
    if io_flag == "indoor":
        return False
    if io_flag == "outdoor":
        return True

    meta = stop.get("ai_metadata")
    if isinstance(meta, dict) and isinstance(meta.get("rainy_day_friendly"), bool):
        return not meta["rainy_day_friendly"]

    ref = _lookup_poi_reference(stop.get("poi_id"), stop.get("title") or stop.get("name"))
    sub = str(stop.get("sub_category") or (ref or {}).get("sub_category") or "").strip().lower()
    if sub in _OUTDOOR_SUB_SET:
        return True
    if sub in _INDOOR_SUB_SET:
        return False

    cat = str(stop.get("category") or (ref or {}).get("category") or "").strip().lower()
    if any(k in cat for k in ("thiên nhiên", "cảnh quan", "canh-quan", "nature")):
        return True

    title = str(stop.get("title") or stop.get("name") or "").strip().lower()
    return any(kw in title for kw in _OUTDOOR_TITLE_KEYWORDS)


def compute_fatigue_score(stops: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Compute daily fatigue metric F(d) = duration_hours + 0.5 * outdoor_count.
    Excludes rest blocks (`stop_type == "rest"`).
    """
    active_stops = [s for s in (stops or []) if s.get("stop_type") != "rest"]
    active_count = len(active_stops)
    total_mins = sum(_stop_duration_minutes(s) for s in active_stops)
    duration_hours = round(total_mins / 60.0, 2)
    outdoor_count = sum(1 for s in active_stops if _is_stop_outdoor(s))
    fatigue_score = round(duration_hours + 0.5 * outdoor_count, 2)
    needs_rest = active_count >= 4 or fatigue_score >= 6.0
    return {
        "active_count": active_count,
        "duration_hours": duration_hours,
        "outdoor_count": outdoor_count,
        "fatigue_score": fatigue_score,
        "needs_rest": needs_rest,
    }


def _find_non_overlapping_rest_window(stops: list[dict[str, Any]], duration_mins: int = 90) -> tuple[int, int]:
    timed_windows = [w for w in (_extract_time_window_from_stop(s) for s in stops) if w is not None]
    candidates = [
        12 * 60,
        11 * 60 + 30,
        12 * 60 + 30,
        13 * 60,
        11 * 60,
        13 * 60 + 30,
        14 * 60,
        10 * 60 + 30,
        14 * 60 + 30,
        10 * 60,
        15 * 60,
    ]
    for start_m in candidates:
        end_m = start_m + duration_mins
        if not any(ws < end_m and start_m < we for ws, we in timed_windows):
            return start_m, end_m
    if timed_windows:
        timed_windows.sort(key=lambda w: w[0])
        mid_end = timed_windows[len(timed_windows) // 2 - 1][1] if len(timed_windows) >= 2 else timed_windows[0][1]
        return mid_end, mid_end + duration_mins
    return 12 * 60, 13 * 60 + 30


def enforce_fatigue_rest_blocks(outline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Mutate `outline` in-place to insert a 90-minute `stop_type == "rest"` block
    for days where `needs_rest` is True and no rest block exists yet.
    """
    results: list[dict[str, Any]] = []
    for day_idx, day_obj in enumerate(outline or []):
        stops = list(day_obj.get("stops") or [])
        day_num = int(day_obj.get("day_number") or day_obj.get("day") or (day_idx + 1))
        has_rest = any(s.get("stop_type") == "rest" for s in stops)
        metrics = compute_fatigue_score(stops)
        rest_inserted = False

        if metrics["needs_rest"] and not has_rest:
            r_start, r_end = _find_non_overlapping_rest_window(stops, 90)
            r_start_str = _hhmm_from_minutes(r_start)
            r_end_str = _hhmm_from_minutes(r_end)
            rest_stop: dict[str, Any] = {
                "stop_id": f"rest-day-{day_num}",
                "id": f"rest-day-{day_num}",
                "poi_id": None,
                "title": "Nghỉ trưa & phục hồi",
                "name": "Nghỉ trưa & phục hồi",
                "category": "Ẩm thực và quán ăn",
                "stop_type": "rest",
                "source": "assistant",
                "duration_minutes": 90,
                "start_time": r_start_str,
                "end_time": r_end_str,
                "timeSlot": f"{r_start_str} - {r_end_str}",
                "note": "Khoảng nghỉ 90 phút tránh quá tải lịch trình.",
            }
            ins_idx = len(stops) // 2
            timed_positions = [
                (idx, _extract_time_window_from_stop(st))
                for idx, st in enumerate(stops)
            ]
            if any(w is not None for _, w in timed_positions):
                ins_idx = len(stops)
                for idx, w in timed_positions:
                    if w is not None and w[0] >= r_start:
                        ins_idx = idx
                        break
            stops.insert(ins_idx, rest_stop)
            if any("sequence" in st for st in stops):
                for seq_idx, st in enumerate(stops):
                    st["sequence"] = seq_idx
            day_obj["stops"] = stops
            rest_inserted = True

        results.append(
            {
                "day": day_num,
                **metrics,
                "rest_inserted": rest_inserted,
            }
        )
    return results


def apply_quantitative_constraints_to_response(
    response: CopilotChatResponse,
    trip_context: TripContextPayload,
    connection: Connection | None = None,
    constraints: list[str] | None = None,
    coords_resolver: Callable[[str, str, float | None, float | None, int], tuple[float, float]] | None = None,
    protected_keywords: list[str] | None = None,
) -> CopilotChatResponse:
    """
    Post-process Copilot response through Part-2 quantitative checks:
    - Check opening_hours on suggested_pois (and rank open POIs first).
    - If updated_itinerary_state exists: enforce C_total <= B_max, optimize route anti-zig-zag + CO2,
      and validate opening_hours on every scheduled stop.
    """
    active_constraints = constraints or list(response.detected_constraints or [])

    # 1. Opening-hours verification for suggested POI cards
    if response.suggested_pois:
        target_day_date = _resolve_day_date_str({}, trip_context.current_day or 1, trip_context.start_date)
        slot_key = response.target_slot or trip_context.current_slot or "morning"
        slot_win_strs = SLOT_DEFAULT_WINDOWS.get(slot_key)
        visit_win = (
            (_minutes_from_hhmm(slot_win_strs[0]) or 510, _minutes_from_hhmm(slot_win_strs[1]) or 660)
            if slot_win_strs
            else None
        )
        for poi in response.suggested_pois:
            oh = _fetch_db_opening_hours(connection, poi.id, poi.name)
            if not oh:
                ref = _lookup_poi_reference(poi.id, poi.name)
                oh = ref.get("opening_hours") if ref else None
            oh_res = check_opening_hours(oh, visit_win, target_day_date)
            poi.opening_hours_status = oh_res["status"]  # type: ignore[assignment]
            poi.opening_hours_warning = oh_res["warning"]
            poi.open_range_label = oh_res["open_range_label"]

        # Rank open/ok POIs before closed/outside_hours without dropping fallback results
        priority = {"ok": 0, "unknown": 1, "outside_hours": 2, "closed": 3}
        response.suggested_pois.sort(key=lambda p: priority.get(p.opening_hours_status or "unknown", 1))
        if response.recommended_poi_ids:
            response.recommended_poi_ids = [p.id for p in response.suggested_pois]

    # 2. Full quantitative solver pass on updated_itinerary_state
    outline = response.updated_itinerary_state
    if not outline:
        return response

    budget_status = enforce_budget_constraint(
        outline=outline,
        trip_context=trip_context,
        connection=connection,
        constraints=active_constraints,
        protected_keywords=protected_keywords,
    )
    route_metrics = optimize_outline_routes_and_co2(
        outline=outline,
        trip_context=trip_context,
        coords_resolver=coords_resolver,
    )
    fatigue_metrics = enforce_fatigue_rest_blocks(outline)

    # Opening-hours pass across every stop in mutated outline
    opening_warnings: list[str] = []
    for day_idx, day_obj in enumerate(outline):
        day_num = int(day_obj.get("day_number") or day_obj.get("day") or (day_idx + 1))
        day_date_str = _resolve_day_date_str(day_obj, day_num, trip_context.start_date)
        for st in day_obj.get("stops") or []:
            if st.get("stop_type") == "rest":
                continue
            stop_name = str(st.get("title") or st.get("name") or "")
            oh = _fetch_db_opening_hours(connection, st.get("poi_id"), stop_name)
            if not oh:
                ref = _lookup_poi_reference(st.get("poi_id"), stop_name)
                oh = ref.get("opening_hours") if ref else None
            oh_res = check_opening_hours(oh, _extract_time_window_from_stop(st), day_date_str)
            st["opening_hours_status"] = oh_res["status"]
            if oh_res["open_range_label"]:
                st["open_range_label"] = oh_res["open_range_label"]
            if oh_res["warning"]:
                st["opening_hours_warning"] = oh_res["warning"]
                opening_warnings.append(f"Ngày {day_num} ({stop_name}): {oh_res['warning']}")

    response.budget_status = budget_status
    response.route_metrics = route_metrics
    response.fatigue_metrics = fatigue_metrics

    # Enrich summaries with real quantitative numbers
    max_b = budget_status["max_budget"]
    tot_b = budget_status["total_estimated_cost"]
    if max_b is not None:
        if budget_status["within_budget"]:
            b_line = f"Ngân sách đạt chuẩn C_total = {_format_vnd(tot_b)} ≤ B_max = {_format_vnd(max_b)} ({budget_status['num_people']} người)."
        else:
            b_line = (
                f"⚠️ Tổng chi phí ước tính {_format_vnd(tot_b)} đang vượt ngân sách {_format_vnd(max_b)} "
                f"(vượt {_format_vnd(budget_status['over_budget_amount'])}); cân nhắc bỏ bớt điểm thu phí cao."
            )
        if budget_status["adjusted_stops"]:
            b_line += " Đã tự động tối ưu: " + "; ".join(budget_status["adjusted_stops"][:2]) + "."
        response.budget_impact_summary = (
            f"{response.budget_impact_summary} • {b_line}" if response.budget_impact_summary else b_line
        )

    co2_kg = route_metrics["co2_grams"] / 1000.0
    co2_text = f"{route_metrics['co2_grams']} g CO₂" if route_metrics["co2_grams"] < 1000 else f"{co2_kg:.2f} kg CO₂"
    route_line = (
        f"Lộ trình {route_metrics['after_km']} km ({route_metrics['transport_label']}) ≈ {co2_text}"
        + (f" (tiết kiệm {route_metrics['saved_km']} km chống zig-zag)" if route_metrics["saved_km"] > 0 else "")
        + (f" — giảm {route_metrics['saved_vs_car_percent']}% CO₂ so với ô tô." if route_metrics["saved_vs_car_percent"] > 0 else ".")
    )
    response.green_impact_summary = (
        f"{response.green_impact_summary} • {route_line}" if response.green_impact_summary else route_line
    )

    if opening_warnings:
        warn_joined = " | ".join(opening_warnings[:3])
        response.avoid_notice = f"{response.avoid_notice} • ⏰ {warn_joined}" if response.avoid_notice else f"⏰ {warn_joined}"

    if route_metrics["saved_km"] > 0:
        response.mutation_summary.append(
            f"🧭 Tối ưu chống zig-zag ngày {route_metrics['reordered_days']}: giảm {route_metrics['saved_km']} km di chuyển."
        )
    if budget_status["adjusted_stops"]:
        response.mutation_summary.extend(f"💰 {note}" for note in budget_status["adjusted_stops"][:2])

    if response.reasoning_trace is not None:
        max_fatigue = max((m["fatigue_score"] for m in fatigue_metrics), default=0.0)
        rest_days = [m["day"] for m in fatigue_metrics if m.get("rest_inserted")]
        solver_trace = (
            f"\n5. Quantitative Solver (Part 2): "
            f"C_total={_format_vnd(tot_b)}"
            + (f" / B_max={_format_vnd(max_b)} (within_budget={budget_status['within_budget']})" if max_b else "")
            + f" | Route={route_metrics['after_km']}km ({co2_text}, saved={route_metrics['saved_km']}km)"
            + f" | MaxFatigue={max_fatigue}h (RestInserted={rest_days})"
            + f" | OpeningHoursWarnings={len(opening_warnings)}."
        )
        response.reasoning_trace = f"{response.reasoning_trace}{solver_trace}".strip()

    return response

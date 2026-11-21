"""Corrective Grounding verifier for GreenTrip Copilot (blocks ungrounded POI hallucinations)."""
from __future__ import annotations

import csv
from functools import lru_cache
import logging
from pathlib import Path
import re
from typing import Any

from psycopg import Connection

from app.trips.copilot_enrichment import DEFAULT_POI_COORDS_KB
from app.trips.copilot_intent import LANDMARK_CITY_KB
from app.trips.schemas import CopilotSuggestedPoiItem, TripContextPayload
from app.trips.text_utils import strip_vietnamese_accents

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_POIS_CSV_PATH = _PROJECT_ROOT / "data" / "processed" / "all_pois_cleaned.csv"

_BOLD_SPAN_RE = re.compile(r"\*\*([^*]{2,120})\*\*")

_PLACE_PREFIXES: tuple[str, ...] = (
    "quan ",
    "nha hang ",
    "cafe ",
    "ca phe ",
    "tiem ",
    "bep ",
    "chua ",
    "lang ",
    "den ",
    "nha tho ",
    "bao tang ",
    "cho ",
    "bai bien ",
    "ban dao ",
    "cau ",
    "dinh ",
    "doi ",
    "nui ",
    "ho ",
    "suoi ",
    "thac ",
    "khu du lich ",
    "lang co ",
    "lang sinh thai ",
    "pho co ",
    "resort ",
    "khach san ",
    "homestay ",
    "villa ",
    "roastery",
    "teahouse",
    "bistro",
    "bakery",
    "dai noi",
    "hoang thanh",
    "ba na",
    "ngu hanh son",
    "son tra",
)

_GENERIC_PREFIX_WORDS = frozenset({
    "quan", "nha", "hang", "cafe", "ca", "phe", "tiem", "bep", "chua", "lang",
    "den", "tho", "bao", "tang", "cho", "bai", "bien", "ban", "dao", "cau",
    "dinh", "doi", "nui", "ho", "suoi", "thac", "khu", "du", "lich", "pho",
    "co", "resort", "khach", "san", "homestay", "villa", "roastery", "teahouse",
    "bistro", "bakery", "an", "uong", "chay", "hai", "sinh", "thai", "da",
    "nang", "hue", "hoi", "tai", "o", "va", "voi", "mien", "trung",
})

_IGNORED_LABELS_FOLDED: tuple[str, ...] = (
    "a —", "b —", "a -", "b -", "ngay ", "diem manh", "can can nhac",
    "luu y", "phuong an", "chi phi", "ngan sach", "goi y", "meo ",
    "giai phap", "khung gio", "danh sach", "hanh trinh", "tong quan",
    "buoi sang", "buoi trua", "buoi chieu", "buoi toi", "green score",
)

_GENERIC_PHRASES_FOLDED = frozenset({
    "quan an", "quan chay", "quan ca phe", "quan cafe", "nha hang dia phuong",
    "cho dem", "bao tang trong nha", "ca phe muoi", "khach san trung tam",
    "quan an ngon", "quan ca phe yen tinh", "quan cafe chill",
    "quan an dia phuong", "nha hang chay", "diem tru mua",
})

_CANONICAL_ANCHOR_NAMES: tuple[str, ...] = (
    "phố cổ hội an",
    "bảo tàng điêu khắc chăm",
    "bảo tàng mỹ thuật",
    "bảo tàng cổ vật cung đình huế",
    "sơn trà marina",
    "chợ đêm sơn trà",
    "làng sinh thái thủy biều",
    "đình tiên hoàng",
    "cà phê muối đinh tiên hoàng",
    "nguyễn huệ",
    "cầu rồng",
    "bãi biển mỹ khê",
    "bán đảo sơn trà",
    "chùa linh ứng",
    "ngũ hành sơn",
    "bà nà hills",
    "cầu vàng",
    "đại nội huế",
    "chùa thiên mụ",
    "lăng tự đức",
    "lăng khải định",
)


def normalize_entity_text(value: str) -> str:
    """Fold Vietnamese accents, lowercase, normalize separators, and strip parenthetical tags."""
    without_parens = re.sub(r"\([^)]*\)", " ", value or "")
    folded = strip_vietnamese_accents(without_parens).lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", folded)
    return " ".join(cleaned.split())


def _core_tokens(norm_text: str) -> list[str]:
    tokens = [t for t in norm_text.split() if t not in _GENERIC_PREFIX_WORDS and len(t) > 1]
    return tokens if tokens else [t for t in norm_text.split() if len(t) > 1]


@lru_cache(maxsize=1)
def _load_static_poi_names() -> frozenset[str]:
    names: set[str] = set()
    for canonical in _CANONICAL_ANCHOR_NAMES:
        norm = normalize_entity_text(canonical)
        if norm:
            names.add(norm)
    for key, info in LANDMARK_CITY_KB.items():
        for candidate in (key, info.get("canonical_name", "")):
            norm = normalize_entity_text(candidate)
            if norm:
                names.add(norm)
    for key, _, _ in DEFAULT_POI_COORDS_KB:
        norm = normalize_entity_text(key)
        if norm:
            names.add(norm)
    if _POIS_CSV_PATH.exists():
        try:
            with open(_POIS_CSV_PATH, encoding="utf-8", newline="") as handle:
                for row in csv.DictReader(handle):
                    raw_name = (row.get("name") or "").strip()
                    if raw_name:
                        norm = normalize_entity_text(raw_name)
                        if norm:
                            names.add(norm)
                        primary = re.split(r"\s*[–—|/-]\s*", raw_name, maxsplit=1)[0].strip()
                        norm_primary = normalize_entity_text(primary)
                        if len(norm_primary) >= 4:
                            names.add(norm_primary)
        except Exception as exc:
            logger.warning("Could not read CSV POI names for grounding: %s", exc)
    return frozenset(names)


def load_known_poi_names(connection: Connection | None = None) -> set[str]:
    """Combine verified static POI dataset names with live public.pois names."""
    known = set(_load_static_poi_names())
    if connection is None:
        return known
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT name FROM public.pois WHERE name IS NOT NULL LIMIT 1000")
            for (raw_name,) in cursor.fetchall():
                if not raw_name:
                    continue
                norm = normalize_entity_text(str(raw_name))
                if norm:
                    known.add(norm)
                primary = re.split(r"\s*[–—|/-]\s*", str(raw_name), maxsplit=1)[0].strip()
                norm_primary = normalize_entity_text(primary)
                if len(norm_primary) >= 4:
                    known.add(norm_primary)
    except Exception as exc:
        logger.debug("Optional DB POI grounding query skipped: %s", exc)
    return known


def _looks_like_specific_place(span: str) -> bool:
    stripped = span.strip()
    if not stripped or ":" in stripped:
        return False
    folded_raw = " ".join(strip_vietnamese_accents(stripped).lower().split())
    if any(folded_raw.startswith(lbl) for lbl in _IGNORED_LABELS_FOLDED):
        return False
    norm = normalize_entity_text(stripped)
    if not norm or norm in _GENERIC_PHRASES_FOLDED:
        return False
    if any(marker in folded_raw for marker in ("yen tinh", "chuan xanh", "trong nha", "dia phuong")):
        if len(folded_raw.split()) >= 6 or "," in stripped:
            return False
    return any(norm.startswith(prefix) or prefix.strip() == norm for prefix in _PLACE_PREFIXES)


def _is_single_part_grounded(part_norm: str, allowed_pool: set[str], allowed_cores: list[set[str]]) -> bool:
    if not part_norm or part_norm in _GENERIC_PHRASES_FOLDED:
        return True
    if part_norm in allowed_pool:
        return True
    if len(part_norm) >= 5:
        for known in allowed_pool:
            if len(known) >= 5 and (part_norm in known or known in part_norm):
                return True
    part_core = set(_core_tokens(part_norm))
    if not part_core:
        return True
    for known_core in allowed_cores:
        if not known_core:
            continue
        overlap = len(part_core & known_core) / max(len(part_core), 1)
        if overlap >= 0.75:
            return True
    return False


def detect_ungrounded_poi_mentions(
    reply_text: str,
    known_names: set[str],
    extra_allowed_names: list[str] | None = None,
) -> list[str]:
    """Return bold venue names in reply_text that do not match verified DB/KB POIs."""
    if not reply_text:
        return []
    allowed_pool = set(known_names)
    for item in extra_allowed_names or []:
        norm = normalize_entity_text(item)
        if norm:
            allowed_pool.add(norm)
            primary = re.split(r"\s*[–—|/-]\s*", item, maxsplit=1)[0].strip()
            norm_primary = normalize_entity_text(primary)
            if len(norm_primary) >= 4:
                allowed_pool.add(norm_primary)

    allowed_cores = [set(_core_tokens(n)) for n in allowed_pool if len(n) >= 4]
    ungrounded: list[str] = []

    for match in _BOLD_SPAN_RE.finditer(reply_text):
        raw_span = match.group(1).strip()
        if not _looks_like_specific_place(raw_span):
            continue
        # Strip parenthetical notes first so descriptors like "(A & B)" do not split the venue name
        span_without_parens = re.sub(r"\([^)]*\)", " ", raw_span).strip()
        subparts = [p.strip() for p in re.split(r"\s*[&/]\s*", span_without_parens) if p.strip()]
        all_grounded = True
        for part in subparts:
            part_norm = normalize_entity_text(part)
            if not part_norm:
                continue
            if not _is_single_part_grounded(part_norm, allowed_pool, allowed_cores):
                all_grounded = False
                break
        if not all_grounded and raw_span not in ungrounded:
            ungrounded.append(raw_span)

    return ungrounded


def _collect_allowed_context_names(
    suggested_pois: list[CopilotSuggestedPoiItem],
    trip_context: TripContextPayload,
    protected_keywords: list[str] | None = None,
) -> list[str]:
    names: list[str] = [p.name for p in suggested_pois if p.name]
    names.extend(idea for idea in (trip_context.saved_ideas or []) if idea)
    for day_obj in trip_context.current_itinerary_state or []:
        for stop in day_obj.get("stops") or []:
            title = stop.get("title") or stop.get("name")
            if title:
                names.append(str(title))
    if protected_keywords:
        names.extend(k for k in protected_keywords if k)
    return names


def verify_and_ground_reply_text(
    candidate_reply: str,
    fallback_reply: str,
    suggested_pois: list[CopilotSuggestedPoiItem],
    trip_context: TripContextPayload,
    connection: Connection | None = None,
    protected_keywords: list[str] | None = None,
) -> tuple[str, list[str]]:
    """Verify synthesized reply mentions only verified POIs; fall back if any ungrounded POI appears."""
    extra_allowed = _collect_allowed_context_names(
        suggested_pois=suggested_pois,
        trip_context=trip_context,
        protected_keywords=protected_keywords,
    )
    known = load_known_poi_names(connection)
    ungrounded = detect_ungrounded_poi_mentions(
        reply_text=candidate_reply,
        known_names=known,
        extra_allowed_names=extra_allowed,
    )
    if ungrounded:
        logger.warning("Corrective Grounding rejected ungrounded POI mentions: %s", ungrounded)
        return fallback_reply, ungrounded
    return candidate_reply, []

"""Vietnamese query normalization, diacritic folding, and collision-safe phrase matching."""
from __future__ import annotations

import re
import unicodedata

SLANG_REPLACEMENTS: list[tuple[str, str]] = [
    (r"\brcm\b", "gợi ý"),
    (r"\brecommend\b", "gợi ý"),
    (r"\bcf\b", "cà phê"),
    (r"\bcafe\b", "cà phê"),
    (r"\bks\b", "khách sạn"),
    (r"\bko\b", "không"),
    (r"\bhok\b", "không"),
    (r"\bkhum\b", "không"),
    (r"\bđc\b", "được"),
    (r"\bdc\b", "được"),
    (r"\bng\b", "người"),
    (r"\bđn\b", "đà nẵng"),
    (r"\bdn\b", "đà nẵng"),
    (r"\btp\s*đn\b", "đà nẵng"),
    (r"\btpđn\b", "đà nẵng"),
]

# Single-word unaccented tokens prone to homograph false positives (e.g. mưa/mua, bò/bỏ, chùa/chưa, tối/tôi).
_AMBIGUOUS_UNACCENTED_TOKENS: frozenset[str] = frozenset(
    {
        "an",
        "ban co",
        "bo",
        "che",
        "cho",
        "chua",
        "da",
        "dem",
        "di",
        "giao",
        "lang",
        "mua",
        "ngu",
        "oc",
        "qua",
        "sao",
        "thue",
        "toi",
        "uot",
    }
)


def normalize_vietnamese_query(raw_message: str) -> str:
    """Normalize common Vietnamese travel slang and abbreviations."""
    normalized = (raw_message or "").strip().lower()
    for pattern, replacement in SLANG_REPLACEMENTS:
        normalized = re.sub(pattern, replacement, normalized, flags=re.IGNORECASE)
    return normalized


def strip_vietnamese_accents(text: str) -> str:
    """Fold Vietnamese diacritics (including đ/Đ) into plain ASCII lowercase text."""
    if not text:
        return ""
    replaced = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFKD", replaced)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(stripped.lower().split())


def _is_safe_unaccented_phrase(folded_phrase: str) -> bool:
    if not folded_phrase:
        return False
    if folded_phrase in _AMBIGUOUS_UNACCENTED_TOKENS:
        return False
    # Single short tokens (< 4 chars) are risky without context; multi-word phrases are safe.
    if " " not in folded_phrase and len(folded_phrase) < 4:
        return False
    return True


def contains_any_phrase(
    norm_msg: str,
    folded_msg: str,
    accented_phrases: list[str] | tuple[str, ...],
    unaccented_safe_phrases: list[str] | tuple[str, ...] | None = None,
) -> bool:
    """
    Two-pass phrase check:
    1) Exact substring check on slang-normalized accented text (preserves legacy matching).
    2) Word-boundary check on diacritic-folded text for multi-word / unambiguous phrases.
    """
    if any(phrase in norm_msg for phrase in accented_phrases):
        return True

    candidates: list[str] = []
    if unaccented_safe_phrases is not None:
        for phrase in unaccented_safe_phrases:
            folded = strip_vietnamese_accents(phrase)
            if folded and folded not in _AMBIGUOUS_UNACCENTED_TOKENS:
                candidates.append(folded)
    else:
        for phrase in accented_phrases:
            folded = strip_vietnamese_accents(phrase)
            if _is_safe_unaccented_phrase(folded):
                candidates.append(folded)

    for candidate in dict.fromkeys(candidates):
        if re.search(rf"(?<!\w){re.escape(candidate)}(?!\w)", folded_msg):
            return True
    return False


def resolve_effective_city(message: str, fallback_dest: str | None = None) -> tuple[str, bool, str]:
    """
    Determine target city from the user's message FIRST, falling back to trip_context.destination
    only when the message does not specify a single city.
    Returns: (sql_city_pattern, is_both, display_city_name)
    """
    norm_msg = normalize_vietnamese_query(message)
    folded_msg = strip_vietnamese_accents(norm_msg)

    da_nang_markers = [
        "đà nẵng", "da nang", "danang", "sơn trà", "mỹ khê", "hải châu",
        "cầu rồng", "ngũ hành sơn", "bà nà", "cầu vàng", "sông hàn", "chợ cồn", "chợ hàn",
    ]
    hue_markers = [
        "huế", "cố đô", "đại nội", "sông hương", "thiên mụ",
        "khải định", "tự đức", "minh mạng", "chợ đông ba", "lăng cô",
    ]

    msg_has_dn = contains_any_phrase(norm_msg, folded_msg, da_nang_markers)
    msg_has_hue = contains_any_phrase(norm_msg, folded_msg, hue_markers, ["hue", "co do"])

    if msg_has_dn and not msg_has_hue:
        return "%Da Nang%", False, "Đà Nẵng"
    if msg_has_hue and not msg_has_dn:
        return "%Hue%", False, "Huế"

    dest_lower = (fallback_dest or "Đà Nẵng").strip().lower()
    dest_folded = strip_vietnamese_accents(dest_lower)
    dest_has_dn = any(k in dest_lower or k in dest_folded for k in ["đà nẵng", "da nang", "danang", "dn"])
    dest_has_hue = any(k in dest_lower or k in dest_folded for k in ["huế", "hue"])

    if dest_has_dn and dest_has_hue:
        return "%", True, "Đà Nẵng & Huế"
    if dest_has_hue:
        return "%Hue%", False, "Huế"
    return "%Da Nang%", False, "Đà Nẵng"


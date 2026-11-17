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

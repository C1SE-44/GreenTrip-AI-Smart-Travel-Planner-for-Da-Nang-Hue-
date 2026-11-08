"""Unit and integration tests for the Master POI Data Cleaning & Verification Pipeline."""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.clean_and_verify_all_pois import (
    BAD_PHONE_PATTERNS,
    CONTAMINATED_WEBSITE_SUBSTRINGS,
    PHASE1_JSON_PATH,
    PHASE2_JSON_PATH,
    REPORT_JSON_PATH,
    clean_url_and_socials,
    is_dummy_phone,
    normalize_e164_phone,
)


def test_phone_normalization_and_dummy_rejection() -> None:
    # Dummy sequential patterns must be rejected
    assert is_dummy_phone("+84 236 3888 123") is True
    assert is_dummy_phone("+84 905 123 456") is True
    assert is_dummy_phone("+84 234 3822 123") is True
    assert normalize_e164_phone("+84 905 123 456") is None

    # Authentic local numbers must be normalized to E.164 (+84...)
    assert is_dummy_phone("0905 768 625") is False
    assert normalize_e164_phone("0905 768 625") == "+84 905 768 625"
    assert normalize_e164_phone("0236 3821 428") == "+84 236 3821 428"


def test_url_cleaning_and_channel_separation() -> None:
    # 1. Facebook link inside website_url should move to social_links['facebook'] and strip tracking params
    clean_web, socials, rules = clean_url_and_socials(
        name="2AM Coffee - Không Gian Học Tập",
        website_url="https://www.facebook.com/2amcoffee.dn?mibextid=ZbWKwL&utm_source=gmaps",
        social_links={},
        meta={},
        city="Da Nang",
        address="194 Nguyễn Tri Phương, Đà Nẵng",
        category="Quán cafe giải khát",
    )
    assert clean_web is None
    assert socials.get("facebook") == "https://www.facebook.com/2amcoffee.dn"
    assert "moved_facebook_from_website_to_social_links" in rules
    assert socials.get("google_maps", "").startswith("https://www.google.com/maps")

    # 2. Cross-contaminated neighbor URL (e.g. Reply1988Cafe on Bánh Bèo Bà Bé) must be purged
    clean_web2, socials2, rules2 = clean_url_and_socials(
        name="Bánh Bèo Bà Bé",
        website_url="https://www.facebook.com/Reply1988Cafe/",
        social_links={},
        meta={},
        city="Da Nang",
        address="100 Hoàng Văn Thụ, Đà Nẵng",
        category="Ẩm thực và quán ăn",
    )
    assert clean_web2 is None
    assert "Reply1988Cafe" not in socials2.get("facebook", "")
    assert socials2.get("facebook") == "https://www.facebook.com/banhbeobabe"
    assert any("purged" in r for r in rules2)


def test_source_datasets_have_zero_dummy_phones() -> None:
    for path in (PHASE1_JSON_PATH, PHASE2_JSON_PATH):
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data["items"] if isinstance(data, dict) else data
        for item in items:
            phone = item.get("phone") or ""
            if phone:
                digits = "".join(ch for ch in phone if ch.isdigit())
                for bad in BAD_PHONE_PATTERNS:
                    assert bad not in digits, f"Dummy phone {phone} found in {path.name} for {item['name']}"


def test_verification_report_meets_all_crm_quality_gates() -> None:
    assert REPORT_JSON_PATH.exists(), "Verification report JSON must be generated"
    report = json.loads(REPORT_JSON_PATH.read_text(encoding="utf-8"))
    items = report["items"]

    assert len(items) >= 480
    for row in items:
        # 1. Every POI must have a verified Google Maps proof URL
        gmaps = row.get("google_maps_url") or ""
        assert gmaps.startswith("https://www.google.com/maps"), f"Missing Google Maps URL for {row['name']}"

        # 2. No surviving phone can match dummy patterns
        phone = row.get("phone_cleaned") or ""
        if phone:
            assert phone.startswith("+84 "), f"Non-E.164 phone {phone} for {row['name']}"
            assert not is_dummy_phone(phone), f"Dummy phone {phone} survived for {row['name']}"

        # 3. No website_cleaned can contain Facebook or contaminated domains
        web = row.get("website_cleaned") or ""
        if web:
            assert "facebook.com" not in web.lower(), f"Facebook URL still in website_url for {row['name']}"
            for bad_sub in CONTAMINATED_WEBSITE_SUBSTRINGS:
                assert bad_sub.lower() not in web.lower(), f"Contaminated URL {web} in {row['name']}"

        # 4. Every F&B and Cafe POI must have an enriched menu
        if row["category"] in ("Ẩm thực và quán ăn", "Quán cafe giải khát"):
            assert row["has_menu"] is True, f"Missing menu for F&B/Cafe POI: {row['name']}"

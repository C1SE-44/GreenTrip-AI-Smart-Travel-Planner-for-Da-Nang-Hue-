"""Unit tests for enrich_poi_scores.py."""

from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from scripts.enrich_poi_scores import (
    calculate_green_score,
    calculate_popularity_score,
    calculate_satisfaction_score,
    compute_all_scores,
    summarize_scores,
)


def test_calculate_satisfaction_score_bayesian_pulls_low_reviews_to_mean():
    # Place with 5.0 rating but only 1 review should be pulled close to 4.40
    score_low_sample = calculate_satisfaction_score(rating=5.0, review_count=1, prior_mean=4.40, confidence_weight=30.0)
    assert 4.40 <= score_low_sample < 4.45

    # Place with 4.9 rating and 10,000 reviews should preserve its 4.90 rating
    score_high_sample = calculate_satisfaction_score(rating=4.9, review_count=10000, prior_mean=4.40, confidence_weight=30.0)
    assert score_high_sample == 4.90

    # Place with 2.5 rating and 500 reviews
    score_negative = calculate_satisfaction_score(rating=2.5, review_count=500, prior_mean=4.40, confidence_weight=30.0)
    assert score_negative < 3.0


def test_calculate_popularity_score_scaling_and_bonuses():
    # 0 reviews -> base 1.0
    zero_score = calculate_popularity_score(review_count=0, max_review_count=10000)
    assert zero_score == 1.0

    # Max reviews -> base ~ 4.40
    max_score = calculate_popularity_score(review_count=10000, max_review_count=10000)
    assert 4.30 <= max_score <= 4.50

    # Michelin bonus (+0.35)
    normal = calculate_popularity_score(review_count=1000, max_review_count=10000, name="Bún chả cá thường")
    michelin = calculate_popularity_score(review_count=1000, max_review_count=10000, name="Bún chả cá Hờn (Đạt giải MICHELIN Bib Gourmand)")
    assert round(michelin - normal, 2) == 0.35

    # UNESCO bonus (+0.40)
    unesco = calculate_popularity_score(review_count=1000, max_review_count=10000, name="Đại Nội Huế (Hoàng Thành)")
    assert round(unesco - normal, 2) == 0.40

    # Cap at 5.0
    huge = calculate_popularity_score(review_count=100000, max_review_count=10000, name="Đại Nội Huế Michelin")
    assert huge <= 5.0


def test_calculate_green_score_mcda_pillars():
    # Vegan restaurant vs standard restaurant
    vegan_score = calculate_green_score(
        category="Ẩm thực và quán ăn",
        sub_category="green_vegetarian",
        cuisine="plant_based_vegan",
        city="Hue",
        name="Quán Chay An Lạc",
    )
    meat_score = calculate_green_score(
        category="Ẩm thực và quán ăn",
        sub_category="bbq_grill",
        city="Da Nang",
        name="Quán Nhậu Nướng Thịt",
    )
    assert vegan_score > meat_score
    assert vegan_score >= 0.70

    # Nature / National Park should have highest green score
    nature_score = calculate_green_score(
        category="Cảnh quan và thiên nhiên",
        name="Vườn Quốc Gia Bạch Mã",
        description="Khu bảo tồn sinh thái rừng nguyên sinh và suối thác",
    )
    assert nature_score >= 0.85

    # Historical World Heritage
    heritage_score = calculate_green_score(
        category="Di tích lịch sử và văn hóa",
        name="Lăng Vua Tự Đức",
        description="Quần thể di tích Cố đô Huế được UNESCO công nhận",
    )
    assert heritage_score >= 0.75

    # Bounds check
    assert 0.40 <= vegan_score <= 0.98
    assert 0.40 <= meat_score <= 0.98
    assert 0.40 <= nature_score <= 0.98


def test_compute_all_scores_batch_processing():
    sample_records = [
        {"poi_id": "1", "name": "Bãi biển Mỹ Khê", "category": "Cảnh quan và thiên nhiên", "rating": "4.6", "review_count": "5000"},
        {"poi_id": "2", "name": "Bánh Xèo Bà Dưỡng (MICHELIN Selected)", "category": "Ẩm thực và quán ăn", "rating": "4.3", "review_count": "8000"},
        {"poi_id": "3", "name": "Cơm Chay Thanh Liễu", "category": "Ẩm thực và quán ăn", "sub_category": "green_vegetarian", "rating": "4.7", "review_count": "150"},
    ]
    enriched = compute_all_scores(sample_records)
    assert len(enriched) == 3
    for item in enriched:
        assert "satisfaction_score" in item
        assert "popularity_score" in item
        assert "green_score" in item
        assert 1.0 <= item["satisfaction_score"] <= 5.0
        assert 1.0 <= item["popularity_score"] <= 5.0
        assert 0.40 <= item["green_score"] <= 0.98


def test_summarize_scores():
    stats = summarize_scores([1.0, 2.0, 3.0, 4.0, 5.0], "Test")
    assert stats["count"] == 5
    assert stats["min"] == 1.0
    assert stats["median"] == 3.0
    assert stats["max"] == 5.0
    assert stats["mean"] == 3.0

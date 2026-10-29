"""Hybrid content, quality, popularity, and green POI ranking."""

from __future__ import annotations

import math
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


PREFERENCE_EXPANSIONS: dict[str, str] = {
    "culture": "van hoa lich su di san heritage history",
    "food": "am thuc an uong mon an dia phuong cuisine local food",
    "nature": "thien nhien canh quan sinh thai landscape nature",
    "eco": "xanh sinh thai ben vung green sustainable eco",
    "beach": "bien bo bien nghi duong beach seaside",
    "adventure": "phieu luu trai nghiem ngoai troi adventure outdoor",
    "checkin": "chup anh song ao checkin photo viewpoint",
    "relaxation": "thu gian yen binh nghi duong relax peaceful",
    "family": "gia dinh tre em family children",
    "nightlife": "ban dem am nhac nightlife night",
}


class ContentBasedRecommender:
    """Rank POIs against user interests, quality signals, and eco constraints.

    The non-green component is 65% semantic similarity, 25% normalized
    satisfaction, and 10% normalized popularity. PB08's normalized green
    weight blends that component with the POI's green score.
    """

    def __init__(
        self,
        poi_list: Sequence[Mapping[str, Any]],
        feature_matrix: Any,
        vectorizer: TfidfVectorizer,
    ) -> None:
        if feature_matrix.shape[0] != len(poi_list):
            raise ValueError("feature_matrix rows must align with poi_list")
        text_feature_count = len(getattr(vectorizer, "vocabulary_", {}))
        if text_feature_count == 0 or feature_matrix.shape[1] < text_feature_count:
            raise ValueError("feature_matrix does not contain a fitted TF-IDF space")

        self.poi_list = list(poi_list)
        self.feature_matrix = feature_matrix
        self.vectorizer = vectorizer
        self._text_feature_count = text_feature_count

    @staticmethod
    def _number(value: Any, *, default: float = 0.0) -> float:
        """Convert a database numeric value to a finite float or its default."""
        if value is None or isinstance(value, bool):
            return default
        try:
            number = float(value)
        except (TypeError, ValueError, OverflowError):
            return default
        return number if math.isfinite(number) else default

    @classmethod
    def _green_score(cls, poi: Mapping[str, Any]) -> float:
        """Return a [0, 1] green score, with a proxy for missing values."""
        default = 0.8 if poi.get("is_local_business") is True else 0.5
        return min(1.0, max(0.0, cls._number(poi.get("green_score"), default=default)))

    @classmethod
    def _satisfaction_score(cls, poi: Mapping[str, Any]) -> float:
        """Normalize a five-star rating into [0, 1]."""
        rating = cls._number(poi.get("satisfaction_score"), default=0.0)
        return min(1.0, max(0.0, rating / 5.0))

    @staticmethod
    def _popularity_scores(pois: Sequence[Mapping[str, Any]]) -> list[float]:
        """Log-scale and min-max normalize popularity across this candidate set."""
        values: list[float] = []
        for poi in pois:
            raw = ContentBasedRecommender._number(poi.get("popularity_score"), default=0.0)
            values.append(math.log1p(max(0.0, raw)))

        low = min(values, default=0.0)
        high = max(values, default=0.0)
        if math.isclose(low, high):
            return [0.5] * len(values)
        return [(value - low) / (high - low) for value in values]

    @staticmethod
    def build_user_vector(
        interests: list[str], vectorizer: TfidfVectorizer
    ) -> csr_matrix:
        """Transform user preferences into the POI text feature space."""
        if not isinstance(interests, list) or any(
            not isinstance(interest, str) for interest in interests
        ):
            raise TypeError("interests must be a list of strings")

        expanded: list[str] = []
        for interest in interests:
            cleaned = interest.strip()
            if not cleaned:
                continue
            expanded.append(cleaned)
            key = unicodedata.normalize("NFKD", cleaned.casefold())
            key = "".join(char for char in key if not unicodedata.combining(char))
            key = key.replace("đ", "d")
            if key in PREFERENCE_EXPANSIONS:
                expanded.append(PREFERENCE_EXPANSIONS[key])
        corpus = " ".join(expanded)
        try:
            return vectorizer.transform([corpus])
        except (AttributeError, ValueError) as exc:
            raise ValueError("vectorizer must be fitted before building a user vector") from exc

    def rank_pois(
        self,
        user_interests: list[str],
        normalized_green_weight: float,
        top_k: int | None = None,
        *,
        min_eco_score: float = 0.0,
        max_budget: float | None = None,
    ) -> list[dict[str, Any]]:
        """Apply PB08 hard filters and return candidates in hybrid-score order.

        ``min_eco_score`` is expressed on a 0-100 scale; POI green scores are
        stored on a 0-1 scale. Every candidate needs a finite, nonnegative
        per-person ``estimated_cost``. ``max_budget`` is an individual
        per-person ceiling in VND, separate from PB07's group-wide allocation.
        """
        green_weight = self._number(normalized_green_weight, default=float("nan"))
        if not math.isfinite(green_weight) or not 0.0 <= green_weight <= 1.0:
            raise ValueError("normalized_green_weight must be between 0 and 1")

        eco_floor = self._number(min_eco_score, default=float("nan"))
        if not math.isfinite(eco_floor) or not 0.0 <= eco_floor <= 100.0:
            raise ValueError("min_eco_score must be between 0 and 100")

        budget_ceiling: float | None = None
        if max_budget is not None:
            budget_ceiling = self._number(max_budget, default=float("nan"))
            if not math.isfinite(budget_ceiling) or budget_ceiling < 0.0:
                raise ValueError("max_budget must be a finite nonnegative VND amount")

        if top_k is not None and (
            not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 0
        ):
            raise ValueError("top_k must be a nonnegative integer or None")
        if top_k == 0:
            return []

        active_indices = [
            index
            for index, poi in enumerate(self.poi_list)
            if poi.get("is_active", True) is not False
        ]
        if not active_indices:
            return []

        active_pois = [self.poi_list[index] for index in active_indices]
        popularity = self._popularity_scores(active_pois)
        user_vector = self.build_user_vector(user_interests, self.vectorizer)
        text_matrix = self.feature_matrix[:, : self._text_feature_count]
        similarities = cosine_similarity(
            user_vector,
            text_matrix[active_indices],
            dense_output=True,
        )[0]

        ranked: list[dict[str, Any]] = []
        for poi, similarity, popularity_score in zip(
            active_pois, similarities, popularity
        ):
            # Costs are required data for all recommendations. In particular,
            # NULL must never be interpreted as a free POI.
            cost_value = self._number(
                poi.get("effective_estimated_cost", poi.get("estimated_cost")),
                default=float("nan"),
            )
            if not math.isfinite(cost_value) or cost_value < 0.0:
                continue

            green_score = self._green_score(poi)
            if green_score * 100.0 < eco_floor:
                continue

            # PB08's ceiling applies to the database's per-person price.
            if budget_ceiling is not None and cost_value > budget_ceiling:
                continue

            satisfaction = self._satisfaction_score(poi)
            semantic_score = min(1.0, max(0.0, float(similarity)))
            content_quality = (
                0.65 * semantic_score
                + 0.25 * satisfaction
                + 0.10 * popularity_score
            )
            hybrid_score = (
                (1.0 - green_weight) * content_quality
                + green_weight * green_score
            )

            ranked_poi = dict(poi)
            ranked_poi["match_score"] = min(100.0, max(0.0, hybrid_score * 100.0))
            ranked_poi["resolved_green_score"] = green_score
            ranked.append(ranked_poi)

        ranked.sort(
            key=lambda item: (-item["match_score"], str(item.get("poi_id", "")))
        )
        return ranked if top_k is None else ranked[:top_k]

"""Hybrid content, quality, popularity, and green POI ranking."""

from __future__ import annotations

import math
import json
import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


PREFERENCE_TERMS: dict[str, tuple[str, ...]] = {
    "beach": (
        "bien", "bai bien", "bo bien", "beach", "beaches", "seaside",
        "sea", "coast", "coastal", "coastline", "shore", "shoreline",
        "swimming", "swim", "snorkeling", "snorkel", "surfing", "surf",
    ),
    "nature": (
        "thien nhien", "canh quan", "sinh thai", "nature", "landscape",
        "ecology", "forest", "mountain", "waterfall", "mangrove", "lagoon",
    ),
    "culture": (
        "van hoa", "lich su", "di san", "di tich", "culture", "heritage",
        "history", "historic", "historical", "museum", "citadel",
    ),
    "food": (
        "am thuc", "an uong", "mon an", "dac san", "food", "cuisine",
        "restaurant", "dining", "seafood", "culinary", "eatery",
    ),
    "coffee": ("ca phe", "coffee", "cafe", "roastery"),
    "checkin": ("check in", "checkin", "chup anh", "photography", "viewpoint"),
    "adventure": (
        "phieu luu", "trai nghiem ngoai troi", "adventure", "outdoor",
        "hiking", "kayaking", "cycling",
    ),
    "relaxation": (
        "thu gian", "yen binh", "yen tinh", "nghi duong", "relax",
        "peaceful", "quiet", "spa",
    ),
    "spiritual": ("tam linh", "hanh huong", "spiritual", "pilgrimage", "worship"),
    "local": ("trai nghiem dia phuong", "ban dia", "local experience", "local culture"),
    "eco": ("xanh", "ben vung", "sinh thai", "green", "sustainable", "eco"),
    "family": ("gia dinh", "tre em", "family", "children", "kid friendly"),
    "nightlife": ("ban dem", "am nhac", "nightlife", "night", "live music"),
}

PREFERENCE_ALIASES: dict[str, str] = {
    alias: key
    for key, terms in PREFERENCE_TERMS.items()
    for alias in (key, *terms)
}
PREFERENCE_ALIASES.update({
    "van hoa lich su": "culture",
    "culture history": "culture",
    "sinh thai": "nature",
    "experience local": "local",
    "coffee shop": "coffee",
})
PREFERENCE_EXPANSIONS: dict[str, str] = {
    key: " ".join(terms) for key, terms in PREFERENCE_TERMS.items()
}

_COASTAL_ASSOCIATED_BEACH_TERMS = {"coast", "coastal", "coastline"}
_MIN_TEXT_SIMILARITY = 0.08

POI_BUDGET_TIER_LEVELS: dict[str, int] = {
    "free": 0,
    "$": 0,
    "$$": 1,
    "$$$": 2,
    "$$$$": 3,
}
REQUEST_BUDGET_TIER_LEVELS: dict[str, int] = {
    "budget": 0,
    "standard": 1,
    "upgrade": 2,
    "luxury": 3,
}


class ContentBasedRecommender:
    """Rank POIs against user interests, quality signals, and eco constraints.

    With submitted interests, taxonomy/text relevance contributes 90% of the
    score and all secondary signals together contribute at most 10%. Without
    interests, the existing quality/green blend remains the fallback. A PB07
    budget target is a soft secondary contribution.
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
    def _normalize_text(value: str) -> str:
        """Normalize Vietnamese and English labels, including taxonomy separators."""
        normalized = unicodedata.normalize("NFKD", value.casefold().replace("đ", "d"))
        normalized = "".join(
            char for char in normalized if not unicodedata.combining(char)
        )
        normalized = normalized.replace("_", " ").replace("-", " ")
        normalized = re.sub(r"[^\w\s]", " ", normalized)
        return re.sub(r"\s+", " ", normalized).strip()

    @classmethod
    def _contains_term(cls, text: str, term: str) -> bool:
        """Match a whole normalized phrase, not a substring like sea/seafood."""
        normalized_text = f" {cls._normalize_text(text)} "
        normalized_term = f" {cls._normalize_text(term)} "
        return normalized_term != "  " and normalized_term in normalized_text

    @classmethod
    def _flatten_value(cls, value: Any) -> str:
        """Flatten taxonomy tags and metadata into searchable text."""
        if isinstance(value, str):
            return value
        if isinstance(value, Mapping):
            return " ".join(
                part
                for key, item in value.items()
                for part in (cls._flatten_value(key), cls._flatten_value(item))
                if part
            )
        if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            return " ".join(
                part for item in value if (part := cls._flatten_value(item))
            )
        return ""

    @classmethod
    def _interest_profiles(cls, interests: list[str]) -> list[dict[str, Any]]:
        """Resolve chip IDs and recognizable free-text terms without assuming NLP."""
        profiles: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        for raw_interest in interests:
            display = raw_interest.strip()
            normalized = cls._normalize_text(display)
            if not normalized:
                continue

            exact_key = PREFERENCE_ALIASES.get(normalized)
            keys = [exact_key] if exact_key else [
                key
                for key, terms in PREFERENCE_TERMS.items()
                if any(cls._contains_term(normalized, term) for term in terms)
            ]
            keys = list(dict.fromkeys(key for key in keys if key))
            signature = (normalized, ",".join(keys))
            if signature in seen:
                continue
            seen.add(signature)
            query_parts = [display]
            query_parts.extend(PREFERENCE_EXPANSIONS[key] for key in keys)
            profiles.append({
                "display": display,
                "keys": keys,
                "query": " ".join(query_parts),
            })
        return profiles

    @classmethod
    def _direct_interest_match(
        cls,
        poi: Mapping[str, Any],
        profile: Mapping[str, Any],
    ) -> float:
        """Return field-backed taxonomy/text evidence for one submitted interest."""
        metadata = poi.get("ai_metadata")
        if isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except json.JSONDecodeError:
                metadata = None

        metadata_tags = (
            {
                key: metadata.get(key)
                for key in ("dna_tags", "tags", "vibes", "activity_tags", "experience_tags")
                if metadata.get(key) is not None
            }
            if isinstance(metadata, Mapping)
            else None
        )
        taxonomy_fields = (
            (poi.get("category_name") or poi.get("category"), 1.0),
            (poi.get("sub_category"), 1.0),
            (poi.get("vibes"), 0.85),
            (
                poi.get("dna_tags") or (
                    metadata.get("dna_tags") if isinstance(metadata, Mapping) else None
                ),
                0.85,
            ),
            (metadata_tags, 0.85),
            (poi.get("local_business_type"), 0.75),
        )
        name_text = cls._flatten_value(poi.get("name"))
        description_text = cls._flatten_value(poi.get("description"))

        best_match = 0.0
        for key in profile.get("keys", []):
            for term in PREFERENCE_TERMS.get(key, ()):
                is_associated_coastal_term = (
                    key == "beach" and term in _COASTAL_ASSOCIATED_BEACH_TERMS
                )
                term_strength = 0.65 if is_associated_coastal_term else 1.0
                for field_value, field_weight in taxonomy_fields:
                    if cls._contains_term(cls._flatten_value(field_value), term):
                        best_match = max(
                            best_match,
                            term_strength * field_weight,
                        )
                if cls._contains_term(name_text, term):
                    best_match = max(
                        best_match,
                        0.75 if is_associated_coastal_term else 0.85,
                    )
                if cls._contains_term(description_text, term):
                    best_match = max(
                        best_match,
                        0.50 if is_associated_coastal_term else 0.65,
                    )
        return best_match

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
            normalized = ContentBasedRecommender._normalize_text(cleaned)
            exact_key = PREFERENCE_ALIASES.get(normalized)
            if exact_key:
                expanded.append(PREFERENCE_EXPANSIONS[exact_key])
                continue
            matched_keys = [
                key
                for key, terms in PREFERENCE_TERMS.items()
                if any(
                    ContentBasedRecommender._contains_term(normalized, term)
                    for term in terms
                )
            ]
            expanded.extend(PREFERENCE_EXPANSIONS[key] for key in matched_keys)
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
        budget_target_per_person: float | None = None,
        budget_tier_preference: str | None = None,
    ) -> list[dict[str, Any]]:
        """Apply explicit PB08 hard filters and return candidates in score order.

        ``min_eco_score`` is expressed on a 0-100 scale; POI green scores are
        stored on a 0-1 scale. Every candidate needs a finite, nonnegative
        per-person ``estimated_cost``. ``max_budget`` is an individual
        per-person ceiling in VND. ``budget_target_per_person`` adds a soft PB07
        budget-fit contribution and never removes an otherwise eligible POI.
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

        budget_target: float | None = None
        if budget_target_per_person is not None:
            budget_target = self._number(budget_target_per_person, default=float("nan"))
            if not math.isfinite(budget_target) or budget_target <= 0.0:
                raise ValueError("budget_target_per_person must be a finite positive VND amount")
        preference_tier = REQUEST_BUDGET_TIER_LEVELS.get(
            str(budget_tier_preference or "").strip().casefold()
        )

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
        text_matrix = self.feature_matrix[:, : self._text_feature_count]
        profiles = self._interest_profiles(user_interests)
        profile_similarities: list[list[float]] = []
        for profile in profiles:
            user_vector = self.build_user_vector([profile["query"]], self.vectorizer)
            profile_similarities.append(
                cosine_similarity(
                    user_vector,
                    text_matrix[active_indices],
                    dense_output=True,
                )[0].tolist()
            )

        ranked: list[dict[str, Any]] = []
        for poi_index, (poi, popularity_score) in enumerate(zip(active_pois, popularity)):
            interest_scores: list[float] = []
            for profile_index, profile in enumerate(profiles):
                direct_score = self._direct_interest_match(poi, profile)
                semantic_score = profile_similarities[profile_index][poi_index]
                semantic_match = (
                    min(0.70, semantic_score)
                    if semantic_score >= _MIN_TEXT_SIMILARITY
                    else 0.0
                )
                interest_scores.append(max(direct_score, semantic_match))

            # When a traveler supplied preferences, unrelated POIs are not
            # surfaced as if they were personalized recommendations.
            if profiles and not any(score > 0.0 for score in interest_scores):
                continue

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
            preference_score = (
                sum(interest_scores) / len(interest_scores) if interest_scores else 0.0
            )
            budget_fit_score = (
                1.0 / (1.0 + abs(cost_value - budget_target) / budget_target)
                if budget_target is not None
                else None
            )
            budget_fit_source = "validated_trip_daily_budget"
            if budget_fit_score is None and preference_tier is not None:
                poi_tier = str(poi.get("budget_tier") or "").strip().casefold()
                poi_tier_level = POI_BUDGET_TIER_LEVELS.get(poi_tier)
                if poi_tier_level is not None:
                    budget_fit_score = 1.0 / (1.0 + abs(poi_tier_level - preference_tier))
                    budget_fit_source = "poi_budget_tier"
            budget_weight = (
                (0.05 if profiles else 0.10)
                if budget_fit_score is not None
                else 0.0
            )
            if profiles:
                # Preference relevance owns 90%; all PB08/PB07 secondary
                # signals together can contribute at most 10%.
                preference_weight = 0.90
                remaining_weight = 1.0 - preference_weight - budget_weight
                green_contribution = remaining_weight * green_weight * green_score
                quality_weight = remaining_weight * (1.0 - green_weight)
                satisfaction_contribution = quality_weight * (5.0 / 7.0) * satisfaction
                popularity_contribution = quality_weight * (2.0 / 7.0) * popularity_score
                preference_contribution = preference_weight * preference_score
                budget_contribution = budget_weight * (budget_fit_score or 0.0)
                hybrid_score = (
                    preference_contribution
                    + green_contribution
                    + satisfaction_contribution
                    + popularity_contribution
                    + budget_contribution
                )
                algorithm = "preference_first_hybrid"
            else:
                non_budget_weight = 1.0 - budget_weight
                satisfaction_contribution = non_budget_weight * (1.0 - green_weight) * 0.25 * satisfaction
                popularity_contribution = non_budget_weight * (1.0 - green_weight) * 0.10 * popularity_score
                green_contribution = non_budget_weight * green_weight * green_score
                preference_contribution = 0.0
                budget_contribution = budget_weight * (budget_fit_score or 0.0)
                hybrid_score = (
                    satisfaction_contribution
                    + popularity_contribution
                    + green_contribution
                    + budget_contribution
                )
                algorithm = "content_quality_green"

            ranked_poi = dict(poi)
            ranked_poi["match_score"] = min(100.0, max(0.0, hybrid_score * 100.0))
            ranked_poi["resolved_green_score"] = green_score
            ranked_poi["matched_interests"] = [
                profile["display"]
                for profile, score in zip(profiles, interest_scores)
                if score > 0.0
            ]
            ranked_poi["_interest_scores"] = {
                index: score
                for index, score in enumerate(interest_scores)
                if score > 0.0
            }
            ranked_poi["_primary_interest_index"] = (
                max(
                    range(len(interest_scores)),
                    key=lambda index: (interest_scores[index], -index),
                )
                if interest_scores
                else None
            )
            raw_green_score = self._number(poi.get("green_score"), default=float("nan"))
            green_source = (
                "poi_green_score"
                if math.isfinite(raw_green_score)
                else "local_business_proxy"
                if poi.get("is_local_business") is True
                else "default_proxy"
            )
            ranked_poi["score_breakdown"] = {
                "algorithm": algorithm,
                "matched_interests": ranked_poi["matched_interests"],
                "factors": [
                    {
                        "key": "preference_similarity",
                        "label": "Mức phù hợp sở thích (taxonomy + TF-IDF/Cosine)",
                        "contribution_points": preference_contribution * 100.0,
                        "normalized_value": preference_score,
                        "source": "taxonomy_and_tfidf" if profiles else "no_preferences",
                    },
                    {
                        "key": "satisfaction",
                        "label": "Điểm hài lòng",
                        "contribution_points": satisfaction_contribution * 100.0,
                        "normalized_value": satisfaction,
                        "source": "poi_rating"
                        if math.isfinite(self._number(poi.get("satisfaction_score"), default=float("nan")))
                        else "missing_default_zero",
                    },
                    {
                        "key": "relative_popularity",
                        "label": "Mức phổ biến tương đối trong tập POI",
                        "contribution_points": popularity_contribution * 100.0,
                        "normalized_value": popularity_score,
                    },
                    {
                        "key": "green_score",
                        "label": "Điểm xanh nội bộ PB09",
                        "contribution_points": green_contribution * 100.0,
                        "normalized_value": green_score,
                        "source": green_source,
                    },
                    *([{
                        "key": "budget_alignment",
                        "label": "Mức phù hợp với ngân sách tham khảo mỗi ngày",
                        "contribution_points": budget_contribution * 100.0,
                        "normalized_value": budget_fit_score,
                        "source": budget_fit_source,
                    }] if budget_fit_score is not None else []),
                ],
            }
            ranked.append(ranked_poi)

        ranked.sort(
            key=lambda item: (-item["match_score"], str(item.get("poi_id", "")))
        )
        if profiles:
            balanced: list[dict[str, Any]] = []
            selected_ids: set[str] = set()
            # Assign each POI to its strongest interest so a multi-match item
            # cannot fill more than one group in the balanced result order.
            groups = [
                [item for item in ranked if item["_primary_interest_index"] == index]
                for index in range(len(profiles))
            ]
            while any(groups):
                remaining_groups: list[list[dict[str, Any]]] = []
                for group in groups:
                    candidate = next(
                        (
                            item for item in group
                            if str(item.get("poi_id", "")) not in selected_ids
                        ),
                        None,
                    )
                    if candidate is not None:
                        balanced.append(candidate)
                        selected_ids.add(str(candidate.get("poi_id", "")))
                        remaining_groups.append([
                            item for item in group
                            if str(item.get("poi_id", "")) not in selected_ids
                        ])
                    else:
                        remaining_groups.append([])
                if remaining_groups == groups:
                    break
                groups = remaining_groups
            ranked = balanced
        for item in ranked:
            item.pop("_interest_scores", None)
            item.pop("_primary_interest_index", None)
        return ranked if top_k is None else ranked[:top_k]

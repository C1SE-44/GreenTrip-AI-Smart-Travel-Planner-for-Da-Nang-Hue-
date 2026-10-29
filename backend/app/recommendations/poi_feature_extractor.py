"""Build combined text and numeric features for points of interest."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler


class POIFeatureExtractor:
    """Fit reusable text and numeric transforms for a POI collection.

    Text features include category, sub-category, description, vibes, and DNA
    tags from ``ai_metadata``. Missing text is treated as empty. Missing cost or
    satisfaction values default to zero; a missing green score uses 0.8 for a
    local business and 0.5 otherwise.
    """

    def __init__(self) -> None:
        self.vectorizer = TfidfVectorizer(strip_accents="unicode", ngram_range=(1, 2))
        self.scaler = MinMaxScaler()

    @staticmethod
    def _text(value: Any) -> str:
        """Convert a nullable value to stripped text."""
        return value.strip() if isinstance(value, str) else ""

    @classmethod
    def _flatten_text(cls, value: Any) -> str:
        """Flatten JSON, array, and scalar tags into searchable text."""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, Mapping):
            return " ".join(
                part
                for key, item in value.items()
                for part in (cls._flatten_text(key), cls._flatten_text(item))
                if part
            )
        if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            return " ".join(part for item in value if (part := cls._flatten_text(item)))
        return ""

    @staticmethod
    def _number(value: Any, *, default: float, field: str) -> float:
        """Convert a nullable numeric value, rejecting malformed values."""
        if value is None:
            return default
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"POI field {field!r} must be numeric or null") from exc
        return number if math.isfinite(number) else default

    def _prepare(
        self, poi_list: Sequence[Mapping[str, Any]]
    ) -> tuple[list[str], np.ndarray, list[Any]]:
        if not poi_list:
            raise ValueError("poi_list must contain at least one POI")

        text_corpus: list[str] = []
        numerical_rows: list[list[float]] = []
        poi_ids: list[Any] = []

        for index, poi in enumerate(poi_list):
            if not isinstance(poi, Mapping):
                raise TypeError(f"POI at index {index} must be a mapping")

            metadata = poi.get("ai_metadata")
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = None
            dna_tags = metadata.get("dna_tags") if isinstance(metadata, Mapping) else None
            pieces = (
                self._text(poi.get("description")),
                self._text(poi.get("category_name") or poi.get("category")),
                self._text(poi.get("sub_category")),
                self._flatten_text(poi.get("vibes")),
                self._flatten_text(poi.get("dna_tags") or dna_tags),
                self._text(poi.get("local_business_type")),
            )
            text_corpus.append(" ".join(piece for piece in pieces if piece) or "unknownpoi")

            is_local_business = poi.get("is_local_business") is True
            green_default = 0.8 if is_local_business else 0.5
            numerical_rows.append(
                [
                    self._number(
                        poi.get("estimated_cost"),
                        default=0.0,
                        field="estimated_cost",
                    ),
                    self._number(
                        poi.get("satisfaction_score"),
                        default=0.0,
                        field="satisfaction_score",
                    ),
                    self._number(
                        poi.get("green_score"),
                        default=green_default,
                        field="green_score",
                    ),
                ]
            )
            poi_ids.append(poi.get("poi_id"))

        return text_corpus, np.asarray(numerical_rows, dtype=float), poi_ids

    def fit_transform(
        self, poi_list: list[dict[str, Any]]
    ) -> tuple[csr_matrix, list[Any], TfidfVectorizer, MinMaxScaler]:
        """Fit both transforms and return row-aligned sparse features.

        The returned matrix contains TF-IDF columns followed by three
        MinMax-scaled numerical columns. The fitted vectorizer and scaler are
        returned so callers can reuse the same feature spaces.
        """
        text_corpus, numerical_values, poi_ids = self._prepare(poi_list)
        text_matrix = self.vectorizer.fit_transform(text_corpus)
        numerical_matrix = self.scaler.fit_transform(numerical_values)
        feature_matrix = hstack(
            (text_matrix, csr_matrix(numerical_matrix)),
            format="csr",
        )
        return feature_matrix, poi_ids, self.vectorizer, self.scaler


if __name__ == "__main__":
    mock_pois = [
        {
            "poi_id": "poi-001",
            "description": "Ancient citadel and heritage site",
            "category_name": "Lịch sử & Di sản",
            "local_business_type": None,
            "estimated_cost": 50_000,
            "satisfaction_score": 4.7,
            "is_local_business": False,
            "green_score": None,
        },
        {
            "poi_id": "poi-002",
            "description": "Local restaurant serving regional food",
            "category_name": "Ẩm thực",
            "local_business_type": "Family restaurant",
            "estimated_cost": 120_000,
            "satisfaction_score": 4.5,
            "is_local_business": True,
            "green_score": None,
        },
    ]
    matrix, ids, _, _ = POIFeatureExtractor().fit_transform(mock_pois)
    print(f"POIs: {len(ids)}, feature matrix shape: {matrix.shape}")

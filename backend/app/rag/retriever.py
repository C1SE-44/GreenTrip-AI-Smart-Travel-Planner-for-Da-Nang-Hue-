"""Semantic and hybrid retrieval engine for GreenTrip travel knowledge."""

from __future__ import annotations

import logging
import re
from typing import Any
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.rag.schemas import DocumentChunk, RetrievedChunk
from app.trips.text_utils import strip_vietnamese_accents

logger = logging.getLogger(__name__)


def _normalize_text_for_search(text: str) -> str:
    """Normalize Vietnamese text for consistent keyword and n-gram matching."""
    lower = text.lower().strip()
    # remove excessive punctuation while keeping accents
    cleaned = re.sub(r"[^\w\s\d]", " ", lower)
    return re.sub(r"\s+", " ", cleaned).strip()


class RAGRetriever:
    """
    Configurable Knowledge Retriever for Central Vietnam green tourism.
    Combines TF-IDF n-gram semantic matching with metadata filtering.
    """

    def __init__(self, chunks: list[DocumentChunk] | None = None) -> None:
        self.chunks: list[DocumentChunk] = []
        self.vectorizer: TfidfVectorizer | None = None
        self.tfidf_matrix: Any = None
        if chunks:
            self.index_chunks(chunks)

    def index_chunks(self, chunks: list[DocumentChunk]) -> None:
        """Build TF-IDF vocabulary matrix across all chunk contents."""
        self.chunks = list(chunks)
        if not self.chunks:
            self.vectorizer = None
            self.tfidf_matrix = None
            return

        corpus = [
            f"{c.title} {c.city} {c.category} {c.content}"
            for c in self.chunks
        ]

        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            min_df=1,
            max_df=0.95,
        )
        self.tfidf_matrix = self.vectorizer.fit_transform(corpus)
        logger.info("Indexed %d chunks with vocabulary size %d", len(self.chunks), len(self.vectorizer.vocabulary_))

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        city_filter: str | None = None,
        category_filter: str | None = None,
        min_score: float = 0.05,
    ) -> list[RetrievedChunk]:
        """
        Retrieve top_k most relevant chunks matching the user's travel query.
        Returns empty list if query is empty or no relevant knowledge is found.
        """
        cleaned_query = _normalize_text_for_search(query)
        if not cleaned_query or not self.chunks or self.vectorizer is None or self.tfidf_matrix is None:
            return []

        try:
            query_vec = self.vectorizer.transform([cleaned_query])
            sim_scores = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        except Exception as e:
            logger.warning("Error computing similarity vector: %s", e)
            return []

        # Optional boosting: boost if title or city has exact term match
        query_unaccented = strip_vietnamese_accents(cleaned_query).lower()
        city_filter_clean = city_filter.strip().lower() if city_filter else None
        cat_filter_clean = category_filter.strip().lower() if category_filter else None

        results: list[tuple[float, DocumentChunk]] = []

        for idx, chunk in enumerate(self.chunks):
            raw_score = float(sim_scores[idx])

            # Apply city filter if specified
            if city_filter_clean:
                chunk_city = chunk.city.lower()
                if (
                    city_filter_clean in ["danang", "da nang", "đà nẵng"]
                    and "da nang" not in chunk_city
                    and "đà nẵng" not in chunk_city
                    and chunk.city != "all"
                ):
                    continue
                if (
                    city_filter_clean in ["hue", "huế"]
                    and "hue" not in chunk_city
                    and "huế" not in chunk_city
                    and chunk.city != "all"
                ):
                    continue

            # Apply category filter if specified
            if cat_filter_clean and cat_filter_clean not in chunk.category.lower():
                continue

            # Exact title or keyword bonus
            title_unaccented = strip_vietnamese_accents(chunk.title).lower()
            if query_unaccented in title_unaccented or title_unaccented in query_unaccented:
                raw_score += 0.25

            final_score = min(1.0, max(0.0, raw_score))
            if final_score >= min_score:
                results.append((final_score, chunk))

        # Sort descending by score
        results.sort(key=lambda x: x[0], reverse=True)
        top_results = results[:top_k]

        output: list[RetrievedChunk] = []
        for score, chunk in top_results:
            snippet = chunk.content
            if len(snippet) > 300:
                snippet = snippet[:297] + "..."
            output.append(
                RetrievedChunk(
                    chunk_id=chunk.chunk_id,
                    doc_id=chunk.doc_id,
                    title=chunk.title,
                    city=chunk.city,
                    category=chunk.category,
                    snippet=snippet,
                    source=chunk.source,
                    score=round(score, 4),
                    poi_id=chunk.poi_id,
                    metadata=chunk.metadata,
                )
            )

        return output

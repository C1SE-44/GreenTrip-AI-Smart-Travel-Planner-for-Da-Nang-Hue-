"""High-level RAG service interface for GreenTrip assistant."""

from __future__ import annotations

import logging
from typing import Any

from app.rag.normalizer import load_curated_travel_knowledge
from app.rag.retriever import RAGRetriever
from app.rag.schemas import RAGSearchResult

logger = logging.getLogger(__name__)

_rag_service_instance: RAGService | None = None


class RAGService:
    """Manages document ingestion, indexing, and semantic search."""

    def __init__(self, auto_load: bool = True) -> None:
        self.retriever = RAGRetriever()
        if auto_load:
            self.reload()

    def reload(self) -> int:
        """Reload curated datasets and re-index the retriever."""
        chunks = load_curated_travel_knowledge()
        self.retriever.index_chunks(chunks)
        return len(chunks)

    def search(
        self,
        query: str,
        city: str | None = None,
        category: str | None = None,
        top_k: int = 5,
    ) -> RAGSearchResult:
        """Search curated travel documents and return ranked snippets with citations."""
        results = self.retriever.retrieve(
            query=query,
            top_k=top_k,
            city_filter=city,
            category_filter=category,
        )
        return RAGSearchResult(
            query=query,
            total_found=len(results),
            chunks=results,
        )


def get_rag_service() -> RAGService:
    """Retrieve the global RAG service singleton."""
    global _rag_service_instance
    if _rag_service_instance is None:
        _rag_service_instance = RAGService(auto_load=True)
    return _rag_service_instance

"""Pydantic schemas for GreenTrip RAG Foundation."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class DocumentChunk(BaseModel):
    """Represents an atomic, verified knowledge chunk for retrieval."""

    chunk_id: str = Field(description="Unique identifier of the chunk")
    doc_id: str = Field(description="Identifier of parent document or POI")
    title: str = Field(description="Title of the POI or document topic")
    city: str = Field(default="all", description="City: Danang, Hue, or all")
    category: str = Field(default="general", description="Category of the attraction or knowledge")
    content: str = Field(description="Descriptive text content")
    source: str = Field(description="Curated source file reference")
    poi_id: str | None = Field(default=None, description="Optional foreign reference to POI UUID in database")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional verified metadata (eco features, tips)")


class RetrievedChunk(BaseModel):
    """Represents a chunk retrieved by semantic or hybrid search with confidence score."""

    chunk_id: str
    doc_id: str
    title: str
    city: str
    category: str
    snippet: str
    source: str
    score: float = Field(ge=0.0, le=1.0, description="Relevance score normalized between 0.0 and 1.0")
    poi_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RAGSearchResult(BaseModel):
    """Structured response container for RAG search queries."""

    query: str
    total_found: int
    chunks: list[RetrievedChunk] = Field(default_factory=list)

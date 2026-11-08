from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.pois.schemas import POIResponse


class SavePlaceRequest(BaseModel):
    poi_id: UUID


class SavedPlaceItem(POIResponse):
    saved_at: datetime


class SavedPlacesResponse(BaseModel):
    items: list[SavedPlaceItem]


class SavedPlaceMutationResponse(BaseModel):
    poi_id: UUID
    saved: bool
    changed: bool


class SavedPlaceCollection(BaseModel):
    collection_id: UUID
    name: str
    is_default: bool
    created_at: datetime
    place_count: int
    cover_images: list[str]
    contains_poi: bool = False


class SavedPlaceCollectionsResponse(BaseModel):
    items: list[SavedPlaceCollection]


class CollectionNameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class SavedPlaceCollectionMutationResponse(BaseModel):
    collection_id: UUID
    changed: bool = True


class CollectionPlaceMutationResponse(BaseModel):
    collection_id: UUID
    poi_id: UUID
    saved: bool
    changed: bool

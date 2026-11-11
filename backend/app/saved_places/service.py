from uuid import UUID

from app.saved_places import collections_repository
from app.saved_places.repository import list_saved_places, remove_place, save_place
from app.saved_places.schemas import SavedPlaceCollection
from app.saved_places.schemas import SavedPlaceItem


def get_saved_places(
    user_id: UUID, collection_id: UUID | None = None
) -> list[SavedPlaceItem]:
    return list_saved_places(user_id, collection_id)


def add_saved_place(user_id: UUID, poi_id: UUID) -> bool:
    return save_place(user_id, poi_id)


def delete_saved_place(user_id: UUID, poi_id: UUID) -> bool:
    return remove_place(user_id, poi_id)


def get_saved_place_collections(
    user_id: UUID, poi_id: UUID | None = None
) -> list[SavedPlaceCollection]:
    return [
        SavedPlaceCollection(**item)
        for item in collections_repository.list_collections(user_id, poi_id)
    ]


def create_saved_place_collection(user_id: UUID, name: str) -> UUID:
    return collections_repository.create_collection(user_id, name)


def rename_saved_place_collection(user_id: UUID, collection_id: UUID, name: str) -> bool:
    return collections_repository.rename_collection(user_id, collection_id, name)


def delete_saved_place_collection(user_id: UUID, collection_id: UUID) -> None:
    collections_repository.delete_collection(user_id, collection_id)


def saved_place_collection_exists(user_id: UUID, collection_id: UUID) -> bool:
    return collections_repository.collection_belongs_to_user(user_id, collection_id)


def add_place_to_collection(user_id: UUID, collection_id: UUID, poi_id: UUID) -> bool:
    return collections_repository.add_place_to_collection(user_id, collection_id, poi_id)


def remove_place_from_collection(
    user_id: UUID, collection_id: UUID, poi_id: UUID
) -> tuple[bool, bool]:
    return collections_repository.remove_place_from_collection(user_id, collection_id, poi_id)

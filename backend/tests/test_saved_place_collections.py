from pathlib import Path
import sys
from typing import Any
from uuid import UUID, uuid4

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.saved_places import collections_repository as repository


class CollectionDatabase:
    def __init__(self) -> None:
        self.pois: set[UUID] = set()
        self.collections: dict[tuple[UUID, UUID], tuple[str, bool]] = {}
        self.defaults: dict[UUID, UUID] = {}
        self.items: set[tuple[UUID, UUID, UUID]] = set()

    def connect(self) -> "CollectionConnection":
        return CollectionConnection(self)


class CollectionConnection:
    def __init__(self, database: CollectionDatabase) -> None:
        self.database = database

    def __enter__(self) -> "CollectionConnection":
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        return None

    def cursor(self) -> "CollectionCursor":
        return CollectionCursor(self.database)

    def commit(self) -> None:
        return None


class CollectionCursor:
    def __init__(self, database: CollectionDatabase) -> None:
        self.database = database
        self.rows: list[tuple[Any, ...]] = []

    def __enter__(self) -> "CollectionCursor":
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        return None

    def execute(self, query: str, parameters: tuple[Any, ...] | None = None) -> None:
        params = parameters or ()
        sql = " ".join(query.split())
        if "INSERT INTO public.saved_place_collections" in sql and "'Địa điểm của tôi'" in sql:
            user_id = UUID(str(params[0]))
            collection_id = self.database.defaults.get(user_id)
            if collection_id is None:
                collection_id = uuid4()
                self.database.defaults[user_id] = collection_id
                self.database.collections[(user_id, collection_id)] = ("Địa điểm của tôi", True)
            self.rows = [(collection_id,)]
        elif sql.startswith("INSERT INTO public.saved_place_collections"):
            user_id = UUID(str(params[0]))
            collection_id = uuid4()
            self.database.collections[(user_id, collection_id)] = (str(params[1]), False)
            self.rows = [(collection_id,)]
        elif sql.startswith("SELECT c.collection_id"):
            poi_id = UUID(str(params[0])) if params[0] else None
            user_id = UUID(str(params[1]))
            rows = []
            for (owner_id, collection_id), (name, is_default) in self.database.collections.items():
                if owner_id != user_id:
                    continue
                memberships = [item for item in self.database.items if item[:2] == (user_id, collection_id)]
                rows.append((
                    collection_id,
                    name,
                    is_default,
                    None,
                    len(memberships),
                    [],
                    any(item[2] == poi_id for item in memberships) if poi_id else False,
                ))
            self.rows = rows
        elif sql.startswith("SELECT collection_id, is_default"):
            key = (UUID(str(params[0])), UUID(str(params[1])))
            collection = self.database.collections.get(key)
            self.rows = [(key[1], collection[1])] if collection else []
        elif sql.startswith("SELECT 1 FROM public.saved_place_collections"):
            key = (UUID(str(params[0])), UUID(str(params[1])))
            self.rows = [(1,)] if key in self.database.collections else []
        elif sql.startswith("SELECT poi_id FROM public.pois") or sql.startswith("SELECT 1 FROM public.pois"):
            poi_id = UUID(str(params[0]))
            self.rows = [(1,)] if poi_id in self.database.pois else []
        elif sql.startswith("INSERT INTO public.saved_place_collection_items") and "SELECT user_id" in sql:
            default_id, user_id, source_collection_id = (UUID(str(value)) for value in params)
            moving = [item for item in self.database.items if item[:2] == (user_id, source_collection_id)]
            self.database.items.update((user_id, default_id, item[2]) for item in moving)
            self.rows = []
        elif sql.startswith("INSERT INTO public.saved_place_collection_items"):
            user_id, collection_id, poi_id = (UUID(str(value)) for value in params)
            key = (user_id, collection_id, poi_id)
            inserted = poi_id in self.database.pois and key not in self.database.items
            if inserted:
                self.database.items.add(key)
                self.rows = [(poi_id,)]
            else:
                self.rows = []
        elif sql.startswith("DELETE FROM public.saved_place_collection_items"):
            key = tuple(UUID(str(value)) for value in params)
            removed = key in self.database.items
            self.database.items.discard(key)
            self.rows = [(key[2],)] if removed else []
        elif sql.startswith("SELECT 1 FROM public.saved_place_collection_items"):
            user_id, poi_id = (UUID(str(value)) for value in params)
            self.rows = [(1,)] if any(item[0] == user_id and item[2] == poi_id for item in self.database.items) else []
        elif sql.startswith("UPDATE public.saved_place_collections"):
            name, user_id_value, collection_id_value = params
            key = (UUID(str(user_id_value)), UUID(str(collection_id_value)))
            if key in self.database.collections:
                self.database.collections[key] = (str(name), self.database.collections[key][1])
                self.rows = [(key[1],)]
            else:
                self.rows = []
        elif sql.startswith("DELETE FROM public.saved_place_collections"):
            user_id, collection_id = (UUID(str(value)) for value in params)
            key = (user_id, collection_id)
            removed = key in self.database.collections
            self.database.collections.pop(key, None)
            self.database.items = {item for item in self.database.items if item[0] != user_id or item[1] != collection_id}
            self.rows = [(collection_id,)] if removed else []
        else:
            raise AssertionError(f"Unexpected collection query: {sql}")

    def fetchone(self) -> tuple[Any, ...] | None:
        return self.rows[0] if self.rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self.rows


@pytest.fixture
def collection_database(monkeypatch: pytest.MonkeyPatch) -> CollectionDatabase:
    database = CollectionDatabase()
    monkeypatch.setattr(repository, "get_connection", database.connect)
    return database


def test_one_poi_can_belong_to_multiple_collections_and_only_unsaves_after_last_removal(
    collection_database: CollectionDatabase,
) -> None:
    owner = uuid4()
    poi_id = uuid4()
    collection_database.pois.add(poi_id)
    default_id = repository.list_collections(owner)[0]["collection_id"]
    first_id = repository.create_collection(owner, "Ăn uống")
    second_id = repository.create_collection(owner, "Muốn ghé")

    assert repository.add_place_to_collection(owner, first_id, poi_id) is True
    assert repository.add_place_to_collection(owner, second_id, poi_id) is True
    assert (owner, first_id, poi_id) in collection_database.items
    assert (owner, second_id, poi_id) in collection_database.items

    assert repository.remove_place_from_collection(owner, first_id, poi_id) == (True, True)
    assert repository.remove_place_from_collection(owner, second_id, poi_id) == (True, False)
    assert (owner, default_id, poi_id) not in collection_database.items


def test_deleting_collection_moves_its_places_to_default_and_default_cannot_be_deleted(
    collection_database: CollectionDatabase,
) -> None:
    owner = uuid4()
    poi_id = uuid4()
    collection_database.pois.add(poi_id)
    default_id = repository.list_collections(owner)[0]["collection_id"]
    collection_id = repository.create_collection(owner, "Cuối tuần")
    repository.add_place_to_collection(owner, collection_id, poi_id)

    repository.delete_collection(owner, collection_id)

    assert (owner, default_id, poi_id) in collection_database.items
    assert poi_id in collection_database.pois
    with pytest.raises(repository.DefaultCollectionError):
        repository.delete_collection(owner, default_id)


def test_collection_queries_are_scoped_to_authenticated_owner(collection_database: CollectionDatabase) -> None:
    owner, other_user = uuid4(), uuid4()
    poi_id = uuid4()
    collection_database.pois.add(poi_id)
    owner_collection = repository.create_collection(owner, "A")
    other_collection = repository.create_collection(other_user, "B")
    repository.add_place_to_collection(owner, owner_collection, poi_id)

    owner_items = repository.list_collections(owner, poi_id)
    other_items = repository.list_collections(other_user, poi_id)

    assert [item["collection_id"] for item in owner_items] == [collection_database.defaults[owner], owner_collection]
    assert [item["collection_id"] for item in other_items] == [collection_database.defaults[other_user], other_collection]
    assert all(item["contains_poi"] is False for item in other_items)

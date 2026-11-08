from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth.dependencies import get_current_user_id
from app.saved_places.collections_repository import (
    CollectionNotFoundError,
    DefaultCollectionError,
    InvalidCollectionNameError,
)
from app.saved_places.repository import POINotFoundError
from app.saved_places.schemas import (
    CollectionNameRequest,
    CollectionPlaceMutationResponse,
    SavePlaceRequest,
    SavedPlaceCollectionMutationResponse,
    SavedPlaceCollectionsResponse,
    SavedPlaceMutationResponse,
    SavedPlacesResponse,
)
from app.saved_places.service import (
    add_place_to_collection,
    add_saved_place,
    create_saved_place_collection,
    delete_saved_place,
    delete_saved_place_collection,
    get_saved_place_collections,
    get_saved_places,
    remove_place_from_collection,
    rename_saved_place_collection,
    saved_place_collection_exists,
)


router = APIRouter(prefix="/saved-places", tags=["Saved Places"])


def _account_id(user_id: str) -> UUID:
    try:
        return UUID(user_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản trong phiên đăng nhập không hợp lệ.",
        ) from exc


def _collection_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="KhÃ´ng tÃ¬m tháº¥y bá»™ sÆ°u táº­p nÃ y.",
    )


@router.get("/collections", response_model=SavedPlaceCollectionsResponse)
def list_current_user_collections(
    poi_id: UUID | None = None,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlaceCollectionsResponse:
    return SavedPlaceCollectionsResponse(
        items=get_saved_place_collections(_account_id(user_id), poi_id)
    )


@router.post(
    "/collections",
    response_model=SavedPlaceCollectionMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_current_user_collection(
    request: CollectionNameRequest,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlaceCollectionMutationResponse:
    try:
        collection_id = create_saved_place_collection(_account_id(user_id), request.name)
    except InvalidCollectionNameError as exc:
        raise HTTPException(status_code=422, detail="Nháº­p tÃªn bá»™ sÆ°u táº­p tá»« 1 Ä‘áº¿n 80 kÃ½ tá»±.") from exc
    return SavedPlaceCollectionMutationResponse(collection_id=collection_id)


@router.get("/collections/{collection_id}/places", response_model=SavedPlacesResponse)
def list_current_user_collection_places(
    collection_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlacesResponse:
    account_id = _account_id(user_id)
    if not saved_place_collection_exists(account_id, collection_id):
        raise _collection_not_found()
    return SavedPlacesResponse(items=get_saved_places(account_id, collection_id))


@router.post(
    "/collections/{collection_id}/places/{poi_id}",
    response_model=CollectionPlaceMutationResponse,
)
def add_current_user_place_to_collection(
    collection_id: UUID,
    poi_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> CollectionPlaceMutationResponse:
    try:
        changed = add_place_to_collection(_account_id(user_id), collection_id, poi_id)
    except CollectionNotFoundError as exc:
        raise _collection_not_found() from exc
    except POINotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="KhÃ´ng tÃ¬m tháº¥y Ä‘á»‹a Ä‘iá»ƒm nÃ y.",
        ) from exc
    return CollectionPlaceMutationResponse(
        collection_id=collection_id, poi_id=poi_id, saved=True, changed=changed
    )


@router.delete(
    "/collections/{collection_id}/places/{poi_id}",
    response_model=CollectionPlaceMutationResponse,
)
def remove_current_user_place_from_collection(
    collection_id: UUID,
    poi_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> CollectionPlaceMutationResponse:
    try:
        changed, is_saved = remove_place_from_collection(
            _account_id(user_id), collection_id, poi_id
        )
    except CollectionNotFoundError as exc:
        raise _collection_not_found() from exc
    return CollectionPlaceMutationResponse(
        collection_id=collection_id, poi_id=poi_id, saved=is_saved, changed=changed
    )


@router.patch(
    "/collections/{collection_id}",
    response_model=SavedPlaceCollectionMutationResponse,
)
def rename_current_user_collection(
    collection_id: UUID,
    request: CollectionNameRequest,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlaceCollectionMutationResponse:
    try:
        changed = rename_saved_place_collection(
            _account_id(user_id), collection_id, request.name
        )
    except CollectionNotFoundError as exc:
        raise _collection_not_found() from exc
    except InvalidCollectionNameError as exc:
        raise HTTPException(status_code=422, detail="Nháº­p tÃªn bá»™ sÆ°u táº­p tá»« 1 Ä‘áº¿n 80 kÃ½ tá»±.") from exc
    return SavedPlaceCollectionMutationResponse(collection_id=collection_id, changed=changed)


@router.delete(
    "/collections/{collection_id}",
    response_model=SavedPlaceCollectionMutationResponse,
)
def delete_current_user_collection(
    collection_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlaceCollectionMutationResponse:
    try:
        delete_saved_place_collection(_account_id(user_id), collection_id)
    except CollectionNotFoundError as exc:
        raise _collection_not_found() from exc
    except DefaultCollectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="KhÃ´ng thá»ƒ xÃ³a bá»™ sÆ°u táº­p máº·c Ä‘á»‹nh.",
        ) from exc
    return SavedPlaceCollectionMutationResponse(collection_id=collection_id, changed=True)


@router.get("", response_model=SavedPlacesResponse)
def list_current_user_saved_places(
    user_id: str = Depends(get_current_user_id),
) -> SavedPlacesResponse:
    return SavedPlacesResponse(items=get_saved_places(_account_id(user_id)))


@router.post(
    "",
    response_model=SavedPlaceMutationResponse,
    status_code=status.HTTP_200_OK,
)
def save_current_user_place(
    request: SavePlaceRequest,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlaceMutationResponse:
    try:
        changed = add_saved_place(_account_id(user_id), request.poi_id)
    except POINotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy địa điểm này.",
        ) from exc
    return SavedPlaceMutationResponse(poi_id=request.poi_id, saved=True, changed=changed)


@router.delete("/{poi_id}", response_model=SavedPlaceMutationResponse)
def remove_current_user_place(
    poi_id: UUID,
    user_id: str = Depends(get_current_user_id),
) -> SavedPlaceMutationResponse:
    changed = delete_saved_place(_account_id(user_id), poi_id)
    return SavedPlaceMutationResponse(poi_id=poi_id, saved=False, changed=changed)

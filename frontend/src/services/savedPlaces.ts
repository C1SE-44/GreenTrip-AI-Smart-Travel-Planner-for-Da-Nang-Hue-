import type { BackendPoiItem } from '@/data/pois';
import { fetchJson } from '@/lib/api';

export interface SavedPlace extends BackendPoiItem {
  id: string;
  saved_at: string;
}

export interface SavedPlacesResponse {
  items: SavedPlace[];
}

export interface SavedPlaceMutationResponse {
  poi_id: string;
  saved: boolean;
  changed: boolean;
}

export interface SavedPlaceCollection {
  collection_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  place_count: number;
  cover_images: string[];
  contains_poi: boolean;
}

export interface SavedPlaceCollectionsResponse {
  items: SavedPlaceCollection[];
}

export interface CollectionMutationResponse {
  collection_id: string;
  changed: boolean;
}

export interface CollectionPlaceMutationResponse {
  collection_id: string;
  poi_id: string;
  saved: boolean;
  changed: boolean;
}

export function getSavedPlaces(): Promise<SavedPlacesResponse> {
  return fetchJson<SavedPlacesResponse>('/saved-places');
}

export function getCollectionPlaces(collectionId: string): Promise<SavedPlacesResponse> {
  return fetchJson<SavedPlacesResponse>(
    `/saved-places/collections/${encodeURIComponent(collectionId)}/places`,
  );
}

export function getSavedCollections(poiId?: string): Promise<SavedPlaceCollectionsResponse> {
  const query = poiId ? `?poi_id=${encodeURIComponent(poiId)}` : '';
  return fetchJson<SavedPlaceCollectionsResponse>(`/saved-places/collections${query}`);
}

export function createSavedCollection(name: string): Promise<CollectionMutationResponse> {
  return fetchJson<CollectionMutationResponse>('/saved-places/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function renameSavedCollection(
  collectionId: string,
  name: string,
): Promise<CollectionMutationResponse> {
  return fetchJson<CollectionMutationResponse>(
    `/saved-places/collections/${encodeURIComponent(collectionId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
}

export function deleteSavedCollection(collectionId: string): Promise<CollectionMutationResponse> {
  return fetchJson<CollectionMutationResponse>(
    `/saved-places/collections/${encodeURIComponent(collectionId)}`,
    { method: 'DELETE' },
  );
}

export function addPlaceToCollection(
  collectionId: string,
  poiId: string,
): Promise<CollectionPlaceMutationResponse> {
  return fetchJson<CollectionPlaceMutationResponse>(
    `/saved-places/collections/${encodeURIComponent(collectionId)}/places/${encodeURIComponent(poiId)}`,
    { method: 'POST' },
  );
}

export function removePlaceFromCollection(
  collectionId: string,
  poiId: string,
): Promise<CollectionPlaceMutationResponse> {
  return fetchJson<CollectionPlaceMutationResponse>(
    `/saved-places/collections/${encodeURIComponent(collectionId)}/places/${encodeURIComponent(poiId)}`,
    { method: 'DELETE' },
  );
}

export function savePlace(poiId: string): Promise<SavedPlaceMutationResponse> {
  return fetchJson<SavedPlaceMutationResponse>('/saved-places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ poi_id: poiId }),
  });
}

export function removeSavedPlace(poiId: string): Promise<SavedPlaceMutationResponse> {
  return fetchJson<SavedPlaceMutationResponse>(`/saved-places/${encodeURIComponent(poiId)}`, {
    method: 'DELETE',
  });
}

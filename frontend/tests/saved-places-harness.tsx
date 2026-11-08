/* eslint-disable react-refresh/only-export-components -- Browser test entry point, not an HMR component module. */
import React from 'react';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Poi } from '../src/data/pois';
import SavedPlacesView from '../src/components/saved/SavedPlacesView';
import { SavedPlacesProvider, useSavedPlaces } from '../src/context/SavedPlacesContext';
import '../src/index.css';

const fixtures = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Bãi biển Mỹ Khê',
    category: 'Cảnh quan và thiên nhiên',
    city: 'Da Nang',
    description: 'Bãi biển tại Đà Nẵng.',
    latitude: 16.0544,
    longitude: 108.2422,
    address: 'Đà Nẵng',
    image_url: 'https://example.test/my-khe.jpg',
    satisfaction_score: 4.8,
    saved_count: 2,
    saved_at: '2026-11-08T08:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bún bò O Xuân',
    category: 'Ẩm thực và quán ăn',
    city: 'Da Nang',
    description: 'Món ăn địa phương tại Đà Nẵng.',
    latitude: 16.061,
    longitude: 108.227,
    address: 'Đà Nẵng',
    image_url: 'https://example.test/bun-bo.jpg',
    satisfaction_score: 4.5,
    saved_count: 1,
    saved_at: '2026-11-07T08:00:00Z',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Đại Nội Huế',
    category: 'Di tích lịch sử và văn hóa',
    city: 'Hue',
    description: 'Di tích lịch sử tại Huế.',
    latitude: null,
    longitude: null,
    address: 'Huế',
    image_url: 'https://example.test/dai-noi.jpg',
    satisfaction_score: 4.9,
    saved_count: 1,
    saved_at: '2026-11-06T08:00:00Z',
  },
];

const idsKey = 'saved_places_test_server_ids';
const collectionsKey = 'saved_places_test_collections';
const membershipsKey = 'saved_places_test_memberships';
const defaultCollectionId = 'collection-default';
const weekendCollectionId = 'collection-weekend';
if (sessionStorage.getItem(idsKey) === null) {
  const empty = new URLSearchParams(location.search).has('empty');
  sessionStorage.setItem(idsKey, JSON.stringify(empty ? [] : fixtures.map((place) => place.id)));
  sessionStorage.setItem(collectionsKey, JSON.stringify([
    { collection_id: defaultCollectionId, name: 'Địa điểm của tôi', is_default: true, created_at: '2026-11-01T00:00:00Z' },
    { collection_id: weekendCollectionId, name: 'Cuối tuần', is_default: false, created_at: '2026-11-02T00:00:00Z' },
  ]));
  sessionStorage.setItem(membershipsKey, JSON.stringify({
    [defaultCollectionId]: empty ? [] : fixtures.map((place) => place.id),
    [weekendCollectionId]: empty ? [] : [fixtures[0].id],
  }));
}
localStorage.setItem('access_token', 'saved-places-test-token');

const requests: Array<{ method: string; path: string; authorization: string | null }> = [];
Object.assign(window, { savedPlacesRequests: requests });
window.fetch = async (input, init) => {
  const url = new URL(String(input), location.href);
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  requests.push({ method, path: `${url.pathname}${url.search}`, authorization: headers.get('Authorization') });
  const ids = JSON.parse(sessionStorage.getItem(idsKey) || '[]') as string[];
  const collections = JSON.parse(sessionStorage.getItem(collectionsKey) || '[]') as Array<{ collection_id: string; name: string; is_default: boolean; created_at: string }>;
  const memberships = JSON.parse(sessionStorage.getItem(membershipsKey) || '{}') as Record<string, string[]>;

  if (url.pathname === '/saved-places' && method === 'GET') {
    if (sessionStorage.getItem('saved_places_test_fail_get') === '1') {
      sessionStorage.removeItem('saved_places_test_fail_get');
      return Response.json({ detail: 'temporary failure' }, { status: 503 });
    }
    return Response.json({ items: fixtures.filter((place) => ids.includes(place.id)) });
  }

  if (url.pathname === '/saved-places/collections' && method === 'GET') {
    const poiId = url.searchParams.get('poi_id');
    const items = collections.map((collection) => {
      const placeIds = memberships[collection.collection_id] ?? [];
      return {
        ...collection,
        place_count: placeIds.length,
        cover_images: placeIds.slice(0, 4).map((id) => fixtures.find((place) => place.id === id)?.image_url).filter(Boolean),
        contains_poi: poiId ? placeIds.includes(poiId) : false,
      };
    });
    return Response.json({ items });
  }

  const collectionPlaces = url.pathname.match(/^\/saved-places\/collections\/([^/]+)\/places$/);
  if (collectionPlaces && method === 'GET') {
    const placeIds = memberships[decodeURIComponent(collectionPlaces[1])] ?? [];
    return Response.json({ items: fixtures.filter((place) => ids.includes(place.id) && placeIds.includes(place.id)) });
  }

  if (sessionStorage.getItem('saved_places_test_fail_mutation') === '1') {
    sessionStorage.removeItem('saved_places_test_fail_mutation');
    return Response.json({ detail: 'temporary failure' }, { status: 503 });
  }
  const delayMs = Number(sessionStorage.getItem('saved_places_test_mutation_delay') || '0');
  if (delayMs > 0) {
    sessionStorage.removeItem('saved_places_test_mutation_delay');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (url.pathname === '/saved-places' && method === 'POST') {
    const body = JSON.parse(String(init?.body || '{}')) as { poi_id: string };
    const changed = !ids.includes(body.poi_id);
    if (changed) ids.unshift(body.poi_id);
    memberships[defaultCollectionId] = [...new Set([...(memberships[defaultCollectionId] ?? []), body.poi_id])];
    sessionStorage.setItem(idsKey, JSON.stringify(ids));
    sessionStorage.setItem(membershipsKey, JSON.stringify(memberships));
    return Response.json({ poi_id: body.poi_id, saved: true, changed });
  }

  if (url.pathname === '/saved-places/collections' && method === 'POST') {
    const body = JSON.parse(String(init?.body || '{}')) as { name: string };
    const collectionId = `collection-${Date.now()}`;
    collections.push({ collection_id: collectionId, name: body.name, is_default: false, created_at: new Date().toISOString() });
    memberships[collectionId] = [];
    sessionStorage.setItem(collectionsKey, JSON.stringify(collections));
    sessionStorage.setItem(membershipsKey, JSON.stringify(memberships));
    return Response.json({ collection_id: collectionId, changed: true }, { status: 201 });
  }

  const placeMembership = url.pathname.match(/^\/saved-places\/collections\/([^/]+)\/places\/([^/]+)$/);
  if (placeMembership && method === 'POST') {
    const collectionId = decodeURIComponent(placeMembership[1]);
    const poiId = decodeURIComponent(placeMembership[2]);
    memberships[collectionId] = [...new Set([...(memberships[collectionId] ?? []), poiId])];
    if (!ids.includes(poiId)) ids.unshift(poiId);
    sessionStorage.setItem(idsKey, JSON.stringify(ids));
    sessionStorage.setItem(membershipsKey, JSON.stringify(memberships));
    return Response.json({ collection_id: collectionId, poi_id: poiId, saved: true, changed: true });
  }

  if (placeMembership && method === 'DELETE') {
    const collectionId = decodeURIComponent(placeMembership[1]);
    const poiId = decodeURIComponent(placeMembership[2]);
    const oldMemberships = memberships[collectionId] ?? [];
    memberships[collectionId] = oldMemberships.filter((id) => id !== poiId);
    const remainsSaved = Object.values(memberships).some((items) => items.includes(poiId));
    if (!remainsSaved) ids.splice(ids.indexOf(poiId), 1);
    sessionStorage.setItem(idsKey, JSON.stringify(ids));
    sessionStorage.setItem(membershipsKey, JSON.stringify(memberships));
    return Response.json({ collection_id: collectionId, poi_id: poiId, saved: remainsSaved, changed: oldMemberships.length !== memberships[collectionId].length });
  }

  const collectionItem = url.pathname.match(/^\/saved-places\/collections\/([^/]+)$/);
  if (collectionItem && method === 'PATCH') {
    const body = JSON.parse(String(init?.body || '{}')) as { name: string };
    const collection = collections.find((item) => item.collection_id === decodeURIComponent(collectionItem[1]));
    if (collection) collection.name = body.name;
    sessionStorage.setItem(collectionsKey, JSON.stringify(collections));
    return Response.json({ collection_id: collectionItem[1], changed: true });
  }
  if (collectionItem && method === 'DELETE') {
    const collectionId = decodeURIComponent(collectionItem[1]);
    const items = memberships[collectionId] ?? [];
    memberships[defaultCollectionId] = [...new Set([...(memberships[defaultCollectionId] ?? []), ...items])];
    delete memberships[collectionId];
    sessionStorage.setItem(membershipsKey, JSON.stringify(memberships));
    sessionStorage.setItem(collectionsKey, JSON.stringify(collections.filter((item) => item.collection_id !== collectionId)));
    return Response.json({ collection_id: collectionId, changed: true });
  }

  const savedPlace = url.pathname.match(/^\/saved-places\/([^/]+)$/);
  if (savedPlace && method === 'DELETE') {
    const poiId = decodeURIComponent(savedPlace[1]);
    const nextIds = ids.filter((id) => id !== poiId);
    for (const collectionId of Object.keys(memberships)) memberships[collectionId] = memberships[collectionId].filter((id) => id !== poiId);
    sessionStorage.setItem(idsKey, JSON.stringify(nextIds));
    sessionStorage.setItem(membershipsKey, JSON.stringify(memberships));
    return Response.json({ poi_id: poiId, saved: false, changed: nextIds.length !== ids.length });
  }

  return Response.json({ detail: 'Unexpected test request' }, { status: 404 });
};

const unsavedPoi: Poi = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Chùa Thiên Mụ',
  category: 'chua',
  city: 'Huế',
  lat: 16.4697,
  lng: 107.5489,
  image: 'https://example.test/thien-mu.jpg',
  description: 'Địa điểm tại Huế.',
  rating: 4.7,
  visitDuration: '1 giờ',
  ecoScore: 80,
};

function SavedPlacesHarness() {
  const { savedIds, pendingIds, toggleSaved, openCollectionPicker } = useSavedPlaces();
  const location = useLocation();
  useEffect(() => {
    Object.assign(window, {
      savedTestPath: location.pathname,
      savedTestReturnTo: (location.state as { returnTo?: string } | null)?.returnTo,
    });
  }, [location]);

  return (
    <>
      <SavedPlacesView />
      <button
        id="unsaved-heart"
        type="button"
        aria-pressed={savedIds.has(unsavedPoi.id)}
        disabled={pendingIds.has(unsavedPoi.id)}
        onClick={() => void toggleSaved(unsavedPoi.id, unsavedPoi)}
      >
        Save test place
      </button>
      <button id="collection-heart" type="button" onClick={() => openCollectionPicker(unsavedPoi)}>
        Open collection picker
      </button>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/saved']}>
    <SavedPlacesProvider>
      <SavedPlacesHarness />
    </SavedPlacesProvider>
  </MemoryRouter>,
);

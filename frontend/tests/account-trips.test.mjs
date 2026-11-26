import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const exports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync(new URL('../src/utils/accountTrips.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports }
);
const { GUEST_TRIPS_STORAGE_KEY, loadAccountTrips, loadCachedAccountTrips, loadGuestTrips, saveGuestTrips, tripStorageKey } = exports;

const storage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
    key: (index) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  };
};

test('Switching accounts never loads the previous account browser cache', async () => {
  const db = storage();
  db.setItem(tripStorageKey('alice'), JSON.stringify([{ id: 'a', title: 'Alice private' }]));
  db.setItem(tripStorageKey('bob'), JSON.stringify([{ id: 'b', title: 'Bob private' }]));
  let queries = 0;
  const server = (id) => async () => {
    queries++;
    return [{ id, title: 'Server copy' }];
  };
  assert.equal((await loadAccountTrips(db, 'alice', server('a')))[0].id, 'a');
  assert.equal((await loadAccountTrips(db, 'bob', server('b')))[0].id, 'b');
  assert.equal(queries, 2);
});

test('Legacy cache migration requires server-confirmed ownership and keeps ideas', async () => {
  const db = storage();
  const original = JSON.stringify([
    { id: 'a', ideas: ['poi'], peopleCount: 4 },
    { id: 'foreign', ideas: ['private'] },
  ]);
  db.setItem('greentrip_user_trips', original);
  const own = await loadAccountTrips(db, 'alice', async () => [
    { trip_id: 'a', title: 'Own', destination: 'Huế', days_count: 2 },
  ]);
  assert.equal(own.length, 1);
  assert.equal(own[0].ideas[0], 'poi');
  assert.equal(own[0].peopleCount, 4);
  assert.equal(db.getItem('greentrip_user_trips'), original);
  assert.equal((await loadAccountTrips(db, 'bob', async () => [])).length, 0);
});

test('Failed verification does not discard or automatically claim legacy trips', async () => {
  const db = storage();
  db.setItem('greentrip_user_trips', '[{"id":"unassigned"}]');
  await assert.rejects(
    loadAccountTrips(db, 'alice', async () => {
      throw Error('offline');
    })
  );
  assert.equal(db.getItem(tripStorageKey('alice')), null);
  assert.equal(db.getItem('greentrip_user_trips'), '[{"id":"unassigned"}]');
});

test('An injected account cache never overrides a server-owned list', async () => {
  const db = storage();
  db.setItem(tripStorageKey('bob'), JSON.stringify([{ id: 'alice-private', ideas: ['secret'] }]));
  const rows = await loadAccountTrips(db, 'bob', async () => []);
  assert.equal(rows.length, 0);
});

test('Pending itinerary drafts reappear in the same account trip list after a failed sync', async () => {
  const db = storage();
  const draft = {
    trip_id: 'trip-unsynced-alice',
    title: 'Đà Nẵng cuối tuần',
    destination: 'Đà Nẵng',
    start_date: '2026-12-10',
    days_count: 3,
    days: [],
  };
  db.setItem(`greentrip_itinerary_pending_account-${encodeURIComponent('alice')}_${draft.trip_id}`, JSON.stringify(draft));
  db.setItem(tripStorageKey('alice'), JSON.stringify([{ id: draft.trip_id, peopleCount: 4, ideas: ['poi-1'] }]));

  const aliceTrips = await loadAccountTrips(db, 'alice', async () => []);
  assert.equal(aliceTrips.length, 1);
  assert.equal(aliceTrips[0].title, draft.title);
  assert.equal(aliceTrips[0].startDate, draft.start_date);
  assert.equal(aliceTrips[0].peopleCount, 4);
  assert.equal(JSON.stringify(aliceTrips[0].ideas), JSON.stringify(['poi-1']));

  const bobTrips = await loadAccountTrips(db, 'bob', async () => []);
  assert.equal(JSON.stringify(bobTrips), '[]');
});

test('A failed account trip request can fall back to only the signed-in user cache', () => {
  const db = storage();
  db.setItem(tripStorageKey('alice'), JSON.stringify([{ id: 'alice-trip', title: 'Alice trip' }]));
  db.setItem(tripStorageKey('bob'), JSON.stringify([{ id: 'bob-trip', title: 'Bob trip' }]));

  assert.equal(JSON.stringify(loadCachedAccountTrips(db, 'alice')), JSON.stringify([{ id: 'alice-trip', title: 'Alice trip' }]));
  assert.equal(loadCachedAccountTrips(db, 'unknown').length, 0);
});

test('A failed account trip request also keeps that account pending drafts visible', () => {
  const db = storage();
  const draft = {
    trip_id: 'trip-local-retry',
    title: 'Huế cần đồng bộ',
    destination: 'Huế',
    days_count: 2,
    days: [],
  };
  db.setItem(`greentrip_itinerary_pending_account-${encodeURIComponent('alice')}_${draft.trip_id}`, JSON.stringify(draft));

  assert.equal(loadCachedAccountTrips(db, 'alice')[0].id, draft.trip_id);
  assert.equal(JSON.stringify(loadCachedAccountTrips(db, 'bob')), '[]');
});

test('Guest trip list survives a reload and keeps itinerary metadata', () => {
  const db = storage();
  const guestTrips = [
    { id: 'trip_123', title: 'Huế cuối tuần', destination: 'Huế', daysCount: 2, peopleCount: 3, ideas: ['poi-1'] },
    { id: 'sample-danang-hue-3d', title: 'Sample' },
  ];

  assert.equal(saveGuestTrips(db, guestTrips), true);
  assert.equal(JSON.stringify(loadGuestTrips(db)), JSON.stringify([guestTrips[0]]));
  assert.equal(db.getItem(GUEST_TRIPS_STORAGE_KEY)?.includes('sample-'), false);
});

test('Guest trip storage handles malformed data and unavailable storage safely', () => {
  const db = storage();
  db.setItem(GUEST_TRIPS_STORAGE_KEY, '{bad json');
  assert.equal(JSON.stringify(loadGuestTrips(db)), '[]');

  const blockedStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('storage blocked'); },
  };
  assert.equal(saveGuestTrips(blockedStorage, [{ id: 'trip_123' }]), false);
  assert.equal(JSON.stringify(loadCachedAccountTrips(blockedStorage, 'alice')), '[]');
});

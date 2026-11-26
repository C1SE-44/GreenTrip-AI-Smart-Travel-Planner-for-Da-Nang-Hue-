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
const { loadAccountTrips, tripStorageKey } = exports;

const storage = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
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

test('Local-only duration and flexible-date edits survive merging the owned trip summary', async () => {
  const db = storage();
  db.setItem(tripStorageKey('alice'), JSON.stringify([{
    id: 'a',
    title: 'Trip',
    destination: 'Huế',
    startDate: '6 ngày • Tháng 12',
    daysCount: 6,
    peopleCount: 3,
    preferences: ['beach'],
    ideas: ['poi-1'],
    localMetadataOverrides: { startDate: '6 ngày • Tháng 12', daysCount: 6 },
  }]));
  const [trip] = await loadAccountTrips(db, 'alice', async () => [
    { trip_id: 'a', title: 'Trip', destination: 'Huế', start_date: '2026-11-01', days_count: 4 },
  ]);
  assert.equal(trip.startDate, '6 ngày • Tháng 12');
  assert.equal(trip.daysCount, 6);
  assert.equal(trip.peopleCount, 3);
  assert.deepEqual(Array.from(trip.preferences), ['beach']);
  assert.deepEqual(Array.from(trip.ideas), ['poi-1']);
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

test('Only namespaced client-draft trips are restored from an account cache', async () => {
  const db = storage();
  db.setItem(tripStorageKey('alice'), JSON.stringify([
    { id: 'trip_123', title: 'Alice draft', ideas: ['poi-1'] },
    { id: 'not-owned-server-trip', title: 'Unverified' },
  ]));
  db.setItem(tripStorageKey('bob'), JSON.stringify([{ id: 'trip_456', title: 'Bob draft' }]));
  const aliceTrips = await loadAccountTrips(db, 'alice', async () => []);
  const bobTrips = await loadAccountTrips(db, 'bob', async () => []);
  assert.deepEqual(Array.from(aliceTrips, (trip) => trip.id), ['trip_123']);
  assert.deepEqual(Array.from(bobTrips, (trip) => trip.id), ['trip_456']);
  assert.deepEqual(Array.from(aliceTrips[0].ideas), ['poi-1']);
});

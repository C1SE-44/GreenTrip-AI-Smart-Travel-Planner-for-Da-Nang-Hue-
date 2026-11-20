import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadPendingHelper(storageEntries = new Map(), localEntries = new Map()) {
  const source = readFileSync(new URL('../src/utils/pendingPlannerAction.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const sessionStorage = {
    getItem: (key) => (storageEntries.has(key) ? storageEntries.get(key) : null),
    setItem: (key, value) => storageEntries.set(key, String(value)),
    removeItem: (key) => storageEntries.delete(key),
  };
  const localStorage = {
    getItem: (key) => (localEntries.has(key) ? localEntries.get(key) : null),
    setItem: (key, value) => localEntries.set(key, String(value)),
    removeItem: (key) => localEntries.delete(key),
  };
  vm.runInNewContext(compiled, { exports, sessionStorage, localStorage, JSON });
  return exports;
}

test('pendingPlannerAction roundtrip consumes once and handles corrupt JSON safely', () => {
  const sessionMap = new Map();
  const helper = loadPendingHelper(sessionMap);

  helper.savePendingPlannerAction({ type: 'create_trip', poiIds: ['poi-1', 'poi-2'] });
  const first = helper.consumePendingPlannerAction();
  assert.deepEqual(
    { type: first.type, poiIds: Array.from(first.poiIds || []) },
    { type: 'create_trip', poiIds: ['poi-1', 'poi-2'] },
  );
  assert.equal(helper.consumePendingPlannerAction(), null, 'Action must be consumed at most once');

  helper.savePendingPlannerAction({ type: 'clone_sample', sampleTripId: 'sample-danang-hue-3d' });
  const cloneAction = helper.consumePendingPlannerAction();
  assert.deepEqual({ type: cloneAction.type, sampleTripId: cloneAction.sampleTripId }, {
    type: 'clone_sample',
    sampleTripId: 'sample-danang-hue-3d',
  });

  sessionMap.set(helper.PENDING_PLANNER_ACTION_KEY, '{broken-json');
  assert.equal(helper.consumePendingPlannerAction(), null);
});

test('hasAuthToken detects tokens in either localStorage or sessionStorage', () => {
  assert.equal(loadPendingHelper(new Map(), new Map()).hasAuthToken(), false);
  assert.equal(loadPendingHelper(new Map([['access_token', 'tok-s']]), new Map()).hasAuthToken(), true);
  assert.equal(loadPendingHelper(new Map(), new Map([['access_token', 'tok-l']])).hasAuthToken(), true);
});

test('Sample trips render read-only banner without ExpiredTripBanner or delete button, and Trip creation gates guests', () => {
  const expiredBanner = readFileSync(new URL('../src/components/planner/ExpiredTripBanner.tsx', import.meta.url), 'utf8');
  const readOnlyBanner = readFileSync(new URL('../src/components/planner/SampleTripReadOnlyBanner.tsx', import.meta.url), 'utf8');
  const landingPage = readFileSync(new URL('../src/pages/LandingPage.tsx', import.meta.url), 'utf8');
  const explorePage = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');

  assert.ok(expiredBanner.includes("trip.id.startsWith('sample-')"), 'ExpiredTripBanner must return null for sample-* trips');
  assert.ok(readOnlyBanner.includes('Dùng mẫu này'), 'SampleTripReadOnlyBanner must expose "Dùng mẫu này" CTA');
  assert.ok(
    landingPage.includes('hasAuthToken()') && landingPage.includes('savePendingPlannerAction'),
    'LandingPage quick launch must require login and preserve pending quick_launch action',
  );
  assert.ok(
    explorePage.includes('requestCreateTrip') &&
      explorePage.includes('handleCloneSampleTrip') &&
      explorePage.includes('isSampleTrip') &&
      explorePage.includes('Dùng mẫu này'),
    'ExplorePage must gate Create Trip and replace Delete with Dùng mẫu này on sample cards',
  );
});

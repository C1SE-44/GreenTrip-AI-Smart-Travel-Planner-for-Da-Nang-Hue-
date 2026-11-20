import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadPoiService(fetchJsonMock) {
  const source = readFileSync(new URL('../src/services/poi.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const deps = {
    '@/lib/api': { fetchJson: fetchJsonMock },
  };
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => deps[name] || {},
    Date,
    Promise,
    Map,
    Set,
    URLSearchParams,
    console,
  });
  return exports;
}

test('getAllPois deduplicates concurrent calls and serves subsequent reads from TTL cache', async () => {
  let requests = 0;
  const poiService = loadPoiService(async (path) => {
    requests += 1;
    const match = String(path).match(/page=(\d+)/);
    const page = match ? Number(match[1]) : 1;
    return {
      items: [{ id: `poi-${page}`, name: `POI ${page}` }],
      pagination: { page, limit: 100, total: 2, total_pages: 2, has_next: page < 2, has_previous: page > 1 },
    };
  });

  poiService.clearAllPoisCache();
  const [first, second] = await Promise.all([
    poiService.getAllPois({ city: 'Đà Nẵng' }),
    poiService.getAllPois({ city: 'Đà Nẵng' }),
  ]);

  assert.equal(requests, 2, 'Two concurrent callers must share 1 paginated fetch sequence');
  assert.equal(first.items.length, 2);
  assert.equal(second.items.length, 2);

  const third = await poiService.getAllPois({ city: 'Đà Nẵng' });
  assert.equal(requests, 2, 'Cached read within TTL must trigger 0 network calls');
  assert.equal(third.items.length, 2);
});

test('getPoisByIds reuses getAllPois cache without issuing extra network requests', async () => {
  let requests = 0;
  const poiService = loadPoiService(async () => {
    requests += 1;
    return {
      items: [
        { id: '1', name: 'Cầu Rồng' },
        { id: '2', name: 'Mỹ Khê' },
        { id: '3', name: 'Đại Nội' },
      ],
      pagination: { page: 1, limit: 100, total: 3, total_pages: 1, has_next: false, has_previous: false },
    };
  });

  poiService.clearAllPoisCache();
  await poiService.getAllPois();
  assert.equal(requests, 1);

  const matched = await poiService.getPoisByIds(['1', '3']);
  assert.equal(requests, 1, 'getPoisByIds must reuse cached getAllPois data');
  assert.deepEqual(
    Array.from(matched.map((p) => p.id)),
    ['1', '3'],
  );
});

test('getAllPois caps concurrent pagination batches to 2 requests at a time', async () => {
  let active = 0;
  let maxActive = 0;
  const poiService = loadPoiService(async (path) => {
    active += 1;
    if (active > maxActive) maxActive = active;
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    const match = String(path).match(/page=(\d+)/);
    const page = match ? Number(match[1]) : 1;
    return {
      items: [{ id: `p-${page}`, name: `POI ${page}` }],
      pagination: { page, limit: 100, total: 5, total_pages: 5, has_next: page < 5, has_previous: page > 1 },
    };
  });

  poiService.clearAllPoisCache();
  const res = await poiService.getAllPois();
  assert.equal(res.items.length, 5);
  assert.ok(maxActive <= 2, `Expected max concurrent requests <= 2, observed ${maxActive}`);
});

test('ExplorePage avoids refetching POIs on tab change and TripOverviewView removes hardcoded traveler_name', () => {
  const exploreSource = readFileSync(new URL('../src/pages/ExplorePage.tsx', import.meta.url), 'utf8');
  const overviewSource = readFileSync(new URL('../src/components/planner/TripOverviewView.tsx', import.meta.url), 'utf8');

  assert.ok(
    exploreSource.includes('const needsPois = initialView !== \'profile\';') &&
      exploreSource.includes('[needsPois, cityFilter, categoryFilter, filterValues]'),
    'ExplorePage loadPois effect must depend on needsPois instead of initialView',
  );
  assert.ok(
    !overviewSource.includes("traveler_name: 'Nguyên'") &&
      overviewSource.includes('currentUser?.full_name'),
    'TripOverviewView must read traveler_name from currentUser instead of hardcoding a developer name',
  );
});

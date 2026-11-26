import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('PoiImage enforces lazy loading, no-referrer, deterministic fallback and inline SVG safety net', () => {
  const source = readFileSync(new URL('../src/components/ui/PoiImage.tsx', import.meta.url), 'utf8');

  assert.ok(source.includes("loading={priority ? 'eager' : 'lazy'}"), 'PoiImage must lazy-load non-priority images');
  assert.ok(source.includes('decoding="async"'), 'PoiImage must decode asynchronously');
  assert.ok(source.includes('referrerPolicy="no-referrer"'), 'PoiImage must send no-referrer for external CDNs');
  assert.ok(source.includes('getDeterministicImage'), 'PoiImage must use deterministic category fallback');
  assert.ok(source.includes('INLINE_FALLBACK_SVG'), 'PoiImage must provide inline SVG final fallback');
  assert.ok(source.includes('errorTier'), 'PoiImage must cap error retries to avoid infinite onError loops');
});

test('Key POI cards, detail views, planner stops, and saved collections use PoiImage', () => {
  const files = [
    '../src/components/explore/ExplorePoiCard.tsx',
    '../src/components/poi/PoiCard.tsx',
    '../src/components/poi/PoiDetailSection.tsx',
    '../src/components/planner/ItineraryIdeasCarousel.tsx',
    '../src/components/planner/TripOverviewView.tsx',
    '../src/components/planner/TripItineraryView.tsx',
    '../src/components/planner/IdeationChatView.tsx',
    '../src/components/saved/SavedPlacesView.tsx',
  ];

  for (const relPath of files) {
    const content = readFileSync(new URL(relPath, import.meta.url), 'utf8');
    assert.ok(content.includes('PoiImage'), `${relPath} must render <PoiImage />`);
  }
});

test('getGalleryImages only uses authentic POI photos without category padding or Cau Rong overrides', () => {
  const poisSource = readFileSync(new URL('../src/data/pois.ts', import.meta.url), 'utf8');
  const fnStart = poisSource.indexOf('export function getGalleryImages');
  const fnEnd = poisSource.indexOf('export function normalizeCategory');
  assert.ok(fnStart !== -1 && fnEnd > fnStart, 'getGalleryImages function must exist');

  const fnBody = poisSource.slice(fnStart, fnEnd);
  assert.ok(
    !fnBody.includes('DEFAULT_IMAGES_BY_CATEGORY'),
    'getGalleryImages must not pad missing gallery slots with other POIs category photos'
  );
  assert.ok(
    !poisSource.includes("c4ecef3d-5946-4bd8-974e-fd36c7aa9a7e.webp';\n  }\n  const gallery"),
    'normalizePoi must not overwrite Cau Rong with Cau Vang photo'
  );
});

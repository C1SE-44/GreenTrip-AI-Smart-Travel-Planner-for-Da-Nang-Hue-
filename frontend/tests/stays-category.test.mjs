import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function loadPoisModule() {
  const source = fs.readFileSync(path.resolve('src/data/pois.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    console,
  });
  return module.exports;
}

test('pois.ts normalizes Lưu trú & nghỉ dưỡng stays with / đêm unit, Nghỉ qua đêm duration, and bed icon', () => {
  const poisMod = loadPoisModule();

  assert.equal(poisMod.normalizeCategory('Lưu trú và nghỉ dưỡng'), 'luu-tru');
  assert.equal(poisMod.normalizeCategory('luu-tru'), 'luu-tru');
  assert.equal(poisMod.categoryLabels['luu-tru'], 'Lưu trú');
  assert.equal(poisMod.SUB_CATEGORY_LABELS.eco_lodge, 'Eco Lodge & Sinh thái');
  assert.equal(poisMod.SUB_CATEGORY_LABELS.homestay, 'Homestay bản địa');

  const normalizedStay = poisMod.normalizePoi({
    id: 'stay-test-1',
    name: 'Cafe Garden Resort Đà Nẵng',
    category: 'Lưu trú và nghỉ dưỡng',
    sub_category: 'eco_lodge',
    city: 'Da Nang',
    latitude: 16.0544,
    longitude: 108.2428,
    average_visit_minutes: 720,
    green_score: 0.88,
    satisfaction_score: 4.7,
    ai_metadata: {
      price_range_display: '1.086.400 ₫ / đêm',
    },
  });

  assert.ok(normalizedStay, 'normalizePoi must accept valid stay record');
  assert.equal(normalizedStay.category, 'luu-tru');
  assert.equal(normalizedStay.visitDuration, 'Nghỉ qua đêm');
  assert.equal(normalizedStay.openHours, 'Nhận phòng 14:00 – Trả phòng 12:00');
  assert.equal(normalizedStay.ai_metadata.price_range_display, '1.086.400 ₫ / đêm');
  assert.equal(poisMod.getSpecificPoiIconClass(normalizedStay), 'ph-bold ph-bed');
});

test('ExplorePage, ExploreFilterModal, and HomeDashboardView wire luu-tru tab, nightly filters, and curated stays section', () => {
  const exploreSrc = fs.readFileSync(path.resolve('src/pages/ExplorePage.tsx'), 'utf8');
  const filterSrc = fs.readFileSync(path.resolve('src/components/poi/ExploreFilterModal.tsx'), 'utf8');
  const homeSrc = fs.readFileSync(path.resolve('src/components/home/HomeDashboardView.tsx'), 'utf8');
  const utilsSrc = fs.readFileSync(path.resolve('src/components/explore/exploreUtils.ts'), 'utf8');

  assert.ok(exploreSrc.includes("{ id: 'luu-tru', label: 'Lưu trú xanh' }"), 'ExplorePage TABS must include luu-tru');
  assert.ok(exploreSrc.includes("sections['stays']"), 'ExplorePage curatedSections must include stays overview');
  assert.ok(exploreSrc.includes("categoryFilter === 'luu-tru'"), 'ExplorePage must filter luu-tru category');
  assert.ok(filterSrc.includes("'luu-tru': 'Lưu trú xanh'"), 'ExploreFilterModal must label luu-tru facets');
  assert.ok(filterSrc.includes('< 800k/đêm'), 'ExploreFilterModal must render nightly budget pills');
  assert.ok(homeSrc.includes("onNavigateToExplore('luu-tru')"), 'HomeDashboardView must route Lưu trú pill to /explore?tab=luu-tru');
  assert.ok(utilsSrc.includes("'luu-tru': { icon: 'ph-bed', label: 'Lưu trú' }"), 'exploreUtils must define luu-tru metadata');
});

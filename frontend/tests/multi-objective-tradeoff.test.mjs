import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  computeGreenScoreBreakdown,
  evaluateCrowdProfile,
  isTimeInCrowdPeakWindow,
} from '../src/data/pois.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

async function loadItineraryService() {
  const tripDatesSource = await readFile(path.join(root, 'src/utils/tripDates.ts'), 'utf8');
  const tripDatesCode = ts.transpileModule(tripDatesSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const tripDatesUrl = `data:text/javascript;base64,${Buffer.from(tripDatesCode).toString('base64')}`;

  const source = await readFile(path.join(root, 'src/services/itineraryService.ts'), 'utf8');
  const testableSource = source
    .replace(
      "import { fetchJson } from '@/lib/api';",
      'const fetchJson = async () => { throw new Error("Network is not used by these tests"); };',
    )
    .replace("from '@/utils/tripDates';", `from '${tripDatesUrl}';`);
  const compiled = ts.transpileModule(testableSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

const SAMPLE_POIS = [
  {
    id: 'dn-bana',
    name: 'Bà Nà Hills & Cầu Vàng',
    category: 'canh-quan',
    city: 'Đà Nẵng',
    lat: 15.9977,
    lng: 107.9881,
    image: '',
    description: '',
    rating: 4.7,
    visitDuration: '5 giờ',
    ecoScore: 68,
    estimatedCost: 900000,
    isLocalBusiness: false,
    popularityScore: 4.8,
  },
  {
    id: 'dn-local-craft',
    name: 'Làng đá mỹ nghệ Non Nước',
    category: 'di-tich',
    city: 'Đà Nẵng',
    lat: 16.004,
    lng: 108.263,
    image: '',
    description: '',
    rating: 4.8,
    visitDuration: '1.5 giờ',
    ecoScore: 92,
    estimatedCost: 0,
    isLocalBusiness: true,
    localBusinessType: 'craft_workshop',
    popularityScore: 3.1,
  },
  {
    id: 'dn-local-food',
    name: 'Quán Mì Quảng Bản Địa Tây Sông Hàn',
    category: 'quan-an',
    city: 'Đà Nẵng',
    lat: 16.065,
    lng: 108.212,
    image: '',
    description: '',
    rating: 4.7,
    visitDuration: '1 giờ',
    ecoScore: 88,
    estimatedCost: 45000,
    isLocalBusiness: true,
    popularityScore: 3.2,
  },
  {
    id: 'hue-dainoi',
    name: 'Đại Nội Huế (Hoàng Thành)',
    category: 'di-tich',
    city: 'Huế',
    lat: 16.4698,
    lng: 107.5784,
    image: '',
    description: '',
    rating: 4.9,
    visitDuration: '2.5 giờ',
    ecoScore: 92,
    estimatedCost: 200000,
    isLocalBusiness: false,
    popularityScore: 4.9,
  },
  {
    id: 'hue-thuybieu',
    name: 'Làng sinh thái Thủy Biều',
    category: 'canh-quan',
    city: 'Huế',
    lat: 16.4395,
    lng: 107.5378,
    image: '',
    description: '',
    rating: 4.8,
    visitDuration: '2 giờ',
    ecoScore: 96,
    estimatedCost: 0,
    isLocalBusiness: true,
    localBusinessType: 'craft_workshop',
    popularityScore: 2.9,
  },
];

test('optimizeDays strictly isolates Da Nang and Hue onto separate days', async () => {
  const { optimizeDays, detectSameDayIntercityConflict } = await loadItineraryService();
  const emptyDays = [
    { day_id: 'd1', day_number: 1, date: null, title: 'Ngày 1', stops: [] },
    { day_id: 'd2', day_number: 2, date: null, title: 'Ngày 2', stops: [] },
  ];
  const res = optimizeDays(emptyDays, SAMPLE_POIS, 300);
  const poiById = new Map(SAMPLE_POIS.map((p) => [p.id, p]));
  for (const day of res.days) {
    assert.strictEqual(
      detectSameDayIntercityConflict(day, poiById),
      false,
      `Day ${day.day_number} must not mix Da Nang and Hue`
    );
  }
});

test('computeGreenScoreBreakdown and evaluateCrowdProfile produce structured explanations & peak hours', () => {
  const bd = computeGreenScoreBreakdown(SAMPLE_POIS[4]);
  assert.strictEqual(bd.pillars.length, 4);
  assert.strictEqual(bd.pillars.reduce((acc, p) => acc + p.weightPct, 0), 100);
  assert.ok(bd.summaryReason.includes('cộng đồng'));

  const crowd = evaluateCrowdProfile(SAMPLE_POIS[3]);
  assert.strictEqual(crowd.level, 'high');
  assert.ok(crowd.peakHours);
  assert.strictEqual(isTimeInCrowdPeakWindow('09:30', crowd), true);
  assert.strictEqual(isTimeInCrowdPeakWindow('07:30', crowd), false);
});

test('formatCarbonEquivalence converts saved CO2 to % vs car and tree-days', async () => {
  const { formatCarbonEquivalence } = await loadItineraryService();
  const txt = formatCarbonEquivalence(1200, 76);
  assert.ok(txt && txt.includes('76%') && txt.includes('20 ngày cây xanh'));
});

test('optimizeItineraryWithTradeoff swaps crowded spot for local eco alternative and updates 5 research metrics', async () => {
  const { computeItineraryResearchMetrics, optimizeItineraryWithTradeoff } = await loadItineraryService();
  const days = [
    {
      day_id: 'd1',
      day_number: 1,
      date: null,
      title: 'Ngày 1 · Đà Nẵng',
      stops: [
        {
          stop_id: 's1',
          poi_id: 'dn-bana',
          title: 'Bà Nà Hills & Cầu Vàng',
          city: 'Đà Nẵng',
          address: 'Hòa Ninh',
          category: 'canh-quan',
          stop_type: 'poi',
          source: 'manual',
          sequence: 0,
          duration_minutes: 240,
          start_time: '09:00',
          end_time: '13:00',
          comment: null,
          latitude: 15.9977,
          longitude: 107.9881,
        },
        {
          stop_id: 's2',
          poi_id: 'dn-local-food',
          title: 'Quán Mì Quảng Bản Địa Tây Sông Hàn',
          city: 'Đà Nẵng',
          address: 'Hải Châu',
          category: 'quan-an',
          stop_type: 'poi',
          source: 'manual',
          sequence: 1,
          duration_minutes: 60,
          start_time: '13:30',
          end_time: '14:30',
          comment: null,
          latitude: 16.065,
          longitude: 108.212,
        },
      ],
    },
  ];
  const poiById = new Map(SAMPLE_POIS.map((p) => [p.id, p]));
  const before = computeItineraryResearchMetrics(days, poiById, 'driving');
  assert.strictEqual(before.emissionReductionPct, 0);
  assert.strictEqual(before.crowdedStopCount, 1);

  const res = optimizeItineraryWithTradeoff(days, SAMPLE_POIS, 'green_local', 'driving', 2);
  assert.strictEqual(res.swappedCount, 1);
  assert.ok(res.after.localBusinessExposurePct > res.before.localBusinessExposurePct);
  assert.ok(res.after.emissionReductionPct > res.before.emissionReductionPct);
  assert.strictEqual(res.after.crowdedStopCount, 0);
});

test('Landing page removes OSRM/Copilot jargon and exposes direct /chat AI Assistant entry', async () => {
  const valueProps = await readFile(path.join(root, 'src/components/landing/ValuePropsSection.tsx'), 'utf8');
  const landing = await readFile(path.join(root, 'src/pages/LandingPage.tsx'), 'utf8');
  const navbar = await readFile(path.join(root, 'src/components/layout/Navbar.tsx'), 'utf8');

  assert.strictEqual(valueProps.includes('OSRM'), false, 'Landing ValuePropsSection must not expose OSRM jargon');
  assert.strictEqual(valueProps.includes('In-Planner Copilot'), false, 'Landing ValuePropsSection must not expose Copilot jargon');
  assert.ok(landing.includes('to="/chat"'), 'LandingPage must expose direct entry to /chat AI Assistant');
  assert.ok(navbar.includes("to: '/chat'"), 'Navbar must include Trợ Lý AI (/chat)');
});

test('Entity linking disambiguates Linh Ung pagodas, blocks cross-province pins, and sanitizes raw TikTok errors', async () => {
  const mdSource = await readFile(path.join(root, 'src/components/planner/copilotMessageMarkdown.tsx'), 'utf8');
  const pureHelpersSource = mdSource
    .replace("import { MapPin } from 'lucide-react';", 'const MapPin = () => null;')
    .replace(/export function FormattedCopilotMessage[\s\S]*$/m, '');
  const compiled = ts.transpileModule(pureHelpersSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

  const lookup = [
    { id: 'dn-muoi-bien', name: 'Nhà hàng Muối Biển Seafood', city: 'Đà Nẵng' },
    { id: 'dn-linh-ung-bn', name: 'Chùa Linh Ứng Bà Nà', city: 'Đà Nẵng' },
    { id: 'dn-linh-ung-st', name: 'Chùa Linh Ứng Bãi Bụt Sơn Trà', city: 'Đà Nẵng' },
    { id: 'hue-cf-muoi', name: 'Cà Phê Muối Nguyễn Lương Bằng', city: 'Huế' },
  ];

  // 1. Hue context must never match Da Nang seafood restaurant for "Cà phê muối"
  assert.strictEqual(mod.findMatchingPoiIdForLabel('Cà phê muối', lookup, 'Huế'), null);
  // 2. Linh Ung Son Tra must match Bai But Son Tra, NEVER Ba Na
  assert.strictEqual(mod.findMatchingPoiIdForLabel('Chùa Linh Ứng Sơn Trà', lookup, 'Đà Nẵng'), 'dn-linh-ung-st');
  assert.strictEqual(mod.findMatchingPoiIdForLabel('Chùa Linh Ứng Bà Nà', lookup, 'Đà Nẵng'), 'dn-linh-ung-bn');
  // 3. Raw Cloudflare/TikTok "Please wait..." must be converted to helpful Vietnamese guidance
  const sanitized = mod.sanitizeCopilotReplyText('Please wait...', 'https://vt.tiktok.com/ZSY9abc/');
  assert.strictEqual(sanitized.includes('Please wait'), false);
  assert.ok(sanitized.includes('tên địa điểm'));

  // 4. Both chat views expose clickable ExplanationModal ("Vì sao?") on POI cards
  const overviewSrc = await readFile(path.join(root, 'src/components/planner/TripOverviewView.tsx'), 'utf8');
  const ideationSrc = await readFile(path.join(root, 'src/components/planner/IdeationChatView.tsx'), 'utf8');
  assert.ok(overviewSrc.includes('Bấm để xem giải thích 4 trụ cột Điểm xanh'));
  assert.ok(ideationSrc.includes('ExplanationModal') && ideationSrc.includes('Bấm để xem giải thích 4 trụ cột Điểm xanh'));
});

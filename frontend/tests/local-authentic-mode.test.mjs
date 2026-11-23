import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, '..');

async function withViteSsr(fn) {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

test('evaluateLocalAuthentic distinguishes West Han River eateries, craft villages, and crowded spots', async () => {
  await withViteSsr(async (server) => {
    const poisMod = await server.ssrLoadModule('/src/data/pois.ts');

    const westHanEatery = poisMod.evaluateLocalAuthentic({
      id: 'nhien-tra-quan',
      category: 'quan-an',
      city: 'Đà Nẵng',
      lng: 108.216789,
      ecoScore: 76,
      popularityScore: 3.4,
      localBusinessType: 'local_food',
    });
    assert.equal(westHanEatery.isWestOfHanRiver, true);
    assert.equal(westHanEatery.isLocalAuthentic, true);
    assert.equal(westHanEatery.isCrowded, false);
    assert.ok(westHanEatery.badgeLabel, 'West Han eatery should have a badge label');

    const eastBusyEatery = poisMod.evaluateLocalAuthentic({
      id: 'sea-front-spot',
      category: 'quan-an',
      city: 'Đà Nẵng',
      lng: 108.245,
      ecoScore: 68,
      popularityScore: 4.1,
      localBusinessType: 'local_food',
    });
    assert.equal(eastBusyEatery.isWestOfHanRiver, false);
    assert.equal(eastBusyEatery.isLocalAuthentic, false);
    assert.equal(eastBusyEatery.isCrowded, true);

    const hueCraftVillage = poisMod.evaluateLocalAuthentic({
      id: 'lang-tranh-lang-sinh',
      category: 'di-tich',
      city: 'Huế',
      lng: 107.61,
      ecoScore: 86,
      popularityScore: 3.87,
      localBusinessType: 'craft_workshop',
    });
    assert.equal(hueCraftVillage.isCraftVillage, true);
    assert.equal(hueCraftVillage.isLocalAuthentic, true);

    const crowdedMarket = poisMod.evaluateLocalAuthentic({
      id: 'cho-dong-ba',
      category: 'di-tich',
      city: 'Huế',
      lng: 107.588,
      ecoScore: 70,
      popularityScore: 4.37,
    });
    assert.equal(crowdedMarket.isCrowded, true);
    assert.equal(crowdedMarket.isLocalAuthentic, false);
  });
});

test('suggestNearbyAlternativesForStop prioritizes local authentic west-Han/low-crowd stops when enabled', async () => {
  await withViteSsr(async (server) => {
    const itineraryMod = await server.ssrLoadModule('/src/services/itineraryService.ts');

    const crowdedStop = {
      id: 'stop-cho-han',
      poi_id: 'cho-han',
      title: 'Chợ Hàn',
      category: 'di-tich',
      city: 'Đà Nẵng',
      latitude: 16.0684,
      longitude: 108.2218,
      sequence: 0,
    };

    const day = {
      id: 'day-1',
      trip_id: 'trip-1',
      day_number: 1,
      stops: [crowdedStop],
    };

    const allPois = [
      {
        id: 'popular-east-eatery',
        name: 'Quán Biển Đông Đúc',
        category: 'quan-an',
        city: 'Đà Nẵng',
        lat: 16.0685,
        lng: 108.2245,
        rating: 4.9,
        ecoScore: 65,
        popularityScore: 4.2,
        image: '',
        description: '',
        visitDuration: '45 phút',
        isGreen: false,
      },
      {
        id: 'west-han-authentic',
        name: 'Quán Bản Địa Tây Sông Hàn',
        category: 'quan-an',
        city: 'Đà Nẵng',
        lat: 16.0682,
        lng: 108.2155,
        rating: 4.5,
        ecoScore: 80,
        popularityScore: 3.3,
        localBusinessType: 'local_food',
        image: '',
        description: '',
        visitDuration: '45 phút',
        isGreen: true,
      },
    ];

    const standard = itineraryMod.suggestNearbyAlternativesForStop(
      crowdedStop,
      day,
      allPois,
      new Set(['cho-han']),
      2,
      { preferLocalAuthentic: false }
    );
    assert.equal(standard.length, 2, 'Standard mode returns all nearby candidates');

    const prioritized = itineraryMod.suggestNearbyAlternativesForStop(
      crowdedStop,
      day,
      allPois,
      new Set(['cho-han']),
      2,
      { preferLocalAuthentic: true }
    );

    assert.ok(prioritized.length >= 1, 'Expected at least 1 local-authentic alternative');
    assert.equal(prioritized[0].poi.id, 'west-han-authentic');
    assert.ok(
      !prioritized.some((item) => item.poi.id === 'popular-east-eatery'),
      'Crowded popular eatery should be filtered out when local authentic options exist'
    );
    assert.match(prioritized[0].reason, /Bản địa ít đông|Tây sông Hàn/i);
  });
});

test('Frontend filter modal, explore page, and itinerary view wire localAuthenticOnly mode', async () => {
  const [explorePage, filterModal, itineraryView, poiSvc] = await Promise.all([
    fs.readFile(path.join(frontendRoot, 'src/pages/ExplorePage.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/poi/ExploreFilterModal.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/components/planner/TripItineraryView.tsx'), 'utf8'),
    fs.readFile(path.join(frontendRoot, 'src/services/poi.ts'), 'utf8'),
  ]);

  assert.ok(poiSvc.includes('local_authentic_only'), 'poi.ts should pass local_authentic_only');
  assert.ok(filterModal.includes('localAuthenticOnly'), 'ExploreFilterModal should expose localAuthenticOnly');
  assert.ok(explorePage.includes('localAuthenticOnly'), 'ExplorePage should track localAuthenticOnly state');
  assert.ok(itineraryView.includes('preferLocalAuthentic'), 'TripItineraryView should have preferLocalAuthentic toggle');
});

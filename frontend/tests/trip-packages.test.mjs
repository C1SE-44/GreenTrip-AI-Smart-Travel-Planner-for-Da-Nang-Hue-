import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withViteSsr(callback) {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
  try {
    return await callback(server);
  } finally {
    await server.close();
  }
}

test('Must Try packages resolve into complete city-valid itineraries with accurate covers and separate stays', async () => {
  await withViteSsr(async (server) => {
    const [packagesModule, itinerary] = await Promise.all([
      server.ssrLoadModule('/src/components/home/tripPackages.ts'),
      server.ssrLoadModule('/src/services/itineraryService.ts'),
    ]);
    const packages = packagesModule.resolveTripPackages([]);

    assert.ok(packages.length > 0, 'At least one complete package should be available from the curated catalog');
    const requiredThemes = ['budget', 'luxury', 'family', 'checkin', 'eco', 'heritage', 'food', 'coffee', 'spiritual', 'shopping', 'couple', 'adventure', 'rainy', 'route'];
    for (const theme of requiredThemes) {
      assert.ok(packages.filter((item) => item.definition.theme === theme).length >= 2, `Must Try must resolve at least two ${theme} packages`);
    }

    for (const tripPackage of packages) {
      const { definition, days, stays, launch } = tripPackage;
      assert.ok(days.length >= 2 && days.length <= 3, `${definition.id} must last 2–3 days`);
      assert.ok(stays.length > 0, `${definition.id} must resolve a lodging POI`);
      assert.ok(stays.every((stay) => stay.category === 'luu-tru'), `${definition.id} may only use active lodging POIs`);
      assert.ok(stays.every((stay) => packagesModule.hasPoiContactInfo(stay)), `${definition.id} lodging needs contact information`);
      assert.ok(tripPackage.coverImage && !/photo-(1569154941061|1559592413|1506929562872)/.test(tripPackage.coverImage), `${definition.id} must not use a known mismatched generic cover`);
      assert.ok(tripPackage.coverImageAlt.trim(), `${definition.id} must have descriptive cover text`);
      if (tripPackage.coverImage.startsWith('/')) {
        assert.ok(existsSync(path.join(frontendRoot, 'public', tripPackage.coverImage)), `${definition.id} has a missing local cover`);
      }

      const stopPois = days.flatMap((day) => day.stops.map((stop) => stop.poi));
      const visitIds = new Set(stopPois.map((poi) => poi.id));
      const stayIds = new Set(stays.map((stay) => stay.id));
      const launchIds = new Set(launch.poiIds);
      assert.equal(launchIds.size, launch.poiIds.length, `${definition.id} launch IDs must not be duplicated`);
      for (const poi of stopPois) {
        assert.ok(poi.category !== 'luu-tru', `${definition.id} must not put lodging in sightseeing stops`);
        assert.ok(launchIds.has(poi.id), `${definition.id} launch must keep stop ${poi.name}`);
      }
      for (const stay of stays) assert.ok(launchIds.has(stay.id), `${definition.id} launch must keep stay ${stay.name}`);

      const trip = {
        id: `must-try-${definition.id}`,
        title: definition.title,
        destination: definition.destination,
        daysCount: days.length,
        peopleCount: 2,
        itineraryOutline: launch.itineraryOutline,
      };
      const built = itinerary.buildItineraryFromOutline(trip, [...stopPois, ...stays]);
      assert.equal(built.days.length, days.length, `${definition.id} must create the package day count`);
      built.days.forEach((day, index) => {
        const expectedDay = days[index];
        const actualVisits = day.stops.filter((stop) => stop.stop_type !== 'rest');
        assert.equal(day.title, expectedDay.theme, `${definition.id} day ${index + 1} must keep its theme`);
        assert.deepEqual(actualVisits.map((stop) => stop.poi_id), expectedDay.stops.map(({ poi }) => poi.id), `${definition.id} day ${index + 1} must keep its selected POIs in order`);
        assert.ok(actualVisits.every((stop) => stop.city === expectedDay.city), `${definition.id} day ${index + 1} must stay in ${expectedDay.city}`);
        assert.ok(actualVisits.every((stop) => stop.category !== 'luu-tru'), `${definition.id} lodging belongs in Ideas, not the itinerary`);
      });

      const ideaPois = [...stopPois, ...stays];
      const empty = itinerary.createEmptyItinerary(trip);
      const selected = itinerary.selectAutomaticPois(empty.days, ideaPois, [], trip, 'Fast', itinerary.dailyVisitCapacity('Fast'));
      assert.ok(selected.selected.every((poi) => poi.category !== 'luu-tru'), `${definition.id} smart scheduling must filter lodging from package ideas`);
      const scheduled = itinerary.optimizeDays(
        empty.days,
        selected.selected,
        itinerary.dailyVisitCapacity('Fast'),
        launch.itineraryOutline,
        itinerary.dailyVisitStopTarget('Fast'),
        definition.destination,
      );
      assert.ok(scheduled.days.flatMap((day) => day.stops).every((stop) => stop.category !== 'luu-tru'), `${definition.id} smart scheduling must not turn a stay into a visit`);

      if (definition.id === 'hue-danang-route-reverse-3d') {
        const routeSelection = itinerary.selectAutomaticPois(built.days, ideaPois, [], trip, 'Fast', itinerary.dailyVisitCapacity('Fast'));
        const optimizedRoute = itinerary.optimizeDays(
          built.days,
          routeSelection.selected,
          itinerary.dailyVisitCapacity('Fast'),
          launch.itineraryOutline,
          itinerary.dailyVisitStopTarget('Fast'),
          definition.destination,
        );
        const routeCities = optimizedRoute.days
          .map((day) => day.stops.find((stop) => stop.stop_type !== 'rest')?.city)
          .filter(Boolean);
        const cityChanges = routeCities.slice(1).filter((city, index) => city !== routeCities[index]).length;
        assert.equal(routeCities[0], 'Huế', 'The reverse Must Try route must retain its selected Huế starting city');
        assert.equal(cityChanges, 1, 'A two-city Must Try route must stay in each city for one continuous block');
        assert.equal(routeCities.at(-1), 'Đà Nẵng', 'The reverse Must Try route must finish in Đà Nẵng');
      }
    }
  });
});

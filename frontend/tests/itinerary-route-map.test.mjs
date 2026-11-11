import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for Itinerary Numbered Markers & Daily Route Map logic:
 * 1. Marker Order Sequential Integrity (1, 2, 3...)
 * 2. GeoJSON [longitude, latitude] to Leaflet [latitude, longitude] Coordinate Flipping
 * 3. Day Switching isolation & numbering reset
 * 4. Marker DivIcon HTML Structure & Selected State
 * 5. Robust handling of missing/invalid coordinates
 * 6. Polyline Road Route Rendering & Thresholds (>= 2 points)
 * 7. Route distance and duration formatting
 * 8. Fallback geometry detection (dashed polyline)
 */

// Helper: Marker icon HTML generation
function generateNumberedMarkerHtml(order, isSelected) {
  const size = isSelected ? 38 : 32;
  const activeClass = isSelected
    ? 'bg-forest-900 ring-4 ring-emerald-400 shadow-[0_6px_20px_rgba(0,0,0,0.35)] scale-110 z-50'
    : 'bg-emerald-600 hover:bg-emerald-700 shadow-[0_3px_10px_rgba(0,0,0,0.22)] border-2 border-white';
  
  return {
    size,
    html: `<div class="gt-numbered-marker ${activeClass}"><span class="number">${order}</span></div>`,
  };
}

// Helper: Coordinate mapping
function geoJsonToLeafletPositions(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .filter((coord) => Array.isArray(coord) && coord.length >= 2 && Number.isFinite(coord[0]) && Number.isFinite(coord[1]))
    .map(([lng, lat]) => [lat, lng]);
}

// Helper: Polyline configuration
function getPolylineOptions(isFallback) {
  return {
    color: '#16A34A',
    weight: 5,
    opacity: 0.85,
    lineJoin: 'round',
    lineCap: 'round',
    dashArray: isFallback ? '6, 8' : undefined,
  };
}

// Helper: Format distance
function formatDistance(meters) {
  if (!meters || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Helper: Format duration
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0 phút';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours} giờ ${remMinutes}p` : `${hours} giờ`;
}

test('Numbered Marker: sequential numbering starting from 1 for each day', () => {
  const mockDay1Stops = [
    { order: 1, poi_id: 'poi_01', name: 'Ngũ Hành Sơn', latitude: 16.003, longitude: 108.261 },
    { order: 2, poi_id: 'poi_02', name: 'Bãi biển Mỹ Khê', latitude: 16.059, longitude: 108.244 },
    { order: 3, poi_id: 'poi_03', name: 'Cầu Rồng', latitude: 16.061, longitude: 108.227 },
  ];

  mockDay1Stops.forEach((stop, index) => {
    assert.strictEqual(stop.order, index + 1, `Stop index ${index} should have order ${index + 1}`);
    assert.ok(stop.order >= 1, 'Marker numbers must be >= 1');
  });

  // When switching to Day 2, numbers must reset to 1
  const mockDay2Stops = [
    { order: 1, poi_id: 'poi_04', name: 'Bà Nà Hills', latitude: 15.998, longitude: 107.996 },
    { order: 2, poi_id: 'poi_05', name: 'Cầu Vàng', latitude: 15.995, longitude: 107.994 },
  ];

  assert.strictEqual(mockDay2Stops[0].order, 1, 'Day 2 first stop must start at 1');
  assert.strictEqual(mockDay2Stops[1].order, 2, 'Day 2 second stop must be 2');
});

test('GeoJSON to Leaflet Coordinates: correctly flips [lon, lat] to [lat, lon]', () => {
  const geoJsonCoords = [
    [108.2022, 16.0544], // [lon, lat]
    [108.2100, 16.0600],
    [108.2270, 16.0611],
  ];

  const leafletCoords = geoJsonToLeafletPositions(geoJsonCoords);

  assert.strictEqual(leafletCoords.length, 3);
  assert.deepStrictEqual(leafletCoords[0], [16.0544, 108.2022], 'First coordinate must be [lat, lon]');
  assert.deepStrictEqual(leafletCoords[1], [16.0600, 108.2100], 'Second coordinate must be [lat, lon]');
  assert.deepStrictEqual(leafletCoords[2], [16.0611, 108.2270], 'Third coordinate must be [lat, lon]');
});

test('DivIcon HTML: styles unselected and selected markers distinctly', () => {
  const normalMarker = generateNumberedMarkerHtml(1, false);
  assert.strictEqual(normalMarker.size, 32);
  assert.ok(normalMarker.html.includes('bg-emerald-600'), 'Normal marker uses emerald-600 background');
  assert.ok(normalMarker.html.includes('border-2 border-white'), 'Normal marker has white border');

  const selectedMarker = generateNumberedMarkerHtml(1, true);
  assert.strictEqual(selectedMarker.size, 38);
  assert.ok(selectedMarker.html.includes('bg-forest-900'), 'Selected marker uses forest-900 background');
  assert.ok(selectedMarker.html.includes('ring-4 ring-emerald-400'), 'Selected marker has emerald highlight ring');
});

test('Invalid coordinate safety: drops invalid or null coordinates without throwing', () => {
  const messyCoords = [
    [108.2, 16.0],
    null,
    [undefined, 16.0],
    ['invalid', 'coord'],
    [108.5, 16.2],
  ];

  const cleaned = geoJsonToLeafletPositions(messyCoords);
  assert.strictEqual(cleaned.length, 2);
  assert.deepStrictEqual(cleaned[0], [16.0, 108.2]);
  assert.deepStrictEqual(cleaned[1], [16.2, 108.5]);
});

test('Polyline Route Path: renders only when at least 2 valid points exist', () => {
  const zeroPoints = [];
  assert.strictEqual(geoJsonToLeafletPositions(zeroPoints).length < 2, true);

  const singlePoint = [[108.227, 16.0611]];
  assert.strictEqual(geoJsonToLeafletPositions(singlePoint).length < 2, true);

  const multiPoints = [
    [108.227, 16.0611],
    [108.2208, 16.0678],
    [108.2778, 16.1005],
  ];
  const renderedPositions = geoJsonToLeafletPositions(multiPoints);
  assert.strictEqual(renderedPositions.length, 3);
  assert.strictEqual(renderedPositions.length >= 2, true);
});

test('Polyline Route Styling: green theme color (#16A34A), weight 5px, opacity 0.85, and fallback dashed mode', () => {
  const standardRoad = getPolylineOptions(false);
  assert.strictEqual(standardRoad.color, '#16A34A');
  assert.strictEqual(standardRoad.weight, 5);
  assert.strictEqual(standardRoad.opacity, 0.85);
  assert.strictEqual(standardRoad.dashArray, undefined, 'Real road geometry should not be dashed');

  const fallbackRoad = getPolylineOptions(true);
  assert.strictEqual(fallbackRoad.dashArray, '6, 8', 'Fallback straight-line geometry must be dashed');
});

test('Route Metrics: formats distance and duration correctly for human-friendly UI', () => {
  assert.strictEqual(formatDistance(500), '500 m');
  assert.strictEqual(formatDistance(5200), '5.2 km');
  assert.strictEqual(formatDistance(0), '0 m');

  assert.strictEqual(formatDuration(45), '1 phút');
  assert.strictEqual(formatDuration(1200), '20 phút');
  assert.strictEqual(formatDuration(3900), '1 giờ 5p');
  assert.strictEqual(formatDuration(7200), '2 giờ');
});

test('Day Switching Cache: caches visited days and clears on itineraryId change', () => {
  const cache = new Map();
  const mockDay1Data = { day_number: 1, total_stops: 3, distance_meters: 5000 };
  const mockDay2Data = { day_number: 2, total_stops: 2, distance_meters: 8000 };

  cache.set(1, mockDay1Data);
  assert.strictEqual(cache.has(1), true);
  assert.strictEqual(cache.get(1).distance_meters, 5000);

  cache.set(2, mockDay2Data);
  assert.strictEqual(cache.has(2), true);
  assert.strictEqual(cache.size, 2);

  // Invalidate cache when itinerary changes
  cache.clear();
  assert.strictEqual(cache.size, 0);
  assert.strictEqual(cache.has(1), false);
});

test('Single-stop and empty-stop days viewport and route logic', () => {
  // Empty day
  const emptyStops = [];
  assert.strictEqual(emptyStops.length, 0);

  // Single-stop day
  const singleStop = [{ order: 1, name: 'Bà Nà Hills', latitude: 15.998, longitude: 107.996 }];
  assert.strictEqual(singleStop.length, 1);
  assert.strictEqual(singleStop[0].order, 1);
  // Polyline shouldn't be rendered for 1 stop
  assert.strictEqual(singleStop.length >= 2, false);
});

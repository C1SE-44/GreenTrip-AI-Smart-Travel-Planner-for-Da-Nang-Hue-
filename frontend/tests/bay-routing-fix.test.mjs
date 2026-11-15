import { test } from 'node:test';
import assert from 'node:assert/strict';

// High-fidelity road corridor waypoints [lat, lng] along QL1A
const HIGHWAY_QL1A_DANANG_HUE = [
  [16.0685, 108.1835], // Cầu vượt Ngã Ba Huế (Trung tâm Đà Nẵng)
  [16.0780, 108.1750], // Bến xe Trung tâm Đà Nẵng
  [16.0900, 108.1680], // Đường Tôn Đức Thắng (Hòa Khánh Nam)
  [16.1150, 108.1460], // Đường Nguyễn Lương Bằng (Liên Chiểu)
  [16.1360, 108.1360], // Cầu Nam Ô / Ngã ba Nguyễn Tất Thành
  [16.1600, 108.1250], // Chân đèo Hải Vân / Kim Liên
  [16.1820, 108.1180], // Dốc đèo Hải Vân Nam
  [16.1950, 108.1150], // Đỉnh đèo / Hầm Hải Vân
  [16.2300, 108.0100], // Thị trấn Lăng Cô
  [16.2650, 107.9700], // Đèo Phú Gia
  [16.2880, 107.9150], // Đèo Phước Tượng
  [16.3050, 107.8650], // Thị trấn Phú Lộc / Cầu Hai
  [16.3250, 107.8200], // QL1A phía nam bờ Đầm Cầu Hai
  [16.3450, 107.7700], // QL1A ven chân núi Lộc Điền
  [16.3650, 107.7300], // Ga Nong
  [16.3880, 107.6950], // Thị xã Hương Thủy / Sân bay Phú Bài
  [16.4150, 107.6550], // Hương Thủy QL1A
  [16.4450, 107.6100], // Cửa ngõ An Cựu / TP Huế
  [16.4650, 107.5900], // Trung tâm TP Huế
];

// Đường tránh Vịnh Đà Nẵng
const DA_NANG_BAY_LAND_BYPASS = [
  [16.1360, 108.1360], // Cầu Nam Ô
  [16.1150, 108.1460], // Nguyễn Lương Bằng (Hòa Khánh Bắc)
  [16.0880, 108.1580], // Tôn Đức Thắng (Hòa Khánh Nam)
  [16.0750, 108.1720], // Bến xe Trung tâm Đà Nẵng
  [16.0685, 108.1835], // Cầu vượt Ngã Ba Huế
  [16.0650, 108.1980], // Đường Điện Biên Phủ
  [16.0620, 108.2120], // Trung tâm Hải Châu
];

function buildRoadCorridor(fromLat, fromLng, toLat, toLng) {
  const isFromDaNang = fromLat < 16.22 && fromLng > 108.0;
  const isToHue = toLat > 16.32 && toLng < 107.8;
  const isFromHue = fromLat > 16.32 && fromLng < 107.8;
  const isToDaNang = toLat < 16.22 && toLng > 108.0;

  if (isFromDaNang && isToHue) {
    return HIGHWAY_QL1A_DANANG_HUE.map(([lat, lng]) => [lat, lng]);
  }
  if (isFromHue && isToDaNang) {
    return HIGHWAY_QL1A_DANANG_HUE.slice().reverse().map(([lat, lng]) => [lat, lng]);
  }

  const isNorthFrom = fromLat >= 16.12 && fromLng <= 108.15;
  const isSouthTo = toLat <= 16.12 && toLng >= 108.16;
  const isSouthFrom = fromLat <= 16.12 && fromLng >= 108.16;
  const isNorthTo = toLat >= 16.12 && toLng <= 108.15;

  if (isNorthFrom && isSouthTo) {
    return DA_NANG_BAY_LAND_BYPASS.map(([lat, lng]) => [lat, lng]);
  }
  if (isSouthFrom && isNorthTo) {
    return DA_NANG_BAY_LAND_BYPASS.slice().reverse().map(([lat, lng]) => [lat, lng]);
  }

  return [];
}

// Deep water boundary for Da Nang Bay: Lat 16.095 - 16.135, Lng 108.150 - 108.190
function isInDaNangBayWater(lat, lng) {
  return lat > 16.095 && lat < 16.135 && lng > 108.150 && lng < 108.190;
}

test('Frontend Route Case 1: Nam Ô to Cầu Rồng bypasses Da Nang Bay via land corridor', () => {
  const corridor = buildRoadCorridor(16.1360, 108.1360, 16.0611, 108.2270);
  assert.ok(corridor.length >= 5, 'Should produce at least 5 bypass waypoints');
  for (const [lat, lng] of corridor) {
    assert.strictEqual(isInDaNangBayWater(lat, lng), false, `Waypoint [${lat}, ${lng}] must not be in Da Nang Bay water!`);
  }
});

test('Frontend Route Case 2: Sơn Trà / Chùa Linh Ứng to Nam Ô in reverse bypasses Da Nang Bay', () => {
  const corridor = buildRoadCorridor(16.1058, 108.2933, 16.1360, 108.1360);
  assert.ok(corridor.length >= 5, 'Reverse trip must produce bypass waypoints');
  for (const [lat, lng] of corridor) {
    assert.strictEqual(isInDaNangBayWater(lat, lng), false, `Reverse waypoint [${lat}, ${lng}] must not be in Da Nang Bay!`);
  }
});

test('Frontend Route Case 3: Da Nang to Hue uses QL1A coastal highway corridor', () => {
  const corridor = buildRoadCorridor(16.0611, 108.2270, 16.4637, 107.5809);
  assert.strictEqual(corridor.length, HIGHWAY_QL1A_DANANG_HUE.length);
  assert.ok(corridor[0][1] > 108.1, 'First point starts in Da Nang area');
  assert.ok(corridor[corridor.length - 1][1] < 107.7, 'Last point ends in Hue area');
});

test('Frontend Route Case 4: Hue to Da Nang reverses QL1A highway corridor', () => {
  const corridor = buildRoadCorridor(16.4637, 107.5809, 16.0611, 108.2270);
  assert.strictEqual(corridor.length, HIGHWAY_QL1A_DANANG_HUE.length);
  assert.ok(corridor[0][1] < 107.7, 'Reverse first point starts in Hue area');
  assert.ok(corridor[corridor.length - 1][1] > 108.1, 'Reverse last point ends in Da Nang area');
});

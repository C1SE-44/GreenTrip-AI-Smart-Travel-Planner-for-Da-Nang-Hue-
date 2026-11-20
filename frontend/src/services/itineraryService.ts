import { fetchJson } from '@/lib/api';
import type { Poi } from '@/data/pois';
import type { UserTrip } from '@/pages/ExplorePage';
import { dateAt, tripStartDate, vietnamNow } from '@/utils/tripDates';

export interface RouteStop {
  order: number;
  poi_id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // GeoJSON format: [longitude, latitude]
}

export interface DayRouteResponse {
  itinerary_id: string;
  day_number: number;
  total_days?: number;
  total_stops: number;
  stops: RouteStop[];
  route: RouteGeometry;
  distance_meters: number;
  duration_seconds: number;
  is_fallback?: boolean;
  routing_provider?: string;
}

/**
 * Fetch ordered route geometry and stops for a specific day of an itinerary.
 * Backend endpoint: GET /itineraries/{itinerary_id}/days/{day_number}/route
 */
export async function fetchDayRoute(
  itineraryId: string,
  dayNumber: number,
  signal?: AbortSignal
): Promise<DayRouteResponse> {
  const cleanItinId = encodeURIComponent(itineraryId.trim());
  return fetchJson<DayRouteResponse>(
    `/itineraries/${cleanItinId}/days/${dayNumber}/route`,
    { signal }
  );
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 phút';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours} giờ ${remMinutes}p` : `${hours} giờ`;
}

export function formatDistance(meters: number): string {
  if (meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export interface ComputedRouteResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  durationText: string;
}

function calculateHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// High-fidelity road corridor waypoints [lat, lng] along QL1A hugging the land and coast, never crossing open water
export const HIGHWAY_QL1A_DANANG_HUE: [number, number][] = [
  [16.0685, 108.1835], // Cầu vượt Ngã Ba Huế (Trung tâm Đà Nẵng)
  [16.0780, 108.1750], // Bến xe Trung tâm Đà Nẵng
  [16.0900, 108.1680], // Đường Tôn Đức Thắng (Hòa Khánh Nam)
  [16.1150, 108.1550], // Đường Nguyễn Lương Bằng (Liên Chiểu)
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

// Đường tránh Vịnh Đà Nẵng: Tuyệt đối không vẽ đường thẳng cắt ngang mặt nước vịnh
export const DA_NANG_BAY_LAND_BYPASS: [number, number][] = [
  [16.1360, 108.1360], // Cầu Nam Ô
  [16.1150, 108.1550], // Nguyễn Lương Bằng
  [16.0900, 108.1680], // Tôn Đức Thắng
  [16.0780, 108.1750], // Bến xe Trung tâm Đà Nẵng
  [16.0685, 108.1835], // Cầu vượt Ngã Ba Huế
  [16.0650, 108.1980], // Đường Điện Biên Phủ
  [16.0620, 108.2120], // Trung tâm Hải Châu
];

export function buildRoadCorridor(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): [number, number][] {
  // Tuyến Đà Nẵng <-> Huế (vượt Đèo Hải Vân, Lăng Cô, vòng qua chân núi tránh Đầm Cầu Hai)
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

  // Kết nối giữa Bắc Đà Nẵng (Nam Ô / Hải Vân) và Nam/Đông Đà Nẵng (Hải Châu / Thanh Khê / Sơn Trà)
  // Tuyệt đối không để đường cắt ngang mặt biển Vịnh Đà Nẵng
  const isNorthFrom = fromLat > 16.12 && fromLng < 108.15;
  const isSouthTo = toLat <= 16.10 && toLng >= 108.16;
  const isSouthFrom = fromLat <= 16.10 && fromLng >= 108.16;
  const isNorthTo = toLat > 16.12 && toLng < 108.15;

  if (isNorthFrom && isSouthTo) {
    return DA_NANG_BAY_LAND_BYPASS.map(([lat, lng]) => [lat, lng]);
  }
  if (isSouthFrom && isNorthTo) {
    return DA_NANG_BAY_LAND_BYPASS.slice().reverse().map(([lat, lng]) => [lat, lng]);
  }

  // Đi trong cùng thành phố / khu vực: tạo 2 điểm uốn cong tự nhiên theo đường phố
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  const dist = Math.hypot(dLat, dLng);

  if (dist > 0.005) {
    const offset = Math.min(dist * 0.18, 0.005);
    const p1: [number, number] = [fromLat + dLat * 0.35 + offset, fromLng + dLng * 0.35 - offset * 0.5];
    const p2: [number, number] = [fromLat + dLat * 0.70 - offset * 0.5, fromLng + dLng * 0.70 + offset];
    return [p1, p2];
  }

  return [];
}

const SAMPLE_DAY_ROUTES: Record<number, { coords: [number, number][]; dist: number; dur: number }> = {
  1: {
    // Ngày 1: Cầu Rồng -> Chợ Hàn -> Chùa Linh Ứng Bãi Bụt
    coords: [
      [16.0611, 108.2270],
      [16.0645, 108.2250],
      [16.0678, 108.2208],
      [16.0750, 108.2280],
      [16.0850, 108.2350],
      [16.0950, 108.2550],
      [16.1005, 108.2778],
    ],
    dist: 13900,
    dur: 1105,
  },
  2: {
    // Ngày 2: Ngũ Hành Sơn -> Bãi biển Mỹ Khê
    coords: [
      [16.0044, 108.2635],
      [16.0200, 108.2580],
      [16.0350, 108.2500],
      [16.0500, 108.2450],
      [16.0592, 108.2435],
    ],
    dist: 8200,
    dur: 720,
  },
  3: {
    // Ngày 3: Bà Nà Hills
    coords: [
      [16.0680, 108.2220],
      [16.0500, 108.1500],
      [16.0200, 108.0800],
      [15.9988, 107.9960],
    ],
    dist: 36000,
    dur: 2700,
  },
  4: {
    // Ngày 4: Đại Nội Huế -> Chùa Thiên Mụ -> Chợ Đông Ba Huế
    coords: [
      [16.4699, 107.5779],
      [16.4600, 107.5600],
      [16.4533, 107.5451],
      [16.4620, 107.5680],
      [16.4719, 107.5878],
    ],
    dist: 9800,
    dur: 840,
  },
  5: {
    // Ngày 5: Lăng Khải Định -> Lăng Tự Đức
    coords: [
      [16.3989, 107.5904],
      [16.4150, 107.5800],
      [16.4331, 107.5658],
    ],
    dist: 7600,
    dur: 680,
  },
};

/**
 * Cache in-memory tuyến đường phía Frontend để chuyển ngày / chuyển tab tức thì (0ms)
 */
const routeMemoryCache = new Map<string, ComputedRouteResult>();

/**
 * Xây dựng lộ trình dự phòng tuân thủ nghiêm ngặt mạng lưới đường bộ trên đất liền,
 * tuyệt đối không vẽ đường thẳng bay ngang biển Vịnh Đà Nẵng hay Đầm Cầu Hai.
 */
export function buildFallbackRoadCorridor(
  stops: { latitude?: number | null; longitude?: number | null; [key: string]: unknown }[]
): ComputedRouteResult {
  const validStops = stops
    .filter((s) => s.latitude != null && s.longitude != null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s) => ({ latitude: Number(s.latitude), longitude: Number(s.longitude) }));

  if (validStops.length < 2) {
    return {
      coordinates: validStops.map((s) => [s.latitude, s.longitude]),
      distanceMeters: 0,
      durationSeconds: 0,
      durationText: '',
    };
  }

  const fullCoords: [number, number][] = [];
  let totalDistMeters = 0;

  for (let i = 0; i < validStops.length - 1; i++) {
    const from = validStops[i];
    const to = validStops[i + 1];

    if (i === 0) {
      fullCoords.push([from.latitude, from.longitude]);
    }

    const corridor = buildRoadCorridor(from.latitude, from.longitude, to.latitude, to.longitude);
    fullCoords.push(...corridor);
    fullCoords.push([to.latitude, to.longitude]);

    const legDist = calculateHaversineMeters(from.latitude, from.longitude, to.latitude, to.longitude) * 1.25;
    totalDistMeters += legDist;
  }

  const durationSec = Math.max(300, Math.round((totalDistMeters / 1000 / 45) * 3600));

  return {
    coordinates: fullCoords,
    distanceMeters: Math.round(totalDistMeters),
    durationSeconds: durationSec,
    durationText: `${formatDuration(durationSec)} (${formatDistance(totalDistMeters)})`,
  };
}

/**
 * Tính toán tọa độ đường đi (Leaflet [lat, lng]) từ danh sách điểm dừng qua GreenTrip BE hoặc OSRM
 */
export async function getRoutePositionsForStops(
  stops: { latitude?: number | null; longitude?: number | null; poi_id?: string | null; stop_id?: string; title?: string; name?: string }[],
  itineraryId?: string,
  dayNumber?: number
): Promise<ComputedRouteResult> {
  const validStops = stops
    .filter((s) => s.latitude != null && s.longitude != null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s, idx) => ({
      order: idx + 1,
      poi_id: s.poi_id || s.stop_id || `stop-${idx}`,
      name: s.title || s.name || `Điểm ${idx + 1}`,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
    }));

  if (validStops.length < 2) {
    const singleCoords: [number, number][] = validStops.map((s) => [s.latitude, s.longitude]);
    return {
      coordinates: singleCoords,
      distanceMeters: 0,
      durationSeconds: 0,
      durationText: '',
    };
  }

  // 1. Kiểm tra cache phía Frontend để phản hồi tức thì
  const cacheKey = `${itineraryId || 'anon'}-${dayNumber || 0}-${validStops.map((s) => `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`).join(';')}`;
  if (routeMemoryCache.has(cacheKey)) {
    return routeMemoryCache.get(cacheKey)!;
  }

  // 2. Thử gọi backend /api/itineraries/{id}/days/{day}/route nếu là chuyến đi mẫu có sẵn trong DB
  if (itineraryId && typeof dayNumber === 'number' && dayNumber >= 1 && (itineraryId.startsWith('sample-') || itineraryId.startsWith('trip-danang'))) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const resp = await fetchDayRoute(itineraryId, dayNumber, controller.signal);
      clearTimeout(timer);
      if (resp?.route?.coordinates && resp.route.coordinates.length >= 2) {
        const coords: [number, number][] = resp.route.coordinates.map(([lng, lat]) => [lat, lng]);
        const dist = resp.distance_meters || 0;
        const dur = resp.duration_seconds || 0;
        const result: ComputedRouteResult = {
          coordinates: coords,
          distanceMeters: dist,
          durationSeconds: dur,
          durationText: `${formatDuration(dur)} (${formatDistance(dist)})`,
        };
        routeMemoryCache.set(cacheKey, result);
        return result;
      }
    } catch {
      // Tiếp tục qua compute API
    }
  }

  // 3. Gọi backend /itineraries/compute với danh sách stops (timeout 9s để OSRM tính toán đầy đủ hàng nghìn điểm GPS)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const computed = await fetchJson<DayRouteResponse>('/itineraries/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: validStops }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (computed?.route?.coordinates && computed.route.coordinates.length >= 2) {
      const coords: [number, number][] = computed.route.coordinates.map(([lng, lat]) => [lat, lng]);
      const dist = computed.distance_meters || 0;
      const dur = computed.duration_seconds || 0;
      const result: ComputedRouteResult = {
        coordinates: coords,
        distanceMeters: dist,
        durationSeconds: dur,
        durationText: `${formatDuration(dur)} (${formatDistance(dist)})`,
      };
      routeMemoryCache.set(cacheKey, result);
      return result;
    }
  } catch {
    // Tiếp tục qua fallback
  }

  // 4. Nếu là chuyến đi mẫu Ngày 1 và không có tọa độ cá nhân đặc biệt, dùng lộ trình mẫu của Lợi
  if (typeof dayNumber === 'number' && SAMPLE_DAY_ROUTES[dayNumber]) {
    const tmpl = SAMPLE_DAY_ROUTES[dayNumber];
    const isSampleTrip = Boolean(itineraryId && (itineraryId.startsWith('sample-') || itineraryId.startsWith('trip-danang')));
    if (isSampleTrip && dayNumber === 1 && validStops.length <= 4) {
      const allInDaNang = validStops.every((s) => s.latitude < 16.2 && s.longitude > 108.0);
      if (allInDaNang) {
        const result: ComputedRouteResult = {
          coordinates: tmpl.coords,
          distanceMeters: tmpl.dist,
          durationSeconds: tmpl.dur,
          durationText: `${formatDuration(tmpl.dur)} (${formatDistance(tmpl.dist)})`,
        };
        routeMemoryCache.set(cacheKey, result);
        return result;
      }
    }
  }

  // 5. Fallback chuẩn: Tạo đường đi thực tế men theo các hành lang QL1A trên đất liền, tuyệt đối không ra biển
  const fallbackResult = buildFallbackRoadCorridor(validStops);
  routeMemoryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

export type ItineraryStopType = 'poi' | 'rest' | 'custom';

export interface ItineraryStop {
  stop_id: string;
  poi_id: string | null;
  title: string;
  city: string | null;
  address: string | null;
  category: string | null;
  stop_type: ItineraryStopType;
  source: 'idea' | 'manual' | 'assistant';
  sequence: number;
  duration_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  comment: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ItineraryDay {
  day_id: string;
  day_number: number;
  date: string | null;
  title: string;
  note?: string;
  stops: ItineraryStop[];
}

export interface TripItinerary {
  trip_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  days_count: number;
  days: ItineraryDay[];
  updated_at?: string | null;
}

export function createEmptyItinerary(trip: UserTrip): TripItinerary {
  const count = Math.max(1, Math.min(31, trip.daysCount || 1));
  const start = tripStartDate(trip.startDate);
  return {
    trip_id: trip.id,
    title: trip.title,
    destination: trip.destination,
    start_date: start,
    days_count: count,
    days: Array.from({ length: count }, (_, index) => ({
      day_id: `${trip.id}-day-${index + 1}`,
      day_number: index + 1,
      date: start ? dateAt(start, index) : null,
      title: '',
      note: '',
      stops: [],
    })),
  };
}

export function matchPoiForStop(
  rawId?: string | null,
  rawName?: string | null,
  allPois: Poi[] = []
): Poi | undefined {
  if (allPois.length === 0) return undefined;
  if (rawId) {
    const byId = allPois.find((p) => p.id === rawId);
    if (byId) return byId;
  }
  const key = (rawName || '').trim().toLowerCase();
  if (!key) return undefined;
  const exact = allPois.find((p) => p.name.trim().toLowerCase() === key);
  if (exact) return exact;

  const cleanTokens = [
    key,
    ...key
      .replace(/\([^)]*\)/g, '')
      .split(/[&–-]/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 5),
  ];

  return allPois.find((p) => {
    const pName = p.name.trim().toLowerCase();
    return cleanTokens.some((tok) => (tok.length >= 5 && pName.includes(tok)) || (pName.length >= 5 && tok.includes(pName)));
  });
}

export function hydrateItineraryWithPois(
  itinerary: TripItinerary,
  allPois: Poi[]
): { itinerary: TripItinerary; changed: boolean } {
  if (allPois.length === 0) return { itinerary, changed: false };
  let changed = false;
  const days = itinerary.days.map((day) => {
    const stops = day.stops.map((stop) => {
      if (stop.stop_type === 'rest') return stop;
      const hasValidId = Boolean(stop.poi_id && allPois.some((p) => p.id === stop.poi_id));
      const hasCoords = typeof stop.latitude === 'number' && typeof stop.longitude === 'number';
      if (hasValidId && hasCoords) return stop;

      const matched = matchPoiForStop(stop.poi_id, stop.title, allPois);
      if (!matched) return stop;
      changed = true;
      return {
        ...stop,
        poi_id: matched.id,
        address: stop.address || matched.address || null,
        city: matched.city || stop.city,
        latitude: stop.latitude ?? matched.lat,
        longitude: stop.longitude ?? matched.lng,
      };
    });
    return { ...day, stops };
  });
  return changed ? { itinerary: { ...itinerary, days }, changed: true } : { itinerary, changed: false };
}

export function buildItineraryFromOutline(trip: UserTrip, allPois: Poi[] = []): TripItinerary {
  const base = createEmptyItinerary(trip);
  const outline = trip.itineraryOutline;
  if (!Array.isArray(outline) || outline.length === 0) return base;

  const seenStopIds = new Set<string>();

  const padTime = (raw?: string | null): string | null => {
    if (!raw) return null;
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const findPoi = (rawId?: string | null, rawName?: string | null): Poi | undefined =>
    matchPoiForStop(rawId, rawName, allPois);

  const days = base.days.map((day, idx) => {
    const oDay = outline.find((d) => Number(d?.day) === day.day_number) || outline[idx];
    if (!oDay || !Array.isArray(oDay.stops)) return day;

    const acceptedWindows: Array<{ start: number; end: number }> = [];

    const stops: ItineraryStop[] = oDay.stops.map((stopItem, sIdx: number) => {
      const rawStop = stopItem as unknown as Record<string, unknown>;
      const rawTitle = String(rawStop.name || rawStop.title || `Điểm dừng ${sIdx + 1}`);
      const rawPoiId = (rawStop.poiId || rawStop.poi_id) ? String(rawStop.poiId || rawStop.poi_id) : null;
      const isRest = rawStop.stop_type === 'rest';
      const matched = isRest ? undefined : findPoi(rawPoiId, rawTitle);

      const baseStopId = String(rawStop.stop_id || rawStop.id || `${day.day_id}-stop-${sIdx + 1}`);
      let stopId = baseStopId;
      let dupCounter = 1;
      while (seenStopIds.has(stopId)) {
        stopId =
          dupCounter === 1
            ? `${baseStopId}-d${day.day_number}-${sIdx + 1}`
            : `${baseStopId}-d${day.day_number}-${sIdx + 1}-${dupCounter}`;
        dupCounter += 1;
      }
      seenStopIds.add(stopId);

      const ts = typeof rawStop.timeSlot === 'string' ? rawStop.timeSlot : '';
      const tsMatch = ts.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
      let startTime = padTime(typeof rawStop.start_time === 'string' ? rawStop.start_time : tsMatch?.[1]);
      let endTime = padTime(typeof rawStop.end_time === 'string' ? rawStop.end_time : tsMatch?.[2]);

      if (startTime && endTime) {
        const sMin = minutesFromTime(startTime);
        const eMin = minutesFromTime(endTime);
        const overlaps = acceptedWindows.some((w) => sMin < w.end && w.start < eMin);
        if (eMin > sMin && !overlaps) {
          acceptedWindows.push({ start: sMin, end: eMin });
        } else {
          startTime = null;
          endTime = null;
        }
      } else {
        startTime = null;
        endTime = null;
      }

      const computedDur = startTime && endTime ? durationBetween(startTime, endTime) : null;
      const duration =
        (typeof rawStop.duration_minutes === 'number' && rawStop.duration_minutes > 0 ? rawStop.duration_minutes : null) ??
        computedDur ??
        matched?.average_visit_minutes ??
        90;

      return {
        stop_id: stopId,
        poi_id: isRest ? null : (matched?.id ?? rawPoiId),
        title: matched?.name ?? rawTitle,
        city: matched?.city ?? (typeof rawStop.city === 'string' ? rawStop.city : (oDay.focus_city || trip.destination || null)),
        address: matched?.address ?? (typeof rawStop.address === 'string' ? rawStop.address : null),
        category: matched?.category ?? (typeof rawStop.category === 'string' ? rawStop.category : null),
        stop_type: isRest ? 'rest' : 'poi',
        source: 'assistant',
        sequence: sIdx,
        duration_minutes: duration,
        start_time: startTime,
        end_time: endTime,
        comment: null,
        latitude: isRest ? null : (matched?.lat ?? (typeof rawStop.latitude === 'number' ? rawStop.latitude : null)),
        longitude: isRest ? null : (matched?.lng ?? (typeof rawStop.longitude === 'number' ? rawStop.longitude : null)),
      };
    });

    return {
      ...day,
      title: typeof oDay.theme === 'string' ? oDay.theme : day.title,
      stops,
    };
  });

  return { ...base, days };
}

export function stopFromPoi(poi: Poi, source: 'idea' | 'manual' | 'assistant' = 'idea'): ItineraryStop {
  const isCustom = poi.id.startsWith('custom-');
  const durationText = poi.visitDuration || '';
  const durationRange = durationText.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/);
  const durationMatch = durationText.match(/\d+(?:\.\d+)?/);
  const amount = durationRange
    ? (Number(durationRange[1]) + Number(durationRange[2])) / 2
    : durationMatch ? Number(durationMatch[0]) : null;
  const unit = /phút/i.test(durationText) ? 1 : /giờ|hour/i.test(durationText) ? 60 : null;
  const duration = isCustom ? null : poi.average_visit_minutes ?? (amount !== null && unit ? Math.round(amount * unit) : null);
  return {
    stop_id: globalThis.crypto?.randomUUID?.() || `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    poi_id: isCustom ? null : poi.id,
    title: poi.name,
    city: poi.city || null,
    address: poi.address || null,
    category: isCustom ? 'Địa điểm tự thêm' : poi.category || null,
    stop_type: isCustom ? 'custom' : 'poi',
    source,
    sequence: 0,
    duration_minutes: duration,
    start_time: null,
    end_time: null,
    comment: null,
    latitude: isCustom ? null : Number.isFinite(poi.lat) ? poi.lat : null,
    longitude: isCustom ? null : Number.isFinite(poi.lng) ? poi.lng : null,
  };
}

const itineraryWrites = new Map<string, Promise<TripItinerary>>();
const itineraryReads = new Map<string, Promise<TripItinerary>>();

export async function getTripItinerary(tripId: string): Promise<TripItinerary> {
  const existingRead = itineraryReads.get(tripId);
  if (existingRead) return existingRead;

  const fetchPromise = (async () => {
    await itineraryWrites.get(tripId)?.catch(() => undefined);
    const key = `greentrip_itinerary_${tripId}`;
    const cacheBeforeRead = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    try {
      const remote = await fetchJson<TripItinerary>(`/trips/${encodeURIComponent(tripId)}/itinerary`);
      if (remote && remote.trip_id) {
        try {
          if (typeof localStorage !== 'undefined') {
            const current = localStorage.getItem(key);
            if (current && current !== cacheBeforeRead) return JSON.parse(current) as TripItinerary;
            localStorage.setItem(key, JSON.stringify(remote));
          }
        } catch (e) {
          console.warn('Failed to cache itinerary to localStorage', e);
        }
        return remote;
      }
    } catch (err) {
      const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      if (localRaw) {
        try {
          return JSON.parse(localRaw) as TripItinerary;
        } catch (e) {
          console.warn('Failed to parse localStorage itinerary', e);
        }
      }
      throw err;
    }
    const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (localRaw) {
      return JSON.parse(localRaw) as TripItinerary;
    }
    throw new Error(`Itinerary not found for trip ${tripId}`);
  })();

  itineraryReads.set(tripId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    itineraryReads.delete(tripId);
  }
}

export function scheduleError(next: TripItinerary, previous?: TripItinerary | null): string {
  const old = new Map(
    previous?.days.flatMap((day) =>
      day.stops.map((stop) => [
        stop.stop_id,
        {
          date: day.date || (previous.start_date ? dateAt(previous.start_date, day.day_number - 1) : null),
          time: stop.start_time,
          end: stop.end_time,
        },
      ] as const)
    )
  );
  const now = vietnamNow();
  const prevStart = tripStartDate(previous?.start_date);
  const nextStart = tripStartDate(next.start_date);
  const isTripShiftForward = Boolean(
    previous &&
      nextStart &&
      nextStart >= now.date &&
      (!prevStart || nextStart > prevStart)
  );

  for (const day of next.days) {
    const date = day.date || (next.start_date ? dateAt(next.start_date, day.day_number - 1) : null);
    for (const stop of day.stops) {
      if (!date || !stop.start_time) continue;
      const before = old.get(stop.stop_id);
      if (before?.date === date && before.time === stop.start_time && before.end === stop.end_time) continue;
      if (isTripShiftForward && before && before.time === stop.start_time && before.end === stop.end_time && date >= now.date) {
        continue;
      }
      if (prevStart && nextStart === prevStart && nextStart < now.date && before) {
        continue;
      }
      const [hour, minute] = stop.start_time.split(':').map(Number);
      if (date < now.date || (date === now.date && hour * 60 + minute < now.minutes)) {
        return 'Không thể thêm hoặc dời hoạt động vào quá khứ (giờ Việt Nam).';
      }
    }
  }
  return '';
}

export async function saveTripItinerary(itinerary: TripItinerary): Promise<TripItinerary> {
  const storageKey = `greentrip_itinerary_${itinerary.trip_id}`;
  const writePromise = (async () => {
    let previous: TripItinerary | null = null;
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
      if (raw) previous = JSON.parse(raw) as TripItinerary;
    } catch {
      previous = null;
    }
    if (!previous) {
      try {
        previous = await fetchJson<TripItinerary>(`/trips/${encodeURIComponent(itinerary.trip_id)}/itinerary`);
      } catch {
        previous = null;
      }
    }

    const validationMessage = scheduleError(itinerary, previous);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    try {
      const saved = await fetchJson<TripItinerary>(`/trips/${encodeURIComponent(itinerary.trip_id)}/itinerary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itinerary),
      });
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(saved));
        }
      } catch (e) {
        console.warn('Failed to save itinerary to localStorage', e);
      }
      return saved;
    } catch (err) {
      console.warn('Backend saveTripItinerary failed, using local storage state', err);
      // Keep offline edits available locally, but do not hide server validation or
      // authorization errors: the UI needs to let travelers correct those cases.
      if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') {
        throw err;
      }
      const fallback = {
        ...itinerary,
        updated_at: new Date().toISOString(),
      };
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(storageKey, JSON.stringify(fallback));
        }
      } catch (e) {
        console.warn('Failed to save itinerary to localStorage', e);
      }
      return fallback;
    }
  })();

  itineraryWrites.set(itinerary.trip_id, writePromise);
  try {
    return await writePromise;
  } finally {
    if (itineraryWrites.get(itinerary.trip_id) === writePromise) {
      itineraryWrites.delete(itinerary.trip_id);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// THUẬT TOÁN TỐI ƯU HÀNH TRÌNH, PHÂN BỔ Ý TƯỞNG & NGHỈ TRƯA PB11
// ─────────────────────────────────────────────────────────────

export function minutesFor(stop: ItineraryStop): number {
  return stop.duration_minutes || 90;
}

export function pacingForTrip(trip: UserTrip): 'Relaxed' | 'Balanced' | 'Fast' {
  if (trip.pacingLevel === 'Relaxed' || trip.pacingLevel === 'Balanced' || trip.pacingLevel === 'Fast') return trip.pacingLevel;
  if (trip.pacingLabel?.includes('Thong thả')) return 'Relaxed';
  if (trip.pacingLabel?.includes('Dày đặc')) return 'Fast';
  return 'Balanced';
}

export function dailyVisitCapacity(level: 'Relaxed' | 'Balanced' | 'Fast'): number {
  if (level === 'Relaxed') return 210;
  if (level === 'Fast') return 330;
  return 270;
}

export interface AutomaticPoiSelection {
  selected: Poi[];
  added: Poi[];
  selectedCost: number;
  limits: { target: number; destination: number; time: number; budget: number; category: number };
  targetStops: number;
  budgetLimit: number;
}

/** Selects user ideas first, then fills the remaining pace-based capacity with ranked suggestions. */
export function selectAutomaticPois(
  days: ItineraryDay[],
  ideas: Poi[],
  recommendations: Poi[],
  trip: UserTrip,
  pacing: 'Relaxed' | 'Balanced' | 'Fast',
  dailyCapacity: number,
): AutomaticPoiSelection {
  const people = Math.max(1, trip.peopleCount || 1);
  const dayCount = Math.max(1, days.length);
  const targetPerDay = pacing === 'Relaxed' ? 2 : pacing === 'Fast' ? 5 : 3;
  const targetStops = dayCount * targetPerDay;
  const activityBudget = trip.costBreakdown?.activities_and_tickets
    ?? (trip.totalBudget != null ? trip.totalBudget * 0.25 : Number.POSITIVE_INFINITY);
  const budgetLimit = Number.isFinite(activityBudget) ? activityBudget : Number.POSITIVE_INFINITY;
  const existingStops = days.flatMap((day) => day.stops.filter((stop) => stop.stop_type !== 'rest'));
  const placedIds = new Set(existingStops.map((stop) => stop.poi_id).filter((id): id is string => Boolean(id)));
  const placedCustomNames = new Set(existingStops
    .filter((stop) => stop.stop_type === 'custom')
    .map((stop) => stop.title.trim().toLocaleLowerCase('vi-VN')));
  const isAlreadyPlaced = (poi: Poi) => placedIds.has(poi.id)
    || (poi.id.startsWith('custom-') && placedCustomNames.has(poi.name.trim().toLocaleLowerCase('vi-VN')));
  const existingIdeaIds = new Set(ideas.map((poi) => poi.id));
  const recommendationOnly = recommendations.filter((poi) => !existingIdeaIds.has(poi.id));
  const placedPois = [...ideas, ...recommendationOnly].filter(isAlreadyPlaced);
  const estimatedGroupCost = (poi: Poi) => Math.max(0, poi.estimatedCost || 0) * people;
  let selectedCost = [...ideas, ...recommendationOnly.filter(isAlreadyPlaced)]
    .reduce((total, poi) => total + estimatedGroupCost(poi), 0);
  const selected = [...ideas];
  const added: Poi[] = [];
  const seen = new Set([...placedIds, ...ideas.map((poi) => poi.id)]);
  const baseMinutes = existingStops.reduce((total, stop) => total + minutesFor(stop), 0)
    + ideas.filter((poi) => !isAlreadyPlaced(poi)).reduce((total, poi) => total + minutesFor(stopFromPoi(poi)), 0);
  let remainingMinutes = Math.max(0, dayCount * dailyCapacity - baseMinutes);
  let remainingSlots = Math.max(0, targetStops - existingStops.length - ideas.filter((poi) => !isAlreadyPlaced(poi)).length);
  const limits = { target: 0, destination: 0, time: 0, budget: 0, category: 0 };
  const categoryCounts = new Map<string, number>();
  [...placedPois, ...ideas.filter((poi) => !isAlreadyPlaced(poi))].forEach((poi) => {
    categoryCounts.set(poi.category, (categoryCounts.get(poi.category) || 0) + 1);
  });
  const categoryCount = Math.max(1, new Set([...ideas, ...recommendationOnly].map((poi) => poi.category)).size);
  const categoryLimit = Math.max(2, Math.ceil(targetStops / categoryCount));
  const includesDaNang = /đà\s*nẵng|da\s*nang/i.test(trip.destination);
  const includesHue = /huế|hue/i.test(trip.destination);

  for (const poi of recommendationOnly) {
    if (seen.has(poi.id)) continue;
    if (remainingSlots <= 0) {
      limits.target += 1;
      continue;
    }
    const inDestination = (includesDaNang && /đà\s*nẵng|da\s*nang/i.test(poi.city))
      || (includesHue && /huế|hue/i.test(poi.city))
      || (!includesDaNang && !includesHue);
    if (!inDestination) {
      limits.destination += 1;
      continue;
    }
    const candidateMinutes = minutesFor(stopFromPoi(poi));
    const cost = estimatedGroupCost(poi);
    if (candidateMinutes > remainingMinutes) {
      limits.time += 1;
      continue;
    }
    if (selectedCost + cost > budgetLimit) {
      limits.budget += 1;
      continue;
    }
    if ((categoryCounts.get(poi.category) || 0) >= categoryLimit) {
      limits.category += 1;
      continue;
    }
    selected.push(poi);
    added.push(poi);
    seen.add(poi.id);
    selectedCost += cost;
    remainingMinutes -= candidateMinutes;
    remainingSlots -= 1;
    categoryCounts.set(poi.category, (categoryCounts.get(poi.category) || 0) + 1);
  }

  return { selected, added, selectedCost, limits, targetStops, budgetLimit };
}

export function durationBetween(start: string, end: string): number | null {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function clearOverlappingVisitTimes(plan: TripItinerary): { plan: TripItinerary; repairedCount: number } {
  let repairedCount = 0;
  const days = plan.days.map((day) => {
    const stops = day.stops.map((stop) => ({ ...stop }));
    // Keep explicit user appointments when possible. Clear only the conflicting
    // visit's time fields so its place and other edits stay intact.
    for (let pass = 0; pass < stops.length; pass += 1) {
      const timed = stops
        .map((stop, index) => ({ stop, index }))
        .filter(({ stop }) => stop.start_time && stop.end_time)
        .sort((a, b) => a.stop.start_time!.localeCompare(b.stop.start_time!));
      const conflict = timed.findIndex(({ stop }, index) => index > 0
        && stop.start_time! < timed[index - 1].stop.end_time!);
      if (conflict < 0) break;
      const previous = timed[conflict - 1];
      const current = timed[conflict];
      const victim = previous.stop.source === 'manual' && current.stop.source !== 'manual'
        ? current
        : current.stop.source === 'manual' && previous.stop.source !== 'manual'
          ? previous
          : current;
      stops[victim.index] = { ...victim.stop, start_time: null, end_time: null };
      repairedCount += 1;
    }
    return { ...day, stops };
  });
  return { plan: { ...plan, days }, repairedCount };
}

export function minutesFromTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function findRestSlot(day: ItineraryDay, timeRange: string, duration: number): { start: string; end: string } | null {
  const match = timeRange.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
  if (!match) return null;
  const windowStart = minutesFromTime(match[1]);
  const windowEnd = minutesFromTime(match[2]);
  for (let start = windowStart; start + duration <= windowEnd; start += 15) {
    const end = start + duration;
    const overlaps = day.stops.some((stop) => {
      if (!stop.start_time || !stop.end_time) return false;
      return start < minutesFromTime(stop.end_time) && minutesFromTime(stop.start_time) < end;
    });
    if (!overlaps) return { start: timeFromMinutes(start), end: timeFromMinutes(end) };
  }
  return null;
}

export function restExistsInPeriod(day: ItineraryDay, timeRange: string): boolean {
  const match = timeRange.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
  if (!match) return false;
  const start = minutesFromTime(match[1]);
  const end = minutesFromTime(match[2]);
  return day.stops.some((stop) => stop.stop_type === 'rest' && stop.start_time
    && minutesFromTime(stop.start_time) >= start && minutesFromTime(stop.start_time) < end);
}

export function insertRestInOrder(stops: ItineraryStop[], rest: ItineraryStop): void {
  const startMinute = rest.start_time ? minutesFromTime(rest.start_time) : 12 * 60;
  const laterTimedStop = stops.findIndex((stop) => stop.start_time && minutesFromTime(stop.start_time) >= startMinute);
  if (laterTimedStop >= 0) {
    stops.splice(laterTimedStop, 0, rest);
    return;
  }
  if (rest.start_time && stops.some((stop) => Boolean(stop.start_time))) {
    stops.push(rest);
    return;
  }
  const targetVisitMinutes = startMinute < 11 * 60 ? 90 : 180;
  let accumulated = 0;
  let insertAt = 0;
  while (insertAt < stops.length && accumulated < targetVisitMinutes) {
    if (stops[insertAt].stop_type !== 'rest') accumulated += minutesFor(stops[insertAt]);
    insertAt += 1;
  }
  stops.splice(insertAt, 0, rest);
}

export function distanceKm(a: { latitude?: number | null; longitude?: number | null }, b: { latitude?: number | null; longitude?: number | null }): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const originLat = radians(a.latitude);
  const targetLat = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(originLat) * Math.cos(targetLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function normalizeSequence(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((day) => ({ ...day, stops: day.stops.map((stop, index) => ({ ...stop, sequence: index })) }));
}

export function alignItineraryToTrip(itinerary: TripItinerary, trip: UserTrip): { itinerary: TripItinerary; changed: boolean; warning: string } {
  const requestedDays = Math.max(1, Math.min(31, trip.daysCount || itinerary.days_count));
  const nextStart = tripStartDate(trip.startDate);
  const days = [...itinerary.days].sort((a, b) => a.day_number - b.day_number);
  let warning = '';
  let changed =
    itinerary.title !== trip.title ||
    itinerary.destination !== trip.destination ||
    (itinerary.start_date || null) !== nextStart;

  if (requestedDays < days.length) {
    const overflowDays = days.slice(requestedDays);
    const overflowStops = overflowDays.reduce((total, day) => total + day.stops.length, 0);
    if (overflowStops > 0) {
      warning = `Chuyến đã rút còn ${requestedDays} ngày nhưng ${overflowStops} địa điểm vẫn nằm ở các ngày phía sau. Chuyển hoặc xóa các địa điểm đó; lịch giữ nguyên để tránh mất dữ liệu.`;
    } else {
      days.splice(requestedDays);
      changed = true;
    }
  } else if (requestedDays > days.length) {
    for (let dayNumber = days.length + 1; dayNumber <= requestedDays; dayNumber += 1) {
      days.push({
        day_id: `${itinerary.trip_id}-day-${dayNumber}`,
        day_number: dayNumber,
        date: nextStart ? dateAt(nextStart, dayNumber - 1) : null,
        title: '',
        note: '',
        stops: [],
      });
    }
    changed = true;
  }

  const alignedDays = normalizeSequence(
    days.map((day, index) => {
      const nextDate = nextStart ? dateAt(nextStart, index) : null;
      if ((day.date || null) !== nextDate) changed = true;
      return { ...day, day_number: index + 1, date: nextDate };
    })
  );
  const nextItinerary: TripItinerary = {
    ...itinerary,
    title: trip.title,
    destination: trip.destination,
    start_date: nextStart,
    days_count: alignedDays.length,
    days: alignedDays,
  };
  changed ||= nextItinerary.days_count !== itinerary.days_count;
  return { itinerary: nextItinerary, changed, warning };
}

export function normalizeLegacyLunchBreaks(itinerary: TripItinerary): { itinerary: TripItinerary; changed: boolean } {
  let changed = false;
  const days = itinerary.days.map((day) => {
    const restIndex = day.stops.findIndex((stop) => stop.stop_type === 'rest' && stop.source === 'assistant');
    if (restIndex < 0) return day;

    const rest = day.stops[restIndex];
    if (rest.start_time && rest.end_time) return day;

    changed = true;
    const places = day.stops.filter((stop) => stop.stop_id !== rest.stop_id);
    const lunchBreak: ItineraryStop = {
      ...rest,
      title: 'Nghỉ trưa & phục hồi',
      duration_minutes: 90,
      start_time: rest.start_time || '12:00',
      end_time: rest.end_time || '13:30',
    };

    let morningMinutes = 0;
    let insertAt = 0;
    while (insertAt < places.length) {
      const nextDuration = minutesFor(places[insertAt]);
      if (insertAt > 0 && morningMinutes + nextDuration > 180) break;
      morningMinutes += nextDuration;
      insertAt += 1;
    }
    places.splice(insertAt, 0, lunchBreak);
    return { ...day, stops: places };
  });

  return { itinerary: { ...itinerary, days: normalizeSequence(days) }, changed };
}

function resolveStopCoordinates(
  stop: Pick<ItineraryStop, 'poi_id' | 'latitude' | 'longitude'>,
  poiById?: Map<string, Poi>
): { latitude: number; longitude: number } | null {
  if (
    stop.latitude != null &&
    stop.longitude != null &&
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude)
  ) {
    return { latitude: stop.latitude, longitude: stop.longitude };
  }
  const matched = stop.poi_id ? poiById?.get(stop.poi_id) : undefined;
  if (matched && Number.isFinite(matched.lat) && Number.isFinite(matched.lng)) {
    return { latitude: matched.lat, longitude: matched.lng };
  }
  return null;
}

// # ponytail: Heuristically scale Haversine legs by 1.18 to match buildRoadFallback urban detour ratio.
const ROAD_DETOUR_FACTOR = 1.18;

export function calculateStopsPathKm(
  stops: ItineraryStop[],
  poiById?: Map<string, Poi>,
  withRoadFactor = false
): number {
  const factor = withRoadFactor ? ROAD_DETOUR_FACTOR : 1;
  let totalKm = 0;
  let prevCoord: { latitude: number; longitude: number } | null = null;
  for (const stop of stops) {
    if (stop.stop_type === 'rest') continue;
    const coord = resolveStopCoordinates(stop, poiById);
    if (!coord) continue;
    if (prevCoord) {
      totalKm += (distanceKm(prevCoord, coord) ?? 0) * factor;
    }
    prevCoord = coord;
  }
  return Math.round(totalKm * 100) / 100;
}

export function orderSegmentNearestAnd2Opt(
  places: ItineraryStop[],
  poiById?: Map<string, Poi>
): ItineraryStop[] {
  if (places.length < 3) return [...places];
  const coords = places.map((stop) => resolveStopCoordinates(stop, poiById));
  if (coords.some((c) => c === null)) return [...places];

  const remaining = places.map((stop, idx) => ({ stop, coord: coords[idx]! }));
  const ordered = [remaining.shift()!];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const distance = distanceKm(current.coord, candidate.coord) ?? Number.POSITIVE_INFINITY;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    ordered.push(remaining.splice(closestIndex, 1)[0]);
  }

  const legDist = (a: number, b: number) => distanceKm(ordered[a].coord, ordered[b].coord) ?? 0;
  // # ponytail: Cap 2-opt iterations to 16 passes on typical daily cluster sizes (< 15 stops).
  for (let pass = 0; pass < 16; pass += 1) {
    let improved = false;
    for (let i = 1; i < ordered.length - 1; i += 1) {
      for (let j = i + 1; j < ordered.length; j += 1) {
        const before =
          legDist(i - 1, i) + (j + 1 < ordered.length ? legDist(j, j + 1) : 0);
        const after =
          legDist(i - 1, j) + (j + 1 < ordered.length ? legDist(i, j + 1) : 0);
        if (before - after > 1e-6) {
          let left = i;
          let right = j;
          while (left < right) {
            const tmp = ordered[left];
            ordered[left] = ordered[right];
            ordered[right] = tmp;
            left += 1;
            right -= 1;
          }
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  return ordered.map((item) => item.stop);
}

export function reorderNearStops(stops: ItineraryStop[], poiById?: Map<string, Poi>): ItineraryStop[] {
  const places = stops.filter((stop) => stop.stop_type !== 'rest');
  return orderSegmentNearestAnd2Opt(places, poiById);
}

export interface DayRouteOptimizationResult {
  day: ItineraryDay;
  beforeKm: number;
  afterKm: number;
  savedKm: number;
  reordered: boolean;
}

export function optimizeDayRouteOrder(
  day: ItineraryDay,
  poiById?: Map<string, Poi>
): DayRouteOptimizationResult {
  const places = day.stops.filter((stop) => stop.stop_type !== 'rest');
  const rests = day.stops.filter((stop) => stop.stop_type === 'rest');
  const beforeKm = calculateStopsPathKm(places, poiById, true);

  if (places.length < 3) {
    return { day, beforeKm, afterKm: beforeKm, savedKm: 0, reordered: false };
  }

  const optimizedPlaces = orderSegmentNearestAnd2Opt(places, poiById);
  const afterKm = calculateStopsPathKm(optimizedPlaces, poiById, true);
  const savedKm = Math.max(0, Math.round((beforeKm - afterKm) * 100) / 100);

  if (savedKm < 0.05) {
    return { day, beforeKm, afterKm: beforeKm, savedKm: 0, reordered: false };
  }

  const timedMinutes = places
    .map((s) => (s.start_time ? minutesFromTime(s.start_time) : null))
    .filter((v): v is number => v !== null && Number.isFinite(v));

  let timedPlaces = optimizedPlaces;
  if (timedMinutes.length > 0) {
    let cursor = Math.min(...timedMinutes);
    const restWindows = rests
      .filter((r) => r.start_time && r.end_time)
      .map((r) => ({ start: minutesFromTime(r.start_time!), end: minutesFromTime(r.end_time!) }))
      .sort((a, b) => a.start - b.start);

    timedPlaces = optimizedPlaces.map((stop) => {
      if (!stop.start_time && !stop.end_time) return stop;
      const dur =
        stop.duration_minutes ||
        (stop.start_time && stop.end_time ? durationBetween(stop.start_time, stop.end_time) : null) ||
        90;
      for (const rw of restWindows) {
        if (cursor < rw.end && cursor + dur > rw.start) {
          cursor = rw.end + 10;
        }
      }
      const clampedStart = Math.min(cursor, 21 * 60 + 30);
      const clampedEnd = Math.min(clampedStart + dur, 23 * 60);
      cursor = clampedEnd + 15;
      return {
        ...stop,
        start_time: timeFromMinutes(clampedStart),
        end_time: timeFromMinutes(Math.max(clampedStart + 15, clampedEnd)),
      };
    });
  }

  const merged = [...timedPlaces];
  rests.forEach((rest) => insertRestInOrder(merged, rest));
  const sequenced = merged.map((stop, idx) => ({ ...stop, sequence: idx }));

  return {
    day: { ...day, stops: sequenced },
    beforeKm,
    afterKm,
    savedKm,
    reordered: true,
  };
}

export interface ItineraryRouteOptimizationResult {
  days: ItineraryDay[];
  totalBeforeKm: number;
  totalAfterKm: number;
  totalSavedKm: number;
  reorderedDaysCount: number;
}

export function optimizeItineraryRouteOrder(
  days: ItineraryDay[],
  poiById?: Map<string, Poi>
): ItineraryRouteOptimizationResult {
  let totalBeforeKm = 0;
  let totalAfterKm = 0;
  let totalSavedKm = 0;
  let reorderedDaysCount = 0;

  const optimizedDays = days.map((day) => {
    const res = optimizeDayRouteOrder(day, poiById);
    totalBeforeKm += res.beforeKm;
    totalAfterKm += res.afterKm;
    totalSavedKm += res.savedKm;
    if (res.reordered) reorderedDaysCount += 1;
    return res.day;
  });

  return {
    days: optimizedDays,
    totalBeforeKm: Math.round(totalBeforeKm * 100) / 100,
    totalAfterKm: Math.round(totalAfterKm * 100) / 100,
    totalSavedKm: Math.round(totalSavedKm * 100) / 100,
    reorderedDaysCount,
  };
}

// ─────────────────────────────────────────────────────────────
// TÍNH TOÁN PHÁT THẢI CARBON (CO₂) THEO PHƯƠNG TIỆN DI CHUYỂN
// ─────────────────────────────────────────────────────────────

export type RouteTransportMode = 'driving' | 'motorcycle' | 'transit' | 'walking';

// # ponytail: Urban Vietnam passenger-km emissions baseline (g CO2e/km) aligned with DEFRA/IEA averages.
export const TRANSPORT_EMISSION_FACTORS_G_PER_KM: Record<RouteTransportMode, number> = {
  driving: 171,
  motorcycle: 72,
  transit: 40,
  walking: 0,
};

export const TRANSPORT_MODES_META: ReadonlyArray<{
  id: RouteTransportMode;
  label: string;
  gramsPerKm: number;
}> = [
  { id: 'driving', label: 'Ô tô', gramsPerKm: 171 },
  { id: 'motorcycle', label: 'Xe máy', gramsPerKm: 72 },
  { id: 'transit', label: 'Buýt xanh', gramsPerKm: 40 },
  { id: 'walking', label: 'Đi bộ', gramsPerKm: 0 },
];

export interface RouteCarbonEstimate {
  distanceKm: number;
  co2Grams: number;
  baselineCarGrams: number;
  savedGrams: number;
  savedPercent: number;
}

export function estimateCarbonFootprint(
  distanceMeters: number,
  mode: RouteTransportMode
): RouteCarbonEstimate {
  const safeKm = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0) / 1000;
  const factor = TRANSPORT_EMISSION_FACTORS_G_PER_KM[mode] ?? TRANSPORT_EMISSION_FACTORS_G_PER_KM.driving;
  const co2Grams = Math.round(safeKm * factor);
  const baselineCarGrams = Math.round(safeKm * TRANSPORT_EMISSION_FACTORS_G_PER_KM.driving);
  const savedGrams = Math.max(0, baselineCarGrams - co2Grams);
  const savedPercent = baselineCarGrams > 0 ? Math.round((savedGrams / baselineCarGrams) * 100) : 0;

  return {
    distanceKm: Math.round(safeKm * 100) / 100,
    co2Grams,
    baselineCarGrams,
    savedGrams,
    savedPercent,
  };
}

export function formatCarbonAmount(grams: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(grams) ? grams : 0));
  if (safe < 1000) return `${safe} g CO₂`;
  return `${(safe / 1000).toFixed(2)} kg CO₂`;
}

// ─────────────────────────────────────────────────────────────
// KIỂM TRA RÀNG BUỘC GIỜ MỞ CỬA (OPENING HOURS VALIDATOR)
// ─────────────────────────────────────────────────────────────

export interface OpeningHoursCheckResult {
  status: 'ok' | 'closed' | 'outside_hours' | 'unknown';
  warningMessage: string | null;
  openRangeLabel: string | null;
}

const WEEKDAY_PREFIXES: { jsDay: number; prefixPatterns: RegExp[]; inlinePattern: RegExp; label: string }[] = [
  {
    jsDay: 0,
    prefixPatterns: [/^chủ\s*nhật(?=$|[\s:,.-])/i, /^cn(?=$|[\s:,.-])/i, /^sunday\b/i],
    inlinePattern: /(?:chủ\s*nhật|\bcn)(?=$|[\s:,.-])/i,
    label: 'Chủ Nhật',
  },
  {
    jsDay: 1,
    prefixPatterns: [/^thứ\s*(?:hai|2)(?=$|[\s:,.-])/i, /^t2(?=$|[\s:,.-])/i, /^monday\b/i],
    inlinePattern: /thứ\s*(?:hai|2)(?=$|[\s:,.-])/i,
    label: 'Thứ Hai',
  },
  {
    jsDay: 2,
    prefixPatterns: [/^thứ\s*(?:ba|3)(?=$|[\s:,.-])/i, /^t3(?=$|[\s:,.-])/i, /^tuesday\b/i],
    inlinePattern: /thứ\s*(?:ba|3)(?=$|[\s:,.-])/i,
    label: 'Thứ Ba',
  },
  {
    jsDay: 3,
    prefixPatterns: [/^thứ\s*(?:tư|tu|4)(?=$|[\s:,.-])/i, /^t4(?=$|[\s:,.-])/i, /^wednesday\b/i],
    inlinePattern: /thứ\s*(?:tư|tu|4)(?=$|[\s:,.-])/i,
    label: 'Thứ Tư',
  },
  {
    jsDay: 4,
    prefixPatterns: [/^thứ\s*(?:năm|nam|5)(?=$|[\s:,.-])/i, /^t5(?=$|[\s:,.-])/i, /^thursday\b/i],
    inlinePattern: /thứ\s*(?:năm|nam|5)(?=$|[\s:,.-])/i,
    label: 'Thứ Năm',
  },
  {
    jsDay: 5,
    prefixPatterns: [/^thứ\s*(?:sáu|sau|6)(?=$|[\s:,.-])/i, /^t6(?=$|[\s:,.-])/i, /^friday\b/i],
    inlinePattern: /thứ\s*(?:sáu|sau|6)(?=$|[\s:,.-])/i,
    label: 'Thứ Sáu',
  },
  {
    jsDay: 6,
    prefixPatterns: [/^thứ\s*(?:bảy|bay|7)(?=$|[\s:,.-])/i, /^t7(?=$|[\s:,.-])/i, /^saturday\b/i],
    inlinePattern: /thứ\s*(?:bảy|bay|7)(?=$|[\s:,.-])/i,
    label: 'Thứ Bảy',
  },
];

function extractJsDayFromDate(dayDate?: string | null): number | null {
  if (!dayDate || !/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) return null;
  const d = new Date(`${dayDate}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

function parseTimeWindowsFromText(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const regex = /(\d{1,2})[:h](\d{2})\s*[–—-]\s*(\d{1,2})[:h](\d{2})/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const startH = Number(match[1]);
    const startM = Number(match[2]);
    const endH = Number(match[3]);
    const endM = Number(match[4]);
    if (startH > 24 || startM >= 60 || endH > 24 || endM >= 60) continue;
    const start = startH * 60 + startM;
    let end = endH * 60 + endM;
    if (end <= start) end += 24 * 60;
    ranges.push({ start, end });
  }
  return ranges;
}

function extractAllowedWeekdaysFromStatus(text: string): number[] | null {
  if (!/(?:thứ|chủ\s*nhật)/i.test(text)) return null;
  const days = new Set<number>();
  WEEKDAY_PREFIXES.forEach((w) => {
    if (w.inlinePattern.test(text)) days.add(w.jsDay);
  });

  // Handle compact lists like "Thứ 4, 6, Chủ Nhật"
  const listMatch = text.match(/thứ\s*([2-7](?:\s*,\s*[2-7])+)/i);
  if (listMatch) {
    listMatch[1].split(',').forEach((tok) => {
      const n = Number(tok.trim());
      if (n >= 2 && n <= 7) days.add(n === 2 ? 1 : n === 3 ? 2 : n === 4 ? 3 : n === 5 ? 4 : n === 6 ? 5 : 6);
    });
  }
  return days.size > 0 ? [...days] : null;
}

export function checkStopOpeningHours(
  stop: Pick<ItineraryStop, 'stop_type' | 'start_time' | 'end_time' | 'duration_minutes'>,
  poi: Poi | undefined,
  dayDate?: string | null
): OpeningHoursCheckResult {
  if (stop.stop_type === 'rest') {
    return { status: 'ok', warningMessage: null, openRangeLabel: null };
  }
  const oh = poi?.opening_hours;
  if (oh?.is_temporarily_closed) {
    return {
      status: 'closed',
      warningMessage: 'Địa điểm hiện đang tạm đóng cửa theo dữ liệu cập nhật.',
      openRangeLabel: 'Tạm đóng cửa',
    };
  }

  const jsDay = extractJsDayFromDate(dayDate);
  const weekdayLines = Array.isArray(oh?.weekday_text) ? oh.weekday_text.map((l) => String(l).trim()) : [];
  let targetRuleText = '';
  let targetDayLabel = '';

  if (weekdayLines.length > 0 && jsDay !== null) {
    const dayMeta = WEEKDAY_PREFIXES.find((w) => w.jsDay === jsDay);
    const matchedLine = weekdayLines.find((line) => dayMeta?.prefixPatterns.some((p) => p.test(line)));
    if (matchedLine) {
      targetRuleText = matchedLine.replace(/^[^:]+:\s*/, '').trim();
      targetDayLabel = dayMeta?.label || '';
    }
  }

  const statusText = typeof oh?.status_text === 'string' ? oh.status_text.trim() : '';
  const hasScheduleInStatus =
    /\d{1,2}[:h]\d{2}/.test(statusText) || /đóng cửa|cả ngày|24\/24|24\/7/i.test(statusText);

  if (!targetRuleText) {
    if (hasScheduleInStatus) {
      targetRuleText = statusText;
    } else if (weekdayLines.length > 0) {
      targetRuleText = weekdayLines[0].replace(/^[^:]+:\s*/, '').trim();
    } else if (poi?.openHours) {
      targetRuleText = poi.openHours.trim();
    }
  }

  if (!targetRuleText) {
    return { status: 'unknown', warningMessage: null, openRangeLabel: null };
  }

  if (/cả ngày|24\/24|24\/7|24\s*giờ|lễ tân 24/i.test(targetRuleText) && !/đóng cửa/i.test(targetRuleText)) {
    return { status: 'ok', warningMessage: null, openRangeLabel: 'Mở cửa cả ngày' };
  }

  if (/đóng\s*cửa/i.test(targetRuleText) && parseTimeWindowsFromText(targetRuleText).length === 0) {
    const dayInfo = targetDayLabel ? ` vào ${targetDayLabel}` : '';
    return {
      status: 'closed',
      warningMessage: `Địa điểm đóng cửa${dayInfo}. Hãy cân nhắc đổi sang ngày hoặc điểm khác.`,
      openRangeLabel: `Đóng cửa${dayInfo}`,
    };
  }

  const allowedWeekdays = extractAllowedWeekdaysFromStatus(targetRuleText);
  if (allowedWeekdays && jsDay !== null && !allowedWeekdays.includes(jsDay)) {
    const dayMeta = WEEKDAY_PREFIXES.find((w) => w.jsDay === jsDay);
    return {
      status: 'closed',
      warningMessage: `Hoạt động này không mở vào ${dayMeta?.label || 'ngày đã chọn'} (${targetRuleText}).`,
      openRangeLabel: targetRuleText,
    };
  }

  const windows = parseTimeWindowsFromText(targetRuleText);
  if (windows.length === 0) {
    return { status: 'unknown', warningMessage: null, openRangeLabel: targetRuleText };
  }

  const openRangeLabel = windows
    .map((w) => `${timeFromMinutes(w.start % 1440)}–${timeFromMinutes(w.end === 1440 ? 0 : w.end % 1440)}`)
    .join(', ');

  if (!stop.start_time) {
    return { status: 'ok', warningMessage: null, openRangeLabel };
  }

  const visitStart = minutesFromTime(stop.start_time);
  let visitEnd = stop.end_time ? minutesFromTime(stop.end_time) : visitStart + (stop.duration_minutes || 60);
  if (!Number.isFinite(visitStart) || !Number.isFinite(visitEnd)) {
    return { status: 'ok', warningMessage: null, openRangeLabel };
  }
  if (visitEnd <= visitStart) visitEnd += 24 * 60;

  const fitsWindow = windows.some(
    (w) =>
      (visitStart >= w.start && visitEnd <= w.end) ||
      (w.end > 1440 && visitStart + 1440 >= w.start && visitEnd + 1440 <= w.end)
  );

  if (!fitsWindow) {
    const endLabel = stop.end_time || timeFromMinutes(visitEnd % 1440);
    return {
      status: 'outside_hours',
      warningMessage: `Khung ${stop.start_time}–${endLabel} ngoài giờ mở cửa (${openRangeLabel}).`,
      openRangeLabel,
    };
  }

  return { status: 'ok', warningMessage: null, openRangeLabel };
}

type VisitPeriod = 'morning' | 'afternoon' | 'evening';

function experienceGroup(poi: Poi | undefined, stop: ItineraryStop): string {
  const details = `${poi?.sub_category || ''} ${poi?.name || stop.title} ${poi?.category || stop.category || ''}`.toLocaleLowerCase('vi-VN');
  if (/cafe|cà phê|coffee/.test(details)) return 'cafe';
  if (/quan-an|quán ăn|nhà hàng|restaurant|food/.test(details)) return 'dining';
  return poi?.category || stop.category || 'other';
}

function preferredVisitPeriods(poi?: Poi): VisitPeriod[] {
  const hints = (poi?.best_time || []).map((hint) => hint.toLocaleLowerCase('vi-VN'));
  const recognized = hints.flatMap((hint): VisitPeriod[] => {
    if (/night|evening|tối|đêm|sunset/.test(hint)) return ['evening'];
    if (/afternoon|chiều/.test(hint)) return ['afternoon'];
    if (/morning|sáng|sunrise/.test(hint)) return ['morning'];
    const startHour = hint.match(/(?:^|\D)(\d{1,2}):\d{2}/)?.[1];
    if (startHour != null) {
      const hour = Number(startHour);
      return [hour >= 17 || hour < 5 ? 'evening' : hour >= 12 ? 'afternoon' : 'morning'];
    }
    return [];
  }).filter((period, index, periods) => periods.indexOf(period) === index);
  if (recognized.length) return recognized;

  const details = `${poi?.sub_category || ''} ${poi?.name || ''} ${poi?.category || ''}`.toLocaleLowerCase('vi-VN');
  if (/cafe|cà phê|coffee/.test(details)) return ['afternoon', 'evening', 'morning'];
  if (/quán ăn|nhà hàng|restaurant|food/.test(details)) return ['afternoon', 'evening', 'morning'];
  if (/nightlife|bar|pub|đêm|night/.test(details)) return ['evening', 'afternoon', 'morning'];
  return ['morning', 'afternoon', 'evening'];
}

function setAssistantVisitTimes(
  stops: ItineraryStop[],
  poiById: Map<string, Poi>,
  restPeriods: Array<{ time_range: string; duration_minutes: number }>,
): ItineraryStop[] {
  const windows: Record<VisitPeriod, { start: number; end: number }> = {
    morning: { start: 8 * 60 + 30, end: 12 * 60 },
    afternoon: { start: 14 * 60, end: 17 * 60 + 30 },
    evening: { start: 18 * 60, end: 22 * 60 },
  };
  const booked: Array<{ start: number; end: number; gap: number }> = stops.flatMap((stop) => {
    if (!stop.start_time || !stop.end_time) return [];
    return [{ start: minutesFromTime(stop.start_time), end: minutesFromTime(stop.end_time), gap: stop.stop_type === 'rest' ? 0 : 30 }];
  });
  restPeriods.forEach((period) => {
    const range = period.time_range.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
    if (range) booked.push({ start: minutesFromTime(range[1]), end: minutesFromTime(range[2]), gap: 0 });
  });

  return stops.map((stop) => {
    if (stop.stop_type === 'rest' || stop.start_time || stop.end_time) return stop;
    const duration = minutesFor(stop);
    const periods = preferredVisitPeriods(stop.poi_id ? poiById.get(stop.poi_id) : undefined);
    let slot: { start: number; end: number } | null = null;
    for (const period of periods) {
      const window = windows[period];
      for (let start = window.start; start + duration <= window.end; start += 15) {
        const end = start + duration;
        if (booked.every((range) => end <= range.start - range.gap || start >= range.end + range.gap)) {
          slot = { start, end };
          break;
        }
      }
      if (slot) break;
    }
    if (!slot) return stop;
    booked.push({ start: slot.start, end: slot.end, gap: 30 });
    return { ...stop, start_time: timeFromMinutes(slot.start), end_time: timeFromMinutes(slot.end) };
  });
}

export function optimizeDays(
  days: ItineraryDay[],
  ideas: Poi[],
  dailyCapacity: number,
  outlines: Array<{ day: number; focus_city?: string; rest_periods?: Array<{ time_range: string; activity: string; duration_minutes: number }> }> = []
): { days: ItineraryDay[]; assignedCount: number; unassignedCount: number; restCount: number } {
  const next = days.map((day) => ({ ...day, stops: [...day.stops] }));
  const placed = new Set(next.flatMap((day) => day.stops.map((stop) => stop.poi_id).filter((id): id is string => Boolean(id))));
  const placedCustomNames = new Set(next.flatMap((day) => day.stops
    .filter((stop) => stop.stop_type === 'custom')
    .map((stop) => stop.title.trim().toLocaleLowerCase('vi-VN'))));
  const pending = ideas.filter((poi) => !placed.has(poi.id) && !(poi.id.startsWith('custom-') && placedCustomNames.has(poi.name.trim().toLocaleLowerCase('vi-VN'))));
  const poiById = new Map(ideas.map((poi) => [poi.id, poi]));
  let assignedCount = 0;
  let unassignedCount = 0;

  pending.forEach((poi) => {
    const candidate = stopFromPoi(poi, 'assistant');
    const duration = minutesFor(candidate);
    let eligible = next
      .map((day, index) => ({ day, index, stops: day.stops.filter((stop) => stop.stop_type !== 'rest') }))
      .filter(({ stops }) => stops.reduce((total, stop) => total + minutesFor(stop), 0) + duration <= dailyCapacity);
    const isCafe = experienceGroup(poi, candidate) === 'cafe';
    if (isCafe) {
      eligible = eligible.filter(({ stops }) =>
        stops.filter((stop) => experienceGroup(stop.poi_id ? poiById.get(stop.poi_id) : undefined, stop) === 'cafe').length < 2);
    }
    if (!eligible.length) {
      unassignedCount += 1;
      return;
    }
    const canUseCafeFreeDay = isCafe && eligible.some(({ stops }) =>
      stops.every((stop) => experienceGroup(stop.poi_id ? poiById.get(stop.poi_id) : undefined, stop) !== 'cafe'));
    if (canUseCafeFreeDay) {
      const cafeFreeDays = eligible.filter(({ stops }) =>
        stops.every((stop) => experienceGroup(stop.poi_id ? poiById.get(stop.poi_id) : undefined, stop) !== 'cafe'));
      if (cafeFreeDays.length) eligible = cafeFreeDays;
    }
    eligible.sort((a, b) => {
      const cityPenalty = (stops: ItineraryStop[]) => stops.length && !stops.some((stop) => stop.city === candidate.city) ? 120 : 0;
      const proximityPenalty = (stops: ItineraryStop[]) => {
        const last = [...stops].reverse().find((stop) => stop.latitude != null && stop.longitude != null);
        return last ? (distanceKm(last, candidate) ?? 0) * 8 : 0;
      };
      const load = (stops: ItineraryStop[]) => stops.reduce((total, stop) => total + minutesFor(stop), 0);
      const cafeCount = (stops: ItineraryStop[]) => stops.filter((stop) => experienceGroup(stop.poi_id ? poiById.get(stop.poi_id) : undefined, stop) === 'cafe').length;
      const score = (stops: ItineraryStop[]) => load(stops) + cityPenalty(stops) + proximityPenalty(stops) + cafeCount(stops) * 90;
      return score(a.stops) - score(b.stops);
    });
    const selected = eligible[0].day;
    selected.stops.push(candidate);
    assignedCount += 1;
  });

  let restCount = 0;
  const scheduled = next.map((day) => {
    const existingRests = day.stops.filter((stop) => stop.stop_type === 'rest');
    const outline = outlines.find((item) => item.day === day.day_number);
    const periods = outline?.rest_periods?.length ? outline.rest_periods : [{
      time_range: '12:00–14:00',
      activity: 'Ăn trưa chậm rãi và nghỉ tại nơi lưu trú hoặc quán cà phê yên tĩnh.',
      duration_minutes: 90,
    }];
    const proximityOrdered = reorderNearStops(day.stops);
    const timedPlaces = setAssistantVisitTimes(proximityOrdered, poiById, periods);
    const orderedPlaces = timedPlaces.sort((a, b) => {
      if (a.start_time && b.start_time) return minutesFromTime(a.start_time) - minutesFromTime(b.start_time);
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return a.sequence - b.sequence;
    });
    const ordered = [...orderedPlaces];
    existingRests.forEach((rest) => insertRestInOrder(ordered, rest));
    const totalMinutes = orderedPlaces.reduce((total, stop) => total + minutesFor(stop), 0);
    const shouldSuggestRest = orderedPlaces.length >= 2;

    periods.forEach((period) => {
      const rangeStart = period.time_range.match(/(\d{2}:\d{2})/)?.[1];
      if (!shouldSuggestRest || !rangeStart) return;
      const isShortBreak = minutesFromTime(rangeStart) < 11 * 60 && period.duration_minutes <= 60;
      if (isShortBreak ? totalMinutes < 120 : totalMinutes < 210) return;
      const range = period.time_range.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
      if (!range) return;
      const inSameWindow = existingRests.some((stop) => stop.start_time && minutesFromTime(stop.start_time) >= minutesFromTime(range[1]) && minutesFromTime(stop.start_time) < minutesFromTime(range[2]));
      if (inSameWindow) return;
      const slot = findRestSlot({ ...day, stops: [...ordered, ...existingRests] }, period.time_range, period.duration_minutes);
      if (!slot) return;

      const rest: ItineraryStop = {
        stop_id: isShortBreak ? `assistant-rest-${day.day_id}-morning` : `rest-${day.day_id}`,
        poi_id: null,
        title: isShortBreak ? 'Nghỉ ngắn & uống nước' : 'Nghỉ trưa & phục hồi',
        city: outline?.focus_city || ordered[0]?.city || null,
        address: null,
        category: null,
        stop_type: 'rest',
        source: 'assistant',
        sequence: 0,
        duration_minutes: period.duration_minutes,
        start_time: slot.start,
        end_time: slot.end,
        comment: period.activity,
        latitude: null,
        longitude: null,
      };
      insertRestInOrder(ordered, rest);
      existingRests.push(rest);
      restCount += 1;
    });
    return { ...day, stops: ordered };
  });
  return { days: normalizeSequence(scheduled), assignedCount, unassignedCount, restCount };
}

/**
 * Tự động phân tích ngày bắt đầu từ chuỗi ngày của UserTrip
 * Hỗ trợ các định dạng: "1 - 5 thg 11", "Ngày 1 – 5 tháng 11", "14 – 18 thg 11, 2026", "Từ 16 thg 11", ISO date "2026-11-14"
 */
export function parseStartDateFromTrip(startDateStr?: string | null): { day: number; month: number; year: number } {
  const defaultYear = 2026;
  if (!startDateStr || !startDateStr.trim()) {
    return { day: 1, month: 11, year: defaultYear };
  }

  const raw = startDateStr.trim();

  // 1. Dạng ISO: "2026-11-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return { day: d || 1, month: m || 11, year: y || defaultYear };
  }

  // 2. Dạng khoảng ngày: "Ngày 1 – 5 tháng 11", "1 - 5 thg 11", "14 – 17 thg 11, 2026"
  const rangeMatch = raw.match(/(?:Ngày\s*)?(\d+)\s*[–-]\s*\d+\s+(?:thg|tháng)\s+(\d+)(?:,?\s*(\d{4}))?/i);
  if (rangeMatch) {
    return {
      day: parseInt(rangeMatch[1], 10),
      month: parseInt(rangeMatch[2], 10),
      year: rangeMatch[3] ? parseInt(rangeMatch[3], 10) : defaultYear,
    };
  }

  // 3. Dạng "Từ 16 thg 11"
  const fromMatch = raw.match(/Từ\s+(\d+)\s+(?:thg|tháng)\s+(\d+)(?:,?\s*(\d{4}))?/i);
  if (fromMatch) {
    return {
      day: parseInt(fromMatch[1], 10),
      month: parseInt(fromMatch[2], 10),
      year: fromMatch[3] ? parseInt(fromMatch[3], 10) : defaultYear,
    };
  }

  // 4. Số đầu tiên trước thg/tháng
  const simpleMatch = raw.match(/(\d+)\s*(?:thg|tháng)\s*(\d+)/i);
  if (simpleMatch) {
    return {
      day: parseInt(simpleMatch[1], 10),
      month: parseInt(simpleMatch[2], 10),
      year: defaultYear,
    };
  }

  return { day: 1, month: 11, year: defaultYear };
}

/**
 * Tự động cập nhật chuỗi ngày khi số lượng ngày của chuyến đi thay đổi (ví dụ: du lịch từ 1-5, thêm 1 ngày thành 1-6)
 */
export function updateDateRangeWithDays(currentDateStr?: string | null, newDaysCount: number = 1): string {
  const safeDays = Math.max(1, newDaysCount);
  if (!currentDateStr || !currentDateStr.trim()) {
    return `Ngày 1 – ${safeDays} tháng 11`;
  }

  let raw = currentDateStr.trim();
  const hadParenthesisDays = /\(\d+\s*ngày\)/i.test(raw);
  if (hadParenthesisDays) {
    raw = raw.replace(/\s*\(\d+\s*ngày\)/gi, '').trim();
  }

  // 1. Dạng: "Ngày 1 – 5 tháng 11" hoặc "Ngày 1 - 5 tháng 11, 2026"
  const ngayPattern = /^Ngày\s+(\d+)\s*[–-]\s*(\d+)\s+tháng\s+(\d+)(.*)$/i;
  const matchNgay = raw.match(ngayPattern);
  if (matchNgay) {
    const startDay = parseInt(matchNgay[1], 10);
    const month = matchNgay[3];
    const tail = matchNgay[4] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `Ngày ${startDay} – ${newEndDay} tháng ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  // 2. Dạng: "1 - 5 thg 11" hoặc "1 – 5 thg 11" hoặc "14 – 17 thg 11, 2026"
  const dashPattern = /^(\d+)\s*[–-]\s*(\d+)\s+(thg|tháng)\s+(\d+)(.*)$/i;
  const matchDash = raw.match(dashPattern);
  if (matchDash) {
    const startDay = parseInt(matchDash[1], 10);
    const unit = matchDash[3];
    const month = matchDash[4];
    const tail = matchDash[5] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `${startDay} – ${newEndDay} ${unit} ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  // 3. Dạng: "Từ 16 thg 11" hoặc "Từ 2 thg 11"
  const tuPattern = /^Từ\s+(\d+)\s+(thg|tháng)\s+(\d+)(.*)$/i;
  const matchTu = raw.match(tuPattern);
  if (matchTu) {
    const startDay = parseInt(matchTu[1], 10);
    const unit = matchTu[2];
    const month = matchTu[3];
    const tail = matchTu[4] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `${startDay} – ${newEndDay} ${unit} ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  // 4. Dạng: "4 ngày • Tháng 11" hoặc "4 ngày • Tháng 11, 2026"
  const flexPattern = /^(\d+)\s*ngày\s*•\s*(.*)$/i;
  const matchFlex = raw.match(flexPattern);
  if (matchFlex) {
    const rest = matchFlex[2];
    return `${safeDays} ngày • ${rest}`;
  }

  // 5. ISO Date string: "2026-11-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const newEndDay = d + safeDays - 1;
    const res = `Ngày ${d} – ${newEndDay} tháng ${m}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  const res = `${safeDays} ngày • ${raw}`;
  return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
}

// ─────────────────────────────────────────────────────────────
// PHÂN LOẠI TRONG NHÀ / NGOÀI TRỜI, ĐỔI ĐIỂM GẦN, NGÂN SÁCH & ĐỘ MỆT MỎI
// ─────────────────────────────────────────────────────────────

const OUTDOOR_SUB_CATEGORIES = new Set([
  'beach',
  'beach_coastline',
  'mountain_pass_peninsula',
  'mountain',
  'waterfall',
  'waterfalls_hotsprings',
  'stream',
  'camping',
  'adventure',
  'snorkeling',
  'bay',
  'peninsula',
]);

const INDOOR_SUB_CATEGORIES = new Set([
  'museums_galleries',
  'museum',
  'art_space',
  'performance',
  'performing_arts_heritage',
  'workspace_study_cafe',
  'tea_herbal',
  'royal_herbal_tea',
  'cathedrals_heritage_churches',
  'historic_zen_temples',
  'pagoda',
  'market',
  'wellness',
  'royal_mausoleums',
]);

const OUTDOOR_KEYWORDS = [
  'bãi biển',
  'bán đảo',
  'ngũ hành sơn',
  'công viên',
  'cầu rồng',
  'cầu vàng',
  'bà nà',
  'đồi ',
  'thác ',
  'suối ',
  'vịnh ',
  'đèo ',
  'biển ',
];

function normalizeCityLabel(city?: string | null): 'Đà Nẵng' | 'Huế' {
  return /hu[eế]/i.test(city || '') ? 'Huế' : 'Đà Nẵng';
}

export function isPoiOutdoor(
  poi?: Poi | null,
  stop?: Pick<ItineraryStop, 'category' | 'title' | 'stop_type'> | null
): boolean {
  if (stop?.stop_type === 'rest') return false;
  if (!poi && !stop) return false;

  if (poi?.ai_metadata && typeof poi.ai_metadata.rainy_day_friendly === 'boolean') {
    return !poi.ai_metadata.rainy_day_friendly;
  }

  const sub = (poi?.sub_category || '').trim().toLowerCase();
  if (OUTDOOR_SUB_CATEGORIES.has(sub)) return true;
  if (INDOOR_SUB_CATEGORIES.has(sub)) return false;

  const cat = (poi?.category || stop?.category || '').trim().toLowerCase();
  if (cat === 'canh-quan' || cat.includes('thiên nhiên') || cat.includes('cảnh quan') || cat.includes('nature')) {
    return true;
  }

  const name = (poi?.name || stop?.title || '').trim().toLowerCase();
  return OUTDOOR_KEYWORDS.some((kw) => name.includes(kw));
}

export interface IndoorSwapSuggestion {
  originalStop: ItineraryStop;
  replacement: Poi;
  distanceKm: number;
  walkMinutes: number;
  reason: string;
}

export function suggestIndoorAlternativesForDay(
  day: ItineraryDay,
  allPois: Poi[],
  usedPoiIds: Set<string>,
  fallbackCity = 'Đà Nẵng'
): IndoorSwapSuggestion[] {
  const poiById = new Map(allPois.map((p) => [p.id, p]));
  const scheduledInDay = new Set(
    day.stops.map((s) => s.poi_id).filter((id): id is string => Boolean(id))
  );
  const chosenIds = new Set<string>();
  const swaps: IndoorSwapSuggestion[] = [];

  for (const stop of day.stops) {
    if (stop.stop_type === 'rest') continue;
    const matched = stop.poi_id ? poiById.get(stop.poi_id) : undefined;
    if (!isPoiOutdoor(matched, stop)) continue;

    const targetCity = normalizeCityLabel(stop.city || matched?.city || fallbackCity);
    const origin = resolveStopCoordinates(stop, poiById);

    const candidates = allPois.filter((cand) => {
      if (normalizeCityLabel(cand.city) !== targetCity) return false;
      if (cand.id === stop.poi_id || scheduledInDay.has(cand.id) || usedPoiIds.has(cand.id) || chosenIds.has(cand.id)) {
        return false;
      }
      return !isPoiOutdoor(cand);
    });

    if (candidates.length === 0) continue;

    const ranked = candidates
      .map((cand) => {
        const rawDist =
          origin && Number.isFinite(cand.lat) && Number.isFinite(cand.lng)
            ? distanceKm(origin, { latitude: cand.lat, longitude: cand.lng }) ?? 0
            : 0;
        return {
          cand,
          dist: Math.round(rawDist * 100) / 100,
        };
      })
      .sort((a, b) => {
        if (origin && Math.abs(a.dist - b.dist) > 1e-6) return a.dist - b.dist;
        const ecoDiff = (b.cand.ecoScore || 0) - (a.cand.ecoScore || 0);
        if (ecoDiff !== 0) return ecoDiff;
        return (b.cand.rating || 0) - (a.cand.rating || 0);
      });

    const best = ranked[0];
    chosenIds.add(best.cand.id);
    const walkMinutes = best.dist > 0 ? Math.max(1, Math.round((best.dist / 4.5) * 60)) : 0;
    const reason =
      best.dist > 0
        ? `Không gian trong nhà tại ${targetCity}, cách điểm cũ ${best.dist.toFixed(1)} km`
        : `Không gian trong nhà tại ${targetCity}, an toàn khi trời mưa`;

    swaps.push({
      originalStop: stop,
      replacement: best.cand,
      distanceKm: best.dist,
      walkMinutes,
      reason,
    });
  }

  return swaps;
}

export interface NearbyAlternativeSuggestion {
  poi: Poi;
  distanceKm: number;
  walkMinutes: number;
  reason: string;
}

export function suggestNearbyAlternativesForStop(
  targetStop: ItineraryStop,
  day: ItineraryDay,
  allPois: Poi[],
  usedPoiIds: Set<string>,
  limit = 3
): NearbyAlternativeSuggestion[] {
  if (limit <= 0) return [];
  const poiById = new Map(allPois.map((p) => [p.id, p]));
  const matched = targetStop.poi_id ? poiById.get(targetStop.poi_id) : undefined;
  const targetCity = normalizeCityLabel(targetStop.city || matched?.city || 'Đà Nẵng');
  const scheduledInDay = new Set(
    day.stops.map((s) => s.poi_id).filter((id): id is string => Boolean(id))
  );
  const origin = resolveStopCoordinates(targetStop, poiById);

  const candidates = allPois.filter((cand) => {
    if (normalizeCityLabel(cand.city) !== targetCity) return false;
    if (cand.id === targetStop.poi_id || scheduledInDay.has(cand.id) || usedPoiIds.has(cand.id)) {
      return false;
    }
    return true;
  });

  return candidates
    .map((poi) => {
      const rawDist =
        origin && Number.isFinite(poi.lat) && Number.isFinite(poi.lng)
          ? distanceKm(origin, { latitude: poi.lat, longitude: poi.lng }) ?? 0
          : 0;
      const dist = Math.round(rawDist * 100) / 100;
      const walkMinutes = dist > 0 ? Math.max(1, Math.round((dist / 4.5) * 60)) : 0;
      const ecoVal = poi.ecoScore || 85;
      const reason =
        dist > 0
          ? `Cách ${dist.toFixed(1)} km (~${walkMinutes} phút đi bộ) · Eco ${ecoVal}`
          : `Cùng khu vực ${targetCity} · Eco ${ecoVal}`;
      return { poi, distanceKm: dist, walkMinutes, reason };
    })
    .sort((a, b) => {
      if (origin && Math.abs(a.distanceKm - b.distanceKm) > 1e-6) return a.distanceKm - b.distanceKm;
      const ecoDiff = (b.poi.ecoScore || 0) - (a.poi.ecoScore || 0);
      if (ecoDiff !== 0) return ecoDiff;
      return (b.poi.rating || 0) - (a.poi.rating || 0);
    })
    .slice(0, limit);
}

export function getStopShortReason(
  stop: ItineraryStop,
  matchedPoi?: Poi | null,
  prevStop?: ItineraryStop | null
): string {
  if (stop.stop_type === 'rest') {
    return 'Khoảng nghỉ phục hồi giúp giữ nhịp đi thong thả, tránh quá tải.';
  }

  const prevLat = prevStop?.latitude ?? null;
  const prevLng = prevStop?.longitude ?? null;
  const curLat = stop.latitude ?? matchedPoi?.lat ?? null;
  const curLng = stop.longitude ?? matchedPoi?.lng ?? null;
  const straightKm =
    prevLat != null && prevLng != null && curLat != null && curLng != null
      ? distanceKm({ latitude: prevLat, longitude: prevLng }, { latitude: curLat, longitude: curLng })
      : null;
  const legKm =
    straightKm != null && Number.isFinite(straightKm)
      ? Math.round(straightKm * ROAD_DETOUR_FACTOR * 10) / 10
      : null;

  if (matchedPoi) {
    const tag = isPoiOutdoor(matchedPoi, stop)
      ? 'Không gian ngoài trời'
      : matchedPoi.ecoScore >= 85
        ? `Trong nhà · Eco ${matchedPoi.ecoScore}`
        : 'Không gian trong nhà';
    return legKm != null
      ? `${tag} · cách điểm trước ${legKm.toFixed(1)} km`
      : `${tag} · hợp nhịp tham quan tại ${matchedPoi.city}`;
  }

  const cityLabel = stop.city || 'địa phương';
  return legKm != null
    ? `Cách điểm trước ${legKm.toFixed(1)} km · điểm dừng tại ${cityLabel}`
    : `Điểm dừng phù hợp tại ${cityLabel}`;
}

export interface TripBudgetSummary {
  totalCost: number;
  maxBudget: number | null;
  remaining: number | null;
  isOverBudget: boolean;
  percentUsed: number;
}

export function computeTripBudgetSummary(
  days: ItineraryDay[],
  poiById: Map<string, Poi>,
  peopleCount: number,
  maxBudget?: number | null
): TripBudgetSummary {
  const safePeople = Math.max(1, Number.isFinite(peopleCount) ? peopleCount : 1);
  let totalCost = 0;

  for (const day of days) {
    for (const stop of day.stops) {
      if (stop.stop_type === 'rest') continue;
      const poi = stop.poi_id ? poiById.get(stop.poi_id) : undefined;
      const unitCost =
        poi?.estimatedCost != null && Number.isFinite(poi.estimatedCost)
          ? Math.max(0, poi.estimatedCost)
          : 0;
      totalCost += unitCost * safePeople;
    }
  }

  totalCost = Math.round(totalCost);
  if (maxBudget != null && Number.isFinite(maxBudget) && maxBudget > 0) {
    const cleanMax = Math.round(maxBudget);
    return {
      totalCost,
      maxBudget: cleanMax,
      remaining: cleanMax - totalCost,
      isOverBudget: totalCost > cleanMax,
      percentUsed: Math.round((totalCost / cleanMax) * 100),
    };
  }

  return {
    totalCost,
    maxBudget: null,
    remaining: null,
    isOverBudget: false,
    percentUsed: 0,
  };
}

export interface DayFatigueSummary {
  activeCount: number;
  outdoorCount: number;
  durationHours: number;
  fatigueHours: number;
  hasRestBlock: boolean;
  needsRest: boolean;
  level: 'light' | 'moderate' | 'heavy';
}

export function computeDayFatigue(day: ItineraryDay, poiById?: Map<string, Poi>): DayFatigueSummary {
  const hasRestBlock = day.stops.some((s) => s.stop_type === 'rest');
  const activeStops = day.stops.filter((s) => s.stop_type !== 'rest');
  const activeCount = activeStops.length;

  let totalMinutes = 0;
  let outdoorCount = 0;

  for (const stop of activeStops) {
    const matched = stop.poi_id ? poiById?.get(stop.poi_id) : undefined;
    const dur =
      (stop.duration_minutes && stop.duration_minutes > 0 ? stop.duration_minutes : null) ??
      (stop.start_time && stop.end_time ? durationBetween(stop.start_time, stop.end_time) : null) ??
      (matched?.average_visit_minutes && matched.average_visit_minutes > 0 ? matched.average_visit_minutes : null) ??
      90;
    totalMinutes += dur;
    if (isPoiOutdoor(matched, stop)) {
      outdoorCount += 1;
    }
  }

  const durationHours = Math.round((totalMinutes / 60) * 100) / 100;
  const fatigueHours = Math.round((durationHours + 0.5 * outdoorCount) * 100) / 100;
  const needsRest = activeCount >= 4 || fatigueHours >= 6.0;
  const level: 'light' | 'moderate' | 'heavy' = needsRest
    ? 'heavy'
    : activeCount >= 3 || fatigueHours >= 4.0
      ? 'moderate'
      : 'light';

  return {
    activeCount,
    outdoorCount,
    durationHours,
    fatigueHours,
    hasRestBlock,
    needsRest,
    level,
  };
}

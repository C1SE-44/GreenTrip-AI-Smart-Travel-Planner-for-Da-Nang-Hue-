import { fetchJson } from '@/lib/api';
import type { Poi } from '@/data/pois';
import type { UserTrip } from '@/pages/ExplorePage';

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
  const start = trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate) ? trip.startDate : null;
  return {
    trip_id: trip.id,
    title: trip.title,
    destination: trip.destination,
    start_date: start,
    days_count: count,
    days: Array.from({ length: count }, (_, index) => {
      const date = start ? new Date(`${start}T12:00:00`) : null;
      if (date) date.setDate(date.getDate() + index);
      return {
        day_id: `${trip.id}-day-${index + 1}`,
        day_number: index + 1,
        date: date ? date.toISOString().slice(0, 10) : null,
        title: '',
        stops: [],
      };
    }),
  };
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

export async function getTripItinerary(tripId: string): Promise<TripItinerary> {
  return fetchJson<TripItinerary>(`/trips/${encodeURIComponent(tripId)}/itinerary`);
}

export async function saveTripItinerary(itinerary: TripItinerary): Promise<TripItinerary> {
  return fetchJson<TripItinerary>(`/trips/${encodeURIComponent(itinerary.trip_id)}/itinerary`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itinerary),
  });
}

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
 * Backend endpoint: GET /api/itineraries/{itinerary_id}/days/{day_number}/route
 */
export async function fetchDayRoute(
  itineraryId: string,
  dayNumber: number,
  signal?: AbortSignal
): Promise<DayRouteResponse> {
  const cleanItinId = encodeURIComponent(itineraryId.trim());
  return fetchJson<DayRouteResponse>(
    `/api/itineraries/${cleanItinId}/days/${dayNumber}/route`,
    { signal }
  );
}

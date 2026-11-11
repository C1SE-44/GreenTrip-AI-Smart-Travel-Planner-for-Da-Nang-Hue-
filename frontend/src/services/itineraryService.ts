import { fetchJson } from '@/lib/api';

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

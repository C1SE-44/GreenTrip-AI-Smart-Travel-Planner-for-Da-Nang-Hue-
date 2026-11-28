import { fetchJson } from '@/lib/api';
import type { UserTrip } from '@/pages/ExplorePage';
import type { TripItinerary } from '@/services/itineraryService';

export type TransportMode = 'CAR' | 'PRIVATE_CAR' | 'TRAIN';
export type TransportAvailability = 'AVAILABLE' | 'ESTIMATE_UNVERIFIED' | 'UNAVAILABLE' | 'USER_PROVIDED';

export interface TransportPreviewRequest {
  trip_id: string;
  alternative_id: string;
  itinerary: {
    days: Array<{
      day_number: number;
      date?: string | null;
      stops: Array<{
        stop_id?: string;
        poi_id?: string | null;
        title: string;
        city?: string | null;
        latitude?: number | null;
        longitude?: number | null;
      }>;
    }>;
  };
  travelers?: {
    adult_count?: number;
    child_count?: number;
    infant_count?: number;
    pet_count?: number;
  };
  accommodation_groups: Array<{
    group_id: string;
    city: string;
    status: 'RECOMMENDED' | 'SELECTED' | 'BOOKED_BY_USER' | 'CHOOSE_LATER';
    name?: string;
    stay_id?: string;
    latitude?: number;
    longitude?: number;
    day_numbers: number[];
  }>;
}

export interface TransportRouteOption {
  mode: TransportMode;
  availability: TransportAvailability;
  route_status: 'ROUTED' | 'HEURISTIC' | 'UNKNOWN';
  provider: string;
  route_profile: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  traffic_aware: boolean;
  departure_time_supported: boolean;
  fare_status: 'ESTIMATED' | 'PARTIAL' | 'UNAVAILABLE' | 'USER_PROVIDED';
  estimated_fare: number | null;
  fare_currency: string | null;
  fare_unit: string | null;
  fare_source: string | null;
  fare_source_url: string | null;
  fare_region: string | null;
  emissions_status: 'ESTIMATED' | 'PARTIAL' | 'UNAVAILABLE';
  estimated_co2e_kg: number | null;
  emissions_unit: string | null;
  emissions_source: string | null;
  emissions_source_url: string | null;
  emissions_region: string | null;
  emissions_scope: string | null;
  train_service_name: string | null;
  train_departure_at: string | null;
  train_arrival_at: string | null;
  train_door_to_door_seconds: number | null;
  first_mile_distance_meters: number | null;
  first_mile_duration_seconds: number | null;
  first_mile_route_status: 'ROUTED' | 'HEURISTIC' | 'UNKNOWN' | null;
  last_mile_distance_meters: number | null;
  last_mile_duration_seconds: number | null;
  last_mile_route_status: 'ROUTED' | 'HEURISTIC' | 'UNKNOWN' | null;
  train_ticket_status: 'NOT_CONFIRMED' | null;
  data_source: string;
  warnings: string[];
}

export interface TransportPoint {
  point_id: string;
  point_type: 'POI' | 'ACCOMMODATION';
  poi_id: string | null;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface TransportLeg {
  leg_id: string;
  alternative_id: string;
  day_number: number;
  sequence: number;
  date: string | null;
  scope: 'INTRACITY' | 'INTERCITY' | 'UNKNOWN';
  origin: TransportPoint;
  destination: TransportPoint;
  options: TransportRouteOption[];
  warnings: string[];
}

export interface TransportPreviewResponse {
  status: 'success' | 'partial' | 'unavailable';
  trip_id: string;
  alternative_id: string;
  itinerary_fingerprint: string;
  provider_capabilities: {
    provider: string;
    route_profile: string;
    supported_modes: string[];
    route_matrix: boolean;
    departure_time_supported: boolean;
    traffic_aware: boolean;
  };
  legs: TransportLeg[];
  uncomputed_endpoints: Array<{
    day_number: number;
    endpoint: 'FIRST_MILE' | 'LAST_MILE';
    city: string | null;
    reason: string;
  }>;
  limitations: string[];
}

export interface TransportSelection {
  legId: string;
  mode: TransportMode;
  selectedAt: string;
}

export interface ConfirmedTransportAlternative {
  alternativeId: string;
  itineraryFingerprint: string;
  selections: TransportSelection[];
}

export interface TripTransportPlan {
  version: 1;
  confirmedAlternatives: ConfirmedTransportAlternative[];
}

export function buildTransportPreviewRequest(
  trip: UserTrip,
  itinerary: TripItinerary,
): TransportPreviewRequest {
  const groups = trip.accommodationPlan?.groups || [];
  const hasTravelerBreakdown = [trip.adultCount, trip.childCount, trip.infantCount, trip.petCount]
    .some((value) => value !== undefined);
  return {
    trip_id: trip.id,
    alternative_id: 'confirmed',
    itinerary: {
      days: itinerary.days.map((day) => ({
        day_number: day.day_number,
        date: day.date,
        // Meals and rest placeholders are not physical POI stops.
        stops: day.stops
          .filter((stop) => stop.stop_type !== 'rest')
          .map((stop) => ({
            stop_id: stop.stop_id,
            poi_id: stop.poi_id,
            title: stop.title,
            city: stop.city,
            latitude: stop.latitude,
            longitude: stop.longitude,
          })),
      })),
    },
    ...(hasTravelerBreakdown
      ? {
          travelers: {
            adult_count: trip.adultCount ?? 0,
            child_count: trip.childCount ?? 0,
            infant_count: trip.infantCount ?? 0,
            pet_count: trip.petCount ?? 0,
          },
        }
      : {}),
    accommodation_groups: groups.map((group) => ({
      group_id: group.groupId,
      city: group.city,
      status: group.status,
      name: group.name,
      stay_id: group.stayId,
      latitude: group.latitude,
      longitude: group.longitude,
      day_numbers: group.dayNumbers,
    })),
  };
}

export function previewTransport(
  request: TransportPreviewRequest,
  signal?: AbortSignal,
): Promise<TransportPreviewResponse> {
  return fetchJson<TransportPreviewResponse>('/api/transport/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
}

export function currentTransportSelections(
  plan: TripTransportPlan | undefined,
  alternativeId: string,
  itineraryFingerprint: string,
): Record<string, TransportMode> {
  const confirmed = plan?.confirmedAlternatives.find((item) =>
    item.alternativeId === alternativeId && item.itineraryFingerprint === itineraryFingerprint
  );
  return Object.fromEntries((confirmed?.selections || []).map((selection) => [selection.legId, selection.mode]));
}

export function buildConfirmedTransportPlan(
  existing: TripTransportPlan | undefined,
  alternativeId: string,
  itineraryFingerprint: string,
  selections: Record<string, TransportMode>,
  selectedAt: string,
): TripTransportPlan {
  const next: ConfirmedTransportAlternative = {
    alternativeId,
    itineraryFingerprint,
    selections: Object.entries(selections).map(([legId, mode]) => ({ legId, mode, selectedAt })),
  };
  const previous = (existing?.confirmedAlternatives || []).filter((item) => item.alternativeId !== alternativeId);
  return { version: 1, confirmedAlternatives: [...previous.slice(-1), next] };
}

export function canSelectTransportOption(option: TransportRouteOption): boolean {
  if (option.availability === 'AVAILABLE' && option.route_status === 'ROUTED') return true;
  if (option.availability === 'ESTIMATE_UNVERIFIED' && option.route_status === 'HEURISTIC' && option.distance_meters !== null) return true;
  const hasUnconfirmedTrainTimes = option.mode === 'TRAIN'
    && Boolean(option.train_departure_at && option.train_arrival_at && option.train_ticket_status === 'NOT_CONFIRMED');
  return hasUnconfirmedTrainTimes && (
    option.availability === 'USER_PROVIDED'
    || (option.availability === 'AVAILABLE' && option.train_door_to_door_seconds !== null)
  );
}

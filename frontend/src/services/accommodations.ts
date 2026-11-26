import { fetchJson } from '@/lib/api';

export type AccommodationSelectionStatus = 'RECOMMENDED' | 'SELECTED' | 'BOOKED_BY_USER' | 'CHOOSE_LATER';
export type AccommodationNightsStatus = 'DATE_RANGE' | 'ESTIMATED' | 'UNKNOWN';

export interface AccommodationGroupSelection {
  groupId: string;
  city: string;
  dayNumbers: number[];
  nights: number;
  nightsStatus: AccommodationNightsStatus;
  itineraryVariantId: string;
  itinerarySignature: string;
  status: AccommodationSelectionStatus;
  stayId?: string;
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  nightlyPrice?: number;
  estimatedTotalCost?: number;
  currency?: 'VND' | 'USD' | 'EUR';
  priceUnit?: string;
  priceSource?: 'database' | 'user';
  roomCount?: number;
  averageCoordinateDistanceKm?: number;
  updatedAt?: string;
}

export interface AccommodationPlan {
  version: 1;
  groups: AccommodationGroupSelection[];
}

export interface AccommodationItineraryPayload {
  days: Array<{
    day_number: number;
    date?: string | null;
    stops: Array<{
      poi_id?: string | null;
      city?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      start_time?: string | null;
      end_time?: string | null;
    }>;
  }>;
}

export interface AccommodationRequest {
  alternative_id: string;
  trip: {
    destination: string;
    days_count: number;
    start_date?: string | null;
    end_date?: string | null;
    date_mode: 'dates' | 'flex';
    adult_count: number;
    child_count: number;
    infant_count: number;
    pet_count: number;
    total_budget?: number | null;
    lodging_preference: 'any' | 'budget' | 'standard' | 'luxury';
    room_count?: number | null;
    room_counts_by_group?: Record<string, number>;
  };
  itinerary: AccommodationItineraryPayload;
}

export interface AccommodationRecommendation {
  stay: {
    stay_id: string;
    name: string;
    category?: string | null;
    city?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    image_url?: string | null;
    website_url?: string | null;
    nightly_room_price?: number | null;
    currency?: 'VND' | 'USD' | 'EUR' | null;
    price_unit?: string | null;
    budget_tier?: string | null;
    max_guests_per_room?: number | null;
    room_types: string[];
    amenities: string[];
    rating?: number | null;
    review_count?: number | null;
    check_in?: string | null;
    check_out?: string | null;
    sustainability_evidence?: string | null;
    data_source: string;
    updated_at?: string | null;
  };
  match_score?: number | null;
  average_coordinate_distance_km?: number | null;
  estimated_total_cost?: number | null;
  estimated_cost_unit?: string | null;
  reasons: string[];
  data_coverage: string[];
}

export interface AccommodationGroupRecommendations {
  group_id: string;
  city: string;
  area_label: string;
  day_numbers: number[];
  poi_count: number;
  coordinate_poi_count: number;
  nights: number;
  nights_status: AccommodationNightsStatus;
  status: 'success' | 'no_data' | 'insufficient_location_data';
  recommendations: AccommodationRecommendation[];
  warnings: string[];
}

export interface AccommodationRecommendationResponse {
  status: 'success' | 'no_data';
  alternative_id: string;
  itinerary_signature: string;
  data_source: 'public.pois' | 'none';
  groups: AccommodationGroupRecommendations[];
  limitations: string[];
  metadata: {
    candidate_count: number;
    nights_total: number;
    total_budget_vnd?: number | null;
    pets_excluded_from_human_capacity: boolean;
  };
}

export function recommendAccommodations(
  request: AccommodationRequest,
  signal?: AbortSignal,
): Promise<AccommodationRecommendationResponse> {
  return fetchJson<AccommodationRecommendationResponse>(
    '/api/accommodations/recommendations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    },
  );
}

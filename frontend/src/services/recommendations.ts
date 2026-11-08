import { API_BASE_URL, fetchJson } from '@/lib/api';
import type { ValidatedTripData } from '@/services/tripService';

export type RecommendationBudgetBand = 1 | 2 | 3;
export type SliderBudgetTier = 'all' | '$' | '$$' | '$$$' | '$$$$';

export interface ParsedSliderWeights {
  green_weight_raw: number;
  budget_weight_raw: number;
  normalized_green_weight: number;
  normalized_budget_weight: number;
  min_eco_score: number;
  max_budget: number | null;
  eco_certified_only: boolean;
  green_transit_only: boolean;
}

export interface SliderWeightsQuery {
  green_weight: number;
  budget_weight: number;
  budget_tier: SliderBudgetTier;
}

export interface RecommendationRequest {
  interests: string[];
  budget_band?: RecommendationBudgetBand;
  green_priority: number;
  top_k: number;
  trip_data: ValidatedTripData;
  slider_weights: ParsedSliderWeights;
}

export interface RecommendedPoiRecord {
  poi_id: string;
  name: string;
  category_name: string | null;
  match_score: number;
  estimated_cost: number | null;
  satisfaction_score: number | null;
  is_local_business: boolean;
  green_score: number | null;
  lat: number | null;
  lng: number | null;
  explanation_snippet: string;
}

export interface RecommendationResponse {
  status: 'success';
  total: number;
  data: RecommendedPoiRecord[];
}

/** Returns the exact PB08-parsed values used to construct the PB09 request. */
export async function fetchParsedSliderWeights(
  params: SliderWeightsQuery,
): Promise<ParsedSliderWeights> {
  const query = new URLSearchParams({
    green_weight: String(params.green_weight),
    budget_weight: String(params.budget_weight),
    budget_tier: params.budget_tier,
  });
  return fetchJson<ParsedSliderWeights>(`/pois/weights?${query.toString()}`);
}

/** Calls PB09 through the Vite proxy or directly through an absolute API URL. */
export async function fetchPoiRecommendations(
  request: RecommendationRequest,
): Promise<RecommendationResponse> {
  const baseHasApiSuffix = /\/api$/i.test(API_BASE_URL);
  const usesRelativeViteProxy = API_BASE_URL.startsWith('/');
  const endpoint = baseHasApiSuffix && !usesRelativeViteProxy
    ? '/v1/recommendations/poi'
    : '/api/v1/recommendations/poi';

  return fetchJson<RecommendationResponse>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

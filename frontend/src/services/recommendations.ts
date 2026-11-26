import { fetchJson } from '@/lib/api';
import type { ValidatedTripData } from '@/services/tripService';

export type RecommendationBudgetBand = 1 | 2 | 3;
export type RecommendationBudgetTier = 'any' | 'budget' | 'standard' | 'upgrade' | 'luxury';
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
  destination?: string;
  interests?: string[];
  budget_band?: RecommendationBudgetBand;
  budget_tier?: RecommendationBudgetTier;
  ideas?: string[];
  trip_days?: number;
  green_priority?: number;
  top_k?: number;
  offset?: number;
  snapshot_id?: string;
  trip_data?: ValidatedTripData;
  slider_weights?: ParsedSliderWeights;
}

export interface RecommendationScoreFactor {
  key: string;
  label: string;
  contribution_points: number;
  normalized_value?: number | null;
  source?: string | null;
}

export interface RecommendationScoreBreakdown {
  algorithm: string;
  factors: RecommendationScoreFactor[];
  matched_interests?: string[];
  budget_time_filter_applied?: boolean;
}

export interface RecommendedPoiRecord {
  poi_id: string;
  name: string;
  category_name: string | null;
  sub_category?: string | null;
  city?: string | null;
  average_visit_minutes?: number | null;
  best_time?: string[] | null;
  opening_hours?: Record<string, unknown> | null;
  match_score: number;
  estimated_cost: number | null;
  satisfaction_score: number | null;
  is_local_business: boolean;
  is_green?: boolean | null;
  green_score: number | null;
  lat: number | null;
  lng: number | null;
  image?: string | null;
  gallery?: string[] | null;
  explanation_snippet: string;
  score_breakdown?: RecommendationScoreBreakdown | null;
}

export interface RecommendationResponse {
  status: 'success';
  total: number;
  data: RecommendedPoiRecord[];
  has_more: boolean;
  next_offset: number | null;
  snapshot_id: string;
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

/** Calls PB09 through the canonical /v1/recommendations/poi route (Vite proxy adds /api in dev/Docker). */
export async function fetchPoiRecommendations(
  request: RecommendationRequest,
  signal?: AbortSignal,
): Promise<RecommendationResponse> {
  return fetchJson<RecommendationResponse>('/v1/recommendations/poi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
}

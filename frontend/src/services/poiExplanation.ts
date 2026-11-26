import { fetchJson } from '@/lib/api';

export type ExplanationRelationship =
  | 'IN_CATEGORY'
  | 'OFFERS_ACTIVITY'
  | 'LOCATED_IN'
  | 'HAS_FEATURE'
  | 'HAS_ECO_PRACTICE'
  | 'BEST_TIME'
  | string;

export type ExplanationTargetType =
  | 'Category'
  | 'Activity'
  | 'Location'
  | 'Feature'
  | 'EcoPractice'
  | 'TimeWindow'
  | string;

export interface ExplanationFact {
  relationship: ExplanationRelationship;
  target_type: ExplanationTargetType;
  target_key: string;
  target_name: string | null;
}

export interface GreenScorePillar {
  key: string;
  label: string;
  weight_pct: number;
  score: number;
}

export interface PoiExplanationResponse {
  poi: {
    id: string;
    name: string | null;
    is_local_business: boolean | null;
    local_business_type: string | null;
    source: string | null;
  };
  facts: ExplanationFact[];
  explanation_source?: string | null;
  green_score_breakdown?: GreenScorePillar[] | null;
}

export function getPoiExplanationFacts(
  poiId: string,
  signal?: AbortSignal,
): Promise<PoiExplanationResponse> {
  return fetchJson<PoiExplanationResponse>(
    `/pois/${encodeURIComponent(poiId)}/explanation-facts`,
    { signal },
  );
}

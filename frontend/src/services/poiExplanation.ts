import { fetchJson } from '@/lib/api';

export type ExplanationRelationship =
  | 'IN_CATEGORY'
  | 'OFFERS_ACTIVITY'
  | 'LOCATED_IN';

export type ExplanationTargetType = 'Category' | 'Activity' | 'Location';

export interface ExplanationFact {
  relationship: ExplanationRelationship;
  target_type: ExplanationTargetType;
  target_key: string;
  target_name: string | null;
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

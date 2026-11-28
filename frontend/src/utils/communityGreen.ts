export const COMMUNITY_GREEN_CRITERIA = [
  'cleanliness_waste',
  'single_use_plastic',
  'ecosystem_protection',
  'responsible_management',
] as const;

export type CommunityGreenCriterion = typeof COMMUNITY_GREEN_CRITERIA[number];
export type CommunityGreenScores = Record<CommunityGreenCriterion, number | null>;

export interface CommunityGreenReview {
  review_id: string;
  poi_id: string;
  trip_id: string;
  visit_reference: string;
  visit_verification_type: 'SELF_REPORTED_VISIT';
  cleanliness_waste: number | null;
  single_use_plastic: number | null;
  ecosystem_protection: number | null;
  responsible_management: number | null;
  comment: string | null;
  review_version: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CommunityGreenAggregate {
  poi_id: string;
  source: 'GREENTRIP_COMMUNITY';
  score_scale: '1-5';
  community_green_score: number | null;
  review_count: number;
  feedback_count: number;
  criterion_average_scores: CommunityGreenScores;
  criterion_review_counts: Record<CommunityGreenCriterion, number>;
  sample_note: string;
}

export interface CommunityGreenReviewInput extends CommunityGreenScores {
  trip_id: string;
  stop_id: string;
  comment?: string | null;
  expected_version?: number;
}

const FOOD_CATEGORIES = new Set(['quan-an', 'am-thuc']);
const NATURE_CATEGORIES = new Set(['canh-quan']);
const HERITAGE_CATEGORIES = new Set(['di-tich', 'chua']);

export function communityGreenCriteriaFor(category: string, subCategory?: string | null): CommunityGreenCriterion[] {
  const normalized = `${category || ''} ${subCategory || ''}`.toLowerCase();
  if ([...FOOD_CATEGORIES].some((value) => normalized.includes(value))
      || /food|restaurant|cafe|coffee|ẩm thực|quán ăn|cà phê/.test(normalized)) {
    return ['cleanliness_waste', 'single_use_plastic', 'responsible_management'];
  }
  if ([...NATURE_CATEGORIES, ...HERITAGE_CATEGORIES].some((value) => normalized.includes(value))
      || /nature|landscape|heritage|temple|di tích|cảnh quan|chùa|thiên nhiên/.test(normalized)) {
    return ['cleanliness_waste', 'ecosystem_protection', 'responsible_management'];
  }
  return [...COMMUNITY_GREEN_CRITERIA];
}

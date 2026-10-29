import { fetchJson } from '@/lib/api';
import type { PaginatedPoisResponse, Poi } from '@/data/pois';
import type { BudgetTier, EcoPriority } from '@/components/poi/ExploreFilterModal';

export interface GetPoisParams {
  page?: number;
  limit?: number;
  category?: string;
  city?: string;
  green_weight?: number;
  budget_weight?: number;
  eco_priority?: EcoPriority;
  budget_tier?: BudgetTier;
  eco_certified_only?: boolean;
  green_transit_only?: boolean;
}

export const ECO_PRIORITY_WEIGHT_MAP: Record<EcoPriority, number> = {
  all: 50,
  basic: 30,
  balanced: 55,
  eco: 75,
  pure: 90,
};

export const BUDGET_SCORE_CAP = 1_000_000;
export const DEFAULT_MISSING_GREEN_SCORE = 0.5;
export const DEFAULT_MISSING_BUDGET_SCORE = 0.5;
export const ECO_CERTIFIED_MIN_SCORE = 75;

export const BUDGET_TIER_SCORE_FALLBACK: Record<string, number> = {
  free: 1.0,
  $: 0.9,
  $$: 0.65,
  $$$: 0.3,
  $$$$: 0.0,
};

export const GREEN_TRANSIT_KEYWORDS = [
  'transit',
  'bus',
  'bike',
  'bicycle',
  'walk',
  'walking',
  'pedestrian',
  'electric',
  'ev',
  'xe buýt',
  'xe đạp',
  'đi bộ',
  'xe điện',
  'giao thông xanh',
];

export interface NormalizedSliderWeights {
  normGreen: number;
  normBudget: number;
  zeroWeightsFallback: boolean;
}

/**
 * Chuẩn hóa cặp trọng số (green, budget) trong khoảng [0, 100] về tổng = 1.0.
 * Khớp 100% với hàm normalize_weights ở backend/app/pois/weights.py.
 */
export function normalizeSliderWeights(
  green: number,
  budget: number
): NormalizedSliderWeights {
  const safeGreen = Math.max(0, Math.min(100, Number(green) || 0));
  const safeBudget = Math.max(0, Math.min(100, Number(budget) || 0));
  const total = safeGreen + safeBudget;

  if (total <= 0) {
    return {
      normGreen: 0.5,
      normBudget: 0.5,
      zeroWeightsFallback: true,
    };
  }

  const normGreen = Math.round((safeGreen / total) * 10000) / 10000;
  const normBudget = Math.round((1.0 - normGreen) * 10000) / 10000;
  return {
    normGreen,
    normBudget,
    zeroWeightsFallback: false,
  };
}

/**
 * Chuẩn hóa điểm xanh của POI về [0.0, 1.0] (hỗ trợ cả thang 0..1 và 0..100).
 * Khớp 100% với compute_green_score_normalized ở Backend.
 */
export function computeGreenScoreNormalized(
  ecoScore: number | null | undefined
): number {
  if (ecoScore === null || ecoScore === undefined || !Number.isFinite(Number(ecoScore))) {
    return DEFAULT_MISSING_GREEN_SCORE;
  }
  const val = Number(ecoScore);
  if (val < 0) return 0;
  const eco100 = val <= 1 ? Math.min(100, val * 100) : Math.min(100, val);
  return Math.round((eco100 / 100) * 1_000_000) / 1_000_000;
}

/**
 * Chuẩn hóa điểm phù hợp ngân sách của POI về [0.0, 1.0].
 * Khớp 100% với compute_budget_score_normalized ở Backend:
 * S_b(p) = max(0, 1 - min(C_p, 1_000_000) / 1_000_000), fallback sang budget_tier nếu thiếu C_p.
 */
export function computeBudgetScoreNormalized(
  estimatedCost: number | null | undefined,
  budgetTier?: string | null
): number {
  if (
    estimatedCost !== null &&
    estimatedCost !== undefined &&
    Number.isFinite(Number(estimatedCost))
  ) {
    const cost = Math.max(0, Number(estimatedCost));
    const score = Math.max(0, 1 - Math.min(cost, BUDGET_SCORE_CAP) / BUDGET_SCORE_CAP);
    return Math.round(score * 1_000_000) / 1_000_000;
  }

  if (budgetTier) {
    const tierKey = budgetTier.trim().toLowerCase();
    if (tierKey in BUDGET_TIER_SCORE_FALLBACK) {
      return BUDGET_TIER_SCORE_FALLBACK[tierKey];
    }
  }

  return DEFAULT_MISSING_BUDGET_SCORE;
}

/**
 * Tính điểm đa mục tiêu thống nhất giữa Backend và Frontend:
 * Score(p) = w_g * S_g(p) + w_b * S_b(p)
 */
export function computePoiWeightedScore(
  poi: Pick<Poi, 'ecoScore' | 'estimatedCost' | 'budget_tier'>,
  greenWeight: number,
  budgetWeight: number
): number {
  const { normGreen, normBudget } = normalizeSliderWeights(greenWeight, budgetWeight);
  const sGreen = computeGreenScoreNormalized(poi.ecoScore);
  const sBudget = computeBudgetScoreNormalized(poi.estimatedCost, poi.budget_tier);
  const score = normGreen * sGreen + normBudget * sBudget;
  return Math.round(score * 1_000_000) / 1_000_000;
}

/**
 * Kiểm tra POI đạt chuẩn Eco-Certified (khớp với is_poi_eco_certified ở Backend).
 */
export function isPoiEcoCertified(
  poi: Pick<Poi, 'ecoScore' | 'eco_features'>
): boolean {
  if (poi.ecoScore >= ECO_CERTIFIED_MIN_SCORE) {
    return true;
  }
  if (Array.isArray(poi.eco_features) && poi.eco_features.length > 0) {
    return true;
  }
  return false;
}

/**
 * Kiểm tra POI hỗ trợ phương tiện di chuyển xanh (khớp với is_poi_green_transit ở Backend).
 */
export function isPoiGreenTransit(
  poi: Pick<Poi, 'eco_features' | 'ai_metadata'>
): boolean {
  if (Array.isArray(poi.eco_features)) {
    for (const feature of poi.eco_features) {
      const lower = String(feature).toLowerCase();
      if (GREEN_TRANSIT_KEYWORDS.some((kw) => lower.includes(kw))) {
        return true;
      }
    }
  }

  const meta = poi.ai_metadata;
  if (meta) {
    if (meta.green_transit === true) {
      return true;
    }
    if (
      typeof meta.carbon_footprint_score === 'number' &&
      meta.carbon_footprint_score >= 75
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Gọi Backend API lấy danh sách POI với các query parameters đã lọc & chuẩn hóa
 */
export async function getPois(params: GetPoisParams = {}): Promise<PaginatedPoisResponse> {
  const query = new URLSearchParams();

  if (params.page !== undefined && params.page > 0) {
    query.set('page', String(params.page));
  }
  if (params.limit !== undefined && params.limit > 0) {
    query.set('limit', String(params.limit));
  }
  if (params.category && params.category !== 'all') {
    query.set('category', params.category);
  }
  if (params.city && params.city !== 'all') {
    query.set('city', params.city);
  }

  // Tách bạch trọng số xếp hạng (green_weight, budget_weight) khỏi ngưỡng lọc (eco_priority)
  if (params.green_weight !== undefined) {
    query.set('green_weight', String(params.green_weight));
  }
  if (params.budget_weight !== undefined) {
    query.set('budget_weight', String(params.budget_weight));
  }
  if (params.eco_priority && params.eco_priority !== 'all') {
    query.set('eco_priority', params.eco_priority);
  }

  if (params.budget_tier && params.budget_tier !== 'all') {
    query.set('budget_tier', params.budget_tier);
  }

  if (params.eco_certified_only) {
    query.set('eco_certified_only', 'true');
  }

  if (params.green_transit_only) {
    query.set('green_transit_only', 'true');
  }

  const queryString = query.toString();
  const path = queryString ? `/pois?${queryString}` : '/pois';

  return fetchJson<PaginatedPoisResponse>(path);
}

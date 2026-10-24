import { fetchJson } from '@/lib/api';
import type { PaginatedPoisResponse } from '@/data/pois';
import type { BudgetTier, EcoPriority } from '@/components/poi/ExploreFilterPopover';

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

  // Slider weights & priority
  if (params.green_weight !== undefined) {
    query.set('green_weight', String(params.green_weight));
  } else if (params.eco_priority && params.eco_priority !== 'all') {
    query.set('green_weight', String(ECO_PRIORITY_WEIGHT_MAP[params.eco_priority]));
    query.set('eco_priority', params.eco_priority);
  }

  if (params.budget_weight !== undefined) {
    query.set('budget_weight', String(params.budget_weight));
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

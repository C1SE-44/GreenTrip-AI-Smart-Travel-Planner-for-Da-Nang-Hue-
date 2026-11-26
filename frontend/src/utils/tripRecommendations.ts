import {
  getDeterministicImage,
  normalizeCategory,
  normalizeCity,
  type Poi,
} from '@/data/pois';
import type { ValidatedTripData } from '@/services/tripService';

export type RecommendationLoadState = 'loading' | 'success' | 'empty' | 'error';
export type RecommendedPoi = Poi & {
  matchScore?: number;
  greenScoreKnown: boolean;
  priceKnown: boolean;
  ratingKnown: boolean;
  satisfactionScore?: number | null;
  recommendationReason?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  cuisine?: string | null;
  priceUnit?: string | null;
  priceRangeDisplay?: string | null;
  poiStatus?: string | null;
  isActive?: boolean | null;
  recommendationSource?: string | null;
  verificationStatus?: string | null;
};

export interface RecommendationApiRecord {
  poi_id?: string | number | null;
  name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  sub_category?: string | null;
  cuisine?: string | null;
  address?: string | null;
  average_visit_minutes?: number | string | null;
  best_time?: string[] | null;
  opening_hours?: Poi['opening_hours'];
  match_score?: number | string | null;
  estimated_cost?: number | string | null;
  price_unit?: string | null;
  price_range_display?: string | null;
  budget_tier?: string | null;
  satisfaction_score?: number | string | null;
  is_local_business?: boolean | null;
  is_green?: boolean | null;
  green_score?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  image?: string | null;
  gallery?: string[] | null;
  city?: string | null;
  eco_features?: string[] | null;
  ai_metadata?: Record<string, unknown> | null;
  status?: string | null;
  is_active?: boolean | null;
  repository_source?: string | null;
  explanation_snippet?: string | null;
}

export interface RecommendationTripWorkspaceInput {
  destination: string;
  daysCount?: number;
  peopleCount?: number;
  adultCount?: number;
  childCount?: number;
  totalBudget?: number | null;
  budgetInputAmount?: number | null;
  budgetScope?: 'PER_PERSON' | 'TOTAL_GROUP' | null;
  startDate?: string | null;
  endDate?: string | null;
  interests?: string[];
  pacingLevel?: string;
  pacingLabel?: string;
  costBreakdown?: ValidatedTripData['cost_breakdown'];
  matchedPois?: ValidatedTripData['matched_pois'];
  itineraryOutline?: ValidatedTripData['itinerary_outline'];
  categoryBudgets: { dining: string; lodging: string; activities: string };
}

function tierForRecommendation(value: string): ValidatedTripData['budget_tier'] {
  if (value === '$' || value === 'budget') return 'budget';
  if (value === '$$' || value === 'standard') return 'standard';
  if (value === '$$$' || value === '$$$$' || value === 'luxury' || value === 'upgrade') return 'luxury';
  return null;
}

export function buildRecommendationTripData(
  trip: RecommendationTripWorkspaceInput,
): ValidatedTripData {
  const days = Number.isInteger(trip.daysCount) && (trip.daysCount ?? 0) > 0
    ? trip.daysCount as number
    : 1;
  const peopleCount = Number.isInteger(trip.peopleCount) && (trip.peopleCount ?? 0) > 0
    ? trip.peopleCount as number
    : 1;
  const totalBudget = Number.isSafeInteger(trip.totalBudget) && (trip.totalBudget ?? 0) > 0
    ? trip.totalBudget as number
    : null;
  const budgetTravelerCount = trip.budgetScope === 'PER_PERSON'
    ? ((trip.adultCount ?? 0) + (trip.childCount ?? 0) || null)
    : null;
  const dailyBudgetTravelerCount = trip.budgetScope === 'PER_PERSON'
    ? budgetTravelerCount
    : peopleCount;
  const dailyBudgetPerPerson = totalBudget === null || dailyBudgetTravelerCount === null
    ? null
    : totalBudget / (days * dailyBudgetTravelerCount);
  const rawBudgetAmount = Number.isSafeInteger(trip.budgetInputAmount) && (trip.budgetInputAmount ?? 0) > 0
    ? trip.budgetInputAmount as number
    : null;
  const budgetScope = rawBudgetAmount !== null ? trip.budgetScope ?? null : null;
  const pacingLevel = trip.pacingLevel === 'Relaxed' || trip.pacingLevel === 'Fast'
    ? trip.pacingLevel
    : 'Balanced';

  return {
    destination: trip.destination,
    days,
    num_people: peopleCount,
    total_budget: totalBudget,
    budget_amount: budgetScope ? rawBudgetAmount : null,
    budget_scope: budgetScope,
    budget_traveler_count: budgetScope === 'PER_PERSON' ? budgetTravelerCount : null,
    daily_budget_per_person: dailyBudgetPerPerson,
    budget_tier: null,
    dining_tier: tierForRecommendation(trip.categoryBudgets.dining),
    lodging_tier: tierForRecommendation(trip.categoryBudgets.lodging),
    activities_tier: tierForRecommendation(trip.categoryBudgets.activities),
    pacing_level: pacingLevel,
    pacing_label: trip.pacingLabel ?? pacingLevel,
    pacing_desc: '',
    is_budget_sufficient: null,
    min_recommended_budget: null,
    budget_warning: null,
    start_date: trip.startDate ?? null,
    end_date: trip.endDate ?? null,
    preferences: Array.from(new Set((trip.interests ?? []).filter((interest) => typeof interest === 'string' && interest.trim()))),
    cost_breakdown: trip.costBreakdown ?? null,
    recommendations: [],
    matched_pois: trip.matchedPois ?? [],
    itinerary_outline: trip.itineraryOutline ?? [],
  };
}

function normalizedKey(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('vi-VN');
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesReference(reference: string, poi: Poi, catalogue: Poi[]): boolean {
  const key = normalizedKey(reference);
  if (!key) return false;
  if (key === normalizedKey(poi.id) || key === normalizedKey(poi.name)) return true;

  const referencedPoi = catalogue.find(
    (candidate) => key === normalizedKey(candidate.id) || key === normalizedKey(candidate.name),
  );
  return Boolean(
    referencedPoi &&
      (normalizedKey(referencedPoi.id) === normalizedKey(poi.id) ||
        normalizedKey(referencedPoi.name) === normalizedKey(poi.name)),
  );
}

export function mapRecommendationRecords(
  records: unknown,
  catalogue: Poi[],
  destination: string,
): RecommendedPoi[] {
  if (!Array.isArray(records)) return [];

  const mapped: RecommendedPoi[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const rawRecord of records) {
    if (!rawRecord || typeof rawRecord !== 'object') continue;
    const record = rawRecord as RecommendationApiRecord;
    const apiId = String(record.poi_id ?? '').trim();
    const apiName = String(record.name ?? '').trim();
    if (!apiId || !apiName) continue;

    const localPoi = catalogue.find(
      (poi) => normalizedKey(poi.id) === normalizedKey(apiId) || normalizedKey(poi.name) === normalizedKey(apiName),
    );
    const apiCategoryProvided = Object.prototype.hasOwnProperty.call(record, 'category_name');
    const categoryName = apiCategoryProvided
      ? record.category_name?.trim() || null
      : localPoi?.category || null;
    const categoryValue = categoryName || 'Chưa phân loại';
    const apiCityProvided = Object.prototype.hasOwnProperty.call(record, 'city');
    const cityValue = apiCityProvided
      ? record.city?.trim() || ''
      : localPoi?.city || (/&/.test(destination) ? '' : destination);
    if (!cityValue) continue;

    const category = normalizeCategory(categoryValue);
    const city = normalizeCity(cityValue);
    const apiLatitudeProvided = Object.prototype.hasOwnProperty.call(record, 'lat');
    const apiLongitudeProvided = Object.prototype.hasOwnProperty.call(record, 'lng');
    const rawLatitude = apiLatitudeProvided ? numberOrNull(record.lat) : numberOrNull(localPoi?.lat);
    const rawLongitude = apiLongitudeProvided ? numberOrNull(record.lng) : numberOrNull(localPoi?.lng);
    const latitude = rawLatitude !== null && rawLatitude >= -90 && rawLatitude <= 90
      ? rawLatitude
      : Number.NaN;
    const longitude = rawLongitude !== null && rawLongitude >= -180 && rawLongitude <= 180
      ? rawLongitude
      : Number.NaN;
    const cost = numberOrNull(record.estimated_cost);
    const localCost = numberOrNull(localPoi?.estimatedCost);
    const apiCostProvided = Object.prototype.hasOwnProperty.call(record, 'estimated_cost');
    const estimatedCost = apiCostProvided
      ? (cost !== null && cost >= 0 ? cost : null)
      : localCost;
    const rawGreenScore = numberOrNull(record.green_score);
    const apiGreenProvided = Object.prototype.hasOwnProperty.call(record, 'green_score');
    const validGreenScore = rawGreenScore !== null && rawGreenScore >= 0 && rawGreenScore <= 100;
    const localGreenScoreKnown = localPoi?.ecoScoreKnown ?? (typeof localPoi?.ecoScore === 'number');
    const greenScoreKnown = apiGreenProvided
      ? validGreenScore
      : localGreenScoreKnown;
    const ecoScore = apiGreenProvided
      ? validGreenScore ? Math.round(rawGreenScore <= 1 ? rawGreenScore * 100 : rawGreenScore) : 50
      : localGreenScoreKnown ? localPoi?.ecoScore ?? 50 : 50;
    const averageVisitMinutes = Object.prototype.hasOwnProperty.call(record, 'average_visit_minutes')
      ? numberOrNull(record.average_visit_minutes)
      : localPoi?.average_visit_minutes ?? null;
    const rating = numberOrNull(record.satisfaction_score);
    const apiRatingProvided = Object.prototype.hasOwnProperty.call(record, 'satisfaction_score');
    const apiImage = typeof record.image === 'string' ? record.image.trim() : '';
    const image = apiImage || localPoi?.image || getDeterministicImage(apiName, apiId, category, city);
    const id = String(localPoi?.id ?? apiId);
    const name = localPoi?.name ?? apiName;
    const idKey = normalizedKey(id);
    const nameKey = normalizedKey(name);
    if (seenIds.has(idKey) || seenNames.has(nameKey)) continue;
    seenIds.add(idKey);
    seenNames.add(nameKey);

    const matchScore = numberOrNull(record.match_score);
    mapped.push({
      ...(localPoi ?? {}),
      id,
      name,
      category,
      city,
      lat: latitude,
      lng: longitude,
      image,
      gallery: Array.isArray(record.gallery)
        ? record.gallery.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : localPoi?.gallery,
      address: Object.prototype.hasOwnProperty.call(record, 'address')
        ? record.address?.trim() || null
        : localPoi?.address || null,
      description: record.explanation_snippet?.trim() || localPoi?.description || 'Địa điểm được đề xuất cho chuyến đi của bạn.',
      recommendationReason: record.explanation_snippet?.trim() || undefined,
      rating: apiRatingProvided
        ? rating !== null && rating >= 0 && rating <= 5 ? rating : 0
        : localPoi?.rating ?? 0,
      satisfactionScore: apiRatingProvided
        ? rating !== null && rating >= 0 && rating <= 5 ? rating : null
        : localPoi?.rating ?? null,
      ratingKnown: apiRatingProvided
        ? rating !== null && rating >= 0 && rating <= 5
        : typeof localPoi?.rating === 'number',
      visitDuration: averageVisitMinutes !== null
        ? `${averageVisitMinutes} phút`
        : localPoi?.visitDuration ?? 'Chưa có thông tin thời lượng',
      average_visit_minutes: averageVisitMinutes,
      isGreen: typeof record.is_green === 'boolean'
        ? record.is_green
        : apiGreenProvided ? false : localPoi?.isGreen ?? false,
      ecoScore,
      greenScoreKnown,
      priceKnown: estimatedCost !== null || Boolean(record.price_range_display?.trim()),
      estimatedCost,
      matchScore: matchScore !== null ? Math.round(matchScore) : undefined,
      isLocalBusiness: Object.prototype.hasOwnProperty.call(record, 'is_local_business')
        ? record.is_local_business ?? undefined
        : localPoi?.isLocalBusiness,
      sub_category: Object.prototype.hasOwnProperty.call(record, 'sub_category')
        ? record.sub_category ?? null
        : localPoi?.sub_category ?? null,
      cuisine: Object.prototype.hasOwnProperty.call(record, 'cuisine')
        ? record.cuisine ?? null
        : localPoi?.cuisine ?? null,
      categoryId: record.category_id ?? null,
      categoryName,
      priceUnit: record.price_unit?.trim() || null,
      priceRangeDisplay: record.price_range_display?.trim() || null,
      budget_tier: Object.prototype.hasOwnProperty.call(record, 'budget_tier')
        ? record.budget_tier ?? null
        : localPoi?.budget_tier ?? null,
      eco_features: Object.prototype.hasOwnProperty.call(record, 'eco_features')
        ? record.eco_features ?? []
        : localPoi?.eco_features ?? [],
      ai_metadata: Object.prototype.hasOwnProperty.call(record, 'ai_metadata')
        ? record.ai_metadata ?? null
        : localPoi?.ai_metadata ?? null,
      poiStatus: record.status ?? null,
      isActive: record.is_active ?? null,
      recommendationSource: record.repository_source ?? null,
      verificationStatus: typeof record.ai_metadata?.verification_status === 'string'
        ? record.ai_metadata.verification_status
        : null,
      best_time: Object.prototype.hasOwnProperty.call(record, 'best_time')
        ? record.best_time ?? []
        : localPoi?.best_time ?? [],
      opening_hours: Object.prototype.hasOwnProperty.call(record, 'opening_hours')
        ? record.opening_hours ?? null
        : localPoi?.opening_hours ?? null,
    });
  }

  return mapped;
}

export function recommendationsNotAlreadySelected(
  recommendations: RecommendedPoi[],
  ideas: string[],
  catalogue: Poi[],
  additionalExclusions: string[] = [],
): RecommendedPoi[] {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const exclusions = [...ideas, ...additionalExclusions];

  return recommendations.filter((poi) => {
    const idKey = normalizedKey(poi.id);
    const nameKey = normalizedKey(poi.name);
    if (
      exclusions.some((reference) => matchesReference(reference, poi, catalogue)) ||
      seenIds.has(idKey) ||
      seenNames.has(nameKey)
    ) {
      return false;
    }
    seenIds.add(idKey);
    seenNames.add(nameKey);
    return true;
  });
}

export function recommendationsForYouTab(
  status: RecommendationLoadState,
  recommendations: RecommendedPoi[],
  ideas: string[],
  catalogue: Poi[],
): RecommendedPoi[] {
  if (status !== 'success') return [];
  return recommendationsNotAlreadySelected(recommendations, ideas, catalogue);
}

export function addRecommendationToIdeas(
  ideas: string[],
  poi: Poi,
  catalogue: Poi[],
): string[] {
  if (ideas.some((reference) => matchesReference(reference, poi, catalogue))) return ideas;
  return [...ideas, String(poi.id)];
}

export function recommendationGroupsForTrip(
  tripRecommendations: RecommendedPoi[],
  similarRecommendations: RecommendedPoi[],
  ideas: string[],
  scheduledPoiReferences: string[],
  catalogue: Poi[],
): { trip: RecommendedPoi[]; similar: RecommendedPoi[] } {
  const trip = recommendationsNotAlreadySelected(
    tripRecommendations, ideas, catalogue, scheduledPoiReferences,
  );
  if (ideas.length === 0) return { trip, similar: [] };

  const usedIds = new Set(trip.map((poi) => normalizedKey(poi.id)));
  const usedNames = new Set(trip.map((poi) => normalizedKey(poi.name)));
  const similar = recommendationsNotAlreadySelected(
    similarRecommendations, ideas, catalogue, scheduledPoiReferences,
  ).filter((poi) => !usedIds.has(normalizedKey(poi.id)) && !usedNames.has(normalizedKey(poi.name)));

  return { trip, similar };
}

import type { Poi } from '@/data/pois';

export interface TripRecommendationSignals {
  submittedSearches: string[];
  viewedPoiIds: string[];
}

export interface TripRelatedPoi {
  poi: Poi;
  reason: string;
}

export interface TripSignalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const MAX_SEARCHES = 8;
const MAX_VIEWED_POIS = 20;
const MAX_QUERY_LENGTH = 120;
const EMPTY_SIGNALS: TripRecommendationSignals = {
  submittedSearches: [],
  viewedPoiIds: [],
};

function storageKey(tripId: string): string {
  return `greentrip:trip-related-recommendations:${encodeURIComponent(tripId)}`;
}

function getSessionStorage(): TripSignalStorage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .trim();
}

function cleanStringList(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, maxLength))
    .filter(Boolean)))
    .slice(-limit);
}

export function readTripRecommendationSignals(
  tripId: string,
  storage: TripSignalStorage | null = getSessionStorage(),
): TripRecommendationSignals {
  if (!tripId || !storage) return { ...EMPTY_SIGNALS };
  try {
    const raw = storage.getItem(storageKey(tripId));
    if (!raw) return { ...EMPTY_SIGNALS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_SIGNALS };
    const record = parsed as Record<string, unknown>;
    return {
      submittedSearches: cleanStringList(record.submittedSearches, MAX_SEARCHES, MAX_QUERY_LENGTH),
      viewedPoiIds: cleanStringList(record.viewedPoiIds, MAX_VIEWED_POIS, 160),
    };
  } catch {
    return { ...EMPTY_SIGNALS };
  }
}

export function saveTripRecommendationSignals(
  tripId: string,
  signals: TripRecommendationSignals,
  storage: TripSignalStorage | null = getSessionStorage(),
): void {
  if (!tripId || !storage) return;
  try {
    storage.setItem(storageKey(tripId), JSON.stringify({
      submittedSearches: cleanStringList(signals.submittedSearches, MAX_SEARCHES, MAX_QUERY_LENGTH),
      viewedPoiIds: cleanStringList(signals.viewedPoiIds, MAX_VIEWED_POIS, 160),
    }));
  } catch {
    // Personalization remains optional when browser session storage is unavailable.
  }
}

export function addSubmittedTripSearch(
  signals: TripRecommendationSignals,
  query: string,
): TripRecommendationSignals {
  const cleaned = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!cleaned) return signals;
  return {
    ...signals,
    submittedSearches: cleanStringList(
      [...signals.submittedSearches.filter((item) => normalizeText(item) !== normalizeText(cleaned)), cleaned],
      MAX_SEARCHES,
      MAX_QUERY_LENGTH,
    ),
  };
}

export function addViewedTripPoi(
  signals: TripRecommendationSignals,
  poiId: string,
): TripRecommendationSignals {
  const cleaned = poiId.trim();
  if (!cleaned) return signals;
  return {
    ...signals,
    viewedPoiIds: cleanStringList(
      [...signals.viewedPoiIds.filter((item) => item !== cleaned), cleaned],
      MAX_VIEWED_POIS,
      160,
    ),
  };
}

function poiTags(poi: Poi): string[] {
  return [...(poi.vibes ?? []), ...(poi.ai_metadata?.dna_tags ?? [])]
    .map(normalizeText)
    .filter(Boolean);
}

function searchablePoiText(poi: Poi): string {
  const values = [
    poi.name,
    poi.description,
    poi.subTitle,
    poi.address,
    poi.category,
    poi.sub_category,
    poi.city,
    poi.ai_metadata?.area,
    poi.ai_metadata?.google_category,
    poi.ai_metadata?.mindtrip_category,
    ...(poi.vibes ?? []),
    ...(poi.ai_metadata?.dna_tags ?? []),
  ];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map(normalizeText)
    .join(' ');
}

function sharedExperienceScore(candidate: Poi, source: Poi, weight: number): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.sub_category && source.sub_category
    && normalizeText(candidate.sub_category) === normalizeText(source.sub_category)) {
    score += 32 * weight;
    reasons.push(`Cùng loại trải nghiệm với “${source.name}”.`);
  }
  if (candidate.category === source.category) {
    score += 22 * weight;
    if (reasons.length === 0) reasons.push(`Cùng danh mục với “${source.name}”.`);
  }

  const sourceTags = new Set(poiTags(source));
  const sharedTags = poiTags(candidate).filter((tag) => sourceTags.has(tag));
  if (sharedTags.length > 0) {
    score += Math.min(36, sharedTags.length * 12) * weight;
    reasons.push(`Có thuộc tính trải nghiệm trùng với “${source.name}”.`);
  }

  return { score, reasons: reasons.slice(0, 1) };
}

function submittedQueryMatch(candidate: Poi, query: string): { score: number; reason: string | null } {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return { score: 0, reason: null };
  const poiText = searchablePoiText(candidate);
  if (poiText.includes(normalizedQuery)) {
    return { score: 28, reason: `Khớp với từ khóa bạn đã tìm: “${query}”.` };
  }

  const queryWords = Array.from(new Set(normalizedQuery.split(/\s+/).filter((word) => word.length >= 3)));
  const matchedWords = queryWords.filter((word) => poiText.includes(word));
  if (matchedWords.length >= 2) {
    return {
      score: Math.min(20, matchedWords.length * 5),
      reason: `Một phần nội dung địa điểm khớp với từ khóa bạn đã tìm: “${query}”.`,
    };
  }
  return { score: 0, reason: null };
}

export function rankTripRelatedPois(
  baselineCandidates: Poi[],
  allPois: Poi[],
  selectedPoiIds: Set<string>,
  viewedPoiIds: Set<string>,
  submittedSearches: string[],
): TripRelatedPoi[] {
  const baselinePosition = new Map(baselineCandidates.map((poi, index) => [poi.id, index]));
  const selectedPois = allPois.filter((poi) => selectedPoiIds.has(poi.id));
  const viewedPois = allPois.filter((poi) => viewedPoiIds.has(poi.id) && !selectedPoiIds.has(poi.id));

  return baselineCandidates
    .map((poi) => {
      let score = 0;
      const reasons: string[] = [];

      for (const source of selectedPois) {
        const match = sharedExperienceScore(poi, source, 1);
        score += match.score;
        reasons.push(...match.reasons);
      }
      for (const source of viewedPois) {
        const match = sharedExperienceScore(poi, source, 0.55);
        score += match.score;
        reasons.push(...match.reasons.map((reason) => reason.replace('Cùng', 'Tương tự')));
      }
      for (const query of submittedSearches) {
        const match = submittedQueryMatch(poi, query);
        score += match.score;
        if (match.reason) reasons.push(match.reason);
      }

      if (score > 0 && selectedPois.some((source) => source.city === poi.city)) score += 2;
      const reason = Array.from(new Set(reasons)).slice(0, 2).join(' ');
      return { poi, reason, score, order: baselinePosition.get(poi.id) ?? Number.MAX_SAFE_INTEGER };
    })
    .filter((item) => item.score > 0 && item.reason)
    .sort((first, second) => second.score - first.score || first.order - second.order || first.poi.id.localeCompare(second.poi.id))
    .map(({ poi, reason }) => ({ poi, reason }))
    .slice(0, 6);
}

export function hasTripRecommendationSignals(signals: TripRecommendationSignals, selectedPoiCount: number): boolean {
  return selectedPoiCount > 0 || signals.viewedPoiIds.length > 0 || signals.submittedSearches.length > 0;
}

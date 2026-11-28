import { buildDefaultMindtripItinerary, type CopilotTripMessage } from '@/components/planner/copilotTripData';
import type { TimeOfDay } from '@/components/poi/ExploreFilterModal';
import { isCuratedHighlight, type Poi, type PoiCategory, type PoiCity } from '@/data/pois';
import type { CostBreakdown, DailyItineraryOutline, MatchedPOI, ValidatedTripData } from '@/services/tripService';

export interface UserTrip {
  id: string;
  title: string;
  destination: string;
  startDate?: string;
  peopleCount: number;
  tags?: string[];
  budgetTier?: string;
  flexibleDays?: number;
  flexibleMonth?: string;
  notes?: string;
  createdAt: string;
  image?: string;
  daysCount?: number;
  coverImage?: string;
  status?: string;
  prompt?: string;
  totalBudget?: number;
  budgetInputAmount?: number | null;
  budgetScope?: 'PER_PERSON' | 'TOTAL_GROUP' | null;
  tripInputVersion?: 1;
  dateMode?: 'dates' | 'flex';
  endDate?: string | null;
  adultCount?: number;
  childCount?: number;
  infantCount?: number;
  petCount?: number;
  roomCount?: number | null;
  accommodationPlan?: import('@/services/accommodations').AccommodationPlan;
  transportPlan?: import('@/services/transport').TripTransportPlan;
  greenWeight?: number;
  budgetWeight?: number;
  itineraryOutline?: DailyItineraryOutline[];
  matchedPois?: MatchedPOI[];
  preferences?: string[];
  preferenceText?: string;
  localMetadataOverrides?: {
    startDate?: string;
    daysCount?: number;
  };
  recommendationTripData?: ValidatedTripData;
  costBreakdown?: Partial<CostBreakdown>;
  pacingLabel?: string;
  pacingLevel?: 'Relaxed' | 'Balanced' | 'Fast';
  ideas?: string[];
  customIdeas?: Array<{ id: string; name: string; city: PoiCity; address?: string }>;
  savedPlaces?: string[];
  copilotChatHistory?: CopilotTripMessage[];
}

const KNOWN_MISMATCHED_TRIP_COVERS = [
  'photo-1569154941061-e231b4725ef1',
  'photo-1559592413-7cec4d0cae2b',
  'photo-1506929562872-bb421503ef21',
];

export type ExploreTabId = 'for-you' | 'quan-an' | 'di-tich' | 'canh-quan' | 'chua' | 'luu-tru';

export const CATEGORY_META: Record<PoiCategory, { icon: string; label: string }> = {
  'quan-an': { icon: 'ph-fork-knife', label: 'Quán ăn' },
  'di-tich': { icon: 'ph-landmark', label: 'Di tích' },
  'chua': { icon: 'ph-hands-praying', label: 'Chùa & Tâm linh' },
  'canh-quan': { icon: 'ph-mountains', label: 'Cảnh quan' },
  'luu-tru': { icon: 'ph-bed', label: 'Lưu trú' },
};

export const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Đà Nẵng': { lat: 16.0678, lng: 108.2208 },
  'Huế': { lat: 16.4637, lng: 107.5909 },
  default: { lat: 16.0678, lng: 108.2208 },
};

export function getTripCoverFallback(destination: string): string {
  const normalizedDestination = destination
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd');
  const includesHue = normalizedDestination.includes('hue');
  const includesDaNang = normalizedDestination.includes('da nang');

  if ((includesHue && includesDaNang) || normalizedDestination.includes('mien trung')) {
    return '/images/danang_hue_banner.jpg';
  }
  if (includesHue) return '/images/landing/hue-hero-640.webp';
  return '/images/landing/danang-hero-640.webp';
}

export function resolveTripCoverImage(image: string | undefined, destination: string): string {
  const candidate = image?.trim();

  if (candidate?.startsWith('/') && !candidate.startsWith('//')) return candidate;

  if (candidate) {
    try {
      const parsed = new URL(candidate);
      const isKnownMismatchedCover = KNOWN_MISMATCHED_TRIP_COVERS.some((photoId) => parsed.pathname.includes(photoId));
      if (!isKnownMismatchedCover && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) return candidate;
    } catch {
      // Invalid image addresses use the local city artwork below.
    }
  }

  return getTripCoverFallback(destination);
}

export function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Reuses Explore's existing Hoàng Anh "Dành cho bạn" ranking in Planner. */
export function rankPoisForYou(matchedPois: Poi[], allPois: Poi[], savedIds: Set<string>): Poi[] {
  const likedPois = allPois.filter((poi) => savedIds.has(poi.id));
  const likedCategories = new Set(likedPois.map((poi) => poi.category));
  const likedCities = new Set(likedPois.map((poi) => poi.city));
  const likedSubcategories = new Set(likedPois.map((poi) => poi.sub_category?.toLowerCase()).filter(Boolean));

  return [...matchedPois].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (likedPois.length > 0) {
      if (likedCategories.has(a.category)) scoreA += 30;
      if (likedCategories.has(b.category)) scoreB += 30;
      if (a.sub_category && likedSubcategories.has(a.sub_category.toLowerCase())) scoreA += 25;
      if (b.sub_category && likedSubcategories.has(b.sub_category.toLowerCase())) scoreB += 25;
      if (likedCities.has(a.city)) scoreA += 15;
      if (likedCities.has(b.city)) scoreB += 15;
    }

    if (a.isGreen) scoreA += 35;
    if (b.isGreen) scoreB += 35;
    if (a.ecoScore) scoreA += a.ecoScore / 10;
    if (b.ecoScore) scoreB += b.ecoScore / 10;

    scoreA += (a.rating || 4.0) * 10;
    scoreB += (b.rating || 4.0) * 10;

    if (savedIds.has(a.id)) scoreA += 15;
    if (savedIds.has(b.id)) scoreB += 15;

    if (isCuratedHighlight(a)) scoreA += 25;
    if (isCuratedHighlight(b)) scoreB += 25;

    if (a.category === 'luu-tru' && !likedCategories.has('luu-tru')) scoreA -= 15;
    if (b.category === 'luu-tru' && !likedCategories.has('luu-tru')) scoreB -= 15;

    return scoreB - scoreA;
  });
}

export function matchesTimeOfDay(poi: Poi, timeOfDayList: TimeOfDay[]): boolean {
  if (timeOfDayList.length === 0) return true;

  return timeOfDayList.some((tod) => {
    if (poi.best_time && poi.best_time.length > 0) {
      const matchExplicit = poi.best_time.some((t) => t.toLowerCase().includes(tod));
      if (matchExplicit) return true;
    }

    if (poi.category === 'luu-tru') return true;
    const name = poi.name.toLowerCase();
    const desc = (poi.description || '').toLowerCase();
    const sub = (poi.sub_category || '').toLowerCase();

    if (tod === 'morning') {
      if (poi.category === 'chua') return true;
      if (
        sub === 'traditional_noodles' ||
        name.includes('bún') ||
        name.includes('mì') ||
        name.includes('phở') ||
        name.includes('cháo')
      ) {
        return true;
      }
      if (
        sub === 'workspace_study_cafe' ||
        sub === 'specialty_roastery' ||
        sub === 'retro_street_cafe'
      ) {
        return true;
      }
      if (
        name.includes('bình minh') ||
        desc.includes('bình minh') ||
        name.includes('mỹ khê') ||
        name.includes('chợ')
      ) {
        return true;
      }
      if (poi.category === 'di-tich') return true;
      return false;
    }

    if (tod === 'afternoon') {
      if (poi.category === 'canh-quan') return true;
      if (poi.category === 'di-tich') return true;
      if (sub === 'scenic_view_cafe' || sub === 'desserts_bakery') return true;
      if (name.includes('hoàng hôn') || desc.includes('hoàng hôn') || desc.includes('chiều')) {
        return true;
      }
      if (poi.category === 'quan-an') return true;
      return false;
    }

    if (tod === 'evening') {
      if (
        name.includes('cầu rồng') ||
        name.includes('sông hàn') ||
        name.includes('cầu trường tiền')
      ) {
        return true;
      }
      if (
        name.includes('chợ đêm') ||
        name.includes('phố đi bộ') ||
        desc.includes('đêm') ||
        desc.includes('tối')
      ) {
        return true;
      }
      if (
        sub === 'nightlife_bars_pubs' ||
        sub === 'scenic_view_cafe' ||
        sub === 'heritage_fine_dining' ||
        sub === 'coastal_seafood'
      ) {
        return true;
      }
      if (poi.category === 'quan-an') return true;
      return false;
    }

    return true;
  });
}

export const SEEDED_SAMPLE_TRIPS: UserTrip[] = [
  {
    id: 'sample-danang-hue-3d',
    title: 'Hành trình Xanh Đà Nẵng - Huế (3 Ngày)',
    destination: 'Đà Nẵng & Huế',
    startDate: 'Ngày 05 – 07 tháng 12',
    peopleCount: 2,
    daysCount: 3,
    tags: ['Đà Nẵng & Huế', '3 Ngày', 'Lộ trình tối ưu OSRM', 'Xanh'],
    createdAt: '2026-11-23',
    image: '/images/landing/danang-hero-640.webp',
    ideas: [
      '029a28df-b091-49d9-a911-738572c72464',
      'd58fe815-4aa1-45b2-831a-11b97e130918',
      'bfed964e-ff10-44f4-8654-2136245ab062',
    ],
    itineraryOutline: buildDefaultMindtripItinerary('Đà Nẵng & Huế', 3) as unknown as DailyItineraryOutline[],
  },
  {
    id: 'sample-danang-hue-5d',
    title: 'Đà Nẵng - Huế Trọn Vẹn (5 Ngày)',
    destination: 'Đà Nẵng & Huế',
    startDate: 'Ngày 12 – 16 tháng 12',
    peopleCount: 2,
    daysCount: 5,
    tags: ['Đà Nẵng & Huế', '5 Ngày', 'Di sản & Biển xanh'],
    createdAt: '2026-11-23',
    image: '/images/danang_hue_banner.jpg',
    itineraryOutline: buildDefaultMindtripItinerary('Đà Nẵng & Huế', 5) as unknown as DailyItineraryOutline[],
  },
  {
    id: 'sample-central-vietnam-7d',
    title: 'Khám phá Miền Trung Huyền Diệu (7 Ngày)',
    destination: 'Đà Nẵng & Huế',
    startDate: 'Ngày 20 – 26 tháng 12',
    peopleCount: 4,
    daysCount: 7,
    tags: ['Miền Trung', '7 Ngày', 'Tour gia đình'],
    createdAt: '2026-11-23',
    image: '/images/danang_hue_banner.jpg',
    itineraryOutline: buildDefaultMindtripItinerary('Đà Nẵng & Huế', 7) as unknown as DailyItineraryOutline[],
  },
];

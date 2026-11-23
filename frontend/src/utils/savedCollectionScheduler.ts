import { evaluateLocalAuthentic, type Poi } from '@/data/pois';
import {
  distanceKm,
  orderSegmentNearestAnd2Opt,
  stopFromPoi,
  timeFromMinutes,
  updateDateRangeWithDays,
  type ItineraryDay,
  type ItineraryStop,
  type TripItinerary,
} from '@/services/itineraryService';
import { getPoiVisitDurationMinutes } from '@/components/planner/tripItineraryUtils';

export type CollectionTripPacing = 'Relaxed' | 'Balanced' | 'Fast';

export interface OptionalMealGapSuggestion {
  suggestionId: string;
  dayNumber: number;
  slotType: 'lunch' | 'dinner';
  slotLabel: string;
  suggestedStartTime: string;
  suggestedEndTime: string;
  anchorStopTitle: string;
  distanceKm: number;
  poi: Poi;
  reason: string;
}

export interface BuildSavedCollectionPlanInput {
  tripId?: string;
  collectionName: string;
  savedPois: Poi[];
  allPois: Poi[];
  daysCount: number;
  startDate?: string | null;
  pacing?: CollectionTripPacing;
  includeRestBreaks?: boolean;
  preferLocalAuthentic?: boolean;
}

export interface BuildSavedCollectionPlanResult {
  itinerary: TripItinerary;
  scheduledSavedPois: Poi[];
  recommendedStays: Poi[];
  overflowPois: Poi[];
  optionalMealGapSuggestions: OptionalMealGapSuggestion[];
  destinationSummary: string;
}

const MAX_STOPS_PER_DAY: Record<CollectionTripPacing, number> = {
  Relaxed: 3,
  Balanced: 4,
  Fast: 6,
};

function isHuePoi(poi: Pick<Poi, 'city'>): boolean {
  return /huế|hue/i.test(poi.city || '');
}

function dedupePoisById(items: Poi[]): Poi[] {
  const seen = new Set<string>();
  const unique: Poi[] = [];
  for (const poi of items) {
    if (!seen.has(poi.id)) {
      seen.add(poi.id);
      unique.push(poi);
    }
  }
  return unique;
}

export function recommendDaysForSavedPois(savedPois: Poi[]): number {
  const unique = dedupePoisById(savedPois);
  const daytime = unique.filter((p) => p.category !== 'luu-tru');
  if (daytime.length === 0) return 1;
  const hasDanang = daytime.some((p) => !isHuePoi(p));
  const hasHue = daytime.some((p) => isHuePoi(p));
  const byCapacity = Math.max(1, Math.ceil(daytime.length / 4));
  if (hasDanang && hasHue) {
    return Math.max(2, byCapacity);
  }
  return Math.min(7, byCapacity);
}

function chainByNearestGeo(pois: Poi[]): Poi[] {
  if (pois.length <= 2) return [...pois];
  const remaining = [...pois].sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  const ordered: Poi[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const d =
        distanceKm(
          { latitude: last.lat, longitude: last.lng },
          { latitude: remaining[i].lat, longitude: remaining[i].lng }
        ) ?? 9999;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

function splitIntoBalancedBuckets(
  items: Poi[],
  daySlots: number,
  maxPerDay: number
): { buckets: Poi[][]; overflow: Poi[] } {
  const buckets: Poi[][] = Array.from({ length: daySlots }, () => []);
  if (daySlots <= 0 || items.length === 0) {
    return { buckets, overflow: [...items] };
  }

  const ordered = chainByNearestGeo(items);
  const totalCapacity = daySlots * maxPerDay;
  const fittable = ordered.slice(0, totalCapacity);
  const overflow = ordered.slice(totalCapacity);

  let cursor = 0;
  for (let d = 0; d < daySlots; d += 1) {
    const remainingDays = daySlots - d;
    const remainingItems = fittable.length - cursor;
    const takeCount = Math.min(maxPerDay, Math.ceil(remainingItems / remainingDays));
    if (takeCount > 0) {
      buckets[d] = fittable.slice(cursor, cursor + takeCount);
      cursor += takeCount;
    }
  }
  return { buckets, overflow };
}

function scheduleStopsForDay(
  dayNumber: number,
  tripId: string,
  dayPois: Poi[],
  poiById: Map<string, Poi>,
  includeRestBreaks: boolean
): { day: ItineraryDay; scheduledPois: Poi[] } {
  if (dayPois.length === 0) {
    return {
      day: {
        day_id: `${tripId}-day-${dayNumber}`,
        day_number: dayNumber,
        date: null,
        title: `Ngày ${dayNumber}`,
        note: '',
        stops: [],
      },
      scheduledPois: [],
    };
  }

  const rawStops = dayPois.map((poi) => stopFromPoi(poi, 'manual'));
  const orderedStops = orderSegmentNearestAnd2Opt(rawStops, poiById);

  let currentMin = 8 * 60 + 30;
  const timedStops: ItineraryStop[] = [];
  let insertedLunchRest = false;

  orderedStops.forEach((stop, index) => {
    const matched = stop.poi_id ? poiById.get(stop.poi_id) : undefined;
    const dur = Math.max(30, getPoiVisitDurationMinutes(matched));

    if (
      includeRestBreaks &&
      !insertedLunchRest &&
      index > 0 &&
      currentMin >= 11 * 60 + 45 &&
      currentMin <= 13 * 60 + 45
    ) {
      const restStart = Math.max(currentMin, 12 * 60);
      const restEnd = restStart + 75;
      timedStops.push({
        stop_id: `rest-${tripId}-d${dayNumber}`,
        poi_id: null,
        title: 'Nghỉ trưa & phục hồi sức khỏe',
        city: stop.city || null,
        address: null,
        category: null,
        stop_type: 'rest',
        source: 'assistant',
        sequence: timedStops.length,
        duration_minutes: 75,
        start_time: timeFromMinutes(restStart),
        end_time: timeFromMinutes(restEnd),
        comment: 'Khoảng nghỉ giữa ngày trước khi tiếp tục các điểm đã lưu.',
        latitude: null,
        longitude: null,
      });
      currentMin = restEnd + 15;
      insertedLunchRest = true;
    }

    const startMin = Math.min(currentMin, 21 * 60);
    const endMin = Math.min(startMin + dur, 22 * 60 + 30);
    timedStops.push({
      ...stop,
      sequence: timedStops.length,
      duration_minutes: Math.max(30, endMin - startMin),
      start_time: timeFromMinutes(startMin),
      end_time: timeFromMinutes(endMin),
      comment: stop.comment || 'Từ bộ sưu tập đã lưu của bạn',
    });
    currentMin = endMin + 15;
  });

  const firstCity = timedStops.find((s) => s.city)?.city || 'Đà Nẵng';
  const scheduledPois = orderedStops
    .map((s) => (s.poi_id ? poiById.get(s.poi_id) : undefined))
    .filter((p): p is Poi => Boolean(p));

  return {
    day: {
      day_id: `${tripId}-day-${dayNumber}`,
      day_number: dayNumber,
      date: null,
      title: `Ngày ${dayNumber} · ${firstCity}`,
      note: '',
      stops: timedStops,
    },
    scheduledPois,
  };
}

function buildMealSuggestionsForDay(
  day: ItineraryDay,
  allPois: Poi[],
  poiById: Map<string, Poi>,
  alreadyUsedIds: Set<string>,
  preferLocalAuthentic: boolean
): OptionalMealGapSuggestion[] {
  const visitStops = day.stops.filter((s) => s.stop_type !== 'rest');
  if (visitStops.length === 0) return [];

  const foodStops = visitStops.filter((s) => s.category === 'quan-an');
  const hasLunchStop = foodStops.some((s) => {
    const startH = Number((s.start_time || '12:00').split(':')[0]);
    return startH >= 11 && startH <= 14;
  });
  const hasDinnerStop = foodStops.some((s) => {
    const startH = Number((s.start_time || '12:00').split(':')[0]);
    return startH >= 17 && startH <= 21;
  });

  const suggestions: OptionalMealGapSuggestion[] = [];
  const dayCity = visitStops[0]?.city || 'Đà Nẵng';
  const isDayHue = /huế|hue/i.test(dayCity);

  const findNearestMeal = (
    anchor: ItineraryStop,
    slotType: 'lunch' | 'dinner',
    startTime: string,
    endTime: string
  ): OptionalMealGapSuggestion | null => {
    const anchorPoi = anchor.poi_id ? poiById.get(anchor.poi_id) : undefined;
    const anchorLat = anchor.latitude ?? anchorPoi?.lat;
    const anchorLng = anchor.longitude ?? anchorPoi?.lng;
    if (anchorLat == null || anchorLng == null) return null;

    const sameCityEateries = allPois.filter((cand) => {
      if (cand.category !== 'quan-an') return false;
      if (alreadyUsedIds.has(cand.id)) return false;
      if (isHuePoi(cand) !== isDayHue) return false;
      return Number.isFinite(cand.lat) && Number.isFinite(cand.lng);
    });

    const preferredPool = preferLocalAuthentic
      ? sameCityEateries.filter((c) => evaluateLocalAuthentic(c).isLocalAuthentic)
      : [];
    const pool = preferredPool.length > 0 ? preferredPool : sameCityEateries;

    const ranked = pool
      .map((cand) => {
        const dKm =
          distanceKm(
            { latitude: anchorLat, longitude: anchorLng },
            { latitude: cand.lat, longitude: cand.lng }
          ) ?? 99;
        return { cand, dKm };
      })
      .filter(({ dKm }) => dKm <= 3.0)
      .sort((a, b) => a.dKm - b.dKm || (b.cand.ecoScore || 0) - (a.cand.ecoScore || 0));

    if (ranked.length === 0) return null;
    const best = ranked[0];
    const auth = evaluateLocalAuthentic(best.cand);
    const roundedDist = Math.round(best.dKm * 10) / 10;
    const tag = auth.badgeLabel ? `${auth.badgeLabel} · ` : '';

    return {
      suggestionId: `gap-d${day.day_number}-${slotType}-${best.cand.id}`,
      dayNumber: day.day_number,
      slotType,
      slotLabel: slotType === 'lunch' ? 'Bữa trưa' : 'Bữa tối',
      suggestedStartTime: startTime,
      suggestedEndTime: endTime,
      anchorStopTitle: anchor.title,
      distanceKm: roundedDist,
      poi: best.cand,
      reason: `${tag}Cách ${anchor.title} ~${roundedDist.toFixed(1)} km`,
    };
  };

  if (!hasLunchStop && visitStops.length >= 2) {
    const anchor = visitStops[Math.min(1, visitStops.length - 1)];
    const lunch = findNearestMeal(anchor, 'lunch', '12:00', '13:00');
    if (lunch) {
      alreadyUsedIds.add(lunch.poi.id);
      suggestions.push(lunch);
    }
  }

  const lastStop = visitStops[visitStops.length - 1];
  const lastEndHour = Number((lastStop?.end_time || '15:00').split(':')[0]);
  if (!hasDinnerStop && (lastEndHour >= 16 || visitStops.length >= 3)) {
    const dinner = findNearestMeal(lastStop, 'dinner', '18:30', '19:45');
    if (dinner) {
      alreadyUsedIds.add(dinner.poi.id);
      suggestions.push(dinner);
    }
  }

  return suggestions;
}

export function buildItineraryFromSavedCollection(
  input: BuildSavedCollectionPlanInput
): BuildSavedCollectionPlanResult {
  const tripId = input.tripId || `trip-saved-${Date.now()}`;
  const daysCount = Math.max(1, Math.min(14, Math.round(input.daysCount || 1)));
  const pacing: CollectionTripPacing = input.pacing || 'Balanced';
  const includeRestBreaks = Boolean(input.includeRestBreaks);
  const preferLocalAuthentic = Boolean(input.preferLocalAuthentic);
  const maxPerDay = MAX_STOPS_PER_DAY[pacing];

  const uniqueSaved = dedupePoisById(input.savedPois);
  const recommendedStays = uniqueSaved.filter((p) => p.category === 'luu-tru');
  const daytimeSaved = uniqueSaved.filter((p) => p.category !== 'luu-tru');

  const poiById = new Map<string, Poi>();
  [...input.allPois, ...uniqueSaved].forEach((p) => poiById.set(p.id, p));

  const danangPois = daytimeSaved.filter((p) => !isHuePoi(p));
  const huePois = daytimeSaved.filter((p) => isHuePoi(p));

  const hasDanang =
    danangPois.length > 0 || recommendedStays.some((p) => !isHuePoi(p));
  const hasHue =
    huePois.length > 0 || recommendedStays.some((p) => isHuePoi(p));

  const destinationSummary =
    hasDanang && hasHue
      ? 'Đà Nẵng & Huế'
      : hasHue
        ? 'Huế'
        : 'Đà Nẵng';

  let cityBuckets: Poi[][] = [];
  let overflowPois: Poi[] = [];

  if (danangPois.length > 0 && huePois.length > 0) {
    if (daysCount === 1) {
      const primary = danangPois.length >= huePois.length ? danangPois : huePois;
      const secondary = danangPois.length >= huePois.length ? huePois : danangPois;
      const split = splitIntoBalancedBuckets(primary, 1, maxPerDay);
      cityBuckets = split.buckets;
      overflowPois = [...split.overflow, ...secondary];
    } else {
      const hueRatio = huePois.length / daytimeSaved.length;
      const hueDays = Math.max(
        1,
        Math.min(daysCount - 1, Math.round(daysCount * hueRatio))
      );
      const danangDays = Math.max(1, daysCount - hueDays);
      const dnSplit = splitIntoBalancedBuckets(danangPois, danangDays, maxPerDay);
      const hueSplit = splitIntoBalancedBuckets(huePois, hueDays, maxPerDay);
      cityBuckets = [...dnSplit.buckets, ...hueSplit.buckets];
      overflowPois = [...dnSplit.overflow, ...hueSplit.overflow];
    }
  } else {
    const singleSplit = splitIntoBalancedBuckets(daytimeSaved, daysCount, maxPerDay);
    cityBuckets = singleSplit.buckets;
    overflowPois = singleSplit.overflow;
  }

  const days: ItineraryDay[] = [];
  const scheduledSavedPois: Poi[] = [];
  const usedIdsForSuggestions = new Set(uniqueSaved.map((p) => p.id));
  const optionalMealGapSuggestions: OptionalMealGapSuggestion[] = [];

  for (let i = 0; i < daysCount; i += 1) {
    const bucket = cityBuckets[i] || [];
    const { day, scheduledPois } = scheduleStopsForDay(
      i + 1,
      tripId,
      bucket,
      poiById,
      includeRestBreaks
    );
    days.push(day);
    scheduledSavedPois.push(...scheduledPois);
    const daySuggestions = buildMealSuggestionsForDay(
      day,
      input.allPois,
      poiById,
      usedIdsForSuggestions,
      preferLocalAuthentic
    );
    optionalMealGapSuggestions.push(...daySuggestions);
  }

  const startDateRange = input.startDate
    ? updateDateRangeWithDays(input.startDate, daysCount)
    : '';

  const itinerary: TripItinerary = {
    trip_id: tripId,
    title: `Lịch trình từ ${input.collectionName}`,
    destination: destinationSummary,
    start_date: startDateRange || null,
    days_count: daysCount,
    days,
  };

  return {
    itinerary,
    scheduledSavedPois,
    recommendedStays,
    overflowPois,
    optionalMealGapSuggestions,
    destinationSummary,
  };
}

export function applyOptionalMealGapsToPlan(
  plan: TripItinerary,
  acceptedSuggestions: OptionalMealGapSuggestion[]
): TripItinerary {
  if (acceptedSuggestions.length === 0) return plan;

  const byDay = new Map<number, OptionalMealGapSuggestion[]>();
  acceptedSuggestions.forEach((sug) => {
    const list = byDay.get(sug.dayNumber) || [];
    list.push(sug);
    byDay.set(sug.dayNumber, list);
  });

  const nextDays = plan.days.map((day) => {
    const additions = byDay.get(day.day_number);
    if (!additions || additions.length === 0) return day;

    const nextStops = [...day.stops];
    additions.forEach((sug) => {
      if (nextStops.some((s) => s.poi_id === sug.poi.id)) return;
      const baseStop = stopFromPoi(sug.poi, 'assistant');
      nextStops.push({
        ...baseStop,
        start_time: sug.suggestedStartTime,
        end_time: sug.suggestedEndTime,
        duration_minutes: 60,
        comment: `Gợi ý lấp ${sug.slotLabel.toLowerCase()} · ${sug.reason}`,
      });
    });

    nextStops.sort((a, b) =>
      (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
    );

    return {
      ...day,
      stops: nextStops.map((s, idx) => ({ ...s, sequence: idx })),
    };
  });

  return {
    ...plan,
    days: nextDays,
  };
}

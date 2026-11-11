import { fetchJson } from '@/lib/api';
import type { Poi } from '@/data/pois';
import type { UserTrip } from '@/pages/ExplorePage';

export type ItineraryStopType = 'poi' | 'rest' | 'custom';

export interface ItineraryStop {
  stop_id: string;
  poi_id: string | null;
  title: string;
  city: string | null;
  address: string | null;
  category: string | null;
  stop_type: ItineraryStopType;
  source: 'idea' | 'manual' | 'assistant';
  sequence: number;
  duration_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  comment: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ItineraryDay {
  day_id: string;
  day_number: number;
  date: string | null;
  title: string;
  stops: ItineraryStop[];
}

export interface TripItinerary {
  trip_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  days_count: number;
  days: ItineraryDay[];
  updated_at?: string | null;
}

export function createEmptyItinerary(trip: UserTrip): TripItinerary {
  const count = Math.max(1, Math.min(31, trip.daysCount || 1));
  const start = trip.startDate && /^\d{4}-\d{2}-\d{2}$/.test(trip.startDate) ? trip.startDate : null;
  return {
    trip_id: trip.id,
    title: trip.title,
    destination: trip.destination,
    start_date: start,
    days_count: count,
    days: Array.from({ length: count }, (_, index) => {
      const date = start ? new Date(`${start}T12:00:00`) : null;
      if (date) date.setDate(date.getDate() + index);
      return {
        day_id: `${trip.id}-day-${index + 1}`,
        day_number: index + 1,
        date: date ? date.toISOString().slice(0, 10) : null,
        title: '',
        stops: [],
      };
    }),
  };
}

export function stopFromPoi(poi: Poi, source: 'idea' | 'manual' | 'assistant' = 'idea'): ItineraryStop {
  const isCustom = poi.id.startsWith('custom-');
  const durationText = poi.visitDuration || '';
  const durationRange = durationText.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/);
  const durationMatch = durationText.match(/\d+(?:\.\d+)?/);
  const amount = durationRange
    ? (Number(durationRange[1]) + Number(durationRange[2])) / 2
    : durationMatch ? Number(durationMatch[0]) : null;
  const unit = /phút/i.test(durationText) ? 1 : /giờ|hour/i.test(durationText) ? 60 : null;
  const duration = isCustom ? null : poi.average_visit_minutes ?? (amount !== null && unit ? Math.round(amount * unit) : null);
  return {
    stop_id: globalThis.crypto?.randomUUID?.() || `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    poi_id: isCustom ? null : poi.id,
    title: poi.name,
    city: poi.city || null,
    address: poi.address || null,
    category: isCustom ? 'Địa điểm tự thêm' : poi.category || null,
    stop_type: isCustom ? 'custom' : 'poi',
    source,
    sequence: 0,
    duration_minutes: duration,
    start_time: null,
    end_time: null,
    comment: null,
    latitude: isCustom ? null : Number.isFinite(poi.lat) ? poi.lat : null,
    longitude: isCustom ? null : Number.isFinite(poi.lng) ? poi.lng : null,
  };
}

export async function getTripItinerary(tripId: string): Promise<TripItinerary> {
  try {
    const remote = await fetchJson<TripItinerary>(`/trips/${encodeURIComponent(tripId)}/itinerary`);
    if (remote && remote.trip_id) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`greentrip_itinerary_${tripId}`, JSON.stringify(remote));
        }
      } catch (e) {
        console.warn('Failed to cache itinerary to localStorage', e);
      }
      return remote;
    }
  } catch (err) {
    const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(`greentrip_itinerary_${tripId}`) : null;
    if (localRaw) {
      try {
        return JSON.parse(localRaw) as TripItinerary;
      } catch (e) {
        console.warn('Failed to parse localStorage itinerary', e);
      }
    }
    throw err;
  }
  const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(`greentrip_itinerary_${tripId}`) : null;
  if (localRaw) {
    return JSON.parse(localRaw) as TripItinerary;
  }
  throw new Error(`Itinerary not found for trip ${tripId}`);
}

export async function saveTripItinerary(itinerary: TripItinerary): Promise<TripItinerary> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`greentrip_itinerary_${itinerary.trip_id}`, JSON.stringify(itinerary));
    }
  } catch (e) {
    console.warn('Failed to save itinerary to localStorage', e);
  }

  try {
    return await fetchJson<TripItinerary>(`/trips/${encodeURIComponent(itinerary.trip_id)}/itinerary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    });
  } catch (err) {
    console.warn('Backend saveTripItinerary failed, using local storage state', err);
    return {
      ...itinerary,
      updated_at: new Date().toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// THUẬT TOÁN TỐI ƯU HÀNH TRÌNH, PHÂN BỔ Ý TƯỞNG & NGHỈ TRƯA PB11
// ─────────────────────────────────────────────────────────────

export function minutesFor(stop: ItineraryStop): number {
  return stop.duration_minutes || 90;
}

export function pacingForTrip(trip: UserTrip): 'Relaxed' | 'Balanced' | 'Fast' {
  if (trip.pacingLevel === 'Relaxed' || trip.pacingLevel === 'Balanced' || trip.pacingLevel === 'Fast') return trip.pacingLevel;
  if (trip.pacingLabel?.includes('Thong thả')) return 'Relaxed';
  if (trip.pacingLabel?.includes('Dày đặc')) return 'Fast';
  return 'Balanced';
}

export function dailyVisitCapacity(level: 'Relaxed' | 'Balanced' | 'Fast'): number {
  if (level === 'Relaxed') return 210;
  if (level === 'Fast') return 330;
  return 270;
}

export function durationBetween(start: string, end: string): number | null {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function minutesFromTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function findRestSlot(day: ItineraryDay, timeRange: string, duration: number): { start: string; end: string } | null {
  const match = timeRange.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
  if (!match) return null;
  const windowStart = minutesFromTime(match[1]);
  const windowEnd = minutesFromTime(match[2]);
  for (let start = windowStart; start + duration <= windowEnd; start += 15) {
    const end = start + duration;
    const overlaps = day.stops.some((stop) => {
      if (!stop.start_time || !stop.end_time) return false;
      return start < minutesFromTime(stop.end_time) && minutesFromTime(stop.start_time) < end;
    });
    if (!overlaps) return { start: timeFromMinutes(start), end: timeFromMinutes(end) };
  }
  return null;
}

export function restExistsInPeriod(day: ItineraryDay, timeRange: string): boolean {
  const match = timeRange.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
  if (!match) return false;
  const start = minutesFromTime(match[1]);
  const end = minutesFromTime(match[2]);
  return day.stops.some((stop) => stop.stop_type === 'rest' && stop.start_time
    && minutesFromTime(stop.start_time) >= start && minutesFromTime(stop.start_time) < end);
}

export function insertRestInOrder(stops: ItineraryStop[], rest: ItineraryStop): void {
  const startMinute = rest.start_time ? minutesFromTime(rest.start_time) : 12 * 60;
  const laterTimedStop = stops.findIndex((stop) => stop.start_time && minutesFromTime(stop.start_time) >= startMinute);
  if (laterTimedStop >= 0) {
    stops.splice(laterTimedStop, 0, rest);
    return;
  }
  const targetVisitMinutes = startMinute < 11 * 60 ? 90 : 180;
  let accumulated = 0;
  let insertAt = 0;
  while (insertAt < stops.length && accumulated < targetVisitMinutes) {
    if (stops[insertAt].stop_type !== 'rest') accumulated += minutesFor(stops[insertAt]);
    insertAt += 1;
  }
  stops.splice(insertAt, 0, rest);
}

export function distanceKm(a: { latitude?: number | null; longitude?: number | null }, b: { latitude?: number | null; longitude?: number | null }): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const originLat = radians(a.latitude);
  const targetLat = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(originLat) * Math.cos(targetLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function normalizeSequence(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((day) => ({ ...day, stops: day.stops.map((stop, index) => ({ ...stop, sequence: index })) }));
}

export function alignItineraryToTrip(itinerary: TripItinerary, trip: UserTrip): { itinerary: TripItinerary; changed: boolean; warning: string } {
  const requestedDays = Math.max(1, Math.min(31, trip.daysCount || itinerary.days_count));
  const days = [...itinerary.days].sort((a, b) => a.day_number - b.day_number);
  let warning = '';
  let changed = itinerary.title !== trip.title || itinerary.destination !== trip.destination;

  if (requestedDays < days.length) {
    const overflowDays = days.slice(requestedDays);
    const overflowStops = overflowDays.reduce((total, day) => total + day.stops.length, 0);
    if (overflowStops > 0) {
      warning = `Chuyến đã rút còn ${requestedDays} ngày nhưng ${overflowStops} địa điểm vẫn nằm ở các ngày phía sau. Chuyển hoặc xóa các địa điểm đó; lịch giữ nguyên để tránh mất dữ liệu.`;
    } else {
      days.splice(requestedDays);
      changed = true;
    }
  } else if (requestedDays > days.length) {
    const startDate = itinerary.start_date ? new Date(`${itinerary.start_date}T12:00:00`) : null;
    for (let dayNumber = days.length + 1; dayNumber <= requestedDays; dayNumber += 1) {
      let date: string | null = null;
      if (startDate && !Number.isNaN(startDate.getTime())) {
        const nextDate = new Date(startDate);
        nextDate.setDate(nextDate.getDate() + dayNumber - 1);
        date = nextDate.toISOString().slice(0, 10);
      }
      days.push({
        day_id: `${itinerary.trip_id}-day-${dayNumber}`,
        day_number: dayNumber,
        date,
        title: '',
        stops: [],
      });
    }
    changed = true;
  }

  const alignedDays = normalizeSequence(days.map((day, index) => ({ ...day, day_number: index + 1 })));
  const nextItinerary: TripItinerary = {
    ...itinerary,
    title: trip.title,
    destination: trip.destination,
    days_count: alignedDays.length,
    days: alignedDays,
  };
  changed ||= nextItinerary.days_count !== itinerary.days_count;
  return { itinerary: nextItinerary, changed, warning };
}

export function normalizeLegacyLunchBreaks(itinerary: TripItinerary): { itinerary: TripItinerary; changed: boolean } {
  let changed = false;
  const days = itinerary.days.map((day) => {
    const restIndex = day.stops.findIndex((stop) => stop.stop_type === 'rest' && stop.source === 'assistant');
    if (restIndex < 0) return day;

    const rest = day.stops[restIndex];
    if (rest.start_time && rest.end_time) return day;

    changed = true;
    const places = day.stops.filter((stop) => stop.stop_id !== rest.stop_id);
    const lunchBreak: ItineraryStop = {
      ...rest,
      title: 'Nghỉ trưa & phục hồi',
      duration_minutes: 90,
      start_time: rest.start_time || '12:00',
      end_time: rest.end_time || '13:30',
    };

    let morningMinutes = 0;
    let insertAt = 0;
    while (insertAt < places.length) {
      const nextDuration = minutesFor(places[insertAt]);
      if (insertAt > 0 && morningMinutes + nextDuration > 180) break;
      morningMinutes += nextDuration;
      insertAt += 1;
    }
    places.splice(insertAt, 0, lunchBreak);
    return { ...day, stops: places };
  });

  return { itinerary: { ...itinerary, days: normalizeSequence(days) }, changed };
}

export function reorderNearStops(stops: ItineraryStop[]): ItineraryStop[] {
  const places = stops.filter((stop) => stop.stop_type !== 'rest');
  if (places.length < 3 || places.some((stop) => stop.latitude == null || stop.longitude == null)) return places;
  const remaining = places.slice(1);
  const ordered = [places[0]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const distance = distanceKm(current, candidate) ?? Number.POSITIVE_INFINITY;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    ordered.push(remaining.splice(closestIndex, 1)[0]);
  }
  return ordered;
}

export function optimizeDays(
  days: ItineraryDay[],
  ideas: Poi[],
  dailyCapacity: number,
  outlines: Array<{ day: number; focus_city?: string; rest_periods?: Array<{ time_range: string; activity: string; duration_minutes: number }> }> = []
): { days: ItineraryDay[]; assignedCount: number; unassignedCount: number; restCount: number } {
  const next = days.map((day) => ({ ...day, stops: [...day.stops] }));
  const placed = new Set(next.flatMap((day) => day.stops.map((stop) => stop.poi_id).filter((id): id is string => Boolean(id))));
  const placedCustomNames = new Set(next.flatMap((day) => day.stops
    .filter((stop) => stop.stop_type === 'custom')
    .map((stop) => stop.title.trim().toLocaleLowerCase('vi-VN'))));
  const pending = ideas.filter((poi) => !placed.has(poi.id) && !(poi.id.startsWith('custom-') && placedCustomNames.has(poi.name.trim().toLocaleLowerCase('vi-VN'))));
  let assignedCount = 0;
  let unassignedCount = 0;

  pending.forEach((poi) => {
    const candidate = stopFromPoi(poi, 'assistant');
    const duration = minutesFor(candidate);
    const eligible = next
      .map((day, index) => ({ day, index, stops: day.stops.filter((stop) => stop.stop_type !== 'rest') }))
      .filter(({ stops }) => stops.reduce((total, stop) => total + minutesFor(stop), 0) + duration <= dailyCapacity);
    if (!eligible.length) {
      unassignedCount += 1;
      return;
    }
    eligible.sort((a, b) => {
      const cityPenalty = (stops: ItineraryStop[]) => stops.length && !stops.some((stop) => stop.city === candidate.city) ? 120 : 0;
      const proximityPenalty = (stops: ItineraryStop[]) => {
        const last = [...stops].reverse().find((stop) => stop.latitude != null && stop.longitude != null);
        return last ? (distanceKm(last, candidate) ?? 0) * 8 : 0;
      };
      const load = (stops: ItineraryStop[]) => stops.reduce((total, stop) => total + minutesFor(stop), 0);
      return load(a.stops) + cityPenalty(a.stops) + proximityPenalty(a.stops) - load(b.stops) - cityPenalty(b.stops) - proximityPenalty(b.stops);
    });
    const selected = eligible[0].day;
    selected.stops.push(candidate);
    assignedCount += 1;
  });

  let restCount = 0;
  const scheduled = next.map((day) => {
    const orderedPlaces = reorderNearStops(day.stops);
    const ordered = [...orderedPlaces];
    const existingRests = day.stops.filter((stop) => stop.stop_type === 'rest');
    existingRests.forEach((rest) => insertRestInOrder(ordered, rest));
    const totalMinutes = orderedPlaces.reduce((total, stop) => total + minutesFor(stop), 0);
    const outline = outlines.find((item) => item.day === day.day_number);
    const periods = outline?.rest_periods?.length ? outline.rest_periods : [{
      time_range: '12:00–14:00',
      activity: 'Ăn trưa chậm rãi và nghỉ tại nơi lưu trú hoặc quán cà phê yên tĩnh.',
      duration_minutes: 90,
    }];
    const shouldSuggestRest = orderedPlaces.length >= 2;

    periods.forEach((period) => {
      const rangeStart = period.time_range.match(/(\d{2}:\d{2})/)?.[1];
      if (!shouldSuggestRest || !rangeStart) return;
      const isShortBreak = minutesFromTime(rangeStart) < 11 * 60 && period.duration_minutes <= 60;
      if (isShortBreak ? totalMinutes < 120 : totalMinutes < 210) return;
      const range = period.time_range.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
      if (!range) return;
      const inSameWindow = existingRests.some((stop) => stop.start_time && minutesFromTime(stop.start_time) >= minutesFromTime(range[1]) && minutesFromTime(stop.start_time) < minutesFromTime(range[2]));
      if (inSameWindow) return;
      const slot = findRestSlot({ ...day, stops: [...ordered, ...existingRests] }, period.time_range, period.duration_minutes);
      if (!slot) return;

      const rest: ItineraryStop = {
        stop_id: isShortBreak ? `assistant-rest-${day.day_id}-morning` : `rest-${day.day_id}`,
        poi_id: null,
        title: isShortBreak ? 'Nghỉ ngắn & uống nước' : 'Nghỉ trưa & phục hồi',
        city: outline?.focus_city || ordered[0]?.city || null,
        address: null,
        category: null,
        stop_type: 'rest',
        source: 'assistant',
        sequence: 0,
        duration_minutes: period.duration_minutes,
        start_time: slot.start,
        end_time: slot.end,
        comment: period.activity,
        latitude: null,
        longitude: null,
      };
      insertRestInOrder(ordered, rest);
      existingRests.push(rest);
      restCount += 1;
    });
    return { ...day, stops: ordered };
  });
  return { days: normalizeSequence(scheduled), assignedCount, unassignedCount, restCount };
}

/**
 * Tự động phân tích ngày bắt đầu từ chuỗi ngày của UserTrip
 * Hỗ trợ các định dạng: "1 - 5 thg 11", "Ngày 1 – 5 tháng 11", "14 – 18 thg 11, 2026", "Từ 16 thg 11", ISO date "2026-11-14"
 */
export function parseStartDateFromTrip(startDateStr?: string | null): { day: number; month: number; year: number } {
  const defaultYear = 2026;
  if (!startDateStr || !startDateStr.trim()) {
    return { day: 1, month: 11, year: defaultYear };
  }

  const raw = startDateStr.trim();

  // 1. Dạng ISO: "2026-11-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return { day: d || 1, month: m || 11, year: y || defaultYear };
  }

  // 2. Dạng khoảng ngày: "Ngày 1 – 5 tháng 11", "1 - 5 thg 11", "14 – 17 thg 11, 2026"
  const rangeMatch = raw.match(/(?:Ngày\s*)?(\d+)\s*[–-]\s*\d+\s+(?:thg|tháng)\s+(\d+)(?:,?\s*(\d{4}))?/i);
  if (rangeMatch) {
    return {
      day: parseInt(rangeMatch[1], 10),
      month: parseInt(rangeMatch[2], 10),
      year: rangeMatch[3] ? parseInt(rangeMatch[3], 10) : defaultYear,
    };
  }

  // 3. Dạng "Từ 16 thg 11"
  const fromMatch = raw.match(/Từ\s+(\d+)\s+(?:thg|tháng)\s+(\d+)(?:,?\s*(\d{4}))?/i);
  if (fromMatch) {
    return {
      day: parseInt(fromMatch[1], 10),
      month: parseInt(fromMatch[2], 10),
      year: fromMatch[3] ? parseInt(fromMatch[3], 10) : defaultYear,
    };
  }

  // 4. Số đầu tiên trước thg/tháng
  const simpleMatch = raw.match(/(\d+)\s*(?:thg|tháng)\s*(\d+)/i);
  if (simpleMatch) {
    return {
      day: parseInt(simpleMatch[1], 10),
      month: parseInt(simpleMatch[2], 10),
      year: defaultYear,
    };
  }

  return { day: 1, month: 11, year: defaultYear };
}

/**
 * Tự động cập nhật chuỗi ngày khi số lượng ngày của chuyến đi thay đổi (ví dụ: du lịch từ 1-5, thêm 1 ngày thành 1-6)
 */
export function updateDateRangeWithDays(currentDateStr?: string | null, newDaysCount: number = 1): string {
  const safeDays = Math.max(1, newDaysCount);
  if (!currentDateStr || !currentDateStr.trim()) {
    return `Ngày 1 – ${safeDays} tháng 11`;
  }

  let raw = currentDateStr.trim();
  const hadParenthesisDays = /\(\d+\s*ngày\)/i.test(raw);
  if (hadParenthesisDays) {
    raw = raw.replace(/\s*\(\d+\s*ngày\)/gi, '').trim();
  }

  // 1. Dạng: "Ngày 1 – 5 tháng 11" hoặc "Ngày 1 - 5 tháng 11, 2026"
  const ngayPattern = /^Ngày\s+(\d+)\s*[–-]\s*(\d+)\s+tháng\s+(\d+)(.*)$/i;
  const matchNgay = raw.match(ngayPattern);
  if (matchNgay) {
    const startDay = parseInt(matchNgay[1], 10);
    const month = matchNgay[3];
    const tail = matchNgay[4] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `Ngày ${startDay} – ${newEndDay} tháng ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  // 2. Dạng: "1 - 5 thg 11" hoặc "1 – 5 thg 11" hoặc "14 – 17 thg 11, 2026"
  const dashPattern = /^(\d+)\s*[–-]\s*(\d+)\s+(thg|tháng)\s+(\d+)(.*)$/i;
  const matchDash = raw.match(dashPattern);
  if (matchDash) {
    const startDay = parseInt(matchDash[1], 10);
    const unit = matchDash[3];
    const month = matchDash[4];
    const tail = matchDash[5] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `${startDay} – ${newEndDay} ${unit} ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  // 3. Dạng: "Từ 16 thg 11" hoặc "Từ 2 thg 11"
  const tuPattern = /^Từ\s+(\d+)\s+(thg|tháng)\s+(\d+)(.*)$/i;
  const matchTu = raw.match(tuPattern);
  if (matchTu) {
    const startDay = parseInt(matchTu[1], 10);
    const unit = matchTu[2];
    const month = matchTu[3];
    const tail = matchTu[4] || '';
    const newEndDay = startDay + safeDays - 1;
    const res = `${startDay} – ${newEndDay} ${unit} ${month}${tail}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  // 4. Dạng: "4 ngày • Tháng 11" hoặc "4 ngày • Tháng 11, 2026"
  const flexPattern = /^(\d+)\s*ngày\s*•\s*(.*)$/i;
  const matchFlex = raw.match(flexPattern);
  if (matchFlex) {
    const rest = matchFlex[2];
    return `${safeDays} ngày • ${rest}`;
  }

  // 5. ISO Date string: "2026-11-14"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const newEndDay = d + safeDays - 1;
    const res = `Ngày ${d} – ${newEndDay} tháng ${m}`;
    return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
  }

  const res = `${safeDays} ngày • ${raw}`;
  return hadParenthesisDays ? `${res} (${safeDays} ngày)` : res;
}

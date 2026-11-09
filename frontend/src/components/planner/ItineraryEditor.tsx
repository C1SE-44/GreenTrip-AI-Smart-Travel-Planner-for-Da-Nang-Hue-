import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Clock3, Coffee, GripVertical, Lightbulb, MapPin, MessageSquare, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import type { Poi } from '@/data/pois';
import type { UserTrip } from '@/pages/ExplorePage';
import type { DailyItineraryOutline, RestPeriod } from '@/services/tripService';
import { createEmptyItinerary, getTripItinerary, saveTripItinerary, stopFromPoi, type ItineraryDay, type ItineraryStop, type TripItinerary } from '@/services/itineraryService';

interface ItineraryEditorProps {
  trip: UserTrip;
  ideas: Poi[];
  onClose: () => void;
  onAddIdea: () => void;
}

function minutesFor(stop: ItineraryStop): number {
  return stop.duration_minutes || 90;
}

function pacingForTrip(trip: UserTrip): 'Relaxed' | 'Balanced' | 'Fast' {
  if (trip.pacingLevel === 'Relaxed' || trip.pacingLevel === 'Balanced' || trip.pacingLevel === 'Fast') return trip.pacingLevel;
  if (trip.pacingLabel?.includes('Thong thả')) return 'Relaxed';
  if (trip.pacingLabel?.includes('Dày đặc')) return 'Fast';
  return 'Balanced';
}

function dailyVisitCapacity(level: 'Relaxed' | 'Balanced' | 'Fast'): number {
  if (level === 'Relaxed') return 210;
  if (level === 'Fast') return 330;
  return 270;
}

function durationBetween(start: string, end: string): number | null {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function minutesFromTime(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function findRestSlot(day: ItineraryDay, timeRange: string, duration: number): { start: string; end: string } | null {
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

function restExistsInPeriod(day: ItineraryDay, timeRange: string): boolean {
  const match = timeRange.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
  if (!match) return false;
  const start = minutesFromTime(match[1]);
  const end = minutesFromTime(match[2]);
  return day.stops.some((stop) => stop.stop_type === 'rest' && stop.start_time
    && minutesFromTime(stop.start_time) >= start && minutesFromTime(stop.start_time) < end);
}

function insertRestInOrder(stops: ItineraryStop[], rest: ItineraryStop): void {
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

function distanceKm(a: ItineraryStop, b: ItineraryStop): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const originLat = radians(a.latitude);
  const targetLat = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(originLat) * Math.cos(targetLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizeSequence(days: ItineraryDay[]): ItineraryDay[] {
  return days.map((day) => ({ ...day, stops: day.stops.map((stop, index) => ({ ...stop, sequence: index })) }));
}

function alignItineraryToTrip(itinerary: TripItinerary, trip: UserTrip): { itinerary: TripItinerary; changed: boolean; warning: string } {
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

function normalizeLegacyLunchBreaks(itinerary: TripItinerary): { itinerary: TripItinerary; changed: boolean } {
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

function reorderNearStops(stops: ItineraryStop[]): ItineraryStop[] {
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

function optimizeDays(days: ItineraryDay[], ideas: Poi[], dailyCapacity: number, outlines: DailyItineraryOutline[] = []): { days: ItineraryDay[]; assignedCount: number; unassignedCount: number; restCount: number } {
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
    const periods: RestPeriod[] = outline?.rest_periods?.length ? outline.rest_periods : [{
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

function displayDate(date: string | null): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function saveErrorMessage(error: unknown, action: 'save' | 'load'): string {
  const apiError = error as { status?: number; detail?: string; message?: string };
  const status = apiError?.status;
  if (status === 401) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Đăng nhập lại rồi thử lưu.';
  if (status === 403) return 'Tài khoản hiện tại không có quyền sửa lịch trình này.';
  if (status === 422) return apiError.detail || 'Khung giờ hoặc thứ tự hoạt động chưa hợp lệ. Kiểm tra để tránh trùng lịch trong cùng ngày.';
  if (status === 503) return 'Máy chủ chưa lưu được lịch trình vào cơ sở dữ liệu (503). Thử lại sau.';
  return action === 'save'
    ? 'Không kết nối được máy chủ để lưu lịch. Thay đổi vẫn đang hiển thị trong phiên này; thử lại khi kết nối ổn định.'
    : 'Không tải được lịch trình từ máy chủ. Kiểm tra kết nối rồi thử lại.';
}

export default function ItineraryEditor({ trip, ideas, onClose, onAddIdea }: ItineraryEditorProps) {
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState('');
  const [errorAction, setErrorAction] = useState<'save' | 'load' | null>(null);
  const [scheduleWarning, setScheduleWarning] = useState('');
  const [insight, setInsight] = useState('');
  const [addingToDay, setAddingToDay] = useState<string | null>(null);
  const [dragData, setDragData] = useState<{ stopId?: string; ideaId?: string; dayId?: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const latestPlan = useRef(plan);
  const currentTrip = useRef(trip);
  currentTrip.current = trip;
  const ideaIdsInPlan = useMemo(() => new Set(plan.days.flatMap((day) => day.stops.map((stop) => stop.poi_id).filter((id): id is string => Boolean(id)))), [plan.days]);
  const customIdeaNamesInPlan = useMemo(() => new Set(plan.days.flatMap((day) => day.stops
    .filter((stop) => stop.stop_type === 'custom')
    .map((stop) => stop.title.trim().toLocaleLowerCase('vi-VN')))), [plan.days]);
  const isIdeaInPlan = (poi: Poi) => ideaIdsInPlan.has(poi.id) || (poi.id.startsWith('custom-') && customIdeaNamesInPlan.has(poi.name.trim().toLocaleLowerCase('vi-VN')));
  const unplannedIdeas = ideas.filter((poi) => !isIdeaInPlan(poi));
  const pacingLevel = pacingForTrip(trip);
  const maxDailyMinutes = dailyVisitCapacity(pacingLevel);

  const persist = useCallback((nextPlan: TripItinerary) => {
    const version = ++saveVersion.current;
    latestPlan.current = nextPlan;
    setPlan(nextPlan);
    setHasUnsavedChanges(true);
    setError('');
    setErrorAction(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setIsSaving(true);
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const saved = await saveTripItinerary(nextPlan);
          if (version === saveVersion.current) {
            const updated = { ...nextPlan, updated_at: saved.updated_at };
            latestPlan.current = updated;
            setPlan(updated);
            setHasUnsavedChanges(false);
            setError('');
            setErrorAction(null);
          }
        } catch (cause) {
          if (version === saveVersion.current) {
            setError(saveErrorMessage(cause, 'save'));
            setErrorAction('save');
          }
        } finally {
          if (version === saveVersion.current) setIsSaving(false);
        }
      });
    }, 350);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    setErrorAction(null);
    setScheduleWarning('');
    try {
      const saved = await getTripItinerary(trip.id);
      const normalized = normalizeLegacyLunchBreaks(saved);
      const aligned = alignItineraryToTrip(normalized.itinerary, currentTrip.current);
      latestPlan.current = aligned.itinerary;
      setPlan(aligned.itinerary);
      setScheduleWarning(aligned.warning);
      if (normalized.changed || aligned.changed) {
        try {
          const updated = await saveTripItinerary(aligned.itinerary);
          const savedPlan = { ...aligned.itinerary, updated_at: updated.updated_at };
          latestPlan.current = savedPlan;
          setPlan(savedPlan);
        } catch (cause) {
          setError(saveErrorMessage(cause, 'save'));
          setErrorAction('save');
          setHasUnsavedChanges(true);
        }
      }
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      if (status === 404) {
        const fresh = createEmptyItinerary(currentTrip.current);
        latestPlan.current = fresh;
        setPlan(fresh);
        const aligned = alignItineraryToTrip(fresh, currentTrip.current);
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
        setScheduleWarning(aligned.warning);
        try {
          const saved = await saveTripItinerary(aligned.itinerary);
          const savedPlan = { ...aligned.itinerary, updated_at: saved.updated_at };
          latestPlan.current = savedPlan;
          setPlan(savedPlan);
        } catch (cause) {
          setError(saveErrorMessage(cause, 'save'));
          setErrorAction('save');
          setHasUnsavedChanges(true);
        }
      } else {
        setError(saveErrorMessage(cause, 'load'));
        setErrorAction('load');
      }
    } finally {
      setIsLoading(false);
    }
  }, [trip.id]);

  useEffect(() => {
    void load();
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [load]);

  useEffect(() => {
    if (isLoading || !latestPlan.current.trip_id) return;
    const aligned = alignItineraryToTrip(latestPlan.current, currentTrip.current);
    setScheduleWarning(aligned.warning);
    if (aligned.changed) persist(aligned.itinerary);
  }, [trip.daysCount, trip.destination, trip.title, isLoading, persist]);

  const mutateDays = (mutator: (days: ItineraryDay[]) => ItineraryDay[]) => {
    const aligned = alignItineraryToTrip({ ...plan, days: normalizeSequence(mutator(plan.days)) }, trip);
    setScheduleWarning(aligned.warning);
    persist(aligned.itinerary);
  };

  const addIdea = (dayId: string, idea: Poi) => {
    mutateDays((days) => days.map((day) => day.day_id === dayId
      ? { ...day, stops: [...day.stops, stopFromPoi(idea)] }
      : day));
    setAddingToDay(null);
  };

  const addSuggestedRest = (day: ItineraryDay, period: { time_range: string; duration_minutes: number }) => {
    if (restExistsInPeriod(day, period.time_range)) {
      setError('Khoảng nghỉ này đã có trong lịch.');
      setErrorAction(null);
      return;
    }
    const slot = findRestSlot(day, period.time_range, period.duration_minutes);
    if (!slot) {
      setError(`Không còn khung ${period.duration_minutes} phút phù hợp trong khoảng ${period.time_range}. Hãy đổi giờ một hoạt động hoặc tự thêm giờ nghỉ.`);
      setErrorAction(null);
      return;
    }
    const rest: ItineraryStop = {
      stop_id: globalThis.crypto?.randomUUID?.() || `rest-${day.day_id}-${Date.now()}`,
      poi_id: null,
      title: 'Nghỉ trưa & phục hồi',
      city: trip.itineraryOutline?.find((outline) => outline.day === day.day_number)?.focus_city || null,
      address: null,
      category: null,
      stop_type: 'rest',
      source: 'assistant',
      sequence: 0,
      duration_minutes: period.duration_minutes,
      start_time: slot.start,
      end_time: slot.end,
      comment: null,
      latitude: null,
      longitude: null,
    };
    mutateDays((days) => days.map((item) => {
      if (item.day_id !== day.day_id) return item;
      const insertAt = item.stops.findIndex((stop) => stop.start_time && minutesFromTime(stop.start_time) >= minutesFromTime(slot.start));
      const stops = [...item.stops];
      stops.splice(insertAt < 0 ? stops.length : insertAt, 0, rest);
      return { ...item, stops };
    }));
  };

  const moveStop = (stopId: string, fromDayId: string, toDayId: string, beforeStopId?: string) => {
    if (fromDayId === toDayId && beforeStopId === stopId) return;
    mutateDays((days) => {
      let moved: ItineraryStop | undefined;
      const removed = days.map((day) => ({
        ...day,
        stops: day.stops.filter((stop) => {
          if (stop.stop_id === stopId && day.day_id === fromDayId) { moved = stop; return false; }
          return true;
        }),
      }));
      if (!moved) return days;
      return removed.map((day) => {
        if (day.day_id !== toDayId) return day;
        const stops = [...day.stops];
        const index = beforeStopId ? stops.findIndex((stop) => stop.stop_id === beforeStopId) : -1;
        stops.splice(index < 0 ? stops.length : index, 0, moved!);
        return { ...day, stops };
      });
    });
    setDragData(null);
  };

  const optimize = () => {
    const result = optimizeDays(plan.days, ideas, maxDailyMinutes, trip.itineraryOutline);
    persist({ ...plan, days: result.days });
    const capacityExplanation = `GreenTrip giới hạn khoảng ${(maxDailyMinutes / 60).toLocaleString('vi-VN')} giờ tham quan/ngày theo nhịp ${pacingLevel}, ưu tiên cùng thành phố và các điểm gần nhau theo tọa độ đường chim bay. Chưa tính thời gian di chuyển thực tế.`;
    if (result.assignedCount || result.restCount) {
      const added = [result.assignedCount ? `${result.assignedCount} địa điểm` : '', result.restCount ? `${result.restCount} khoảng nghỉ` : ''].filter(Boolean).join(' và ');
      setInsight(`Đã bổ sung ${added} theo gợi ý.${result.unassignedCount ? ` Còn ${result.unassignedCount} địa điểm chưa xếp vì các ngày đã chạm giới hạn thời gian; bạn có thể chuyển bớt điểm hoặc tăng số ngày.` : ''} ${capacityExplanation}`);
    } else if (result.unassignedCount) {
      setInsight(`Còn ${result.unassignedCount} địa điểm chưa xếp vì các ngày đã chạm giới hạn thời gian. Hãy chuyển bớt điểm, giảm thời lượng hoặc tăng số ngày. ${capacityExplanation}`);
    } else {
      setInsight(`Các ý tưởng đều đã có trong lịch; không cần thêm điểm hay khoảng nghỉ mới. ${capacityExplanation}`);
    }
  };

  const updateStop = (dayId: string, stopId: string, patch: Partial<ItineraryStop>) => {
    mutateDays((days) => days.map((day) => day.day_id === dayId
      ? { ...day, stops: day.stops.map((stop) => stop.stop_id === stopId ? { ...stop, ...patch } : stop) }
      : day));
  };

  const removeStop = (dayId: string, stopId: string) => {
    mutateDays((days) => days.map((day) => day.day_id === dayId
      ? { ...day, stops: day.stops.filter((stop) => stop.stop_id !== stopId) }
      : day));
  };

  const retrySave = () => {
    persist(latestPlan.current);
  };

  const updateRestTime = (dayId: string, stop: ItineraryStop, field: 'start_time' | 'end_time', value: string) => {
    const start = field === 'start_time' ? value : stop.start_time || '12:00';
    const end = field === 'end_time' ? value : stop.end_time || '13:30';
    const duration = durationBetween(start, end);
    if (!duration) {
      setError('Giờ kết thúc khoảng nghỉ phải sau giờ bắt đầu.');
      setErrorAction(null);
      return;
    }
    setError('');
    setErrorAction(null);
    updateStop(dayId, stop.stop_id, { [field]: value, duration_minutes: duration });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" aria-label="Trình chỉnh sửa lịch trình">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-lg font-bold text-gray-950">Lịch trình</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-700">{plan.days_count} ngày · {trip.destination}</p>
            {trip.pacingLabel && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-950">Nhịp độ · {trip.pacingLabel}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600" aria-live="polite">{isSaving ? 'Đang lưu…' : hasUnsavedChanges ? 'Chưa lưu' : plan.updated_at ? 'Đã lưu' : ''}</span>
          <button type="button" onClick={onClose} aria-label="Đóng lịch trình" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><X size={18} /></button>
        </div>
      </div>

      {error && <div role="alert" className="mx-5 mt-4 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950"><span>{error}</span>{errorAction && <button type="button" onClick={errorAction === 'save' ? retrySave : () => void load()} className="flex min-h-10 shrink-0 items-center gap-1.5 font-semibold"><RefreshCw size={15} />Thử lại</button>}</div>}
      {scheduleWarning && <div role="status" className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">{scheduleWarning}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-gray-100 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-bold text-gray-950"><Lightbulb size={16} className="text-amber-600" />Ý tưởng <span className="font-normal text-gray-600">{ideas.length} địa điểm</span></h4>
              <p className="mt-1 text-xs text-gray-600">Kéo địa điểm vào ngày muốn đi, hoặc chọn “Thêm vào ngày”.</p>
            </div>
            <button type="button" onClick={onAddIdea} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-gray-300 px-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Plus size={15} />Thêm địa điểm</button>
          </div>
          {ideas.length ? (
            <div className="flex gap-3 overflow-x-auto pb-1" aria-label="Địa điểm từ ý tưởng">
              {ideas.map((poi) => (
                <article key={poi.id} draggable={!isIdeaInPlan(poi)} onDragStart={(event) => { setDragData({ ideaId: poi.id }); event.dataTransfer.setData('text/plain', poi.id); }} className={`w-48 shrink-0 rounded-xl border border-gray-200 p-2.5 ${isIdeaInPlan(poi) ? 'opacity-60' : 'bg-white'}`}>
                  <div className="flex items-start gap-2"><MapPin size={15} className="mt-0.5 shrink-0 text-emerald-800" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-950" title={poi.name}>{poi.name}</p><p className="mt-0.5 text-xs text-gray-600">{poi.city} · {poi.visitDuration || 'Chưa có thời lượng'}</p></div></div>
                  {isIdeaInPlan(poi) ? <p className="mt-2 text-xs font-medium text-gray-600">Đã xếp lịch</p> : <button type="button" onClick={() => setAddingToDay(addingToDay ? null : `pick:${poi.id}`)} className="mt-2 flex min-h-10 w-full items-center justify-center gap-1 rounded-lg bg-gray-100 text-xs font-semibold text-gray-900 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Plus size={13} />Thêm vào ngày</button>}
                  {addingToDay === `pick:${poi.id}` && <div className="mt-1 space-y-1">{plan.days.map((day) => <button key={day.day_id} type="button" onClick={() => addIdea(day.day_id, poi)} className="block min-h-10 w-full rounded-lg px-2 text-left text-xs text-gray-800 hover:bg-emerald-50">Ngày {day.day_number}{displayDate(day.date) ? ` · ${displayDate(day.date)}` : ''}</button>)}</div>}
                </article>
              ))}
            </div>
          ) : <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center"><p className="text-sm text-gray-700">Chưa có địa điểm trong Ý tưởng.</p><button type="button" onClick={onAddIdea} className="mt-2 min-h-10 px-3 text-sm font-semibold text-emerald-900">Thêm hoặc tìm địa điểm</button></div>}
        </section>

        <section className="px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-gray-950">Lịch theo ngày <span className="font-normal text-gray-600">{plan.days.length} ngày</span></h4>
            <button type="button" onClick={optimize} disabled={isLoading || !ideas.length || Boolean(scheduleWarning)} className="flex min-h-10 items-center gap-2 rounded-full bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Sparkles size={15} />Tối ưu lịch</button>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-gray-700">GreenTrip xếp theo thành phố, tọa độ và thời lượng địa điểm; nhịp {pacingLevel} giới hạn khoảng {(maxDailyMinutes / 60).toLocaleString('vi-VN')} giờ tham quan/ngày. Địa điểm chưa có thời lượng được ước tính 90 phút; chưa tính tuyến đường hay giao thông thực tế.</p>
          {insight && <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-950" aria-live="polite"><span className="font-semibold">Vì sao gợi ý này?</span> {insight}</div>}

          {isLoading ? <div className="space-y-3" aria-label="Đang tải lịch trình"><div className="h-20 animate-pulse rounded-xl bg-gray-100" /><div className="h-28 animate-pulse rounded-xl bg-gray-100" /></div> : plan.days.map((day) => {
            const dayOutline = trip.itineraryOutline?.find((outline) => outline.day === day.day_number);
            const visitStops = day.stops.filter((stop) => stop.stop_type !== 'rest');
            const dailyLoad = visitStops.reduce((total, stop) => total + minutesFor(stop), 0);
            const estimatedDurationCount = visitStops.filter((stop) => !stop.duration_minutes).length;
            return (
            <section key={day.day_id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
              event.preventDefault();
              const idea = dragData?.ideaId && ideas.find((item) => item.id === dragData.ideaId);
              if (idea) addIdea(day.day_id, idea);
              else if (dragData?.stopId && dragData.dayId) moveStop(dragData.stopId, dragData.dayId, day.day_id);
            }} className="mb-4 rounded-2xl border border-gray-200 bg-white">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><CalendarDays size={16} className="text-gray-700" /><h5 className="text-sm font-bold text-gray-950">Ngày {day.day_number}</h5>{displayDate(day.date) && <span className="text-xs text-gray-700">{displayDate(day.date)}</span>}</div>
                  {dayOutline && <p className="mt-1 pl-6 text-sm font-medium leading-relaxed text-gray-800">{dayOutline.theme}<span className="text-gray-600"> · {dayOutline.focus_city}</span></p>}
                </div>
                <button type="button" aria-expanded={addingToDay === day.day_id} disabled={Boolean(scheduleWarning) && day.day_number > (trip.daysCount || plan.days_count)} onClick={() => setAddingToDay(addingToDay === day.day_id ? null : day.day_id)} className="flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Plus size={15} />Thêm</button>
              </header>
              {dayOutline && (dayOutline.assistant_tip || dayOutline.rest_periods?.length) ? (
                <aside className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-950"><Sparkles size={14} aria-hidden="true" />Trợ lý GreenTrip gợi ý</p>
                  {dayOutline.assistant_tip && <p className="mt-1 text-sm leading-relaxed text-emerald-950">{dayOutline.assistant_tip}</p>}
                  {dayOutline.rest_periods?.map((period: any, index: number) => {
                    const isScheduled = restExistsInPeriod(day, period.time_range);
                    return (
                      <div key={`${day.day_id}-rest-tip-${index}`} className="mt-2 rounded-lg border border-emerald-200 bg-white/80 px-3 py-2">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-emerald-950"><Coffee size={14} aria-hidden="true" />Nghỉ gợi ý {period.time_range} · {period.duration_minutes} phút</p>
                        <p className="mt-1 text-sm leading-relaxed text-gray-700">{period.activity}</p>
                        {isScheduled ? <p className="mt-2 text-sm font-medium text-emerald-950">Khoảng nghỉ này đã được xếp trong lịch.</p> : <button type="button" onClick={() => addSuggestedRest(day, period)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-emerald-800 px-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Plus size={14} />Thêm khoảng nghỉ vào lịch</button>}
                      </div>
                    );
                  })}
                </aside>
              ) : null}
              {dailyLoad > maxDailyMinutes && <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"><span className="font-semibold">Ngày này đang khá dày:</span> khoảng {(dailyLoad / 60).toLocaleString('vi-VN')} giờ tham quan, vượt mức {(maxDailyMinutes / 60).toLocaleString('vi-VN')} giờ của nhịp {pacingLevel}. Cân nhắc chuyển bớt địa điểm sang ngày khác để chừa thời gian nghỉ.{estimatedDurationCount > 0 ? ` ${estimatedDurationCount} địa điểm chưa có thời lượng, đang tạm tính 90 phút mỗi điểm.` : ''}</div>}
              {addingToDay === day.day_id && <div className="border-b border-gray-100 bg-gray-50/70 p-3"><p className="mb-2 text-xs font-semibold text-gray-700">Chọn từ Ý tưởng</p>{unplannedIdeas.length ? <div className="flex flex-wrap gap-2">{unplannedIdeas.map((poi) => <button key={poi.id} type="button" onClick={() => addIdea(day.day_id, poi)} className="min-h-10 rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-900 hover:border-emerald-700">{poi.name}</button>)}</div> : <p className="text-xs text-gray-600">Tất cả ý tưởng đã được xếp lịch. <button type="button" onClick={onAddIdea} className="font-semibold text-emerald-900 underline">Thêm ý tưởng mới</button></p>}</div>}
              {day.stops.length ? <ol className="divide-y divide-gray-100">
                {day.stops.map((stop, index) => {
                  const isRest = stop.stop_type === 'rest';
                  const placeNumber = day.stops.slice(0, index).filter((item) => item.stop_type !== 'rest').length + 1;
                  const restDuration = isRest ? durationBetween(stop.start_time || '12:00', stop.end_time || '13:30') || minutesFor(stop) : null;
                  return (
                    <li key={stop.stop_id} draggable={!isRest} onDragStart={(event) => { if (isRest) { event.preventDefault(); return; } setDragData({ stopId: stop.stop_id, dayId: day.day_id }); event.dataTransfer.setData('text/plain', stop.stop_id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (dragData?.ideaId) { const idea = ideas.find((item) => item.id === dragData.ideaId); if (idea) addIdea(day.day_id, idea); } else if (dragData?.stopId && dragData.dayId) moveStop(dragData.stopId, dragData.dayId, day.day_id, stop.stop_id); }} className={`flex gap-3 px-4 py-3 ${isRest ? 'bg-amber-50/80' : ''}`}>
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isRest ? 'bg-amber-100 text-amber-900' : 'text-gray-500'}`} aria-hidden="true">{isRest ? <Coffee size={16} /> : <GripVertical size={17} />}</span>
                      {!isRest && <span className="mt-1 text-xs font-semibold tabular-nums text-gray-600">{String(placeNumber).padStart(2, '0')}</span>}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-semibold text-gray-950">{stop.title}</p>{!isRest && stop.city && <span className="text-xs text-gray-600">{stop.city}</span>}{isRest ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900"><Clock3 size={12} />{stop.start_time || '12:00'}–{stop.end_time || '13:30'} · {restDuration} phút</span> : <span className="inline-flex items-center gap-1 text-xs text-gray-600"><Clock3 size={12} />{stop.duration_minutes ? `~${stop.duration_minutes} phút` : 'Chưa rõ thời lượng'}</span>}{isRest && <span className="text-xs font-medium text-amber-900">Khoảng nghỉ gợi ý</span>}</div>
                        {stop.address && <p className="mt-1 text-xs text-gray-700">{stop.address}</p>}
                        {isRest ? <>
                          <p className="mt-1 text-xs leading-relaxed text-amber-950">{stop.comment || 'Ăn trưa chậm rãi và nghỉ tại nơi lưu trú hoặc quán yên tĩnh.'}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-amber-950">Điều chỉnh giờ nghỉ</span>
                            <label><span className="sr-only">Giờ bắt đầu nghỉ</span><input type="time" step={900} value={stop.start_time || '12:00'} onChange={(event) => updateRestTime(day.day_id, stop, 'start_time', event.target.value)} className="min-h-10 rounded-lg border border-amber-200 bg-white px-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                            <span aria-hidden="true" className="text-amber-900">–</span>
                            <label><span className="sr-only">Giờ kết thúc nghỉ</span><input type="time" step={900} value={stop.end_time || '13:30'} onChange={(event) => updateRestTime(day.day_id, stop, 'end_time', event.target.value)} className="min-h-10 rounded-lg border border-amber-200 bg-white px-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                          </div>
                        </> : <>
                          {stop.stop_type === 'custom' && <div className="mt-2 grid gap-2 sm:grid-cols-3"><label className="block"><span className="mb-1 block text-xs text-gray-700">Tên hoạt động</span><input value={stop.title} onChange={(event) => updateStop(day.day_id, stop.stop_id, { title: event.target.value })} className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label><label className="block"><span className="mb-1 block text-xs text-gray-700">Thành phố</span><select value={stop.city || ''} onChange={(event) => updateStop(day.day_id, stop.stop_id, { city: event.target.value || null })} className="min-h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><option value="">Chọn thành phố</option><option value="Đà Nẵng">Đà Nẵng</option><option value="Huế">Huế</option></select></label><label className="block"><span className="mb-1 block text-xs text-gray-700">Địa chỉ (không bắt buộc)</span><input value={stop.address || ''} onChange={(event) => updateStop(day.day_id, stop.stop_id, { address: event.target.value || null })} placeholder="Thêm địa chỉ" className="min-h-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label></div>}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-gray-600">Giờ tự đặt</span>
                            <label><span className="sr-only">Giờ bắt đầu của {stop.title}</span><input type="time" value={stop.start_time || ''} onChange={(event) => updateStop(day.day_id, stop.stop_id, { start_time: event.target.value || null })} className="min-h-10 rounded-lg border border-gray-300 px-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                            <span aria-hidden="true" className="text-gray-600">–</span>
                            <label><span className="sr-only">Giờ kết thúc của {stop.title}</span><input type="time" value={stop.end_time || ''} onChange={(event) => updateStop(day.day_id, stop.stop_id, { end_time: event.target.value || null })} className="min-h-10 rounded-lg border border-gray-300 px-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                          </div>
                          <label className="mt-2 block"><span className="sr-only">Ghi chú cho {stop.title}</span><span className="mb-1 flex items-center gap-1 text-xs text-gray-600"><MessageSquare size={12} />Ghi chú</span><textarea rows={1} value={stop.comment || ''} onChange={(event) => updateStop(day.day_id, stop.stop_id, { comment: event.target.value || null })} placeholder="Thêm ghi chú cho địa điểm này…" className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700" /></label>
                        </>}
                      </div>
                      <div className={`grid shrink-0 items-center gap-1 ${isRest ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {!isRest && <>
                          <button type="button" aria-label={`Chuyển ${stop.title} lên`} disabled={index === 0} onClick={() => moveStop(stop.stop_id, day.day_id, day.day_id, day.stops[index - 1]?.stop_id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><ChevronUp size={16} /></button>
                          <button type="button" aria-label={`Chuyển ${stop.title} xuống`} disabled={index === day.stops.length - 1} onClick={() => moveStop(stop.stop_id, day.day_id, day.day_id, day.stops[index + 2]?.stop_id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><ChevronDown size={16} /></button>
                        </>}
                        <button type="button" aria-label={`Xóa ${stop.title} khỏi lịch`} onClick={() => removeStop(day.day_id, stop.stop_id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"><Trash2 size={15} /></button>
                        {!isRest && <>
                          <label className="sr-only" htmlFor={`move-${stop.stop_id}`}>Chuyển {stop.title} sang ngày khác</label>
                          <select id={`move-${stop.stop_id}`} value={day.day_id} onChange={(event) => moveStop(stop.stop_id, day.day_id, event.target.value)} className="col-span-2 min-h-10 max-w-24 rounded-lg border border-gray-300 bg-white px-1 text-xs text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                            {plan.days.map((option) => <option key={option.day_id} value={option.day_id}>Ngày {option.day_number}</option>)}
                          </select>
                        </>}
                      </div>
                    </li>
                  );
                })}
              </ol> : <div className="px-4 py-5 text-sm text-gray-600">Chưa xếp địa điểm cho ngày này. Thêm từ Ý tưởng hoặc kéo một thẻ vào đây.</div>}
            </section>
            );
          })}
        </section>
      </div>
    </div>
  );
}

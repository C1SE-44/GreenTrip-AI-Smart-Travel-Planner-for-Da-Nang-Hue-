export type FeasibilityStatus = 'FEASIBLE' | 'TIGHT' | 'LIKELY_INFEASIBLE' | 'INSUFFICIENT_DATA';
export type FeasibilitySeverity = 'info' | 'warning' | 'critical';

export interface FeasibilityTrip {
  destination?: string;
  dateMode?: 'dates' | 'flex';
  startDate?: string | null;
  endDate?: string | null;
  daysCount?: number;
  flexibleDays?: number;
  adultCount?: number;
  childCount?: number;
  infantCount?: number;
  peopleCount?: number;
  totalBudget?: number | null;
  budgetInputAmount?: number | null;
  budgetScope?: 'PER_PERSON' | 'TOTAL_GROUP' | null;
  activityStartTime?: string | null;
  activityEndTime?: string | null;
}

export interface FeasibilityPoi {
  id: string;
  city?: string | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  average_visit_minutes?: number | null;
  estimatedCost?: number | null;
  priceUnit?: string | null;
  opening_hours?: Record<string, unknown> | null;
}

export interface FeasibilityItineraryStop {
  poi_id?: string | null;
  stop_id?: string | null;
  title?: string | null;
  day_number?: number | null;
  duration_minutes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
}

export interface FeasibilityWarning {
  code: string;
  severity: FeasibilitySeverity;
  reason: string;
  poiIds?: string[];
  data?: Record<string, string | number | boolean | null>;
  assumptions: string[];
  action: string;
}

export interface FeasibilityResult {
  status: FeasibilityStatus;
  riskLevel: number;
  warnings: FeasibilityWarning[];
  total_visit_minutes: number | null;
  estimated_travel_minutes: number | null;
  estimated_break_minutes: number | null;
  available_minutes: number;
  time_coverage: { known: number; total: number; ratio: number; complete: boolean };
  estimated_known_cost: number | null;
  budget_limit: number | null;
  cost_coverage: { known: number; unknown: number; total: number; ratio: number; complete: boolean };
  opening_hours_conflicts: string[];
  cross_city_travel_warning: boolean;
  unknown_fields: string[];
  assumptions: string[];
}

export interface FeasibilityConfig {
  defaultActivityStartTime: string;
  defaultActivityEndTime: string;
  localRoadDistanceFactor: number;
  localTravelSpeedKmh: number;
  breakAfterMinutes: number;
  breakDurationMinutes: number;
  tightCapacityRatio: number;
  partialArrivalDepartureDayMinutes: number;
}

export const DEFAULT_FEASIBILITY_CONFIG: FeasibilityConfig = {
  defaultActivityStartTime: '09:00',
  defaultActivityEndTime: '17:00',
  localRoadDistanceFactor: 1.25,
  localTravelSpeedKmh: 25,
  breakAfterMinutes: 180,
  breakDurationMinutes: 15,
  tightCapacityRatio: 0.85,
  partialArrivalDepartureDayMinutes: 240,
};

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0, 'chủ nhật': 0, 'chu nhat': 0,
  monday: 1, mon: 1, 'thứ hai': 1, 'thu hai': 1,
  tuesday: 2, tue: 2, 'thứ ba': 2, 'thu ba': 2,
  wednesday: 3, wed: 3, 'thứ tư': 3, 'thu tu': 3,
  thursday: 4, thu: 4, 'thứ năm': 4, 'thu nam': 4,
  friday: 5, fri: 5, 'thứ sáu': 5, 'thu sau': 5,
  saturday: 6, sat: 6, 'thứ bảy': 6, 'thu bay': 6,
};

const STATUS_RANK: Record<FeasibilityStatus, number> = {
  FEASIBLE: 0,
  TIGHT: 1,
  INSUFFICIENT_DATA: 1,
  LIKELY_INFEASIBLE: 2,
};

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').trim();
}

function normalizeWeekday(value: unknown): number | null {
  const normalized = normalizeText(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
  if (normalized in DAY_NAMES) return DAY_NAMES[normalized];
  const short = normalized.slice(0, 3);
  return short in DAY_NAMES ? DAY_NAMES[short] : null;
}

function parseTimeToken(hourValue: number, minuteValue: number, period: string | undefined): number | null {
  if (minuteValue > 59) return null;
  let hour = hourValue;
  const meridiem = period?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || (meridiem && hourValue > 12)) return null;
  return hour * 60 + minuteValue;
}

function parseIntervals(value: unknown): Array<[number, number]> | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (/\b(closed|đóng cửa|dong cua)\b/i.test(text)) return [];
  if (/24\s*(hours?|hrs?|\/\s*7)|24\s*giờ/i.test(text)) return [[0, 1440]];

  const timePattern = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  const tokens: Array<{ minute: number; period?: string }> = [];
  for (const match of text.matchAll(timePattern)) {
    const hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    const parsed = parseTimeToken(hour, minute, match[3]);
    if (parsed !== null) tokens.push({ minute: parsed, period: match[3]?.toLowerCase() });
  }
  const intervals: Array<[number, number]> = [];
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    let start = tokens[index].minute;
    let end = tokens[index + 1].minute;
    const startHadPeriod = Boolean(tokens[index].period);
    const endHadPeriod = Boolean(tokens[index + 1].period);
    if (end <= start && startHadPeriod && !endHadPeriod) end += 12 * 60;
    if (end <= start && !startHadPeriod && endHadPeriod && tokens[index + 1].period === 'pm' && start < 12 * 60) start += 12 * 60;
    if (end <= start && end === 0) end = 1440;
    if (end > start && start >= 0 && end <= 1440) intervals.push([start, end]);
  }
  return intervals.length ? intervals : null;
}

function parseStructuredInterval(value: unknown): Array<[number, number]> | null {
  if (typeof value === 'string') return parseIntervals(value);
  if (Array.isArray(value)) {
    const intervals = value.flatMap((item) => parseStructuredInterval(item) ?? []);
    return intervals.length ? intervals : null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const open = record.open ?? record.start ?? record.opens_at;
  const close = record.close ?? record.end ?? record.closes_at;
  const openText = typeof open === 'object' && open !== null
    ? String((open as Record<string, unknown>).time ?? '')
    : String(open ?? '');
  const closeText = typeof close === 'object' && close !== null
    ? String((close as Record<string, unknown>).time ?? '')
    : String(close ?? '');
  if (openText && closeText) {
    const minutes = (text: string) => {
      const match = text.match(/^(\d{1,2}):?(\d{2})$/);
      if (!match) return null;
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      return hour <= 24 && minute <= 59 ? hour * 60 + minute : null;
    };
    const start = minutes(openText);
    let end = minutes(closeText);
    if (start !== null && end !== null && end <= start && end === 0) end = 1440;
    if (start !== null && end !== null && end > start) return [[start, end]];
  }
  return null;
}

function weekdaySchedule(openingHours: Record<string, unknown>): Map<number, Array<[number, number]> | null> {
  const schedule = new Map<number, Array<[number, number]> | null>();
  const weekdayText = openingHours.weekday_text;
  if (Array.isArray(weekdayText)) {
    for (const line of weekdayText) {
      if (typeof line !== 'string') continue;
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const day = normalizeWeekday(line.slice(0, separator));
      if (day === null) continue;
      schedule.set(day, parseIntervals(line.slice(separator + 1)));
    }
    if (schedule.size) return schedule;
  }

  const periods = openingHours.periods;
  if (Array.isArray(periods)) {
    for (const period of periods) {
      if (!period || typeof period !== 'object') continue;
      const item = period as Record<string, unknown>;
      const open = item.open as Record<string, unknown> | undefined;
      const close = item.close as Record<string, unknown> | undefined;
      const day = Number(open?.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const interval = parseStructuredInterval({ open, close });
      if (!schedule.has(day)) schedule.set(day, []);
      if (interval) schedule.set(day, [...(schedule.get(day) ?? []), ...interval]);
    }
    if (schedule.size) return schedule;
  }

  for (const [key, value] of Object.entries(openingHours)) {
    const day = normalizeWeekday(key);
    if (day === null) continue;
    schedule.set(day, parseStructuredInterval(value));
  }
  return schedule;
}

function dateWeekday(isoDate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.getUTCDay();
}

function tripDates(trip: FeasibilityTrip, days: number): string[] | null {
  if (trip.dateMode === 'flex' || !trip.startDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trip.startDate)) return null;
  const start = new Date(`${trip.startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== trip.startDate) return null;
  let dateCount = days;
  if (trip.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trip.endDate)) return null;
    const end = new Date(`${trip.endDate}T00:00:00Z`);
    if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== trip.endDate) return null;
    dateCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (dateCount !== days || dateCount < 1) return null;
  }
  return Array.from({ length: dateCount }, (_, offset) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

function openingHoursAssessment(
  poi: FeasibilityPoi,
  dates: string[] | null,
  visitMinutes: number | null,
  dayStart: number,
  dayEnd: number,
): 'fits' | 'conflict' | 'unknown' {
  if (!dates || visitMinutes === null || !poi.opening_hours || typeof poi.opening_hours !== 'object') return 'unknown';
  const schedule = weekdaySchedule(poi.opening_hours);
  if (!schedule.size) return 'unknown';
  let unknownDate = false;
  let knownOpenDate = false;
  let knownDates = 0;
  for (const date of dates) {
    const weekday = dateWeekday(date);
    if (weekday === null || !schedule.has(weekday)) {
      unknownDate = true;
      continue;
    }
    knownDates += 1;
    const intervals = schedule.get(weekday);
    if (!intervals?.length) continue;
    knownOpenDate = true;
    const required = visitMinutes;
    const fits = intervals.some(([open, close]) => Math.max(open, dayStart) < Math.min(close, dayEnd)
      && Math.min(close, dayEnd) - Math.max(open, dayStart) >= required);
    if (fits) return 'fits';
  }
  if (unknownDate || knownDates < dates.length) return 'unknown';
  if (!knownOpenDate) return 'conflict';
  return 'conflict';
}

function validCoordinates(poi: FeasibilityPoi): boolean {
  return typeof poi.lat === 'number' && Number.isFinite(poi.lat) && poi.lat >= -90 && poi.lat <= 90
    && typeof poi.lng === 'number' && Number.isFinite(poi.lng) && poi.lng >= -180 && poi.lng <= 180;
}

function haversineKm(a: FeasibilityPoi, b: FeasibilityPoi): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians((b.lat as number) - (a.lat as number));
  const dLng = toRadians((b.lng as number) - (a.lng as number));
  const originLat = toRadians(a.lat as number);
  const targetLat = toRadians(b.lat as number);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(originLat) * Math.cos(targetLat) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function estimateLocalTravelMinutes(pois: FeasibilityPoi[], config: FeasibilityConfig): { minutes: number; complete: boolean } {
  const groups = new Map<string, FeasibilityPoi[]>();
  for (const poi of pois) {
    const city = normalizeText(poi.city) || 'unknown-city';
    groups.set(city, [...(groups.get(city) ?? []), poi]);
  }
  let totalKm = 0;
  let complete = true;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (group.some((poi) => !poi.city?.trim() || !validCoordinates(poi))) {
      complete = false;
      continue;
    }
    const remaining = new Set(group.slice(1));
    const connected = new Set([group[0]]);
    while (remaining.size) {
      let shortest = Number.POSITIVE_INFINITY;
      let next: FeasibilityPoi | null = null;
      for (const from of connected) {
        for (const to of remaining) {
          const distance = haversineKm(from, to);
          if (distance < shortest) {
            shortest = distance;
            next = to;
          }
        }
      }
      if (!next || !Number.isFinite(shortest)) {
        complete = false;
        break;
      }
      totalKm += shortest;
      connected.add(next);
      remaining.delete(next);
    }
  }
  const roadKm = totalKm * config.localRoadDistanceFactor;
  return { minutes: Math.ceil(roadKm / config.localTravelSpeedKmh * 60), complete };
}

type CostUnitKind = 'person' | 'group' | 'item' | 'unknown';

function costUnitKind(unit: string | null | undefined): CostUnitKind {
  const normalized = normalizeText(unit).replace(/[_-]+/g, ' ');
  if (/\b(person|people|traveller|travelers|guest|pax|nguoi)\b/.test(normalized)) return 'person';
  if (/\b(group|nhom)\b/.test(normalized)) return 'group';
  if (/\b(item|dish|menu|meal|mon|each|portion|unit)\b/.test(normalized)) return 'item';
  return 'unknown';
}

function addWarning(
  warnings: FeasibilityWarning[],
  warning: FeasibilityWarning,
): void {
  const duplicate = warnings.some((existing) => existing.code === warning.code
    && JSON.stringify(existing.poiIds ?? []) === JSON.stringify(warning.poiIds ?? []));
  if (!duplicate) warnings.push(warning);
}

export function evaluateTripFeasibility(
  trip: FeasibilityTrip,
  selectedPoiIds: string[],
  catalogue: FeasibilityPoi[],
  confirmedStops: FeasibilityItineraryStop[] = [],
  config: FeasibilityConfig = DEFAULT_FEASIBILITY_CONFIG,
): FeasibilityResult {
  const assumptions: string[] = [];
  const unknownFields: string[] = [];
  const warnings: FeasibilityWarning[] = [];
  const poiById = new Map(catalogue.map((poi) => [String(poi.id), poi]));
  const uniqueSelectedIds = Array.from(new Set(selectedPoiIds.map(String)));
  const confirmedStopById = new Map(confirmedStops
    .filter((stop) => stop.poi_id)
    .map((stop) => [String(stop.poi_id), stop]));
  const selectedPois: FeasibilityPoi[] = [];
  for (const id of uniqueSelectedIds) {
    const poi = poiById.get(id);
    if (poi) {
      const scheduledDuration = finitePositive(confirmedStopById.get(id)?.duration_minutes);
      selectedPois.push(scheduledDuration === null ? poi : { ...poi, average_visit_minutes: scheduledDuration });
    }
    else unknownFields.push(`POI data: ${id}`);
  }

  const selectedSet = new Set(uniqueSelectedIds);
  const itineraryPois: FeasibilityPoi[] = [];
  for (const [index, stop] of confirmedStops.entries()) {
    const id = String(stop.poi_id ?? stop.stop_id ?? `scheduled-${index}`);
    if (selectedSet.has(id)) continue;
    const catalogPoi = poiById.get(id);
    const scheduledDuration = finitePositive(stop.duration_minutes);
    itineraryPois.push(catalogPoi
      ? scheduledDuration === null ? catalogPoi : { ...catalogPoi, average_visit_minutes: scheduledDuration }
      : {
        id,
        city: stop.city,
        lat: stop.latitude,
        lng: stop.longitude,
        average_visit_minutes: scheduledDuration,
      });
    selectedSet.add(id);
  }
  const allPois = [...selectedPois, ...itineraryPois];
  const tripDays = finitePositive(trip.daysCount ?? trip.flexibleDays);
  const days = Math.max(1, Math.floor(tripDays ?? 1));
  if (!tripDays) unknownFields.push('trip duration');
  const dates = tripDates(trip, days);
  const hasExactDates = dates !== null;
  if (trip.dateMode === 'dates' && trip.startDate && !dates) unknownFields.push('trip dates');
  const requestedStart = parseClock(trip.activityStartTime);
  const requestedEnd = parseClock(trip.activityEndTime);
  const hasConfiguredDailyWindow = requestedStart !== null && requestedEnd !== null && requestedEnd > requestedStart;
  const configuredStart = (hasConfiguredDailyWindow ? requestedStart : null)
    ?? parseClock(config.defaultActivityStartTime) ?? 9 * 60;
  const configuredEnd = (hasConfiguredDailyWindow ? requestedEnd : null)
    ?? parseClock(config.defaultActivityEndTime) ?? 17 * 60;
  const dailyWindow = Math.max(0, configuredEnd - configuredStart);
  if ((trip.activityStartTime || trip.activityEndTime) && !hasConfiguredDailyWindow) unknownFields.push('activity time window');
  const dayAvailableMinutes = Array.from({ length: days }, (_, index) => {
    if (hasConfiguredDailyWindow || !hasExactDates) return dailyWindow;
    if (days === 1 || index === 0 || index === days - 1) return config.partialArrivalDepartureDayMinutes;
    return dailyWindow;
  });
  const availableMinutes = dayAvailableMinutes.reduce((total, value) => total + value, 0);
  assumptions.push(hasConfiguredDailyWindow
    ? `Dùng khung tham quan do người dùng đặt ${String(trip.activityStartTime)}–${String(trip.activityEndTime)} mỗi ngày.`
    : hasExactDates
      ? `Dùng ${Math.round(config.partialArrivalDepartureDayMinutes / 60)} giờ cho ngày đầu/cuối và ${Math.round(dailyWindow / 60)} giờ cho mỗi ngày giữa; giờ đến/rời chưa được lưu.`
      : `Dùng khung ${String(config.defaultActivityStartTime)}–${String(config.defaultActivityEndTime)} mỗi ngày làm giả định sơ bộ.`);
  assumptions.push(`Di chuyển nội thành là ước tính dưới: khoảng cách đường chim bay × ${config.localRoadDistanceFactor}, tốc độ giả định ${config.localTravelSpeedKmh} km/h; không có traffic realtime.`);
  assumptions.push(`Dự phòng nghỉ ${config.breakDurationMinutes} phút sau mỗi ${config.breakAfterMinutes} phút hoạt động.`);
  assumptions.push('Thú cưng không được tính là khách; chưa có thời lượng riêng theo POI.');

  let knownVisitMinutes = 0;
  let knownVisitCount = 0;
  for (const poi of allPois) {
    const duration = finitePositive(poi.average_visit_minutes);
    if (duration === null) continue;
    knownVisitMinutes += duration;
    knownVisitCount += 1;
  }
  const localCities = new Set(allPois.map((poi) => normalizeText(poi.city)).filter(Boolean));
  const crossCityTravelWarning = localCities.size > 1;
  const localTravel = estimateLocalTravelMinutes(allPois, config);
  const estimatedTravelMinutes = localTravel.minutes;
  const travelComplete = localTravel.complete && !crossCityTravelWarning;
  if (crossCityTravelWarning) {
    assumptions.push('Có POI ở nhiều thành phố; thời gian di chuyển liên tỉnh chưa được ước tính vì chưa có tuyến và phương tiện xác nhận.');
    addWarning(warnings, {
      code: 'cross_city_travel_unestimated', severity: 'warning',
      reason: 'Các POI nằm ở nhiều thành phố; thời gian và chi phí chặng liên tỉnh chưa có dữ liệu đáng tin cậy.',
      data: { cities: localCities.size },
      assumptions: ['Không dùng khoảng cách đường chim bay để thay cho thời gian đi liên tỉnh.'],
      action: 'Kiểm tra chặng liên tỉnh khi xếp lịch; các địa điểm vẫn có thể được thêm.',
    });
  }
  if (!localTravel.complete) {
    unknownFields.push('local travel distance');
    addWarning(warnings, {
      code: 'local_travel_estimate_partial', severity: 'info',
      reason: 'Một số tọa độ hoặc thành phố chưa đủ để ước tính quãng di chuyển nội thành.',
      assumptions: ['Không suy đoán tọa độ từ địa chỉ dạng chữ.'],
      action: 'Xác nhận khoảng cách khi xếp lịch; việc thiếu dữ liệu không ngăn thêm POI.',
    });
  }

  const estimatedBreakMinutes = Math.floor((knownVisitMinutes + estimatedTravelMinutes) / config.breakAfterMinutes)
    * config.breakDurationMinutes;
  const requiredKnownMinutes = knownVisitMinutes + estimatedTravelMinutes + estimatedBreakMinutes;
  const timeComplete = knownVisitCount === allPois.length && travelComplete;
  const timeRatio = availableMinutes > 0 ? requiredKnownMinutes / availableMinutes : 0;
  if (knownVisitCount < allPois.length) unknownFields.push('average_visit_minutes');
  const timeOverCapacity = requiredKnownMinutes > availableMinutes;
  const timeRiskSeverity: FeasibilitySeverity = timeRatio >= 1.15 ? 'critical' : 'warning';
  const scheduledMinutesByDay = new Map<number, number>();
  const scheduledPoiIdsByDay = new Map<number, string[]>();
  for (const stop of confirmedStops) {
    const dayNumber = stop.day_number;
    if (!Number.isInteger(dayNumber) || !dayNumber || dayNumber < 1 || dayNumber > days || !stop.poi_id) continue;
    const scheduledPoi = poiById.get(String(stop.poi_id));
    const duration = finitePositive(stop.duration_minutes) ?? finitePositive(scheduledPoi?.average_visit_minutes);
    if (duration === null) continue;
    scheduledMinutesByDay.set(dayNumber, (scheduledMinutesByDay.get(dayNumber) ?? 0) + duration);
    scheduledPoiIdsByDay.set(dayNumber, [...(scheduledPoiIdsByDay.get(dayNumber) ?? []), String(stop.poi_id)]);
  }
  const confirmedDayOverloads: number[] = [];
  for (const [dayNumber, visitMinutes] of scheduledMinutesByDay) {
    const dayBreakMinutes = Math.floor(visitMinutes / config.breakAfterMinutes) * config.breakDurationMinutes;
    const requiredMinutes = visitMinutes + dayBreakMinutes;
    const dayLimit = dayAvailableMinutes[dayNumber - 1];
    if (requiredMinutes <= dayLimit) continue;
    confirmedDayOverloads.push(dayNumber);
    const ids = Array.from(new Set(scheduledPoiIdsByDay.get(dayNumber) ?? []));
    addWarning(warnings, {
      code: 'confirmed_day_over_capacity', severity: 'critical', poiIds: ids,
      reason: `Lịch đã lưu dành khoảng ${requiredMinutes} phút cho Ngày ${dayNumber}, vượt khung giả định ${dayLimit} phút của ngày đó.`,
      data: { day_number: dayNumber, required_minutes: requiredMinutes, available_minutes: dayLimit },
      assumptions: ['Đánh giá chỉ đọc các stop POI đã lưu; không sửa hoặc sắp xếp lại itinerary.'],
      action: 'Bạn có thể giữ lịch đã lưu và tự điều chỉnh ngày/khung giờ.',
    });
  }
  if (timeOverCapacity) {
    addWarning(warnings, {
      code: 'time_capacity_exceeded', severity: timeRiskSeverity,
      reason: `Thời lượng đã biết và đệm di chuyển/nghỉ khoảng ${requiredKnownMinutes} phút, vượt khung giả định ${availableMinutes} phút của chuyến.`,
      data: { required_minutes: requiredKnownMinutes, available_minutes: availableMinutes, utilization: Number(timeRatio.toFixed(2)) },
      assumptions: [...assumptions.slice(0, 3)],
      action: 'Bạn có thể tiếp tục thêm POI; hệ thống không tự xóa hoặc xếp lịch địa điểm.',
    });
  } else if (timeComplete && timeRatio >= config.tightCapacityRatio) {
    addWarning(warnings, {
      code: 'time_capacity_tight', severity: 'info',
      reason: `Thời lượng đã biết dùng khoảng ${Math.round(timeRatio * 100)}% khung giả định của chuyến.`,
      data: { required_minutes: requiredKnownMinutes, available_minutes: availableMinutes, utilization: Number(timeRatio.toFixed(2)) },
      assumptions: [...assumptions.slice(0, 3)],
      action: 'Giữ thời gian dự phòng khi tự xếp lịch.',
    });
  }

  if (!dates) assumptions.push('Ngày linh hoạt hoặc chưa có ngày ISO cụ thể nên giờ mở cửa chỉ được đánh giá sơ bộ; không kết luận theo thứ trong tuần.');
  const openingHoursConflicts: string[] = [];
  let openingHoursUnknown = false;
  for (const poi of allPois) {
    const visitMinutes = finitePositive(poi.average_visit_minutes);
    const assessment = openingHoursAssessment(poi, dates, visitMinutes, configuredStart, configuredEnd);
    if (assessment === 'conflict') openingHoursConflicts.push(poi.id);
    if (assessment === 'unknown') openingHoursUnknown = true;
  }
  for (const poiId of openingHoursConflicts) {
    addWarning(warnings, {
      code: 'opening_hours_conflict', severity: 'critical', poiIds: [poiId],
      reason: `Giờ mở cửa đã chuẩn hóa của POI ${poiId} không có khung đủ dài trong các ngày chuyến đi đã chọn.`,
      data: { start_date: dates?.[0] ?? null, end_date: dates ? dates[dates.length - 1] : null },
      assumptions: ['Chỉ dùng lịch theo ngày trong opening_hours; bỏ qua open_now, status_text và best_time.'],
      action: 'Bạn có thể giữ POI và cân nhắc đổi ngày/khung giờ khi xếp lịch.',
    });
  }
  if (openingHoursUnknown && allPois.length) {
    unknownFields.push('opening_hours');
    addWarning(warnings, {
      code: 'opening_hours_unknown', severity: 'info',
      reason: dates ? 'Một số POI thiếu lịch mở cửa theo ngày hoặc định dạng chưa nhận diện được.' : 'Ngày linh hoạt nên chưa thể kiểm tra chính xác giờ mở cửa theo thứ trong tuần.',
      assumptions: ['Không dùng open_now, status_text, best_time hoặc giờ mặc định do UI tạo ra.'],
      action: 'Xác nhận giờ mở cửa gần ngày đi; việc thiếu dữ liệu không ngăn thêm POI.',
    });
  }

  const adultSource = trip.adultCount !== undefined && trip.adultCount !== null ? trip.adultCount : trip.peopleCount;
  const adultValue = Number(adultSource);
  const adultCount = Number.isFinite(adultValue) ? Math.max(0, Math.floor(adultValue)) : 0;
  const childCount = Math.max(0, Math.floor(finitePositive(trip.childCount) ?? 0));
  const infantCount = Math.max(0, Math.floor(finitePositive(trip.infantCount) ?? 0));
  const budgetLimit = finitePositive(trip.totalBudget);
  const hasDeclaredBudget = budgetLimit !== null || finitePositive(trip.budgetInputAmount) !== null;
  let estimatedKnownCost = 0;
  let knownCostCount = 0;
  let unknownCostCount = 0;
  let childFareUnknown = false;
  for (const poi of allPois) {
    const cost = poi.estimatedCost;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost === 0) {
      knownCostCount += 1;
      continue;
    }
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      unknownCostCount += 1;
      continue;
    }
    const unit = costUnitKind(poi.priceUnit);
    if (unit === 'group') {
      estimatedKnownCost += cost;
      knownCostCount += 1;
    } else if (unit === 'person') {
      estimatedKnownCost += cost * adultCount;
      knownCostCount += 1;
      if (childCount + infantCount > 0) {
        childFareUnknown = true;
        unknownCostCount += 1;
      }
    } else {
      // Per-item prices are references, not a meal or trip total.
      unknownCostCount += 1;
    }
  }
  if (childFareUnknown) {
    unknownFields.push('child/infant fare');
    assumptions.push('Giá theo người chỉ nhân số người lớn; giá trẻ em/trẻ sơ sinh chưa có nên không tự giả định bằng giá người lớn.');
  }
  const costCoverageComplete = unknownCostCount === 0 && knownCostCount === allPois.length;
  const costCoverageRatio = allPois.length ? knownCostCount / allPois.length : 1;
  if (hasDeclaredBudget && budgetLimit === null) unknownFields.push('normalized total budget');
  const budgetExceeded = hasDeclaredBudget && budgetLimit !== null && estimatedKnownCost > budgetLimit;
  if (hasDeclaredBudget && budgetExceeded) {
    addWarning(warnings, {
      code: 'known_poi_cost_exceeds_budget', severity: 'critical',
      reason: `Chi phí POI đã biết khoảng ${Math.round(estimatedKnownCost).toLocaleString('vi-VN')} VND vượt tổng ngân sách đã chuẩn hóa ${Math.round(budgetLimit as number).toLocaleString('vi-VN')} VND.`,
      data: { estimated_known_cost: estimatedKnownCost, budget_limit: budgetLimit, known_cost_coverage: Number(costCoverageRatio.toFixed(2)) },
      assumptions: ['Chỉ cộng estimated_cost có price_unit là per person hoặc per group; không dùng budget_tier hoặc cộng menu.'],
      action: 'Ngân sách là ưu tiên mềm; bạn vẫn có thể thêm POI và tự quyết định chi phí.',
    });
  }
  if (hasDeclaredBudget && !costCoverageComplete && allPois.length) {
    unknownFields.push('POI cost coverage');
    addWarning(warnings, {
      code: 'budget_cost_coverage_partial', severity: 'info',
      reason: 'Chi phí một số POI chưa xác định hoặc chỉ là giá theo món; tổng dưới đây là phần đã biết, không phải tổng chi phí chuyến đi.',
      data: { known_items: knownCostCount, unknown_items: unknownCostCount, total_items: allPois.length, known_cost: estimatedKnownCost },
      assumptions: ['Không lấy budget_tier làm số tiền và không nhân giá món ăn với số khách.'],
      action: 'Xem giá từng POI khi cần; không loại POI tự động theo ngân sách.',
    });
  }

  const timeCoverageRatio = allPois.length ? knownVisitCount / allPois.length : 1;
  const costRatio = allPois.length ? costCoverageRatio : 1;
  const riskLevel = Math.max(
    timeOverCapacity ? (timeRatio >= 1.15 ? 3 : 2) : timeComplete && timeRatio >= config.tightCapacityRatio ? 1 : 0,
    confirmedDayOverloads.length ? 3 : 0,
    openingHoursConflicts.length ? 3 : 0,
    budgetExceeded ? 3 : 0,
    crossCityTravelWarning ? 1 : 0,
  );
  const hasHardRisk = timeOverCapacity || confirmedDayOverloads.length > 0 || openingHoursConflicts.length > 0 || budgetExceeded;
  const hasIncompleteData = unknownFields.length > 0 || !timeComplete || (hasDeclaredBudget && !costCoverageComplete);
  const status: FeasibilityStatus = hasHardRisk
    ? 'LIKELY_INFEASIBLE'
    : hasIncompleteData || crossCityTravelWarning
      ? 'INSUFFICIENT_DATA'
      : timeRatio >= config.tightCapacityRatio
        ? 'TIGHT'
        : 'FEASIBLE';

  return {
    status,
    riskLevel,
    warnings,
    total_visit_minutes: knownVisitCount === allPois.length ? knownVisitMinutes : null,
    estimated_travel_minutes: travelComplete ? estimatedTravelMinutes : null,
    estimated_break_minutes: knownVisitCount === allPois.length && travelComplete ? estimatedBreakMinutes : null,
    available_minutes: availableMinutes,
    time_coverage: { known: knownVisitCount, total: allPois.length, ratio: timeCoverageRatio, complete: timeComplete },
    estimated_known_cost: hasDeclaredBudget ? estimatedKnownCost : null,
    budget_limit: budgetLimit,
    cost_coverage: { known: knownCostCount, unknown: unknownCostCount, total: allPois.length, ratio: costRatio, complete: costCoverageComplete },
    opening_hours_conflicts: openingHoursConflicts,
    cross_city_travel_warning: crossCityTravelWarning,
    unknown_fields: Array.from(new Set(unknownFields)),
    assumptions: Array.from(new Set(assumptions)),
  };
}

function warningKey(warning: FeasibilityWarning): string {
  return `${warning.code}:${warning.severity}:${(warning.poiIds ?? []).slice().sort().join(',')}`;
}

export function feasibilityWarningSignature(result: FeasibilityResult): string {
  return `${result.status}:${result.riskLevel}:${result.warnings
    .filter((warning) => warning.severity !== 'info')
    .map(warningKey).sort().join('|')}`;
}

export function hasSignificantRiskIncrease(before: FeasibilityResult, after: FeasibilityResult): boolean {
  if (STATUS_RANK[after.status] > STATUS_RANK[before.status] && after.status === 'LIKELY_INFEASIBLE') return true;
  if (after.riskLevel > before.riskLevel) return true;
  const beforeWarnings = new Set(before.warnings.filter((warning) => warning.severity !== 'info').map(warningKey));
  return after.warnings.some((warning) => warning.severity !== 'info' && !beforeWarnings.has(warningKey(warning)));
}

export function requiresFeasibilityConfirmation(result: FeasibilityResult): boolean {
  return result.warnings.some((warning) => warning.code === 'cross_city_travel_unestimated' && warning.severity !== 'info')
    || (result.status === 'LIKELY_INFEASIBLE'
      && result.warnings.some((warning) => warning.severity === 'warning' || warning.severity === 'critical'));
}

export function unavailableFeasibilityResult(message = 'Không thể hoàn tất bước kiểm tra khả thi.'): FeasibilityResult {
  return {
    status: 'INSUFFICIENT_DATA', riskLevel: 0,
    warnings: [{
      code: 'feasibility_check_unavailable', severity: 'warning', reason: message,
      assumptions: [], action: 'Bạn có thể tiếp tục sau khi xác nhận; POI và lịch trình sẽ không bị thay đổi tự động.',
    }],
    total_visit_minutes: null, estimated_travel_minutes: null, estimated_break_minutes: null,
    available_minutes: 0,
    time_coverage: { known: 0, total: 0, ratio: 0, complete: false },
    estimated_known_cost: null, budget_limit: null,
    cost_coverage: { known: 0, unknown: 0, total: 0, ratio: 0, complete: false },
    opening_hours_conflicts: [], cross_city_travel_warning: false,
    unknown_fields: ['feasibility check'], assumptions: [],
  };
}

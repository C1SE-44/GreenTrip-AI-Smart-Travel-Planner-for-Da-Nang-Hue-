import { useEffect, useMemo, useRef, useState } from 'react';
import { BedDouble, ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import { tripStartDate } from '@/utils/tripDates';
import {
  recommendAccommodations,
  type AccommodationGroupRecommendations,
  type AccommodationGroupSelection,
  type AccommodationItineraryPayload,
  type AccommodationPlan,
  type AccommodationRecommendationResponse,
  type AccommodationSelectionStatus,
} from '@/services/accommodations';

interface Props {
  trip: UserTrip;
  itinerary: AccommodationItineraryPayload;
  alternativeId: string;
  onTripUpdate?: (trip: UserTrip) => void;
  compact?: boolean;
}

interface ManualEntry {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  nightlyPrice: string;
  roomCount: string;
}

const EMPTY_MANUAL: ManualEntry = {
  name: '', address: '', latitude: '', longitude: '', nightlyPrice: '', roomCount: '',
};

function lodgingPreference(raw?: string): 'any' | 'budget' | 'standard' | 'luxury' {
  const encoded = raw?.match(/(?:^|;)\s*lodging:([^;]+)/i)?.[1]?.trim();
  const value = (encoded || raw || '').trim().toLowerCase();
  if (value === '$' || value === 'budget') return 'budget';
  if (value === '$$' || value === 'standard') return 'standard';
  if (value === '$$$' || value === '$$$$' || value === 'luxury' || value === 'upgrade') return 'luxury';
  return 'any';
}

function humanCounts(trip: UserTrip) {
  const children = trip.childCount ?? 0;
  const infants = trip.infantCount ?? 0;
  const hasSplit = trip.adultCount !== undefined || trip.childCount !== undefined || trip.infantCount !== undefined;
  return {
    adults: trip.adultCount ?? (hasSplit ? Math.max(0, (trip.peopleCount || 1) - children - infants) : trip.peopleCount || 1),
    children,
    infants,
  };
}

function currentSelection(
  trip: UserTrip,
  group: AccommodationGroupRecommendations,
  alternativeId: string,
  signature: string,
) {
  return (trip.accommodationPlan?.groups || []).find((item) =>
    item.groupId === group.group_id
    && item.itineraryVariantId === alternativeId
    && item.itinerarySignature === signature,
  );
}

function normalizeCityKey(city: string) {
  const folded = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();
  if (['hue', 'thua thien hue', 'thanh pho hue', 'hue city'].includes(folded)) return 'hue';
  if (['da nang', 'danang', 'thanh pho da nang', 'da nang city'].includes(folded)) return 'da nang';
  return folded;
}

function roomCountDraftKey(alternativeId: string, groupId: string) {
  return `${alternativeId}::${groupId}`;
}

function roomCountRequestMap(roomCounts: Record<string, string>, alternativeId: string) {
  const prefix = `${alternativeId}::`;
  const entries = Object.entries(roomCounts).flatMap(([key, raw]) => {
    const roomCount = Number(raw);
    return key.startsWith(prefix) && Number.isInteger(roomCount) && roomCount >= 1 && roomCount <= 20
      ? [[key.slice(prefix.length), roomCount] as [string, number]]
      : [];
  });
  return Object.fromEntries(entries.slice(-40));
}

function staleSelection(
  trip: UserTrip,
  group: AccommodationGroupRecommendations,
  alternativeId: string,
  signature: string,
) {
  return (trip.accommodationPlan?.groups || []).find((item) =>
    item.groupId === group.group_id
    && item.status !== 'CHOOSE_LATER'
    && (item.itineraryVariantId !== alternativeId || item.itinerarySignature !== signature),
  );
}

function saveSelection(
  trip: UserTrip,
  group: AccommodationGroupRecommendations,
  alternativeId: string,
  signature: string,
  selection: Omit<AccommodationGroupSelection, 'groupId' | 'city' | 'dayNumbers' | 'nights' | 'nightsStatus' | 'itineraryVariantId' | 'itinerarySignature'>,
): AccommodationPlan {
  const record: AccommodationGroupSelection = {
    groupId: group.group_id,
    city: group.city,
    dayNumbers: group.day_numbers,
    nights: group.nights,
    nightsStatus: group.nights_status,
    itineraryVariantId: alternativeId,
    itinerarySignature: signature,
    updatedAt: new Date().toISOString(),
    ...selection,
  };
  const current = trip.accommodationPlan?.groups || [];
  const groups = current.filter((item) => !(
    item.groupId === group.group_id
    && item.itineraryVariantId === alternativeId
    && item.itinerarySignature === signature
  ));
  groups.push(record);
  return { version: 1, groups: groups.slice(-40) };
}

function estimateDistance(stay: { latitude?: number; longitude?: number }, group: AccommodationGroupRecommendations, itinerary: AccommodationItineraryPayload) {
  if (stay.latitude == null || stay.longitude == null) return null;
  const stops = itinerary.days
    .filter((day) => group.day_numbers.includes(day.day_number))
    .flatMap((day) => day.stops)
    .filter((stop) => stop.poi_id && stop.city && normalizeCityKey(stop.city) === normalizeCityKey(group.city) && stop.latitude != null && stop.longitude != null);
  const unique = [...new Map(stops.map((stop) => [stop.poi_id, stop])).values()];
  if (!unique.length) return null;
  const radians = (degree: number) => degree * Math.PI / 180;
  const distances = unique.map((stop) => {
    const lat1 = radians(stay.latitude!);
    const lat2 = radians(stop.latitude!);
    const dLat = lat2 - lat1;
    const dLon = radians(stop.longitude!) - radians(stay.longitude!);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  });
  return distances.reduce((sum, value) => sum + value, 0) / distances.length;
}

function estimateDailyStayLegs(
  stay: { latitude?: number; longitude?: number },
  group: AccommodationGroupRecommendations,
  itinerary: AccommodationItineraryPayload,
) {
  if (stay.latitude == null || stay.longitude == null) return [];
  const toDistance = (latitude?: number | null, longitude?: number | null) => {
    if (latitude == null || longitude == null) return null;
    const radians = (degree: number) => degree * Math.PI / 180;
    const lat1 = radians(stay.latitude!);
    const lat2 = radians(latitude);
    const dLat = lat2 - lat1;
    const dLon = radians(longitude) - radians(stay.longitude!);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  };
  return itinerary.days
    .filter((day) => group.day_numbers.includes(day.day_number))
    .map((day) => {
      const stops = day.stops.filter((stop) => stop.poi_id && stop.city && normalizeCityKey(stop.city) === normalizeCityKey(group.city));
      const first = stops[0];
      const last = stops[stops.length - 1];
      return {
        dayNumber: day.day_number,
        fromStayKm: first ? toDistance(first.latitude, first.longitude) : null,
        toStayKm: last ? toDistance(last.latitude, last.longitude) : null,
      };
    })
    .filter((day) => day.fromStayKm != null || day.toStayKm != null);
}

function statusText(status?: AccommodationSelectionStatus) {
  if (status === 'SELECTED') return 'Đã chọn · chưa đặt phòng';
  if (status === 'BOOKED_BY_USER') return 'Bạn xác nhận đã đặt';
  if (status === 'CHOOSE_LATER') return 'Bạn sẽ chọn sau';
  if (status === 'RECOMMENDED') return 'Gợi ý từ catalogue';
  return '';
}

function localSignature(itinerary: AccommodationItineraryPayload) {
  const serialized = JSON.stringify(itinerary.days.map((day) => ({
    day_number: day.day_number,
    stops: day.stops.filter((stop) => stop.poi_id).map((stop) => [stop.poi_id, stop.city, stop.latitude, stop.longitude]),
  })));
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function fallbackGroups(itinerary: AccommodationItineraryPayload, tripDays: number): AccommodationGroupRecommendations[] {
  const groups: Array<{ key: string; city: string; days: number[]; poiIds: Set<string>; coordinates: Set<string> }> = [];
  for (const day of [...itinerary.days].sort((left, right) => left.day_number - right.day_number)) {
    const cities = new Map<string, { city: string; stops: Array<{ poi_id?: string | null; latitude?: number | null; longitude?: number | null }> }>();
    for (const stop of day.stops) {
      if (!stop.poi_id || !stop.city) continue;
      const normalized = normalizeCityKey(stop.city);
      const item = cities.get(normalized) || { city: stop.city, stops: [] };
      item.stops.push(stop);
      cities.set(normalized, item);
    }
    for (const [key, data] of cities) {
      const last = groups.length ? groups[groups.length - 1] : undefined;
      const canMerge = last?.key === key && day.day_number <= last.days[last.days.length - 1] + 1;
      const group = canMerge && last ? last : { key, city: data.city, days: [], poiIds: new Set<string>(), coordinates: new Set<string>() };
      if (group !== last) groups.push(group);
      if (!group.days.includes(day.day_number)) group.days.push(day.day_number);
      for (const stop of data.stops) {
        if (!stop.poi_id) continue;
        group.poiIds.add(stop.poi_id);
        if (stop.latitude != null && stop.longitude != null) group.coordinates.add(stop.poi_id);
      }
    }
  }
  return groups.map((group, index) => {
    const nights = group.days.filter((day) => day < Math.max(tripDays, ...group.days)).length;
    return {
      group_id: `${group.key.replace(/\s+/g, '-')}-${group.days[0]}-${group.days[group.days.length - 1]}-${index + 1}`,
      city: group.city,
      area_label: `Theo cụm POI tại ${group.city}`,
      day_numbers: group.days,
      poi_count: group.poiIds.size,
      coordinate_poi_count: group.coordinates.size,
      nights,
      nights_status: 'ESTIMATED' as const,
      status: 'no_data' as const,
      recommendations: [],
      warnings: ['Không nhận được phản hồi recommendation; nhóm này chỉ được suy ra từ itinerary hiện tại.'],
    };
  });
}

function formatNightlyPrice(amount: number, currency?: string | null, unit?: string | null) {
  if (!currency || !unit) return `${amount.toLocaleString('vi-VN')} ${currency || ''}/${unit || 'đơn vị nguồn'}`;
  const normalizedUnit = unit.toUpperCase();
  return normalizedUnit.startsWith(`${currency.toUpperCase()}/`)
    ? `${amount.toLocaleString('vi-VN')} ${unit}`
    : `${amount.toLocaleString('vi-VN')} ${currency}/${unit}`;
}

export default function AccommodationRecommendationsPanel({
  trip,
  itinerary,
  alternativeId,
  onTripUpdate,
  compact = false,
}: Props) {
  const [response, setResponse] = useState<AccommodationRecommendationResponse | null>(null);
  const [responseRequestKey, setResponseRequestKey] = useState('');
  const [responseContextKey, setResponseContextKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorRequestKey, setErrorRequestKey] = useState('');
  const [retry, setRetry] = useState(0);
  const [manualOpen, setManualOpen] = useState<Record<string, boolean>>({});
  const [manualDrafts, setManualDrafts] = useState<Record<string, ManualEntry>>({});
  const [roomCounts, setRoomCounts] = useState<Record<string, string>>({});
  const [submittedRoomCounts, setSubmittedRoomCounts] = useState<Record<string, string>>({});
  const [roomCountErrors, setRoomCountErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const latestRequest = useRef('');
  const counts = humanCounts(trip);
  const humanCount = counts.adults + counts.children + counts.infants;
  const request = useMemo(() => ({
    alternative_id: alternativeId,
    trip: {
      destination: trip.destination || itinerary.days.flatMap((day) => day.stops).find((stop) => stop.city)?.city || '',
      days_count: trip.daysCount || trip.flexibleDays || itinerary.days.length || 1,
      start_date: trip.dateMode === 'flex' ? null : (tripStartDate(trip.startDate) || null),
      end_date: trip.dateMode === 'flex' ? null : (trip.endDate || null),
      date_mode: trip.dateMode || (trip.startDate ? 'dates' as const : 'flex' as const),
      adult_count: counts.adults,
      child_count: counts.children,
      infant_count: counts.infants,
      pet_count: trip.petCount || 0,
      total_budget: trip.totalBudget || null,
      lodging_preference: lodgingPreference(trip.budgetTier),
      room_count: trip.roomCount || null,
      room_counts_by_group: roomCountRequestMap(submittedRoomCounts, alternativeId),
    },
    itinerary: {
      days: itinerary.days.map((day) => ({
        day_number: day.day_number,
        date: day.date,
        stops: day.stops.map((stop) => ({
          poi_id: stop.poi_id,
          city: stop.city,
          latitude: stop.latitude,
          longitude: stop.longitude,
          start_time: stop.start_time,
          end_time: stop.end_time,
        })),
      })),
    },
  }), [
    alternativeId, counts.adults, counts.children, counts.infants, itinerary.days, submittedRoomCounts,
    trip.budgetTier, trip.dateMode, trip.daysCount, trip.destination, trip.endDate,
    trip.flexibleDays, trip.petCount, trip.roomCount, trip.startDate, trip.totalBudget,
  ]);
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const requestContextKey = useMemo(() => {
    const { room_counts_by_group: _roomCountsByGroup, ...tripContext } = request.trip;
    return JSON.stringify({ ...request, trip: tripContext });
  }, [request]);
  const localItinerarySignature = useMemo(() => localSignature(request.itinerary), [request.itinerary]);
  const activeResponse = responseRequestKey === requestKey ? response : null;
  const contextResponse = responseContextKey === requestContextKey ? response : null;
  const activeError = errorRequestKey === requestKey ? error : '';
  const hasSelectedPoi = request.itinerary.days.some((day) => day.stops.some((stop) => stop.poi_id));
  const shouldRequest = Boolean(request.trip.destination && hasSelectedPoi);

  useEffect(() => {
    const controller = new AbortController();
    latestRequest.current = requestKey;
    setError('');
    setErrorRequestKey('');
    if (!shouldRequest) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    void recommendAccommodations(request, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && latestRequest.current === requestKey) {
          setResponse(result);
          setResponseRequestKey(requestKey);
          setResponseContextKey(requestContextKey);
        }
      })
      .catch((reason: Error) => {
        if (controller.signal.aborted || reason.name === 'AbortError') return;
        if (latestRequest.current === requestKey) {
          setError('Chưa tải được dữ liệu lưu trú. Itinerary vẫn nguyên vẹn; bạn có thể thử lại.');
          setErrorRequestKey(requestKey);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && latestRequest.current === requestKey) setLoading(false);
      });
    return () => controller.abort();
  }, [request, requestContextKey, requestKey, retry, shouldRequest]);

  useEffect(() => {
    if (!activeResponse) return;
    setRoomCounts((current) => {
      let next = current;
      for (const group of activeResponse.groups) {
        const key = roomCountDraftKey(alternativeId, group.group_id);
        const selected = currentSelection(trip, group, alternativeId, activeResponse.itinerary_signature);
        if (!current[key] && selected?.roomCount) {
          if (next === current) next = { ...current };
          next[key] = String(selected.roomCount);
        }
      }
      return next;
    });
    setSubmittedRoomCounts((current) => {
      let next = current;
      for (const group of activeResponse.groups) {
        const key = roomCountDraftKey(alternativeId, group.group_id);
        const selected = currentSelection(trip, group, alternativeId, activeResponse.itinerary_signature);
        if (!current[key] && !roomCounts[key] && selected?.roomCount) {
          if (next === current) next = { ...current };
          next[key] = String(selected.roomCount);
        }
      }
      return next;
    });
  }, [activeResponse, alternativeId, roomCounts, trip]);

  const signature = contextResponse?.itinerary_signature || localItinerarySignature;
  const writeSelection = (group: AccommodationGroupRecommendations, selection: Omit<AccommodationGroupSelection, 'groupId' | 'city' | 'dayNumbers' | 'nights' | 'nightsStatus' | 'itineraryVariantId' | 'itinerarySignature'>) => {
    if (!onTripUpdate || !signature) return;
    const plan = saveSelection(trip, group, alternativeId, signature, selection);
    onTripUpdate({ ...trip, accommodationPlan: plan });
  };

  const saveRecommendation = (
    group: AccommodationGroupRecommendations,
    item: AccommodationRecommendationResponse['groups'][number]['recommendations'][number],
    status: 'SELECTED' | 'BOOKED_BY_USER',
  ) => {
    const roomKey = roomCountDraftKey(alternativeId, group.group_id);
    const roomCountDraft = roomCounts[roomKey] ?? submittedRoomCounts[roomKey] ?? '';
    const enteredRoomCount = roomCountDraft.trim() ? Number(roomCountDraft) : trip.roomCount || 0;
    const roomCount = Number.isInteger(enteredRoomCount) && enteredRoomCount >= 1 && enteredRoomCount <= 20
      ? enteredRoomCount
      : 0;
    const total = item.stay.nightly_room_price != null && item.stay.price_unit && roomCount > 0 && group.nights > 0
      ? item.stay.nightly_room_price * roomCount * group.nights
      : undefined;
    writeSelection(group, {
      status,
      stayId: item.stay.stay_id,
      name: item.stay.name,
      address: item.stay.address || undefined,
      latitude: item.stay.latitude ?? undefined,
      longitude: item.stay.longitude ?? undefined,
      nightlyPrice: item.stay.nightly_room_price ?? undefined,
      estimatedTotalCost: total,
      currency: item.stay.currency ?? undefined,
      priceUnit: item.stay.price_unit || undefined,
      priceSource: item.stay.nightly_room_price != null ? 'database' : undefined,
      roomCount: roomCount || undefined,
      averageCoordinateDistanceKm: item.average_coordinate_distance_km ?? undefined,
    });
  };

  const selectRecommendation = (group: AccommodationGroupRecommendations, item: AccommodationRecommendationResponse['groups'][number]['recommendations'][number]) => {
    saveRecommendation(group, item, 'SELECTED');
  };

  const confirmRecommendationBooked = (group: AccommodationGroupRecommendations, item: AccommodationRecommendationResponse['groups'][number]['recommendations'][number]) => {
    saveRecommendation(group, item, 'BOOKED_BY_USER');
  };

  const chooseLater = (group: AccommodationGroupRecommendations) => {
    writeSelection(group, { status: 'CHOOSE_LATER' });
  };

  const applyPreviousSelection = (group: AccommodationGroupRecommendations, previous: AccommodationGroupSelection) => {
    writeSelection(group, {
      status: previous.status,
      stayId: previous.stayId,
      name: previous.name,
      address: previous.address,
      latitude: previous.latitude,
      longitude: previous.longitude,
      nightlyPrice: previous.nightlyPrice,
      estimatedTotalCost: previous.estimatedTotalCost,
      currency: previous.currency,
      priceUnit: previous.priceUnit,
      priceSource: previous.priceSource,
      roomCount: previous.roomCount,
      averageCoordinateDistanceKm: estimateDistance(previous, group, itinerary) ?? previous.averageCoordinateDistanceKm,
    });
  };

  const saveBooked = (group: AccommodationGroupRecommendations) => {
    const formKey = roomCountDraftKey(alternativeId, group.group_id);
    const draft = manualDrafts[formKey] || EMPTY_MANUAL;
    const name = draft.name.trim();
    const address = draft.address.trim();
    const latitude = draft.latitude.trim() ? Number(draft.latitude) : undefined;
    const longitude = draft.longitude.trim() ? Number(draft.longitude) : undefined;
    const price = draft.nightlyPrice.trim() ? Number(draft.nightlyPrice) : undefined;
    const rooms = draft.roomCount.trim() ? Number(draft.roomCount) : undefined;
    let issue = '';
    if (!name) issue = 'Nhập tên nơi lưu trú đã đặt.';
    else if ((latitude === undefined) !== (longitude === undefined)) issue = 'Nhập cả vĩ độ và kinh độ, hoặc để trống cả hai.';
    else if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude! < -180 || longitude! > 180)) issue = 'Tọa độ không hợp lệ.';
    else if (price !== undefined && (!Number.isSafeInteger(price) || price <= 0 || price > 1_000_000_000)) issue = 'Giá/phòng/đêm cần là số VND nguyên dương, tối đa 1 tỷ.';
    else if (rooms !== undefined && (!Number.isInteger(rooms) || rooms < 1 || rooms > 20)) issue = 'Số phòng cần từ 1 đến 20.';
    setValidationErrors((current) => ({ ...current, [formKey]: issue }));
    if (issue) return;
    const estimatedTotalCost = price !== undefined && rooms !== undefined && group.nights > 0
      ? price * rooms * group.nights
      : undefined;
    writeSelection(group, {
      status: 'BOOKED_BY_USER',
      name,
      address: address || undefined,
      latitude,
      longitude,
      nightlyPrice: price,
      estimatedTotalCost,
      currency: price !== undefined ? 'VND' : undefined,
      priceUnit: price !== undefined ? 'VND/room/night' : undefined,
      priceSource: price !== undefined ? 'user' : undefined,
      roomCount: rooms,
      averageCoordinateDistanceKm: latitude !== undefined
        ? estimateDistance({ latitude, longitude }, group, itinerary) ?? undefined
        : undefined,
    });
    setManualOpen((current) => ({ ...current, [formKey]: false }));
  };

  const commitRoomCount = (group: AccommodationGroupRecommendations, key: string) => {
    const raw = (roomCounts[key] || '').trim();
    if (!raw) {
      setRoomCountErrors((current) => ({ ...current, [key]: '' }));
      setSubmittedRoomCounts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    const roomCount = Number(raw);
    if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 20) {
      setRoomCountErrors((current) => ({ ...current, [key]: 'Số phòng cần là số nguyên từ 1 đến 20.' }));
      setSubmittedRoomCounts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setRoomCountErrors((current) => ({ ...current, [key]: '' }));
    setSubmittedRoomCounts((current) => ({ ...current, [key]: raw }));
  };

  const groups = contextResponse?.groups || (activeError ? fallbackGroups(request.itinerary, request.trip.days_count) : []);
  return (
    <section className={`rounded-2xl border border-neutral-200 bg-white ${compact ? 'p-3' : 'p-4 sm:p-5'}`} aria-label="Lưu trú theo itinerary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900"><BedDouble size={18} aria-hidden="true" /> Lưu trú cho phương án đang xem</h3>
          <p className="mt-1 text-xs text-neutral-700">Tính theo nhóm POI liên tiếp cùng thành phố · phương án {alternativeId}</p>
          {trip.totalBudget != null && <p className="mt-1 text-xs text-neutral-700">Ngân sách toàn chuyến không được xem là ngân sách khách sạn riêng.</p>}
        </div>
        {activeError && <button type="button" onClick={() => setRetry((value) => value + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium underline"><RefreshCw size={14} /> Thử lại</button>}
      </div>

      {(loading || (shouldRequest && !activeResponse && !activeError)) && <p role="status" className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{contextResponse ? 'Đang cập nhật xếp hạng theo số phòng…' : 'Đang tải bản ghi lưu trú trong catalogue…'}</p>}
      {activeError && <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-neutral-900">{activeError}</p>}
      {activeError && contextResponse && <p role="status" className="mt-2 text-xs text-neutral-700">Các gợi ý bên dưới là kết quả tải trước; GreenTrip chưa cập nhật xếp hạng theo số phòng mới.</p>}
      {!loading && !shouldRequest && !activeError && <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">Chưa có POI có thành phố hoặc chưa xác định được điểm đến để gợi ý nơi lưu trú. Bạn vẫn có thể tiếp tục và chọn sau.</p>}
      {!loading && !activeError && contextResponse?.status === 'no_data' && (
        <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">Chưa có bản ghi lưu trú thật trong catalogue cho khu vực của itinerary. GreenTrip không tạo khách sạn mẫu; bạn có thể khai báo nơi đã đặt hoặc chọn sau.</p>
      )}

      <div className="mt-3 space-y-3">
        {groups.map((group) => {
          const selected = currentSelection(trip, group, alternativeId, signature);
          const previous = staleSelection(trip, group, alternativeId, signature);
          const selectedDailyLegs = selected && selected.status !== 'CHOOSE_LATER'
            ? estimateDailyStayLegs(selected, group, itinerary)
            : [];
          const roomKey = roomCountDraftKey(alternativeId, group.group_id);
          const hasRoomDraft = Object.prototype.hasOwnProperty.call(roomCounts, roomKey);
          const savedRooms = hasRoomDraft ? roomCounts[roomKey] : selected?.roomCount ? String(selected.roomCount) : '';
          const savedManualEntry: ManualEntry = selected?.status === 'BOOKED_BY_USER'
            ? {
              name: selected.name || '',
              address: selected.address || '',
              latitude: selected.latitude == null ? '' : String(selected.latitude),
              longitude: selected.longitude == null ? '' : String(selected.longitude),
              nightlyPrice: selected.nightlyPrice == null ? '' : String(selected.nightlyPrice),
              roomCount: selected.roomCount == null ? '' : String(selected.roomCount),
            }
            : EMPTY_MANUAL;
          const draft = manualDrafts[roomKey] || savedManualEntry;
          const updateManual = (key: keyof ManualEntry, value: string) => setManualDrafts((current) => ({
            ...current,
            [roomKey]: { ...(current[roomKey] || savedManualEntry), [key]: value },
          }));
          return (
            <article key={group.group_id} className="rounded-xl border border-neutral-200 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-neutral-900">{group.area_label}</p>
                  <p className="mt-1 text-xs text-neutral-700">Ngày {group.day_numbers.join(', ')} · {group.poi_count} POI · {group.nights} đêm {group.nights_status === 'ESTIMATED' ? '(ước tính)' : ''}</p>
                </div>
                {selected && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">{statusText(selected.status)}</span>}
              </div>

              {group.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-neutral-700">{warning}</p>)}
              {selected && selected.status !== 'CHOOSE_LATER' && (
                <div className="mt-3 rounded-xl bg-emerald-50/70 p-3 text-sm">
                  <p className="font-semibold text-neutral-900">{selected.name}</p>
                  {selected.address && <p className="mt-1 text-neutral-700">{selected.address}</p>}
                  {selected.averageCoordinateDistanceKm != null && <p className="mt-1 text-xs text-neutral-700">Khoảng cách tọa độ trung bình tới nhóm POI: {selected.averageCoordinateDistanceKm.toFixed(1)} km · không phải ETA đường bộ.</p>}
                  {selectedDailyLegs.length > 0 && <p className="mt-1 text-xs text-neutral-700">
                    Ước tính khoảng cách tọa độ chỗ ở ↔ POI đầu/cuối mỗi ngày:{' '}
                    {selectedDailyLegs.map((day) => `ngày ${day.dayNumber}: ${day.fromStayKm == null ? 'chưa rõ' : `${day.fromStayKm.toFixed(1)} km`} / ${day.toStayKm == null ? 'chưa rõ' : `${day.toStayKm.toFixed(1)} km`}`).join(' · ')}.
                    {' '}Đây không phải tuyến đường hoặc ETA; chưa thể kiểm tra xung đột giờ tham quan.
                  </p>}
                        {selected.nightlyPrice != null && <p className="mt-1 text-xs text-neutral-700">{formatNightlyPrice(selected.nightlyPrice, selected.currency, selected.priceUnit)}</p>}
                  {selected.estimatedTotalCost != null && <p className="mt-1 text-xs text-neutral-700">Tổng lưu trú ước tính: {selected.estimatedTotalCost.toLocaleString('vi-VN')} {selected.currency} · chưa gồm phụ phí chưa biết.</p>}
                  <p className="mt-1 text-xs text-neutral-700">Không xác nhận availability; itinerary chưa bị thay đổi.</p>
                </div>
              )}

              {previous && !selected && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="font-medium">Đã lưu “{previous.name || previous.city}” cho phương án {previous.itineraryVariantId}. Chưa tự gắn vào phương án này.</p>
                  <button type="button" disabled={!onTripUpdate || !signature} onClick={() => applyPreviousSelection(group, previous)} className="mt-2 min-h-11 rounded-full border border-neutral-400 px-4 text-sm font-semibold disabled:opacity-50">Xác nhận dùng cho phương án này</button>
                </div>
              )}

              <label className="mt-3 block text-xs text-neutral-700">
                Số phòng (nếu đã biết; chỉ dùng để ước tính)
                <input type="number" min="1" max="20" value={savedRooms} onChange={(event) => setRoomCounts((current) => ({ ...current, [roomKey]: event.target.value }))} onBlur={() => commitRoomCount(group, roomKey)} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-900" />
                {roomCountErrors[roomKey] && <span role="alert" className="mt-1 block text-xs text-red-800">{roomCountErrors[roomKey]}</span>}
              </label>

              {!!group.recommendations.length && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.recommendations.map((item) => {
                  const total = item.stay.nightly_room_price != null && item.stay.price_unit && Number(savedRooms) > 0 && group.nights > 0
                    ? item.stay.nightly_room_price * Number(savedRooms) * group.nights
                    : null;
                  return (
                    <article key={item.stay.stay_id} className="overflow-hidden rounded-xl border border-neutral-200">
                      {item.stay.image_url ? <img src={item.stay.image_url} alt={item.stay.name} loading="lazy" className="h-36 w-full object-cover" /> : <div className="flex h-20 items-center justify-center bg-neutral-50 text-neutral-500"><BedDouble size={24} aria-hidden="true" /></div>}
                      <div className="space-y-1.5 p-3">
                        <div className="flex items-start justify-between gap-2"><p className="font-semibold text-neutral-900">{item.stay.name}</p>{item.match_score != null ? <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold">{item.match_score.toFixed(0)}% phù hợp</span> : <span className="text-xs text-neutral-600">Chưa xếp hạng</span>}</div>
                        <p className="text-xs text-neutral-700">{item.stay.city}{item.stay.address ? ` · ${item.stay.address}` : ''}</p>
                        <p className="text-xs text-neutral-700">{item.stay.nightly_room_price != null ? formatNightlyPrice(item.stay.nightly_room_price, item.stay.currency, item.stay.price_unit) : 'Chưa có giá/phòng/đêm xác minh'}</p>
                        {total != null && <p className="text-xs font-medium text-neutral-800">Tổng ước tính: {total.toLocaleString('vi-VN')} {item.stay.currency} · {savedRooms} phòng × {group.nights} đêm</p>}
                        {item.average_coordinate_distance_km != null && <p className="flex items-center gap-1 text-xs text-neutral-700"><MapPin size={12} aria-hidden="true" /> Trung bình {item.average_coordinate_distance_km.toFixed(1)} km theo tọa độ tới cụm POI</p>}
                        {item.stay.rating != null && <p className="text-xs text-neutral-700">Đánh giá nguồn: {item.stay.rating.toFixed(1)}{item.stay.review_count != null ? ` · ${item.stay.review_count} nhận xét` : ''}</p>}
                        {!!item.stay.amenities.length && <p className="text-xs text-neutral-700">Tiện nghi theo catalogue: {item.stay.amenities.join(', ')}</p>}
                        {!!item.stay.room_types.length && <p className="text-xs text-neutral-700">Loại phòng theo catalogue: {item.stay.room_types.join(', ')}</p>}
                        {(item.stay.check_in || item.stay.check_out) && <p className="text-xs text-neutral-700">Giờ nguồn ghi nhận: nhận phòng {item.stay.check_in || 'chưa rõ'} · trả phòng {item.stay.check_out || 'chưa rõ'}</p>}
                        {item.stay.sustainability_evidence && <p className="text-xs text-neutral-700">Bằng chứng bền vững đã xác minh: {item.stay.sustainability_evidence}</p>}
                        {item.stay.max_guests_per_room != null ? <p className="text-xs text-neutral-700">
                          {`Tối đa ${item.stay.max_guests_per_room} khách/phòng theo dữ liệu.`}
                          {Number(savedRooms) > 0 ? ` Với ${savedRooms} phòng, sức chứa ghi nhận tối đa ${item.stay.max_guests_per_room * Number(savedRooms)} người cho nhóm ${humanCount} người lớn, trẻ em và trẻ sơ sinh.` : ' Nhập số phòng để đối chiếu với số du khách.'}
                          {' '}Thú cưng không tính là người; chính sách tiếp nhận cần xác nhận với nơi lưu trú.
                        </p> : <p className="text-xs text-neutral-700">Chưa có dữ liệu sức chứa.</p>}
                        <details className="text-xs text-neutral-700"><summary className="min-h-10 cursor-pointer font-medium">Lý do và độ đầy đủ dữ liệu</summary><ul className="list-disc space-y-1 pl-5">{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-1">Nguồn: {item.stay.data_source}{item.stay.updated_at ? ` · Cập nhật ${item.stay.updated_at}` : ''}</p></details>
                        {item.stay.website_url && <a href={item.stay.website_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm underline">Xem chi tiết <ExternalLink size={13} /></a>}
                        <button type="button" disabled={!onTripUpdate || !signature || responseRequestKey !== requestKey} onClick={() => selectRecommendation(group, item)} className="min-h-11 w-full rounded-full bg-neutral-950 px-4 text-sm font-semibold text-white disabled:opacity-50">Chọn cho phương án này</button>
                        <button type="button" disabled={!onTripUpdate || !signature || responseRequestKey !== requestKey} onClick={() => confirmRecommendationBooked(group, item)} className="min-h-11 w-full rounded-full border border-neutral-400 px-4 text-sm font-semibold text-neutral-900 disabled:opacity-50">Tôi đã đặt nơi này</button>
                      </div>
                    </article>
                  );
                })}
              </div>}

              <details open={manualOpen[roomKey] || false} onToggle={(event) => setManualOpen((current) => ({ ...current, [roomKey]: (event.currentTarget as HTMLDetailsElement).open }))} className="mt-3 rounded-xl border border-neutral-200 px-3">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Tôi đã đặt khách sạn</summary>
                <div className="grid gap-2 pb-3 sm:grid-cols-2">
                  <label className="text-xs text-neutral-700">Tên nơi lưu trú<input value={draft.name} onChange={(event) => updateManual('name', event.target.value)} maxLength={200} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm" /></label>
                  <label className="text-xs text-neutral-700 sm:col-span-2">Địa chỉ (không tự geocode)<input value={draft.address} onChange={(event) => updateManual('address', event.target.value)} maxLength={500} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm" /></label>
                  <label className="text-xs text-neutral-700">Vĩ độ (tùy chọn)<input inputMode="decimal" value={draft.latitude} onChange={(event) => updateManual('latitude', event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm" /></label>
                  <label className="text-xs text-neutral-700">Kinh độ (tùy chọn)<input inputMode="decimal" value={draft.longitude} onChange={(event) => updateManual('longitude', event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm" /></label>
                  <label className="text-xs text-neutral-700">Giá/phòng/đêm VND (tùy chọn)<input type="number" min="1" step="1" value={draft.nightlyPrice} onChange={(event) => updateManual('nightlyPrice', event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm" /></label>
                  <label className="text-xs text-neutral-700">Số phòng (tùy chọn)<input type="number" min="1" max="20" value={draft.roomCount} onChange={(event) => updateManual('roomCount', event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm" /></label>
                  {validationErrors[roomKey] && <p role="alert" className="text-xs text-red-800 sm:col-span-2">{validationErrors[roomKey]}</p>}
                  <p className="text-xs text-neutral-700 sm:col-span-2">Chỉ lưu thông tin bạn nhập; không tạo booking record, không xác nhận availability, không suy ra tọa độ từ địa chỉ.</p>
                  <button type="button" disabled={!onTripUpdate || !signature} onClick={() => saveBooked(group)} className="min-h-11 rounded-full bg-neutral-950 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Lưu là đã đặt bởi bạn</button>
                </div>
              </details>
              <button type="button" disabled={!onTripUpdate || !signature} onClick={() => chooseLater(group)} className="mt-2 min-h-11 rounded-xl px-3 text-sm font-medium text-neutral-700 underline disabled:opacity-50">Tôi sẽ chọn sau</button>
            </article>
          );
        })}
      </div>
      {contextResponse?.limitations.map((item) => <p key={item} className="mt-2 text-xs text-neutral-700">{item}</p>)}
      {!onTripUpdate && <p className="mt-2 text-xs text-amber-900">Mở Workspace đã lưu để thay đổi và lưu lựa chọn lưu trú.</p>}
    </section>
  );
}

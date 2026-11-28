import type { DestinationScope, DurationDays, ItineraryDayPlan, PlaceCatalogItem } from '@/data/landingSampleModel';
import type { UserTrip } from '@/pages/ExplorePage';
import { dateAt, vietnamNow } from '@/utils/tripDates';
import { getAccessToken } from '@/services/auth';
import { saveTripItineraryWithStatus, stopFromPoi, type TripItinerary } from '@/services/itineraryService';

export interface SampleTripDetails {
  startDate: string;
  peopleCount: number;
  totalBudget?: number;
}

export function validateSampleDetails(details: SampleTripDetails, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.startDate) || dateAt(details.startDate) !== details.startDate || details.startDate < vietnamNow(now).date) {
    throw new Error('Chọn ngày bắt đầu từ hôm nay trở đi.');
  }
  if (!Number.isInteger(details.peopleCount) || details.peopleCount < 1 || details.peopleCount > 20) {
    throw new Error('Số người cần từ 1 đến 20.');
  }
  if (details.totalBudget !== undefined && (!Number.isFinite(details.totalBudget) || details.totalBudget < 0 || details.totalBudget > 100_000_000_000)) {
    throw new Error('Ngân sách dự kiến không hợp lệ.');
  }
}

export interface SampleDraft {
  details?: SampleTripDetails;
  plan: ItineraryDayPlan[];
  places: PlaceCatalogItem[];
  destination: DestinationScope;
  days: DurationDays;
}

export function sampleTripPayload(draft: SampleDraft, id: string, now = new Date()): { trip: UserTrip; itinerary: TripItinerary } {
  if (draft.details) validateSampleDetails(draft.details, now);
  const { details } = draft;
  const current = vietnamNow(now);
  const lookup = new Map(draft.places.map((p) => [p.id, p]));
  const ids = draft.plan.flatMap((d) => d.stops.map((s) => s.placeId));
  if (!ids.length || ids.some((placeId) => !lookup.has(placeId)) || new Set(ids).size !== ids.length) {
    throw new Error('Lịch có địa điểm thiếu hoặc trùng. Hãy kiểm tra lại.');
  }
  const destination = draft.destination === 'danang' ? 'Đà Nẵng' : draft.destination === 'hue' ? 'Huế' : 'Đà Nẵng & Huế';
  const coverImage = lookup.get(ids[0])?.photos[0]?.src;
  const trip: UserTrip = {
    id,
    title: `${destination} · ${draft.days} ngày`,
    destination,
    daysCount: draft.days,
    startDate: details?.startDate,
    peopleCount: details?.peopleCount ?? 2,
    totalBudget: details?.totalBudget,
    createdAt: new Date().toISOString(),
    ideas: ids,
    savedPlaces: [],
    image: coverImage,
    coverImage,
    status: details ? 'upcoming' : 'draft',
    notes: 'Từ lịch tham khảo GreenTrip, giữ nguyên các điểm và thứ tự đã chỉnh. Kiểm tra giờ mở cửa và thời gian di chuyển trước khi đi.',
  };
  const itinerary: TripItinerary = {
    trip_id: id,
    title: trip.title,
    destination,
    start_date: details?.startDate ?? null,
    days_count: draft.days,
    days: draft.plan.map((day) => ({
      day_id: `${id}-day-${day.dayNumber}`,
      day_number: day.dayNumber,
      date: details ? dateAt(details.startDate, day.dayNumber - 1) : null,
      title: day.title,
      stops: day.stops.map((stop, index) => {
        const time = stop.timeSlot?.match(/(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})/);
        const pastTime =
          Boolean(details) &&
          dateAt(details!.startDate, day.dayNumber - 1) === current.date &&
          Boolean(time) &&
          Number(time![1].slice(0, 2)) * 60 + Number(time![1].slice(3)) < current.minutes;
        return {
          ...stopFromPoi(lookup.get(stop.placeId)!.poi),
          stop_id: `${id}-${day.dayNumber}-${stop.placeId}`,
          sequence: index,
          start_time: pastTime ? null : time?.[1] || null,
          end_time: pastTime ? null : time?.[2] || null,
          duration_minutes: null,
          comment: 'Giờ tham khảo; cần kiểm tra trước khi đi.',
        };
      }),
    })),
  };
  return { trip, itinerary };
}

export async function saveLandingSample(draft: SampleDraft, id: string, token: string) {
  const checkSession = () => {
    if (!token || token !== getAccessToken()) {
      throw new Error('Tài khoản đã thay đổi. Bản lịch đang chỉnh vẫn được giữ.');
    }
  };
  checkSession();
  const { trip, itinerary } = sampleTripPayload(draft, id);
  const result = await saveTripItineraryWithStatus(itinerary);
  if (result.syncStatus !== 'synced') {
    throw new Error(result.syncMessage || 'Chuyến đi vẫn là bản nháp trên thiết bị, chưa đồng bộ lên tài khoản.');
  }
  checkSession();
  return trip;
}

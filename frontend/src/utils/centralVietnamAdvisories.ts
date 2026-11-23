import type { Poi } from '@/data/pois';
import type { UserTrip } from '@/pages/ExplorePage';
import type { TripItinerary } from '@/services/itineraryService';
import { inferWeatherSeasonFromTrip } from '@/utils/tripExportAndChecklist';

export type CentralAdvisoryId =
  | 'hue-daytrip-pacing'
  | 'rainy-season-central'
  | 'beach-rip-current';

export interface CentralVietnamAdvisory {
  id: CentralAdvisoryId;
  severity: 'info' | 'warning';
  title: string;
  message: string;
  actionLabel?: string;
  actionType?: 'open-checklist' | 'add-hue-day';
}

const BEACH_KEYWORDS = [
  'mỹ khê',
  'my khe',
  'non nước',
  'non nuoc',
  'bãi biển',
  'bai bien',
  'sơn trà',
  'son tra',
  'nam ô',
  'nam o',
  'xuân thiều',
  'xuan thieu',
  'bãi bụt',
  'bãi rạng',
  'lăng cô',
];

function isHueCityText(raw?: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized.includes('huế') || normalized.includes('hue');
}

function isDaNangCityText(raw?: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized.includes('đà nẵng') || normalized.includes('da nang') || normalized.includes('danang');
}

function isBeachStopText(text: string): boolean {
  const lower = text.toLowerCase();
  return BEACH_KEYWORDS.some((kw) => lower.includes(kw));
}

export function evaluateCentralVietnamAdvisories(
  trip: Pick<UserTrip, 'destination' | 'startDate' | 'flexibleMonth' | 'daysCount'>,
  plan?: Pick<TripItinerary, 'days_count' | 'days' | 'destination'> | null,
  allPois: Poi[] = []
): CentralVietnamAdvisory[] {
  const advisories: CentralVietnamAdvisory[] = [];
  const poiById = new Map(allPois.map((p) => [p.id, p]));
  const destText = `${trip.destination || ''} ${plan?.destination || ''}`.trim();
  const totalDays = Math.max(1, plan?.days?.length || plan?.days_count || trip.daysCount || 1);

  let hueDays = 0;
  let danangDays = 0;
  let hasHueStop = false;
  let hasDaNangStop = false;
  let hasBeachStop = false;

  (plan?.days ?? []).forEach((day) => {
    let dayHasHue = isHueCityText(day.title);
    let dayHasDaNang = isDaNangCityText(day.title);

    day.stops.forEach((stop) => {
      if (stop.stop_type === 'rest') return;
      const matched = stop.poi_id ? poiById.get(stop.poi_id) : undefined;
      const city = stop.city || matched?.city || '';
      if (isHueCityText(city)) {
        dayHasHue = true;
        hasHueStop = true;
      }
      if (isDaNangCityText(city)) {
        dayHasDaNang = true;
        hasDaNangStop = true;
      }
      const beachProbe = `${stop.title} ${stop.address ?? ''} ${matched?.name ?? ''}`;
      if (isBeachStopText(beachProbe)) {
        hasBeachStop = true;
      }
    });

    if (dayHasHue) hueDays += 1;
    if (dayHasDaNang) danangDays += 1;
  });

  const mentionsHue = isHueCityText(destText) || hasHueStop;
  const mentionsDaNang = isDaNangCityText(destText) || hasDaNangStop || isDaNangCityText(trip.destination);

  // 1. Nhắc nhẹ nếu đi Huế chỉ 1 ngày từ Đà Nẵng
  const isSingleDayHueFromDaNang =
    (mentionsHue && totalDays === 1) ||
    (hueDays === 1 && (danangDays >= 1 || mentionsDaNang));

  if (isSingleDayHueFromDaNang) {
    advisories.push({
      id: 'hue-daytrip-pacing',
      severity: 'info',
      title: 'Gợi ý nhịp đi Huế thong thả hơn',
      message:
        'Đi Huế trong ngày từ Đà Nẵng dễ mất 4–5 giờ di chuyển và phải chạy sô qua Đại Nội, Lăng tẩm. Nếu sắp xếp được, bạn nên ở lại Huế 1–2 đêm để cảm nhận trọn vẹn hơn.',
      actionLabel: 'Thêm 1 ngày cho Huế',
      actionType: 'add-hue-day',
    });
  }

  // 2. Mùa mưa miền Trung (tháng 9 đến tháng 1) -> áo mưa bộ, giày chống thấm & sóng biển
  const season = inferWeatherSeasonFromTrip(trip);
  if (season === 'rainy') {
    const seaNote = mentionsDaNang || !mentionsHue
      ? ' Khi tắm biển Đà Nẵng mùa này cần chú ý sóng lớn, dòng chảy xa bờ (rip currents) và cờ cảnh báo cứu hộ.'
      : '';
    advisories.push({
      id: 'rainy-season-central',
      severity: 'warning',
      title: 'Lưu ý mùa mưa miền Trung (Tháng 9 – Tháng 1)',
      message: `Hệ thống đã tự thêm áo mưa bộ 2 mảnh và giày/sandal chống thấm vào Hành trang xanh.${seaNote}`,
      actionLabel: 'Mở Hành trang xanh',
      actionType: 'open-checklist',
    });
  } else if (hasBeachStop && mentionsDaNang) {
    // 3. Nhắc an toàn biển Đà Nẵng khi lịch trình có điểm bãi biển ngoài mùa mưa
    advisories.push({
      id: 'beach-rip-current',
      severity: 'info',
      title: 'Lưu ý an toàn khi tắm biển Đà Nẵng',
      message:
        'Biển Đà Nẵng có thể xuất hiện sóng lớn và dòng chảy xa bờ (rip currents) vào cuối ngày. Hãy bơi gần khu vực có lực lượng cứu hộ và đi cùng bạn đồng hành.',
    });
  }

  return advisories;
}

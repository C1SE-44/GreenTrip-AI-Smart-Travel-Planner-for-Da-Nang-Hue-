import {
  parseStartDateFromTrip,
  type ItineraryDay,
  type ItineraryStop,
  type TripItinerary,
} from '@/services/itineraryService';
import type { UserTrip } from '@/pages/ExplorePage';

export type WeatherSeason = 'sunny' | 'rainy';

export interface EcoPackingItem {
  id: string;
  label: string;
  hint: string;
  group: 'green-core' | 'weather' | 'culture';
  season?: WeatherSeason;
}

export interface PackingChecklistState {
  checkedIds: string[];
  season: WeatherSeason;
}

const PACKING_STORAGE_PREFIX = 'greentrip_packing_';

export const ECO_PACKING_ITEMS: EcoPackingItem[] = [
  {
    id: 'refill-bottle',
    label: 'Bình nước cá nhân nạp lại',
    hint: 'Giảm 6–10 chai nhựa dùng một lần suốt hành trình',
    group: 'green-core',
  },
  {
    id: 'tote-bag',
    label: 'Túi vải tote gấp gọn',
    hint: 'Dùng khi mua đặc sản ở Chợ Hàn, Chợ Cồn, Chợ Đông Ba',
    group: 'green-core',
  },
  {
    id: 'eco-cutlery',
    label: 'Bộ thìa đũa & ống hút tái sử dụng',
    hint: 'Tiện dùng cho đồ ăn đường phố, nước mía, chè Huế',
    group: 'green-core',
  },
  {
    id: 'reef-sunscreen',
    label: 'Kem chống nắng thân thiện san hô (Reef-safe)',
    hint: 'Bảo vệ hệ sinh thái biển Mỹ Khê, Sơn Trà & Cù Lao Chàm',
    group: 'green-core',
  },
  {
    id: 'modest-attire',
    label: 'Trang phục lịch sự (áo có tay, quần/váy qua gối)',
    hint: 'Bắt buộc khi vào Đại Nội Huế, Lăng tẩm, Chùa Thiên Mụ & Linh Ứng',
    group: 'culture',
  },
  {
    id: 'walking-shoes',
    label: 'Giày đi bộ êm nhẹ',
    hint: 'Phù hợp đi bộ dạo phố cổ, bờ sông Hương & leo bậc Ngũ Hành Sơn',
    group: 'culture',
  },
  // Mùa mưa Miền Trung (Tháng 9 – Tháng 1)
  {
    id: 'rain-suit-2piece',
    label: 'Áo mưa bộ 2 mảnh (áo + quần)',
    hint: 'Chống ướt tốt hơn áo mưa giấy khi mưa tạt lớn ở Đà Nẵng, Huế hoặc qua đèo Hải Vân',
    group: 'weather',
    season: 'rainy',
  },
  {
    id: 'waterproof-shoes',
    label: 'Giày hoặc sandal chống thấm, chống trượt',
    hint: 'Giữ khô chân khi đi mưa và bám chắc trên sân gạch rêu ở Đại Nội, Lăng tẩm Huế',
    group: 'weather',
    season: 'rainy',
  },
  {
    id: 'compact-umbrella',
    label: 'Ô gập chống gió dự phòng',
    hint: 'Dự phòng mưa rào bất chợt đặc trưng tại Huế & Đèo Hải Vân',
    group: 'weather',
    season: 'rainy',
  },
  {
    id: 'waterproof-pouch',
    label: 'Túi chống nước điện thoại & bọc giày',
    hint: 'Giữ khô thiết bị và thoải mái khi tham quan sân gạch Lăng tẩm',
    group: 'weather',
    season: 'rainy',
  },
  {
    id: 'light-windbreaker',
    label: 'Áo khoác gió mỏng giữ ấm',
    hint: 'Buổi tối ven sông Hàn/sông Hương hoặc qua đèo se lạnh',
    group: 'weather',
    season: 'rainy',
  },
  // Mùa nắng / biển (Tháng 1 – Tháng 8)
  {
    id: 'sun-hat-glasses',
    label: 'Mũ rộng vành & kính râm chống tia UV',
    hint: 'Che nắng gắt buổi trưa miền Trung khi tham quan ngoài trời',
    group: 'weather',
    season: 'sunny',
  },
  {
    id: 'swimwear-microfiber',
    label: 'Đồ bơi & khăn microfiber nhanh khô',
    hint: 'Gọn nhẹ, ít tốn nước giặt cho lịch trình tắm biển/suối',
    group: 'weather',
    season: 'sunny',
  },
];

const FALLBACK_SLOT_STARTS_MINUTES = [
  8 * 60 + 30,
  11 * 60 + 30,
  14 * 60 + 30,
  18 * 60 + 30,
  20 * 60 + 30,
];

const UTF8_ENCODER = new TextEncoder();

export function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function foldIcsLine(line: string, maxBytes: number = 75): string {
  if (UTF8_ENCODER.encode(line).length <= maxBytes) return line;
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = maxBytes;

  for (const ch of line) {
    const chBytes = UTF8_ENCODER.encode(ch).length;
    if (currentBytes + chBytes > limit && current.length > 0) {
      chunks.push(current);
      current = ` ${ch}`;
      currentBytes = 1 + chBytes;
      limit = maxBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n');
}

function pad2(num: number): string {
  return String(num).padStart(2, '0');
}

function addDaysToIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

function resolveDayIsoDate(day: ItineraryDay, tripStartDate?: string | null): string {
  if (day.date && /^\d{4}-\d{2}-\d{2}$/.test(day.date.trim())) {
    return day.date.trim();
  }
  const meta = parseStartDateFromTrip(tripStartDate);
  const baseIso = `${meta.year}-${pad2(meta.month)}-${pad2(meta.day)}`;
  return addDaysToIsoDate(baseIso, Math.max(0, day.day_number - 1));
}

function parseMinutesStrict(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatIcsLocalDateTime(isoDate: string, totalMinutes: number): string {
  const dayShift = Math.floor(totalMinutes / (24 * 60));
  const minsInDay = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const targetIso = dayShift === 0 ? isoDate : addDaysToIsoDate(isoDate, dayShift);
  const hh = Math.floor(minsInDay / 60);
  const mm = minsInDay % 60;
  return `${targetIso.replace(/-/g, '')}T${pad2(hh)}${pad2(mm)}00`;
}

function formatUtcTimestamp(now: Date): string {
  return `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(
    now.getUTCHours()
  )}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
}

function resolveStopMinutes(
  stop: ItineraryStop,
  idx: number,
  prevEndMinutes: number
): { start: number; end: number } {
  const parsedStart = parseMinutesStrict(stop.start_time);
  const duration = stop.duration_minutes && stop.duration_minutes > 0 ? stop.duration_minutes : 90;

  let start: number;
  if (parsedStart !== null) {
    start = parsedStart;
  } else if (idx < FALLBACK_SLOT_STARTS_MINUTES.length) {
    start = Math.max(FALLBACK_SLOT_STARTS_MINUTES[idx], prevEndMinutes > 0 ? prevEndMinutes + 15 : 0);
  } else {
    start = Math.min(21 * 60 + 30, Math.max(8 * 60 + 30, prevEndMinutes + 15));
  }

  const parsedEnd = parseMinutesStrict(stop.end_time);
  const end = parsedEnd !== null && parsedEnd > start ? parsedEnd : start + duration;
  return { start, end };
}

function sanitizeUidToken(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'item';
}

export function buildTripIcs(
  plan: TripItinerary,
  trip?: Pick<UserTrip, 'id' | 'title' | 'destination' | 'startDate'>,
  now: Date = new Date()
): string {
  const tripTitle = (trip?.title || plan.title || `Chuyến đi ${plan.destination || 'Đà Nẵng & Huế'}`).trim();
  const destination = (trip?.destination || plan.destination || 'Đà Nẵng & Huế').trim();
  const startDateRef = trip?.startDate || plan.start_date;
  const dtStamp = formatUtcTimestamp(now);
  const safeTripId = sanitizeUidToken(trip?.id || plan.trip_id || 'trip');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GreenTrip AI//Smart Travel Planner//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(tripTitle)}`,
    'X-WR-TIMEZONE:Asia/Ho_Chi_Minh',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Ho_Chi_Minh',
    'X-LIC-LOCATION:Asia/Ho_Chi_Minh',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'TZNAME:+07',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  plan.days.forEach((day) => {
    const dayIso = resolveDayIsoDate(day, startDateRef);
    let prevEnd = 0;

    day.stops.forEach((stop, idx) => {
      const { start, end } = resolveStopMinutes(stop, idx, prevEnd);
      prevEnd = end;

      const summaryPrefix = stop.stop_type === 'rest' ? 'Nghỉ ngơi' : `Ngày ${day.day_number}`;
      const summary = `${summaryPrefix}: ${stop.title}`;
      const locationParts = [stop.address, stop.city].filter((p): p is string => Boolean(p && p.trim()));
      const location = locationParts.length > 0 ? locationParts.join(', ') : destination;

      const descLines = [
        `Chuyến đi: ${tripTitle}`,
        `Ngày ${day.day_number}${day.title ? ` — ${day.title}` : ''}`,
        stop.category ? `Danh mục: ${stop.category}` : null,
        stop.comment ? `Ghi chú: ${stop.comment}` : null,
        'Tạo bởi GreenTrip AI (Du lịch xanh Đà Nẵng – Huế)',
      ].filter((item): item is string => Boolean(item));

      const uid = `${safeTripId}-d${day.day_number}-s${idx + 1}-${sanitizeUidToken(stop.stop_id)}@greentrip.ai`;

      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;TZID=Asia/Ho_Chi_Minh:${formatIcsLocalDateTime(dayIso, start)}`,
        `DTEND;TZID=Asia/Ho_Chi_Minh:${formatIcsLocalDateTime(dayIso, end)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `LOCATION:${escapeIcsText(location)}`,
        `DESCRIPTION:${escapeIcsText(descLines.join('\n'))}`,
        'END:VEVENT'
      );
    });
  });

  lines.push('END:VCALENDAR');
  return `${lines.map((line) => foldIcsLine(line)).join('\r\n')}\r\n`;
}

export function downloadTripIcs(
  plan: TripItinerary,
  trip?: Pick<UserTrip, 'id' | 'title' | 'destination' | 'startDate'>
): { filename: string; eventCount: number } {
  const icsContent = buildTripIcs(plan, trip);
  const eventCount = plan.days.reduce((sum, day) => sum + day.stops.length, 0);
  const slugBase = (trip?.title || plan.title || 'greentrip-lich-trinh')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const filename = `${slugBase || 'greentrip-lich-trinh'}.ics`;

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, eventCount };
}

export function inferWeatherSeasonFromTrip(
  trip?: Pick<UserTrip, 'startDate' | 'flexibleMonth'>
): WeatherSeason {
  const rawMonthSource = (trip?.startDate || trip?.flexibleMonth || '').trim();
  const monthOnlyMatch = rawMonthSource.match(/^(?:thg|tháng)\s*(\d{1,2})/i);
  const month = monthOnlyMatch
    ? Number(monthOnlyMatch[1])
    : parseStartDateFromTrip(rawMonthSource).month;
  // Mùa mưa miền Trung (Đà Nẵng – Huế) kéo dài từ tháng 9 đến tháng 1
  return (month >= 9 && month <= 12) || month === 1 ? 'rainy' : 'sunny';
}

export function getPackingItemsForSeason(season: WeatherSeason): EcoPackingItem[] {
  return ECO_PACKING_ITEMS.filter((item) => !item.season || item.season === season);
}

function getSafeStorage(customStorage?: Pick<Storage, 'getItem' | 'setItem'>): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (customStorage) return customStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function loadPackingState(
  tripId: string,
  defaultSeason: WeatherSeason,
  customStorage?: Pick<Storage, 'getItem' | 'setItem'>
): PackingChecklistState {
  const storage = getSafeStorage(customStorage);
  if (!storage) return { checkedIds: [], season: defaultSeason };
  try {
    const raw = storage.getItem(`${PACKING_STORAGE_PREFIX}${tripId}`);
    if (!raw) return { checkedIds: [], season: defaultSeason };
    const parsed = JSON.parse(raw) as Partial<PackingChecklistState>;
    const checkedIds = Array.isArray(parsed.checkedIds)
      ? parsed.checkedIds.filter((id): id is string => typeof id === 'string')
      : [];
    const season: WeatherSeason = parsed.season === 'rainy' || parsed.season === 'sunny' ? parsed.season : defaultSeason;
    return { checkedIds, season };
  } catch {
    return { checkedIds: [], season: defaultSeason };
  }
}

export function savePackingState(
  tripId: string,
  state: PackingChecklistState,
  customStorage?: Pick<Storage, 'getItem' | 'setItem'>
): void {
  const storage = getSafeStorage(customStorage);
  if (!storage) return;
  try {
    storage.setItem(`${PACKING_STORAGE_PREFIX}${tripId}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
}

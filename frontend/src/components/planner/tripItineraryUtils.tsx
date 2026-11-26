import { BedDouble, Coffee, Compass, Landmark, Utensils } from 'lucide-react';
import { getDeterministicImage, type Poi, type PoiCategory } from '@/data/pois';
import { updateDateRangeWithDays, type RouteTransportMode } from '@/services/itineraryService';

export interface BackendRecommendation {
  poi_id?: string | number;
  name?: string;
  category_name?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  image?: string | null;
  explanation_snippet?: string | null;
  satisfaction_score?: number | null;
  match_score?: number | null;
  estimated_cost?: number | null;
  green_score?: number | null;
  is_green?: boolean | null;
}

// 4 Danh mục chuẩn GreenTrip (Quán ăn, Di tích, Cảnh quan, Chùa)
export const GREEN_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'quan-an', label: 'Quán ăn' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'luu-tru', label: 'Lưu trú' },
];

export const MODAL_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
  { id: 'luu-tru', label: 'Lưu trú' },
];

export function formatCategoryLabel(cat?: string | null): string {
  if (!cat) return 'Điểm đến';
  const c = cat.toLowerCase().replace(/[-_]/g, ' ');
  if (c.includes('luu tru') || c.includes('lưu trú') || c.includes('nghỉ dưỡng') || c.includes('homestay') || c.includes('resort') || c.includes('hotel')) return 'Lưu trú';
  if (c.includes('quan an') || c.includes('quán ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant')) return 'Quán ăn';
  if (c.includes('di tich') || c.includes('di tích') || c.includes('lăng') || c.includes('đại nội')) return 'Di tích';
  if (c.includes('chua') || c.includes('chùa')) return 'Chùa';
  if (c.includes('bien') || c.includes('biển') || c.includes('canh quan') || c.includes('cảnh quan')) return 'Cảnh quan';
  if (c.includes('ca phe') || c.includes('cà phê') || c.includes('coffee')) return 'Quán ăn';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function getPoiImage(poi?: Poi | null): string {
  if (!poi) return 'https://ydqzobtzakttljslkiez.supabase.co/storage/v1/object/public/poi-images/52be8ea6-571d-47f9-a9a5-375270c73243.webp';
  if (poi.image && poi.image.startsWith('http')) return poi.image;
  return getDeterministicImage(poi.name, poi.id, (poi.category as PoiCategory) || 'quan-an', poi.city);
}

export function getCategoryIcon(cat?: string | null) {
  const c = (cat || '').toLowerCase();
  if (c.includes('luu-tru') || c.includes('lưu trú') || c.includes('nghỉ dưỡng') || c.includes('homestay') || c.includes('resort') || c.includes('hotel')) {
    return <BedDouble size={12} className="text-purple-300 shrink-0" />;
  }
  if (c.includes('ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant') || c.includes('culinary') || c.includes('quan-an')) {
    return <Utensils size={12} className="text-amber-300 shrink-0" />;
  }
  if (c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('di-tich')) {
    return <Landmark size={12} className="text-emerald-300 shrink-0" />;
  }
  if (c.includes('chùa') || c.includes('chua')) {
    return <Compass size={12} className="text-yellow-300 shrink-0" />;
  }
  if (c.includes('rest') || c.includes('nghỉ')) {
    return <Coffee size={12} className="text-amber-300 shrink-0" />;
  }
  return <Compass size={12} className="text-emerald-300 shrink-0" />;
}

// Thời lượng gợi ý mặc định: Lấy từ dữ liệu địa điểm, thiếu thì 1 giờ (60 phút)
export function getPoiVisitDurationMinutes(poi?: Poi | null): number {
  if (!poi) return 60;
  if (poi.average_visit_minutes && poi.average_visit_minutes > 0) return poi.average_visit_minutes;
  const durText = poi.visitDuration || '';
  const match = durText.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    if (durText.includes('giờ') || durText.includes('hour') || durText.includes('h')) {
      return Math.round(num * 60);
    }
    if (durText.includes('phút') || durText.includes('min')) {
      return Math.round(num);
    }
  }
  return 60;
}

// Link chỉ đường Google Maps thực tế
export function getGoogleMapsDirectionsUrl(
  originLat?: number | null,
  originLng?: number | null,
  destLat?: number | null,
  destLng?: number | null,
  mode: RouteTransportMode = 'driving'
): string {
  if (originLat != null && originLng != null && destLat != null && destLng != null) {
    const travelMode = mode === 'transit' ? 'transit' : mode === 'walking' ? 'walking' : 'driving';
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=${travelMode}`;
  }
  return 'https://www.google.com/maps';
}

export function displayDateVi(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('vi-VN', {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
    }).format(d);
  } catch {
    return dateStr || '';
  }
}

export function formatTripDateRange(startDate: string, daysCount: number): string {
  const start = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return updateDateRangeWithDays(startDate, daysCount);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(1, daysCount) - 1);
  const day = (date: Date) => date.getDate();
  const month = (date: Date) => date.getMonth() + 1;
  const year = end.getFullYear();
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `Ngày ${day(start)} – ${day(end)} tháng ${month(end)}, ${year}`;
  }
  return `Ngày ${day(start)} tháng ${month(start)} – ${day(end)} tháng ${month(end)}, ${year}`;
}

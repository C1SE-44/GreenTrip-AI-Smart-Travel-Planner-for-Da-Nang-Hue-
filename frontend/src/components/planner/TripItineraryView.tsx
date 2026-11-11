import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Check,
  X,
  Coffee,
  Heart,
  Search,
  RefreshCw,
  Utensils,
  Landmark,
  Compass,
  Car,
  MoreHorizontal,
  FileText,
  Pencil,
  Lightbulb,
  ExternalLink,
  SlidersHorizontal,
  Star,
  LayoutGrid,
  MapPin,
  Info,
} from 'lucide-react';
import type { UserTrip } from '@/pages/ExplorePage';
import {
  type Poi,
  type PoiCategory,
  type PoiCity,
  getDeterministicImage,
  normalizeCategory,
  normalizeCity,
  normalizePoi,
  categoryLabels,
} from '@/data/pois';
import { useSavedPlaces } from '@/context/SavedPlacesContext';
import PoiMap from '@/components/poi/PoiMap';
import {
  createEmptyItinerary,
  getTripItinerary,
  saveTripItinerary,
  stopFromPoi,
  alignItineraryToTrip,
  normalizeLegacyLunchBreaks,
  distanceKm,
  minutesFromTime,
  updateDateRangeWithDays,
  getRoutePositionsForStops,
  type TripItinerary,
  type ItineraryDay,
  type ItineraryStop,
} from '@/services/itineraryService';

export interface TripItineraryViewProps {
  trip: UserTrip;
  allPois?: Poi[];
  onBack: () => void;
  onUpdateTrip?: (updatedTrip: UserTrip) => void;
  isDrawerMode?: boolean;
  onClose?: () => void;
  initialFocus?: 'ideas' | 'itinerary';
  onNavigateToCalendar?: () => void;
}

// ─────────────────────────────────────────────────────────────
// 4 Danh mục chuẩn GreenTrip (Quán ăn, Di tích, Cảnh quan, Chùa)
// ─────────────────────────────────────────────────────────────
const GREEN_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'quan-an', label: 'Quán ăn' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
];

const MODAL_CATEGORY_TABS: { id: string; label: string }[] = [
  { id: 'for-you', label: 'Dành cho bạn' },
  { id: 'all', label: 'Tất cả' },
  { id: 'di-tich', label: 'Di tích' },
  { id: 'canh-quan', label: 'Cảnh quan' },
  { id: 'chua', label: 'Chùa' },
  { id: 'quan-an', label: 'Quán ăn' },
];

function formatCategoryLabel(cat?: string | null): string {
  if (!cat) return 'Điểm đến';
  const c = cat.toLowerCase().replace(/[-_]/g, ' ');
  if (c.includes('quan an') || c.includes('quán ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('restaurant')) return 'Quán ăn';
  if (c.includes('di tich') || c.includes('di tích') || c.includes('lăng') || c.includes('đại nội')) return 'Di tích';
  if (c.includes('chua') || c.includes('chùa')) return 'Chùa';
  if (c.includes('bien') || c.includes('biển') || c.includes('canh quan') || c.includes('cảnh quan')) return 'Cảnh quan';
  if (c.includes('ca phe') || c.includes('cà phê') || c.includes('coffee')) return 'Quán ăn';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

function getPoiImage(poi?: Poi | null): string {
  if (!poi) return 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
  if (poi.image && poi.image.startsWith('http')) return poi.image;
  return getDeterministicImage(poi.name, poi.id, (poi.category as PoiCategory) || 'quan-an', poi.city);
}

function getCategoryIcon(cat?: string | null) {
  const c = (cat || '').toLowerCase();
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
function getPoiVisitDurationMinutes(poi?: Poi | null): number {
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
function getGoogleMapsDirectionsUrl(
  originLat?: number | null,
  originLng?: number | null,
  destLat?: number | null,
  destLng?: number | null
): string {
  if (originLat != null && originLng != null && destLat != null && destLng != null) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;
  }
  return 'https://www.google.com/maps';
}

function displayDateVi(dateStr?: string | null): string {
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

export default function TripItineraryView({
  trip,
  allPois = [],
  onBack,
  onUpdateTrip,
  isDrawerMode = false,
  onClose,
  initialFocus,
  onNavigateToCalendar,
}: TripItineraryViewProps) {
  // ─── 0. Hệ thống địa điểm đã lưu (Favorites / Đã thích) của Thiện ───
  const { savedIds, pendingIds, toggleSaved, openCollectionPicker, places } = useSavedPlaces();

  // Đếm số lượng địa điểm đã thích từ hệ thống Đã lưu
  const savedCount = useMemo(() => {
    let count = savedIds.size;
    try {
      const rawFav = localStorage.getItem('greentrip_favorites');
      if (rawFav) {
        const parsed = JSON.parse(rawFav) as string[];
        count = Math.max(count, parsed.length);
      }
    } catch {}
    return count;
  }, [savedIds]);

  // ─── 1. Quản lý trạng thái Lịch trình (TripItinerary Plan) ───
  const [plan, setPlan] = useState<TripItinerary>(() => createEmptyItinerary(trip));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Tham chiếu tự động lưu
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersion = useRef(0);
  const latestPlan = useRef(plan);
  const currentTrip = useRef(trip);
  currentTrip.current = trip;

  // ─── 2. Quản lý Ý tưởng (Ideas List) ───
  const [tripIdeas, setTripIdeas] = useState<string[]>(() => {
    if (Array.isArray(trip.ideas)) return trip.ideas;
    return [];
  });

  // State giao diện
  const [expandIdeas, setExpandIdeas] = useState(true);
  const [ideasFilter, setIdeasFilter] = useState<'all' | 'quan-an' | 'di-tich' | 'canh-quan' | 'chua' | 'unplaced'>('all');
  const [showIdeasFilterMenu, setShowIdeasFilterMenu] = useState(false);
  const [showIdeasMoreMenu, setShowIdeasMoreMenu] = useState(false);

  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [showDistances, setShowDistances] = useState(true);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [selectedMapPoiId, setSelectedMapPoiId] = useState<string | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // Bộ lọc xem ngày nổi trên Bản đồ (đặt góc trên bên phải)
  const [mapDayFilter, setMapDayFilter] = useState<number | 'all'>('all');
  const [showDayFilterDropdown, setShowDayFilterDropdown] = useState(false);

  // Thao tác nhanh cho từng thẻ Ideas & Ngày
  const ideasCarouselRef = useRef<HTMLDivElement>(null);
  const ideasSectionRef = useRef<HTMLDivElement>(null);
  const itinerarySectionRef = useRef<HTMLDivElement>(null);
  const [activeIdeaMenuPoiId, setActiveIdeaMenuPoiId] = useState<string | null>(null);
  const [activeIdeaAddDayPoiId, setActiveIdeaAddDayPoiId] = useState<string | null>(null);
  const [activeMenuStopId, setActiveMenuStopId] = useState<string | null>(null);
  const [showItinerarySettingsMenu, setShowItinerarySettingsMenu] = useState(false);
  const [activeDayAddModal, setActiveDayAddModal] = useState<number | null>(null);

  // Chỉnh sửa giờ & Ghi chú (Notes / Comments)
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState('08:00');
  const [editEndTime, setEditEndTime] = useState('09:30');
  const [editingNoteStopId, setEditingNoteStopId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Modal Thêm địa điểm vào Ý tưởng / Ngày (Chuẩn 1:1 TripOverviewView & Mindtrip)
  const [showAddIdeasModal, setShowAddIdeasModal] = useState(false);
  const [modalTab, setModalTab] = useState<'search' | 'ideas' | 'saved' | 'custom'>('search');
  const [modalSearch, setModalSearch] = useState('');
  const [modalCity, setModalCity] = useState<'all' | 'Đà Nẵng' | 'Huế'>('all');
  const [showModalCityDropdown, setShowModalCityDropdown] = useState(false);
  const [modalCategory, setModalCategory] = useState<string>('for-you');
  const [customIdeaInput, setCustomIdeaInput] = useState('');

  // Tiêu đề chuyến đi rõ ràng (tự động loại bỏ chữ 'ư', câu chat hoặc chuỗi ngắn)
  const displayTitle = useMemo(() => {
    const clean = trip.title?.trim();
    if (clean && clean.length > 2 && clean.toLowerCase() !== 'ư' && clean.toLowerCase() !== 'a' && !clean.toLowerCase().startsWith('bắt đầu')) {
      return clean;
    }
    return `Chuyến đi ${trip.destination || 'Đà Nẵng & Huế'}`;
  }, [trip.title, trip.destination]);

  // Phụ đề gọn (không bị lặp '4 ngày 4 ngày')
  const displaySubtitle = useMemo(() => {
    let dates = trip.startDate || 'Tháng 11/2026';
    dates = dates.replace(/\s*\(\d+\s*ngày\)/gi, '').trim();
    return `${trip.destination || 'Đà Nẵng & Huế'} • ${dates} (${plan.days.length} ngày)`;
  }, [trip.destination, trip.startDate, plan.days.length]);

  // ─── 3. Đồng bộ danh sách POI từ `tripIdeas` ───
  const ideaPois = useMemo(() => {
    return tripIdeas
      .map((id) => {
        const found = allPois.find((p) => p.id === id || p.name.toLowerCase() === id.toLowerCase());
        if (found) return found;
        if (id.startsWith('custom-')) {
          const customName = id.replace(/^custom-/, '');
          return {
            id,
            name: customName,
            city: /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng',
            category: 'quan-an' as PoiCategory,
            image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
            address: 'Địa điểm tự thêm',
            description: 'Địa điểm do bạn thêm vào chuyến đi.',
            lat: 16.0678,
            lng: 108.2208,
            rating: 4.8,
            visitDuration: '1.0 giờ',
            ecoScore: 85,
            isGreen: true,
          } as Poi;
        }
        return null;
      })
      .filter((p): p is Poi => p !== null);
  }, [tripIdeas, allPois, trip.destination]);

  // Cuộn dải thẻ ý tưởng
  const handleScrollIdeas = (dir: 'left' | 'right') => {
    if (!ideasCarouselRef.current) return;
    const delta = dir === 'left' ? -260 : 260;
    ideasCarouselRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // Tra cứu xem POI đã được xếp vào ngày nào
  const getDayNumberForPoi = useCallback(
    (poiId: string): number | null => {
      for (const day of plan.days) {
        if (day.stops.some((s) => s.poi_id === poiId || s.title.toLowerCase() === poiId.toLowerCase())) {
          return day.day_number;
        }
      }
      return null;
    },
    [plan.days]
  );

  // Lọc thẻ ý tưởng theo 4 danh mục chuẩn GreenTrip + Trạng thái chưa xếp lịch
  const filteredIdeaPois = useMemo(() => {
    return ideaPois.filter((p) => {
      const dayNum = getDayNumberForPoi(p.id);
      if (ideasFilter === 'unplaced' && dayNum !== null) return false;
      if (ideasFilter === 'all' || ideasFilter === 'unplaced') return true;

      const norm = normalizeCategory(p.category);
      if (ideasFilter === 'quan-an') {
        const c = (p.category || '').toLowerCase();
        return norm === 'quan-an' || c.includes('ăn') || c.includes('ẩm thực') || c.includes('food') || c.includes('quán') || c.includes('cafe');
      }
      if (ideasFilter === 'di-tich') {
        const c = (p.category || '').toLowerCase();
        return norm === 'di-tich' || c.includes('di tích') || c.includes('lăng') || c.includes('đại nội') || c.includes('attraction');
      }
      if (ideasFilter === 'canh-quan') {
        const c = (p.category || '').toLowerCase();
        return norm === 'canh-quan' || c.includes('cảnh quan') || c.includes('biển') || c.includes('cầu') || c.includes('sơn trà') || c.includes('bà nà');
      }
      if (ideasFilter === 'chua') {
        const c = (p.category || '').toLowerCase();
        return norm === 'chua' || c.includes('chùa');
      }
      return true;
    });
  }, [ideaPois, ideasFilter, getDayNumberForPoi]);

  // ─── 4. Tự động lưu và tải từ Backend / LocalStorage ───
  const persistPlan = useCallback(
    (nextPlan: TripItinerary) => {
      const version = ++saveVersion.current;
      latestPlan.current = nextPlan;
      setPlan(nextPlan);
      setHasUnsavedChanges(true);
      setErrorMessage('');

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const saved = await saveTripItinerary(nextPlan);
          if (version === saveVersion.current) {
            setPlan((prev) => ({ ...prev, updated_at: saved.updated_at }));
            setHasUnsavedChanges(false);
          }
        } catch (cause) {
          if (version === saveVersion.current) {
            console.warn('Lỗi lưu lịch trình:', cause);
            setErrorMessage('Lịch đã lưu cục bộ trên máy của bạn.');
          }
        } finally {
          if (version === saveVersion.current) setIsSaving(false);
        }
      }, 350);
    },
    []
  );

  // Tải kế hoạch khi mở trang
  useEffect(() => {
    let isCancelled = false;
    async function loadData() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const saved = await getTripItinerary(trip.id);
        if (isCancelled) return;
        const normalized = normalizeLegacyLunchBreaks(saved);
        const aligned = alignItineraryToTrip(normalized.itinerary, currentTrip.current);
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
      } catch {
        if (isCancelled) return;
        const fresh = createEmptyItinerary(currentTrip.current);
        const aligned = alignItineraryToTrip(fresh, currentTrip.current);
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    void loadData();
    return () => {
      isCancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [trip.id]);

  useEffect(() => {
    if (Array.isArray(trip.ideas)) {
      setTripIdeas(trip.ideas);
    }
  }, [trip.ideas]);

  // Đồng bộ số ngày khi trip.daysCount thay đổi từ bên ngoài (ví dụ: đổi popup 'Khi' ở Ý tưởng)
  useEffect(() => {
    if (!isLoading && trip.daysCount && trip.daysCount !== plan.days.length) {
      const aligned = alignItineraryToTrip(latestPlan.current, trip);
      if (aligned.changed) {
        latestPlan.current = aligned.itinerary;
        setPlan(aligned.itinerary);
        persistPlan(aligned.itinerary);
      }
    }
  }, [trip.daysCount, isLoading, persistPlan, trip]);

  useEffect(() => {
    if (initialFocus === 'ideas') {
      setExpandIdeas(true);
      const timer = setTimeout(() => {
        ideasSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    } else if (initialFocus === 'itinerary') {
      const timer = setTimeout(() => {
        itinerarySectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [initialFocus]);

  // ─── 5. Thao tác THỦ CÔNG (Manual Planning First) ───

  // Thêm ý tưởng vào ngày cụ thể
  const handleAddIdeaToDay = (dayNumber: number, poi: Poi, targetIndex?: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;

      const stops = [...day.stops];
      const newStop = stopFromPoi(poi, 'manual');

      const dur = getPoiVisitDurationMinutes(poi);
      newStop.duration_minutes = dur;

      let startMinutes = 8 * 60; // 08:00 sáng
      const prevStop = stops.length > 0 ? stops[stops.length - 1] : null;

      if (prevStop && prevStop.end_time) {
        const [h, m] = prevStop.end_time.split(':').map(Number);
        startMinutes = (h || 8) * 60 + (m || 0) + 15;
      }

      const startH = Math.min(22, Math.floor(startMinutes / 60));
      const startM = startMinutes % 60;
      const endTotalM = startMinutes + dur;
      const endH = Math.min(23, Math.floor(endTotalM / 60));
      const endM = endTotalM % 60;

      newStop.start_time = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
      newStop.end_time = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

      if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= stops.length) {
        stops.splice(targetIndex, 0, newStop);
      } else {
        stops.push(newStop);
      }

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    // Đảm bảo poi cũng có mặt trong kho Ideas
    if (!tripIdeas.includes(poi.id)) {
      handleToggleIdeaInTrip(poi.id);
    }

    const nextPlan = { ...plan, days: nextDays };
    persistPlan(nextPlan);
    setActiveIdeaMenuPoiId(null);
    setActiveIdeaAddDayPoiId(null);
  };

  // Di chuyển điểm dừng giữa các ngày
  const handleMoveStopBetweenDays = (
    stopId: string,
    fromDayNumber: number,
    toDayNumber: number
  ) => {
    let movingStop: ItineraryStop | undefined;

    const cleanedDays = plan.days.map((day) => {
      if (day.day_number !== fromDayNumber) return day;
      const found = day.stops.find((s) => s.stop_id === stopId);
      if (found) movingStop = { ...found };
      return {
        ...day,
        stops: day.stops.filter((s) => s.stop_id !== stopId).map((s, idx) => ({ ...s, sequence: idx })),
      };
    });

    if (!movingStop) return;

    const nextDays = cleanedDays.map((day) => {
      if (day.day_number !== toDayNumber) return day;
      const stops = [...day.stops, movingStop!];
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
    setActiveMenuStopId(null);
  };

  // Bỏ địa điểm khỏi ngày (vẫn giữ trong kho Ideas)
  const handleRemovePoiFromDay = (poiId: string) => {
    const nextDays = plan.days.map((day) => ({
      ...day,
      stops: day.stops
        .filter((s) => s.poi_id !== poiId && s.stop_id !== poiId)
        .map((s, idx) => ({ ...s, sequence: idx })),
    }));
    persistPlan({ ...plan, days: nextDays });
  };

  // Đổi thứ tự điểm dừng trong ngày
  const handleMoveStop = (dayNumber: number, stopIndex: number, direction: 'up' | 'down') => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const targetIndex = direction === 'up' ? stopIndex - 1 : stopIndex + 1;
      if (targetIndex < 0 || targetIndex >= day.stops.length) return day;

      const stops = [...day.stops];
      const temp = stops[stopIndex];
      stops[stopIndex] = stops[targetIndex];
      stops[targetIndex] = temp;

      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });

    persistPlan({ ...plan, days: nextDays });
  };

  // Xóa hẳn điểm dừng khỏi ngày
  const handleDeleteStop = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      return {
        ...day,
        stops: day.stops.filter((s) => s.stop_id !== stopId).map((s, idx) => ({ ...s, sequence: idx })),
      };
    });
    persistPlan({ ...plan, days: nextDays });
    setActiveMenuStopId(null);
  };

  // Lưu chỉnh sửa giờ tham quan
  const handleSaveEditTime = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) => {
        if (s.stop_id !== stopId) return s;
        const dur = Math.max(15, minutesFromTime(editEndTime) - minutesFromTime(editStartTime));
        return {
          ...s,
          start_time: editStartTime,
          end_time: editEndTime,
          duration_minutes: dur,
        };
      });
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingStopId(null);
  };

  // Lưu ghi chú cho điểm dừng
  const handleSaveNote = (dayNumber: number, stopId: string) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const stops = day.stops.map((s) => {
        if (s.stop_id !== stopId) return s;
        return { ...s, comment: noteInput.trim() || null };
      });
      return { ...day, stops };
    });
    persistPlan({ ...plan, days: nextDays });
    setEditingNoteStopId(null);
  };

  // Thêm khoảng nghỉ trưa (12:00 - 13:30)
  const handleAddLunchBreak = (dayNumber: number) => {
    const nextDays = plan.days.map((day) => {
      if (day.day_number !== dayNumber) return day;
      const restStop: ItineraryStop = {
        stop_id: `rest-${dayNumber}-${Date.now()}`,
        poi_id: `rest-${dayNumber}`,
        title: 'Nghỉ trưa & Thưởng thức ẩm thực',
        city: null,
        address: null,
        category: 'quan-an',
        stop_type: 'rest',
        source: 'manual',
        start_time: '12:00',
        end_time: '13:30',
        duration_minutes: 90,
        sequence: day.stops.length,
        latitude: null,
        longitude: null,
        comment: 'Khoảng thời gian nghỉ ngơi thư giãn và thưởng thức ẩm thực địa phương.',
      };
      const stops = [...day.stops, restStop].sort((a, b) => {
        const timeA = minutesFromTime(a.start_time || '00:00');
        const timeB = minutesFromTime(b.start_time || '00:00');
        return timeA - timeB;
      });
      return { ...day, stops: stops.map((s, idx) => ({ ...s, sequence: idx })) };
    });
    persistPlan({ ...plan, days: nextDays });
  };

  // Thu gọn / mở rộng ngày
  const toggleDayCollapse = (dayNumber: number) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  // Thêm ngày mới vào lịch
  const handleAddDay = () => {
    const nextNumber = plan.days.length + 1;
    const nextDays = [
      ...plan.days,
      {
        day_id: `${plan.trip_id}-day-${nextNumber}`,
        day_number: nextNumber,
        date: null,
        title: `Ngày ${nextNumber}`,
        stops: [],
      },
    ];
    persistPlan({ ...plan, days_count: nextDays.length, days: nextDays });
    setShowItinerarySettingsMenu(false);

    // Đồng bộ ngược ra UserTrip: daysCount & startDate (ví dụ: du lịch từ 1-5, thêm 1 ngày thành 1-6)
    if (onUpdateTrip) {
      const nextDateStr = updateDateRangeWithDays(trip.startDate, nextDays.length);
      onUpdateTrip({
        ...trip,
        daysCount: nextDays.length,
        startDate: nextDateStr,
      });
    }
  };

  // Xóa ngày khỏi lịch
  const handleDeleteDay = (dayNumber: number) => {
    if (plan.days.length <= 1) return;
    const filteredDays = plan.days.filter((d) => d.day_number !== dayNumber);
    const nextDays = filteredDays.map((d, idx) => ({
      ...d,
      day_number: idx + 1,
      title: `Ngày ${idx + 1}`,
    }));
    persistPlan({ ...plan, days_count: nextDays.length, days: nextDays });

    // Đồng bộ ngược ra UserTrip: daysCount & startDate
    if (onUpdateTrip) {
      const nextDateStr = updateDateRangeWithDays(trip.startDate, nextDays.length);
      onUpdateTrip({
        ...trip,
        daysCount: nextDays.length,
        startDate: nextDateStr,
      });
    }
  };

  // Thao tác với kho Ý tưởng
  const handleToggleIdeaInTrip = (poiId: string) => {
    setTripIdeas((prev) => {
      const next = prev.includes(poiId) ? prev.filter((id) => id !== poiId) : [...prev, poiId];
      if (onUpdateTrip) {
        onUpdateTrip({ ...trip, ideas: next });
      }
      return next;
    });
  };

  // Thêm địa điểm tự tạo
  const handleAddCustomIdea = () => {
    const name = customIdeaInput.trim();
    if (!name) return;
    const customId = `custom-${name}`;
    if (activeDayAddModal) {
      const customPoi: Poi = {
        id: customId,
        name,
        city: /hue|huế/i.test(trip.destination) ? 'Huế' : 'Đà Nẵng',
        category: 'quan-an',
        image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
        address: 'Địa điểm tự thêm',
        description: '',
        lat: 16.0678,
        lng: 108.2208,
        rating: 4.8,
        visitDuration: '1.0 giờ',
        ecoScore: 85,
        isGreen: true,
      };
      handleAddIdeaToDay(activeDayAddModal, customPoi);
    } else {
      handleToggleIdeaInTrip(customId);
    }
    setCustomIdeaInput('');
    setShowAddIdeasModal(false);
  };

  // Nút Xong: Lưu và quay lại
  const handleDone = () => {
    persistPlan(plan);
    if (onUpdateTrip) {
      onUpdateTrip({ ...trip, ideas: tripIdeas });
    }
    if (onClose) {
      onClose();
    } else {
      onBack();
    }
  };

  // ─── 6. Lọc POI hiển thị trên Bản đồ tương tác theo Bộ lọc ngày nổi ───
  const mapPois = useMemo(() => {
    const displayedDays =
      mapDayFilter === 'all'
        ? plan.days
        : plan.days.filter((d) => d.day_number === mapDayFilter);

    const stopsPois: Poi[] = [];
    displayedDays.forEach((day) => {
      day.stops.forEach((stop) => {
        if (stop.stop_type === 'rest') return;
        const matched = allPois.find((p) => p.id === stop.poi_id);
        if (matched) {
          stopsPois.push(matched);
        } else if (stop.latitude != null && stop.longitude != null) {
          stopsPois.push({
            id: stop.poi_id || stop.stop_id,
            name: stop.title,
            city: (stop.city as PoiCity) || 'Đà Nẵng',
            category: (stop.category as PoiCategory) || 'quan-an',
            image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80',
            address: stop.address || '',
            description: '',
            lat: stop.latitude,
            lng: stop.longitude,
            rating: 4.8,
            visitDuration: '1.5 giờ',
            ecoScore: 85,
            isGreen: true,
          });
        }
      });
    });
    return stopsPois;
  }, [plan.days, mapDayFilter, allPois]);

  // Danh sách stops hợp lệ (có tọa độ) theo ngày đang chọn hoặc tất cả các ngày
  const currentFilteredStops = useMemo(() => {
    const displayedDays =
      mapDayFilter === 'all'
        ? plan.days
        : plan.days.filter((d) => d.day_number === mapDayFilter);

    const stopsList: { latitude: number; longitude: number; poi_id?: string; stop_id: string; title: string }[] = [];
    displayedDays.forEach((day) => {
      day.stops.forEach((stop) => {
        if (stop.stop_type === 'rest') return;
        const matched = allPois.find((p) => p.id === stop.poi_id);
        const lat = matched?.lat ?? stop.latitude;
        const lng = matched?.lng ?? stop.longitude;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
          stopsList.push({
            stop_id: stop.stop_id,
            poi_id: stop.poi_id || stop.stop_id,
            title: stop.title,
            latitude: lat,
            longitude: lng,
          });
        }
      });
    });
    return stopsList;
  }, [plan.days, mapDayFilter, allPois]);

  // Bảng đánh số thứ tự (Numbered Markers 1, 2, 3...) theo ngày
  const numberedOrderMap = useMemo(() => {
    const orderMap = new Map<string, number>();
    currentFilteredStops.forEach((s, idx) => {
      const order = idx + 1;
      if (s.poi_id) orderMap.set(String(s.poi_id), order);
      if (s.stop_id) orderMap.set(String(s.stop_id), order);
      if (s.title) orderMap.set(s.title, order);
    });
    return orderMap;
  }, [currentFilteredStops]);

  // Tọa độ vẽ đường Polyline thực tế (chuẩn OSRM / backend)
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  useEffect(() => {
    let isMounted = true;
    if (currentFilteredStops.length < 2) {
      setRouteCoordinates([]);
      return;
    }

    const dayNum = typeof mapDayFilter === 'number' ? mapDayFilter : undefined;
    getRoutePositionsForStops(currentFilteredStops, trip.id, dayNum)
      .then((coords) => {
        if (isMounted) {
          setRouteCoordinates(coords);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRouteCoordinates(currentFilteredStops.map((s) => [s.latitude, s.longitude]));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentFilteredStops, trip.id, mapDayFilter]);

  const isDaNang = useCallback((c?: string) => /da\s*nang|đà\s*nẵng/i.test(c || ''), []);
  const isHue = useCallback((c?: string) => /hue|huế/i.test(c || ''), []);

  // Lọc danh sách POI cho Modal "Thêm vào chuyến đi" chuẩn 1:1 TripOverviewView
  const modalFilteredPois = useMemo(() => {
    let list: Poi[] = [];

    if (modalTab === 'ideas') {
      list = ideaPois;
    } else if (modalTab === 'saved') {
      let favSet = new Set<string>();
      try {
        const rawFav = localStorage.getItem('greentrip_favorites');
        if (rawFav) favSet = new Set<string>(JSON.parse(rawFav));
      } catch (e) {
        console.error(e);
      }
      const poisFromAll = allPois.filter(
        (p) => savedIds.has(String(p.id)) || savedIds.has(p.name) || favSet.has(String(p.id)) || favSet.has(p.name)
      );
      const normalizedBackendPlaces = (places || [])
        .map((item) => normalizePoi(item, true))
        .filter((p): p is Poi => p !== null && !poisFromAll.some((ap) => String(ap.id) === String(p.id)));
      list = [...poisFromAll, ...normalizedBackendPlaces];
    } else {
      list = allPois;
    }

    // 1. Lọc theo Thành phố
    if (modalCity === 'Đà Nẵng') {
      list = list.filter((p) => isDaNang(p.city));
    } else if (modalCity === 'Huế') {
      list = list.filter((p) => isHue(p.city));
    }

    // 2. Lọc theo Danh mục chuẩn Explore & Mindtrip
    if (modalCategory === 'for-you') {
      list = [...list].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else if (modalCategory === 'di-tich') {
      list = list.filter((p) => p.category === 'di-tich');
    } else if (modalCategory === 'canh-quan' || modalCategory === 'scenic') {
      list = list.filter((p) => p.category === 'canh-quan');
    } else if (modalCategory === 'chua') {
      list = list.filter((p) => p.category === 'chua');
    } else if (modalCategory === 'quan-an' || modalCategory === 'restaurants') {
      list = list.filter((p) => p.category === 'quan-an');
    }

    // 3. Lọc theo từ khóa tìm kiếm
    if (modalSearch.trim()) {
      const q = modalSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allPois, ideaPois, places, savedIds, modalCity, modalCategory, modalSearch, modalTab, isDaNang, isHue]);

  return (
    <div
      onClick={() => {
        setShowIdeasFilterMenu(false);
        setShowIdeasMoreMenu(false);
        setActiveIdeaMenuPoiId(null);
        setActiveMenuStopId(null);
      }}
      className={
        isDrawerMode
          ? "fixed inset-y-0 right-0 w-full sm:w-[620px] lg:w-[calc(50vw)] xl:w-[calc(50vw)] z-50 bg-white rounded-l-[24px] border-l border-gray-200/90 shadow-[-16px_0_40px_rgba(0,0,0,0.08),-4px_0_12px_rgba(0,0,0,0.04)] flex flex-col overflow-hidden animate-slideInRight select-none"
          : "flex flex-col h-full w-full bg-white text-gray-900 select-none overflow-hidden animate-fadeIn"
      }
    >
      {/* ─── TOP HEADER (DRAWER MODE HOẶC FULL PAGE CHUẨN MINDTRIP) ─── */}
      {isDrawerMode ? (
        <header className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose || onBack}
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
              title="Đóng lịch trình"
            >
              <X size={17} />
            </button>
            <button
              type="button"
              onClick={onClose || onBack}
              className="w-9 h-9 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black hover:bg-gray-50 transition cursor-pointer"
              title="Quay lại"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1 font-medium">
              {isSaving ? (
                <span className="flex items-center gap-1 text-amber-700">
                  <RefreshCw size={12} className="animate-spin" /> Đang lưu...
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-gray-400">Chưa lưu</span>
              ) : (
                <span className="text-emerald-700 flex items-center gap-1">
                  <Check size={13} /> Đã lưu
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveDayAddModal(null);
                setModalTab('search');
                setShowAddIdeasModal(true);
              }}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-gray-200 hover:border-black text-[12.5px] font-semibold text-gray-900 hover:bg-gray-50 transition cursor-pointer active:scale-95 shadow-2xs"
              title="Thêm ý tưởng mới"
            >
              <Plus size={13} />
              <span>Thêm ý tưởng</span>
            </button>

            <button
              type="button"
              onClick={handleDone}
              className="h-8 px-4 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-95"
              title="Xong và đóng lịch trình"
            >
              Xong
            </button>
          </div>
        </header>
      ) : (
        <header className="h-[60px] px-6 lg:px-[36px] bg-white border-b border-gray-200/90 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 rounded-full border border-gray-200 hover:border-black hover:bg-gray-50 flex items-center justify-center text-gray-700 hover:text-black transition cursor-pointer shrink-0"
              title="Quay lại chuyến đi"
            >
              <ChevronLeft size={18} />
            </button>
            <img
              src={trip.image || (trip.destination === 'Huế' 
                ? 'https://images.unsplash.com/photo-1571508601891-ca5e7a713859?w=200&auto=format&fit=crop&q=80'
                : 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200&auto=format&fit=crop&q=80'
              )}
              alt={trip.destination}
              className="w-8 h-8 rounded-lg object-cover border border-gray-200/80 shrink-0 shadow-2xs hidden sm:block"
            />
            <div className="min-w-0">
              <h1 className="font-extrabold text-[16px] sm:text-[18px] text-gray-950 truncate leading-snug">
                {displayTitle}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5 font-medium truncate">
                {displaySubtitle}
              </p>
            </div>
          </div>

          {/* Nút hành động phải: Chuyển sang Lịch + Trạng thái lưu & Nút Xong */}
          <div className="flex items-center gap-2.5">
            {onNavigateToCalendar && (
              <button
                type="button"
                onClick={onNavigateToCalendar}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 hover:border-black text-xs font-bold text-gray-800 hover:bg-gray-50 transition cursor-pointer shadow-2xs group"
                title="Chuyển sang chế độ xem dạng Lịch"
              >
                <CalendarIcon size={13} className="text-blue-600" />
                <span>Xem dạng Lịch</span>
                <ChevronRight size={12} className="text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            <div className="text-xs text-gray-500 hidden sm:flex items-center gap-1 font-medium">
              {isSaving ? (
                <span className="flex items-center gap-1 text-amber-700">
                  <RefreshCw size={12} className="animate-spin" /> Đang lưu...
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-gray-400">Chưa lưu</span>
              ) : (
                <span className="text-emerald-700 flex items-center gap-1">
                  <Check size={13} /> Đã lưu
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleDone}
              className="h-9 px-5 rounded-full bg-black hover:bg-neutral-800 text-white text-xs font-bold transition cursor-pointer shadow-xs active:scale-95"
              title="Lưu lịch trình và quay lại tổng quan"
            >
              Xong
            </button>
          </div>
        </header>
      )}

      {/* Drawer Title Section */}
      {isDrawerMode && (
        <div className="px-6 pt-3.5 pb-2.5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className="text-[24px] sm:text-[26px] font-extrabold text-gray-950 tracking-tight leading-tight">
              Lịch trình chi tiết
            </h2>
            <p className="text-[13px] text-gray-500 mt-0.5 font-medium">
              {displayTitle} • {plan.days.length} ngày
            </p>
          </div>
        </div>
      )}

      {/* ─── NỘI DUNG CHÍNH (2 CỘT HOẶC 1 CỘT CHO DRAWER) ─── */}
      <div className={isDrawerMode ? "flex-1 w-full min-h-0 overflow-hidden flex flex-col" : "flex-1 min-h-0 flex items-stretch overflow-hidden bg-white"}>
        {/* ════════════════════════════════════════════════════════
            CỘT: Ý TƯỞNG + LỊCH THEO NGÀY (THỦ CÔNG CHUẨN)
        ════════════════════════════════════════════════════════ */}
        <div className={`${isDrawerMode ? 'w-full' : (isMapExpanded ? 'hidden' : 'w-[560px] lg:w-[620px] xl:w-[660px] shrink-0')} flex flex-col h-full bg-white overflow-y-auto px-5 sm:px-6 py-4 border-r border-gray-100 auto-hide-scrollbar select-none transition-[width] duration-300 ease-in-out`}>
          {/* ────────────────────────────────────────────────────────
              1. PHẦN Ý TƯỞNG (CHUẨN MINDTRIP ẢNH 3, 4 - BỘ LỌC BÊN PHẢI)
          ──────────────────────────────────────────────────────── */}
          <section ref={ideasSectionRef} className="shrink-0 mb-4">
            <div className="flex items-center justify-between mb-2.5">
              {/* Tiêu đề bên trái */}
              <button
                type="button"
                onClick={() => setExpandIdeas(!expandIdeas)}
                className="flex items-center gap-2 group cursor-pointer text-left"
              >
                {expandIdeas ? (
                  <ChevronDown size={17} className="text-gray-600 group-hover:text-black transition" />
                ) : (
                  <ChevronRight size={17} className="text-gray-600 group-hover:text-black transition" />
                )}
                <h2 className="font-extrabold text-[15.5px] text-gray-950 flex items-center gap-2">
                  <span>Ý tưởng</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {ideaPois.length} địa điểm
                  </span>
                </h2>
              </button>

              {/* Các nút và Bộ lọc BÊN PHẢI (Chuẩn Mindtrip Ảnh 3, 4) */}
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {/* Icon Layout */}
                <button
                  type="button"
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black transition cursor-pointer"
                  title="Chế độ xem thẻ ý tưởng"
                >
                  <LayoutGrid size={15} />
                </button>

                {/* Dropdown Lọc 4 danh mục chuẩn GreenTrip bên phải ở trên */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowIdeasFilterMenu(!showIdeasFilterMenu);
                      setShowIdeasMoreMenu(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 hover:border-black bg-white text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                  >
                    <span>
                      {ideasFilter === 'all'
                        ? 'Tất cả'
                        : ideasFilter === 'quan-an'
                        ? 'Quán ăn'
                        : ideasFilter === 'di-tich'
                        ? 'Di tích'
                        : ideasFilter === 'canh-quan'
                        ? 'Cảnh quan'
                        : ideasFilter === 'chua'
                        ? 'Chùa'
                        : 'Chưa xếp lịch'}
                    </span>
                    <ChevronDown size={12} className={showIdeasFilterMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>

                  {/* Menu Dropdown chuẩn Ảnh 4 */}
                  {showIdeasFilterMenu && (
                    <div
                      className="absolute right-0 top-9 w-44 bg-white rounded-2xl shadow-xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'quan-an', label: 'Quán ăn' },
                        { id: 'di-tich', label: 'Di tích' },
                        { id: 'canh-quan', label: 'Cảnh quan' },
                        { id: 'chua', label: 'Chùa' },
                        { id: 'unplaced', label: 'Chưa xếp lịch' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setIdeasFilter(item.id as any);
                            setShowIdeasFilterMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center justify-between cursor-pointer text-gray-800"
                        >
                          <span>{item.label}</span>
                          {ideasFilter === item.id && <Check size={13} className="text-black font-bold" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Menu ba chấm ... bên phải (Chuẩn Mindtrip Ảnh 3: Remove all ideas) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowIdeasMoreMenu(!showIdeasMoreMenu);
                      setShowIdeasFilterMenu(false);
                    }}
                    className="w-8 h-8 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black cursor-pointer transition"
                    title="Tùy chọn kho Ý tưởng"
                  >
                    <MoreHorizontal size={15} />
                  </button>

                  {showIdeasMoreMenu && (
                    <div
                      className="absolute right-0 top-9 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Bạn có chắc chắn muốn xóa tất cả địa điểm trong Ý tưởng?')) {
                            setTripIdeas([]);
                            if (onUpdateTrip) onUpdateTrip({ ...trip, ideas: [] });
                          }
                          setShowIdeasMoreMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>Xóa tất cả ý tưởng</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {expandIdeas && (
              <div className="space-y-2">
                {filteredIdeaPois.length === 0 ? (
                  <div className="h-[72px] px-4 rounded-[20px] border border-dashed border-gray-300 text-center bg-gray-50/50 flex items-center justify-between">
                    <p className="text-xs text-gray-600">
                      {ideaPois.length === 0
                        ? 'Chưa có địa điểm nào trong Ý tưởng.'
                        : 'Không có địa điểm phù hợp với bộ lọc.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDayAddModal(null);
                        setModalTab('search');
                        setShowAddIdeasModal(true);
                      }}
                      className="px-3 py-1.5 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition cursor-pointer"
                    >
                      + Khám phá thêm
                    </button>
                  </div>
                ) : (
                  /* Dải thẻ ý tưởng cuộn ngang chuẩn Mindtrip (Ảnh 1, 2) */
                  <div className="relative group/carousel">
                    <div
                      ref={ideasCarouselRef}
                      className="flex gap-3.5 overflow-x-auto pb-2 pt-1 no-scrollbar -mx-1 px-1 scroll-smooth"
                    >
                      {filteredIdeaPois.map((poi) => {
                        const isMenuOpen = activeIdeaMenuPoiId === poi.id;

                        return (
                          <div
                            key={poi.id}
                            className="w-[180px] h-[200px] shrink-0 rounded-2xl relative overflow-hidden group select-none shadow-sm hover:shadow-md transition-all border border-gray-100"
                          >
                            {/* Ảnh toàn thẻ */}
                            <img
                              src={getPoiImage(poi)}
                              alt={poi.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                              loading="lazy"
                            />

                            {/* Nút yêu thích & Menu ... góc trên phải (Chuẩn Ảnh 1, 2) */}
                            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void toggleSaved(String(poi.id), poi);
                                }}
                                className={`w-7 h-7 rounded-full backdrop-blur-xs flex items-center justify-center transition shadow-xs cursor-pointer active:scale-90 ${
                                  savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                    ? 'bg-white/95 text-rose-500 hover:bg-white ring-1 ring-rose-200'
                                    : 'bg-black/40 hover:bg-black/60 text-white'
                                }`}
                                title={
                                  savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                    ? 'Bỏ thích địa điểm'
                                    : 'Thả tim yêu thích (Lưu vào Đã lưu)'
                                }
                              >
                                <Heart
                                  size={14}
                                  className={
                                    savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                      ? 'fill-rose-500 text-rose-500'
                                      : 'text-white hover:text-rose-400'
                                  }
                                />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveIdeaMenuPoiId(isMenuOpen ? null : poi.id);
                                }}
                                className="w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xs flex items-center justify-center text-white transition shadow-xs cursor-pointer"
                                title="Tùy chọn địa điểm"
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </div>

                            {/* Menu popover khi bấm ... (Chuẩn Ảnh 2) */}
                            {isMenuOpen && (
                              <div
                                className="absolute right-2 top-10 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 p-1.5 z-50 text-xs animate-fadeIn text-gray-800"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMapPoiId(poi.id);
                                    setActiveIdeaMenuPoiId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 cursor-pointer"
                                >
                                  <ExternalLink size={13} />
                                  <span className="truncate">Xem {poi.name}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveIdeaAddDayPoiId(activeIdeaAddDayPoiId === poi.id ? null : poi.id);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center justify-between cursor-pointer"
                                >
                                  <span className="flex items-center gap-2">
                                    <Clock size={13} /> Thêm vào lịch trình
                                  </span>
                                  <ChevronRight
                                    size={13}
                                    className={activeIdeaAddDayPoiId === poi.id ? 'rotate-90 transition-transform' : 'transition-transform'}
                                  />
                                </button>
                                {activeIdeaAddDayPoiId === poi.id && (
                                  <div className="pl-3 pr-1 py-1 space-y-1 bg-gray-50 rounded-xl my-1">
                                    {plan.days.map((d) => (
                                      <button
                                        key={d.day_number}
                                        type="button"
                                        onClick={() => handleAddIdeaToDay(d.day_number, poi)}
                                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-black hover:text-white text-xs font-semibold flex items-center justify-between cursor-pointer"
                                      >
                                        <span>Ngày {d.day_number}</span>
                                        <span className="text-[10px] opacity-70">{d.stops.length} điểm</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void toggleSaved(String(poi.id), poi);
                                    setActiveIdeaMenuPoiId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-medium flex items-center gap-2 cursor-pointer"
                                >
                                  <Heart
                                    size={13}
                                    className={
                                      savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                        ? 'fill-rose-500 text-rose-500'
                                        : 'text-gray-500'
                                    }
                                  />
                                  <span>
                                    {savedIds.has(String(poi.id)) || savedIds.has(poi.name)
                                      ? 'Bỏ khỏi Đã lưu'
                                      : 'Lưu vào Đã lưu'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleToggleIdeaInTrip(poi.id);
                                    setActiveIdeaMenuPoiId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 size={13} /> Xóa khỏi Ý tưởng
                                </button>
                              </div>
                            )}

                            {/* Lớp gradient tối dần với Tên và Phân loại đè lên ảnh (Chuẩn Ảnh 1) */}
                            <div className="absolute inset-x-0 bottom-0 pt-12 pb-2.5 px-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-col justify-end pointer-events-none">
                              <h3
                                className="text-white font-bold text-[13.5px] leading-tight truncate drop-shadow-sm"
                                title={poi.name}
                              >
                                {poi.name}
                              </h3>
                              <p className="text-white/80 text-[11px] font-medium flex items-center gap-1 mt-0.5 truncate drop-shadow-xs">
                                {getCategoryIcon(poi.category)}
                                <span>{formatCategoryLabel(poi.category)}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Nút mũi tên sang phải (Chuẩn Ảnh 2) */}
                    <button
                      type="button"
                      onClick={() => handleScrollIdeas('right')}
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-700 hover:text-black transition z-10 cursor-pointer opacity-90 hover:opacity-100 hover:scale-105"
                      title="Xem tiếp các ý tưởng"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}

                {/* Nút + Thêm ở chân dải Ý tưởng (Chuẩn Ảnh 1) */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDayAddModal(null);
                      setModalTab('search');
                      setShowAddIdeasModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                  >
                    <Plus size={13} />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ────────────────────────────────────────────────────────
              2. PHẦN LỊCH TRÌNH THEO NGÀY (ITINERARY TIMELINE)
          ──────────────────────────────────────────────────────── */}
          <section ref={itinerarySectionRef} className="flex-1 flex flex-col min-h-0 mt-5">
            {/* Header Lịch trình */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-extrabold text-[17px] text-gray-950 flex items-center gap-2">
                  <span>Lịch trình</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {plan.days.length} ngày
                  </span>
                </h2>

                {/* Nút gạt Khoảng cách (Distances Toggle) */}
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                  <span className="text-xs font-semibold text-gray-600">Khoảng cách</span>
                  <button
                    type="button"
                    onClick={() => setShowDistances(!showDistances)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      showDistances ? 'bg-black' : 'bg-gray-300'
                    }`}
                    role="switch"
                    aria-checked={showDistances}
                    title="Bật/Tắt hiển thị khoảng cách giữa các điểm"
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        showDistances ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Menu ba chấm ... cạnh tiêu đề Lịch trình */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowItinerarySettingsMenu(!showItinerarySettingsMenu)}
                  className="w-8 h-8 rounded-full border border-gray-200 hover:border-black flex items-center justify-center text-gray-700 hover:text-black cursor-pointer transition"
                  title="Tùy chọn lịch trình"
                >
                  <MoreHorizontal size={15} />
                </button>

                {showItinerarySettingsMenu && (
                  <div
                    className="absolute right-0 top-9 w-44 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-xs animate-fadeIn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handleAddDay}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-gray-100 font-semibold text-gray-900 flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} /> Thêm ngày mới
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Danh sách các ngày theo chiều dọc (Chuẩn Ảnh 1, 4 - ĐÃ BỎ DẤU CỘNG Ở HEADER NGÀY) */}
            <div className="space-y-4 pb-10">
              {plan.days.map((day) => {
                const hasStops = day.stops.length > 0;
                const isCollapsed = collapsedDays.has(day.day_number);
                const hasLunchBreak = day.stops.some((s) => s.stop_type === 'rest');

                return (
                  <div key={day.day_id} className="border-b border-gray-100 pb-3">
                    {/* Header Ngày: Không còn dấu cộng lặp lại, chỉ có chevron và tiêu đề ngày */}
                    <div
                      onClick={() => toggleDayCollapse(day.day_number)}
                      className="flex items-center justify-between py-2 cursor-pointer group select-none"
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-gray-500 group-hover:text-black transition cursor-pointer"
                          title={isCollapsed ? 'Mở rộng ngày' : 'Thu gọn ngày'}
                        >
                          {isCollapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                        </button>
                        <h3 className="font-extrabold text-[15px] text-gray-950 flex items-center gap-2">
                          <span>Ngày {day.day_number}</span>
                          {day.date && (
                            <span className="font-normal text-xs text-gray-500">
                              {displayDateVi(day.date)}
                            </span>
                          )}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-medium">
                          {day.stops.length > 0 ? `${day.stops.length} điểm` : ''}
                        </span>
                        {plan.days.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (day.stops.length === 0 || window.confirm(`Bạn có chắc muốn xóa Ngày ${day.day_number}? Các địa điểm trong ngày này vẫn được lưu trong kho Ý tưởng.`)) {
                                handleDeleteDay(day.day_number);
                              }
                            }}
                            className="w-7 h-7 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition cursor-pointer opacity-0 group-hover:opacity-100"
                            title={`Xóa Ngày ${day.day_number}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Nội dung ngày khi mở rộng */}
                    {!isCollapsed && (
                      <div className="mt-1 space-y-3 pl-2">
                        {!hasStops ? (
                          /* Trạng thái chưa có điểm: Đúng 1 nút + Thêm (Chuẩn Ảnh 1, 4) */
                          <div className="py-1 pl-4">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveDayAddModal(day.day_number);
                                setModalTab(ideaPois.length > 0 ? 'ideas' : 'search');
                                setModalCategory('for-you');
                                setModalSearch('');
                                setShowAddIdeasModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                            >
                              <Plus size={13} />
                              <span>Thêm</span>
                            </button>
                          </div>
                        ) : (
                          <>
                            {day.stops.map((stop, sIdx) => {
                              const isRest = stop.stop_type === 'rest';
                              const matchedPoi = allPois.find((p) => p.id === stop.poi_id);
                              const isEditingTime = editingStopId === stop.stop_id;
                              const isEditingNote = editingNoteStopId === stop.stop_id;
                              const isMenuOpen = activeMenuStopId === stop.stop_id;

                              const nextStop = day.stops[sIdx + 1];
                              let transitDistKm: number | null = null;
                              if (nextStop && !isRest && nextStop.stop_type !== 'rest') {
                                transitDistKm = distanceKm(stop, nextStop);
                              }

                              return (
                                <React.Fragment key={stop.stop_id}>
                                  {/* Thẻ lịch trình trong ngày */}
                                  <div
                                    onMouseEnter={() => setHoveredStopId(stop.poi_id || stop.stop_id)}
                                    onMouseLeave={() => setHoveredStopId(null)}
                                    className={`min-h-[110px] rounded-[22px] border border-[#e6e6e6] p-3 flex items-start gap-3.5 transition-all relative group ${
                                      isRest ? 'bg-amber-50/70 border-amber-200' : 'bg-white hover:border-gray-400 shadow-2xs'
                                    }`}
                                  >
                                    {/* Ảnh nhỏ trong thẻ: 84 x 84px */}
                                    {isRest ? (
                                      <div className="w-[84px] h-[84px] rounded-[14px] bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                                        <Coffee size={28} />
                                      </div>
                                    ) : (
                                      <div className="w-[84px] h-[84px] rounded-[14px] overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                                        <img
                                          src={getPoiImage(matchedPoi)}
                                          alt={stop.title}
                                          className="w-full h-full object-cover pointer-events-none"
                                          loading="lazy"
                                        />
                                      </div>
                                    )}

                                    {/* Nội dung điểm dừng */}
                                    <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                                      <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <h4 className="font-extrabold text-[14.5px] text-gray-950 truncate">
                                            {stop.title}
                                          </h4>
                                        </div>

                                        {/* Giờ tham quan */}
                                        {isEditingTime ? (
                                          <div className="flex items-center gap-1.5 mt-1">
                                            <input
                                              type="time"
                                              value={editStartTime}
                                              onChange={(e) => setEditStartTime(e.target.value)}
                                              className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                                            />
                                            <span>–</span>
                                            <input
                                              type="time"
                                              value={editEndTime}
                                              onChange={(e) => setEditEndTime(e.target.value)}
                                              className="text-xs border border-gray-300 rounded px-1.5 py-0.5"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleSaveEditTime(day.day_number, stop.stop_id)}
                                              className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded cursor-pointer"
                                            >
                                              Lưu
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingStopId(null)}
                                              className="text-[11px] text-gray-500 cursor-pointer"
                                            >
                                              Hủy
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingStopId(stop.stop_id);
                                              setEditStartTime(stop.start_time || '08:00');
                                              setEditEndTime(stop.end_time || '09:30');
                                            }}
                                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-black font-medium mt-0.5 cursor-pointer group/time"
                                            title="Bấm để sửa khung giờ"
                                          >
                                            <Clock size={12} className="text-gray-400 group-hover/time:text-black" />
                                            <span>
                                              {stop.start_time || '08:00'} – {stop.end_time || '09:30'}
                                            </span>
                                            <Pencil size={10} className="text-gray-300 group-hover/time:text-gray-600 ml-0.5 opacity-0 group-hover/time:opacity-100" />
                                          </button>
                                        )}

                                        <p className="text-[11px] text-gray-500 mt-1 truncate">
                                          {stop.address || stop.city || trip.destination}
                                        </p>
                                      </div>

                                      {/* Ghi chú Note */}
                                      {stop.comment && !isEditingNote && (
                                        <div
                                          onClick={() => {
                                            setEditingNoteStopId(stop.stop_id);
                                            setNoteInput(stop.comment || '');
                                          }}
                                          className="mt-1.5 p-2 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-950 text-xs flex items-start gap-1.5 cursor-pointer hover:bg-amber-100/80 transition"
                                          title="Bấm để sửa bình luận"
                                        >
                                          <FileText size={13} className="text-amber-700 shrink-0 mt-0.5" />
                                          <span className="leading-snug">{stop.comment}</span>
                                        </div>
                                      )}

                                      {isEditingNote && (
                                        <div className="mt-2 space-y-1.5">
                                          <textarea
                                            value={noteInput}
                                            onChange={(e) => setNoteInput(e.target.value)}
                                            placeholder="Nhập ghi chú cho điểm này..."
                                            rows={2}
                                            className="w-full text-xs p-2 rounded-xl border border-gray-300 focus:border-black focus:outline-none"
                                          />
                                          <div className="flex justify-end gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() => setEditingNoteStopId(null)}
                                              className="text-[11px] px-2.5 py-1 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
                                            >
                                              Hủy
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveNote(day.day_number, stop.stop_id)}
                                              className="text-[11px] px-3 py-1 rounded-lg bg-black text-white font-bold cursor-pointer"
                                            >
                                              Lưu ghi chú
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Menu thao tác góc phải */}
                                    <div className="relative shrink-0 flex items-center gap-1 self-start">
                                      <button
                                        type="button"
                                        disabled={sIdx === 0}
                                        onClick={() => handleMoveStop(day.day_number, sIdx, 'up')}
                                        className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                                        title="Lên trên"
                                      >
                                        <ArrowUp size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={sIdx === day.stops.length - 1}
                                        onClick={() => handleMoveStop(day.day_number, sIdx, 'down')}
                                        className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-500 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                                        title="Xuống dưới"
                                      >
                                        <ArrowDown size={13} />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuStopId(isMenuOpen ? null : stop.stop_id);
                                        }}
                                        className="w-7 h-7 rounded-lg border border-gray-200 hover:bg-gray-100 flex items-center justify-center text-gray-600 hover:text-black cursor-pointer"
                                        title="Tùy chọn khác"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {isMenuOpen && (
                                        <div
                                          className="absolute right-0 top-8 w-48 bg-white rounded-2xl shadow-xl border border-gray-200 p-1.5 z-40 text-xs animate-fadeIn"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingNoteStopId(stop.stop_id);
                                              setNoteInput(stop.comment || '');
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-gray-100 font-medium text-gray-800 flex items-center gap-2 cursor-pointer"
                                          >
                                            <FileText size={13} /> {stop.comment ? 'Sửa bình luận' : 'Thêm bình luận'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingStopId(stop.stop_id);
                                              setEditStartTime(stop.start_time || '08:00');
                                              setEditEndTime(stop.end_time || '09:30');
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-gray-100 font-medium text-gray-800 flex items-center gap-2 cursor-pointer"
                                          >
                                            <Clock size={13} /> Chỉnh sửa thời gian
                                          </button>
                                          <div className="border-t border-gray-100 my-1"></div>
                                          <div className="px-3 py-1 text-[10px] font-bold text-gray-400 uppercase">
                                            Chuyển sang ngày khác:
                                          </div>
                                          {plan.days
                                            .filter((d) => d.day_number !== day.day_number)
                                            .map((otherDay) => (
                                              <button
                                                key={otherDay.day_number}
                                                type="button"
                                                onClick={() =>
                                                  handleMoveStopBetweenDays(
                                                    stop.stop_id,
                                                    day.day_number,
                                                    otherDay.day_number
                                                  )
                                                }
                                                className="w-full text-left px-3 py-1 rounded-xl hover:bg-emerald-50 text-gray-700 font-medium cursor-pointer"
                                              >
                                                Ngày {otherDay.day_number}
                                              </button>
                                            ))}
                                          <div className="border-t border-gray-100 my-1"></div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleRemovePoiFromDay(stop.poi_id || stop.stop_id);
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-amber-50 text-amber-800 font-medium flex items-center gap-2 cursor-pointer"
                                          >
                                            <Lightbulb size={13} /> Chuyển về Ý tưởng
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleDeleteStop(day.day_number, stop.stop_id);
                                              setActiveMenuStopId(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2 cursor-pointer"
                                          >
                                            <Trash2 size={13} /> Xóa khỏi ngày
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Dòng khoảng cách giữa 2 thẻ */}
                                  {showDistances && transitDistKm !== null && (
                                    <div className="h-[44px] ml-7 pl-6 border-l-2 border-[#ddd] flex items-center gap-3 text-xs text-gray-600 font-semibold animate-fadeIn">
                                      <Car size={13} className="text-gray-400 shrink-0" />
                                      <span>~{transitDistKm.toFixed(1)} km</span>
                                      <a
                                        href={getGoogleMapsDirectionsUrl(
                                          stop.latitude,
                                          stop.longitude,
                                          nextStop.latitude,
                                          nextStop.longitude
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 font-bold ml-1"
                                        title="Mở chỉ đường trên Google Maps"
                                      >
                                        <span>Chỉ đường</span>
                                        <ExternalLink size={11} />
                                      </a>
                                    </div>
                                  )}
                                </React.Fragment>
                              );
                            })}

                            {/* Nút hành động ở cuối ngày khi đã có điểm */}
                            <div className="pt-2 pl-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDayAddModal(day.day_number);
                                  setModalTab(ideaPois.length > 0 ? 'ideas' : 'search');
                                  setModalCategory('for-you');
                                  setModalSearch('');
                                  setShowAddIdeasModal(true);
                                }}
                                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-800 transition cursor-pointer shadow-2xs"
                              >
                                <Plus size={13} />
                                <span>Thêm</span>
                              </button>

                              {!hasLunchBreak && (
                                <button
                                  type="button"
                                  onClick={() => handleAddLunchBreak(day.day_number)}
                                  className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition cursor-pointer shadow-2xs"
                                >
                                  <Coffee size={13} className="text-amber-700" />
                                  <span>+ Nghỉ trưa (12:00 – 13:30)</span>
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Nút thêm ngày mới ở cuối danh sách ngày */}
              <div className="pt-2 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleAddDay}
                  className="inline-flex items-center gap-2 h-9 px-5 rounded-full border border-dashed border-gray-300 hover:border-black bg-gray-50/70 hover:bg-gray-100 text-xs font-bold text-gray-800 transition cursor-pointer active:scale-95 shadow-2xs"
                >
                  <Plus size={14} />
                  <span>+ Thêm Ngày {plan.days.length + 1}</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ════════════════════════════════════════════════════════
            CỘT PHẢI: BẢN ĐỒ LỘ TRÌNH ĐỒNG BỘ (CHỈ HIỆN KHI KHÔNG PHẢI DRAWER MODE)
        ════════════════════════════════════════════════════════ */}
        {!isDrawerMode && (
          <section className="flex-1 h-full relative bg-white overflow-hidden" data-purpose="right-panel-container">
            <div className="w-full h-full pl-3 pr-6 lg:pr-[36px] py-4 pb-6">
              <div className="w-full h-full rounded-[22px] overflow-hidden border border-gray-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.06)] relative [transform:translateZ(0)]">
                {/* Bộ chọn xem đường đi theo ngày dạng Dropdown dọc (Chuẩn yêu cầu: "thay cái dãy ngày, thành kiểu xem đường đi của ngày, khi mở thì sẽ hiện hàng dọc ngày nào ngày nào") */}
                <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => setShowDayFilterDropdown((prev) => !prev)}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 hover:bg-white text-gray-900 font-bold text-xs shadow-md border border-gray-200/90 transition cursor-pointer active:scale-95 group"
                    title="Bấm để chọn xem đường đi theo từng ngày"
                  >
                    <span className="text-emerald-600 text-xs">🗺️</span>
                    <span>
                      {mapDayFilter === 'all' ? 'Đường đi: Tất cả các ngày' : `Đường đi: Ngày ${mapDayFilter}`}
                    </span>
                    <ChevronDown size={13} className={`text-gray-400 group-hover:text-black transition-transform duration-200 ${showDayFilterDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown danh sách hàng dọc các ngày */}
                  {showDayFilterDropdown && (
                    <div 
                      className="mt-2 w-[220px] max-h-[340px] overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/90 p-1.5 space-y-1 z-[500] auto-hide-scrollbar animate-fadeIn"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMapDayFilter('all');
                          setShowDayFilterDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                          mapDayFilter === 'all'
                            ? 'bg-black text-white shadow-xs'
                            : 'text-gray-700 hover:text-black hover:bg-gray-100/80'
                        }`}
                      >
                        <span>Tất cả các ngày</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          mapDayFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                        }`}>
                          Toàn bộ
                        </span>
                      </button>

                      <div className="h-px bg-gray-100 my-1"></div>

                      {plan.days.map((day) => {
                        const isSelected = mapDayFilter === day.day_number;
                        return (
                          <button
                            key={day.day_number}
                            type="button"
                            onClick={() => {
                              setMapDayFilter(day.day_number);
                              setShowDayFilterDropdown(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer text-left ${
                              isSelected
                                ? 'bg-black text-white shadow-xs'
                                : 'text-gray-700 hover:text-black hover:bg-gray-100/80'
                            }`}
                          >
                            <span className="truncate">
                              Ngày {day.day_number}
                              {day.stops.length > 0 && (
                                <span className="font-normal opacity-70 ml-1 text-[11px]">
                                  ({day.stops.length} điểm)
                                </span>
                              )}
                            </span>
                            {day.stops.length > 0 && (
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-full shrink-0 ml-1.5 ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                              }`}>
                                {day.stops.length}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bản đồ Leaflet sạch sẽ */}
                <div className="w-full h-full relative">
                  <PoiMap
                    pois={mapPois.length > 0 ? mapPois : allPois.slice(0, 10)}
                    selectedPoiId={selectedMapPoiId}
                    hoveredPoiId={hoveredStopId}
                    onSelectPoi={(id) => setSelectedMapPoiId(id)}
                    onHoverPoi={(id) => setHoveredStopId(id)}
                    showMapLoader={false}
                    isExpanded={isMapExpanded}
                    onToggleExpand={() => {
                      setIsMapExpanded((prev) => !prev);
                      setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                      }, 200);
                    }}
                    favorites={savedIds}
                    pendingFavorites={pendingIds}
                    onToggleFavorite={(_id, p) => { if (p) openCollectionPicker(p); }}
                    addedTrips={new Set(tripIdeas)}
                    onToggleAddTrip={(id) => handleToggleIdeaInTrip(id)}
                    routeCoordinates={routeCoordinates}
                    numberedOrderMap={numberedOrderMap}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ─── MODAL TÌM KIẾM & THÊM VÀO CHUYẾN ĐI (CHUẨN 1:1 TRIPOVERVIEWVIEW & MINDTRIP) ─── */}
      {showAddIdeasModal && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-xs py-6 px-4 animate-fadeIn"
          onClick={() => {
            setShowAddIdeasModal(false);
            setActiveDayAddModal(null);
          }}
        >
          <div
            className="relative bg-white w-[750px] max-w-[calc(100vw-32px)] h-[calc(100vh-80px)] max-h-[820px] rounded-[24px] shadow-2xl flex flex-col border border-gray-100 overflow-hidden z-[1010]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Phần cố định: Tiêu đề + tab (có đường kẻ ngang dưới #eee, cao ~72px) */}
            <div className="relative h-[72px] shrink-0 border-b border-gray-200 bg-white rounded-t-[24px] flex flex-col justify-between">
              {/* Nút đóng × */}
              <button
                type="button"
                onClick={() => {
                  setShowAddIdeasModal(false);
                  setActiveDayAddModal(null);
                }}
                className="absolute top-3.5 left-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition cursor-pointer z-20"
                title="Đóng"
              >
                <X size={17} />
              </button>

              {/* Tiêu đề căn giữa */}
              <div className="pt-3 text-center">
                <h3 className="font-bold text-[15px] text-gray-950">
                  {activeDayAddModal ? `Thêm vào Ngày ${activeDayAddModal}` : 'Thêm vào chuyến đi'}
                </h3>
              </div>

              {/* Tabs: Tìm kiếm, (Từ Ý tưởng nếu có), Đã thích, Tùy chỉnh */}
              <div className="px-6 flex items-center gap-6 text-[13.5px]">
                <button
                  type="button"
                  onClick={() => setModalTab('search')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer -mb-[1px] ${
                    modalTab === 'search'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Tìm kiếm
                </button>
                {activeDayAddModal !== null && (
                  <button
                    type="button"
                    onClick={() => setModalTab('ideas')}
                    className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 -mb-[1px] ${
                      modalTab === 'ideas'
                        ? 'border-black text-black font-bold'
                        : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    <span>Từ Ý tưởng ({ideaPois.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setModalTab('saved')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer flex items-center gap-1.5 -mb-[1px] ${
                    modalTab === 'saved'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Heart size={14} className={modalTab === 'saved' ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
                  <span>Đã thích</span>
                  {savedCount > 0 ? (
                    <span className="w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {savedCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('custom')}
                  className={`pb-2.5 border-b-2 transition font-semibold cursor-pointer -mb-[1px] ${
                    modalTab === 'custom'
                      ? 'border-black text-black font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Tùy chỉnh
                </button>
              </div>
            </div>

            {/* Vùng cuộn: Tên khu vực → Tìm kiếm → Lọc → Lưới thẻ */}
            <div className="flex-1 overflow-y-auto px-6 pb-10 [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-track]:bg-transparent">
              {modalTab !== 'custom' ? (
                <>
                  {/* Tên khu vực */}
                  <div className="pt-4 shrink-0">
                    <div className="relative inline-block">
                      <div
                        onClick={() => setShowModalCityDropdown((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 cursor-pointer select-none group"
                      >
                        <h2 className="text-[22px] font-bold text-gray-950 tracking-tight leading-tight group-hover:text-black">
                          {modalCity === 'all' ? 'Đà Nẵng & Huế' : modalCity}
                        </h2>
                        <ChevronDown size={18} className="text-gray-950 group-hover:translate-y-0.5 transition-transform" />
                      </div>

                      {showModalCityDropdown && (
                        <div className="absolute top-10 left-0 bg-white shadow-xl border border-gray-100 rounded-xl py-1.5 w-48 z-50 animate-fadeIn">
                          <button
                            type="button"
                            onClick={() => {
                              setModalCity('all');
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                              modalCity === 'all' ? 'font-bold text-black' : 'text-gray-700'
                            }`}
                          >
                            <span>Tất cả khu vực (Đà Nẵng & Huế)</span>
                            {modalCity === 'all' && <Check size={14} className="font-bold" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalCity('Đà Nẵng');
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                              modalCity === 'Đà Nẵng' ? 'font-bold text-black' : 'text-gray-700'
                            }`}
                          >
                            <span>Đà Nẵng</span>
                            {modalCity === 'Đà Nẵng' && <Check size={14} className="font-bold" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalCity('Huế');
                              setShowModalCityDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-[13.5px] hover:bg-gray-50 flex items-center justify-between cursor-pointer ${
                              modalCity === 'Huế' ? 'font-bold text-black' : 'text-gray-700'
                            }`}
                          >
                            <span>Huế</span>
                            {modalCity === 'Huế' && <Check size={14} className="font-bold" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ô tìm kiếm & Nút bộ lọc */}
                  <div className="mt-3 flex items-center gap-2.5 shrink-0">
                    <div className="flex-1 relative flex items-center min-w-0">
                      <Search size={16} className="text-gray-400 absolute left-4 pointer-events-none" />
                      <input
                        type="text"
                        value={modalSearch}
                        onChange={(e) => setModalSearch(e.target.value)}
                        placeholder="Tìm kiếm địa điểm, di tích, ẩm thực..."
                        className="w-full h-[42px] pl-10 pr-9 bg-white text-[13.5px] placeholder-gray-400 text-gray-900 rounded-full border border-gray-300 focus:border-black focus:outline-none shadow-2xs transition"
                      />
                      {modalSearch && (
                        <button
                          type="button"
                          onClick={() => setModalSearch('')}
                          className="absolute right-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setModalCategory('for-you');
                        setModalSearch('');
                        setModalCity('all');
                      }}
                      className="h-[42px] px-4 rounded-full border border-gray-300 hover:border-black hover:bg-gray-50 text-[13px] font-medium text-gray-800 transition cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
                    >
                      <SlidersHorizontal size={15} />
                      <span>Bộ lọc</span>
                    </button>
                  </div>

                  {/* Hàng danh mục tabs (6 danh mục chuẩn) */}
                  <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar shrink-0">
                    {MODAL_CATEGORY_TABS.map((tab) => {
                      const isActive = modalCategory === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setModalCategory(tab.id)}
                          className={`whitespace-nowrap h-[32px] px-3.5 text-[12.5px] rounded-full transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                            isActive
                              ? 'bg-black text-white font-medium shadow-xs'
                              : 'text-gray-700 hover:text-black hover:bg-gray-100 font-medium'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tiêu đề nhóm */}
                  <div className="mt-4 shrink-0">
                    <h4 className="font-bold text-[16px] text-gray-950 tracking-tight">
                      {modalTab === 'ideas'
                        ? `Ý tưởng trong chuyến đi (${ideaPois.length})`
                        : modalTab === 'saved'
                        ? 'Địa điểm đã thích ở trang Khám phá'
                        : modalCategory === 'quan-an' || modalCategory === 'restaurants'
                        ? 'Ẩm thực & Cafe'
                        : modalCategory === 'di-tich' || modalCategory === 'experiences'
                        ? 'Trải nghiệm'
                        : modalCategory === 'canh-quan' || modalCategory === 'scenic'
                        ? 'Địa điểm'
                        : modalCategory === 'chua'
                        ? 'Tâm linh'
                        : modalCategory === 'all'
                        ? 'Tất cả địa điểm'
                        : 'Trải nghiệm đề xuất'}
                    </h4>
                  </div>

                  {/* Lưới thẻ 3 cột chuẩn 1:1 TripOverviewView & Mindtrip */}
                  <div className="mt-3 grid grid-cols-3 gap-x-3.5 gap-y-5">
                    {modalFilteredPois.length === 0 ? (
                      <div className="col-span-full py-16 text-center text-gray-500 text-sm">
                        {modalTab === 'ideas'
                          ? 'Kho Ý tưởng hiện chưa có địa điểm nào phù hợp với bộ lọc.'
                          : modalTab === 'saved'
                          ? savedCount === 0
                            ? 'Bạn chưa thích địa điểm nào ở trang Khám phá. Hãy bấm thả tim ❤️ tại trang Explore để chọn nhanh vào Ý tưởng tại đây!'
                            : 'Không tìm thấy địa điểm đã thích nào phù hợp với bộ lọc hiện tại.'
                          : 'Không tìm thấy địa điểm phù hợp với bộ lọc hiện tại.'}
                      </div>
                    ) : (
                      modalFilteredPois.map((poi) => {
                        const isAddedToCurrentDay = activeDayAddModal !== null
                          ? plan.days.find((d) => d.day_number === activeDayAddModal)?.stops.some((s) => s.poi_id === poi.id)
                          : false;
                        const isAddedToIdeas = tripIdeas.includes(poi.id);
                        const isAdded = activeDayAddModal !== null ? isAddedToCurrentDay : isAddedToIdeas;
                        const ratingVal = (typeof poi.rating === 'number' ? poi.rating : Number(poi.rating || 4.5)).toFixed(1);

                        return (
                          <div
                            key={poi.id}
                            onClick={() => {
                              setSelectedMapPoiId(poi.id);
                              setShowAddIdeasModal(false);
                              setActiveDayAddModal(null);
                            }}
                            className="flex flex-col group cursor-pointer text-left select-none"
                          >
                            {/* Ảnh thẻ tỉ lệ 1.05 : 1, bo góc 16px */}
                            <div className="relative aspect-[1.05/1] w-full rounded-[16px] overflow-hidden bg-gray-100 shadow-2xs">
                              <img
                                src={getPoiImage(poi)}
                                alt={poi.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&auto=format&fit=crop&q=80';
                                }}
                              />

                              {/* Nút “+ Thêm” trên thẻ */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (activeDayAddModal !== null) {
                                    handleAddIdeaToDay(activeDayAddModal, poi);
                                  } else {
                                    handleToggleIdeaInTrip(poi.id);
                                  }
                                }}
                                className={`absolute top-2.5 right-2.5 h-[28px] px-2.5 rounded-full font-semibold text-[12px] transition shadow-xs cursor-pointer active:scale-95 flex items-center justify-center gap-1 z-10 ${
                                  isAdded
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-white text-gray-900 hover:bg-black hover:text-white'
                                }`}
                              >
                                {isAdded ? (
                                  <>
                                    <Check size={13} strokeWidth={2.5} />
                                    <span>Đã thêm</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={13} strokeWidth={2.5} />
                                    <span>Thêm</span>
                                  </>
                                )}
                              </button>

                              {/* 5 chấm phân trang dưới đáy ảnh chuẩn Mindtrip */}
                              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none z-10">
                                <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                                <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                              </div>

                              {/* Icon ⓘ ở góc dưới bên phải */}
                              <div className="absolute bottom-2.5 right-2.5 pointer-events-none z-10 text-white/90 drop-shadow-xs">
                                <Info size={13} />
                              </div>
                            </div>

                            {/* Dưới ảnh thẻ */}
                            <div className="mt-2 flex items-baseline justify-between gap-1.5 min-w-0">
                              <h4 className="font-bold text-[13px] text-gray-950 truncate leading-snug group-hover:text-black" title={poi.name}>
                                {poi.name}
                              </h4>
                              {Number(poi.rating) > 0 && (
                                <span className="text-[12px] font-bold text-gray-950 shrink-0 flex items-center gap-0.5">
                                  <Star size={11} className="fill-black text-black" />
                                  <span>{ratingVal}</span>
                                </span>
                              )}
                            </div>

                            <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500 font-normal">
                              <MapPin size={11} className="text-gray-400 shrink-0" />
                              <span className="truncate">
                                {(() => {
                                  const isCafe = Boolean(
                                    poi.sub_category?.includes('cafe') || 
                                    poi.sub_category?.includes('coffee') || 
                                    /coffee|cafe|cà phê|tiệm trà|workspace/i.test(poi.name)
                                  );
                                  if (isCafe) return '☕ Quán cà phê';
                                  if (poi.category === 'quan-an') return '🍽️ Ẩm thực';
                                  if (poi.category === 'di-tich') return '🏛️ Di tích lịch sử';
                                  if (poi.category === 'canh-quan') return '🌿 Cảnh quan & Thắng cảnh';
                                  return '⛩️ Chùa & Tâm linh';
                                })()}
                              </span>
                            </div>

                            <div className="mt-0.5 text-[11.5px] text-gray-400 font-normal truncate">
                              {poi.address || `${poi.city}, Việt Nam`}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                /* Tab Tùy chỉnh (Custom) */
                <div className="pt-4 flex flex-col space-y-4 max-w-lg">
                  <p className="text-[13.5px] text-gray-700 leading-relaxed">
                    Bạn có một địa điểm riêng muốn lưu vào chuyến đi này? Nhập tên bên dưới để thêm ngay vào Ý tưởng:
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={customIdeaInput}
                      onChange={(e) => setCustomIdeaInput(e.target.value)}
                      placeholder="Ví dụ: Quán cà phê Yên, Tiệm bánh mì..."
                      className="w-full h-[42px] px-4 rounded-xl border border-gray-300 focus:border-black focus:outline-none text-[13.5px] shadow-2xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customIdeaInput.trim()) {
                          handleAddCustomIdea();
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomIdeaInput('');
                          setShowAddIdeasModal(false);
                          setActiveDayAddModal(null);
                        }}
                        className="h-[38px] px-5 rounded-full border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomIdea}
                        className="h-[38px] px-6 rounded-full bg-black text-white font-bold text-[13px] hover:bg-neutral-800 transition active:scale-95 cursor-pointer shadow-2xs"
                      >
                        {activeDayAddModal ? `+ Thêm vào Ngày ${activeDayAddModal}` : '+ Thêm vào ý tưởng'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
